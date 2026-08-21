/**
 * store.js - 本地存储层
 * 提供已读、收藏、历史、主题、字号的持久化存储
 */

window.Store = (function () {
  'use strict';

  // ========== Key 配置（按需修改）==========
  var KEYS = {
    READ: 'app_read_list',
    STAR: 'app_star_list',
    HISTORY: 'app_history',
    THEME: 'app_theme',
    FONT_SIZE: 'app_font_size',
    ARTICLES: 'app_articles_cache'
  };

  // ========== 内部工具 ==========

  function getJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[Store] 写入失败:', key, e);
    }
  }

  // ========== 已读管理 ==========

  function isRead(id) {
    var list = getJSON(KEYS.READ, []);
    return list.indexOf(String(id)) !== -1;
  }

  function markRead(id) {
    var list = getJSON(KEYS.READ, []);
    var sid = String(id);
    if (list.indexOf(sid) === -1) {
      list.push(sid);
      setJSON(KEYS.READ, list);
    }
  }

  function toggleRead(id) {
    var list = getJSON(KEYS.READ, []);
    var sid = String(id);
    var idx = list.indexOf(sid);
    if (idx === -1) {
      list.push(sid);
      setJSON(KEYS.READ, list);
      return true; // 现在已读
    } else {
      list.splice(idx, 1);
      setJSON(KEYS.READ, list);
      return false; // 现在未读
    }
  }

  function clearAllRead() {
    setJSON(KEYS.READ, []);
  }

  // ========== 收藏管理 ==========

  function isStar(id) {
    var list = getJSON(KEYS.STAR, []);
    return list.indexOf(String(id)) !== -1;
  }

  function toggleStar(id) {
    var list = getJSON(KEYS.STAR, []);
    var sid = String(id);
    var idx = list.indexOf(sid);
    if (idx === -1) {
      list.push(sid);
      setJSON(KEYS.STAR, list);
      return true; // 已收藏
    } else {
      list.splice(idx, 1);
      setJSON(KEYS.STAR, list);
      return false; // 已取消
    }
  }

  function clearAllStar() {
    setJSON(KEYS.STAR, []);
  }

  /**
   * 获取收藏总数
   * @returns {number}
   */
  function getStarCount() {
    var list = getJSON(KEYS.STAR, []);
    if (Array.isArray(list)) return list.length;
    // 兼容旧版 { id: true } 对象格式
    if (typeof list === 'object' && list !== null) {
      var count = 0;
      for (var k in list) {
        if (list.hasOwnProperty(k) && list[k]) count++;
      }
      return count;
    }
    return 0;
  }

  // ========== 浏览历史 ==========

  function getHistory() {
    return getJSON(KEYS.HISTORY, []);
  }

  function addHistory(item) {
    var list = getJSON(KEYS.HISTORY, []);
    // 去重：移除同 id 的旧记录
    list = list.filter(function (h) { return String(h.id) !== String(item.id); });
    // 插入到最前面
    list.unshift({
      id: String(item.id),
      title: item.title || '无标题',
      time: Date.now()
    });
    // 最多保留 50 条
    if (list.length > 50) list = list.slice(0, 50);
    setJSON(KEYS.HISTORY, list);
  }

  function clearHistory() {
    setJSON(KEYS.HISTORY, []);
  }

  // ========== 主题 & 字号 ==========

  function getTheme() {
    return localStorage.getItem(KEYS.THEME) || 'light';
  }

  function setTheme(theme) {
    localStorage.setItem(KEYS.THEME, theme);
  }

  function getFontSize() {
    return localStorage.getItem(KEYS.FONT_SIZE) || '16';
  }

  function setFontSize(size) {
    localStorage.setItem(KEYS.FONT_SIZE, String(size));
  }

  // ========== 文章缓存（可选）==========

  function getArticles() {
    return getJSON(KEYS.ARTICLES, []);
  }

  function setArticles(articles) {
    setJSON(KEYS.ARTICLES, articles);
  }

  // ========== 公开接口 ==========

  return {
    // 已读
    isRead: isRead,
    markRead: markRead,
    toggleRead: toggleRead,
    clearAllRead: clearAllRead,
    // 收藏
    isStar: isStar,
    toggleStar: toggleStar,
    clearAllStar: clearAllStar,
    getStarCount: getStarCount,
    // 历史
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    // 主题 & 字号
    getTheme: getTheme,
    setTheme: setTheme,
    getFontSize: getFontSize,
    setFontSize: setFontSize,
    // 文章缓存
    getArticles: getArticles,
    setArticles: setArticles
  };
})();