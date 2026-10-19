// 潮汐信笺 — a first-class reader for aaronlau.me.
//
// The blog publishes a small JSON content pack at /ai6/. This app asks the
// desk's same-origin server route for it, keeps a durable copy in its own
// IndexedDB database, and renders a native window. There is no iframe and no
// remote script: the article HTML in the pack is already sanitized and is
// sanitized once more here before it reaches the DOM.

(function installAaronBlog() {
  "use strict";
  if (window.AISystem6AaronBlogLoaded) return;

  const WINDOW_NAME = "aaronBlog";
  const API = "/api/aaron-blog";
  const DB_NAME = "ais6-aaron-blog";
  const DB_VERSION = 1;
  const PAGE_SIZE = 80;

  // App copy lives in this lazy module, not in the eager translation tables:
  // the boot budget carries only the admission label and description.
  const LOCAL_STRINGS = {
    en: {
      aaron_blog_best: "Best", aaron_blog_all: "All Posts", aaron_blog_notes: "Notes",
      aaron_blog_tags: "Tags", aaron_blog_archive: "Archive", aaron_blog_threads: "Threads",
      aaron_blog_search: "Search", aaron_blog_back: "Back", aaron_blog_sections: "潮汐信笺 sections",
      aaron_blog_syncing: "Syncing…", aaron_blog_synced: "Synced", aaron_blog_offline: "Offline · cached",
      aaron_blog_items: "items", aaron_blog_minutes: "min read", aaron_blog_more: "Load more",
      aaron_blog_clear: "Clear", aaron_blog_loading: "Loading…",
      aaron_blog_loading_detail: "The first sync is fetching the post index.",
      aaron_blog_searching: "Searching…", aaron_blog_empty: "Nothing here yet",
      aaron_blog_offline_hint: "Connect to the blog and sync again.",
      aaron_blog_welcome: "潮汐信笺", aaron_blog_welcome_hint: "Choose a post from the list.",
      aaron_blog_no_results: "No results", aaron_blog_search_hint: "Type a title, tag or phrase.",
      aaron_blog_search_placeholder: "Search titles, tags or text", aaron_blog_original: "Original",
      aaron_blog_note: "Note", aaron_blog_unavailable: "Could not load this post",
      aaron_blog_missing: "This post is not in the downloaded pack.",
    },
    zh: {
      aaron_blog_best: "精选", aaron_blog_all: "全部推送", aaron_blog_notes: "笔记",
      aaron_blog_tags: "标签", aaron_blog_archive: "归档", aaron_blog_threads: "线索",
      aaron_blog_search: "搜索", aaron_blog_back: "返回", aaron_blog_sections: "潮汐信笺分区",
      aaron_blog_syncing: "同步中…", aaron_blog_synced: "已同步", aaron_blog_offline: "离线 · 已缓存",
      aaron_blog_items: "则", aaron_blog_minutes: "分钟阅读", aaron_blog_more: "加载更多",
      aaron_blog_clear: "清除", aaron_blog_loading: "载入中…",
      aaron_blog_loading_detail: "第一次同步正在取回文章索引。",
      aaron_blog_searching: "搜索中…", aaron_blog_empty: "这里还没有内容",
      aaron_blog_offline_hint: "连上博客后再同步一次。",
      aaron_blog_welcome: "潮汐信笺", aaron_blog_welcome_hint: "从左边选一篇开始读。",
      aaron_blog_no_results: "没有结果", aaron_blog_search_hint: "试试标题、标签或一句话。",
      aaron_blog_search_placeholder: "搜索标题、标签或正文", aaron_blog_original: "原文",
      aaron_blog_note: "笔记", aaron_blog_unavailable: "这篇没有载入",
      aaron_blog_missing: "这篇不在已下载的内容包里。",
    },
  };
  const language = () => (String(document.documentElement.lang || "").toLowerCase().startsWith("zh") ? "zh" : "en");

  const tr = (key, fallback) => {
    const local = LOCAL_STRINGS[language()]?.[key];
    if (local) return local;
    try {
      const value = typeof t === "function" ? t(key) : "";
      return value && value !== key ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const state = {
    index: null,
    manifest: null,
    postsById: new Map(),
    notesById: new Map(),
    tagsBySlug: new Map(),
    section: "all",
    filter: null,
    query: "",
    selectedId: null,
    selectedKind: "post",
    limit: PAGE_SIZE,
    view: "list",
    online: false,
    syncing: false,
    error: "",
    lastSynced: "",
    searchEntries: null,
    searchTotal: 0,
    searchLoading: false,
    chunks: new Map(),
    booted: false,
    bootPromise: null,
    destroyed: false,
  };

  const UI_STATE_KEY = "ais6.aaronBlog.ui";
  let uiSaveTimer = 0;

  function saveUiState() {
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify({
        section: state.section,
        filter: state.filter,
        query: state.query,
        selectedId: state.selectedId,
        selectedKind: state.selectedKind,
        scrollTop: articleEl()?.scrollTop || 0,
      }));
    } catch {
      // A private-mode quota failure only loses the last selection.
    }
  }

  function scheduleUiSave() {
    clearTimeout(uiSaveTimer);
    uiSaveTimer = setTimeout(saveUiState, 180);
  }

  async function restoreUiState() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "null"); } catch { saved = null; }
    if (!saved) return false;
    state.section = saved.section || "all";
    state.filter = saved.filter || null;
    state.query = saved.query || "";
    if (searchInput()) searchInput().value = state.query;
    if (saved.selectedId) {
      if (state.postsById.has(saved.selectedId)) {
        await openPost(saved.selectedId, { restoreScroll: saved.scrollTop });
        return true;
      }
      if (state.notesById.has(saved.selectedId)) {
        openNote(saved.selectedId);
        return true;
      }
    }
    renderRail();
    renderContext();
    renderList();
    updateStatus();
    return false;
  }

  const FILE_CACHE = new Map();
  let dbPromise = null;
  let searchPromise = null;
  let listToken = 0;

  function openDb() {
    if (dbPromise) return dbPromise;
    if (!("indexedDB" in window)) {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise((resolve) => {
      let request;
      try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function cacheGet(key) {
    const db = await openDb();
    if (!db) return FILE_CACHE.get(key) || null;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction("files", "readonly");
        const request = transaction.objectStore("files").get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function cachePut(key, value) {
    FILE_CACHE.set(key, value);
    const db = await openDb();
    if (!db) return;
    try {
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").put(value, key);
    } catch {
      // A private-mode or quota failure leaves the in-memory copy in place.
    }
  }

  async function fetchPack(key, { force = false } = {}) {
    if (!force) {
      const cached = await cacheGet(key);
      if (cached) return cached;
    }
    const response = await fetch(`${API}/${key}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`blog pack ${key}: ${response.status}`);
    const value = await response.json();
    await cachePut(key, value);
    return value;
  }

  function winEl() {
    return document.querySelector(`[data-window="${WINDOW_NAME}"]`);
  }

  function paneEl() {
    return winEl()?.querySelector(".aaron-blog-pane");
  }

  function articleEl() {
    return winEl()?.querySelector("[data-blog-article]");
  }

  function listEl() {
    return winEl()?.querySelector("[data-blog-list]");
  }

  function searchInput() {
    return winEl()?.querySelector("[data-blog-search]");
  }

  function safeHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");
    template.content.querySelectorAll("script, iframe, object, embed, style, link, meta, base, form").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name) || attribute.name === "srcdoc" || attribute.name === "formaction") node.removeAttribute(attribute.name);
      }
      const href = node.getAttribute?.("href") || "";
      const src = node.getAttribute?.("src") || "";
      if (/^\s*(?:javascript|vbscript|data:text\/html)/i.test(href)) node.setAttribute("href", "#");
      if (/^\s*(?:javascript|vbscript|data:text\/html)/i.test(src)) node.removeAttribute("src");
    });
    return template.innerHTML;
  }

  function sectionLabel(section = state.section) {
    const labels = {
      best: ["aaron_blog_best", "Best"],
      all: ["aaron_blog_all", "All Posts"],
      notes: ["aaron_blog_notes", "Notes"],
      tags: ["aaron_blog_tags", "Tags"],
      archive: ["aaron_blog_archive", "Archive"],
      threads: ["aaron_blog_threads", "Threads"],
      search: ["aaron_blog_search", "Search"],
    };
    const [key, fallback] = labels[section] || labels.all;
    return tr(key, fallback);
  }

  function allPosts() {
    return state.index?.posts || [];
  }

  function allNotes() {
    return state.index?.notes || [];
  }

  function postsForFilter() {
    const filter = state.filter;
    if (!filter) return allPosts();
    if (filter.type === "year") return allPosts().filter((post) => post.date.startsWith(`${filter.value}-`));
    if (filter.type === "series") return allPosts().filter((post) => post.series === filter.value);
    if (filter.type === "tag") {
      const name = filter.name;
      return allPosts().filter((post) => post.tags.includes(name));
    }
    return allPosts();
  }

  function filterLabel() {
    const filter = state.filter;
    if (!filter) return "";
    if (filter.type === "tag") return `#${filter.name}`;
    if (filter.type === "series") return filter.value;
    return filter.value;
  }

  function setWindowTitle(title) {
    const heading = winEl()?.querySelector(".title-bar h2");
    if (heading) heading.textContent = title;
  }

  function setStatus(text) {
    const node = winEl()?.querySelector("[data-blog-status]");
    if (node) node.textContent = text;
  }

  function syncLabel() {
    if (state.syncing) return tr("aaron_blog_syncing", "Syncing…");
    if (state.online) return state.lastSynced ? `${tr("aaron_blog_synced", "Synced")} · ${state.lastSynced}` : tr("aaron_blog_synced", "Synced");
    return tr("aaron_blog_offline", "Offline · cached");
  }

  function updateStatus() {
    const win = winEl();
    if (!win) return;
    const countNode = win.querySelector("[data-blog-count]");
    const sectionNode = win.querySelector("[data-blog-section-label]");
    if (sectionNode) sectionNode.textContent = filterLabel() || sectionLabel();
    let itemCount = postsForFilter().length;
    if (state.section === "notes") itemCount = allNotes().length;
    else if (state.section === "tags" && !state.filter) itemCount = (state.index?.tags || []).length;
    else if (state.section === "archive" && !state.filter) itemCount = new Set(allPosts().map((post) => post.date.slice(0, 4))).size;
    else if (state.section === "threads" && !state.filter) itemCount = (state.index?.series || []).length;
    else if (state.section === "best") itemCount = (state.index?.best || []).reduce((sum, group) => sum + group.postIds.length, 0);
    else if (state.section === "search") itemCount = state.searchTotal;
    if (countNode) countNode.textContent = `${itemCount} ${tr("aaron_blog_items", "items")} · ${syncLabel()}`;
    setStatus(syncLabel());
    const syncButton = win.querySelector("[data-blog-sync]");
    if (syncButton) {
      syncButton.disabled = state.syncing;
      syncButton.textContent = state.syncing ? tr("aaron_blog_syncing", "Syncing…") : tr("refresh", "Refresh");
    }
    setWindowTitle(state.selectedId
      ? (state.selectedKind === "note" ? tr("aaron_blog_note", "Note") : (state.postsById.get(state.selectedId)?.title || tr("aaron_blog_label", "潮汐信笺")))
      : tr("aaron_blog_label", "潮汐信笺"));
  }

  function renderRail() {
    winEl()?.querySelectorAll("[data-blog-section]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.blogSection === state.section ? "true" : "false");
    });
  }

  function renderContext() {
    const node = winEl()?.querySelector("[data-blog-context]");
    if (!node) return;
    const label = filterLabel();
    if (!label) {
      node.innerHTML = "";
      return;
    }
    node.innerHTML = `<strong>${esc(label)}</strong><button type="button" data-blog-clear-filter>${esc(tr("aaron_blog_clear", "Clear"))}</button>`;
  }

  function postRow(post) {
    const selected = state.selectedId === post.id && state.selectedKind === "post";
    return `<button type="button" class="aaron-blog-row" data-post-id="${esc(post.id)}" aria-current="${selected ? "true" : "false"}">
      <time>${esc(post.date)}</time>
      <span class="aaron-blog-row-title">${esc(post.title)}</span>
      <span class="aaron-blog-row-tags">${esc(post.tags.map((tag) => `#${tag}`).join(" "))}</span>
    </button>`;
  }

  function noteRow(note) {
    const selected = state.selectedId === note.id && state.selectedKind === "note";
    return `<button type="button" class="aaron-blog-row" data-note-id="${esc(note.id)}" aria-current="${selected ? "true" : "false"}">
      <time>${esc(note.date)}</time>
      <span class="aaron-blog-row-title">${esc(note.text)}</span>
      <span class="aaron-blog-row-tags">${esc(tr("aaron_blog_note", "Note"))}</span>
    </button>`;
  }

  function listFooter(total) {
    if (state.limit >= total) return "";
    return `<button type="button" class="aaron-blog-more" data-blog-more>${esc(tr("aaron_blog_more", "Load more"))}</button>`;
  }

  function renderBest(list) {
    return (state.index?.best || []).map((group) => {
      const rows = group.postIds.map((id) => state.postsById.get(id)).filter(Boolean).map(postRow).join("");
      return `<section class="aaron-blog-group"><h3>${esc(group.name)}</h3>${rows}</section>`;
    }).join("");
  }

  function renderTagOptions() {
    return `<div class="aaron-blog-tag-list">${(state.index?.tags || []).map((tag) => (
      `<button type="button" data-filter-tag="${esc(tag.slug)}" data-filter-name="${esc(tag.name)}"><span>#${esc(tag.name)}</span><span class="count">${tag.count}</span></button>`
    )).join("")}</div>`;
  }

  function renderYearOptions() {
    const counts = new Map();
    allPosts().forEach((post) => counts.set(post.date.slice(0, 4), (counts.get(post.date.slice(0, 4)) || 0) + 1));
    return `<div class="aaron-blog-year-list">${[...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, count]) => (
      `<button type="button" data-filter-year="${year}"><span>${year}</span><span class="count">${count}</span></button>`
    )).join("")}</div>`;
  }

  function renderSeriesOptions() {
    return `<div class="aaron-blog-series-list">${(state.index?.series || []).map((series) => (
      `<button type="button" data-filter-series="${esc(series.name)}"><span>${esc(series.name)}</span><span class="count">${series.count}</span></button>`
    )).join("")}</div>`;
  }

  async function ensureSearch() {
    if (state.searchEntries || searchPromise) return searchPromise || state.searchEntries;
    state.searchLoading = true;
    searchPromise = (async () => {
      try {
        const pack = await fetchPack("search");
        state.searchEntries = Array.isArray(pack?.entries) ? pack.entries : [];
        state.online = navigator.onLine !== false;
      } catch (error) {
        state.searchEntries = [];
        state.error = String(error?.message || error);
      } finally {
        state.searchLoading = false;
        searchPromise = null;
      }
      return state.searchEntries;
    })();
    return searchPromise;
  }

  function searchRows(query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const rows = [];
    state.searchTotal = 0;
    for (const entry of state.searchEntries || []) {
      const post = state.postsById.get(entry.id);
      const note = state.notesById.get(entry.id);
      if (!post && !note) continue;
      const haystack = [entry.t, entry.x, entry.b, ...(entry.g || [])].join(" ").toLowerCase();
      if (!haystack.includes(needle)) continue;
      state.searchTotal += 1;
      rows.push(post || note);
    }
    return rows;
  }

  async function renderList() {
    const token = ++listToken;
    const list = listEl();
    if (!list) return;
    if (!state.index) {
      list.innerHTML = `<div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_loading", "Loading…"))}</strong>${esc(tr("aaron_blog_loading_detail", "The first sync is fetching the post index."))}</div>`;
      return;
    }
    if (state.section === "search" && state.query.trim() && !state.searchEntries) {
      list.innerHTML = `<div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_searching", "Searching…"))}</strong></div>`;
      await ensureSearch();
      if (token !== listToken) return;
    }
    if (state.section === "tags" && !state.filter) { list.innerHTML = renderTagOptions(); updateStatus(); return; }
    if (state.section === "archive" && !state.filter) { list.innerHTML = renderYearOptions(); updateStatus(); return; }
    if (state.section === "threads" && !state.filter) { list.innerHTML = renderSeriesOptions(); updateStatus(); return; }
    if (state.section === "best") { list.innerHTML = renderBest(); updateStatus(); return; }
    if (state.section === "notes") {
      const notes = allNotes();
      list.innerHTML = notes.map(noteRow).join("") || `<div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_empty", "Nothing here yet"))}</strong></div>`;
      updateStatus();
      return;
    }
    if (state.section === "search") {
      if (!state.query.trim()) {
        list.innerHTML = `<div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_search", "Search"))}</strong>${esc(tr("aaron_blog_search_hint", "Type a title, tag or phrase."))}</div>`;
        return;
      }
      const allRows = searchRows(state.query);
      const rows = allRows.slice(0, state.limit);
      list.innerHTML = rows.map((item) => (item.kind === "note" ? noteRow(item) : postRow(item))).join("") + listFooter(allRows.length) ||
        `<div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_no_results", "No results"))}</strong>${esc(tr("aaron_blog_search_hint", "Try another phrase or clear the search."))}</div>`;
      updateStatus();
      return;
    }
    const posts = postsForFilter();
    const visible = posts.slice(0, state.limit);
    list.innerHTML = visible.map(postRow).join("") + listFooter(posts.length) ||
      `<div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_empty", "Nothing here yet"))}</strong>${state.online ? "" : esc(tr("aaron_blog_offline_hint", "Connect to the blog and sync again."))}</div>`;
    updateStatus();
  }

  function emptyArticle() {
    return `<div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_welcome", "潮汐信笺"))}</strong>${esc(tr("aaron_blog_welcome_hint", "Choose a post from the list."))}</div>`;
  }

  function setView(view) {
    state.view = view;
    const pane = paneEl();
    if (pane) pane.dataset.view = view;
  }

  async function ensureChunk(year) {
    if (state.chunks.has(year)) return state.chunks.get(year);
    const chunk = await fetchPack(`chunk/${year}`);
    state.chunks.set(year, chunk);
    return chunk;
  }

  function articleFooter(post) {
    const tags = (post.tags || []).map((tag) => {
      const item = [...state.tagsBySlug.values()].find((entry) => entry.name === tag);
      return item ? `<a href="#/tag/${esc(item.slug)}" data-tag-slug="${esc(item.slug)}">#${esc(tag)}</a>` : `<span>#${esc(tag)}</span>`;
    }).join(" ");
    const origin = post.origin
      ? `<a class="aaron-blog-origin" href="${esc(post.origin)}" data-external="1" rel="noopener noreferrer">${esc(tr("aaron_blog_original", "Original"))} ↗</a>`
      : "";
    return `<footer class="aaron-blog-article-foot"><span>${esc(post.date)} · ${post.minutes} ${esc(tr("aaron_blog_minutes", "min read"))}</span><span class="aaron-blog-article-tags">${tags}</span>${origin}</footer>`;
  }

  async function openPost(id, { restoreScroll = 0 } = {}) {
    const post = state.postsById.get(id);
    if (!post) return;
    state.selectedId = id;
    state.selectedKind = "post";
    scheduleUiSave();
    setView("reading");
    setWindowTitle(post.title);
    const article = articleEl();
    if (article) {
      article.innerHTML = `<div class="aaron-blog-article-inner"><div class="aaron-blog-article-head"><button type="button" class="aaron-blog-back" data-blog-back>← ${esc(tr("aaron_blog_back", "Back"))}</button><time>${esc(post.date)}</time><span>${post.minutes} ${esc(tr("aaron_blog_minutes", "min read"))}</span></div><div class="aaron-blog-empty">${esc(tr("aaron_blog_loading", "Loading…"))}</div></div>`;
    }
    try {
      const chunk = await ensureChunk(post.date.slice(0, 4));
      if (state.destroyed) return;
      const html = chunk?.posts?.[id]?.html || "";
      if (!html) throw new Error(tr("aaron_blog_missing", "This post is not in the downloaded pack."));
      if (article) {
        article.innerHTML = `<div class="aaron-blog-article-inner"><div class="aaron-blog-article-head"><button type="button" class="aaron-blog-back" data-blog-back>← ${esc(tr("aaron_blog_back", "Back"))}</button><time>${esc(post.date)}</time><span>${post.minutes} ${esc(tr("aaron_blog_minutes", "min read"))}</span></div><div class="aaron-blog-article-body">${safeHtml(html)}</div>${articleFooter(post)}</div>`;
        article.scrollTop = Number(restoreScroll) || 0;
      }
      state.error = "";
      state.online = navigator.onLine !== false;
    } catch (error) {
      if (navigator.onLine === false) state.online = false;
      state.error = String(error?.message || error);
      if (article) {
        article.innerHTML = `<div class="aaron-blog-article-inner"><div class="aaron-blog-article-head"><button type="button" class="aaron-blog-back" data-blog-back>← ${esc(tr("aaron_blog_back", "Back"))}</button></div><div class="aaron-blog-empty"><strong>${esc(tr("aaron_blog_unavailable", "Could not load this post"))}</strong>${esc(state.error)}</div></div>`;
      }
    }
    renderRail();
    updateStatus();
    renderList();
  }

  function openNote(id) {
    const note = state.notesById.get(id);
    if (!note) return;
    state.selectedId = id;
    state.selectedKind = "note";
    scheduleUiSave();
    setView("reading");
    setWindowTitle(tr("aaron_blog_note", "Note"));
    const article = articleEl();
    if (article) {
      const link = note.link ? `<p><a href="${esc(note.link)}" data-external="1" rel="noopener noreferrer">${esc(note.host || note.link)} ↗</a></p>` : "";
      article.innerHTML = `<div class="aaron-blog-article-inner"><div class="aaron-blog-article-head"><button type="button" class="aaron-blog-back" data-blog-back>← ${esc(tr("aaron_blog_back", "Back"))}</button><time>${esc(note.date)}</time></div><div class="aaron-blog-article-body"><p>${esc(note.text)}</p>${link}</div></div>`;
      article.scrollTop = 0;
    }
    renderRail();
    updateStatus();
    renderList();
  }

  function back() {
    state.selectedId = null;
    setView("list");
    scheduleUiSave();
    setWindowTitle(tr("aaron_blog_label", "潮汐信笺"));
    const article = articleEl();
    if (article) article.innerHTML = emptyArticle();
    renderRail();
    renderContext();
    updateStatus();
    renderList();
  }

  function setSection(section) {
    state.section = section;
    state.filter = null;
    state.query = "";
    state.limit = PAGE_SIZE;
    scheduleUiSave();
    const input = searchInput();
    if (input) input.value = "";
    if (section === "search") {
      ensureSearch();
      input?.focus();
    }
    back();
  }

  function setFilter(type, value, name = "") {
    state.filter = { type, value, name: name || value };
    state.section = "all";
    state.limit = PAGE_SIZE;
    state.selectedId = null;
    setView("list");
    scheduleUiSave();
    renderRail();
    renderContext();
    renderList();
    updateStatus();
  }

  async function sync(force = false) {
    if (state.syncing) return;
    state.syncing = true;
    updateStatus();
    try {
      const cachedManifest = await cacheGet("manifest");
      const manifest = await fetchPack("manifest", { force: true });
      const changed = force || !cachedManifest || cachedManifest.contentHash !== manifest.contentHash;
      let index = await cacheGet("index");
      if (changed || !index) index = await fetchPack("index", { force: changed });
      await cachePut("manifest", manifest);
      if (index) applyIndex(index, { render: true });
      state.manifest = manifest;
      state.online = navigator.onLine !== false;
      state.error = "";
      state.lastSynced = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (changed) {
        state.searchEntries = null;
        state.chunks.clear();
      }
    } catch (error) {
      state.online = false;
      const cachedIndex = await cacheGet("index");
      if (cachedIndex) applyIndex(cachedIndex, { render: true });
      state.error = String(error?.message || error);
    } finally {
      state.syncing = false;
      renderRail();
      renderContext();
      updateStatus();
      renderList();
    }
  }

  // The status line is the app's only account of reachability; a cached read
  // must not keep calling itself "Synced" after the desk goes offline.
  function syncConnectivity() {
    const online = navigator.onLine !== false;
    if (state.online === online) return;
    state.online = online;
    updateStatus();
    renderList();
  }
  window.addEventListener("online", syncConnectivity);
  window.addEventListener("offline", syncConnectivity);

  function applyIndex(index, { render = true } = {}) {
    if (!index || !Array.isArray(index.posts)) return;
    state.index = index;
    state.postsById = new Map(index.posts.map((post) => [post.id, post]));
    state.notesById = new Map((index.notes || []).map((note) => [note.id, note]));
    state.tagsBySlug = new Map((index.tags || []).map((tag) => [tag.slug, tag]));
    if (state.selectedId && !state.postsById.has(state.selectedId) && !state.notesById.has(state.selectedId)) {
      state.selectedId = null;
      setView("list");
    }
    if (render) {
      renderRail();
      renderContext();
      renderList();
      updateStatus();
    }
  }

  async function boot() {
    if (state.booted) return state.bootPromise;
    state.booted = true;
    state.bootPromise = (async () => {
      const cachedIndex = await cacheGet("index");
      if (cachedIndex) applyIndex(cachedIndex);
      await sync(false);
      if (state.online) setTimeout(() => ensureSearch(), 900);
      await restoreUiState();
    })();
    return state.bootPromise;
  }

  async function open({ postId = "" } = {}) {
    installWindow();
    await openWindow(WINDOW_NAME);
    await boot();
    if (postId) await openPost(postId);
    return true;
  }

  function installWindow() {
    if (winEl()) return winEl();
    const win = window.AISystem6ApplicationShell.createWindow({
      windowName: WINDOW_NAME,
      windowClass: "aaron-blog-window",
      labelledBy: "aaron-blog-title",
      title: "潮汐信笺",
      statusClass: "compact-status-bar aaron-blog-status",
      statusHtml: `<span class="status-bar-leading" data-blog-section-label>${esc(sectionLabel())}</span><span class="status-bar-context" data-blog-count></span><span class="status-bar-trailing"><button type="button" class="aaron-blog-status-sync" data-blog-sync>${esc(tr("refresh", "Refresh"))}</button></span>`,
      paneClass: "aaron-blog-pane",
      paneHtml: `<div class="aaron-blog-shell" data-view="list">
        <nav class="aaron-blog-rail" aria-label="${esc(tr("aaron_blog_sections", "潮汐信笺 sections"))}">
          <button type="button" data-blog-section="best">${esc(tr("aaron_blog_best", "Best"))}</button>
          <button type="button" data-blog-section="all">${esc(tr("aaron_blog_all", "All Posts"))}</button>
          <button type="button" data-blog-section="notes">${esc(tr("aaron_blog_notes", "Notes"))}</button>
          <button type="button" data-blog-section="tags">${esc(tr("aaron_blog_tags", "Tags"))}</button>
          <button type="button" data-blog-section="archive">${esc(tr("aaron_blog_archive", "Archive"))}</button>
          <button type="button" data-blog-section="threads">${esc(tr("aaron_blog_threads", "Threads"))}</button>
          <button type="button" data-blog-section="search">${esc(tr("aaron_blog_search", "Search"))}</button>
        </nav>
        <section class="aaron-blog-list-pane">
          <div class="aaron-blog-list-head"><input type="search" data-blog-search placeholder="${esc(tr("aaron_blog_search_placeholder", "Search titles, tags or text"))}" aria-label="${esc(tr("aaron_blog_search", "Search"))}"></div>
          <div class="aaron-blog-context" data-blog-context></div>
          <div class="aaron-blog-list" data-blog-list></div>
        </section>
        <article class="aaron-blog-article" data-blog-article tabindex="0"></article>
      </div>`,
    });
    win.querySelector("[data-blog-sync]")?.addEventListener("click", () => sync(true));
    win.querySelector(".aaron-blog-rail")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-blog-section]");
      if (!button) return;
      const section = button.dataset.blogSection;
      if (section === "search") {
        searchInput()?.focus();
        setSection("search");
      } else {
        setSection(section);
      }
    });
    win.querySelector("[data-blog-search]")?.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.searchTotal = 0;
      state.limit = PAGE_SIZE;
      state.section = state.query.trim() ? "search" : "all";
      state.selectedId = null;
      state.limit = PAGE_SIZE;
      setView("list");
      scheduleUiSave();
      renderRail();
      renderContext();
      updateStatus();
      renderList();
    });
    win.querySelector("[data-blog-list]")?.addEventListener("click", (event) => {
      const more = event.target.closest("[data-blog-more]");
      if (more) { state.limit += PAGE_SIZE; renderList(); return; }
      const note = event.target.closest("[data-note-id]");
      if (note) { openNote(note.dataset.noteId); return; }
      const row = event.target.closest("[data-post-id]");
      if (row) openPost(row.dataset.postId);
    });
    win.querySelector("[data-blog-context]")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-blog-clear-filter]")) { state.filter = null; state.section = "all"; setView("list"); renderRail(); renderContext(); renderList(); updateStatus(); }
    });
    win.querySelector("[data-blog-list]")?.addEventListener("click", (event) => {
      const tag = event.target.closest("[data-filter-tag]");
      if (tag) { setFilter("tag", tag.dataset.filterTag, tag.dataset.filterName); return; }
      const year = event.target.closest("[data-filter-year]");
      if (year) { setFilter("year", year.dataset.filterYear); return; }
      const series = event.target.closest("[data-filter-series]");
      if (series) { setFilter("series", series.dataset.filterSeries); }
    });
    win.querySelector("[data-blog-article]")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-blog-back]")) { event.preventDefault(); back(); return; }
      const post = event.target.closest("[data-post-id]");
      if (post) { event.preventDefault(); openPost(post.dataset.postId); return; }
      const tag = event.target.closest("[data-tag-slug]");
      if (tag) { event.preventDefault(); const item = state.tagsBySlug.get(tag.dataset.tagSlug); if (item) setFilter("tag", item.slug, item.name); return; }
      const external = event.target.closest("[data-external], a[href^='http']");
      if (external) {
        const href = external.getAttribute("href") || "";
        if (/^https?:/i.test(href)) {
          event.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }
    });
    // The first pass writes an empty article; the list will replace it when data arrives.
    const articleNode = win.querySelector("[data-blog-article]");
    if (articleNode) {
      articleNode.innerHTML = emptyArticle();
      articleNode.addEventListener("scroll", scheduleUiSave, { passive: true });
    }
    return win;
  }

  // Named in the admission table so a language switch redraws the strings this
  // lazy window owns instead of leaving the previous language on screen.
  function renderAaronBlogLanguage() {
    const win = winEl();
    if (!win) return;
    const rail = win.querySelector(".aaron-blog-rail");
    if (rail) {
      rail.setAttribute("aria-label", tr("aaron_blog_sections", "潮汐信笺 sections"));
      rail.querySelectorAll("[data-blog-section]").forEach((button) => {
        button.textContent = sectionLabel(button.dataset.blogSection);
      });
    }
    const input = searchInput();
    if (input) {
      input.placeholder = tr("aaron_blog_search_placeholder", "Search titles, tags or text");
      input.setAttribute("aria-label", tr("aaron_blog_search", "Search"));
    }
    const article = articleEl();
    if (state.selectedId && state.postsById.has(state.selectedId)) {
      openPost(state.selectedId, { restoreScroll: article?.scrollTop || 0 });
    } else if (state.selectedId && state.notesById.has(state.selectedId)) {
      openNote(state.selectedId);
    } else if (article) {
      article.innerHTML = emptyArticle();
    }
    renderRail();
    renderContext();
    renderList();
    updateStatus();
  }

  function captureSession() {
    return {
      section: state.section,
      filter: state.filter,
      query: state.query,
      selectedId: state.selectedId,
      selectedKind: state.selectedKind,
      scrollTop: articleEl()?.scrollTop || 0,
    };
  }

  async function restoreSession(session = {}) {
    await boot();
    if (session.section) state.section = session.section;
    state.filter = session.filter || null;
    state.query = session.query || "";
    if (searchInput()) searchInput().value = state.query;
    if (session.selectedId) {
      if (state.postsById.has(session.selectedId)) await openPost(session.selectedId, { restoreScroll: session.scrollTop });
      else if (state.notesById.has(session.selectedId)) openNote(session.selectedId);
    }
    renderRail();
    renderContext();
    renderList();
  }

  window.renderAaronBlogLanguage = renderAaronBlogLanguage;
  window.AISystem6AaronBlog = {
    attach: installWindow,
    open,
    openPost,
    sync,
    captureSession,
    restoreSession,
    state: () => ({ ...state, index: undefined, manifest: undefined }),
  };
  window.AISystem6Runtime?.registerApplication({
    id: "aaronBlog",
    windowName: WINDOW_NAME,
    mount: async () => { installWindow(); await boot(); return true; },
    restore: async () => { installWindow(); await boot(); return true; },
    commands: Object.fromEntries([
      ["open-aaron-blog", () => open()],
      ["blog-sync", () => sync(true)],
      ["blog-search", () => { installWindow(); searchInput()?.focus(); }],
      ["blog-back", () => back()],
      ["blog-section-best", () => setSection("best")],
      ["blog-section-all", () => setSection("all")],
      ["blog-section-notes", () => setSection("notes")],
      ["blog-section-tags", () => setSection("tags")],
      ["blog-section-archive", () => setSection("archive")],
      ["blog-section-threads", () => setSection("threads")],
    ].map(([id, handler]) => [id, { handler, isAvailable: () => true }])),
  });
  window.AISystem6AaronBlogLoaded = true;
})();
