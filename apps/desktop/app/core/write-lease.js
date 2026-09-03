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
const WRITE_LEASE_INSTANCE_SESSION_KEY = "ai-system6-write-lease-instance";

let instanceId = "";
try {
  const navigationType = performance.getEntriesByType?.("navigation")?.[0]?.type;
  if (navigationType === "reload") {
    instanceId = sessionStorage.getItem(WRITE_LEASE_INSTANCE_SESSION_KEY) || "";
  }
  if (!instanceId) instanceId = crypto.randomUUID();
  sessionStorage.setItem(WRITE_LEASE_INSTANCE_SESSION_KEY, instanceId);
} catch {
  instanceId = `instance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let leaseState = { writer: false, readOnly: false, claimedAt: 0, mode: "readonly", epoch: 0 };
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
  return Boolean(
    lease
    && lease.instanceId === instanceId
    && Number(lease.epoch) === Number(leaseState.epoch)
    && Number(lease.epoch) > 0
    && leaseIsFresh(lease)
  );
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
  if (!Number.isFinite(Number(leaseState.epoch)) || Number(leaseState.epoch) < 1) {
    const error = new Error("This window does not hold a persistent write fence.");
    error.code = "READ_ONLY_INSTANCE";
    throw error;
  }
  return { ownerId: instanceId, epoch: Number(leaseState.epoch) };
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
// A surface can be locked for more than one reason at a time: the instance may
// hold no write lease, and the writing route may separately hand the pen to
// another window. Both used to write element.readOnly directly and overwrite
// each other, so whichever ran last decided - which quietly unlocked the
// drafting manuscript the route contract depends on. Reasons register here and
// this stays the single writer of the property.
const extraReadOnlyRules = new Set();

function registerReadOnlyRule(rule) {
  if (typeof rule !== "function") return () => {};
  extraReadOnlyRules.add(rule);
  syncReadOnlySurface();
  return () => {
    extraReadOnlyRules.delete(rule);
    syncReadOnlySurface();
  };
}

function elementIsReadOnly(element) {
  // Not holding the lease no longer freezes anything. The lease holds the
  // database connection, not the user's permission to type: a window without
  // it hands its writes to the window that has it, and the base check on each
  // record is what keeps that safe. Handoff still freezes, because there the
  // holder is flushing its last durable writes before letting go and must not
  // take on new ones.
  if (leaseState.mode === "handoff") return true;
  for (const rule of extraReadOnlyRules) {
    try {
      if (rule(element) === true) return true;
    } catch {}
  }
  return false;
}

function syncReadOnlySurface() {
  let elements = [];
  try {
    elements = [...document.querySelectorAll("[data-requires-write]")];
  } catch {
    return;
  }
  // Per element, so one exotic node cannot abort the sweep for every other
  // surface and leave half the window writable in read-only mode.
  elements.forEach((element) => {
    try {
      const readOnly = elementIsReadOnly(element);
      const tag = String(element.tagName || "").toLowerCase();
      const type = String(element.type || "").toLowerCase();
      const takesReadOnly = tag === "textarea"
        || (tag === "input" && !["checkbox", "radio", "file", "range", "color"].includes(type));
      if (takesReadOnly) {
        // A locked document is still a document: it must stay focusable,
        // selectable, scrollable and copyable, and it must keep its place in
        // the tab order. disabled takes all of that away, which is not what
        // "you cannot change this" means on paper.
        element.readOnly = readOnly;
        element.disabled = false;
        element.classList?.toggle?.("is-write-locked", readOnly);
        return;
      }
      if (tag === "select") element.readOnly = readOnly;
      element.disabled = readOnly;
      element.classList?.toggle?.("is-write-locked", readOnly);
    } catch {}
  });
}

// A receipt has to expire with the thing it reports. The read-only notice used
// to sit on screen after the lease came back, which nobody noticed while the
// status line lived in a hidden window - and which reads as a lie now that the
// route shows it. Only our own message is cleared, never someone else's.
let announcedReadOnly = false;

function setWriter(value, claimedAt = 0, epoch = 0) {
  const becameWriter = value && leaseState.mode !== "writer";
  if (value && announcedReadOnly) {
    announcedReadOnly = false;
    if (typeof setStatus === "function") clearStatus();
  }
  leaseState = {
    writer: value,
    readOnly: !value,
    claimedAt: value ? claimedAt : leaseState.claimedAt,
    epoch: value ? Math.max(0, Number(epoch) || 0) : 0,
    mode: value ? "writer" : "readonly",
  };
  syncWriteModeDataset();
  syncReadOnlySurface();
  // Losing the pen refreshes the menus and the status line. Taking it back
  // refreshed neither, and the silent reclaim on focus is the common way to
  // take it back - so a window that had already become the writer kept showing
  // the read-only notice and the greyed commands that explained a lock it no
  // longer had. The surface unlocked; only the explanation stayed behind.
  if (becameWriter) refreshWriteLeaseSurfaces();
}

// The surfaces that explain the lock in words rather than in disabled state:
// the menu bar, and the ClioTalk greeting that offers to take the pen. Both
// have to move with the lease in both directions.
function refreshWriteLeaseSurfaces() {
  if (typeof updateMenuState === "function") updateMenuState();
  if (typeof renderClioTalkWelcome === "function") renderClioTalkWelcome();
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
    if (
      !stored
      || stored.instanceId !== instanceId
      || Number(stored.epoch) !== Number(leaseState.epoch)
      || !leaseIsFresh(stored)
    ) {
      // Never overwrite a lease another instance just took over. The heartbeat
      // only refreshes a lease that is still stored under this instance.
      enterReadOnly("lease-lost");
      return;
    }
    const claimedAt = leaseState.claimedAt || Date.now();
    const heartbeatAt = Date.now();
    const epoch = Number(leaseState.epoch) || 0;
    writeStoredLease({ instanceId, claimedAt, heartbeatAt, epoch });
    post({ type: "heartbeat", instanceId, claimedAt, heartbeatAt, epoch });
  }, LEASE_HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function claimPersistentWriteFence() {
  // VM/source-contract tests do not expose IndexedDB. The production bundle
  // always has openAppDb and the transaction runtime by boot time.
  if (typeof indexedDB === "undefined") {
    return { ownerId: instanceId, epoch: Math.max(1, Number(leaseState.epoch) + 1), updatedAt: Date.now() };
  }
  if (
    typeof openAppDb !== "function"
    || typeof window.AISystem6StorageTransactions?.claimWriteFence !== "function"
  ) {
    const error = new Error("Persistent write fencing is unavailable.");
    error.code = "READ_ONLY_INSTANCE";
    throw error;
  }
  const db = await openAppDb();
  try {
    return await window.AISystem6StorageTransactions.claimWriteFence(db, instanceId);
  } finally {
    db.close();
  }
}

async function releasePersistentWriteFence(expectedFence) {
  if (typeof indexedDB === "undefined") return true;
  if (
    typeof openAppDb !== "function"
    || typeof window.AISystem6StorageTransactions?.releaseWriteFence !== "function"
  ) return false;
  const db = await openAppDb();
  try {
    return await window.AISystem6StorageTransactions.releaseWriteFence(db, expectedFence);
  } finally {
    db.close();
  }
}

async function ownsPersistentWriteFence(expectedFence) {
  if (typeof indexedDB === "undefined") return true;
  if (
    typeof openAppDb !== "function"
    || typeof window.AISystem6StorageTransactions?.readWriteFence !== "function"
  ) return false;
  const db = await openAppDb();
  try {
    const current = await window.AISystem6StorageTransactions.readWriteFence(db);
    return current?.ownerId === expectedFence?.ownerId
      && Number(current?.epoch) === Number(expectedFence?.epoch);
  } finally {
    db.close();
  }
}

async function acquireWriteLease() {
  const existing = currentStoredLease();
  if (
    existing
    && existing.instanceId === instanceId
    && leaseIsFresh(existing)
    && Number(existing.epoch) === Number(leaseState.epoch)
    && Number(existing.epoch) > 0
  ) {
    setWriter(true, Number(existing.claimedAt) || Date.now(), Number(existing.epoch));
    startHeartbeat();
    return { writer: true, readOnly: false, epoch: Number(existing.epoch) };
  }
  if (existing && existing.instanceId !== instanceId && leaseIsFresh(existing)) {
    setWriter(false);
    return { writer: false, readOnly: true, owner: existing.instanceId };
  }
  // No fresh owner: claim, then read back before trusting memory. Two
  // instances may both claim near-simultaneously; the read-back makes only
  // the last writer pass.
  const claimedAt = Date.now();
  writeStoredLease({ instanceId, claimedAt, heartbeatAt: claimedAt, epoch: 0 });
  const readback = currentStoredLease();
  if (readback?.instanceId === instanceId) {
    try {
      const fence = await claimPersistentWriteFence();
      const latest = currentStoredLease();
      if (latest?.instanceId !== instanceId) {
        await releasePersistentWriteFence(fence);
        setWriter(false);
        return { writer: false, readOnly: true };
      }
      writeStoredLease({ instanceId, claimedAt, heartbeatAt: Date.now(), epoch: fence.epoch });
      setWriter(true, claimedAt, fence.epoch);
      startHeartbeat();
      post({ type: "acquired", instanceId, claimedAt, epoch: fence.epoch });
      return { writer: true, readOnly: false, epoch: fence.epoch };
    } catch (error) {
      if (storedLeaseBelongsToMe()) removeStoredLease();
      setWriter(false);
      return { writer: false, readOnly: true, error };
    }
  }
  setWriter(false);
  return { writer: false, readOnly: true };
}

// Dangerous path: claims the lease without a flush handshake. Only allowed
// when the stored owner is stale, or after explicit user confirmation of the
// data-loss risk. Broadcasts "takeover" so the old instance drops writes.
async function forceTakeOverWriteLease() {
  const claimedAt = Date.now();
  writeStoredLease({ instanceId, claimedAt, heartbeatAt: claimedAt, epoch: 0 });
  const readback = currentStoredLease();
  if (readback?.instanceId !== instanceId) {
    setWriter(false);
    return { writer: false, readOnly: true };
  }
  try {
    const fence = await claimPersistentWriteFence();
    const latest = currentStoredLease();
    if (latest?.instanceId !== instanceId) {
      await releasePersistentWriteFence(fence);
      setWriter(false);
      return { writer: false, readOnly: true };
    }
    writeStoredLease({ instanceId, claimedAt, heartbeatAt: Date.now(), epoch: fence.epoch });
    setWriter(true, claimedAt, fence.epoch);
    startHeartbeat();
    post({ type: "takeover", instanceId, claimedAt, epoch: fence.epoch });
    return { writer: true, readOnly: false, epoch: fence.epoch };
  } catch (error) {
    if (storedLeaseBelongsToMe()) removeStoredLease();
    setWriter(false);
    return { writer: false, readOnly: true, error };
  }
}

async function releaseWriteLease() {
  stopHeartbeat();
  const expectedFence = { ownerId: instanceId, epoch: Number(leaseState.epoch) || 0 };
  try {
    if (expectedFence.epoch > 0) await releasePersistentWriteFence(expectedFence);
  } catch (error) {
    console.warn("Persistent write fence release failed.", error);
  }
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
    return forceTakeOverWriteLease().then((result) => result.writer
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
  // Order matters: the writer's last keystrokes first -- they live in the DOM
  // until a commit pulls them into the record, and everything below persists
  // the record. Then draft, Working Session, desk state.
  if (typeof flushWorkingProgress === "function") flushWorkingProgress();
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
  await releaseWriteLease();
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
      acquireWriteLease().then((result) => {
        takeoverInFlight?.resolve?.(result.writer
          ? { ok: true, writer: true }
          : { ok: false, reason: "claim-failed" });
      });
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
async function reconcileWriteLease() {
  const stored = currentStoredLease();
  if (
    stored?.instanceId === instanceId
    && Number(stored.epoch) === Number(leaseState.epoch)
    && Number(stored.epoch) > 0
  ) {
    if (leaseIsFresh(stored)) {
      const persistentOwner = await ownsPersistentWriteFence({
        ownerId: instanceId,
        epoch: Number(stored.epoch),
      }).catch(() => false);
      if (!persistentOwner) {
        stopHeartbeat();
        setWriter(false);
        return { writer: false, readOnly: true, owner: "persistent-fence" };
      }
      setWriter(true, Number(stored.claimedAt) || Date.now(), Number(stored.epoch));
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
    if (document.visibilityState !== "visible") return;
    reconcileWriteLease().then(() => reclaimWriteLeaseOnFocus());
  });
  // A background window that never lost visibility (a second desktop window
  // rather than a tab) still becomes the one being written in when it is
  // clicked. Same silent reclaim, same focus gate.
  window.addEventListener("focus", () => {
    reclaimWriteLeaseOnFocus();
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
  // Losing the lease is no longer news for the user - the window keeps working
  // and its writes travel. Saying "read only" here would describe a state that
  // no longer stops anything.
  refreshWriteLeaseSurfaces();
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
  // showModal()'s own initial-focus algorithm lands on the first focusable
  // descendant in tree order (readOnlyButton) regardless of which button
  // carries the "default" class in the HTML — the same mismatch fixed in
  // modal.js's showSystemModal. Focus the button the dialog actually marks
  // default so Enter fires it, not whichever button happens to come first.
  takeoverButton.focus();
  return true;
}

async function requestForceTakeoverWithConfirm() {
  const stored = currentStoredLease();
  const staleOwner = !stored || !leaseIsFresh(stored);
  if (!staleOwner && typeof showSystemModal === "function") {
    const choice = await showSystemModal(t("write_lease_force_confirm"), "confirm", { defaultAction: "cancel" });
    if (choice !== "yes") return false;
  }
  const result = await forceTakeOverWriteLease();
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

// Opening a second window used to stop the writer with a modal before they had
// typed anything - a prompt for the case that is almost always safe, which is
// how a permission dialog stops being read. The protocol can answer it itself:
// a safe takeover makes the other window flush every durable write BEFORE it
// releases, and it refuses outright if that flush fails. So the common path is
// silent, and a dialog only appears when the answer is a real decision: the
// other window is holding work it could not save.
async function takeOverSilentlyOrAsk({ announce = true } = {}) {
  const takeover = await requestSafeTakeover().catch(() => ({ ok: false, reason: "error" }));
  if (takeover?.ok) return { writer: true, readOnly: false, silent: true };
  if (announce) setTimeout(() => showWriteLeaseDialog({ denied: true }), 0);
  return { writer: false, readOnly: true, reason: takeover?.reason || "denied" };
}

async function acquireWriteLeaseAtBoot() {
  const result = await acquireWriteLease();
  if (!result.readOnly) return result;
  // Booting hidden is not a statement of intent. A restored session tab, a
  // background window, a second app instance opened behind the one in use -
  // each used to take the pen out of the window the user was typing in, which
  // is the same invariant reclaimWriteLeaseOnFocus already keeps: a hidden
  // window never takes the pen. Focus hands it over the moment they look.
  if (document.visibilityState === "hidden") return result;
  const handover = await takeOverSilentlyOrAsk();
  return handover.writer ? handover : result;
}

// Coming back to a window the user is looking at is the clearest possible
// statement of intent, so the pen follows it. The invariant is only that a
// HIDDEN window never takes the pen - it cannot be the one being typed in.
// Document focus is deliberately not required: a tab can be fronted with the
// caret still in the browser's own chrome, and the writer would then find the
// window they are staring at inexplicably read-only.
async function reclaimWriteLeaseOnFocus() {
  if (leaseState.mode === "writer") return false;
  if (document.visibilityState === "hidden") return false;
  const stored = currentStoredLease();
  if (!stored || stored.instanceId === instanceId || !leaseIsFresh(stored)) return false;
  const handover = await takeOverSilentlyOrAsk({ announce: false });
  return handover.writer === true;
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
  reclaimOnFocus: reclaimWriteLeaseOnFocus,
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
  registerReadOnlyRule,
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
