// Agent executor broker.
//
// The server holds no project state: the browser page owns IndexedDB. A guest
// agent that reaches /mcp therefore never touches a record directly. Each tool
// call is forwarded down one Server-Sent Events stream to the page (the
// executor), the page performs it against its own stores, and answers on
// POST /api/agent/executor/reply. This module is that in-memory relay plus the
// per-session table for connected guests. Nothing here survives a restart, on
// purpose: approvals live in the page's settings, not in this process.
//
// One desk or many. On this Mac there is one desk, so a second page taking
// the role replaces the first and is told so. On the public deployment every
// visitor's browser is its own desk, so executors are kept side by side and a
// guest must say which desk it was invited to: the invitation is a signed
// token naming that desk (security/public-session.js issues it). Without that
// pairing a guest would reach whichever stranger loaded the page last.

"use strict";

const crypto = require("node:crypto");

const { isPublicDeployment } = require("./runtime-profile.js");

const EXECUTOR_PING_MS = 25_000;
const DEFAULT_CALL_TIMEOUT_MS = Math.max(1_000, Number(process.env.AI_SYSTEM6_AGENT_CALL_TIMEOUT_MS || 60_000));
const GUEST_SESSION_IDLE_MS = 30 * 60 * 1_000;
const GUEST_CALL_WINDOW_MS = 60_000;
const GUEST_CALL_LIMIT = 60;

/**
 * @typedef {object} Executor
 * @property {string} id
 * @property {string} deskId
 * @property {import("node:http").ServerResponse} res
 * @property {number} connectedAt
 * @property {NodeJS.Timeout} ping
 */

/** @type {Map<string, Executor>} keyed by desk id */
const executors = new Map();
/** @type {Map<string, { resolve: (value: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout }>} */
const pending = new Map();
/** @type {Map<string, GuestSession>} */
const guestSessions = new Map();

/**
 * @typedef {object} GuestSession
 * @property {string} id
 * @property {string} deskId
 * @property {string} name
 * @property {string} purpose
 * @property {string} requestedPrivilege
 * @property {{ status: string, privilege: string }} approval
 * @property {boolean} initialized
 * @property {string} protocolVersion
 * @property {number} createdAt
 * @property {number} lastSeenAt
 * @property {number[]} callTimes
 */

/**
 * @param {string} code
 * @param {string} message
 */
function executorError(code, message) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  return error;
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {string} event
 * @param {unknown} payload
 */
function writeEvent(res, event, payload) {
  if (res.destroyed || res.writableEnded) return false;
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  return true;
}

