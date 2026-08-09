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
for (const themeId of ["classic", "platinum", "liquid-glass"]) {
  test.assertIncludes(menus, `themeId: "${themeId}"`, `Special → Appearance exposes ${themeId}`);
}
test.assertNotIncludes(menus, 'themeId: "aqua"', "Special → Appearance keeps research appearances out of the release menu");
test.assertIncludes(menus, 'submenu("appearance", appearanceItems)', "Special owns one Appearance submenu instead of a second theme system");
test.assertIncludes(dictionary, 'id: "liquid-glass-appearance"', "System Help keeps the stable Appearance dictionary record id");
test.assertIncludes(dictionary, "Special → Appearance", "Help explains that the same running workspace changes appearance");
test.assertIncludes(dictionary, "same running workspace", "Help explains that Appearance never opens a parallel workspace");

test.finish();
