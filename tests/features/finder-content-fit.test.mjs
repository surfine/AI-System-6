import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-content-fit");
const windowManager = read("app/core/window-manager.js");
const frameBars = read("app/core/window-frame-bars.js");
const windows = read("styles/10-windows.css");
const icons = read("styles/40-icons.css");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(
  windowManager,
  "function fitFinderWindowToContents(win, options = {})",
  "Finder owns one content-aware opening-size calculation",
);
test.assertIncludes(
  windowManager,
  "if (shouldPlaceWindow && isFinderContentWindow(win))",
  "content fitting runs only on a fresh system-placed Finder window",
);
test.assertIncludes(
  windowManager,
  'win.dataset.userPositioned !== "true"',
  "a user-sized Finder window is not automatically fitted again",
);
test.assertIncludes(
  windowManager,
  "clearFinderContentFit(win, { preserveSize: true })",
  "starting a grow-box drag transfers size ownership back to the user",
);
test.assertMatches(
  windowManager,
  /if \(isFinderContentWindow\(win\)\) \{[\s\S]*fitFinderWindowToContents\(win, \{ force: true \}\)/,
  "the Finder zoom box fits content instead of maximizing blindly",
);
test.assertIncludes(
  windows,
  ".window.is-finder-content-fit {",
  "content-fit geometry is class and token driven",
);
test.assertIncludes(
  frameBars,
  "function installFinderContinuation(win, selector)",
  "Finder overflow is measured from the production scroll surface",
);
test.assertIncludes(
  frameBars,
  "scroller.scrollHeight - scroller.clientHeight",
  "continuation visibility follows real overflow after resize",
);
test.assertIncludes(
  frameBars,
  "new ResizeObserver(sync).observe(win)",
  "continuation state is recomputed when the user resizes the window",
);
test.assertIncludes(
  foundation,
  "--finder-continuation-display: none",
  "Classic leaves continuation semantics to its System 6 frame bars",
);
test.assertIncludes(
  liquid,
  "--finder-continuation-display: inline-flex",
  "Liquid Glass paints the same overflow state without a track",
);
test.assertIncludes(
  icons,
  ".finder-continuation.is-visible {",
  "the edge cue is exposed only while more content exists",
);
test.assertIncludes(en, 'finder_more_below: "More items below"', "English labels the continuation control");
test.assertIncludes(zh, 'finder_more_below: "下方还有项目"', "Chinese labels the continuation control");

test.finish();
