// The dictation button belongs to the field it floats beside, and that field
// can live inside a native <dialog> - naming a new Project Hard Disk is the
// everyday case. A dialog opened with showModal() sits in the top layer, where
// no z-index reaches, so a fixed button at its own layer painted *behind* the
// window whose own input placed it: half of it disappeared under the dialog's
// edge. The button now rides the top layer as a manual popover, the way
// balloon help does, so it draws whole.
//
// What this spec does not claim: while a modal dialog is open the platform
// owns the pointer (everything outside the dialog is inert), so the button is
// drawn above it but not clickable through it. Letting a writer dictate into a
// modal sheet's own field is a separate decision about that sheet's modality.

import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide } from "./helpers.mjs";

test("the dictation button floats above the dialog whose field it is for", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);

  await page.evaluate(() => handleAction("new-project-disk"));
  await expect(page.locator("#new-project-disk-modal")).toBeVisible();
  await expect(page.locator("#new-project-disk-name")).toBeFocused();

  const button = page.locator("#dictation-field-button");
  await expect(button).toBeVisible();

  const state = await page.evaluate(() => {
    const element = document.querySelector("#dictation-field-button");
    const rect = element.getBoundingClientRect();
    return {
      label: element.textContent.trim(),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      inTopLayer: element.matches(":popover-open"),
      // Top-layer paint order is promotion order, so the button must be the
      // last entry: that is what puts it above the dialog it is placed for.
      paintOrder: [...document.querySelectorAll("dialog[open], [popover]:popover-open")]
        .map((entry) => entry.id || entry.tagName),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      activeElement: document.activeElement?.id || "",
      dialogOpen: document.querySelector("#new-project-disk-modal").open,
    };
  });

  expect(state.label.length).toBeGreaterThan(0);
  expect(state.inTopLayer).toBe(true);
  expect(state.paintOrder.at(-1)).toBe("dictation-field-button");
  expect(state.paintOrder).toContain("new-project-disk-modal");
  expect(state.dialogOpen).toBe(true);
  // Showing the control must not take the caret out of the field: a manual
  // popover is shown without moving focus.
  expect(state.activeElement).toBe("new-project-disk-name");
  // Whole and in the window: nothing of it hangs under the dialog's edge or
  // off the viewport, which is what the report showed.
  expect(state.rect.width).toBeGreaterThan(40);
  expect(state.rect.height).toBeGreaterThan(0);
  expect(state.rect.left).toBeGreaterThanOrEqual(0);
  expect(state.rect.top).toBeGreaterThanOrEqual(0);
  expect(state.rect.left + state.rect.width).toBeLessThanOrEqual(state.viewport.width);
  expect(state.rect.top + state.rect.height).toBeLessThanOrEqual(state.viewport.height);
});
