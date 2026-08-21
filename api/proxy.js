// api/proxy.js (Vercel Serverless Function)
export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const response = await fetch(url, {
            headers: {
                // 如果你在 Vercel 环境变量配置了 GITHUB_TOKEN，这里加上可以提升到 5000次/小时
                'Authorization': process.env.GITHUB_TOKEN ? `token ${process.env.GITHUB_TOKEN}` : '',
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const data = await response.text();
        
        // 设置 CORS 允许你的 Vercel 域名访问
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // 缓存5分钟，极大节省API额度
        res.status(response.status).send(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}