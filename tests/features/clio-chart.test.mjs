import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-chart");
const source = read("app/features/clio-chart.js");
const bootstrap = read("app.js");

const context = { window: {} };
vm.runInNewContext(source, context);
const chart = context.window.AISystem6ClioChart;

test.assert(!!chart, "the module exposes window.AISystem6ClioChart");

// Real numbers from the Notebookcheck MacBook Air 15 M5 review, including the
// blanks: those machines genuinely have no Steel Nomad / Blender result.
const REVIEW_TABLE = [
  '<!-- cliochart: bars, reference="MacBook Air 15 M5" -->',
  "",
  "| 机型                  | Steel Nomad | Blender Classroom * | 续航 (h) |",
  "| --------------------- | ----------- | ------------------- | -------- |",
  "| MacBook Pro 14 M5     | 1125        | 68                  |          |",
  "| MacBook Air 15 M5     | 1070        | 76.3                | 17.2     |",
  "| MacBook Air 15 M4     |             | 103                 | 16.5     |",
  "| Surface Laptop 7 15   | 910         |                     | 17.7     |",
  "| ~ Subnotebook 类平均   | 572 (184-1095, n=31) | 121.9      | 14       |",
].join("\n");

const parsed = chart.parseTable(REVIEW_TABLE);
test.assert(!!parsed, "a Markdown table with a config comment parses");

// --- The round-trip contract ----------------------------------------------
test.assert(
  chart.serializeTable(chart.parseTable(REVIEW_TABLE)) === REVIEW_TABLE,
  "serialize(parse(x)) === x byte for byte when nothing changed"
);

const NO_CONFIG_TABLE = [
  "| Device | Score |",
  "|---|---|",
  "| A | 10 |",
  "| B | 20 |",
].join("\n");
test.assert(
  chart.serializeTable(chart.parseTable(NO_CONFIG_TABLE)) === NO_CONFIG_TABLE,
  "a compact table with no padding and no config survives the round trip"
);

const CRLF_TABLE = NO_CONFIG_TABLE.replace(/\n/g, "\r\n");
test.assert(
  chart.serializeTable(chart.parseTable(CRLF_TABLE)) === CRLF_TABLE,
  "CRLF line endings are preserved"
);

const touched = chart.parseTable(REVIEW_TABLE);
chart.setCell(touched, 1, 0, "1088");
const rewritten = chart.serializeTable(touched);
const beforeLines = REVIEW_TABLE.split("\n");
const afterLines = rewritten.split("\n");
const changedLines = afterLines.filter((line, index) => line !== beforeLines[index]);
test.assert(changedLines.length === 1, "editing one cell rewrites exactly one line");
test.assertIncludes(changedLines[0] || "", "1088", "the rewritten line carries the new value");
test.assertIncludes(changedLines[0] || "", "| MacBook Air 15 M5     |", "the rewritten line keeps the original column alignment");

// --- "Never invent a number" at the parser level ---------------------------
const blankRow = parsed.rows.find((row) => row.label === "MacBook Air 15 M4");
test.assert(blankRow.cells[0].text === "" && blankRow.cells[0].value === null, "an empty cell parses as unknown, not as 0");

const cleared = chart.parseTable(REVIEW_TABLE);
chart.setCell(cleared, 0, 0, "");
test.assert(cleared.rows[0].cells[0].value === null, "clearing a cell yields unknown, never 0");

const unreadable = chart.parseTable(REVIEW_TABLE);
chart.setCell(unreadable, 0, 0, "~1.5k");
test.assert(
  unreadable.rows[0].cells[0].unparsed && unreadable.rows[0].cells[0].text === "~1.5k",
  "an unreadable cell is flagged, not silently dropped or guessed"
);

