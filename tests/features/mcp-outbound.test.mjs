// Outbound MCP — executable contract.
//
// The desk asks an external MCP server the writer added in Chooser. Three
// seams:
//
//   1. reach   — which URLs the proxy will dial at all (TLS off-machine,
//                plaintext only to this Mac, no credentials in the URL, no
//                private-network pivot), and which headers survive;
//   2. speak   — initialize, tools/list, tools/call against a real server
//                process, including a session the server later forgets and a
//                response framed as SSE;
//   3. land    — the page names the remote tool's own argument, reads its
//                answer into results, and every answer's landing place is
//                the File Floppy.

import http from "node:http";
import net from "node:net";
import vm from "node:vm";
import { createRequire } from "node:module";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("mcp-outbound");
const client = require("../../apps/server/server/mcp-client.js");

// --- 1. Reach ---------------------------------------------------------------

async function refused(url, expectedCode) {
  try {
    await client.resolveMcpServerTarget(url);
    return `accepted ${url}`;
  } catch (error) {
    return error.code === expectedCode ? "" : `${error.code} (wanted ${expectedCode})`;
  }
}

test.assert(await client.resolveMcpServerTarget("http://127.0.0.1:4173/mcp") === "http://127.0.0.1:4173/mcp", "plain http to this Mac is allowed: local tool servers are the point");
test.assert(await client.resolveMcpServerTarget("http://localhost:9000/mcp") === "http://localhost:9000/mcp", "localhost counts as this Mac");
test.assert(!(await refused("http://example.com/mcp", "mcp_client_insecure_remote")), "plain http to another host is refused; TLS is required off-machine");
test.assert(!(await refused("http://192.168.1.20/mcp", "mcp_client_insecure_remote")), "a LAN address over http is refused, so the proxy cannot be pivoted into the network");
test.assert(!(await refused("https://10.0.0.5/mcp", "mcp_client_private_address")), "a private address over https is refused too");
test.assert(!(await refused("https://user:secret@example.com/mcp", "mcp_client_url_credentials")), "credentials in the URL are refused; they belong in a header");
test.assert(!(await refused("ftp://example.com/mcp", "mcp_client_unsupported_scheme")), "only http and https are dialed");
test.assert(!(await refused("not a url", "mcp_client_invalid_url")), "a malformed URL is named as such");

const headers = client.safeHeaders({
  Authorization: "Bearer token",
  "Content-Length": "9999",
  Host: "elsewhere",
  "Mcp-Session-Id": "forged",
  "X-Bad Name": "dropped",
  "X-Trace": "line\r\ninjected: yes",
});
test.assert(headers.Authorization === "Bearer token", "a caller header the server needs is kept");
test.assert(!("Content-Length" in headers) && !("Host" in headers) && !("Mcp-Session-Id" in headers), "framing and session headers stay with the transport");
test.assert(!("X-Bad Name" in headers), "a header name that is not a header name is dropped");
test.assert(!/[\r\n]/.test(headers["X-Trace"]), "no header value can inject a second header");

// --- 2. Speak ---------------------------------------------------------------

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

/**
 * A minimal MCP server: it hands out one session, forgets it once (to prove
 * the client re-initializes instead of failing), and answers its one tool as
 * a Server-Sent Events frame rather than a plain body.
 */
function startFakeMcpServer(port) {
  const state = { sessions: new Set(), calls: [], forgetNext: false, initializes: 0 };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const payload = JSON.parse(body || "{}");
      const answer = (status, text, extraHeaders = {}) => {
        res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
        res.end(text);
      };
      if (payload.method === "initialize") {
        state.initializes += 1;
        const id = `s${state.initializes}`;
        state.sessions.add(id);
        answer(200, JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "Fake", version: "1" } },
        }), { "Mcp-Session-Id": id });
        return;
      }
      const sessionId = String(req.headers["mcp-session-id"] || "");
      if (payload.method !== "notifications/initialized" && !state.sessions.has(sessionId)) {
        answer(404, JSON.stringify({ error: "unknown session" }));
        return;
      }
      if (payload.method === "notifications/initialized") { answer(202, ""); return; }
      if (payload.method === "tools/list") {
        answer(200, JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            tools: [{
              name: "search_notes",
              description: "Search the notes.",
              inputSchema: {
                type: "object",
                properties: { search_query: { type: "string" }, max_results: { type: "integer" } },
                required: ["search_query"],
              },
            }],
          },
        }));
        return;
      }
      if (payload.method === "tools/call") {
        state.calls.push(payload.params);
        if (state.forgetNext) {
          state.forgetNext = false;
          state.sessions.delete(sessionId);
          answer(404, JSON.stringify({ error: "session expired" }));
          return;
        }
        // Answered as a single SSE frame, which streamable HTTP allows.
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end(`event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: { content: [{ type: "text", text: JSON.stringify([{ title: "Note one", url: "https://example.com/1", snippet: "first" }]) }] },
        })}\n\n`);
        return;
      }
      answer(200, JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32601, message: "no" } }));
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, state })));
}

