// Control Strip groundwork.
//
// Control Strip is a System 7 feature, so it is optional: it only loads when
// Control Panel -> General -> Control Strip is checked, and disabling it
// removes it from the desk entirely. The strip modules and their 1-bit icons
// are drawn by a separate task; this module owns the lifecycle, the mount
// point, and the module registry those renderers will fill.
//
// Planned module slots (one status module each, collapsible to a handle, never
// a second menu bar and never an app launcher):
//   soundscape  - Soundscape play / pause / scene switch
//   projectDisk - current Project Hard Disk
//   model       - local or cloud model in use
//   network     - online status
//   context     - context space in use
//   indexing    - embedding and index progress
//   longTasks   - running long task
//   writingBell - writing bell state
//   outputQueue - pending output queue
//   volume      - system volume

window.AISystem6ControlStripLoaded = true;

const controlStripModuleSlots = Object.freeze([
  "soundscape",
  "projectDisk",
  "model",
  "network",
  "context",
  "indexing",
  "longTasks",
  "writingBell",
  "outputQueue",
  "volume",
]);

let stripEnabled = false;
let stripMount = null;
const stripModuleRegistry = new Map();

function ensureStripMount() {
  if (stripMount) return stripMount;
  stripMount = document.createElement("div");
  stripMount.className = "control-strip";
  stripMount.dataset.controlStrip = "";
  stripMount.hidden = true;
  document.body.append(stripMount);
  return stripMount;
}

function enable() {
  if (stripEnabled) return;
  stripEnabled = true;
  ensureStripMount();
}

function disable() {
  stripEnabled = false;
  if (stripMount) {
    stripMount.remove();
    stripMount = null;
  }
}

function isEnabled() {
  return stripEnabled;
}

function registerModule(descriptor) {
  if (!descriptor || typeof descriptor.id !== "string" || !descriptor.id) return false;
  if (!controlStripModuleSlots.includes(descriptor.id)) return false;
  stripModuleRegistry.set(descriptor.id, descriptor);
  return true;
}

function listModules() {
  return controlStripModuleSlots
    .map((slot) => stripModuleRegistry.get(slot) || null)
    .filter(Boolean);
}

window.AISystem6ControlStrip = Object.freeze({
  enable,
  disable,
  isEnabled,
  registerModule,
  listModules,
  getMount: () => stripMount,
  moduleSlots: controlStripModuleSlots,
});
