// Context Gist applies HD-Gist-style compression in the app layer: coarse
// context goes in first, relevant details unfold dynamically, and high-risk
// tasks fall back to raw context when reconstruction checks fail.

import vm from "node:vm";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("context-gist");
const gist = read("app/core/context-gist.js");
const retrieval = read("app/core/context-retrieval.js");
const chatMessages = read("app/core/chat-messages.js");
const scrapbook = read("app/features/scrapbook.js");
const manifest = read("tooling/runtime-manifest.mjs");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");
const outlineClaim = read("app/features/outline-claim.js");
const writingFlow = read("app/features/writing-flow.js");
const mingmingHandoff = read("app/features/mingming-handoff-review.js");

test.assertIncludes(manifest, '"app/core/context-gist.js"', "runtime manifest loads the context gist module");
test.assertIncludes(retrieval, 'typeof buildContextGistPacket === "function"', "context retrieval guards the lazy gist helper until it loads in the background");

test.assertIncludes(gist, "function buildContextGistPacket", "context gist module exposes packet construction");
test.assertIncludes(gist, "Hierarchical context gist", "packet sends coarse gist cards before detailed context");
test.assertIncludes(gist, "Dynamically revealed detail gist", "packet can reveal matching detail gist only when relevant");
test.assertIncludes(gist, "Necessary raw excerpts", "packet can add raw excerpts for reconstruction guard failures");
test.assertIncludes(gist, "function contextGistProtectedAtoms", "reconstruction guard protects entities, numbers, citations, and user terms");
test.assertIncludes(gist, "function contextGistMissingAtoms", "reconstruction guard checks compressed packets before sending them");
test.assertIncludes(gist, "usedFallback: true", "guard can fall back to raw context without lowering answer quality");
test.assertIncludes(gist, "compressionRatio", "packet records compression ratio for diagnostics");

test.assertIncludes(retrieval, "selectedGistEntries", "retrieval collects selected context as gist source entries");
test.assertIncludes(retrieval, "rawSections", "retrieval keeps the existing raw context path as fallback material");
test.assertIncludes(retrieval, "buildContextGistPacket(userText", "retrieval builds a gist packet between search and chat payload");
test.assertIncludes(retrieval, "taskKind: options.taskKind || \"project-context\"", "budgeted project context forwards task risk to HD-Gist");
test.assertIncludes(retrieval, "sections.push(gistPacket.text)", "retrieval sends the compressed packet instead of default full raw context");
test.assertIncludes(retrieval, "sections.push(rawContextText)", "retrieval preserves raw fallback when gist is unavailable");
test.assertIncludes(retrieval, "gistPacket.rolesByCitation", "retrieval preserves citation roles for Context Panel diagnostics");
test.assertIncludes(retrieval, "gist: gistPacket.stats", "lastContextBudget includes HD-Gist statistics");
test.assertIncludes(retrieval, "gistFallbackReason", "lastContextBudget exposes raw fallback reason");

test.assertIncludes(chatMessages, "taskKind", "chat payloads classify task risk for gist expansion");
test.assertIncludes(chatMessages, "retrieveContext(userText", "chat payloads still use the central retrieval pipeline");
test.assertIncludes(chatMessages, "taskKind,", "task kind is passed into context retrieval");
test.assertIncludes(chatMessages, "ai_system6_task_kind: taskKind", "downstream model payloads keep task classification metadata");

test.assertIncludes(scrapbook, "function contextGistRoleLabel", "Context Panel labels coarse, revealed, and raw gist roles");
test.assertIncludes(scrapbook, "function contextGistBudgetText", "Context Panel summarizes gist counts and compression ratio");
test.assertIncludes(scrapbook, "lastContextBudget?.gist", "Context Panel reads HD-Gist diagnostics from the budget object");
test.assertIncludes(scrapbook, "contextItem.gistRole", "Context Panel shows which sources were expanded or raw-fallback");

test.assertIncludes(translationsEn, "context_gist_summary", "English diagnostics include HD-Gist summary text");
test.assertIncludes(translationsEn, "context_gist_fallback", "English diagnostics include raw fallback text");
test.assertIncludes(translationsZh, "context_gist_summary", "Chinese diagnostics include HD-Gist summary text");
test.assertIncludes(translationsZh, "context_gist_fallback", "Chinese diagnostics include raw fallback text");

const projectContextSurface = [
  outlineClaim,
  writingFlow,
  mingmingHandoff,
].join("\n\n");
const projectContextCalls = collectFunctionCalls(projectContextSurface, "buildBudgetedProjectContext");
test.assert(projectContextCalls.length >= 9, "project workflow context calls are covered by the HD-Gist architecture test");
test.assert(
  projectContextCalls.every((call) => call.includes("taskKind:")),
  "every project workflow context call classifies task risk for HD-Gist"
);

