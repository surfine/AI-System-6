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
const actions = read("app/core/actions.js");
const reader = read("app/features/reader.js");
const scrapbook = read("app/features/scrapbook.js");
const timeMachine = read("app/features/time-machine.js");
const bureaucracyMeme = read("app/features/bureaucracy-meme.js");
const soundscape = read("app/features/soundscape.js");
const clioChart = read("app/features/clio-chart.js");
const clioProject = read("app/features/clio-project-window.js");
const clioStage = read("app/features/clio-stage.js");
const cmfStudio = read("app/features/cmf-studio.js");
const liquidCover = read("app/features/liquid-cover.js");
const endfieldTerminal = read("app/features/endfield-terminal.js");
const quickDraftHandoff = read("app/features/quick-draft-handoff.js");
const docMap = read("app/features/docmap.js");
const runtime = read("app/core/runtime.js");

for (const removedAction of [
  "resummarize-chat-title",
  "move-project-trash",
  "guide-use-finder",
  "guide-use-multifinder",
  "guide-open-control",
  "guide-learn-flow",
  "copy-native-brief",
  "export-native-handoff",
  "toggle-tool-dock",
  "clear-question-sheet",
  "save-questions",
  "restore-questions-to-outline",
  "insert-outline-hkrr-intent",
  "clear-outline",
  "save-outline",
  "save-section-draft",
  "insert-to-teachtext",
  "open-disk",
  "save-last",
  // An alias for the Dictation Pad that nothing ever dispatched: no menu row,
  // no button, no shortcut. It still carried an availability entry, so the map
  // looked one row more honest than the menu bar was. "open-dictation" is the
  // live command and shares the same handler.
  "intent-key",
]) {
  test.assertNotIncludes(actions, `"${removedAction}"`, `${removedAction} does not survive as a hidden command handler`);
}

