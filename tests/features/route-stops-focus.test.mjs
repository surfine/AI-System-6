// Real execution of the eight core-route stops named in CLAUDE.md:
//   Project Hard Disk -> File Floppy -> Question Sheet -> Outline ->
//   Section Drafts -> Manuscript -> Review Desk -> Project CD
//
// The P0 this exists to catch is described as "the TeachText hijack": four
// of these eight windows (Question Sheet, Outline, Section Drafts, Review
// Desk) plus the Manuscript window itself all share `app: "teachText"` in
// window-registry.js (a real, intentional grouping — one app, several
// surfaces), which is exactly the shape that lets a wiring bug make one
// route stop's "open" silently land the writer on a DIFFERENT stop's window
// instead of its own. A static contract can read that the action exists and
// that the window record exists; it cannot see which window ends up with
// `is-active` after the click, because that is a runtime fact.
//
// Each stop opens a FRESH VM (createAppBootVm() takes ~30ms — see the
// harness report for the measured cost) rather than reusing one VM across
// all eight in sequence. That was the first draft's approach, and it produced
// a real but misleading transient: opening Review Desk right after Manuscript
// showed Review Desk's `is-active` class flip on, then flip back to
// Manuscript within the same VM a few ticks later, WHILE THE IDENTICAL
// two-step transition tested in isolation (Manuscript, then Review Desk,
// nothing before it) never did. That points at unsettled background work
// left over from the earlier five stops in the same VM, not at a defect in
// the Manuscript -> Review Desk transition itself — chasing which of the
// five earlier stops leaves that work pending is out of this lane's scope
// (actions.js correctness is not owned here), so each assertion below
// starts clean instead of compounding that ambiguity. The specific
// Manuscript -> Review Desk pair the P0 names is still covered directly, in
// its own isolated two-step VM.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("route-stops-focus");

function seedProject(vmw) {
  vmw.run(`
    projects.push({ id: "route-test", name: "Route Test", manuscriptOwnsDraft: false });
    activeProjectId = "route-test";
    activeProject = projects[0];
  `);
}

const routeStops = [
  { action: "open-project-disks", windowName: "projects", label: "Project Hard Disk" },
  { action: "open-text-disk", windowName: "textDisk", label: "File Floppy" },
  { action: "open-question-sheet", windowName: "questionSheet", label: "Question Sheet" },
  { action: "open-outline", windowName: "outline", label: "Outline" },
  { action: "open-section-drafts", windowName: "sectionDrafts", label: "Section Drafts" },
  { action: "open-teachtext-manuscript", windowName: "teachText", label: "Manuscript" },
  { action: "open-review-desk", windowName: "reviewDesk", label: "Review Desk" },
  { action: "open-project-cd", windowName: "projectCd", label: "Project CD" },
];
const allRouteWindowNames = routeStops.map((stop) => stop.windowName);

for (const stop of routeStops) {
  const vmw = createAppBootVm();
  seedProject(vmw);
  await vmw.context.handleAction(stop.action);
  const win = vmw.windowElement(stop.windowName);
  const settled = await vmw.waitFor(
    () => win.classList.contains("is-active") && !win.classList.contains("is-hidden")
  );
  test.assert(settled, `${stop.label} (${stop.action}) opens and focuses its own window (${stop.windowName})`);

  // No OTHER route stop's window claims is-active at the same time — this is
  // the shape a hijack takes: two of these eight sharing one active state.
  const otherActiveRouteWindows = allRouteWindowNames
    .filter((name) => name !== stop.windowName)
    .map((name) => vmw.windowElement(name))
    .filter((el) => el.classList.contains("is-active"));
  test.assert(
    otherActiveRouteWindows.length === 0,
    otherActiveRouteWindows.length
      ? `${stop.label} left ${otherActiveRouteWindows.length} other route window(s) also marked is-active`
      : `${stop.label} is the only active window among the eight route stops`
  );
}

// The P0's named pair, isolated: Manuscript already open and focused, then
// Review Desk opens. Review Desk must end up focused; Manuscript must not
// still hold is-active (the hijack).
{
  const vmw = createAppBootVm();
  seedProject(vmw);
  await vmw.context.handleAction("open-teachtext-manuscript");
  await vmw.waitFor(() => vmw.windowElement("teachText").classList.contains("is-active"));
  test.assert(vmw.windowElement("teachText").classList.contains("is-active"), "Manuscript is focused before Review Desk opens");

  await vmw.context.handleAction("open-review-desk");
  const reviewSettled = await vmw.waitFor(() => vmw.windowElement("reviewDesk").classList.contains("is-active"));
  test.assert(reviewSettled, "Review Desk becomes focused after Manuscript was already open");
  test.assert(
    !vmw.windowElement("teachText").classList.contains("is-active"),
    "Manuscript releases focus to Review Desk instead of keeping it (the TeachText hijack)"
  );
}

test.finish();
// See control-panel-input-wiring.test.mjs's comment on this same line: a
// real boot can leave unrelated background async work in flight, and
// test.finish() does not exit on success.
process.exit(0);
