// Browser failure matrix for the durability contracts: StateStore rollback,
// Project Hard Disk backup fail-closed, revision restore persistence, and
// Project CD burn. Every test injects one real failure, verifies the actual
// persisted state (not just console errors), recovers, and reloads.

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  bootApp,
  createProject,
  dismissGuide,
  dumpIndexedDb,
  importMarkdown,
  openWindow,
  runAction,
} from "./helpers.mjs";

async function seedDocumentWithRevisions(page, { bodyV1, bodyV2, documentId = "durable-doc-1" }) {
  await page.evaluate(async (id) => {
    chatFiles.push({
      id,
      projectId: activeProjectId,
      type: "text",
      name: "Durable Draft.md",
      folderId: null,
      body: "New body.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    activeTextFileId = id;
    await saveDeskState();
  }, documentId);
  const first = await page.evaluate(async ({ id, body }) =>
    window.AISystem6DocumentRevisions.create({
      projectId: activeProjectId,
      documentId: id,
      body,
      origin: "user",
      operation: "save",
    }), { id: documentId, body: bodyV1 });
  const second = await page.evaluate(async ({ id, body, parent }) =>
    window.AISystem6DocumentRevisions.create({
      projectId: activeProjectId,
      documentId: id,
      body,
      origin: "user",
      operation: "save",
      parentRevisionId: parent,
    }), { id: documentId, body: bodyV2, parent: first.id });
  return { first, second };
}

test("durability: StateStore rollback restores memory, UI, and reload state", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await importMarkdown(page, "# Existing file\n\nThis one must survive.");
  // The import's desk save is async; wait until the file is actually in
  // IndexedDB before breaking the write path.
  await page.waitForFunction(async () => {
    const open = indexedDB.open("ai-system-6-db");
    const database = await new Promise((resolve) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
    });
    if (!database) return false;
    const files = await new Promise((resolve) => {
      const tx = database.transaction("chatFiles", "readonly");
      const all = tx.objectStore("chatFiles").getAll();
      all.onsuccess = () => resolve(all.result || []);
      all.onerror = () => resolve([]);
    });
    database.close();
    return files.some((file) => /Existing file/.test(file.body || ""));
  }, undefined, { timeout: 15_000 });

  // Break every object-store put, then commit a new file through the store.
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__restorePut = () => { IDBObjectStore.prototype.put = originalPut; };
    IDBObjectStore.prototype.put = function put() {
      throw new DOMException("forced quota failure", "QuotaExceededError");
    };
  });
  const commitResult = await page.evaluate(async () => {
    try {
      await window.AISystem6StateStores.projects.commit(() => {
        chatFiles.push({
          id: "rollback-file",
          projectId: activeProjectId,
          type: "text",
          name: "Rollback.md",
          body: "must not survive",
          folderId: null,
        });
      });
      return "resolved";
    } catch (error) {
      return error?.code || String(error?.message || error);
    }
  });
  expect(commitResult).toBe("STORE_PERSIST_FAILED");

  // Memory rolled back and the Finder does not show the phantom file.
  const memory = await page.evaluate(() => ({
    phantom: chatFiles.some((file) => file.id === "rollback-file"),
    existing: chatFiles.some((file) => /Existing file/.test(file.body || "")),
  }));
  expect(memory.phantom).toBe(false);
  expect(memory.existing).toBe(true);

  // Restore writes, reload, and confirm the persisted state never contained
  // the failed commit.
  await page.evaluate(() => window.__restorePut());
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  const db = await dumpIndexedDb(page);
  expect((db.chatFiles || []).some((file) => file.id === "rollback-file")).toBe(false);
  expect((db.chatFiles || []).some((file) => /Existing file/.test(file.body || ""))).toBe(true);
});

