// Writing Agent architecture contracts: one coordinator path, typed tools,
// project/source scope enforcement, proposal-only model effects, and hash-based
// derived retrieval invalidation.

import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-runtime");
const agent = require("../../apps/desktop/app/shared/writing-agent-runtime.js");
const retrieval = require("../../apps/desktop/app/shared/retrieval-runtime.js");

const manifest = read("tooling/runtime-manifest.mjs");
const coordinatorSource = read("app/core/writing-agent-coordinator.js");
const chatMessages = read("app/core/chat-messages.js");
const contextRetrieval = read("app/core/context-retrieval.js");
const packageJson = read("package.json");

test.assertIncludes(manifest, '"app/shared/writing-agent-runtime.js"', "pure Writing Agent contracts load in the app runtime");
test.assertIncludes(manifest, '"app/shared/retrieval-runtime.js"', "pure retrieval contracts load in the app runtime");
test.assertIncludes(manifest, '"app/core/writing-agent-coordinator.js"', "browser coordinator loads in the app runtime");
test.assertIncludes(packageJson, '"test": "npm run verify:features"', "npm test is the single feature-test entry point");

const run = agent.createAgentRun({
  projectId: "project-a",
  sourceScope: { sourceIds: ["source-a"] },
  taskKind: "chat",
  retryOf: "message-1",
}, {
  idFactory: () => "run-1",
  now: () => "2026-07-30T00:00:00.000Z",
});
test.assert(run.state === "preparing", "AgentRun starts in preparing");
test.assert(run.retryOf === "message-1", "AgentRun retains retry lineage");
agent.transitionAgentRun(run, "retrieving", {}, { now: () => "2026-07-30T00:00:01.000Z" });
agent.transitionAgentRun(run, "generating", {}, { now: () => "2026-07-30T00:00:02.000Z" });
agent.transitionAgentRun(run, "awaitingCommit", { output: { hash: "h", chars: 1 } }, { now: () => "2026-07-30T00:00:03.000Z" });
test.assert(run.state === "awaitingCommit", "model output stops at awaitingCommit");
test.assert(!run.endedAt, "awaitingCommit is not falsely recorded as a committed terminal state");

let invalidTransitionRejected = false;
try {
  agent.transitionAgentRun(run, "generating");
} catch {
  invalidTransitionRejected = true;
}
test.assert(invalidTransitionRejected, "invalid AgentRun transitions are rejected");

const registry = agent.createToolRegistry({ maxRounds: 3 });
registry.register({
  name: "readSources",
  description: "Test source reader",
  inputSchema: {
    type: "object",
    required: ["count"],
    properties: { count: { type: "integer", minimum: 1, maximum: 12 } },
    additionalProperties: false,
  },
  outputSchema: {
    type: "array",
    items: {
      type: "object",
      required: ["projectId", "sourceId"],
      properties: {
        projectId: { type: "string" },
        sourceId: { type: "string" },
      },
      additionalProperties: true,
    },
  },
  scope: ["project", "source"],
  effect: "read",
  timeoutMs: 1000,
  maxResults: 12,
  run(context, input) {
    const data = [{ projectId: context.projectId, sourceId: "source-a", count: input.count }];
    return { data, provenance: data };
  },
});
registry.register({
  name: "commitDocument",
  description: "Test commit boundary",
  inputSchema: { type: "object", additionalProperties: false },
  outputSchema: { type: "object", additionalProperties: true },
  scope: ["project", "manuscript"],
  effect: "commit",
  timeoutMs: 1000,
  maxResults: 1,
  run() {
    return { data: { committed: true } };
  },
});
registry.register({
  name: "escapeProject",
  description: "Test provenance rejection",
  inputSchema: { type: "object", additionalProperties: false },
  outputSchema: { type: "array", items: { type: "object", additionalProperties: true } },
  scope: ["project", "source"],
  effect: "read",
  timeoutMs: 1000,
  maxResults: 1,
  run() {
    const data = [{ projectId: "project-b", sourceId: "source-b" }];
    return { data, provenance: data };
  },
});

const numericResult = await registry.invoke("readSources", {
  projectId: "project-a",
  sourceScope: { sourceIds: ["source-a"] },
  allowedEffects: ["read", "proposal"],
}, { count: 5 });
test.assert(numericResult.ok && numericResult.data[0].count === 5, "integer tool input survives typed validation");

