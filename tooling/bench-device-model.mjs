#!/usr/bin/env node
// Built-in on-device model vs LM Studio, same machine, same model, same prompt.
//
//   node tooling/bench-device-model.mjs [--runs 5] [--targets route,helper,lmstudio]
//        [--task three-questions] [--cold] [--label name] [--out file.json]
//        [--model qwen3.5-4b-4bit] [--lms-model qwen3.5-4b-mlx] [--lms-url http://127.0.0.1:1234]
//        [--max-load 160] [--helper path] [--oneshot-helper path] [--prefill]
//
// Targets (interleaved run by run: route, helper, lmstudio, route, ...):
//   route           POST /api/device-model/chat (engine mlx) on an in-process Node server:
//                   the end-to-end page path, SSE included. The route decides one-shot or
//                   persistent (AI_SYSTEM6_DEVICE_MODEL_PERSISTENT=0 forces one-shot).
//   helper          the helper directly: a long-lived `serve` process (NDJSON, request ids)
//   helper-oneshot  one `chat` process per request (the pre-persistent helper; --oneshot-helper
//                   names a different binary, e.g. the baseline build, to run side by side)
//   lmstudio        LM Studio's OpenAI-compatible streaming endpoint
//
// Both sides get the same system instructions and user message (built by
// buildDeviceRequest, i.e. exactly what the route sends), the same max tokens,
// temperature and top-p, and thinking off. Decode tok/s is computed the same way
// for both: (completion tokens - 1) / (last delta - first delta).
//
// --cold also measures one cold start per side: ours = a fresh helper process to
// the first token; LM Studio = model load (REST) plus the first token. LM Studio is
// shared: the bench loads its model only when nothing is loaded and unloads only
// the instance it loaded.

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next === undefined || next.startsWith("--") ? true : next;
}

const runs = Number(arg("runs", 5));
const targets = String(arg("targets", "route,helper,lmstudio")).split(",").filter(Boolean);
const task = String(arg("task", "three-questions"));
const model = String(arg("model", "qwen3.5-4b-4bit"));
const lmsModel = String(arg("lms-model", "qwen3.5-4b-mlx"));
const lmsUrl = String(arg("lms-url", "http://127.0.0.1:1234"));
const maxLoad = Number(arg("max-load", 160));
const label = String(arg("label", "run"));
const cold = arg("cold", false) === true;
const temperature = Number(arg("temperature", task === "title" ? 0 : 0.7));
const topP = Number(arg("top-p", 0.8));
const topK = Number(arg("top-k", 0));
const maxTokens = Number(arg("max-tokens", 400));
const seedBase = Number(arg("seed", 1234));
// The test Mac is a fanless MacBook Air: sustained GPU work lowers its clocks. A pause
// before each run lets every side start from a similar thermal state.
const cooldownMs = Number(arg("cooldown", 0));
// --rotate: start each round with the next target, so no side always runs on the warmest GPU.
const rotate = arg("rotate", false) === true;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = String(arg("out", path.join(repoRoot, ".lane-logs/bench", `${label}-${stamp}.json`)));
const lmsBin = path.join(os.homedir(), ".lmstudio/bin/lms");

if (arg("helper", null)) process.env.AI_SYSTEM6_DEVICE_MODEL_HELPER = String(arg("helper"));
const device = require("../apps/server/server/device-model.js");
const routes = require("../apps/server/server/routes/device-model.js");

