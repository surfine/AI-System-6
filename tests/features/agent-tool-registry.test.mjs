// The desk tool list (M8 slice 0, section 0.3): one closed, code-constant
// registry. Two levels only, no write level; ids the desk-tools bridge does not
// implement are listed but unavailable; later validators (roles, skills) import
// this one list rather than keeping their own.
import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("agent-tool-registry");
const require = createRequire(import.meta.url);
const registry = require("../../apps/desktop/app/core/agent-tool-registry.js");
const desk = require("../../apps/server/server/agent/desk-tools.js");
const source = read("app/core/agent-tool-registry.js");

const ids = registry.TOOLS.map((tool) => tool.id);

test.assert(JSON.stringify(registry.LEVELS) === JSON.stringify(["read", "propose"]), "there are two levels, read and propose");
test.assert(registry.TOOLS.every((tool) => registry.LEVELS.includes(tool.level)), "every entry is read or propose; none is write");
test.assert(new Set(ids).size === ids.length, "ids are unique");
test.assert(registry.TOOLS.every((tool) => tool.label.en && tool.label.zh), "every entry has an English and a Chinese label");
test.assert(Object.isFrozen(registry) && Object.isFrozen(registry.TOOLS) && Object.isFrozen(registry.LEVELS) && registry.TOOLS.every((tool) => Object.isFrozen(tool) && Object.isFrozen(tool.bridge)),
  "the list is frozen: closed at run time, a constant in code");
test.assertNotMatches(source, /indexedDB|localStorage|fetch\(|require\(["'](?:node:)?(?:child_process|net|http|https)/, "the list touches no storage, network or process");

// Every id the design names is in the list.
const named = ["web", "reader.*", "sources.search", "talk.quote", "scrap.*", "dossier.read", "chart.range", "write.read", "chart.read", "stage.read", "blog.read",
  "propose.scrap", "propose.flag", "propose.new-document", "propose.revision", "propose.format", "propose.chart"];
test.assert(named.every((id) => ids.includes(id)), "every tool the design board names is listed");
test.assert(ids.filter((id) => id.startsWith("propose.")).every((id) => registry.toolById(id).level === "propose")
  && ids.filter((id) => !id.startsWith("propose.")).every((id) => registry.toolById(id).level === "read"),
  "propose.* entries are the propose level and every other entry is a read");
test.assert(!ids.some((id) => /shell|exec|run|write|network|fetch-new/i.test(id.replace(/^write\.read$/, ""))), "no shell, execution, write or new network id exists");

// Alignment with the bridge.
test.assert(JSON.stringify([...registry.BRIDGE_TOOL_NAMES].sort()) === JSON.stringify(Object.keys(desk.DESK_TOOLS).sort()),
  "the bridge names the registry stands on are exactly the reads the desk-tools bridge implements");
test.assert(registry.TOOLS.filter((tool) => tool.bridge.length && tool.id !== "propose.blog-draft").every((tool) => tool.level === "read"),
  "only reads stand on the read-only bridge; the blog field suggestion is held and writes nothing");
test.assert(registry.isAvailable("sources.search") && !registry.isAvailable("web") && !registry.isAvailable("propose.scrap") && !registry.isAvailable("nope"),
  "an id the bridge implements is available; one it does not, and an unknown one, is not");
test.assert(JSON.stringify(registry.availableToolIds().sort()) === JSON.stringify(ids.filter((id) => registry.toolById(id).bridge.length).sort()), "availableToolIds is the bridge-backed entries");

// 文思泉涌's read side (D7): available now, and implemented where the bridge runs.
test.assert(registry.isAvailable("blog.read"), "blog.read is available now that the bridge implements it");
test.assert(JSON.stringify(registry.toolById("blog.read").bridge) === JSON.stringify(["read_blog_articles", "read_blog_article"]),
  "blog.read stands on the two blog reads");
const guestSource = read("app/features/guest-tools.js");
test.assert(guestSource.includes('"read_blog_articles", "read_blog_article", "propose_blog_fields"') && guestSource.includes("async ais6_read_blog_article(") && guestSource.includes("async ais6_propose_blog_fields("),
  "the page implements both blog reads and the held field suggestion");
test.assert(registry.isAvailable("propose.blog-draft") && registry.isAvailable("blog.suggest"),
  "the held field suggestion is selectable, and it still does not write");
test.assert(guestSource.includes("const BLOG_DESK_TOOLS") && guestSource.includes("if (BLOG_DESK_TOOLS.has(name))"),
  "blog reads are answered without requiring an open project, and still inside the granted channel");
test.assert(desk.DESK_TOOLS.read_blog_article.length === 3 && desk.DESK_TOOLS.read_blog_articles.length === 3,
  "the bridge drops any argument the two blog reads do not name");

// What later validators import.
const verdict = registry.validateToolIds(["sources.search", "web", "shell", "write_manuscript"]);
test.assert(!verdict.ok && JSON.stringify(verdict.unknown) === JSON.stringify(["shell", "write_manuscript"]) && JSON.stringify(verdict.unavailable) === JSON.stringify(["web"]),
  "validateToolIds refuses unknown ids and reports known-but-unavailable ones apart");
test.assert(registry.validateToolIds(["sources.search", "scrap.*"]).ok && registry.validateToolIds([]).ok, "a list of known ids passes");
test.assert(registry.toolById("web") === registry.TOOLS[0] && registry.toolById("zzz") === null, "lookup returns the shared entry");

// One shared list, not copies: nothing else in the app or server declares one.
const manifest = read("tooling/runtime-manifest.mjs");
test.assert(manifest.includes('"app/core/agent-tool-registry.js"') && manifest.indexOf('"app/core/agent-tool-registry.js"') > manifest.indexOf("lazyRuntimePaths"),
  "the list ships in lazyRuntimePaths, not the boot bundle");
test.assertIncludes(read("app/core/config.js"), '"app/core/agent-tool-registry.js"', "the Extensions loader brings the list with the window");

test.finish();
