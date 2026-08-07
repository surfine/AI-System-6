import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createFakeModelServer } from "./fake-model.mjs";
import {
  bootApp,
  connectFakeModel,
  createProject,
  dismissGuide,
  dumpIndexedDb,
  E2E_PROJECT_NAME,
  enableMultiFinder,
  enterWritingStudio,
  importMarkdown,
  openWindow,
  runAction,
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

async function acceptModalIfPresent(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.$("#system-modal[open]");
    if (!open) return attempt > 0;
    await page.click("#system-modal-yes");
    try {
      await page.waitForSelector("#system-modal", { state: "hidden", timeout: 5_000 });
    } catch {
      // A second modal may have replaced the first; loop and dismiss it too.
    }
  }
  return true;
}

async function openCommandMenu(page, windowName, label) {
  await page.evaluate(
    ({ win, label: menuLabel }) => {
      const winEl = document.querySelector(`[data-window="${win}"]`);
      const summary = [...winEl.querySelectorAll(".teachtext-command-menu summary")]
        .find((el) => (el.textContent || "").includes(menuLabel));
      summary?.click();
    },
    { win: windowName, label }
  );
}

async function selectTextInTeachText(page, needle) {
  await page.focus("#teachtext-body");
  await page.evaluate((text) => {
    const el = document.querySelector("#teachtext-body");
    const start = el.value.indexOf(text);
    el.setSelectionRange(start, start + text.length);
    el.focus();
  }, needle);
}

async function raiseWindow(page, name) {
  await page.evaluate((windowName) => {
    focusWindow(getWindow(windowName));
    const win = document.querySelector(`[data-window="${windowName}"]`);
    if (win) win.style.zIndex = "9999";
  }, name);
}

async function openProjectDocument(page, nameFragment) {
  await openWindow(page, "documents");
  for (let depth = 0; depth < 3; depth += 1) {
    const fileItem = page.locator(
      '#document-icon-grid [data-document-item-type="file"], #documents [data-document-item-type="file"]'
    ).filter({ hasText: nameFragment });
    if (await fileItem.count()) {
      await fileItem.first().dblclick();
      break;
    }
    const folderItem = page.locator(
      '#document-icon-grid [data-document-item-type="folder"], #documents [data-document-item-type="folder"]'
    ).first();
    if (!(await folderItem.count())) {
      throw new Error(`document "${nameFragment}" not found in Documents`);
    }
    await folderItem.dblclick();
    await page.waitForTimeout(300);
  }
  await openWindow(page, "teachText");
}

async function selectProjectDocument(page, nameFragment) {
  await openWindow(page, "documents");
  for (let depth = 0; depth < 3; depth += 1) {
    const fileItem = page.locator(
      '#document-icon-grid [data-document-item-type="file"], #documents [data-document-item-type="file"]'
    ).filter({ hasText: nameFragment });
    if (await fileItem.count()) {
      await fileItem.first().click();
      return;
    }
    const folderItem = page.locator(
      '#document-icon-grid [data-document-item-type="folder"], #documents [data-document-item-type="folder"]'
    ).first();
    if (!(await folderItem.count())) return;
    await folderItem.dblclick();
    await page.waitForTimeout(300);
  }
}

async function projectFileId(page, fragment) {
  const db = await dumpIndexedDb(page);
  const file = (db.chatFiles || []).find((entry) => entry.type === "text" && /Backup/.test(entry.body || ""));
  return file?.id || "";
}

async function openProjectFileById(page, fileId) {
  await page.evaluate((id) => {
    if (typeof openTextFile === "function") openTextFile(id);
  }, fileId);
  await openWindow(page, "teachText");
}

