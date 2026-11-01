// Claude Code and Codex as Clio engines (engines `claude-code`, `codex`) — executable contract.
//
//   1. launch      the sandbox-exec argv names only Node and the adapter; no
//                  bypass word on it or in the session's _meta; the session
//                  loads no settings and no MCP config of the writer's, gets
//                  no shell tool; the profile closes every outbound path but
//                  the run's egress filter; HOME is the run's own;
//   2. permissions the host answers by policy: an edit inside the shadow yes
//                  (propose), an edit outside no, a read run's edit no but its
//                  proposal write yes, an MCP tool only from the gateway;
//   3. run         a claude-code run through runs.js (stub engine) gets its
//                  own egress filter with api.anthropic.com on the list,
//                  mcpServers only from the gateway (none here), and its key
//                  never reaches run.json or the event log.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
// A setup token is recognised by its prefix; built here so no literal token sits in the repository.
const SETUP_TOKEN = ["sk", "ant", "oat01", "test"].join("-");

const require = createRequire(import.meta.url);
const test = createFeatureTest("agent-acp-engines");

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-claude-code-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
process.env.AI_SYSTEM6_CLAUDE_ACP_INSTALL = path.join(scratch, "install");
fs.mkdirSync(process.env.AI_SYSTEM6_CLAUDE_ACP_INSTALL, { recursive: true });

const host = require("../../apps/server/server/agent/engine-host.js");
const { createClioPermissionHandler } = require("../../apps/server/server/agent/engine-permissions.js");
const { seedDshHome, runDshHome } = require("../../apps/server/server/agent/dsh-home.js");
const folders = require("../../apps/server/server/agent/folders.js");
const runs = require("../../apps/server/server/agent/runs.js");

// ---- 1. launch -------------------------------------------------------------
const shadow = path.join(scratch, "shadow");
const work = path.join(shadow, "work");
const tmp = path.join(shadow, "tmp");
const channel = path.join(tmp, ".ais6-proposals");
for (const dir of [work, channel]) fs.mkdirSync(dir, { recursive: true });
fs.symlinkSync(channel, path.join(work, ".ais6-proposals"));
const dshHome = seedDshHome(runDshHome(shadow));
const launch = host.claudeCodeLaunch({
  engine: "claude-code", work, tmp, dshHome, readOnly: false, stateDir: scratch, key: SETUP_TOKEN,
  onUpdate() {}, webTools: true, mcpServers: [], policy: { channels: [channel] },
}, { egressPort: 45123 });
const argv = launch.args.slice(2);
test.assert(argv.length === 2 && argv[1].endsWith(path.join("claude-agent-acp", "dist", "index.js")), "the command line is Node and the adapter, nothing else");
const metaText = JSON.stringify(launch.session._meta);
for (const word of host.CLAUDE_CODE_FORBIDDEN) {
  test.assert(!argv.some((arg) => arg.includes(word)) && !metaText.includes(word), `no ${word} on the command line or in the session`);
}
const options = launch.session._meta.claudeCode.options;
test.assert(Array.isArray(options.settingSources) && options.settingSources.length === 0, "no user, project or local settings are loaded");
test.assert(options.strictMcpConfig === true && launch.session.mcpServers.length === 0, "the user's MCP config is off; only the session's servers count");
test.assert(options.allowDangerouslySkipPermissions === false && "restricted" in options.extraArgs, "bypass is not allowed and the CLI runs restricted");
test.assert(!options.tools.includes("Bash") && options.tools.includes("WebFetch") && options.tools.includes("Edit"), "file tools and web: no shell, WebFetch with web tools");
test.assert(!host.claudeCodeSessionMeta({ webTools: false }).claudeCode.options.tools.includes("WebFetch"), "an offline run has no WebFetch");
test.assert(launch.env.CLAUDE_CODE_OAUTH_TOKEN === SETUP_TOKEN && !("ANTHROPIC_API_KEY" in launch.env), "a setup token rides in its one variable");
test.assert(launch.env.HOME.startsWith(fs.realpathSync(dshHome)) && launch.env.CLAUDE_CONFIG_DIR.startsWith(launch.env.HOME), "HOME and the config dir are the run's own, never ~/.claude");
test.assert(Object.entries(launch.env).filter(([name]) => /proxy$/i.test(name) && name !== "NO_PROXY").every(([, value]) => value === "http://127.0.0.1:45123"), "every proxy variable is the run's filter");
test.assert(launch.profile.includes("(deny network-outbound)\n") && launch.profile.includes('(remote ip "localhost:45123")') && !launch.profile.includes("mDNSResponder"), "the profile closes all outbound but the filter's port");
test.assert(!launch.profile.includes(path.join(os.homedir(), ".claude")), "the writer's Claude Code folder is nowhere in the profile");

