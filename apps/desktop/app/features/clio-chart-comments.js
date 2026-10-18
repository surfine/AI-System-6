// Comments windoid for the ClioChart workbook surface (S11-21, convention D).
// A windoid is a small tool window: a thin title bar with a close box only, one
// at a time per host window, docked by one pure rule (windoidPlacement). This
// file holds the reusable constructor (AISystem6Windoid.create) and the comment
// list built on it. It never owns the workbook: it reads and writes comments
// only through the adapter's narrow surface (comments / addComment /
// replyComment), every write is the adapter's own undoable transaction, and
// the caller learns about it through onChange. Cross-lane calls are
// feature-detected so a missing adapter method reads as "unavailable", not a
// crash. All text goes through textContent; comment text is data.
(function () {
  "use strict";
  if (window.AISystem6ClioChartComments) return;

  // Width thresholds of the docking rule (S11-C6). The dock-below band also
  // needs the main area to keep at least MAIN_MIN_PX after the windoid takes
  // its strip; the windoid's own docked height is DOCK_HEIGHT_PX.
  const FLOAT_MIN_WIDTH = 1040;
  const DOCK_MIN_WIDTH = 640;
  const MAIN_MIN_PX = 200;
  const DOCK_HEIGHT_PX = 188;
  // The host's main area (the grid region). The windoid floats over, or
  // replaces, only this area: the status and input bars above it stay visible.
  const MAIN_SELECTOR = ".cwk-body";

  const tr = (key, ...args) => (typeof window.t === "function" ? window.t(key, ...args) : key);

  // 'float-right' at >= 1040; 'dock-below' from 640 to 1039 while the main
  // area stays >= 200px (mainHeight omitted = unknown, assumed enough);
  // otherwise 'swap' (the windoid replaces the main area, close brings it back).
  function windoidPlacement(contentWidth, mainHeight) {
    const width = Number(contentWidth);
    if (!Number.isFinite(width) || width < DOCK_MIN_WIDTH) return "swap";
    if (width >= FLOAT_MIN_WIDTH) return "float-right";
    if (mainHeight === undefined || mainHeight === null) return "dock-below";
    const main = Number(mainHeight);
    return Number.isFinite(main) && main >= MAIN_MIN_PX ? "dock-below" : "swap";
  }

  // ---- the reusable primitive -------------------------------------------
  // create({ host, title, label, className, onClose }) -> { root, body, setTitle, place, close }
  // One live windoid per host: creating a second closes the first.
  const liveByHost = new WeakMap();

  function createWindoid(options) {
    const opts = options || {};
    const host = opts.host;
    if (!host || typeof host.appendChild !== "function") return null;
    const previous = liveByHost.get(host);
    if (previous) previous.close();

    const root = document.createElement("div");
    root.className = "windoid" + (opts.className ? " " + opts.className : "");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", opts.label || opts.title || "");

    const bar = document.createElement("div");
    bar.className = "windoid-titlebar";
    const closeBox = document.createElement("button");
    closeBox.type = "button";
    closeBox.className = "windoid-close";
    closeBox.setAttribute("aria-label", tr("clio_comments_close"));
    const title = document.createElement("span");
    title.className = "windoid-title";
    title.textContent = opts.title || "";
    bar.append(closeBox, title);

    const body = document.createElement("div");
    body.className = "windoid-body";
    root.append(bar, body);
    host.appendChild(root);
    host.classList?.add("has-windoid");

    let closed = false;
    let observer = null;
    const handle = {
      root,
      body,
      title,
      setTitle(text) { title.textContent = text; },
      place() {
        const width = host.clientWidth || (host.getBoundingClientRect ? host.getBoundingClientRect().width : 0);
        const height = host.clientHeight || 0;
        const placement = width ? windoidPlacement(width, height ? height - DOCK_HEIGHT_PX : undefined) : "dock-below";
        // Where the main area starts inside the host; the stylesheet keeps the
        // floating and swapped windoid below the bars above it.
        const main = host.querySelector ? host.querySelector(opts.mainSelector || MAIN_SELECTOR) : null;
        const top = main && Number.isFinite(main.offsetTop) ? Math.max(0, main.offsetTop) : 0;
        root.style.setProperty("--windoid-main-top", top + "px");
        root.dataset.windoidPlacement = placement;
        host.dataset.windoidPlacement = placement;
        return placement;
      },
      close() {
        if (closed) return;
        closed = true;
        observer?.disconnect?.();
        root.remove();
        host.classList?.remove("has-windoid");
        if (host.dataset) delete host.dataset.windoidPlacement;
        if (liveByHost.get(host) === handle) liveByHost.delete(host);
        opts.onClose?.();
      },
    };
    closeBox.addEventListener("click", () => handle.close());
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.stopPropagation();
        handle.close();
      }
    });
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => handle.place());
      observer.observe(host);
      const main = host.querySelector ? host.querySelector(opts.mainSelector || MAIN_SELECTOR) : null;
      if (main) observer.observe(main);
    }
    liveByHost.set(host, handle);
    handle.place();
    return handle;
  }

  if (!window.AISystem6Windoid) window.AISystem6Windoid = { create: createWindoid, placement: windoidPlacement };

  // ---- the comments list -------------------------------------------------
  const CELL_REF = /^[A-Za-z]{1,3}[0-9]{1,7}(:[A-Za-z]{1,3}[0-9]{1,7})?$/;
  const anchorCell = (ref) => String(ref || "").split(":")[0];

  // Roots in order with their replies; roots whose anchor is not a cell
  // reference land in `orphans` (kept, never dropped: 「找不到落点」).
  function groupComments(list) {
    const byId = new Map();
    const roots = [];
    for (const item of Array.isArray(list) ? list : []) {
      byId.set(item.id, { item, replies: [] });
    }
    for (const entry of byId.values()) {
      const parent = entry.item.parentId != null ? byId.get(entry.item.parentId) : null;
      if (parent) parent.replies.push(entry.item);
      else roots.push(entry);
    }
    const anchored = [];
    const orphans = [];
    for (const entry of roots) {
      (CELL_REF.test(String(entry.item.ref || "")) ? anchored : orphans).push(entry);
    }
    return { anchored, orphans };
  }

  function open(request) {
    const req = request || {};
    const host = req.host;
    let sheet = req.sheet;
    let ref = req.ref;
    const adapter = req.adapter;
    const windoid = createWindoid({
      host,
      title: tr("clio_comments_title"),
      label: tr("clio_comments_title"),
      className: "clio-comments-windoid",
      onClose: () => req.onClose?.(),
    });
    if (!windoid) return { close() {}, refresh() {} };

    const body = windoid.body;
    let note = "";
    let replyingTo = null;
    let draft = "";

    const supported = () => !!adapter
      && typeof adapter.comments === "function"
      && typeof adapter.addComment === "function";

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    function fail(message) {
      note = message;
      render();
    }

    async function write(kind, action) {
      let result;
      try {
        result = await action();
      } catch (error) {
        fail(tr("clio_comments_failed", String(error?.message || error)));
        return;
      }
      if (result && (result.status === "blocked" || result.status === "failed" || result.ok === false)) {
        fail(result.status === "blocked" && result.code === "LEGACY_NO_REPLY"
          ? tr("clio_comments_reply_blocked")
          : tr("clio_comments_failed", String(result.message || result.code || result.reason || "")));
        return;
      }
      note = "";
      replyingTo = null;
      draft = "";
      try { req.onChange?.({ kind, id: result?.id, sheet, ref }); } catch (_) { /* the caller's problem */ }
      render();
    }

    function composer({ placeholder, submitLabel, onSubmit, onCancel, enabled, autofocus }) {
      const form = el("div", "windoid-composer");
      const field = el("textarea", "windoid-input");
      field.rows = 2;
      field.value = draft;
      field.placeholder = placeholder;
      field.setAttribute("aria-label", placeholder);
      const row = el("div", "windoid-actions");
      const send = el("button", "btn default", submitLabel);
      send.type = "button";
      send.disabled = !enabled || !draft.trim();
      field.addEventListener("input", () => {
        draft = field.value;
        send.disabled = !enabled || !draft.trim();
      });
      const submit = () => { if (!send.disabled) onSubmit(draft.trim()); };
      field.addEventListener("keydown", (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      });
      send.addEventListener("click", submit);
      row.append(send);
      if (onCancel) {
        const cancel = el("button", "btn", tr("clio_comments_cancel"));
        cancel.type = "button";
        cancel.addEventListener("click", onCancel);
        row.append(cancel);
      }
      form.append(field, row);
      if (autofocus) queueMicrotask(() => field.focus?.());
      return form;
    }

    function thread({ item, replies }) {
      const box = el("li", "windoid-thread");
      box.dataset.commentId = String(item.id);
      const entries = [item, ...replies];
      for (const entry of entries) {
        const line = el("div", "windoid-comment" + (entry === item ? "" : " is-reply"));
        const head = el("div", "windoid-comment-head");
        head.append(el("span", "windoid-author", entry.author || tr("clio_comments_author_unknown")));
        if (entry === item && entry.ref) head.append(el("span", "windoid-anchor", entry.ref));
        if (entry.date) head.append(el("span", "windoid-date", String(entry.date).slice(0, 10)));
        if (entry === item && entry.done) head.append(el("span", "windoid-done", tr("clio_comments_done")));
        line.append(head, el("div", "windoid-text", entry.text || ""));
        box.append(line);
      }
      if (replyingTo === item.id) {
        box.append(composer({
          placeholder: tr("clio_comments_reply_placeholder"),
          submitLabel: tr("clio_comments_reply_send"),
          enabled: typeof adapter.replyComment === "function",
          autofocus: true,
          onSubmit: (text) => write("reply", () => adapter.replyComment(sheet, item.id, {
            author: req.author || tr("clio_comments_author_default"), text, date: new Date().toISOString(),
          })),
          onCancel: () => { replyingTo = null; draft = ""; render(); },
        }));
      } else if (typeof adapter.replyComment === "function" && item.threaded !== false) {
        // A legacy comment (threaded:false) cannot take a reply, so no button (S11-C1).
        const reply = el("button", "btn windoid-reply", tr("clio_comments_reply"));
        reply.type = "button";
        reply.addEventListener("click", () => { replyingTo = item.id; draft = ""; render(); });
        box.append(reply);
      }
      return box;
    }

    function render() {
      body.textContent = "";
      if (!supported()) {
        body.append(el("p", "windoid-empty", tr("clio_comments_unavailable")));
        return;
      }
      let list = [];
      try { list = adapter.comments(sheet) || []; } catch (error) { note = tr("clio_comments_failed", String(error?.message || error)); }
      const { anchored, orphans } = groupComments(list);
      windoid.setTitle(list.length ? tr("clio_comments_title_count", list.length) : tr("clio_comments_title"));

      const cell = anchorCell(ref);
      if (replyingTo == null) {
        body.append(composer({
          placeholder: cell ? tr("clio_comments_add_placeholder", cell) : tr("clio_comments_pick_cell"),
          submitLabel: tr("clio_comments_add"),
          enabled: !!cell,
          onSubmit: (text) => write("add", () => adapter.addComment(sheet, cell, {
            author: req.author || tr("clio_comments_author_default"), text, date: new Date().toISOString(),
          })),
        }));
      }
      if (note) {
        const alert = el("p", "windoid-note", note);
        alert.setAttribute("role", "alert");
        body.append(alert);
      }
      if (!list.length) body.append(el("p", "windoid-empty", tr("clio_comments_empty")));
      if (anchored.length) {
        const ul = el("ul", "windoid-threads");
        for (const entry of anchored) ul.append(thread(entry));
        body.append(ul);
      }
      if (orphans.length) {
        const group = el("section", "windoid-orphans");
        group.append(el("h3", "windoid-group-title", tr("clio_comments_orphans")), el("p", "windoid-hint", tr("clio_comments_orphans_hint")));
        const ul = el("ul", "windoid-threads");
        for (const entry of orphans) ul.append(thread(entry));
        group.append(ul);
        body.append(group);
      }
    }

    render();
    return {
      close: () => windoid.close(),
      // refresh() re-reads the adapter; an optional { sheet, ref } moves the anchor.
      refresh(next) {
        if (next && typeof next === "object") {
          if ("sheet" in next && next.sheet !== sheet) {
            sheet = next.sheet;
            // Comment ids and a half-written reply belong to the sheet they were opened on.
            replyingTo = null;
            note = "";
          }
          if ("ref" in next) ref = next.ref;
        }
        windoid.place();
        render();
      },
    };
  }

  window.AISystem6ClioChartComments = { open, windoidPlacement, groupComments };
})();
