// @ts-check
// System sounds - a shared, unlock-aware Web Audio engine.
//
// The Macintosh desktop speaks in small mechanical sounds: floppy whirs, the
// startup chime, trash crumples, alert double-beeps. Before this module every
// call created a fresh AudioContext, which browsers suspend until the first
// user gesture - so the boot chime (played before any click) was silently
// dropped and every click allocated a new context. This module owns one
// shared context, resumes it on the first pointer/key interaction, and queues
// sounds requested before that unlock so they replay once audio is allowed.
//
// The tone registry and the play/queue/skip decision are pure data so a test
// can execute them in a bare vm; the engine factory is the only part that
// touches AudioContext and the DOM.

// Each entry is a small tone: frequency Hz, onset seconds, duration seconds,
// volume 0..1, and an optional oscillator wave. The schedules are deliberately
// short and square/sine based, like a System 6 sound driver, not samples.
const SYSTEM_SOUND_TONES = Object.freeze({
  boot: Object.freeze([
    Object.freeze({ f: 523.25, t: 0, d: 0.18, v: 0.045 }),
    Object.freeze({ f: 659.25, t: 0.08, d: 0.18, v: 0.038 }),
    Object.freeze({ f: 783.99, t: 0.16, d: 0.28, v: 0.032 }),
  ]),
  click: Object.freeze([
    Object.freeze({ f: 1000, t: 0, d: 0.05, v: 0.05 }),
  ]),
  menu: Object.freeze([
    // A chosen menu item: one soft mechanical click, slightly lower than the
    // toolbar click so menu actions read as a distinct step.
    Object.freeze({ f: 740, t: 0, d: 0.045, v: 0.04 }),
    Object.freeze({ f: 980, t: 0.03, d: 0.04, v: 0.028 }),
  ]),
  zoom: Object.freeze([
    // Window grow/restore: a quick rising pair, like the frame settling.
    Object.freeze({ f: 620, t: 0, d: 0.07, v: 0.035 }),
    Object.freeze({ f: 880, t: 0.06, d: 0.09, v: 0.028 }),
  ]),
  disk: Object.freeze([
    // A floppy whir-click: two quick ramps.
    Object.freeze({ f: 80, t: 0, d: 0.1, v: 0.02, wave: "sawtooth", ramp: { to: 120 } }),
    Object.freeze({ f: 120, t: 0.1, d: 0.1, v: 0.02, wave: "sawtooth", ramp: { to: 80 } }),
    Object.freeze({ f: 80, t: 0.2, d: 0.1, v: 0.016, wave: "sawtooth" }),
  ]),
  save: Object.freeze([
    Object.freeze({ f: 880, t: 0, d: 0.06, v: 0.035 }),
    Object.freeze({ f: 1174.66, t: 0.06, d: 0.08, v: 0.028 }),
  ]),
  trash: Object.freeze([
    Object.freeze({ f: 220, t: 0, d: 0.08, v: 0.04, wave: "square" }),
    Object.freeze({ f: 110, t: 0.06, d: 0.12, v: 0.025, wave: "sawtooth" }),
  ]),
  alert: Object.freeze([
    Object.freeze({ f: 330, t: 0, d: 0.12, v: 0.05, wave: "square" }),
    Object.freeze({ f: 330, t: 0.16, d: 0.12, v: 0.045, wave: "square" }),
  ]),
  done: Object.freeze([
    Object.freeze({ f: 587.33, t: 0, d: 0.08, v: 0.035 }),
    Object.freeze({ f: 880, t: 0.08, d: 0.12, v: 0.028 }),
  ]),
  open: Object.freeze([
    Object.freeze({ f: 740, t: 0, d: 0.035, v: 0.018 }),
  ]),
  close: Object.freeze([
    Object.freeze({ f: 440, t: 0, d: 0.04, v: 0.016 }),
  ]),
  match: Object.freeze([
    Object.freeze({ f: 660, t: 0, d: 0.05, v: 0.035, wave: "square" }),
    Object.freeze({ f: 990, t: 0.04, d: 0.06, v: 0.026, wave: "square" }),
  ]),
  shutdown: Object.freeze([
    // A gentle descending two-note close, matching the shutdown screen.
    Object.freeze({ f: 392, t: 0, d: 0.22, v: 0.04 }),
    Object.freeze({ f: 329.63, t: 0.16, d: 0.26, v: 0.032 }),
    Object.freeze({ f: 261.63, t: 0.32, d: 0.5, v: 0.024 }),
  ]),
  eject: Object.freeze([
    // A floppy eject: a short motor whir that climbs and stops.
    Object.freeze({ f: 90, t: 0, d: 0.08, v: 0.022, wave: "sawtooth", ramp: { to: 150 } }),
    Object.freeze({ f: 150, t: 0.08, d: 0.1, v: 0.018, wave: "sawtooth", ramp: { to: 110 } }),
  ]),
  type: Object.freeze([
    // A very quiet typewriter tick for the writing surfaces; it should be
    // audible as feedback, never louder than the page itself.
    Object.freeze({ f: 1800, t: 0, d: 0.02, v: 0.012 }),
  ]),
});