// ---- 1b. codex launch --------------------------------------------------------
process.env.AI_SYSTEM6_CODEX_ACP_INSTALL = process.env.AI_SYSTEM6_CLAUDE_ACP_INSTALL;
const login = path.join(scratch, "codex-login", "auth.json");
fs.mkdirSync(path.dirname(login), { recursive: true });
fs.writeFileSync(login, JSON.stringify({ auth_mode: "chatgpt", OPENAI_API_KEY: "sk-must-not-travel", tokens: { access_token: "eyJaccess.payload.sig", refresh_token: "rt_must_not_travel", id_token: "eyJid.payload.sig", account_id: "acc" } }));
const codex = host.codexLaunch({
  engine: "codex", work, tmp, dshHome, readOnly: false, stateDir: scratch, loginFile: login,
  onUpdate() {}, webTools: true, mcpServers: [], policy: { channels: [channel] },
}, { egressPort: 45124 });
const codexConfig = JSON.parse(codex.env.CODEX_CONFIG);
const codexHome = codex.env.CODEX_HOME;
test.assert(codex.args.length === 4 && !codex.env.CODEX_CONFIG.includes("danger") && !codex.args.join(" ").includes("full-access"), "codex: Node and the adapter only, never full access");
const runLogin = fs.readFileSync(path.join(codexHome, "auth.json"), "utf8");
test.assert(codexHome.startsWith(fs.realpathSync(dshHome)) && !fs.lstatSync(path.join(codexHome, "auth.json")).isSymbolicLink() && runLogin.includes("eyJaccess") && !runLogin.includes("rt_must_not_travel") && !runLogin.includes("sk-must-not-travel"), "codex: the run's sign-in is a copy with the access token only, never the refresh token or an API key");
test.assert(!codex.profile.includes(fs.realpathSync(login)) && !host.ENGINES.codex.egressHosts.includes("auth.openai.com"), "codex: ~/.codex/auth.json is nowhere in the profile and no refresh host is on the allowlist");
test.assert(host.redact("eyJhbGciOiJSUzI1NiJ9.payload.sig rt_abcdefghijklmnop " + ["sk", "ant", "api03", "abcdefghijk"].join("-")).split(/\s/).every((word) => word.length < 14), "log redaction covers JWTs and rt_ refresh tokens");
test.assert(codex.profile.includes('(literal "/bin/zsh")') && codex.profile.includes('(literal "/bin/cat")'), "codex: the profile execs a shell and the read-only binaries");
test.assert(!launch.profile.includes('(literal "/bin/zsh")'), "claude-code: no shell binary in its profile");
test.assert(codex.profile.includes(`(literal "${path.join(fs.realpathSync(work), ".ais6-proposals")}")`), "codex: its channel is a folder in work/ (root kept, contents writable)");
test.assert(codexConfig.features.apps === false && codexConfig.features.plugins === false && codexConfig.features.guardian_approval === false, "codex: account apps, plugins and the auto reviewer are off");
test.assert(codex.profile.includes("(deny network-outbound)\n") && codex.profile.includes('(remote ip "localhost:45124")'), "codex: all outbound but the filter is closed");

