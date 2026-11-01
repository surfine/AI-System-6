// Chooser book — executable contract.
//
// Chooser's MCP corner is the desk's AppleTalk switch: Inactive unless the
// writer chose Active, and the choice is what opens or closes the guest
// bridge. The rail itself is drawn on screen; this contract holds the
// switch, because that is what keeps outside agents off the desk.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chooser-book");
const source = read("apps/desktop/app/features/chooser-book.js");

function load(storage) {
  const calls = [];
  const window = {
    AISystem6GuestExecutor: {
      start: (resume) => calls.push(`start:${resume}`),
      stop: () => calls.push("stop"),
    },
  };
  const context = {
    window,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    localStorage: storage,
  };
  window.window = window;
  vm.runInNewContext(source, context);
  return { book: window.AISystem6ChooserBook, calls };
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
}

{
  const { book } = load(memoryStorage());
  test.assert(book.isMcpActive() === false, "a desk that never chose is Inactive");
}

{
  const { book } = load({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  test.assert(book.isMcpActive() === false, "storage that throws reads as Inactive");
}

{
  const storage = memoryStorage();
  const { book, calls } = load(storage);
  book.setMcpActive(true);
  test.assert(storage.data["ai-system6-mcp"] === "on" && book.isMcpActive(), "Active is remembered");
  test.assert(calls.at(-1) === "start:true", "Active opens the bridge, lifting an earlier stop");
  book.setMcpActive(false);
  test.assert(storage.data["ai-system6-mcp"] === "off" && !book.isMcpActive(), "Inactive is remembered");
  test.assert(calls.at(-1) === "stop", "Inactive closes the bridge");
}

test.assertIncludes(
  read("apps/desktop/app/core/boot.js"),
  'localStorage.getItem("ai-system6-mcp") === "on" && window.AISystem6GuestExecutor?.start?.()',
  "boot opens the guest bridge only when the writer chose Active",
);
test.assertIncludes(
  read("apps/desktop/app/core/guest-executor.js"),
  "if (resume) stopped = false;",
  "the bridge can be reopened after the switch closed it",
);

// Tool permissions: only departures from the level's default are stored, and
// a change-level tool can never be set to Allow (it asks every time).
{
  const approvals = { probe: { status: "approved", privilege: "change", tools: {} } };
  const window = {
    AISystem6GuestExecutor: {
      approvalFor: (name) => approvals[name],
      recordApproval: (name, entry) => { approvals[name] = entry; },
    },
    AISystem6McpSurface: {
      toolByName: (name) => ({ ais6_read: { level: "read" }, ais6_write: { level: "change" } })[name],
    },
  };
  window.window = window;
  vm.runInNewContext(source, { window, document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null }, localStorage: memoryStorage() });
  const book = window.AISystem6ChooserBook;
  book.setToolRule("probe", "ais6_write", "allow");
  test.assert(!("ais6_write" in (approvals.probe.tools || {})), "a change tool cannot be set to Allow");
  book.setToolRule("probe", "ais6_write", "off");
  test.assert(approvals.probe.tools.ais6_write === "off", "a change tool can be switched off");
  book.setToolRule("probe", "ais6_read", "ask");
  test.assert(approvals.probe.tools.ais6_read === "ask", "a read tool can ask each time");
  book.setToolRule("probe", "ais6_read", "allow");
  test.assert(!("ais6_read" in approvals.probe.tools), "returning to the default stores nothing");
  book.setMountedProjects("probe", ["p1", "p1", "p2"]);
  test.assert(JSON.stringify(approvals.probe.projects) === '["p1","p2"]', "a guest can be limited to chosen projects");
  book.setMountedProjects("probe", []);
  test.assert(!("projects" in approvals.probe), "an empty mount list means it follows the open project again");
}
{
  const guestTools = read("apps/desktop/app/features/guest-tools.js");
  test.assertIncludes(guestTools, "checkProjectMount(name, args, guest);", "the page checks the project mount before a tool runs");
  test.assertIncludes(guestTools, "result.projects.filter((entry) => mounted.has(entry.projectId))", "list_projects shows a limited guest only its projects");
}
{
  const routes = read("apps/server/server/routes/mcp.js");
  test.assertIncludes(routes, '"tool-off"', "the server refuses a tool the writer switched off");
  test.assertIncludes(routes, "filter((tool) => !off.has(tool.name))", "a switched-off tool leaves the guest's tool list");
  test.assertIncludes(read("apps/desktop/app/features/guest-tools.js"), "await checkToolRule(name, guest);", "the page asks or refuses before a tool runs");
}

// Recent calls: the server's audit ring reaches the page on connect and with
// every call, so the list survives a reload of the page.
test.assertIncludes(read("apps/server/server/agent-executor.js"), "activity: guestActivity(deskId)", "the executor hello carries the audit ring");
{
  const executor = read("apps/desktop/app/core/guest-executor.js");
  test.assertIncludes(executor, 'addEventListener("guest.activity"', "the page listens for each new call");
  test.assertIncludes(executor, "activity: () => state.activity.slice()", "the page exposes the calls to Chooser");
}
test.assertIncludes(source, 'id="chooser-call-list"', "Chooser lists recent calls");
test.assertIncludes(source, 'id="chooser-calls-export"', "the calls can be exported");

test.finish();
