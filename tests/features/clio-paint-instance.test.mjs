// ClioPaint as the first real application on the framework interfaces:
// controls are found inside the window's own root, binding happens once and
// can be released and re-bound, and an answer that arrives after the picture
// changed is not shown on the picture that replaced it.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import vm from "node:vm";

const test = createFeatureTest("clio-paint-instance");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

// The window registry loads this module lazily through a script tag, which the
// headless harness does not execute; evaluating the real source installs it in
// the same runtime the app uses.
// The window is built with the shared application shell, which loads with it.
["app/core/application-shell.js", "app/core/edit-history.js", "app/core/edit-snap.js", "app/core/edit-layers.js", "app/core/edit-assets.js", "app/features/clio-paint.js"].forEach((path) => {
  vm.runInContext(read(path), vmw.context, { filename: path });
});

test.assert(
  run('typeof window.AISystem6ClioPaint?.dispose === "function"') === true,
  "the window exposes a dispose step for a real destroy"
);
test.assert(
  run('!!document.querySelector(\'[data-window="clioPaint"]\')') === true,
  "the window builds itself in the runtime"
);

// --- Controls come from this window's root ---------------------------------
const scoping = await run(`
  (() => {
    // A same-id node placed BEFORE the window in document order: any lookup by
    // bare id would find this one first, which is exactly the trap the
    // root-scoped lookup removes.
    const decoy = document.createElement("div");
    decoy.id = "clio-paint-toolbar";
    document.body.prepend(decoy);
    window.AISystem6ClioPaint.attach();
    window.AISystem6ClioPaint.setTool("eraser");
    const root = document.querySelector('[data-window="clioPaint"]');
    const real = root.querySelector("#clio-paint-toolbar");
    return {
      realPressed: real.querySelector('[data-clio-paint-tool="eraser"]')?.getAttribute("aria-pressed"),
      decoyChildren: decoy.children.length,
    };
  })()
`);
test.assert(
  scoping.realPressed === "true",
  "a control update lands on the window's own node, even with a same-id node earlier in the document"
);
test.assert(scoping.decoyChildren === 0, "and the same-id node outside the window is left alone");

// --- Binding happens once, and can be released and re-bound ----------------
const binding = await run(`
  (() => {
    const api = window.AISystem6ClioPaint;
    api.attach();
    api.attach();
    const bound = api.resourceCount();
    const firstDispose = api.dispose();
    const secondDispose = api.dispose();
    return { bound, firstDispose, secondDispose, afterDispose: api.resourceCount() };
  })()
`);
test.assert(binding.bound > 0, "attaching the window registers the listeners it needs");
test.assert(
  binding.firstDispose.disposed === true && binding.secondDispose.disposed === false,
  "dispose runs once and a second call is a no-op"
);
test.assert(binding.afterDispose === 0, "after dispose the instance holds nothing");

const rebind = await run(`
  (() => {
    const api = window.AISystem6ClioPaint;
    api.attach();
    const toolbar = document.querySelector('[data-window="clioPaint"] #clio-paint-toolbar');
    const eraser = toolbar.querySelector('[data-clio-paint-tool="eraser"]');
    eraser.dispatchEvent(new Event("click", { bubbles: true }));
    return { rebound: api.resourceCount(), tool: api.state().tool };
  })()
`);
test.assert(rebind.rebound > 0, "a window re-attached after a destroy binds again");
test.assert(rebind.tool === "eraser", "and its toolbar answers again");

