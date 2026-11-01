// Feature module: Stickies／便利贴 — one object where there were three.
//
// Note Pad's pages, To Do's next actions and Hold That Thought's pile were
// three small accessories doing one job: keep a line you are not ready to put
// anywhere else. Owner ruling 2026-10-31 folds them into one item type, the
// sticky, with a kind — note | action | held — and one window that is home.
//
// What it keeps from GTD: capture to an Inbox in one keystroke, clarify an
// Inbox item into an action or a note with one more, next actions across every
// project, an optional project link, Done, and a Review the writer runs by
// hand. What it keeps from Stickies: it is instant, it has a colour, and any
// one of them can be pinned to the desk, where it stays after a reload.
//
// Storage: deskStickies rides the desk settings (declared eagerly in
// core/held-place.js, saved and restored by core/persistence-status.js), so a
// sticky survives every boot whether or not this window is ever summoned. The
// three old stores are copied in once by mergeLegacyStickies and left
// untouched for one version; the copy is idempotent by id.
//
// The window keeps the internal name "todo" (and its loader ensureTodoDaModule)
// so the admission table, the journey gates and saved working sessions that
// name it keep resolving; only what the writer sees changed.
//
// Contract: tests/features/stickies.test.mjs

const STICKY_KINDS = ["note", "action", "held"];
const STICKY_COLOURS = ["yellow", "blue", "green", "pink", "purple", "grey"];
const STICKY_VIEWS = ["inbox", "next", "notes", "held", "done", "review"];
// An open action nobody has touched for this long comes up in Review.
const STICKY_STALE_MS = 7 * 864e5;

function normalizeSticky(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = STICKY_KINDS.includes(raw.kind) ? raw.kind : "note";
  const pin = raw.pin && Number.isFinite(raw.pin.x) && Number.isFinite(raw.pin.y)
    ? { x: raw.pin.x, y: raw.pin.y, collapsed: raw.pin.collapsed === true }
    : null;
  return {
    id: String(raw.id || `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`),
    kind,
    inbox: raw.inbox === true,
    // Never trimmed: a page that was saved with a trailing newline keeps it.
    text: String(raw.text ?? ""),
    done: raw.done === true,
    doneAt: String(raw.doneAt || ""),
    colour: STICKY_COLOURS.includes(raw.colour) ? raw.colour : "yellow",
    projectId: String(raw.projectId || ""),
    projectName: String(raw.projectName || ""),
    createdAt: String(raw.createdAt || ""),
    updatedAt: String(raw.updatedAt || raw.createdAt || ""),
    pin,
    held: kind === "held" && raw.held && typeof raw.held === "object" ? { ...raw.held } : null,
    from: String(raw.from || ""),
  };
}

// ---- Migration ---------------------------------------------------------------
//
// Pure: the three old shapes in, stickies out, with ids derived from the
// source so a second run recognises what the first one wrote. Nothing is
// trimmed, every done state and timestamp is carried, and an empty Note Pad
// page (the pad's blank first slip) is the only thing left behind.
function stickiesFromLegacy({ pages = [], todos = [], held = [], now = "" } = {}) {
  const out = [];
  (Array.isArray(pages) ? pages : []).forEach((page, index) => {
    const text = typeof page === "string" ? page : String(page?.text ?? "");
    if (!text.trim()) return;
    out.push({ id: `notepad-${index}`, kind: "note", text, createdAt: now, updatedAt: now, from: "notePad" });
  });
  (Array.isArray(todos) ? todos : []).forEach((item, index) => {
    if (!item || !String(item.text ?? "").trim()) return;
    out.push({
      id: `todo-${item.id || index}`,
      kind: "action",
      text: String(item.text),
      done: item.done === true,
      doneAt: String(item.doneAt || ""),
      createdAt: String(item.createdAt || ""),
      updatedAt: String(item.doneAt || item.createdAt || ""),
      projectId: String(item.projectId || ""),
      projectName: String(item.projectName || ""),
      from: "todo",
    });
  });
  (Array.isArray(held) ? held : []).forEach((record, index) => {
    const where = String(record?.where || record?.windowName || "");
    if (!where) return;
    const at = Number.isFinite(record.at) ? record.at : 0;
    const stamp = at ? new Date(at).toISOString() : "";
    out.push({
      id: `held-${record.id || index}`,
      kind: "held",
      text: String(record.doing ?? record.note ?? ""),
      createdAt: stamp,
      updatedAt: stamp,
      from: "held",
      held: {
        where,
        title: String(record.title || ""),
        fieldId: String(record.fieldId || ""),
        start: Number.isFinite(record.start) ? record.start : 0,
        end: Number.isFinite(record.end) ? record.end : 0,
        sentence: String(record.sentence || ""),
        routeStop: String(record.routeStop || ""),
        reading: String(record.reading || ""),
        clipboard: String(record.clipboard || ""),
        handoff: record.handoff || "",
        next: String(record.next || ""),
        at,
      },
    });
  });
  return out.map(normalizeSticky);
}

