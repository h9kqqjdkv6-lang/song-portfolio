/**
 * 政务指挥台 · 首屏 KPI 速读条（与 briefing / 工作区联动）
 */
(function (global) {
  var WIND_REF_HIGH = 8;

  function $(id) {
    return document.getElementById(id);
  }

  function parseWindLimit() {
    if (global.BriefingApp && global.BriefingApp.getData) {
      var d = global.BriefingApp.getData();
      if (d && d.aircraft && d.aircraft.primary) {
        var raw = d.aircraft.primary.windResistance ? String(d.aircraft.primary.windResistance) : "";
        var m = raw.match(/(\d+(?:\.\d+)?)\s*m\s*\/\s*s/i);
        if (m) return parseFloat(m[1]);
      }
    }
    return 12;
  }

  function windTier(windMs, limitMs) {
    if (windMs == null || isNaN(windMs)) {
      return { key: "na", label: "待填", cls: "" };
    }
    if (windMs > limitMs) {
      return { key: "high", label: "高负荷", cls: "is-high" };
    }
    if (windMs > WIND_REF_HIGH) {
      return { key: "mid", label: "注意", cls: "is-mid" };
    }
    return { key: "ok", label: "正常", cls: "is-ok" };
  }

  function findRow(rows, id) {
    for (var i = 0; rows && i < rows.length; i++) {
      if (rows[i].id === id) return rows[i];
    }
    return null;
  }

  function weightedForRecommended(ws) {
    var comp = ws && ws.comparison;
    if (!comp || !comp.rows || !comp.columns || !comp.rows.length) return "—";
    var row = findRow(comp.rows, comp.recommendedRowId) || comp.rows[0];
    if (!row) return "—";
    var sum = 0;
    var wsum = 0;
    for (var j = 0; j < comp.columns.length; j++) {
      var c = comp.columns[j];
      var w = typeof c.weight === "number" ? c.weight : 1;
      var sc = row.scores && row.scores[c.id] != null ? Number(row.scores[c.id]) : NaN;
      if (!isNaN(sc)) {
        sum += sc * w;
        wsum += w;
      }
    }
    if (wsum <= 0) return "—";
    return (sum / wsum).toFixed(2);
  }

  function spatialLabel() {
    var sel = $("height");
    var lbl = $("height-field-label");
    if (!sel) return "—";
    if (lbl && /搜救|范围/.test(lbl.textContent || "")) {
      var optR = sel.options[sel.selectedIndex];
      var textR = optR ? optR.text : String(sel.value);
      return "范围 " + textR;
    }
    if (sel.value === "other") {
      var c = $("height-custom-m");
      var m = c ? parseInt(String(c.value).trim(), 10) : NaN;
      if (!isNaN(m)) return "其他 " + m + " m";
      return "其他（待填米数）";
    }
    var opt = sel.options[sel.selectedIndex];
    return opt ? opt.text : String(sel.value);
  }

  function refresh() {
    var sceneEl = $("page-title");
    var kScene = $("tog-kpi-scene");
    var kSp = $("tog-kpi-spatial");
    var kWind = $("tog-kpi-wind");
    var kTier = $("tog-kpi-wind-tier");
    var kCmp = $("tog-kpi-compare");
    var kRev = $("tog-kpi-revision");
    var hint = $("tog-kpi-hint");

    if (kScene) kScene.textContent = sceneEl ? sceneEl.textContent.replace(/\s+/g, " ").trim() : "—";
    if (kSp) kSp.textContent = spatialLabel();

    var windIn = $("wind");
    var windRaw = windIn && String(windIn.value).trim();
    var wind = windRaw === "" ? NaN : parseFloat(windRaw);
    var lim = parseWindLimit();
    if (kWind && kTier) {
      if (isNaN(wind)) {
        kWind.textContent = "—";
        kTier.textContent = "—";
        kTier.setAttribute("data-tier", "na");
        kTier.className = "tog-kpi-badge";
      } else {
        kWind.textContent = wind.toFixed(1);
        var t = windTier(wind, lim);
        kTier.textContent = t.label;
        kTier.setAttribute("data-tier", t.key);
        kTier.className = "tog-kpi-badge " + t.cls;
      }
    }

    var ws = global.WorkspaceStore ? global.WorkspaceStore.load() : null;
    if (kRev) kRev.textContent = ws && ws.revision != null ? String(ws.revision) : "—";
    if (kCmp) kCmp.textContent = weightedForRecommended(ws);

    if (hint) {
      var hasBrief = !!document.querySelector("#output #briefing-body-content");
      hint.textContent = hasBrief
        ? "简报已生成。风速档位为演示估算，请以现场观测与机型手册为准。"
        : "请先在右侧填写风速并点击「生成方案」。";
    }
  }

  function init() {
    refresh();
    ["height", "scenario"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", refresh);
    });
    var hCustom = $("height-custom-m");
    if (hCustom) {
      hCustom.addEventListener("input", refresh);
      hCustom.addEventListener("change", refresh);
    }
    var windEl = $("wind");
    if (windEl) {
      windEl.addEventListener("input", refresh);
      windEl.addEventListener("change", refresh);
    }
    window.addEventListener("briefing:rendered", refresh);
    window.addEventListener("workbench:scenario-change", refresh);
    window.addEventListener("workspace:updated", refresh);
  }

  global.TogKpiBar = { refresh: refresh };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
