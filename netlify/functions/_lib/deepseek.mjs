const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-chat"

export function estimateTokens(text) {
  if (!text) return 0
  let cjk = 0, other = 0
  for (const ch of text) {
    if (ch >= "一" && ch <= "鿿") cjk++
    else other++
  }
  return Math.ceil(cjk * 0.5 + other * 0.25) || 1
}

export async function deepseekChat(prompt, opts = {}) {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY 未配置")

  const messages = []
  if (opts.system) messages.push({ role: "system", content: opts.system })
  messages.push({ role: "user", content: prompt })

  const inputTokens = estimateTokens(prompt) + (opts.system ? estimateTokens(opts.system) : 0)

  const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.7,
    }),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "")
    if (resp.status === 401) throw new Error("DeepSeek 认证失败（401）")
    if (resp.status === 429) throw new Error("DeepSeek 限流（429）")
    throw new Error(`DeepSeek HTTP ${resp.status}: ${errBody.slice(0, 200)}`)
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content?.trim() || ""
  const outputTokens = estimateTokens(content)

  return { content, inputTokens, outputTokens }
}
