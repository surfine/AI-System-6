// Harvest O — ADHD / I-person journey gates in live product apps/.
// Design map: journey-product-harvest-design.md (v228). Seven gates → product
// landings; data-journey-product=1. Also the repeatable product desk smoke:
// eight writing-route stops + Hold→quiet notify→resume→bell／todo exclusivity
// (not the proposal-only walk.mjs).

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { appModulePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("journey-gates");

const journeyGates = read("app/core/journey-gates.js");
const heldPlace = read("app/core/held-place.js");
const holdThought = read("app/features/hold-that-thought.js");
const windowManager = read("app/core/window-manager.js");
const workingSession = read("app/core/working-session.js");
const persistence = read("app/core/persistence-status.js");
const desktopTools = read("app/features/desktop-tools.js");
const todoDa = read("app/features/todo-da.js");
const markdownEditor = read("app/core/markdown-editor.js");
const wireup = read("app/core/wireup.js");
const harvestUx = read("tests/features/harvest-ux.test.mjs");
const index = read("index.html");

// --- O7 / O8: product landings locked beside the design map -----------------

test.assert(
  appModulePaths.includes("app/core/journey-gates.js"),
  "journey-gates boots with the desk (eager), not only the proposal",
);
test.assertIncludes(journeyGates, "AISystem6JourneyGates", "product exposes the journey-gates API");
test.assertIncludes(journeyGates, 'data-journey-product', "product probe claims data-journey-product");
test.assertIncludes(journeyGates, "closeSiblingJourneyAccessories", "shell exclusivity is owned in product");
test.assertIncludes(journeyGates, 'gate: "bookmark"', "bookmark gate is named");
test.assertIncludes(journeyGates, 'gate: "hold"', "hold gate is named");
test.assertIncludes(journeyGates, 'gate: "quiet"', "quiet gate is named");
test.assertIncludes(journeyGates, 'gate: "nag"', "nag gate is named");
test.assertIncludes(journeyGates, 'gate: "primary"', "primary gate is named");
test.assertIncludes(journeyGates, 'gate: "shell"', "shell gate is named");
test.assertIncludes(journeyGates, 'gate: "desk"', "desk gate is named");
test.assertIncludes(journeyGates, 'land: "teachText/persistence"', "bookmark lands on TeachText／persistence");
test.assertIncludes(journeyGates, 'land: "holdThought"', "hold lands on holdThought");
test.assertIncludes(journeyGates, 'land: "notificationCenter"', "quiet lands on notificationCenter");
test.assertIncludes(journeyGates, 'land: "writingBell/todo"', "nag lands on writingBell／todo");
test.assertIncludes(journeyGates, 'land: "organic-chrome"', "primary lands on organic chrome");
test.assertIncludes(journeyGates, 'land: "window-manager/DA"', "shell lands on window manager／DA");
test.assertIncludes(journeyGates, 'land: "writing-editor"', "desk lands on writing-editor");

// 1. bookmark still there — capture before open; resume restores caret; no inbox
test.assertIncludes(heldPlace, "writeHeldThoughts()", "bookmark capture persists before the Hold window opens");
test.assertIncludes(heldPlace, "currentWritingRouteStop()", "bookmark remembers the route stop");
test.assertIncludes(holdThought, "field.setSelectionRange(start, end)", "resume puts the caret back");
test.assertNotMatches(holdThought, /promoteHeldPlace|question-sheet-body|openWindow\("scrapbook"\)/, "Hold does not open a new inbox");

// 2. Hold two sentences — Esc／Done leave immediately; no rest nag
test.assertIncludes(holdThought, 'if (event.key !== "Escape") return;', "Escape leaves Hold at once");
test.assertIncludes(holdThought, '"hold-thought-done"', "Done leaves Hold");
test.assertIncludes(holdThought, "closeWindow(\"holdThought\")", "Done／Esc close the accessory");
test.assertNotMatches(holdThought, /休息够了|rest more|streak|you should rest/i, "Hold does not nag to rest more");

// 3. quiet return — notify does not steal focus / open the center
test.assertIncludes(persistence, "must never open notificationCenter", "quiet-return contract is named at the knock");
test.assert(
  !/openWindow\(\s*[\"']notificationCenter[\"']/.test(
    persistence.slice(persistence.indexOf("function pushSystemNotification"), persistence.indexOf("function openSystemNotification")),
  ),
  "pushSystemNotification never opens the center",
);

// 4. no streak nag — voluntary Start; todo／bell advertise no-streak
test.assertIncludes(desktopTools, "Start stays voluntary", "bell completion does not auto-start the next round");
test.assertIncludes(desktopTools, "knockAfterWritingBell()", "bell ends with a quiet knock, not a dismiss modal");
test.assertNotMatches(desktopTools, /showSystemModal\(/, "bell does not raise a dismiss modal");
test.assertNotMatches(desktopTools, /streak\s*(count|board|score)|连胜/, "bell has no streak counter chrome");
test.assertIncludes(todoDa, 'data-nag", "0"', "To Do advertises no nag");
test.assertIncludes(todoDa, 'data-adhd", "no-streak"', "To Do advertises no-streak");
test.assertNotMatches(todoDa, /连胜|成就|streakCount|winCount/, "To Do source has no win-count chrome");

// 5. single primary — harvest-ux already locks writing-route one-primary
test.assertIncludes(harvestUx, "TeachText Focus is not a second toolbar button", "organic primary stays locked in harvest-ux");
test.assertIncludes(index, 'aria-label="Writing commands"', "TeachText keeps Commands overflow, not a button wall");

// 6. shell one-at-a-time
test.assertIncludes(windowManager, "skipJourneyExclusive", "openWindow can skip journey exclusivity for restore");
test.assertIncludes(windowManager, "closeSiblingJourneyAccessories", "summon closes sibling journey accessories");
test.assertIncludes(workingSession, "skipJourneyExclusive: true", "Working Session restore keeps a multi-DA desk");

// 7. desk focus body-only
test.assertIncludes(markdownEditor, 'classList.toggle("is-writing-focus"', "focus mode quiets the desk");
test.assertIncludes(markdownEditor, "AISystem6JourneyGates?.syncDeskProbe", "desk-focus updates the journey probe");
test.assertIncludes(wireup, "AISystem6JourneyGates?.syncDeskProbe", "boot syncs the journey probe");

// --- O9: product desk smoke (eight stops + journey chain) -------------------

function seedProject(vmw) {
  vmw.run(`
    projects.push({ id: "journey-o", name: "Journey O", manuscriptOwnsDraft: false });
    activeProjectId = "journey-o";
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

{
  const vmw = createAppBootVm();
  seedProject(vmw);
  test.assert(
    typeof vmw.context.AISystem6JourneyGates?.readProductGateSnapshot === "function",
    "product desk exposes AISystem6JourneyGates after boot",
  );
  const probe = vmw.context.AISystem6JourneyGates.readProductGateSnapshot();
  test.assert(probe.product === "1", "data-journey-product measures as 1 on the product desk");
  test.assert(probe.welcome === "0", "quiet return: data-welcome=0");
  test.assert(probe.nag === "0", "no streak nag: data-nag=0");
  test.assert(probe.primary === "1", "single primary: data-primary=1");
  test.assert(probe.gates === 7, "seven gates are registered");
  vmw.context.AISystem6JourneyGates.syncDeskProbe();
  const desk = vmw.document.getElementById("desktop")
    || vmw.document.querySelector(".desktop")
    || vmw.document.body;
  test.assert(desk?.getAttribute("data-journey-product") === "1", "desk probe paints data-journey-product=1");
  test.assert(desk?.getAttribute("data-harvest-map") === "1", "desk probe paints harvest map readiness");
}

for (const stop of routeStops) {
  const vmw = createAppBootVm();
  seedProject(vmw);
  await vmw.context.handleAction(stop.action);
  const win = vmw.windowElement(stop.windowName);
  const settled = await vmw.waitFor(
    () => win.classList.contains("is-active") && !win.classList.contains("is-hidden"),
  );
  test.assert(settled, `O9 eight-stop: ${stop.label} opens its own window`);
}

{
  const vmw = createAppBootVm();
  seedProject(vmw);
  const isOpen = (name) => {
    const win = vmw.windowElement(name);
    return !!(win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"));
  };
  const isClosed = (name) => {
    const win = vmw.windowElement(name);
    return !win || win.classList.contains("is-hidden") || win.classList.contains("is-app-hidden");
  };

  await vmw.context.handleAction("open-teachtext-manuscript");
  await vmw.waitFor(() => vmw.windowElement("teachText")?.classList.contains("is-active"));

  // Seed a held thought the way capture would, then open Hold.
  vmw.run(`
    heldThoughts = [{
      id: "jt1",
      where: "teachText",
      title: "Manuscript",
      fieldId: "teachtext-body",
      start: 0,
      end: 0,
      sentence: "",
      doing: "mid sentence",
      next: "finish the line",
      at: Date.now(),
    }];
    if (typeof writeHeldThoughts === "function") writeHeldThoughts();
  `);
  await vmw.context.openWindow("holdThought");
  await vmw.waitFor(() => isOpen("holdThought"));
  test.assert(isOpen("holdThought"), "Hold opens as the journey shell step");

  await vmw.context.openWindow("notificationCenter");
  await vmw.waitFor(() => isOpen("notificationCenter"));
  test.assert(isClosed("holdThought"), "shell one-at-a-time: opening notify closes Hold");
  test.assert(isOpen("notificationCenter"), "notification center is the one open journey accessory");

  // Quiet knock: push must not open／focus the center when it is closed.
  await vmw.context.closeWindow("notificationCenter", true);
  test.assert(isClosed("notificationCenter"), "center starts closed before a quiet knock");
  vmw.context.pushSystemNotification("journey quiet knock", {
    messageKey: "journey_quiet_knock_test",
    messageArgs: [],
  });
  test.assert(isClosed("notificationCenter"), "quiet return: knock does not open notificationCenter");

  await vmw.context.openWindow("writingBell");
  await vmw.waitFor(() => isOpen("writingBell"));
  test.assert(
    isClosed("todo") && isClosed("holdThought") && isClosed("notificationCenter"),
    "shell one-at-a-time: bell summon leaves other journey DAs closed",
  );
  const bell = vmw.windowElement("writingBell");
  test.assert(
    bell?.getAttribute("data-nag") === "0"
      || bell?.getAttribute("data-adhd") === "no-streak"
      || vmw.context.AISystem6JourneyGates.readProductGateSnapshot().nag === "0",
    "bell／probe advertise no streak nag",
  );

  await vmw.context.openWindow("todo");
  await vmw.waitFor(() => isOpen("todo"));
  test.assert(isClosed("writingBell"), "shell one-at-a-time: todo summon closes the writing bell");

  // Desk focus body-only
  vmw.document.body.classList.add("is-writing-focus");
  vmw.context.AISystem6JourneyGates.syncDeskProbe();
  const snap = vmw.context.AISystem6JourneyGates.readProductGateSnapshot();
  test.assert(snap.deskFocus === "1", "desk focus probe reads body.is-writing-focus");
}

test.finish();
process.exit(0);
