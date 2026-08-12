// Local vision support is a capability route, not a hard binding to one
// concrete model id. Qwen and Gemma local VLMs share the same image path.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("local-vision-models");

const vision = read("apps/server/server/vision.js");
const router = read("apps/server/server/router.js");
const route = read("apps/server/server/routes/vision-analyze.js");
const imageOcr = read("apps/server/server/importers/image-ocr.js");
const lmstudio = read("apps/server/server/lmstudio.js");
const setupRoute = read("apps/server/server/routes/lmstudio-setup.js");
const persistence = read("app/core/persistence-status.js");
const teachText = read("app/features/teachtext-accessories.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const css = read("styles/50-apps.css");

test.assertIncludes(vision, "LOCAL_VISION_FALLBACK_MODELS", "local vision has a model fallback list");
test.assertIncludes(vision, "\"qwen3.5-4b-mlx\"", "Qwen 3.5 4B MLX is treated as a local VLM fallback");
test.assertIncludes(vision, "\"gemma-4-e4b-it\"", "Gemma 4 E4B IT remains a local VLM fallback");
test.assertIncludes(vision, "getLoadedLmStudioModelInfo()?.model", "current loaded LM Studio model is tried before fallbacks");
test.assertIncludes(vision, "process.env.AI_SYSTEM6_VISION_MODEL", "operators can override the vision model without code edits");
test.assertIncludes(vision, "postLocalChatWithModelAutoload", "vision calls can autoload compatible local models");
test.assertIncludes(vision, "type: \"image_url\"", "vision payloads send image input through OpenAI-compatible chat content");
test.assertIncludes(vision, "mode === \"writing-context\"", "vision route can produce source-grounded writing notes");
test.assertIncludes(vision, "mode === \"ocr\"", "vision route can run OCR prompts");

test.assertIncludes(router, "[\"POST /api/vision/analyze\", handleVisionAnalyze]", "server routes browser vision requests");
test.assertIncludes(route, "postLocalVisionAnalysis", "vision route delegates to the shared local VLM helper");
test.assertIncludes(route, "AI_SYSTEM6_VISION_JSON_MAX_BYTES", "vision route has a request-size budget");

test.assertIncludes(imageOcr, "postLocalVisionAnalysis", "image importer OCR uses the shared local vision path");
test.assertIncludes(imageOcr, "imageBufferToDataUrl", "image importer sends images through data URLs");
test.assertNotIncludes(imageOcr, "LM_STUDIO_URL", "image importer no longer hand-rolls a single LM Studio chat URL");

test.assertNotIncludes(lmstudio, "qwen/qwen3-vl-4b", "server setup no longer hardcodes qwen/qwen3-vl-4b as the bundled download");
test.assertIncludes(lmstudio, "AI_SYSTEM6_SETUP_DOWNLOAD_MODEL", "setup download target is an operator choice");
test.assertIncludes(setupRoute, "No default download model is bundled", "empty-machine setup asks for an explicit model instead of silently binding one");
test.assertNotIncludes(persistence, "download_model: \"qwen/qwen3-vl-4b\"", "client setup request no longer sends a fixed Qwen download model");
test.assertNotIncludes(persistence, "|| \"qwen/qwen3-vl-4b\"", "client setup display does not fall back to a fixed Qwen label");

test.assertIncludes(teachText, "AISystem6ModelTaskRuntime.buildVisionMessages", "TeachText Picture Album builds the shared browser vision request");
test.assertIncludes(teachText, "sendLocalModelTask", "TeachText Picture Album calls the selected local model directly");
test.assertNotIncludes(teachText, "fetch(\"/api/vision/analyze\"", "TeachText Picture Album never sends local vision content through the VPS");
test.assertIncludes(teachText, "analyzeTeachTextImageAttachment(attachment, \"writing-context\")", "TeachText exposes grounded image-note reading");
test.assertIncludes(teachText, "analyzeTeachTextImageAttachment(attachment, \"ocr\")", "TeachText exposes image OCR");
test.assertIncludes(teachText, "getTeachTextVisionModelRequestName", "TeachText uses the current local model selection when reading images");
test.assertIncludes(teachText, "storedAttachment.visionModel", "TeachText stores the model used for image notes");
test.assertIncludes(en, "image_read", "English copy includes the image read command");
test.assertIncludes(zh, "image_read", "Chinese copy includes the image read command");
test.assertIncludes(css, "grid-template-columns: repeat(4, auto)", "list view accommodates Insert, Read, OCR, and Remove actions");

test.finish();
