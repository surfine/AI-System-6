// Connector UI — executable contract.
//
// The page's half of Clio connectors: which servers a run is offered, what the
// writer's per-tool choices store, and what a question from the gateway does
// to the run card. Rules the gateway enforces are in connector-gateway.test.mjs.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("connector-ui");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadDesk() {
  const window = { setTimeout, clearTimeout, AISystem6TranslationsEn: {}, AISystem6TranslationsZh: {} };
  window.window = window;
  const context = vm.createContext({
    window, console, setTimeout, clearTimeout, crypto, URL,
    location: { hostname: "127.0.0.1" },
    document: { getElementById: () => null },
    scheduleSettingsSave: () => {},
    t: (key) => key,
  });
  vm.runInContext(source("apps/desktop/app/core/guest-executor.js"), context);
  vm.runInContext(source("apps/desktop/app/features/mcp-servers.js"), context);
  return window;
}

// --- Which servers a run is offered ------------------------------------------
{
  const desk = loadDesk();
  const exec = desk.AISystem6GuestExecutor;
  const mcp = desk.AISystem6McpServers;
  exec.upsertServer("Mail Box", { url: "https://mail.example/mcp", enabled: true, clio: true });
  exec.upsertServer("not-for-clio", { url: "https://a.example/mcp", enabled: true });
  exec.upsertServer("switched-off", { url: "https://b.example/mcp", enabled: false, clio: true });
  exec.upsertServer("plain-http", { url: "http://c.example/mcp", enabled: true, clio: true });
  exec.upsertServer("this-mac", { url: "https://localhost/mcp", enabled: true, clio: true });
  const offered = mcp.connectorsForRun();
  test.assert(offered.length === 1 && offered[0].name === "Mail_Box", "only an enabled, Clio-allowed, https server is offered, under a name the gateway accepts");
  test.assert(!("headers" in offered[0]) && offered[0].url === "https://mail.example/mcp", "the run gets the address and rules, never credentials");
}

{
  const desk = loadDesk();
  desk.AISystem6GuestExecutor.upsertServer("many", { url: "https://x.example/mcp", enabled: true, clio: true });
  for (let index = 0; index < 8; index += 1) desk.AISystem6GuestExecutor.upsertServer(`s${index}`, { url: `https://s${index}.example/mcp`, enabled: true, clio: true });
  test.assert(desk.AISystem6McpServers.connectorsForRun().length === 5, "a run is offered at most five connectors");
}

// --- Rules: defaults and stored departures -----------------------------------
{
  const desk = loadDesk();
  const exec = desk.AISystem6GuestExecutor;
  const mcp = desk.AISystem6McpServers;
  exec.upsertServer("docs", {
    url: "https://docs.example/mcp", enabled: true, clio: true,
    tools: ["search", "send"],
    toolShapes: { search: { readOnly: true }, send: { readOnly: false } },
  });
  test.assert(mcp.toolRule(exec.getServers().docs, "search") === "allow", "a read-only tool starts at Allow");
  test.assert(mcp.toolRule(exec.getServers().docs, "send") === "ask", "any other tool starts at Ask each time");

  // Security round 2026-10-31 M3: every choice is stored, because the
  // default it equals today can move when the server changes its hints.
  mcp.setClioToolRule("docs", "send", "off");
  test.assert(exec.getServers().docs.clioTools.send === "off", "the writer's choice is stored");
  mcp.setClioToolRule("docs", "send", "ask");
  test.assert(exec.getServers().docs.clioTools.send === "ask", "a choice equal to today's default is stored too");
  const [sent] = mcp.connectorsForRun(exec.getServers());
  test.assert(JSON.stringify(sent.tools) === '{"search":"allow","send":"ask"}', "a turn sends the rule the writer saw for every listed tool");
  exec.upsertServer("docs", { toolShapes: { search: { readOnly: true, destructive: true }, send: { readOnly: false } }, clioTools: {} });
  test.assert(mcp.toolRule(exec.getServers().docs, "search") === "ask", "a destructive tool starts at Ask even when marked read-only");
  mcp.setClioToolRule("docs", "search", "off");
  test.assert(mcp.connectorsForRun()[0].tools.search === "off", "the run carries the writer's departure");

  exec.upsertServer("blind", { url: "https://blind.example/mcp", enabled: true, clio: true, tools: ["x"], toolShapes: { x: {} } });
  test.assert(mcp.toolRule(exec.getServers().blind, "x") === "ask", "a server that does not say which tools only read starts every tool at Ask");
  mcp.setClioToolRule("blind", "x", "ask");
  test.assert(mcp.connectorsForRun().find((entry) => entry.name === "blind").tools.x === "ask", "an explicit Ask is kept when the default was only a guess, so the server cannot run it unasked");

  exec.upsertServer("bad", { url: "https://bad.example/mcp", enabled: true, clio: true, clioTools: { a: "allow", b: "root", c: 7 } });
  test.assert(JSON.stringify(exec.getServers().bad.clioTools) === '{"a":"allow"}', "a stored rule outside allow, ask, off is dropped on load");
  test.assert(exec.getServers().docs.clio === true && exec.getServers().bad.clio === true, "a server record keeps its Clio flag across normalisation");
}

