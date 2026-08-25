// English and Chinese are one interface with two independently written voices.
// This contract evaluates the real tables (including quoted/hyphenated keys),
// walks runtime translation calls, and audits Balloon Help targets. A missing
// key is user-visible because t() falls back to the raw identifier.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";
import {
  createFeatureTest,
  desktopRoot,
  forEachAstChild,
  parseJsSource,
} from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("translations-parity");
const enPath = join(desktopRoot, "app/data/translations-en.js");
const zhPath = join(desktopRoot, "app/data/translations-zh.js");
const enSource = readFileSync(enPath, "utf8");
const zhSource = readFileSync(zhPath, "utf8");

function evaluateTable(source, globalName) {
  const context = vm.createContext({ window: {}, t: (key) => key });
  vm.runInContext(source, context, { timeout: 2000 });
  return context.window[globalName] || {};
}

const enBase = evaluateTable(enSource, "AISystem6TranslationsEn");
const zhBase = evaluateTable(zhSource, "AISystem6TranslationsZh");
const lazyContext = vm.createContext({
  window: {
    AISystem6TranslationsEn: { ...enBase },
    AISystem6TranslationsZh: { ...zhBase },
  },
});
vm.runInContext(readFileSync(join(desktopRoot, "app/features/bonsai-translations.js"), "utf8"), lazyContext, { timeout: 2000 });
const en = lazyContext.window.AISystem6TranslationsEn;
const zh = lazyContext.window.AISystem6TranslationsZh;
const enKeys = new Set(Object.keys(en));
const zhKeys = new Set(Object.keys(zh));
const missingZh = [...enKeys].filter((key) => !zhKeys.has(key)).sort();
const missingEn = [...zhKeys].filter((key) => !enKeys.has(key)).sort();

test.assert(missingZh.length === 0, `every English key has Chinese copy (missing: ${missingZh.join(", ")})`);
test.assert(missingEn.length === 0, `every Chinese key has English copy (missing: ${missingEn.join(", ")})`);

const typeMismatches = [...enKeys]
  .filter((key) => zhKeys.has(key) && typeof en[key] !== typeof zh[key])
  .map((key) => `${key}:${typeof en[key]}/${typeof zh[key]}`)
  .sort();
test.assert(typeMismatches.length === 0, `both languages use the same value type (mismatch: ${typeMismatches.join(", ")})`);

function walkFiles(directory) {
  const rows = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["generated", "vendor", "warfarin-missions-lines"].includes(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...walkFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) rows.push(full);
  }
  return rows;
}

const appFiles = [join(desktopRoot, "app.js"), ...walkFiles(join(desktopRoot, "app"))]
  .filter((path) => !/translations-(?:en|zh)\.js$/.test(path));
const referenced = new Map();

function record(key, path, kind) {
  if (!key) return;
  const label = `${relative(desktopRoot, path)} (${kind})`;
  if (!referenced.has(key)) referenced.set(key, new Set());
  referenced.get(key).add(label);
}

function walkAst(node, path) {
  if (node.type === "CallExpression"
    && node.callee?.type === "Identifier"
    && ["t", "tr"].includes(node.callee.name)
    && node.arguments?.[0]?.type === "Literal"
    && typeof node.arguments[0].value === "string") {
    record(node.arguments[0].value, path, `${node.callee.name}()`);
  }
  forEachAstChild(node, (child) => walkAst(child, path));
}

