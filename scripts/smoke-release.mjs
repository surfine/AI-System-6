import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimePaths, lazyRuntimePaths } from "./runtime-manifest.mjs";
import { styleRuntimePaths } from "./style-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function ok(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertFile(path) {
  if (existsSync(join(root, path))) ok(path);
  else fail(`${path} missing`);
}

[
  "index.html",
  "app.bundle.js",
  ...appRuntimePaths,
  ...lazyRuntimePaths,
  "styles.css",
  "CLAUDE.md",
  "native/README.md",
].forEach(assertFile);

const index = read("index.html");
const appConfig = read("app/core/config.js");
const appData = [
  "app/data/system-data.js",
  "app/data/translations-en.js",
  "app/data/translations-zh.js",
].map(read).join("\n");
const appDictionary = read("app/data/system-dictionary.js");
const appContent = read("app/content/rebuild-samples.js");
const appBundle = read("app.bundle.js");
const app = [...appRuntimePaths, ...lazyRuntimePaths, "app.bundle.js"].map(read).join("\n");
const styles = ["styles.css", ...styleRuntimePaths].map(read).join("\n");
const claudeDoc = read("CLAUDE.md");
const terminologySurface = [
  index,
  appConfig,
  appData,
  appDictionary,
  appContent,
  app,
  styles,
  claudeDoc,
].join("\n");
const legacyToken = (...parts) => parts.join("");

[
  legacyToken("Inspir", "ation Sea", "rch"),
  legacyToken("灵", "感检", "索"),
  legacyToken("inspir", "ationSea", "rch"),
  legacyToken("inspir", "ation-sea", "rch"),
  legacyToken("inspir", "ation_sea", "rch"),
  legacyToken("open-inspir", "ation"),
  legacyToken("记", "忆检查", "器"),
  legacyToken("Stu", "dy Stu", "dio"),
  legacyToken("学", "习工作", "室"),
  legacyToken("stu", "dyStu", "dio"),
  legacyToken("stu", "dy-stu", "dio"),
  legacyToken("stu", "dy_stu", "dio"),
  legacyToken("open-stu", "dy-stu", "dio"),
  legacyToken("Stu", "dy Gui", "de"),
  legacyToken("stu", "dyGui", "de"),
  legacyToken("stu", "dy_gui", "de"),
  legacyToken("make-stu", "dy-gui", "de"),
  legacyToken("Clip", " Collec", "tor"),
  legacyToken("Clip", "Box"),
  legacyToken("Sco", "utPath"),
  legacyToken("Source", "Box"),
  legacyToken("Draft", "Box"),
  legacyToken("Mem", "oryBox"),
  legacyToken("Mem", "oryPanel"),
  legacyToken("sourceContractForMem", "ory"),
  legacyToken("openSourceForMem", "ory"),
  legacyToken("De", "mo", " Pro", "ject"),
  legacyToken("de", "mo", "Project"),
  legacyToken("de", "mo", "_project"),
  legacyToken("create-de", "mo", "-project"),
  legacyToken("guide-create-de", "mo", "-project"),
  legacyToken("start-de", "mo", "-path"),
  legacyToken("示", "范项", "目"),
  legacyToken("导", "出光", "盘"),
].forEach((token) => {
  if (terminologySurface.includes(token)) fail(`old terminology still present: ${token}`);
  else ok(`old terminology absent: ${token}`);
});

if (appData.includes('scrapbook: "Scrapbook"') && !appData.includes('scrapbook: "剪贴簿"') && !appData.includes('scrapbook: "便签本"')) {
  ok("Scrapbook brand label stays untranslated");
} else {
  fail("Scrapbook label drifted; keep the brand name as Scrapbook and reserve 便签本 for Note Pad");
}

if (
  index.includes("app.bundle.js") &&
  !index.includes("app/core/config.js") &&
  !index.includes("app/features/reader.js")
) {
  ok("single runtime app bundle");
} else {
  fail("index.html should load only app.bundle.js for runtime app code");
}

if (appBundle.includes("app/core/config.js") && appBundle.includes("app/features/reader.js") && appBundle.includes("app.js")) {
  ok("app bundle source sections");
} else {
  fail("app bundle is missing source sections");
}

if (
  index.includes('class="select-wrap') &&
  app.includes("function initSystemSelectControls") &&
  app.includes("function refreshSystemSelectControls") &&
  app.includes("system-select-button") &&
  app.includes("system-select-menu") &&
  styles.includes(".select-wrap.has-system-select > select") &&
  styles.includes(".system-select-button") &&
  styles.includes(".system-select-menu") &&
  styles.includes("pointer-events: none")
) {
  ok("System 6 custom select harness");
} else {
  fail("visible select controls must use the custom System 6 dropdown harness, not the OS/browser native menu");
}

