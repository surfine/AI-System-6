import { readFileSync } from "node:fs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("Get Info icon stage");
const html = readFileSync("apps/desktop/index.html", "utf8");
const runtime = readFileSync("apps/desktop/app/core/desktop-runtime.js", "utf8");
const surfaces = readFileSync("apps/desktop/styles/30-surfaces.css", "utf8");

test.assertIncludes(html, 'class="info-icon-stage"', "File Info owns an object-artwork stage");
test.assertIncludes(html, 'id="info-file-icon" class="info-icon-artwork"', "the existing live icon target sits inside the stage");
test.assertIncludes(runtime, "displaySize: 128", "Get Info asks the icon painter for the large display tier");
test.assertIncludes(runtime, "modernSourceSize: 128", "modern appearances use their authored 128px asset");
test.assertIncludes(runtime, "platinumSourceSize: 42", "Platinum keeps its authored 42px source instead of borrowing modern art");
test.assertIncludes(surfaces, ".info-icon-stage", "the stage geometry belongs to the shared Get Info surface layer");
test.assertIncludes(surfaces, "grid-template-columns: 112px minmax(0, 1fr)", "the object stage gets a stable column without hiding the name");
test.assertIncludes(surfaces, "var(--large-mini-icon-bg)", "the stage reuses the existing appearance material token");
test.assertIncludes(surfaces, "height: min(640px, calc(100vh - 48px))", "the taller artwork header does not trap the lower Get Info actions below a fixed 380px window");
test.assertMatches(surfaces, /\.info-pane\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/, "Get Info facts and object actions remain reachable in a bounded viewport");

test.finish();
