/**
 * DeepSeek API 调用封装 —— 供 /api/generate 使用。
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY          — API Key
 *   DEEPSEEK_GENERATION_MODEL — 模型名（默认 deepseek-chat）
 *   DEEPSEEK_BASE_URL         — 可选，API 地址（默认 https://api.deepseek.com/v1）
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-chat";

/** 估算中文文本 token 数（粗糙：中文 0.5 token/字，英文 0.25 token/字） */
function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0, other = 0;
  for (const ch of text) {
    if (ch >= "一" && ch <= "鿿") cjk++;
    else other++;
  }
  return Math.ceil(cjk * 0.5 + other * 0.25) || 1;
}

/**
 * 调用 DeepSeek /chat/completions
 * @param {string} prompt - 用户 prompt
 * @param {object} opts
 * @param {string} [opts.system] - system message
 * @param {number} [opts.maxTokens] - 最大输出 token
 * @param {number} [opts.temperature]
 * @returns {Promise<{content: string, inputTokens: number, outputTokens: number}>}
 */
async function deepseekChat(prompt, opts = {}) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY 未配置，请设置环境变量后重试。");
  }

  const messages = [];
  if (opts.system) {
    messages.push({ role: "system", content: opts.system });
  }
  messages.push({ role: "user", content: prompt });

  const inputTokens = estimateTokens(prompt) + (opts.system ? estimateTokens(opts.system) : 0);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 180000);

  try {
    const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        max_tokens: opts.maxTokens || 4096,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      if (resp.status === 401) throw new Error(`DeepSeek 认证失败（401）：请检查 API Key`);
      if (resp.status === 429) throw new Error(`DeepSeek 限流（429）：请稍后重试`);
      throw new Error(`DeepSeek HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || "";
    const outputTokens = estimateTokens(content);

    return { content, inputTokens, outputTokens };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { deepseekChat, estimateTokens };
