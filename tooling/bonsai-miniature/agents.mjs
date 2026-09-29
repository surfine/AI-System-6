// Moving things for the SC2K tier: cars, pedestrians, trains, the three
// emergency vehicles and chimney smoke. Each stands at the centre of an empty
// 1×1 lot (only the vehicle is drawn), so its frame anchors on the tile centre
// like every other frame. Smoke puffs float high above their anchor, the way
// the renderer expects them over a chimney top.

import { Model, TILE_VOXELS as T, mulberry32 } from "./voxel.mjs";

const C = T / 2;

// A car 6 long, nose toward +x: a low bonnet in front, the cabin set back,
// headlights on the nose and red tail lights behind, so its heading reads.
function car(body, roof = body, extra = null) {
  const m = new Model(T, T, 10, "car");
  const x0 = C - 3, y0 = C - 1;
  m.box(x0, y0, 0, x0 + 6, y0 + 3, 1, "tyre");
  m.box(x0, y0, 1, x0 + 6, y0 + 3, 2, body);
  m.box(x0, y0, 2, x0 + 4, y0 + 3, 3, "glassdark");
  m.box(x0 + 1, y0, 2, x0 + 3, y0 + 3, 3, body);
  m.box(x0, y0, 3, x0 + 4, y0 + 3, 4, roof);
  m.set(x0 + 5, y0, 1, "lamp");
  m.set(x0 + 5, y0 + 2, 1, "lamp");
  m.set(x0, y0, 1, "red");
  m.set(x0, y0 + 2, 1, "red");
  if (extra) extra(m, x0, y0);
  return m;
}

function van(body, stripe, lights) {
  const m = new Model(T, T, 12, "van");
  const x0 = C - 4, y0 = C - 2;
  m.box(x0, y0, 0, x0 + 8, y0 + 4, 1, "tyre");
  m.box(x0, y0, 1, x0 + 8, y0 + 4, 5, body);
  m.box(x0 + 6, y0, 3, x0 + 8, y0 + 4, 4, "glassdark");
  m.box(x0, y0, 2, x0 + 6, y0 + 4, 3, stripe);
  m.box(x0 + 3, y0 + 1, 5, x0 + 5, y0 + 3, 6, lights[0]);
  m.set(x0 + 5, y0 + 1, 5, lights[1]);
  m.set(x0 + 5, y0 + 2, 5, lights[1]);
  return m;
}

function pedestrian(shirt, trousers) {
  const m = new Model(T, T, 8, "pedestrian");
  m.box(C, C, 0, C + 1, C + 1, 2, trousers);
  m.box(C, C, 2, C + 1, C + 1, 4, shirt);
  m.set(C, C, 4, "salmon");
  // a second walker a step behind
  m.box(C - 2, C + 2, 0, C - 1, C + 3, 2, "trim");
  m.box(C - 2, C + 2, 2, C - 1, C + 3, 4, trousers === "trim" ? "red" : "blue");
  m.set(C - 2, C + 2, 4, "butter");
  return m;
}

function train(livery, stripe) {
  const m = new Model(T, T, 12, "train");
  const y0 = C - 2;
  // a coach then the locomotive, nose toward +x, filling the tile
  m.box(1, y0, 0, T - 1, y0 + 4, 1, "tyre");
  m.box(8, y0, 1, T - 1, y0 + 4, 5, livery);
  m.box(T - 3, y0, 3, T - 1, y0 + 4, 4, "glassdark");
  m.box(8, y0, 2, T - 1, y0 + 4, 3, stripe);
  m.box(9, y0 + 1, 5, 13, y0 + 3, 6, "darksteel");
  m.set(T - 1, y0 + 1, 1, "lamp");
  m.set(T - 1, y0 + 2, 1, "lamp");
  m.box(1, y0, 1, 7, y0 + 4, 5, livery);
  for (let x = 2; x < 7; x += 2) m.set(x, y0, 3, "glassdark"), m.set(x, y0 + 3, 3, "glassdark");
  m.box(1, y0, 2, 7, y0 + 4, 3, stripe);
  m.box(1, y0, 5, 7, y0 + 4, 6, "roofdark");
  return m;
}

function smoke(seed, size) {
  const m = new Model(T, T, 40, "smoke");
  const rng = mulberry32(seed);
  for (let k = 0; k < 3; k += 1) {
    const r = size * (0.6 + k * 0.25);
    m.blob(C + k * 1.2, C - k * 0.6, 20 + k * 4, r, r, r * 0.8, k === 0 ? "concrete" : "plaster", rng, 0.35, "darkconcrete");
  }
  return m;
}

export function agentFrames() {
  const frames = [
    ["agent.car.1", () => car("carred")],
    ["agent.car.2", () => car("carblue")],
    ["agent.car.3", () => car("carwhite", "carwhite")],
    ["agent.car.4", () => car("caryellow")],
    ["agent.pedestrian.1", () => pedestrian("red", "trim")],
    ["agent.pedestrian.2", () => pedestrian("sky", "blue")],
    ["agent.train.1", () => train("signgreen", "yellow")],
    ["agent.train.2", () => train("blue", "white")],
    ["agent.service.police", () => car("white", "blue", (m, x0, y0) => { m.set(x0 + 2, y0 + 1, 4, "blue"); m.set(x0 + 3, y0 + 1, 4, "red"); })],
    ["agent.service.fire", () => van("red", "red", ["steel", "yellow"])],
    ["agent.service.medical", () => van("white", "red", ["red", "blue"])],
    ["agent.smoke.1", () => smoke(801, 2.2)],
    ["agent.smoke.2", () => smoke(802, 2.8)],
    ["agent.smoke.3", () => smoke(803, 3.4)],
  ];
  // Each vehicle also in the four world headings it can drive (nose along
  // +x, −y, −x, +y), people in the two axes they walk; `extra` asks the bake
  // to append these frames, which the old atlas never had.
  const turns = { px: 0, ny: 1, nx: 2, py: 3 };
  const out = frames.map(([id, make]) => ({ id, make, outline: true }));
  for (const [id, make] of frames) {
    if (id.startsWith("agent.smoke")) continue;
    const headings = id.startsWith("agent.pedestrian") ? ["px", "py"] : ["px", "ny", "nx", "py"];
    for (const heading of headings) {
      out.push({ id: `${id}.${heading}`, make: () => make().rotated(turns[heading]), outline: true, extra: { category: "agent", variant: 1 } });
    }
  }
  return out;
}
