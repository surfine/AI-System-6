// The browse relay's rules, shared word for word by the Node server and the
// Cloudflare Pages Functions that run the same relay at the edge.
//
// Time Machine's web engine runs a proxied page on a separate "browse" origin
// and sends every request that page makes through one relay endpoint. The
// relay is a public fetcher, so everything that decides who may use it, which
// headers cross it and which cookies a site gets back lives here, in one
// place, with no Node or Workers API in it: only WebCrypto, URL and
// TextEncoder, which both runtimes have.
//
// Two decisions shape the file:
//
// - The relay is stateless. A Pages Function keeps nothing between requests,
//   and the VPS should not hold a writer's logins in memory either. So the
//   cookie jar travels with the requests, sealed: AES-GCM under a key only the
//   relay knows, bound to the browse session. Page scripts on the browse
//   origin can read the sealed blob but not the cookies in it, which keeps a
//   site's HttpOnly cookies out of reach of every other site the writer opens.
//
// - Access is a short-lived token the desk mints after its own checks
//   (Turnstile on the public site, the loopback guard on a Mac). The browse
//   origin cannot run those checks itself, because anything on that origin is
//   readable by the pages it shows.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const BROWSE_TOKEN_TTL_SECONDS = 30 * 60;
export const BROWSE_MAX_REDIRECTS = 10;
export const BROWSE_JAR_MAX_BYTES = 12 * 1024;
export const BROWSE_JAR_MAX_COOKIES = 120;
export const BROWSE_ALLOWED_PORTS = new Set(["", "80", "443"]);

// --- Encoding --------------------------------------------------------------

