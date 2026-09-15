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
  // The second window takes the write lease by opening. Nobody is asked to
  // approve anything and nobody is frozen: the window that loses the lease
  // keeps typing, and its writes travel through the holder.
  await expect(pageB.locator("#write-lease-modal")).not.toHaveAttribute("open", "");
  await expect.poll(async () => ({
    pageA: await leaseState(pageA),
    pageB: await leaseState(pageB),
  })).toMatchObject({
    pageA: { owner: false, readOnly: true, canMutate: false, mode: "readonly" },
    pageB: { owner: true, readOnly: false, canMutate: true, mode: "writer" },
  });
  await expect(pageB.locator("#new-project-disk")).toBeEnabled();
  await expect(pageA.locator("#new-project-disk")).toBeEnabled();

  // What the window without the pen types stays on its own screen: a refused
  // save is reported as a conflict, and nothing is silently rolled back out
  // from under the writer. (The handoff write itself, and what the disk and
  // the other window end up holding, is the subject of
  // cross-window-consistency.spec.mjs - this smoke path stops here.)
  await pageA.fill("#question-sheet-body", "Still typed here.");
  await expect(pageA.locator("#question-sheet-body")).toHaveValue("Still typed here.");
  expect((await leaseState(pageA)).canMutate).toBe(false);
});
