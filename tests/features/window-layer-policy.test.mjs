// WM1 · Window layer bands and focus order.
//
// Pin is stack ownership, not a use: a pinned window stays painted above
// ordinary windows while they keep the keyboard, and last-used order must not
// be rewritten by a raise. These run the real window core in the boot VM.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("window-layer-policy");
const vmw = createAppBootVm();

await vmw.context.openWindow("control");
await vmw.context.openWindow("calculator");
await vmw.waitFor(() => vmw.run('!!getWindow("control") && !!getWindow("calculator")'));

const z = (name) => Number(vmw.run(`getWindow("${name}").style.zIndex || 0`));

// A pinned window stays above ordinary windows that take focus afterwards.
vmw.run('setWindowPinned(getWindow("control"), true)');
vmw.run('focusWindow(getWindow("calculator"))');
vmw.run('focusWindow(getWindow("control"))');
vmw.run('focusWindow(getWindow("calculator"))');
test.assert(
  z("control") > z("calculator"),
  "focusing a plain window never buries a pinned one, so pin is real stack ownership",
);
test.assert(
  vmw.run('getWindow("calculator").classList.contains("is-active")'),
  "the plain window still takes the keyboard: pin is not a forced activation",
);

// Focus rank advances only on a real focus, and pinning must not touch it.
vmw.run('focusWindow(getWindow("control"))');
const rankControl = Number(vmw.run('windowFocusRank(getWindow("control"))'));
vmw.run('focusWindow(getWindow("calculator"))');
const rankCalculator = Number(vmw.run('windowFocusRank(getWindow("calculator"))'));
test.assert(rankCalculator > rankControl, "a later real focus has the higher last-used rank");
vmw.run('setWindowPinned(getWindow("control"), false)');
test.assert(
  Number(vmw.run('windowFocusRank(getWindow("control"))')) === rankControl,
  "pin and unpin do not advance last-used order — only a real focus does",
);

// A protected system sheet keeps its own band through an ordinary compaction.
await vmw.context.openWindow("about");
await vmw.waitFor(() => vmw.run('!!getWindow("about")'));
vmw.run('focusWindow(getWindow("about"))');
const aboutZ = Number(vmw.run('getWindow("about").style.zIndex || 0'));
test.assert(aboutZ > 8990, "About is focused above every ordinary window, out of the normal band");
vmw.run("compactWindowLayerStack()");
test.assert(
  Number(vmw.run('getWindow("about").style.zIndex || 0')) === aboutZ,
  "compaction never pulls a protected system sheet down into the normal range",
);

// --- hardening: reserved layers are by role, not by number ------------------
// A big numeric request alone must never lift an ordinary window into the
// pinned or priority bands: menus and system modals live above those.
vmw.run('setWindowLayerZ(getWindow("calculator"), 99999)');
test.assert(
  z("calculator") < 9000,
  "an ordinary window cannot ask its way into the pinned or priority bands",
);
test.assert(
  vmw.run('reservedWindowLayerZ(getWindow("calculator")) === null'),
  "an ordinary floating window reserves no layer at all",
);

// A full-screen window owns the priority band by role. A later ordinary raise
// or compaction must put it back on its declared layer, never clamp it down.
vmw.run('getWindow("calculator").classList.add("is-fullscreen")');
test.assert(
  Number(vmw.run('reservedWindowLayerZ(getWindow("calculator"))')) === Number(vmw.run('windowPriorityZ')),
  "a full-screen window reserves the priority band",
);
vmw.run('setWindowLayerZ(getWindow("calculator"), 12)');
test.assert(
  z("calculator") >= Number(vmw.run('windowPriorityZ')),
  "a reserved layer is re-declared on raise, not clamped back into the ordinary band",
);
vmw.run("compactWindowLayerStack()");
test.assert(
  z("calculator") >= Number(vmw.run('windowPriorityZ')),
  "ordinary compaction leaves a reserved layer untouched",
);
vmw.run('getWindow("calculator").classList.remove("is-fullscreen")');
test.assert(
  vmw.run('windowUsesCssLayer(getWindow("calculator")) === false'),
  "a window outside the writing route is not a CSS-owned layer",
);

test.finish();
