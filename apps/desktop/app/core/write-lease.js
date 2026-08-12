// Single-writer lease for Web instances.
//
// A normal browser tab, an Add-to-Home-Screen app, and a PWA standalone
// window share the same IndexedDB. localStorage has no CAS, so this module
// never pretends to be a distributed mutex. The invariant is fencing +
// verification:
//
//   - every lease mutation is preceded by reading the stored lease and only
//     proceeds when the stored owner is this instance;
//   - acquire claims, then READ-BACKS the stored lease before trusting memory;
//   - the heartbeat refreshes only a lease that is still stored under this
//     instance id, otherwise the instance immediately enters read-only;
//   - release deletes only a lease that is still stored under this instance;
//   - the storage boundary (assertCanWrite) re-verifies the stored owner at
//     the moment a write transaction is about to start.
//
// Even if two instances briefly believe they own the lease, exactly one can
// pass the stored-owner verification at write time.

const WRITE_LEASE_KEY = "ai-system6-write-lease";
const WRITE_LEASE_CHANNEL = "ai-system6-instance";
const LEASE_HEARTBEAT_MS = 5000;
const LEASE_STALE_MS = 15000;
const TAKEOVER_TIMEOUT_MS = 4000;

let instanceId = "";
try {
  instanceId = crypto.randomUUID();
} catch {
  instanceId = `instance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let leaseState = { writer: false, readOnly: false, claimedAt: 0, mode: "readonly" };
let heartbeatTimer = null;
let broadcastChannel = null;
let takeoverInFlight = null;
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

function currentStoredLease() {
  return readStoredLease();
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

function isCurrentStoredWriter() {
  const lease = currentStoredLease();
  return Boolean(lease && lease.instanceId === instanceId && leaseIsFresh(lease));
}

function storedLeaseBelongsToMe() {
  const lease = currentStoredLease();
  return Boolean(lease && lease.instanceId === instanceId);
}

function assertCanWrite() {
  // Handoff still owns the lease and may finish pending durable writes; only
  // a true read-only instance is refused at the storage fence.
  if (
    (leaseState.mode !== "writer" && leaseState.mode !== "handoff")
    || !isCurrentStoredWriter()
  ) {
    const error = new Error("This window is read-only; another window owns the write lease.");
    error.code = "READ_ONLY_INSTANCE";
    throw error;
  }
  return true;
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

function syncWriteModeDataset() {
  try {
    document.body.dataset.writeMode = leaseState.mode;
  } catch {}
}

// Read-only honesty is DECLARATIVE: every interactive element that mutates
// durable / project state carries `data-requires-write` in the document, and
// this single query freezes it when the instance is not the writer. Reading,
// copying, sharing, downloading, exporting backups, and Get Info carry no such
// marker and stay available. The storage boundary remains the final fence.
function syncReadOnlySurface() {
  // Handoff freezes new user mutations exactly like read-only: the old writer
  // may finish pending durable writes but must not accept new edits.
  const readOnly = leaseState.mode !== "writer";
  try {
    document.querySelectorAll("[data-requires-write]").forEach((element) => {
      const tag = element.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input" || tag === "select") {
        element.readOnly = readOnly;
      }
      element.disabled = readOnly;
    });
  } catch {}
}

function setWriter(value, claimedAt = 0) {
  leaseState = {
    writer: value,
    readOnly: !value,
    claimedAt: value ? claimedAt : leaseState.claimedAt,
    mode: value ? "writer" : "readonly",
  };
  syncWriteModeDataset();
  syncReadOnlySurface();
}

function post(message) {
  try {
    broadcastChannel?.postMessage(message);
  } catch {}
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    const stored = currentStoredLease();
    if (!stored || stored.instanceId !== instanceId || !leaseIsFresh(stored)) {
      // Never overwrite a lease another instance just took over. The heartbeat
      // only refreshes a lease that is still stored under this instance.
      enterReadOnly("lease-lost");
      return;
    }
    const claimedAt = leaseState.claimedAt || Date.now();
    const heartbeatAt = Date.now();
    writeStoredLease({ instanceId, claimedAt, heartbeatAt });
    post({ type: "heartbeat", instanceId, claimedAt, heartbeatAt });
  }, LEASE_HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function acquireWriteLease() {
  const existing = currentStoredLease();
  if (existing && existing.instanceId === instanceId && leaseIsFresh(existing)) {
    setWriter(true, Number(existing.claimedAt) || Date.now());
    startHeartbeat();
    return { writer: true, readOnly: false };
  }
  if (existing && existing.instanceId !== instanceId && leaseIsFresh(existing)) {
    setWriter(false);
    return { writer: false, readOnly: true, owner: existing.instanceId };
  }
  // No fresh owner: claim, then read back before trusting memory. Two
  // instances may both claim near-simultaneously; the read-back makes only
  // the last writer pass.
  const claimedAt = Date.now();
  writeStoredLease({ instanceId, claimedAt, heartbeatAt: claimedAt });
  const readback = currentStoredLease();
  if (readback?.instanceId === instanceId) {
    setWriter(true, claimedAt);
    startHeartbeat();
    post({ type: "acquired", instanceId, claimedAt });
    return { writer: true, readOnly: false };
  }
  setWriter(false);
  return { writer: false, readOnly: true };
}

// Dangerous path: claims the lease without a flush handshake. Only allowed
// when the stored owner is stale, or after explicit user confirmation of the
// data-loss risk. Broadcasts "takeover" so the old instance drops writes.
function forceTakeOverWriteLease() {
  const claimedAt = Date.now();
  writeStoredLease({ instanceId, claimedAt, heartbeatAt: claimedAt });
  const readback = currentStoredLease();
  if (readback?.instanceId !== instanceId) {
    setWriter(false);
    return { writer: false, readOnly: true };
  }
  setWriter(true, claimedAt);
  startHeartbeat();
  post({ type: "takeover", instanceId, claimedAt });
  notifyLeaseListeners({ type: "writer", instanceId });
  return { writer: true, readOnly: false };
}

function releaseWriteLease() {
  stopHeartbeat();
  // Delete only a lease that is still stored under this instance. A late
  // pagehide after a takeover must never remove the new owner's lease.
  if (storedLeaseBelongsToMe()) removeStoredLease();
  setWriter(false);
  post({ type: "released", instanceId });
}

// Safe takeover handshake. The requesting instance (C) asks the CURRENT
// STORED WRITER (A) — by instance id — to flush; only A may reply
// ready/denied; C claims only after ready. Read-only bystanders ignore the
// request entirely.
function requestSafeTakeover() {
  if (takeoverInFlight) return Promise.resolve({ ok: false, reason: "busy" });
  const stored = currentStoredLease();
  if (!stored || !leaseIsFresh(stored)) {
    const result = forceTakeOverWriteLease();
    return Promise.resolve(result.writer
      ? { ok: true, writer: true }
      : { ok: false, reason: "claim-failed" });
  }
  if (stored.instanceId === instanceId) {
    return Promise.resolve({ ok: true, writer: true });
  }
  const targetInstanceId = stored.instanceId;
  const requestId = `${instanceId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  takeoverInFlight = { requestId, targetInstanceId, timeoutId: null };
  return new Promise((resolve) => {
    const settle = (result) => {
      if (!takeoverInFlight || takeoverInFlight.requestId !== requestId) return;
      if (takeoverInFlight.timeoutId) clearTimeout(takeoverInFlight.timeoutId);
      takeoverInFlight = null;
      resolve(result);
    };
    takeoverInFlight.timeoutId = setTimeout(() => {
      settle({ ok: false, reason: "timeout" });
    }, TAKEOVER_TIMEOUT_MS);
    takeoverInFlight.resolve = settle;
    post({
      type: "takeover-request",
      fromInstanceId: instanceId,
      targetInstanceId,
      requestId,
    });
  });
}

function cancelTakeoverRequest() {
  if (takeoverInFlight?.timeoutId) clearTimeout(takeoverInFlight.timeoutId);
  takeoverInFlight = null;
}

async function flushOldWriterBeforeTakeover() {
  // Order matters: draft first, then the Working Session, then desk state.
  if (typeof flushPendingQuickDraftCommit === "function") {
    const flushed = await flushPendingQuickDraftCommit();
    if (flushed === false) return false;
  }
  if (typeof flushWorkingSessionCommit === "function") {
    await flushWorkingSessionCommit();
  }
  if (typeof saveDeskState === "function") {
    const saved = await saveDeskState();
    if (saved === false) return false;
  }
  return true;
}

async function handleTakeoverRequest(message) {
  // Only the targeted stored writer may answer; read-only bystanders ignore.
  if (message.targetInstanceId !== instanceId) return;
  if (!isCurrentStoredWriter()) return;

  enterHandoff("takeover-request");
  let flushOk = false;
  let leaseStillMine = false;
  try {
    flushOk = await flushOldWriterBeforeTakeover();
    // Between the flush and the release, confirm the stored lease is still
    // ours — a rival claim during the flush must abort the handoff.
    if (flushOk) leaseStillMine = storedLeaseBelongsToMe();
  } catch (error) {
    console.warn("Safe takeover flush failed.", error);
    flushOk = false;
  }
  if (!flushOk) {
    restoreWriterAfterFailedHandoff();
    post({
      type: "takeover-denied",
      fromInstanceId: instanceId,
      requestId: message.requestId,
      reason: "unsaved-work",
    });
    return;
  }
  if (!leaseStillMine) {
    // The lease moved during the flush: we can no longer restore writer mode.
    enterReadOnly("takeover-lease-lost");
    post({
      type: "takeover-denied",
      fromInstanceId: instanceId,
      requestId: message.requestId,
      reason: "lease-lost",
    });
    return;
  }
  releaseWriteLease();
  enterReadOnly("takeover-complete");
  post({
    type: "takeover-ready",
    fromInstanceId: instanceId,
    requestId: message.requestId,
  });
}

function handleBroadcast(event) {
  const message = event?.data;
  if (!message || typeof message !== "object" || message.instanceId === instanceId) return;
  if (message.type === "takeover-request") {
    handleTakeoverRequest(message).catch((error) => {
      console.warn("Safe takeover flush failed.", error);
      restoreWriterAfterFailedHandoff();
      post({
        type: "takeover-denied",
        fromInstanceId: instanceId,
        requestId: message.requestId,
        reason: "unsaved-work",
      });
    });
    return;
  }
  if (message.type === "takeover-ready") {
    if (takeoverInFlight?.requestId === message.requestId) {
      const result = acquireWriteLease();
      takeoverInFlight.resolve?.(result.writer
        ? { ok: true, writer: true }
        : { ok: false, reason: "claim-failed" });
    }
    return;
  }
  if (message.type === "takeover-denied") {
    if (takeoverInFlight?.requestId === message.requestId) {
      takeoverInFlight.resolve?.({ ok: false, reason: message.reason || "denied" });
    }
    return;
  }
  if (message.type === "takeover" || message.type === "acquired" || message.type === "heartbeat") {
    if (leaseState.mode !== "readonly") {
      stopHeartbeat();
      setWriter(false);
      notifyLeaseListeners({ type: "write-access-lost", owner: message.instanceId });
    }
  }
}

function handleStorageEvent(event) {
  if (event.key !== WRITE_LEASE_KEY) return;
  try {
    const lease = JSON.parse(event.newValue || "null");
    if (lease && lease.instanceId !== instanceId && leaseIsFresh(lease) && leaseState.mode !== "readonly") {
      stopHeartbeat();
      setWriter(false);
      notifyLeaseListeners({ type: "write-access-lost", owner: lease.instanceId });
    }
  } catch {}
}

// Reconcile after BFCache restore or foreground resume: never auto-takeover.
// If the stored owner is us → writer; no fresh owner → try acquire; other
// fresh owner → read-only.
function reconcileWriteLease() {
  const stored = currentStoredLease();
  if (stored?.instanceId === instanceId) {
    if (leaseIsFresh(stored)) {
      setWriter(true, Number(stored.claimedAt) || Date.now());
      startHeartbeat();
      return { writer: true, readOnly: false };
    }
    // Our own lease went stale while frozen: re-claim with read-back.
    return acquireWriteLease();
  }
  if (!stored || !leaseIsFresh(stored)) {
    return acquireWriteLease();
  }
  stopHeartbeat();
  setWriter(false);
  return { writer: false, readOnly: true, owner: stored.instanceId };
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
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) reconcileWriteLease();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconcileWriteLease();
  });
}

