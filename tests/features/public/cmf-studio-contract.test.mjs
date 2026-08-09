// Public-safe CMF Studio contract: lazy module, supported device palette and
// export command registration, without private USDZ fixtures.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-cmf-studio");
const cmf = read("app/features/cmf-studio.js");
const actions = read("app/core/actions.js");
const manifest = read("scripts/runtime-manifest.mjs");

test.assertIncludes(manifest, '"app/features/cmf-studio.js"', "CMF Studio loads lazily");
test.assertIncludes(cmf, '"cmf-palette"', "CMF Studio owns a supported-device palette");
test.assertIncludes(cmf, "data-cmf-color-option", "CMF Studio palette entries are declarative");
test.assertIncludes(cmf, "cmf_color_", "CMF Studio palette labels come from translations");
test.assertIncludes(actions, '"open-cmf-studio"', "opening CMF Studio is a command");
test.assertIncludes(actions, '"cmf-export-usdz"', "exporting USDZ is a registered command");
test.assertIncludes(actions, '"cmf-view-front"', "changing device views is a registered command");

test.finish();
