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
  await page.click('[data-window="control"] .close-box');
  await page.waitForFunction(() => document.querySelector('[data-window="control"]')?.classList.contains("is-hidden"), { timeout: 10_000 });
  await openWindow(page, "questionSheet");
}

async function openQuestionSheetCommands(page) {
  await page.click('[data-window="questionSheet"] .teachtext-command-menu summary');
}

async function waitForVisibleFailure(page) {
  try {
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
  } catch (error) {
    const diag = await page.evaluate(() => ({
      busy: document.body.classList.contains("is-busy"),
      status: document.querySelector("#status")?.textContent || "",
      connection: document.querySelector("#local-connection-status")?.textContent || "",
      modal: document.querySelector("#system-modal")?.open ? document.querySelector("#system-modal-message")?.textContent || "" : "",
      lang: typeof currentLanguage !== "undefined" ? currentLanguage : "(n/a)",
    }));
    console.log("FAILURE-DIAG", JSON.stringify(diag));
    throw error;
  }
}

async function acceptOutlineOverwriteModalIfPresent(page) {
  try {
    await page.waitForSelector("#system-modal[open]", { timeout: 3_000 });
  } catch {
    return; // no confirmation appeared
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.$("#system-modal[open]");
    if (!open) return;
    const message = await page.textContent("#system-modal-message");
    // Only the overwrite confirmation belongs to this step; an alert that
    // reports a failure must stay open so the test can assert the error.
    if (!/already has content|将被覆盖|overwritten|overwrite/i.test(message || "")) return;
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
  // Dismiss the failure alert from the first attempt before retrying.
  const failureAlert = await page.$("#system-modal[open]");
  if (failureAlert) {
    await page.click("#system-modal-yes");
    await page.waitForSelector("#system-modal", { state: "hidden", timeout: 10_000 });
  }
  // A failed generation can leave the outline surface covering the Question
  // Sheet (it was opened for the streaming preview). Raise the Question Sheet
  // before clicking its command menu.
  await page.evaluate(() => {
    if (typeof focusWindow === "function") focusWindow(getWindow("questionSheet"));
    const win = document.querySelector('[data-window="questionSheet"]');
    if (win) win.style.zIndex = "9999";
  });
  await openQuestionSheetCommands(page);
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
    try {
      await page.click('[data-window="questionSheet"] [data-action="generate-outline"]');
    } catch (error) {
      const diag = await page.evaluate(() => ({
        visible: [...document.querySelectorAll(".window:not(.is-hidden)")].map((w) => w.dataset.window),
        active: document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "",
        summaryOpen: document.querySelector('[data-window="questionSheet"] .teachtext-command-menu')?.open,
        btnRect: (() => { const r = document.querySelector('[data-window="questionSheet"] [data-action="generate-outline"]')?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height] : null; })(),
        qsRect: (() => { const r = document.querySelector('[data-window="questionSheet"]')?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height] : null; })(),
        model: document.querySelector("#model")?.value || "",
      }));
      console.log(`GENERATE-DIAG ${scenario}`, JSON.stringify(diag));
      throw error;
    }
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
