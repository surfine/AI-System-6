// @ts-check
// Edit kernel: one history for every editor on the desk.
//
// Each editor used to keep its own undo stack, and four of them (DocMap, Cover
// Glass, ClioProject, ClioChart's table) answered Edit > Undo with nothing.
// This is the shared shape, after the persistent-document histories of the
// MIT/Apache *craft editors (vectorcraft, photocraft, lightcraft): a step is
// the whole document *before* a change, so undo is "write that snapshot back"
// and nothing has to know how to invert an edit.
//
// Three ways to record a step:
// - change(label, mutate): read, mutate, read; a change that changed nothing
//   (the same snapshot by `equals`) records nothing.
// - begin / preview / commit / cancel: one step for a whole drag or scrub.
//   preview(fn) hands fn the snapshot taken at begin, so every frame is
//   computed from the start rather than piled on the previous frame.
// - record(label, before): the low-level push for an editor that already holds
//   the snapshot it is about to replace.
// A `group` key folds a run of changes (typing in one field, nudging with the
// arrow keys, dragging a slider) into the first step of the run.
//
// Snapshots are whatever the editor reads: a Markdown string, a frozen object,
// a JSON string. `weigh` and `budget` cap the history by bytes instead of
// steps, for editors whose snapshots are pixels.
//
// Windows hand their history to registerEditHistory() (window-manager.js), and
// Edit > Undo / Redo, their availability and the step name in the menu follow
// from it. No DOM, no translations: the executable contract runs this bare.

(function installEditHistory(root) {
  if (root.AISystem6EditHistory) return;

  /**
   * @param {{
   *   read: () => any,
   *   write: (snapshot: any, meta: { kind: string, label: string }) => void,
   *   limit?: number,
   *   equals?: (a: any, b: any) => boolean,
   *   weigh?: (snapshot: any) => number,
   *   budget?: number,
   *   readSelection?: () => any,
   *   writeSelection?: (selection: any) => void,
   *   onChange?: (event: { kind: string, label: string }) => void,
   * }} options
   */
  function createEditHistory(options) {
    const { read, write } = options;
    const limit = Math.max(1, Number(options.limit) || 100);
    const equals = typeof options.equals === "function" ? options.equals : (a, b) => a === b;
    const weigh = typeof options.weigh === "function" ? options.weigh : null;
    const budget = Number(options.budget) || 0;
    /** @type {{ label: string, snapshot: any, selection: any, weight: number }[]} */
    let past = [];
    /** @type {{ label: string, snapshot: any, selection: any, weight: number }[]} */
    let future = [];
    /** @type {{ label: string, before: any, selection: any } | null} */
    let gesture = null;
    let openGroup = "";
    let suspended = 0;

    const selectionNow = () => (typeof options.readSelection === "function" ? options.readSelection() : undefined);
    const step = (label, snapshot, selection) => ({
      label: String(label || ""),
      snapshot,
      selection,
      weight: weigh ? Math.max(0, Number(weigh(snapshot)) || 0) : 0,
    });
    const notify = (kind, label) => {
      if (typeof options.onChange === "function") options.onChange({ kind, label: String(label || "") });
    };
    function trim() {
      while (past.length > limit) past.shift();
      if (!weigh || !budget) return;
      let total = past.reduce((sum, entry) => sum + entry.weight, 0) + future.reduce((sum, entry) => sum + entry.weight, 0);
      // The oldest steps go first; the step just recorded always survives, so
      // one very large change still has its undo.
      while (total > budget && past.length > 1) total -= /** @type {any} */ (past.shift()).weight;
      while (total > budget && future.length) total -= /** @type {any} */ (future.shift()).weight;
    }

    function record(label, before, { group = "", selection } = /** @type {any} */ ({})) {
      if (suspended) return false;
      const key = String(group || "");
      if (key && key === openGroup && past.length) {
        // Same run: the first step's snapshot already holds the state before
        // the run began, so later changes only drop the redo branch.
        future = [];
        notify("group", label);
        return false;
      }
      past.push(step(label, before, selection === undefined ? selectionNow() : selection));
      future = [];
      openGroup = key;
      trim();
      notify("record", label);
      return true;
    }

    function change(label, mutate, { group = "" } = {}) {
      if (gesture) throw new Error("edit history: change() inside an open gesture");
      const before = read();
      const selection = selectionNow();
      const result = mutate();
      if (equals(before, read())) return result;
      record(label, before, { group, selection });
      return result;
    }

    function begin(label) {
      if (gesture) cancel();
      openGroup = "";
      gesture = { label: String(label || ""), before: read(), selection: selectionNow() };
      return gesture.before;
    }

    function preview(fn) {
      if (!gesture) return undefined;
      const next = fn(gesture.before);
      if (next !== undefined) write(next, { kind: "preview", label: gesture.label });
      return next;
    }

    function commit() {
      if (!gesture) return false;
      const { label, before, selection } = gesture;
      gesture = null;
      if (equals(before, read())) return false;
      openGroup = "";
      return record(label, before, { selection });
    }

    function cancel() {
      if (!gesture) return false;
      const { label, before } = gesture;
      gesture = null;
      write(before, { kind: "cancel", label });
      return true;
    }

    function travel(from, to, kind) {
      if (gesture) cancel();
      openGroup = "";
      const entry = from.pop();
      if (!entry) return false;
      to.push(step(entry.label, read(), selectionNow()));
      suspended += 1;
      try {
        write(entry.snapshot, { kind, label: entry.label });
        if (entry.selection !== undefined && typeof options.writeSelection === "function") options.writeSelection(entry.selection);
      } finally {
        suspended -= 1;
      }
      notify(kind, entry.label);
      return true;
    }

    const api = {
      change,
      record,
      begin,
      preview,
      commit,
      cancel,
      undo: () => travel(past, future, "undo"),
      redo: () => travel(future, past, "redo"),
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      undoLabel: () => (past.length ? past[past.length - 1].label : ""),
      redoLabel: () => (future.length ? future[future.length - 1].label : ""),
      /** Close the open group, so the next change starts a new step. */
      endGroup: () => { openGroup = ""; },
      inGesture: () => Boolean(gesture),
      clear() {
        past = [];
        future = [];
        gesture = null;
        openGroup = "";
        notify("clear", "");
      },
      size: () => ({ undo: past.length, redo: future.length, weight: past.concat(future).reduce((sum, entry) => sum + entry.weight, 0) }),
    };
    return api;
  }

  root.AISystem6EditHistory = Object.freeze({ createEditHistory });
})(typeof window !== "undefined" ? window : globalThis);