// --- Notebookcheck's typography is our syntax ------------------------------
test.assert(parsed.columns[1].lower === true, "a column header ending in * means smaller is better");
test.assert(parsed.columns[1].name === "Blender Classroom", "the * is not part of the column name");
test.assert(parsed.columns[2].unit === "h", "a parenthesised column header supplies the unit");
test.assert(parsed.rows[4].aggregate === true, "a row label starting with ~ is an aggregate reference row");
test.assert(parsed.rows[4].cells[0].value === 572, "an aggregate cell keeps its headline value");
test.assert(
  parsed.rows[4].cells[0].range[0] === 184 && parsed.rows[4].cells[0].range[1] === 1095,
  "a parenthesised range is parsed for the min-max extension"
);
test.assert(parsed.rows[4].cells[0].sample === 31, "n= is parsed as the sample size");

const minimumCell = chart.parseTable(
  ["| Radio | Throughput |", "|---|---|", "| A | 1794 (min: 1717) |", "| B | 1600 |"].join("\n")
);
test.assert(minimumCell.rows[0].cells[0].minimum === 1717, "(min: …) is parsed as a lower bound");

const uncertain = chart.parseTable(
  ["| Device | Watt |", "|---|---|", "| A | 2.09 ? |", "| B | 3.76 |"].join("\n")
);
test.assert(uncertain.rows[0].cells[0].uncertain === true, "a ? marks the value uncertain");
test.assert(uncertain.rows[0].cells[0].value === 2.09, "an uncertain value is still a value");

const score = chart.parseTable(
  ["| Criterion | Rating |", "|---|---|", "| Chassis | 88 / 98 → 90% |", "| Keyboard | 91 |"].join("\n")
);
test.assert(
  score.rows[0].cells[0].score.raw === 88 && score.rows[0].cells[0].score.normalized === 90,
  "raw / max → normalized keeps all three numbers"
);

const traceTable = chart.parseTable(
  ["<!-- cliochart: trace -->", "", "| Seconds | Watts |", "|---|---|", "| 0 | 4.2 |", "| 1 | |", "| 2 | 6.8 |"].join("\n")
);
test.assert(chart.isChartable(traceTable), "a numeric first column is accepted as a trace axis");
test.assert(traceTable.rows[1].cells[0].value === null, "a missing trace point remains a gap, never an interpolated value");

const density = new Function(
  `${source.match(/function clioChartGridDensity[\s\S]*?\n}/)[0]}; return clioChartGridDensity;`
)();
test.assert(density(0, 0, 100) === "0", "the spatial grid maps the minimum to the empty pattern");
test.assert(density(50, 0, 100) === "50", "the spatial grid maps the midpoint to 50% dots");
test.assert(density(null, 0, 100) === "missing", "the spatial grid gives missing data its own nonnumeric state");

// --- Config comment --------------------------------------------------------
test.assert(parsed.reference === "MacBook Air 15 M5", "the reference object comes from the config comment");
const inferred = chart.parseTable(NO_CONFIG_TABLE);
test.assert(inferred.reference === "A" && inferred.config.reference === "", "an inferred reference is derived, never written into the config");

const untouchedConfig = chart.parseTable(NO_CONFIG_TABLE);
test.assert(
  chart.serializeTable(untouchedConfig) === NO_CONFIG_TABLE,
  "merely looking at a chart never writes a config comment into the file"
);

const configured = chart.parseTable(NO_CONFIG_TABLE);
chart.setConfig(configured, { percent: "max" });
test.assertIncludes(
  chart.serializeTable(configured),
  "<!-- cliochart: bars, percent=max -->",
  "changing a setting writes the config comment"
);

const flagged = chart.parseTable(REVIEW_TABLE);
chart.setColumnLower(flagged, 2, true);
test.assertIncludes(chart.serializeTable(flagged), "续航 (h) *", "marking a column smaller-is-better writes the * back");

// --- Zero-mark recognition -------------------------------------------------
test.assert(chart.isChartable(parsed), "a label-plus-numbers table is recognised without any marker");
const prose = chart.parseTable(
  ["| Step | What it does |", "|---|---|", "| One | opens the disk |", "| Two | reads the file |"].join("\n")
);
test.assert(!chart.isChartable(prose), "a table with no numeric column is not offered as a chart");

