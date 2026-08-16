// Browser capabilities exposed as ordinary, optional product actions.

let deferredWebInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredWebInstallPrompt = event;
  syncWebInstallUi();
});

window.addEventListener("appinstalled", () => {
  deferredWebInstallPrompt = null;
  syncWebInstallUi();
});

function isIosWebPlatform() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || navigator["standalone"] === true;
}

function syncWebInstallUi() {
  const button = document.querySelector("[data-action='install-web-app']");
  const hint = document.getElementById("web-install-hint");
  const standalone = isStandaloneWebApp();
  // iPhone and iPad have no install prompt to offer, so the Share steps are
  // written out instead of hidden behind a button the platform cannot honour.
  const iosSteps = !standalone && !deferredWebInstallPrompt && isIosWebPlatform();
  if (button) button.hidden = standalone || iosSteps || !deferredWebInstallPrompt;
  if (hint) {
    if (standalone) {
      hint.textContent = t("web_install_installed");
      hint.hidden = false;
    } else if (iosSteps) {
      hint.textContent = t("web_install_ios_steps");
      hint.hidden = false;
    }
  }
  const canShare = typeof navigator.share === "function";
  document.querySelectorAll("[data-web-share-action]").forEach((button) => {
    button.hidden = !canShare;
  });
}

async function installWebApp() {
  const hint = document.getElementById("web-install-hint");
  if (deferredWebInstallPrompt) {
    const prompt = deferredWebInstallPrompt;
    deferredWebInstallPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    const key = choice?.outcome === "accepted" ? "web_install_accepted" : "web_install_dismissed";
    if (hint) {
      hint.textContent = t(key);
      hint.hidden = false;
    }
    syncWebInstallUi();
    return choice?.outcome === "accepted";
  }
  const key = isIosWebPlatform() ? "web_install_ios_steps" : "web_install_unavailable";
  if (hint) {
    hint.textContent = t(key);
    hint.hidden = false;
  }
  setStatus(t(key), { notify: false });
  return false;
}

function formatStorageBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function projectStorageSnapshot() {
  if (!navigator.storage) return { supported: false, persistent: false, usage: 0, quota: 0 };
  const [persistent, estimate] = await Promise.all([
    navigator.storage.persisted?.().catch(() => false) || false,
    navigator.storage.estimate?.().catch(() => ({})) || {},
  ]);
  return {
    supported: true,
    persistent: !!persistent,
    usage: Number(estimate?.usage) || 0,
    quota: Number(estimate?.quota) || 0,
  };
}

async function renderProjectStorageStatus() {
  const value = document.getElementById("status-project-storage");
  const button = document.getElementById("keep-projects-on-device");
  if (!value && !button) return null;
  const snapshot = await projectStorageSnapshot();
  if (!snapshot.supported) {
    if (value) value.textContent = t("project_storage_unavailable");
    if (button) button.hidden = true;
    return snapshot;
  }
  const nearLimit = snapshot.quota > 0 && snapshot.usage / snapshot.quota >= 0.8;
  if (value) value.textContent = snapshot.persistent
    ? t("project_storage_persistent")
    : nearLimit
      ? t("project_storage_near_limit", formatStorageBytes(snapshot.usage), formatStorageBytes(snapshot.quota))
      : t("project_storage_managed");
  if (button) button.hidden = snapshot.persistent;
  return snapshot;
}

async function requestPersistentProjectStorage() {
  if (!navigator.storage?.persist) {
    setStatus(t("project_storage_unavailable"));
    return false;
  }
  const granted = await navigator.storage.persist().catch(() => false);
  await renderProjectStorageStatus();
  setStatus(t(granted ? "project_storage_persistent" : "project_storage_not_granted"), { notify: false });
  return granted;
}

// ---- One exit for finished material ---------------------------------------
//
// Markdown, JSON backups, PNG, USDZ, and every other artifact used to leave
// through a private copy of the same eight lines in each window: build a
// Blob, make an <a download>, click it, revoke the URL. A separate share path
// existed for Markdown only. Both halves live here now.
//
// The share sheet is used when the platform can really share the file;
// otherwise the artifact is saved. Nothing reports a share or a save the
// browser did not perform: a cancelled sheet returns method "cancel" and
// writes nothing.
//
// This is the outgoing half only. AI System 6 cannot appear as a destination
// in another app's share sheet — WebKit has never shipped Web Share Target —
// so material comes back in through the file picker, drag and drop, paste, or
// the Reader address field.

// Canvas exports arrive as data URLs; decode them here so a PNG leaves
// through the same exit as Markdown.
function artifactBlobFromDataUrl(dataUrl) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!match) return null;
  const type = match[1] || "application/octet-stream";
  if (!match[2]) return new Blob([decodeURIComponent(match[3])], { type });
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function artifactFileFrom({ file = null, blob = null, dataUrl = "", text = "", fileName = "", mimeType = "" } = {}) {
  if (typeof File !== "function") return null;
  if (file instanceof File) return file;
  const source = blob instanceof Blob ? blob : (dataUrl ? artifactBlobFromDataUrl(dataUrl) : null);
  const type = mimeType || source?.type || "text/plain";
  const name = String(fileName || file?.name || "artifact").trim() || "artifact";
  if (source) return new File([source], name, { type });
  const body = String(text || "");
  if (!body) return null;
  return new File([body], name, { type });
}

