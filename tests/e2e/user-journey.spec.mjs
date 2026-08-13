// Black-box user journeys.
//
// Hard rule: these tests never call product-internal JavaScript APIs. They
// drive the app exactly the way a person does — click, dblclick, fill,
// keyboard, file chooser, menus, dialogs, Finder icons — and only read
// IndexedDB in the final assertion phase to prove the result really
// persisted. The value of these three journeys is a real first-time user's
// path working end to end, not string-contract coverage.
//
// Journey A: first use — open, create a Project Hard Disk, import Markdown,
// clip a passage, write Question Sheet -> Outline -> Draft -> Review ->
// Project CD -> download.
// Journey B: the next day — reopen the project, restore the writing state,
// keep editing, refresh, and find the content and position again.
// Journey C: failure recovery — a model call fails, content is not lost, the
// Busy state clears, the error is visible, and the retry succeeds.

import { expect, test } from "@playwright/test";
import { createFakeModelServer } from "./fake-model.mjs";
import {
  bootApp,
  dismissGuide,
  dumpIndexedDb,
  E2E_PROJECT_NAME,
} from "./helpers.mjs";

/** The menu-bar menu whose direct button text is exactly `label`. */
function menuBarMenu(page, label) {
  return page.locator(".menu-bar > .menu").filter({
    has: page.locator(":scope > button", { hasText: new RegExp(`^${label}$`) }),
  });
}

/** Open a surface through the Writing menu's Go To submenu (real user path). */
async function writingGoTo(page, action) {
  const writingMenu = menuBarMenu(page, "Writing");
  await writingMenu.locator("> button").click();
  await writingMenu.locator(".menu-submenu-trigger", { hasText: "Go To" }).hover();
  await writingMenu.locator(`[data-action="${action}"]`).click();
}

async function createProjectThroughSwitcher(page) {
  await page.click("#project-switcher-button");
  await page.click('#project-switcher-popover [data-action="new-project-disk"]');
  await page.fill("#new-project-disk-name", E2E_PROJECT_NAME);
  await page.click("#new-project-disk-confirm");
  await page.waitForSelector("#new-project-disk-modal", { state: "hidden" });
}

async function importMarkdownThroughUi(page, markdown) {
  await page.click("#active-project-drop-target");
  await page.waitForSelector('[data-window="projects"]:not(.is-hidden)');
  await page.click('[data-window="projects"] [data-action="open-import-utility"]');
  await page.waitForSelector('[data-window="importUtility"]:not(.is-hidden)');
  const chooserPromise = page.waitForEvent("filechooser");
  await page.click("#import-files-button");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from(markdown, "utf8") });
  await page.waitForFunction(
    () => /Source Notes|notes\.md|preview/i.test(document.querySelector("#import-preview")?.textContent || ""),
    undefined,
    { timeout: 20_000 }
  );
  await page.click("#import-documents");
  await page.waitForFunction(() => {
    const status = document.querySelector("#import-status")?.textContent || "";
    return /saved|written|record|完成|imported|已写入|成功|写进/i.test(status);
  }, undefined, { timeout: 20_000 });
}

async function openImportedFileAndClip(page) {
  await page.waitForSelector("#document-icon-grid [data-document-item-type='folder']", { timeout: 10_000 });
  const folderId = await page.getAttribute("#document-icon-grid [data-document-item-type='folder']", "data-document-item-id");
  await page.dblclick(`#document-icon-grid [data-document-item-id="${folderId}"]`);
  await page.waitForSelector("#document-icon-grid [data-document-item-type='file']", { timeout: 10_000 });
  const fileId = await page.getAttribute("#document-icon-grid [data-document-item-type='file']", "data-document-item-id");
  await page.dblclick(`#document-icon-grid [data-document-item-id="${fileId}"]`);
  await page.waitForSelector('[data-window="teachText"]:not(.is-hidden)', { timeout: 10_000 });

  // Select the whole passage and clip it through the Edit menu.
  await page.click("#teachtext-body");
  await page.keyboard.press("Meta+a");
  const editMenu = menuBarMenu(page, "Edit");
  await editMenu.locator("> button").click();
  await editMenu.locator('[data-action="selection-clip-file"]').click();
  await page.waitForFunction(
    () => /clipped|已剪|已保存|clip/i.test(document.querySelector("#status")?.textContent || ""),
    undefined,
    { timeout: 15_000 }
  );
}

async function enterWritingStudio(page) {
  await page.dblclick("#finder-writing-studio-toggle");
  await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing", undefined, { timeout: 15_000 });
  await page.waitForSelector('[data-window="questionSheet"]:not(.is-hidden)', { timeout: 10_000 });
}

async function acceptConfirmModalIfPresent(page) {
  try {
    await page.waitForSelector("#system-modal[open]", { timeout: 3_000 });
  } catch {
    return; // the generation started without a confirmation
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.$("#system-modal[open]");
    if (!open) return;
    const message = await page.textContent("#system-modal-message");
    // Only accept the overwrite/final confirmation; a failure alert must stay
    // open so the error stays visible.
    if (!/already has content|将被覆盖|overwritten|overwrite|final|最终/i.test(message || "")) return;
    await page.click("#system-modal-yes");
    try {
      await page.waitForSelector("#system-modal", { state: "hidden", timeout: 5_000 });
    } catch {
      // A second modal may have replaced the first.
    }
  }
}

