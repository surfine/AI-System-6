// Control Panel used to be one long scroll; on a phone its close box could end
// up unreachable below the fold. It is now three tabs (Local Model / Cloud
// Model / General), reusing the same static tab-switch shape as Start Here and
// the Liquid Cover inspector — no new pattern per DESIGN.md.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("control-panel-tabs");
const html = read("index.html");
const windows = read("styles/10-windows.css");
const responsive = read("styles/60-responsive.css");
const persistence = read("app/core/persistence-status.js");

for (const name of ["local", "cloud", "general"]) {
  test.assertIncludes(html, `data-control-tab="${name}"`, `a tab exists for ${name}`);
  test.assertIncludes(html, `data-control-panel="${name}"`, `a panel exists for ${name}`);
}
test.assertIncludes(persistence, "function setControlTab(", "one function owns tab switching");
test.assertIncludes(persistence, "function wireControlTabs(", "tabs are wired at startup");

// The window used to force a fixed portrait height regardless of content,
// leaving a block of dead space under a short tab.
test.assertIncludes(responsive, "height: auto;", "Control Panel/Chooser height follows content");
test.assertNotIncludes(
  responsive,
  "height: min(82vh, calc(100vh - var(--system-menu-height, 26px) - 20px));\n    max-height:",
  "the old fixed portrait height is gone"
);
test.assertIncludes(
  persistence,
  'win.style.height = "";',
  "switching tabs clears a stale saved height so the window can shrink"
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

// A window-level accessory-cascade path (meant for the desktop) was stamping
// inline left/top/width on Control Panel and Chooser even in portrait, where a
// dedicated centered-dialog rule already positions them — inline always wins,
// so the CSS never had a chance.
const windowManager = read("app/core/window-manager.js");
test.assertIncludes(
  windowManager,
  'isPortraitDocumentFlow() && (win?.classList.contains("control-panel") || win?.classList.contains("chooser-panel"))',
  "the desktop cascade steps aside for these two windows in portrait"
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

test.finish();