const appSources = collectAppJsSources();
const rawRagOffenders = appSources
  .filter(({ path }) => path !== "app/core/context-retrieval.js")
  .filter(({ source }) =>
    source.includes("Selected reference excerpts. Use only what these excerpts support")
    || source.includes("Curated context selected or saved by the user")
  )
  .map(({ path }) => path);
test.assert(rawRagOffenders.length === 0, `raw RAG prompt headings stay centralized in context retrieval: ${rawRagOffenders.join(", ") || "none"}`);

const ragPromptOffenders = appSources
  .filter(({ path }) => ![
    "app/core/chat-messages.js",
    "app/core/context-retrieval.js",
    "app/features/file-disk.js",
    "app/features/project-disk.js",
  ].includes(path))
  .filter(({ source }) =>
    source.includes("ragChunks")
    && (source.includes("withMarkdownModelMessages") || source.includes("messages:"))
  )
  .map(({ path }) => path);
test.assert(ragPromptOffenders.length === 0, `new model prompts must not read ragChunks directly: ${ragPromptOffenders.join(", ") || "none"}`);

const sandbox = {
  estimateTokens: (text) => Math.ceil(String(text || "").length / 4),
  contextSourceLabel: (item) => item?.title || "Source",
  getContextSourceKey: (item) => item?.id || item?.title || "",
};
vm.createContext(sandbox);
vm.runInContext(gist, sandbox);

const routineEntries = [
  {
    item: { id: "local-model-notes", title: "Local Model Notes" },
    citationId: "[S1:2]",
    text: "[S1:2] Local model responses feel slow when the prompt includes full scrapbook records. The panel should show progress and the retrieval pipeline should compress routine context before the model call. A detail paragraph mentions qwen3.5-4b-mlx as the constrained route.",
  },
  {
    item: { id: "reader-notes", title: "Reader Notes" },
    citationId: "[S2]",
    text: "[S2] Reader excerpts should keep citations and only expand related evidence when the user asks about a matching entity.",
  },
];
const routinePacket = sandbox.buildContextGistPacket(
  "how can we make local model waiting feel better",
  routineEntries,
  { taskKind: "chat" }
);

test.assert(routinePacket?.text.includes("Hierarchical context gist"), "ordinary chats receive a coarse gist packet first");
test.assert(!routinePacket?.text.includes("Raw excerpt for reconstruction guard"), "ordinary chats do not include raw excerpts by default");
test.assert(routinePacket?.stats?.rawExcerpts === 0, "ordinary chats keep raw excerpt count at zero");
test.assert(routinePacket?.rolesByCitation?.["[S1:2]"] === "revealed", "matching citations are dynamically revealed");
test.assert(routinePacket?.rolesByCitation?.["[S2]"] === "coarse", "unmatched citations stay coarse-only");
test.assert(routinePacket?.text.includes("[S1:2]"), "gist packet preserves passage-level citation ids");

const guardedEntries = Array.from({ length: 5 }, (_, index) => ({
  item: { id: `audit-${index + 1}`, title: `Audit ${index + 1}` },
  citationId: `[S${index + 1}]`,
  text: `[S${index + 1}] Audit source ${index + 1} contains protected value ${9000 + index} and date 2026-06-${10 + index}. This passage is intentionally long enough to become a gist card with a protected number.`,
}));
const guardedRaw = guardedEntries.map((entry) => entry.text).join("\n");
const guardedPacket = sandbox.buildContextGistPacket(
  "fact check the protected values",
  guardedEntries,
  { taskKind: "fact-check", rawContextText: guardedRaw }
);

test.assert(guardedPacket?.usedFallback === true, "high-risk reconstruction failure falls back to raw context");
test.assert(guardedPacket?.text === guardedRaw, "raw fallback restores the existing uncompressed context text");
test.assert(guardedPacket?.stats?.rawExcerpts === guardedEntries.length, "raw fallback reports every source as raw");
test.assert(guardedPacket?.rolesByCitation?.["[S5]"] === "raw", "raw fallback marks protected sources as raw in diagnostics");

test.finish();

function collectFunctionCalls(source, functionName) {
  const calls = [];
  let searchFrom = 0;
  const needle = `${functionName}(`;
  while (searchFrom < source.length) {
    const start = source.indexOf(needle, searchFrom);
    if (start === -1) break;
    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    calls.push(source.slice(start, end));
    searchFrom = Math.max(end, start + needle.length);
  }
  return calls;
}

function collectAppJsSources() {
  const sources = [];
  const appRoot = join(root, "apps", "desktop", "app");
  walk(appRoot);
  return sources;

  function walk(dir) {
    readdirSync(dir).forEach((name) => {
      const fullPath = join(dir, name);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
        return;
      }
      if (!name.endsWith(".js") || name === "app.bundle.js") return;
      sources.push({
        path: relative(root, fullPath).replace(/\\/g, "/").replace(/^apps\/desktop\//, ""),
        source: read(relative(root, fullPath)),
      });
    });
  }
}
