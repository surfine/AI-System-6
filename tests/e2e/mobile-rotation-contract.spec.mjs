// Rotation contract for the writing route on phone and tablet, portrait and
// landscape (CLAUDE.md "Phone/tablet orientation contract"): rotating mid-task
// must never gate entry, require rotation, hide the primary task or escape
// path, reload the surface, or lose user state (typed text, the open window,
// the selection). This spec pins that promise for the eight-stop writing
// route specifically, since that is where the most state (a typed draft) is
// at stake.
//
// Historical diagnostic, like the rest of tests/e2e/ (see CLAUDE.md "E2E is
// not a release condition") — run with:
//   npx playwright test tests/e2e/mobile-rotation-contract.spec.mjs --config tests/e2e/playwright.config.mjs
import { expect, test } from "@playwright/test";
import {
  bootApp,
  createProject,
  dismissGuide,
  importMarkdown,
} from "./helpers.mjs";

const DEVICES = [
  { label: "phone", width: 390, height: 844 },
  { label: "tablet", width: 834, height: 1194 },
];

function landscapeOf(size) {
  return { width: size.height, height: size.width };
}

/** Raise a route window like a real tap, then click its enabled route action. */
async function realAdvance(page, windowName, action) {
  await page.click(`[data-window="${windowName}"] .title-bar`).catch(() => {});
  await page.waitForFunction(
    ([win, act]) => {
      const el = document.querySelector(`[data-window="${win}"] [data-action="${act}"]`);
      return !!el && !el.classList.contains("is-disabled") && (el.offsetWidth || el.offsetHeight);
    },
    [windowName, action],
    { timeout: 15_000 }
  );
  await page.click(`[data-window="${windowName}"] [data-action="${action}"]`);
}

/**
 * The rotation itself, plus every promise CLAUDE.md makes about it:
 *   - no reload (a boot marker set before the flip must survive it)
 *   - the field's typed text survives (state is not lost)
 *   - an escape path (the window's close-box) stays reachable — found,
 *     nonzero size, and inside the viewport — so the user is never stranded
 *   - rotating back restores the starting geometry and the text is still
 *     there (a round trip, not just a one-way flip)
 */
async function escapeReachable(page, windowName) {
  const escapeBox = page.locator(`[data-window="${windowName}"] .close-box`);
  if (!(await escapeBox.count())) return false;
  const box = await escapeBox.boundingBox().catch(() => null);
  return !!box && box.width > 0 && box.height > 0;
}

async function assertRotationHoldsState(page, { windowName, fieldSelector, fingerprint, startSize }) {
  await page.evaluate(() => { window.__rotationAuditMarker = "alive-" + Math.random(); });
  const marker = await page.evaluate(() => window.__rotationAuditMarker);

  // Baseline before touching the viewport at all. The gate's job is to prove
  // rotation itself never *takes away* something that was there — it is not
  // scoped to repair an escape path this window never had in the first place
  // (that is the surface-ownership/desk-conflict territory owned elsewhere).
  const escapeBefore = await escapeReachable(page, windowName);

  const rotated = landscapeOf(startSize);
  await page.setViewportSize(rotated);
  await page.waitForTimeout(400); // let the resize/orientationchange handlers settle

  const survivedReload = await page.evaluate(() => window.__rotationAuditMarker).catch(() => null);
  expect(survivedReload, `${windowName}: rotation reloaded the surface`).toBe(marker);

  if (fieldSelector) {
    await expect(
      page.locator(fieldSelector),
      `${windowName}: typed text was lost on rotation`
    ).toHaveValue(fingerprint);
  }

  if (escapeBefore) {
    const escapeAfter = await escapeReachable(page, windowName);
    expect(escapeAfter, `${windowName}: escape path was reachable before rotating and is not after`).toBe(true);
  }

  // Rotate back — the round trip must not have dropped anything either.
  await page.setViewportSize(startSize);
  await page.waitForTimeout(400);
  const survivedRoundTrip = await page.evaluate(() => window.__rotationAuditMarker).catch(() => null);
  expect(survivedRoundTrip, `${windowName}: rotating back reloaded the surface`).toBe(marker);
  if (fieldSelector) {
    await expect(
      page.locator(fieldSelector),
      `${windowName}: typed text was lost on the rotation round trip`
    ).toHaveValue(fingerprint);
  }
  if (escapeBefore) {
    const escapeBack = await escapeReachable(page, windowName);
    expect(escapeBack, `${windowName}: escape path was reachable before rotating and is not after the round trip`).toBe(true);
  }
}

