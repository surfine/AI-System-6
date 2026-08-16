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
  "cmfStudio", "liquidCover", "docMap", "questionSheet",
  // Provider choices
  "localModel", "endfieldTerminal", "cloudModel", "chooser",
  // Final boot picker
  "startupDisk", "applications", "folder",
];

// The site draws these icons at two sizes: 32 in the route, the Finder and the
// argument list, and 64 in the boot picker. A retina screen therefore asks for
// 128 real pixels, so every raster era syncs its 128 art. Yosemite and Liquid
// Glass used to sync at 64, which is exactly half of what the boot picker
// needs, and the three cards at the end of the page were visibly soft.
//
// The two 1-bit eras are the exception, and not an oversight: their art is
// drawn at 32 and doubled by image-rendering: pixelated, so a larger source
// would smooth away the pixels that are the point. Classic stays vector.
export const SITE_ICON_ERAS = {
  classic: { pattern: (name) => `classic/icons/${name}-32.svg`, ext: "svg" },
  platinum: { pattern: (name) => `platinum/icons/${name}-32.png`, ext: "png" },
  aqua: { pattern: (name) => `aqua/icons/${name}-128.png`, ext: "png" },
  "snow-leopard": { pattern: (name) => `snow-leopard/icons/${name}-128.png`, ext: "png" },
  yosemite: { pattern: (name) => `yosemite/icons/${name}-128.png`, ext: "png" },
  "liquid-glass": { pattern: (name) => `liquid-glass/icons/${name}-128-default.png`, ext: "png" },
};