const prompts = {
  "three-questions": {
    language: "zh-Hans",
    messages: [{
      role: "user",
      content: "我想写一篇关于外公的文章，但一直拖着。他是修自行车的，在镇上的老街摆了三十年摊。我记得小时候坐在他的工具箱上看他补胎，手上全是黑油。后来老街拆了，他也不修了。我不知道从哪里开始写，也不知道写这个有什么意义，可能就是想记下来。",
    }],
  },
  // General ClioTalk chat on the built-in route (guardrails as /api/chat assembles them).
  chat: {
    language: "zh-Hans",
    messages: [{ role: "user", content: "我想写一篇关于外公的文章，但一直拖着。他是修自行车的，在镇上的老街摆了三十年摊。你觉得我该从哪里开始？" }],
  },
  title: {
    language: "zh-Hans",
    messages: [{ role: "user", content: "外公在老街修了三十年自行车，老街拆了以后他就不修了。我想写他。" }],
  },
};
// --prefill: a long user message (about 3,000 tokens with the instructions) and a short
// answer, so the time to the first token is dominated by prefill. A per-run nonce leads
// the instructions so neither side can reuse a cached prefix.
const prefill = arg("prefill", false) === true;
if (prefill) {
  const lines = [];
  for (let i = 1; lines.join("\n").length < 5200; i += 1) {
    lines.push(`第${i}段：外公的修车摊在老街第${i * 3}号门口，${i}月的早上他先把打气筒擦干净，再把补胎用的胶水、锉刀和${i + 2}块旧内胎排成一行。Neighbours brought ${i} bicycles that week; he wrote each repair in a notebook with the price, ${i * 5} yuan or less.`);
  }
  prompts["three-questions"].messages = [{ role: "user", content: lines.join("\n") }];
}
const body = { ai_system6_task_kind: task, ...prompts[task], max_tokens: prefill ? 8 : maxTokens, temperature };
const general = task === "chat";
const built = general ? device.buildBuiltInChatRequest(body) : device.buildDeviceRequest(body);
const instructionsFor = (seed) => (prefill ? `Run ${seed}-${Math.random().toString(36).slice(2)}.\n` : "") + (built.request.instructions || "");
// The messages both sides read: the general chat's turns, or instructions plus prompt.
function messagesFor(seed) {
  if (general) return built.request.messages.map((message) => ({ ...message }));
  return [{ role: "system", content: instructionsFor(seed) }, { role: "user", content: built.request.prompt }];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => performance.now();
const loadavg = () => os.loadavg().map((n) => Math.round(n * 10) / 10);

async function waitForLoad() {
  for (let waited = 0; waited < 120000; waited += 5000) {
    if (os.loadavg()[0] <= maxLoad) return waited;
    await sleep(5000);
  }
  return -1;
}

function rssOf(pid) {
  if (!pid) return null;
  try {
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) * 1024 || null;
  } catch { return null; }
}

/** Shared bookkeeping for one streamed answer. */
function recorder(start) {
  const r = { start, first: null, last: null, text: "", deltas: 0 };
  return {
    delta(piece) {
      if (!piece) return;
      const t = now();
      if (r.first === null) r.first = t;
      r.last = t;
      r.text += piece;
      r.deltas += 1;
    },
    result(extra = {}) {
      const end = now();
      const completion = extra.completionTokens ?? null;
      const decodeSpan = r.first !== null && r.last !== null ? (r.last - r.first) / 1000 : null;
      return {
        ttftMs: r.first === null ? null : Math.round(r.first - r.start),
        totalMs: Math.round(end - r.start),
        deltas: r.deltas,
        chars: r.text.length,
        completionTokens: completion,
        promptTokens: extra.promptTokens ?? null,
        prefillTokPerSec: extra.promptTokens && r.first !== null ? Math.round(extra.promptTokens / ((r.first - r.start) / 1000)) : null,
        enginePrefillTokPerSec: extra.enginePromptSeconds ? Math.round(extra.promptTokens / extra.enginePromptSeconds) : null,
        decodeTokPerSec: completion && decodeSpan > 0 ? Math.round(((completion - 1) / decodeSpan) * 10) / 10 : null,
        engineTokPerSec: extra.engineTokPerSec ?? null,
        thinkingLeak: /<think>|<\/think>/.test(r.text) || Boolean(extra.reasoning),
        text: r.text,
        ...extra.more,
      };
    },
  };
}

