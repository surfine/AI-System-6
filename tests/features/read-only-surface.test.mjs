// Read-only honesty is declarative: elements that mutate durable state carry
// `data-requires-write`, and read-only / handoff freeze them in one sweep.
//
// How a surface freezes depends on what it is. A text surface goes readOnly and
// stays enabled, because a locked document must still be focusable, selectable,
// scrollable and copyable, and must keep its place in the tab order; disabling
// a textarea takes all of that away and says "broken" rather than "locked".
// Everything else (buttons, selects, checkboxes) disables.
//
// The lease is also the single writer of that property. Other reasons for a
// surface to be read-only - the writing route handing the pen between the
// Manuscript and Section Drafts - register as rules instead of assigning
// element.readOnly themselves, because two owners of one property means the
// last one to run wins and the route's single-editable-owner rule silently
// loses.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createWriteLeaseInstance } from "../helpers/write-lease-vm.mjs";

const test = createFeatureTest("read-only-surface");
const leaseSource = read("app/core/write-lease.js");
// 文字亮室 builds its own window, so its markup is a block in draft-desk.js
// rather than a section in index.html. Take that block only -- pulling in the
// whole module would let its code satisfy this file's markup assertions.
const lightroomModuleSource = read("app/features/draft-desk.js");
const lightroomWindowMarkup = lightroomModuleSource.slice(
  lightroomModuleSource.indexOf("function installLightroomWindow"),
  lightroomModuleSource.indexOf("installLightroomWindow();"),
);
const html = `${read("index.html")}\n${lightroomWindowMarkup}`;

function controlElement(id, tagName = "TEXTAREA") {
  return {
    id,
    tagName,
    dataset: { requiresWrite: "" },
    disabled: false,
    readOnly: false,
    classList: { toggle: () => {} },
  };
}

function isFrozen(control) {
  return String(control.tagName).toUpperCase() === "TEXTAREA"
    ? control.readOnly === true && control.disabled === false
    : control.disabled === true;
}

// VM: not holding the lease no longer freezes anything. The lease holds the
// DATABASE CONNECTION, not the user's permission to type: a window without it
// hands its writes to the window that has it, and each record carries the base
// it must still match, so a stale write is refused rather than laid over the
// top. The window still advertises its mode, because the rest of the runtime
// needs to know where the connection is.
{
  const storage = new Map();
  const instance = createWriteLeaseInstance(storage);
  const controls = ["quick-draft-draft", "teachtext-body"].map((id) => controlElement(id));
  instance.context.document = {
    body: { dataset: {} },
    querySelectorAll: () => controls,
    querySelector: () => null,
    addEventListener: () => {},
    visibilityState: "visible",
  };
  await instance.lease.acquire();
  test.assert(instance.context.document.body.dataset.writeMode === "writer", "the connection holder advertises write mode");
  test.assert(controls.every((control) => control.readOnly === false && control.disabled === false), "the holder keeps declared mutating surfaces enabled");
  instance.lease.enterReadOnly("test");
  test.assert(instance.context.document.body.dataset.writeMode === "readonly", "a window without the connection still advertises which mode it is in");
  test.assert(
    controls.every((control) => control.readOnly === false && control.disabled === false),
    "a window without the connection stays fully editable - its writes travel to the window that holds it",
  );
}

// Handoff also freezes new mutations (the same sweep), while the lease stays
// owned and storage writes may finish.
{
  const storage = new Map();
  const instance = createWriteLeaseInstance(storage);
  const controls = ["quick-draft-draft"].map((id) => controlElement(id));
  instance.context.document = {
    body: { dataset: {} },
    querySelectorAll: () => controls,
    querySelector: () => null,
    addEventListener: () => {},
    visibilityState: "visible",
  };
  await instance.lease.acquire();
  instance.lease.enterHandoff("test");
  test.assert(instance.context.document.body.dataset.writeMode === "handoff", "handoff advertises its write mode");
  test.assert(controls.every(isFrozen), "handoff freezes new mutations");
  test.assert(instance.lease.canMutate() === false, "handoff cannot start new mutations");
  test.assert(instance.lease.isOwner() === true, "handoff still owns the lease");
  instance.lease.restoreWriterAfterFailedHandoff();
  test.assert(instance.context.document.body.dataset.writeMode === "writer", "a failed handoff restores writer mode");
  test.assert(controls.every((control) => control.readOnly === false && control.disabled === false), "a failed handoff re-enables the declared surfaces");
  await instance.lease.release();
}

