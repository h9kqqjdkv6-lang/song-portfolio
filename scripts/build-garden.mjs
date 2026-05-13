import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "garden");
const OUT_DIR = path.join(ROOT, "garden");
const NOTES_DIR = path.join(OUT_DIR, "notes");

const STAGE_EMOJI = {
  seedling: "🌱",
  budding: "🌿",
  evergreen: "🌳",
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainSummary(markdownWithoutFrontmatter, max = 156) {
  const t = markdownWithoutFrontmatter
    .replace(/#{1,6}\s+[^\n]+/g, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[*_>`]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max).trim() + "…";
}

/** 笔记正文纯文本预览（用于搜索索引，不含 frontmatter） */
function plainBodyPreview(markdownWithoutFrontmatter, max = 500) {
  const t = String(markdownWithoutFrontmatter || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, " $1 ")
    .replace(/#{1,6}\s+[^\n]+/g, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[*_>`|]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max).trim() + "…";
}

function buildTitleMap(notes) {
  const titleToSlug = new Map();
  for (const n of notes) {
    const title = String(n.data.title || n.slug).trim();
    if (title) titleToSlug.set(title.toLowerCase(), n.slug);
    titleToSlug.set(n.slug.toLowerCase(), n.slug);
  }
  return titleToSlug;
}

function processWikilinks(markdown, titleToSlug) {
  return markdown.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, rawTitle, alias) => {
    const title = rawTitle.trim();
    const display = (alias || title).trim();
    const key = title.toLowerCase();
    const slug = titleToSlug.get(key);
    if (!slug) {
      return `<span class="wiki-link wiki-link--missing">${escapeHtml(display)}</span>`;
    }
    return `<a class="wiki-link" href="../notes/${slug}.html">${escapeHtml(display)}</a>`;
  });
}

function extractWikiTargets(body, titleToSlug) {
  const targets = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(body))) {
    const key = m[1].trim().toLowerCase();
    const slug = titleToSlug.get(key);
    if (slug) targets.push(slug);
  }
  return [...new Set(targets)];
}

function layoutNote({
  title,
  category,
  stage,
  breadcrumbHtml,
  mainHtml,
  asideOutgoingHtml,
  asideBacklinksHtml,
  backlinksHtml,
}) {
  const st = STAGE_EMOJI[stage] || STAGE_EMOJI.seedling;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#050508" />
  <title>${escapeHtml(title)} · 数字花园</title>
  <link rel="stylesheet" href="../garden.css" />
</head>
<body>
  <div class="g-read-progress" aria-hidden="true">
    <div class="g-read-progress__bar" id="g-read-progress-bar"></div>
  </div>
  <div class="garden-noise" aria-hidden="true"></div>
  <div class="g-page">
    <header class="g-nav">
      <div class="g-nav__inner">
        <a class="g-nav__brand" href="../../index.html">← <span>回主页</span></a>
        <nav class="g-nav__links" aria-label="花园导航">
          <a href="../index.html">数字花园</a>
          <a href="../../index.html#hub-title">作品与能力</a>
        </nav>
      </div>
    </header>
    <article class="g-note-layout">
      <nav class="g-breadcrumb" aria-label="面包屑">${breadcrumbHtml}</nav>
      <div class="g-read">
        <p style="margin:0 0 0.75rem;font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(167,139,250,0.9);">${escapeHtml(category)} · <span aria-hidden="true">${st}</span> <span class="visually-hidden">${escapeHtml(stage)}</span></p>
        <h1>${escapeHtml(title)}</h1>
        ${mainHtml}
        ${backlinksHtml}
      </div>
      <aside class="g-aside" aria-label="相关笔记">
        ${asideOutgoingHtml}
        ${asideBacklinksHtml}
      </aside>
    </article>
    <footer class="g-footer">
      <a href="../index.html">数字花园</a> · Markdown 源位于 <code>/content/garden/</code>
    </footer>
  </div>
  <script>
(function () {
  var bar = document.getElementById("g-read-progress-bar");
  if (!bar) return;
  function update() {
    var el = document.documentElement;
    var scrollTop = window.scrollY != null ? window.scrollY : el.scrollTop;
    var height = el.scrollHeight - el.clientHeight;
    var p = height <= 0 ? 0 : (scrollTop / height) * 100;
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    bar.style.width = p + "%";
  }
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
})();
  </script>
  <script src="../wiki-popup.js" defer></script>
</body>
</html>`;
}

function layoutIndex({ categories, cardsHtml, graphJson, searchJson }) {
  const catButtons = categories
    .map(
      (c) =>
        `<button type="button" class="g-filter-btn g-filter-btn--cat" data-cat="${escapeHtml(c)}">${escapeHtml(
          c
        )}</button>`
    )
    .join("");
  const stageRows = [
    ["__all__", "全部"],
    ["seedling", "🌱 幼苗"],
    ["budding", "🌿 培育"],
    ["evergreen", "🌳 常青"],
  ];
  const stageButtons = stageRows
    .map(
      ([key, label], i) =>
        `<button type="button" class="g-filter-btn g-filter-btn--stage${i === 0 ? " is-active" : ""}" data-stage="${escapeHtml(
          key
        )}">${label}</button>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#050508" />
  <title>数字花园 · 学习笔记</title>
  <link rel="stylesheet" href="garden.css" />
