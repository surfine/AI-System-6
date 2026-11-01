import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-glass-sidebar-icons");
const liquid = read("styles/70-liquid-glass.css");
const icons = read("app/core/system-icons.js");
const tdiRuntime = read("app/features/project-disk.js");
const reader = read("app/features/reader.js");
const teachText = read("app/features/teachtext-accessories.js");
const docMap = read("app/features/docmap.js");
const timeMachine = read("app/features/time-machine.js");

test.assertIncludes(liquid, '--theme-lab-sidebar-startup-disk-image: url("./assets/themes/liquid-glass/startupDisk-16.svg")', "Liquid Glass sidebar uses its colored startup-disk icon");
test.assertIncludes(liquid, '--theme-lab-sidebar-applications-image: url("./assets/themes/liquid-glass/applications-16.svg")', "Liquid Glass sidebar uses its colored applications icon");
test.assertIncludes(liquid, '--theme-lab-sidebar-document-image: url("./assets/themes/liquid-glass/document-16.svg")', "Liquid Glass sidebar uses its colored document icon");
test.assertIncludes(liquid, '--theme-lab-sidebar-trash-image: url("./assets/themes/liquid-glass/trash-16.svg")', "Liquid Glass sidebar uses its colored trash icon");
test.assertIncludes(liquid, "--theme-lab-sidebar-system-svg-opacity: 0", "Liquid Glass sidebar prefers the authored color icon over the inline system SVG");
test.assertIncludes(liquid, "--tdi-rail-bg: var(--liquid-sidebar-tint)", "Liquid Glass TDI rails consume the shared sidebar tint token");
test.assertIncludes(liquid, "--tdi-rail-border: 0", "Liquid Glass TDI rails keep their edge-to-edge material borderless");
test.assertIncludes(icons, "function setClassicLineArtEverywhere(", "the line-art preference path remains intact");
test.assertIncludes(tdiRuntime, "renderSystemIcon(iconId", "real TDI rails use the semantic six-era icon painter");
for (const [source, iconId, label] of [
  [reader, "reader", "Reader"],
  [teachText, "teachText", "TeachText"],
  [docMap, "docMap", "DocMap"],
  [timeMachine, "timeMachine", "Time Machine"],
]) {
  test.assertIncludes(source, `iconFor: () => "${iconId}"`, `${label} declares its semantic rail icon`);
}

test.finish();
