// Scrapbook keeps user-curated project material. Users can add a blank
// project-scoped scrap directly, without routing through Reader, ClioTalk, or
// another app first.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("scrapbook");
const scrapbook = read("app/features/scrapbook.js");
const app = readAppSurface(["app/core/actions.js", "app/features/scrapbook.js"]);

test.assertIncludes(app, 'data-action="new-note"', "Scrapbook exposes a direct New Scrap action");
test.assertIncludes(app, 'data-i18n="new_scrap"', "direct Scrapbook creation has a localized visible label");
test.assertIncludes(app, '"new-note": () => createScrap(null, "")', "New Scrap creates a blank project-scoped scrap");
test.assertIncludes(scrapbook, "if (!getActiveProject())", "manual scraps still require a mounted Project Hard Disk");
test.assertIncludes(scrapbook, "source: options.source || null", "manual scraps can exist without a Reader or app source");

test.finish();
