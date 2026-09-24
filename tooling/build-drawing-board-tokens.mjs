#!/usr/bin/env node
// Drawing Board's colour tokens, derived from Platinum's.
//
// Drawing Board is an Appearance Manager theme: the same controls as Platinum,
// drawn in pencil on warm drafting paper. So its palette is Platinum's grey
// ramp re-mapped onto the colours the theme itself declares, read from the
// .uis colour table in the reference package
// (internal/evidence/drafts/drawing-board/README.zh-CN.md): button face
// 206,199,189; light 231,227,222; shadow 149,134,113; window 237,227,218;
// highlight 255,252,223; info window 247,215,132; desktop 198,181,165.
//
// Every declaration in Platinum's token block that names a mapped colour is
// copied with the colour swapped, into the marked region of
// styles/65-drawing-board-appearance.css. Nothing else in that file is touched.
//
// Usage: node tooling/build-drawing-board-tokens.mjs [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PLATINUM = join(root, "apps/desktop/styles/65-appearance-themes.css");
const TARGET = join(root, "apps/desktop/styles/65-drawing-board-appearance.css");
const BEGIN = "  /* BEGIN derived from Platinum by tooling/build-drawing-board-tokens.mjs */";
const END = "  /* END derived from Platinum */";

const MAP = new Map(Object.entries({
  "#ffffff": "#f4efe7", "#f6f6f6": "#efe9e1", "#eeeeee": "#e7e3de", "#dddddd": "#cec7bd",
  "#cccccc": "#c0b6aa", "#bbbbbb": "#b2a697", "#aaaaaa": "#a59888", "#9a9a9a": "#958671",
  "#999999": "#958671", "#888888": "#857765", "#777777": "#75685a", "#707070": "#6d6154",
  "#6f6f6f": "#6d6154", "#666666": "#665a4d", "#555555": "#574c41", "#444444": "#463d34",
  "#333333": "#3a3129", "#111111": "#1d1813",
  // Platinum's lavender accent becomes the theme's pale yellow highlight,
  // and its darker accents the pencil shadow.
  "#ccccff": "#fffcdf", "#9999ff": "#f7d784", "#6666cc": "#958671", "#333399": "#574c41",
  "#4a71ab": "#958671", "#ffffcc": "#f7d784",
}));

function platinumTokenBlock() {
  const css = readFileSync(PLATINUM, "utf8");
  const start = css.indexOf('html[data-lineage~="platinum"],\nbody[data-lineage~="platinum"] {');
  if (start < 0) throw new Error("Platinum token block not found");
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}" && (depth -= 1) === 0) return css.slice(open + 1, index);
  }
  throw new Error("Platinum token block is not closed");
}

function derive() {
  const body = platinumTokenBlock().replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = [];
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim();
    // Theme Lab replica tokens are lab furniture, not the era; Drawing Board
    // inherits Platinum's through its lineage and dresses no replica itself.
    if (!name.startsWith("--") || name.startsWith("--theme-lab-")) continue;
    const value = declaration.slice(colon + 1).trim().replace(/\s+/g, " ");
    let changed = false;
    const swapped = value.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (hex) => {
      const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
      const next = MAP.get(full.toLowerCase());
      if (!next) return hex;
      changed = true;
      return next;
    });
    if (changed) lines.push(`  ${name}: ${swapped};`);
  }
  return lines;
}

const current = readFileSync(TARGET, "utf8");
const from = current.indexOf(BEGIN);
const to = current.indexOf(END);
if (from < 0 || to < 0) throw new Error(`${TARGET} has no derived-token markers`);
const next = `${current.slice(0, from + BEGIN.length)}\n${derive().join("\n")}\n${current.slice(to)}`;
if (process.argv.includes("--check")) {
  if (next !== current) {
    console.error("NO  Drawing Board's derived tokens are stale; run node tooling/build-drawing-board-tokens.mjs");
    process.exit(1);
  }
  console.log("OK  Drawing Board's derived tokens match Platinum");
} else {
  writeFileSync(TARGET, next);
  console.log(`Derived ${derive().length} Drawing Board tokens from Platinum`);
}
