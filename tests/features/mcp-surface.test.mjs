// MCP surface — the registry-driven contract (work order MCP-1).
//
// The guest bridge's tool table lives in ONE place now: apps/desktop/app/core/
// mcp-surface.js. The server requires it for tools/list; the lazy page bundle
// executes it to check calls; the applications declare their face in it. This
// contract proves the seams that keep that single source honest:
//
//   1. coverage  — every application the registry registers has an MCP
//                  declaration here, and every name an application declares
//                  is a declared tool;
//   2. naming    — every tool is ais6_-prefixed, A-Za-z0-9_- only, ≤128 chars;
//   3. protocol  — every tool carries annotations marked truthfully and an
//                  output schema; the change tier is exactly the set the
//                  per-call elicitation gate asks about;
//   4. two sides — the server's table and the page's table derive from the
//                  same declarations, and the application ids are enumerated
//                  from the registry, not hard-coded three times over.

import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { createRequire } from "node:module";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("mcp-surface");
const surface = require("../../apps/desktop/app/core/mcp-surface.js");
const tools = require("../../apps/server/server/mcp-tools.js");

// --- 1. Coverage: every registered application declares an MCP face ----------

const registrySource = read("app/core/application-registry.js");
// Ten applications register with a literal id; ClioWorks Quire and Lectern
// register through the shared loop over their table, so both spellings count.
const literalIds = [...registrySource.matchAll(/registerApplication\(\{\s*\n\s*id:\s*"([A-Za-z0-9_-]+)"/g)].map((match) => match[1]);
const loopIds = [...registrySource.matchAll(/\["(clioWorks(?:Quire|Lectern))",/g)].map((match) => match[1]);
const registeredIds = [...literalIds, ...loopIds];
test.assert(registeredIds.length >= 12, `the registry registers its applications (${registeredIds.length} found)`);
const declaredIds = surface.applicationIds();
for (const id of registeredIds) {
  test.assert(declaredIds.includes(id), `the registered application ${id} declares an MCP face`);
}
// clioPaint and clioProject offer reads without being routing applications.
test.assert(declaredIds.includes("clioPaint") && declaredIds.includes("clioProject"), "ClioPaint and ClioProject declare read-only faces of their own");
for (const [id, declaration] of Object.entries(surface.APP_MCP)) {
  for (const name of declaration.tools) {
    test.assert(Boolean(surface.toolByName(name)), `application ${id} names a declared tool (${name})`);
  }
  for (const resource of declaration.resources) {
    test.assert(resource.kind && resource.uri && resource.mimeType, `application ${id} declares its ${resource.kind} resource with a uri and a mime type`);
  }
}
// The ClioWorks family shares one face: the same four tools serve the three
// applications, because the desk's revision path is one path for all formats.
const worksFace = surface.applicationMcp("clioWorksQuire").tools;
test.assert(
  surface.applicationMcp("clioWorksLedger").tools === worksFace && surface.applicationMcp("clioWorksLectern").tools === worksFace,
  "the three ClioWorks applications share one face: the desk's revision path is one path",
);
test.assert(
  worksFace.includes("ais6_clioworks_read_projection") && worksFace.includes("ais6_clioworks_propose_revisions"),
  "the ClioWorks face covers the text projection and the revision proposal",
);

// --- 2. Naming: the ais6_ rule a client aggregating servers relies on --------

for (const tool of surface.MCP_TOOLS) {
  test.assert(surface.validToolName(tool.name), `tool ${tool.name} is ais6_-prefixed, A-Za-z0-9_- only, and at most 128 characters`);
}
const names = surface.MCP_TOOLS.map((tool) => tool.name);
test.assert(new Set(names).size === names.length, "tool names are unique");
test.assert(names.length >= 59, `the table carries the desk's tools plus the applications' (${names.length})`);

// --- 3. Protocol shape: annotations marked truthfully, schemas attached ------

for (const tool of surface.MCP_TOOLS) {
  test.assert(surface.PRIVILEGE_LEVELS[tool.level], `tool ${tool.name} declares one of the three grant levels`);
  test.assert(typeof tool.description === "string" && tool.description.length > 10, `tool ${tool.name} describes itself`);
  test.assert(Boolean(tool.inputSchema?.type), `tool ${tool.name} declares an input schema`);
  test.assert(Boolean(tool.outputSchema?.type), `tool ${tool.name} declares an output schema (structured output)`);
  const a = tool.annotations;
  test.assert(a && typeof a.readOnlyHint === "boolean" && typeof a.destructiveHint === "boolean"
    && typeof a.idempotentHint === "boolean" && typeof a.openWorldHint === "boolean",
  `tool ${tool.name} carries all four annotations`);
  // The honesty rule: a read says read-only and never destructive; anything
  // that writes says so; nothing here reaches the open world on its own.
  test.assert(a.readOnlyHint === (tool.level === "read"), `tool ${tool.name}'s readOnlyHint matches its grant level`);
  if (tool.level === "read") test.assert(a.destructiveHint === false, `read tool ${tool.name} is never destructive`);
  test.assert(a.openWorldHint === false, `tool ${tool.name} works in the desk's closed world`);
}
// The overwriters say destructiveHint: the client grades its approval by it.
for (const name of ["ais6_write_manuscript", "ais6_restore_document_revision", "ais6_set_route_document", "ais6_commit_receipt"]) {
  test.assert(surface.toolByName(name)?.annotations?.destructiveHint === true, `${name} is marked destructiveHint`);
}
// The change tier is exactly the set the per-call elicitation gate asks about.
const changeTools = surface.MCP_TOOLS.filter((tool) => tool.level === "change").map((tool) => tool.name);
test.assert(changeTools.length === 13 && changeTools.includes("ais6_dispatch_intent") && changeTools.includes("ais6_write_manuscript"), "可改动 is the desk-operating set the elicitation gate asks about");
// The bilingual description rule the desk keeps for everything a guest reads.
test.assert(surface.MCP_TOOLS.every((tool) => /[一-鿿]/.test(tool.description) && /[A-Za-z]/.test(tool.description)), "every tool description is bilingual");

// --- 4. Two sides: server and page derive from the same declarations ---------

for (const level of ["read", "propose", "change"]) {
  const server = tools.toolsForPrivilege(level).map((tool) => tool.name).sort().join(",");
  const page = surface.toolNamesForPrivilege(level).sort().join(",");
  test.assert(server === page, `the server's ${level} table is the surface's ${level} table`);
}
test.assert(tools.GUEST_TOOLS === surface.MCP_TOOLS, "the server exports the surface's table itself, not a copy");

const pageContext = { window: {}, crypto: { randomUUID }, t: (key) => key, document: { getElementById: () => null } };
pageContext.window = pageContext;
vm.createContext(pageContext);
vm.runInContext(read("app/core/mcp-surface.js"), pageContext, { filename: "mcp-surface.js" });
const pageSurface = pageContext.window.AISystem6McpSurface;
test.assert(typeof pageSurface?.toolsForPrivilege === "function", "the surface installs itself in the page bundle without touching the DOM");
test.assert(pageSurface.MCP_TOOLS.map((tool) => tool.name).join(",") === surface.MCP_TOOLS.map((tool) => tool.name).join(","), "the page bundle executes the same table the server serves");

// --- 5. The application ids are enumerated, never hard-coded -----------------

const guestToolsSource = read("app/features/guest-tools.js");
test.assert(guestToolsSource.includes("registry?.applications"), "list_desk_applications enumerates the registry instead of repeating its ids");
test.assert(!/const ids = \["teachText"/.test(guestToolsSource), "the hard-coded application id list is gone from the page");
test.assert(
  !/"teachText, docMap, reviewDesk/.test(read("apps/server/server/mcp-tools.js")),
  "the hard-coded application id list is gone from the server's schemas",
);
test.assert(
  surface.toolByName("ais6_open_application")?.inputSchema?.properties?.appId?.description?.includes("ais6_list_desk_applications"),
  "open_application takes its appId from ais6_list_desk_applications, not from a remembered list",
);
test.assert(
  surface.toolByName("ais6_open_application")?.inputSchema?.properties?.appId?.enum === undefined
    && surface.toolByName("ais6_dispatch_intent")?.inputSchema?.properties?.appId?.enum === undefined,
  "neither open_application nor dispatch_intent enumerates appIds in its schema",
);

// --- 6. The lazy loader brings the surface ahead of the page -----------------

test.assertMatches(
  read("apps/desktop/app/core/config.js"),
  /createLazyModuleLoader\("AISystem6GuestTools",\s*\[[\s\S]*?"app\/core\/mcp-surface\.js"[\s\S]*?"app\/features\/guest-tools\.js"/,
  "the guest-tools lazy loader runs the surface ahead of the feature",
);
test.assertMatches(
  read("tooling/runtime-manifest.mjs"),
  /"app\/core\/mcp-surface\.js",\s*\n\s*"app\/features\/guest-tools\.js"/,
  "the manifest lists the surface beside guest-tools in the lazy bundle",
);
test.assert(guestToolsSource.includes("writeUrisFor"), "the page can name the resources a write touched, for the subscription surface");

test.finish();
