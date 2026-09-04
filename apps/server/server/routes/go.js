// GET /go/:route — short standalone-launch links (1.0.52).
//
// Keep this route table in sync with:
// - apps/desktop/app/core/launch-intent.js  (client ?launch= allowlist)
// - functions/go/[route].js                 (Cloudflare Pages short links)

"use strict";

const LAUNCH_ROUTES = new Map([
  ["endfield-terminal", "open-endfield-terminal"],
  ["bonsai-city", "open-bonsai-city"],
  ["micropolis", "open-micropolis"],
  ["openttd", "open-openttd"],
  ["doom", "open-doom"],
  ["time-machine", "open-time-machine"],
  ["liquid-cover", "open-liquid-cover"],
]);

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function handleGoRedirect(req, res) {
  const url = new URL(req.url, "http://localhost");
  const match = url.pathname.match(/^\/go\/([a-z0-9-]+)\/?$/i);
  const route = match ? match[1].toLowerCase() : "";
  if (!LAUNCH_ROUTES.has(route)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const mode = url.searchParams.get("mode") === "fullscreen" ? "&mode=fullscreen" : "";
  res.writeHead(302, { Location: `/?launch=${encodeURIComponent(route)}${mode}` });
  res.end();
}

module.exports = { handleGoRedirect, LAUNCH_ROUTES };