const port = await reservePort();
const { server: fake, state } = await startFakeMcpServer(port);
const url = `http://127.0.0.1:${port}/mcp`;
try {
  client.resetMcpClientSessions();
  const listed = await client.listMcpTools({ url }, null);
  test.assert(listed.tools.length === 1 && listed.tools[0].name === "search_notes", "tools/list reaches the server and returns its tools");
  test.assert(
    listed.tools[0].properties.some((property) => property.name === "search_query" && property.type === "string")
      && listed.tools[0].required.includes("search_query"),
    "each tool carries its argument shape, so the desk can fill it without guessing"
  );

  const called = await client.callMcpTool({ url }, "search_notes", { search_query: "rollback" }, null);
  test.assert(!called.isError && /Note one/.test(called.text), "tools/call round-trips a response framed as SSE");
  test.assert(state.calls[0]?.arguments?.search_query === "rollback", "the arguments arrive as sent");
  test.assert(state.initializes === 1, "the session is reused across calls rather than re-initialized each time");

  state.forgetNext = true;
  const afterExpiry = await client.callMcpTool({ url }, "search_notes", { search_query: "again" }, null);
  test.assert(!afterExpiry.isError && /Note one/.test(afterExpiry.text), "a session the server has forgotten is reopened once, not reported as a failure");
  test.assert(state.initializes === 2, "reopening the session means exactly one more initialize");

  let rejected = "";
  try {
    await client.callMcpTool({ url }, "", {}, null);
  } catch (error) {
    rejected = error.code;
  }
  test.assert(rejected === "mcp_client_no_tool", "a call with no tool name is refused before the network");
} finally {
  fake.close();
}

// --- 3. Land ----------------------------------------------------------------

const source = read("apps/desktop/app/features/mcp-servers.js");
const context = { window: {}, t: (key, ...args) => `${key}:${args.join(",")}`, document: { getElementById: () => null } };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "mcp-servers.js" });
const page = context.window.AISystem6McpServers;
test.assert(typeof page?.searchArgumentsFor === "function", "the outbound module installs without a DOM");

const shape = { properties: [{ name: "search_query", type: "string" }, { name: "max_results", type: "integer" }], required: ["search_query"] };
test.assert(JSON.stringify(page.searchArgumentsFor(shape, "letter", 5)) === JSON.stringify({ search_query: "letter", max_results: 5 }), "a search call names the field the server asked for, not a guessed 'query'");
const bare = page.searchArgumentsFor({ properties: [{ name: "term", type: "string" }], required: ["term"] }, "letter", 5);
test.assert(bare.term === "letter" && !("limit" in bare), "with one required string and no limit field, only that field is sent");
test.assert(page.searchArgumentsFor(null, "letter", 5).query === "letter", "with no declared shape the call falls back to query");

const rows = page.normalizeSearchResults({ text: '[{"title":"A","url":"https://a","snippet":"s"}]' }, "Notes", "q");
test.assert(rows.length === 1 && rows[0].title === "A" && rows[0].url === "https://a", "a JSON list of results renders as results");
const structured = page.normalizeSearchResults({ structured: { results: [{ name: "B", link: "https://b" }] } }, "Notes", "q");
test.assert(structured[0].title === "B" && structured[0].url === "https://b", "structured content is read before text, under either field spelling");
const prose = page.normalizeSearchResults({ text: "just a sentence" }, "Notes", "q");
test.assert(prose.length === 1 && prose[0].snippet === "just a sentence" && prose[0].site === "Notes", "an answer that is not a list is shown whole rather than dropped");
test.assert(page.normalizeSearchResults({ text: "" }, "Notes", "q").length === 0, "an empty answer is an empty result list");
test.assert(page.serverNameFromProvider("mcp:Local tools") === "Local tools" && page.serverNameFromProvider("duckduckgo") === "", "the provider value carries the server name");

// --- Wiring -----------------------------------------------------------------

test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/features/mcp-servers.js"', "the outbound module is in the manifest");
test.assertIncludes(read("apps/desktop/app/core/config.js"), 'createLazyModuleLoader("AISystem6McpServers", ["app/features/mcp-servers.js"])', "a loader names it");
test.assertIncludes(read("apps/desktop/app/core/window-registry.js"), "ensureMcpServersModule()", "Chooser loads it");
const html = read("apps/desktop/index.html");
test.assertIncludes(html, 'id="chooser-server-list"', "Chooser carries the server list");
test.assertIncludes(html, 'id="chooser-add-server"', "Chooser can add a server");
test.assertIncludes(html, 'data-action="find-path-to-floppy"', "Searcher can put a result on the File Floppy");
test.assertIncludes(read("apps/desktop/app/features/findpath.js"), 'provider.startsWith("mcp:")', "Searcher routes an MCP provider to the outbound module");
test.assertIncludes(read("apps/desktop/app/core/persistence-status.js"), "mcpServers: window.AISystem6GuestExecutor?.getServers?.() || {}", "the server list is part of the settings record");
test.assertIncludes(read("apps/desktop/app/features/mcp-servers.js"), "syncSearchProviderOptions", "an enabled server joins the Search Engine menu");
test.assertIncludes(read("apps/desktop/app/core/persistence-status.js"), 'savedSearchProvider.startsWith("mcp:")', "and a saved server provider survives a reload even before that lazy module arrives");
for (const key of ["mcp_servers", "chooser_servers_note", "mcp_server_add", "mcp_server_provider_option", "find_path_to_floppy"]) {
  test.assert(read("apps/desktop/app/data/translations-en.js").includes(`    ${key}:`) && read("apps/desktop/app/data/translations-zh.js").includes(`    ${key}:`), `translation key ${key} exists in both languages`);
}

test.finish();
