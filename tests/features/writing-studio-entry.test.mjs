// Writing Studio's default entry follows the project's writing state, not a
// chat page. One centralized function owns the mapping; the desktop toggle and
// menus reuse it, and ClioTalk stays summonable but is never the home surface.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-studio-entry");
const profile = read("app/core/workspace-profile.js");

test.assertIncludes(profile, "function writingStudioDefaultEntry", "one centralized state decision function exists");
test.assertIncludes(profile, "function openWritingStudioDefaultSurface", "the entry surface opener exists");
test.assertIncludes(profile, "await openWritingStudioDefaultSurface()", "openWritingStudio uses the centralized decision");
test.assertNotIncludes(
  profile.split("function openWritingStudio()")[1].split("function exitWritingStudio")[0],
  'openWindow("assistant")',
  "entering Writing Studio no longer defaults to ClioTalk"
);
test.assertIncludes(profile, '"projects"', "no project lands on Project Hard Disk");
test.assertIncludes(profile, '"questionSheet"', "a new project lands on Question Sheet");
test.assertIncludes(profile, '"outline"', "an outlined project lands on Outline");
test.assertIncludes(profile, '"sectionDrafts"', "a drafting project lands on Section Drafts");
test.assertIncludes(profile, '"reviewDesk"', "a reviewing project lands on Review Desk");
test.assertIncludes(profile, '"teachText"', "a completed project lands on the Manuscript");

const source = profile;
const context = vm.createContext({
  window: {},
  isProjectMounted: true,
  teachTextWorkflowState: "",
  getActiveProject: null,
});
vm.runInContext(source, context);

const states = {
  fresh: { id: "p1", name: "P", questionSheet: "", outline: "", outlineSections: ["New Section"], drafts: [], flowState: {} },
  outlined: { id: "p2", name: "P", questionSheet: "Q", outline: "## A\n## B", outlineSections: ["A", "B"], drafts: [], flowState: {} },
  drafting: { id: "p3", name: "P", questionSheet: "Q", outline: "## A", outlineSections: ["A"], drafts: [{ id: "d", title: "A", body: "prose" }], flowState: {} },
  reviewing: { id: "p4", name: "P", questionSheet: "Q", outline: "## A", outlineSections: ["A"], drafts: [{ id: "d", title: "A", body: "prose" }], flowState: { check: true } },
  completed: { id: "p5", name: "P", questionSheet: "Q", outline: "## A", outlineSections: ["A"], drafts: [{ id: "d", title: "A", body: "prose" }], flowState: { check: true } },
};

context.teachTextWorkflowState = "";
test.assert(context.writingStudioDefaultEntry(states.fresh) === "questionSheet", "fresh project -> Question Sheet");
test.assert(context.writingStudioDefaultEntry(states.outlined) === "outline", "outlined project -> Outline");
test.assert(context.writingStudioDefaultEntry(states.drafting) === "sectionDrafts", "drafting project -> Section Drafts");
test.assert(context.writingStudioDefaultEntry(states.reviewing) === "reviewDesk", "reviewing project -> Review Desk");

context.teachTextWorkflowState = "final";
test.assert(context.writingStudioDefaultEntry(states.completed) === "teachText", "completed project -> Manuscript");

context.isProjectMounted = false;
test.assert(context.writingStudioDefaultEntry(states.fresh) === "projects", "no mounted project -> Project Hard Disk");

test.finish();
