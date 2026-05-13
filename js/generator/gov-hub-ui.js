/**
 * 政务风栏目区：左侧子类导航 + 右侧文章列表 + 详情（仿门户层级）
 */
(function (global) {
  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function mountHub(root) {
    if (!root || root._govHubMounted) return;
    var hubKey = root.getAttribute("data-gov-hub");
    var data = global.GovHubContent && global.GovHubContent[hubKey];
    if (!data) return;
    root._govHubMounted = true;

    var headText = root.querySelector(".gov-hub-head-text");

    var subnav = root.querySelector(".gov-hub-subnav");
    var listEl = root.querySelector(".gov-hub-article-list");
    var detailEl = root.querySelector(".gov-hub-article-detail");
    var detailTitle = root.querySelector(".gov-hub-detail-title");
    var detailContent = root.querySelector(".gov-hub-detail-content");
    var listWrap = root.querySelector(".gov-hub-list-wrap");
    var backBtn = root.querySelector(".gov-hub-back");

    var sections = data.sections || [];
    var activeSectionIdx = 0;

    function updateHeadTitle() {
      var sec = sections[activeSectionIdx];
      if (headText && sec && data.title) {
        headText.textContent = data.title + "—" + sec.label;
      }
    }

    function showList() {
      if (detailEl) detailEl.hidden = true;
      if (listWrap) listWrap.hidden = false;
    }

    function showArticle(article) {
      if (!article || !detailEl || !detailTitle || !detailContent) return;
      if (listWrap) listWrap.hidden = true;
      detailEl.hidden = false;
      detailTitle.textContent = article.title;
      if (article.bodyHtml) {
        detailContent.innerHTML = article.bodyHtml;
      } else {
        detailContent.innerHTML = "<p>" + escapeHtml(article.body || "") + "</p>";
      }
    }

    function renderSubnav() {
      if (!subnav) return;
      subnav.innerHTML = "";
      sections.forEach(function (sec, i) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gov-hub-subnav-item" + (i === activeSectionIdx ? " is-active" : "");
        btn.setAttribute("aria-pressed", i === activeSectionIdx ? "true" : "false");
        btn.textContent = sec.label;
        (function (idx) {
          btn.addEventListener("click", function () {
            activeSectionIdx = idx;
            renderSubnav();
            renderArticleList();
            showList();
          });
        })(i);
        subnav.appendChild(btn);
      });
    }

    function renderArticleList() {
      var sec = sections[activeSectionIdx];
      if (!sec || !listEl) return;
      updateHeadTitle();
      listEl.innerHTML = "";
      (sec.articles || []).forEach(function (art) {
        var li = document.createElement("li");
        li.className = "gov-hub-article-li";
        var b = document.createElement("button");
        b.type = "button";
        b.className = "gov-hub-article-link";
        var t = document.createElement("span");
        t.className = "gov-hub-article-title";
        t.textContent = art.title;
        b.appendChild(t);
        if (art.summary) {
          var sum = document.createElement("span");
          sum.className = "gov-hub-article-sum";
          sum.textContent = art.summary;
          b.appendChild(sum);
        }
        b.addEventListener("click", function () {
          showArticle(art);
        });
        li.appendChild(b);
        listEl.appendChild(li);
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", showList);
    }

    renderSubnav();
    renderArticleList();
    showList();
  }

  function init() {
    document.querySelectorAll(".gov-hub[data-gov-hub]").forEach(function (root) {
      mountHub(root);
    });
  }

  global.GovHubUi = { init: init, mountHub: mountHub };
})(typeof window !== "undefined" ? window : this);
