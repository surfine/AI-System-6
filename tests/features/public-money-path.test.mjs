// What a stranger needs before the public deployment spends the owner's money.
//
// https://system6.aaronlau.me is a stateless proxy in front of the owner's own
// paid model accounts. The risk this file holds is not tidiness: a stranger who
// points a client at /api/* spends a quota the owner pays for. Every assertion
// runs against a real server process in the public profile, because the guard
// is a chain -- profile, origin, session, rate window, concurrency, budget --
// and only the running chain proves the order.
//
// The session secret below is this test's own. It signs a cookie the way the
// server does, which is how a verified visitor is simulated without a
// Cloudflare round trip.

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-money-path");

const SESSION_SECRET = "public-money-path-test-secret-0123456789abcdef";
const SESSION_COOKIE = "ai_system6_public_session";

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function signSessionCookie(nonce) {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({
    v: 1,
    iat: now,
    exp: now + 3600,
    nonce,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      host: options.host || `127.0.0.1:${port}`,
      ...(options.headers || {}),
    };
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      method: options.method || "GET",
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start. Output: ${output}`));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("running at http://")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before readiness with code ${code}. Output: ${output}`));
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000).unref();
  });
}

// Every public route that can reach a paid upstream on the owner's own key,
// plus the two that spend the host's own bandwidth and CPU. A route that leaves
// this list because it stopped costing anything should leave with a reason.
const moneyRoutes = [
  { method: "POST", path: "/api/cloud/chat" },
  { method: "POST", path: "/api/search/answer" },
  { method: "POST", path: "/api/vision/analyze" },
  { method: "POST", path: "/api/subtitles/translate" },
  { method: "POST", path: "/api/draft/thesis" },
  { method: "POST", path: "/api/bureaucracy/captions" },
  { method: "POST", path: "/api/cloud/files" },
  { method: "POST", path: "/api/cmf/render-views" },
  { method: "POST", path: "/api/cmf/export-usdz" },
  { method: "GET", path: "/api/search?q=hello" },
  { method: "GET", path: "/api/reader?url=https%3A%2F%2Fexample.com" },
];

let port = 0;
try {
  port = await reservePort();
} catch (error) {
  if (error?.code !== "EPERM") throw error;
  test.ok("public-deployment checks are deferred when the sandbox forbids loopback listeners");
}

