/**
 * POST /api/generate — 方案生成（DeepSeek API，流式）
 *
 * 请求体：{ topic, industry?, audience?, extra_context?, scene_name? }
 * 返回：text/event-stream，逐 chunk 推送到前端
 */

const { supabaseAdmin } = require("./_lib/supabase.js");

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-chat";

const PROPOSAL_SYSTEM = `你是一位资深解决方案架构师，专注低空经济与无人机应用领域。
你的方案面向政府 / 企业决策者，要求：
- 结构化输出（背景→目标→架构→实施→收益→风险→预算）
- 引用最新政策和标准（GB 46761/46750、无人驾驶航空器条例、新民航法等）
- 数据有依据，不确定处标注"待核实"
- 避免套话，注重可执行性
- 输出中文`;

const PROPOSAL_TEMPLATE = `为「{topic}」撰写一份结构化方案。

行业方向：{industry}
目标受众：{audience}

{extra}

输出结构：
### 1. 项目背景与痛点
### 2. 方案目标（SMART 原则）
### 3. 技术架构（分层描述）
### 4. 实施路径（试点→推广→深化）
### 5. 预期收益
### 6. 风险与对策
### 7. 预算框架`;

function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0, other = 0;
  for (const ch of text) {
    if (ch >= "一" && ch <= "鿿") cjk++;
    else other++;
  }
  return Math.ceil(cjk * 0.5 + other * 0.25) || 1;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "仅支持 POST" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { topic, industry, audience, extra_context, scene_name } = body || {};

    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: "topic 为必填项" });
    }

    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: "DeepSeek API Key 未配置" });
    }

    const prompt = PROPOSAL_TEMPLATE
      .replace("{topic}", topic.trim())
      .replace("{industry}", industry || "低空经济")
      .replace("{audience}", audience || "政府")
      .replace("{extra}", extra_context ? `补充约束：${extra_context.trim()}` : "");

    const inputTokens = estimateTokens(prompt) + estimateTokens(PROPOSAL_SYSTEM);

    // 设置 SSE 响应头
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // 心跳保活 —— DeepSeek 首 token 可能需 10-20s
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 3000);

    const dsResp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: PROPOSAL_SYSTEM },
          { role: "user", content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!dsResp.ok) {
      clearInterval(heartbeat);
      const errBody = await dsResp.text().catch(() => "");
      res.write(`data: ${JSON.stringify({ type: "error", message: `DeepSeek HTTP ${dsResp.status}: ${errBody.slice(0, 200)}` })}\n\n`);
      res.end();
      return;
    }

    let fullContent = "";
    const reader = dsResp.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
            }
          } catch (_) {}
        }
      }
    } finally {
      clearInterval(heartbeat);
    }

    const outputTokens = estimateTokens(fullContent);
    const costEst = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 2.0;

    // 后台写 Supabase（不阻塞）
    supabaseAdmin.from("usage_log").insert({
      model: DEEPSEEK_MODEL,
      endpoint: "/api/generate",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cny: parseFloat(costEst.toFixed(6)),
    }).catch(() => {});

    supabaseAdmin.from("proposals").insert({
      topic: topic.trim(),
      industry: industry || "",
      audience: audience || "政府",
      content: fullContent,
      model_used: "deepseek",
      route_reason: "Vercel Function (stream)",
      input_tokens_est: inputTokens,
      output_tokens_est: outputTokens,
    }).catch(() => {});

    res.write(`data: ${JSON.stringify({
      type: "done",
      meta: {
        model: DEEPSEEK_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_est_cny: parseFloat(costEst.toFixed(6)),
      },
    })}\n\n`);
    res.end();
  } catch (e) {
    console.error("[generate] 方案生成失败:", e.message);
    try {
      res.write(`data: ${JSON.stringify({ type: "error", message: e.message })}\n\n`);
      res.end();
    } catch (_) {}
  }
};