function mergeLegacyStickies(existing, legacy) {
  const have = new Set((existing || []).map((sticky) => sticky.id));
  return [...(existing || []), ...legacy.filter((sticky) => !have.has(sticky.id))];
}

// Runs once per desk, after the desk has really loaded: a migration that ran
// against an empty, not-yet-restored desk would mark itself done and carry
// nothing.
function migrateLegacyStickies() {
  if (stickiesMigrated || typeof deskPersistenceWritable === "undefined" || !deskPersistenceWritable) return 0;
  const before = deskStickies.length;
  deskStickies = mergeLegacyStickies(deskStickies.map(normalizeSticky).filter(Boolean), stickiesFromLegacy({
    pages: typeof notePadPages === "undefined" ? [] : notePadPages,
    todos: typeof todoDaItems === "undefined" ? [] : todoDaItems,
    held: typeof readHeldThoughts === "function" ? readHeldThoughts() : [],
    now: new Date().toISOString(),
  }));
  stickiesMigrated = true;
  saveDeskState();
  return deskStickies.length - before;
}

// ---- Views -------------------------------------------------------------------
function stickyIsStale(sticky, now = Date.now()) {
  const touched = Date.parse(sticky.updatedAt || sticky.createdAt || "");
  return Number.isFinite(touched) && now - touched >= STICKY_STALE_MS;
}

function stickiesInView(view, list = deskStickies, now = Date.now()) {
  const open = list.filter((sticky) => !sticky.done);
  if (view === "inbox") return open.filter((sticky) => sticky.inbox);
  if (view === "next") return open.filter((sticky) => !sticky.inbox && sticky.kind === "action");
  if (view === "notes") return open.filter((sticky) => !sticky.inbox && sticky.kind === "note");
  if (view === "held") return open.filter((sticky) => sticky.kind === "held")
    .sort((a, b) => (b.held?.at || 0) - (a.held?.at || 0));
  if (view === "done") return list.filter((sticky) => sticky.done)
    .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  if (view === "review") return open.filter((sticky) => sticky.inbox
    || (sticky.kind === "action" && stickyIsStale(sticky, now)));
  return [];
}

function touchSticky(sticky) {
  sticky.updatedAt = new Date().toISOString();
}

function findSticky(id) {
  return deskStickies.find((sticky) => sticky.id === id) || null;
}

// A clarified sticky leaves the Inbox and takes the kind the writer chose.
function clarifySticky(sticky, kind) {
  if (!sticky || !["action", "note"].includes(kind)) return false;
  sticky.inbox = false;
  sticky.kind = kind;
  touchSticky(sticky);
  return true;
}

// Never under the menu bar, never off the right or bottom edge: a sticky you
// cannot reach is a sticky you lost.
function clampStickyPosition(x, y, size, viewport) {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(viewport.top, viewport.height - 24);
  return {
    x: Math.round(Math.min(Math.max(0, x), maxX)),
    y: Math.round(Math.min(Math.max(viewport.top, y), maxY)),
  };
}

// ---- The window ------------------------------------------------------------
let stickiesView = "inbox";
let selectedStickyId = "";
let stickiesParts = null;
let stickiesSaveTimer = 0;
let lastDeletedSticky = null;

function scheduleStickiesSave() {
  clearTimeout(stickiesSaveTimer);
  stickiesSaveTimer = setTimeout(() => saveDeskState(), 400);
}

