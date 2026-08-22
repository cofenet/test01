/**
 * app.js - 核心控制层 (事件委托与状态修复版)
 */
(function () {
  'use strict';

  var allArticles = [];
  var currentCat = 'all';
  var searchKeyword = '';
  var focusMode = false;
  var currentArticle = null;

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    bindEvents();
    loadArticles('python');
    loadWeather();
    Render.renderHistory();
    Render.updateStat();
    initMobileSidebar();
  });

  // ========== 移动端抽屉初始化 ==========
  function initMobileSidebar() {
    var menuBtn = $('#mobileMenuBtn');
    var sidebar = $('.left-sidebar');
    var overlay = $('#sidebarOverlay');

    if (!menuBtn || !sidebar || !overlay) return;

    menuBtn.addEventListener('click', function () {
      sidebar.classList.add('active');
      overlay.classList.add('active');
    });

    overlay.addEventListener('click', function () {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });
  }

  // ========== 数据加载 ==========
  function loadArticles(category) {
    var cat = category || currentCat || 'tech';
    showLoading(true);

    var promise = (typeof API !== 'undefined' && API.fetchArticles)
      ? API.fetchArticles(cat)
      : Promise.resolve([]);

    promise.then(function (articles) {
      allArticles = articles || [];
      showLoading(false);
      refreshView();
    }).catch(function (err) {
      console.error('[loadArticles]', err);
      showLoading(false);
      Render.renderList([]);
      toast('文章加载失败，请检查网络');
    });
  }

  function loadWeather() {
    fetch('/api/proxy?target=weather&city=' + encodeURIComponent('北京'))
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var el = $('#weatherText');
        if (el && text) el.textContent = text;
      })
      .catch(function () {});
  }

  // ========== 视图刷新 ==========
  function getFilteredArticles() {
    var list = allArticles;

    if (currentCat === 'star') {
      list = list.filter(function (a) { return Store.isStar(a.id); });
    } else if (currentCat === 'unread') {
      list = list.filter(function (a) { return !Store.isRead(a.id); });
    } else if (currentCat !== 'all') {
      list = list.filter(function (a) { return a.category === currentCat; });
    }

    if (searchKeyword) {
      var kw = searchKeyword.toLowerCase();
      list = list.filter(function (a) {
        return (a.title && a.title.toLowerCase().indexOf(kw) !== -1) ||
               (a.description && a.description.toLowerCase().indexOf(kw) !== -1);
      });
    }

    return list;
  }

  function refreshView() {
    var filtered = getFilteredArticles();
    Render.renderList(filtered);
    Render.updateStat(filtered);
    
    // 重新高亮当前文章
    if (currentArticle) {
      $$('#listBox .list-item').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-id') === String(currentArticle.id));
      });
    }
  }

  // ========== 事件绑定 ==========
  function bindEvents() {
    // 搜索
    var searchInput = $('#searchInput');
    if (searchInput) {
      var searchTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var val = this.value;
        searchTimer = setTimeout(function () {
          searchKeyword = val.trim();
          refreshView();
        }, 300);
      });
    }

    // Tab 切换
    $$('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.tab-btn').forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        var newCat = this.getAttribute('data-cat');

        if (newCat === 'star' || newCat === 'unread' || newCat === 'all') {
          currentCat = newCat;
          refreshView();
        } else {
          currentCat = newCat;
          loadArticles(newCat);
        }
      });
    });

    // 工具栏
    var refreshBtn = $('#refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { toast('正在刷新...'); loadArticles(currentCat); });

    var focusModeBtn = $('#focusModeBtn');
    if (focusModeBtn) {
      focusModeBtn.addEventListener('click', function () {
        focusMode = !focusMode;
        document.documentElement.classList.toggle('focus-mode', focusMode);
        this.textContent = focusMode ? '📖 退出专注' : '🎯 专注阅读';
        toast(focusMode ? '已进入专注阅读模式' : '已退出专注模式');
      });
    }

    var markAllRead = $('#markAllRead');
    if (markAllRead) markAllRead.addEventListener('click', function () {
      getFilteredArticles().forEach(function (a) { Store.markRead(a.id); });
      refreshView(); toast('已将当前列表标为已读');
    });

    var clearAllRead = $('#clearAllRead');
    if (clearAllRead) clearAllRead.addEventListener('click', function () { Store.clearAllRead(); refreshView(); toast('已清除所有已读标记'); });

    var clearAllStar = $('#clearAllStar');
    if (clearAllStar) clearAllStar.addEventListener('click', function () {
      if (!confirm('确定清空所有收藏吗？')) return;
      Store.clearAllStar(); refreshView(); toast('已清空所有收藏');
    });

    // 字号
    $$('.font-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.font-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        document.documentElement.style.fontSize = this.getAttribute('data-root') + 'px';
        Store.setFontSize(this.getAttribute('data-root'));
      });
    });

    // 主题切换
    var themeBtn = $('#themeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var isDark = document.documentElement.getAttribute('data-theme') !== 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        this.textContent = isDark ? '切换亮色模式' : '切换暗黑模式';
        Store.setTheme(isDark ? 'dark' : 'light');
      });
    }

    // 清空历史
    var clearHistoryAll = $('#clearHistoryAll');
    if (clearHistoryAll) clearHistoryAll.addEventListener('click', function () {
      if (!confirm('确定清空所有浏览历史吗？')) return;
      Store.clearHistory(); Render.renderHistory(); toast('历史已清空');
    });

    // ✅ 文章列表点击（事件委托 - 修复版）
    var listBox = $('#listBox');
    if (listBox) {
      listBox.addEventListener('click', function (e) {
        // 收藏按钮
        var starBtn = e.target.closest('[data-star]');
        if (starBtn) {
          e.stopPropagation();
          var id = starBtn.getAttribute('data-star');
          var isStarred = Store.toggleStar(id);
          starBtn.textContent = isStarred ? '⭐' : '☆';
          refreshView();
          toast(isStarred ? '已收藏' : '已取消收藏');
          return;
        }

        // 文章项点击
        var item = e.target.closest('.list-item');
        if (item) {
          openArticle(item.getAttribute('data-id'));
        }
      });
    }

    // 文章详情操作
    var detailBox = $('#detailBox');
    if (detailBox) {
      detailBox.addEventListener('click', function (e) {
        var actionBtn = e.target.closest('[data-action]');
        if (!actionBtn || !currentArticle) return;

        var action = actionBtn.getAttribute('data-action');
        if (action === 'toggle-read') {
          var isRead = Store.toggleRead(currentArticle.id);
          actionBtn.textContent = isRead ? '📖 标为未读' : '👁️ 标为已读';
          refreshView(); toast(isRead ? '已标为已读' : '已标为未读');
        }
        if (action === 'toggle-star') {
          var starred = Store.toggleStar(currentArticle.id);
          actionBtn.textContent = starred ? '💔 取消收藏' : '⭐ 收藏文章';
          refreshView(); toast(starred ? '已收藏' : '已取消收藏');
        }
      });

      detailBox.addEventListener('scroll', function () {
        var scrollTop = this.scrollTop;
        var scrollHeight = this.scrollHeight - this.clientHeight;
        var progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        var bar = $('#progressBar');
        if (bar) bar.style.width = Math.min(progress, 100) + '%';
      });
    }

    // 历史记录点击
    var historyItems = $('#historyItems');
    if (historyItems) {
      historyItems.addEventListener('click', function (e) {
        var item = e.target.closest('[data-hid]');
        if (item) openArticle(item.getAttribute('data-hid'));
      });
    }

    // 回到顶部
    var backTop = $('#backTop');
    if (backTop) backTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    var listBackTop = $('#listBackTop');
    if (listBackTop) listBackTop.addEventListener('click', function () {
      var wrap = $('#listScrollWrap');
      if (wrap) wrap.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', function () {
      var btn = $('#backTop');
      if (btn) btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    });
  }

  // ========== 打开文章 ==========
  function openArticle(id) {
    var article = null;
    for (var i = 0; i < allArticles.length; i++) {
      if (String(allArticles[i].id) === String(id)) {
        article = allArticles[i];
        break;
      }
    }

    if (!article) {
      console.warn('[openArticle] 未找到文章:', id, '当前列表长度:', allArticles.length);
      toast('文章不存在或尚未加载');
      return;
    }

    currentArticle = article;
    Store.markRead(article.id);
    Store.addHistory({ id: article.id, title: article.title });
    Render.renderHistory();
    Render.renderDetail(article);

    // 高亮当前项
    $$('#listBox .list-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-id') === String(id));
    });

    loadReadme(article);
    refreshView();

    // 移动端自动关闭抽屉
    var sidebar = $('.left-sidebar');
    var overlay = $('#sidebarOverlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  }

  function loadReadme(article) {
    var detailBox = $('#detailBox');
    var fullName = article.title || '';
    if (!fullName || fullName.indexOf('/') === -1) return;

    if (article._readmeLoaded && article._readmeHtml) {
      if (detailBox) {
        detailBox.insertAdjacentHTML('beforeend',
          '<hr style="border:0;border-top:1px solid var(--border-color);margin:24px 0;">' +
          '<div class="markdown-body">' + article._readmeHtml + '</div>'
        );
      }
      return;
    }

    if (detailBox) {
      detailBox.insertAdjacentHTML('beforeend',
        '<div id="readmeLoading" style="padding:24px;text-align:center;color:var(--text-secondary);">📖 正在加载 README...</div>'
      );
    }

    if (typeof API === 'undefined' || !API.fetchReadme) return;

    API.fetchReadme(fullName).then(function (result) {
      var loader = $('#readmeLoading');
      if (loader) loader.remove();
      if (!detailBox) return;

      if (result.ok && result.html) {
        article._readmeLoaded = true;
        article._readmeHtml = result.html;
        detailBox.insertAdjacentHTML('beforeend',
          '<hr style="border:0;border-top:1px solid var(--border-color);margin:24px 0;">' +
          '<div class="markdown-body">' + result.html + '</div>'
        );
      } else {
        var msg = result.message || 'README 加载失败';
        detailBox.insertAdjacentHTML('beforeend',
          '<div style="padding:24px;text-align:center;color:var(--text-secondary);">⚠️ ' + msg + '</div>'
        );
      }
    }).catch(function (err) {
      var loader = $('#readmeLoading');
      if (loader) loader.remove();
      console.error('[loadReadme]', err);
    });
  }

  // ========== 辅助函数 ==========
  function showLoading(show) {
    var el = $('#listLoading');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function initTheme() {
    var theme = Store.getTheme ? Store.getTheme() : 'light';
    var isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    var themeBtn = $('#themeBtn');
    if (themeBtn) themeBtn.textContent = isDark ? '切换亮色模式' : '切换暗黑模式';

    var fontSize = Store.getFontSize ? Store.getFontSize() : '16';
    document.documentElement.style.fontSize = fontSize + 'px';
    $$('.font-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-root') === fontSize);
    });
  }

  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }
})();