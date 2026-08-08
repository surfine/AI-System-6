// Black-box mobile user journey: the full writing route on iPhone WebKit
// driven ONLY through real UI — taps, clicks, fills, keyboard, file chooser,
// menus, and real buttons. No product-internal JS API (no runAction, no
// openWindow, no page.evaluate with internal functions). IndexedDB is only
// read in the final assertion phase.

import { expect, test } from "@playwright/test";
import {
  bootApp,
  dumpIndexedDb,
  E2E_PROJECT_NAME,
} from "./helpers.mjs";

async function realClose(page, windowName) {
  const win = await page.$(`[data-window="${windowName}"]:not(.is-hidden)`);
  if (win) {
    await page.click(`[data-window="${windowName}"] .close-box`);
    await page.waitForTimeout(400);
  }
}

async function realAdvance(page, windowName, action, { settle = false } = {}) {
  if (settle) {
    await page.waitForSelector(`[data-window="${windowName}"] [data-action="${action}"]`, { state: "visible", timeout: 15_000 });
  }
  // Raise the surface like a user would, then wait until its route button is
  // really enabled (menu state follows the active window) before clicking.
  await page.click(`[data-window="${windowName}"] .title-bar`).catch(() => {});
  await page.waitForFunction(
    ([win, act]) => {
      const el = document.querySelector(`[data-window="${win}"] [data-action="${act}"]`);
      return !!el && !el.classList.contains("is-disabled") && (el.offsetWidth || el.offsetHeight);
    },
    [windowName, action],
    { timeout: 15_000 }
  );
  await page.click(`[data-window="${windowName}"] [data-action="${action}"]`);
}

