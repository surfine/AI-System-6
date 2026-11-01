#!/usr/bin/env node
// Cascade ledger: a regression gate whose unit is the winning CSS rule.
//
// A CSS regression in this project is almost never "a pixel moved". It is "a
// different rule now wins on some element": a selector gained or lost weight, a
// sheet moved, a token was redefined, a late override started reaching a
// surface it did not reach before. The gates that exist measure the result
// (counts and ratchets in css-budget.json, computed values on a few chosen
// controls, pixels) and leave the reader to work backwards to the rule. This
// tool records the cause instead.
//
// For each appearance and viewport it boots the real app (the same boot,
// MultiFinder, every-registered-window, open-menus walk measure-layer-flips.mjs
// uses; tooling/lib/cascade-page.mjs), then for every rendered element and
// ::before/::after it records each property that a rule or the style attribute
// declares on it: the computed value and the rule that wins today, as source
// file + selector. That ledger is committed under tests/cascade-ledger/. A later
// run recaptures, compares cell by cell and names the rule behind each change:
//
//   flip      the winning rule changed and the value changed
//   derived   the same rule wins, its value moved (a token or inherited input)
//   moved     the winning rule changed, the value did not (a relocated declaration)
//   appeared / disappeared   a target renders only now / only in the baseline
//
// Flips and derived changes fail the run; moved, appeared and disappeared are
// printed and do not. The report groups by rule, so the answer to "what broke"
// is the rule to change, with a sample element to look at.
//
// How it differs from its neighbours:
//   visual-snapshot.mjs      compares 26 computed values on chosen controls; it
//                            sees that a value moved, on the controls it knows,
//                            and cannot say which rule moved it.
//   appearance-snapshot.mjs  compares 7 pixel cells per appearance; it sees a
//                            painted difference and nothing else.
//   measure-layer-flips.mjs  compares today's cascade with an @layer-wrapped
//                            variant of the same sheets, in one session, to
//                            predict what a wrap would change. It never stores
//                            anything; this tool compares today with a stored
//                            yesterday. They share the page driver and the
//                            in-page instrument (tooling/lib/cascade-*.mjs).
//
// Not recorded: properties no rule declares on the target (inherited or
// initial values have no winner; the declaring ancestor carries the cell), and
// pixels. Two kinds of cell keep their rule but not their computed value,
// because the value is script or layout state that differs between page loads:
// a property the style attribute sets (window placement; stored as "(inline)")
// and an auto margin (stored as "auto"). The winner is resolved over the live CSSOM from specificity, layer
// and source order, so a property declared only through a mechanism it does not
// read (animations, transitions mid-flight, @container conditions) can name a
// rule that is not the one painting; that is stable from run to run, which is
// what a baseline needs, and coverage.winnerCheck counts how often a plain
// pixel declaration disagrees with the computed value.
//
// Usage:
//   node tooling/cascade-ledger.mjs                      # --verify, classic and liquid-glass at 1440x960
//   node tooling/cascade-ledger.mjs --verify --themes classic
//   node tooling/cascade-ledger.mjs --update --no-build  # write baselines for the chosen themes and viewport
//   node tooling/cascade-ledger.mjs --update --viewport 390x844
//   node tooling/cascade-ledger.mjs --noise              # capture twice in one session, list the keys that differ
//   options: --themes a,b  --viewport WxH  --no-build  --out <dir> (ledger directory, default tests/cascade-ledger)
//
// Baselines: tests/cascade-ledger/<theme>@<WxH>.json. --update captures twice in
// one session and stores the cells that differ between the two under `unstable`;
// --verify skips them. Report: dist/verification/cascade-ledger@<viewport>.json
// (one file per viewport, so the desktop and phone gates can run side by side).
// Exit: 1 on any flip or derived change, 2 on a failed run, else 0.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { diffLedgers, encodeLedger, formatDiffReport, mergeDiffs, serializeLedger } from "./lib/cascade-diff.mjs";
import { ledgerInstrumentSource } from "./lib/cascade-instrument.mjs";
import { bootThemedPage, launchChromium, openEveryWindow, parseViewport, registeredThemeIds, revealAndSettle, settleLayout } from "./lib/cascade-page.mjs";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";
import { lazyStyleBundles, styleLayerOrder, styleRuntimePaths } from "./style-manifest.mjs";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const modes = ["--verify", "--update", "--noise"].filter((flag) => args.includes(flag));
if (modes.length > 1) {
  console.error(`Pick one mode, got ${modes.join(" ")}.`);
  process.exit(2);
}
const MODE = (modes[0] || "--verify").slice(2);
const viewport = parseViewport(argValue("--viewport"));
const VIEWPORT = { width: viewport.width, height: viewport.height };
const VIEWPORT_NAME = `${viewport.width}x${viewport.height}`;
const LEDGER_DIR = join(repositoryRoot, argValue("--out") || "tests/cascade-ledger");
const REPORT_PATH = join(repositoryRoot, `dist/verification/cascade-ledger@${VIEWPORT_NAME}.json`);
const defaultThemes = ["classic", "liquid-glass"];
const themes = argValue("--themes") ? argValue("--themes").split(",").filter(Boolean) : defaultThemes;
const known = registeredThemeIds();
const unknown = themes.filter((theme) => !known.includes(theme));
if (unknown.length) {
  console.error(`Unknown appearance ${unknown.join(", ")}; the registry has ${known.join(", ")}.`);
  process.exit(2);
}
const ledgerPath = (theme) => join(LEDGER_DIR, `${theme}@${VIEWPORT_NAME}.json`);
// Upper bound on cells whose current value is fetched from the page to tell a
// lost declaration from a changed value; beyond it they are reported as flips.
const PROBE_LIMIT = 20000;

