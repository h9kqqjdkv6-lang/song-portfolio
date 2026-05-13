import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL || ""
const SUPABASE_KEY = process.env.SUPABASE_KEY || ""
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ""

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "public" },
})

export const supabaseAdmin = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "public" } })
  : supabase
