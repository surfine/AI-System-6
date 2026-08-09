// Accessibility contract: icon-only buttons always carry an accessible name,
// and the three release appearances keep keyboard focus, disabled, and
// selected states that are not colour- or opacity-only.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("accessibility-contract");
const html = read("index.html");
const foundation = read("styles/00-foundation.css");
const windows = read("styles/10-windows.css");
const surfaces = read("styles/30-surfaces.css");
const liquidGlass = read("styles/70-liquid-glass.css");
const draftDeskCss = read("styles/91-draft-desk.css");

// Every button with empty visible text must declare an accessible name.
{
  const buttonPattern = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
  const issues = [];
  let match = null;
  while ((match = buttonPattern.exec(html))) {
    const tag = match[0];
    const inner = match[1];
    const visibleText = inner
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<img[^>]*>/g, "");
    // Any visible glyph (letters, digits, CJK, symbols, punctuation) is a
    // button's text; only a truly empty button needs an explicit name.
    const hasText = /\S/.test(visibleText);
    const hasName = /aria-label=/.test(tag)
      || /aria-labelledby=/.test(tag)
      || /data-i18n-aria-label=/.test(tag)
      || /data-i18n=/.test(tag)
      || /title=/.test(tag);
    if (!hasText && !hasName) {
      issues.push(tag.replace(/\s+/g, " ").slice(0, 120));
    }
  }
  test.assert(issues.length === 0, `every icon-only button has an accessible name${issues.length ? `: ${issues.join(" | ")}` : ""}`);
}

// Keyboard focus is visible in the release themes.
for (const [label, source] of [
  ["base windows", windows],
  ["foundation", foundation],
  ["surfaces", surfaces],
  ["Liquid Glass", liquidGlass],
]) {
  test.assert(source.includes(":focus-visible"), `${label} CSS defines visible keyboard focus`);
}

// Disabled states carry more than opacity (border/colour tokens exist).
test.assertIncludes(foundation, "--clio-file-chip-disabled-border", "disabled controls keep a border signal");
test.assertIncludes(foundation, "--clio-stage-view-disabled-border-color", "disabled controls keep a colour signal");

// Selected states carry a non-colour signal (border/background, not opacity).
test.assertMatches(surfaces, /\.system-help-list button\.is-selected\s*\{[\s\S]*?border|background/, "selected list rows carry a border or background signal");
test.assertMatches(draftDeskCss, /\[aria-selected="true"\][\s\S]*?background/, "selected Draft Desk tabs carry a background signal");

test.finish();
