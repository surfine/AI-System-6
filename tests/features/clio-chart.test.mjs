import vm from "node:vm";
import { admittedApplicationGroup, createFeatureTest, read, windowApp } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-chart");
const source = read("app/features/clio-chart.js");
const bootstrap = read("app.js");

// The module is an app module: it expects the desk's own translator and the
// current language. The contract supplies the smallest pair that keeps the
// placeholder labels readable instead of undefined.
const context = {
  window: {},
  currentLanguage: "zh",
  // The desk's translator fills placeholders; the contract's stand-in keeps the
  // arguments visible so a message about a row can be asserted by its row.
  t: (key, ...args) => (args.length ? `${key}: ${args.join(" ")}` : key),
  btoa,
  encodeURIComponent,
  escapeHtml: (value) => String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
};
context.structuredClone = structuredClone;
Object.assign(context, { TextEncoder, TextDecoder, atob });
context.registerEditHistory = (name, entry) => { context.editHistories = { ...(context.editHistories || {}), [name]: entry }; };
vm.createContext(context);
vm.runInContext(read("app/core/edit-history.js"), context);
vm.runInContext(read("app/core/edit-snap.js"), context);
vm.runInContext(read("app/core/edit-embeds.js"), context);
vm.runInContext(source, context);
vm.runInContext(read("app/features/clio-diagram.js"), context);
const chart = context.window.AISystem6ClioChart;
const diagramApi = context.window.AISystem6ClioDiagram;

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

// --- Shape, sort and paste: the artifact, not the DOM ----------------------
// Adding a row or a column rebuilds the block's text, so the contract can read
// what a shape change produces without a browser.
const grown = chart.shapeApply(parsed, "insert-row", { index: 0 });
test.assert(grown && grown.split("\n").length === REVIEW_TABLE.split("\n").length + 1, "inserting a row adds exactly one line");
const grownTable = chart.parseTable(grown);
const grownLabels = grownTable.rows.map((row) => row.label);
test.assert(grownLabels[0] === "MacBook Pro 14 M5" && grownLabels[2] === "MacBook Air 15 M5", "the existing rows keep their order around the new one");
test.assert(/clio_chart_template_object/.test(grownLabels[1]), "the new row is a labelled placeholder, not a plausible number");
test.assert(grownTable.rows[1].cells.every((cell) => cell.text === ""), "and every cell of it is empty, never a made-up figure");
test.assert(grownTable.rows.every((row) => row.cells.length === grownTable.columns.length), "the new row keeps the table's width");
test.assert(chart.serializeTable(chart.parseTable(grown)) === grown, "the rebuilt block is idempotent like any other table");

const narrow = chart.shapeApply(chart.parseTable(["| Device | Score |", "|---|---|", "| A | 10 |", "| B | 20 |"].join("\n")), "delete-row", { index: 0 });
test.assert(narrow && chart.parseTable(narrow).rows.map((row) => row.label).join(",") === "B", "deleting a row removes that row only");
test.assert(chart.shapeApply(chart.parseTable(["| Device | Score |", "|---|---|", "| A | 10 |"].join("\n")), "delete-row", { index: 0 }) === null, "the last remaining row is never deleted");
test.assert(chart.shapeApply(chart.parseTable(["| Device | Score |", "|---|---|", "| A | 10 |"].join("\n")), "delete-column", { index: 0 }) === null, "the last remaining column is never deleted");

const widened = chart.shapeApply(parsed, "insert-column", { index: 0 });
const widenedTable = chart.parseTable(widened);
test.assert(widenedTable.columns.length === parsed.columns.length + 1, "inserting a column widens the header");
test.assert(widenedTable.rows.every((row) => row.cells.length === widenedTable.columns.length), "and every row with it");
test.assert(widenedTable.rows.every((row) => row.cells[1].text === ""), "the new column starts empty in every row");

const reordered = chart.shapeApply(parsed, "move-row", { from: 0, to: 1 });
const order = chart.parseTable(reordered).rows.map((row) => row.label);
test.assert(order[0] === "MacBook Air 15 M5" && order[1] === "MacBook Pro 14 M5", "a moved row changes the file's order");
test.assert(chart.shapeApply(parsed, "move-row", { from: 1, to: 1 }) === null, "moving a row onto itself is not an edit");
test.assert(chart.moveRow(0, 1) === false, "row order stays the file's business until the chart draws the file's order");

// A spreadsheet paste is the highest-volume way data arrives, so the reader has
// to survive the shapes a spreadsheet actually quotes.
const quoted = chart.delimitedRows('Device,Note,Score\n"A, Inc.","two\nlines",10\n', ",");
test.assert(quoted.length === 2, "a quoted line break does not split the row");
test.assert(quoted[1][0] === "A, Inc.", "a quoted delimiter stays inside its cell");
test.assert(quoted[1][1] === "two\nlines", "a quoted newline stays inside its cell");
test.assert(chart.delimitedRows('"He said ""no"""\t2\n', "\t")[0][0] === 'He said "no"', "a doubled quote is one quote");

const converted = chart.delimitedToMarkdown('Device,Note,Score\n"A, Inc.","two, lines",10\n"B, Ltd.",ok,20\n');
test.assert(chart.isChartable(chart.parseTable(converted)), "a CSV whose cells hold commas still becomes a chartable table");
test.assert(chart.parseTable(converted).rows[0].label === "A, Inc.", "and the quoted comma stays inside the label");

