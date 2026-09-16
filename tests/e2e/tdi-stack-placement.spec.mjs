// The compact document stack's menu is anchored to a <details> in the window's
// status bar, and the stack host sits near the window's leading edge. A 340px
// menu anchored to a control that close to the edge hangs over it, and the
// window's own `overflow: hidden` then cuts the left half of every row: the
// titles lose their first characters and the rows lose their left border. The
// app already nudges command menus back inside their clip region; the stack
// menu takes the same path now.
//
// The state is injected because building three documents through the writing
// route costs minutes per run while the placement contract lives entirely in
// the markup the renderer produces (details.tdi-document-stack > summary +
// .tdi-stack-popover). The window, the status bar, the CSS and the placement
// path are the app's own.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, openWindow } from "./helpers.mjs";

async function injectDocumentStack(page) {
  await page.evaluate(() => {
    const host = document.querySelector('[data-tdi-stack-for="teachtext-tabs"]');
    host.classList.remove("is-hidden");
    const titles = ["未命名", "未命名 2", "未命名 3"];
    host.innerHTML = `
      <details class="tdi-document-stack">
        <summary class="btn tdi-stack-summary">
          <span class="tdi-stack-active-copy">• ${titles[0]}</span>
          <span class="tdi-stack-count">${titles.length}</span>
          <span class="tdi-stack-disclosure" aria-hidden="true"></span>
        </summary>
        <div class="tdi-stack-popover" role="menu">
          ${titles.map((title, index) => `
            <div class="tdi-stack-item${index === 0 ? " is-active" : ""}">
              <button type="button" class="tdi-stack-open"><span>${title}</span></button>
              <button type="button" class="tdi-stack-close" aria-label="Close">×</button>
            </div>`).join("")}
        </div>
      </details>`;
  });
}

test("the document stack's menu stays inside the window it belongs to", async ({ page }) => {
  // A phone-width window is the case that exposed this: the stack host sits
  // against the leading edge and the menu is wider than the space left of it.
  await page.setViewportSize({ width: 390, height: 844 });
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Stack Placement");
  await openWindow(page, "teachText");
  // The desk repaints the window chrome as the project settles, and a repaint
  // rebuilds the stack host: re-inject and re-open until the menu is standing
  // open under the app's own placement, then read it.
  const readPlacement = () => page.evaluate(() => {
    const popover = document.querySelector(".tdi-stack-popover");
    const details = document.querySelector(".tdi-document-stack");
    if (!popover || !details?.open) return null;
    const win = document.querySelector('[data-window="teachText"]');
    const popoverRect = popover.getBoundingClientRect();
    const windowRect = win.getBoundingClientRect();
    return {
      translate: getComputedStyle(popover).translate,
      popover: { left: popoverRect.left, right: popoverRect.right },
      window: { left: windowRect.left, right: windowRect.right },
      items: [...popover.querySelectorAll(".tdi-stack-item")].map((item) => {
        const label = item.querySelector(".tdi-stack-open span").getBoundingClientRect();
        return {
          text: item.querySelector(".tdi-stack-open span").textContent,
          labelLeft: label.left,
          labelRight: label.right,
        };
      }),
    };
  });
  let placement = null;
  await expect.poll(async () => {
    if (!await readPlacement()) {
      await injectDocumentStack(page);
      await page.click('[data-tdi-stack-for="teachtext-tabs"] .tdi-stack-summary');
    }
    placement = await readPlacement();
    return Boolean(placement && placement.items.length === 3);
  }, { timeout: 15_000, intervals: [100, 200, 400] }).toBe(true);

  // The menu is inside the window's clip region, so no row is cut ...
  expect(placement.popover.left).toBeGreaterThanOrEqual(placement.window.left - 1);
  expect(placement.popover.right).toBeLessThanOrEqual(placement.window.right + 1);
  // ... and that came from the shared placement path, not from luck.
  expect(placement.translate).not.toBe("none");
  // Every title is readable: nothing of it lies outside the menu's own box.
  for (const item of placement.items) {
    expect(item.labelLeft).toBeGreaterThanOrEqual(placement.popover.left - 1);
    expect(item.labelRight).toBeLessThanOrEqual(placement.popover.right + 1);
  }
  expect(placement.items.map((item) => item.text)).toEqual(["未命名", "未命名 2", "未命名 3"]);
});
