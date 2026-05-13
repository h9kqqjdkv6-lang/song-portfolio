(function () {
    var SCENES = null;
    var AIRCRAFTS = null;
    var WIND_HIGH_MS = 8;
    var HEIGHT_TALL_M = 100;

    var BRIEFING_DEPTH_LABELS = {
      overview: "决策速览",
      technical: "技术深化",
      full: "全案汇编"
    };

    /** AI Hub 连接 —— 获取场景相关的实时情报（政策更新、行业事件、人物动态） */
    var AI_HUB_URL = (typeof window !== "undefined" && window.AI_HUB_URL) || "http://localhost:8787";
    /** Netlify API（同源）—— 静态文件 + 轻 API（scenes/intel/mentors/health/usage） */
    var API_BASE = (typeof window !== "undefined" && window.API_BASE) || "";
    /** Vercel API —— AI 生成端点（需要长超时，Netlify 10s 不够） */
    var GENERATE_API_BASE = (typeof window !== "undefined" && window.GENERATE_API_BASE) || "https://song-portfolio-beige.vercel.app";
    var SCENE_INTEL_CACHE = {};  // { sceneKey: { items, timeline, updated_at } }
    var INTEL_FETCH_IN_FLIGHT = null;

    function fetchSceneIntel(sceneKey) {
      if (!sceneKey) return Promise.resolve(null);
      if (SCENE_INTEL_CACHE[sceneKey]) return Promise.resolve(SCENE_INTEL_CACHE[sceneKey]);
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 6000) : null;
      return fetch(AI_HUB_URL + "/api/portfolio/scene-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: sceneKey }),
        signal: controller ? controller.signal : undefined
      })
        .then(function (r) {
          if (!r.ok) throw new Error("intel fetch failed");
          return r.json();
        })
        .then(function (data) {
          SCENE_INTEL_CACHE[sceneKey] = data;
          return data;
        })
        .catch(function (err) {
          console.warn("[方案指挥台] AI Hub 情报获取失败（将使用静态数据）:", err && err.message ? err.message : err);
          return null;
        })
        .finally(function () {
          if (timer) clearTimeout(timer);
        });
    }

    /** 将 AI Hub 情报合并到场景数据中，用于方案生成时注入最新信息 */
    function injectSceneIntel(DATA, intelData) {
      if (!DATA || !intelData) return DATA;
      var enriched = JSON.parse(JSON.stringify(DATA));
      enriched._ai_hub_intel = {
        updated_at: intelData.updated_at || "",
        policy_updates: (intelData.timeline || []).map(function (t) { return t.preview || ""; }).filter(Boolean),
        intel_snippets: (intelData.intel_items || []).map(function (i) { return i.snippet || ""; }).filter(Boolean)
      };
      return enriched;
    }

    /** 主动预热：场景切换时后台拉取情报 */
    function prefetchSceneIntel(sceneKey) {
      if (INTEL_FETCH_IN_FLIGHT) return;
      INTEL_FETCH_IN_FLIGHT = fetchSceneIntel(sceneKey).finally(function () {
        INTEL_FETCH_IN_FLIGHT = null;
      });
    }

    /**
     * 蒲福风级 1–8 级在陆上常用近似：10 m 高度风速区间（m/s），与 GB/T 28591-2012《风力等级》及气象业务习惯一致。
     */
    var BEAUFORT_1_TO_8_MS = [
      { n: 1, min: 0.3, max: 1.5 },
      { n: 2, min: 1.6, max: 3.3 },
      { n: 3, min: 3.4, max: 5.4 },
      { n: 4, min: 5.5, max: 7.9 },
      { n: 5, min: 8.0, max: 10.7 },
      { n: 6, min: 10.8, max: 13.8 },
      { n: 7, min: 13.9, max: 17.1 },
      { n: 8, min: 17.2, max: 20.7 }
    ];

    function beaufortMidSpeedMs(levelNum) {
      var i = Number(levelNum) - 1;
      if (i < 0 || i >= BEAUFORT_1_TO_8_MS.length) return null;
      var r = BEAUFORT_1_TO_8_MS[i];
      return Math.round(((r.min + r.max) / 2) * 10) / 10;
    }

    var rebriefTimer = null;

    function scheduleRebriefDebounced() {
      clearTimeout(rebriefTimer);
      rebriefTimer = setTimeout(function () {
        if (window.TogKpiBar && typeof window.TogKpiBar.refresh === "function") {
          window.TogKpiBar.refresh();
        }
        if (window.BriefingApp && typeof window.BriefingApp.reRenderBriefingIfReady === "function") {
          window.BriefingApp.reRenderBriefingIfReady();
        }
      }, 420);
    }

    function updateHeightCustomRowVisibility() {
      var sel = document.getElementById("height");
      var row = document.getElementById("row-height-custom");
      if (!row) return;
      var mountain = isMountainScenario();
      if (mountain || !sel) {
        row.hidden = true;
        return;
      }
      row.hidden = sel.value !== "other";
    }

    /**
     * 建筑高度档或山林搜救范围档的物理数值；「其他」走自定义输入（米），仅非山林场景。
     */
    function readHeightMeters() {
      var sel = document.getElementById("height");
      if (!sel) return 100;
      var v = String(sel.value);
      if (v === "other") {
        var inp = document.getElementById("height-custom-m");
        var n = inp ? parseInt(String(inp.value).trim(), 10) : NaN;
        if (Number.isNaN(n) || n < 10) return 100;
        return Math.min(600, n);
      }
      var p = parseInt(v, 10);
      return Number.isNaN(p) ? 100 : p;
    }

    function spatialTierFromHeightM(m) {
      if (typeof m !== "number" || Number.isNaN(m)) return 100;
      if (m <= 60) return 50;
      if (m <= 125) return 100;
      return 150;
    }

    function beaufortLevelFromSpeedMs(ms) {
      var v = Number(ms);
      if (isNaN(v)) return "";
      for (var bi = 0; bi < BEAUFORT_1_TO_8_MS.length; bi++) {
        var r = BEAUFORT_1_TO_8_MS[bi];
        if (v >= r.min && v <= r.max) return String(r.n);
      }
      return "";
    }

    function syncBeaufortSelectFromWindInput() {
      var sel = document.getElementById("wind-beaufort");
      var inp = document.getElementById("wind");
      if (!sel || !inp) return;
      var raw = String(inp.value).trim();
      if (raw === "") {
        sel.value = "";
        return;
      }
      var lvl = beaufortLevelFromSpeedMs(parseFloat(raw));
      sel.value = lvl || "";
    }

    function initWindBeaufortControls() {
      var sel = document.getElementById("wind-beaufort");
      var inp = document.getElementById("wind");
      if (!sel || !inp) return;

      function pulseWindInputs() {
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }

      sel.addEventListener("change", function () {
        var v = sel.value;
        if (!v) return;
        var mid = beaufortMidSpeedMs(parseInt(v, 10));
        if (mid == null) return;
        inp.value = String(mid);
        pulseWindInputs();
        scheduleRebriefDebounced();
      });

      inp.addEventListener("input", syncBeaufortSelectFromWindInput);
      inp.addEventListener("change", syncBeaufortSelectFromWindInput);
      inp.addEventListener("input", scheduleRebriefDebounced);
    }

    function initBriefingVideoPlayOverlay() {
      var v = document.getElementById("tog-brief-video");
      var btn = document.getElementById("tog-brief-video-play");
      if (!v || !btn) return;

      function showBtn(show) {
        if (show) btn.classList.remove("is-hidden");
        else btn.classList.add("is-hidden");
      }

      btn.addEventListener("click", function () {
        v.play().catch(function () {});
      });
      v.addEventListener("play", function () {
        showBtn(false);
      });
      v.addEventListener("pause", function () {
        showBtn(true);
      });
      v.addEventListener("ended", function () {
        showBtn(true);
      });
      showBtn(v.paused || v.ended);
    }

    var HEIGHT_CONFIG = {
      50: {
        heightNote: "中低层高层建筑，优先快速侦察与地面系留同步准备。"
      },
      100: {
        heightNote: "百米级建筑，严格执行侦查—打击链与RTK/视觉融合投送。"
      },
      150: {
        heightNote: "超高层场景，强调多机轮替、斜向/快速穿越路径，并关注真高与空域合规。"
      }
    };

    var MOUNTAIN_SCENARIO_KEY = "山林搜救";

    var RANGE_CONFIG = {
      50: {
        rangeLabel: "约 3 km²（小范围）",
        rangeNote: "搜救区相对集中，可优先热成像框搜、定点喊话与地面引导协同。"
      },
      100: {
        rangeLabel: "约 10 km²（中等范围）",
        rangeNote: "搜索线拉长、地形落差大，强化分区巡逻、补给点与起降点预设。"
      },
      150: {
        rangeLabel: "约 20 km²（大范围）",
        rangeNote: "面广点多，适合多机轮替分区作业，并重点关注山地微气象与批复空域。"
      }
    };

    var MEDICAL_SCENARIO_KEY = "医疗应急";

    var medicalMapState = {
      map: null,
      markers: [],
      polyline: null
    };

    /** 构建时替换 head 中 `window.AMAP_KEY`（占位符 `AMAP_KEY_PLACEHOLDER` 表示未配置） */
    var amapBootstrapPromise = null;
    var AMAP_KEY_PLACEHOLDER = "AMAP_KEY_PLACEHOLDER";

    /** 青岛市 GCJ-02：示意血站 → 医院 */
    var QINGDAO_CENTER = [120.3483, 36.0796];
    var QINGDAO_BLOOD_STATION = [120.3762, 36.0918];
    var QINGDAO_HOSPITAL = [120.3189, 36.0664];

    function isMedicalScenario() {
      return getScenarioKey() === MEDICAL_SCENARIO_KEY;
    }

    function isMountainScenario() {
      return getScenarioKey() === MOUNTAIN_SCENARIO_KEY;
    }

    /** 建筑高度档（灭火/执法等）或山林「范围」档；医疗仍用高度档占位。 */
    function getSpatialConfigForRender(h) {
      var raw = typeof h === "number" && !isNaN(h) ? h : 100;
      if (isMedicalScenario()) {
        var medTier = spatialTierFromHeightM(raw);
        var medBase = HEIGHT_CONFIG[medTier] || HEIGHT_CONFIG[100];
        var medExtra = "";
        if (raw > 150)
          medExtra = " 当前输入高度 " + raw + " m（超高/综合体档），起降净空与航线须专项会签。";
        else if (raw < 50 && document.getElementById("height") && document.getElementById("height").value === "other")
          medExtra = " 当前自定义低层高度 " + raw + " m。";
        return { heightNote: medBase.heightNote + medExtra };
      }
      if (isMountainScenario()) return RANGE_CONFIG[raw] || RANGE_CONFIG[100];
      var tier = spatialTierFromHeightM(raw);
      var base = HEIGHT_CONFIG[tier] || HEIGHT_CONFIG[100];
      var extra = "";
      if (raw > 150)
        extra = " 当前建筑高度 " + raw + " m（超过 150 m 预设档），按超高、侧风与幕墙/综合体环境专项复核。";
      else if (raw < 50 && document.getElementById("height") && document.getElementById("height").value === "other")
        extra = " 当前自定义低层高度 " + raw + " m。";
      return { heightNote: base.heightNote + extra };
    }

    function spatialNoteFromCfg(cfg) {
      if (!cfg) return "";
      if (cfg.rangeNote != null && String(cfg.rangeNote).trim() !== "") return str(cfg.rangeNote);
      return str(cfg.heightNote);
    }

    function syncSpatialFieldWithScenario() {
      var sel = document.getElementById("height");
      var lbl = document.getElementById("height-field-label");
      if (!sel) return;
      var mountain = isMountainScenario();
      if (lbl) lbl.textContent = mountain ? "搜救作业范围" : "建筑高度";
      var cur = sel.value;
      var pairs = mountain
        ? [
            ["50", "约 3 km²（小范围）"],
            ["100", "约 10 km²（中等范围）"],
            ["150", "约 20 km²（大范围）"]
          ]
        : [
            ["50", "50 米"],
            ["100", "100 米"],
            ["150", "150 米"],
            ["other", "其他（自定义米数）"]
          ];
      var hadOther = cur === "other";
      if (mountain && hadOther) cur = "100";
      sel.innerHTML = "";
      for (var i = 0; i < pairs.length; i++) {
        var opt = document.createElement("option");
        opt.value = pairs[i][0];
        opt.textContent = pairs[i][1];
        if (pairs[i][0] === cur) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.setAttribute("aria-label", mountain ? "搜救作业范围（平面尺度档位）" : "建筑高度");
      updateHeightCustomRowVisibility();
    }

    function isValidAmapKey() {
      var k = window.AMAP_KEY;
      if (k === undefined || k === null) return false;
      var s = String(k).trim();
      if (!s) return false;
      if (s === AMAP_KEY_PLACEHOLDER) return false;
      return true;
    }

    function showAmapContainerError() {
      var el = document.getElementById("amap-container");
      if (!el) return;
      el.innerHTML =
        '<div class="amap-unavailable" role="status">地图服务暂时不可用，请稍后重试</div>';
    }

    /** 地图脚本加载完成后的初始化（医疗应急场景下创建地图与标记） */
    function initMap() {
      afterAmapScriptReady();
    }

    function afterAmapScriptReady() {
      if (!isMedicalScenario()) return;
      requestAnimationFrame(function () {
        var el = document.getElementById("amap-container");
        if (el && window.AMap) {
          el.innerHTML = "";
        }
        initMedicalAmapIfNeeded();
        if (medicalMapState.map) {
          medicalMapState.map.resize();
          clearMedicalPolyline();
        }
      });
    }

    /**
     * 使用 Snippet / 构建注入的 window.AMAP_KEY 加载高德 JS；无效时提示并返回 rejected Promise。
     */
    function loadAmap() {
      if (amapBootstrapPromise) return amapBootstrapPromise;

      if (window.AMap) {
        amapBootstrapPromise = Promise.resolve();
        initMap();
        return amapBootstrapPromise;
      }

      if (window.AMAP_KEY && String(window.AMAP_KEY).trim() !== "" && isValidAmapKey()) {
        amapBootstrapPromise = new Promise(function (resolve, reject) {
          var script = document.createElement("script");
          script.src =
            "https://webapi.amap.com/maps?v=2.0&key=" +
            encodeURIComponent(String(window.AMAP_KEY).trim());
          script.async = true;
          script.onload = function () {
            initMap();
            resolve();
          };
          script.onerror = function () {
            console.error("高德地图脚本加载失败");
            var box = document.getElementById("amap-container");
            if (box) {
              box.innerHTML = "地图服务暂时不可用，请稍后重试";
            }
            reject(new Error("高德脚本加载失败"));
          };
          document.head.appendChild(script);
        });
        return amapBootstrapPromise;
      }

      console.error("AMAP_KEY not found.");
      var el = document.getElementById("amap-container");
      if (el) {
        el.innerHTML = "地图服务暂时不可用，请稍后重试";
      }
      amapBootstrapPromise = Promise.reject(new Error("AMAP_KEY not found"));
      return amapBootstrapPromise;
    }

    function clearMedicalPolyline() {
      if (medicalMapState.map && medicalMapState.polyline) {
        medicalMapState.map.remove(medicalMapState.polyline);
        medicalMapState.polyline = null;
      }
    }

    function initMedicalAmapIfNeeded() {
      var el = document.getElementById("amap-container");
      if (!el || !window.AMap || medicalMapState.map) return;
      medicalMapState.map = new AMap.Map("amap-container", {
        zoom: 12,
        center: QINGDAO_CENTER
      });
      medicalMapState.markers = [
        new AMap.Marker({
          position: QINGDAO_BLOOD_STATION,
          title: "血站（起点）",
          map: medicalMapState.map
        }),
        new AMap.Marker({
          position: QINGDAO_HOSPITAL,
          title: "医院（终点）",
          map: medicalMapState.map
        })
      ];
      medicalMapState.map.setFitView(medicalMapState.markers, false, [48, 48, 48, 48]);
    }

    function drawMedicalSupplyRoute() {
      if (!isMedicalScenario()) return;
      loadAmap()
        .then(function () {
          initMedicalAmapIfNeeded();
          if (!medicalMapState.map) return;
          requestAnimationFrame(function () {
            medicalMapState.map.resize();
            clearMedicalPolyline();
            medicalMapState.polyline = new AMap.Polyline({
              path: [QINGDAO_BLOOD_STATION, QINGDAO_HOSPITAL],
              strokeColor: "#2563eb",
              strokeWeight: 6,
              strokeOpacity: 0.92,
              lineJoin: "round",
              lineCap: "round",
              zIndex: 60
            });
            medicalMapState.map.add(medicalMapState.polyline);
            medicalMapState.map.setFitView(
              [medicalMapState.polyline].concat(medicalMapState.markers),
              false,
              [44, 44, 72, 44]
            );
          });
        })
        .catch(function (err) {
          console.warn("[高德地图]", err && err.message ? err.message : err);
        });
    }

    function updateMedicalMapSectionVisibility() {
      var wrap = document.getElementById("tog-work-wrap");
      var sec = document.getElementById("medical-map-section");
      if (!sec) return;
      var show = isMedicalScenario();
      if (wrap) wrap.classList.toggle("wrap--medical-map", show);
      if (show) {
        sec.hidden = false;
        sec.setAttribute("aria-hidden", "false");
        loadAmap()
          .then(function () {
            initMedicalAmapIfNeeded();
            if (medicalMapState.map) {
              requestAnimationFrame(function () {
                medicalMapState.map.resize();
                clearMedicalPolyline();
              });
            }
          })
          .catch(function () {});
      } else {
        clearMedicalPolyline();
        sec.hidden = true;
        sec.setAttribute("aria-hidden", "true");
      }
    }

    function str(v) {
      if (v === undefined || v === null) return "〔待采购确认〕";
      var s = String(v).trim();
      return s === "" ? "〔待采购确认〕" : s;
    }

    function getScenarioKey() {
      var el = document.getElementById("scenario");
      return el ? el.value : "高楼灭火";
    }

    function shallowCloneAircraft(obj) {
      if (!obj || typeof obj !== "object") return {};
      var o = {};
      Object.keys(obj).forEach(function (k) {
        o[k] = obj[k];
      });
      return o;
    }

    function getAircraftByKey(modelKey) {
      if (!AIRCRAFTS || modelKey === undefined || modelKey === null) return {};
      var k = String(modelKey);
      if (Object.prototype.hasOwnProperty.call(AIRCRAFTS, k)) {
        return shallowCloneAircraft(AIRCRAFTS[k]);
      }
      return {};
    }

    /**
     * 将新版 scenes 字段映射为简报渲染使用的统一视图（兼容旧字段名）。
     */
    function normalizeMergedScenario(merged, sceneKey) {
      if (!merged) return null;
      var d = merged;
      if (!d.scene) d.scene = d.displayName || sceneKey || "";
      if (d.compliance && !d.complianceRequirements) {
        d.complianceRequirements = [];
        d.compliance.forEach(function (x) {
          if (x != null && String(x).trim() !== "") d.complianceRequirements.push(x);
        });
      }
      if (d.customerScripts && !d.customerConcerns) {
        var cs = d.customerScripts;
        d.customerConcerns = {
          procurement: { script: cs.procurement != null ? cs.procurement : "" },
          business: { script: cs.business != null ? cs.business : "" },
          leadership: { script: cs.leadership != null ? cs.leadership : "" }
        };
      }
      if (!d.policyTranslations) d.policyTranslations = [];
      if (!d.strategyPrinciples) {
        d.strategyPrinciples = { modularPayload: "", relayMode: "", obliquePath: "", precisionDelivery: "" };
      }
      if (!d.riskWarning) d.riskWarning = {};
      if (d.payloadSceneLabel === undefined) d.payloadSceneLabel = "载重与载荷方案";
      if (d.payloadSceneBody === undefined) d.payloadSceneBody = "";
      if (d.specialBondCompliance === undefined) d.specialBondCompliance = "";
      if (!d.cloudMigration) d.cloudMigration = [];
      if (!d.implementationChecklist) d.implementationChecklist = [];
      if (!d.media) d.media = [];
      if (!d.tenderHints) d.tenderHints = [];
      if (!d.pocDefaults) d.pocDefaults = { kpiLine: "" };

      function ensureKeyRole(a) {
        if (!a || typeof a !== "object") return;
        var kr = a.keyRole;
        var hasKr = kr !== undefined && kr !== null && String(kr).trim() !== "";
        if (!hasKr && a.role !== undefined && a.role !== null && String(a.role).trim() !== "") {
          a.keyRole = a.role;
        }
      }
      if (d.aircraft) {
        ensureKeyRole(d.aircraft.primary);
        ensureKeyRole(d.aircraft.reconnaissance);
        var prim = d.aircraft.primary;
        if (prim && prim.payloadUnit === undefined && typeof prim.maxPayload === "number") {
          prim.payloadUnit = "kg";
        }
      }
      return d;
    }

    /**
     * 合并 scenes（场景描述/政策/流程等）与 aircrafts（机型参数）。
     */
    function buildMergedScenario(sceneKey) {
      if (!SCENES) return null;
      var scene = SCENES[sceneKey];
      if (!scene || typeof scene !== "object") return null;
      var am = scene.aircraftModel || {};
      var pk = am.primary !== undefined && am.primary !== null ? String(am.primary).trim() : "";
      var rk =
        am.reconnaissance !== undefined && am.reconnaissance !== null ? String(am.reconnaissance).trim() : "";
      var merged = {};
      Object.keys(scene).forEach(function (k) {
        if (k === "aircraftModel") return;
        merged[k] = scene[k];
      });
      merged.aircraft = {
        primary: getAircraftByKey(pk),
        reconnaissance: getAircraftByKey(rk)
      };
      return normalizeMergedScenario(merged, sceneKey);
    }

    function getData() {
      var k = getScenarioKey();
      return buildMergedScenario(k);
    }

    function hexToRgb(hex) {
      var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
      if (!m) return { r: 245, g: 158, b: 11 };
      return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    }

    function rgbToHex(r, g, b) {
      return (
        "#" +
        [r, g, b]
          .map(function (x) {
            var h = Math.max(0, Math.min(255, x)).toString(16);
            return h.length === 1 ? "0" + h : h;
          })
          .join("")
      );
    }

    function lightenHex(hex, t) {
      var o = hexToRgb(hex);
      function L(c) {
        return Math.min(255, Math.round(c + (255 - c) * t));
      }
      return rgbToHex(L(o.r), L(o.g), L(o.b));
    }

    function darkenHex(hex, t) {
      var o = hexToRgb(hex);
      function D(c) {
        return Math.max(0, Math.round(c * (1 - t)));
      }
      return rgbToHex(D(o.r), D(o.g), D(o.b));
    }

    function rgbaHex(hex, a) {
      var o = hexToRgb(hex);
      return "rgba(" + o.r + "," + o.g + "," + o.b + "," + a + ")";
    }

    function applyTheme(hex) {
      var h = str(hex);
      if (h === "〔待采购确认〕") h = "#F59E0B";
      document.documentElement.style.setProperty("--theme-color", h);
      document.documentElement.style.setProperty("--title-orange", h);
      var top = lightenHex(h, 0.14);
      var bot = darkenHex(h, 0.06);
      var br = darkenHex(h, 0.2);
      document.documentElement.style.setProperty("--btn-top", top);
      document.documentElement.style.setProperty("--btn-bot", bot);
      document.documentElement.style.setProperty("--btn-border", br);
      document.documentElement.style.setProperty("--btn-shadow", rgbaHex(h, 0.42));
    }

    function applyHeaderFromScenario() {
      var d = getData();
      if (!d) {
        updateMedicalMapSectionVisibility();
        syncSpatialFieldWithScenario();
        return;
      }
      var t = document.getElementById("page-title");
      var s = document.getElementById("page-subtitle");
      if (t) t.textContent = str(d.displayName);
      if (s) s.textContent = str(d.subtitle);
      document.title = str(d.displayName) + " · 解决方案工作台";
      applyTheme(d.themeColor);
      updateMedicalMapSectionVisibility();
      syncSpatialFieldWithScenario();
    }

    function loadScenarioData() {
      /** 方式 1：尝试从 Supabase API 加载场景数据（Vercel 部署后可用） */
      function tryApiFallback() {
        return fetch(API_BASE + "/api/scenes/" + encodeURIComponent(getScenarioKey() || "高楼灭火"))
          .then(function (r) {
            if (!r.ok) throw new Error("api scenes unavailable");
            return r.json();
          })
          .then(function (data) {
            if (data.scene) {
              var sceneMap = {};
              sceneMap[data.scene.name] = data.scene;
              SCENES = sceneMap;
              if (data.intel && data.intel.length) {
                SCENE_INTEL_CACHE[data.scene.name] = { items: data.intel, updated_at: data.meta.updated_at };
              }
            }
            return data;
          })
          .catch(function () {
            return loadStaticFallback();
          });
      }

      /** 方式 2：加载静态 JSON 文件（fallback） */
      function loadStaticFallback() {
        return Promise.all([
          fetch("scenes.json", { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("scenes");
            return r.json();
          }),
          fetch("aircrafts.json", { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("aircrafts");
            return r.json();
          })
        ])
          .then(function (pair) {
            SCENES = pair[0];
            AIRCRAFTS = pair[1];
          })
          .catch(function () {
            var sEl = document.getElementById("scenes-fallback");
            var aEl = document.getElementById("aircrafts-fallback");
            SCENES = sEl ? JSON.parse(sEl.textContent) : {};
            AIRCRAFTS = aEl ? JSON.parse(aEl.textContent) : {};
          });
      }

      /** 始终加载 aircrafts 静态文件 + 尝试 API */
      return fetch("aircrafts.json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (aircrafts) {
          AIRCRAFTS = aircrafts || {};
        })
        .catch(function () {
          var aEl = document.getElementById("aircrafts-fallback");
          AIRCRAFTS = aEl ? JSON.parse(aEl.textContent) : {};
        })
        .then(function () {
          return tryApiFallback();
        });
    }

    function parseWindLimitMs(p) {
      var raw = p && p.windResistance ? String(p.windResistance) : "";
      var m = raw.match(/(\d+(?:\.\d+)?)\s*m\s*\/\s*s/i);
      if (m) return parseFloat(m[1]);
      return 12;
    }

    function escapeHtml(s) {
      var d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }

    function depthHintParagraph(DATA) {
      var h = DATA && DATA.documentDepthHints;
      if (!h || typeof h !== "object") return "";
      var depth = getDocumentDepth();
      var text =
        depth === "overview" ? h.overview : depth === "technical" ? h.technical : h.full;
      if (text == null || String(text).trim() === "") return "";
      return '<p class="briefing-depth-scene-hint">' + escapeHtml(String(text)) + "</p>";
    }

    function primaryOf(DATA) {
      return DATA.aircraft && DATA.aircraft.primary ? DATA.aircraft.primary : {};
    }

    function reconOf(DATA) {
      return DATA.aircraft && DATA.aircraft.reconnaissance ? DATA.aircraft.reconnaissance : {};
    }

    function pickContextualRisk(h, wind, p, DATA) {
      var lim = parseWindLimitMs(p);
      var rw = DATA.riskWarning || {};
      function msg(v) {
        var t = str(v);
        return t === "〔待采购确认〕" ? null : t;
      }
      if (wind > lim) {
        if (h > HEIGHT_TALL_M) return msg(rw.fallingDebris);
        return null;
      }
      if (wind > WIND_HIGH_MS) return msg(rw.windConstraint);
      if (h > HEIGHT_TALL_M) return msg(rw.fallingDebris);
      return msg(rw.thermalLimitation);
    }

    /**
     * 基于当前风速（m/s）的智能风险推演，与场景 riskWarning 等并列展示。
     */
    function buildWindSmartTierHtml(wind) {
      var w = Number(wind);
      var label =
        '<span class="risk-wind-label">情境风险提示 · 智能风速推演</span>';
      if (w > 12) {
        return (
          '<div class="risk-wind-tier risk-wind-tier-red" role="status">' +
          label +
          "⚠️ 当前风速超过FC100抗风上限（12m/s），建议待命或启用系留系统。" +
          "</div>"
        );
      }
      if (w >= 8 && w <= 12) {
        return (
          '<div class="risk-wind-tier risk-wind-tier-orange" role="status">' +
          label +
          "⚠️ 风速较高（8-12m/s），建议缩短单次作业时间至8分钟内，并增加电池冗余。" +
          "</div>"
        );
      }
      return (
        '<div class="risk-wind-tier risk-wind-tier-green" role="status">' +
        label +
        "✅ 风速条件良好（&lt;8m/s），可正常执行作业流程。" +
        "</div>"
      );
    }

    function buildRiskSection(h, wind, p, DATA) {
      var parts = [];
      parts.push(buildWindSmartTierHtml(wind));
      var lim = parseWindLimitMs(p);
      var ctx = pickContextualRisk(h, wind, p, DATA);
      if (ctx) {
        parts.push(
          '<div class="risk-context"><strong>情境风险提示：</strong>' + escapeHtml(ctx) + "</div>"
        );
      }
      if (wind > lim) {
        parts.push(
          '<div class="risk-mandatory">超过 ' +
            escapeHtml(str(p.model)) +
            " 最大抗风等级（" +
            lim +
            "m/s），建议待命，强行作业有坠机风险。</div>"
        );
      } else if (wind <= lim) {
        parts.push(
          '<div class="ok-hint">当前风速 ' +
            escapeHtml(String(wind)) +
            " m/s，未超过 " +
            escapeHtml(str(p.model)) +
            " 抗风上限 " +
            lim +
            " m/s（" +
            escapeHtml(str(p.windResistance)) +
            "）。</div>"
        );
      }
      return parts.join("");
    }

    /**
     * 医疗应急：展示 FC100_Medical 温控/货舱 + 与标准 FC100 一致的基础摘录。
     */
    function renderMedicalRecommendBody(DATA, cfg, h, wind, p) {
      var base = AIRCRAFTS && AIRCRAFTS.FC100;
      var pay = (p && p.payload) || {};
      var parts = [];
      parts.push(
        '<p class="param-line"><strong>任务模式：</strong>医疗物资空运，主运无人机单机执行；无伴飞侦察机配置时以主战机型完成点对点运输。</p>'
      );
      parts.push('<p class="param-line"><strong>主战机型：</strong>' + escapeHtml(str(p.model)) + "</p>");
      parts.push('<div class="payload-scene"><strong>载重与载荷方案（医疗应急）</strong>');
      if (pay.temperatureControl) {
        parts.push(
          '<p style="margin:0.45rem 0 0;line-height:1.6;"><strong>温控货舱：</strong>' +
            escapeHtml(String(pay.temperatureControl)) +
            "</p>"
        );
      }
      if (pay.capacity) {
        parts.push(
          '<p style="margin:0.35rem 0 0;line-height:1.6;"><strong>货舱容量：</strong>' +
            escapeHtml(String(pay.capacity)) +
            "</p>"
        );
      }
      parts.push(
        '<p style="margin:0.4rem 0 0;line-height:1.6;">净载重 <strong>' +
          (typeof p.maxPayload === "number" ? p.maxPayload : escapeHtml(str(p.maxPayload))) +
          "</strong> " +
          escapeHtml(p.payloadUnit || "kg") +
          "（医疗版可用载重）。</p>"
      );
      parts.push("</div>");
      parts.push('<p class="param-line"><strong>续航：</strong>' + escapeHtml(formatEnduranceLine(p)) + "</p>");
      parts.push('<p class="param-line"><strong>抗风能力：</strong>' + escapeHtml(str(p.windResistance)) + "</p>");
      parts.push('<p class="param-line"><strong>防护等级：</strong>' + escapeHtml(str(p.protectionLevel)) + "</p>");
      var rtk = (p && p.rtkAccuracy) || (base && base.rtkAccuracy);
      if (rtk) {
        parts.push(
          '<p class="param-line"><strong>定位精度：</strong>' +
            escapeHtml(String(rtk)) +
            (!(p && p.rtkAccuracy) && base && base.rtkAccuracy ? "（与标准 FC100 一致）" : "") +
            "</p>"
        );
      }
      parts.push('<p class="param-line"><strong>关键约束：</strong>' + escapeHtml(str(p.keyConstraint)) + "</p>");
      if (base) {
        var sling = base.emptyWeight && base.emptyWeight.slingLoad ? base.emptyWeight.slingLoad : "";
        var mtow = p.maxTakeoffWeight != null ? p.maxTakeoffWeight : base.maxTakeoffWeight;
        var vmax = base.speed && base.speed.maxHorizontal ? base.speed.maxHorizontal : "";
        var excerpt =
          "最大起飞重量 " +
          String(mtow) +
          (sling ? "；吊装空重参考 " + sling : "") +
          (vmax ? "；水平最大航速 " + vmax : "");
        parts.push(
          '<p style="margin-top:0.75rem;padding-top:0.65rem;border-top:1px solid rgba(51,65,85,0.5);color:var(--muted);font-size:0.875rem;line-height:1.65;"><strong style="color:var(--text-heading);">与标准 FC100 一致的基础参数（摘录）</strong>：' +
            escapeHtml(excerpt) +
            "。</p>"
        );
      }
      return parts.join("");
    }

    function getDocumentDepth() {
      var ws = window.WorkspaceStore && window.WorkspaceStore.load();
      var d = ws && ws.briefingDocumentDepth;
      if (d === "overview" || d === "technical" || d === "full") return d;
      return "full";
    }

    function sliceSteps(flowSteps, depth) {
      if (depth !== "overview" || !flowSteps || flowSteps.length <= 4) return { steps: flowSteps, truncated: false };
      return { steps: flowSteps.slice(0, 4), truncated: true };
    }

    function renderMedicalRecommendBodyOverview(DATA, cfg, h, wind, p) {
      var parts = [];
      parts.push(
        '<p class="param-line"><strong>任务：</strong>医疗物资点对点运输，温控与时窗为硬约束。</p>'
      );
      parts.push('<p class="param-line"><strong>主战机型：</strong>' + escapeHtml(str(p.model)) + "</p>");
      var pay = (p && p.payload) || {};
      if (pay.temperatureControl) {
        parts.push(
          '<p class="param-line"><strong>温控：</strong>' + escapeHtml(String(pay.temperatureControl)) + "</p>"
        );
      }
      parts.push(
        '<p class="param-line"><strong>抗风 / 关键约束：</strong>' +
          escapeHtml(str(p.windResistance)) +
          "；" +
          escapeHtml(str(p.keyConstraint)) +
          "</p>"
      );
      parts.push(
        '<p class="param-line wb-muted" style="font-size:0.875rem;line-height:1.55;margin:0">详细载荷、续航摘录与航线示意见「全案汇编」。</p>'
      );
      return parts.join("");
    }

    function buildRecommendInnerOverview(
      DATA,
      cfg,
      h,
      wind,
      p,
      rec,
      isMed,
      synergyHtml,
      needM30TFirst,
      payloadScene,
      riskBlock
    ) {
      if (isMed) {
        return renderMedicalRecommendBodyOverview(DATA, cfg, h, wind, p) + riskBlock;
      }
      var parts = [];
      if (needM30TFirst) {
        parts.push(
          '<p class="param-line"><strong>协同提要：</strong>先由 <strong>' +
            escapeHtml(str(rec.model)) +
            "</strong> 侦察时间窗，再由 <strong>" +
            escapeHtml(str(p.model)) +
            "</strong> 执行主任务剖面。</p>"
        );
      } else if (synergyHtml && synergyHtml.indexOf("param-line") !== -1) {
        parts.push(synergyHtml);
      }
      parts.push('<p class="param-line"><strong>主战机型：</strong>' + escapeHtml(str(p.model)) + "</p>");
      parts.push(
        '<p class="param-line"><strong>关键约束：</strong>' + escapeHtml(str(p.keyConstraint)) + "</p>"
      );
      parts.push(
        '<p class="param-line wb-muted" style="font-size:0.875rem;line-height:1.55;margin:0">' +
          escapeHtml(str(DATA.payloadSceneLabel)) +
          " 载荷与配置明细见「全案汇编」。</p>"
      );
      parts.push(riskBlock);
      return parts.join("");
    }

    function buildExecutionPitfallsBlock(DATA, h, wind, p) {
      var lim = parseWindLimitMs(p);
      var parts = [
        '<div class="out-block wb-pitfalls-block"><h2>执行过程 · 技术与协同卡点</h2>',
        '<p class="wb-muted" style="font-size:0.9rem;line-height:1.55">结合当前档位与机型参数，现场侧重核对风速余量、抗风边界与地面协同；细化检查项见上文「关键落地检查项」。</p>'
      ];
      if (wind > WIND_HIGH_MS) {
        parts.push(
          '<p class="pitfall-wind"><strong>风速注意：</strong>当前 ' +
            escapeHtml(String(wind)) +
            " m/s，高于演示参考阈值 " +
            WIND_HIGH_MS +
            " m/s，建议缩短单轮作业并复核航线裕度。</p>"
        );
      }
      if (wind > lim) {
        parts.push(
          '<p class="pitfall-wind pitfall-wind--severe"><strong>抗风边界：</strong>已超过 ' +
            escapeHtml(str(p.model)) +
            " 额定抗风，应触发熔断或备份方案。</p>"
        );
      }
      if (h > HEIGHT_TALL_M && !isMountainScenario()) {
        parts.push(
          '<p class="pitfall-struct"><strong>空间档位：</strong>建筑高度 ' +
            escapeHtml(String(h)) +
            " m 超 " +
            HEIGHT_TALL_M +
            " m 参考档，多机轮替、路径与落点需单独复核。</p>"
        );
      }
      if (isMountainScenario() && h >= 150) {
        parts.push(
          '<p class="pitfall-struct"><strong>搜救范围：</strong>当前为大范围档，格网划分、补给与弱网回传优先级提高。</p>'
        );
      }
      parts.push("</div>");
      return parts.join("");
    }

    function renderPolicyItems(DATA, maxItems) {
      var pb = DATA.policyBasis || [];
      var pt = DATA.policyTranslations || [];
      var out = [];
      for (var i = 0; i < pb.length; i++) {
        if (maxItems != null && out.length >= maxItems) break;
        var ref = str(pb[i]);
        if (ref === "〔待采购确认〕") continue;
        var xlat = i < pt.length ? str(pt[i]) : "〔待采购确认〕";
        var xlatBlock =
          xlat !== "〔待采购确认〕"
            ? '<div class="policy-xlat"><strong>政策解读：</strong>' + escapeHtml(xlat) + "</div>"
            : "";
        out.push(
          '<li class="policy-item">' +
            '<div class="policy-ref">出处与要点：' +
            escapeHtml(ref) +
            "</div>" +
            xlatBlock +
            "</li>"
        );
      }
      return out.join("");
    }

    function formatEnduranceLine(p) {
      if (!p || !p.endurance) return "〔待采购确认〕";
      var e = p.endurance;
      if (typeof e.dualBattery === "string" || typeof e.singleBattery === "string") {
        return "双电 " + str(e.dualBattery) + "；单电 " + str(e.singleBattery);
      }
      if (e.dualBattery && typeof e.dualBattery === "object" && !e.singleBattery) {
        var dbOnly = e.dualBattery;
        return (
          "双电：续航 " +
          str(dbOnly.maxFlightTime) +
          (dbOnly.maxHoverTime ? "，悬停 " + str(dbOnly.maxHoverTime) : "") +
          (dbOnly.maxDistance ? "，航程 " + str(dbOnly.maxDistance) : "")
        );
      }
      if (e.dualBattery && e.singleBattery && typeof e.dualBattery === "object") {
        var db = e.dualBattery;
        var sb = e.singleBattery;
        return (
          "双电：续航 " +
          str(db.maxFlightTime) +
          "，悬停 " +
          str(db.maxHoverTime) +
          "，航程 " +
          str(db.maxDistance) +
          "；单电：续航 " +
          str(sb.maxFlightTime) +
          "，悬停 " +
          str(sb.maxHoverTime) +
          "，航程 " +
          str(sb.maxDistance)
        );
      }
      if (e.maxFlightTime !== undefined || e.maxHoverTime !== undefined || e.maxRange !== undefined) {
        var parts = [];
        if (e.maxFlightTime !== undefined) parts.push("续航 " + str(e.maxFlightTime));
        if (e.maxHoverTime !== undefined) parts.push("悬停 " + str(e.maxHoverTime));
        if (e.maxRange !== undefined) parts.push("航程 " + str(e.maxRange));
        return parts.join("，");
      }
      return str(e);
    }

    function renderBriefingOverviewExtras(DATA, depth) {
      if (depth !== "overview") return "";
      var bul = DATA.briefingOverviewBullets;
      if (!bul || !bul.length) return "";
      var parts = ['<div class="out-block wb-briefing-arch"><h2>速览架构（当前场景）</h2><ul>'];
      bul.forEach(function (line) {
        var t = str(line);
        if (t && t !== "〔待采购确认〕") parts.push("<li>" + escapeHtml(t) + "</li>");
      });
      parts.push("</ul></div>");
      return parts.join("");
    }

    function renderTechCloudAndMedia(DATA, depth) {
      depth = depth || "full";
      var isHr =
        str(DATA.scene) === "高楼灭火" || str(DATA.displayName) === "高楼灭火";
      var cm = DATA.cloudMigration || [];
      var impl = DATA.implementationChecklist || [];
      var hints = DATA.tenderHints || [];
      if (isHr && depth === "technical") {
        if (DATA.cloudMigrationTechnical && DATA.cloudMigrationTechnical.length) {
          cm = DATA.cloudMigrationTechnical;
        }
        if (DATA.implementationChecklistTechnical && DATA.implementationChecklistTechnical.length) {
          impl = DATA.implementationChecklistTechnical;
        }
        if (Object.prototype.hasOwnProperty.call(DATA, "tenderHintsTechnical")) {
          hints = DATA.tenderHintsTechnical || [];
        }
      }
      var media = DATA.media || [];
      var has =
        (cm && cm.length) ||
        (impl && impl.length) ||
        (hints && hints.length) ||
        (media && media.length);
      if (!has) return "";

      var parts = ['<div class="out-block wb-tech-block"><h2>技术实施、上云与招投标要点</h2>'];
      if (cm.length) {
        parts.push("<h3 class=\"wb-subh\">上云 / 网络 / 迁移策略</h3><ul>");
        cm.forEach(function (line) {
          var t = str(line);
          if (t && t !== "〔待采购确认〕") parts.push("<li>" + escapeHtml(t) + "</li>");
        });
        parts.push("</ul>");
      }
      if (impl.length) {
        parts.push("<h3 class=\"wb-subh\">关键落地检查项</h3><ol>");
        impl.forEach(function (line) {
          var t = str(line);
          if (t && t !== "〔待采购确认〕") parts.push("<li>" + escapeHtml(t) + "</li>");
        });
        parts.push("</ol>");
      }
      if (hints.length) {
        parts.push("<h3 class=\"wb-subh\">政采 / 招投标提示（演示稿）</h3><ul>");
        hints.forEach(function (line) {
          var t = str(line);
          if (t && t !== "〔待采购确认〕") parts.push("<li>" + escapeHtml(t) + "</li>");
        });
        parts.push("</ul>");
      }
      var kpi = DATA.pocDefaults && str(DATA.pocDefaults.kpiLine);
      if (kpi && kpi !== "〔待采购确认〕") {
        parts.push(
          '<p class="wb-poc-kpi"><strong>POC 预设 KPI：</strong>' + escapeHtml(kpi) + "</p>"
        );
      }
      if (media.length) {
        parts.push("<h3 class=\"wb-subh\">参考视频 / 材料</h3>");
        if (depth === "technical") {
          var m0 = media[0];
          var u0 = str(m0.url || "#");
          if (!/^https?:\/\//i.test(u0) && u0 !== "#") u0 = "#";
          var t0 = escapeHtml(str(m0.title || "技术视频（占位示例）"));
          parts.push('<div class="wb-media-box">');
          parts.push(
            '<a class="wb-media-video-link" href="' +
              escapeHtml(u0) +
              '" target="_blank" rel="noopener noreferrer">' +
              t0 +
              "</a>"
          );
          parts.push("</div>");
        } else {
          parts.push("<div class=\"wb-media-grid\">");
          media.forEach(function (m) {
            var title = escapeHtml(str(m.title || "参考"));
            var url = str(m.url || "");
            var embed = str(m.embedUrl || "");
            parts.push('<div class="wb-media-card"><p class="wb-media-title">' + title + "</p>");
            if (embed && /^https?:\/\//i.test(embed)) {
              parts.push(
                '<iframe class="wb-embed" src="' +
                  escapeHtml(embed) +
                  '" title="' +
                  title +
                  '" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>'
              );
            }
            if (url) {
              parts.push(
                '<p class="wb-media-link"><a href="' +
                  escapeHtml(url) +
                  '" target="_blank" rel="noopener noreferrer">打开原链接</a></p>'
              );
            }
            parts.push("</div>");
          });
          parts.push("</div>");
        }
      }
      parts.push('<p class="wb-legal-hint">以上内容用于方案演练，不构成法律或招投标专业意见。</p>');
      parts.push("</div>");
      return parts.join("");
    }

    function briefingChrome(DATA) {
      var statusBarHtml =
        '<div class="status-bar"><span class="dot" aria-hidden="true"></span>系统状态：在线 | 场景：' +
        escapeHtml(str(DATA.displayName)) +
        " | 模块：作战简报 · ToB/G 工作台</div>";
      var depthKey = getDocumentDepth();
      var depthLbl = BRIEFING_DEPTH_LABELS[depthKey] || BRIEFING_DEPTH_LABELS.full;
      var mainTitle = depthKey === "full" ? "解决方案" : "作战简报";
      var titleBarHtml =
        '<div class="briefing-title-bar">' +
        '<h2 class="briefing-title">' +
        escapeHtml(mainTitle) +
        "</h2>" +
        '<span class="briefing-depth-pill" title="在右侧「文档深度」可切换">' +
        escapeHtml(depthLbl) +
        "</span>" +
        '<button type="button" class="btn-copy-brief" id="btn-copy" disabled aria-disabled="true">📋 复制简报</button>' +
        "</div>";
      return {
        start:
          '<div class="briefing-wrap card card-brief">' +
          statusBarHtml +
          titleBarHtml +
          '<div id="briefing-body-content" class="panel briefing-body">',
        end: "</div></div>"
      };
    }

    function triggerBriefingPulse() {
      var wrap = document.querySelector("#output .briefing-wrap");
      if (!wrap) return;
      wrap.classList.remove("briefing-pulse");
      void wrap.offsetWidth;
      wrap.classList.add("briefing-pulse");
      clearTimeout(wrap._pulseEndTimer);
      wrap._pulseEndTimer = setTimeout(function () {
        wrap.classList.remove("briefing-pulse");
        wrap._pulseEndTimer = null;
      }, 920);
    }

    /** 与高楼灭火同构：含 cover 的 full 装配订正文；overview/technical 共用 renderHighRise* 管线。 */
    function usesStructuredBriefingDepthTemplates(DATA) {
      if (!DATA || !DATA.briefingDepthTemplates || typeof DATA.briefingDepthTemplates !== "object")
        return false;
      var b = DATA.briefingDepthTemplates;
      if (!b.overview || !b.technical || !b.full) return false;
      var f = b.full;
      if (!f || typeof f !== "object" || !f.cover || typeof f.cover !== "object") return false;
      return true;
    }

    function renderHrParamStrip(DATA, h, wind, cfg, windWorkHint) {
      var note = spatialNoteFromCfg(cfg);
      return (
        '<p class="wb-hrf-meta wb-muted" style="margin:0 0 1rem;font-size:0.9rem;line-height:1.55">场景：<strong>' +
        escapeHtml(str(DATA.scene)) +
        "</strong> · " +
        (isMountainScenario()
          ? "范围档 <strong>" + escapeHtml(str((cfg && cfg.rangeLabel) || "")) + "</strong>"
          : "建筑高度 <strong>" + h + "</strong> 米") +
        " · 风速 <strong>" +
        escapeHtml(String(wind)) +
        "</strong> m/s" +
        (note && str(note) !== "〔待采购确认〕" ? " · " + escapeHtml(str(note)) : "") +
        windWorkHint +
        "</p>"
      );
    }

    function renderHrMultiparagraph(text) {
      var t = str(text);
      if (!t || t === "〔待采购确认〕") return "";
      var chunks = t.split(/\n+/);
      var parts = [];
      for (var i = 0; i < chunks.length; i++) {
        var c = String(chunks[i]).trim();
        if (!c) continue;
        parts.push('<p class="wb-hrf-p">' + escapeHtml(c) + "</p>");
      }
      return parts.join("");
    }

    function renderHrKeyNumbers(items) {
      if (!items || !items.length) return "";
      var out = ['<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">三个关键数字</h3><ul class="wb-hrf-keynums">'];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || typeof it !== "object") continue;
        var lab = str(it.label);
        var tx = str(it.text);
        if (lab === "〔待采购确认〕" && tx === "〔待采购确认〕") continue;
        out.push(
          '<li><span class="wb-hrf-kn-lab">' + escapeHtml(lab) + "</span> " + escapeHtml(tx) + "</li>"
        );
      }
      out.push("</ul></section>");
      return out.join("");
    }

    function renderHrStringListSection(title, arr, tag) {
      tag = tag || "ul";
      if (!arr || !arr.length) return "";
      var out = [
        '<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">' +
          escapeHtml(title) +
          "</h3><" +
          tag +
          ' class="wb-hrf-list">'
      ];
      for (var j = 0; j < arr.length; j++) {
        var line = str(arr[j]);
        if (!line || line === "〔待采购确认〕") continue;
        out.push("<li>" + escapeHtml(line) + "</li>");
      }
      out.push("</" + tag + "></section>");
      return out.join("");
    }

    function renderHrRecommended(items) {
      if (!items || !items.length) return "";
      var out = ['<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">推荐配置</h3><dl class="wb-hrf-dl">'];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || typeof it !== "object") continue;
        var role = str(it.role);
        var det = str(it.detail);
        if (role === "〔待采购确认〕" && det === "〔待采购确认〕") continue;
        out.push("<dt>" + escapeHtml(role) + "</dt><dd>" + escapeHtml(det) + "</dd>");
      }
      out.push("</dl></section>");
      return out.join("");
    }

    function renderHrTechPoints(points) {
      if (!points || !points.length) return "";
      var out = ['<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">关键技术点</h3><ol class="wb-hrf-deep-ol">'];
      for (var i = 0; i < points.length; i++) {
        var pt = points[i];
        if (!pt || typeof pt !== "object") continue;
        var t = str(pt.title);
        var b = str(pt.body);
        if (t === "〔待采购确认〕") continue;
        out.push(
          "<li><strong>" + escapeHtml(t) + '</strong><p class="wb-hrf-p">' + escapeHtml(b) + "</p></li>"
        );
      }
      out.push("</ol></section>");
      return out.join("");
    }

    function renderHrGbBlocks(items) {
      if (!items || !items.length) return "";
      var out = ['<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">GB 46761 / 46750 技术响应</h3>'];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || typeof it !== "object") continue;
        out.push(
          '<div class="wb-hrf-gb"><h4 class="wb-hrf-h4">' +
            escapeHtml(str(it.title)) +
            '</h4><p class="wb-hrf-p">' +
            escapeHtml(str(it.body)) +
            "</p></div>"
        );
      }
      out.push("</section>");
      return out.join("");
    }

    function renderHrFullChapters(fullTpl) {
      fullTpl = fullTpl || {};
      var chapters = fullTpl.chapters;
      if (!chapters || !chapters.length) return "";
      var out = ['<div class="wb-hrf wb-hrf--full-chapters">'];
      out.push('<h2 class="wb-hrf-title">' + escapeHtml(str(fullTpl.title)) + "</h2>");
      out.push('<div class="wb-hrf-intro">' + renderHrMultiparagraph(fullTpl.intro) + "</div>");
      for (var i = 0; i < chapters.length; i++) {
        var ch = chapters[i];
        if (!ch || typeof ch !== "object") continue;
        out.push('<section class="wb-hrf-chap" id="wb-hrf-chap-' + escapeHtml(str(ch.id)) + '">');
        out.push(
          '<h3 class="wb-hrf-chap-h">' +
            escapeHtml(str(ch.stepLabel)) +
            " · " +
            escapeHtml(str(ch.headline)) +
            "</h3>"
        );
        out.push('<p class="wb-hrf-p">' + escapeHtml(str(ch.body)) + "</p>");
        var bulls = ch.bullets;
        if (bulls && bulls.length) {
          out.push('<ul class="wb-hrf-chap-ul">');
          for (var j = 0; j < bulls.length; j++) {
            var bl = str(bulls[j]);
            if (bl && bl !== "〔待采购确认〕") out.push("<li>" + escapeHtml(bl) + "</li>");
          }
          out.push("</ul>");
        }
        out.push("</section>");
      }
      out.push("</div>");
      return out.join("");
    }

    function renderHrOverviewTable(tbl) {
      tbl = tbl || {};
      var headers = tbl.headers;
      var rows = tbl.rows;
      if (!headers || !headers.length || !rows || !rows.length) return "";
      var parts = ['<div class="wb-hrf-table-wrap">'];
      if (str(tbl.caption))
        parts.push(
          '<p class="wb-hrf-table-cap">' + escapeHtml(str(tbl.caption)) + "</p>"
        );
      parts.push('<table class="wb-hrf-table" role="table">');
      parts.push("<thead><tr>");
      for (var h = 0; h < headers.length; h++) {
        parts.push("<th scope=\"col\">" + escapeHtml(str(headers[h])) + "</th>");
      }
      parts.push("</tr></thead><tbody>");
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row || !row.length) continue;
        parts.push("<tr>");
        for (var c = 0; c < row.length; c++) {
          var tag = c === 0 ? "th" : "td";
          var scope = c === 0 ? ' scope="row"' : "";
          parts.push(
            "<" + tag + scope + ">" + escapeHtml(str(row[c])) + "</" + tag + ">"
          );
        }
        parts.push("</tr>");
      }
      parts.push("</tbody></table>");
      if (str(tbl.note))
        parts.push(
          '<p class="wb-hrf-table-note wb-muted">' + escapeHtml(str(tbl.note)) + "</p>"
        );
      parts.push("</div>");
      return parts.join("");
    }

    function renderHrOverviewFigure(fig) {
      if (!fig || typeof fig !== "object") return "";
      var src = str(fig.src);
      var alt = str(fig.alt);
      var cap = str(fig.caption);
      if (!src) {
        return (
          '<figure class="wb-hrf-figure wb-hrf-fig-placeholder" role="group">' +
          '<div class="wb-hrf-fig-ph-inner">' +
          escapeHtml(
            cap ||
              "【插图位】将《无人机高楼灭火解决方案》PPT 关键页导出为 PNG，填入本段 JSON 的 figure.src（支持 https 或站点相对路径）。"
          ) +
          "</div></figure>"
        );
      }
      return (
        '<figure class="wb-hrf-figure" role="group">' +
        '<img src="' +
        escapeHtml(src) +
        '" alt="' +
        escapeHtml(alt || cap) +
        '" loading="lazy" decoding="async" />' +
        (cap
          ? '<figcaption class="wb-hrf-fig-cap">' + escapeHtml(cap) + "</figcaption>"
          : "") +
        "</figure>"
      );
    }

    function renderHrOverviewSection(sec) {
      if (!sec || typeof sec !== "object") return "";
      var hid = escapeHtml(str(sec.id));
      var hh = str(sec.heading);
      if (!hh || hh === "〔待采购确认〕") return "";
      var parts = [];
      parts.push(
        '<section class="wb-hrf-sec wb-hrf-sec--ppt" id="wb-hrf-ov-' + hid + '">'
      );
      parts.push(
        '<h3 class="wb-hrf-h3">' + escapeHtml(hh) + "</h3>"
      );
      var lead = str(sec.lead);
      if (lead && lead !== "〔待采购确认〕") {
        parts.push('<p class="wb-hrf-lead">' + escapeHtml(lead) + "</p>");
      }
      var paras = sec.paragraphs;
      if (paras && paras.length) {
        for (var p = 0; p < paras.length; p++) {
          var para = str(paras[p]);
          if (!para || para === "〔待采购确认〕") continue;
          parts.push('<p class="wb-hrf-p">' + escapeHtml(para) + "</p>");
        }
      }
      if (sec.table) parts.push(renderHrOverviewTable(sec.table));
      if (sec.figure) parts.push(renderHrOverviewFigure(sec.figure));
      var bulls = sec.bullets;
      if (bulls && bulls.length) {
        parts.push('<ul class="wb-hrf-list">');
        for (var b = 0; b < bulls.length; b++) {
          var bl = str(bulls[b]);
          if (!bl || bl === "〔待采购确认〕") continue;
          parts.push("<li>" + escapeHtml(bl) + "</li>");
        }
        parts.push("</ul>");
      }
      parts.push("</section>");
      return parts.join("");
    }

    function mapFullDeliverableText(s) {
      return str(s);
    }

    /** 决策速览「我方方案」内锚点高亮 + 脚标上标，文案不改字仅包层 */
    function formatDecisionSolutionSummaryHtml(raw) {
      var t = escapeHtml(String(raw).trim());
      t = t.replace(
        /约3分钟级快反节拍¹/g,
        '<span class="wb-db-anch-badge">约3分钟级快反节拍</span><sup class="wb-db-sup">¹</sup>'
      );
      return t;
    }

    function splitCapabilityTagBody(line) {
      var s = String(line);
      var idx = s.indexOf("：");
      if (idx === -1) idx = s.indexOf(":");
      if (idx === -1) return { tag: s, body: "" };
      return {
        tag: s.slice(0, idx).trim(),
        body: s.slice(idx + 1).trim()
      };
    }

    function renderDecisionBriefOrgTable(db) {
      var org = db.orgTable;
      if (org && org.length) {
        var tb = [
          '<div class="wb-db-table-wrap">',
          '<table class="wb-db-table" role="table">',
          "<thead><tr>",
          '<th scope="col">平台类型</th>',
          '<th scope="col">功能</th>',
          '<th scope="col">数量</th>',
          "</tr></thead><tbody>"
        ];
        for (var ri = 0; ri < org.length; ri++) {
          var r = org[ri];
          if (!r || typeof r !== "object") continue;
          var stripe = ri % 2 === 1 ? ' class="wb-db-tr--alt"' : "";
          tb.push(
            "<tr" +
              stripe +
              "><td>" +
              escapeHtml(str(r.platform)) +
              "</td><td>" +
              escapeHtml(str(r.duty)) +
              "</td><td>" +
              escapeHtml(str(r.qty)) +
              "</td></tr>"
          );
        }
        tb.push("</tbody></table></div>");
        return tb.join("");
      }
      var lines = db.configLines || [];
      if (!lines.length) return "";
      var tb2 = [
        '<div class="wb-db-table-wrap">',
        '<table class="wb-db-table wb-db-table--legacy" role="table">',
        "<thead><tr>",
        '<th scope="col">平台类型</th>',
        '<th scope="col">功能</th>',
        '<th scope="col">数量</th>',
        "</tr></thead><tbody>"
      ];
      for (var li = 0; li < lines.length; li++) {
        var row = lines[li];
        if (!row || typeof row !== "object") continue;
        var ty = str(row.type);
        var plat = ty;
        var duty = "—";
        var cidx = ty.indexOf("：");
        if (cidx === -1) cidx = ty.indexOf(":");
        if (cidx !== -1) {
          plat = ty.slice(0, cidx).trim();
          duty = ty.slice(cidx + 1).trim();
        }
        var stripe2 = li % 2 === 1 ? ' class="wb-db-tr--alt"' : "";
        tb2.push(
          "<tr" +
            stripe2 +
            "><td>" +
            escapeHtml(plat === "〔待采购确认〕" ? "—" : plat) +
            "</td><td>" +
            escapeHtml(duty === "〔待采购确认〕" ? "—" : duty) +
            "</td><td>" +
            escapeHtml(str(row.qty)) +
            "</td></tr>"
        );
      }
      tb2.push("</tbody></table></div>");
      return tb2.join("");
    }

    var WB_DB_CAP_ICONS = [
      '<svg class="wb-db-cap-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>',
      '<svg class="wb-db-cap-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.48 12.35c-1.57-3.07-4.55-5.35-8.03-5.93v2.13c2.89.48 5.21 2.63 6.05 5.35l1.98-3.55zM12 4C7 4 2.73 7.11 1 11.5 2.73 15.89 7 19 12 19s9.27-3.11 11-7.5C21.27 7.11 17 4 12 4zm0 13c-3.03 0-5.5-2.47-5.5-5.5S8.97 6 12 6s5.5 2.47 5.5 5.5S15.03 17 12 17z"/></svg>',
      '<svg class="wb-db-cap-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
    ];

    function renderDecisionBriefOnePager(tpl, chrome, DATA) {
      var db = tpl.decisionBrief;
      if (!db || typeof db !== "object") return "";
      if (!str(db.coreConflict)) return "";
      var solRaw = db.solutionSummary;
      var hasSol =
        solRaw !== undefined && solRaw !== null && String(solRaw).trim() !== "";
      var parts = [chrome.start];
      parts.push('<article class="wb-hrf wb-hrf--onepager wb-db-doc">');
      parts.push(
        '<h2 class="wb-hrf-title wb-db-doc-title">' + escapeHtml(str(tpl.title)) + "</h2>"
      );
      parts.push('<div class="wb-db-shell">');
      parts.push('<section class="wb-db-hero" aria-label="核心摘要">');
      parts.push('<div class="wb-db-hero-accent" aria-hidden="true"></div>');
      parts.push('<div class="wb-db-hero-body">');
      parts.push(
        '<h3 class="wb-db-subhead"><span class="wb-db-circ" aria-hidden="true">①</span> 场景核心矛盾</h3>'
      );
      parts.push(
        '<p class="wb-db-hero-p">' + escapeHtml(str(db.coreConflict)) + "</p>"
      );
      if (hasSol) {
        parts.push(
          '<h3 class="wb-db-subhead wb-db-subhead--follow"><span class="wb-db-circ" aria-hidden="true">②</span> 我方方案</h3>'
        );
        parts.push(
          '<p class="wb-db-hero-p wb-db-hero-p--solution">' +
            formatDecisionSolutionSummaryHtml(String(solRaw).trim()) +
            "</p>"
        );
      }
      parts.push("</div></section>");
      parts.push('<section class="wb-db-section wb-db-section--caps" aria-label="核心能力">');
      parts.push(
        '<h3 class="wb-db-sec-title"><span class="wb-db-circ" aria-hidden="true">③</span> 核心能力</h3>'
      );
      parts.push('<div class="wb-db-cap-grid">');
      var caps = db.capabilities || [];
      for (var ci = 0; ci < caps.length; ci++) {
        var capLine = caps[ci];
        if (capLine == null || String(capLine).trim() === "") continue;
        var split = splitCapabilityTagBody(capLine);
        var icon = WB_DB_CAP_ICONS[ci] || WB_DB_CAP_ICONS[0];
        parts.push('<div class="wb-db-cap-card">');
        parts.push('<div class="wb-db-cap-card__hd">' + icon + "</div>");
        parts.push(
          '<div class="wb-db-cap-card__tag">' + escapeHtml(split.tag) + "</div>"
        );
        if (split.body) {
          parts.push(
            '<p class="wb-db-cap-card__body">' + escapeHtml(split.body) + "</p>"
          );
        }
        parts.push("</div>");
      }
      parts.push("</div></section>");
      var tw = db.timeWindowNarrative;
      var hasTw = tw !== undefined && tw !== null && String(tw).trim() !== "";
      if (hasTw) {
        parts.push('<section class="wb-db-section wb-db-section--rhythm">');
        parts.push(
          '<h3 class="wb-db-sec-title"><span class="wb-db-circ" aria-hidden="true">◇</span>关键节奏</h3>'
        );
        parts.push(
          '<p class="wb-db-rhythm-p">' + escapeHtml(String(tw).trim()) + "</p>"
        );
        parts.push("</section>");
      }
      var orgHtml = renderDecisionBriefOrgTable(db);
      if (orgHtml) {
        parts.push('<section class="wb-db-section wb-db-section--table" aria-label="最小作战编成">');
        parts.push(
          '<h3 class="wb-db-sec-title"><span class="wb-db-circ" aria-hidden="true">④</span> 最小作战编成</h3>'
        );
        parts.push(orgHtml);
        parts.push("</section>");
      }
      parts.push('<section class="wb-db-compliance" aria-label="安全与合规底线">');
      parts.push(
        '<span class="wb-db-compliance-kicker">合规承诺</span><div class="wb-db-compliance-hd">'
      );
      parts.push(
        '<svg class="wb-db-shield" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>'
      );
      parts.push(
        '<h3 class="wb-db-compliance-title"><span class="wb-db-circ" aria-hidden="true">⑤</span> 安全与合规底线</h3></div>'
      );
      parts.push(
        '<p class="wb-db-compliance-body">' +
          escapeHtml(str(db.complianceOneLiner)) +
          "</p>"
      );
      parts.push("</section>");
      parts.push('<section class="wb-db-actions" aria-label="需贵局明确的下一步">');
      parts.push(
        '<h3 class="wb-db-sec-title"><span class="wb-db-circ" aria-hidden="true">⑥</span> 需贵局明确的下一步</h3>'
      );
      parts.push('<ol class="wb-db-act-list">');
      var nx = db.authorityNextSteps || [];
      var actMarks = ["①", "②", "③", "④"];
      for (var ni = 0; ni < nx.length; ni++) {
        var mark = actMarks[ni] || String(ni + 1);
        parts.push(
          '<li class="wb-db-act-item"><span class="wb-db-act-num" aria-hidden="true">' +
            mark +
            '</span><span class="wb-db-act-txt">' +
            escapeHtml(str(nx[ni])) +
            "</span></li>"
        );
      }
      parts.push("</ol></section>");
      parts.push("</div>");
      var fnRaw = tpl.footerNote;
      if (
        fnRaw !== undefined &&
        fnRaw !== null &&
        String(fnRaw).trim() !== "" &&
        String(fnRaw).trim() !== "〔待采购确认〕"
      ) {
        parts.push(
          '<p class="wb-db-doc-footnote">' + escapeHtml(String(fnRaw).trim()) + "</p>"
        );
      }
      parts.push("</article>");
      parts.push(chrome.end);
      return parts.join("");
    }

    function renderHrWhitepaperTechnical(tpl, chrome, DATA, riskBlock, h, wind, cfg, windWorkHint, p) {
      tpl = tpl || {};
      var phases = tpl.phases;
      var techCloud = renderTechCloudAndMedia(DATA, "technical");
      var pitfalls = buildExecutionPitfallsBlock(DATA, h, wind, p);
      var parts = [
        chrome.start,
        depthHintParagraph(DATA),
        '<article class="wb-hrf wb-hrf--technical wb-hrf--whitepaper">',
        '<h2 class="wb-hrf-title">' + escapeHtml(str(tpl.title)) + "</h2>"
      ];
      parts.push(renderHrParamStrip(DATA, h, wind, cfg, windWorkHint));
      var pre = str(tpl.preamble);
      if (pre && pre !== "〔待采购确认〕") {
        parts.push('<p class="wb-hrf-p wb-wp-lead">' + escapeHtml(pre) + "</p>");
      }
      var disc = str(tpl.dataDisclaimerGlobal);
      if (disc && disc !== "〔待采购确认〕") {
        parts.push(
          '<p class="wb-hrf-p wb-wp-disclaimer">' + escapeHtml(disc) + "</p>"
        );
      }
      if (phases && phases.length) {
        for (var pi = 0; pi < phases.length; pi++) {
          var ph = phases[pi];
          if (!ph || typeof ph !== "object") continue;
          parts.push('<section class="wb-hrf-sec wb-wp-phase">');
          parts.push(
            '<h3 class="wb-hrf-h3">' +
              escapeHtml(str(ph.sectionNo) + " " + str(ph.title)) +
              "</h3>"
          );
          var blocks = [
            { k: "problem", lab: "问题" },
            { k: "logic", lab: "技术逻辑" },
            { k: "implementation", lab: "实现方式" },
            { k: "operationPoints", lab: "操作要点" }
          ];
          for (var bi = 0; bi < blocks.length; bi++) {
            var bk = blocks[bi];
            var tx = str(ph[bk.k]);
            if (!tx || tx === "〔待采购确认〕") continue;
            parts.push(
              '<p class="wb-hrf-p"><strong class="wb-wp-prelab">' +
                escapeHtml(bk.lab) +
                "。</strong>" +
                escapeHtml(tx) +
                "</p>"
            );
          }
          if (ph.simplifiedTable) {
            parts.push(renderHrOverviewTable(ph.simplifiedTable));
          }
          var fts = ph.fieldTips;
          if (fts && fts.length) {
            parts.push('<p class="wb-wp-tip-intro"><strong>实战技巧。</strong></p><ul class="wb-hrf-list">');
            for (var fi = 0; fi < fts.length; fi++) {
              var ft = str(fts[fi]);
              if (!ft || ft === "〔待采购确认〕") continue;
              parts.push("<li>" + escapeHtml(ft) + "</li>");
            }
            parts.push("</ul>");
          }
          var ql = str(ph.quantityLine);
          if (ql && ql !== "〔待采购确认〕") {
            parts.push(
              '<p class="wb-hrf-p wb-wp-qtynote wb-muted">' + escapeHtml(ql) + "</p>"
            );
          }
          parts.push("</section>");
        }
      }
      var cn = str(tpl.closingNote);
      if (cn && cn !== "〔待采购确认〕") {
        parts.push('<p class="wb-hrf-footnote wb-muted">' + escapeHtml(cn) + "</p>");
      }
      var gloss = tpl.glossary;
      if (gloss && gloss.length) {
        parts.push(
          '<section class="wb-hrf-sec wb-wp-glossary"><h3 class="wb-hrf-h3">关键术语解释</h3><dl class="wb-hrf-dl">'
        );
        for (var gi = 0; gi < gloss.length; gi++) {
          var g = gloss[gi];
          if (!g || typeof g !== "object") continue;
          parts.push(
            "<dt>" + escapeHtml(str(g.term)) + "</dt><dd>" + escapeHtml(str(g.definition)) + "</dd>"
          );
        }
        parts.push("</dl></section>");
      }
      parts.push(techCloud);
      parts.push(pitfalls);
      parts.push(riskBlock);
      parts.push("</article>");
      parts.push(chrome.end);
      return parts.join("");
    }

    function renderHrDeliverableShell(full) {
      full = full || {};
      var parts = [];
      var cov = full.cover || {};
      parts.push('<div class="wb-deliverable wb-deliv-shell">');
      parts.push('<header class="wb-deliv-cover">');
      var docTitle =
        full.deliverableTitle != null ? String(full.deliverableTitle).trim() : "";
      if (docTitle !== "" && docTitle !== "〔待采购确认〕") {
        parts.push(
          '<h1 class="wb-deliv-doc-title">' + escapeHtml(docTitle) + "</h1>"
        );
      }
      parts.push(
        '<p class="wb-deliv-cover-meta">编制单位：' +
          escapeHtml(str(cov.organization)) +
          "</p>"
      );
      var appSc =
        cov.applicableScene !== undefined && cov.applicableScene !== null
          ? String(cov.applicableScene).trim()
          : "";
      if (appSc !== "") {
        parts.push(
          '<p class="wb-deliv-cover-meta">适用场景：' +
            escapeHtml(appSc) +
            "</p>"
        );
      } else if (cov.scenarioName != null && String(cov.scenarioName).trim() !== "") {
        parts.push(
          '<p class="wb-deliv-cover-meta">场景：' +
            escapeHtml(str(cov.scenarioName)) +
            "</p>"
        );
      }
      parts.push(
        '<p class="wb-deliv-cover-meta">版本号：' + escapeHtml(str(cov.version)) + "</p>"
      );
      parts.push(
        '<p class="wb-deliv-cover-meta">编制日期：' + escapeHtml(str(cov.dateText)) + "</p>"
      );
      parts.push("</header>");
      var dc = full.documentControl;
      if (dc && dc.rows && dc.rows.length) {
        parts.push('<section class="wb-deliv-sec"><h2 class="wb-deliv-h2">文档控制页</h2>');
        parts.push('<table class="wb-hrf-table wb-deliv-dc" role="table"><tbody>');
        for (var di = 0; di < dc.rows.length; di++) {
          var dr = dc.rows[di];
          if (!dr || dr.length < 2) continue;
          parts.push(
            "<tr><th scope=\"row\">" +
              escapeHtml(str(dr[0])) +
              "</th><td>" +
              escapeHtml(str(dr[1])) +
              "</td></tr>"
          );
        }
        parts.push("</tbody></table></section>");
      }
      var toc = full.tableOfContents;
      if (toc && toc.length) {
        parts.push('<section class="wb-deliv-sec"><h2 class="wb-deliv-h2">目录</h2><ol class="wb-deliv-toc">');
        for (var ti = 0; ti < toc.length; ti++) {
          var titem = toc[ti];
          if (!titem || typeof titem !== "object") continue;
          parts.push(
            '<li class="wb-deliv-toc-item"><span class="wb-deliv-toc-num">' +
              escapeHtml(str(titem.num)) +
              '</span><span class="wb-deliv-toc-title">' +
              escapeHtml(str(titem.title)) +
              "</span></li>"
          );
        }
        parts.push("</ol></section>");
      }
      var prefaceTitle = full.prefaceTitle != null ? String(full.prefaceTitle).trim() : "";
      var prefaceParas = full.prefaceParagraphs;
      var discRaw = full.disclaimerBox;
      var hasPreface =
        (prefaceParas && prefaceParas.length) ||
        (discRaw != null && String(discRaw).trim() !== "");
      if (hasPreface) {
        var pft = prefaceTitle || "前言与编制说明";
        parts.push(
          '<section class="wb-deliv-sec wb-deliv-preface"><h2 class="wb-deliv-h2">' +
            escapeHtml(pft) +
            "</h2>"
        );
        if (prefaceParas && prefaceParas.length) {
          for (var pxi = 0; pxi < prefaceParas.length; pxi++) {
            var px = str(prefaceParas[pxi]);
            if (!px || px === "〔待采购确认〕") continue;
            parts.push('<p class="wb-deliv-p">' + escapeHtml(px) + "</p>");
          }
        }
        if (discRaw != null) {
          var dss = String(discRaw).trim();
          if (dss !== "" && dss !== "〔待采购确认〕") {
            parts.push('<aside class="wb-deliv-disclaimer" role="note">');
            parts.push('<p class="wb-deliv-disclaimer-kicker">声明框：</p>');
            parts.push(
              '<p class="wb-deliv-disclaimer-p">' + escapeHtml(dss) + "</p></aside>"
            );
          }
        }
        parts.push("</section>");
      }
      var es = str(full.executiveSummary);
      if (!hasPreface && es && es !== "〔待采购确认〕") {
        parts.push(
          '<section class="wb-deliv-sec"><h2 class="wb-deliv-h2">前言 · 决策摘要</h2><p class="wb-deliv-p">' +
            escapeHtml(es) +
            "</p></section>"
        );
      }
      var bch = full.bodyChapters;
      if (bch && bch.length) {
        for (var bi = 0; bi < bch.length; bi++) {
          var ch = bch[bi];
          if (!ch || typeof ch !== "object") continue;
          parts.push(
            '<section class="wb-deliv-chap" id="wb-deliv-chap-' +
              escapeHtml(String(bi + 1)) +
              '">'
          );
          var chNo = ch.chapterNo != null ? String(ch.chapterNo).trim() : "";
          var chTi = ch.title != null ? String(ch.title).trim() : "";
          var h2Line = chNo && chTi ? chNo + " " + chTi : chNo || chTi;
          parts.push(
            '<h2 class="wb-deliv-h2">' + escapeHtml(h2Line) + "</h2>"
          );
          var chIntro = ch.intro;
          if (chIntro != null && String(chIntro).trim() !== "") {
            parts.push('<p class="wb-deliv-p">' + escapeHtml(String(chIntro).trim()) + "</p>");
          }
          var secs = ch.sections || [];
          for (var si = 0; si < secs.length; si++) {
            var sec = secs[si];
            if (!sec || typeof sec !== "object") continue;
            var sh = sec.heading != null ? String(sec.heading).trim() : "";
            if (sh !== "") {
              parts.push(
                '<h3 class="wb-deliv-h3">' + escapeHtml(sh) + "</h3>"
              );
            }
            var sps = sec.paragraphs;
            if (sps && sps.length) {
              for (var pj = 0; pj < sps.length; pj++) {
                var spx = str(sps[pj]);
                if (!spx || spx === "〔待采购确认〕") continue;
                parts.push('<p class="wb-deliv-p">' + escapeHtml(spx) + "</p>");
              }
            } else if (sec.body != null && String(sec.body).trim() !== "") {
              parts.push(
                '<p class="wb-deliv-p">' + escapeHtml(String(sec.body).trim()) + "</p>"
              );
            }
          }
          parts.push("</section>");
        }
      }
      var aps = full.appendices;
      if (aps && aps.length) {
        for (var ai = 0; ai < aps.length; ai++) {
          var ap = aps[ai];
          if (!ap || typeof ap !== "object") continue;
          parts.push(
            '<section class="wb-deliv-appendix" id="wb-deliv-ap-' +
              escapeHtml(String(ai + 1)) +
              '">'
          );
          parts.push(
            '<h2 class="wb-deliv-h2">' +
              escapeHtml(str(ap.appendixNo) + " " + str(ap.title)) +
              "</h2>"
          );
          var apsParas = ap.paragraphs;
          if (apsParas && apsParas.length) {
            for (var pi = 0; pi < apsParas.length; pi++) {
              var para = str(apsParas[pi]);
              if (!para) continue;
              parts.push('<p class="wb-deliv-p">' + escapeHtml(para) + "</p>");
            }
          }
          if (ap.lawTable) parts.push(renderHrOverviewTable(ap.lawTable));
          if (ap.detailTable) parts.push(renderHrOverviewTable(ap.detailTable));
          parts.push("</section>");
        }
      }
      parts.push("</div>");
      return parts.join("");
    }

    function renderHighRiseOverview(tpl, chrome, DATA, riskBlock, h, wind, cfg, windWorkHint) {
      tpl = tpl || {};
      if (tpl.decisionBrief && typeof tpl.decisionBrief === "object") {
        var onePg = renderDecisionBriefOnePager(tpl, chrome, DATA);
        if (onePg) return onePg;
      }
      var ovSec = tpl.overviewSections;
      if (ovSec && ovSec.length) {
        var bodyParts = [
          chrome.start,
          depthHintParagraph(DATA),
          '<article class="wb-hrf wb-hrf--overview wb-hrf--overview-ppt">',
          '<h2 class="wb-hrf-title">' + escapeHtml(str(tpl.title)) + "</h2>"
        ];
        var sub = str(tpl.overviewSubtitle);
        if (sub && sub !== "〔待采购确认〕") {
          bodyParts.push('<p class="wb-hrf-overview-sub wb-muted">' + escapeHtml(sub) + "</p>");
        }
        bodyParts.push(renderHrParamStrip(DATA, h, wind, cfg, windWorkHint));
        for (var si = 0; si < ovSec.length; si++) {
          bodyParts.push(renderHrOverviewSection(ovSec[si]));
        }
        bodyParts.push(
          '<p class="wb-hrf-footnote wb-muted">' + escapeHtml(str(tpl.footerNote)) + "</p>"
        );
        bodyParts.push(riskBlock);
        bodyParts.push("</article>");
        bodyParts.push(chrome.end);
        return bodyParts.join("");
      }
      var parts = [
        chrome.start,
        depthHintParagraph(DATA),
        '<article class="wb-hrf wb-hrf--overview">',
        '<h2 class="wb-hrf-title">' + escapeHtml(str(tpl.title)) + "</h2>",
        renderHrParamStrip(DATA, h, wind, cfg, windWorkHint),
        '<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">一句话场景定义</h3><p class="wb-hrf-p">' +
          escapeHtml(str(tpl.oneLiner)) +
          "</p></section>",
        '<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">核心价值主张</h3><p class="wb-hrf-p">' +
          escapeHtml(str(tpl.valueProposition)) +
          "</p></section>",
        renderHrKeyNumbers(tpl.keyNumbers),
        renderHrStringListSection("作战时间线", tpl.timeline, "ol"),
        renderHrRecommended(tpl.recommendedConfig),
        renderHrStringListSection("合规要点", tpl.complianceShort, "ul"),
        '<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">真实案例</h3><p class="wb-hrf-p">' +
          escapeHtml(str(tpl.caseStudy)) +
          "</p></section>",
        '<p class="wb-hrf-footnote wb-muted">' + escapeHtml(str(tpl.footerNote)) + "</p>",
        riskBlock,
        "</article>",
        chrome.end
      ];
      return parts.join("");
    }

    function renderHighRiseTechnical(tpl, chrome, DATA, riskBlock, h, wind, cfg, windWorkHint, p) {
      tpl = tpl || {};
      if (tpl.phases && tpl.phases.length) {
        return renderHrWhitepaperTechnical(tpl, chrome, DATA, riskBlock, h, wind, cfg, windWorkHint, p);
      }
      var techCloud = renderTechCloudAndMedia(DATA, "technical");
      var pitfalls = buildExecutionPitfallsBlock(DATA, h, wind, p);
      var parts = [
        chrome.start,
        depthHintParagraph(DATA),
        '<article class="wb-hrf wb-hrf--technical">',
        '<h2 class="wb-hrf-title">' + escapeHtml(str(tpl.title)) + "</h2>",
        renderHrParamStrip(DATA, h, wind, cfg, windWorkHint),
        '<section class="wb-hrf-sec"><h3 class="wb-hrf-h3">技术架构图说明文字</h3>' +
          renderHrMultiparagraph(tpl.architectureNarrative) +
          "</section>",
        renderHrTechPoints(tpl.keyTechnologyPoints),
        renderHrGbBlocks(tpl.gbTechnicalResponse),
        '<p class="wb-hrf-footnote wb-muted">' + escapeHtml(str(tpl.closingNote)) + "</p>",
        techCloud,
        pitfalls,
        riskBlock,
        "</article>",
        chrome.end
      ];
      return parts.join("");
    }

    function renderHighRiseFull(tpl, chrome, DATA, riskBlock, h, wind, cfg, windWorkHint, p, flowSteps, compliance, cc) {
      tpl = tpl || {};
      // 调用方传入的是 briefingDepthTemplates.full 本身；若误传整个 templates 则取 .full
      var full = tpl.cover ? tpl : tpl.full && tpl.full.cover ? tpl.full : {};
      if (full.cover) {
        return (
          chrome.start +
          '<article class="wb-hrf wb-hrf--full-doc wb-hrf--full-doc-only">' +
          renderHrDeliverableShell(full) +
          "</article>" +
          chrome.end
        );
      }
      var techCloud = renderTechCloudAndMedia(DATA, "full");
      var flowSlice = sliceSteps(flowSteps, "full");
      var customerBlock =
        '<div class="out-block"><h2>客户沟通要点</h2>' +
        '<div class="quote-box quote-procurement"><span class="quote-label">采购 / 合规</span><p class="quote-text">' +
        escapeHtml(str((cc.procurement || {}).script)) +
        "</p></div>" +
        '<div class="quote-box quote-business"><span class="quote-label">业务 / KPI</span><p class="quote-text">' +
        escapeHtml(str((cc.business || {}).script)) +
        "</p></div>" +
        '<div class="quote-box quote-leadership"><span class="quote-label">领导 / 试点</span><p class="quote-text">' +
        escapeHtml(str((cc.leadership || {}).script)) +
        "</p></div></div>";
      var hints = DATA.tenderHints || [];
      var hintLi = [];
      for (var hi = 0; hi < hints.length; hi++) {
        var ht = str(hints[hi]);
        if (ht && ht !== "〔待采购确认〕") hintLi.push("<li>" + escapeHtml(ht) + "</li>");
      }
      var tenderBlock =
        hintLi.length > 0
          ? '<div class="out-block"><h2>招投标与商务要点</h2><ul>' + hintLi.join("") + "</ul></div>"
          : "";
      var flowOl = flowSlice.steps
        .map(function (t) {
          return "<li>" + escapeHtml(t) + "</li>";
        })
        .join("");
      var compLi = compliance
        .map(function (t) {
          return "<li>" + escapeHtml(t) + "</li>";
        })
        .join("");
      var parts = [
        chrome.start,
        depthHintParagraph(DATA),
        renderHrFullChapters(tpl),
        '<div class="out-block"><h2>政策依据</h2><ul style="list-style:none;padding-left:0;">',
        renderPolicyItems(DATA, null),
        "</ul></div>",
        techCloud,
        '<div class="out-block"><h2>参数与工况</h2>',
        renderHrParamStrip(DATA, h, wind, cfg, windWorkHint),
        "</div>",
        '<div class="out-block"><h2>作业流程（时序全文）</h2><ol>' + flowOl + "</ol></div>",
        '<div class="out-block"><h2>合规要点（全文）</h2><ul>' + compLi + "</ul></div>",
        customerBlock,
        tenderBlock,
        riskBlock,
        chrome.end
      ];
      return parts.join("");
    }

    function renderExecute() {
      var DATA = getData();
      if (!DATA) return;

      var h = readHeightMeters();
      var windRaw = document.getElementById("wind").value.trim();
      var wind = windRaw === "" ? NaN : parseFloat(windRaw);

      var out = document.getElementById("output");
      var chrome = briefingChrome(DATA);

      if (Number.isNaN(wind) || wind < 0) {
        out.innerHTML =
          chrome.start +
          '<p style="margin:0;color:var(--warn);">请输入有效的当前风速（≥0 的数字，单位：米/秒）。</p>' +
          chrome.end;
        setBriefingActionsEnabled(true);
        if (isMedicalScenario()) clearMedicalPolyline();
        triggerBriefingPulse();
        window.dispatchEvent(new CustomEvent("briefing:rendered", { detail: { ok: false } }));
        return;
      }

      var cfg = getSpatialConfigForRender(h);
      var p = primaryOf(DATA);
      var limMs = parseWindLimitMs(p);
      var windWorkHint = "";
      if (wind > limMs) {
        windWorkHint =
          '<span class="wb-wind-work-hint"> <strong>作业时间建议：</strong>已超过机型额定抗风，宜待命、改系留或转地面泵组，勿强行续航作业。</span>';
      } else if (wind > WIND_HIGH_MS) {
        windWorkHint =
          '<span class="wb-wind-work-hint"> <strong>作业时间建议：</strong>风速偏高，建议压缩单次连续滞空、加密轮替与熔断点复查；电池模式下注意 12 min 级悬停窗与航线裕度。</span>';
      }

      var rec = reconOf(DATA);
      var isMed = isMedicalScenario();

      var flowSteps = (DATA.operationFlow || []).map(function (step) {
        return str(step);
      }).filter(function (line) {
        return line !== "〔待采购确认〕";
      });
      var compliance = (DATA.complianceRequirements || []).map(function (row) {
        return str(row);
      }).filter(function (line) {
        return line !== "〔待采购确认〕";
      });
      var bond = str(DATA.specialBondCompliance);
      if (bond !== "〔待采购确认〕") compliance.push(bond);

      var cc = DATA.customerConcerns || {};

      var needM30TFirst = h > HEIGHT_TALL_M || wind > WIND_HIGH_MS;

      var synergyHtml = "";
      if (!isMed) {
        synergyHtml = needM30TFirst
          ? '<div class="synergy-box"><h3>协同策略 · 侦察先行</h3>' +
            (isMountainScenario()
              ? "<p>因<strong>搜救作业范围处于约 20 km²（大范围）档</strong>或<strong>风速 &gt; " +
                WIND_HIGH_MS +
                " m/s</strong>触发：须先由 <strong>"
              : "<p>因<strong>建筑高度 &gt; " +
                HEIGHT_TALL_M +
                " 米</strong>或<strong>风速 &gt; " +
                WIND_HIGH_MS +
                " m/s</strong>触发：须先由 <strong>") +
            escapeHtml(str(rec.model)) +
            "</strong> 建立侦察时间窗，再释放主战机型 <strong>" +
            escapeHtml(str(p.model)) +
            "</strong> 进入任务剖面。</p>" +
            "<p><strong>侦察能力：</strong>热成像 " +
            escapeHtml(str(rec.thermalResolution)) +
            "；可见光 " +
            escapeHtml(str(rec.zoomCapability)) +
            "；续航参考 " +
            escapeHtml(str(rec.endurance)) +
            "。</p>" +
            "<p><strong>战术要点：</strong>" +
            escapeHtml(str(rec.keyRole)) +
            "。</p></div>"
          : '<p class="param-line"><strong>侦察协同（标准）：</strong>' +
            escapeHtml(str(rec.model)) +
            " — " +
            escapeHtml(str(rec.keyRole)) +
            "</p>";
      }

      var payloadScene =
        '<div class="payload-scene"><strong>' +
        escapeHtml(str(DATA.payloadSceneLabel)) +
        "</strong>" +
        " 净载重 " +
        (typeof p.maxPayload === "number" ? p.maxPayload : escapeHtml(str(p.maxPayload))) +
        " " +
        escapeHtml(str(p.payloadUnit)) +
        "。" +
        escapeHtml(str(DATA.payloadSceneBody)) +
        " 载荷模块化：" +
        escapeHtml(str((DATA.strategyPrinciples || {}).modularPayload)) +
        "</div>";

      var riskBlock = buildRiskSection(h, wind, p, DATA);

      var stratLine;
      if (isMed) {
        stratLine =
          "以温控与航时为硬约束，保障血液/药品在规定温区与时窗内送达；起飞前完成货舱预冷并与接收端确认卸货窗口。";
      } else {
        var strat = DATA.strategyPrinciples || {};
        var relay = str(strat.relayMode);
        var oblique = str(strat.obliquePath);
        var stratParts = [];
        if (relay !== "〔待采购确认〕") stratParts.push(relay);
        if (oblique !== "〔待采购确认〕") stratParts.push(oblique);
        stratLine = stratParts.length ? stratParts.join("；") : "";
      }

      var flowStrategyFooter = stratLine
        ? '<p style="color:var(--muted);font-size:0.875rem;margin-top:0.5rem;line-height:1.6;">策略要点：' +
          escapeHtml(stratLine) +
          "</p>"
        : "";

      var depth = getDocumentDepth();

      if (usesStructuredBriefingDepthTemplates(DATA)) {
        var hrt = DATA.briefingDepthTemplates;
        var hrHtml;
        if (depth === "overview") {
          hrHtml = renderHighRiseOverview(hrt.overview, chrome, DATA, riskBlock, h, wind, cfg, windWorkHint);
        } else if (depth === "technical") {
          hrHtml = renderHighRiseTechnical(hrt.technical, chrome, DATA, riskBlock, h, wind, cfg, windWorkHint, p);
        } else {
          hrHtml = renderHighRiseFull(
            hrt.full,
            chrome,
            DATA,
            riskBlock,
            h,
            wind,
            cfg,
            windWorkHint,
            p,
            flowSteps,
            compliance,
            cc
          );
        }
        out.innerHTML = hrHtml;
        setBriefingActionsEnabled(true);
        if (isMedicalScenario()) {
          drawMedicalSupplyRoute();
        }
        triggerBriefingPulse();
        window.dispatchEvent(
          new CustomEvent("briefing:rendered", {
            detail: { ok: true, wind: wind, height: h }
          })
        );
        return;
      }

      var recommendInner;
      if (depth === "overview") {
        if (isMed) {
          recommendInner = renderMedicalRecommendBodyOverview(DATA, cfg, h, wind, p) + riskBlock;
        } else {
          recommendInner = buildRecommendInnerOverview(
            DATA,
            cfg,
            h,
            wind,
            p,
            rec,
            isMed,
            synergyHtml,
            needM30TFirst,
            payloadScene,
            riskBlock
          );
        }
      } else if (isMed) {
        recommendInner = renderMedicalRecommendBody(DATA, cfg, h, wind, p) + riskBlock;
      } else {
        recommendInner =
          synergyHtml +
          '<p class="param-line"><strong>主战机型：</strong>' +
          escapeHtml(str(p.model)) +
          "</p>" +
          payloadScene +
          '<p class="param-line"><strong>续航：</strong>' +
          escapeHtml(formatEnduranceLine(p)) +
          "</p>" +
          '<p class="param-line"><strong>抗风能力：</strong>' +
          escapeHtml(str(p.windResistance)) +
          "</p>" +
          '<p class="param-line"><strong>防护等级：</strong>' +
          escapeHtml(str(p.protectionLevel)) +
          "</p>" +
          '<p class="param-line"><strong>定位精度：</strong>' +
          escapeHtml(str(p.rtkAccuracy)) +
          "</p>" +
          (!isMountainScenario() && h > HEIGHT_TALL_M
            ? '<p class="param-line"><strong>RTK 配置建议：</strong>百米以上外立面与精度敏感投送，建议默认启用 RTK 固定解或 D-RTK 基站/网络模式，并与地面基准点联合校验。</p>'
            : "") +
          '<p class="param-line"><strong>关键约束：</strong>' +
          escapeHtml(str(p.keyConstraint)) +
          "</p>" +
          riskBlock;
      }

      var flowSlice = sliceSteps(flowSteps, depth);
      var policyMax = depth === "overview" ? 2 : null;
      var complianceUse =
        depth === "overview" ? compliance.slice(0, Math.min(2, compliance.length)) : compliance;

      var techAndPitfalls = "";
      if (depth === "technical" || depth === "full") {
        techAndPitfalls = renderTechCloudAndMedia(DATA, depth);
      }
      if (depth === "technical") {
        techAndPitfalls += buildExecutionPitfallsBlock(DATA, h, wind, p);
      }

      var policyMore =
        depth === "overview"
          ? '<p class="policy-more-hint wb-muted" style="font-size:0.8125rem;margin:0.5rem 0 0;line-height:1.5">完整的政策条文与解读见「全案汇编」。</p>'
          : "";

      var customerBlock;
      if (depth === "overview") {
        var proc = str((cc.procurement || {}).script);
        var bus = str((cc.business || {}).script);
        var lead = str((cc.leadership || {}).script);
        var gist = [proc, bus, lead]
          .filter(function (x) {
            return x && x !== "〔待采购确认〕";
          })
          .slice(0, 2)
          .join(" ");
        if (!gist) gist = "—";
        customerBlock =
          '<div class="out-block"><h2>沟通提要</h2><p class="quote-text" style="margin:0;line-height:1.65">' +
          escapeHtml(gist) +
          '</p><p class="wb-muted" style="font-size:0.8125rem;margin:0.75rem 0 0;line-height:1.5">采购 / 业务 / 领导分层口径全文见「全案汇编」。</p></div>';
      } else {
        customerBlock =
          '<div class="out-block"><h2>客户沟通要点</h2>' +
          '<div class="quote-box quote-procurement"><span class="quote-label">采购 / 合规</span><p class="quote-text">' +
          escapeHtml(str((cc.procurement || {}).script)) +
          "</p></div>" +
          '<div class="quote-box quote-business"><span class="quote-label">业务 / KPI</span><p class="quote-text">' +
          escapeHtml(str((cc.business || {}).script)) +
          "</p></div>" +
          '<div class="quote-box quote-leadership"><span class="quote-label">领导 / 试点</span><p class="quote-text">' +
          escapeHtml(str((cc.leadership || {}).script)) +
          "</p></div></div>";
      }

      var html = [
        chrome.start,
        depthHintParagraph(DATA),
        renderBriefingOverviewExtras(DATA, depth),
        '<div class="out-block"><h2>政策依据</h2><ul style="list-style:none;padding-left:0;">',
        renderPolicyItems(DATA, policyMax),
        "</ul></div>",
        policyMore,
        techAndPitfalls,
        '<div class="out-block"><h2>推荐配置</h2>',
        "<p style=\"margin:0 0 0.75rem;color:var(--muted);font-size:0.9375rem;line-height:1.6;\">场景：<strong>" +
          escapeHtml(str(DATA.scene)) +
          "</strong>；" +
          (isMountainScenario()
            ? "搜救作业范围（平面尺度）<strong>" +
              escapeHtml(str((cfg && cfg.rangeLabel) || "")) +
              "</strong>"
            : "目标建筑高度 <strong>" + h + " 米</strong>") +
          "；现场风速 <strong>" +
          escapeHtml(String(wind)) +
          " m/s</strong>。" +
          escapeHtml(spatialNoteFromCfg(cfg)) +
          windWorkHint +
          "</p>",
        recommendInner,
        "</div>",
        '<div class="out-block"><h2>作业流程</h2><ol>',
        ...flowSlice.steps.map(function (t) {
          return "<li>" + escapeHtml(t) + "</li>";
        }),
        flowSlice.truncated
          ? '<li class="wb-flow-ellipsis">… 后续步骤与系统对接细节见「全案汇编」。</li>'
          : "",
        "</ol>",
        flowStrategyFooter,
        "</div>",
        '<div class="out-block"><h2>合规要点</h2><ul>',
        ...complianceUse.map(function (t) {
          return "<li>" + escapeHtml(t) + "</li>";
        }),
        depth === "overview" && compliance.length > complianceUse.length
          ? '<li class="wb-flow-ellipsis">… 其余合规项见「全案汇编」。</li>'
          : "",
        "</ul></div>",
        customerBlock,
        chrome.end
      ].join("");

      out.innerHTML = html;
      setBriefingActionsEnabled(true);
      if (isMedicalScenario()) {
        drawMedicalSupplyRoute();
      }
      triggerBriefingPulse();
      window.dispatchEvent(
        new CustomEvent("briefing:rendered", {
          detail: { ok: true, wind: wind, height: h }
        })
      );
    }

    function render() {
      var btn = document.getElementById("btn");
      if (!btn || btn.getAttribute("aria-busy") === "true") return;
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
      btn.innerHTML =
        '<span class="btn-generate-inner" role="status" aria-live="polite"><span class="btn-spinner" aria-hidden="true"></span><span>生成中...</span></span>';

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          try {
            renderExecute();
          } finally {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            btn.textContent = "生成方案";
          }
        });
      });
    }

    function generateWithAI() {
      var btn = document.getElementById("btn-ai");
      if (!btn || btn.getAttribute("aria-busy") === "true") return;

      var DATA = getData();
      if (!DATA) return;

      var topic = str(DATA.displayName) + " - " + str(DATA.primaryScenario || "");
      var h = readHeightMeters();
      var windRaw = document.getElementById("wind").value.trim();
      var wind = windRaw === "" ? NaN : parseFloat(windRaw);

      var extraParts = [
        "场景：" + str(DATA.displayName),
        "作业高度：" + h + "m",
        Number.isNaN(wind) ? "" : "当前风速：" + wind + "m/s"
      ].filter(Boolean);
      var extra = extraParts.join("；");

      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
      btn.innerHTML =
        '<span class="btn-generate-inner" role="status" aria-live="polite"><span class="btn-spinner" aria-hidden="true"></span><span>AI 生成中...</span></span>';

      fetch(GENERATE_API_BASE + "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic,
          industry: "低空经济",
          audience: "政府",
          extra_context: extra,
          scene_name: str(DATA.displayName)
        }),
        signal: (function () {
          var ctrl = new AbortController();
          setTimeout(function () { ctrl.abort(); }, 120_000);
          return ctrl.signal;
        })()
      })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (t) {
              throw new Error("API " + res.status + ": " + (t || "").slice(0, 200));
            });
          }
          return res.json();
        })
        .then(function (result) {
          var out = document.getElementById("output");
          var chrome = briefingChrome(DATA);
          var metaHtml =
            '<p class="ai-meta" style="font-size:0.8rem;color:var(--muted);margin:0 0 1rem 0;">' +
            "模型：" + escapeHtml(result.meta?.model || "deepseek-chat") +
            " | Token：" + (result.meta?.input_tokens || 0) + "→" + (result.meta?.output_tokens || 0) +
            " | 预估费用：¥" + (result.meta?.cost_est_cny || 0).toFixed(4) +
            "</p>";
          out.innerHTML =
            chrome.start +
            metaHtml +
            '<div class="proposal-content" style="white-space:pre-wrap;line-height:1.8;">' +
            escapeHtml(result.proposal || "") +
            "</div>" +
            chrome.end;
          setBriefingActionsEnabled(true);
          triggerBriefingPulse();
          window.dispatchEvent(
            new CustomEvent("briefing:rendered", {
              detail: { ok: true, ai: true }
            })
          );
        })
        .catch(function (err) {
          var out = document.getElementById("output");
          var chrome = briefingChrome(DATA);
          out.innerHTML =
            chrome.start +
            '<p style="margin:0;color:var(--warn);">AI 生成失败：' +
            escapeHtml(err.message || "未知错误") +
            (err.name === "AbortError" ? "（请求超时）" : "") +
            "</p>" +
            chrome.end;
          setBriefingActionsEnabled(true);
          triggerBriefingPulse();
          window.dispatchEvent(
            new CustomEvent("briefing:rendered", { detail: { ok: false } })
          );
        })
        .finally(function () {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
          btn.textContent = "AI 生成方案";
        });
    }

    function setBriefingActionsEnabled(on) {
      var ex = document.getElementById("btn-export");
      if (ex) {
        ex.disabled = !on;
        ex.setAttribute("aria-disabled", on ? "false" : "true");
      }
      var cp = document.getElementById("btn-copy");
      if (cp) {
        cp.disabled = !on;
        cp.setAttribute("aria-disabled", on ? "false" : "true");
      }
    }

    function fallbackCopyText(text, onDone) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(ta);
      if (onDone) onDone();
    }

    function copyBriefingPlainText() {
      var wrap = document.querySelector("#output .briefing-wrap");
      if (!wrap) return;
      var status = wrap.querySelector(".status-bar");
      var title = wrap.querySelector(".briefing-title");
      var body = document.getElementById("briefing-body-content");
      var lines = [];
      if (status) lines.push(status.innerText.replace(/\s+/g, " ").trim());
      lines.push("");
      if (title) lines.push(title.innerText.trim());
      lines.push("");
      if (body) lines.push(body.innerText.trim());
      var text = lines.join("\n");
      if (!text.trim()) return;

      var btn = document.getElementById("btn-copy");
      var orig = btn ? btn.textContent : "📋 复制简报";

      function showDone() {
        if (!btn) return;
        btn.textContent = "✅ 已复制";
        setTimeout(function () {
          btn.textContent = orig;
        }, 2000);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showDone).catch(function () {
          fallbackCopyText(text, showDone);
        });
      } else {
        fallbackCopyText(text, showDone);
      }
    }

    function formatTimestampForFile() {
      var d = new Date();
      function pad(n) {
        return (n < 10 ? "0" : "") + n;
      }
      return (
        d.getFullYear() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        "_" +
        pad(d.getHours()) +
        pad(d.getMinutes())
      );
    }

    function safeFileName(s) {
      return String(s).replace(/[\\/:*?"<>|]/g, "_");
    }

    /**
     * html2canvas 对 color-mix()、部分 CSS 变量解析不稳定；导出前将简报卡片内主题色内联，
     * 导出后根据 stash 恢复原有 style 属性。
     */
    function injectBriefingThemeForExport(root, hex, stash) {
      var seen = new WeakSet();
      if (!root || !hex) return;
      function pin(el, props) {
        if (!el) return;
        if (stash && !seen.has(el)) {
          stash.push({ el: el, attr: el.getAttribute("style") });
          seen.add(el);
        }
        Object.keys(props).forEach(function (k) {
          el.style.setProperty(k, props[k]);
        });
      }
      var t = hex;
      var r = function (a) {
        return rgbaHex(t, a);
      };
      var accentTone = lightenHex(t, 0.12);

      pin(root, {
        border: "1px solid " + r(0.42),
        "box-shadow":
          "0 0 0 1px " +
          r(0.15) +
          ", 0 0 36px " +
          r(0.14) +
          ", 0 16px 48px rgba(0,0,0,0.42), inset 0 1px 0 rgba(248,250,252,0.04)"
      });

      root.querySelectorAll(".status-bar").forEach(function (el) {
        pin(el, {
          border: "1px solid " + r(0.35),
          "box-shadow": "inset 0 1px 0 rgba(248,250,252,0.05), 0 0 14px " + r(0.14)
        });
      });

      root.querySelectorAll(".briefing-title").forEach(function (el) {
        pin(el, { color: t });
      });

      root.querySelectorAll(".btn-copy-brief").forEach(function (el) {
        pin(el, {
          border: "1px solid " + r(0.38),
          "box-shadow": "0 0 12px " + r(0.2),
          background: "rgba(11, 17, 32, 0.55)"
        });
      });

      root.querySelectorAll(".briefing-title-bar").forEach(function (el) {
        pin(el, { "border-bottom-color": r(0.28) });
      });

      root.querySelectorAll(".briefing-body.panel").forEach(function (el) {
        pin(el, {
          border: "1px solid " + r(0.22),
          background: "rgba(11, 17, 32, 0.35)"
        });
      });

      root.querySelectorAll(".out-block h2").forEach(function (el) {
        pin(el, { color: t });
      });

      root.querySelectorAll(".policy-xlat").forEach(function (el) {
        pin(el, {
          "border-left": "3px solid " + t,
          background: "rgba(56, 189, 248, 0.07)"
        });
      });

      root.querySelectorAll(".policy-xlat strong").forEach(function (el) {
        pin(el, { color: accentTone });
      });

      root.querySelectorAll(".synergy-box").forEach(function (el) {
        pin(el, {
          border: "1px solid " + r(0.38),
          background:
            "linear-gradient(135deg, " + r(0.14) + ", rgba(56, 189, 248, 0.06))"
        });
      });

      root.querySelectorAll(".synergy-box h3").forEach(function (el) {
        pin(el, { color: t });
      });
    }

    function restoreBriefingExportStyles(stash) {
      stash.forEach(function (item) {
        if (!item || !item.el) return;
        if (item.attr === null || item.attr === undefined) item.el.removeAttribute("style");
        else item.el.setAttribute("style", item.attr);
      });
      stash.length = 0;
    }

    function exportBriefingPng() {
      if (typeof html2canvas === "undefined") {
        alert("无法加载 html2canvas 库，请连接网络后刷新页面重试。");
        return;
      }
      var target = document.querySelector("#output .briefing-wrap");
      if (!target) {
        alert("请先生成作战简报，再导出。");
        return;
      }
      var d = getData();
      var themeHex = d && d.themeColor ? String(d.themeColor).trim() : "#F59E0B";
      if (str(themeHex) === "〔待采购确认〕") themeHex = "#F59E0B";
      if (themeHex.charAt(0) !== "#") themeHex = "#" + themeHex;
      if (!/^#[0-9a-fA-F]{6}$/.test(themeHex)) themeHex = "#F59E0B";

      applyTheme(themeHex);

      var btn = document.getElementById("btn-export");
      var prevText = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "正在生成图片…";
      }

      var stash = [];
      injectBriefingThemeForExport(target, themeHex, stash);

      function runCapture() {
        return html2canvas(target, {
          scale: 2,
          backgroundColor: "#0b1120",
          useCORS: true,
          logging: false,
          onclone: function (doc) {
            var cloneRoot = doc.querySelector(".briefing-wrap");
            if (cloneRoot) injectBriefingThemeForExport(cloneRoot, themeHex, null);
          }
        });
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          runCapture()
            .then(function (canvas) {
              return new Promise(function (resolve) {
                canvas.toBlob(function (blob) {
                  resolve(blob);
                }, "image/png");
              });
            })
            .then(function (blob) {
              if (!blob) throw new Error("无法生成图片数据");
              var name = d ? safeFileName(str(d.displayName)) : "作战简报";
              var url = URL.createObjectURL(blob);
              var a = document.createElement("a");
              a.href = url;
              a.download = name + "_作战简报_" + formatTimestampForFile() + ".png";
              a.rel = "noopener";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            })
            .catch(function (err) {
              console.error(err);
              alert("导出失败：" + (err && err.message ? err.message : "请稍后重试"));
            })
            .finally(function () {
              restoreBriefingExportStyles(stash);
              if (btn) btn.textContent = prevText || "导出简报（PNG）";
              setBriefingActionsEnabled(true);
            });
        });
      });
    }

    document.getElementById("output").addEventListener("click", function (e) {
      var copyBtn = e.target && e.target.closest && e.target.closest("#btn-copy");
      if (copyBtn) {
        e.preventDefault();
        copyBriefingPlainText();
      }
    });

    /** 和风天气 · 青岛市（实况 windSpeed 为 km/h，换算为 m/s） */
    var QWEATHER_LOCATION_QINGDAO = "101120201";

    function fetchQingdaoWindSpeedMs() {
      var url =
        "/api/weather?location=" +
        encodeURIComponent(QWEATHER_LOCATION_QINGDAO);
      return fetch(url, { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("http");
          return r.json();
        })
        .then(function (data) {
          if (!data || String(data.code) !== "200" || !data.now) throw new Error("api");
          var ws = data.now.windSpeed;
          if (ws === undefined || ws === null || String(ws).trim() === "") throw new Error("wind");
          var kmh = parseFloat(ws);
          if (isNaN(kmh)) throw new Error("nan");
          return kmh / 3.6;
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
      loadAmap();
      loadScenarioData().then(function () {
        applyHeaderFromScenario();
        prefetchSceneIntel(getScenarioKey());
        document.getElementById("scenario").addEventListener("change", function () {
          applyHeaderFromScenario();
          prefetchSceneIntel(getScenarioKey());
          var out = document.getElementById("output");
          if (out) out.innerHTML = "";
          setBriefingActionsEnabled(false);
          var ws = window.WorkspaceStore && window.WorkspaceStore.load();
          if (ws) {
            ws.selectedScenarioId = getScenarioKey();
            window.WorkspaceStore.save(ws);
          }
        });
        document.getElementById("btn").addEventListener("click", render);
        document.getElementById("btn-ai").addEventListener("click", generateWithAI);
        document.getElementById("btn-export").addEventListener("click", exportBriefingPng);
        initWindBeaufortControls();
        initBriefingVideoPlayOverlay();
        var hSel = document.getElementById("height");
        if (hSel) {
          hSel.addEventListener("change", function () {
            updateHeightCustomRowVisibility();
            scheduleRebriefDebounced();
          });
        }
        var hCust = document.getElementById("height-custom-m");
        if (hCust) {
          hCust.addEventListener("input", scheduleRebriefDebounced);
          hCust.addEventListener("change", scheduleRebriefDebounced);
        }
        document.getElementById("wind").addEventListener("keydown", function (e) {
          if (e.key === "Enter") render();
        });
        var btnWind = document.getElementById("btn-wind-now");
        if (btnWind) {
          var btnWindLabel = "🌬️ 获取实时风速";
          btnWind.addEventListener("click", function () {
            var btn = document.getElementById("btn-wind-now");
            var windInp = document.getElementById("wind");
            if (!btn || !windInp) return;
            btn.disabled = true;
            btn.textContent = "获取中...";
            fetchQingdaoWindSpeedMs()
              .then(function (ms) {
                windInp.value = (Math.round(ms * 10) / 10).toFixed(1);
                syncBeaufortSelectFromWindInput();
                windInp.dispatchEvent(new Event("input", { bubbles: true }));
              })
              .catch(function () {
                alert("获取风速失败，请手动输入");
              })
              .finally(function () {
                btn.disabled = false;
                btn.textContent = btnWindLabel;
              });
          });
        }
        if (window.Workbench && typeof window.Workbench.init === "function") {
          window.Workbench.init();
        }
        window.addEventListener("briefing:rendered", function (ev) {
          var d = ev && ev.detail;
          if (!d || !d.ok) return;
          try {
            if (!window.matchMedia("(max-width: 900px)").matches) return;
          } catch (e) {
            return;
          }
          var out = document.getElementById("output");
          if (!out || !out.querySelector(".briefing-wrap")) return;
          var reduced = false;
          try {
            reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          } catch (e2) {}
          requestAnimationFrame(function () {
            out.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
          });
        });
      });
    });

    window.BriefingApp = {
      loadScenarioData: loadScenarioData,
      getScenarioKey: getScenarioKey,
      getData: getData,
      render: render,
      applyHeaderFromScenario: applyHeaderFromScenario,
      buildMergedScenario: buildMergedScenario,
      safeFileName: safeFileName,
      formatTimestampForFile: formatTimestampForFile,
      reRenderBriefingIfReady: function () {
        if (!document.getElementById("briefing-body-content")) return;
        var wEl = document.getElementById("wind");
        var windRaw = wEl ? String(wEl.value).trim() : "";
        var wind = windRaw === "" ? NaN : parseFloat(windRaw);
        if (Number.isNaN(wind) || wind < 0) return;
        renderExecute();
      },
      getDocumentDepth: getDocumentDepth
    };
})();
