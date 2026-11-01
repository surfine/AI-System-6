// Sidebar tier 2: the tdi-rail (Reader / TeachText / DocMap / Time Machine's
// shared vertical tab strip) is promoted to a documented, first-class
// primitive. This pins the promotion itself -- one builder every consumer
// already shares, a real section-heading capability, and the three selection
// states (selected-and-focused, selected-but-window-unfocused, hover/pressed)
// answered by every appearance -- separately from tdi-document-stack.test.mjs,
// which already pins the compact-stack projection these functions share.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("tdi-rail-primitive");
const projectDisk = read("app/features/project-disk.js");
const teachText = read("app/features/teachtext-accessories.js");
const foundation = read("styles/00-foundation.css");
const railStyles = read("styles/20-reader-docmap.css");
const platinum = read("styles/65-appearance-themes.css");
const aqua = read("styles/67-aqua-appearance.css");
const liquid = read("styles/70-liquid-glass.css");

// The primitive is discoverable, the way its siblings are.
test.assertIncludes(projectDisk, "window.AISystem6TdiRail = Object.freeze({", "tdi-rail is a documented primitive, named like window.AISystem6WindowFrameBar and window.AISystem6FinderList");
test.assertIncludes(projectDisk, "render: renderTdiTabStrip", "the primitive's render() is the same function every consumer already calls -- no second implementation");
test.assertIncludes(projectDisk, "renderCompactStack: renderTdiDocumentStack", "the primitive also names the narrow-window projection of the same state");

// No consumer keeps a private copy of row markup.
for (const [file, label] of [
  [read("app/features/reader.js"), "Reader"],
  [teachText, "TeachText"],
  [read("app/features/docmap.js"), "DocMap"],
  [read("app/features/time-machine.js"), "Time Machine"],
]) {
  test.assertIncludes(file, "renderTdiTabStrip(", `${label} renders its rail through the one shared builder`);
}

// Section headings: an optional capability of the builder, exercised where
// the app already models a real grouping (TeachText's Manuscript vs. its
// Section Drafts) rather than invented for windows with nothing to group.
test.assertIncludes(projectDisk, "groupFor = null,", "renderTdiTabStrip accepts an optional group key per row");
test.assertIncludes(projectDisk, "groupLabelFor = (group) => group,", "renderTdiTabStrip accepts a label for each group key");
test.assertIncludes(projectDisk, 'heading.className = "tdi-tabs-heading";', "a group boundary renders as a real heading row inside the rail");
test.assertIncludes(projectDisk, 'heading.setAttribute("role", "presentation");', "the heading is not itself a focusable or interactive row");
test.assertIncludes(teachText, 'groupFor: (tab) => (tab.role === "manuscript" ? "manuscript" : "scratch")', "TeachText groups its rail by the Manuscript/Section-Drafts distinction it already models");
test.assertIncludes(teachText, 'groupLabelFor: (group) => (group === "manuscript" ? t("document_role_manuscript") : t("section_drafts"))', "TeachText's group headings reuse the product's own Manuscript / Section Drafts vocabulary, not new copy");

// The three selection states live once, in the shared base recipe, not per
// consumer and not per era as a structural rule -- only as tokens.
test.assertIncludes(railStyles, ".window:not(.is-active) .tdi-tab.is-active {", "state 2 (selected, window not frontmost) reuses the product's existing .window:not(.is-active) convention");
test.assertIncludes(railStyles, ".tdi-tab:not(.is-active):hover {", "state 3 covers hover on a row that is not the open document");
test.assertIncludes(railStyles, ".tdi-tab:not(.is-active):active {", "state 3 also covers the pressed instant, with its own token pair so an era with no hover concept can still show a real press");
test.assertIncludes(railStyles, ".tdi-tabs-heading {", "the heading element has one base recipe");
test.assertNotIncludes(railStyles, "!important", "the promoted rail does not add cascade debt");

// Every appearance answers the new tokens explicitly (era-completeness
// ratchet) rather than silently falling back to the System 6 default for a
// state the gate cannot see is wrong in a translucent or flat era.
for (const [file, label] of [[platinum, "platinum"], [aqua, "aqua (+snow-leopard)"], [liquid, "liquid-glass"]]) {
  test.assertIncludes(file, "--tdi-tab-active-unfocused-bg:", `${label} answers the selected-but-window-unfocused background`);
  test.assertIncludes(file, "--tdi-tab-hover-bg:", `${label} answers the hover background`);
  test.assertIncludes(file, "--tdi-tab-pressed-bg:", `${label} answers the pressed background`);
  test.assertIncludes(file, "--tdi-tabs-heading-fg:", `${label} answers the section-heading text color`);
}

// Platinum's own hard rule (System 7/8/9 had no hover on a mouse-only Mac):
// the hover pair must equal the idle tab exactly, while press stays real.
test.assertIncludes(platinum, "--tdi-tab-hover-bg: #eeeeee;", "Platinum's hover token equals its idle --tdi-tab-bg -- a deliberate no-op, not a missing state");
test.assertIncludes(platinum, "--tdi-tab-pressed-bg: #666666;", "Platinum still shows real feedback on the pressed instant, matching --btn-active-bg");

// Snow Leopard's own selection ramp already carried an unfocused and an
// inactive gradient that nothing consumed before this lane.
test.assertIncludes(aqua, "--tdi-tab-active-unfocused-bg: var(--sidebar-selection-bg-inactive);", "Snow Leopard's selected-but-unfocused tab finally reads --sidebar-selection-bg-inactive");
test.assertIncludes(aqua, "--tdi-tab-hover-bg: var(--sidebar-selection-bg-unfocused);", "Snow Leopard's hover state finally reads --sidebar-selection-bg-unfocused, declared with the rest of the source-list ramp but unused until now");

// Foundation carries the one default set every era's tokens override.
test.assertIncludes(foundation, "--tdi-tab-active-unfocused-bg:", "the System 6 baseline answers the unfocused-selection token (era baseline is exempt from the coverage gate, not from having a default)");
test.assertIncludes(foundation, "--tdi-tab-hover-bg:", "the System 6 baseline answers the hover token");
test.assertIncludes(foundation, "--tdi-tab-pressed-bg:", "the System 6 baseline answers the pressed token");
test.assertIncludes(foundation, "--tdi-tabs-heading-fg:", "the System 6 baseline answers the section-heading token");

test.finish();
