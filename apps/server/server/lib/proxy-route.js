// Whether an outbound fetch on this server goes through the machine's proxy.
//
// The public server always connects directly to the address that passed the
// private-network check, pinned so DNS cannot change in between. A Mac whose
// owner reaches the web through a proxy (HTTPS_PROXY or the macOS setting;
// common where many sites are blocked or their DNS answers are poisoned)
// goes through that proxy, as the writer's own browser does. The name is
// still resolved here first and refused when it points into a private
// network; Clash/Surge-style fake-ip answers (the RFC 2544 benchmark block, 198.18/15) are not private.

"use strict";

const dns = require("node:dns").promises;
const { isPublicDeployment } = require("../runtime-profile.js");
const { proxyUrlForTarget } = require("./proxy.js");

/** @param {string} address */
function isFakeIpAddress(address) {
  return /^198\.(18|19)\./.test(String(address));
}

/**
 * @param {string} url
 * @param {(address: string) => boolean} isPrivateAddress
 * @returns {Promise<URL | null>} the proxy to use, or null for a direct, pinned connection
 */
async function localProxyRoute(url, isPrivateAddress) {
  if (isPublicDeployment) return null;
  const proxy = proxyUrlForTarget(url);
  if (!proxy) return null;
  let addresses = [];
  try {
    addresses = await dns.lookup(new URL(url).hostname, { all: true, verbatim: true });
  } catch {
    addresses = [];
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address) && !isFakeIpAddress(entry.address))) {
    const error = /** @type {Error & { code: string, statusCode: number }} */ (new Error("Addresses on this machine or a private network cannot be opened here."));
    error.code = "private_address";
    error.statusCode = 403;
    throw error;
  }
  return proxy;
}

module.exports = { localProxyRoute, isFakeIpAddress };
