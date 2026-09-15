// Core runtime: applications, commands and the render-task scheduler.
//
// Three registries and one queue, each with a different job:
//
//   applications   an application id -> how to mount (and restore) its window
//   commands       an action id -> an immediate handler
//   lazyCommands   an action id -> the loader that must run before that handler
//   renderTasks    a named DOM job -> run once, coalesced into one frame
//
// The containers used to be single letters (`A`, `C`, `L`, `R`, `S`), which
// made every call site say which map it touched only by convention. Nothing
// outside this file reads those bindings, so they are named now. The exported
// surface on window.AISystem6Runtime is deliberately unchanged, including the
// two opaque keys (`c`, `lazyCommands`) that other modules and the contracts
// already read.

/** @type {Map<string, any>} */
const runtimeApplications = new Map();
/** @type {Map<string, any>} */
const runtimeCommands = new Map();
/** @type {Map<string, any>} */
const runtimeLazyCommands = new Map();
/** @type {Map<string, () => any>} */
const runtimeRenderTasks = new Map();
/**
 * Which window owns a render task, when one does. A task with an owner is
 * deferred while that window is hidden - the record is already updated in
 * memory, and the DOM work waits for the moment it can be seen - while a task
 * with no owner (menu state, the writing pipeline, the clock) runs as before.
 */
const runtimeRenderTaskOwners = new Map();
/** @type {Set<string>} */
const deferredRenderTasks = new Set();
/** @type {Set<string>} */
const pendingRenderTasks = new Set();
/**
 * Applications whose initialization is still running. A second caller waits
 * for the same work instead of being told "already mounted" before the
 * application has bound anything.
 * @type {Map<string, Promise<any>>}
 */
const runtimeMountsInFlight = new Map();
let renderFrameHandle = 0;

/** Registry ids are trimmed once, here, so every lookup agrees. */
const runtimeId = (value) => String(value || "").trim();

/**
 * Registration is all-or-nothing.
 *
 * A descriptor carrying a field nobody reads, a mount that is not a function,
 * a command with no handler, or an id another application already owns is
 * refused before anything is written to the registries - including the case
 * where the third of five declared commands is the broken one. Half a
 * registration is worse than none: the application would then answer
 * "mounted" while one of its own actions is missing.
 *
 * @param {any} definition
 */
function registerRuntimeApplication(definition) {
  if (!definition || typeof definition !== "object") {
    throw new Error("registerApplication needs a descriptor object.");
  }
  const id = runtimeId(definition.id);
  if (!id) throw new Error("registerApplication needs a non-empty application id.");
  // Descriptors carry application-owned metadata too (the object routing a
  // window accepts, a label key, whether the app records runs), so only the
  // fields THIS runtime reads are checked - and each of those is checked for
  // the type it has to be.
  ["mount", "restore"].forEach((field) => {
    const value = definition[field];
    if (value !== undefined && value !== null && typeof value !== "function") {
      throw new Error(`Application "${id}": "${field}" must be a function when it is present.`);
    }
  });
  if (definition.windowName !== undefined && typeof definition.windowName !== "string") {
    throw new Error(`Application "${id}": "windowName" must be a string.`);
  }
  if (runtimeApplications.has(id)) {
    throw new Error(`An application is already registered under the id "${id}".`);
  }
  const commandEntries = Object.entries(definition.commands || {});
  commandEntries.forEach(([commandId, command]) => {
    const normalized = runtimeId(commandId);
    if (!normalized) throw new Error(`Application "${id}" declares a command with no id.`);
    if (runtimeCommands.has(normalized)) {
      throw new Error(`Application "${id}": command "${normalized}" is already registered.`);
    }
    if (typeof command !== "function" && typeof command?.handler !== "function") {
      throw new Error(`Application "${id}": command "${normalized}" has no handler function.`);
    }
  });
  const record = {
    id,
    windowName: runtimeId(definition?.windowName),
    mount: typeof definition?.mount === "function" ? definition.mount : null,
    restore: typeof definition?.restore === "function" ? definition.restore : null,
    mounted: false,
  };
  runtimeApplications.set(id, record);
  commandEntries.forEach(([commandId, command]) => {
    registerCommand(commandId, command);
  });
  return record;
}

/** @param {string} id */
const app = (id) => runtimeApplications.get(runtimeId(id)) || null;

