// "Use line-art icons in other appearances" setting contract.
//
// A user can opt the whole desk into the Classic one-bit glyph language across
// every non-Classic appearance without switching to Classic itself. The toggle
// lives in Control Panel > General > Advanced, persists with the rest of the
// desk settings, and re-paints already-rendered icons when flipped.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("classic-line-icons-setting");
const html = read("index.html");
const icons = read("app/core/system-icons.js");
const persistence = read("app/core/persistence-status.js");
const wireup = read("app/core/wireup.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(html, 'id="classic-line-icons"', "Control Panel Advanced exposes the line-art toggle");
test.assertIncludes(html, 'data-i18n="classic_line_icons"', "the toggle uses the shared i18n key");
test.assertIncludes(en, "classic_line_icons:", "English copy exists for the setting");
test.assertIncludes(zh, "classic_line_icons:", "Chinese copy exists for the setting");

test.assertIncludes(icons, "function setClassicLineArtEverywhere(", "a setter owns the line-art-everywhere flag");
test.assertIncludes(icons, "classicLineArtEverywhere()", "the flag is read at render time");
test.assertIncludes(icons, "classicLineArtImage(iconId)", "every semantic object maps to its Classic line-art SVG");
test.assertIncludes(icons, "if (classicLineArtEverywhere())", "the era painters honor the flag");

test.assertIncludes(persistence, "classicLineIcons: classicLineIconsInput.checked", "the setting is persisted with the desk");
test.assertIncludes(
  persistence,
  "setClassicLineArtEverywhere(settings.classicLineIcons)",
  "the setting is restored before the first icon paint",
);

test.assertIncludes(wireup, "setClassicLineArtEverywhere(classicLineIconsInput.checked)", "toggling updates the live flag");
test.assertIncludes(wireup, "hydrateSystemIcons()", "toggling re-paints already-rendered icons");

test.finish();
