// Mobile E2E: the writing route on an iPhone-sized WebKit viewport, plus
// MultiFinder app switching on touch. This spec runs only under the
// iphone-webkit project (see playwright.config.mjs) so the phone flow never
// shares a worker with the heavy desktop specs.
//
// Route covered: boot -> create project -> Writing Studio -> Question Sheet
// -> Outline -> save -> refresh -> restore. (The Section Drafts editor stays
// behind the full-screen manuscript surface on this phone layout, and phones
// present apps full-screen in both Finder and MultiFinder, so the desktop
// journeys cover Draft -> Review -> CD and the MultiFinder switch.)

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

async function surfaceCommand(page, windowName, action) {
  await page.click(`[data-window="${windowName}"] .teachtext-command-menu summary`);
  await page.click(`[data-window="${windowName}"] [data-action="${action}"]`);
}

test("mobile: writing route survives a refresh on an iPhone viewport", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);

  // Writing Studio opens the studio workspace on mobile.
  await runAction(page, "open-writing-studio");
  await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing");

  await openWindow(page, "questionSheet");
  await page.fill("#question-sheet-body", "Mobile recipient question.");
  await runAction(page, "advance-question-to-outline");
  await runAction(page, "open-outline");
  await page.fill("#outline-content", "## Mobile Section");

  // Explicit save through the same handler the File menu invokes, then let
  // the working session flush.
  await runAction(page, "save-current");
  await page.waitForTimeout(1400);

  // Refresh: the working session must restore the same writing surface.
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", { timeout: 45_000 });
  await page.waitForFunction(
    () => (document.querySelector("#outline-content")?.value || document.querySelector("#teachtext-body")?.value || "")
      .includes("## Mobile Section"),
    { timeout: 20_000 }
  );

  const db = await dumpIndexedDb(page);
  expect((db.projects || []).some((project) => project.name === E2E_PROJECT_NAME)).toBe(true);
  expect(
    (db.projects || []).some((project) => String(project.outline || "").includes("## Mobile Section"))
    || (db.keyval || []).some((entry) => Array.isArray(entry) && JSON.stringify(entry).includes("## Mobile Section"))
  ).toBe(true);
});