// ---- ours: in-process route --------------------------------------------------------------
let routeServer = null;
async function routeBase() {
  if (routeServer) return `http://127.0.0.1:${routeServer.address().port}`;
  routeServer = http.createServer((req, res) => {
    if (req.method === "GET") routes.handleDeviceModelStatus(req, res);
    else routes.handleDeviceModelChat(req, res);
  });
  await new Promise((resolve) => routeServer.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${routeServer.address().port}`;
}

async function runRoute(seed) {
  const base = await routeBase();
  const start = now();
  const rec = recorder(start);
  const response = await fetch(`${base}/api/device-model/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, engine: "mlx", model, top_p: topP, seed, stream: true }),
  });
  if (!response.ok) throw new Error(`route ${response.status} ${await response.text()}`);
  const decoder = new TextDecoder();
  let buffer = "";
  let metrics = null;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let split;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const payload = block.replace(/^data: /, "").trim();
      if (!payload || payload === "[DONE]") continue;
      const event = JSON.parse(payload);
      if (event.error) throw new Error(JSON.stringify(event.error));
      rec.delta(event.choices?.[0]?.delta?.content);
      if (event.ai_system6_metrics) metrics = event.ai_system6_metrics;
    }
  }
  const usage = metrics?.usage || {};
  return rec.result({
    completionTokens: usage.completionTokens,
    promptTokens: usage.promptTokens,
    engineTokPerSec: usage.tokensPerSecond,
    more: { helperPid: metrics?.helper_pid ?? null, rss: rssOf(metrics?.helper_pid), helperMemory: metrics?.memory ?? null },
  });
}

// ---- ours: helper direct -----------------------------------------------------------------
function helperPath() {
  const helper = device.deviceModelHelperPath();
  if (!helper) throw new Error("no helper built");
  return helper;
}

function helperRequest(seed) {
  if (general) {
    return { ...built.request, engine: "mlx", model, options: { ...built.request.options, temperature, topP, seed, ...(topK ? { topK } : {}) } };
  }
  return {
    ...built.request,
    instructions: instructionsFor(seed),
    engine: "mlx",
    model,
    options: { ...built.request.options, temperature, topP, seed, ...(topK ? { topK } : {}) },
  };
}

function readNdjson(stream, onEvent) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (line.trim()) {
        try { onEvent(JSON.parse(line)); } catch {}
      }
    }
  });
}

/** Consumes snapshot or delta events for one request and resolves at done. */
function consume(rec, event, state) {
  if (event.type === "delta" && typeof event.text === "string") rec.delta(event.text);
  else if (event.type === "snapshot" && typeof event.text === "string") {
    rec.delta(event.text.slice(state.sent.length));
    state.sent = event.text;
  }
}

async function runHelperOneshot(seed) {
  const start = now();
  const rec = recorder(start);
  const child = spawn(arg("oneshot-helper", null) ? String(arg("oneshot-helper")) : helperPath(), ["chat"], { stdio: ["pipe", "pipe", "pipe"] });
  const state = { sent: "" };
  let done = null;
  let peakRss = 0;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, rssOf(child.pid) || 0); }, 250);
  await new Promise((resolve, reject) => {
    readNdjson(child.stdout, (event) => {
      if (event.type === "error") reject(new Error(JSON.stringify(event)));
      else if (event.type === "done") done = event;
      else consume(rec, event, state);
    });
    child.on("close", () => (done ? resolve() : reject(new Error("helper exited without done"))));
    child.stdin.end(JSON.stringify(helperRequest(seed)));
  }).finally(() => clearInterval(sampler));
  return rec.result({
    completionTokens: done.usage?.completionTokens,
    promptTokens: done.usage?.promptTokens,
    engineTokPerSec: done.usage?.tokensPerSecond,
    enginePromptSeconds: done.usage?.promptSeconds,
    more: { rss: peakRss || null, phases: done.phases ?? null },
  });
}

let serveChild = null;
let serveSeq = 0;
const serveWaiters = new Map();
function serveHelper() {
  if (serveChild && serveChild.exitCode === null) return serveChild;
  serveChild = spawn(helperPath(), ["serve"], { stdio: ["pipe", "pipe", "pipe"] });
  serveChild.stderr.on("data", () => {});
  readNdjson(serveChild.stdout, (event) => serveWaiters.get(event.id)?.(event));
  return serveChild;
}

