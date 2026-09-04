// Bonsai City + Micropolis shared RCI demand gauge / 共享 RCI 需求仪表.
// One drawing core for both games (design decision 3). The two games differ
// by era and by where they mount the gauge; the bar algorithm is shared.
// Inputs are already normalized to -1..1 by each caller (Micropolis divides
// its valves, Bonsai divides demandValue()). This module is headless and
// pure up to draw(): no DOM, no wall clock, no randomness, no CSS reads.
window.AISystem6CityDemandGaugeLoaded = true;

(function initCityDemandGauge() {
  "use strict";

  // A fraction this small is read as "no demand" so the zero line does not
  // wobble on a ±2% drift (the engine's own noise floor).
  const DEADBAND = 0.03;

  const TIERS = Object.freeze({
    "micropolis-panel": { width: 58, height: 36, barWidth: 10, gap: 8, labels: true },
    "bonsai-panel": { width: 72, height: 44, barWidth: 12, gap: 10, labels: true },
    "gauge-bar": { width: 32, height: 20, barWidth: 6, gap: 4, labels: false },
  });

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  // bars({ r, c, i }) -> [{ id:"residential", fraction }, ...]. Pure.
  function bars(values) {
    const source = {
      residential: Number(values && values.r) || 0,
      commercial: Number(values && values.c) || 0,
      industrial: Number(values && values.i) || 0,
    };
    return Object.keys(source).map((id) => {
      const raw = source[id];
      const fraction = Math.abs(raw) < DEADBAND ? 0 : clamp(raw, -1, 1);
      return { id, fraction };
    });
  }

  // 5-px pixel glyphs for R, C, I (original, hand-authored; CC0 for this repo).
  // Each is a 5x7 map of '.'=transparent and '#'=ink.
  const GLYPHS = Object.freeze({
    R: [
      "#####",
      "#...#",
      "#...#",
      "####.",
      "#.#..",
      "#..#.",
      "#...#",
    ],
    C: [
      ".####",
      "#....",
      "#....",
      "#....",
      "#....",
      "#....",
      ".####",
    ],
    I: [
      "#####",
      "..#..",
      "..#..",
      "..#..",
      "..#..",
      "..#..",
      "#####",
    ],
  });

  function drawGlyph(ctx, glyph, left, top, color) {
    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y].length; x += 1) {
        if (glyph[y][x] === "#") {
          ctx.fillStyle = color;
          ctx.fillRect(left + x, top + y, 1, 1);
        }
      }
    }
  }

  // draw(canvas, tier, values, opts). DPR-aware like the legacy drawRciGauge
  // it replaces. opts: { colors: {r,c,i}, ink, highlight }.
  function draw(canvas, tier, values, opts) {
    const spec = TIERS[tier];
    if (!canvas || !spec) return;
    const dpr = Math.max(1, Math.min(2, Number((typeof window !== "undefined" && window.devicePixelRatio) || 1)));
    const width = spec.width;
    const height = spec.height;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const colors = (opts && opts.colors) || { r: "#000", c: "#000", i: "#000" };
    const ink = (opts && opts.ink) || "#000";
    const highlight = opts && opts.highlight;

    // 1-px inset frame in ink.
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, width, 1);
    ctx.fillRect(0, height - 1, width, 1);
    ctx.fillRect(0, 0, 1, height);
    ctx.fillRect(width - 1, 0, 1, height);

    // Bar field. Labels (panel tiers) get an 8-px strip at the bottom for the
    // R/C/I glyphs, so the zero line and bars are centered above it.
    const labelZone = spec.labels ? 8 : 0;
    const fieldTop = 3;
    const fieldBottom = height - 2 - labelZone;
    const fieldLeft = 8;
    const fieldWidth = width - fieldLeft * 2;
    const zeroY = fieldTop + Math.floor((fieldBottom - fieldTop) / 2);
    const half = Math.max(3, fieldBottom - zeroY);

    // "+" (3x3 cross) top-left, "−" (3x1) bottom-left, in ink.
    ctx.fillStyle = ink;
    ctx.fillRect(2, fieldTop + 1, 3, 1);
    ctx.fillRect(3, fieldTop, 1, 3);
    ctx.fillRect(2, fieldBottom - 1, 3, 1);

    // Zero line across the bar field (never punctured: bars start at zeroY+1
    // downward and end at zeroY-1 upward).
    ctx.fillStyle = ink;
    ctx.fillRect(fieldLeft, zeroY, fieldWidth, 1);

    const list = bars(values);
    const totalGap = spec.gap * (list.length - 1);
    const barStart = fieldLeft + Math.floor((fieldWidth - (spec.barWidth * list.length + totalGap)) / 2);
    const colorOrder = { residential: colors.r, commercial: colors.c, industrial: colors.i };
    const glyphOrder = { residential: "R", commercial: "C", industrial: "I" };

    list.forEach((bar, index) => {
      const x = barStart + index * (spec.barWidth + spec.gap);
      const px = Math.round(bar.fraction * half);
      const col = colorOrder[bar.id] || ink;
      // Up = demand; down = oversupply. Up ends at zeroY-1, down starts at
      // zeroY+1 so the zero line is never punctured.
      if (px > 0) {
        ctx.fillStyle = col;
        ctx.fillRect(x, zeroY - px, spec.barWidth, px);
      } else if (px < 0) {
        ctx.fillStyle = col;
        ctx.fillRect(x, zeroY + 1, spec.barWidth, -px);
      }
      // Highlight outline (2-px ink) around this bar (M5 blink).
      if (highlight === bar.id) {
        ctx.fillStyle = ink;
        const hx = x - 2;
        const hy = zeroY - (px > 0 ? px : 0) - 2;
        const hw = spec.barWidth + 4;
        const hh = Math.abs(px) + 4;
        ctx.fillRect(hx, hy, hw, 1);
        ctx.fillRect(hx, hy + hh - 1, hw, 1);
        ctx.fillRect(hx, hy, 1, hh);
        ctx.fillRect(hx + hw - 1, hy, 1, hh);
      }
      // Label glyph under the bar (panel tiers only).
      if (spec.labels) {
        drawGlyph(ctx, GLYPHS[glyphOrder[bar.id]], x + Math.floor((spec.barWidth - 5) / 2), height - labelZone + 1, ink);
      }
    });
  }

  window.AISystem6CityDemandGauge = Object.freeze({
    bars,
    draw,
    TIERS,
  });
})();
