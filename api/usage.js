/** GET /api/usage — 当月 API 用量汇总 */

const { supabase } = require("./_lib/supabase.js");

module.exports = async (req, res) => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_log")
    .select("*")
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const records = data || [];
  const totalCost = records.reduce((sum, r) => sum + parseFloat(r.cost_cny || 0), 0);
  const totalInput = records.reduce((sum, r) => sum + (r.input_tokens || 0), 0);
  const totalOutput = records.reduce((sum, r) => sum + (r.output_tokens || 0), 0);

  const budget = parseFloat(process.env.DEEPSEEK_MONTHLY_BUDGET_CNY || "10.0");

  res.json({
    month: new Date().toISOString().slice(0, 7),
    budget_cny: budget,
    requests: records.length,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_cost_cny: parseFloat(totalCost.toFixed(6)),
    budget_remaining_cny: parseFloat(Math.max(0, budget - totalCost).toFixed(4)),
    recent: records.slice(0, 5).map(r => ({
      model: r.model,
      endpoint: r.endpoint,
      cost_cny: parseFloat(r.cost_cny || 0).toFixed(6),
      created_at: r.created_at,
    })),
  });
};
