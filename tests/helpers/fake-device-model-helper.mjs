// A stand-in for the AISystem6Intelligence helper. It speaks the same
// protocol (status / mlx-status: one JSON line; chat: one JSON request on
// stdin, NDJSON on stdout; serve: id-tagged NDJSON both ways) so the route can
// be tested without a model. Scenarios come from the environment of the
// process that spawns it (serve reads them per request, so a test can switch
// scenario without restarting the helper):
//   FAKE_DEVICE_MODEL_STATUS   available | deviceNotEligible | appleIntelligenceNotEnabled
//                              | modelNotReady | other | osTooOld | frameworkMissingAtBuild
//   FAKE_DEVICE_MODEL_CONTEXT  integer, or "null"
//   FAKE_DEVICE_MODEL_CHAT     stream | slow | guardrail | unavailable | mlx-done | consentRequired
//                              | memoryGate | downloadFailed | revise | crash
//                              (mlx-done, the error codes and crash are the MLX engine's shapes)
//   FAKE_DEVICE_MODEL_MLX      installed packs for mlx-status, comma separated ("" = none)
//   FAKE_DEVICE_MODEL_PACK     notInstalled (default) | partial | installed: state mlx-catalog reports for qwen3.5-4b-4bit
//   FAKE_DEVICE_MODEL_MEMGATE  "0" refuses the pack in mlx-catalog and mlx-download
//   FAKE_DEVICE_MODEL_DOWNLOAD ok (default) | slow | fail: how mlx-download behaves
//   FAKE_DEVICE_MODEL_LOG      file that receives requests, SIGTERM, CANCEL, PREWARM and SERVE notes
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const env = process.env;
const log = (line) => { if (env.FAKE_DEVICE_MODEL_LOG) appendFileSync(env.FAKE_DEVICE_MODEL_LOG, `${line}\n`); };
const out = (object) => process.stdout.write(`${JSON.stringify(object)}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// serve keeps running while the test changes scenarios; it reads them from a
// side file when one is named, else from its own environment.
function scenarioEnv() {
  const file = env.FAKE_DEVICE_MODEL_SCENARIO_FILE;
  if (file && existsSync(file)) {
    try { return { ...env, ...JSON.parse(readFileSync(file, "utf8")) }; } catch {}
  }
  return env;
}

function statusObject(e) {
  const scenario = e.FAKE_DEVICE_MODEL_STATUS || "available";
  const context = e.FAKE_DEVICE_MODEL_CONTEXT === "null" ? null : Number(e.FAKE_DEVICE_MODEL_CONTEXT || 4096);
  const available = scenario === "available";
  return {
    available,
    reason: available ? null : scenario,
    contextSize: available ? context : null,
    contextSizeSource: available && context ? "fake" : "unknown",
    variant: available ? "fake" : null,
    useCase: available ? "general" : null,
    os: "27.0.0",
    locales: { "zh-Hans": available, "zh-Hant": available, en: available },
  };
}

function mlxStatusObject(e) {
  const installed = (e.FAKE_DEVICE_MODEL_MLX ?? "qwen3.5-4b-4bit").split(",").filter(Boolean);
  return {
    engine: "mlx", os: "27.0.0", installed, runnable: installed,
    vision: installed.filter((id) => id.startsWith("qwen3.5")), drafters: [], lastGood: installed[0] || null,
    contextTokens: Object.fromEntries(installed.map((id) => [id, id.startsWith("qwen3.5") ? 16384 : 4096])),
    available: installed.length > 0, reason: installed.length ? null : "noModelDownloaded",
  };
}

/**
 * One chat. `emit` writes one event; `cancelled()` says whether to stop.
 * Resolves to the exit code the one-shot helper would use.
 */
async function chat(request, emit, cancelled, e) {
  const mode = e.FAKE_DEVICE_MODEL_CHAT || "stream";
  const mlx = request.engine === "mlx";
  if (Array.isArray(request.images)) log(`IMAGES ${request.images.length} ${request.images.every((file) => existsSync(file))}`);
  if (mode === "unavailable") {
    emit({ type: "error", code: "unavailable", reason: "modelNotReady", message: "not ready" });
    return 3;
  }
  if (mode === "guardrail") {
    emit({ type: "error", code: "guardrailViolation", message: "declined" });
    return 1;
  }
  if (["consentRequired", "memoryGate", "downloadFailed"].includes(mode)) {
    emit({ type: "error", code: mode, message: "mlx " + mode });
    return 1;
  }
  if (mode === "revise") {
    for (const text of ["The cat sat", "The dog sat on"]) emit({ type: "snapshot", text });
    emit({ type: "done" });
    return 0;
  }
  const words = ["Where", " did", " this", " start", "?"];
  let text = "";
  for (const word of words) {
    if (cancelled()) return 143;
    text += word;
    // The MLX engine in serve mode sends deltas; Apple's model and one-shot chat send snapshots.
    emit(mlx && e.FAKE_DEVICE_MODEL_SERVE ? { type: "delta", text: word } : { type: "snapshot", text });
    if (mode === "crash") process.exit(1);
    if (mode === "slow") await sleep(400);
  }
  if (cancelled()) return 143;
  if (mode === "mlx-done") {
    emit({ type: "done", finish: "stop", model: "qwen3-1.7b-4bit", fellBackFrom: "qwen3-4b-4bit", pid: process.pid,
      usage: { promptTokens: 30, completionTokens: 5, promptSeconds: 0.3, generateSeconds: 0.1, tokensPerSecond: 50 } });
  } else emit({ type: "done" });
  return 0;
}

const FAKE_PACK_BYTES = 3_061_000_000;
function catalogObject(e) {
  const state = e.FAKE_DEVICE_MODEL_PACK || "notInstalled";
  const pack = (id, displayName) => ({
    id, repo: `mlx-community/${displayName}`, revision: "fake", displayName, license: "Apache-2.0",
    licenseURL: "https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE", totalBytes: FAKE_PACK_BYTES,
    estimatedResidentBytes: 4_090_000_000, contextTokens: 16384, languages: ["zh-Hans", "zh-Hant", "en"],
    hasVision: true, drafter: null, state, ...(state === "partial" ? { bytesOnDisk: 1_000_000_000 } : {}),
    memoryGate: { allowed: e.FAKE_DEVICE_MODEL_MEMGATE !== "0", limitBytes: 9_600_000_000 },
  });
  return {
    packs: [pack("qwen3-1.7b-4bit", "Qwen3 1.7B (4-bit)"), pack("qwen3.5-4b-4bit", "Qwen3.5 4B (4-bit)")],
    drafters: [], physicalMemoryBytes: 16_000_000_000, root: "/private/secret/ClioModels", lastGood: null,
  };
}

/** mlx-download <id> --consent <n>: NDJSON progress, then done / error; SIGTERM exits 143 without a done line. */
async function download(args, e) {
  log(`DOWNLOAD ${args.join(" ")}`);
  process.on("SIGTERM", () => { log("SIGTERM"); process.exit(143); });
  const consent = Number(args[args.indexOf("--consent") + 1]);
  if (consent !== FAKE_PACK_BYTES) { out({ type: "error", code: "consentRequired", message: "consent" }); process.exit(2); }
  if (e.FAKE_DEVICE_MODEL_MEMGATE === "0") { out({ type: "error", code: "memoryGate", message: "gate" }); process.exit(3); }
  const mode = e.FAKE_DEVICE_MODEL_DOWNLOAD || "ok";
  for (let step = 1; step <= 4; step += 1) {
    out({ type: "progress", bytesDone: Math.round(FAKE_PACK_BYTES * step / 4), totalBytes: FAKE_PACK_BYTES, file: "model.safetensors" });
    if (mode === "fail" && step === 2) { out({ type: "error", code: "downloadFailed", message: "network at /private/secret" }); process.exit(1); }
    await sleep(mode === "slow" ? 600 : 20);
  }
  out({ type: "done", id: args[0], path: "/private/secret/ClioModels/x" });
  process.exit(0);
}

const command = process.argv[2];
if (command === "mlx-catalog") {
  out(catalogObject(env));
} else if (command === "mlx-download") {
  await download(process.argv.slice(3), env);
} else if (command === "status") {
  out(statusObject(env));
} else if (command === "mlx-status") {
  out(mlxStatusObject(env));
} else if (command === "chat") {
  process.on("SIGTERM", () => { log("SIGTERM"); process.exit(143); });
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", async () => {
    log(`REQUEST ${input}`);
    const code = await chat(JSON.parse(input), out, () => false, env);
    if (code !== 0) process.exit(code);
  });
} else if (command === "serve") {
  log(`SERVE ${process.pid}`);
  process.on("SIGTERM", () => { log("SIGTERM"); process.exit(143); });
  const running = new Map();
  out({ type: "ready", pid: process.pid });
  const lines = createInterface({ input: process.stdin });
  lines.on("line", async (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const { id, op } = message;
    const emit = (event) => out({ ...event, id });
    if (op === "chat") {
      log(`REQUEST ${JSON.stringify(message.request)}`);
      const state = { cancelled: false };
      running.set(id, state);
      const e = { ...scenarioEnv(), FAKE_DEVICE_MODEL_SERVE: "1" };
      const code = await chat(message.request, emit, () => state.cancelled, e);
      if (code === 143) emit({ type: "error", code: "cancelled", message: "cancelled" });
      running.delete(id);
    } else if (op === "cancel") {
      const target = running.get(message.target);
      if (target) {
        target.cancelled = true;
        log(`CANCEL ${message.target}`);
      }
      emit({ type: "ok", cancelled: Boolean(target) });
    } else if (op === "prewarm") {
      log(`PREWARM ${message.model || ""}`);
      emit({ type: "ok", prewarmSeconds: 0 });
    } else if (op === "status") {
      emit({ type: "status", ...statusObject(scenarioEnv()), mlx: mlxStatusObject(scenarioEnv()) });
    } else if (op === "unload") {
      emit({ type: "ok" });
    } else {
      emit({ type: "error", code: "badRequest", message: `unknown op ${op}` });
    }
  });
  lines.on("close", () => process.exit(0));
} else {
  process.exit(2);
}
