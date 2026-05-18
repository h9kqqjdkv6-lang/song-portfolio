import { supabaseAdmin } from "./_lib/supabase.mjs"

export default async (request) => {
  const url = new URL(request.url)
  const method = request.method

  try {
    if (method === "GET") {
      const fingerprint = url.searchParams.get("fingerprint")
      if (!fingerprint) {
        return new Response(JSON.stringify({ error: "fingerprint required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        })
      }

      const { data, error } = await supabaseAdmin
        .from("proposals")
        .select("*")
        .eq("industry", fingerprint)
        .order("created_at", { ascending: false })
        .limit(20)

      if (error) throw error

      // Map DB columns back to API response shape
      const proposals = (data || []).map((row) => ({
        id: row.id,
        fingerprint: row.industry,
        scenario_name: row.topic,
        brief_summary: row.route_reason ? JSON.parse(row.route_reason).brief_summary : "",
        wind_speed: row.route_reason ? JSON.parse(row.route_reason).wind_speed : null,
        score: row.route_reason ? JSON.parse(row.route_reason).score : null,
        workspace_data: row.content ? JSON.parse(row.content) : {},
        revision: row.route_reason ? JSON.parse(row.route_reason).revision : 1,
        created_at: row.created_at,
      }))

      return new Response(JSON.stringify({ proposals }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    if (method === "POST") {
      const body = await request.json()
      const { fingerprint, scenario_name, brief_summary, wind_speed, score, workspace_data, revision } = body

      if (!fingerprint) {
        return new Response(JSON.stringify({ error: "fingerprint required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        })
      }

      const { data, error } = await supabaseAdmin
        .from("proposals")
        .insert({
          topic: scenario_name || "",
          industry: fingerprint,
          content: JSON.stringify(workspace_data || {}),
          route_reason: JSON.stringify({
            revision: revision || 1,
            wind_speed: wind_speed || null,
            score: score || null,
            brief_summary: brief_summary || "",
          }),
          model_used: "workspace-sync",
          input_tokens_est: 0,
          output_tokens_est: 0,
        })
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify({ id: data.id, saved: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    if (method === "DELETE") {
      const fingerprint = url.searchParams.get("fingerprint")
      if (!fingerprint) {
        return new Response(JSON.stringify({ error: "fingerprint required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        })
      }

      const { error } = await supabaseAdmin
        .from("proposals")
        .delete()
        .eq("industry", fingerprint)

      if (error) throw error

      return new Response(JSON.stringify({ deleted: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  } catch (e) {
    console.error("proposals error:", e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
}

export const config = { path: "/api/proposals" }