// --- An answer that arrives after the picture changed is not shown ---------
const lateAnswer = await run(`
  (async () => {
    const api = window.AISystem6ClioPaint;
    window.__project = { id: "project-a", questionSheet: "", outline: "", drafts: [] };
    getActiveProject = () => window.__project;
    imageAttachmentById = () => null;
    clioPaintReadGoesToCloud = () => false;
    validateGeneratedWritingOutline = (markdown) => markdown;
    window.AISystem6RunReceipts = { createReceipt: async () => ({ ok: false }), finishReceipt: async () => ({ ok: true }) };
    // The headless DOM has no canvas encoder; the guard under test is about
    // identity, not about pixels.
    document.querySelector('[data-window="clioPaint"] #clio-paint-canvas').toDataURL = () => "data:image/png;base64,AAA";

    let releaseModel = null;
    sendLocalModelTask = () => new Promise((resolve) => {
      releaseModel = () => resolve({ text: "A prompt that describes the sketch." });
    });

    window.__resultPanel = document.querySelector('[data-window="clioPaint"] #clio-paint-result');
    const pending = api.sketchToImagePrompt();
    await Promise.resolve();
    await Promise.resolve();
    // The writer switches projects while the model is still working.
    window.__project = { id: "project-b", questionSheet: "", outline: "", drafts: [] };
    releaseModel();
    await pending;
    return {
      hidden: window.__resultPanel.hidden === true,
      lastResult: api.result(),
      statusText: document.querySelector('[data-window="clioPaint"] #clio-paint-status-label')?.textContent || "",
    };
  })()
`);
test.assert(
  lateAnswer.hidden === true,
  "an answer for a picture that is no longer open is not rendered into the result panel"
);
test.assert(
  !lateAnswer.lastResult,
  "and it does not become the result Apply would act on"
);
test.assert(
  lateAnswer.statusText.length > 0,
  "the window says what happened instead of silently dropping the answer"
);

// --- Pressing inside a selection floats it -----------------------------------
//
// Found in the browser on 2026-09-24: the press handler was one if/else chain
// ending in "any other tool draws a shape", and a press that started a move
// made the selection branch's condition false, so the same press fell through
// and also started a marquee. The lifted pixels were lost and no move was
// written. Driven here through the real pointer handlers on the real module;
// the document is a bitmap, so the picture itself can be read back headless.
//
// Since layers (2026-10-09) the region is a FLOAT: it hangs above its layer,
// the layer's bitmap is not touched, no step is written, and it is put down by
// a click outside it, Return or another tool - or taken back by Escape.
const driver = `
  const api = window.AISystem6ClioPaint;
  const root = document.querySelector('[data-window="clioPaint"]');
  const viewport = root.querySelector("#clio-paint-viewport");
  clioPaintEventPoint = (event) => ({ x: event.clientX, y: event.clientY });
  document.querySelectorAll(".window.is-active").forEach((win) => win.classList.remove("is-active"));
  root.classList.remove("is-hidden");
  root.classList.add("is-active");
  let pointerId = 50;
  // "extra" rides every event of the drag; "moveExtra" only the moves (Option
  // held after the press, say).
  const drag = (points, extra = {}, moveExtra = extra) => {
    const id = pointerId++;
    const fire = (type, [x, y], more) => viewport.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      pointerId: id, pointerType: "mouse", button: 0, clientX: x, clientY: y, shiftKey: false, altKey: false, ...more,
    }));
    fire("pointerdown", points[0], extra);
    points.slice(1).forEach((point) => fire("pointermove", point, moveExtra));
    fire("pointerup", points[points.length - 1], extra);
  };
  const key = (name, extra = {}) => document.dispatchEvent({ type: "keydown", key: name, target: viewport, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, preventDefault() { this.defaultPrevented = true; }, ...extra });
  const px = (x, y) => clioPaintGetBit(clioPaintState.doc, x, y);
  const labels = () => { const h = clioPaintHistory(); return { undo: h.undoLabel(), redo: h.redoLabel(), depth: h.size().undo }; };
`;
const moveRun = await run(`
  (() => {
    ${driver}
    clioPaintBlankCanvas({ width: 480, height: 300 });
    api.setTool("rect-filled");
    api.setPattern(1);
    drag([[20, 20], [60, 50]]);
    const drawn = px(40, 35);
    const depthAfterDraw = labels().depth;
    api.setTool("marquee");
    drag([[10, 10], [70, 60]]);
    const selected = api.state().hasSelection;
    // pretend the picture was just saved, so only the float can make it unsaved
    clioPaintState.savedSnapshot = clioPaintState.snapshot;
    clioPaintSyncDirtyFromSaved();
    drag([[40, 35], [140, 35]]);
    const floating = {
      float: api.state().hasFloat,
      depth: labels().depth,
      layerUntouched: px(40, 35),
      dirty: api.state().dirty,
      canUndo: clioPaintCanUndo(),
    };
    key("Escape");
    const afterEscape = { float: api.state().hasFloat, selection: api.state().hasSelection, back: px(40, 35), depth: labels().depth, dirty: api.state().dirty };
    drag([[10, 10], [70, 60]]);
    drag([[40, 35], [140, 35]]);
    key("Enter");
    const dropped = { float: api.state().hasFloat, step: labels().undo, depth: labels().depth, oldPlace: px(40, 35), newPlace: px(140, 35), still: api.state().hasSelection };
    api.setTool("pencil");
    return {
      drawn, depthAfterDraw, selected, floating, afterEscape, dropped,
      stillSelected: api.state().hasSelection,
      pencilOnInk: (() => { drag([[140, 35]]); return px(140, 35); })(),
    };
  })()
`);
test.assert(moveRun.drawn === 1 && moveRun.selected === true, "a filled rectangle is drawn and then selected");
test.assert(moveRun.floating.float === true && moveRun.floating.depth === moveRun.depthAfterDraw, "pressing inside the selection lifts a float and writes no step yet, not a new marquee");
test.assert(moveRun.floating.layerUntouched === 1, "the layer's bitmap is not changed while the region floats");
test.assert(moveRun.floating.dirty === true && moveRun.floating.canUndo === true, "a float counts as unsaved work and Undo can take it back");
test.assert(
  moveRun.afterEscape.float === false && moveRun.afterEscape.selection === false && moveRun.afterEscape.back === 1 && moveRun.afterEscape.depth === moveRun.depthAfterDraw && moveRun.afterEscape.dirty === false,
  "Escape puts the float back: no step, the pixels where they were, nothing unsaved"
);
test.assert(moveRun.dropped.float === false && moveRun.dropped.step === "clio_paint_op_move" && moveRun.dropped.depth === moveRun.depthAfterDraw + 1, "Return puts the float down as one Move step");
test.assert(moveRun.dropped.oldPlace === 0 && moveRun.dropped.newPlace === 1 && moveRun.dropped.still === false, "and the pixels arrive where they were dragged, gone from where they were");
test.assert(moveRun.stillSelected === false, "choosing another tool puts the selection down");
test.assert(moveRun.pencilOnInk === 0, "the pencil draws white when it starts on a black pixel");

