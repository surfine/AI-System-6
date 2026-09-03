// POST /api/lmstudio/setup
//
// Heavy-lift setup endpoint that drives the local LM Studio install
// from a single click: ensures the `lms` CLI is reachable, starts the
// HTTP server if needed, optionally downloads a configured LLM when none
// are installed, then `lms load`s the chosen model with the requested
// context length and a stable identifier.
//
// Behavior parity with root server.js. Each phase appends a step
// label to `steps` and the final response (whether 200, 409, or 502)
// includes that array so the client can show a deterministic progress
// trail.
//
// Step labels (in observation order, mirroring root):
//   lms-found
//   server-starting          (only if server was offline)
//   server-ready
//   local-models:N
//   downloading:<model>      (only if no local models)
//   model-downloaded         (only if download happened)
//   local-models:N           (re-checked after download)
//   loading:<id>
//   model-loaded             OR  model-already-loaded
//
// Identifier sanitization: body.identifier is restricted to
// [\\w.-]; falling back to "ai-system-main" if the sanitized result
// is empty.
//
// Errors:
// - requestedContextConfig errors propagate (409 missing max ctx,
//   422 too small / exceeds) with { error, detail, steps } where
//   steps is empty (the failure precedes step recording).
// - "lms load" error matching /identifier .*already exists/i is
//   treated as success ("model-already-loaded").
// - No local models even after download -> 409 with detail
//   "LM Studio reported a model download, but no local LLM was
//   found afterward."
// - LM Studio server never came online -> 502 with detail
//   "LM Studio server did not become ready. Open LM Studio once,
//   then retry."
// - AbortError swallowed.
// - Outer 502 catch-all carries { error: "Local model setup failed",
//   detail, steps } so partial progress is observable.

"use strict";

const { send, readJsonBody, requestSignal, respondIfClientError } = require("../lib/http.js");
const {
  requestedContextConfig,
  pickSetupModel,
} = require("../lib/lmstudio-models.js");
const {
  runLms,
  getLocalLmsModels,
} = require("../lib/lms-cli.js");
const {
  DEFAULT_LM_STUDIO_DOWNLOAD_MODEL,
  isLmStudioServerOnline,
  waitForLmStudioServer,
  setLoadedLmStudioModelInfo,
} = require("../lmstudio.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleLmStudioSetup(req, res) {
  const signal = requestSignal(req, res);
  /** @type {string[]} */
  const steps = [];

  try {
    const body = await readJsonBody(req);
    const identifier = String(body.identifier || "ai-system-main").replace(/[^\w.-]/g, "")
      || "ai-system-main";
    const contextConfig = requestedContextConfig(body, body.model || body.download_model || "");
    if ("errorStatus" in contextConfig) {
      send(res, contextConfig.errorStatus, JSON.stringify({
        error: contextConfig.error,
        detail: contextConfig.detail,
        steps,
      }), { "Content-Type": "application/json" });
      return;
    }

    await runLms(["--help"], { timeout: 8000 });
    steps.push("lms-found");

    let serverOnline = await isLmStudioServerOnline(signal);
    if (!serverOnline) {
      steps.push("server-starting");
      await runLms(["server", "start", "--port", "1234", "--bind", "127.0.0.1"], { timeout: 60000 });
      serverOnline = await waitForLmStudioServer(signal, 30000);
    }
    if (!serverOnline) {
      throw new Error("LM Studio server did not become ready. Open LM Studio once, then retry.");
    }
    steps.push("server-ready");

    let localModels = await getLocalLmsModels();
    steps.push(`local-models:${localModels.length}`);
    if (!localModels.length) {
      const downloadModel = String(body.download_model || DEFAULT_LM_STUDIO_DOWNLOAD_MODEL).trim();
      if (!downloadModel) {
        send(res, 409, JSON.stringify({
          error: "No local LLM models found",
          detail: "No default download model is bundled. Choose or install a model in LM Studio, or set AI_SYSTEM6_SETUP_DOWNLOAD_MODEL before using one-click setup.",
          steps,
        }), { "Content-Type": "application/json" });
        return;
      }
      steps.push(`downloading:${downloadModel}`);
      await runLms(["get", downloadModel, "--yes"], { timeout: 60 * 60 * 1000 });
      steps.push("model-downloaded");
      localModels = await getLocalLmsModels();
      steps.push(`local-models:${localModels.length}`);
      if (!localModels.length) {
        send(res, 409, JSON.stringify({
          error: "No local LLM models found",
          detail: "LM Studio reported a model download, but no local LLM was found afterward.",
          steps,
        }), { "Content-Type": "application/json" });
        return;
      }
    }

    const selected = pickSetupModel(localModels, body.model);
    if (!selected) {
      throw new Error("No usable local LLM model was found.");
    }

    steps.push(`loading:${selected.id}`);
    try {
      await runLms([
        "load",
        selected.id,
        "--identifier",
        identifier,
        "--context-length",
        String(contextConfig.contextLength),
        "--gpu",
        "max",
        "--ttl",
        "3600",
        "--yes",
      ], { timeout: 180000 });
      steps.push("model-loaded");
    } catch (error) {
      if (!/identifier .*already exists/i.test(/** @type {Error} */ (error).message)) throw error;
      steps.push("model-already-loaded");
    }

    setLoadedLmStudioModelInfo({
      model: identifier,
      context_length: contextConfig.contextLength,
      max_context_length: contextConfig.maxContext,
    });

    send(res, 200, JSON.stringify({
      model: selected.id,
      chat_model: identifier,
      identifier,
      loaded_model: selected.id,
      context_length: contextConfig.contextLength,
      max_context_length: contextConfig.maxContext,
      max_context_source: contextConfig.maxContextSource,
      endpoint: "/api/chat",
      steps,
    }), { "Content-Type": "application/json" });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    // Setup never started when the body was rejected. The empty step trail is
    // kept so the client reads the same shape on every failure.
    if (respondIfClientError(res, error, { steps })) return;
    send(res, 502, JSON.stringify({
      error: "Local model setup failed",
      detail: /** @type {Error} */ (error).message,
      steps,
    }), { "Content-Type": "application/json" });
  }
}

module.exports = { handleLmStudioSetup };
