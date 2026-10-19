// The built-in model's door on the server: the catalog the writer sees (exact
// size, license, state, memory gate, nothing of the helper's own paths), the
// consent that must be that exact byte count, one download at a time with SSE
// progress, a client disconnect that does not stop it, a Cancel that sends
// SIGTERM to the download process, and the plain refusals (memory gate, already
// installed, unknown pack, no helper).

import http from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("device-model-download");
const device = require("../../apps/server/server/device-model.js");
const routes = require("../../apps/server/server/routes/device-model.js");

const tmp = mkdtempSync(join(tmpdir(), "ais6-device-download-"));
const logFile = join(tmp, "helper.log");
process.env.AI_SYSTEM6_DEVICE_MODEL_HELPER = join(root, "tests/helpers/fake-device-model-helper.mjs");
process.env.FAKE_DEVICE_MODEL_LOG = logFile;
const SIZE = 3_061_000_000;
const logLines = (prefix) => (existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter((line) => line.startsWith(prefix)) : []);

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/api/device-model/catalog") routes.handleDeviceModelCatalog(req, res);
  else if (path === "/api/device-model/download" && req.method === "POST") routes.handleDeviceModelDownloadStart(req, res);
  else if (path === "/api/device-model/download" && req.method === "GET") routes.handleDeviceModelDownloadAttach(req, res);
  else if (path === "/api/device-model/download" && req.method === "DELETE") routes.handleDeviceModelDownloadCancel(req, res);
  else { res.statusCode = 404; res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

function scenario(env = {}) {
  for (const key of ["FAKE_DEVICE_MODEL_PACK", "FAKE_DEVICE_MODEL_MEMGATE", "FAKE_DEVICE_MODEL_DOWNLOAD"]) delete process.env[key];
  Object.assign(process.env, env);
  device.resetDeviceModelStatusCache();
}
const events = (text) => text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
const catalog = async () => (await fetch(`${base}/api/device-model/catalog`)).json();
const start = (body, init = {}) => fetch(`${base}/api/device-model/download`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...init,
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  // The catalog: the curated default only, with the exact size, and no helper-side paths.
  scenario();
  const shown = await catalog();
  test.assert(shown.helper === true && shown.pack?.id === "qwen3.5-4b-4bit" && shown.pack.totalBytes === SIZE, "the catalog names the curated default pack with its exact download size");
  test.assert(shown.pack.license === "Apache-2.0" && shown.pack.licenseURL.startsWith("https://") && shown.pack.state === "notInstalled", "the license and the install state reach the page");
  test.assert(shown.pack.memoryGate.allowed === true && shown.physicalMemoryBytes > 0, "the memory gate and the Mac's memory reach the page");
  test.assert(!JSON.stringify(shown).includes("/private/secret") && !("packs" in shown), "no helper path or other pack leaks into the catalog");
  scenario({ FAKE_DEVICE_MODEL_PACK: "partial" });
  test.assert((await catalog()).pack.bytesOnDisk === 1_000_000_000, "a partial download reports the bytes already on disk");

  // Without a helper the door has nothing to show.
  process.env.AI_SYSTEM6_DEVICE_MODEL = "0";
  const missing = await catalog();
  test.assert(missing.helper === false && missing.reason === "helperMissing" && missing.pack === null, "no helper reads helperMissing");
  const refused = await start({ id: "qwen3.5-4b-4bit", consentBytes: SIZE });
  test.assert(refused.status === 503, "a download without a helper is refused");
  delete process.env.AI_SYSTEM6_DEVICE_MODEL;

  // Consent must be the exact byte count the writer was shown.
  scenario();
  for (const consentBytes of [undefined, 0, SIZE - 1, `${SIZE}`]) {
    const response = await start({ id: "qwen3.5-4b-4bit", consentBytes });
    const body = await response.json();
    test.assert(response.status === 409 && body.code === "device_consent_required" && body.totalBytes === SIZE, `consent ${JSON.stringify(consentBytes)} is refused with the exact size`);
  }
  test.assert(logLines("DOWNLOAD ").length === 0, "no download process starts without consent");
  test.assert((await start({ id: "../etc", consentBytes: SIZE })).status === 400, "a malformed id is refused");
  test.assert((await start({ id: "qwen3-1.7b-4bit", consentBytes: SIZE })).status === 404, "only the curated default is on offer");
  scenario({ FAKE_DEVICE_MODEL_PACK: "installed" });
  test.assert((await (await start({ id: "qwen3.5-4b-4bit", consentBytes: SIZE })).json()).code === "already_installed", "an installed pack is not downloaded again");
  scenario({ FAKE_DEVICE_MODEL_MEMGATE: "0" });
  const gated = await start({ id: "qwen3.5-4b-4bit", consentBytes: SIZE });
  test.assert(gated.status === 503 && (await gated.json()).code === "device_memory_gate", "a pack the memory gate refuses is not downloaded");
  test.assert(logLines("DOWNLOAD ").length === 0, "refusals never reach the helper's download");

  // A consented download streams progress and ends with done.
  scenario();
  const ok = await start({ id: "qwen3.5-4b-4bit", consentBytes: SIZE });
  const okEvents = events(await ok.text());
  test.assert(ok.status === 200 && /text\/event-stream/.test(ok.headers.get("content-type")), "a download answers as an event stream");
  const progress = okEvents.filter((event) => event.type === "progress");
  test.assert(progress.length >= 3 && progress.every((event, index) => index === 0 || event.bytesDone >= progress[index - 1].bytesDone), "progress only moves forward");
  test.assert(okEvents.at(-1).type === "done" && okEvents.at(-1).bytesDone === SIZE && okEvents.at(-1).totalBytes === SIZE, "the stream ends with done at the full size");
  test.assert(logLines("DOWNLOAD ").at(-1) === `DOWNLOAD qwen3.5-4b-4bit --consent ${SIZE}`, "the helper is given the consented size");
  test.assert(!JSON.stringify(okEvents).includes("/private/secret"), "progress carries no helper path");
  test.assert((await (await fetch(`${base}/api/device-model/download`)).json()).download.state === "done", "the finished download can be read back");

  // A failed download is one plain error with no helper detail.
  scenario({ FAKE_DEVICE_MODEL_DOWNLOAD: "fail" });
  const failed = events(await (await start({ id: "qwen3.5-4b-4bit", consentBytes: SIZE })).text());
  test.assert(failed.at(-1).type === "error" && failed.at(-1).code === "downloadFailed" && !JSON.stringify(failed).includes("/private/secret"), "a failed download ends with a plain error code");

  // One at a time; a disconnect does not cancel; Cancel is SIGTERM.
  scenario({ FAKE_DEVICE_MODEL_DOWNLOAD: "slow" });
  rmSync(logFile, { force: true });
  const controller = new AbortController();
  const running = await start({ id: "qwen3.5-4b-4bit", consentBytes: SIZE }, { signal: controller.signal });
  const reader = running.body.getReader();
  // The first event is the stream's own opening state; wait for a real progress line from the helper.
  let seen = "";
  while (!seen.includes('"file":"model.safetensors"')) seen += new TextDecoder().decode((await reader.read()).value);
  const second = await start({ id: "qwen3.5-4b-4bit", consentBytes: SIZE });
  test.assert(second.status === 409 && (await second.json()).code === "download_in_progress", "a second download is refused while one runs");
  controller.abort();
  await reader.cancel().catch(() => {});
  await sleep(100);
  test.assert(device.builtInDownloadRunning() === true && logLines("SIGTERM").length === 0, "closing the page's stream does not stop the download");
  const attached = await fetch(`${base}/api/device-model/download`);
  test.assert(/text\/event-stream/.test(attached.headers.get("content-type")), "a returning page attaches to the running download");
  const attachedReader = attached.body.getReader();
  const first = new TextDecoder().decode((await attachedReader.read()).value);
  test.assert(events(first)[0].state === "running", "the attached stream starts from the current state");
  const cancelled = await (await fetch(`${base}/api/device-model/download`, { method: "DELETE" })).json();
  test.assert(cancelled.cancelled === true, "Cancel reports that it stopped a running download");
  const rest = [];
  for (;;) { const step = await attachedReader.read(); if (step.done) break; rest.push(new TextDecoder().decode(step.value)); }
  test.assert(events(rest.join("")).at(-1).type === "cancelled", "the attached stream ends with cancelled");
  test.assert(logLines("SIGTERM").length === 1 && device.builtInDownloadRunning() === false, `Cancel sent SIGTERM to the download process (${logLines("SIGTERM").length} logged, running ${device.builtInDownloadRunning()}, ${JSON.stringify(device.downloadSnapshot())})`);
  test.assert((await (await fetch(`${base}/api/device-model/download`, { method: "DELETE" })).json()).cancelled === false, "Cancel with nothing running is a plain no");
} finally {
  device.cancelBuiltInDownload();
  await device.shutdownDeviceModelHelpers();
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
test.finish();
