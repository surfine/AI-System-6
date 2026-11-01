// The engine's one way out: a CONNECT-only filter on a loopback port.
//
// Seatbelt cannot filter by host, so the sandbox closes every address of this
// Mac and opens one port. When the writer's network needs a loopback proxy
// (Clash-style, HTTPS_PROXY=http://127.0.0.1:7890), the engine used to be
// handed that proxy's port directly; a forward proxy happily relays an
// absolute-form request to 127.0.0.1:<this server's port>, so the sandboxed
// engine could reach every route of this server through it (attack round 5,
// r5-token-chain). The engine now gets this filter's port instead, and the
// filter admits one thing: `CONNECT <public host>:443`. Plain HTTP requests,
// any other port, localhost and private, loopback and link-local addresses
// are refused, so neither this server (4173) nor LM Studio nor the LAN is
// reachable through it. Models and web tools are HTTPS.
//
// What is enforced depends on whether the server has an upstream proxy:
//
//   - Without one, the filter resolves the name itself and connects to an
//     address it checked: every answer must be public, so a name pointing at
//     127.0.0.1 (or a private, link-local or reserved address) gets nowhere.
//   - With one, the filter chains through it (CONNECT host:443 to the
//     upstream, which does the DNS: the writer's proxy may fake-resolve
//     names), so it judges only the spelling of the target. It admits a name
//     of letters and digits whose last label is not numeric, a canonical
//     dotted-quad IPv4 or a bracketed IPv6 literal, and the literals only
//     when public. Numeric or sloppy IPv4 spellings (decimal, octal, hex,
//     short forms such as 127.1, which a proxy or libc may read as a loopback
//     address), zoned IPv6 and the local-only name suffixes are refused. A
//     public-looking name that the upstream itself resolves to a private
//     address is NOT stopped here (attack round 6, F1).

"use strict";

const dns = require("node:dns");
const net = require("node:net");

const MAX_CONNECTIONS = 64;
const IDLE_MS = 120_000;
const CONNECT_MS = 20_000;

const blocked = new net.BlockList();
/** @type {Array<[string, number]>} */
const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
/** @type {Array<[string, number]>} */
const V6_BLOCKED = [
  // ::/96 holds the unspecified and loopback addresses and the IPv4-compatible
  // forms (::127.0.0.1); ::ffff:0:0/96 the IPv4-translated ones; 2002::/16 and
  // 2001::/32 (6to4, Teredo) carry an IPv4 address that may be private.
  ["::", 96], ["::ffff:0:0:0", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32], ["2002::", 16], ["2001::", 32],
];
for (const [address, prefix] of V4_BLOCKED) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of V6_BLOCKED) blocked.addSubnet(address, prefix, "ipv6");

/** @param {string} address */
function isPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Is a host name on a host allowlist? An entry is an exact name, or
 * `*.<domain>` for the names under that domain (not the domain itself). An
 * address literal is on no list.
 * @param {string} host lower-case name, no trailing dot
 * @param {readonly string[]} allowHosts
 * @returns {boolean}
 */
function hostOnAllowlist(host, allowHosts) {
  if (!host || net.isIP(host)) return false;
  return allowHosts.some((entry) => {
    const name = String(entry || "").toLowerCase().replace(/\.$/, "");
    if (name.startsWith("*.")) return name.length > 2 && host.endsWith(name.slice(1));
    return Boolean(name) && host === name;
  });
}

/**
 * The host part of a CONNECT target, or "" when it may not be reached. IP
 * literals must be public and spelled canonically; a hostname must not end in
 * a numeric label, because a proxy may read `127.1`, `0x7f.1`, `0177.0.0.1`
 * or `2130706433` as an IPv4 address that net.isIP does not recognise. With
 * `allowHosts` (ClioCode's filter, cliocode/egress.js) a public host must also
 * be on that list, and no address literal is admitted; without it (the
 * ClioTalk engine's filter) every public host on 443 is admitted.
 * @param {string} target host:port as sent on the CONNECT line
 * @param {readonly string[]} [allowHosts]
 * @returns {string}
 */
