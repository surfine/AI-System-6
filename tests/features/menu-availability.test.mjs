// Contract: every menu row must know when it is unavailable.
//
// Why this test exists: updateMenuState() greys a row only when its action has
// an entry in getActionAvailability(). An action missing from that map is not
// "enabled by default" in any deliberate sense — it is simply never asked, so
// the row stays black forever. Finder's File menu had 20 such rows; 18 of them
// answered a click with setStatus("select an item first"), which is a status
// line standing in for a disabled state that was never wired.
//
// System 6's rule is the opposite: a control that cannot act is grey, and the
// grey itself is the information. So the default here is "gate it", and every
// exception has to be written down in ALWAYS_AVAILABLE with a reason.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("menu-availability");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");

// --- every action a menu can dispatch ---------------------------------------
const menuActions = [...new Set([...menus.matchAll(/menuItem\("([a-z0-9-]+)"/g)].map((m) => m[1]))];
test.assert(menuActions.length > 200, "menus.js declares the application menu actions");

// --- every action getActionAvailability() answers for ------------------------
const availabilityBlock = windowManager.slice(
  windowManager.indexOf("function getActionAvailability()"),
  windowManager.indexOf("function updateMenuState()")
);
test.assert(!!availabilityBlock, "window-manager declares getActionAvailability()");
const gated = new Set([...availabilityBlock.matchAll(/^\s{4}"([a-z0-9-]+)":/gm)].map((m) => m[1]));
test.assert(gated.size > 200, "getActionAvailability() answers for the menu actions");

// --- the written-down exceptions ---------------------------------------------
// Each entry is an action that is genuinely valid whenever its menu is open.
// Adding a row here is a decision, not a default: say why.
const ALWAYS_AVAILABLE = new Map([
  // Navigation: opening a writing-route window is valid from anywhere.
  ["open-quick-draft", "navigation — opening a route window is always valid"],
  ["open-question-sheet", "navigation"],
  ["open-outline", "navigation"],
  ["open-section-drafts", "navigation"],
  ["open-teachtext-manuscript", "navigation"],
  ["open-image-manager", "navigation"],
  ["new-note", "creating an empty note needs no selection"],
  // Theme toggle owns its own label swap in updateMenuState().
  ["toggle-liquid-glass", "theme switch is valid in both directions"],
]);

// Time Machine's own menu is a known, bounded debt: its verbs live in a lazy
// module whose state getActionAvailability() cannot see at startup. Ratcheted
// so the debt can shrink but not grow.
const timeMachineActions = menuActions.filter((action) => action.startsWith("time-machine-") && !gated.has(action));
const TIME_MACHINE_UNGATED_BUDGET = 17;
test.assert(
  timeMachineActions.length <= TIME_MACHINE_UNGATED_BUDGET,
  `Time Machine ungated verbs stay within budget (${timeMachineActions.length}/${TIME_MACHINE_UNGATED_BUDGET})`
);

// --- the gate ----------------------------------------------------------------
const ungated = menuActions.filter((action) => (
  !gated.has(action)
  && !ALWAYS_AVAILABLE.has(action)
  && !action.startsWith("time-machine-")
));

test.assert(
  ungated.length === 0,
  ungated.length
    ? `every menu action is gated or explicitly exempt — ungated: ${ungated.join(", ")}`
    : "every menu action is gated or explicitly exempt"
);

// --- the verbs that used to fake it ------------------------------------------
// These are the rows from the Finder File menu audit. Pinned by name so a
// future refactor cannot quietly drop their gating again.
[
  "install-mounted-skill",
  "preview-mounted-skill",
  "toggle-project-memory",
  "toggle-project-skill",
  "attach-retrospective-next-task",
  "create-skill-draft-from-retrospective",
  "create-project-skill-from-draft",
  "view-modification-suggestion-diff",
  "accept-modification-suggestion",
  "reject-modification-suggestion",
  "create-task-config-from-draft",
  "run-task-config",
  "pause-task-config",
  "resume-task-config",
  "complete-task-config",
  "cancel-task-config",
  "create-task-checkpoint",
  "restore-task-checkpoint",
].forEach((action) => {
  test.assert(gated.has(action), `${action} reports its own availability`);
});

// Task lifecycle verbs must be mutually exclusive: their grey/black pattern is
// how the menu says which step the task is on.
test.assertMatches(
  availabilityBlock,
  /"pause-task-config": selectedTaskLifecycle === "running"/,
  "pause is offered only while the task is running"
);
test.assertMatches(
  availabilityBlock,
  /"resume-task-config": selectedTaskLifecycle === "paused"/,
  "resume is offered only while the task is paused"
);
test.assertMatches(
  menus,
  /menu\("task", "menu_task", \[[\s\S]*?run-task-config[\s\S]*?restore-task-checkpoint[\s\S]*?\], \{ menuCondition: "task-menu" \}\)/,
  "Finder task lifecycle commands live in their own conditional top-level menu"
);
test.assertIncludes(
  menus,
  "if (definition.menuCondition) menuElement.dataset.menuCondition = definition.menuCondition;",
  "The menu renderer exposes top-level availability to the shared condition gate"
);
test.assertIncludes(
  windowManager,
  "btn.disabled = !state[action];",
  "Unavailable menu commands use native disabled semantics as well as visual dimming"
);

test.finish();