function buildStickiesWindow() {
  if (!window.AISystem6ApplicationShell) return null;
  const tabs = STICKY_VIEWS.map((view) => `<button class="stickies-view" type="button" role="tab" aria-selected="false" tabindex="-1" data-stickies-view="${view}"></button>`).join("");
  const swatches = STICKY_COLOURS.map((colour) => `<button class="sticky-swatch" type="button" data-sticky-colour="${colour}" data-i18n-aria-label="sticky_colour_${colour}" aria-label="${colour}"></button>`).join("");
  const win = window.AISystem6ApplicationShell.createWindow({
    windowName: "todo",
    windowClass: "stickies-window",
    labelledBy: "stickies-title",
    titleKey: "stickies",
    title: "Stickies",
    resizable: false,
    shade: false,
    statusClass: "compact-status-bar",
    statusHtml: `
      <span class="status-bar-leading" id="stickies-count"></span>
      <span class="status-bar-trailing" id="stickies-scope" data-i18n="todo_da_scope">Every project</span>`,
    beforePaneHtml: `<div class="stickies-views" role="tablist" data-i18n-aria-label="stickies_views" aria-label="Stickies views">${tabs}</div>`,
    paneClass: "stickies-pane",
    paneHtml: `
      <div class="stickies-add">
        <label class="visually-hidden" for="stickies-input" data-i18n="stickies_add_placeholder">Capture a line, press Return</label>
        <input id="stickies-input" type="text" maxlength="500" autocomplete="off" data-dictation="off" data-i18n-placeholder="stickies_add_placeholder" placeholder="Capture a line, press Return" />
        <button class="btn" type="button" data-action="stickies-add" data-i18n="todo_da_add">Add</button>
      </div>
      <ul class="stickies-list" id="stickies-list" role="listbox" data-i18n-aria-label="stickies" aria-label="Stickies"></ul>
      <p class="hint stickies-empty" id="stickies-empty"></p>
      <div class="stickies-detail" id="stickies-detail" hidden>
        <dl class="stickies-context" id="stickies-context" hidden></dl>
        <label class="visually-hidden" for="stickies-text" data-i18n="stickies_text">Sticky text</label>
        <textarea id="stickies-text" rows="4" data-dictation="off"></textarea>
        <label class="visually-hidden" for="stickies-next" data-i18n="held_thought_next">First thing back?</label>
        <input id="stickies-next" type="text" maxlength="240" autocomplete="off" data-dictation="off" data-i18n-placeholder="held_thought_next" placeholder="First thing back?" hidden />
        <div class="stickies-tools" id="stickies-clarify">
          <button class="btn mini-btn" type="button" id="stickies-make-action" data-action="stickies-make-action" data-i18n="stickies_make_action">Make Action</button>
          <button class="btn mini-btn" type="button" id="stickies-make-note" data-action="stickies-make-note" data-i18n="stickies_make_note">Make Note</button>
        </div>
        <div class="stickies-tools">
          <span class="stickies-swatches" role="group" data-i18n-aria-label="sticky_colour" aria-label="Colour">${swatches}</span>
          <span class="spacer"></span>
          <button class="btn mini-btn" type="button" id="stickies-pin" data-action="stickies-pin" data-i18n="stickies_pin">Pin to Desk</button>
        </div>
        <div class="button-row stickies-actions">
          <button class="btn" type="button" id="stickies-delete" data-action="stickies-delete" data-i18n="delete">Delete</button>
          <span class="spacer"></span>
          <button class="btn" type="button" id="stickies-back" data-action="stickies-back" hidden>Back</button>
          <button class="btn default" type="button" id="stickies-done" data-action="stickies-done" data-i18n="stickies_mark_done">Mark Done</button>
        </div>
      </div>`,
  });
  if (typeof applyLanguage === "function") applyLanguage();
  return win;
}

function stickiesFields() {
  if (stickiesParts?.root.isConnected) return stickiesParts;
  const root = document.querySelector('[data-window="todo"]') || buildStickiesWindow();
  if (!root) return null;
  const part = (id) => root.querySelector(`#stickies-${id}`);
  stickiesParts = {
    root,
    tabs: root.querySelectorAll("[data-stickies-view]"),
    count: part("count"),
    input: part("input"),
    list: part("list"),
    empty: part("empty"),
    detail: part("detail"),
    context: part("context"),
    text: part("text"),
    next: part("next"),
    clarify: part("clarify"),
    makeAction: part("make-action"),
    makeNote: part("make-note"),
    remove: part("delete"),
    pin: part("pin"),
    back: part("back"),
    done: part("done"),
    swatches: root.querySelectorAll("[data-sticky-colour]"),
  };
  return stickiesParts;
}

function stickyTitle(sticky) {
  const line = String(sticky?.text || "").split("\n").find((part) => part.trim()) || "";
  if (line.trim()) return line.trim();
  if (sticky?.kind === "held" && typeof heldThoughtWhere === "function") return heldThoughtWhere(sticky);
  return t("stickies_untitled");
}

function selectedSticky() {
  const shown = stickiesInView(stickiesView);
  return shown.find((sticky) => sticky.id === selectedStickyId) || shown[0] || null;
}