/**
 * Mount once, and only report success once the application has finished
 * initializing.
 *
 * Two callers arriving together share one initialization: the second waits
 * for the first instead of being told "already mounted" while nothing is bound
 * yet. A failure clears the record, so a later open is a real retry rather
 * than a permanent "mounted" claim, and an application with no mount step
 * counts as initialized as soon as it is asked for.
 */
async function mountApplication(id, options = {}) {
  const normalizedId = runtimeId(id);
  const record = app(normalizedId);
  if (!record) return { ok: false, status: "unregistered" };
  if (record.mounted) return { ok: true, status: "ok" };
  const inFlight = runtimeMountsInFlight.get(normalizedId);
  if (inFlight) return inFlight;
  const attempt = (async () => {
    if (!record.mount) {
      record.mounted = true;
      return { ok: true, status: "ok" };
    }
    try {
      const result = await record.mount({ appId: record.id, ...options });
      record.mounted = true;
      return { ok: true, status: "ok", result };
    } catch (error) {
      return { ok: false, status: "mount-failed", error };
    }
  })().finally(() => {
    runtimeMountsInFlight.delete(normalizedId);
  });
  runtimeMountsInFlight.set(normalizedId, attempt);
  return attempt;
}

async function restoreApplication(id, state = {}, options = {}) {
  const record = app(id);
  if (!record) return { ok: false, status: "unregistered" };
  const mounted = await mountApplication(id, options);
  if (!mounted.ok) return mounted;
  if (!record.restore) return { ok: true, status: "ok" };
  try {
    return {
      ok: true,
      status: "ok",
      result: await record.restore({ appId: record.id, state, ...options }),
    };
  } catch (error) {
    // The window is mounted and usable even when its saved scene is not, so
    // this reports the restore failure without unmounting anything.
    return { ok: false, status: "restore-failed", error };
  }
}

/**
 * Immediate commands. A command that is already registered wins: registration
 * is a programming error, not a way to replace a handler at runtime.
 *
 * @param {string} commandId
 * @param {{ handler?: Function, isAvailable?: (payload?: any) => boolean }} [definition]
 */
function registerCommand(commandId, definition = {}) {
  const id = runtimeId(commandId);
  if (runtimeCommands.has(id)) {
    throw new Error(`A command is already registered under the id "${id}".`);
  }
  const handler = typeof definition === "function" ? definition : definition.handler;
  if (typeof handler !== "function") {
    throw new Error(`Command "${id}" needs a handler function.`);
  }
  runtimeCommands.set(id, {
    id,
    handler,
    isAvailable: typeof definition?.isAvailable === "function" ? definition.isAvailable : () => true,
    unavailableReason: typeof definition?.unavailableReason === "function" ? definition.unavailableReason : null,
  });
}

/**
 * Commands whose implementation lives in a lazy module: dispatching one runs
 * its loader first, and the loader is expected to register the real command.
 *
 * @param {string} commandId
 * @param {{ ensure?: Function, isAvailable?: (payload?: any) => boolean }} [definition]
 */
function registerLazyCommand(commandId, definition = {}) {
  const id = runtimeId(commandId);
  if (runtimeCommands.has(id) || runtimeLazyCommands.has(id)) {
    throw new Error(`A command is already registered under the id "${id}".`);
  }
  runtimeLazyCommands.set(id, {
    id,
    ensure: typeof definition === "function" ? definition : definition.ensure,
    isAvailable: typeof definition?.isAvailable === "function" ? definition.isAvailable : () => true,
    unavailableReason: typeof definition?.unavailableReason === "function" ? definition.unavailableReason : null,
  });
}

/**
 * Can this command run right now, and if not, why not?
 *
 * One answer for every surface - menu row, toolbar button, shortcut, palette -
 * so a disabled control can say what is missing ("select something first",
 * "this window is not in front") instead of leaving a grey square. Cheap and
 * side-effect free: the command's own precondition, never a load or a model
 * call, and the action re-checks the same precondition where it runs.
 *
 * @param {string} commandId
 * @param {any} [payload]
 * @returns {{ available: boolean, reason: string }}
 */
function commandAvailability(commandId, payload = {}) {
  const id = runtimeId(commandId);
  const command = runtimeCommands.get(id) || null;
  if (!command) return { available: false, reason: "unregistered" };
  let available = true;
  try {
    available = command.isAvailable(payload) !== false;
  } catch (error) {
    console.warn(error);
    available = false;
  }
  if (available) return { available: true, reason: "" };
  let reason = "";
  if (command.unavailableReason) {
    try {
      reason = String(command.unavailableReason(payload) || "");
    } catch (error) {
      console.warn(error);
    }
  }
  return { available: false, reason };
}

