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
//
// /api/aaron-blog/retrieve is SideAsk's evidence search over the blog. The
// blog generator publishes its own chunk index (ai6/rag.json) and names its
// SHA-256 in manifest.json; this route fetches it, refuses bytes that do not
// match, keeps the verified copy on disk for offline use, and ranks it with
// the shared runtime (app/shared/blog-rag-runtime.js). It never crawls the
// site and never calls a model.

"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { send } = require("../lib/http.js");
const https = require("node:https");
const { proxyUrlForTarget, httpProxyAgentFor } = require("../lib/proxy.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const ragRuntime = require("../../../desktop/app/shared/blog-rag-runtime.js");

const BASE = "https://aaronlau.me/ai6/";
const MAX_BYTES = 12 * 1024 * 1024;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

// A local build of the pack (internal/design-proposals/aaronlau-me/dist/ai6)
// can stand in for the published one: the blog and the desk are built side by
// side, so a new index can be read before it is deployed.
function packDir() {
  return String(process.env.AI_SYSTEM6_AARON_BLOG_PACK_DIR || "").trim();
}

function ragCacheDir() {
  return String(process.env.AI_SYSTEM6_AARON_BLOG_CACHE_DIR || "").trim()
    || path.join(os.homedir(), ".ai-system6", "aaron-blog");
}

function packPathname(pathname) {
  const path = String(pathname || "").replace(/^\/api\/aaron-blog\/?/, "");
  if (path === "manifest" || path === "index" || path === "search" || path === "long" || path === "rag") return `${path}.json`;
  const chunk = path.match(/^chunk\/(\d{4})$/);
  if (chunk) return `posts/${chunk[1]}.json`;
  return null;
}

function fetchTextViaProxy(url, proxy, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { Accept: "application/json", "User-Agent": "AI-System-6-Aaron-Lau/1.0" },
      agent: httpProxyAgentFor(proxy),
      timeout: timeoutMs,
    }, (response) => {
      if ((response.statusCode || 0) !== 200) {
        response.resume();
        reject(new Error(`blog pack ${response.statusCode}`));
        return;
      }
      const chunks = []; let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_BYTES) { request.destroy(new Error("blog pack too large")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("timeout"), { name: "AbortError" })));
    request.on("error", reject);
  });
}

