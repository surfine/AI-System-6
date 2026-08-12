// Searcher's DeepSeek provider: one server-side Responses API web_search call
// returns a cited answer plus the search results. The answer is model output
// and stays temporary; sources keep flowing through Reader, so snippets are
// never treated as evidence.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("web-search-answer");
const findPath = read("app/features/findpath.js");
const wireup = read("app/core/wireup.js");
const index = read("index.html");
const router = read("apps/server/server/router.js");
const webSearch = read("apps/server/server/web-search.js");
const searchAnswerRoute = read("apps/server/server/routes/search-answer.js");
const persistence = read("app/core/persistence-status.js");
const outlineClaim = read("app/features/outline-claim.js");
const selectionServices = read("app/features/selection-services.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const chatMessages = read("app/core/chat-messages.js");
const modelStream = read("app/core/model-stream.js");
const cloudChat = read("apps/server/server/routes/cloud-chat.js");
const windowsCss = read("styles/10-windows.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(
  index,
  '<option value="deepseek" data-i18n="search_deepseek">DeepSeek</option>',
  "Chooser offers the DeepSeek search provider"
);
test.assertIncludes(findPath, 't("search_deepseek")', "Searcher labels the DeepSeek provider");
test.assertIncludes(findPath, 'fetch("/api/search/answer"', "Searcher calls the server-side online-answer route");
test.assertIncludes(findPath, "cloudCredentialTransportFields()", "Searcher forwards BYOK or shared-cloud transport fields");
test.assertIncludes(findPath, 't("search_answer_note")', "Searcher warns that online answers are model output, not evidence");
test.assertIncludes(findPath, "function webSearchCitationsToResults", "DeepSeek citations become the actionable results list");
test.assertIncludes(findPath, 't("search_answer_no_sources")', "a citation-free answer gets a tailored notice instead of an empty list");
test.assertIncludes(findPath, 't("search_source_count", findPathResults.length)', "DeepSeek mode counts sources instead of results");
test.assertIncludes(wireup, 'searchProviderInput?.value === "deepseek"', "the Searcher submit flow branches into the DeepSeek provider");
test.assertIncludes(webSearch, 'tool_choice: { type: "web_search" }', "the Responses payload forces a server-side web search");
test.assertIncludes(webSearch, '"url_citation"', "cited sources are parsed from output_text annotations");
test.assertIncludes(webSearch, '"web_search_call"', "search results are parsed from web_search_call items");
test.assertIncludes(webSearch, "deepseek-v4-flash", "the Responses client pins the currently supported model");
test.assertIncludes(webSearch, "function extractInlineCitations", "citations are extracted from inline markdown links");
test.assertIncludes(webSearch, "function callWebSearchAnswerStream", "the Responses client can stream web-search answers");
test.assertIncludes(webSearch, "searchCalls = []", "the payload builder accepts replayed web_search_call items");
test.assertIncludes(webSearch, "stream", "the payload builder can enable streaming");
test.assertIncludes(webSearch, 'WEB_SEARCH_MODES = new Set(["answer", "claim", "clio"])', "the web-search client whitelists answer, claim, and clio modes");
test.assertIncludes(webSearch, "事实核验助手", "claim mode carries a verification instruction");
test.assertIncludes(webSearch, "ClioTalk 的联网回答助手", "clio mode carries a calm writing-companion instruction");
test.assertIncludes(webSearch, 'type: "json_schema"', "claim mode requests schema-enforced structured output");
test.assertIncludes(webSearch, 'name: "claim_verdict"', "the claim verdict schema is named");
test.assertIncludes(webSearch, "evidence_insufficient", "the verdict schema enumerates the conclusion values");
test.assertIncludes(searchAnswerRoute, "preparePublicCloudCall", "the route goes through the BYOK/shared-cloud preflight");
test.assertIncludes(searchAnswerRoute, "Unsupported search mode", "the route rejects unknown search modes");
test.assertIncludes(searchAnswerRoute, "verdict: result.verdict || null", "the route returns the structured verdict envelope");
test.assertIncludes(searchAnswerRoute, "body.stream === true", "the route offers a streaming response");
test.assertIncludes(searchAnswerRoute, "X-Accel-Buffering", "the stream disables Nginx buffering for the VPS");
test.assertIncludes(searchAnswerRoute, "search_calls", "the route forwards replayed web_search_call items");
test.assertIncludes(router, '["POST /api/search/answer", handleSearchAnswer]', "the online-answer route is registered locally");
test.assertIncludes(router, '"POST /api/search/answer",\n', "the online-answer route is registered for the public deployment");
test.assertIncludes(persistence, '"auto", "duckduckgo", "bing", "deepseek"', "the persisted Searcher provider allowlist includes DeepSeek");
test.assertIncludes(findPath, 'mode: "answer"', "Searcher requests the plain answer mode explicitly");
test.assertIncludes(findPath, "stream: true", "Searcher streams the online answer");
test.assertIncludes(findPath, "readWebSearchStream", "Searcher reads the server-side web-search stream");
test.assertNotIncludes(findPath, 'effort: "low"', "Searcher does not choose reasoning effort");
test.assertIncludes(outlineClaim, 'fetch("/api/search/answer"', "Review Desk online claim check calls the same server route");
test.assertIncludes(outlineClaim, 'mode: "claim"', "Review Desk requests the claim verification mode");
test.assertNotIncludes(outlineClaim, 'effort: "low"', "Review Desk does not choose reasoning effort");
test.assertIncludes(outlineClaim, "onlineClaimVerdictFromEnum", "the browser maps the schema verdict enum to localized labels");
test.assertIncludes(outlineClaim, "data?.verdict?.conclusion", "the browser prefers the structured verdict over free-text parsing");
test.assertIncludes(outlineClaim, 't("claim_check_online_note")', "online claim cards carry the verify-in-Reader disclaimer");
test.assertIncludes(outlineClaim, "openOnlineCitationInReader", "online claim citations open the source in Reader");
test.assertIncludes(selectionServices, "function runReaderFindSources", "Reader hands its source query to Searcher");
test.assertIncludes(chatMessages, "mode: \"clio\"", "ClioTalk requests the companion web-search mode");
test.assertIncludes(chatMessages, "search_calls: lastClioWebSearchCall", "ClioTalk replays the previous search for follow-ups");
test.assertIncludes(chatMessages, "lastClioWebSearchCall = null", "ClioTalk clears the replay state on a new conversation");
test.assertIncludes(chatMessages, "onDelta", "ClioTalk streams the web-search answer into the pending message");
test.assertIncludes(modelStream, "function readWebSearchStream", "the browser has a shared web-search stream reader");
test.assertNotIncludes(chatMessages, 'effort: "low"', "ClioTalk does not choose reasoning effort");
test.assertIncludes(cloudChat, "CLOUD_THINKING_TASKS", "cloud chat enables thinking only for whitelisted task kinds");
test.assertIncludes(cloudChat, "payload.reasoning_effort", "cloud chat sets reasoning effort from the task policy");
test.assertIncludes(chatMessages, "usage_cache_hit", "the cloud usage meter shows cache hits");
test.assertIncludes(chatMessages, "usage_reasoning_tokens", "the cloud usage meter shows reasoning tokens");
test.assertIncludes(chatMessages, "function refreshClioTalkWebSearchToggle", "the Control Panel setting shows or hides the composer switch");
test.assertIncludes(index, 'id="clio-web-search"', "Control Panel Advanced offers the ClioTalk web-search setting");
test.assertIncludes(index, 'id="clio-web-search-toggle"', "the composer offers a per-message web-search switch");
test.assertIncludes(index, 'class="composer-web-search-glyph"', "the ClioTalk web-search switch uses a compact icon glyph");
test.assertIncludes(windowsCss, ".composer-web-search-glyph", "the web-search glyph has an owned sizing rule");
test.assertIncludes(index, 'clio-web-search-toggle is-hidden"', "the ClioTalk web-search switch starts hidden");
test.assertIncludes(chatMessages, 'toggle.classList.toggle("is-hidden", !enabled)', "the Control Panel setting gates the switch's visibility");
test.assertIncludes(persistence, "clioWebSearch:", "the ClioTalk web-search setting persists");
test.assertIncludes(actions, '"reader-find-sources": runReaderFindSources', "the Reader handoff action is wired");
test.assertIncludes(actions, '"review-facts-section-online"', "the section online claim check action is wired");
test.assertIncludes(actions, '"review-facts-online"', "the manuscript online claim check action is wired");
test.assertIncludes(menus, 'menuItem("review-facts-online"', "the Review Desk menu exposes the online claim check");
test.assertIncludes(index, 'id="reader-find-sources" data-action="reader-find-sources"', "Reader offers Find Related Sources");
test.assertIncludes(index, 'data-action="review-facts-section-online"', "Review Desk offers a section online check");
test.assertIncludes(index, 'data-action="review-facts-online"', "Review Desk offers a manuscript online check");
for (const key of ["search_deepseek", "search_answer_label", "search_answer_note", "search_answer_no_sources", "search_source_count", "review_facts_online", "review_facts_section_online", "find_related_sources", "claim_check_online_note", "claim_verdict_manual", "clio_web_search_setting", "clio_web_search_switch", "clio_web_search_note", "clio_web_search_citations", "usage_cache_hit", "usage_reasoning_tokens"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}

test.finish();