function isReadOnlyInstance() {
  return leaseState.mode === "readonly";
}

function isWriteLeaseOwner() {
  return leaseState.mode !== "readonly";
}

function canMutate() {
  return leaseState.mode === "writer";
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

// Handoff: the lease is still ours, pending durable writes may finish, but
// the UI freezes new mutations (syncReadOnlySurface treats handoff like
// read-only) until the takeover resolves.
function enterHandoff(reason = "takeover-request") {
  if (leaseState.mode === "readonly") return false;
  leaseState = {
    ...leaseState,
    writer: true,
    readOnly: false,
    mode: "handoff",
  };
  syncWriteModeDataset();
  syncReadOnlySurface();
  if (typeof setStatus === "function") setStatus(t("write_lease_handoff_status"));
  if (typeof updateMenuState === "function") updateMenuState();
  return reason;
}

// A failed handoff restores full writer mode: the lease was never released,
// the user's edits stay intact and remain editable.
function restoreWriterAfterFailedHandoff() {
  if (leaseState.mode !== "handoff") return;
  leaseState = {
    ...leaseState,
    writer: true,
    readOnly: false,
    mode: "writer",
  };
  syncWriteModeDataset();
  syncReadOnlySurface();
  if (typeof setStatus === "function") setStatus(t("write_lease_handoff_failed"));
  if (typeof updateMenuState === "function") updateMenuState();
}

function showWriteLeaseDialog({ lost = false, denied = false } = {}) {
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
  } else if (denied) {
    title.textContent = t("write_lease_denied_title");
    message.textContent = t("write_lease_denied_message");
    readOnlyButton.textContent = t("write_lease_denied_cancel");
    takeoverButton.textContent = t("write_lease_force");
    readOnlyButton.onclick = () => { close(); };
    takeoverButton.onclick = () => { close(); requestForceTakeoverWithConfirm(); };
  } else {
    title.textContent = t("write_lease_title");
    message.textContent = t("write_lease_message");
    readOnlyButton.textContent = t("write_lease_read_only");
    takeoverButton.textContent = t("write_lease_takeover");
    readOnlyButton.onclick = () => { close(); enterReadOnly("user-choice"); };
    takeoverButton.onclick = () => {
      close();
      requestSafeTakeover().then((result) => {
        if (result?.ok) return;
        if (result?.reason === "unsaved-work") showWriteLeaseDialog({ denied: true });
        else if (result?.reason === "timeout") showWriteLeaseDialog({ denied: true });
      });
    };
  }
  if (typeof playSystemSound === "function") playSystemSound("alert");
  dialog.showModal();
  return true;
}