// --- The projection as a portable drawing ---------------------------------
const barsSvg = chart.projectionSvg(parsed, "bars");
test.assert(barsSvg.startsWith("<svg") && barsSvg.endsWith("</svg>"), "a projection serializes to one self-contained SVG");
test.assert(barsSvg.includes("<pattern"), "the drawing carries its own patterns, so it needs no stylesheet");
test.assert(barsSvg.includes("MacBook Pro 14 M5") && barsSvg.includes("1125"), "and its own labels and values");
// The xmlns is a namespace, not a fetch: what must be absent is any reference
// the renderer would have to go and get.
test.assert(!barsSvg.includes("xlink:href") && !/<image\b/.test(barsSvg) && !/url\(\s*["']?https?:/.test(barsSvg), "with nothing external to fetch");
test.assert(barsSvg.includes("role=\"img\"") && barsSvg.includes("aria-label"), "and a name for assistive technology");
["matrix", "grid", "trace", "score"].forEach((projection) => {
  const drawn = chart.projectionSvg(parsed, projection);
  test.assert(drawn.startsWith("<svg") && drawn.endsWith("</svg>"), `the ${projection} projection draws its own page`);
  test.assert(drawn.includes("<text"), `the ${projection} projection carries readable text`);
});

const stagePage = chart.stageMarkdown(parsed, "bars");
test.assert(stagePage.includes("data:image/svg+xml;base64,"), "the stage page embeds the drawing as an image");
test.assert(stagePage.includes("<!-- _class: evidence"), "and declares the evidence layout");
const stageEmbed = context.window.AISystem6EditEmbeds.parseEmbeds(stagePage)[0];
test.assert(stageEmbed?.kind === "chart" && /MacBook Air 15 M5/.test(stageEmbed.data.markdown), "and carries the source table as an editable chart copy");
test.assert(stageEmbed.data.markdown.includes("bars"), "the copy remembers the projection it was drawn with");
test.assert(chart.svgBase64("A&B") === Buffer.from("A&B", "utf8").toString("base64"), "the encoder survives non-ASCII and markup");

// The bars projection is markup without a DOM in it, so the contract can read
// what the reader would actually see.
const barsDrawn = chart.barsMarkup(parsed, { column: 0, sortMode: "desc", descending: true });
test.assert((barsDrawn.markup.match(/clio-chart-bar /g) || []).length === 4, "every measured row gets exactly one bar");
test.assert(barsDrawn.markup.includes('data-pattern="0"') && barsDrawn.markup.includes("is-reference"), "the reference object keeps the solid pattern and the row marker");
test.assert(barsDrawn.markup.includes("clio-chart-extension"), "a measured range draws its extension");
test.assert(barsDrawn.missing.includes("MacBook Air 15 M4"), "a column with a blank states which row was not measured");
const twoRow = chart.parseTable(["| Device | Score |", "|---|---|", "| Slow | 10 |", "| Fast | 90 |"].join("\n"));
const names = (markup) => [...markup.matchAll(/clio-chart-row-name"[^>]*>(?:▶ )?([^<]*)</g)].map((match) => match[1].trim());
test.assert(names(chart.barsMarkup(twoRow, { column: 0, sortMode: "desc", descending: true }).markup)[0] === "Fast", "a ranking draws the highest value first");
test.assert(names(chart.barsMarkup(twoRow, { column: 0, sortMode: "source" }).markup)[0] === "Slow", "sort=source draws the file's own order instead");
const zeroMax = chart.barsMarkup(chart.parseTable(["| Device | Score |", "|---|---|", "| A | 0 |", "| B | 0 |"].join("\n")), { column: 0 });
test.assert(!/width:NaN%/.test(zeroMax.markup) && !/width:-/.test(zeroMax.markup), "a column of zeros draws zero-length bars, never NaN or a negative width");

// The other four projections are markup too, so each one can be read back.
const matrixMarkup = chart.matrixMarkup(parsed, { column: 0 });
test.assert(matrixMarkup.includes("clio-chart-matrix") && matrixMarkup.includes("is-rollup"), "the matrix draws its grid and its computed rollup row");
test.assert(matrixMarkup.includes("clio-chart-rollup-note") || matrixMarkup.includes("clio_chart_rollup_note"), "and says the rollup was computed, not measured");
test.assert(chart.traceMarkup(traceTable, {}).includes("clio-chart-trace-line"), "the trace draws its series as paths");
test.assert(chart.traceMarkup(traceTable, {}).includes('class="clio-chart-axis"'), "with axes");
const gridMarkup = chart.gridMarkup(parsed, { column: 0 });
test.assert(gridMarkup.includes("clio-chart-spatial-cell") && gridMarkup.includes("data-density"), "the spatial grid draws one cell per object with a density");
test.assert(gridMarkup.includes("clio-chart-spatial-summary"), "and states its maximum, average and minimum");
const scoreMarkup = chart.scoresMarkup(parsed, { column: 2 });
test.assert(scoreMarkup.includes("clio-chart-score-row"), "the score projection draws its rows");
test.assert(scoreMarkup.includes("clio_chart_score_no_total") || scoreMarkup.includes("clio-chart-score-note"), "and refuses to invent a weighted total");

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
const manifest = read("tooling/runtime-manifest.mjs");
const styleManifest = read("tooling/style-manifest.mjs");
const menus = read("app/data/menus.js");
const app = read("app.js");
const multiFinder = read("app/core/multi-finder.js");
const windowRegistrySource = read("app/core/window-registry.js");
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
test.assertIncludes(manifest, '"app/features/clio-diagram.js"', "the drawing canvas is a lazy runtime path too");
test.assertNotIncludes(html, "app/features/clio-diagram.js", "and never a startup script tag");
test.assertIncludes(styleManifest, '"styles/87-clio-chart.css"', "the stylesheet is in the style manifest");
test.assertMatches(config, /createLazyModuleLoader\("AISystem6ClioChartLoaded", \[[^\]]*"app\/features\/clio-chart\.js", "app\/features\/clio-diagram\.js"\], false, \["styles\.clio-chart\.css"[^\]]*\]\)/, "the lazy loader brings the stylesheet with the module");
// The sheet also dresses one ClioStage element: .clio-stage-chart-slide is added
// when a slide carries a chart snapshot, and a restored session can bring that
// snapshot back without ClioChart having been opened this boot. ClioStage must
// therefore pull the same sheet, or a restored chart slide loses its styling.
// The intent is "this loader pulls the chart sheet", not the exact array: the
// deck's theme module now rides along with the same loader.
test.assertMatches(
  config,
  /createLazyModuleLoader\("AISystem6ClioStageLoaded", \[[^\]]*app\/features\/clio-stage\.js[^\]]*\], false, \["styles\.clio-chart\.css"[^\]]*\]\)/,
  "ClioStage pulls the chart stylesheet for a restored chart slide"
);
test.assertIncludes(styleManifest, '"styles.clio-chart.css"', "the stylesheet ships as its own lazy bundle, off the boot payload");
test.assertIncludes(html, 'data-window="clioChart"', "the window is declared in index.html");
test.assert(windowApp("clioChart") === "clioChart", "the window maps to its own application");
// ClioChart is lazy, so its menu set is registered by its own module rather
// than shipped in the shell's eager table (the same shape doom, micropolis,
// one-more-tune, clio-paint, openttd and bonsai-city already use).
test.assertIncludes(source, 'AISystem6RegisterApplicationMenuSet?.("clioChart"', "the application owns a menu set, registered with the module");
test.assert(!menus.includes("clioChart: clioChartMenus"), "the shell no longer carries rows for a window that is not open");
test.assertIncludes(menus, 'menuItem("see-as-chart", "clio_chart_see_as_chart")', "TeachText carries the menu twin of the in-body button");
test.assertIncludes(source, '"open-clio-chart"', "the open action is registered in the lazy module");
test.assertIncludes(read("app/core/app-admissions.js"), '"open-clio-chart"', "the open action is admitted through the shared table");
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
  test.assertIncludes(source, `"${id}"`, `${id} is the shadow of a visible menu command`);
});

