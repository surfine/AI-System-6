// The organizing pass and the three small preferences, against the acceptance
// table in internal/plans/DICTATION-ENHANCEMENT-2026-10-03.acceptance.json.
//
// One request at a time, every answer checked against the identity and the
// revision it was asked for, nothing adopted that is not complete, and the raw
// text the writer owns always the fallback. The session module is the real
// production code; the wrapper behaviour below is app/core/config.js itself.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("dictation-clean");
const context = vm.createContext({ window: {}, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/core/dictation-session.js"), context);
const Session = context.window.AISystem6DictationSession;

function harness() {
  const timers = new Map();
  let nextTimer = 1;
  const session = Session.createSession({
    createRecognizer: () => null,
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const fire = (ms) => {
    for (const [id, timer] of [...timers]) {
      if (timer.ms === ms) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  return { session, fire, timers };
}

// C01 — an answer to an older version of the transcript is not written back.
{
  const { session } = harness();
  session.setRaw("版本A");
  const request = session.beginClean();
  session.setRaw("版本B");
  const result = session.completeClean(request.requestId, { descriptor: request, text: "旧的整理稿", finishReason: "stop" });
  test.assert(result.adopted === false, "C01: the stale answer is refused");
  test.assert(session.state.cleaned === "", "C01: it never reaches the cleaned field");
  test.assert(session.state.raw === "版本B", "C01: the writer's own version stands");
  test.assert(session.insertText().source === "raw", "C01: the insert source is the raw text");
}

// C02 — A becomes B and back to A: the revision still moved.
{
  const { session } = harness();
  session.setRaw("A");
  const request = session.beginClean();
  session.setRaw("B");
  session.setRaw("A");
  const result = session.completeClean(request.requestId, { descriptor: request, text: "整理稿", finishReason: "stop" });
  test.assert(result.adopted === false, "C02: identical text is still a different version");
  test.assert(session.state.rawRevision > request.rawRevision, "C02: the revision moved");
}

// C03 — a result that arrives after a cancel is dropped even when the request
// ignored its abort.
{
  const { session } = harness();
  session.setRaw("不要复活");
  const request = session.beginClean();
  session.cancelClean();
  session.clearRaw();
  const result = session.completeClean(request.requestId, { descriptor: request, text: "复活了", finishReason: "stop" });
  test.assert(result.reason === "stale", "C03: the late answer is stale");
  test.assert(session.state.raw === "" && session.state.cleaned === "", "C03: nothing comes back to life");
}

// C04 — the previous request's cleanup cannot clear the live one.
{
  const { session } = harness();
  session.setRaw("第一版");
  const first = session.beginClean();
  session.cancelClean();
  session.setRaw("第二版");
  const second = session.beginClean();
  session.completeClean(first.requestId, { descriptor: first, text: "第一版整理稿", finishReason: "stop" });
  test.assert(session.state.cleanBusy === true, "C04: the live request is still busy");
  test.assert(session.state.cleanTimer != null, "C04: its timeout is still its own");
  test.assert(second.requestId === session.state.cleanRequestId, "C04: the second request owns the identity");
  session.cancelClean();
}

// C05 — the entry itself dedupes, not the button.
{
  const { session } = harness();
  session.setRaw("同一句");
  const first = session.beginClean();
  const second = session.beginClean();
  test.assert(first && !second, "C05: a second request in the same turn returns nothing");
  session.cancelClean();
}

// C06 — a timeout is a timeout, not a quiet success.
{
  const { session, fire } = harness();
  session.setRaw("原文可用");
  const request = session.beginClean();
  fire(Session.LIMITS.CLEAN_TIMEOUT_MS);
  test.assert(session.state.status === "dictation_clean_timeout", "C06: the pad says it timed out");
  test.assert(session.state.cleanBusy === false, "C06: the request is over");
  test.assert(session.state.raw === "原文可用", "C06: the raw text was never at risk");
  const late = session.completeClean(request.requestId, { descriptor: request, text: "迟到的稿子", finishReason: "stop" });
  test.assert(late.reason === "stale", "C06: the late answer is dropped");
  test.assert(session.state.cleaned === "", "C06: and nothing was organized twice");
}

// C07 — a truncated answer is shown, never adopted.
{
  const { session } = harness();
  session.setRaw("一段有完整尾句的原文");
  const request = session.beginClean();
  const result = session.completeClean(request.requestId, { descriptor: request, text: "不完整的一半", finishReason: "length" });
  test.assert(result.adopted === false, "C07: a length stop is not a finished result");
  test.assert(session.state.cleanIncomplete === true, "C07: the pad says it is incomplete");
  test.assert(session.insertText().source === "raw", "C07: inserting keeps to the writer's words");
}

// C08 — only prose is organized.
{
  for (const [label, payload] of [
    ["empty content", { text: "", finishReason: "stop" }],
    ["non-string content", { text: { tool_calls: [{ id: "call_1" }] }, finishReason: "stop" }],
    ["a tool call with no text", { text: undefined, finishReason: "tool_calls" }],
    ["a filtered answer", { text: "被过滤", finishReason: "content_filter" }],
  ]) {
    const { session } = harness();
    session.setRaw("保留原文");
    const request = session.beginClean();
    const result = session.completeClean(request.requestId, { descriptor: request, ...payload });
    test.assert(result.adopted === false, `C08: ${label} is not adopted`);
    test.assert(session.insertText().source === "raw", `C08: ${label} leaves the raw text as the source`);
    test.assert(session.state.raw === "保留原文", `C08: ${label} leaves the transcript alone`);
  }
}

// A request that fails outright says so, and leaves the transcript usable.
{
  const { session } = harness();
  session.setRaw("原文仍在");
  const request = session.beginClean();
  const result = session.completeClean(request.requestId, { descriptor: request, error: true });
  test.assert(result.reason === "error", "C08: a failed request is not mistaken for an answer");
  test.assert(session.state.status === "dictation_clean_failed", "C08: the pad says the request failed");
  test.assert(session.state.raw === "原文仍在", "C08: the words stay available");
  test.assert(session.state.cleanBusy === false, "C08: and the pad is usable again");
}

// C09 — no completion marker: readable, checked, never auto-selected.
{
  const { session } = harness();
  session.setRaw("请保留");
  const request = session.beginClean();
  const result = session.completeClean(request.requestId, { descriptor: request, text: "请保留。" });
  test.assert(result.needsCheck === true, "C09: the answer is offered with a check notice");
  test.assert(session.state.cleaned === "请保留。", "C09: the writer can read it");
  test.assert(session.insertText().source === "raw", "C09: it is not the insert source on its own");
}

// C10 — the budget follows the transcript, and an over-long one is refused
// rather than cut.
{
  test.assert(Session.requestedCleanTokens(400) === 900, "C10: a short transcript keeps the 900-token floor");
  test.assert(Session.requestedCleanTokens(800) === 1456, "C10: 800 code points ask for 1456");
  test.assert(Session.requestedCleanTokens(2400) === 3856, "C10: the ceiling is 3856");
  test.assert(Session.requestedCleanTokens(99999) === Session.LIMITS.MAX_CLEAN_OUTPUT_TOKENS, "C10: and never above 4096");
  const { session } = harness();
  session.setRaw("字".repeat(2401));
  test.assert(session.beginClean() === null, "C10: 2401 code points start no request");
  test.assert(session.state.raw.length === 2401, "C10: and the tail is not cut off");
  test.assert(session.cleanBlockedReason() === "length", "C10: the reason is the length limit");
  test.assert(session.applyShaped("字".repeat(2401) + "\n"), "C10: shaping still works on a long transcript");
}

// C11 — a changed context invalidates the answer.
{
  const { session } = harness();
  session.setRaw("修正一个术语");
  const request = session.beginClean();
  session.setContext({ project: "另一个项目" });
  const result = session.completeClean(request.requestId, { descriptor: request, text: "整理稿", finishReason: "stop" });
  test.assert(result.adopted === false, "C11: a context change retires the request");
  test.assert(session.state.raw === "修正一个术语", "C11: the transcript is unchanged");
}

// C12 — an out-of-date cleaned draft is never selected, and `cleaned || raw`
// is gone.
{
  const { session } = harness();
  session.setRaw("旧原文");
  const request = session.beginClean();
  session.completeClean(request.requestId, { descriptor: request, text: "旧整理稿", finishReason: "stop" });
  test.assert(session.state.selectedSource === "cleaned", "C12: a current result is selected");
  session.setRaw("旧原文加上一个新的 final");
  test.assert(session.cleanedIsStale() === true, "C12: the older result is marked out of date");
  test.assert(session.selectSource("cleaned") === false, "C12: it cannot be reselected");
  test.assert(session.insertText().text === "旧原文加上一个新的 final", "C12: inserting uses the current transcript");
}

// C13 — the shared wrapper's defaults are unchanged, and dictation asks for
// less without losing the integrity boundary.
{
  const configContext = vm.createContext({
    window: {},
    document: { documentElement: { classList: { add() {}, remove() {} } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {},
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
  });
  vm.runInContext(read("app/core/config.js"), configContext);
  const integrity = { hasIntegrityInstruction: () => false, instruction: () => "INTEGRITY" };
  const humanizer = { hasHumanizerInstruction: () => false, instruction: () => "HUMANIZER" };
  configContext.window.AISystem6SystemIntegrity = integrity;
  configContext.window.AISystem6Humanizer = humanizer;
  const wrapper = configContext.withMarkdownModelMessages;
  const plain = wrapper([{ role: "user", content: "x" }]).map((message) => message.content).join("|");
  test.assert(plain.includes("Markdown"), "C13: the default call keeps the Markdown instruction");
  test.assert(plain.includes("HUMANIZER"), "C13: the default call keeps the Humanizer");
  test.assert(plain.includes("INTEGRITY"), "C13: the default call keeps the integrity boundary");
  const dictation = wrapper([{ role: "user", content: "x" }], { markdown: false, humanizer: false })
    .map((message) => message.content).join("|");
  test.assert(!dictation.includes("HUMANIZER"), "C13: dictation asks for no Humanizer");
  test.assert(!dictation.includes("Markdown"), "C13: dictation asks for no Markdown-only rule");
  test.assert(dictation.includes("INTEGRITY"), "C13: dictation keeps the integrity boundary");
  const pad = read("app/features/dictation-pad.js");
  test.assert(/withMarkdownModelMessages\(messages, \{ markdown: false, humanizer: false \}\)/.test(pad),
    "C13: the pad is the caller that asks for it");
  // The task's own budget, front and back: a long transcript is not pressed
  // back down to the short-answer floor.
  const chatMessages = read("app/core/chat-messages.js");
  const taskPolicy = read("apps/server/server/task-policy.js");
  test.assert(/\/dictation\/\.test\(kind\)\) return 4096/.test(chatMessages), "C13: the client ceiling is the dictation's own");
  test.assert(/\/dictation\|speech\|transcript\/\.test\(kind\)\) return 4096/.test(chatMessages),
    "C13: the local Qwen default keeps the same ceiling");
  test.assert(/dictation: \{ tier: "fast", thinking: false, effort: "none", answerBudget: 4096 \}/.test(taskPolicy),
    "C13: the server budget for dictation follows");
}

// C14 — no model means no organizing, not a broken pad.
{
  const { session } = harness();
  session.setRaw("手动粘贴的文字");
  session.setModelAvailable(false);
  test.assert(session.cleanBlockedReason() === "model", "C14: the model gate closes organizing");
  test.assert(session.beginClean() === null, "C14: and starts no request");
  test.assert(session.applyShaped("手动粘贴的文字\n"), "C14: shaping still works without a model");
  test.assert(session.state.raw.trim().length > 0, "C14: the raw text can still be used");
}

// Clearing or choosing the raw source retires an organizing request still in
// flight, so a late answer cannot repopulate the pad (spec §4.2).
{
  const { session } = harness();
  session.setRaw("会清空的原文");
  const request = session.beginClean();
  test.assert(session.state.cleanBusy === true, "clear-cancel: a request is running");
  session.clearRaw();
  test.assert(session.state.cleanBusy === false, "clear-cancel: clearing cancels it");
  test.assert(session.state.raw === "", "clear-cancel: the fields are empty");
  test.assert(
    session.completeClean(request.requestId, { descriptor: request, text: "迟到的整理稿", finishReason: "stop" }).adopted === false,
    "clear-cancel: a late answer stays out",
  );

  session.setRaw("还在整理");
  const second = session.beginClean();
  session.completeClean(second.requestId, { descriptor: second, text: "可用整理稿", finishReason: "stop" });
  test.assert(session.state.selectedSource === "cleaned", "source-cancel: a current draft is selected");
  const third = session.beginClean();
  test.assert(session.state.cleanBusy === true, "source-cancel: another request is running");
  // Choosing raw while busy is the pad's job; the session cancel is what the
  // pad calls first.
  session.cancelClean();
  session.selectSource("raw");
  test.assert(session.state.cleanBusy === false, "source-cancel: the request is retired");
  test.assert(session.state.selectedSource === "raw", "source-cancel: insert uses the writer's words");
  test.assert(
    session.completeClean(third.requestId, { descriptor: third, text: "不该回来", finishReason: "stop" }).adopted === false,
    "source-cancel: the late answer is dropped",
  );
}

// C15 — shaping is a new version of the transcript and retires the old draft.
{
  const { session } = harness();
  session.setRaw("一句");
  const request = session.beginClean();
  session.completeClean(request.requestId, { descriptor: request, text: "整理稿", finishReason: "stop" });
  const before = session.state.rawRevision;
  test.assert(session.applyShaped("一句") === false, "C15: an unchanged shape is not an edit");
  test.assert(session.state.rawRevision === before, "C15: so the revision stands still");
  test.assert(session.applyShaped("一句\n") === true, "C15: a real change is applied");
  test.assert(session.state.rawRevision > before, "C15: and moves the revision");
  test.assert(session.state.cleaned === "", "C15: the old draft is retired");
}

// C16 — an edited draft is protected from the automatic path.
{
  const { session } = harness();
  session.setRaw("原文");
  session.setPreferences({ autoCleanOnStop: true });
  const request = session.beginClean();
  session.completeClean(request.requestId, { descriptor: request, text: "整理稿", finishReason: "stop" });
  session.editCleaned("人工改过的整理稿");
  session.state.autoCleanPending = true;
  test.assert(session.takeAutoClean() === null, "C16: the automatic pass refuses an edited draft");
  test.assert(session.state.cleaned === "人工改过的整理稿", "C16: the writer's version is still there");
}

// P01 — the automatic pass runs once, after an explicit stop, and never
// inserts.
{
  const { session } = harness();
  session.setPreferences({ autoCleanOnStop: true });
  const recognizer = { onstart: null, onresult: null, onend: null, onerror: null, start() {}, stop() {}, abort() {} };
  const started = Session.createSession({
    createRecognizer: () => recognizer,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
  });
  started.setPreferences({ autoCleanOnStop: true });
  started.start();
  recognizer.onstart();
  const list = [{ transcript: "说到了一半" }];
  list.isFinal = true;
  recognizer.onresult({ results: [list] });
  started.stop();
  recognizer.onend();
  const first = started.takeAutoClean();
  const second = started.takeAutoClean();
  test.assert(first && first.reason === "stop", "P01: one automatic pass is offered after a stop");
  test.assert(second === null, "P01: and only once");
  test.assert(started.state.raw === "说到了一半", "P01: nothing is inserted by the automatic pass");
  // A round that never confirmed anything: the guess is shown, the writer
  // stops, and the automatic pass is still not offered.
  const guessOnly = Session.createSession({
    createRecognizer: () => recognizer,
    setTimer: (fn) => { fn(); return 1; },
    clearTimer: () => {},
  });
  guessOnly.setPreferences({ autoCleanOnStop: true });
  guessOnly.start();
  recognizer.onstart();
  const guess = [{ transcript: "还没确认" }];
  guess.isFinal = false;
  recognizer.onresult({ results: [guess] });
  guessOnly.stop();
  recognizer.onend();
  test.assert(guessOnly.takeAutoClean() === null, "P01: interim text never triggers organizing");
  test.assert(guessOnly.state.raw === "", "P01: and it never lands in the transcript");
}

// P02 — every forbidden condition leaves the request count at zero. Each case
// is driven through the real events; none of them writes the flag by hand.
{
  const drive = (arrange) => {
    const recognizer = { onstart: null, onresult: null, onend: null, onerror: null, start() {}, stop() {}, abort() {} };
    const session = Session.createSession({
      createRecognizer: () => recognizer,
      setTimer: (fn) => { fn(); return 1; },
      clearTimer: () => {},
    });
    session.setPreferences({ autoCleanOnStop: true });
    session.start();
    recognizer.onstart();
    const said = [{ transcript: "说到了一句。" }];
    said.isFinal = true;
    recognizer.onresult({ results: [said] });
    return { session, recognizer, said, arrange };
  };

  // A natural end never organizes.
  const natural = drive();
  natural.recognizer.onend();
  test.assert(natural.session.takeAutoClean() === null, "P02: a natural end starts no automatic pass");
  test.assert(natural.session.state.raw === "说到了一句。", "P02: the words are kept");

  // An error never organizes.
  const errored = drive();
  errored.recognizer.onerror({ error: "network" });
  errored.recognizer.onend();
  test.assert(errored.session.takeAutoClean() === null, "P02: an error starts no automatic pass");
  test.assert(errored.session.state.raw === "说到了一句。", "P02: the words survive the error");

  // A pending tail cancels the automatic pass for this round.
  const tailed = drive();
  const guess = [{ transcript: "末句还没确认" }];
  guess.isFinal = false;
  tailed.recognizer.onresult({ results: [tailed.said, guess] });
  tailed.session.stop();
  tailed.recognizer.onend();
  test.assert(tailed.session.state.pendingTail === "末句还没确认", "P02: the tail is offered");
  test.assert(tailed.session.takeAutoClean() === null, "P02: a waiting tail starts no automatic pass");

  // An over-long transcript is refused at the entry, with the words intact.
  const long = drive();
  long.session.setRaw("字".repeat(2401));
  long.session.stop();
  long.recognizer.onend();
  test.assert(long.session.takeAutoClean() === null, "P02: an over-long transcript starts no automatic pass");
  test.assert(long.session.state.raw.length === 2401, "P02: and is not cut down");

  // No model: the words stay, nothing is organized.
  const model = drive();
  model.session.setModelAvailable(false);
  model.session.stop();
  model.recognizer.onend();
  test.assert(model.session.takeAutoClean() === null, "P02: no model means no automatic pass");
  test.assert(model.session.state.raw.trim().length > 0, "P02: the words stay");
}

// P03 — the glossary validates where it is entered.
{
  test.assert(Session.validateTerm("  AI System 6  ", []).term === "AI System 6", "P03: values are trimmed");
  test.assert(Session.validateTerm("DeepSeek", ["DeepSeek"]).reason === "duplicate", "P03: exact repeats are refused");
  test.assert(Session.validateTerm("", []).reason === "empty", "P03: an empty line is refused");
  test.assert(Session.validateTerm("x".repeat(41), []).reason === "term-length", "P03: a 41-code-point term is refused");
  test.assert(Session.validateTerm("y", new Array(30).fill("x").map((_, i) => `t${i}`)).reason === "count",
    "P03: the 31st term is refused");
  test.assert(Session.validateTerm("z", ["w".repeat(40), "v".repeat(40), ...new Array(23).fill("u")]).ok !== false,
    "P03: a list under the total limit is accepted");
}

test.finish();