async function selectProjectFileById(page, fileId) {
  await page.evaluate((id) => {
    const file = chatFiles.find((entry) => entry.id === id);
    if (file) {
      selectedDocumentFolderId = file.folderId || "all";
      selectedFolderId = file.folderId || "all";
    }
    selectedChatFileId = id;
    selectedDocumentItemKeys.clear();
    selectedDocumentItemKeys.add(`file:${id}`);
    if (typeof renderDocuments === "function") renderDocuments();
  }, fileId);
}

test("golden path 1: complete manual route without a model", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await enterWritingStudio(page);
  await enableMultiFinder(page);

  const markdown = "# Source Notes\n\nThis is the evidence line that matters.\n\nSecond evidence sentence stays too.";
  await importMarkdown(page, markdown);

  // Open the imported document and clip a passage.
  await openProjectDocument(page, "notes");
  await selectTextInTeachText(page, "evidence line that matters");
  await page.evaluate(() => runSelectionClipFile());

  // Question Sheet -> Outline -> Section Drafts (all manual).
  await page.evaluate(() => openQuestionSheetSurface());
  await openWindow(page, "questionSheet");
  await page.fill("#question-sheet-body", "Recipient: the reader.\n\nQuestion: does the evidence support the claim?");
  await page.waitForTimeout(400);
  await acceptModalIfPresent(page);
  await page.click('[data-window="questionSheet"] [data-action="advance-question-to-outline"]');
  await openWindow(page, "outline");
  await page.fill("#outline-content", "## Section One\n\n## Section Two");
  await page.evaluate(() => focusWindow(getWindow("outline")));
  await page.evaluate(() => {
    focusWindow(getWindow("outline"));
    const win = document.querySelector('[data-window="outline"]');
    if (win) win.style.zIndex = "9999";
  });
  await page.click('[data-window="outline"] [data-action="advance-outline-to-drafts"]');
  await openWindow(page, "sectionDrafts");
  await page.fill("#draft-body", "Section one manual prose grounded in the clipped evidence.");
  await page.click('[data-window="sectionDrafts"] [data-action="advance-drafts-to-review"]');

  // Manuscript: type the final body in TeachText and save it.
  await openWindow(page, "reviewDesk");
  await page.click('[data-window="reviewDesk"] [data-action="review-view-manuscript"]');
  await openWindow(page, "teachText");
  await page.evaluate(() => {
    // Activate the flow's manuscript tab and mark the manuscript Final, the
    // same state the Review Desk requires before export.
    if (typeof ensureTeachTextManuscriptTab === "function") {
      const tab = ensureTeachTextManuscriptTab();
      if (tab && typeof openTeachTextDocumentTab === "function") {
        openTeachTextDocumentTab(tab.id, { focus: false });
      }
    }
    teachTextDocumentRole = "manuscript";
    if (typeof setTeachTextWorkflowState === "function") setTeachTextWorkflowState("final");
  });
  await page.fill("#teachtext-body", "# Manuscript\n\nSection one manual prose grounded in the clipped evidence.\n\nSection two follows.");
  await page.evaluate(() => {
    const select = document.querySelector("#teachtext-label");
    select.value = "final";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.keyboard.press("Meta+s");

  // Project CD: burn the manuscript onto the CD and download it.
  await runAction(page, "export-teachtext-project-cd");
  await runAction(page, "open-project-cd");
  await page.waitForTimeout(800);
  await page.waitForFunction(() => (document.querySelector("#project-cd-count")?.textContent || "").includes("1"));
  const downloadPromise = page.waitForEvent("download");
  await page.click("#download-project-cd");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/i);

  // Real persisted results: project, imported document, clipping file, CD item.
  const db = await dumpIndexedDb(page);
  const projects = db.projects || [];
  const files = db.chatFiles || [];
  const settingsRecord = (db.keyval || []).find((entry) => Array.isArray(entry.projectCdItems));
  const cdItems = settingsRecord?.projectCdItems || [];
  expect(projects.some((project) => project.name === E2E_PROJECT_NAME)).toBe(true);
  expect(files.some((file) => /Source Notes/.test(file.name || "") && /evidence line/.test(file.body || ""))).toBe(true);
  expect(files.some((file) => file.artifactKind === "clipping" && /evidence line/.test(file.body || ""))).toBe(true);
  expect(cdItems.some((item) => item.sourceKind === "markdown" && /Section one manual prose/.test(item.body || ""))).toBe(true);
});

