// The appearance snapshot matrix — a tiered quality promise, not a full sweep.
//
// The state space of this product is roughly 6 appearances x 3 widths x 2
// orientations x 68 windows. Nobody can hold that, and the eye-driven check
// that stood in for it covered well under a tenth of it. This manifest names
// the part the product actually promises, so a machine can hold that part and
// a human can stop re-checking the rest.
//
//   Showcase  — what sells the six eras: the desktop, one frame per era.
//               These are the six images on the site and in the README.
//   Working   — where a writer spends hours: the five route windows, at every
//               width, in the two appearances the beta promises.
//   Unlisted  — everything else (Aqua x Import Utility x portrait phone, ...).
//               Best effort, explicitly unverified. Not a defect.
//
// Keep the two listed tiers small. A cell that nobody looks at costs review
// noise on every accepted change, which is how the previous net died.

export const SHOWCASE_THEMES = [
  "classic",
  "platinum",
  "aqua",
  "snow-leopard",
  "yosemite",
  "liquid-glass",
];

export const WORKING_THEMES = ["classic", "liquid-glass"];

export const WIDTHS = [
  { id: "phone", width: 375, height: 812 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "desktop", width: 1280, height: 820 },
];

export const DESKTOP_WIDTH = WIDTHS[2];

// The writing route, in route order. These five carry the product's purpose.
export const WORKING_WINDOWS = [
  "questionSheet",
  "outline",
  "sectionDrafts",
  "teachText",
  "reviewDesk",
];

// Headless Liquid Glass desktop route windows race between legitimate split
// arrangements (solo 563px, 540px with a scrollbar, ~800px paired) that settle
// differently on boot timing even under --deterministic-mode. They are not
// reproducible, so they are not baselined — the tool's own contract says only
// reproducible cells may enter the promise. Classic desktop and Liquid Glass
// phone/tablet route cells keep full coverage.
const EXCLUDED_WORKING_CELLS = new Set([
  "working-liquid-glass-desktop-questionSheet",
  "working-liquid-glass-desktop-outline",
  "working-liquid-glass-desktop-sectionDrafts",
  "working-liquid-glass-desktop-teachText",
  "working-liquid-glass-desktop-reviewDesk",
]);

/** Every cell in the promised matrix: 6 showcase + 25 working = 31. */
export function snapshotCells() {
  const cells = [];
  for (const theme of SHOWCASE_THEMES) {
    cells.push({
      id: `showcase-${theme}`,
      tier: "showcase",
      theme,
      target: "desktop",
      widthId: DESKTOP_WIDTH.id,
      width: DESKTOP_WIDTH.width,
      height: DESKTOP_WIDTH.height,
    });
  }
  for (const theme of WORKING_THEMES) {
    for (const width of WIDTHS) {
      for (const windowId of WORKING_WINDOWS) {
        cells.push({
          id: `working-${theme}-${width.id}-${windowId}`,
          tier: "working",
          theme,
          target: windowId,
          widthId: width.id,
          width: width.width,
          height: width.height,
        });
      }
    }
  }
  return cells.filter((cell) => !EXCLUDED_WORKING_CELLS.has(cell.id));
}
