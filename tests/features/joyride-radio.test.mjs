// Joyride / 兜风 — the car radio contracts.
//
// The radio is synthesized, deterministic and clock-free: its only source of
// chance is a seeded generator, its only clock is the currentTime the caller
// hands to pump(). This contract drives it through a fake AudioContext which
// records every node the module builds, and holds the user-facing promises:
// three stations in a fixed order, a lookahead scheduler that never schedules
// a note twice, the same seed giving the same music note for note, a
// different seed giving different music, and dispose() being final.
//
// It also reads the source: no wall clock, no unseeded randomness, no timers,
// no samples and no fetch -- the rules that make the sound the module's own.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("joyride-radio");
const source = read("app/features/joyride-radio.js");

// --- a fake AudioContext ------------------------------------------------------
//
// Exactly the surface the module uses. Every AudioParam is a value plus the
// scheduling calls the module makes, so a bad ramp shows up as a call we can
// see rather than as silence we cannot.

function createParam(value = 0, log = []) {
  return {
    value,
    calls: log,
    setValueAtTime(v, t) { log.push(["setValueAtTime", v, t]); return this; },
    linearRampToValueAtTime(v, t) { log.push(["linearRampToValueAtTime", v, t]); return this; },
    exponentialRampToValueAtTime(v, t) { log.push(["exponentialRampToValueAtTime", v, t]); return this; },
    setTargetAtTime(v, t, c) { log.push(["setTargetAtTime", v, t, c]); return this; },
    cancelScheduledValues(t) { log.push(["cancelScheduledValues", t]); return this; },
  };
}

function createFakeContext() {
  const created = { oscillators: [], gains: [], filters: [], shapers: [], buffers: [], sources: [] };
  const context = {
    sampleRate: 22050,
    currentTime: 0,
    destination: { connect() {}, disconnect() {} },
    createOscillator() {
      const paramLog = [];
      const osc = {
        type: "sine",
        frequency: createParam(440, paramLog),
        detune: createParam(0, paramLog),
        paramLog,
        started: null,
        stopped: null,
        connected: [],
        onended: null,
        connect(node) { osc.connected.push(node); return node; },
        disconnect() { osc.connected.length = 0; },
        start(t) { osc.started = t; },
        stop(t) { osc.stopped = t; },
      };
      created.oscillators.push(osc);
      return osc;
    },
    createGain() {
      const paramLog = [];
      const node = {
        gain: createParam(1, paramLog),
        paramLog,
        connect(target) { node.out = target; return target; },
        disconnect() { node.out = null; },
      };
      created.gains.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = {
        type: "lowpass",
        frequency: createParam(350, []),
        Q: createParam(1, []),
        connect(target) { node.out = target; return target; },
        disconnect() { node.out = null; },
      };
      created.filters.push(node);
      return node;
    },
    createWaveShaper() {
      const node = {
        curve: null,
        oversample: "none",
        connect(target) { node.out = target; return target; },
        disconnect() { node.out = null; },
      };
      created.shapers.push(node);
      return node;
    },
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      const buffer = { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => data };
      created.buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const node = {
        buffer: null,
        loop: false,
        started: null,
        stopped: null,
        onended: null,
        connect(target) { node.out = target; return target; },
        disconnect() { node.out = null; },
        start(t) { node.started = t; },
        stop(t) { node.stopped = t; },
      };
      created.sources.push(node);
      return node;
    },
  };
  return { context, created };
}

// Load the module in a bare window, the way the app's concatenated scripts do.
const loadContext = vm.createContext({ window: {} });
vm.runInContext(source, loadContext);
const radio = loadContext.window.AISystem6JoyrideRadio;
test.assert(Boolean(radio), "the radio installs on window");
test.assert(Object.keys(loadContext.window).length === 1, "it installs exactly one global");
test.assert(Object.isFrozen(radio), "the installed object is frozen");

// --- the stations --------------------------------------------------------------

test.assert(Array.isArray(radio.STATIONS) && radio.STATIONS.length === 3, "there are exactly three stations");
test.assert(radio.STATIONS.map((station) => station.id).join(",") === "bonsai-fm,night-line,static-am",
  `the stations are in the documented order (${radio.STATIONS.map((station) => station.id).join(",")})`);
