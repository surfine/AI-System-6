// SideAsk paired with 潮汐信笺 searches the blog's own chunk index through
// the desk server and feeds the results into ClioTalk's grounding contract
// ([S1]…[Sn]) — the Endfield shape, with a pack the blog generator wrote.
// The server must verify the pack against the manifest's SHA-256, keep the
// verified copy for offline use, and never call a model.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { fixturePack } from "../helpers/aaron-blog-rag-fixture.mjs";

const test = createFeatureTest("aaron-blog-sideask-grounding");

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

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "GET", headers: { host: `127.0.0.1:${port}` } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.once("error", reject);
    req.end();
  });
}

function startServer(port, env) {
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), AI_SYSTEM6_HOST: "127.0.0.1", AI_SYSTEM6_ALLOW_LAN: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 15000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("running at http://")) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Server exited with ${code}. Output: ${output}`)); });
  });
  return { child, ready };
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) { resolve(); return; }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000).unref();
  });
}

function writePack(dir, { tamper = false } = {}) {
  mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(fixturePack());
  const sha256 = createHash("sha256").update(text).digest("hex");
  writeFileSync(join(dir, "rag.json"), tamper ? text.replace("Vista", "Vizta") : text);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ schema: 1, contentHash: "fixture", rag: { schema: 1, path: "rag.json", sha256 } }));
}

function loadAdapter() {
  const sandbox = { window: {}, URLSearchParams };
  vm.createContext(sandbox);
  vm.runInContext(read("app/core/aaron-blog-grounding.js"), sandbox);
  return sandbox.window.AISystem6AaronBlogGrounding;
}

// ---- Static wiring: the same seams the Endfield anchor uses ----------------
const chatSource = read("app/core/chat-messages.js");
test.assert(chatSource.includes("window.AISystem6SideAskAnchors?.[id]") && chatSource.includes("await anchorHook()?.prepare(userText, requestAbortController.signal)"), "SideAsk prepares the registered anchor's evidence for the current question");
test.assert(chatSource.includes("...(anchorGrounding?.sources || [])") && chatSource.includes("hook.context(currentLanguage)"), "the reply grounding and the prompt context both read the anchor's per-question evidence");
test.assert(chatSource.includes("window.AISystem6SideAskAnchors?.[source?.kind]") && chatSource.includes("anchor.reveal(source)"), "a chip of a registered kind routes back to its app");
const windowManager = read("app/core/window-manager.js");
test.assert(windowManager.includes('aaronBlog: "aaronBlog"') && windowManager.includes("window.AISystem6SideAskAnchors?.[appId]"), "the pair focuses and names 潮汐信笺");
const adapterSource = read("app/core/aaron-blog-grounding.js");
test.assert(adapterSource.includes("window.AISystem6SideAskAnchors = Object.assign(") && adapterSource.includes("aaronBlog: Object.freeze({"), "the adapter registers 潮汐信笺 as an anchor");
const manifest = await import("../../tooling/runtime-manifest.mjs");
const bootPaths = [...manifest.appModulePaths, ...manifest.lazyRuntimePaths];
test.assert(!bootPaths.includes("app/shared/blog-rag-runtime.js") && !bootPaths.includes("app/core/aaron-blog-grounding.js"), "runtime and adapter cost the boot floppy nothing; the reader loads them");
const reader = read("app/features/aaron-blog.js");
test.assert(reader.includes('ensureLazySystemModule("app/shared/blog-rag-runtime.js"') && reader.includes('ensureLazySystemModule("app/core/aaron-blog-grounding.js"'), "the reader loads the runtime and the adapter with itself");
test.assert(reader.includes('data-blog-ask="post"') && reader.includes('data-blog-ask="auto"'), "the reader offers Ask in SideAsk for the post, the whole blog, or a selection");
test.assert(reader.includes("markCited") && reader.includes("is-cited") && reader.includes("ragPack"), "the reader marks a cited paragraph and keeps the index for offline questions");
test.assert(!/clio-basis-chip|message-grounding/.test(read("styles/94-aaron-blog.css")), "chips keep ClioTalk's own styles; the reader adds no chip CSS");

// ---- The blog's own build, when present ------------------------------------
const distAi6 = join(root, "internal/design-proposals/aaronlau-me/dist/ai6");
if (existsSync(join(distAi6, "rag.json")) && existsSync(join(distAi6, "manifest.json"))) {
  const text = readFileSync(join(distAi6, "rag.json"), "utf8");
  const manifest = JSON.parse(readFileSync(join(distAi6, "manifest.json"), "utf8"));
  test.assert(createHash("sha256").update(text).digest("hex") === manifest.rag?.sha256, "the built pack matches the SHA-256 its manifest names");
  const pack = JSON.parse(text);
  test.assert(pack.chunks.length > 1000 && pack.chunks.every((chunk) => Number.isInteger(chunk.p)), `the built pack is chunked by block (${pack.chunks.length} chunks)`);
} else {
  test.ok("the blog has not been built here; the fixture pack stands in");
}

// ---- Real server ------------------------------------------------------------
const adapter = loadAdapter();
let port = 0;
try {
  port = await reservePort();
} catch (error) {
  if (error?.code !== "EPERM") throw error;
  test.ok("server checks are deferred when the sandbox forbids loopback listeners");
}

if (port) {
  const work = mkdtempSync(join(tmpdir(), "ais6-blog-rag-"));
  const packDir = join(work, "pack");
  const cacheDir = join(work, "cache");
  writePack(packDir);
  let server = startServer(port, { AI_SYSTEM6_AARON_BLOG_PACK_DIR: packDir, AI_SYSTEM6_AARON_BLOG_CACHE_DIR: cacheDir });
  try {
    await server.ready;
    const asked = await request(port, `/api/aaron-blog/retrieve?q=${encodeURIComponent("他 2013 年怎麼看 Vista")}&limit=6`);
    test.assert(asked.status === 200, `retrieval answers 200 (got ${asked.status})`);
    const payload = JSON.parse(asked.body);
    test.assert(payload.results.length > 0 && payload.results.every((result) => result.year === "2013"), "the year in the question filters the evidence");
    test.assert(/^[0-9a-f]{64}$/.test(payload.pack.sha256) && payload.pack.offline === false, "the answer names the verified pack");
    const grounding = adapter.buildFromResults(payload.results);
    test.assert(grounding.sources[0]?.citation === "[S1]" && grounding.sourceCount === payload.results.length, "results map 1:1 to [S1]…[Sn] sources");
    const context = adapter.toSideAskContext("他 2013 年怎麼看 Vista", payload.results, { lang: "zh" });
    test.assert(context.includes("[S1] 2013-") && context.includes("只依据这些证据"), "the SideAsk context carries dated, numbered evidence and the contract");
    const none = JSON.parse((await request(port, `/api/aaron-blog/retrieve?q=${encodeURIComponent("特斯拉 Cybertruck 不锈钢车身")}`)).body);
    test.assert(none.results.length === 0 && adapter.toSideAskContext("特斯拉", none.results).includes("博客里没有写过"), "a question the blog never covered gets the no-evidence instruction");
    const served = await request(port, "/api/aaron-blog/rag");
    test.assert(served.status === 200 && JSON.parse(served.body).kind === "aaronlau-rag", "the reader can fetch the same verified index for offline use");
    test.assert(existsSync(join(cacheDir, "rag.json")), "the verified index is kept on disk");
  } finally {
    await stopServer(server.child);
  }

  // Offline: the pack source is gone; the disk copy still answers.
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir);
  server = startServer(port, { AI_SYSTEM6_AARON_BLOG_PACK_DIR: packDir, AI_SYSTEM6_AARON_BLOG_CACHE_DIR: cacheDir });
  try {
    await server.ready;
    const offline = JSON.parse((await request(port, `/api/aaron-blog/retrieve?q=${encodeURIComponent("iPhone 重量")}`)).body);
    test.assert(offline.pack?.offline === true && offline.results.length > 0, "with the blog unreachable, the verified disk copy answers and says it is offline");
  } finally {
    await stopServer(server.child);
  }

  // A pack whose bytes do not match its manifest is refused.
  const badWork = mkdtempSync(join(tmpdir(), "ais6-blog-rag-bad-"));
  writePack(join(badWork, "pack"), { tamper: true });
  server = startServer(port, { AI_SYSTEM6_AARON_BLOG_PACK_DIR: join(badWork, "pack"), AI_SYSTEM6_AARON_BLOG_CACHE_DIR: join(badWork, "cache") });
  try {
    await server.ready;
    const refused = await request(port, `/api/aaron-blog/retrieve?q=Vista`);
    test.assert(refused.status === 502 && /hash/.test(refused.body), `a tampered pack is refused (got ${refused.status})`);
  } finally {
    await stopServer(server.child);
    rmSync(work, { recursive: true, force: true });
    rmSync(badWork, { recursive: true, force: true });
  }
}

test.finish();
