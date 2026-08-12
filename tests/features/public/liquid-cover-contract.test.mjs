// Public-safe Cover Glass contract: lazy renderer behind a window command.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-liquid-cover");
const actions = read("app/core/actions.js");
const manifest = read("tooling/runtime-manifest.mjs");
const cover = read("app/features/liquid-cover.js");

test.assertIncludes(manifest, '"app/features/liquid-cover.js"', "Cover Glass loads lazily");
test.assertIncludes(actions, '"open-liquid-cover": openLiquidCover', "opening Cover Glass is a command");
test.assertIncludes(actions, "window.AISystem6LiquidCover?.open", "Cover Glass opens through its public API");
test.assertIncludes(cover, "render", "Cover Glass renders a visual surface");
test.assertIncludes(cover, "export", "Cover Glass exports its result");

test.finish();
