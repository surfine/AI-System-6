// Streaming output should reduce model wait time without turning partial model
// text into durable project state. Streamed Markdown uses an optional parser
// for temporary previews; final saved/exported Markdown still uses the stable
// marked-backed wrapper.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("streaming-output");

const manifest = read("scripts/runtime-manifest.mjs");
const packageJson = read("package.json");
const modelStream = read("app/core/model-stream.js");
const streamingMarkdown = read("app/core/streaming-markdown.js");
const markdown = read("app/core/markdown.js");
const chatMessages = read("app/core/chat-messages.js");
const outlineClaim = read("app/features/outline-claim.js");
const writingFlow = read("app/features/writing-flow.js");
const translation = read("app/features/translation.js");
const translationPad = read("app/features/translation-pad.js");
const reader = read("app/features/reader.js");

test.assertIncludes(packageJson, "\"stream-markdown-parser\"", "stream-markdown-parser is an explicit npm dependency");
test.assertMatches(packageJson, /"prebuild:app": "npm run build:stream-markdown-vendor(?: && npm run build:ai-prompt-files)?"/, "vendor bundle is rebuilt before the app bundle");
test.assertIncludes(manifest, "\"app/core/model-stream.js\"", "shared stream reader is in the core runtime");
test.assertIncludes(manifest, "\"app/core/streaming-markdown.js\"", "streaming Markdown adapter is in the core runtime");
test.assertIncludes(manifest, "\"app/vendor/stream-markdown-parser.global.js\"", "third-party parser is a lazy runtime file");
test.assertMatches(
  manifest,
  /export const appModulePaths = \[[\s\S]*"app\/core\/streaming-markdown\.js"[\s\S]*\];[\s\S]*export const lazyRuntimePaths = \[\s*"app\/vendor\/stream-markdown-parser\.global\.js"/,
  "large parser vendor stays lazy instead of joining the startup bundle"
);

test.assertIncludes(modelStream, "async function readModelTextStream(response, options = {})", "model stream reader has the planned shared interface");
test.assertIncludes(modelStream, "onSnapshot", "stream reader reports cumulative snapshots");
test.assertIncludes(modelStream, "onUsage", "stream reader preserves cloud usage accounting without changing the text return value");
test.assertIncludes(modelStream, "onFinishReason", "stream reader reports provider finish reasons");
test.assertIncludes(modelStream, "const isEventStream", "event-stream framing is recognized before the first data event arrives");
test.assertIncludes(modelStream, 'trimmed.startsWith(":")', "SSE keep-alive comments never become visible reply text");
test.assertIncludes(modelStream, "response.body?.getReader?.()", "stream reader supports browser streams");
test.assertIncludes(modelStream, "return content;", "stream reader returns final text");
test.assertIncludes(modelStream, 'new DOMException("The model response was stopped.", "AbortError")', "stopping a stream cannot be mistaken for a completed reply");
test.assertIncludes(chatMessages, 'if (String(streamError?.partialContent || "").trim()) throw streamError;', "a partial streamed reply is never silently billed a second time");
test.assertIncludes(chatMessages, 'runStatus: "interrupted"', "interrupted streamed text remains available as a continuable reply");

const readModelTextStreamForTest = new Function(`${modelStream}\nreturn readModelTextStream;`)();
const streamEncoder = new TextEncoder();
const deepSeekLikeResponse = new Response(new ReadableStream({
  start(controller) {
    [
      ": keep-alive\n\n",
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"length"}]}\n\n',
      "data: [DONE]\n\n",
    ].forEach((chunk) => controller.enqueue(streamEncoder.encode(chunk)));
    controller.close();
  },
}), { headers: { "content-type": "text/event-stream" } });
let streamedFinishReason = "";
const streamedDeepSeekText = await readModelTextStreamForTest(deepSeekLikeResponse, {
  throttleMs: 0,
  onFinishReason: (reason) => {
    streamedFinishReason = reason;
  },
});
test.assert(streamedDeepSeekText === "你好", "DeepSeek keep-alive comments are excluded from the visible reply");
test.assert(streamedFinishReason === "length", "DeepSeek finish reasons survive streaming");

test.assertIncludes(streamingMarkdown, "async function ensureStreamMarkdownParser()", "parser is loaded through a narrow ensure function");
test.assertIncludes(streamingMarkdown, "loadClassicScriptOnce(\"app/vendor/stream-markdown-parser.global.js\")", "parser loads lazily as a classic script");
test.assertIncludes(streamingMarkdown, "function renderStreamingMarkdownHtml(markdown, options = {})", "temporary streaming renderer is isolated from static rendering");
test.assertIncludes(streamingMarkdown, "return markdownToSystemHtml(source || \"...\");", "streaming renderer falls back to the marked wrapper");
test.assertIncludes(streamingMarkdown, "isSafeMarkdownHref", "streaming links reuse the existing safe href policy");
test.assertIncludes(streamingMarkdown, "isSafeMarkdownImageSrc", "streaming images reuse the existing safe image policy");

test.assertIncludes(markdown, "function markdownToSystemHtml(markdown)", "static marked-backed Markdown wrapper remains available");
test.assertIncludes(chatMessages, "body.innerHTML = renderStreamingMarkdownHtml(content || \"...\");", "pending chat bubbles use streaming Markdown only while partial");
test.assertIncludes(chatMessages, "body.innerHTML = markdownToSystemHtml(options.messageRecord?.displayContent || content);", "resolved messages still use the stable static renderer");
test.assertIncludes(chatMessages, "await prepareStreamingMarkdownPreview();", "ClioTalk primes the optional parser before streaming");

test.assertIncludes(outlineClaim, "stream: true", "writing-route model calls request streamed output");
test.assertIncludes(outlineClaim, "showStreamingSurfacePreview(\"outline\"", "outline operations stream into the Outline preview");
test.assertIncludes(outlineClaim, "showStreamingSurfacePreview(\"sectionDrafts\"", "draft polishing/suggestions stream into the Draft preview");
test.assertIncludes(writingFlow, "showStreamingSurfacePreview(\"sectionDrafts\"", "section drafting streams into the Draft preview");
test.assertIncludes(writingFlow, "confirmAndApplySectionDraft(content", "section drafting still confirms before writing the draft object");
test.assertIncludes(outlineClaim, "showSystemModal(t(\"suggest_append_confirm\", preview), \"confirm\")", "AI draft suggestions confirm before appending to the draft object");
test.assertIncludes(outlineClaim, "confirmAndApplyAiOutline(content", "outline replacement still confirms before writing the project outline");

test.assertIncludes(translation, "onProgress = null", "translation API accepts progress callbacks");
test.assertIncludes(translation, "onProgress?.([...translatedChunks, partial]", "chunked translation reports completed chunks plus current partial");
test.assertIncludes(translationPad, "translationPadResultInput.value = partial", "Translation Pad result box receives partial translations");
test.assertIncludes(translation, "showStreamingTeachTextPreview(partial)", "TeachText full translation streams into a temporary preview");
test.assertIncludes(reader, "onProgress: (partial) => updatePendingStreamContent(pendingMessage, partial)", "Reader full translation streams into the pending assistant message");
test.assertIncludes(translation, "translationCache.set(cacheKey, translated)", "translation cache stores only complete final translations");

test.finish();
