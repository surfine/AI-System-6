// Liquid Glass core icon renderer.
//
// Artwork and material are separate here. Each object contributes only shapes:
// a background silhouette and one or two foreground symbol layers. The material
// stack below turns those shapes into glass, and the appearance table in
// assets/themes/liquid-glass/icons/src/liquid-glass-core-icons.json decides how
// much colour, translucency, refraction, and specular each appearance gets.
//
// Refraction is real rather than implied: a foreground layer redraws the
// background it covers, displaced and scaled about its own centre, so the glass
// changes what passes through it. Transparency alone would only be
// glassmorphism.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const { gridTransform, inkBox } = await import("./lib/icon-grid.mjs");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themeDir = join(root, "apps/desktop/assets/themes/liquid-glass");
const assetDir = join(themeDir, "icons");
const sourceFile = join(assetDir, "apps/server/liquid-glass-core-icons.json");
const draftDir = join(root, "internal/evidence/drafts/era-icons");
const source = JSON.parse(readFileSync(sourceFile, "utf8"));
const ids = Object.keys(source.icons);
const sizes = [128, 64, 32, 16];
const appearances = ["default", "dark", "clear"];

mkdirSync(assetDir, { recursive: true });
mkdirSync(draftDir, { recursive: true });

const INK = "#16233a";

function linear(ctx, x0, y0, x1, y1, stops) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function path(ctx, points, close = true) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point.length === 6) ctx.bezierCurveTo(...point);
    else if (point.length === 4) ctx.quadraticCurveTo(...point);
    else ctx.lineTo(point[0], point[1]);
  }
  if (close) ctx.closePath();
}

