// Public-safe Cover Glass contract: lazy renderer behind a window command.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-liquid-cover");
const actions = read("app/core/actions.js");
const manifest = read("tooling/runtime-manifest.mjs");
const cover = read("app/features/liquid-cover.js");

test.assertIncludes(manifest, '"app/features/liquid-cover.js"', "Cover Glass loads lazily");
test.assertIncludes(cover, '"open-liquid-cover"', "opening Cover Glass is a command");
test.assertIncludes(cover, "LIQUID_COVER_COMMAND_NAMES", "Cover Glass menu commands are registered with the application");
test.assertIncludes(actions, 'registerLazyCommand?.("open-liquid-cover"', "Cover Glass opens through a lazy runtime command");
test.assertIncludes(cover, "render", "Cover Glass renders a visual surface");
test.assertIncludes(cover, "export", "Cover Glass exports its result");

test.finish();