/**
 * Read-only views of the registries.
 *
 * The maps themselves are not handed out: a caller that can `.set()` or
 * `.delete()` on the command registry can register or unregister anything, and
 * the promise of "one commit path, one place that owns registration" would be
 * gone. These copy what a reader needs - ids, and a frozen view of one entry -
 * so a consumer never holds the registry itself.
 *
 * @param {(command: any, id: string) => void} visitor
 */
function forEachCommand(visitor) {
  if (typeof visitor !== "function") return;
  runtimeCommands.forEach((command, id) => {
    // The handler travels with the view: callers build their own dispatch
    // tables from it. What stays private is the registry, not the function.
    visitor(Object.freeze({ id: command.id, handler: command.handler, isAvailable: command.isAvailable }), id);
  });
}

/** @param {(command: any, id: string) => void} visitor */
function forEachLazyCommand(visitor) {
  if (typeof visitor !== "function") return;
  runtimeLazyCommands.forEach((command, id) => {
    visitor(Object.freeze({ id: command.id, ensure: command.ensure, isAvailable: command.isAvailable }), id);
  });
}

/** @param {string} commandId */
function getLazyCommand(commandId) {
  const command = runtimeLazyCommands.get(runtimeId(commandId));
  if (!command) return null;
  return Object.freeze({ id: command.id, ensure: command.ensure, isAvailable: command.isAvailable });
}

/** A frozen view of one registered command, or null. @param {string} commandId */
function getCommand(commandId) {
  const command = runtimeCommands.get(runtimeId(commandId));
  if (!command) return null;
  return Object.freeze({ id: command.id, handler: command.handler, isAvailable: command.isAvailable });
}

function commandCount() {
  return runtimeCommands.size;
}

/**
 * Dispatch one action.
 *
 * The three outcomes callers act on stay apart: `unavailable` means the
 * command exists but its precondition does not hold right now, `cancelled`
 * means the handler stopped on purpose, and `error` carries everything else.
 * A handler that throws is never reported as a successful dispatch.
 *
 * A handler that RETURNS a failure is not a successful dispatch either. A
 * business result - "the confirm was declined", "nothing was saved", "the
 * target moved" - arrives as `{ ok: false, reason }`, and reporting it as
 * `ok: true` because the function returned would make the caller's own
 * failure handling unreachable. The dispatch result keeps the handler's
 * result intact and says which layer failed.
 */
async function dispatchCommand(commandId, payload = {}) {
  const command = runtimeCommands.get(runtimeId(commandId)) || null;
  if (!command) return { ok: false, status: "unregistered" };
  let available = true;
  try {
    available = command.isAvailable(payload);
  } catch (error) {
    console.warn(error);
    available = false;
  }
  if (available === false) {
    // Unavailable is an answer, and it comes with the same reason the menus
    // showed: the caller can say what is missing instead of doing nothing.
    let reason = "";
    if (command.unavailableReason) {
      try {
        reason = String(command.unavailableReason(payload) || "");
      } catch (error) {
        console.warn(error);
      }
    }
    return { ok: false, status: "unavailable", reason };
  }
  try {
    const result = await command.handler(payload);
    if (result && typeof result === "object" && result.ok === false) {
      return {
        ok: false,
        status: "handler-failed",
        result,
        reason: String(result.reason || result.status || ""),
      };
    }
    return { ok: true, status: "success", result };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === "AbortError" || payload?.signal?.aborted === true ? "cancelled" : "error",
      error,
    };
  }
}

/**
 * @param {string} task
 * @param {() => any} handler
 * @param {{ windowName?: string }} [options]
 */
function registerRenderTask(task, handler, options = {}) {
  const name = runtimeId(task);
  if (runtimeRenderTasks.has(name)) {
    throw new Error(`A render task is already registered under the name "${name}".`);
  }
  runtimeRenderTasks.set(name, handler);
  if (options.windowName) runtimeRenderTaskOwners.set(name, runtimeId(options.windowName));
}

/**
 * The window that owns a task, or "" when none does. The runtime answers this
 * without reading the DOM: whether that window is on screen right now is the
 * caller's question (it is the one that knows about windows and markup).
 * @param {string} task
 */
function renderTaskOwner(task) {
  return runtimeRenderTaskOwners.get(runtimeId(task)) || "";
}

