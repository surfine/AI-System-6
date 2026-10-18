// diffLedgers classifies every difference between a stored cascade ledger and a
// fresh one by what moved: the winning rule (flip), only its value (derived),
// the rule with the value unchanged (moved), or the target itself (appeared,
// disappeared). The fixtures are the smallest ledgers that show each class.

import assert from "node:assert/strict";
import { decodeLedger, diffLedgers, encodeLedger, formatDiffReport, mergeDiffs, NO_RULE, serializeLedger, UNDECLARED } from "../../tooling/lib/cascade-diff.mjs";

const WINDOWS = "styles/10-windows.css :: .window-pane";
const GLASS = "styles/70-liquid-glass.css :: body[data-theme=\"liquid-glass\"] .window-pane";
const TOKENS = "styles/00-foundation.css :: :root";
const PANE = "body > main.desktop > section.window > div.window-pane";
const PANE_B = "body > main.desktop > section.window:nth-of-type(2) > div.window-pane";

// target path -> property -> [value, rule]
function ledger(targets, meta = {}) {
  return encodeLedger(
    { theme: "classic", viewport: { width: 1440, height: 960 }, commit: "abc1234", generatedAt: "2026-10-15T00:00:00.000Z", coverage: {}, ...meta },
    Object.entries(targets).map(([path, cells]) => [path, Object.entries(cells).map(([property, [value, rule]]) => [property, value, rule])])
  );
}

