// System 7's icon family is derived, not drawn: tooling/build-system-7-icons.mjs
// colours each Classic outline on the System 7 palette. The contract holds the
// two things that can drift: every Classic object has both System 7 tiers, and
// the committed PNGs are exactly what the builder produces from today's
// Classic art (so a Classic redraw cannot leave System 7 on the old shape).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("system-7-icons");
const classicDir = fileURLToPath(new URL("../../apps/desktop/assets/themes/classic/icons", import.meta.url));
const ids = readdirSync(classicDir).filter((name) => /-32\.svg$/.test(name) && !name.includes("-mask-")).map((name) => name.replace(/-32\.svg$/, ""));
for (const id of ids) {
  test.assert(exists(`assets/themes/system-7/icons/${id}-32.png`) && exists(`assets/themes/system-7/icons/${id}-16.png`), `${id} has System 7 icons at 32 and 16 px`);
}
// Ask the registry about System 7 itself: Big Sur carries the same capability,
// so a text search of the file could never fail for System 7.
const registryHost = {};
vm.runInNewContext(read("app/core/theme-registry.js"), { window: registryHost });
const registry = registryHost.AISystem6Theme;
test.assert(registry.hasCapability("independent-icons", "system-7"), "System 7 draws its own icon layer through the registry capability");
test.assert(registry.getTheme("system-7").classicIconTiers === true, "System 7's icons are requested at the Classic 16/32 px tiers");
test.assertIncludes(read("styles/65-system-7-appearance.css"), ".sys-icon-svg > .sys-icon-system-7 { display: inline; }", "the System 7 sheet shows only its own icon layer");
let rebuilt = true;
try {
  execFileSync(process.execPath, [fileURLToPath(new URL("../../tooling/build-system-7-icons.mjs", import.meta.url)), "--check"], { stdio: "pipe" });
} catch {
  rebuilt = false;
}
test.assert(rebuilt, "the committed System 7 icons are exactly what the builder makes from the current Classic art");
test.finish();
