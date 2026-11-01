// Tool icons for the Bonsai City palette, rendered from the same voxel models
// the map draws: the road tool shows a road piece, the coal plant tool the
// coal plant, a zone tool the building that grows there. A few tools that
// are verbs, not things (raise, lower, level, demolish, query, park) get a
// small model of their own. Each icon is a 40 × 40 cell (drawn at 20 CSS px)
// in one sheet; the map from tool id to cell travels in the atlas metadata.

import sharp from "sharp";
import { Model, TILE_VOXELS as T } from "./voxel.mjs";
import { rasterize } from "./raster.mjs";
import { addTree } from "./buildings.mjs";

export const ICON_CELL = 40;
const ICON_COLUMNS = 12;

function pad(material = "grass") {
  const m = new Model(T, T, 40, "icon");
  m.box(0, 0, 0, T, T, 1, material);
  return m;
}

const VERBS = {
  raise: () => {
    const m = pad();
    for (let k = 0; k < 5; k += 1) m.box(2 + k, 2 + k, 1 + k, T - 2 - k, T - 2 - k, 2 + k, k < 2 ? "soil" : "grass");
    m.box(7, 7, 6, 9, 9, 12, "yellow");
    m.box(6, 6, 10, 10, 10, 11, "yellow");
    return m;
  },
  lower: () => {
    const m = pad();
    m.box(3, 3, 0, 13, 13, 1, "soil");
    m.box(5, 5, 0, 11, 11, 1, "water");
    m.box(7, 7, 3, 9, 9, 9, "yellow");
    m.box(6, 6, 3, 10, 10, 4, "yellow");
    return m;
  },
  level: () => {
    const m = pad("soil");
    // a little bulldozer
    m.box(4, 5, 1, 12, 11, 2, "tyre");
    m.box(5, 5, 2, 11, 11, 5, "yellow");
    m.box(8, 6, 5, 11, 10, 8, "yellow");
    m.box(9, 6, 6, 11, 10, 7, "glassdark");
    m.box(3, 4, 1, 4, 12, 4, "darksteel");
    return m;
  },
  demolish: () => {
    const m = pad("soil");
    m.box(9, 3, 1, 14, 8, 3, "darkconcrete");
    m.box(10, 4, 3, 13, 6, 5, "brick");
    m.box(2, 7, 1, 10, 13, 2, "tyre");
    m.box(3, 7, 2, 9, 13, 5, "orange");
    m.box(3, 9, 5, 6, 12, 8, "orange");
    m.box(3, 9, 6, 5, 12, 7, "glassdark");
    m.box(9, 6, 1, 10, 14, 4, "darksteel");
    return m;
  },
  query: () => {
    const m = new Model(T, T, 40, "icon");
    // a magnifying glass standing on its handle
    m.box(3, 7, 0, 7, 9, 2, "wood");
    m.box(5, 7, 2, 8, 9, 4, "wood");
    for (let a = 0; a < 24; a += 1) {
      const ang = (a / 24) * Math.PI * 2;
      const x = Math.round(10 + Math.cos(ang) * 4);
      const z = Math.round(9 + Math.sin(ang) * 4);
      m.set(x, 7, z, "darksteel");
      m.set(x, 8, z, "darksteel");
    }
    for (let z = 6; z <= 12; z += 1) for (let x = 7; x <= 13; x += 1) if ((x - 10) ** 2 + (z - 9) ** 2 < 9) m.set(x, 8, z, "roofglass");
    return m;
  },
  park: () => {
    const m = pad("lawn");
    m.box(7, 0, 0, 9, T, 1, "paving");
    addTree(m, 4, 4, 1, "round", 11, 0.8);
    addTree(m, 12, 11, 1, "cherry", 12, 0.8);
    m.box(10, 3, 1, 14, 4, 2, "wood");
    return m;
  },
};

// Tool id → catalog frame id (or a verb above). Unlisted tools keep their
// text glyph.
export const TOOL_ICON_FRAMES = {
  raise: "verb:raise", lower: "verb:lower", level: "verb:level", tree: "tree.broadleaf",
  road: "road.mask-5", highway: "highway.mask-5", onramp: "onramp.ns", rail: "rail.mask-5",
  station: "facility.station", subway: "subway.mask-5", "subway-station": "facility.subway-station", bus: "facility.bus",
  "residential-light": "building.r.1.9.normal", "residential-high": "building.r.2.9.normal",
  "commercial-light": "building.c.1.1.normal", "commercial-high": "building.c.2.17.normal",
  "industrial-light": "building.i.1.1.normal", "industrial-high": "building.i.2.9.normal",
  seaport: "catalog.crane", airport: "catalog.control_tower", military: "catalog.missile_silo",
  "mayors-house": "catalog.mayors_house", "city-hall": "catalog.city_hall", statue: "catalog.statue", dome: "catalog.dome", arco: "catalog.arcology",
  wire: "wire.mask-5", pipe: "pipe.mask-5", coal: "facility.coal", hydro: "facility.hydro", oil: "facility.oil", gas: "facility.gas",
  nuclear: "facility.nuclear", wind: "facility.wind", solar: "facility.solar", microwave: "facility.microwave", fusion: "facility.fusion",
  pump: "facility.pump", "water-tower": "facility.tower", treatment: "facility.treatment", desal: "facility.desal",
  police: "facility.police", fire: "facility.fire", education: "facility.school", healthcare: "facility.clinic",
  hospital: "catalog.hospital", university: "catalog.college", library: "catalog.library", museum: "catalog.museum", prison: "catalog.prison",
  park: "verb:park", "park-big": "catalog.park_big", zoo: "catalog.zoo", stadium: "catalog.stadium", marina: "catalog.marina",
  query: "verb:query", demolish: "verb:demolish",
};

/**
 * Render every tool icon. `modelFor(frameId)` returns the catalog model (or a
 * terrain surface, which is skipped). Returns { png, icons: {tool: [col, row]}, columns, cell }.
 */
export async function bakeToolIcons(modelFor) {
  const entries = Object.entries(TOOL_ICON_FRAMES);
  const icons = {};
  const layers = [];
  let slot = 0;
  for (const [tool, source] of entries) {
    const model = source.startsWith("verb:") ? VERBS[source.slice(5)]() : modelFor(source);
    if (!model || model.surface) continue;
    const W = 320, H = 520;
    const pixels = rasterize(model, { width: W, height: H, anchorX: W / 2, anchorY: H - 90 });
    // trim
    let l = W, t = H, r = -1, b = -1;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (pixels[(y * W + x) * 4 + 3]) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
    if (r < l) continue;
    const trimmed = await sharp(pixels, { raw: { width: W, height: H, channels: 4 } }).extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 }).png().toBuffer();
    const inner = ICON_CELL - 4;
    const fitted = await sharp(trimmed).resize(inner, inner, { fit: "contain", position: "bottom", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" }).png().toBuffer();
    const col = slot % ICON_COLUMNS, row = Math.floor(slot / ICON_COLUMNS);
    layers.push({ input: fitted, left: col * ICON_CELL + 2, top: row * ICON_CELL + 2 });
    icons[tool] = [col, row];
    slot += 1;
  }
  const rows = Math.ceil(slot / ICON_COLUMNS);
  const png = await sharp({ create: { width: ICON_COLUMNS * ICON_CELL, height: rows * ICON_CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  return { png, icons, columns: ICON_COLUMNS, rows, cell: ICON_CELL };
}
