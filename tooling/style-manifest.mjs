// Stylesheets concatenated into styles.bundle.css, which every boot loads.
export const styleRuntimePaths = [
  "styles/00-foundation.css",
  "styles/10-windows.css",
  "styles/20-reader-docmap.css",
  "styles/30-surfaces.css",
  "styles/40-icons.css",
  "styles/50-apps.css",
  "styles/60-responsive.css",
  "styles/65-appearance-themes.css",
  "styles/67-aqua-appearance.css",
  "styles/70-liquid-glass.css",
];

// Stylesheets that ship in production but load with their window instead of at
// boot. Theme Lab qualifies twice over: its module is already lazy, and its
// stylesheet is the largest single sheet in the repository while the window is
// an internal appearance surface that most sessions never open. Every selector
// in it is scoped to the lab, so nothing else can lose its styling.
//
// These files are outside the System Floppy Budget on purpose: the budget
// measures what a boot must download, and this sheet is not part of a boot.
export const lazyStyleBundles = [
  // The Draft Desk sheet dresses Quick Draft and 文字亮室, whose modules are
  // already lazy, and every one of its 250 selector parts is scoped to
  // draft-desk / quick-draft / lightroom / listen / darkroom (the only others
  // are keyframe steps). 20 KB that a boot never needed. Loaded by
  // ensureQuickDraftModule, which is the path BOTH windows open through.
  // The Control Strip is opt-in -- applyControlStripState returns early unless
  // the user turned it on -- and all 76 of its selector parts are scoped to
  // .control-strip. A boot that never shows it was downloading it anyway.
  {
    id: "control-strip",
    output: "styles.control-strip.css",
    loader: "app/core/config.js",
    sources: ["styles/89-control-strip.css"],
  },
  {
    id: "draft-desk",
    output: "styles.draft-desk.css",
    loader: "app/core/config.js",
    sources: ["styles/91-draft-desk.css"],
  },
  {
    id: "theme-lab",
    output: "styles.theme-lab.css",
    loader: "app/core/config.js",
    sources: ["styles/66-theme-lab.css"],
  },
  // Endfield Terminal is a standalone lab surface: verify:css already classifies
  // it as one, its module has always been lazy, and every selector is scoped to
  // .endfield-* (the only others are keyframe steps). 9.7 KB that no boot needs.
  {
    id: "endfield-terminal",
    output: "styles.endfield-terminal.css",
    loader: "app/core/config.js",
    sources: ["styles/90-endfield-terminal.css"],
  },
  // The Bureaucracy meme generator is a standalone joke surface with a lazy
  // module; every selector is .bureaucracy-* or #bureaucracy-*.
  {
    id: "bureaucracy-meme",
    output: "styles.bureaucracy-meme.css",
    loader: "app/core/config.js",
    sources: ["styles/80-bureaucracy-meme.css"],
  },
  // Time Machine is summoned, not resident: its module has always been lazy and
  // every selector is .time-machine-* or #time-machine-*.
  {
    id: "time-machine",
    output: "styles.time-machine.css",
    loader: "app/core/config.js",
    sources: ["styles/22-time-machine.css"],
  },
  // ClioChart's own module has always been lazy. Its sheet also dresses one
  // ClioStage element (.clio-stage-chart-slide, added when a slide carries a
  // chart snapshot), and a snapshot can come back from a restored session
  // without ClioChart having been opened this boot — so ClioStage's loader
  // pulls this sheet too. ClioStage is itself lazy, so no boot pays for it.
  {
    id: "clio-chart",
    output: "styles.clio-chart.css",
    loader: "app/core/config.js",
    sources: ["styles/87-clio-chart.css"],
  },
  {
    id: "micropolis",
    output: "styles.micropolis.css",
    loader: "app/core/config.js",
    sources: ["styles/92-micropolis.css"],
  },
  {
    id: "openttd",
    output: "styles.openttd.css",
    loader: "app/core/config.js",
    sources: ["styles/93-openttd.css"],
  },
  {
    id: "bonsai",
    output: "styles.bonsai.css",
    loader: "app/core/config.js",
    sources: ["styles/94-bonsai.css"],
  },
  // CMF Studio is a creative lab whose module was already lazy while its sheet
  // still rode every boot. Every selector in it is scoped to .cmf-*, so the
  // sheet can travel with the window it dresses.
  {
    id: "cmf-studio",
    output: "styles.cmf-studio.css",
    loader: "app/core/config.js",
    sources: ["styles/86-cmf-studio.css"],
  },
  // Soundscape is a summoned player whose module was already lazy. Its shared
  // level controls moved to styles/30-surfaces.css first, so every selector
  // left in the sheet is scoped to the window it dresses.
  {
    id: "soundscape",
    output: "styles.soundscape.css",
    loader: "app/core/config.js",
    sources: ["styles/88-soundscape.css"],
  },
  // Cover Glass is a creative lab whose module was already lazy, and every
  // selector in its sheet is scoped to .lc-* - including the Liquid Glass
  // twins, which are all `body.use-liquid-glass .lc-…`.
  // Image Prompt Studio is a lazy creative lab, and every selector in its sheet
  // is scoped to .image-prompt-studio-window or .ips-*, so it travels with its
  // window rather than the startup disk.
  {
    id: "image-prompt-studio",
    output: "styles.image-prompt-studio.css",
    loader: "app/core/config.js",
    sources: ["styles/95-image-prompt-studio.css"],
  },
  {
    id: "liquid-cover",
    output: "styles.liquid-cover.css",
    loader: "app/core/config.js",
    sources: ["styles/85-liquid-cover.css"],
  },
];