</head>
<body>
  <div class="garden-noise" aria-hidden="true"></div>
  <div class="g-page">
    <header class="g-nav">
      <div class="g-nav__inner">
        <a class="g-nav__brand" href="../index.html">宋宗源 <span>· 数字花园</span></a>
        <nav class="g-nav__links" aria-label="全站">
          <a href="../index.html#about">关于我</a>
          <a href="../index.html#hub-title">作品与能力</a>
          <a href="index.html" aria-current="page">数字花园</a>
        </nav>
      </div>
    </header>
    <div class="g-search-wrap" id="garden-search-root">
      <label class="visually-hidden" for="garden-search-input">搜索笔记全文</label>
      <div class="g-search">
        <input
          type="search"
          id="garden-search-input"
          class="g-search__input"
          placeholder="搜索标题、摘要与正文…"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          aria-autocomplete="list"
          aria-controls="garden-search-results"
          aria-expanded="false"
          enterkeyhint="search"
        />
        <ul class="g-search__results" id="garden-search-results" hidden></ul>
      </div>
    </div>
    <header class="g-hero">
      <h1 class="g-hero__title">数字花园</h1>
      <p class="g-hero__lead">基于 Markdown 的学习笔记：生长状态、分类与双向链接。</p>
    </header>
    <section class="g-graph-wrap" aria-label="知识图谱">
      <div class="g-graph-panel">
        <svg id="garden-graph" role="img" aria-label="笔记关系网络"></svg>
      </div>
    </section>
    <div class="g-filters-bar" role="toolbar" aria-label="筛选笔记">
      <div class="g-filters g-filters--row">
        <button type="button" class="g-filter-btn g-filter-btn--cat is-active" data-cat="__all__">全部</button>
        ${catButtons}
      </div>
      <div class="g-filters g-filters--row">
        ${stageButtons}
      </div>
    </div>
    <section class="g-grid" id="garden-grid" aria-label="笔记列表">
      ${cardsHtml}
    </section>
    <p class="g-grid-empty" id="g-grid-empty" hidden role="status">当前筛选下暂无笔记。</p>
    <script type="application/json" id="garden-graph-json">${graphJson}</script>
    <script type="application/json" id="garden-search-json">${searchJson}</script>
    <script src="https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.min.js" crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js" crossorigin="anonymous"></script>
    <script>
