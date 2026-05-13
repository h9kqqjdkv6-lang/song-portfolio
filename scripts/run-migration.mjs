/**
 * 运行 Supabase 数据库迁移（schema.sql + seed.sql）
 * 用法：node scripts/run-migration.mjs
 */
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

const { Pool } = pg

function loadEnv() {
  const envPath = resolve(ROOT, ".env")
  try {
    const content = readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const idx = trimmed.indexOf("=")
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  } catch (_) {}
}

loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL || ""
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ""
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || ""
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || ""

if (!PROJECT_REF) {
  console.error("❌ 无法从 SUPABASE_URL 解析 project ref:", SUPABASE_URL)
  process.exit(1)
}

// 使用 DNS-over-HTTPS 解析 IPv6（Node.js 内置 dns 对 IPv6-only 主机可能解析失败）
async function resolveHostname(hostname) {
  // 先尝试系统 DNS（指定 family: 6）
  const dns = await import("node:dns")
  try {
    const records = await dns.promises.resolve6(hostname)
    if (records.length > 0) return records[0]
  } catch (_) {}
  // 回退：DNS-over-HTTPS via Cloudflare
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=AAAA`, {
      headers: { Accept: "application/dns-json" }
    })
    const data = await res.json()
    if (data.Answer) {
      for (const r of data.Answer) {
        if (r.type === 28) return r.data  // AAAA
      }
    }
  } catch (e) {
    console.error("DNS-over-HTTPS 失败:", e.message)
  }
  return null
}

const DB_HOSTNAME = `db.${PROJECT_REF}.supabase.co`
const DB_HOST = await resolveHostname(DB_HOSTNAME)

if (!DB_HOST) {
  console.error(`❌ 无法解析 ${DB_HOSTNAME}（IPv6 DNS 不可达）`)
  console.log("请到 Supabase 控制台启用 PgBouncer（Settings → Database → Connection Pooling），然后重试")
  process.exit(1)
}

console.log(`🔗 ${DB_HOSTNAME} → ${DB_HOST}`)

const pool = new Pool({
  host: DB_HOST,
  port: 5432,
  user: "postgres",
  password: DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
})

async function runSQL(filePath) {
  const sql = readFileSync(resolve(ROOT, filePath), "utf-8")
  const client = await pool.connect()
  try {
    await client.query(sql)
    console.log(`✅ ${filePath} 执行成功`)
  } finally {
    client.release()
  }
}

async function main() {
  if (!DB_PASSWORD) {
    console.error("❌ 请设置 SUPABASE_DB_PASSWORD 环境变量")
    console.log("   export SUPABASE_DB_PASSWORD='你的数据库密码'")
    process.exit(1)
  }

  console.log(`🔗 连接: ${DB_HOSTNAME} → ${DB_HOST}`)

  try {
    await pool.query("SELECT 1")
    console.log("✅ 数据库连接成功")
  } catch (e) {
    console.error("❌ 连接失败:", e.message)
    await pool.end()
    process.exit(1)
  }

  await runSQL("supabase/schema.sql")
  await runSQL("supabase/seed.sql")

  await pool.end()
  console.log("\n🎉 迁移完成！")
}

main()
