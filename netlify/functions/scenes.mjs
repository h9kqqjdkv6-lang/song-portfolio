import { supabase } from "./_lib/supabase.mjs"

export default async (request) => {
  const url = new URL(request.url)
  const name = url.searchParams.get("name") || ""

  if (!name) {
    const { data, error } = await supabase
      .from("scenes")
      .select("name,display_name,theme_color,subtitle,aircraft_primary,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order")
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ scenes: data || [] }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }

  const { data: scene, error } = await supabase.from("scenes").select("*").eq("name", name).single()
  if (error || !scene) {
    return new Response(JSON.stringify({ error: `场景 "${name}" 不存在` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { data: intel } = await supabase
    .from("intel_items")
    .select("title,source,date,category,summary,keywords,score")
    .contains("scene_tags", [name])
    .order("date", { ascending: false })
    .limit(10)

  return new Response(JSON.stringify({
    scene,
    intel: intel || [],
    meta: { updated_at: new Date().toISOString(), intel_count: (intel || []).length },
  }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}

export const config = { path: "/api/scenes" }
