import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("public-rate-limit-proxy");
const { TtlLruWindows, normalizeClientIp } = require("../../apps/server/server/security/public-session.js");
const source = read("apps/server/server/security/public-session.js");

{
  const windows = new TtlLruWindows(3, 1000);
  windows.consume("a", 10, 500, 0);
  windows.consume("b", 10, 500, 1);
  windows.consume("c", 10, 500, 2);
  windows.consume("d", 10, 500, 3);
  test.assert(windows.size === 3 && !windows.entries.has("a"), "rate-limit state evicts the least-recently-used entry at its capacity");
  windows.consume("e", 10, 500, 2000);
  test.assert(windows.size === 1 && windows.entries.has("e"), "rate-limit state prunes expired entries on the consuming endpoint itself");
}

function childIp(mode, headers, remoteAddress) {
  const script = `
    process.env.AI_SYSTEM6_TRUST_PROXY=${JSON.stringify(mode)};
    const session=require("./apps/server/server/security/public-session.js");
    const req={headers:${JSON.stringify(headers)},socket:{remoteAddress:${JSON.stringify(remoteAddress)}}};
    process.stdout.write(session.clientIp(req));
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, AI_SYSTEM6_TRUST_PROXY: mode },
  });
  if (result.status !== 0) throw new Error(result.stderr || "clientIp child failed");
  return result.stdout;
}

const spoofedHeaders = {
  "cf-connecting-ip": "203.0.113.10",
  "x-real-ip": "198.51.100.20",
};
test.assert(childIp("", spoofedHeaders, "127.0.0.1") === "127.0.0.1", "direct mode ignores forged proxy headers");
test.assert(childIp("cloudflare", spoofedHeaders, "127.0.0.1") === "203.0.113.10", "Cloudflare mode trusts only CF-Connecting-IP");
test.assert(childIp("nginx", spoofedHeaders, "127.0.0.1") === "198.51.100.20", "Nginx mode trusts only X-Real-IP");
test.assert(childIp("cloudflare", { "x-real-ip": "198.51.100.20" }, "127.0.0.1") === "127.0.0.1", "Cloudflare mode ignores X-Real-IP");
test.assert(childIp("nginx", { "cf-connecting-ip": "203.0.113.10" }, "127.0.0.1") === "127.0.0.1", "Nginx mode ignores CF-Connecting-IP");
test.assert(childIp("nginx", { "x-real-ip": "192.0.2.1, 198.51.100.1" }, "::1") === "::1", "malformed forwarded address lists fall back to the socket peer");
test.assert(normalizeClientIp("::ffff:192.0.2.4") === "192.0.2.4", "IPv4-mapped IPv6 addresses normalize to IPv4");
test.assert(normalizeClientIp("2001:DB8::1") === "2001:db8::1", "native IPv6 identities normalize consistently");

test.assertIncludes(source, "turnstileWindows", "Turnstile uses the bounded TTL/LRU container");
test.assertIncludes(source, "this.prune(now)", "every rate-limit consume performs its own expiration cleanup");

test.finish();