(function () {
  var raw = document.getElementById("garden-graph-json");
  if (!raw || !window.d3) return;
  var data = JSON.parse(raw.textContent);
  var svg = d3.select("#garden-graph");
  if (svg.empty()) return;

  function render() {
    var el = svg.node();
    if (!el) return;
    var w = el.clientWidth || 600;
    var h = el.clientHeight || 300;
    svg.selectAll("*").remove();

    var catColor = d3.scaleOrdinal().domain([]).range([
      "#7c3aed", "#0ea5e9", "#10b981", "#eab308", "#f97316", "#ec4899"
    ]);
    var cats = Array.from(new Set(data.nodes.map(function (d) { return d.category; })));
    catColor.domain(cats);

    function isMoc(d) {
      return d.type === "moc";
    }
    function nodeRadius(d) {
      return isMoc(d) ? 13.5 : 9;
    }
    function collideR(d) {
      return isMoc(d) ? 40 : 26;
    }

    function clampNode(d) {
      var r = collideR(d);
      var padX = r + 10;
      var padTop = r + 8;
      var padBot = r + 30;
      d.x = Math.max(padX, Math.min(w - padX, d.x));
      d.y = Math.max(padTop, Math.min(h - padBot, d.y));
    }

    data.nodes.forEach(function (n, i) {
      var t = (i / Math.max(1, data.nodes.length)) * Math.PI * 2 + Math.random() * 0.35;
      var rad = 32 + Math.random() * 42;
      n.x = w / 2 + Math.cos(t) * rad;
      n.y = h / 2 + Math.sin(t) * rad;
      clampNode(n);
    });

    var sim = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(function (d) { return d.id; }).distance(48).strength(0.9))
      .force("charge", d3.forceManyBody().strength(-78))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collide", d3.forceCollide().radius(function (d) { return collideR(d); }));

    var g = svg.append("g");
    var zoom = d3.zoom().scaleExtent([0.45, 2.8]).on("zoom", function (ev) {
      g.attr("transform", ev.transform);
    });
    svg.call(zoom);

    var link = g.append("g")
      .attr("stroke", "rgba(167,139,250,0.35)")
      .attr("stroke-width", 1.2)
      .selectAll("line")
      .data(data.links)
      .join("line");

    var nodeG = g.append("g")
      .attr("class", "garden-graph-nodes")
      .selectAll("g")
      .data(data.nodes)
      .join("g")
      .style("cursor", "pointer");

    var circles = nodeG.append("circle")
      .attr("r", function (d) { return nodeRadius(d); })
      .attr("stroke", function (d) {
        return isMoc(d) ? "rgba(250, 250, 250, 0.35)" : "rgba(255,255,255,0.15)";
      })
      .attr("stroke-width", function (d) { return isMoc(d) ? 1.5 : 1; })
      .attr("fill", function (d) {
        return isMoc(d) ? "#a855f7" : catColor(d.category);
      });

    circles.append("title").text(function (d) { return d.title; });

    var labels = nodeG.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", function (d) { return nodeRadius(d) + 11; })
      .attr("font-size", "10px")
      .attr("font-weight", function (d) { return isMoc(d) ? "600" : "500"; })
      .attr("fill", "rgba(245, 243, 255, 0.9)")
      .style("pointer-events", "none")
      .style("opacity", function (d) { return isMoc(d) ? 1 : 0; })
      .style("transition", "opacity 0.15s ease")
      .text(function (d) { return d.title; });

    nodeG
      .on("mouseenter", function (event, d) {
        if (!isMoc(d)) d3.select(this).select("text").style("opacity", 1);
      })
      .on("mouseleave", function (event, d) {
        if (!isMoc(d)) d3.select(this).select("text").style("opacity", 0);
      });

    nodeG.call(d3.drag()
      .on("start", function (event, d) {
        if (!event.active) sim.alphaTarget(0.35).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", function (event, d) {
        var r = collideR(d);
        var padX = r + 10;
        var padTop = r + 8;
        var padBot = r + 30;
        d.fx = Math.max(padX, Math.min(w - padX, event.x));
        d.fy = Math.max(padTop, Math.min(h - padBot, event.y));
      })
      .on("end", function (event, d) {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

    sim.on("tick", function () {
      data.nodes.forEach(clampNode);
      link
        .attr("x1", function (d) { return d.source.x; })
        .attr("y1", function (d) { return d.source.y; })
        .attr("x2", function (d) { return d.target.x; })
        .attr("y2", function (d) { return d.target.y; });
      nodeG.attr("transform", function (d) {
        return "translate(" + d.x + "," + d.y + ")";
      });
    });

    nodeG.on("click", function (event, d) {
      event.preventDefault();
      window.location.href = "notes/" + encodeURIComponent(d.id) + ".html";
    });
  }

  render();
  window.addEventListener("resize", function () { render(); });

  var activeCat = "__all__";
  var activeStage = "__all__";
  function applyCardFilters() {
    var visibleCount = 0;
    document.querySelectorAll(".g-card").forEach(function (card) {
      var c = card.getAttribute("data-category");
      var s = card.getAttribute("data-stage");
      var catOk = activeCat === "__all__" || c === activeCat;
      var stageOk = activeStage === "__all__" || s === activeStage;
      var show = catOk && stageOk;
      if (show) {
        card.removeAttribute("hidden");
        visibleCount++;
      } else {
        card.setAttribute("hidden", "");
      }
    });
    var emptyEl = document.getElementById("g-grid-empty");
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
    }
  }
  document.querySelectorAll(".g-filter-btn--cat").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeCat = btn.getAttribute("data-cat") || "__all__";
      document.querySelectorAll(".g-filter-btn--cat").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      applyCardFilters();
    });
  });
  document.querySelectorAll(".g-filter-btn--stage").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeStage = btn.getAttribute("data-stage") || "__all__";
      document.querySelectorAll(".g-filter-btn--stage").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      applyCardFilters();
    });
  });
})();
    </script>
    <script>
