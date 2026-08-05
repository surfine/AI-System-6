// Structured-output migration: the shared Responses API transport serves the
// data-shaped server routes (claim verdict, subtitle translations) through
// text.format json_schema, while writing surfaces keep their Markdown
// contracts — the chat channel deliberately forbids JSON for writing.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("responses-structured-output");
const responses = read("src/server/responses.js");
const srt = read("src/server/importers/srt.js");
const webSearch = read("src/server/web-search.js");
const draftThesis = read("src/server/routes/draft-thesis.js");

test.assertIncludes(responses, "DEEPSEEK_RESPONSES_URL", "the transport targets the official Responses endpoint");
test.assertIncludes(responses, "function isResponsesEligible", "Responses eligibility is explicit");
test.assertIncludes(responses, "deepseek-v4-flash", "the transport pins the Responses-capable model");
test.assertIncludes(responses, 'textFormat || { type: "text" }', "the transport forwards the caller's text format");
test.assertIncludes(responses, "function callResponsesJson", "the transport normalizes upstream errors");
test.assertIncludes(responses, "function extractResponsesText", "the transport reads output_text");
test.assertIncludes(responses, "function chatMessagesToResponsesInput", "message-shaped prompts convert for later phases");
test.assertIncludes(responses, "RESPONSES_TASK_EFFORT", "reasoning effort is a task-type policy");
test.assertIncludes(responses, "function responsesEffortForTask", "the policy mapping is exported");
test.assertIncludes(responses, "never exposes the choice to the user", "effort is decided server-side, not by the user");
test.assertIncludes(responses, "function cloudUpstreamWarning", "upstream 402/429/503 statuses get friendly copy");
test.assertIncludes(srt, "isResponsesEligible", "subtitle translation opts into Responses only when eligible");
test.assertIncludes(srt, 'name: "subtitle_translations"', "subtitle output has a named json_schema");
test.assertIncludes(srt, "function parseStructuredSubtitleTranslations", "schema output is parsed into ordered text");
test.assertIncludes(srt, "function runSubtitleCloudTranslation", "subtitle dispatch keeps local and Chat Completions fallbacks");
test.assertIncludes(srt, "parseContent(content)", "the Responses path falls back to Markdown parsing");
test.assertIncludes(srt, 'responsesEffortForTask("subtitle")', "subtitle translation uses the task-type effort policy");
test.assertIncludes(webSearch, 'type: "json_schema"', "claim mode already requests schema-enforced verdicts");
test.assertIncludes(webSearch, "responsesEffortForTask(", "web-search modes derive effort from the task-type policy");
test.assertIncludes(draftThesis, "NOT JSON", "writing surfaces keep their Markdown contract instead of being forced to JSON");

test.finish();
