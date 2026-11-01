// Unified Spec (2026-10-10) contract tests: the vendored reference rules for
// display tickets, mount gates, lifecycle lanes, passage resolution, context
// budgets, compaction CAS, and cache-fork safety — the pure-policy half of
// P1 (W01–W05). These run the REAL vendored module, not a copy.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import {
  makeTicket, contentStillBelongs, mayPresent, mayCommit,
  createMountGate, createLifecycleLane,
  resolvePassage, selectReadableBlocks, validateCitations,
  orderedMessages, validateClosedTools,
  contextBudget, coveredDigest, validatePins, memoryEnvelope, validateSummary,
  comparePreparedPrefixes, canForkSafely, normalizeUsage,
  compactionStillCurrent, createMemoryCAS,
} from "../../apps/desktop/app/vendor/unified-spec/contracts.mjs";

const test = createFeatureTest("unified-spec-contracts");

const scope = { projectId: "p1", objectId: "doc1", sourceRevision: "r1", contextEpoch: 1, leaseEpoch: 1 };

test.assert(typeof makeTicket === "function", "the vendored unified-spec contracts install");

// --- W03: display tickets (late requests don't override later operations) ---
const ticket = makeTicket(scope, 1);
const sameScope = makeTicket(scope, 1);
const newerEpoch = makeTicket(scope, 2);
const differentProject = makeTicket({ ...scope, projectId: "p2" }, 1);

test.assert(mayPresent(ticket, sameScope), "a ticket may present when scope and epoch match");
test.assert(!mayPresent(ticket, newerEpoch), "a stale epoch cannot steal focus");
test.assert(!contentStillBelongs(ticket, differentProject), "a different project's result is refused");
test.assert(mayCommit(ticket, sameScope), "a matching lease may commit");
test.assert(!mayCommit(ticket, makeTicket({ ...scope, leaseEpoch: 2 }, 1)), "a stale lease cannot commit");

// --- W02: mount gate (initialization shared; open intents independent) ---
const gate = createMountGate();
let initCount = 0;
const init = () => { initCount += 1; return { windows: [] }; };
const a1 = gate.mount("app-a", init);
const a2 = gate.mount("app-a", init);
test.assert(a1 === a2, "the same application's concurrent mounts share one initialization");
await a1;
test.assert(initCount === 1, "initialization runs exactly once per application instance");
test.assert(gate.isMounted("app-a"), "the mount gate remembers the mounted instance");
const b = gate.mount("app-b", init);
test.assert(b !== a1, "a different application mounts independently");

// Mount failure propagates; the gate does not cache failures.
let failCount = 0;
const failInit = () => { failCount += 1; return { ok: false, reason: "test" }; };
let failure = null;
try { await gate.mount("app-f", failInit); } catch (e) { failure = e; }
test.assert(!!failure && failure.message === "mount-failed", "a mount failure rejects (never caches as ready)");
const retry = gate.mount("app-f", () => ({ ok: true }));
test.assert((await retry).ok === true, "a failed mount can retry on the next intent");

// --- W05: lifecycle lane (per-instance serialized state transitions) ---
let transitions = [];
const lane = createLifecycleLane({
  suspend: () => { transitions.push("suspend"); },
  resume: () => { transitions.push("resume"); },
  dispose: () => { transitions.push("dispose"); },
}, "active");
test.assert(lane.snapshot().actual === "active", "the lane starts active");
await lane.setDesired("suspended");
test.assert(lane.snapshot().actual === "suspended", "suspend converges");
await lane.setDesired("active");
test.assert(lane.snapshot().actual === "active", "resume converges");
await lane.setDesired("disposed");
test.assert(lane.snapshot().closed === true, "dispose closes the instance");
let retired = null;
try { await lane.setDesired("active"); } catch (e) { retired = e; }
test.assert(!!retired, "a retired instance cannot come back");

// --- R03/R04: passage resolution ---
const snapshot = { id: "src1", revision: "r1", text: "The bridge opened. Traffic followed. The bridge changed everything." };
const found = resolvePassage(snapshot, { sourceId: "src1", revision: "r1", quote: "Traffic followed.", prefix: "The bridge opened. ", suffix: " The bridge" });
test.assert(found.status === "found" && found.start > 0, "a unique quote with context resolves found");
const wrongSource = resolvePassage(snapshot, { sourceId: "src2", revision: "r1", quote: "Traffic" });
test.assert(wrongSource.status === "wrong-source", "a different source is refused before matching");
const stale = resolvePassage(snapshot, { sourceId: "src1", revision: "r2", quote: "Traffic" });
test.assert(stale.status === "stale", "a stale revision is refused");
const lost = resolvePassage(snapshot, { sourceId: "src1", revision: "r1", quote: "not present" });
test.assert(lost.status === "lost", "a missing quote is lost, never guessed");

