// The ledger file format and the comparison of two ledgers. No browser, no
// file access: cascade-ledger.mjs captures and writes, this module encodes,
// decodes and diffs, so the classification can be tested on small fixtures.
//
// A ledger records, for one appearance at one viewport, every rendered target
// (an element or its ::before/::after, named by a stable path) and each
// property a rule or the style attribute declares on it: the computed value and
// the rule that wins today. Strings are kept once in three tables and
// referenced by index:
//
//   {
//     format: "cascade-ledger/1", theme, viewport: { width, height }, commit, generatedAt, coverage,
//     unstable: { targets: [path], cells: [[path, property]] },
//     properties: ["padding-top", ...],
//     rules:      ["styles/10-windows.css :: .window-pane", ...],   // "file :: selector"
//     values:     ["8px", ...],
//     shapes:     [[property, value, rule, property, value, rule, ...], ...],
//     targets:    { "body > div.desktop > ...": shapeIndex, ... }
//   }
//
// A shape is the cell list of a target; targets that carry the same cells
// share one. A cell exists only where some rule declares the property on that
// target: inherited and initial values have no winner and are not recorded,
// because whatever moved them is a declared cell on the ancestor.
//
// Classification of one (target, property) between baseline and current:
//   flip       the winning rule changed and the value changed
//   moved      the winning rule changed, the value did not (a declaration
//              relocated or renamed with no effect on this page)
//   derived    the same rule wins and the value changed (a token or an
//              inherited input moved)
//   appeared   the target renders only now
//   disappeared the target rendered only in the baseline
// A cell declared on one side only is a flip; when the other side's value is
// known (current.probes) and equal, it is moved instead.

export const LEDGER_FORMAT = "cascade-ledger/1";
export const NO_RULE = "(none)";
export const UNDECLARED = "(not declared)";

const CELL = "\u0000";

/**
 * Build a ledger from targets already expressed as strings.
 * @param {object} meta theme, viewport, commit, generatedAt, coverage, unstable
 * @param {Iterable<[string, Array<[string, string, string]>]>} targets path -> [property, value, rule][]
 */
export function encodeLedger(meta, targets) {
  const list = [...targets].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const properties = new Set();
  const rules = new Set();
  const values = new Set();
  for (const [, cells] of list) {
    for (const [property, value, rule] of cells) { properties.add(property); values.add(value); rules.add(rule); }
  }
  const sorted = (set) => [...set].sort();
  const propertyTable = sorted(properties);
  const ruleTable = sorted(rules);
  const valueTable = sorted(values);
  const propertyIndex = new Map(propertyTable.map((name, index) => [name, index]));
  const ruleIndex = new Map(ruleTable.map((name, index) => [name, index]));
  const valueIndex = new Map(valueTable.map((name, index) => [name, index]));
  const shapes = [];
  const shapeIndex = new Map();
  const targetTable = {};
  for (const [path, cells] of list) {
    const flat = [];
    for (const [property, value, rule] of [...cells].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      flat.push(propertyIndex.get(property), valueIndex.get(value), ruleIndex.get(rule));
    }
    const key = flat.join(",");
    if (!shapeIndex.has(key)) { shapeIndex.set(key, shapes.length); shapes.push(flat); }
    targetTable[path] = shapeIndex.get(key);
  }
  const unstable = meta.unstable || { targets: [], cells: [] };
  return {
    format: LEDGER_FORMAT,
    theme: meta.theme,
    viewport: meta.viewport,
    commit: meta.commit,
    generatedAt: meta.generatedAt,
    coverage: meta.coverage,
    unstable: { targets: [...unstable.targets].sort(), cells: [...unstable.cells].sort() },
    properties: propertyTable,
    rules: ruleTable,
    values: valueTable,
    shapes,
    targets: targetTable,
  };
}

/** path -> { cells: Map(property -> { value, rule }), signature } for one ledger. */
export function decodeLedger(ledger) {
  const shapeCells = ledger.shapes.map((flat) => {
    const cells = new Map();
    const parts = [];
    for (let i = 0; i < flat.length; i += 3) {
      const cell = { value: ledger.values[flat[i + 1]], rule: ledger.rules[flat[i + 2]] };
      cells.set(ledger.properties[flat[i]], cell);
      parts.push(ledger.properties[flat[i]], cell.value, cell.rule);
    }
    return { cells, signature: parts.join(CELL) };
  });
  const targets = new Map();
  for (const [path, shape] of Object.entries(ledger.targets)) targets.set(path, shapeCells[shape]);
  return targets;
}

