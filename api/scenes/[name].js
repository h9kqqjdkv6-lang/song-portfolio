/**
 * GET /api/scenes/:name — 场景数据 + 关联情报
 *
 * 替代静态 scenes.json，从 Supabase 获取场景配置，
 * 同时返回关联的最新情报条目（政策更新、行业事件等）。
 */

const { supabase } = require("../_lib/supabase.js");

module.exports = async (req, res) => {
  const name = decodeURIComponent(req.query.name || "");

  if (!name) {
    // 列表所有场景
    const { data, error } = await supabase
      .from("scenes")
      .select("name,display_name,theme_color,subtitle,aircraft_primary,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order");

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ scenes: data || [] });
  }

  // 单个场景详情
  const { data: scene, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("name", name)
    .single();

  if (error || !scene) {
    return res.status(404).json({ error: `场景 "${name}" 不存在` });
  }

  // 关联情报（该场景标签的最新条目）
  const { data: intel } = await supabase
    .from("intel_items")
    .select("title,source,date,category,summary,keywords,score")
    .contains("scene_tags", [name])
    .order("date", { ascending: false })
    .limit(10);

  res.json({
    scene,
    intel: intel || [],
    meta: {
      updated_at: new Date().toISOString(),
      intel_count: (intel || []).length,
    },
  });
};
