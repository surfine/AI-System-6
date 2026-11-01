// @ts-check
// Edit kernel: snapping, alignment and distribution for every canvas.
//
// Only Cover Glass snapped (6px to its own edges); the ClioChart canvas, the
// ClioStage page and ClioPaint's floating selection did not. This is the one
// set of rules, after the smart guides of the MIT/Apache vectorcraft editor:
//
// - Targets are gathered once when a drag begins (the other objects' edges and
//   centres, the frame's edges and centre), sorted per axis, and looked up by
//   bisection while the pointer moves — a drag over a crowded page stays cheap.
// - When nothing lines up on an axis, the moving object may snap to a gap that
//   already exists between two neighbours (equal spacing), or to the middle of
//   the two it sits between.
// - Align takes the key object (the one clicked last) as the reference when
//   there is one, the selection's bounds when there is not. Distribute keeps
//   the outermost two where they are.
//
// Rects are { id, x, y, w, h } in one coordinate space. No DOM: the executable
// contract runs this bare, and each editor draws the guides it is handed.

(function installEditSnap(root) {
  if (root.AISystem6EditSnap) return;

  const AXES = /** @type {const} */ ({
    x: { pos: "x", size: "w", cross: "y", crossSize: "h" },
    y: { pos: "y", size: "h", cross: "x", crossSize: "w" },
  });

  function sortedIndex(values, target) {
    let low = 0;
    let high = values.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[mid] < target) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  // The nearest target value to `value`, within `threshold`, by bisection.
  function nearestTarget(targets, value, threshold) {
    if (!targets.length) return null;
    const index = sortedIndex(targets.map((target) => target.at), value);
    let best = null;
    for (const candidate of [targets[index - 1], targets[index]]) {
      if (!candidate) continue;
      const distance = Math.abs(candidate.at - value);
      if (distance <= threshold && (!best || distance < Math.abs(best.at - value))) best = candidate;
    }
    return best;
  }

  function overlapsAcross(a, b, axis) {
    const { cross, crossSize } = AXES[axis];
    return a[cross] < b[cross] + b[crossSize] && b[cross] < a[cross] + a[crossSize];
  }

  /**
   * @param {{ rects: { id?: string, x: number, y: number, w: number, h: number }[],
   *   frame?: { x?: number, y?: number, w: number, h: number },
   *   threshold?: number, maxTargets?: number }} options
   */
  function createSnapper({ rects = [], frame, threshold = 6, maxTargets = 600 } = /** @type {any} */ ({})) {
    const others = rects.slice(0, maxTargets);
    const targets = { x: [], y: [] };
    for (const axis of /** @type {("x"|"y")[]} */ (["x", "y"])) {
      const { pos, size } = AXES[axis];
      for (const rect of others) {
        targets[axis].push(
          { at: rect[pos], kind: "edge", id: rect.id },
          { at: rect[pos] + rect[size] / 2, kind: "center", id: rect.id },
          { at: rect[pos] + rect[size], kind: "edge", id: rect.id },
        );
      }
      if (frame) {
        const start = frame[pos] || 0;
        targets[axis].push(
          { at: start, kind: "frame" },
          { at: start + frame[size] / 2, kind: "frame-center" },
          { at: start + frame[size], kind: "frame" },
        );
      }
      targets[axis].sort((a, b) => a.at - b.at);
    }

    // Snap one axis by lining an edge or the centre up with a target.
    function alignAxis(moving, axis) {
      const { pos, size } = AXES[axis];
      const lines = [moving[pos], moving[pos] + moving[size] / 2, moving[pos] + moving[size]];
      let best = null;
      for (const line of lines) {
        const target = nearestTarget(targets[axis], line, threshold);
        if (target && (!best || Math.abs(target.at - line) < Math.abs(best.delta))) best = { delta: target.at - line, at: target.at, target };
      }
      return best;
    }

    // Equal spacing: the gap to a neighbour matches a gap that already exists
    // between two others in the same row (or column), or the object sits
    // exactly between its two neighbours.
    function spaceAxis(moving, axis) {
      const { pos, size } = AXES[axis];
      const row = others.filter((rect) => overlapsAcross(rect, moving, axis)).sort((a, b) => a[pos] - b[pos]);
      if (!row.length) return null;
      const before = row.filter((rect) => rect[pos] + rect[size] <= moving[pos] + threshold).at(-1);
      const after = row.find((rect) => rect[pos] >= moving[pos] + moving[size] - threshold);
      const gaps = [];
      for (let index = 1; index < row.length; index += 1) {
        const gap = row[index][pos] - (row[index - 1][pos] + row[index - 1][size]);
        if (gap > 0) gaps.push({ gap, from: row[index - 1], to: row[index] });
      }
      const options = [];
      if (before) gaps.forEach((entry) => options.push({ next: before[pos] + before[size] + entry.gap, gap: entry.gap, neighbour: before, side: "before", pair: entry }));
      if (after) gaps.forEach((entry) => options.push({ next: after[pos] - entry.gap - moving[size], gap: entry.gap, neighbour: after, side: "after", pair: entry }));
      if (before && after) {
        const room = after[pos] - (before[pos] + before[size]) - moving[size];
        if (room > 0) options.push({ next: before[pos] + before[size] + room / 2, gap: room / 2, neighbour: before, side: "between", pair: null, other: after });
      }
      let best = null;
      for (const option of options) {
        const delta = option.next - moving[pos];
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { ...option, delta };
      }
      return best;
    }

    /**
     * @param {{ x: number, y: number, w: number, h: number }} moving
     * @param {{ disabled?: boolean }} [options] disabled: ⌥ held, no snapping.
     */
    function snap(moving, { disabled = false } = {}) {
      const result = { x: moving.x, y: moving.y, guides: /** @type {any[]} */ ([]), spacing: /** @type {any[]} */ ([]) };
      if (disabled) return result;
      for (const axis of /** @type {("x"|"y")[]} */ (["x", "y"])) {
        const { pos } = AXES[axis];
        const aligned = alignAxis(moving, axis);
        if (aligned) {
          result[pos] = moving[pos] + aligned.delta;
          result.guides.push({ axis, at: aligned.at, kind: aligned.target.kind });
          continue;
        }
        const spaced = spaceAxis(moving, axis);
        if (spaced) {
          result[pos] = moving[pos] + spaced.delta;
          result.spacing.push({ axis, gap: spaced.gap, side: spaced.side, neighbour: spaced.neighbour.id, pair: spaced.pair ? [spaced.pair.from.id, spaced.pair.to.id] : null });
        }
      }
      return result;
    }

    return { snap, targets };
  }

  const ALIGN = {
    left: ["x", 0], hcenter: ["x", 0.5], right: ["x", 1],
    top: ["y", 0], vcenter: ["y", 0.5], bottom: ["y", 1],
  };

  function boundsOf(rects) {
    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.x + rect.w));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  /**
   * Align to the key object when one is named, else to the selection's bounds.
   * Returns new { id, x, y } for every rect; the key object does not move.
   */
  function alignRects(rects, mode, keyId = "") {
    const spec = ALIGN[mode];
    if (!spec || rects.length < 1) return rects.map(({ id, x, y }) => ({ id, x, y }));
    const [axis, fraction] = spec;
    const { pos, size } = AXES[axis];
    const key = keyId ? rects.find((rect) => rect.id === keyId) : null;
    const reference = key || boundsOf(rects);
    const line = reference[pos] + reference[size] * fraction;
    return rects.map((rect) => {
      const next = { id: rect.id, x: rect.x, y: rect.y };
      if (rect !== key) next[pos] = Math.round(line - rect[size] * fraction);
      return next;
    });
  }

  /**
   * Distribute along an axis, keeping the first and last where they are.
   * mode "spacing" makes the gaps equal; "centers" spaces the centres evenly.
   */
  function distributeRects(rects, axis, mode = "spacing") {
    const { pos, size } = AXES[axis] || AXES.x;
    const sorted = rects.slice().sort((a, b) => a[pos] - b[pos]);
    const moved = new Map(rects.map((rect) => [rect.id, { id: rect.id, x: rect.x, y: rect.y }]));
    if (sorted.length < 3) return [...moved.values()];
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (mode === "centers") {
      const start = first[pos] + first[size] / 2;
      const step = (last[pos] + last[size] / 2 - start) / (sorted.length - 1);
      sorted.forEach((rect, index) => { moved.get(rect.id)[pos] = Math.round(start + step * index - rect[size] / 2); });
    } else {
      const total = sorted.reduce((sum, rect) => sum + rect[size], 0);
      const gap = (last[pos] + last[size] - first[pos] - total) / (sorted.length - 1);
      let cursor = first[pos];
      sorted.forEach((rect) => {
        moved.get(rect.id)[pos] = Math.round(cursor);
        cursor += rect[size] + gap;
      });
    }
    return rects.map((rect) => moved.get(rect.id));
  }

  root.AISystem6EditSnap = Object.freeze({ createSnapper, alignRects, distributeRects, boundsOf });
})(typeof window !== "undefined" ? window : globalThis);
