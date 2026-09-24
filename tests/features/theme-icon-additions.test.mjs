import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("theme-icon-additions");
const sandbox = { window: {}, document: { body: null, querySelectorAll: () => [] } };
vm.createContext(sandbox);
vm.runInContext(read("app/core/theme-registry.js"), sandbox);
vm.runInContext(read("app/core/system-icons.js"), sandbox);
const api = sandbox.window.AISystem6Theme;
const svg = (id, size = 32) => sandbox.systemIconSvg(id, { modernSourceSize: size, platinumSourceSize: size, sourceSize: size });
const select = (id) => api.applyTheme(id, { announce: false, persist: false, experimental: id === "nextstep" });
const additions = ["clioPaint", "clioProject", "oneMoreTune"];
for (const id of additions) {
  test.assert(sandbox.window.AISystem6SystemIcons.ids.includes(id), `${id} is part of the shared renderer vocabulary`);
  select("classic");
  const markup = svg(id);
  test.assertIncludes(markup, `classic/icons/${id}-32.svg`, `${id} retains its Classic art`);
  test.assertIncludes(markup, `classic/icons/${id}-mask-32.svg`, `${id} retains the Classic selection mask`);
  for (const era of ["platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"]) {
    test.assertIncludes(markup, `${era}/icons/${id}-32${era === "liquid-glass" ? "-default" : ""}.png`, `${id} uses independent ${era} art`);
  }
  for (const era of ["big-sur", "nextstep"]) {
    test.assertNotIncludes(markup, `assets/themes/${era}/`, `${id} creates no inactive ${era} request`);
    select(era);
    for (const size of [16, 32, 64, 128]) {
      test.assertIncludes(svg(id, size), `class="sys-icon-${era}"`, `${id} has an independent ${era} SVG layer`);
      test.assertIncludes(svg(id, size), `${era}/icons/${id}-${size}.png`, `${id} honors the ${size} px ${era} tier`);
    }
  }
}
for (const id of ["imagePromptStudio", "micropolis", "openttd", "doom", "lightroom", "bonsaiCity"]) {
  select("big-sur");
  test.assertNotIncludes(svg(id), `big-sur/icons/${id}`, `${id} never requests an unauthored Big Sur file`);
  test.assertIncludes(svg(id).split('class="sys-icon-big-sur"')[1], `classic/icons/${id}-32.svg`, `${id} keeps Classic art in Big Sur`);
  select("nextstep");
  test.assertNotIncludes(svg(id), 'class="sys-icon-nextstep"', `${id} retains the existing Classic painter in NeXTSTEP`);
}
for (const id of ["play", "pause", "previousTrack", "nextTrack", "shuffleTracks", "repeatTracks", "speaker"]) {
  select("big-sur");
  const group = svg(id).split('class="sys-icon-big-sur">')[1]?.split("</g>")[0];
  test.assert(!!group && !group.includes(".png"), `${id} remains an inline transport glyph in Big Sur`);
}
// Existing nodes refresh on silent preview/restore, while newly rendered nodes
// use the same selected-era path without creating observers or waiting for a frame.
const item = { dataset: { systemIcon: "clioPaint" }, classList: { add() {}, contains: () => false }, matches: () => false, innerHTML: "" };
sandbox.document = { body: null, querySelectorAll: () => [item] };
select("classic");
select("big-sur");
test.assertIncludes(item.innerHTML, "big-sur/icons/clioPaint-32.png", "silent theme switches refresh existing icons using an optical source tier");
select("nextstep");
test.assertIncludes(item.innerHTML, "nextstep/icons/clioPaint-32.png", "a subsequent switch replaces the dynamic artwork");
test.assertNotIncludes(item.innerHTML, "big-sur/icons/", "leaving Big Sur removes its hrefs");
select("classic");
test.assertNotIncludes(item.innerHTML, "nextstep/icons/", "restoring Classic removes NeXTSTEP hrefs");
const labSource = read("app/features/theme-lab.js");
const authoringHost = {};
vm.runInNewContext(read("app/features/theme-authoring.js"), { window: authoringHost });
const authoringTable = authoringHost.AISystem6ThemeAuthoring;
const artStart = labSource.indexOf("  function artOf(themeId, id) {");
const artEnd = labSource.indexOf("\n  }", artStart) + 4;
const artOf = vm.runInNewContext(`(${labSource.slice(artStart, artEnd)})`, { window: sandbox.window, authoringOf: (theme) => authoringTable.get(theme?.id) });
for (const id of additions) {
  test.assert(artOf("nextstep", id).dir === "nextstep" && artOf("nextstep", id).ext === "png", `${id} inspector exposes NeXTSTEP PNGs`);
  test.assertIncludes(labSource, `["${id}",`, `${id} is inspectable alongside the original core objects`);
}
test.assert(artOf("nextstep", "finderApp").dir === "classic", "NeXTSTEP's unchanged core remains explicitly Classic in the inspector");
test.assert(artOf("big-sur", "doom").dir === "classic", "Big Sur's unauthored extras show their actual fallback source in the inspector");
test.finish();
