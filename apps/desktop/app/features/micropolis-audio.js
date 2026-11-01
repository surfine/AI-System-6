// Micropolis audio / Micropolis 音效 — synthesized in the shell, zero assets.
//
// The engine emits sound cues by name (explosion, honk, monster, heavy
// traffic); this module turns each into a short oscillator or noise recipe
// on the Web Audio clock, the same way bonsai-audio.js does for Bonsai City.
// No samples, no upstream sound files, nothing from the GPL path: the cue
// names are engine message strings and the recipes are ours.
window.AISystem6MicropolisAudioLoaded = true;

(function initMicropolisAudio() {
  "use strict";

  // Recipes: a list of steps; each step is one oscillator sweep (wave, from,
  // to, duration, gain, delay) or a noise burst (noise: true).
  const SFX = Object.freeze({
    explosionHigh: [{ noise: true, duration: 0.28, gain: 0.22 }, { wave: "square", from: 160, to: 40, duration: 0.3, gain: 0.12 }],
    explosionLow: [{ noise: true, duration: 0.45, gain: 0.26 }, { wave: "triangle", from: 90, to: 30, duration: 0.5, gain: 0.16 }],
    honk: [{ wave: "square", from: 330, to: 330, duration: 0.12, gain: 0.08 }, { wave: "square", from: 330, to: 330, duration: 0.14, gain: 0.08, delay: 0.16 }],
    monster: [{ wave: "sawtooth", from: 70, to: 45, duration: 0.6, gain: 0.14 }, { wave: "sawtooth", from: 55, to: 80, duration: 0.5, gain: 0.1, delay: 0.55 }],
    heavyTraffic: [{ noise: true, duration: 0.35, gain: 0.05 }, { wave: "sawtooth", from: 120, to: 110, duration: 0.3, gain: 0.03, delay: 0.05 }],
    build: [{ wave: "square", from: 220, to: 330, duration: 0.08, gain: 0.1 }],
    bulldoze: [{ wave: "sawtooth", from: 180, to: 70, duration: 0.15, gain: 0.1 }],
    reject: [{ wave: "square", from: 120, to: 110, duration: 0.1, gain: 0.07 }],
  });

  // Engine cue name (a Messages export) -> recipe name.
  const CUE_RECIPES = Object.freeze({
    SOUND_EXPLOSIONHIGH: "explosionHigh",
    SOUND_EXPLOSIONLOW: "explosionLow",
    SOUND_HONKHONK: "honk",
    SOUND_MONSTER: "monster",
    SOUND_HEAVY_TRAFFIC: "heavyTraffic",
  });

  function createEngine(options = {}) {
    const AudioContextCtor = options.AudioContextCtor
      || (typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null);
    let context = null;
    let sfxEnabled = true;
    let noiseBuffer = null;
    // The same cue can arrive many times a frame (every burning tile of a
    // meltdown); one play per recipe per short window is enough.
    const lastPlayed = new Map();
    const MIN_GAP_S = 0.12;

    function ensureContext() {
      if (context || !AudioContextCtor) return context;
      try { context = new AudioContextCtor(); } catch { context = null; }
      return context;
    }
    function ensureNoise() {
      if (noiseBuffer || !context) return noiseBuffer;
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      // Deterministic pseudo-noise from a fixed LCG seed.
      let value = 31337;
      for (let i = 0; i < length; i += 1) { value = (Math.imul(value, 1103515245) + 12345) & 0x7fffffff; data[i] = ((value >> 8) & 0xffff) / 32768 - 1; }
      return noiseBuffer;
    }
    function tone(step, start) {
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = step.wave;
      osc.frequency.setValueAtTime(step.from, start);
      if (step.to !== step.from) osc.frequency.linearRampToValueAtTime(step.to, start + step.duration);
      amp.gain.setValueAtTime(step.gain, start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + step.duration);
      osc.connect(amp); amp.connect(context.destination);
      osc.start(start); osc.stop(start + step.duration + 0.02);
    }
    function burst(step, start) {
      const source = context.createBufferSource();
      const amp = context.createGain();
      source.buffer = ensureNoise();
      amp.gain.setValueAtTime(step.gain, start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + step.duration);
      source.connect(amp); amp.connect(context.destination);
      source.start(start); source.stop(start + step.duration + 0.02);
    }
    function sfx(name) {
      if (!sfxEnabled || !SFX[name]) return false;
      if (!ensureContext()) return false;
      if (context.state === "suspended" && context.resume) context.resume();
      const now = context.currentTime;
      if (now - (lastPlayed.get(name) ?? -1) < MIN_GAP_S) return false;
      lastPlayed.set(name, now);
      for (const step of SFX[name]) {
        const start = now + (step.delay || 0) + 0.01;
        if (step.noise) burst(step, start);
        else tone(step, start);
      }
      return true;
    }
    // Plays the recipe for an engine cue name, if it has one.
    function cue(cueName) {
      const recipe = CUE_RECIPES[cueName];
      return recipe ? sfx(recipe) : false;
    }
    function dispose() {
      if (context && context.close) context.close();
      context = null; noiseBuffer = null; lastPlayed.clear();
    }
    return Object.freeze({
      sfx, cue, dispose,
      setSfxEnabled(enabled) { sfxEnabled = !!enabled; },
      isSfxEnabled: () => sfxEnabled,
    });
  }

  window.AISystem6MicropolisAudio = Object.freeze({ SFX, CUE_RECIPES, createEngine });
})();
