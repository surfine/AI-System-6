import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("static-finder-items");
const app = read("app.js");
const runtime = read("app/core/desktop-runtime.js");
const actions = read("app/core/actions.js");
const windows = read("app/core/window-manager.js");
const icons = read("app/core/system-icons.js");
const windowStyles = read("styles/10-windows.css");
const iconStyles = read("styles/50-apps.css");
const liquidStyles = read("styles/70-liquid-glass.css");
const foundationStyles = read("styles/00-foundation.css");

test.assertIncludes(icons, "startup disk: Startup Device, ICN# -4064", "Startup Disk uses the native System 6 startup-device resource");
test.assertIncludes(icons, "hard disk: Apple HD SC Setup, ICN# 16646", "Project Hard Disk uses the native System 6 hard-disk resource");
test.assertIncludes(icons, "floppy: Finder, ICN# 129", "File Floppy uses the native Finder resource");
test.assertIncludes(icons, "empty/full Trash: Finder, ICN# 130 / 134", "Trash preserves native empty and full resources");
test.assertMatches(icons, /const nativeSystem6FinderIconPaths = \{[\s\S]*startupDisk: nativeSystem6StartupDiskPath,[\s\S]*projectDisk: nativeSystem6HardDiskPath,[\s\S]*fileFloppy:[\s\S]*trash:[\s\S]*trashFull:/, "Classic storage objects use distinct native resources through one registry");
test.assert((icons.match(/\.\.\.nativeSystem6FinderIconPaths/g) || []).length === 2, "Classic and Classic Plus share native pixel geometry");
test.assertIncludes(icons, "a 32×32 vector grid, a 2-unit safe edge, and one-unit outline strokes", "Custom Classic objects document one shared vector drawing grammar");
test.assertMatches(icons, /questionSheet:[\s\S]*M4 2h19l5 5v23H4z[\s\S]*outline:[\s\S]*M4 2h24v28H4z[\s\S]*applications:[\s\S]*M3 3h26v26H3z/, "Core route and desktop companions occupy the shared Classic safe area");
test.assertIncludes(foundationStyles, "--system-icon-stroke-width: 1", "Classic outlines default to one 32-grid unit");
test.assertIncludes(foundationStyles, "--system-icon-pixel-run-expansion: 0", "Classic native pixel resources keep their exact one-bit geometry by default");
test.assertMatches(iconStyles, /\.sys-icon-svg \{[\s\S]*stroke-width: var\(--system-icon-stroke-width\)/, "System icons consume the theme-owned stroke weight");
test.assertNotIncludes(`${windowStyles}\n${iconStyles}`, "--sys-icon-stroke", "Classic icon size variants cannot reintroduce local stroke weights");
test.assertNotMatches(iconStyles, /\.sys-icon-svg (?:path|rect|circle)[^{]*\{[^}]*vector-effect: non-scaling-stroke;/, "Classic strokes scale with their vector grid instead of mixing CSS pixel weights");
test.assertIncludes(liquidStyles, "--system-icon-stroke-width: 1.8", "Liquid Glass retains its independent rounded stroke weight");
test.assertMatches(liquidStyles, /body\.use-liquid-glass \.sys-icon-liquid path:not\(\.classic-ink\)[\s\S]*vector-effect: non-scaling-stroke;/, "Liquid Glass retains non-scaling outline rendering");

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
