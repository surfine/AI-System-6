// Public-safe Streaming Output contract: model replies render incrementally,
// can be stopped, and fall back to escaped text.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-streaming-output");
const chat = read("app/core/chat-messages.js");
const markdown = read("app/core/streaming-markdown.js");
const markdownCore = read("app/core/markdown.js");
const actions = read("app/core/actions.js");

test.assertIncludes(chat, "stream", "the chat path supports streaming replies");
test.assertIncludes(chat, "stopGeneration", "streaming can be stopped");
test.assertIncludes(chat, "abort", "in-flight model calls are abortable");
test.assertIncludes(markdown, "function ", "the streaming Markdown renderer carries executable behavior");
// Retry moved out of the composer's permanently-hidden button and into the
// Conversation menu, where the verb's registration and availability already
// lived (owner, 2026-10-13). It still exists, and it still offers itself.
test.assertIncludes(read("app/data/menus.js"), 'menuItem("retry-last-message", "retry")', "a failed stream offers retry, through the Conversation menu");
test.assertIncludes(actions, '"retry-last-message"', "and the verb is registered rather than dropped");
test.assertIncludes(markdownCore, "fallback", "unparseable streams fall back to escaped text");

test.finish();