const stringNumberResult = await registry.invoke("readSources", {
  projectId: "project-a",
  sourceScope: { sourceIds: ["source-a"] },
  allowedEffects: ["read", "proposal"],
}, { count: "5" });
test.assert(!stringNumberResult.ok && /integer/.test(stringNumberResult.error), "numeric strings are rejected instead of silently defaulted");

const commitResult = await registry.invoke("commitDocument", {
  projectId: "project-a",
  invokedBy: "model",
  allowedEffects: ["read", "proposal", "commit"],
  userConfirmed: true,
  commitToken: "one-use",
}, {});
test.assert(!commitResult.ok && /Models cannot invoke commit tools/.test(commitResult.error), "models cannot invoke commit tools even when commit metadata is forged");

const escapedResult = await registry.invoke("escapeProject", {
  projectId: "project-a",
  sourceScope: { sourceIds: ["source-a"] },
  allowedEffects: ["read"],
}, {});
test.assert(!escapedResult.ok && /escaped the active project/.test(escapedResult.error), "cross-project tool provenance is rejected");

const providerDefinitions = agent.providerToolDefinitions(registry.list(), ["read", "proposal", "commit"]);
test.assert(
  providerDefinitions.some((tool) => tool.function.name === "readSources"),
  "read tools are exposed in provider-native function format"
);
test.assert(
  !providerDefinitions.some((tool) => tool.function.name === "commitDocument"),
  "commit tools are never exposed to the model provider"
);

const normalizedProviderCalls = agent.normalizeProviderToolCalls({
  tool_calls: [{
    id: "call-1",
    function: { name: "readSources", arguments: '{"count":5}' },
  }],
});
test.assert(
  normalizedProviderCalls[0].input.count === 5 && Number.isInteger(normalizedProviderCalls[0].input.count),
  "provider JSON tool arguments preserve integer types"
);
const malformedProviderCalls = agent.normalizeProviderToolCalls({
  tool_calls: [{
    id: "call-bad",
    function: { name: "readSources", arguments: '{"count":' },
  }],
});
test.assert(
  /not valid JSON/.test(malformedProviderCalls[0].argumentError),
  "malformed provider tool arguments become a controlled tool error"
);

const toolLoopSteps = [];
const boundedLoop = await registry.runToolLoop({
  maxRounds: 3,
  context: {
    projectId: "project-a",
    sourceScope: { sourceIds: ["source-a"] },
    allowedEffects: ["read", "proposal"],
  },
  async next({ round, toolsDisabled }) {
    toolLoopSteps.push({ round, toolsDisabled: toolsDisabled === true });
    if (toolsDisabled) return { done: true, output: "Final synthesis" };
    return {
      calls: [{
        id: `loop-${round}`,
        name: "readSources",
        input: { count: round },
      }],
      output: `Round ${round}`,
    };
  },
});
test.assert(boundedLoop.toolCalls.length === 3, "a model can invoke at most three tool rounds");
test.assert(boundedLoop.output === "Final synthesis", "the bounded loop performs one final synthesis after tool rounds");
test.assert(
  toolLoopSteps.at(-1)?.toolsDisabled === true && toolLoopSteps.at(-1)?.round === 4,
  "the synthesis request disables tools instead of allowing a fourth tool round"
);

let preflightCalls = 0;
const successfulCoordinator = agent.createWritingAgentCoordinator({
  idFactory: () => `coordinator-${preflightCalls + 1}`,
  now: () => "2026-07-30T00:00:00.000Z",
  preflight() {
    preflightCalls += 1;
    return { allowedEffects: ["read", "proposal"] };
  },
  retrieve(input) {
    return {
      evidence: [{
        projectId: input.projectId,
        sourceId: "source-a",
        chunkId: "source-a:1",
        text: "Evidence",
      }],
    };
  },
  generate() {
    return { output: "Temporary proposal" };
  },
});
const firstRun = await successfulCoordinator.run({ projectId: "project-a", taskKind: "chat" });
const retryRun = await successfulCoordinator.run({ projectId: "project-a", taskKind: "chat", retryOf: "message-1" });
test.assert(preflightCalls === 2, "first send and retry both pass through the same preflight");
test.assert(firstRun.run.state === "awaitingCommit" && retryRun.run.state === "awaitingCommit", "first send and retry share the proposal-only lifecycle");