async function requestForceTakeoverWithConfirm() {
  const stored = currentStoredLease();
  const staleOwner = !stored || !leaseIsFresh(stored);
  if (!staleOwner && typeof showSystemModal === "function") {
    const choice = await showSystemModal(t("write_lease_force_confirm"), "confirm", { defaultAction: "cancel" });
    if (choice !== "yes") return false;
  }
  const result = forceTakeOverWriteLease();
  return result.writer;
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
    setTimeout(() => showWriteLeaseDialog({ lost: false }), 0);
  }
  return result;
}

window.AISystem6WriteLease = Object.freeze({
  instanceId,
  acquire: acquireWriteLease,
  acquireAtBoot: acquireWriteLeaseAtBoot,
  takeOver: forceTakeOverWriteLease,
  requestTakeover: requestSafeTakeover,
  cancelTakeover: cancelTakeoverRequest,
  forceTakeOver: forceTakeOverWriteLease,
  release: releaseWriteLease,
  reconcile: reconcileWriteLease,
  isReadOnly: isReadOnlyInstance,
  isOwner: isWriteLeaseOwner,
  canMutate,
  isCurrentStoredWriter,
  storedLeaseBelongsToMe,
  assertCanWrite,
  enterReadOnly,
  enterHandoff,
  restoreWriterAfterFailedHandoff,
  showConflict: () => showWriteLeaseDialog({ lost: false }),
  showLost: () => showWriteLeaseDialog({ lost: true }),
  showDenied: () => showWriteLeaseDialog({ denied: true }),
  on: onWriteLeaseEvent,
  initUi: initWriteLeaseUi,
  syncReadOnlySurface,
  init: initWriteLease,
  keys: Object.freeze({
    storage: WRITE_LEASE_KEY,
    channel: WRITE_LEASE_CHANNEL,
    heartbeatMs: LEASE_HEARTBEAT_MS,
    staleMs: LEASE_STALE_MS,
    takeoverTimeoutMs: TAKEOVER_TIMEOUT_MS,
  }),
});

initWriteLease();
