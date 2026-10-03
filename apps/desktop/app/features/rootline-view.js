// Rootline / 根线 — the map: drawing and gestures.
//
// Reads the core's state and never writes it; every change the player makes
// leaves here as a command through `hooks.apply`. One canvas, redrawn each
// frame from the state, so the picture is always what the rules say.
//
// Two readings of the same map (spec §5): a one-bit appearance (the theme's
// "one-bit-chrome" capability) draws it like a MacDraw plate, telling lines
// apart by pattern; every other appearance draws line colours on its own
// paper and ink.
//
// Three ways a line is drawn (Basin plan 「玩法与规则」): the metro in solid
// colour on 45-degree runs; the BRT at right angles, its colour band carrying
// a paper core like the road it runs on; the bus as a thin ink line with its
// route number at the ends. Red is not a line colour: it belongs to the
// avenues' bus lanes.
//
// On a pot handed over from Bonsai City the map opens with the cartographic
// transition: the city's own zones settle into the stations, its rail
// straightens into the grey existing lines and its water pools into the
// shapes the tunnels are counted against (playIntro, below).
(function installRootlineView(root) {
  "use strict";

  const TAU = Math.PI * 2;

  // ----- palette and line styles ----------------------------------------

  // Green, purple, cyan, magenta, blue, amber, brown.
  const LINE_COLORS = ["#2d9a48", "#8c46b2", "#149bb2", "#c8338a", "#1f6fd1", "#e9a115", "#8a5a33"];
  const LINE_COLORS_DARK = ["#5fd07c", "#c285ef", "#4fd3e8", "#ff70c2", "#63a4ff", "#ffc24d", "#d19a6a"];
  // The avenue's centre lanes, the one red on the map.
  const AVENUE_RED = "rgba(216, 50, 43, 0.16)";
  const AVENUE_RED_DARK = "rgba(255, 107, 95, 0.2)";

  function lineColor(slot, look, mode = "metro") {
    if (look.mono || mode === "bus") return look.ink;
    return (look.dark ? LINE_COLORS_DARK : LINE_COLORS)[slot % LINE_COLORS.length];
  }

  function tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  }

  // Seven lines, seven patterns: the way a 1-bit map tells them apart. The
  // BRT is a hollow band (a paper core), the bus a thin ink line, in both.
  function strokeLine(ctx, pts, slot, w, look, alpha = 1, mode = "metro") {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const ink = lineColor(slot, look, mode);
    const paper = look.paper;
    const s = (width, color, dash = [], cap = "round") => {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineCap = cap;
      tracePath(ctx, pts);
      ctx.stroke();
    };
    if (mode === "bus") {
      s(w * 0.45, ink);
    } else if (mode === "brt") {
      s(w, ink);
      s(w * (look.mono ? 0.55 : 0.34), paper);
    } else if (!look.mono) {
      s(w, ink);
    } else {
      switch (slot % 7) {
        case 0: s(w, ink); break;
        case 1: s(w * 0.42, ink); s(w, ink, [w * 2.2, w * 1.2], "butt"); break;
        case 2: s(w, ink); s(w * 0.42, paper); break;
        case 3: s(w * 0.3, ink); s(w * 1.05, ink, [0.01, w * 1.45]); break;
        case 4: s(w * 0.42, ink); s(w, ink, [w * 2.6, w * 0.9, 0.01, w * 0.9]); break;
        case 5: s(w * 0.34, ink); s(w * 1.45, ink, [w * 0.32, w * 0.85], "butt"); break;
        default: s(w, ink); s(w * 0.6, paper); s(w * 0.2, ink, [w * 0.9, w * 0.9], "butt"); break;
      }
    }
    ctx.restore();
  }

  // ----- glyphs ---------------------------------------------------------
  //
  // The land-use pictograms are the world's (app/core/pot-world.js), shared
  // with Bonsai City and Joyride: drawGlyph(ctx, kind, x, y, size, color, filled).

  const drawGlyph = root.AISystem6PotWorld.landUse.drawGlyph;

  // ----- geometry helpers -----------------------------------------------

  function cleanPoints(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i += 1) {
      const p = out[out.length - 1];
      if (Math.hypot(pts[i].x - p.x, pts[i].y - p.y) > 0.01) out.push(pts[i]);
    }
    return out;
  }

  // Shift a polyline sideways by `d` (left of travel), mitring the joins.
  function offsetPolyline(pts, d) {
    const p = cleanPoints(pts);
    if (p.length < 2 || !d) return p;
    const normals = [];
    for (let i = 1; i < p.length; i += 1) {
      const dx = p[i].x - p[i - 1].x;
      const dy = p[i].y - p[i - 1].y;
      const len = Math.hypot(dx, dy) || 1;
      normals.push({ x: -dy / len, y: dx / len });
    }
    const out = [{ x: p[0].x + normals[0].x * d, y: p[0].y + normals[0].y * d }];
    for (let i = 1; i < p.length - 1; i += 1) {
      const a = normals[i - 1];
      const b = normals[i];
      const mx = a.x + b.x;
      const my = a.y + b.y;
      const ml = Math.hypot(mx, my) || 1;
      const cos = (a.x * mx + a.y * my) / ml;
      const k = d / Math.max(0.35, cos);
      out.push({ x: p[i].x + (mx / ml) * k, y: p[i].y + (my / ml) * k });
    }
    const last = normals[normals.length - 1];
    out.push({ x: p[p.length - 1].x + last.x * d, y: p[p.length - 1].y + last.y * d });
    return out;
  }

  function distToSegment(p, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  }

  function distToPolyline(p, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i += 1) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
    return best;
  }

  function crossingPoints(a, b, river) {
    const out = [];
    for (let j = 1; j < river.length; j += 1) {
      const c = river[j - 1];
      const d = river[j];
      const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (!den) continue;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    }
    return out;
  }

  // A critically damped spring from 0 to 1: it arrives and stays, with no
  // overshoot to wobble back from. omega sets how quickly.
  function spring(t, omega) {
    if (t <= 0) return 0;
    const x = omega * t;
    return 1 - (1 + x) * Math.exp(-x);
  }

  // A closed ring cut twice at its corners (Chaikin), so a pot's water reads
  // as a river and a shore, not a staircase of tiles. Drawing only: tunnels
  // are counted against the exact tile outline, which this never strays from
  // by more than half a tile.
  function smoothRing(pts, passes = 2) {
    let ring = pts;
    for (let pass = 0; pass < passes && ring.length >= 3; pass += 1) {
      const out = [];
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      ring = out;
    }
    return ring;
  }

  function traceRing(ctx, pts) {
    if (pts.length < 3) return;
    const ring = smoothRing(pts);
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
  }

  function oneBit() {
    const theme = root.AISystem6Theme;
    if (typeof theme?.hasCapability === "function") return theme.hasCapability("one-bit-chrome") === true;
    return (root.document?.body?.dataset?.theme || "classic") === "classic";
  }

  // ----- the view -------------------------------------------------------

  function create({ canvas, core, hooks }) {
    const ctx = canvas.getContext("2d");
    const view = {
      w: 1,
      h: 1,
      dpr: 1,
      cam: { x: 800, y: 500, scale: 0.6 },
      user: { zoom: 1, panX: 0, panY: 0 },
      fitted: false,
      pointers: new Map(),
      gesture: null,
      hover: null,
      selectedLine: 0,
      pointerWorld: null,
      ghostPattern: null,
      waterPattern: null,
      lastLook: "",
      seenLines: new Map(),
      seenStations: new Map(),
      inset: 0,
      intro: null,
      introStats: null,
    };

    function ui() {
      return Math.max(0.86, Math.min(1.3, Math.min(view.w, view.h) / 520));
    }

    function toScreen(p) {
      return { x: (p.x - view.cam.x) * view.cam.scale + view.w / 2, y: (p.y - view.cam.y) * view.cam.scale + view.h / 2 };
    }

    function toWorld(p) {
      return { x: (p.x - view.w / 2) / view.cam.scale + view.cam.x, y: (p.y - view.h / 2) / view.cam.scale + view.cam.y };
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      view.w = Math.max(1, rect.width);
      view.h = Math.max(1, rect.height);
      view.dpr = dpr;
      const bw = Math.round(view.w * dpr);
      const bh = Math.round(view.h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
    }

    // ----- camera: the city frames itself as it grows --------------------

    function targetCamera(game) {
      const pts = game.stations.length ? game.stations : [game.city.center];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      const pad = 150;
      const bw = Math.max(420, maxX - minX + pad * 2);
      const bh = Math.max(300, maxY - minY + pad * 2);
      // A panel docked on the left (the start screen) leaves the city the
      // rest of the width; frame it there rather than under the panel.
      const width = Math.max(1, view.w - view.inset);
      const scale = Math.max(0.18, Math.min(3.2, Math.min(width / bw, view.h / bh) * view.user.zoom));
      return {
        x: (minX + maxX) / 2 + view.user.panX - view.inset / 2 / scale,
        y: (minY + maxY) / 2 + view.user.panY,
        scale,
      };
    }

    function updateCamera(game, dt) {
      const t = targetCamera(game);
      if (!view.fitted) {
        Object.assign(view.cam, t);
        view.fitted = true;
        return;
      }
      // Hold still while the player is drawing: a map that slides under the
      // finger turns a drag into a miss.
      if (view.gesture && view.gesture.mode !== "pan" && view.gesture.mode !== "pinch") return;
      const k = 1 - Math.exp(-dt * 3.2);
      view.cam.x += (t.x - view.cam.x) * k;
      view.cam.y += (t.y - view.cam.y) * k;
      view.cam.scale += (t.scale - view.cam.scale) * k;
    }

    // ----- shared legs: parallel lines sit side by side ------------------

    // Lines share a leg's shape only within a vehicle family: a metro leg is
    // a 45-degree run, a road leg follows the streets, so they are offset
    // side by side per station pair and family.
    const familyOf = (mode) => (core.isRoad(mode) ? "road" : "rail");
    const pairKey = (a, b, mode) => `${a < b ? `${a}-${b}` : `${b}-${a}`}:${familyOf(mode)}`;

    function legOffsets(game) {
      const byPair = new Map();
      for (const record of game.lines) {
        const mode = core.modeOfLine(record);
        const n = record.loop ? record.stops.length : record.stops.length - 1;
        for (let i = 0; i < n; i += 1) {
          const key = pairKey(record.stops[i], record.stops[(i + 1) % record.stops.length], mode);
          if (!byPair.has(key)) byPair.set(key, []);
          byPair.get(key).push(record.slot);
        }
      }
      for (const list of byPair.values()) list.sort((x, y) => x - y);
      return byPair;
    }

    function legScreen(game, a, b, slot, offsets, w, mode = "metro") {
      const pts = core.legPath(game, a, b, mode).map(toScreen);
      const key = pairKey(a.id, b.id, mode);
      const list = offsets.get(key) || [slot];
      const k = list.indexOf(slot);
      const shift = (k - (list.length - 1) / 2) * w * 1.15;
      // Offset relative to the canonical direction, so both travel
      // directions agree on which side a line is on.
      const canonical = a.id < b.id ? pts : [...pts].reverse();
      const moved = offsetPolyline(canonical, shift);
      return a.id < b.id ? moved : moved.reverse();
    }

    // ----- look -----------------------------------------------------------

    function look() {
      const style = root.getComputedStyle ? root.getComputedStyle(canvas) : null;
      const paper = (style && style.getPropertyValue("--paper").trim()) || "#ffffff";
      const ink = (style && style.getPropertyValue("--ink").trim()) || "#000000";
      const theme = root.document?.body?.dataset?.theme || "classic";
      const dark = root.AISystem6Theme?.getResolvedColorMode?.() === "dark";
      return { mono: oneBit(), dark, paper, ink, theme };
    }

    function ditherPattern(lk) {
      const key = `${lk.ink}|${lk.paper}|${lk.mono}|${lk.dark}`;
      if (view.waterPattern && view.lastLook === key) return view.waterPattern;
      const tile = root.document.createElement("canvas");
      tile.width = 4;
      tile.height = 4;
      const t = tile.getContext("2d");
      t.fillStyle = lk.paper;
      t.fillRect(0, 0, 4, 4);
      t.fillStyle = lk.ink;
      // A quarter-tone dither, the way System 6 drew water.
      for (const [x, y] of [[0, 0], [2, 2]]) t.fillRect(x, y, 1, 1);
      view.waterPattern = ctx.createPattern(tile, "repeat");
      view.lastLook = key;
      return view.waterPattern;
    }

    // A 96 px tile of sparse specks, deterministic, a few percent of ink.
    function paperGrain(lk) {
      const key = `${lk.ink}|${lk.paper}|${lk.dark}`;
      if (view.grainPattern && view.grainKey === key) return view.grainPattern;
      const size = 96;
      const tile = root.document.createElement("canvas");
      tile.width = size;
      tile.height = size;
      const t = tile.getContext("2d");
      let seed = 0x2f6b1d;
      const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      t.fillStyle = lk.dark ? "rgba(255,255,255,0.05)" : "rgba(60,50,30,0.06)";
      for (let i = 0; i < 520; i += 1) t.fillRect(Math.floor(next() * size), Math.floor(next() * size), 1, 1);
      view.grainPattern = ctx.createPattern(tile, "repeat");
      view.grainKey = key;
      return view.grainPattern;
    }

    // ----- drawing ----------------------------------------------------------

    function drawRiver(game, lk) {
      const pts = game.city.river.map(toScreen);
      const width = core.RULES.riverHalfWidth * 2 * view.cam.scale;
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (lk.mono) {
        ctx.lineWidth = width + 3;
        ctx.strokeStyle = lk.ink;
        tracePath(ctx, pts);
        ctx.stroke();
        ctx.lineWidth = width;
        ctx.strokeStyle = lk.paper;
        tracePath(ctx, pts);
        ctx.stroke();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.lineWidth = width * view.dpr;
        ctx.strokeStyle = ditherPattern(lk);
        ctx.beginPath();
        ctx.moveTo(pts[0].x * view.dpr, pts[0].y * view.dpr);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x * view.dpr, pts[i].y * view.dpr);
        ctx.stroke();
      } else {
        ctx.lineWidth = width + 2;
        ctx.strokeStyle = lk.dark ? "#2d4a63" : "#a9cbe6";
        tracePath(ctx, pts);
        ctx.stroke();
        ctx.lineWidth = width;
        ctx.strokeStyle = lk.dark ? "#1b3348" : "#cfe4f5";
        tracePath(ctx, pts);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ----- a pot: its water, roads, avenues, depots and existing lines -----

    // The pot's shores in screen space, worked out once per frame (the map
    // draws them and every metro leg tests its tunnels against them).
    function waterRings(game) {
      const key = `${view.frame}|${view.cam.x}|${view.cam.y}|${view.cam.scale}|${view.w}|${view.h}`;
      if (view.ringsKey === key && view.ringsCity === game.city) return view.rings;
      view.rings = game.city.water.flatMap((body) => body.rings.map((ring) => {
        const pts = [];
        for (let k = 0; k < ring.length; k += 2) pts.push(toScreen({ x: ring[k], y: ring[k + 1] }));
        return pts;
      }));
      view.ringsKey = key;
      view.ringsCity = game.city;
      return view.rings;
    }

    // The pot's road tiles as a set and its jammed tiles as a list, once per city.
    const streetIndex = new WeakMap();
    function streetsOf(city) {
      let index = streetIndex.get(city);
      if (!index) {
        const jammed = [];
        for (let k = 0; k < city.jam.length; k += 2) if (city.jam[k + 1] >= 2) jammed.push(city.jam[k]);
        index = { roads: new Set(city.roads), jammed };
        streetIndex.set(city, index);
      }
      return index;
    }

    function waterFill(lk) {
      return lk.dark ? "#1b3348" : "#cfe4f5";
    }

    function drawPotWater(game, lk, alpha = 1) {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.beginPath();
      for (const ring of waterRings(game)) traceRing(ctx, ring);
      if (lk.mono) {
        // The dither stays on device pixels whatever the zoom, as the river's does.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = ditherPattern(lk);
        ctx.fill("evenodd");
        ctx.lineWidth = 1;
        ctx.strokeStyle = lk.ink;
        ctx.stroke();
      } else {
        ctx.fillStyle = waterFill(lk);
        ctx.fill("evenodd");
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = lk.dark ? "#2d4a63" : "#a9cbe6";
        ctx.stroke();
      }
      ctx.restore();
    }

    // The pot's rim: the edge of the city. The one-bit plate draws it as a
    // double border; in colour the world beyond the rim is a shade darker
    // than the city's paper, with a hairline at the edge.
    function drawRim(game, lk) {
      const b = game.city.bounds;
      const p = toScreen({ x: b.x, y: b.y });
      const q = toScreen({ x: b.x + b.w, y: b.y + b.h });
      const x0 = Math.round(p.x);
      const y0 = Math.round(p.y);
      const x1 = Math.round(q.x);
      const y1 = Math.round(q.y);
      ctx.save();
      ctx.strokeStyle = lk.ink;
      if (lk.mono) {
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
      } else {
        ctx.fillStyle = lk.dark ? "rgba(255,255,255,0.05)" : "rgba(60,50,30,0.06)";
        ctx.beginPath();
        ctx.rect(0, 0, view.w, view.h);
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
        ctx.fill("evenodd");
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
      }
      ctx.restore();
    }

    // The streets as hairlines (a bus can go where they go), the avenues'
    // centre lanes in pale red, the jammed streets hatched, the bus depots.
    function drawStreets(game, lk, alpha = 1) {
      if (alpha <= 0) return;
      const city = game.city;
      const size = city.size;
      const cell = city.cell * view.cam.scale;
      const centre = (i) => toScreen({ x: city.bounds.x + ((i % size) + 0.5) * city.cell, y: city.bounds.y + (Math.floor(i / size) + 0.5) * city.cell });
      ctx.save();
      ctx.globalAlpha *= alpha;
      if (city.avenue.length) {
        ctx.fillStyle = lk.mono ? lk.ink : lk.dark ? AVENUE_RED_DARK : AVENUE_RED;
        ctx.beginPath();
        for (let k = 0; k < city.avenue.length; k += 2) {
          const c = centre(city.avenue[k]);
          ctx.rect(c.x - cell / 2, c.y - cell / 2, cell, cell);
        }
        if (lk.mono) ctx.globalAlpha *= 0.18;
        ctx.fill();
        if (lk.mono) ctx.globalAlpha /= 0.18;
      }
      const { roads, jammed } = streetsOf(city);
      ctx.beginPath();
      for (const i of city.roads) {
        const c = centre(i);
        const x = i % size;
        if (x + 1 < size && roads.has(i + 1)) { const d = centre(i + 1); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); }
        if (roads.has(i + size)) { const d = centre(i + size); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); }
      }
      ctx.strokeStyle = lk.ink;
      ctx.globalAlpha *= lk.mono ? 0.5 : 0.16;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
      if (jammed.length) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.beginPath();
        for (const i of jammed) {
          const c = centre(i);
          ctx.rect(c.x - cell / 2, c.y - cell / 2, cell, cell);
        }
        ctx.clip();
        ctx.strokeStyle = lk.mono ? lk.ink : lk.dark ? "rgba(255,107,95,0.45)" : "rgba(216,50,43,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = Math.max(4, cell / 3);
        for (let x = -view.h; x < view.w; x += step) { ctx.moveTo(x, view.h); ctx.lineTo(x + view.h, 0); }
        ctx.stroke();
        ctx.restore();
      }
      for (const depot of city.depots) {
        const c = toScreen(depot);
        ctx.save();
        ctx.globalAlpha *= alpha;
        root.AISystem6PotWorld.transit.drawBadge(ctx, "bus", c.x, c.y, Math.max(4, cell * 0.42), lk.ink);
        ctx.restore();
      }
    }

    // The rail and subway already in the city, as grey straightened lines.
    function existingStyle(lk, w, kind) {
      return { color: lk.mono ? lk.ink : lk.dark ? "rgba(255,255,255,0.32)" : "rgba(60,60,60,0.3)", width: w * (lk.mono ? 0.3 : 0.6), dash: kind === "subway" ? [w * 0.9, w * 0.7] : [] };
    }

    function strokeExisting(points, lk, w, kind, alpha = 1, widthScale = 1) {
      const style = existingStyle(lk, w, kind);
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width * widthScale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(style.dash);
      tracePath(ctx, points);
      ctx.stroke();
      ctx.restore();
    }

    function drawExisting(game, lk, w, alpha = 1) {
      if (alpha <= 0) return;
      for (const line of game.city.existing) {
        const pts = [];
        for (let k = 0; k < line.points.length; k += 2) pts.push(toScreen({ x: line.points[k], y: line.points[k + 1] }));
        if (pts.length >= 2) strokeExisting(pts, lk, w, line.kind, alpha);
      }
    }

    // ----- a generated city with buses: its bridges and the peak's haze ----

    function drawBridges(game, lk, w) {
      for (const bridge of core.bridgesOf(game)) {
        const a = toScreen(bridge.a);
        const b = toScreen(bridge.b);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const half = w * 0.95;
        ctx.save();
        ctx.fillStyle = lk.paper;
        ctx.beginPath();
        ctx.moveTo(a.x + nx * half, a.y + ny * half);
        ctx.lineTo(b.x + nx * half, b.y + ny * half);
        ctx.lineTo(b.x - nx * half, b.y - ny * half);
        ctx.lineTo(a.x - nx * half, a.y - ny * half);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = lk.ink;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (const side of [-1, 1]) {
          ctx.moveTo(a.x + nx * half * side, a.y + ny * half * side);
          ctx.lineTo(b.x + nx * half * side, b.y + ny * half * side);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawPeakHaze(game, lk) {
      if (lk.mono || !game.lines.some((record) => record.mode === "bus")) return;
      const amount = core.peak(core.clock(game.tick).hour);
      if (amount <= 0.01) return;
      const c = toScreen(game.city.center);
      const r = 320 * view.cam.scale;
      const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      glow.addColorStop(0, lk.dark ? `rgba(255,150,80,${0.16 * amount})` : `rgba(235,140,60,${0.14 * amount})`);
      glow.addColorStop(1, "rgba(235,140,60,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    }

    // Where a metro leg passes under water, two short bars across it.
    function waterCrossingPoints(game, a, b) {
      if (!core.isPot(game)) return crossingPoints(a, b, game.city.river.map(toScreen));
      const out = [];
      for (const ring of waterRings(game)) {
        const n = ring.length;
        for (let j = 0; j < n; j += 1) {
          for (const c of crossingPoints(a, b, [ring[j], ring[(j + 1) % n]])) out.push(c);
        }
      }
      return out;
    }

    function drawTunnelMarks(game, pts, lk, w) {
      for (let i = 1; i < pts.length; i += 1) {
        for (const c of waterCrossingPoints(game, pts[i - 1], pts[i])) {
          // A generated river is crossed at its centre line, so its portals
          // stand a river's half-width either side; a pot's shore is the
          // crossing itself, one portal there.
          const half = core.RULES.riverHalfWidth * view.cam.scale + 3;
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.angle);
          ctx.strokeStyle = lk.ink;
          ctx.lineWidth = Math.max(1.5, w * 0.3);
          ctx.lineCap = "butt";
          for (const side of core.isPot(game) ? [0] : [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * half, -w * 1.1);
            ctx.lineTo(side * half, w * 1.1);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    function lineEndHandles(game, record, w) {
      if (record.loop || record.stops.length < 2) return [];
      const r = 14 * ui();
      const mode = core.modeOfLine(record);
      const out = [];
      for (const end of ["head", "tail"]) {
        const at = core.station(game, end === "head" ? record.stops[0] : record.stops[record.stops.length - 1]);
        const prev = core.station(game, end === "head" ? record.stops[1] : record.stops[record.stops.length - 2]);
        if (!at || !prev) continue;
        const pts = core.legPath(game, prev, at, mode).map(toScreen);
        const clean = cleanPoints(pts);
        let a = clean[clean.length - 2] || clean[0];
        const b = clean[clean.length - 1];
        // A road line's last run is the short step from its stop into the
        // station; the handle carries on the way the road was going instead.
        if (core.isPot(game) && core.isRoad(mode) && clean.length >= 3 && Math.hypot(b.x - a.x, b.y - a.y) < game.city.cell * view.cam.scale * 1.5) {
          const c = clean[clean.length - 3];
          a = { x: b.x - (a.x - c.x), y: b.y - (a.y - c.y) };
        }
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const reach = r + 16 * ui();
        out.push({ lineId: record.id, end, x: b.x + ux * reach, y: b.y + uy * reach, ux, uy, from: b, w });
      }
      return out;
    }

    // A bus route's number in a roundel: the handle at its ends, and the
    // mark on a loop's first stop.
    function drawRoundel(x, y, number, lk) {
      const r = 8.5 * ui();
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = lk.paper;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = lk.ink;
      ctx.stroke();
      ctx.fillStyle = lk.ink;
      ctx.font = `700 ${Math.round(9 * ui())}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), x, y + 0.5);
      ctx.restore();
    }

    function drawLines(game, lk, offsets, w, now) {
      const selected = view.selectedLine;
      const handles = [];
      // On the colour map every line first lays a casing of paper a little
      // wider than itself, all casings before any ink, so where two lines
      // (or a line and the river) cross, the one drawn on top reads cleanly
      // across the other, the way printed transit maps separate them.
      if (!lk.mono) {
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = lk.paper;
        for (const record of game.lines) {
          if (view.gesture && view.gesture.lineId === record.id && view.gesture.working) continue;
          const mode = core.modeOfLine(record);
          ctx.lineWidth = (mode === "bus" ? w * 0.45 : w) + 3.5 * ui();
          const n = record.loop ? record.stops.length : record.stops.length - 1;
          for (let i = 0; i < n; i += 1) {
            const a = core.station(game, record.stops[i]);
            const b = core.station(game, record.stops[(i + 1) % record.stops.length]);
            if (!a || !b) continue;
            tracePath(ctx, legScreen(game, a, b, record.slot, offsets, w, mode));
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      for (const record of game.lines) {
        const editing = view.gesture && view.gesture.lineId === record.id && view.gesture.working;
        if (editing) continue;
        const mode = core.modeOfLine(record);
        const dim = selected && selected !== record.id ? 0.28 : 1;
        const n = record.loop ? record.stops.length : record.stops.length - 1;
        if (!view.seenLines.has(record.id)) view.seenLines.set(record.id, now);
        for (let i = 0; i < n; i += 1) {
          const a = core.station(game, record.stops[i]);
          const b = core.station(game, record.stops[(i + 1) % record.stops.length]);
          if (!a || !b) continue;
          const pts = legScreen(game, a, b, record.slot, offsets, w, mode);
          // A freshly laid line flashes once, on the wall clock, so it fades
          // while the game is paused too.
          const age = (now - view.seenLines.get(record.id)) / 1000;
          strokeLine(ctx, pts, record.slot, w, lk, dim, mode);
          if (age < 0.4) {
            ctx.save();
            ctx.globalAlpha = 1 - age / 0.4;
            strokeLine(ctx, pts, record.slot, w * 1.8, lk, 0.5 * dim, mode);
            ctx.restore();
          }
          if (mode === "metro") {
            ctx.save();
            ctx.globalAlpha = dim;
            drawTunnelMarks(game, pts, lk, w);
            ctx.restore();
          }
        }
        for (const h of lineEndHandles(game, record, w)) {
          handles.push(h);
          ctx.save();
          ctx.globalAlpha = dim;
          const stub = [h.from, { x: h.x, y: h.y }];
          strokeLine(ctx, stub, record.slot, w, lk, 1, mode);
          if (mode === "bus") {
            drawRoundel(h.x, h.y, record.number, lk);
          } else {
            ctx.strokeStyle = lineColor(record.slot, lk, mode);
            ctx.lineWidth = w;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(h.x - h.uy * w * 1.6, h.y + h.ux * w * 1.6);
            ctx.lineTo(h.x + h.uy * w * 1.6, h.y - h.ux * w * 1.6);
            ctx.stroke();
          }
          ctx.restore();
        }
        if (mode === "bus" && record.loop) {
          const first = core.station(game, record.stops[0]);
          if (first) {
            const p = toScreen(first);
            ctx.save();
            ctx.globalAlpha = dim;
            drawRoundel(p.x + 20 * ui(), p.y - 20 * ui(), record.number, lk);
            ctx.restore();
          }
        }
      }
      view.handles = handles;
    }

    // A train is a car per carriage in its line's colour; a BRT bus is two
    // bodies on a bellows in the line's colour; a bus is one short ink body.
    // Seats show who rides, as the kind they are going to.
    function drawTrains(game, lk, offsets, w) {
      const u = ui();
      const carLen = 22 * u;
      const carW = w * 1.55;
      for (const train of game.trains) {
        const record = core.line(game, train.lineId);
        const mode = record ? core.modeOfLine(record) : train.road ? "bus" : "metro";
        const pose = core.trainPose(game, train);
        let p = toScreen(pose);
        const from = core.station(game, train.from);
        const to = core.station(game, train.to);
        if (record && from && to && from !== to) {
          const list = offsets.get(pairKey(from.id, to.id, mode)) || [record.slot];
          const k = list.indexOf(record.slot);
          const canonicalSign = from.id < to.id ? 1 : -1;
          const shift = (k - (list.length - 1) / 2) * w * 1.15 * canonicalSign;
          p = { x: p.x - Math.sin(pose.angle) * shift, y: p.y + Math.cos(pose.angle) * shift };
        }
        const color = record ? lineColor(record.slot, lk, mode) : lk.ink;
        const dim = view.selectedLine && record && view.selectedLine !== record.id ? 0.3 : 1;
        // Cars along the direction of travel: [x0, length, seats].
        let bodies;
        let gap = 3 * u;
        let bodyW = carW;
        if (mode === "brt") {
          bodies = [[0, carLen * 0.82, 3], [0, carLen * 0.82, 3]];
          gap = 2.5 * u;
        } else if (mode === "bus") {
          bodies = [[0, carLen * 0.86, 4]];
          bodyW = carW * 0.92;
        } else {
          bodies = Array.from({ length: 1 + train.carriages }, () => [0, carLen, core.RULES.carCapacity]);
        }
        const total = bodies.reduce((sum, body) => sum + body[1], 0) + (bodies.length - 1) * gap;
        let x = total / 2;
        for (const body of bodies) { x -= body[1]; body[0] = x; x -= gap; }
        ctx.save();
        ctx.globalAlpha = train.retiring ? 0.45 : dim;
        ctx.translate(p.x, p.y);
        ctx.rotate(pose.angle);
        if (mode === "brt") {
          // The bellows between the two bodies.
          ctx.fillStyle = color;
          ctx.globalAlpha *= 0.6;
          ctx.fillRect(bodies[1][0] + bodies[1][1] - 1, -bodyW * 0.32, gap + 2, bodyW * 0.64);
          ctx.globalAlpha /= 0.6;
        }
        let seat = 0;
        for (const [x0, len, seats] of bodies) {
          ctx.fillStyle = color;
          roundRect(ctx, x0, -bodyW / 2, len, bodyW, 3 * u);
          ctx.fill();
          if (lk.mono || mode === "bus") {
            ctx.strokeStyle = lk.paper;
            ctx.lineWidth = 1;
            ctx.stroke();
          } else {
            // A darker rim, so a train in its line's own colour stands out
            // from the line it runs on.
            ctx.strokeStyle = lk.dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.42)";
            ctx.lineWidth = 1.25 * u;
            ctx.stroke();
          }
          const perRow = Math.ceil(seats / 2);
          const riders = train.passengers.slice(seat, seat + seats);
          riders.forEach((rider, i) => {
            const cx = x0 + len * (0.22 + (0.56 * (i % perRow)) / Math.max(1, perRow - 1));
            const cy = (i < perRow ? -1 : 1) * bodyW * 0.22;
            drawGlyph(ctx, rider.dest, cx, cy, bodyW * 0.19, lk.paper);
          });
          seat += seats;
        }
        ctx.restore();
      }
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function drawStations(game, lk, now, introGrow = 1) {
      const sides = queueSides(game);
      const u = ui();
      const R = 14 * u;
      const tick = game.tick;
      const tps = core.RULES.ticksPerSecond;
      const recentDeliveries = new Map();
      for (const e of game.events) {
        if (e.type === "deliver" && tick - e.tick < tps * 0.6) recentDeliveries.set(e.stationId, tick - e.tick);
      }
      // A station both a rail line and a road line serve wears a thin ring.
      const families = new Map();
      for (const record of game.lines) {
        const family = core.isRoad(core.modeOfLine(record)) ? 2 : 1;
        for (const id of record.stops) families.set(id, (families.get(id) || 0) | family);
      }
      for (const s of game.stations) {
        const p = toScreen(s);
        // Arrival animations run on the wall clock, so a paused city still
        // finishes drawing its new stations.
        if (!view.seenStations.has(s.id)) view.seenStations.set(s.id, now);
        const age = (now - view.seenStations.get(s.id)) / 1000;
        const grow = Math.max(0.01, spring(age, 9) * introGrow);
        const shake = s.crowd > 0.72 && !game.over ? Math.sin(now / 38 + s.id) * 1.6 * (s.crowd - 0.7) * 3 : 0;
        const x = p.x + shake;
        const y = p.y;
        const r = R * grow;
        // A new station announces itself with one ring.
        if (age < 1.6) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - age / 1.6);
          ctx.strokeStyle = lk.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, R + age * 30 * u, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        if (families.get(s.id) === 3 && !s.interchange) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r + 3.5 * u, 0, TAU);
          ctx.lineWidth = 1;
          ctx.strokeStyle = lk.ink;
          ctx.stroke();
          ctx.restore();
        }
        if (s.interchange) {
          ctx.beginPath();
          ctx.arc(x, y, r * 1.5, 0, TAU);
          ctx.fillStyle = lk.paper;
          ctx.fill();
          ctx.lineWidth = 2.5 * u;
          ctx.strokeStyle = lk.ink;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = lk.paper;
        ctx.fill();
        ctx.lineWidth = 2.6 * u;
        ctx.strokeStyle = lk.ink;
        ctx.stroke();
        drawGlyph(ctx, s.kind, x, y, r * 0.55, lk.ink);
        // Delivery: a quick pulse where someone arrived.
        const since = recentDeliveries.get(s.id);
        if (since !== undefined) {
          const t = since / (tps * 0.6);
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = 2;
          ctx.strokeStyle = lk.ink;
          ctx.beginPath();
          ctx.arc(x, y, r + 3 + t * 9 * u, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        // Crowding: the ring fills clockwise; when it closes the game ends.
        if (s.crowd > 0) {
          ctx.save();
          ctx.lineWidth = 4 * u;
          ctx.lineCap = "butt";
          ctx.strokeStyle = lk.mono ? lk.ink : lk.dark ? "#ff6b5f" : "#d8322b";
          ctx.beginPath();
          ctx.arc(x, y, r + 6 * u, -Math.PI / 2, -Math.PI / 2 + TAU * s.crowd);
          ctx.stroke();
          ctx.restore();
        }
        if (game.over && game.over.stationId === s.id) {
          const pulse = (now / 700) % 1;
          ctx.save();
          ctx.strokeStyle = lk.mono ? lk.ink : lk.dark ? "#ff6b5f" : "#d8322b";
          ctx.lineWidth = 3;
          ctx.globalAlpha = 1 - pulse;
          ctx.beginPath();
          ctx.arc(x, y, r + 8 + pulse * 40 * u, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        if (view.hover === s.id || (view.gesture && view.gesture.chain && view.gesture.chain.includes(s.id))) {
          ctx.save();
          ctx.strokeStyle = lk.ink;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, r + 10 * u, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        drawWaiting(s, x, y, r, lk, u, sides.get(s.id));
      }
    }

    // Which way each station's queue may grow: the side furthest from every
    // line leaving it and from a line end's handle, so waiting people never
    // sit on a track or under the grip the player drags.
    const QUEUE_SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    function queueSides(game) {
      const used = new Map();
      const add = (id, dx, dy) => {
        const len = Math.hypot(dx, dy);
        if (!len) return;
        if (!used.has(id)) used.set(id, []);
        used.get(id).push([dx / len, dy / len]);
      };
      for (const record of game.lines) {
        const mode = core.modeOfLine(record);
        const n = record.loop ? record.stops.length : record.stops.length - 1;
        for (let i = 0; i < n; i += 1) {
          const a = core.station(game, record.stops[i]);
          const b = core.station(game, record.stops[(i + 1) % record.stops.length]);
          if (!a || !b) continue;
          const pts = cleanPoints(core.legPath(game, a, b, mode));
          add(a.id, pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          const k = pts.length - 1;
          add(b.id, pts[k - 1].x - pts[k].x, pts[k - 1].y - pts[k].y);
          // A line end's handle points straight out of the last leg.
          if (!record.loop && i === 0) add(a.id, pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (!record.loop && i === n - 1) add(b.id, pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
        }
      }
      const sides = new Map();
      for (const [id, dirs] of used) {
        let best = QUEUE_SIDES[0];
        let bestScore = -Infinity;
        for (const side of QUEUE_SIDES) {
          const score = Math.min(...dirs.map(([dx, dy]) => Math.acos(Math.max(-1, Math.min(1, dx * side[0] + dy * side[1])))));
          if (score > bestScore + 1e-6) { best = side; bestScore = score; }
        }
        sides.set(id, best);
      }
      return sides;
    }

    function drawWaiting(s, x, y, r, lk, u, side = QUEUE_SIDES[0]) {
      const size = 5 * u;
      const step = size * 2.35;
      const perRow = 6;
      const shown = Math.min(s.waiting.length, 12);
      const gap = r + 8 * u;
      const at = (i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        if (side[0] > 0) return [x + gap + col * step, y - r * 0.55 + row * step];
        if (side[0] < 0) return [x - gap - col * step, y - r * 0.55 + row * step];
        const cx = x + (col - (Math.min(shown, perRow) - 1) / 2) * step;
        return side[1] > 0 ? [cx, y + gap + row * step] : [cx, y - gap - row * step];
      };
      for (let i = 0; i < shown; i += 1) {
        const [gx, gy] = at(i);
        drawGlyph(ctx, s.waiting[i].dest, gx, gy, size, lk.ink);
      }
      if (s.waiting.length > 12) {
        const [lx, ly] = at(11);
        ctx.save();
        ctx.fillStyle = lk.ink;
        ctx.font = `600 ${Math.round(10 * u)}px system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign = side[0] < 0 ? "right" : "left";
        const nudge = side[0] < 0 ? -step : side[0] > 0 ? step : step * 0.9;
        ctx.fillText(`+${s.waiting.length - 12}`, lx + nudge, ly);
        ctx.restore();
      }
    }

    // ----- the pencil: what the drag would build ------------------------

    function previewStops(game) {
      const g = view.gesture;
      if (!g) return null;
      if (g.mode === "create") return { stops: g.chain, loop: g.loop, slot: g.slot, mode: g.kind };
      if (g.mode === "extend" || g.mode === "insert") return { stops: g.working, loop: g.loop, slot: g.slot, lineId: g.lineId, mode: g.kind };
      return null;
    }

    const REFUSALS = new Set(["tunnel", "road", "avenue", "bridge", "no-avenue"]);

    function crossMark(c, lk) {
      ctx.save();
      ctx.strokeStyle = lk.mono ? lk.ink : "#d8322b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x - 7, c.y - 7); ctx.lineTo(c.x + 7, c.y + 7);
      ctx.moveTo(c.x + 7, c.y - 7); ctx.lineTo(c.x - 7, c.y + 7);
      ctx.stroke();
      ctx.restore();
    }

    function drawPreview(game, lk, w) {
      const g = view.gesture;
      const preview = previewStops(game);
      if (!preview) return;
      const mode = preview.mode || "metro";
      const stops = preview.stops.map((id) => core.station(game, id)).filter(Boolean);
      const problem = stops.length >= 2 ? core.validateStops(game, preview.stops, preview.loop, preview.lineId || 0, mode) : "";
      const invalid = REFUSALS.has(problem);
      g.problem = problem;
      const legs = [];
      const n = preview.loop ? stops.length : stops.length - 1;
      for (let i = 0; i < n; i += 1) {
        const route = core.legRoute(game, stops[i], stops[(i + 1) % stops.length], mode);
        legs.push({ pts: route.points.map(toScreen), problem: route.problem });
      }
      ctx.save();
      if (invalid) ctx.globalAlpha = 0.45;
      for (const leg of legs) {
        strokeLine(ctx, leg.pts, preview.slot, w, lk, 1, mode);
        if (mode === "metro") drawTunnelMarks(game, leg.pts, lk, w);
      }
      // The rubber band from the working end to the finger: a 45-degree run
      // for the metro, a right angle for a bus or a BRT.
      if (view.pointerWorld && g.anchor) {
        const anchor = core.station(game, g.anchor);
        const finger = { id: Infinity, x: view.pointerWorld.x, y: view.pointerWorld.y };
        const band = (a, b) => (core.isRoad(mode) ? [a, { x: b.x, y: a.y }, b] : core.legPoints(a, b)).map(toScreen);
        if (anchor) {
          ctx.globalAlpha *= 0.55;
          strokeLine(ctx, band(anchor, finger), preview.slot, w, lk, 1, mode);
          if (g.mode === "insert" && g.tailAnchor) {
            const tail = core.station(game, g.tailAnchor);
            if (tail) strokeLine(ctx, band(finger, tail), preview.slot, w, lk, 1, mode);
          }
        }
      }
      ctx.restore();
      if (!invalid) return;
      // Say why where it fails: at the water for a tunnel, at the middle of
      // the leg the roads or the avenues cannot carry.
      for (const leg of legs) {
        if (problem === "tunnel") {
          for (let i = 1; i < leg.pts.length; i += 1) for (const c of waterCrossingPoints(game, leg.pts[i - 1], leg.pts[i])) crossMark(c, lk);
        } else if (leg.problem) {
          const clean = cleanPoints(leg.pts);
          let total = 0;
          for (let i = 1; i < clean.length; i += 1) total += Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y);
          let left = total / 2;
          for (let i = 1; i < clean.length; i += 1) {
            const len = Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y);
            if (left <= len || i === clean.length - 1) {
              const t = len ? Math.min(1, left / len) : 0;
              crossMark({ x: clean[i - 1].x + (clean[i].x - clean[i - 1].x) * t, y: clean[i - 1].y + (clean[i].y - clean[i - 1].y) * t }, lk);
              break;
            }
            left -= len;
          }
        }
      }
    }

    // ----- the cartographic transition --------------------------------------
    //
    // Driven by the hand-over itself (rootline-pot.js introOf): every zone
    // tile starts as a flat square where it stands in the pot and settles
    // into the station site it is nearest, shrinking as it goes; the rail
    // straightens into the grey existing lines; the water's tiles melt into
    // its outline; the first stations open where the city gathered. One
    // motion on critically damped springs (no overshoot), the centre a beat
    // ahead of the rim, while the camera pushes in from the whole pot to the
    // first stations. Any input cuts it short: what is left fades in 180 ms
    // and the camera eases on from wherever it stands.

    const INTRO = Object.freeze({ seconds: 1.6, fade: 180 });
    // Bonsai City's own zone colours (residential, commercial, industrial,
    // airport, port), light and dark.
    const ZONE_COLORS = Object.freeze([["#9ccf8f", "#3d7046"], ["#93b8ea", "#34588a"], ["#ecd37c", "#7d6a2a"], ["#c8c8c8", "#5c5c5c"], ["#a6c7d6", "#365f71"]]);
    const ALPHA_LEVELS = 6;

    function fitBounds(bounds) {
      const scale = Math.max(0.18, Math.min(3.2, Math.min(view.w / (bounds.w + 90), view.h / (bounds.h + 90))));
      return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, scale };
    }

    function playIntro(data) {
      view.introStats = null;
      if (!data) { view.intro = null; return false; }
      const n = data.tiles.count;
      view.intro = {
        data, start: 0, last: 0, cut: 0, tCut: 0, deltas: [], warm: 0,
        // Scratch space, reused every frame: screen square and its bucket.
        sx: new Float32Array(n), sy: new Float32Array(n), side: new Float32Array(n), bucket: new Int16Array(n), order: new Int32Array(n),
      };
      // The first stations arrive with the transition, not with their own ring.
      const game = hooks.game();
      for (const s of game ? game.stations : []) view.seenStations.set(s.id, -1e9);
      return true;
    }

    function cutIntro() {
      const intro = view.intro;
      if (!intro || intro.cut || !intro.start) return;
      intro.cut = root.performance.now();
      intro.tCut = Math.max(0, (intro.cut - intro.start) / 1000);
    }

    function finishIntro() {
      const intro = view.intro;
      view.intro = null;
      const deltas = intro.deltas.slice().sort((a, b) => a - b);
      const p95 = deltas.length ? deltas[Math.min(deltas.length - 1, Math.ceil(deltas.length * 0.95) - 1)] : 0;
      const longest = intro.deltas.indexOf(deltas[deltas.length - 1]);
      view.introStats = {
        // The held first frame, before any motion (see introPhase). It is a
        // still, so it is left out of p95/max/long below, but it is still a
        // stall the player can feel when it runs past 50 ms: `heldLong`.
        warmup: Math.round(intro.warmup * 10) / 10,
        heldLong: intro.warmup > 50,
        frames: intro.deltas.length + 1,
        maxAt: longest,
        seconds: Math.round((intro.last - intro.start)) / 1000,
        p95: Math.round(p95 * 10) / 10,
        max: Math.round((deltas[deltas.length - 1] || 0) * 10) / 10,
        long: deltas.filter((d) => d > 50).length,
        cut: Boolean(intro.cut),
      };
      hooks.onIntroEnd?.(view.introStats);
    }

    function introPhase(game, now) {
      const intro = view.intro;
      if (!intro) return null;
      // The first frame shows the pot as it stands and holds: the canvas and
      // the new game's bars settle in that frame, and the motion starts on
      // the next, so the frame the browser spends settling is a still, not a
      // jump in the middle of the move.
      if (!intro.warm) {
        intro.warm = now;
        intro.from = fitBounds(intro.data.bounds);
        intro.to = targetCamera(game);
        Object.assign(view.cam, intro.from);
        view.fitted = true;
        return { t: 0, fade: 1, cut: false };
      }
      if (!intro.start) {
        intro.warmup = now - intro.warm;
        intro.start = now;
        intro.last = now;
        intro.from = fitBounds(intro.data.bounds);
        intro.to = targetCamera(game);
        Object.assign(view.cam, intro.from);
        view.fitted = true;
      } else {
        intro.deltas.push(now - intro.last);
        intro.last = now;
      }
      const t = (now - intro.start) / 1000;
      const fade = intro.cut ? Math.max(0, 1 - (now - intro.cut) / INTRO.fade) : 1;
      if ((!intro.cut && t >= INTRO.seconds) || (intro.cut && fade <= 0)) {
        finishIntro();
        return null;
      }
      return { t: intro.cut ? intro.tCut : t, fade, cut: Boolean(intro.cut) };
    }

    function driveIntroCamera(t) {
      const { from, to } = view.intro;
      const k = spring(t, 4.4);
      view.cam.x = from.x + (to.x - from.x) * k;
      view.cam.y = from.y + (to.y - from.y) * k;
      view.cam.scale = from.scale * Math.pow(to.scale / from.scale, k);
    }

    function drawIntro(game, lk, phase, w) {
      const intro = view.intro;
      const { data } = intro;
      const { t, fade } = phase;
      const cell = data.cell * view.cam.scale;
      // The water's tiles, melting into the outline drawn beneath them.
      const waterAlpha = (1 - spring(t - 0.15, 4.8)) * fade;
      if (waterAlpha > 0.004 && data.water.length) {
        ctx.save();
        ctx.globalAlpha = waterAlpha * (lk.mono ? 0.35 : 1);
        ctx.fillStyle = lk.mono ? lk.ink : waterFill(lk);
        ctx.beginPath();
        for (let k = 0; k < data.water.length; k += 2) {
          const p = toScreen({ x: data.water[k], y: data.water[k + 1] });
          ctx.rect(p.x - cell / 2 - 0.5, p.y - cell / 2 - 0.5, cell + 1, cell + 1);
        }
        ctx.fill();
        ctx.restore();
      }
      // The rail, straightening.
      const bend = spring(t - 0.12, 5);
      for (const line of data.lines) {
        const pts = [];
        for (let k = 0; k < line.from.length; k += 2) {
          pts.push(toScreen({ x: line.from[k] + (line.to[k] - line.from[k]) * bend, y: line.from[k + 1] + (line.to[k + 1] - line.from[k + 1]) * bend }));
        }
        strokeExisting(pts, lk, w, line.kind, fade, 1 + 0.8 * (1 - bend));
      }
      // The zones, settling into the stations: computed once, bucketed by
      // kind and opacity with a counting sort, filled one path per bucket.
      const tiles = data.tiles;
      const n = tiles.count;
      const buckets = ZONE_COLORS.length * ALPHA_LEVELS;
      const counts = new Int32Array(buckets + 1);
      const scale = view.cam.scale;
      const ox = view.w / 2 - view.cam.x * scale;
      const oy = view.h / 2 - view.cam.y * scale;
      for (let k = 0; k < n; k += 1) {
        const s = spring(t - 0.08 - 0.32 * tiles.delay[k], 5.6);
        const alpha = (s < 0.8 ? 1 : Math.max(0, 1 - (s - 0.8) / 0.2)) * fade;
        const level = Math.round(alpha * (ALPHA_LEVELS - 1));
        if (level <= 0) { intro.bucket[k] = -1; continue; }
        intro.sx[k] = (tiles.x[k] + (tiles.tx[k] - tiles.x[k]) * s) * scale + ox;
        intro.sy[k] = (tiles.y[k] + (tiles.ty[k] - tiles.y[k]) * s) * scale + oy;
        intro.side[k] = cell * (0.92 - 0.84 * s);
        const bucket = tiles.kind[k] * ALPHA_LEVELS + level;
        intro.bucket[k] = bucket;
        counts[bucket + 1] += 1;
      }
      for (let b = 1; b <= buckets; b += 1) counts[b] += counts[b - 1];
      const cursor = counts.slice(0, buckets);
      for (let k = 0; k < n; k += 1) if (intro.bucket[k] >= 0) intro.order[cursor[intro.bucket[k]]++] = k;
      ctx.save();
      for (let b = 0; b < buckets; b += 1) {
        if (counts[b + 1] === counts[b]) continue;
        const kind = Math.floor(b / ALPHA_LEVELS);
        const level = b % ALPHA_LEVELS;
        ctx.globalAlpha = level / (ALPHA_LEVELS - 1);
        ctx.fillStyle = lk.mono ? lk.ink : ZONE_COLORS[kind][lk.dark ? 1 : 0];
        ctx.beginPath();
        for (let c = counts[b]; c < counts[b + 1]; c += 1) {
          const k = intro.order[c];
          // One-bit: homes are smaller squares, shops full, works outlined
          // by being drawn a size apart -- shape says land use there too.
          const side = lk.mono ? intro.side[k] * (kind === 0 ? 0.62 : kind === 2 ? 0.8 : 1) : intro.side[k];
          ctx.rect(intro.sx[k] - side / 2, intro.sy[k] - side / 2, side, side);
        }
        ctx.fill();
      }
      ctx.restore();
    }

    function render(now, dt) {
      const game = hooks.game();
      if (!game) return;
      view.frame = now;
      resize();
      const phase = introPhase(game, now);
      if (phase && !phase.cut) driveIntroCamera(phase.t);
      else updateCamera(game, dt);
      const lk = look();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.fillStyle = lk.paper;
      ctx.fillRect(0, 0, view.w, view.h);
      if (!lk.mono) {
        // A faint printed-paper grain, fixed to the screen.
        ctx.fillStyle = paperGrain(lk);
        ctx.fillRect(0, 0, view.w, view.h);
      }
      const w = 7 * ui();
      const during = phase && !phase.cut;
      if (core.isPot(game)) {
        drawRim(game, lk);
        drawPotWater(game, lk, during ? spring(phase.t - 0.15, 4.8) : 1);
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        drawStreets(game, lk, during ? spring(phase.t - 0.55, 5) : 1);
        if (!during) drawExisting(game, lk, w);
      } else {
        drawRiver(game, lk);
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        if (game.modes) drawPeakHaze(game, lk);
        // A metro-only game shows its bridges once the picker is on a road mode.
        if (game.modes || (hooks.drawMode?.() || "metro") !== "metro") drawBridges(game, lk, w);
      }
      if (phase) drawIntro(game, lk, phase, w);
      const offsets = legOffsets(game);
      drawLines(game, lk, offsets, w, now);
      drawPreview(game, lk, w);
      drawStations(game, lk, now, during ? spring(phase.t - 0.95, 7.5) : 1);
      // Trains ride over the stations, so a train at the platform is seen.
      drawTrains(game, lk, offsets, w);
      // Night falls on the colour map; the 1-bit plate keeps its paper and
      // lets the clock say it.
      if (!lk.mono) {
        const { hour } = core.clock(game.tick);
        const dark = hour >= 21 || hour < 5.5 ? 1 : hour >= 19.5 ? (hour - 19.5) / 1.5 : hour < 7 ? (7 - hour) / 1.5 : 0;
        if (dark > 0) {
          ctx.fillStyle = lk.dark ? `rgba(0,0,10,${0.22 * dark})` : `rgba(20,30,70,${0.1 * dark})`;
          ctx.fillRect(0, 0, view.w, view.h);
        }
      }
    }

    // ----- hit testing ------------------------------------------------------

    function stationAt(game, sp, slack = 10) {
      const R = 14 * ui() + slack;
      let best = null;
      let bestD = Infinity;
      for (const s of game.stations) {
        const p = toScreen(s);
        const d = Math.hypot(p.x - sp.x, p.y - sp.y);
        if (d < R && d < bestD) { best = s; bestD = d; }
      }
      return best;
    }

    function handleAt(sp) {
      for (const h of view.handles || []) {
        if (Math.hypot(h.x - sp.x, h.y - sp.y) < 20 * ui()) return h;
      }
      return null;
    }

    function legAt(game, sp) {
      const w = 7 * ui();
      const offsets = legOffsets(game);
      let best = null;
      for (const record of game.lines) {
        const mode = core.modeOfLine(record);
        const n = record.loop ? record.stops.length : record.stops.length - 1;
        for (let i = 0; i < n; i += 1) {
          const a = core.station(game, record.stops[i]);
          const b = core.station(game, record.stops[(i + 1) % record.stops.length]);
          if (!a || !b) continue;
          const d = distToPolyline(sp, legScreen(game, a, b, record.slot, offsets, w, mode));
          if (d < w + 7 && (!best || d < best.d)) best = { lineId: record.id, index: i, d };
        }
      }
      return best;
    }

    // ----- gestures -----------------------------------------------------------

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function beginGesture(sp, event) {
      const game = hooks.game();
      if (!game || game.over || game.reward || hooks.locked?.()) return null;
      const handle = handleAt(sp);
      if (handle) {
        const record = core.line(game, handle.lineId);
        const working = [...record.stops];
        if (handle.end === "head") working.reverse();
        return { mode: "extend", kind: core.modeOfLine(record), lineId: record.id, end: handle.end, working, original: [...record.stops], loop: false, slot: record.slot, anchor: working[working.length - 1] };
      }
      const s = stationAt(game, sp);
      if (s) {
        // A new line is laid the way the mode picker says.
        const kind = hooks.drawMode?.() || "metro";
        const slot = kind === "bus" ? firstFreeRoute(game) : firstFreeSlot(game);
        return { mode: "create", kind, chain: [s.id], loop: false, slot: slot < 0 ? (kind === "bus" ? core.RULES.lineSlots : 0) : slot, anchor: s.id, start: sp, moved: false, stationId: s.id, noSlot: slot < 0 };
      }
      const leg = legAt(game, sp);
      if (leg) {
        const record = core.line(game, leg.lineId);
        const a = record.stops[leg.index];
        const b = record.stops[(leg.index + 1) % record.stops.length];
        return { mode: "insert", kind: core.modeOfLine(record), lineId: record.id, index: leg.index, working: [...record.stops], original: [...record.stops], loop: record.loop, slot: record.slot, anchor: a, tailAnchor: b, start: sp, moved: false };
      }
      return { mode: "pan", start: sp, last: sp, moved: false, touch: event.pointerType === "touch" };
    }

    function firstFreeSlot(game) {
      if (core.available(game).lines <= 0) return -1;
      for (let slot = 0; slot < core.RULES.lineSlots; slot += 1) if (!game.lines.some((l) => l.slot === slot)) return slot;
      return -1;
    }

    // A metro-only game has no route stock yet; its first bus line brings
    // the starting route with it.
    function firstFreeRoute(game) {
      const routes = game.modes ? core.available(game).routes : core.RULES.startTransit.routes;
      if (!(routes > 0)) return -1;
      for (let k = 1; k <= core.RULES.routeSlots; k += 1) {
        const slot = core.RULES.lineSlots - 1 + k;
        if (!game.lines.some((l) => l.slot === slot)) return slot;
      }
      return -1;
    }

    function moveGesture(g, sp) {
      const game = hooks.game();
      if (!game) return;
      view.pointerWorld = toWorld(sp);
      if (g.start && Math.hypot(sp.x - g.start.x, sp.y - g.start.y) > 6) g.moved = true;
      if (g.mode === "pan") {
        const dx = (sp.x - g.last.x) / view.cam.scale;
        const dy = (sp.y - g.last.y) / view.cam.scale;
        view.user.panX -= dx;
        view.user.panY -= dy;
        view.cam.x -= dx;
        view.cam.y -= dy;
        g.last = sp;
        return;
      }
      const s = stationAt(game, sp, 4);
      if (g.mode === "create") {
        if (!s) { g.loop = false; return; }
        const chain = g.chain;
        if (chain.length >= 2 && s.id === chain[chain.length - 2]) { chain.pop(); g.loop = false; }
        else if (chain.length >= 3 && s.id === chain[0]) g.loop = true;
        else if (!chain.includes(s.id)) { chain.push(s.id); g.loop = false; hooks.onChain?.(); }
        g.anchor = chain[chain.length - 1];
        return;
      }
      if (g.mode === "extend") {
        const working = g.working;
        if (!s) { g.loop = false; return; }
        if (working.length >= 2 && s.id === working[working.length - 2]) { working.pop(); g.loop = false; }
        else if (working.length >= 3 && s.id === working[0]) g.loop = true;
        else if (!working.includes(s.id)) { working.push(s.id); g.loop = false; hooks.onChain?.(); }
        g.anchor = working[working.length - 1] ?? g.anchor;
        return;
      }
      if (g.mode === "insert") {
        const working = [...g.original];
        if (s && !g.original.includes(s.id)) working.splice(g.index + 1, 0, s.id);
        g.working = working;
      }
    }

    function endGesture(g, sp) {
      const game = hooks.game();
      view.pointerWorld = null;
      if (!game || !g) return;
      if (g.mode === "pan") {
        if (!g.moved) {
          hooks.onTapEmpty?.(sp);
        }
        return;
      }
      if (g.mode === "create") {
        if (!g.moved || g.chain.length < 2) {
          if (!g.moved) hooks.onTapStation?.(g.stationId, sp);
          return;
        }
        if (g.noSlot) { hooks.onReject?.(g.kind === "bus" ? "no-route" : "no-line"); return; }
        hooks.apply(g.kind && g.kind !== "metro" ? { type: "line.create", stops: g.chain, loop: g.loop, mode: g.kind } : { type: "line.create", stops: g.chain, loop: g.loop });
        return;
      }
      if (g.mode === "extend") {
        let stops = [...g.working];
        if (g.end === "head") stops.reverse();
        const same = stops.length === g.original.length && stops.every((id, i) => id === g.original[i]) && !g.loop;
        if (same) return;
        if (g.working.length < 2) { hooks.apply({ type: "line.remove", lineId: g.lineId }); return; }
        hooks.apply({ type: "line.set", lineId: g.lineId, stops, loop: g.loop });
        return;
      }
      if (g.mode === "insert") {
        if (!g.moved) { hooks.onTapLine?.(g.lineId, sp); return; }
        if (g.working.length === g.original.length) return;
        hooks.apply({ type: "line.set", lineId: g.lineId, stops: g.working, loop: g.loop });
      }
    }

    function onPointerDown(event) {
      cutIntro();
      if (event.button !== undefined && event.button > 0 && event.pointerType === "mouse") {
        view.gesture = { mode: "pan", start: point(event), last: point(event), moved: true };
      }
      canvas.setPointerCapture?.(event.pointerId);
      const sp = point(event);
      view.pointers.set(event.pointerId, sp);
      hooks.onUserGesture?.();
      if (view.pointers.size === 2) {
        const [a, b] = [...view.pointers.values()];
        view.gesture = { mode: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        return;
      }
      if (!view.gesture) view.gesture = beginGesture(sp, event);
      event.preventDefault();
    }

    function onPointerMove(event) {
      const sp = point(event);
      if (!view.pointers.has(event.pointerId)) {
        // Hover (mouse only): light up the station under the pointer.
        const game = hooks.game();
        const s = game ? stationAt(game, sp) : null;
        view.hover = s ? s.id : null;
        canvas.style.cursor = s || (game && handleAt(sp)) ? "pointer" : game && legAt(game, sp) ? "copy" : "";
        return;
      }
      view.pointers.set(event.pointerId, sp);
      const g = view.gesture;
      if (!g) return;
      if (g.mode === "pinch" && view.pointers.size >= 2) {
        const [a, b] = [...view.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoomAt(mid, dist / (g.dist || dist));
        const dx = (mid.x - g.mid.x) / view.cam.scale;
        const dy = (mid.y - g.mid.y) / view.cam.scale;
        view.user.panX -= dx; view.user.panY -= dy; view.cam.x -= dx; view.cam.y -= dy;
        g.dist = dist;
        g.mid = mid;
        return;
      }
      moveGesture(g, sp);
      event.preventDefault();
    }

    function onPointerUp(event) {
      const sp = point(event);
      view.pointers.delete(event.pointerId);
      const g = view.gesture;
      if (g && g.mode === "pinch") {
        if (view.pointers.size === 0) view.gesture = null;
        return;
      }
      view.gesture = null;
      if (event.type === "pointercancel") return;
      endGesture(g, sp);
    }

    function zoomAt(sp, factor) {
      const before = toWorld(sp);
      const next = Math.max(0.45, Math.min(3.5, view.user.zoom * factor));
      const applied = next / view.user.zoom;
      view.user.zoom = next;
      view.cam.scale *= applied;
      const after = toWorld(sp);
      view.user.panX += before.x - after.x;
      view.user.panY += before.y - after.y;
      view.cam.x += before.x - after.x;
      view.cam.y += before.y - after.y;
    }

    function onWheel(event) {
      event.preventDefault();
      cutIntro();
      zoomAt(point(event), Math.exp(-event.deltaY * 0.0016));
    }

    function onDoubleClick(event) {
      const game = hooks.game();
      if (game && !stationAt(game, point(event)) && !legAt(game, point(event))) resetCamera();
    }

    function resetCamera() {
      view.user = { zoom: 1, panX: 0, panY: 0 };
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);

    return {
      render,
      resize,
      resetCamera,
      cancelGesture() { view.gesture = null; view.pointers.clear(); view.pointerWorld = null; },
      setSelectedLine(id) { view.selectedLine = id || 0; },
      setInset(px) { view.inset = Math.max(0, px || 0); },
      selectedLine: () => view.selectedLine,
      stationScreen(id) {
        const game = hooks.game();
        const s = game && core.station(game, id);
        return s ? toScreen(s) : null;
      },
      reset() { view.fitted = false; resetCamera(); view.gesture = null; view.selectedLine = 0; view.seenLines = new Map(); view.seenStations = new Map(); view.intro = null; },
      isDrawing: () => Boolean(view.gesture && view.gesture.mode !== "pan" && view.gesture.mode !== "pinch"),
      playIntro,
      cutIntro,
      introPlaying: () => Boolean(view.intro),
      introStats: () => (view.introStats ? { ...view.introStats } : null),
    };
  }

  root.AISystem6RootlineView = Object.freeze({ create, drawGlyph, strokeLine, lineColor, oneBit, LINE_COLORS });
})(typeof window !== "undefined" ? window : globalThis);
