// The shared ask bar reports the scope the next question will really carry,
// using the same describe() answer that decides whether it can be asked - and
// it never invents a range the source did not resolve.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("ask-bar-scope");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

// A form of the shape the real windows use, registered the way they do.
run(`
  // The harness never fetches a language table, so the two keys the bar uses
  // are supplied here: the test is about which scope the bar reports, not
  // about the wording of the translations.
  window.__askBarCopy = {
    ask_scope_announcement: (object, range) => \`reads \${object} — \${range}\`,
    ask_scope_unavailable: "nothing to ask about yet",
  };
  t = (key, ...args) => {
    const entry = window.__askBarCopy[key];
    return typeof entry === "function" ? entry(...args) : String(key);
  };
  const existing = document.querySelector('[data-ask-source="scope-fixture"]');
  if (!existing) {
    const form = document.createElement("form");
    form.dataset.askSource = "scope-fixture";
    form.innerHTML = '<input type="text"><button type="submit">Ask</button>';
    document.body.appendChild(form);
  }
  window.__scopeValue = null;
  registerAskBarSource("scope-fixture", () => window.__scopeValue);
`);

const ready = await run(`
  (() => {
  window.__scopeValue = { ready: true, object: "Reader", range: "Whole source" };
  refreshAskBar("scope-fixture");
  const form = document.querySelector('[data-ask-source="scope-fixture"]');
  return {
    scope: form.dataset.askScope,
    described: form.getAttribute("aria-description"),
    title: form.title,
    inputDisabled: form.querySelector("input").disabled,
  };
  })()
`);
test.assert(
  /Reader/.test(ready.scope) && /Whole source/.test(ready.scope),
  "a ready bar announces the object and the range the question will read"
);
test.assert(
  ready.described === ready.scope && ready.title === ready.scope,
  "the same sentence is the accessible description and the tooltip"
);
test.assert(ready.inputDisabled === false, "and the bar stays usable");

const collapsed = await run(`
  (() => {
  window.__scopeValue = { ready: false };
  refreshAskBar("scope-fixture");
  const form = document.querySelector('[data-ask-source="scope-fixture"]');
  return {
    scope: form.dataset.askScope,
    inputDisabled: form.querySelector("input").disabled,
    title: form.title,
  };
  })()
`);
test.assert(collapsed.inputDisabled === true, "a bar with nothing to ask about is disabled as before");
test.assert(
  collapsed.scope.length > 0 && collapsed.title === collapsed.scope,
  "and it says what is missing instead of only greying out"
);

const noRange = await run(`
  (() => {
  window.__scopeValue = { ready: true, object: "Reader" };
  refreshAskBar("scope-fixture");
  const form = document.querySelector('[data-ask-source="scope-fixture"]');
  return { scope: form.dataset.askScope, title: form.title };
  })()
`);
test.assert(
  noRange.scope === "",
  "a source that resolved no range gets no invented range text"
);

const throwing = await run(`
  (() => {
  registerAskBarSource("scope-throws", () => { throw new Error("describe failed"); });
  const throwingForm = document.createElement("form");
  throwingForm.dataset.askSource = "scope-throws";
  throwingForm.innerHTML = '<input type="text"><button type="submit">Ask</button>';
  document.body.appendChild(throwingForm);
  refreshAskBar("scope-throws");
  return { disabled: throwingForm.querySelector("input").disabled, scope: throwingForm.dataset.askScope };
  })()
`);
test.assert(
  throwing.disabled === true && throwing.scope.length > 0,
  "a describe() that throws leaves the bar disabled and explained rather than blank"
);

test.finish();