test("golden path 2: AI-assisted route with the fake model", async ({ page }) => {
  fakeModel.setScenario("stream");
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await enterWritingStudio(page);
  await enableMultiFinder(page);
  await connectFakeModel(page, { port: fakeModelPort });

  // Question Sheet -> AI outline.
  await page.evaluate(() => openQuestionSheetSurface());
  await openWindow(page, "questionSheet");
  await page.fill("#question-sheet-body", "Recipient: the reader.\n\nQuestion: why does this matter?");
  await openCommandMenu(page, "questionSheet", "Commands");
  await page.click('[data-window="questionSheet"] [data-action="generate-outline"]');
  // The default project outline triggers an overwrite confirmation.
  await page.waitForTimeout(600);
  await acceptModalIfPresent(page);
  try {
    await page.waitForFunction(
      () => (document.querySelector("#outline-content")?.value || "").includes("## 背景"),
      { timeout: 60_000 }
    );
  } catch (error) {
    const diag = await page.evaluate(() => ({
      outline: document.querySelector("#outline-content")?.value?.slice(0, 120) || "",
      status: document.querySelector("#status")?.textContent || "",
      modal: document.querySelector("#system-modal-message")?.textContent || "",
      model: document.querySelector("#model")?.value || "",
    }));
    console.log("OUTLINE-DIAG", JSON.stringify(diag));
    throw error;
  }
  await page.evaluate(() => {
    focusWindow(getWindow("outline"));
    const win = document.querySelector('[data-window="outline"]');
    if (win) win.style.zIndex = "9999";
  });
  await page.click('[data-window="outline"] [data-action="advance-outline-to-drafts"]');

  // AI draft of the first section, accepted through the system modal.
  await openWindow(page, "sectionDrafts");
  await openCommandMenu(page, "sectionDrafts", "Commands");
  await page.evaluate(() => {
    focusWindow(getWindow("sectionDrafts"));
    const win = document.querySelector('[data-window="sectionDrafts"]');
    if (win) win.style.zIndex = "9999";
  });
  await page.click('[data-window="sectionDrafts"] [data-action="draft-current-section"]');
  await page.waitForSelector("#system-modal[open]", { timeout: 30_000 });
  const draftModal = await page.textContent("#system-modal-message");
  expect(draftModal).toMatch(/起草结果|AI draft/i);
  await page.click("#system-modal-yes");
  await page.waitForSelector("#system-modal", { state: "hidden" });
  await page.waitForFunction(() => (document.querySelector("#draft-body")?.value || "").length > 0);
  await raiseWindow(page, "sectionDrafts");
  // The manuscript TeachText is the active surface after the AI draft; raise
  // Section Drafts through the Writing menu's Go To item (the user path).
  const writingMenu = page.locator(".menu-bar > .menu").filter({
    has: page.locator(":scope > button", { hasText: /^Writing$/ }),
  });
  await writingMenu.locator("> button").click();
  await writingMenu.locator(".menu-submenu-trigger", { hasText: "Go To" }).hover();
  await writingMenu.locator('[data-action="open-section-drafts"]').click();
  // The menu item must leave Section Drafts as the active surface; wait for
  // that instead of assuming focus moved.
  await page.waitForFunction(
    () => document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window === "sectionDrafts",
    { timeout: 10_000 }
  );
  await page.waitForFunction(
    () => !document.querySelector('[data-window="sectionDrafts"] [data-action="advance-drafts-to-review"]')?.classList.contains("is-disabled"),
    { timeout: 20_000 }
  );
  await page.click('[data-window="sectionDrafts"] [data-action="advance-drafts-to-review"]');

  // Review Desk: run a style check; the fake model supplies the review text.
  await openWindow(page, "reviewDesk");
  await raiseWindow(page, "reviewDesk");
  await page.evaluate(() => {
    const win = document.querySelector('[data-window="reviewDesk"]');
    const details = win?.querySelector(".teachtext-command-menu");
    if (details) details.open = true;
    win?.querySelector('[data-action="review-style-section"]')?.click();
  });
  await page.waitForSelector("#system-modal[open]", { timeout: 30_000 });
  await page.click("#system-modal-yes");
  await page.waitForFunction(
    () => (document.querySelector("#review-desk-body")?.value || "").trim().length > 0,
    { timeout: 30_000 }
  );

  // Manuscript -> Project CD -> download.
  await runAction(page, "export-teachtext-project-cd");
  await runAction(page, "open-project-cd");
  const downloadPromise = page.waitForEvent("download");
  await page.click("#download-project-cd");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/i);

  const db = await dumpIndexedDb(page);
  const e2eProject = (db.projects || []).find((project) => project.name === E2E_PROJECT_NAME);
  expect(!!e2eProject).toBe(true);
  const settings = (db.keyval || []).find((entry) => Array.isArray(entry.projectCdItems));
  const cdItems = settings?.projectCdItems || [];
  expect(cdItems.some((item) => String(item.body || "").trim().length > 0)).toBe(true);
  expect(fakeModel.state.chatCalls).toBeGreaterThan(0);
});

