// Time Machine's web engine: the relay's rules and the browse origin's walls.
//
// The relay is a public fetcher for pages a writer opens, so its contract is
// mostly about refusals: who may use it, which addresses it will not reach,
// which headers and cookies it will not carry, and which origin its pages run
// on. These are behaviour checks against the shared core (the same module the
// Pages Functions copy imports), plus a few structural checks on the files that
// enforce the origin split.
import { createRequire } from "node:module";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const core = await import(`${root}/apps/server/server/browse/core.mjs`);
const test = createFeatureTest("browse-relay");
const secret = "test-secret-that-is-long-enough-123456";

// --- Tokens ------------------------------------------------------------------

const minted = await core.mintBrowseToken(secret, { now: 1_000_000_000_000 });
let verified = await core.verifyBrowseToken(secret, minted.token, { now: 1_000_000_000_000 + 1000 });
test.assert(verified.ok && verified.sid === minted.sid, "a fresh token verifies and names its session");
verified = await core.verifyBrowseToken(secret, minted.token, { now: 1_000_000_000_000 + 31 * 60 * 1000 });
test.assert(!verified.ok && verified.reason === "expired", "a token stops working after thirty minutes");
verified = await core.verifyBrowseToken("another-secret-that-is-long-enough-xyz", minted.token, { now: 1_000_000_000_000 });
test.assert(!verified.ok && verified.reason === "signature", "a token from another server is refused");
const [body, mac] = minted.token.split(".");
const forged = `${body.slice(0, -2)}AA.${mac}`;
verified = await core.verifyBrowseToken(secret, forged, { now: 1_000_000_000_000 });
test.assert(!verified.ok, "an edited token is refused");
const bound = await core.mintBrowseToken(secret, { client: "abc" });
test.assert(!(await core.verifyBrowseToken(secret, bound.token, { client: "xyz" })).ok, "a token bound to one client is refused from another");
test.assert((await core.verifyBrowseToken(secret, bound.token, { client: "abc" })).ok, "the bound client may use it");
const renewed = await core.mintBrowseToken(secret, { sid: minted.sid });
test.assert(renewed.sid === minted.sid, "a renewed token keeps its session, so sealed cookies keep opening");
let threw = false;
try {
  await core.mintBrowseToken("short");
} catch {
  threw = true;
}
test.assert(threw, "a short secret is refused rather than used");

// --- Targets -----------------------------------------------------------------

function refused(value, code, options) {
  try {
    core.browseTargetUrl(value, options);
    return false;
  } catch (error) {
    return error.code === code;
  }
}
test.assert(core.browseTargetUrl("https://example.com/a?b#c").href === "https://example.com/a?b", "a public address passes, without its fragment");
test.assert(refused("file:///etc/passwd", "browse_unsupported_scheme"), "file: is refused");
test.assert(refused("javascript:alert(1)", "browse_unsupported_scheme"), "javascript: is refused");
test.assert(refused("https://example.com:22/", "browse_port"), "non-web ports are refused");
test.assert(refused("https://user:pw@example.com/", "browse_credentials_in_url"), "credentials in the address are refused");
for (const host of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.8/", "http://192.168.1.1/", "http://169.254.169.254/latest", "http://[::1]/", "http://[fd00::1]/", "http://printer.local/", "http://2130706433/", "http://0x7f000001/", "http://browse.localhost/", "http://100.64.0.1/"]) {
  test.assert(refused(host, "browse_private_address"), `${host} is refused as a private address`);
}
test.assert(core.browseTargetUrl("wss://example.com/socket", { websocket: true }).protocol === "wss:", "a socket address passes for the socket relay");
test.assert(refused("https://example.com/", "browse_unsupported_scheme", { websocket: true }), "the socket relay takes only socket addresses");

// --- Headers -----------------------------------------------------------------

