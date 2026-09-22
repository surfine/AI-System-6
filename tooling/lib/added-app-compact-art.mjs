// Original, code-native period adaptations, not reproductions of native icons.
// Evidence rules: apps/desktop/assets/themes/era-icon-reference.json. Compact
// compositions are authored here; 16 px removes secondary marks and thickens
// silhouettes rather than reducing a detailed 128 px illustration.
const ERAS = new Set(["classic", "platinum", "aqua", "snow-leopard", "yosemite", "big-sur", "liquid-glass", "nextstep"]);
const IDS = new Set(["clioPaint", "clioProject", "oneMoreTune"]);
const path = (d, fill, stroke = "none", width = 1) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
const rect = (x, y, w, h, fill, r = 0, stroke = "none", width = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const dot = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const ellipse = (x, y, rx, ry, fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const group = (transform, contents) => `<g transform="${transform}">${contents}</g>`;

function palette(c, variant) {
  const { tiny, era, body, edge, stroke, inks, paper, gloss } = c;
  const shape = variant === "angular"
    ? "M4 11 9 7 18 7 23 10 24 15 20 17 19 21 15 25 8 25 4 21 2 16Z"
    : variant === "wide"
      ? "M3 14C4 6 15 4 23 8 29 11 28 18 22 18 18 17 18 21 16 25 11 30 2 23 3 14Z"
      : "M4 16C3 9 10 5 18 7 24 8 27 13 23 16 20 18 16 15 16 20 18 24 15 27 10 25 6 24 4 20 4 16Z";
  let art = path(shape, body, edge, stroke);
  // The thumb hole is deliberately large at 16 px. It is a paper-coloured
  // opening in the compact illustration, not a tiny dark mark beside the paint.
  art += ellipse(12, 20, tiny ? 2.5 : 2.2, tiny ? 2.3 : 2.8, paper);
  const spots = tiny ? [[7, 14, inks[0]], [12, 10, inks[1]], [19, 11, inks[2]]]
    : [[7, 14, inks[0]], [10, 10, inks[1]], [16, 9.5, inks[2]], [21, 12, inks[3]], [7.5, 20, inks[4]]];
  for (const [x, y, color] of spots) {
    art += era === "platinum" || era === "nextstep" ? rect(x - 1.5, y - 1.5, 3, 3, color)
      : dot(x, y, tiny ? 2 : 1.7, color);
    if (gloss && !tiny) art += ellipse(x - 0.3, y - 0.6, 0.75, 0.35, "#ffffffb8");
  }
  if (gloss) art += path("M5 13C6 8 12 6 18 8", "none", "#ffffff9e", tiny ? 1 : 1.4);
  return art;
}

function brush(c, x, y, angle, scale = 1) {
  const { tiny, mono, era, edge, metal } = c;
  const handle = mono ? "#fff" : era === "nextstep" ? "#794c34" : "#cf653a";
  const width = tiny ? 3.4 : 2.5;
  return group(`translate(${x} ${y}) rotate(${angle}) scale(${scale})`,
    path(`M${-width / 2} 2Q0 0 ${width / 2} 2L1.3 15H-1.3Z`, handle, edge, tiny ? 1 : 0.7)
    + rect(-2, 13, 4, 4.5, mono ? "#fff" : metal, 0, edge, 0.7)
    + path("M-2 17H2L2.4 20 0 24-2.4 20Z", mono ? "#000" : "#3d3329")
    + (!tiny ? path("M-.7 3V12", "none", mono ? "#000" : "#ffdb9f", 0.65) : ""));
}

function paint(c) {
  if (c.era === "classic") return palette(c, "kidney") + brush(c, 27, 3, 18, 0.95);
  if (c.era === "platinum") return group("translate(1 2) scale(.94)", palette(c, "angular")) + brush(c, 25, 2, 25);
  if (c.era === "aqua") return group("rotate(-12 15 16)", palette(c, "wide")) + brush(c, 28, 2, 34, 1.05);
  if (c.era === "snow-leopard") return ellipse(15, 27, 11, 1.7, "#27334430")
    + group("translate(0 1) rotate(8 15 16)", palette(c, "kidney")) + brush(c, 29, 2, 32, 1.05);
  if (c.era === "yosemite") return group("translate(-1 0) scale(1.04)", palette(c, "wide")) + brush(c, 26, 1, 8, 1.05);
  if (c.era === "big-sur") return c.plate + group("translate(3 3) scale(.78)", palette(c, "wide") + brush(c, 27, 0, 23));
  if (c.era === "liquid-glass") return ellipse(15, 28, 10, 1.5, c.shadow)
    + group("translate(1 2) scale(.93)", palette(c, "wide")) + brush(c, 27, 1, 20, 1.03);
  return c.plate + group("translate(3 3) scale(.82)", palette(c, "angular") + brush(c, 26, 0, 17));
}

function card(c, x, y, w, h, color, kind = "task") {
  const { era, tiny, edge, stroke, paper, gloss } = c;
  let art = "";
  if (["platinum", "snow-leopard"].includes(era)) art += rect(x + 1, y + 1, w, h, era === "platinum" ? "#555" : "#27334430");
  art += rect(x, y, w, h, paper, era === "aqua" ? 1.7 : era === "liquid-glass" ? 1.5 : era === "big-sur" ? 1 : 0, edge, stroke);
  if (era === "nextstep") art += path(`M${x} ${y + h}V${y}H${x + w}`, "none", "#fff", 0.9);
  if (kind === "task") {
    art += rect(x + 1, y + 1, w - 2, tiny ? 2 : 1.6, color, era === "aqua" ? 0.8 : 0);
    if (!tiny) art += path(`M${x + 2} ${y + h - 2}h${w - 4}`, "none", c.ink, 0.7);
  }
  if (gloss) art += path(`M${x + 1} ${y + 1}H${x + w - 1}`, "none", "#ffffffb8", 0.8);
  return art;
}

function project(c) {
  const framed = ["big-sur", "nextstep"].includes(c.era);
  const layout = { classic: [2, 4, 10, 7, 21, 22, 13], platinum: [2, 3, 10, 7, 21, 21, 12],
    aqua: [1, 3, 10, 8, 21, 21, 13], "snow-leopard": [3, 5, 10, 6, 21, 23, 14],
    yosemite: [2, 5, 10, 6, 21, 22, 13], "liquid-glass": [3, 3, 9, 7, 21, 23, 13] };
  const [x, y, w, h, right, lower, mid] = framed ? [6, 7, 8, 6, 20, 20, 14] : layout[c.era];
  const elbow = 17;
  let art = c.plate;
  // Continuous orthogonal dependency lines, always in front of the empty field
  // and behind the three cards. Never a fourth box or a diagonal network.
  art += path(`M${x + w} ${y + h / 2}H${elbow}V${mid + h / 2}H${right}M${x + w} ${lower + h / 2}H${elbow}V${mid + h / 2}`, "none", c.link, c.tiny ? 2 : 1.5);
  if (!c.tiny) art += path(`M${right - 2} ${mid + h / 2 - 1.8}l2 1.8-2 1.8`, "none", c.link, 1.1);
  const leftTop = card(c, x, y, w, h, c.inks[0]);
  const leftBottom = card(c, x, lower, w, h, c.inks[1]);
  const target = card(c, right, mid, framed ? 7 : 9, h, c.inks[2]);
  // Aqua's cards are rounded glass-capped tickets; Snow Leopard uses pinboard
  // paper with a visible clip. Platinum keeps a front-facing staggered stack.
  art += leftTop + leftBottom + target;
  if (c.era === "snow-leopard" && !c.tiny) art += rect(x + 3, y - 1, 4, 2.5, c.metal, 0.6)
    + rect(x + 3, lower - 1, 4, 2.5, c.metal, 0.6);
  if (c.era === "platinum" && !c.tiny) art += path(`M${x - 1} ${y + 2}v${h}h${w}M${x - 1} ${lower + 2}v${h}h${w}`, "none", "#111", 1);
  return art;
}

function note(c, x, y, scale) {
  const color = c.mono ? "#000" : c.era === "nextstep" ? "#448db3" : c.note;
  return group(`translate(${x} ${y}) scale(${scale})`,
    ellipse(3, 17, 3.4, 2.5, color)
    + path("M5 17V2C5 5 11 5 10 10 8 8 6 8 5 7", color, color, c.tiny ? 1.5 : 1)
    + (c.gloss && !c.tiny ? path("M5 3V15", "none", "#ffffffb3", 0.7) : ""));
}

function tune(c) {
  const framed = ["big-sur", "nextstep"].includes(c.era);
  const frontX = framed ? 13 : c.era === "platinum" ? 13 : 12;
  const frontY = framed ? 7 : 4;
  const w = framed ? 12 : c.era === "platinum" ? 14 : 15;
  const h = framed ? 20 : 24;
  let art = c.plate;
  const back = card(c, framed ? 7 : 4, framed ? 8 : 6, framed ? 12 : 15, framed ? 18 : 22, c.inks[1], "music");
  art += ["aqua", "snow-leopard", "yosemite", "liquid-glass"].includes(c.era) ? group("rotate(-12 13 17)", back) : back;
  if (c.era === "platinum") art += path("M4 8V29H18", "none", "#111", 1);
  const front = card(c, frontX, frontY, w, h, c.inks[0], "music");
  art += c.era === "aqua" ? group("rotate(6 19 16)", front) : front;
  if (c.era === "classic" && !c.tiny) art += path("M23 4V8H27", "none", "#000", 1);
  if (c.era === "snow-leopard" && !c.tiny) for (const y of [11, 14, 17]) art += path(`M14 ${y}H25`, "none", "#8e81706b", 0.6);
  if (c.era === "yosemite") art += rect(frontX, frontY, w, c.tiny ? 3 : 2, "#ed4b5f");
  art += note(c, framed ? 15 : 15, framed ? 9 : 7, framed ? 0.75 : 0.94);
  return art;
}

export function addedAppArtwork(id, era, size, appearance = "default") {
  if (!IDS.has(id) || !ERAS.has(era)) throw new Error(`Unsupported added application artwork: ${id}/${era}`);
  if (!Number.isFinite(size) || size < 1 || size > 1024) throw new Error("Icon size must be between 1 and 1024");
  if (!["default", "dark", "clear"].includes(appearance)) throw new Error(`Unsupported appearance: ${appearance}`);
  const tiny = size <= 16, mono = era === "classic", dark = appearance === "dark", clear = appearance === "clear";
  const p = `${id}-${era}-${size}-${appearance}`;
  const url = (name) => `url(#${p}-${name})`;
  const gradient = (name, top, bottom) => `<linearGradient id="${p}-${name}" x1="0" y1="0" x2="0.3" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
  const glass = era === "liquid-glass";
  const c = { era, tiny, mono, plate: "", shadow: dark ? "#0008" : "#12375a22", gloss: ["aqua", "liquid-glass"].includes(era),
    stroke: mono ? (tiny ? 1.7 : 1.2) : era === "platinum" ? (tiny ? 2 : 1) : glass ? 0.8 : era === "yosemite" ? 0 : 0.6,
    edge: mono ? "#000" : era === "platinum" ? "#111" : glass ? (dark ? "#bfe8ffd9" : "#fff") : era === "nextstep" ? "#222" : "#6c665b",
    ink: mono ? "#000" : "#4a4d53", link: mono ? "#000" : era === "platinum" ? "#111" : glass ? (dark ? "#c6edff" : "#63859b") : era === "nextstep" ? "#252525" : "#698394",
    inks: mono ? ["#000", "#000", "#000", "#000", "#000"] : ["#e75852", "#eab735", "#348ccd", "#36a882", "#965bae"],
    body: mono ? "#fff" : era === "platinum" ? "#ddd" : era === "yosemite" ? "#eed18f" : url("body"),
    paper: mono ? "#fff" : era === "platinum" ? "#eee" : glass ? url("glass") : era === "yosemite" ? "#fff4e5" : url("paper"),
    metal: era === "platinum" ? "#aaa" : url("metal"), note: glass ? (dark ? "#ffabc9" : clear ? "#dc5c92" : "#d94b83") : era === "aqua" ? "#dc386b" : era === "snow-leopard" ? "#34302f" : "#d64155" };
  if (era === "platinum") c.inks = ["#777", "#aaa", "#336699", "#111", "#9999cc"];
  if (glass) c.body = url("glass");
  const defs = gradient("body", era === "aqua" ? "#ffeab1" : "#e4bf82", era === "aqua" ? "#d9952d" : "#b27e48")
    + gradient("paper", "#ffffff", era === "snow-leopard" ? "#d9d2c5" : "#dfedf4")
    + gradient("metal", "#fff", "#687b86") + gradient("plate", "#fffdf9", "#ece7de")
    + gradient("glass", dark ? "#6e8799df" : clear ? "#f8ffffa6" : "#edfbfff5", dark ? "#263c53e8" : clear ? "#acd4ea69" : "#addcf0cc");
  if (era === "big-sur") c.plate = rect(2.5, 3.5, 27, 27, "#655d4b20", 6)
    + rect(2.5, 2.5, 27, 27, url("plate"), 6, "#bbb6ae", 0.5);
  if (era === "nextstep") c.plate = rect(1, 1, 30, 30, "#171717") + rect(2, 2, 27, 27, "#999")
    + path("M2 29V2H29", "none", "#eee", 2) + path("M4 29H29V4", "none", "#424242", 2);
  const artwork = id === "clioPaint" ? paint(c) : id === "clioProject" ? project(c) : tune(c);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"${era === "platinum" ? ' shape-rendering="crispEdges"' : mono ? ' shape-rendering="geometricPrecision"' : ""}><title>${id}: original ${era} adaptation</title><defs>${defs}</defs>${artwork}</svg>`;
  return mono ? svg.replace(/<defs>[\s\S]*?<\/defs>/, "<defs></defs>").replace(/#000(?=["'])/g, "#000000").replace(/#fff(?=["'])/g, "#ffffff") : svg;
}
