/**
 * app.js - 核心控制层
 * 串联 API / Store / Render，处理所有用户交互
 * 适配旧版 window.API 接口风格
 */

(function () {
  'use strict';

  // ========== 状态 ==========
  var allArticles = [];       // 全量文章
  var currentCat = 'all';     // 当前分类
  var searchKeyword = '';     // 搜索关键词
  var focusMode = false;      // 专注模式
  var currentArticle = null;  // 当前阅读的文章

  // ========== DOM 引用 ==========
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  // ========== 初始化 ==========
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    bindEvents();
    loadArticles('tech');  // 默认加载科技类
    loadWeather();
    Render.renderHistory();
    Render.updateFavoritesStat();
  });

  // ========== 数据加载 ==========

  function loadArticles(category) {
    var cat = category || currentCat || 'tech';
    showLoading(true);

    // 调用旧版 API（大写）
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
    // 旧版 API 没有天气方法，直接 fetch 代理
    fetch('/api/proxy?target=weather&city=' + encodeURIComponent('北京'))
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var el = $('#weatherText');
        if (el && text) el.textContent = text;
      })
      .catch(function () {
        // 静默失败
      });
  }

  // ========== 视图刷新 ==========

  function getFilteredArticles() {
    var list = allArticles;

    // 分类过滤
    if (currentCat === 'star') {
      list = list.filter(function (a) { return Store.isStar(a.id); });
    } else if (currentCat === 'unread') {
      list = list.filter(function (a) { return !Store.isRead(a.id); });
    } else if (currentCat !== 'all') {
      list = list.filter(function (a) { return a.category === currentCat; });
    }

    // 搜索过滤
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
    Render.updateFavoritesStat();
  }

  // ========== 事件绑定 ==========

  function bindEvents() {
    // --- 搜索 ---
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

    // --- Tab 切换 ---
    $$('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.tab-btn').forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        var newCat = this.getAttribute('data-cat');

        // 特殊 Tab（收藏/未读）不需要重新拉取数据
        if (newCat === 'star' || newCat === 'unread' || newCat === 'all') {
          currentCat = newCat;
          refreshView();
        } else {
          // 分类 Tab（tech/sport）需要重新拉取
          currentCat = newCat;
          loadArticles(newCat);
        }
      });
    });

    // --- 工具栏按钮 ---
    var refreshBtn = $('#refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        toast('正在刷新...');
        loadArticles(currentCat);
      });
    }

    var focusModeBtn = $('#focusModeBtn');
    if (focusModeBtn) {
      focusModeBtn.addEventListener('click', function () {
        focusMode = !focusMode;
        document.body.classList.toggle('focus-mode', focusMode);
        this.textContent = focusMode ? '📖 退出专注' : '🎯 专注阅读';
        toast(focusMode ? '已进入专注阅读模式' : '已退出专注模式');
      });
    }

    var markAllRead = $('#markAllRead');
    if (markAllRead) {
      markAllRead.addEventListener('click', function () {
        var filtered = getFilteredArticles();
        filtered.forEach(function (a) { Store.markRead(a.id); });
        refreshView();
        toast('已将 ' + filtered.length + ' 篇标为已读');
      });
    }

    var clearAllRead = $('#clearAllRead');
    if (clearAllRead) {
      clearAllRead.addEventListener('click', function () {
        Store.clearAllRead();
        refreshView();
        toast('已清除所有已读标记');
      });
    }

    var clearAllStar = $('#clearAllStar');
    if (clearAllStar) {
      clearAllStar.addEventListener('click', function () {
        if (!confirm('确定清空所有收藏吗？')) return;
        Store.clearAllStar();
        refreshView();
        toast('已清空所有收藏');
      });
    }

    // --- 字号调节 ---
    $$('.font-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.font-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        var size = this.getAttribute('data-root');
        document.documentElement.style.fontSize = size + 'px';
        Store.setFontSize(size);
      });
    });

    // --- 主题切换 ---
    var themeBtn = $('#themeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var isDark = document.body.classList.toggle('dark');
        this.textContent = isDark ? '切换亮色模式' : '切换暗黑模式';
        Store.setTheme(isDark ? 'dark' : 'light');
      });
    }

    // --- 清空历史 ---
    var clearHistoryAll = $('#clearHistoryAll');
    if (clearHistoryAll) {
      clearHistoryAll.addEventListener('click', function () {
        if (!confirm('确定清空所有浏览历史吗？')) return;
        Store.clearHistory();
        Render.renderHistory();
        toast('历史已清空');
      });
    }

    // --- 文章列表点击（事件委托）---
    var listBox = $('#listBox');
    if (listBox) {
      listBox.addEventListener('click', function (e) {
        // 收藏按钮
        var starBtn = e.target.closest('[data-star]');
        if (starBtn) {
          e.stopPropagation();
          var id = starBtn.getAttribute('data-star');
          var isStarred = Store.toggleStar(id);
          starBtn.classList.toggle('active', isStarred);
          starBtn.textContent = isStarred ? '⭐' : '☆';
          refreshView();
          toast(isStarred ? '已收藏' : '已取消收藏');
          return;
        }

        // 文章项点击
        var item = e.target.closest('.list-item');
        if (item) {
          var articleId = item.getAttribute('data-id');
          openArticle(articleId);
        }
      });
    }

    // --- 文章详情操作（事件委托）---
    var detailBox = $('#detailBox');
    if (detailBox) {
      detailBox.addEventListener('click', function (e) {
        var actionBtn = e.target.closest('[data-action]');
        if (!actionBtn || !currentArticle) return;

        var action = actionBtn.getAttribute('data-action');

        if (action === 'toggle-read') {
          var isRead = Store.toggleRead(currentArticle.id);
          actionBtn.textContent = isRead ? '📖 标为未读' : '👁️ 标为已读';
          refreshView();
          toast(isRead ? '已标为已读' : '已标为未读');
        }

        if (action === 'toggle-star') {
          var starred = Store.toggleStar(currentArticle.id);
          actionBtn.textContent = starred ? '💔 取消收藏' : '⭐ 收藏文章';
          refreshView();
          toast(starred ? '已收藏' : '已取消收藏');
        }
      });

      // 阅读进度条
      detailBox.addEventListener('scroll', function () {
        var el = this;
        var scrollTop = el.scrollTop;
        var scrollHeight = el.scrollHeight - el.clientHeight;
        var progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        var bar = $('#progressBar');
        if (bar) bar.style.width = Math.min(progress, 100) + '%';
      });
    }

    // --- 浏览历史点击 ---
    var historyItems = $('#historyItems');
    if (historyItems) {
      historyItems.addEventListener('click', function (e) {
        var item = e.target.closest('[data-hid]');
        if (item) {
          openArticle(item.getAttribute('data-hid'));
        }
      });
    }

    // --- 回到顶部 ---
    var backTop = $('#backTop');
    if (backTop) {
      backTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    var listBackTop = $('#listBackTop');
    if (listBackTop) {
      listBackTop.addEventListener('click', function () {
        var wrap = $('#listScrollWrap');
        if (wrap) wrap.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // --- 全局滚动显示回到顶部按钮 ---
    window.addEventListener('scroll', function () {
      var btn = $('#backTop');
      if (btn) {
        btn.style.display = window.scrollY > 400 ? 'block' : 'none';
      }
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
      toast('文章不存在');
      return;
    }

    currentArticle = article;

    // 标记已读
    Store.markRead(article.id);

    // 记录历史
    Store.addHistory({ id: article.id, title: article.title });
    Render.renderHistory();

    // 渲染详情基本信息
    Render.renderDetail(article);

    // 高亮列表项
    $$('#listBox .list-item').forEach(function (el) {
      el.classList.toggle('current', el.getAttribute('data-id') === String(id));
    });

    // 加载 README（适配旧版 API.fetchReadme）
    loadReadme(article);

    // 刷新统计（因为标记了已读）
    refreshView();
  }

  /**
   * 加载 README（适配旧版 API.fetchReadme 接口）
   * 旧版返回 { ok: true, html: string } 或 { ok: false, reason: string, message: string }
   */
  function loadReadme(article) {
    var detailBox = $('#detailBox');

    // 旧版 API 使用 title 作为 fullName（即 "owner/repo"）
    var fullName = article.title || '';
    if (!fullName || fullName.indexOf('/') === -1) {
      // 没有 GitHub 仓库信息，跳过 README 加载
      return;
    }

    // 已缓存则直接使用
    if (article._readmeLoaded && article._readmeHtml) {
      if (detailBox) {
        detailBox.insertAdjacentHTML('beforeend',
          '<hr style="border:0;border-top:1px solid var(--border-color,#30363d);margin:24px 0;">' +
          '<div class="markdown-body">' + article._readmeHtml + '</div>'
        );
      }
      return;
    }

    // 显示加载提示
    if (detailBox) {
      detailBox.insertAdjacentHTML('beforeend',
        '<div id="readmeLoading" style="padding:24px;text-align:center;color:#888;">📖 正在加载 README...</div>'
      );
    }

    // 调用旧版 API
    API.fetchReadme(fullName).then(function (result) {
      var loader = $('#readmeLoading');
      if (loader) loader.remove();

      if (!detailBox) return;

      if (result.ok && result.html) {
        // 成功
        article._readmeLoaded = true;
        article._readmeHtml = result.html;

        detailBox.insertAdjacentHTML('beforeend',
          '<hr style="border:0;border-top:1px solid var(--border-color,#30363d);margin:24px 0;">' +
          '<div class="markdown-body">' + result.html + '</div>'
        );
      } else {
        // 失败
        var reason = result.reason || 'error';
        var msg = result.message || 'README 加载失败';
        var icon = reason === 'no-readme' ? '📭' : reason === 'rate-limit' ? '⏳' : '⚠️';

        detailBox.insertAdjacentHTML('beforeend',
          '<div style="padding:24px;text-align:center;color:#888;">' + icon + ' ' + msg + '</div>'
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
    document.body.classList.toggle('dark', isDark);
    var themeBtn = $('#themeBtn');
    if (themeBtn) {
      themeBtn.textContent = isDark ? '切换亮色模式' : '切换暗黑模式';
    }

    // 恢复字号
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
    el._timer = setTimeout(function () {
      el.classList.remove('show');
    }, 2000);
  }

})();