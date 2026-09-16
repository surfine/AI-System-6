// The save a writer made while an earlier one was still in flight.
//
// The desk freezes the bytes a plan will store and then clears the "this
// record moved" report afterwards. Clearing the report for the record rather
// than for the version the plan froze made the next save trust a version the
// disk never received - the text was on screen, both saves said they landed,
// and reloading brought back the older one. These run against real IndexedDB
// in a real browser, hold the transaction open at a named point instead of
// waiting on a timer, and read the record back after a reload.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, openWindow } from "./helpers.mjs";

/** Hold the next readwrite transaction at its entry, and report when it is there. */
async function installTransactionGate(page) {
  await page.evaluate(() => {
    const transactions = window.AISystem6StorageTransactions;
    const original = transactions.runTransaction;
    window.__gate = null;
    window.__enteredGate = 0;
    window.AISystem6StorageTransactions = {
      ...transactions,
      runTransaction: async (...args) => {
        if (window.__gate) {
          window.__enteredGate += 1;
          await window.__gate;
        }
        return original.apply(transactions, args);
      },
    };
  });
}

async function holdNextTransaction(page) {
  await page.evaluate(() => {
    window.__gate = new Promise((resolve) => { window.__releaseGate = resolve; });
  });
}

async function releaseTransactionGate(page) {
  await page.evaluate(() => {
    window.__releaseGate?.();
    window.__gate = null;
  });
}

async function waitForGate(page) {
  await expect.poll(() => page.evaluate(() => window.__enteredGate), { timeout: 20_000 })
    .toBeGreaterThan(0);
}

/** The stored bytes themselves, read from IndexedDB in a fresh transaction. */
async function readStoredRecord(page, storeName, id) {
  return page.evaluate(async ({ storeName, id }) => {
    const db = await openAppDb();
    try {
      const tx = db.transaction(storeName, "readonly");
      const stored = await new Promise((resolve, reject) => {
        const request = tx.objectStore(storeName).get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
      return stored ? JSON.parse(JSON.stringify(stored)) : null;
    } finally {
      db.close();
    }
  }, { storeName, id });
}

// The quoted line each appended clip contributes. The surrounding context of
// one clip can mention the other sentence, so the quoted text - not a
// substring search - is what says whether a clip is really in the record.
function quotedClips(body) {
  return String(body || "")
    .split("\n")
    .filter((line) => line.startsWith("> "))
    .map((line) => line.slice(2));
}

test("a second edit made while the first save is in flight is what the disk ends up holding", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Dirty Version Project");

  const scrapId = await page.evaluate(async () => {
    const scrap = createScrap("Gated scrap", "v0", { source: { type: "note" } });
    await saveDeskState();
    return scrap.id;
  });
  expect((await readStoredRecord(page, "scraps", scrapId)).body).toBe("v0");

  await installTransactionGate(page);
  await holdNextTransaction(page);
  await page.evaluate(async (id) => {
    const scrap = scraps.find((item) => item.id === id);
    scrap.body = "v1";
    markDeskDirty("scraps", id);
    // Not awaited: this is the save the writer is still inside.
    window.__firstSave = saveDeskState();
  }, scrapId);
  await waitForGate(page);

  // The plan for v1 is frozen and its transaction is open. The writer types.
  await page.evaluate((id) => {
    const scrap = scraps.find((item) => item.id === id);
    scrap.body = "v2";
    markDeskDirty("scraps", id);
  }, scrapId);

  await releaseTransactionGate(page);
  await page.evaluate(() => window.__firstSave);
  // The autosave that follows the second keystroke.
  await page.evaluate(() => saveDeskState());

  expect((await readStoredRecord(page, "scraps", scrapId)).body).toBe("v2");

  await page.reload();
  await bootApp(page);
  await dismissGuide(page);
  const afterReload = await page.evaluate((id) => scraps.find((item) => item.id === id)?.body ?? null, scrapId);
  expect(afterReload).toBe("v2");
});

test("two Scrapbook clips appended across an in-flight save both survive a reload", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Clip Race Project");

  // The clip is taken from a real selection, so the assistant window has to be
  // the one on screen and focused - a programmatic range does not stick in a
  // document that has never been focused. The message is appended inside the
  // same step that clips it, so a repaint cannot take it away in between.
  await openWindow(page, "assistant");

  // The scrap the two clips are appended to, with its first version already on
  // disk - the state a writer is in before clipping anything.
  const scrapId = await page.evaluate(async () => {
    const scrap = createScrap("Clip race scrap", "v0", { source: { type: "note" } });
    await saveDeskState();
    return scrap.id;
  });
  expect(quotedClips((await readStoredRecord(page, "scraps", scrapId)).body)).toEqual([]);
  await page.evaluate(() => {
    window.__clipFromAssistantMessage = (needle) => {
      let message = document.querySelector('[data-message-id="e2e-assistant-clip-source"]');
      if (!message) {
        message = document.createElement("div");
        message.className = "message assistant";
        message.dataset.messageId = "e2e-assistant-clip-source";
        message.textContent = "The first sentence to keep. The second sentence to keep.";
        document.querySelector("#messages").append(message);
      }
      const node = message.firstChild;
      const start = message.textContent.indexOf(needle);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + needle.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      clipAssistantSelection();
      return message.textContent;
    };
  });

  // Select the scrap the way the user does, from the Scrapbook list.
  await openWindow(page, "scrapbook");
  await page.evaluate((id) => {
    const row = document.querySelector(`#scrap-list button[data-id="${id}"]`);
    if (!row) throw new Error("the new clip is not in the Scrapbook list");
    row.click();
  }, scrapId);
  expect(await page.evaluate(() => selectedScrapId)).toBe(scrapId);

  // Raising another window stops the assistant pane from being rendered, and a
  // range into a pane that is not laid out cannot be selected. The clip is
  // taken from the window on screen, the way a writer takes it.
  await openWindow(page, "assistant");
  await installTransactionGate(page);
  await holdNextTransaction(page);
  await page.evaluate(() => {
    window.__clipFromAssistantMessage("The first sentence to keep.");
  });
  await waitForGate(page);
  // The second clip lands while the first append's save is still open.
  await openWindow(page, "assistant");
  await page.evaluate(() => {
    window.__clipFromAssistantMessage("The second sentence to keep.");
  });
  await releaseTransactionGate(page);
  await page.evaluate(() => saveDeskState());

  const stored = await readStoredRecord(page, "scraps", scrapId);
  expect(stored.body.startsWith("v0")).toBe(true);
  expect(quotedClips(stored.body))
    .toEqual(["The first sentence to keep.", "The second sentence to keep."]);

  await page.reload();
  await bootApp(page);
  await dismissGuide(page);
  const afterReload = await page.evaluate((id) => scraps.find((item) => item.id === id)?.body ?? "", scrapId);
  expect(quotedClips(afterReload))
    .toEqual(["The first sentence to keep.", "The second sentence to keep."]);
});
