// Assistant Activity — a single source of truth for "what the AI is doing
// right now", derived only from real runtime events (model readiness, writing
// agent run transitions, long tasks, checkpoints, completion, failure,
// cancellation). It never invents states and never fakes a "Thinking…"
// animation. The appearance system is not consulted; surfaces consume the
// state through data-* hooks or subscribe().

const assistantActivityStates = Object.freeze(["offline", "idle", "reading", "working", "waiting", "ready", "error"]);
const assistantActivityStaleRunMs = 5 * 60 * 1000;
const assistantActivityStaleCheckMs = 30 * 1000;
const assistantActivityReadyClearMs = 4000;

const activityListeners = new Set();
let activityState = {
  state: "idle",
  labelKey: "",
  runId: "",
  projectId: "",
  ownerAppId: "",
  targetObjectId: "",
  startedAt: "",
  cancellable: false,
  bringToFrontTarget: "",
  lastTransitionAt: 0,
};
let modelReadyOverride = null;
let modelReadySource = null;
let activeOperation = null;
let staleCheckTimer = null;
let readyClearTimer = null;

function activityLabelKey(state) {
  return `activity_${state}`;
}

function activityModelReady() {
  if (modelReadyOverride !== null) return modelReadyOverride === true;
  if (typeof modelReadySource === "function") return modelReadySource() === true;
  return false;
}

function cloneActivityState(state) {
  return { ...state };
}

function emitActivity() {
  activityListeners.forEach((listener) => {
    try {
      listener(cloneActivityState(activityState));
    } catch (error) {
      console.warn("Assistant activity listener failed.", error);
    }
  });
}

function scheduleStaleCheck() {
  if (staleCheckTimer || typeof setInterval !== "function") return;
  staleCheckTimer = setInterval(() => {
    checkStaleActivity();
  }, assistantActivityStaleCheckMs);
}

function clearReadyTimer() {
  if (readyClearTimer && typeof clearTimeout === "function") {
    clearTimeout(readyClearTimer);
    readyClearTimer = null;
  }
}

function transitionActivity(nextState, meta = {}) {
  const now = Date.now();
  activityState = {
    ...activityState,
    ...meta,
    state: assistantActivityStates.includes(nextState) ? nextState : "idle",
    labelKey: meta.labelKey !== undefined && meta.labelKey !== ""
      ? meta.labelKey
      : activityLabelKey(nextState),
    lastTransitionAt: now,
  };
  if (nextState === "error") activityState.cancellable = false;
  clearReadyTimer();
  if (nextState === "ready") {
    readyClearTimer = typeof setTimeout === "function" ? setTimeout(() => {
      if (activityState.state === "ready" && !activeOperation) {
        transitionActivity(activityModelReady() ? "idle" : "offline", { runId: "" });
      }
    }, assistantActivityReadyClearMs) : null;
  }
  emitActivity();
  scheduleStaleCheck();
  return cloneActivityState(activityState);
}

function ownerForRun(run = {}) {
  const taskKind = String(run.taskKind || "").toLowerCase();
  if (taskKind === "reader") return { ownerAppId: "reader", windowName: "reader" };
  if (taskKind === "scrapbook") return { ownerAppId: "scrapbook", windowName: "scrapbook" };
  if (taskKind === "docmap-question") return { ownerAppId: "teachText", windowName: "questionSheet" };
  return { ownerAppId: "clioTalk", windowName: "assistant" };
}

function getAssistantActivity() {
  const derived = { ...activityState };
  if (!derived.runId && !activeOperation && !activityModelReady()) {
    derived.state = "offline";
    derived.labelKey = activityLabelKey("offline");
    derived.cancellable = false;
  }
  return cloneActivityState(derived);
}

function reportModelReady(ready) {
  modelReadyOverride = ready === true;
  if (!activityState.runId && !activeOperation) {
    transitionActivity(modelReadyOverride ? "idle" : "offline", { runId: "", cancellable: false });
  } else {
    emitActivity();
  }
  return getAssistantActivity();
}

function setModelReadySource(source) {
  modelReadySource = typeof source === "function" ? source : null;
  if (!activityState.runId && !activeOperation) {
    transitionActivity(activityModelReady() ? "idle" : "offline", { runId: "", cancellable: false });
  }
  return getAssistantActivity();
}

const runTransitionActivityMap = Object.freeze({
  preparing: "working",
  retrieving: "reading",
  generating: "working",
  awaitingCommit: "waiting",
  committed: "ready",
  aborted: "idle",
  failed: "error",
});

function reportRunTransition(run = {}, transition = "") {
  const stateName = String(transition || run.state || "");
  const nextState = runTransitionActivityMap[stateName] || "working";
  const owner = ownerForRun(run);
  return transitionActivity(nextState, {
    runId: String(run.id || ""),
    projectId: String(run.projectId || ""),
    ownerAppId: owner.ownerAppId,
    targetObjectId: run.sourceScope?.sourceIds?.[0] || run.targetObjectId || "",
    startedAt: run.startedAt || "",
    cancellable: !["committed", "aborted", "failed"].includes(stateName),
    bringToFrontTarget: owner.windowName,
  });
}

