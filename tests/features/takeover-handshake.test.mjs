// Safe takeover handshake: the old writer flushes first, replies ready or
// denied, and the new writer only claims after ready. Force takeover is
// reserved for stale owners or explicit confirmation, and a timeout never
// auto-forces.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { connectWriteLeaseChannels, createWriteLeaseInstance } from "../helpers/write-lease-vm.mjs";

const test = createFeatureTest("takeover-handshake");

// Clean writer: A flushes everything, replies ready, B becomes the writer,
// A turns read-only.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b]);
  a.lease.acquire();
  b.lease.acquire();
  const flushed = [];
  a.context.flushPendingQuickDraftCommit = async () => { flushed.push("draft"); return true; };
  a.context.flushWorkingSessionCommit = async () => { flushed.push("session"); };
  a.context.saveDeskState = async () => { flushed.push("desk"); return true; };
  const result = await b.lease.requestTakeover();
  test.assert(result.ok === true && result.writer === true, "takeover succeeds after the old writer flushes");
  test.assert(flushed.join(",") === "draft,session,desk", "the old writer flushes draft, Working Session, then desk state");
  test.assert(a.lease.isOwner() === false && a.lease.isReadOnly() === true, "the old writer is read-only after handoff");
  test.assert(b.lease.isOwner() === true, "the requesting instance becomes the writer");
  test.assert(JSON.parse(storage.get("ai-system6-write-lease")).instanceId === b.lease.instanceId, "the stored lease moves to B");
  b.lease.release();
}

// Unsaved failure: A's flush fails, B never becomes a writer, A stays writer.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage, { saveDesk: false });
  const b = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b]);
  a.lease.acquire();
  b.lease.acquire();
  const result = await b.lease.requestTakeover();
  test.assert(result.ok === false && result.reason === "unsaved-work", "a failed flush denies the takeover");
  test.assert(b.lease.isOwner() === false, "B does not become a writer after denial");
  test.assert(a.lease.isOwner() === true, "A remains the writer after denial");
  test.assert(JSON.parse(storage.get("ai-system6-write-lease")).instanceId === a.lease.instanceId, "the stored lease still belongs to A");
  a.lease.release();
}

// Timeout: an unresponsive owner never auto-forces; the request times out.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage, { fastTimers: true });
  // No channel connection: A never hears the takeover-request.
  a.lease.acquire();
  b.lease.acquire();
  const result = await b.lease.requestTakeover();
  test.assert(result.ok === false && result.reason === "timeout", "an unresponsive owner times out without auto-force");
  test.assert(b.lease.isOwner() === false, "the requester stays read-only after timeout");
  a.lease.release();
}

// Stale owner: A's lease is stale, so B can force-acquire immediately.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage);
  a.lease.acquire();
  const stale = JSON.parse(storage.get("ai-system6-write-lease"));
  stale.heartbeatAt = Date.now() - 60000;
  storage.set("ai-system6-write-lease", JSON.stringify(stale));
  const result = await b.lease.requestTakeover();
  test.assert(result.ok === true && result.writer === true, "a stale owner can be force-acquired");
  test.assert(b.lease.isOwner() === true, "B becomes the writer over a stale lease");
  a.lease.release();
  b.lease.release();
}

test.finish();
