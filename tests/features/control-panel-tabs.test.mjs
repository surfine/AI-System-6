// Control Panel used to be one long scroll; on a phone its close box could end
// up unreachable below the fold. It is now three tabs (Local Model / Cloud
// Model / General), reusing the same static tab-switch shape as Start Here and
// the Liquid Cover inspector — no new pattern per DESIGN.md.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("control-panel-tabs");
const html = read("index.html");
const foundation = read("styles/00-foundation.css");
const windows = read("styles/10-windows.css");
const responsive = read("styles/60-responsive.css");
const persistence = read("app/core/persistence-status.js");

for (const name of ["local", "cloud", "general"]) {
  test.assertIncludes(html, `data-control-tab="${name}"`, `a tab exists for ${name}`);
  test.assertIncludes(html, `data-control-panel="${name}"`, `a panel exists for ${name}`);
}
test.assertIncludes(persistence, "function setControlTab(", "one function owns tab switching");
test.assertIncludes(persistence, "function wireControlTabs(", "tabs are wired at startup");
test.assertIncludes(html, 'id="open-ai-prompts-folder"', "the Advanced panel keeps a discoverable entry to the file-based AI prompts");
test.assertNotIncludes(html, 'data-prompt-file="cliotalk.main"', "the inline system-prompt editor is gone from Advanced settings");

// Checkbox rows share one grid per section so the first preference and the
// disclosure's slotted details content cannot fall onto different gap rules.
test.assertMatches(
  html,
  /class="control-checkbox-grid">[\s\S]*id="remember"[\s\S]*id="modern-fonts"[\s\S]*id="appearance-theme"[\s\S]*id="sound-effects"[\s\S]*id="menu-clock"/,
  "all preferences share one spacing grid"
);
test.assertMatches(
  html,
  /class="control-section control-advanced">[\s\S]*class="control-prompt-entry"[\s\S]*class="control-checkbox-grid">[\s\S]*id="performance-meter"[\s\S]*id="manual-model-fields"[\s\S]*id="show-reset-system-menu"[\s\S]*id="enable-image-gen"/,
  "all advanced checkboxes share one spacing grid"
);

// Desktop connection phases share one compact frame, so status and model
// discovery cannot make the outer window jump. Portrait remains content-sized
// and scrollable because its viewport is the tighter constraint.
test.assertIncludes(foundation, "--control-panel-height: 440px;", "Control Panel has one desktop height token");
test.assertIncludes(
  windows,
  "height: min(var(--control-panel-height), calc(100vh - 68px));",
  "desktop Control Panel keeps a stable viewport-bounded height"
);
test.assertIncludes(responsive, "height: auto;", "portrait Control Panel/Chooser still follows content");
test.assertNotIncludes(
  responsive,
  "height: min(82vh, calc(100vh - var(--system-menu-height, 26px) - 20px));\n    max-height:",
  "the old fixed portrait height is gone"
);
test.assertIncludes(
  persistence,
  'win.style.height = "";',
  "switching tabs clears a stale saved height so CSS owns the stable frame"
);

// The grid-blowout bug that stretched the pane past the window (and, with it,
// this tab row) needs both layers clamped: the track, and the item.
test.assertIncludes(windows, "grid-template-columns: minmax(0, 1fr);", "the settings track cannot grow past its container");
test.assertIncludes(
  windows,
  ".control-panel .settings > .control-section,\n.chooser-panel .settings > .control-section {\n  /* A grid item",
  "a grid item's own min-width is also clamped, not just its track"
);

// Cloud is the one-step path; local needs a separate app already running, so
// it defaults to the more likely dead end less often.
test.assertIncludes(html, 'data-control-panel="cloud">', "Cloud starts as the visible panel");
test.assertIncludes(html, 'data-control-panel="local" hidden', "Local starts hidden");
test.assertIncludes(persistence, "localInUse ? \"local\" : \"cloud\"", "the default prefers whichever model is actually in use");

// A window-level accessory cascade must never stamp desktop left/top/width
// frames in portrait. The shared phone arranger now owns every Desk Accessory,
// including Control Panel and Chooser, before desktop cascade code can run.
const windowManager = read("app/core/window-manager.js");
test.assertIncludes(
  windowManager,
  "if (isPortraitDocumentFlow()) {\n    arrangePortraitDeskAccessories(frontWin);\n    return;",
  "the desktop cascade steps aside for all Desk Accessories in portrait"
);

