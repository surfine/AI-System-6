// AI System 6 keeps model QA focused on the providers we can actually
// afford and tune: Gemma/Qwen locally, DeepSeek in the cloud. This is
// a product-wide model boundary for writing, translation, RAG, and
// vision interactions, while the compatibility plumbing stays open.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("model-provider-scope");

const serverChat = read("src/server/chat.js");
const clientChat = read("app/core/chat-messages.js");
const cloudModel = read("app/features/cloud-model.js");
const serverCloud = read("src/server/cloud.js");
const cloudRoute = read("src/server/routes/cloud-chat.js");
const localVision = read("src/server/vision.js");

test.assertIncludes(serverChat, "function isQwen35ModelName", "local first-class support includes Qwen 3.5 / 3.6 detection on the server");
test.assertIncludes(clientChat, "function isQwen35ModelName", "local first-class support includes Qwen 3.5 / 3.6 detection in the browser");
test.assertIncludes(serverChat, "function tuneQwen35ChatPayload", "Qwen has a dedicated local payload tuner");
test.assertIncludes(serverChat, "function isGemma4ModelName", "local first-class support includes Gemma 4 detection on the server");
test.assertIncludes(clientChat, "function isGemma4ModelName", "local first-class support includes Gemma 4 detection in the browser");
test.assertIncludes(serverChat, "function tuneGemma4ChatPayload", "Gemma has a dedicated local payload tuner");
test.assertIncludes(serverChat, "first-class model QA targets are Gemma and\n// Qwen locally, plus DeepSeek in the cloud", "server chat documents the app-wide first-class model boundary");
test.assertIncludes(serverChat, "underlying chat payload OpenAI-compatible", "local chat keeps the OpenAI-compatible escape hatch");
test.assertIncludes(serverChat, "return tuneGemma4ChatPayload(tuneQwen35ChatPayload(basePayload));", "local routing layers only the Gemma and Qwen family-specific tuners");
test.assertIncludes(serverChat, "function tuneLocalNoThinkingPayload", "non-first-class local models still receive a conservative generic compatibility pass");
test.assertIncludes(serverChat, "stripInternalFields: !isQwen35ModelName(payload?.model) && !isGemma4ModelName(payload?.model)", "Gemma/Qwen keep family metadata for first-class tuning while other local models remain best-effort");

test.assertIncludes(localVision, "same model boundary as the rest of AI System 6", "local vision explicitly follows the app-wide model boundary");
test.assertIncludes(localVision, "\"qwen3.5-4b-mlx\"", "Qwen 3.5 4B MLX stays in the local endpoint validation set");
test.assertIncludes(localVision, "\"gemma-4-e4b-it\"", "Gemma 4 E4B IT stays in the local endpoint validation set");
test.assertIncludes(localVision, "getLoadedLmStudioModelInfo()?.model", "vision tries the user's currently loaded local model before fallbacks");
test.assertIncludes(localVision, "process.env.AI_SYSTEM6_VISION_MODEL", "vision remains operator-extensible without code edits");
test.assertIncludes(localVision, "tuneLmStudioChatPayload(enforceMarkdownOnlyChatPayload", "vision goes through the shared local chat tuning path");
test.assertIncludes(localVision, "type: \"image_url\"", "vision preserves an OpenAI-compatible image-content payload");

test.assertIncludes(cloudModel, "DeepSeek is the first-class cloud provider", "cloud UI documents DeepSeek as the first-class cloud route");
test.assertIncludes(cloudModel, "const PROVIDER_BASE_URLS = {\n    deepseek: DEEPSEEK_BASE_URL,\n  };", "cloud UI has only DeepSeek as a built-in provider");
test.assertIncludes(cloudModel, "const BUILTIN_PROVIDER_MODELS = {\n    deepseek: [", "cloud model picker exposes DeepSeek as the built-in cloud model family");
test.assertNotIncludes(cloudModel, "openai:", "cloud UI does not promote OpenAI as a built-in paid provider");
test.assertNotIncludes(cloudModel, "anthropic:", "cloud UI does not promote Anthropic as a built-in paid provider");
test.assertIncludes(serverCloud, "DEEPSEEK_CLOUD_MODELS", "server cloud registry is the DeepSeek model registry");
test.assertIncludes(serverCloud, "DeepSeek is the first-class cloud QA target", "server cloud helpers document DeepSeek as the cloud QA target");
test.assertIncludes(serverCloud, "compatible endpoint as a best-effort escape hatch", "server cloud helpers retain OpenAI-compatible provider openness");
test.assertIncludes(serverCloud, "deepseek-v4-flash", "server cloud registry includes DeepSeek v4 Flash");
test.assertIncludes(serverCloud, "deepseek-v4-pro", "server cloud registry includes DeepSeek v4 Pro");
test.assertIncludes(cloudRoute, "resolveCloudBaseUrl(raw._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT)", "cloud route applies the trusted endpoint policy before provider access");
test.assertIncludes(cloudRoute, "DEEPSEEK_V4_MODELS", "cloud chat route has DeepSeek v4-specific compatibility handling");
test.assertIncludes(cloudRoute, 'payload.thinking = thinkingEffort === "none"', "DeepSeek v4 cloud route decides thinking server-side by task type");

test.finish();
