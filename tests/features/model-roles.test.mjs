// Model roles extend the task contract: normal mode keeps one default model;
// Advanced mode can assign Researcher / Writer / Critic / Utility models with
// a fallback. Every task resolves a role by kind and the run manifest records
// the actual model plus any fallback reason. No agent loops are introduced.

import { createRequire } from "node:module";
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("model-roles");
const require = createRequire(import.meta.url);
const taskRuntime = require("../../app/shared/model-task-runtime.js");
const roles = read("app/core/model-roles.js");
const manifest = read("scripts/runtime-manifest.mjs");
const chatMessages = read("app/core/chat-messages.js");
const index = read("index.html");

test.assertIncludes(manifest, '"app/core/model-roles.js"', "the model roles module is an eager runtime module");
test.assertIncludes(roles, "researcher", "the Researcher role exists");
test.assertIncludes(roles, "writer", "the Writer role exists");
test.assertIncludes(roles, "critic", "the Critic role exists");
test.assertIncludes(roles, "utility", "the Utility role exists");
test.assertIncludes(roles, "taskContractRegistry", "roles come from the registered task contracts");
test.assertNotIncludes(roles, "modelRolePatterns", "no second regex-based role classification remains");
test.assertIncludes(roles, "function resolveModelRoleForTask", "one function resolves role + model per task");
test.assertIncludes(roles, "fallbackReason", "fallback reasons are recorded");
test.assertIncludes(roles, "modelRoleStorageKey", "role model assignments persist");
test.assertIncludes(chatMessages, "ai_system6_model_role", "the model request carries the resolved role");
test.assertIncludes(chatMessages, "modelFallbackReason", "the run manifest records fallback reasons");
test.assertIncludes(index, 'id="role-model-researcher"', "the Control Panel exposes role model selectors");
test.assertIncludes(index, 'id="role-model-fallback"', "the Control Panel exposes a persisted fallback model");

const context = vm.createContext({
  window: { AISystem6ModelTaskRuntime: taskRuntime },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  getLocalModelRequestName: () => "default-model",
  isManualLocalModelMode: () => false,
  document: { getElementById: () => null },
  setSelectOptions: () => {},
  modelCatalog: [],
});
vm.runInContext(roles, context);

test.assert(context.modelRoleForTaskKind("source.extract-facts") === "researcher", "fact extraction uses the Researcher role");
test.assert(context.modelRoleForTaskKind("source.verify-claims") === "critic", "claim verification uses the Critic role");
test.assert(context.modelRoleForTaskKind("source.translate") === "utility", "translation uses the Utility role");
test.assert(context.modelRoleForTaskKind("writing.rewrite-selection") === "writer", "selection rewrites use the Writer role");
test.assert(
  context.modelRoleForTaskKind("generate-outline") === "default",
  "an unregistered task kind resolves to default, never to a word-guessed role"
);

const normal = context.resolveModelRoleForTask("writing.rewrite-selection");
test.assert(
  normal.role === "default" && normal.model === "default-model",
  "normal mode keeps one default model"
);

context.isManualLocalModelMode = () => true;
const withoutRole = context.resolveModelRoleForTask("writing.rewrite-selection");
test.assert(
  withoutRole.role === "writer" && withoutRole.model === "default-model" && /no model configured/.test(withoutRole.fallbackReason),
  "Advanced mode falls back with a recorded reason when the role has no model"
);

context.localStorage.getItem = () => JSON.stringify({ writer: "writer-model" });
const withRole = context.resolveModelRoleForTask("writing.rewrite-selection");
test.assert(
  withRole.role === "writer" && withRole.model === "writer-model" && withRole.fallbackReason === "",
  "Advanced mode uses the role model when configured"
);

context.localStorage.getItem = () => JSON.stringify({ fallback: "fallback-model" });
const withFallback = context.resolveModelRoleForTask("writing.rewrite-selection");
test.assert(
  withFallback.model === "fallback-model" && /no model configured/.test(withFallback.fallbackReason),
  "the persisted fallback replaces the chat model when a role has none"
);

test.finish();
