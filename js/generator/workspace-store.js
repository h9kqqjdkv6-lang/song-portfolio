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

  global.WorkspaceStore = {
    STORAGE_KEY: STORAGE_KEY,
    createEmptyWorkspace: createEmptyWorkspace,
    load: load,
    save: save,
    exportJSON: exportJSON,
    importFromObject: importFromObject,
    bumpRevision: bumpRevision,
    deepClone: deepClone
  };
})(typeof window !== "undefined" ? window : this);
