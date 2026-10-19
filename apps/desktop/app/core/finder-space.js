// Finder spatial math (lazy). Pure: no DOM, no app globals. Contract-tested in finder-placement.
(function () {
  const rectOf = (p, g) => ({ x: p.x, y: p.y, w: g.cellW, h: g.cellH });
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  function gridFor(era, opts = {}) {
    const classic = era === "classic" || era === "system-7" || era === "platinum" || era === "drawing-board" || era === "nextstep";
    if (classic) return { cellW: 64, cellH: 64, originX: 8, originY: 8 };
    const w = opts.iconWidth || 80;
    return { cellW: opts.cell || w, cellH: opts.cell || 88, originX: 8, originY: 8 };
  }
  function cellOf(point, grid) {
    return {
      col: Math.round((point.x - grid.originX) / grid.cellW),
      row: Math.round((point.y - grid.originY) / grid.cellH),
    };
  }
  const posOf = (col, row, grid) => ({ x: grid.originX + col * grid.cellW, y: grid.originY + row * grid.cellH });
  function snap(point, grid) {
    const c = cellOf(point, grid);
    return posOf(c.col, c.row, grid);
  }
  function inBounds(p, grid, bounds) {
    return p.x >= bounds.x && p.y >= bounds.y && p.x + grid.cellW <= bounds.x + bounds.width && p.y + grid.cellH <= bounds.y + bounds.height;
  }
  function nearestFreeCell(point, occupiedRects, grid, bounds) {
    const free = (p) => inBounds(p, grid, bounds) && !occupiedRects.some((r) => hit(rectOf(p, grid), r));
    const start = cellOf(point, grid);
    const maxRing = Math.ceil(Math.max(bounds.width / grid.cellW, bounds.height / grid.cellH)) + 1;
    for (let ring = 0; ring <= maxRing; ring += 1) {
      let best = null;
      let bestD = Infinity;
      for (let dc = -ring; dc <= ring; dc += 1) {
        for (let dr = -ring; dr <= ring; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const p = posOf(start.col + dc, start.row + dr, grid);
          if (!free(p)) continue;
          const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
          if (d < bestD) { best = p; bestD = d; }
        }
      }
      if (best) return best;
    }
    return null;
  }
  function autoArrange(items, bounds, grid, opts = {}) {
    const out = {};
    const keys = items.map((i) => i.key);
    const pinned = opts.pinLastKey && keys.includes(opts.pinLastKey) ? opts.pinLastKey : null;
    const rest = keys.filter((k) => k !== pinned);
    if (opts.anchor === "rows") {
      const cols = Math.max(1, Math.floor((bounds.width - grid.originX) / grid.cellW));
      rest.forEach((k, i) => { out[k] = posOf(i % cols, Math.floor(i / cols), grid); });
      if (pinned) { const i = rest.length; out[pinned] = posOf(i % cols, Math.floor(i / cols), grid); }
      return out;
    }
    const rows = Math.max(1, Math.floor((bounds.height - grid.originY) / grid.cellH));
    const cols = Math.max(1, Math.floor((bounds.width - grid.originX) / grid.cellW));
    const lastCol = cols - 1;
    // Right-edge column, top to bottom; a full column wraps into a new lane leftward.
    // The pinned key takes the bottom-right cell, so the first lane holds rows-1 others.
    let lane = 0;
    let row = 0;
    rest.forEach((k) => {
      if (row >= (pinned && lane === 0 ? rows - 1 : rows)) { lane += 1; row = 0; }
      out[k] = posOf(Math.max(0, lastCol - lane), row, grid);
      row += 1;
    });
    if (pinned) out[pinned] = posOf(lastCol, rows - 1, grid);
    return out;
  }
  function cleanUp(items, grid, bounds, opts = {}) {
    const sel = opts.selectionKeys ? new Set(opts.selectionKeys) : null;
    const moving = items.filter((i) => !sel || sel.has(i.key)).sort((a, b) => a.y - b.y || a.x - b.x);
    const occupied = items.filter((i) => sel && !sel.has(i.key)).map((i) => ({ x: i.x, y: i.y, w: grid.cellW, h: grid.cellH }));
    const out = {};
    moving.forEach((i) => {
      const p = nearestFreeCell({ x: i.x, y: i.y }, occupied, grid, bounds) || { x: i.x, y: i.y };
      out[i.key] = p;
      occupied.push({ x: p.x, y: p.y, w: grid.cellW, h: grid.cellH });
    });
    return out;
  }
  function cleanUpByName(items, grid, bounds, locale) {
    const collator = new Intl.Collator(locale || undefined, { numeric: true });
    const sorted = [...items].sort((a, b) => collator.compare(a.name || "", b.name || ""));
    const cols = Math.max(1, Math.floor((bounds.width - grid.originX) / grid.cellW));
    const out = {};
    sorted.forEach((i, n) => { out[i.key] = posOf(n % cols, Math.floor(n / cols), grid); });
    return out;
  }
  function clampIntoView(pos, size, bounds) {
    const maxX = bounds.x + Math.max(0, bounds.width - size.width);
    const maxY = bounds.y + Math.max(0, bounds.height - size.height);
    return { x: Math.min(Math.max(pos.x, bounds.x), maxX), y: Math.min(Math.max(pos.y, bounds.y), maxY) };
  }
  function duplicateOffset(pos) {
    return { x: pos.x + 16, y: pos.y + 16 };
  }
  function isPhoneViewportPure({ width, height, coarse }) {
    return coarse === true && Math.min(width, height) < 600;
  }
  function nearestInDirection(from, rects, dir) {
    const cx = from.x + from.w / 2;
    const cy = from.y + from.h / 2;
    let best = null;
    let bestScore = Infinity;
    for (const r of rects) {
      const dx = r.x + r.w / 2 - cx;
      const dy = r.y + r.h / 2 - cy;
      const along = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
      if (along <= 0) continue;
      const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 2;
      if (score < bestScore) { best = r; bestScore = score; }
    }
    return best;
  }

  window.AISystem6FinderSpace = { gridFor, snap, cellOf, nearestFreeCell, autoArrange, cleanUp, cleanUpByName, clampIntoView, duplicateOffset, isPhoneViewportPure, nearestInDirection };
  window.AISystem6FinderSpaceLoaded = true;
})();