// --- R08: read boundary ---
const blocks = [{ order: 1, id: "b1" }, { order: 2, id: "b2" }, { order: 3, id: "b3" }];
const visible = selectReadableBlocks(blocks, 2);
test.assert(visible.length === 2 && visible[1].id === "b2", "the read boundary filters blocks by order");

// --- Citation validation ---
const allowed = [{ id: "e1" }, { id: "e2" }];
test.assert(validateCitations(["e1"], allowed).ok, "a known citation passes");
test.assert(!validateCitations(["e1", "e9"], allowed).ok, "an unknown citation is rejected");
test.assert(!validateCitations([], allowed).ok, "no citations at all is not a valid answer");

// --- C01: message ordering and tool closure ---
const msgs = [
  { id: "m1", role: "user", content: "hi" },
  { id: "m2", role: "assistant", content: "hello", tool_calls: [{ id: "t1", function: { name: "f" } }] },
  { id: "m3", role: "tool", content: "result", tool_call_id: "t1" },
];
test.assert(orderedMessages(msgs).length === 3, "messages with distinct IDs order correctly");
let dupError = null;
try { orderedMessages([...msgs, { ...msgs[0] }]); } catch (e) { dupError = e; }
test.assert(!!dupError && dupError.message.includes("duplicate"), "duplicate message IDs are rejected");
test.assert(validateClosedTools(msgs).ok, "a closed tool group validates");
test.assert(!validateClosedTools(msgs.slice(0, 2)).ok, "an open tool group is rejected");

// --- C03: context budget ---
const budget = contextBudget({ window: 8192, inputLimit: 8192, reply: 1024, summary: 1024, directive: 256, safety: 512, growth: 512, input: 6000 });
test.assert(budget.trigger === 5888, `the 8K test fixture trigger is 5888 (${budget.trigger})`);
test.assert(budget.needsCompaction, "6000 input tokens triggers compaction");
const fits = contextBudget({ ...budget_defaults(), input: 5000 });
function budget_defaults() { return { window: 8192, inputLimit: 8192, reply: 1024, summary: 1024, directive: 256, safety: 512, growth: 512 }; }
test.assert(!fits.needsCompaction && fits.fitsNormal, "5000 tokens fits without compaction");

// --- C02: covered digest + pins ---
const digest = await coveredDigest(msgs);
test.assert(/^[0-9a-f]{64}$/.test(digest), "the covered digest is a SHA-256 hex");
test.assert(validatePins([{ messageId: "m1", text: "hi" }], msgs), "a pin that matches the original message validates");
test.assert(!validatePins([{ messageId: "m1", text: "not there" }], msgs), "a pin that does not appear in its message is rejected");

// --- C05: memory envelope ---
const envelope = memoryEnvelope({ throughMessageId: "m3", text: "summary", pins: [], sourceRefs: [] });
test.assert(envelope.role === "user", "the compaction envelope is a user message, not system");
test.assert(JSON.parse(envelope.content).kind === "historical_context_data", "the envelope carries the historical context kind");

// --- C04: fork safety and prepared prefixes ---
test.assert(!canForkSafely({ singleGeneration: true, toolsNeverExecute: false, serverHostedTools: false, replaySupported: true }, { forcedTool: false, formatCompatible: true }), "hosted tool execution blocks a fork");
const prefixMatch = comparePreparedPrefixes(
  { providerScope: "x", model: "m", toolsBytes: "t", systemBytes: "s", historyPrefixBytes: "h", thinkingBytes: "" },
  { providerScope: "x", model: "m", toolsBytes: "t", systemBytes: "s", historyPrefixBytes: "h", thinkingBytes: "" },
);
test.assert(prefixMatch.ok, "identical prepared prefixes compare equal");
const prefixDiff = comparePreparedPrefixes(
  { providerScope: "x", model: "m", toolsBytes: "t", systemBytes: "s", historyPrefixBytes: "h1", thinkingBytes: "" },
  { providerScope: "x", model: "m", toolsBytes: "t", systemBytes: "s", historyPrefixBytes: "h2", thinkingBytes: "" },
);
test.assert(!prefixDiff.ok && prefixDiff.changed.includes("historyPrefixBytes"), "a changed history prefix blocks the fork");

// --- C06: usage normalization ---
const ds = normalizeUsage("deepseek", { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 40, cache_write_tokens: 10 });
test.assert(ds.input === 100 && ds.output === 50 && ds.cacheRead === 40 && ds.cacheWrite === 10, "DeepSeek usage maps correctly");
const unknown = normalizeUsage("deepseek", {});
test.assert(!unknown.reported, "missing usage fields report as unknown, not zero");

// --- C07: compaction CAS ---
const cas = createMemoryCAS({ revision: 1, data: "original" });
const committed = cas.commit(1, { data: "updated" });
test.assert(committed.ok && committed.value.revision === 2, "a matching revision commits");
const conflict = cas.commit(1, { data: "stale" });
test.assert(!conflict.ok && conflict.reason === "conflict", "a stale revision conflicts");

test.finish();
