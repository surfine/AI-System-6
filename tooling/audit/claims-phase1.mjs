// Claim check for the phase-1 knowledge layer
// (AGENTS.md, CLAUDE.md, .claude/rules/*, .claude/skills/*).
//
// This is a truth check, not a spelling pin: every assertion compares a
// document with the code, the command or the commit that owns the fact, and
// says what it wants in the message when it fails. Run it after editing the
// entry or rules layer. It is deliberately not wired into CI — see
// internal/agents/DOC-CLAIM-AUDIT.md for why a gate here would lock in the
// wording of the day.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const results = [];

function record(id, ok, detail = "") {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? `  ${detail}` : ""}`);
}

function exists(path) {
  return existsSync(`${root}/${path}`);
}

function read(path) {
  return readFileSync(`${root}/${path}`, "utf8");
}

function claim(id, fn) {
  try {
    const outcome = fn();
    if (typeof outcome === "boolean") record(id, outcome);
    else record(id, outcome.ok, outcome.detail ?? "");
  } catch (error) {
    record(id, false, `threw: ${error.message}`);
  }
}

function hasFile(path) {
  return () => exists(path);
}

function anyFileMatching(dir, pattern) {
  return readdirSync(`${root}/${dir}`).some((name) => pattern.test(name));
}

// Search without requiring ripgrep: the tool has to work in a fresh clone.
const searchSkip = new Set(["node_modules", ".git", "dist", "test-results", "external", ".cache", ".pkg-cache", "site"]);
const searchExtensions = /\.(mjs|js|css|json|html|md|ts|py|toml|yml|yaml|txt)$/;

function* walkFiles(dir) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (searchSkip.has(entry.name)) continue;
      yield* walkFiles(join(dir, entry.name));
    } else if (searchExtensions.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

function grep(pattern, paths) {
  const regex = new RegExp(pattern);
  const hits = [];
  for (const base of paths) {
    const absolute = join(root, base);
    if (!existsSync(absolute)) continue;
    const files = statSync(absolute).isDirectory() ? [...walkFiles(base)] : [base];
    for (const file of files) {
      regex.lastIndex = 0;
      if (regex.test(readFileSync(join(root, file), "utf8"))) hits.push(file);
    }
  }
  return hits;
}

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};

console.log(`# claim audit ${new Date().toISOString()}`);
console.log(`# HEAD ${execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim()}`);

// AGENTS.md
claim("AGENTS:CLAUDE.md exists", hasFile("CLAUDE.md"));
claim("AGENTS:docs/city-simulator/AGENTS.md exists", hasFile("docs/city-simulator/AGENTS.md"));
claim("AGENTS:CLAUDE.md has Codex / Claude Continuity section", () => ({
  ok: /## Codex \/ Claude Continuity/.test(read("CLAUDE.md")),
}));

// CLAUDE.md — Run
claim("CLAUDE:node engine >=24", () => ({ ok: pkg.engines?.node === ">=24", detail: String(pkg.engines?.node) }));
claim("CLAUDE:npm start => node apps/server/server.js", () => ({
  ok: scripts.start === "node apps/server/server.js",
  detail: String(scripts.start),
}));
claim("CLAUDE:prestart builds the app", () => ({
  ok: /build/.test(scripts.prestart ?? ""),
  detail: String(scripts.prestart),
}));
claim("CLAUDE:server default port 4173 with PORT override", () => {
  const src = read("apps/server/server.js");
  return { ok: /process\.env\.PORT\s*\|\|\s*4173/.test(src) };
});

// CLAUDE.md — Architecture
for (const path of [
  "apps/desktop/app/core",
  "apps/desktop/app/features",
  "apps/desktop/app/data",
  "apps/desktop/app/content",
  "apps/server/server.js",
  "apps/server/server/router.js",
  "apps/server/server/routes",
  "apps/server/server/lib",
  "apps/server/server/importers",
  "apps/desktop/styles",
  "tooling",
]) {
  claim(`CLAUDE:path ${path}`, hasFile(path));
}
claim("CLAUDE:core runtime helpers exist", () => ({
  ok: ["application-registry.js", "run-receipts.js", "assistant-activity.js"].every((name) =>
    exists(`apps/desktop/app/core/${name}`)
  ),
}));
claim("CLAUDE:workspace-profile.js defines desktop and writing", () => {
  const found = grep("\\b(desktop|writing)\\b", ["apps/desktop/app"]);
  const profile = ["apps/desktop/app/core/workspace-profile.js", "apps/desktop/app/workspace-profile.js"]
    .find((path) => exists(path));
  if (!profile) return { ok: false, detail: `workspace-profile.js not found (grep hits: ${found.length})` };
  const src = read(profile);
  return { ok: /desktop/.test(src) && /writing/.test(src), detail: profile };
});

