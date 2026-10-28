// Reader's original-page view for PDFs (ClioWorks N1). Lazy: the loader is
// ensureReaderPagesModule in core/config.js and the sheet is
// styles.reader-pages.css. The page renders as the original on a canvas with
// pdf.js's text layer over it, so selection, clipping and find all read the
// same glyphs the reader sees. The text view stays the extracted text.
(() => {
  "use strict";

  // iOS Safari refuses canvases past 16.7 M pixels and loses the whole page
  // past its memory budget; one page never gets more than this many.
  const CANVAS_PIXEL_CAP = 5242880;
  const PDF_POINT_TO_CSS = 4 / 3; // "100%" is the printed size
  const ZOOM_VALUES = ["fit", "75", "100", "150", "200"];

  /** One PDF stays parsed while the writer flips between the two views. */
  let loaded = null;
  /** What the writer last chose, per file: view, page and zoom. */
  const choices = new Map();
  let session = null;
  let showTicket = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, onClick, extra = {}) {
    const node = el("button", "btn", label);
    node.type = "button";
    if (extra.title) node.title = extra.title;
    if (extra.aria) node.setAttribute("aria-label", extra.aria);
    node.addEventListener("click", onClick);
    return node;
  }

  async function openDocument(file) {
    if (loaded && loaded.file === file) return loaded.promise;
    if (loaded) {
      const previous = loaded.promise;
      previous.then((entry) => entry.pdf.destroy()).catch(() => {});
    }
    const promise = (async () => {
      const pdfjs = await getBrowserPdfJs();
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument(pdfJsDocumentOptions(data)).promise;
      return { pdfjs, pdf };
    })();
    loaded = { file, promise };
    promise.catch(() => {
      if (loaded && loaded.promise === promise) loaded = null;
    });
    return promise;
  }

  function teardown() {
    // The organize view (features/reader-organize.js) owns the content element
    // whenever it is open, which is exactly when this session is null.
    window.AISystem6ReaderOrganize?.teardown();
    if (!session) return;
    session.dead = true;
    session.observer?.disconnect();
    session.thumbObserver?.disconnect();
    session.resizeObserver?.disconnect();
    document.removeEventListener("selectionchange", session.onSelection);
    for (const page of session.pages) releasePage(page);
    session.host.classList.remove("has-pages");
    resetClipLabel();
    session = null;
  }

  // The view switch: three buttons, shown above every view of a PDF.
  function buildViewSwitch(file, view, onSwitch) {
    const group = el("div", "reader-pages-group");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t("reader_pages_views"));
    for (const [id, key] of [
      ["pages", "reader_pages_view_pages"],
      ["organize", "reader_pages_view_organize"],
      ["text", "reader_pages_view_text"],
    ]) {
      const node = button(t(key), () => {
        if (id !== view) onSwitch(id);
      });
      node.setAttribute("aria-pressed", String(id === view));
      group.append(node);
    }
    return group;
  }

  function saved(fileName) {
    if (!choices.has(fileName)) choices.set(fileName, { view: "pages", page: 1, zoom: "fit" });
    return choices.get(fileName);
  }

  /**
   * Draw the PDF's view into the Reader content element.
   * @param {File} file the PDF the writer opened
   * @param {object} page Reader's currentReaderPage
   * @param {object|null} source a Scrapbook clip's source: bring the reader back to its page
   */
  async function show(file, page, source) {
    const host = readerContentEl;
    const renderText = () => renderReaderDocumentView();
    const jump = source && source.fileName === page.fileName && source.page > 0
      ? { page: source.page, position: source.pagePosition }
      : null;
    const choice = saved(page.fileName);
    if (jump) choice.view = "pages";
    await whenLanguageReady();
    teardown();
    const ticket = ++showTicket;
    const switchTo = (view) => {
      choice.view = view;
      show(file, page);
    };
    if (choice.view === "text") {
      renderText();
      const bar = el("div", "reader-pages-bar");
      bar.append(buildViewSwitch(file, "text", switchTo));
      host.prepend(bar);
      return;
    }
    if (choice.view === "organize") {
      host.replaceChildren(el("div", "reader-pages-note", t("reader_organize_opening")));
      try {
        await ensureReaderOrganizeModule();
      } catch {
        choice.view = "pages";
        show(file, page);
        return;
      }
      // A newer show() took the content element while the module loaded.
      if (ticket !== showTicket) return;
      const makeBar = (view) => {
        const bar = el("div", "reader-pages-bar");
        bar.append(buildViewSwitch(file, view, switchTo));
        return bar;
      };
      await window.AISystem6ReaderOrganize.show({ host, file, page, makeBar });
      return;
    }
    host.replaceChildren();
    host.classList.add("has-pages");
    host.append(el("div", "reader-pages-note", t("reader_pages_opening")));
    let entry;
    try {
      entry = await openDocument(file);
    } catch (error) {
      if (!host.isConnected) return;
      host.classList.remove("has-pages");
      renderText();
      const bar = el("div", "reader-pages-bar");
      bar.append(el("span", "", t("reader_pages_failed")));
      host.prepend(bar);
      return;
    }
    // A newer show() took the content element while the file loaded.
    if (ticket !== showTicket) return;
    build({ host, file, page, entry, choice, switchTo, jump });
  }

  function build({ host, file, page, entry, choice, switchTo, jump }) {
    const { pdf, pdfjs } = entry;
    const s = {
      host, pdf, pdfjs, file, choice, fileName: page.fileName,
      pages: [], dead: false, chain: Promise.resolve(), thumbChain: Promise.resolve(),
      estimate: null, zoom: choice.zoom, search: null,
    };
    session = s;

    const bar = el("div", "reader-pages-bar");
    bar.append(buildViewSwitch(file, "pages", switchTo));

    const nav = el("div", "reader-pages-group");
    const number = el("input", "reader-pages-number");
    number.type = "text";
    number.inputMode = "numeric";
    number.setAttribute("aria-label", t("reader_pages_goto"));
    const counter = el("span", "reader-pages-counter");
    nav.append(number, counter);

    const zoomGroup = el("div", "reader-pages-group");
    const zoomWrap = el("span", "select-wrap");
    const zoomSelect = el("select");
    zoomSelect.setAttribute("aria-label", t("reader_pages_zoom"));
    for (const value of ZOOM_VALUES) {
      const option = el("option", "", value === "fit" ? t("reader_pages_zoom_fit") : `${value}%`);
      option.value = value;
      zoomSelect.append(option);
    }
    zoomSelect.value = s.zoom;
    zoomWrap.append(zoomSelect);
    zoomGroup.append(zoomWrap);

    const findGroup = el("div", "reader-pages-group");
    const findInput = el("input", "reader-pages-find");
    findInput.type = "search";
    findInput.placeholder = t("reader_pages_find");
    findInput.setAttribute("aria-label", t("reader_pages_find"));
    const findPrev = button("↑", () => stepHit(s, -1), { aria: t("reader_pages_find_prev"), title: t("reader_pages_find_prev") });
    const findNext = button("↓", () => stepHit(s, 1), { aria: t("reader_pages_find_next"), title: t("reader_pages_find_next") });
    const findCount = el("span", "reader-pages-find-count");
    findCount.setAttribute("aria-live", "polite");
    findGroup.append(findInput, findPrev, findNext, findCount);
    const extractButton = button(t("reader_pages_table_extract"), () => toggleExtraction(s, extractButton), { title: t("reader_pages_table_extract_hint") });
    extractButton.setAttribute("aria-pressed", "false");
    bar.append(nav, zoomGroup, findGroup, extractButton);

    const body = el("div", "reader-pages-body");
    const thumbs = el("ul", "reader-pages-thumbs");
    thumbs.setAttribute("aria-label", t("reader_pages_thumbs"));
    const scroll = el("div", "reader-pages-scroll");
    scroll.setAttribute("role", "document");
    scroll.setAttribute("aria-label", t("reader_pages_scroll"));
    body.append(thumbs, scroll);
    host.replaceChildren(bar, body);
    if (typeof initSystemSelectControls === "function") initSystemSelectControls();
    Object.assign(s, { scroll, thumbs, number, counter, findInput, findCount });

    const total = pdf.numPages;
    for (let n = 1; n <= total; n += 1) {
      const holder = el("div", "reader-page");
      holder.dataset.page = String(n);
      scroll.append(holder);
      const item = el("li");
      const thumbButton = el("button", "reader-pages-thumb");
      thumbButton.type = "button";
      thumbButton.dataset.page = String(n);
      thumbButton.append(el("span", "", String(n)));
      thumbButton.addEventListener("click", () => goToPage(s, n, null));
      item.append(thumbButton);
      thumbs.append(item);
      s.pages.push({ n, el: holder, thumb: thumbButton, base: null, state: "idle", wanted: false, hits: [], thumbState: "idle" });
    }

    // One page ahead and one behind the visible ones, then they let go.
    s.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const record = s.pages[Number(entry.target.dataset.page) - 1];
        record.wanted = entry.isIntersecting;
        if (entry.isIntersecting) queueRender(s, record);
        else releasePage(record);
      }
    }, { root: scroll, rootMargin: "100% 0px 100% 0px" });
    s.thumbObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const record = s.pages[Number(entry.target.dataset.page) - 1];
        if (entry.isIntersecting) queueThumb(s, record);
      }
    }, { root: thumbs, rootMargin: "200px 0px" });

    layoutAll(s, null).then(() => {
      if (s.dead) return;
      for (const record of s.pages) {
        s.observer.observe(record.el);
        s.thumbObserver.observe(record.thumb);
      }
      goToPage(s, jump?.page || choice.page || 1, jump?.position || null, false);
    });

    let scrollFrame = 0;
    scroll.addEventListener("scroll", () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        updateCurrent(s);
      });
    });
    number.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const wanted = Number.parseInt(number.value, 10);
      if (wanted >= 1 && wanted <= total) goToPage(s, wanted, null);
      else number.value = String(s.current || 1);
    });
    zoomSelect.addEventListener("change", () => {
      s.zoom = zoomSelect.value;
      choice.zoom = s.zoom;
      relayout(s);
    });
    findInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (s.search && s.search.query === findInput.value.trim()) stepHit(s, event.shiftKey ? -1 : 1);
        else runSearch(s, findInput.value);
      }
    });
    findInput.addEventListener("input", () => {
      if (!findInput.value.trim()) clearSearch(s);
    });

    let resizeTimer = 0;
    s.resizeObserver = new ResizeObserver(() => {
      if (s.zoom !== "fit") return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!s.dead && Math.abs(scroll.clientWidth - (s.fitWidth || 0)) > 4) relayout(s);
      }, 120);
    });
    s.resizeObserver.observe(scroll);

    s.onSelection = () => syncClipLabel(s);
    document.addEventListener("selectionchange", s.onSelection);
  }

  // --- layout -------------------------------------------------------------

  async function pageBase(s, record) {
    if (record.base) return record.base;
    const pdfPage = await s.pdf.getPage(record.n);
    const view = pdfPage.getViewport({ scale: 1 });
    record.base = { width: view.width, height: view.height };
    return record.base;
  }

  function cssScaleFor(s, baseWidth) {
    if (s.zoom === "fit") {
      s.fitWidth = s.scroll.clientWidth;
      const room = Math.max(160, s.scroll.clientWidth - 28);
      return room / baseWidth;
    }
    return (Number(s.zoom) / 100) * PDF_POINT_TO_CSS;
  }

  function sizePlaceholder(s, record) {
    const base = record.base || s.estimate;
    const scale = cssScaleFor(s, base.width);
    record.scale = scale;
    record.el.style.setProperty("--page-w", `${Math.floor(base.width * scale)}px`);
    record.el.style.setProperty("--page-h", `${Math.floor(base.height * scale)}px`);
    record.el.style.setProperty("--total-scale-factor", String(scale));
  }

  async function layoutAll(s, anchor) {
    s.estimate = await pageBase(s, s.pages[0]);
    if (s.dead) return;
    for (const record of s.pages) sizePlaceholder(s, record);
    s.counter.textContent = t("reader_pages_counter", s.current || 1, s.pages.length);
    if (anchor) restoreAnchor(s, anchor);
  }

  function currentAnchor(s) {
    const record = s.pages[(s.current || 1) - 1];
    if (!record || !record.el.offsetHeight) return null;
    const into = s.scroll.scrollTop - record.el.offsetTop;
    return { n: record.n, fraction: into / record.el.offsetHeight };
  }

  function restoreAnchor(s, anchor) {
    const record = s.pages[anchor.n - 1];
    s.scroll.scrollTop = record.el.offsetTop + anchor.fraction * record.el.offsetHeight;
  }

  function relayout(s) {
    const anchor = currentAnchor(s);
    for (const record of s.pages) releasePage(record);
    layoutAll(s, anchor).then(() => {
      if (s.dead) return;
      for (const record of s.pages) {
        // A page that is on screen after the resize asks again.
        s.observer.unobserve(record.el);
        s.observer.observe(record.el);
      }
    });
  }

  // --- page rendering -------------------------------------------------------

  function queueRender(s, record) {
    if (record.state !== "idle") return;
    record.state = "queued";
    s.chain = s.chain.then(() => renderPage(s, record)).catch(() => {});
  }

  async function renderPage(s, record) {
    if (s.dead || !record.wanted || record.state !== "queued") {
      if (record.state === "queued") record.state = "idle";
      return;
    }
    record.state = "rendering";
    try {
      const pdfPage = await s.pdf.getPage(record.n);
      if (s.dead || !record.wanted) { record.state = "idle"; return; }
      const first = pdfPage.getViewport({ scale: 1 });
      record.base = { width: first.width, height: first.height };
      sizePlaceholder(s, record);
      const scale = record.scale;
      const viewport = pdfPage.getViewport({ scale });
      let ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixels = viewport.width * ratio * viewport.height * ratio;
      if (pixels > CANVAS_PIXEL_CAP) ratio *= Math.sqrt(CANVAS_PIXEL_CAP / pixels);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      const textLayer = el("div", "reader-page-text reader-body-content");
      record.el.replaceChildren(canvas, textLayer);
      const renderTask = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      record.task = renderTask;
      const layer = new s.pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: textLayer,
        viewport,
      });
      await Promise.all([renderTask.promise, layer.render()]);
      if (s.dead || record.el.firstChild !== canvas) return;
      record.layer = layer;
      record.text = layer.textContentItemsStr.join("");
      record.state = "done";
      applyHits(record);
    } catch (error) {
      if (error?.name !== "RenderingCancelledException") record.state = "idle";
    }
  }

  function releasePage(record) {
    record.wanted = false;
    if (record.task) {
      try { record.task.cancel(); } catch { /* already finished */ }
      record.task = null;
    }
    const canvas = record.el.querySelector("canvas");
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (record.el.firstChild) record.el.replaceChildren();
    record.layer = null;
    record.state = "idle";
  }

  function queueThumb(s, record) {
    if (record.thumbState !== "idle") return;
    record.thumbState = "queued";
    s.thumbChain = s.thumbChain.then(async () => {
      if (s.dead) return;
      try {
        const pdfPage = await s.pdf.getPage(record.n);
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = 84 / base.width;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await pdfPage.render({ canvas, viewport }).promise;
        if (s.dead) return;
        record.thumb.prepend(canvas);
        record.thumbState = "done";
      } catch {
        record.thumbState = "idle";
      }
    }).catch(() => {});
  }

  // --- table extraction ----------------------------------------------------
  // The rectangle itself is Reader-Organize's (features/reader-organize.js);
  // this is only the arming switch on the original-page bar.

  function toggleExtraction(s, extractButton) {
    const disarm = () => {
      extractButton.setAttribute("aria-pressed", "false");
      s.extracting = false;
    };
    if (s.extracting) {
      window.AISystem6ReaderOrganize?.extraction?.stop?.();
      disarm();
      return;
    }
    s.extracting = true;
    extractButton.setAttribute("aria-pressed", "true");
    window.AISystem6ReaderOrganize.beginTableExtraction(s, disarm);
  }

  // --- navigation ---------------------------------------------------------

  function updateCurrent(s) {
    const top = s.scroll.scrollTop + s.scroll.clientHeight / 3;
    let current = 1;
    for (const record of s.pages) {
      if (record.el.offsetTop + record.el.offsetHeight > top) { current = record.n; break; }
      current = record.n;
    }
    if (current === s.current && s.counter.textContent) return;
    s.current = current;
    s.choice.page = current;
    s.counter.textContent = t("reader_pages_counter", current, s.pages.length);
    s.number.value = String(current);
    for (const record of s.pages) {
      if (record.n === current) record.thumb.setAttribute("aria-current", "true");
      else record.thumb.removeAttribute("aria-current");
    }
    const active = s.pages[current - 1].thumb;
    const strip = s.thumbs;
    if (active.offsetTop < strip.scrollTop || active.offsetTop + active.offsetHeight > strip.scrollTop + strip.clientHeight) {
      strip.scrollTop = active.offsetTop - 8;
    }
  }

  function goToPage(s, n, position, smooth = true) {
    const record = s.pages[Math.min(Math.max(1, n), s.pages.length) - 1];
    if (!record) return;
    const fraction = Math.min(Math.max(Number(position?.y) || 0, 0), 1);
    const top = record.el.offsetTop + record.el.offsetHeight * fraction - (fraction ? 40 : 0);
    s.scroll.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    s.current = 0;
    updateCurrent(s);
  }

  // --- find ---------------------------------------------------------------

  function clearSearch(s) {
    for (const record of s.pages) {
      record.hits = [];
      record.layer?.textDivs.forEach((div) => div.classList.remove("reader-page-hit", "is-current"));
    }
    s.search = null;
    s.findCount.textContent = "";
  }

  async function runSearch(s, rawQuery) {
    const query = rawQuery.trim();
    clearSearch(s);
    if (!query) return;
    const token = { query, hits: [], index: -1, done: false };
    s.search = token;
    const needle = query.toLocaleLowerCase();
    for (const record of s.pages) {
      if (s.dead || s.search !== token) return;
      s.findCount.textContent = t("reader_pages_find_working", record.n);
      const pdfPage = await s.pdf.getPage(record.n);
      const content = await pdfPage.getTextContent();
      const strings = content.items.map((item) => item.str ?? "");
      const offsets = [];
      let joined = "";
      for (const str of strings) { offsets.push(joined.length); joined += str; }
      const haystack = joined.toLocaleLowerCase();
      if (haystack.length !== joined.length) continue; // a case map that moves offsets cannot be located
      record.hits = [];
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        const items = [];
        for (let i = 0; i < strings.length; i += 1) {
          if (offsets[i] < end && offsets[i] + strings[i].length > at) items.push(i);
        }
        if (items.length) {
          const hit = { page: record.n, items };
          record.hits.push(hit);
          token.hits.push(hit);
        }
        from = at + Math.max(1, needle.length);
      }
      applyHits(record);
      if (token.index < 0 && token.hits.length) {
        token.index = 0;
        showHit(s, token);
      }
      updateFindCount(s, token);
    }
    token.done = true;
    updateFindCount(s, token);
  }

  function updateFindCount(s, token) {
    if (s.search !== token) return;
    if (!token.hits.length) s.findCount.textContent = token.done ? t("reader_pages_find_none") : s.findCount.textContent;
    else s.findCount.textContent = t("reader_pages_find_count", token.index + 1, token.hits.length);
  }

  function stepHit(s, direction) {
    const token = s.search;
    if (!token || !token.hits.length) return;
    token.index = (token.index + direction + token.hits.length) % token.hits.length;
    showHit(s, token);
    updateFindCount(s, token);
  }

  function showHit(s, token) {
    const hit = token.hits[token.index];
    if (!hit) return;
    for (const record of s.pages) {
      record.layer?.textDivs.forEach((div) => div.classList.remove("is-current"));
    }
    goToPage(s, hit.page, null);
    const mark = () => {
      const record = s.pages[hit.page - 1];
      const divs = record.layer?.textDivs;
      if (!divs) return false;
      const first = divs[hit.items[0]];
      for (const index of hit.items) divs[index]?.classList.add("is-current");
      first?.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    };
    if (mark()) return;
    // The page is still being drawn; its text layer arrives a moment later.
    let tries = 0;
    const wait = setInterval(() => {
      tries += 1;
      if (s.dead || s.search !== token || token.hits[token.index] !== hit || mark() || tries > 40) clearInterval(wait);
    }, 100);
  }

  function applyHits(record) {
    const divs = record.layer?.textDivs;
    if (!divs) return;
    for (const hit of record.hits) {
      for (const index of hit.items) divs[index]?.classList.add("reader-page-hit");
    }
  }

  // --- clipping -----------------------------------------------------------

  /**
   * Which page the current selection starts on, and where on it, as fractions
   * of the page box. A clip carries this so it can bring the reader back.
   */
  function selectionPage(selection) {
    if (!session || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const holder = node?.closest?.(".reader-page");
    if (!holder || !session.scroll.contains(holder)) return null;
    const box = holder.getBoundingClientRect();
    const rect = range.getBoundingClientRect();
    const round = (value) => Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 1000;
    return {
      page: Number(holder.dataset.page),
      pageCount: session.pages.length,
      pagePosition: box.width && box.height
        ? { x: round((rect.left - box.left) / box.width), y: round((rect.top - box.top) / box.height) }
        : null,
    };
  }

  function clipButton() {
    return document.getElementById("reader-clip-button");
  }

  function resetClipLabel() {
    const node = clipButton();
    if (node?.dataset.pageLabel) {
      node.textContent = t("clip");
      delete node.dataset.pageLabel;
    }
  }

  function syncClipLabel(s) {
    const node = clipButton();
    if (!node || s.dead) return;
    const info = selectionPage(window.getSelection());
    if (info && window.getSelection().toString().trim()) {
      node.textContent = t("reader_clip_with_page", info.page);
      node.dataset.pageLabel = String(info.page);
    } else {
      resetClipLabel();
    }
  }

  /** Scroll the open view to a clip's page. Returns false when no PDF view is open for it. */
  function goTo(fileName, jump) {
    if (!session || session.fileName !== fileName || !jump?.page) return false;
    goToPage(session, jump.page, jump.position || null);
    return true;
  }

  window.AISystem6ReaderPages = Object.freeze({ show, teardown, selectionPage, goTo, canvasPixelCap: CANVAS_PIXEL_CAP });
})();
