// Chat-payload normalization helpers.
//
// Shared by cloud chat, local LM Studio chat, and the Endfield RAG
// flow in the root server. As more chat-related helpers migrate
// (tuneLmStudioChatPayload, tuneQwen35ChatPayload, ...) they live
// here too. AI System 6's first-class model QA targets are Gemma and
// Qwen locally, plus DeepSeek in the cloud; these helpers keep the
// underlying chat payload OpenAI-compatible so other models can still
// be tried as best-effort routes.

"use strict";

const { humanizerModelInstruction } = require("./humanizer.js");
const { systemIntegrityInstruction } = require("./system-integrity.js");
const {
  localChatDefaults: sharedLocalChatDefaults,
  scrubVisibleModelOutput: sharedScrubVisibleModelOutput,
  taskContractForPayload,
} = require("../../desktop/app/shared/model-task-runtime.js");

/**
 * Apply the registered output and write-boundary contract to an
 * OpenAI-compatible payload. Structured output fields survive JSON and
 * patch tasks; Markdown tasks deliberately remove them.
 *
 * @param {any} payload
 * @returns {any}
 */
function applyChatTaskContract(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const anyPayload = /** @type {any} */ (payload);
  const messages = Array.isArray(anyPayload.messages) ? anyPayload.messages : [];
  const contract = taskContractForPayload(anyPayload);
  const outputKind = contract.output.kind;
  const outputInstruction = outputKind === "json"
    ? "Return exactly one valid JSON value. Do not wrap it in Markdown or add explanatory text."
    : outputKind === "patch"
      ? "Return exactly one valid JSON patch object matching the requested schema. Do not wrap it in Markdown or add explanatory text."
      : outputKind === "plainText"
        ? "Return plain text only. Do not add Markdown fences, JSON wrappers, or explanatory prefaces."
        : [
          "Treat every model-facing input as Markdown.",
          "Return Markdown only.",
          "Never return JSON, JSON code fences, schemas, or machine-readable object literals.",
        ].join(" ");
  const boundaryInstruction = [
    `AI System 6 task contract: ${contract.id}.`,
    `Source policy: ${contract.sourcePolicy}. Write target: ${contract.writeTarget}.`,
    contract.requiresUserCommit
      ? "Your response is a proposal only; never claim it was written or saved. A user commit is required."
      : "Never claim that a save, insert, export, or external action occurred unless the application confirms it.",
    `Preserve protected spans: ${contract.protectedSpans.join(", ")}.`,
  ].join(" ");
  const integrityInstruction = systemIntegrityInstruction(messages);
  const humanizerInstruction = contract.humanizer === "off"
    ? ""
    : humanizerModelInstruction(anyPayload.ai_system6_task_kind, messages);
  const nextPayload = {
    ...anyPayload,
    messages: [
      { role: "system", content: outputInstruction },
      { role: "system", content: boundaryInstruction },
      ...(integrityInstruction ? [{ role: "system", content: integrityInstruction }] : []),
      ...(humanizerInstruction ? [{ role: "system", content: humanizerInstruction }] : []),
      ...messages,
    ],
  };
  if (outputKind === "markdown" || outputKind === "plainText") {
    delete nextPayload.response_format;
    delete nextPayload.json_schema;
  }
  delete nextPayload.ai_system6_output_kind;
  delete nextPayload.ai_system6_output_schema;
  delete nextPayload.ai_system6_output_schema_id;
  return nextPayload;
}

/**
 * Force Markdown for routes whose UI and parser are explicitly Markdown-only.
 *
 * @param {any} payload
 * @returns {any}
 */
function enforceMarkdownOnlyChatPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return applyChatTaskContract({
    ...payload,
    ai_system6_output_kind: "markdown",
  });
}

/**
 * Detect Qwen 3.5 / 3.6 model names. Mirrors `isQwen35ModelName`
 * from root server.js exactly.
 *
 * @param {string} [value]
 * @returns {boolean}
 */
function isQwen35ModelName(value = "") {
  return /qwen(?:[-_/ ]?3\.[56]|3\.[56])/i.test(String(value || ""));
}

/**
 * Detect Gemma 4 model names across Hugging Face, LM Studio, GGUF,
 * and user-entered local aliases such as "gemma-4-e4b-it-4bit".
 *
 * @param {string} [value]
 * @returns {boolean}
 */
function isGemma4ModelName(value = "") {
  return /gemma[-_/ ]?4/i.test(String(value || ""));
}

/**
 * Detect the smaller Gemma 4 E4B instruct variants. E4B is quick and
 * useful locally, but tends to over-generalize product identity unless
 * the local-writing context is made very explicit.
 *
 * @param {string} [value]
 * @returns {boolean}
 */