[
  "teachtext-label",
  "outline-pipeline-label",
  "draft-pipeline-label",
].forEach((id) => {
  const wrappedSelectPattern = new RegExp(`<div class="[^"]*select-wrap[^"]*"[^>]*>\\s*<select id="${id}"`);
  if (wrappedSelectPattern.test(index)) ok(`custom select wrapper #${id}`);
  else fail(`custom select wrapper missing for #${id}`);
});

[
  "project-backup-file-button",
  "import-files-button",
  "import-project-backup",
  "export-project-disk",
  "project-switcher-button",
  "project-switcher-popover",
  "teachtext-body",
  "teachtext-mode-state",
  "teachtext-source-count",
  "teachtext-selection-state",
  "teachtext-export-state",
  "rebuild-flow-source",
  "rebuild-flow-source-meta",
  "rebuild-flow-status",
  "draft-section-source",
  "draft-title",
  "reader-clip-translate-button",
  "download-scraps-bilingual",
  "draft-list",
  "claim-results",
  "scrap-source-info",
  "model-state-panel",
  "model-state-next",
  "status-model-state",
  "status-current-task",
  "project-cd-grid",
  "print-project-cd-pdf",
  "page-setup-title",
].forEach((id) => {
  if (index.includes(`id="${id}"`)) ok(`UI control #${id}`);
  else fail(`UI control missing: #${id}`);
});

[
  "product_track_value",
  "native_target_value",
  "prototype_boundary_value",
].forEach((key) => {
  if (appData.includes(`${key}:`)) ok(`system status copy ${key}`);
  else fail(`system status copy missing: ${key}`);
});

[
  "guide_heading",
  "guide_body",
  "guide_start_hint",
].forEach((key) => {
  if (appData.includes(`${key}:`)) ok(`guide copy ${key}`);
  else fail(`guide copy missing: ${key}`);
});

[
  "buildProjectDiskExport",
  "importProjectBackupAsNewProject",
  "translateTextWithLocalModel",
  "splitTranslationChunks",
  "bilingualMarkdownSection",
  "insertDraftToTeachText",
  "updateTeachTextDeskState",
  "markTeachTextExported",
  "renderProjectSwitcher",
  "openRebuildFlow",
  "runRebuildFlow",
  "rebuildProjectDiskName",
  "useSampleArticleForRebuildFlow",
  "buildNativeHandoff",
  "copyNativeBrief",
  "exportNativeHandoff",
  "clipTeachTextSelectionToScrapbook",
  "runClaimCheck",
  "sourceContractForContextItem",
  "openSourceForContextItem",
  "updateLocalModelState",
  "renderLocalModelState",
  "jumpToTeachTextClaim",
  "enterWriterMode",
].forEach((name) => {
  if (app.includes(`function ${name}`) || app.includes(`async function ${name}`)) ok(`app hook ${name}`);
  else fail(`app hook missing: ${name}`);
});

// CLAUDE.md is the single source of truth. Enforce key sections still present.
[
  "What This Is",
  "Run",
  "Architecture",
  "Build System",
  "Module Loading",
  "Verification",
  "Floppy Budget",
  "Storage",
  "Server API Routes",
  "Environment Variables",
  "Naming Rules",
  "Design Rules",
  "Common Pitfalls",
].forEach((section) => {
  const sectionPattern = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");
  if (sectionPattern.test(claudeDoc)) ok(`CLAUDE.md section ${section}`);
  else fail(`CLAUDE.md section missing: ${section}`);
});

// Guardrails moved out of the always-loaded CLAUDE.md live in path-scoped rules
// (.claude/rules/, auto-loaded when matching files are opened). The smoke
// contract follows the content: these files must exist and keep their core
// tokens, so nothing important becomes silently unguarded.
[
  [".claude/rules/code-style.md", ["translations-zh.js", "marked.parse", "app/core/strings.js"]],
  [".claude/rules/writing-route-internals.md", ["document.activeElement", "writing-flow-linkage.test.mjs"]],
].forEach(([path, tokens]) => {
  if (!existsSync(join(root, path))) {
    fail(`path-scoped rule missing: ${path}`);
    return;
  }
  const ruleBody = read(path);
  tokens.forEach((token) => {
    if (ruleBody.includes(token)) ok(`rule ${path} keeps "${token}"`);
    else fail(`rule ${path} should keep "${token}"`);
  });
});

[
  "document-clip",
  "buildProjectSourceRegistry",
  "sourceTextForRegistryItem",
].forEach((token) => {
  if (app.includes(token)) ok(`source registry hook ${token}`);
  else fail(`source registry hook missing: ${token}`);
});

if (failures.length) {
  console.error(`\nSmoke release check failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nSmoke release check passed.");
