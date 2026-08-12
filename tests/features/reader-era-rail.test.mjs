// Reader keeps one TDI/status model while historical appearances repaint the
// shared source-rail and placard roles through tokens only.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reader-era-rail");
const index = read("index.html");
const foundation = read("styles/00-foundation.css");
const windows = read("styles/10-windows.css");
const readerStyles = read("styles/20-reader-docmap.css");
const appearance = read("styles/65-appearance-themes.css");
const aqua = read("styles/67-aqua-appearance.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(index, 'class="status-bar-leading status-bar-placard" id="reader-status"', "Reader maps its confirmed leading receipt onto the shared placard role");
test.assertIncludes(index, 'class="tdi-rail tdi-source-rail reader-rail"', "Reader identifies its existing TDI rail as a source rail without forking the document model");
test.assertIncludes(index, 'class="tdi-source-rail-label" data-i18n="reader_sources_label" aria-hidden="true"', "the Snow Leopard source-list heading stays decorative and shares the stable DOM");
test.assertIncludes(foundation, "--status-placard-border:", "Classic owns an inert placard default");
test.assertIncludes(foundation, "--tdi-rail-bg:", "Classic owns the shared TDI rail material default");
test.assertIncludes(windows, ".status-bar-placard {", "the shared status recipe consumes placard tokens");
test.assertIncludes(readerStyles, ".tdi-source-rail-label {", "the shared rail stylesheet owns the source-list heading recipe");
test.assertIncludes(appearance, "--status-placard-shadow:", "Platinum supplies the inset placard material");
test.assertIncludes(appearance, "--tdi-tab-active-bg: var(--selection-bg);", "Platinum reuses its native lavender list selection");
test.assertIncludes(aqua, "--tdi-rail-shadow: inset 1px 1px 0 #ffffff, 2px 2px 4px", "Jaguar gives the fixed source rail Aqua drawer depth without motion");
test.assertIncludes(aqua, "--tdi-source-label-display: block;", "Snow Leopard reveals the compact source-list heading");
test.assertIncludes(aqua, "--tdi-tab-active-bg: var(--sidebar-selection-bg);", "Snow Leopard reuses the measured source-list selection painter");
test.assertNotMatches(appearance, /body\[data-theme="platinum"\][^{]*(?:tdi-source-rail|status-bar-placard)/, "Platinum remains token-only for the new Reader roles");
test.assertNotMatches(aqua, /body\[data-theme="(?:aqua|snow-leopard)"\][^{]*(?:tdi-source-rail|status-bar-placard)/, "Aqua-family appearances remain token-only for the new Reader roles");
test.assertIncludes(en, 'reader_sources_label: "Sources"', "English includes the source-list heading");
test.assertIncludes(zh, 'reader_sources_label: "来源"', "Chinese includes the source-list heading");

test.finish();