for (const path of appFiles) {
  const source = readFileSync(path, "utf8");
  walkAst(parseJsSource(source), path);
  for (const match of source.matchAll(/(?:data-i18n(?:-aria-label|-placeholder|-title|-count|-drop-label)?|data-status-key)=["']([A-Za-z0-9_-]+)["']/g)) {
    record(match[1], path, "data-i18n");
  }
  for (const match of source.matchAll(/data-balloon-help(?:-disabled)?=["']([A-Za-z0-9_-]+)["']/g)) {
    record(match[1], path, "Balloon Help");
  }
}

const htmlPath = join(desktopRoot, "index.html");
const html = readFileSync(htmlPath, "utf8");
for (const match of html.matchAll(/(?:data-i18n(?:-aria-label|-placeholder|-title|-count|-drop-label)?|data-status-key)="([A-Za-z0-9_-]+)"/g)) {
  record(match[1], htmlPath, "data-i18n");
}
for (const match of html.matchAll(/data-balloon-help(?:-disabled)?="([A-Za-z0-9_-]+)"/g)) {
  record(match[1], htmlPath, "Balloon Help");
}

// Control Strip modules derive balloon_${labelKey} at runtime.
const controlStripPath = join(desktopRoot, "app/features/control-strip-modules.js");
const controlStrip = readFileSync(controlStripPath, "utf8");
if (controlStrip.includes("balloon_${descriptor.labelKey}")) {
  for (const match of controlStrip.matchAll(/labelKey:\s*"([A-Za-z0-9_-]+)"/g)) {
    record(`balloon_${match[1]}`, controlStripPath, "dynamic Balloon Help");
  }
}

const unresolved = [...referenced]
  .filter(([key]) => !enKeys.has(key) || !zhKeys.has(key))
  .map(([key, paths]) => `${key} <- ${[...paths].join("; ")}`)
  .sort();
test.assert(unresolved.length === 0, `all static translation and Balloon Help references resolve (missing: ${unresolved.join(" | ")})`);

// A ratchet on the parity gate's own blind spot.
//
// `currentLanguage === "zh" ? "..." : "..."` at a call site produces correct
// text in both languages and is completely invisible to everything above: the
// strings are not keys, so a missing or drifted one cannot be detected, and no
// reviewer reading the tables can tell the string exists at all. 51 of these
// were writing user-visible text straight into setStatus, textContent,
// innerHTML and Error messages. They are keys now.
//
// A ternary is still the right tool for the cases this does NOT count: a
// number (`zh ? 34 : 90`), a locale code, or prompt text written for the model
// rather than for the reader. The budget covers only the sinks a person reads.
const LANGUAGE_TERNARY = /currentLanguage === "zh" \? ("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`) : ("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/;
const READER_FACING_SINK = /(setStatus\s*\(|\.textContent\s*=|\.innerHTML\s*=|\.title\s*=|\.placeholder\s*=|throw new Error\(|\.label\s*=|setAttribute\(\s*"aria-label")/;
const INLINE_UI_STRING_BUDGET = 0;

const inlineUiStrings = [];
for (const path of appFiles) {
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (!READER_FACING_SINK.test(line) || !LANGUAGE_TERNARY.test(line)) return;
    inlineUiStrings.push(`${relative(desktopRoot, path)}:${index + 1}`);
  });
}
test.assert(
  inlineUiStrings.length <= INLINE_UI_STRING_BUDGET,
  inlineUiStrings.length <= INLINE_UI_STRING_BUDGET
    ? `no reader-facing text is written as an inline language ternary (budget ${INLINE_UI_STRING_BUDGET})`
    : `reader-facing text written as an inline language ternary, which no parity check can see: ${inlineUiStrings.join(", ")}`,
);

// A window its module builds names its title through `titleKey`, and nothing
// else checks that key exists. When it does not, t() falls back to the raw
// identifier and the window opens with `liquid_cover` painted across its title
// bar -- which is exactly what Cover Glass did the first time it built its own
// window. The literal beside the key is only a pre-i18n default, so it cannot
// cover for a key that resolves to nothing.
const titleKeys = [];
for (const path of appFiles) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/titleKey:\s*"([^"]+)"/g)) {
    titleKeys.push({ key: match[1], where: relative(desktopRoot, path) });
  }
}
test.assert(titleKeys.length > 8, `module-built windows name their titles through a key (${titleKeys.length} found)`);
const unresolvedTitles = titleKeys
  .filter(({ key }) => !enKeys.has(key) || !zhKeys.has(key))
  .map(({ key, where }) => `${key} <- ${where}`);
test.assert(
  unresolvedTitles.length === 0,
  unresolvedTitles.length === 0
    ? "every window title key resolves in both tables, so no window opens showing its own key"
    : `window title keys that would paint the raw identifier into the title bar: ${unresolvedTitles.join(", ")}`,
);

test.finish();
