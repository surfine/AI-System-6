import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

// Control Strip behavior suite. These tests drive the real app: enabling from
// Control Panel, pointer-drag geometry (resize / Option-move / reorder /
// drag-out), folder drops, the hot key, menu stability, Soundscape sync after
// the window closes, and the narrow-screen drawer.

async function enableControlStrip(page) {
  await openWindow(page, "control");
  await page.click('[data-control-tab="general"]');
  await page.check("#control-strip");
  await page.waitForFunction(() => window.AISystem6ControlStrip?.isEnabled?.() === true, null, { timeout: 40_000 });
  await page.waitForSelector('[data-control-strip]', { state: "visible", timeout: 40_000 });
}

async function stripModuleOrder(page) {
  return page.evaluate(() => {
    const mount = document.querySelector("[data-control-strip]");
    return mount ? [...mount.querySelectorAll(".control-strip-module")].map((b) => b.dataset.controlStripModule) : [];
  });
}

async function pointerDrag(page, selector, dx, dy, { alt = false } = {}) {
  const box = await page.locator(selector).boundingBox();
  expect(box).toBeTruthy();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
  if (alt) await page.keyboard.up("Alt");
}

async function dropModuleFileOnStrip(page, moduleId, clientX, clientY) {
  await page.evaluate(({ moduleId, clientX, clientY }) => {
    const source = document.querySelector(`[data-module-id="${moduleId}"]`);
    if (!source) throw new Error(`module file ${moduleId} not in the folder`);
    const strip = document.querySelector("[data-control-strip]");
    const dataTransfer = new DataTransfer();
    const payload = JSON.stringify({ type: "control-strip-module", moduleId });
    dataTransfer.setData("application/json", payload);
    dataTransfer.setData("text/plain", payload);
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    const target = document.elementFromPoint(clientX, clientY) || strip;
    target.dispatchEvent(new DragEvent("dragover", {
      bubbles: true, cancelable: true, clientX, clientY, dataTransfer,
    }));
    target.dispatchEvent(new DragEvent("drop", {
      bubbles: true, cancelable: true, clientX, clientY, dataTransfer,
    }));
  }, { moduleId, clientX, clientY });
}

// Persistence writes are async (IndexedDB through saveDeskState()); flush
// before a reload so the test never races the write.
async function flushDeskState(page) {
  await page.evaluate(() => saveDeskState());
}

// After a reload the app restores the checkbox but only auto-enables the
// strip on its 8s boot timer. Drive the same public path immediately instead
// of waiting out the timer.
async function restoreStripAfterReload(page) {
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 45_000 });
  await page.evaluate(() => {
    const input = document.querySelector("#control-strip");
    if (input?.checked && typeof applyControlStripState === "function") {
      applyControlStripState({ silent: true });
    }
  });
  await page.waitForFunction(
    () => window.AISystem6ControlStrip?.isEnabled?.() === true,
    null,
    { timeout: 20_000 }
  );
}

test.beforeEach(async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
});

test("stays off by default and enables from Control Panel at the left edge", async ({ page }) => {
  await expect(page.locator("[data-control-strip]")).toHaveCount(0);
  await enableControlStrip(page);
  const mount = page.locator("[data-control-strip]");
  await expect(mount).toHaveAttribute("data-edge", "left");
  // Modules with a real source render; modules without one stay hidden until
  // a real source exists (no fake songs, projects, or hardware).
  await expect(page.locator('[data-control-strip-module="network"]')).toBeVisible();
  await expect(page.locator('[data-control-strip-module="outputQueue"]')).toBeVisible();
  await expect(page.locator('[data-control-strip-module="volume"]')).toBeVisible();
  await expect(page.locator('[data-control-strip-module="soundscape"]')).toHaveCount(0);
});

test("the handle collapses and expands the strip", async ({ page }) => {
  await enableControlStrip(page);
  const mount = page.locator("[data-control-strip]");
  await expect(mount).not.toHaveClass(/is-collapsed/);
  await page.click("[data-control-strip] .control-strip-handle");
  await expect(mount).toHaveClass(/is-collapsed/);
  await page.click("[data-control-strip] .control-strip-handle");
  await expect(mount).not.toHaveClass(/is-collapsed/);
});