// --- A float snaps, and Option turns that off ---------------------------------
const snapRun = await run(`
  (() => {
    ${driver}
    clioPaintBlankCanvas({ width: 480, height: 300 });
    api.setTool("rect-filled"); api.setPattern(1);
    drag([[100, 100], [140, 130]]);
    addClioPaintLayer("ink");
    drag([[300, 200], [340, 230]]);
    api.setTool("marquee");
    drag([[290, 190], [350, 240]]);
    const before = clioPaintState.selection.x;
    // three pixels off the page's left edge: it lands on the edge
    drag([[300, 210], [13, 210]]);
    const snapped = clioPaintState.selection.x;
    key("Enter");
    // the same nudge near the edge, with and without Option held mid-drag
    drag([[0, 190], [60, 240]]);
    drag([[30, 210], [34, 210]]);
    const withSnap = clioPaintState.selection.x;
    key("Escape");
    drag([[0, 190], [60, 240]]);
    drag([[30, 210], [34, 210]], {}, { altKey: true });
    const withoutSnap = clioPaintState.selection.x;
    key("Escape");
    // a box lined up with the other layer's content box (left edge x = 100)
    drag([[290, 190], [350, 240]]);
    drag([[300, 210], [300 - 187, 210]]);
    const toOther = clioPaintState.selection.x;
    key("Escape");
    return { before, snapped, withSnap, withoutSnap, toOther };
  })()
`);
test.assert(snapRun.before === 290 && snapRun.snapped === 0, "a float dragged to within a few pixels of the page edge snaps onto it");
test.assert(snapRun.withSnap === 0 && snapRun.withoutSnap === 4, "and with Option held during the drag it goes exactly where the pointer goes");
test.assert(snapRun.toOther === 100, "it also snaps to the content box of another layer");

