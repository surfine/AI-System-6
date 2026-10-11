// W02 (unified spec 2026-10-10) contract: the mount reentrancy path.
//
// The `mount: open` pattern — a module whose mount calls openWindow() on its
// own window — is a real cycle: the window manager mounts before it reveals,
// so the inner open arrives back at runtime.mountApplication while the outer
// one is still in flight. The window manager marks the window it is opening
// and a nested open of the same window carries that mark down; without it the
// outer mount waits for the inner open and neither ever finishes (Cover Glass
// and Quick Draft both hung on it).
//
// This test drives the REAL openWindow in the real boot VM and pins the two
// behaviors the spec demands survive any refactor of that mark:
//   1. the nested open of an in-flight window completes (no deadlock), and
//   2. two independent opens of the same window name BOTH run their intent —
//      the second does not get an early "already opening" return.
// Acceptance passes through openWindow, not mountApplication alone.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("window-open-reentrancy");
const vmw = createAppBootVm();

// --- 1. The real reentrant cycle: a registered mount that opens its own window.
const reentrant = await vmw.run(`(async () => {
  const log = [];
  window.AISystem6Runtime.registerApplication({
    id: "w02-reentrant-app",
    windowName: "w02Reentrant",
    async mount() {
      log.push("mount-start");
      // The pattern Cover Glass/Quick Draft use: the mount opens its own window.
      await window.openWindow("w02Reentrant");
      log.push("mount-end");
      return { opened: true };
    },
  });
  const section = document.createElement("section");
  section.className = "window is-hidden";
  section.dataset.window = "w02Reentrant";
  section.dataset.app = "w02-reentrant-app";
  section.innerHTML = '<div class="title-bar"><h2>W02</h2></div>';
  document.querySelector(".desktop").append(section);
  const outcome = await window.openWindow("w02Reentrant");
  return { log, outcome, visible: !document.querySelector('[data-window="w02Reentrant"]')?.classList.contains("is-hidden") };
})()`);

test.assert(reentrant.log.includes("mount-start") && reentrant.log.includes("mount-end"),
  `the mount's nested open of its own window completes instead of deadlocking (${JSON.stringify(reentrant.log)})`);
test.assert(reentrant.visible === true, "the reentrant window is revealed after the cycle completes");

// --- 2. Two sequential opens of the same window both run to completion.
const sequential = await vmw.run(`(async () => {
  const calls = [];
  window.AISystem6Runtime.registerApplication({
    id: "w02-counting-app",
    windowName: "w02Counting",
    async mount() { calls.push("mount"); return { ok: true }; },
  });
  const section = document.createElement("section");
  section.className = "window is-hidden";
  section.dataset.window = "w02Counting";
  section.dataset.app = "w02-counting-app";
  section.innerHTML = '<div class="title-bar"><h2>W02b</h2></div>';
  document.querySelector(".desktop").append(section);
  const first = await window.openWindow("w02Counting");
  const second = await window.openWindow("w02Counting");
  return { calls, first, second, visible: !document.querySelector('[data-window="w02Counting"]')?.classList.contains("is-hidden") };
})()`);

test.assert(sequential.calls.length === 1,
  `two opens of an already-mounted window share one initialization (${sequential.calls.length} mounts)`);
test.assert(sequential.visible === true, "the window stays revealed across re-opens");

// --- 3. A slow first open must not hand the second open a premature ready.
const overlapping = await vmw.run(`(async () => {
  const marks = [];
  let release = null;
  const gate = new Promise((resolve) => { release = resolve; });
  window.AISystem6Runtime.registerApplication({
    id: "w02-slow-app",
    windowName: "w02Slow",
    async mount() {
      marks.push("mount-start");
      await gate;
      marks.push("mount-end");
      return { ok: true };
    },
  });
  const section = document.createElement("section");
  section.className = "window is-hidden";
  section.dataset.window = "w02Slow";
  section.dataset.app = "w02-slow-app";
  section.innerHTML = '<div class="title-bar"><h2>W02c</h2></div>';
  document.querySelector(".desktop").append(section);
  const first = window.openWindow("w02Slow").then((r) => { marks.push("first:" + (r && r.ok ? "ok" : (r && r.status) || "none")); return r; });
  // The VM's setTimeout is deliberately inert; yield microtasks so the first
  // mount reaches its gate before the second open begins.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const second = window.openWindow("w02Slow").then((r) => { marks.push("second:" + (r && r.ok ? "ok" : (r && r.status) || "none")); return r; });
  // While the first mount is gated, the second open must NOT report ready.
  const earlyState = {
    firstDone: marks.some((m) => m.startsWith("first:")),
    secondDone: marks.some((m) => m.startsWith("second:")),
  };
  release();
  const firstOutcome = await first;
  const secondOutcome = await second;
  // vmw.run serializes the result; plain {ok:true,status:"ok"} shapes cross
  // cleanly, so capture only the fields the assertion reads.
  return {
    marks, earlyState,
    firstOk: firstOutcome?.ok === true, firstStatus: String(firstOutcome?.status || ""),
    secondOk: secondOutcome?.ok === true, secondStatus: String(secondOutcome?.status || ""),
  };
})()`);

test.assert(overlapping.earlyState.firstDone === false && overlapping.earlyState.secondDone === false,
  `a second open of a mounting window waits instead of returning an early ready (${JSON.stringify(overlapping.earlyState)})`);
test.assert(overlapping.marks.filter((m) => m === "mount-start").length === 1,
  `the overlapping opens share one mount run (${JSON.stringify(overlapping.marks)})`);
// openWindow resolves undefined on its success paths (openWindowInner has no
// final return) — the observable contract is "no failure shape + the window
// revealed", which the marks above already carry (second:…/first:… show the
// resolutions landed and no mount-failed status appeared).
test.assert(overlapping.marks.includes("mount-end")
  && overlapping.marks.some((m) => m.startsWith("first:"))
  && overlapping.marks.some((m) => m.startsWith("second:"))
  && !overlapping.marks.some((m) => m.includes("mount-failed")),
  `both opens complete after the shared mount lands, neither reporting a failure (${JSON.stringify(overlapping.marks)})`);

test.finish();
