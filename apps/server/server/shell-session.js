"use strict";

// A shell-owned listener never adopts another process just because it serves
// HTTP 200. This proof is private to the backend and its own Node child.
const crypto = require("node:crypto");
const { sendJson } = require("./lib/http.js");
const { appVersion, appBuild, appSourceCommit } = require("./lib/build-info.js");

const token = String(process.env.AI_SYSTEM6_SHELL_TOKEN || "");
const parentPid = Number(process.env.AI_SYSTEM6_SHELL_PARENT_PID || 0);
const owned = !require("./runtime-profile.js").isPublicDeployment && /^[a-f0-9]{64}$/.test(token) && Number.isSafeInteger(parentPid) && parentPid > 1;

function handleShellSession(req, res) {
  const path = (req.url || "").split("?")[0];
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  if (["/api/shell/bootstrap", "/api/shell/bootstrap.js"].includes(path)) {
    if (!owned || req.method !== "GET" || !loopback) {
      sendJson(res, 404, { error: "Not found" }, { "Cache-Control": "no-store" });
    } else {
      // /api always bypasses the previous browser service worker. Remove only
      // derived offline caches; projects and browser storage remain intact.
      const script = `(async()=>{try{if(navigator.serviceWorker){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.filter(r=>[r.active,r.waiting,r.installing].some(w=>w&&new URL(w.scriptURL).pathname==="/sw.js")).map(r=>r.unregister()));}if(window.caches){await Promise.all((await caches.keys()).filter(n=>n.startsWith("ais6-")).map(n=>caches.delete(n)));}location.replace("/");}catch{document.body.textContent="Could not prepare the local application. Please restart.";}})();`;
      res.writeHead(200, { "Content-Type": path.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8", "Cache-Control": "no-store" });
      // Silent handoff: this page only clears the previous service worker's
      // derived caches and hands over to "/". The desk's own boot screen owns
      // the visible "starting" message; printing it here as well showed the
      // same sentence twice, once here unstyled.
      res.end(path.endsWith(".js") ? script : '<!doctype html><meta charset="utf-8"><title>AI System 6</title><style>html{background:#e9e9e9}</style><body><script src="/api/shell/bootstrap.js"></script>');
    }
    return true;
  }
  if (path !== "/api/shell/identity") return false;
  const supplied = String(req.headers["x-ai-system6-shell-token"] || "");
  const valid = owned && req.method === "GET" && /^[a-f0-9]{64}$/.test(supplied)
    && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
    && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  if (!valid) sendJson(res, 404, { error: "Not found" }, { "Cache-Control": "no-store" });
  else sendJson(res, 200, {
    version: appVersion, build: appBuild, sourceCommit: appSourceCommit,
    pid: process.pid, parentPid,
  }, { "Cache-Control": "no-store" });
  return true;
}

function watchShellParent(onDeath) {
  if (!owned) return null;
  const timer = setInterval(() => {
    try { process.kill(parentPid, 0); }
    catch { clearInterval(timer); onDeath(); }
  }, 500);
  timer.unref();
  return timer;
}

module.exports = { shellOwned: owned, handleShellSession, watchShellParent };
