// Bonsai City audio contracts: an original score as data, a deterministic
// sequencer, oscillator/noise effect recipes, and shell wiring — schedules,
// not samples, and never a random number or a wall clock.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-audio");
const context = vm.createContext({ window: {}, setInterval: () => 1, clearInterval: () => {} });
vm.runInContext(read("app/features/bonsai-audio.js"), context);
const audio = context.window.AISystem6BonsaiAudio;

const source = read("app/features/bonsai-audio.js");
test.assert(!!audio && context.window.AISystem6BonsaiAudioLoaded === true, "the audio module installs its global and flag");
test.assertNotIncludes(source, "Math.random", "the audio engine is deterministic");
test.assertNotMatches(source, /Date\.now|performance\.now|fetch\(|\.mp3\b|\.ogg\b|\.wav\b/, "schedules, not samples: no wall clock and no audio files");

// The score is well-formed data: eight bars, tones in playable MIDI range,
// and every pattern index resolves to a chord tone.
test.assert(audio.SCORE.bars.length === 8, "the progression runs eight bars");
for (const bar of audio.SCORE.bars) {
  test.assert(bar.tones.length === 4 && bar.tones.every((tone) => tone >= 24 && tone <= 96), "each bar carries four playable chord tones");
}
test.assert(audio.SCORE.bass.every((idx) => idx === -1 || idx < 4) && audio.SCORE.keys.every((idx) => idx === -1 || idx < 4),
  "voice patterns index into the chord");

// The pure event expansion is deterministic and loops cleanly.
const barA = audio.eventsForBar(0);
const barARepeat = audio.eventsForBar(0);
const barWrap = audio.eventsForBar(8);
test.assert(JSON.stringify(barA) === JSON.stringify(barARepeat), "the same bar expands to identical events");
test.assert(JSON.stringify(barA) === JSON.stringify(barWrap), "bar nine wraps back to bar one");
test.assert(barA.some((event) => event.voice === "bass") && barA.some((event) => event.voice === "keys") && barA.some((event) => event.voice === "brush"),
  "all three voices play");
test.assert(barA.every((event) => event.at >= 0 && event.duration > 0 && event.gain > 0 && event.gain < 0.3),
  "every event has sane timing and headroom");

// Effects: registered recipes only, each a finite oscillator schedule.
for (const [name, steps] of Object.entries(audio.SFX)) {
  test.assert(Array.isArray(steps) && steps.length >= 1 && steps.every((step) => step.duration > 0 && step.gain > 0 && step.from > 20 && step.to > 20),
    `sfx recipe ${name} is a finite oscillator schedule`);
}

// The engine against a fake AudioContext: nodes schedule at deterministic
// times, sfx respects its switch, and dispose closes the context.
{
  const scheduled = [];
  let closed = false;
  function FakeContext() {
    this.currentTime = 10;
    this.sampleRate = 8000;
    this.state = "running";
    this.destination = {};
    this.createOscillator = () => ({ type: "", frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {}, start: (at) => scheduled.push(["osc", at]), stop: () => {} });
    this.createGain = () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} });
    this.createBuffer = (channels, length) => ({ getChannelData: () => new Float32Array(length) });
    this.createBufferSource = () => ({ connect: () => {}, start: (at) => scheduled.push(["noise", at]), stop: () => {} });
    this.close = () => { closed = true; };
  }
  const engine = audio.createEngine({ AudioContextCtor: FakeContext });
  test.assert(engine.setMusicEnabled(true) === true && engine.isMusicEnabled(), "music starts against the fake context");
  test.assert(scheduled.length > 0 && scheduled.every(([, at]) => at >= 10), "the first bars schedule ahead of the transport");
  const before = scheduled.length;
  engine.setSfxEnabled(false);
  test.assert(engine.sfx("plop") === false && scheduled.length === before, "muted effects schedule nothing");
  engine.setSfxEnabled(true);
  test.assert(engine.sfx("plop") === true && scheduled.length > before, "an effect schedules its oscillators");
  engine.dispose();
  test.assert(closed && !engine.isMusicEnabled(), "dispose closes the context and stops the music");
}

// Shell wiring: the toggle, the receipt hooks, and lifecycle disposal.
const shell = read("app/features/bonsai-city.js");
test.assertIncludes(shell, "setAudioMode", "the sound modes move through the Options menu commands");
test.assertIncludes(shell, '"disaster-started": "siren"', "disasters sound the siren");
test.assertIncludes(shell, 'sfx("reject")', "refusals have a voice");
test.assertIncludes(shell, "state.audio?.dispose?.()", "closing the window disposes the audio engine");

// B4: one sound per simulation event kind, every name a registered recipe.
{
  const shell = read("app/features/bonsai-city.js");
  const map = shell.match(/const SFX_BY_EVENT = Object\.freeze\(\{([^}]+)\}\)/);
  test.assert(!!map, "the shell keeps one event-to-sound map");
  const names = [...map[1].matchAll(/:\s*"([a-z]+)"/g)].map((m) => m[1]);
  test.assert(names.every((name) => audio.SFX[name]), `every mapped sound is a recipe (${names.join(", ")})`);
  for (const eventType of ["disaster-started", "disaster-ended", "reward-offered", "milestone", "plant-expired"]) {
    test.assert(new RegExp(`["']?${eventType}["']?:`).test(map[1]), `${eventType} has a sound`);
  }
  test.assertIncludes(shell, 'sfx("bell")', "the January budget hold rings once");
  test.assertIncludes(shell, 'sfx(tool.command === "demolish-area" ? "bulldoze" : "plop")', "placement and demolition keep their tool sounds");
}

test.finish();