function stickyMeta(sticky, now = Date.now()) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (stickiesView === "review") {
    return sticky.inbox
      ? t("stickies_review_unclarified")
      : t("stickies_review_stale", Math.floor((now - Date.parse(sticky.updatedAt || sticky.createdAt)) / 864e5));
  }
  if (sticky.kind === "held" && typeof heldThoughtAgo === "function") return heldThoughtAgo(sticky);
  if (sticky.projectName && sticky.projectId !== (project?.id || "")) return sticky.projectName;
  return "";
}

function renderStickiesContext(sticky) {
  const parts = stickiesFields();
  const held = sticky?.kind === "held" ? sticky.held : null;
  const rows = held ? [
    [t("held_thought_where"), heldThoughtWhere(sticky)],
    [t("held_thought_sentence"), held.sentence || ""],
    [t("held_thought_reading"), held.reading || ""],
    [t("held_thought_clipboard"), held.clipboard || ""],
    [t("held_thought_handoff"), String(held.handoff || "")],
  ].filter(([, value]) => !!value) : [];
  parts.context.replaceChildren();
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    parts.context.append(term, detail);
  });
  parts.context.hidden = !rows.length;
}

function renderStickies() {
  const parts = stickiesFields();
  if (!parts) return;
  // Journey nag gate: a list, not a win-count board; a held thought leaves on Esc.
  window.AISystem6JourneyGates?.markShellWindow?.(parts.root, "todo");
  parts.root.setAttribute("data-accept-hold", "1");
  const now = Date.now();
  parts.tabs.forEach((tab) => {
    const view = tab.dataset.stickiesView;
    const current = view === stickiesView;
    // Counts only where a number asks for attention; six counted tabs do not fit a DA.
    const count = ["inbox", "held", "review"].includes(view) ? stickiesInView(view, deskStickies, now).length : 0;
    tab.textContent = count ? `${t(`stickies_view_${view}`)} ${count}` : t(`stickies_view_${view}`);
    tab.classList.toggle("is-active", current);
    tab.setAttribute("aria-selected", current ? "true" : "false");
    tab.tabIndex = current ? 0 : -1;
  });

  const shown = stickiesInView(stickiesView, deskStickies, now);
  const sticky = selectedSticky();
  selectedStickyId = sticky?.id || "";
  const floating = stickiesFloat();
  parts.list.replaceChildren();
  shown.forEach((item) => {
    const row = document.createElement("li");
    row.className = `stickies-row${item.id === selectedStickyId ? " is-current" : ""}${item.done ? " is-done" : ""}`;
    row.dataset.stickyId = item.id;
    row.dataset.colour = item.colour;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", item.id === selectedStickyId ? "true" : "false");
    row.tabIndex = item.id === selectedStickyId ? 0 : -1;
    if (item.kind === "action" && !item.inbox) {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = item.done;
      check.dataset.stickyToggle = item.id;
      check.setAttribute("aria-label", stickyTitle(item));
      row.append(check);
    } else {
      const chip = document.createElement("span");
      chip.className = "stickies-chip";
      chip.setAttribute("aria-hidden", "true");
      row.append(chip);
    }
    const text = document.createElement("span");
    text.className = "stickies-row-text";
    text.textContent = stickyTitle(item);
    row.append(text);
    const meta = [stickyMeta(item, now), item.pin ? t(floating ? "stickies_pinned" : "stickies_pinned_here") : ""].filter(Boolean).join(" · ");
    if (meta) {
      const small = document.createElement("small");
      small.textContent = meta;
      row.append(small);
    }
    parts.list.append(row);
  });
  parts.list.hidden = !shown.length;
  parts.empty.hidden = !!shown.length;
  parts.empty.textContent = t(`stickies_empty_${stickiesView}`);
  parts.count.textContent = t("stickies_count", stickiesInView("inbox", deskStickies, now).length, stickiesInView("next", deskStickies, now).length);

  parts.detail.hidden = !sticky;
  if (!sticky) return;
  renderStickiesContext(sticky);
  if (document.activeElement !== parts.text) parts.text.value = sticky.text;
  parts.text.placeholder = sticky.kind === "held" ? t("held_thought_doing") : t("stickies_text");
  parts.next.hidden = sticky.kind !== "held";
  if (sticky.kind === "held" && document.activeElement !== parts.next) parts.next.value = sticky.held?.next || "";
  const clarifiable = !sticky.done && sticky.kind !== "held";
  parts.makeAction.hidden = !clarifiable || (!sticky.inbox && sticky.kind === "action");
  parts.makeNote.hidden = !clarifiable || (!sticky.inbox && sticky.kind === "note");
  parts.clarify.hidden = parts.makeAction.hidden && parts.makeNote.hidden;
  parts.swatches.forEach((swatch) => {
    const current = swatch.dataset.stickyColour === sticky.colour;
    swatch.classList.toggle("is-current", current);
    swatch.setAttribute("aria-pressed", current ? "true" : "false");
  });
  parts.pin.textContent = t(sticky.pin ? "stickies_unpin" : "stickies_pin");
  parts.pin.hidden = sticky.done;
  const canGoBack = sticky.kind === "held" && !!sticky.held;
  parts.back.hidden = !canGoBack;
  if (canGoBack) parts.back.textContent = t("held_place_resume_at", heldThoughtWhere(sticky));
  parts.done.textContent = t(sticky.done ? "stickies_undone" : "stickies_mark_done");
  parts.back.classList.toggle("default", canGoBack);
  parts.done.classList.toggle("default", !canGoBack);
}

