// Review Desk: comment threads on the manuscript, and compare-two-versions.
//
// The model is app/core/review-comments.js (threads, state replies, anchors)
// over app/core/text-quote.js; this file is the panel that shows it and the
// marks it puts on TeachText's page. Nothing here writes into the manuscript:
// a comment is kept on the project record beside it (project.reviewComments),
// and the writer's own words stay the writer's.
//
// The panel is the Review Desk's "comments" lens (opened from Commands…). It
// has two views: the threads, and a word-by-word compare of two saved
// versions (or the text as it is now).

(function installReviewDeskComments() {
  if (window.AISystem6ReviewDeskPanel) return;

  const Quote = window.AISystem6TextQuote;
  const Comments = window.AISystem6ReviewComments;
  const NAME_KEY = "ai-system6-reviewer-name";
  const KIND_KEYS = { note: "review_kind_note", voice: "review_kind_voice", fact: "review_kind_fact", structure: "review_kind_structure" };
  // The writer ticks under one fixed key, not their translated label.
  const WRITER_TICK = "writer";
  const STATE_KEYS = { open: "review_state_open", accepted: "review_state_accepted", rejected: "review_state_rejected", completed: "review_state_completed" };

  const view = {
    tab: "comments",
    query: "",
    state: "all",
    kind: "all",
    current: "",
    replying: "",
    composerKind: "note",
    composerText: "",
    pending: null, // { quote, start } the passage the next comment is about
    revisions: [],
    from: "",
    to: "current",
    hunkKind: "all",
    hunk: 0,
    diff: null,
  };
  let history = null;
  let historyProject = "";
  let built = false;
  let timer = 0;

  const say = (key, ...args) => (typeof t === "function" ? t(key, ...args) : key);
  const panelEl = () => document.getElementById("review-comments-panel");
  const project = () => (typeof getActiveProject === "function" ? getActiveProject() : null);

  function node(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function button(label, action, className = "btn mini-btn") {
    const element = node("button", className, label);
    element.type = "button";
    element.dataset.rcAction = action;
    return element;
  }

  // ---- what the comments are about ---------------------------------------

  // The manuscript as the writer sees it in TeachText. Comments anchor in this
  // text; offsets are positions in the editor.
  function manuscriptInput() {
    return typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput : null;
  }
  function manuscriptReady() {
    return !!manuscriptInput() && typeof isTeachTextManuscriptRole === "function" && isTeachTextManuscriptRole();
  }
  function manuscriptText() {
    return manuscriptReady() ? manuscriptInput().value || "" : null;
  }

  // A list is checked once, the first time the desk reads it: unsound records
  // (a reply whose comment is gone, a duplicate) are dropped here, so the
  // backup validator, which refuses the same things, never meets them.
  const checkedLists = new WeakSet();
  function list() {
    const p = project();
    if (!p) return [];
    if (!Array.isArray(p.reviewComments)) p.reviewComments = [];
    if (!checkedLists.has(p.reviewComments)) {
      const clean = Comments.sanitize(p.reviewComments);
      if (clean.length !== p.reviewComments.length) {
        p.reviewComments = clean;
        persist(false);
      }
      checkedLists.add(p.reviewComments);
    }
    return p.reviewComments;
  }

  function readName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
  }
  function rememberName(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch { /* a private window keeps no name; the field still works */ }
  }
  function author() {
    const name = (panelEl()?.querySelector("[data-rc-name]")?.value || "").trim();
    rememberName(name);
    return name ? { role: "reviewer", name } : { role: "writer", name: "" };
  }

  // ---- storage and undo ---------------------------------------------------

  function persist(touch = true) {
    const p = project();
    if (!p) return;
    if (touch) p.updatedAt = new Date().toISOString();
    if (typeof saveDeskState === "function") saveDeskState();
  }

  // Adding a comment, a reply or a state is undoable from Edit; the history
  // restores the list as it was, which is why every change replaces the array
  // instead of editing it.
  function editHistory() {
    const p = project();
    if (!p || !window.AISystem6EditHistory) return null;
    if (history && historyProject === p.id) return history;
    historyProject = p.id;
    history = window.AISystem6EditHistory.createEditHistory({
      read: () => project()?.reviewComments || [],
      write: (snapshot) => {
        const current = project();
        if (!current) return;
        current.reviewComments = snapshot;
        persist();
        render();
        applyDecorations();
      },
      limit: 100,
    });
    return history;
  }

  function commit(labelKey, next) {
    const p = project();
    if (!p || !next) return false;
    const recorder = editHistory();
    if (recorder) recorder.change(labelKey, () => { p.reviewComments = next; });
    else p.reviewComments = next;
    persist();
    return true;
  }

  // ---- the marks on TeachText ---------------------------------------------

  function threads(text = manuscriptText()) {
    return Comments.buildThreads(list(), text);
  }

  function shorten(text, length = 80) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
  }

  function authorLabel(who) {
    return who?.role === "reviewer" && who.name ? who.name : say("review_comment_writer");
  }

  function applyDecorations() {
    const input = manuscriptInput();
    const editor = window.AISystem6WritingEditor;
    if (!input || !editor || typeof editor.setDecorations !== "function") return;
    const text = manuscriptText();
    const ranges = text === null ? [] : threads(text)
      .filter((thread) => thread.place.status === "found")
      .map((thread) => ({
        from: thread.place.start,
        to: thread.place.end,
        className: `cm-review-comment${thread.id === view.current ? " is-current" : ""}${thread.state !== "open" ? " is-done" : ""}`,
        title: `${authorLabel(thread.root.author)}: ${shorten(thread.root.text)}`,
        id: thread.id,
      }));
    editor.setDecorations(input, ranges);
  }

  // Keep each comment's last-known offset current. It is bookkeeping beside
  // the thread, never part of anyone's words (see review-comments.js).
  function followEdits() {
    const text = manuscriptText();
    if (text === null) return;
    const before = list();
    const after = Comments.refreshTracks(before, text);
    if (after !== before) {
      const p = project();
      if (p) { p.reviewComments = after; persist(false); }
    }
  }

  function scheduleFollow() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      followEdits();
      applyDecorations();
      if (isShown() && view.tab === "comments") renderList();
    }, 420);
  }

  function isShown() {
    const panel = panelEl();
    return !!panel && !panel.classList.contains("is-hidden") && !panel.closest(".window.is-hidden");
  }

  // ---- reading the writer's selection -------------------------------------

  function selectionIn(input, offset) {
    if (!input || input.selectionEnd <= input.selectionStart) return null;
    const quote = input.value.slice(input.selectionStart, input.selectionEnd);
    if (!quote.trim()) return null;
    return { quote, start: offset + input.selectionStart };
  }

  // The writer may be selecting in TeachText or in the Review Desk's section
  // pane (a projection of the same text, starting at the section's offset).
  let lastSource = "manuscript";
  function captureSelection() {
    const manuscript = manuscriptInput();
    const desk = typeof reviewDeskBodyInput !== "undefined" ? reviewDeskBodyInput : null;
    const full = manuscript?.value || "";
    let section = null;
    if (desk && typeof currentReviewDeskSectionBlock === "function") {
      try { section = currentReviewDeskSectionBlock(full); } catch { section = null; }
    }
    const fromManuscript = selectionIn(manuscript, 0);
    const fromDesk = desk && !desk.classList.contains("is-hidden") ? selectionIn(desk, section?.offset || 0) : null;
    const pick = lastSource === "desk" ? fromDesk || fromManuscript : fromManuscript || fromDesk;
    if (pick) view.pending = pick;
    return view.pending;
  }

  // ---- adding things -------------------------------------------------------

  function anchorForPending() {
    const text = manuscriptText();
    const pending = view.pending;
    if (text === null || !pending) return null;
    let start = pending.start;
    if (text.slice(start, start + pending.quote.length) !== pending.quote) {
      // The text moved under the selection (an edit between selecting and
      // writing): find the same words again, or give up.
      const found = Quote.resolveAnchor(text, { quote: pending.quote, prefix: "", suffix: "", offset: start });
      if (found.status !== "found") return null;
      start = found.start;
    }
    return Quote.createAnchor(text, start, start + pending.quote.length);
  }

  function addComment() {
    const panel = panelEl();
    const input = panel?.querySelector("[data-rc-composer-text]");
    if (!panel || !input) return;
    if (!manuscriptReady()) { setStatus(say("review_comments_needs_manuscript")); return; }
    captureSelection();
    const anchor = anchorForPending();
    if (!anchor) { setStatus(say("review_comments_select_first")); return; }
    const record = Comments.createComment({ kind: view.composerKind, text: input.value, author: author(), anchor });
    if (!record) { setStatus(say("review_comments_write_first")); return; }
    const next = Comments.append(list(), record);
    if (!next || !commit("review_step_comment", next)) return;
    view.current = record.id;
    view.pending = null;
    view.composerText = "";
    input.value = "";
    setStatus(say("review_comments_added"));
    render();
    applyDecorations();
  }

  function addReply(rootId, replyBox) {
    const record = Comments.createReply({ rootId, text: replyBox?.value || "", author: author() });
    if (!record) { setStatus(say("review_comments_write_first")); return; }
    const next = Comments.append(list(), record);
    if (!next || !commit("review_step_reply", next)) return;
    view.replying = "";
    render();
  }

  function addState(rootId, state, replyBox) {
    const record = Comments.createStateReply({ rootId, state, text: replyBox?.value || "", author: author() });
    const next = record ? Comments.append(list(), record) : null;
    if (!next || !commit("review_step_state", next)) return;
    view.replying = "";
    render();
    applyDecorations();
  }

  function toggleTick(rootId) {
    const name = author().name || WRITER_TICK;
    const thread = threads().find((item) => item.id === rootId);
    const checked = !(thread?.ticks || []).includes(name);
    const p = project();
    if (!p) return;
    p.reviewComments = Comments.tick(list(), rootId, name, checked);
    persist(false);
    render();
  }

  async function jumpTo(rootId) {
    const thread = threads().find((item) => item.id === rootId);
    if (!thread) return;
    view.current = rootId;
    if (thread.place.status !== "found") {
      setStatus(say("review_comment_lost_status"));
      render();
      return;
    }
    await openWindow("teachText");
    if (typeof showTeachTextEditor === "function") showTeachTextEditor({ focus: false });
    const input = manuscriptInput();
    if (input) {
      input.focus();
      input.setSelectionRange(thread.place.start, thread.place.end);
      if (typeof scrollTextareaToOffset === "function") scrollTextareaToOffset(input, thread.place.start);
    }
    applyDecorations();
    render();
  }

  // ---- drawing the panel ---------------------------------------------------

  function select(options, value, dataset) {
    const wrap = node("span", "select-wrap select-wrap-inline");
    const control = node("select", "mini-select");
    control.dataset[dataset] = "";
    options.forEach(([optionValue, label]) => {
      const option = node("option", "", label);
      option.value = optionValue;
      control.append(option);
    });
    control.value = value;
    wrap.append(control);
    return wrap;
  }

  function build() {
    const panel = panelEl();
    if (!panel || built) return;
    built = true;
    panel.replaceChildren();

    const head = node("div", "review-comments-head");
    const tabs = node("div", "review-comments-tabs");
    tabs.setAttribute("role", "tablist");
    [["comments", "review_comments"], ["compare", "review_compare"]].forEach(([id, key]) => {
      const tab = button(say(key), "tab", "btn mini-btn review-comments-tab");
      tab.dataset.rcTab = id;
      tab.setAttribute("role", "tab");
      tabs.append(tab);
    });
    const asLabel = node("label", "review-comments-as");
    const asText = node("span", "", say("review_comments_writing_as"));
    const name = node("input");
    name.type = "text";
    name.dataset.rcName = "";
    name.maxLength = 80;
    name.placeholder = say("review_comments_name_placeholder");
    name.value = readName();
    asLabel.append(asText, name);
    head.append(tabs, asLabel);

    const commentsBody = node("div", "review-comments-body");
    commentsBody.dataset.rcBody = "comments";

    const tools = node("div", "review-comments-tools");
    const search = node("input");
    search.type = "search";
    search.dataset.rcSearch = "";
    search.placeholder = say("review_comments_search");
    search.setAttribute("aria-label", say("review_comments_search"));
    tools.append(
      search,
      select([["all", say("review_state_all")], ...Object.entries(STATE_KEYS).map(([id, key]) => [id, say(key)])], "all", "rcState"),
      select([["all", say("review_kind_all")], ...Object.entries(KIND_KEYS).map(([id, key]) => [id, say(key)])], "all", "rcKind"),
    );
    const counts = node("p", "review-comments-counts");
    counts.dataset.rcCounts = "";
    counts.setAttribute("aria-live", "polite");

    const composer = node("form", "review-comment-composer");
    composer.dataset.rcComposer = "";
    const quote = node("blockquote", "review-comment-quote is-empty", say("review_comments_select_hint"));
    quote.dataset.rcQuote = "";
    const row = node("div", "review-comment-composer-row");
    row.append(
      select(Object.entries(KIND_KEYS).map(([id, key]) => [id, say(key)]), "note", "rcComposerKind"),
      button(say("review_comments_use_selection"), "use-selection"),
    );
    const text = node("textarea");
    text.rows = 2;
    text.dataset.rcComposerText = "";
    text.placeholder = say("review_comments_composer_placeholder");
    text.setAttribute("aria-label", say("review_comments_composer_placeholder"));
    const add = button(say("review_comments_add"), "add", "btn mini-btn default");
    composer.append(quote, row, text, add);

    const items = node("ol", "review-thread-list");
    items.dataset.rcList = "";
    commentsBody.append(tools, counts, composer, items);

    const compareBody = node("div", "review-comments-body is-hidden");
    compareBody.dataset.rcBody = "compare";
    compareBody.append(node("div", "review-compare"));

    panel.append(head, commentsBody, compareBody);
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    wire(panel);
  }

  function wire(panel) {
    panel.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const trigger = target?.closest("[data-rc-action]");
      if (!trigger || !panel.contains(trigger)) return;
      const card = trigger.closest("[data-thread]");
      const rootId = card?.dataset.thread || "";
      const replyBox = card?.querySelector("[data-rc-reply-text]");
      switch (trigger.dataset.rcAction) {
        case "tab": show(trigger.dataset.rcTab); break;
        case "use-selection": {
          captureSelection();
          renderComposerQuote();
          if (!view.pending) setStatus(say("review_comments_select_first"));
          break;
        }
        case "add": addComment(); break;
        case "jump": jumpTo(rootId); break;
        case "reply": view.replying = view.replying === rootId ? "" : rootId; renderList(); card && panel.querySelector(`[data-thread="${CSS.escape(rootId)}"] [data-rc-reply-text]`)?.focus(); break;
        case "send": addReply(rootId, replyBox); break;
        case "accepted":
        case "rejected":
        case "completed":
        case "open": addState(rootId, trigger.dataset.rcAction, replyBox); break;
        case "tick": toggleTick(rootId); break;
        case "prev-hunk": stepHunk(-1); break;
        case "next-hunk": stepHunk(1); break;
        default: break;
      }
    });
    panel.addEventListener("input", (event) => {
      const target = event.target;
      if (target.matches("[data-rc-search]")) { view.query = target.value; renderList(); }
      else if (target.matches("[data-rc-composer-text]")) view.composerText = target.value;
    });
    panel.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-rc-state]")) { view.state = target.value; renderList(); }
      else if (target.matches("[data-rc-kind]")) { view.kind = target.value; renderList(); }
      else if (target.matches("[data-rc-composer-kind]")) view.composerKind = target.value;
      else if (target.matches("[data-rc-from]")) { view.from = target.value; computeDiff(); }
      else if (target.matches("[data-rc-to]")) { view.to = target.value; computeDiff(); }
      else if (target.matches("[data-rc-hunk-kind]")) { view.hunkKind = target.value; view.hunk = 0; renderDiff(); }
      else if (target.matches("[data-rc-name]")) rememberName(target.value.trim());
    });
    panel.addEventListener("keydown", (event) => {
      // Enter in a note sends a state; ⌘/Ctrl-Enter sends the words.
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && event.target.matches("[data-rc-composer-text]")) {
        event.preventDefault();
        addComment();
      }
    });
  }

  function renderComposerQuote() {
    const quote = panelEl()?.querySelector("[data-rc-quote]");
    if (!quote) return;
    const pending = view.pending;
    quote.classList.toggle("is-empty", !pending);
    quote.textContent = pending ? shorten(pending.quote, 240) : say("review_comments_select_hint");
  }

  function dateLabel(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function recordLine(record, labelText) {
    const line = node("p", "review-thread-meta");
    line.append(node("strong", "", authorLabel(record.author)));
    if (labelText) line.append(node("span", "review-thread-label", labelText));
    line.append(node("time", "", dateLabel(record.createdAt)));
    return line;
  }

  function threadCard(thread) {
    const card = node("li", "review-thread");
    card.dataset.thread = thread.id;
    card.dataset.state = thread.state;
    card.dataset.kind = thread.root.kind;
    card.classList.toggle("is-lost", thread.lost);
    card.classList.toggle("is-current", thread.id === view.current);

    const head = recordLine(thread.root, say(KIND_KEYS[thread.root.kind] || KIND_KEYS.note));
    head.append(node("span", `review-thread-state is-${thread.state}`, say(STATE_KEYS[thread.state])));
    if (thread.lost) head.append(node("span", "review-thread-lostmark", say("review_comment_lost")));
    card.append(head);

    const quote = node("blockquote", "review-thread-quote", thread.root.anchor.quote);
    if (thread.lost) quote.title = say("review_comment_lost_note");
    card.append(quote);
    if (thread.lost) card.append(node("p", "review-thread-lostnote", say("review_comment_lost_note")));
    card.append(node("p", "review-thread-text", thread.root.text));

    if (thread.replies.length || thread.states.length) {
      const replies = node("ol", "review-thread-replies");
      const entries = [...thread.replies, ...thread.states].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      entries.forEach((entry) => {
        const item = node("li", `review-thread-reply${entry.type === "state" ? " is-state" : ""}`);
        item.append(recordLine(entry, entry.type === "state" ? say(STATE_KEYS[entry.state === "open" ? "open" : entry.state]) : ""));
        if (entry.text) item.append(node("p", "review-thread-text", entry.text));
        replies.append(item);
      });
      card.append(replies);
    }

    const actions = node("div", "review-thread-actions");
    const jump = button(say("review_comment_jump"), "jump");
    jump.disabled = thread.lost;
    actions.append(jump, button(say("review_comment_reply"), "reply"));
    ["accepted", "rejected", "completed"].forEach((state) => {
      if (thread.state !== state) actions.append(button(say(`review_comment_${state}`), state));
    });
    if (thread.state !== "open") actions.append(button(say("review_comment_reopen"), "open"));
    const name = author().name || WRITER_TICK;
    const ticked = thread.ticks.includes(name);
    const tickButton = button(say("review_comment_checked"), "tick", `btn mini-btn review-thread-tick${ticked ? " is-on" : ""}`);
    tickButton.setAttribute("aria-pressed", String(ticked));
    tickButton.title = say("review_comment_checked_hint");
    actions.append(tickButton);
    card.append(actions);

    if (view.replying === thread.id) {
      const box = node("div", "review-thread-replybox");
      const text = node("textarea");
      text.rows = 2;
      text.dataset.rcReplyText = "";
      text.placeholder = say("review_comment_reply_placeholder");
      text.setAttribute("aria-label", say("review_comment_reply_placeholder"));
      box.append(text, button(say("review_comment_send"), "send", "btn mini-btn default"));
      card.append(box);
    }
    return card;
  }

  function renderList() {
    const panel = panelEl();
    const items = panel?.querySelector("[data-rc-list]");
    if (!panel || !items) return;
    const all = threads();
    const shown = Comments.filterThreads(all, { query: view.query, state: view.state, kind: view.kind });
    const counts = Comments.countThreads(all);
    const summary = panel.querySelector("[data-rc-counts]");
    if (summary) {
      summary.textContent = all.length
        ? say("review_comments_counts", counts.total, counts.open, counts.accepted, counts.rejected, counts.completed)
          + (counts.lost ? ` · ${say("review_comments_lost_count", counts.lost)}` : "")
        : "";
    }
    const reply = items.querySelector("[data-rc-reply-text]");
    const keep = reply ? { id: reply.closest("[data-thread]")?.dataset.thread, value: reply.value } : null;
    items.replaceChildren();
    if (!shown.length) {
      items.append(node("li", "empty-folder-note", say(all.length ? "review_comments_no_match" : "review_comments_empty")));
      return;
    }
    shown.forEach((thread) => items.append(threadCard(thread)));
    if (keep?.id) {
      const restored = items.querySelector(`[data-thread="${CSS.escape(keep.id)}"] [data-rc-reply-text]`);
      if (restored) restored.value = keep.value;
    }
  }

  // ---- compare two versions -------------------------------------------------

  function versionLabel(revision) {
    return `${dateLabel(revision.createdAt)} · ${revision.operation || revision.origin || ""}`;
  }

  async function loadRevisions() {
    const api = window.AISystem6DocumentRevisions;
    let found = [];
    try { found = api ? await api.list() : []; } catch { found = []; }
    view.revisions = found.slice(0, 40);
    if (!view.from || (view.from !== "current" && !view.revisions.some((item) => item.id === view.from))) {
      view.from = view.revisions[0]?.id || "current";
    }
  }

  function textOf(id) {
    if (id === "current") return manuscriptText() ?? "";
    return view.revisions.find((item) => item.id === id)?.body ?? "";
  }

  function computeDiff() {
    const before = textOf(view.from);
    const after = textOf(view.to);
    const api = window.AISystem6WordDiff;
    if (!api || view.from === view.to) {
      view.diff = { before, after, hunks: [], coarse: false, summary: null, same: view.from === view.to };
    } else {
      const result = api.wordDiff(before, after);
      view.diff = { before, after, hunks: result.hunks, coarse: result.coarse, summary: api.wordDiffSummary(before, after, result.hunks), same: false };
    }
    view.hunk = 0;
    renderDiff();
  }

  function visibleHunks() {
    const hunks = view.diff?.hunks || [];
    return hunks.map((hunk, index) => ({ hunk, index })).filter(({ hunk }) => view.hunkKind === "all" || hunk.kind === view.hunkKind);
  }

  function stepHunk(direction) {
    const shown = visibleHunks();
    if (!shown.length) return;
    view.hunk = (view.hunk + direction + shown.length) % shown.length;
    renderDiff({ scroll: true });
  }

  function renderCompare() {
    const host = panelEl()?.querySelector(".review-compare");
    if (!host) return;
    host.replaceChildren();
    if (!view.revisions.length && manuscriptText() === null) {
      host.append(node("p", "empty-folder-note", say("review_compare_none")));
      return;
    }
    const choices = [["current", say("review_compare_current")], ...view.revisions.map((revision) => [revision.id, versionLabel(revision)])];
    const row = node("div", "review-compare-pick");
    const fromLabel = node("label", "", say("review_compare_from"));
    fromLabel.append(select(choices, view.from, "rcFrom"));
    const toLabel = node("label", "", say("review_compare_to"));
    toLabel.append(select(choices, view.to, "rcTo"));
    row.append(fromLabel, toLabel);

    const nav = node("div", "review-compare-nav");
    nav.append(
      button(say("review_compare_prev"), "prev-hunk"),
      node("span", "review-compare-position"),
      button(say("review_compare_next"), "next-hunk"),
      select([["all", say("review_compare_kind_all")], ["insert", say("review_compare_kind_insert")], ["delete", say("review_compare_kind_delete")], ["replace", say("review_compare_kind_replace")]], view.hunkKind, "rcHunkKind"),
    );
    const summary = node("p", "review-compare-summary");
    summary.dataset.rcSummary = "";
    summary.setAttribute("aria-live", "polite");
    const body = node("div", "review-compare-view");
    body.dataset.rcDiff = "";
    host.append(row, summary, nav, body);
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    renderDiff();
  }

  function renderDiff({ scroll = false } = {}) {
    const panel = panelEl();
    const body = panel?.querySelector("[data-rc-diff]");
    const summary = panel?.querySelector("[data-rc-summary]");
    const position = panel?.querySelector(".review-compare-position");
    const diff = view.diff;
    if (!body || !summary) return;
    body.replaceChildren();
    if (!diff) { summary.textContent = ""; return; }
    if (diff.same) { summary.textContent = say("review_compare_pick_two"); return; }
    if (!diff.hunks.length) { summary.textContent = say("review_compare_identical"); return; }
    const total = diff.summary;
    summary.textContent = say("review_compare_summary", diff.hunks.length, total.insert, total.delete, total.replace, total.added, total.removed)
      + (diff.coarse ? ` · ${say("review_compare_coarse")}` : "");

    const shown = visibleHunks();
    if (view.hunk >= shown.length) view.hunk = 0;
    const currentIndex = shown[view.hunk]?.index ?? -1;
    if (position) position.textContent = shown.length ? say("review_compare_position", view.hunk + 1, shown.length) : say("review_compare_none_of_kind");

    // The text as one reading: unchanged stretches as they are (a long one
    // folded to its edges), each change as the words that went and the words
    // that came, in order.
    const fold = (text) => (text.length > 360 ? `${text.slice(0, 150)}\n…\n${text.slice(-150)}` : text);
    let cursor = 0;
    let marked = null;
    diff.hunks.forEach((hunk, index) => {
      if (hunk.after.start > cursor) body.append(node("span", "review-diff-same", fold(diff.after.slice(cursor, hunk.after.start))));
      const group = node("span", `review-diff-hunk is-${hunk.kind}`);
      group.dataset.hunk = String(index);
      if (index === currentIndex) { group.classList.add("is-current"); marked = group; }
      if (hunk.before.end > hunk.before.start) group.append(node("del", "review-diff-del", diff.before.slice(hunk.before.start, hunk.before.end)));
      if (hunk.after.end > hunk.after.start) group.append(node("ins", "review-diff-ins", diff.after.slice(hunk.after.start, hunk.after.end)));
      body.append(group);
      cursor = hunk.after.end;
    });
    if (cursor < diff.after.length) body.append(node("span", "review-diff-same", fold(diff.after.slice(cursor))));
    if (scroll && marked) body.scrollTop = Math.max(0, marked.offsetTop - body.clientHeight * 0.3);
  }

  // ---- showing it ------------------------------------------------------------

  function render() {
    build();
    const panel = panelEl();
    if (!panel) return;
    panel.querySelectorAll("[data-rc-tab]").forEach((tab) => {
      const on = tab.dataset.rcTab === view.tab;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    panel.querySelectorAll("[data-rc-body]").forEach((body) => body.classList.toggle("is-hidden", body.dataset.rcBody !== view.tab));
    if (view.tab === "comments") {
      followEdits();
      renderComposerQuote();
      renderList();
    }
  }

  async function show(tab = "comments") {
    view.tab = tab === "compare" ? "compare" : "comments";
    build();
    render();
    if (view.tab === "compare") {
      await loadRevisions();
      renderCompare();
      computeDiff();
    } else {
      renderComposerQuote();
      applyDecorations();
    }
  }

  // ---- wiring to the rest of the desk ----------------------------------------

  function watchManuscript() {
    const input = manuscriptInput();
    if (!input || input.dataset.reviewCommentsWatch) return;
    input.dataset.reviewCommentsWatch = "true";
    input.addEventListener("input", scheduleFollow);
    // A different document replaces the editor's state, which drops the marks;
    // a freshly mounted editor has none yet.
    input.addEventListener("writing-editor-reset", () => { scheduleFollow(); });
    input.addEventListener("writing-editor-mounted", applyDecorations);
    // Only the writer's own gestures name a passage: a selection the app
    // makes (opening the desk, jumping to a comment) must not become the
    // quote of the next comment.
    for (const type of ["keyup", "pointerup"]) {
      input.addEventListener(type, () => { lastSource = "manuscript"; if (isShown()) { captureSelection(); renderComposerQuote(); } });
    }
    // A click on a marked passage makes its thread the one being read.
    input.closest(".mde-surface")?.addEventListener("click", (event) => {
      const mark = event.target instanceof Element ? event.target.closest("[data-decoration-id]") : null;
      if (!mark) return;
      view.current = mark.getAttribute("data-decoration-id") || "";
      applyDecorations();
      if (isShown()) {
        renderList();
        panelEl()?.querySelector(`[data-thread="${CSS.escape(view.current)}"]`)?.scrollIntoView({ block: "nearest" });
      }
    });
    const desk = typeof reviewDeskBodyInput !== "undefined" ? reviewDeskBodyInput : null;
    if (desk && !desk.dataset.reviewCommentsWatch) {
      desk.dataset.reviewCommentsWatch = "true";
      for (const type of ["keyup", "pointerup"]) {
        desk.addEventListener(type, () => { lastSource = "desk"; if (isShown()) { captureSelection(); renderComposerQuote(); } });
      }
    }
  }

  if (typeof registerEditHistory === "function") registerEditHistory("reviewDesk", () => editHistory());
  watchManuscript();
  applyDecorations();

  window.AISystem6ReviewDeskPanel = Object.freeze({
    show,
    render,
    applyDecorations,
    jumpTo,
    watchManuscript,
    // The contract and the browser check read these.
    state: () => ({ ...view, diff: view.diff ? { hunks: view.diff.hunks.length, coarse: view.diff.coarse, summary: view.diff.summary } : null }),
  });
  window.AISystem6ReviewDeskPanelLoaded = true;
})();
