// @ts-check
// Model roles for Advanced (manual) mode.
//
// Normal mode keeps one default model and reports role "default". Advanced
// mode (the "Allow manual model/API fields" toggle) can assign a separate
// model per role — Researcher, Writer, Critic, Utility — plus a fallback.
// Every task resolves a role from its task kind; the actual model and any
// fallback reason are recorded on the run manifest. No agent loops, no
// background tasks, no automatic submission.

const modelRoleStorageKey = "ai-system6-role-models";

const modelRoleNames = Object.freeze(["researcher", "writer", "critic", "utility", "fallback"]);

// Commands that cannot finish without reaching a model.
//
// The writing route used to leave every one of these enabled with no model
// connected. Pressing one could take a destructive confirmation first and then
// fail with the transport's own error string - so the writer's first impression
// of a route that works perfectly well without AI was that the product is
// broken. ClioTalk already answers this by disabling Send and saying why; this
// is the same answer, expressed once for the menus and the button rows.
//
// Membership means "issues a model request", not "is an AI feature": DocMap,
// See as Chart and Marp generation are local transforms and stay available.
const modelBackedActions = new Set([
  // Question Sheet
  "organize-question-sheet",
  "generate-outline",
  // Outline
  "mingming-outline",
  "structure-outline",
  "expand-outline",
  // Section Drafts
  "draft-current-section",
  "polish-draft",
  "suggest-draft",
  "eli5-rewrite-section",
  "eli5-review-section",
  // Manuscript
  "translate-teachtext",
  "print-to-ai",
  // Review Desk
  "review-style-section",
  "review-facts-section",
  "review-facts-section-online",
  "review-facts-online",
  "review-hkrr-section",
  "review-mingming-section",
  "review-mingming-handoff",
  "review-mingming-handoff-backstage",
  // Writing Tools and selection services
  "ai-praise",
  "ai-describe-change",
  "ai-proofread",
  "ai-rewrite",
  "ai-friendly",
  "ai-professional",
  "ai-concise",
  "ai-summary",
  "ai-key-points",
  "ai-list",
  "ai-table",
  "selection-translate",
]);

function actionNeedsModel(action) {
  return modelBackedActions.has(String(action || ""));
}

/**
 * Resolve a task's model role from its registered task contract. There is
 * exactly one classification source: taskContractRegistry. Unknown tasks
 * default to "default"; nothing is guessed from the task name's wording.
 */
function modelRoleForTaskKind(taskKind = "") {
  const contract = window.AISystem6ModelTaskRuntime?.taskContractRegistry?.require(taskKind);
  const role = contract?.modelRole;
  return typeof role === "string" && role ? role : "default";
}

function readModelRoleSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(modelRoleStorageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeModelRoleSettings(settings) {
  localStorage.setItem(modelRoleStorageKey, JSON.stringify(settings || {}));
}

function setModelRoleModel(role, modelId) {
  const next = { ...readModelRoleSettings() };
  next[String(role || "")] = String(modelId || "");
  writeModelRoleSettings(next);
  return next;
}

function resolveModelRoleForTask(taskKind, options = {}) {
  const roleModels = options.roleModels || readModelRoleSettings();
  const chatModel = String(options.fallback || (typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : "") || "");
  const fallback = String(roleModels.fallback || chatModel || "");
  const role = modelRoleForTaskKind(taskKind);
  const advanced = options.advanced ?? (typeof isManualLocalModelMode === "function" ? isManualLocalModelMode() : false);
  if (!advanced || role === "default") {
    return { model: fallback, role: "default", fallbackReason: "" };
  }
  const roleModel = String(roleModels[role] || "").trim();
  if (roleModel) {
    return { model: roleModel, role, fallbackReason: "" };
  }
  return { model: fallback, role, fallbackReason: `no model configured for role ${role}` };
}

function syncModelRoleSelects(catalog = modelCatalog) {
  modelRoleNames.forEach((role) => {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(`role-model-${role}`));
    if (!select) return;
    const previous = select.dataset.previous || readModelRoleSettings()[role] || "";
    setSelectOptions(select, Array.isArray(catalog) ? catalog : [], previous);
    select.dataset.previous = select.value;
  });
}

window.AISystem6ModelRoles = Object.freeze({
  roleForTaskKind: modelRoleForTaskKind,
  readSettings: readModelRoleSettings,
  setRoleModel: setModelRoleModel,
  resolveForTask: resolveModelRoleForTask,
  syncSelects: syncModelRoleSelects,
  roleNames: modelRoleNames,
});
