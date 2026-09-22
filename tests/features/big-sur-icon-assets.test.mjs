import vm from "node:vm";
import { createFeatureTest, read, exists } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("big-sur-icon-assets");
const window = {};
vm.runInNewContext(read("app/core/theme-registry.js"), { window });
const art = window.AISystem6Theme.getAuthoringMetadata("big-sur").art;
test.assert(art.dir === "big-sur" && art.ext === "png" && art.appearances.join() === "default", "Big Sur owns its default-only PNG family");
const source = read("app/features/theme-lab.js");
const start = source.indexOf("  function compactHintSource(themeId, id) {");
const end = source.indexOf("\n  }", start) + 4;
const compactHintSource = vm.runInNewContext(`(${source.slice(start, end)})`, {
  artOf: () => art, stampedAssetPath: (path) => path,
});
for (const id of ["finderApp", "startupDisk", "folder", "document", "controlPanel", "trashFull", "clioPaint", "clioProject", "oneMoreTune"]) {
  test.assert(compactHintSource("big-sur", id) === `assets/themes/big-sur/icons/${id}-16.png`, `${id} compact hint uses independent Big Sur artwork`);
}
const manifest = JSON.parse(read("assets/themes/big-sur/big-sur-icon-manifest.json"));
test.assert(Object.keys(manifest).length === 59, "Big Sur has its 56 base objects plus three new applications");
for (const [id, path] of Object.entries(manifest)) {
  test.assert(exists(`assets/themes/big-sur/${path}`), `${id} manifest asset exists`);
  for (const size of [16, 32, 64, 128]) {
    test.assert(exists(`assets/themes/big-sur/icons/${id}-${size}.png`), `${id} has its authored ${size} px tier`);
  }
}
test.assertIncludes(read("styles/68-big-sur-appearance.css"), ".sys-icon-svg > .sys-icon-big-sur { display: inline; }", "Big Sur selects its independent SVG group");
test.assertNotIncludes(read("styles/68-big-sur-appearance.css"), ".sys-icon-yosemite", "Big Sur no longer selects Yosemite artwork");
test.finish();
