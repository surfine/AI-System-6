// Read-only honesty is declarative: elements that mutate durable state carry
// `data-requires-write`, and read-only / handoff freeze them in one sweep.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createWriteLeaseInstance } from "../helpers/write-lease-vm.mjs";

const test = createFeatureTest("read-only-surface");
const leaseSource = read("app/core/write-lease.js");
const html = read("index.html");

function controlElement(id, tagName = "TEXTAREA") {
  return {
    id,
    tagName,
    dataset: { requiresWrite: "" },
    disabled: false,
    readOnly: false,
  };
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
  instance.lease.acquire();
  test.assert(instance.context.document.body.dataset.writeMode === "writer", "the writer instance advertises write mode");
  test.assert(controls.every((control) => control.readOnly === false && control.disabled === false), "writer mode keeps declared mutating surfaces enabled");
  instance.lease.enterReadOnly("test");
  test.assert(instance.context.document.body.dataset.writeMode === "readonly", "read-only mode is advertised on the body");
  test.assert(controls.every((control) => control.readOnly === true && control.disabled === true), "read-only mode freezes declared mutating surfaces");
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
  instance.lease.acquire();
  instance.lease.enterHandoff("test");
  test.assert(instance.context.document.body.dataset.writeMode === "handoff", "handoff advertises its write mode");
  test.assert(controls.every((control) => control.readOnly === true && control.disabled === true), "handoff freezes new mutations");
  test.assert(instance.lease.canMutate() === false, "handoff cannot start new mutations");
  test.assert(instance.lease.isOwner() === true, "handoff still owns the lease");
  instance.lease.restoreWriterAfterFailedHandoff();
  test.assert(instance.context.document.body.dataset.writeMode === "writer", "a failed handoff restores writer mode");
  test.assert(controls.every((control) => control.readOnly === false && control.disabled === false), "a failed handoff re-enables the declared surfaces");
  instance.lease.release();
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

test.finish();
