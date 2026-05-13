/**
 * 笔记正文内 .wiki-link：单击延迟跳转，双击打开预览卡片（数据来自 ../graph.json）
 */
(function () {
  var DEBOUNCE_MS = 320;
  var graphMapPromise = null;

  var STAGE_EMOJI = {
    seedling: "🌱",
    budding: "🌿",
    evergreen: "🌳",
  };

  function loadGraphMap() {
    if (graphMapPromise) return graphMapPromise;
    graphMapPromise = fetch("../graph.json", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("graph.json " + r.status);
        return r.json();
      })
      .then(function (data) {
        var map = {};
        (data.nodes || []).forEach(function (n) {
          map[n.id] = n;
        });
        return map;
      })
      .catch(function () {
        return {};
      });
    return graphMapPromise;
  }

  function slugFromHref(href) {
    var s = String(href);
    var m = s.match(/\/?([^/]+)\.html(?:\?.*)?(?:#.*)?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function closePopover() {
    var el = document.getElementById("wiki-preview-popover");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.classList.remove("is-open");
  }

  function ensurePopover() {
    var el = document.getElementById("wiki-preview-popover");
    if (el) return el;
    el = document.createElement("div");
    el.id = "wiki-preview-popover";
    el.className = "wiki-preview-popover";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "笔记预览");
    el.setAttribute("hidden", "");
    el.innerHTML =
      '<div class="wiki-preview-popover__inner">' +
      '<div class="wiki-preview-popover__meta"><span class="wiki-preview-popover__emoji" aria-hidden="true"></span>' +
      '<span class="wiki-preview-popover__cat"></span></div>' +
      '<h2 class="wiki-preview-popover__title"></h2>' +
      '<p class="wiki-preview-popover__sum"></p>' +
      '<a class="wiki-preview-popover__btn" href="#">打开完整笔记</a>' +
      "</div>";
    document.body.appendChild(el);

    el.querySelector(".wiki-preview-popover__btn").addEventListener("click", function (e) {
      e.preventDefault();
      var href = el.getAttribute("data-target-href");
      if (href) window.location.assign(href);
    });

    return el;
  }

  function positionPopover(el, clientX, clientY) {
    var pad = 14;
    var w = 320;
    el.style.maxWidth = "min(320px, calc(100vw - 24px))";
    var tw = el.offsetWidth || w;
    var th = el.offsetHeight || 200;
    var x = clientX + 14;
    var y = clientY + 14;
    if (x + tw + pad > window.innerWidth) x = window.innerWidth - tw - pad;
    if (x < pad) x = pad;
    if (y + th + pad > window.innerHeight) y = window.innerHeight - th - pad;
    if (y < pad) y = pad;
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  function openPopover(meta, targetHref, clientX, clientY) {
    var el = ensurePopover();
    var stage = meta.stage || "seedling";
    el.querySelector(".wiki-preview-popover__emoji").textContent = STAGE_EMOJI[stage] || STAGE_EMOJI.seedling;
    el.querySelector(".wiki-preview-popover__cat").textContent = meta.category || "未分类";
    el.querySelector(".wiki-preview-popover__title").textContent = meta.title || "";
    el.querySelector(".wiki-preview-popover__sum").textContent = meta.summary || "（无摘要）";
    el.querySelector(".wiki-preview-popover__btn").setAttribute("href", targetHref);
    el.setAttribute("data-target-href", targetHref);
    el.removeAttribute("hidden");
    el.classList.add("is-open");
    requestAnimationFrame(function () {
      positionPopover(el, clientX, clientY);
      requestAnimationFrame(function () {
        positionPopover(el, clientX, clientY);
      });
    });
  }

  function init() {
    var read = document.querySelector(".g-read");
    if (!read) return;

    read.addEventListener("click", function (e) {
      var a = e.target.closest("a.wiki-link");
      if (!a || !read.contains(a)) return;
      var hrefAttr = a.getAttribute("href");
      if (!hrefAttr) return;

      e.preventDefault();

      if (a._wikiNavTimer) {
        clearTimeout(a._wikiNavTimer);
        a._wikiNavTimer = null;
      }

      if (e.detail === 2) {
        var slug = slugFromHref(hrefAttr);
        loadGraphMap().then(function (map) {
          var meta = slug ? map[slug] : null;
          if (!meta) return;
          openPopover(meta, hrefAttr, e.clientX, e.clientY);
        });
        return;
      }

      a._wikiNavTimer = setTimeout(function () {
        a._wikiNavTimer = null;
        window.location.assign(hrefAttr);
      }, DEBOUNCE_MS);
    });

    document.addEventListener("dblclick", function (e) {
      var card = document.getElementById("wiki-preview-popover");
      if (!card || !card.classList.contains("is-open")) return;
      if (card.contains(e.target)) return;
      closePopover();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePopover();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
