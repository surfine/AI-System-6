// The local model monitor.
//
// Owns: the readiness poll for the writer's local model server - when it runs,
// how often, what it does while the page is hidden, and the one request that
// may be in flight at a time.
//
// Depends on: the local model client (window.AISystem6LocalLMStudio), the desk
// model state and control handles, and the page's visibility. It does not own
// saving, the write lease, or any cross-window protocol: those live in
// persistence-status.js, and this file was split out of it so a change to
// polling cannot reach into the save path.
//
// Entry points: refreshLocalModelReadiness() (a single check) and
// startLocalModelMonitor() (the schedule, started once the desk is ready).
// Behaviour is covered by tests/features/local-model-monitor.test.mjs.

async function refreshLocalModelReadiness() {
  if (!localLmStudioConnectionEnabled) return null;
  if (localModelState.running) return null;
  if (!modelInput.value.trim()) return null;
  try {
    const data = await window.AISystem6LocalLMStudio.listModels();
    const chatModels = Array.isArray(data.chatModels) ? data.chatModels : Array.isArray(data.models) ? data.models : [];
    const embeddingModels = Array.isArray(data.embeddingModels) ? data.embeddingModels : [];
    setModelPickerOptions(chatModels, embeddingModels);
    const loadedModel = syncLoadedLocalModel(data, chatModels);
    const selectedModel = findMatchingModel(chatModels, modelInput.value.trim());
    const autoLoadReady = !!(data.autoLoad && selectedModel);
    const loadedMatchesSelected = !!(loadedModel && selectedModel && (
      loadedModel.id === selectedModel.id || loadedModel.name === selectedModel.name
    ));
    const matched = selectedModel || loadedModel;
    if (matched) {
      updateContextMaxForCurrentModel();
      updateLocalModelState({ server: true, models: true, selected: true, loaded: loadedMatchesSelected || autoLoadReady, ready: loadedMatchesSelected || autoLoadReady, running: false, task: "" });
    } else if (chatModels.length) {
      updateLocalModelState({ server: true, models: true, selected: true, loaded: false, ready: false, running: false, task: "" });
    }
    renderLocalConnectionStatus("ready", data);
    return true;
  } catch (error) {
    renderLocalConnectionStatus(localConnectionErrorKey(error));
    // Leave saved settings intact; the next model action will report any connection issue.
    return false;
  }
}

function shouldMonitorLocalModelState() {
  return !!modelInput.value.trim()
    || !getWindow("control")?.classList.contains("is-hidden")
    || !getWindow("systemStatus")?.classList.contains("is-hidden");
}

// Local model readiness polling.
//
// The panel has to notice when a local server becomes reachable, and it used
// to ask every five seconds no matter what: a fixed interval that could
// overlap its own request (a slow `listModels` got a second one five seconds
// later), that kept asking while the page was in the background, and that
// never let a server that is simply not running rest.
//
// The rules now: one request at a time, the next check scheduled only once the
// previous one has settled, no polling at all while the page is hidden, a
// longer idle interval when no surface is asking, a bounded backoff while the
// endpoint is unreachable, and one refresh the moment the page comes back.
const localModelMonitorIntervalMs = 5000;
const localModelMonitorIdleMs = 30000;
const localModelMonitorMaxBackoffMs = 60000;
let localModelMonitorTimer = 0;
let localModelMonitorStarted = false;
let localModelMonitorBackoffMs = localModelMonitorIntervalMs;
/** @type {Promise<any> | null} */
let localModelReadinessInFlight = null;

/**
 * Ask for a readiness refresh, at most once at a time. A caller that arrives
 * while one is running joins that request instead of starting a second.
 */
function requestLocalModelReadiness() {
  if (localModelReadinessInFlight) return localModelReadinessInFlight;
  localModelReadinessInFlight = Promise.resolve()
    .then(() => refreshLocalModelReadiness())
    .catch(() => false)
    .finally(() => { localModelReadinessInFlight = null; });
  return localModelReadinessInFlight;
}

function scheduleLocalModelMonitor(delayMs) {
  clearTimeout(localModelMonitorTimer);
  localModelMonitorTimer = setTimeout(runLocalModelMonitorTick, Math.max(0, delayMs));
  return localModelMonitorTimer;
}

function runLocalModelMonitorTick() {
  if (document.visibilityState === "hidden") {
    // Nothing on this page is watching, and a background tab asking a server
    // for its model list every few seconds is cost with no reader.
    localModelMonitorTimer = 0;
    return;
  }
  if (!shouldMonitorLocalModelState()) {
    scheduleLocalModelMonitor(localModelMonitorIdleMs);
    return;
  }
  requestLocalModelReadiness().then((ok) => {
    localModelMonitorBackoffMs = ok === false
      ? Math.min(localModelMonitorMaxBackoffMs, Math.max(localModelMonitorIntervalMs, localModelMonitorBackoffMs * 2))
      : localModelMonitorIntervalMs;
    scheduleLocalModelMonitor(localModelMonitorBackoffMs);
  });
}

function startLocalModelMonitor() {
  if (localModelMonitorStarted) return localModelMonitorTimer;
  localModelMonitorStarted = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Stop the schedule while hidden; the return brings it back.
      clearTimeout(localModelMonitorTimer);
      localModelMonitorTimer = 0;
      return;
    }
    // The first look after coming back is the one that is certainly stale.
    localModelMonitorBackoffMs = localModelMonitorIntervalMs;
    runLocalModelMonitorTick();
  });
  runLocalModelMonitorTick();
  return localModelMonitorTimer;
}