const baseline = ledger({
  [PANE]: { "padding-top": ["8px", WINDOWS], "padding-left": ["8px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
  [PANE_B]: { "padding-top": ["8px", WINDOWS] },
  html: { "--ink": ["#000", TOKENS] },
  "body > gone": { color: ["red", WINDOWS] },
});

// 1. Identical ledgers: nothing to report, and the encoding round-trips.
{
  const same = diffLedgers(baseline, baseline);
  assert.deepEqual(same.counts, { flip: 0, moved: 0, derived: 0, appeared: 0, disappeared: 0 });
  assert.equal(decodeLedger(baseline).get(PANE).cells.get("padding-top").rule, WINDOWS);
  assert.deepEqual(JSON.parse(serializeLedger(baseline)), baseline);
  assert.equal(baseline.shapes.length, 4, "targets with different cells keep their own shape");
  const twins = ledger({ a: { color: ["red", WINDOWS] }, b: { color: ["red", WINDOWS] } });
  assert.equal(twins.shapes.length, 1, "targets with the same cells share one shape");
}

// 2. flip: another rule wins and the value changed. Grouped by rule pair, with instances and a sample.
{
  const current = ledger({
    [PANE]: { "padding-top": ["0px", GLASS], "padding-left": ["0px", GLASS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
    [PANE_B]: { "padding-top": ["0px", GLASS] },
    html: { "--ink": ["#000", TOKENS] },
    "body > gone": { color: ["red", WINDOWS] },
  });
  const diff = diffLedgers(baseline, current);
  assert.deepEqual(diff.counts, { flip: 3, moved: 0, derived: 0, appeared: 0, disappeared: 0 });
  assert.equal(diff.flips.length, 1);
  const [group] = diff.flips;
  assert.equal(group.key, `${WINDOWS} => ${GLASS}`);
  assert.equal(group.from, WINDOWS);
  assert.equal(group.to, GLASS);
  assert.equal(group.instances, 3);
  assert.deepEqual(group.properties, ["padding-left", "padding-top"]);
  assert.deepEqual(group.themes, ["classic"]);
  assert.match(group.sample, /^classic body > main\.desktop > section\.window > div\.window-pane padding-(top|left): 8px -> 0px$/);
}

// 3. derived: the same rule wins and its value moved (a token or inherited input).
{
  const current = ledger({
    [PANE]: { "padding-top": ["12px", WINDOWS], "padding-left": ["8px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
    [PANE_B]: { "padding-top": ["12px", WINDOWS] },
    html: { "--ink": ["#111", TOKENS] },
    "body > gone": { color: ["red", WINDOWS] },
  });
  const diff = diffLedgers(baseline, current);
  assert.deepEqual(diff.counts, { flip: 0, moved: 0, derived: 3, appeared: 0, disappeared: 0 });
  const byRule = Object.fromEntries(diff.derived.map((group) => [group.key, group]));
  assert.equal(byRule[WINDOWS].instances, 2);
  assert.deepEqual(byRule[WINDOWS].properties, ["padding-top"]);
  assert.equal(byRule[TOKENS].instances, 1);
  assert.equal(byRule[TOKENS].sample, "classic html --ink: #000 -> #111");
}

// 4. moved: another rule wins, the value is the same. Reported, not a flip.
{
  const current = ledger({
    [PANE]: { "padding-top": ["8px", GLASS], "padding-left": ["8px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
    [PANE_B]: { "padding-top": ["8px", WINDOWS] },
    html: { "--ink": ["#000", TOKENS] },
    "body > gone": { color: ["red", WINDOWS] },
  });
  const diff = diffLedgers(baseline, current);
  assert.deepEqual(diff.counts, { flip: 0, moved: 1, derived: 0, appeared: 0, disappeared: 0 });
  assert.equal(diff.moved[0].key, `${WINDOWS} => ${GLASS}`);
}

// 5. appeared / disappeared: a target only on one side; its cells are not compared.
{
  const current = ledger({
    [PANE]: { "padding-top": ["8px", WINDOWS], "padding-left": ["8px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
    [PANE_B]: { "padding-top": ["8px", WINDOWS] },
    html: { "--ink": ["#000", TOKENS] },
    "body > new": { color: ["blue", GLASS] },
    "body > newer": { color: ["blue", GLASS] },
  });
  const diff = diffLedgers(baseline, current, { samples: 1 });
  assert.deepEqual(diff.counts, { flip: 0, moved: 0, derived: 0, appeared: 2, disappeared: 1 });
  assert.deepEqual(diff.appeared.samples, ["body > new"], "samples are capped");
  assert.deepEqual(diff.disappeared.samples, ["body > gone"]);
}

// 6. A cell declared on one side only: a flip against (none). When the live
// value is known (probes) and equal, it is moved instead; lost lists what still needs one.
{
  const current = ledger({
    [PANE]: { "padding-left": ["8px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS], "margin-top": ["4px", GLASS] },
    [PANE_B]: { "padding-top": ["8px", WINDOWS] },
    html: { "--ink": ["#000", TOKENS] },
    "body > gone": { color: ["red", WINDOWS] },
  });
  const diff = diffLedgers(baseline, current);
  assert.deepEqual(diff.counts, { flip: 2, moved: 0, derived: 0, appeared: 0, disappeared: 0 });
  const keys = diff.flips.map((group) => group.key).sort();
  assert.deepEqual(keys, [`${NO_RULE} => ${GLASS}`, `${WINDOWS} => ${NO_RULE}`].sort());
  assert.deepEqual(diff.lost, [[PANE, "padding-top"]]);
  const lost = diff.flips.find((group) => group.to === NO_RULE);
  assert.equal(lost.valueUnknown, 1);
  assert.match(lost.sample, new RegExp(`padding-top: 8px -> ${UNDECLARED.replace(/[()]/g, "\\$&")}$`));

  const sameAfterAll = diffLedgers(baseline, { ...current, probes: { [PANE]: { "padding-top": "8px" } } });
  assert.deepEqual(sameAfterAll.counts, { flip: 1, moved: 1, derived: 0, appeared: 0, disappeared: 0 });
  assert.deepEqual(sameAfterAll.lost, []);
  const changedAfterAll = diffLedgers(baseline, { ...current, probes: { [PANE]: { "padding-top": "0px" } } });
  assert.deepEqual(changedAfterAll.counts, { flip: 2, moved: 0, derived: 0, appeared: 0, disappeared: 0 });
}

// 7. Cells and targets the baseline marks unstable are skipped.
{
  const noisy = ledger({
    [PANE]: { "padding-top": ["8px", WINDOWS], "padding-left": ["8px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
    [PANE_B]: { "padding-top": ["8px", WINDOWS] },
    html: { "--ink": ["#000", TOKENS] },
    "body > gone": { color: ["red", WINDOWS] },
  }, { unstable: { targets: ["body > gone", "body > fleeting"], cells: [[PANE, "padding-left"]] } });
  const current = ledger({
    [PANE]: { "padding-top": ["8px", WINDOWS], "padding-left": ["99px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
    [PANE_B]: { "padding-top": ["8px", WINDOWS] },
    html: { "--ink": ["#000", TOKENS] },
    "body > fleeting": { color: ["red", WINDOWS] },
  });
  const diff = diffLedgers(noisy, current);
  assert.deepEqual(diff.counts, { flip: 0, moved: 0, derived: 0, appeared: 0, disappeared: 0 });
  assert.equal(diff.skippedUnstable, 3);
}

// 8. Several themes merge by rule key; the report lists the failing classes first.
{
  const glassBase = ledger({ [PANE]: { "padding-top": ["8px", WINDOWS] } }, { theme: "liquid-glass" });
  const glassNow = ledger({ [PANE]: { "padding-top": ["0px", GLASS] } }, { theme: "liquid-glass" });
  const classicNow = ledger({
    [PANE]: { "padding-top": ["0px", GLASS], "padding-left": ["8px", WINDOWS], "background-color": ["rgb(255, 255, 255)", WINDOWS] },
    [PANE_B]: { "padding-top": ["8px", WINDOWS] },
    html: { "--ink": ["#222", TOKENS] },
    "body > gone": { color: ["red", WINDOWS] },
  });
  const merged = mergeDiffs([diffLedgers(baseline, classicNow), diffLedgers(glassBase, glassNow)]);
  assert.deepEqual(merged.counts, { flip: 2, moved: 0, derived: 1, appeared: 0, disappeared: 0 });
  assert.equal(merged.flips.length, 1);
  assert.equal(merged.flips[0].instances, 2);
  assert.deepEqual(merged.flips[0].themes, ["classic", "liquid-glass"]);
  const text = formatDiffReport(merged).join("\n");
  assert.ok(text.indexOf("FLIP") < text.indexOf("DERIVED"));
  assert.ok(text.includes(`2x ${WINDOWS} => ${GLASS}`));
}

// 9. A baseline target whose cell keeps both its value and its rule is not a
// difference: only the ledger's metadata moved, so every count is zero and the
// flips array is empty.
{
  const committed = ledger({ [PANE]: { "padding-top": ["8px", WINDOWS] } });
  const current = ledger(
    { [PANE]: { "padding-top": ["8px", WINDOWS] } },
    { commit: "def5678", generatedAt: "2026-10-16T00:00:00.000Z" }
  );
  const diff = diffLedgers(committed, current);
  assert.deepEqual(diff.counts, { flip: 0, moved: 0, derived: 0, appeared: 0, disappeared: 0 });
  assert.deepEqual(diff.flips, []);
}

console.log("cascade-diff: ok");