test("durability: backup export fails closed when version history cannot be read", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await importMarkdown(page, "# Backup source\n\nRevisions must be readable.");
  await seedDocumentWithRevisions(page, { bodyV1: "Revision one.", bodyV2: "Revision two." });

  // Break ONLY the document-revision keyval reads.
  await page.evaluate(() => {
    const originalGet = IDBObjectStore.prototype.get;
    window.__restoreGet = () => { IDBObjectStore.prototype.get = originalGet; };
    IDBObjectStore.prototype.get = function get(key) {
      if (String(key || "").startsWith("documentRevisions:")) {
        throw new DOMException("forced revision read failure", "ReadError");
      }
      return originalGet.call(this, key);
    };
  });

  await runAction(page, "open-project-info");
  await openWindow(page, "projectInfo");
  let downloadFired = false;
  page.on("download", () => { downloadFired = true; });
  await page.click("#export-project-disk");
  await page.waitForFunction(
    () => /version history could not be read|版本历史无法完整读取/.test(document.querySelector("#status")?.textContent || ""),
    undefined, { timeout: 15_000 }
  );
  await page.waitForTimeout(1500);
  expect(downloadFired).toBe(false);

  const before = await dumpIndexedDb(page);
  expect((before.chatFiles || []).some((file) => /Backup source/.test(file.body || ""))).toBe(true);

  // Recover and export again: the backup carries the revisions.
  await page.evaluate(() => window.__restoreGet());
  const backupPromise = page.waitForEvent("download", { timeout: 20_000 });
  await page.click("#export-project-disk");
  const download = await backupPromise;
  const backupPath = await download.path();
  const backupJson = JSON.parse(readFileSync(backupPath, "utf8"));
  expect(backupJson.documentRevisions.length).toBeGreaterThanOrEqual(2);
});

test("durability: revision restore verifies persistence and rolls back on failure", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await seedDocumentWithRevisions(page, { bodyV1: "Old body.", bodyV2: "New body." });

  // Open the seeded document, not a timing-dependent blank TeachText tab.
  // Chromium can finish the window open before the direct activeTextFileId
  // assignment made by the fixture survives tab initialization.
  const openedSeed = await page.evaluate((documentId) => ({
    opened: window.AISystem6TeachText?.openDocument?.(documentId) === true,
    activeProjectId,
    file: chatFiles.find((entry) => entry.id === documentId) || null,
  }), "durable-doc-1");
  expect(openedSeed, "the seeded document must still belong to the active project").toMatchObject({
    opened: true,
    file: { id: "durable-doc-1", projectId: openedSeed.activeProjectId },
  });
  // Open the document and its Versions dialog.
  await openWindow(page, "teachText");
  await page.evaluate(() => openDocumentVersions());
  await page.waitForSelector("#document-versions-modal[open]", { timeout: 10_000 });
  await page.waitForFunction(
    () => (document.querySelectorAll("#document-versions-list input[type='checkbox']").length || 0) >= 2,
    undefined, { timeout: 15_000 }
  );

  // Force the desk save to fail, then restore the old revision.
  await page.evaluate(() => {
    window.__originalSaveDeskState = saveDeskState;
    saveDeskState = async () => false;
  });
  const checkboxes = page.locator("#document-versions-list input[type='checkbox']");
  const count = await checkboxes.count();
  const oldIndex = count - 1; // newest first, so the last checkbox is the oldest
  await checkboxes.nth(oldIndex).check();
  await page.click("#versions-restore");
  await page.waitForFunction(
    () => /Could not save the restored document|无法保存恢复后的正文/.test(document.querySelector("#status")?.textContent || ""),
    undefined, { timeout: 15_000 }
  );
  expect(await page.evaluate(() => chatFiles.find((file) => file.id === activeTextFileId)?.body)).toBe("New body.");

  // Reload: the failed restore must not have persisted.
  await page.evaluate(() => { saveDeskState = window.__originalSaveDeskState; });
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  const dbAfterFailed = await dumpIndexedDb(page);
  const failedFile = (dbAfterFailed.chatFiles || []).find((file) => file.id === "durable-doc-1");
  expect(failedFile?.body).toBe("New body.");

  // Restore again with writes healthy: the old body persists across reload.
  await page.evaluate(() => window.AISystem6TeachText.openDocument("durable-doc-1"));
  await openWindow(page, "teachText");
  await page.waitForFunction(
    () => (document.querySelector("#teachtext-body")?.value || "").includes("New body."),
    undefined, { timeout: 15_000 }
  );
  await page.evaluate(() => openDocumentVersions());
  await page.waitForSelector("#document-versions-modal[open]", { timeout: 10_000 });
  await page.waitForFunction(
    () => (document.querySelectorAll("#document-versions-list input[type='checkbox']").length || 0) >= 2,
    undefined, { timeout: 15_000 }
  );
  const checkboxesAfter = page.locator("#document-versions-list input[type='checkbox']");
  await checkboxesAfter.nth((await checkboxesAfter.count()) - 1).check();
  await page.click("#versions-restore");
  await page.waitForFunction(
    () => chatFiles.find((file) => file.id === activeTextFileId)?.body === "Old body.",
    undefined, { timeout: 15_000 }
  );
  expect(await page.evaluate(() => chatFiles.find((file) => file.id === activeTextFileId)?.body)).toBe("Old body.");
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  const dbAfterRestore = await dumpIndexedDb(page);
  expect((dbAfterRestore.chatFiles || []).find((file) => file.id === "durable-doc-1")?.body).toBe("Old body.");
});

