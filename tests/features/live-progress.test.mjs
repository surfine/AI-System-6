// Live progress: durable typing (B) and the cross-window mirror (C).
//
// Two guarantees that used to be one problem. Losing the write lease, or the
// tab, used to cost whatever had been typed since the last discrete save; and
// a window without the pen was frozen rather than merely read-only.
//
// The distinction that must not blur: this protects PROGRESS (the project
// record), while an explicit Save makes a FILE (the TeachText document).
// Deliberate saving is a product value, so nothing here may report "Saved".

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("live-progress");

const persistence = read("app/core/persistence-status.js");
const wireup = read("app/core/wireup.js");

// --- B. Typing becomes durable -------------------------------------------

test.assertIncludes(persistence, "function noteWorkingProgress", "typing schedules a durable commit");
test.assertIncludes(wireup, "noteWorkingProgress();", "the schedule hangs off the writing surfaces' input event");
test.assertIncludes(persistence, "liveProgressIdleMs", "the commit waits for a pause");
test.assertIncludes(persistence, "liveProgressMaxMs", "and lands anyway during a continuous run, so a writer cannot outrun the disk");
test.assertMatches(
  persistence,
  /function noteWorkingProgress\(\)[\s\S]*?canMutate\?\.\(\) !== true\) return;/,
  "a window without the pen never commits",
);
test.assertMatches(
  persistence,
  /function commitWorkingProgress\(\)[\s\S]*?savePipelineData\(\);/,
  "the commit goes through the route's own save path, which already ends in saveDeskState()",
);
test.assertIncludes(persistence, 'window.addEventListener("pagehide", () => flushWorkingProgress())', "a pending commit is flushed when the window goes away");
test.assertMatches(
  persistence,
  /visibilityState === "hidden"\) flushWorkingProgress\(\)/,
  "and when the tab is hidden, which is the common case for leaving",
);

// Deliberate saving is a product value: autosaving progress must never claim a
// document was filed.
const liveProgressBlock = persistence.slice(
  persistence.indexOf("// Live progress:"),
  persistence.indexOf("function saveDeskState()"),
);
test.assertNotIncludes(liveProgressBlock, 'setTeachTextStatus("saved")', "committing progress never reports the document as saved");
test.assertNotIncludes(liveProgressBlock, 'setStatus(t("saved"))', "and never writes a saved receipt to the status line");

// --- C. The mirror --------------------------------------------------------

test.assertIncludes(persistence, 'const liveProgressChannelName = "ai-system6-content"', "the mirror has its own channel, separate from the lease's");
test.assertMatches(
  persistence,
  /function commitWorkingProgress\(\)[\s\S]*?broadcastWorkingText\(project\)/,
  "the mirror rides on the commit, so one payload is always a coherent project record",
);
test.assertMatches(
  persistence,
  /function broadcastWorkingText\(project\)[\s\S]*?questionSheet[\s\S]*?outline[\s\S]*?drafts/,
  "the payload carries the whole working text, not one surface",
);
// The bug this cost an hour: a channel opened by the first send leaves exactly
// the windows that need the mirror as the ones not subscribed.
test.assertMatches(
  persistence,
  /Subscribe at load[\s\S]*?openLiveProgressChannel\(\);/,
  "the channel is opened at load, because a window without the pen never sends",
);
test.assertIncludes(persistence, "message.from === liveProgressInstanceId()) return", "a window ignores its own broadcast");
test.assertIncludes(persistence, "applyingMirroredText", "the repaint's own input events cannot bounce back out as a broadcast");

// The focus guard: right for the writer, wrong for the mirror.
test.assertIncludes(persistence, "function setMirroredEditorValue", "a mirror window repaints its editors directly");
test.assertMatches(
  persistence,
  /function setMirroredEditorValue[\s\S]*?const scrollTop = element\.scrollTop;[\s\S]*?element\.scrollTop = scrollTop;/,
  "and keeps the reader's place instead of jumping on every keystroke elsewhere",
);
test.assertMatches(
  persistence,
  /function setMirroredEditorValue[\s\S]*?dispatchEvent\(new Event\("input"/,
  "mirrored writes go through the input event so the markdown overlay repaints with them",
);
// Every window can be typed in now, so "pure reader" is no longer the same
// thing as "does not hold the lease". A window with uncommitted typing takes
// the focus-guarded path whatever the lease says, or the mirror repaints over
// keystrokes that were never saved.
test.assertMatches(
  persistence,
  /const isWriter = window\.AISystem6WriteLease\?\.canMutate\?\.\(\) === true\s*\|\|\s*liveProgressTimer !== 0;[\s\S]*?if \(isWriter\)/,
  "a window with uncommitted typing keeps the focus-guarded syncs; a pure reader repaints regardless of focus",
);

// --- Whatever is persisted is announced (item 9) -------------------------
//
// The concurrency revisit, and the answer is not a merge engine.
//
// The write lease already means only one window can mutate, so two writers
// cannot race. What was left was narrower and real: persistence and the mirror
// were two roads and only one of them told the other windows. The live-progress
// commit broadcast; saveDeskState did not. So every command that saves without
// typing -- adding a section, any structural edit of the outline, a toggle --
// put the store ahead of every other window's memory of the project, and the
// next window to take the pen wrote its older copy back over the top.
//
// Section ids (item 4) would make a per-section merge possible now. It is
// deliberately NOT built: the residual window was sub-second, a merge engine
// is a large piece of machinery to own forever, and the floppy budget has
// about 14 KB left. The invariant is cheaper and stronger.

test.assertIncludes(persistence, "function announceWorkingText", "there is one announcement");
test.assertMatches(
  persistence,
  /if \(saved\) \{[\s\S]*?announceWorkingText\(\);[\s\S]*?\}/,
  "and a successful persist makes it, whether or not anyone was typing",
);
test.assertMatches(
  persistence,
  /function commitWorkingProgress[\s\S]*?announceWorkingText\(\);/,
  "the typing path uses the same one, so a single dedupe covers both roads",
);
// Bounded to the body: announceWorkingText is where broadcastWorkingText is
// called from now, and an unbounded scan would find it there and call this a
// failure.
const commitWorkingProgressBody = persistence
  .slice(persistence.indexOf("function commitWorkingProgress"))
  .split("\n}\n")[0];
test.assertNotIncludes(commitWorkingProgressBody, "broadcastWorkingText", "and no second road announces on its own");

// Deduped on the payload: saveDeskState is called from many places, often
// twice for one action, and a mirror that repaints identical text is a scroll
// position lost for no reason.
test.assertIncludes(persistence, "let lastAnnouncedWorkingText", "repeat announcements of the same text are dropped");
test.assertMatches(
  persistence,
  /if \(fingerprint === lastAnnouncedWorkingText\) return;/,
  "compared on what would actually be sent, not on a timestamp",
);
test.assertMatches(
  persistence,
  /function announceWorkingText[\s\S]*?canMutate\?\.\(\) !== true\) return;/,
  "a window without the pen still never announces",
);

// The handover carries the last keystrokes with it. They live in the DOM until
// a commit pulls them into the record, and everything else in the flush
// persists the record.
const writeLease = read("app/core/write-lease.js");
test.assertMatches(
  writeLease,
  /async function flushOldWriterBeforeTakeover\(\) \{[\s\S]{0,320}?if \(typeof flushWorkingProgress === "function"\) flushWorkingProgress\(\);/,
  "the outgoing writer commits its typing before anything persists the record",
);

test.finish();
