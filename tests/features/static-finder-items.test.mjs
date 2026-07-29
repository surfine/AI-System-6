import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("static-finder-items");
const app = read("app.js");
const runtime = read("app/core/desktop-runtime.js");
const actions = read("app/core/actions.js");
const windows = read("app/core/window-manager.js");
const icons = read("app/core/system-icons.js");

test.assertIncludes(app, "function withStaticFinderMetadata(items, location)", "one helper owns static Finder metadata");
for (const name of ["System", "Finder", "MultiFinder", "DA Handler"]) {
  test.assertIncludes(app, `name: "${name}"`, `System Folder includes ${name}`);
}
for (const iconId of ["systemFile", "finderApp", "multiFinderApp", "daHandler"]) {
  test.assertIncludes(app, `iconId: "${iconId}"`, `System Folder gives ${iconId} its own silhouette`);
  test.assertIncludes(icons, `${iconId}: \``, `system icon registry defines ${iconId}`);
}
test.assertIncludes(app, 'iconId: "systemFolder"', "Startup Disk gives the blessed System Folder a distinct icon");
test.assertIncludes(app, 'iconId: "helpFolder"', "Startup Disk distinguishes Help Folder from System Folder");
test.assertIncludes(app, 'sizeLabel: item.sizeLabel || t("built_in")', "virtual objects use an honest built-in size label");
test.assertIncludes(app, "staticFinderBuildDate()", "modified dates derive from the real build stamp");
test.assertIncludes(app, 'count.textContent = t("items_count", items.length)', "Finder count follows the filtered registry");
test.assertIncludes(app, "item.updatedAt ? new Date(item.updatedAt).toLocaleDateString()", "list view renders modified dates");
test.assertMatches(runtime, /finderContainerWindowNames\.includes\(name\)[\s\S]*getSelectedStaticFinderItem/, "static Finder selections reach the existing Get Info window");
test.assertMatches(runtime, /item\.virtual[\s\S]*kindLabel = item\.kind/, "File Info renders virtual system objects");
test.assertIncludes(windows, '"open-file-info": !!activeItem', "Get Info availability follows the selected static item or real volume root");
test.assertIncludes(actions, '"open-system-file-system"', "opening a non-app system object uses the existing alert path");

test.finish();