test("durability: Project CD burn aborts when the pre-burn revision cannot be written", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await importMarkdown(page, "# Burn source\n\nProtect before burning.");

  await page.evaluate(async () => {
    const file = chatFiles.find((entry) => entry.projectId === activeProjectId && entry.type === "text");
    if (file && typeof openTextFile === "function") openTextFile(file.id);
  });
  await openWindow(page, "teachText");
  await page.waitForFunction(
    () => (document.querySelector("#teachtext-body")?.value || "").includes("Burn source"),
    undefined, { timeout: 15_000 }
  );
  await page.evaluate(() => {
    // The CD export only burns a manuscript-surface document.
    teachTextDocumentRole = "manuscript";
    if (typeof setTeachTextWorkflowState === "function") setTeachTextWorkflowState("final");
  });

  // Break the document-revision keyval writes.
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    window.__restorePut = () => { IDBObjectStore.prototype.put = originalPut; };
    IDBObjectStore.prototype.put = function put(value, key) {
      if (String(key || "").startsWith("documentRevisions:")) {
        throw new DOMException("forced revision write failure", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    };
  });

  // Drive the real export handler; the menu availability gate is a UI-layer
  // concern and would silently skip the action.
  const burned = await page.evaluate(async () => {
    const item = await exportTeachTextToProjectCd();
    return !!item;
  });
  expect(burned).toBe(false);
  expect(
    await page.evaluate(() => /Could not save the pre-burn|无法保存烧录前的版本历史/.test(document.querySelector("#status")?.textContent || ""))
  ).toBe(true);
  const state = await dumpIndexedDb(page);
  const cdEntries = (state.keyval || []).filter((entry) =>
    Array.isArray(entry.projectCdItems) && entry.projectCdItems.length > 0
  );
  expect(cdEntries.length).toBe(0);

  // Recover and burn again: the CD item appears.
  await page.evaluate(() => window.__restorePut());
  await page.evaluate(async () => {
    await exportTeachTextToProjectCd();
  });
  await page.waitForFunction(
    () => /burned to Project CD|已烧录|已导出/.test(document.querySelector("#status")?.textContent || ""),
    undefined, { timeout: 15_000 }
  );
  const after = await dumpIndexedDb(page);
  const cdAfter = (after.keyval || []).filter((entry) =>
    Array.isArray(entry.projectCdItems) && entry.projectCdItems.length > 0
  );
  expect(cdAfter.length).toBeGreaterThan(0);
});
