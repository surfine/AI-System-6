// Bonsai City audio / 盆景城市音频.
// Schedules, not samples — the System 6 sound-driver ethos scaled up to a
// small deterministic sequencer. The score is our own composition stored as
// JSON note data (three voices over an eight-bar progression); the effects
// are oscillator and noise recipes. No audio files, no randomness, no wall
// clock beyond the AudioContext's own transport.
window.AISystem6BonsaiAudioLoaded = true;

(function initBonsaiAudio() {
  "use strict";

  const TEMPO_BPM = 92;
  const STEPS_PER_BAR = 8; // eighth notes in 4/4
  const SECONDS_PER_STEP = 60 / TEMPO_BPM / 2;

  // Our own eight-bar progression: roots and chord tones as MIDI notes.
  // Voice patterns index into the chord; -1 is a rest.
  const SCORE = Object.freeze({
    bars: [
      { root: 50, tones: [50, 53, 57, 60] }, // D minor color
      { root: 43, tones: [43, 47, 50, 53] }, // G dominant color
      { root: 48, tones: [48, 52, 55, 59] }, // C major color
      { root: 45, tones: [45, 48, 52, 55] }, // A minor color
      { root: 41, tones: [41, 45, 48, 52] }, // F major color
      { root: 40, tones: [40, 43, 47, 50] }, // E minor color
      { root: 50, tones: [50, 53, 57, 60] }, // D minor again
      { root: 43, tones: [43, 47, 50, 53] }, // G turns it around
    ],
    bass: [0, -1, 1, -1, 2, -1, 1, 3],       // walking chord tones
    keys: [-1, 2, -1, -1, 3, -1, 2, -1],     // off-beat comping
    brush: [1, 0, 1, 1, 0, 1, 1, 0],         // noise-burst pattern (1 = hit)
  });

  const midiHz = (note) => 440 * Math.pow(2, (note - 69) / 12);

  // Pure: the events one bar contributes, relative to the bar start.
  function eventsForBar(barIndex) {
    const bar = SCORE.bars[barIndex % SCORE.bars.length];
    const events = [];
    for (let step = 0; step < STEPS_PER_BAR; step += 1) {
      const at = step * SECONDS_PER_STEP;
      const bassTone = SCORE.bass[step];
      if (bassTone >= 0) events.push({ voice: "bass", at, hz: midiHz(bar.tones[bassTone] - 12), duration: SECONDS_PER_STEP * 1.8, gain: 0.16 });
      const keyTone = SCORE.keys[step];
      if (keyTone >= 0) {
        events.push({ voice: "keys", at, hz: midiHz(bar.tones[keyTone]), duration: SECONDS_PER_STEP * 1.4, gain: 0.07 });
        events.push({ voice: "keys", at, hz: midiHz(bar.tones[(keyTone + 2) % bar.tones.length]), duration: SECONDS_PER_STEP * 1.4, gain: 0.05 });
      }
      if (SCORE.brush[step]) events.push({ voice: "brush", at, duration: 0.05, gain: step % 4 === 0 ? 0.05 : 0.028 });
    }
    return events;
  }

  const SFX = Object.freeze({
    plop: [{ wave: "square", from: 220, to: 330, duration: 0.09, gain: 0.12 }],
    bulldoze: [{ wave: "sawtooth", from: 180, to: 70, duration: 0.16, gain: 0.12 }],
    reject: [{ wave: "square", from: 120, to: 110, duration: 0.1, gain: 0.08 }],
    cash: [{ wave: "triangle", from: 660, to: 660, duration: 0.06, gain: 0.1 }, { wave: "triangle", from: 880, to: 880, duration: 0.08, gain: 0.1, delay: 0.07 }],
    siren: [{ wave: "square", from: 620, to: 620, duration: 0.22, gain: 0.09 }, { wave: "square", from: 470, to: 470, duration: 0.22, gain: 0.09, delay: 0.24 },
      { wave: "square", from: 620, to: 620, duration: 0.22, gain: 0.09, delay: 0.48 }, { wave: "square", from: 470, to: 470, duration: 0.22, gain: 0.09, delay: 0.72 }],
    extra: [{ wave: "triangle", from: 520, to: 780, duration: 0.12, gain: 0.1 }, { wave: "triangle", from: 780, to: 520, duration: 0.12, gain: 0.08, delay: 0.13 }],
  });

  function createEngine(options = {}) {
    const AudioContextCtor = options.AudioContextCtor
      || (typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null);
    let context = null;
    let musicEnabled = false;
    let sfxEnabled = true;
    let nextBar = 0;
    let nextBarTime = 0;
    let timer = null;
    let noiseBuffer = null;

    function ensureContext() {
      if (context || !AudioContextCtor) return context;
      try { context = new AudioContextCtor(); } catch { context = null; }
      return context;
    }
    function ensureNoise() {
      if (noiseBuffer || !context) return noiseBuffer;
      const length = Math.floor(context.sampleRate * 0.1);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      // Deterministic pseudo-noise from a fixed LCG seed.
      let value = 22222;
      for (let i = 0; i < length; i += 1) { value = (Math.imul(value, 1103515245) + 12345) & 0x7fffffff; data[i] = ((value >> 8) & 0xffff) / 32768 - 1; }
      return noiseBuffer;
    }
    function tone(wave, fromHz, toHz, start, duration, gain) {
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(fromHz, start);
      if (toHz !== fromHz) osc.frequency.linearRampToValueAtTime(toHz, start + duration);
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(amp); amp.connect(context.destination);
      osc.start(start); osc.stop(start + duration + 0.02);
    }
    function brush(start, duration, gain) {
      const source = context.createBufferSource();
      const amp = context.createGain();
      source.buffer = ensureNoise();
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
      source.connect(amp); amp.connect(context.destination);
      source.start(start); source.stop(start + duration + 0.02);
    }
    function scheduleBar(barIndex, startTime) {
      for (const event of eventsForBar(barIndex)) {
        if (event.voice === "brush") brush(startTime + event.at, event.duration, event.gain);
        else tone(event.voice === "bass" ? "triangle" : "sine", event.hz, event.hz, startTime + event.at, event.duration, event.gain);
      }
    }
    function pump() {
      if (!musicEnabled || !context) return;
      const horizon = context.currentTime + 0.4;
      while (nextBarTime < horizon) {
        scheduleBar(nextBar, Math.max(nextBarTime, context.currentTime + 0.05));
        nextBar += 1;
        nextBarTime += STEPS_PER_BAR * SECONDS_PER_STEP;
      }
    }
    function setMusicEnabled(enabled) {
      musicEnabled = !!enabled;
      if (musicEnabled) {
        if (!ensureContext()) { musicEnabled = false; return false; }
        if (context.state === "suspended" && context.resume) context.resume();
        nextBarTime = Math.max(nextBarTime, context.currentTime + 0.1);
        if (!timer) timer = setInterval(pump, 120);
        pump();
      } else if (timer) { clearInterval(timer); timer = null; }
      return musicEnabled;
    }
    function sfx(name) {
      if (!sfxEnabled || !SFX[name]) return false;
      if (!ensureContext()) return false;
      if (context.state === "suspended" && context.resume) context.resume();
      for (const step of SFX[name]) {
        tone(step.wave, step.from, step.to, context.currentTime + (step.delay || 0) + 0.01, step.duration, step.gain);
      }
      return true;
    }
    function dispose() {
      if (timer) { clearInterval(timer); timer = null; }
      musicEnabled = false;
      if (context && context.close) context.close();
      context = null; noiseBuffer = null; nextBar = 0; nextBarTime = 0;
    }
    return Object.freeze({
      setMusicEnabled, setSfxEnabled(enabled) { sfxEnabled = !!enabled; }, sfx, dispose,
      isMusicEnabled: () => musicEnabled, isSfxEnabled: () => sfxEnabled,
    });
  }

  window.AISystem6BonsaiAudio = Object.freeze({ TEMPO_BPM, STEPS_PER_BAR, SCORE, SFX, eventsForBar, createEngine });
})();
