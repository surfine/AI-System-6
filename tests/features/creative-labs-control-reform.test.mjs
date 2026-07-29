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

// CMF Studio: one selected part plus one shared five-color palette.
test.assertIncludes(index, 'id="cmf-palette" role="group"', "CMF exposes one shared finish palette");
test.assertIncludes(index, 'id="cmf-parts" role="listbox"', "CMF exposes device parts as one selectable object list");
test.assertIncludes(cmf, 'let selectedPartId = "frame"', "CMF keeps one explicit selected part");
test.assertIncludes(cmf, 'recipe.parts[selectedPartId] = button.dataset.cmfColor', "Palette choices apply to the selected part");
test.assertIncludes(cmf, 'bindRovingGroup(cmfEl("cmf-parts")', "CMF part list supports roving keyboard navigation");
test.assertIncludes(cmf, 'bindRovingGroup(cmfEl("cmf-palette")', "CMF finish palette supports roving keyboard navigation");
test.assertIncludes(cmf, "dataset.capabilityDisabled", "CMF preserves server capability state while operations are busy");
test.assertIncludes(cmf, "setCmfControlLoading", "CMF render and export controls use stable loading semantics");
test.assertIncludes(index, 'id="cmf-preview-fallback"', "CMF keeps a local schematic when rendered views are unavailable");
test.assertIncludes(cmf, 'surface.dataset.cmfColor = recipe.parts', "CMF schematic follows the active recipe without inline layout");
test.assertIncludes(cmf, "if (canRenderViews === false)", "CMF does not promise a server preview when rendering is unavailable");
test.assertIncludes(cmf, "data.canRenderViews || data.canExport", "CMF preserves the software renderer when Swift is unavailable");
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
test.assertNotIncludes(bureaucracyStyles, "body:not(.use-liquid-glass)", "Meme geometry no longer forks between themes");
test.assertNotIncludes(bureaucracyStyles, "!important", "Meme workbench adds no priority overrides");

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
test.assertNotIncludes(endfieldStyles, "!important", "Endfield adds no priority overrides");

test.finish();
