// planCascadeImpact turns a stylesheet diff into the (appearance, viewport,
// windows) cells the targeted cascade ledger captures. The fixtures are small
// sheets and a two-window index; appearances come from the real registry, so
// a rule scoped to one era must land on that era (and its recipe children)
// and nowhere else.

import assert from "node:assert/strict";
import { diffStylesheets, planCascadeImpact, selectorThemes, subjectRequirements, windowsForSelector } from "../../tooling/lib/cascade-impact.mjs";
import { diffLedgers, encodeLedger } from "../../tooling/lib/cascade-diff.mjs";
import { windowOfPath } from "../../tooling/lib/cascade-page.mjs";

const INDEX = {
  roots: { "div#lab-panel": "themeLab" },
  ancestors: { tags: ["html", "body", "main"], ids: [], classes: ["desktop", "use-liquid-glass"] },
  inventory: {
    "(desk)": { tags: ["header", "div", "button"], ids: [], classes: ["menu-bar", "menu"] },
    themeLab: { tags: ["section", "div", "button"], ids: ["lab-panel"], classes: ["window", "theme-lab-window", "btn", "is-active"] },
    stickies: { tags: ["section", "textarea"], ids: [], classes: ["window", "stickies-window", "sticky-note"] },
  },
};
const plan = (file, before, after, extra = []) => planCascadeImpact([{ file, before, after }], {
  indexFor: () => INDEX,
  viewports: ["1440x960", "390x844"],
  allSheets: [{ file, text: after }, ...extra],
});
const cellsOf = (result) => result.cells.map((cell) => `${cell.theme}@${cell.viewport}:${cell.windows ? cell.windows.join("+") : "*"}`).sort();

// 1. The diff names the rule whose declaration changed, and a rule that moved
// into another @media is a change too.
{
  const diff = diffStylesheets(
    ".a { color: red; } .b { margin: 0 }",
    ".a { color: blue; } @media (max-width: 600px) { .b { margin: 0 } } /* a comment { */",
  );
  assert.deepEqual(diff.style.map((change) => change.selector).sort(), [".a", ".b", ".b"]);
  assert.deepEqual([...diff.style.find((change) => change.selector === ".a").properties], ["color"]);
  assert.equal(diffStylesheets(".a{color:red}", ".a {\n  color: red;\n}").style.length, 0, "whitespace is not a change");
}

// 2. Theme conditions: an exact id, a lineage parent (reaching its children), a
// family, a :not(), and the Liquid Glass body class.
{
  assert.deepEqual([...selectorThemes('body[data-theme="platinum"] .btn')], ["platinum"]);
  assert.deepEqual([...selectorThemes('[data-lineage~="platinum"] .btn')].sort(), ["drawing-board", "platinum"]);
  assert.deepEqual([...selectorThemes('body[data-theme-family="aqua"] .x')].sort(), ["aqua", "lion", "snow-leopard", "tiger"]);
  assert.equal(selectorThemes('body:not([data-theme="classic"]) .x').has("classic"), false);
  assert.deepEqual([...selectorThemes("body.use-liquid-glass .x")], ["liquid-glass"]);
  assert.equal(selectorThemes(".x").size, 12);
}

