import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-glass-concentric-radius");
const liquid = read("styles/70-liquid-glass.css");
const steps = ["xs", "sm", "md", "lg", "xl"].map((size) =>
  Number(liquid.match(new RegExp(`--r-${size}: ([0-9]+)px`))?.[1]),
);
test.assert(steps.every((value, index) => value > 0 && (!index || value > steps[index - 1])),
  "the Liquid corner scale is positive and strictly increases with surface size");
test.assertIncludes(liquid, "--r-pill: 999px", "capsules are distinct from fixed-radius surfaces");
test.assertIncludes(liquid, "--r-circle: 50%", "circular controls retain their own shape");
test.assertIncludes(liquid, "--choice-radius: var(--r-xs)", "small checkboxes stay distinct from circular radio buttons");
test.assertIncludes(liquid, "--window-radius: var(--r-xl)", "windows own the outermost curve");
test.assertIncludes(liquid, "--surface-radius: var(--r-lg)", "framed panels share the next inner curve");
test.assertIncludes(liquid, "--btn-radius: var(--r-md)", "regular buttons use the control step");
test.assertIncludes(liquid, "--item-radius: var(--r-sm)", "compact list controls share the inner step");
test.assertIncludes(liquid, "max(var(--r-xs), calc(var(--container-radius) - var(--container-inset)))",
  "concentric surfaces subtract their actual inset without becoming square");
test.assertNotIncludes(liquid, "border-radius: 999px;", "capsule consumers use the shared shape scale");
test.assertNotIncludes(liquid, "border-radius: 18px;", "surfaces do not keep an independent 18px curve");
test.assertNotIncludes(liquid, "border-radius: 12px;", "controls consume the shared scale");

test.finish();
