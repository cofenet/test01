const Store = {
    _storageKey: 'local_github_reader_data',

    _loadFromStorage() {
        try {
            const raw = localStorage.getItem(this._storageKey);
            if (raw) {
                const data = JSON.parse(raw);
                return {
                    history: data.history || [],
                    readIds: data.readIds || [],
                    starIds: data.starIds || []
                };
            }
        } catch (e) {
            console.warn('读取本地缓存失败，将使用默认状态', e);
        }
        return { history: [], readIds: [], starIds: [] };
    },

    _saveToStorage() {
        try {
            const dataToSave = {
                history: this.state.history,
                readIds: this.state.readIds,
                starIds: this.state.starIds
            };
            localStorage.setItem(this._storageKey, JSON.stringify(dataToSave));
        } catch (e) {
            console.error('写入本地缓存失败', e);
        }
    },

    state: {
        newsList: [],
        history: [],
        readIds: [],
        starIds: []
    },

    init() {
        const cached = this._loadFromStorage();
        this.state.history = cached.history;
        this.state.readIds = cached.readIds;
        this.state.starIds = cached.starIds;
    },

    // ---- 文章列表 ----
    getArticles() { return this.state.newsList; },
    setArticles(list) { this.state.newsList = list || []; },

    // ---- 历史记录 ----
    getHistory() { return this.state.history; },

    addHistory(item) {
        const snapshot = {
            id: item.id,
            title: item.title,
            content: item._originalContent || item.content || '',
            source: item.source || '',
            date: item.date || ''
        };
        this.state.history = [snapshot, ...this.state.history.filter(h => h.id !== item.id)].slice(0, 20);
        this._saveToStorage();
    },

    clearHistory() {
        this.state.history = [];
        this._saveToStorage();
    },

    // ---- 已读状态 ----
    isRead(id) { return this.state.readIds.includes(id); },

    toggleRead(id) {
        const idx = this.state.readIds.indexOf(id);
        idx > -1 ? this.state.readIds.splice(idx, 1) : this.state.readIds.push(id);
        this._saveToStorage();
    },

    markAllRead(ids) {
        this.state.readIds = [...new Set([...this.state.readIds, ...ids])];
        this._saveToStorage();
    },

    clearRead() {
        this.state.readIds = [];
        this._saveToStorage();
    },

    // ---- 收藏状态 ----
    isStar(id) { return this.state.starIds.includes(id); },

    toggleStar(id) {
        const idx = this.state.starIds.indexOf(id);
        idx > -1 ? this.state.starIds.splice(idx, 1) : this.state.starIds.push(id);
        this._saveToStorage();
    },

    clearStar() {
        this.state.starIds = [];
        this._saveToStorage();
    },

    // ---- 通用 ----
    setState(key, value) { this.state[key] = value; },
    getState(key) { return this.state[key]; }
};

Store.init();