/**
 * Park tasks the caller cannot paint right now - a window that is hidden or
 * collapsed. They are released by flushDeferredRenderTasks() when it is shown.
 * @param {string[]} tasks
 */
function deferRenderTask(...tasks) {
  tasks
    .flat()
    .map(runtimeId)
    .filter(Boolean)
    .forEach((name) => deferredRenderTasks.add(name));
  return deferredRenderTasks.size;
}

/**
 * Move the tasks one window was waiting on into the queue. Called when the
 * window is revealed: the data moved while it was hidden, the repaint did not.
 * @param {string} windowName
 * @returns {number} how many tasks were released
 */
function flushDeferredRenderTasks(windowName = "") {
  const owner = runtimeId(windowName);
  if (!owner) return 0;
  let released = 0;
  [...deferredRenderTasks].forEach((task) => {
    if (runtimeRenderTaskOwners.get(task) !== owner) return;
    deferredRenderTasks.delete(task);
    pendingRenderTasks.add(task);
    released += 1;
  });
  if (released) scheduleRenderTask();
  return released;
}

/**
 * Ask for named render tasks. Repeated requests inside the same frame collapse
 * into one run, which is why the queue holds names rather than callbacks.
 */
function scheduleRenderTask(...tasks) {
  tasks
    .flat()
    .map(runtimeId)
    .filter(Boolean)
    .forEach((name) => pendingRenderTasks.add(name));
  if (!pendingRenderTasks.size || renderFrameHandle) return;
  const schedule = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);
  renderFrameHandle = schedule(flushRenderTasks);
}

/**
 * Run what was requested, and only that. The queue is drained before the first
 * task runs, so a task that schedules another task gets the next frame instead
 * of extending this one.
 *
 * One task failing is logged and does not stop the rest: these paint
 * independent windows of the desk.
 */
function flushRenderTasks() {
  renderFrameHandle = 0;
  const queued = new Set(pendingRenderTasks);
  pendingRenderTasks.clear();
  queued.forEach((name) => {
    const handler = runtimeRenderTasks.get(name);
    const endPerf = window.AISystem6Perf?.start("render_task", { task: name });
    try {
      if (!handler) throw new Error(`Unregistered render task: ${name}`);
      handler();
    } catch (error) {
      console.error(error);
    } finally {
      endPerf?.();
    }
  });
}

/**
 * Read-only diagnostics: what is registered, what is still in flight, and what
 * is waiting for a window to come back.
 *
 * Counts, ids and phase names only. No record content, no file paths, no
 * credentials - this is meant to be pasted into a bug report, so it must never
 * carry the writer's prose. It is always available (nothing to switch on) and
 * reads no DOM; the per-instance side lives on each application's own
 * `resourceCount()`/`state()`.
 */
function describeRuntime() {
  return Object.freeze({
    applications: Object.freeze([...runtimeApplications.values()].map((record) => Object.freeze({
      id: record.id,
      windowName: record.windowName,
      mounted: record.mounted === true,
    }))),
    commands: runtimeCommands.size,
    lazyCommands: runtimeLazyCommands.size,
    renderTasks: runtimeRenderTasks.size,
    pendingRenderTasks: pendingRenderTasks.size,
    deferredRenderTasks: Object.freeze([...deferredRenderTasks]),
    mountsInFlight: Object.freeze([...runtimeMountsInFlight.keys()]),
  });
}

window.AISystem6Runtime = Object.freeze({
  registerApplication: registerRuntimeApplication,
  getApplication: app,
  mountApplication,
  restoreApplication,
  registerCommand,
  registerLazyCommand,
  dispatchCommand,
  /** Read-only enumerations and views; the registries themselves stay private. */
  listCommands: () => [...runtimeCommands.keys()],
  listLazyCommands: () => [...runtimeLazyCommands.keys()],
  hasCommand: (commandId) => runtimeCommands.has(runtimeId(commandId)),
  hasLazyCommand: (commandId) => runtimeLazyCommands.has(runtimeId(commandId)),
  commandCount,
  forEachCommand,
  forEachLazyCommand,
  getCommand,
  getLazyCommand,
  commandAvailability,
  registerRenderTask,
  renderTaskOwner,
  deferRenderTask,
  scheduleRenderTask,
  flushRenderTasks,
  flushDeferredRenderTasks,
  /** Diagnostics: tasks waiting for a hidden window to come back. */
  deferredRenderTaskCount: () => deferredRenderTasks.size,
  /** Diagnostics: a read-only summary of the runtime's own state. */
  describeRuntime,
});
