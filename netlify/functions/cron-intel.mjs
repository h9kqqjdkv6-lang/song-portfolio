/**
 * 每日情报自动采集（Scheduled Function）
 *
 * 触发：每天 UTC 01:00（约北京时间 09:00）
 * 手动：GET /api/cron-intel?key=CRON_SECRET
 *
 * 流程：
 *   1. DeepSeek 生成当日行业简报（主源）
 *   2. 百度新闻抓取最新链接（辅源）
 *   3. 合并去重 → Supabase intel_items
 */
import { supabase, supabaseAdmin } from "./_lib/supabase.mjs"

const CRON_SECRET = process.env.CRON_SECRET || "intel-cron-2026"
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_GENERATION_MODEL || "deepseek-chat"

const BAIDU_QUERIES = ["低空经济", "eVTOL", "无人机 低空"]

/**
 * 百度新闻搜索 —— 抓取 HTML 页面提取标题+链接
 * 百度可能反爬，所以加短超时，失败不影响主流程
 */
async function fetchBaiduNews(query) {
  const url = `https://www.baidu.com/s?tn=news&wd=${encodeURIComponent(query)}&pn=0&rn=5`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: controller.signal,
    })
    if (!resp.ok) return []
    const html = await resp.text()

    // 从 HTML 中提取新闻标题和链接
    const items = []
    // 匹配百度新闻结果的标题链接：<a ...>标题</a> 形式
    const linkRe = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.+?)<\/a>/g
    let m
    const seen = new Set()
    while ((m = linkRe.exec(html)) !== null) {
      const url = m[1]
      const title = m[2].replace(/<[^>]+>/g, "").trim()
      // 过滤掉明显不是新闻的链接
      if (!title || title.length < 8 || title.length > 100) continue
      if (url.includes("baidu.com") && !url.includes("baidu.com/link")) continue
      if (seen.has(url)) continue
      seen.add(url)
      items.push({
        title: title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        url,
        date: new Date().toISOString().slice(0, 10),
        summary: "",
        source: "百度新闻",
      })
    }
    return items.slice(0, 5)
  } catch (e) {
    if (e.name !== "AbortError") console.warn(`[baidu] ${query}:`, e.message)
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * DeepSeek 生成当日行业简报（主源）
 */
async function generateDailyBriefing() {
  if (!DEEPSEEK_KEY) throw new Error("DeepSeek 未配置")

  const today = new Date().toISOString().slice(0, 10)
  const prompt = `今天是 ${today}。请以低空经济行业观察员的身份，生成今日（或近一周）中国低空经济领域的 3-5 条重要动态简报。

每条简报用以下 JSON 数组格式返回（只返回 JSON，不要其他内容）：
[
  {
    "title": "简讯标题（≤30字）",
    "summary": "2-3句话概述（≤150字）",
    "category": "policy|article|funding|product",
    "keywords": ["关键词1", "关键词2"],
    "scene_tags": ["高楼灭火"或"山林搜救"或"公安执法"或"医疗应急"或空数组]
  }
]

重点关注：
- 国家/地方低空经济新政策、新标准
- eVTOL 企业重大进展（亿航、峰飞、沃飞、小鹏汇天、沃兰特等）
- 无人机在消防、应急、物流、农业等场景的落地
- 低空基础设施、通信、适航审定进展
- 融资/IPO事件

注意：只输出你有把握的信息，不确定的不要编造。`

  const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.5,
    }),
  })

  if (!resp.ok) throw new Error(`DeepSeek HTTP ${resp.status}`)
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content?.trim() || ""

  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return []
  }
}

function deduplicate(items) {
  const seen = new Set()
  return items.filter(item => {
    const key = item.title.slice(0, 60)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default async (req) => {
  const isScheduled = req.headers.get("x-netlify-cron") === "true"
  const url0 = new URL(req.url)
  const manualKey = url0.searchParams.get("key")

  if (!isScheduled && manualKey !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "cron only" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    })
  }

  const results = { deepseek: 0, baidu: 0, inserted: 0, skipped: 0 }

  try {
    let items = []

    // ── 1. DeepSeek 生成简报（主源，cron 时运行）──
    if (isScheduled) {
      try {
        const aiItems = await generateDailyBriefing()
        items = aiItems.map(it => ({
          title: it.title,
          url: "",
          date: new Date().toISOString().slice(0, 10),
          summary: it.summary,
          source: "AI 简报",
          category: it.category || "article",
          keywords: it.keywords || [],
          scene_tags: it.scene_tags || [],
        }))
        results.deepseek = items.length
      } catch (e) {
        console.warn("[cron-intel] DeepSeek 生成失败:", e.message)
      }
    }

    // ── 2. 百度新闻抓取（辅源，cron 时运行）──
    if (isScheduled) {
      try {
        const baiduResults = await Promise.allSettled(
          BAIDU_QUERIES.map(q => fetchBaiduNews(q))
        )
        const baiduItems = []
        for (const r of baiduResults) {
          if (r.status === "fulfilled") baiduItems.push(...r.value)
        }
        results.baidu = baiduItems.length

        // 百度新闻只补充有 URL 的条目，不与 DeepSeek 生成的重复
        for (const bi of baiduItems) {
          const dup = items.find(di => di.title.slice(0, 20) === bi.title.slice(0, 20))
          if (!dup) items.push(bi)
        }
      } catch (e) {
        console.warn("[cron-intel] 百度新闻抓取失败:", e.message)
      }
    }

    items = deduplicate(items)

    // ── 3. 写入 Supabase ──
    for (const item of items) {
      try {
        const dupField = item.url ? "url" : "title"
        const dupValue = item.url || item.title

        const { data: existing } = await supabase
          .from("intel_items")
          .select("id")
          .eq(dupField, dupValue)
          .limit(1)

        if (existing?.length) { results.skipped++; continue }

        const { error } = await supabaseAdmin.from("intel_items").insert({
          title: item.title.slice(0, 200),
          source: item.source || "自动采集",
          url: item.url || "",
          date: item.date,
          category: item.category || "article",
          summary: item.summary?.slice(0, 500) || "",
          keywords: item.keywords || [],
          scene_tags: item.scene_tags || [],
          is_verified: false,
        })

        if (error) {
          if (error.code === "23505") { results.skipped++; continue }
          console.warn(`[cron-intel] 写入失败: ${item.title}`, error.message)
        } else {
          results.inserted++
        }
      } catch (_) {}
    }

    return new Response(JSON.stringify({
      status: "ok",
      collected_at: new Date().toISOString(),
      is_cron: isScheduled,
      ...results,
    }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({
      status: "error",
      message: e.message,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export const config = {
  schedule: "0 1 * * *", // UTC 01:00 = 北京时间 09:00
}