// --- Layers: every operation is a step, and Undo restores the exact bits ----------
const layerRun = await run(`
  (() => {
    ${driver}
    const edit = editHistoryFor("clioPaint");
    clioPaintBlankCanvas({ width: 480, height: 300 });
    api.setTool("rect-filled"); api.setPattern(1);
    const sig = () => JSON.stringify([
      api.layers(),
      clioPaintState.layers.map((layer) => [...layer.doc.bits].reduce((hash, byte) => (hash * 31 + byte) >>> 0, 7)),
    ]);
    const sigs = [sig()];
    const ops = [
      () => drag([[20, 20], [60, 50]]),
      () => addClioPaintLayer("ink"),
      () => drag([[200, 100], [240, 130]]),
      () => toggleClioPaintLayerFlag(api.layers()[1].id, "hidden"),
      () => toggleClioPaintLayerFlag(api.layers()[1].id, "hidden"),
      () => toggleClioPaintLayerFlag(api.layers()[1].id, "locked"),
      () => toggleClioPaintLayerFlag(api.layers()[1].id, "locked"),
      () => renameClioPaintLayer(api.layers()[1].id, "Ink two"),
      () => moveClioPaintLayer(api.layers()[1].id, 0),
      () => duplicateClioPaintLayer(),
      () => mergeClioPaintLayerDown(),
      () => addClioPaintLayer("tracing"),
      () => drag([[300, 200], [340, 230]]),
      () => deleteClioPaintLayer(),
    ];
    const out = { names: [] };
    ops.forEach((op, index) => {
      const before = labels().depth;
      op();
      out.names.push(labels().undo);
      sigs.push(sig());
      if (labels().depth !== before + 1) out.wrongStep = index;
    });
    out.finalLayers = api.layers().map((layer) => layer.name + ":" + layer.kind).join(",");
    // Undo all the way down, comparing against what each state looked like.
    let back = sigs.length - 1;
    out.undoExact = true;
    while (edit.canUndo()) {
      edit.undo();
      back -= 1;
      if (sig() !== sigs[back]) out.undoExact = false;
    }
    out.undoReachedStart = back === 0;
    out.redoExact = true;
    let forward = 0;
    while (edit.canRedo()) {
      edit.redo();
      forward += 1;
      if (sig() !== sigs[forward]) { out.redoExact = false; (out.badRedo ||= []).push(forward); }
    }
    out.redoReachedEnd = forward === sigs.length - 1;
    out.tracingLeftOutOfPicture = (() => {
      addClioPaintLayer("tracing"); drag([[300, 200], [340, 230]]);
      const composite = clioPaintComposite(clioPaintState.layers.map((layer) => ({ kind: layer.kind, visible: layer.visible, bits: layer.doc.bits })));
      const inPicture = (composite.ink[(215 * 480 + 320) >> 3] >> (7 - ((215 * 480 + 320) & 7))) & 1;
      const inGuides = (composite.trace[(215 * 480 + 320) >> 3] >> (7 - ((215 * 480 + 320) & 7))) & 1;
      edit.undo(); edit.undo();
      return { inPicture, inGuides };
    })();
    return out;
  })()
`);
test.assert(!("wrongStep" in layerRun), "adding, drawing, hiding, locking, renaming, restacking, duplicating, merging and deleting each write exactly one step");
test.assert(layerRun.names[0] === "clio_paint_tool_rect_filled" || layerRun.names[0].startsWith("clio_paint_tool_"), "a drawing step is named for its tool");
test.assert(layerRun.names.includes("clio_paint_op_layer_merge") && layerRun.names.includes("clio_paint_op_layer_reorder"), "layer steps carry their own names in the Edit menu");
test.assert(layerRun.finalLayers.length > 0 && !layerRun.finalLayers.includes("tracing"), "the tracing layer was deleted again and the ink layers remain");
test.assert(layerRun.tracingLeftOutOfPicture.inPicture === 0 && layerRun.tracingLeftOutOfPicture.inGuides === 1, "a tracing layer's ink shows as a guide and is never in the picture that is saved");
test.assert(layerRun.undoExact && layerRun.undoReachedStart, "undoing every step restores the exact layers and bits each state had");
test.assert(layerRun.redoExact && layerRun.redoReachedEnd, "and redo walks them forward again, bit for bit");

