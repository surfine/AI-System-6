// ClioWorks N6 contract: the show, the presenter console and the page overview.
//
// What it holds (the spec is CLIOWORKS-1060-REMAINING-SPEC 一):
//   the show is a full-screen, page-by-page, READ-ONLY projection -- →/Space
//   forward, ← back, Esc and ⌘. out, a click advances, and leaving puts the
//   deck back on the page the writer left it on; the page turn is a direct
//   switch wearing the deck's own arrival fade, and no transition is invented;
//   the presenter layout is a face of the same layer (no new window
//   primitive), with the current page big, the next page small, the notes read
//   from the deck's own model and a wall-clock timer; a second screen is asked
//   for the way window.getScreenDetails defines, and every way it can be
//   refused -- no API, no second screen, a rejected permission -- degrades to
//   the one screen without throwing; the page overview is the deck as a light
//   table outside the show, a click goes back to editing that page, 放映 starts
//   the show on it, and reordering is the deck model's own one named step, so
//   one Undo takes it back.
//
// The layer is shared machinery (features/clio-stage-show.js, must-fix 2): the
// same three features answer on the native pptx surface, so Part 3 opens the
// real corpus P01.pptx through the Lectern adapter in a vm and drives the
// native surface against it -- present, presenter notes from the adapter, the
// overview's one-undo-step reorder -- and the slide content wears the
// document's own fonts, never the UI font.
//
// The whole layer runs here as real code: clio-stage.js (with clio-stage-show.js
// beneath it) and slide-themes.js are evaluated against a real DOM (linkedom)
// with the real edit history and the real translation tables; the menus, the
// shortcut row, the lazy sheet and the floppy boundary are read as source facts.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n6-present");
const clioStageSource = read("app/features/clio-stage.js");
const showSource = read("app/features/clio-stage-show.js");
const nativeSource = read("app/features/clio-stage-native.js");
const bootConfig = read("app/core/config.js");
const nativeStyles = read("styles/84-clio-stage-native.css");
const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const showStyles = read("styles/84-clio-stage-show.css");
const manifestSource = read("tooling/style-manifest.mjs");
const runtimeManifestSource = read("tooling/runtime-manifest.mjs");
const eagerStyles = read("styles/20-reader-docmap.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

/* ---- Part 1: the wiring, read where it is declared ------------------------- */
test.assert(/menu\("presentation", "menu_presentation", \[\s*menuItem\("clio-stage-present", "clio_stage_present", "clio-stage-present"\),/.test(menus),
  "the Presentation menu leads with 放映, and the row names its ⇧⌘P key");
test.assert(/submenu\("menu_view", \[[\s\S]*?menuItem\("clio-stage-cue", "cue_view"\),\s*menuItem\("clio-stage-overview", "clio_stage_overview"\),/.test(menus),
  "显示 ▸ 页面总览 sits at the end of the view submenu, outside the show");
test.assert(/\{ id: "clio-stage-present", key: "p", shift: true, action: "clio-stage-present", display: "⇧⌘P",[^}]*scope: \["clioStage"\] \},/.test(actions),
  "⇧⌘P starts the show and is scoped to ClioStage (⌘P stays the browser's print)");

for (const action of ["clio-stage-present", "clio-stage-overview"]) {
  test.assertIncludes(clioStageSource, `"${action}"`, `ClioStage registers ${action}`);
  test.assertIncludes(menus, `menuItem("${action}"`, `the menu offers ${action}`);
}
test.assert(/case "clio-stage-present":\s*\n\s*return !clioStageShow\.active && !clioStageState\.source\?\.streaming && !!clioStageState\.parsed\?\.slides\?\.length;/.test(clioStageSource),
  "放映 greys while already showing and while the deck is still arriving");
test.assert(/case "clio-stage-overview":\s*\n\s*return !clioStageShow\.active && !!clioStageState\.parsed\?\.slides\?\.length;/.test(clioStageSource),
  "页面总览 greys while the show is up (the overview lives outside it)");
test.assertIncludes(clioStageSource, "&& !source.streaming && !clioStageShow.active && clioStageModel())",
  "the show is read-only: every edit command is refused at clioStageCanEdit's one door");
test.assertIncludes(clioStageSource, "if (clioStageShow.active) return;", "the show layer owns the keyboard while it is up");

// The sheet rides the ClioWorks editors' lazy bundle; the boot never pays.
test.assertIncludes(manifestSource, '"styles/84-clio-write.css", "styles/84-clio-stage-show.css"]', "the show sheet rides the clio-chart lazy bundle");
const styleManifest = await import(`file://${root}/tooling/style-manifest.mjs`);
test.assert(!styleManifest.styleRuntimePaths.includes("styles/84-clio-stage-show.css"),
  "the show sheet is outside the boot style list, so the floppy budget pays nothing");
test.assertIncludes(showStyles, "min-height: var(--touch-primary-min-height);", "every show control is a ≥48px touch point (the spec's ≥44px, with room)");
test.assertIncludes(showStyles, "min-width: 44px;", "the show buttons never fall under 44px wide either");
test.assertIncludes(showStyles, "@media (orientation: portrait), (max-width: 639px)", "phone portrait gets its own console layout (R4)");
test.assertNotIncludes(showStyles, "@keyframes", "no transition is invented for the show: the deck's own arrival fade is reused as-is");
test.assertIncludes(showSource, "host.classList.add(\"is-arriving\")", "a page entering the show wears the arrival fade the deck already has");
test.assertIncludes(eagerStyles, "@keyframes clio-stage-arrive", "the arrival fade itself still lives where it always did, unchanged");
test.assert(/await projector\.requestFullscreen\(\{ navigationUI: "hide", screen \}\);\s*\n\s*show\.projected = true;[\s\S]*?\n\s*source\.mount\(host, show\.index\);\s*\n\s*source\.scale\(host\);/.test(showSource),
  "the projector's page is mounted again once the second screen has taken the element, so the first page fits that screen, not the laptop's");
test.assert(/if \(fullscreen === projector\) \{[\s\S]*?source\.scale\(host\);[\s\S]*?return;/.test(showSource),
  "the projector's page is re-scaled the moment it becomes the full-screen element (fullscreenchange)");

for (const key of [
  "clio_stage_present", "clio_stage_present_exit", "clio_stage_presenter_view", "clio_stage_overview",
  "clio_stage_overview_label", "clio_stage_overview_present", "clio_stage_overview_present_from",
  "clio_stage_show_page", "clio_stage_show_projected", "clio_stage_show_projection_unavailable",
]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}
const tableOf = (source) => { const ctx = { window: {} }; vm.runInNewContext(source, ctx); return Object.values(ctx.window)[0]; };
const zhTable = tableOf(zh);
const enTable = tableOf(en);
test.assert(zhTable.clio_stage_present === "放映" && zhTable.clio_stage_present_exit === "结束放映"
  && zhTable.clio_stage_presenter_view === "演讲者视图" && zhTable.clio_stage_overview === "页面总览",
  "the zh nouns are the ones the deck's surfaces already use");
test.assert(zhTable.clio_stage_show_page(4, 18) === "第 4 / 18 页" && enTable.clio_stage_show_page(4, 18) === "Page 4 of 18",
  "the console's page counter reads the same in both languages");

/* ---- Part 1b: one show layer, both stage surfaces (must-fix 2) -------------- */
// The layer itself is one module both surfaces drive; the boot never pays for it.
test.assertIncludes(runtimeManifestSource, '"app/features/clio-stage-show.js",', "the show machinery is its own lazy module");
test.assertIncludes(bootConfig, '"app/features/clio-stage-show.js", "app/features/clio-stage.js"', "the Markdown ClioStage's loader names the show module before it");
test.assertIncludes(bootConfig, '"app/features/clio-stage-show.js", "app/features/clioworks-rail.js", "app/features/clio-stage-native.js"', "so does the native surface's (with the shared 旁注栏 between them, D2)");
test.assertIncludes(showSource, "root.AISystem6ClioStageShow = Object.freeze({ create, overview });",
  "the shared module hands out the show layer and the overview light table, nothing else");
// The native surface answers 放映 and 页面总览 by the names the ClioStage set
// already registered; the Markdown chrome delegates both while a presentation
// is mounted, in the one editing mode.
test.assertIncludes(nativeSource, "id: 'present', labelKey: 'clio_stage_present', shortcut: '⇧⌘P'",
  "the native session lists 放映 with its ⇧⌘P key");
test.assertIncludes(nativeSource, "id: 'page.overview', labelKey: 'clio_stage_overview'",
  "and 页面总览 beside it");
test.assertIncludes(nativeSource, "menuItem('clio-stage-present', 'clio_stage_present', 'clio-stage-present')",
  "the native presentation menu leads with 放映, naming the ⇧⌘P row");
test.assertIncludes(nativeSource, "menuItem('clio-stage-overview', 'clio_stage_overview')",
  "and offers 页面总览 in the same menu");
test.assertIncludes(nativeSource, "if (action === 'clio-stage-present') return active.session.commandState('present').enabled;",
  "the native module answers the delegated availability");
test.assertIncludes(nativeSource, "if (action === 'clio-stage-present') return active.surface.runCommand('present');",
  "and the delegated run");
test.assertIncludes(clioStageSource, "window.AISystem6ClioStageNative.commandAvailable?.(action) === true",
  "clio-stage.js hands 放映/总览 availability to the native surface while it owns the window");
test.assertIncludes(clioStageSource, "window.AISystem6ClioStageNative.runCommand?.(action)",
  "and hands the two runs over with it");
// The overview's drag is one named undo step in the adapter's own model.
test.assertIncludes(nativeSource, "adapter.transact('slide-move'",
  "the overview's reorder is one named transaction in the adapter (one Undo takes it back)");
for (const key of ["clio_stage_native_step_slide_move", "clio_stage_native_reason_reorder"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}
// Must-fix 9: the slide's own text wears the document's fonts with stand-ins;
// the UI font stays on the chrome (the placeholder label is the surface's own).
test.assert(!/:is\([^)]*\) \.csn-page \{[^}]*--ui-font/.test(nativeStyles),
  "the slide's page rule no longer wears the UI font (must-fix 9)");
test.assertIncludes(nativeStyles, 'font-family: var(--font, Arial, "Arimo", sans-serif);',
  "runs wear the document's own font stack with the suite's stand-ins");
test.assert(/\.csn-placeholder-label \{[^}]*font-family: var\(--ui-font\);/.test(nativeStyles),
  "the placeholder label stays chrome: the UI font survives only there");
test.assertIncludes(nativeStyles, ".clio-stage-native-show",
  "the native show layer scopes the page rules on the desk");

/* ---- Part 2: the layer itself, as real code on a real DOM ------------------ */
const DECK = `---
marp: true
theme: default
size: 16:9
---
<!-- clio-deck: {"mode":"briefing","era":"classic","canvas":"16:9","reading":"balanced"} -->

<!-- _class: cover hero -->

# One

<!-- notes: 讲第一页的引子 -->

---

<!-- _class: columns light -->

## Two

- a

<!-- notes: 第二页讲两件事 -->

---

<!-- _class: closing hero -->

## Three
`;
const escapeForTest = (value) => String(value === null || value === undefined ? "" : value)
  .replace(/&/g, "&amp;").replace(/</, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const markup = `<html><body><section class="window clio-stage-window is-active" data-window="clioStage">
    <div class="title-bar"><h2 id="clio-stage-title">ClioStage</h2></div>
    <div class="details-bar clio-stage-details-bar"><span id="clio-stage-status"></span><span id="clio-stage-meta"></span></div>
    <div class="window-pane clio-stage-pane">
      <div class="window-toolbar clio-stage-toolbar">
        <div class="button-row clio-stage-controls"><button id="clio-stage-prev"></button><span id="clio-stage-page"></span><button id="clio-stage-next"></button></div>
        <div class="view-switch clio-stage-view-switcher"><button id="clio-stage-source-view"></button><button id="clio-stage-document-view"></button><button id="clio-stage-slide-view"></button><button id="clio-stage-cue-view"></button></div>
      </div>
      <div id="clio-stage-viewport" class="clio-stage-viewport window-frame-scroller" tabindex="0"></div>
      <form id="clio-stage-ask-form" class="ask-bar"><div class="ask-bar-row"><button id="clio-stage-docmap"></button><input id="clio-stage-question"></input><button id="clio-stage-ask-button"></button></div></form>
    </div></section></body></html>`;

async function makeWorld() {
  const linkedom = await import("linkedom");
  const { window: win, document: doc } = linkedom.parseHTML(markup);
  const themeContext = {
    window: {},
    console,
    currentLanguage: "zh",
    escapeHtml: escapeForTest,
    markdownToSystemHtml: (markdown) => `<p>${String(markdown).trim()}</p>`,
  };
  vm.runInNewContext(read("app/features/slide-themes.js"), themeContext);
  const status = [];
  const registered = {};
  const intervals = [];
  const clock = { now: 1700000000000 };
  const RealDate = Date;
  class LayerDate extends RealDate {
    static now() { return clock.now; }
  }
  const context = {
    window: win,
    document: doc,
    console,
    currentLanguage: "zh",
    Date: LayerDate,
    t: (key, ...args) => {
      const value = zhTable[key] ?? enTable[key] ?? key;
      return typeof value === "function" ? value(...args) : value;
    },
    escapeHtml: escapeForTest,
    markdownToSystemHtml: (markdown) => `<p>${String(markdown).trim()}</p>`,
    normalizeMarkdownText: (markdown) => String(markdown || "").replace(/\r\n?/g, "\n"),
    setStatus: (message) => { status.push(String(message)); },
    updateMenuState: () => {},
    syncDocMapEntryButton: () => {},
    chooseDocMapSourceCandidate: () => null,
    docMapSourceWithRange: () => null,
    registerAskBarSource: () => {},
    registerEditHistory: () => {},
    chatFiles: [],
    markDeskDirty: () => {},
    saveDeskState: () => {},
    renderDocuments: () => {},
    renderProjectDisks: () => {},
  };
  win.setInterval = (callback) => { intervals.push(callback); return intervals.length; };
  win.clearInterval = () => {};
  if (typeof win.getComputedStyle !== "function") {
    win.getComputedStyle = () => ({ getPropertyValue: () => "", paddingBottom: "0px", fontSize: "16px" });
  }
  win.AISystem6SlideThemes = themeContext.window.AISystem6SlideThemes;
  win.AISystem6Runtime = { registerApplication: (app) => { registered[app.id] = app; } };
  context.__part = "vm-part2";
  vm.runInContext(read("app/core/edit-history.js"), vm.createContext({ window: win, console }));
  vm.createContext(context);
  // The show layer is shared machinery beneath clio-stage.js (must-fix 2); it
  // reads t through the window, as the desk's scripts do.
  win.t = context.t;
  // strings.js ships ahead of the stage module: clioStageMountPage assembles
  // its page shell through the html`` helper.
  vm.runInContext(read("app/core/strings.js"), context);
  vm.runInContext(showSource, context);
  vm.runInContext(clioStageSource, context);
  const stage = win.AISystem6ClioStage;
  const opened = await stage.load({ markdown: DECK, title: "季度汇报.md", temporary: true });
  if (opened !== true) throw new Error("the deck did not open in the layer world");
  return { win, doc, stage, status, intervals, clock, registered, context };
}

const stateOf = (world, expression) => vm.runInContext(expression, world.context);
// The pages mount inside their hosts' shadow roots; a light-DOM query never
// sees them, so the test reads through the host the way the desk does.
const printedPages = (world, scope) => [...world.doc.querySelectorAll(`${scope} .clio-stage-page-host`)]
  .filter((host) => host.shadowRoot)
  .flatMap((host) => [...host.shadowRoot.querySelectorAll("section.clio-print-page")]);

const press = (world, target, key, { metaKey = false, altKey = false } = {}) => {
  const event = new world.win.Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(event, { key, metaKey, altKey, ctrlKey: false, shiftKey: false, isComposing: false });
  target.dispatchEvent(event);
  return event;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

{
  const world = await makeWorld();
  const { win, doc, stage, status, intervals, clock, registered } = world;

  // 1. The show starts on the page the deck is on: one overlay, not a window.
  test.assert((await stage.startShow()) === true && stage.showState().active === true, "放映 starts");
  const root = doc.querySelector(".clio-stage-show");
  test.assert(!!root && root.parentElement === doc.body, "the show is one overlay this module owns on the desk -- no window primitive is added");
  test.assert(root.getAttribute("aria-label") === zhTable.clio_stage_present, "the overlay is named 放映 for assistive tech");
  test.assert(printedPages(world, ".clio-stage-show-audience").length === 1, "the audience face mounts the printed page");
  test.assert(doc.querySelector(".clio-stage-show-counter").textContent === "第 1 / 3 页", "the counter names the page");

  // 2. The keyboard: →/Space forward, ← back, the ends hold; the deck beneath does not move.
  press(world, root, "ArrowRight");
  test.assert(stage.showState().index === 1, "→ turns to the next page");
  press(world, root, " ");
  test.assert(stage.showState().index === 2, "Space advances too");
  press(world, root, "ArrowRight");
  test.assert(stage.showState().index === 2, "the last page holds");
  press(world, root, "ArrowLeft");
  test.assert(stage.showState().index === 1, "← goes back");
  test.assert(stateOf(world, "clioStageState.index") === 0, "the deck itself stays on the page the writer left (the window route stood down)");
  doc.querySelector(".clio-stage-show-audience").dispatchEvent(new win.Event("click", { bubbles: true }));
  test.assert(stage.showState().index === 2, "a click on the stage advances, the way a show has always gone");

  // 3. Read-only: the deck's text cannot be touched from the show.
  const markdownBefore = stateOf(world, "clioStageState.source.markdown");
  test.assert(stage.canEdit() === false, "no edit session can open while the show is up");
  test.assert(stage.addSlide() === false && stage.duplicateSlide() === false && stage.deleteSlide() === false && stage.movePage(0, 1) === false,
    "the deck's page commands are all refused");
  test.assert(stateOf(world, "clioStageState.source.markdown") === markdownBefore,
    "turning pages and refusing edits never touches the deck's Markdown");

  // 4. Esc and ⌘. both end the show, and the deck returns to the page it was left on.
  press(world, root, "Escape");
  test.assert(stage.showState().active === false && !doc.querySelector(".clio-stage-show"), "Esc ends the show and takes the overlay down");
  test.assert(stateOf(world, "clioStageState.index") === 0, "the deck is back where the writer left it (原位)");
  test.assert(stage.canEdit() === true, "editing is possible again the moment the show is down");
  await stage.startShow();
  press(world, doc.querySelector(".clio-stage-show"), ".", { metaKey: true });
  test.assert(stage.showState().active === false, "⌘. ends the show too, the key the page view closes with");

  // 5. The presenter console without any second-screen API: the whole stage, nothing thrown.
  await stage.startShow();
  test.assert(doc.querySelector(".clio-stage-show-projector").hidden === true, "no projector exists until a second screen takes it");
  let threw = false;
  try { await stage.setShowLayout("presenter"); } catch (error) { threw = true; }
  test.assert(threw === false, "switching the presenter console on never throws, with or without the API");
  test.assert(stage.showState().layout === "presenter" && stage.showState().projected === false,
    "with no window.getScreenDetails the console is the whole stage (single screen), degraded silently");
  test.assert(!!doc.querySelector(".clio-stage-show-console"), "the console is drawn: current page big");
  test.assert(printedPages(world, ".clio-stage-show-console").length === 2,
    "the current page and the next page are both mounted, the next one small");
  const notesAt = (index) => stage.parse(stateOf(world, "clioStageState.source.markdown")).slideMeta[index].notes;
  test.assert(doc.querySelector(".clio-stage-show-notes-body").innerHTML === `<p>${notesAt(0)}</p>`,
    "the notes come from the deck's own model for the page in front");
  press(world, doc.querySelector(".clio-stage-show"), "ArrowRight");
  test.assert(doc.querySelector(".clio-stage-show-notes-body").innerHTML === `<p>${notesAt(1)}</p>`,
    "turning the page turns the notes with it");
  clock.now += 65000;
  intervals.forEach((tick) => tick());
  test.assert(doc.querySelector(".clio-stage-show-timer").textContent === "01:05", "the timer counts the talk from the moment the show started");

  // 6. A second screen, the way the Window Management API defines it.
  stage.endShow();
  await stage.startShow();
  const screenA = { isPrimary: true };
  const screenB = { isExtended: true };
  const fullscreenCalls = [];
  const projector = doc.querySelector(".clio-stage-show-projector");
  projector.requestFullscreen = (options) => { fullscreenCalls.push(options); return Promise.resolve(); };
  win.getScreenDetails = async () => ({ currentScreen: screenA, screens: [screenA, screenB] });
  await stage.setShowLayout("presenter");
  test.assert(stage.showState().projected === true && projector.hidden === false,
    "a second screen takes the audience's page automatically, full screen");
  test.assert(fullscreenCalls.length === 1 && fullscreenCalls[0].screen === screenB,
    "the projection names the other screen in requestFullscreen, the API's own option");
  test.assert(status.at(-1) === zhTable.clio_stage_show_projected, "the status line says the deck is projected");
  press(world, doc.querySelector(".clio-stage-show"), "ArrowRight");
  await settle();
  test.assert(fullscreenCalls.length === 1 && printedPages(world, ".clio-stage-show-projector").length === 1,
    "turning a page re-mounts the projector's copy without re-asking for the screen");
  await stage.setShowLayout("audience");
  test.assert(stage.showState().projected === false, "switching the console off stops the projection");

  // 7. Every refusal degrades to the one screen without throwing.
  stage.endShow();
  await stage.startShow();
  win.getScreenDetails = async () => ({ currentScreen: screenA, screens: [screenA] });
  doc.querySelector(".clio-stage-show-projector").requestFullscreen = (options) => { fullscreenCalls.push(options); return Promise.resolve(); };
  await stage.setShowLayout("presenter");
  test.assert(stage.showState().projected === false && fullscreenCalls.length === 1, "no second screen: no projection, no error");
  stage.endShow();
  await stage.startShow();
  doc.querySelector(".clio-stage-show-projector").requestFullscreen = (options) => { fullscreenCalls.push(options); return Promise.resolve(); };
  win.getScreenDetails = async () => { throw new Error("NotAllowedError: permission denied"); };
  threw = false;
  try { await stage.setShowLayout("presenter"); } catch (error) { threw = true; }
  test.assert(threw === false && stage.showState().projected === false, "a refused permission degrades to the single screen, nothing thrown");
  test.assert(status.at(-1) === zhTable.clio_stage_show_projection_unavailable, "the refusal says where the console stayed");
  stage.endShow();

  // 8. Esc leaving the browser's full screen ends the audience show (the layer listens).
  const originalCreateElement = doc.createElement.bind(doc);
  doc.createElement = (tag, options) => {
    const element = originalCreateElement(tag, options);
    element.requestFullscreen = () => {
      doc.fullscreenElement = element;
      return Promise.resolve();
    };
    return element;
  };
  await stage.startShow();
  doc.createElement = originalCreateElement;
  await settle();
  const showRoot = doc.querySelector(".clio-stage-show");
  test.assert(doc.fullscreenElement === showRoot, "(setup) the layer's own full screen is up");
  doc.fullscreenElement = null;
  doc.dispatchEvent(new win.Event("fullscreenchange"));
  test.assert(stage.showState().active === false, "Esc leaving full screen (the browser's exit) ends the show through fullscreenchange");

  // 9. The overview: the deck as a light table, outside the show.
  stage.setMode("overview");
  const cards = [...doc.querySelectorAll(".clio-stage-overview-card")];
  test.assert(cards.length === 3, "every page is on the table");
  test.assert(printedPages(world, ".clio-stage-overview-grid").length === 3,
    "each thumbnail is the printed page itself, scaled");
  cards[1].dispatchEvent(new win.Event("click", { bubbles: true }));
  test.assert(stateOf(world, "clioStageState.index") === 1 && stateOf(world, "clioStageState.mode") === "slide",
    "a click goes back to editing on that page");
  stage.setMode("overview");

  // Reordering is the deck model's own one named step; a plain arrow is not it.
  const orderBefore = stateOf(world, "clioStageState.source.markdown");
  const orderOf = () => stage.parse(stateOf(world, "clioStageState.source.markdown")).slides;
  press(world, [...doc.querySelectorAll(".clio-stage-overview-card")][0], "ArrowRight");
  test.assert(orderOf()[0].includes("# One"), "a plain → on a card is nothing (the reorder needs Alt)");
  press(world, [...doc.querySelectorAll(".clio-stage-overview-card")][0], "ArrowRight", { altKey: true });
  test.assert(orderOf()[0].includes("## Two") && orderOf()[1].includes("# One") && orderOf().length === 3,
    "Alt+→ moves the first page after the second (the deck model's own move)");
  test.assert(stage.canUndo() === true && stateOf(world, "clioStageState.history.undoLabel()") === "edit_step_move_page",
    "the reorder is one named step, the same one the rail uses");
  stage.undo();
  test.assert(stateOf(world, "clioStageState.source.markdown") === orderBefore, "one Undo takes the reorder back");

  // 放映 from a card starts the show on that page.
  stage.setMode("overview");
  const presentButtons = [...doc.querySelectorAll(".clio-stage-overview-present")];
  presentButtons[2].dispatchEvent(new win.Event("click", { bubbles: true }));
  await settle();
  test.assert(stage.showState().active === true && stage.showState().index === 2, "the overview's 放映 starts the show on that page");
  stage.endShow();

  // 10. The console's own 总览 button leaves the show and lands on the page it was on.
  await stage.startShow();
  await stage.setShowLayout("presenter");
  press(world, doc.querySelector(".clio-stage-show"), "ArrowRight");
  const overviewButton = [...doc.querySelectorAll(".clio-stage-show-button")].find((button) => button.textContent === zhTable.clio_stage_overview);
  test.assert(!!overviewButton, "the presenter console carries a 页面总览 button");
  overviewButton.dispatchEvent(new win.Event("click", { bubbles: true }));
  test.assert(stage.showState().active === false && stateOf(world, "clioStageState.mode") === "overview"
    && stateOf(world, "clioStageState.index") === 1,
    "it ends the show and opens the overview on the page the show was on");

  // 11. The menu rows answer through the registered availability, real function, real DOM.
  const presentAvailable = registered.clioStage.commands["clio-stage-present"].isAvailable;
  test.assert(presentAvailable() === true, "with the deck open and the show down, 放映 is live");
  await stage.startShow();
  test.assert(presentAvailable() === false, "放映 is grey while the show is up");
  test.assert(registered.clioStage.commands["clio-stage-overview"].isAvailable() === false,
    "页面总览 is grey while the show is up (the overview lives outside it)");
  stage.endShow();
  test.assert(presentAvailable() === true, "and live again the moment it is down");
}

/* ---- Part 3: the same three features on the native pptx surface (must-fix 2) - */
// P01.pptx opens through the real Lectern adapter in its own vm (the corpus
// path the R1 gate uses); the native surface mounts on a real DOM with that
// adapter as its one model, and the show, the presenter notes and the
// overview's reorder all read the adapter.
const P01_BYTES = new Uint8Array(readFileSync(join(root, "tests/fixtures/real-corpus/pptx/P01.pptx")));

async function openP01Adapter(bytes = P01_BYTES, name = "P01.pptx") {
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/lectern-adapter.js"]);
  ctx.__bytes = bytes;
  ctx.__name = name;
  return vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__bytes, { name: globalThis.__name })", ctx);
}

async function makeNativeWorld(adapter, name = "P01.pptx") {
  const linkedom = await import("linkedom");
  const { window: win, document: doc } = linkedom.parseHTML(`<html><body><section class="window clio-stage-window is-active" data-window="clioStage">
    <div class="title-bar"><h2 id="clio-stage-title">ClioStage</h2></div>
    <div class="window-pane clio-stage-pane"></div>
  </section></body></html>`);
  win.document = doc;
  win.openWindow = async () => {};
  win.t = (key, ...args) => {
    const value = zhTable[key] ?? enTable[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  };
  const saved = { window: globalThis.window, document: globalThis.document, part: globalThis.__part };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.__part = "part3";
  try {
    // linkedom's parseHTML windows share one property store: part 2's vm world
    // already installed the show module on it, and that instance would answer
    // with the wrong document. Start both evals from a clean slate.
    delete win.AISystem6ClioStageShow;
    delete globalThis.AISystem6ClioStageShow;
    delete win.AISystem6ClioStageNative;
    delete globalThis.AISystem6ClioStageNative;
    delete win.AISystem6ClioWorksRail;
    delete globalThis.AISystem6ClioWorksRail;
    (0, eval)(read("app/features/clio-stage-show.js"));
    // D2: the shared 旁注栏 rides the native loader ahead of the surface (config.js).
    (0, eval)(read("app/features/clioworks-rail.js"));
    (0, eval)(read("app/features/clio-stage-native.js"));
    const native = win.AISystem6ClioStageNative;
    const opened = await native.open({ liveAdapter: adapter, mountedName: name, fileName: name }, {});
    if (!opened.ok) throw new Error(`the native surface did not mount on ${name} (${opened.reason})`);
    return {
      win,
      doc,
      native,
      restore: () => { globalThis.window = saved.window; globalThis.document = saved.document; globalThis.__part = saved.part; },
    };
  } catch (error) {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    throw error;
  }
}

const pressOn = (world, target, key, { metaKey = false, altKey = false } = {}) => {
  const event = new world.win.Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(event, { key, metaKey, altKey, ctrlKey: false, shiftKey: false, isComposing: false });
  target.dispatchEvent(event);
  return event;
};

{
  const adapter = await openP01Adapter();
  const world = await makeNativeWorld(adapter);
  const { win, doc, native } = world;
  try {
    // The delegated rows answer before anything is on screen.
    test.assert(native.commandAvailable("clio-stage-present") === true, "the native surface answers 放映");
    test.assert(native.commandAvailable("clio-stage-overview") === true, "and 页面总览");

    // The window's chrome (owner rulings D1 / S1 / ⑤, 2026-10-29).
    test.assert(doc.querySelector("#clio-stage-title").textContent === "P01.pptx", "S1: the title names the presentation only");
    const bar = doc.querySelector(".csn-status");
    test.assert(!!bar.querySelector(".csn-view-pop") && !!bar.querySelector('[data-margin-rail-slot="clioStage"]') && !!bar.querySelector(".csn-receipt"),
      "S1: one document bar — the view pop-up, the margin-notes rail's named slot, the save state");
    test.assert(bar.querySelector(".csn-view-pop").textContent === zhTable.clio_stage_native_view_edit
      && ![...doc.querySelectorAll(".clio-stage-native button")].some((button) => [zhTable.clio_stage_native_commands, zhTable.clio_stage_native_mode_express, zhTable.clio_stage_native_mode_full].includes(button.textContent)),
      "D1: the view reads 编辑; no mode switch and no 「命令…」 pop-up in the window");
    const caption = doc.querySelector(".csn-caption");
    test.assert(caption.textContent.startsWith(zhTable.clio_stage_native_status_page(1, 2)) && !caption.textContent.includes("Express") && !caption.textContent.includes("⌘")
      && caption.dataset.balloonHelp === "clio_stage_native_balloon_status",
      `⑤: the status bar says state only (${caption.textContent}); how to turn pages is its Balloon Help`);
    // D2: the 旁注栏 on the page's right, with the one tab ClioStage supports (批注);
    // ⌘M opens it on that tab and draws this page's list there, not in a windoid.
    {
      const rails = doc.querySelectorAll('[data-window="clioStage"] .doc-rail');
      const toggle = bar.querySelector('[data-margin-rail-slot="clioStage"] .doc-rail-toggle');
      const tabs = rails[0] ? [...rails[0].querySelectorAll('.system-tabs[role="tablist"] > .system-tab')].map((tab) => tab.dataset.railTab) : [];
      test.assert(rails.length === 1 && !!toggle && tabs.join(" ") === "comments" && rails[0].hidden && rails[0].parentNode === doc.querySelector(".csn-body"),
        `D2: one rail beside the page, collapsed to its toggle, with ClioStage's one tab 批注 (${tabs.join(" ")})`);
      pressOn(world, doc.querySelector(".csn-page") || doc.querySelector(".clio-stage-native"), "m", { metaKey: true });
      await settle();
      const panel = rails[0].querySelector('[data-rail-panel="comments"]');
      test.assert(!rails[0].hidden && !panel.hidden && !!panel.querySelector(".windoid-composer") && !doc.querySelector(".windoid.csn-comments-windoid"),
        "D2: ⌘M opens the rail on 批注 with the page's comment list; no floating windoid");
      // The docked list follows the page however it turns: the overview's card
      // (like the show's end and a find match) moves the page without a rail click.
      const listedPage = () => [panel.querySelector(".doc-rail-title").textContent, panel.querySelector(".windoid-composer textarea")?.placeholder || ""];
      const pickCard = async (index) => {
        await native.runCommand("clio-stage-overview");
        doc.querySelectorAll(".clio-stage-overview-card")[index].dispatchEvent(new win.Event("click", { bubbles: true }));
        await settle();
      };
      await pickCard(1);
      const [title2, place2] = listedPage();
      test.assert(title2.includes("第 2 页") && place2 === zhTable.clio_stage_native_comment_on_page(2),
        `D2: after the overview turns to page 2 the 批注 list and its composer are page 2's (${title2} / ${place2})`);
      await pickCard(0);
      test.assert(listedPage()[0].includes("第 1 页"), "and back on page 1 the list is page 1's again");
      toggle.dispatchEvent(new win.Event("click", { bubbles: true }));
      test.assert(rails[0].hidden && toggle.getAttribute("aria-expanded") === "false", "D2: the toggle folds the rail away again");
    }

    // The show runs from the adapter: its page count, its pages, drawn at the
    // file's own geometry.
    test.assert((await native.runCommand("clio-stage-present")) === true, "⇧⌘P on the native surface starts the show");
    await settle();
    const showRoot = doc.querySelector(".clio-stage-show");
    test.assert(!!showRoot && showRoot.classList.contains("clio-stage-native-show"), "the shared layer comes up over the native surface");
    test.assert(doc.querySelector(".clio-stage-show-counter").textContent === "第 1 / 2 页", "the counter reads the adapter's page count");
    const audiencePage = doc.querySelector(".clio-stage-show-audience .clio-stage-page-host .csn-page");
    test.assert(!!audiencePage && audiencePage.textContent.includes("Title of the first slide"), "the audience face draws the adapter's first page");
    const run = doc.querySelector(".clio-stage-show-audience .csn-run");
    test.assert(!!run && run.style.getPropertyValue("--font") === 'Arial,"Arimo",sans-serif',
      "slide text wears the document font stack with its stand-ins, never the UI font");

    // The sequence follows the adapter.
    pressOn(world, showRoot, "ArrowRight");
    test.assert(doc.querySelector(".clio-stage-show-counter").textContent === "第 2 / 2 页", "→ turns to the adapter's second page");
    test.assert(doc.querySelector(".clio-stage-show-audience .csn-page").textContent.includes("This is the second slide"),
      "the second page is the adapter's own");

    // The presenter console: the notes come from the adapter, for the page in front.
    [...doc.querySelectorAll(".clio-stage-show-button")].find((button) => button.textContent === zhTable.clio_stage_presenter_view)
      .dispatchEvent(new win.Event("click", { bubbles: true }));
    await settle();
    await settle();
    test.assert(doc.querySelector(".clio-stage-show-notes-body").textContent === adapter.notes(adapter.slides()[1].id),
      "the presenter's notes are the adapter's notes for the page in front");

    // The overview lives outside the show: greyed, and a direct run refuses.
    test.assert(native.commandAvailable("clio-stage-overview") === false, "页面总览 greys while the show is up");
    test.assert(native.runCommand("clio-stage-overview") === false && !doc.querySelector(".csn-overview"),
      "and a direct run is refused under the layer");
    // The console's own 总览 button leaves the show and opens the light table.
    [...doc.querySelectorAll(".clio-stage-show-button")].find((button) => button.textContent === zhTable.clio_stage_overview)
      .dispatchEvent(new win.Event("click", { bubbles: true }));
    await settle();
    test.assert(!doc.querySelector(".clio-stage-show") && !!doc.querySelector(".csn-overview"),
      "the console's 总览 ends the show and opens the overview");
    test.assert(doc.querySelector(".csn-view-pop").textContent === zhTable.clio_stage_overview, "the document bar's view pop-up follows: 总览");
    const cards = [...doc.querySelectorAll(".clio-stage-overview-card")];
    test.assert(cards.length === adapter.slides().length, "every adapter page is on the table");
    test.assert(doc.querySelectorAll(".clio-stage-overview-room .csn-page").length === 2, "the thumbnails are the drawn pages");

    // Reordering is one named undo step in the adapter's own model.
    const firstIdBefore = adapter.slides()[0].id;
    pressOn(world, cards[0], "ArrowRight", { altKey: true });
    test.assert(adapter.slides()[0].id !== firstIdBefore && adapter.slides()[1].id === firstIdBefore,
      "Alt+→ moves the first page after the second");
    test.assert(native.editHistory().undoLabel() === "clio_stage_native_step_slide_move" && zhTable.clio_stage_native_step_slide_move === "移动页面",
      "the undo step is the deck's own named 移动页面");
    test.assert(adapter.canUndo() === true, "one undo step stands");
    adapter.undo();
    test.assert(adapter.slides()[0].id === firstIdBefore && !adapter.canUndo(), "one Undo takes the reorder back");

    // Esc closes the light table; the menu row opens it again.
    pressOn(world, doc.querySelector(".csn-overview"), "Escape");
    test.assert(!doc.querySelector(".csn-overview"), "Esc closes the overview");
    await native.runCommand("clio-stage-overview");
    test.assert(!!doc.querySelector(".csn-overview"), "and the delegated row opens it again");

    // 放映 from a card starts the show on that page; Esc ends it.
    [...doc.querySelectorAll(".clio-stage-overview-present")][1].dispatchEvent(new win.Event("click", { bubbles: true }));
    await settle();
    test.assert(!!doc.querySelector(".clio-stage-show") && doc.querySelector(".clio-stage-show-counter").textContent === "第 2 / 2 页",
      "the card's 放映 starts the show on that page");
    pressOn(world, doc.querySelector(".clio-stage-show"), "Escape");
    test.assert(!doc.querySelector(".clio-stage-show"), "Esc ends the show");
  } finally {
    world.restore();
  }
}

// The lock marker: P01 holds only text, so a deck with a group or a table (P02)
// proves that a part the surface cannot edit is drawn framed, named and locked.
{
  const adapter = await openP01Adapter(new Uint8Array(readFileSync(join(root, "tests/fixtures/real-corpus/pptx/P02.pptx"))), "P02.pptx");
  const world = await makeNativeWorld(adapter, "P02.pptx");
  const { doc, native } = world;
  try {
    let frames = [];
    for (const slide of adapter.slides()) {
      native.findContext().select({ locator: { slide: slide.id } });
      await settle();
      frames = [...doc.querySelectorAll(".clio-stage-native .csn-page .csn-shape.is-placeholder")];
      if (frames.length) break;
    }
    test.assert(frames.length > 0, "P02 puts a part the surface cannot edit on the page");
    test.assert(frames.every((frame) => frame.dataset.balloonHelp === "clio_stage_native_lock_object" && !!frame.querySelector(".doc-lock")),
      "a part the surface cannot edit carries its lock in place");
  } finally {
    world.restore();
  }
}

test.finish();
