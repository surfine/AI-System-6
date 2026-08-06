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
test.assertIncludes(menus, 'menuItem("toggle-liquid-glass", "liquid_glass")', "Special menu keeps the manual appearance switch");
test.assertIncludes(dictionary, 'id: "liquid-glass-appearance"', "System Help documents the manual Liquid Glass switch");
test.assertIncludes(dictionary, "Special → Liquid Glass", "Help explains that the same running workspace changes appearance");

test.finish();
