import { supabase } from "./_lib/supabase.mjs"

export default async () => {
  const db = await supabase.from("scenes").select("name").limit(1).then(() => "ok", () => "unreachable")

  return new Response(JSON.stringify({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: db,
    hasDeepSeek: !!process.env.DEEPSEEK_API_KEY,
  }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}

export const config = { path: "/api/health" }
