// Stylesheets concatenated into styles.bundle.css, which every boot loads.
export const styleRuntimePaths = [
  "styles/00-foundation.css",
  "styles/10-windows.css",
  "styles/20-reader-docmap.css",
  "styles/22-time-machine.css",
  "styles/30-surfaces.css",
  "styles/40-icons.css",
  "styles/50-apps.css",
  "styles/60-responsive.css",
  "styles/65-appearance-themes.css",
  "styles/67-aqua-appearance.css",
  "styles/70-liquid-glass.css",
  "styles/80-bureaucracy-meme.css",
  "styles/85-liquid-cover.css",
  "styles/86-cmf-studio.css",
  "styles/87-clio-chart.css",
  "styles/88-soundscape.css",
  "styles/89-control-strip.css",
  "styles/90-endfield-terminal.css",
  "styles/91-draft-desk.css",
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
  {
    id: "theme-lab",
    output: "styles.theme-lab.css",
    loader: "app/core/config.js",
    sources: ["styles/66-theme-lab.css"],
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
