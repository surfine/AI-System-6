import { test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, openWindow } from "./helpers.mjs";

// What the two pilots cost to open, measured the way a user pays it: the
// requests the first open of each one makes, and how long it takes.
test("probe: the first open of each pilot", async ({ page }) => {
  test.setTimeout(180_000);
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Pilot Cost");

  const measure = async (name, opener) => {
    await page.evaluate(() => { performance.clearResourceTimings(); });
    const started = Date.now();
    await opener();
    await page.waitForTimeout(1200);
    const entries = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter((entry) => /clio-paint|translation-pad|control-strip|styles\.[a-z-]+\.css/.test(entry.name))
      .map((entry) => ({
        name: entry.name.split("/").pop(),
        bytes: entry.transferSize || entry.decodedBodySize || 0,
        ms: Math.round(entry.duration),
      })));
    return { name, wallMs: Date.now() - started, entries };
  };

  const clio = await measure("clioPaint", async () => { await openWindow(page, "clioPaint"); });
  const pad = await measure("translationPad", async () => { await openWindow(page, "translationPad"); });
  console.log("PILOT-COST", JSON.stringify({ clio, pad }, null, 2));
});
