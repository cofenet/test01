/**
 * api.js - 数据请求层（最终整合修复版）
 * 修复：右侧 Base64 乱码 + 恢复完整列表数据获取逻辑
 */
const API = {
    baseUrl: 'https://api.github.com/search/repositories',

    // 每个分类可配置多条查询（分别请求后合并，避免使用 OR 语法触发 422）
    queryMap: {
        'tech': ['topic:artificial-intelligence stars:>1000', 'topic:llm stars:>1000'],
        'sport': ['sports stars:>500'],
        'all': ['stars:>1000']
    },

    // ========== 基础请求封装（强制走 Vercel 代理） ==========
    
    /**
     * 通过 Vercel Serverless 代理发起请求
     * @param {string} targetUrl - 真实的 GitHub API / raw 地址
     * @param {object} options - fetch 配置项
     */
    async _proxyFetch(targetUrl, options = {}) {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
        console.log(`📡 [API] 发起代理请求: ${targetUrl}`);
        
        const res = await fetch(proxyUrl, options);
        console.log(`📡 [API] 代理响应状态码: ${res.status} (${targetUrl})`);
        return res;
    },

    // ========== 文章列表获取 ==========

    // 单次搜索请求
    async _search(query) {
        const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=15`;
        const res = await this._proxyFetch(url);
        
        if (!res.ok) throw new Error(`GitHub API 响应异常: ${res.status}`);
        const json = await res.json();
        if (!json.items || !Array.isArray(json.items)) {
            console.error('❌ [API] GitHub 返回的数据格式错误:', json);
            throw new Error('数据格式异常');
        }
        return json.items;
    },

    async fetchArticles(category = 'tech') {
        console.log(`🚀 [API] 开始拉取数据，分类: ${category}`);

        const loading = document.getElementById('listLoading');
        if (loading) loading.style.display = 'block';

        const queries = this.queryMap[category] || this.queryMap['tech'];

        try {
            // 1. 多条查询并行发送，合并结果
            const results = await Promise.all(queries.map(q => this._search(q)));
            const merged = results.flat();

            // 2. 按项目 id 去重（同一项目可能同时命中多条查询）
            const seen = new Set();
            const unique = merged.filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });

            // 3. 按星标数降序，取前 20 条
            unique.sort((a, b) => b.stargazers_count - a.stargazers_count);
            const top = unique.slice(0, 20);

            // 4. 转换为阅读器标准格式
            const articles = top.map(item => ({
                id: String(item.id),
                title: item.full_name,
                source: 'GitHub 开源热榜',
                date: item.updated_at ? item.updated_at.split('T')[0] : '未知',
                hot: `⭐ ${item.stargazers_count.toLocaleString()}`,
                category: category,
                content: `
                    <p><strong>📝 简介：</strong>${item.description || '暂无简介'}</p>
                    <p><strong>🌐 语言：</strong>${item.language || '未知'} | <strong>🔗 链接：</strong>
                    <a href="${item.html_url}" target="_blank" rel="noopener">${item.full_name}</a></p>
                    <p style="color:var(--text-secondary);font-size:0.9rem;margin-top:12px;">
                    ⭐ 星标：${item.stargazers_count.toLocaleString()} | 最后更新：${item.updated_at ? item.updated_at.split('T')[0] : '未知'}
                    </p>`
            }));

            console.log(`✅ [API] 成功转换 ${articles.length} 条数据`);

            // 5. 存入 Store
            if (typeof Store !== 'undefined' && typeof Store.setArticles === 'function') {
                Store.setArticles(articles);
                console.log('💾 [API] 数据已存入 Store');
            } else {
                console.error('❌ [API] Store.setArticles 方法不存在！请检查 store.js');
            }

            return articles;

        } catch (e) {
            console.error('❌ [API] 数据获取失败:', e);
            if (typeof showToast === 'function') showToast('获取开源热榜失败，请查看控制台');
            return []; // 失败返回空数组，防止后续报错
        } finally {
            if (loading) loading.style.display = 'none';
        }
    },

    /* ================= README 懒加载（多级容错 + Base64解码 + Markdown渲染） ================= */

    // localStorage 缓存配置
    _readmeCachePrefix: 'gh_readme_cache::',
    _readmeCacheMax: 30,
    _tokenKey: 'github_token',

    // 可选的认证头
    _authHeaders() {
        const headers = {};
        try {
            const token = localStorage.getItem(this._tokenKey);
            if (token && token.trim()) headers['Authorization'] = 'Bearer ' + token.trim();
        } catch (e) { /* 忽略存储异常 */ }
        return headers;
    },

    // ---------- README 本地缓存：读取 ----------
    _getCachedReadme(fullName) {
        try {
            const raw = localStorage.getItem(this._readmeCachePrefix + fullName);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            return (obj && typeof obj.html === 'string') ? obj : null;
        } catch (e) { return null; }
    },

    // ---------- README 本地缓存：写入 ----------
    _setCachedReadme(fullName, html) {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(this._readmeCachePrefix)) keys.push(k);
            }
            if (keys.length >= this._readmeCacheMax) {
                let oldest = null, oldestTs = Infinity;
                keys.forEach(k => {
                    try {
                        const o = JSON.parse(localStorage.getItem(k));
                        if (o && o.ts < oldestTs) { oldestTs = o.ts; oldest = k; }
                    } catch (e) { localStorage.removeItem(k); }
                });
                if (oldest) localStorage.removeItem(oldest);
            }
            localStorage.setItem(this._readmeCachePrefix + fullName, JSON.stringify({ ts: Date.now(), html }));
        } catch (e) {
            console.warn('⚠️ [API] README 缓存写入失败:', e);
        }
    },

    // ---------- 修复 README 中的相对路径 ----------
    _fixRelativeUrls(html, fullName) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rawBase = `https://raw.githubusercontent.com/${fullName}/HEAD/`;
            const blobBase = `https://github.com/${fullName}/blob/HEAD/`;
            const fix = (u, isImg) => {
                if (!u) return u;
                if (/^(https?:)?\/\//i.test(u) || u.startsWith('data:') || u.startsWith('#') || u.startsWith('mailto:')) return u;
                if (u.startsWith('/')) return 'https://github.com' + u;
                const clean = u.replace(/^\.\//, '');
                return isImg ? rawBase + clean : blobBase + clean;
            };
            doc.querySelectorAll('img[src]').forEach(el => el.setAttribute('src', fix(el.getAttribute('src'), true)));
            doc.querySelectorAll('a[href]').forEach(el => {
                el.setAttribute('href', fix(el.getAttribute('href'), false));
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener');
            });
            return doc.body.innerHTML;
        } catch (e) {
            return html;
        }
    },

    // ---------- 🆕 Markdown 转 HTML（集成 marked.js） ----------
    _renderMarkdown(text) {
        if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
            return marked.parse(text);
        }
        // 兜底：简单转义
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<pre class="md-raw" style="white-space:pre-wrap;word-break:break-word;line-height:1.7;font-size:0.92rem;">' + escaped + '</pre>';
    },

    /**
     * 获取指定仓库的 README 文档
     * 修复点：增加 Base64 自动解码 + marked.js 渲染
     */
    async fetchReadme(fullName) {
        if (!fullName || !fullName.includes('/')) {
            return { ok: false, reason: 'error', message: '仓库名格式不正确，无法加载 README。' };
        }

        // 0. 命中本地缓存
        const cached = this._getCachedReadme(fullName);
        if (cached) {
            console.log(`💾 [API] README 命中本地缓存: ${fullName}`);
            return { ok: true, html: cached.html, fromCache: true };
        }

        let apiFailInfo = null;

        // 1. GitHub API HTML 渲染接口（走代理）
        try {
            const targetUrl = `https://api.github.com/repos/${fullName}/readme`;
            const res = await this._proxyFetch(targetUrl, {
                headers: Object.assign({ 'Accept': 'application/vnd.github.html+json' }, this._authHeaders())
            });

            if (res.ok) {
                const contentType = res.headers.get('content-type') || '';
                let html = '';

                // 🆕 核心修复：检测返回内容是否为 HTML
                if (contentType.includes('text/html')) {
                    html = this._fixRelativeUrls(await res.text(), fullName);
                } else {
                    // ⚠️ 代理未透传 Accept 头，GitHub 返回了 Base64 JSON
                    console.warn('⚠️ [API] 主通道返回非HTML，尝试Base64解码...');
                    const json = await res.json();
                    if (json.content) {
                        const decoded = decodeURIComponent(escape(atob(json.content.replace(/\s/g, ''))));
                        html = this._fixRelativeUrls(this._renderMarkdown(decoded), fullName);
                    } else {
                        throw new Error('返回数据缺少 content 字段');
                    }
                }

                this._setCachedReadme(fullName, html);
                return { ok: true, html, fromCache: false };
            }

            if (res.status === 404) {
                return { ok: false, reason: 'no-readme', message: '该仓库确实没有 README 文档。' };
            }

            if (res.status === 403 || res.status === 429) {
                const remaining = res.headers.get('X-RateLimit-Remaining');
                const reset = res.headers.get('X-RateLimit-Reset');
                const resetStr = reset ? new Date(reset * 1000).toLocaleTimeString() : '稍后';
                apiFailInfo = {
                    ok: false, reason: 'rate-limit',
                    message: `GitHub API 频率限制已用尽（剩余 ${remaining ?? '未知'} 次），将于 ${resetStr} 重置。正在尝试备用通道...`
                };
            } else {
                apiFailInfo = { ok: false, reason: 'error', message: `README 接口返回异常 ${res.status}。正在尝试备用通道...` };
            }
            console.warn(`⚠️ [API] README 主通道失败(${res.status})，尝试 raw 备用通道...`);
        } catch (e) {
            apiFailInfo = { ok: false, reason: 'network', message: '网络请求失败。正在尝试备用通道...' };
            console.warn('⚠️ [API] README 主通道网络异常，尝试 raw 备用通道...', e);
        }

        // 2. 备用通道：raw.githubusercontent.com（走代理）+ marked.js 渲染
        try {
            const candidates = ['README.md', 'readme.md', 'README.MD', 'README.rst', 'README.txt'];
            for (const name of candidates) {
                const targetUrl = `https://raw.githubusercontent.com/${fullName}/HEAD/${name}`;
                const r2 = await this._proxyFetch(targetUrl);
                
                if (r2.ok) {
                    const text = await r2.text();
                    // 🆕 使用 marked.js 渲染，不再是纯文本
                    const html = this._fixRelativeUrls(this._renderMarkdown(text), fullName);
                    this._setCachedReadme(fullName, html);
                    console.log(`✅ [API] raw 备用通道成功: ${fullName}/${name}`);
                    return { ok: true, html, fromCache: false, rawFallback: true };
                }
                if (r2.status === 403 || r2.status === 429) break;
            }
        } catch (e) {
            console.warn('⚠️ [API] raw 备用通道也失败:', e);
        }

        // 3. 全部失败
        if (apiFailInfo && apiFailInfo.reason === 'rate-limit') {
            apiFailInfo.message = apiFailInfo.message.replace('正在尝试备用通道...', '备用通道也未能获取。请稍后重试或配置 GITHUB_TOKEN。');
        } else if (apiFailInfo) {
            apiFailInfo.message += '（备用通道也失败了，点击本项目可重试）';
        }
        return apiFailInfo || { ok: false, reason: 'error', message: 'README 加载失败，点击本项目可重试。' };
    }
};