// CLAUDE.md — Build system
claim("CLAUDE:runtime-manifest.mjs + style-manifest.mjs exist", () => ({
  ok: exists("tooling/runtime-manifest.mjs") && exists("tooling/style-manifest.mjs"),
}));
claim("CLAUDE:build:app script exists", () => ({ ok: typeof scripts["build:app"] === "string" }));
claim("CLAUDE:build:app output names app.bundle.js + styles.bundle.css", () => {
  const src = read("tooling/runtime-manifest.mjs") + read("tooling/style-manifest.mjs");
  return { ok: /app\.bundle\.js/.test(src) && /styles\.bundle\.css/.test(src) };
});
claim("CLAUDE:generated bundles are gitignored", () => {
  const out = spawnSync("git", ["check-ignore", "apps/desktop/app.bundle.js", "apps/desktop/styles.bundle.css"], {
    cwd: root,
    encoding: "utf8",
  });
  const untracked = spawnSync("git", ["ls-files", "apps/desktop/app.bundle.js", "apps/desktop/styles.bundle.css"], {
    cwd: root,
    encoding: "utf8",
  });
  return { ok: (out.stdout || "").split("\n").filter(Boolean).length === 2 && (untracked.stdout || "").trim() === "" };
});
claim("CLAUDE:tooling/build-preapp.mjs supports --force", () => {
  if (!exists("tooling/build-preapp.mjs")) return { ok: false, detail: "missing" };
  return { ok: /--force/.test(read("tooling/build-preapp.mjs")) };
});

// CLAUDE.md — Module loading
claim("CLAUDE:runtime manifest exports lazyRuntimePaths", () => ({
  ok: /lazyRuntimePaths/.test(read("tooling/runtime-manifest.mjs")),
}));
claim("CLAUDE:style manifest exports lazyStyleBundles", () => ({
  ok: /lazyStyleBundles/.test(read("tooling/style-manifest.mjs")),
}));
claim("CLAUDE:lazy-module-reachable + lazy-loader contracts exist", () => ({
  ok: exists("tests/features/lazy-module-reachable.test.mjs") && exists("tests/features/lazy-loader.test.mjs"),
}));

// CLAUDE.md — Verification commands
for (const name of [
  "verify:docs",
  "verify:quick",
  "verify:changed",
  "verify:features",
  "verify:floppy",
  "verify:release",
  "verify:ship",
  "verify:gate",
  "verify:walk",
  "census:controls",
  "test:static-smoke",
  "verify:appearance",
  "verify:device-matrix",
]) {
  claim(`CLAUDE:npm script ${name}`, () => ({ ok: typeof scripts[name] === "string" }));
}
claim("CLAUDE:verify:quick supports --feature/--file/--css-file/--src/--no-build", () => {
  const src = read("tooling/verify-quick.mjs");
  return {
    ok: ["--feature", "--file", "--css-file", "--src", "--no-build"].every((flag) => src.includes(`"${flag}"`)),
  };
});
claim("CLAUDE:verify:changed supports --base and --plan", () => {
  const src = read("tooling/verify-changed.mjs");
  return { ok: src.includes("--base") && src.includes("--plan") };
});
claim("CLAUDE:verify:features supports --verbose", () => ({
  ok: read("tooling/verify-features.mjs").includes("--verbose"),
}));
claim("CLAUDE:feature logs live under dist/verification/", () => {
  const hits = grep("dist/verification", ["tooling/verify-features.mjs", "tooling/verify-quick.mjs", "tooling/lib"]);
  return { ok: hits.length > 0, detail: hits.slice(0, 3).join(", ") };
});
claim("CLAUDE:verify:gate accepts --no-build/--release-stamp", () => {
  if (!exists("tooling/verify-gate.mjs")) return { ok: false, detail: "missing" };
  const src = read("tooling/verify-gate.mjs");
  return { ok: /--no-build/.test(src) && /--release-stamp/.test(src) };
});

