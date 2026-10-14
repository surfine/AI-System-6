// Multi-instance window identity (P0): the "one window name ↔ one element"
// equation becomes "one kind ↔ N instances". window-manager.js owns geometry,
// layering, focus and lifecycle; this module owns only identity.
//
// Three rules carry the whole layer (MULTI-INSTANCE-WINDOWS-SPEC §2/§4/§9):
//
// 1. `data-window` stays the KIND name; `data-window-instance` is the instance
//    id. An element without the attribute IS the kind's main instance — every
//    existing selector, WeakMap and dataset reader keeps working unchanged.
// 2. The whitelist is a mechanism, not a population: at P0 the set is empty by
//    ruling (§9A/§9E — ship the mechanism, no real application grows a second
//    window this round). openWindowInstance refuses everything and says why.
// 3. Writing-route kinds (questionSheet/outline/sectionDrafts/reviewDesk and
//    the manuscript role of teachText) never enter the whitelist: one editable
//    document owner per phase is a product invariant, not a per-era choice.
//
// The eager side keeps only what every existing getWindow caller needs:
// getWindow/main semantics, getWindowInstance and windowInstanceKey (see
// window-manager.js). The whitelist's registry layer is window-registry.js's
// `instances: "multi"` lines; this table is the concentrated layer and the
// contract holds the two sets equal.
//
// It also holds the per-instance DOCUMENT STATE buckets (P2, §2.7): the
// document-state singletons stay the key window's alias while each window
// keeps its own bucket. They live here because they are per-instance state,
// exactly like the identity that owns them — and because the boot bundle
// already names this file, the buckets cost no extra eager literal.
//
// Contract: tests/features/multi-instance-windows.test.mjs