async function openStickies(view = stickiesView, id = "", focusText = false) {
  if (STICKY_VIEWS.includes(view)) stickiesView = view;
  if (id) selectedStickyId = id;
  migrateLegacyStickies();
  await openWindow("todo");
  attachStickies();
  const parts = stickiesFields();
  if (focusText && parts?.text && !parts.detail.hidden) {
    parts.text.focus();
  } else {
    parts?.input?.focus();
  }
}

function setStickiesView(view) {
  if (!STICKY_VIEWS.includes(view)) return;
  stickiesView = view;
  selectedStickyId = "";
  renderStickies();
}

function selectSticky(id) {
  selectedStickyId = String(id || "");
  renderStickies();
}

function stickiesChanged(sticky) {
  if (sticky) touchSticky(sticky);
  saveDeskState();
  renderStickies();
  renderDeskStickies();
  if (typeof updateMenuState === "function") updateMenuState();
  window.AISystem6ControlStrip?.refreshStrip?.("heldPlace");
}

function addStickyFromInput() {
  const parts = stickiesFields();
  if (!parts) return;
  const text = parts.input.value;
  if (!text.trim()) return setStatus(t("stickies_add_empty"));
  addSticky({ text, inbox: true });
  parts.input.value = "";
  parts.input.focus();
}

// The one way in that is not a migration. Quick add lands in the Inbox; a
// line sent from elsewhere on the desk (dictation, a selection, About) is
// already a note and says so.
function addSticky({ text = "", kind = "note", inbox = false } = {}) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const mounted = project && (typeof isProjectMounted === "undefined" || isProjectMounted);
  const now = new Date().toISOString();
  const sticky = normalizeSticky({
    kind,
    inbox,
    text,
    createdAt: now,
    updatedAt: now,
    projectId: mounted ? project.id : "",
    projectName: mounted ? projectDisplayName(project) : "",
  });
  deskStickies.push(sticky);
  if (!inbox) selectedStickyId = sticky.id;
  stickiesChanged(null);
  setStatus(t(inbox ? "stickies_added_inbox" : "stickies_added_note"));
  return sticky;
}

function clarifySelectedSticky(kind) {
  const sticky = selectedSticky();
  if (!clarifySticky(sticky, kind)) return;
  // The Inbox's next item takes the selection, so a run of A/N presses
  // clears the Inbox without touching the mouse.
  if (stickiesView !== "review") selectedStickyId = "";
  stickiesChanged(null);
  setStatus(t(kind === "action" ? "stickies_clarified_action" : "stickies_clarified_note"));
}

function toggleStickyDone(sticky, done = !sticky?.done) {
  if (!sticky) return;
  sticky.done = done === true;
  sticky.doneAt = sticky.done ? new Date().toISOString() : "";
  if (sticky.done && sticky.pin) sticky.pin = null;
  stickiesChanged(sticky);
}

// Delete goes through the Trash like every other object on this desk, so it
// can be pulled back out — and ⌘Z right after puts it back without a trip
// there (actions.js asks undoStickyDelete() first).
function deleteSelectedSticky() {
  const sticky = selectedSticky();
  if (!sticky) return;
  const index = deskStickies.indexOf(sticky);
  if (index === -1) return;
  const record = {
    projectId: activeProjectId,
    title: stickyTitle(sticky),
    body: sticky.text,
    originalPath: t("stickies"),
    originalType: "sticky",
    originalData: sticky,
  };
  trashItems.unshift(record);
  deskStickies.splice(index, 1);
  lastDeletedSticky = { sticky, record, index };
  selectedStickyId = "";
  stickiesChanged(null);
  setStatus(t("stickies_deleted"));
}

