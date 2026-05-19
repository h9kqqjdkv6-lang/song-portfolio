/**
 * 追问 AI —— 基于当前方案的流式 Q&A 会话模块
 * 依赖：BriefingApp（getData / getScenarioKey）、WorkspaceStore（可选）
 * 后端：POST /api/generate { follow_up_to, follow_up_question, ... }
 */
(function (global) {
  'use strict';

  var MSG_AREA_ID = 'follow-up-messages';
  var SECTION_ID = 'follow-up-section';
  var CONV_ID = 'follow-up-conversation';
  var INPUT_ID = 'follow-up-input';
  var BTN_SEND_ID = 'btn-follow-up';
  var BTN_CLEAR_ID = 'btn-clear-conversation';
  var STATUS_ID = 'follow-up-status';
  var TOKEN_ID = 'follow-up-token';

  var GENERATE_API_BASE =
    (typeof window !== 'undefined' && window.GENERATE_API_BASE) || '';

  /** 当前会话上下文 */
  var _briefContent = '';   // 用于 follow_up_to 的文本内容
  var _scenarioKey = '';
  var _messages = [];       // { role: 'user'|'assistant', content: string, time: string }
  var _abortCtrl = null;

  // ── 辅助函数 ──

  function $(id) { return document.getElementById(id); }

  function nowHHMM() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /** 清除加载占位（如果有） */
  function removeLoadingEl() {
    var msgArea = $(MSG_AREA_ID);
    if (!msgArea) return;
    var loading = msgArea.querySelector('.follow-up-msg-loading');
    if (loading) loading.remove();
  }

  /** 追加一条消息气泡 */
  function appendMessage(role, contentHtml, timeStr) {
    var msgArea = $(MSG_AREA_ID);
    if (!msgArea) return;

    // 移除旧 loading
    if (role === 'assistant' || role === 'user') {
      removeLoadingEl();
    }

    var div = document.createElement('div');
    div.className = 'follow-up-msg follow-up-msg-' + role;

    var bubble = document.createElement('div');
    bubble.className = 'follow-up-msg-bubble';
    if (role === 'user') {
      bubble.textContent = contentHtml;
    } else {
      bubble.innerHTML = contentHtml;
    }
    div.appendChild(bubble);

    var time = document.createElement('div');
    time.className = 'follow-up-msg-time';
    time.textContent = timeStr || nowHHMM();
    div.appendChild(time);

    msgArea.appendChild(div);

    // 自动滚到底部
    var conv = $(CONV_ID);
    if (conv) conv.scrollTop = conv.scrollHeight;
  }

  /** 更新最后一条 AI 消息的内容（流式增量） */
  function updateLastAIMessage(text) {
    var msgArea = $(MSG_AREA_ID);
    if (!msgArea) return;
    var bubbles = msgArea.querySelectorAll('.follow-up-msg-ai .follow-up-msg-bubble');
    if (!bubbles.length) return;
    var last = bubbles[bubbles.length - 1];
    // 流式期间显示纯文本
    last.textContent = text.replace(/<[^>]*>/g, '');
  }

  /** 完成流式后，将最后一条 AI 消息渲染为 HTML */
  function finalizeLastAIMessage(html) {
    var msgArea = $(MSG_AREA_ID);
    if (!msgArea) return;
    var bubbles = msgArea.querySelectorAll('.follow-up-msg-ai .follow-up-msg-bubble');
    if (!bubbles.length) return;
    var last = bubbles[bubbles.length - 1];
    last.style.whiteSpace = 'normal';
    last.innerHTML = html;

    var conv = $(CONV_ID);
    if (conv) conv.scrollTop = conv.scrollHeight;
  }

  /** 显示加载占位消息 */
  function showLoading() {
    removeLoadingEl();
    var msgArea = $(MSG_AREA_ID);
    if (!msgArea) return;
    var div = document.createElement('div');
    div.className = 'follow-up-msg follow-up-msg-loading';
    div.textContent = 'AI 思考中...';
    msgArea.appendChild(div);
    var conv = $(CONV_ID);
    if (conv) conv.scrollTop = conv.scrollHeight;
  }

  function hideLoading() {
    removeLoadingEl();
  }

  /** 更新 token/费用显示 */
  function updateTokenInfo(meta) {
    var el = $(TOKEN_ID);
    if (!el) return;
    if (!meta) {
      el.textContent = '';
      return;
    }
    var parts = [];
    if (meta.input_tokens != null) parts.push('输入 ' + meta.input_tokens);
    if (meta.output_tokens != null) parts.push('输出 ' + meta.output_tokens);
    if (meta.cost_est_cny != null) parts.push('¥' + Number(meta.cost_est_cny).toFixed(4));
    el.textContent = parts.length ? parts.join(' | ') : '';
  }

  // ── 核心 API 方法 ──

  /**
   * 初始化（在 BriefingApp 渲染完简报后调用）
   * @param {string} briefContent 当前方案的纯文本内容（用于 follow_up_to）
   * @param {string} scenarioKey  当前场景 key
   */
  function init(briefContent, scenarioKey) {
    var section = $(SECTION_ID);
    if (section) section.style.display = 'block';

    var conv = $(CONV_ID);
    if (conv) conv.hidden = false;

    // BUG 2: 剥离 HTML 标签，只存纯文本用于后续追问上下文
    _briefContent = (briefContent || '').replace(/<[^>]*>/g, '');
    _scenarioKey = scenarioKey || '';

    // BUG 1: 先尝试从 workspace 恢复历史对话
    var msgArea = $(MSG_AREA_ID);
    if (restoreFromWorkspace()) {
      // 有历史对话：渲染到 UI
      if (msgArea) {
        msgArea.innerHTML = '';
        _messages.forEach(function (m) {
          appendMessage(m.role, m.content, m.time);
        });
      }
      var status = $(STATUS_ID);
      if (status) status.textContent = '已恢复上次对话';
      updateTokenInfo(null);
      return;
    }

    // 没有历史：清空
    if (msgArea) msgArea.innerHTML = '';
    _messages = [];

    var status = $(STATUS_ID);
    if (status) status.textContent = '已就绪，可开始追问';

    updateTokenInfo(null);
  }

  /**
   * 发送追问
   * @param {string} question
   */
  function sendQuestion(question) {
    if (!question || !question.trim()) return;
    var q = question.trim();

    // 收集表单参数
    var DATA = global.BriefingApp && typeof global.BriefingApp.getData === 'function'
      ? global.BriefingApp.getData()
      : null;
    var sceneName = global.BriefingApp && typeof global.BriefingApp.getScenarioKey === 'function'
      ? global.BriefingApp.getScenarioKey()
      : (_scenarioKey || '');
    var depth = global.BriefingApp && typeof global.BriefingApp.getDocumentDepth === 'function'
      ? global.BriefingApp.getDocumentDepth()
      : 'full';

    var topic = DATA ? (DATA.displayName || sceneName) : sceneName;
    var industry = '低空经济';
    var audience = '政府';

    // 构建 extra_context（注入场景参数辅助 AI）
    var h = (function () {
      var el = document.getElementById('height');
      var custom = document.getElementById('height-custom-m');
      if (!el) return 100;
      if (el.value === 'other' && custom) {
        var n = parseInt(String(custom.value).trim(), 10);
        return !isNaN(n) && n >= 10 ? n : 100;
      }
      return parseInt(el.value, 10) || 100;
    })();
    var windRaw = (document.getElementById('wind') || {}).value || '';
    var wind = windRaw.trim() === '' ? NaN : parseFloat(windRaw);
    var extraParts = [];
    if (DATA) {
      var aiCtx = global.BriefingApp && typeof global.BriefingApp.buildAIContext === 'function'
        ? global.BriefingApp.buildAIContext(DATA)
        : '';
      if (aiCtx) extraParts.push(aiCtx);
    }
    extraParts.push('作业高度：' + h + 'm');
    if (!isNaN(wind)) extraParts.push('当前风速：' + wind + 'm/s');
    var extra = extraParts.join('；');

    // 中止上一次请求
    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }

    // UI 状态
    var input = $(INPUT_ID);
    var sendBtn = $(BTN_SEND_ID);
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '发送中...'; }
    if (input) input.value = '';
    var statusEl = $(STATUS_ID);
    if (statusEl) statusEl.textContent = '正在生成...';

    // 追加用户消息
    appendMessage('user', q, nowHHMM());
    _messages.push({ role: 'user', content: q, time: nowHHMM() });

    // 显示 loading
    showLoading();

    // 确认 conversation 区域可见
    var conv = $(CONV_ID);
    if (conv) conv.hidden = false;

    var ctrl = new AbortController();
    _abortCtrl = ctrl;
    var timeoutId = setTimeout(function () { ctrl.abort(); }, 120_000);

    fetch(GENERATE_API_BASE + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        industry: industry,
        audience: audience,
        extra_context: extra,
        scene_name: sceneName,
        follow_up_to: _briefContent,
        follow_up_question: q,
        depth: depth
      }),
      signal: ctrl.signal
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error('API ' + res.status + ': ' + (t || '').slice(0, 200));
          });
        }

        hideLoading();
        appendMessage('assistant', '', nowHHMM());
        var aiMsg = { role: 'assistant', content: '', time: nowHHMM() };
        _messages.push(aiMsg);

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var accumulated = '';

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              // 完成：以 HTML 渲染
              if (accumulated.trim()) {
                finalizeLastAIMessage(accumulated);
                aiMsg.content = accumulated;
                _briefContent = accumulated; // 更新上下文供后续追问
                // 保存到 workspace
                persistConversation();
              }
              return;
            }

            buffer += decoder.decode(result.value, { stream: true });
            var parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (var i = 0; i < parts.length; i++) {
              var lines = parts[i].split('\n');
              for (var j = 0; j < lines.length; j++) {
                if (!lines[j].startsWith('data: ')) continue;
                try {
                  var evt = JSON.parse(lines[j].slice(6));
                  if (evt.type === 'chunk') {
                    accumulated += evt.content || '';
                    updateLastAIMessage(accumulated);
                  }
                  if (evt.type === 'done') {
                    clearTimeout(timeoutId);
                    accumulated = accumulated.trim();
                    if (accumulated) {
                      finalizeLastAIMessage(accumulated);
                      aiMsg.content = accumulated;
                      _briefContent = accumulated;
                      persistConversation();
                    }
                    // 元数据（token 等）
                    if (evt.meta) {
                      updateTokenInfo(evt.meta);
                    }
                    if (statusEl) statusEl.textContent = '';
                  }
                } catch (_) {}
              }
            }
            return pump();
          });
        }

        return pump();
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        hideLoading();
        if (err.name === 'AbortError') {
          // 用户主动中止，安静处理
          var lastEl = document.querySelector('#' + MSG_AREA_ID + ' .follow-up-msg-ai:last-child .follow-up-msg-bubble');
          if (lastEl && !lastEl.textContent.trim()) {
            lastEl.textContent = '[已中止]';
          }
          if (statusEl) statusEl.textContent = '已中止';
        } else {
          var errMsg = '追问失败：' + escapeHtml(err.message || '未知错误');
          appendMessage('assistant', '<p style="color:var(--warn);margin:0;">' + errMsg + '</p>', nowHHMM());
          _messages.push({ role: 'assistant', content: '[Error] ' + err.message, time: nowHHMM() });
          if (statusEl) statusEl.textContent = '失败';
        }
      })
      .finally(function () {
        clearTimeout(timeoutId);
        _abortCtrl = null;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '发送追问'; }
      });
  }

  /** 清空对话 */
  function clearConversation() {
    if (!window.confirm('确定清空当前追问对话？')) return;

    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }

    var msgArea = $(MSG_AREA_ID);
    if (msgArea) msgArea.innerHTML = '';

    _messages = [];

    var conv = $(CONV_ID);
    if (conv) conv.hidden = true;

    var statusEl = $(STATUS_ID);
    if (statusEl) statusEl.textContent = '';

    updateTokenInfo(null);

    // 清除 workspace 中的历史
    try {
      var ws = global.WorkspaceStore && global.WorkspaceStore.load();
      if (ws) {
        delete ws.followUpHistory;
        global.WorkspaceStore.save(ws);
      }
    } catch (_) {}
  }

  /** 重置（场景切换时调用） */
  function reset() {
    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }

    _briefContent = '';
    _scenarioKey = '';
    _messages = [];

    var section = $(SECTION_ID);
    if (section) section.style.display = 'none';

    var msgArea = $(MSG_AREA_ID);
    if (msgArea) msgArea.innerHTML = '';

    var conv = $(CONV_ID);
    if (conv) conv.hidden = true;

    var input = $(INPUT_ID);
    if (input) input.value = '';

    var statusEl = $(STATUS_ID);
    if (statusEl) statusEl.textContent = '';

    updateTokenInfo(null);

    try {
      var ws = global.WorkspaceStore && global.WorkspaceStore.load();
      if (ws) {
        delete ws.followUpHistory;
        global.WorkspaceStore.save(ws);
      }
    } catch (_) {}
  }

  /** 将消息历史持久化到 workspace-store */
  function persistConversation() {
    try {
      var ws = global.WorkspaceStore && global.WorkspaceStore.load();
      if (ws) {
        ws.followUpHistory = {
          messages: JSON.parse(JSON.stringify(_messages)),
          briefContent: _briefContent,
          scenarioKey: _scenarioKey,
          updatedAt: new Date().toISOString()
        };
        global.WorkspaceStore.save(ws);
      }
    } catch (_) {}
  }

  /** 从 workspace-store 恢复历史 */
  function restoreFromWorkspace() {
    try {
      var ws = global.WorkspaceStore && global.WorkspaceStore.load();
      if (ws && ws.followUpHistory && ws.followUpHistory.messages) {
        var hist = ws.followUpHistory;
        // 仅当场景匹配时恢复
        var currentKey = global.BriefingApp && typeof global.BriefingApp.getScenarioKey === 'function'
          ? global.BriefingApp.getScenarioKey()
          : '';
        if (hist.scenarioKey === currentKey && hist.briefContent) {
          _briefContent = hist.briefContent || '';
          _scenarioKey = hist.scenarioKey || '';
          _messages = JSON.parse(JSON.stringify(hist.messages || []));
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // ── UI 事件绑定 ──

  function wireEvents() {
    // 发送按钮
    var sendBtn = $(BTN_SEND_ID);
    var input = $(INPUT_ID);
    var clearBtn = $(BTN_CLEAR_ID);

    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        if (!input) return;
        var text = input.value.trim();
        if (text) sendQuestion(text);
      });
    }

    // Enter 发送（Shift+Enter 换行）
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var text = input.value.trim();
          if (text) sendQuestion(text);
        }
      });
    }

    // 清空按钮
    if (clearBtn) {
      clearBtn.addEventListener('click', clearConversation);
    }

    // 快捷提问按钮
    document.querySelectorAll('.quick-ask').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = btn.getAttribute('data-q');
        if (q && q.trim() && input) {
          input.value = q.trim();
          sendQuestion(q.trim());
        }
      });
    });
  }

  // ── 模块初始化（自启动事件绑定） ──

  function initModule() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireEvents);
    } else {
      wireEvents();
    }
  }

  // 对外暴露
  global.FollowUpChat = {
    init: init,
    sendQuestion: sendQuestion,
    clearConversation: clearConversation,
    showLoading: showLoading,
    hideLoading: hideLoading,
    reset: reset
  };

  // 启动事件绑定（发送按钮、Enter 键、快捷提问、清空对话）
  initModule();
})(typeof window !== 'undefined' ? window : this);
