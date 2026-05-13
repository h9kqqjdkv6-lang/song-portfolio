import { supabase, supabaseAdmin } from "./_lib/supabase.mjs"
import { deepseekChat } from "./_lib/deepseek.mjs"

export default async (request) => {
  if (request.method === "GET") {
    const url = new URL(request.url)
    const scene = url.searchParams.get("scene") || ""
    const category = url.searchParams.get("category") || ""
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50)

    let query = supabase.from("intel_items").select("*").order("date", { ascending: false }).limit(limit)
    if (scene) query = query.contains("scene_tags", [scene])
    if (category) query = query.eq("category", category)

    const { data, error } = await query
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ intel: data || [], total: (data || []).length }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }

  if (request.method === "POST") {
    try {
      const body = await request.json()
      const { raw_text, title, source, url, date, category, summary, keywords, scene_tags, mentor_name } = body

      let finalTitle = title || ""
      let finalCategory = category || "article"
      let finalKeywords = keywords || []
      let finalSummary = summary || ""
      let autoTagResult = null

      if (raw_text && !title && !summary && process.env.DEEPSEEK_API_KEY) {
        try {
          const autoPrompt = `请解析以下情报文本，返回 JSON（只返回 JSON，不要其他内容）：
{
  "title": "简短标题（≤20字）",
  "category": "policy/article/speech/interview/funding/product",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "summary": "2-3 句话摘要（≤100字）"
}

情报文本：
${raw_text.slice(0, 2000)}`

          const { content } = await deepseekChat(autoPrompt, { maxTokens: 400, temperature: 0.2 })
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            autoTagResult = JSON.parse(jsonMatch[0])
            finalTitle = finalTitle || autoTagResult.title || ""
            finalCategory = autoTagResult.category || "article"
            finalKeywords = finalKeywords.length ? finalKeywords : (autoTagResult.keywords || [])
            finalSummary = finalSummary || autoTagResult.summary || ""
          }
        } catch (e) {
          console.warn("[intel] AI 自动打标失败:", e.message)
        }
      }

      const payload = {
        title: finalTitle || raw_text?.slice(0, 60) || "未命名情报",
        source: source || "",
        url: url || "",
        date: date || new Date().toISOString().slice(0, 10),
        category: finalCategory,
        summary: finalSummary || raw_text?.slice(0, 200) || "",
        keywords: finalKeywords,
        scene_tags: scene_tags || [],
        is_verified: false,
      }

      const { data, error } = await supabaseAdmin.from("intel_items").insert(payload).select().single()
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ status: "ok", intel: data, auto_tag: autoTagResult }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: `请求解析失败: ${e.message}` }), {
        status: 400, headers: { "Content-Type": "application/json" },
      })
    }
  }

  return new Response(JSON.stringify({ error: "仅支持 GET / POST" }), {
    status: 405, headers: { "Content-Type": "application/json" },
  })
}

export const config = { path: "/api/intel" }
