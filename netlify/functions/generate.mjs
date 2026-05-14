import { supabaseAdmin } from "./_lib/supabase.mjs"

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-v4-flash"

const COMPLIANCE_SYSTEM = `你是一位低空经济政策法规合规审查专家，专注无人机行业合规体检。
你的审查面向政府 / 企业采购与合规部门，要求：
- 结构化输出（适用法规→检查项→差距分析→建议）
- 严格基于真实法规条款，引用具体条款号
- 数据有依据，不确定处标注"待核实"
- 禁止引用不存在的法规名称
- 输出中文
- 必须使用 HTML 标签格式化输出，不要用 Markdown
- 表格必须用标准 HTML 标签，参考以下格式：
<table><tr><th>法规/标准</th><th>条款</th><th>合规要求</th><th>当前状态</th></tr><tr><td>GB 46761-2025</td><td>第X条</td><td>实名登记与激活</td><td>待核实</td></tr></table>`

const PROPOSAL_SYSTEM = `你是一位资深解决方案架构师，专注低空经济与无人机应用领域。
你的方案面向政府 / 企业决策者，要求：
- 结构化输出（背景→目标→架构→实施→收益→风险→预算）
- 引用最新政策和标准（GB 46761/46750、无人驾驶航空器条例、新民航法等）
- 2026年5月9日民航局低空安全司（编制30人）正式成立，负责低空发展规划、安全协调与飞行服务调度平台——所有方案须体现与该监管机构的对齐
- 数据有依据，不确定处标注"待核实"
- 避免套话，注重可执行性
- 输出中文
- 必须使用 HTML 标签格式化输出，不要用 Markdown`

const PROPOSAL_TEMPLATE = `为「{topic}」撰写一份结构化方案。

行业方向：{industry}
目标受众：{audience}

{extra}

方案中涉及续航/能源的技术选型时，如场景数据中提供了「前沿技术动态」（氢燃料电池、锂硫电池等），应在技术架构章节作为技术前瞻简要提及，但需标注技术成熟度等级与可用性状态。

输出规范：
- 用 <h3> 标签写标题（不要用 ###）
- 用 <strong> 标签加粗重点（不要用 **）
- 表格必须用标准 HTML 标签，不得省略标签名或尖括号。参考示例：
<table><tr><th>项目</th><th>数量</th><th>单价(万元)</th></tr><tr><td>无人机平台</td><td>2</td><td>150</td></tr></table>
- 用 <ul><li> 写列表
- 段落用 <p> 包裹

输出结构：
<h3>1. 项目背景与痛点</h3>
<h3>2. 方案目标（SMART 原则）</h3>
<h3>3. 技术架构（分层描述）</h3>
<h3>4. 实施路径（试点→推广→深化）</h3>
<h3>5. 预期收益</h3>
<h3>6. 风险与对策</h3>
<h3>7. 预算框架</h3>`

function estimateTokens(text) {
  if (!text) return 0
  let cjk = 0, other = 0
  for (const ch of text) {
    if (ch >= "一" && ch <= "鿿") cjk++
    else other++
  }
  return Math.ceil(cjk * 0.5 + other * 0.25) || 1
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "仅支持 POST" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    })
  }

  let body
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: "无效的 JSON 请求体" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })
  }

  const { topic, industry, audience, extra_context, scene_name, follow_up_to, follow_up_question, mode } = body || {}
  if (!topic || !topic.trim()) {
    return new Response(JSON.stringify({ error: "topic 为必填项" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })
  }

  if (!DEEPSEEK_API_KEY) {
    return new Response(JSON.stringify({ error: "DeepSeek API Key 未配置" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    })
  }

  // 选择系统提示：合规模式 vs 方案模式
  const systemPrompt = mode === "compliance" ? COMPLIANCE_SYSTEM : PROPOSAL_SYSTEM

  let messages

  if (follow_up_to && follow_up_question) {
    // 追问模式：多轮对话
    const originalPrompt = PROPOSAL_TEMPLATE
      .replace("{topic}", topic.trim())
      .replace("{industry}", industry || "低空经济")
      .replace("{audience}", audience || "政府")
      .replace("{extra}", extra_context ? `补充约束：${extra_context.trim()}` : "")

    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: originalPrompt },
      { role: "assistant", content: follow_up_to.slice(0, 6000) },
      { role: "user", content: `基于上述方案，请回答以下追问：${follow_up_question.trim()}` },
    ]
  } else {
    // 标准单次生成
    const prompt = PROPOSAL_TEMPLATE
      .replace("{topic}", topic.trim())
      .replace("{industry}", industry || "低空经济")
      .replace("{audience}", audience || "政府")
      .replace("{extra}", extra_context ? `补充约束：${extra_context.trim()}` : "")

    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ]
  }

  const allText = messages.map(m => m.content).join("\n")
  const inputTokens = estimateTokens(allText) + estimateTokens(systemPrompt)

  try {
    const dsResp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: messages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
      }),
    })

    if (!dsResp.ok) {
      const errBody = await dsResp.text().catch(() => "")
      return new Response(JSON.stringify({
        error: `DeepSeek HTTP ${dsResp.status}: ${errBody.slice(0, 200)}`,
      }), {
        status: 502, headers: { "Content-Type": "application/json" },
      })
    }

    let fullContent = ""
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        // 心跳保活 —— DeepSeek 首 token 可能需 10-20s，CDN 不等
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch (_) {}
        }, 3000);

        const reader = dsResp.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              clearInterval(heartbeat);
              break;
            }

            const text = decoder.decode(value, { stream: true })
            for (const line of text.split("\n")) {
              if (!line.startsWith("data: ")) continue
              const data = line.slice(6).trim()
              if (!data || data === "[DONE]") continue
              try {
                const delta = JSON.parse(data).choices?.[0]?.delta?.content
                if (delta) {
                  fullContent += delta
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`))
                }
              } catch {}
            }
          }

          const outputTokens = estimateTokens(fullContent)
          const costEst = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 2.0

          // 后台写 Supabase（不阻塞响应）
          supabaseAdmin.from("usage_log").insert({
            model: DEEPSEEK_MODEL,
            endpoint: "/api/generate",
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_cny: parseFloat(costEst.toFixed(6)),
          }).catch(() => {})

          supabaseAdmin.from("proposals").insert({
            topic: topic.trim(),
            industry: industry || "",
            audience: audience || "政府",
            content: fullContent,
            model_used: "deepseek",
            route_reason: "Netlify Function (stream)",
            input_tokens_est: inputTokens,
            output_tokens_est: outputTokens,
          }).catch(() => {})

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "done",
            meta: {
              model: DEEPSEEK_MODEL,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cost_est_cny: parseFloat(costEst.toFixed(6)),
            },
          })}\n\n`))
          controller.close()
        } catch (e) {
          clearInterval(heartbeat)
          controller.error(e)
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({
      error: `方案生成失败: ${e.message}`,
    }), {
      status: 500, headers: { "Content-Type": "application/json" },
    })
  }
}

export const config = { path: "/api/generate" }
