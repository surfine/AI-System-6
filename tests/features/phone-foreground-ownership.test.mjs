// Phone / tablet foreground ownership.
//
// One rule, in both directions:
//
//   THE SURFACE THE USER ASKED FOR IS THE SURFACE THAT STAYS.
//
// A phone shows one app at a time, so every route command that opens a second
// window is making a claim on the whole screen. A window opened to PREPARE
// state — the manuscript tab behind the Question Sheet, the read-only
// manuscript beside Section Drafts — must not take that screen. A window the
// writer actually travelled to — Writing > Go To > Manuscript, or the drafts
// advancing into the manuscript — must be able to.
//
// This is a real-execution contract, not a source search, because nothing is
// wrong with the markup in any of these failures: the wrong window simply wins
// a race about a second after the right one arrived, and the app's own text
// reads correctly at every line. The three defects the class has produced so
// far were each invisible to every static gate:
//
//   1. openTeachTextDocumentTab({ focus: false }) opened the manuscript window
//      WITH focus, so tapping 提问单 landed the writer in TeachText. Fixed on
//      main (d3b9ee27); section 2 below holds it.
//   2. openWindow ran the phone foreground pass only when it was also PLACING
//      the window, and a companion open is usually an open of a window that is
//      already open — so advancing from the Outline put the writer in the
//      manuscript instead of Section Drafts, on both phone orientations and on
//      a tablet. Section 1.
//   3. The manuscript request was read-and-cleared by the first pass to see it,
//      and the companion opens a route command fires are not awaited — so a
//      pass that could not honour the request ate it, and the manuscript the
//      writer had just asked for was hidden by the statement meant to raise it.
//      Sections 3 and 4.
//
// The browser walk that found 2 and 3 lives at tooling/phone-foreground-audit.mjs
// (`node tooling/phone-foreground-audit.mjs --all`): it opens every window in
// the registry, and drives five route scenarios, at 375x812, 812x375 and
// 768x1024, and reports which window actually holds the screen 2.5 s later.
// This file is the fast, deterministic half of the same question.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("phone-foreground-ownership");
const windowManager = read("app/core/window-manager.js");
const teachTextAccessories = read("app/features/teachtext-accessories.js");

const ROUTE_WINDOWS = ["questionSheet", "outline", "sectionDrafts", "reviewDesk", "teachText", "projects"];

// A phone-shaped VM: portrait, narrow, and a getComputedStyle that reports the
// z-index the app's own focusWindow() writes. The shim's default answers "no"
// to every media query and "" to every style, which would make the mobile
// branch unreachable and every z-index read 0 — the two inputs this whole
// decision is made of.
function phoneVm({ landscape = false } = {}) {
  const vmw = createAppBootVm();
  vmw.run(`
    window.matchMedia = (query) => ({
      matches: ${landscape ? "!/orientation:portrait/.test(query)" : "!/orientation:landscape/.test(query)"},
      addEventListener() {}, removeEventListener() {},
    });
    window.getComputedStyle = (element) => ({
      zIndex: (element && element.style && element.style.zIndex) || "0",
      minWidth: "0px",
      getPropertyValue: () => "",
      display: "block",
    });
  `);
  for (const name of ROUTE_WINDOWS) vmw.windowElement(name);
  // The route only arranges a manuscript; a scratch file is a different
  // document and is deliberately not part of this decision.
  vmw.run(`teachTextDocumentRole = "manuscript";`);
  const quoted = (name) => JSON.stringify(name);
  return {
    ...vmw,
    // Reveal a window and raise it, which is exactly what openWindow's own
    // focused tail does — the app never writes a z-index by hand.
    raise: (name) => vmw.run(`getWindow(${quoted(name)}).classList.remove("is-hidden"); focusWindow(getWindow(${quoted(name)}));`),
    hidden: (name) => vmw.run(`getWindow(${quoted(name)}).classList.contains("is-hidden")`),
    z: (name) => vmw.run(`Number(getWindow(${quoted(name)}).style.zIndex || 0)`),
    arrange: () => vmw.run("arrangeMobileWritingForeground()"),
    request: () => vmw.run("mobileManuscriptForegroundRequested"),
    setRequest: (value) => vmw.run(`mobileManuscriptForegroundRequested = ${value ? "true" : "false"};`),
    seedProject: () => vmw.run(`const seededProject = createProjectRecord("Contract"); projects.push(seededProject); mountProject(seededProject); seededProject.id;`),
  };
}

// Who holds the screen: the visible route surface with the top z-index.
function foreground(vm) {
  return ROUTE_WINDOWS
    .filter((name) => name !== "projects" && !vm.hidden(name))
    .map((name) => ({ name, z: vm.z(name) }))
    .sort((a, b) => b.z - a.z)[0]?.name || null;
}

