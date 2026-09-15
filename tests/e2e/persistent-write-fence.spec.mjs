import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers.mjs";

async function transactionProbe(page, { expectedFence = null, value = "probe" } = {}) {
  return page.evaluate(async ({ fence, nextValue }) => {
    const db = await openAppDb();
    try {
      const operation = (tx) => idbRequest(
        tx.objectStore(keyvalStoreName).put(nextValue, "persistent-fence-probe")
      );
      if (fence) {
        await window.AISystem6StorageTransactions.runTransactionAtFence(
          db,
          keyvalStoreName,
          "readwrite",
          fence,
          operation
        );
      } else {
        await window.AISystem6StorageTransactions.runTransaction(
          db,
          keyvalStoreName,
          "readwrite",
          operation
        );
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error?.code || error?.name || "unknown" };
    } finally {
      db.close();
    }
  }, { fence: expectedFence, nextValue: value });
}

test("persistent fence: two pages hand off safely and reject the old epoch", async ({ context, page: pageA }) => {
  await bootApp(pageA);
  const pageB = await context.newPage();
  await bootApp(pageB);

  // The desk is written by one window, and this model makes the newcomer the
  // one that holds the pen: the window that just opened takes the fence, and
  // the window already on the desk keeps typing - its surfaces stay editable,
  // and its writes travel through the holder. This spec used to assert the
  // opposite (the first window stayed the writer and the second arrived
  // read-only behind a takeover modal), which is the model this desk left.
  await expect.poll(() => pageB.evaluate(() => window.AISystem6WriteLease.isOwner())).toBe(true);
  await expect.poll(() => pageA.evaluate(() => window.AISystem6WriteLease.isOwner())).toBe(false);
  expect(await transactionProbe(pageA)).toEqual({ ok: false, code: "READ_ONLY_INSTANCE" });

  // B has passed the fast in-memory check. Its captured epoch must still be
  // rejected if A completes a takeover before B opens the data transaction.
  const oldFence = await pageB.evaluate(() => window.AISystem6WriteLease.assertCanWrite());
  const takeover = await pageA.evaluate(() => window.AISystem6WriteLease.requestTakeover());
  expect(takeover).toMatchObject({ ok: true, writer: true });
  await expect.poll(() => pageB.evaluate(() => window.AISystem6WriteLease.isReadOnly())).toBe(true);

  expect(await transactionProbe(pageB, { expectedFence: oldFence, value: "stale" }))
    .toEqual({ ok: false, code: "STALE_WRITE_FENCE" });
  expect(await transactionProbe(pageA, { value: "writer-a" })).toEqual({ ok: true });

  // B's late pagehide/release cannot clear A's owner+epoch tombstone.
  await pageB.evaluate(() => window.AISystem6WriteLease.release());
  const fenceAfterLateRelease = await pageA.evaluate(async () => {
    const db = await openAppDb();
    try {
      return await window.AISystem6StorageTransactions.readWriteFence(db);
    } finally {
      db.close();
    }
  });
  const aIdentity = await pageA.evaluate(() => ({
    ownerId: window.AISystem6WriteLease.instanceId,
    epoch: window.AISystem6WriteLease.assertCanWrite().epoch,
  }));
  expect(fenceAfterLateRelease).toMatchObject(aIdentity);

  // Read-only no longer freezes the interface: backup and Get Info stay
  // usable, and so do the controls whose writes travel through the holder. The
  // fence below the interface is what refuses an unproxied write, which is the
  // assertion that still means something.
  const readonlySurface = await pageB.evaluate(() => ({
    exportDisabled: document.querySelector("#export-project-disk")?.disabled === true,
    newProjectDisabled: document.querySelector("#new-project-disk")?.disabled === true,
    typingAllowed: !(document.querySelector("#question-sheet-body")?.readOnly === true),
  }));
  expect(readonlySurface).toEqual({ exportDisabled: false, newProjectDisabled: false, typingAllowed: true });

  // A foreground/BFCache-style reconciliation verifies IndexedDB and never
  // reclaims the holder's fence.
  const reconciled = await pageB.evaluate(() => window.AISystem6WriteLease.reconcile());
  expect(reconciled).toMatchObject({ readOnly: true });
  expect(await transactionProbe(pageA, { value: "writer-a-after-reconcile" })).toEqual({ ok: true });
  expect(await transactionProbe(pageB, { value: "stale-b-after-reconcile" }))
    .toEqual({ ok: false, code: "READ_ONLY_INSTANCE" });
});
