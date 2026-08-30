import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimePaths, lazyRuntimePaths } from "./runtime-manifest.mjs";
import { classicScriptFileSyntaxError } from "./lib/classic-script-syntax.mjs";
import { resolveProjectPath } from "./lib/paths.mjs";
import {
  BASE_REQUIRED_CHECKS,
  writeBaseVerificationReceipt,
} from "./lib/verification-receipt.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const warnings = [];
const receiptChecks = [];
const verificationStartedAt = new Date().toISOString();

function runReceiptCheck(name, command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, options);
  receiptChecks.push({
    name,
    command: `${command} ${args.join(" ")}`,
    exitCode: result.status === null ? 1 : result.status,
    durationMs: Date.now() - started,
  });
  return result;
}

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
  if (existsSync(resolveProjectPath(path))) ok(path);
  else fail(`${path} is missing`);
}

function checkSyntax(path) {
  const error = classicScriptFileSyntaxError(resolveProjectPath(path));
  if (!error) {
    ok(`${path} syntax`);
    return;
  }
  fail(`${path} syntax failed\n${error.stack || error.message || String(error)}`);
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

const appBundle = runReceiptCheck("build-app", process.execPath, ["tooling/build-app-bundle.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (appBundle.status === 0) {
  ok("app bundle built");
} else {
  fail(`app bundle build failed\n${appBundle.stderr || appBundle.stdout}`);
}

const releaseAssets = runReceiptCheck("release-assets", process.execPath, ["tooling/check-release-assets.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (releaseAssets.status === 0) {
  ok("release assets present");
} else {
  fail(`release asset check failed\n${releaseAssets.stderr || releaseAssets.stdout}`);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const srcTypecheck = runReceiptCheck("server-typecheck", npmCommand, ["--prefix", "apps/server", "run", "typecheck"], {
  cwd: root,
  encoding: "utf8",
});
if (srcTypecheck.status === 0) {
  ok("server typecheck");
} else {
  fail(`server typecheck failed\n${srcTypecheck.stderr || srcTypecheck.stdout}`);
}

const serverLint = runReceiptCheck("server-lint", npmCommand, ["run", "lint"], {
  cwd: root,
  encoding: "utf8",
});
if (serverLint.status === 0) {
  ok("server lint");
} else {
  fail(`server lint failed\n${serverLint.stderr || serverLint.stdout}`);
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
  "apps/server/server.js",
  "package.json",
  "CLAUDE.md",
].forEach(assertExists);
[...appRuntimePaths, ...lazyRuntimePaths].forEach(checkSyntax);
checkSyntax("app.bundle.js");
checkSyntax("apps/server/server.js");

const dataBoundary = runReceiptCheck("data-boundary", process.execPath, ["tooling/verify-data-boundary.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (dataBoundary.status === 0) {
  ok("data boundary verification");
} else {
  fail(`data boundary verification failed\n${dataBoundary.stderr || dataBoundary.stdout}`);
}

const serviceBoundary = runReceiptCheck("service-boundary", process.execPath, ["tooling/verify-service-boundary.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (serviceBoundary.status === 0) {
  ok("service boundary verification");
} else {
  fail(`service boundary verification failed\n${serviceBoundary.stderr || serviceBoundary.stdout}`);
}

// The native Swift rewrite is frozen (platform/macos/native/FROZEN.md). Its
// action audit and parity ledger used to run here, which meant every new web
// action had to be entered in ACTION-AUDIT.md, its Chinese mirror, the mirror's
// hash, and the ledger's verdict counts — four files, to keep the books of an
// application nobody is building. The audits stay in the tree as an honest
// record of where the port stopped; they are no longer a release condition.
// `npm run verify:native-action-audit` still runs them on demand, and should,
// the day the lane reopens.

const floppyBudget = runReceiptCheck("floppy-budget", process.execPath, ["tooling/verify-floppy-budget.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (floppyBudget.status === 0) {
  ok("System Floppy Budget");
} else {
  fail(`System Floppy Budget failed\n${floppyBudget.stderr || floppyBudget.stdout}`);
}

// A merge can keep a commit in history while dropping its bytes from the
// tree, and git log shows nothing (504a2b20). When HEAD is a merge, verify
// its content; on a non-merge HEAD this is a no-op, so releasing from an
// ordinary commit costs nothing. Intentional one-sided resolutions are
// acknowledged with --accept in the merge workflow, not here.
const mergeContent = runReceiptCheck("merge-content", process.execPath, [
  "tooling/verify-merge-content.mjs", "--merge", "HEAD", "--quiet",
  // The desktop-project-disks merge kept main's generated build identity and
  // the newer measured floppy payload; both are regenerated/remeasured by the
  // release itself, so the branch's older bytes are an intentional discard.
  "--accept", "apps/desktop/app/generated/build-info.js",
  "--accept", "apps/desktop/app/generated/build-info.json",
  "--accept", "site/data/floppy-budget.json",
], {
  cwd: root,
  encoding: "utf8",
});
if (mergeContent.status === 0) {
  ok("merge content verification");
} else {
  fail(`merge content verification failed\n${mergeContent.stderr || mergeContent.stdout}`);
}

const smokeRelease = runReceiptCheck("release-smoke", process.execPath, ["tooling/smoke-release.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (smokeRelease.status === 0) {
  ok("release smoke verification");
} else {
  fail(`release smoke verification failed\n${smokeRelease.stderr || smokeRelease.stdout}`);
}

const featureTests = runReceiptCheck("feature-tests", process.execPath, ["tooling/verify-features.mjs"], {
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

const docLocales = runReceiptCheck("docs", process.execPath, ["tooling/verify-doc-locales.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (docLocales.status === 0) {
  ok("doc locale verification");
} else {
  fail(`doc locale verification failed\n${docLocales.stderr || docLocales.stdout}`);
}

const cssBudget = runReceiptCheck("css", process.execPath, ["tooling/verify-css.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (cssBudget.status === 0) {
  ok("CSS budget verification");
} else {
  fail(`CSS budget verification failed\n${cssBudget.stderr || cssBudget.stdout}`);
}

const designGovernance = runReceiptCheck("design", process.execPath, ["tooling/verify-design.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (designGovernance.status === 0) {
  ok("design governance verification");
} else {
  fail(`design governance verification failed\n${designGovernance.stderr || designGovernance.stdout}`);
}

const officialSite = runReceiptCheck("site", process.execPath, ["tooling/verify-site.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (officialSite.status === 0) {
  ok("official-site verification");
} else {
  fail(`official-site verification failed\n${officialSite.stderr || officialSite.stdout}`);
}

if (/^\d+\.\d+\.\d+/.test(pkg.version || "")) ok(`package version ${pkg.version}`);
else fail(`package version is not semver-like: ${pkg.version || "(missing)"}`);

const pkgAssets = new Set(pkg.macPackagedAssets?.assets || []);
[
  "build-info.json",
  "apps/desktop/index.html",
  "apps/desktop/app.bundle.js",
  "tooling/markitdown-adapter.py",
  "tooling/transcribe-audio-macos.swift",
  "tooling/transcribe-audio-macos26.swift",
  "apps/desktop/app/**/*.js",
  "apps/desktop/data/**/*.json",
  "apps/desktop/app.js",
  "apps/desktop/styles.css",
  "apps/desktop/styles.bundle.css",
  "apps/desktop/styles.theme-lab.css",
  "apps/desktop/assets/cursors/system6-watch.png",
  "apps/desktop/assets/themes/snow-leopard/radio-selected.svg",
  "system.css-reference/fonts/*.woff",
  "system.css-reference/fonts/*.woff2",
].forEach((asset) => {
  if (pkgAssets.has(asset)) ok(`packaged asset ${asset}`);
  else fail(`packaged asset missing: ${asset}`);
});

{
  const payloadBuilder = readFileSync(join(root, "tooling/build-mac-server-payload.mjs"), "utf8");
  if (/MIN_PACKAGED_NODE_MAJOR = 24/.test(payloadBuilder)) ok("mac payload refuses pre-24 Node runtimes");
  else fail("tooling/build-mac-server-payload.mjs lost its packaged-runtime floor");
}

const fontDir = join(root, "system.css-reference/fonts");
if (existsSync(fontDir)) {
  const fonts = readdirSync(fontDir).filter((name) => /\.(woff2?|ttf|otf)$/i.test(name));
  if (fonts.length) ok(`${fonts.length} font assets found`);
  else fail("system.css-reference/fonts contains no font assets");
} else {
  fail("system.css-reference/fonts is missing");
}

const cursorPath = "apps/desktop/assets/cursors/system6-watch.png";
if (existsSync(join(root, cursorPath))) {
  const cursor = readFileSync(join(root, cursorPath));
  const isPng = cursor.length >= 24
    && cursor.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && cursor.readUInt32BE(16) === 16
    && cursor.readUInt32BE(20) === 16;
  if (isPng) ok(`${cursorPath} is a native-size PNG`);
  else fail(`${cursorPath} must be a valid 16×16 PNG`);
} else fail(`${cursorPath} is missing`);

const versionRouteSource = readFileSync(join(root, "apps/server/server/routes/version.js"), "utf8");
if (versionRouteSource.includes("/api/version") || versionRouteSource.includes("handleVersion")) {
  ok("/api/version route present");
} else {
  fail("/api/version route missing");
}

const appSource = [...appRuntimePaths, ...lazyRuntimePaths].map((path) => readFileSync(resolveProjectPath(path), "utf8")).join("\n");
const serverSourcePaths = [
  "apps/server/server.js",
  ...listJsFilesRelative("apps/server/server"),
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
  [...appRuntimePaths, ...lazyRuntimePaths].map((path) => [path, readFileSync(resolveProjectPath(path), "utf8")])
);
const appDataSource = [
  "app/data/system-data.js",
  "app/data/translations-en.js",
  "app/data/translations-zh.js",
].map((path) => readFileSync(resolveProjectPath(path), "utf8")).join("\n");
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

const indexSource = readFileSync(join(root, "apps/desktop/index.html"), "utf8");
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

const versionConsistency = runReceiptCheck("version-consistency", process.execPath, ["tooling/verify-version-consistency.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (versionConsistency.status === 0) {
  ok("single version source consistency");
} else {
  fail(`single version source consistency failed\n${versionConsistency.stderr || versionConsistency.stdout}`);
}

const frontendCheckJs = runReceiptCheck("frontend-checkjs", process.execPath, ["tooling/verify-frontend-jsdoc.mjs"], {
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

receiptChecks.push({
  name: "static-contracts",
  command: "verify-release static contracts",
  exitCode: failures.length ? 1 : 0,
  durationMs: 0,
});

if (failures.length) {
  console.error(`\nRelease verification failed: ${failures.length} issue(s).`);
  process.exit(1);
}

const missingReceiptChecks = BASE_REQUIRED_CHECKS.filter(
  (name) => !receiptChecks.some((check) => check.name === name),
);
if (missingReceiptChecks.length) {
  console.error(`\nRelease verification receipt is missing checks: ${missingReceiptChecks.join(", ")}`);
  process.exit(1);
}
const { destination: baseReceiptPath } = await writeBaseVerificationReceipt(root, {
  checks: receiptChecks,
  startedAt: verificationStartedAt,
});
console.log(`Base verification receipt: ${baseReceiptPath}`);
console.log(`\nRelease verification passed with ${warnings.length} warning(s).`);