(function () {
  var input = document.getElementById("garden-search-input");
  var listEl = document.getElementById("garden-search-results");
  var root = document.getElementById("garden-search-root");
  var rawIdx = document.getElementById("garden-search-json");
  if (!input || !listEl || !root || !rawIdx || typeof Fuse === "undefined") return;

  var STAGE_EMOJI = { seedling: "🌱", budding: "🌿", evergreen: "🌳" };
  var notes;
  try {
    notes = JSON.parse(rawIdx.textContent).notes || [];
  } catch (e) {
    input.placeholder = "搜索索引解析失败";
    input.disabled = true;
    return;
  }

  var fuse = new Fuse(notes, {
    keys: [
      { name: "title", weight: 0.32 },
      { name: "summary", weight: 0.18 },
      { name: "body", weight: 0.28 },
      { name: "category", weight: 0.11 },
      { name: "stage", weight: 0.11 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 1,
    distance: 128,
    includeScore: true,
  });

  function setOpen(open) {
    listEl.hidden = !open;
    input.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function renderHits(hits) {
    listEl.textContent = "";
    if (!hits.length) {
      var empty = document.createElement("li");
      empty.className = "g-search__empty";
      empty.textContent = "没有匹配的笔记";
      listEl.appendChild(empty);
      setOpen(true);
      return;
    }
    hits.forEach(function (hit) {
      var item = hit.item;
      var li = document.createElement("li");
      li.className = "g-search__hit";
      var a = document.createElement("a");
      a.className = "g-search__hit-link";
      a.href = item.url;
      var title = document.createElement("div");
      title.className = "g-search__hit-title";
      title.textContent = item.title;
      var meta = document.createElement("div");
      meta.className = "g-search__hit-meta";
      var em = STAGE_EMOJI[item.stage] || STAGE_EMOJI.seedling;
      meta.textContent = em + " " + item.category;
      a.appendChild(title);
      a.appendChild(meta);
      li.appendChild(a);
      listEl.appendChild(li);
    });
    setOpen(true);
  }

  function runSearch() {
    var q = (input.value || "").trim();
    if (!q) {
      listEl.textContent = "";
      setOpen(false);
      return;
    }
    var hits = fuse.search(q).slice(0, 16);
    renderHits(hits);
  }

  input.addEventListener("input", runSearch);

  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      listEl.textContent = "";
      setOpen(false);
      input.blur();
    }
  });

  document.addEventListener("click", function (ev) {
    if (!root.contains(ev.target)) {
      listEl.textContent = "";
      setOpen(false);
    }
  });
})();
    </script>
    <footer class="g-footer">
      内容由 <code>npm run build:garden</code> 从 Markdown 生成 · <a href="../index.html">返回首页</a>
    </footer>
  </div>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error("Missing folder:", CONTENT_DIR);
    process.exit(1);
  }
  fs.mkdirSync(NOTES_DIR, { recursive: true });

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  const notes = files.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const slug = path.basename(file, ".md");
    return { slug, file, data, content };
  });

  notes.sort((a, b) => String(a.data.title || "").localeCompare(String(b.data.title || ""), "zh"));

  const titleToSlug = buildTitleMap(notes);

  /** @type {Record<string, string[]>} */
  const outgoing = {};
  /** @type {Record<string, string[]>} */
  const backlinks = {};
  for (const n of notes) {
    outgoing[n.slug] = extractWikiTargets(n.content, titleToSlug);
    backlinks[n.slug] = [];
  }
  for (const n of notes) {
    for (const t of outgoing[n.slug]) {
      if (backlinks[t]) backlinks[t].push(n.slug);
    }
  }
  for (const k of Object.keys(backlinks)) {
    backlinks[k] = [...new Set(backlinks[k])];
  }

  const graphLinks = [];
  for (const n of notes) {
    for (const t of outgoing[n.slug]) {
      graphLinks.push({ source: n.slug, target: t });
    }
  }

  const graphNodes = notes.map((n) => ({
    id: n.slug,
    title: n.data.title || n.slug,
    category: n.data.category || "未分类",
    stage: n.data.stage || "seedling",
    summary: n.data.summary || plainSummary(n.content),
    type: n.data.type || "",
  }));

  const searchRecords = notes.map((n) => ({
    id: n.slug,
    url: `notes/${n.slug}.html`,
    title: n.data.title || n.slug,
    summary: n.data.summary || plainSummary(n.content),
    category: n.data.category || "未分类",
    stage: n.data.stage || "seedling",
    body: plainBodyPreview(n.content, 500),
  }));

  const graphJson = JSON.stringify({ nodes: graphNodes, links: graphLinks }).replace(/</g, "\\u003c");
  const searchJson = JSON.stringify({ notes: searchRecords }).replace(/</g, "\\u003c");

  const categories = [...new Set(notes.map((n) => n.data.category || "未分类"))].sort((a, b) =>
    a.localeCompare(b, "zh")
  );

  marked.use({ gfm: true });

  const cardsHtml = notes
    .map((n) => {
      const title = n.data.title || n.slug;
      const cat = n.data.category || "未分类";
      const stage = n.data.stage || "seedling";
      const st = STAGE_EMOJI[stage] || STAGE_EMOJI.seedling;
      const sum = n.data.summary || plainSummary(n.content);
      const time = n.data.updated || "";
      return `<a class="g-card" href="notes/${escapeHtml(n.slug)}.html" data-category="${escapeHtml(cat)}" data-stage="${escapeHtml(stage)}">
        <div class="g-card__meta"><span class="g-card__stage" aria-hidden="true">${st}</span> ${escapeHtml(cat)}</div>
        <h2 class="g-card__title">${escapeHtml(title)}</h2>
        <p class="g-card__sum">${escapeHtml(sum)}</p>
        ${time ? `<time class="g-card__time" datetime="${escapeHtml(time)}">更新 · ${escapeHtml(time)}</time>` : ""}
      </a>`;
    })
    .join("\n");

  fs.writeFileSync(
    path.join(OUT_DIR, "index.html"),
    layoutIndex({ categories, cardsHtml, graphJson, searchJson })
  );

  for (const n of notes) {
    const title = n.data.title || n.slug;
    const category = n.data.category || "未分类";
    const stage = n.data.stage || "seedling";
    const updated = n.data.updated || "";
    const slug = n.slug;
    const linked = processWikilinks(n.content, titleToSlug);
    let mainHtml = marked.parse(linked);
    const isMoc = n.data.type === "moc";
    if (isMoc) {
      const targets = extractWikiTargets(n.content, titleToSlug);
      const cards = targets
        .map((ts) => {
          const tn = notes.find((x) => x.slug === ts);
          if (!tn) return "";
          const ttitle = tn.data.title || tn.slug;
          const sum = tn.data.summary || plainSummary(tn.content);
          return `<a class="moc-card" href="../notes/${escapeHtml(ts)}.html"><h3 class="moc-card__title">${escapeHtml(ttitle)}</h3><p class="moc-card__excerpt">${escapeHtml(sum)}</p></a>`;
        })
        .join("");
      mainHtml += `<section class="moc-grid" aria-label="笔记地图">${cards}</section>`;
    }

    const outs = outgoing[slug];
    const asideOut =
      outs.length > 0
        ? `<div class="g-aside__section"><h2>链出</h2><ul>${outs
            .map((ts) => {
              const tn = notes.find((x) => x.slug === ts);
              const ttitle = tn ? tn.data.title || tn.slug : ts;
              return `<li><a href="../notes/${escapeHtml(ts)}.html">${escapeHtml(ttitle)}</a></li>`;
            })
            .join("")}</ul></div>`
        : "";

    const bs = backlinks[slug].filter((x) => x !== slug);
    const asideBack =
      bs.length > 0
        ? `<div class="g-aside__section"><h2>反向链接</h2><ul>${bs
            .map((ts) => {
              const tn = notes.find((x) => x.slug === ts);
              const ttitle = tn ? tn.data.title || tn.slug : ts;
              return `<li><a href="../notes/${escapeHtml(ts)}.html">${escapeHtml(ttitle)}</a></li>`;
            })
            .join("")}</ul></div>`
        : "";

    const backlinksBlock =
      bs.length > 0
        ? `<section class="g-backlinks"><h2>引用本页的笔记</h2><ul>${bs
            .map((ts) => {
              const tn = notes.find((x) => x.slug === ts);
              const ttitle = tn ? tn.data.title || tn.slug : ts;
              return `<li><a href="../notes/${escapeHtml(ts)}.html">${escapeHtml(ttitle)}</a></li>`;
            })
            .join("")}</ul></section>`
        : "";

    const breadcrumbHtml = `<a href="../index.html">数字花园</a> / ${escapeHtml(category)} / <span aria-current="page">${escapeHtml(title)}</span>`;

    const page = layoutNote({
      title,
      category,
      stage,
      breadcrumbHtml,
      mainHtml,
      asideOutgoingHtml: asideOut,
      asideBacklinksHtml: asideBack,
      backlinksHtml: backlinksBlock,
    });

    fs.writeFileSync(path.join(NOTES_DIR, `${slug}.html`), page);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "graph.json"),
    JSON.stringify({ nodes: graphNodes, links: graphLinks }, null, 2)
  );

  fs.writeFileSync(path.join(OUT_DIR, "search.json"), JSON.stringify({ notes: searchRecords }, null, 2));

  console.log(`Garden: ${notes.length} notes → ${OUT_DIR}`);
}

main();
