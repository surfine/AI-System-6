// The dictation pad's session, without the DOM.
//
// One recognition instance at a time, every event checked against the instance
// it belongs to, the raw text owning a revision, and the organizing pass owning
// an identity of its own. The pad in dictation-pad.js is the renderer over
// this: it mirrors `state.raw` into the textarea, draws `state.status`, and
// calls these methods. Nothing here touches an element, a clock or the network
// — the caller injects the recognizer factory, the timers and the request.
//
// Lazy: it loads with the pad, never at boot. The behaviour it encodes is
// pinned by tests/features/dictation-session.test.mjs and
// tests/features/dictation-clean.test.mjs against
// internal/plans/DICTATION-ENHANCEMENT-2026-10-03.acceptance.json.
window.AISystem6DictationSessionLoaded = true;

(function installDictationSession(root) {
  "use strict";

  // Fixed first-version product parameters (the spec's table, in one place so
  // no magic number is repeated in the pad).
  const LIMITS = Object.freeze({
    STOP_DRAIN_MS: 2000,
    CLEAN_TIMEOUT_MS: 10000,
    MAX_CLEAN_CODEPOINTS: 2400,
    MIN_CLEAN_OUTPUT_TOKENS: 900,
    MAX_CLEAN_OUTPUT_TOKENS: 4096,
    MAX_TERMS: 30,
    MAX_TERM_CODEPOINTS: 40,
    MAX_TERMS_CODEPOINTS: 1000,
  });

  // What a recognition error means to the writer. `start-failed` and
  // `unsupported` are ours; the rest are the Web Speech error codes.
  const ERROR_KEYS = Object.freeze({
    "not-allowed": "dictation_error_not_allowed",
    "service-not-allowed": "dictation_error_not_allowed",
    "audio-capture": "dictation_error_audio_capture",
    network: "dictation_error_network",
    "language-not-supported": "dictation_error_language",
    "no-speech": "dictation_error_no_speech",
    aborted: "dictation_error_aborted",
    "start-failed": "dictation_error_start",
    unsupported: "dictation_error_unsupported",
  });

  const CJK = /[\u2e80-\u9fff\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/;
  const NO_SPACE_BEFORE = /^[.,;:!?%)\]}»”’、。，；：！？）】」』〕〉]/;
  const SPACE = /\s/;

  function countCodepoints(text) {
    return Array.from(String(text ?? "")).length;
  }

  // Where two pieces of speech meet. The rule is about the seam only: keep
  // whatever whitespace is already there, never invent one before closing
  // punctuation, never put one between CJK, one space between Latin words.
  function joinSegments(previous, next) {
    const left = String(previous ?? "");
    const right = String(next ?? "");
    if (!right) return left;
    if (!left) return right;
    const last = Array.from(left).pop();
    const first = Array.from(right)[0];
    if (SPACE.test(last) || SPACE.test(first)) return left + right;
    if (CJK.test(last) || CJK.test(first)) return left + right;
    if (NO_SPACE_BEFORE.test(right) || NO_SPACE_BEFORE.test(first)) return left + right;
    return `${left} ${right}`;
  }

  // The output budget an organizing request asks for: the writer's own length plus
  // room to breathe, inside the task's ceiling. Not a tokenizer.
  function requestedCleanTokens(codepoints) {
    const n = Math.max(0, Number(codepoints) || 0);
    return Math.min(
      LIMITS.MAX_CLEAN_OUTPUT_TOKENS,
      Math.max(LIMITS.MIN_CLEAN_OUTPUT_TOKENS, Math.ceil(1.5 * n) + 256),
    );
  }

  function cleanLengthAllowed(codepoints) {
    return Number(codepoints) <= LIMITS.MAX_CLEAN_CODEPOINTS;
  }

  // A glossary is a list of words the writer wants spelled the way they spell
  // them. It is validated where it is entered, never silently trimmed: an
  // over-long list is refused with a reason, not quietly cut.
  function validateTerm(value, existing = []) {
    const term = String(value ?? "").trim();
    if (!term) return { ok: false, reason: "empty" };
    if (countCodepoints(term) > LIMITS.MAX_TERM_CODEPOINTS) return { ok: false, reason: "term-length" };
    if (existing.includes(term)) return { ok: false, reason: "duplicate" };
    if (existing.length >= LIMITS.MAX_TERMS) return { ok: false, reason: "count" };
    const joined = countCodepoints([...existing, term].join("\n"));
    if (joined > LIMITS.MAX_TERMS_CODEPOINTS) return { ok: false, reason: "total-length" };
    return { ok: true, term };
  }

  function createSession(deps = {}) {
    const setTimer = typeof deps.setTimer === "function" ? deps.setTimer : (fn, ms) => setTimeout(fn, ms);
    const clearTimer = typeof deps.clearTimer === "function" ? deps.clearTimer : (id) => clearTimeout(id);
    const createRecognizer = typeof deps.createRecognizer === "function" ? deps.createRecognizer : () => null;
    const onChange = typeof deps.onChange === "function" ? deps.onChange : () => {};
    const nowMs = typeof deps.now === "function" ? deps.now : () => 0;

    const state = {
      // ----- the session (§5.1) -----
      capture: "idle",            // idle | starting | listening | stopping
      recognition: null,
      recognitionId: 0,
      nextFinalIndex: 0,
      interim: "",
      pendingTail: "",
      stopRequested: false,
      stopOrigin: null,           // user | lifecycle | error
      sessionHadNewFinal: false,
      stopTimer: null,
      raw: "",
      rawRevision: 0,
      contextRevision: 0,
      cleaned: "",
      cleanedEdited: false,
      cleanRequestId: 0,
      cleanBusy: false,
      cleanTimer: null,
      cleanController: null,
      cleanedSourceRevision: null,
      cleanedContextRevision: null,
      cleanIncomplete: false,
      cleanNeedsCheck: false,
      cleanTimedOut: false,
      selectedSource: "raw",      // raw | cleaned
      targetSnapshot: null,
      inserting: false,
      lastError: null,            // an i18n key, or null
      status: "dictation_ready",  // the line the pad shows
      autoCleanPending: false,
      prefs: { autoCleanOnStop: false, recognitionLanguage: "follow-ui", terms: [] },
      modelAvailable: true,
    };

    const listeners = new Set();
    function emit() {
      onChange(state);
      listeners.forEach((listener) => listener(state));
    }
    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function setStatus(key) {
      state.status = key;
    }

    function invalidateCleaned() {
      state.cleaned = "";
      state.cleanedEdited = false;
      state.cleanedSourceRevision = null;
      state.cleanedContextRevision = null;
      state.cleanIncomplete = false;
      state.cleanNeedsCheck = false;
      state.cleanTimedOut = false;
      state.selectedSource = "raw";
    }

    // Any change to the raw text goes through here: the revision moves, the
    // old organizing pass is invalidated, and the insert source returns to the
    // writer's own words. A caller that wants to know whether the text really
    // changed asks inBetween.
    function touchRaw() {
      state.rawRevision += 1;
      invalidateCleaned();
    }

    function setRaw(text, { byUser = false } = {}) {
      const next = String(text ?? "");
      if (next === state.raw) return false;
      state.raw = next;
      touchRaw();
      if (!byUser) return true;
      return true;
    }

    function setRawIfUserTyped(text) {
      return setRaw(text, { byUser: true });
    }

    function cancelCleanRequest({ keepBusy = false } = {}) {
      state.cleanRequestId += 1;
      if (state.cleanTimer != null) {
        clearTimer(state.cleanTimer);
        state.cleanTimer = null;
      }
      const controller = state.cleanController;
      state.cleanController = null;
      if (!keepBusy) state.cleanBusy = false;
      if (controller) {
        try {
          controller.abort();
        } catch {
          /* an abort that throws is still an abort request */
        }
      }
      return controller;
    }

    function contextSnapshot() {
      return {
        raw: state.raw,
        rawRevision: state.rawRevision,
        contextRevision: state.contextRevision,
        codepoints: countCodepoints(state.raw),
        terms: [...state.prefs.terms],
      };
    }

    // ----- recognition (§5.2–§5.5) -----------------------------------------

    function clearStopTimer() {
      if (state.stopTimer != null) {
        clearTimer(state.stopTimer);
        state.stopTimer = null;
      }
    }

    function retireInstance(instance) {
      if (instance && typeof instance.abort === "function") {
        try {
          instance.abort();
        } catch {
          /* abort is a request, not a guarantee */
        }
      }
      if (state.recognition === instance) state.recognition = null;
    }

    function start() {
      if (state.capture !== "idle") return false;               // R01
      if (state.cleanBusy) return false;
      if (state.pendingTail) return false;
      const instance = createRecognizer();
      if (!instance) {
        state.lastError = ERROR_KEYS.unsupported;
        setStatus("dictation_error_unsupported");
        emit();
        return false;
      }
      state.capture = "starting";
      state.stopRequested = false;
      state.stopOrigin = null;
      state.sessionHadNewFinal = false;
      state.interim = "";
      state.nextFinalIndex = 0;
      state.lastError = null;
      setStatus("dictation_starting");
      const id = (state.recognitionId += 1);
      state.recognition = instance;
      bind(instance, id);
      try {
        if (typeof instance.start === "function") instance.start();
      } catch (error) {
        // A recognizer that refuses synchronously must not look like success.
        if (state.recognition === instance) state.recognition = null;
        state.capture = "idle";
        state.lastError = ERROR_KEYS["start-failed"];
        setStatus("dictation_error_start");
        emit();
        return false;
      }
      emit();
      return true;
    }

    // Cancelling a start that never arrived: the instance is retired, and the
    // late onstart/result/onend it still fires belongs to nobody (R03).
    function cancelStart() {
      if (state.capture !== "starting") return false;
      const instance = state.recognition;
      state.capture = "idle";
      state.recognitionId += 1;
      retireInstance(instance);
      state.interim = "";
      setStatus("dictation_ready");
      emit();
      return true;
    }

    function bind(instance, id) {
      instance.onstart = () => {
        if (state.recognition !== instance || state.recognitionId !== id) return;
        if (state.capture !== "starting" && state.capture !== "listening") return;
        state.capture = "listening";
        setStatus("dictation_listening");
        emit();
      };
      instance.onresult = (event) => applyResult(instance, id, event);
      instance.onerror = (event) => applyError(instance, id, event);
      instance.onend = () => applyEnd(instance, id);
    }

    const isCurrent = (instance, id) => state.recognition === instance && state.recognitionId === id;

    function applyResult(instance, id, event) {
      if (!isCurrent(instance, id)) return;                     // R03, R12
      if (state.capture !== "listening" && state.capture !== "stopping") return;
      const results = event?.results;
      if (!results || typeof results.length !== "number") return;
      let appended = false;
      let index = state.nextFinalIndex;
      // The list is cumulative: every final from the index on is a new saying,
      // even when its text repeats one already committed (R05), and an empty
      // final still moves the index so it cannot block what follows (R16).
      while (index < results.length) {
        const item = results[index];
        if (!item || !item.isFinal) break;
        const transcript = String(item[0]?.transcript ?? "");
        if (transcript) {
          state.raw = joinSegments(state.raw, transcript);
          appended = true;
        }
        index += 1;
      }
      state.nextFinalIndex = index;
      let interim = "";
      for (let i = index; i < results.length; i += 1) {
        const item = results[i];
        if (!item || item.isFinal) continue;
        interim += String(item[0]?.transcript ?? "");
      }
      state.interim = interim;                                  // replaces, may clear (R06)
      if (appended) {
        state.sessionHadNewFinal = true;
        touchRaw();
      }
      emit();
    }

    function applyError(instance, id, event) {
      if (!isCurrent(instance, id)) return;
      const code = String(event?.error || "start-failed");
      clearStopTimer();
      retireInstance(instance);
      state.capture = "idle";
      state.stopRequested = false;
      state.lastError = ERROR_KEYS[code] || ERROR_KEYS["start-failed"];
      setStatus(state.lastError);
      emit();
    }

    function finishSession({ natural = true } = {}) {
      clearStopTimer();
      const tail = state.interim.trim() ? state.interim : "";
      state.interim = "";
      state.recognition = null;
      state.capture = "idle";
      state.stopRequested = false;
      if (tail) {
        // The last guess was never confirmed. It is kept for the writer to
        // accept or drop — never promoted to text on its own (R09).
        state.pendingTail = tail;
        setStatus("dictation_tail_unconfirmed");
      } else if (!state.lastError) {
        if (natural && state.stopOrigin !== "user") setStatus("dictation_paused");
        else setStatus("dictation_ready");
      }
      // The automatic pass is for a round the writer stopped that actually
      // said something: an explicit stop, a new confirmed sentence, no tail
      // waiting, no edited draft, a model to ask (spec §9.1).
      if (state.stopOrigin === "user" && !tail && state.raw.trim() && !state.pendingTail) {
        state.autoCleanPending = state.prefs.autoCleanOnStop
          && state.sessionHadNewFinal
          && !state.cleanedEdited
          && state.modelAvailable;
      }
      state.stopOrigin = null;
      emit();
    }

    function applyEnd(instance, id) {
      if (!isCurrent(instance, id)) return;                     // R12
      finishSession({ natural: true });                          // never calls stop again (R07, R08)
    }

    function stop(origin = "user") {
      if (state.capture === "starting") return cancelStart();
      if (state.capture === "stopping") return false;            // one stop only (R08)
      if (state.capture !== "listening") return false;
      const instance = state.recognition;
      state.capture = "stopping";
      state.stopRequested = true;
      state.stopOrigin = origin;
      setStatus("dictation_stopping");
      if (instance && typeof instance.stop === "function") {
        try {
          instance.stop();
        } catch {
          /* the drain deadline below is what actually bounds the wait */
        }
      }
      const id = state.recognitionId;
      state.stopTimer = setTimer(() => {
        state.stopTimer = null;
        if (state.recognitionId !== id || state.capture !== "stopping") return;
        // No onend inside the deadline: keep what was confirmed, keep the last
        // guess as a proposal, and say the last sentence may be unconfirmed.
        state.stopRequested = false;
        retireInstance(instance);
        state.recognitionId += 1;
        finishSession({ natural: false });
        setStatus("dictation_tail_unconfirmed");
        emit();
      }, LIMITS.STOP_DRAIN_MS);
      emit();
      return true;
    }

    function acceptPendingTail() {
      if (!state.pendingTail) return false;
      state.raw = joinSegments(state.raw, state.pendingTail);
      state.pendingTail = "";
      state.sessionHadNewFinal = true;                           // not a browser final (R10)
      touchRaw();
      setStatus("dictation_ready");
      emit();
      return true;
    }

    function ignorePendingTail() {
      if (!state.pendingTail) return false;
      state.pendingTail = "";
      setStatus("dictation_ready");
      emit();
      return true;
    }

    function clearRaw() {
      if (!state.raw && !state.pendingTail && !state.cleaned) return false;
      // Clearing retires any in-flight organizing answer before the fields go
      // empty, so a late response cannot repopulate them (spec §4.2 / §6.2).
      cancelCleanRequest();
      state.raw = "";
      state.pendingTail = "";
      touchRaw();
      setStatus("dictation_ready");
      emit();
      return true;
    }

    // ----- the organizing pass (§6) ----------------------------------------

    function cleanBlockedReason() {
      if (state.capture !== "idle") return "capture";
      if (state.pendingTail) return "tail";
      if (!state.raw.trim()) return "empty";
      if (state.cleanBusy) return "busy";
      if (!state.modelAvailable) return "model";
      if (!cleanLengthAllowed(countCodepoints(state.raw))) return "length";
      return "";
    }

    // The one door to a request. Returns a descriptor for the caller to fetch
    // with, or null when the entry conditions are not met (C05 dedupes here,
    // not in the button's disabled state).
    function beginClean({ controller } = {}) {
      const blocked = cleanBlockedReason();
      if (blocked) return null;
      const descriptor = contextSnapshot();
      state.cleanBusy = true;
      state.cleanTimedOut = false;
      state.cleanIncomplete = false;
      state.cleanNeedsCheck = false;
      const requestId = (state.cleanRequestId += 1);
      state.cleanController = controller || null;
      setStatus("dictation_cleaning");
      const timer = setTimer(() => {
        if (state.cleanRequestId !== requestId) return;
        state.cleanTimer = null;
        // The client stops waiting; a late answer is not this request's any
        // more (C06). The raw text was never touched.
        cancelCleanRequest();
        state.cleanTimedOut = true;
        setStatus("dictation_clean_timeout");
        emit();
      }, LIMITS.CLEAN_TIMEOUT_MS);
      state.cleanTimer = timer;
      emit();
      return {
        requestId,
        raw: descriptor.raw,
        rawRevision: descriptor.rawRevision,
        contextRevision: descriptor.contextRevision,
        codepoints: descriptor.codepoints,
        terms: descriptor.terms,
        maxTokens: requestedCleanTokens(descriptor.codepoints),
      };
    }

    function requestIsCurrent(requestId, descriptor) {
      if (requestId !== state.cleanRequestId) return false;      // C03, C04
      if (descriptor && descriptor.rawRevision !== state.rawRevision) return false;   // C01, C02
      if (descriptor && descriptor.contextRevision !== state.contextRevision) return false; // C11
      return true;
    }

    function cancelClean() {
      if (!state.cleanBusy && state.cleanTimer == null) return false;
      cancelCleanRequest();
      state.cleanTimedOut = false;
      setStatus("dictation_ready");
      emit();
      return true;
    }

    // A result is adopted only when it is text, complete, and still the
    // current request's. Anything else is reported, never silently used.
    function completeClean(requestId, result = {}) {
      if (!requestIsCurrent(requestId, result.descriptor)) {
        return { adopted: false, reason: "stale" };
      }
      if (state.cleanTimer != null) {
        clearTimer(state.cleanTimer);
        state.cleanTimer = null;
      }
      state.cleanController = null;
      state.cleanBusy = false;
      const text = typeof result.text === "string" ? result.text.trim() : "";
      if (result.error) {
        // The request itself failed: the words stay, the pad says so, and
        // nothing is retried.
        state.cleanIncomplete = true;
        setStatus("dictation_clean_failed");
        emit();
        return { adopted: false, reason: "error" };
      }
      if (result.aborted) {
        setStatus("dictation_ready");
        emit();
        return { adopted: false, reason: "aborted" };
      }
      if (!text) {
        state.cleanIncomplete = true;
        setStatus("dictation_clean_incomplete");
        emit();
        return { adopted: false, reason: "content" };
      }
      const finish = typeof result.finishReason === "string" ? result.finishReason : "";
      if (finish && finish !== "stop") {
        // Truncated or filtered: shown for the writer to read, never adopted.
        state.cleaned = text;
        state.cleanedEdited = false;
        state.cleanedSourceRevision = state.rawRevision;
        state.cleanedContextRevision = state.contextRevision;
        state.cleanIncomplete = true;
        state.cleanNeedsCheck = true;
        state.selectedSource = "raw";
        setStatus("dictation_clean_incomplete");
        emit();
        return { adopted: false, reason: "incomplete" };
      }
      if (!finish) {
        // A provider that gives no completion marker: readable, but the pad
        // must not select it for insertion on its own (C09).
        state.cleaned = text;
        state.cleanedEdited = false;
        state.cleanedSourceRevision = state.rawRevision;
        state.cleanedContextRevision = state.contextRevision;
        state.cleanNeedsCheck = true;
        state.selectedSource = "raw";
        setStatus("dictation_clean_check");
        emit();
        return { adopted: true, needsCheck: true };
      }
      state.cleaned = text;
      state.cleanedEdited = false;
      state.cleanNeedsCheck = false;
      state.cleanIncomplete = false;
      state.cleanedSourceRevision = state.rawRevision;
      state.cleanedContextRevision = state.contextRevision;
      state.selectedSource = "cleaned";
      setStatus("dictation_ready");
      emit();
      return { adopted: true };
    }

    function editCleaned(text) {
      state.cleaned = String(text ?? "");
      state.cleanedEdited = true;
      if (state.cleaned) state.selectedSource = "cleaned";
      emit();
    }

    // 只分段: the local pass that changes layout and no words. It goes through
    // the same revision path as any other edit of the raw text (C15).
    function applyShaped(text) {
      const next = String(text ?? "");
      if (next === state.raw) return false;
      state.raw = next;
      touchRaw();
      setStatus("dictation_ready");
      emit();
      return true;
    }

    function cleanedIsStale() {
      if (!state.cleaned) return true;
      return state.cleanedSourceRevision !== state.rawRevision
        || state.cleanedContextRevision !== state.contextRevision;
    }

    function selectSource(source) {
      if (source === "cleaned") {
        if (!state.cleaned || cleanedIsStale() || state.cleanNeedsCheck || state.cleanIncomplete) return false;
        state.selectedSource = "cleaned";
      } else {
        state.selectedSource = "raw";
      }
      emit();
      return true;
    }

    // What Send would insert right now. Never `cleaned || raw`: an out-of-date
    // or unconfirmed organizing result falls back to the writer's own words.
    function insertText() {
      if (state.selectedSource === "cleaned" && state.cleaned && !cleanedIsStale() && !state.cleanNeedsCheck && !state.cleanIncomplete) {
        return { source: "cleaned", text: state.cleaned };
      }
      return { source: "raw", text: state.raw.trim() };
    }

    function setContext(partial = {}) {
      const changed = Object.keys(partial).length > 0;
      if (changed) {
        state.contextRevision += 1;
        // The old draft keeps its own revision pair; it is now out of date by
        // comparison, which is what `cleanedIsStale` reports.
      }
      emit();
      return state.contextRevision;
    }

    function setTargetSnapshot(snapshot) {
      state.targetSnapshot = snapshot || null;
      state.contextRevision += 1;
      emit();
    }

    function setPreferences(partial = {}) {
      state.prefs = { ...state.prefs, ...partial };
      if (Array.isArray(partial.terms)) state.prefs.terms = [...partial.terms];
      emit();
      return state.prefs;
    }

    function setModelAvailable(available) {
      state.modelAvailable = available !== false;
      emit();
    }

    function takeAutoClean() {
      if (!state.autoCleanPending) return null;
      state.autoCleanPending = false;
      const blocked = cleanBlockedReason();
      if (blocked || state.cleanedEdited) return null;
      return { reason: "stop", ...contextSnapshot() };
    }

    function beginInsert() {
      if (state.inserting) return false;
      if (state.capture !== "idle" || state.cleanBusy || state.pendingTail) return false;
      state.inserting = true;
      emit();
      return true;
    }

    function endInsert({ ok }) {
      state.inserting = false;
      if (ok) {
        state.raw = "";
        state.pendingTail = "";
        state.rawRevision += 1;
        invalidateCleaned();
        setStatus("dictation_ready");
      }
      emit();
      return ok;
    }

    function snapshot() {
      return { ...state, prefs: { ...state.prefs, terms: [...state.prefs.terms] } };
    }

    emit();
    return {
      state,
      snapshot,
      subscribe,
      start,
      cancelStart,
      stop,
      acceptPendingTail,
      ignorePendingTail,
      clearRaw,
      setRaw: setRawIfUserTyped,
      applyShaped,
      cleanBlockedReason,
      beginClean,
      completeClean,
      cancelClean,
      editCleaned,
      cleanedIsStale,
      selectSource,
      insertText,
      setContext,
      setTargetSnapshot,
      setPreferences,
      setModelAvailable,
      takeAutoClean,
      beginInsert,
      endInsert,
      requestedCleanTokens,
      countCodepoints,
    };
  }

  root.AISystem6DictationSession = Object.freeze({
    VERSION: 1,
    LIMITS,
    ERROR_KEYS,
    createSession,
    countCodepoints,
    joinSegments,
    requestedCleanTokens,
    cleanLengthAllowed,
    validateTerm,
  });
})(typeof window !== "undefined" ? window : globalThis);