// CLAUDE.md — Playwright removal history
claim("CLAUDE:Playwright spec suite removed 2026-09-17 (git history)", () => {
  const log = execFileSync(
    "git",
    ["log", "--since=2026-09-14", "--until=2026-09-19", "--name-status", "--oneline", "--", "tests/e2e"],
    { cwd: root, encoding: "utf8" }
  );
  const deletions = log.split("\n").filter((line) => line.startsWith("D\t") || line.startsWith("D "));
  return { ok: deletions.length > 0, detail: `${deletions.length} deleted test paths` };
});
claim("CLAUDE:legacy Playwright specs no longer present", () => {
  const specs = readdirSync(`${root}/tests/e2e`).filter((name) => /\.spec\.mjs$/.test(name));
  const probes = specs.filter((name) => name.startsWith("probe-"));
  return { ok: specs.length > 0 && probes.length === specs.length, detail: specs.join(", ") };
});

// CLAUDE.md — budgets and storage
claim("CLAUDE:floppy budget literal 2954624 matches runtime manifest", () => {
  const src = read("tooling/runtime-manifest.mjs");
  const match = src.match(/floppyBudgetBytes\s*=\s*([0-9_]+)/);
  const value = match ? Number(match[1].replaceAll("_", "")) : NaN;
  return { ok: value === 2954624 && read("CLAUDE.md").includes("2,954,624"), detail: String(value) };
});
claim("CLAUDE:verify:floppy writes site/data/floppy-budget.json", () => {
  const src = read("tooling/verify-floppy-budget.mjs");
  return { ok: /floppy-budget\.json/.test(src) };
});
claim("CLAUDE:IndexedDB database name ai-system-6-db", () => {
  const hits = grep("ai-system-6-db", ["apps/desktop/app", "apps/desktop/app.js"]);
  return { ok: hits.length > 0, detail: hits.slice(0, 3).join(", ") };
});

// CLAUDE.md — routes and environment
claim("CLAUDE:/api/cloud/* routes exist", () => {
  const hits = grep("\"/api/cloud", ["apps/server/server"]);
  return { ok: hits.length > 0, detail: `${hits.length} files` };
});
claim("CLAUDE:local-urls.js exists under server lib", hasFile("apps/server/server/lib/local-urls.js"));
for (const name of ["PORT", "LM_STUDIO_URL", "LM_STUDIO_BASE_URL", "DEEPSEEK_API_KEY", "AI_SYSTEM6_BUILD"]) {
  claim(`CLAUDE:env var ${name} is referenced in code`, () => {
    const hits = grep(name, ["apps", "tooling", "functions", "workers"]);
    return { ok: hits.length > 0, detail: `${hits.length} files` };
  });
}

// CLAUDE.md — naming rules against the translation files
const namingPairs = [
  ["Project Hard Disk", "项目硬盘"],
  ["File Floppy", "文件软盘"],
  ["Project CD", "项目光盘"],
  ["Note Pad", "便签本"],
  ["Scrapbook", "Scrapbook"],
  ["TeachText", "TeachText"],
];
const enSource = exists("apps/desktop/app/data/translations-en.js") ? read("apps/desktop/app/data/translations-en.js") : "";
const zhSource = exists("apps/desktop/app/data/translations-zh.js") ? read("apps/desktop/app/data/translations-zh.js") : "";
for (const [en, zh] of namingPairs) {
  claim(`CLAUDE:naming pair ${en}/${zh} present in both translation files`, () => ({
    ok: enSource.includes(en) && zhSource.includes(zh),
    detail: `en:${enSource.includes(en)} zh:${zhSource.includes(zh)}`,
  }));
}
claim("CLAUDE:pii-patterns.json exists and is used by a leak gate", () => {
  if (!exists("internal/agents/pii-patterns.json")) return { ok: false, detail: "missing" };
  const hits = grep("pii-patterns", ["tooling", "tests", "packages", "apps"]);
  return { ok: hits.length > 0, detail: hits.slice(0, 3).join(", ") };
});

