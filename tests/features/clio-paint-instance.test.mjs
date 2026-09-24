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
["app/core/application-shell.js", "app/features/clio-paint.js"].forEach((path) => {
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

// --- Pressing inside a selection moves it ------------------------------------
//
// Found in the browser on 2026-09-24: the press handler was one if/else chain
// ending in "any other tool draws a shape", and a press that started a move
// made the selection branch's condition false, so the same press fell through
// and also started a marquee. The lifted pixels were lost and no move was
// written. Driven here through the real pointer handlers on the real module;
// the document is a bitmap, so the picture itself can be read back headless.
const moveRun = await run(`
  (() => {
    const api = window.AISystem6ClioPaint;
    const root = document.querySelector('[data-window="clioPaint"]');
    const viewport = root.querySelector("#clio-paint-viewport");
    clioPaintEventPoint = (event) => ({ x: event.clientX, y: event.clientY });
    let pointerId = 50;
    const drag = (points, extra = {}) => {
      const id = pointerId++;
      const fire = (type, [x, y]) => viewport.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        pointerId: id, pointerType: "mouse", button: 0, clientX: x, clientY: y, shiftKey: false, altKey: false, ...extra,
      }));
      fire("pointerdown", points[0]);
      points.slice(1).forEach((point) => fire("pointermove", point));
      fire("pointerup", points[points.length - 1]);
    };
    clioPaintBlankCanvas({ width: 480, height: 300 });
    api.setTool("rect-filled");
    api.setPattern(1);
    drag([[20, 20], [60, 50]]);
    const drawn = clioPaintGetBit(clioPaintState.doc, 40, 35);
    api.setTool("marquee");
    drag([[10, 10], [70, 60]]);
    const selected = api.state().hasSelection;
    drag([[40, 35], [140, 35]]);
    const labels = clioPaintState.history.past.map((step) => step.labelKey);
    api.setTool("pencil");
    return {
      drawn,
      selected,
      lastStep: labels[labels.length - 1],
      moves: labels.filter((label) => label === "clio_paint_op_move").length,
      stillSelected: api.state().hasSelection,
      oldPlace: clioPaintGetBit(clioPaintState.doc, 40, 35),
      newPlace: clioPaintGetBit(clioPaintState.doc, 140, 35),
      pencilOnInk: (() => { drag([[140, 35]]); return clioPaintGetBit(clioPaintState.doc, 140, 35); })(),
    };
  })()
`);
test.assert(moveRun.drawn === 1 && moveRun.selected === true, "a filled rectangle is drawn and then selected");
test.assert(moveRun.lastStep === "clio_paint_op_move" && moveRun.moves === 1, "pressing inside the selection writes one Move step, not a new marquee");
test.assert(moveRun.oldPlace === 0 && moveRun.newPlace === 1, "and the pixels arrive where they were dragged, gone from where they were");
test.assert(moveRun.stillSelected === false, "choosing another tool puts the selection down");
test.assert(moveRun.pencilOnInk === 0, "the pencil draws white when it starts on a black pixel");

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
