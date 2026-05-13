/**
 * 解决方案工作台：步骤导航、解决方案面板与政务风栏目区
 */
(function (global) {
  var UAM_PACK = null;

  function $(id) {
    return document.getElementById(id);
  }

  function loadPack() {
    return fetch("solution-packs/uam-core.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("pack");
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  function ensureDefaults(ws, pack) {
    var WS = global.WorkspaceStore;
    var changed = false;
    if (!pack) return false;
    var needCompare =
      !ws.comparison ||
      !Array.isArray(ws.comparison.rows) ||
      !ws.comparison.rows.length ||
      !Array.isArray(ws.comparison.columns) ||
      !ws.comparison.columns.length;
    if (needCompare) {
      ws.comparison = {
        columns: WS.deepClone(pack.compareDimensions || []),
        rows: WS.deepClone(pack.defaultCompareRows || []),
        recommendedRowId: "row-a"
      };
      changed = true;
    }
    if (!ws.poc.checklist || !ws.poc.checklist.length) {
      ws.poc.checklist = WS.deepClone(pack.pocChecklistTemplate || []);
      changed = true;
    }
    if (!ws.tender.phases || !ws.tender.phases.length) {
      ws.tender.phases = WS.deepClone(pack.tenderPhases || []);
      changed = true;
    }
    if (!ws.tender.outlineSections || !ws.tender.outlineSections.length) {
      ws.tender.outlineSections = WS.deepClone(pack.tenderOutlineTemplate || []);
      changed = true;
    }
    if (!ws.delivery.milestones || !ws.delivery.milestones.length) {
      ws.delivery.milestones = WS.deepClone(pack.deliveryMilestonesTemplate || []);
      changed = true;
    }
    return changed;
  }

  function persist(ws) {
    global.WorkspaceStore.save(ws);
  }

  function updateTogFooter() {
    var ws = global.WorkspaceStore ? global.WorkspaceStore.load() : null;
    var r = $("tog-footer-revision");
    var u = $("tog-footer-updated");
    var pk = $("tog-footer-pack");
    if (r) {
      r.textContent =
        "revision " + (ws && ws.revision != null ? String(ws.revision) : "—");
    }
    if (u) {
      var iso = ws && ws.projectMeta && ws.projectMeta.updatedAt;
      u.textContent = iso ? "更新 " + iso : "更新时间 —";
    }
    if (pk) {
      pk.textContent = UAM_PACK ? "方案包 uam-core 就绪" : "方案包 未加载（离线）";
    }
  }

  function initTogChrome() {
    var htmlEl = document.documentElement;
    var btn = $("tog-theme-toggle");
    if (!btn) return;

    function syncStoredTheme() {
      var s = localStorage.getItem("tog-theme");
      if (s === "light") htmlEl.setAttribute("data-theme", "light");
      else htmlEl.setAttribute("data-theme", "dark");
    }

    function syncBtnLabel() {
      var light = htmlEl.getAttribute("data-theme") === "light";
      btn.setAttribute("aria-pressed", light ? "true" : "false");
      btn.textContent = light ? "深色视图" : "浅色视图";
    }

    syncStoredTheme();
    syncBtnLabel();

    btn.addEventListener("click", function () {
      var light = htmlEl.getAttribute("data-theme") === "light";
      var next = light ? "dark" : "light";
      htmlEl.setAttribute("data-theme", next);
      localStorage.setItem("tog-theme", next);
      syncBtnLabel();
    });

    window.addEventListener("workspace:updated", updateTogFooter);
  }

  function bindBriefingDepthUI(ws) {
    var group = document.querySelector(".tog-doc-depth");
    if (!group) return;
    var buttons = group.querySelectorAll(".tog-depth-option");
    if (!buttons.length) return;

    function syncFromWs() {
      var d = ws.briefingDocumentDepth;
      if (d !== "overview" && d !== "technical" && d !== "full") d = "full";
      buttons.forEach(function (btn) {
        var on = btn.getAttribute("data-depth") === d;
        btn.classList.toggle("is-selected", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
    }

    if (!group._wbDepthBound) {
      group._wbDepthBound = true;
      buttons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var nd = btn.getAttribute("data-depth");
          if (!nd || nd === ws.briefingDocumentDepth) return;
          ws.briefingDocumentDepth = nd;
          persist(ws);
          syncFromWs();
          if (global.BriefingApp && global.BriefingApp.reRenderBriefingIfReady) {
            global.BriefingApp.reRenderBriefingIfReady();
          }
        });
      });
    }
    syncFromWs();
  }

  function showPanel(id) {
    document.querySelectorAll(".wb-panel").forEach(function (p) {
      var on = p.id === "wb-panel-" + id;
      p.hidden = !on;
      p.classList.toggle("is-active", on);
    });
    document.querySelectorAll(".wb-tab").forEach(function (t) {
      var on = t.getAttribute("data-panel") === id;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function refreshAll(ws) {
    if (ensureDefaults(ws, UAM_PACK)) persist(ws);
  }

  var wsRef = null;
  var _wbInited = false;

  function initWorkbench() {
    if (_wbInited) return;
    _wbInited = true;
    initTogChrome();
    loadPack().then(function (pack) {
      UAM_PACK = pack;
      var ws = global.WorkspaceStore.load();
      if (ensureDefaults(ws, UAM_PACK)) persist(ws);
      wsRef = ws;

      var sel = $("scenario");
      if (sel && ws.selectedScenarioId) {
        var optExists = Array.prototype.some.call(sel.options, function (o) {
          return o.value === ws.selectedScenarioId;
        });
        if (optExists) sel.value = ws.selectedScenarioId;
      }

      bindBriefingDepthUI(ws);
      refreshAll(ws);
      updateTogFooter();
      document.querySelectorAll(".wb-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          showPanel(tab.getAttribute("data-panel"));
        });
      });

      if (sel) {
        sel.addEventListener("change", function () {
          ws.selectedScenarioId = sel.value;
          persist(ws);
          global.dispatchEvent(new CustomEvent("workbench:scenario-change", { detail: { key: sel.value } }));
        });
      }

      if (global.GovHubUi && typeof global.GovHubUi.init === "function") {
        global.GovHubUi.init();
      }

      showPanel("brief");
    });
  }

  global.Workbench = {
    init: initWorkbench,
    refresh: function () {
      if (wsRef) refreshAll(wsRef);
    }
  };
})(typeof window !== "undefined" ? window : this);
