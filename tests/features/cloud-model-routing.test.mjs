// Automatic cloud model choice.
//
// The Control Panel offers one 自动 / Automatic entry and the server decides
// per task: heavy analysis on DeepSeek V4 Pro, everything else on V4 Flash.
// The same table decides whether the task thinks, how hard, and how much
// budget the answer needs on top of the thinking chain — measured against the
// live API on 2026-08-14, a budget sized for the answer alone lets the
// thinking chain eat all of it and return an empty message.

import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("cloud-model-routing");
const policy = require("../../apps/server/server/task-policy.js");

const cloudRoute = read("apps/server/server/routes/cloud-chat.js");
const sharedBudget = read("apps/server/server/shared-cloud-budget.js");
const cloudModel = read("app/features/cloud-model.js");
const chatMessages = read("app/core/chat-messages.js");
const responses = read("apps/server/server/responses.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- the routing decision itself -------------------------------------------

test.assert(policy.autoModelForTask("critique") === "deepseek-v4-pro", "Review Desk's critique runs on the deep model");
test.assert(policy.autoModelForTask("hkrr") === "deepseek-v4-pro", "HKRR review runs on the deep model");
test.assert(policy.autoModelForTask("draft-section") === "deepseek-v4-flash", "section drafts stay on the fast model, which keeps more of the writer's roughness");
test.assert(policy.autoModelForTask("chat") === "deepseek-v4-flash", "conversation stays on the fast model");
test.assert(policy.autoModelForTask("generate-outline") === "deepseek-v4-flash", "outline generation stays on the fast model");

// Runtime kinds are not bare keys: Quick Draft sends `quick-draft-<stage>`,
// the Outline sends `outline_<mode>`. An unmatched kind must not silently
// inherit an expensive policy.
test.assert(policy.resolveTaskPolicy("quick-draft-thesis").key === "thesis", "Quick Draft's thesis stage resolves to the thesis policy");
test.assert(policy.resolveTaskPolicy("outline_critique").key === "review", "the Outline's critique mode resolves to the review policy");
test.assert(policy.resolveTaskPolicy("outline_claim").key === "claim", "claim verification is not mistaken for outline writing");
test.assert(policy.resolveTaskPolicy("an-unknown-surface").tier === "fast", "an unknown task kind falls back to the fast model");
test.assert(policy.resolveTaskPolicy("an-unknown-surface").thinking === false, "an unknown task kind does not start thinking on its own");

// --- the budget contract ---------------------------------------------------

const reviewPolicy = policy.resolveTaskPolicy("critique");
test.assert(
  reviewPolicy.thinking && reviewPolicy.reasoningAllowance > 0,
  "a thinking task reserves headroom for the reasoning chain"
);
test.assert(
  reviewPolicy.maxTokens === reviewPolicy.answerBudget + reviewPolicy.reasoningAllowance,
  "the request budget is the answer budget plus the thinking headroom"
);
test.assert(
  policy.resolveTaskPolicy("chat").reasoningAllowance === 0,
  "a task that does not think reserves no thinking headroom"
);
test.assertIncludes(
  cloudRoute,
  "answerBudget + reasoningAllowance",
  "the cloud route sends the answer budget plus the thinking headroom"
);
test.assertIncludes(
  sharedBudget,
  "reasoningAllowance",
  "the shared allowance keeps the answer budget clear of the thinking headroom"
);

// --- cost ------------------------------------------------------------------

test.assert(policy.cloudModelBudgetWeight("deepseek-v4-pro") === 3, "the deep model costs the shared allowance three times as much");
test.assert(policy.cloudModelBudgetWeight("deepseek-v4-flash") === 1, "the fast model is the unit of the shared allowance");
test.assertIncludes(cloudRoute, "cloudModelBudgetWeight(payload.model)", "the shared reservation is weighted by the model that will run");
test.assertIncludes(chatMessages, "CLOUD_PRICING_PROMO_END_MS", "the cost estimate knows when the promotional rate ends");
test.assertIncludes(chatMessages, "function cloudPricingBand", "the cost estimate picks the peak or off-peak band");
test.assertIncludes(chatMessages, "modelName || cloudConfig.model", "the cost estimate prices the model that actually ran");

// --- the control -----------------------------------------------------------

test.assertIncludes(cloudModel, 'AUTO_CLOUD_MODEL_ID = "auto"', "the browser has one sentinel for the automatic choice");
test.assertIncludes(cloudModel, 'option.dataset.i18n = "cloud_model_auto"', "the automatic entry is a localized option in the existing model select");
test.assertIncludes(cloudModel, "supportsAuto ? AUTO_CLOUD_MODEL_ID : cloudModels[0].id", "automatic is the default when the provider offers both tiers");
test.assertIncludes(en, "cloud_model_auto:", "English names the automatic setting");
test.assertIncludes(zh, "cloud_model_auto:", "Chinese names the automatic setting");
test.assertIncludes(
  cloudRoute,
  "auto_model_unavailable",
  "a custom endpoint says so instead of pretending to route between tiers"
);

// --- honesty ---------------------------------------------------------------

test.assertIncludes(
  cloudRoute,
  "reasoning_budget_exhausted",
  "a thinking chain that ate the whole budget is named, never returned as a blank answer"
);
test.assertIncludes(
  cloudRoute,
  "function retryWithoutThinking",
  "the budget failure is retried without thinking before it is reported"
);
test.assertIncludes(
  responses,
  "deepseek-v4-pro",
  "the Responses API accepts the deep model too"
);

test.finish();