// Section 1: the phone's single foreground is a presentation decision, so it
// cannot be gated on placement. A companion open is an open of a window that is
// usually already open, and openWindow does not place one of those.
{
  const vm = phoneVm();
  vm.raise("sectionDrafts");
  await vm.run(`openWindow("teachText")`);
  test.assert(
    foreground(vm) === "sectionDrafts",
    `opening the manuscript over Section Drafts on a phone must leave Section Drafts on screen (got ${foreground(vm)})`
  );

  // The same open a second time: now the window IS already open, which is what
  // shouldPlaceWindow keys off, and what let the defect through.
  await vm.run(`openWindow("teachText")`);
  test.assert(
    foreground(vm) === "sectionDrafts",
    `re-opening the already-open manuscript must still leave Section Drafts on screen (got ${foreground(vm)})`
  );
  test.assert(
    !/shouldPlaceWindow && \["questionSheet"/.test(windowManager),
    "openWindow no longer gates the writing-route arrangement on shouldPlaceWindow alone"
  );
}

// Section 2: a caller that prepares the manuscript says focus:false, and that
// promise reaches the window open. This is the instance fixed on main.
{
  test.assertIncludes(
    teachTextAccessories,
    'openWindow("teachText", { skipFocus: !focus });',
    "preparing a TeachText tab without focus opens its window without focus"
  );
  const vm = phoneVm();
  vm.raise("questionSheet");
  await vm.run(`openWindow("teachText", { skipFocus: true })`);
  test.assert(
    foreground(vm) === "questionSheet",
    `a manuscript prepared behind the Question Sheet must stay behind it (got ${foreground(vm)})`
  );
}

// Section 3: the other direction. A deliberate advance to the manuscript takes
// the screen — including when a pass that could not honour the request runs in
// between, which is what an un-awaited companion open produces.
{
  const vm = phoneVm();
  vm.raise("sectionDrafts");
  vm.raise("teachText");
  vm.setRequest(true);

  // The companion's own foreground pass, arriving late and with Section Drafts
  // still on top. It must not answer the request on the manuscript's behalf.
  vm.raise("sectionDrafts");
  vm.arrange();
  test.assert(vm.request() === true, "a manuscript request survives a pass that could not honour it");
  test.assert(foreground(vm) === "sectionDrafts", "that pass leaves Section Drafts on screen, as it should");

  // The open the command was actually waiting on.
  vm.raise("teachText");
  vm.arrange();
  test.assert(
    foreground(vm) === "teachText" && vm.hidden("sectionDrafts"),
    `the manuscript the writer advanced to must take the screen (got ${foreground(vm)})`
  );
  test.assert(vm.request() === false, "the request is cleared once the manuscript has the screen");
}

// Section 4: the command behind Writing > Go To > Manuscript and the Review
// Desk's View Manuscript says so out loud. Without this the manuscript is not
// eligible for the foreground outside the review phase, and the writer who
// asked for it is returned to Section Drafts.
{
  const vm = phoneVm();
  vm.seedProject();
  vm.raise("sectionDrafts");
  vm.setRequest(false);
  const opened = vm.run("openTeachTextManuscriptWindow()");
  test.assert(opened === true, "openTeachTextManuscriptWindow opens the manuscript");
  vm.raise("teachText");
  vm.arrange();
  test.assert(
    foreground(vm) === "teachText",
    `Go To > Manuscript must land in the manuscript (got ${foreground(vm)})`
  );
}

// Section 5: what bounds the request. Travelling to another route stop cancels
// it, so it can never outlive the move that asked for it.
{
  const vm = phoneVm();
  vm.raise("teachText");
  vm.setRequest(true);
  await vm.run(`openWindow("sectionDrafts")`);
  test.assert(vm.request() === false, "opening another route stop with focus cancels a pending manuscript request");

  // A companion open is not a change of mind, so it must not cancel one.
  vm.setRequest(true);
  await vm.run(`openWindow("outline", { skipFocus: true })`);
  test.assert(vm.request() === true, "a companion open (skipFocus) leaves a pending manuscript request alone");
}

// Section 6: phone landscape runs the same single-foreground model — the route
// windows are narrow-viewport work areas there too, so the same claim on the
// screen is being made and the same rule has to hold.
{
  const vm = phoneVm({ landscape: true });
  test.assert(vm.run("isNarrowViewport()") === true, "812x375 is a narrow viewport");
  test.assert(vm.run("mobileWritingForegroundOwnsRoute()") === true, "the phone foreground model owns the route in landscape too");
  vm.raise("sectionDrafts");
  await vm.run(`openWindow("teachText")`);
  test.assert(
    foreground(vm) === "sectionDrafts",
    `in landscape the manuscript companion must still leave Section Drafts on screen (got ${foreground(vm)})`
  );
}

// Section 7: the desktop keeps its own arrangement, gated by placement. The
// splits write inline geometry, and re-placing a window the writer positioned
// is churn — so widening the foreground pass must not widen those.
{
  const vmw = createAppBootVm();
  vmw.run(`
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.getComputedStyle = (element) => ({
      zIndex: (element && element.style && element.style.zIndex) || "0",
      minWidth: "0px", getPropertyValue: () => "", display: "block",
    });
  `);
  test.assert(
    vmw.run("mobileWritingForegroundOwnsRoute()") === false,
    "a desktop viewport does not run the phone foreground model"
  );
  test.assertIncludes(
    windowManager,
    "else if (shouldPlaceWindow) arrangeActiveWritingWorkspace();",
    "the desktop splits stay a placement decision"
  );
}

test.finish();
// The VM's boot-time modules leave inert timer handles behind; nothing here
// waits on them. See lazy-command-loading.test.mjs's comment on the same line.
process.exit(0);
