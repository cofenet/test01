/**
 * api.js - 数据请求层（整合列表缓存 + 静默刷新版）
 * 修复：强制新标签页打开 + Base64 乱码 + 完整列表缓存 + 全局链接点击保护
 */
const API = {
    baseUrl: 'https://api.github.com/search/repositories',

    queryMap: {
        'tech': ['topic:artificial-intelligence stars:>1000', 'topic:llm stars:>1000'],
        'python': [
            'language:python topic:web-development stars:>500',
            'language:python topic:data-science stars:>500',
            'language:python topic:automation stars:>300'
        ],
        'all': ['stars:>1000']
    },

    // ========== 列表缓存配置 ==========
    _listCachePrefix: 'gh_list_cache::',
    _listCacheTTL: 24 * 60 * 60 * 1000,

    _listCacheKey(category) {
        return this._listCachePrefix + category;
    },

    _getCachedList(category) {
        try {
            const raw = localStorage.getItem(this._listCacheKey(category));
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (Date.now() - obj.ts > this._listCacheTTL) return null;
            return obj.articles;
        } catch (e) { return null; }
    },

    _getStaleList(category) {
        try {
            const raw = localStorage.getItem(this._listCacheKey(category));
            if (!raw) return null;
            const obj = JSON.parse(raw);
            return obj.articles;
        } catch (e) { return null; }
    },

    _setCachedList(category, articles) {
        try {
            localStorage.setItem(
                this._listCacheKey(category),
                JSON.stringify({ ts: Date.now(), articles })
            );
        } catch (e) {
            console.warn('⚠️ [API] 列表缓存写入失败:', e);
        }
    },

    // ========== 基础请求封装 ==========
    async _proxyFetch(targetUrl, options = {}) {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
        console.log(`📡 [API] 发起代理请求: ${targetUrl}`);
        const res = await fetch(proxyUrl, options);
        console.log(`📡 [API] 代理响应状态码: ${res.status} (${targetUrl})`);
        return res;
    },

    // ========== 文章列表获取 ==========
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

    // ✅ 核心修复：确保所有链接都带 target="_blank"
    _processItems(merged, category) {
        const seen = new Set();
        const unique = merged.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        unique.sort((a, b) => b.stargazers_count - a.stargazers_count);
        const top = unique.slice(0, 20);

        return top.map(item => {
            const repoUrl = item.html_url || `https://github.com/${item.full_name}`;

            return {
                id: String(item.id),
                title: item.full_name,
                source: 'GitHub 开源热榜',
                date: item.updated_at ? item.updated_at.split('T')[0] : '未知',
                hot: `⭐ ${item.stargazers_count.toLocaleString()}`,
                category: category,
                url: repoUrl,
                content: `
                    <p><strong>📝 简介：</strong>${item.description || '暂无简介'}</p>
                    <p><strong>🌐 语言：</strong>${item.language || '未知'} | <strong>🔗 链接：</strong>
                    <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="external-link">${item.full_name}</a></p>
                    <p style="color:var(--text-secondary);font-size:0.9rem;margin-top:12px;">
                    ⭐ 星标：${item.stargazers_count.toLocaleString()} | 最后更新：${item.updated_at ? item.updated_at.split('T')[0] : '未知'}
                    </p>`
            };
        });
    },

    async fetchArticles(category = 'tech') {
        console.log(`🚀 [API] 开始拉取数据，分类: ${category}`);
        const loading = document.getElementById('listLoading');
        const queries = this.queryMap[category] || this.queryMap['tech'];

        const cached = this._getCachedList(category);
        if (cached && cached.length > 0) {
            console.log(`💾 [API] 命中列表缓存: ${category} (${cached.length}条)`);
            if (typeof Store !== 'undefined' && typeof Store.setArticles === 'function') {
                Store.setArticles(cached);
            }
            if (loading) loading.style.display = 'none';
            this._silentRefresh(category, queries);
            return cached;
        }

        if (loading) loading.style.display = 'block';

        try {
            const results = await Promise.all(queries.map(q => this._search(q)));
            const merged = results.flat();
            const articles = this._processItems(merged, category);

            console.log(`✅ [API] 成功转换 ${articles.length} 条数据`);

            if (typeof Store !== 'undefined' && typeof Store.setArticles === 'function') {
                Store.setArticles(articles);
            } else {
                console.error('❌ [API] Store.setArticles 方法不存在！请检查 store.js');
            }

            this._setCachedList(category, articles);
            return articles;

        } catch (e) {
            console.error('❌ [API] 数据获取失败:', e);
            const stale = this._getStaleList(category);
            if (stale && stale.length > 0) {
                console.log(`⚠️ [API] 网络失败，降级使用过期缓存: ${category}`);
                if (typeof showToast === 'function') showToast('网络异常，已加载上次缓存的数据');
                if (typeof Store !== 'undefined' && typeof Store.setArticles === 'function') {
                    Store.setArticles(stale);
                }
                return stale;
            }
            if (typeof showToast === 'function') showToast('获取开源热榜失败，请查看控制台');
            return [];
        } finally {
            if (loading) loading.style.display = 'none';
        }
    },

    async _silentRefresh(category, queries) {
        try {
            console.log(`🔄 [API] 开始后台静默刷新: ${category}`);
            const results = await Promise.all(queries.map(q => this._search(q)));
            const merged = results.flat();
            const articles = this._processItems(merged, category);
            this._setCachedList(category, articles);
            if (typeof Store !== 'undefined' && typeof Store.setArticles === 'function') {
                Store.setArticles(articles);
            }
            console.log(`✅ [API] 后台刷新完成: ${category} (${articles.length}条)`);
        } catch (e) {
            console.log('🔄 [API] 后台刷新失败，继续使用缓存:', e.message);
        }
    },

    /* ================= README 懒加载 ================= */
    _readmeCachePrefix: 'gh_readme_cache::',
    _readmeCacheMax: 30,
    _tokenKey: 'github_token',

    _authHeaders() {
        const headers = {};
        try {
            const token = localStorage.getItem(this._tokenKey);
            if (token && token.trim()) headers['Authorization'] = 'Bearer ' + token.trim();
        } catch (e) { /* 忽略存储异常 */ }
        return headers;
    },

    _getCachedReadme(fullName) {
        try {
            const raw = localStorage.getItem(this._readmeCachePrefix + fullName);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            return (obj && typeof obj.html === 'string') ? obj : null;
        } catch (e) { return null; }
    },

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

            doc.querySelectorAll('img[src]').forEach(el => {
                const src = el.getAttribute('src');
                if (src) el.setAttribute('src', fix(src, true));
            });

            doc.querySelectorAll('a[href]').forEach(el => {
                const href = el.getAttribute('href');
                if (!href) return;
                el.setAttribute('href', fix(href, false));
                // ✅ 确保 README 内的链接也强制新标签页
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
                el.classList.add('external-link');
            });

            return doc.body.innerHTML;
        } catch (e) {
            console.warn('⚠️ [API] _fixRelativeUrls 解析失败，返回原始HTML:', e);
            return html;
        }
    },

    _renderMarkdown(text) {
        if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
            return marked.parse(text);
        }
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<pre class="md-raw" style="white-space:pre-wrap;word-break:break-word;line-height:1.7;font-size:0.92rem;">' + escaped + '</pre>';
    },

    async fetchReadme(fullName) {
        if (!fullName || !fullName.includes('/')) {
            return { ok: false, reason: 'error', message: '仓库名格式不正确，无法加载 README。' };
        }

        const cached = this._getCachedReadme(fullName);
        if (cached) {
            console.log(`💾 [API] README 命中本地缓存: ${fullName}`);
            return { ok: true, html: cached.html, fromCache: true };
        }

        let apiFailInfo = null;

        try {
            const targetUrl = `https://api.github.com/repos/${fullName}/readme`;
            const res = await this._proxyFetch(targetUrl, {
                headers: Object.assign({ 'Accept': 'application/vnd.github.html+json' }, this._authHeaders())
            });

            if (res.ok) {
                const contentType = res.headers.get('content-type') || '';
                let html = '';

                if (contentType.includes('text/html')) {
                    html = this._fixRelativeUrls(await res.text(), fullName);
                } else {
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

        try {
            const candidates = ['README.md', 'readme.md', 'README.MD', 'README.rst', 'README.txt'];
            for (const name of candidates) {
                const targetUrl = `https://raw.githubusercontent.com/${fullName}/HEAD/${name}`;
                const r2 = await this._proxyFetch(targetUrl);

                if (r2.ok) {
                    const text = await r2.text();
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

        if (apiFailInfo && apiFailInfo.reason === 'rate-limit') {
            apiFailInfo.message = apiFailInfo.message.replace('正在尝试备用通道...', '备用通道也未能获取。请稍后重试或配置 GITHUB_TOKEN。');
        } else if (apiFailInfo) {
            apiFailInfo.message += '（备用通道也失败了，点击本项目可重试）';
        }
        return apiFailInfo || { ok: false, reason: 'error', message: 'README 加载失败，点击本项目可重试。' };
    }
};

// ✅ 全局链接点击保护：强制新标签页打开，阻止当前页跳转
(function () {
    'use strict';

    function handleExternalLink(e) {
        // 匹配所有外部链接和带 target="_blank" 的链接
        const link = e.target.closest('a.external-link, a[target="_blank"], a[href^="http"]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

        // 只对站外链接做处理，避免影响站内导航
        const isExternal = href.startsWith('http') && !href.includes(window.location.hostname);
        if (!isExternal) return;

        // ✅ 核心：阻止默认跳转行为，强制新标签页打开
        e.preventDefault();
        e.stopPropagation();

        try {
            const win = window.open(href, '_blank', 'noopener,noreferrer');
            // 部分浏览器弹窗拦截器会返回 null 或立即关闭
            if (!win || win.closed || typeof win.closed === 'undefined') {
                console.warn('⚠️ [LinkGuard] window.open 被拦截，尝试备用方案');
                // 备用方案：创建临时 a 标签触发新标签页（绕过部分 CSP 限制）
                const tempLink = document.createElement('a');
                tempLink.href = href;
                tempLink.target = '_blank';
                tempLink.rel = 'noopener noreferrer';
                tempLink.style.display = 'none';
                document.body.appendChild(tempLink);
                tempLink.click();
                document.body.removeChild(tempLink);
            }
        } catch (err) {
            console.warn('⚠️ [LinkGuard] 打开链接异常:', err);
            // 最终兜底：仍然尝试新标签页
            window.open(href, '_blank');
        }
    }

    // 使用捕获阶段，确保在其他 click 监听器之前执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            document.body.addEventListener('click', handleExternalLink, true);
        });
    } else {
        document.body.addEventListener('click', handleExternalLink, true);
    }
})();