function undoStickyDelete() {
  const front = document.querySelector('[data-window="todo"].is-active:not(.is-hidden)');
  const typing = document.activeElement?.matches?.("textarea, input[type=text]");
  if (!lastDeletedSticky || !front || typing) return false;
  const { sticky, record, index } = lastDeletedSticky;
  lastDeletedSticky = null;
  const at = trashItems.indexOf(record);
  if (at !== -1) trashItems.splice(at, 1);
  if (!findSticky(sticky.id)) deskStickies.splice(Math.min(index, deskStickies.length), 0, sticky);
  selectedStickyId = sticky.id;
  stickiesChanged(null);
  return true;
}

function setStickyColour(sticky, colour) {
  if (!sticky || !STICKY_COLOURS.includes(colour)) return;
  sticky.colour = colour;
  stickiesChanged(sticky);
}

// ---- Pinned to the desk -------------------------------------------------------
//
// A pinned sticky is the same object, drawn a second time where the writer can
// see it. On a phone there is no room for a floating layer, so a pinned sticky
// stays in the window, marked as pinned, and nothing floats over a 390px page.
function stickiesFloat() {
  return typeof isNarrowViewport === "function" ? !isNarrowViewport() : true;
}

function stickyViewport() {
  const bar = document.querySelector(".menu-bar")?.getBoundingClientRect();
  return { width: window.innerWidth, height: window.innerHeight, top: Math.ceil(bar?.bottom || 0) };
}

function pinSticky(sticky) {
  if (!sticky) return;
  if (sticky.pin) {
    sticky.pin = null;
    stickiesChanged(sticky);
    setStatus(t("stickies_unpinned"));
    return;
  }
  const viewport = stickyViewport();
  const count = deskStickies.filter((item) => item.pin).length;
  sticky.pin = { ...clampStickyPosition(viewport.width - 260 - (count % 6) * 24, viewport.top + 36 + (count % 6) * 24, { width: 200, height: 140 }, viewport), collapsed: false };
  stickiesChanged(sticky);
  setStatus(t(stickiesFloat() ? "stickies_pinned_status" : "stickies_pinned_phone"));
}

function deskStickiesHost() {
  let host = document.getElementById("desk-stickies");
  if (!host) {
    host = document.createElement("div");
    host.id = "desk-stickies";
    host.className = "desk-stickies";
    (document.querySelector(".desktop") || document.body).append(host);
  }
  return host;
}

function buildDeskSticky(sticky) {
  const node = document.createElement("article");
  node.className = "desk-sticky";
  node.dataset.stickyId = sticky.id;
  const swatches = STICKY_COLOURS.map((colour) => `<button class="sticky-swatch" type="button" data-sticky-colour="${colour}" aria-label="${escapeHtml(t(`sticky_colour_${colour}`))}"></button>`).join("");
  node.innerHTML = `
    <div class="desk-sticky-bar">
      <button class="desk-sticky-close" type="button" data-desk-sticky="unpin" aria-label="${escapeHtml(t("stickies_unpin"))}"></button>
      <span class="desk-sticky-title"></span>
      <button class="desk-sticky-collapse" type="button" data-desk-sticky="collapse" aria-label="${escapeHtml(t("stickies_collapse"))}"></button>
    </div>
    <textarea class="desk-sticky-text" data-dictation="off" aria-label="${escapeHtml(t("stickies_text"))}"></textarea>
    <div class="desk-sticky-colours" role="group" aria-label="${escapeHtml(t("sticky_colour"))}">${swatches}</div>`;
  return node;
}

function renderDeskStickies() {
  const host = deskStickiesHost();
  const floating = stickiesFloat();
  const pinned = floating ? deskStickies.filter((sticky) => sticky.pin && !sticky.done) : [];
  host.hidden = !pinned.length;
  const keep = new Set(pinned.map((sticky) => sticky.id));
  host.querySelectorAll(".desk-sticky").forEach((node) => {
    if (!keep.has(node.dataset.stickyId)) node.remove();
  });
  pinned.forEach((sticky) => {
    let node = host.querySelector(`.desk-sticky[data-sticky-id="${CSS.escape(sticky.id)}"]`);
    if (!node) {
      node = buildDeskSticky(sticky);
      host.append(node);
    }
    node.dataset.colour = sticky.colour;
    node.classList.toggle("is-collapsed", sticky.pin.collapsed);
    node.style.setProperty("--sticky-x", `${sticky.pin.x}px`);
    node.style.setProperty("--sticky-y", `${sticky.pin.y}px`);
    node.querySelector(".desk-sticky-title").textContent = stickyTitle(sticky);
    const text = node.querySelector(".desk-sticky-text");
    if (document.activeElement !== text) text.value = sticky.text;
    node.querySelector(".desk-sticky-collapse").setAttribute("aria-expanded", sticky.pin.collapsed ? "false" : "true");
    node.querySelectorAll("[data-sticky-colour]").forEach((swatch) => {
      swatch.classList.toggle("is-current", swatch.dataset.stickyColour === sticky.colour);
    });
  });
}