// The Local tab's connect half is one status line by default; the auth/CORS/
// browser-permission diagnostics and the optional token field live in a
// disclosure that opens itself when something actually failed.
test.assertIncludes(html, 'id="local-connection-details"', "connection diagnostics are collapsible");
test.assertIncludes(html, 'data-i18n="local_connection_details"', "the disclosure is labelled");
test.assertIncludes(
  persistence,
  'if (details && element.dataset.state === "unavailable") details.open = true;',
  "a failed diagnostic reveals itself rather than staying hidden"
);
for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) {
  test.assertIncludes(read(file), "local_connection_details:", `${file} has the disclosure label`);
}

// Connecting and choosing a model are two steps in sequence, but the Local tab
// used to lay both out at once — so the model pickers sat there empty and
// unusable until a connection existed. The tab now shows one phase at a time,
// and once connected the endpoint fields fold away into Advanced rather than
// being duplicated.
test.assertIncludes(html, 'class="local-connect-fields"', "the connect step is one group");
test.assertIncludes(html, 'class="local-model-fields"', "the model step is another group");
test.assertIncludes(html, 'id="local-advanced-details"', "rarely-touched settings collapse");
test.assertIncludes(html, 'data-i18n="local_advanced"', "the advanced disclosure is labelled");
test.assertIncludes(persistence, "function syncLocalModelPhase(", "one function owns the phase switch");
test.assertIncludes(
  persistence,
  "syncLocalModelPhase(state === \"ready\")",
  "the phase follows the real connection state, not a click"
);
test.assertIncludes(
  persistence,
  "if (!advanced.contains(connectFields)) advanced.prepend(connectFields);",
  "the connect fields move into Advanced rather than being rendered twice"
);
for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) {
  test.assertIncludes(read(file), "local_advanced:", `${file} has the advanced label`);
}

// Long model ids have no break opportunity, so the select label needs its own
// element to truncate — text-overflow cannot apply to an anonymous flex item.
test.assertIncludes(read("app.js"), 'label.className = "system-select-label"', "select labels get a real element");
test.assertIncludes(windows, ".system-select-button > .system-select-label", "that label is what truncates");

// --- Section chooser: one tablist, six era presentations ---------------------
// The Control Panel's tablist wears era-owned clothes through
// --control-chooser-* tokens. This is the one sanctioned structural recipe of
// the appearance system: Classic (the default token values) renders the
// System 4-6 cdev icon rail; Platinum pins the OS 8 tab sheet in its own
// token block; the Aqua family and Yosemite render icon toolbars; Liquid
// Glass a segmented capsule. DOM, tab order, wiring, and keyboard behavior
// never change per era.
const surfaces = read("styles/30-surfaces.css");
const appearance = read("styles/65-appearance-themes.css");
test.assertIncludes(html, 'class="system-tabs control-chooser"', "the Control Panel tablist is the era-clothed chooser variant");
for (const [tab, icon] of [["local", "localModel"], ["cloud", "cloudModel"], ["general", "control"], ["strip", "controlStrip"]]) {
  test.assertMatches(
    html,
    new RegExp(`data-control-tab="${tab}"><span class="sys-icon" data-system-icon="${icon}"`),
    `the ${tab} section carries its ${icon} object icon`
  );
}
test.assertMatches(html, /control-chooser-label" data-i18n=/, "labels translate on their own span so the icon survives applyLanguage");
test.assertIncludes(foundation, "--control-chooser-direction: column;", "Classic's default chooser is the vertical cdev rail");
test.assertIncludes(foundation, "--control-settings-columns: 92px minmax(0, 1fr);", "the rail owns a fixed column beside the settings pane");
test.assertIncludes(surfaces, "flex-direction: var(--control-chooser-direction);", "the chooser consumes era tokens, not era selectors");
test.assertIncludes(appearance, "--control-chooser-item-radius: var(--tab-radius) var(--tab-radius) 0 0;", "Platinum pins the OS 8 tab sheet in its token block");
test.assertNotMatches(appearance, /body\[data-theme="classic"\]/, "Classic stays the foundation default — no classic-scoped selector");

test.finish();