if (port) {
  const stateDirectory = mkdtempSync(join(tmpdir(), "ais6-money-path-"));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      AI_SYSTEM6_HOST: "127.0.0.1",
      AI_SYSTEM6_ALLOW_LAN: "0",
      AI_SYSTEM6_DEPLOYMENT_PROFILE: "public",
      AI_SYSTEM6_PUBLIC_ORIGIN: origin,
      AI_SYSTEM6_SESSION_SECRET: SESSION_SECRET,
      AI_SYSTEM6_STATE_DIR: stateDirectory,
      TURNSTILE_SECRET: "test-turnstile-secret",
      TURNSTILE_SITE_KEY: "test-turnstile-site-key",
      // No upstream key: the money routes must refuse before they reach one.
      DEEPSEEK_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const cookie = `${SESSION_COOKIE}=${signSessionCookie(crypto.randomBytes(18).toString("base64url"))}`;
    const jsonHeaders = { "content-type": "application/json", origin };

    // 1. No session at all. This is the whole gate: a client that never solved
    //    the challenge must not reach a single paid route.
    for (const route of moneyRoutes) {
      const denied = await request(port, route.path, {
        method: route.method,
        headers: route.method === "GET" ? {} : jsonHeaders,
        body: route.method === "GET" ? "" : "{}",
      });
      test.assert(
        denied.status === 401,
        `${route.method} ${route.path} refuses a request that carries no verified session`
      );
    }

    // 2. A cookie whose signature does not verify buys nothing. Guessing the
    //    HMAC is the only forgery path, and it must stay closed.
    const forged = await request(port, "/api/cloud/chat", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: `${SESSION_COOKIE}=${Buffer.from(JSON.stringify({
          v: 1,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          nonce: "forged-nonce-0123456789",
        })).toString("base64url")}.not-a-real-signature`,
      },
      body: "{}",
    });
    test.assert(forged.status === 401, "an unsigned session cookie cannot reach a paid route");

    // 3. The Host header is checked before anything else, so a request that
    //    arrives for another name never reaches the session logic.
    const wrongHost = await request(port, "/api/cloud/chat", {
      method: "POST",
      host: "attacker.example",
      headers: { ...jsonHeaders, cookie },
      body: "{}",
    });
    test.assert(wrongHost.status === 403, "a request for another host name cannot reach a paid route");

    // 4. A cross-site Origin is refused on every writing method. This stops a
    //    third-party page from spending a visitor's session, not a scripted
    //    client, which supplies whatever Origin it likes.
    const wrongOrigin = await request(port, "/api/cloud/chat", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example", cookie },
      body: "{}",
    });
    test.assert(wrongOrigin.status === 403, "a cross-site Origin cannot spend a verified session");

    // 5. A verified session reaches the route and is answered by the route's own
    //    validation, not by the gate. This proves the gate is not simply closed
    //    for everyone -- the legitimate path is still open.
    const verified = await request(port, "/api/search/answer", {
      method: "POST",
      headers: { ...jsonHeaders, cookie },
      body: "{}",
    });
    test.assert(
      verified.status === 400 && verified.body.includes("missing_query"),
      "a verified session reaches the route's own input validation"
    );

    // 6. A request that is already known to be bad must not spend an upstream
    //    call. The search route fans out to three providers, so a query it has
    //    already measured as too long used to cost four requests to say no.
    const longQuery = "a".repeat(4000);
    const refusedEarly = await request(port, `/api/search?q=${longQuery}`, {
      headers: { cookie },
    });
    test.assert(
      refusedEarly.status === 400 && refusedEarly.body.includes("search_query_too_long"),
      "an over-long search query is refused by its own measurement, not by the search engines"
    );

    // 7. The two routes whose work happens on the server refuse a public
    //    request that did not ask for the cloud model, instead of trying a
    //    local model this host does not run and forwarding LM Studio's own
    //    answer -- which told a visitor to use the "lms load" command.
    for (const [path, body] of [
      ["/api/subtitles/translate", '{"blocks":[{"timeline":"00:00 --> 00:01","textLines":["hi"]}]}'],
      ["/api/draft/thesis", '{"thesis":"a point worth making"}'],
    ]) {
      const refused = await request(port, path, {
        method: "POST",
        headers: { ...jsonHeaders, cookie },
        body,
      });
      test.assert(
        refused.status === 400 && refused.body.includes("cloud_model_required"),
        `${path} names the missing cloud model instead of reporting a local one`
      );
      test.assert(
        !/lms load|developer page/i.test(refused.body),
        `${path} does not hand a visitor an instruction for a program on another machine`
      );
    }

    // 8. A query that is not text is refused by its type. String(object) makes
    //    the literal "[object Object]", which used to be searched as a term and
    //    answered at 200 as an ordinary empty result, so the caller could not
    //    tell a wrong type from a genuine miss. The empty query is refused
    //    before the corpus is scanned at all.
    const wrongType = await request(port, "/api/endfield/ask", {
      method: "POST",
      headers: { ...jsonHeaders, cookie },
      body: '{"query":{"a":1}}',
    });
    test.assert(
      wrongType.status === 400 && wrongType.body.includes("invalid_query"),
      "a query that is not text is refused rather than answered as an empty result"
    );
    test.assert(
      !wrongType.body.includes("[object Object]"),
      "no answer is built around a stringified object"
    );
    const emptyQuery = await request(port, "/api/endfield/ask", {
      method: "POST",
      headers: { ...jsonHeaders, cookie },
      body: '{"query":"   "}',
    });
    test.assert(
      emptyQuery.status === 400 && emptyQuery.body.includes("Missing query"),
      "an empty query is refused, and the corpus scan it used to run first is gone"
    );

    // 9. A body that is valid JSON but not an object reaches named-field reads.
    //    Every one of them must answer 4xx: a 5xx here would be an internal
    //    symbol name shown for a request that was only wrong.
    for (const badBody of ["null", "[]", '"text"', "123", "{"]) {
      for (const path of ["/api/cloud/chat", "/api/search/answer", "/api/vision/analyze", "/api/draft/thesis"]) {
        const answered = await request(port, path, {
          method: "POST",
          headers: { ...jsonHeaders, cookie },
          body: badBody,
        });
        test.assert(
          answered.status >= 400 && answered.status < 500,
          `${path} answers a malformed body with a client error, not a server fault`
        );
      }
    }
  } finally {
    await stopServer(child);
    rmSync(stateDirectory, { recursive: true, force: true });
  }
}

