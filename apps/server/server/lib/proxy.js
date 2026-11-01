// System-proxy detection + small URL/runtime predicates used by the
// fetch layer. Pure functions where possible; lazily caches the macOS
// scutil read and the HttpsProxyAgent instances.
//
// Behavior parity with root server.js:
// - isLoopbackUrl matches "127.0.0.1", "::1", and "localhost".
// - shouldAvoidNodeFetch flags any pkg-packaged runtime.
// - parseProxyEnv accepts both "host:port" and full URLs.
// - noProxyMatches reads NO_PROXY / no_proxy.
// - readMacSystemProxy uses `scutil --proxy` on darwin only.
// - proxyUrlForTarget returns null for loopback / no_proxy / no
//   configured proxy.
// - httpProxyAgentFor caches HttpsProxyAgent instances by href.

"use strict";

const { execFileSync } = require("node:child_process");
const { HttpsProxyAgent } = require("https-proxy-agent");

/**
 * Module-private cache: macOS proxy settings derived from `scutil`.
 * Stays null until the first read so non-darwin processes never pay
 * the spawn cost.
 *
 * @type {{ http?: string, https?: string } | null}
 */
let systemProxyCache = null;

/** @type {Map<string, import("https-proxy-agent").HttpsProxyAgent>} */
const httpProxyAgentCache = new Map();

/**
 * @param {string} targetUrl
 * @returns {boolean}
 */
function isLoopbackUrl(targetUrl) {
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
  } catch {
    return false;
  }
}

/**
 * In pkg-packaged binaries, the bundled Node fetch implementation does
 * not always cooperate with loopback servers (LM Studio, this app
 * itself). Callers can use the node http path instead when this
 * returns true.
 *
 * @returns {boolean}
 */
function shouldAvoidNodeFetch() {
  return !!(/** @type {any} */ (process).pkg);
}

/**
 * @param {string} targetUrl
 * @returns {boolean}
 */
function shouldAvoidNodeFetchForTarget(targetUrl) {
  return shouldAvoidNodeFetch() && isLoopbackUrl(targetUrl);
}

/**
 * Parse a proxy specification from an env var. Accepts either a full
 * URL ("http://host:port") or a bare "host:port" string. Returns null
 * for empty / unparseable / non-http(s) values.
 *
 * @param {string | undefined | null} value
 * @returns {URL | null}
 */
function parseProxyEnv(value) {
  if (!value) return null;
  try {
    const proxy = new URL(value.includes("://") ? value : `http://${value}`);
    if (!/^https?:$/i.test(proxy.protocol) || !proxy.hostname) return null;
    return proxy;
  } catch {
    return null;
  }
}

/**
 * Apply NO_PROXY / no_proxy rules to decide whether a target should
 * bypass the configured proxy. Rules may be comma-separated, may have
 * port suffixes, and may use a leading dot for domain wildcards.
 *
 * @param {string} targetUrl
 * @returns {boolean}
 */
function noProxyMatches(targetUrl) {
  const ruleText = process.env.NO_PROXY || process.env.no_proxy || "";
  if (!ruleText) return false;

  const target = new URL(targetUrl);
  const hostname = target.hostname.toLowerCase();
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  return ruleText
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule === "*") return true;
      const [hostRule, portRule] = rule.startsWith("[")
        ? [rule, ""]
        : rule.split(":");
      if (portRule && portRule !== port) return false;
      if (hostRule.startsWith(".")) return hostname.endsWith(hostRule);
      return hostname === hostRule || hostname.endsWith(`.${hostRule}`);
    });
}

/**
 * On macOS, read system-wide HTTP/HTTPS proxy settings via `scutil`.
 * Returns an empty object on non-darwin platforms or any failure.
 * Cached after the first call.
 *
 * @returns {{ http?: string, https?: string }}
 */
function readMacSystemProxy() {
  if (systemProxyCache !== null) return systemProxyCache;
  systemProxyCache = {};
  if (process.platform !== "darwin") return systemProxyCache;

  try {
    const output = execFileSync("scutil", ["--proxy"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1000,
    });
    /** @type {Record<string, string>} */
    const settings = {};
    output.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Za-z]+)\s*:\s*(.*?)\s*$/);
      if (match) settings[match[1]] = match[2];
    });
    if (settings.HTTPSEnable === "1" && settings.HTTPSProxy && settings.HTTPSPort) {
      systemProxyCache.https = `http://${settings.HTTPSProxy}:${settings.HTTPSPort}`;
    }
    if (settings.HTTPEnable === "1" && settings.HTTPProxy && settings.HTTPPort) {
      systemProxyCache.http = `http://${settings.HTTPProxy}:${settings.HTTPPort}`;
    }
  } catch {
    systemProxyCache = {};
  }
  return systemProxyCache;
}

/**
 * Resolve the proxy URL to use for a given target. Returns null for
 * loopback addresses, NO_PROXY matches, or when no proxy is configured
 * via env or the macOS system preferences.
 *
 * @param {string} targetUrl
 * @returns {URL | null}
 */
function proxyUrlForTarget(targetUrl) {
  if (isLoopbackUrl(targetUrl) || noProxyMatches(targetUrl)) return null;

  const target = new URL(targetUrl);
  const envProxy = target.protocol === "https:"
    ? parseProxyEnv(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy)
    : parseProxyEnv(process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy);
  if (envProxy) return envProxy;

  const systemProxy = readMacSystemProxy();
  return parseProxyEnv(target.protocol === "https:" ? systemProxy.https || systemProxy.http : systemProxy.http);
}

/**
 * Cached HttpsProxyAgent for a parsed proxy URL. Cache key is the
 * URL's href, matching root server.js.
 *
 * @param {URL} proxy
 * @returns {import("https-proxy-agent").HttpsProxyAgent}
 */
function httpProxyAgentFor(proxy) {
  const key = proxy.href;
  let agent = httpProxyAgentCache.get(key);
  if (!agent) {
    agent = new HttpsProxyAgent(key);
    httpProxyAgentCache.set(key, agent);
  }
  return agent;
}

module.exports = {
  isLoopbackUrl,
  shouldAvoidNodeFetch,
  shouldAvoidNodeFetchForTarget,
  parseProxyEnv,
  noProxyMatches,
  readMacSystemProxy,
  proxyUrlForTarget,
  httpProxyAgentFor,
};
