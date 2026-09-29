// Rootline / 根线 — the map: drawing and gestures.
//
// Reads the core's state and never writes it; every change the player makes
// leaves here as a command through `hooks.apply`. One canvas, redrawn each
// frame from the state, so the picture is always what the rules say.
//
// Two readings of the same map (spec §5): the Classic appearance draws it in
// 1-bit like a MacDraw plate, telling lines apart by pattern; every other
// appearance draws line colours on its own paper and ink.
(function installRootlineView(root) {
  "use strict";

  const TAU = Math.PI * 2;

  // ----- palette and line styles ----------------------------------------

  const LINE_COLORS = ["#d8322b", "#1f6fd1", "#e9a115", "#2d9a48", "#8c46b2", "#149bb2", "#8a5a33"];
  const LINE_COLORS_DARK = ["#ff6b5f", "#63a4ff", "#ffc24d", "#5fd07c", "#c285ef", "#4fd3e8", "#d19a6a"];

  function lineColor(slot, look) {
    if (look.mono) return look.ink;
    return (look.dark ? LINE_COLORS_DARK : LINE_COLORS)[slot % LINE_COLORS.length];
  }

  function tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  }

  // Seven lines, seven patterns: the way a 1-bit map tells them apart.
  function strokeLine(ctx, pts, slot, w, look, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const ink = lineColor(slot, look);
    const paper = look.paper;
    const s = (width, color, dash = [], cap = "round") => {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineCap = cap;
      tracePath(ctx, pts);
      ctx.stroke();
    };
    if (!look.mono) {
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
  // The destination kinds are Bonsai City's land uses and facilities (spec
  // D2), drawn as 1-bit pictograms in a [-1, 1] box. Stations wear their own
  // kind; a waiting passenger wears the kind it is going to.

  function drawGlyph(ctx, kind, x, y, size, color, filled = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.22;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const fillOrStroke = () => (filled ? ctx.fill() : ctx.stroke());
    ctx.beginPath();
    switch (kind) {
      case "residential":
        ctx.moveTo(-0.85, -0.05); ctx.lineTo(0, -0.9); ctx.lineTo(0.85, -0.05); ctx.lineTo(0.62, -0.05);
        ctx.lineTo(0.62, 0.85); ctx.lineTo(-0.62, 0.85); ctx.lineTo(-0.62, -0.05); ctx.closePath();
        fillOrStroke();
        break;
      case "commercial":
        ctx.moveTo(-0.72, -0.35); ctx.lineTo(0.72, -0.35); ctx.lineTo(0.62, 0.85); ctx.lineTo(-0.62, 0.85); ctx.closePath();
        fillOrStroke();
        ctx.beginPath();
        ctx.arc(0, -0.35, 0.38, Math.PI, 0);
        ctx.lineWidth = 0.2;
        ctx.stroke();
        break;
      case "industrial":
        ctx.moveTo(-0.9, 0.85); ctx.lineTo(-0.9, -0.1); ctx.lineTo(-0.45, -0.45); ctx.lineTo(-0.45, -0.1); ctx.lineTo(0, -0.45);
        ctx.lineTo(0, -0.1); ctx.lineTo(0.35, -0.4); ctx.lineTo(0.35, -0.95); ctx.lineTo(0.75, -0.95); ctx.lineTo(0.75, 0.85); ctx.closePath();
        fillOrStroke();
        break;
      case "school":
        ctx.moveTo(-0.95, -0.2); ctx.lineTo(0, -0.7); ctx.lineTo(0.95, -0.2); ctx.lineTo(0, 0.3); ctx.closePath();
        fillOrStroke();
        ctx.beginPath();
        ctx.moveTo(-0.55, 0.05); ctx.lineTo(-0.55, 0.55); ctx.quadraticCurveTo(0, 0.95, 0.55, 0.55); ctx.lineTo(0.55, 0.05);
        ctx.lineWidth = 0.22;
        ctx.stroke();
        break;
      case "hospital":
        ctx.rect(-0.28, -0.85, 0.56, 1.7); ctx.rect(-0.85, -0.28, 1.7, 0.56);
        fillOrStroke();
        break;
      case "stadium":
        ctx.ellipse(0, 0, 0.92, 0.62, 0, 0, TAU);
        ctx.lineWidth = 0.34;
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(-0.38, -0.2, 0.76, 0.4);
        fillOrStroke();
        break;
      case "airport":
        ctx.moveTo(0, -0.95); ctx.lineTo(0.14, -0.3); ctx.lineTo(0.95, 0.1); ctx.lineTo(0.95, 0.28); ctx.lineTo(0.14, 0.12);
        ctx.lineTo(0.1, 0.62); ctx.lineTo(0.35, 0.85); ctx.lineTo(-0.35, 0.85); ctx.lineTo(-0.1, 0.62); ctx.lineTo(-0.14, 0.12);
        ctx.lineTo(-0.95, 0.28); ctx.lineTo(-0.95, 0.1); ctx.lineTo(-0.14, -0.3); ctx.closePath();
        fillOrStroke();
        break;
      case "port":
        ctx.lineWidth = 0.24;
        ctx.arc(0, -0.62, 0.22, 0, TAU);
        ctx.moveTo(0, -0.4); ctx.lineTo(0, 0.85);
        ctx.moveTo(-0.45, -0.18); ctx.lineTo(0.45, -0.18);
        ctx.moveTo(-0.8, 0.25); ctx.quadraticCurveTo(-0.6, 0.85, 0, 0.85); ctx.quadraticCurveTo(0.6, 0.85, 0.8, 0.25);
        ctx.stroke();
        break;
      default:
        ctx.arc(0, 0, 0.7, 0, TAU);
        fillOrStroke();
    }
    ctx.restore();
  }

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

  const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  };

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
      const scale = Math.min(view.w / bw, view.h / bh) * view.user.zoom;
      return {
        x: (minX + maxX) / 2 + view.user.panX,
        y: (minY + maxY) / 2 + view.user.panY,
        scale: Math.max(0.18, Math.min(3.2, scale)),
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

    function legOffsets(game) {
      const byPair = new Map();
      for (const record of game.lines) {
        const n = record.loop ? record.stops.length : record.stops.length - 1;
        for (let i = 0; i < n; i += 1) {
          const a = record.stops[i];
          const b = record.stops[(i + 1) % record.stops.length];
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          if (!byPair.has(key)) byPair.set(key, []);
          byPair.get(key).push(record.slot);
        }
      }
      for (const list of byPair.values()) list.sort((x, y) => x - y);
      return byPair;
    }

    function legScreen(game, a, b, slot, offsets, w) {
      const pts = core.legPoints(a, b).map(toScreen);
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
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
      return { mono: theme === "classic", dark, paper, ink, theme };
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

    function drawTunnelMarks(game, pts, lk, w) {
      for (let i = 1; i < pts.length; i += 1) {
        const riverScreen = game.city.river.map(toScreen);
        for (const c of crossingPoints(pts[i - 1], pts[i], riverScreen)) {
          const half = core.RULES.riverHalfWidth * view.cam.scale + 3;
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.angle);
          ctx.strokeStyle = lk.ink;
          ctx.lineWidth = Math.max(1.5, w * 0.3);
          ctx.lineCap = "butt";
          for (const side of [-1, 1]) {
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
      const out = [];
      for (const end of ["head", "tail"]) {
        const at = core.station(game, end === "head" ? record.stops[0] : record.stops[record.stops.length - 1]);
        const prev = core.station(game, end === "head" ? record.stops[1] : record.stops[record.stops.length - 2]);
        if (!at || !prev) continue;
        const pts = core.legPoints(prev, at).map(toScreen);
        const clean = cleanPoints(pts);
        const a = clean[clean.length - 2] || clean[0];
        const b = clean[clean.length - 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const reach = r + 16 * ui();
        out.push({ lineId: record.id, end, x: b.x + ux * reach, y: b.y + uy * reach, ux, uy, from: b, w });
      }
      return out;
    }

    function drawLines(game, lk, offsets, w, now) {
      const selected = view.selectedLine;
      const handles = [];
      for (const record of game.lines) {
        const editing = view.gesture && view.gesture.lineId === record.id && view.gesture.working;
        if (editing) continue;
        const dim = selected && selected !== record.id ? 0.28 : 1;
        const n = record.loop ? record.stops.length : record.stops.length - 1;
        for (let i = 0; i < n; i += 1) {
          const a = core.station(game, record.stops[i]);
          const b = core.station(game, record.stops[(i + 1) % record.stops.length]);
          if (!a || !b) continue;
          const pts = legScreen(game, a, b, record.slot, offsets, w);
          // A freshly laid line flashes once, on the wall clock, so it fades
          // while the game is paused too.
          if (!view.seenLines.has(record.id)) view.seenLines.set(record.id, now);
          const age = (now - view.seenLines.get(record.id)) / 1000;
          strokeLine(ctx, pts, record.slot, w, lk, dim);
          if (age < 0.4) {
            ctx.save();
            ctx.globalAlpha = 1 - age / 0.4;
            strokeLine(ctx, pts, record.slot, w * 1.8, lk, 0.5 * dim);
            ctx.restore();
          }
          ctx.save();
          ctx.globalAlpha = dim;
          drawTunnelMarks(game, pts, lk, w);
          ctx.restore();
        }
        for (const h of lineEndHandles(game, record, w)) {
          handles.push(h);
          ctx.save();
          ctx.globalAlpha = dim;
          const stub = [h.from, { x: h.x, y: h.y }];
          strokeLine(ctx, stub, record.slot, w, lk);
          ctx.strokeStyle = lineColor(record.slot, lk);
          ctx.lineWidth = w;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(h.x - h.uy * w * 1.6, h.y + h.ux * w * 1.6);
          ctx.lineTo(h.x + h.uy * w * 1.6, h.y - h.ux * w * 1.6);
          ctx.stroke();
          ctx.restore();
        }
      }
      view.handles = handles;
    }

    function drawTrains(game, lk, offsets, w) {
      const u = ui();
      const carLen = 22 * u;
      const carW = w * 1.55;
      for (const train of game.trains) {
        const record = core.line(game, train.lineId);
        const pose = core.trainPose(game, train);
        let p = toScreen(pose);
        const from = core.station(game, train.from);
        const to = core.station(game, train.to);
        if (record && from && to && from !== to) {
          const key = from.id < to.id ? `${from.id}-${to.id}` : `${to.id}-${from.id}`;
          const list = offsets.get(key) || [record.slot];
          const k = list.indexOf(record.slot);
          const canonicalSign = from.id < to.id ? 1 : -1;
          const shift = (k - (list.length - 1) / 2) * w * 1.15 * canonicalSign;
          p = { x: p.x - Math.sin(pose.angle) * shift, y: p.y + Math.cos(pose.angle) * shift };
        }
        const cars = 1 + train.carriages;
        const color = record ? lineColor(record.slot, lk) : lk.ink;
        const dim = view.selectedLine && record && view.selectedLine !== record.id ? 0.3 : 1;
        ctx.save();
        ctx.globalAlpha = train.retiring ? 0.45 : dim;
        ctx.translate(p.x, p.y);
        ctx.rotate(pose.angle);
        const total = cars * carLen + (cars - 1) * 3 * u;
        for (let c = 0; c < cars; c += 1) {
          const x0 = total / 2 - (c + 1) * carLen - c * 3 * u;
          ctx.fillStyle = color;
          roundRect(ctx, x0, -carW / 2, carLen, carW, 3 * u);
          ctx.fill();
          if (lk.mono) {
            ctx.strokeStyle = lk.paper;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          // Seats: one dot per rider, three by two per car.
          const riders = train.passengers.slice(c * core.RULES.carCapacity, (c + 1) * core.RULES.carCapacity);
          riders.forEach((rider, i) => {
            const cx = x0 + carLen * (0.22 + 0.28 * (i % 3));
            const cy = (i < 3 ? -1 : 1) * carW * 0.22;
            drawGlyph(ctx, rider.dest, cx, cy, carW * 0.19, lk.paper);
          });
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

    function drawStations(game, lk, now) {
      const u = ui();
      const R = 14 * u;
      const tick = game.tick;
      const tps = core.RULES.ticksPerSecond;
      const recentDeliveries = new Map();
      for (const e of game.events) {
        if (e.type === "deliver" && tick - e.tick < tps * 0.6) recentDeliveries.set(e.stationId, tick - e.tick);
      }
      for (const s of game.stations) {
        const p = toScreen(s);
        // Arrival animations run on the wall clock, so a paused city still
        // finishes drawing its new stations.
        if (!view.seenStations.has(s.id)) view.seenStations.set(s.id, now);
        const age = (now - view.seenStations.get(s.id)) / 1000;
        const grow = age < 0.7 ? Math.max(0.01, easeOutBack(Math.min(1, age / 0.7))) : 1;
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
        drawWaiting(s, x, y, r, lk, u);
      }
    }

    function drawWaiting(s, x, y, r, lk, u) {
      const size = 5 * u;
      const step = size * 2.35;
      const shown = Math.min(s.waiting.length, 12);
      for (let i = 0; i < shown; i += 1) {
        const col = i % 6;
        const row = Math.floor(i / 6);
        drawGlyph(ctx, s.waiting[i].dest, x + r + 8 * u + col * step, y - r * 0.55 + row * step, size, lk.ink);
      }
      if (s.waiting.length > 12) {
        ctx.save();
        ctx.fillStyle = lk.ink;
        ctx.font = `600 ${Math.round(10 * u)}px system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(`+${s.waiting.length - 12}`, x + r + 8 * u + 6 * step, y - r * 0.55 + step * 0.5);
        ctx.restore();
      }
    }

    // ----- the pencil: what the drag would build ------------------------

    function previewStops(game) {
      const g = view.gesture;
      if (!g) return null;
      if (g.mode === "create") return { stops: g.chain, loop: g.loop, slot: g.slot };
      if (g.mode === "extend" || g.mode === "insert") return { stops: g.working, loop: g.loop, slot: g.slot, lineId: g.lineId };
      return null;
    }

    function drawPreview(game, lk, w) {
      const g = view.gesture;
      const preview = previewStops(game);
      if (!preview) return;
      const stops = preview.stops.map((id) => core.station(game, id)).filter(Boolean);
      const problem = stops.length >= 2 ? core.validateStops(game, preview.stops, preview.loop, preview.lineId || 0) : "";
      const invalid = problem === "tunnel";
      g.problem = problem;
      const legs = [];
      const n = preview.loop ? stops.length : stops.length - 1;
      for (let i = 0; i < n; i += 1) legs.push(core.legPoints(stops[i], stops[(i + 1) % stops.length]).map(toScreen));
      ctx.save();
      if (invalid) ctx.globalAlpha = 0.45;
      for (const pts of legs) {
        strokeLine(ctx, pts, preview.slot, w, lk);
        drawTunnelMarks(game, pts, lk, w);
      }
      // The rubber band from the working end to the finger.
      if (view.pointerWorld && g.anchor) {
        const anchor = core.station(game, g.anchor);
        if (anchor) {
          const band = core.legPoints(anchor, { id: Infinity, x: view.pointerWorld.x, y: view.pointerWorld.y }).map(toScreen);
          ctx.globalAlpha *= 0.55;
          strokeLine(ctx, band, preview.slot, w, lk);
          if (g.mode === "insert" && g.tailAnchor) {
            const tail = core.station(game, g.tailAnchor);
            if (tail) strokeLine(ctx, core.legPoints({ id: Infinity, x: view.pointerWorld.x, y: view.pointerWorld.y }, tail).map(toScreen), preview.slot, w, lk);
          }
        }
      }
      ctx.restore();
      if (invalid) {
        // Say why at the water.
        for (const pts of legs) {
          const river = game.city.river.map(toScreen);
          for (let i = 1; i < pts.length; i += 1) {
            for (const c of crossingPoints(pts[i - 1], pts[i], river)) {
              ctx.save();
              ctx.strokeStyle = lk.mono ? lk.ink : "#d8322b";
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(c.x - 7, c.y - 7); ctx.lineTo(c.x + 7, c.y + 7);
              ctx.moveTo(c.x + 7, c.y - 7); ctx.lineTo(c.x - 7, c.y + 7);
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }
    }

    function render(now, dt) {
      const game = hooks.game();
      if (!game) return;
      resize();
      updateCamera(game, dt);
      const lk = look();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.fillStyle = lk.paper;
      ctx.fillRect(0, 0, view.w, view.h);
      drawRiver(game, lk);
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const w = 7 * ui();
      const offsets = legOffsets(game);
      drawLines(game, lk, offsets, w, now);
      drawPreview(game, lk, w);
      drawStations(game, lk, now);
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
        const n = record.loop ? record.stops.length : record.stops.length - 1;
        for (let i = 0; i < n; i += 1) {
          const a = core.station(game, record.stops[i]);
          const b = core.station(game, record.stops[(i + 1) % record.stops.length]);
          if (!a || !b) continue;
          const d = distToPolyline(sp, legScreen(game, a, b, record.slot, offsets, w));
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
        return { mode: "extend", lineId: record.id, end: handle.end, working, original: [...record.stops], loop: false, slot: record.slot, anchor: working[working.length - 1] };
      }
      const s = stationAt(game, sp);
      if (s) {
        const slot = firstFreeSlot(game);
        return { mode: "create", chain: [s.id], loop: false, slot: slot < 0 ? 0 : slot, anchor: s.id, start: sp, moved: false, stationId: s.id, noSlot: slot < 0 };
      }
      const leg = legAt(game, sp);
      if (leg) {
        const record = core.line(game, leg.lineId);
        const a = record.stops[leg.index];
        const b = record.stops[(leg.index + 1) % record.stops.length];
        return { mode: "insert", lineId: record.id, index: leg.index, working: [...record.stops], original: [...record.stops], loop: record.loop, slot: record.slot, anchor: a, tailAnchor: b, start: sp, moved: false };
      }
      return { mode: "pan", start: sp, last: sp, moved: false, touch: event.pointerType === "touch" };
    }

    function firstFreeSlot(game) {
      if (core.available(game).lines <= 0) return -1;
      for (let slot = 0; slot < core.RULES.lineSlots; slot += 1) if (!game.lines.some((l) => l.slot === slot)) return slot;
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
        if (g.noSlot) { hooks.onReject?.("no-line"); return; }
        hooks.apply({ type: "line.create", stops: g.chain, loop: g.loop });
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
      selectedLine: () => view.selectedLine,
      stationScreen(id) {
        const game = hooks.game();
        const s = game && core.station(game, id);
        return s ? toScreen(s) : null;
      },
      reset() { view.fitted = false; resetCamera(); view.gesture = null; view.selectedLine = 0; view.seenLines = new Map(); view.seenStations = new Map(); },
      isDrawing: () => Boolean(view.gesture && view.gesture.mode !== "pan" && view.gesture.mode !== "pinch"),
    };
  }

  root.AISystem6RootlineView = Object.freeze({ create, drawGlyph, strokeLine, lineColor, LINE_COLORS });
})(typeof window !== "undefined" ? window : globalThis);
