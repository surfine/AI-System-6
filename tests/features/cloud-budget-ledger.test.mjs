// A ledger that has never been written still answers.
//
// The Durable Object that holds the shared allowance reads its state before it
// writes one, and its SQL read asked for exactly one row. On the empty table —
// every new instance's first request — that throws, and the embeddings ledger
// answered 503 the first time the VPS relay asked it for allowance. The read
// takes the first row or nothing now, and this holds the invariant the ledger
// depends on: reserve, settle and summary all work from a state that does not
// exist yet.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import {
  applyReserve,
  applySettle,
  applySummary,
  normalizeState,
  utcDay,
} from "../../workers/cloud-budget/ledger.mjs";

const test = createFeatureTest("cloud-budget-ledger");
const now = new Date("2026-09-17T09:00:00.000Z");
const limits = { sessionRequestLimit: 3, dailyRequestLimit: 5, dailyTokenBudget: 1000 };

const empty = normalizeState(null, utcDay(now));
test.assert(empty.requests === 0 && empty.reserved_tokens === 0, "an unwritten ledger normalizes to an empty day");

const reserved = applyReserve(empty, { sessionId: "session-a", reservedTokens: 40, limits }, now);
test.assert(reserved.result.ok === true, "the first reservation of a fresh ledger is granted");
test.assert(reserved.state.requests === 1, "and is counted");

const settled = applySettle(reserved.state, {
  reservationId: reserved.result.reservationId,
  reservedTokens: 40,
  actualTokens: 25,
  reason: "reported_usage",
}, now);
test.assert(settled.result.ok === true, `settlement is accepted (${settled.result.reason || settled.result.code || ""})`);
test.assert(settled.state.reserved_tokens === 25, "and returns what the reservation did not spend");

const summary = applySummary(settled.state, { sessionId: "session-a", limits }, now);
test.assert(summary.available === true && summary.poolState === "available", "a summary reads without a prior write");
test.assert(summary.remainingSessionRequests === 2, "and reports the ceiling honestly");

// A settled reservation that was never created is the other shape of "no state
// yet": it must answer rather than throw, whatever it answers.
const orphan = applySettle(empty, { reservationId: "missing", reservedTokens: 10 }, now);
test.assert(typeof orphan.result?.ok === "boolean", "settling an unknown reservation answers");

test.finish();
