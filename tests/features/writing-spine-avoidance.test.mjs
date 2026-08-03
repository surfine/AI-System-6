import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-spine-avoidance");
const windows = read("app/core/window-manager.js");
const profile = read("app/core/workspace-profile.js");
const session = read("app/core/working-session.js");
const wireup = read("app/core/wireup.js");

test.assertIncludes(
  windows,
  "function avoidWritingSpineOverlap(win",
  "one collision rule owns Writing Flow avoidance",
);
test.assertMatches(
  windows,
  /rectsOverlap\(winRect, spineRect, gap\)[\s\S]{0,260}?spineRect\.right - desktopRect\.left \+ gap/,
  "overlapping floating windows move beyond the panel's right edge",
);
test.assertMatches(
  profile,
  /syncWorkspaceProfileDom[\s\S]*scheduleWritingSpineAvoidance\(\)/,
  "opening Writing Studio reflows windows that were already on the desk",
);
test.assertMatches(
  windows,
  /reusedFinderFrame[\s\S]{0,180}?avoidWritingSpineOverlap\(win\)/,
  "Finder replacements cannot reuse a pre-Studio frame underneath the panel",
);
test.assertIncludes(
  session,
  "avoidWritingSpineOverlap(win)",
  "restored window frames are checked against the visible panel",
);
test.assertIncludes(
  wireup,
  "avoidWritingSpineOverlap?.(win);",
  "a manually dragged window lands clear of the panel",
);
test.assertMatches(
  windows,
  /win\.dataset\.zoomed = "false";\s*avoidWritingSpineOverlap\(win\)/,
  "restoring a zoomed window also honors the panel boundary",
);

test.finish();