// ---- 2. permissions --------------------------------------------------------
const offered = [{ optionId: "yes", kind: "allow_once" }, { optionId: "always", kind: "allow_always" }, { optionId: "no", kind: "reject_once" }];
const ask = (handler, toolCall) => handler({ options: offered, toolCall: { toolCallId: "t", ...toolCall } }).then((answer) => answer.outcome.optionId);
const realWork = fs.realpathSync(work);
const realChannel = fs.realpathSync(channel);
const propose = createClioPermissionHandler({ work: realWork, level: "propose", channels: [realChannel], gatewayServers: ["notion"] });
const readOnly = createClioPermissionHandler({ work: realWork, level: "read", channels: [realChannel] });
const edit = (file) => ({ name: "Edit", kind: "edit", rawInput: { file_path: file } });
test.assert(await ask(propose, edit(path.join(realWork, "notes.md"))) === "yes", "propose: an edit inside the shadow is allowed once");
test.assert(await ask(propose, edit(path.join(scratch, "outside.md"))) === "no", "an edit outside the shadow is refused");
test.assert(await ask(readOnly, edit(path.join(realWork, "notes.md"))) === "no", "read: an edit is refused");
test.assert(await ask(readOnly, edit(path.join(realWork, ".ais6-proposals", "1-scrap.json"))) === "yes", "read: a proposal write is allowed");
test.assert(await ask(propose, { name: "mcp__notion__search", kind: "other" }) === "yes", "a gateway connector's tool goes to the gateway");
test.assert(await ask(propose, { name: "mcp__evil__run", kind: "other" }) === "no", "any other MCP server is refused");
test.assert(await ask(propose, { name: "Bash", kind: "execute", rawInput: { command: "cat notes.md", cwd: realWork } }) === "no", "claude-code: a command is refused, read-only or not");
test.assert(await ask(propose, { kind: "edit" }) === "no", "an edit that names no path is refused");
const web = createClioPermissionHandler({ work: realWork, level: "propose", channels: [realChannel], webTools: true, allowHost: (h) => h === "example.com" });
test.assert(await ask(web, { name: "WebFetch", kind: "fetch", rawInput: { url: "https://example.com/a" } }) === "yes" && await ask(web, { name: "WebFetch", kind: "fetch", rawInput: { url: "https://other.test/" } }) === "no", "WebFetch: a host the run's filter admits yes, another no");

// Codex: read-only shell commands yes, everything else no; changes are judged by what the engine reported.
const seen = new Map();
const codexHandler = createClioPermissionHandler({ work: realWork, level: "propose", channels: [realChannel], readonlyCommands: true, lookupCall: (id) => seen.get(id) || null });
const cmd = (command) => ({ kind: "execute", title: command, rawInput: { command, cwd: realWork } });
test.assert(await ask(codexHandler, cmd("cat notes.md")) === "yes" && await ask(codexHandler, cmd("ls -la")) === "yes", "codex: a read-only command is allowed");
test.assert(await ask(codexHandler, cmd("rm notes.md")) === "no" && await ask(codexHandler, cmd("cat notes.md > x.md")) === "no" && await ask(codexHandler, cmd("curl https://example.com")) === "no", "codex: a command that is not read-only is refused");
test.assert(await ask(codexHandler, { kind: "execute", title: "cat", rawInput: { command: "cat notes.md", cwd: scratch } }) === "no", "codex: a command outside the shadow is refused");
const file = path.join(realWork, "notes.md");
seen.set("rename", { paths: [path.join(realWork, "moved.md")], kinds: ["update"] });
seen.set("remove", { paths: [file], kinds: ["delete"] });
seen.set("away", { paths: [path.join(scratch, "moved.md")], kinds: ["update"] });
seen.set("plain", { paths: [file], kinds: ["update"] });
test.assert(await ask(codexHandler, { toolCallId: "rename", kind: "edit", locations: [{ path: file }] }) === "no", "codex: a rename (a path beyond the request's own) is refused");
test.assert(await ask(codexHandler, { toolCallId: "away", kind: "edit", locations: [{ path: file }] }) === "no", "codex: a move out of the shadow is refused");
test.assert(await ask(codexHandler, { toolCallId: "remove", kind: "edit", locations: [{ path: file }] }) === "no", "codex: a delete is refused");
test.assert(await ask(codexHandler, { toolCallId: "plain", kind: "edit", locations: [{ path: file }] }) === "yes", "codex: a plain edit inside the shadow is allowed");

// ---- 3. run through runs.js -------------------------------------------------
const folderDir = path.join(scratch, "Folder");
fs.mkdirSync(folderDir);
fs.writeFileSync(path.join(folderDir, "note.md"), "hello\n");
const grant = folders.grantFolder(folderDir, "change");
let started = null;
const egressCalls = [];
runs.configureRunsForTests({
  resolveKey: async () => ["sk", "ant", "api03", "run", "secret"].join("-"),
  normalizeConnectors: async () => [],
  claudeEngineStatus: () => ({ installed: true }),
  startEgress: async (input) => { egressCalls.push(input); return { port: 45999, close: async () => {} }; },
  startEngine: async (opts) => {
    started = opts;
    return { sessionId: "s-1", cwd: fs.realpathSync(opts.work), async prompt() { return { stopReason: "end_turn" }; }, async cancel() {}, async close() {}, kill() {} };
  },
});
const run = await runs.createRun({ folderId: grant.id, prompt: "Tidy the note", engine: "claude-code" });
const limit = Date.now() + 3000;
while (!["done", "error"].includes(runs.getRun(run.runId).state) && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 10));
test.assert(egressCalls.length === 1 && egressCalls[0].allowHosts === undefined, "a claude-code run with web tools gets its own filter that admits any public host on 443 (WebFetch)");
test.assert(started && started.egressPort === 45999 && started.mcpServers.length === 0 && started.policy.level === "change", "the engine gets the filter, the gateway's servers only, and the run's level");
test.assert(!started.extraKeys || !Object.keys(started.extraKeys).length, "no other provider's key rides along");
const stateDir = runs.getRun(run.runId).shadow.stateDir;
const records = fs.readFileSync(path.join(stateDir, "run.json"), "utf8") + fs.readFileSync(path.join(stateDir, "events.jsonl"), "utf8");
test.assert(!records.includes("run-secret") && !records.includes(".claude"), "the key and any Claude Code login path stay out of run.json and the events");
test.assert((await runs.engineKeys())["claude-code"] === true, "the engine is offered once installed with a credential");

