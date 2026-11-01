// System sounds — a shared, unlock-aware Web Audio engine.
//
// The retro desktop's sound effects were previously played by creating a new
// AudioContext per call, which browsers suspend until the first user gesture —
// so the boot chime never actually sounded and every click allocated a fresh
// context. This test executes the pure registry/dispatch logic and the engine
// factory in a bare vm (with a fake AudioContext) to prove the shared-context
// and unlock-queue behavior, and statically pins that every sound type the
// app asks for is defined.

import vm from "node:vm";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("system-sounds");
const source = read("app/core/system-sounds.js");
const manifest = read("tooling/runtime-manifest.mjs");

test.assertIncludes(manifest, '"app/core/system-sounds.js"', "the system-sounds module is eager in the runtime manifest");
test.assertMatches(
  manifest,
  /"app\/core\/system-sounds\.js",[\s\S]{0,160}"app\/features\/project-disk\.js"/,
  "system-sounds loads before desktop-runtime so the boot chime engine exists"
);
test.assertNotIncludes(source, "fetch(", "system-sounds never performs network work");

// ---- Static contract: every requested sound type is defined --------------
function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(resolveProjectPath(dir))) {
    const full = join(dir, entry);
    const stat = statSync(resolveProjectPath(full));
    if (stat.isDirectory()) out.push(...walkFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

const appSources = [
  ...walkFiles("app/core"),
  ...walkFiles("app/features"),
  "app.js",
].map((path) => read(path)).join("\n");
const requestedTypes = new Set();
for (const match of appSources.matchAll(/playSystemSound\.?\(\s*["']([A-Za-z0-9_-]+)["']/g)) {
  requestedTypes.add(match[1]);
}
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const registryTypes = Object.keys(context.window.AISystem6SystemSounds.SYSTEM_SOUND_TONES);
const missing = [...requestedTypes].filter((type) => !registryTypes.includes(type));
test.assert(missing.length === 0, `every requested sound type is defined (missing: ${missing.join(", ") || "none"})`);
test.assert(
  registryTypes.includes("shutdown"),
  "a shutdown chime is defined for the shutdown screen"
);
for (const type of ["menu", "zoom", "eject", "type"]) {
  test.assert(registryTypes.includes(type), `${type} is defined for the expanded mechanical sound set`);
}

// ---- Pure dispatch decisions ---------------------------------------------
const { systemSoundDispatch, systemSoundTypeKnown, SYSTEM_SOUND_MAX_QUEUE } = context.window.AISystem6SystemSounds;
test.assert(systemSoundTypeKnown("boot") && systemSoundTypeKnown("click"), "known types are recognized");
test.assert(!systemSoundTypeKnown("not-a-sound"), "unknown types are rejected");
test.assert(
  systemSoundDispatch("boot", { unlocked: true, enabled: true }).action === "play",
  "an unlocked, enabled sound plays immediately"
);
test.assert(
  systemSoundDispatch("boot", { unlocked: false, enabled: true, queueLength: 0 }).action === "queue",
  "a sound requested before unlock is queued"
);
test.assert(
  systemSoundDispatch("boot", { unlocked: false, enabled: false }).action === "skip"
    && systemSoundDispatch("boot", { unlocked: false, enabled: true, queueLength: SYSTEM_SOUND_MAX_QUEUE }).action === "skip",
  "disabled sounds and an overflowing queue are skipped, never dropped silently"
);
test.assert(
  systemSoundDispatch("nope", { unlocked: true, enabled: true }).action === "skip",
  "an unknown type never plays"
);

// ---- Engine behavior with a fake AudioContext ------------------------------
class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.oscillators = [];
    this.resumed = false;
    FakeAudioContext.instances.push(this);
  }

  createOscillator() {
    const oscillator = {
      type: "sine",
      frequency: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
      },
      connect() {},
      start() {},
      stop() {},
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    };
  }

  resume() {
    this.resumed = true;
    this.state = "running";
    return Promise.resolve();
  }
}

const engineContext = vm.createContext({
  window: { AudioContext: FakeAudioContext },
  document: { dataset: {}, addEventListener() {} },
  Promise,
});
vm.runInContext(source, engineContext);
let enabled = true;
const engine = engineContext.window.AISystem6SystemSounds.createSystemSoundEngine({
  getEnabled: () => enabled,
  documentRef: { dataset: {}, addEventListener() {} },
});
test.assert(
  engineContext.window.AISystem6SystemSounds.createSystemSoundEngine({
    getEnabled: () => true,
    // A document-like root has no dataset (dataset is HTMLElement-only);
    // the engine must not throw while arming unlock listeners.
    documentRef: { addEventListener() {} },
  }),
  "the engine tolerates a document-like root without a dataset"
);

test.assert(engine.pendingCount() === 0, "the engine starts with an empty queue");
test.assert(engine.play("boot") === true && engine.pendingCount() === 1, "the pre-unlock boot chime is queued, not dropped");
test.assert(FakeAudioContext.instances.length === 0, "no AudioContext is allocated before a sound is actually scheduled");

enabled = false;
test.assert(engine.play("click") === false && engine.pendingCount() === 1, "a disabled sound is skipped even while queued sounds wait");
enabled = true;

engine.unlock();
// Cross-realm promise resolution (host Promise -> vm Promise) needs a few
// microtask turns before the queued flush runs.
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
const audio = FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
test.assert(audio.resumed === true, "unlock resumes the shared AudioContext");
test.assert(engine.pendingCount() === 0, "queued sounds flush after unlock");
test.assert(audio.oscillators.length >= 3, "the queued boot chime schedules its three tones after unlock");

const beforeClick = audio.oscillators.length;
test.assert(engine.play("click") === true, "post-unlock sounds play immediately");
test.assert(audio.oscillators.length === beforeClick + 1, "a post-unlock click schedules exactly one tone");

// Tone schedules are sane: at least one tone, non-negative onset, positive
// duration, audible volume.
Object.entries(engineContext.window.AISystem6SystemSounds.SYSTEM_SOUND_TONES).forEach(([type, tones]) => {
  test.assert(tones.length >= 1, `${type} has at least one tone`);
  tones.forEach((entry) => {
    test.assert(Number(entry.t) >= 0 && Number(entry.d) > 0, `${type} has a valid onset/duration`);
    test.assert(Number(entry.v) > 0 && Number(entry.v) <= 1, `${type} has an audible volume`);
  });
});

test.finish();
