// Canonical AI System 6 HTTP entry point. Boots on PORT (default 4173) and
// delegates API dispatch to server/router.js.
//
// Dispatch order:
//   1. Exact API route match.
//   2. Prefix route match.
//   3. GET / HEAD fall through to the apps/desktop static root.
//   4. Everything else returns a structured 404.

"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { sendJson } = require("./server/lib/http.js");
const {
  resolveRoute,
  listMigratedRoutes,
} = require("./server/router.js");
const { appName, appVersion, appBuild } = require("./server/lib/build-info.js");
const { handleStatic } = require("./server/static.js");
const { deploymentProfile } = require("./server/runtime-profile.js");
const {
  handleBrowseHost,
  handleBrowseUpgrade,
  isBrowseHostRequest,
} = require("./server/browse/relay-node.js");
const { runWithPublicGuard } = require("./server/security/public-session.js");
const {
  applySecurityHeaders,
  configuredLocalRequestPolicy,
  handleBrowserBridgePreflight,
  runWithLocalRequestGuard,
} = require("./server/security/local-request.js");

const port = Number(process.env.PORT || 4173);
const localRequestPolicy = configuredLocalRequestPolicy(port);
const host = localRequestPolicy.host;

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-ID", requestId);
  // The browse origin is a different site served by this process. It shares
  // no route, header or file with the desk, so it is split off first.
  if (isBrowseHostRequest(req)) {
    try {
      await handleBrowseHost(req, res);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", request_id: requestId, browse: true, error: String(error?.message || error) }));
      if (!res.headersSent) res.writeHead(500).end();
      else res.destroy();
    }
    return;
  }
  applySecurityHeaders(res);
  if (
    deploymentProfile === "public"
    && String(req.url || "").split("?")[0].startsWith("/api/")
  ) {
    res.setHeader("Cache-Control", "no-store");
  }
  try {
    if (
      deploymentProfile !== "public"
      && handleBrowserBridgePreflight(req, res, localRequestPolicy)
    ) return;
    const handler = resolveRoute(req);
    if (handler) {
      if (deploymentProfile === "public") {
        await runWithPublicGuard(req, res, () => handler(req, res));
      } else {
        await runWithLocalRequestGuard(
          req,
          res,
          localRequestPolicy,
          () => handler(req, res)
        );
      }
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await handleStatic(req, res);
      return;
    }

    sendJson(res, 404, { error: "Not found", request_id: requestId });
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(/** @type {any} */ (error).message)
        : String(error);
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? Number(/** @type {any} */ (error).statusCode) || 500
        : 500;
    console.error(JSON.stringify({
      level: "error",
      request_id: requestId,
      method: req.method || "GET",
      path: String(req.url || "/").split("?")[0],
      status,
      error: message,
    }));
    sendJson(res, status, {
      error: status < 500 ? message : "Unhandled server error",
      ...(status < 500 && /** @type {any} */ (error)?.code
        ? { code: String(/** @type {any} */ (error).code) }
        : {}),
      request_id: requestId,
    });
  }
});

// WebSockets exist only on the browse origin, for the pages Time Machine
// shows; the desk itself opens none.
server.on("upgrade", (req, socket, head) => {
  if (isBrowseHostRequest(req)) {
    handleBrowseUpgrade(req, socket, head);
    return;
  }
  socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
});

server.headersTimeout = 10000;
// DeepSeek Files API permits a ten-minute streaming upload. Other routes own
// tighter application timeouts and body limits; headers remain capped at ten
// seconds, while the public file route has its own concurrency fence.
server.requestTimeout = 610000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;

server.listen(port, host, () => {
  console.log(`AI System 6 server running at http://${host}:${port}`);
  console.log(`${appName} ${appVersion} build ${appBuild}`);
  console.log(`Deployment profile: ${deploymentProfile}`);
  console.log(`LAN access: ${localRequestPolicy.allowLan ? "enabled with token" : "disabled"}`);
  const registeredRoutes = listMigratedRoutes();
  // The full METHOD PATH list is a debugging aid. Startup prints the count.
  if (process.env.AI_SYSTEM6_LOG_ROUTES === "1") {
    console.log(`Routes: ${registeredRoutes.join(", ") || "(none)"}`);
  } else {
    console.log(`Routes: ${registeredRoutes.length}`);
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; draining HTTP connections.`);
  server.close(() => process.exit(0));
  setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 20000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