test("mobile journey: a first-time phone user completes the whole route and downloads", async ({ page }) => {
  await bootApp(page);
  await page.click('[data-action="dismiss-guide"]');

  // Create a Project Hard Disk through the menu-bar switcher.
  await page.click("#project-switcher-button");
  await page.click('#project-switcher-popover [data-action="new-project-disk"]');
  await page.fill("#new-project-disk-name", E2E_PROJECT_NAME);
  await page.click("#new-project-disk-confirm");
  await page.waitForSelector("#new-project-disk-modal", { state: "hidden" });

  // Import a source through the Project Hard Disk window's Add… chooser.
  // Phone desktop icons select on a single tap and open on a double tap.
  await realClose(page, "projects");
  await page.dblclick("#active-project-drop-target");
  await page.waitForSelector('[data-window="projects"]:not(.is-hidden)');
  await page.click('[data-window="projects"] [data-action="open-import-utility"]');
  await page.waitForSelector('[data-window="importUtility"]:not(.is-hidden)');
  const chooserPromise = page.waitForEvent("filechooser");
  await page.click("#import-files-button");
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Source Notes\n\nThis is the evidence line that matters.\n\nSecond sentence stays too.", "utf8"),
  });
  await page.waitForFunction(
    () => /Source Notes|notes\.md|preview/i.test(document.querySelector("#import-preview")?.textContent || ""),
    { timeout: 20_000 }
  );
  await page.click("#import-documents");
  await page.waitForFunction(() => {
    const status = document.querySelector("#import-status")?.textContent || "";
    return /saved|written|record|完成|imported|已写入|成功|写进/i.test(status);
  }, { timeout: 20_000 });

  // Open the imported document and clip a passage through the Edit menu.
  await page.waitForSelector("#document-icon-grid [data-document-item-type='folder']", { timeout: 10_000 });
  const folderId = await page.getAttribute("#document-icon-grid [data-document-item-type='folder']", "data-document-item-id");
  await page.dblclick(`#document-icon-grid [data-document-item-id="${folderId}"]`);
  await page.waitForSelector("#document-icon-grid [data-document-item-type='file']", { timeout: 10_000 });
  const fileId = await page.getAttribute("#document-icon-grid [data-document-item-type='file']", "data-document-item-id");
  await page.dblclick(`#document-icon-grid [data-document-item-id="${fileId}"]`);
  await page.waitForSelector('[data-window="teachText"]:not(.is-hidden)', { timeout: 10_000 });
  await page.click("#teachtext-body");
  await page.keyboard.press("Meta+a");
  const editMenu = page.locator(".menu-bar > .menu").filter({ has: page.locator(":scope > button", { hasText: /^Edit$/ }) });
  await editMenu.locator("> button").click();
  await editMenu.locator('[data-action="selection-clip-file"]').click();
  await page.waitForFunction(
    () => /clipped|已剪|已保存|clip/i.test(document.querySelector("#status")?.textContent || ""),
    { timeout: 15_000 }
  );

  // Close the whole app stack with real close boxes (the phone shell keeps
  // one foreground app, so each close returns to the previous one) until the
  // Finder launcher shows, then double-tap the Writing Studio icon.
  for (let i = 0; i < 6; i += 1) {
    const openWin = page.locator(".window:not(.is-hidden)").first();
    if (!(await openWin.count())) break;
    const name = await openWin.getAttribute("data-window");
    if (!name) break;
    await page.click(`[data-window="${name}"] .close-box`);
    await page.waitForTimeout(400);
  }
  await page.waitForSelector("#finder-writing-studio-toggle", { state: "visible", timeout: 10_000 });
  await page.dblclick("#finder-writing-studio-toggle");
  await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing", { timeout: 15_000 });

  // Question Sheet -> Outline -> Section Drafts.
  await page.fill("#question-sheet-body", "Recipient: the reader.\n\nQuestion: does the evidence support the claim?");
  await realAdvance(page, "questionSheet", "advance-question-to-outline", { settle: true });
  await page.waitForSelector('[data-window="outline"]:not(.is-hidden)', { timeout: 15_000 });
  await page.fill("#outline-content", "## Section One\n\n## Section Two");
  await realAdvance(page, "outline", "advance-outline-to-drafts");
  await page.waitForSelector('[data-window="sectionDrafts"]:not(.is-hidden)', { timeout: 15_000 });
  await page.fill("#draft-body", "Mobile prose grounded in the clipped evidence.");
  await realAdvance(page, "sectionDrafts", "advance-drafts-to-review");
  // The drafts-to-review transition lands on the FINALIZED manuscript.
  await page.waitForSelector('[data-window="teachText"]:not(.is-hidden)', { timeout: 10_000 });
  const finalModal = page.locator("#system-modal[open]");
  if (await finalModal.count()) {
    await page.click("#system-modal-yes");
    await page.waitForSelector("#system-modal", { state: "hidden", timeout: 10_000 });
  }
  await page.waitForFunction(
    () => typeof document.querySelector("#teachtext-body")?.value === "string",
    { timeout: 10_000 }
  );
  await page.fill("#teachtext-body", "# Manuscript\n\nMobile manuscript prose grounded in the clipped evidence.");
  await page.keyboard.press("Meta+s");

  // Project CD: burn (real button) — the CD window opens, then download.
  await page.click("#teachtext-body");
  await page.waitForTimeout(400);
  const fileMenu = page.locator(".menu-bar > .menu").filter({ has: page.locator(":scope > button", { hasText: /^File$/ }) });
  await fileMenu.locator("> button").click();
  await fileMenu.locator(".menu-submenu-trigger", { hasText: "Export" }).hover();
  await fileMenu.locator('[data-action="export-teachtext-project-cd"]').click();
  await page.waitForSelector('[data-window="projectCd"]:not(.is-hidden)', { timeout: 15_000 });
  await page.waitForFunction(() => (document.querySelector("#project-cd-count")?.textContent || "").includes("1"), { timeout: 15_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.click("#download-project-cd");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/i);

  // Reload: project, clipping, manuscript, and CD item persist.
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", { timeout: 45_000 });
  const db = await dumpIndexedDb(page);
  expect((db.projects || []).some((project) => project.name === E2E_PROJECT_NAME)).toBe(true);
  expect((db.chatFiles || []).some((file) => file.artifactKind === "clipping")).toBe(true);
  expect((db.chatFiles || []).some((file) => /Manuscript/.test(file.body || ""))).toBe(true);
  expect((db.keyval || []).some((entry) => Array.isArray(entry.projectCdItems) && entry.projectCdItems.length > 0)).toBe(true);
});
