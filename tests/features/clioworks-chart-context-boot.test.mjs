// The chart copy's context strip on the ORDINARY desk (no design-lab fixture):
// boots the real eager module set in the app boot VM, opens ClioChart the way
// the desk does, and drives the strip through the wiring's own trigger path.
//
//  1. Eager side: the loader the trigger calls is in the boot bundle; the kit
//     and the v5.1 modules are not — they are lazy and a loader names them.
//  2. Ordinary path: the strip appears inside the clioChart window, exactly
//     once; 「编辑副本」 is enabled; embed.edit opens a copy (frameState leaves
//     idle) and a second embed.edit is refused FRAME_ACTIVE; a cell edited in
//     the copy and adopted lands in the engine's table, the frame returns to
//     idle, and the engine's own undo restores the original value.
//  3. With a fixture parameter the ordinary wiring stands aside (no double mount).
//  4. Opening the window again still leaves one strip.
//
// Two minimal shim patches, both because the boot VM's DOM is not a layout
// engine and not a class hierarchy (tests/helpers/app-boot-vm.mjs):
//  - getClientRects(): the kit's roving focus (vendor/clioworks-v3/dom.js
//    `visible`) asks every strip button for its layout boxes. Shim elements
//    have no layout, so each one answers an empty list (= not laid out), which
//    is what a real browser answers for an element with no boxes.
//  - Node[Symbol.hasInstance]: the kit's `h()` appends a child as an element
//    only when `child instanceof Node`; the harness's Node is an empty class,
//    so every shim element would be stringified to "[object Object]". The
//    patch answers true for shim elements (objects with a tagName) and text
//    nodes (nodeType), nothing else.
// Neither patch replaces app code: the adapter, frame session, strip and the
// ClioChart engine below are the real vendored and feature modules.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { appRuntimePaths, lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("clioworks-chart-context-boot");

const KIT_AND_V51 = [
  "app/vendor/clioworks-v3/core.js",
  "app/vendor/clioworks-v3/dom.js",
  "app/vendor/clioworks-v3/components.js",
  "app/vendor/clioworks-v3/more-menu.js",
  "app/vendor/clioworks-v3/chart-adapter.js",
  "app/vendor/clioworks-v3/ui-model.js",
  "app/vendor/clioworks-v3/frame-session.js",
  "app/vendor/clioworks-v3/runtime-port.js",
  "app/vendor/clioworks-v3/context-strip.js",
  "app/vendor/clioworks-v3/chart-frame-port.js",
];
const WIRING = "app/features/clio-chart-context.js";

// --- 1. what the boot bundle carries ---------------------------------------
const eagerSource = appRuntimePaths.map((path) => read(path)).join("\n");
test.assert(/function ensureClioChartContextModule\s*\(/.test(eagerSource),
  "the boot bundle defines the loader the chart's trigger calls (ensureClioChartContextModule)");
for (const path of [...KIT_AND_V51, WIRING]) {
  test.assert(!appRuntimePaths.includes(path), `${path} is not in the eager bundle`);
  test.assert(lazyRuntimePaths.includes(path), `${path} is a lazy runtime path`);
}
// The loaders that name them, read from config.js rather than copied here.
const configSource = read("app/core/config.js");
const loaderLists = [...configSource.matchAll(/createLazyModuleLoader\(\s*"([^"]+)"\s*,\s*\[([^\]]*)\]/g)]
  .map((match) => ({ flag: match[1], sources: [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]) }));
const namedLazy = new Set(loaderLists.flatMap((entry) => entry.sources));
for (const path of [...KIT_AND_V51, WIRING]) {
  test.assert(namedLazy.has(path), `a config.js loader names ${path}`);
}
const chartTrigger = read("app/features/clio-chart.js");
test.assert(chartTrigger.includes("ensureClioChartContextModule"),
  "ClioChart's own module is the trigger that asks for the strip");

// --- the VM ---------------------------------------------------------------
const isShimNode = (value) => !!value && typeof value === "object" && (typeof value.tagName === "string" || typeof value.nodeType === "number");

async function bootDesk(search = "") {
  const vm = createAppBootVm({ location: { href: `http://localhost/${search}`, reload: () => {}, search } });
  Object.defineProperty(vm.window.Node, Symbol.hasInstance, { value: isShimNode });
  const createElement = vm.document.createElement;
  vm.document.createElement = (tag) => {
    const el = createElement(tag);
    if (typeof el.getClientRects !== "function") el.getClientRects = () => [];
    return el;
  };
  const loaded = [];
  const headAppend = vm.document.head.append;
  vm.document.head.append = (...nodes) => {
    nodes.forEach((node) => {
      if (String(node?.tagName || "").toLowerCase() === "script") loaded.push(String(node.src || "").split("?")[0]);
    });
    return headAppend.apply(vm.document.head, nodes);
  };
  await vm.settleBoot();
  return { vm, loaded };
}

const chartWindow = (vm) => vm.document.querySelector('[data-window="clioChart"]');
const strips = (vm) => chartWindow(vm)?.querySelectorAll(".cw5-context") || [];
const click = (el) => el.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });

