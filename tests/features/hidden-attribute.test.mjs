// The hidden attribute has to actually hide.
//
// Twice in one session a control set `hidden` on an element, the browser
// recorded it, and the element stayed on screen — because any author rule that
// sets `display` beats the browser's `[hidden] { display: none }` whatever the
// specificity. Both times the symptom was a button that appeared to do nothing:
// Draft Desk claimed "needs a project" over a working workspace, and the ELI5
// Cancel cleared its state while its row stayed put.
//
// Static gates cannot see two strings overlapping, but they can see this: an
// element that carries `hidden` in the markup, wearing a class that some rule
// gives a `display` to, with no `.class[hidden]` guard anywhere. The count is a
// decrease-only ratchet, like the liquid-glass twins: the debt here is real and
// pre-existing, and the gate exists so it can only get smaller.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, desktopRoot, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("hidden-attribute");
const html = read("index.html");
const styleDir = join(desktopRoot, "styles");
const css = readdirSync(styleDir)
  .filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(join(styleDir, name), "utf8"))
  .join("\n");

const hiddenClasses = new Set();
for (const tag of html.match(/<[a-zA-Z][^>]*\shidden[\s/>]/g) || []) {
  const classes = /class="([^"]+)"/.exec(tag);
  if (classes) classes[1].split(/\s+/).filter(Boolean).forEach((name) => hiddenClasses.add(name));
}
test.assert(hiddenClasses.size > 0, "the markup really does hide elements with the attribute");

const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1].trim(),
  body: match[2],
}));

const unguarded = [...hiddenClasses].filter((name) => {
  const painted = blocks.some((block) => (
    new RegExp(`\\.${name}(?![a-zA-Z0-9_-])(?!\\[hidden\\])[^,{]*(,|$)`).test(block.selector)
    && /(^|;|\s)display\s*:/.test(block.body)
  ));
  if (!painted) return false;
  return !blocks.some((block) => (
    block.selector.includes(`.${name}[hidden]`) && /display\s*:\s*none/.test(block.body)
  ));
}).sort();

// Decrease-only. Lower this number in the same change that adds a guard; never
// raise it to land a new surface that forgets one.
const UNGUARDED_BUDGET = 19;
test.assert(
  unguarded.length <= UNGUARDED_BUDGET,
  `classes whose display rule can outvote [hidden] stays at or below ${UNGUARDED_BUDGET} (now ${unguarded.length}${unguarded.length > UNGUARDED_BUDGET ? `: ${unguarded.slice(0, 6).join(", ")}` : ""})`
);

// The two that were repaired stay repaired.
test.assert(!unguarded.includes("finder-empty-object"), "the empty-object card cannot outvote hidden again");
test.assert(!unguarded.includes("draft-desk-eli5-candidate"), "the ELI5 candidate row cannot outvote hidden again");
test.assert(!unguarded.includes("draft-desk-eli5-actions"), "the ELI5 action row cannot outvote hidden again");

test.finish();