// --- A locked layer cannot be drawn on; a hidden one cannot either ----------------
const lockRun = await run(`
  (() => {
    ${driver}
    clioPaintBlankCanvas({ width: 480, height: 300 });
    api.setTool("pencil");
    const before = labels().depth;
    toggleClioPaintLayerFlag(api.state().activeLayer, "locked");
    const afterLock = labels().depth;
    drag([[30, 30], [50, 30]]);
    const lockedPixel = px(40, 30);
    const lockedDepth = labels().depth;
    toggleClioPaintLayerFlag(api.state().activeLayer, "locked");
    toggleClioPaintLayerFlag(api.state().activeLayer, "hidden");
    drag([[30, 30], [50, 30]]);
    const hiddenPixel = px(40, 30);
    toggleClioPaintLayerFlag(api.state().activeLayer, "hidden");
    drag([[30, 30], [50, 30]]);
    return { locksIsAStep: afterLock === before + 1, lockedPixel, lockedDepth: lockedDepth - afterLock, hiddenPixel, drawnPixel: px(40, 30) };
  })()
`);
test.assert(lockRun.locksIsAStep, "locking a layer is a step");
test.assert(lockRun.lockedPixel === 0 && lockRun.lockedDepth === 0, "a press on a locked layer changes nothing and writes no step");
test.assert(lockRun.hiddenPixel === 0 && lockRun.drawnPixel === 1, "likewise on a hidden one, until it is shown again");

// --- A step costs the tiles it touched --------------------------------------------
const tileRun = await run(`
  (() => {
    ${driver}
    clioPaintBlankCanvas({ width: 576, height: 720 });
    api.setTool("pencil");
    const weight = () => clioPaintHistory().size().weight;
    drag([[10, 10]]);
    const first = weight();
    drag([[14, 10]]);
    const second = weight() - first;
    // a different tile far away, and a long stroke through several tiles
    drag([[500, 700]]);
    const third = weight() - first - second;
    const whole = clioPaintSnapshotCost(clioPaintState.snapshot, null);
    return { first, second, third, whole, steps: labels().depth, bytesInAFullPicture: 576 * 720 / 8 };
  })()
`);
test.assert(tileRun.second === 96 + (512 + 32) + 32, "a one-pixel stroke on a 576x720 page that lands in an inked tile costs that one tile");
test.assert(tileRun.first < 200 && tileRun.third < 200, "a stroke into blank tiles costs only a note: undoing it needs no pixels");
test.assert(tileRun.second * 100 < tileRun.bytesInAFullPicture * 3, "far less than the 51 KB a full-picture snapshot of that page would cost");

// --- Undo is the desk's, not the window's -------------------------------------------
//
// The window used to claim Command-Z in the capture phase. It no longer does:
// the desk's own shortcut dispatcher answers the key, runEditCommand asks the
// history this window registered, and the picture goes back one step.
const undoRoute = await run(`
  (() => {
    ${driver}
    clioPaintBlankCanvas({ width: 480, height: 300 });
    api.setTool("pencil");
    drag([[30, 30], [50, 30]]);
    const drawn = px(40, 30);
    const named = editHistoryFor("clioPaint").undoLabel();
    const press = (extra) => {
      const event = { type: "keydown", key: "z", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, target: viewport, preventDefault() { this.defaultPrevented = true; }, ...extra };
      document.dispatchEvent(event);
    };
    press({});
    const undone = px(40, 30);
    const canRedo = editHistoryFor("clioPaint").canRedo();
    press({ shiftKey: true });
    return { drawn, named, undone, canRedo, redone: px(40, 30) };
  })()
`);
test.assert(undoRoute.drawn === 1 && undoRoute.named.startsWith("clio_paint_tool_"), "the registered history names the step it would take back");
test.assert(undoRoute.undone === 0 && undoRoute.canRedo === true, "Command-Z takes the stroke back through the desk's Edit route");
test.assert(undoRoute.redone === 1, "and Shift-Command-Z puts it back");

