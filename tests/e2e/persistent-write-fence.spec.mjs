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

  await expect.poll(() => pageA.evaluate(() => window.AISystem6WriteLease.isOwner())).toBe(true);
  await expect.poll(() => pageB.evaluate(() => window.AISystem6WriteLease.isReadOnly())).toBe(true);
  expect(await transactionProbe(pageB)).toEqual({ ok: false, code: "READ_ONLY_INSTANCE" });

  // A has passed the fast in-memory check. Its captured epoch must still be
  // rejected if B completes a takeover before A opens the data transaction.
  const oldFence = await pageA.evaluate(() => window.AISystem6WriteLease.assertCanWrite());
  const takeover = await pageB.evaluate(() => window.AISystem6WriteLease.requestTakeover());
  expect(takeover).toMatchObject({ ok: true, writer: true });
  await expect.poll(() => pageA.evaluate(() => window.AISystem6WriteLease.isReadOnly())).toBe(true);

  expect(await transactionProbe(pageA, { expectedFence: oldFence, value: "stale" }))
    .toEqual({ ok: false, code: "STALE_WRITE_FENCE" });
  expect(await transactionProbe(pageB, { value: "writer-b" })).toEqual({ ok: true });

  // A's late pagehide/release cannot clear B's owner+epoch tombstone.
  await pageA.evaluate(() => window.AISystem6WriteLease.release());
  const fenceAfterLateRelease = await pageB.evaluate(async () => {
    const db = await openAppDb();
    try {
      return await window.AISystem6StorageTransactions.readWriteFence(db);
    } finally {
      db.close();
    }
  });
  const bIdentity = await pageB.evaluate(() => ({
    ownerId: window.AISystem6WriteLease.instanceId,
    epoch: window.AISystem6WriteLease.assertCanWrite().epoch,
  }));
  expect(fenceAfterLateRelease).toMatchObject(bIdentity);

  // Read-only is limited to mutation: backup/Get Info controls remain usable.
  const readonlySurface = await pageA.evaluate(() => ({
    mutatingDisabled: document.querySelector("#new-project-disk")?.disabled === true,
    exportDisabled: document.querySelector("#export-project-disk")?.disabled === true,
  }));
  expect(readonlySurface).toEqual({ mutatingDisabled: true, exportDisabled: false });

  // A foreground/BFCache-style reconciliation verifies IndexedDB and never
  // reclaims B's fence.
  const reconciled = await pageA.evaluate(() => window.AISystem6WriteLease.reconcile());
  expect(reconciled).toMatchObject({ readOnly: true });
  expect(await transactionProbe(pageB, { value: "writer-b-after-reconcile" })).toEqual({ ok: true });
});
