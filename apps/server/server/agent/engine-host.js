// Engine host: one `dsh acp` child per run, inside our own sandbox-exec.
//
// The child is untrusted code driving a model. It gets:
//   - the slim dsh install (tooling/build-dsh-slim.mjs) and our patch set;
//   - an environment built from an allow-list, never the server's own env:
//     PATH, HOME, LANG, DSH_HOME (the run's own, dsh-home.js), TMPDIR (inside
//     the shadow), proxy settings,
//     and the one provider key this run needs, read from the Keychain through
//     credential-vault by the caller and passed as a variable a patch names;
//   - the outer Seatbelt profile from sandbox-profile.js as its OS boundary;
//   - stdio only: ACP JSON-RPC on stdin/stdout, diagnostics on stderr.
// The ACP client is the SDK dsh itself ships (no new dependency here).

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Readable, Writable } = require("node:stream");
const { pathToFileURL } = require("node:url");

const paths = require("./paths.js");
const { buildSandboxProfile } = require("./sandbox-profile.js");

const SECRET_SHAPES = /(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]{8,}/g;
/** How long a stop waits for the child to be gone (SIGKILL is sent at 3 s). */
const EXIT_WAIT_MS = 8000;

/** Engines ClioTalk can choose, and how each reaches its model. */
const ENGINES = Object.freeze({
  deepseek: {
    patch: "deepseek.yml",
    route: "deepseek-official",
    defaultModel: "deepseek-v4-flash",
    keyEnv: "DEEPSEEK_API_KEY",
    vault: { provider: "deepseek", baseUrl: "https://api.deepseek.com" },
  },
  anthropic: {
    patch: "anthropic.yml",
    route: "anthropic",
    defaultModel: "claude-sonnet-5-5",
    keyEnv: "AIS6_AGENT_ANTHROPIC_KEY",
    vault: { provider: "anthropic", baseUrl: "https://api.anthropic.com" },
  },
  lmstudio: {
    patch: "lmstudio.yml",
    route: "lmstudio",
    defaultModel: "",
    keyEnv: "AIS6_AGENT_LMSTUDIO_KEY",
    vault: null,
  },
});

/** @param {string} text */
function redact(text) {
  return String(text || "").replace(SECRET_SHAPES, "$1…");
}

/**
 * The proposal-channel protocol every run's prompt is prefixed with, so the
 * engine knows the directory and the JSON shape — nothing more. This text
 * describes a data format; it is never an instruction to act on a payload,
 * and no payload is ever treated as one. The cloud sandbox (agent-cloud)
 * sends the same preamble with the same directory name.
 */
const ENGINE_PREAMBLE = [
  "[AI System 6] Besides editing files, you may offer candidates to the writer through the proposal channel.",
  'Write each candidate as one JSON file into .ais6-proposals/ at the root of the working folder, named "<number>-<kind>.json". That directory exists; you may write to it but you cannot read or list it.',
  'Each file is one object: {"v":1,"kind":"scrap"|"review"|"restore","title":string,"reason":string,"payload":object,"createdAt":"ISO 8601"}. Unknown fields are dropped.',
  'scrap: payload = {"quoted": a verbatim passage, "source": where it came from, "note": optional}. review: payload = {"quote": an exact passage quoted from the manuscript, "comment": what the engine wants to say about it}. restore: payload = {"files": [{"name": "file.md", "content": the full verbatim content}]} — a pack of deleted or lost files to bring back.',
  "Limits: one file at most 256 KiB, at most 20 files per run; larger or extra files are dropped silently.",
  "Proposals are candidates only. The writer sees each one and decides; nothing is applied unless the writer accepts it. Never put anything but these JSON files into .ais6-proposals.",
].join("\n");

/**
 * The prompt a run actually sends: the writer's text behind the protocol
 * note, so the engine can find the channel. Cloud runs use this too.
 * @param {string} text
 */
function withEnginePreamble(text) {
  return `${ENGINE_PREAMBLE}\n\n${String(text || "")}`;
}

