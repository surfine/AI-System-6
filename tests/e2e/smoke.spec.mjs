import { expect, test } from "@playwright/test";
import {
  bootApp,
  createProject,
  enterWritingStudio,
} from "./helpers.mjs";

async function dismissStartupGuide(page) {
  const welcomeDisk = page.locator('[data-window="welcomeDisk"]');
  if (!await welcomeDisk.isVisible().catch(() => false)) return;
  await welcomeDisk.locator(".close-box").click();
  await welcomeDisk.waitFor({ state: "hidden", timeout: 10_000 });
}

async function leaseState(page) {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem(window.AISystem6WriteLease.keys.storage) || "null");
    return {
      owner: window.AISystem6WriteLease.isOwner(),
      readOnly: window.AISystem6WriteLease.isReadOnly(),
      canMutate: window.AISystem6WriteLease.canMutate(),
      mode: document.body.dataset.writeMode,
      modalOpen: document.querySelector("#write-lease-modal")?.open === true,
      storedOwner: stored?.instanceId || "",
      storedEpoch: Number(stored?.epoch) || 0,
      instanceId: window.AISystem6WriteLease.instanceId,
    };
  });
}

test("smoke: create, save, reload, and hand writing to a second window", async ({ context, page: pageA }) => {
  await bootApp(pageA);
  await dismissStartupGuide(pageA);
  await createProject(pageA, "Smoke Project");
  await enterWritingStudio(pageA);

  const savedText = "Smoke save survives a real IndexedDB reload.";
  await pageA.fill("#question-sheet-body", savedText);
  await pageA.waitForTimeout(1_800);
  await pageA.reload();
  await pageA.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  await expect(pageA.locator("#question-sheet-body")).toHaveValue(savedText);

  const pageB = await context.newPage();
  await bootApp(pageB);
  await expect(pageB.locator("#write-lease-modal")).toHaveAttribute("open", "");
  await expect(pageB.locator("#new-project-disk")).toBeDisabled();

  await pageB.click("#write-lease-takeover");
  await expect(pageB.locator("#write-lease-modal")).not.toHaveAttribute("open", "");
  await expect.poll(async () => ({
    pageA: await leaseState(pageA),
    pageB: await leaseState(pageB),
  })).toMatchObject({
    pageA: { owner: false, readOnly: true, canMutate: false, mode: "readonly" },
    pageB: { owner: true, readOnly: false, canMutate: true, mode: "writer" },
  });
  await expect(pageB.locator("#new-project-disk")).toBeEnabled();
});