// 1:1 with the pointer: the grab offset is kept, so the corner you took hold
// of stays under the pointer the whole way.
function startDeskStickyDrag(event, node, bar) {
  const sticky = findSticky(node.dataset.stickyId);
  if (!sticky?.pin || event.button !== 0) return;
  const rect = node.getBoundingClientRect();
  const grabX = event.clientX - rect.left;
  const grabY = event.clientY - rect.top;
  bar.setPointerCapture?.(event.pointerId);
  node.classList.add("is-dragging");
  const move = (moveEvent) => {
    const at = clampStickyPosition(moveEvent.clientX - grabX, moveEvent.clientY - grabY, rect, stickyViewport());
    sticky.pin.x = at.x;
    sticky.pin.y = at.y;
    node.style.setProperty("--sticky-x", `${at.x}px`);
    node.style.setProperty("--sticky-y", `${at.y}px`);
  };
  const end = () => {
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", end);
    bar.removeEventListener("pointercancel", end);
    node.classList.remove("is-dragging");
    saveDeskState();
  };
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  event.preventDefault();
}

let deskStickiesWired = false;
function wireDeskStickies() {
  if (deskStickiesWired) return;
  deskStickiesWired = true;
  const host = deskStickiesHost();
  host.addEventListener("pointerdown", (event) => {
    const bar = event.target.closest(".desk-sticky-bar");
    if (!bar || event.target.closest("button")) return;
    startDeskStickyDrag(event, bar.closest(".desk-sticky"), bar);
  });
  host.addEventListener("click", (event) => {
    const node = event.target.closest(".desk-sticky");
    const sticky = findSticky(node?.dataset.stickyId);
    if (!sticky) return;
    const colour = event.target.closest("[data-sticky-colour]")?.dataset.stickyColour;
    if (colour) return setStickyColour(sticky, colour);
    const verb = event.target.closest("[data-desk-sticky]")?.dataset.deskSticky;
    if (verb === "unpin") return pinSticky(sticky);
    if (verb === "collapse") {
      sticky.pin.collapsed = !sticky.pin.collapsed;
      saveDeskState();
      renderDeskStickies();
    }
  });
  // Double-clicking the bar collapses, the way a Stickies title bar does.
  host.addEventListener("dblclick", (event) => {
    const sticky = findSticky(event.target.closest(".desk-sticky-bar")?.closest(".desk-sticky")?.dataset.stickyId);
    if (!sticky?.pin) return;
    sticky.pin.collapsed = !sticky.pin.collapsed;
    saveDeskState();
    renderDeskStickies();
  });
  host.addEventListener("input", (event) => {
    const field = event.target.closest(".desk-sticky-text");
    const sticky = findSticky(field?.closest(".desk-sticky")?.dataset.stickyId);
    if (!sticky) return;
    sticky.text = field.value;
    touchSticky(sticky);
    field.closest(".desk-sticky").querySelector(".desk-sticky-title").textContent = stickyTitle(sticky);
    scheduleStickiesSave();
    if (stickiesParts?.root.isConnected) renderStickies();
  });
  window.addEventListener("resize", () => renderDeskStickies());
}

// ---- Wiring -------------------------------------------------------------------
let stickiesWired = false;