// Handoff is now the ONLY lease state that freezes, and that is deliberate:
// there the holder is flushing its last durable writes before letting go, so
// it must not take on new ones. Every other window keeps working.
test.assertMatches(
  leaseSource,
  /function elementIsReadOnly\(element\) \{[\s\S]{0,600}?if \(leaseState\.mode === "handoff"\) return true;/,
  "only handoff freezes on the lease's account",
);
test.assertNotMatches(
  leaseSource,
  /function elementIsReadOnly\(element\) \{[\s\S]{0,600}?if \(leaseState\.mode !== "writer"\) return true;/,
  "not holding the lease is not a reason to freeze a surface",
);

// Static contract: the freeze is declarative, and the core surfaces declare it.
test.assertIncludes(leaseSource, 'document.querySelectorAll("[data-requires-write]")', "the freeze still runs as one declarative sweep");
test.assertNotIncludes(leaseSource, "READ_ONLY_DISABLE_SELECTORS", "read-only no longer uses a hand-maintained selector list");
for (const id of ["quick-draft-draft", "quick-draft-save", "quick-draft-save-project-doc", "teachtext-body", "new-project-disk-name", "new-project-disk"]) {
  test.assertIncludes(html, `data-requires-write`, `the real document declares write requirement`);
  test.assertIncludes(html, `id="${id}"`, `the real document has ${id}`);
}
test.assertIncludes(html, "data-quick-draft-adjustment-apply", "the Apply control exists");
test.assertIncludes(html, "data-quick-draft-adjustment-develop", "the Develop control exists");
test.assertIncludes(html, "data-quick-draft-protect-selection", "the Protect control exists");

// The ClioTalk composer joins the same declarative contract: the textarea and
// Send freeze with the sweep, the submit function re-checks the lease at the
// storage boundary, and the read-only welcome offers the real safe takeover
// instead of a typable composer beside a frozen conversation.
const chatMessages = read("app/core/chat-messages.js");
const guide = read("app/features/writer-guide.js");
test.assertMatches(html, /id="prompt"[^>]*data-requires-write/, "the ClioTalk composer declares its write requirement");
test.assertMatches(html, /id="send"[^>]*data-requires-write/, "the ClioTalk Send button declares its write requirement");
// Sending no longer asks the lease for permission. The Chat file it creates is
// an ordinary durable record: it is planned here and written by whichever
// window holds the connection, checked against its base like any other.
test.assertMatches(
  chatMessages,
  /async function submitUserTextCore\(userText, options = \{\}\) \{\s*\n\s*if \(!userText\) return;\s*\n\s*await ensureModelUserErrors\(\);/,
  "the submit path no longer gates the first Chat file on holding the lease"
);
test.assertNotIncludes(chatMessages, "sendButton.disabled = readOnly ||", "Send does not wait on the write lease");
test.assertNotIncludes(chatMessages, 'button.dataset.action = "use-this-window-for-clio"', "no window has to be invited to become the one that writes");
// The takeover handshake itself stays: it is how the connection moves when a
// holder is unresponsive, and it still reports a real refusal rather than
// pretending. It is simply no longer something a person is asked to do.
test.assertMatches(
  guide,
  /showDenied|showConflict/,
  "a refused takeover still reports the real reason instead of pretending to switch tabs"
);

// The explanation has to move with the lease in BOTH directions. Freezing the
// surface refreshed the menus and the notice; unfreezing it refreshed neither,
// and the silent reclaim on focus is the common way a window gets the pen back
// - so the window that could write again went on showing the read-only notice
// and the greyed commands that explained a lock it no longer had.
test.assertIncludes(leaseSource, "function refreshWriteLeaseSurfaces()", "one place refreshes the surfaces that explain the lock");
test.assertMatches(
  leaseSource,
  /const becameWriter = value && leaseState\.mode !== "writer";/,
  "setWriter knows when the pen arrives, not only when it leaves"
);
test.assertMatches(
  leaseSource,
  /if \(becameWriter\) refreshWriteLeaseSurfaces\(\);/,
  "taking the pen back refreshes the notice and the menus"
);
test.assertMatches(
  leaseSource,
  /function enterReadOnly\([\s\S]*?refreshWriteLeaseSurfaces\(\);/,
  "losing the pen refreshes the same surfaces"
);
test.assertIncludes(
  leaseSource,
  'if (typeof renderClioTalkWelcome === "function") renderClioTalkWelcome();',
  "the ClioTalk notice is one of those surfaces"
);

test.finish();