function isGemma4E4BModelName(value = "") {
  const text = String(value || "");
  return isGemma4ModelName(text) && /e4b/i.test(text);
}

const GEMMA4_E4B_ADAPTER_MARKER = "AI System 6 Gemma 4 E4B adapter";
const GEMMA4_E4B_ADAPTER_INSTRUCTION = [
  `${GEMMA4_E4B_ADAPTER_MARKER}: keep short local-writing answers concrete, bounded, and source-first.`,
  "When asked what AI System 6 is, describe it as a local source-first writing desktop with visible writing objects, save boundaries, and a clear path from sources to drafts.",
  "Do not describe AI System 6 as an intelligent system framework, advanced cognitive system, autonomous-learning architecture, decision engine, or self-optimizing model.",
  "For short Chinese requests, obey sentence and character limits before adding explanation. Prefer one plain concrete point over a polished paragraph.",
].join("\n");

/**
 * @param {any} content
 * @returns {string}
 */
function messageContentText(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => typeof part?.text === "string" ? part.text.trim() : "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * @param {any} message
 * @returns {boolean}
 */
function isSystemLikeMessage(message) {
  return message?.role === "system" || message?.role === "developer";
}

/**
 * LM Studio's Gemma 4 template has strongest native support for one
 * leading system turn. Fold consecutive system/developer messages so
 * Markdown, integrity, Humanizer, and app identity guidance travel as
 * one instruction block instead of competing turns.
 *
 * @param {any[]} [messages]
 * @returns {any[]}
 */
function mergeGemma4SystemMessages(messages = []) {
  const source = Array.isArray(messages) ? messages : [];
  const leading = [];
  let index = 0;
  while (index < source.length && isSystemLikeMessage(source[index])) {
    const text = messageContentText(source[index].content);
    if (text) leading.push(text);
    index += 1;
  }
  if (leading.length <= 1) return source;
  return [
    { ...source[0], role: "system", content: leading.join("\n\n") },
    ...source.slice(index),
  ];
}

/**
 * @param {any[]} [messages]
 * @returns {any[]}
 */
function insertGemma4E4BAdapterMessage(messages = []) {
  const source = Array.isArray(messages) ? messages : [];
  if (source.some((message) => messageContentText(message?.content).includes(GEMMA4_E4B_ADAPTER_MARKER))) {
    return source;
  }
  let index = 0;
  while (index < source.length && isSystemLikeMessage(source[index])) index += 1;
  return [
    ...source.slice(0, index),
    { role: "system", content: GEMMA4_E4B_ADAPTER_INSTRUCTION },
    ...source.slice(index),
  ];
}

/**
 * @typedef {Object} Qwen35TaskProfile
 * @property {boolean} enableThinking
 * @property {number} defaultMaxTokens
 * @property {number} maxMaxTokens
 * @property {number} topP
 * @property {number} topK
 * @property {number} presencePenalty
 * @property {number} temperature
 */

/**
 * Sampling + max-token profile for Qwen 3.5/3.6 by task kind. Tasks
 * are inferred from the payload's `ai_system6_task_kind` field via
 * substring matching (case-insensitive). Returns a chat-friendly
 * default when no task family matches. Mirrors `qwen35TaskProfile`.
 *
 * @param {string} [taskKind]
 * @returns {Qwen35TaskProfile}
 */
function qwen35TaskProfile(taskKind = "") {
  const kind = String(taskKind || "chat").toLowerCase();
  if (/mingming/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 5200,
      maxMaxTokens: 5200,
      topP: 0.78,
      topK: 20,
      presencePenalty: 1.35,
      temperature: 0.55,
    };
  }
  if (/bureaucracy|meme|caption/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 1200,
      maxMaxTokens: 1200,
      topP: 0.8,
      topK: 20,
      presencePenalty: 1.5,
      temperature: 0.6,
    };
  }
  if (/dictation|speech|transcript/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 900,
      maxMaxTokens: 1200,
      topP: 0.72,
      topK: 16,
      presencePenalty: 1.15,
      temperature: 0.25,
    };
  }
  if (/organize-question-sheet|question-sheet/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 420,
      maxMaxTokens: 700,
      topP: 0.65,
      topK: 12,
      presencePenalty: 1.25,
      temperature: 0.35,
    };
  }
  if (/generate-outline/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 900,
      maxMaxTokens: 1100,
      topP: 0.68,
      topK: 16,
      presencePenalty: 1.35,
      temperature: 0.35,
    };
  }
  if (/writing-demo-rag/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 260,
      maxMaxTokens: 360,
      topP: 0.72,
      topK: 16,
      presencePenalty: 1.15,
      temperature: 0.35,
    };
  }
  if (/docmap|outline|draft|rebuild|writing_object|hkrr|slides|marp|critique|review|claim/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 2600,
      maxMaxTokens: 2600,
      topP: 0.7,
      topK: 20,
      presencePenalty: 1.5,
      temperature: 0.55,
    };
  }
  if (/endfield|rag|evidence/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: 1200,
      maxMaxTokens: 1400,
      topP: 0.75,
      topK: 20,
      presencePenalty: 1.2,
      temperature: 0.35,
    };
  }
  if (/translate|translation|dictionary|extract|reader|scrapbook|chat/.test(kind)) {
    return {
      enableThinking: false,
      defaultMaxTokens: /dictionary/.test(kind) ? 900 : 1600,
      maxMaxTokens: /dictionary/.test(kind) ? 900 : 1600,
      topP: 0.8,
      topK: 20,
      presencePenalty: 1.5,
      temperature: 0.35,
    };
  }
  return {
    enableThinking: false,
    defaultMaxTokens: 1600,
    maxMaxTokens: 1600,
    topP: 0.8,
    topK: 20,
    presencePenalty: 1.5,
    temperature: 0.55,
  };
}

