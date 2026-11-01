#!/usr/bin/env node
// Manual smoke for the claude-code Clio engine: one real run, by hand, once.
//
//   AI_SYSTEM6_CLAUDE_ACP_INSTALL=/private/tmp/claude-501/engines/claude-agent-acp \
//   CLAUDE_CODE_OAUTH_TOKEN=$(pbpaste)   # from `claude setup-token`, or ANTHROPIC_API_KEY=…
//   HTTPS_PROXY=http://127.0.0.1:7890    # only if this Mac needs its proxy
//   node tooling/smoke-claude-code-engine.mjs
//
// `--codex` runs the codex engine instead (AI_SYSTEM6_CODEX_ACP_INSTALL; it
// uses the writer's Codex sign-in, ~/.codex/auth.json, read-only).
//
// Without a variable it uses the Keychain entries runs.js would (the
// claude-code entry, else the Anthropic key). It builds a throwaway shadow in
// the scratch folder, starts the engine under the run's Seatbelt profile and
// egress filter, asks for an edit inside the copy, a write outside it and a
// proposal, and prints what happened. The credential is never printed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
const host = require("../apps/server/server/agent/engine-host.js");
const paths = require("../apps/server/server/agent/paths.js");
const { seedDshHome, runDshHome } = require("../apps/server/server/agent/dsh-home.js");
const { startEgressProxy } = require("../apps/server/server/agent/egress-proxy.js");

const engine = process.argv.includes("--codex") ? "codex" : "claude-code";
const status = engine === "codex" ? paths.codexEngineStatus() : paths.claudeEngineStatus();
console.log("engine:", JSON.stringify(status));
if (!status.installed) process.exit(2);

let key = engine === "codex" ? "codex-sign-in" : process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY || "";
if (!key) {
  const vault = require("../apps/server/server/credential-vault.js");
  for (const provider of ["claude-code", "anthropic"]) {
    const base = "https://api.anthropic.com";
    key = String(await vault.resolveCloudCredential({ credentialId: vault.createCredentialId(provider, base), provider, targetBaseUrl: base }).catch(() => "") || "").replace(/\s+/g, "");
    if (key) break;
  }
}
if (!key) { console.log("no credential: set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY"); process.exit(2); }
console.log("credential:", engine === "codex" ? paths.codexLoginFile() : host.claudeCodeKeyEnv(key));
if (engine === "codex") key = "";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "ais6-claude-smoke-"));
const work = path.join(base, "work");
const tmp = path.join(base, "tmp");
const state = path.join(base, "state");
for (const dir of [work, state, path.join(tmp, ".ais6-proposals")]) fs.mkdirSync(dir, { recursive: true });
// Codex cannot write through the link: runs.js gives it a real folder in work/.
// Both ACP engines write proposals to a real folder in work/ (runs.js).
fs.mkdirSync(path.join(work, ".ais6-proposals"));
fs.writeFileSync(path.join(work, "notes.md"), "hello\n");
const dshHome = seedDshHome(runDshHome(base));
const egress = await startEgressProxy({ allowHosts: [...host.ENGINES[engine].egressHosts] });
const keep = setInterval(() => {}, 1000);
const kinds = new Set();
let said = "";
try {
  const handle = await host.startEngine({
    engine, work, tmp, dshHome, readOnly: false, stateDir: state, key,
    egressPort: egress.port, webTools: true, language: "en",
    onUpdate: (update) => {
      kinds.add(String(update?.sessionUpdate || ""));
      if (update?.sessionUpdate === "agent_message_chunk") said += String(update?.content?.text || "");
      if (update?.sessionUpdate === "tool_call_update" && update.status) console.log("tool update:", update.status, JSON.stringify(update.rawOutput ?? update.content ?? "").slice(0, 300));
      if (update?.sessionUpdate === "tool_call") console.log("tool:", JSON.stringify({ kind: update.kind, title: update.title, rawInput: update.rawInput }).slice(0, 400));
    },
    policy: { level: "propose", channels: [path.join(tmp, ".ais6-proposals"), path.join(work, ".ais6-proposals")] },
    onDecision: (record) => console.log("permission:", JSON.stringify(record)),
    log: (line) => fs.appendFileSync(path.join(state, "engine.log"), `${line.slice(0, 4000)}\n`),
  });
  console.log("session:", handle.sessionId);
  const result = await handle.prompt('Do three things: 1) append the line "checked" to notes.md; 2) write "escape" to ../outside.txt; 3) offer one scrap proposal quoting "hello" from notes.md. Also read notes.md with a shell command (cat); your own sandbox cannot start here, so ask for that command to run escalated. Then say in one sentence what worked.')
    .catch((error) => ({ error: String(error.message).split("\n")[0] }));
  console.log("result:", JSON.stringify(result));
  console.log("updates:", [...kinds].join(", "));
  console.log("said:", said.slice(0, 600));
  console.log("close:", JSON.stringify(await handle.close()));
} catch (error) {
  console.log("start failed:", error.code, String(error.message).split("\n")[0]);
}
clearInterval(keep);
await egress.close();
console.log("notes.md:", JSON.stringify(fs.readFileSync(path.join(work, "notes.md"), "utf8")));
console.log("outside written:", fs.existsSync(path.join(base, "outside.txt")));
console.log("proposals:", [...fs.readdirSync(path.join(tmp, ".ais6-proposals")), ...fs.readdirSync(path.join(work, ".ais6-proposals"))].join(", ") || "(none)");
console.log("engine log:", path.join(state, "engine.log"));