test.assert(radio.STATIONS.every((station) => Object.isFrozen(station)), "every station is frozen");
test.assert(radio.STATIONS.every((station, index) => station.labelKey === [
  "joyride_radio_bonsai_fm", "joyride_radio_night_line", "joyride_radio_static_am",
][index]), "every station carries its own label key");
test.assert(radio.STATIONS.map((station) => station.tempo).join(",") === "112,76,60",
  "the tempos are 112, 76 and 60");

// --- a driver ------------------------------------------------------------------

const STATION_IDS = ["bonsai-fm", "night-line", "static-am"];

/** A radio on a fresh fake context, with its recorder. */
function makeRadio(options = {}) {
  const { context, created } = createFakeContext();
  return { context, created, radio: radio.createRadio(context, context.destination, options) };
}

/** Pump at a fixed frame rate from tune time to `end`, exactly like the shell. */
function drive(instance, end, frame = 1 / 60) {
  for (let now = 0; now <= end + 1e-9; now += frame) {
    instance.context.currentTime = now;
    instance.radio.pump(now);
  }
}

const key = (event) => `${event.station}|${event.voice}|${event.time}`;

// --- bonsai-fm: the lookahead scheduler ---------------------------------------

const bonsai = makeRadio({ seed: 7 });
test.assert(bonsai.radio.current() === null, "a fresh radio is off");
bonsai.radio.tune("bonsai-fm");
test.assert(bonsai.radio.current() === "bonsai-fm", "tune() reports the station it switched to");
const tuneTime = bonsai.context.currentTime;
// The shell's pumps: 0, 0.5 ... 8.0 seconds.
const pumpTimes = [];
for (let now = 0; now <= 8.0 + 1e-9; now += 0.5) {
  bonsai.context.currentTime = now;
  bonsai.radio.pump(now);
  pumpTimes.push(now);
}
const lastPump = pumpTimes[pumpTimes.length - 1];
const bonsaiLog = bonsai.radio.log();
test.assert(bonsaiLog.length > 0, `the bonsai station schedules notes (${bonsaiLog.length})`);
test.assert(bonsaiLog.every((event) => event.station === "bonsai-fm" || event.station === "tuning"),
  "every logged note belongs to the tuned station (or is the tuning burst)");
test.assert(bonsaiLog.every((event) => event.time >= tuneTime - 1e-9), "nothing is scheduled before the tune time");
test.assert(bonsaiLog.every((event) => event.time < lastPump + 0.2 + 1e-9),
  `every note starts inside the lookahead window (latest ${Math.max(...bonsaiLog.map((event) => event.time))})`);
const pairs = bonsaiLog.map(key);
test.assert(new Set(pairs).size === pairs.length, "no (station, voice, time) pair is scheduled twice");
test.assert(bonsaiLog.every((event) => Math.abs(event.time * 1e4 - Math.round(event.time * 1e4)) < 1e-6),
  "logged times are rounded to four decimals");
test.assert(bonsaiLog.every((event) => typeof event.frequency === "number" && event.frequency > 0 && typeof event.duration === "number" && event.duration > 0),
  "every note has a positive frequency and duration");
test.assert(bonsai.radio.log() !== bonsai.radio.log(), "log() hands back a copy, not the live list");
// Pumping again at the same clock advances nothing.
const before = bonsai.radio.log().length;
bonsai.context.currentTime = lastPump;
bonsai.radio.pump(lastPump);
test.assert(bonsai.radio.log().length === before, "a pump at an unchanged clock schedules nothing more");

// The lookahead really is the boundary: at now = 0 with a tune at 0, the first
// note is inside 0.2 s of the cursor, never beyond it.
const edge = makeRadio({ seed: 7 });
edge.radio.tune("bonsai-fm");
edge.context.currentTime = 0.4;
edge.radio.pump(0.4);
test.assert(edge.radio.log().every((event) => event.time < 0.4 + 0.2 + 1e-9),
  "one pump schedules only what falls inside its own lookahead");

// --- determinism ----------------------------------------------------------------

const first = makeRadio({ seed: 12345 });
first.radio.tune("bonsai-fm");
drive(first, 6);
const again = makeRadio({ seed: 12345 });
again.radio.tune("bonsai-fm");
drive(again, 6);
test.assert(JSON.stringify(first.radio.log()) === JSON.stringify(again.radio.log()),
  "the same seed and the same calls give an identical log");