if (!args.includes("--no-build")) {
  execFileSync(process.execPath, ["tooling/build-app-bundle.mjs"], { cwd: repositoryRoot, stdio: "ignore" });
}

// Served sheet -> its source files in bundle order, so a rule's position in the
// sheet names the file it was written in.
const sheetSources = {
  "styles.bundle.css": styleRuntimePaths,
  ...Object.fromEntries(lazyStyleBundles.map((bundle) => [bundle.output, bundle.sources])),
};
const sourceTexts = Object.fromEntries(Object.entries(sheetSources).map(([sheet, files]) => [
  sheet,
  files.map((path) => [path, readFileSync(join(desktopRoot, path), "utf8")]),
]));
const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/** page capture() -> Map(path -> Map(property -> { value, rule })) */
function cellsOf(capture) {
  const out = new Map();
  for (const [path, flat] of capture.targets) {
    const cells = new Map();
    for (let i = 0; i < flat.length; i += 3) {
      cells.set(capture.properties[flat[i]], { value: capture.values[flat[i + 1]], rule: capture.rules[flat[i + 2]].key });
    }
    out.set(path, cells);
  }
  return out;
}

function noiseBetween(first, second) {
  const targets = [];
  const cells = [];
  for (const path of new Set([...first.keys(), ...second.keys()])) {
    const a = first.get(path);
    const b = second.get(path);
    if (!a || !b) { targets.push(path); continue; }
    for (const property of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(property);
      const y = b.get(property);
      if (!x || !y || x.value !== y.value || x.rule !== y.rule) cells.push([path, property]);
    }
  }
  return { targets, cells };
}

function ledgerOf(theme, cells, extra) {
  const targets = [...cells].map(([path, byProperty]) => [path, [...byProperty].map(([property, { value, rule }]) => [property, value, rule])]);
  return encodeLedger({ theme, viewport: VIEWPORT, commit, generatedAt: new Date().toISOString(), ...extra }, targets);
}