(() => {
  if (window.AISystem6WinInst) return;
  window.AISystem6WinInst = true;

  // The concentrated capability table (§9A layer two). Keep the same order as
  // the registry would list kinds, for readable diffs. Reader is the ruled
  // first kind (§9C): two instances are two views of one document, so the
  // read-only second instance is its natural shape — and the write lease
  // stays with the main instance. The second batch (§3.1, ruling of
  // 2026-10-14) adds DocMap and Time Machine in the same shape (V): a
  // read-only view of the same map / the same history.
  const multiInstanceKinds = Object.freeze(new Set([
    "docMap",
    "reader",
    "timeMachine",
  ]));

  // Which lazy module builds a kind's second window comes from the registry
  // record itself (`instanceModule`, declared beside `instances: "multi"`) —
  // the identity layer owns ONLY the identity, and the kind's own anatomy
  // stays with the kind. The boot bundle names every one of those paths (the
  // lazy-reachability gate), so a builder module can never sit unreachable.
  function instanceBuilderModule(kind) {
    return getWindowRecord(kind)?.instanceModule || "";
  }

  const MAIN = "main";

  function windowMultiInstanceWhitelist() {
    return [...multiInstanceKinds];
  }

  // Why openWindowInstance would refuse. Unavailable commands must say why —
  // the same rule every grey menu row follows.
  function openWindowInstanceRefusal(kind) {
    if (!multiInstanceKinds.has(kind)) return "window_instance_not_whitelisted";
    if (!instanceBuilderModule(kind)) return "window_instance_no_builder";
    return "";
  }

  // Six lowercase alphanumeric characters (§9B).
  function newInstanceInstanceId() {
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    const bytes = new Uint8Array(6);
    (window.crypto || { getRandomValues: (b) => b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); }) })
      .getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  function windowInstanceIdOf(win) {
    return win?.dataset?.windowInstance || MAIN;
  }

  // The whole desk looks an instance up by this selector — docks, the session
  // record, the projections — so one owner keeps the shape.
  function windowInstanceSelector(kind, instance) {
    return instance === MAIN
      ? `[data-window="${kind}"]:not([data-window-instance])`
      : `[data-window="${kind}"][data-window-instance="${CSS.escape(instance)}"]`;
  }

  // The builder module's own names, derived from the kind: reader ->
  // AISystem6ReaderInstances / AISystem6ReaderInstancesLoaded, docMap ->
  // AISystem6DocMapInstances / …. One rule, so a kind's second window needs
  // the registry's two fields and nothing else — and the contract asserts that
  // each whitelisted kind's module really installs these names.
  function instanceBuilderCapability(kind) {
    return kind.charAt(0).toUpperCase() + kind.slice(1);
  }

  // Build a kind's second window: the kind's own lazy module builds the
  // element (its anatomy stays with the kind), and the element is stamped with
  // its instance id here — one owner for the identity. A builder may await its
  // own kind's module first (the map's view waits for the map's renderer), so
  // its answer is awaited too.
  async function buildWindowInstance(kind, instanceId) {
    const modulePath = instanceBuilderModule(kind);
    if (!modulePath) return null;
    const capability = `AISystem6${instanceBuilderCapability(kind)}Instances`;
    await ensureLazySystemModule(modulePath, `${capability}Loaded`);
    const built = await window[capability]?.build?.(kind, instanceId);
    if (!built) return null;
    built.dataset.windowInstance = instanceId;
    return built;
  }

  // "Open one more" for a whitelisted kind. The identity layer builds the
  // element and then hands the window to openWindow(kind, { instance }) — the
  // ONE open path: chrome wiring, placement, the presentation ticket, the
  // registry hooks, focus and the session save are all window-manager's, so a
  // second instance is a window like any other. Only the identity is new.
  async function openWindowInstance(kind, { instance = "" } = {}) {
    const refusal = openWindowInstanceRefusal(kind);
    if (refusal) {
      if (typeof t === "function" && typeof setStatus === "function") setStatus(t(refusal, kind));
      return null;
    }
    const instanceId = instance || newInstanceInstanceId();
    let win = getWindowInstance(kind, instanceId);
    if (!win) { await buildWindowInstance(kind, instanceId); win = getWindowInstance(kind, instanceId); }
    if (!win) return null;
    await openWindow(kind, { instance: instanceId });
    return getWindowInstance(kind, instanceId);
  }

  // A second instance's tab set dies with its window (§4.2, ruling of
  // 2026-10-14): the tabs only record where a document is open, so the documents
  // stay in the project while the views go away with the window that held them.
  // Nothing is lost — and nothing is collected, either: Merge All Windows is the
  // explicit way to give them back, and the desk does not do it on its own when
  // a window closes. A main window owns no instance tabs, so this answers 0.
  function dropInstanceTabs(win) {
    const kind = windowKind(win);
    const instance = windowInstanceIdOf(win);
    if (!kind || instance === MAIN) return 0;
    const project = getActiveProject();
    const owned = getWindowDocumentTabs(kind, project, instance);
    owned.forEach((tab) => removeDocumentTab(kind, tab.id, project));
    return owned.length;
  }

  // Session restore re-mounts ids by save order (§9B): the stored strings are
  // hints, the sequence is the truth. Entries are the windows array in saved
  // order; each gains its final instance id. Legacy records (no instance)
  // keep "main".
  function assignRestoreInstanceIds(entries = []) {
    const seen = new Map();
    return entries.map((entry) => {
      const kind = entry?.name || "";
      const stored = entry?.instance || MAIN;
      let id = stored;
      if (stored !== MAIN) {
        const count = seen.get(`${kind}\u0000${stored}`) || 0;
        seen.set(`${kind}\u0000${stored}`, count + 1);
        id = count === 0 ? stored : `${stored}-${count + 1}`;
      }
      return { ...entry, instance: id };
    });
  }

  // The real handler replaces the lazy shim the eager entry registered: the
  // runtime's lazy path loads this module first, so the dispatch below lands
  // on a callable command every time.
  window.AISystem6Runtime?.registerCommand?.("open-window-instance", {
    handler: (context = {}) => openWindowInstance(context?.kind || context?.windowName || ""),
    isAvailable: () => true,
  });


  // ---- Document state buckets (P2, §2.7) ----------------------------------
  // The desk's document-state singletons live in app.js and are read from
  // ~100 call sites; §2.7 rules that they stay the KEY WINDOW's alias while
  // each window keeps its own bucket. The buckets ship inside this module
  // because they are per-instance state, exactly like the identity that owns
  // them — and because the boot bundle already names this file, so the
  // lazy-reachability gate stays satisfied without a second eager literal.

