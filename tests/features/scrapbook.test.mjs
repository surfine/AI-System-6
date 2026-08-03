// Scrapbook keeps user-curated project material. Users can add a blank
// project-scoped scrap directly, without routing through Reader, ClioTalk, or
// another app first.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("scrapbook");
const scrapbook = read("app/features/scrapbook.js");
const app = readAppSurface(["app/core/actions.js", "app/features/scrapbook.js"]);
const html = read("index.html");
const responsive = read("styles/60-responsive.css");

test.assertIncludes(app, 'data-action="new-note"', "Scrapbook exposes a direct New Scrap action");
test.assertIncludes(app, 'data-i18n="new_scrap"', "direct Scrapbook creation has a localized visible label");
test.assertIncludes(app, '"new-note": () => createScrap(null, "")', "New Scrap creates a blank project-scoped scrap");
test.assertIncludes(scrapbook, "if (!getActiveProject())", "manual scraps still require a mounted Project Hard Disk");
test.assertIncludes(scrapbook, "source: options.source || null", "manual scraps can exist without a Reader or app source");
test.assertIncludes(html, 'class="visually-hidden" for="scrapbook-question"', "Scrapbook keeps its Ask label accessible without taking a content row");
test.assertIncludes(responsive, ".scrap-list:has(.scrap-empty-card)", "an empty phone Scrapbook gives space back to the editor");
test.assertIncludes(html, '<form id="scrapbook-ask-form" class="ask-bar" data-ask-source="scrapbook">', "Scrapbook asks through the shared ask bar");
test.assertIncludes(scrapbook, 't("ask_scope_scraps", selected.length) : t("ask_scope_all_scraps", count)', "the Scrapbook ask bar counts the clips the question will actually carry");

test.finish();
