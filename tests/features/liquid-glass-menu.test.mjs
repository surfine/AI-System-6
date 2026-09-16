import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-glass-menu");
const liquid = read("styles/70-liquid-glass.css");
const menus = read("app/data/menus.js");
const dictionary = read("app/data/system-dictionary.js");

test.assertIncludes(
  liquid,
  "--liquid-disabled-control-bg: transparent;",
  "disabled menu rows stay flat instead of becoming glass buttons",
);
test.assertIncludes(
  liquid,
  "--liquid-disabled-control-shadow: none;",
  "disabled menu rows do not render individual raised cards",
);
test.assertIncludes(
  liquid,
  "--menu-shortcut-color: var(--liquid-disabled-control-fg);",
  "disabled menu shortcuts use the same muted state as their labels",
);
test.assertIncludes(
  liquid,
  "background: var(--liquid-disabled-control-bg);",
  "the shared disabled-control rule reads its surface from a scoped token",
);
for (const themeId of ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"]) {
  test.assertIncludes(menus, `themeId: "${themeId}"`, `Special → Appearance exposes ${themeId}`);
}
test.assertNotIncludes(menus, 'themeId: "unknown-theme"', "Special → Appearance never fabricates an unregistered theme");
test.assertIncludes(menus, 'submenu("appearance", appearanceItems)', "Special owns one Appearance submenu instead of a second theme system");

// The system's own glass material is applied to a whole layer, so the menu
// bar's small labels arrive washed and soft inside it — the report that came
// from an iPhone, where the bar is the top strip of the screen. The bar is the
// one surface that keeps the appearance's own material; windows, popovers and
// the modals still hand theirs to the system. No test browser supports
// -apple-visual-effect (CSS.supports returns false in both Chromium and
// WebKit), so the branch is held here by its selector list: this is the only
// place that can see it.
test.assertIncludes(
  liquid,
  "@supports (-apple-visual-effect: -apple-system-glass-material) {\n  body.use-liquid-glass .window,\n  body.use-liquid-glass .menu-popover,",
  "the system glass material is offered to windows and popovers, not to the menu bar",
);
test.assertIncludes(
  liquid,
  "body.use-liquid-glass .menu-bar {\n    background: var(--menu-bar-bg);",
  "the menu bar keeps the appearance's own material in that branch",
);

test.assertIncludes(dictionary, 'id: "liquid-glass-appearance"', "System Help keeps the stable Appearance dictionary record id");
test.assertIncludes(dictionary, "Special → Appearance", "Help explains that the same running workspace changes appearance");
test.assertIncludes(dictionary, "same running workspace", "Help explains that Appearance never opens a parallel workspace");

test.finish();
