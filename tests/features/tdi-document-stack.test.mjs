// All tabbed-document windows share one project-backed model. Wide windows
// expose the existing vertical rail; constrained windows project that same
// state into a compact stack menu without adding another chrome row.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("tdi-document-stack");
const projectDisk = read("app/features/project-disk.js");
const reader = read("app/features/reader.js");
const teachText = read("app/features/teachtext-accessories.js");
const docMap = read("app/features/docmap.js");
const timeMachine = read("app/features/time-machine.js");
const index = read("index.html");
const styles = read("styles/20-reader-docmap.css");
const timeMachineStyles = read("styles/22-time-machine.css");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");

test.assertIncludes(projectDisk, "function renderTdiDocumentStack(container, tabs, options = {})", "one renderer owns the compact document stack");
test.assertIncludes(projectDisk, "renderTdiDocumentStack(container, visibleTabs, options);", "the compact stack is a projection of every shared TDI tab strip");
test.assertIncludes(projectDisk, "visibleTabs.length <= 1", "a single document still collapses the wide navigation rail");
test.assertIncludes(projectDisk, "const shouldHide = !visibleTabs.length", "compact chrome remains available to identify a single document");
test.assertIncludes(projectDisk, "if (visibleTabs.length === 1)", "a single compact document uses a passive identity state");
test.assertIncludes(projectDisk, 'currentLabel.className = "tdi-stack-summary tdi-stack-single"', "the passive identity does not imply a switcher menu");
test.assertIncludes(projectDisk, 'currentLabel.setAttribute("aria-current", "page")', "assistive technology still receives the active single-document context");
test.assertIncludes(projectDisk, 'popover.setAttribute("role", "menu")', "the compact stack exposes menu semantics");
test.assertIncludes(projectDisk, 'activeCopy.textContent = `${dirtyFor(activeTab) ? "• " : ""}${compactLabelFor(activeTab, activeIndex)}`', "compact stacks carry the active document's short title");
test.assertIncludes(projectDisk, 'summary.setAttribute("aria-label", `${t("documents")}: ${labelFor(activeTab, activeIndex)}`)', "the compact stack retains the active document name for assistive technology");
test.assertIncludes(projectDisk, 'open.setAttribute("role", "menuitemradio")', "the active document is conveyed to assistive technology");
test.assertIncludes(projectDisk, '["ArrowDown", "ArrowUp", "Home", "End"]', "the stack is keyboard navigable from its summary");
test.assertIncludes(projectDisk, 'if (!details.contains(event.target)) details.removeAttribute("open")', "clicking outside dismisses an open document stack");
test.assertIncludes(projectDisk, 'if (event.key !== "Escape") return', "Escape dismisses an open document stack");
test.assertIncludes(projectDisk, "onMove(draggingId, tab.id)", "compact and vertical presentations share document reordering");

for (const [id, label] of [
  ["reader-tabs", "Reader"],
  ["teachtext-tabs", "TeachText"],
  ["docmap-tabs", "DocMap"],
  ["time-machine-tabs", "Time Machine"],
]) {
  test.assertIncludes(index, `data-tdi-stack-for="${id}"`, `${label} hosts the shared compact stack in existing chrome`);
}

for (const [source, label] of [
  [reader, "Reader"],
  [teachText, "TeachText"],
  [docMap, "DocMap"],
  [timeMachine, "Time Machine"],
]) {
  test.assertIncludes(source, "renderTdiTabStrip(", `${label} renders through the shared TDI model`);
  test.assertIncludes(source, "compactLabelFor:", `${label} defines its title-bar-safe compact document label`);
}

test.assertIncludes(index, '<h2 id="teachtext-title" data-i18n="teachtext">TeachText</h2>', "TeachText title chrome identifies the application");
test.assertIncludes(index, '<h2 id="reader-title" data-i18n="reader">Reader</h2>', "Reader title chrome identifies the application");
test.assertIncludes(index, '<h2 id="time-machine-title" data-i18n="time_machine">Time Machine</h2>', "Time Machine title chrome identifies the application");
test.assertIncludes(index, '<h2 id="docmap-title" data-i18n="docmap">DocMap</h2>', "DocMap title chrome identifies the application");
test.assertIncludes(reader, 'readerTitleEl.textContent = appTitle', "Reader runtime keeps its application name visible while document context moves to TDI");
test.assertIncludes(timeMachine, 'timeMachineTitleEl.textContent = appTitle', "Time Machine runtime keeps its application name visible while document context moves to TDI");
test.assertIncludes(teachText, 'teachTextTitleEl.textContent = appTitle', "TeachText runtime keeps its application name visible while document context moves to TDI");

test.assertIncludes(index, 'class="tdi-shell time-machine-shell"', "Time Machine now uses the same rail-and-document shell as the other TDI windows");
test.assertIncludes(index, 'class="time-machine-document-pane"', "Time Machine keeps its page and ask bar in one flexible document pane");
test.assertIncludes(timeMachine, 'storageKey: "aiSystem6.tdiRail.timeMachine"', "Time Machine remembers its wide vertical rail width");
test.assertIncludes(timeMachineStyles, ".time-machine-document-pane {", "Time Machine content fills the shared shell without losing scroll space");
test.assertIncludes(timeMachineStyles, ".time-machine-navigation .tdi-stack-summary {", "Time Machine preserves the stack's title, count, and disclosure columns inside browser navigation");

test.assertIncludes(styles, "@container (max-width: 759px)", "constrained windows switch presentation at one shared breakpoint");
test.assertIncludes(styles, ".tdi-stack-host:not(.is-hidden)", "constrained windows reveal compact document identity whenever a document exists");
test.assertIncludes(styles, "width: fit-content;", "the compact stack shrinks to the active document label instead of reserving long-title width");
test.assertIncludes(styles, ".tdi-shell > .tdi-rail,", "constrained windows remove the rail instead of spending a second row on tabs");
test.assertIncludes(styles, "@container (min-width: 760px)", "wide windows preserve the existing vertical rail");
test.assertIncludes(styles, "flex-direction: column;", "wide rail tabs remain a spatially stable vertical list");
test.assertIncludes(styles, "z-index: var(--z-local-popover)", "the stack menu stays inside the owning window layer");
test.assertIncludes(foundation, "--tdi-stack-popover-border:", "Classic owns the stack material through shared tokens");
test.assertIncludes(liquid, "--tdi-stack-popover-backdrop-filter:", "Liquid Glass supplies its material twin without changing the model");
test.assertNotIncludes(styles, "!important", "the shared stack does not add cascade debt");

test.finish();
