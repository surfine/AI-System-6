// Canonical icon inventory for the official site.
//
// Keep this list equal to the icon ids referenced by site/index.html and the
// site modules. The sync and verification tools both import it, so removed
// scenes cannot leave an invisible six-era asset family behind.

export const SITE_ICON_NAMES = [
  // Route
  "fileFloppy", "searcher", "scrapbook", "teachText", "reviewDesk", "hardDisk",
  // Finder: things this computer should not be able to do
  "timeMachine", "soundscape", "importUtility", "clioChart", "clioStage",
  "cmfStudio", "liquidCover",
  // Provider choices
  "localModel", "endfieldTerminal", "cloudModel", "chooser",
  // Final boot picker
  "startupDisk", "applications", "folder",
];

export const SITE_ICON_ERAS = {
  classic: { pattern: (name) => `classic/icons/${name}-32.svg`, ext: "svg" },
  platinum: { pattern: (name) => `platinum/icons/${name}-32.png`, ext: "png" },
  aqua: { pattern: (name) => `aqua/icons/${name}-128.png`, ext: "png" },
  "snow-leopard": { pattern: (name) => `snow-leopard/icons/${name}-128.png`, ext: "png" },
  yosemite: { pattern: (name) => `yosemite/icons/${name}-64.png`, ext: "png" },
  "liquid-glass": { pattern: (name) => `liquid-glass/icons/${name}-64-default.png`, ext: "png" },
};