/**
 * Gemma 4 uses standard chat roles, native system prompt support, and
 * the model-card sampling baseline temperature=1.0, top_p=0.95,
 * top_k=64. Keep the product's existing task token caps so local
 * writing flows remain bounded.
 *
 * @param {string} [taskKind]
 * @returns {Qwen35TaskProfile}
 */
function gemma4TaskProfile(taskKind = "") {
  const profile = qwen35TaskProfile(taskKind);
  return {
    ...profile,
    topP: 0.95,
    topK: 64,
    temperature: 1.0,
  };
}

/**
 * Apply Qwen 3.5/3.6 specific tuning to an OpenAI-compatible chat
 * payload: disable thinking, set sampling defaults from the task
 * profile, cap max_tokens at the profile maximum, and strip the
 * internal `ai_system6_task_kind` / `ai_system6_enable_thinking`
 * fields. Returns the payload unchanged for non-Qwen3.5 models.
 * Mirrors `tuneQwen35ChatPayload`.
 *
 * Note (carried from root): although qwen35TaskProfile reports an
 * `enableThinking` flag, this function always forces thinking off
 * (`requestedThinking = false`) regardless of task. Preserved.
 *
 * @param {any} payload
 * @returns {any}
 */
function tuneQwen35ChatPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (!isQwen35ModelName(payload.model)) return payload;
  const profile = qwen35TaskProfile(payload.ai_system6_task_kind);
  const nextPayload = { ...payload };
  const requestedThinking = false;

  nextPayload.chat_template_kwargs = {
    ...(payload.chat_template_kwargs || {}),
    enable_thinking: requestedThinking,
  };
  nextPayload.enable_thinking = requestedThinking;
  nextPayload.reasoning_effort = "none";
  if (!Number.isFinite(nextPayload.max_tokens)) {
    nextPayload.max_tokens = profile.defaultMaxTokens;
  } else if (Number.isFinite(profile.maxMaxTokens) && nextPayload.max_tokens > profile.maxMaxTokens) {
    nextPayload.max_tokens = profile.maxMaxTokens;
  }
  if (!Number.isFinite(nextPayload.temperature)) nextPayload.temperature = profile.temperature;
  if (!Number.isFinite(nextPayload.top_p)) nextPayload.top_p = profile.topP;
  if (!Number.isFinite(nextPayload.top_k)) nextPayload.top_k = profile.topK;
  if (!Number.isFinite(nextPayload.min_p)) nextPayload.min_p = 0;
  if (!Number.isFinite(nextPayload.presence_penalty)) nextPayload.presence_penalty = profile.presencePenalty;

  delete nextPayload.ai_system6_task_kind;
  delete nextPayload.ai_system6_enable_thinking;
  return nextPayload;
}

/**
 * Apply Gemma 4 specific tuning to an OpenAI-compatible local chat
 * payload. Gemma 4 supports native `system` role messages; thinking is
 * disabled for AI System 6 by omitting `<|think|>` and setting the
 * common no-thinking knobs used by local runtimes.
 *
 * @param {any} payload
 * @returns {any}
 */
