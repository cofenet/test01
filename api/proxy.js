// api/proxy.js (Vercel Serverless Function)
export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        // ✅ 关键修改：优先使用前端传入的 Accept 头，未传时才用默认值
        const acceptHeader = req.headers['accept'] || 'application/vnd.github.v3+json';
        
        const response = await fetch(url, {
            headers: {
                'Authorization': process.env.GITHUB_TOKEN ? `token ${process.env.GITHUB_TOKEN}` : '',
                'Accept': acceptHeader, // ← 动态透传，不再硬编码
                'User-Agent': 'GitHub-Readme-Reader/1.0'
            }
        });

        const data = await response.text();

        // 设置 CORS 和缓存
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        // ✅ 透传 GitHub 返回的真实 Content-Type，避免浏览器误判
        const contentType = response.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);

        res.status(response.status).send(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}