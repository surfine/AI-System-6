/* ClioWorks 旁注栏 (margin-notes rail, second draft D2 / S2).
 *
 * One rail on the right of each document window: 修订 · 批注 · 比较 · 字数 ·
 * 字体 (each app lists the tabs it supports) as the desk's own tab strip
 * (.system-tabs / .system-tab, the Control Panel's tablist), one panel at a
 * time. The rail follows the window's CURRENT document: an app binds a
 * provider while a document is mounted and unbinds it when the document goes,
 * so a new document (or a rebind) draws its own content into the same rail.
 * Collapsed, only the toggle in the document bar's named slot
 * (.doc-rail-slot[data-margin-rail-slot]) is left; the toggle carries the
 * pending count (「修订 3」).
 *
 * The panels hand out windoid-shaped handles ({ root, body, setTitle, place,
 * close }), so the content modules that used to build a floating windoid
 * (features/clio-write-review.js, -compare.js, -word-count.js, the comments
 * lists) draw into a panel without learning a second shape. Find/replace stays
 * a floating windoid outside the document and never comes here.
 *
 * Lazy: rides the ClioWrite, workbook and native ClioStage loaders (config.js),
 * dressed by styles/84-windoid.css. No model code, no storage: which tab was
 * last open is remembered per application for this session only. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWorksRail) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const TAB_KEYS = Object.freeze({
    revisions: 'clioworks_rail_tab_revisions',
    comments: 'clioworks_rail_tab_comments',
    compare: 'clioworks_rail_tab_compare',
    words: 'clioworks_rail_tab_words',
    fonts: 'clioworks_rail_tab_fonts',
  });
  // Open or closed and the last tab, per application, for this session.
  const remembered = new Map();
  let serial = 0;

  function h(doc, tag, props = {}, children = []) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : doc.createTextNode(String(child)));
    return node;
  }

  /**
   * Build one window's rail.
   * @param {{doc: Document, appId: string, slot: Element, host: Element, before?: Element, tabs: string[]}} opts
   *   host — the element the rail sits inside, on the right; before — the child it goes in front of
   *   (an alert layer stays above it by DOM order). tabs — the ids this app supports, in order.
   */
  function create(opts) {
    const { doc, appId, slot, host } = opts;
    const tabs = (opts.tabs || []).filter((id) => TAB_KEYS[id]);
    if (!doc || !slot || !host || !tabs.length) return null;
    const memory = remembered.get(appId) || { open: false, tab: tabs[0] };
    if (!tabs.includes(memory.tab)) memory.tab = tabs[0];
    remembered.set(appId, memory);
    const railId = `doc-rail-${appId}-${++serial}`;
    let provider = null;   // { show(id), count(id), name() } while a document is bound
    let destroyed = false;

    const toggle = h(doc, 'button', { type: 'button', class: 'btn details-bar-button doc-rail-toggle', 'aria-controls': railId, 'aria-expanded': 'false', dataset: { balloonHelp: 'clioworks_rail_balloon' } });
    const tablist = h(doc, 'div', { class: 'system-tabs doc-rail-tabs', role: 'tablist', 'aria-label': tr('clioworks_rail_label') });
    const sheet = h(doc, 'div', { class: 'system-tabs-sheet doc-rail-sheet' }, [tablist]);
    const caption = h(doc, 'p', { class: 'doc-rail-caption' });
    const rail = h(doc, 'aside', { class: 'doc-rail', id: railId, 'aria-label': tr('clioworks_rail_label'), dataset: { marginRail: appId }, hidden: true }, [sheet, caption]);
    const parts = new Map();   // id → { tab, panel, title, body, handle, onClose }

    for (const id of tabs) {
      const tabId = `${railId}-tab-${id}`;
      const panelId = `${railId}-panel-${id}`;
      const tab = h(doc, 'button', { type: 'button', class: 'system-tab doc-rail-tab', role: 'tab', id: tabId, 'aria-controls': panelId, 'aria-selected': 'false', tabindex: '-1', dataset: { railTab: id } });
      const title = h(doc, 'h3', { class: 'doc-rail-title' });
      const body = h(doc, 'div', { class: 'windoid-body doc-rail-body' });
      const panel = h(doc, 'div', { class: 'doc-rail-panel', role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, hidden: true, dataset: { railPanel: id } }, [title, body]);
      const part = { tab, panel, title, body, onClose: null, className: '' };
      part.handle = Object.freeze({
        root: panel,
        body,
        setTitle(text) { title.textContent = String(text || ''); },
        // A panel has no placement of its own; the rail is the place.
        place() {},
        /** The content module is done with this panel: empty it. The rail stays as it is. */
        close() {
          body.textContent = '';
          title.textContent = tr(TAB_KEYS[id]);
          if (part.className) { panel.classList.remove(...part.className.split(/\s+/).filter(Boolean)); part.className = ''; }
          const done = part.onClose;
          part.onClose = null;
          if (typeof done === 'function') done();
        },
      });
      tab.addEventListener('click', () => show(id, true));
      tablist.append(tab);
      sheet.append(panel);
      parts.set(id, part);
    }

    slot.replaceChildren(toggle);
    if (opts.before && opts.before.parentNode === host) host.insertBefore(rail, opts.before);
    else host.append(rail);
    host.classList.add('doc-rail-host');
    // The upright-phone sheet takes half of the host as it is now, not of the
    // screen: the keyboard shrinks the host, and a fixed share of the screen
    // would then reserve more than the host has (84-windoid.css reads this).
    const sizeSheet = () => { host.style.setProperty('--doc-rail-host-half', `${Math.round(host.clientHeight / 2)}px`); };
    const sheetObserver = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(sizeSheet) : null;
    if (sheetObserver) sheetObserver.observe(host);
    sizeSheet();

    const countOf = (id) => {
      if (!provider || typeof provider.count !== 'function') return 0;
      try { return Math.max(0, Number(provider.count(id)) || 0); } catch (error) { return 0; }
    };

    /** Redraw the toggle and the tab labels: the pending counts, open or closed, the current tab. */
    function update() {
      if (destroyed) return;
      const open = !!provider && memory.open;
      slot.hidden = !provider;
      rail.hidden = !open;
      host.classList.toggle('is-doc-rail-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.classList.toggle('is-active', open);
      let pending = null;
      for (const id of tabs) {
        const part = parts.get(id);
        const n = countOf(id);
        part.tab.textContent = n ? tr('clioworks_rail_tab_count', tr(TAB_KEYS[id]), n) : tr(TAB_KEYS[id]);
        const here = id === memory.tab;
        part.tab.classList.toggle('is-active', here);
        part.tab.setAttribute('aria-selected', String(here));
        part.tab.tabIndex = here ? 0 : -1;
        part.panel.hidden = !here;
        if (!pending && n) pending = { id, n };
      }
      toggle.textContent = pending ? tr('clioworks_rail_tab_count', tr(TAB_KEYS[pending.id]), pending.n) : tr('clioworks_rail_toggle');
      const name = provider && typeof provider.name === 'function' ? String(provider.name() || '') : '';
      caption.textContent = name ? tr('clioworks_rail_follows', name) : '';
    }

    // A panel still holding what the writer typed and has not sent (a reply, a
    // comment) is live: drawing it again would drop or misplace that text.
    const holdsTyping = (id) => [...parts.get(id).body.querySelectorAll('textarea')].some((field) => String(field.value || '').trim());

    /** Open the rail on one tab and have the current document draw it. passive — the
     *  rail's own tab or toggle, not a command: a live panel is shown again as it is. */
    function show(id, passive) {
      if (destroyed || !parts.has(id)) return false;
      memory.tab = id;
      memory.open = true;
      update();
      if (provider && typeof provider.show === 'function' && !(passive && holdsTyping(id))) {
        try { provider.show(id); } catch (error) { console.warn('ClioWorks rail:', error); }
      }
      update();
      if (typeof opts.onLayout === 'function') opts.onLayout(true);
      return true;
    }
    function hide() {
      if (destroyed || !memory.open) return;
      memory.open = false;
      update();
      if (typeof opts.onLayout === 'function') opts.onLayout(false);
    }

    toggle.addEventListener('click', () => {
      if (memory.open) hide();
      else show(memory.tab, true);
    });
    // The tab strip's arrows move between tabs (the tablist pattern); Escape folds the rail away.
    tablist.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const at = tabs.indexOf(memory.tab);
      const next = tabs[(at + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      show(next, true);
      parts.get(next).tab.focus();
    });
    rail.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      event.stopPropagation();
      hide();
      try { toggle.focus(); } catch (error) { /* not focusable */ }
    });

    const api = {
      root: rail,
      toggle,
      tabs: tabs.slice(),
      /** The windoid-shaped handle of one tab's panel. A module's onClose runs when that panel is emptied. */
      panel(id, options = {}) {
        const part = parts.get(id);
        if (!part) return null;
        if (part.onClose && part.onClose !== options.onClose) { const done = part.onClose; part.onClose = null; done(); }
        part.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        if (options.className && options.className !== part.className) {
          part.panel.classList.add(...options.className.split(/\s+/).filter(Boolean));
          part.className = options.className;
        }
        if (options.title) part.title.textContent = options.title;
        else if (!part.title.textContent) part.title.textContent = tr(TAB_KEYS[id]);
        return part.handle;
      },
      show: (id) => show(id),
      hide,
      update,
      isOpen: () => !!provider && memory.open,
      current: () => memory.tab,
      /** A document arrived (provider) or left (null). Arriving with the rail open draws its current tab. */
      bind(next) {
        if (destroyed) return;
        provider = next || null;
        if (!provider) for (const part of parts.values()) part.handle.close();
        update();
        if (provider && memory.open && typeof provider.show === 'function') {
          try { provider.show(memory.tab); } catch (error) { console.warn('ClioWorks rail:', error); }
          update();
        }
      },
      destroy() {
        if (destroyed) return;
        for (const part of parts.values()) part.handle.close();
        destroyed = true;
        provider = null;
        rail.remove();
        if (sheetObserver) sheetObserver.disconnect();
        host.style.removeProperty('--doc-rail-host-half');
        host.classList.remove('doc-rail-host', 'is-doc-rail-open');
        toggle.remove();
        slot.hidden = true;
      },
    };
    update();
    return api;
  }

  root.AISystem6ClioWorksRail = Object.freeze({ create, tabKeys: TAB_KEYS });
  root.AISystem6ClioWorksRailLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
