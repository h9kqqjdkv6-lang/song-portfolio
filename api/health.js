/** GET /api/health — 健康检查 + 数据库状态 */

const { supabase } = require("./_lib/supabase.js");

module.exports = async (req, res) => {
  const db = await supabase.from("scenes").select("name").limit(1).then(() => "ok", () => "unreachable");

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: db,
    hasDeepSeek: !!process.env.DEEPSEEK_API_KEY,
  });
};
