/**
 * 方案历史面板 —— 记录每次生成的快照，支持回溯、多选对比与云同步
 * 依赖：WorkspaceStore (workspace-store.js)
 */
(function (global) {
  'use strict';

  var panelEl = null;
  var listEl = null;
  var badgeEl = null;
  var compareBtn = null;
  var clearBtn = null;
  var cloudStatusEl = null;
  var cloudDotEl = null;
  var cloudLabelEl = null;

  /* ───────── helpers ───────── */

  function timeAgo(isoStr) {
    if (!isoStr) return '';
    var then = new Date(isoStr);
    if (isNaN(then.getTime())) return isoStr;
    var now = new Date();
    var diffMs = now - then;
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return diffMin + ' 分钟前';
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + ' 小时前';
    var diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return diffDay + ' 天前';
    return then.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    var today = new Date();
    var isToday = d.getFullYear() === today.getFullYear() &&
                  d.getMonth() === today.getMonth() &&
                  d.getDate() === today.getDate();
    if (isToday) {
      return '今天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function briefSummaryFromHtml(html) {
    if (!html) return '';
    // Strip tags and return first ~60 chars
    var text = html.replace(/<[^>]*>/g, '').trim();
    return text.slice(0, 60) + (text.length > 60 ? '…' : '');
  }

  /* ───────── cloud sync indicators ───────── */

  function setCloudState(state) {
    if (!cloudStatusEl || !cloudDotEl || !cloudLabelEl) return;
    cloudStatusEl.hidden = false;
    cloudDotEl.setAttribute('data-state', state);
    var labels = {
      syncing: '云同步中…',
      saved: '已同步',
      error: '同步失败'
    };
    cloudLabelEl.textContent = labels[state] || state;
    // Auto-hide after 4s for all non-syncing states (especially error)
    if (state !== 'syncing') {
      clearTimeout(cloudStatusEl._hideTimer);
      cloudStatusEl._hideTimer = setTimeout(function () {
        cloudStatusEl.hidden = true;
      }, 4000);
    }
  }

  function triggerCloudSync() {
    if (!global.WorkspaceStore) return;
    setCloudState('syncing');
    global.WorkspaceStore.saveToCloud()
      .then(function () {
        setCloudState('saved');
      })
      .catch(function () {
        setCloudState('error');
      });
  }

  function tryCloudRestore() {
    if (!global.WorkspaceStore) return Promise.resolve();
    setCloudState('syncing');
    return global.WorkspaceStore.loadFromCloud()
      .then(function () {
        setCloudState('saved');
        refresh();
      })
      .catch(function () {
        setCloudState('offline');
      });
  }

  /* ───────── rendering ───────── */

  function renderItem(item, index) {
    var title = escapeHtml(item.scenarioName || '方案') +
                (typeof item.revision === 'number' ? ' · rev ' + item.revision : '');
    var metaParts = [];
    if (item.wind != null && !isNaN(Number(item.wind))) {
      metaParts.push('风速 ' + Number(item.wind).toFixed(1) + ' m/s');
    }
    if (typeof item.score === 'number' && !isNaN(item.score)) {
      metaParts.push('<span class="tog-history-item-score">评分 ' + item.score.toFixed(1) + '</span>');
    }
    if (item.timestamp) {
      metaParts.push(formatTime(item.timestamp));
    }
    var metaHtml = metaParts.join('<span style="color:var(--border-subtle);margin:0 0.15rem;">|</span>');

    var checkedClass = item._checked ? ' is-checked' : '';
    var div = document.createElement('div');
    div.className = 'tog-history-item';
    div.dataset.index = index;
    div.innerHTML =
      '<div class="tog-history-item-check' + checkedClass + '" data-index="' + index + '">' +
        (item._checked ? '&#10003;' : '') +
      '</div>' +
      '<div class="tog-history-item-body" data-index="' + index + '">' +
        '<div class="tog-history-item-title">' + title + '</div>' +
        '<div class="tog-history-item-meta">' + metaHtml + '</div>' +
      '</div>';
    return div;
  }

  function refresh() {
    if (!listEl || !badgeEl) return;
    var history = global.WorkspaceStore ? global.WorkspaceStore.getHistory() : [];
    listEl.innerHTML = '';

    if (!history || history.length === 0) {
      badgeEl.textContent = '0';
      compareBtn.disabled = true;
      return;
    }

    badgeEl.textContent = String(history.length);

    // Render newest first (already newest-first from pushHistory unshift)
    for (var i = 0; i < history.length; i++) {
      var itemEl = renderItem(history[i], i);
      listEl.appendChild(itemEl);
    }

    // Bind item body click -> restore
    listEl.querySelectorAll('.tog-history-item-body').forEach(function (body) {
      body.addEventListener('click', function (e) {
        var idx = parseInt(this.dataset.index, 10);
        if (isNaN(idx)) return;
        restoreSnapshot(idx);
      });
    });

    // Bind check click -> toggle
    listEl.querySelectorAll('.tog-history-item-check').forEach(function (chk) {
      chk.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(this.dataset.index, 10);
        if (isNaN(idx)) return;
        toggleCheck(idx);
      });
    });

    updateCompareButton();
  }

  function updateCompareButton() {
    if (!compareBtn) return;
    var checked = global.WorkspaceStore ? global.WorkspaceStore.getCheckedForCompare() : [];
    compareBtn.disabled = checked.length < 2;
  }

  /* ───────── actions ───────── */

  function restoreSnapshot(index) {
    if (!global.WorkspaceStore) return;
    
    // BUG FIX: 设置标志位防止场景切换时清空输出
    if (global.BriefingApp) {
      global.BriefingApp._isRestoringHistory = true;
    }
    
    var ok = global.WorkspaceStore.restoreHistory(index);
    if (!ok) return;

    // Load the snapshot back into the workspace
    var ws = global.WorkspaceStore.load();
    var item = (ws.history && ws.history[index]) || null;
    if (!item) return;

    // Restore the brief HTML into #output
    var out = document.getElementById('output');
    if (out && item.briefHtml) {
      out.innerHTML = item.briefHtml;
    }

    // Restore the scenario selector
    if (item.scenarioName) {
      var scenarioSel = document.getElementById('scenario');
      if (scenarioSel) {
        scenarioSel.value = item.scenarioName;
        // Trigger the change event for other components
        scenarioSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Restore the wind value
    if (item.wind != null && !isNaN(Number(item.wind))) {
      var windInp = document.getElementById('wind');
      if (windInp) {
        windInp.value = String(Number(item.wind));
        windInp.dispatchEvent(new Event('input', { bubbles: true }));
        windInp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Re-enable copy/export buttons after restore
    if (global.BriefingApp && typeof global.BriefingApp.setBriefingActionsEnabled === 'function') {
      global.BriefingApp.setBriefingActionsEnabled(true);
    }

    // Re-init follow-up chat with restored content
    if (window.FollowUpChat && item.briefHtml) {
      var briefText = item.briefHtml.replace(/<[^>]*>/g, '');
      window.FollowUpChat.init(briefText, item.scenarioName || '');
    }

    // Dispatch event so other components know
    window.dispatchEvent(new CustomEvent('briefing:restored', {
      detail: { index: index, snapshot: item }
    }));
  }

  function toggleCheck(index) {
    if (!global.WorkspaceStore) return;
    global.WorkspaceStore.toggleHistoryItem(index);
    // Re-render just the check marks without full rebuild
    var checkEls = listEl.querySelectorAll('.tog-history-item-check');
    var history = global.WorkspaceStore.getHistory();
    checkEls.forEach(function (el) {
      var i = parseInt(el.dataset.index, 10);
      if (isNaN(i) || i < 0 || i >= history.length) return;
      var checked = history[i]._checked;
      el.classList.toggle('is-checked', !!checked);
      el.innerHTML = checked ? '&#10003;' : '';
    });
    updateCompareButton();
  }

  function openCompareView() {
    if (!global.WorkspaceStore) return;
    var checked = global.WorkspaceStore.getCheckedForCompare();
    if (checked.length < 2) return;

    // Build a side-by-side comparison view in #output
    var out = document.getElementById('output');
    if (!out) return;

    var html = '<div style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;">' +
      '<button type="button" class="btn-back-from-compare" style="padding:0.3rem 0.75rem;font-size:0.8rem;cursor:pointer;background:var(--border-subtle);border:1px solid var(--border-subtle);border-radius:4px;color:var(--text);">' +
      '← 返回单方案视图</button>' +
      '<span style="font-size:0.75rem;color:var(--muted);">对比 ' + checked.length + ' 个方案（点击历史项可退出对比）</span>' +
      '</div>';
    html += '<div class="history-compare-wrapper" style="display:flex;gap:1rem;flex-wrap:wrap;">';
    for (var i = 0; i < checked.length; i++) {
      var item = checked[i];
      var title = escapeHtml(item.scenarioName || '方案') +
                  (typeof item.revision === 'number' ? ' · rev ' + item.revision : '');
      html += '<div style="flex:1;min-width:260px;border:1px solid var(--border-subtle);border-radius:6px;padding:0.75rem;overflow:auto;max-height:80vh;">';
      html += '<h3 style="margin:0 0 0.5rem;font-size:0.9rem;color:var(--text);">' + title + '</h3>';
      if (item.score != null && !isNaN(Number(item.score))) {
        html += '<p style="margin:0 0 0.5rem;font-size:0.8rem;color:var(--theme-color);">' +
                '评分：' + Number(item.score).toFixed(1) + '</p>';
      }
      if (item.briefHtml) {
        html += '<div style="font-size:0.82rem;line-height:1.6;">' + item.briefHtml + '</div>';
      } else if (item.briefSummary) {
        html += '<p style="font-size:0.82rem;color:var(--muted);">' + escapeHtml(item.briefSummary) + '</p>';
      } else {
        html += '<p style="font-size:0.82rem;color:var(--muted);">（无详细内容）</p>';
      }
      html += '</div>';
    }
    html += '</div>';

    out.innerHTML = html;

    // Bind back button to restore first checked item
    var backBtn = out.querySelector('.btn-back-from-compare');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        var allHistory = global.WorkspaceStore.getHistory();
        // Find the first checked item and restore it
        for (var j = 0; j < allHistory.length; j++) {
          if (allHistory[j]._checked) {
            restoreSnapshot(j);
            return;
          }
        }
        // Fallback: clear output
        out.innerHTML = '';
      });
    }

    window.dispatchEvent(new CustomEvent('briefing:rendered', { detail: { ok: true, compare: true } }));
  }

  function clearAllHistory() {
    if (!global.WorkspaceStore) return;
    if (!confirm('确定清空所有方案历史记录？此操作不可撤销。')) return;
    global.WorkspaceStore.clearHistory();
    refresh();
    // Hide panel if empty
    var history = global.WorkspaceStore.getHistory();
    if (history.length === 0) {
      hide();
    }
  }

  /* ───────── show / hide panel ───────── */

  function show() {
    if (!panelEl) return;
    panelEl.hidden = false;
    refresh();
  }

  function hide() {
    if (!panelEl) return;
    panelEl.hidden = true;
  }

  /* ───────── add snapshot ───────── */

  function addSnapshot(sceneName, wind, score, briefHtml) {
    if (!global.WorkspaceStore) return;
    var ws = global.WorkspaceStore.load();
    var rev = (ws.history && ws.history.length > 0)
      ? ((ws.history[0].revision || 0) + 1)
      : 1;
    var timestamp = new Date().toISOString();
    var summary = briefSummaryFromHtml(briefHtml);

    var snapshot = {
      scenarioName: sceneName || ws.selectedScenarioId || '高楼灭火',
      wind: (wind != null && !isNaN(Number(wind))) ? Number(wind) : null,
      score: (score != null && !isNaN(Number(score))) ? Number(score) : null,
      briefSummary: summary,
      briefHtml: briefHtml || '',
      timestamp: timestamp,
      revision: rev
    };

    global.WorkspaceStore.pushHistory(snapshot);

    // Show the panel on first snapshot
    if (panelEl && panelEl.hidden) {
      show();
    } else {
      refresh();
    }

    // Trigger cloud sync in background
    triggerCloudSync();
  }

  /* ───────── event listener for auto-capture ───────── */

  function onBriefingRendered(evt) {
    var detail = evt && evt.detail;
    if (!detail || !detail.ok) return;

    var sceneName = null;
    try {
      var scenarioEl = document.getElementById('scenario');
      if (scenarioEl) sceneName = scenarioEl.value;
    } catch (_) {}

    // Skip adding snapshot when the event comes from a compare view or history restore
    if (detail.compare) return;
    if (detail.restore) return;

    var wind = detail.wind;
    if (wind === undefined || wind === null) {
      try {
        var windInp = document.getElementById('wind');
        var raw = windInp ? windInp.value.trim() : '';
        wind = raw === '' ? null : parseFloat(raw);
      } catch (_) {
        wind = null;
      }
    }

    // Get the brief HTML from the output
    var briefHtml = '';
    try {
      var out = document.getElementById('output');
      if (out) briefHtml = out.innerHTML;
    } catch (_) {}

    // Score from comparison if available
    var score = detail.score || null;
    // If TogKpiBar has comparison data, try to extract score
    if (score === null && global.TogKpiBar && typeof global.TogKpiBar.getComparisonScore === 'function') {
      try {
        score = global.TogKpiBar.getComparisonScore();
      } catch (_) {}
    }

    addSnapshot(sceneName, wind, score, briefHtml);
  }

  /* ───────── init ───────── */

  function init() {
    panelEl = document.getElementById('tog-history-panel');
    listEl = document.getElementById('tog-history-list');
    badgeEl = document.getElementById('tog-history-badge');
    compareBtn = document.getElementById('tog-history-compare');
    clearBtn = document.getElementById('tog-history-clear');
    cloudStatusEl = document.getElementById('tog-cloud-status');
    cloudDotEl = document.getElementById('tog-cloud-dot');
    cloudLabelEl = document.getElementById('tog-cloud-label');

    if (!panelEl || !listEl) return;

    // Bind compare button
    if (compareBtn) {
      compareBtn.addEventListener('click', openCompareView);
    }

    // Bind clear button
    if (clearBtn) {
      clearBtn.addEventListener('click', clearAllHistory);
    }

    // Listen for auto-capture
    window.addEventListener('briefing:rendered', onBriefingRendered);

    // Listen for workspace updates to refresh
    window.addEventListener('workspace:updated', function () {
      refresh();
    });

    // Initial render if there's existing history
    if (global.WorkspaceStore) {
      var history = global.WorkspaceStore.getHistory();
      if (history && history.length > 0) {
        show();
      } else {
        refresh();
      }
    }

    // Try cloud restore on init
    tryCloudRestore();
  }

  /* ───────── export ───────── */

  global.HistoryPanel = {
    init: init,
    refresh: refresh,
    show: show,
    hide: hide,
    addSnapshot: addSnapshot,
    restoreSnapshot: restoreSnapshot,
    clearAllHistory: clearAllHistory,
    triggerCloudSync: triggerCloudSync
  };

  // Auto-init on DOMContentLoaded. If already loaded, init immediately.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