const document = [
  "# 轻薄本横评",
  "",
  "先看跑分。",
  "",
  NO_CONFIG_TABLE,
  "",
  "差距最扎眼的其实不是跑分。",
].join("\n");
const blocks = chart.findTables(document);
test.assert(blocks.length === 1, "a chartable table is found inside a longer document");
test.assert(blocks[0].text === NO_CONFIG_TABLE, "the found block covers exactly the table lines");

const handedBack = chart.replaceBlock(document, blocks[0], chart.serializeTable(blocks[0].table));
test.assert(handedBack === document, "handing an untouched table back leaves the document byte-identical");

const edited = chart.parseTable(blocks[0].text, blocks[0].start);
chart.setCell(edited, 0, 0, "11");
const editedDocument = chart.replaceBlock(document, blocks[0], chart.serializeTable(edited));
test.assert(
  editedDocument.split("\n").filter((line, index) => line !== document.split("\n")[index]).length === 1,
  "writing an edit back into the document touches one line and leaves the prose alone"
);

// --- Percentages must reproduce the published review figures ---------------
// Notebookcheck expresses the gap as a share of the reference: (v-base)/base,
// and (base-v)/base for a smaller-is-better metric.
const source2 = read("app/features/clio-chart.js");
const percent = new Function(
  `${source2.match(/function clioChartPercentAgainst[\s\S]*?\n}/)[0]}; return clioChartPercentAgainst;`
)();

// Steel Nomad, reference MacBook Air 15 M5 = 1070 Points (higher is better).
test.assert(percent(1125, 1070, false) === 5, "Steel Nomad: MacBook Pro 14 M5 reads +5% as published");
test.assert(percent(910, 1070, false) === -15, "Steel Nomad: Surface Laptop 7 15 reads -15% as published");
test.assert(percent(808, 1070, false) === -24, "Steel Nomad: ThinkPad X9-15 reads -24% as published");
test.assert(percent(572, 1070, false) === -47, "Steel Nomad: the Subnotebook class average reads -47% as published");
test.assert(percent(534, 1070, false) === -50, "Steel Nomad: Galaxy Book4 Edge 16 reads -50% as published");

// Blender Classroom, reference = 76.3 Seconds (smaller is better).
test.assert(percent(68, 76.3, true) === 11, "Blender: a faster machine reads +11%, not +12%");
test.assert(percent(103, 76.3, true) === -35, "Blender: a slower machine reads -35% as published");
test.assert(percent(121.9, 76.3, true) === -60, "Blender: the class average reads -60% as published");

