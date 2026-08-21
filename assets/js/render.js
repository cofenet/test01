/**
 * render.js - DOM 渲染层
 * 挂载到全局 window.Render 对象
 */

window.Render = (function () {

  /**
   * 渲染左侧文章列表
   */
  function renderList(articles) {
    var listBox = document.getElementById('listBox');
    if (!listBox) return;

    if (!articles || articles.length === 0) {
      listBox.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">暂无相关文章</div>';
      return;
    }

    var html = articles.map(function (article) {
      var isRead = window.Store && window.Store.isRead(article.id);
      var isStar = window.Store && window.Store.isStar(article.id);
      
      return '<div class="list-item ' + (isRead ? 'read' : '') + '" data-id="' + article.id + '">' +
        '<div class="list-item-header">' +
          '<span class="list-item-title">' + escapeHtml(article.title) + '</span>' +
          '<button class="star-btn ' + (isStar ? 'active' : '') + '" data-star="' + article.id + '" aria-label="收藏">' + 
            (isStar ? '⭐' : '☆') + 
          '</button>' +
        '</div>' +
        '<div class="list-item-desc">' + escapeHtml(article.description) + '</div>' +
      '</div>';
    }).join('');

    listBox.innerHTML = html;
  }

  /**
   * 更新统计信息
   */
  function updateStat(articles) {
    var statBox = document.getElementById('statBox');
    if (!statBox || !articles) return;
    
    var total = articles.length;
    var readCount = articles.filter(function (a) { return window.Store && window.Store.isRead(a.id); }).length;
    
    // ✅ 计算收藏数
    var starCount = 0;
    if (window.Store) {
        if (typeof window.Store.getStarCount === 'function') {
            starCount = window.Store.getStarCount();
        } else if (typeof window.Store.getStars === 'function') {
            var stars = window.Store.getStars();
            if (Array.isArray(stars)) {
                starCount = stars.length;
            } else if (typeof stars === 'object' && stars !== null) {
                starCount = Object.keys(stars).filter(function(k) { return stars[k]; }).length;
            }
        }
    }
    
    statBox.innerHTML = '共 <strong>' + total + '</strong> 篇，已读 <strong>' + readCount + '</strong> 篇，收藏：<strong>' + starCount + '</strong> 篇';
}
  }

  /**
   * 更新收藏统计信息（新增）
   */
  function updateFavoritesStat() {
    var container = document.getElementById('favorites-list');
    if (!container) return;

    var count = 0;
    if (window.Store) {
      if (typeof window.Store.getStarCount === 'function') {
        count = window.Store.getStarCount();
      } else if (typeof window.Store.getStars === 'function') {
        var stars = window.Store.getStars();
        if (Array.isArray(stars)) {
          count = stars.length;
        } else if (typeof stars === 'object' && stars !== null) {
          count = Object.keys(stars).filter(function(k) { return stars[k]; }).length;
        }
      }
    }

    container.innerHTML = '收藏：<strong>' + count + '</strong> 篇';
  }

  /**
   * 渲染浏览历史
   */
  function renderHistory() {
    var historyItems = document.getElementById('historyItems');
    if (!historyItems) return;

    var history = (window.Store && window.Store.getHistory) ? window.Store.getHistory() : [];
    
    if (history.length === 0) {
      historyItems.innerHTML = '<div style="padding:10px;color:#999;font-size:0.875rem;">暂无浏览记录</div>';
      return;
    }

    var html = history.slice(0, 10).map(function (item) {
      return '<div class="history-item" data-hid="' + item.id + '">' + escapeHtml(item.title) + '</div>';
    }).join('');

    historyItems.innerHTML = html;
  }

  /**
   * 渲染右侧文章详情（基本信息）
   * ⚠️ 注意：此方法会清空 #detailBox，后续 README 内容由 app.js 追加
   */
  function renderDetail(article) {
    var detailBox = document.getElementById('detailBox');
    if (!detailBox || !article) return;

    var isRead = window.Store && window.Store.isRead(article.id);
    var isStar = window.Store && window.Store.isStar(article.id);

    var html = '<div class="article-header">' +
      '<h2 class="article-title">' + escapeHtml(article.title) + '</h2>' +
      '<div class="article-meta">' +
        '<span>👤 ' + escapeHtml(article.author || 'Unknown') + '</span>' +
        '<span>📅 ' + formatDate(article.createdAt) + '</span>' +
      '</div>' +
      '<div class="article-actions">' +
        '<button class="action-btn" data-action="toggle-read">' + (isRead ? '📖 标为未读' : '👁️ 标为已读') + '</button>' +
        '<button class="action-btn" data-action="toggle-star">' + (isStar ? '💔 取消收藏' : '⭐ 收藏文章') + '</button>' +
        '<a href="' + (article.url || '#') + '" target="_blank" class="action-btn">🔗 访问原文</a>' +
      '</div>' +
    '</div>' +
    '<div class="article-desc" style="padding:16px 0;border-bottom:1px solid var(--border-color,#eee);margin-bottom:24px;">' + 
      escapeHtml(article.description) + 
    '</div>';

    // 清空容器并插入基本信息
    detailBox.innerHTML = html;

    // 如果 README 已经加载过，直接追加缓存内容
    if (article._readmeLoaded && article._readmeHtml) {
      detailBox.insertAdjacentHTML('beforeend',
        '<hr style="border:0;border-top:1px solid var(--border-color,#30363d);margin:24px 0;">' +
        '<div class="markdown-body">' + article._readmeHtml + '</div>'
      );
    }
  }

  // --- 辅助函数 ---
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    } catch (e) {
      return dateStr;
    }
  }

  return {
    renderList: renderList,
    updateStat: updateStat,
    updateFavoritesStat: updateFavoritesStat, // ✅ 新增导出
    renderHistory: renderHistory,
    renderDetail: renderDetail
  };
})();