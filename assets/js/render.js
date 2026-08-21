const Render = {
    /**
     * 渲染文章列表
     */
    renderList(articles) {
        const box = document.getElementById('listBox');
        if (!box) return;
        if (!articles.length) {
            box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">暂无内容</div>';
            return;
        }
        box.innerHTML = articles.map(a => {
            const read = Store.isRead(a.id) ? ' read' : '';
            const star = Store.isStar(a.id) ? '⭐' : '☆';
            return `<div class="list-item${read}" data-id="${a.id}" role="listitem">
                <div class="item-title">${safeHTML(a.title)}</div>
                <div class="item-meta">
                    <span>${safeHTML(a.source || '')}</span>
                    <span>${formatDate(a.date)}</span>
                    <span class="star-icon" data-star="${a.id}">${star}</span>
                    <span class="read-marker"></span>
                </div>
            </div>`;
        }).join('');
    },

    /**
     * 更新统计信息 —— 全局未读/收藏计数
     */
    updateStat(articles) {
        const el = document.getElementById('statBox');
        if (!el) return;
        const all = Store.getArticles();
        const totalRead = all.filter(a => Store.isRead(a.id)).length;
        const totalStar = all.filter(a => Store.isStar(a.id)).length;
        const unread = all.length - totalRead;
        el.textContent = `📋 ${articles.length} 条 · 🔖 未读 ${unread} · ⭐ 收藏 ${totalStar}`;
    },

    /**
     * 渲染文章详情
     * - 原始描述纯文本渲染（防 XSS）
     * - README 缓存使用 insertAdjacentHTML 直接插入（避免 firstChild 遍历丢内容）
     */
    renderDetail(article) {
        const box = document.getElementById('detailBox');
        if (!box || !article) return;

        // 保存原始描述
        if (!article._originalContent) {
            article._originalContent = article.content || '';
        }

        const descText = article._originalContent || '暂无正文内容';

        // 底部操作栏按钮文案
        const starBtnText = Store.isStar(article.id) ? '💔 取消收藏' : '⭐ 收藏';
        const readBtnText = Store.isRead(article.id) ? '📖 取消已读' : '📖 标记已读';

        box.innerHTML = `
            <div class="read-progress-bar" id="progressBar"></div>
            <div class="article-header">
                <h2 class="article-title">${safeHTML(article.title)}</h2>
                <div class="article-meta">
                    <span>📰 ${safeHTML(article.source || '未知来源')}</span>
                    <span>📅 ${formatDate(article.date)}</span>
                </div>
            </div>
            <div class="article-content">
                <p>${safeHTML(descText)}</p>
            </div>
            <div class="article-actions">
                <button class="tool-btn" data-action="toggle-read">${readBtnText}</button>
                <button class="tool-btn" data-action="toggle-star">${starBtnText}</button>
            </div>`;

        // 如果已有缓存的 README，使用 insertAdjacentHTML 直接插入
        if (article._readmeHtml) {
            box.insertAdjacentHTML('beforeend',
                '<hr style="border:0;border-top:1px solid var(--border-color,#30363d);margin:24px 0;">' +
                '<div class="markdown-body">' + article._readmeHtml + '</div>'
            );
        }

        // 记录历史
        Store.addHistory(article);
        Render.renderHistory();

        // 重置进度条
        const bar = document.getElementById('progressBar');
        if (bar) bar.style.width = '0%';
    },

    /**
     * 渲染浏览历史
     */
    renderHistory() {
        const container = document.getElementById('historyItems');
        if (!container) return;
        const list = Store.getHistory();
        container.innerHTML = list.length ? list.map(h =>
            `<div class="history-item" data-hid="${h.id}">${safeHTML(h.title)}</div>`
        ).join('') : '<span style="font-size:0.8rem;color:var(--text-secondary)">暂无浏览记录</span>';
    }
};