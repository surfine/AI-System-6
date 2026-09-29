// Subscription CLI providers: run one model turn through the `claude` or
// `codex` command-line tool the writer is signed in to, and answer in the
// OpenAI chat.completions shape every model route already reads.
//
// The desk reaches this through a sentinel cloud base URL,
// `subscription-cli://claude` or `subscription-cli://codex`, recognised by
// the two transports in lib/fetch.js. Nothing here changes the prompt the
// desk built: task contracts, the humanizer guardrail and the integrity
// messages arrive as system messages and become the CLI's system text.
// Design and failure codes: docs/SUBSCRIPTION-CLI.md.

"use strict";

const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const SCHEME = "subscription-cli:";
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const PROVIDERS = Object.freeze({
  claude: Object.freeze({ id: "claude-subscription", host: "Claude Code", binary: "claude", envVar: "AI_SYSTEM6_CLAUDE_CLI" }),
  codex: Object.freeze({ id: "codex-subscription", host: "Codex", binary: "codex", envVar: "AI_SYSTEM6_CODEX_CLI" }),
});

// Keys that would turn a subscription run into a billed API run, plus the
// desk's own provider key, which a CLI has no business seeing.
const STRIPPED_ENV = Object.freeze([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "DEEPSEEK_API_KEY",
  // Claude Code's sign-in and token refresh break behind an HTTPS CONNECT
  // proxy (anthropics/claude-code#91703). The owner runs the proxy in TUN
  // mode, which captures the CLI's traffic without these variables, so the
  // child never sees them (docs/SUBSCRIPTION-CLI.md).
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
]);

/**
 * @param {unknown} value
 * @returns {"claude" | "codex" | ""}
 */
function subscriptionCliKind(value) {
  const text = String(value || "").trim();
  if (!text.toLowerCase().startsWith(SCHEME)) return "";
  try {
    const host = new URL(text).hostname.toLowerCase();
    return host === "claude" || host === "codex" ? host : "";
  } catch {
    return "";
  }
}

/** @param {unknown} value */
function isSubscriptionCliUrl(value) {
  return Boolean(subscriptionCliKind(value));
}

/** @param {"claude" | "codex"} kind */
function subscriptionCliBaseUrl(kind) {
  return `${SCHEME}//${kind}`;
}

/**
 * Error carrying the HTTP status and code the routes forward to the page.
 *
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {string} warning
 */
function cliError(status, code, message, warning) {
  const error = /** @type {Error & { statusCode: number, code: string, warning: string }} */ (new Error(message));
  error.statusCode = status;
  error.code = code;
  error.warning = warning;
  return error;
}

/** @param {string} home */
function searchDirectories(home) {
  const fromPath = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...fromPath,
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".volta", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
}

/** @param {string} file */
function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Find the CLI: an explicit env override, then PATH, then the folders the
 * installers use. The Mac app starts the server with launchd's minimal PATH,
 * so PATH alone would miss a Homebrew or ~/.local install.
 *
 * @param {"claude" | "codex"} kind
 * @param {{ home?: string }} [options]
 */
function resolveCliBinary(kind, { home = os.homedir() } = {}) {
  const provider = PROVIDERS[kind];
  const explicit = String(process.env[provider.envVar] || "").trim();
  if (explicit) return isExecutable(explicit) ? explicit : "";
  for (const directory of searchDirectories(home)) {
    const candidate = path.join(directory, provider.binary);
    if (isExecutable(candidate)) return candidate;
  }
  return "";
}

/**
 * The child environment: the server's own minus API keys, with PATH extended
 * so a node-script CLI (codex) finds a node even under launchd.
 *
 * @param {string} binary
 * @param {string} home
 */
