// Does an external launch link move a writing session without asking, and
// without taking the writer's place with it?
//
//   node tests/e2e/probe-launch-takeover.spec.mjs
//
// Reported from a screenshot of the old confirm dialog — “打开该应用需要从写作
// 视图切换到桌面。是否继续？” — which stopped a shared link behind a question.
// The link is the visitor's own click, so the question was asking consent for
// the thing that had just been asked for. What the dialog was protecting is
// real, though, and this probe pins both halves of the replacement:
//
//   - no system dialog opens anywhere on the way in;
//   - the desk record still stores `writing`, so the next launch opens the
//     writer's own view again instead of a desk they never picked.
//
// The launched window itself is the evidence that the app the route names is
// what ends up in front of the reader. Both ways in are covered: a shared link
// in a new tab (the web case), and the same window navigating to it (the macOS
// webview, and anyone who pastes the link into the address bar). The second one
// is where the write lease used to ask a question about a window that had
// already left.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide, enterWritingStudio } from "./helpers.mjs";

const ROUTE = "/?launch=endfield-terminal&mode=fullscreen";

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
// `showSystemModal` is the desk's own question, and it always lands here. The
// calls are recorded rather than sampled: a dialog that opened and closed
// during the boot sequence would leave no DOM behind to find.
const instrument = () => {
  window.__dialogsOpened = [];
  const original = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function showModal() {
    window.__dialogsOpened.push(this.id || this.className || "(unnamed dialog)");
    return original.apply(this, arguments);
  };
};
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? "OK  " : "NO  "} ${message}`);
  if (!condition) failures.push(message);
};

async function freshContext() {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  await context.addInitScript(instrument);
  return context;
}

/** The desk state of a page that was left in the writing view, plus the
 *  windows the route had open. */
async function writingSession(label) {
  const context = await freshContext();
  const page = await context.newPage();
  await bootApp(page);
  await dismissGuide(page);
  await enterWritingStudio(page);
  const beforeTakeover = await page.evaluate(() => ({
    profile: document.body.dataset.workspaceProfile,
    writingWindows: [...document.querySelectorAll('[data-window="questionSheet"], [data-window="outline"], [data-window="sectionDrafts"]')]
      .map((win) => win.dataset.window),
  }));
  check(beforeTakeover.profile === "writing", `${label}: the session starts in the writing view (${beforeTakeover.profile})`);
  check(beforeTakeover.writingWindows.length > 0, `${label}: the writing route is on screen (${beforeTakeover.writingWindows.join(", ")})`);
  return { context, page, beforeTakeover };
}

async function readTakeover(page) {
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  await page.waitForFunction(
    () => {
      const win = document.querySelector('[data-window="endfieldTerminal"]');
      return win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden");
    },
    undefined,
    { timeout: 30_000 },
  ).catch(() => {});
  return page.evaluate(() => ({
    dialogs: window.__dialogsOpened || [],
    modalOpen: document.querySelector("#system-modal")?.open === true,
    profile: document.body.dataset.workspaceProfile,
    storedProfile: typeof settingsSnapshotPayload === "function"
      ? settingsSnapshotPayload().workspaceProfile
      : "(snapshot unavailable)",
    launchedVisible: (() => {
      const win = document.querySelector('[data-window="endfieldTerminal"]');
      return !!win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden");
    })(),
    writingWindowsKept: [...document.querySelectorAll('[data-window="questionSheet"], [data-window="outline"], [data-window="sectionDrafts"]')]
      .map((win) => win.dataset.window),
  }));
}

try {
  // Case 1: the shared link opens in a new tab, beside the writer's own.
  {
    const { context, page, beforeTakeover } = await writingSession("new tab");
    const arrival = await context.newPage();
    await arrival.goto(ROUTE);
    const takeover = await readTakeover(arrival);
    check(takeover.dialogs.length === 0, `new tab: the link asked nothing (dialogs opened: ${takeover.dialogs.join(", ") || "none"})`);
    check(takeover.modalOpen === false, "new tab: no system modal is sitting on the desk");
    check(takeover.launchedVisible, "new tab: the app the link names is the window that opened");
    check(takeover.profile === "desktop", `new tab: the session moved to the desk for it (${takeover.profile})`);
    check(
      takeover.storedProfile === "writing",
      `new tab: the record keeps the profile the writer chose (${takeover.storedProfile})`,
    );
    check(
      takeover.writingWindowsKept.length === beforeTakeover.writingWindows.length,
      `new tab: the writing route's windows were hidden, not closed (${takeover.writingWindowsKept.join(", ") || "none"} kept)`,
    );
    await context.close();
    void page;
  }

  // Case 2: the same window navigates to the link.
  {
    const { context, page, beforeTakeover } = await writingSession("same window");
    await page.goto(ROUTE);
    const takeover = await readTakeover(page);
    check(takeover.dialogs.length === 0, `same window: the link asked nothing (dialogs opened: ${takeover.dialogs.join(", ") || "none"})`);
    check(takeover.launchedVisible, "same window: the app the link names is the window that opened");
    check(takeover.profile === "desktop", `same window: the session moved to the desk for it (${takeover.profile})`);
    check(
      takeover.storedProfile === "writing",
      `same window: the record keeps the profile the writer chose (${takeover.storedProfile})`,
    );

    // The writer's place is what the next launch proves: the same record the
    // takeover just wrote is the one the boot sequence restores.
    await page.goto("/");
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
    const reopened = await page.evaluate(() => document.body.dataset.workspaceProfile);
    check(reopened === "writing", `same window: the next launch opens the writer's view (${reopened})`);
    check(
      beforeTakeover.writingWindows.length > 0,
      "same window: the route had real windows to leave alone",
    );
    await context.close();
  }

  console.log(failures.length ? `PROBLEM:\n${failures.join("\n")}` : "probe: a launch link takes over the desk and gives it back");
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  stopProcess(server);
}