const forwarded = core.browseRequestHeaders({
  Accept: "text/html",
  "Content-Type": "application/json",
  Cookie: "stolen=1",
  Host: "evil.example",
  "X-Forwarded-For": "203.0.113.4",
  "X-Real-IP": "203.0.113.4",
  "X-AIS6-Token": "x",
  "X-Api-Version": "2",
  Connection: "close",
  "Sec-Fetch-Site": "same-origin",
  Range: "bytes=0-10",
  Authorization: "Bearer page-token",
  "X-Bad": "a\r\nInjected: 1",
});
test.assert(forwarded.accept === "text/html" && forwarded.range === "bytes=0-10" && forwarded["x-api-version"] === "2", "a page's own request headers are carried");
test.assert(forwarded.authorization === "Bearer page-token", "a site's own authorization header is carried");
for (const name of ["cookie", "host", "x-forwarded-for", "x-real-ip", "x-ais6-token", "connection", "sec-fetch-site", "x-bad"]) {
  test.assert(!(name in forwarded), `${name} is not carried from the page`);
}
const responseHeaders = core.browseResponseHeaders([
  ["Content-Type", "text/html"],
  ["Set-Cookie", "a=1"],
  ["Content-Security-Policy", "default-src 'none'"],
  ["X-Frame-Options", "DENY"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Strict-Transport-Security", "max-age=1"],
  ["Access-Control-Allow-Origin", "*"],
  ["Content-Encoding", "br"],
  ["Cache-Control", "max-age=60"],
  ["Link", "</a.css>; rel=preload"],
]);
test.assert(responseHeaders["content-type"] === "text/html" && responseHeaders["cache-control"] && responseHeaders.link, "a site's ordinary response headers reach the page");
for (const name of ["set-cookie", "content-security-policy", "x-frame-options", "cross-origin-opener-policy", "strict-transport-security", "access-control-allow-origin", "content-encoding"]) {
  test.assert(!(name in responseHeaders), `${name} does not reach the page`);
}

// --- Cookies -----------------------------------------------------------------

const page = new URL("https://www.example.co.uk/account/login");
test.assert(core.browseSiteKey("www.example.co.uk") === "example.co.uk", "a two-label suffix is respected when filing cookies");
test.assert(core.browseSiteKey("a.b.example.com") === "example.com", "subdomains share their site's jar");
test.assert(core.parseSetCookie("sid=1; Domain=co.uk", page) === null, "a cookie for a whole public suffix is refused");
test.assert(core.parseSetCookie("sid=1; Domain=other.com", page) === null, "a cookie for another site is refused");
const wide = core.parseSetCookie("sid=1; Domain=.example.co.uk; Path=/; Secure; HttpOnly", page);
test.assert(wide && !wide.hostOnly && wide.domain === "example.co.uk" && wide.httpOnly, "a cookie may widen to its own site");
test.assert(core.parseSetCookie("__Host-x=1; Path=/", page) === null, "__Host- cookies must be secure");
test.assert(core.parseSetCookie("s=1; Secure", new URL("http://example.com/")) === null, "a secure cookie is not accepted over http");
let jar = core.storeCookie([], wide);
jar = core.storeCookie(jar, core.parseSetCookie("pref=dark; Path=/", page));
test.assert(core.cookiesFor(jar, new URL("https://shop.example.co.uk/")).includes("sid=1"), "a site-wide cookie goes to the site's other hosts");
test.assert(!core.cookiesFor(jar, new URL("https://shop.example.co.uk/")).includes("pref=dark"), "a host-only cookie stays on its host");
test.assert(!core.cookiesFor(jar, new URL("http://www.example.co.uk/")).includes("sid="), "a secure cookie is not sent over http");
test.assert(!core.cookiesFor(jar, page, { includeHttpOnly: false }).includes("sid="), "document.cookie never sees an HttpOnly cookie");
jar = core.applyDocumentCookie(jar, "sid=overwritten; Domain=example.co.uk; Path=/", page);
test.assert(core.cookiesFor(jar, page).includes("sid=1"), "a script cannot overwrite an HttpOnly cookie");
jar = core.storeCookie(jar, core.parseSetCookie("pref=gone; Path=/; Max-Age=0", page));
test.assert(!core.cookiesFor(jar, page).includes("pref="), "Max-Age=0 deletes a cookie");

const sealed = await core.sealJar(secret, minted.sid, "example.co.uk", jar);
test.assert(!sealed.includes("sid") && !Buffer.from(sealed, "base64url").toString("latin1").includes("sid=1"), "a sealed jar does not show its cookies");
test.assert((await core.openJar(secret, minted.sid, "example.co.uk", sealed)).length === jar.length, "the jar opens for its own session and site");
test.assert((await core.openJar(secret, "another-session-id-0000", "example.co.uk", sealed)).length === 0, "another session's jar opens empty");
test.assert((await core.openJar(secret, minted.sid, "evil.com", sealed)).length === 0, "a jar replayed for another site opens empty");
test.assert((await core.openJar(secret, minted.sid, "example.co.uk", `${sealed.slice(0, -4)}AAAA`)).length === 0, "a tampered jar opens empty");

const provenance = core.relayProvenanceHeaders({ referrer: "https://news.example.com/a/b?c", origin: "https://news.example.com" }, new URL("https://cdn.other.com/x.js"), "GET");
test.assert(provenance.referer === "https://news.example.com/", "a cross-site request carries only the referring origin");
test.assert(provenance.origin === "https://news.example.com", "a cross-site request names the page's site as its origin");
test.assert(core.relayUserAgent("curl/8") === core.BROWSE_DEFAULT_USER_AGENT, "a user agent that is not a browser's is replaced");

// --- The origin split --------------------------------------------------------

const server = read("apps/server/server.js");
test.assertMatches(server, /isBrowseHostRequest\(req\)[\s\S]{0,400}handleBrowseHost\(req, res\)[\s\S]{0,400}return;\s*\}\s*applySecurityHeaders\(res\);/, "the browse host is answered before the desk's routes and headers");
const relayNode = read("apps/server/server/browse/relay-node.js");
test.assertIncludes(relayNode, "frame-ancestors ${deskFrameAncestors()}", "only the desk may frame the browse origin");
test.assertIncludes(relayNode, "resolveReaderTarget(target.href)", "every hop is resolved and pinned through the private-network check");
test.assertIncludes(relayNode, "core.browseSiteKey(next.hostname) !== site", "a redirect to another site leaves this site's cookies behind");
const router = read("apps/server/server/router.js");
test.assertIncludes(router, "\"POST /api/browse/token\"", "the token is minted by the desk's own guarded route");