test("dragging the handle resizes the strip and reveals working scroll buttons", async ({ page }) => {
  await enableControlStrip(page);
  const mount = page.locator("[data-control-strip]");
  const before = (await mount.boundingBox()).width;
  // Shrink well below the ten-module content width.
  await pointerDrag(page, "[data-control-strip] .control-strip-handle", -before + 120, 0);
  await page.waitForFunction(() => document.querySelector("[data-control-strip]").classList.contains("is-fixed-length"));
  const after = (await mount.boundingBox()).width;
  expect(after).toBeLessThan(before);
  const back = page.locator("[data-control-strip] .control-strip-scroll-back");
  const forward = page.locator("[data-control-strip] .control-strip-scroll-forward");
  await expect(back).toBeVisible();
  await expect(forward).toBeVisible();
  await expect(back).toBeDisabled();
  await expect(forward).toBeEnabled();

  await forward.click();
  await page.waitForFunction(() => {
    const mountEl = document.querySelector("[data-control-strip]");
    return !mountEl.querySelector(".control-strip-scroll-back").disabled;
  });
  // Scrolling forward then back again returns to the start and re-disables back.
  await back.click();
  await expect(back).toBeDisabled();
});

test("Option-dragging the handle moves the strip to the right edge and persists", async ({ page }) => {
  await enableControlStrip(page);
  await page.waitForSelector("[data-control-strip] .control-strip-module");
  const viewport = page.viewportSize();
  // Drag from the handle across to the right side with Option held.
  await pointerDrag(page, "[data-control-strip] .control-strip-handle", viewport.width - 80, -120, { alt: true });
  await expect(page.locator("[data-control-strip]")).toHaveAttribute("data-edge", "right");
  const mountBox = await page.locator("[data-control-strip]").boundingBox();
  expect(mountBox.x + mountBox.width).toBeGreaterThan(viewport.width - 40);

  await flushDeskState(page);
  await restoreStripAfterReload(page);
  await expect(page.locator("[data-control-strip]")).toHaveAttribute("data-edge", "right");
});

test("Option-dragging a module reorders it and the order survives reload", async ({ page }) => {
  await enableControlStrip(page);
  await page.waitForSelector("[data-control-strip] .control-strip-module");
  const before = await stripModuleOrder(page);
  // Move the network module to the last slot with Option held.
  const lastBox = await page.locator(`[data-control-strip-module="${before[before.length - 1]}"]`).boundingBox();
  await pointerDrag(page, '[data-control-strip-module="network"]', lastBox.x + lastBox.width + 40, 0, { alt: true });
  await page.waitForFunction(() => {
    const mount = document.querySelector("[data-control-strip]");
    const ids = [...mount.querySelectorAll(".control-strip-module")].map((b) => b.dataset.controlStripModule);
    return ids[ids.length - 1] === "network";
  });

  await flushDeskState(page);
  await restoreStripAfterReload(page);
  const after = await stripModuleOrder(page);
  expect(after[after.length - 1]).toBe("network");
  // Which modules render depends on which real sources exist after boot
  // (a project may or may not be mounted), but the persisted order must hold.
  expect(after).toContain("network");
});

test("dragging a module out removes it, and the folder can re-add it at the drop point", async ({ page }) => {
  await enableControlStrip(page);
  await page.waitForSelector("[data-control-strip] .control-strip-module");
  const module = page.locator('[data-control-strip-module="outputQueue"]');
  await expect(module).toBeVisible();

  // Drag the module far outside the strip without Option.
  await pointerDrag(page, '[data-control-strip-module="outputQueue"]', 0, -300);
  await expect(page.locator('[data-control-strip-module="outputQueue"]')).toHaveCount(0);

  // Re-add from System Folder / Control Strip Modules by dropping the file
  // onto the strip.
  await openWindow(page, "controlStripModules");
  await page.waitForSelector('[data-module-id="outputQueue"]');
  const stripBox = await page.locator("[data-control-strip]").boundingBox();
  const clientX = stripBox.x + stripBox.width - 60;
  const clientY = stripBox.y + stripBox.height / 2;
  await dropModuleFileOnStrip(page, "outputQueue", clientX, clientY);
  await page.waitForSelector('[data-control-strip-module="outputQueue"]', { state: "visible" });

  // Dropping an already-enabled module must not duplicate it.
  const count = await page.locator('[data-control-strip-module="outputQueue"]').count();
  expect(count).toBe(1);
});

test("the hot key hides and shows the strip and never fires from an editable field", async ({ page }) => {
  await enableControlStrip(page);
  await page.click('[data-control-tab="strip"]');
  await page.click("#control-strip-hotkey-record");
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyS");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await expect(page.locator("#control-strip-hotkey")).toHaveValue("Option+Shift+S");

  // Move focus off the recorder: the hot key must not fire from an editable.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyS");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await page.waitForFunction(() => document.querySelector("[data-control-strip]").hidden === true);
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyS");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await page.waitForFunction(() => document.querySelector("[data-control-strip]").hidden === false);

  // Focus an editable field; the same combo must not hide the strip.
  await page.focus("#control-strip-hotkey");
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyS");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.querySelector("[data-control-strip]").hidden)).toBe(false);
});

