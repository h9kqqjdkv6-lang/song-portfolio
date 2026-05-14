/**
 * 知识库导入脚本：将低空领域 Markdown 文件批量导入 Supabase intel_items 表。
 *
 * 用法：
 *   SUPABASE_URL=xxx SUPABASE_KEY=xxx \
 *   node scripts/ingest-knowledge.mjs /path/to/low-altitude/kb/
 *
 * 将每个 .md 文件解析：
 *   - 第一行 # 标题 → title
 *   - > 开头的行 → 出处/日期信息
 *   - 正文 → summary（前 300 字）
 *   - 文件名 → 场景标签推断
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { extname, join, basename } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("请设置 SUPABASE_URL 和 SUPABASE_KEY 环境变量");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 场景关键词映射（用于自动打 scene_tags）
const SCENE_KEYWORDS = {
  "高楼灭火": ["消防", "灭火", "高楼", "高层", "FC100", "系留", "火场", "建筑"],
  "山林搜救": ["搜救", "山林", "走失", "热成像", "M400", "格网", "夜航"],
  "公安执法": ["公安", "执法", "取证", "警务", "证据链", "28181", "视频"],
  "医疗应急": ["医疗", "血液", "温控", "急救", "WS 400", "血站", "临床"],
};

function inferSceneTags(filename, content) {
  const tags = [];
  for (const [scene, keywords] of Object.entries(SCENE_KEYWORDS)) {
    for (const kw of keywords) {
      if (content.includes(kw) || filename.includes(kw)) {
        tags.push(scene);
        break;
      }
    }
  }
  return tags.length ? tags : ["高楼灭火"]; // 默认低空经济关联合规场景
}

function inferCategory(filename, content) {
  const lc = (filename + content).toLowerCase();
  if (/政策|法规|条例|标准|规定/.test(lc)) return "policy";
  if (/案例|企业|亿航|峰飞|沃飞|小鹏|沃兰特/.test(lc)) return "article";
  if (/融资|IPO|轮|美元|亿元/.test(lc)) return "funding";
  if (/技术|路线|电池|动力|通信|航电/.test(lc)) return "article";
  return "article";
}

function parseMd(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n");

  let title = "";
  let date = "";
  let summary = "";

  for (const line of lines) {
    const stripped = line.trim();
    if (!title && stripped.startsWith("# ")) {
      title = stripped.replace(/^#\s+/, "").replace(/^低空经济[：:]?\s*/, "").trim();
    }
    if (stripped.startsWith("> ")) {
      const note = stripped.replace(/^>\s*/, "");
      if (note.includes("整理日期") || note.includes("202")) {
        const dm = note.match(/(\d{4}-\d{2}-\d{2})/);
        if (dm) date = dm[1];
      }
    }
  }

  // 正文取前 500 字（跳过标题行和空行）
  const body = lines
    .filter(l => !l.trimStart().startsWith("# ") && !l.trim().startsWith(">") && l.trim())
    .join(" ")
    .slice(0, 500)
    .trim();

  summary = body || text.slice(0, 500);

  return {
    title: title || basename(filePath, ".md"),
    date: date || new Date().toISOString().slice(0, 10),
    summary,
  };
}

async function ingest(dirPath) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory() && !entry.startsWith(".")) {
        walk(full);
      } else if (extname(entry) === ".md") {
        files.push(full);
      }
    }
  }
  walk(dirPath);

  console.log(`找到 ${files.length} 个 Markdown 文件`);

  let success = 0, skipped = 0, failed = 0;

  for (const filePath of files) {
    try {
      const { title, date, summary } = parseMd(filePath);
      const content = readFileSync(filePath, "utf-8");
      const sceneTags = inferSceneTags(filePath, content);
      const category = inferCategory(filePath, content);

      const { error } = await supabase.from("intel_items").insert({
        title,
        source: "低空知识库",
        date,
        category,
        summary,
        keywords: [],
        scene_tags: sceneTags,
        score: 70,
        is_verified: false,
      });

      if (error) {
        if (error.code === "23505") { skipped++; continue; }
        console.error(`  ✗ ${title}: ${error.message}`);
        failed++;
      } else {
        console.log(`  ✓ ${title} [${category}] → ${sceneTags.join(",")}`);
        success++;
      }
    } catch (e) {
      console.error(`  ✗ ${filePath}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n完成：成功 ${success}，跳过 ${skipped}，失败 ${failed}`);
}

const dir = process.argv[2] || "/Users/ailisong/Desktop/my-ai-hub/data/knowledge/vertical/low-altitude";
ingest(dir);