// One pair of accessors per slot. `try` on both sides: a slot whose owner is
// not on this desk is skipped rather than fatal, so this module never takes
// the desk down over a binding that a future build moved.
const ACCESS = {
  currentReaderPage: [() => currentReaderPage, (value) => { currentReaderPage = value || null; }],
  currentReaderClipCount: [() => currentReaderClipCount, (value) => { currentReaderClipCount = Number(value) || 0; }],
  activeTextFileId: [() => activeTextFileId, (value) => { activeTextFileId = value || null; }],
  teachTextFileLabel: [() => teachTextFileLabel, (value) => { teachTextFileLabel = value || ""; }],
  teachTextWorkflowState: [() => teachTextWorkflowState, (value) => { teachTextWorkflowState = value || ""; }],
  teachTextDocumentRole: [() => teachTextDocumentRole, (value) => { teachTextDocumentRole = value || "manuscript"; }],
};
const SLOTS = Object.freeze(Object.keys(ACCESS));

// Which window kind owns each slot. A focus switch between two Reader
// instances must not disturb TeachText's editing state — those slots stay
// whatever they were until a TeachText window becomes key, which is what
// "the globals are the KEY WINDOW's state" means once more than one write
// path exists. The owner is the window kind, not an app id: a kind's
// instances are exactly the viewers of its document state.
const SLOT_OWNER = Object.freeze({
  currentReaderPage: "reader",
  currentReaderClipCount: "reader",
  activeTextFileId: "teachText",
  teachTextFileLabel: "teachText",
  teachTextWorkflowState: "teachText",
  teachTextDocumentRole: "teachText",
});

function slotsOwnedBy(kind) {
  return SLOTS.filter((name) => SLOT_OWNER[name] === kind);
}

function readSlot(name) {
  try { return ACCESS[name][0](); } catch (_) { return undefined; }
}

function writeSlot(name, value) {
  try { ACCESS[name][1](value); } catch (_) { /* its owner is not here */ }
}

// element -> { slot: value }. WeakMap: a closed window's bucket goes with it.
const buckets = new WeakMap();
let keyWindow = null;

function windowKind(win) {
  return win?.dataset?.window || "";
}

function snapshot(kind) {
  const values = {};
  slotsOwnedBy(kind).forEach((name) => { values[name] = readSlot(name); });
  return values;
}

function apply(values = {}) {
  SLOTS.forEach((name) => { if (name in values) writeSlot(name, values[name]); });
}

function bucketFor(win) {
  let bucket = buckets.get(win);
  if (!bucket) {
    // A window with no bucket yet inherits what is live for ITS kind's
    // slots — never a blank, and never another kind's state.
    bucket = snapshot(windowKind(win));
    buckets.set(win, bucket);
  }
  return bucket;
}

// Called from focusWindow with the window that just became key (§2.7). The
// leaving window keeps its own kind's state; the arriving one gets its
// bucket back. Slots owned by a third kind are not touched at all.
function focus(win) {
  if (!win || win === keyWindow) return;
  if (keyWindow) buckets.set(keyWindow, snapshot(windowKind(keyWindow)));
  keyWindow = win;
  apply(bucketFor(win));
}

// A window going away hands its state back if it was the key window, so the
// desk's next focus does not inherit a closed window's document.
function forget(win) {
  if (win !== keyWindow) { buckets.delete(win); return; }
  keyWindow = null;
  buckets.delete(win);
}

window.AISystem6InstanceDocState = Object.freeze({
  slots: SLOTS,
  snapshot,
  apply,
  focus,
  forget,
  bucketOf: (win) => buckets.get(win) || null,
  keyWindow: () => keyWindow,
});
  window.AISystem6WindowInstances = Object.freeze({
    main: MAIN,
    whitelist: windowMultiInstanceWhitelist,
    refusal: openWindowInstanceRefusal,
    build: buildWindowInstance,
    open: openWindowInstance,
    newId: newInstanceInstanceId,
    idOf: windowInstanceIdOf,
    selector: windowInstanceSelector,
    assignRestoreIds: assignRestoreInstanceIds,
    dropTabs: dropInstanceTabs,
  });
})();