/** One line per target, so a committed baseline diffs by target instead of as one line. */
export function serializeLedger(ledger) {
  const top = (key) => `${JSON.stringify(key)}: ${JSON.stringify(ledger[key])}`;
  const targetLines = Object.entries(ledger.targets).map(([path, shape]) => `  ${JSON.stringify(path)}: ${shape}`);
  const shapeLines = ledger.shapes.map((shape) => `  ${JSON.stringify(shape)}`);
  return [
    "{",
    [
      top("format"), top("theme"), top("viewport"), top("commit"), top("generatedAt"), top("coverage"), top("unstable"),
      top("properties"), top("rules"), top("values"),
      `"shapes": [\n${shapeLines.join(",\n")}\n]`,
      `"targets": {\n${targetLines.join(",\n")}\n}`,
    ].join(",\n"),
    "}",
    "",
  ].join("\n");
}

function groupKeyFlip(change) {
  return `${change.before.rule} => ${change.after.rule}`;
}

function newGroup(key, change, theme, extra) {
  return {
    key,
    ...extra,
    instances: 0,
    themes: [theme],
    properties: new Set(),
    valueUnknown: 0,
    sample: `${theme} ${change.path} ${change.property}: ${change.before.value} -> ${change.after.value}`,
  };
}

function finishGroups(map) {
  return [...map.values()]
    .map((group) => ({ ...group, properties: [...group.properties].sort() }))
    .sort((a, b) => b.instances - a.instances || (a.key < b.key ? -1 : 1));
}

/**
 * Compare a current ledger with its baseline and classify every difference.
 * Pure: reads both ledgers (and current.probes when present), changes neither.
 *
 * `current.probes` is an optional { path: { property: value } } holding the
 * current value of cells the baseline declared and the current page does not,
 * so those can be told apart from a changed value. `result.lost` lists the
 * cells that still need one.
 *
 * @param {object} baseline ledger as written by encodeLedger
 * @param {object} current ledger of the same theme and viewport
 * @param {{ samples?: number }} [options]
 */
export function diffLedgers(baseline, current, options = {}) {
  const sampleLimit = options.samples ?? 10;
  const theme = current.theme ?? baseline.theme;
  const before = decodeLedger(baseline);
  const after = decodeLedger(current);
  const unstableTargets = new Set(baseline.unstable?.targets || []);
  const unstableCells = new Set((baseline.unstable?.cells || []).map(([path, property]) => path + CELL + property));
  const probes = current.probes || {};
  const flips = new Map();
  const moved = new Map();
  const derived = new Map();
  const appeared = [];
  const disappeared = [];
  const lost = [];
  let skippedUnstable = 0;

  const record = (map, key, change, extra) => {
    if (!map.has(key)) map.set(key, newGroup(key, change, theme, extra));
    const group = map.get(key);
    group.instances += 1;
    group.properties.add(change.property);
    if (change.valueUnknown) group.valueUnknown += 1;
  };

  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const path of [...paths].sort()) {
    if (unstableTargets.has(path)) { skippedUnstable += 1; continue; }
    const baseTarget = before.get(path);
    const currentTarget = after.get(path);
    if (!baseTarget) { appeared.push(path); continue; }
    if (!currentTarget) { disappeared.push(path); continue; }
    if (baseTarget.signature === currentTarget.signature) continue;
    const properties = new Set([...baseTarget.cells.keys(), ...currentTarget.cells.keys()]);
    for (const property of properties) {
      if (unstableCells.has(path + CELL + property)) { skippedUnstable += 1; continue; }
      const was = baseTarget.cells.get(property);
      const now = currentTarget.cells.get(property);
      if (was && now && was.rule === now.rule && was.value === now.value) continue;
      let change;
      if (was && now) {
        change = { path, property, before: was, after: now };
        if (was.rule === now.rule) { record(derived, now.rule, change, { rule: now.rule }); continue; }
      } else if (was) {
        const probed = probes[path]?.[property];
        change = { path, property, before: was, after: { value: probed === undefined ? UNDECLARED : probed, rule: NO_RULE }, valueUnknown: probed === undefined };
        if (probed === undefined) lost.push([path, property]);
      } else {
        change = { path, property, before: { value: UNDECLARED, rule: NO_RULE }, after: now, valueUnknown: true };
      }
      const sameValue = !change.valueUnknown && change.before.value === change.after.value;
      record(sameValue ? moved : flips, groupKeyFlip(change), change, { from: change.before.rule, to: change.after.rule });
    }
  }

  const total = (groups) => groups.reduce((sum, group) => sum + group.instances, 0);
  const result = {
    theme,
    viewport: current.viewport ?? baseline.viewport,
    targets: { baseline: before.size, current: after.size },
    flips: finishGroups(flips),
    moved: finishGroups(moved),
    derived: finishGroups(derived),
    appeared: { count: appeared.length, samples: appeared.slice(0, sampleLimit) },
    disappeared: { count: disappeared.length, samples: disappeared.slice(0, sampleLimit) },
    skippedUnstable,
    lost,
  };
  result.counts = {
    flip: total(result.flips),
    moved: total(result.moved),
    derived: total(result.derived),
    appeared: appeared.length,
    disappeared: disappeared.length,
  };
  return result;
}

