// About This Mac (关于本机, 2026-10-31): the Apple menu's first row, the
// agent-era facts window the 2026-10-30 board gives the desk. Its facts are
// the board's sections — what this desk is running, the model and its local/
// cloud word, the agent engine and its sandbox, Project Hard Disk's storage,
// and the per-boot token's state — every one of them read only, the token a
// fact about itself and never a value, and the whole window riding no boot
// byte beyond one admission row.
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("about-this-mac");
const about = read("app/features/about-this-mac.js");
const html = read("index.html");
const registry = read("app/core/window-registry.js");
const admissions = read("app/core/app-admissions.js");
const config = read("app/core/config.js");
const actions = read("app/core/actions.js");
const runtimeManifest = read("tooling/runtime-manifest.mjs");
const styleManifest = read("tooling/style-manifest.mjs");
const sheet = read("styles/99-about-this-mac.css");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");
const agentRoutes = read("apps/server/server/routes/agent.js");
const router = read("apps/server/server/router.js");

// --- Lazy, ordinary window ---------------------------------------------------

test.assertNotIncludes(html, 'data-window="aboutThisMac"', "About This Mac's markup rides no boot HTML");
test.assertMatches(
  registry,
  /aboutThisMac: \{\s*\n\s*builtByModule: true,[\s\S]*?onOpen: \(\) => window\.AISystem6AboutThisMac\?\.render\?\.\(\),[\s\S]*?lazy: \{ ensure: \(\) => ensureAboutThisMacModule\(\) \}/,
  "the registry builds About This Mac on demand and repaints it on open",
);
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6AboutThisMacLoaded", ["app/core/application-shell.js", "app/features/about-this-mac.js"], false, ["styles.about-this-mac.css"])', "the loader brings the window and its sheet together");
test.assertMatches(runtimeManifest, /"app\/features\/about-this-mac\.js"/, "the module is a declared lazy runtime file");
test.assertMatches(styleManifest, /id: "about-this-mac"/, "the sheet is a declared lazy style bundle");
test.assertNotIncludes(read("tooling/style-manifest.mjs").match(/styleRuntimePaths = \[[\s\S]*?\]/)?.[0] || "", "styles/99-about-this-mac.css", "the sheet is out of the boot style bundle");
test.assertMatches(admissions, /aboutThisMac: \{ app: "system", load: ensureAboutThisMacModule, repaint: "renderAboutThisMacLanguage" \}/, "the admission table owns the window and its language repaint");
test.assertIncludes(actions, '"open-about-this-mac":"aboutThisMac"', "the opener command answers by opening the window");
test.assertIncludes(html, '<button data-action="open-about-this-mac" data-i18n="about_this_mac_menu">About This Mac…</button>', "the Apple menu carries the board's first row");
test.assertIncludes(about, 'windowName: "aboutThisMac"', "the window names itself for the registry");
test.assertIncludes(about, "installAboutThisMacWindow();", "the window is built at module eval, like its sibling");

// --- The board's sections, in both voices -------------------------------------

const sections = [
  "about_this_mac_appearance",
  "about_this_mac_model",
  "about_this_mac_engine",
  "about_this_mac_sandbox",
  "about_this_mac_storage",
  "about_this_mac_token",
];
for (const key of sections) {
  test.assertMatches(about, new RegExp(`factRow\\("${key}"`), `the window draws the ${key} section`);
  test.assertIncludes(translationsEn, `${key}:`, `English copy for ${key}`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese copy for ${key}`);
}
for (const key of ["about_this_mac_menu", "about_this_mac", "about_this_mac_note"]) {
  test.assertIncludes(translationsEn, `${key}:`, `English copy for ${key}`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese copy for ${key}`);
}

// --- Read-only facts, no secrets ------------------------------------------------

test.assertNotMatches(
  about,
  /setItem|removeItem|replaceState|indexedDB|openRequest|saveDeskState|createReceipt|localStorage/,
  "the window writes nothing of its own",
);
test.assertMatches(about, /headers: \{ "X-AI-System6-Agent-Token": token \}/, "the token's only journey is the status request's header");
test.assertMatches(about, /requestService\("agent\.harness", \{\s*path: "\/api\/agent\/status"/, "the status call crosses the desk's service boundary, not a bare fetch");
test.assertMatches(read("app/core/service-providers.js"), /\/api\\\/agent\\\/\(\?:status\|folders\|runs\|tasks/, "the agent.harness provider admits the status route by path");
test.assertIncludes(about, 'ais6-agent-token=[a-f0-9]{64}(?:&|$)/.test(', "the fragment is read as a yes/no, never as text");
test.assertNotMatches(about, /(?:textContent|innerHTML|append)[^;]*(?:AISystem6AgentToken|sessionStorage|ai-system6-agent-token)/, "no token value is ever drawn into the window");
test.assertNotMatches(about, /el\([^)]*(?:AISystem6AgentToken|sessionStorage)/, "no token value is passed to a DOM node");
test.assertMatches(agentRoutes, /engine: \{ installed: engine\.installed, version: engine\.version \}/, "the route reports the engine, not its path");
const statusHandler = agentRoutes.slice(agentRoutes.indexOf("async function handleAgentStatus"), agentRoutes.indexOf("async function handleAgentFoldersChoose"));
test.assertMatches(statusHandler, /guarded\(req, res,/, "the status route answers behind the same per-boot admission as the rest of the engine host");
test.assertNotIncludes(statusHandler, "agentToken", "the status answer carries no token");
test.assertNotMatches(statusHandler, /path:/, "the status answer carries no filesystem location");
test.assertIncludes(router, '["GET /api/agent/status", handleAgentStatus]', "the router serves the status route");
test.assertMatches(about, /typeof window\.AISystem6Capabilities\?\.requestService !== "function"/, "a page without the service boundary answers unknown instead of throwing");
test.assertMatches(about, /function beginFacts[\s\S]*?fetchEngineStatus\(\)/, "the status request happens per opening, only while the window is open");

// --- The sheet -------------------------------------------------------------------

test.assertNotMatches(sheet, /z-index|!important|:root/, "the lazy sheet owns no layers, overrides or tokens");
test.assertMatches(sheet, /\.about-this-mac-window \{/, "the sheet dresses its own window only");

// --- The executed half: the real module, loaded and opened like the desk does ----
//
// The desk opens the Apple menu's first row through the registry's lazy ensure
// and openWindow; the facts render from the desk's own runtime state, and this
// harness holds none of it — so every row answers its honest unknown, and the
// one thing that must never be true is a token value on the page.

const boot = createAppBootVm();
await boot.run("windowRegistry.aboutThisMac.lazy.ensure()");
await boot.run("openWindow('aboutThisMac')");
await boot.waitFor(() => {
  const win = boot.document.querySelector('[data-window="aboutThisMac"]');
  return Boolean(win && !win.classList.contains("is-hidden"));
});
const renderedRows = JSON.parse(boot.run(`
  JSON.stringify({
    rows: [...document.querySelectorAll('[data-window="aboutThisMac"] .about-this-mac-row')].map((row) => ({
      label: row.querySelector(".about-this-mac-label").textContent,
      value: row.querySelector(".about-this-mac-value").textContent,
    })),
    expectedLabels: [
      t("about_this_mac_appearance"),
      t("about_this_mac_model"),
      t("about_this_mac_engine"),
      t("about_this_mac_sandbox"),
      t("about_this_mac_storage"),
      t("about_this_mac_token"),
    ],
  })
`));
const expectedLabels = renderedRows.expectedLabels;
test.assert(
  JSON.stringify(renderedRows.rows.map((row) => row.label)) === JSON.stringify(expectedLabels),
  `the opened window draws the six board sections in order (got: ${renderedRows.rows.map((row) => row.label).join(" | ")})`,
);
const windowText = boot.run(`document.querySelector('[data-window="aboutThisMac"]').textContent`);
test.assertMatches(String(windowText), /the local engine is not reachable from this page/, "without the desk's state the engine row answers unknown instead of inventing a fact");
test.assertNotMatches(String(windowText), /[a-f0-9]{64}/, "no 64-hex token value is anywhere in the rendered window");
const heading = boot.run(`document.querySelector('[data-window="aboutThisMac"] .about-this-mac-heading').textContent`);
test.assertMatches(String(heading), /AI System 6 /, "the heading names the desk and its version");

test.finish();