/**
 * Proxy variables pass through (the writer's network may need them); a
 * loopback proxy's port is the only extra loopback door the sandbox opens.
 * @param {NodeJS.ProcessEnv} env
 */
function proxyEnvironment(env) {
  /** @type {Record<string, string>} */
  const out = {};
  /** @type {number[]} */
  const loopbackPorts = [];
  for (const name of ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy"]) {
    const value = String(env[name] || "").trim();
    if (!value) continue;
    out[name] = value;
    try {
      const url = new URL(value);
      if (["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) {
        loopbackPorts.push(Number(url.port || (url.protocol === "https:" ? 443 : 80)));
      }
    } catch {}
  }
  if (Object.keys(out).length) out.NO_PROXY = String(env.NO_PROXY || env.no_proxy || "localhost,127.0.0.1,::1");
  return { env: out, loopbackPorts };
}

/**
 * The child's whole environment. Nothing from the server's env leaks in
 * except what is named here.
 * @param {{ dshHome: string, tmp: string, keyEnv?: string, key?: string, extraKeys?: Record<string, string>, parentEnv?: NodeJS.ProcessEnv }} input
 */
function engineEnvironment(input) {
  const parent = input.parentEnv || process.env;
  const proxy = proxyEnvironment(parent);
  /** @type {Record<string, string>} */
  const env = {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: os.homedir(),
    LANG: String(parent.LANG || "en_US.UTF-8"),
    DSH_HOME: input.dshHome,
    // tmpdir() is a hard-coded writable root in dsh; point it into the shadow.
    TMPDIR: `${input.tmp}/`,
    DSH_TELEMETRY_MODE: "DISABLED",
    ...proxy.env,
  };
  if (input.keyEnv && input.key) env[input.keyEnv] = input.key;
  for (const [name, value] of Object.entries(input.extraKeys || {})) {
    if (value) env[name] = value;
  }
  return { env, loopbackPorts: proxy.loopbackPorts };
}

/**
 * Render the patch list for a run. The LM Studio template needs its model and
 * base URL written into a per-run copy (pi-ai must have the model declared).
 * @param {{ engine: string, stateDir: string, model?: string, lmStudioBaseUrl?: string }} input
 */
function patchFilesFor(input) {
  const spec = ENGINES[input.engine];
  if (!spec) throw new Error(`Unknown engine ${input.engine}`);
  const files = [path.join(paths.patchDir(), "posture.yml")];
  if (input.engine === "lmstudio") {
    const model = String(input.model || "");
    if (!/^[A-Za-z0-9._:/@-]{1,120}$/.test(model)) throw new Error("LM Studio needs a model identifier.");
    const base = String(input.lmStudioBaseUrl || "http://127.0.0.1:1234").replace(/\/+$/, "");
    const template = fs.readFileSync(path.join(paths.patchDir(), "lmstudio.yml"), "utf8");
    const rendered = template
      .replaceAll("{{MODEL}}", JSON.stringify(model))
      .replaceAll("{{BASE_URL}}", JSON.stringify(`${base}/v1`));
    const file = path.join(input.stateDir, "lmstudio.yml");
    fs.writeFileSync(file, rendered);
    files.push(file);
  } else {
    files.push(path.join(paths.patchDir(), spec.patch));
  }
  return files.map((file) => fs.realpathSync(file));
}

/** @type {Promise<any> | null} */
let sdkPromise = null;
/** @param {string} install */
function loadAcpSdk(install) {
  if (!sdkPromise) sdkPromise = import(pathToFileURL(paths.acpSdkEntry(install)).href);
  return sdkPromise;
}

/**
 * @typedef {object} EngineOptions
 * @property {string} engine           deepseek | anthropic | lmstudio
 * @property {string} [model]
 * @property {string} work             shadow work dir (cwd)
 * @property {string} tmp              TMPDIR inside work
 * @property {string} dshHome          the run's own DSH_HOME, already seeded (dsh-home.js)
 * @property {boolean} readOnly
 * @property {string} stateDir         runs/<run>
 * @property {string} [key]            the provider key (from the Keychain)
 * @property {Record<string, string>} [extraKeys]  e.g. DEEPSEEK_API_KEY for web search
 * @property {string} [lmStudioBaseUrl]
 * @property {number[]} [loopbackPorts]
 * @property {Array<{ type: "http", name: string, url: string, headers: Array<{ name: string, value: string }> }>} [mcpServers]
 * @property {(update: any) => void} onUpdate      raw ACP session/update payloads
 * @property {(params: any) => void} [onPermission]
 * @property {(line: string) => void} [log]
 */

/**
 * Spawn the engine and open an ACP session in the shadow.
 * @param {EngineOptions} options
 */
async function startEngine(options) {
  const spec = ENGINES[options.engine];
  if (!spec) throw new Error(`Unknown engine ${options.engine}`);
  const install = fs.realpathSync(paths.dshInstall());
  const bin = paths.dshBin(install);
  if (!fs.existsSync(bin)) {
    const error = new Error("The ClioTalk engine is not installed (run node tooling/build-dsh-slim.mjs).");
    /** @type {any} */ (error).code = "engine_missing";
    throw error;
  }
  const dshHome = String(options.dshHome || "");
  if (!path.isAbsolute(dshHome) || !fs.existsSync(path.join(dshHome, "profiles"))) {
    throw new Error("A run needs its own seeded DSH_HOME.");
  }
  paths.assertNotTemporary(dshHome);
  const real = {
    home: fs.realpathSync(os.homedir()),
    work: fs.realpathSync(options.work),
    tmp: fs.realpathSync(options.tmp),
    dshHome: fs.realpathSync(dshHome),
    node: fs.realpathSync(process.execPath),
  };
  const patchFiles = patchFilesFor({ engine: options.engine, stateDir: options.stateDir, model: options.model, lmStudioBaseUrl: options.lmStudioBaseUrl });
  const { env, loopbackPorts: proxyPorts } = engineEnvironment({
    dshHome: real.dshHome,
    tmp: real.tmp,
    keyEnv: spec.keyEnv,
    key: options.engine === "lmstudio" ? "lm-studio-placeholder" : options.key,
    extraKeys: options.extraKeys,
  });
  // A Node installed under $HOME (nvm, volta) must stay readable to itself.
  const nodePrefix = path.dirname(path.dirname(real.node));
  const profile = buildSandboxProfile({
    home: real.home,
    work: real.work,
    tmp: real.tmp,
    dshHome: real.dshHome,
    install,
    node: real.node,
    patchFiles,
    extraReadable: paths.isInside(nodePrefix, real.home) ? [nodePrefix] : [],
    readOnly: options.readOnly,
    loopbackPorts: [...(options.loopbackPorts || []), ...proxyPorts],
  });
  fs.writeFileSync(path.join(options.stateDir, "sandbox.sb"), `${profile}\n`);
  const log = options.log || (() => {});
  const args = ["-p", profile, real.node, bin, "--profile", "acp", ...patchFiles.flatMap((file) => ["--patch", file])];
  log(`spawn sandbox-exec node dsh --profile acp ${patchFiles.map((f) => path.basename(f)).join(" ")} cwd=${real.work} env=${Object.keys(env).join(",")}`);
  const child = spawn("/usr/bin/sandbox-exec", args, { cwd: real.work, env, stdio: ["pipe", "pipe", "pipe"] });
  let stderrTail = "";
  child.stderr.on("data", (chunk) => {
    const text = redact(chunk.toString());
    stderrTail = (stderrTail + text).slice(-16_384);
    log(`stderr ${text.trimEnd()}`);
  });
  const exited = new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      log(`exit ${JSON.stringify({ code, signal })}`);
      resolve({ code, signal });
    });
    child.on("error", (error) => {
      log(`spawn error ${error.message}`);
      resolve({ code: -1, signal: null, error });
    });
  });

  const sdk = await loadAcpSdk(install);
  const client = {
    // approval.policy is `never`, so dsh should never ask. If it does, the
    // answer is no: the outer sandbox would refuse the operation anyway.
    async requestPermission(params) {
      options.onPermission?.(params);
      const reject = (params.options || []).find((option) => /reject/.test(String(option.kind || "")));
      return reject
        ? { outcome: { outcome: "selected", optionId: reject.optionId } }
        : { outcome: { outcome: "cancelled" } };
    },
    async sessionUpdate(params) {
      options.onUpdate(params.update);
    },
    async writeTextFile() { throw new Error("client fs not offered"); },
    async readTextFile() { throw new Error("client fs not offered"); },
  };
  const stream = sdk.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
  const conn = new sdk.ClientSideConnection(() => client, stream);

  /** @param {unknown} error */
  const withStderr = (error) => {
    const message = String(/** @type {any} */ (error)?.message || error);
    const wrapped = new Error(redact(`${message}${stderrTail ? `\n${stderrTail.trim().split("\n").slice(-6).join("\n")}` : ""}`));
    /** @type {any} */ (wrapped).code = /** @type {any} */ (error)?.code || "engine_failed";
    return wrapped;
  };

  let sessionId = "";
  try {
    await conn.initialize({
      protocolVersion: sdk.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
    const session = await conn.newSession({ cwd: real.work, mcpServers: options.mcpServers || [] });
    sessionId = session.sessionId;
    const model = options.model || spec.defaultModel;
    if (model && options.engine !== "lmstudio") {
      const option = (session.configOptions || []).find((o) => o.id === "model" || o.category === "model");
      const values = (option?.options || []).flatMap((group) => group.options || [group]).map((o) => o.value);
      const wanted = JSON.stringify([spec.route, model]);
      if (option && values.includes(wanted) && option.currentValue !== wanted) {
        await conn.setSessionConfigOption({ sessionId, configId: option.id, value: wanted });
      } else if (option && !values.includes(wanted)) {
        log(`model ${wanted} not offered; keeping ${option.currentValue}`);
      }
    }
  } catch (error) {
    child.kill("SIGKILL");
    throw withStderr(error);
  }

  let exitedYet = false;
  exited.then(() => { exitedYet = true; });
  /** @type {Promise<{ exited: boolean }> | null} */
  let killing = null;
  /**
   * Stop the child and wait for it to be gone: SIGTERM, SIGKILL after 3 s,
   * and an answer by EXIT_WAIT_MS at the latest. Until it resolves with
   * `exited: true` the engine may still be writing the shadow, so nothing
   * about the run's changes is final (runs.js waits for it before put-back).
   */
  function kill() {
    if (killing) return killing;
    try { child.stdin.end(); } catch {}
    if (!exitedYet) child.kill("SIGTERM");
    const hard = setTimeout(() => { if (!exitedYet) child.kill("SIGKILL"); }, 3000);
    hard.unref?.();
    killing = new Promise((resolve) => {
      const give = setTimeout(() => resolve({ exited: exitedYet }), EXIT_WAIT_MS);
      give.unref?.();
      exited.then(() => {
        clearTimeout(give);
        clearTimeout(hard);
        resolve({ exited: true });
      });
    });
    return killing;
  }

  return {
    sessionId,
    cwd: real.work,
    pid: child.pid,
    exited,
    /** @param {string} text */
    async prompt(text) {
      try {
        return await conn.prompt({ sessionId, prompt: [{ type: "text", text: withEnginePreamble(text) }] });
      } catch (error) {
        throw withStderr(error);
      }
    },
    async cancel() {
      try { await conn.cancel({ sessionId }); } catch {}
    },
    async close() {
      // A child that no longer answers must not hold the stop up.
      if (!exitedYet) {
        try {
          await Promise.race([conn.closeSession?.({ sessionId }), new Promise((resolve) => setTimeout(resolve, 2000).unref?.())]);
        } catch {}
      }
      return kill();
    },
    kill,
  };
}

module.exports = {
  ENGINES,
  ENGINE_PREAMBLE,
  engineEnvironment,
  patchFilesFor,
  proxyEnvironment,
  redact,
  startEngine,
  withEnginePreamble,
};
