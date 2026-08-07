// Storage failure matrix: one test per failure mode (IndexedDB write reject,
// corrupted backup import, maintenance snapshot write failure, revision
// write failure — the last one is added by the durability contract in
// tests/e2e/failure-storage-revisions.spec.mjs). Every test proves the same
// completion criteria: content is not lost, the desk is not stuck, an error
// is observable, and the next operation still executes.

import { expect, test } from "@playwright/test";
import {
  bootApp,
  createProject,
  dismissGuide,
  dumpIndexedDb,
  E2E_PROJECT_NAME,
  importMarkdown,
  openWindow,
  runAction,
} from "./helpers.mjs";

test("failure storage: IndexedDB write reject keeps content and recovers", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await page.dblclick("#finder-writing-studio-toggle");
  await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing", { timeout: 15_000 });
  await page.waitForSelector('[data-window="questionSheet"]:not(.is-hidden)', { timeout: 10_000 });
  await page.fill("#question-sheet-body", "This text must survive a refused IndexedDB write.");

  // Break every object-store put; a real save must fail visibly and keep the
  // in-memory content.
  await page.evaluate(() => {
    window.__originalIDBPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put() {
      throw new DOMException("forced quota failure", "QuotaExceededError");
    };
  });
  const saveResult = await page.evaluate(async () => {
    try {
      return await saveDeskState();
    } catch (error) {
      return `threw:${error && error.message || error}`;
    }
  });
  expect(saveResult).toBe(false);

  // Content is not lost, the desk is not busy, and the failure is observable
  // in the console error stream.
  expect(await page.inputValue("#question-sheet-body")).toContain("must survive");
  expect(await page.evaluate(() => document.body.classList.contains("is-busy"))).toBe(false);
  expect(consoleErrors.some((line) => /Failed to save state to IDB/i.test(line))).toBe(true);

  // Restore the write path: the next save succeeds and the desk is usable.
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.__originalIDBPut;
  });
  expect(await page.evaluate(async () => saveDeskState())).toBe(true);
  expect(await page.inputValue("#question-sheet-body")).toContain("must survive");
});

test("failure storage: corrupted backup import is rejected without data loss", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);

  await runAction(page, "open-import-utility");
  await openWindow(page, "importUtility");
  await page.click("details.backup-preview-section summary");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.click("#project-backup-file-button");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{corrupt") });
  await page.waitForFunction(() => /not a valid|无效|不是有效|corrupt|失败|error/i.test(document.querySelector("#project-backup-preview")?.textContent || ""));

  const db = await dumpIndexedDb(page);
  expect((db.projects || []).some((project) => project.name === E2E_PROJECT_NAME)).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains("is-busy"))).toBe(false);
});

test("failure storage: maintenance snapshot write failure aborts without repair", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await importMarkdown(page, "# Recovery source\n\nThis file carries the relation we will break.");

  // Give maintenance something real to repair: a dangling relation on a file.
  await page.evaluate(async () => {
    const file = chatFiles.find((entry) => entry.projectId === activeProjectId);
    file.sourceDocumentId = "missing-source-file";
    await saveDeskState();
  });

  // Block only the maintenance snapshot keyval writes.
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__maintenancePutRestore = () => {
      IDBObjectStore.prototype.put = originalPut;
    };
    IDBObjectStore.prototype.put = function put(value, key) {
      if (String(key || "").startsWith("desktopMaintenanceSnapshots:")) {
        throw new DOMException("forced snapshot write failure", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    };
  });

  await page.evaluate(async () => {
    if (typeof ensureDesktopMaintenanceModule === "function") await ensureDesktopMaintenanceModule();
    await window.AISystem6DesktopMaintenance.runNow("e2e-failure");
  });

  const notifications = await page.evaluate(() =>
    (window.systemNotifications || []).map((entry) => entry.message)
  );
  expect(notifications.some((message) => /pre-repair snapshot|无法保存修复前快照/i.test(message))).toBe(true);

  const stateAfter = await page.evaluate(() => {
    const file = chatFiles.find((entry) => entry.projectId === activeProjectId);
    return { sourceDocumentId: file.sourceDocumentId, busy: document.body.classList.contains("is-busy") };
  });
  expect(stateAfter.sourceDocumentId).toBe("missing-source-file");
  expect(stateAfter.busy).toBe(false);

  // Restore the write path: the next maintenance run repairs the relation.
  await page.evaluate(() => {
    window.__maintenancePutRestore();
  });
  await page.evaluate(async () => {
    if (typeof ensureDesktopMaintenanceModule === "function") await ensureDesktopMaintenanceModule();
    await window.AISystem6DesktopMaintenance.runNow("e2e-recovery");
  });
  const stateAfterRecovery = await page.evaluate(() => {
    const file = chatFiles.find((entry) => entry.projectId === activeProjectId);
    return { sourceDocumentId: file.sourceDocumentId, receipt: (file.repairReceipts || []).length };
  });
  expect(stateAfterRecovery.sourceDocumentId).toBeUndefined();
  expect(stateAfterRecovery.receipt).toBeGreaterThan(0);
});
