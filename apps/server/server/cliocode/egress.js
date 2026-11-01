// ClioCode's egress filter: the agent's CONNECT-only filter plus a host
// allowlist for coding work.
//
// A ClioCode run's Seatbelt profile (sandbox-profile.js here) closes all
// outbound network, the resolver included, and opens one loopback port: this
// filter's. The filter keeps every rule of agent/egress-proxy.js (CONNECT
// only, port 443 only, no private, loopback or link-local address, names
// resolved host-side or by the writer's upstream proxy) and admits only the
// hosts on the allowlist below; a public host off the list gets 403. The
// ClioTalk engine's filter (ensureEgressProxy, no allowlist) is unchanged.
//
// Only HTTPS git is reachable: git:// (9418) and SSH (22) are other ports the
// filter refuses. The run adds the model provider's host (and the web-search
// host, when web tools are on) through `extraHosts`.

"use strict";

const { hostOnAllowlist, startEgressProxy } = require("../agent/egress-proxy.js");

/**
 * The default allowlist (docs/CLIOCODE-DESIGN.md, "The network allowlist"):
 * the package registries coding work installs from and the HTTPS git hosts
 * `git clone`/`fetch`/`push` reach. An entry is an exact name or `*.<domain>`.
 * Only HTTPS git is reachable: git:// (9418) and SSH (22) are other ports the
 * filter refuses. The model provider and web-search hosts a run needs are
 * added per run through `extraHosts` (runs.js ENGINE_HOSTS).
 */
const CLIOCODE_ALLOWED_HOSTS = Object.freeze([
  // Package registries (pnpm uses the npm registry).
  "registry.npmjs.org",
  "*.npmjs.org",
  "registry.yarnpkg.com",
  "repo.yarnpkg.com",
  "pypi.org",
  "files.pythonhosted.org",
  "crates.io",
  "static.crates.io",
  "proxy.golang.org",
  "sum.golang.org",
  "registry.bower.io",
  // Git hosts over HTTPS.
  "github.com",
  "codeload.github.com",
  "gitlab.com",
  "bitbucket.org",
  // Release assets: the wildcard, with objects.githubusercontent.com (the one
  // release downloads land on) named explicitly.
  "*.githubusercontent.com",
  "objects.githubusercontent.com",
]);

/**
 * The run's allowlist: the defaults plus the hosts the run itself needs.
 * @param {readonly string[]} [extraHosts]
 * @returns {string[]}
 */
function codeAllowedHosts(extraHosts = []) {
  const extra = extraHosts
    .map((host) => String(host || "").trim().toLowerCase().replace(/\.$/, ""))
    .filter((host) => /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host));
  return [...new Set([...CLIOCODE_ALLOWED_HOSTS, ...extra])];
}

/**
 * Is `host` one a ClioCode run may reach?
 * @param {string} host
 * @param {readonly string[]} [allowHosts] the run's list (codeAllowedHosts)
 */
function codeHostAllowed(host, allowHosts = CLIOCODE_ALLOWED_HOSTS) {
  return hostOnAllowlist(String(host || "").toLowerCase().replace(/\.$/, ""), allowHosts);
}

/**
 * Start a filter for a ClioCode run.
 * @param {{ extraHosts?: readonly string[], upstreamEnv?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
function startCodeEgressProxy(options = {}) {
  return startEgressProxy({ upstreamEnv: options.upstreamEnv, allowHosts: codeAllowedHosts(options.extraHosts) });
}

module.exports = { CLIOCODE_ALLOWED_HOSTS, codeAllowedHosts, codeHostAllowed, startCodeEgressProxy };