function mix(hex, target, amount) {
  const from = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const to = [1, 3, 5].map((offset) => parseInt(target.slice(offset, offset + 2), 16));
  return `#${from.map((value, index) => Math.round(value + (to[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// The enclosure follows the measured Tahoe geometry: a wide rounded square with
// a large corner radius, inset from the canvas so the ambient shadow has room.
const ENCLOSURE = { x: 10, y: 8, w: 108, h: 108, r: 30 };

function enclosurePath(ctx) {
  ctx.beginPath();
  ctx.roundRect(ENCLOSURE.x, ENCLOSURE.y, ENCLOSURE.w, ENCLOSURE.h, ENCLOSURE.r);
}

function speechBalloonPath(ctx, x, y, width, height, radius, tailX, tailSide) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  const baseY = y + height - 1;
  if (tailSide === "left") {
    ctx.moveTo(tailX + 13, baseY - 2);
    ctx.lineTo(tailX, baseY + 16);
    ctx.lineTo(tailX + 21, baseY - 1);
  } else {
    ctx.moveTo(tailX - 13, baseY - 2);
    ctx.lineTo(tailX, baseY + 16);
    ctx.lineTo(tailX - 21, baseY - 1);
  }
  ctx.closePath();
}

/* ------------------------------------------------------------------ *
 * Object shapes. These carry no material: only silhouettes.           *
 * ------------------------------------------------------------------ */

const bodies = {
  folder: (ctx) => path(ctx, [
    [12, 34], [12, 26, 20, 26], [50, 26], [58, 38], [108, 38], [116, 38, 116, 46],
    [116, 96], [116, 104, 108, 104], [20, 104], [12, 104, 12, 96],
  ]),
  hardDisk: (ctx) => path(ctx, [
    [16, 44], [16, 34, 26, 34], [102, 34], [112, 34, 112, 44], [112, 88],
    [112, 98, 102, 98], [26, 98], [16, 98, 16, 88],
  ]),
  projectDisk: (ctx) => path(ctx, [
    [18, 36], [18, 26, 28, 26], [100, 26], [110, 26, 110, 36], [110, 94],
    [110, 104, 100, 104], [28, 104], [18, 104, 18, 94],
  ]),
  trash: (ctx) => path(ctx, [
    [34, 26], [94, 26], [86, 104], [82, 110, 76, 110], [52, 110], [46, 110, 42, 104],
  ]),
  document: (ctx) => path(ctx, [
    [26, 10], [82, 10], [104, 32], [104, 112], [104, 118, 98, 118],
    [32, 118], [26, 118, 26, 112],
  ]),
};

const symbols = {
  // Finder is the friendly system identity: a compact Macintosh whose screen
  // keeps the eyes and small smile while Liquid Glass changes the material.
  finderApp: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(28, 18, 72, 84, 15);
      }, { translucency: 0.72, refraction: 0.3 });
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(36, 28, 56, 46, 10);
      }, { translucency: 0.5, refraction: 0.22 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(46, 40, 7, 9, 3.5);
        ctx.roundRect(75, 40, 7, 9, 3.5);
        ctx.fill();
      }, 0.94);
      api.inkStroke((ctx) => {
        ctx.beginPath();
        ctx.moveTo(48, 59);
        ctx.quadraticCurveTo(64, 72, 80, 59);
      }, 6);
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(42, 82, 44, 9, 4.5);
        ctx.roundRect(38, 101, 52, 9, 5);
      }, { translucency: 0.42, refraction: 0.18 });
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(25, 16, 78, 88, 14);
      }, { translucency: 0.8, refraction: 0.12 });
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(34, 27, 60, 48, 9);
      }, { translucency: 0.58, refraction: 0.1 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(44, 40, 9, 10, 4.5);
        ctx.roundRect(75, 40, 9, 10, 4.5);
        ctx.fill();
      }, 1);
      api.inkStroke((ctx) => {
        ctx.beginPath();
        ctx.moveTo(45, 61);
        ctx.quadraticCurveTo(64, 75, 83, 61);
      }, 8);
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(42, 84, 44, 10, 5);
        ctx.roundRect(38, 102, 52, 10, 5);
      }, { translucency: 0.5, refraction: 0.08 });
    },
  },
  folder: {
    large: (api) => {
      api.glass((ctx) => path(ctx, [
        [20, 52], [108, 52], [112, 52, 112, 58], [110, 96], [110, 102, 104, 102],
        [24, 102], [18, 102, 18, 96],
      ]), { translucency: 0.2, refraction: 0.26 });
    },
    small: (api) => {
      api.glass((ctx) => path(ctx, [
        [20, 54], [110, 54], [110, 100], [18, 100],
      ]), { translucency: 0.24, refraction: 0.14 });
    },
  },
  hardDisk: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(30, 48, 68, 30, 10);
      }, { translucency: 0.5, refraction: 0.28 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(30, 84, 30, 6, 3);
        ctx.fill();
      }, 0.5);
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(30, 48, 68, 26, 8);
      }, { translucency: 0.6, refraction: 0.14 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(30, 82, 34, 8, 4);
        ctx.fill();
      }, 0.6);
    },
  },
  trash: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.ellipse(64, 26, 30, 8, 0, 0, Math.PI * 2);
      }, { translucency: 0.66, refraction: 0.2 });
      api.specularLines([[52, 34, 50, 100], [64, 34, 64, 102], [76, 34, 78, 100]], 4);
      api.rim(bodies.trash, 3);
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.ellipse(64, 28, 30, 9, 0, 0, Math.PI * 2);
      }, { translucency: 0.72, refraction: 0.1 });
      api.specularLines([[54, 38, 52, 98], [76, 38, 78, 98]], 7);
      api.rim(bodies.trash, 5);
    },
  },
  document: {
    large: (api) => {
      api.glass((ctx) => path(ctx, [[82, 10], [104, 32], [82, 32]]), { translucency: 0.55, refraction: 0.18 });
      api.ink((ctx) => {
        ctx.beginPath();
        for (let index = 0; index < 4; index += 1) ctx.roundRect(42, 52 + index * 14, index === 3 ? 30 : 46, 6, 3);
        ctx.fill();
      }, 0.28);
    },
    small: (api) => {
      api.glass((ctx) => path(ctx, [[82, 10], [104, 32], [82, 32]]), { translucency: 0.6, refraction: 0.1 });
      api.ink((ctx) => {
        ctx.beginPath();
        for (let index = 0; index < 3; index += 1) ctx.roundRect(42, 54 + index * 18, index === 2 ? 28 : 46, 8, 4);
        ctx.fill();
      }, 0.34);
    },
  },
  daHandler: {
    large: (api) => {
      // Rule behind, pencil in front: two different objects, not two bars.
      api.glass((ctx) => {
        ctx.save();
        ctx.translate(64, 64);
        ctx.rotate(0.66);
        ctx.beginPath();
        ctx.roundRect(-11, -40, 22, 80, 6);
        ctx.restore();
      }, { translucency: 0.46, refraction: 0.24 });
      api.solid((ctx) => {
        ctx.save();
        ctx.translate(64, 62);
        ctx.rotate(-0.66);
        ctx.beginPath();
        ctx.roundRect(-10, -38, 20, 60, 5);
        ctx.moveTo(-10, 22);
        ctx.lineTo(10, 22);
        ctx.lineTo(0, 42);
        ctx.restore();
      });
    },
    small: (api) => {
      api.solid((ctx) => {
        ctx.save();
        ctx.translate(64, 62);
        ctx.rotate(-0.66);
        ctx.beginPath();
        ctx.roundRect(-12, -38, 24, 58, 6);
        ctx.moveTo(-12, 20);
        ctx.lineTo(12, 20);
        ctx.lineTo(0, 44);
        ctx.restore();
      });
    },
  },
  controlPanel: {
    large: (api) => {
      api.glass((ctx) => gearPath(ctx, 64, 64, 40, 8, 0.7), { translucency: 0.55, refraction: 0.28 });
      api.hole((ctx) => {
        ctx.beginPath();
        ctx.arc(64, 64, 13, 0, Math.PI * 2);
      });
    },
    small: (api) => {
      api.glass((ctx) => gearPath(ctx, 64, 64, 42, 6, 0.66), { translucency: 0.66, refraction: 0.12 });
      api.hole((ctx) => {
        ctx.beginPath();
        ctx.arc(64, 64, 14, 0, Math.PI * 2);
      });
    },
  },
  searcher: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(26, 26, 56, 74, 10);
      }, { translucency: 0.55, refraction: 0.24 });
      api.ink((ctx) => {
        ctx.beginPath();
        for (let index = 0; index < 3; index += 1) ctx.roundRect(38, 42 + index * 14, index === 2 ? 22 : 34, 5, 2.5);
        ctx.fill();
      }, 0.3);
      api.lens(80, 78, 26, 0.86);
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(22, 24, 54, 66, 10);
      }, { translucency: 0.6, refraction: 0.12 });
      api.lens(80, 78, 30, 0.86);
    },
  },
  teachText: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(28, 24, 60, 80, 10);
      }, { translucency: 0.58, refraction: 0.26 });
      api.ink((ctx) => {
        ctx.beginPath();
        for (let index = 0; index < 4; index += 1) ctx.roundRect(40, 40 + index * 13, index === 3 ? 22 : 36, 5, 2.5);
        ctx.fill();
      }, 0.3);
      api.solid((ctx) => {
        ctx.save();
        ctx.translate(84, 74);
        ctx.rotate(-0.72);
        ctx.beginPath();
        ctx.roundRect(-9, -40, 18, 62, 9);
        ctx.moveTo(-7, 22);
        ctx.lineTo(7, 22);
        ctx.lineTo(0, 40);
        ctx.restore();
      });
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(24, 24, 58, 74, 10);
      }, { translucency: 0.62, refraction: 0.12 });
      api.solid((ctx) => {
        ctx.save();
        ctx.translate(82, 70);
        ctx.rotate(-0.72);
        ctx.beginPath();
        ctx.roundRect(-11, -38, 22, 62, 11);
        ctx.moveTo(-9, 24);
        ctx.lineTo(9, 24);
        ctx.lineTo(0, 44);
        ctx.restore();
      });
    },
  },
  // ClioTalk: solid user balloon, dashed provisional model reply. The dash is
  // the product's temporary-output rule made visible at icon scale.
  assistant: {
    large: (api) => {
      api.glass((ctx) => {
        speechBalloonPath(ctx, 18, 22, 70, 40, 12, 34, "left");
      }, { translucency: 0.5, refraction: 0.26 });
      api.inkStroke((ctx) => {
        speechBalloonPath(ctx, 18, 22, 70, 40, 12, 34, "left");
      }, 5);
      api.glass((ctx) => {
        speechBalloonPath(ctx, 40, 66, 70, 40, 12, 94, "right");
      }, { translucency: 0.68, refraction: 0.3 });
      api.inkStroke((ctx) => {
        ctx.setLineDash([9, 7]);
        speechBalloonPath(ctx, 40, 66, 70, 40, 12, 94, "right");
      }, 5);
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(34, 38, 36, 6, 3);
        ctx.roundRect(56, 82, 36, 6, 3);
        ctx.fill();
      }, 0.48);
    },
    small: (api) => {
      api.glass((ctx) => {
        speechBalloonPath(ctx, 14, 18, 76, 42, 11, 30, "left");
      }, { translucency: 0.58, refraction: 0.12 });
      api.inkStroke((ctx) => {
        speechBalloonPath(ctx, 14, 18, 76, 42, 11, 30, "left");
      }, 7);
      api.glass((ctx) => {
        speechBalloonPath(ctx, 38, 66, 76, 42, 11, 98, "right");
      }, { translucency: 0.72, refraction: 0.12 });
      api.inkStroke((ctx) => {
        ctx.setLineDash([12, 9]);
        speechBalloonPath(ctx, 38, 66, 76, 42, 11, 98, "right");
      }, 7);
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(35, 35, 36, 8, 4);
        ctx.roundRect(57, 83, 36, 8, 4);
        ctx.fill();
      }, 0.58);
    },
  },
  scrapbook: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(24, 26, 80, 76, 10);
      }, { translucency: 0.52, refraction: 0.26 });
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(38, 40, 52, 48, 6);
      }, { translucency: 0.4, refraction: 0.22 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.moveTo(38, 82);
        ctx.lineTo(56, 60);
        ctx.lineTo(70, 76);
        ctx.lineTo(80, 66);
        ctx.lineTo(90, 82);
        ctx.closePath();
        ctx.arc(78, 52, 7, 0, Math.PI * 2);
        ctx.fill();
      }, 0.4);
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(22, 26, 84, 74, 10);
      }, { translucency: 0.58, refraction: 0.12 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.moveTo(32, 88);
        ctx.lineTo(56, 56);
        ctx.lineTo(74, 76);
        ctx.lineTo(86, 62);
        ctx.lineTo(98, 88);
        ctx.closePath();
        ctx.fill();
      }, 0.46);
    },
  },
  reviewDesk: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(24, 24, 58, 76, 10);
      }, { translucency: 0.55, refraction: 0.26 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(36, 38, 34, 5, 2.5);
        ctx.roundRect(36, 50, 26, 5, 2.5);
        ctx.fill();
      }, 0.3);
      api.inkStroke((ctx) => {
        ctx.beginPath();
        ctx.moveTo(36, 74);
        ctx.lineTo(46, 84);
        ctx.lineTo(68, 60);
      }, 8);
      api.lens(84, 82, 24, 0.9);
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(20, 22, 56, 68, 10);
      }, { translucency: 0.6, refraction: 0.12 });
      api.inkStroke((ctx) => {
        ctx.beginPath();
        ctx.moveTo(30, 60);
        ctx.lineTo(44, 76);
        ctx.lineTo(70, 40);
      }, 11);
      api.lens(88, 84, 26, 0.9);
    },
  },
  // DocMap renders a document's headings as a branching map, so the object is a
  // page whose structure grows out of it — not a road map and not a node graph.
  docMap: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(22, 24, 46, 80, 8);
      }, { translucency: 0.6, refraction: 0.26 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(32, 38, 26, 6, 3);
        ctx.roundRect(32, 52, 20, 5, 2.5);
        ctx.fill();
      }, 0.42);
      api.inkStroke((ctx) => {
        ctx.beginPath();
        ctx.moveTo(58, 64);
        ctx.lineTo(78, 64);
        ctx.moveTo(78, 40);
        ctx.lineTo(78, 88);
        ctx.moveTo(78, 40);
        ctx.lineTo(94, 40);
        ctx.moveTo(78, 64);
        ctx.lineTo(94, 64);
        ctx.moveTo(78, 88);
        ctx.lineTo(94, 88);
      }, 6);
      api.ink((ctx) => {
        ctx.beginPath();
        for (const y of [40, 64, 88]) ctx.roundRect(94, y - 7, 16, 14, 7);
        ctx.fill();
      }, 0.95);
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(20, 26, 40, 76, 8);
      }, { translucency: 0.66, refraction: 0.12 });
      api.inkStroke((ctx) => {
        ctx.beginPath();
        ctx.moveTo(56, 64);
        ctx.lineTo(76, 64);
        ctx.moveTo(76, 40);
        ctx.lineTo(76, 88);
        ctx.moveTo(76, 40);
        ctx.lineTo(88, 40);
        ctx.moveTo(76, 88);
        ctx.lineTo(88, 88);
      }, 8);
      api.ink((ctx) => {
        ctx.beginPath();
        for (const y of [40, 88]) ctx.roundRect(88, y - 10, 20, 20, 10);
        ctx.roundRect(84, 54, 22, 20, 10);
        ctx.fill();
      }, 0.95);
    },
  },
  projectDisk: {
    large: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(32, 44, 64, 34, 8);
      }, { translucency: 0.5, refraction: 0.24 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(42, 54, 30, 6, 3);
        ctx.roundRect(42, 66, 44, 5, 2.5);
        ctx.fill();
      }, 0.34);
    },
    small: (api) => {
      api.glass((ctx) => {
        ctx.beginPath();
        ctx.roundRect(30, 44, 68, 32, 8);
      }, { translucency: 0.6, refraction: 0.12 });
      api.ink((ctx) => {
        ctx.beginPath();
        ctx.roundRect(40, 54, 40, 10, 5);
        ctx.fill();
      }, 0.4);
    },
  },
};

function gearPath(ctx, x, y, radius, teeth, innerRatio) {
  ctx.beginPath();
  const steps = teeth * 4;
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const phase = index % 4;
    const r = phase === 0 || phase === 3 ? radius : radius * innerRatio;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function handsetPath(ctx, x, y, scale, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.roundRect(-40, -8, 80, 22, 11);
  ctx.roundRect(-46, -20, 26, 40, 12);
  ctx.roundRect(20, -20, 26, 40, 12);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Material stack                                                      *
 * ------------------------------------------------------------------ */

function paintBackground(ctx, id, appearance, params) {
  const icon = source.icons[id];
  const free = icon.container === "free-form";
  const shape = free ? bodies[id] : enclosurePath;
  let [top, bottom] = icon.identity;
  if (params.backgroundDarken) {
    top = mix(top, "#0b1622", params.backgroundDarken);
    bottom = mix(bottom, "#060d16", params.backgroundDarken + 0.1);
  }
  ctx.save();
  ctx.globalAlpha = params.backgroundAlpha;
  shape(ctx);
  ctx.fillStyle = linear(ctx, 18, 8, 104, 118, [[0, top], [0.45, mix(top, bottom, 0.45)], [1, bottom]]);
  ctx.fill();
  ctx.restore();
  // Directional specular rim: bright across the top and upper left, gone by the
  // lower right. A uniform ring would read as generic glassmorphism.
  ctx.save();
  shape(ctx);
  ctx.clip();
  ctx.strokeStyle = linear(ctx, 10, 8, 110, 118, [
    [0, `rgba(255,255,255,${0.95 * params.rimAlpha})`],
    [0.42, `rgba(255,255,255,${0.34 * params.rimAlpha})`],
    [1, "rgba(255,255,255,0)"],
  ]);
  ctx.lineWidth = 5;
  shape(ctx);
  ctx.stroke();
  ctx.fillStyle = linear(ctx, 0, 8, 0, 48, [
    [0, `rgba(255,255,255,${0.18 * params.rimAlpha})`],
    [1, "rgba(255,255,255,0)"],
  ]);
  ctx.fillRect(0, 0, 128, 48);
  ctx.restore();
}

function bounds(shape) {
  // Measure a shape by rasterising it once; cheaper than tracking every path.
  const probe = createCanvas(128, 128);
  const ctx = probe.getContext("2d");
  shape(ctx);
  ctx.fillStyle = "#000";
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, 128, 128);
  let minX = 128;
  let minY = 128;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if (!data[(y * 128 + x) * 4 + 3]) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function makeApi(ctx, background, params, appearance) {
  const glassFill = (alpha) => `rgba(255,255,255,${alpha})`;
  const clear = appearance === "clear";
  const inkColor = appearance === "dark" ? "#e8f1ff" : INK;
  const halo = (draw, width) => {
    if (!clear) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    draw(ctx);
    ctx.stroke();
    ctx.restore();
  };
  return {
    // A glass layer: shadow, refracted background, tinted body, inner highlight,
    // and a directional edge. Every parameter comes from the layer plus the
    // appearance, so no two tiers get the same material.
    glass(shape, { translucency, refraction }) {
      const box = bounds(shape);
      ctx.save();
      ctx.filter = "blur(4px)";
      ctx.fillStyle = `rgba(10,20,32,${0.3 * params.shadowAlpha + 0.08})`;
      ctx.translate(0, 3);
      shape(ctx);
      ctx.fill();
      ctx.restore();

      ctx.save();
      shape(ctx);
      ctx.clip();
      const strength = refraction * params.refraction * 4.2;
      ctx.save();
      ctx.translate(box.cx, box.cy);
      ctx.scale(1 + strength, 1 + strength);
      ctx.translate(-box.cx, -box.cy + strength * 12);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(background, 0, 0);
      ctx.restore();
      const density = translucency * params.glassAlpha;
      ctx.fillStyle = linear(ctx, 0, box.minY, 0, box.maxY, [
        [0, glassFill(Math.min(0.98, density * 1.15))],
        [0.55, glassFill(density * 0.72)],
        [1, glassFill(density * 0.34)],
      ]);
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = linear(ctx, 0, box.minY, 0, box.maxY, [
        [0, `rgba(255,255,255,${0.36 * params.rimAlpha})`],
        [0.45, "rgba(255,255,255,0)"],
        [1, `rgba(90,130,175,${0.2 * params.rimAlpha})`],
      ]);
      ctx.fillRect(0, 0, 128, 128);
      ctx.restore();

      ctx.save();
      shape(ctx);
      ctx.clip();
      ctx.strokeStyle = linear(ctx, box.minX, box.minY, box.maxX, box.maxY, [
        [0, `rgba(255,255,255,${0.98 * params.rimAlpha})`],
        [0.45, `rgba(255,255,255,${0.3 * params.rimAlpha})`],
        [1, "rgba(255,255,255,0)"],
      ]);
      ctx.lineWidth = 3.4;
      shape(ctx);
      ctx.stroke();
      ctx.restore();
    },
    // A solid layer: the mark that must stay readable at every appearance.
    solid(shape) {
      ctx.save();
      ctx.filter = "blur(3px)";
      ctx.fillStyle = `rgba(10,20,32,${0.36 * params.shadowAlpha + 0.1})`;
      ctx.translate(0, 3);
      shape(ctx);
      ctx.fill();
      ctx.restore();
      halo(shape, 6);
      ctx.save();
      ctx.fillStyle = inkColor;
      ctx.globalAlpha = Math.min(1, 0.92 * params.symbolContrast);
      shape(ctx);
      ctx.fill();
      ctx.restore();
    },
    ink(draw, alpha = 0.72) {
      halo(draw, 5);
      ctx.save();
      ctx.fillStyle = inkColor;
      ctx.globalAlpha = Math.min(1, alpha * params.symbolContrast);
      draw(ctx);
      ctx.restore();
    },
    inkStroke(draw, width) {
      halo(draw, width + 4);
      ctx.save();
      ctx.strokeStyle = inkColor;
      ctx.globalAlpha = Math.min(1, 0.92 * params.symbolContrast);
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      draw(ctx);
      ctx.stroke();
      ctx.restore();
    },
    // A directional bright edge on any silhouette, for the clear objects whose
    // body would otherwise disappear against a light desktop.
    rim(shape, width) {
      const box = bounds(shape);
      ctx.save();
      ctx.strokeStyle = linear(ctx, box.minX, box.minY, box.maxX, box.maxY, [
        [0, `rgba(255,255,255,${0.95 * params.rimAlpha})`],
        [0.5, `rgba(255,255,255,${0.5 * params.rimAlpha})`],
        [1, `rgba(120,150,180,${0.6 * params.rimAlpha})`],
      ]);
      ctx.lineWidth = width;
      shape(ctx);
      ctx.stroke();
      ctx.restore();
    },
    specularLines(lines, width) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.72 * params.rimAlpha})`;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      for (const [x0, y0, x1, y1] of lines) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    },
    // Cut a hole so a layer reads as an object rather than a filled blob.
    hole(shape) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      shape(ctx);
      ctx.fill();
      ctx.restore();
    },
    lens(x, y, radius, angle) {
      this.solid((ctx2) => {
        ctx2.save();
        ctx2.translate(x, y);
        ctx2.rotate(angle);
        ctx2.beginPath();
        ctx2.roundRect(-6, radius * 0.6, 12, radius * 1.1, 6);
        ctx2.restore();
      });
      this.glass((ctx2) => {
        ctx2.beginPath();
        ctx2.arc(x, y, radius, 0, Math.PI * 2);
      }, { translucency: 0.66, refraction: 0.34 });
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * params.rimAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, radius - 1.5, Math.PI * 0.95, Math.PI * 1.75);
      ctx.stroke();
      ctx.restore();
    },
  };
}

