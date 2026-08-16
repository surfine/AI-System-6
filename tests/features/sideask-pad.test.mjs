// The SideAsk pad is the Apple menu's door onto SideAsk: one question about
// whatever window is in front, answered here and saved nowhere.
//
// It used to call the model directly. That made it the one surface on the desk
// where a run could not be stopped, where no reading tool was available, where
// the assistant's activity state was never reported, and where the shared
// prompt stack — including the rule that project text is data and not
// instructions — was skipped. This contract holds it to the same runtime as
// every other model call, without letting it grow into a second ClioTalk.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("sideask-pad");

const pad = read("app/features/sideask-pad.js");
const coordinator = read("app/core/writing-agent-coordinator.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

// Both of the pad's model calls go through the writing agent.
test.assertNotIncludes(pad, "fetchModelPayload(", "the pad no longer calls the model behind the agent's back");
test.assertIncludes(pad, 'taskKind: "sideask"', "the pad's run is a SideAsk task, which is what turns the reading tools on");
test.assertIncludes(coordinator, "^(chat|sideask|reader|scrapbook|docmap-question)$", "sideask is one of the task kinds allowed to use the writing tools");

// Its own small shape survives: the pad hands over a payload rather than
// inheriting ClioTalk's whole conversation.
test.assertIncludes(pad, "payload: {", "the pad keeps its own one-line brief and paired excerpt");
test.assertIncludes(pad, "sideAskSubject?.text.slice(0, 4000)", "a long manuscript still cannot quietly become the whole request");

// A run you cannot stop was the defect. One button, two states, same gesture
// as ClioTalk's composer.
test.assertIncludes(pad, "sideAskAbort = new AbortController()", "the pad owns an abort handle");
test.assertIncludes(pad, "signal: sideAskAbort.signal", "the handle is the signal the run actually watches");
test.assertIncludes(pad, "sideAskAbort?.abort();", "pressing the button while busy stops the run");
test.assertIncludes(pad, 'pad.ask.dataset.i18n = sideAskBusy ? "stop" : "ask"', "Ask becomes Stop in place rather than growing a second control");
test.assertIncludes(pad, 'error?.name === "AbortError" ? "ready"', "a stopped run returns the pad to ready, not to a failure message");

// The interviewer reads the sheet in front of it and nothing else: a run that
// wandered off to search sources would be answering its own question instead of
// asking the writer one.
test.assertIncludes(pad, "disableAgentTools: true", "the Question Sheet interview runs with the reading tools switched off");
test.assertIncludes(coordinator, "input.options?.disableAgentTools !== true", "the coordinator honours a task that declines the tools");

// What it read, said in the surface that already says it for ClioTalk.
test.assertIncludes(pad, "function showSideAskBasis()", "the pad states what its answer stood on");
test.assertIncludes(pad, "appendMessageGrounding(pad.answer, grounding)", "it reuses ClioTalk's basis strip instead of a second one that would drift");
test.assertIncludes(pad, 'pad.answer.querySelector(".message-grounding-strip")?.remove()', "the basis leaves with the answer it belonged to");
test.assertIncludes(pad, "function sideAskPadToolStatus(", "the status cell says which object is being read while a run is reading");

// The pad stays a pad.
test.assertIncludes(pad, "sideask_pad_temporary", "the reply is still labelled as saved nowhere");
test.assertNotIncludes(pad, "persistClioTalkConversationMutation", "the pad never writes itself into a conversation file");
for (const key of ["ask", "stop", "sideask_pad_asking", "sideask_pad_failed"]) {
  test.assertIncludes(translationsEn, `${key}:`, `English carries the pad's ${key} copy`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese carries the pad's ${key} copy`);
}

// ---- The row of verbs holds one line ---------------------------------------
//
// Paired with the Question Sheet the pad shows a fourth button, and four
// buttons did not fit 340px. The shared row wraps before it shrinks, so Ask --
// the default, the whole point of the pad -- dropped to a line of its own
// below the others: the pad's most useful state was its broken one. Measured
// before: row 47px tall, Ask on line 2. After: 20px, Ask on line 1.
const windowStyles = read("styles/10-windows.css");

test.assertIncludes(
  pad,
  '<div class="button-row is-one-line">',
  "the pad's row is the one-line variant, because its fourth button is what broke it"
);
test.assertMatches(
  pad,
  /<span class="spacer"><\/span>\s*<button class="btn default"/,
  "a spacer separates the verbs from the default button, the shape the other accessories use"
);
test.assertIncludes(windowStyles, ".button-row.is-one-line {", "the one-line row is a named variant of the shared row");
test.assertMatches(
  windowStyles,
  /\.button-row\.is-one-line \{[^}]*flex-wrap: nowrap;/,
  "the variant is defined by refusing to wrap"
);
test.assertMatches(
  windowStyles,
  /\.button-row\.is-one-line > \.btn \{[^}]*text-overflow: ellipsis;/,
  "a label too long for the row loses its tail rather than the row losing its line"
);
// min-width is the shared .btn floor and must stay: releasing it let every
// button shrink proportionally, truncating the default button this row exists
// to keep whole.
test.assertNotMatches(
  windowStyles,
  /\.button-row\.is-one-line > \.btn \{[^}]*min-width: 0;/,
  "the shared button floor stays, so the short essential verbs keep their whole labels"
);

test.finish();