// 3. Subjects: the last compound decides, :is() alternatives OR, pseudo-elements
// and states drop out, and a subject that can be an ancestor reaches everything.
{
  assert.deepEqual(subjectRequirements(".theme-lab-window .btn:is(.x, #y)::before"), [
    { tags: [], ids: [], classes: ["btn", "x"] },
    { tags: [], ids: ["y"], classes: ["btn"] },
  ]);
  assert.deepEqual([...windowsForSelector(".theme-lab-window .btn:hover", INDEX).windows], ["themeLab"]);
  assert.deepEqual([...windowsForSelector(".window", INDEX).windows].sort(), ["stickies", "themeLab"]);
  assert.equal(windowsForSelector("body .anything", INDEX).all, false, "a descendant of body is not body");
  assert.equal(windowsForSelector(":root", INDEX).all, true);
  assert.equal(windowsForSelector(".desktop", INDEX).all, true);
  assert.deepEqual([...windowsForSelector(".menu-bar .menu", INDEX).windows], ["(desk)"]);
  assert.deepEqual([...windowsForSelector('body[data-theme="platinum"] .menu > button', INDEX).windows], ["(desk)"], "a bare tag subject is narrowed by the compounds above it");
  assert.deepEqual([...windowsForSelector(".theme-lab-window + .sticky-note", INDEX).windows], [], "a sibling compound has to exist in the same window");
  assert.deepEqual([...windowsForSelector(":root", INDEX, { inheritsDown: false }).windows], ["(ancestors)"], "a token on :root is a cell on html alone");
}

// 4. A rule in the Liquid Glass sheet, scoped to Liquid Glass, is one
// appearance at both viewports, on the windows its subject can match.
{
  const before = 'body[data-theme="liquid-glass"] .sticky-note { padding: 4px; }';
  const after = 'body[data-theme="liquid-glass"] .sticky-note { padding: 6px; }';
  assert.deepEqual(cellsOf(plan("styles/70-liquid-glass.css", before, after)), [
    "liquid-glass@1440x960:stickies", "liquid-glass@390x844:stickies",
  ]);
}

// 5. A Platinum-only utility rule reaches Platinum and Drawing Board, its
// recipe child, which loads the same sheet.
{
  const before = '[data-lineage~="platinum"] .theme-lab-window .btn { min-width: 60px; }';
  const after = '[data-lineage~="platinum"] .theme-lab-window .btn { min-width: 64px; }';
  assert.deepEqual(cellsOf(plan("styles/65-platinum-utility.css", before, after)), [
    "drawing-board@1440x960:themeLab", "drawing-board@390x844:themeLab",
    "platinum@1440x960:themeLab", "platinum@390x844:themeLab",
  ]);
}

// 6. A token changed on :root follows its readers: the declaring cell is the
// desk, the reader's window carries the rest; a token nobody reads is the
// desk alone.
{
  const reader = { file: "styles/50-apps.css", text: ".sticky-note { padding: var(--note-pad); }" };
  const result = plan("styles/00-foundation.css", ":root { --note-pad: 4px; }", ":root { --note-pad: 6px; }", [reader]);
  assert.equal(result.cells.length, 24);
  assert.ok(result.cells.every((cell) => cell.windows.join("+") === "(ancestors)+stickies"));
  const plain = plan("styles/00-foundation.css", "body { color: black; }", "body { color: #111; }");
  assert.ok(plain.cells.every((cell) => cell.windows === null), "an inherited property on body is a full walk");
}

// 7. The targeted diff compares only the windows it opened: a path is owned by
// its data-window segment or by the window that holds its id root.
{
  assert.equal(windowOfPath('body > main.desktop > section.window[data-window="stickies"] > textarea', INDEX.roots), "stickies");
  assert.equal(windowOfPath("div#lab-panel > div.row::before", INDEX.roots), "themeLab");
  assert.equal(windowOfPath("body > header.menu-bar", INDEX.roots), "(desk)");
  const ledger = (cells) => encodeLedger({ theme: "classic", viewport: { width: 1440, height: 960 } }, Object.entries(cells).map(([path, value]) => [path, [["padding-top", value, "styles/50-apps.css :: .x"]]]));
  const keep = (path) => windowOfPath(path, INDEX.roots) === "themeLab";
  const diff = diffLedgers(
    ledger({ "div#lab-panel > div.row": "4px", 'body > main.desktop > section.window[data-window="stickies"] > textarea': "4px" }),
    ledger({ "div#lab-panel > div.row": "6px" }),
    { keep },
  );
  assert.equal(diff.counts.derived, 1);
  assert.equal(diff.counts.disappeared, 0, "a window that was not opened is not reported as gone");
}

console.log("cascade-impact: ok");