// --- Wiring contracts ------------------------------------------------------
const html = read("index.html");
const manifest = read("scripts/runtime-manifest.mjs");
const styleManifest = read("scripts/style-manifest.mjs");
const menus = read("app/data/menus.js");
const app = read("app.js");
const multiFinder = read("app/core/multi-finder.js");
const actions = read("app/core/actions.js");
const config = read("app/core/config.js");
const integrity = read("app/core/system-integrity-guidance.js");
const chatMessages = read("app/core/chat-messages.js");
const clioStage = read("app/features/clio-stage.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const dictionary = read("app/data/system-dictionary.js");
const css = read("styles/87-clio-chart.css");
const foundationCss = read("styles/00-foundation.css");
const liquidCss = read("styles/70-liquid-glass.css");

test.assertIncludes(html, 'data-i18n="clio_chart_bars_short"', "ClioChart supplies short phone projection labels");

test.assertIncludes(manifest, '"app/features/clio-chart.js"', "the module is registered as a lazy runtime path");
test.assertNotIncludes(html, "app/features/clio-chart.js", "a lazy module is never added to the startup script tags");
test.assertIncludes(styleManifest, '"styles/87-clio-chart.css"', "the stylesheet is in the style manifest");
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6ClioChartLoaded", ["app/features/clio-chart.js"])', "there is a lazy loader for the module");
test.assertIncludes(html, 'data-window="clioChart"', "the window is declared in index.html");
test.assertIncludes(multiFinder, 'clioChart: "clioChart"', "the window maps to its own application");
test.assertIncludes(menus, "clioChart: clioChartMenus", "the application owns a menu set");
test.assertIncludes(menus, 'menuItem("see-as-chart", "clio_chart_see_as_chart")', "TeachText carries the menu twin of the in-body button");
test.assertIncludes(actions, '"open-clio-chart": openClioChartApp', "the open action is registered");
test.assertIncludes(html, 'id="teachtext-chart-owner"', "TeachText shows who owns the table block");

["clio_chart_title", "clio_chart_label", "clio_chart_see_as_chart", "clio_chart_not_measured", "clio_chart_rollup_note"].forEach((key) => {
  test.assert(en.includes(`${key}:`) && zh.includes(`${key}:`), `${key} exists in both languages`);
});
// The title bar carries the brand alone, the way ClioStage established; the
// Chinese name lives on the label key every other surface uses.
// The numeric guardrail is a product rule, not a prompt-time nicety.
test.assertIncludes(integrity, "不得增补、外推、插值、四舍五入", "the Chinese guardrail forbids inventing numbers");
test.assertIncludes(integrity, "do not add, extrapolate, interpolate, round", "the English guardrail forbids inventing numbers");
test.assertIncludes(integrity, "never treated as 0", "an empty cell may never become a zero");

// Bars must survive an engine that never runs the animation.
test.assertNotIncludes(css, "transition: width", "bar length is never animated as a layout property");

// --- v2 projections and reveal mode ---------------------------------------
[
  ["clio-chart-trace-view", "trace"],
  ["clio-chart-grid-view", "grid"],
  ["clio-chart-score-view", "score"],
].forEach(([id, projection]) => {
  test.assertIncludes(html, `id="${id}"`, `the ${projection} projection has a visible control`);
  test.assertIncludes(source, `clioChartState.projection === "${projection}"`, `the ${projection} projection is rendered from shared state`);
});
test.assertIncludes(source, "function renderClioChartTrace()", "P3 renders multi-series trace lines");
test.assertIncludes(source, "if (point.value === null)", "P3 breaks a path at missing measurements");
test.assertIncludes(source, "function renderClioChartSpatialGrid()", "P4 renders the selected metric as a spatial grid");
test.assertIncludes(source, "function renderClioChartScores()", "P5 renders normalized score bars");
test.assertIncludes(source, 't("clio_chart_score_no_total")', "P5 refuses to calculate a weighted total without a weight source");
test.assertIncludes(source, "function toggleClioChartPresentation", "presentation mode is a named state");
test.assertIncludes(source, "event.key !== \" \"", "Space reveals the next presentation item");
["clio-chart-view-1", "clio-chart-view-2", "clio-chart-view-3", "clio-chart-view-4", "clio-chart-view-5", "clio-chart-reverse"].forEach((id) => {
  test.assertIncludes(actions, `id: "${id}"`, `${id} is registered as an application shortcut`);
  test.assertIncludes(menus, `"${id}"`, `${id} is the shadow of a visible menu command`);
});

test.assertIncludes(chatMessages, "function clioTalkHasChartableTable", "ClioTalk detects chartable assistant tables");
test.assertIncludes(chatMessages, 't("clio_chart_make_chart")', "assistant tables expose the Make Comparison Chart command");
test.assertIncludes(chatMessages, "await ensureClioChartModule()", "the reverse ClioTalk handoff loads the lazy module");
test.assertIncludes(chatMessages, "window.AISystem6ClioChart?.open?.({ markdown: content", "the reverse handoff passes the original Markdown");

test.assertIncludes(source, "async function sendClioChartToStage()", "the current projection can become one ClioStage page");
test.assertIncludes(source, "view.cloneNode(true)", "the stage handoff freezes the read-only projection instead of copying data into another editor");
test.assertIncludes(source, 'sourceKind: "clioChart"', "the ClioStage source is explicitly identified");
test.assertIncludes(clioStage, 'sourceKind === "clioChart"', "ClioStage recognizes a chart snapshot");
test.assertIncludes(clioStage, "chartSnapshot.cloneNode(true)", "ClioStage renders a fresh clone of the frozen chart page");
test.assertIncludes(menus, 'menuItem("clio-chart-send-stage"', "Send to ClioStage is a visible chart menu command");
test.assertIncludes(actions, '"clio-chart-send-stage"', "Send to ClioStage is wired through the action layer");

test.assertIncludes(source, "data-label=", "grid cells carry their field labels into card mode");
[
  "clio-chart-bars-view",
  "clio-chart-matrix-view",
  "clio-chart-trace-view",
  "clio-chart-grid-view",
  "clio-chart-score-view",
  "clio-chart-source-view",
].forEach((id) => {
  test.assertIncludes(html, `id="${id}"`, `${id} remains a visible projection option`);
});
test.assertIncludes(liquidCss, "--clio-chart-switcher-width: 100%", "Liquid Glass gives all projection options a full wrapping row");

// Classic and Liquid Glass are two chart materials over one geometry and data
// model. The theme layer only changes tokens; it does not fork chart selectors.
[
  "--clio-chart-surface",
  "--clio-chart-ink",
  "--clio-chart-rule",
  "--clio-chart-accent",
  "--clio-chart-mark-border",
  "--clio-chart-pattern-paper",
  "--clio-chart-focus-shadow",
  "--clio-chart-solid-fill",
  "--clio-chart-material-shadow",
  "--clio-chart-material-filter",
  "--clio-chart-typeface",
  "--clio-chart-pane-bg",
  "--clio-chart-radius",
  "--clio-chart-label-bg",
  "--clio-chart-density-75",
  "--clio-chart-spatial-label-size",
].forEach((token) => {
  test.assertIncludes(foundationCss, `${token}:`, `${token} has a Classic 1-bit default`);
  test.assertIncludes(liquidCss, `${token}:`, `${token} has a Liquid Glass override`);
  test.assertIncludes(css, `var(${token})`, `${token} is consumed by the chart stylesheet`);
});
test.assertNotIncludes(
  liquidCss,
  "body.use-liquid-glass .clio-chart",
  "Liquid Glass does not fork ClioChart selectors; component tokens own the second theme"
);

// --- No dead controls, no inert windows -----------------------------------
const windows = read("app/core/window-manager.js");
const teachTextAccessories = read("app/features/teachtext-accessories.js");
const responsive = read("styles/60-responsive.css");

// A window restored from the previous session must not come back inert. The
// cross-cutting rule lives in tests/features/lazy-window-restore.test.mjs;
// here we only pin ClioChart's own end of it.
test.assertIncludes(windows, "clioChart: {", "ClioChart is in the lazy-window registry openWindow consults");
test.assertIncludes(windows, "window.AISystem6ClioChart?.attach?.()", "the restored window is wired before the user touches it");
test.assert(typeof chart.attach === "function", "the module exposes attach() for the restore path");

// The split handle is the app's existing figure, not a second one. Reusing
// .tdi-shell / .tdi-rail / .tdi-grabber + setupTdiRailResize() is what supplies
// the drag, the arrow-key step, aria-valuenow, the clamp and the saved width.
const chartSource = read("app/features/clio-chart.js");
test.assertIncludes(html, 'class="tdi-shell clio-chart-split"', "the split uses the shared TDI shell");
test.assertIncludes(html, 'class="tdi-rail clio-chart-grid-pane"', "the grid pane is the shared TDI rail");
test.assertMatches(html, /class="tdi-grabber" id="clio-chart-splitter"/, "the handle is the shared TDI grabber");
test.assertIncludes(
  chartSource,
  'setupTdiRailResize(document.querySelector("#clio-chart-split"), { storageKey: "aiSystem6.tdiRail.clioChart" })',
  "resizing goes through the shared helper, so the width persists like every other split"
);
test.assertNotIncludes(chartSource, "startClioChartSplitterDrag", "no bespoke splitter drag survives alongside the shared one");
test.assertNotIncludes(css, "--clio-chart-grid-width", "the bespoke split variable is gone; --tdi-rail-width drives the rail");
// The header row is part of the table, so it is edited in the same grid.
test.assert(typeof chart.setColumnText === "function", "column headers are editable through the model");
test.assertIncludes(chartSource, "function beginClioChartHeaderEdit", "double-clicking a header edits it");
test.assertIncludes(chartSource, "function beginClioChartLabelEdit", "double-clicking a row label edits it");

const renamed = chart.parseTable(REVIEW_TABLE);
chart.setColumnText(renamed, 0, "Steel Nomad (Points) *");
const renamedOut = chart.serializeTable(renamed);
test.assertIncludes(renamedOut, "Steel Nomad (Points) *", "renaming a column writes the header back");
test.assert(renamed.columns[0].unit === "Points" && renamed.columns[0].lower === true, "the rewritten header supplies both the unit and the flag");
test.assert(
  renamedOut.split("\n").filter((line, index) => line !== REVIEW_TABLE.split("\n")[index]).length === 1,
  "renaming a column rewrites only the header line"
);

// The menu command must not depend on a module that has not loaded yet.
test.assertNotIncludes(
  windows,
  '"see-as-chart": winName === "teachText" && !!window.AISystem6ClioChart?.hasChartableTable?.()',
  "see-as-chart availability does not depend on the lazy module being loaded"
);
test.assertMatches(
  html,
  /class="btn details-bar-button is-hidden"[^>]*id="teachtext-see-as-chart"[^>]*hidden/,
  "TeachText keeps the in-body chart button hidden until the document contains a chartable Markdown table"
);
test.assertIncludes(
  teachTextAccessories,
  "function teachTextHasChartableMarkdownTable(markdown)",
  "TeachText owns a lightweight Markdown-table availability check without loading ClioChart"
);
const tableAvailabilitySource = teachTextAccessories.match(/function teachTextHasChartableMarkdownTable\(markdown\) \{[\s\S]*?\n\}/)?.[0] || "";
const tableAvailabilityContext = {};
vm.runInNewContext(tableAvailabilitySource, tableAvailabilityContext);
test.assert(
  !tableAvailabilityContext.teachTextHasChartableMarkdownTable("Ordinary prose\nwith no table."),
  "ordinary Markdown does not expose the in-body chart action"
);
test.assert(
  tableAvailabilityContext.teachTextHasChartableMarkdownTable(NO_CONFIG_TABLE),
  "a Markdown table with a header, divider, and data row exposes the in-body chart action"
);
test.assert(
  !tableAvailabilityContext.teachTextHasChartableMarkdownTable("A | B\n--- | ---\nordinary prose"),
  "a divider-looking fragment without a data row does not expose the chart action"
);
test.assertIncludes(
  teachTextAccessories,
  'teachTextSeeAsChartButton.classList.toggle("is-hidden", !visible)',
  "TeachText synchronizes the chart button whenever its document state refreshes"
);
test.assertIncludes(
  bootstrap,
  "teachTextSeeAsChartButton,",
  "the startup bootstrap receives the chart button from the shared DOM handle registry"
);
test.assertIncludes(
  windows,
  '"see-as-chart": winName === "teachText" && teachTextHasChartableMarkdownTable',
  "the menu and in-body button share the same table availability rule"
);
test.assertMatches(
  html,
  /class="teachtext-details-controls"[\s\S]*?id="teachtext-see-as-chart"[\s\S]*?id="teachtext-chart-owner"[\s\S]*?<\/div>[\s\S]*?id="teachtext-status"/,
  "TeachText keeps chart controls grouped between the boundary and save status so the details bar stays on one row"
);

// A window the user can fill with a wide table has to be resizable. The grow
// box is only built for windows in this list, and the frame lanes it sits in
// need a scroller host to attach to.
const appConfig = read("app/core/config.js");
test.assertMatches(
  appConfig,
  /resizableWindowNames: Object\.freeze\(\[[\s\S]*?"clioChart"/,
  "the window is resizable, so it gets a grow box and the two frame lanes"
);
test.assertIncludes(
  html,
  'id="clio-chart-view" class="clio-chart-view window-frame-scroller"',
  "the chart view is the frame scroller the lanes and grow box measure against"
);

// The phone breakpoint lives with the app, because this file loads after the
// shared responsive layer and would otherwise lose the cascade.
test.assertNotIncludes(responsive, "clio-chart", "no ClioChart rules sit in the shared override layer");

// --- Templates and the editable source ------------------------------------
// A Markdown table is awkward to type from nothing, so the empty pane is a
// template chooser rather than a blank sheet.
test.assertIncludes(chartSource, "function clioChartTemplatePresets()", "the review's section shapes ship as presets");
// A System 6 application opens with paper, not with a menu of things you could
// have opened. Templates live in File > New.
test.assertNotIncludes(chartSource, "renderClioChartChooser", "there is no in-window template chooser");
test.assertIncludes(chartSource, 'openClioChartTemplate({ id: "blank", builtIn: true })', "the window opens with a blank comparison already on the grid");
test.assertIncludes(menus, 'submenu("clio_chart_new_from_template"', "the presets live in File > New");
test.assertIncludes(app, 'action: "open-clio-chart"', "ClioChart is a real entry in the Applications folder");
["cpu-gpu", "gaming", "battery-power", "noise-heat", "display", "rating", "blank"].forEach((id) => {
  test.assertIncludes(chartSource, `id: "${id}"`, `the ${id} preset exists`);
});
test.assertIncludes(chartSource, "Blender Classroom (Seconds) *", "the CPU preset marks the seconds column smaller-is-better");
test.assertIncludes(chartSource, "Colorchecker dE 2000 *", "the display preset marks dE smaller-is-better");
test.assertIncludes(chartSource, 'projection: "score"', "the rating template opens directly in the score projection");

// A preset is a shape, not data: shipping plausible benchmark numbers would be
// the same invented-figure problem the guardrail exists to prevent.
test.assertIncludes(
  chartSource,
  "preset.columns.map(() => \"\")",
  "every preset value cell ships empty, so no invented benchmark numbers reach the user"
);
// Templates load without the discovery heuristic, which an all-blank table fails.
test.assertIncludes(chartSource, "const table = parseClioChartTable(markdown);", "a known template is parsed directly, not through the chartable heuristic");

// User templates are ordinary documents, so naming and re-editing are the
// Finder's job rather than a second manager inside this window.
test.assertIncludes(chartSource, 'artifactKind: "clio-chart-template"', "user templates are documents, not a private store");
test.assertIncludes(chartSource, "clioChartState.templateFileId", "re-saving updates the template it came from");
test.assertNotIncludes(chartSource, "localStorage.setItem(\"aiSystem6.clioChart.templates", "templates do not introduce a new storage boundary");

// Source is editable, and ownership moves by mode rather than by sync.
test.assertIncludes(chartSource, "function applyClioChartSourceDraft()", "leaving the source view parses the draft back");
test.assertMatches(
  chartSource,
  /projection === "source" && projection !== "source" && !applyClioChartSourceDraft\(\)\) return;/,
  "a draft that will not parse keeps the user in the source view instead of discarding their text"
);
test.assertIncludes(chartSource, "renderClioChartGrid();", "applying a source edit redraws the grid, not only the projection");
[
  "clio_chart_template_folder",
  "clio_chart_source_invalid",
  "clio_chart_save_template",
  "clio_chart_trace",
  "clio_chart_grid",
  "clio_chart_score",
  "clio_chart_presentation",
  "clio_chart_make_chart",
  "clio_chart_send_stage",
].forEach((key) => {
  test.assert(en.includes(`${key}:`) && zh.includes(`${key}:`), `${key} exists in both languages`);
});
test.assertIncludes(dictionary, 'id: "clio-chart"', "System Help exposes ClioChart as a file-grounded comparison bench");
test.assertIncludes(dictionary, "A visible projection can be frozen and sent directly to ClioStage", "System Help documents the real Chart-to-Stage handoff");

test.finish();