const abortController = new AbortController();
abortController.abort();
let abortedRun = null;
try {
  await successfulCoordinator.run({ projectId: "project-a", signal: abortController.signal });
} catch (error) {
  abortedRun = error.agentRun;
}
test.assert(abortedRun?.state === "aborted", "abort produces an aborted AgentRun");
test.assert(abortedRun?.state !== "committed", "abort never produces a commit");

test.assert(retrieval.cosineSimilarity([1, 0], [1, 0]) === 1, "cosine similarity handles valid vectors");
test.assert(retrieval.cosineSimilarity([], []) === 0, "cosine similarity rejects empty vectors safely");
test.assert(retrieval.cosineSimilarity([1], [1, 2]) === 0, "cosine similarity rejects mismatched vector lengths");
test.assert(retrieval.cosineSimilarity([0, 0], [1, 2]) === 0, "cosine similarity rejects zero-norm vectors safely");
test.assert(retrieval.cosineSimilarity([1, Number.NaN], [1, 2]) === 0, "cosine similarity rejects non-finite values safely");

const cacheBase = {
  projectId: "project-a",
  chunks: [{ id: "source-a:1", sourceId: "source-a", content: "alpha", embedding: [1, 0] }],
  embeddingProvider: "local",
  embeddingModel: "embed-a",
};
const cacheKeyA = retrieval.buildRetrievalCacheVersion(cacheBase);
const cacheKeyContent = retrieval.buildRetrievalCacheVersion({
  ...cacheBase,
  chunks: [{ ...cacheBase.chunks[0], content: "beta" }],
});
const cacheKeyModel = retrieval.buildRetrievalCacheVersion({ ...cacheBase, embeddingModel: "embed-b" });
test.assert(cacheKeyA !== cacheKeyContent, "source content changes invalidate retrieval cache keys");
test.assert(cacheKeyA !== cacheKeyModel, "embedding model changes invalidate retrieval cache keys");
test.assertIncludes(contextRetrieval, "buildRetrievalCacheVersion", "semantic rank cache uses the versioned retrieval contract");
test.assertNotIncludes(contextRetrieval, "chunk.updatedAt ||", "semantic rank cache no longer relies on updatedAt alone");