// Every public route must be bounded by the concurrency groups, because a
// group is what both limits are keyed on. A route with no group gets
// `Infinity` for the global limit and `Infinity` for the per-session one, so a
// single verified session can hold an unbounded number of calls open at once.
// For a route that spends the shared model allowance that is the difference
// between drawing the day's pool down two calls at a time and emptying it in
// one burst.
//
// The guard is driven in a child process because the deployment profile and
// the session secret are read when the module is first required.
const concurrencyProbe = spawnSync(process.execPath, ["-e", `
  const crypto = require("node:crypto");
  const guard = require("./apps/server/server/security/public-session.js");
  const secret = process.env.AI_SYSTEM6_SESSION_SECRET;
  function cookie() {
    const now = Math.floor(Date.now() / 1000);
    const encoded = Buffer.from(JSON.stringify({
      v: 1, iat: now, exp: now + 3600,
      nonce: "probe-" + crypto.randomBytes(12).toString("hex"),
    })).toString("base64url");
    return "ai_system6_public_session=" + encoded + "."
      + crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  }
  const paths = ${JSON.stringify([
    "/api/cloud/chat",
    "/api/vision/analyze",
    "/api/search/answer",
    "/api/draft/thesis",
    "/api/subtitles/translate",
    "/api/bureaucracy/captions",
    "/api/endfield/ask",
    "/api/endfield/search",
    "/api/time-machine",
    "/api/cmf/render-views",
    "/api/reader",
    "/api/cloud/files",
  ])};
  (async () => {
    const peaks = {};
    for (const [index, path] of paths.entries()) {
      const jar = cookie();
      // One address per path. The address limits are a separate guard with
      // their own assertions; sharing an address here would measure them
      // instead of the per-session concurrency this probe is about.
      const address = "203.0.113." + (index + 1);
      let running = 0;
      let peak = 0;
      const release = [];
      for (let i = 0; i < 40; i += 1) {
        const res = { statusCode: 0, writeHead(s) { this.statusCode = s; return this; }, setHeader() {}, end() {} };
        guard.runWithPublicGuard(
          { method: "POST", url: path, headers: { host: "example.test", origin: "https://example.test", cookie: jar }, socket: { remoteAddress: address } },
          res,
          () => new Promise((done) => {
            running += 1;
            peak = Math.max(peak, running);
            release.push(() => { running -= 1; done(); });
          })
        );
      }
      await new Promise((r) => setTimeout(r, 60));
      peaks[path] = peak;
      release.forEach((f) => f());
      await new Promise((r) => setTimeout(r, 10));
    }
    process.stdout.write(JSON.stringify(peaks));
  })();
`], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    AI_SYSTEM6_DEPLOYMENT_PROFILE: "public",
    AI_SYSTEM6_PUBLIC_ORIGIN: "https://example.test",
    AI_SYSTEM6_SESSION_SECRET: SESSION_SECRET,
  },
});

if (concurrencyProbe.status !== 0) {
  throw new Error(concurrencyProbe.stderr || "concurrency probe failed");
}
const peaks = JSON.parse(concurrencyProbe.stdout);
for (const [path, peak] of Object.entries(peaks)) {
  test.assert(
    peak > 0 && peak <= 2,
    `${path} admits at most two calls at once from one session (admitted ${peak})`
  );
}

// A session cookie is a bearer token. Whoever holds one can present it from
// any client, in parallel, until it expires, and a fresh one costs one solved
// challenge. So every limit keyed on the session nonce counts cookies, not
// callers, and a farmer simply brings more cookies. These assertions hold the
// limits that count the caller instead: one address may take a share of the
// site's daily model allowance, never all of it, and a second address is not
// charged for the first one's traffic.
const addressProbe = spawnSync(process.execPath, ["-e", `
  const crypto = require("node:crypto");
  const guard = require("./apps/server/server/security/public-session.js");
  const secret = process.env.AI_SYSTEM6_SESSION_SECRET;
  function cookie() {
    const now = Math.floor(Date.now() / 1000);
    const encoded = Buffer.from(JSON.stringify({
      v: 1, iat: now, exp: now + 3600,
      nonce: "addr-" + crypto.randomBytes(12).toString("hex"),
    })).toString("base64url");
    return "ai_system6_public_session=" + encoded + "."
      + crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  }
  function req(address) {
    return {
      method: "POST",
      url: "/api/cloud/chat",
      headers: { host: "example.test", origin: "https://example.test", cookie: cookie() },
      socket: { remoteAddress: address },
    };
  }
  function res() {
    return {
      statusCode: 0, body: "",
      writeHead(status) { this.statusCode = status; return this; },
      setHeader() {},
      end(chunk) { this.body = String(chunk || ""); },
    };
  }
  (async () => {
    const limit = guard.addressDailyCloudRequests();
    let served = 0;
    let refusal = null;
    // A fresh cookie for every call, all from one address: the shape a farmer
    // takes once he learns that one solved challenge buys a whole session.
    for (let i = 0; i < limit * 3; i += 1) {
      const response = res();
      await guard.runWithPublicGuard(req("203.0.113.50"), response, () => { served += 1; });
      if (response.statusCode === 429) { refusal = response.body; break; }
    }
    let secondAddressServed = false;
    await guard.runWithPublicGuard(req("198.51.100.7"), res(), () => { secondAddressServed = true; });
    process.stdout.write(JSON.stringify({ limit, served, refusal, secondAddressServed }));
  })();
`], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    AI_SYSTEM6_DEPLOYMENT_PROFILE: "public",
    AI_SYSTEM6_PUBLIC_ORIGIN: "https://example.test",
    AI_SYSTEM6_SESSION_SECRET: SESSION_SECRET,
  },
});

if (addressProbe.status !== 0) {
  throw new Error(addressProbe.stderr || "address budget probe failed");
}
const addressResult = JSON.parse(addressProbe.stdout);

test.assert(
  addressResult.limit > 0 && addressResult.served === addressResult.limit,
  `one address is served its share of the daily model allowance and no more (${addressResult.served} of ${addressResult.limit})`
);
test.assert(
  String(addressResult.refusal || "").includes("address_daily_cloud_limit"),
  "the refusal names the address share as the reason, not a generic failure"
);
test.assert(
  String(addressResult.refusal || "").includes("Control Panel"),
  "the refusal tells the caller the one way to keep working: their own API key"
);
test.assert(
  addressResult.secondAddressServed === true,
  "a second address is not charged for the first one's traffic"
);

test.finish();
