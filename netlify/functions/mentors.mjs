import { supabase } from "./_lib/supabase.mjs"

export default async (request) => {
  const url = new URL(request.url)
  const q = url.searchParams.get("q") || ""
  const domain = url.searchParams.get("domain") || ""
  const isCompany = url.searchParams.get("is_company")

  let query = supabase.from("mentors").select("*").order("score", { ascending: false })
  if (q) query = query.or(`name.ilike.%${q}%,title.ilike.%${q}%,bio.ilike.%${q}%`)
  if (domain) query = query.eq("domain", domain)
  if (isCompany !== null) query = query.eq("is_company", isCompany === "true")

  const { data, error } = await query
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ mentors: data || [], total: (data || []).length }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}

export const config = { path: "/api/mentors" }