async function captureTheme(browser, server, theme, { repeat = MODE !== "verify" } = {}) {
  const started = Date.now();
  const phases = {};
  const lap = (name, from) => {
    phases[name] = Math.round((Date.now() - from) / 1000);
    console.error(`  ${theme}: ${name} done in ${phases[name]}s`);
    return Date.now();
  };
  // A boot that misses its 60 s readiness window on a busy machine is retried
  // once on a fresh context; a second miss is a real failure.
  let booted;
  for (let attempt = 1; !booted; attempt += 1) {
    try {
      booted = await bootThemedPage(browser, server.url, theme, viewport, { deterministic: true });
    } catch (error) {
      if (attempt >= 2) throw error;
      console.warn(`${theme}: boot attempt ${attempt} failed (${String(error?.message || error).split("\n")[0]}); retrying`);
    }
  }
  const { context, page, pageErrors } = booted;
  try {
    let mark = lap("boot", started);
    const { windowNames, opened, failed } = await openEveryWindow(page, { settleMs: 150 });
    mark = lap("windows", mark);
    const revealed = await revealAndSettle(page, opened);
    const settle = await settleLayout(page);
    mark = lap("settle", mark);
    await page.evaluate(`window.__cascadeLedger = ${ledgerInstrumentSource(styleLayerOrder)}`);
    await page.evaluate((sources) => window.__cascadeLedger.install(sources), sourceTexts);
    const first = await page.evaluate(() => window.__cascadeLedger.capture());
    const second = repeat ? await page.evaluate(() => window.__cascadeLedger.capture()) : null;
    lap("capture", mark);
    const cells = cellsOf(first);
    const noise = second ? noiseBetween(cells, cellsOf(second)) : { targets: [], cells: [] };
    const coverage = {
      windowsRegistered: windowNames.length,
      windowsOpened: opened.length,
      windowsRevealed: revealed,
      windowsFailed: failed,
      settled: settle.settled,
      secondsByPhase: phases,
      renderedTargets: first.stats.renderedTargets,
      cssRules: first.stats.rules,
      mappingProblems: first.stats.mappingProblems,
      winnerCheck: first.stats.winnerCheck,
      pageErrors: pageErrors.slice(0, 5),
    };
    // Only verify goes back to the page (to probe cells a rule stopped
    // declaring). A page left open keeps painting, and a second session beside
    // it runs many times slower, so every other mode closes it now.
    const keep = MODE === "verify";
    if (!keep) await context.close();
    return { theme, cells, noise, coverage, page, context: keep ? context : null, started, probe: (pairs) => page.evaluate((list) => window.__cascadeLedger.probe(list), pairs) };
  } catch (error) {
    await context.close();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

const server = await startAppServer(repositoryRoot);
const browser = await launchChromium();
const diffs = [];
const perTheme = {};
let failedRun = false;

try {
  for (const theme of themes) {
    const baselineFile = ledgerPath(theme);
    if (MODE === "verify" && !existsSync(baselineFile)) {
      console.error(`${theme}: no baseline at ${baselineFile.replace(`${repositoryRoot}/`, "")}; run --update first.`);
      failedRun = true;
      continue;
    }
    const captured = await captureTheme(browser, server, theme);
    try {
      let unstable = captured.noise;
      if (MODE === "update") {
        // Same-session repeats miss what only differs between page loads
        // (window placement against content that is still loading, resolved
        // auto margins): a second fresh session finds those.
        const other = await captureTheme(browser, server, theme, { repeat: false });
        const across = noiseBetween(captured.cells, other.cells);
        unstable = {
          targets: [...new Set([...unstable.targets, ...across.targets])],
          cells: [...new Map([...unstable.cells, ...across.cells].map((cell) => [cell.join("\u0000"), cell])).values()],
        };
      }
      const seconds = Math.round((Date.now() - captured.started) / 1000);
      captured.coverage.seconds = seconds;
      const unstableCount = unstable.targets.length + unstable.cells.length;
      const head = `${theme}@${VIEWPORT_NAME}: ${captured.coverage.windowsOpened}/${captured.coverage.windowsRegistered} windows, ${captured.coverage.renderedTargets} targets, ${captured.coverage.cssRules} rules (${Object.entries(captured.coverage.secondsByPhase).map(([name, s]) => `${name} ${s}s`).join(", ")})`;
      const check = captured.coverage.winnerCheck;
      const problems = captured.coverage.mappingProblems;
      if (problems.length) console.warn(`${theme}: rule-to-file mapping fell back to sheet names: ${problems.join("; ")}`);
      if (MODE === "noise") {
        console.log(`${head}: ${unstable.targets.length} unstable target(s), ${unstable.cells.length} unstable cell(s) in ${seconds}s`);
        for (const path of unstable.targets.slice(0, 10)) console.log(`  target ${path}`);
        for (const [path, property] of unstable.cells.slice(0, 20)) console.log(`  ${path} ${property}`);
        perTheme[theme] = { unstable, coverage: captured.coverage };
      } else if (MODE === "update") {
        const ledger = ledgerOf(theme, captured.cells, { coverage: captured.coverage, unstable });
        mkdirSync(LEDGER_DIR, { recursive: true });
        const text = serializeLedger(ledger);
        writeFileSync(baselineFile, text);
        console.log(`${head}: wrote ${baselineFile.replace(`${repositoryRoot}/`, "")} (${(text.length / 1024).toFixed(0)} KiB, ${ledger.shapes.length} shapes, ${ledger.rules.length} rules, ${unstableCount} unstable) in ${seconds}s`);
        perTheme[theme] = { bytes: text.length, shapes: ledger.shapes.length, rules: ledger.rules.length, unstable: unstableCount, coverage: captured.coverage };
      } else {
        const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
        const current = ledgerOf(theme, captured.cells, { coverage: captured.coverage });
        let diff = diffLedgers(baseline, current);
        if (diff.lost.length) {
          const pairs = diff.lost.slice(0, PROBE_LIMIT);
          const values = await captured.probe(pairs);
          current.probes = {};
          pairs.forEach(([path, property], index) => {
            if (values[index] === null) return;
            (current.probes[path] ||= {})[property] = values[index];
          });
          diff = diffLedgers(baseline, current);
        }
        diffs.push(diff);
        perTheme[theme] = { counts: diff.counts, targets: diff.targets, skippedUnstable: diff.skippedUnstable, coverage: captured.coverage };
        const c = diff.counts;
        console.log(`${head}: ${c.flip} flip, ${c.derived} derived, ${c.moved} moved, ${c.appeared} appeared, ${c.disappeared} disappeared (${diff.skippedUnstable} unstable skipped; baseline ${diff.targets.baseline} targets) in ${seconds}s`);
        if (check.disagree) console.log(`  winner check: ${check.agree} plain pixel declarations agree with the computed value, ${check.disagree} do not`);
      }
    } finally {
      await captured.context?.close();
    }
  }
} catch (error) {
  console.error(error?.stack || error);
  failedRun = true;
} finally {
  await browser.close();
  await stopProcess(server.child);
}

if (MODE === "verify" && diffs.length) {
  const merged = mergeDiffs(diffs);
  for (const line of formatDiffReport(merged)) console.log(line);
  mkdirSync(join(repositoryRoot, "dist/verification"), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify({
    generatedBy: "tooling/cascade-ledger.mjs",
    generatedAt: new Date().toISOString(),
    commit,
    viewport: VIEWPORT,
    summary: merged.counts,
    flips: merged.flips,
    derived: merged.derived,
    moved: merged.moved,
    appeared: merged.appeared,
    disappeared: merged.disappeared,
    themes: perTheme,
    perTheme: diffs,
  }, null, 1)}\n`);
  console.log(`\nReport: ${REPORT_PATH.replace(`${repositoryRoot}/`, "")}`);
  if (merged.counts.flip || merged.counts.derived) {
    console.log(`\nFAILED: ${merged.counts.flip} flip(s), ${merged.counts.derived} derived change(s). If they are intended, run: npm run cascade:update`);
    process.exitCode = 1;
  } else {
    console.log(`\nOK: no flip or derived change${merged.counts.moved || merged.counts.appeared || merged.counts.disappeared ? " (moved/appeared/disappeared listed above do not fail the run)" : ""}.`);
  }
} else if (MODE === "noise") {
  mkdirSync(join(repositoryRoot, "dist/verification"), { recursive: true });
  const noiseReport = join(repositoryRoot, "dist/verification/cascade-ledger-noise.json");
  writeFileSync(noiseReport, `${JSON.stringify({ generatedAt: new Date().toISOString(), commit, viewport: VIEWPORT, themes: perTheme }, null, 1)}\n`);
  const total = Object.values(perTheme).reduce((sum, entry) => sum + entry.unstable.targets.length + entry.unstable.cells.length, 0);
  console.log(`\n${total} unstable key(s) across ${Object.keys(perTheme).length} appearance(s). Report: ${noiseReport.replace(`${repositoryRoot}/`, "")}`);
}
if (failedRun) process.exitCode = 2;
