import { expect, test } from "@playwright/test";
import {
  bootApp,
  createProject,
  dismissGuide,
  enterWritingStudio,
  runAction,
} from "./helpers.mjs";

// Quick Draft adjustment layers: 明明传球 / 洛洛接球 / HKRR 抬升 carry a switch,
// a strength, a line-range mask, and a stack order. The layer stack lives in
// the workspace record, travels to the draft route, and its masks show up in
// the read-only grain view. These specs drive the real UI — no source greps —
// and prove the controls persist across a reload.

async function ensureWritingProfile(page) {
  const profile = await page.evaluate(() => document.body.dataset.workspaceProfile);
  if (profile !== "writing") await enterWritingStudio(page);
}

async function openQuickDraft(page) {
  await runAction(page, "open-quick-draft");
  await page.waitForSelector('[data-window="quickDraft"]:not(.is-hidden):not(.is-app-hidden)', { timeout: 20_000 });
  // Raise the window so later clicks are never intercepted by the Question
  // Sheet / SideAsk that the writing profile opens first.
  await page.locator('[data-window="quickDraft"] .title-bar').click({ position: { x: 80, y: 8 } }).catch(() => {});
}

async function openCommands(page) {
  await page.click("#quick-draft-tools summary");
  await page.waitForSelector("#quick-draft-tools[open]");
}

async function layerOrder(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-quick-draft-adjustment-layer]")]
      .map((el) => el.dataset.quickDraftAdjustmentLayer)
  );
}

async function workspaceLayers(page) {
  return page.evaluate(() => {
    const project = typeof getActiveProject === "function" ? getActiveProject() : null;
    return project?.quickDraft?.workspace?.adjustmentLayers || [];
  });
}

test("adjustment layers: switch, strength, mask, order, and grain markers", async ({ page }) => {
  await page.goto("/");
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await ensureWritingProfile(page);
  await openQuickDraft(page);
  await openCommands(page);

  // The three layers render in canonical order with mask and move controls.
  expect(await layerOrder(page)).toEqual(["mingming", "luoluo", "hkrr"]);
  await expect(page.locator("[data-quick-draft-adjustment-mask]")).toHaveCount(3);
  await expect(page.locator("[data-quick-draft-adjustment-move]")).toHaveCount(6);

  // Turning a layer off disables its Fast Review chip; back on re-enables it.
  await page.setChecked('[data-quick-draft-adjustment-enabled="mingming"]', false);
  await expect(page.locator('[data-quick-draft-chat-action="mingming"]')).toBeDisabled();
  await page.setChecked('[data-quick-draft-adjustment-enabled="mingming"]', true);
  await expect(page.locator('[data-quick-draft-chat-action="mingming"]')).toBeEnabled();

  // Strength and mask edits land in the workspace record, normalized.
  await page.selectOption('[data-quick-draft-adjustment-strength="luoluo"]', "75");
  await page.fill('[data-quick-draft-adjustment-mask="hkrr"]', "1-2");
  await page.locator('[data-quick-draft-adjustment-mask="hkrr"]').press("Tab");
  await expect.poll(async () => (await workspaceLayers(page)).find((l) => l.kind === "luoluo")?.strength).toBe(75);
  await expect.poll(
    async () => JSON.stringify((await workspaceLayers(page)).find((l) => l.kind === "hkrr")?.mask)
  ).toBe(JSON.stringify([{ start: 1, end: 2 }]));

  // Reorder: HKRR moves above Luoluo and the visible stack follows.
  await page.click('[data-quick-draft-adjustment-move="hkrr"][data-direction="-1"]');
  await expect.poll(() => layerOrder(page)).toEqual(["mingming", "hkrr", "luoluo"]);

  // The grain view reports the mask and marks the masked lines.
  await page.fill("#quick-draft-draft", "第一行。\n\n第二行。\n\n第三行。");
  await page.click("#quick-draft-toggle-grain");
  await page.waitForSelector(".quick-draft-grain-body");
  expect(await page.locator(".quick-draft-grain-readout").textContent()).toMatch(/HKRR\s+(Lift|提亮)\s+1-2/);
  await expect(page.locator(".quick-draft-grain-line.is-masked")).toHaveCount(2);
});

test("adjustment layers persist across a reload", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page);
  await ensureWritingProfile(page);
  await openQuickDraft(page);
  await openCommands(page);

  // Set the state the reload must restore.
  await page.selectOption('[data-quick-draft-adjustment-strength="luoluo"]', "75");
  await page.fill('[data-quick-draft-adjustment-mask="hkrr"]', "1-2");
  await page.locator('[data-quick-draft-adjustment-mask="hkrr"]').press("Tab");
  await page.click('[data-quick-draft-adjustment-move="hkrr"][data-direction="-1"]');
  await expect.poll(() => layerOrder(page)).toEqual(["mingming", "hkrr", "luoluo"]);

  // Flush the async IndexedDB write before reloading: a reload that races the
  // persistence promise boots into a fresh project and loses the settings.
  await page.evaluate(async () => {
    await saveDeskState();
  });

  // Reload and let the app restore its windows before asserting.
  await page.reload();
  await bootApp(page);
  if (await page.locator('[data-window="guide"]:not(.is-hidden)').isVisible().catch(() => false)) {
    await dismissGuide(page);
  }
  await ensureWritingProfile(page);
  await openQuickDraft(page);
  await openCommands(page);

  await expect(page.locator('[data-quick-draft-adjustment-strength="luoluo"]')).toHaveValue("75");
  await expect(page.locator('[data-quick-draft-adjustment-mask="hkrr"]')).toHaveValue("1-2");
  await expect.poll(() => layerOrder(page)).toEqual(["mingming", "hkrr", "luoluo"]);
});
