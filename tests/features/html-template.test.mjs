// The html`` tagged template is the structural answer to innerHTML assembly:
// escaping is the default, not a per-site discipline. This contract executes
// the real strings.js helpers and pins the invariants a conversion relies on
// - forget the hatch and markup double-escapes (visible, not dangerous);
// forget nothing and an injected string stays inert.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import vm from "node:vm";

const test = createFeatureTest("html-template");
// The whole file, not slices: html.raw is wired by a top-level statement, and
// the contract must fail if the helpers and their wiring drift apart. It runs
// in its own VM context — real execution of the shipped source, not a reading.
const { escapeHtml, html } = vm.runInContext(
  `${read("app/core/strings.js")}\n;({ escapeHtml, html })`,
  vm.createContext({}),
);

test.assert(typeof html === "function" && typeof html.raw === "function", "strings.js ships the html`` helper and its raw hatch");

test.assert(
  html`<b>${'<img src=x onerror="alert(1)">'}</b>` === "<b>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</b>",
  "an interpolated string is escaped by default",
);
test.assert(html`${`<b>`}` === "&lt;b&gt;", "a nested template's output is escaped too - composition goes through arrays or html.raw");
test.assert(html`<i>${html.raw("<u>ok</u>")}</i>` === "<i><u>ok</u></i>", "html.raw is the explicit hatch for owned markup");
test.assert(html`<span>${0}</span>` === "<span>0</span>", "a zero renders - the raw escapeHtml `|| \"\"` quirk must not swallow it");
test.assert(html`<span>${false}</span>` === "<span>false</span>", "a boolean renders as itself");
test.assert(html`<span>${null}${undefined}</span>` === "<span></span>", "null and undefined render as nothing");
test.assert(
  html`<ul>${["<a>", ["<b>", html.raw("<c>")]]}</ul>` === "<ul>&lt;a&gt;&lt;b&gt;<c></ul>",
  "arrays flatten and join",
);
test.assert(html`<a data-name="${'He said "hi"'}">` === `<a data-name="${escapeHtml('He said "hi"')}">`, "attribute interpolation escapes quotes");
test.assert(escapeHtml(0) === "" && escapeHtml(5) === "5", "escapeHtml keeps its existing `|| \"\"` semantics - callers depend on it");

test.finish();