// Every stylesheet the product ships, eager or lazy. Checks that reason about
// the whole CSS surface (budgets, duplicate audits, terminology smoke) use
// this rather than the boot list.
export const allStylePaths = [
  ...styleRuntimePaths,
  ...lazyStyleBundles.flatMap((bundle) => bundle.sources),
];

// Cascade-layer assignment: one @layer name per stylesheet. The build prepends
// a single `@layer <order>;` statement to styles.bundle.css, which pins the
// layer order for the whole document before any rule loads. Until a file wraps
// rules in its layer the statement is inert — unlayered rules keep today's
// cascade. A source file may only open its own assigned layer; verify:css
// enforces that, because claiming a later layer is the new form of the
// !important cascade jump. Migration state and the flip-audit workflow:
// internal/agents/CSS-LAYER-LANE.md.
export const styleLayerByPath = Object.freeze({
  "styles/00-foundation.css": "foundation",
  "styles/10-windows.css": "windows",
  "styles/20-reader-docmap.css": "reader-docmap",
  "styles/22-time-machine.css": "time-machine",
  "styles/30-surfaces.css": "surfaces",
  "styles/40-icons.css": "icons",
  "styles/50-apps.css": "apps",
  "styles/60-responsive.css": "responsive",
  "styles/65-appearance-themes.css": "appearance-themes",
  "styles/67-aqua-appearance.css": "aqua-appearance",
  "styles/70-liquid-glass.css": "liquid-glass",
  "styles/80-bureaucracy-meme.css": "bureaucracy-meme",
  "styles/85-liquid-cover.css": "liquid-cover",
  "styles/95-image-prompt-studio.css": "image-prompt-studio",
  "styles/86-cmf-studio.css": "cmf-studio",
  "styles/87-clio-chart.css": "clio-chart",
  "styles/88-soundscape.css": "soundscape",
  "styles/89-control-strip.css": "control-strip",
  "styles/90-endfield-terminal.css": "endfield-terminal",
  "styles/91-draft-desk.css": "draft-desk",
  // Lazy sheets load after the boot bundle, so their layers sit after every
  // eager layer. That matches the cascade the product has today (a lazy sheet
  // wins ties against everything already loaded); the 66- number of Theme Lab
  // does NOT put its layer between 65 and 67.
  "styles/66-theme-lab.css": "theme-lab",
  "styles/92-micropolis.css": "micropolis",
  "styles/93-openttd.css": "openttd",
  "styles/94-bonsai.css": "bonsai",
});

// Layer order = eager files in bundle order, then lazy sheets in declaration
// order. Derived, so it cannot desync from the path lists above.
export const styleLayerOrder = [
  ...styleRuntimePaths,
  ...lazyStyleBundles.flatMap((bundle) => bundle.sources),
].map((path) => {
  const layer = styleLayerByPath[path];
  if (!layer) throw new Error(`style-manifest: ${path} has no cascade-layer assignment`);
  return layer;
});