function paintIcon(ctx, id, appearance, small) {
  const params = { ...source.appearanceModel[appearance] };
  if (small) {
    // Small art keeps the layer model but spends less on optics, because a
    // faithful large parameter set turns to mud at Finder sizes.
    params.refraction *= 0.45;
    params.glassAlpha = Math.min(0.9, params.glassAlpha * 1.2);
    params.symbolContrast *= 1.15;
    params.rimAlpha *= 0.9;
  }
  const backgroundCanvas = createCanvas(128, 128);
  const backgroundCtx = backgroundCanvas.getContext("2d");
  paintBackground(backgroundCtx, id, appearance, params);

  // Ambient shadow under the whole object, then the background, then the layers.
  const icon = source.icons[id];
  const shape = icon.container === "free-form" ? bodies[id] : enclosurePath;
  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.fillStyle = `rgba(12,22,34,${params.shadowAlpha})`;
  ctx.translate(0, 6);
  shape(ctx);
  ctx.fill();
  ctx.restore();
  ctx.drawImage(backgroundCanvas, 0, 0);

  const api = makeApi(ctx, backgroundCanvas, params, appearance);
  const recipe = small ? symbols[id].small : symbols[id].large;
  ctx.save();
  shape(ctx);
  ctx.clip();
  recipe(api);
  ctx.restore();
}

