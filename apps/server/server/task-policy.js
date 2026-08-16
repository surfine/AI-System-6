// One source of truth for how a task kind is run on the cloud.
//
// Model tier, thinking on/off, reasoning effort, and the output budget used
// to be decided in three different files (`responses.js` held the effort
// table, `routes/cloud-chat.js` held the thinking whitelist, the browser held
// `cloudTaskMaxTokens`). They are one decision, and splitting them hid a real
// failure: DeepSeek counts reasoning tokens inside `max_tokens`, so a budget
// sized for the answer alone let the thinking chain consume the whole
// allowance and return an empty message with `finish_reason: "length"`.
//
// Measured on 2026-08-14 against the live API (same review task, max_tokens
// 1800): v4-pro at low or medium effort returned 0 characters twice each;
// v4-flash at medium returned 0 characters twice; v4-flash at low spent ~220
// reasoning tokens and answered in full. With thinking disabled every model
// answered in full. So the budget has to be `answer + reasoning`, and the
// heavy analysis kinds belong on the model that can actually finish them.

"use strict";

// The app decides all four by task type. It
// never exposes the choice to the user: the desktop stays quiet, and no
// surface grows an AI control a writer must reason about mid-sentence.

const FAST_MODEL = "deepseek-v4-flash";
const DEEP_MODEL = "deepseek-v4-pro";

// The browser sends this instead of a model id when the user leaves the
// cloud model on 自动 / Automatic. The server resolves it per task, so the
// desktop never grows a per-task model control.
const AUTO_MODEL_ID = "auto";

// Reasoning headroom per effort tier, on top of the answer budget. These are
// caps, not reservations: unused tokens are never billed. They are sized from
// observed reasoning spend plus margin, because a truncated thinking chain
// costs the full budget and returns nothing.
const REASONING_ALLOWANCE = Object.freeze({
  none: 0,
  minimal: 600,
  low: 1200,
  medium: 2400,
  high: 5000,
  xhigh: 8000,
  max: 12000,
});

/**
 * @typedef {Object} TaskPolicy
 * @property {"fast" | "deep"} tier          Which model the task wants.
 * @property {boolean} thinking              Chat Completions thinking switch.
 * @property {string} effort                 Reasoning effort for both APIs.
 * @property {number} answerBudget           Tokens the answer itself needs.
 */

/** @type {Record<string, TaskPolicy>} */
const TASK_POLICY = Object.freeze({
  // Instant surfaces: no chain of thought, latency is the product.
  chat: { tier: "fast", thinking: false, effort: "none", answerBudget: 1800 },
  sideask: { tier: "fast", thinking: false, effort: "none", answerBudget: 520 },
  dictation: { tier: "fast", thinking: false, effort: "none", answerBudget: 900 },
  lookup: { tier: "fast", thinking: false, effort: "none", answerBudget: 900 },
  dictionary: { tier: "fast", thinking: false, effort: "none", answerBudget: 900 },
  reader: { tier: "fast", thinking: false, effort: "none", answerBudget: 520 },
  scrapbook: { tier: "fast", thinking: false, effort: "none", answerBudget: 520 },

  // Grounded synthesis: the search results carry the work, so light thinking
  // on the Responses path and none on the chat path.
  answer: { tier: "fast", thinking: false, effort: "minimal", answerBudget: 800 },
  clio: { tier: "fast", thinking: false, effort: "minimal", answerBudget: 800 },
  translation: { tier: "fast", thinking: false, effort: "minimal", answerBudget: 1800 },
  subtitle: { tier: "fast", thinking: false, effort: "minimal", answerBudget: 1800 },
  claim: { tier: "fast", thinking: false, effort: "low", answerBudget: 2600 },

  // Structured writing synthesis: light reasoning pays off and the fast model
  // keeps more of the writer's own roughness.
  docmap: { tier: "fast", thinking: true, effort: "low", answerBudget: 2600 },
  outline: { tier: "fast", thinking: true, effort: "low", answerBudget: 2600 },
  draft: { tier: "fast", thinking: true, effort: "low", answerBudget: 2600 },

  // Heavier analysis. The fast model spends its whole budget thinking here
  // and returns nothing, so these are the tasks worth the deep model.
  review: { tier: "deep", thinking: true, effort: "medium", answerBudget: 2600 },
  thesis: { tier: "deep", thinking: true, effort: "medium", answerBudget: 2600 },
  hkrr: { tier: "deep", thinking: true, effort: "medium", answerBudget: 2600 },

  // Named surfaces with their own budgets.
  mingming: { tier: "fast", thinking: false, effort: "none", answerBudget: 5200 },
  bureaucracy: { tier: "fast", thinking: false, effort: "none", answerBudget: 1200 },
});

