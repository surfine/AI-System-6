// Teaser mode contracts: a seeded, deterministic 15–30s walkthrough that
// needs no model or network, clearly labels its material as Demo, restores
// the user's desk and project on exit, stays stoppable (Escape / button,
// including phone viewports), and never fakes a live run.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-demo-teaser");
const writingDemo = read("app/features/writing-demo.js");
const teaserSection = writingDemo.split("// ---- Teaser mode")[1] || "";
const actions = read("app/core/actions.js");
const indexHtml = read("index.html");
const appJs = read("app.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// API surface: teaser shares the demo engine but runs under its own mode.
test.assertIncludes(writingDemo, "playTeaser:", "the writing demo API exposes a teaser mode");
test.assertIncludes(writingDemo, "stopTeaser:", "the teaser mode can be stopped");
test.assertIncludes(writingDemo, 'mode: "teaser"', "the teaser runs under its own mode marker");
test.assertIncludes(writingDemo, "teaserDemoSceneSource", "teaser scene 1 (a modern source enters the desktop) exists");
test.assertIncludes(writingDemo, "teaserDemoSceneTransform", "teaser scene 2 (material transforms across apps) exists");
test.assertIncludes(writingDemo, "teaserDemoSceneResult", "teaser scene 3 (the result is a file) exists");
test.assertIncludes(writingDemo, "teaserDemoRestore", "the teaser restores the user's desk");
test.assertIncludes(writingDemo, "switchProject(snapshot.projectId)", "the teaser restores the prior project");
test.assertIncludes(writingDemo, "seeded: true", "teaser files are explicitly marked as seeded");

// No live capability is faked inside the teaser path.
test.assertNotIncludes(teaserSection, "fetchModelPayload", "the teaser never calls the model");
test.assertNotIncludes(teaserSection, "searchFindPath", "the teaser never runs a live search");
test.assertNotIncludes(teaserSection, "writingDemoRunPreflight", "the teaser needs no live preflight");
test.assertNotIncludes(teaserSection, "writingDemoProbeModel", "the teaser does not probe a model");
test.assertNotIncludes(teaserSection, "ensureSlidesExportModule", "the teaser never needs the slides generator");
test.assertIncludes(teaserSection, "Demo", "teaser captions and fixtures label the material as Demo");
test.assertIncludes(teaserSection, "The AI has a desktop now", "the teaser ends on the product slogan");

// Exit paths: Escape routes through the teaser stop, and the stop button
// exists for touch viewports.
test.assertIncludes(writingDemo, 'writingDemoRun.mode === "teaser"', "Escape stops the teaser");
test.assertIncludes(writingDemo, "writingDemoSetTeaserButtons", "the teaser has its own start/stop button state");
test.assertIncludes(writingDemo, "teaser-demo-running", "the teaser marks its running surface distinctly from the full demo");

// Entry points: Start Here button, registered action, Applications item,
// and bilingual labels.
test.assertIncludes(actions, '"play-teaser-demo"', "the teaser action is registered");
test.assertIncludes(actions, "playTeaserDemoFromGuide", "Start Here can launch the teaser");
test.assertIncludes(indexHtml, 'data-action="play-teaser-demo"', "Start Here shows a 30-second demo button");
test.assertIncludes(appJs, "play-teaser-demo", "the Applications folder lists the teaser");
test.assertIncludes(en, "guide_play_teaser_demo:", "English labels the teaser");
test.assertIncludes(zh, "guide_play_teaser_demo:", "Chinese labels the teaser");

// The full live demo is preserved untouched.
test.assertIncludes(writingDemo, "play: playWritingDemo", "the full live demo entry stays intact");
test.assertIncludes(writingDemo, "writingDemoRunPreflight", "the full demo still preflights its real capabilities");

// System-surface wiring for the shared story (receipts + activity visible
// without new windows).
const persistenceStatus = read("app/core/persistence-status.js");
const finderObjects = read("app/features/finder-objects.js");
const coordinator = read("app/core/writing-agent-coordinator.js");
test.assertIncludes(persistenceStatus, "renderAssistantActivityRow", "System Status renders the assistant activity row");
test.assertIncludes(persistenceStatus, "renderSystemRecentRuns", "System Status renders recent runs");
test.assertIncludes(persistenceStatus, "dataset.assistantState", "System Status exposes the semantic activity hook");
test.assertIncludes(finderObjects, "renderRunReceiptInfo", "Get Info renders produced-by provenance");
test.assertIncludes(finderObjects, "run_receipt_repeat", "Get Info offers Repeat This Run");
test.assertIncludes(coordinator, "reportRunTransition", "writing agent runs feed the activity state");

// One-time hint is a light pointer, never a carousel.
const writerGuide = read("app/features/writer-guide.js");
test.assertIncludes(writerGuide, "let teaserHintShown = false", "the teaser hint is shown at most once without a new persistence boundary");
test.assertIncludes(writerGuide, 'actionId: "play-teaser-demo"', "the hint opens the teaser directly");

test.finish();
