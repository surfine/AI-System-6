// Opening a project file in a real browser, through the shared entry every
// surface now uses: the Finder row opens the document, and an id that is no
// longer in the project is refused with a reason instead of opening an empty
// window.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, importMarkdown } from "./helpers.mjs";

test("file open: the Finder row opens through the shared entry, and a stale id is refused", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Open Entry Project");
  await importMarkdown(page, "# Shared entry\n\nThis document opens through one entry.");

  const fileId = await page.evaluate(() => {
    const file = chatFiles.find((entry) => String(entry.name || "").includes("Shared entry"))
      || chatFiles.find((entry) => String(entry.body || "").includes("Shared entry"));
    return file?.id || "";
  });
  expect(fileId).not.toBe("");

  const opened = await page.evaluate((id) => window.AISystem6ApplicationRegistry.openProjectObject(id, "open")
    .then((result) => ({ ok: result.ok === true, reason: result.reason || "" })), fileId);
  expect(opened.ok).toBe(true);

  // The same entry, on an id that is not in this project any more.
  const refused = await page.evaluate(async () => {
    const result = await window.AISystem6ApplicationRegistry.openProjectObject("file-that-is-gone", "open");
    return { ok: result.ok === true, reason: result.reason || "" };
  });
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe("missing");

  // Availability agrees before anything runs.
  const availability = await page.evaluate((id) => ({
    present: window.AISystem6ApplicationRegistry.applicationObjectAvailability(id, "open").available,
    missing: window.AISystem6ApplicationRegistry.applicationObjectAvailability("file-that-is-gone", "open").available,
  }), fileId);
  expect(availability.present).toBe(true);
  expect(availability.missing).toBe(false);
});
