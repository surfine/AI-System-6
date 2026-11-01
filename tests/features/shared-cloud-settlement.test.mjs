// Shared-cloud budget settlement: every route that reserves an estimated
// token allowance reconciles it against the model's real usage afterwards, so
// the daily counter tracks actual consumption instead of worst-case guesses.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("shared-cloud-settlement");
const budget = read("apps/server/server/shared-cloud-budget.js");
const cloudRoute = read("apps/server/server/lib/cloud-route.js");
const cloudChat = read("apps/server/server/routes/cloud-chat.js");
const searchAnswer = read("apps/server/server/routes/search-answer.js");
const subtitles = read("apps/server/server/routes/subtitles-translate.js");
const srt = read("apps/server/server/importers/srt.js");
const draftThesis = read("apps/server/server/routes/draft-thesis.js");
const bureaucracyRoute = read("apps/server/server/routes/bureaucracy-captions.js");
const bureaucracyModule = read("apps/server/server/bureaucracy.js");
const endfieldRoute = read("apps/server/server/routes/endfield-ask.js");
const endfieldModule = read("apps/server/server/endfield.js");
const fetchLib = read("apps/server/server/lib/fetch.js");
const require = createRequire(import.meta.url);
const budgetModule = require("../../apps/server/server/shared-cloud-budget.js");
const fetchModule = require("../../apps/server/server/lib/fetch.js");

test.assertIncludes(budget, "function settleSharedCloudRequest", "the budget module can reconcile reservations against actual usage");
test.assertIncludes(budget, "state.reserved_tokens + delta", "settlement adjusts the shared daily counter");
test.assertIncludes(budget, "Math.max(0, state.reserved_tokens + delta)", "settlement never drives the counter negative");
test.assertIncludes(cloudRoute, "reservation:", "the cloud preflight returns the reservation for settlement");
test.assertIncludes(fetchLib, "options.onData", "the stream proxy exposes upstream chunks for usage capture");
test.assertIncludes(cloudChat, "sharedReservation?.settle()", "cloud chat has one finally settlement path");
test.assertIncludes(cloudChat, "createSseJsonParser", "cloud chat parses usage across network chunk boundaries");
test.assertIncludes(cloudChat, "include_usage: true", "cloud chat explicitly asks the provider for stream usage");
test.assertIncludes(cloudChat, "onBeforeEnd:", "stream usage settles before the browser receives the final response event");
test.assertIncludes(cloudChat, "repairReservation?.settle()", "each Humanizer repair owns its own settlement");
test.assertIncludes(cloudChat, "totalUsageTokens += repairUsage", "Humanizer usage accumulates every repair response");
test.assertIncludes(searchAnswer, "sharedReservation?.addUsage", "web-search answers add reported usage");
test.assertIncludes(searchAnswer, "sharedReservation?.settle()", "web-search answers settle in finally");
test.assertIncludes(subtitles, "options.beforeCloudCall", "subtitle translation installs a per-batch reservation factory");
test.assertIncludes(srt, "options.beforeCloudCall?.(payload)", "each subtitle model call reserves separately");
test.assertIncludes(srt, "settleReservation()", "each subtitle model call settles separately");
test.assertIncludes(draftThesis, "sharedReservation?.settle()", "draft-thesis settles its cloud call in finally");
test.assertIncludes(draftThesis, "sharedReservation?.addUsage", "draft-thesis adds reported model usage");
test.assertIncludes(bureaucracyModule, "reservation: cloud.reservation", "bureaucracy returns its shared reservation");
test.assertIncludes(bureaucracyRoute, "sharedReservation?.settle()", "bureaucracy captions settle in finally");
test.assertIncludes(endfieldModule, "reservation: cloud.reservation", "Endfield returns its shared reservation");
test.assertIncludes(endfieldRoute, "sharedReservation?.settle()", "Endfield ask settles in finally");

const parsedEvents = [];
const parser = fetchModule.createSseJsonParser((event) => parsedEvents.push(event));
const sse = 'data: {"usage":{"total_tokens":37}}\n\n';
parser.push(Buffer.from(sse.slice(0, 9)));
parser.push(Buffer.from(sse.slice(9, 24)));
parser.push(Buffer.from(sse.slice(24)));
parser.end();
test.assert(
  parsedEvents.length === 1 && parsedEvents[0].usage.total_tokens === 37,
  "SSE usage JSON survives two network chunk boundaries"
);

