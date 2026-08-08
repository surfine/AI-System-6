// Creative labs keep their distinct task objects while sharing the current
// control-state, keyboard, theme, and surface contracts.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("creative-labs-control-reform");
const index = read("index.html");
const cmf = read("app/features/cmf-studio.js");
const bureaucracy = read("app/features/bureaucracy-meme.js");
const endfield = read("app/features/endfield-terminal.js");
const cmfStyles = read("styles/86-cmf-studio.css");
const bureaucracyStyles = read("styles/80-bureaucracy-meme.css");
const endfieldStyles = read("styles/90-endfield-terminal.css");
const foundationStyles = read("styles/00-foundation.css");
const liquidStyles = read("styles/70-liquid-glass.css");

// CMF Studio: one selected part plus one shared five-color palette.
test.assertIncludes(index, 'id="cmf-palette" role="group"', "CMF exposes one shared finish palette");
test.assertIncludes(index, 'id="cmf-parts" role="listbox"', "CMF exposes device parts as one selectable object list");
test.assertIncludes(cmf, 'let selectedPartId = "frame"', "CMF keeps one explicit selected part");
test.assertIncludes(cmf, 'recipe.parts[selectedPartId] = button.dataset.cmfColor', "Palette choices apply to the selected part");
test.assertIncludes(cmf, 'bindRovingGroup(cmfEl("cmf-parts")', "CMF part list supports roving keyboard navigation");
test.assertIncludes(cmf, 'bindRovingGroup(cmfEl("cmf-palette")', "CMF finish palette supports roving keyboard navigation");
test.assertIncludes(cmf, 'bindRovingGroup(cmfEl("cmf-view-strip")', "CMF live-model views support roving keyboard navigation");
test.assertIncludes(cmf, "dataset.capabilityDisabled", "CMF preserves server capability state while operations are busy");
test.assertIncludes(cmf, "setCmfControlLoading", "CMF export uses stable loading semantics");
test.assertIncludes(index, 'id="cmf-model-canvas"', "CMF owns one interactive model surface");
test.assertNotIncludes(index, 'id="cmf-preview-fallback"', "CMF does not substitute a schematic for the model");
test.assertIncludes(cmf, "if (canRenderModel === false)", "CMF reports a missing USDZ path instead of promising a false preview");
test.assertIncludes(cmf, "new state.modules.USDLoader().parse(buffer)", "CMF renders the actual recolored USDZ in the browser");
test.assertIncludes(cmf, "material.color.set(color.hex)", "CMF finish changes update the loaded model immediately");
test.assertIncludes(cmfStyles, "@container cmf-studio", "CMF owns narrow-window layouts through its container");
test.assertNotIncludes(cmfStyles, "!important", "CMF adds no priority overrides");

// Bureaucracy Meme: direct composition, editable current caption, real disabled export.
test.assertIncludes(index, 'id="bureaucracy-caption-zh"', "Meme workbench exposes an editable Chinese caption");
test.assertIncludes(index, 'id="bureaucracy-caption-en"', "Meme workbench exposes an editable English caption");
test.assertIncludes(index, 'data-caption-language="bilingual"', "Meme workbench exposes a bilingual output choice");
test.assertMatches(index, /id="bureaucracy-download-link"[^>]*type="button"[^>]*disabled/, "PNG export is a natively disabled button");
test.assertIncludes(index, 'id="bureaucracy-preview-canvas" width="1200" height="900" role="img"', "Meme canvas has an accessible image role");
test.assertIncludes(bureaucracy, "setControlLoading(els.generateButton", "Caption generation uses the shared stable loading control");
test.assertIncludes(bureaucracy, "bindRovingButtons", "Meme choice groups support arrow-key navigation");
test.assertIncludes(bureaucracy, 'button.setAttribute("aria-pressed"', "Meme choice groups expose committed selection");
test.assertIncludes(bureaucracy, "currentEditedCaption", "Edited captions are the source of the rendered preview");
test.assertIncludes(bureaucracyStyles, "@container bureaucracy-meme", "Meme workbench owns narrow-window layouts through its container");
test.assertIncludes(foundationStyles, "--bureaucracy-copy-min-height: 328px", "Meme workbench reserves enough narrow-window height for the caption editor's bottom inset");
test.assertIncludes(bureaucracyStyles, "minmax(var(--bureaucracy-copy-min-height), auto)", "Meme workbench lets the caption column retain its bottom breathing room");
test.assertIncludes(bureaucracyStyles, "min-height: var(--bureaucracy-copy-min-height)", "Meme caption panel consumes the shared narrow-height contract");
test.assertNotIncludes(bureaucracyStyles, "body:not(.use-liquid-glass)", "Meme geometry no longer forks between themes");
test.assertNotIncludes(bureaucracyStyles, "!important", "Meme workbench adds no priority overrides");
test.assertIncludes(bureaucracyStyles, "color: var(--bureaucracy-ink)", "Meme workbench preserves its subject palette without forking geometry");
test.assertIncludes(liquidStyles, "--bureaucracy-pane-bg:", "Liquid Glass retains the dark institutional meme scene");
test.assertIncludes(liquidStyles, "#242523", "Meme workbench retains its original charcoal ground");
test.assertIncludes(liquidStyles, "rgba(160, 65, 48, 0.95)", "Meme selections retain the restrained bureaucratic red");

// Endfield: last-request-wins querying and a one-to-one numbered evidence chain.
test.assertIncludes(index, 'id="endfield-output" class="endfield-output" aria-busy="false"', "Endfield result surface exposes its busy state without announcing the whole result");
test.assertIncludes(index, 'id="endfield-submit"', "Endfield owns a stable primary query control");
test.assertIncludes(endfield, "let endfieldRequestId = 0", "Endfield tracks the authoritative request");
test.assertIncludes(endfield, "endfieldAbortController?.abort()", "Starting or clearing a query cancels prior network work");
test.assertIncludes(endfield, "requestId !== endfieldRequestId", "Stale Endfield results cannot overwrite the latest query");
test.assertIncludes(endfield, "data.results.slice(0, 14)", "Endfield normalizes the evidence set shown to the user");
test.assertIncludes(endfield, 'id="endfield-evidence-${index + 1}"', "Endfield renders stable numbered evidence targets");
test.assertIncludes(endfield, 'data-evidence-index="${index + 1}"', "Endfield source directory links to numbered evidence");
test.assertIncludes(endfield, "setControlLoading(endfieldSubmitBtn", "Endfield query control uses stable loading semantics");
test.assertNotIncludes(endfieldStyles, "html:has(", "Endfield no longer changes root scrolling state");
test.assertNotIncludes(endfieldStyles, "*::-webkit-scrollbar", "Endfield scrollbars are scoped to explicit panes");
test.assertIncludes(endfieldStyles, "@container endfield-terminal", "Endfield keeps the query first at narrow window widths");
test.assertIncludes(endfieldStyles, ".endfield-command-bar button", "Endfield keeps the compact phone query row touch-sized");
test.assertNotIncludes(endfieldStyles, "!important", "Endfield adds no priority overrides");
test.assertIncludes(foundationStyles, 'url("assets/endfield-background.svg")', "Endfield retains the original topographic archive asset");
test.assertIncludes(endfieldStyles, "background-size: var(--endfield-pane-bg-size)", "Endfield preserves the authored map scale");
test.assertIncludes(endfieldStyles, "border: var(--endfield-index-border)", "Endfield keeps square archive indices in the improved evidence chain");

test.finish();