// --- Saving and reopening: layers, the composite, and the picture from before layers ---
const saveRun = await run(`
  (async () => {
    ${driver}
    if (typeof File === "undefined") globalThis.File = class { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options?.type || ""; } };
    window.__project = { id: "p1" };
    getActiveProject = () => window.__project;
    markDeskDirty = () => {};
    saveDeskState = async () => true;
    imageAttachments.length = 0;
    let n = 0;
    buildImageAttachments = async (files, options) => files.map((file) => ({
      id: "rec-" + (n++), projectId: options.projectId, surface: options.surface, name: file.name, type: "image/png",
      originalDataUrl: "data:" + file.name, previewDataUrl: "data:" + file.name, createdAt: new Date(1e12 + n).toISOString(),
    }));
    clioPaintCanvasBlob = async () => ({ composite: true });
    clioPaintLayerBlob = async (layer) => ({ layer: layer.id });
    const bitsByUrl = new Map();
    const realLayerBlob = clioPaintLayerBlob;
    clioPaintLayerBlob = async (layer) => { bitsByUrl.set("data:" + layer.name + ".png", layer.bits); return realLayerBlob(layer); };
    clioPaintDecodeLayerBits = async (url) => bitsByUrl.get(url) || null;
    globalThis.Image = class {
      set src(value) { this._src = value; Promise.resolve().then(() => this.onload && this.onload()); }
      get naturalWidth() { return window.__imageSize?.[0] || 480; }
      get naturalHeight() { return window.__imageSize?.[1] || 300; }
    };
    clioPaintBlankCanvas({ width: 480, height: 300 });
    api.setTool("rect-filled"); api.setPattern(1);
    drag([[20, 20], [60, 50]]);
    addClioPaintLayer("ink"); drag([[200, 100], [240, 130]]);
    addClioPaintLayer("tracing"); drag([[300, 200], [340, 230]]);
    ["Base", "Ink", "Guide"].forEach((name, index) => renameClioPaintLayer(api.layers()[index].id, name));
    toggleClioPaintLayerFlag(api.layers()[1].id, "locked");
    const sig = () => JSON.stringify([api.layers(), clioPaintState.layers.map((layer) => [...layer.doc.bits].reduce((hash, byte) => (hash * 31 + byte) >>> 0, 7))]);
    const before = sig();
    const unsavedBefore = api.state().dirty;
    await api.save();
    const records = imageAttachments.map((r) => ({ id: r.id, role: r.role, status: r.status, group: r.group, order: r.order, layer: r.layer?.kind }));
    const album = imageAttachmentsForProject("p1", { surface: "clioPaint" }).map((r) => r.id);
    const picture = api.state().attachmentId;
    const savedClean = api.state().dirty === false;
    // The picture, closed and reopened, from the store.
    clioPaintBlankCanvas({ width: 480, height: 300 });
    const composite = imageAttachments.find((r) => r.id === picture);
    await loadClioPaintRecord(composite);
    const reopened = sig() === before;
    const cleanAfterOpen = api.state().dirty === false;
    // Saving it again updates the same records.
    await api.save();
    const countAfterResave = imageAttachments.length;
    // A layer deleted before a save leaves no record behind.
    deleteClioPaintLayer(api.layers()[2].id);
    await api.save();
    const countAfterDelete = imageAttachments.length;
    // A picture saved before layers existed: one PNG, no group.
    const legacyBits = new Uint8Array(Math.ceil(576 * 720 / 8));
    for (let y = 100; y < 120; y += 1) for (let x = 50; x < 90; x += 1) { const p = y * 576 + x; legacyBits[p >> 3] |= 128 >> (p & 7); }
    imageAttachments.push({ id: "legacy-1", projectId: "p1", surface: "clioPaint", name: "ClioPaint.png", type: "image/png", originalDataUrl: "data:legacy", previewDataUrl: "data:legacy", createdAt: "2026-01-01T00:00:00.000Z" });
    window.__imageSize = [576, 720];
    clioPaintPackImageData = () => legacyBits;
    await loadClioPaintRecord(imageAttachments.find((r) => r.id === "legacy-1"));
    const legacy = {
      layers: api.layers().length, width: api.state().width, height: api.state().height,
      ink: px(60, 110), outside: px(10, 10), clean: api.state().dirty === false, attachment: api.state().attachmentId,
    };
    return { unsavedBefore, records, album, picture, savedClean, reopened, cleanAfterOpen, countAfterResave, countAfterDelete, legacy };
  })()
`);
test.assert(saveRun.unsavedBefore === true && saveRun.savedClean === true, "saving makes the picture clean");
test.assert(saveRun.records.length === 4, "one record per layer plus the composite");
const compositeRecord = saveRun.records.find((r) => r.role === "sketch-composite");
test.assert(compositeRecord && compositeRecord.status === "kept" && compositeRecord.group === compositeRecord.id, "the composite is a kept picture, and the group is named for it");
test.assert(
  saveRun.records.filter((r) => r.role === "sketch-layer").length === 2 && saveRun.records.filter((r) => r.role === "sketch-tracing").length === 1,
  "each layer is its own record, a tracing layer with its own role"
);
test.assert(
  saveRun.records.every((r) => r.status === "kept" && r.group === compositeRecord.id) && [0, 1, 2].every((order) => saveRun.records.some((r) => r.role !== "sketch-composite" && r.order === order)),
  "all kept once the save landed, in the group, ordered bottom first"
);
test.assert(saveRun.album.length === 1 && saveRun.album[0] === compositeRecord.id, "the Picture Album and the other apps see only the composite");
test.assert(saveRun.reopened && saveRun.cleanAfterOpen, "reopening the picture gives back the same layers, names, locks and bits, with nothing unsaved");
test.assert(saveRun.countAfterResave === 4, "saving again updates the same records instead of piling up copies");
test.assert(saveRun.countAfterDelete === 3, "a layer deleted before a save does not linger in the store");
test.assert(
  saveRun.legacy.layers === 1 && saveRun.legacy.width === 576 && saveRun.legacy.height === 720 && saveRun.legacy.ink === 1 && saveRun.legacy.outside === 0,
  "a picture saved before layers opens as one layer holding all of it, at its own size"
);
test.assert(saveRun.legacy.clean && saveRun.legacy.attachment === "legacy-1", "and is still the picture a re-save would update");