function attachStickies() {
  const parts = stickiesFields();
  if (!parts) return;
  if (!stickiesWired) {
    stickiesWired = true;
    parts.root.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-stickies-view]");
      if (tab) return setStickiesView(tab.dataset.stickiesView);
      const colour = event.target.closest(".stickies-detail [data-sticky-colour]")?.dataset.stickyColour;
      if (colour) return setStickyColour(selectedSticky(), colour);
      const row = event.target.closest(".stickies-row");
      if (row && !event.target.closest("[data-sticky-toggle]")) selectSticky(row.dataset.stickyId);
    });
    parts.list.addEventListener("change", (event) => {
      const toggle = event.target.closest("[data-sticky-toggle]");
      if (toggle) toggleStickyDone(findSticky(toggle.dataset.stickyToggle), toggle.checked);
    });
    // One key clarifies: A makes an action, N a note. Arrow keys walk the list.
    parts.list.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const sticky = selectedSticky();
      if ((key === "a" || key === "n") && sticky?.inbox) {
        event.preventDefault();
        clarifySelectedSticky(key === "a" ? "action" : "note");
        parts.list.querySelector(".stickies-row.is-current")?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const shown = stickiesInView(stickiesView);
        const at = shown.findIndex((item) => item.id === sticky?.id);
        const next = shown[Math.min(shown.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))];
        if (next) selectSticky(next.id);
        parts.list.querySelector(".stickies-row.is-current")?.focus();
      }
    });
    parts.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || (typeof eventIsTextComposition === "function" && eventIsTextComposition(event))) return;
      event.preventDefault();
      addStickyFromInput();
    });
    parts.text.addEventListener("input", () => {
      const sticky = selectedSticky();
      if (!sticky) return;
      sticky.text = parts.text.value;
      touchSticky(sticky);
      scheduleStickiesSave();
      const row = parts.list.querySelector(`.stickies-row[data-sticky-id="${CSS.escape(sticky.id)}"] .stickies-row-text`);
      if (row) row.textContent = stickyTitle(sticky);
      renderDeskStickies();
    });
    parts.next.addEventListener("input", () => {
      const sticky = selectedSticky();
      if (!sticky?.held) return;
      sticky.held.next = parts.next.value;
      touchSticky(sticky);
      scheduleStickiesSave();
    });
    // Escape leaves at once; whatever was typed is already on the sticky.
    parts.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      clearTimeout(stickiesSaveTimer);
      saveDeskState();
      closeWindow("todo");
    });
  }
  renderStickies();
}

// The way back, and the only way out of a held thought. The window opens and
// the caret returns to the character you left. A window that no longer holds
// that field still opens: being back in the right room is most of the point.
async function resumeMyPlace() {
  const chosen = stickiesParts?.root.isConnected && stickiesView === "held" ? selectedSticky() : null;
  const thought = chosen?.held ? chosen : latestHeldThought();
  const held = thought?.held;
  if (!held) return;
  closeWindow("todo");
  await openWindow(held.where);
  const field = held.fieldId ? document.getElementById(held.fieldId) : null;
  if (!(field instanceof HTMLTextAreaElement)) {
    setStatus(t("held_place_slip_back", heldThoughtWhere(thought), heldThoughtAgo(thought)));
    return;
  }
  const start = Math.min(held.start, field.value.length);
  const end = Math.min(Math.max(held.end, start), field.value.length);
  field.focus({ preventScroll: true });
  field.setSelectionRange(start, end);
  const landed = !held.sentence || heldPlaceSentence(field.value, start) === held.sentence;
  setStatus(landed
    ? t("held_place_slip_back", heldThoughtWhere(thought), heldThoughtAgo(thought))
    : t("held_place_slip_moved", heldThoughtWhere(thought)));
}

function bootStickies() {
  migrateLegacyStickies();
  wireDeskStickies();
  renderDeskStickies();
  if (typeof updateMenuState === "function") updateMenuState();
}

window.AISystem6Runtime?.registerApplication({
  id: "todoDa",
  windowName: "todo",
  mount: attachStickies,
  restore: attachStickies,
  commands: {
    "open-todo-da": { handler: () => openStickies("next"), isAvailable: () => true },
    "open-stickies": { handler: () => openStickies(), isAvailable: () => true },
    "stickies-add": { handler: () => addStickyFromInput(), isAvailable: () => true },
    "stickies-make-action": { handler: () => clarifySelectedSticky("action"), isAvailable: () => !!selectedSticky() },
    "stickies-make-note": { handler: () => clarifySelectedSticky("note"), isAvailable: () => !!selectedSticky() },
    "stickies-done": { handler: () => toggleStickyDone(selectedSticky()), isAvailable: () => !!selectedSticky() },
    "stickies-delete": { handler: () => deleteSelectedSticky(), isAvailable: () => !!selectedSticky() },
    "stickies-pin": { handler: () => pinSticky(selectedSticky()), isAvailable: () => !!selectedSticky() },
    // Its own command, not resume-my-place: the menu redraw relabels every
    // resume-my-place button with the newest thought, and this one names the
    // selected thought.
    "stickies-back": { handler: () => resumeMyPlace(), isAvailable: () => !!selectedSticky()?.held },
  },
});

window.AISystem6Stickies = Object.freeze({
  boot: bootStickies,
  attach: attachStickies,
  open: openStickies,
  add: addSticky,
  render: renderStickies,
  undo: undoStickyDelete,
});

bootStickies();
window.AISystem6StickiesLoaded = true;