function admittedHost(target, allowHosts) {
  const match = /^(?:\[([0-9a-f:.]+)\]|([^:\[\]]+)):(\d{1,5})$/i.exec(String(target || ""));
  if (!match || Number(match[3]) !== 443) return "";
  const bracketed = match[1] !== undefined;
  const host = String(match[1] || match[2]).toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return "";
  const family = net.isIP(host);
  // A bracketed literal is IPv6 (a zone id, `%`, is not in the pattern), and
  // a bare one is the canonical dotted-quad form. An allowlist names hosts,
  // so it admits no literal at all.
  if (family) return !allowHosts && family === (bracketed ? 6 : 4) && isPublicAddress(host) ? host : "";
  if (bracketed) return "";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return "";
  if (/^(?:\d+|0x[0-9a-f]*)$/.test(host.slice(host.lastIndexOf(".") + 1))) return "";
  if (/\.(localhost|local|internal|lan|home|corp|test|invalid)$/.test(host)) return "";
  if (allowHosts && !hostOnAllowlist(host, allowHosts)) return "";
  return host;
}

/**
 * The http:// proxy in the server's environment, if any.
 * @param {NodeJS.ProcessEnv} env
 * @returns {URL | null}
 */
function upstreamFrom(env) {
  for (const name of ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"]) {
    const value = String(env[name] || "").trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "http:") return url;
    } catch {}
  }
  return null;
}

/**
 * The macOS system HTTPS proxy (`scutil --proxy`: System Settings > Network >
 * Proxies), as an http:// URL, or null. Parsed from the dictionary text; an
 * http:// proxy only, like the environment's.
 * @param {string} text
 * @returns {URL | null}
 */
function parseScutilProxy(text) {
  const field = (/** @type {string} */ name) => (String(text).match(new RegExp(`^\\s*${name}\\s*:\\s*(.+?)\\s*$`, "m")) || [])[1] || "";
  if (field("HTTPSEnable") !== "1") return null;
  const host = field("HTTPSProxy");
  const port = Number(field("HTTPSPort"));
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  try { return new URL(`http://${host}:${port}`); } catch { return null; }
}

/** @type {{ url: URL | null } | null} */
let systemChoice = null;

/**
 * The upstream when the environment names none: the system proxy, read once
 * per server process; which upstream was chosen is logged once (host and port
 * only, never credentials).
 * @param {{ read?: () => string, log?: (line: string) => void }} [seam]
 * @returns {URL | null}
 */
function systemUpstream(seam = {}) {
  if (systemChoice) return systemChoice.url;
  let url = null;
  if (process.platform === "darwin" || seam.read) {
    try {
      const text = seam.read ? seam.read() : require("node:child_process").execFileSync("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8", timeout: 3000 });
      url = parseScutilProxy(text);
    } catch {}
  }
  systemChoice = { url };
  (seam.log || console.log)(`egress upstream: ${url ? `macOS system proxy ${url.hostname}:${url.port}` : "none (direct, addresses checked)"}`);
  return url;
}

let envLogged = false;
/** @param {NodeJS.ProcessEnv} env */
function upstreamChoice(env) {
  const named = upstreamFrom(env);
  if (named) {
    if (!envLogged && env === process.env) { envLogged = true; console.log(`egress upstream: HTTPS_PROXY ${named.hostname}:${named.port}`); }
    return named;
  }
  // Only the server's own environment falls back to the system's.
  return env === process.env ? systemUpstream() : null;
}

/**
 * @param {string} host
 * @returns {Promise<string>} a public address for the name, or "" when any answer is not public
 */
async function resolvePublic(host) {
  if (net.isIP(host)) return host;
  const answers = await dns.promises.lookup(host, { all: true, verbatim: true });
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) return "";
  return answers[0].address;
}

/**
 * @param {URL} upstream
 * @param {string} host
 * @returns {Promise<net.Socket>} the tunnel, after the upstream answered 200
 */