function childEnvironment(binary, home) {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  const extra = [
    path.dirname(binary),
    path.dirname(process.execPath),
    path.join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const current = String(env.PATH || "").split(path.delimiter).filter(Boolean);
  env.PATH = [...new Set([...current, ...extra])].join(path.delimiter);
  return env;
}

/** @param {unknown} content */
function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object") {
      if (part.type === "image_url" || part.type === "input_image" || part.type === "image" || part.image_url) {
        throw cliError(400, "subscription_cli_images_unsupported", "Subscription CLI providers do not take images yet.",
          "订阅 CLI 暂不支持图片输入，请改用 DeepSeek Flash 或本地视觉模型。");
      }
      if (typeof part.text === "string") return part.text;
    }
    return "";
  }).join("");
}

/**
 * Turn an OpenAI chat payload into the CLI's two inputs: system text and one
 * prompt. A single user turn is passed as-is; a longer conversation is laid
 * out with speaker labels and ends on the turn to answer.
 *
 * @param {any} payload
 * @returns {{ system: string, prompt: string }}
 */
function promptFromPayload(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const system = [];
  const turns = [];
  for (const message of messages) {
    const role = String(message?.role || "user");
    const text = contentText(message?.content).trim();
    if (!text) continue;
    if (role === "system" || role === "developer") system.push(text);
    else turns.push({ role, text });
  }
  const format = payload?.response_format;
  if (format && typeof format === "object" && /json/.test(String(format.type || ""))) {
    const schema = format.json_schema?.schema;
    system.push(schema
      ? `Respond with exactly one JSON value that matches this JSON Schema, with no Markdown fence or commentary:\n${JSON.stringify(schema)}`
      : "Respond with exactly one valid JSON value, with no Markdown fence or commentary.");
  }
  if (!turns.length) {
    throw cliError(400, "subscription_cli_failed", "The request carries no user message.", "请求里没有可回答的内容。");
  }
  const label = (role) => (role === "assistant" ? "Assistant" : role === "tool" ? "Tool result" : "User");
  const prompt = turns.length === 1 && turns[0].role === "user"
    ? turns[0].text
    : [
      "The conversation so far, oldest first:",
      ...turns.map((turn) => `[${label(turn.role)}]\n${turn.text}`),
      "Answer the last user turn.",
    ].join("\n\n");
  return { system: system.join("\n\n") || "Answer the request directly.", prompt };
}

/**
 * @param {"claude" | "codex"} kind
 * @param {{ system: string, stream: boolean, cwd: string }} options
 */
function cliArguments(kind, { system, stream, cwd }) {
  if (kind === "claude") {
    return [
      "-p",
      "--output-format", stream ? "stream-json" : "json",
      ...(stream ? ["--verbose", "--include-partial-messages"] : []),
      "--safe-mode",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--tools", "WebSearch",
      "--allowedTools", "WebSearch",
      "--system-prompt", system,
    ];
  }
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "-s", "read-only",
    "-C", cwd,
    "-c", 'forced_login_method="chatgpt"',
    "-c", 'web_search="live"',
    "-c", `developer_instructions=${JSON.stringify(system)}`,
    "-",
  ];
}

/**
 * Map what a CLI said when it failed to one of the documented codes.
 *
 * @param {string} text
 * @param {"claude" | "codex"} kind
 */
