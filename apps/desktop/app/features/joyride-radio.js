// Joyride / 兜风 — the car radio.
//
// Three stations, all synthesized: no samples, no files, no real songs. The
// point is texture, not fidelity -- an 8-bit, 22 kHz Mac in 1996, so the whole
// station bus goes through an amplitude bitcrusher and a lowpass before it
// reaches the speakers.
//
// Two rules keep this file honest and cheap:
//
// - Nothing here reads a clock or a random number. The seed is the only source
//   of chance (a local mulberry32), and time arrives as context.currentTime in
//   pump(now) from the caller's animation frame. Same seed, same tune/pump
//   calls: the same log, note for note -- which is what the contract checks.
// - pump() is the only scheduler. It looks 0.2 s ahead, schedules every note
//   whose start is inside that window, and remembers the cursor it reached, so
//   a pump on every frame never schedules a note twice.
//
// Contract: tests/features/joyride-radio.test.mjs.
(function installJoyrideRadio(global) {
  "use strict";

  // --- determinism -----------------------------------------------------------

  // mulberry32: the same small integer generator the headless core uses, so a
  // seed means the same music here as it means the same drive there.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- the 1996 sound ---------------------------------------------------------

  const SAMPLE_RATE = 22050;
  // A bitcrusher as a curve, not a worklet: 64 amplitude steps between -1 and
  // 1 is roughly six bits, which is the crunch of an old sound chip. The curve
  // is a plain Float32Array so the WaveShaper node can take it directly.
  const CRUSH_LEVELS = 64;
  function crushCurve() {
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * (CRUSH_LEVELS / 2)) / (CRUSH_LEVELS / 2);
    }
    return curve;
  }
  const CRUSH = crushCurve();
  // The muffled top end of the era: nothing above about 5 kHz survives.
  const TONE_HZ = 5000;

  // A note name -> frequency, in equal temperament from A4 = 440.
  function note(semitonesFromA4) {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }
  // Semitone offsets from A4 for the pentatonic and seventh-chord tables
  // below. Named so the patterns read as music rather than as magic numbers.
  const A4 = 0;
  const MAJOR_PENTATONIC = Object.freeze([A4 - 12, A4 - 5, A4 - 3, A4 + 2, A4 + 4, A4 + 9, A4 + 12]);
  // Minor seventh and major seventh voicings, root intervals in semitones.
  const MIN7 = Object.freeze([0, 3, 7, 10]);
  const MAJ7 = Object.freeze([0, 4, 7, 11]);
  // The night station's melody walks these chord degrees, one every two steps.
  const NIGHT_DEGREES = Object.freeze([0, 3, 7, 10, 7, 3]);
  // A four-bar progression, in semitones from the key root, and whether each
  // bar takes the minor or the major seventh colour.
  const PROGRESSIONS = Object.freeze([
    Object.freeze([{ root: 0, chord: "min7" }, { root: 5, chord: "min7" }, { root: 3, chord: "maj7" }, { root: -2, chord: "maj7" }]),
    Object.freeze([{ root: -3, chord: "maj7" }, { root: 2, chord: "min7" }, { root: 5, chord: "min7" }, { root: 0, chord: "maj7" }]),
    Object.freeze([{ root: 0, chord: "min7" }, { root: -4, chord: "maj7" }, { root: 3, chord: "maj7" }, { root: 5, chord: "min7" }]),
  ]);

  // --- the graph -------------------------------------------------------------

  // One bus per radio, not per station: the crusher and the lowpass are the
  // signature of the device, and every station shares them.
  function createBus(context, destination, volume) {
    const input = context.createGain();
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = TONE_HZ;
    const shaper = context.createWaveShaper();
    shaper.curve = CRUSH;
    shaper.oversample = "none";
    const master = context.createGain();
    master.gain.value = volume;
    input.connect(tone);
    tone.connect(shaper);
    shaper.connect(master);
    master.connect(destination);
    return { input, tone, shaper, master };
  }

  function disconnectAll(nodes) {
    nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch (error) {
        // A node that was already torn down, or an API that refuses to
        // disconnect twice, must not stop the rest of the cleanup.
      }
    });
  }

  // A noise buffer, generated once per radio instead of once per hi-hat: a
  // second of white noise at the context rate, reused by every noise voice.
  function createNoiseBuffer(context) {
    const length = Math.max(1, Math.floor(SAMPLE_RATE));
    const buffer = context.createBuffer(1, length, context.sampleRate || SAMPLE_RATE);
    const data = buffer.getChannelData(0);
    let random = mulberry32(0x9e3779b9);
    for (let i = 0; i < length; i += 1) data[i] = random() * 2 - 1;
    return buffer;
  }

  // --- scheduling ------------------------------------------------------------

  // How far ahead pump() looks. Enough to survive a late frame, small enough
  // that a tune() two beats from now still lands on the beat.
  const LOOKAHEAD = 0.2;
  const TUNE_BURST = 0.25;
  const BARS_PER_PATTERN = 8;

  function round4(value) {
    return Math.round(value * 1e4) / 1e4;
  }

  // A station's scheduler: it owns a cursor in seconds, a pattern that is
  // regenerated every BARS_PER_PATTERN bars, and the code that turns one step
  // of that pattern into scheduled notes.
  function createStation(station, seed, radio) {
    const beat = 60 / station.tempo;
    const bar = beat * 4;
    const step = beat / 4; // sixteenths
    const stepsPerBar = 16;
    const random = mulberry32((seed >>> 0) ^ hashId(station.id));
    // The cursor is the first step time not yet scheduled. It starts at the
    // moment the station begins (quantized to a beat by tune()).
    let cursorStep = 0;
    let origin = 0;
    let started = false;
    let patternBar = -1;
    let pattern = null;

    function hashId(id) {
      let hash = 2166136261;
      for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
      return hash;
    }

    // Patterns are rebuilt every eight bars from the station's own stream, so
    // a long drive drifts instead of repeating a two-bar loop forever.
    function regenerate(barIndex) {
      const patternIndex = Math.floor(barIndex / BARS_PER_PATTERN);
      if (patternIndex === patternBar) return;
      patternBar = patternIndex;
      pattern = station.buildPattern(random, patternIndex);
    }

    function start(now) {
      // The station comes in on the next beat after the tuning burst, never
      // mid-beat: a radio lands on the grid.
      origin = Math.ceil((now + TUNE_BURST) / beat) * beat;
      cursorStep = 0;
      started = true;
      patternBar = -1;
      pattern = null;
    }

    // Schedule every step whose start time falls before now + LOOKAHEAD. The
    // cursor only ever moves forward, so a pump on every frame is cheap and no
    // note is ever scheduled twice.
    function pump(now) {
      if (!started) return;
      const horizon = now + LOOKAHEAD;
      while (true) {
        const time = origin + cursorStep * step;
        if (time >= horizon) break;
        const barIndex = Math.floor(cursorStep / stepsPerBar);
        regenerate(barIndex);
        station.emit(radio, pattern, {
          voice: station.id,
          time,
          step: cursorStep % stepsPerBar,
          bar: barIndex,
          beat,
          barLength: bar,
        });
        cursorStep += 1;
      }
    }

    return { pump, start, beat };
  }

  // --- the three stations ----------------------------------------------------

  // 1. Bonsai FM: bright square chiptune pop. A sixteen-step lead over a major
  //    pentatonic, a pulse bass on the root, a noise hi-hat on the off-beats.
  const BONSAI = {
    id: "bonsai-fm",
    labelKey: "joyride_radio_bonsai_fm",
    tempo: 112,
    buildPattern(random, index) {
      const lead = [];
      const rests = [0, 0.28, 0.18, 0.4][Math.floor(random() * 4)];
      for (let i = 0; i < 16; i += 1) {
        // Dense on the beat, sparse off it: that is the chip tune feel.
        const onBeat = i % 4 === 0;
        if (!onBeat && random() < rests) {
          lead.push(null);
          continue;
        }
        const degree = MAJOR_PENTATONIC[Math.floor(random() * MAJOR_PENTATONIC.length)];
        // An octave lift every so often gives the melodic line its shape.
        lead.push(degree + (random() < 0.25 ? 12 : 0) + index * 0);
      }
      // Bass roots: one per bar, from the pentatonic's lower steps.
      const roots = [];
      for (let i = 0; i < 4; i += 1) roots.push([-24, -19, -17, -24][Math.floor(random() * 4)]);
      return { lead, roots };
    },
    emit(radio, pattern, at) {
      const { step, time, beat } = at;
      const lead = pattern.lead[step];
      if (lead !== null) {
        radio.note({
          station: BONSAI.id,
          voice: "lead",
          frequency: note(lead),
          time,
          duration: (beat / 4) * 0.9,
          shape: "square",
          gain: 0.22,
        });
      }
      if (step % 4 === 0) {
        const root = pattern.roots[Math.floor(step / 4)];
        radio.note({
          station: BONSAI.id,
          voice: "bass",
          frequency: note(root),
          time,
          duration: beat * 0.8,
          shape: "square",
          gain: 0.26,
          duty: true,
        });
      }
      // Hi-hat on the off-beats: the "and" of each beat, a short noise tick.
      if (step % 2 === 1) {
        radio.noise({
          station: BONSAI.id,
          voice: "hat",
          time,
          duration: beat / 4,
          frequency: 7000,
          gain: 0.05,
          bandpass: true,
        });
      }
    },
  };

  // 2. Night Line: slow late-night electric piano. Triangle chords over a
  //    four-bar minor/major seventh progression, a soft sine bass, and the odd
  //    melody note left hanging.
  const NIGHT = {
    id: "night-line",
    labelKey: "joyride_radio_night_line",
    tempo: 76,
    buildPattern(random, index) {
      const progression = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)];
      // The key itself drifts a little between patterns, so eight bars at a
      // time the station sits somewhere new.
      const key = [-12, -9, -7, -5][Math.floor(random() * 4)] + index * 3;
      return { progression, key };
    },
    emit(radio, pattern, at) {
      const { step, time, beat, barLength } = at;
      if (step === 0) {
        const bar = pattern.progression[at.bar % pattern.progression.length];
        const voicing = bar.chord === "maj7" ? MAJ7 : MIN7;
        voicing.forEach((semitones, index) => {
          radio.note({
            station: NIGHT.id,
            // Each chord tone is its own voice, so the log identifies every
            // note uniquely: same time, same voice would be a duplicate.
            voice: `chord-${index}`,
            frequency: note(pattern.key + bar.root + semitones),
            time,
            duration: barLength * 0.95,
            shape: "triangle",
            gain: 0.1 - index * 0.008,
            // The electric piano's attack: quick, then a long decay.
            attack: 0.01,
            release: barLength * 0.6,
          });
        });
        radio.note({
          station: NIGHT.id,
          voice: "bass",
          frequency: note(pattern.key + bar.root - 24),
          time,
          duration: barLength * 0.9,
          shape: "sine",
          gain: 0.2,
        });
      }
      // Sparse melody notes: a hunch that one note of this bar should ring out.
      if (step >= 8 && step % 2 === 0) {
        const bar = pattern.progression[at.bar % pattern.progression.length];
        const degree = NIGHT_DEGREES[(step / 2) % NIGHT_DEGREES.length];
        radio.note({
          station: NIGHT.id,
          voice: "melody",
          frequency: note(pattern.key + bar.root + degree),
          time,
          duration: beat * 1.5,
          shape: "triangle",
          gain: 0.08,
        });
      }
    },
  };

  // 3. Static AM: ambient. Two slowly detuned sine pads that drift between
  //    notes of a chosen chord, over a quiet band-passed noise bed with the
  //    occasional crackle. No beat at all.
  const STATIC_AM = {
    id: "static-am",
    labelKey: "joyride_radio_static_am",
    tempo: 60,
    buildPattern(random, index) {
      const roots = [-12, -5, -3, 0, 2];
      const root = roots[Math.floor(random() * roots.length)] + index * 2;
      const chord = random() < 0.5 ? MIN7 : MAJ7;
      return { root, chord };
    },
    emit(radio, pattern, at) {
      const { step, time, barLength } = at;
      // The pads move every four seconds -- twice a bar at this tempo -- not
      // on a beat you could dance to.
      if (step % 8 === 0) {
        const index = (step / 8 + at.bar * 2) % pattern.chord.length;
        const semitones = pattern.chord[index];
        // Two sines a few cents apart: the slow beat between them is the whole
        // sound, and it never quite resolves.
        [-7, 7].forEach((detune, voice) => {
          radio.note({
            station: STATIC_AM.id,
            voice: voice === 0 ? "pad-a" : "pad-b",
            frequency: note(pattern.root + semitones - 12),
            time,
            duration: barLength * 2,
            shape: "sine",
            gain: 0.1,
            attack: voice === 0 ? 0.8 : 1.1,
            release: barLength,
            detune,
          });
        });
      }
      if (step === 0) {
        // The AM static bed: quiet band-passed noise for the whole bar.
        radio.noise({
          station: STATIC_AM.id,
          voice: "static",
          time,
          duration: barLength,
          frequency: 1800,
          gain: 0.035,
          bandpass: true,
          q: 0.7,
        });
      }
      // A crackle now and then: a very short, bright noise burst.
      if (step % 4 === 2) {
        radio.noise({
          station: STATIC_AM.id,
          voice: "crackle",
          time,
          duration: 0.01,
          frequency: 3000,
          gain: 0.06,
          bandpass: true,
        });
      }
    },
  };

  const STATIONS = Object.freeze([
    Object.freeze({ id: BONSAI.id, labelKey: BONSAI.labelKey, tempo: BONSAI.tempo }),
    Object.freeze({ id: NIGHT.id, labelKey: NIGHT.labelKey, tempo: NIGHT.tempo }),
    Object.freeze({ id: STATIC_AM.id, labelKey: STATIC_AM.labelKey, tempo: STATIC_AM.tempo }),
  ]);
  const STATION_TABLE = Object.freeze({ "bonsai-fm": BONSAI, "night-line": NIGHT, "static-am": STATIC_AM });

  // --- the radio -------------------------------------------------------------

  function createRadio(context, destination, options = {}) {
    const seed = (Number(options.seed) || 1) >>> 0;
    const bus = createBus(context, destination, clampVolume(options.volume === undefined ? 0.35 : options.volume));
    const noiseBuffer = createNoiseBuffer(context);
    const events = [];
    let currentId = null;
    let station = null;
    let disposed = false;

    // The log keeps the most recent notes only: a whole evening shift would
    // otherwise pile up tens of thousands of entries nobody reads.
    const LOG_LIMIT = 2000;
    function record(event) {
      events.push({
        station: event.station,
        voice: event.voice,
        time: round4(event.time),
        frequency: round4(event.frequency),
        duration: round4(event.duration),
      });
      if (events.length > LOG_LIMIT) events.splice(0, events.length - LOG_LIMIT);
    }

    function clampVolume(value) {
      const v = Number(value);
      if (!Number.isFinite(v)) return 0;
      return Math.min(1, Math.max(0, v));
    }

    // Every scheduled note goes through here: the audio graph is built here
    // and the log entry is written here, so what the test reads is exactly
    // what the speakers get.
    const radio = {
      note(spec) {
        if (disposed) return;
        const { station: id, voice, frequency, time, duration, shape = "sine", gain = 0.1 } = spec;
        const attack = spec.attack === undefined ? 0.005 : spec.attack;
        const release = spec.release === undefined ? Math.min(0.15, duration * 0.5) : spec.release;
        const osc = context.createOscillator();
        osc.type = shape;
        osc.frequency.value = frequency;
        // The pads' slow shimmer: a few cents of detune, no chorus needed.
        if (spec.detune && osc.detune) osc.detune.value = spec.detune;
        const envelope = context.createGain();
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(gain, time + attack);
        // Decay to the release floor over the note, then ramp out.
        envelope.gain.setTargetAtTime(0, time + Math.max(attack, duration - release), release / 3 || 0.01);
        osc.connect(envelope);
        envelope.connect(bus.input);
        osc.start(time);
        osc.stop(time + duration);
        if (typeof osc.onended !== "undefined") {
          osc.onended = () => {
            try {
              osc.disconnect();
              envelope.disconnect();
            } catch (error) {
              // Already gone; nothing to do.
            }
          };
        }
        record({ station: id, voice, time, frequency, duration });
      },
      noise(spec) {
        if (disposed) return;
        const { station: id, voice, time, duration, frequency = 2000, gain = 0.05, q = 1 } = spec;
        const source = context.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = spec.bandpass ? "bandpass" : "lowpass";
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const envelope = context.createGain();
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(gain, time + Math.min(0.01, duration / 2));
        envelope.gain.setTargetAtTime(0, time + duration, Math.min(0.05, duration));
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(bus.input);
        source.start(time);
        source.stop(time + duration);
        if (typeof source.onended !== "undefined") {
          source.onended = () => {
            try {
              source.disconnect();
              filter.disconnect();
              envelope.disconnect();
            } catch (error) {
              // Already gone; nothing to do.
            }
          };
        }
        record({ station: id, voice, time, frequency, duration });
      },
    };

    function tuningBurst(time) {
      radio.noise({
        station: "tuning",
        voice: "tuning",
        time,
        duration: TUNE_BURST,
        frequency: 1200,
        gain: 0.12,
        bandpass: true,
        q: 4,
      });
    }

    function tune(stationId) {
      if (disposed) return radio;
      const next = stationId === null || stationId === undefined ? null : STATION_TABLE[stationId] || null;
      currentId = next ? next.id : null;
      const now = context.currentTime;
      // The tuning burst is always played, even to silence: turning the dial
      // is a sound.
      tuningBurst(now);
      if (!next) {
        station = null;
        return radio;
      }
      station = createStation(next, seed, radio);
      station.start(now);
      return radio;
    }

    return Object.freeze({
      tune(stationId) {
        return tune(stationId === undefined ? null : stationId);
      },
      current() {
        return currentId;
      },
      setVolume(value) {
        if (disposed) return radio;
        const v = clampVolume(value);
        bus.master.gain.setTargetAtTime(v, context.currentTime, 0.02);
        return radio;
      },
      pump(now) {
        if (disposed || !station) return;
        station.pump(Number(now) || 0);
      },
      log() {
        return events.map((event) => ({ ...event }));
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        station = null;
        currentId = null;
        disconnectAll([bus.input, bus.tone, bus.shaper, bus.master]);
      },
    });
  }

  // Exactly one thing on window, frozen, like every other Joyride feature.
  global.AISystem6JoyrideRadio = Object.freeze({ STATIONS, createRadio });
})(window);