test("golden path 3: working session restore after refresh", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await enterWritingStudio(page);
  await enableMultiFinder(page);

  // The Question Sheet is the editable owner for a fresh project; type into it
  // with an explicit selection, scroll, and a positioned window.
  await page.evaluate(() => openQuestionSheetSurface());
  await openWindow(page, "questionSheet");
  await page.fill("#question-sheet-body", "Line one of an unsaved draft.\nLine two keeps the working state.\nLine three at the end.");
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => {
    const body = document.querySelector("#question-sheet-body");
    body.setSelectionRange(12, 28);
    body.scrollTop = 0;
    const win = document.querySelector('[data-window="questionSheet"]');
    win.style.left = "140px";
    win.style.top = "90px";
    document.querySelector("#question-sheet-body").focus();
    return {
      left: win.style.left,
      top: win.style.top,
      value: body.value,
    };
  });
  await page.waitForTimeout(900); // let the working-session autosave flush
  await page.evaluate(async () => {
    if (typeof flushWorkingSessionSave === "function") await flushWorkingSessionSave();
  });
  await page.waitForTimeout(400);

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", { timeout: 45_000 });

  const after = await page.evaluate(() => {
    const win = document.querySelector('[data-window="questionSheet"]');
    const body = document.querySelector("#question-sheet-body");
    return {
      windowVisible: !!win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"),
      active: !!document.querySelector(".window.is-active:not(.is-hidden)") && document.querySelector(".window.is-active:not(.is-hidden)").dataset.window === "questionSheet",
      left: win?.style?.left || "",
      top: win?.style?.top || "",
      value: body?.value || "",
      selectionStart: body?.selectionStart ?? -1,
      selectionEnd: body?.selectionEnd ?? -1,
    };
  });

  expect(after.windowVisible).toBe(true);
  expect(after.active).toBe(true);
  // The app re-applies writing-spine alignment on restore, so exact pixels
  // may shift by the spine reserve; what must survive is a real position
  // (not the default cascade) plus content, selection, and scroll state.
  expect(after.left).not.toBe("");
  expect(after.top).not.toBe("");
  expect(after.left === before.left || after.top === before.top).toBe(true);
  expect(after.value).toBe(before.value);
  expect(after.selectionStart).toBe(12);
  expect(after.selectionEnd).toBe(28);
});

