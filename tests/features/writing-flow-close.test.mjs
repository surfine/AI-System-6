// The Writing Flow has two verbs, and they are not one another (owner,
// 2026-09-25, D1 = A).
//
// Shade is the WindowShade every era already has: the palette rolls up to its
// title bar where it stood, by a title-bar double-click or Platinum's collapse
// box. Close is the close box that a NeXTSTEP panel and a Mac OS 9 utility
// window draw: the palette leaves the desk altogether. Only those two eras draw
// a close box, but the state survives a change of appearance and a reload, so
// the way back is a command that every era can reach: an Apple menu row here,
// Tools > Writing Flow... under NeXTSTEP.
//
// The failures this pins are the ones a writer would meet: a palette closed in
// NeXTSTEP that no Mac-era menu can bring back; a close that forgets itself on
// reload; a close box that merely shades (so the two verbs collapse into one);
// and eras without a close box suddenly drawing one.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-flow-close");
const vmw = createAppBootVm();

const panelHas = (cls) => vmw.run(`document.querySelector(".writing-spine-panel").classList.contains(${JSON.stringify(cls)})`);
const reopenHidden = () => vmw.run('document.querySelector(\'[data-action="show-writing-flow"]\').classList.contains("is-hidden")');

// 1. The markup: both controls ship hidden, so the ten eras that draw neither
//    look exactly as they did; the eras that draw them unhide them in their own
//    lazy sheets.
test.assert(
  vmw.run('document.querySelector(".spine-title-row > .spine-close-box")?.hidden === true'),
  "the Writing Flow's close box is in the title row and hidden by default",
);
test.assert(
  vmw.run('document.querySelector(".spine-title-row > .spine-shade-toggle")?.hidden === true'),
  "its collapse box is in the title row and hidden by default",
);
test.assert(reopenHidden(), "the Apple menu offers no Show Writing Flow while the palette is on the desk");

// 2. Close puts the palette away and nothing else: it is not a shade.
// The desk's single [data-action] delegate dispatches the press; the boot VM
// does not bubble synthetic clicks to document, so the contract presses the
// action the button names.
const pressTitleRow = (selector) => vmw.context.handleAction(vmw.run(`document.querySelector(${JSON.stringify(selector)}).dataset.action`));
await pressTitleRow(".spine-close-box");
test.assert(panelHas("is-closed"), "the close box closes the Writing Flow");
test.assert(!panelHas("is-shaded"), "closing does not shade it: the two verbs stay two");
test.assert(!reopenHidden(), "once closed, the Apple menu offers the way back");

// 3. It is remembered, like the shade.
const saved = vmw.run("JSON.stringify(captureWritingFlowWorkingSession())");
test.assert(JSON.parse(saved).toolsClosed === true, "the working session records the closed palette");
vmw.run('document.querySelector(".writing-spine-panel").classList.remove("is-closed")');
vmw.run(`restoreWritingFlowWorkingSession(${saved})`);
test.assert(panelHas("is-closed"), "and a restored session closes it again");
test.assert(!reopenHidden(), "with the Apple menu row showing after the restore too");

// 4. The way back works from an era that has no close box of its own.
await vmw.context.AISystem6Theme.applyTheme("classic", { announce: false, persist: false });
await vmw.context.handleAction("show-writing-flow");
test.assert(!panelHas("is-closed"), "Show Writing Flow brings the palette back in Classic, an era with no close box");
test.assert(reopenHidden(), "and the row goes away again");

// 5. The collapse box is the shade, the same state the title-bar double-click
//    toggles, with its accessible state kept in step.
await pressTitleRow(".spine-shade-toggle");
test.assert(panelHas("is-shaded"), "the collapse box shades the Writing Flow");
test.assert(
  vmw.run('document.querySelector(".spine-shade-toggle").getAttribute("aria-expanded")') === "false",
  "and says so to assistive technology",
);
await pressTitleRow(".spine-shade-toggle");
test.assert(!panelHas("is-shaded"), "a second press unshades it");

// 6. A closed palette takes no room: CSS removes it from layout, and every
//    reader of its rectangle already treats a zero-width palette as absent.
const windowsCss = read("apps/desktop/styles/10-windows.css");
test.assertMatches(
  windowsCss,
  /\.writing-spine-panel\.is-closed\s*\{\s*display:\s*none;/,
  "a closed Writing Flow is display: none",
);
test.assertIncludes(
  read("apps/desktop/styles/00-foundation.css"),
  "body:has(.writing-spine-panel:not(.is-hidden, .is-closed))",
  "the Bonsai width that makes room for the palette stops doing so once it is closed",
);

test.finish();