function beginOperation(meta = {}) {
  const operation = {
    runId: String(meta.runId || runReceiptUuidLike("op")),
    projectId: String(meta.projectId || ""),
    ownerAppId: String(meta.ownerAppId || ""),
    windowName: String(meta.windowName || ""),
    targetObjectId: String(meta.targetObjectId || ""),
    labelKey: String(meta.labelKey || ""),
    cancellable: meta.cancellable === true,
    cancel: typeof meta.cancel === "function" ? meta.cancel : null,
    startedAt: new Date().toISOString(),
  };
  activeOperation = operation;
  transitionActivity(String(meta.state || "working"), {
    runId: operation.runId,
    projectId: operation.projectId,
    ownerAppId: operation.ownerAppId,
    targetObjectId: operation.targetObjectId,
    startedAt: operation.startedAt,
    cancellable: operation.cancellable,
    bringToFrontTarget: operation.windowName,
    labelKey: operation.labelKey || activityLabelKey("working"),
  });
  return cloneActivityState(operation);
}

function endOperation(handle, { ok = true, error = null } = {}) {
  if (!activeOperation) return getAssistantActivity();
  if (handle && String(handle.runId || "") !== String(activeOperation.runId || "")) {
    return getAssistantActivity();
  }
  const cancelled = error?.name === "AbortError";
  const finishedOperation = activeOperation;
  activeOperation = null;
  if (cancelled) {
    return transitionActivity("idle", {
      runId: "",
      ownerAppId: finishedOperation.ownerAppId,
      targetObjectId: "",
      startedAt: "",
      cancellable: false,
      bringToFrontTarget: "",
      labelKey: activityLabelKey("idle"),
    });
  }
  return transitionActivity(ok ? "ready" : "error", {
    runId: "",
    ownerAppId: finishedOperation.ownerAppId,
    targetObjectId: "",
    startedAt: "",
    cancellable: false,
    bringToFrontTarget: "",
  });
}

function cancelActiveRun() {
  if (!activeOperation || !activeOperation.cancellable) {
    return { ok: false, reason: "not-cancellable" };
  }
  if (typeof activeOperation.cancel === "function") {
    activeOperation.cancel();
  } else if (typeof activeAbortController?.abort === "function") {
    activeAbortController.abort();
  }
  return { ok: true };
}

function bringActivityToFront() {
  const target = activityState.bringToFrontTarget || "";
  if (target && typeof openWindow === "function") {
    openWindow(target);
    return { ok: true, target };
  }
  const owner = activityState.ownerAppId || activeOperation?.ownerAppId || "";
  if (owner && typeof bringAppToFront === "function") {
    bringAppToFront(owner);
    return { ok: true, target: owner };
  }
  return { ok: false, reason: "no-target" };
}

function checkStaleActivity(now = Date.now()) {
  if (!["working", "reading", "waiting"].includes(activityState.state)) return false;
  if (!activityState.lastTransitionAt) return false;
  if (now - activityState.lastTransitionAt < assistantActivityStaleRunMs) return false;
  activeOperation = null;
  transitionActivity("error", {
    runId: "",
    cancellable: false,
    labelKey: "activity_interrupted",
  });
  return true;
}

function clearActivity(reason = "") {
  activeOperation = null;
  return transitionActivity(activityModelReady() ? "idle" : "offline", {
    runId: "",
    projectId: "",
    ownerAppId: "",
    targetObjectId: "",
    startedAt: "",
    cancellable: false,
    bringToFrontTarget: "",
    labelKey: reason ? `activity_${reason}` : "",
  });
}

function resetForProject(projectId) {
  activeOperation = null;
  return transitionActivity(activityModelReady() ? "idle" : "offline", {
    runId: "",
    projectId: String(projectId || ""),
    ownerAppId: "",
    targetObjectId: "",
    startedAt: "",
    cancellable: false,
    bringToFrontTarget: "",
  });
}

function subscribeAssistantActivity(listener) {
  if (typeof listener !== "function") return () => {};
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

function runReceiptUuidLike(prefix) {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function attachActivitySurface(el) {
  if (!el) return () => {};
  const apply = () => {
    const state = getAssistantActivity();
    el.dataset.assistantState = state.state;
    el.dataset.runState = state.state;
    el.dataset.activity = state.labelKey || state.state;
    if (state.runId) el.dataset.activityRunId = state.runId;
    else delete el.dataset.activityRunId;
    if (typeof t === "function" && state.labelKey) {
      el.setAttribute("aria-label", t(state.labelKey));
    } else {
      el.setAttribute("aria-label", state.state);
    }
  };
  apply();
  return subscribeAssistantActivity(apply);
}

window.AISystem6AssistantActivity = Object.freeze({
  states: assistantActivityStates,
  staleRunMs: assistantActivityStaleRunMs,
  getState: getAssistantActivity,
  subscribe: subscribeAssistantActivity,
  reportModelReady,
  setModelReadySource,
  reportRunTransition,
  beginOperation,
  endOperation,
  cancelActiveRun,
  bringToFront: bringActivityToFront,
  checkStale: checkStaleActivity,
  clearActivity,
  resetForProject,
  attachActivitySurface,
});
