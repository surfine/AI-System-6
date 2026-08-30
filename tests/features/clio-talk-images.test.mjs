// ClioTalk image inputs are structured request material. They may persist only
// as bounded inline copies plus safe metadata; provider handles and live File
// objects stay in the current tab.

import vm from "node:vm";
import { createFeatureTest, forEachAstChild, parseJsSource, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-talk-images");
const chat = read("app/core/chat-messages.js");
const images = read("app/core/image-attachments.js");
const html = read("index.html");

function declaration(source, name) {
  const ast = parseJsSource(source);
  let found = null;
  const visit = (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === name) found = source.slice(node.start, node.end);
    if (!found) forEachAstChild(node, visit);
  };
  visit(ast);
  if (!found) throw new Error(`Missing function ${name}`);
  return found;
}

test.assertIncludes(images, "const CLIO_IMAGE_MAX_PIXELS = 640000", "static images use the normal 640000-pixel ceiling");
test.assertIncludes(images, "const CLIO_IMAGE_LOW_MAX_PIXELS = 512 * 512", "low detail uses the 262144-pixel ceiling");
test.assertIncludes(images, "const CLIO_IMAGE_MAX_EDGE = 8192", "original detail also respects DeepSeek's per-side ceiling");
test.assertIncludes(images, "const CLIO_IMAGE_LOW_MAX_EDGE = 512", "low detail does not ship an unnecessarily long edge");
test.assertIncludes(images, "const CLIO_IMAGE_MAX_INLINE_BYTES = 512 * 1024", "each persisted inline copy is capped at 512 KiB decoded");
test.assertIncludes(images, "const CLIO_IMAGE_MAX_REQUEST_BYTES = 200 * 1024 * 1024", "active Files references obey the 200 MiB product ceiling");
test.assertMatches(images, /let scale = Math\.min\(\s*1,/u, "normalization never enlarges the source image");
test.assertIncludes(images, 'image_url: { url, detail: "original" }', "ClioTalk asks DeepSeek to preserve the bounded 640k-pixel copy");
test.assertIncludes(images, "URL.createObjectURL(file)", "large source Files are decoded through object URLs rather than full-size base64");
test.assertIncludes(images, "createImageBitmap(file)", "supported browsers decode selected images off the main thread");
test.assertIncludes(images, "canvas.convertToBlob", "OffscreenCanvas uses asynchronous JPEG encoding");
test.assertIncludes(images, "canvas.toBlob", "DOM canvas also uses asynchronous JPEG encoding");
test.assertIncludes(images, "function normalizeClioImageInput", "imageInputs pass through one persistence whitelist");
for (const forbidden of ["fileToken", "credentialScope", "objectUrl"]) {
  test.assertMatches(images, new RegExp(`options\\.includeRuntime[\\s\\S]{0,800}${forbidden}`), `${forbidden} is admitted only by the explicit runtime path`);
}

const context = vm.createContext({
  IMAGE_BLOCK_TOKEN_ESTIMATE: 384,
  contextCharsPerToken: 4,
  reservedSafetyTokens: 256,
  currentLanguage: "en",
  contextLengthInput: { value: "2048" },
});
vm.runInContext([
  declaration(chat, "estimateTokenCount"),
  declaration(chat, "fitChatPayloadToContext"),
].join("\n"), context);

const imageBlock = { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA==" } };
const fileBlock = { type: "file", file_id: "signed-file-token-sentinel" };
test.assert(context.estimateTokenCount([imageBlock]) === 384, "inline image blocks estimate to 384 tokens");
test.assert(context.estimateTokenCount([fileBlock]) === 384, "Files API blocks estimate to 384 tokens");

const fitted = context.fitChatPayloadToContext({
  messages: [
    { role: "system", content: "S".repeat(8000) },
    { role: "user", content: [{ type: "text", text: "T".repeat(8000) }, imageBlock, fileBlock] },
  ],
}, { contextTokens: 2048, maxTokens: 256 });
const fittedContent = fitted.messages.at(-1).content;
test.assert(Array.isArray(fittedContent), "the final context fitter preserves structured user content");
test.assert(fittedContent.some((block) => block.type === "image_url"), "the final fitter preserves the inline image block");
test.assert(fittedContent.some((block) => block.type === "file"), "the final fitter preserves the Files API block");
test.assert(!JSON.stringify(fitted).includes("[object Object]"), "the fitted payload never flattens blocks to object text");
test.assert(fitted.messages.filter((message) => message.role === "user").length === 1,
  "the final fitter never duplicates the image-bearing user message");

const multiTextFitted = context.fitChatPayloadToContext({
  messages: [
    { role: "system", content: "short" },
    { role: "user", content: [
      { type: "text", text: "A".repeat(12000) },
      imageBlock,
      { type: "text", text: "B".repeat(12000) },
    ] },
  ],
}, { contextTokens: 2048, maxTokens: 256 });
const fittedTextChars = multiTextFitted.messages.at(-1).content
  .filter((block) => block.type === "text")
  .reduce((sum, block) => sum + block.text.length, 0);
test.assert(fittedTextChars < 5000, "the final fitter shares one text budget across structured text blocks");

test.assertIncludes(chat, "modelMessageContentReceipt", "loadout and Run Record content use a redacted structured receipt");
test.assertIncludes(chat, "estimateTokenCount(rawContent)", "loadout estimates the real structured content before redaction");
test.assertIncludes(chat, "payload?._cloud_model || payload?.model", "the manifest records the effective image-routed model");

// Filled in by the direct-upload UI slice; keeping these in the same feature
// contract prevents a transport-only implementation from landing invisibly.
test.assertIncludes(html, 'data-action="open-clio-image-picker"', "ClioTalk Add exposes the direct image picker");
test.assertIncludes(chat, "pendingClioImageInputs", "ClioTalk owns a runtime-only pending image set");
test.assertIncludes(chat, "activeClioImageInputs", "ClioTalk owns a runtime-only active image set");
test.assertIncludes(chat, "!currentModelSupportsImageInputs()", "ClioTalk keeps images pending for a known text-only local model");
test.assertIncludes(chat, "clioImagePreparationTail", "selected images are prepared through one serial memory-bounded queue");
test.assertIncludes(chat, "return prepareClioImageInline(pending.file, { signal: controller.signal })",
  "selection prepares the inline fallback locally and can cancel it");
test.assertIncludes(chat, "The first network request is still gated on Send.",
  "selection does not upload before Send");
test.assertIncludes(chat, "releaseActiveClioImageSource(runtime)", "successful preparation releases the original File and encoding Blob");
const preparePendingSource = declaration(chat, "preparePendingClioImages");
test.assert(
  preparePendingSource.indexOf("releaseActiveClioImageSource(runtime)") >= 0
    && preparePendingSource.indexOf("staged.push(runtime)") >= 0
    && preparePendingSource.indexOf("releaseActiveClioImageSource(runtime)") < preparePendingSource.indexOf("staged.push(runtime)"),
  "heavy runtime sources are released before an image becomes active"
);
test.assertIncludes(chat, "clioImageOriginCache", "reopened message rendering reuses one image-origin index");
test.assertNotIncludes(declaration(chat, "addPendingClioImageFiles"), "URL.createObjectURL",
  "the lightweight attachment chip does not retain a redundant object URL");
test.assertIncludes(chat, "appendClioTalkImageHistory", "reopened messages visibly record which turn carried images");
test.assertIncludes(chat, "data-clio-image-history", "the historical image marker is rendered without base64 content");

test.finish();
