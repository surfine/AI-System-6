// Narrow invalidation: a committed change repaints the views its collections
// own, not the whole desk. The schedule keeps runtime's dedupe queue, and work
// requested while a flush is running is left for the next frame.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("desk-view-invalidation");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

// Record what would be scheduled, and drive the flush by hand.
run(`
  window.__scheduled = [];
  // The desk schedules through the runtime API object, so the observation
  // point is its scheduleRenderTask - replaced with a wrapper that keeps every
  // other method (register, flush) real.
  window.__realRuntime = window.AISystem6Runtime;
  window.AISystem6Runtime = Object.assign({}, window.__realRuntime, {
    scheduleRenderTask: (...tasks) => {
      tasks.flat().forEach((task) => window.__scheduled.push(String(task)));
    },
  });
  window.__stored = new Map();
  function fakeRequest(result) {
    return {
      result,
      error: null,
      addEventListener(type, handler) { if (type === "success") Promise.resolve().then(handler); },
    };
  }
  openAppDb = async () => ({
    transaction: () => ({ objectStore: () => ({ get: (id) => fakeRequest(window.__stored.get(id) ?? null) }) }),
    close() {},
  });
  idbRequest = (request) => Promise.resolve(request.result);
  window.AISystem6StorageTransactions = Object.assign({}, window.AISystem6StorageTransactions, {
    transactionDone: async () => {},
  });
  chatFiles.length = 0;
  scraps.length = 0;
  trashItems.length = 0;
`);

const scheduleFor = async (changes, deletes = []) => {
  // The desk windows are hidden in this headless harness; the scheduling rules
  // under test here are about WHICH views a change touches, so the windows are
  // shown first. The hidden case has its own assertions below.
  run(`
    ["projects", "documents", "scrapbook", "trash", "projectCd"].forEach((name) => {
      const win = document.querySelector('[data-window="' + name + '"]');
      if (win) win.classList.remove("is-hidden", "is-collapsed");
    });
  `);
  run("window.__scheduled = []");
  await run(`applyDeskRecordChanges(${JSON.stringify({ changes, deletes })})`);
  return run("window.__scheduled.slice()");
};

const fileChange = await scheduleFor([{ key: "chatFiles", id: "view-file-1" }]);
test.assert(fileChange.includes("documents"), "a file change repaints the document list");
test.assert(fileChange.includes("menuState"), "and keeps the menus in step");
test.assert(
  !fileChange.includes("pipeline") && !fileChange.includes("scraps") && !fileChange.includes("trash"),
  "a file change does not repaint the writing pipeline, the Scrapbook or the Trash"
);

const projectChange = await scheduleFor([{ key: "projects", id: "view-project-1" }]);
test.assert(
  projectChange.includes("pipeline") && projectChange.includes("projectDisks"),
  "a project change repaints the writing route and the project disks"
);
test.assert(
  projectChange.includes("projectReferences"),
  "and the reference list, which is read from the mounted project"
);
test.assert(!projectChange.includes("trash"), "but still not the Trash");

const scrapChange = await scheduleFor([{ key: "scraps", id: "view-scrap-1" }]);
test.assert(
  scrapChange.includes("scraps") && !scrapChange.includes("documents") && !scrapChange.includes("pipeline"),
  "a Scrapbook change repaints the Scrapbook only"
);

const trashChange = await scheduleFor([{ key: "trash", id: "view-trash-1" }]);
test.assert(
  trashChange.includes("trash") && !trashChange.includes("scraps"),
  "a Trash change repaints the Trash only"
);

const deletion = await scheduleFor([], [{ key: "chatFiles", id: "view-file-2" }]);
test.assert(
  deletion.includes("documents") && !deletion.includes("pipeline"),
  "an announced delete is scoped the same way as an announced update"
);

// --- The scheduler itself still behaves -------------------------------------
run(`
  window.__runs = [];
  window.AISystem6Runtime = window.__realRuntime;
  // In a browser the next frame is a later task; the harness runs
  // requestAnimationFrame synchronously, which would recurse instead of
  // deferring. Stub it so the queue's own behaviour is what is observed.
  requestAnimationFrame = () => 1;
  registerRenderTask("invalidation-probe", () => {
    window.__runs.push("probe");
    // Requesting work while the flush is running must be served by the next
    // frame, not lost with the batch that is draining.
    scheduleRenderTask("invalidation-late");
  });
  registerRenderTask("invalidation-late", () => { window.__runs.push("late"); });
  scheduleRenderTask("invalidation-probe");
  window.AISystem6Runtime.flushRenderTasks();
`);
const flushOutcome = await run(`({
  runs: window.__runs.slice(),
  pendingAfterFirstFlush: window.AISystem6Runtime.flushRenderTasks && window.__runs.slice(),
})`);
test.assert(
  flushOutcome.runs.join(",") === "probe",
  "a task requested during a flush is not run inside the same batch"
);
run("window.AISystem6Runtime.flushRenderTasks()");
test.assert(
  run("window.__runs.join(',')") === "probe,late",
  "and it is run by the next flush instead of being dropped"
);

// --- A hidden window keeps its repaint until it can be seen ----------------
const deferral = await run(`
  (() => {
    const runtime = window.__realRuntime;
    window.__hiddenRuns = [];
    runtime.registerRenderTask("hidden-owned-task", () => { window.__hiddenRuns.push("ran"); }, { windowName: "documents" });
    const win = document.querySelector('[data-window="documents"]');
    win.classList.add("is-hidden");
    // The desk scheduler is what knows about windows: it parks the task and
    // the runtime only holds the queue and the owner registry.
    scheduleRenderTasks("hidden-owned-task");
    runtime.flushRenderTasks();
    const whileHidden = { runs: window.__hiddenRuns.slice(), deferred: runtime.deferredRenderTaskCount() };
    win.classList.remove("is-hidden");
    const released = runtime.flushDeferredRenderTasks("documents");
    runtime.flushRenderTasks();
    return { whileHidden, released, afterReveal: window.__hiddenRuns.slice() };
  })()
`);
test.assert(
  deferral.whileHidden.runs.length === 0 && deferral.whileHidden.deferred === 1,
  "a task owned by a hidden window is not painted while nobody can see it"
);
test.assert(
  deferral.released === 1 && deferral.afterReveal.join(",") === "ran",
  "revealing the window releases exactly its pending repaint"
);

test.finish();
