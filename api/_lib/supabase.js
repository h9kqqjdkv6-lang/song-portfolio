/**
 * Supabase 共享客户端 —— 所有 API Route 共用此实例。
 *
 * 环境变量（Vercel Dashboard 或 .env.local 设置）：
 *   SUPABASE_URL     — Supabase 项目 URL
 *   SUPABASE_KEY     — Supabase anon/public key
 *   SUPABASE_SERVICE_KEY — 可选，服务端操作使用（绕过 RLS）
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("[supabase] SUPABASE_URL / SUPABASE_KEY 未设置，API 将无法访问数据库。");
}

/** anon 客户端（遵循 RLS 策略） */
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "public" },
});

/** service_role 客户端（绕过 RLS，仅用于需要全表操作的后端逻辑） */
const supabaseAdmin = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "public" } })
  : supabase; // fallback: 使用 anon

module.exports = { supabase, supabaseAdmin };
