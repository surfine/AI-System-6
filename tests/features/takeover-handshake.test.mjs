// Safe takeover handshake: the request is TARGETED at the stored writer, only
// that writer answers, the old writer enters handoff (frozen for new edits,
// still able to finish pending durable writes), re-checks the stored owner
// before releasing, and restores writer mode on a failed flush. Read-only
// bystanders never interfere.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { connectWriteLeaseChannels, createWriteLeaseInstance } from "../helpers/write-lease-vm.mjs";

const test = createFeatureTest("takeover-handshake");

// Clean writer: the request is targeted at A, A flushes in handoff, replies
// ready, B becomes the writer, A turns read-only.
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
  const request = b.lease.requestTakeover();
  const requestMessage = b.channels[0]._sent;
  test.assert(
    requestMessage?.type === "takeover-request"
      && requestMessage.targetInstanceId === a.lease.instanceId
      && requestMessage.fromInstanceId === b.lease.instanceId,
    "the takeover request is targeted at the stored writer"
  );
  const result = await request;
  test.assert(result.ok === true && result.writer === true, "takeover succeeds after the old writer flushes");
  test.assert(flushed.join(",") === "draft,session,desk", "the old writer flushes draft, Working Session, then desk state");
  test.assert(a.lease.isOwner() === false && a.lease.isReadOnly() === true, "the old writer is read-only after handoff");
  test.assert(b.lease.isOwner() === true, "the requesting instance becomes the writer");
  test.assert(JSON.parse(storage.get("ai-system6-write-lease")).instanceId === b.lease.instanceId, "the stored lease moves to B");
  b.lease.release();
}

// Handoff freezes new mutations: while A is flushing, its mutating surfaces
// are disabled, and the flushed body is exactly what survives.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const c = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, c]);
  const controls = [
    { id: "quick-draft-draft", tagName: "TEXTAREA", readOnly: false, disabled: false },
    { id: "quick-draft-save", tagName: "BUTTON", readOnly: false, disabled: false },
  ];
  a.context.document = {
    body: { dataset: {} },
    querySelectorAll: () => controls,
    querySelector: () => null,
    addEventListener: () => {},
    visibilityState: "visible",
  };
  a.lease.acquire();
  c.lease.acquire();
  let flushedBody = "";
  a.context.flushPendingQuickDraftCommit = async () => {
    // While the flush is in flight the UI must already be frozen.
    test.assert(controls.every((control) => control.disabled === true), "handoff disables every mutating surface during the flush");
    test.assert(controls.find((control) => control.id === "quick-draft-draft").readOnly === true, "handoff makes the Draft Desk textarea read-only during the flush");
    flushedBody = "before";
    return true;
  };
  a.context.saveDeskState = async () => true;
  const result = await c.lease.requestTakeover();
  test.assert(result.ok === true, "takeover completes after the handoff flush");
  test.assert(flushedBody === "before", "the flushed body is exactly what was saved before handoff");
  test.assert(c.lease.isOwner() === true && a.lease.isReadOnly() === true, "the new writer owns the lease and the old window is read-only");
  c.lease.release();
}

// Failed flush: A restores writer mode, the lease stays with A, B is denied.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage, { saveDesk: false });
  const b = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b]);
  a.lease.acquire();
  b.lease.acquire();
  const result = await b.lease.requestTakeover();
  test.assert(result.ok === false && result.reason === "unsaved-work", "a failed flush denies the takeover");
  test.assert(a.lease.isOwner() === true && a.lease.isReadOnly() === false, "the old writer keeps write access after a failed handoff");
  test.assert(JSON.parse(storage.get("ai-system6-write-lease")).instanceId === a.lease.instanceId, "the stored lease still belongs to A");
  b.lease.release();
  a.lease.release();
}

// Lease moved during flush: A can no longer restore writer, goes read-only,
// and the takeover is denied.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const c = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, c]);
  a.lease.acquire();
  c.lease.acquire();
  a.context.flushPendingQuickDraftCommit = async () => {
    // A rival claims the lease while A is flushing.
    storage.set("ai-system6-write-lease", JSON.stringify({ instanceId: "rival", claimedAt: Date.now(), heartbeatAt: Date.now() }));
    return true;
  };
  a.context.saveDeskState = async () => true;
  const result = await c.lease.requestTakeover();
  test.assert(result.ok === false && result.reason === "lease-lost", "a lease that moves mid-flush denies the handoff");
  test.assert(a.lease.isReadOnly() === true, "the old writer cannot restore writer mode once the lease moved");
  c.lease.release();
}

// Three instances: A writer, B and C read-only. C's request is answered only
// by A; B never flushes and never replies.
{
  const storage = new Map();
  const a = createWriteLeaseInstance(storage);
  const b = createWriteLeaseInstance(storage);
  const c = createWriteLeaseInstance(storage);
  connectWriteLeaseChannels([a, b, c]);
  a.lease.acquire();
  b.lease.acquire();
  c.lease.acquire();
  let aFlushed = 0;
  let bFlushed = 0;
  const bReplies = [];
  a.context.flushPendingQuickDraftCommit = async () => { aFlushed += 1; return true; };
  a.context.saveDeskState = async () => true;
  b.context.flushPendingQuickDraftCommit = async () => { bFlushed += 1; return true; };
  b.context.saveDeskState = async () => true;
  b.channels.forEach((channel) => {
    const original = channel.postMessage.bind(channel);
    channel.postMessage = (message) => {
      if (message?.type === "takeover-ready" || message?.type === "takeover-denied") bReplies.push(message.type);
      original(message);
    };
  });
  const result = await c.lease.requestTakeover();
  test.assert(result.ok === true && result.writer === true, "C takes over through A");
  test.assert(aFlushed === 1 && bFlushed === 0, "only the targeted writer flushes; bystander B never flushes");
  test.assert(bReplies.length === 0, "the read-only bystander never sends ready or denied");
  test.assert(b.lease.isReadOnly() === true, "bystander B stays read-only and uninvolved");
  c.lease.release();
  a.lease.release();
}

test.finish();