function connectThroughUpstream(upstream, host) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: upstream.hostname.replace(/^\[|\]$/g, ""), port: Number(upstream.port || 80) });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("upstream timeout")); }, CONNECT_MS);
    let head = Buffer.alloc(0);
    const auth = upstream.username
      ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`).toString("base64")}\r\n`
      : "";
    socket.once("connect", () => socket.write(`CONNECT ${host.includes(":") ? `[${host}]` : host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n${auth}\r\n`));
    const onData = (chunk) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf("\r\n\r\n");
      if (end < 0) {
        if (head.length > 8192) { socket.destroy(); clearTimeout(timer); reject(new Error("upstream head too long")); }
        return;
      }
      socket.off("data", onData);
      clearTimeout(timer);
      if (!/^HTTP\/1\.[01] 200/.test(head.toString("latin1", 0, end))) { socket.destroy(); reject(new Error("upstream refused")); return; }
      const rest = head.subarray(end + 4);
      if (rest.length) socket.unshift(rest);
      resolve(socket);
    };
    socket.on("data", onData);
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    socket.once("close", () => { clearTimeout(timer); reject(new Error("upstream closed")); });
  });
}

/**
 * @param {{ upstreamEnv?: NodeJS.ProcessEnv, allowHosts?: readonly string[] }} [options]
 *   allowHosts: admit only these public hosts (ClioCode); absent, any public host
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
function startEgressProxy(options = {}) {
  const upstream = upstreamChoice(options.upstreamEnv || process.env);
  const allowHosts = options.allowHosts ? Object.freeze([...options.allowHosts]) : undefined;
  const http = require("node:http");
  let open = 0;
  const server = http.createServer((_req, res) => {
    // Plain HTTP (an absolute-form request) is how a proxy is made to reach
    // this Mac's own ports; it is never relayed.
    res.writeHead(405, { Allow: "CONNECT", Connection: "close" });
    res.end("This proxy relays HTTPS CONNECT to public hosts on 443 only.\n");
  });
  server.on("connect", (req, client, headBuffer) => {
    const refuse = (status) => {
      try { client.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); } catch {}
      client.destroy();
    };
    client.on("error", () => {});
    const host = admittedHost(String(req.url || ""), allowHosts);
    if (!host) { refuse("403 Forbidden"); return; }
    if (open >= MAX_CONNECTIONS) { refuse("503 Service Unavailable"); return; }
    open += 1;
    let released = false;
    const release = () => { if (!released) { released = true; open -= 1; } };
    client.once("close", release);
    (async () => {
      let remote;
      if (upstream) {
        remote = await connectThroughUpstream(upstream, host);
      } else {
        const address = await resolvePublic(host);
        if (!address) { refuse("403 Forbidden"); return; }
        remote = await new Promise((resolve, reject) => {
          const socket = net.connect({ host: address, port: 443 });
          const timer = setTimeout(() => { socket.destroy(); reject(new Error("connect timeout")); }, CONNECT_MS);
          socket.once("connect", () => { clearTimeout(timer); resolve(socket); });
          socket.once("error", (error) => { clearTimeout(timer); reject(error); });
        });
      }
      remote.on("error", () => client.destroy());
      client.on("close", () => remote.destroy());
      remote.on("close", () => client.destroy());
      /** @type {net.Socket} */ (client).setTimeout(IDLE_MS, () => client.destroy());
      remote.setTimeout(IDLE_MS, () => remote.destroy());
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (headBuffer?.length) remote.write(headBuffer);
      client.pipe(remote);
      remote.pipe(client);
    })().catch(() => refuse("502 Bad Gateway"));
  });
  server.on("clientError", (_error, socket) => { try { socket.destroy(); } catch {} });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = /** @type {import("node:net").AddressInfo} */ (server.address());
      server.unref();
      resolve({
        port: address.port,
        close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(() => done(undefined)); }),
      });
    });
  });
}

/** @type {Promise<{ port: number, close: () => Promise<void> }> | null} */
let shared = null;

/** The server's one filter, started on first use. */
function ensureEgressProxy(options = {}) {
  if (!shared) shared = startEgressProxy(options).catch((error) => { shared = null; throw error; });
  return shared;
}

async function stopEgressProxyForTests() {
  systemChoice = null;
  const current = shared;
  shared = null;
  if (current) await (await current).close();
}

module.exports = { upstreamChoice, parseScutilProxy, systemUpstream, admittedHost, ensureEgressProxy, hostOnAllowlist, isPublicAddress, startEgressProxy, stopEgressProxyForTests, upstreamFrom };
