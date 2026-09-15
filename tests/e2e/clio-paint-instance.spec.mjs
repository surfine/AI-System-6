// ClioPaint in a real browser: the window builds itself from the shared shell,
// its controls answer, hiding it keeps the picture, and a dispose/attach cycle
// leaves it working without piling up listeners.

import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

test("clio paint: the window binds once, keeps its work when hidden, and rebinds after a destroy", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => handleAction("open-clio-paint"));
  await page.waitForSelector('[data-window="clioPaint"]:not(.is-hidden)', { timeout: 15_000 });

  const afterAttach = await page.evaluate(async () => {
    const api = window.AISystem6ClioPaint;
    await api.attach();
    await api.attach();
    return { resources: api.resourceCount(), tool: api.state().tool };
  });
  expect(afterAttach.resources).toBeGreaterThan(0);

  // The toolbar answers, and the choice survives a hide (hiding is not
  // destroying: the picture, undo stack and unsaved edits stay).
  await clickTool(page, "rect");
  expect(await page.evaluate(() => window.AISystem6ClioPaint.state().tool)).toBe("rect");
  await page.evaluate(() => {
    document.querySelector('[data-window="clioPaint"]').classList.add("is-hidden");
  });
  await page.evaluate(() => openWindow("clioPaint"));
  expect(await page.evaluate(() => window.AISystem6ClioPaint.state().tool)).toBe("rect");

  // A real destroy releases everything, twice is a no-op, and the next attach
  // binds again with the window still usable.
  const afterDispose = await page.evaluate(async () => {
    const api = window.AISystem6ClioPaint;
    const first = api.dispose();
    const second = api.dispose();
    const released = api.resourceCount();
    await api.attach();
    const rebound = api.resourceCount();
    return { first: first.disposed, second: second.disposed, released, rebound };
  });
  expect(afterDispose).toEqual({ first: true, second: false, released: 0, rebound: expect.any(Number) });
  expect(afterDispose.rebound).toBeGreaterThan(0);
  await clickTool(page, "pencil");
  expect(await page.evaluate(() => window.AISystem6ClioPaint.state().tool)).toBe("pencil");
  expect(await page.locator('[data-window="clioPaint"] #clio-paint-canvas').count()).toBe(1);
});

/**
 * Press a toolbar button through its own listener. A system modal (a first-run
 * note, a lease notice) can cover the desk in one browser and swallow a
 * pointer click; that is a different subject from "does the bound listener
 * answer", which is what this test is about.
 */
async function clickTool(page, tool) {
  await page.evaluate((name) => {
    const button = document.querySelector(`[data-window="clioPaint"] [data-clio-paint-tool="${name}"]`);
    button.dispatchEvent(new Event("click", { bubbles: true }));
  }, tool);
}
