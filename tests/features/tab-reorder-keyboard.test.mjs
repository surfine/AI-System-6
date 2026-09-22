// Reordering open documents is not drag-only.
//
// The interaction audit's drag queue carried two entries for this surface
// (project-disk.js:item and project-disk.js:wrap) because the only way to put
// tabs in a different order was to drop one on its neighbour. It was the one
// entry in that queue with no alternative anywhere in the product, so the
// keyboard path is asserted here: Option-Left/Right on the focused tab has to
// move it one place through the same onMove() the drop handler calls.
//
// This runs the real function out of the booted application rather than reading
// its source: the thing that can regress is the arithmetic (which neighbour,
// which direction, what happens at the ends), and a substring would not see it.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("tab-reorder-keyboard");
const source = read("app/features/project-disk.js");
const vmw = createAppBootVm();
const ctx = vmw.context;
test.assert(
  typeof ctx.bindTabReorderKeys === "function",
  "the tab reorder helper is part of the eager application bundle",
);

// Both renderings of the same tab state have to carry it: the vertical rail
// and the compact title-bar stack.
test.assert(
  source.includes("bindTabReorderKeys(open, tab, visibleTabs, onMove)")
  && source.includes("bindTabReorderKeys(button, tab, visibleTabs, onMove)"),
  "both the popover stack and the tab rail bind the keyboard reorder",
);

function run(tabs, index, event) {
  // A real element from the harness's own DOM: the helper wires a listener onto
  // it and reads an attribute back, and the shim is what the rest of the eager
  // suite already drives.
  const handle = ctx.document.createElement("button");
  const moves = [];
  let prevented = 0;
  const tab = tabs[index];
  ctx.bindTabReorderKeys(handle, tab, tabs, (from, to) => moves.push([from, to]));
  handle.dispatchEvent({
    type: "keydown",
    key: event.key,
    altKey: Boolean(event.altKey),
    preventDefault: () => { prevented += 1; },
  });
  return { moves, prevented, handle };
}

const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];

const right = run(tabs, 0, { key: "ArrowRight", altKey: true });
test.assert(
  right.moves.length === 1 && right.moves[0][0] === "a" && right.moves[0][1] === "b",
  "Option-Right moves the focused tab onto its right-hand neighbour",
);
test.assert(right.prevented === 1, "the move claims the key so the page does not also scroll");

const left = run(tabs, 2, { key: "ArrowLeft", altKey: true });
test.assert(
  left.moves.length === 1 && left.moves[0][0] === "c" && left.moves[0][1] === "b",
  "Option-Left moves it onto its left-hand neighbour",
);

const atStart = run(tabs, 0, { key: "ArrowLeft", altKey: true });
test.assert(atStart.moves.length === 0, "the first tab does not move left out of the strip");
const atEnd = run(tabs, 2, { key: "ArrowRight", altKey: true });
test.assert(atEnd.moves.length === 0, "the last tab does not move right out of the strip");

const plain = run(tabs, 0, { key: "ArrowRight", altKey: false });
test.assert(plain.moves.length === 0, "a plain arrow still only moves focus, not the tab");

test.assert(
  right.handle.getAttribute("aria-keyshortcuts") === "Alt+ArrowLeft Alt+ArrowRight",
  "the tab announces the shortcut it answers to",
);

test.finish();
