// Theme Lab's authoring data: where each appearance's tokens live and how its
// icon art is tiered on disk.
//
// Only Theme Lab reads it, so it loads with the Lab instead of riding every
// boot in theme-registry.js (it was about 2.7 KB of the startup floppy).
// Every registry id must have an entry here, in registry order; the
// appearance-system contract fails when an appearance is added to one file
// and not the other.
(function installThemeAuthoring(global) {
  "use strict";

  function freezeAuthoringMetadata({ tokenFile, tokenSelector, art }) {
    const zoom = Object.freeze((art.zoom || []).map((pair) => Object.freeze([...pair])));
    return Object.freeze({
      tokenHome: Object.freeze({ file: tokenFile, selector: tokenSelector }),
      art: Object.freeze({
        ...art,
        tiers: Object.freeze([...(art.tiers || [])]),
        zoom,
        appearances: Object.freeze([...(art.appearances || ["default"])]),
      }),
    });
  }

  const byId = new Map([
    ["classic", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/00-foundation.css",
      tokenSelector: ":root",
      art: {
        dir: "classic", ext: "svg", tiers: [32, 16],
        ordinary: 32, compact: 16, large: 32,
        zoom: [[32, 32], [32, 64], [32, 128], [32, 256]],
        appearances: ["default"],
      },
    })],
    ["system-7", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/65-system-7-appearance.css",
      tokenSelector: 'html[data-theme="system-7"],\nbody[data-theme="system-7"]',
      art: {
        dir: "system-7", ext: "png", tiers: [32, 16],
        ordinary: 32, compact: 16, large: 32,
        zoom: [[32, 32], [32, 64], [32, 128], [32, 256]],
        appearances: ["default"],
      },
    })],
    ["platinum", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/65-appearance-themes.css",
      tokenSelector: 'html[data-lineage~="platinum"],\nbody[data-lineage~="platinum"]',
      art: {
        dir: "platinum", ext: "png", tiers: [42, 32, 16],
        ordinary: 32, compact: 16, large: 42,
        zoom: [[42, 168], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    // Drawing Board keeps Platinum's icons.
    ["drawing-board", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/65-drawing-board-appearance.css",
      tokenSelector: 'html[data-theme="drawing-board"],\nbody[data-theme="drawing-board"]',
      art: {
        dir: "platinum", ext: "png", tiers: [42, 32, 16],
        ordinary: 32, compact: 16, large: 42,
        zoom: [[42, 168], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    ["aqua", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/67-aqua-appearance.css",
      tokenSelector: 'html[data-theme="aqua"],\nbody[data-theme="aqua"]',
      art: {
        dir: "aqua", ext: "png", tiers: [128, 32, 16],
        ordinary: 32, compact: 16, large: 128,
        zoom: [[128, 128], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    // Tiger draws the Jaguar-lineage Aqua icons; it owns no artwork yet.
    ["tiger", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/67-tiger-appearance.css",
      tokenSelector: 'html[data-theme="tiger"],\nbody[data-theme="tiger"]',
      art: {
        dir: "aqua", ext: "png", tiers: [128, 32, 16],
        ordinary: 32, compact: 16, large: 128,
        zoom: [[128, 128], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    ["snow-leopard", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/67-aqua-appearance.css",
      tokenSelector: 'html[data-lineage~="snow-leopard"],\nbody[data-lineage~="snow-leopard"]',
      art: {
        dir: "snow-leopard", ext: "png", tiers: [512, 128, 32, 16],
        ordinary: 32, compact: 16, large: 128,
        zoom: [[512, 256], [128, 128], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    // Lion keeps Snow Leopard's icons.
    ["lion", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/67-lion-appearance.css",
      tokenSelector: 'html[data-theme="lion"],\nbody[data-theme="lion"]',
      art: {
        dir: "snow-leopard", ext: "png", tiers: [512, 128, 32, 16],
        ordinary: 32, compact: 16, large: 128,
        zoom: [[512, 256], [128, 128], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    ["yosemite", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/65-appearance-themes.css",
      tokenSelector: 'html[data-theme="yosemite"],\nbody[data-theme="yosemite"]',
      art: {
        dir: "yosemite", ext: "png", tiers: [128, 64, 32, 16],
        ordinary: 32, compact: 16, large: 128,
        zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    ["big-sur", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/68-big-sur-appearance.css",
      tokenSelector: 'html[data-theme="big-sur"],\nbody[data-theme="big-sur"]',
      art: {
        dir: "big-sur", ext: "png", tiers: [128, 64, 32, 16],
        ordinary: 32, compact: 16, large: 128,
        zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
        appearances: ["default"],
      },
    })],
    ["liquid-glass", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/70-liquid-glass.css",
      tokenSelector: "body.use-liquid-glass",
      art: {
        dir: "liquid-glass", ext: "png", tiers: [128, 64, 32, 16],
        ordinary: 32, compact: 16, large: 128,
        zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
        variant: "-default",
        appearances: ["default", "dark", "clear"],
      },
    })],
    ["nextstep", freezeAuthoringMetadata({
      tokenFile: "apps/desktop/styles/69-nextstep-appearance.css",
      tokenSelector: 'html[data-theme="nextstep"],\nbody[data-theme="nextstep"]',
      // Most icons retain Classic art; Theme Lab resolves the three new apps
      // to their authored NeXTSTEP supplement per object.
      art: {
        dir: "classic", ext: "svg", tiers: [32, 16],
        ordinary: 32, compact: 16, large: 32,
        zoom: [[32, 32], [32, 64], [32, 128], [32, 256]],
        appearances: ["default"],
      },
    })],
  ]);

  global.AISystem6ThemeAuthoring = Object.freeze({
    ids: Object.freeze([...byId.keys()]),
    get: (themeId) => byId.get(themeId),
  });
})(window);
