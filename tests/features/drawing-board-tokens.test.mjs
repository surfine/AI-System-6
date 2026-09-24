// Drawing Board's colours are Platinum's, re-mapped by
// tooling/build-drawing-board-tokens.mjs. The contract fails when Platinum's
// token block changes and the derived region was not rebuilt, so the pencil
// theme can never drift onto a stale copy of its parent.
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("drawing-board-tokens");
let fresh = true;
try {
  execFileSync(process.execPath, [fileURLToPath(new URL("../../tooling/build-drawing-board-tokens.mjs", import.meta.url)), "--check"], { stdio: "pipe" });
} catch {
  fresh = false;
}
test.assert(fresh, "Drawing Board's derived tokens match the current Platinum token block");
const sheet = read("styles/65-drawing-board-appearance.css");
test.assertNotIncludes(sheet, "--theme-lab-", "Drawing Board dresses no Theme Lab replica");
// Platinum's rules are scoped [data-lineage~="platinum"]; run the registry and
// check the projection that carries them to Drawing Board.
const element = () => {
  const classes = new Set();
  return { dataset: {}, classList: { contains: (name) => classes.has(name), toggle(name, force) { if (force) classes.add(name); else classes.delete(name); return classes.has(name); } } };
};
const desk = { documentElement: element(), body: element(), dispatchEvent() {} };
const window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: desk };
vm.runInNewContext(read("app/core/theme-registry.js"), { window, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } });
window.AISystem6Theme.previewExperimentalTheme("drawing-board");
test.assert(desk.body.dataset.lineage === "classic platinum drawing-board", `Drawing Board descends from Platinum (lineage "${desk.body.dataset.lineage}")`);
test.finish();
