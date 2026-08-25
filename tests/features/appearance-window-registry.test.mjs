import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import {
  applicationCssPrefixes,
  windowInterfaceRegistry,
} from "../../tooling/interface-guidelines-contract.mjs";

const test = createFeatureTest("appearance-window-registry");
const audit = read("tooling/audit-app-theme-coverage.mjs");
const screenshot = read("tooling/screenshot-window-coverage.mjs");
const appearanceGate = read("tooling/verify-appearance-app-coverage.mjs");
const cssGate = read("tooling/verify-css.mjs");
const cssBudget = JSON.parse(read("tooling/css-budget.json"));
const index = read("index.html");

const entries = Object.entries(windowInterfaceRegistry);
const dynamicWindows = Object.fromEntries(entries.filter(([, contract]) => contract.sourceKind !== "static"));

const staticWindowIds = [...index.matchAll(/\bdata-window="([^"]+)"/g)].map((match) => match[1]);
test.assert(
  entries.length === new Set(staticWindowIds).size + Object.keys(dynamicWindows).length,
  "one tooling registry owns all current static, dynamic, and lazy windows",
);
for (const [id, sourceKind] of [
  ["sideAskPad", "dynamic"],
  ["imagePromptStudio", "lazy"],
  ["micropolis", "lazy"],
  ["openttd", "lazy"],
  ["doom", "lazy"],
  ["bonsaiCity", "lazy"],
]) {
  const contract = dynamicWindows[id];
  test.assert(contract?.sourceKind === sourceKind, `${id} is registered as ${sourceKind}`);
  test.assert(contract?.ensure === "loadLazyWindowModule", `${id} uses the real lazy-window mount boundary`);
  test.assert(contract?.openCommand, `${id} declares its open command`);
  test.assert(contract?.mountPath.includes("#"), `${id} names its source file and mount symbol`);
  test.assert(contract?.appearanceProbe?.sampleSelector, `${id} has a computed Appearance probe`);
}

for (const prefix of ["sideask-pad-", "image-prompt-studio-", "ips-", "micropolis-", "openttd-", "doom-", "bonsai-"]) {
  test.assert(applicationCssPrefixes.includes(prefix), `${prefix} participates in the child-app selector ratchet`);
}
test.assert(!Object.hasOwn(cssBudget, "childAppSpecificPrefixes"), "the CSS budget no longer owns a second app-prefix list");
test.assertIncludes(cssGate, "applicationCssPrefixes", "CSS verification derives application ownership from the window registry");
test.assertNotIncludes(cssGate, "budget.childAppSpecificPrefixes", "CSS verification no longer reads the retired budget prefix list");

for (const [name, source] of [
  ["coverage audit", audit],
  ["window screenshot sweep", screenshot],
  ["real-app propagation gate", appearanceGate],
]) {
  test.assertIncludes(source, "windowInterfaceRegistry", `${name} imports the single window authority`);
}
test.assertIncludes(audit, "Object.entries(windowInterfaceRegistry)", "the audit enumerates registry entries rather than only index.html");
test.assertIncludes(screenshot, "Object.entries(windowInterfaceRegistry)", "the screenshot sweep enumerates registry entries");
test.assertIncludes(appearanceGate, "REGISTERED_WINDOWS", "the six-theme computed gate covers the registry set");
test.assertIncludes(appearanceGate, "contract.appearanceProbe.representative", "role screenshots are selected by registry metadata");
test.assertNotIncludes(appearanceGate, "const REPRESENTATIVE_WINDOWS", "the real-app gate no longer owns a hard-coded ten-window list");

test.finish();
