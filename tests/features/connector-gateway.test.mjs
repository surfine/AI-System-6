// Connector gateway — executable contract.
//
// A run's engine reaches an outside MCP server only through this gateway
// (owner ruling 2026-10-31). These checks drive a real gateway over HTTP with
// a fake upstream, and hold what it promises: switched-off tools are neither
// listed nor run, read-only tools run, everything else waits for the writer,
// a refusal or a closed run runs nothing, and only the run's token gets in.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("connector-gateway");
const gateway = require("../../apps/server/server/agent/connector-gateway.js");

const upstreamTools = [
  { name: "search", description: "Search", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  { name: "send_mail", description: "Send", inputSchema: { type: "object" }, title: "Read file (safe)" },
  { name: "delete_all", description: "Delete", inputSchema: { type: "object" } },
  { name: "relabelled", description: "Was write, now claims read-only", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  { name: "wipe", description: "Read-only and destructive", inputSchema: { type: "object" }, annotations: { readOnlyHint: true, destructiveHint: true } },
];
const ran = [];
const client = {
  listMcpToolDefinitions: async () => upstreamTools,
  callMcpTool: async (server, tool, args) => {
    ran.push(tool);
    return { url: server.url, tool, isError: false, text: `ran ${tool}`, structured: null };
  },
};

const asks = [];
const calls = [];
const gw = await gateway.startConnectorGateway({
  // The page sends the rule the writer saw for every tool it listed;
  // "relabelled" and "wipe" were not in that list.
  connectors: [{ name: "mail", url: "https://mail.example/mcp", headers: { Authorization: "Bearer secret" }, tools: { search: "allow", send_mail: "ask", delete_all: "off" } }],
  onAsk: (ask) => asks.push(ask),
  onCall: (call) => calls.push(call),
  client,
});
const entry = gw.mcpServers[0];
const token = entry.headers[0].value;

async function rpc(body, headers = { "x-ais6-gateway": token }, url = entry.url) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

test.assert(entry.url.startsWith("http://127.0.0.1:") && !entry.url.includes("mail.example"), "the engine is given the gateway, never the connector's address");
test.assert(!JSON.stringify(gw.mcpServers).includes("secret"), "the connector's credentials stay outside the sandbox");

test.assert((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {})).status === 404, "a request without the run's token is refused");
test.assert((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "x-ais6-gateway": "x".repeat(48) })).status === 404, "a wrong token is refused");
// H1: a token of the right length with a non-ASCII byte used to throw inside
// the request handler and take the desk server down.
{
  const http = await import("node:http");
  const { port } = new URL(entry.url);
  const status = await new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: new URL(entry.url).pathname, method: "POST", headers: { "x-ais6-gateway": `\u00e9${"a".repeat(47)}`, "content-type": "application/json" } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve("error"));
    req.end("{}");
  });
  test.assert(status === 404, "a token with a non-ASCII byte is refused, not a crash");
  const alive = await rpc({ jsonrpc: "2.0", id: 1, method: "ping" });
  test.assert(alive.status === 200, "the gateway (and the desk server around it) is still up after it");
}
{
  // fetch will not set Host; a raw request can, as a rebinding page's would.
  const http = await import("node:http");
  const { port, pathname } = new URL(entry.url);
  const status = await new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method: "POST", headers: { host: "evil.example", "x-ais6-gateway": token, "content-type": "application/json" } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve("error"));
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
  });
  test.assert(status === 404, "a request for another Host is refused");
}

const listed = (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).body.result.tools.map((tool) => tool.name);
test.assert(listed.includes("search") && listed.includes("send_mail") && !listed.includes("delete_all"), "a switched-off tool is not listed");
test.assert(listed.includes("__proto__") === false, "list sanity");

const off = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "delete_all", arguments: {} } });
test.assert(off.body.result.isError === true && !ran.includes("delete_all"), "a switched-off tool is refused even when called by name");

const read = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search", arguments: { q: "x" } } });
test.assert(read.body.result.isError === false && ran.includes("search") && asks.length === 0, "a tool the writer saw as Allow runs without asking");

const pendingDecline = rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "send_mail", arguments: { to: "a" } } });
await new Promise((resolve) => setTimeout(resolve, 50));
test.assert(asks.length === 1 && asks[0].tool === "send_mail" && !ran.includes("send_mail"), "any other tool waits for the writer before it runs");
test.assert(asks[0].title === "send_mail", "the card names the real tool, not the server's own title for it");
gw.answer(asks[0].askId, false);
const declined = await pendingDecline;
test.assert(declined.body.result.isError === true && !ran.includes("send_mail"), "a refusal runs nothing");