const stateDirectory = mkdtempSync(join(tmpdir(), "ai-system6-settlement-"));
const previousStateDirectory = process.env.AI_SYSTEM6_STATE_DIR;
const previousDailyLimit = process.env.AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT;
const previousSessionLimit = process.env.AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT;
try {
  process.env.AI_SYSTEM6_STATE_DIR = stateDirectory;
  process.env.AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT = "20";
  process.env.AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT = "20";
  budgetModule.resetSharedCloudBudgetCacheForTests();
  const payload = { model: "test", messages: [{ role: "user", content: "usage" }], max_tokens: 100 };

  const actual = budgetModule.reserveSharedCloudRequest({ sessionNonce: "settlement-actual", payload });
  actual.markUpstreamStarted();
  actual.addUsage({ total_tokens: 41 });
  const firstSettle = actual.settle();
  const duplicateSettle = actual.settle();
  test.assert(
    firstSettle.ok && !firstSettle.duplicate && duplicateSettle.duplicate,
    "a reservation settles at most once"
  );

  const unknown = budgetModule.reserveSharedCloudRequest({ sessionNonce: "settlement-unknown", payload });
  unknown.markUpstreamStarted();
  const unknownResult = unknown.settle();
  test.assert(
    unknownResult.reason === "usage_unknown_reservation_retained" && unknownResult.delta === 0,
    "missing upstream usage retains the conservative reservation"
  );

  const beforeSend = budgetModule.reserveSharedCloudRequest({ sessionNonce: "settlement-before-send", payload });
  const beforeSendResult = beforeSend.settle();
  test.assert(
    beforeSendResult.reason === "upstream_not_sent" && beforeSendResult.delta === -beforeSend.reservedTokens,
    "a failure before request bytes are sent releases token reservation while preserving request-count policy"
  );

  const persisted = JSON.parse(readFileSync(join(stateDirectory, "shared-cloud-budget.json"), "utf8"));
  test.assert(persisted.requests === 3, "pre-send failure still consumes one request under the existing product rule");
  test.assert(persisted.reserved_tokens >= 0, "settlement cannot make the persisted daily token count negative");

  const tamperProof = budgetModule.reserveSharedCloudRequest({ sessionNonce: "settlement-tamper-proof", payload });
  const tamperResult = budgetModule.settleSharedCloudRequest({
    reservationId: tamperProof.reservationId,
    reservedTokens: 1,
    actualTokens: 19,
  });
  test.assert(
    tamperResult.delta === 19 - tamperProof.reservedTokens,
    "settlement trusts the persisted reservation instead of caller-supplied token counts"
  );

  const beforeMidnight = new Date("2026-08-13T23:59:59.000Z");
  const afterMidnight = new Date("2026-08-14T00:00:01.000Z");
  const expiring = budgetModule.reserveSharedCloudRequest({
    sessionNonce: "settlement-midnight",
    payload,
    now: beforeMidnight,
  });
  const nextDay = budgetModule.reserveSharedCloudRequest({
    sessionNonce: "settlement-next-day",
    payload,
    now: afterMidnight,
  });
  const nextDayBefore = JSON.parse(readFileSync(join(stateDirectory, "shared-cloud-budget.json"), "utf8"));
  const expiredResult = budgetModule.settleSharedCloudRequest({
    reservationId: expiring.reservationId,
    reservedTokens: expiring.reservedTokens,
    actualTokens: 1,
    now: afterMidnight,
  });
  const nextDayAfter = JSON.parse(readFileSync(join(stateDirectory, "shared-cloud-budget.json"), "utf8"));
  test.assert(
    expiredResult.ignored === true
      && nextDayAfter.day === "2026-08-14"
      && nextDayAfter.reserved_tokens === nextDayBefore.reserved_tokens
      && nextDayAfter.reservations[nextDay.reservationId],
    "a late settlement cannot corrupt the next UTC day's allowance"
  );
} finally {
  if (previousStateDirectory === undefined) delete process.env.AI_SYSTEM6_STATE_DIR;
  else process.env.AI_SYSTEM6_STATE_DIR = previousStateDirectory;
  if (previousDailyLimit === undefined) delete process.env.AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT;
  else process.env.AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT = previousDailyLimit;
  if (previousSessionLimit === undefined) delete process.env.AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT;
  else process.env.AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT = previousSessionLimit;
  budgetModule.resetSharedCloudBudgetCacheForTests();
  rmSync(stateDirectory, { recursive: true, force: true });
}

test.finish();