// Two passes: paint once to find the object, then paint again on the shared
// icon grid. The enclosure objects and the free-form ones used to differ by
// half again in optical size, which read as a jumble in one row.
function render(id, size, appearance) {
  const supersample = 4;
  const px = size * supersample;
  const paint = (target) => {
    target.save();
    target.scale(px / 128, px / 128);
    paintIcon(target, id, appearance, size <= 32);
    target.restore();
  };
  const measure = createCanvas(px, px);
  paint(measure.getContext("2d"));
  const box = inkBox(measure.getContext("2d"), px);
  const working = createCanvas(px, px);
  const ctx = working.getContext("2d");
  let shape = null;
  if (box) {
    const grid = gridTransform("liquid-glass", id, box, px);
    ctx.setTransform(grid.scale, 0, 0, grid.scale, grid.dx, grid.dy);
    shape = grid.shape;
  }
  paint(ctx);
  const canvas = createCanvas(size, size);
  const output = canvas.getContext("2d");
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = "high";
  output.drawImage(working, 0, 0, size, size);
  return { canvas, ctx: output, shape };
}

function metrics(ctx, size) {
  const { data } = ctx.getImageData(0, 0, size, size);
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  let translucent = 0;
  const colors = new Set();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const alpha = data[offset + 3];
      if (!alpha) continue;
      pixels += 1;
      if (alpha < 250) translucent += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${alpha}`);
    }
  }
  return { pixels, translucent, colors: colors.size, bbox: { minX, minY, maxX, maxY }, ink: inkBox(ctx, size) };
}

const generated = {};
const runtimeCore = {};
for (const id of ids) {
  generated[id] = { ...source.icons[id], sourceKind: "layered-liquid-glass-composition", sizes: {}, metrics: {} };
  for (const appearance of appearances) {
    for (const size of sizes) {
      const { canvas, ctx, shape } = render(id, size, appearance);
      const filename = `${id}-${size}-${appearance}.png`;
      const buffer = canvas.toBuffer("image/png", { compressionLevel: 9 });
      writeFileSync(join(assetDir, filename), buffer);
      generated[id].sizes[`${size}-${appearance}`] = `icons/${filename}`;
      generated[id].metrics[`${size}-${appearance}`] = {
        ...metrics(ctx, size),
        gridShape: shape,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        bytes: buffer.length,
      };
      if (size === 32 && appearance === "default") runtimeCore[id] = `icons/${filename}`;
    }
  }
}

const family = {
  schemaVersion: 1,
  target: source.target,
  generatedBy: "tooling/build-liquid-glass-core-icons.mjs",
  coreOnly: true,
  nativeSizes: sizes,
  appearances,
  referenceLedger: "icons/src/liquid-glass-core-icons.json",
  referenceBoard: "internal/evidence/drafts/era-icons/liquid-glass-core-reference-board.png",
  materialRule: "Artwork contributes silhouettes only; the renderer applies the material stack from the appearance table. Dark and Clear are re-rendered from the same layers, never filtered from the default image.",
  refractionRule: "Foreground layers redraw the background they cover, displaced and scaled about their own centre.",
  continuityRule: source.continuityRule,
  icons: generated,
};
writeFileSync(join(assetDir, "liquid-glass-core-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "liquid-glass-core-icon-manifest.json"), `${JSON.stringify(runtimeCore, null, 2)}\n`);

const familyFile = join(themeDir, "liquid-glass-icon-family.json");
const eraFamily = JSON.parse(readFileSync(familyFile, "utf8"));
eraFamily.reviewedCore = ids;
eraFamily.coreBuilder = "tooling/build-liquid-glass-core-icons.mjs";
for (const id of ids) {
  eraFamily.icons[id] = {
    ...eraFamily.icons[id],
    genre: source.icons[id].genre,
    physicalMetaphor: source.icons[id].symbol,
    metaphorKey: source.icons[id].metaphorKey,
    container: source.icons[id].container,
    semanticMark: "object-owned",
    reviewStatus: "accepted-core",
    sizes: Object.fromEntries(sizes.map((size) => [size, `icons/${id}-${size}-default.png`])),
    appearances: Object.fromEntries(appearances.map((appearance) => [appearance, `icons/${id}-32-${appearance}.png`])),
    appearanceSizes: Object.fromEntries(appearances.flatMap((appearance) => sizes.map((size) => [
      `${size}-${appearance}`,
      `icons/${id}-${size}-${appearance}.png`,
    ]))),
  };
}
writeFileSync(familyFile, `${JSON.stringify(eraFamily, null, 2)}\n`);

const manifestFile = join(themeDir, "liquid-glass-icon-manifest.json");
const eraManifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const id of ids) eraManifest[id] = runtimeCore[id];
writeFileSync(manifestFile, `${JSON.stringify(eraManifest, null, 2)}\n`);

function label(ctx, text, x, y, { font = "12px sans-serif", color = "#e8eef5", align = "left" } = {}) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillText(text, x, y);
}

// Boards are rendered on real wallpapers when they are available, because a
// Liquid Glass icon that is only checked on a flat page is not checked.
async function wallpaper(name) {
  const file = join(root, "internal/evidence/drafts/liquid-glass-reference/captures/wallpapers", name);
  return existsSync(file) ? loadImage(file) : null;
}

async function contactSheet() {
  const cellWidth = 250;
  const cellHeight = 200;
  const columns = 4;
  const rows = Math.ceil(ids.length / columns);
  const canvas = createCanvas(cellWidth * columns, 78 + cellHeight * rows);
  const ctx = canvas.getContext("2d");
  const paper = await wallpaper("26-Tahoe-Light-6K.png");
  if (paper) ctx.drawImage(paper, 0, 0, canvas.width, canvas.height);
  else { ctx.fillStyle = "#d8e2ec"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.fillStyle = "rgba(12,22,34,.4)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Liquid Glass core · layered 128 / 64 / 32 / 16", 28, 36, { font: "bold 22px sans-serif" });
  label(ctx, "macOS Tahoe 26 · default appearance on the system wallpaper", 28, 60, { color: "#c3d2e0" });
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const x = (index % columns) * cellWidth;
    const y = 78 + Math.floor(index / columns) * cellHeight;
    const [large, medium, regular, small] = await Promise.all([128, 64, 32, 16]
      .map((size) => loadImage(join(assetDir, `${id}-${size}-default.png`))));
    ctx.drawImage(large, x + 14, y + 30, 128, 128);
    ctx.drawImage(medium, x + 150, y + 40, 64, 64);
    ctx.drawImage(regular, x + 150, y + 112, 32, 32);
    ctx.drawImage(small, x + 190, y + 120, 16, 16);
    label(ctx, source.icons[id].label, x + 16, y + 24, { font: "bold 13px sans-serif" });
    label(ctx, id, x + 150, y + 160, { font: "12px monospace", color: "#c3d2e0" });
    label(ctx, source.icons[id].container, x + 150, y + 176, { font: "11px sans-serif", color: "#a7bacb" });
  }
  writeFileSync(join(draftDir, "liquid-glass-core-contact-sheet.png"), canvas.toBuffer("image/png"));
}

async function appearanceBoard() {
  const backgrounds = [
    ["Light wallpaper", await wallpaper("26-Tahoe-Light-6K.png"), "#e3ebf2"],
    ["Dark wallpaper", await wallpaper("26-Tahoe-Dark-6K.png"), "#101820"],
    ["Neutral grey", null, "#8a9099"],
  ];
  const rowHeight = 150;
  const canvas = createCanvas(160 + ids.length * 78, 70 + appearances.length * backgrounds.length * rowHeight / 2);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#141a20";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Liquid Glass · appearance and background matrix", 20, 34, { font: "bold 18px sans-serif" });
  let row = 0;
  for (const appearance of appearances) {
    for (const [name, image, fallback] of backgrounds) {
      const y = 54 + row * 75;
      if (image) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(150, y, ids.length * 78, 72);
        ctx.clip();
        ctx.drawImage(image, 150, y - row * 120, ids.length * 78, 480);
        ctx.restore();
      } else {
        ctx.fillStyle = fallback;
        ctx.fillRect(150, y, ids.length * 78, 72);
      }
      label(ctx, `${appearance} · ${name}`, 16, y + 40, { font: "12px sans-serif" });
      for (let index = 0; index < ids.length; index += 1) {
        const icon = await loadImage(join(assetDir, `${ids[index]}-64-${appearance}.png`));
        ctx.drawImage(icon, 150 + index * 78 + 7, y + 4, 64, 64);
      }
      row += 1;
    }
  }
  writeFileSync(join(draftDir, "liquid-glass-core-appearance-board.png"), canvas.toBuffer("image/png"));
}

async function referenceBoard() {
  const entries = source.referenceBoard;
  const cellWidth = 300;
  const cellHeight = 128;
  const columns = 3;
  const rows = Math.ceil(entries.length / columns);
  const canvas = createCanvas(cellWidth * columns, 76 + cellHeight * rows);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#161d25";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  label(ctx, "Liquid Glass reference board", 24, 34, { font: "bold 21px sans-serif" });
  label(ctx, "Measured Tahoe 26 evidence: layers, container decision, appearance behaviour. Evidence stays local.", 24, 56, { color: "#9fb0c0" });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const x = (index % columns) * cellWidth;
    const y = 76 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = "#1e2732";
    ctx.fillRect(x + 8, y + 6, cellWidth - 16, cellHeight - 14);
    label(ctx, entry.label, x + 16, y + 26, { font: "bold 13px sans-serif" });
    label(ctx, entry.coreId ? `→ ${entry.coreId}` : "family control only", x + 16, y + 44, { font: "12px monospace", color: "#7fb6e8" });
    const gradient = entry.measured?.enclosureGradient || [];
    for (let swatch = 0; swatch < gradient.length; swatch += 1) {
      ctx.fillStyle = gradient[swatch];
      ctx.fillRect(x + 16 + swatch * 20, y + 54, 18, 18);
    }
    const words = String(entry.observation || "").split(" ");
    let line = "";
    let lineIndex = 0;
    for (const word of words) {
      if ((line + word).length > 44) {
        label(ctx, line, x + 16, y + 88 + lineIndex * 13, { font: "10px sans-serif", color: "#9fb0c0" });
        line = "";
        lineIndex += 1;
        if (lineIndex > 2) break;
      }
      line += `${word} `;
    }
    if (lineIndex <= 2) label(ctx, line, x + 16, y + 88 + lineIndex * 13, { font: "10px sans-serif", color: "#9fb0c0" });
  }
  writeFileSync(join(draftDir, "liquid-glass-core-reference-board.png"), canvas.toBuffer("image/png"));
}

await contactSheet();
await appearanceBoard();
await referenceBoard();

if (!existsSync(join(assetDir, "finderApp-128-default.png"))) throw new Error("Liquid Glass core build produced no artwork");
console.log(`OK  Liquid Glass core: ${ids.length} objects × ${sizes.join("/")} px × ${appearances.join("/")}, boards rebuilt`);
