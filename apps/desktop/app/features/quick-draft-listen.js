// Quick Draft 听稿 (Listen) — the fourth display mode plus the inline
// listening-risk findings.
//
// The listen view is a teleprompter over the raw body: listen beats from
// app/core/listen-beats.js, one speechSynthesis utterance per beat. State and
// highlight change only from utterance onstart, and the queue advances only
// from onend, so the UI never claims sound that is not sounding. Pause is
// cancel-plus-remembered-beat and resume restarts the beat: Chrome's
// pause/resume is unreliable and zh boundary events never fire.
//
// Findings (from the ELI5 review or from "lost me here" marks) are temporary
// AI output: they live in module state with a body fingerprint, never in the
// workspace record. Jump and fix re-locate the quote at click time through
// findListenQuoteRange and refuse when it cannot be found — never guess a
// position.

let quickDraftListenState = null;
let quickDraftListenSession = 0;
let quickDraftListenVoices = null;
let quickDraftFindingsSection = null;
let quickDraftListenBeatStartedAt = 0;

const QUICK_DRAFT_LISTEN_RATES = ["0.85", "1", "1.15", "1.3"];

function quickDraftListenSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
}

// The voice follows the DRAFT's script, not the UI language: a Chinese draft
// in an English UI still needs a zh voice, or synthesis skips the han
// characters near-instantly. Prefer on-device voices — a browser's "default"
// voice can be a remote endpoint that completes without producing any audio
// (observed on macOS Chrome), while localService voices really speak.
function quickDraftListenLang(sampleText = "") {
  if (/[㐀-鿿]/.test(sampleText)) return "zh";
  if (/[a-z]/i.test(sampleText)) return "en";
  return currentLanguage === "zh" ? "zh" : "en";
}

const QUICK_DRAFT_LISTEN_VOICE_KEY = "quickDraftListenVoice";

function quickDraftListenVoiceChoices(sampleText = "") {
  const wanted = quickDraftListenLang(sampleText);
  const voices = quickDraftListenVoices || window.speechSynthesis.getVoices() || [];
  quickDraftListenVoices = voices;
  const inLanguage = voices.filter((voice) => voice.lang?.toLowerCase().startsWith(wanted));
  // On-device voices first; within each group keep the platform's order.
  return [
    ...inLanguage.filter((voice) => voice.localService),
    ...inLanguage.filter((voice) => !voice.localService),
  ];
}

function quickDraftListenVoice(sampleText = "") {
  if (!quickDraftListenSupported()) return null;
  const choices = quickDraftListenVoiceChoices(sampleText);
  let saved = "";
  try { saved = localStorage.getItem(QUICK_DRAFT_LISTEN_VOICE_KEY) || ""; } catch { /* storage off */ }
  const chosen = saved && choices.find((voice) => voice.name === saved);
  if (chosen) return chosen;
  // The platform's mainline narrator voices read far better than the novelty
  // ones the list starts with (observed: Eddy vs Tingting on macOS).
  return choices.find((voice) => /tingting|ting-ting|婷婷|siri/i.test(voice.name) && voice.localService)
    || choices.find((voice) => voice.localService && voice.default)
    || choices.find((voice) => voice.localService)
    || choices[0]
    || null;
}

function setQuickDraftListenVoice(name = "") {
  try {
    if (name) localStorage.setItem(QUICK_DRAFT_LISTEN_VOICE_KEY, name);
    else localStorage.removeItem(QUICK_DRAFT_LISTEN_VOICE_KEY);
  } catch { /* storage off */ }
}

if (quickDraftListenSupported()) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    quickDraftListenVoices = window.speechSynthesis.getVoices() || [];
  });
}

function quickDraftListenBody() {
  // The listen view reads the darkroom's subject: the developed document's
  // text when one is open, the draft's otherwise.
  return typeof lightroomBodyText === "function"
    ? String(lightroomBodyText() || "")
    : String(refs.draft?.value || "");
}

function ensureQuickDraftListenState() {
  const body = quickDraftListenBody();
  const fingerprint = textComposeHash(body);
  if (
    quickDraftListenState
    && quickDraftListenState.projectId === activeProjectId
    && quickDraftListenState.fingerprint === fingerprint
  ) {
    return quickDraftListenState;
  }
  const beats = window.AISystem6ListenBeats.segmentListenBeats(body);
  const previous = quickDraftListenState;
  quickDraftListenState = {
    projectId: activeProjectId,
    fingerprint,
    beats,
    currentBeat: 0,
    playing: false,
    rate: previous?.rate || "1",
    lostBeatIndexes: new Set(),
    findings: previous && previous.projectId === activeProjectId ? previous.findings : [],
    keep: previous && previous.projectId === activeProjectId ? previous.keep || [] : [],
    // Visual-cue production notes anchor by quote, like findings, so they
    // survive a body edit and re-locate honestly at export time.
    visualCues: previous && previous.projectId === activeProjectId ? previous.visualCues || [] : [],
    findingsFingerprint: previous?.findingsFingerprint || "",
    pendingFix: null,
  };
  const caret = Number(refs.draft?.selectionStart) || 0;
  const startBeat = window.AISystem6ListenBeats.listenBeatForOffset(beats, caret);
  if (startBeat) quickDraftListenState.currentBeat = startBeat.index;
  return quickDraftListenState;
}

// --- rendering -------------------------------------------------------------

// refs is populated by collectRefs() long after this module loads, so the
// preview listeners attach lazily on first render, once, via a dataset flag.
function attachQuickDraftListenListeners() {
  const preview = refs.preview;
  if (!preview || preview.dataset.quickDraftListenWired === "true") return;
  preview.dataset.quickDraftListenWired = "true";
  preview.addEventListener("click", onQuickDraftListenClick);
  preview.addEventListener("keydown", onQuickDraftListenKeydown);
  preview.addEventListener("change", onQuickDraftListenChange);
}

