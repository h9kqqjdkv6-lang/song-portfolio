/** GET /api/mentors — 人物/企业列表 + 搜索 */

const { supabase } = require("./_lib/supabase.js");

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const q = searchParams.get("q") || "";
  const domain = searchParams.get("domain") || "";
  const isCompany = searchParams.get("is_company");

  let query = supabase.from("mentors").select("*").order("score", { ascending: false });

  if (q) query = query.or(`name.ilike.%${q}%,title.ilike.%${q}%,bio.ilike.%${q}%`);
  if (domain) query = query.eq("domain", domain);
  if (isCompany !== null) query = query.eq("is_company", isCompany === "true");

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ mentors: data || [], total: (data || []).length });
};
