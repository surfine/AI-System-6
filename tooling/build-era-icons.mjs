import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ICON_SPECS as ICONS } from "./lib/icon-family-inventory.mjs";

const require = createRequire(import.meta.url);
const { gridTransform, inkBox } = await import("./lib/icon-grid.mjs");
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The semantic metaphor is shared because the object keeps its meaning across
// appearances. Geometry is not shared: every era below owns its body,
// perspective, light, edge treatment, badge construction, and size hints.

const THEMES = {
  platinum: { sizes: [32, 16], manifest: "platinum-icon-manifest.json" },
  aqua: { sizes: [128, 32, 16], manifest: "aqua-icon-manifest.json" },
  "snow-leopard": { sizes: [512, 128, 32, 16], manifest: "snow-leopard-icon-manifest.json" },
  yosemite: { sizes: [128, 64, 32, 16], manifest: "yosemite-icon-manifest.json" },
  "liquid-glass": { sizes: [128, 64, 32, 16], manifest: "liquid-glass-icon-manifest.json" }
};

const TONES = {
  blue: ["#d9efff", "#75b9ec", "#2f73b8", "#173e75"],
  violet: ["#eeeeff", "#a7a3db", "#6967a9", "#35365f"],
  red: ["#ffd9d5", "#e88778", "#b3453d", "#6d292c"],
  green: ["#d8f1d9", "#77b47b", "#39733d", "#193e24"],
  gold: ["#fff0bf", "#dab86c", "#9a7140", "#583e27"],
  gray: ["#eef1f4", "#b6bec8", "#788390", "#3f4853"],
  steel: ["#f5f7f9", "#c8d0d9", "#7d8a99", "#3a4652"],
  paper: ["#ffffff", "#f1f0e9", "#d2d0c5", "#77756f"],
  rainbow: ["#e9f6ff", "#9bc6e2", "#587da1", "#33485e"]
};

function attrs(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}="${String(value).replaceAll("&", "&amp;").replaceAll("\"", "&quot;")}"`)
    .join(" ");
}

function node(tag, values = {}, content = "") {
  return content ? `<${tag} ${attrs(values)}>${content}</${tag}>` : `<${tag} ${attrs(values)}/>`;
}

const path = (d, values = {}) => node("path", { d, ...values });
const rect = (x, y, width, height, values = {}) => node("rect", { x, y, width, height, ...values });
const circle = (cx, cy, r, values = {}) => node("circle", { cx, cy, r, ...values });
const ellipse = (cx, cy, rx, ry, values = {}) => node("ellipse", { cx, cy, rx, ry, ...values });
const line = (x1, y1, x2, y2, values = {}) => node("line", { x1, y1, x2, y2, ...values });
const group = (content, values = {}) => node("g", values, content);

function tier(size) {
  if (size <= 16) return "small";
  if (size <= 32) return "regular";
  if (size <= 128) return "large";
  return "master";
}

function fileStem(theme, id) {
  if ((theme === "platinum" || theme === "yosemite") && id === "startupDisk") return "startup-disk";
  if ((theme === "platinum" || theme === "yosemite") && id === "finderApp") return "finder-app";
  if (theme === "platinum" && id === "fileFloppy") return "floppy";
  return id;
}

function eraDefs(theme, spec) {
  const tone = TONES[spec.tone] || TONES.blue;
  if (theme === "aqua") {
    return `<defs>
      <linearGradient id="body" x1="0" y1="0" x2="0.82" y2="1"><stop offset="0" stop-color="${tone[0]}"/><stop offset="0.38" stop-color="${tone[1]}"/><stop offset="0.7" stop-color="${tone[2]}"/><stop offset="1" stop-color="${tone[3]}"/></linearGradient>
      <linearGradient id="paper" x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#f5f7fa"/><stop offset="1" stop-color="#c8d1dc"/></linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.22" stop-color="#dce5ef"/><stop offset="0.53" stop-color="#8d9dad"/><stop offset="0.72" stop-color="#eef3f8"/><stop offset="1" stop-color="#657281"/></linearGradient>
      <radialGradient id="aquaGlass" cx="0.28" cy="0.18" r="0.82"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.32" stop-color="#bfe9ff" stop-opacity="0.72"/><stop offset="0.7" stop-color="#4f9ed8" stop-opacity="0.45"/><stop offset="1" stop-color="#16588f" stop-opacity="0.82"/></radialGradient>
    </defs>`;
  }
  if (theme === "snow-leopard") {
    return `<defs>
      <linearGradient id="body" x1="0.08" y1="0" x2="0.92" y2="1"><stop offset="0" stop-color="${tone[0]}"/><stop offset="0.42" stop-color="${tone[1]}"/><stop offset="1" stop-color="${tone[3]}"/></linearGradient>
      <linearGradient id="paper" x1="0" y1="0" x2="0.75" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.66" stop-color="#f4f3ed"/><stop offset="1" stop-color="#bdc3c9"/></linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stop-color="#fdfefe"/><stop offset="0.18" stop-color="#bec7cf"/><stop offset="0.47" stop-color="#6f7d8a"/><stop offset="0.65" stop-color="#e1e6e9"/><stop offset="1" stop-color="#48535d"/></linearGradient>
      <radialGradient id="lens" cx="0.3" cy="0.22" r="0.78"><stop offset="0" stop-color="#e8f7ff" stop-opacity="0.92"/><stop offset="0.48" stop-color="#72b2dc" stop-opacity="0.74"/><stop offset="1" stop-color="#234c6d" stop-opacity="0.92"/></radialGradient>
      <linearGradient id="leather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c39a69"/><stop offset="0.52" stop-color="#87603f"/><stop offset="1" stop-color="#4b3024"/></linearGradient>
    </defs>`;
  }
  if (theme === "yosemite") {
    return `<defs>
      <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tone[0]}"/><stop offset="1" stop-color="${tone[1]}"/></linearGradient>
      <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef3f7"/></linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7fafc"/><stop offset="1" stop-color="#b7c3cf"/></linearGradient>
    </defs>`;
  }
  if (theme === "liquid-glass") {
    return `<defs>
      <linearGradient id="glassBlue" x1="0.12" y1="0" x2="0.86" y2="1"><stop offset="0" stop-color="#f2fbff" stop-opacity="0.96"/><stop offset="0.3" stop-color="#8ed8ff" stop-opacity="0.9"/><stop offset="0.72" stop-color="#2688e8" stop-opacity="0.84"/><stop offset="1" stop-color="#1652b8" stop-opacity="0.92"/></linearGradient>
      <linearGradient id="glassClear" x1="0.08" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/><stop offset="0.46" stop-color="#edf7ff" stop-opacity="0.82"/><stop offset="1" stop-color="#a9c7dc" stop-opacity="0.86"/></linearGradient>
      <linearGradient id="glassSteel" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.96"/><stop offset="0.34" stop-color="#d4e1ec" stop-opacity="0.92"/><stop offset="0.7" stop-color="#8299ad" stop-opacity="0.88"/><stop offset="1" stop-color="#49637b" stop-opacity="0.94"/></linearGradient>
      <linearGradient id="glassViolet" x1="0.1" y1="0" x2="0.86" y2="1"><stop offset="0" stop-color="#fbf7ff" stop-opacity="0.96"/><stop offset="0.35" stop-color="#c8a9ff" stop-opacity="0.9"/><stop offset="0.72" stop-color="#7e55d8" stop-opacity="0.88"/><stop offset="1" stop-color="#49339b" stop-opacity="0.94"/></linearGradient>
      <linearGradient id="glassRed" x1="0.08" y1="0" x2="0.88" y2="1"><stop offset="0" stop-color="#fff8f7" stop-opacity="0.97"/><stop offset="0.34" stop-color="#ffaca4" stop-opacity="0.92"/><stop offset="0.72" stop-color="#e34d58" stop-opacity="0.9"/><stop offset="1" stop-color="#a5273f" stop-opacity="0.95"/></linearGradient>
      <linearGradient id="glassGreen" x1="0.1" y1="0" x2="0.86" y2="1"><stop offset="0" stop-color="#f5fff7" stop-opacity="0.97"/><stop offset="0.36" stop-color="#91e7ad" stop-opacity="0.9"/><stop offset="0.72" stop-color="#29a967" stop-opacity="0.9"/><stop offset="1" stop-color="#147143" stop-opacity="0.95"/></linearGradient>
      <linearGradient id="glassGold" x1="0.08" y1="0" x2="0.88" y2="1"><stop offset="0" stop-color="#fffdf5" stop-opacity="0.98"/><stop offset="0.35" stop-color="#ffe18b" stop-opacity="0.94"/><stop offset="0.72" stop-color="#e5a42f" stop-opacity="0.9"/><stop offset="1" stop-color="#9b6420" stop-opacity="0.95"/></linearGradient>
      <linearGradient id="paperGlass" x1="0.05" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.99"/><stop offset="0.58" stop-color="#f8fbff" stop-opacity="0.94"/><stop offset="1" stop-color="#cfdfeb" stop-opacity="0.9"/></linearGradient>
      <radialGradient id="liquidLens" cx="0.3" cy="0.22" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/><stop offset="0.4" stop-color="#a9e5ff" stop-opacity="0.82"/><stop offset="0.78" stop-color="#278ddd" stop-opacity="0.72"/><stop offset="1" stop-color="#164b8d" stop-opacity="0.9"/></radialGradient>
      <linearGradient id="darkGlass" x1="0.12" y1="0" x2="0.86" y2="1"><stop offset="0" stop-color="#496276"/><stop offset="0.45" stop-color="#1c3448"/><stop offset="1" stop-color="#0d1a27"/></linearGradient>
    </defs>`;
  }
  return "";
}

