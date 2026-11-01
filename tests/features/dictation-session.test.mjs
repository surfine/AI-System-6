// The dictation session's behaviour, against the acceptance table in
// internal/plans/DICTATION-ENHANCEMENT-2026-10-03.acceptance.json: which
// recognition instance is current, how cumulative results become text, what a
// stop means, and what happens to the last unconfirmed sentence.
//
// It runs the real production module (app/core/dictation-session.js) with a
// recognizer, a clock and a callback the test owns — no copy of the algorithm
// lives here.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("dictation-session");
const context = vm.createContext({ window: {}, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/core/dictation-session.js"), context);
const Session = context.window.AISystem6DictationSession;

function harness(options = {}) {
  const timers = new Map();
  let nextTimer = 1;
  const recognizers = [];
  const setTimer = (fn, ms) => {
    const id = nextTimer++;
    timers.set(id, { fn, ms });
    return id;
  };
  const clearTimer = (id) => timers.delete(id);
  const session = Session.createSession({
    createRecognizer: () => {
      if (options.unsupported) return null;
      const recognizer = {
        started: 0,
        stopped: 0,
        aborted: 0,
        throwOnStart: options.throwOnStart || false,
        start() {
          this.started += 1;
          if (this.throwOnStart) throw new Error("InvalidStateError");
        },
        stop() {
          this.stopped += 1;
        },
        abort() {
          this.aborted += 1;
        },
      };
      recognizers.push(recognizer);
      return recognizer;
    },
    setTimer,
    clearTimer,
  });
  const fire = (ms) => {
    for (const [id, timer] of [...timers]) {
      if (timer.ms === ms) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  const results = (items) => items.map((item) => {
    const list = [{ transcript: item.text }];
    list.isFinal = item.final === true;
    return list;
  });
  return { session, recognizers, fire, timers, results };
}

const listen = (session, recognizer) => {
  session.start();
  recognizer.onstart();
};

// R01 — a second start before onstart must not create a second instance.
{
  const { session, recognizers } = harness();
  session.setRaw("已有文字。");
  session.start();
  session.start();
  test.assert(recognizers.length === 1, "R01: only one instance is created");
  test.assert(session.state.capture === "starting", "R01: the gate is synchronous");
  recognizers[0].onstart();
  test.assert(session.state.capture === "listening", "R01: onstart moves it to listening");
  test.assert(session.state.raw === "已有文字。", "R01: the existing words are untouched");
}

// R02 — a recognizer that throws synchronously is a failure, not a success.
{
  const { session, recognizers, timers } = harness({ throwOnStart: true });
  session.setRaw("保留我。");
  session.start();
  test.assert(session.state.capture === "idle", "R02: a failed start returns to an operable state");
  test.assert(session.state.raw === "保留我。", "R02: the words survive a failed start");
  test.assert(session.state.lastError === Session.ERROR_KEYS["start-failed"], "R02: the failure keeps its explanation");
  test.assert(timers.size === 0, "R02: no timer of this attempt is left behind");
  test.assert(recognizers[0].aborted === 0, "R02: a start that never began is not aborted");
}

// R03 — cancelling while the permission prompt hangs retires that instance.
{
  const { session, recognizers } = harness();
  session.setRaw("前文。");
  session.start();
  session.cancelStart();
  const stale = recognizers[0];
  stale.onstart();
  stale.onresult({ results: [{ 0: { transcript: "不该进来" }, isFinal: true, length: 1 }] });
  stale.onend();
  test.assert(session.state.capture === "idle", "R03: a retired instance cannot come back to listening");
  test.assert(session.state.raw === "前文。", "R03: its late result never lands in the transcript");
  test.assert(stale.aborted === 1, "R03: only that instance was asked to abort");
  test.assert(recognizers.length === 1, "R03: cancelling does not start anything new");
}

// R04 — the results list is cumulative; each final is committed once.
{
  const { session, recognizers, results } = harness();
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onresult({ results: results([{ text: "你好", final: true }]) });
  recognizer.onresult({ results: results([{ text: "你好", final: true }, { text: "世界", final: false }]) });
  test.assert(session.state.interim === "世界", "R04: the guess is shown while it is a guess");
  recognizer.onresult({ results: results([{ text: "你好", final: true }, { text: "世界", final: true }]) });
  test.assert(session.state.raw === "你好世界", "R04: the transcript is the two confirmed pieces once");
  test.assert(session.state.interim === "", "R04: the guess clears when it is confirmed");
}

// R05 — a deliberate repetition is kept; only the result index dedupes.
{
  const { session, recognizers, results } = harness();
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onresult({ results: results([{ text: "不要删。", final: true }]) });
  recognizer.onresult({ results: results([{ text: "不要删。", final: true }, { text: "不要删。", final: true }]) });
  test.assert(session.state.raw === "不要删。不要删。", "R05: the same sentence twice stays twice");
}

// R06 — an interim replaces itself and can be withdrawn; the raw text never
// sees it, and no model call is made.
{
  const { session, recognizers, results } = harness();
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onresult({ results: results([{ text: "我要写一个信", final: false }]) });
  recognizer.onresult({ results: results([{ text: "我要写一封信", final: false }]) });
  test.assert(session.state.interim === "我要写一封信", "R06: the guess is replaced, not appended to");
  recognizer.onresult({ results: [] });
  test.assert(session.state.interim === "", "R06: a shorter list withdraws the guess");
  test.assert(session.state.raw === "", "R06: no unconfirmed text ever lands in the transcript");
  test.assert(session.state.cleanRequestId === 0, "R06: interim text never starts a request");
}

// R07 — stopping keeps the instance alive long enough to receive the last
// sentence, and does not recurse into stop.
{
  const { session, recognizers, results } = harness();
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onresult({ results: results([{ text: "前句。", final: true }]) });
  session.stop();
  recognizer.onresult({ results: results([{ text: "前句。", final: true }, { text: "末句。", final: true }]) });
  recognizer.onend();
  test.assert(session.state.raw === "前句。末句。", "R07: the last sentence is still delivered after stop");
  test.assert(recognizer.stopped === 1, "R07: the underlying stop is called once");
  test.assert(session.state.pendingTail === "", "R07: a confirmed last sentence needs no tail prompt");
  test.assert(session.state.capture === "idle", "R07: onend ends the session");
}

// R08 — two stops do not reach the recognizer twice, and onend does not stop
// it again.
{
  const { session, recognizers, timers } = harness();
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  session.stop();
  session.stop();
  recognizer.onend();
  test.assert(recognizer.stopped === 1, "R08: the second stop is a no-op");
  test.assert(timers.size === 0, "R08: the drain deadline is cleared by onend");
}

// R09 — the drain deadline keeps what was confirmed, offers the last guess,
// and promotes nothing.
{
  const { session, recognizers, results, fire } = harness();
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onresult({ results: results([{ text: "已确认。", final: true }, { text: "还没有确认", final: false }]) });
  session.stop();
  fire(Session.LIMITS.STOP_DRAIN_MS);
  test.assert(session.state.raw === "已确认。", "R09: the confirmed text is kept as it stands");
  test.assert(session.state.pendingTail === "还没有确认", "R09: the unconfirmed sentence is offered");
  test.assert(recognizer.aborted === 1, "R09: the stalled instance is asked to abort");
  test.assert(session.takeAutoClean() === null, "R09: nothing auto-organizes while a tail waits");
}

// R10 — keeping the tail appends it once and counts as an edit.
{
  const { session } = harness();
  session.setRaw("已确认。");
  session.stop();
  session.state.pendingTail = "还没有确认";
  const before = session.state.rawRevision;
  session.acceptPendingTail();
  test.assert(session.state.raw === "已确认。还没有确认", "R10: the tail is appended once");
  test.assert(session.state.pendingTail === "", "R10: the offer is cleared");
  test.assert(session.state.rawRevision > before, "R10: keeping it is a new version of the transcript");
}

// R11 — ignoring the tail loses only the guess.
{
  const { session } = harness();
  session.setRaw("已确认。");
  session.state.pendingTail = "错误猜测";
  session.ignorePendingTail();
  test.assert(session.state.raw === "已确认。", "R11: the confirmed text is untouched");
  test.assert(session.state.pendingTail === "", "R11: only the guess is dropped");
}

// R12 — a retired instance's late events cannot touch the live one.
{
  const { session, recognizers, results, fire } = harness();
  const first = session.start() && recognizers[0];
  first.onstart();
  session.stop();
  fire(Session.LIMITS.STOP_DRAIN_MS);
  const second = (session.start(), recognizers[1]);
  second.onstart();
  first.onend();
  first.onerror({ error: "network" });
  first.onresult({ results: results([{ text: "旧的", final: true }]) });
  test.assert(session.state.recognition === second, "R12: the new instance is still the current one");
  test.assert(session.state.capture === "listening", "R12: its state is unchanged");
  test.assert(session.state.raw === "", "R12: the old instance writes nothing");
  test.assert(session.state.lastError === null, "R12: and cannot set an error on the new one");
}

// R13 — an error outranks the end that follows it.
{
  const { session, recognizers } = harness();
  session.setRaw("留下这句话。");
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onerror({ error: "not-allowed" });
  recognizer.onend();
  test.assert(session.state.raw === "留下这句话。", "R13: the words are kept");
  test.assert(session.state.status === Session.ERROR_KEYS["not-allowed"], "R13: the explanation survives onend");
  test.assert(session.state.capture === "idle", "R13: it does not restart itself");
}

// R14 — a new instance counts results from zero again.
{
  const { session, recognizers, results } = harness();
  session.setRaw("第一轮。");
  const first = session.start() && recognizers[0];
  first.onstart();
  first.onresult({ results: results([{ text: "第一轮的补白", final: true }]) });
  first.onend();
  const second = (session.start(), recognizers[1]);
  second.onstart();
  second.onresult({ results: results([{ text: "第二轮。", final: true }]) });
  test.assert(session.state.raw.includes("第二轮。"), "R14: the second round appends from index 0");
}

// R15 — a natural end, and a lifecycle stop, never restart or organize.
{
  const { session, recognizers, results } = harness();
  session.setPreferences({ autoCleanOnStop: true });
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onresult({ results: results([{ text: "一句话。", final: true }]) });
  recognizer.onend();
  test.assert(recognizers.length === 1, "R15: a natural end starts nothing new");
  test.assert(session.state.status === "dictation_paused", "R15: the pad says recognition paused");
  test.assert(session.takeAutoClean() === null, "R15: a natural end does not organize by itself");
  test.assert(session.state.raw === "一句话。", "R15: the text is kept");
}

// R16 — an empty final still advances the index.
{
  const { session, recognizers, results } = harness();
  const recognizer = session.start() && recognizers[0];
  recognizer.onstart();
  recognizer.onresult({ results: results([{ text: "", final: true }, { text: "有效文字", final: true }]) });
  test.assert(session.state.raw === "有效文字", "R16: the empty final does not block the next one");
  test.assert(!session.state.raw.startsWith(" "), "R16: and adds no stray leading space");
}

// P05 — the recognition language is a preference, and the instance keeps the
// language it started with.
{
  const { session } = harness();
  session.setPreferences({ recognitionLanguage: "zh-CN" });
  test.assert(session.state.prefs.recognitionLanguage === "zh-CN", "P05: the chosen language is stored");
  session.setPreferences({ recognitionLanguage: "en-US" });
  test.assert(session.state.prefs.recognitionLanguage === "en-US", "P05: changing it is a preference, not a live change");
}

test.finish();
