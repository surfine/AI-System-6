import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

// The board follows the design contract, not a maintainer's memory.
//
// DESIGN.md lists the primitives that carry all six appearances — the ones an
// application inherits every era from. That list is the reason Theme Lab
// exists, so it is also the list the board must show: add a row there and this
// test says the specimen is missing, which is the cheapest possible reminder.
// It checks presence, not markup, because the fidelity boards sample the
// specimens by selector and generating them would re-point every crop.
const test = createFeatureTest("theme-lab-primitive-coverage");
const readRepo = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const design = readRepo("docs/design/DESIGN.md");
const lab = read("app/features/theme-lab.js");
const index = read("index.html");
const board = `${lab}\n${index}`;

const table = design.slice(design.indexOf("These primitives carry all six appearances already"));
const rows = table.slice(0, table.indexOf("\n\nThe reverse is the rule"));
const primitives = [...rows.matchAll(/`(\.[a-z-]+)`/g)].map((match) => match[1]);

test.assert(primitives.length >= 15, `the design contract lists the shared primitives (found ${primitives.length})`);

// Two are the window itself, which the board shows by being a window, and two
// are the frame's own parts; the rest have to appear as specimens.
const shownByBeingAWindow = new Set([".window", ".title-bar", ".details-bar", ".window-pane"]);

for (const primitive of primitives) {
  if (shownByBeingAWindow.has(primitive)) continue;
  const className = primitive.slice(1);
  const present = new RegExp(`class="[^"]*\\b${className}\\b`).test(board)
    || new RegExp(`"${className}[ "]`).test(board)
    || board.includes(`${className}"`);
  test.assert(present, `Theme Lab shows ${primitive}, which the design contract says carries every appearance`);
}

test.finish();
