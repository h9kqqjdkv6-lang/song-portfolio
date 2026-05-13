import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const scenesMin = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "scenes.json"), "utf8")));
const aircraftsMin = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "aircrafts.json"), "utf8")));

const amapKey = process.env.AMAP_KEY || "AMAP_KEY_PLACEHOLDER";

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>解决方案指挥台 · 低空方案工作台</title>
  <script>
    window.AMAP_KEY = '${amapKey.replace(/'/g, "\\'")}';
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Noto+Sans+SC:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/generator-workbench.css">
</head>
<body>
  <div class="tog-backdrop" aria-hidden="true"></div>

  <header class="tog-top-bar" role="banner">
    <div class="tog-top-left">
      <a class="tog-back-link" href="index.html">返回主页</a>
      <div class="tog-top-titles">
        <span class="tog-product-name">低空经济 · 解决方案指挥台</span>
        <span class="tog-product-sub">宋宗源 · 解决方案工程师 · ToB / G端</span>
      </div>
    </div>
    <div class="tog-top-actions">
      <button type="button" class="tog-theme-toggle" id="tog-theme-toggle" aria-pressed="false" title="切换浅色/深色">浅色视图</button>
    </div>
  </header>

  <div class="tog-app" id="tog-app">
    <aside class="tog-sidebar" aria-label="方案步骤导航">
      <div id="tog-kpi-bar" class="tog-kpi-bar tog-kpi-bar--sidebar" role="region" aria-label="关键指标速览">
        <div class="tog-kpi-item">
          <span class="tog-kpi-label">当前场景</span>
          <span class="tog-kpi-val tog-kpi-val--sm" id="tog-kpi-scene">—</span>
        </div>
        <div class="tog-kpi-item">
          <span class="tog-kpi-label">空间档位</span>
          <span class="tog-kpi-val tog-kpi-val--sm" id="tog-kpi-spatial">—</span>
        </div>
        <div class="tog-kpi-item tog-kpi-item--wind">
          <span class="tog-kpi-label">现场风速</span>
          <div class="tog-kpi-wind-row">
            <span class="tog-kpi-val" id="tog-kpi-wind">—</span>
            <span class="tog-kpi-badge" id="tog-kpi-wind-tier" data-tier="na">—</span>
          </div>
        </div>
        <div class="tog-kpi-item">
          <span class="tog-kpi-label">推荐方案加权</span>
          <span class="tog-kpi-val" id="tog-kpi-compare">—</span>
        </div>
        <div class="tog-kpi-item">
          <span class="tog-kpi-label">工作区版本</span>
          <span class="tog-kpi-val tog-kpi-val--sm" id="tog-kpi-revision">—</span>
        </div>
        <div class="tog-kpi-item tog-kpi-item--wide">
          <span class="tog-kpi-hint" id="tog-kpi-hint">请先在右侧填写风速并点击「生成方案」。</span>
        </div>
      </div>
      <p class="tog-sidebar-title">工作台步骤</p>
      <nav class="tog-steps" role="tablist" aria-label="模块切换">
        <button type="button" class="wb-tab tog-step is-active" role="tab" aria-selected="true" data-panel="brief" data-step="1">
          <span class="tog-step-num" aria-hidden="true">1</span>
          <span class="tog-step-text"><span class="tog-step-label">解决方案</span><span class="tog-step-desc">场景方案生成与导出</span></span>
        </button>
        <button type="button" class="wb-tab tog-step" role="tab" aria-selected="false" data-panel="policy" data-step="2">
          <span class="tog-step-num" aria-hidden="true">2</span>
          <span class="tog-step-text"><span class="tog-step-label">政策法规</span><span class="tog-step-desc">标准 · 空域 · 采购</span></span>
        </button>
        <button type="button" class="wb-tab tog-step" role="tab" aria-selected="false" data-panel="pain" data-step="3">
          <span class="tog-step-num" aria-hidden="true">3</span>
          <span class="tog-step-text"><span class="tog-step-label">痛点分析</span><span class="tog-step-desc">运行与组织</span></span>
        </button>
        <button type="button" class="wb-tab tog-step" role="tab" aria-selected="false" data-panel="cases" data-step="4">
          <span class="tog-step-num" aria-hidden="true">4</span>
          <span class="tog-step-text"><span class="tog-step-label">真实案例</span><span class="tog-step-desc">行业叙事参考</span></span>
        </button>
        <button type="button" class="wb-tab tog-step" role="tab" aria-selected="false" data-panel="tech" data-step="5">
          <span class="tog-step-num" aria-hidden="true">5</span>
          <span class="tog-step-text"><span class="tog-step-label">技术实施</span><span class="tog-step-desc">端侧与集成</span></span>
        </button>
        <button type="button" class="wb-tab tog-step" role="tab" aria-selected="false" data-panel="security" data-step="6">
          <span class="tog-step-num" aria-hidden="true">6</span>
          <span class="tog-step-text"><span class="tog-step-label">安全管控</span><span class="tog-step-desc">飞行与数据</span></span>
        </button>
        <button type="button" class="wb-tab tog-step" role="tab" aria-selected="false" data-panel="contact" data-step="7">
          <span class="tog-step-num" aria-hidden="true">7</span>
          <span class="tog-step-text"><span class="tog-step-label">联系我们</span><span class="tog-step-desc">商务与生态</span></span>
        </button>
      </nav>
      <details class="tog-sidebar-extra">
        <summary class="tog-sidebar-extra-sum">场景配图（可选）</summary>
        <p class="tog-sidebar-extra-note">政务界面默认隐藏轮播以保持高信噪比。如需品牌示意，可使用独立宣传物料。</p>
      </details>
    </aside>

    <main class="tog-main" role="main">
      <div class="tog-main-scroll">
        <div id="wb-panel-brief" class="wb-panel wb-panel--brief is-active" role="tabpanel">
          <header class="tog-brief-header">
            <h1 class="tog-page-title" id="page-title">高楼灭火</h1>
            <p class="tog-page-sub" id="page-subtitle">基于十部门联合印发《低空经济标准体系建设指南》</p>
          </header>

          <section class="tog-brief-video-slot panel--tog" aria-label="场景演示视频">
            <div class="tog-brief-video-frame" id="tog-brief-video-frame">
              <video id="tog-brief-video" class="tog-brief-video" controls playsinline preload="metadata" poster="">
              </video>
              <button type="button" class="tog-video-play-overlay" id="tog-brief-video-play" aria-label="播放视频">
                <span class="tog-video-play-icon" aria-hidden="true"></span>
              </button>
            </div>
            <p class="tog-brief-video-hint">预留视频区</p>
          </section>

          <div id="tog-work-wrap" class="wrap tog-brief-wrap">
            <div class="lower-grid" id="lower-grid">
              <section id="medical-map-section" class="card medical-map-card panel--tog" hidden aria-hidden="true">
                <h3>青岛市 · 供血航线示意</h3>
                <div id="amap-container" role="img" aria-label="地图：血站至医院航线"></div>
                <p class="medical-map-caption">起点：血站 → 终点：医院。生成方案后将绘制蓝色示意航线。</p>
              </section>
              <div class="output-stack">
                <div id="output" role="region" aria-live="polite"></div>
                <details class="case-breakdown">
                  <summary>案例拆解：作战简报管道</summary>
                  <div class="case-breakdown-body">
                    <section class="case-breakdown-section">
                      <h4 class="case-breakdown-h">输入与输出</h4>
                      <p>在右侧选择场景、空间档位与风速；步骤 1「解决方案」中生成简报并导出 PNG。</p>
                    </section>
                    <section class="case-breakdown-section">
                      <h4 class="case-breakdown-h">工作台</h4>
                      <p>步骤 2–7 为政策法规、痛点、案例、技术、安全与联系等门户化栏目，支持子类与文章层级浏览。</p>
                    </section>
                  </div>
                </details>
                <footer class="tog-panel-footer-note">数据自 scenes.json、aircrafts.json 加载；离线使用页面内嵌 fallback；PNG 依赖 html2canvas。</footer>
              </div>
            </div>
          </div>
        </div>

        <div id="wb-panel-policy" class="wb-panel gov-hub-panel" role="tabpanel" hidden>
          <div class="gov-hub" data-gov-hub="policy">
            <aside class="gov-hub-aside">
              <p class="gov-hub-aside-title">栏目导航</p>
              <nav class="gov-hub-subnav" aria-label="政策法规子类"></nav>
            </aside>
            <div class="gov-hub-body panel--tog">
              <header class="gov-hub-head">
                <div class="gov-hub-head-row">
                  <h2 class="gov-hub-head-title"><span class="gov-hub-head-bar" aria-hidden="true"></span><span class="gov-hub-head-text">政策法规</span></h2>
                  <span class="gov-hub-head-more" aria-hidden="true">更多 &gt;&gt;</span>
                </div>
              </header>
              <div class="gov-hub-list-wrap">
                <ul class="gov-hub-article-list"></ul>
              </div>
              <article class="gov-hub-article-detail" hidden>
                <button type="button" class="gov-hub-back btn-wb-ghost">← 返回列表</button>
                <h3 class="gov-hub-detail-title"></h3>
                <div class="gov-hub-detail-content"></div>
              </article>
            </div>
          </div>
        </div>

        <div id="wb-panel-pain" class="wb-panel gov-hub-panel" role="tabpanel" hidden>
          <div class="gov-hub" data-gov-hub="pain">
            <aside class="gov-hub-aside">
              <p class="gov-hub-aside-title">栏目导航</p>
              <nav class="gov-hub-subnav" aria-label="痛点分析子类"></nav>
            </aside>
            <div class="gov-hub-body panel--tog">
              <header class="gov-hub-head">
                <div class="gov-hub-head-row">
                  <h2 class="gov-hub-head-title"><span class="gov-hub-head-bar" aria-hidden="true"></span><span class="gov-hub-head-text">痛点分析</span></h2>
                  <span class="gov-hub-head-more" aria-hidden="true">更多 &gt;&gt;</span>
                </div>
              </header>
              <div class="gov-hub-list-wrap">
                <ul class="gov-hub-article-list"></ul>
              </div>
              <article class="gov-hub-article-detail" hidden>
                <button type="button" class="gov-hub-back btn-wb-ghost">← 返回列表</button>
                <h3 class="gov-hub-detail-title"></h3>
                <div class="gov-hub-detail-content"></div>
              </article>
            </div>
          </div>
        </div>

        <div id="wb-panel-cases" class="wb-panel gov-hub-panel" role="tabpanel" hidden>
          <div class="gov-hub" data-gov-hub="cases">
            <aside class="gov-hub-aside">
              <p class="gov-hub-aside-title">栏目导航</p>
              <nav class="gov-hub-subnav" aria-label="真实案例子类"></nav>
            </aside>
            <div class="gov-hub-body panel--tog">
              <header class="gov-hub-head">
                <div class="gov-hub-head-row">
                  <h2 class="gov-hub-head-title"><span class="gov-hub-head-bar" aria-hidden="true"></span><span class="gov-hub-head-text">真实案例</span></h2>
                  <span class="gov-hub-head-more" aria-hidden="true">更多 &gt;&gt;</span>
                </div>
              </header>
              <div class="gov-hub-list-wrap">
                <ul class="gov-hub-article-list"></ul>
              </div>
              <article class="gov-hub-article-detail" hidden>
                <button type="button" class="gov-hub-back btn-wb-ghost">← 返回列表</button>
                <h3 class="gov-hub-detail-title"></h3>
                <div class="gov-hub-detail-content"></div>
              </article>
            </div>
          </div>
        </div>

        <div id="wb-panel-tech" class="wb-panel gov-hub-panel" role="tabpanel" hidden>
          <div class="gov-hub" data-gov-hub="tech">
            <aside class="gov-hub-aside">
              <p class="gov-hub-aside-title">栏目导航</p>
              <nav class="gov-hub-subnav" aria-label="技术实施子类"></nav>
            </aside>
            <div class="gov-hub-body panel--tog">
              <header class="gov-hub-head">
                <div class="gov-hub-head-row">
                  <h2 class="gov-hub-head-title"><span class="gov-hub-head-bar" aria-hidden="true"></span><span class="gov-hub-head-text">技术实施</span></h2>
                  <span class="gov-hub-head-more" aria-hidden="true">更多 &gt;&gt;</span>
                </div>
              </header>
              <div class="gov-hub-list-wrap">
                <ul class="gov-hub-article-list"></ul>
              </div>
              <article class="gov-hub-article-detail" hidden>
                <button type="button" class="gov-hub-back btn-wb-ghost">← 返回列表</button>
                <h3 class="gov-hub-detail-title"></h3>
                <div class="gov-hub-detail-content"></div>
              </article>
            </div>
          </div>
        </div>

        <div id="wb-panel-security" class="wb-panel gov-hub-panel" role="tabpanel" hidden>
          <div class="gov-hub" data-gov-hub="security">
            <aside class="gov-hub-aside">
              <p class="gov-hub-aside-title">栏目导航</p>
              <nav class="gov-hub-subnav" aria-label="安全管控子类"></nav>
            </aside>
            <div class="gov-hub-body panel--tog">
              <header class="gov-hub-head">
                <div class="gov-hub-head-row">
                  <h2 class="gov-hub-head-title"><span class="gov-hub-head-bar" aria-hidden="true"></span><span class="gov-hub-head-text">安全管控</span></h2>
                  <span class="gov-hub-head-more" aria-hidden="true">更多 &gt;&gt;</span>
                </div>
              </header>
              <div class="gov-hub-list-wrap">
                <ul class="gov-hub-article-list"></ul>
              </div>
              <article class="gov-hub-article-detail" hidden>
                <button type="button" class="gov-hub-back btn-wb-ghost">← 返回列表</button>
                <h3 class="gov-hub-detail-title"></h3>
                <div class="gov-hub-detail-content"></div>
              </article>
            </div>
          </div>
        </div>

        <div id="wb-panel-contact" class="wb-panel gov-hub-panel" role="tabpanel" hidden>
          <div class="gov-hub" data-gov-hub="contact">
            <aside class="gov-hub-aside">
              <p class="gov-hub-aside-title">栏目导航</p>
              <nav class="gov-hub-subnav" aria-label="联系我们子类"></nav>
            </aside>
            <div class="gov-hub-body panel--tog">
              <header class="gov-hub-head">
                <div class="gov-hub-head-row">
                  <h2 class="gov-hub-head-title"><span class="gov-hub-head-bar" aria-hidden="true"></span><span class="gov-hub-head-text">联系我们</span></h2>
                  <span class="gov-hub-head-more" aria-hidden="true">更多 &gt;&gt;</span>
                </div>
              </header>
              <div class="gov-hub-list-wrap">
                <ul class="gov-hub-article-list"></ul>
              </div>
              <article class="gov-hub-article-detail" hidden>
                <button type="button" class="gov-hub-back btn-wb-ghost">← 返回列表</button>
                <h3 class="gov-hub-detail-title"></h3>
                <div class="gov-hub-detail-content"></div>
              </article>
            </div>
          </div>
        </div>

      </div>
    </main>

    <aside class="tog-rail" aria-label="参数配置与工具">
      <h3 class="tog-rail-title">参数与导出</h3>

      <div class="card card-input panel--tog tog-rail-card">
        <div class="row">
          <label for="scenario">业务场景</label>
          <select id="scenario" aria-label="选择场景">
            <option value="高楼灭火" selected>高楼灭火</option>
            <option value="山林搜救">山林搜救</option>
            <option value="公安执法">公安执法</option>
            <option value="医疗应急">医疗应急</option>
          </select>
        </div>
      </div>

      <div class="card card-input panel--tog tog-rail-card">
        <div class="row">
          <label for="height" id="height-field-label">建筑高度</label>
          <select id="height" aria-label="建筑高度">
            <option value="50">50米</option>
            <option value="100" selected>100米</option>
            <option value="150">150米</option>
            <option value="other">其他（自定义米数）</option>
          </select>
        </div>
        <div class="row row--height-custom" id="row-height-custom" hidden>
          <label for="height-custom-m">自定义高度（米）</label>
          <input id="height-custom-m" type="number" inputmode="numeric" min="10" max="600" step="1" value="120" aria-label="自定义建筑高度（米）" />
        </div>
        <div class="row row--wind-rail">
          <label for="wind-beaufort">当前风速（m/s）</label>
          <select id="wind-beaufort" class="wind-beaufort-select" aria-label="蒲福风级（1–8 级，10 m 高度风速）">
            <option value="">按风力等级选择（可选）</option>
            <option value="1">1级风（0.3–1.5 m/s）</option>
            <option value="2">2级风（1.6–3.3 m/s）</option>
            <option value="3">3级风（3.4–5.4 m/s）</option>
            <option value="4">4级风（5.5–7.9 m/s）</option>
            <option value="5">5级风（8.0–10.7 m/s）</option>
            <option value="6">6级风（10.8–13.8 m/s）</option>
            <option value="7">7级风（13.9–17.1 m/s）</option>
            <option value="8">8级风（17.2–20.7 m/s）</option>
          </select>
          <p class="wind-beaufort-note">风速区间为蒲福风级对应 10 m 高度风程（m/s），与气象业务常用表一致；也可在下方直接输入精确值。</p>
          <div class="wind-field">
            <input id="wind" type="number" min="0" max="40" step="0.1" placeholder="例：8.5" inputmode="decimal" aria-label="当前风速（米/秒）" />
            <button type="button" id="btn-wind-now" class="btn-wind-now">获取风速</button>
          </div>
        </div>
        <div class="btn-stack btn-stack--generate-only">
          <button type="button" id="btn">生成方案</button>
        </div>
      </div>

      <div class="card card-input panel--tog tog-rail-card">
        <div class="tog-doc-depth-head">
          <span class="tog-doc-depth-title">文档深度</span>
          <span class="tog-doc-depth-caption">随场景提示略有不同；已生成简报时点击可即时切换。</span>
        </div>
        <div class="tog-doc-depth" role="radiogroup" aria-label="作战简报文档深度">
          <button type="button" class="tog-depth-option" role="radio" aria-checked="false" data-depth="overview" id="tog-depth-overview">
            <span class="tog-depth-name">决策速览</span>
            <span class="tog-depth-desc">步骤 · 流程 · 要点</span>
          </button>
          <button type="button" class="tog-depth-option" role="radio" aria-checked="false" data-depth="technical" id="tog-depth-technical">
            <span class="tog-depth-name">技术深化</span>
            <span class="tog-depth-desc">上云实施 · 卡点提示</span>
          </button>
          <button type="button" class="tog-depth-option" role="radio" aria-checked="false" data-depth="full" id="tog-depth-full">
            <span class="tog-depth-name">全案汇编</span>
            <span class="tog-depth-desc">政策到沟通全量展开</span>
          </button>
        </div>
        <div class="tog-rail-png-export">
          <button type="button" id="btn-export" disabled aria-disabled="true">导出简报 PNG</button>
        </div>
      </div>

      <div class="tog-rail-links">
        <a class="btn-simulator" href="evidence-panel.html" target="_blank" rel="noopener noreferrer">证据链面板</a>
        <a class="btn-simulator" href="drone-simulator.html" target="_blank" rel="noopener noreferrer">调度模拟器</a>
      </div>
    </aside>
  </div>

  <footer class="tog-footer" role="contentinfo">
    <div class="tog-footer-meta">
      <span class="tog-footer-item" id="tog-footer-revision">revision —</span>
      <span class="tog-footer-item" id="tog-footer-updated">更新时间 —</span>
      <span class="tog-footer-item" id="tog-footer-pack">方案包 —</span>
    </div>
    <span class="tog-footer-copyright">© 2026 宋宗源</span>
  </footer>

  <a class="feedback-fab feedback-fab--tog" href="https://8pczx084.jsjform.com/f/eigkFW" target="_blank" rel="noopener noreferrer" aria-label="提交反馈">反馈</a>

  <script type="application/json" id="scenes-fallback">${scenesMin}</script>
  <script type="application/json" id="aircrafts-fallback">${aircraftsMin}</script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="js/generator/workspace-store.js"></script>
  <script src="js/generator/gov-hub-content.js"></script>
  <script src="js/generator/gov-hub-ui.js"></script>
  <script src="js/generator/workbench-ui.js"></script>
  <script src="js/generator/tog-kpi-bar.js"></script>
  <script src="js/generator/briefing-app.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(root, "generator.html"), html, "utf8");
console.log("Written generator.html");
