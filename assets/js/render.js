/**
 * render.js - DOM 渲染层 (类名对齐修复版)
 */
window.Render = (function () {

  function renderList(articles) {
    var listBox = document.getElementById('listBox');
    if (!listBox) return;

    if (!articles || articles.length === 0) {
      listBox.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">暂无相关文章</div>';
      return;
    }

    var html = articles.map(function (article) {
      var isRead = window.Store && window.Store.isRead(article.id);
      var isStar = window.Store && window.Store.isStar(article.id);
      
      return '<div class="list-item ' + (isRead ? 'read' : '') + '" data-id="' + article.id + '">' +
        '<div class="item-title">' + escapeHtml(article.title) + '</div>' +
        '<div class="item-meta">' +
          '<span class="read-marker"></span>' +
          '<span>' + escapeHtml(article.author || '') + '</span>' +
          '<span class="star-icon" data-star="' + article.id + '" aria-label="收藏">' + 
            (isStar ? '⭐' : '☆') + 
          '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    listBox.innerHTML = html;
  }

  function updateStat(articles) {
    var statBox = document.getElementById('statBox');
    if (!statBox) return;

    if (!articles && window.Store && typeof window.Store.getArticles === 'function') {
      articles = window.Store.getArticles();
    }
    if (!articles) return;
    
    var total = articles.length;
    var readCount = articles.filter(function (a) { return window.Store && window.Store.isRead(a.id); }).length;
    
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

  function renderHistory() {
    var historyItems = document.getElementById('historyItems');
    if (!historyItems) return;

    var history = (window.Store && window.Store.getHistory) ? window.Store.getHistory() : [];
    
    if (history.length === 0) {
      historyItems.innerHTML = '<div style="padding:10px;color:var(--text-secondary);font-size:0.875rem;">暂无浏览记录</div>';
      return;
    }

    var html = history.slice(0, 10).map(function (item) {
      return '<div class="history-item" data-hid="' + item.id + '">' + escapeHtml(item.title) + '</div>';
    }).join('');

    historyItems.innerHTML = html;
  }

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
        '<button class="tool-btn" data-action="toggle-read">' + (isRead ? '📖 标为未读' : '👁️ 标为已读') + '</button>' +
        '<button class="tool-btn" data-action="toggle-star">' + (isStar ? '💔 取消收藏' : '⭐ 收藏文章') + '</button>' +
        '<a href="' + (article.url || '#') + '" target="_blank" class="tool-btn" style="display:inline-flex;align-items:center;text-decoration:none;">🔗 访问原文</a>' +
      '</div>' +
    '</div>' +
    '<div class="article-desc" style="padding:16px 0;border-bottom:1px solid var(--border-color);margin-bottom:24px;line-height:1.8;">' + 
      escapeHtml(article.description) + 
    '</div>';

    detailBox.innerHTML = html;

    if (article._readmeLoaded && article._readmeHtml) {
      detailBox.insertAdjacentHTML('beforeend',
        '<hr style="border:0;border-top:1px solid var(--border-color);margin:24px 0;">' +
        '<div class="markdown-body">' + article._readmeHtml + '</div>'
      );
    }
  }

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
    renderHistory: renderHistory,
    renderDetail: renderDetail
  };
})();