function renderQuickDraftListenView() {
  if (!refs.preview) return;
  attachQuickDraftListenListeners();
  const state = ensureQuickDraftListenState();
  const supported = quickDraftListenSupported();
  if (!state.beats.length) {
    refs.preview.innerHTML = `<div class="draft-desk-listen"><p class="draft-desk-listen-empty">${escapeHtml(t("quick_draft_listen_empty"))}</p></div>`;
    return;
  }
  const beats = state.beats.map((beat) => {
    const classes = ["draft-desk-listen-beat"];
    if (beat.index === state.currentBeat) classes.push("is-current");
    if (beat.index < state.currentBeat) classes.push("is-dim");
    if (state.lostBeatIndexes.has(beat.index)) classes.push("is-lost");
    return `<p class="${classes.join(" ")}" data-quick-draft-listen-beat="${beat.index}">${escapeHtml(beat.text)}</p>`;
  }).join("");
  const rateOptions = QUICK_DRAFT_LISTEN_RATES.map((rate) => (
    `<option value="${rate}"${rate === state.rate ? " selected" : ""}>${rate}×</option>`
  )).join("");
  const sampleText = state.beats[0]?.text || "";
  const activeVoice = quickDraftListenVoice(sampleText);
  const voiceChoices = quickDraftListenVoiceChoices(sampleText);
  const shortCounts = new Map();
  voiceChoices.forEach((voice) => {
    const short = voice.name.split(" (")[0];
    shortCounts.set(short, (shortCounts.get(short) || 0) + 1);
  });
  const voiceOptions = voiceChoices.map((voice) => {
    const short = voice.name.split(" (")[0];
    const label = shortCounts.get(short) > 1 ? `${short} · ${voice.lang}` : short;
    return `<option value="${escapeHtml(voice.name)}"${voice.name === activeVoice?.name ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  refs.preview.innerHTML = [
    '<div class="draft-desk-listen">',
    `<div class="draft-desk-listen-beats">${beats}</div>`,
    '<div class="draft-desk-listen-transport">',
    `<button class="btn mini-btn" type="button" data-quick-draft-listen-back${supported ? "" : " disabled"}>${escapeHtml(t("quick_draft_listen_back"))}</button>`,
    `<button class="btn mini-btn default" type="button" data-quick-draft-listen-toggle${supported ? "" : " disabled"}>${escapeHtml(t(state.playing ? "quick_draft_listen_pause" : "quick_draft_listen_play"))}</button>`,
    `<div class="system-track draft-desk-listen-progress" role="slider" tabindex="0" data-quick-draft-listen-progress aria-label="${escapeHtml(t("quick_draft_listen_progress"))}" aria-valuemin="1" aria-valuemax="${state.beats.length}" aria-valuenow="${state.currentBeat + 1}" style="--system-track-position:${Math.round(((state.currentBeat + 1) / state.beats.length) * 100)}%"><div class="system-track-fill"></div><div class="system-track-thumb"></div></div>`,
    `<span class="select-wrap select-wrap-inline draft-desk-listen-rate"><select data-quick-draft-listen-rate aria-label="${escapeHtml(t("quick_draft_listen_rate"))}">${rateOptions}</select></span>`,
    voiceOptions ? `<span class="select-wrap select-wrap-inline draft-desk-listen-voice"><select data-quick-draft-listen-voice aria-label="${escapeHtml(t("quick_draft_listen_voice"))}">${voiceOptions}</select></span>` : "",
    `<button class="btn mini-btn" type="button" data-quick-draft-listen-rehearse${quickDraftRehearseSupported() ? "" : " disabled"}>${escapeHtml(t(quickDraftRehearse ? "quick_draft_listen_rehearse_stop" : "quick_draft_listen_rehearse"))}</button>`,
    `<button class="btn mini-btn" type="button" data-quick-draft-listen-lost>${escapeHtml(t("quick_draft_listen_mark_lost"))}</button>`,
    "</div>",
    "</div>",
  ].join("");
  if (!supported) setQuickDraftStatus(t("quick_draft_listen_no_voice"));
  if (typeof initSystemSelectControls === "function") initSystemSelectControls();
}

function syncQuickDraftListenBeatUi() {
  const state = quickDraftListenState;
  if (!refs.preview || !state) return;
  refs.preview.querySelectorAll("[data-quick-draft-listen-beat]").forEach((element) => {
    const index = Number(element.getAttribute("data-quick-draft-listen-beat"));
    element.classList.toggle("is-current", index === state.currentBeat);
    element.classList.toggle("is-dim", index < state.currentBeat);
    element.classList.toggle("is-lost", state.lostBeatIndexes.has(index));
  });
  const toggle = refs.preview.querySelector("[data-quick-draft-listen-toggle]");
  if (toggle) toggle.textContent = t(state.playing ? "quick_draft_listen_pause" : "quick_draft_listen_play");
  const rehearse = refs.preview.querySelector("[data-quick-draft-listen-rehearse]");
  if (rehearse) {
    rehearse.textContent = t(quickDraftRehearse ? "quick_draft_listen_rehearse_stop" : "quick_draft_listen_rehearse");
    rehearse.classList.toggle("is-active", Boolean(quickDraftRehearse));
  }
  const progress = refs.preview.querySelector("[data-quick-draft-listen-progress]");
  if (progress) {
    progress.setAttribute("aria-valuenow", String(state.currentBeat + 1));
    progress.style.setProperty("--system-track-position", `${Math.round(((state.currentBeat + 1) / state.beats.length) * 100)}%`);
  }
  const current = refs.preview.querySelector(".draft-desk-listen-beat.is-current");
  current?.scrollIntoView({ block: "center", behavior: "auto" });
}

// --- playback --------------------------------------------------------------

function speakQuickDraftBeat(index) {
  const state = quickDraftListenState;
  if (!state || !quickDraftListenSupported()) return;
  const win = typeof getWindow === "function" ? getWindow("quickDraft") : null;
  const windowGone = !win || win.classList.contains("is-hidden") || win.classList.contains("is-app-hidden");
  if (state.projectId !== activeProjectId || windowGone) {
    stopQuickDraftListen();
    return;
  }
  const beat = state.beats[index];
  if (!beat) {
    state.playing = false;
    syncQuickDraftListenBeatUi();
    setQuickDraftStatus(t("quick_draft_listen_done"));
    return;
  }
  const session = quickDraftListenSession;
  const utterance = new SpeechSynthesisUtterance(beat.text);
  const voice = quickDraftListenVoice(beat.text);
  if (voice) utterance.voice = voice;
  utterance.lang = quickDraftListenLang(beat.text) === "zh" ? "zh-CN" : "en-US";
  utterance.rate = Number(state.rate) || 1;
  utterance.onstart = () => {
    if (session !== quickDraftListenSession) return;
    state.currentBeat = index;
    quickDraftListenBeatStartedAt = Date.now();
    syncQuickDraftListenBeatUi();
    setQuickDraftStatus(t("quick_draft_listen_reading", index + 1, state.beats.length));
  };
  utterance.onend = () => {
    if (session !== quickDraftListenSession || !state.playing) return;
    speakQuickDraftBeat(index + 1);
  };
  utterance.onerror = () => {
    if (session !== quickDraftListenSession) return;
    state.playing = false;
    syncQuickDraftListenBeatUi();
    setQuickDraftStatus(t("quick_draft_listen_no_voice"));
  };
  window.speechSynthesis.speak(utterance);
}

function playQuickDraftListen() {
  if (quickDraftRehearse) stopQuickDraftRehearse({ silent: true });
  if (!quickDraftListenSupported()) {
    setQuickDraftStatus(t("quick_draft_listen_no_voice"));
    return false;
  }
  const state = ensureQuickDraftListenState();
  if (!state.beats.length) return false;
  quickDraftListenSession += 1;
  window.speechSynthesis.cancel();
  state.playing = true;
  syncQuickDraftListenBeatUi();
  speakQuickDraftBeat(Math.min(state.currentBeat, state.beats.length - 1));
  return true;
}

function pauseQuickDraftListen() {
  const state = quickDraftListenState;
  quickDraftListenSession += 1;
  if (quickDraftListenSupported()) window.speechSynthesis.cancel();
  if (!state) return;
  state.playing = false;
  syncQuickDraftListenBeatUi();
  setQuickDraftStatus(t("quick_draft_listen_paused", state.currentBeat + 1));
}

function stopQuickDraftListen() {
  quickDraftListenSession += 1;
  if (quickDraftListenSupported()) window.speechSynthesis.cancel();
  if (quickDraftListenState) quickDraftListenState.playing = false;
  if (quickDraftRehearse) stopQuickDraftRehearse({ silent: true });
}

// While playing, back within the first two seconds means the previous beat;
// later it means "read this beat again". While paused it always steps back.
function stepQuickDraftListenBack() {
  const state = quickDraftListenState || ensureQuickDraftListenState();
  const withinBeat = Date.now() - quickDraftListenBeatStartedAt < 2000;
  if (!state.playing || withinBeat) state.currentBeat = Math.max(0, state.currentBeat - 1);
  if (state.playing) playQuickDraftListen();
  else syncQuickDraftListenBeatUi();
}

function seekQuickDraftListen(index) {
  const state = quickDraftListenState || ensureQuickDraftListenState();
  state.currentBeat = Math.max(0, Math.min(state.beats.length - 1, index));
  if (state.playing) playQuickDraftListen();
  else syncQuickDraftListenBeatUi();
}

function stepQuickDraftListenForward() {
  const state = quickDraftListenState || ensureQuickDraftListenState();
  seekQuickDraftListen(state.currentBeat + 1);
}

// 停止 is a full stop, not a bookmark: the audio ends and the prompter goes
// back to the top. Pause is the one that remembers its place.
function stopQuickDraftListenPlayback() {
  stopQuickDraftListen();
  const state = quickDraftListenState;
  if (state) state.currentBeat = 0;
  syncQuickDraftListenBeatUi();
  setQuickDraftStatus(t("quick_draft_listen_stopped"));
  return true;
}

// --- rehearse (自己排练) ---------------------------------------------------
//
// The prompter follows the author's own voice: SpeechRecognition (the same
// surface Dictation already uses) transcribes while they read aloud, the
// current beat advances when its ending is heard, and a sentence they
// naturally said differently comes back as their OWN spoken version to adopt —
// never a grade, never a score, never a model rewrite.

let quickDraftRehearse = null;

function quickDraftRehearseSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function normalizeSpokenText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s，。、！？；：""''「」『』（）,.!?;:'"()\-—…·]/g, "");
}

function quickDraftBeatTail(beat) {
  const normalized = normalizeSpokenText(beat.text);
  const size = /[㐀-鿿]/.test(normalized) ? 4 : 8;
  return normalized.slice(-size);
}

function finishRehearsedBeat(state, beat, spokenRaw) {
  const spoken = String(spokenRaw || "").trim();
  const normalizedSpoken = normalizeSpokenText(spoken);
  const normalizedBeat = normalizeSpokenText(beat.text);
  const differs = normalizedSpoken && normalizedSpoken !== normalizedBeat
    && normalizedSpoken.length >= Math.floor(normalizedBeat.length / 2);
  if (quickDraftRehearse) quickDraftRehearse.beatsRead += 1;
  if (differs) {
    if (quickDraftRehearse) quickDraftRehearse.rewordings += 1;
    const wasEmpty = !state.findings.length;
    state.findings.push({ kind: "spoken", beatIndex: beat.index, quote: beat.text, spoken });
    if (wasEmpty) state.findingsFingerprint = state.fingerprint;
    renderQuickDraftFindings();
  }
}

function handleRehearseTranscript(finalChunk, interimChunk) {
  const state = quickDraftListenState;
  const session = quickDraftRehearse;
  if (!state || !session) return;
  const beat = state.beats[state.currentBeat];
  if (!beat) {
    stopQuickDraftRehearse();
    return;
  }
  if (finalChunk) session.buffer += finalChunk;
  const heard = normalizeSpokenText(session.buffer + (interimChunk || ""));
  const tail = quickDraftBeatTail(beat);
  if (!tail || !heard.includes(tail)) return;
  finishRehearsedBeat(state, beat, session.buffer);
  session.buffer = "";
  if (state.currentBeat >= state.beats.length - 1) {
    stopQuickDraftRehearse();
    return;
  }
  state.currentBeat += 1;
  syncQuickDraftListenBeatUi();
  setQuickDraftStatus(t("quick_draft_listen_rehearsing", state.currentBeat + 1));
}

function startQuickDraftRehearse() {
  if (quickDraftRehearse) return stopQuickDraftRehearse();
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    setQuickDraftStatus(t("quick_draft_listen_rehearse_no_mic"));
    return false;
  }
  pauseQuickDraftListen();
  const state = ensureQuickDraftListenState();
  if (!state.beats.length) return false;
  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = quickDraftListenLang(state.beats[state.currentBeat]?.text || "") === "zh" ? "zh-CN" : "en-US";
  const session = { recognition, buffer: "", active: true, beatsRead: 0, rewordings: 0 };
  quickDraftRehearse = session;
  recognition.onstart = () => {
    if (quickDraftRehearse !== session) return;
    syncQuickDraftListenBeatUi();
    setQuickDraftStatus(t("quick_draft_listen_rehearsing", state.currentBeat + 1));
  };
  recognition.onresult = (event) => {
    if (quickDraftRehearse !== session) return;
    let finalChunk = "";
    let interimChunk = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) finalChunk += event.results[i][0].transcript;
      else interimChunk += event.results[i][0].transcript;
    }
    handleRehearseTranscript(finalChunk, interimChunk);
  };
  recognition.onerror = (event) => {
    if (quickDraftRehearse !== session) return;
    session.active = false;
    stopQuickDraftRehearse();
    setQuickDraftStatus(t(
      event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "quick_draft_listen_rehearse_no_mic"
        : "quick_draft_listen_rehearse_stopped"
    ));
  };
  recognition.onend = () => {
    if (quickDraftRehearse !== session || !session.active) return;
    // Chrome ends recognition after a silence; keep listening until the
    // author stops the rehearsal themselves.
    try { recognition.start(); } catch { stopQuickDraftRehearse(); }
  };
  try {
    recognition.start();
  } catch {
    quickDraftRehearse = null;
    setQuickDraftStatus(t("quick_draft_listen_rehearse_no_mic"));
    return false;
  }
  syncQuickDraftListenBeatUi();
  return true;
}

// Ending a rehearsal reports what actually happened, in the author's favor:
// beats read, and how many of their own more natural phrasings were kept.
function stopQuickDraftRehearse({ silent = false } = {}) {
  const session = quickDraftRehearse;
  if (!session) return false;
  session.active = false;
  quickDraftRehearse = null;
  try { session.recognition.stop(); } catch { /* already stopped */ }
  syncQuickDraftListenBeatUi();
  if (!silent) {
    if (session.beatsRead > 0 && session.rewordings > 0) {
      setQuickDraftStatus(t("quick_draft_listen_rehearse_summary", session.beatsRead, session.rewordings));
    } else if (session.beatsRead > 0) {
      setQuickDraftStatus(t("quick_draft_listen_rehearse_summary_clean", session.beatsRead));
    } else {
      setQuickDraftStatus(t("quick_draft_listen_rehearse_stopped"));
    }
  }
  return true;
}

function markQuickDraftListenLost() {
  const state = quickDraftListenState || ensureQuickDraftListenState();
  const beat = state.beats[state.currentBeat];
  if (!beat) return;
  // While a partner is listening, the mark is theirs — same button, same
  // beat, a different label on the row so the creator knows whose ear it was.
  const kind = quickDraftPartnerListen ? "partner" : "lost";
  state.lostBeatIndexes.add(beat.index);
  const already = state.findings.some((finding) => finding.kind === kind && finding.beatIndex === beat.index);
  if (!already) {
    const wasEmpty = !state.findings.length;
    state.findings.push({ kind, beatIndex: beat.index, quote: beat.text });
    if (wasEmpty) state.findingsFingerprint = state.fingerprint;
    if (quickDraftPartnerListen) quickDraftPartnerListen.marks += 1;
  }
  syncQuickDraftListenBeatUi();
  renderQuickDraftFindings();
  setQuickDraftStatus(t("quick_draft_listen_marked", beat.index + 1));
}

// --- partner listen (伙伴听稿) ----------------------------------------------
//
// A partner listener is read-only, with exactly two inputs: the 「这里没跟上」
// mark and one short note. No names, no roles, no history of who said what
// about whom — the product never models the relationship. The session is a
// counter and a note field, nothing more, and it never touches the document.

let quickDraftPartnerListen = null;

function togglePartnerListen() {
  if (quickDraftPartnerListen) return stopPartnerListen();
  if (quickDraftRehearse) stopQuickDraftRehearse({ silent: true });
  const state = ensureQuickDraftListenState();
  if (!state.beats.length) return false;
  quickDraftPartnerListen = { marks: 0, note: "" };
  renderQuickDraftFindings();
  setQuickDraftStatus(t("quick_draft_listen_partner_on"));
  if (typeof updateMenuState === "function") updateMenuState();
  return true;
}

function stopPartnerListen() {
  const session = quickDraftPartnerListen;
  if (!session) return false;
  quickDraftPartnerListen = null;
  const note = String(session.note || "").trim();
  if (note) {
    const state = ensureQuickDraftListenState();
    const wasEmpty = !state.findings.length;
    state.findings.push({ kind: "partner-note", quote: note });
    if (wasEmpty) state.findingsFingerprint = state.fingerprint;
  }
  renderQuickDraftFindings();
  setQuickDraftStatus(t("quick_draft_listen_partner_summary", session.marks));
  if (typeof updateMenuState === "function") updateMenuState();
  return true;
}

// --- findings --------------------------------------------------------------

function setQuickDraftFindings(findings = [], keep = []) {
  const state = ensureQuickDraftListenState();
  const kept = state.findings.filter((finding) => finding.kind !== "review");
  state.findings = [
    ...findings.slice(0, 6).map((finding) => ({
      kind: "review",
      type: String(finding.type || ""),
      quote: String(finding.quote || ""),
      why: String(finding.whyViewerGetsLost || ""),
      change: String(finding.minimumChange || ""),
    })),
    ...kept,
  ];
  state.keep = (Array.isArray(keep) ? keep : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  state.findingsFingerprint = state.fingerprint;
  state.pendingFix = null;
  renderQuickDraftFindings();
  return state.findings.length;
}

function quickDraftFindingsHost() {
  if (quickDraftFindingsSection?.isConnected) return quickDraftFindingsSection;
  if (!refs.eli5Bar) return null;
  const section = document.createElement("section");
  section.className = "draft-desk-findings";
  section.setAttribute("data-quick-draft-findings", "");
  section.hidden = true;
  refs.eli5Bar.after(section);
  section.addEventListener("click", onQuickDraftFindingClick);
  section.addEventListener("change", onQuickDraftFindingChange);
  quickDraftFindingsSection = section;
  return section;
}

// The partner's one note is typed where the marks land; it becomes a row only
// when the session ends and the note is not empty.
function onQuickDraftFindingChange(event) {
  const note = event.target.closest?.("[data-quick-draft-partner-note]");
  if (note && quickDraftPartnerListen) quickDraftPartnerListen.note = String(note.value || "");
}

function quickDraftFindingTypeLabel(type) {
  const labels = window.AISystem6ModelTaskRuntime?.eli5ReviewLabels?.(currentLanguage) || {};
  return labels[type] || type;
}

function renderQuickDraftFindings() {
  const host = quickDraftFindingsHost();
  if (!host) return;
  const state = quickDraftListenState;
  const hasContent = state && state.projectId === activeProjectId
    && (state.findings.length || (state.keep || []).length || quickDraftPartnerListen);
  if (!hasContent) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  const stale = state.findingsFingerprint !== textComposeHash(quickDraftListenBody());
  // Grounded encouragement first: the review's own "worth keeping" moves.
  const keepRows = (state.keep || []).map((item) => [
    '<li class="draft-desk-finding-row draft-desk-finding-kept">',
    `<span class="draft-desk-finding-type">${escapeHtml(t("quick_draft_finding_keep_label"))}</span>`,
    `<blockquote class="draft-desk-finding-quote">${escapeHtml(item)}</blockquote>`,
    "</li>",
  ].join("")).join("");
  const rows = state.findings.map((finding, index) => {
    const label = finding.kind === "lost"
      ? t("quick_draft_finding_lost_label")
      : finding.kind === "partner"
        ? t("quick_draft_finding_partner_label")
        : finding.kind === "partner-note"
          ? t("quick_draft_finding_partner_note_label")
          : finding.kind === "spoken"
            ? t("quick_draft_finding_spoken_label")
            : quickDraftFindingTypeLabel(finding.type);
    const why = finding.kind === "review" && finding.why
      ? `<p class="draft-desk-finding-why">${escapeHtml(finding.why)}</p>` : "";
    const change = finding.kind === "review" && finding.change
      ? `<p class="draft-desk-finding-change">${escapeHtml(finding.change)}</p>` : "";
    const spoken = finding.kind === "spoken"
      ? `<p class="draft-desk-finding-spoken">${escapeHtml(finding.spoken)}</p>` : "";
    // When audio alone fails, a rewrite is sometimes the wrong instruction:
    // the honest exits are more narration, an on-screen visual cue, or both.
    // They record a production note for the shot list and never touch the text.
    const visualExits = finding.kind === "review" && finding.type === "visual-dependence"
      ? [
        `<button class="btn mini-btn" type="button" data-quick-draft-visual-exit="narration" data-quick-draft-visual-index="${index}">${escapeHtml(t("quick_draft_finding_visual_narration"))}</button>`,
        `<button class="btn mini-btn" type="button" data-quick-draft-visual-exit="visual" data-quick-draft-visual-index="${index}">${escapeHtml(t("quick_draft_finding_visual_cue"))}</button>`,
        `<button class="btn mini-btn" type="button" data-quick-draft-visual-exit="both" data-quick-draft-visual-index="${index}">${escapeHtml(t("quick_draft_finding_visual_both"))}</button>`,
      ]
      : [];
    const actions = finding.kind === "partner-note"
      ? [
        `<button class="btn mini-btn" type="button" data-quick-draft-finding-keep="${index}">${escapeHtml(t("quick_draft_finding_keep"))}</button>`,
      ]
      : finding.kind === "spoken"
        ? [
          `<button class="btn mini-btn default" type="button" data-quick-draft-spoken-adopt="${index}">${escapeHtml(t("quick_draft_finding_use_spoken"))}</button>`,
          `<button class="btn mini-btn" type="button" data-quick-draft-finding-jump="${index}">${escapeHtml(t("quick_draft_finding_jump"))}</button>`,
          `<button class="btn mini-btn" type="button" data-quick-draft-finding-keep="${index}">${escapeHtml(t("quick_draft_finding_keep"))}</button>`,
        ]
        : [
          ...visualExits,
          `<button class="btn mini-btn" type="button" data-quick-draft-finding-jump="${index}">${escapeHtml(t("quick_draft_finding_jump"))}</button>`,
          `<button class="btn mini-btn" type="button" data-quick-draft-finding-fix="${index}">${escapeHtml(t("quick_draft_finding_fix"))}</button>`,
          `<button class="btn mini-btn" type="button" data-quick-draft-finding-keep="${index}">${escapeHtml(t("quick_draft_finding_keep"))}</button>`,
        ];
    return [
      `<li class="draft-desk-finding-row" data-quick-draft-finding="${index}">`,
      `<span class="draft-desk-finding-type">${escapeHtml(label)}</span>`,
      `<blockquote class="draft-desk-finding-quote">${escapeHtml(finding.quote)}</blockquote>`,
      spoken,
      why,
      change,
      `<span class="draft-desk-finding-actions">${actions.join("")}</span>`,
      '<div class="draft-desk-fix-diff" data-quick-draft-fix-diff hidden></div>',
      "</li>",
    ].join("");
  }).join("");
  // While the partner listens, their one note is typed here; it becomes a row
  // only when the session ends and the note says something.
  const partnerNoteRow = quickDraftPartnerListen
    ? [
      '<li class="draft-desk-finding-row draft-desk-finding-partner-note">',
      `<span class="draft-desk-finding-type">${escapeHtml(t("quick_draft_finding_partner_note_label"))}</span>`,
      `<input type="text" maxlength="120" data-quick-draft-partner-note aria-label="${escapeHtml(t("quick_draft_finding_partner_note_label"))}" placeholder="${escapeHtml(t("quick_draft_listen_partner_note_hint"))}" value="${escapeHtml(String(quickDraftPartnerListen.note || ""))}" />`,
      "</li>",
    ].join("")
    : "";
  host.innerHTML = [
    '<div class="draft-desk-region-head">',
    `<b>${escapeHtml(t("quick_draft_findings_title"))}</b>`,
    `<button class="btn mini-btn" type="button" data-quick-draft-finding-praise>${escapeHtml(t("quick_draft_chip_praise"))}</button>`,
    "</div>",
    stale ? `<p class="draft-desk-findings-stale">${escapeHtml(t("quick_draft_findings_stale"))}</p>` : "",
    `<ol class="draft-desk-finding-list">${keepRows}${rows}${partnerNoteRow}</ol>`,
  ].join("");
  host.hidden = false;
}

function locateQuickDraftFinding(finding) {
  return window.AISystem6ListenBeats.findListenQuoteRange(quickDraftListenBody(), finding.quote);
}

function jumpToQuickDraftFinding(index) {
  const state = quickDraftListenState;
  const finding = state?.findings[index];
  if (!finding) return false;
  const range = locateQuickDraftFinding(finding);
  if (!range) {
    setQuickDraftStatus(t("quick_draft_finding_jump_missing"));
    return false;
  }
  if (currentQuickDraftDisplayMode() === "listen") {
    const beats = ensureQuickDraftListenState().beats;
    const beat = window.AISystem6ListenBeats.listenBeatForOffset(beats, range.start);
    if (beat) seekQuickDraftListen(beat.index);
    return true;
  }
  if (currentQuickDraftDisplayMode() !== "body") leaveQuickDraftPreview();
  if (!refs.draft) return false;
  refs.draft.focus();
  refs.draft.selectionStart = range.start;
  refs.draft.selectionEnd = range.end;
  return true;
}

// A visual-cue exit resolves the finding without a rewrite: the beat gets a
// production note (add narration, add an on-screen cue, or both) that the
// shot list will carry. The note anchors by quote and re-locates at export —
// an unlocatable beat refuses here rather than guessing.
function noteVisualCueExit(index, exit = "visual") {
  const state = quickDraftListenState;
  const finding = state?.findings[index];
  if (!finding) return false;
  const located = quickDraftFixBeat(finding);
  if (!located) {
    setQuickDraftStatus(t("quick_draft_finding_jump_missing"));
    return false;
  }
  state.visualCues.push({
    quote: located.beat.text,
    narration: exit === "narration" || exit === "both",
    visual: exit === "visual" || exit === "both",
  });
  dismissQuickDraftFinding(index);
  setQuickDraftStatus(t("quick_draft_visual_cue_noted", located.beat.index + 1));
  return true;
}

function dismissQuickDraftFinding(index) {
  const state = quickDraftListenState;
  if (!state) return;
  const [removed] = state.findings.splice(index, 1);
  if (removed?.kind === "lost" || removed?.kind === "partner") state.lostBeatIndexes.delete(removed.beatIndex);
  state.pendingFix = null;
  renderQuickDraftFindings();
  syncQuickDraftListenBeatUi();
}

// --- fix one spot ----------------------------------------------------------

function quickDraftBeatLineSpan(body, beat) {
  let line = 1;
  for (let i = 0; i < beat.start; i += 1) if (body[i] === "\n") line += 1;
  let end = line;
  for (const ch of beat.text) if (ch === "\n") end += 1;
  return { start: line, end };
}

function quickDraftFixBeat(finding) {
  const body = quickDraftListenBody();
  const range = locateQuickDraftFinding(finding);
  if (!range) return null;
  const beats = window.AISystem6ListenBeats.segmentListenBeats(body);
  const beat = window.AISystem6ListenBeats.listenBeatForOffset(beats, range.start);
  return beat ? { body, beat } : null;
}

async function requestEli5FixOne(index) {
  // A fix writes the document; a read-only subject never accepts one. The
  // listen view can read a developed document, but the pen stays with the
  // application that owns it.
  if (typeof lightroomIsReadOnly === "function" && lightroomIsReadOnly()) {
    setQuickDraftStatus(t("lightroom_read_only"));
    return false;
  }
  const state = quickDraftListenState;
  const finding = state?.findings[index];
  if (!finding) return false;
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    return false;
  }
  const located = quickDraftFixBeat(finding);
  if (!located) {
    setQuickDraftStatus(t("quick_draft_finding_jump_missing"));
    return false;
  }
  const promptBody = quickDraftEli5PromptBody("lenses.eli5-fix-one");
  if (!promptBody) {
    setQuickDraftStatus(t("quick_draft_eli5_unavailable"));
    return false;
  }
  const slot = activeProjectQuickDraft({ create: false });
  const span = quickDraftBeatLineSpan(located.body, located.beat);
  const protectedRanges = protectedRangesSnapshot(slot?.record);
  const overlapsProtection = (protectedRanges || []).some((range) => range.start <= span.end && range.end >= span.start);
  if (overlapsProtection) {
    setQuickDraftStatus(t("quick_draft_finding_fix_protected"));
    return false;
  }
  const problem = finding.kind === "review"
    ? `${quickDraftFindingTypeLabel(finding.type)}：${finding.why || finding.change || ""}`
    : t("quick_draft_finding_lost_label");
  if (requestController) requestController.abort();
  requestController = new AbortController();
  setBusy(true);
  setQuickDraftStatus(t("quick_draft_finding_fixing"));
  try {
    const userContent = [
      `${currentLanguage === "zh" ? "段落" : "Paragraph"}：`,
      located.beat.text,
      `${currentLanguage === "zh" ? "听丢问题" : "Comprehension problem"}：${problem}`,
      finding.kind === "review" && finding.change
        ? `${currentLanguage === "zh" ? "建议的最小修改" : "Suggested minimal change"}：${finding.change}`
        : "",
    ].filter(Boolean).join("\n\n");
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
      messages: withMarkdownModelMessages([
        { role: "system", content: promptBody },
        { role: "user", content: userContent },
      ]),
      temperature: 0.3,
      max_tokens: 800,
      ai_system6_task_kind: "writing.eli5-rewrite",
      stream: false,
    }, requestController.signal);
    if (!response.ok) throw new Error(serviceErrorDetail(response.status, await response.text()));
    const result = await response.json().catch(() => ({}));
    const candidate = cleanMingmingQuickDraftBody(String(result?.choices?.[0]?.message?.content || "").trim());
    if (!candidate) {
      setQuickDraftStatus(t("quick_draft_parse_failed"));
      return false;
    }
    if (candidate.trim() === located.beat.text.trim()) {
      setQuickDraftStatus(t("quick_draft_finding_fix_same"));
      return false;
    }
    state.pendingFix = {
      findingIndex: index,
      projectId: activeProjectId,
      start: located.beat.start,
      end: located.beat.end,
      original: located.beat.text,
      candidate,
      reason: "before-eli5-fix",
    };
    renderQuickDraftFixDiff(index);
    setQuickDraftStatus(t("quick_draft_finding_fix_ready"));
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") presentQuickDraftModelFailure(error);
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

function renderQuickDraftFixDiff(index) {
  const host = quickDraftFindingsHost();
  const state = quickDraftListenState;
  const fix = state?.pendingFix;
  if (!host || !fix || fix.findingIndex !== index) return;
  const row = host.querySelector(`[data-quick-draft-finding="${index}"] [data-quick-draft-fix-diff]`);
  if (!row) return;
  const runs = quickDraftGrainRuns(fix.original, fix.candidate);
  const candidateHtml = runs.map((run) => (
    run.generation
      ? `<mark class="draft-desk-fix-changed">${escapeHtml(run.text)}</mark>`
      : escapeHtml(run.text)
  )).join("");
  row.innerHTML = [
    `<p class="draft-desk-fix-original">${escapeHtml(fix.original)}</p>`,
    `<p class="draft-desk-fix-candidate">${candidateHtml}</p>`,
    '<span class="draft-desk-finding-actions">',
    `<button class="btn mini-btn default" type="button" data-quick-draft-fix-adopt="${index}">${escapeHtml(t("quick_draft_finding_adopt"))}</button>`,
    `<button class="btn mini-btn" type="button" data-quick-draft-fix-edit="${index}">${escapeHtml(t("quick_draft_finding_edit"))}</button>`,
    `<button class="btn mini-btn" type="button" data-quick-draft-fix-keep="${index}">${escapeHtml(t("quick_draft_finding_keep"))}</button>`,
    "</span>",
  ].join("");
  row.hidden = false;
}

async function applyQuickDraftEli5Fix(index) {
  if (typeof lightroomIsReadOnly === "function" && lightroomIsReadOnly()) {
    setQuickDraftStatus(t("lightroom_read_only"));
    return false;
  }
  const state = quickDraftListenState;
  const fix = state?.pendingFix;
  if (!fix || fix.findingIndex !== index || fix.projectId !== activeProjectId) return false;
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task || !task.stillOwnsActiveProject()) return false;
  const body = quickDraftListenBody();
  if (body.slice(fix.start, fix.end) !== fix.original) {
    setQuickDraftStatus(t("quick_draft_finding_jump_missing"));
    state.pendingFix = null;
    renderQuickDraftFindings();
    return false;
  }
  const nextBody = body.slice(0, fix.start) + fix.candidate + body.slice(fix.end);
  const currentRecord = task.currentRecord();
  const version = normalizeQuickDraftVersion({
    id: stableId("version"),
    body,
    title: currentRecord.workspace.title,
    createdAt: new Date().toISOString(),
    reason: fix.reason || "before-eli5-fix",
    source: "quick-draft",
  });
  /** @type {any} */
  const patch = {
    workspace: {
      body: nextBody,
      versions: [...darkroomOf(currentRecord).versions, version].slice(-100),
    },
  };
  if (refs.draft) refs.draft.value = nextBody;
  const committed = await task.commit(patch, { captureForm: false });
  if (!committed.ok) {
    if (refs.draft) refs.draft.value = body;
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  state.pendingFix = null;
  dismissQuickDraftFinding(index);
  quickDraftListenState = null;
  ensureQuickDraftListenState();
  if (currentQuickDraftDisplayMode() === "listen") renderQuickDraftListenView();
  renderQuickDraft(committed.record);
  setQuickDraftStatus(t(fix.reason === "before-spoken-adopt"
    ? "quick_draft_finding_spoken_applied"
    : "quick_draft_finding_fix_applied"));
  return true;
}

// The spoken version came out of the author's own mouth during rehearsal:
// adopting it is a splice of their words, no model involved.
async function adoptSpokenRewording(index) {
  if (typeof lightroomIsReadOnly === "function" && lightroomIsReadOnly()) {
    setQuickDraftStatus(t("lightroom_read_only"));
    return false;
  }
  const state = quickDraftListenState;
  const finding = state?.findings[index];
  if (!finding || finding.kind !== "spoken" || !finding.spoken) return false;
  const located = quickDraftFixBeat(finding);
  if (!located) {
    setQuickDraftStatus(t("quick_draft_finding_jump_missing"));
    return false;
  }
  state.pendingFix = {
    findingIndex: index,
    projectId: activeProjectId,
    start: located.beat.start,
    end: located.beat.end,
    original: located.beat.text,
    candidate: finding.spoken,
    reason: "before-spoken-adopt",
  };
  return applyQuickDraftEli5Fix(index);
}

// --- events ----------------------------------------------------------------

function onQuickDraftFindingClick(event) {
  const praise = event.target.closest("[data-quick-draft-finding-praise]");
  if (praise) return void window.AISystem6QuickDraftAI?.runClioTalkAction?.("praise", { announceUser: true });
  const spokenAdopt = event.target.closest("[data-quick-draft-spoken-adopt]");
  if (spokenAdopt) return void adoptSpokenRewording(Number(spokenAdopt.dataset.quickDraftSpokenAdopt));
  const visualExit = event.target.closest("[data-quick-draft-visual-exit]");
  if (visualExit) {
    return void noteVisualCueExit(
      Number(visualExit.dataset.quickDraftVisualIndex),
      visualExit.dataset.quickDraftVisualExit || "visual"
    );
  }
  const jump = event.target.closest("[data-quick-draft-finding-jump]");
  if (jump) return void jumpToQuickDraftFinding(Number(jump.dataset.quickDraftFindingJump));
  const fixButton = event.target.closest("[data-quick-draft-finding-fix]");
  if (fixButton) return void requestEli5FixOne(Number(fixButton.dataset.quickDraftFindingFix));
  const keep = event.target.closest("[data-quick-draft-finding-keep]");
  if (keep) return void dismissQuickDraftFinding(Number(keep.dataset.quickDraftFindingKeep));
  const adopt = event.target.closest("[data-quick-draft-fix-adopt]");
  if (adopt) return void applyQuickDraftEli5Fix(Number(adopt.dataset.quickDraftFixAdopt));
  const edit = event.target.closest("[data-quick-draft-fix-edit]");
  if (edit) {
    const state = quickDraftListenState;
    if (state) state.pendingFix = null;
    jumpToQuickDraftFinding(Number(edit.dataset.quickDraftFixEdit));
    renderQuickDraftFindings();
    return;
  }
  const keepOriginal = event.target.closest("[data-quick-draft-fix-keep]");
  if (keepOriginal) {
    const state = quickDraftListenState;
    if (state) state.pendingFix = null;
    renderQuickDraftFindings();
  }
}

function onQuickDraftListenClick(event) {
  if (currentQuickDraftDisplayMode() !== "listen") return;
  const toggle = event.target.closest("[data-quick-draft-listen-toggle]");
  if (toggle) {
    if (quickDraftListenState?.playing) pauseQuickDraftListen();
    else playQuickDraftListen();
    return;
  }
  if (event.target.closest("[data-quick-draft-listen-back]")) return void stepQuickDraftListenBack();
  if (event.target.closest("[data-quick-draft-listen-rehearse]")) return void startQuickDraftRehearse();
  if (event.target.closest("[data-quick-draft-listen-lost]")) return void markQuickDraftListenLost();
  const progress = event.target.closest("[data-quick-draft-listen-progress]");
  if (progress) {
    const state = quickDraftListenState || ensureQuickDraftListenState();
    const rect = progress.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    seekQuickDraftListen(Math.round(ratio * (state.beats.length - 1)));
    return;
  }
  const beatRow = event.target.closest("[data-quick-draft-listen-beat]");
  if (beatRow) seekQuickDraftListen(Number(beatRow.getAttribute("data-quick-draft-listen-beat")));
}

function onQuickDraftListenKeydown(event) {
  if (currentQuickDraftDisplayMode() !== "listen") return;
  const progress = event.target.closest?.("[data-quick-draft-listen-progress]");
  if (!progress) return;
  const state = quickDraftListenState || ensureQuickDraftListenState();
  if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    event.preventDefault();
    seekQuickDraftListen(state.currentBeat + 1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    event.preventDefault();
    seekQuickDraftListen(state.currentBeat - 1);
  }
}

function onQuickDraftListenChange(event) {
  if (currentQuickDraftDisplayMode() !== "listen") return;
  const state = quickDraftListenState || ensureQuickDraftListenState();
  const voice = event.target.closest?.("[data-quick-draft-listen-voice]");
  if (voice) {
    setQuickDraftListenVoice(voice.value);
    if (state.playing) playQuickDraftListen();
    return;
  }
  const rate = event.target.closest?.("[data-quick-draft-listen-rate]");
  if (!rate) return;
  state.rate = QUICK_DRAFT_LISTEN_RATES.includes(rate.value) ? rate.value : "1";
  if (state.playing) playQuickDraftListen();
}

window.addEventListener("pagehide", stopQuickDraftListen);

// The transport was reachable only by clicking its own buttons. The menu needs
// the same three moves by name, so they are named.
function toggleQuickDraftListen() {
  if (quickDraftListenState?.playing) return pauseQuickDraftListen();
  return playQuickDraftListen();
}

// --- Deliver-menu exports (P3) ----------------------------------------------
//
// Subtitles and the shot list go out through the existing Deliver menu — no
// new panel. Both are built from the same listen beats the prompter reads;
// SRT timings are estimates from reading speed and the export's own receipt
// says so.

function quickDraftListenExportName() {
  const slot = activeProjectQuickDraft({ create: false });
  const title = String(
    refs.titleInput?.value
    || slot?.record.workspace.title
    || titleFromBody(quickDraftListenBody())
    || "quick-draft"
  ).trim();
  return title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "quick-draft";
}

async function exportQuickDraftListenSrt() {
  const state = ensureQuickDraftListenState();
  if (!state.beats.length) {
    setQuickDraftStatus(t("quick_draft_listen_empty"));
    return false;
  }
  const srt = window.AISystem6ListenBeats.buildListenSrt(state.beats, { rate: Number(state.rate) || 1 });
  window.AISystem6WebPlatform.saveArtifact({
    text: srt,
    fileName: `${quickDraftListenExportName()}.srt`,
    mimeType: "text/plain;charset=utf-8",
  });
  setQuickDraftStatus(t("quick_draft_export_srt_done"));
  return true;
}

async function exportQuickDraftShotList() {
  const state = ensureQuickDraftListenState();
  if (!state.beats.length) {
    setQuickDraftStatus(t("quick_draft_listen_empty"));
    return false;
  }
  const body = quickDraftListenBody();
  // Re-locate every visual-cue note by its quote. A note whose sentence has
  // left the body is dropped, never guessed onto another beat.
  const cuesByBeat = new Map();
  for (const cue of state.visualCues || []) {
    const range = window.AISystem6ListenBeats.findListenQuoteRange(body, cue.quote);
    if (!range) continue;
    const beat = window.AISystem6ListenBeats.listenBeatForOffset(state.beats, range.start);
    if (!beat) continue;
    const slot = cuesByBeat.get(beat.index) || { narration: false, visual: false };
    slot.narration = slot.narration || cue.narration === true;
    slot.visual = slot.visual || cue.visual === true;
    cuesByBeat.set(beat.index, slot);
  }
  const cell = (value) => String(value || "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
  const rows = state.beats.map((beat) => {
    const cue = cuesByBeat.get(beat.index);
    const notes = [];
    if (cue?.narration) notes.push(t("quick_draft_finding_visual_narration"));
    if (cue?.visual) notes.push(t("quick_draft_finding_visual_cue"));
    // The one shootable-visual classifier (可拍画面) from the intake strategy
    // signals, reused as a hint — never a claim that footage exists.
    if (!notes.length && QUICK_DRAFT_SHOOTABLE_PATTERN.test(beat.text)) {
      notes.push(t("quick_draft_shootable_hint"));
    }
    return `| ${beat.index + 1} | ${cell(beat.text)} | ${cell(notes.join(" + ")) || "—"} |`;
  });
  const markdown = [
    `# ${quickDraftListenExportName()} · ${t("quick_draft_export_shot_list")}`,
    "",
    `| ${t("quick_draft_shot_list_col_beat")} | ${t("quick_draft_shot_list_col_text")} | ${t("quick_draft_shot_list_col_cue")} |`,
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
  window.AISystem6WebPlatform.saveArtifact({
    text: markdown,
    fileName: `${quickDraftListenExportName()}-shot-list.md`,
    mimeType: "text/markdown;charset=utf-8",
  });
  setQuickDraftStatus(t("quick_draft_export_shot_list_done"));
  return true;
}

window.AISystem6QuickDraftListen = Object.freeze({
  toggle: toggleQuickDraftListen,
  stopPlayback: stopQuickDraftListenPlayback,
  stepBack: stepQuickDraftListenBack,
  stepForward: stepQuickDraftListenForward,
  markLost: markQuickDraftListenLost,
  togglePartner: togglePartnerListen,
  isPartnerListening: () => Boolean(quickDraftPartnerListen),
  exportSrt: exportQuickDraftListenSrt,
  exportShotList: exportQuickDraftShotList,
  isPlaying: () => Boolean(quickDraftListenState?.playing),
  isRehearsing: () => Boolean(quickDraftRehearse),
  voiceRows: () => {
    const state = quickDraftListenState || ensureQuickDraftListenState();
    const sampleText = state?.beats?.[0]?.text || "";
    const active = quickDraftListenVoice(sampleText);
    // A menu is not a catalogue. This browser offers 40-odd system voices;
    // the menu names the first few plus whichever one is speaking, and the
    // full list stays in the transport's own select.
    const choices = quickDraftListenVoiceChoices(sampleText);
    const shown = choices.slice(0, 8);
    if (active && !shown.some((voice) => voice.name === active.name)) shown.push(active);
    // Two voices can share a short name across languages. The transport's own
    // select already disambiguates by language; the menu rows do the same, or
    // the list reads as "Eddy, Eddy, Flo, Flo".
    const shortCounts = new Map();
    shown.forEach((voice) => {
      const short = voice.name.split(" (")[0];
      shortCounts.set(short, (shortCounts.get(short) || 0) + 1);
    });
    return shown.map((voice) => {
      const short = voice.name.split(" (")[0];
      return {
        label: shortCounts.get(short) > 1 ? `${short} · ${voice.lang}` : short,
        action: `lightroom-listen-voice:${voice.name}`,
        checked: voice.name === active?.name,
      };
    });
  },
  renderQuickDraftListenView,
  renderQuickDraftFindings,
  setQuickDraftFindings,
  jumpToQuickDraftFinding,
  requestEli5FixOne,
  applyQuickDraftEli5Fix,
  adoptSpokenRewording,
  startQuickDraftRehearse,
  stopQuickDraftRehearse,
  setQuickDraftListenVoice,
  stop: stopQuickDraftListen,
});
