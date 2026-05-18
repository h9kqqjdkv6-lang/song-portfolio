/**
 * 本地工作区：与将来服务端 GET/PUT 对齐的包装结构（revision 预留）
 */
(function (global) {
  var STORAGE_KEY = "song-portfolio-workspace-v1";

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createEmptyWorkspace() {
    return {
      revision: 1,
      projectMeta: {
        name: "",
        clientSegment: "G端/政务",
        updatedAt: nowIso()
      },
      selectedScenarioId: "高楼灭火",
      briefingDocumentDepth: "full",
      comparison: null,
      history: [],
      followUpHistory: [],
      poc: {
        checklist: [],
        performanceRows: [],
        notes: ""
      },
      tender: {
        phases: [],
        outlineSections: []
      },
      delivery: {
        milestones: []
      }
    };
  }

  function bumpRevision(ws) {
    if (!ws) return;
    ws.revision = (typeof ws.revision === "number" ? ws.revision : 0) + 1;
    ws.projectMeta = ws.projectMeta || {};
    ws.projectMeta.updatedAt = nowIso();
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyWorkspace();
      var ws = JSON.parse(raw);
      if (!ws || typeof ws !== "object") return createEmptyWorkspace();
      if (ws.revision === undefined) ws.revision = 1;
      if (!ws.projectMeta) ws.projectMeta = { name: "", clientSegment: "G端/政务", updatedAt: nowIso() };
      if (ws.briefingDocumentDepth !== "overview" && ws.briefingDocumentDepth !== "technical" && ws.briefingDocumentDepth !== "full") {
        ws.briefingDocumentDepth = "full";
      }
      if (!ws.poc) ws.poc = { checklist: [], performanceRows: [], notes: "" };
      if (!ws.tender) ws.tender = { phases: [], outlineSections: [] };
      if (!ws.delivery) ws.delivery = { milestones: [] };
      if (!Array.isArray(ws.history)) ws.history = [];
      if (!Array.isArray(ws.followUpHistory)) ws.followUpHistory = [];
      return ws;
    } catch (e) {
      console.warn("workspace load", e);
      return createEmptyWorkspace();
    }
  }

  function save(ws) {
    bumpRevision(ws);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("workspace:updated"));
      }
    } catch (e) {
      console.warn("workspace save", e);
    }
  }

  function exportJSON(ws) {
    return JSON.stringify(deepClone(ws), null, 2);
  }

  function importFromObject(obj) {
    if (!obj || typeof obj !== "object") throw new Error("invalid");
    var cur = load();
    var ws = deepClone(obj);
    if (ws.revision === undefined) ws.revision = 1;
    if (!ws.projectMeta) ws.projectMeta = cur.projectMeta;
    if (ws.briefingDocumentDepth !== "overview" && ws.briefingDocumentDepth !== "technical" && ws.briefingDocumentDepth !== "full") {
      ws.briefingDocumentDepth = "full";
    }
    if (!ws.poc) ws.poc = { checklist: [], performanceRows: [], notes: "" };
    if (!ws.tender) ws.tender = { phases: [], outlineSections: [] };
    if (!ws.delivery) ws.delivery = { milestones: [] };
    save(ws);
    return ws;
  }

  /**
   * Simple browser fingerprint for cloud sync identification
   */
  function getBrowserFingerprint() {
    try {
      var raw = navigator.userAgent + screen.width + 'song-portfolio-v1';
      // Simple hash via btoa
      return btoa(unescape(encodeURIComponent(raw))).slice(0, 32);
    } catch (e) {
      return 'unknown-' + Date.now();
    }
  }

  /**
   * Push a history snapshot (prepends, max 20 items)
   */
  function pushHistory(snapshot) {
    var ws = load();
    if (!Array.isArray(ws.history)) ws.history = [];
    snapshot._checked = false;
    ws.history.unshift(snapshot);
    if (ws.history.length > 20) ws.history.length = 20;
    save(ws);
  }

  function getHistory() {
    var ws = load();
    return Array.isArray(ws.history) ? ws.history : [];
  }

  function restoreHistory(index) {
    var ws = load();
    var list = Array.isArray(ws.history) ? ws.history : [];
    var item = list[index];
    if (!item) return false;
    ws.selectedScenarioId = item.scenarioName || ws.selectedScenarioId;
    ws.projectMeta = ws.projectMeta || {};
    ws.projectMeta.updatedAt = nowIso();
    // Store a reference for the history panel to use
    ws._restoredHistoryIndex = index;
    ws._restoredHistorySnapshot = deepClone(item);
    save(ws);
    return true;
  }

  function clearHistory() {
    var ws = load();
    ws.history = [];
    delete ws._restoredHistoryIndex;
    delete ws._restoredHistorySnapshot;
    save(ws);
  }

  function toggleHistoryItem(index) {
    var ws = load();
    var list = Array.isArray(ws.history) ? ws.history : [];
    if (index < 0 || index >= list.length) return;
    var item = list[index];
    // Toggle
    item._checked = !item._checked;
    // Enforce max 2 checked: if more than 2, uncheck oldest
    var checked = list.filter(function (h) { return h._checked; });
    if (checked.length > 2) {
      // Find the earliest checked item (furthest in list) and uncheck it
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i]._checked) {
          list[i]._checked = false;
          break;
        }
      }
    }
    ws.history = list;
    save(ws);
  }

  function getCheckedForCompare() {
    var ws = load();
    var list = Array.isArray(ws.history) ? ws.history : [];
    return list.filter(function (h) { return h._checked; }).slice(0, 2);
  }

  function saveToCloud() {
    return new Promise(function (resolve, reject) {
      var ws = load();
      var fingerprint = getBrowserFingerprint();
      var payload = deepClone(ws);
      payload._fingerprint = fingerprint;
      payload._fingerprint_label = navigator.userAgent.slice(0, 80);
      fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          if (!r.ok) throw new Error('cloud save ' + r.status);
          return r.json();
        })
        .then(function (data) {
          resolve(data);
        })
        .catch(function (err) {
          reject(err);
        });
    });
  }

  function loadFromCloud() {
    return new Promise(function (resolve, reject) {
      var fingerprint = getBrowserFingerprint();
      fetch('/api/proposals?_fp=' + encodeURIComponent(fingerprint), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })
        .then(function (r) {
          if (!r.ok) throw new Error('cloud load ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (data && data.workspace) {
            importFromObject(data.workspace);
            resolve(data);
          } else {
            reject(new Error('no cloud workspace'));
          }
        })
        .catch(function (err) {
          reject(err);
        });
    });
  }

  global.WorkspaceStore = {
    STORAGE_KEY: STORAGE_KEY,
    createEmptyWorkspace: createEmptyWorkspace,
    load: load,
    save: save,
    exportJSON: exportJSON,
    importFromObject: importFromObject,
    bumpRevision: bumpRevision,
    deepClone: deepClone,
    pushHistory: pushHistory,
    getHistory: getHistory,
    restoreHistory: restoreHistory,
    clearHistory: clearHistory,
    toggleHistoryItem: toggleHistoryItem,
    getCheckedForCompare: getCheckedForCompare,
    saveToCloud: saveToCloud,
    loadFromCloud: loadFromCloud,
    getBrowserFingerprint: getBrowserFingerprint
  };
})(typeof window !== "undefined" ? window : this);
