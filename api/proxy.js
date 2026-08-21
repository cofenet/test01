/**
 * Vercel Serverless Function - API 代理
 * 路径：api/proxy.js
 * 用途：代理 GitHub API 和天气 API，避免跨域和 Token 泄露
 */

// eslint-disable-next-line
module.exports = async function handler(req, res) {
  // CORS 预检
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var target = req.query.target;

  try {
    // --- 代理 GitHub README ---
    if (target === 'readme') {
      var owner = req.query.owner;
      var repo = req.query.repo;

      if (!owner || !repo) {
        return res.status(400).json({ error: 'Missing owner or repo' });
      }

      var ghToken = process.env.GITHUB_TOKEN || '';
      var url = 'https://api.github.com/repos/' + owner + '/' + repo + '/readme';

      var ghRes = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'local-reader-proxy',
          'Authorization': ghToken ? 'token ' + ghToken : ''
        }
      });

      if (!ghRes.ok) {
        // 尝试 fallback 到 master 分支
        var fallbackUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/master/README.md';
        var fallbackRes = await fetch(fallbackUrl, {
          headers: { 'User-Agent': 'local-reader-proxy' }
        });

        if (!fallbackRes.ok) {
          return res.status(ghRes.status).json({
            error: 'README not found',
            status: ghRes.status
          });
        }

        var fallbackText = await fallbackRes.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).send(fallbackText);
      }

      var readmeText = await ghRes.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.status(200).send(readmeText);
    }

    // --- 代理天气 API ---
    if (target === 'weather') {
      var city = req.query.city || '北京';
      var weatherUrl = 'https://wttr.in/' + encodeURIComponent(city) + '?format=%l｜%C｜%t';

      var weatherRes = await fetch(weatherUrl, {
        headers: { 'User-Agent': 'curl/7.68.0' }
      });

      if (!weatherRes.ok) {
        return res.status(502).json({ error: 'Weather API failed' });
      }

      var weatherText = await weatherRes.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=1800');
      return res.status(200).send(weatherText.trim());
    }

    // --- 代理文章列表 ---
    if (target === 'articles') {
      var dataUrl = req.query.url;
      if (!dataUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      // 安全校验：只允许白名单域名
      var allowedHosts = ['raw.githubusercontent.com', 'gist.githubusercontent.com', 'api.github.com'];
      var parsedUrl;
      try {
        parsedUrl = new URL(dataUrl);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid URL' });
      }

      if (allowedHosts.indexOf(parsedUrl.hostname) === -1) {
        return res.status(403).json({ error: 'Host not allowed' });
      }

      var dataRes = await fetch(dataUrl, {
        headers: {
          'User-Agent': 'local-reader-proxy',
          'Accept': 'application/json'
        }
      });

      if (!dataRes.ok) {
        return res.status(dataRes.status).json({ error: 'Fetch failed' });
      }

      var jsonData = await dataRes.json();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
      return res.status(200).json(jsonData);
    }

    // --- 未知 target ---
    return res.status(400).json({ error: 'Unknown target: ' + target });

  } catch (err) {
    console.error('[proxy error]', err.message);
    return res.status(500).json({ error: 'Internal proxy error' });
  }
};