const DEFAULT_POLICY = Object.freeze({
  tier: /** @type {"fast"} */ ("fast"),
  thinking: false,
  effort: "low",
  answerBudget: 1800,
});

// Runtime task kinds are not always the bare key: Quick Draft sends
// `quick-draft-<stage>`, DocMap sends `docmap-question`. The browser has
// always matched these by pattern, so the server does too — an exact key
// wins first, then the first matching pattern, then the default.
/** @type {ReadonlyArray<readonly [RegExp, string]>} */
const TASK_PATTERNS = Object.freeze([
  [/docmap-question/, "sideask"],
  [/clio-stage/, "sideask"],
  [/hkrr/, "hkrr"],
  // Claim verification is checked before the surface it runs inside, so
  // `outline_claim` stays a verification task rather than outline writing.
  [/claim/, "claim"],
  [/review|critique/, "review"],
  [/thesis/, "thesis"],
  [/docmap/, "docmap"],
  [/outline/, "outline"],
  [/draft|rebuild|writing_object|slides|marp/, "draft"],
  [/subtitle|srt/, "subtitle"],
  [/translation|translate/, "translation"],
  [/dictionary/, "dictionary"],
  [/meme|caption|bureaucracy/, "bureaucracy"],
  [/mingming/, "mingming"],
  [/sideask|reader|scrapbook/, "sideask"],
  [/dictation/, "dictation"],
]);

/**
 * @param {unknown} taskKind
 * @returns {string}
 */
function normalizeTaskKind(taskKind) {
  return String(taskKind || "chat").toLowerCase().trim();
}

/**
 * Resolve the policy key a runtime task kind belongs to.
 *
 * @param {unknown} taskKind
 * @returns {string}
 */
function taskPolicyKey(taskKind) {
  const kind = normalizeTaskKind(taskKind);
  if (Object.prototype.hasOwnProperty.call(TASK_POLICY, kind)) return kind;
  for (const [pattern, key] of TASK_PATTERNS) {
    if (pattern.test(kind)) return key;
  }
  return "";
}

/**
 * The full run policy for a task kind.
 *
 * @param {unknown} taskKind
 * @returns {TaskPolicy & { key: string, reasoningAllowance: number, maxTokens: number }}
 */
function resolveTaskPolicy(taskKind) {
  const key = taskPolicyKey(taskKind);
  const policy = key ? TASK_POLICY[key] : DEFAULT_POLICY;
  const reasoningAllowance = policy.thinking
    ? (REASONING_ALLOWANCE[policy.effort] ?? REASONING_ALLOWANCE.low)
    : 0;
  return {
    key: key || "chat",
    tier: policy.tier,
    thinking: policy.thinking,
    effort: policy.effort,
    answerBudget: policy.answerBudget,
    reasoningAllowance,
    maxTokens: policy.answerBudget + reasoningAllowance,
  };
}

/**
 * Reasoning effort for a task kind. Kept as its own export because the
 * Responses API path picks an effort without any of the chat-side fields.
 *
 * @param {unknown} taskKind
 * @returns {string}
 */
function taskReasoningEffort(taskKind) {
  return resolveTaskPolicy(taskKind).effort;
}

/**
 * Whether a model id is the automatic sentinel rather than a real model.
 *
 * @param {unknown} model
 * @returns {boolean}
 */
function isAutoModelId(model) {
  const candidate = String(model || "").trim().toLowerCase();
  return candidate === AUTO_MODEL_ID || candidate === "deepseek-auto";
}

/**
 * Resolve the automatic model choice for a task kind. Only DeepSeek knows
 * these two tiers, so callers must not apply this to a custom endpoint.
 *
 * @param {unknown} taskKind
 * @returns {string}
 */
function autoModelForTask(taskKind) {
  return resolveTaskPolicy(taskKind).tier === "deep" ? DEEP_MODEL : FAST_MODEL;
}

/**
 * Cost weight against the shared allowance. DeepSeek prices v4-pro at three
 * times v4-flash on both cache-missed input and output, before and after the
 * 2026-08-17 peak/off-peak change, so one weight covers both.
 *
 * @param {unknown} model
 * @returns {number}
 */
function cloudModelBudgetWeight(model) {
  return String(model || "").trim().toLowerCase().includes("v4-pro") ? 3 : 1;
}

module.exports = {
  AUTO_MODEL_ID,
  DEEP_MODEL,
  FAST_MODEL,
  REASONING_ALLOWANCE,
  TASK_POLICY,
  autoModelForTask,
  cloudModelBudgetWeight,
  isAutoModelId,
  normalizeTaskKind,
  resolveTaskPolicy,
  taskPolicyKey,
  taskReasoningEffort,
};
