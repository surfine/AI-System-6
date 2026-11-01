// Desk-level Undo. Edit > Undo takes back what the front window's own history
// cannot: deleting, moving, renaming, accepting a reply. Steps are labelled
// inverses; the Finder's operation log joins as a provider, so one Undo walks
// both in the order the writer did things. Window histories (edit-history.js)
// keep priority through editHistoryFor(), and this object answers when they
// have nothing to take back. It looks like a history on purpose: the Edit menu,
// its labels and the dispatcher already know that shape.
(function () {
  const LIMIT = 50;
  const past = [];
  const future = [];
  const providers = [];
  let quiet = 0;
  let batch = null;

  const here = () => (typeof activeProjectId !== "undefined" ? activeProjectId : "");
  const mine = (entry) => !entry.projectId || entry.projectId === here();
  const lastOf = (list) => list.findLast(mine) || null;
  const refresh = () => { if (typeof updateMenuState === "function") updateMenuState(); };
  const say = (key, ...args) => { if (typeof setStatus === "function") setStatus(t(key, ...args)); };

  // The step an Undo would take: the newest of the desk's own and a provider's.
  function next() {
    const own = lastOf(past);
    return providers.reduce((best, provider) => {
      const step = provider.next();
      return step && (!best || step.at > best.at) ? { ...step, provider } : best;
    }, own ? { at: own.at, label: own.label, own } : null);
  }

  function push(entry) {
    if (quiet || typeof entry?.undo !== "function") return false;
    past.push({ ...entry, at: Date.now(), projectId: here() });
    if (past.length > LIMIT) past.shift();
    future.length = 0;
    refresh();
    return true;
  }

  // Run fn without registering: the Finder logs its own Trash drops.
  function silently(fn) {
    quiet += 1;
    try { return fn(); } finally { quiet -= 1; }
  }

  // Put records that went to the Trash back; only what is still in it returns.
  function trashed(records, label = "undo_label_trash") {
    const list = records.filter(Boolean);
    if (!list.length) return false;
    if (batch) return !!batch.push(...list);
    return push({
      label,
      undo: () => list.map((item) => trashItems.includes(item) && restoreTrashItem(item) && (finishTrashPutAway(item, true), true)).includes(true),
    });
  }

  // Everything trashed while fn runs is one step: a selection is one Undo.
  function together(fn) {
    if (batch) return fn();
    batch = [];
    try { return fn(); } finally {
      const list = batch;
      batch = null;
      trashed(list);
    }
  }

  // Put accepted text into a field as one native edit, so the field's own Undo
  // takes the whole acceptance back in one step. Assigning .value would wipe
  // that stack, so only the changed middle is typed over.
  function replaceText(control, next) {
    const old = control.value;
    let head = 0;
    while (head < old.length && head < next.length && old[head] === next[head]) head += 1;
    let tail = 0;
    while (tail < old.length - head && tail < next.length - head && old[old.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1;
    const typed = next.slice(head, next.length - tail);
    let done = false;
    if (typeof document !== "undefined" && typeof document.execCommand === "function" && control.setSelectionRange) {
      control.focus();
      control.setSelectionRange(head, old.length - tail);
      done = typed ? document.execCommand("insertText", false, typed) : document.execCommand("delete");
    }
    if (!done || control.value !== next) control.value = next;
    return true;
  }

  function run(from, to, kind) {
    const step = kind === "undo" ? next() : null;
    const entry = step ? step.own : lastOf(from);
    if (step && !entry) {
      Promise.resolve(step.provider.undo()).then((done) => { if (!done) say("nothing_to_undo_here"); refresh(); });
      return true;
    }
    if (!entry) return false;
    from.splice(from.lastIndexOf(entry), 1);
    Promise.resolve().then(() => entry[kind]?.()).then((done) => {
      if (!done) say("desk_undo_unavailable");
      else if (entry[kind === "undo" ? "redo" : "undo"]) to.push(entry);
      refresh();
    }).catch((error) => { console.warn("Desk undo step failed", error); say("desk_undo_unavailable"); });
    return true;
  }

  window.AISystem6DeskUndo = {
    push,
    trashed,
    silently,
    together,
    replaceText,
    provide: (provider) => { providers.push(provider); },
    canUndo: () => !!next(),
    canRedo: () => !!lastOf(future),
    undoLabel: () => next()?.label || "",
    redoLabel: () => lastOf(future)?.label || "",
    undo: () => run(past, future, "undo"),
    redo: () => run(future, past, "redo"),
  };
})();