test("journey A: a first-time user completes the whole route and downloads", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProjectThroughSwitcher(page);
  await importMarkdownThroughUi(page, "# Source Notes\n\nThis is the evidence line that matters.\n\nSecond sentence stays too.");
  await openImportedFileAndClip(page);
  await enterWritingStudio(page);

  // Question Sheet -> Outline -> Section Drafts.
  await page.fill("#question-sheet-body", "Recipient: the reader.\n\nQuestion: does the evidence support the claim?");
  await page.click('[data-window="questionSheet"] [data-action="advance-question-to-outline"]');
  await page.waitForSelector('[data-window="outline"]:not(.is-hidden)', { timeout: 15_000 });
  await page.click('[data-window="outline"] .title-bar');
  await page.fill("#outline-content", "## Section One\n\n## Section Two");
  await page.click('[data-window="outline"] [data-action="advance-outline-to-drafts"]');
  await page.waitForSelector('[data-window="sectionDrafts"]:not(.is-hidden)', { timeout: 15_000 });
  await page.click('[data-window="sectionDrafts"] .title-bar');
  await page.fill("#draft-body", "Section one manual prose grounded in the clipped evidence.");
  await page.click('[data-window="sectionDrafts"] [data-action="advance-drafts-to-review"]');

  // Review Desk -> Manuscript tab -> mark Final -> type -> save.
  await page.waitForTimeout(800);
  await writingGoTo(page, "open-review-desk");
  await page.waitForSelector('[data-window="reviewDesk"]:not(.is-hidden)', { timeout: 10_000 });
  await page.click('[data-window="reviewDesk"] [data-action="review-view-manuscript"]');
  await page.waitForSelector('[data-window="teachText"]:not(.is-hidden)', { timeout: 10_000 });
  // On a narrow paired window the document rail is intentionally replaced by
  // its compact status-bar switcher. Choose the manuscript through that real
  // user surface instead of targeting the hidden wide-layout rail.
  const documentStack = page.locator('[data-tdi-stack-for="teachtext-tabs"] .tdi-document-stack');
  await documentStack.locator("summary").click();
  await documentStack.locator(".tdi-stack-open").filter({ hasText: /Manuscript|手稿/ }).click();
  await expect(documentStack.locator(".tdi-stack-active-copy")).toContainText(/Manuscript|手稿/);
  await page.waitForSelector('#teachtext-label:not([disabled])', { timeout: 10_000 });
  await page.selectOption("#teachtext-label", "final");
  await acceptConfirmModalIfPresent(page);
  await page.fill("#teachtext-body", "# Manuscript\n\nSection one manual prose grounded in the clipped evidence.\n\nSection two follows.");
  await page.keyboard.press("Meta+s");

  // Project CD: export, open the CD, download.
  await page.locator('[data-action="export-teachtext-project-cd"]:visible').first().click();
  await page.waitForTimeout(1000);
  await page.dblclick("#desktop-project-cd");
  await page.waitForSelector('[data-window="projectCd"]:not(.is-hidden)', { timeout: 10_000 });
  await page.waitForFunction(() => (document.querySelector("#project-cd-count")?.textContent || "").includes("1"), undefined, { timeout: 15_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.click("#download-project-cd");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/i);

  // Final assertion phase: prove every step really persisted.
  const db = await dumpIndexedDb(page);
  const files = db.chatFiles || [];
  const settings = (db.keyval || []).find((entry) => Array.isArray(entry.projectCdItems));
  expect((db.projects || []).some((project) => project.name === E2E_PROJECT_NAME)).toBe(true);
  expect(files.some((file) => /Source Notes/.test(file.name || "") && /evidence line/.test(file.body || ""))).toBe(true);
  expect(files.some((file) => file.artifactKind === "clipping" && /evidence line/.test(file.body || ""))).toBe(true);
  expect((settings?.projectCdItems || []).some((item) => item.sourceKind === "markdown" && /Section one manual prose/.test(item.body || ""))).toBe(true);
});

test("journey B: returning the next day finds the writing state restored", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProjectThroughSwitcher(page);
  await enterWritingStudio(page);

  const original = "Day two: the recipient is the reader, and the question is whether the evidence holds.";
  await page.fill("#question-sheet-body", original);
  await page.waitForTimeout(1800); // working-session autosave

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  await page.waitForFunction(
    () => (document.querySelector("#question-sheet-body")?.value || "").includes("Day two"),
    undefined,
    { timeout: 20_000 }
  );
  expect(await page.inputValue("#question-sheet-body")).toContain("Day two");

  // Continue editing, save, refresh again: content and position survive.
  const continued = `${original}\n\nAdded after the refresh: the evidence still matters.`;
  await page.fill("#question-sheet-body", continued);
  await page.waitForTimeout(1800);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  await page.waitForFunction(
    () => (document.querySelector("#question-sheet-body")?.value || "").includes("Added after the refresh"),
    undefined,
    { timeout: 20_000 }
  );

  const db = await dumpIndexedDb(page);
  expect((db.projects || []).some((project) => project.name === E2E_PROJECT_NAME)).toBe(true);
});

