// Gemma 4 local model support keeps the new HF / GGUF names usable in
// LM Studio and OpenAI-compatible local runtimes.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("gemma4-local-models");

const lmstudioModels = read("src/server/lib/lmstudio-models.js");
const serverChat = read("src/server/chat.js");
const chatRoute = read("src/server/routes/chat.js");
const chatMessages = read("app/core/chat-messages.js");

test.assertIncludes(lmstudioModels, "gemma[-_/ ]?4", "known context matching accepts Gemma 4 aliases");
test.assertIncludes(lmstudioModels, "/26b/i.test(value) && /a4b/i.test(value)) return 262144", "26B A4B defaults to the 256K model-card context");
test.assertIncludes(lmstudioModels, "/e4b/i.test(value)) return 131072", "E4B defaults to the 128K model-card context");

test.assertIncludes(serverChat, "function isGemma4ModelName", "server detects Gemma 4 model names");
test.assertIncludes(serverChat, "function isGemma4E4BModelName", "server detects Gemma 4 E4B names for focused local tuning");
test.assertIncludes(serverChat, "AI System 6 Gemma 4 E4B adapter", "server adds a small E4B adapter instruction");
test.assertIncludes(serverChat, "mergeGemma4SystemMessages", "server folds leading system turns for Gemma 4 templates");
test.assertIncludes(serverChat, "intelligent system framework", "E4B adapter blocks generic system-framework identity drift");
test.assertIncludes(serverChat, "function tuneGemma4ChatPayload", "server has a Gemma 4 payload tuner");
test.assertIncludes(serverChat, "temperature: 1.0", "Gemma 4 uses the model-card sampling baseline");
test.assertIncludes(serverChat, "topP: 0.95", "Gemma 4 server tuning applies top_p 0.95");
test.assertIncludes(serverChat, "topK: 64", "Gemma 4 server tuning applies top_k 64");
test.assertIncludes(serverChat, "enable_thinking: false", "Gemma 4 thinking is disabled for local writing tasks");
test.assertIncludes(serverChat, "function scrubVisibleModelOutput", "Gemma 4 thought/channel markers are scrubbed from visible output");
test.assertIncludes(chatRoute, "scrubVisibleOutputInData(data)", "local non-stream responses are cleaned before display");

test.assertIncludes(chatMessages, "function isGemma4ModelName", "client detects Gemma 4 model names");
test.assertIncludes(chatMessages, "function gemma4ChatDefaults", "client applies Gemma 4 chat defaults");
test.assertIncludes(chatMessages, "temperature: Number.isFinite(options.temperature) ? options.temperature : 1.0", "client preserves explicit task temperatures while defaulting Gemma 4 to 1.0");
test.assertIncludes(chatMessages, "top_p: 0.95", "client applies Gemma 4 top_p");
test.assertIncludes(chatMessages, "top_k: 64", "client applies Gemma 4 top_k");
test.assertIncludes(chatMessages, "isGemma4ModelName(budgetedPayload.model)", "auto chat disables streaming so Gemma 4 output can be repaired before display");
test.assertIncludes(chatMessages, "scrubVisibleModelOutput(content)", "client JSON responses strip Gemma 4 thought/channel tags");

test.finish();
