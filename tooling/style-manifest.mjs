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
];

// Every stylesheet the product ships, eager or lazy. Checks that reason about
// the whole CSS surface (budgets, duplicate audits, terminology smoke) use
// this rather than the boot list.
export const allStylePaths = [
  ...styleRuntimePaths,
  ...lazyStyleBundles.flatMap((bundle) => bundle.sources),
];