const other = makeRadio({ seed: 999 });
other.radio.tune("bonsai-fm");
drive(other, 6);
test.assert(JSON.stringify(other.radio.log()) !== JSON.stringify(first.radio.log()),
  "a different seed gives a different bonsai log");
// A different frame rate must not change the music: the cursor is time-based,
// not frame-based.
const coarse = makeRadio({ seed: 12345 });
coarse.radio.tune("bonsai-fm");
drive(coarse, 6, 0.5);
test.assert(JSON.stringify(coarse.radio.log()) === JSON.stringify(first.radio.log()),
  "the frame rate does not change what is scheduled");

// --- the other two stations -----------------------------------------------------

for (const id of ["night-line", "static-am"]) {
  const instance = makeRadio({ seed: 4 });
  instance.radio.tune(id);
  drive(instance, 12);
  const log = instance.radio.log();
  test.assert(log.length > 0, `${id} schedules notes (${log.length})`);
  test.assert(log.every((event) => event.station === id || event.station === "tuning"),
    `${id} only schedules its own notes (plus its own tuning burst)`);
  test.assert(new Set(log.map(key)).size === log.length, `${id} does not schedule a note twice`);
}
// The tuning burst: switching instantly plays noise before the new station.
const swap = makeRadio({ seed: 1 });
swap.radio.tune("bonsai-fm");
swap.context.currentTime = 2;
swap.radio.tune("night-line");
const tuning = swap.radio.log().filter((event) => event.station === "tuning");
test.assert(tuning.length === 2 && tuning.every((event) => Math.abs(event.duration - 0.25) < 1e-9),
  "every switch plays one 0.25 s tuning burst");
test.assert(tuning[0].time < tuning[1].time, "the bursts land at their own switch times");

// --- off ------------------------------------------------------------------------

const off = makeRadio({ seed: 3 });
off.radio.tune("bonsai-fm");
drive(off, 4);
const beforeOff = off.radio.log().length;
off.context.currentTime = 4;
off.radio.tune(null);
test.assert(off.radio.current() === null, "tune(null) turns the radio off");
off.context.currentTime = 8;
off.radio.pump(8);
test.assert(off.radio.log().length === beforeOff + 1,
  "with the radio off, pump() schedules nothing (only the tuning burst)");

// --- volume ----------------------------------------------------------------------

const volume = makeRadio();
volume.radio.setVolume(0.5);
const masterParam = volume.created.gains[volume.created.gains.length - 1].gain;
const targetOf = (param) => param.calls.filter((call) => call[0] === "setTargetAtTime").pop();
volume.radio.setVolume(2);
volume.radio.setVolume(-1);
volume.radio.setVolume(0.8);
const targets = volume.created.gains
  .flatMap((node) => node.gain.calls)
  .filter((call) => call[0] === "setTargetAtTime")
  .map((call) => call[1]);
test.assert(targets.length >= 4 && targets.every((value) => value >= 0 && value <= 1),
  `setVolume clamps its target to 0..1 (${targets.join(", ")})`);
test.assert(targets.includes(1) && targets.includes(0), "over 1 becomes 1 and under 0 becomes 0");
test.assert(Boolean(masterParam), "the master gain is ramped, not jumped");

// --- the source rules ---------------------------------------------------------------

for (const banned of ["Math.random", "Date.now", "setTimeout", "setInterval", "requestAnimationFrame", "fetch(", ".mp3", ".wav", ".ogg"]) {
  test.assertNotIncludes(source, banned, `the module does not use "${banned}"`);
}
test.assertIncludes(source, "mulberry32", "randomness comes from the local seeded generator");
test.assertIncludes(source, "global.AISystem6JoyrideRadio", "the module names the global it installs");

// --- dispose -------------------------------------------------------------------------

const doomed = makeRadio({ seed: 2 });
doomed.radio.tune("bonsai-fm");
drive(doomed, 2);
const beforeDispose = doomed.radio.log().length;
let threw = false;
try {
  doomed.radio.dispose();
  doomed.radio.dispose();
  doomed.radio.tune("static-am");
  doomed.radio.pump(10);
  doomed.radio.setVolume(0.5);
} catch (error) {
  threw = true;
}
test.assert(!threw, "dispose() and later calls never throw");
test.assert(doomed.radio.log().length === beforeDispose, "a disposed radio schedules nothing");
test.assert(doomed.radio.current() === null, "a disposed radio is off");

test.finish();
