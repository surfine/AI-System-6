// The style bundle is minified by hand-written code, so a selector that means
// one thing in styles/ must mean the same thing in styles.bundle.css. The trap
// this test exists for: `:` is a tightening character in a declaration
// (`color: red` -> `color:red`) but NOT in a selector, where the space in
// `.a :is(b)` is a descendant combinator. Deleting it silently turns ~20 rules
// into selectors that match nothing.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { minifyCss } from "../../scripts/lib/minify-css.mjs";

const test = createFeatureTest("css-bundle");

// Descendant `:is()` / `:not()` / `:where()` keeps its combinator.
test.assert(
  minifyCss(".control-panel :is(h3, summary) { font-size: 13px; }") ===
    ".control-panel :is(h3,summary){font-size:13px;}",
  "A descendant :is() keeps the space that makes it a descendant"
);
test.assert(
  minifyCss(".message-content :not(pre) > code { padding: 0 3px; }") ===
    ".message-content :not(pre)>code{padding:0 3px;}",
  "A descendant :not() keeps the space that makes it a descendant"
);
test.assert(
  minifyCss("body :where(.a, .b) { color: red; }") === "body :where(.a,.b){color:red;}",
  "A descendant :where() keeps the space that makes it a descendant"
);
test.assert(
  minifyCss("@media (max-width: 860px) { body:not(.x) :is(.a, .b) { min-height: 0; } }") ===
    "@media (max-width:860px){body:not(.x) :is(.a,.b){min-height:0;}}",
  "Descendant pseudo-classes survive inside a nested at-rule"
);
test.assert(
  minifyCss("@container (max-width: 470px) { .a :is(.btn, input) { min-height: 44px; } }") ===
    "@container (max-width:470px){.a :is(.btn,input){min-height:44px;}}",
  "Descendant pseudo-classes survive inside a container query"
);

// The compound forms must stay compound: no space may be invented either.
test.assert(
  minifyCss("body:not(.is-writer-mode) .window:is(.a, .b) { top: 0; }") ===
    "body:not(.is-writer-mode) .window:is(.a,.b){top:0;}",
  "A compound :is() stays attached to its subject"
);
test.assert(
  minifyCss(".window.is-collapsed > :not(.title-bar) { display: none; }") ===
    ".window.is-collapsed>:not(.title-bar){display:none;}",
  "An explicit child combinator still absorbs the surrounding space"
);

// Declarations keep tightening — the space before `:` there is noise.
test.assert(
  minifyCss(".a { color : red; background : blue; }") === ".a{color:red;background:blue;}",
  "Declaration colons still tighten inside a rule body"
);
test.assert(
  minifyCss("@media (min-width : 100px) { .a { color: red; } }") ===
    "@media (min-width:100px){.a{color:red;}}",
  "Media feature colons still tighten"
);
test.assert(
  minifyCss(":root { --x: calc(10px + 2px); }") === ":root{--x:calc(10px + 2px);}",
  "A top-level rule body is still declaration context"
);

// The live bundle is the thing that ships: prove the real rules made it through.
const bundle = read("styles.bundle.css");
test.assertIncludes(
  bundle,
  ".control-panel :is(h3,summary,label,span,b,small)",
  "The shipped bundle keeps Control Panel's descendant :is()"
);
test.assertNotMatches(
  bundle,
  /[.\w-]\)?:is\(h3,summary/,
  "No shipped rule collapsed a descendant :is() onto its ancestor"
);

test.finish();