function classifyFailure(text, kind) {
  const host = PROVIDERS[kind].host;
  const message = String(text || "").trim().slice(0, 600) || `${host} exited without an answer.`;
  if (/not logged in|login required|please run \/login|run `?(?:claude|codex) (?:auth )?login|invalid api key|authenticat|unauthori[sz]ed|401|oauth (?:token|session)|session expired|sign in again/i.test(message)) {
    return cliError(401, "subscription_cli_auth", message,
      `${host} 未登录或登录已过期。请在终端运行 ${kind === "claude" ? "claude auth login" : "codex login"} 后重试，或在 Control Panel 改用 DeepSeek 或本地模型。`);
  }
  if (/usage limit|rate limit|limit reached|quota|too many requests|429|credit balance/i.test(message)) {
    return cliError(429, "subscription_cli_quota", message,
      `${host} 订阅额度已用完。请稍后再试，或在 Control Panel 改用 DeepSeek 或本地模型。`);
  }
  return cliError(502, "subscription_cli_failed", message,
    `${host} 没有给出回答。可以重试，或在 Control Panel 改用 DeepSeek 或本地模型。`);
}

/** @param {any} usage */
function openAiUsage(usage) {
  const prompt = Number(usage?.input_tokens || 0) + Number(usage?.cache_read_input_tokens || 0) + Number(usage?.cache_creation_input_tokens || 0);
  const completion = Number(usage?.output_tokens || 0);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

/**
 * Parse a finished run's stdout into `{ text, model, usage }`.
 *
 * @param {"claude" | "codex"} kind
 * @param {string} stdout
 * @param {boolean} streamed
 */
function parseCliOutput(kind, stdout, streamed) {
  const lines = String(stdout || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // A CLI can print a non-JSON notice before its JSON; it carries no answer.
    }
  }
  if (kind === "claude") {
    const result = [...events].reverse().find((event) => event?.type === "result");
    if (!result) throw classifyFailure(stdout, kind);
    if (result.is_error || result.subtype !== "success") throw classifyFailure(String(result.result || result.error || stdout), kind);
    const init = events.find((event) => event?.type === "system" && event?.subtype === "init");
    const model = String(init?.model || Object.keys(result.modelUsage || {})[0] || "unknown");
    return { text: String(result.result || ""), model, usage: openAiUsage(result.usage) };
  }
  const failure = events.find((event) => event?.type === "turn.failed" || event?.type === "error");
  if (failure) throw classifyFailure(String(failure.error?.message || failure.message || stdout), kind);
  const messages = events
    .filter((event) => event?.type === "item.completed" && event?.item?.type === "agent_message")
    .map((event) => String(event.item.text || ""));
  if (!messages.length) throw classifyFailure(stdout, kind);
  const completed = [...events].reverse().find((event) => event?.type === "turn.completed");
  const model = String(events.find((event) => typeof event?.model === "string")?.model || "unknown");
  void streamed;
  return { text: messages[messages.length - 1], model, usage: openAiUsage(completed?.usage) };
}

/**
 * The provider block every answer carries, so a receipt can say who answered.
 *
 * @param {"claude" | "codex"} kind
 * @param {string} model
 */
function providerBlock(kind, model) {
  return { id: PROVIDERS[kind].id, host: PROVIDERS[kind].host, model: model || "unknown" };
}

/**
 * Run one turn. `onDelta` receives Claude's text as it streams.
 *
 * @param {"claude" | "codex"} kind
 * @param {any} payload
 * @param {{ signal?: AbortSignal | null, stream?: boolean, onDelta?: (text: string) => void, onModel?: (model: string) => void, home?: string }} [options]
 * @returns {Promise<{ text: string, model: string, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number }, elapsedMs: number }>}
 */
async function runSubscriptionCli(kind, payload, { signal = null, stream = false, onDelta, onModel, home = os.homedir() } = {}) {
  const provider = PROVIDERS[kind];
  const binary = resolveCliBinary(kind, { home });
  if (!binary) {
    throw cliError(503, "subscription_cli_unavailable", `${provider.host} CLI (\`${provider.binary}\`) was not found on this Mac.`,
      `没有找到 ${provider.host} 的命令行工具 ${provider.binary}。请先安装并登录，或在 Control Panel 改用 DeepSeek 或本地模型。`);
  }
  const { system, prompt } = promptFromPayload(payload);
  const streamed = Boolean(stream && kind === "claude");
  const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "ais6-cli-"));
  const started = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(binary, cliArguments(kind, { system, stream: streamed, cwd }), {
        cwd,
        env: childEnvironment(binary, home),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let pending = "";
      let settled = false;
      let reportedModel = "";
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
        if (error) reject(error);
        else resolve(value);
      };
      const onAbort = () => {
        child.kill("SIGTERM");
        finish(cliError(504, "subscription_cli_timeout", `${provider.host} did not finish before the request ended.`,
          `${provider.host} 超时未完成。可以重试，或在 Control Panel 改用 DeepSeek 或本地模型。`));
      };
      const timer = setTimeout(onAbort, RUN_TIMEOUT_MS);
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener?.("abort", onAbort, { once: true });
      child.on("error", (error) => {
        finish(cliError(503, "subscription_cli_unavailable", String(error?.message || error),
          `无法启动 ${provider.host} 的命令行工具。请确认已安装，或在 Control Panel 改用 DeepSeek 或本地模型。`));
      });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
          child.kill("SIGTERM");
          finish(cliError(502, "subscription_cli_failed", `${provider.host} produced more output than the desk accepts.`,
            `${provider.host} 的输出过长。`));
          return;
        }
        stdout += chunk;
        if (!streamed) return;
        pending += chunk;
        let newline;
        while ((newline = pending.indexOf("\n")) !== -1) {
          const line = pending.slice(0, newline).trim();
          pending = pending.slice(newline + 1);
          if (!line) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event?.type === "system" && event?.subtype === "init" && typeof event.model === "string" && !reportedModel) {
            reportedModel = event.model;
            onModel?.(reportedModel);
          }
          const delta = event?.type === "stream_event" && event.event?.type === "content_block_delta"
            && event.event.delta?.type === "text_delta" ? String(event.event.delta.text || "") : "";
          if (delta) onDelta?.(delta);
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 64 * 1024) stderr += chunk;
      });
      child.on("close", (code) => {
        if (settled) return;
        try {
          const parsed = parseCliOutput(kind, stdout, streamed);
          finish(null, { ...parsed, elapsedMs: Date.now() - started });
        } catch (error) {
          if (code !== 0 && !stdout.trim()) finish(classifyFailure(stderr || `${provider.host} exited with code ${code}.`, kind));
          else finish(error);
        }
      });
      child.stdin.on("error", () => {
        // The CLI can exit before reading stdin; close() reports that run.
      });
      child.stdin.end(prompt);
    });
  } finally {
    await fsp.rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @param {"claude" | "codex"} kind
 * @param {{ text: string, model: string, usage: any, elapsedMs: number }} result
 */
function completionBody(kind, result) {
  return {
    id: `chatcmpl-sub-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [{ index: 0, message: { role: "assistant", content: result.text }, finish_reason: "stop" }],
    usage: result.usage,
    ai_system6_provider: providerBlock(kind, result.model),
  };
}

/** @param {any} error */
function errorBody(error) {
  return {
    error: String(error?.message || error || "Subscription CLI failed"),
    code: String(error?.code || "subscription_cli_failed"),
    warning: String(error?.warning || ""),
  };
}

/**
 * The fetch-shaped answer postJsonWithFallback hands back for a sentinel URL.
 * A stream request gets an SSE body; anything else a JSON body.
 *
 * @param {string} targetUrl
 * @param {any} payload
 * @param {AbortSignal | null | undefined} signal
 * @param {{ stream?: boolean, home?: string }} [options]
 * @returns {Promise<Response>}
 */
async function subscriptionCliResponse(targetUrl, payload, signal, { stream = false, home } = {}) {
  const kind = subscriptionCliKind(targetUrl);
  const pathname = (() => {
    try {
      return new URL(targetUrl).pathname;
    } catch {
      return "";
    }
  })();
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (!kind) return json(400, errorBody(cliError(400, "subscription_cli_failed", "Unknown subscription CLI.", "")));
  if (/\/embeddings$/.test(pathname)) {
    return json(400, errorBody(cliError(400, "subscription_cli_no_embeddings", "A subscription CLI does not produce embeddings.",
      "订阅 CLI 不提供向量嵌入，桌面会继续使用本地嵌入模型。")));
  }
  if (!/\/chat\/completions$/.test(pathname)) {
    return json(404, errorBody(cliError(404, "subscription_cli_failed", `Unsupported path ${pathname}.`, "")));
  }
  if (!stream || kind !== "claude") {
    try {
      const result = await runSubscriptionCli(kind, payload, { signal, home });
      if (!stream) return json(200, completionBody(kind, result));
      return new Response(sseFrames(kind, result.model, [result.text], result.usage), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    } catch (error) {
      return json(Number(error?.statusCode) || 502, errorBody(error));
    }
  }
  const encoder = new TextEncoder();
  let modelName = "unknown";
  const id = `chatcmpl-sub-${randomUUID()}`;
  const body = new ReadableStream({
    start(controller) {
      const frame = (data) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      runSubscriptionCli(kind, payload, {
        signal,
        stream: true,
        home,
        onModel: (model) => {
          modelName = model;
        },
        onDelta: (text) => frame({ id, object: "chat.completion.chunk", model: modelName, choices: [{ index: 0, delta: { content: text } }] }),
      }).then((result) => {
        frame({ id, object: "chat.completion.chunk", model: result.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: result.usage, ai_system6_provider: providerBlock(kind, result.model) });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }, (error) => {
        frame({ error: errorBody(error), ai_system6_error: errorBody(error) });
        controller.close();
      });
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/**
 * SSE frames for an answer that arrived whole (Codex, or a finished run).
 *
 * @param {"claude" | "codex"} kind
 * @param {string} model
 * @param {string[]} parts
 * @param {any} usage
 */
function sseFrames(kind, model, parts, usage) {
  const id = `chatcmpl-sub-${randomUUID()}`;
  // Content chunks and the closing chunk differ in shape (the last delta is
  // empty and carries usage), so the list holds plain frame objects.
  /** @type {Record<string, unknown>[]} */
  const frames = parts.map((text) => ({ id, object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { content: text } }] }));
  frames.push({ id, object: "chat.completion.chunk", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage, ai_system6_provider: providerBlock(kind, model) });
  return `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`;
}

/**
 * What the status route reports for one CLI, without running a model.
 *
 * @param {"claude" | "codex"} kind
 * @param {{ home?: string, timeoutMs?: number }} [options]
 */
async function subscriptionCliStatus(kind, { home = os.homedir(), timeoutMs = 8000 } = {}) {
  const provider = PROVIDERS[kind];
  const binary = resolveCliBinary(kind, { home });
  if (!binary) return { id: provider.id, host: provider.host, available: false, signedIn: false, version: "", path: "" };
  const run = (args) => new Promise((resolve) => {
    const child = spawn(binary, args, { env: childEnvironment(binary, home), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { out += chunk; });
    child.on("error", () => { clearTimeout(timer); resolve({ code: -1, out }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
  const version = (await run(["--version"])).out.trim().split("\n")[0] || "";
  let signedIn = false;
  if (kind === "claude") {
    const status = await run(["auth", "status"]);
    try {
      signedIn = JSON.parse(status.out.slice(status.out.indexOf("{"))).loggedIn === true;
    } catch {
      signedIn = false;
    }
  } else {
    const status = await run(["login", "status", "-c", 'forced_login_method="chatgpt"']);
    signedIn = status.code === 0 && /logged in/i.test(status.out) && !/not logged in/i.test(status.out);
  }
  return { id: provider.id, host: provider.host, available: true, signedIn, version, path: binary };
}

module.exports = {
  PROVIDERS,
  STRIPPED_ENV,
  childEnvironment,
  cliArguments,
  classifyFailure,
  isSubscriptionCliUrl,
  parseCliOutput,
  promptFromPayload,
  resolveCliBinary,
  runSubscriptionCli,
  subscriptionCliBaseUrl,
  subscriptionCliKind,
  subscriptionCliResponse,
  subscriptionCliStatus,
};
