// The innerHTML transformer (tooling/inner-html-transform.mjs) is the
// repo's conversion playbook. This contract executes it against a fixture
// and pins the invariants three repair rounds bought:
//   * escaping is stripped, owned content is wrapped;
//   * protected builder arguments are never rewritten;
//   * the call scanner checks the preceding character — the mis-shear that
//     turned padStart into padStarhtml.raw(t(...) cannot recur;
//   * the transform is idempotent (a tagged site is skipped, not retagged).

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { transformSite } from "../../tooling/inner-html-transform.mjs";

const test = createFeatureTest("inner-html-transform");

const config = {
  escapeFns: ["escapeHtml"],
  textFns: ["t"],
  markupFns: ["renderSystemIcon"],
  rawIds: {},
};

// 1. The base conversion: escape stripped, t() wrapped, join dropped.
const fixture1 = [
  "function renderList(items) {",
  "  grid.innerHTML = `<ul>${items.map((item) => `<li>${escapeHtml(t(item.key))}</li>`).join(\"\")}</ul>`;",
  "}",
].join("\n");
const out1 = transformSite(fixture1, 2, config).src;
test.assert(out1.includes("grid.innerHTML = html`"), "the outer template is tagged");
test.assert(!out1.includes("escapeHtml("), "escape wrappers are stripped");
test.assert(out1.includes("html.raw(t(item.key))"), "owned translation content rides html.raw");
test.assert(!out1.includes('.join("")'), "the tagged map's join is dropped");

// 2. The padStart mis-shear: a t( inside padStart(2, "0") must NOT be
//    wrapped - the preceding character check sees the R of padStart.
const fixture2 = [
  "function renderRow(index) {",
  "  row.innerHTML = `<span>${String(index + 1).padStart(2, \"0\")}</span><b>${t(\"row_label\")}</b>`;",
  "}",
].join("\n");
const out2 = transformSite(fixture2, 2, config).src;
test.assert(out2.includes('padStart(2, "0")'), "padStart survives whole - the preceding-character check kills the mis-shear class");
test.assert(out2.includes("html.raw(t(\"row_label\"))"), "the real t() call next to it is still wrapped");
test.assert(!/html\.raw\([^)]*html\.raw/.test(out2), "no double wrapping");

// 3. Protected spans: a builder's argument templates stay verbatim.
const config3 = { ...config, markupFns: ["renderCard"] };
const fixture3 = [
  "function renderCard(card) {",
  "  body.innerHTML = `${renderCard({ body: `<p>${escapeHtml(t(card.title))}</p>`, foot: t(\"foot\") })}`;",
  "}",
].join("\n");
const out3 = transformSite(fixture3, 2, config3).src;
// The renderCard call's ARGUMENTS stay verbatim (the builder receives them
// as data, unchanged), while the call itself is lifted into html.raw: the
// original raw template passed its trusted HTML straight through, and
// html.raw preserves exactly that pass-through.
test.assert(out3.includes("renderCard({ body: `<p>${escapeHtml(t(card.title))}</p>`, foot: t(\"foot\") })"), "the builder's arguments are untouched (protected span)");
test.assert(out3.includes("html.raw(renderCard("), "the trusted call is lifted past the outer escape with html.raw");

// 4. Idempotence: transforming the output again changes nothing.
const out4 = transformSite(out1, 2, config);
test.assert(out4.changed === false, "a tagged site is skipped - the transform is idempotent");

// 5. rawIds: a listed prebuilt-markup identifier is wrapped.
const config5 = { ...config, rawIds: { "${rows}": "${html.raw(rows)}" } };
const fixture5 = [
  "function renderTable(rows) {",
  "  host.innerHTML = `<div>${rows}</div>`;",
  "}",
].join("\n");
const out5 = transformSite(fixture5, 2, config5).src;
test.assert(out5.includes("${html.raw(rows)}"), "a rawIds identifier is lifted past the escape");

test.finish();
