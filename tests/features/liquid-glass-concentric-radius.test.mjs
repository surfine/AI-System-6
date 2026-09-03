import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-glass-concentric-radius");
const liquid = read("styles/70-liquid-glass.css");

test.assertIncludes(liquid, "--liquid-card-radius-lg: 18px", "Liquid Glass names its large nested-card radius");
test.assertIncludes(liquid, "--liquid-card-radius-md: 16px", "Liquid Glass names its medium nested-card radius");
test.assertIncludes(liquid, "--liquid-card-radius-sm: 12px", "Liquid Glass names its small nested-card radius");
test.assertIncludes(liquid, "--liquid-card-radius-xs: 14px", "Liquid Glass names its extra-small nested-card radius");
test.assertIncludes(liquid, "--liquid-pill-radius: 999px", "Liquid Glass names its pill radius");
test.assertIncludes(liquid, "--liquid-surface-radius-lg: 18px", "Liquid Glass names its large surface radius");
test.assertIncludes(liquid, "--liquid-surface-radius-sm: 12px", "Liquid Glass names its small surface radius");
test.assertIncludes(liquid, "border-radius: var(--liquid-card-radius-lg)", "Finder operation subject consumes the large card radius token");
test.assertIncludes(liquid, "border-radius: var(--liquid-card-radius-md)", "Finder operation list consumes the medium card radius token");
test.assertIncludes(liquid, "border-radius: var(--liquid-card-radius-sm)", "Finder operation item consumes the small card radius token");
test.assertIncludes(liquid, "border-radius: var(--liquid-card-radius-xs)", "Finder operation result consumes the extra-small card radius token");
test.assertNotIncludes(liquid, "border-radius: 999px;", "no liquid selector keeps a hard-coded pill radius");
test.assertNotIncludes(liquid, "border-radius: 18px;", "no liquid selector keeps a hard-coded 18px surface radius");
test.assertNotIncludes(liquid, "border-radius: 12px;", "no liquid selector keeps a hard-coded 12px surface radius");

test.finish();
