// Memory Cards is a direct matching game: the face carries only color and a
// recognizable object glyph. The visible shell stays at the original minimum.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("memory-cards");
const html = read("index.html");
const config = read("app/core/config.js");
const feature = read("app/features/memory-cards.js");
const windowManager = read("app/core/window-manager.js");
const foundation = read("styles/00-foundation.css");
const surfaces = read("styles/30-surfaces.css");
const icons = read("styles/40-icons.css");
const responsive = read("styles/60-responsive.css");
const liquid = read("styles/70-liquid-glass.css");
const sprite = read("assets/icons/memory-cards.svg");

test.assertNotIncludes(html, "memory-cards-scoreboard", "moves and time need no extra score container");
test.assertNotIncludes(html, "memory-cards-stat-separator", "moves and time need no decorative separators");
test.assertNotIncludes(html, "memory-cards-footer", "there is no second visible information panel");
test.assertNotIncludes(html, "memory-cards-best", "best-score copy does not compete with the cards");
test.assertIncludes(html, 'id="memory-cards-moves"', "moves remain visible");
test.assertIncludes(html, 'id="memory-cards-time"', "time remains visible");
test.assertIncludes(html, 'id="memory-cards-status"', "the only help is one short status line");
test.assertNotIncludes(html, 'id="memory-cards-new-game"', "the shell has no redundant reshuffle control");

test.assertIncludes(feature, "function buildMemoryCardsBoard()", "one function creates the stable card DOM");
test.assertIncludes(
  feature,
  "if (memoryCardsBoardEl.children.length !== memoryCards.length) buildMemoryCardsBoard();",
  "ordinary renders update state instead of rebuilding all cards",
);
test.assertIncludes(feature, "function handleMemoryCardsKeydown(event)", "the board owns roving keyboard navigation");
for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
  test.assertIncludes(feature, `event.key === "${key}"`, `${key} is supported`);
}
test.assertIncludes(feature, "function readMemoryCardsBest()", "stored scores are parsed through one safe boundary");
test.assertIncludes(feature, "} catch {", "invalid stored scores cannot break the game");
test.assertNotIncludes(feature, "showSystemModal(", "completion is inline and never interrupts play with an alert");
test.assertNotIncludes(feature, "partsByIcon", "feature code no longer assembles icons from CSS fragments");
test.assertNotIncludes(feature, "sfSymbol", "hidden platform-symbol fallbacks are gone");

test.assertIncludes(
  read("app/core/window-registry.js"),
  'if (!memoryCardsHasGame()) newMemoryCardsGame();',
  "closing and reopening preserves the current game",
);
test.assertIncludes(windowManager, "pauseMemoryCardsGame();", "closing the window pauses its timer");

const colorIds = ["blue", "green", "yellow", "red"];
for (const color of colorIds) {
  test.assertIncludes(config, `color: "${color}"`, `${color} is a deliberate pair color`);
  test.assertIncludes(surfaces, `.memory-card.is-${color}`, `${color} has a card painter`);
}

const glyphIds = [
  "apple-ii",
  "lisa",
  "mac-128k",
  "mac-portable",
  "powerbook-100",
  "newton",
  "quicktake",
  "laserwriter",
  "applecd-sc",
  "keyboard",
  "adb-mouse",
  "pippin",
];
for (const glyph of glyphIds) {
  test.assertIncludes(sprite, `id="memory-card-${glyph}"`, `${glyph} has a redrawn glyph`);
}
test.assertIncludes(icons, ".memory-card-glyph", "the shared icon stylesheet owns glyph rendering");
test.assertIncludes(foundation, "--memory-card-back-bg:", "card material starts from shared tokens");
test.assertIncludes(liquid, "--memory-card-back-bg:", "Liquid Glass swaps the same material token");
test.assertIncludes(surfaces, "--memory-cards-columns: 6", "desktop uses a six-column board");
test.assertIncludes(responsive, "--memory-cards-columns: 4", "narrow layouts keep a usable four-column board");
test.assertIncludes(surfaces, ".memory-card:nth-child(12n + 1)", "the original fixed irregular card rhythm is preserved");
test.assertIncludes(surfaces, "--card-tilt: -2.3deg", "the irregularity starts from the original restrained angle");
test.assertNotIncludes(feature, 'style.setProperty("--card-tilt"', "card geometry stays in CSS rather than inline layout");

test.finish();