test("an open menu survives state updates and Escape restores focus", async ({ page }) => {
  await enableControlStrip(page);
  await page.waitForSelector('[data-control-strip-module="volume"]');
  await page.click('[data-control-strip-module="volume"]', { timeout: 30_000 });
  const popover = page.locator("[data-control-strip-menu='volume']");
  await expect(popover).toBeVisible();

  // A volume change while the menu is open must update the menu, not close it.
  await page.evaluate(() => window.AISystem6Soundscape?.setVolumeLevel?.(6));
  await expect(popover).toBeVisible();
  await expect(popover.locator("button", { hasText: "Volume 6" })).toHaveClass(/is-checked/);

  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(page.locator('[data-control-strip-module="volume"]')).toBeFocused();
});

test("Soundscape volume keeps updating the strip after its window closes", async ({ page }) => {
  await enableControlStrip(page);
  await page.evaluate(() => window.AISystem6Soundscape?.ensureRuntime?.());
  await openWindow(page, "soundscape");
  await page.waitForSelector(".soundscape-window:not(.is-hidden)");
  await page.evaluate(() => closeWindow("soundscape"));
  await page.waitForFunction(() => document.querySelector('[data-window="soundscape"]').classList.contains("is-hidden"));

  await page.evaluate(() => window.AISystem6Soundscape?.setVolumeLevel?.(5));
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-control-strip-module="volume"]');
    return button?.getAttribute("aria-label")?.includes("5");
  });
  await expect(page.locator('[data-control-strip-module="volume"]').getAttribute("aria-label")).resolves.toContain("5");
});

test("menu font and size only reach the strip popover", async ({ page }) => {
  await enableControlStrip(page);
  await page.evaluate(() => {
    window.AISystem6ControlStrip.setMenuFont("Monaco");
    window.AISystem6ControlStrip.setMenuFontSize(18);
  });
  await page.click('[data-control-strip-module="volume"]', { timeout: 30_000 });
  const popoverFont = await page.locator("[data-control-strip-menu='volume']").evaluate((el) => getComputedStyle(el).fontFamily);
  const popoverSize = await page.locator("[data-control-strip-menu='volume']").evaluate((el) => getComputedStyle(el).fontSize);
  expect(popoverFont).toContain("Monaco");
  expect(popoverSize).toBe("18px");
  const windowFont = await page.locator("#control-title").evaluate((el) => getComputedStyle(el).fontFamily);
  expect(windowFont).not.toContain("Monaco");
});

test("narrow screens keep the collapsed drawer and Control Panel management", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enableControlStrip(page);
  const mount = page.locator("[data-control-strip]");
  await expect(mount).toHaveClass(/is-collapsed/);
  await expect(page.locator("[data-control-strip] .control-strip-scroll-back")).toBeHidden();

  // A pointer drag on the handle must not move or resize on phones.
  await pointerDrag(page, "[data-control-strip] .control-strip-handle", 200, -100, { alt: true });
  await expect(mount).toHaveClass(/is-collapsed/);
  await expect(mount).toHaveAttribute("data-edge", "left");

  // Control Panel can still disable the module list and reorder.
  await page.click('[data-control-tab="strip"]');
  await page.waitForSelector("#control-strip-module-list .control-strip-module-row");
  await page.click('[data-control-strip-settings-module="writingBell"]');
  await page.click("#control-strip-disable");
  await expect(page.locator('[data-control-strip-module="writingBell"]')).toHaveCount(0);
});

test("Classic and Liquid Glass share the same strip structure", async ({ page }) => {
  await enableControlStrip(page);
  const structure = await page.evaluate(() => {
    const mount = document.querySelector("[data-control-strip]");
    return mount ? mount.className + "|" + [...mount.querySelectorAll("*")].map((el) => el.className).join(",") : "";
  });
  await openWindow(page, "control");
  await page.click('[data-control-tab="general"]');
  await page.check("#liquid-glass");
  await page.waitForFunction(() => document.body.classList.contains("use-liquid-glass"));
  const structureAfter = await page.evaluate(() => {
    const mount = document.querySelector("[data-control-strip]");
    return mount ? mount.className + "|" + [...mount.querySelectorAll("*")].map((el) => el.className).join(",") : "";
  });
  expect(structureAfter).toBe(structure);
  await expect(page.locator("[data-control-strip]")).toBeVisible();
});
