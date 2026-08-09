// Lease fencing races: even when two instances interleave reads and writes,
// exactly one instance passes the stored-owner verification at write time,
// and no late heartbeat / release can overwrite or delete the new owner.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { connectWriteLeaseChannels, createWriteLeaseInstance } from "../helpers/write-lease-vm.mjs";

const test = createFeatureTest("single-writer-race");
const transactionsSource = read("app/core/storage-transactions.js");

// Simultaneous acquisition with a stale read and a late rival claim: the
// read-back fence leaves exactly one writer.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b]);
  const leaseKey = "ai-system6-write-lease";

  // B claims first (normal path).
  const bAcquired = b.lease.acquire();
  test.assert(bAcquired.writer === true, "B acquires normally");

  // A's reads are stale (it read "no lease" before B wrote), and B re-claims
  // immediately after A's first write — so A's read-back must fail.
  const originalGet = storage.get.bind(storage);
  const originalSet = storage.set.bind(storage);
  let aWrites = 0;
  let aReads = 0;
  storage.get = (key) => {
    if (key === leaseKey) {
      aReads += 1;
      // A's first read is stale: it saw "no lease" before B wrote.
      if (aReads === 1) return null;
    }
    return originalGet(key);
  };
  storage.set = (key, value) => {
    originalSet(key, value);
    if (key === leaseKey) {
      aWrites += 1;
      if (aWrites === 1) originalSet(key, JSON.stringify({ instanceId: b.lease.instanceId, claimedAt: Date.now(), heartbeatAt: Date.now() }));
    }
  };
  const aAcquired = a.lease.acquire();
  test.assert(aAcquired.writer === false && aAcquired.readOnly === true, "the stale reader ends read-only after the read-back fence");
  test.assert(b.lease.isOwner() === true, "the rival claimant remains the only writer");
  test.assert(a.lease.isOwner() === false, "instance A never becomes a writer");

  // A's storage boundary rejects writes because the STORED owner is not A.
  vm.runInContext(transactionsSource, a.context);
  let rejected = null;
  try {
    await a.context.window.AISystem6StorageTransactions.runTransaction({}, "keyval", "readwrite", () => {});
  } catch (error) {
    rejected = error;
  }
  test.assert(rejected?.code === "READ_ONLY_INSTANCE", "the transaction fence rejects the memory-writer whose stored lease is gone");

  b.lease.release();
}

// Heartbeat after takeover: a late heartbeat must not overwrite the new owner.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage, { fastTimers: true });
  const b = createWriteLeaseInstance(storage, { fastTimers: true });
  connectWriteLeaseChannels([a, b]);
  a.lease.acquire();
  b.lease.acquire();
  b.lease.takeOver();
  const storedAfterTakeover = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(storedAfterTakeover.instanceId === b.lease.instanceId, "the new owner holds the stored lease");
  a.lease.reconcile();
  const storedAfterReconcile = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(storedAfterReconcile.instanceId === b.lease.instanceId, "reconcile never overwrites the new owner");
  test.assert(a.lease.isOwner() === false && a.lease.isReadOnly() === true, "the old instance is read-only after reconcile");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const storedAfterHeartbeats = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(storedAfterHeartbeats.instanceId === b.lease.instanceId, "late heartbeat ticks never replace the new owner");
  b.lease.release();
}

// Late pagehide / release after takeover: only the stored owner can be deleted.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage, { noBroadcastChannel: true });
  const b = createWriteLeaseInstance(storage, { noBroadcastChannel: true });
  a.lease.acquire();
  b.lease.acquire();
  b.lease.takeOver();
  a.lease.release();
  const stored = JSON.parse(storage.get("ai-system6-write-lease"));
  test.assert(stored.instanceId === b.lease.instanceId, "the late old-window release leaves the new owner's lease intact");
  b.lease.release();
}

// BFCache / foreground resume re-verifies the stored owner.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b]);
  a.lease.acquire();
  b.lease.acquire();
  b.lease.takeOver();
  const reconciled = a.lease.reconcile();
  test.assert(reconciled.readOnly === true, "resume with another fresh owner reconciles to read-only");
  test.assert(a.lease.isOwner() === false, "the resumed instance never auto-takeovers");
  b.lease.release();
}

test.finish();
