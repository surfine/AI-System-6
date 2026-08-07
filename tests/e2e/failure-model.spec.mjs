// Model failure matrix: one test per failure mode (stream cutoff, timeout,
// 429, 500, invalid JSON, empty response). Every test proves the same
// completion criteria: content is not lost, the Busy state recovers, the
// user sees an error, and the next operation still executes.

import { expect, test } from "@playwright/test";
import { createFakeModelServer } from "./fake-model.mjs";
import {
  bootApp,
  connectFakeModel,
  createProject,
  dismissGuide,
  enterWritingStudio,
  openWindow,
} from "./helpers.mjs";

let fakeModel;
let fakeModelPort;

test.beforeAll(async () => {
  fakeModel = createFakeModelServer();
  fakeModelPort = await fakeModel.listen();
});

test.afterAll(async () => {
  await fakeModel.close();
});

async function bootForFailure(page, scenario) {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  // Enter the writing workspace first so the Question Sheet surface exists;
  // then connect the fake model through the Control Panel.
  await enterWritingStudio(page);
  fakeModel.setScenario(scenario);
  await connectFakeModel(page, { port: fakeModelPort });
  await openWindow(page, "questionSheet");
}

async function openQuestionSheetCommands(page) {
  await page.click('[data-window="questionSheet"] .teachtext-command-menu summary');
}

async function waitForVisibleFailure(page) {
  await page.waitForFunction(
    () => {
      const busy = document.body.classList.contains("is-busy");
      const status = document.querySelector("#status")?.textContent || "";
      const connection = document.querySelector("#local-connection-status")?.textContent || "";
      const modal = document.querySelector("#system-modal")?.open ? document.querySelector("#system-modal-message")?.textContent || "" : "";
      const errorVisible = /Outline generation failed|生成大纲失败|failed|could not|error|无法|失败|出错|rate|server/i.test(
        `${status} ${connection} ${modal}`
      );
      return !busy && errorVisible;
    },
    { timeout: 60_000 }
  );
}

async function acceptOutlineOverwriteModalIfPresent(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.$("#system-modal[open]");
    if (!open) return;
    await page.click("#system-modal-yes");
    try {
      await page.waitForSelector("#system-modal", { state: "hidden", timeout: 5_000 });
    } catch {
      // A second modal may have replaced the first.
    }
  }
}

async function assertRetrySucceeds(page, questions) {
  fakeModel.setScenario("json");
  await acceptOutlineOverwriteModalIfPresent(page);
  await page.click('[data-window="questionSheet"] [data-action="generate-outline"]');
  await acceptOutlineOverwriteModalIfPresent(page);
  await page.waitForFunction(
    () => (document.querySelector("#outline-content")?.value || "").includes("## 背景"),
    { timeout: 60_000 }
  );
  expect(await page.inputValue("#question-sheet-body")).toContain(questions.slice(0, 20));
}

const failureModes = [
  ["cutoff", "stream cutoff"],
  ["timeout", "request timeout"],
  ["rate-limit", "HTTP 429"],
  ["server-error", "HTTP 500"],
  ["invalid", "invalid JSON body"],
  ["empty", "empty assistant response"],
];

for (const [scenario, label] of failureModes) {
  test(`failure model: ${label} keeps content and the desk usable`, async ({ page }) => {
    await bootForFailure(page, scenario);
    const questions = `Keep this draft text safe during ${scenario}.`;
    await page.fill("#question-sheet-body", questions);

    await openQuestionSheetCommands(page);
    await page.click('[data-window="questionSheet"] [data-action="generate-outline"]');
    await acceptOutlineOverwriteModalIfPresent(page);
    await waitForVisibleFailure(page);

    // Completion criteria: content intact, Busy recovered, error shown,
    // next operation still executable.
    expect(await page.inputValue("#question-sheet-body")).toContain(questions);
    expect(await page.evaluate(() => document.body.dataset.appReady)).toBe("ready");
    expect(await page.evaluate(() => document.body.classList.contains("is-busy"))).toBe(false);
    await assertRetrySucceeds(page, questions);
    expect(fakeModel.state.chatCalls).toBeGreaterThan(0);
  });
}
