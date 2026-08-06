// Control Strip groundwork. Control Strip is a System 7 feature, so it is
// optional and off by default; it is enabled from Control Panel -> General.
// The strip's icons and per-module renderers are a separate task — this
// contract locks the preference plumbing, the lazy lifecycle, and the module
// registry the future implementation will fill.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("control-strip");
const manifest = read("scripts/runtime-manifest.mjs");
const html = read("index.html");
const persistence = read("app/core/persistence-status.js");
const domHandles = read("app/core/dom-handles.js");
const wireup = read("app/core/wireup.js");
const config = read("app/core/config.js");
const boot = read("app/core/boot.js");
const module = read("app/features/control-strip.js");
const foundation = read("styles/00-foundation.css");
const liquidGlass = read("styles/70-liquid-glass.css");
const responsive = read("styles/60-responsive.css");

function zValue(source, name) {
  const match = String(source).match(new RegExp(`${name}\\s*:\\s*([0-9]+)`));
  return match ? Number(match[1]) : NaN;
}

test.assertIncludes(html, 'id="control-strip" type="checkbox" />', "Control Panel exposes a Control Strip checkbox");
test.assertNotMatches(html, /id="control-strip"[^>]*checked/, "Control Strip is off by default");
test.assert(html.indexOf("control-strip") > html.indexOf('id="control-panel-general"'), "the checkbox lives in the General tab");

test.assertIncludes(persistence, "controlStrip: controlStripInput.checked", "the preference persists with the desk settings");
test.assertIncludes(persistence, 'typeof settings.controlStrip === "boolean"', "the preference restores on boot");
test.assertIncludes(domHandles, "controlStripInput", "the checkbox is wired into the shared DOM handles");
test.assertIncludes(wireup, "applyControlStripState()", "toggling the checkbox applies the runtime state");
test.assertIncludes(wireup, "saveDeskState()", "toggling the checkbox persists");

test.assertIncludes(config, "function ensureControlStripModule", "the strip loads from one lazy loader");
test.assertIncludes(config, "function applyControlStripState", "enabling loads the module; disabling removes it");
test.assertIncludes(boot, "applyControlStripState()", "the strip activates after boot without blocking it");
test.assertIncludes(manifest, '"app/features/control-strip.js"', "the strip is a lazy module");
test.assertNotIncludes(manifest.split("lazyRuntimePaths = [")[0], "app/features/control-strip.js", "the strip is not part of the startup bundle list");

test.assertIncludes(module, "window.AISystem6ControlStrip", "the strip exposes a lifecycle API");
test.assertIncludes(module, "function registerModule", "modules register through one registry");
test.assertIncludes(module, "function disable()", "disabling removes the strip from the desk");
test.assertIncludes(module, "Mac OS 9", "the strip records which system it reproduces");
test.assertIncludes(module, 'state === "unknown"', "a module with no real source is not registered");
test.assertNotMatches(module, /runModelTask|requestChat|createProject|downloadMarkdown/, "menus change settings or open existing windows; they never start work");
test.assertNotMatches(module, /submenu|subMenu/, "one flat menu per module, never a second menu bar");
test.assertNotMatches(module, /已连接|Connected/, "network status never claims a model connection");
test.assertIncludes(module, "menu-popover", "module menus reuse the existing menu primitive");
test.assertIncludes(module, '"soundscape"', "Soundscape module slot is declared");
test.assertIncludes(module, '"projectDisk"', "Project Disk module slot is declared");
test.assertIncludes(module, '"model"', "model status module slot is declared");
test.assertIncludes(module, '"network"', "network status module slot is declared");
test.assertIncludes(module, '"context"', "context usage module slot is declared");
test.assertIncludes(module, '"indexing"', "indexing progress module slot is declared");
test.assertIncludes(module, '"longTasks"', "long-task module slot is declared");
test.assertIncludes(module, '"writingBell"', "Writing Bell module slot is declared");
test.assertIncludes(module, '"outputQueue"', "output queue module slot is declared");
test.assertIncludes(module, '"volume"', "volume module slot is declared");

test.assertNotIncludes(liquidGlass, "use-liquid-glass .control-strip", "the strip is themed by tokens, not twins");
test.assertIncludes(foundation, "--control-strip-thickness", "strip geometry is tokenized");
test.assertIncludes(foundation, "--z-control-strip", "the floating layer is a named token, not a literal");
test.assertIncludes(responsive, "mobile-app-foreground", "the strip yields to the full-screen app shell on phones");
test.assertIncludes(persistence, "controlStripCollapsed", "the collapsed state persists in the existing settings record");

test.assert(zValue(foundation, "--z-control-strip") > zValue(foundation, "--z-window-priority"),
  "the strip floats above windows, as it does in Mac OS 9");
test.assert(zValue(foundation, "--z-control-strip") < zValue(foundation, "--z-system-menu"),
  "…but never above the system menu bar");

test.finish();