/** @param {Uint8Array} bytes */
export function base64UrlEncode(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {string} value */
export function base64UrlDecode(value) {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** @param {Uint8Array} left @param {Uint8Array} right */
function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

// --- Keys ------------------------------------------------------------------

/** @type {Map<string, Promise<{ sign: CryptoKey, seal: CryptoKey }>>} */
const keyCache = new Map();

/**
 * One configured secret yields two keys, so a token can never be replayed as
 * a sealed jar or the other way round.
 *
 * @param {string} secret
 */
export function browseKeys(secret) {
  const text = String(secret || "");
  if (text.length < 24) throw new Error("The browse relay secret must be at least 24 characters.");
  let cached = keyCache.get(text);
  if (!cached) {
    cached = (async () => {
      const material = await crypto.subtle.importKey("raw", encoder.encode(text), "HKDF", false, ["deriveKey"]);
      const derive = (info, algorithm, usages) => crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: encoder.encode("ai-system-6-browse"), info: encoder.encode(info) },
        material,
        algorithm,
        false,
        usages
      );
      return {
        sign: await derive("token", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign", "verify"]),
        seal: await derive("jar", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
      };
    })();
    keyCache.set(text, cached);
  }
  return cached;
}

// --- Tokens ----------------------------------------------------------------

/**
 * @param {string} secret
 * @param {{ sid?: string, now?: number, ttlSeconds?: number, client?: string }} [options]
 */
export async function mintBrowseToken(secret, options = {}) {
  const { sign } = await browseKeys(secret);
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const sid = options.sid && /^[A-Za-z0-9_-]{16,64}$/.test(options.sid)
    ? options.sid
    : base64UrlEncode(crypto.getRandomValues(new Uint8Array(18)));
  const payload = {
    v: 1,
    sid,
    exp: now + (options.ttlSeconds || BROWSE_TOKEN_TTL_SECONDS),
    // A digest of whoever asked (address and user agent on the public site).
    // A token copied out of the browse origin by a hostile page stops working
    // from anywhere else.
    ...(options.client ? { c: options.client } : {}),
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", sign, encoder.encode(body)));
  return { token: `${body}.${base64UrlEncode(mac)}`, sid, expiresAt: payload.exp * 1000 };
}

/**
 * @param {string} secret
 * @param {string} token
 * @param {{ now?: number, client?: string }} [options]
 * @returns {Promise<{ ok: true, sid: string, exp: number } | { ok: false, reason: string }>}
 */
export async function verifyBrowseToken(secret, token, options = {}) {
  const text = String(token || "");
  const dot = text.indexOf(".");
  if (dot < 1 || dot !== text.lastIndexOf(".")) return { ok: false, reason: "malformed" };
  const body = text.slice(0, dot);
  let mac;
  let payload;
  try {
    mac = base64UrlDecode(text.slice(dot + 1));
    payload = JSON.parse(decoder.decode(base64UrlDecode(body)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const { sign } = await browseKeys(secret);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", sign, encoder.encode(body)));
  if (!constantTimeEqual(expected, mac)) return { ok: false, reason: "signature" };
  if (payload?.v !== 1 || typeof payload.sid !== "string" || typeof payload.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  if (payload.c && payload.c !== options.client) return { ok: false, reason: "client" };
  return { ok: true, sid: payload.sid, exp: payload.exp };
}

/**
 * The client binding the public profiles use: a short digest, so the token
 * carries no address in readable form.
 *
 * @param {string} address
 * @param {string} userAgent
 */
export async function browseClientDigest(address, userAgent) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${address}\n${userAgent}`));
  return base64UrlEncode(new Uint8Array(digest).subarray(0, 12));
}

// --- Targets ---------------------------------------------------------------

/**
 * The URL rules every relay request passes before any address lookup. The
 * caller still resolves and pins the host (Node) or relies on the platform's
 * own egress rules (Workers).
 *
 * @param {string} value
 * @param {{ websocket?: boolean }} [options]
 * @returns {URL}
 */
export function browseTargetUrl(value, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw browseError("That is not a web address.", "browse_invalid_url", 400);
  }
  const schemes = options.websocket ? ["ws:", "wss:"] : ["http:", "https:"];
  if (!schemes.includes(parsed.protocol)) {
    throw browseError("Only web addresses can be opened here.", "browse_unsupported_scheme", 400);
  }
  if (parsed.username || parsed.password) {
    throw browseError("Addresses with a user name or password cannot be opened here.", "browse_credentials_in_url", 400);
  }
  if (!BROWSE_ALLOWED_PORTS.has(parsed.port)) {
    throw browseError("Only the standard web ports can be opened here.", "browse_port", 400);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".home.arpa")
    || isPrivateLiteral(hostname)
  ) {
    throw browseError("Addresses on this machine or a private network cannot be opened here.", "browse_private_address", 403);
  }
  parsed.hash = "";
  return parsed;
}

/**
 * Literal addresses only; names are resolved and checked by the caller.
 *
 * @param {string} hostname
 */
export function isPrivateLiteral(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      // 192.0.0.0/24 and TEST-NET-1 only: the rest of 192.0.0.0/16 is
      // ordinary address space (iana.org itself lives there).
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  // Integer and hex spellings of an IPv4 address ("2130706433", "0x7f000001")
  // are something a browser's URL parser normalises but a hostname check
  // would miss. URL() has already normalised them to dotted form above; any
  // remaining all-digit host is refused outright.
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  if (host.includes(":")) {
    return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd")
      || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")
      || host.startsWith("::ffff:") || host.startsWith("64:ff9b:") || host.startsWith("ff");
  }
  return false;
}

/**
 * @param {string} message
 * @param {string} code
 * @param {number} status
 */
export function browseError(message, code, status = 502) {
  const error = /** @type {Error & { code: string, statusCode: number }} */ (new Error(message));
  error.code = code;
  error.statusCode = status;
  return error;
}

// --- Headers ---------------------------------------------------------------

const hopByHop = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection",
  "te", "trailer", "trailers", "transfer-encoding", "upgrade",
]);

// What a page may say to the site. The browser sets the rest itself (user
// agent, sec-fetch-*, client hints) and those describe the browse origin, not
// the writer, so they are replaced by what the relay knows to be true.
const forwardedRequestHeaders = new Set([
  "accept", "accept-language", "authorization", "cache-control", "content-type",
  "if-match", "if-modified-since", "if-none-match", "if-range", "if-unmodified-since",
  "pragma", "range", "x-requested-with", "x-csrf-token", "x-xsrf-token",
]);

/**
 * @param {Record<string, string>} headers what the page asked for
 * @returns {Record<string, string>}
 */
export function browseRequestHeaders(headers) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [rawName, rawValue] of Object.entries(headers || {})) {
    const name = String(rawName).toLowerCase();
    const value = String(rawValue ?? "");
    if (/[\r\n]/.test(value) || value.length > 8192) continue;
    if (hopByHop.has(name)) continue;
    if (forwardedRequestHeaders.has(name)) {
      out[name] = value;
      continue;
    }
    // Sites' own API headers (x-api-version, x-client-data, ...) pass; the
    // relay's own and the ones that would describe a different client do not.
    if (
      name.startsWith("x-")
      && !name.startsWith("x-ais6-")
      && !name.startsWith("x-forwarded-")
      && name !== "x-real-ip"
      && name !== "x-ai-system-6-token"
    ) {
      out[name] = value;
    }
  }
  return out;
}

// What a site's response may say to the page. Each dropped header is one the
// browse origin cannot honour as the site meant it: the page is no longer on
// the site's own origin, so a policy written for that origin either blocks the
// shim or says nothing true.
const droppedResponseHeaders = new Set([
  ...hopByHop,
  "set-cookie", "set-cookie2",
  "content-security-policy", "content-security-policy-report-only",
  "x-frame-options", "x-content-security-policy", "x-webkit-csp",
  "cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy",
  "cross-origin-opener-policy-report-only", "cross-origin-embedder-policy-report-only",
  "strict-transport-security", "public-key-pins", "expect-ct",
  "clear-site-data", "report-to", "reporting-endpoints", "nel", "alt-svc",
  "permissions-policy", "feature-policy", "origin-agent-cluster",
  "access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-headers",
  "access-control-allow-methods", "access-control-expose-headers", "access-control-max-age",
  "content-length", "content-encoding", "service-worker-allowed", "referrer-policy",
]);

/**
 * @param {Iterable<[string, string]>} entries
 * @returns {Record<string, string>}
 */
export function browseResponseHeaders(entries) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [rawName, rawValue] of entries) {
    const name = String(rawName).toLowerCase();
    if (droppedResponseHeaders.has(name) || name.startsWith("x-ais6-")) continue;
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue ?? "");
    out[name] = out[name] ? `${out[name]}, ${value}` : value;
  }
  return out;
}

// --- Cookies ---------------------------------------------------------------

// Second-level labels under which registrations happen. Enough to stop a site
// on example.co.uk from setting a cookie for all of co.uk; the full public
// suffix list would be 200 KB the edge copy would also have to carry.
const secondLevelSuffixes = new Set([
  "ac", "co", "com", "edu", "gov", "net", "org", "or", "ne", "go", "mil", "nom", "sch", "ltd", "plc", "gob", "gen", "biz", "info",
]);

/**
 * The registrable part of a host, used to file cookies by site.
 *
 * @param {string} hostname
 */
export function browseSiteKey(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || /^[0-9.]+$/.test(host) || host.includes(":")) return host;
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const second = labels[labels.length - 2];
  const top = labels[labels.length - 1];
  if (top.length === 2 && secondLevelSuffixes.has(second)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

/**
 * @typedef {{
 *   name: string, value: string, domain: string, hostOnly: boolean,
 *   path: string, expires: number, secure: boolean, httpOnly: boolean,
 *   sameSite: string,
 * }} BrowseCookie
 */

/**
 * @param {string} header one Set-Cookie value
 * @param {URL} requestUrl
 * @param {number} [now]
 * @returns {BrowseCookie | null}
 */
export function parseSetCookie(header, requestUrl, now = Date.now()) {
  const parts = String(header || "").split(";");
  const first = parts.shift() || "";
  const equals = first.indexOf("=");
  if (equals < 0) return null;
  const name = first.slice(0, equals).trim();
  const value = first.slice(equals + 1).trim();
  if (!name || name.length > 256 || value.length > 4096) return null;
  const host = requestUrl.hostname.toLowerCase();
  /** @type {BrowseCookie} */
  const cookie = {
    name,
    value,
    domain: host,
    hostOnly: true,
    path: defaultCookiePath(requestUrl.pathname),
    expires: 0,
    secure: false,
    httpOnly: false,
    sameSite: "lax",
  };
  for (const part of parts) {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey.trim().toLowerCase();
    const attribute = rest.join("=").trim();
    if (key === "domain" && attribute) {
      const domain = attribute.replace(/^\./, "").toLowerCase();
      // A cookie may widen only to a parent of the host that set it, and
      // never to a bare suffix such as "com" or "co.uk".
      if (!(host === domain || host.endsWith(`.${domain}`))) return null;
      if (!domain.includes(".") || browseSiteKey(domain) !== browseSiteKey(host) || domain.length < browseSiteKey(host).length) return null;
      cookie.domain = domain;
      cookie.hostOnly = false;
    } else if (key === "path" && attribute.startsWith("/")) {
      cookie.path = attribute;
    } else if (key === "max-age" && /^-?\d+$/.test(attribute)) {
      const seconds = Number(attribute);
      cookie.expires = seconds <= 0 ? 1 : now + seconds * 1000;
    } else if (key === "expires" && !parts.some((other) => /^\s*max-age=/i.test(other))) {
      const time = Date.parse(attribute);
      if (Number.isFinite(time)) cookie.expires = time <= now ? 1 : time;
    } else if (key === "secure") {
      cookie.secure = true;
    } else if (key === "httponly") {
      cookie.httpOnly = true;
    } else if (key === "samesite") {
      cookie.sameSite = attribute.toLowerCase() || "lax";
    }
  }
  if (cookie.secure && requestUrl.protocol !== "https:" && requestUrl.protocol !== "wss:") return null;
  if (name.startsWith("__Secure-") && !cookie.secure) return null;
  if (name.startsWith("__Host-") && (!cookie.secure || !cookie.hostOnly || cookie.path !== "/")) return null;
  return cookie;
}

/** @param {string} pathname */
function defaultCookiePath(pathname) {
  if (!pathname || !pathname.startsWith("/")) return "/";
  const slash = pathname.lastIndexOf("/");
  return slash <= 0 ? "/" : pathname.slice(0, slash);
}

/**
 * @param {BrowseCookie[]} jar
 * @param {BrowseCookie} cookie
 * @param {number} [now]
 */
export function storeCookie(jar, cookie, now = Date.now()) {
  const kept = jar.filter((existing) => !(
    existing.name === cookie.name
    && existing.domain === cookie.domain
    && existing.path === cookie.path
  ));
  if (cookie.expires === 0 || cookie.expires > now) kept.push(cookie);
  return pruneJar(kept, now);
}

/** @param {BrowseCookie[]} jar @param {number} [now] */
export function pruneJar(jar, now = Date.now()) {
  const live = jar.filter((cookie) => cookie.expires === 0 || cookie.expires > now);
  // Oldest entries go first when a site keeps writing cookies past the cap;
  // the jar has to stay small enough to ride in a request header.
  while (live.length > BROWSE_JAR_MAX_COOKIES) live.shift();
  while (live.length && encoder.encode(JSON.stringify(live)).length > BROWSE_JAR_MAX_BYTES) live.shift();
  return live;
}

/**
 * @param {BrowseCookie} cookie
 * @param {URL} url
 */
function cookieMatches(cookie, url) {
  const host = url.hostname.toLowerCase();
  const domainOk = cookie.hostOnly ? host === cookie.domain : (host === cookie.domain || host.endsWith(`.${cookie.domain}`));
  if (!domainOk) return false;
  const path = url.pathname || "/";
  const pathOk = path === cookie.path
    || (path.startsWith(cookie.path) && (cookie.path.endsWith("/") || path[cookie.path.length] === "/"));
  if (!pathOk) return false;
  if (cookie.secure && url.protocol !== "https:" && url.protocol !== "wss:") return false;
  return true;
}

/**
 * @param {BrowseCookie[]} jar
 * @param {URL} url
 * @param {{ includeHttpOnly?: boolean, now?: number }} [options]
 */
export function cookiesFor(jar, url, options = {}) {
  const now = options.now ?? Date.now();
  return jar
    .filter((cookie) => (cookie.expires === 0 || cookie.expires > now) && cookieMatches(cookie, url))
    .filter((cookie) => options.includeHttpOnly !== false || !cookie.httpOnly)
    .sort((left, right) => right.path.length - left.path.length)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

/**
 * What a page's document.cookie assignment would store. The browse origin
 * cannot let the browser keep these, because every proxied site shares it.
 *
 * @param {BrowseCookie[]} jar
 * @param {string} assignment
 * @param {URL} pageUrl
 * @param {number} [now]
 */
export function applyDocumentCookie(jar, assignment, pageUrl, now = Date.now()) {
  const cookie = parseSetCookie(assignment, pageUrl, now);
  if (!cookie || cookie.httpOnly) return jar;
  // A script cannot overwrite an HttpOnly cookie of the same name.
  if (jar.some((existing) => existing.httpOnly && existing.name === cookie.name && existing.domain === cookie.domain && existing.path === cookie.path)) {
    return jar;
  }
  return storeCookie(jar, cookie, now);
}

// --- Sealed jars -----------------------------------------------------------

/**
 * @param {string} secret
 * @param {string} sid
 * @param {string} site
 * @param {BrowseCookie[]} jar
 */
export async function sealJar(secret, sid, site, jar) {
  const { seal } = await browseKeys(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(pruneJar(jar)));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`${sid}\n${site}`) },
    seal,
    plaintext
  ));
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv);
  out.set(ciphertext, iv.length);
  return base64UrlEncode(out);
}

/**
 * A jar that does not open (another session's, another site's, tampered or
 * from before a secret rotation) is simply empty: the site sees a visitor
 * without cookies, which is what it would see in a fresh browser.
 *
 * @param {string} secret
 * @param {string} sid
 * @param {string} site
 * @param {string} blob
 * @returns {Promise<BrowseCookie[]>}
 */
export async function openJar(secret, sid, site, blob) {
  if (!blob) return [];
  try {
    const { seal } = await browseKeys(secret);
    const bytes = base64UrlDecode(blob);
    if (bytes.length < 29 || bytes.length > BROWSE_JAR_MAX_BYTES * 2) return [];
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12), additionalData: encoder.encode(`${sid}\n${site}`) },
      seal,
      bytes.subarray(12)
    );
    const parsed = JSON.parse(decoder.decode(plaintext));
    return Array.isArray(parsed) ? pruneJar(parsed.filter(isCookieShape)) : [];
  } catch {
    return [];
  }
}

/** @param {any} value */
function isCookieShape(value) {
  return value && typeof value.name === "string" && typeof value.value === "string"
    && typeof value.domain === "string" && typeof value.path === "string"
    && typeof value.expires === "number";
}

// --- Request envelope ------------------------------------------------------

/**
 * The relay's own request fields, read the same way on both runtimes.
 *
 * @param {(name: string) => string | null | undefined} getHeader
 */
export function readRelayEnvelope(getHeader) {
  let pageHeaders = {};
  try {
    const raw = getHeader("x-ais6-headers");
    if (raw) pageHeaders = JSON.parse(raw);
  } catch {
    throw browseError("The request headers could not be read.", "browse_bad_envelope", 400);
  }
  /** @type {string[]} */
  let documentCookies = [];
  try {
    const raw = getHeader("x-ais6-doc-cookies");
    if (raw) documentCookies = JSON.parse(raw).filter((entry) => typeof entry === "string").slice(0, 50);
  } catch {
    documentCookies = [];
  }
  const url = decodeURIComponent(String(getHeader("x-ais6-url") || ""));
  return {
    token: String(getHeader("x-ais6-token") || ""),
    url,
    headers: browseRequestHeaders(/** @type {Record<string, string>} */ (pageHeaders && typeof pageHeaders === "object" ? pageHeaders : {})),
    referrer: decodeURIComponent(String(getHeader("x-ais6-referrer") || "")),
    origin: String(getHeader("x-ais6-origin") || ""),
    jar: String(getHeader("x-ais6-jar") || ""),
    documentCookies,
    follow: getHeader("x-ais6-redirect") !== "manual",
    wantDocumentCookies: getHeader("x-ais6-want-doc-cookies") === "1",
    userAgent: String(getHeader("x-ais6-ua") || ""),
  };
}

/**
 * Referer and Origin as the site would have seen them from its own page.
 *
 * @param {{ referrer: string, origin: string }} envelope
 * @param {URL} target
 * @param {string} method
 */
export function relayProvenanceHeaders(envelope, target, method) {
  /** @type {Record<string, string>} */
  const out = {};
  let referrer = null;
  try {
    referrer = envelope.referrer ? new URL(envelope.referrer) : null;
  } catch {
    referrer = null;
  }
  if (referrer && (referrer.protocol === "http:" || referrer.protocol === "https:")) {
    // strict-origin-when-cross-origin, the browser default.
    out.referer = referrer.origin === target.origin
      ? referrer.href.replace(/#.*$/, "")
      : (target.protocol === "http:" && referrer.protocol === "https:" ? "" : `${referrer.origin}/`);
    if (!out.referer) delete out.referer;
  }
  let origin = "";
  try {
    origin = envelope.origin ? new URL(envelope.origin).origin : "";
  } catch {
    origin = "";
  }
  if (origin && origin !== "null" && (method !== "GET" && method !== "HEAD" || origin !== target.origin)) {
    out.origin = origin;
  }
  return out;
}

export const BROWSE_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

/**
 * The writer's own browser's user agent, when it looks like one. Sites serve
 * the layout that browser can draw.
 *
 * @param {string} value
 */
export function relayUserAgent(value) {
  const text = String(value || "");
  return /^Mozilla\/5\.0 \([^)]{3,200}\)[ -~]{0,300}$/.test(text) ? text : BROWSE_DEFAULT_USER_AGENT;
}
