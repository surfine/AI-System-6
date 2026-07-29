// Model tasks keep their own output envelope instead of inheriting a global
// Markdown-only rule.

import { createRequire } from "node:module";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("model-task-contract");
const runtime = require("../../app/shared/model-task-runtime.js");
const {
  applyChatTaskContract,
  enforceMarkdownOnlyChatPayload,
} = require("../../src/server/chat.js");
const { HUMANIZER_MARKER } = require("../../src/server/humanizer.js");

const extraction = runtime.taskContractRegistry.require("extract-facts");
test.assert(extraction.id === "source.extract-facts", "Fact extraction resolves to a closed registry entry");
test.assert(extraction.output.kind === "json", "Fact extraction declares JSON output");
test.assert(extraction.output.schemaId === "fact-extraction-v1", "Fact extraction declares its schema");
test.assert(extraction.sourcePolicy === "selected-only", "Fact extraction limits its source scope");
test.assert(extraction.writeTarget === "none", "Fact extraction cannot write into the workspace");
test.assert(extraction.humanizer === "off", "Fact extraction disables style rewriting");
test.assert(extraction.protectedSpans.includes("quote"), "Fact extraction protects quoted source text");
test.assert(extraction.requiresUserCommit === false, "Fact extraction produces no implicit commit");

const markdownPayload = applyChatTaskContract({
  ai_system6_task_kind: "chat",
  messages: [{ role: "user", content: "Hello" }],
  response_format: { type: "json_object" },
  ai_system6_output_kind: "markdown",
});
test.assert(!markdownPayload.response_format, "Explicit Markdown tasks remove structured provider fields");
test.assert(
  markdownPayload.messages[0].content.includes("Return Markdown only"),
  "Markdown tasks receive only the Markdown envelope"
);

const jsonResponseFormat = { type: "json_schema", json_schema: { name: "facts", schema: { type: "object" } } };
const jsonPayload = applyChatTaskContract({
  ai_system6_task_kind: "extract-facts",
  ai_system6_output_kind: "json",
  ai_system6_output_schema_id: "fact-extraction-v1",
  messages: [{ role: "user", content: "Extract facts" }],
  response_format: jsonResponseFormat,
});
test.assert(jsonPayload.response_format === jsonResponseFormat, "JSON tasks preserve provider response_format");
test.assert(
  jsonPayload.messages[0].content.includes("exactly one valid JSON value"),
  "JSON tasks receive a JSON-only envelope"
);
test.assert(
  !jsonPayload.messages.some((message) => String(message.content).includes(HUMANIZER_MARKER)),
  "Source-preserving JSON tasks do not receive Humanizer instructions"
);
test.assert(!("ai_system6_output_kind" in jsonPayload), "Internal output-kind fields never reach providers");
test.assert(!("ai_system6_output_schema_id" in jsonPayload), "Internal schema identifiers never reach providers");

const translationPayload = applyChatTaskContract({
  ai_system6_task_kind: "translate",
  messages: [{ role: "user", content: "Translate this" }],
  json_schema: { type: "object" },
});
test.assert(
  translationPayload.messages[0].content.includes("plain text only"),
  "Translation uses its registered plain-text envelope"
);
test.assert(!translationPayload.json_schema, "Plain-text tasks discard incompatible schema fields");
test.assert(
  !translationPayload.messages.some((message) => String(message.content).includes(HUMANIZER_MARKER)),
  "Translation preserves source wording without Humanizer"
);

const patchContract = runtime.taskContractRegistry.require("humanize-selection");
test.assert(patchContract.output.kind === "patch", "Explicit selection rewrite uses a patch envelope");
test.assert(patchContract.humanizer === "explicit-rewrite", "Only the explicit selection action authorizes Humanizer rewrite");
test.assert(patchContract.requiresUserCommit, "Selection patches remain proposals until user commit");

const forcedMarkdown = enforceMarkdownOnlyChatPayload({
  messages: [],
  response_format: { type: "json_object" },
});
test.assert(!forcedMarkdown.response_format, "Explicit Markdown-only surfaces still reject structured fields");

test.finish();
