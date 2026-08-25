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

// VM: writer enables the declared surfaces; read-only and handoff both freeze
// them and mark the document body.
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
  test.assert(instance.context.document.body.dataset.writeMode === "writer", "the writer instance advertises write mode");
  test.assert(controls.every((control) => control.readOnly === false && control.disabled === false), "writer mode keeps declared mutating surfaces enabled");
  instance.lease.enterReadOnly("test");
  test.assert(instance.context.document.body.dataset.writeMode === "readonly", "read-only mode is advertised on the body");
  test.assert(controls.every(isFrozen), "read-only mode freezes declared mutating surfaces");
  test.assert(controls.every((control) => control.disabled === false), "a frozen text surface stays enabled so it can still be read, selected and copied");
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

// Static contract: the freeze is declarative, and the core surfaces declare it.
test.assertIncludes(leaseSource, 'document.querySelectorAll("[data-requires-write]")', "read-only freezes declared write surfaces");
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
test.assertMatches(
  chatMessages,
  /async function submitUserTextCore\(userText, options = \{\}\) \{\s*\n\s*if \(!userText\) return;\s*\n\s*if \(window\.AISystem6WriteLease\?\.canMutate\?\.\(\) !== true\) \{/,
  "the submit path re-checks the write lease before creating the first Chat file"
);
test.assertIncludes(chatMessages, 'sendButton.disabled = readOnly ||', "Send stays disabled while another window owns writes");
test.assertIncludes(chatMessages, 'button.dataset.action = "use-this-window-for-clio";', "the read-only welcome offers Use This Window");
test.assertMatches(
  guide,
  /async function useThisWindowForClio\(\) \{\s*\n\s*const result = await window\.AISystem6WriteLease\?\.requestTakeover\?\.\(\);/,
  "Use This Window goes through the safe takeover handshake"
);
test.assertMatches(
  guide,
  /showDenied|showConflict/,
  "a refused takeover reports the real reason instead of pretending to switch tabs"
);

test.finish();
