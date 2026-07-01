// Static file handler. Serves index.html, the bundled app, raw
// stylesheets, the endfield-terminal page, and the small set of
// other asset extensions the client actually requests.
//
// Files are served from the repo root, not from src/. While src/
// holds the rewritten server, the existing client bundle still
// lives at the repo root alongside index.html. When src/ eventually
// replaces root entirely, the static root becomes redundant.
//
// Behavior parity with `serveFile` from root server.js:
// - "/" maps to "/index.html".
// - path.normalize is applied before the traversal guard so
//   "/../etc/passwd" cannot escape the static root.
// - mimeTypes returns "application/octet-stream" for anything not
//   in the small allowlist.
// - .html / .js / .css get an aggressive no-cache triple
//   (Cache-Control + Pragma + Expires).
// - Any read error -> 404 plain text "Not found".

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { send } = require("./lib/http.js");
const { repoRoot } = require("./lib/build-info.js");

/**
 * Extension -> Content-Type. Same five entries as root. Anything
 * else falls back to application/octet-stream.
 *
 * @type {Readonly<Record<string, string>>}
 */
const mimeTypes = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
});

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(repoRoot, path.normalize(safePath));

  if (!filePath.startsWith(repoRoot)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain" });
    return;
  }
  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const cacheHeaders = (ext === ".html" || ext === ".js" || ext === ".css")
      ? { "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0" }
      : {};
    send(res, 200, file, Object.assign({ "Content-Type": contentType }, cacheHeaders));
  } catch {
    send(res, 404, "Not found", { "Content-Type": "text/plain" });
  }
}

module.exports = { handleStatic, mimeTypes };
