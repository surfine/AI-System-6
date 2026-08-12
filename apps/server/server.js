// Entry point for the apps/server/ rewrite. Boots an HTTP server on its own
// port (default 4273) and delegates dispatch to server/router.js.
//
// Dispatch order, mirroring the bottom of root server.js:
//   1. Exact route match (full request URL incl. query).
//   2. Prefix route match.
//   3. GET / HEAD fall through to static file serving from the repo
//      root (index.html, app.bundle.js, styles.bundle.css, etc).
//   4. Everything else returns a structured "Not migrated yet" JSON.
//      At this checkpoint all known root API routes are represented in
//      apps/server/server/router.js; this fallback remains useful for future
//      route additions and parity checks.

"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { sendJson } = require("./server/lib/http.js");
const {
  resolveRoute,
  listMigratedRoutes,
  unmigratedRoutes,
} = require("./server/router.js");
const { appName, appVersion, appBuild } = require("./server/lib/build-info.js");
const { handleStatic } = require("./server/static.js");
const { deploymentProfile } = require("./server/runtime-profile.js");
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

    sendJson(res, 404, deploymentProfile === "public"
      ? { error: "Not found", request_id: requestId }
      : {
          error: "Not migrated yet",
          detail: `${req.method || "GET"} ${req.url || "/"} is not handled by apps/server/. ` +
            `Use the root server on its own port for production routes.`,
          migrated: listMigratedRoutes(),
          unmigrated: unmigratedRoutes,
        });
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
      request_id: requestId,
    });
  }
});

server.headersTimeout = 10000;
server.requestTimeout = 120000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;

server.listen(port, host, () => {
  console.log(`AI System 6 (apps/server/ rewrite) running at http://${host}:${port}`);
  console.log(`${appName} ${appVersion} build ${appBuild}`);
  console.log(`Deployment profile: ${deploymentProfile}`);
  console.log(`LAN access: ${localRequestPolicy.allowLan ? "enabled with token" : "disabled"}`);
  console.log(`Migrated routes: ${listMigratedRoutes().join(", ") || "(none)"}`);
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
