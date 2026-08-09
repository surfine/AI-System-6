// Read-only honesty: when this instance does not own the write lease, the UI
// enters read-only mode — mutating surfaces become readonly/disabled while
// reading, copying, sharing, downloading and exporting stay available.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createWriteLeaseInstance } from "../helpers/write-lease-vm.mjs";

const test = createFeatureTest("read-only-surface");
const leaseSource = read("app/core/write-lease.js");
const html = read("index.html");

function controlElement(id) {
  return {
    id,
    tagName: "TEXTAREA",
    disabled: false,
    readOnly: false,
    matches: () => false,
  };
}

// VM: writer mode enables the mutating surfaces; read-only disables them and
// marks the document body.
{
  const storage = new Map();
  const instance = createWriteLeaseInstance(storage);
  const controls = ["quick-draft-draft", "teachtext-body"].map(controlElement);
  instance.context.document = {
    body: { dataset: {} },
    querySelectorAll: () => controls,
    querySelector: () => null,
    addEventListener: () => {},
    visibilityState: "visible",
  };
  instance.lease.acquire();
  test.assert(instance.context.document.body.dataset.writeMode === "writer", "the writer instance advertises write mode");
  test.assert(controls.every((control) => control.readOnly === false && control.disabled === false), "writer mode keeps mutating surfaces enabled");
  instance.lease.enterReadOnly("test");
  test.assert(instance.context.document.body.dataset.writeMode === "readonly", "read-only mode is advertised on the body");
  test.assert(controls.every((control) => control.readOnly === true && control.disabled === true), "read-only mode disables mutating surfaces");
}

// Static contract: the disabled selectors cover the named mutating surfaces,
// and those controls exist in the real document.
test.assertIncludes(leaseSource, "READ_ONLY_DISABLE_SELECTORS", "read-only disables a defined control set");
for (const selector of [
  "#quick-draft-draft",
  "#quick-draft-save",
  "#quick-draft-save-project-doc",
  "[data-quick-draft-adjustment-apply]",
  "[data-quick-draft-adjustment-develop]",
  "[data-quick-draft-protect-selection]",
  "#teachtext-body",
  "[data-action='new-folder']",
  "[data-action='rename-file']",
  "[data-action='move-file-trash']",
  "[data-action='new-project-disk']",
  "#new-project-disk-name",
]) {
  test.assertIncludes(leaseSource, selector, `read-only disables ${selector}`);
}
for (const id of ["quick-draft-draft", "quick-draft-save", "quick-draft-save-project-doc", "teachtext-body", "new-project-disk-name"]) {
  test.assertIncludes(html, `id="${id}"`, `the real document has ${id}`);
}
test.assertIncludes(html, "data-quick-draft-adjustment-apply", "the real document has the Apply control");
test.assertIncludes(html, "data-quick-draft-adjustment-develop", "the real document has the Develop control");
test.assertIncludes(html, "data-quick-draft-protect-selection", "the real document has the Protect control");

test.finish();
