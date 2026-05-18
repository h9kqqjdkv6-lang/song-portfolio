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

  /**
   * 动态添加一个 section 到已挂载的 hub（用于 loadIntel 注入情报数据）
   * @param {Element} root - 已挂载的 .gov-hub 根元素
   * @param {object} section - { id, label, articles: [{ title, summary, bodyHtml? }] }
   */
  function addHubSection(root, section) {
    if (!root || !section) return;
    var hubKey = root.getAttribute("data-gov-hub");
    var data = global.GovHubContent && global.GovHubContent[hubKey];
    if (!data) return;

    var subnav = root.querySelector(".gov-hub-subnav");
    var listEl = root.querySelector(".gov-hub-article-list");
    var detailEl = root.querySelector(".gov-hub-article-detail");
    var detailTitle = root.querySelector(".gov-hub-detail-title");
    var detailContent = root.querySelector(".gov-hub-detail-content");
    var listWrap = root.querySelector(".gov-hub-list-wrap");
    var headText = root.querySelector(".gov-hub-head-text");

    // 添加到数据结构
    data.sections.push(section);

    // 左侧导航添加按钮
    var secIdx = data.sections.length - 1;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gov-hub-subnav-item";
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = section.label;
    btn.addEventListener("click", function () {
      // 更新激活态
      subnav.querySelectorAll(".gov-hub-subnav-item").forEach(function (b) {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      // 渲染文章列表
      if (listWrap) listWrap.hidden = false;
      if (detailEl) detailEl.hidden = true;
      if (listEl) {
        listEl.innerHTML = "";
        (section.articles || []).forEach(function (art) {
          var li = document.createElement("li");
          li.className = "gov-hub-article-li";
          var b2 = document.createElement("button");
          b2.type = "button";
          b2.className = "gov-hub-article-link";
          var t = document.createElement("span");
          t.className = "gov-hub-article-title";
          t.textContent = art.title;
          b2.appendChild(t);
          if (art.summary) {
            var sum = document.createElement("span");
            sum.className = "gov-hub-article-sum";
            sum.textContent = art.summary;
            b2.appendChild(sum);
          }
          b2.addEventListener("click", function () {
            if (listWrap) listWrap.hidden = true;
            if (detailEl) detailEl.hidden = false;
            if (detailTitle) detailTitle.textContent = art.title;
            if (detailContent) {
              if (art.bodyHtml) {
                detailContent.innerHTML = art.bodyHtml;
              } else {
                detailContent.innerHTML = "<p>" + escapeHtml(art.body || "") + "</p>";
              }
            }
          });
          li.appendChild(b2);
          listEl.appendChild(li);
        });
      }
      // 更新标题
      if (headText && data.title) {
        headText.textContent = data.title + "—" + section.label;
      }
    });
    if (subnav) subnav.appendChild(btn);
  }

  global.GovHubUi = { init: init, mountHub: mountHub, addHubSection: addHubSection };
})(typeof window !== "undefined" ? window : this);
