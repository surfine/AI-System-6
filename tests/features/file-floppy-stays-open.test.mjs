// The writing route says: Project Hard Disk -> File Floppy -> Question Sheet.
// The File Floppy is the writer's material intake, so it must stay on screen
// while the route continues. This contract holds that literally: it boots the
// real eager module set against the real index.html markup at desktop width
// (1024x768, the boot VM's viewport), walks that sequence with the app's own
// openWindow(), and asserts the File Floppy still has a box and reachable
// controls at each step.
//
// The defect it exists to catch: `replaceVisibleFinderLocation` retired EVERY
// window in `mobileFinderPageWindowNames` when any one of them opened. The
// Insert File Floppy panel was in that set, so creating a project -- which
// opens Project Hard Disk -- put `is-hidden` on the File Floppy. `is-hidden`
// is `display: none` (asserted below), so the window measured 0x0 and its
// controls, `#files` and `#index-files` among them, were unreachable. Nothing
// refused the window on purpose. It was hidden as a bystander.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("file-floppy-stays-open");

// The box assertions below are class assertions, so prove here what the
// classes do: these two rules are the only reason a managed window measures
// 0x0 while it is open.
const windowCss = read("styles/10-windows.css");
test.assertMatches(
  windowCss,
  /\.window\.is-hidden \{\s*display: none;/,
  "a window marked is-hidden has no box at all (display: none)",
);
test.assertMatches(
  windowCss,
  /\.window\.is-app-hidden \{\s*display: none;/,
  "a window marked is-app-hidden has no box at all (display: none)",
);

// The File Floppy's own controls, as index.html declares them.
const fileFloppyControlIds = ["files", "index-files", "files-selection", "rag-status"];

function seedProject(vmw) {
  vmw.run(`
    projects.push({ id: "floppy-test", name: "Floppy Test", manuscriptOwnsDraft: false });
    activeProjectId = "floppy-test";
    activeProject = projects[0];
  `);
}

// "Visible with a box" for a managed window is exactly this: none of the
// three classes that remove or collapse its frame. is-collapsed is
// WindowShade -- the frame keeps a title bar and nothing else -- so a
// collapsed File Floppy also hides every control.
function invisibleReasons(win) {
  return ["is-hidden", "is-app-hidden", "is-collapsed"].filter((name) => win.classList.contains(name));
}

function unreachableControls(vmw, win) {
  return fileFloppyControlIds.filter((id) => {
    const control = vmw.context.document.getElementById(id);
    if (!control) return true;
    // A control is reachable only through its own window. An element that is
    // not inside the File Floppy frame is not what the writer can operate.
    let node = control;
    while (node && node !== win) node = node.parentElement;
    return node !== win;
  });
}

function assertUsable(vmw, win, label) {
  const reasons = invisibleReasons(win);
  test.assert(
    reasons.length === 0,
    reasons.length ? `${label}: File Floppy has no box (${reasons.join(", ")})` : `${label}: File Floppy has a real box`,
  );
  const unreachable = unreachableControls(vmw, win);
  test.assert(
    unreachable.length === 0,
    unreachable.length
      ? `${label}: File Floppy controls unreachable (${unreachable.join(", ")})`
      : `${label}: every File Floppy control is reachable inside its own window`,
  );
}

// --- The reported defect: a clean profile, a new project, the File Floppy ---
// A clean profile starts in the Finder environment (app.js: runtimeEnvironment
// = "finder"), which is where the defect was reported.
{
  const vmw = createAppBootVm();
  seedProject(vmw);
  const floppy = vmw.windowElement("rag");

  // Both orders, because the writer meets both: the reported walk created a
  // project first (which opens Project Hard Disk) and then asked for the File
  // Floppy, and the route's own order is Project Hard Disk -> File Floppy ->
  // Question Sheet. Project creation also opens Project Hard Disk again while
  // the floppy is already up, which is where the bystander hit.
  await vmw.context.openWindow("projects");
  await vmw.context.openWindow("rag");
  assertUsable(vmw, floppy, "beside Project Hard Disk");

  await vmw.context.openWindow("projects");
  assertUsable(vmw, floppy, "when Project Hard Disk opens again");

  // The Finder environment is single-task: launching an application quits the
  // Finder, and every Finder window goes with it. That rule is owned by
  // multi-finder.js and is real System 6. What must never happen again is the
  // File Floppy going down ALONE while the rest of the Finder stays on
  // screen -- that is the bystander shape this whole test is about.
  await vmw.context.openWindow("questionSheet");
  const finderPeers = ["projects", "disk", "textDisk"].map((name) => vmw.windowElement(name));
  const floppyRetired = invisibleReasons(floppy).length > 0;
  const peerStillShowing = finderPeers.filter((win) => invisibleReasons(win).length === 0);
  test.assert(
    !floppyRetired || peerStillShowing.length === 0,
    floppyRetired && peerStillShowing.length
      ? `Question Sheet retired the File Floppy alone, while ${peerStillShowing.length} Finder window(s) stayed on screen`
      : "the File Floppy is never retired on its own while other Finder windows stay on screen",
  );
}

// --- The same route in MultiFinder: the Question Sheet opens BESIDE it ------
// MultiFinder is the product's own way of keeping two applications on screen,
// so this is where "material in hand while writing" is a real requirement.
{
  const vmw = createAppBootVm();
  seedProject(vmw);
  vmw.run(`runtimeEnvironment = "multifinder";`);
  const floppy = vmw.windowElement("rag");

  await vmw.context.openWindow("projects");
  await vmw.context.openWindow("rag");
  assertUsable(vmw, floppy, "MultiFinder, beside Project Hard Disk");

  await vmw.context.openWindow("questionSheet");
  assertUsable(vmw, floppy, "MultiFinder, beside the Question Sheet");
}

// --- The same trap, one step later on the route -----------------------------
// The File Floppy VOLUME window (textDisk) is a real Finder page, so it keeps
// browse-in-place. That rule may retire the location the writer stepped away
// from; it must not retire an unrelated volume. Project Hard Disk and the
// mounted File Floppy are two volumes on the same startup disk, and the route
// uses both.
{
  const vmw = createAppBootVm();
  seedProject(vmw);
  const mounted = vmw.windowElement("textDisk");

  await vmw.context.openWindow("textDisk");
  await vmw.context.openWindow("projects");

  const reasons = invisibleReasons(mounted);
  test.assert(
    reasons.length === 0,
    reasons.length
      ? `the mounted File Floppy was hidden as a bystander: ${reasons.join(", ")}`
      : "the mounted File Floppy stays open when Project Hard Disk opens",
  );
  test.assert(
    invisibleReasons(vmw.windowElement("projects")).length === 0,
    "Project Hard Disk opens beside the mounted File Floppy instead of replacing it",
  );
}

// --- Browse-in-place still browses in place ---------------------------------
// The rule above must not become "never replace anything": a step UP the
// location tree is real navigation, and one window follows the path.
{
  const vmw = createAppBootVm();
  seedProject(vmw);

  await vmw.context.openWindow("projects");
  await vmw.context.openWindow("disk");
  test.assert(
    vmw.windowElement("projects").classList.contains("is-hidden"),
    "opening the parent location still retires the child location it replaces",
  );
}

// --- Insert File Floppy is a dialog, not a Finder page ----------------------
// index.html gives it a close box, a file picker and one default button: no
// icon grid, no list, no zoom and no shade box. DESIGN.md's Object Vocabulary
// calls a Finder surface an "Icon grid or list" with object-first verbs --
// this is none of that, and its twin task dialog (Write to Project Hard Disk)
// is already declared a dialog for the same reason.
{
  const windowManager = read("app/core/window-manager.js");
  const finderPages = windowManager.match(/const mobileFinderPageWindowNames = new Set\(\[[\s\S]*?\]\);/)?.[0] || "";
  const dialogs = windowManager.match(/const mobileDialogWindowNames = new Set\(\[[\s\S]*?\]\);/)?.[0] || "";
  test.assertNotIncludes(finderPages, '"rag"', "Insert File Floppy is not declared a Finder page");
  test.assertIncludes(dialogs, '"rag"', "Insert File Floppy is declared a task dialog");
  test.assertIncludes(finderPages, '"textDisk"', "the mounted File Floppy volume stays a Finder page");
}

test.finish();
// See route-stops-focus.test.mjs on this line: a real boot can leave
// unrelated background async work in flight, and test.finish() does not exit
// on success.
process.exit(0);
