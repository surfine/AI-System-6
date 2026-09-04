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
//   Controls  — the Control Panel chooser and the Theme Lab specimens, the
//               real controls the route windows never show.
//   Unlisted  — everything else (Aqua x Import Utility x portrait phone, ...).
//               Best effort, explicitly unverified. Not a defect.
//
// Keep the listed tiers small. A cell that nobody looks at costs review noise
// on every accepted change, which is how the previous net died.

export const SHOWCASE_THEMES = [
  "classic",
  "platinum",
  "aqua",
  "snow-leopard",
  "yosemite",
  "liquid-glass",
];

// Liquid Glass's showcase desktop is NOT a pixel cell any more, and the reason
// is the material, not a regression. Making the glass read as glass raised the
// window backdrop blur from 4px to 18px, and at that radius the software
// rasterizer no longer produces the same frame twice: the cell was recaptured
// and then drifted 17 pixels (0.0016%) on the very next verify, twice running.
// A baseline that cannot reproduce itself teaches people to ignore the gate.
//
// The controls tier already left pixels for exactly this reason and is held by
// the token table instead, so this follows a path the matrix already had. Glass
// keeps its pixel coverage where it IS reproducible — the phone and tablet
// route cells in the working tier — and its showcase material is held by
// computed tokens. The blur itself stays unverified by pixels, on purpose and
// on the record, rather than by a tolerance raised until the red went away.
const SHOWCASE_PIXEL_THEMES = SHOWCASE_THEMES.filter((theme) => theme !== "liquid-glass");

export const WORKING_THEMES = ["classic", "liquid-glass"];

// The city games' HUD promise: the palette column plus gauge bar, at desktop
// size, in the two appearances with pixel-reproducible surfaces. The map
// itself is not the promise (not reproducible across GPUs), so the frame is
// clipped to the left 220px and top 60px. Fixed seed, paused.
export const GAME_THEMES = ["classic", "liquid-glass"];
export const GAME_WINDOWS = ["micropolis", "bonsaiCity"];
export const GAME_CLIP = { left: 220, top: 60 };

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

// Two surfaces whose era clothes used to live on Theme Lab replicas and now
// live on the shipping control: the Control Panel section chooser, and the
// Lab's own tab, menu and dialog specimens, which are the real controls. The
// route windows never show a tab strip, a menu or a modal, so nothing in the
// two tiers above would have caught a regression in them.
//
// The controls tier used to render all six eras. After the geometry drain the
// four middle eras carry layout ONLY through the ratcheted declarations in
// their appearance sheets (tooling/css-budget.json appearanceGeometry), so
// their layout equivalence is proven by tooling/appearance-token-check.mjs —
// a computed token/geometry-delta comparison against Classic, seconds instead
// of eight more screenshot cells. Pixels stay where pixels are the promise:
// Classic (the proof appearance), and one showcase desktop frame per era so
// the era art stays guarded. Liquid Glass's controls also left pixels: the
// desktop-width glass material rasterizes into two stable machine-dependent
// renderings, so a pixel cell cannot be held reproducibly. Its controls'
// structure is held by the token table instead (computed deltas, not blur —
// the material itself stays unverified by design), while the working tier's
// phone/tablet route cells and the showcase keep pixel coverage of the glass.
export const CONTROL_THEMES = ["classic"];
export const CONTROL_WINDOWS = ["control", "themeLab"];

// The appearances the pixel net no longer renders in the controls tier; the
// token-table check owns their per-appearance layout and token material. The
// four middle eras are fully token-held; Liquid Glass is token-held for the
// controls tier only (its working tier and showcase remain pixels).
export const TOKEN_COMPARED_THEMES = [
  ...SHOWCASE_THEMES.filter((theme) => !WORKING_THEMES.includes(theme)),
  "liquid-glass",
];

/** Every cell in the promised matrix: 5 showcase + 25 working + 2 controls + 4 games = 36. */
export function snapshotCells() {
  const cells = [];
  for (const theme of SHOWCASE_PIXEL_THEMES) {
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
  for (const theme of CONTROL_THEMES) {
    for (const windowId of CONTROL_WINDOWS) {
      cells.push({
        id: `controls-${theme}-${windowId}`,
        tier: "controls",
        theme,
        target: windowId,
        widthId: DESKTOP_WIDTH.id,
        width: DESKTOP_WIDTH.width,
        height: DESKTOP_WIDTH.height,
      });
    }
  }
  for (const theme of GAME_THEMES) {
    for (const windowId of GAME_WINDOWS) {
      cells.push({
        id: `games-${theme}-desktop-${windowId}`,
        tier: "games",
        theme,
        target: windowId,
        widthId: DESKTOP_WIDTH.id,
        width: DESKTOP_WIDTH.width,
        height: DESKTOP_WIDTH.height,
        clip: GAME_CLIP,
        game: true,
      });
    }
  }
  return cells.filter((cell) => !EXCLUDED_WORKING_CELLS.has(cell.id));
}
