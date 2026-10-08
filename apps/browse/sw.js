// Time Machine's web engine: the service worker on the browse origin.
//
// A page from the open web runs on this origin as if it were at its own
// address. The trick that makes modern sites work without rewriting their
// JavaScript is that the browse origin's paths ARE the site's paths: a page
// from https://example.com/a/b?c is served at <browse>/a/b?c, so the page's
// own router, its relative links and its root-relative fetches all see the
// path they expect. The worker remembers, for each frame, which site those
// paths belong to, and sends every request out through the relay.
//
//   <browse>/__ais6/go?u=<url>&k=<token>&tab=<id>   open a page in a frame
//   <browse>/<path>        from a frame showing example.com → example.com/<path>
//   https://cdn.other/x    absolute addresses pass through as they are
//
// Each answer is fetched by /__ais6/relay on the server, which holds the
// cookies sealed (see apps/server/server/browse/core.mjs). Documents get the
// page shim (shim.js) as their first script, which fixes the address bar
// before any of the page's own code reads it.

/* global AIS6Filters */
"use strict";

importScripts("/__ais6/filter-match.js");

const ENGINE_PREFIX = "/__ais6/";
const RELAY_PATH = "/__ais6/relay";
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);
const MAX_HTML_BYTES = 12 * 1024 * 1024;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await pruneStore();
  })());
});

// --- Persistent state -------------------------------------------------------
//
// The browser stops an idle worker whenever it likes, and every frame still on
// screen must keep working afterwards, so what a frame depends on is written
// to IndexedDB and read back on demand.

const DB_NAME = "__ais6_engine";
let dbPromise = null;