// --- A disabled Paint command says what it is waiting for -------------------
const reasons = await run(`
  (() => {
    const api = window.AISystem6ClioPaint;
    const root = document.querySelector('[data-window="clioPaint"]');
    root.classList.add("is-hidden");
    const other = document.querySelector(".window.is-active");
    if (other) other.classList.remove("is-active");
    const awayFromWindow = api.commandAvailability("clio-paint-undo");
    root.classList.remove("is-hidden");
    document.querySelectorAll(".window.is-active").forEach((win) => win.classList.remove("is-active"));
    root.classList.add("is-active");
    const inWindow = api.commandAvailability("clio-paint-undo");
    const noResult = api.commandAvailability("clio-paint-result-copy");
    const open = api.commandAvailability("open-clio-paint");
    const noSelection = api.commandAvailability("clio-paint-invert");
    return { awayFromWindow, inWindow, noResult, open, noSelection };
  })()
`);
test.assert(
  reasons.awayFromWindow.available === false && reasons.awayFromWindow.reason === "clio_paint_needs_window",
  "a command whose window is not in front says which window it needs"
);
test.assert(reasons.open.available === true, "opening the app is always available");
test.assert(
  reasons.noResult.available === false && reasons.noResult.reason === "clio_paint_no_result",
  "a command that needs a result says so"
);

test.assert(
  reasons.noSelection.available === false && reasons.noSelection.reason === "clio_paint_no_selection",
  "an Edit command that works on a region says it is waiting for one"
);

test.finish();