const SYSTEM_SOUND_MAX_QUEUE = 8;

function systemSoundTypeKnown(type) {
  return Object.prototype.hasOwnProperty.call(SYSTEM_SOUND_TONES, type);
}

// Pure dispatch decision shared by the engine and its tests:
//   skip  - sound effects are off, or the queue is already full
//   play  - audio is unlocked, play immediately
//   queue - audio is still locked by the browser, hold it for unlock
function systemSoundDispatch(type, { unlocked = false, enabled = true, queueLength = 0 } = {}) {
  if (!enabled) return { action: "skip", reason: "disabled" };
  if (!systemSoundTypeKnown(type)) return { action: "skip", reason: "unknown" };
  if (unlocked) return { action: "play", reason: "unlocked" };
  if (queueLength >= SYSTEM_SOUND_MAX_QUEUE) return { action: "skip", reason: "queue-full" };
  return { action: "queue", reason: "locked" };
}

// The engine is the only DOM/AudioContext-touching part. getEnabled is called
// at play time so the Control Panel toggle applies immediately; the context is
// created lazily and resumed on the first user gesture.
function createSystemSoundEngine({ getEnabled = () => true, documentRef = null } = {}) {
  let context = null;
  let unlocked = false;
  let armed = false;
  const pending = [];

  function ensureContext() {
    if (context) return context;
    const AudioCtor = typeof window !== "undefined"
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioCtor) return null;
    try {
      context = new AudioCtor();
    } catch {
      context = null;
    }
    return context;
  }

  function tone(ctx, entry, baseTime) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = entry.wave || "sine";
    const start = baseTime + (entry.t || 0);
    osc.frequency.setValueAtTime(entry.f, start);
    if (entry.ramp) osc.frequency.linearRampToValueAtTime(entry.ramp.to, start + (entry.d || 0.1));
    gain.gain.setValueAtTime(entry.v ?? 0.04, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (entry.d || 0.1));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + (entry.d || 0.1) + 0.02);
  }

  function playNow(type) {
    const ctx = ensureContext();
    if (!ctx) return false;
    const tones = SYSTEM_SOUND_TONES[type] || [];
    const base = ctx.currentTime + 0.01;
    tones.forEach((entry) => tone(ctx, entry, base));
    return true;
  }

  function flushPending() {
    while (pending.length) {
      playNow(pending.shift());
    }
  }

  function unlock() {
    if (unlocked) return true;
    unlocked = true;
    const ctx = ensureContext();
    if (ctx && ctx.state === "suspended") {
      const resume = typeof ctx.resume === "function" ? ctx.resume() : Promise.resolve();
      Promise.resolve(resume).catch(() => {}).then(flushPending);
    } else {
      flushPending();
    }
    return true;
  }

  function play(type) {
    const decision = systemSoundDispatch(type, {
      unlocked,
      enabled: Boolean(getEnabled()),
      queueLength: pending.length,
    });
    if (decision.action === "play") return playNow(type);
    if (decision.action === "queue") {
      pending.push(type);
      return true;
    }
    return false;
  }

  function armUnlockListeners() {
    const root = documentRef || (typeof document !== "undefined" ? document : null);
    // dataset lives on HTMLElement, not on document itself, so the armed flag
    // is a closure boolean rather than a dataset marker.
    if (!root || armed) return;
    armed = true;
    const trigger = () => unlock();
    root.addEventListener("pointerdown", trigger);
    root.addEventListener("keydown", trigger);
  }

  armUnlockListeners();

  return Object.freeze({
    isUnlocked: () => unlocked,
    pendingCount: () => pending.length,
    play,
    unlock,
  });
}

window.AISystem6SystemSounds = Object.freeze({
  SYSTEM_SOUND_MAX_QUEUE,
  SYSTEM_SOUND_TONES,
  createSystemSoundEngine,
  systemSoundDispatch,
  systemSoundTypeKnown,
});
