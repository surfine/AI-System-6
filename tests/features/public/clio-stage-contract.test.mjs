// Public-safe ClioStage contract: Markdown → slide surface with present and
// export actions. Deep visual fidelity stays in maintainer tests.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-clio-stage");
const html = read("index.html");
const actions = read("app/core/actions.js");
const manifest = read("scripts/runtime-manifest.mjs");

test.assertIncludes(manifest, '"app/features/slides-export.js"', "ClioStage loads lazily");
test.assertIncludes(manifest, '"app/features/clio-stage.js"', "ClioStage is a lazy module");
test.assertIncludes(actions, '"open-clio-stage": openClioStageApp', "opening ClioStage is a command");
test.assertIncludes(actions, "generateMarpAndOpenClioStageFromMenu", "ClioStage consumes Markdown");
test.assertIncludes(html, 'data-window="clioStage"', "ClioStage has a window surface");
test.assertIncludes(html, 'id="clio-stage-import-files"', "ClioStage exposes an import control");
test.assertIncludes(html, 'id="clio-stage-slide-view"', "ClioStage exposes a slide presentation view");

test.finish();