async function runHelperServe(seed, { fresh = false } = {}) {
  if (fresh && serveChild) { serveChild.kill("SIGKILL"); serveChild = null; }
  const start = now();
  const child = serveHelper();
  const rec = recorder(start);
  const id = `b${++serveSeq}`;
  const state = { sent: "" };
  const done = await new Promise((resolve, reject) => {
    serveWaiters.set(id, (event) => {
      if (event.type === "error") reject(new Error(JSON.stringify(event)));
      else if (event.type === "done") resolve(event);
      else consume(rec, event, state);
    });
    child.stdin.write(`${JSON.stringify({ id, op: "chat", request: helperRequest(seed) })}\n`);
  }).finally(() => serveWaiters.delete(id));
  return rec.result({
    completionTokens: done.usage?.completionTokens,
    promptTokens: done.usage?.promptTokens,
    engineTokPerSec: done.usage?.tokensPerSecond,
    enginePromptSeconds: done.usage?.promptSeconds,
    more: { rss: rssOf(child.pid), helperMemory: done.memory ?? null, phases: done.phases ?? null },
  });
}

// ---- LM Studio ---------------------------------------------------------------------------
async function lmsLoaded() {
  const data = await (await fetch(`${lmsUrl}/api/v1/models`)).json();
  return (data.models || []).flatMap((m) => (m.loaded_instances || []).map((inst) => ({ key: m.key, id: inst.id, config: inst.config })));
}

let lmsWeLoaded = false;
async function lmsEnsureLoaded() {
  const loaded = await lmsLoaded();
  if (loaded.some((m) => m.key === lmsModel)) return { loadMs: 0, alreadyLoaded: true };
  if (loaded.length) throw new Error(`LM Studio has another model loaded (${loaded.map((m) => m.key).join(", ")}); not touching it`);
  const start = now();
  const response = await fetch(`${lmsUrl}/api/v1/models/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: lmsModel, context_length: 4096 }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`LM Studio load ${response.status} ${text}`);
  lmsWeLoaded = true;
  return { loadMs: Math.round(now() - start), alreadyLoaded: false, response: text.slice(0, 400) };
}

async function lmsUnloadOurs() {
  if (!lmsWeLoaded) return;
  const mine = (await lmsLoaded()).filter((m) => m.key === lmsModel);
  for (const inst of mine) {
    await fetch(`${lmsUrl}/api/v1/models/unload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: inst.id }),
    }).catch(() => {});
  }
  lmsWeLoaded = false;
}

