import { supabaseAdmin } from "./_lib/supabase.mjs"
import { deepseekChat, estimateTokens } from "./_lib/deepseek.mjs"

const PROPOSAL_SYSTEM = `你是一位资深解决方案架构师，专注低空经济与无人机应用领域。
你的方案面向政府 / 企业决策者，要求：
- 结构化输出（背景→目标→架构→实施→收益→风险→预算）
- 引用最新政策和标准（GB 46761/46750、无人驾驶航空器条例、新民航法等）
- 数据有依据，不确定处标注"待核实"
- 避免套话，注重可执行性
- 输出中文`

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
### 7. 预算框架`

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "仅支持 POST" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const body = await request.json()
    const { topic, industry, audience, extra_context, scene_name } = body || {}

    if (!topic || !topic.trim()) {
      return new Response(JSON.stringify({ error: "topic 为必填项" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      })
    }

    const prompt = PROPOSAL_TEMPLATE
      .replace("{topic}", topic.trim())
      .replace("{industry}", industry || "低空经济")
      .replace("{audience}", audience || "政府")
      .replace("{extra}", extra_context ? `补充约束：${extra_context.trim()}` : "")

    const result = await deepseekChat(prompt, {
      system: PROPOSAL_SYSTEM,
      maxTokens: 4096,
      temperature: 0.7,
    })

    const costEst = (result.inputTokens / 1_000_000) * 1.0 + (result.outputTokens / 1_000_000) * 2.0

    // 写入用量日志
    try {
      await supabaseAdmin.from("usage_log").insert({
        model: process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-chat",
        endpoint: "/api/generate",
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_cny: parseFloat(costEst.toFixed(6)),
      })
    } catch (_) {}

    // 写入方案记录
    try {
      await supabaseAdmin.from("proposals").insert({
        topic: topic.trim(),
        industry: industry || "",
        audience: audience || "政府",
        content: result.content,
        model_used: "deepseek",
        route_reason: "Netlify Function",
        input_tokens_est: result.inputTokens,
        output_tokens_est: result.outputTokens,
      })
    } catch (_) {}

    return new Response(JSON.stringify({
      proposal: result.content,
      topic: topic.trim(),
      meta: {
        model: process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-chat",
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_est_cny: parseFloat(costEst.toFixed(6)),
      },
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  } catch (e) {
    return new Response(JSON.stringify({
      error: `方案生成失败: ${e.message}`,
      suggestion: e.message.includes("API Key") ? "请检查 DEEPSEEK_API_KEY 环境变量" : "请稍后重试",
    }), {
      status: 500, headers: { "Content-Type": "application/json" },
    })
  }
}

export const config = { path: "/api/generate" }