const engine = read("app/features/time-machine-engine.js");
test.assertIncludes(engine, "allow-scripts allow-same-origin", "the live frame may run its page's scripts on its own origin");
test.assertMatches(engine, /if \(address\.origin === location\.origin\) throw/, "the live frame is never pointed at the desk's own origin");
test.assertIncludes(engine, "origin !== location.origin", "a browse origin equal to the desk's is never used");
test.assertNotIncludes(engine, "srcdoc", "the live frame never inherits the desk's document");

const shim = read("apps/browse/shim.js");
const replaceAt = shim.indexOf("nativeHistory.replaceState.call(history");
test.assert(replaceAt > 0 && replaceAt < shim.indexOf("Object.defineProperty(document, \"cookie\""), "the shim fixes the address before anything else the page could read");
test.assertIncludes(shim, "navigator.serviceWorker.register = function", "a site cannot install its own worker over the engine's");
test.assertIncludes(shim, "event.origin !== deskOrigin", "the shim answers only the desk that opened it");
const sw = read("apps/browse/sw.js");
test.assertIncludes(sw, "credentials: \"omit\"", "the worker's relay requests carry none of the browse origin's own cookies");
test.assertMatches(sw, /http-equiv\\s\*=\\s\*\["'\]\?\\s\*\(content-security-policy/, "a page's meta CSP is removed so the shim can run");

test.assertIncludes(sw, "request.destination === \"document\"", "a proxied page opened as a window of its own is refused");
test.assertIncludes(sw, "fetch(\"/__ais6/config.json\"", "the worker takes its frame ancestors from the server, not from a page");
test.assertMatches(sw, /syntheticResponse\(\{ \.\.\.result, headers \}, rewriteHtml\(html, finalUrl, config\), await frameAncestors\(\)\)/, "every served page is framed only by the desk or its own origin");
test.assertIncludes(relayNode, "/__ais6/config.json", "the server publishes the desk origins that may frame the browse origin");
test.assertIncludes(engine, "allowEvent(\"open\", 2, 5000)", "a page cannot open tabs in a burst");
test.assertIncludes(engine, "allowEvent(\"need-token\", 1, 20000)", "a page cannot make the desk mint tokens in a loop");

const { bootstrapPage } = require(`${root}/apps/server/server/browse/relay-node.js`);
test.assertIncludes(bootstrapPage(), "/__ais6/boot.js", "the bootstrap page is the worker installer");


// --- The real server, end to end -------------------------------------------
// One server process answers both hosts. Driven over HTTP with nothing on the
// network: the token, the refusals, and the wall between the two origins.
{
  const { spawn } = await import("node:child_process");
  const http = await import("node:http");
  const port = 4600 + Math.floor(Math.random() * 300);
  const server = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), AI_SYSTEM6_DEPLOYMENT_PROFILE: "local", HTTPS_PROXY: "", HTTP_PROXY: "", AI_SYSTEM6_BROWSE_ORIGIN: "" },
    stdio: "ignore",
  });
  const call = (path, { host = `127.0.0.1:${port}`, method = "GET", headers = {}, body } = {}) => new Promise((resolve) => {
    const request = http.request({ host: "127.0.0.1", port, path, method, headers: { host, ...headers } }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, text }));
    });
    request.on("error", () => resolve({ status: 0, headers: {}, text: "" }));
    request.end(body);
  });
  try {
    for (let i = 0; i < 80; i += 1) {
      if ((await call("/healthz")).status === 200) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const browseHost = `browse.localhost:${port}`;
    const caps = JSON.parse((await call("/api/capabilities")).text);
    test.assert(caps.browse?.available && caps.browse.origin === `http://${browseHost}`, "a Mac's server offers a browse origin on browse.localhost");
    const minted = await call("/api/browse/token", { method: "POST", headers: { origin: `http://127.0.0.1:${port}`, "content-type": "application/json" }, body: "{}" });
    const token = JSON.parse(minted.text || "{}").token || "";
    test.assert(minted.status === 200 && token.includes("."), "the desk mints a relay token");
    const foreign = await call("/api/browse/token", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    test.assert(foreign.status === 403, "another site cannot mint a token from this Mac");
    const relay = (url, key = token) => call("/__ais6/relay", { host: browseHost, headers: { "x-ais6-token": key, "x-ais6-url": encodeURIComponent(url) } });
    test.assert((await relay("https://example.com/", "bad.bad")).headers["x-ais6-error"] === "browse_token_malformed", "the relay refuses a forged token");
    test.assert((await relay("http://127.0.0.1/")).status === 403, "the relay refuses this machine");
    test.assert((await relay("http://192.168.1.1/")).status === 403, "the relay refuses the local network");
    test.assert((await call("/api/capabilities", { host: browseHost })).status === 404, "the desk's API does not exist on the browse origin");
    test.assert((await call("/__ais6/relay", { headers: { "x-ais6-token": token } })).status !== 200, "the relay does not exist on the desk's origin");
    const boot = await call("/__ais6/go?u=x", { host: browseHost, headers: { accept: "text/html" } });
    test.assert(boot.status === 200 && /frame-ancestors http:\/\/127\.0\.0\.1/.test(boot.headers["content-security-policy"] || ""), "the bootstrap may be framed only by the desk");
    const config = JSON.parse((await call("/__ais6/config.json", { host: browseHost })).text || "{}");
    test.assert(String(config.frameAncestors || "").includes(`http://localhost:${port}`), "the worker learns the desk origins from the server");
    const deskCsp = (await call("/", { headers: { accept: "text/html" } })).headers["content-security-policy"] || "";
    test.assert(deskCsp.includes(`http://${browseHost}`) && !/frame-src[^;]*\*/.test(deskCsp), "the desk may frame the browse origin and nothing broader");
  } finally {
    server.kill();
  }
}

test.finish();