function tuneGemma4ChatPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (!isGemma4ModelName(payload.model)) return payload;
  const profile = gemma4TaskProfile(payload.ai_system6_task_kind);
  const nextPayload = { ...payload };
  const gemmaMessages = isGemma4E4BModelName(payload.model)
    ? insertGemma4E4BAdapterMessage(payload.messages)
    : payload.messages;

  nextPayload.messages = mergeGemma4SystemMessages(gemmaMessages);

  nextPayload.chat_template_kwargs = {
    ...(payload.chat_template_kwargs || {}),
    enable_thinking: false,
  };
  nextPayload.enable_thinking = false;
  nextPayload.thinking = { type: "disabled" };
  nextPayload.reasoning_effort = "none";
  if (!Number.isFinite(nextPayload.max_tokens)) {
    nextPayload.max_tokens = profile.defaultMaxTokens;
  } else if (Number.isFinite(profile.maxMaxTokens) && nextPayload.max_tokens > profile.maxMaxTokens) {
    nextPayload.max_tokens = profile.maxMaxTokens;
  }
  if (!Number.isFinite(nextPayload.temperature)) nextPayload.temperature = profile.temperature;
  if (!Number.isFinite(nextPayload.top_p)) nextPayload.top_p = profile.topP;
  if (!Number.isFinite(nextPayload.top_k)) nextPayload.top_k = profile.topK;
  if (!Number.isFinite(nextPayload.min_p)) nextPayload.min_p = 0;
  if (!Number.isFinite(nextPayload.presence_penalty)) nextPayload.presence_penalty = profile.presencePenalty;

  delete nextPayload.ai_system6_task_kind;
  delete nextPayload.ai_system6_enable_thinking;
  return nextPayload;
}

/**
 * Generic local-model tuning for the product default: fast, bounded
 * responses with reasoning/thinking disabled. Family-specific tuners
 * may layer stricter or provider-specific fields on top.
 *
 * @param {any} payload
 * @param {{ stripInternalFields?: boolean }} [options]
 * @returns {any}
 */
function tuneLocalNoThinkingPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const profile = qwen35TaskProfile(payload.ai_system6_task_kind);
  const nextPayload = { ...payload };

  nextPayload.chat_template_kwargs = {
    ...(payload.chat_template_kwargs || {}),
    enable_thinking: false,
  };
  nextPayload.enable_thinking = false;
  nextPayload.thinking = { type: "disabled" };
  nextPayload.reasoning_effort = "none";
  if (!Number.isFinite(nextPayload.max_tokens)) {
    nextPayload.max_tokens = profile.defaultMaxTokens;
  } else if (Number.isFinite(profile.maxMaxTokens) && nextPayload.max_tokens > profile.maxMaxTokens) {
    nextPayload.max_tokens = profile.maxMaxTokens;
  }

  if (options.stripInternalFields !== false) {
    delete nextPayload.ai_system6_task_kind;
    delete nextPayload.ai_system6_enable_thinking;
  }
  return nextPayload;
}

/**
 * Top-level chat-payload tuner for local LM Studio targets. Product
 * default disables thinking for every local model; known model families
 * then receive family-specific sampling / template tweaks.
 *
 * @param {any} payload
 * @returns {any}
 */
function tuneLmStudioChatPayload(payload) {
  const sharedDefaults = sharedLocalChatDefaults(payload?.model, {
    taskKind: payload?.ai_system6_task_kind,
    temperature: Number(payload?.temperature),
  });
  const basePayload = tuneLocalNoThinkingPayload({ ...sharedDefaults, ...payload }, {
    stripInternalFields: !isQwen35ModelName(payload?.model) && !isGemma4ModelName(payload?.model),
  });
  return tuneGemma4ChatPayload(tuneQwen35ChatPayload(basePayload));
}

/**
 * Remove Gemma 4 thought/channel markers from visible output. Some
 * runtimes preserve an empty thought block when thinking is disabled
 * for larger Gemma 4 variants; user-facing history must keep only the
 * final answer.
 *
 * @param {string} text
 * @returns {string}
 */
function scrubVisibleModelOutput(text = "") {
  return sharedScrubVisibleModelOutput(text);
}

/**
 * Pull the visible model output from an OpenAI-compatible chat
 * completion response. Returns "" when neither shape is present.
 * Mirrors `modelContentFromChatData` from root server.js.
 *
 * @param {any} data
 * @returns {string}
 */
function modelContentFromChatData(data) {
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
}

module.exports = {
  applyChatTaskContract,
  enforceMarkdownOnlyChatPayload,
  isGemma4E4BModelName,
  isGemma4ModelName,
  isQwen35ModelName,
  gemma4TaskProfile,
  mergeGemma4SystemMessages,
  modelContentFromChatData,
  qwen35TaskProfile,
  scrubVisibleModelOutput,
  tuneGemma4ChatPayload,
  tuneLocalNoThinkingPayload,
  tuneQwen35ChatPayload,
  tuneLmStudioChatPayload,
};
