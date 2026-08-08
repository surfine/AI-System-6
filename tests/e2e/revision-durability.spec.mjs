// Document-revision durability: version history is user data, so a failed
// revision write must stop destructive steps, and a Project Hard Disk backup
// must carry the revision history through a wipe and restore.

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  bootApp,
  createProject,
  dismissGuide,
  dumpIndexedDb,
  openWindow,
  runAction,
} from "./helpers.mjs";

test("revision durability: a failed phase-advance revision blocks the transition", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await page.dblclick("#finder-writing-studio-toggle");
  await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing", { timeout: 15_000 });
  await page.waitForSelector('[data-window="questionSheet"]:not(.is-hidden)', { timeout: 10_000 });

  // Give the phase-advance a real document to protect; without an active text
  // file no revision is attempted (there is nothing to snapshot).
  await page.evaluate(async () => {
    chatFiles.push({
      id: "phase-doc-1",
      projectId: activeProjectId,
      type: "text",
      name: "Phase Draft.md",
      body: "Existing draft body.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    activeTextFileId = "phase-doc-1";
    await saveDeskState();
  });

  const questions = "Keep this question sheet content when the revision write fails.";
  await page.fill("#question-sheet-body", questions);

  // Break every document-revision keyval write.
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__restoreRevisionPut = () => { IDBObjectStore.prototype.put = originalPut; };
    IDBObjectStore.prototype.put = function put(value, key) {
      if (String(key || "").startsWith("documentRevisions:")) {
        throw new DOMException("forced revision write failure", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    };
  });

  await page.click('[data-window="questionSheet"] [data-action="advance-question-to-outline"]');
  await page.waitForFunction(
    () => /Could not save the pre-advance|无法保存阶段推进前的版本历史/i.test(document.querySelector("#status")?.textContent || ""),
    { timeout: 20_000 }
  );

  // The transition never happened: the Question Sheet still owns the text.
  expect(await page.inputValue("#question-sheet-body")).toContain(questions);
  expect(await page.evaluate(() => document.querySelector('[data-window="outline"]')?.classList.contains("is-hidden"))).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains("is-busy"))).toBe(false);

  // Restore the write path: the same advance now succeeds.
  await page.evaluate(() => window.__restoreRevisionPut());
  await page.click('[data-window="questionSheet"] [data-action="advance-question-to-outline"]');
  await page.waitForSelector('[data-window="outline"]:not(.is-hidden)', { timeout: 15_000 });
  expect(await page.inputValue("#question-sheet-body")).toContain(questions);
});

test("revision durability: backups carry revisions through a wipe and restore", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);

  // Seed a real text file plus two durable revisions through the app's own
  // revision API (the same write path every save uses).
  const revisionIds = await page.evaluate(async () => {
    const fileId = "revision-doc-1";
    chatFiles.push({
      id: fileId,
      projectId: activeProjectId,
      type: "text",
      name: "Revision Draft.md",
      folderId: chatFolders[0]?.id || null,
      body: "Version one body.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await saveDeskState();
    const first = await window.AISystem6DocumentRevisions.create({
      projectId: activeProjectId,
      documentId: fileId,
      body: "Version one body.",
      origin: "user",
      operation: "save",
    });
    const second = await window.AISystem6DocumentRevisions.create({
      projectId: activeProjectId,
      documentId: fileId,
      body: "Version two body, longer.",
      origin: "user",
      operation: "save",
      parentRevisionId: first.id,
    });
    return [first.id, second.id];
  });
  expect(revisionIds.length).toBe(2);

  // Export the Project Hard Disk backup through the real UI.
  await runAction(page, "open-project-info");
  await openWindow(page, "projectInfo");
  await page.evaluate(() => {
    if (typeof focusWindow === "function") focusWindow(getWindow("projectInfo"));
    const win = document.querySelector('[data-window="projectInfo"]');
    if (win) win.style.zIndex = "9999";
  });
  let backupDownload;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const backupPromise = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
    await page.click("#export-project-disk");
    backupDownload = await backupPromise;
    if (backupDownload) break;
  }
  expect(backupDownload).toBeTruthy();
  const backupPath = await backupDownload.path();
  const backupJson = JSON.parse(readFileSync(backupPath, "utf8"));
  expect(backupJson.formatVersion).toBe(3);
  expect(backupJson.documentRevisions).toBeDefined();
  expect(backupJson.documentRevisions.length).toBeGreaterThanOrEqual(2);

  // Wipe everything and import the backup as a new project.
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("ai-system-6-db");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", { timeout: 45_000 });
  await runAction(page, "open-import-utility");
  await openWindow(page, "importUtility");
  await page.click("details.backup-preview-section summary");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.click("#project-backup-file-button");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "backup.json", mimeType: "application/json", buffer: readFileSync(backupPath) });
  await page.waitForFunction(() => !document.querySelector("#import-project-backup")?.disabled);
  await page.click("#import-project-backup");
  await page.waitForFunction(() => /Restored|已恢复/.test(document.querySelector("#project-switcher-label")?.textContent || ""), { timeout: 30_000 });

  const restored = await dumpIndexedDb(page);
  const revisionArrays = (restored.keyval || []).filter((entry) =>
    Array.isArray(entry) && entry.some((item) =>
      item && typeof item === "object" && item.operation === "save" && typeof item.contentHash === "string"
    )
  );
  const importedRevisionBodies = revisionArrays.flat().map((entry) => entry?.body || "");
  expect(importedRevisionBodies.some((body) => body.includes("Version one body."))).toBe(true);
  expect(importedRevisionBodies.some((body) => body.includes("Version two body"))).toBe(true);

  // Open the imported document and its Versions… list: both revisions are
  // still there, and restoring the oldest one changes the body back.
  await openWindow(page, "documents");
  await page.waitForSelector("#document-icon-grid [data-document-item-type='folder']", { timeout: 15_000 });
  const folderId = await page.getAttribute("#document-icon-grid [data-document-item-type='folder']", "data-document-item-id");
  await page.dblclick(`#document-icon-grid [data-document-item-id="${folderId}"]`);
  await page.waitForSelector("#document-icon-grid [data-document-item-type='file']", { timeout: 15_000 });
  const fileId = await page.getAttribute("#document-icon-grid [data-document-item-type='file']", "data-document-item-id");
  await page.dblclick(`#document-icon-grid [data-document-item-id="${fileId}"]`);
  await page.waitForSelector('[data-window="teachText"]:not(.is-hidden)', { timeout: 10_000 });
  await runAction(page, "open-document-versions");
  await page.waitForSelector("#document-versions-modal[open]", { timeout: 10_000 });
  await page.waitForFunction(
    () => (document.querySelectorAll("#document-versions-list input[type='checkbox']").length || 0) >= 2,
    { timeout: 15_000 }
  );
  const versionCount = await page.evaluate(() =>
    document.querySelectorAll("#document-versions-list input[type='checkbox']").length
  );
  expect(versionCount).toBeGreaterThanOrEqual(2);

  const oldestCheckbox = page.locator("#document-versions-list input[type='checkbox']").last();
  await oldestCheckbox.check();
  await page.click("#versions-restore");
  await page.waitForFunction(
    () => (document.querySelector("#teachtext-body")?.value || "").includes("Version one body."),
    { timeout: 15_000 }
  );
});
