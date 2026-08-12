import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimePaths, lazyRuntimePaths } from "./runtime-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const warnings = [];

function ok(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function assertExists(path) {
  if (existsSync(join(root, path))) ok(path);
  else fail(`${path} is missing`);
}

function checkSyntax(path) {
  const result = spawnSync(process.execPath, ["--check", path], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) {
    ok(`${path} syntax`);
    return;
  }
  fail(`${path} syntax failed\n${result.stderr || result.stdout}`);
}

function listJsFilesRelative(dirRelative) {
  const absDir = join(root, dirRelative);
  if (!existsSync(absDir)) return [];
  const files = [];
  const walk = (absPath, relPath) => {
    const entries = readdirSync(absPath, { withFileTypes: true });
    for (const entry of entries) {
      const nextAbs = join(absPath, entry.name);
      const nextRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(nextAbs, nextRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/\.js$/i.test(entry.name)) files.push(`${dirRelative}/${nextRel}`);
    }
  };
  walk(absDir, "");
  return files.sort();
}

const pkg = readJson("package.json");
const buildInfo = readJson("build-info.json");

const appBundle = spawnSync(process.execPath, ["scripts/build-app-bundle.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (appBundle.status === 0) {
  ok("app bundle built");
} else {
  fail(`app bundle build failed\n${appBundle.stderr || appBundle.stdout}`);
}

const releaseAssets = spawnSync(process.execPath, ["scripts/check-release-assets.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (releaseAssets.status === 0) {
  ok("release assets present");
} else {
  fail(`release asset check failed\n${releaseAssets.stderr || releaseAssets.stdout}`);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const srcTypecheck = spawnSync(npmCommand, ["--prefix", "src", "run", "typecheck"], {
  cwd: root,
  encoding: "utf8",
});
if (srcTypecheck.status === 0) {
  ok("src typecheck");
} else {
  fail(`src typecheck failed\n${srcTypecheck.stderr || srcTypecheck.stdout}`);
}

[
  "build-info.json",
  "index.html",
  "app.bundle.js",
  ...appRuntimePaths,
  ...lazyRuntimePaths,
  "styles.css",
  "styles.bundle.css",
  "styles.theme-lab.css",
  "src/server.js",
  "package.json",
  "CLAUDE.md",
  "native/README.md",
].forEach(assertExists);
[...appRuntimePaths, ...lazyRuntimePaths].forEach(checkSyntax);
checkSyntax("app.bundle.js");
checkSyntax("src/server.js");

const dataBoundary = spawnSync(process.execPath, ["scripts/verify-data-boundary.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (dataBoundary.status === 0) {
  ok("data boundary verification");
} else {
  fail(`data boundary verification failed\n${dataBoundary.stderr || dataBoundary.stdout}`);
}

const nativeActionAudit = spawnSync(process.execPath, ["scripts/verify-native-action-audit.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (nativeActionAudit.status === 0) {
  ok("native action audit verification");
} else {
  fail(`native action audit verification failed\n${nativeActionAudit.stderr || nativeActionAudit.stdout}`);
}

const nativeParityLedger = spawnSync(process.execPath, ["scripts/verify-native-parity-ledger.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (nativeParityLedger.status === 0) {
  ok("native parity ledger verification");
} else {
  fail(`native parity ledger verification failed\n${nativeParityLedger.stderr || nativeParityLedger.stdout}`);
}

const floppyBudget = spawnSync(process.execPath, ["scripts/verify-floppy-budget.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (floppyBudget.status === 0) {
  ok("System Floppy Budget");
} else {
  fail(`System Floppy Budget failed\n${floppyBudget.stderr || floppyBudget.stdout}`);
}

const smokeRelease = spawnSync(process.execPath, ["scripts/smoke-release.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (smokeRelease.status === 0) {
  ok("release smoke verification");
} else {
  fail(`release smoke verification failed\n${smokeRelease.stderr || smokeRelease.stdout}`);
}

const featureTests = spawnSync(process.execPath, ["scripts/verify-features.mjs"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (featureTests.status === 0) {
  ok("feature verification");
} else {
  const featureFailureDetails = [
    featureTests.error?.message,
    featureTests.stderr,
    featureTests.stdout,
  ].filter(Boolean).join("\n");
  fail(`feature verification failed\n${featureFailureDetails}`);
}

const docLocales = spawnSync(process.execPath, ["scripts/verify-doc-locales.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (docLocales.status === 0) {
  ok("doc locale verification");
} else {
  fail(`doc locale verification failed\n${docLocales.stderr || docLocales.stdout}`);
}

const cssBudget = spawnSync(process.execPath, ["scripts/verify-css.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (cssBudget.status === 0) {
  ok("CSS budget verification");
} else {
  fail(`CSS budget verification failed\n${cssBudget.stderr || cssBudget.stdout}`);
}

const designGovernance = spawnSync(process.execPath, ["scripts/verify-design.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (designGovernance.status === 0) {
  ok("design governance verification");
} else {
  fail(`design governance verification failed\n${designGovernance.stderr || designGovernance.stdout}`);
}

if (/^\d+\.\d+\.\d+/.test(pkg.version || "")) ok(`package version ${pkg.version}`);
else fail(`package version is not semver-like: ${pkg.version || "(missing)"}`);

const pkgAssets = new Set(pkg.pkg?.assets || []);
const pkgTargets = new Set(pkg.pkg?.targets || []);
[
  "build-info.json",
  "index.html",
  "app.bundle.js",
  "scripts/markitdown-adapter.py",
  "scripts/transcribe-audio-macos.swift",
  "scripts/transcribe-audio-macos26.swift",
  "app/**/*.js",
  "data/**/*.json",
  "app.js",
  "styles.css",
  "styles.bundle.css",
  "styles.theme-lab.css",
  "system.css-reference/cursors/watch.png",
  "system.css-reference/fonts/*.woff",
  "system.css-reference/fonts/*.woff2",
].forEach((asset) => {
  if (pkgAssets.has(asset)) ok(`pkg asset ${asset}`);
  else fail(`pkg asset missing: ${asset}`);
});

["node18-macos-arm64"].forEach((target) => {
  if (pkgTargets.has(target)) ok(`pkg target ${target}`);
  else fail(`pkg target missing: ${target}`);
});

const fontDir = join(root, "system.css-reference/fonts");
if (existsSync(fontDir)) {
  const fonts = readdirSync(fontDir).filter((name) => /\.(woff2?|ttf|otf)$/i.test(name));
  if (fonts.length) ok(`${fonts.length} font assets found`);
  else fail("system.css-reference/fonts contains no font assets");
} else {
  fail("system.css-reference/fonts is missing");
}

const cursorPath = "system.css-reference/cursors/watch.png";
if (existsSync(join(root, cursorPath))) ok(cursorPath);
else fail(`${cursorPath} is missing`);

const versionRouteSource = readFileSync(join(root, "src/server/routes/version.js"), "utf8");
if (versionRouteSource.includes("/api/version") || versionRouteSource.includes("handleVersion")) {
  ok("/api/version route present");
} else {
  fail("/api/version route missing");
}

const appSource = [...appRuntimePaths, ...lazyRuntimePaths].map((path) => readFileSync(join(root, path), "utf8")).join("\n");
const serverSourcePaths = [
  "src/server.js",
  ...listJsFilesRelative("src/server"),
];
const serverSource = serverSourcePaths
  .filter((path, index, all) => all.indexOf(path) === index)
  .filter((path) => {
    const abs = join(root, path);
    return existsSync(abs) && statSync(abs).isFile();
  })
  .map((path) => readFileSync(join(root, path), "utf8"))
  .join("\n");
const appSourceByPath = new Map(
  [...appRuntimePaths, ...lazyRuntimePaths].map((path) => [path, readFileSync(join(root, path), "utf8")])
);
const appDataSource = [
  "app/data/system-data.js",
  "app/data/translations-en.js",
  "app/data/translations-zh.js",
].map((path) => readFileSync(join(root, path), "utf8")).join("\n");
const thirdPartyRuntimePaths = new Set([
  "app/vendor/marked.umd.js",
  "app/vendor/stream-markdown-parser.global.js",
]);

const escapeHtmlDefinitions = [...appSourceByPath.entries()]
  .filter(([path]) => !thirdPartyRuntimePaths.has(path))
  .filter(([, source]) => /\bfunction\s+escapeHtml\s*\(/.test(source))
  .map(([path]) => path);
if (escapeHtmlDefinitions.length === 1 && escapeHtmlDefinitions[0] === "app/core/strings.js") {
  ok("shared escapeHtml helper is canonical");
} else {
  fail(`escapeHtml helper should only live in app/core/strings.js; found ${escapeHtmlDefinitions.join(", ") || "(none)"}`);
}

const lazyLoaderDefinitions = [...appSourceByPath.entries()]
  .filter(([path]) => !thirdPartyRuntimePaths.has(path))
  .filter(([, source]) => /\bfunction\s+loadClassicScriptOnce\s*\(/.test(source))
  .map(([path]) => path);
if (lazyLoaderDefinitions.length === 1 && lazyLoaderDefinitions[0] === "app/core/config.js") {
  ok("shared lazy loader is canonical");
} else {
  fail(`loadClassicScriptOnce should only live in app/core/config.js; found ${lazyLoaderDefinitions.join(", ") || "(none)"}`);
}

const directMarkedParseCallers = [...appSourceByPath.entries()]
  .filter(([path]) => !thirdPartyRuntimePaths.has(path))
  .filter(([, source]) => /\bmarked\.parse\s*\(/.test(source))
  .map(([path]) => path);
if (!directMarkedParseCallers.length) {
  ok("Markdown rendering uses shared wrapper");
} else {
  fail(`direct marked.parse calls found outside shared wrapper: ${directMarkedParseCallers.join(", ")}`);
}
[
  ["AISystem6Perf", "performance instrumentation"],
  ["shouldSkipRender", "render signature skipping"],
  ["storageSnapshotChanged", "state-save snapshot skipping"],
  ["sendLocalModelTask", "unified model request layer"],
  ["readChatCompletionStream", "ClioTalk streaming reader"],
  ["fitPayloadWithModelBudget", "model budget preflight"],
  ["ragRankCache", "RAG ranking cache"],
].forEach(([needle, label]) => {
  if (appSource.includes(needle)) ok(`${label} present`);
  else fail(`${label} missing`);
});
[
  ["/api/model-budget", "model budget route"],
  ["proxyJsonStream", "streaming LM Studio proxy"],
].forEach(([needle, label]) => {
  if (serverSource.includes(needle)) ok(`${label} present`);
  else fail(`${label} missing`);
});
if (appSource.includes("about_version_value") && appSource.includes("formatAppVersion")) {
  ok("version/build UI hooks present");
} else {
  fail("version/build UI hooks missing");
}

if (appDataSource.includes('scrapbook: "Scrapbook"') && !appDataSource.includes('scrapbook: "剪贴簿"') && !appDataSource.includes('scrapbook: "便签本"')) {
  ok("Scrapbook brand label stays untranslated");
} else {
  fail("Scrapbook label drifted; keep the brand name as Scrapbook and reserve 便签本 for Note Pad");
}

const indexSource = readFileSync(join(root, "index.html"), "utf8");
[
  "reader-clip-translate-button",
  "toggle-scrap-translation",
  "download-scraps-bilingual",
  "clipboard-translate",
].forEach((id) => {
  if (indexSource.includes(`id="${id}"`)) ok(`translation control #${id}`);
  else fail(`translation control missing: #${id}`);
});

[
  "translateTextWithLocalModel",
  "translateTeachTextDocument",
  "clipReaderSelectionWithTranslation",
  "downloadSelectedScrapsBilingualMarkdown",
  "translateClipboardText",
  "scrapTranslationViewMode",
  "splitTranslationChunks",
  "translateTextChunkWithRetry",
].forEach((name) => {
  if (appSource.includes(`function ${name}`) || appSource.includes(`async function ${name}`)) {
    ok(`translation hook ${name}`);
  } else if (appSource.includes(name)) {
    ok(`translation hook ${name}`);
  } else {
    fail(`translation hook missing: ${name}`);
  }
});

[
  "bilingualMarkdownSection",
  "downloadTeachTextMarkdown",
  "downloadTeachTextBilingualMarkdown",
  "addProjectCdItem",
  "renderProjectCd",
  "getProjectCdItems",
  "downloadSelectedProjectCdItem",
  "printSelectedProjectCdPdf",
].forEach((name) => {
  if (appSource.includes(`function ${name}`) || appSource.includes(`async function ${name}`)) {
    ok(`export hook ${name}`);
  } else {
    fail(`export hook missing: ${name}`);
  }
});

[
  "project-cd-count",
  "project-cd-grid",
  "download-project-cd",
  "print-project-cd-pdf",
  "clear-project-cd",
  "page-setup-title",
].forEach((id) => {
  if (indexSource.includes(`id="${id}"`)) ok(`export control #${id}`);
  else fail(`export control missing: #${id}`);
});

const releaseBuildStamp = process.env.AI_SYSTEM6_BUILD || process.env.BUILD_NUMBER || buildInfo.build;
if (/^\d{8}\.\d+$/.test(String(releaseBuildStamp || ""))) {
  ok(`release build stamp ${releaseBuildStamp}`);
} else {
  fail("release build stamp missing or malformed; set build-info.json build or AI_SYSTEM6_BUILD as YYYYMMDD.N");
}

const versionConsistency = spawnSync(process.execPath, ["scripts/verify-version-consistency.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (versionConsistency.status === 0) {
  ok("single version source consistency");
} else {
  fail(`single version source consistency failed\n${versionConsistency.stderr || versionConsistency.stdout}`);
}

const frontendCheckJs = spawnSync(process.execPath, ["scripts/verify-frontend-jsdoc.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (frontendCheckJs.status === 0) {
  ok("frontend checkJs");
} else {
  fail(`frontend checkJs failed\n${frontendCheckJs.stderr || frontendCheckJs.stdout}`);
}

if (pkg.scripts?.["smoke:release"]) ok("smoke release script present");
else fail("smoke release script missing");

if (pkg.scripts?.bundle) ok("bundle script present");
else fail("bundle script missing");

if (failures.length) {
  console.error(`\nRelease verification failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`\nRelease verification passed with ${warnings.length} warning(s).`);