const TABLE = "| 地区 | 销量 | 成本 |\n| --- | --- | --- |\n| 北区 | 10 | 4 |\n| 南区 | 20 | 7 |";

// --- 2. the ordinary path ---------------------------------------------------
{
  const { vm, loaded } = await bootDesk("");
  test.assert(typeof vm.window.ensureClioChartContextModule === "function",
    "after boot the loader is callable");
  test.assert(!vm.window.ClioWorksContextStrip && !vm.window.ClioWorksChart && !vm.window.AISystem6ClioChartContext,
    "after boot no kit, v5.1 or wiring module has run");

  vm.run('openWindow("clioChart")');
  await vm.waitFor(() => vm.window.AISystem6ClioChartLoaded && vm.run("typeof openClioChart === 'function'"));
  vm.run(`openClioChart({ markdown: ${JSON.stringify(TABLE)}, title: "Q" })`);
  await vm.waitFor(() => vm.window.AISystem6ClioChartContext?.current?.());
  await vm.settleBoot();

  const live = vm.window.AISystem6ClioChartContext?.current?.();
  test.assert(!!live, "opening ClioChart with a table mounts the ordinary context strip");
  // The wiring's own scripts arrived in its loader's order.
  const wiringLoader = loaderLists.find((entry) => entry.sources.includes(WIRING));
  const order = loaded.filter((src) => wiringLoader?.sources.includes(src));
  test.assert(JSON.stringify(order) === JSON.stringify(wiringLoader?.sources || null),
    `the strip's modules load in their loader's order (saw ${JSON.stringify(order)})`);
  test.assert(loaded.includes("app/vendor/clioworks-v3/context-strip.js") && loaded.includes("app/vendor/clioworks-v3/frame-session.js"),
    "the v5.1 strip and frame session load through the real lazy loader");
  test.assert(!loaded.includes("app/vendor/clioworks-v3/fixture.js") && !loaded.some((src) => src.includes("host-mount")),
    "the ordinary path loads no fixture shell");

  test.assert(strips(vm).length === 1, `exactly one context strip in the clioChart window (saw ${strips(vm).length})`);
  test.assert(vm.document.querySelectorAll(".cw5-context").length === 1, "and none anywhere else");

  const strip = strips(vm)[0];
  const editButton = strip?.querySelector('[data-cw5-command="embed.edit"]');
  test.assert(!!editButton && !editButton.hidden && !editButton.disabled,
    "「编辑副本」 is shown and enabled on a chart table");
  test.assert(String(editButton?.textContent || "").includes("编辑副本"), "the button reads 「编辑副本」");

  const adapter = live?.adapter;
  // Without a mounted strip the rest of the path has nothing to drive; report
  // what failed above instead of crashing on a missing element.
  if (!editButton || !adapter) test.finish();
  test.assert(adapter?.getContext().frameState === "idle", "no copy is open before 「编辑副本」");
  click(editButton);
  await vm.waitFor(() => adapter.getContext().frameState !== "idle");
  test.assert(adapter.getContext().frameState !== "idle", `clicking 「编辑副本」 opens a copy (frameState ${adapter.getContext().frameState})`);
  const again = vm.window.ClioWorksUIModel.commandState("embed.edit", adapter.getContext());
  test.assert(!again.enabled && again.code === "FRAME_ACTIVE",
    `a second embed.edit is refused FRAME_ACTIVE (got ${again.code})`);
  test.assert(editButton.disabled, "the strip disables 「编辑副本」 while the copy is open");

  const original = vm.run("clioChartState.table.rows[0].cells[0].text");
  test.assert(original === "10", `the engine starts with the source value (got ${original})`);
  const panel = chartWindow(vm).querySelector(".cw5-copy");
  test.assert(!!panel && !panel.hidden, "the copy panel is shown while the copy is open");
  const field = panel?.querySelector('input[aria-label="北区 销量"]');
  test.assert(!!field, "the copy panel offers the 北区 · 销量 cell");
  if (field) vm.typeInto(field, "99");
  await vm.settleBoot();
  test.assert(vm.run("clioChartState.table.rows[0].cells[0].text") === "10",
    "editing the copy leaves the engine's table untouched");
  test.assert(adapter.frame.snapshot()?.dirty === true, "the copy is dirty after the edit");
  test.assert(field?.isConnected === true && panel.querySelector('input[aria-label="北区 销量"]') === field,
    "an edit keeps the draft fields in place, so the next field the writer tabs to survives");

  const adoptButton = [...(chartWindow(vm).querySelector(".cw5-copy")?.querySelectorAll("button") || [])]
    .find((button) => !button.disabled && String(button.textContent || "").length && button !== null && /Adopt|采用/.test(button.textContent));
  test.assert(!!adoptButton, "the copy panel's adopt button is enabled after an edit");
  if (adoptButton) click(adoptButton);
  await vm.waitFor(() => adapter.getContext().frameState === "idle");
  await vm.settleBoot();
  test.assert(adapter.getContext().frameState === "idle", "adopting returns the frame to idle");
  test.assert(vm.run("clioChartState.table.rows[0].cells[0].text") === "99",
    `the engine's table carries the adopted value (got ${vm.run("clioChartState.table.rows[0].cells[0].text")})`);
  test.assert(vm.run("clioChartState.table.rows[1].cells[1].text") === "7", "untouched cells stay as they were");
  test.assert(chartWindow(vm).querySelector(".cw5-copy")?.hidden === true, "the copy panel closes after adoption");

  // The adoption is ONE named step: the engine's history is cleared when the
  // table loads, so after the one undo takes the adoption back there is
  // nothing left to undo. (The nested beginChange/applyTable pair used to
  // record the same pre-adoption snapshot twice, leaving a no-op second undo.)
  test.assert(vm.run("clioChartState.history.undoLabel()") === "edit_step_adopt_copy",
    "the adoption's one step is named for the Edit menu (edit_step_adopt_copy)");
  test.assert(vm.run("undoClioChart()") === true, "the engine's own undo takes the adoption back");
  test.assert(vm.run("clioChartState.table.rows[0].cells[0].text") === "10", "undo restores the original value");
  test.assert(vm.run("clioChartState.history.canUndo()") === false,
    "one adoption is exactly one undo step — a second undo has nothing to take back");

  // --- 2b. adapter.frame on the real façade ---------------------------------
  // The strip's panel is one host of adapter.frame; driving the API directly
  // makes the façade's own bindings answer: parse/serialize are the engine's,
  // applyTable goes through the engine's history, revision is its undo depth.
  const undoDepth = () => vm.run("clioChartState.history.size().undo");
  const cellText = (row, column) => vm.run(`clioChartState.table.rows[${row}].cells[${column}].text`);
  {
    const opened = await adapter.execute("embed.edit");
    test.assert(opened.status === "ok" && adapter.getContext().frameState === "editing",
      `embed.edit opens a copy over the real façade (got ${JSON.stringify(opened)})`);
    const draft = adapter.frame.draftTable();
    test.assert(draft?.rows?.[1]?.label === "南区" && draft.rows[1].cells[1]?.text === "7",
      "the draft is the engine's own table, parsed by the engine's parser");
    const edited = adapter.frame.edit({ kind: "set-cell", row: 1, column: 1, value: "8" });
    test.assert(edited.status === "ok" && edited.changed === true, "a cell edit lands in the copy");
    test.assert(adapter.frame.draftTable()?.rows?.[1]?.cells?.[1]?.text === "8" && cellText(1, 1) === "7",
      "the draft carries the edit while the engine's table is untouched");
    const depth = undoDepth();
    const cancelled = adapter.frame.cancel();
    test.assert(cancelled.status === "ok" && adapter.getContext().frameState === "idle",
      "cancel closes the copy");
    test.assert(cellText(1, 1) === "7" && undoDepth() === depth,
      "a cancelled copy never wrote the engine's table or its history");
  }
  {
    await adapter.execute("embed.edit");
    adapter.frame.edit({ kind: "set-cell", row: 1, column: 1, value: "8" });
    const depth = undoDepth();
    const adopted = await adapter.frame.adopt();
    test.assert(adopted.status === "ok" && adopted.receipt?.status === "applied",
      `adopt lands an applied receipt through the real façade (got ${JSON.stringify(adopted)})`);
    test.assert(cellText(1, 1) === "8" && cellText(0, 0) === "10" && cellText(1, 0) === "20",
      "the engine's table carries the adopted cell and keeps the rest");
    // One adoption, one step: the port's beginChange brackets applyTable and
    // the façade writes the table raw inside that bracket, so the history
    // grows by exactly one entry with the pre-adoption text.
    test.assert(undoDepth() === depth + 1,
      `adoption records exactly one step in the engine's history (depth ${depth} → ${undoDepth()})`);
    test.assert(vm.run("undoClioChart()") === true && cellText(1, 1) === "7",
      "one engine undo takes the whole adoption back");
  }

  // --- 4. reopening the window ---------------------------------------------
  vm.run('closeWindow("clioChart")');
  await vm.settleBoot();
  vm.run('openWindow("clioChart")');
  await vm.settleBoot();
  vm.run(`openClioChart({ markdown: ${JSON.stringify(TABLE)}, title: "Q2" })`);
  await vm.settleBoot();
  test.assert(strips(vm).length === 1, `reopening ClioChart still leaves one strip (saw ${strips(vm).length})`);
  test.assert(chartWindow(vm).querySelectorAll(".cw5-chart-host").length === 1, "and one strip host");
  test.assert(vm.window.AISystem6ClioChartContext.current() === live, "the same strip instance is reused");

  // --- 5. a new table while a copy is open: the old copy ends first --------
  const reEdit = strips(vm)[0]?.querySelector('[data-cw5-command="embed.edit"]');
  if (reEdit) click(reEdit);
  await vm.waitFor(() => adapter.getContext().frameState === "editing");
  vm.run(`openClioChart({ markdown: ${JSON.stringify(TABLE)}, title: "Q3" })`);
  await vm.waitFor(() => adapter.getContext().frameState === "idle");
  await vm.settleBoot();
  test.assert(adapter.getContext().frameState === "idle",
    `a new table ends the copy made from the old one (frameState ${adapter.getContext().frameState})`);
  test.assert(chartWindow(vm).querySelector(".cw5-copy")?.hidden === true, "and closes its panel");
}

// --- 3. a fixture on the URL: the ordinary wiring stands aside --------------
{
  const { vm, loaded } = await bootDesk("?fixture=clioworks-v3&adapter=chart");
  vm.run('openWindow("clioChart")');
  await vm.waitFor(() => vm.window.AISystem6ClioChartLoaded && vm.run("typeof openClioChart === 'function'"));
  vm.run(`openClioChart({ markdown: ${JSON.stringify(TABLE)}, title: "F" })`);
  await vm.settleBoot();
  test.assert(vm.run("!!clioChartState.table"), "the fixture desk really holds a chart table");
  test.assert(!loaded.includes(WIRING), "with a fixture the ordinary wiring module is never requested");
  test.assert(!vm.window.AISystem6ClioChartContext?.current?.(), "with a fixture the ordinary strip is not mounted");
  test.assert(vm.document.querySelectorAll(".cw5-chart-host").length === 0, "no ordinary strip host exists under a fixture");
  test.assert(vm.document.querySelectorAll(".cw5-context").length <= 1, "never two strips under a fixture");
}

test.finish();