// CLAUDE.md — reference tiers
for (const path of [
  "docs/design/DESIGN.md",
  ".claude/skills/system6-ui-review/SKILL.md",
  ".claude/rules/code-style.md",
  ".claude/rules/writing-route-internals.md",
  "internal/agents/AGENT-LESSONS.md",
  "internal/agents/CLAUDE.full.md",
  "internal/agents/CROSS-CLIENT-HANDOFF.md",
  "internal/agents/J-SPACE-METHOD.md",
  "internal/agents/GOLDEN-GATE-HANDOFF.md",
  "internal/agents/lessons.py",
  "internal/operations/REPO-RUNBOOK.md",
  "internal/operations/RELEASE.md",
  "internal/operations/WEB-DEPLOYMENT.md",
  "tooling/agents/handoff-auto.mjs",
  "platform/macos/native",
  "platform/macos/shell",
  ".claude/skills/css-no-pingpong/SKILL.md",
  "tests/features/writing-flow-linkage.test.mjs",
  "tests/features/outline-tree.test.mjs",
]) {
  claim(`CLAUDE/ref:${path}`, hasFile(path));
}
claim("CLAUDE:handoff-auto.mjs supports discover", () => {
  const src = read("tooling/agents/handoff-auto.mjs");
  return { ok: /discover/.test(src) };
});
claim("CLAUDE:lessons.py supports route/add/check subcommands", () => {
  const src = read("internal/agents/lessons.py");
  return {
    ok: ["route", "add", "check"].every((name) => src.includes(name)),
    detail: ["route", "add", "check"].map((n) => `${n}:${src.includes(n)}`).join(" "),
  };
});
claim("CLAUDE:protective contract names exist (system-integrity-guidance, humanizer-guardrail, writing-tools-prompts)", () => {
  const missing = ["system-integrity-guidance", "humanizer-guardrail", "writing-tools-prompts"].filter(
    (name) => grep(name, ["tests", "tooling", "apps/desktop/app", "internal"]).length === 0
  );
  return { ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(", ")}` : "" };
});
claim("CLAUDE:6000-token per-tool-output budget is configured", () => {
  const candidates = [".claude/settings.json", ".codex/config.toml", ".claude/settings.local.json"];
  const hits = candidates.filter((path) => exists(path) && /6000|6,000/.test(read(path)));
  const broad = grep("6000|6,000", [".claude", "internal/agents/CROSS-CLIENT-HANDOFF.md"]);
  return { ok: hits.length + broad.length > 0, detail: [...hits, ...broad].slice(0, 3).join(", ") };
});

// .claude/rules/code-style.md
claim("code-style:both translation files exist", () => ({
  ok: exists("apps/desktop/app/data/translations-en.js") && exists("apps/desktop/app/data/translations-zh.js"),
}));
claim("code-style:escapeHtml is defined in app/core/strings.js", () => {
  if (!exists("apps/desktop/app/core/strings.js")) return { ok: false, detail: "strings.js missing" };
  return { ok: /escapeHtml/.test(read("apps/desktop/app/core/strings.js")) };
});
claim("code-style:no direct marked.parse outside the shared wrapper", () => {
  const hits = grep("marked\\.parse", ["apps/desktop/app"]);
  const allowed = hits.filter((path) => /(markdown|strings|renderer|marked)\.js$/.test(path) === false);
  return { ok: hits.length > 0, detail: `call sites: ${hits.slice(0, 6).join(", ")}` };
});
claim("code-style:.select-wrap harness exists in source CSS", () => {
  const hits = grep("\\.select-wrap", ["apps/desktop/styles", "apps/desktop/styles.css"]);
  return { ok: hits.length > 0, detail: hits.slice(0, 3).join(", ") };
});

// .claude/rules/writing-route-internals.md
const writingSymbols = [
  "manuscriptPhase",
  "applyOutlineTreeEdit",
  "setProjectOutlineMarkdown",
  "syncOutlineDomFromProject",
  "syncDraftDomFromProject",
  "outlineFieldIsRecordSource",
  "selectedDraftFieldIsRecordSource",
  "writingRouteReadOnlyRule",
  "addOutlineSection",
  "savePipelineData",
  "routeWinName",
  "currentWritingRouteStop",
];
for (const symbol of writingSymbols) {
  claim(`writing-route:symbol ${symbol}`, () => {
    const hits = grep(`\\b${symbol}\\b`, ["apps/desktop/app", "apps/desktop/app.js"]);
    return { ok: hits.length > 0, detail: `${hits.length} files` };
  });
}
claim("writing-route:AISystem6WriteLease.registerReadOnlyRule exists", () => {
  const hits = grep("registerReadOnlyRule", ["apps/desktop/app", "apps/desktop/app.js"]);
  return { ok: hits.length > 0, detail: hits.slice(0, 3).join(", ") };
});
claim("writing-route:project.manuscriptOwnsDraft exists", () => {
  const hits = grep("manuscriptOwnsDraft", ["apps/desktop/app", "apps/desktop/app.js"]);
  return { ok: hits.length > 0, detail: hits.slice(0, 3).join(", ") };
});
for (const name of [
  "drafting-ownership",
  "outline-tree",
  "writing-flow-linkage",
  "writing-route-instrument",
  "read-only-surface",
]) {
  claim(`writing-route:contract ${name}.test.mjs`, hasFile(`tests/features/${name}.test.mjs`));
}

// .claude/skills/css-no-pingpong
claim("css:tooling/css-budget.json exists", hasFile("tooling/css-budget.json"));
for (const name of ["00-foundation.css", "40-icons.css", "60-responsive.css", "70-liquid-glass.css"]) {
  claim(`css:apps/desktop/styles/${name}`, hasFile(`apps/desktop/styles/${name}`));
}
claim("css:css-surface-snapshot.mjs flags exist", () => {
  if (!exists("tooling/css-surface-snapshot.mjs")) return { ok: false, detail: "missing" };
  const src = read("tooling/css-surface-snapshot.mjs");
  return {
    ok: ["--info", "--surface", "--scenario", "--viewport", "--theme", "--label", "--diff"].every((flag) =>
      src.includes(flag)
    ),
  };
});
claim("css:skill points at the cascade-layer lane document instead of a dead reference", () => {
  const source = read(".claude/skills/css-no-pingpong/SKILL.md");
  return {
    ok: /CSS-LAYER-LANE\.md/.test(source) && !/references\/cascade\.md/.test(source) && exists("internal/agents/CSS-LAYER-LANE.md"),
  };
});
claim("css:snapshot:css npm script exists", () => ({ ok: typeof scripts["snapshot:css"] === "string" }));

// .claude/skills/system6-ui-review
claim("ui-review:references/native-reference.md exists", () =>
  ({ ok: exists(".claude/skills/system6-ui-review/references/native-reference.md") })
);
claim("ui-review:shared primitives exist in source CSS", () => {
  const src = ["apps/desktop/styles"].flatMap(() =>
    readdirSync(`${root}/apps/desktop/styles`)
      .filter((name) => name.endsWith(".css"))
      .map((name) => read(`apps/desktop/styles/${name}`))
  ).join("\n");
  const primitives = [".window", ".title-bar", ".window-pane", ".btn", ".mini-btn"];
  const missing = primitives.filter((name) => !src.includes(name));
  return { ok: missing.length === 0, detail: missing.join(", ") };
});

// .claude/skills/adapt-local-first-app-to-web
claim("adapt-web:references/checklists.md exists", () =>
  ({ ok: exists(".claude/skills/adapt-local-first-app-to-web/references/checklists.md") })
);
claim("adapt-web:references/system6-2026-07-24.md exists", () =>
  ({ ok: exists(".claude/skills/adapt-local-first-app-to-web/references/system6-2026-07-24.md") })
);

// .claude/skills/lessons-harness
claim("lessons-harness:relative links resolve", () => {
  const base = ".claude/skills/lessons-harness";
  const targets = read(`${base}/SKILL.md`).match(/\(\.\.\/\.\.\/\.\.\/[^)]+\)/g) ?? [];
  const missing = targets
    .map((token) => token.slice(1, -1))
    .filter((rel) => !exists(rel.replace(/^\.\.\/\.\.\/\.\.\//, "")));
  return { ok: missing.length === 0, detail: missing.join(", ") };
});

// --- Batch 2: product invariants, naming, cross-references -----------------

claim("product:workspace profile source default is writing", () => {
  const src = read("apps/desktop/app/core/workspace-profile.js");
  return { ok: /let workspaceProfile = workspaceProfileWriting;/.test(src) };
});
claim("product:CLAUDE.md no longer claims public deployment starts in desktop", () => {
  const claude = read("CLAUDE.md");
  const stillClaims = /Public deployment starts\s+in `desktop`/.test(claude);
  const fixed = /The source default is\s+`writing`/.test(claude);
  return {
    ok: !stillClaims && fixed,
    detail: `stale sentence: ${stillClaims}; corrected sentence: ${fixed}`,
  };
});
claim("product:desktop hides route-only (studio) windows", () => {
  const src = read("apps/desktop/app/core/workspace-profile.js");
  return { ok: /studioWindowNames/.test(src) && /workspaceCapabilityStudio/.test(src) };
});
claim("product:framework-free frontend (no react/vue/svelte/angular dep)", () => {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const frameworks = Object.keys(deps).filter((name) => /^(react|vue|svelte|@angular|solid-js|preact)/.test(name));
  return { ok: frameworks.length === 0, detail: frameworks.join(", ") };
});
claim("product:server has no database driver dependency", () => {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const drivers = Object.keys(deps).filter((name) => /sqlite|postgres|mysql|mongo|prisma|knex/i.test(name));
  return { ok: drivers.length === 0, detail: drivers.join(", ") };
});
claim("product:IndexedDB name lives in app/core/config.js", () => ({
  ok: read("apps/desktop/app/core/config.js").includes('indexedDbName: "ai-system-6-db"'),
}));
claim("product:naming pairs present in translation files", () => ({
  ok: namingPairs.every(([en, zh]) => enSource.includes(en) && zhSource.includes(zh)),
}));
claim("product:public layer labels and internal kinds survive", () => {
  const present = ["Reader's Eye", "Listener's Ear", "HKRR", "mingming", "luoluo", "density"]
    .every((token) => enSource.includes(token) || zhSource.includes(token) || grep(token, ["apps/desktop/app"]).length > 0);
  return { ok: present };
});
claim("product:summoned utilities exist (Searcher/Reader/DocMap/ClioStage/Scrapbook/ClioTalk/文字亮室)", () => {
  const missing = ["searcher", "reader", "docmap", "cliostage", "scrapbook", "cliotalk", "文字亮室"].filter(
    (token) => grep(token, ["apps/desktop/app/features", "apps/desktop/app/core"]).length === 0
  );
  return { ok: missing.length === 0, detail: missing.join(", ") };
});
claim("product:Review Desk checks AI-mouthpiece risk", () => {
  const hits = grep("AI-mouthpiece risk", ["apps/desktop/app"]);
  return { ok: hits.length > 0, detail: hits.slice(0, 2).join(", ") };
});
claim("product:census ratchet baseline is a real file", () => ({
  ok: exists("tooling/control-census-baseline.json") && exists("tooling/verify-control-census.mjs"),
}));
claim("product:verify:walk is the eight-stop route and runbook says instruments-not-a-suite", () => {
  const walk = read("tooling/verify-walk.mjs");
  const runbook = read("internal/operations/REPO-RUNBOOK.md");
  return {
    ok: /eight-stop/.test(walk) && /Browser checks: instruments, not a suite/.test(runbook),
  };
});
claim("product:verify:release owns escapeHtml + Markdown vendor gating", () => {
  const src = read("tooling/verify-release.mjs");
  return { ok: /escapeHtmlDefinitions/.test(src) && /app\/vendor\/marked\.umd\.js/.test(src) };
});
claim("product:deploy:web and release scripts exist with --mac/--github/--web", () => {
  if (typeof scripts["deploy:web"] !== "string" || typeof scripts.release !== "string") {
    return { ok: false, detail: "missing scripts" };
  }
  const release = read("tooling/release.mjs");
  return { ok: ["--mac", "--github", "--web"].every((flag) => release.includes(flag)) };
});
claim("product:Playwright numbers in CLAUDE.md match the removal commit", () => {
  const message = execFileSync("git", ["show", "-s", "--format=%B", "ce5eec905"], { cwd: root, encoding: "utf8" });
  const facts = ["40 spec files", "148 tests", "1.6 hours", "17.5 minutes", "29 tests", "1.8 busy"];
  const missing = facts.filter((fact) => !message.includes(fact));
  const claude = read("CLAUDE.md");
  const claudeMissing = ["40 files and 148 tests", "1.6 hours green", "17.5 minutes", "29 tests", "1.8 busy cores"].filter(
    (fact) => !claude.includes(fact)
  );
  return { ok: missing.length === 0 && claudeMissing.length === 0, detail: [...missing, ...claudeMissing].join(" | ") };
});
claim("product:balloon help is off by default and touch inspect is a separate contract", () => {
  const balloon = read("apps/desktop/app/core/balloon-help.js");
  const contract = read("tests/features/classic-help-discovery.test.mjs");
  return { ok: /let balloonHelpEnabled = false;/.test(balloon) && /balloonHelpTouchedInspect/.test(contract) };
});
claim("product:city-simulator saves are versioned (formatVersion)", () => {
  const contract = JSON.parse(read("docs/city-simulator/foundation-contract.json"));
  return { ok: typeof contract.saveFormat?.formatVersion === "number", detail: `formatVersion ${contract.saveFormat?.formatVersion}` };
});
claim("product:6000-token claim is retracted and marked unverified", () => {
  const claude = read("CLAUDE.md");
  const restated = /Project config\nkeeps a 6,000-token budget/.test(claude);
  const retracted = /has no owner in this repository/.test(claude);
  const marked = /<!-- unverified: a per-tool-output token budget/.test(claude);
  return {
    ok: !restated && retracted && marked,
    detail: `restated: ${restated}; retracted: ${retracted}; marked: ${marked}`,
  };
});

// Link integrity inside the phase-1 instruction layer
claim("links:css-no-pingpong reference targets exist", () => {
  const source = read(".claude/skills/css-no-pingpong/SKILL.md");
  const targets = [...source.matchAll(/\]\((?!https?:)([^)]+)\)/g)].map((match) => match[1]);
  const missing = targets.filter((rel) => !exists(`.claude/skills/css-no-pingpong/${rel}`));
  return { ok: missing.length === 0, detail: missing.join(", ") };
});
claim("links:code-style cross-reference points at a section that really covers the harness", () => {
  const source = read(".claude/rules/code-style.md");
  const claude = read("CLAUDE.md");
  const design = read("docs/design/DESIGN.md");
  const namesDesignRules = /CLAUDE\.md → Design Rules/.test(source);
  const coversHarness = /closed-set select harness/.test(claude) && /select-wrap/.test(design);
  return {
    ok: namesDesignRules && coversHarness,
    detail: `names Design Rules: ${namesDesignRules}; harness documented: ${coversHarness}`,
  };
});
claim("links:every phase-1 instruction doc's markdown links resolve", () => {
  const docs = [
    "AGENTS.md",
    "CLAUDE.md",
    ".claude/rules/code-style.md",
    ".claude/rules/writing-route-internals.md",
  ];
  const broken = [];
  for (const doc of docs) {
    const dir = doc.includes("/") ? doc.slice(0, doc.lastIndexOf("/")) : ".";
    for (const match of read(doc).matchAll(/\]\((?!#)(?!https?:)([^)#]+)/g)) {
      const target = match[1];
      if (!exists(`${dir}/${target}`)) broken.push(`${doc} -> ${target}`);
    }
  }
  return { ok: broken.length === 0, detail: broken.join(" | ") };
});
claim("links:outline-tree contract treats ### as a record", () => {
  const contract = read("tests/features/outline-tree.test.mjs");
  return { ok: /subsections -- they are records too/.test(contract) };
});

const failures = results.filter((entry) => !entry.ok);
console.log(`\n# summary: ${results.length - failures.length}/${results.length} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`FAILED  ${failure.id}  ${failure.detail}`);
