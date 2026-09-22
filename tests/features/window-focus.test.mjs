// Opening a window has to put the keyboard in it.
//
// Before this contract, document.activeElement stayed on <body> after a window
// opened, so the next Tab walked the desk icons *behind* the window the person
// had just opened. Modals already moved focus (core/modal.js); ordinary windows
// did not. The guidelines are explicit on both ends: focus tells people which
// object their input targets (Focus and selection › Best practices), and a
// desktop app has to work with the keyboard alone (Accessibility › Speech).
//
// The window itself takes the focus rather than its first control, so the next
// Tab lands inside the window rather than behind it, and nothing starts typing
// that the person did not ask for. This runs the real boot: the VM's DOM shim
// tracks activeElement through focus()/blur() exactly as the browser does.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("window-focus");
const vmw = createAppBootVm();

const active = () => vmw.run(`(() => {
  const node = document.activeElement;
  if (!node) return "(none)";
  const win = String(node.className || "").includes("window")
    ? (node.dataset?.window || "")
    : (node.closest?.(".window[data-window]")?.dataset?.window || "");
  return win || node.tagName || "";
})()`);

test.assertIncludes(vmw.run('document.querySelectorAll(".window[data-window]").length > 0 ? "yes" : "no"'), "yes", "the desk has windows to open");

// 1. A window opened through its own command takes the focus.
await vmw.context.handleAction("open-demo-disks");
await vmw.waitFor(() => active() === "projectDisks");
test.assert(
  active() === "projectDisks",
  `opening a window puts the keyboard in it (activeElement would otherwise stay on <body>, and the next Tab would walk the desk behind it)`,
);
test.assert(
  vmw.run('document.querySelector(\'.window[data-window="projectDisks"]\').getAttribute("tabindex") === "-1"'),
  "the window is focusable as a container, so Tab continues inside it",
);

// 2. Focus that is already inside the window is not stolen.
await vmw.run(`(() => {
  const win = document.querySelector('.window[data-window="projectDisks"]');
  const button = win.querySelector(".btn");
  button.focus();
})()`);
await vmw.context.handleAction("open-demo-disks");
await vmw.waitFor(() => vmw.run('document.activeElement?.className === "btn"'));
test.assert(
  vmw.run('document.activeElement?.className === "btn"'),
  "reopening a window keeps the focus the person already had inside it",
);

// 3. Closing the window the keyboard was in hands focus to what is left, so the
//    next Tab resumes where the person is looking instead of nowhere.
await vmw.context.handleAction("open-project-disks");
await vmw.waitFor(() => active() === "projects");
const projectsFocused = active() === "projects";
await vmw.context.handleAction("close-window");
await vmw.waitFor(() => active() === "projects");
test.assert(
  projectsFocused && active() === "projects",
  "closing a window hands the keyboard to the window that takes over (nothing is left focused on the closed one)",
);

test.finish();
process.exit(0);