async function fetchText(relative) {
  const dir = packDir();
  if (dir) {
    const text = await fs.readFile(path.join(dir, relative), "utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("blog pack too large");
    return text;
  }
  // The chunk index is a few megabytes; the small pack files keep the short wait.
  const timeoutMs = relative === "rag.json" ? 60_000 : 12_000;
  // A Mac that reaches the web through a proxy (HTTPS_PROXY or the macOS
  // setting) fetches the pack through it, as bonsai-osm and the reader do;
  // Node's own fetch ignores the proxy, and a direct route can crawl.
  const proxy = isPublicDeployment ? null : proxyUrlForTarget(`${BASE}${relative}`);
  if (proxy) return fetchTextViaProxy(`${BASE}${relative}`, proxy, timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(relative) {
  const cached = cache.get(relative);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const data = JSON.parse(await fetchText(relative));
  cache.set(relative, { at: Date.now(), data });
  return data;
}

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

let ragState = null;
let ragLoading = null;

function adoptRag(text, manifest, origin) {
  const pack = JSON.parse(text);
  const digest = sha256(text);
  ragState = {
    sha256: digest,
    text,
    manifest,
    origin,
    checkedAt: Date.now(),
    index: ragRuntime.buildIndex(pack, { sha256: digest }),
  };
  return ragState;
}

async function readDiskRag() {
  const dir = ragCacheDir();
  const [manifestText, text] = await Promise.all([
    fs.readFile(path.join(dir, "manifest.json"), "utf8"),
    fs.readFile(path.join(dir, "rag.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  if (!manifest?.rag?.sha256 || sha256(text) !== manifest.rag.sha256) throw new Error("cached blog index failed its hash check");
  return { manifest, text };
}

async function writeDiskRag(manifest, text) {
  const dir = ragCacheDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "rag.json.tmp"), text);
    await fs.rename(path.join(dir, "rag.json.tmp"), path.join(dir, "rag.json"));
    await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  } catch {
    // A read-only home only loses the offline copy; the memory copy serves.
  }
}

/**
 * The verified chunk index: the published one when the manifest is reachable,
 * else the last verified copy in memory or on disk (offline).
 */
async function loadRag() {
  if (ragState && Date.now() - ragState.checkedAt < CACHE_MS) return ragState;
  if (ragLoading) return ragLoading;
  ragLoading = (async () => {
    let manifest = null;
    let failure = null;
    try {
      manifest = JSON.parse(await fetchText("manifest.json"));
      if (!manifest?.rag?.sha256) throw new Error("the blog pack has no rag index yet");
    } catch (error) {
      failure = error;
      manifest = null;
    }
    if (manifest && ragState?.sha256 === manifest.rag.sha256) {
      ragState.checkedAt = Date.now();
      ragState.origin = "live";
      return ragState;
    }
    if (manifest) {
      try {
        const text = await fetchText(manifest.rag.path || "rag.json");
        if (sha256(text) !== manifest.rag.sha256) throw new Error("blog rag index failed its hash check");
        const state = adoptRag(text, manifest, "live");
        await writeDiskRag(manifest, text);
        return state;
      } catch (error) {
        failure = error;
      }
    }
    if (ragState) {
      ragState.checkedAt = Date.now();
      ragState.origin = "offline";
      return ragState;
    }
    try {
      const disk = await readDiskRag();
      return adoptRag(disk.text, disk.manifest, "offline");
    } catch {
      throw failure || new Error("blog rag index unavailable");
    }
  })().finally(() => {
    ragLoading = null;
  });
  return ragLoading;
}

function packMeta(state) {
  return {
    sha256: state.sha256,
    generatedAt: state.index.generatedAt,
    chunking: state.index.chunking,
    runtime: state.index.version,
    chunks: state.index.chunks.length,
    docs: state.index.docs.length,
    offline: state.origin === "offline",
  };
}

async function handleRetrieve(req, res, url) {
  const params = url.searchParams;
  const query = String(params.get("q") || params.get("query") || "").trim().slice(0, 500);
  try {
    const state = await loadRag();
    const meta = packMeta(state);
    if (!query) {
      send(res, 200, JSON.stringify({ query, pack: meta, results: [] }), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return;
    }
    const found = ragRuntime.search(state.index, query, {
      limit: Number(params.get("limit") || 0) || undefined,
      docId: params.get("doc") || "",
      year: params.get("year") || "",
      from: params.get("from") || "",
      to: params.get("to") || "",
    });
    send(res, 200, JSON.stringify({ query, pack: meta, ...found }), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
  } catch (error) {
    send(res, 502, JSON.stringify({
      error: "blog_index_unavailable",
      detail: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
    }), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  }
}

async function handleAaronBlog(req, res) {
  let url;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch {
    url = new URL(String(req.url || "/").split("?")[0] || "/", "http://localhost");
  }
  const pathname = url.pathname;
  if (pathname === "/api/aaron-blog/retrieve") {
    await handleRetrieve(req, res, url);
    return;
  }
  const relative = packPathname(pathname);
  if (!relative) {
    send(res, 404, JSON.stringify({ error: "Not found" }), { "Content-Type": "application/json" });
    return;
  }
  try {
    // The chunk index is served from the verified copy, so what the reader
    // keeps for offline questions is byte-identical to what the server ranks.
    const body = relative === "rag.json" ? (await loadRag()).text : JSON.stringify(await fetchJson(relative));
    send(res, 200, body, {
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

module.exports = {
  handleAaronBlog,
  packPathname,
  __clearCache: () => {
    cache.clear();
    ragState = null;
  },
};
