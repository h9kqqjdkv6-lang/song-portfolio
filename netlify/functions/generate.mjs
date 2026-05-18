import { supabaseAdmin } from "./_lib/supabase.mjs"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(MODULE_DIR, "../..")

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-v4-flash"

// ── System Prompts ──

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

// ── Compare Mode (Phase 2) ──

const COMPARE_SYSTEM = `你是一位低空经济方案选型顾问，掌握中国所有主流无人机的核心参数和适用场景。你的任务是分析用户需求，输出2-4个候选方案的对比分析。

每个方案必须包含：方案名称、推荐机型、4维评分、优劣势、成本估算、适航状态。

评分维度（每项0-5分）：
- feasibility（可行性）：法规合规通过率 × TRL技术成熟度 × 供应链可用性
- cost（成本）：3年TCO（设备+运维+人员+审批+保险）
- efficiency（效率）：响应时间 × 任务覆盖率 × 航程匹配度
- safety（安全）：冗余设计等级 × 环境适应性 × 历史事故率

输出规范：
- 输出纯JSON，不要Markdown包装、不要代码块标记
- JSON结构严格如下（无尾随逗号）：
{
  "proposals": [
    {
      "id": "recommended",
      "name": "方案名称",
      "aircraft": "机型key",
      "overall_score": 4.2,
      "scores": { "feasibility": 4.5, "cost": 4.0, "efficiency": 4.0, "safety": 4.3 },
      "summary": "一句话方案概要",
      "pros": ["优势1", "优势2", "优势3"],
      "cons": ["劣势1", "劣势2"],
      "cost_estimate": "成本估算",
      "cert_status": "适航状态"
    }
  ],
  "analysis_note": "选型分析说明"
}`

const COMPARE_TEMPLATE = `请为以下场景生成无人机方案对比选型。

## 用户需求
{topic}

## 可用机型数据
{aircrafts_context}

## 场景数据
{scene_data_context}

## 要求
1. 分析用户需求的载荷、航程、环境、合规等约束
2. 从可用机型中筛选最匹配的2-4个方案
3. 按4维评分标准逐项打分
4. 务必包含一个"推荐"方案和一个"备选"方案
5. 如果适用，可以包含"经济"方案（低预算选项）
6. 确保所有数据基于提供的机型参数，不要虚构参数
7. 评分要合理有区分度（不能所有方案都高分）`

// ── Helpers ──

function estimateTokens(text) {
  if (!text) return 0
  let cjk = 0, other = 0
  for (const ch of text) {
    if (ch >= "\u4e00" && ch <= "\u9fff") cjk++
    else other++
  }
  return Math.ceil(cjk * 0.5 + other * 0.25) || 1
}

function loadData() {
  let scenes = {}, aircrafts = {}, regulations = {}
  try {
    scenes = JSON.parse(readFileSync(resolve(DATA_DIR, "scenes.json"), "utf-8"))
  } catch {}
  try {
    aircrafts = JSON.parse(readFileSync(resolve(DATA_DIR, "aircrafts.json"), "utf-8"))
  } catch {}
  try {
    regulations = JSON.parse(readFileSync(resolve(DATA_DIR, "regulations.json"), "utf-8"))
  } catch {}
  return { scenes, aircrafts, regulations }
}

function buildAircraftsContext(aircrafts, sceneName) {
  const entries = Object.entries(aircrafts).filter(([k, v]) => {
    if (k === "_emergingTech") return false
    if (!sceneName) return true
    const applicable = v.applicableScenes || []
    if (applicable.length === 0) return true // generic aircraft
    return applicable.includes(sceneName)
  })
  return entries.map(([key, val]) => {
    return `${key}: ${val.model || val.type || ""}，载荷${val.maxPayload || "?"}kg，航程${val.endurance || "?"}，${val.propulsion || "?"}，${val.certificationStatus || "适航状态待查"}，价格${val.price || "待查"}`
  }).join("\n")
}

function buildSceneContext(scenes, sceneName) {
  if (!sceneName || !scenes[sceneName]) return "用户未指定具体场景"
  const s = scenes[sceneName]
  return `场景：${sceneName}
描述：${s.subtitle || ""}
推荐机型：${s.aircraftModel ? JSON.stringify(s.aircraftModel) : ""}
策略原则：${s.strategyPrinciples ? JSON.stringify(s.strategyPrinciples).slice(0, 500) : ""}`
}

// ── Main Handler ──

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

  // ── Compare Mode ──
  if (mode === "compare") {
    const { scenes: sceneData, aircrafts: acData } = loadData()

    const aircraftsContext = buildAircraftsContext(acData, scene_name)
    const sceneContext = buildSceneContext(sceneData, scene_name)

    const prompt = COMPARE_TEMPLATE
      .replace("{topic}", topic.trim())
      .replace("{aircrafts_context}", aircraftsContext)
      .replace("{scene_data_context}", sceneContext)

    const messages = [
      { role: "system", content: COMPARE_SYSTEM },
      { role: "user", content: prompt },
    ]

    const inputTokens = estimateTokens(prompt) + estimateTokens(COMPARE_SYSTEM)

    try {
      const dsResp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          max_tokens: 4096,
          temperature: 0.4,
          stream: false,
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

      const dsData = await dsResp.json()
      const rawContent = dsData.choices?.[0]?.message?.content || ""

      // Parse the JSON response (handle potential markdown wrapping)
      let jsonStr = rawContent.trim()
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
      }

      let compareResult
      try {
        compareResult = JSON.parse(jsonStr)
      } catch {
        compareResult = { proposals: [], error: "AI返回格式解析失败", raw: rawContent.slice(0, 500) }
      }

      const outputTokens = estimateTokens(rawContent)
      const costEst = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 2.0

      // Background write to Supabase
      try { await supabaseAdmin.from("usage_log").insert({
        model: DEEPSEEK_MODEL,
        endpoint: "/api/generate (compare)",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_cny: parseFloat(costEst.toFixed(6)),
      }) } catch (e) { console.error("usage_log insert failed:", e.message) }

      try { await supabaseAdmin.from("proposals").insert({
        topic: topic.trim(),
        industry: industry || "",
        audience: audience || "政府",
        content: rawContent,
        model_used: "deepseek",
        route_reason: "Netlify Function (compare)",
        input_tokens_est: inputTokens,
        output_tokens_est: outputTokens,
      }) } catch (e) { console.error("proposals insert failed:", e.message) }

      return new Response(JSON.stringify({
        type: "compare_result",
        ...compareResult,
        meta: {
          model: DEEPSEEK_MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_est_cny: parseFloat(costEst.toFixed(6)),
        },
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      })
    } catch (e) {
      return new Response(JSON.stringify({
        error: `方案对比生成失败: ${e.message}`,
      }), {
        status: 500, headers: { "Content-Type": "application/json" },
      })
    }
  }

  // ── Existing Modes (proposal / compliance / follow-up) ──

  const systemPrompt = mode === "compliance" ? COMPLIANCE_SYSTEM : PROPOSAL_SYSTEM

  let messages

  if (follow_up_to && follow_up_question) {
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
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch (_) {}
        }, 3000)

        const reader = dsResp.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              clearInterval(heartbeat)
              break
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