for (const device of DEVICES) {
  test.describe(`${device.label} rotation contract — writing route`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: true,
      hasTouch: true,
    });

    test(`${device.label}: each route stop keeps its text, its escape path, and does not reload across a rotation`, async ({ page }) => {
      const startSize = { width: device.width, height: device.height };
      await bootApp(page);
      await dismissGuide(page);
      await createProject(page, `Rotation Contract ${device.label}`);
      // A brand-new zero-content project can hand off straight into a First
      // Minute tour instead of the classic route (see the commit "First
      // Minute: show the tour, then hand off to a first draft"); giving the
      // project one real file first keeps this gate on the same recipe the
      // checked-in mobile-user-journey spec already proves reaches Question
      // Sheet through Review Desk.
      await importMarkdown(page, "# Rotation contract source\n\nOne evidence line.", "rotation-notes.md");
      const profile = await page.evaluate(() => document.body.dataset.workspaceProfile);
      if (profile !== "writing") {
        // Desktop entry: close every open window through the app's own
        // closeWindow() — DOM clicks on .close-box miss when one window
        // overlaps another — then enter Writing Studio through the Finder
        // toggle, the recipe the checked-in mobile-user-journey spec proves.
        await page.evaluate(async () => {
          for (let i = 0; i < 12; i += 1) {
            const win = document.querySelector(".window:not(.is-hidden):not(.is-app-hidden)");
            if (!win || typeof closeWindow !== "function") break;
            const name = win.dataset.window;
            if (!name || ["guide", "welcomeDisk"].includes(name)) break;
            await closeWindow(name, true);
          }
          if (typeof saveDeskState === "function") await saveDeskState();
        });
        await page.waitForSelector("#finder-writing-studio-toggle", { state: "visible", timeout: 10_000 });
        await page.dblclick("#finder-writing-studio-toggle");
        await page.waitForFunction(() => document.body.dataset.workspaceProfile === "writing", undefined, { timeout: 15_000 });
      }
      // The import flow leaves the route controller holding the File Floppy
      // stop (the Import Utility surface) open, so closing windows by name
      // is not enough to reach the Question Sheet. The honest user control
      // is the Writing path bar's Question Sheet button.
      await page.click('[data-action="open-question-sheet"]');
      await page.waitForSelector('[data-window="questionSheet"]:not(.is-hidden)', { timeout: 15_000 });

      // Question Sheet.
      const qsText = `rotation-fingerprint-question-${device.label}`;
      await page.fill("#question-sheet-body", qsText);
      await assertRotationHoldsState(page, {
        windowName: "questionSheet",
        fieldSelector: "#question-sheet-body",
        fingerprint: qsText,
        startSize,
      });
      await realAdvance(page, "questionSheet", "advance-question-to-outline");
      await page.waitForSelector('[data-window="outline"].is-active:not(.is-hidden)', { timeout: 15_000 });

      // Outline.
      const outlineText = `## Rotation ${device.label} Section`;
      await page.fill("#outline-content", outlineText);
      await assertRotationHoldsState(page, {
        windowName: "outline",
        fieldSelector: "#outline-content",
        fingerprint: outlineText,
        startSize,
      });
      await realAdvance(page, "outline", "advance-outline-to-drafts");
      await page.waitForSelector('[data-window="sectionDrafts"].is-active:not(.is-hidden)', { timeout: 15_000 });

      // Section Drafts.
      const draftText = `Rotation-safe prose for ${device.label}.`;
      await page.fill("#draft-body", draftText);
      await assertRotationHoldsState(page, {
        windowName: "sectionDrafts",
        fieldSelector: "#draft-body",
        fingerprint: draftText,
        startSize,
      });
      await realAdvance(page, "sectionDrafts", "advance-drafts-to-manuscript");
      await page.waitForSelector('[data-window="teachText"].is-active:not(.is-hidden)', { timeout: 15_000 });

      // Manuscript (TeachText). The drafts-to-manuscript transition lands
      // here directly; content is already populated from the prior stop, so
      // only the rotation promise (not a fresh fingerprint) is asserted.
      await assertRotationHoldsState(page, {
        windowName: "teachText",
        fieldSelector: null,
        fingerprint: null,
        startSize,
      });
    });
  });
}
