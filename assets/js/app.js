const App = {
    currentFiltered: [],
    currentCat: 'all',
    _openingId: null,

    async init() {
        const loading = document.getElementById('listLoading');
        if (loading) loading.style.display = 'block';

        const defaultCat = (this.currentCat === 'all') ? 'tech' : this.currentCat;

        try {
            const articles = await API.fetchArticles(defaultCat);
            Store.setArticles(articles);
            this.currentFiltered = articles;

            Render.renderList(articles);
            Render.updateStat(articles);
            Render.renderHistory();
        } catch (e) {
            console.error('初始化加载失败', e);
            showToast('数据加载失败，请检查网络后重试');
        } finally {
            if (loading) loading.style.display = 'none';
        }

        this.bindEvents();
        this.initTheme();
    },

    /**
     * 异步过滤文章
     */
    async filterArticles() {
        const loading = document.getElementById('listLoading');
        let articles = [];

        try {
            if (this.currentCat === 'tech' || this.currentCat === 'sport') {
                if (loading) loading.style.display = 'block';
                articles = await API.fetchArticles(this.currentCat);
                Store.setArticles(articles);
            } else {
                articles = Store.getArticles();
                if (!articles.length) {
                    if (loading) loading.style.display = 'block';
                    articles = await API.fetchArticles('tech');
                    Store.setArticles(articles);
                }
            }

            const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
            let filtered = [...articles];

            if (this.currentCat === 'star') {
                filtered = filtered.filter(a => Store.isStar(a.id));
            } else if (this.currentCat === 'unread') {
                filtered = filtered.filter(a => !Store.isRead(a.id));
            }

            if (search) {
                filtered = filtered.filter(a => a.title.toLowerCase().includes(search));
            }

            this.currentFiltered = filtered;
            Render.renderList(filtered);
            Render.updateStat(filtered);
        } catch (e) {
            console.error('过滤文章失败', e);
            showToast('数据加载异常，请重试');
        } finally {
            if (loading) loading.style.display = 'none';
        }
    },

    /**
     * 打开文章详情，懒加载 README
     */
    async openArticle(article, itemEl) {
        if (!article) return;

        // 1. 标记已读
        if (!Store.isRead(article.id)) {
            Store.toggleRead(article.id);
            if (this.currentCat === 'unread') {
                this.currentFiltered = this.currentFiltered.filter(a => a.id !== article.id);
            }
            Render.renderList(this.currentFiltered);
            Render.updateStat(this.currentFiltered);
        }

        // 2. 高亮选中项
        document.querySelectorAll('.list-item').forEach(i => i.classList.remove('active'));
        const freshItem = document.querySelector(`.list-item[data-id="${article.id}"]`) || itemEl;
        if (freshItem) freshItem.classList.add('active');

        // 3. README 已缓存：renderDetail 内部会自动用 insertAdjacentHTML 渲染
        if (article._readmeLoaded) {
            Render.renderDetail(article);
            return;
        }

        // 4. 先渲染基本信息
        Render.renderDetail(article);

        // 防止快速双击重复请求
        if (article._readmeLoading) return;
        article._readmeLoading = true;
        this._openingId = article.id;

        // 5. 追加"加载中"占位
        const detailBox = document.getElementById('detailBox');
        document.getElementById('readmeLoading')?.remove();
        if (detailBox) {
            const loadingEl = document.createElement('div');
            loadingEl.id = 'readmeLoading';
            loadingEl.style.cssText = 'padding:24px;text-align:center;opacity:0.7;';
            loadingEl.textContent = '⏳ 正在加载项目 README 文档...';
            detailBox.appendChild(loadingEl);
        }

        // 6. 懒加载 README
        const result = await API.fetchReadme(article.title);

        article._readmeLoading = false;
        if (this._openingId !== article.id) return;

        document.getElementById('readmeLoading')?.remove();

        if (result && result.ok) {
            article._readmeHtml = result.html;
            article._readmeLoaded = true;

            // ✅ 使用 insertAdjacentHTML 直接插入，避免 firstChild 遍历丢内容
            const box = document.getElementById('detailBox');
            if (box) {
                box.insertAdjacentHTML('beforeend',
                    '<hr style="border:0;border-top:1px solid var(--border-color,#30363d);margin:24px 0;">' +
                    '<div class="markdown-body">' + result.html + '</div>'
                );
            }
        } else {
            const reason = (result && result.message) ? result.message : 'README 加载失败，点击本项目可重试。';
            const box = document.getElementById('detailBox');
            if (box) {
                const errEl = document.createElement('p');
                errEl.style.cssText = 'opacity:0.75;padding:16px 0;';
                errEl.textContent = '📄 ' + reason;
                box.appendChild(errEl);
            }
            console.warn('❌ [APP] README 加载失败:', result);
        }
    },

    bindEvents() {
        // ---- 分类切换 ----
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                document.querySelectorAll('.tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                this.currentCat = btn.dataset.cat;
                await this.filterArticles();
            });
        });

        // ---- 搜索（300ms 防抖） ----
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => this.filterArticles(), 300));
        }

        // ---- 列表点击（事件委托） ----
        document.getElementById('listBox')?.addEventListener('click', e => {
            const starEl = e.target.closest('[data-star]');
            if (starEl) {
                Store.toggleStar(starEl.dataset.star);
                this.filterArticles();
                showToast(Store.isStar(starEl.dataset.star) ? '已收藏' : '已取消收藏');
                return;
            }
            const item = e.target.closest('.list-item');
            if (item) {
                const article = this.currentFiltered.find(a => a.id === item.dataset.id);
                if (article) this.openArticle(article, item);
            }
        });

        // ---- 历史记录点击（支持跨分类恢复） ----
        document.getElementById('historyItems')?.addEventListener('click', e => {
            const item = e.target.closest('[data-hid]');
            if (item) {
                let article = Store.getArticles().find(a => a.id === item.dataset.hid);
                if (!article) {
                    const histItem = Store.getHistory().find(h => h.id === item.dataset.hid);
                    if (histItem) {
                        article = { ...histItem };
                        const articles = Store.getArticles();
                        if (!articles.find(a => a.id === article.id)) {
                            articles.push(article);
                        }
                    }
                }
                if (article) this.openArticle(article, null);
            }
        });

        // ---- 详情区按钮（事件委托） ----
        document.getElementById('detailBox')?.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;

            const titleEl = document.querySelector('.article-title');
            if (!titleEl) return;
            const title = titleEl.textContent;
            const article = this.currentFiltered.find(a => a.title === title)

                || Store.getArticles().find(a => a.title === title);
            if (!article) return;

            if (action === 'toggle-read') {
                Store.toggleRead(article.id);
                Render.renderList(this.currentFiltered);
                Render.updateStat(this.currentFiltered);
                Render.renderDetail(article);
                showToast(Store.isRead(article.id) ? '已标为已读' : '已取消已读');
            } else if (action === 'toggle-star') {
                Store.toggleStar(article.id);
                Render.renderList(this.currentFiltered);
                Render.updateStat(this.currentFiltered);
                Render.renderDetail(article);
                showToast(Store.isStar(article.id) ? '已收藏' : '已取消收藏');
            }
        });

        // ---- 工具栏按钮 ----
        document.getElementById('refreshBtn')?.addEventListener('click', async () => {
            await this.filterArticles();
            showToast('已刷新最新开源项目');
        });

        document.getElementById('markAllRead')?.addEventListener('click', () => {
            Store.markAllRead(this.currentFiltered.map(a => a.id));
            this.filterArticles();
            showToast('已全部标为已读');
        });

        document.getElementById('clearAllRead')?.addEventListener('click', () => {
            Store.clearRead();
            this.filterArticles();
            showToast('已清除已读标记');
        });

        document.getElementById('clearAllStar')?.addEventListener('click', () => {
            Store.clearStar();
            this.filterArticles();
            showToast('已清空收藏');
        });

        document.getElementById('clearHistoryAll')?.addEventListener('click', () => {
            Store.clearHistory();
            Render.renderHistory();
            showToast('已清空历史');
        });

        // ---- 字号调节 ----
        document.querySelectorAll('.font-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.documentElement.style.setProperty('--font-size-base', btn.dataset.root + 'px');
            });
        });

        // ---- 主题切换 ----
        document.getElementById('themeBtn')?.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            document.getElementById('themeBtn').textContent = isDark ? '切换暗黑模式' : '切换明亮模式';
            localStorage.setItem('reader_theme', newTheme);
        });

        // ---- 阅读进度条（含除零保护） ----
        const detailBox = document.getElementById('detailBox');
        detailBox?.addEventListener('scroll', () => {
            const bar = document.getElementById('progressBar');
            if (!bar) return;
            const scrollable = detailBox.scrollHeight - detailBox.clientHeight;
            const pct = scrollable > 0 ? (detailBox.scrollTop / scrollable) * 100 : 0;
            bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
        });

        // ---- 回到顶部 ----
        const backTop = document.getElementById('backTop');
        const listBackTop = document.getElementById('listBackTop');

        window.addEventListener('scroll', () => {
            if (backTop) backTop.style.display = window.scrollY > 300 ? 'flex' : 'none';
        });
        backTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

        const listWrap = document.getElementById('listScrollWrap');
        listWrap?.addEventListener('scroll', () => {
            if (listBackTop) listBackTop.style.display = listWrap.scrollTop > 200 ? 'flex' : 'none';
        });
        listBackTop?.addEventListener('click', () => listWrap?.scrollTo({ top: 0, behavior: 'smooth' }));

        // ---- 专注模式 ----
        document.getElementById('focusModeBtn')?.addEventListener('click', () => {
            const sidebar = document.querySelector('.left-sidebar');
            if (sidebar) {
                const hidden = sidebar.style.display === 'none';
                sidebar.style.display = hidden ? '' : 'none';
                showToast(hidden ? '退出专注模式' : '已进入专注阅读模式');
            }
        });
    },

    initTheme() {
        const saved = localStorage.getItem('reader_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        const btn = document.getElementById('themeBtn');
        if (btn) btn.textContent = saved === 'dark' ? '切换明亮模式' : '切换暗黑模式';
    }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());