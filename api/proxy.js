/**
 * Vercel Serverless Function - 通用 API 代理
 * 路径：api/proxy.js
 * 
 * 支持两种调用方式：
 * 1. 旧版透传：/api/proxy?url=https://api.github.com/...
 * 2. 新版目标：/api/proxy?target=readme&owner=xx&repo=yy
 */

// eslint-disable-next-line
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // =============================================
    // 模式 1：旧版 url 透传（api.js 使用的模式）
    // /api/proxy?url=https://api.github.com/search/repositories?q=...
    // =============================================
    if (req.query.url) {
      var targetUrl = req.query.url;

      // 安全校验：只允许 GitHub 相关域名
      var allowedHosts = [
        'api.github.com',
        'raw.githubusercontent.com',
        'gist.githubusercontent.com'
      ];

      var parsedUrl;
      try {
        parsedUrl = new URL(targetUrl);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      if (allowedHosts.indexOf(parsedUrl.hostname) === -1) {
        return res.status(403).json({
          error: 'Host not allowed: ' + parsedUrl.hostname,
          allowed: allowedHosts
        });
      }

      // 构建转发请求头
      var headers = {
        'User-Agent': 'local-reader-proxy/1.0',
        'Accept': req.headers['accept'] || 'application/json'
      };

      // 透传 Authorization（如果客户端发了的话）
      if (req.headers['authorization']) {
        headers['Authorization'] = req.headers['authorization'];
      }

      // 使用服务端 GITHUB_TOKEN（优先级高于客户端）
      var ghToken = process.env.GITHUB_TOKEN || '';
      if (ghToken && parsedUrl.hostname === 'api.github.com') {
        headers['Authorization'] = 'token ' + ghToken;
      }

      console.log('[proxy] 透传请求:', targetUrl);

      var proxyRes = await fetch(targetUrl, { headers: headers });

      // 透传响应头
      var ct = proxyRes.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);

      var rlRemaining = proxyRes.headers.get('x-ratelimit-remaining');
      var rlReset = proxyRes.headers.get('x-ratelimit-reset');
      if (rlRemaining) res.setHeader('X-RateLimit-Remaining', rlRemaining);
      if (rlReset) res.setHeader('X-RateLimit-Reset', rlReset);

      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

      // 透传响应体
      var body = await proxyRes.text();
      return res.status(proxyRes.status).send(body);
    }

    // =============================================
    // 模式 2：新版 target 路由
    // =============================================
    var target = req.query.target;

    // --- README ---
    if (target === 'readme') {
      var owner = req.query.owner;
      var repo = req.query.repo;

      if (!owner || !repo) {
        return res.status(400).json({ error: 'Missing owner or repo' });
      }

      var ghToken2 = process.env.GITHUB_TOKEN || '';
      var readmeUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/readme';

      var ghRes = await fetch(readmeUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'local-reader-proxy/1.0',
          'Authorization': ghToken2 ? 'token ' + ghToken2 : ''
        }
      });

      if (!ghRes.ok) {
        // fallback to raw
        var fallbackUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/HEAD/README.md';
        var fbRes = await fetch(fallbackUrl, {
          headers: { 'User-Agent': 'local-reader-proxy/1.0' }
        });

        if (!fbRes.ok) {
          return res.status(ghRes.status).json({ error: 'README not found' });
        }

        var fbText = await fbRes.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).send(fbText);
      }

      var readmeText = await ghRes.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).send(readmeText);
    }

    // --- Weather ---
    if (target === 'weather') {
      var city = req.query.city || '北京';
      var weatherUrl = 'https://wttr.in/' + encodeURIComponent(city) + '?format=%l｜%C｜%t';

      var wRes = await fetch(weatherUrl, {
        headers: { 'User-Agent': 'curl/7.68.0' }
      });

      if (!wRes.ok) {
        return res.status(502).json({ error: 'Weather API failed' });
      }

      var wText = await wRes.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=1800');
      return res.status(200).send(wText.trim());
    }

    // --- 未知 target ---
    return res.status(400).json({
      error: 'Unknown target or missing url parameter',
      hint: 'Use ?url=<github-api-url> or ?target=readme|weather'
    });

  } catch (err) {
    console.error('[proxy error]', err.message);
    return res.status(500).json({ error: 'Internal proxy error: ' + err.message });
  }
};