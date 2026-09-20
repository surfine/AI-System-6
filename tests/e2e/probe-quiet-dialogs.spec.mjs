// Does the desk still stop the writer for things it can decide itself?
//
//   node tests/e2e/probe-quiet-dialogs.spec.mjs
//
// The standing review of every dialog lives in docs/design/system-dialogs.md.
// This probe is the live half of it: it boots the real app, drives the paths
// whose dialogs were removed, and watches `HTMLDialogElement.prototype
// .showModal` for anything at all. A path that still opens a dialog fails, and
// so does a path whose replacement message never reaches the reader.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide } from "./helpers.mjs";

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
// Every dialog in the app goes through showModal, so one hook sees the whole
// question surface — the desk's own modal, the write lease, and the forms.
await context.addInitScript(() => {
  window.__dialogs = [];
  const original = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function showModal() {
    window.__dialogs.push(this.id || "(unnamed dialog)");
    return original.apply(this, arguments);
  };
});
const page = await context.newPage();
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? "OK  " : "NO  "} ${message}`);
  if (!condition) failures.push(message);
};
const dialogs = () => page.evaluate(() => window.__dialogs);
const notifications = () => page.evaluate(() => systemNotifications.map((entry) => entry.message));
const status = () => page.evaluate(() => document.querySelector("#status")?.textContent || "");

try {
  await bootApp(page);
  await dismissGuide(page);

  // The writing bell: a timer that interrupts the work it measures should not
  // then wait to be dismissed.
  await page.evaluate(() => { window.__dialogs = []; startWritingBell(); });
  let state = await page.evaluate(() => ({ running: writingBellRunning, mode: writingBellMode }));
  check(state.running === true, "the writing bell starts");
  await page.evaluate(() => { writingBellRemaining = 0; completeWritingBell(); });
  state = await page.evaluate(() => ({ running: writingBellRunning, mode: writingBellMode }));
  check((await dialogs()).length === 0, `the finished bell asked nothing (dialogs: ${(await dialogs()).join(", ") || "none"})`);
  check(state.running === false && state.mode === "break", `the next interval is already loaded (mode ${state.mode})`);
  check(/bell|铃/i.test(await status()), `the status line says the bell rang (${(await status()).trim().slice(0, 32)})`);
  check(
    (await notifications()).some((message) => /stopped|停下/.test(message)),
    "the knock notification still carries the way back to the sentence",
  );

  // An unfinished review is a note on an export the writer already asked for.
  await page.evaluate(() => { window.__dialogs = []; });
  await page.evaluate(() => noteProjectCdExportReviewState({ title: "Draft One", sourceKind: "markdown", metadata: {} }));
  check((await dialogs()).length === 0, "an unfinished review no longer stops the export");
  check(
    (await notifications()).some((message) => /Review Desk/.test(message)),
    "the review note lands in the notification list",
  );

  // Shut Down is the writer's own command; the desk saves, and the shutdown
  // screen reports what actually happened.
  await page.evaluate(() => { window.__dialogs = []; });
  await page.evaluate(() => shutDownSystem());
  check((await dialogs()).length === 0, "Shut Down asked nothing");
  check(
    await page.evaluate(() => !document.querySelector("#shutdown-screen")?.classList.contains("is-hidden")),
    "the shutdown screen is the answer",
  );

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });

  // A system file cannot be opened, and that is a sentence, not a dialog.
  await page.evaluate(() => { window.__dialogs = []; });
  await page.evaluate(() => handleAction("open-system-file-system"));
  check((await dialogs()).length === 0, "opening a system file asks nothing");
  check((await status()).trim().length > 0, `the status line explains it (${(await status()).trim().slice(0, 32)})`);

  // A droplet explains itself where the reader can keep reading it.
  await page.evaluate(() => { window.__dialogs = []; });
  await page.evaluate(() => handleAction("open-droplet", { dropletId: "not-a-real-droplet" }));
  check((await dialogs()).length === 0, "double-clicking a droplet asks nothing");
  check(
    (await notifications()).some((message) => /drag|拖放/.test(message)),
    "the droplet explainer lands in the notification list",
  );

  console.log(failures.length
    ? `PROBLEM:\n${failures.join("\n")}`
    : "probe: the desk decides, and the writer is only stopped for their own work");
  if (failures.length) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  stopProcess(server);
}
