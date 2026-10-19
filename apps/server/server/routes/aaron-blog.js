// GET /api/aaron-blog/*
//
// The Aaron Lau reader app's content pack. The blog publishes a small JSON
// pack at https://aaronlau.me/ai6/; the desk cannot fetch it directly under
// the app CSP, so this route is the fixed, same-origin door. There is no
// caller-supplied URL: only the pack's known paths are reachable.
//
// Cache the response in memory for a few minutes so opening a post and then
// revisiting it does not hit Cloudflare twice. The app keeps its own durable
// cache in IndexedDB; this is only a request-level short circuit.

"use strict";

const { send } = require("../lib/http.js");

const BASE = "https://aaronlau.me/ai6/";
const MAX_BYTES = 12 * 1024 * 1024;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function packPathname(pathname) {
  const path = String(pathname || "").replace(/^\/api\/aaron-blog\/?/, "");
  if (path === "manifest" || path === "index" || path === "search") return `${path}.json`;
  const chunk = path.match(/^chunk\/(\d{4})$/);
  if (chunk) return `posts/${chunk[1]}.json`;
  return null;
}

async function fetchJson(relative) {
  const cached = cache.get(relative);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${BASE}${relative}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "AI-System-6-Aaron-Lau/1.0" },
      redirect: "error",
    });
    if (!response.ok) throw new Error(`blog pack ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) throw new Error("blog pack too large");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("blog pack too large");
    const data = JSON.parse(text);
    cache.set(relative, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function handleAaronBlog(req, res) {
  let pathname = "";
  try {
    pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    pathname = String(req.url || "").split("?")[0];
  }
  const relative = packPathname(pathname);
  if (!relative) {
    send(res, 404, JSON.stringify({ error: "Not found" }), { "Content-Type": "application/json" });
    return;
  }
  try {
    const data = await fetchJson(relative);
    send(res, 200, JSON.stringify(data), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
  } catch (error) {
    send(res, 502, JSON.stringify({
      error: "blog_unavailable",
      detail: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
    }), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  }
}

module.exports = { handleAaronBlog, packPathname, __clearCache: () => cache.clear() };
