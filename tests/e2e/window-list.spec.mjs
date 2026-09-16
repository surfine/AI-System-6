// Walking the application's own windows, in a real desk: ⌘` moves between the
// open windows of the application in front, ⇧⌘` goes back, the status line
// names what you landed on, and with fewer than two windows the key says which
// case it is instead of moving nothing in silence.
//
// The Apple menu is checked here too, because this is the boundary that matters:
// it keeps the desk accessories (System 6) and MultiFinder's applications, and
// it is not a window list.

import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide } from "./helpers.mjs";

test("⌘` walks the windows of the application in front, and the Apple menu stays out of it", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);

  // Three windows of one application. They are Finder's own windows on purpose:
  // a desk accessory does not own the menu bar here, so its windows are not
  // what ⌘` walks (the Apple menu's DA rows are the way back to those).
  for (const name of ["applications", "trash", "documents"]) {
    await page.evaluate((windowName) => openWindow(windowName), name);
  }
  for (const name of ["applications", "trash", "documents"]) {
    await expect
      .poll(async () => page.evaluate((windowName) => getWindow(windowName).classList.contains("is-hidden"), name))
      .toBe(false);
  }

  const front = () => page.evaluate(() => document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "");
  const appWindows = () => page.evaluate(() => ({
    appId: menuOwnerAppId,
    windows: visibleWindowsForApp(menuOwnerAppId).map((win) => win.dataset.window),
  }));
  const statusText = () => page.textContent("#status");

  const before = await appWindows();
  expect(before.windows.length).toBeGreaterThan(1);
  expect(before.windows).toContain((await front()));

  // ⌘` walks the application's windows, front-most first.
  const startedAt = await front();
  await page.keyboard.press("Meta+Backquote");
  await expect.poll(front).not.toBe(startedAt);
  expect(before.windows).toContain(await front());
  await expect.poll(statusText).toContain("Front window");

  // ⇧⌘` walks back to the one it came from.
  await page.keyboard.press("Meta+Shift+Backquote");
  await expect.poll(front).toBe(startedAt);

  // The Apple menu carries no window list: it is where the desk keeps its desk
  // accessories, and (in MultiFinder mode) the open applications.
  const appleMenu = await page.evaluate(() => {
    const section = document.querySelector("#apple-multifinder-apps");
    return {
      windowRows: section?.querySelectorAll("[data-window-focus-choice], [data-action^='focus-window:']").length ?? 0,
      windowMenuItems: document.querySelectorAll('[data-menu-id="window"]').length,
    };
  });
  expect(appleMenu.windowRows).toBe(0);
  expect(appleMenu.windowMenuItems).toBe(0);

  // One window left means there is nothing to walk to, and the key says so.
  for (const name of ["applications", "documents"]) {
    await page.evaluate((windowName) => closeWindow(windowName), name);
  }
  await expect
    .poll(async () => page.evaluate(() => visibleWindowsForApp(menuOwnerAppId).length))
    .toBeLessThan(2);
  await page.keyboard.press("Meta+Backquote");
  await expect.poll(statusText).toMatch(/one window|no windows/i);
});
