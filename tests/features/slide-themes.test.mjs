// The deck's own resources: eight eras, sixteen layouts, five argument modes,
// the spec block, the gates and the print sheet. These are behaviour checks —
// the module is loaded and asked questions — rather than string searches, which
// is what the previous generation of deck tests did and what let a dead field
// survive several releases.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("slide-themes");

const source = read("app/features/slide-themes.js");
const manifest = read("tooling/runtime-manifest.mjs");
const config = read("app/core/config.js");
const indexHtml = read("index.html");

// A bare context is enough: at load the module only touches `window`, and every
// browser-facing helper lives inside a function this test does not call.
function loadModule() {
  const context = {
    window: {},
    console,
    currentLanguage: "zh",
    escapeHtml: (value) => String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    markdownToSystemHtml: (markdown) => `<p>${String(markdown).trim()}</p>`,
  };
  vm.runInNewContext(source, context);
  return context.window.AISystem6SlideThemes;
}

const themes = loadModule();
const index = themes.index();

// The harness offers assert/assertIncludes; equality with a readable message is
// the one helper this contract needs on top of them.
const eq = (actual, expected, message) => test.assert(
  actual === expected,
  actual === expected ? message : `${message} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
);

test.assert(themes && typeof themes.index === "function", "the module exposes the slide theme runtime on window");
eq(index.eras.length, 8, "eight eras, matching the eight desk appearances");
eq(index.layouts.length, 16, "sixteen page layouts");
eq(index.modes.length, 5, "five argument modes");
eq(index.readingModes.length, 3, "three reading distances");
eq(index.canvases.join(","), "16:9,4:3", "the deck offers 16:9 and 4:3");

// The eras reuse the desk registry's identity rather than inventing a second
// one: same ids, in the same order, with the same years.
const registry = read("app/core/theme-registry.js");
index.eras.forEach((era) => {
  test.assertIncludes(registry, `id: "${era.id}"`, `era ${era.id} exists in the appearance registry`);
});
eq(
  index.eras.map((era) => era.id).join(","),
  // A registered appearance ClioStage has no deck era for (Tiger) is skipped;
  // the ones it does have keep the registry's order.
  registry.match(/id: "([a-z0-9-]+)"/g).map((entry) => entry.slice(5, -1))
    .filter((id) => index.eras.some((era) => era.id === id)).join(","),
  "the era order follows the registry's order"
);

// Every era must actually style every layout: a class that renders with the
// browser's defaults is the failure this check exists for.
index.eras.forEach((era) => {
  const css = themes.cssFor(era.id);
  test.assertIncludes(css, `/* clio-slide-theme: ${era.id} */`, `${era.id} names itself in the style block`);
  test.assertIncludes(css, `section.era-${era.id}`, `${era.id} carries its own token block`);
  const missing = index.layouts.filter((layout) => !css.includes(`section.${layout.id}`));
  eq(missing.length, 0, `${era.id} defines all ${index.layouts.length} layouts`);
  test.assert(css.includes("--slide-muted: #"), `${era.id} declares a muted ink for small text`);
});

// Layouts and modes are separate axes: every mode must be able to place a
// majority of the page kinds, and the first page of a deck must be a hero.
index.modes.forEach((mode) => {
  test.assert(mode.affinity.length >= 6, `${mode.id} can place at least six page kinds`);
  test.assert(mode.affinity.includes("cover"), `${mode.id} can open a deck`);
  test.assert(mode.titleRule.length > 0, `${mode.id} states its title rule`);
  const unknown = mode.affinity.filter((id) => !index.layouts.some((layout) => layout.id === id));
  eq(unknown.length, 0, `${mode.id} names only real layouts`);
});

// Scoping: only `section` rules reach the slide frame, and the shell keeps its
// own geometry — that is what stops the deck CSS from rewriting ClioStage.
const scoped = themes.scopeCss(themes.cssFor("big-sur"), ".clio-stage-slide-frame", { dropContainers: true });
test.assertIncludes(scoped, ".clio-stage-slide-frame.era-big-sur", "the token block reaches the frame");
test.assert(!/^\s*section\s*\{/m.test(scoped), "no bare section rule survives scoping");
test.assert(!/\.clio-stage-slide-frame\s*\{[^}]*width:\s*1280px/.test(scoped), "the frame keeps its own geometry");
test.assert(!scoped.includes("body {"), "app-wide rules are never injected");

// The spec block and the per-page directives.
const spec = themes.defaultSpec();
const line = themes.specLine({ mode: "pyramid", era: "aqua", canvas: "4:3", reading: "presentation" });
test.assert(line.startsWith("<!-- clio-deck: {") && line.endsWith(" -->"), "the spec is one HTML comment");
eq(themes.parseSpec(`# x\n${line}\ny`).era, "aqua", "the spec reader returns the era");
// A deck is a file someone else may have written: an era the module does not
// know must not reach the print sheet's markup, which runs in the desk's origin.
const hostileSpec = '<!-- clio-deck: {"era":"x\\"><img src=x onerror=alert(1)>","canvas":"9:9"} -->';
eq(themes.cleanSpec(themes.parseSpec(hostileSpec)).era, "big-sur", "a renderer's view of an unknown era is the default");
eq(themes.cleanSpec(themes.parseSpec(hostileSpec)).canvas, "16:9", "and so is its view of an unknown canvas");
test.assert(!/onerror/.test(themes.printHtml({ title: "x", markdown: `${hostileSpec}\n\n# One\n` })),
  "a deck's spec line cannot write markup into the print sheet");
eq(themes.stripSpec(`a\n${line}\nb`), "a\nb", "the spec line is not deck content");

const goodDeck = [
  "---", "marp: true", "theme: default", "class: era-big-sur", "paginate: true", "size: 16:9", "---", "",
  themes.specLine({ mode: "pyramid", era: "big-sur", canvas: "16:9", reading: "balanced" }),
  "",
  "<!-- _class: cover hero -->", "<!-- job: 开场 -->", "# 标题", "",
  "---", "",
  "<!-- _class: evidence light -->", "## 结论", "![图](data:image/svg+xml;base64,AA)", "读法：……", "",
  "---", "",
  "<!-- _class: takeaway light -->", "## 收束", "1. 一", "2. 二", "3. 三", "",
  "---", "",
  "<!-- _class: closing hero -->", "## 最后", "出处：项目硬盘",
].join("\n");

const good = themes.validate(goodDeck, { strict: true });
eq(good.errors.join("|"), "", "a well-formed deck passes the structural gate");
eq(good.pages.length, 4, "four pages are read back");
eq(good.pages[1].layout, "evidence", "a page's layout comes from its _class directive");
eq(good.pages[0].surface, "hero", "a page's surface comes from its _class directive");
eq(good.pages[1].job, "", "a page without a job line reports none");
eq(good.pages[1].images.length, 1, "an embedded figure is reported as one image");

const noLayout = themes.validate("---\nmarp: true\n---\n\n<!-- clio-deck: {\"mode\":\"pyramid\",\"era\":\"big-sur\"} -->\n\n# 只有标题", { strict: true });
test.assert(noLayout.errors.includes("missing_layout:1") || noLayout.warnings.includes("missing_layout:1"), "a page with no layout is reported");

const badEra = themes.validate(themes.specLine({ era: "windows-95" }) + "\n\n<!-- _class: cover -->\n# x", { strict: true });
test.assert(badEra.errors.includes("unknown_era:windows-95"), "an unknown era is an error, never a guess");

const badLayout = themes.validate(
  `${themes.specLine({ mode: "pyramid", era: "big-sur" })}\n\n<!-- _class: cover -->\n# x\n\n---\n\n<!-- _class: pie-chart -->\n## y`,
  { strict: true }
);
test.assert(badLayout.errors.some((error) => error.startsWith("unknown_layout:")), "an unknown layout is an error");

const flatRhythm = themes.validate(
  [
    themes.specLine({ mode: "briefing", era: "big-sur" }),
    "<!-- _class: cover -->", "# x",
    "---", "<!-- _class: ledger light -->", "## a",
    "---", "<!-- _class: ledger light -->", "## b",
    "---", "<!-- _class: ledger light -->", "## c",
    "---", "<!-- _class: ledger light -->", "## d",
  ].join("\n"),
  { strict: true }
);
test.assert(flatRhythm.errors.some((error) => error.startsWith("surface_run:")), "three pages on one surface is an error");
test.assert(flatRhythm.errors.some((error) => error.startsWith("too_few_heroes:")), "a deck with no hero page is an error");

// An imported deck is not rejected: the same problem is a warning there.
const imported = themes.validate(flatRhythm.pages.map((page) => page.page).join("\n---\n"), { strict: false });
eq(imported.errors.length, 0, "a hand-written deck is never blocked by the rhythm rules");

// The receipt says what each page actually carries.
const receipt = themes.receipt(goodDeck);
eq(receipt.length, 4, "the receipt has one line per page");
eq(receipt[1].layout, "evidence", "the receipt names the layout that was declared");
eq(receipt[0].era, "big-sur", "the receipt names the era the deck carries");

// The print sheet is one page per slide, sized by the deck's canvas.
const printHtml = themes.printHtml({ title: "示例 deck", markdown: goodDeck, spec: { canvas: "16:9", era: "classic" } });
eq((printHtml.match(/class="clio-print-page/g) || []).length, 4, "the print sheet carries one section per slide");
test.assertIncludes(printHtml, "@page { size: 338.7mm 190.5mm; margin: 0; }", "16:9 prints at the PowerPoint page size");
test.assertIncludes(printHtml, "era-classic", "the print sheet renders the deck's own era");
test.assertIncludes(printHtml, "print-color-adjust: exact", "the printed page keeps the era's background");
test.assertIncludes(printHtml, "1 / 4", "the printed page carries its page number");

// Every page used to print top-aligned: the footer was appended last with
// margin-top:auto, so it took the page's free space and each layout's own
// alignment (cover low, lead and statement centred) did nothing, while the
// page's real last paragraph stopped being :last-child and lost its footnote
// rule. The footer is now first and out of the flow.
const firstPage = printHtml.slice(printHtml.indexOf("<section"), printHtml.indexOf("</section>"));
test.assert(/^<section[^>]*><footer class="slide-print-foot">/.test(firstPage), "the print footer is the page's first child, so the last paragraph stays :last-child");
test.assert(/\.slide-print-foot \{\s*position: absolute;/.test(printHtml), "and it is pinned to the page foot, out of the flex flow");
test.assert(!/slide-print-foot \{[^}]*margin-top: auto/.test(printHtml), "and it no longer claims the page's free space");
// A light-surface material must not paint over the ink ground of a dark page:
// Liquid Glass's wash left light type on a light page for the contrast layout.
for (const era of ["aqua", "liquid-glass"]) {
  const css = themes.cssFor(era);
  test.assert(new RegExp(`section\\.era-${era}:not\\(\\.dark\\) \\{[^}]*background-image`).test(css), `${era}'s background texture stays off dark pages`);
}
// An era's decoration (the 1988 transparency frame, the 1998 wedge) is page
// chrome drawn in ::before: in the flow it would ride down with a cover packed
// low or a centred page, as the old era bars did. Every such decoration is
// taken out of the flow.
for (const { id } of themes.eraList()) {
  const decoration = themes.cssFor(id).match(new RegExp(`section\\.era-${id}::before \\{[^}]*\\}`));
  if (decoration) test.assert(/position: absolute;/.test(decoration[0]), `${id}'s decoration is out of the page flow`);
}
// The eight eras are the period's own presentation software, not eight tints:
// each has a ground or a decoration no other era shares (evidence:
// internal/evidence/drafts/deck-eras/README.zh-CN.md).
{
  const signatures = themes.eraList().map(({ id }) => {
    const css = themes.cssFor(id);
    return css.slice(css.indexOf(`/* clio-slide-theme`)).replace(/era-[a-z-]+/g, "era");
  });
  test.assert(new Set(signatures).size === signatures.length, "no two eras render the same deck");
  test.assert(themes.byId("nextstep").year === 1995, "NeXTSTEP is dated to 3.3 (1995), as the registry and the Concurrence evidence are");
}
const contrastCss = themes.cssFor("big-sur");
test.assertIncludes(contrastCss, "section.contrast.dark td:nth-child(2), section.contrast.dark th:nth-child(2) { background: var(--slide-bg); color: var(--slide-ink); }",
  "on the ink ground the emphasised contrast column turns to paper instead of vanishing into the page");
test.assert(!/section\.(metric|contrast|duo-compare)[^{]*td[^{]*\{[^}]*font-family: var\(--slide-mono\)/.test(contrastCss) && !/section\.metric li strong \{[^}]*--slide-mono/.test(contrastCss),
  "big numbers are set in the display face with tabular figures, not the era's typewriter face");
const print43 = themes.printHtml({ title: "x", markdown: goodDeck, spec: { canvas: "4:3" } });
test.assertIncludes(print43, "@page { size: 254mm 190.5mm; margin: 0; }", "4:3 prints at its own page size");

// The frontmatter a deck leaves with.
const frontmatter = themes.frontmatter({ era: "aqua", canvas: "4:3", mode: "narrative", reading: "presentation" });
test.assertIncludes(frontmatter, "class: era-aqua", "the deck declares its era as a Marp class");
test.assertIncludes(frontmatter, "size: 4:3", "the deck declares its canvas");
test.assertIncludes(frontmatter, "style: |", "the era's CSS travels inline, so external Marp renders it too");
test.assertIncludes(frontmatter, "/* clio-slide-theme: aqua */", "the style block names the theme it carries");
test.assertIncludes(frontmatter, '<!-- clio-deck: {"canvas":"4:3","era":"aqua","mode":"narrative","reading":"presentation"} -->', "the spec line is written once");

// Wiring: one lazy module, loaded by both the authoring and the rendering path.
test.assertIncludes(manifest, '"app/features/slide-themes.js"', "the theme module is registered as a lazy runtime path");
test.assertIncludes(config, '["app/features/slide-themes.js", "app/features/slides-export.js"]', "the slides export loader brings the theme module with it");
test.assertIncludes(config, '["app/features/slide-themes.js", "app/features/clio-stage.js"]', "the ClioStage loader brings the theme module with it");
test.assertIncludes(source, 'dialog.id = "clio-deck-setup-modal"', "the deck setup dialog is built on demand, off the boot payload");
test.assert(!indexHtml.includes("clio-deck-setup-modal"), "and it is not parked in the shell");
test.assertIncludes(read("app/features/clio-stage.js"), 'button.setAttribute("data-action", "clio-stage-export-pdf")', "the Print PDF button arrives with the ClioStage module");
test.assertIncludes(read("app/data/menus.js"), 'menuItem("clio-stage-export-pdf", "print_pdf")', "and has its menu twin");

// The restyle route: another era, the same words.
// A restyle changes the era and nothing else — the mode travels with it, which
// is why the layout gate still has the same affinity to judge against.
const restyled = themes.restyle(goodDeck, { mode: "pyramid", era: "nextstep", canvas: "16:9", reading: "balanced" });
test.assertIncludes(restyled, "class: era-nextstep", "a restyle replaces the era the deck declares");
test.assertIncludes(restyled, "/* clio-slide-theme: nextstep */", "and the stylesheet it carries");
test.assert(!restyled.includes("era-big-sur"), "leaving none of the old identity behind");
test.assert(!restyled.includes("/* clio-slide-theme: big-sur */"), "including the old stylesheet");
test.assertIncludes(restyled, "<!-- _class: evidence light -->", "the body keeps every page directive");
test.assertIncludes(restyled, "读法：……", "and every word the writer put on a page");
test.assert(themes.validate(restyled, { strict: true }).errors.join("|") === "", "the restyled deck still passes the structural gate");

const keptKeys = themes.restyle(
  ["---", "marp: true", "theme: default", "header: 'A / B'", "class: era-classic", "style: |", "  section {}", "paginate: true", "---", "", "# x"].join("\n"),
  { ...themes.defaultSpec(), era: "aqua" }
);
test.assertIncludes(keptKeys, "header: 'A / B'", "a frontmatter key the writer added survives a restyle");
test.assertIncludes(keptKeys, "class: era-aqua", "while the era is replaced");
test.assert(!keptKeys.includes("section {}"), "and the old style block is gone");

// A menu row that reaches nothing is the failure this repository keeps a
// contract for ("Start Writing Route" took the click and did nothing). The
// restyle route is eight such rows.
const stageSource = read("app/features/clio-stage.js");
const menusSource = read("app/data/menus.js");
themes.eraList().forEach((era) => {
  test.assertIncludes(menusSource, `menuItem("clio-stage-restyle-${era.id}"`, `${era.id} has a restyle menu row`);
  test.assertIncludes(stageSource, `"clio-stage-restyle-${era.id}"`, `and the command it names is registered`);
});
test.assertIncludes(stageSource, 'if (command.startsWith("restyle-")) return clioStageRestyleEra(', "the row reaches the restyle handler");
test.assertIncludes(stageSource, "runtime.restyle(", "and the handler asks the theme module to do the restyle");

test.finish();