/** Combine per-theme results: groups with the same rule key add up across themes. */
export function mergeDiffs(results, options = {}) {
  const sampleLimit = options.samples ?? 10;
  const merge = (name) => {
    const map = new Map();
    for (const result of results) {
      for (const group of result[name]) {
        if (!map.has(group.key)) { map.set(group.key, { ...group, themes: [...group.themes], properties: [...group.properties] }); continue; }
        const into = map.get(group.key);
        into.instances += group.instances;
        into.valueUnknown += group.valueUnknown;
        for (const theme of group.themes) if (!into.themes.includes(theme)) into.themes.push(theme);
        for (const property of group.properties) if (!into.properties.includes(property)) into.properties.push(property);
        into.properties.sort();
      }
    }
    return [...map.values()].sort((a, b) => b.instances - a.instances || (a.key < b.key ? -1 : 1));
  };
  const edge = (name) => ({
    count: results.reduce((sum, result) => sum + result[name].count, 0),
    samples: results.flatMap((result) => result[name].samples.map((path) => `${result.theme} ${path}`)).slice(0, sampleLimit),
  });
  const merged = {
    themes: results.map((result) => result.theme),
    flips: merge("flips"),
    moved: merge("moved"),
    derived: merge("derived"),
    appeared: edge("appeared"),
    disappeared: edge("disappeared"),
    skippedUnstable: results.reduce((sum, result) => sum + result.skippedUnstable, 0),
  };
  const total = (groups) => groups.reduce((sum, group) => sum + group.instances, 0);
  merged.counts = {
    flip: total(merged.flips),
    moved: total(merged.moved),
    derived: total(merged.derived),
    appeared: merged.appeared.count,
    disappeared: merged.disappeared.count,
  };
  return merged;
}

/** Text report for a merged diff; the failing classes first. */
export function formatDiffReport(merged, { groupLimit = 25 } = {}) {
  const lines = [];
  const section = (title, groups, describe) => {
    if (!groups.length) return;
    lines.push("", `${title} (${groups.length} rule ${groups.length === 1 ? "group" : "groups"}, ${groups.reduce((sum, group) => sum + group.instances, 0)} cells)`);
    for (const group of groups.slice(0, groupLimit)) {
      lines.push(`  ${group.instances}x ${group.key}`);
      lines.push(`      ${describe(group)}`);
      lines.push(`      e.g. ${group.sample}`);
    }
    if (groups.length > groupLimit) lines.push(`  ... ${groups.length - groupLimit} more group(s) in the JSON report`);
  };
  const where = (group) => `themes ${group.themes.join(",")}; properties ${group.properties.slice(0, 8).join(",")}${group.properties.length > 8 ? `,+${group.properties.length - 8}` : ""}${group.valueUnknown ? `; ${group.valueUnknown} without a known value on one side` : ""}`;
  section("FLIP: a different rule wins and the value changed (baseline rule => current rule)", merged.flips, where);
  section("DERIVED: the same rule wins, its value moved (winner rule)", merged.derived, where);
  section("MOVED: a different rule wins, the value is the same", merged.moved, where);
  const edge = (title, info) => {
    if (!info.count) return;
    lines.push("", `${title}: ${info.count} target(s)`);
    for (const sample of info.samples) lines.push(`  ${sample}`);
  };
  edge("APPEARED (rendered only now)", merged.appeared);
  edge("DISAPPEARED (rendered only in the baseline)", merged.disappeared);
  return lines;
}
