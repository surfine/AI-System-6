// Entry point for the src/ rewrite. Boots an HTTP server on its own
// port (default 4273) and delegates dispatch to server/router.js.
//
// Dispatch order, mirroring the bottom of root server.js:
//   1. Exact route match (full request URL incl. query).
//   2. Prefix route match.
//   3. GET / HEAD fall through to static file serving from the repo
//      root (index.html, app.bundle.js, styles.bundle.css, etc).
//   4. Everything else returns a structured "Not migrated yet" JSON.
//      At this checkpoint all known root API routes are represented in
//      src/server/router.js; this fallback remains useful for future
//      route additions and parity checks.

"use strict";

const http = require("node:http");
const { sendJson } = require("./server/lib/http.js");
const {
  resolveRoute,
  listMigratedRoutes,
  unmigratedRoutes,
} = require("./server/router.js");
const { appName, appVersion, appBuild } = require("./server/lib/build-info.js");
const { handleStatic } = require("./server/static.js");

const port = Number(process.env.PORT || 4173);

const server = http.createServer(async (req, res) => {
  try {
    const handler = resolveRoute(req);
    if (handler) {
      await handler(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await handleStatic(req, res);
      return;
    }

    sendJson(res, 404, {
      error: "Not migrated yet",
      detail: `${req.method || "GET"} ${req.url || "/"} is not handled by src/. ` +
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
    sendJson(res, status, {
      error: "Unhandled server error",
      detail: message,
    });
  }
});

server.listen(port, () => {
  console.log(`AI System 6 (src/ rewrite) running at http://localhost:${port}`);
  console.log(`${appName} ${appVersion} build ${appBuild}`);
  console.log(`Migrated routes: ${listMigratedRoutes().join(", ") || "(none)"}`);
});
