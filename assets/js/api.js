/**
 * api.js - 数据请求层（已修复 Base64 乱码）
 * 使用全局函数，兼容传统 script 标签引入
 */

// ⚠️ 请根据实际仓库确认分支名（main 或 master）
var DEFAULT_BRANCH = 'main';

/**
 * 获取文章内容（纯文本/Markdown）
 * @param {string} repoPath - 仓库路径，如 "headroomlabs-ai/headroom"
 * @param {string} [filePath] - 文件路径，默认为 README.md
 */
function fetchArticleContent(repoPath, filePath) {
  var path = filePath || 'README.md';
  var rawUrl = 'https://raw.githubusercontent.com/' + repoPath + '/' + DEFAULT_BRANCH + '/' + path;

  return fetch(rawUrl)
    .then(function (response) {
      if (!response.ok) {
        throw new Error('请求失败 (HTTP ' + response.status + ')');
      }
      // ✅ 直接返回纯文本，无需 atob() 解码
      return response.text();
    })
    .catch(function (err) {
      console.error('[API] 获取文章内容失败:', err);
      throw err;
    });
}

// ⚠️ 如果原文件中还有其他函数（如 fetchNewsList），请务必保留！
// 以下为占位示例，请替换为原始实现
function fetchNewsList() {
  console.warn('[API] fetchNewsList 需保留原有实现');
  return Promise.resolve([]);
}