runs.configureRunsForTests({
  codexEngineStatus: () => ({ installed: true }),
  codexLoggedIn: () => true,
  startEngine: async (opts) => {
    started = opts;
    const dir = path.join(opts.work, ".ais6-proposals");
    // Codex cannot write through a link: the run gives it a real folder, and it writes there.
    test.assert(!fs.lstatSync(dir).isSymbolicLink(), "a codex run's channel is a real folder in work/");
    fs.writeFileSync(path.join(dir, "1-scrap.json"), JSON.stringify({ v: 1, kind: "scrap", title: "Keep hello", reason: "", payload: { quoted: "hello", source: "note.md" }, createdAt: new Date().toISOString() }));
    return { sessionId: "s-2", cwd: fs.realpathSync(opts.work), async prompt() { return { stopReason: "end_turn" }; }, async cancel() {}, async close() {}, kill() {} };
  },
});
started = null;
const codexRun = await runs.createRun({ folderId: grant.id, prompt: "Tidy the note", engine: "codex", level: "read" });
const codexLimit = Date.now() + 4000;
while (!["done", "error"].includes(runs.getRun(codexRun.runId).state) && Date.now() < codexLimit) await new Promise((resolve) => setTimeout(resolve, 10));
test.assert(egressCalls[1]?.allowHosts.includes("chatgpt.com") && !egressCalls[1].allowHosts.includes("auth.openai.com") && started?.engine === "codex" && started.policy.level === "read", "a codex run gets its own filter with the OpenAI hosts and the run's level");
test.assert(started.policy.channels.some((c) => c.endsWith(path.join("work", ".ais6-proposals"))), "codex: the work/ channel is one of the run's allowed channels");
test.assert(runs.listProposalsRun(codexRun.runId).proposals.some((p) => p.kind === "scrap"), "codex: a proposal written in its work/ channel is harvested like dsh's");

// ---- 4. system proxy and the Control Panel field -----------------------------
const { parseScutilProxy } = require("../../apps/server/server/agent/egress-proxy.js");
test.assert(String(parseScutilProxy("  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1\n")) === "http://127.0.0.1:7890/" && parseScutilProxy("  HTTPSEnable : 0\n") === null, "the macOS system HTTPS proxy is read as the upstream when enabled");
const vault = require("../../apps/server/server/credential-vault.js");
const html = fs.readFileSync(new URL("../../apps/desktop/index.html", import.meta.url), "utf8");
const cloud = fs.readFileSync(new URL("../../apps/desktop/app/features/cloud-model.js", import.meta.url), "utf8");
test.assert(html.includes('id="claude-code-token"') && html.includes('id="claude-code-token-save"') && cloud.includes('provider: "claude-code"') && cloud.includes("PROVIDER_BASE_URLS.anthropic"), "Control Panel has the Claude Code token field, filed under the provider the engine reads");
for (const lang of ["en", "zh"]) {
  const table = fs.readFileSync(new URL(`../../apps/desktop/app/data/translations-${lang}.js`, import.meta.url), "utf8");
  test.assert(["claude_code_token_label", "claude_code_token_save", "claude_code_token_saved", "claude_code_token_hint"].every((key) => table.includes(`${key}:`)), `${lang}: the Claude Code token strings exist`);
}
test.assert(vault.createCredentialId("claude-code", "https://api.anthropic.com") !== vault.createCredentialId("anthropic", "https://api.anthropic.com"), "the claude-code token has its own Keychain item, apart from the Anthropic key");

runs.resetRunsForTests();
fs.rmSync(scratch, { recursive: true, force: true });
test.finish();