test.assertMatches(
  chatMessages,
  /async function sendToLmStudio\(userText, signal, options = \{\}\) \{\s*return runWritingTask\(/,
  "all legacy sendToLmStudio callers enter the Writing Agent coordinator"
);
test.assertIncludes(chatMessages, "retryOf: record.id", "explicit retries retain source-message lineage");
test.assertIncludes(chatMessages, "agentRun: window.lastWritingAgentRun", "preflight and failed runs enter the durable run manifest");
test.assertIncludes(coordinatorSource, 'const effect = "proposal";', "browser preflight fixes model output to proposal effect");
test.assertIncludes(coordinatorSource, 'allowedEffects: ["read", "proposal"]', "browser coordinator never grants model commit capability");
test.assertIncludes(coordinatorSource, "writingAgentEvidenceSnapshot", "coordinator records a normalized evidence packet");
test.assertIncludes(coordinatorSource, "runToolLoop", "browser generation executes provider tool calls through the bounded registry");
test.assertIncludes(coordinatorSource, 'tool_choice: "auto"', "interactive writing tasks expose provider-native tools");
// A tool loop used to force complete JSON messages, so the one route a mounted
// project actually takes never streamed: the writer waited in silence, and the
// Stop button had nothing to keep. Every round streams when someone is watching.
test.assertIncludes(coordinatorSource, 'streamPreference: onToken ? "stream" : "json"', "tool-call turns stream whenever a token listener is watching");
test.assertIncludes(coordinatorSource, "const combinedText = streamedPrefix + roundText;", "later rounds continue the reply instead of erasing the earlier rounds");
test.assertIncludes(coordinatorSource, "listener(streamedPrefix + String(snapshot || \"\"))", "each round's snapshots are reported on top of what already streamed");
test.assertIncludes(
  coordinatorSource,
  'error.partialContent = (streamedPrefix + roundPartial).replace(/\\s+$/, "");',
  "stopping mid-loop keeps every round the writer already read, not just the last one"
);
for (const toolName of [
  "searchProjectSources",
  "readCitation",
  "readSourceDocMap",
  "readProjectScrap",
  "readDraftStructure",
  "checkExistingCitation",
  "readProjectTerms",
  "proposeManuscriptPatch",
]) {
  test.assertIncludes(coordinatorSource, `name: "${toolName}"`, `${toolName} is registered as a typed writing tool`);
}
test.assertIncludes(chatMessages, "assistant content or tool calls", "JSON model routing accepts content-free provider tool calls");

// The loop stops at three rounds. When it stops with more it wanted to read,
// the answer is shorter than the question deserved, and the run used to compute
// that fact and drop it — so a truncated answer arrived looking complete.
test.assertIncludes(coordinatorSource, "window.lastWritingAgentGenerated = result.generated", "a finished run keeps what the tool loop did where the reply renderer can read it");
test.assertIncludes(chatMessages, "window.lastWritingAgentGenerated?.toolLoopTruncated === true", "a capped tool loop reaches the reply instead of being computed and discarded");
test.assertIncludes(chatMessages, 'missing.push(t("clio_grounding_reading_capped"))', "truncation is stated in the basis line's existing missing slot, not in furniture of its own");

// The eighth tool proposes and never applies. That is the product rule, but the
// proposal also has to reach the writer, or the model can only describe an edit
// it already worked out.
test.assertIncludes(coordinatorSource, "input.options?.onToolActivity?.(calls)", "the loop reports which tool is about to run so a surface can say so");

// The live activity line is gone once the answer lands, so the finished turn
// keeps its own record of what the run opened. Without it the reply reads as
// the model's own words even after several tools ran, which is the System
// Integrity rule stood on its head.
test.assertIncludes(chatMessages, "function clioTalkReadingTrace()", "a finished run keeps a record of what it opened");
test.assertIncludes(chatMessages, "reading: clioTalkReadingTrace()", "the reading record rides the saved reply, so it survives a reload");
test.assertIncludes(chatMessages, "function appendClioTalkReadingTrace(", "the finished turn renders what the run opened");
test.assertMatches(
  chatMessages,
  /function clioTalkReadingTrace\(\)[\s\S]*?\.filter\(\(call\) => clioTalkToolActivityKeys\[String\(call\?\.name \|\| ""\)\]\)/,
  "only tools this desk can name reach the turn; an unknown identifier is left out rather than leaked",
);
test.assertMatches(
  chatMessages,
  /function appendClioTalkReadingTrace\([\s\S]*?const reading = Array\.isArray\(record\?\.reading\) \? record\.reading : \[\];[\s\S]*?if \(!reading\.length\) return;/,
  "no reading, no claim: an empty run states nothing rather than inventing a step count",
);
test.assertMatches(
  chatMessages,
  /list\.className = "message-reading-list";[\s\S]*?list\.hidden = true;/,
  "the record is a disclosure, closed until asked for, so a quiet desk stays quiet",
);
test.assertMatches(
  chatMessages,
  /summary\.setAttribute\("aria-expanded", "false"\);\s*\n\s*summary\.setAttribute\("aria-controls", list\.id\);/,
  "the disclosure states its own collapsed state and what it controls",
);
test.assertIncludes(chatMessages, "function clioTalkProposedManuscriptPatch()", "a proposed manuscript patch is lifted out of the finished run");
test.assertIncludes(chatMessages, 'data.kind !== "manuscript-patch"', "only a real manuscript patch is carried, not any tool result");
test.assertIncludes(chatMessages, "manuscriptPatch: clioTalkProposedManuscriptPatch()", "the proposal rides the reply, so an older turn still has it on the table");
test.assertIncludes(chatMessages, 'mode === "replace-proposal" && patch', "taking a proposal writes the sentence it named, not the reply that explained it");
test.assertIncludes(chatMessages, "function clioTalkPatchFitsTarget(", "a proposal whose sentence is gone from the destination cannot be taken");

test.finish();