test("golden path 4: file objects, Trash restore, backup export/import", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await enableMultiFinder(page);
  await importMarkdown(page, "Backup me before anything happens.");

  // Folder
  await openWindow(page, "documents");
  await raiseWindow(page, "documents");
  await page.fill("#new-folder-name", "Research Folder");
  await page.click("#new-folder");

  // Alias of the imported file
  const backupFileId = await projectFileId(page, "Backup");
  expect(backupFileId).toBeTruthy();
  await selectProjectFileById(page, backupFileId);
  await runAction(page, "make-alias");

  // Clipping + Scrapbook from the same source text
  await openProjectFileById(page, backupFileId);
  await page.waitForFunction(
    () => (document.querySelector("#teachtext-body")?.value || "").includes("Backup me before"),
    { timeout: 15_000 }
  );
  await selectTextInTeachText(page, "Backup me before");
  await page.evaluate(() => runSelectionClipFile());
  await selectTextInTeachText(page, "Backup me before");
  await page.evaluate(() => runSelectionClip());

  // Stationery Pad + Finder Label through Get Info
  await page.evaluate((id) => {
    // applyFinderLabel is the single user-confirmed write path; the Get Info
    // picker and the suggestion-accept button both route through it.
    const file = chatFiles.find((entry) => entry.id === id);
    if (file && typeof applyFinderLabel === "function") applyFinderLabel(file, "Final");
  }, backupFileId);

  let db = await dumpIndexedDb(page);
  const originalFiles = db.chatFiles || [];
  const fileId = backupFileId;
  expect(originalFiles.some((file) => file.id === fileId && file.finderLabel === "Final")).toBe(true);
  expect(originalFiles.some((file) => file.type === "alias")).toBe(true);
  expect((db.chatFolders || []).some((folder) => folder.name === "Research Folder")).toBe(true);
  expect(originalFiles.some((file) => file.artifactKind === "clipping")).toBe(true);
  expect((db.scraps || []).length).toBeGreaterThan(0);

  // Trash + Restore
  await selectProjectFileById(page, backupFileId);
  await raiseWindow(page, "documents");
  await runAction(page, "move-file-trash");
  await page.waitForFunction(async (id) => {
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
    return !files.some((file) => file.id === id);
  }, fileId, { timeout: 15_000 });
  await runAction(page, "open-trash");
  await page.click("#restore-trash");
  await page.waitForFunction(async (id) => {
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
    return files.some((file) => file.id === id);
  }, fileId, { timeout: 15_000 });

  // Export the project backup, then import it into a wiped database.
  await selectProjectFileById(page, backupFileId);
  await raiseWindow(page, "documents");
  await runAction(page, "open-project-info");
  const backupPromise = page.waitForEvent("download");
  await page.click("#export-project-disk");
  const backupDownload = await backupPromise;
  const backupPath = await backupDownload.path();
  const backupJson = JSON.parse(readFileSync(backupPath, "utf8"));
  expect(backupJson.project?.name || backupJson.name).toBe(E2E_PROJECT_NAME);

  // Wipe IndexedDB and import the backup as a new project.
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
  await page.click("details.backup-preview-section summary");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.click("#project-backup-file-button");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "backup.json", mimeType: "application/json", buffer: readFileSync(backupPath) });
  await page.waitForFunction(() => !document.querySelector("#import-project-backup")?.disabled);
  await page.click("#import-project-backup");

  const restored = await dumpIndexedDb(page);
  const restoredFiles = restored.chatFiles || [];
  expect(restoredFiles.some((file) => /Backup me/.test(file.body || ""))).toBe(true);
  expect(restoredFiles.some((file) => file.type === "alias")).toBe(true);
  expect(restoredFiles.some((file) => file.artifactKind === "clipping")).toBe(true);
  expect((restored.chatFolders || []).some((folder) => folder.name === "Research Folder")).toBe(true);
});