// --- every action a menu can dispatch ---------------------------------------
const menuActions = [...new Set([...menus.matchAll(/menuItem\("([a-z0-9-]+)"/g)].map((m) => m[1]))];
test.assert(menuActions.length > 200, "menus.js declares the application menu actions");

// --- every action getActionAvailability() answers for ------------------------
const availabilityBlock = windowManager.slice(
  windowManager.indexOf("function getActionAvailability()"),
  windowManager.indexOf("function updateMenuState()")
);
test.assert(!!availabilityBlock, "window-manager declares getActionAvailability()");
const commandBlocks = [
  reader.slice(reader.indexOf("const rlist=["), reader.indexOf("];", reader.indexOf("const rlist=["))),
  scrapbook.slice(scrapbook.indexOf("const slist=["), scrapbook.indexOf("];", scrapbook.indexOf("const slist=["))),
];
const runtimeCommandIds = new Set(
  [
    ...commandBlocks.flatMap((block) => [...block.matchAll(/\[\s*"([a-z0-9-]+)"/g)].map((match) => match[1])),
    ...timeMachine.matchAll(/"(open-time-machine|time-machine-[a-z0-9-]+)"/g).map((match) => match[1]),
    ...bureaucracyMeme.matchAll(/"(open-bureaucracy-meme|meme-[a-z0-9-]+)"/g).map((match) => match[1]),
    ...soundscape.matchAll(/"(open-soundscape|soundscape-[a-z0-9-]+)"/g).map((match) => match[1]),
    ...clioChart.matchAll(/"(open-clio-chart|see-as-chart|clio-chart-[a-z0-9-]+)"/g).map((match) => match[1]),
    // ClioProject registers its verbs with their own isAvailable, ClioChart's way.
    ...clioProject.matchAll(/"(open-clio-project|clio-project-[a-z0-9-]+)"/g).map((match) => match[1]),
    ...clioStage.matchAll(/"(open-clio-stage|clio-stage-[a-z0-9-]+|focus-clio-stage-question)"/g).map((match) => match[1]),
    ...cmfStudio.matchAll(/"(open-cmf-studio|cmf-[a-z0-9-]+)"/g).map((match) => match[1]),
    ...liquidCover.matchAll(/"(open-liquid-cover|cover-[a-z0-9-]+)"/g).map((match) => match[1]),
    ...[
      "micropolis-new-city",
      "micropolis-save-city",
      "micropolis-open-city",
      "micropolis-budget",
      "micropolis-evaluation",
      "micropolis-disaster-fire",
      "micropolis-disaster-flood",
      "micropolis-disaster-tornado",
      "micropolis-disaster-earthquake",
      "micropolis-disaster-monster",
      "micropolis-disaster-crash",
      "micropolis-disaster-meltdown",
      "micropolis-pause",
      "micropolis-speed-slow",
      "micropolis-speed-med",
      "micropolis-speed-fast",
    ],
    ...endfieldTerminal.matchAll(/"(open-endfield-terminal|endfield-[a-z0-9-]+)"/g).map((match) => match[1]),
    // 文字亮室's verbs are registered beside Quick Draft's but answer to their
    // own rule, lightroomCommandAvailable(), so they are gated the same way.
    ...quickDraftHandoff.matchAll(/"(open-quick-draft|quick-draft-[a-z0-9-]+|lightroom-[a-z0-9-]+)"/g).map((match) => match[1]),
    ...docMap.matchAll(/"(open-docmap|docmap-[a-z0-9-]+|focus-docmap-question)"/g).map((match) => match[1]),
  ]
);
const gated = new Set([
  ...availabilityBlock.matchAll(/^\s{4}"([a-z0-9-]+)":/gm),
  ...runtimeCommandIds,
].map((value) => (typeof value === "string" ? value : value[1])));
test.assert(gated.size > 200, "getActionAvailability() answers for the menu actions");
test.assert(runtimeCommandIds.size > 0, "registered runtime commands answer for their menu rows");
test.assertIncludes(runtime, "function dispatchCommand", "runtime commands have an explicit dispatcher");

// --- the written-down exceptions ---------------------------------------------
// Each entry is an action that is genuinely valid whenever its menu is open.
// Adding a row here is a decision, not a default: say why.
// "Navigation" is not an exemption on its own: the writing-route windows are
// withheld in the desktop workspace profile, so a row that never reports its
// availability stays black while the click is refused. Those four now answer
// through getActionAvailability() like open-review-desk always did.
const ALWAYS_AVAILABLE = new Map([
  // Navigation: opening the manuscript is valid in every workspace profile.
  ["open-teachtext-manuscript", "navigation"],
  ["new-note", "creating an empty note needs no selection"],
  // Appearance choices are always valid and update their own checked state.
  ["set-theme-classic", "Appearance choice is valid from every application"],
  ["set-theme-platinum", "Appearance choice is valid from every application"],
  ["set-theme-aqua", "Appearance choice is valid from every application"],
  ["set-theme-snow-leopard", "Appearance choice is valid from every application"],
  ["set-theme-yosemite", "Appearance choice is valid from every application"],
  ["set-theme-liquid-glass", "Appearance choice is valid from every application"],
]);

// Time Machine used to be exempt: its verbs live in a lazy module whose state
// getActionAvailability() cannot read directly. It reads it through the
// module's public menuState() instead, the same way it already read
// docMapReadiness(), so the debt is paid and the budget is zero. An unloaded
// Time Machine returns nothing and every row stays grey.
const timeMachineActions = menuActions.filter((action) => action.startsWith("time-machine-") && !gated.has(action));
const TIME_MACHINE_UNGATED_BUDGET = 0;
test.assert(
  timeMachineActions.length <= TIME_MACHINE_UNGATED_BUDGET,
  `Time Machine ungated verbs stay within budget (${timeMachineActions.length}/${TIME_MACHINE_UNGATED_BUDGET})`
);
test.assertIncludes(
  quickDraftHandoff,
  "function lightroomCommandAvailable",
  "the darkroom answers for its own rows instead of borrowing Quick Draft's rule"
);
test.assertIncludes(
  quickDraftHandoff,
  'if (!["quickDraft", "lightroom"].includes(frontWindow)) return false;',
  "the shared rows accept either front window, so the darkroom's bar is not grey by construction"
);
test.assertIncludes(
  timeMachine,
  "function timeMachineCommandAvailable",
  "Time Machine availability comes from the module that owns the state"
);
for (const marker of [
  "time-machine-back",
  "time-machine-forward",
  "time-machine-stop",
  "time-machine-clip",
  "time-machine-preserve-wayback",
]) {
  test.assertIncludes(timeMachine, marker, `${marker} greys on its own precondition`);
}

// --- the gate ----------------------------------------------------------------
const ungated = menuActions.filter((action) => (
  !gated.has(action)
  && !ALWAYS_AVAILABLE.has(action)
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

// --- rows that answered with the literal `true` ------------------------------
// A literal is invisible to the gate above: an action present in the map counts
// as gated whether its answer is a condition or a permanent yes. These rows had
// a real precondition hiding behind the literal, and each condition below is
// the one the handler already checked before refusing with a status line.
for (const [action, condition] of [
  ["rebuild-use-reader", "hasReaderTextForRebuild"],
  ["rebuild-use-teachtext", "hasTeachTextTextForRebuild"],
  ["run-rebuild-flow", "rebuildSourceLength >= rebuildMinSourceChars"],
  ["review-view-manuscript", "canViewReviewManuscript"],
]) {
  test.assertIncludes(availabilityBlock, `"${action}": ${condition},`, `${action} greys on its own precondition`);
}

// The Rebuild button and runRebuildFlow() must not drift apart on how much
// source is enough, so the number has one home.
test.assertIncludes(
  read("app/core/config.js"),
  "rebuildMinSourceChars: 400,",
  "the rebuild source minimum is one shared constant"
);
test.assertIncludes(
  read("app/features/writing-flow.js"),
  "if (sourceText.length < rebuildMinSourceChars) {",
  "runRebuildFlow() refuses on the same number the menu greys on"
);
test.assertIncludes(
  read("app/features/documents-chat.js"),
  "function canEnterTeachTextReviewState(",
  "the Review Desk precondition is a predicate the menu can ask without side effects"
);

// "Use Reader" means the loaded page, not whatever the pane is painting. The
// innerText fallback captured the Reader's own empty-state sentence, so with
// nothing open the button reported success and handed the flow 47 characters of
// UI chrome — and no gate keyed on it could ever grey.
test.assertNotIncludes(
  read("app/features/writing-flow.js"),
  "readerContentEl?.innerText",
  "the rebuild source is the loaded Reader page, never the pane's empty state"
);

// The literals that survive, each with the reason it cannot refuse. Listed so
// deleting the entry — which silently restores the never-asked bug — fails.
const DELIBERATE_LITERALS = new Map([
  ["new-document", "a scratch document needs no project; new-text-document is the project-backed verb"],
  ["open-text-document", "same scratch document, opened from a file the user picks"],
  ["rebuild-use-clipboard", "the OS clipboard cannot be read while the menu is drawn"],
  ["rebuild-use-sample", "the sample article ships in the same lazy bundle as the flow"],
  ["close-rebuild-flow", "Cancel is reachable only from inside the window it closes"],
  ["open-rebuild-flow", "opening the window is valid wherever the studio is"],
  ["open-context-panel", "opens a window"],
  ["open-find-file", "opens a window"],
  ["open-find-path", "opens a window"],
  ["open-dictation", "the pad names the Note Pad as its destination when no field is open"],
]);
for (const [action, reason] of DELIBERATE_LITERALS) {
  test.assert(gated.has(action), `${action} still answers getActionAvailability() (${reason})`);
}

// A command name must not outlive its handler.
//
// model-roles.js lists the commands that cannot finish without a model, so the
// menus can grey them out. When a command is deleted, a name left behind here
// is a rule about something that no longer exists -- harmless to run, and
// exactly the kind of stale reference that made 43 controls look alive for
// three months. Five names survived one deletion pass because the pass covered
// actions.js and window-manager.js and forgot this file.
const modelRoles = read("app/core/model-roles.js");
const registeredNames = new Set([
  ...read("app/core/actions.js").matchAll(/"([a-z][a-z0-9-]{3,})":/g),
].map((m) => m[1]));
const orphanRoles = [...modelRoles.matchAll(/^\s*"([a-z][a-z0-9-]{3,})",/gm)]
  .map((m) => m[1])
  .filter((name) => !registeredNames.has(name));
test.assert(
  orphanRoles.length === 0,
  orphanRoles.length === 0
    ? "every command in the model-backed set still has a handler"
    : `model-backed command names with no handler left: ${orphanRoles.join(", ")}`,
);

test.finish();
