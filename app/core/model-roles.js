// Model roles for Advanced (manual) mode.
//
// Normal mode keeps one default model and reports role "default". Advanced
// mode (the "Allow manual model/API fields" toggle) can assign a separate
// model per role — Researcher, Writer, Critic, Utility — plus a fallback.
// Every task resolves a role from its task kind; the actual model and any
// fallback reason are recorded on the run manifest. No agent loops, no
// background tasks, no automatic submission.

const modelRoleStorageKey = "ai-system6-role-models";

const modelRolePatterns = [
  { role: "critic", pattern: /review|claim|critique|check|hkrr|mingming|risk/i },
  { role: "researcher", pattern: /search|reader|source|retrieve|research|find|clip|docmap|context/i },
  { role: "writer", pattern: /draft|outline|rewrite|expand|compress|continue|proofread|style|praise|writing|polish|suggest/i },
  { role: "utility", pattern: /translate|dictation|organize|ask|lookup|sideask|summarize|describe|utility|embed|chat|question/i },
];

const modelRoleNames = Object.freeze(["researcher", "writer", "critic", "utility", "fallback"]);

function modelRoleForTaskKind(taskKind = "") {
  const kind = String(taskKind || "").toLowerCase();
  for (const entry of modelRolePatterns) {
    if (entry.pattern.test(kind)) return entry.role;
  }
  return "default";
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
    const select = document.getElementById(`role-model-${role}`);
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
