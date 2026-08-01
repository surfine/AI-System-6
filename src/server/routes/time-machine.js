"use strict";

const { send, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const {
  READER_TIMEOUT_MS,
  TIME_MACHINE_TIMEOUT_MS,
  timeMachineUrl,
  timeMachineTargetDate,
  timeMachineCalendarYear,
  normalizeTimeMachineProvider,
  queryWaybackCaptures,
  queryWaybackCalendar,
  queryArchiveIsCaptures,
  browseTimeMachinePage,
  renderTimeMachineFrameDocument,
  TIME_MACHINE_FRAME_CSP,
  timeMachineError,
} = require("../time-machine.js");

const TIME_MACHINE_PROVIDER_TIMEOUT_MS = Math.min(9000, READER_TIMEOUT_MS - 3000);

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
}

async function handleCaptures(res, params, signal) {
  const originalUrl = timeMachineUrl(params.get("url"));
  const targetDate = timeMachineTargetDate(params.get("date"));
  const provider = normalizeTimeMachineProvider(params.get("provider") || "auto");
  if (!provider) {
    sendJson(res, 400, { error: "Unknown archive provider." });
    return;
  }

  const providerOrder = provider === "archive-is"
    ? ["archive-is", "wayback"]
    : ["wayback", "archive-is"];
  const providerQueries = {
    wayback: queryWaybackCaptures,
    "archive-is": queryArchiveIsCaptures,
  };
  const jobs = providerOrder.map((id) => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error(`${id} timed out.`)), TIME_MACHINE_PROVIDER_TIMEOUT_MS);
    const promise = providerQueries[id](originalUrl, targetDate, controller.signal)
      .finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      });
    return [id, promise];
  });
  const settled = await Promise.allSettled(jobs.map((entry) => entry[1]));
  const providers = {};
  const captures = [];
  settled.forEach((result, index) => {
    const id = jobs[index][0];
    if (result.status === "fulfilled") {
      providers[id] = { status: result.value.length ? "ready" : "empty", count: result.value.length };
      captures.push(...result.value);
    } else {
      providers[id] = { status: "error", count: 0, detail: timeMachineError(result.reason) };
    }
  });
  captures.sort((a, b) => {
    if (!targetDate) return String(b.capturedAt || "").localeCompare(String(a.capturedAt || ""));
    const target = Date.parse(`${targetDate}T12:00:00.000Z`);
    const distance = (capture) => {
      const captured = Date.parse(capture?.capturedAt || "");
      return Number.isNaN(captured) ? Number.POSITIVE_INFINITY : Math.abs(captured - target);
    };
    return distance(a) - distance(b);
  });
  sendJson(res, 200, {
    originalUrl,
    targetDate,
    preferredProvider: provider,
    providers,
    captures,
    closest: (provider === "auto"
      ? captures
      : captures.filter((capture) => capture.provider === provider))[0] || captures[0] || null,
  });
}

async function handleBrowse(res, params, signal) {
  const targetUrl = timeMachineUrl(params.get("url"));
  const originalUrl = params.get("original") ? timeMachineUrl(params.get("original")) : "";
  const page = await browseTimeMachinePage(targetUrl, originalUrl, signal);
  sendJson(res, 200, page);
}

/**
 * Serves an archived page as a real fetched document, not a srcdoc string.
 * The #time-machine-frame iframe's own <meta> CSP already allows http/https
 * images, but a srcdoc document additionally inherits the app's global CSP
 * (img-src 'self' data: blob: — see security/local-request.js), and a
 * resource must satisfy every applicable policy, so the stricter global one
 * silently wins and every archived image shows as a broken-image icon. This
 * route gives the frame its own fetched response with its own response-
 * header CSP instead, so only this sandboxed viewer gets the relaxed
 * img-src — the rest of the app keeps the strict default.
 */
async function handleRender(res, params, signal) {
  const targetUrl = timeMachineUrl(params.get("url"));
  const originalUrl = params.get("original") ? timeMachineUrl(params.get("original")) : "";
  const page = await browseTimeMachinePage(targetUrl, originalUrl, signal);
  const html = renderTimeMachineFrameDocument(page);
  send(res, 200, html, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": TIME_MACHINE_FRAME_CSP,
    // The app's global X-Frame-Options: DENY (security/local-request.js)
    // would otherwise block this response from displaying inside the
    // #time-machine-frame iframe that is meant to embed it — SAMEORIGIN
    // still refuses framing by any other origin.
    "X-Frame-Options": "SAMEORIGIN",
  });
}

async function handleCalendar(res, params, signal) {
  const originalUrl = timeMachineUrl(params.get("url"));
  const year = timeMachineCalendarYear(params.get("year"));
  const calendar = await queryWaybackCalendar(originalUrl, year, signal);
  sendJson(res, 200, calendar);
}

async function handleTimeMachine(req, res) {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  const params = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams;
  const parentSignal = requestSignal(req, res);
  const timeout = withTimeoutSignal(parentSignal, TIME_MACHINE_TIMEOUT_MS);
  try {
    if (pathname === "/api/time-machine/captures") {
      await handleCaptures(res, params, timeout.signal);
      return;
    }
    if (pathname === "/api/time-machine/calendar") {
      await handleCalendar(res, params, timeout.signal);
      return;
    }
    if (pathname === "/api/time-machine/browse") {
      await handleBrowse(res, params, timeout.signal);
      return;
    }
    if (pathname === "/api/time-machine/render") {
      await handleRender(res, params, timeout.signal);
      return;
    }
    sendJson(res, 404, { error: "Unknown Time Machine route." });
  } catch (error) {
    if (error?.name === "AbortError" && !timeout.timedOut()) return;
    const detail = timeout.timedOut() ? "Time Machine request timed out." : timeMachineError(error);
    const invalidRequest = /accepts only|date must|date is not valid|calendar year is not valid|unknown archive provider/i.test(String(error?.message || ""));
    sendJson(res, error?.statusCode === 400 || invalidRequest ? 400 : 502, {
      error: "Time Machine failed",
      detail,
    });
  } finally {
    timeout.cleanup();
  }
}

module.exports = { handleTimeMachine };
