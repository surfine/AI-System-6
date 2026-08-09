// Public-safe Streaming Output contract: model replies render incrementally,
// can be stopped, and fall back to escaped text.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-streaming-output");
const chat = read("app/core/chat-messages.js");
const markdown = read("app/core/streaming-markdown.js");
const markdownCore = read("app/core/markdown.js");
const html = read("index.html");

test.assertIncludes(chat, "stream", "the chat path supports streaming replies");
test.assertIncludes(chat, "stopGeneration", "streaming can be stopped");
test.assertIncludes(chat, "abort", "in-flight model calls are abortable");
test.assertIncludes(markdown, "function ", "the streaming Markdown renderer carries executable behavior");
test.assertIncludes(html, "id=\"retry\"", "a failed stream offers retry");
test.assertIncludes(markdownCore, "fallback", "unparseable streams fall back to escaped text");

test.finish();