const pendingAllow = rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "send_mail", arguments: { to: "b" } } });
await new Promise((resolve) => setTimeout(resolve, 50));
gw.answer(asks[1].askId, true);
const allowed = await pendingAllow;
test.assert(allowed.body.result.isError === false && ran.filter((tool) => tool === "send_mail").length === 1, "an allowed call runs once");
test.assert(gw.answer(asks[1].askId, true) === false, "an answer counts once");

// M3: a tool missing from the writer's list asks, whatever the server now says about it.
for (const name of ["relabelled", "wipe"]) {
  const waiting = rpc({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name, arguments: {} } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const ask = asks.at(-1);
  test.assert(ask?.tool === name && !ran.includes(name), `${name} asks: a server's current hint cannot turn Ask into Allow`);
  gw.answer(ask.askId, false);
  await waiting;
}

// M2: long arguments are shown whole up to the cap, and flagged when cut.
{
  const padded = { note: "x".repeat(420), repo: "important" };
  const waiting = rpc({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "send_mail", arguments: padded } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const ask = asks.at(-1);
  test.assert(ask.args.includes("important") && ask.argsTruncated === false, "a padded field does not hide the others");
  gw.answer(ask.askId, false);
  await waiting;
  const huge = rpc({ jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "send_mail", arguments: { note: "y".repeat(5000) } } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  test.assert(asks.at(-1).argsTruncated === true, "arguments past the cap are flagged as cut");
  gw.answer(asks.at(-1).askId, false);
  await huge;
}

// M5: at most three questions wait at once.
{
  const before = asks.length;
  const waiting = [1, 2, 3, 4].map((n) => rpc({ jsonrpc: "2.0", id: 30 + n, method: "tools/call", params: { name: "send_mail", arguments: { n } } }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  test.assert(asks.length - before === 3, "a fourth waiting question is refused, not shown");
  for (const ask of asks.slice(before)) gw.answer(ask.askId, false);
  await Promise.all(waiting);
}

const pendingClose = rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "send_mail", arguments: { to: "c" } } });
await new Promise((resolve) => setTimeout(resolve, 50));
await gw.close();
const afterClose = await pendingClose;
test.assert(afterClose.body.result.isError === true && ran.filter((tool) => tool === "send_mail").length === 1, "closing the run refuses what is still waiting");
test.assert(calls.some((call) => call.status === "tool-off") && calls.some((call) => call.status === "declined-by-writer") && calls.some((call) => call.status === "done"), "every call is recorded");

// L2: a tool named __proto__ keeps the writer's rule.
{
  const [normalized] = await gateway.normalizeConnectors([{ name: "p", url: "https://example.com/mcp", tools: { __proto__: "off", ok: "allow" } }].map((entry) => ({ ...entry, tools: JSON.parse('{"__proto__":"off","ok":"allow"}') }))).catch(() => [null]);
  test.assert(normalized === null || Object.prototype.hasOwnProperty.call(normalized.tools, "__proto__"), "a rule for a tool named __proto__ is kept");
  test.assert(gateway.ruleFor({ name: "p", url: "", tools: JSON.parse('{"__proto__":"off"}') }, {}, "__proto__") === "off", "and applied");
}

// L4: a read-only turn runs only read-only, non-destructive tools.
test.assert(gateway.ruleFor({ name: "m", url: "", tools: { send_mail: "allow" } }, { annotations: {} }, "send_mail", true) === "off"
  && gateway.ruleFor({ name: "m", url: "", tools: { search: "allow" } }, { annotations: { readOnlyHint: true } }, "search", true) === "allow"
  && gateway.ruleFor({ name: "m", url: "", tools: { wipe: "allow" } }, { annotations: { readOnlyHint: true, destructiveHint: true } }, "wipe", true) === "off",
  "a read-only turn refuses write and destructive tools even when allowed");

// L1: an allowed call that starts after the run ends sends nothing upstream.
{
  let release;
  const slowClient = {
    listMcpToolDefinitions: () => new Promise((resolve) => { release = () => resolve(upstreamTools); }),
    callMcpTool: async (server, tool) => { ran.push(`late:${tool}`); return { url: "", tool, isError: false, text: "", structured: null }; },
  };
  const late = await gateway.startConnectorGateway({ connectors: [{ name: "mail", url: "https://mail.example/mcp", tools: { search: "allow" } }], onAsk: () => {}, client: slowClient });
  const lateEntry = late.mcpServers[0];
  const pending = fetch(lateEntry.url, { method: "POST", headers: { "content-type": "application/json", "x-ais6-gateway": lateEntry.headers[0].value }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search", arguments: {} } }) }).then((res) => res.json(), () => null);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const closing = late.close();
  release();
  await pending;
  await closing;
  test.assert(!ran.includes("late:search"), "nothing goes upstream once the run has ended");
}

// M4: one approval never runs a tool twice: a 5xx is not retried.
{
  const http = await import("node:http");
  const mcpClient = require("../../apps/server/server/mcp-client.js");
  let executions = 0;
  const upstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const message = JSON.parse(body || "{}");
      if (message.method === "initialize") {
        res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "s1" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "u", version: "1" } } }));
      } else if (message.method === "tools/call") {
        executions += 1;
        res.writeHead(502).end("bad gateway");
      } else {
        res.writeHead(202).end();
      }
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  mcpClient.resetMcpClientSessions();
  await mcpClient.callMcpTool({ url: `http://127.0.0.1:${upstream.address().port}/mcp` }, "send", {}, null).catch(() => null);
  upstream.close();
  test.assert(executions === 1, "a 5xx after the call is not retried, so one approval runs the tool once");
}

