// Single-writer lease for Web instances.
//
// A normal browser tab, an Add-to-Home-Screen app, and a PWA standalone
// window share the same IndexedDB. Without a lease, the last writer wins and
// one instance silently overwrites the other's project state. This module
// coordinates one writer at a time: non-writers run read-only (their storage
// boundary rejects mutating writes with READ_ONLY_INSTANCE) and can take over
// explicitly, which broadcasts the loss of write access to the old instance.

const WRITE_LEASE_KEY = "ai-system6-write-lease";
const WRITE_LEASE_CHANNEL = "ai-system6-instance";
const LEASE_HEARTBEAT_MS = 5000;
const LEASE_STALE_MS = 15000;

let instanceId = "";
try {
  instanceId = crypto.randomUUID();
} catch {
  instanceId = `instance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let leaseState = { writer: false, readOnly: false, claimedAt: 0 };
let heartbeatTimer = null;
let broadcastChannel = null;
const leaseListeners = new Set();

function readStoredLease() {
  try {
    const raw = localStorage.getItem(WRITE_LEASE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.instanceId ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredLease(lease) {
  try {
    localStorage.setItem(WRITE_LEASE_KEY, JSON.stringify(lease));
  } catch {}
}

function removeStoredLease() {
  try {
    localStorage.removeItem(WRITE_LEASE_KEY);
  } catch {}
}

function leaseIsFresh(lease) {
  return !!lease && (Date.now() - Number(lease.heartbeatAt || 0)) < LEASE_STALE_MS;
}

function notifyLeaseListeners(event) {
  leaseListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.warn("Write lease listener failed.", error);
    }
  });
}

function setWriter(value, claimedAt = 0) {
  leaseState = { writer: value, readOnly: !value, claimedAt: value ? claimedAt : leaseState.claimedAt };
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    const claimedAt = leaseState.claimedAt || Date.now();
    const heartbeatAt = Date.now();
    writeStoredLease({ instanceId, claimedAt, heartbeatAt });
    try {
      broadcastChannel?.postMessage({ type: "heartbeat", instanceId, claimedAt, heartbeatAt });
    } catch {}
  }, LEASE_HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function acquireWriteLease() {
  const existing = readStoredLease();
  if (!existing || !leaseIsFresh(existing)) {
    const claimedAt = Date.now();
    writeStoredLease({ instanceId, claimedAt, heartbeatAt: claimedAt });
    setWriter(true, claimedAt);
    startHeartbeat();
    try {
      broadcastChannel?.postMessage({ type: "acquired", instanceId, claimedAt });
    } catch {}
    return { writer: true, readOnly: false };
  }
  if (existing.instanceId === instanceId) {
    setWriter(true, Number(existing.claimedAt) || Date.now());
    startHeartbeat();
    return { writer: true, readOnly: false };
  }
  setWriter(false);
  return { writer: false, readOnly: true, owner: existing.instanceId };
}

function takeOverWriteLease() {
  const claimedAt = Date.now();
  writeStoredLease({ instanceId, claimedAt, heartbeatAt: claimedAt });
  setWriter(true, claimedAt);
  startHeartbeat();
  try {
    broadcastChannel?.postMessage({ type: "takeover", instanceId, claimedAt });
  } catch {}
  notifyLeaseListeners({ type: "writer", instanceId });
  return { writer: true, readOnly: false };
}

function releaseWriteLease() {
  stopHeartbeat();
  if (leaseState.writer) removeStoredLease();
  setWriter(false);
  try {
    broadcastChannel?.postMessage({ type: "released", instanceId });
  } catch {}
}

function handleBroadcast(event) {
  const message = event?.data;
  if (!message || typeof message !== "object" || message.instanceId === instanceId) return;
  if (message.type === "takeover" || message.type === "acquired" || message.type === "heartbeat") {
    if (leaseState.writer) {
      stopHeartbeat();
      setWriter(false);
      notifyLeaseListeners({ type: "write-access-lost", owner: message.instanceId });
    }
  }
}

function handleStorageEvent(event) {
  if (event.key !== WRITE_LEASE_KEY || !leaseState.writer) return;
  try {
    const lease = JSON.parse(event.newValue || "null");
    if (lease && lease.instanceId !== instanceId && leaseIsFresh(lease)) {
      stopHeartbeat();
      setWriter(false);
      notifyLeaseListeners({ type: "write-access-lost", owner: lease.instanceId });
    }
  } catch {}
}

function initWriteLease() {
  try {
    broadcastChannel = new BroadcastChannel(WRITE_LEASE_CHANNEL);
    broadcastChannel.addEventListener("message", handleBroadcast);
  } catch {
    broadcastChannel = null;
    window.addEventListener("storage", handleStorageEvent);
  }
  window.addEventListener("pagehide", () => releaseWriteLease());
}

function isReadOnlyInstance() {
  return leaseState.readOnly;
}

function isWriteLeaseOwner() {
  return leaseState.writer;
}

function onWriteLeaseEvent(listener) {
  leaseListeners.add(listener);
  return () => leaseListeners.delete(listener);
}

function enterReadOnly(reason = "write-access-lost") {
  stopHeartbeat();
  setWriter(false);
  if (typeof cancelWorkingSessionAutosave === "function") cancelWorkingSessionAutosave();
  if (typeof setStatus === "function") setStatus(t("read_only_instance_status"));
  if (typeof updateMenuState === "function") updateMenuState();
  return reason;
}

function showWriteLeaseDialog({ lost = false } = {}) {
  const dialog = document.querySelector("#write-lease-modal");
  if (!dialog || typeof dialog.showModal !== "function") return false;
  const title = dialog.querySelector("#write-lease-title");
  const message = dialog.querySelector("#write-lease-message");
  const readOnlyButton = dialog.querySelector("#write-lease-readonly");
  const takeoverButton = dialog.querySelector("#write-lease-takeover");
  if (!title || !message || !readOnlyButton || !takeoverButton) return false;

  const close = () => {
    try { if (dialog.open) dialog.close(); } catch {}
  };

  if (lost) {
    title.textContent = t("write_lease_lost_title");
    message.textContent = t("write_lease_lost_message");
    readOnlyButton.textContent = t("write_lease_reload");
    takeoverButton.textContent = t("write_lease_continue_read_only");
    readOnlyButton.onclick = () => { close(); window.location.reload(); };
    takeoverButton.onclick = () => { close(); };
  } else {
    title.textContent = t("write_lease_title");
    message.textContent = t("write_lease_message");
    readOnlyButton.textContent = t("write_lease_read_only");
    takeoverButton.textContent = t("write_lease_takeover");
    readOnlyButton.onclick = () => { close(); enterReadOnly("user-choice"); };
    takeoverButton.onclick = () => { close(); takeOverWriteLease(); };
  }
  if (typeof playSystemSound === "function") playSystemSound("alert");
  dialog.showModal();
  return true;
}

function initWriteLeaseUi() {
  onWriteLeaseEvent((event) => {
    if (event.type === "write-access-lost") {
      enterReadOnly("write-access-lost");
      setTimeout(() => showWriteLeaseDialog({ lost: true }), 0);
    }
  });
}

function acquireWriteLeaseAtBoot() {
  const result = acquireWriteLease();
  if (result.readOnly) {
    // Defer the dialog until first paint so the boot screen owns the moment.
    setTimeout(() => showWriteLeaseDialog({ lost: false }), 0);
  }
  return result;
}

window.AISystem6WriteLease = Object.freeze({
  instanceId,
  acquire: acquireWriteLease,
  acquireAtBoot: acquireWriteLeaseAtBoot,
  takeOver: takeOverWriteLease,
  release: releaseWriteLease,
  isReadOnly: isReadOnlyInstance,
  isOwner: isWriteLeaseOwner,
  enterReadOnly,
  showConflict: () => showWriteLeaseDialog({ lost: false }),
  showLost: () => showWriteLeaseDialog({ lost: true }),
  on: onWriteLeaseEvent,
  initUi: initWriteLeaseUi,
  init: initWriteLease,
  keys: Object.freeze({
    storage: WRITE_LEASE_KEY,
    channel: WRITE_LEASE_CHANNEL,
    heartbeatMs: LEASE_HEARTBEAT_MS,
    staleMs: LEASE_STALE_MS,
  }),
});

initWriteLease();