/**
 * Save one artifact to the user's disk. Returns true when the download was
 * dispatched; it cannot observe whether the user kept the file.
 */
function saveArtifact(artifact) {
  const file = artifactFileFrom(artifact);
  if (!file) return false;
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Safari reads the object URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

/**
 * Hand one artifact to the system share sheet, or save it when the platform
 * cannot share files. `fallback` picks what happens when file sharing is not
 * available: "download" saves it, "text" shares the plain text (Markdown's
 * historical behavior), "none" reports that nothing happened.
 */
async function shareArtifact({ title = "", fallback = "download", ...artifact } = {}) {
  const file = artifactFileFrom(artifact);
  if (!file || !file.size) return { shared: false, method: "none" };
  const safeTitle = String(title || file.name || "AI System 6").trim();
  const canShare = typeof navigator.share === "function";

  if (canShare && navigator.canShare?.({ files: [file] }) === true) {
    try {
      await navigator.share({ title: safeTitle, files: [file] });
      return { shared: true, method: "share" };
    } catch (error) {
      if (error?.name === "AbortError") return { shared: false, method: "cancel" };
      throw error;
    }
  }

  if (fallback === "text" && canShare && artifact.text) {
    try {
      await navigator.share({ title: safeTitle, text: String(artifact.text) });
      return { shared: true, method: "share" };
    } catch (error) {
      if (error?.name === "AbortError") return { shared: false, method: "cancel" };
      throw error;
    }
  }

  if (fallback === "download") {
    return { shared: saveArtifact({ file }), method: "download" };
  }
  return { shared: false, method: "none" };
}

/** Markdown keeps its own name; the behavior is now shareArtifact's. */
async function shareMarkdown({ title = "", markdown = "", fileName = "document.md" } = {}) {
  const text = String(markdown || "").trim();
  if (!text) return false;
  const result = await shareArtifact({
    title,
    text,
    fileName,
    mimeType: "text/markdown",
    fallback: "text",
  });
  return result.shared;
}

// ---- Screen Wake Lock -----------------------------------------------------
// A presentation or a long read should not dim mid-sentence. iOS and iPadOS
// 18.4 give a Home Screen Web App the Screen Wake Lock API, so the surfaces
// that ask for one can hold the screen — but only while the user has turned
// the preference on, and only while somebody is actually holding it. The
// moment the last holder leaves, the lock is released, not left running.

const screenWakeLockHolders = new Set();
let screenWakeLockSentinel = null;
let screenWakeLockRequest = null;

function isScreenWakeLockAllowed() {
  const input = document.getElementById("keep-screen-awake");
  return !!input?.checked && !!navigator.wakeLock?.request;
}

function screenWakeLockHolderIds() {
  return Array.from(screenWakeLockHolders);
}

async function applyScreenWakeLock() {
  const wanted = screenWakeLockHolders.size > 0
    && isScreenWakeLockAllowed()
    && document.visibilityState === "visible";
  if (!wanted) {
    const sentinel = screenWakeLockSentinel;
    screenWakeLockSentinel = null;
    if (sentinel) await sentinel.release().catch(() => {});
    return false;
  }
  if (screenWakeLockSentinel) return true;
  if (!screenWakeLockRequest) {
    screenWakeLockRequest = navigator.wakeLock.request("screen")
      .then((sentinel) => {
        // The platform drops the lock on its own when the page hides; forget
        // the stale sentinel so a later request is not skipped as redundant.
        sentinel.addEventListener("release", () => {
          if (screenWakeLockSentinel === sentinel) screenWakeLockSentinel = null;
        });
        screenWakeLockSentinel = sentinel;
        return sentinel;
      })
      .catch(() => null)
      .finally(() => { screenWakeLockRequest = null; });
  }
  return !!(await screenWakeLockRequest);
}

function holdScreenWakeLock(holderId) {
  const id = String(holderId || "").trim();
  if (!id) return Promise.resolve(false);
  screenWakeLockHolders.add(id);
  return applyScreenWakeLock();
}

function releaseScreenWakeLock(holderId) {
  const id = String(holderId || "").trim();
  if (id) screenWakeLockHolders.delete(id);
  else screenWakeLockHolders.clear();
  return applyScreenWakeLock();
}

document.addEventListener("visibilitychange", () => { applyScreenWakeLock(); });
document.getElementById("keep-screen-awake")?.addEventListener("change", () => {
  applyScreenWakeLock();
  if (typeof saveDeskState === "function") saveDeskState();
});

window.AISystem6WebPlatform = Object.freeze({
  installWebApp,
  isStandaloneWebApp,
  projectStorageSnapshot,
  renderProjectStorageStatus,
  requestPersistentProjectStorage,
  saveArtifact,
  shareArtifact,
  shareMarkdown,
  syncWebInstallUi,
  holdScreenWakeLock,
  releaseScreenWakeLock,
  isScreenWakeLockAllowed,
  screenWakeLockHolderIds,
});

document.getElementById("keep-projects-on-device")?.addEventListener("click", requestPersistentProjectStorage);
window.requestAnimationFrame(syncWebInstallUi);
