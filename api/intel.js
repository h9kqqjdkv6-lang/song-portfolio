/**
 * GET  /api/intel          — 情报列表（支持 ?scene= & ?category= & ?limit= 过滤）
 * POST /api/intel          — 新增情报（可选 AI 自动打标）
 */

const { supabase, supabaseAdmin } = require("./_lib/supabase.js");
const { deepseekChat } = require("./_lib/deepseek.js");

module.exports = async (req, res) => {
  // ── GET：查询情报 ─────────────────────────────────────────
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const scene = searchParams.get("scene") || "";
    const category = searchParams.get("category") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    let query = supabase.from("intel_items").select("*").order("date", { ascending: false }).limit(limit);

    if (scene) query = query.contains("scene_tags", [scene]);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ intel: data || [], total: (data || []).length });
  }

  // ── POST：新增情报 ───────────────────────────────────────
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { raw_text, title, source, url, date, category, summary, keywords, scene_tags, mentor_name } = body;

      // 如果有 raw_text 且开启了 DeepSeek，自动解析
      let finalTitle = title || "";
      let finalCategory = category || "article";
      let finalKeywords = keywords || [];
      let finalSummary = summary || "";
      let autoTagResult = null;

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
${raw_text.slice(0, 2000)}`;

          const { content } = await deepseekChat(autoPrompt, { maxTokens: 400, temperature: 0.2 });
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            autoTagResult = JSON.parse(jsonMatch[0]);
            finalTitle = finalTitle || autoTagResult.title || "";
            finalCategory = autoTagResult.category || "article";
            finalKeywords = finalKeywords.length ? finalKeywords : (autoTagResult.keywords || []);
            finalSummary = finalSummary || autoTagResult.summary || "";
          }
        } catch (e) {
          console.warn("[intel] AI 自动打标失败:", e.message);
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
      };

      // 通过 service_role 写入（绕过 RLS，确保写入成功）
      const { data, error } = await supabaseAdmin.from("intel_items").insert(payload).select().single();

      if (error) return res.status(500).json({ error: error.message });

      return res.json({ status: "ok", intel: data, auto_tag: autoTagResult });
    } catch (e) {
      return res.status(400).json({ error: `请求解析失败: ${e.message}` });
    }
  }

  res.status(405).json({ error: "仅支持 GET / POST" });
};