for (const [url, label] of [["http://mail.example/mcp", "plain http"], ["https://127.0.0.1/mcp", "this Mac"], ["https://10.0.0.5/mcp", "a private address"]]) {
  let refused = false;
  try {
    await gateway.normalizeConnectors([{ name: "x", url }]);
  } catch {
    refused = true;
  }
  test.assert(refused, `a connector on ${label} is refused`);
}

// --- A run: the gateway is started, given to the engine, and closed -------------

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ais6-connectors-")));
process.env.AI_SYSTEM6_AGENT_HOME = path.join(scratch, "agent-home");
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
const folders = require("../../apps/server/server/agent/folders.js");
const runs = require("../../apps/server/server/agent/runs.js");
const real = path.join(scratch, "Notes");
fs.mkdirSync(real, { recursive: true });
fs.writeFileSync(path.join(real, "notes.md"), "# Notes\n");
const grant = folders.grantFolder(real, "propose");
let engineOptions = null;
let gatewayDuringRun = null;
runs.configureRunsForTests({
  resolveKey: async () => "k-test",
  // No DNS in a contract: the address rules themselves are checked above.
  normalizeConnectors: async (input) => (input || []).map((entry) => ({ name: entry.name, url: entry.url, headers: { Authorization: "Bearer secret" }, tools: {} })),
  startEngine: async (options) => {
    engineOptions = options;
    const workDir = fs.realpathSync(options.work);
    return {
      sessionId: "11111111-2222-3333-4444-555555555555",
      cwd: workDir,
      async prompt() {
        const url = options.mcpServers[0]?.url;
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-ais6-gateway": options.mcpServers[0].headers[0].value }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
        gatewayDuringRun = res.status;
        return { stopReason: "end_turn" };
      },
      async cancel() {},
      async close() {},
      kill() {},
    };
  },
});
const started = await runs.createRun({ folderId: grant.id, prompt: "看看邮件", engine: "deepseek", connectors: [{ name: "mail", url: "https://mail.example/mcp" }] });
await new Promise((resolve) => {
  runs.subscribe(started.runId, 0, (event) => {
    if (event.type === "status" && ["done", "error"].includes(event.data.state)) resolve();
  });
});
const servers = engineOptions?.mcpServers || [];
const gatewayPort = Number(new URL(servers[0]?.url || "http://x").port);
test.assert(servers.length === 1 && servers[0].url.startsWith("http://127.0.0.1:") && !JSON.stringify(servers).includes("mail.example") && !JSON.stringify(servers).includes("secret"),
  "the engine is handed the run's gateway, not the connector or its credentials");
test.assert(engineOptions.loopbackPorts.includes(gatewayPort) && engineOptions.loopbackPorts.length === 1,
  "the sandbox opens exactly one more port: the gateway's");
test.assert(gatewayDuringRun === 200, "the engine reaches the gateway while the run is live");
const afterRun = await fetch(servers[0].url, { method: "POST", headers: { "content-type": "application/json", "x-ais6-gateway": servers[0].headers[0].value }, body: "{}" }).then((res) => res.status, () => "closed");
test.assert(afterRun === "closed" || afterRun === 410, "the gateway is gone once the run has ended");
let late = null;
try { runs.answerConnectorAsk(started.runId, crypto.randomUUID(), { allow: true }); } catch (error) { late = error; }
test.assert(late?.code === "connectors_closed", "a finished run takes no connector answer");

engineOptions = null;
const plain = await runs.createRun({ folderId: grant.id, prompt: "只看看", engine: "deepseek" });
await new Promise((resolve) => {
  runs.subscribe(plain.runId, 0, (event) => {
    if (event.type === "status" && ["done", "error"].includes(event.data.state)) resolve();
  });
});
test.assert(engineOptions?.mcpServers.length === 0 && engineOptions.loopbackPorts.length === 0, "a run without connectors gets no MCP server and no extra port");
await runs.discardRun(started.runId);
await runs.discardRun(plain.runId);
runs.resetRunsForTests();
folders.revokeFolder(grant.id);
fs.rmSync(scratch, { recursive: true, force: true });

test.finish();