function symbolMark(spec, theme, detail) {
  const p = theme === "platinum" ? { ink: "#111111", blue: "#336699", red: "#aa3333", green: "#336633", gold: "#996622", white: "#ffffff", sw: 1 }
    : theme === "aqua" ? { ink: "#183c63", blue: "#2b7fc4", red: "#c64e3e", green: "#3f8747", gold: "#b17a2f", white: "#ffffff", sw: 2 }
      : theme === "snow-leopard" ? { ink: "#303b45", blue: "#4c82ac", red: "#aa4e48", green: "#48764c", gold: "#9b7548", white: "#ffffff", sw: 1.8 }
        : { ink: "#35516c", blue: "#2e7fcb", red: "#e45b62", green: "#41a75a", gold: "#d19a3c", white: "#ffffff", sw: 1.7 };
  const stroke = { fill: "none", stroke: p.ink, "stroke-width": p.sw, "stroke-linecap": "round", "stroke-linejoin": "round" };
  switch (spec.symbol) {
    case "none": return "";
    case "startup": return path("M24 38h16v5H24zM27 30h10v4H27z", { fill: p.blue }) + circle(32, 40.5, 1.2, { fill: p.white });
    case "disk": return path("M22 35h20v3H22zM26 41h12", stroke);
    case "applications": return [rect(23, 29, 7, 7, { fill: p.blue }), rect(34, 29, 7, 7, { fill: p.red }), rect(23, 40, 7, 7, { fill: p.gold }), rect(34, 40, 7, 7, { fill: p.green })].join("");
    case "empty": return detail === "small" ? "" : path("M26 31v15M32 30v17M38 31v15", stroke);
    case "full": return path("M23 33l5-5 4 5 5-7 5 8v12H23z", { fill: p.gold, stroke: p.ink, "stroke-width": p.sw });
    case "finder": return path("M26 28c2-2 4-2 6 0M35 28c2-2 4-2 6 0M27 38c3 4 8 5 13 0", stroke);
    case "floppy": return rect(26, 27, 13, 8, { fill: p.white, stroke: p.ink, "stroke-width": p.sw }) + rect(29, 39, 9, 6, { fill: p.blue });
    case "assistant": return path("M21 28h20v13H29l-6 5 2-5h-4z", { fill: p.white, stroke: p.ink, "stroke-width": p.sw }) + path("M27 33h9M27 37h7", stroke);
    case "pencil": return path("M24 43l16-16 4 4-16 16-6 2z", { fill: p.gold, stroke: p.ink, "stroke-width": p.sw }) + path("M25 44l3 3", stroke);
    case "writing": return path("M24 31h17M24 36h14M24 41h17", { ...stroke, stroke: p.blue });
    case "project": return rect(24, 34, 16, 9, { fill: p.blue, stroke: p.ink, "stroke-width": p.sw }) + path("M28 38h8", { ...stroke, stroke: p.white });
    case "cloud": return path("M22 40c-4-7 4-11 9-7 3-7 13-4 12 3 7 0 7 9 0 9H24c-4 0-5-3-2-5z", { fill: p.white, stroke: p.blue, "stroke-width": p.sw });
    case "cloudOff": return path("M22 40c-4-7 4-11 9-7 3-7 13-4 12 3 7 0 7 9 0 9H24c-4 0-5-3-2-5zM20 24l25 25", { fill: "none", stroke: p.red, "stroke-width": p.sw + 1, "stroke-linecap": "round" });
    case "question": return path("M28 29c1-7 12-7 13 0 0 5-6 5-6 10M35 44v1", { ...stroke, stroke: p.blue, "stroke-width": p.sw + 1 });
    case "outline": return path("M25 29h3v3h-3zM31 30h10M25 36h3v3h-3zM31 37h9M25 43h3v3h-3zM31 44h7", { fill: "none", stroke: p.blue, "stroke-width": p.sw });
    case "sections": return path("M26 29h14M26 34h8M26 39h14M26 44h10", { ...stroke, stroke: p.blue });
    case "manuscript": return path("M23 29h18M23 34h15M23 39h18M23 44h12", { ...stroke, stroke: p.ink });
    case "proof": return path("M22 42l8 5 14-19", { fill: "none", stroke: p.red, "stroke-width": p.sw + 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "magnify": return circle(30, 33, 9, { fill: theme === "aqua" ? "url(#aquaGlass)" : theme === "snow-leopard" ? "url(#lens)" : "#d7ecff", stroke: p.ink, "stroke-width": p.sw + 0.5 }) + line(37, 40, 46, 49, { stroke: p.ink, "stroke-width": p.sw + 2, "stroke-linecap": "round" });
    case "reader": return path("M20 29q7-4 12 1v18q-6-4-12-1zM44 29q-7-4-12 1v18q6-4 12-1z", { fill: p.white, stroke: p.blue, "stroke-width": p.sw });
    case "archive": return circle(32, 36, 12, { fill: p.white, stroke: p.ink, "stroke-width": p.sw }) + path("M32 28v9l6 4", stroke);
    case "map": return path("M20 30l8-4 8 4 8-4v20l-8 4-8-4-8 4zM28 26v20M36 30v20", { fill: p.white, stroke: p.blue, "stroke-width": p.sw });
    case "stage": return path("M21 43V29h22v14M18 46h28", stroke) + path("M25 31l14 10H25z", { fill: p.blue });
    case "chart": return path("M23 44V28h19v16zM26 40l4-5 4 2 5-7", { fill: p.white, stroke: p.blue, "stroke-width": p.sw, "stroke-linejoin": "round" });
    case "cover": return rect(23, 27, 18, 21, { rx: theme === "yosemite" ? 2 : 0, fill: theme === "aqua" ? "url(#aquaGlass)" : "#d8ecfa", stroke: p.blue, "stroke-width": p.sw }) + path("M27 32h10M27 37h8", { ...stroke, stroke: p.white });
    case "swatches": return [circle(26, 34, 5, { fill: p.red }), circle(34, 31, 5, { fill: p.gold }), circle(40, 38, 5, { fill: p.green }), circle(30, 42, 5, { fill: p.blue })].join("");
    case "sound": return path("M22 35h7l8-7v20l-8-7h-7zM40 34c4 3 4 7 0 10M43 30c8 6 8 13 0 19", { fill: p.blue, stroke: p.ink, "stroke-width": p.sw, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "scraps": return rect(22, 29, 20, 16, { fill: p.white, stroke: p.ink, "stroke-width": p.sw }) + path("M25 41l5-6 4 4 3-3 3 5z", { fill: p.green }) + circle(37, 33, 2, { fill: p.gold });
    case "gear": return circle(32, 37, 9, { fill: p.white, stroke: p.blue, "stroke-width": p.sw + 1, "stroke-dasharray": detail === "small" ? undefined : "2 2" }) + circle(32, 37, 3, { fill: p.blue });
    case "help": return path("M27 30c1-6 11-6 12 0 0 5-6 5-6 9M33 44v1", { ...stroke, stroke: p.blue, "stroke-width": p.sw + 1 });
    case "import": return path("M32 25v16M26 35l6 6 6-6M22 45h20", { ...stroke, stroke: p.blue, "stroke-width": p.sw + 1 });
    case "sliders": return path("M23 29h18M23 36h18M23 43h18", stroke) + circle(29, 29, 2.5, { fill: p.blue }) + circle(36, 36, 2.5, { fill: p.blue }) + circle(27, 43, 2.5, { fill: p.blue });
    case "knobs": return circle(27, 34, 5, { fill: p.blue, stroke: p.ink, "stroke-width": p.sw }) + circle(39, 40, 5, { fill: p.gold, stroke: p.ink, "stroke-width": p.sw });
    case "chooser": return circle(24, 34, 4, { fill: p.blue }) + circle(40, 30, 4, { fill: p.green }) + circle(39, 44, 4, { fill: p.gold }) + path("M28 34l8-3M28 36l8 6", stroke);
    case "dictionary": return path("M21 29q6-3 11 1v18q-5-4-11-1zM43 29q-6-3-11 1v18q5-4 11-1z", { fill: p.white, stroke: p.gold, "stroke-width": p.sw }) + path("M26 40l3-8 3 8M27 37h4M35 33h4l-4 8h4", { ...stroke, stroke: p.ink });
    case "play": return path("M27 29l14 8-14 8z", { fill: p.blue, stroke: p.ink, "stroke-width": p.sw });
    case "chat": return path("M21 30h16v10H27l-5 4 2-4h-3zM32 38h12v8h-4l3 3-6-3h-5", { fill: p.white, stroke: p.blue, "stroke-width": p.sw });
    case "status": return path("M22 43l5-8 4 4 5-12 6 16", { fill: "none", stroke: p.green, "stroke-width": p.sw + 1.3, "stroke-linejoin": "round" });
    case "context": return rect(22, 28, 20, 18, { fill: p.white, stroke: p.gold, "stroke-width": p.sw }) + path("M25 32h14M25 37h9M25 42h12", stroke);
    case "rebuild": return path("M24 35a10 10 0 1 1 3 9M22 35l3-6 5 4", { fill: "none", stroke: p.blue, "stroke-width": p.sw + 1.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "forms": return rect(23, 27, 17, 21, { fill: p.white, stroke: p.ink, "stroke-width": p.sw }) + path("M26 32h11M26 37h8M26 42h10", stroke) + path("M35 43l9-9", { stroke: p.red, "stroke-width": p.sw + 2 });
    case "terminal": return rect(21, 27, 23, 18, { rx: 2, fill: "#14252b", stroke: p.ink, "stroke-width": p.sw }) + path("M25 32l4 3-4 3M31 39h7", { fill: "none", stroke: "#72d98b", "stroke-width": p.sw, "stroke-linecap": "round" });
    case "documents": return path("M23 27h14v18H23zM28 31h14v18H28z", { fill: p.white, stroke: p.blue, "stroke-width": p.sw });
    case "alias": return path("M22 43l17-17M31 26h8v8", { fill: "none", stroke: p.blue, "stroke-width": p.sw + 1.2, "stroke-linecap": "square" });
    case "deskAccessory": return rect(23, 29, 18, 17, { fill: p.white, stroke: p.blue, "stroke-width": p.sw }) + path("M27 26h10v5H27zM27 34h10M27 38h7M27 42h9", stroke);
    case "bell": return path("M23 43h18c-3-3-3-7-3-11 0-8-12-8-12 0 0 4 0 8-3 11z", { fill: p.gold, stroke: p.ink, "stroke-width": p.sw }) + circle(32, 47, 2, { fill: p.ink });
    default: return path("M24 32h16v14H24z", { fill: p.white, stroke: p.ink, "stroke-width": p.sw });
  }
}

function platinumReferenceBody(spec, size) {
  const small = size === 16;
  const outline = { stroke: "#111111", "stroke-width": 1, "stroke-linejoin": "miter" };
  const ink = { fill: "#25252d" };
  switch (spec.id) {
    case "startupDisk":
      return small
        ? path("M2 2h10v1h2v11H2z", { fill: "#dedee2", ...outline })
          + path("M3 3h8", { stroke: "#ffffff", "stroke-width": 1 })
          + rect(4, 5, 7, 5, { fill: "#7090d4", ...outline })
          + rect(4, 11, 8, 1, ink)
        : path("M3 3h23v2h3v23H3z", { fill: "#dedee2", ...outline })
          + path("M4 4h21M4 6v20", { fill: "none", stroke: "#ffffff", "stroke-width": 1 })
          + rect(8, 9, 15, 11, { fill: "#7090d4", ...outline })
          + rect(9, 18, 13, 2, ink)
          + rect(8, 21, 17, 2, ink)
          + rect(8, 24, 11, 1, ink);
    case "hardDisk":
      return small
        ? path("M2 5h12v8H2z", { fill: "#c7c9cf", ...outline })
          + path("M3 5l2-2h7l2 2M4 10h8M5 12h6", { fill: "none", stroke: "#52545c", "stroke-width": 1 })
        : path("M4 10h24v15H4z", { fill: "#c7c9cf", ...outline })
          + path("M4 10l4-5h16l4 5", { fill: "#e7e8eb", ...outline })
          + path("M6 11h20M8 20h16M10 23h12", { fill: "none", stroke: "#555862", "stroke-width": 1 })
          + rect(23, 13, 2, 2, { fill: "#4f78a8" });
    case "folder":
      return small
        ? rect(2, 5, 12, 10, { fill: "#ccccff", ...outline })
          + rect(2, 3, 7, 2, { fill: "#acacf0", ...outline })
          + path("M5 8h9v7H3z", { fill: "#bebef6", ...outline })
        : rect(4, 10, 24, 19, { fill: "#ccccff", ...outline })
          + rect(4, 5, 14, 5, { fill: "#acacf0", ...outline })
          + path("M10 16h18v13H6z", { fill: "#bebef6", ...outline })
          + path("M7 17h19", { stroke: "#eeeeff", "stroke-width": 1 });
    case "document":
      return small
        ? path("M3 2h8l4 4v8H3z", { fill: "#ffffff", ...outline })
          + path("M11 2l4 4h-4z", { fill: "#d2d5e0", ...outline })
          + path("M5 7h7v1H5zM5 9h5v1H5zM5 11h7v1H5z", { fill: "#5f6f96" })
        : path("M5 4h17l7 7v16H5z", { fill: "#ffffff", ...outline })
          + path("M22 4l7 7h-7z", { fill: "#d2d5e0", ...outline })
          + path("M8 9h11v1H8zM8 12h16v1H8zM8 15h13v1H8zM8 18h17v1H8zM8 21h9v1H8z", { fill: "#5f6f96" });
    case "applications":
      return small
        ? rect(2, 5, 12, 10, { fill: "#d6d8e2", ...outline })
          + rect(2, 3, 7, 2, { fill: "#9c9cce", ...outline })
          + path("M5 8h9v7H3z", { fill: "#c8cad6", ...outline })
          + path("M4 9h3v3H4zM9 9h3v3H9zM4 13h3v2H4zM9 13h3v2H9z", { fill: "#ffffff" })
        : rect(4, 10, 24, 19, { fill: "#d6d8e2", ...outline })
          + rect(4, 5, 14, 5, { fill: "#9c9cce", ...outline })
          + path("M10 16h18v13H6z", { fill: "#c8cad6", ...outline })
          + path("M8 18h7v6H8zM19 18h7v6h-7zM8 26h7v3H8zM19 26h7v3h-7z", { fill: "#ffffff" })
          + path("M8 19h7M19 19h7M8 27h7M19 27h7", { stroke: "#737596", "stroke-width": 1 });
    case "trash":
    case "trashFull": {
      const contents = spec.id === "trashFull"
        ? small
          ? path("M4 7l2-2 2 2 2-3 2 3", { fill: "none", stroke: "#8d6129", "stroke-width": 1 })
          : path("M7 13l4-5 4 4 4-7 5 8v8H7z", { fill: "#b98b45", stroke: "#5d4428", "stroke-width": 1 })
        : "";
      return contents + (small
        ? path("M3 7h10l-2 8H5z", { fill: "#e6e8f0", ...outline })
          + rect(3, 5, 10, 2, { fill: "#dcdce2", ...outline })
          + path("M5 7v7M8 7v7M11 7v7M5 5C5 1 11 1 11 5", { fill: "none", stroke: "#8b8d98", "stroke-width": 1 })
        : path("M5 12h22l-4 16H9z", { fill: "#e6e8f0", ...outline })
          + rect(4, 9, 24, 4, { fill: "#dcdce2", ...outline })
          + path("M8 13h1v14H8zM12 13h1v14h-1zM16 13h1v14h-1zM20 13h1v14h-1zM24 13h1v14h-1z", { fill: "#9a9aa8" })
          + path("M9 9C9 2 23 2 23 9M10 9C10 3 22 3 22 9", { fill: "none", stroke: "#50515a", "stroke-width": 1 }));
    }
    case "finderApp":
      return small
        ? path("M3 3h5v6L3 15z", { fill: "#2a2a36", ...outline })
          + path("M8 3h5v12H3v-6h5z", { fill: "#5f8fd8", ...outline })
          + rect(5, 6, 4, 4, { fill: "#ffffff" })
          + path("M6 7h1v1H6zM8 7h1v1H8zM6 9c1 1 2 1 3 0", { fill: "#1c1c24", stroke: "#1c1c24", "stroke-width": 1 })
        : path("M5 5h12L5 17z", { fill: "#2a2a36", ...outline })
          + path("M17 5h10v22H5V17h12z", { fill: "#5f8fd8", ...outline })
          + rect(9, 11, 10, 11, { fill: "#ffffff" })
          + path("M11 14h2v2h-2zM15 14h2v2h-2zM12 18c2 2 3 2 5 0", { fill: "#1c1c24", stroke: "#1c1c24", "stroke-width": 1 });
    case "fileFloppy":
      return small
        ? rect(2, 2, 12, 12, { fill: "#c8cad8", ...outline })
          + rect(4, 2, 8, 5, { fill: "#e0e2ea", ...outline })
          + rect(4, 9, 8, 5, { fill: "#ffffff", ...outline })
        : rect(4, 5, 24, 22, { fill: "#c8cad8", ...outline })
          + rect(5, 5, 22, 9, { fill: "#e0e2ea", ...outline })
          + rect(6, 10, 20, 2, ink)
          + path("M8 6l4 3M12 6l4 3M16 6l4 3M20 6l4 3", { stroke: "#8f929e", "stroke-width": 1 })
          + rect(8, 19, 16, 7, { fill: "#ffffff", ...outline })
          + path("M9 20h13v1H9zM9 22h9v1H9zM9 24h11v1H9z", { fill: "#336699" });
    case "projectDisc":
      return small
        ? circle(8, 8, 6, { fill: "#cfe6ee", ...outline })
          + path("M4 4l8 8M5 12l7-7", { stroke: "#9d8fc5", "stroke-width": 1 })
          + circle(8, 8, 1, { fill: "#ffffff", ...outline })
        : circle(16, 16, 12, { fill: "#cfe6ee", ...outline })
          + path("M8 7l17 18M7 23L24 7", { stroke: "#9d8fc5", "stroke-width": 2 })
          + path("M5 15h22", { stroke: "#83b9ce", "stroke-width": 1 })
          + circle(16, 16, 3, { fill: "#ffffff", ...outline });
    default:
      return null;
  }
}

function platinumBody(spec, size) {
  const referenceBody = platinumReferenceBody(spec, size);
  if (referenceBody) return referenceBody;
  const small = size === 16;
  const S = size / 32;
  const q = (value) => Math.round(value * S);
  const ink = "#111111";
  const hi = "#ffffff";
  const mid = spec.tone === "gold" ? "#ccaa66" : spec.tone === "red" ? "#cc7777" : spec.tone === "green" ? "#77aa77" : spec.tone === "violet" ? "#aaaadd" : "#aabbd0";
  const shade = spec.tone === "gold" ? "#886633" : spec.tone === "red" ? "#884444" : spec.tone === "green" ? "#446644" : spec.tone === "violet" ? "#666699" : "#667788";
  const pxRect = (x, y, w, h, fill, stroke = ink) => rect(q(x), q(y), Math.max(1, q(w)), Math.max(1, q(h)), { fill, stroke, "stroke-width": 1 });
  let body = "";
  switch (spec.body) {
    case "drive": body = pxRect(4, 5, 24, 22, "#dddddd") + pxRect(6, 7, 20, 5, "#f4f4f4") + pxRect(7, 14, 18, 9, mid) + pxRect(9, 24, 14, 2, shade); break;
    case "folder": body = pxRect(3, 8, 26, 19, "#ccccff") + pxRect(4, 5, 13, 5, "#aaaadd") + path(`M${q(4)} ${q(14)}h${q(24)}v${q(13)}H${q(6)}z`, { fill: mid, stroke: ink, "stroke-width": 1 }); break;
    case "paper": body = path(`M${q(6)} ${q(3)}h${q(14)}l${q(6)} ${q(6)}v${q(20)}H${q(6)}z`, { fill: hi, stroke: ink, "stroke-width": 1 }) + path(`M${q(20)} ${q(3)}v${q(6)}h${q(6)}`, { fill: "#cccccc", stroke: ink, "stroke-width": 1 }); break;
    case "paperStack": body = pxRect(9, 5, 18, 23, "#bbbbbb") + pxRect(6, 3, 18, 23, hi); break;
    case "manuscript": body = pxRect(5, 6, 22, 22, "#eeeeee") + pxRect(7, 4, 19, 22, hi) + pxRect(6, 23, 21, 4, "#999999"); break;
    case "trash": body = path(`M${q(7)} ${q(10)}h${q(19)}l-${q(3)} ${q(18)}H${q(10)}z`, { fill: "#dddddd", stroke: ink, "stroke-width": 1 }) + pxRect(5, 8, 23, 4, "#eeeeee") + (small ? "" : path(`M${q(11)} ${q(12)}v${q(14)}M${q(16)} ${q(12)}v${q(15)}M${q(21)} ${q(12)}v${q(14)}`, { stroke: "#777777", "stroke-width": 1 })); break;
    case "finder": body = pxRect(5, 4, 22, 24, "#9999cc") + path(`M${q(5)} ${q(4)}h${q(12)}l-${q(12)} ${q(12)}z`, { fill: "#333344" }) + pxRect(9, 8, 10, 14, hi); break;
    case "floppy": body = pxRect(4, 4, 24, 24, "#aab3c0") + pxRect(7, 4, 18, 9, "#eeeeee") + pxRect(8, 18, 16, 9, hi); break;
    case "disc": body = circle(q(16), q(16), q(12), { fill: "#cceeff", stroke: ink, "stroke-width": 1 }) + circle(q(16), q(16), Math.max(1, q(3)), { fill: hi, stroke: ink, "stroke-width": 1 }); break;
    case "typewriter": body = pxRect(5, 13, 22, 13, "#999999") + pxRect(8, 5, 16, 11, hi) + pxRect(3, 23, 26, 5, "#666666"); break;
    case "server": body = pxRect(7, 5, 19, 23, "#aaaaaa") + pxRect(9, 8, 15, 5, "#eeeeee") + pxRect(9, 15, 15, 5, mid) + pxRect(9, 22, 15, 4, "#777777"); break;
    case "cards": body = pxRect(8, 8, 19, 19, "#cccccc") + pxRect(5, 5, 19, 20, hi); break;
    case "correspondence": body = pxRect(4, 7, 24, 18, mid) + path(`M${q(4)} ${q(7)}l${q(12)} ${q(10)}L${q(28)} ${q(7)}`, { fill: "none", stroke: ink, "stroke-width": 1 }); break;
    case "review": body = pxRect(5, 6, 18, 22, hi) + path(`M${q(19)} ${q(20)}l${q(8)} ${q(8)}`, { stroke: ink, "stroke-width": small ? 2 : 3 }) + circle(q(18), q(18), q(6), { fill: "#cceeff", stroke: ink, "stroke-width": 1 }); break;
    case "search": body = pxRect(4, 8, 17, 18, "#eeeeee") + circle(q(18), q(15), q(8), { fill: "#cceeff", stroke: ink, "stroke-width": 1 }) + path(`M${q(23)} ${q(21)}l${q(6)} ${q(7)}`, { stroke: ink, "stroke-width": small ? 2 : 3 }); break;
    case "book": case "dictionary": body = path(`M${q(3)} ${q(8)}q${q(6)}-${q(3)} ${q(13)} ${q(1)}v${q(19)}q-${q(7)}-${q(4)}-${q(13)}-${q(1)}zM${q(29)} ${q(8)}q-${q(6)}-${q(3)}-${q(13)} ${q(1)}v${q(19)}q${q(7)}-${q(4)} ${q(13)}-${q(1)}z`, { fill: hi, stroke: ink, "stroke-width": 1 }); break;
    case "clock": body = pxRect(3, 5, 26, 22, hi)
      + path(`M${q(3)} ${q(11)}h${q(26)}`, { stroke: ink, "stroke-width": 1 })
      + pxRect(5, 7, 8, 2, ink) + pxRect(20, 7, 7, 2, "#777777")
      + path(`M${q(16)} ${q(14)}v${q(5)}h${q(4)}`, { stroke: ink, "stroke-width": 1 })
      + circle(q(16), q(19), q(6), { fill: "none", stroke: ink, "stroke-width": 1 }); break;
    case "map": body = pxRect(3, 5, 15, 23, "#ffffff")
      + pxRect(6, 9, 9, 2, "#777777") + pxRect(6, 14, 7, 2, "#aaaaaa")
      + path(`M${q(18)} ${q(16)}h${q(4)}M${q(22)} ${q(9)}v${q(14)}M${q(22)} ${q(9)}h${q(3)}M${q(22)} ${q(23)}h${q(3)}`, { stroke: ink, "stroke-width": 1 })
      + pxRect(24, 7, 5, 4, hi) + pxRect(24, 14, 5, 4, hi) + pxRect(24, 21, 5, 4, hi); break;
    case "stage": body = pxRect(4, 7, 24, 19, "#777799") + pxRect(7, 10, 18, 12, "#ffffff") + pxRect(3, 25, 26, 3, "#444455"); break;
    case "easel": body = pxRect(3, 4, 26, 24, hi)
      + path(`M${q(3)} ${q(11)}h${q(26)}M${q(11)} ${q(4)}v${q(24)}M${q(20)} ${q(4)}v${q(24)}M${q(3)} ${q(18)}h${q(26)}`, { stroke: ink, "stroke-width": 1 })
      + pxRect(5, 21, 4, 5, ink) + pxRect(13, 19, 4, 7, ink) + pxRect(22, 22, 4, 4, ink); break;
    case "cover": body = pxRect(7, 4, 19, 24, "#99bbdd") + pxRect(10, 7, 13, 17, "#ddeeff"); break;
    case "swatches": body = circle(q(16), q(16), q(12), { fill: "#dddddd", stroke: ink, "stroke-width": 1 }); break;
    case "speaker": body = pxRect(6, 5, 20, 23, "#777799") + circle(q(16), q(17), q(7), { fill: "#333344", stroke: ink, "stroke-width": 1 }) + circle(q(16), q(17), q(2), { fill: mid }); break;
    case "album": body = pxRect(5, 4, 22, 25, "#aa8855") + pxRect(8, 7, 16, 17, hi); break;
    case "inbox": body = path(`M${q(4)} ${q(18)}h${q(7)}l${q(3)} ${q(4)}h${q(5)}l${q(3)}-${q(4)}h${q(6)}v${q(10)}H${q(4)}z`, { fill: "#aaaacc", stroke: ink, "stroke-width": 1 }) + pxRect(8, 5, 16, 15, hi); break;
    case "controlBoard": body = pxRect(4, 5, 24, 23, "#cccccc") + pxRect(7, 8, 18, 17, "#eeeeee"); break;
    case "network": body = pxRect(4, 6, 10, 9, "#dddddd") + pxRect(18, 6, 10, 9, "#dddddd") + pxRect(11, 20, 10, 8, "#dddddd") + path(`M${q(9)} ${q(15)}l${q(7)} ${q(5)} ${q(7)}-${q(5)}`, { fill: "none", stroke: ink, "stroke-width": 1 }); break;
    case "paperPen": body = pxRect(5, 4, 20, 24, hi) + path(`M${q(19)} ${q(25)}l${q(9)}-${q(15)}`, { stroke: "#335588", "stroke-width": small ? 2 : 3 }); break;
    case "monitor": body = pxRect(4, 5, 24, 19, "#777777") + pxRect(7, 8, 18, 12, "#eef5ee") + pxRect(12, 24, 8, 4, "#777777"); break;
    case "indexBox": body = pxRect(3, 4, 26, 24, hi)
      + path(`M${q(3)} ${q(11)}h${q(26)}`, { stroke: ink, "stroke-width": 1 })
      + pxRect(6, 14, 3, 3, ink) + pxRect(11, 15, 13, 2, "#777777")
      + pxRect(6, 19, 3, 3, ink) + pxRect(11, 20, 10, 2, "#777777")
      + path(`M${q(6)} ${q(25)}h${q(16)}`, { stroke: ink, "stroke-width": 1 }); break;
    case "press": body = pxRect(5, 10, 22, 17, "#888888") + pxRect(9, 4, 14, 12, hi) + pxRect(3, 24, 26, 4, "#555555"); break;
    case "stamp": body = pxRect(6, 17, 20, 10, "#994444") + pxRect(10, 5, 12, 13, "#ccaa77"); break;
    case "terminal": body = pxRect(4, 5, 24, 19, "#333333") + pxRect(7, 8, 18, 12, "#112211") + pxRect(11, 24, 10, 4, "#777777"); break;
    case "finderPair": body = pxRect(3, 7, 18, 20, "#7777aa") + pxRect(11, 4, 18, 20, "#aaaadd"); break;
    case "briefcase": body = pxRect(4, 10, 24, 17, "#777799") + path(`M${q(11)} ${q(10)}V${q(6)}h${q(10)}v${q(4)}`, { fill: "none", stroke: ink, "stroke-width": 1 }); break;
    case "bell": body = path(`M${q(7)} ${q(24)}h${q(18)}c-${q(3)}-${q(4)}-${q(3)}-${q(8)}-${q(3)}-${q(12)} 0-${q(8)}-${q(12)}-${q(8)}-${q(12)} 0 0 ${q(8)} 0 ${q(12)}-${q(3)} ${q(12)}z`, { fill: "#ccaa55", stroke: ink, "stroke-width": 1 }); break;
    case "chip": body = pxRect(9, 9, 14, 14, "#cccccc") + pxRect(13, 13, 6, 6, "#eeeeee") + path(`M${q(12)} ${q(5)}v${q(4)}M${q(16)} ${q(5)}v${q(4)}M${q(20)} ${q(5)}v${q(4)}M${q(12)} ${q(23)}v${q(4)}M${q(16)} ${q(23)}v${q(4)}M${q(20)} ${q(23)}v${q(4)}M${q(5)} ${q(12)}h${q(4)}M${q(5)} ${q(16)}h${q(4)}M${q(5)} ${q(20)}h${q(4)}M${q(23)} ${q(12)}h${q(4)}M${q(23)} ${q(16)}h${q(4)}M${q(23)} ${q(20)}h${q(4)}`, { fill: "none", stroke: "#777777", "stroke-width": 1 }); break;
    case "strip": body = path(`M${q(3)} ${q(11)}h${q(20)}q${q(6)} 0 ${q(6)} ${q(5)}q0 ${q(5)}-${q(6)} ${q(5)}H${q(3)}z`, { fill: "#dddddd", stroke: ink, "stroke-width": 1 }) + path(`M${q(9)} ${q(11)}v${q(10)}M${q(14)} ${q(11)}v${q(10)}M${q(19)} ${q(11)}v${q(10)}`, { fill: "none", stroke: "#777777", "stroke-width": 1 }) + path(`M${q(25)} ${q(13)}v${q(6)}`, { fill: "none", stroke: "#777777", "stroke-width": 1 }); break;
    default: body = pxRect(5, 5, 22, 22, mid);
  }
  const badge = group(symbolMark(spec, "platinum", small ? "small" : "regular"), { transform: `scale(${size / 64})` });
  return body + badge;
}

function aquaBody(spec, detail) {
  const theme = "aqua";
  const aqua = true;
  const snow = false;
  const yosemite = false;
  const edge = aqua ? "#173d67" : snow ? "#3d4954" : "#7d9bb7";
  const sw = detail === "small" ? 2.4 : yosemite ? 1.4 : 1.7;
  const shadow = yosemite ? "" : ellipse(32, 53, spec.genre === "document" ? 13 : 18, aqua ? 3.2 : 2.7, { fill: snow ? "#000000" : "#24435f", "fill-opacity": snow ? 0.22 : 0.18 });
  const fill = spec.body === "paper" || spec.body === "paperStack" || spec.body === "manuscript" || spec.body === "paperPen" ? "url(#paper)" : spec.body === "drive" || spec.body === "floppy" || spec.body === "typewriter" || spec.body === "controlBoard" || spec.body === "monitor" || spec.body === "press" ? "url(#metal)" : "url(#body)";
  let body = "";
  const texture = detail === "master" ? path("M17 18h30M16 21h32M17 24h30M16 27h32", { stroke: "#ffffff", "stroke-opacity": 0.16, "stroke-width": 0.7 }) : "";
  switch (spec.body) {
    case "drive":
      body = path(aqua ? "M14 15Q15 10 20 9h24q5 1 6 6l4 30q1 7-7 8H17q-8-1-7-8z" : snow ? "M13 18l5-8h28l6 8 3 29q0 6-7 7H16q-7-1-7-7z" : "M13 15h38l4 34H9z", { fill, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path(aqua ? "M17 18h30l2 8H15z" : "M18 13h28l4 8H14z", { fill: "#f8fafc", "fill-opacity": aqua ? 0.72 : 0.55, stroke: edge, "stroke-width": sw }) + path("M18 42h28M22 47h20", { stroke: "#65788a", "stroke-width": sw, "stroke-linecap": "round" }) + texture;
      break;
    case "folder":
      body = path(aqua ? "M7 21q0-6 6-6h15l5 5h22q4 0 3 5l-4 26q-1 5-6 5H12q-5 0-5-5z" : snow ? "M6 24q0-5 5-5h15l5 4h24q4 0 3 5l-5 25H9z" : "M6 22h20l5 5h27v27H6z", { fill, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path(aqua ? "M8 29h49l-4 22q-1 4-6 4H12q-4 0-4-4z" : snow ? "M8 31h48l-4 22H9z" : "M6 31h52v23H6z", { fill: aqua ? "#78bceb" : snow ? "#79a9cf" : "#78b6e8", "fill-opacity": aqua ? 0.94 : 1, stroke: edge, "stroke-width": sw });
      break;
    case "paper": case "paperPen":
      body = path(aqua ? "M16 7h24l12 12v36H16z" : snow ? "M14 8h27l11 11v36H14z" : "M15 7h27l10 10v39H15z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path(aqua ? "M40 7v12h12" : "M41 8v11h11", { fill: yosemite ? "#e2ecf5" : "#d7dde4", stroke: edge, "stroke-width": sw });
      break;
    case "paperStack":
      body = path("M18 10h30v41H18z", { fill: "#c0c8d1", stroke: edge, "stroke-width": sw }) + path("M12 6h31l9 9v39H12z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw }) + path("M43 6v9h9", { fill: "#dce3ea", stroke: edge, "stroke-width": sw });
      break;
    case "manuscript":
      body = path("M12 13h40v40H12z", { fill: snow ? "url(#leather)" : fill, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M18 8h28v41H18z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw });
      break;
    case "trash":
      body = path(aqua ? "M15 19h34l-4 35H19z" : snow ? "M13 20h38l-5 34H18z" : "M15 21h34l-3 34H18z", { fill: aqua ? "#9fd9f1" : snow ? "#d6d9db" : "#dce8f1", "fill-opacity": aqua ? 0.65 : 1, stroke: edge, "stroke-width": sw }) + path("M11 17h42v7H11zM22 17q1-8 10-8t10 8", { fill: snow ? "url(#metal)" : "#d9edf8", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + (detail === "small" ? "" : path("M20 26l2 24M28 25l1 26M36 25l-1 26M44 26l-2 24", { stroke: aqua ? "#4d90b8" : "#87929a", "stroke-width": 1.4, "stroke-opacity": 0.8 }));
      break;
    case "finder":
      body = path(aqua ? "M13 8h38q5 0 5 6v36q0 6-6 6H14q-6 0-6-6V14q0-6 5-6z" : snow ? "M12 9h40q4 0 4 5v37q0 5-5 5H13q-5 0-5-5V14q0-5 4-5z" : "M10 8h44v48H10z", { fill: aqua ? "url(#aquaGlass)" : fill, stroke: edge, "stroke-width": sw }) + path(aqua ? "M32 9v46M10 34h45" : snow ? "M33 10v45M9 34h46" : "M32 8v48", { stroke: snow ? "#7892aa" : "#2d73ad", "stroke-width": sw });
      break;
    case "floppy":
      body = path(aqua ? "M11 8h42v48H11z" : snow ? "M10 7h44v50H10z" : "M11 8h42v48H11z", { fill, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M17 8h30v19H17z", { fill: "#eef2f5", stroke: edge, "stroke-width": sw }) + path("M20 36h24v20H20z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw });
      break;
    case "disc":
      body = circle(32, 32, 24, { fill: aqua ? "url(#aquaGlass)" : snow ? "#dce8ef" : "#e8f1f8", stroke: edge, "stroke-width": sw }) + path("M15 19l34 26M18 47l30-30", { stroke: aqua ? "#e6b8ff" : "#a5cfe4", "stroke-width": detail === "small" ? 3 : 5, "stroke-opacity": 0.72 }) + circle(32, 32, 5, { fill: "#ffffff", stroke: edge, "stroke-width": sw });
      break;
    case "correspondence":
      body = path(aqua ? "M9 16h46v34H9z" : snow ? "M8 17h48v35H8z" : "M9 18h46v34H9z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw }) + path(aqua ? "M9 16l23 20 23-20" : "M8 17l24 21 24-21", { fill: "none", stroke: aqua ? "#6d9dc4" : "#8998a5", "stroke-width": sw + 0.5 });
      break;
    case "typewriter":
      body = path(aqua ? "M9 29h46l4 22q1 5-5 5H10q-5 0-4-5z" : "M8 30h48l3 23H5z", { fill, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M17 8h30v28H17z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw }) + (detail === "small" ? "" : path("M14 38h36M13 43h38M12 48h40", { stroke: "#576675", "stroke-width": 1.6, "stroke-dasharray": "2 2" }));
      break;
    case "server":
      body = path(aqua ? "M14 7h36q4 0 4 4v44H10V11q0-4 4-4z" : snow ? "M12 6h40q3 0 3 3v47H9V9q0-3 3-3z" : "M12 7h40v49H12z", { fill, stroke: edge, "stroke-width": sw }) + path("M14 14h36M14 27h36M14 40h36", { stroke: "#6e7f8f", "stroke-width": sw }) + circle(18, 20, 2, { fill: "#55aa65" }) + circle(18, 33, 2, { fill: "#d39b38" }) + circle(18, 46, 2, { fill: "#4f8fc7" });
      break;
    case "cards":
      body = path("M12 18h40v36H12z", { fill, stroke: edge, "stroke-width": sw }) + path("M17 10h31v34H17z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw }) + path("M22 6h25v31H22z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw });
      break;
    case "indexBox":
      // Memory Inspector: the run's context budget, with one dropped row.
      body = path("M8 8h48v48H8z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw })
        + path("M8 20h48", { stroke: edge, "stroke-width": sw })
        + path("M15 12h22v5H15z", { fill: aqua ? "#dbeaf6" : "#dfe4e9", stroke: edge, "stroke-width": 1 })
        + path("M16 28h6v6h-6zM16 40h6v6h-6z", { fill: aqua ? "#2f6ea9" : "#5a6570" })
        + path("M26 30h22M26 42h16", { stroke: "#b5c0c9", "stroke-width": 2.4, "stroke-linecap": "round" })
        + path("M24 49h24", { stroke: "#c0605f", "stroke-width": 2.2, "stroke-linecap": "round" });
      break;
    case "review": case "search":
      body = path("M10 8h33l9 9v37H10z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw }) + path("M43 8v9h9", { fill: "#d8e0e8", stroke: edge, "stroke-width": sw });
      break;
    case "book": case "dictionary":
      body = path("M5 15q13-7 27 2v39q-13-8-27-2zM59 15q-13-7-27 2v39q13-8 27-2z", { fill: spec.body === "dictionary" && snow ? "url(#leather)" : "url(#paper)", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" });
      break;
    case "clock":
      // A window on the archived web: the page, its date field, and the dial
      // that moves it back through captures.
      body = path("M6 9h52v46H6z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw })
        + path("M6 21h52", { stroke: edge, "stroke-width": sw })
        + path("M11 13h20v5H11z", { fill: "#dfe4e9", stroke: edge, "stroke-width": 1 })
        + circle(40, 38, 13, { fill: "none", stroke: "#8e9aa5", "stroke-width": 2.4 })
        + path("M40 30v9l7 4", { fill: "none", stroke: "#5a6570", "stroke-width": 2.6, "stroke-linecap": "round" })
        + path("M14 30h14M14 38h10M14 46h16", { stroke: "#b9c2ca", "stroke-width": 2, "stroke-linecap": "round" });
      break;
    case "map":
      // The document's own structure: a page whose headings branch into a map.
      body = path("M7 10h26v44H7z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw })
        + path("M13 20h14M13 28h10", { stroke: aqua ? "#8fa3b4" : "#9aa0a6", "stroke-width": 2.4, "stroke-linecap": "round" })
        + path("M33 32h9M42 18v28M42 18h6M42 32h6M42 46h6", { fill: "none", stroke: aqua ? "#3f7fb4" : "#5a6570", "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" })
        + circle(52, 18, 5, { fill: aqua ? "#9ad9f7" : "#c3ccd4", stroke: edge, "stroke-width": sw })
        + circle(53, 32, 6, { fill: aqua ? "#4aa3e0" : "#aeb8c1", stroke: edge, "stroke-width": sw })
        + circle(52, 46, 5, { fill: aqua ? "#9ad9f7" : "#c3ccd4", stroke: edge, "stroke-width": sw });
      break;
    case "stage":
      body = path("M8 13h48v34H8z", { fill, stroke: edge, "stroke-width": sw }) + path("M13 18h38v24H13z", { fill: "#f7f9fb", stroke: edge, "stroke-width": sw }) + path("M5 48h54v7H5z", { fill: snow ? "url(#metal)" : "#5e83ab", stroke: edge, "stroke-width": sw });
      break;
    case "easel":
      body = path("M6 8h52v48H6z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw })
        + path("M6 20h52M24 8v48M42 8v48M6 34h52", { fill: "none", stroke: edge, "stroke-width": 1.2 })
        + path("M11 50h7V38h-7zM29 50h7V30h-7zM47 50h7V42h-7z", { fill: aqua ? "#2f8fd0" : "#7f97ad", stroke: edge, "stroke-width": 1 });
      break;
    case "cover":
      body = path("M13 7h38v50H13z", { fill: aqua ? "url(#aquaGlass)" : snow ? "url(#lens)" : "url(#body)", stroke: edge, "stroke-width": sw }) + path("M18 12h28v40H18z", { fill: "#ffffff", "fill-opacity": aqua ? 0.28 : 0.55, stroke: "#ffffff", "stroke-opacity": 0.72, "stroke-width": sw });
      break;
    case "swatches":
      body = path("M12 51l5-39h30l5 39z", { fill: snow ? "url(#metal)" : "#f3f5f7", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" });
      break;
    case "speaker":
      body = path(aqua ? "M15 6h34q5 0 5 5v45H10V11q0-5 5-5z" : "M12 6h40v51H12z", { fill, stroke: edge, "stroke-width": sw }) + circle(32, 37, 14, { fill: "#293748", stroke: edge, "stroke-width": sw }) + circle(32, 37, 6, { fill: "#6d7b8a", stroke: "#17222d", "stroke-width": sw }) + circle(32, 17, 4, { fill: "#d7e2ec", stroke: edge, "stroke-width": sw });
      break;
    case "album":
      body = path("M10 7h44v50H10z", { fill: snow ? "url(#leather)" : fill, stroke: edge, "stroke-width": sw }) + path("M16 13h32v35H16z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw });
      break;
    case "inbox":
      body = path("M6 35h15l5 7h12l5-7h15v20H6z", { fill, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M13 8h38v35H13z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw });
      break;
    case "controlBoard":
      body = path(aqua ? "M9 10q0-4 4-4h38q4 0 4 4v45H9z" : "M8 7h48v50H8z", { fill, stroke: edge, "stroke-width": sw }) + path("M14 14h36v35H14z", { fill: yosemite ? "#edf2f6" : "#d7dde2", stroke: edge, "stroke-width": sw });
      break;
    case "network":
      body = path("M7 10h20v17H7zM37 10h20v17H37zM22 38h20v17H22zM17 27l15 11 15-11", { fill, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" });
      break;
    case "monitor":
      body = path(aqua ? "M8 7h48v36q0 5-5 5H13q-5 0-5-5z" : "M7 8h50v39H7z", { fill: "url(#metal)", stroke: edge, "stroke-width": sw }) + path("M13 13h38v27H13z", { fill: "#eef4ef", stroke: edge, "stroke-width": sw }) + path("M27 47h10v7h8v4H19v-4h8z", { fill: "url(#metal)", stroke: edge, "stroke-width": sw });
      break;
    case "press":
      body = path("M8 26h48v29H8z", { fill: "url(#metal)", stroke: edge, "stroke-width": sw }) + path("M16 7h32v30H16z", { fill: "url(#paper)", stroke: edge, "stroke-width": sw }) + path("M13 44h38", { stroke: edge, "stroke-width": sw + 1.5 });
      break;
    case "stamp":
      body = path("M15 39h34l8 14H7z", { fill: snow ? "#923f39" : "#d45e55", stroke: edge, "stroke-width": sw }) + path("M21 9h22v31H21z", { fill: snow ? "url(#leather)" : "#d7a66d", stroke: edge, "stroke-width": sw }) + path("M25 7h14", { stroke: edge, "stroke-width": sw + 3, "stroke-linecap": "round" });
      break;
    case "terminal":
      body = path("M7 8h50v40H7z", { fill: "url(#metal)", stroke: edge, "stroke-width": sw }) + path("M12 13h40v29H12z", { fill: "#132328", stroke: "#243943", "stroke-width": sw }) + path("M25 48h14v7h8v3H17v-3h8z", { fill: "url(#metal)", stroke: edge, "stroke-width": sw });
      break;
    case "finderPair":
      body = path("M6 16h36v40H6z", { fill, stroke: edge, "stroke-width": sw }) + path("M22 7h36v40H22z", { fill: aqua ? "url(#aquaGlass)" : "url(#body)", stroke: edge, "stroke-width": sw }) + path("M40 8v38", { stroke: "#477ba5", "stroke-width": sw });
      break;
    case "briefcase":
      body = path("M7 20h50v35H7z", { fill: snow ? "url(#leather)" : fill, stroke: edge, "stroke-width": sw }) + path("M21 20v-8h22v8M7 34h50", { fill: "none", stroke: edge, "stroke-width": sw + 1.2 }) + rect(28, 31, 8, 8, { rx: 1, fill: "url(#metal)", stroke: edge, "stroke-width": sw });
      break;
    case "bell":
      body = path("M12 48h40c-6-7-7-14-7-23 0-17-26-17-26 0 0 9-1 16-7 23z", { fill: aqua ? "#e6bd55" : snow ? "#c99c43" : "#f0b943", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + ellipse(32, 51, 23, 5, { fill: "#9d6b29", stroke: edge, "stroke-width": sw }) + circle(32, 56, 3.5, { fill: "#6b4726" });
      break;
    case "chip":
      body = path("M20 20h24v24H20z", { fill: "url(#metal)", stroke: edge, "stroke-width": sw })
        + path("M27 27h10v10H27z", { fill: "#d7dde2", stroke: edge, "stroke-width": sw })
        + path("M26 12v8M32 12v8M38 12v8M26 44v8M32 44v8M38 44v8M12 26h8M12 32h8M12 38h8M44 26h8M44 32h8M44 38h8", { fill: "none", stroke: edge, "stroke-width": sw + 0.8, "stroke-linecap": "round" });
      break;
    case "strip":
      body = path("M6 22h40q12 0 12 10q0 10-12 10H6z", { fill: "url(#metal)", stroke: edge, "stroke-width": sw })
        + path("M46 22q12 0 12 10q0 10-12 10z", { fill: "url(#aquaGlass)", stroke: edge, "stroke-width": sw })
        + path("M20 22v20M30 22v20M40 22v20", { fill: "none", stroke: "#7d8994", "stroke-width": sw });
      break;
    default:
      body = path("M10 8h44v48H10z", { fill, stroke: edge, "stroke-width": sw });
  }
  const largeFinish = detail === "large"
    ? path("M20 18l24 0M18 21h28M20 24h24", { stroke: "#ffffff", "stroke-width": 0.45, "stroke-opacity": 0.24 })
    : "";
  const mark = symbolMark(spec, theme, detail);
  return shadow + body + largeFinish + mark;
}

function snowLeopardBody(spec, detail) {
  const edge = "#36434d";
  const sw = detail === "small" ? 2.45 : 1.65;
  const shadow = ellipse(33, 54, spec.genre === "document" ? 14 : 19, 2.7, { fill: "#000000", "fill-opacity": 0.24 });
  const paper = "url(#paper)";
  const metal = "url(#metal)";
  const bodyFill = ["paper", "paperStack", "paperPen"].includes(spec.body) ? paper : ["drive", "floppy", "typewriter", "server", "controlBoard", "monitor", "press"].includes(spec.body) ? metal : "url(#body)";
  const rule = { fill: "none", stroke: edge, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const fine = detail === "small" ? "" : path("M18 17h29M17 20h31M18 23h29M17 26h31", { stroke: "#ffffff", "stroke-opacity": 0.18, "stroke-width": 0.65 });
  let body = "";
  switch (spec.body) {
    case "drive":
      body = path("M12 21l7-12h27l7 12 3 26q1 7-8 8H16q-9-1-8-8z", { fill: metal, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M19 9h27l7 12H12z", { fill: "#e9edf0", stroke: edge, "stroke-width": sw }) + path("M19 16h27M17 43h32M22 49h22", rule) + fine;
      break;
    case "folder":
      body = path("M6 25v-7q0-5 5-5h15l6 5h22q5 0 4 6l-5 29H9z", { fill: "#6da5cf", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M8 29h48l-4 24H9z", { fill: "#77acd3", stroke: edge, "stroke-width": sw }) + path("M12 33h40", { stroke: "#bcd6e8", "stroke-width": 1.2, "stroke-opacity": 0.7 });
      break;
    case "paper": case "paperPen":
      body = path("M13 9h28l11 11v36H13z", { fill: paper, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M41 9v11h11", { fill: "#d2d8de", stroke: edge, "stroke-width": sw }) + path("M16 53h34", { stroke: "#8c959c", "stroke-width": 1, "stroke-opacity": 0.55 });
      break;
    case "paperStack":
      body = path("M20 12h31v39H20z", { fill: "#aeb7bf", stroke: edge, "stroke-width": sw }) + path("M16 9h31v43H16z", { fill: "#d8dce0", stroke: edge, "stroke-width": sw }) + path("M11 6h30l10 10v40H11z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M41 6v10h10", { fill: "#cbd1d6", stroke: edge, "stroke-width": sw });
      break;
    case "manuscript":
      body = path("M10 13h42v42H10z", { fill: "url(#leather)", stroke: edge, "stroke-width": sw }) + path("M17 7h30v43H17z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M20 12h24M20 17h20", { stroke: "#9b744f", "stroke-width": 1.2 });
      break;
    case "trash":
      body = path("M12 21h40l-6 34H18z", { fill: "#d4d7d8", stroke: edge, "stroke-width": sw }) + path("M9 17h46v7H9z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M21 17q1-9 11-9t11 9", rule) + (detail === "small" ? "" : path("M19 26l3 25M27 25l1 27M36 25l-1 27M45 26l-3 25", { stroke: "#707980", "stroke-width": 1.25 }));
      break;
    case "finder":
      body = path("M11 9h42q4 0 4 5v38q0 5-5 5H12q-5 0-5-5V14q0-5 4-5z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M34 10v46M8 34h48", { stroke: "#557d9c", "stroke-width": sw }) + path("M11 12h20v19H9V15q0-3 2-3z", { fill: "#a8c8df", "fill-opacity": 0.72 });
      break;
    case "floppy":
      body = path("M9 7h46v51H9z", { fill: "#8896a4", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M16 7h32v20H16z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M20 36h25v22H20z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M22 41h21M22 46h16", { stroke: "#718397", "stroke-width": 1.2 });
      break;
    case "disc":
      body = circle(32, 32, 25, { fill: "#dce7ec", stroke: edge, "stroke-width": sw }) + path("M13 20l38 27M18 52l31-37", { stroke: "#94c8df", "stroke-width": detail === "small" ? 3 : 5, "stroke-opacity": 0.68 }) + path("M18 12l29 40", { stroke: "#d0a9da", "stroke-width": detail === "small" ? 2 : 3, "stroke-opacity": 0.56 }) + circle(32, 32, 5, { fill: "#ffffff", stroke: edge, "stroke-width": sw });
      break;
    case "correspondence":
      body = path("M7 18h50v35H7z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M7 18l25 22 25-22M7 53l18-18M57 53L39 35", rule) + path("M11 22h42", { stroke: "#ffffff", "stroke-width": 1.5 });
      break;
    case "typewriter":
      body = path("M7 31h50l3 23H4z", { fill: metal, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M16 7h32v30H16z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M12 39h40M11 45h42M9 51h46", { stroke: "#48545f", "stroke-width": 1.45, "stroke-dasharray": detail === "small" ? undefined : "2 2" });
      break;
    case "server":
      body = path("M10 6h44q3 0 3 3v48H7V9q0-3 3-3z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M12 15h40M12 29h40M12 43h40", { stroke: "#5e6c79", "stroke-width": sw }) + path("M16 19h28M16 33h28M16 47h28", { stroke: "#e6ecef", "stroke-width": 1.1 }) + circle(48, 22, 2, { fill: "#58a761" }) + circle(48, 36, 2, { fill: "#d09a3b" }) + circle(48, 50, 2, { fill: "#4e85b2" });
      break;
    case "cards":
      body = path("M9 21h45v34H9z", { fill: "url(#leather)", stroke: edge, "stroke-width": sw }) + path("M14 12h36v34H14z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M20 7h30v32H20z", { fill: paper, stroke: edge, "stroke-width": sw });
      break;
    case "indexBox":
      body = path("M8 8h48v48H8z", { fill: paper, stroke: edge, "stroke-width": sw })
        + path("M8 20h48", { stroke: edge, "stroke-width": sw })
        + path("M15 12h22v5H15z", { fill: "#dfe4e9", stroke: edge, "stroke-width": 1 })
        + path("M16 28h6v6h-6zM16 40h6v6h-6z", { fill: "#5a6570" })
        + path("M26 30h22M26 42h16", { stroke: "#aeb6be", "stroke-width": 2.4, "stroke-linecap": "round" })
        + path("M24 49h24", { stroke: "#b0616a", "stroke-width": 2.2, "stroke-linecap": "round" });
      break;
    case "review":
      body = path("M8 9h34l10 10v36H8z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M42 9v10h10", { fill: "#d1d7dc", stroke: edge, "stroke-width": sw }) + circle(41, 40, 11, { fill: "url(#lens)", stroke: edge, "stroke-width": sw }) + line(49, 48, 57, 56, { stroke: edge, "stroke-width": 4, "stroke-linecap": "round" });
      break;
    case "search":
      body = path("M7 14h33v39H7z", { fill: paper, stroke: edge, "stroke-width": sw }) + circle(37, 32, 13, { fill: "url(#lens)", stroke: edge, "stroke-width": sw }) + line(46, 42, 57, 53, { stroke: edge, "stroke-width": 5, "stroke-linecap": "round" });
      break;
    case "book":
      body = path("M5 16q13-7 27 2v39q-13-8-27-2zM59 16q-13-7-27 2v39q13-8 27-2z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M32 18v39", { stroke: "#8d969e", "stroke-width": 1.3 });
      break;
    case "dictionary":
      body = path("M5 16q13-7 27 2v39q-13-8-27-2zM59 16q-13-7-27 2v39q13-8 27-2z", { fill: "url(#leather)", stroke: edge, "stroke-width": sw }) + path("M9 20q11-5 22 1v31q-11-6-22-2zM55 20q-11-5-22 1v31q11-6 22-2z", { fill: paper, stroke: "#8a6b4d", "stroke-width": 1 });
      break;
    case "clock":
      body = path("M6 9h52v46H6z", { fill: paper, stroke: edge, "stroke-width": sw })
        + path("M6 21h52", { stroke: edge, "stroke-width": sw })
        + path("M11 13h20v5H11z", { fill: "#dfe4e9", stroke: edge, "stroke-width": 1 })
        + circle(40, 38, 13, { fill: metal, stroke: "#8e9aa5", "stroke-width": sw })
        + path("M40 30v9l7 4", { fill: "none", stroke: "#5a6570", "stroke-width": 2.6, "stroke-linecap": "round" })
        + path("M14 30h14M14 38h10M14 46h16", { stroke: "#b9c2ca", "stroke-width": 2, "stroke-linecap": "round" });
      break;
    case "map":
      body = path("M6 9h27v46H6z", { fill: paper, stroke: edge, "stroke-width": sw })
        + path("M12 19h15M12 27h11", { stroke: "#9aa0a6", "stroke-width": 2.6, "stroke-linecap": "round" })
        + path("M33 32h9M42 18v28M42 18h6M42 32h6M42 46h6", { fill: "none", stroke: "#5a6570", "stroke-width": 2.8, "stroke-linecap": "round", "stroke-linejoin": "round" })
        + circle(52, 18, 5, { fill: metal, stroke: edge, "stroke-width": sw })
        + circle(53, 32, 6, { fill: metal, stroke: edge, "stroke-width": sw })
        + circle(52, 46, 5, { fill: metal, stroke: edge, "stroke-width": sw });
      break;
    case "stage":
      body = path("M7 12h50v36H7z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M12 17h40v26H12z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M4 49h56v7H4z", { fill: "#4e5e6b", stroke: edge, "stroke-width": sw });
      break;
    case "easel":
      // A comparison bench: the editable grid with one read-only projection.
      body = path("M6 8h52v48H6z", { fill: paper, stroke: edge, "stroke-width": sw })
        + path("M6 20h52M24 8v48M42 8v48M6 34h52", { fill: "none", stroke: edge, "stroke-width": 1.2 })
        + path("M11 50h7V38h-7zM29 50h7V30h-7zM47 50h7V42h-7z", { fill: "#7f97ad", stroke: edge, "stroke-width": 1 });
      break;
    case "cover":
      body = path("M12 6h40v52H12z", { fill: "url(#lens)", stroke: edge, "stroke-width": sw }) + path("M17 11h30v42H17z", { fill: "#ffffff", "fill-opacity": 0.42, stroke: "#f4fbff", "stroke-opacity": 0.75, "stroke-width": 1.2 }) + path("M15 9l34 46", { stroke: "#ffffff", "stroke-opacity": 0.35, "stroke-width": 3 });
      break;
    case "swatches":
      body = path("M10 53l6-42h32l6 42z", { fill: metal, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M17 16h30M15 26h34M14 36h36M12 46h40", { stroke: "#7c8893", "stroke-width": 1 });
      break;
    case "speaker":
      body = path("M11 6h42v52H11z", { fill: "#343c46", stroke: "#1d252c", "stroke-width": sw }) + circle(32, 39, 15, { fill: "#111820", stroke: "#697680", "stroke-width": sw }) + circle(32, 39, 7, { fill: "#5a6672", stroke: "#131a20", "stroke-width": sw }) + circle(32, 17, 4.5, { fill: "#b8c3ca", stroke: "#202a31", "stroke-width": sw });
      break;
    case "album":
      body = path("M9 6h46v52H9z", { fill: "url(#leather)", stroke: edge, "stroke-width": sw }) + path("M15 12h34v38H15z", { fill: paper, stroke: "#765338", "stroke-width": sw }) + path("M12 7v50", { stroke: "#4b3024", "stroke-width": 3 });
      break;
    case "inbox":
      body = path("M5 35h16l5 8h12l5-8h16v21H5z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M12 8h40v36H12z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M9 48h46", { stroke: "#6d7882", "stroke-width": 1.4 });
      break;
    case "controlBoard":
      body = path("M7 6h50v52H7z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M13 12h38v39H13z", { fill: "#d9dde0", stroke: "#69747d", "stroke-width": sw }) + fine;
      break;
    case "network":
      body = path("M5 9h22v19H5zM37 9h22v19H37zM21 38h22v19H21zM16 28l16 10 16-10", { fill: metal, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M9 13h14v10H9zM41 13h14v10H41zM25 42h14v10H25z", { fill: "#bdd4e3", stroke: "#627485", "stroke-width": 1 });
      break;
    case "monitor":
      body = path("M6 7h52v41H6z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M11 12h42v30H11z", { fill: "#edf3ef", stroke: "#55636c", "stroke-width": sw }) + path("M26 48h12v7h9v3H17v-3h9z", { fill: metal, stroke: edge, "stroke-width": sw });
      break;
    case "press":
      body = path("M7 27h50v29H7z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M15 6h34v33H15z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M12 44h40M12 50h40", { stroke: "#65717b", "stroke-width": 1.5 });
      break;
    case "stamp":
      body = path("M14 39h36l8 15H6z", { fill: "#943f39", stroke: edge, "stroke-width": sw }) + path("M20 9h24v31H20z", { fill: "url(#leather)", stroke: edge, "stroke-width": sw }) + path("M25 7h14", { stroke: "#402820", "stroke-width": 5, "stroke-linecap": "round" });
      break;
    case "terminal":
      body = path("M6 7h52v42H6z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M11 12h42v31H11z", { fill: "#102229", stroke: "#213942", "stroke-width": sw }) + path("M25 49h14v6h9v3H16v-3h9z", { fill: metal, stroke: edge, "stroke-width": sw });
      break;
    case "finderPair":
      body = path("M5 17h38v40H5z", { fill: "#9fb5c7", stroke: edge, "stroke-width": sw }) + path("M21 7h38v41H21z", { fill: metal, stroke: edge, "stroke-width": sw }) + path("M40 8v39", { stroke: "#547d9d", "stroke-width": sw });
      break;
    case "briefcase":
      body = path("M6 20h52v36H6z", { fill: "url(#leather)", stroke: edge, "stroke-width": sw }) + path("M20 20v-9h24v9M6 35h52", rule) + rect(28, 32, 8, 8, { rx: 1, fill: metal, stroke: edge, "stroke-width": sw });
      break;
    case "bell":
      body = path("M11 48h42c-7-8-8-15-8-24 0-18-26-18-26 0 0 9-1 16-8 24z", { fill: "#c99c43", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + ellipse(32, 51, 24, 5, { fill: "#8c6229", stroke: edge, "stroke-width": sw }) + circle(32, 57, 3.5, { fill: "#5e3d1f" });
      break;
    case "chip":
      body = path("M20 20h24v24H20z", { fill: metal, stroke: edge, "stroke-width": sw })
        + path("M27 27h10v10H27z", { fill: "#d9dde0", stroke: "#69747d", "stroke-width": sw })
        + path("M26 12v8M32 12v8M38 12v8M26 44v8M32 44v8M38 44v8M12 26h8M12 32h8M12 38h8M44 26h8M44 32h8M44 38h8", { fill: "none", stroke: edge, "stroke-width": sw + 0.8, "stroke-linecap": "round" });
      break;
    case "strip":
      body = path("M6 22h40q12 0 12 10q0 10-12 10H6z", { fill: metal, stroke: edge, "stroke-width": sw })
        + path("M20 22v20M30 22v20M40 22v20", { fill: "none", stroke: "#69747d", "stroke-width": sw })
        + path("M50 28v8", { fill: "none", stroke: "#69747d", "stroke-width": sw, "stroke-linecap": "round" });
      break;
    default:
      body = path("M9 7h46v51H9z", { fill: bodyFill, stroke: edge, "stroke-width": sw });
  }
  const masterFinish = detail === "master"
    ? group(
        path("M19 18h27M18 21h29M20 24h25M19 27h27", { stroke: "#ffffff", "stroke-width": 0.28, "stroke-opacity": 0.22 })
        + circle(23, 31, 0.45, { fill: "#ffffff", "fill-opacity": 0.28 })
        + circle(42, 35, 0.35, { fill: "#17212a", "fill-opacity": 0.18 })
        + circle(29, 45, 0.4, { fill: "#ffffff", "fill-opacity": 0.2 }),
      )
    : "";
  return shadow + body + masterFinish + symbolMark(spec, "snow-leopard", detail);
}

function yosemiteBody(spec, detail) {
  const edge = "#789bb9";
  const sw = detail === "small" ? 2.3 : 1.35;
  const paper = "url(#paper)";
  const metal = "url(#metal)";
  const blue = "#70b2e5";
  const deep = "#357fbc";
  const rule = { fill: "none", stroke: edge, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" };
  let body = "";
  switch (spec.body) {
    case "drive": body = path("M12 16h40l4 38H8z", { fill: metal, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M18 12h28l4 8H14z", { fill: "#edf4f9", stroke: edge, "stroke-width": sw }) + path("M19 43h26M24 49h16", rule); break;
    case "folder": body = path("M6 20h20l6 6h26v29H6z", { fill: blue, stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }) + path("M6 31h52v24H6z", { fill: "#78b7e7", stroke: edge, "stroke-width": sw }); break;
    case "paper": case "paperPen": body = path("M14 7h28l10 10v40H14z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M42 7v10h10", { fill: "#dfeaf3", stroke: edge, "stroke-width": sw }); break;
    case "paperStack": body = path("M20 12h32v40H20z", { fill: "#c9d7e3", stroke: edge, "stroke-width": sw }) + path("M14 7h29l9 9v41H14z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M43 7v9h9", { fill: "#dbe6ef", stroke: edge, "stroke-width": sw }); break;
    case "manuscript": body = path("M10 13h44v43H10z", { fill: "#7da5c5", stroke: edge, "stroke-width": sw }) + path("M17 7h31v44H17z", { fill: paper, stroke: edge, "stroke-width": sw }); break;
    case "trash": body = path("M14 21h36l-4 35H18z", { fill: "#d9e5ee", stroke: edge, "stroke-width": sw }) + path("M10 17h44v7H10z", { fill: "#e9f1f6", stroke: edge, "stroke-width": sw }) + (detail === "small" ? "" : path("M21 27l2 25M29 26v27M37 26v27M45 27l-3 25", { stroke: "#a2b6c5", "stroke-width": 1 })); break;
    case "finder": body = path("M10 8h44v48H10z", { fill: "#a8d3ef", stroke: edge, "stroke-width": sw }) + path("M32 8v48", { stroke: deep, "stroke-width": sw }) + path("M11 9h20v46H11z", { fill: "#d7ebf8", "fill-opacity": 0.8 }); break;
    case "floppy": body = path("M11 8h42v48H11z", { fill: "#aebdca", stroke: edge, "stroke-width": sw }) + path("M17 8h30v19H17z", { fill: "#eef4f8", stroke: edge, "stroke-width": sw }) + path("M20 36h24v20H20z", { fill: paper, stroke: edge, "stroke-width": sw }); break;
    case "disc": body = circle(32, 32, 24, { fill: "#e3f0f8", stroke: edge, "stroke-width": sw }) + path("M15 20l34 25M19 49l29-32", { stroke: "#9ed3ed", "stroke-width": detail === "small" ? 3 : 4, "stroke-opacity": 0.75 }) + circle(32, 32, 5, { fill: "#ffffff", stroke: edge, "stroke-width": sw }); break;
    case "correspondence": body = path("M8 18h48v35H8z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M8 18l24 21 24-21", rule); break;
    case "typewriter": body = path("M7 31h50l3 23H4z", { fill: "#b6c5d1", stroke: edge, "stroke-width": sw }) + path("M16 7h32v30H16z", { fill: paper, stroke: edge, "stroke-width": sw }) + (detail === "small" ? "" : path("M12 39h40M11 45h42M9 51h46", { stroke: "#6e8496", "stroke-width": 1.2, "stroke-dasharray": "2 2" })); break;
    case "server": body = path("M12 7h40v49H12z", { fill: "#b8c7d3", stroke: edge, "stroke-width": sw }) + path("M15 15h34M15 29h34M15 43h34", { stroke: "#71879a", "stroke-width": sw }) + circle(45, 21, 2, { fill: "#44b85e" }) + circle(45, 35, 2, { fill: "#f0a93d" }) + circle(45, 49, 2, { fill: "#378ad0" }); break;
    case "cards": body = path("M11 20h43v35H11z", { fill: "#d7bd8c", stroke: edge, "stroke-width": sw }) + path("M16 11h34v35H16z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M22 7h28v32H22z", { fill: paper, stroke: edge, "stroke-width": sw }); break;
    case "indexBox": body = path("M8 8h48v48H8z", { fill: paper, stroke: edge, "stroke-width": sw })
      + path("M8 20h48", { stroke: edge, "stroke-width": sw })
      + path("M15 12h22v5H15z", { fill: "#e2ecf5", stroke: edge, "stroke-width": 1 })
      + path("M16 28h6v6h-6zM16 40h6v6h-6z", { fill: deep })
      + path("M26 30h22M26 42h16", { stroke: "#c2ccd6", "stroke-width": 2.6, "stroke-linecap": "round" })
      + path("M24 49h24", { stroke: "#e0736f", "stroke-width": 2.4, "stroke-linecap": "round" }); break;
    case "review": body = path("M10 8h33l9 9v39H10z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M43 8v9h9", { fill: "#dae6ef", stroke: edge, "stroke-width": sw }) + circle(42, 41, 10, { fill: "#b9def3", "fill-opacity": 0.78, stroke: deep, "stroke-width": sw }) + line(49, 48, 56, 55, { stroke: deep, "stroke-width": 4, "stroke-linecap": "round" }); break;
    case "search": body = path("M8 15h31v38H8z", { fill: paper, stroke: edge, "stroke-width": sw }) + circle(38, 31, 13, { fill: "#c7e4f4", stroke: deep, "stroke-width": sw }) + line(47, 41, 57, 51, { stroke: deep, "stroke-width": 5, "stroke-linecap": "round" }); break;
    case "book": case "dictionary": body = path("M5 16q13-6 27 2v39q-13-7-27-2zM59 16q-13-6-27 2v39q13-7 27-2z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M32 18v39", { stroke: edge, "stroke-width": 1 }); break;
    case "clock": body = path("M6 9h52v46H6z", { fill: paper, stroke: edge, "stroke-width": sw })
      + path("M6 21h52", { stroke: edge, "stroke-width": sw })
      + path("M11 13h20v5H11z", { fill: "#dbe7f2", stroke: edge, "stroke-width": 1 })
      + circle(40, 38, 13, { fill: "none", stroke: deep, "stroke-width": 2.6 })
      + path("M40 30v9l7 4", { fill: "none", stroke: deep, "stroke-width": 2.8, "stroke-linecap": "round" })
      + path("M14 30h14M14 38h10M14 46h16", { stroke: "#c2ccd6", "stroke-width": 2.2, "stroke-linecap": "round" }); break;
    case "map": body = path("M6 9h26v46H6z", { fill: "#ffffff", stroke: edge, "stroke-width": sw })
      + path("M12 19h14M12 27h10", { stroke: "#c2c8ce", "stroke-width": 2.6, "stroke-linecap": "round" })
      + path("M32 32h10M42 18v28M42 18h6M42 32h6M42 46h6", { fill: "none", stroke: deep, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" })
      + circle(52, 18, 5, { fill: blue })
      + circle(53, 32, 6, { fill: deep })
      + circle(52, 46, 5, { fill: blue }); break;
    case "stage": body = path("M8 13h48v34H8z", { fill: "#9db9cf", stroke: edge, "stroke-width": sw }) + path("M13 18h38v24H13z", { fill: paper, stroke: edge, "stroke-width": sw }) + path("M5 48h54v7H5z", { fill: "#5f8caf", stroke: edge, "stroke-width": sw }); break;
    case "easel": body = path("M6 8h52v48H6z", { fill: paper, stroke: edge, "stroke-width": sw })
      + path("M6 20h52M24 8v48M42 8v48M6 34h52", { fill: "none", stroke: "#c2ccd6", "stroke-width": 1.4 })
      + path("M11 50h7V38h-7zM29 50h7V30h-7zM47 50h7V42h-7z", { fill: blue }); break;
    case "cover": body = path("M13 7h38v50H13z", { fill: "#8cc8eb", stroke: deep, "stroke-width": sw }) + path("M18 12h28v40H18z", { fill: "#ffffff", "fill-opacity": 0.48, stroke: "#d8f1ff", "stroke-width": 1 }); break;
    case "swatches": body = path("M12 52l5-40h30l5 40z", { fill: "#eef3f7", stroke: edge, "stroke-width": sw }); break;
    case "speaker": body = path("M12 7h40v50H12z", { fill: "#3f5162", stroke: "#294052", "stroke-width": sw }) + circle(32, 39, 14, { fill: "#172736", stroke: "#7892a7", "stroke-width": sw }) + circle(32, 39, 6, { fill: "#657b8e" }) + circle(32, 17, 4, { fill: "#c5d5e0" }); break;
    case "album": body = path("M10 7h44v50H10z", { fill: "#d4b47d", stroke: "#a28455", "stroke-width": sw }) + path("M16 13h32v35H16z", { fill: paper, stroke: edge, "stroke-width": sw }); break;
    case "inbox": body = path("M6 35h15l5 7h12l5-7h15v20H6z", { fill: "#9fc5df", stroke: edge, "stroke-width": sw }) + path("M13 8h38v35H13z", { fill: paper, stroke: edge, "stroke-width": sw }); break;
    case "controlBoard": body = path("M9 8h46v48H9z", { fill: "#c2d0dc", stroke: edge, "stroke-width": sw }) + path("M14 14h36v35H14z", { fill: "#edf2f6", stroke: edge, "stroke-width": sw }); break;
    case "network": body = path("M7 10h20v17H7zM37 10h20v17H37zM22 38h20v17H22zM17 27l15 11 15-11", { fill: "#b8cedf", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" }); break;
    case "monitor": body = path("M7 8h50v39H7z", { fill: "#b9c9d5", stroke: edge, "stroke-width": sw }) + path("M12 13h40v28H12z", { fill: "#eef5f0", stroke: edge, "stroke-width": sw }) + path("M27 47h10v7h8v4H19v-4h8z", { fill: "#aabac7", stroke: edge, "stroke-width": sw }); break;
    case "press": body = path("M8 27h48v29H8z", { fill: "#b7c6d2", stroke: edge, "stroke-width": sw }) + path("M16 7h32v31H16z", { fill: paper, stroke: edge, "stroke-width": sw }); break;
    case "stamp": body = path("M15 39h34l8 14H7z", { fill: "#e45d61", stroke: "#b44348", "stroke-width": sw }) + path("M21 9h22v31H21z", { fill: "#d7ab79", stroke: "#a47c50", "stroke-width": sw }); break;
    case "terminal": body = path("M7 8h50v40H7z", { fill: "#aabac6", stroke: edge, "stroke-width": sw }) + path("M12 13h40v29H12z", { fill: "#142a30", stroke: "#29424a", "stroke-width": sw }) + path("M25 48h14v7h8v3H17v-3h8z", { fill: "#a7b7c3", stroke: edge, "stroke-width": sw }); break;
    case "finderPair": body = path("M6 16h36v40H6z", { fill: "#9dbbd1", stroke: edge, "stroke-width": sw }) + path("M22 7h36v40H22z", { fill: "#b1d8ef", stroke: edge, "stroke-width": sw }) + path("M40 8v38", { stroke: deep, "stroke-width": sw }); break;
    case "briefcase": body = path("M7 20h50v35H7z", { fill: "#8eb7d3", stroke: edge, "stroke-width": sw }) + path("M21 20v-8h22v8M7 34h50", rule) + rect(28, 31, 8, 8, { rx: 1, fill: "#e7eef4", stroke: edge, "stroke-width": sw }); break;
    case "bell": body = path("M12 48h40c-6-7-7-14-7-23 0-17-26-17-26 0 0 9-1 16-7 23z", { fill: "#f0b943", stroke: "#b47d2f", "stroke-width": sw, "stroke-linejoin": "round" }) + ellipse(32, 51, 23, 5, { fill: "#d99d39", stroke: "#b47d2f", "stroke-width": sw }) + circle(32, 56, 3.5, { fill: "#8d5a25" }); break;
    case "chip":
      body = path("M20 20h24v24H20z", { fill: "#c2d0dc", stroke: edge, "stroke-width": sw })
        + path("M27 27h10v10H27z", { fill: "#edf2f6", stroke: edge, "stroke-width": sw })
        + path("M26 12v8M32 12v8M38 12v8M26 44v8M32 44v8M38 44v8M12 26h8M12 32h8M12 38h8M44 26h8M44 32h8M44 38h8", { fill: "none", stroke: edge, "stroke-width": sw + 0.6, "stroke-linecap": "round" });
      break;
    case "strip":
      body = path("M6 22h40q12 0 12 10q0 10-12 10H6z", { fill: "#edf2f6", stroke: edge, "stroke-width": sw })
        + path("M20 22v20M30 22v20M40 22v20", { fill: "none", stroke: "#a9c0d4", "stroke-width": sw })
        + path("M50 28v8", { fill: "none", stroke: edge, "stroke-width": sw, "stroke-linecap": "round" });
      break;
    default: body = path("M10 8h44v48H10z", { fill: "url(#body)", stroke: edge, "stroke-width": sw });
  }
  return body + symbolMark(spec, "yosemite", detail);
}

function liquidGlassMark(spec, detail) {
  const sw = detail === "small" ? 3 : 2;
  const ink = "#17324d";
  const blue = "#0868d7";
  const red = "#d62f4b";
  const green = "#138b58";
  const gold = "#b36d09";
  const violet = "#6741bb";
  const white = "#ffffff";
  const rule = { fill: "none", stroke: ink, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const whiteRule = { ...rule, stroke: white, "stroke-opacity": 0.96 };
  switch (spec.symbol) {
    case "none":
      return "";
    case "startup":
      return circle(32, 36, 8, { fill: "#ffffff", "fill-opacity": 0.72, stroke: blue, "stroke-width": sw })
        + path("M32 27v9M27 31a8 8 0 1 0 10 0", { ...rule, stroke: blue });
    case "disk":
      return path("M20 40h24M23 46h18", { ...rule, stroke: white })
        + circle(46, 36, 2.2, { fill: "#5bf08b", stroke: white, "stroke-width": 1 });
    case "applications":
      return [
        circle(25, 34, 5, { fill: "#20a7ff", stroke: white, "stroke-width": 1.5 }),
        circle(39, 34, 5, { fill: "#ff5570", stroke: white, "stroke-width": 1.5 }),
        circle(25, 47, 5, { fill: "#ffbd39", stroke: white, "stroke-width": 1.5 }),
        circle(39, 47, 5, { fill: "#45d47b", stroke: white, "stroke-width": 1.5 }),
      ].join("");
    case "empty":
      return path("M25 29l1 19M32 28v21M39 29l-1 19", { ...rule, stroke: "#55738c", "stroke-opacity": 0.82 });
    case "full":
      return path("M20 31l6-7 6 6 7-9 7 11", { fill: "#ffca4d", stroke: white, "stroke-width": sw, "stroke-linejoin": "round" });
    case "finder":
      return path("M24 28v18M40 28v18", { ...rule, stroke: blue, "stroke-opacity": 0.42 })
        + circle(26, 35, 1.6, { fill: ink })
        + circle(38, 35, 1.6, { fill: ink })
        + path("M24 42c5 5 11 5 16 0", rule);
    case "floppy":
      return rect(23, 22, 18, 12, { rx: 2, fill: "#ffffff", "fill-opacity": 0.82, stroke: ink, "stroke-width": sw })
        + path("M27 39h16M28 44h12", whiteRule);
    case "assistant":
      return path("M20 30h23v13H31l-7 6 2-6h-6z", { fill: "#ffffff", "fill-opacity": 0.82, stroke: blue, "stroke-width": sw, "stroke-linejoin": "round" })
        + path("M26 35h11M26 39h8", { ...rule, stroke: blue });
    case "pencil":
      return path("M20 46l19-19 6 6-19 19-8 2z", { fill: "#ffd35f", stroke: gold, "stroke-width": sw, "stroke-linejoin": "round" })
        + path("M21 47l5 5", { ...rule, stroke: gold });
    case "writing":
      return path("M22 30h20M22 36h16M22 42h20M22 48h12", { ...rule, stroke: blue });
    case "project":
      return path("M21 34h22v14H21z", { fill: "#198df2", "fill-opacity": 0.84, stroke: white, "stroke-width": sw, "stroke-linejoin": "round" })
        + path("M26 41h12", whiteRule);
    case "cloud":
      return path("M20 43c-5-7 2-13 8-10 2-8 14-7 15 1 8-1 10 11 1 12H23c-3 0-5-1-3-3z", { fill: "#ffffff", "fill-opacity": 0.85, stroke: blue, "stroke-width": sw, "stroke-linejoin": "round" });
    case "cloudOff":
      return path("M20 43c-5-7 2-13 8-10 2-8 14-7 15 1 8-1 10 11 1 12H23c-3 0-5-1-3-3z", { fill: "#ffffff", "fill-opacity": 0.48, stroke: "#688198", "stroke-width": sw, "stroke-linejoin": "round" })
        + path("M19 27l27 25", { ...rule, stroke: red, "stroke-width": sw + 1 });
    case "question":
    case "help":
      return path("M25 31c1-8 15-8 15 0 0 6-8 6-8 12M32 49v1", { ...rule, stroke: blue, "stroke-width": sw + 0.5 });
    case "outline":
      return path("M23 29h4v4h-4zM31 31h12M23 38h4v4h-4zM31 40h10M23 47h4v4h-4zM31 49h8", { fill: "none", stroke: blue, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "sections":
      return path("M23 29h19M23 35h11M23 41h19M23 47h14", { ...rule, stroke: blue });
    case "manuscript":
      return path("M21 29h22M21 35h18M21 41h22M21 47h14", rule)
        + path("M18 27v23", { ...rule, stroke: blue, "stroke-opacity": 0.55 });
    case "proof":
      return path("M20 42l9 8 17-22", { fill: "none", stroke: red, "stroke-width": sw + 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "magnify":
      return circle(29, 34, 10, { fill: "url(#liquidLens)", stroke: white, "stroke-width": sw })
        + line(36.5, 41.5, 47, 52, { stroke: ink, "stroke-width": sw + 2.5, "stroke-linecap": "round" })
        + path("M25 34h8M29 30v8", whiteRule);
    case "reader":
      return path("M17 31q8-5 15 1v20q-7-5-15-1zM47 31q-8-5-15 1v20q7-5 15-1z", { fill: "#ffffff", "fill-opacity": 0.78, stroke: blue, "stroke-width": sw, "stroke-linejoin": "round" });
    case "archive":
      return circle(32, 38, 14, { fill: "#ffffff", "fill-opacity": 0.72, stroke: violet, "stroke-width": sw })
        + path("M32 29v10l7 4M20 33l-3 6 6 2", { ...rule, stroke: violet });
    case "map":
      return path("M22 40l7 5 13-15M41 30c0-6 9-6 9 0 0 4-4.5 8-4.5 8S41 34 41 30z", { fill: "none", stroke: blue, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "stage":
      return path("M25 28l17 10-17 10z", { fill: "#ffffff", "fill-opacity": 0.9, stroke: blue, "stroke-width": sw, "stroke-linejoin": "round" });
    case "chart":
      return path("M20 48V31M27 48V39M34 48V34M41 48V26", { ...rule, stroke: blue, "stroke-width": sw + 2 })
        + path("M20 35l8 3 6-7 8-4", { ...rule, stroke: green });
    case "cover":
      return path("M37 25l2.2 5 5 2.2-5 2.2-2.2 5-2.2-5-5-2.2 5-2.2z", { fill: "#ffffff", stroke: blue, "stroke-width": 1.5 })
        + path("M22 43h20", whiteRule);
    case "swatches":
      return circle(23, 35, 6, { fill: "#ff5268", stroke: white, "stroke-width": 1.5 })
        + circle(34, 30, 6, { fill: "#ffbd3f", stroke: white, "stroke-width": 1.5 })
        + circle(43, 39, 6, { fill: "#39cb72", stroke: white, "stroke-width": 1.5 })
        + circle(29, 46, 6, { fill: "#2795ed", stroke: white, "stroke-width": 1.5 });
    case "sound":
      return path("M19 36h8l9-8v20l-9-7h-8z", { fill: "#ffffff", "fill-opacity": 0.88, stroke: violet, "stroke-width": sw, "stroke-linejoin": "round" })
        + path("M41 34c4 3 4 8 0 11M45 30c8 6 8 14 0 20", { ...rule, stroke: white });
    case "scraps":
      return rect(20, 28, 25, 20, { rx: 3, fill: "#ffffff", "fill-opacity": 0.8, stroke: gold, "stroke-width": sw })
        + circle(39, 34, 2.5, { fill: "#ffbd3f" })
        + path("M23 44l7-8 5 5 4-4 4 7z", { fill: "#3ecb72" });
    case "gear":
      return path("M32 26l3 3 5-1 1 5 4 3-3 4 1 5-5 1-3 4-4-3-5 1-1-5-4-3 3-4-1-5 5-1z", { fill: "#ffffff", "fill-opacity": 0.76, stroke: blue, "stroke-width": sw, "stroke-linejoin": "round" })
        + circle(32, 38, 4, { fill: blue });
    case "import":
      return path("M32 24v19M24 36l8 8 8-8M20 49h24", { ...rule, stroke: blue, "stroke-width": sw + 1 });
    case "sliders":
      return path("M20 29h24M20 38h24M20 47h24", whiteRule)
        + circle(27, 29, 3.5, { fill: blue, stroke: white, "stroke-width": 1.5 })
        + circle(38, 38, 3.5, { fill: violet, stroke: white, "stroke-width": 1.5 })
        + circle(29, 47, 3.5, { fill: green, stroke: white, "stroke-width": 1.5 });
    case "knobs":
      return circle(25, 35, 8, { fill: "url(#liquidLens)", stroke: white, "stroke-width": sw })
        + circle(40, 43, 8, { fill: "url(#glassGold)", stroke: white, "stroke-width": sw })
        + path("M25 35l3-4M40 43l-2-5", { ...rule, stroke: ink });
    case "chooser":
      return circle(22, 34, 5, { fill: "#1d9bf0", stroke: white, "stroke-width": 1.5 })
        + circle(42, 29, 5, { fill: "#42d37b", stroke: white, "stroke-width": 1.5 })
        + circle(40, 47, 5, { fill: "#ffbd42", stroke: white, "stroke-width": 1.5 })
        + path("M27 34l10-4M27 37l9 8", whiteRule);
    case "dictionary":
      return path("M23 46l7-18 7 18M26 40h8M39 30h7l-7 16h8", { ...rule, stroke: gold });
    case "play":
      return path("M25 29l18 11-18 11z", { fill: blue, stroke: white, "stroke-width": sw, "stroke-linejoin": "round" });
    case "chat":
      return path("M19 29h21v13H28l-7 6 2-6h-4zM34 40h13v9h-4l3 4-7-4h-5", { fill: "#ffffff", "fill-opacity": 0.76, stroke: blue, "stroke-width": sw, "stroke-linejoin": "round" });
    case "status":
      return path("M19 46l7-10 6 6 7-17 7 21", { fill: "none", stroke: green, "stroke-width": sw + 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "context":
      return path("M21 30h23M21 37h15M21 44h20M21 51h12", { ...rule, stroke: gold })
        + path("M17 27v27", { ...rule, stroke: gold, "stroke-opacity": 0.5 });
    case "rebuild":
      return path("M23 34a13 13 0 1 1 2 14M20 34l5-8 7 5", { fill: "none", stroke: blue, "stroke-width": sw + 1, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "forms":
      return path("M22 31h20M22 37h14M22 43h18", whiteRule)
        + path("M34 49l13-13", { ...rule, stroke: red, "stroke-width": sw + 2 });
    case "terminal":
      return path("M22 31l7 6-7 6M32 44h12", { fill: "none", stroke: "#75f3a1", "stroke-width": sw + 1, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "documents":
      return path("M22 26h20v24H22zM28 31h20v24H28z", { fill: "#ffffff", "fill-opacity": 0.68, stroke: blue, "stroke-width": sw, "stroke-linejoin": "round" });
    case "alias":
      return path("M21 49l23-23M34 26h10v10", { fill: "none", stroke: blue, "stroke-width": sw + 1, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "deskAccessory":
      return path("M23 31h18v18H23zM27 27h10v5M27 36h10M27 41h7M27 46h9", { fill: "none", stroke: blue, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" });
    case "bell":
      return path("M18 46h28c-5-5-5-11-5-16 0-12-18-12-18 0 0 6 0 11-5 16z", { fill: "#ffca54", stroke: gold, "stroke-width": sw, "stroke-linejoin": "round" })
        + circle(32, 50, 3, { fill: gold });
    default:
      return circle(32, 39, 7, { fill: "#ffffff", "fill-opacity": 0.82, stroke: blue, "stroke-width": sw });
  }
}

function liquidGlassBody(spec, detail) {
  const sw = detail === "small" ? 2.8 : 1.8;
  const edge = "#ffffff";
  const edgeOpacity = 0.9;
  const deep = "#17324d";
  const toneFill = {
    blue: "url(#glassBlue)", violet: "url(#glassViolet)", red: "url(#glassRed)",
    green: "url(#glassGreen)", gold: "url(#glassGold)", gray: "url(#glassSteel)",
    steel: "url(#glassSteel)", paper: "url(#paperGlass)", rainbow: "url(#glassBlue)",
  }[spec.tone] || "url(#glassBlue)";
  const rim = { stroke: edge, "stroke-opacity": edgeOpacity, "stroke-width": sw, "stroke-linejoin": "round" };
  const inner = { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.48, "stroke-width": 1.2, "stroke-linecap": "round" };
  const shadow = ellipse(32, 58, spec.genre === "document" ? 18 : 22, 3.2, { fill: "#102d49", "fill-opacity": 0.18 });
  let body = "";
  switch (spec.body) {
    case "drive":
      body = path("M12 20h40l5 31q1 6-6 6H13q-7 0-6-6z", { fill: "url(#glassSteel)", ...rim })
        + path("M16 15h32l6 9H10z", { fill: "url(#glassClear)", ...rim })
        + path("M15 22h38M15 25h36", inner);
      break;
    case "folder":
      body = path("M7 19q0-5 5-5h13l6 6h22q5 0 5 5v27q0 5-5 5H12q-5 0-5-5z", { fill: toneFill, ...rim })
        + path("M8 29q18-6 49 0v23q0 5-5 5H12q-4 0-4-5z", { fill: "#ffffff", "fill-opacity": 0.16, ...rim })
        + path("M12 18h12l5 5", inner);
      break;
    case "paper":
    case "paperPen":
      body = path("M14 6h28l10 10v37q0 5-5 5H14q-4 0-4-4V10q0-4 4-4z", { fill: "url(#paperGlass)", ...rim })
        + path("M42 6v10h10", { fill: "#bad9ee", "fill-opacity": 0.72, ...rim })
        + path("M14 10h23", inner);
      break;
    case "paperStack":
      body = path("M20 10h29q4 0 4 4v39H20z", { fill: "#9dbbd0", "fill-opacity": 0.7, ...rim })
        + path("M13 6h28l10 10v37q0 5-5 5H13q-4 0-4-4V10q0-4 4-4z", { fill: "url(#paperGlass)", ...rim })
        + path("M41 6v10h10", { fill: "#bad9ee", "fill-opacity": 0.74, ...rim });
      break;
    case "manuscript":
      body = path("M7 16h48v40H7z", { rx: 5, fill: "url(#glassBlue)", ...rim })
        + path("M16 6h32q4 0 4 4v41H16z", { fill: "url(#paperGlass)", ...rim })
        + path("M20 10h24", inner);
      break;
    case "trash":
      body = path("M15 21h34l-4 36H19z", { fill: "url(#glassClear)", ...rim })
        + path("M10 17h44v7H10z", { rx: 3.5, fill: "url(#glassSteel)", ...rim })
        + path("M24 17v-5h16v5", { fill: "none", stroke: edge, "stroke-width": sw, "stroke-linejoin": "round" });
      break;
    case "finder":
      body = path("M11 7h42q5 0 5 5v40q0 5-5 5H11q-5 0-5-5V12q0-5 5-5z", { fill: "url(#glassBlue)", ...rim })
        + path("M8 10h23v45H11q-3 0-3-3z", { fill: "#ffffff", "fill-opacity": 0.48 })
        + path("M32 8v48", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.64, "stroke-width": sw });
      break;
    case "floppy":
      body = path("M12 7h37l7 7v43H8V11q0-4 4-4z", { fill: "url(#glassSteel)", ...rim })
        + path("M17 7h29v22H17z", { fill: "url(#glassClear)", ...rim })
        + path("M18 37h27v20H18z", { fill: "url(#paperGlass)", ...rim });
      break;
    case "disc":
      body = circle(32, 32, 26, { fill: "url(#glassClear)", ...rim })
        + path("M12 21l40 27M17 52l33-38", { fill: "none", stroke: "#4db8ff", "stroke-opacity": 0.62, "stroke-width": detail === "small" ? 4 : 6 })
        + path("M17 12l30 42", { fill: "none", stroke: "#d69cff", "stroke-opacity": 0.52, "stroke-width": detail === "small" ? 2.5 : 4 })
        + circle(32, 32, 6, { fill: "#ffffff", "fill-opacity": 0.78, ...rim });
      break;
    case "correspondence":
      body = path("M8 18q0-5 5-5h38q5 0 5 5v31q0 5-5 5H17L8 60l3-10q-3-1-3-5z", { fill: toneFill, ...rim })
        + path("M10 18l22 19 22-19M11 52l16-19M53 52L37 33", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.55, "stroke-width": sw, "stroke-linejoin": "round" });
      break;
    case "typewriter":
      body = path("M9 31h46l6 24H3z", { fill: "url(#glassSteel)", ...rim })
        + path("M16 6h32v31H16z", { fill: "url(#paperGlass)", ...rim })
        + (detail === "small" ? "" : path("M12 39h40M10 45h44M8 51h48", { fill: "none", stroke: deep, "stroke-opacity": 0.45, "stroke-width": 1.4, "stroke-dasharray": "3 2" }));
      break;
    case "server":
      body = path("M12 5h40q5 0 5 5v48H7V10q0-5 5-5z", { fill: "url(#glassSteel)", ...rim })
        + path("M11 17h42M11 31h42M11 45h42", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.56, "stroke-width": sw })
        + circle(49, 23, 2, { fill: "#51ee8a" }) + circle(49, 37, 2, { fill: "#ffc74c" }) + circle(49, 51, 2, { fill: "#3aa5ff" });
      break;
    case "cards":
      body = path("M8 22h47v34H8z", { fill: "url(#glassGold)", ...rim })
        + path("M14 13h37v35H14z", { fill: "url(#paperGlass)", ...rim })
        + path("M22 7h29v34H22z", { fill: "url(#paperGlass)", ...rim });
      break;
    case "review":
      body = path("M10 7h32l11 11v38H10z", { fill: "url(#paperGlass)", ...rim })
        + path("M42 7v11h11", { fill: "#bad8eb", "fill-opacity": 0.74, ...rim })
        + circle(42, 42, 11, { fill: "url(#liquidLens)", ...rim })
        + line(50, 50, 58, 58, { stroke: deep, "stroke-width": 4.5, "stroke-linecap": "round" });
      break;
    case "search":
      body = path("M7 14h34v40H7z", { fill: "url(#paperGlass)", ...rim })
        + circle(39, 31, 14, { fill: "url(#liquidLens)", ...rim })
        + line(49, 42, 58, 51, { stroke: deep, "stroke-width": 5, "stroke-linecap": "round" });
      break;
    case "book":
    case "dictionary":
      body = path("M5 16q13-7 27 2v39q-13-8-27-2zM59 16q-13-7-27 2v39q13-8 27-2z", { fill: spec.body === "dictionary" ? "url(#glassGold)" : "url(#paperGlass)", ...rim })
        + path("M32 18v39", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.66, "stroke-width": sw });
      break;
    case "clock":
      body = path("M6 9h52v46H6z", { fill: "url(#paperGlass)", ...rim })
        + path("M11 13h20v5H11z", { fill: "url(#glassClear)", ...rim })
        + circle(40, 38, 13, { fill: "url(#glassViolet)", ...rim })
        + path("M40 30v9l7 4", { fill: "none", stroke: "#3b4a5c", "stroke-width": 3, "stroke-linecap": "round" });
      break;
    case "map":
      body = path("M5 17l17-8 20 7 17-8v39l-17 8-20-7-17 8zM22 9v39M42 16v39", { fill: "url(#glassClear)", ...rim })
        + path("M7 21l14-7M24 13l16 6M44 18l13-6", inner);
      break;
    case "stage":
      body = path("M7 11h50v38H7z", { fill: "url(#glassBlue)", ...rim })
        + path("M12 16h40v28H12z", { fill: "#ffffff", "fill-opacity": 0.24, ...rim })
        + path("M4 50h56v7H4z", { rx: 3.5, fill: "url(#glassSteel)", ...rim });
      break;
    case "easel":
      body = path("M6 8h52v48H6z", { fill: "url(#paperGlass)", ...rim })
        + path("M6 20h52M24 8v48M42 8v48", inner)
        + path("M11 50h7V38h-7zM29 50h7V30h-7zM47 50h7V42h-7z", { fill: "url(#glassBlue)", ...rim });
      break;
    case "cover":
      body = path("M12 6h40v52H12z", { fill: "url(#glassBlue)", ...rim })
        + path("M17 11h30v42H17z", { fill: "#ffffff", "fill-opacity": 0.3, ...rim })
        + path("M16 10l31 44", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.35, "stroke-width": 3 });
      break;
    case "swatches":
      body = path("M11 54l6-43h31l6 43z", { fill: "url(#glassSteel)", ...rim })
        + path("M17 18h31M15 29h35M14 40h38", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.5, "stroke-width": sw });
      break;
    case "speaker":
      body = path("M11 6h42v52H11z", { fill: "url(#darkGlass)", ...rim })
        + circle(32, 39, 15, { fill: "#0c1c2a", stroke: "#7ec8f6", "stroke-opacity": 0.72, "stroke-width": sw })
        + circle(32, 39, 7, { fill: "url(#glassViolet)", ...rim })
        + circle(32, 17, 4.5, { fill: "url(#glassClear)", ...rim });
      break;
    case "album":
      body = path("M9 6h46v52H9z", { fill: "url(#glassGold)", ...rim })
        + path("M15 12h34v39H15z", { fill: "url(#paperGlass)", ...rim })
        + path("M13 7v50", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.5, "stroke-width": 3 });
      break;
    case "inbox":
      body = path("M5 35h16l5 8h12l5-8h16v22H5z", { fill: toneFill, ...rim })
        + path("M12 7h40v38H12z", { fill: "url(#paperGlass)", ...rim })
        + path("M9 49h46", inner);
      break;
    case "controlBoard":
      body = path("M10 6h44l5 51H5z", { fill: "url(#glassSteel)", ...rim })
        + path("M14 12h36l4 38H10z", { fill: "#ffffff", "fill-opacity": 0.2, ...rim });
      break;
    case "network":
      body = path("M5 8h23v20H5zM36 8h23v20H36zM21 38h23v20H21z", { fill: toneFill, ...rim })
        + path("M16 28l16 10 15-10", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.72, "stroke-width": sw, "stroke-linejoin": "round" });
      break;
    case "monitor":
      body = path("M6 7h52v42H6z", { fill: "url(#glassSteel)", ...rim })
        + path("M11 12h42v31H11z", { fill: "url(#darkGlass)", ...rim })
        + path("M26 49h12v6h9v3H17v-3h9z", { fill: "url(#glassSteel)", ...rim });
      break;
    case "indexBox":
      body = path("M8 8h48v48H8z", { fill: "url(#paperGlass)", ...rim })
        + path("M8 20h48", inner)
        + path("M15 12h22v5H15z", { fill: "url(#glassClear)", ...rim })
        + path("M16 28h6v6h-6zM16 40h6v6h-6z", { fill: "url(#glassBlue)", ...rim })
        + path("M26 30h22M26 42h16", inner);
      break;
    case "press":
      body = path("M7 27h50v30H7z", { fill: "url(#glassBlue)", ...rim })
        + path("M15 6h34v34H15z", { fill: "url(#paperGlass)", ...rim })
        + path("M12 45h40M12 51h40", inner);
      break;
    case "stamp":
      body = path("M14 39h36l8 16H6z", { fill: "url(#glassRed)", ...rim })
        + path("M20 9h24v31H20z", { fill: "url(#glassGold)", ...rim })
        + path("M25 7h14", { fill: "none", stroke: "#6c421c", "stroke-width": 5, "stroke-linecap": "round" });
      break;
    case "terminal":
      body = path("M6 7h52v43H6z", { fill: "url(#glassSteel)", ...rim })
        + path("M11 12h42v32H11z", { fill: "url(#darkGlass)", ...rim })
        + path("M25 50h14v5h9v3H16v-3h9z", { fill: "url(#glassSteel)", ...rim });
      break;
    case "finderPair":
      body = path("M5 17h39v40H5z", { fill: "url(#glassViolet)", ...rim })
        + path("M21 7h38v42H21z", { fill: "url(#glassBlue)", ...rim })
        + path("M40 8v40", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.66, "stroke-width": sw });
      break;
    case "briefcase":
      body = path("M6 20h52v37H6z", { fill: "url(#glassBlue)", ...rim })
        + path("M20 20v-9h24v9M6 35h52", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.66, "stroke-width": sw })
        + rect(28, 32, 8, 8, { rx: 2, fill: "url(#glassClear)", ...rim });
      break;
    case "bell":
      body = path("M11 48h42c-7-8-8-15-8-24 0-18-26-18-26 0 0 9-1 16-8 24z", { fill: "url(#glassGold)", ...rim })
        + ellipse(32, 51, 24, 5, { fill: "#d9992d", "fill-opacity": 0.88, ...rim })
        + circle(32, 57, 3.5, { fill: "#8c591f" });
      break;
    case "chip":
      body = rect(20, 20, 24, 24, { rx: 5, fill: "url(#glassSteel)", ...rim })
        + rect(27, 27, 10, 10, { rx: 2, fill: "#ffffff", "fill-opacity": 0.24, ...rim })
        + path("M26 12v8M32 12v8M38 12v8M26 44v8M32 44v8M38 44v8M12 26h8M12 32h8M12 38h8M44 26h8M44 32h8M44 38h8", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.66, "stroke-width": sw, "stroke-linecap": "round" });
      break;
    case "strip":
      body = path("M6 22h40q12 0 12 10q0 10-12 10H6z", { fill: "url(#glassSteel)", ...rim })
        + path("M20 22v20M30 22v20M40 22v20", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.55, "stroke-width": sw })
        + path("M50 28v8", { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.8, "stroke-width": sw, "stroke-linecap": "round" });
      break;
    default:
      body = path("M9 7h46v51H9z", { rx: 10, fill: toneFill, ...rim });
  }
  const specular = detail === "small" ? "" : path("M15 14c8-5 23-6 34 0", inner);
  return shadow + body + specular + liquidGlassMark(spec, detail);
}

function renderSvg(theme, spec, size) {
  const detail = tier(size);
  const platinum = theme === "platinum";
  const view = platinum ? size : 64;
  const defs = eraDefs(theme, spec);
  const body = platinum
    ? platinumBody(spec, size)
    : theme === "aqua"
      ? aquaBody(spec, detail)
      : theme === "snow-leopard"
        ? snowLeopardBody(spec, detail)
        : theme === "yosemite"
          ? yosemiteBody(spec, detail)
          : liquidGlassBody(spec, detail);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${view} ${view}" shape-rendering="${platinum ? "crispEdges" : "geometricPrecision"}">`,
    ...(defs ? [defs] : []),
    body,
    "</svg>",
    "",
  ].join("\n");
}

// Liquid Glass appearances are material parameter sets over one owned layer
// geometry. They are emitted as separate SVG bytes; no CSS brightness, opacity,
// hue, or saturation filter stands in for a real Dark or Clear rendering.
function liquidAppearanceSvg(svg, appearance) {
  if (appearance === "default") return svg;
  const dark = new Map([
    ["#f2fbff", "#6f8da8"], ["#8ed8ff", "#3e6f98"], ["#2688e8", "#204f7d"], ["#1652b8", "#112e52"],
    ["#ffffff", "#dce9f5"], ["#edf7ff", "#7d93a7"], ["#a9c7dc", "#3f566d"],
    ["#d4e1ec", "#75899d"], ["#8299ad", "#3d5063"], ["#49637b", "#263747"],
    ["#fbf7ff", "#9d8db0"], ["#c8a9ff", "#66507f"], ["#7e55d8", "#443566"], ["#49339b", "#28213e"],
    ["#fff8f7", "#ae8d92"], ["#ffaca4", "#7a4f59"], ["#e34d58", "#68313d"], ["#a5273f", "#3c2029"],
    ["#f5fff7", "#8fa99a"], ["#91e7ad", "#4c765f"], ["#29a967", "#315943"], ["#147143", "#203b2e"],
    ["#fffdf5", "#b3a785"], ["#ffe18b", "#806a3f"], ["#e5a42f", "#654b27"], ["#9b6420", "#3d3020"],
    ["#f8fbff", "#a6b2be"], ["#cfdfeb", "#657584"], ["#17324d", "#d8e7f4"], ["#102d49", "#07111b"],
  ]);
  const clear = new Map([
    ["#8ed8ff", "#d7efff"], ["#2688e8", "#8fc6e8"], ["#1652b8", "#5d8faf"],
    ["#d4e1ec", "#edf6fc"], ["#8299ad", "#b9cfdf"], ["#49637b", "#7895aa"],
    ["#c8a9ff", "#eadfff"], ["#7e55d8", "#b6a2d8"], ["#49339b", "#82749a"],
    ["#ffaca4", "#ffe1de"], ["#e34d58", "#d9a2a8"], ["#a5273f", "#a2767d"],
    ["#91e7ad", "#d9f5e2"], ["#29a967", "#9ac9aa"], ["#147143", "#6d9a7e"],
    ["#ffe18b", "#fff1c1"], ["#e5a42f", "#d7bd78"], ["#9b6420", "#9f8254"],
    ["#17324d", "#426681"], ["#102d49", "#5b7488"],
  ]);
  const table = appearance === "dark" ? dark : clear;
  let output = svg;
  for (const [from, to] of table) output = output.replaceAll(from, to);
  if (appearance === "clear") {
    output = output
      .replaceAll('stop-opacity="0.98"', 'stop-opacity="0.78"')
      .replaceAll('stop-opacity="0.96"', 'stop-opacity="0.7"')
      .replaceAll('stop-opacity="0.94"', 'stop-opacity="0.64"')
      .replaceAll('stop-opacity="0.92"', 'stop-opacity="0.6"')
      .replaceAll('stop-opacity="0.9"', 'stop-opacity="0.58"')
      .replaceAll('fill-opacity="0.18"', 'fill-opacity="0.1"');
  }
  return output;
}


// The generated family goes on the same grid as the reviewed cores. These are
// vector drawings, so the object is measured by rasterising it once and then
// wrapped in one uniform transform; nothing is redrawn and nothing is
// stretched. Without this a desktop mixes reviewed icons that sit on the grid
// with generated ones that do not, which is exactly the jumble the grid exists
// to remove.
const GRID_PROBE = 256;

async function placeOnGrid(theme, id, svg, view) {
  const image = await loadImage(Buffer.from(svg));
  const probe = createCanvas(GRID_PROBE, GRID_PROBE);
  const ctx = probe.getContext("2d");
  ctx.drawImage(image, 0, 0, GRID_PROBE, GRID_PROBE);
  const box = inkBox(ctx, GRID_PROBE);
  if (!box) return { svg, grid: null };
  const toView = view / GRID_PROBE;
  const viewBox = {
    minX: box.minX * toView,
    minY: box.minY * toView,
    maxX: box.maxX * toView,
    maxY: box.maxY * toView,
    width: box.width * toView,
    height: box.height * toView,
  };
  const { scale, dx, dy, shape } = gridTransform(theme, id, viewBox, view);
  const fitted = (shape === "landscape" ? viewBox.width : shape === "portrait" ? viewBox.height : Math.max(viewBox.width, viewBox.height)) * scale;
  const open = svg.indexOf(">", svg.indexOf("<svg")) + 1;
  const close = svg.lastIndexOf("</svg>");
  const head = svg.slice(0, open);
  const content = svg.slice(open, close);
  const round = (value) => Number(value.toFixed(4));
  return {
    svg: `${head}\n<g transform="translate(${round(dx)} ${round(dy)}) scale(${round(scale)})">${content}</g>\n</svg>\n`,
    grid: { shape, fitted: round(fitted / view), scale: round(scale) },
  };
}

function assertUnique(theme, rendered) {
  const hashes = new Map();
  for (const [id, svg] of rendered) {
    const hash = createHash("sha256").update(svg.replace(/width="\d+" height="\d+"/, "")).digest("hex");
    if (hashes.has(hash)) throw new Error(`${theme}: ${id} duplicates ${hashes.get(hash)}`);
    hashes.set(hash, id);
  }
}

async function buildContactSheet(theme, manifest) {
  const outDir = join(root, "internal", "evidence", "drafts", "era-icons");
  mkdirSync(outDir, { recursive: true });
  const cols = 9;
  const cellW = 112;
  const cellH = 70;
  const rows = Math.ceil(ICONS.length / cols);
  const canvas = createCanvas(cols * cellW, rows * cellH + 42);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = theme === "platinum" ? "#cccccc" : (theme === "yosemite" || theme === "liquid-glass") ? "#f4f5f6" : "#e8edf1";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111820";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(`${theme} icon family`, 14, 26);
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "#44515c";
  ctx.fillText(`${ICONS.length} semantic objects at native 32 px; each also owns appearance-specific small and large variants`, 14, 39);
  for (let i = 0; i < ICONS.length; i += 1) {
    const spec = ICONS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = 42 + row * cellH;
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,.56)" : "rgba(255,255,255,.78)";
    ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
    const img = await loadImage(join(root, "apps", "desktop", "assets", "themes", theme, manifest[spec.id]));
    ctx.imageSmoothingEnabled = theme !== "platinum";
    ctx.drawImage(img, x + 8, y + 8, 32, 32);
    ctx.fillStyle = "#1e2730";
    ctx.font = "10px sans-serif";
    ctx.fillText(spec.id, x + 5, y + 57, cellW - 10);
  }
  writeFileSync(join(outDir, `${theme}-contact-sheet.png`), canvas.toBuffer("image/png"));
}

async function buildLiquidAppearanceSheet() {
  const theme = "liquid-glass";
  const family = JSON.parse(readFileSync(join(root, "apps/desktop/assets/themes/liquid-glass/liquid-glass-icon-family.json"), "utf8"));
  const columns = 9;
  const cellWidth = 112;
  const cellHeight = 62;
  const rows = Math.ceil(ICONS.length / columns);
  const sectionHeight = 38 + rows * cellHeight;
  const canvas = createCanvas(columns * cellWidth, 56 + sectionHeight * 3);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111923";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f2f7fb";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("Liquid Glass complete family · Default / Dark / Clear", 14, 27);
  ctx.fillStyle = "#a9b9c8";
  ctx.font = "11px sans-serif";
  ctx.fillText("56 objects · native 32 px appearance files · same semantic layer geometry, independently parameterised material", 14, 45);
  const appearances = [
    ["default", "Default", "#dce8f2"],
    ["dark", "Dark", "#152230"],
    ["clear", "Clear · high-frequency check", "#8597a8"],
  ];
  for (let appearanceIndex = 0; appearanceIndex < appearances.length; appearanceIndex += 1) {
    const [appearance, label, background] = appearances[appearanceIndex];
    const top = 56 + appearanceIndex * sectionHeight;
    ctx.fillStyle = background;
    ctx.fillRect(0, top, canvas.width, sectionHeight);
    if (appearance === "clear") {
      for (let y = top; y < top + sectionHeight; y += 12) {
        for (let x = 0; x < canvas.width; x += 12) {
          ctx.fillStyle = (Math.floor(x / 12) + Math.floor((y - top) / 12)) % 2 ? "#aab8c4" : "#718798";
          ctx.fillRect(x, y, 12, 12);
        }
      }
    }
    ctx.fillStyle = appearance === "dark" ? "#edf5fc" : "#16212b";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(label, 14, top + 24);
    for (let index = 0; index < ICONS.length; index += 1) {
      const id = ICONS[index].id;
      const file = family.icons[id].appearanceSizes[`32-${appearance}`];
      const image = await loadImage(join(root, "apps/desktop/assets/themes/liquid-glass", file));
      const x = (index % columns) * cellWidth;
      const y = top + 38 + Math.floor(index / columns) * cellHeight;
      ctx.drawImage(image, x + 8, y + 3, 40, 40);
      ctx.fillStyle = appearance === "dark" ? "#dce8f2" : "#17232d";
      ctx.font = "9px sans-serif";
      ctx.fillText(id, x + 4, y + 56, cellWidth - 8);
    }
  }
  writeFileSync(join(root, "internal/evidence/drafts/era-icons/liquid-glass-family-appearance-board.png"), canvas.toBuffer("image/png"));
}

async function buildSprite(theme, manifest) {
  const cols = 8;
  const cell = 32;
  const rows = Math.ceil(ICONS.length / cols);
  const canvas = createCanvas(cols * cell, rows * cell);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const positions = {};
  for (let i = 0; i < ICONS.length; i += 1) {
    const id = ICONS[i].id;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const img = await loadImage(join(root, "apps", "desktop", "assets", "themes", theme, manifest[id]));
    ctx.drawImage(img, col * cell, row * cell, cell, cell);
    positions[id] = { x: -col * cell, y: -row * cell };
  }
  const dir = join(root, "apps", "desktop", "assets", "themes", theme);
  writeFileSync(join(dir, `${theme}-sprite.png`), canvas.toBuffer("image/png"));
  writeFileSync(join(dir, `${theme}-sprite-positions.json`), `${JSON.stringify(positions, null, 2)}\n`);
}

async function validateTheme(theme, familyManifest) {
  for (const [id, entry] of Object.entries(familyManifest.icons)) {
    for (const [sizeText, file] of Object.entries(entry.sizes)) {
      const size = Number(sizeText);
      const image = await loadImage(join(root, "apps", "desktop", "assets", "themes", theme, file));
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = theme !== "platinum";
      ctx.drawImage(image, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let opaque = 0;
      let minX = size;
      let minY = size;
      let maxX = -1;
      let maxY = -1;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 8) continue;
        opaque += 1;
        const pixel = index / 4;
        const x = pixel % size;
        const y = Math.floor(pixel / size);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (opaque < Math.max(8, size * size * 0.025)) throw new Error(`${theme}/${id}/${size}: insufficient rendered coverage`);
      if (maxX - minX < size * 0.2 || maxY - minY < size * 0.2) throw new Error(`${theme}/${id}/${size}: collapsed bounds`);
    }
  }
}

async function buildTheme(theme, config) {
  const dir = join(root, "apps", "desktop", "assets", "themes", theme);
  mkdirSync(dir, { recursive: true });
  const completeFamily = theme === "platinum" || theme === "liquid-glass";
  const runtimeManifest = {};
  const familyManifest = {
    target: JSON.parse(readFileSync(join(root, "apps", "desktop", "assets", "themes", "era-icon-reference.json"), "utf8")).themes[theme].target,
    generatedBy: "tooling/build-era-icons.mjs",
    sharedGeometryAcrossEras: false,
    completeFamily,
    reviewedFamily: completeFamily ? ICONS.map(({ id }) => id) : [],
    fallback: completeFamily ? [] : ICONS.map(({ id }) => id),
    // The manifest is a stable semantic compatibility mapping. The active
    // renderer chooses an authored 16, 32, or 128 px raster by context.
    runtimeSize: "contextual",
    runtimeSizesByContext: { compactMenuList: 16, ordinary: 32, desktopLargeRetina: 128 },
    compatibilityManifest: config.manifest,
    compatibilityManifestMeaning: "Stable semantic mapping only; app/core/system-icons.js selects the authored runtime tier by rendering context.",
    runtimeDispatch: "apps/desktop/app/core/system-icons.js",
    icons: {}
  };
  const rendered32 = new Map();
  const gridReport = new Map();
  for (const spec of ICONS) {
    const files = {};
    const appearanceSizes = {};
    for (const size of config.sizes) {
      const file = `${fileStem(theme, spec.id)}-${size}.svg`;
      const view = theme === "platinum" ? size : 64;
      const placed = await placeOnGrid(theme, spec.id, renderSvg(theme, spec, size), view);
      const svg = placed.svg;
      writeFileSync(join(dir, file), svg);
      if (theme === "liquid-glass") {
        for (const appearance of ["default", "dark", "clear"]) {
          const appearanceFile = `${fileStem(theme, spec.id)}-${size}-${appearance}.svg`;
          writeFileSync(join(dir, appearanceFile), liquidAppearanceSvg(svg, appearance));
          appearanceSizes[`${size}-${appearance}`] = appearanceFile;
        }
      }
      if (size === 32) gridReport.set(spec.id, placed.grid);
      files[size] = file;
      if (size === 32) {
        runtimeManifest[spec.id] = file;
        rendered32.set(spec.id, svg);
      }
    }
    familyManifest.icons[spec.id] = {
      genre: spec.genre,
      grid: gridReport.get(spec.id) || null,
      physicalMetaphor: spec.body,
      semanticMark: spec.symbol,
      sourceKind: completeFamily
        ? "era-specific-independent-vector-construction"
        : "shared-generated-fallback",
      reviewStatus: completeFamily ? "accepted-family" : "fallback",
      sizes: files,
      ...(theme === "liquid-glass" ? { appearanceSizes } : {}),
    };
  }
  assertUnique(theme, rendered32);
  if (Object.keys(runtimeManifest).length !== ICONS.length) throw new Error(`${theme}: incomplete runtime manifest`);
  writeFileSync(join(dir, config.manifest), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
  writeFileSync(join(dir, `${theme}-icon-family.json`), `${JSON.stringify(familyManifest, null, 2)}\n`);
  await validateTheme(theme, familyManifest);
  if (theme === "aqua" || theme === "snow-leopard") await buildSprite(theme, runtimeManifest);
  await buildContactSheet(theme, runtimeManifest);
  console.log(`${theme}: ${ICONS.length} icons, sizes ${config.sizes.join("/")}`);
}

function requestedThemes() {
  const args = process.argv.slice(2);
  if (!args.length) return Object.keys(THEMES);
  const requested = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index] === "--theme" ? args[++index] : args[index].replace(/^--theme=/, "");
    if (!THEMES[value]) throw new Error(`Unknown icon theme ${value}. Expected one of: ${Object.keys(THEMES).join(", ")}`);
    requested.push(value);
  }
  return [...new Set(requested)];
}

const selectedThemes = requestedThemes();
for (const theme of selectedThemes) await buildTheme(theme, THEMES[theme]);

// The broad legacy and measured core generators remain deterministic
// reconstruction layers. Reapply the complete accepted generated family last
// so a full rebuild cannot expose those older pixels on any runtime surface.
// Keep these imports explicit. Besides making the rebuild order auditable, the
// acceptance contracts pin every reviewed-core builder by name so a future
// refactor cannot silently omit one era from the final overlay pass.
if (selectedThemes.includes("platinum")) await import("./build-platinum-core-icons.mjs");
if (selectedThemes.includes("aqua")) await import("./build-aqua-core-icons.mjs");
if (selectedThemes.includes("snow-leopard")) await import("./build-snow-leopard-core-icons.mjs");
if (selectedThemes.includes("yosemite")) await import("./build-yosemite-core-icons.mjs");
if (selectedThemes.includes("liquid-glass")) await import("./build-liquid-glass-imagegen-icons.mjs");

// Platinum's complete accepted ImageGen family is the broad authoring source.
// Apply it before the narrower historically approved Finder overlay below.
if (selectedThemes.includes("platinum")) await import("./build-platinum-imagegen-icons.mjs");

// Draft candidates are never accepted implicitly. This last overlay reads
// only the checked-in human acceptance ledger and checked-in accepted source
// archive, verifies every PNG hash, and restores those reviewed bytes after
// the broad fallback and core builders.
const { buildAcceptedGeneratedIcons } = await import("./build-accepted-generated-era-icons.mjs");
await buildAcceptedGeneratedIcons(selectedThemes);

// Historical acceptance is a separate, later gate. Only eras with an
// explicitly approved Finder ImageGen master are eligible for this overlay;
// generated candidates that failed evidence or compact-size review never ship.
const approvedFinderThemes = selectedThemes.filter((theme) => ["platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"].includes(theme));
if (approvedFinderThemes.length) {
  const { buildApprovedFinderLineage } = await import("./build-approved-finder-lineage.mjs");
  await buildApprovedFinderLineage(approvedFinderThemes);
}

// Rows beyond Finder cross the historical gate independently. This overlay is
// deliberately narrow and ledger-driven: a generated candidate is not
// eligible merely because generation or technical cleanup succeeded.
const approvedPriorityThemes = selectedThemes.filter((theme) => ["platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"].includes(theme));
if (approvedPriorityThemes.length) {
  const { buildApprovedPriorityLineage } = await import("./build-approved-priority-lineage.mjs");
  await buildApprovedPriorityLineage(approvedPriorityThemes);
}

// Contact sheets resolve after every authoring overlay so they show the exact
// bytes users receive, including historically pending assets.
for (const theme of selectedThemes) {
  const manifest = JSON.parse(readFileSync(join(root, "apps", "desktop", "assets", "themes", theme, THEMES[theme].manifest), "utf8"));
  await buildContactSheet(theme, manifest);
}
if (selectedThemes.includes("liquid-glass")) await buildLiquidAppearanceSheet();
