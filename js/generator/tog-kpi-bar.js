/**
 * 政务指挥台 · 首屏 KPI 速读条（与 briefing / 工作区联动）
 */
(function (global) {
  var WIND_REF_HIGH = 8;

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
    var sel = document.getElementById("height");
    var lbl = document.getElementById("height-field-label");
    if (!sel) return "—";
    if (lbl && /搜救|范围|半径|距离/.test(lbl.textContent || "")) {
      var optR = sel.options[sel.selectedIndex];
      var textR = optR ? optR.text : String(sel.value);
      return textR;
    }
    if (sel.value === "other") {
      var c = document.getElementById("height-custom-m");
      var m = c ? parseInt(String(c.value).trim(), 10) : NaN;
      if (!isNaN(m)) return "其他 " + m + " m";
      return "其他（待填米数）";
    }
    var opt = sel.options[sel.selectedIndex];
    return opt ? opt.text : String(sel.value);
  }

  function refresh() {
    var sceneEl = document.getElementById("page-title");
    var kScene = document.getElementById("tog-kpi-scene");
    var kSp = document.getElementById("tog-kpi-spatial");
    var kCmp = document.getElementById("tog-kpi-compare");
    var kRec = document.getElementById("tog-kpi-rec-solution");
    var hint = document.getElementById("tog-kpi-hint");

    if (kScene) kScene.textContent = sceneEl ? sceneEl.textContent.replace(/\s+/g, " ").trim() : "—";
    if (kSp) kSp.textContent = spatialLabel();

    var ws = global.WorkspaceStore ? global.WorkspaceStore.load() : null;
    if (kCmp) kCmp.textContent = weightedForRecommended(ws);

    /* 推荐方案：从 workspace 的 comparison 结果取推荐行名称 */
    if (kRec) {
      var name = "—";
      if (ws && ws.comparison && ws.comparison.recommendedRowId) {
        var row = findRow(ws.comparison.rows, ws.comparison.recommendedRowId);
        if (row && row.name) name = row.name;
      }
      kRec.textContent = name;
    }

    if (hint) {
      var hasBrief = !!document.querySelector("#output #briefing-body-content");
      hint.textContent = hasBrief
        ? "简报已生成。参数为演示估算，请以实际方案为准。"
        : "在右侧选择场景与参数，点击生成方案。";
    }
  }

  function init() {
    refresh();
    ["height", "scenario"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", refresh);
    });
    var hCustom = document.getElementById("height-custom-m");
    if (hCustom) {
      hCustom.addEventListener("input", refresh);
      hCustom.addEventListener("change", refresh);
    }
    var budgetEl = document.getElementById("budget");
    if (budgetEl) budgetEl.addEventListener("change", refresh);
    window.addEventListener("briefing:rendered", refresh);
    window.addEventListener("workbench:scenario-change", refresh);
    window.addEventListener("workspace:updated", refresh);
  }

  global.TogKpiBar = {
    refresh: refresh,
    getComparisonScore: function () {
      var ws = global.WorkspaceStore ? global.WorkspaceStore.load() : null;
      var s = weightedForRecommended(ws);
      return s !== "—" ? parseFloat(s) : null;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