async function runLmStudio(seed) {
  const messages = messagesFor(seed);
  const start = now();
  const rec = recorder(start);
  const response = await fetch(`${lmsUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: lmsModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: body.max_tokens,
      temperature,
      top_p: topP,
      ...(topK ? { top_k: topK } : {}),
      seed,
      chat_template_kwargs: { enable_thinking: false },
      enable_thinking: false,
      reasoning_effort: "none",
    }),
  });
  if (!response.ok) throw new Error(`lmstudio ${response.status} ${await response.text()}`);
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;
  let reasoning = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      const event = JSON.parse(payload);
      const delta = event.choices?.[0]?.delta || {};
      if (delta.reasoning_content || delta.reasoning) reasoning += delta.reasoning_content || delta.reasoning;
      rec.delta(delta.content);
      if (event.usage) usage = event.usage;
    }
  }
  return rec.result({
    completionTokens: usage?.completion_tokens,
    promptTokens: usage?.prompt_tokens,
    reasoning,
    more: { reasoningChars: reasoning.length },
  });
}

// ---- driver ------------------------------------------------------------------------------
const runners = {
  route: runRoute,
  helper: (seed) => runHelperServe(seed),
  "helper-oneshot": runHelperOneshot,
  lmstudio: runLmStudio,
};

function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { median: Math.round(median * 10) / 10, min: v[0], max: v.at(-1), n: v.length };
}

const report = {
  label,
  at: new Date().toISOString(),
  machine: { model: execFileSync("sysctl", ["-n", "hw.model"], { encoding: "utf8" }).trim(), memBytes: os.totalmem(), cpus: os.cpus().length },
  config: { runs, targets, task, prefill, cooldownMs, rotate, topK, model, lmsModel, temperature, topP, maxTokens, seedBase, persistentEnv: process.env.AI_SYSTEM6_DEVICE_MODEL_PERSISTENT ?? null },
  request: { messages: messagesFor(seedBase).map((message) => ({ role: message.role, chars: message.content.length })) },
  cold: {},
  runs: [],
  summary: {},
};

function save() {
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
}

try {
  if (targets.includes("lmstudio")) {
    if (cold) {
      const loaded = await lmsLoaded();
      if (loaded.length) report.cold.lmstudio = { skipped: `already loaded: ${loaded.map((m) => m.key).join(", ")}` };
      else {
        const waited = await waitForLoad();
        const load = loadavg();
        const loadInfo = await lmsEnsureLoaded();
        const first = await runLmStudio(seedBase);
        report.cold.lmstudio = { ...loadInfo, loadavg: load, waitedMs: waited, firstRequest: first, coldTtftMs: loadInfo.loadMs + first.ttftMs };
      }
    }
    report.lmsLoad = await lmsEnsureLoaded();
    // One untimed request so LM Studio's warm path is warm, as ours is after prewarm.
    await runLmStudio(seedBase);
  }
  if (cold && targets.some((t) => t === "route" || t === "helper")) {
    await waitForLoad();
    const load = loadavg();
    const start = now();
    const first = await runHelperServe(seedBase, { fresh: true });
    report.cold.ours = { loadavg: load, firstRequest: first, coldTtftMs: first.ttftMs, spawnToDoneMs: Math.round(now() - start) };
  }
  // Warm-up for each of our targets (prewarm happens in the helper; this also opens the route's helper).
  for (const target of targets) {
    if (target === "route" || target === "helper") await runners[target](seedBase).catch((error) => { report[`warmupError_${target}`] = String(error.message); });
  }

  for (let i = 0; i < runs; i += 1) {
    const order = rotate ? targets.map((_, k) => targets[(k + i) % targets.length]) : targets;
    for (const target of order) {
      if (cooldownMs) await sleep(cooldownMs);
      const waited = await waitForLoad();
      const before = loadavg();
      const seed = seedBase + i;
      let result;
      try {
        result = await runners[target](seed);
      } catch (error) {
        result = { error: String(error.message || error) };
      }
      const entry = { round: i, target, seed, loadavgBefore: before, loadavgAfter: loadavg(), waitedMs: waited, ...result };
      report.runs.push(entry);
      console.log(`${label} #${i} ${target.padEnd(14)} ttft=${result.ttftMs}ms total=${result.totalMs}ms tok=${result.completionTokens} tok/s=${result.decodeTokPerSec} load=${before[0]}${result.error ? ` ERROR ${result.error}` : ""}`);
      save();
    }
  }

  for (const target of targets) {
    const rows = report.runs.filter((r) => r.target === target && !r.error);
    report.summary[target] = {
      ttftMs: stats(rows.map((r) => r.ttftMs)),
      totalMs: stats(rows.map((r) => r.totalMs)),
      decodeTokPerSec: stats(rows.map((r) => r.decodeTokPerSec)),
      prefillTokPerSec: stats(rows.map((r) => r.prefillTokPerSec)),
      promptTokens: stats(rows.map((r) => r.promptTokens)),
      completionTokens: stats(rows.map((r) => r.completionTokens)),
      rssBytes: stats(rows.map((r) => r.rss)),
      load1: stats(rows.map((r) => r.loadavgBefore[0])),
      errors: report.runs.filter((r) => r.target === target && r.error).length,
      thinkingLeaks: rows.filter((r) => r.thinkingLeak).length,
    };
  }
  save();
  console.log(JSON.stringify({ summary: report.summary, cold: Object.fromEntries(Object.entries(report.cold).map(([k, v]) => [k, v.coldTtftMs ?? v.skipped])) }, null, 2));
  console.log(`saved ${outFile}`);
} finally {
  if (serveChild) serveChild.kill("SIGTERM");
  routeServer?.close();
  await device.shutdownDeviceModelHelpers?.();
  if (!arg("keep-lms", false)) await lmsUnloadOurs();
}
