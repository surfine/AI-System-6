// Static file handler. Serves index.html, the bundled app, raw
// stylesheets, the endfield-terminal page, and the small set of
// other asset extensions the client actually requests.
//
// The desktop product is the static root. Repository-level mounts are explicit
// exceptions for third-party reference assets and archived demo material.
//
// Behavior parity with `serveFile` from root server.js:
// - "/" maps to "/index.html".
// - path.normalize is applied before the traversal guard so
//   "/../etc/passwd" cannot escape the static root.
// - mimeTypes returns "application/octet-stream" for anything not
//   in the small allowlist.
// - .html / .js / .mjs / .css get an aggressive no-cache triple
//   (Cache-Control + Pragma + Expires).
// - Any read error -> 404 plain text "Not found".

"use strict";

const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");

const { send } = require("./lib/http.js");
const { desktopRoot, repoRoot } = require("./lib/build-info.js");

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
  ".mjs": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".dat": "application/octet-stream",
  ".gz": "application/gzip",
  ".usdz": "model/vnd.usdz+zip",
});

const exactPublicFiles = new Set([
  "index.html",
  "app.bundle.js",
  "styles.bundle.css",
  "styles.theme-lab.css",
  "styles.draft-desk.css",
  "styles.control-strip.css",
  "styles.micropolis.css",
  "styles.openttd.css",
  "styles.bonsai.css",
  "styles.cmf-studio.css",
  "styles.endfield-terminal.css",
  "styles.bureaucracy-meme.css",
  "styles.time-machine.css",
  "styles.clio-chart.css",
  "styles.clio-paint.css",
  "styles.soundscape.css",
  "styles.liquid-cover.css",
  "styles.image-prompt-studio.css",
  "endfield-terminal.html",
]);

// Browser dependencies use stable app-owned URLs. Development and packaged
// builds serve the installed source files through these aliases; web releases
// copy the same bytes into public/app/vendor so Nginx never exposes a general
// node_modules route.
const publicFileAliases = new Map([
  ["app/vendor/paddle-ocr.js", "node_modules/@paddlejs-models/ocr/lib/index.js"],
  ["app/vendor/pdf.min.js", "node_modules/pdfjs-dist/build/pdf.min.mjs"],
  ["app/vendor/pdf.worker.min.js", "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"],
  ["app/vendor/pdfjs-wasm/jbig2.wasm", "node_modules/pdfjs-dist/wasm/jbig2.wasm"],
  ["app/vendor/pdfjs-wasm/jbig2_nowasm_fallback.js", "node_modules/pdfjs-dist/wasm/jbig2_nowasm_fallback.js"],
  ["app/vendor/pdfjs-wasm/openjpeg.wasm", "node_modules/pdfjs-dist/wasm/openjpeg.wasm"],
  ["app/vendor/pdfjs-wasm/openjpeg_nowasm_fallback.js", "node_modules/pdfjs-dist/wasm/openjpeg_nowasm_fallback.js"],
  ["app/vendor/pdfjs-wasm/qcms_bg.wasm", "node_modules/pdfjs-dist/wasm/qcms_bg.wasm"],
]);

const desktopPublicPrefixes = [
  "app/",
  "assets/",
  "data/",
];

const repositoryPublicPrefixes = [
  "system.css-reference/",
  "endfield-archive/public/",
];

function publicRelativePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return "";
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return "";
  const relative = decoded.replace(/^\/+/, "");
  const normalized = path.posix.normalize(relative);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return "";
  }
  if (normalized.split("/").some((part) => part.startsWith("."))) return "";
  if (exactPublicFiles.has(normalized)) return normalized;
  if (publicFileAliases.has(normalized)) return publicFileAliases.get(normalized);
  if (desktopPublicPrefixes.some((prefix) => normalized.startsWith(prefix))) return normalized;
  if (repositoryPublicPrefixes.some((prefix) => normalized.startsWith(prefix))) return normalized;
  return "";
}

function resolvePublicFile(relative) {
  if (relative.startsWith("node_modules/")) return path.resolve(repoRoot, relative);
  if (relative.startsWith("endfield-archive/public/")) {
    return path.resolve(repoRoot, "internal", "archive", "endfield", "public", relative.slice("endfield-archive/public/".length));
  }
  if (repositoryPublicPrefixes.some((prefix) => relative.startsWith(prefix))) {
    return path.resolve(repoRoot, relative);
  }
  return path.resolve(desktopRoot, relative);
}

function cacheHeaders(relative, ext, url) {
  const versioned = Boolean(url?.searchParams?.get("v"));
  const contentHashed = /(?:^|[.-])[a-f0-9]{8,}(?:[.-]|$)/i.test(path.basename(relative));
  if (versioned || contentHashed) {
    return { "Cache-Control": "public, max-age=31536000, immutable" };
  }
  if (relative === "index.html" || ext === ".html" || ext === ".js" || ext === ".mjs" || ext === ".css") {
    return { "Cache-Control": "no-cache" };
  }
  // Stable, unversioned asset/data/manifest URLs can change at the next build.
  // Revalidate them instead of keeping stale bytes for seven days.
  return { "Cache-Control": "no-cache" };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const relative = publicRelativePath(pathname);
  if (!relative) {
    send(res, 404, "Not found", { "Content-Type": "text/plain" });
    return;
  }

  const filePath = resolvePublicFile(relative);
  if (filePath !== repoRoot && !filePath.startsWith(`${repoRoot}${path.sep}`)) {
    send(res, 404, "Not found", { "Content-Type": "text/plain" });
    return;
  }

  try {
    const stat = await fsPromises.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "ETag": etag,
      ...cacheHeaders(relative, ext, url),
    };
    if (relative.startsWith("assets/openttd/") || relative.startsWith("assets/doom/")) {
      // Wasm game shells run inside the desktop's same-origin iframe, and
      // WebAssembly compilation needs 'wasm-unsafe-eval'. The global policy
      // (frame-ancestors 'none', no wasm) stays in force everywhere else;
      // foreign origins still cannot embed the game.
      headers["X-Frame-Options"] = "SAMEORIGIN";
      headers["Content-Security-Policy"] = [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'self'",
      ].join("; ");
    }
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        send(res, 404, "Not found", { "Content-Type": "text/plain" });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch {
    send(res, 404, "Not found", { "Content-Type": "text/plain" });
  }
}

module.exports = { cacheHeaders, handleStatic, mimeTypes, publicRelativePath, resolvePublicFile };