test.assertIncludes(chatMessages, "function clioTalkHasChartableTable", "ClioTalk detects chartable assistant tables");
test.assertIncludes(chatMessages, 't("clio_chart_make_chart")', "assistant tables expose the Make Comparison Chart command");
test.assertIncludes(chatMessages, "await ensureClioChartModule()", "the reverse ClioTalk handoff loads the lazy module");
test.assertIncludes(chatMessages, "window.AISystem6ClioChart?.open?.({ markdown: content", "the reverse handoff passes the original Markdown");

test.assertIncludes(source, "async function sendClioChartToStage()", "the current projection can become one ClioStage page");
test.assertIncludes(source, 'embeds.embedMarkdown({ kind: "chart"', "the stage handoff carries the projection as a drawing the page owns, with the table as an editable copy");
test.assertIncludes(source.slice(source.indexOf("async function sendClioChartToStage()")), 'sourceKind: "generated",\n    temporary: true,', "the deck it opens is an ordinary unsaved deck, editable like any other");
test.assertNotIncludes(clioStage, "chartSnapshot", "a chart page is an ordinary page now: no frozen-snapshot path in ClioStage");
test.assertIncludes(source, 'menuItem("clio-chart-send-stage"', "Send to ClioStage is a visible chart menu command");
test.assertIncludes(source, '"clio-chart-send-stage"', "Send to ClioStage is wired through the runtime command layer");

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
  // The typeface is the one token whose default lives at its consumers, as a
  // var() fallback: declared on :root it resolved --ui-font there, which is
  // always Chicago, and every era's chart drew in 1-bit type.
  if (token === "--clio-chart-typeface") {
    test.assertNotIncludes(foundationCss, `${token}:`, `${token} has no :root default that would pin Chicago`);
    test.assertIncludes(css, `var(${token}, var(--ui-font))`, `${token} falls back to the era's own face at the chart`);
  } else {
    test.assertIncludes(foundationCss, `${token}:`, `${token} has a Classic 1-bit default`);
    test.assertIncludes(css, `var(${token})`, `${token} is consumed by the chart stylesheet`);
  }
  test.assertIncludes(liquidCss, `${token}:`, `${token} has a Liquid Glass override`);
});
test.assertNotIncludes(
  liquidCss,
  "body[data-theme=\"liquid-glass\"] .clio-chart",
  "Liquid Glass does not fork ClioChart selectors; component tokens own the second theme"
);

// --- No dead controls, no inert windows -----------------------------------
const windows = read("app/core/window-manager.js");
const teachTextAccessories = read("app/features/teachtext-accessories.js");
const responsive = read("styles/60-responsive.css");