// --- The question on the run card --------------------------------------------
{
  const window = { AISystem6TranslationsEn: {}, AISystem6TranslationsZh: {} };
  window.window = window;
  const context = vm.createContext({ window, console, TextEncoder, t: (key) => key, localStorage: { getItem: () => null, setItem: () => {} } });
  vm.runInContext(source("apps/desktop/app/features/cliotalk-agent.js"), context);
  const { reduceEvent, emptyRunView } = window.AISystem6ClioTalkAgent.model;

  let view = reduceEvent(emptyRunView("r1"), { type: "status", state: "running" });
  view = reduceEvent(view, { type: "connector_ask", askId: "a1", connector: "mail", tool: "send_mail", title: "Send mail", args: '{"to":"x"}' });
  test.assert(view.asks.length === 1 && view.asks[0].status === "pending" && view.asks[0].title === "Send mail", "a question from the gateway becomes a pending card");
  view = reduceEvent(view, { type: "connector_ask", askId: "a1", connector: "mail", tool: "send_mail", title: "Send mail", args: "{}" });
  test.assert(view.asks.length === 1, "the same question twice is one card");
  view = reduceEvent(view, { type: "status", state: "done" });
  test.assert(view.asks[0].status === "expired", "a card for a run that has ended is expired");

  const replayed = reduceEvent(reduceEvent(emptyRunView("r2"), { type: "status", state: "stopped" }), { type: "connector_ask", askId: "a2", connector: "m", tool: "t", title: "T", args: "" });
  test.assert(replayed.asks[0].status === "expired", "a question that arrives after the run ended is already expired");
}

// --- Tasks carry connectors on every turn and settle cards -------------------
{
  const window = { AISystem6TranslationsEn: {}, AISystem6TranslationsZh: {} };
  window.window = window;
  const context = vm.createContext({ window, console, TextEncoder, t: (key) => key, localStorage: { getItem: () => null, setItem: () => {} } });
  vm.runInContext(source("apps/desktop/app/features/cliotalk-agent.js"), context);
  const { createTaskLink } = window.AISystem6ClioTalkAgent.model;

  const sent = [];
  let transport = null;
  let snapshot = null;
  let emit = null;
  let answerFails = null;
  const api = async (route, body) => {
    sent.push([route, body]);
    if (route === "/api/agent/tasks") return { task: { id: "t1", state: "working" } };
    if (route === "/api/agent/tasks/t1/turns") return { task: { id: "t1", state: "working" }, turn: { id: "run2", n: 2, state: "working" } };
    if (route === "/api/agent/tasks/t1") return { task: { id: "t1", state: "working" }, turns: [{ id: "run1", n: 1, state: "working" }] };
    if (route.includes("/connectors/")) {
      if (answerFails) throw Object.assign(new Error("x"), { code: answerFails });
      return {};
    }
    return {};
  };
  const link = createTaskLink({
    api,
    shell: () => ({ tasks: { connect: (value) => { transport = value; }, apply: (value) => { snapshot = value; }, notice: () => {}, current: () => snapshot } }),
    projection: () => ({}),
    sha256: async () => "",
    errorText: (error) => String(error?.message || error),
    approveWords: () => "go",
    schedule: () => () => {},
    stream: async (id, onEvent) => { emit = onEvent; },
    connectors: async () => [{ name: "mail", url: "https://mail.example/mcp", tools: {} }],
  });
  await link.start({ prompt: "do it", lent: [] });
  test.assert(sent[0][1].connectors?.[0]?.name === "mail", "a new task is created with the connectors the writer allowed");
  await new Promise((resolve) => setTimeout(resolve, 20));
  emit({ type: "connector_ask", askId: "11111111-1111-4111-8111-111111111111", connector: "mail", tool: "send", title: "Send", args: "{}" });
  test.assert(snapshot.asks.length === 1 && snapshot.asks[0].status === "pending", "a connector question reaches the task panel as pending");
  await transport.answerConnector("11111111-1111-4111-8111-111111111111", true);
  const answerCall = sent.find(([route]) => route.includes("/connectors/"));
  test.assert(answerCall[0] === "/api/agent/runs/run1/connectors/11111111-1111-4111-8111-111111111111" && answerCall[1].allow === true, "the answer goes to the watched run, once");
  test.assert(snapshot.asks[0].status === "allowed", "the card shows the outcome");
  await transport.answerConnector("11111111-1111-4111-8111-111111111111", false);
  test.assert(sent.filter(([route]) => route.includes("/connectors/")).length === 1, "an answered card cannot be answered again");

  emit({ type: "connector_ask", askId: "22222222-2222-4222-8222-222222222222", connector: "mail", tool: "x", title: "X", args: "" });
  emit({ type: "connector_answer", askId: "22222222-2222-4222-8222-222222222222", allow: false });
  test.assert(snapshot.asks[1].status === "denied", "an answer given elsewhere settles the card");

  emit({ type: "connector_ask", askId: "33333333-3333-4333-8333-333333333333", connector: "mail", tool: "y", title: "Y", args: "" });
  answerFails = "connectors_closed";
  await transport.answerConnector("33333333-3333-4333-8333-333333333333", true);
  test.assert(snapshot.asks[2].status === "expired", "an answer to a run that has ended shows the card as expired");
  emit({ type: "connector_ask", askId: "44444444-4444-4444-8444-444444444444", connector: "mail", tool: "z", title: "Z", args: "" });
  answerFails = "boom";
  await transport.answerConnector("44444444-4444-4444-8444-444444444444", true);
  test.assert(snapshot.asks[3].status === "failed", "a lost answer gives the buttons back");

  answerFails = null;
  sent.length = 0;
  await transport.revisePlan({}, {}, { text: "more" });
  test.assert(sent.find(([route]) => route.endsWith("/turns"))[1].connectors?.length === 1, "every further turn carries the connectors again");
}

test.finish?.();