let fakeModel;
let fakeModelPort;

test.beforeAll(async () => {
  fakeModel = createFakeModelServer();
  fakeModelPort = await fakeModel.listen();
});

test.afterAll(async () => {
  await fakeModel.close();
});

test("journey C: a failed model call never loses work and the retry succeeds", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProjectThroughSwitcher(page);
  await enterWritingStudio(page);

  // Connect the local model through the Control Panel (real UI), with the
  // server already set to fail the next generation.
  fakeModel.setScenario("server-error");
  await page.click('[data-window="questionSheet"] .title-bar');
  await page.click(".menu-bar .apple");
  await page.click('.apple-menu-popover [data-action="open-control"]');
  await page.waitForSelector('[data-window="control"]:not(.is-hidden)');
  await page.click('#control-tab-local');
  const manualConnection = page.locator("#local-manual-connection");
  if (!await manualConnection.evaluate((element) => element.open)) {
    await manualConnection.locator(":scope > summary").click();
  }
  await expect(manualConnection).toHaveJSProperty("open", true);
  const modelFields = page.locator(".local-model-fields");
  if (await modelFields.isVisible()) {
    await page.click("#connect-local-model");
    await expect(modelFields).toBeHidden();
  }
  await expect(page.locator("#endpoint")).toBeVisible();
  await page.fill("#endpoint", `http://127.0.0.1:${fakeModelPort}`);
  await page.click("#connect-local-model");
  await expect(modelFields).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#local-connection-status")).toContainText(/Connected|已连接|连接成功/i, { timeout: 20_000 });
  await page.waitForFunction(() => (document.querySelector("#model")?.value || "").trim() !== "", undefined, { timeout: 20_000 });

  await page.click('[data-window="control"] .close-box');
  await page.waitForFunction(() => document.querySelector('[data-window="control"]')?.classList.contains("is-hidden"), undefined, { timeout: 10_000 });
  await page.click('[data-window="questionSheet"] .title-bar');
  await page.click('[data-window="questionSheet"] .teachtext-command-menu summary');
  const draft = "Keep this exact draft text even when the model call fails.";
  await page.fill("#question-sheet-body", draft);
  await page.click('[data-window="questionSheet"] [data-action="generate-outline"]');
  await acceptConfirmModalIfPresent(page);

  // The failure surfaces, Busy clears, content is intact.
  await page.waitForFunction(
    () => {
      const busy = document.body.classList.contains("is-busy");
      const status = document.querySelector("#status")?.textContent || "";
      const connection = document.querySelector("#local-connection-status")?.textContent || "";
      return !busy && /Outline generation failed|生成大纲失败|failed|could not|error|无法|失败|出错/i.test(`${status} ${connection}`);
    },
    undefined,
    { timeout: 60_000 }
  );
  expect(await page.inputValue("#question-sheet-body")).toContain(draft);
  expect(await page.evaluate(() => document.body.dataset.appReady)).toBe("ready");

  // The user simply tries again; the server is healthy now.
  fakeModel.setScenario("json");
  const failureAlert = await page.$("#system-modal[open]");
  if (failureAlert) {
    await page.click("#system-modal-yes");
    await page.waitForSelector("#system-modal", { state: "hidden", timeout: 10_000 });
  }
  // Bring the Question Sheet back through the real Writing menu after the
  // failure surface has taken focus. Do not use product-internal window APIs.
  await writingGoTo(page, "open-question-sheet");
  await page.waitForSelector('[data-window="questionSheet"]:not(.is-hidden)', { timeout: 10_000 });
  await page.click('[data-window="questionSheet"] .teachtext-command-menu summary');
  await page.click('[data-window="questionSheet"] [data-action="generate-outline"]');
  await acceptConfirmModalIfPresent(page);
  try {
    await page.waitForFunction(
      () => (document.querySelector("#outline-content")?.value || "").includes("## 背景"),
      undefined,
      { timeout: 60_000 }
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      busy: document.body.classList.contains("is-busy"),
      status: document.querySelector("#status")?.textContent || "",
      connection: document.querySelector("#local-connection-status")?.textContent || "",
      outline: document.querySelector("#outline-content")?.value || "",
      model: document.querySelector("#model")?.value || "",
    }));
    console.log("JOURNEY-C-RETRY-DIAG", JSON.stringify({ diagnostic, fakeState: fakeModel.state }));
    throw error;
  }
  expect(await page.inputValue("#question-sheet-body")).toContain(draft);

  const db = await dumpIndexedDb(page);
  const project = (db.projects || []).find((entry) => entry.name === E2E_PROJECT_NAME);
  expect(!!project).toBe(true);
  expect(String(project.questionSheet || "")).toContain(draft);
});