/** @param {string} deskId */
function normalizeDeskId(deskId) {
  const value = String(deskId || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : "";
}

/**
 * The desk a guest with no invitation reaches. On this Mac that is the one
 * open desk; on the public deployment there is no such thing, and a guest
 * must present the token that names its desk.
 */
function soleExecutor() {
  if (isPublicDeployment) return null;
  return executors.size === 1 ? [...executors.values()][0] : null;
}

/** @param {string} deskId */
function executorForDesk(deskId) {
  const id = normalizeDeskId(deskId);
  if (!id) return soleExecutor();
  const executor = executors.get(id);
  if (!executor || executor.res.destroyed || executor.res.writableEnded) return null;
  return executor;
}

/** @param {string} [deskId] */
function hasExecutor(deskId) {
  return Boolean(deskId === undefined ? soleExecutor() : executorForDesk(deskId));
}

function deskIsOpen(deskId) {
  return Boolean(executorForDesk(deskId));
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {string} [requestedDeskId]
 */
function attachExecutor(res, requestedDeskId = "") {
  const deskId = normalizeDeskId(requestedDeskId) || crypto.randomUUID();
  const previous = executors.get(deskId);
  if (previous) {
    clearInterval(previous.ping);
    writeEvent(previous.res, "replaced", { reason: "another executor connected" });
    previous.res.end();
    executors.delete(deskId);
  }
  // On this Mac there is one desk: a page that arrives under a different id
  // (a fresh profile, cleared settings) still takes the role, and the page it
  // replaces is told so rather than left answering in the dark.
  if (!isPublicDeployment) {
    [...executors.entries()].forEach(([otherDeskId, executor]) => {
      clearInterval(executor.ping);
      writeEvent(executor.res, "replaced", { reason: "another executor connected" });
      executor.res.end();
      executors.delete(otherDeskId);
    });
  }
  const id = crypto.randomUUID();
  const ping = setInterval(() => {
    if (executors.get(deskId)?.id !== id) return;
    if (!writeEvent(res, "ping", { at: Date.now() })) clearInterval(ping);
  }, EXECUTOR_PING_MS);
  // The stream is kept open by its own socket; this timer only writes into
  // one, so it must never be the reason the process stays alive.
  ping.unref?.();
  executors.set(deskId, { id, deskId, res, connectedAt: Date.now(), ping });
  res.on("close", () => {
    clearInterval(ping);
    if (executors.get(deskId)?.id !== id) return;
    executors.delete(deskId);
    for (const [callId, entry] of pending) {
      if (!callId.startsWith(`${id}:`)) continue;
      clearTimeout(entry.timer);
      pending.delete(callId);
      entry.reject(executorError("executor_gone", "AI System 6 closed before it could answer."));
    }
  });
  writeEvent(res, "hello", { executorId: id, deskId, guests: listGuests(deskId) });
  return { executorId: id, deskId };
}

/**
 * @param {string} method
 * @param {unknown} params
 * @param {{ timeoutMs?: number, deskId?: string }} [options]
 * @returns {Promise<{ ok: boolean, result?: any, error?: string }>}
 */
function callExecutor(method, params, options = {}) {
  const executor = options.deskId === undefined ? soleExecutor() : executorForDesk(options.deskId);
  if (!executor) {
    return Promise.reject(executorError("no_executor", "AI System 6 is not open."));
  }
  const timeoutMs = Math.max(250, Number(options.timeoutMs) || DEFAULT_CALL_TIMEOUT_MS);
  const callId = `${executor.id}:${crypto.randomUUID()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(callId);
      reject(executorError("timeout", `AI System 6 did not answer within ${Math.round(timeoutMs / 1000)} s.`));
    }, timeoutMs);
    pending.set(callId, { resolve, reject, timer });
    if (!writeEvent(executor.res, "call", { callId, method, params })) {
      clearTimeout(timer);
      pending.delete(callId);
      reject(executorError("executor_gone", "AI System 6 closed before it could answer."));
    }
  });
}

/**
 * @param {string} callId
 * @param {{ ok?: boolean, result?: any, error?: string }} payload
 */
function resolveReply(callId, payload) {
  const entry = pending.get(String(callId || ""));
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(String(callId));
  entry.resolve({
    ok: payload?.ok !== false,
    result: payload?.result,
    error: payload?.error ? String(payload.error) : "",
  });
  return true;
}

/**
 * @param {string} event
 * @param {unknown} payload
 * @param {string} [deskId]
 */
function notifyExecutor(event, payload, deskId) {
  const executor = deskId === undefined ? soleExecutor() : executorForDesk(deskId);
  if (!executor) return false;
  return writeEvent(executor.res, event, payload);
}

function pruneIdleGuests(now = Date.now()) {
  for (const [id, session] of guestSessions) {
    if (now - session.lastSeenAt > GUEST_SESSION_IDLE_MS) guestSessions.delete(id);
  }
}

/**
 * @param {{ name?: string, purpose?: string, requestedPrivilege?: string, protocolVersion?: string, deskId?: string }} input
 * @returns {GuestSession}
 */
function createGuestSession(input = {}) {
  pruneIdleGuests();
  const now = Date.now();
  const session = {
    id: crypto.randomUUID(),
    deskId: normalizeDeskId(input.deskId),
    name: String(input.name || "").trim().slice(0, 80) || "Unnamed agent",
    purpose: String(input.purpose || "").trim().slice(0, 400),
    requestedPrivilege: String(input.requestedPrivilege || "").trim(),
    approval: { status: "unknown", privilege: "" },
    initialized: false,
    protocolVersion: String(input.protocolVersion || ""),
    createdAt: now,
    lastSeenAt: now,
    callTimes: [],
  };
  guestSessions.set(session.id, session);
  notifyExecutor("guests", { guests: listGuests(session.deskId) }, session.deskId || undefined);
  return session;
}

/** @param {string} sessionId */
function getGuestSession(sessionId) {
  const session = guestSessions.get(String(sessionId || ""));
  if (!session) return null;
  session.lastSeenAt = Date.now();
  return session;
}

/** @param {string} sessionId */
function deleteGuestSession(sessionId) {
  const session = guestSessions.get(String(sessionId || ""));
  const removed = guestSessions.delete(String(sessionId || ""));
  if (removed) notifyExecutor("guests", { guests: listGuests(session?.deskId) }, session?.deskId || undefined);
  return removed;
}

/**
 * One guest may not hammer the writer's desk: sixty tool calls a minute is
 * more than a review needs and far less than a loop gone wrong produces.
 *
 * @param {GuestSession} session
 */
function guestRateLimited(session, now = Date.now()) {
  session.callTimes = session.callTimes.filter((at) => now - at < GUEST_CALL_WINDOW_MS);
  if (session.callTimes.length >= GUEST_CALL_LIMIT) return true;
  session.callTimes.push(now);
  return false;
}

/** @param {string} [deskId] Only this desk's guests; every guest when absent. */
function listGuests(deskId) {
  pruneIdleGuests();
  const scope = normalizeDeskId(deskId);
  return [...guestSessions.values()]
    .filter((session) => !scope || !session.deskId || session.deskId === scope)
    .map((session) => ({
      sessionId: session.id,
      name: session.name,
      purpose: session.purpose,
      requestedPrivilege: session.requestedPrivilege,
      status: session.approval.status,
      privilege: session.approval.privilege,
      connectedAt: new Date(session.createdAt).toISOString(),
      lastSeenAt: new Date(session.lastSeenAt).toISOString(),
    }));
}

/** Test seam: forget every executor and guest without restarting the process. */
function resetAgentExecutorForTests() {
  executors.forEach((executor) => {
    clearInterval(executor.ping);
    executor.res.end();
  });
  executors.clear();
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
  guestSessions.clear();
}

module.exports = {
  DEFAULT_CALL_TIMEOUT_MS,
  GUEST_CALL_LIMIT,
  attachExecutor,
  callExecutor,
  createGuestSession,
  deleteGuestSession,
  deskIsOpen,
  getGuestSession,
  guestRateLimited,
  hasExecutor,
  listGuests,
  normalizeDeskId,
  notifyExecutor,
  resetAgentExecutorForTests,
  resolveReply,
};