// A window restored from the previous session must not come back inert. The
// cross-cutting rule lives in tests/features/lazy-window-restore.test.mjs;
// here we only pin ClioChart's own end of it.
test.assertIncludes(windowRegistrySource, "clioChart: {", "ClioChart is in the lazy-window registry openWindow consults");
test.assertIncludes(windowRegistrySource, "window.AISystem6ClioChart?.attach?.()", "the restored window is wired before the user touches it");
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

// Reverse Sort turns an order round. On a blank template there is no order,
// and the row used to stay black: it flipped a flag, repainted the same
// unmeasured rows in the same places and said nothing.
test.assert(
  typeof chart.canReverseSort === "function" && chart.canReverseSort() === false,
  "Reverse Sort reports itself unavailable while no table is loaded"
);
test.assertMatches(
  chartSource,
  /if \(action === "clio-chart-reverse-sort"\) \{\s*\n\s*return !!window\.AISystem6ClioChart\?\.canReverseSort\?\.\(\);/,
  "the menu row asks that same question instead of staying enabled"
);
test.assertIncludes(
  read("app/core/balloon-help.js"),
  'if (action === "clio-chart-reverse-sort") return "balloon_disabled_chart_no_order";',
  "the greyed row names the measurement it wants, not the generic window reason"
);
["balloon_disabled_chart_no_order"].forEach((key) => {
  test.assert(en.includes(`${key}:`) && zh.includes(`${key}:`), `${key} exists in both languages`);
});
test.assertIncludes(
  bootstrap,
  "teachTextSeeAsChartButton,",
  "the startup bootstrap receives the chart button from the shared DOM handle registry"
);
test.assertIncludes(
  source,
  'action === "see-as-chart"',
  "the menu and in-body button share the same table availability rule"
);
test.assertMatches(
  html,
  /class="[^"]*\bteachtext-details-controls\b[^"]*"[\s\S]*?id="teachtext-see-as-chart"[\s\S]*?id="teachtext-chart-owner"[\s\S]*?<\/div>[\s\S]*?id="teachtext-status"/,
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
test.assertIncludes(source, 'submenu("clio_chart_new_from_template"', "the presets live in File > New");
test.assert(admittedApplicationGroup("open-clio-chart") === "create", "ClioChart is a real entry in the Applications folder");
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

// ClioChart owns one table block at a time by re-finding it in TeachText's own
// text — the same invariant Quick Draft's 听稿 fix-adopt and the desk-record
// commit fence both hold: locate by the content you last wrote, and refuse
// the write-back rather than splice into whatever the writer typed while you
// were away. The refusal has to land somewhere the writer can actually see
// it, not just the console.
test.assertMatches(
  chartSource,
  /const index = document_\.indexOf\(owner\.text\);\s*\n\s*if \(index < 0\) \{\s*\n\s*setClioChartStatus\(t\("clio_chart_write_back_failed"\)\);\s*\n\s*return false;/,
  "write-back re-locates the owned block by its exact last-written text and refuses instead of guessing when it is gone"
);
test.assertIncludes(
  chartSource,
  'status: document.querySelector("#clio-chart-status")',
  "the refusal renders through the window's own on-screen status element, not only the console"
);

// --- prose to chart: the model proposes, the source decides ---------------
// A chart drawn from prose keeps a value only when the source wrote it, in a
// sentence that also names the row. These run the real grounding function.
const PROSE = [
  "我们测了三台机器。MacBook Air 的续航是 17.2 小时，售价 8,999 元。",
  "ThinkPad X1 续航 14 小时，售价 12999 元。",
  "Surface Laptop 续航约 15 小时。",
].join("\n");
const groundedProse = chart.ground({
  title: "MacBook Air 续航最长",
  kind: "quantitative",
  subject: "机型",
  columns: [{ text: "续航", unit: "小时" }, { text: "售价", unit: "元" }],
  rows: [
    { label: "MacBook Air", cells: [{ text: "17.2", quote: "MacBook Air 的续航是 17.2 小时" }, { text: "8999", quote: "售价 8,999 元" }] },
    { label: "ThinkPad X1", cells: [{ text: "14 小时", quote: "" }, { text: "12999", quote: "ThinkPad X1 续航 14 小时，售价 12999 元" }] },
    { label: "Surface Laptop", cells: [{ text: "约 15", quote: "Surface Laptop 续航约 15 小时" }, { text: "9999", quote: "售价 9999 元" }] },
  ],
  reading: "续航差了 3.2 小时",
}, PROSE, { language: "zh" });
const proseTable = chart.parseTable(groundedProse.markdown);
const proseCell = (row, column) => proseTable.rows[row].cells[column].text;
test.assert(proseCell(0, 1) === "8999", "1,234 and 1234 are the same number: a thousands separator does not unground a value");
test.assert(proseCell(1, 0) === "14", "without a quote, a value is grounded by a source sentence holding both the value and the row's name");
test.assert(proseCell(2, 0) === "15 ?", "a hedged source value (约) is kept and marked uncertain, not rounded into certainty");
test.assert(proseCell(2, 1) === "", "a number the source never wrote is left blank, exactly like an unmeasured cell");
test.assert(groundedProse.blanked === 1 && groundedProse.kept === 5, "the grounding counts what it kept and what it cleared");
test.assert(groundedProse.reading === "", "a reading that states a computed number (3.2) is dropped, not shown");
test.assert(groundedProse.title === "MacBook Air 续航最长", "a title without invented numbers is kept");
test.assert(proseTable.columns[0].unit === "小时", "the unit lives in the column header");
test.assert(groundedProse.anchors.some((anchor) => anchor.row === 1 && anchor.column === 0 && anchor.quote.includes("ThinkPad X1")),
  "every kept cell carries the source sentence it stands on");

const elsewhere = chart.ground({
  kind: "quantitative",
  columns: [{ text: "分数" }],
  rows: [
    { label: "甲", cells: [{ text: "3" }] },
    { label: "乙", cells: [{ text: "17.2" }] },
  ],
}, PROSE, { language: "zh" });
test.assert(chart.parseTable(elsewhere.markdown).rows[1].cells[0].text === "",
  "digits that occur elsewhere in the text do not ground a value for a row the sentence never names");

const mixedUnits = chart.ground({
  kind: "quantitative",
  columns: [{ text: "收入", unit: "元" }],
  rows: [
    { label: "A 店", cells: [{ text: "1.2万", quote: "A 店收入 1.2万" }] },
    { label: "B 店", cells: [{ text: "8000元", quote: "B 店收入 8000元" }] },
  ],
}, "A 店收入 1.2万。B 店收入 8000元。", { language: "zh" });
test.assert(chart.parseTable(mixedUnits.markdown).rows[0].cells[0].text === "1.2万 ?",
  "a value written in another unit keeps its own unit and is marked uncertain instead of being converted");

const qualitative = chart.ground({
  kind: "qualitative",
  subject: "工具",
  columns: [{ text: "离线可用" }, { text: "导出" }],
  rows: [
    { label: "DocMap", cells: [{ text: "有", quote: "DocMap 离线可用" }, { text: "PDF 和 Markdown" }] },
    { label: "ClioStage", cells: [{ text: "—", quote: "ClioStage 需要模型" }, { text: "一键分享到云端" }] },
    { label: "Reader", cells: [{ text: "●" }, { text: "有" }] },
  ],
}, "DocMap 离线可用，导出 PDF 和 Markdown。ClioStage 需要模型。Reader 有时也行。", { language: "zh" });
const qualitativeTable = chart.tableFromGrounded(qualitative);
test.assert(qualitativeTable.rows[0].cells[1].text === "PDF 和 Markdown", "a qualitative cell keeps the source's own phrase");
test.assert(qualitativeTable.rows[1].cells[1].text === "", "a phrase the source never wrote is cleared from a qualitative cell");
test.assert(qualitativeTable.rows[1].cells[0].text === "—", "the three marks are the only non-source text a qualitative cell may hold");
test.assert(qualitativeTable.rows[0].cells[0].text === "●", "a yes word becomes the full mark, so every cell of one kind reads the same way");
test.assert(qualitativeTable.rows[2].cells[0].text === "", "a mark that points at no source words is cleared");
test.assert(qualitativeTable.rows[2].cells[1].text === "", "a one-character phrase does not count as the source saying it");
const borrowed = chart.ground({
  kind: "qualitative",
  columns: [{ text: "AI" }],
  rows: [
    { label: "Ulysses", cells: [{ text: "无", quote: "没有内置 AI" }] },
    { label: "Obsidian", cells: [{ text: "无", quote: "没有内置 AI" }] },
  ],
}, "Ulysses 没有内置 AI。Obsidian 靠插件。", { language: "zh" });
const borrowedTable = chart.parseTable(borrowed.markdown);
test.assert(borrowedTable.rows[0].cells[0].text === "—" && borrowedTable.rows[1].cells[0].text === "",
  "a reading borrowed from a sentence about another row is cleared");
test.assert(qualitativeTable.config.projection === "compare", "a qualitative matrix opens in the comparison projection");
test.assert(chart.isChartable(qualitativeTable), "a declared comparison table is chartable even with no numeric column");
test.assert(chart.serializeTable(chart.parseTable(chart.serializeTable(qualitativeTable))) === chart.serializeTable(qualitativeTable),
  "the comparison table survives the round trip");
const compareSvg = chart.projectionSvg(qualitativeTable, "compare", { ink: "#000", tint: "#eee", paper: "#fff" }, { heading: "两件工具" });
test.assert(compareSvg.startsWith("<svg") && compareSvg.includes("<circle") && !/https?:\/\/(?!www\.w3\.org)/.test(compareSvg),
  "the comparison drawing is a self-contained SVG with drawn marks");
test.assertIncludes(chart.compareMarkup(qualitativeTable), "clio_chart_mark_full", "marks carry a spoken name for screen readers");

const transposed = chart.orientForChart(chart.parseTable("| 指标 | 周报 | 月报 |\n|---|---|---|\n| 写作时间（小时） | 2 | 1 |\n| 协作请求（次/月） | 3 | 11 |"));
test.assert(transposed.rows.map((row) => row.label).join(",") === "周报,月报" && transposed.columns[0].unit === "小时",
  "metrics written down the side are turned round so one axis never mixes units");
test.assert(chart.deckProjection(transposed) === "matrix", "a deck page comparing two metrics across a few objects draws the matrix");
test.assert(chart.orientForChart(parsed) === parsed, "a table already written objects-down is left as it is");
const fitted = chart.projectionSvg(transposed, "matrix", { ink: "#000", tint: "#eee", paper: "transparent" }, { omitHeading: true, fit: true });
const fittedHeight = Number((fitted.match(/viewBox="0 0 1280 (\d+)"/) || [])[1]);
test.assert(fittedHeight > 0 && fittedHeight < 400, "a two-row drawing for a deck page is cropped to its content instead of a 720-tall canvas");
test.assert(!/font-size="30"/.test(fitted), "a drawing on a titled page carries no second title");

const suggest = (markdown) => chart.suggestProjection(chart.parseTable(markdown));
test.assert(suggest("| 年份 | 销量 |\n|---|---|\n| 2022 | 10 |\n| 2023 | 12 |\n| 2024 | 15 |") === "trace", "a time axis is drawn as a trace");
test.assert(suggest("| 机型 | 续航 |\n|---|---|\n| A | 10 |\n| B | 12 |") === "bars", "one metric across objects is ranked bars");
test.assert(suggest("| 机型 | a | b | c |\n|---|---|---|---|\n| A | 1 | 2 | 3 |\n| B | 4 | 5 | 6 |\n| C | 7 | 8 | 9 |") === "matrix", "several metrics across several objects is the matrix");
test.assert(suggest("| 项 | 评分 |\n|---|---|\n| 屏幕 | 88 / 98 -> 90% |\n| 续航 | 70 / 100 -> 70% |") === "score", "scores are drawn as scores");

const longSource = [`${"无数字的铺垫。".repeat(800)}`, "关键数据：A 为 42。", `${"更多铺垫。".repeat(800)}`].join("\n\n");
test.assert(chart.packSource(longSource, 3000).includes("A 为 42"), "a long text keeps its numeric paragraphs before anything else");
test.assert(chart.parseModelJson("```json\n{\"candidates\":[]}\n```").candidates.length === 0, "a fenced JSON answer still parses");
test.assert(chart.parseModelJson("not json") === null, "a non-JSON answer parses to nothing rather than throwing");

test.assertIncludes(source, "makeClioChartFromSource(clioChartTextContext(text, t(\"clipboard\")))", "pasted prose goes to the model path instead of being refused");
test.assertIncludes(source, "if (clioChartState.editing || getActiveEditableElement()) return;", "a paste into a cell or the source view stays that field's text");
test.assertIncludes(source, "return makeClioChartFromSource();", "See as Chart with no table under the caret charts the selection or document");
test.assertIncludes(source, 'ai_system6_task_kind: "clio-chart"', "the extraction run is a ClioChart task kind");
test.assertIncludes(source, 'resolveWritingRoutePrompt("source-apps.cliochart-magic")', "the drawing contract is a shared prompt file");
test.assertIncludes(source, "if (!table || !extraction?.temporary) return null;", "only a temporary prose chart is saved as a new document");

// --- concept drawings: boxes stand on sentences ------------------------------
const ESSAY = [
  "去年三月起，编辑部把周报改成了月报。",
  "过去每周五下午，每个人要花大约 2 小时写周报。全组 9 个人，一周就是 18 个小时。",
  "主编老陈在复盘会上说：我们写周报，是在给自己一种在推进的错觉。",
  "改制后的六个月里，跨组协作请求从每月 3 次增加到 11 次。",
].join("\n");
const drawn = diagramApi.ground({
  kind: "flow",
  title: "周报改成月报之后协作变多",
  why: "改版的因果",
  nodes: [
    { id: "a", label: "周报每人每周约 2 小时", quote: "每个人要花大约 2 小时写周报" },
    { id: "b", label: "全组每周 18 小时", quote: "全组 9 个人一周就是 18 个小时" },
    { id: "c", label: "协作 3 → 11 次/月", quote: "跨组协作请求从每月 3 次增加到 11 次" },
    { id: "d", label: "效率提升 266%", quote: "跨组协作请求从每月 3 次增加到 11 次" },
    { id: "e", label: "大家都很开心", quote: "团队氛围变得更好了" },
  ],
  edges: [{ from: "a", to: "b", label: "导致" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "e" }],
  groups: [{ label: "成本", nodes: ["a", "b"] }, { label: "孤组", nodes: ["c"] }],
}, ESSAY);
const drawnIds = drawn.diagram.nodes.map((node) => node.id);
test.assert(drawnIds.join(",") === "a,b,c", "boxes are kept only when they stand on a source sentence and invent no number");
test.assert(drawn.dropped === 2, "the drawing counts the boxes it could not ground");
test.assert(drawn.diagram.nodes[1].quote.includes("18 个小时"), "a quote missing a comma still finds its sentence");
test.assert(drawn.diagram.edges.length === 2 && drawn.diagram.edges.every((edge) => drawnIds.includes(edge.from) && drawnIds.includes(edge.to)),
  "a wire to a box that was not drawn is not drawn either");
test.assert(drawn.diagram.edges[0].label === "导致", "a wire keeps its short label");
test.assert(drawn.diagram.groups.length === 1, "a group needs two boxes that were drawn");

const placed = diagramApi.layout(drawn.diagram, "flow");
diagramApi.kinds.forEach((kind) => {
  const redrawn = diagramApi.layout(placed, kind);
  test.assert(JSON.stringify(redrawn.nodes.map((node) => [node.id, node.label, node.quote])) === JSON.stringify(placed.nodes.map((node) => [node.id, node.label, node.quote]))
    && redrawn.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && node.x >= 0),
  `changing the drawing to ${kind} moves boxes and keeps every label and source`);
});
const timelineDrawing = diagramApi.layout(placed, "timeline");
test.assert(timelineDrawing.nodes[0].x < timelineDrawing.nodes[1].x && timelineDrawing.nodes[1].x < timelineDrawing.nodes[2].x, "a timeline reads left to right in the order of the wires");

const partial = '{"candidates":[{"kind":"flow","nodes":[{"id":"a","label":"x","quote":"y"}],"edges":[]},{"kind":"tree","nodes":[],"title":"含 } 括号的字符串"},{"kind":"cycle","nodes":[{"id":"a","lab';
const streamed = diagramApi.streamCandidates(partial);
test.assert(streamed.length === 2 && streamed[1].kind === "tree", "each candidate is read the moment its object closes, while the next is still arriving");

const drawingSvg = diagramApi.svg(placed, { ink: "#000", tint: "#eee", paper: "#fff" }, { heading: "周报改月报" });
test.assert(drawingSvg.startsWith("<svg") && drawingSvg.includes("marker") && !/https?:\/\/(?!www\.w3\.org)/.test(drawingSvg), "a drawing exports as a self-contained SVG with arrowheads");
const outline = diagramApi.markdown(placed, "便签本");
test.assert(outline.includes("<!-- cliodiagram: flow -->") && outline.includes("出处：「每个人要花大约 2 小时写周报」"), "a saved drawing reads in TeachText as boxes with their sources");
test.assert(diagramApi.packSource(`## 一\n\n${"甲。".repeat(3000)}\n\n## 二\n\n数据是 42。`, 2000).includes("## 二"), "a long text keeps its headings for the main-line drawing");

const diagramSource = read("app/features/clio-diagram.js");
test.assertIncludes(diagramSource, "if (!quote || clioChartNumbersIn(label).some((value) => !quoted.includes(value)))", "a label may compress its sentence but never add a number to it");
test.assertIncludes(source, "objects.forEach((raw, index) => {", "candidates are grounded as they stream in, so the gallery lights card by card");
test.assertIncludes(source, "for (let index = extraction.candidates.length; index < 3; index += 1)", "cards still on their way show as skeletons");
test.assertIncludes(source, "if (!extraction.candidates.length) extraction.failed = message;", "Stop keeps the cards that already lit");
test.assertIncludes(read("app/core/config.js"), '"app/features/clio-chart.js", "app/features/clio-diagram.js"]', "the drawing canvas loads with ClioChart");

// --- one-line edits: what changes, what is refused ---------------------------
const proposal = diagramApi.mergeProposal(placed, {
  kind: "timeline",
  nodes: [
    { id: "a", label: "周报：每人每周 2 小时" },
    { id: "b", label: "全组每周 99 小时" },
    { id: "z", label: "协作请求变多", quote: "跨组协作请求从每月 3 次增加到 11 次" },
    { id: "y", label: "大家很满意", quote: "团队士气高涨" },
  ],
  edges: [{ from: "a", to: "z" }, { from: "z", to: "y" }],
}, ESSAY);
test.assert(proposal.diagram.kind === "timeline" && proposal.diagram.nodes.every((node) => Number.isFinite(node.x)), "a proposal may change the way of drawing, and is placed again");
test.assert(proposal.diagram.nodes.find((node) => node.id === "a").quote === placed.nodes.find((node) => node.id === "a").quote, "a box the drawing already had keeps its source");
test.assert(proposal.diagram.nodes.find((node) => node.id === "b").label === placed.nodes.find((node) => node.id === "b").label, "a relabel that adds a number its source lacks is refused and the old label kept");
test.assert(proposal.added === 1 && proposal.refused.includes("大家很满意"), "a new box needs a source sentence; one without is refused and named");
test.assert(proposal.removed === 1 && !proposal.diagram.nodes.some((node) => node.id === "c"), "a box the proposal leaves out is counted as removed");
test.assert(proposal.diagram.edges.length === 1, "a wire to a refused box is not drawn");

const timelinePage = diagramApi.fromSlidePage("<!-- _class: timeline light -->\n\n## 改制经过\n\n- **去年三月** 周报改成月报\n- **六个月后** 协作请求每月 11 次\n- **下一步** 三问做成模板", "timeline", ESSAY);
test.assert(timelinePage?.kind === "timeline" && timelinePage.nodes.length === 3 && timelinePage.edges.length === 2, "a timeline page is drawn as a timeline of its own items");
test.assert(timelinePage.nodes[1].quote.includes("11 次"), "a drawn page's boxes look for the source sentence they came from");
const sidesPage = diagramApi.fromSlidePage("<!-- _class: columns light -->\n\n## 两种写法\n\n### 周报\n- 每周 2 小时\n\n### 月报\n- 每月约 1 小时", "columns", "");
test.assert(sidesPage?.kind === "compare" && sidesPage.cols.join("|") === "周报|月报", "a two-sided page is drawn as a comparison with its two headings");
test.assert(diagramApi.fromSlidePage("## 只有一句", "columns", "") === null, "a page that does not have two sides is left as it is");

// ---- The canvas's arrangement (edit kernel), run through the real module ----
{
  const run = (code) => vm.runInContext(code, context);
  const same = (actual, expected, message) => test.assert(actual === expected, `${message} (got ${JSON.stringify(actual)})`);
  diagramApi.load({
    kind: "flow", title: "t", groups: [], edges: [{ id: "e1", from: "a", to: "b", label: "" }],
    nodes: [
      { id: "a", label: "甲", quote: "甲", x: 100, y: 40, w: 110 },
      { id: "b", label: "乙", quote: "乙", x: 400, y: 90, w: 110 },
      { id: "c", label: "丙", quote: "丙", x: 700, y: 140, w: 110, locked: true },
    ],
  }, { temporary: true });
  run('clioDiagramState.selection = ["a", "b", "c"]; clioDiagramState.keyId = "b";');
  test.assert(diagramApi.arrange("align-top"), "Align runs on a selection of two or more unlocked boxes");
  const ys = run("JSON.stringify(clioDiagramState.diagram.nodes.map((node) => node.y))");
  same(ys, "[90,90,140]", "Align Top lines the selection up to the box clicked last, and a locked box stays put");
  same(diagramApi.undoLabel(), "edit_step_align", "the whole alignment is one named step");
  diagramApi.undo();
  same(run("clioDiagramState.diagram.nodes[0].y"), 40, "one undo puts every box back");
  run('clioDiagramState.selection = ["a"];');
  test.assert(!diagramApi.canArrange("align-left"), "Align needs two movable boxes");
  diagramApi.arrange("bring-front");
  same(run("clioDiagramState.diagram.nodes.at(-1).id"), "a", "Bring to Front draws the box last");
  run('clioDiagramState.diagram.nodes.find((node) => node.id === "b").hidden = true;');
  const svg = diagramApi.svg(diagramApi.current());
  test.assert(!svg.includes("乙") && svg.includes("甲"), "a hidden box is left out of the drawing a slide carries");
  test.assertNotIncludes(diagramApi.markdown(diagramApi.current()), "乙", "and out of the Markdown outline");
  test.assert(run("clioDiagramState.diagram.nodes.some((node) => node.id === 'b')"), "while it stays in the document");
}

// ---- A drawing's SVG carries the drawing (preserve editing) ------------------
{
  const drawing = { kind: "flow", title: "t", groups: [], edges: [{ id: "e1", from: "a", to: "b", label: "" }],
    nodes: [{ id: "a", label: "甲", quote: "甲", x: 100, y: 40, w: 110 }, { id: "b", label: "乙", quote: "", x: 400, y: 40, w: 110, hidden: true }] };
  const svg = diagramApi.svg(drawing);
  const back = diagramApi.fromSvg(svg);
  test.assert(back && back.nodes.length === 2 && back.nodes[1].hidden === true, "an SVG of a drawing opens back as the whole editable drawing, hidden boxes included");
  test.assert(diagramApi.fromSvg("<svg><metadata>x</metadata></svg>") === null, "any other SVG is not mistaken for one");
  test.assertNotIncludes(diagramApi.svg(drawing, {}, { preserve: false }), "clio-embed", "the data can be left out when asked");
}

// ---- Fill series and validation (gridcraft), executed --------------------
{
  const same = (actual, expected, message) => test.assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)})`);
  same(chart.series(["Q1", "Q2"], 4), ["Q3", "Q4", "Q1", "Q2"], "quarters continue and wrap");
  same(chart.series(["一月", "三月"], 2), ["五月", "七月"], "a named list keeps its step");
  same(chart.series(["第1轮"], 2), ["第2轮", "第3轮"], "text around one number counts on");
  same(chart.series(["2023", "2024"], 2), ["2025", "2026"], "years in the labels continue exactly");
  same(chart.series(["10", "12", "15"], 1, { estimate: true }), ["17?"], "data values continue their least-squares line, marked as an estimate");
  same(chart.series(["1.5", "2.0"], 1, { estimate: true }), ["2.5?"], "and keep the seeds' decimals");
  test.assert(chart.series(["42"], 3, { estimate: true }) === null, "one bare data value is not a series: nothing is invented");
  test.assert(chart.series(["A", "B"], 2) === null, "words that are not a known list do not fill");
  const rules = chart.parseValid(chart.formatValid([{ column: "续航 (h): 实测", min: 0, max: 24, level: "warn" }, { column: "分数", min: 0, max: null, level: "stop" }]));
  same(rules.map((rule) => [rule.column, rule.min, rule.max, rule.level]), [["续航 (h): 实测", 0, 24, "warn"], ["分数", 0, null, "stop"]], "column rules round-trip through the table's comment, even with a colon in the name");
  same(chart.cellViolation(rules[0], { text: "30", value: 30 }), "warn", "a value outside the range breaks the rule at the rule's level");
  same(chart.cellViolation(rules[0], { text: "", value: null }), "", "a blank cell is unknown, never invalid");
  same(chart.cellViolation(rules[1], { text: "未测", value: null }), "stop", "words in a ruled column break the rule");
  const ruled = chart.parseTable("<!-- cliochart: bars, valid=\"分数:0..100:stop\" -->\n\n| 机型 | 分数 | 备注 |\n| --- | --- | --- |\n| A | 120 | 1 |\n| B | 80 | x |\n");
  same(chart.invalidCells(ruled).map((cell) => [cell.row, cell.column, cell.level]), [[0, 0, "stop"], [1, 1, "info"]], "Circle Invalid finds rule breaks and non-numbers");
  test.assertIncludes(chart.serializeTable(ruled), 'valid="分数:0..100:stop"', "the rule is kept in the table's own comment");
}

test.finish();
