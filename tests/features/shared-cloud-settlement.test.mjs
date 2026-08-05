// Shared-cloud budget settlement: every route that reserves an estimated
// token allowance reconciles it against the model's real usage afterwards, so
// the daily counter tracks actual consumption instead of worst-case guesses.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("shared-cloud-settlement");
const budget = read("src/server/shared-cloud-budget.js");
const cloudRoute = read("src/server/lib/cloud-route.js");
const cloudChat = read("src/server/routes/cloud-chat.js");
const searchAnswer = read("src/server/routes/search-answer.js");
const subtitles = read("src/server/routes/subtitles-translate.js");
const srt = read("src/server/importers/srt.js");
const draftThesis = read("src/server/routes/draft-thesis.js");
const bureaucracyRoute = read("src/server/routes/bureaucracy-captions.js");
const bureaucracyModule = read("src/server/bureaucracy.js");
const endfieldRoute = read("src/server/routes/endfield-ask.js");
const endfieldModule = read("src/server/endfield.js");
const fetchLib = read("src/server/lib/fetch.js");

test.assertIncludes(budget, "function settleSharedCloudRequest", "the budget module can reconcile reservations against actual usage");
test.assertIncludes(budget, "state.reserved_tokens + delta", "settlement adjusts the shared daily counter");
test.assertIncludes(budget, "Math.max(0, state.reserved_tokens + delta)", "settlement never drives the counter negative");
test.assertIncludes(cloudRoute, "reservation:", "the cloud preflight returns the reservation for settlement");
test.assertIncludes(fetchLib, "options.onData", "the stream proxy exposes upstream chunks for usage capture");
test.assertIncludes(cloudChat, "settleSharedCloudRequest", "cloud chat settles both response shapes");
test.assertIncludes(cloudChat, "streamUsageTokens", "cloud chat captures real usage from the stream");
test.assertIncludes(searchAnswer, "settleSharedCloudRequest", "web-search answers settle their real token usage");
test.assertIncludes(searchAnswer, "result.usage?.total_tokens", "web-search settlement uses the Responses usage total");
test.assertIncludes(subtitles, "options.onUsage", "subtitle translation accumulates usage across batches");
test.assertIncludes(subtitles, "settleSharedCloudRequest", "subtitle translation settles after the whole job");
test.assertIncludes(srt, "options.onUsage", "the subtitle model layer reports per-call usage");
test.assertIncludes(draftThesis, "settleSharedCloudRequest", "draft-thesis settles its cloud call");
test.assertIncludes(draftThesis, "repaired?.data?.usage?.total_tokens", "draft-thesis settles from the model's reported usage");
test.assertIncludes(bureaucracyModule, "reservation: cloud.reservation", "bureaucracy returns its shared reservation");
test.assertIncludes(bureaucracyRoute, "settleSharedCloudRequest", "bureaucracy captions settle real usage");
test.assertIncludes(endfieldModule, "reservation: cloud.reservation", "Endfield returns its shared reservation");
test.assertIncludes(endfieldRoute, "settleSharedCloudRequest", "Endfield ask settles real usage");

test.finish();
