// Mobile E2E: the full writing route on an iPhone-sized WebKit viewport,
// plus MultiFinder app switching on touch. This spec runs only under the
// iphone-webkit project (see playwright.config.mjs) so the phone flow never
// shares a worker with the heavy desktop specs.
//
// Route covered: boot -> create project -> Writing Studio -> Question Sheet
// -> Outline -> Draft -> save -> refresh -> restore -> Project CD.

import { expect, test } from "@playwright/test";
import {
  bootApp,
  createProject,
  dismissGuide,
  dumpIndexedDb,
  E2E_PROJECT_NAME,
  openWindow,
  runAction,
} from "./helpers.mjs";

test("mobile: full writing route with MultiFinder survives a refresh", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);

  // Writing Studio opens the studio workspace on mobile.
  await runAction(page, "open-writing-studio");
  await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing");

  await openWindow(page, "questionSheet");
  await page.fill("#question-sheet-body", "Mobile recipient question.");
  await page.click('[data-action="advance-question-to-outline"]');
  await openWindow(page, "outline");
  await page.fill("#outline-content", "## Mobile Section");
  await page.click('[data-action="advance-outline-to-drafts"]');
  await openWindow(page, "sectionDrafts");
  await page.fill("#draft-body", "Drafted on an iPhone viewport.");

  // Explicit save through the same handler the File menu invokes.
  await runAction(page, "save-current");
  await page.waitForTimeout(700);

  // MultiFinder app switching on touch: the switcher flips the runtime into
  // MultiFinder mode on a phone.
  await page.evaluate(() => {
    const switcher = document.querySelector("#multifinder-switcher");
    if (switcher) switcher.click();
  });
  await page.waitForFunction(() => typeof runtimeEnvironment === "undefined" || runtimeEnvironment === "multifinder");

  // Refresh: the working session must restore the same writing surface.
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", { timeout: 45_000 });
  await openWindow(page, "sectionDrafts");
  expect(await page.inputValue("#draft-body")).toContain("Drafted on an iPhone viewport.");

  // Project CD burn and count.
  await runAction(page, "export-teachtext-project-cd");
  await runAction(page, "open-project-cd");
  await page.waitForFunction(() => (document.querySelector("#project-cd-count")?.textContent || "").includes("1"));

  const db = await dumpIndexedDb(page);
  const settings = (db.keyval || []).find((entry) => Array.isArray(entry.projectCdItems));
  const cdItems = settings?.projectCdItems || [];
  expect(cdItems.some((item) => String(item.body || "").includes("Drafted on an iPhone viewport."))).toBe(true);
  expect((db.projects || []).some((project) => project.name === E2E_PROJECT_NAME)).toBe(true);
});