function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function kvGet(key) {
  const database = await db();
  return new Promise((resolve) => {
    const request = database.transaction("kv").objectStore("kv").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

async function kvSet(key, value) {
  const database = await db();
  return new Promise((resolve) => {
    const transaction = database.transaction("kv", "readwrite");
    transaction.objectStore("kv").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function kvClear() {
  const database = await db();
  return new Promise((resolve) => {
    const transaction = database.transaction("kv", "readwrite");
    transaction.objectStore("kv").clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function pruneStore() {
  const database = await db();
  const cutoff = Date.now() - 3 * 86400000;
  await new Promise((resolve) => {
    const transaction = database.transaction("kv", "readwrite");
    const store = transaction.objectStore("kv");
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const key = String(cursor.key);
      if ((key.startsWith("client:") || key.startsWith("url:")) && (cursor.value?.at || 0) < cutoff) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

/** A small in-memory cache in front of IndexedDB. */
class Recent {
  constructor(limit) {
    this.limit = limit;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
  }
  clear() {
    this.map.clear();
  }
}

const state = {
  token: "",
  tokenLoaded: false,
  adblock: true,
  adblockLoaded: false,
  /** clientId → { origin, tab, at } */
  clients: new Recent(400),
  /** "<path><search>" on this origin → { origin, at }, for navigations */
  urls: new Recent(2000),
  /** site → sealed jar */
  jars: new Map(),
  /** site → document.cookie assignments not yet sent */
  pendingDocumentCookies: new Map(),
  lastOrigin: "",
  filters: null,
  filtersLoading: null,
};

async function currentToken() {
  if (!state.tokenLoaded) {
    state.token ||= (await kvGet("token")) || "";
    state.tokenLoaded = true;
  }
  return state.token;
}

async function setToken(token) {
  if (!token || token === state.token) return;
  state.token = token;
  state.tokenLoaded = true;
  await kvSet("token", token);
}

async function adblockEnabled() {
  if (!state.adblockLoaded) {
    const stored = await kvGet("adblock");
    if (typeof stored === "boolean") state.adblock = stored;
    state.adblockLoaded = true;
  }
  return state.adblock;
}

async function jarFor(site) {
  if (!state.jars.has(site)) state.jars.set(site, (await kvGet(`jar:${site}`)) || "");
  return state.jars.get(site) || "";
}

async function storeJar(site, blob) {
  if (!site || !blob) return;
  state.jars.set(site, blob);
  await kvSet(`jar:${site}`, blob);
}

async function rememberClient(clientId, origin, tab, desk) {
  if (!clientId || !origin) return;
  const entry = { origin, tab: tab || "", desk: desk || "", at: Date.now() };
  state.clients.set(clientId, entry);
  state.lastOrigin = origin;
  await kvSet(`client:${clientId}`, entry);
}

// Each address a frame showed, with the site it belonged to and the Time
// Machine tab and desk the frame reports to: going back to it asks for the
// bare path, and the page served for it must still know whom to tell.
async function rememberUrl(key, origin, tab = "", desk = "") {
  const entry = { origin, tab, desk, at: Date.now() };
  state.urls.set(key, entry);
  await kvSet(`url:${key}`, entry);
}

async function urlEntry(key) {
  let entry = state.urls.get(key);
  if (!entry) {
    entry = await kvGet(`url:${key}`);
    if (entry) state.urls.set(key, entry);
  }
  return entry || null;
}

async function originForUrlKey(key) {
  return (await urlEntry(key))?.origin || "";
}

async function originForClient(clientId) {
  if (!clientId) return "";
  let entry = state.clients.get(clientId);
  if (!entry) {
    entry = await kvGet(`client:${clientId}`);
    if (entry) state.clients.set(clientId, entry);
  }
  if (entry?.origin) return entry.origin;
  // A worker the page started, or a frame the worker never served: find the
  // address it was loaded from and the site that address belonged to.
  try {
    const client = await self.clients.get(clientId);
    if (client) {
      const url = new URL(client.url);
      const origin = await originForUrlKey(url.pathname + url.search);
      if (origin) {
        await rememberClient(clientId, origin, "");
        return origin;
      }
    }
  } catch (error) {}
  return "";
}

// --- Sites ------------------------------------------------------------------

// The same rule as core.mjs's browseSiteKey; cookies are filed by it.
const SECOND_LEVEL = new Set(["ac", "co", "com", "edu", "gov", "net", "org", "or", "ne", "go", "mil", "nom", "sch", "ltd", "plc", "gob", "gen", "biz", "info"]);
function siteKey(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || /^[0-9.]+$/.test(host) || host.includes(":")) return host;
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const second = labels[labels.length - 2];
  const top = labels[labels.length - 1];
  if (top.length === 2 && SECOND_LEVEL.has(second)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

/**
 * Where a request on this origin is really going.
 *
 * @param {URL} url a URL on the browse origin
 * @param {string} origin the site the frame shows
 */
function siteUrl(url, origin) {
  return new URL(url.pathname + url.search, origin);
}

/** A referrer on the browse origin, rewritten to the address the site used. */
async function targetReferrer(referrer, fallbackOrigin) {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (url.origin !== self.location.origin) return url.href;
    if (url.pathname.startsWith("/__ais6/go")) return url.searchParams.get("u") || "";
    const origin = (await originForUrlKey(url.pathname + url.search)) || fallbackOrigin;
    return origin ? siteUrl(url, origin).href : "";
  } catch (error) {
    return "";
  }
}

// --- Filters ----------------------------------------------------------------

async function filters() {
  if (state.filters) return state.filters;
  state.filtersLoading ||= (async () => {
    try {
      const [network, cosmetic] = await Promise.all([
        fetch("/__ais6/filters/network.json").then((response) => (response.ok ? response.json() : null)),
        fetch("/__ais6/filters/cosmetic.json").then((response) => (response.ok ? response.json() : null)),
      ]);
      state.filters = {
        network: network ? AIS6Filters.compileNetwork(network) : null,
        cosmetic: cosmetic || null,
      };
    } catch (error) {
      state.filters = { network: null, cosmetic: null };
    }
    return state.filters;
  })();
  return state.filtersLoading;
}

async function isBlocked(target, destination, initiatorOrigin) {
  if (!(await adblockEnabled())) return false;
  const loaded = await filters();
  if (!loaded.network) return false;
  let initiatorHost = "";
  try {
    initiatorHost = initiatorOrigin ? new URL(initiatorOrigin).hostname : "";
  } catch (error) {}
  return AIS6Filters.matchNetwork(loaded.network, {
    url: target.href,
    hostname: target.hostname,
    type: destination || "other",
    initiatorHost,
    thirdParty: !!initiatorHost && siteKey(initiatorHost) !== siteKey(target.hostname),
  });
}

// --- Relay ------------------------------------------------------------------

function headersObject(headers) {
  const out = {};
  headers.forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

class RelayError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * One request to the site, following redirects across sites (each site's
 * cookies travel in their own sealed jar, so the hop comes back here).
 *
 * @returns {Promise<{ response: Response, status: number, statusText: string, headers: Record<string,string>, finalUrl: URL, documentCookies: string }>}
 */
async function relay(target, init) {
  let url = target;
  let method = init.method || "GET";
  let body = init.body || null;
  let referrer = init.referrer || "";
  for (let hop = 0; hop < 12; hop += 1) {
    const site = siteKey(url.hostname);
    const pending = state.pendingDocumentCookies.get(site) || [];
    state.pendingDocumentCookies.delete(site);
    const relayHeaders = {
      "x-ais6-token": await currentToken(),
      "x-ais6-url": encodeURIComponent(url.href),
      "x-ais6-headers": JSON.stringify(init.headers || {}),
      "x-ais6-referrer": encodeURIComponent(referrer),
      "x-ais6-origin": init.origin || "",
      "x-ais6-jar": await jarFor(site),
      "x-ais6-ua": self.navigator.userAgent,
    };
    if (pending.length) relayHeaders["x-ais6-doc-cookies"] = JSON.stringify(pending);
    if (init.wantDocumentCookies) relayHeaders["x-ais6-want-doc-cookies"] = "1";
    if (init.redirect === "manual") relayHeaders["x-ais6-redirect"] = "manual";
    const response = await fetch(RELAY_PATH, {
      method,
      headers: relayHeaders,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      signal: init.signal,
      cache: "no-store",
      credentials: "omit",
    });
    const jarSite = response.headers.get("x-ais6-jar-site");
    const jar = response.headers.get("x-ais6-jar");
    if (jar && jarSite) await storeJar(jarSite, jar);
    const errorCode = response.headers.get("x-ais6-error");
    if (errorCode) {
      let message = "";
      try {
        message = (await response.json()).error || "";
      } catch (error) {}
      if (errorCode.startsWith("browse_token_")) await askForToken();
      throw new RelayError(message || "The page could not be loaded.", errorCode, response.status);
    }
    const status = Number(response.headers.get("x-ais6-status") || 502);
    const redirect = response.headers.get("x-ais6-redirect");
    if (redirect) {
      referrer = url.href;
      url = new URL(decodeURIComponent(redirect));
      if (status === 303 || ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD")) {
        method = "GET";
        body = null;
      }
      continue;
    }
    let headers = {};
    try {
      headers = JSON.parse(response.headers.get("x-ais6-headers") || "{}");
    } catch (error) {
      headers = {};
    }
    return {
      response,
      status,
      statusText: decodeURIComponent(response.headers.get("x-ais6-status-text") || ""),
      headers,
      finalUrl: new URL(decodeURIComponent(response.headers.get("x-ais6-final-url") || encodeURIComponent(url.href))),
      documentCookies: decodeURIComponent(response.headers.get("x-ais6-doc-cookies") || ""),
    };
  }
  throw new RelayError("The site redirected too many times.", "browse_redirect_loop", 508);
}

async function askForToken() {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) client.postMessage({ ais6: 1, type: "need-token" });
}

function syntheticResponse(result, body, ancestors = "") {
  const status = result.status >= 200 && result.status <= 599 ? result.status : 502;
  const headers = new Headers();
  if (ancestors) headers.set("content-security-policy", `frame-ancestors ${ancestors}`);
  for (const [name, value] of Object.entries(result.headers)) {
    try {
      headers.append(name, value);
    } catch (error) {}
  }
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body, {
    status,
    statusText: result.statusText || "",
    headers,
  });
}

// --- Documents --------------------------------------------------------------

function charsetOf(contentType, bytes) {
  const header = /charset\s*=\s*"?([\w-]+)/i.exec(contentType || "");
  if (header) return header[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
  return meta ? meta[1] : "utf-8";
}

function decodeHtml(bytes, contentType) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes);
  try {
    return new TextDecoder(charsetOf(contentType, bytes)).decode(bytes);
  } catch (error) {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function frameGoUrl(href, tab) {
  return `/__ais6/go?u=${encodeURIComponent(href)}&tab=${encodeURIComponent(tab || "")}&embed=1`;
}

/**
 * The few rewrites a document needs. The page's scripts are left exactly as
 * they came: what changes is only what would take the frame off this origin
 * before the shim can catch it (frames with another site's address) and the
 * site's own policies, which name an origin the page is no longer on.
 */
function rewriteHtml(html, finalUrl, config) {
  let out = html;
  out = out.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*(content-security-policy|x-frame-options|refresh-disabled)[^>]*>/gi, "");
  out = out.replace(/<meta\b[^>]*name\s*=\s*["']?referrer["']?[^>]*>/gi, "");
  out = out.replace(/<base\b([^>]*)>/i, (tag, attrs) => {
    const match = /href\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (!match) return tag;
    try {
      const base = new URL(match[1], finalUrl);
      if (base.origin === finalUrl.origin) return tag.replace(match[1], escapeAttribute(base.pathname + base.search));
    } catch (error) {}
    return tag;
  });
  out = out.replace(/<(iframe|frame)\b([^>]*?)\bsrc\s*=\s*(["'])(.*?)\3/gi, (tag, name, before, quote, src) => {
    try {
      const resolved = new URL(src.replace(/&amp;/g, "&"), finalUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return tag;
      return `<${name}${before}src=${quote}${escapeAttribute(frameGoUrl(resolved.href, config.tab))}${quote}`;
    } catch (error) {
      return tag;
    }
  });
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
  const shim = `<script src="/__ais6/shim.js" data-ais6="${encoded}"></script>`;
  // First thing in <head>, so it runs before any script of the page reads the
  // address. Before <html> works too when a page has no head at all.
  if (/<head\b[^>]*>/i.test(out)) return out.replace(/<head\b[^>]*>/i, (tag) => tag + shim);
  if (/<html\b[^>]*>/i.test(out)) return out.replace(/<html\b[^>]*>/i, (tag) => `${tag}<head>${shim}</head>`);
  return shim + out;
}

function enginePage(title, message, detail) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeAttribute(title)}</title>
<style>body{margin:0;font:14px/1.5 -apple-system,system-ui,"PingFang SC",sans-serif;color:#222;background:#fff}main{max-width:34em;margin:18vh auto 0;padding:0 24px}h1{font-size:17px;margin:0 0 8px}p{margin:0 0 6px;color:#444}code{font-size:12px;color:#777;word-break:break-all}</style>
</head><body><main><h1>${escapeAttribute(message)}</h1><p>${escapeAttribute(detail || "")}</p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "frame-ancestors 'self'" } });
}

// Who may frame a page served here: the desk, and pages of this origin (a
// site's own embedded frames). Pages arrive without their site's CSP, so the
// worker stamps this on every document; read from the server, never from a
// page or a query string.
let frameAncestorsPromise = null;
function frameAncestors() {
  frameAncestorsPromise ||= fetch("/__ais6/config.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : {}))
    .then((config) => `'self' ${String(config.frameAncestors || "").replace(/[^\w\s:/.\-\[\]]/g, "")}`.trim())
    .catch(() => {
      frameAncestorsPromise = null;
      return "'self'";
    });
  return frameAncestorsPromise;
}

async function serveDocument(event, target, options) {
  const request = event.request;
  // A page here is only ever shown inside Time Machine. Opened as a window
  // of its own (a link from some other site, say), it would run with the
  // writer's relay token and sealed logins, so it is refused.
  if (request.destination === "document") {
    return enginePage("", "Open this page from Time Machine.", "");
  }
  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }
  const referrer = options.referrer ?? (await targetReferrer(request.referrer, options.fallbackOrigin || ""));
  let result;
  try {
    if (await isBlocked(target, "document", options.embed ? options.fallbackOrigin : "")) {
      return enginePage("", "This frame was blocked as an ad or tracker.", target.hostname);
    }
    result = await relay(target, {
      method: request.method,
      headers: headersObject(request.headers),
      body,
      referrer,
      origin: request.method === "GET" || request.method === "HEAD" ? "" : (options.fallbackOrigin || ""),
      wantDocumentCookies: true,
      signal: request.signal,
    });
  } catch (error) {
    notifyClients({ ais6: 1, type: "load-failed", tab: options.tab || "", url: target.href, code: error.code || "", message: error.message || "" });
    return enginePage("", "This page could not be opened.", error.message || "");
  }
  const finalUrl = result.finalUrl;
  const contentType = String(result.headers["content-type"] || "");
  const resultingClientId = event.resultingClientId || "";
  await rememberClient(resultingClientId, finalUrl.origin, options.tab, options.desk);
  await rememberUrl(finalUrl.pathname + finalUrl.search, finalUrl.origin, options.tab || "", options.desk || "");
  if (!/^(text\/html|application\/xhtml\+xml)/i.test(contentType) || request.method === "HEAD") {
    // A PDF, an image or a feed opened as a page: shown by the browser
    // itself, exactly as it came.
    return syntheticResponse(result, result.response.body, await frameAncestors());
  }
  const bytes = new Uint8Array(await result.response.arrayBuffer());
  if (bytes.length > MAX_HTML_BYTES) return syntheticResponse(result, bytes, await frameAncestors());
  const html = decodeHtml(bytes, contentType);
  const config = {
    url: finalUrl.href,
    tab: options.tab || "",
    embed: !!options.embed,
    referrer,
    cookies: result.documentCookies,
    token: await currentToken(),
    jar: await jarFor(siteKey(finalUrl.hostname)),
    adblock: await adblockEnabled(),
    desk: options.desk || "",
  };
  const headers = { ...result.headers, "content-type": contentType.replace(/;\s*charset=[^;]*/i, "") + "; charset=utf-8" };
  delete headers["content-encoding"];
  delete headers["location"];
  return syntheticResponse({ ...result, headers }, rewriteHtml(html, finalUrl, config), await frameAncestors());
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) client.postMessage(message);
}

// --- Fetch ------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(ENGINE_PREFIX) && url.pathname !== "/__ais6/go" && url.pathname !== "/__ais6/cosmetic") {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  event.respondWith(handleFetch(event, url));
});

async function handleFetch(event, url) {
  const request = event.request;
  const isNavigation = request.mode === "navigate";
  if (url.origin === self.location.origin && url.pathname === "/__ais6/go") {
    const token = url.searchParams.get("k");
    if (token) await setToken(token);
    let target;
    try {
      target = new URL(url.searchParams.get("u") || "");
      if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("scheme");
    } catch (error) {
      return enginePage("", "That address cannot be opened here.", "");
    }
    const embed = url.searchParams.get("embed") === "1";
    return serveDocument(event, target, {
      tab: url.searchParams.get("tab") || "",
      embed,
      desk: url.searchParams.get("d") || "",
      referrer: embed ? await targetReferrer(request.referrer, "") : "",
      fallbackOrigin: embed ? await originForClient(event.clientId) : "",
    });
  }
  if (url.origin === self.location.origin && url.pathname === "/__ais6/cosmetic") {
    return cosmeticResponse(url.searchParams.get("h") || "");
  }

  // Which site is this frame showing?
  let origin = "";
  if (url.origin === self.location.origin) {
    if (isNavigation) {
      origin = await originForNavigation(event, url);
      if (!origin) {
        return enginePage("", "This page lost track of its site.", "Open the address again from the Time Machine address bar.");
      }
      const known = (await urlEntry(url.pathname + url.search)) || {};
      const fromReferrer = await referrerEntry(event.request.referrer);
      return serveDocument(event, siteUrl(url, origin), {
        tab: known.tab || fromReferrer.tab || "",
        desk: known.desk || fromReferrer.desk || "",
        fallbackOrigin: origin,
      });
    }
    origin = await originForClient(event.clientId);
    if (!origin) return new Response(null, { status: 404 });
  } else if (isNavigation) {
    // A frame tried to leave for another site's own address; keep it here.
    return serveDocument(event, url, { tab: "", fallbackOrigin: await originForClient(event.clientId) });
  } else {
    origin = await originForClient(event.clientId);
  }
  const target = url.origin === self.location.origin ? siteUrl(url, origin) : url;
  if (await isBlocked(target, request.destination, origin)) {
    return Response.error();
  }
  try {
    let body = null;
    if (request.method !== "GET" && request.method !== "HEAD") body = await request.arrayBuffer();
    const result = await relay(target, {
      method: request.method,
      headers: headersObject(request.headers),
      body,
      referrer: await targetReferrer(request.referrer, origin),
      origin,
      redirect: request.redirect,
      signal: request.signal,
    });
    if (request.destination === "worker" || request.destination === "sharedworker") {
      await rememberUrl(url.pathname + url.search, origin);
    }
    return syntheticResponse(result, result.response.body);
  } catch (error) {
    return Response.error();
  }
}

async function referrerEntry(referrer) {
  try {
    const url = new URL(referrer);
    if (url.origin !== self.location.origin) return {};
    if (url.pathname === "/__ais6/go") return { tab: url.searchParams.get("tab") || "", desk: url.searchParams.get("d") || "" };
    return (await urlEntry(url.pathname + url.search)) || {};
  } catch (error) {
    return {};
  }
}

async function originForNavigation(event, url) {
  // The page that started the navigation, by its address on this origin.
  try {
    if (event.request.referrer) {
      const referrer = new URL(event.request.referrer);
      if (referrer.origin === self.location.origin) {
        if (referrer.pathname === "/__ais6/go") {
          const from = new URL(referrer.searchParams.get("u") || "");
          return from.origin;
        }
        const origin = await originForUrlKey(referrer.pathname + referrer.search);
        if (origin) return origin;
      }
    }
  } catch (error) {}
  const fromClient = await originForClient(event.clientId);
  if (fromClient) return fromClient;
  // Back and forward to an address this frame showed before.
  const known = await originForUrlKey(url.pathname + url.search);
  if (known) return known;
  return state.lastOrigin;
}

async function cosmeticResponse(hostname) {
  let css = "";
  if (await adblockEnabled()) {
    const loaded = await filters();
    if (loaded.cosmetic) css = AIS6Filters.cosmeticCss(loaded.cosmetic, String(hostname).toLowerCase());
  }
  return new Response(css, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" } });
}

// --- Messages ---------------------------------------------------------------

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (!data || data.ais6 !== 1) return;
  event.waitUntil((async () => {
    if (data.type === "token" && typeof data.token === "string") {
      await setToken(data.token);
    } else if (data.type === "adblock") {
      state.adblock = !!data.enabled;
      state.adblockLoaded = true;
      await kvSet("adblock", state.adblock);
    } else if (data.type === "doc-cookie" && typeof data.assignment === "string" && typeof data.url === "string") {
      try {
        const site = siteKey(new URL(data.url).hostname);
        const list = state.pendingDocumentCookies.get(site) || [];
        list.push(data.assignment.slice(0, 4096));
        state.pendingDocumentCookies.set(site, list.slice(-50));
      } catch (error) {}
    } else if (data.type === "clear") {
      // Clear Browsing Data: every sealed jar and every record of which frame
      // showed which site, then everything the pages themselves stored.
      state.jars.clear();
      state.clients.clear();
      state.urls.clear();
      state.pendingDocumentCookies.clear();
      await kvClear();
      try {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      } catch (error) {}
      try {
        const databases = await indexedDB.databases();
        await Promise.all(databases
          .filter((entry) => entry.name && entry.name !== DB_NAME)
          .map((entry) => new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(entry.name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          })));
      } catch (error) {}
      if (event.ports?.[0]) event.ports[0].postMessage({ ok: true });
    }
  })());
});
