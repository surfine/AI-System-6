// @ts-check
// Quick Draft adjustment layers — pure data.
//
// The image-editor metaphor: the writer's own text is the negative, and
// 明明传球 / 洛洛接球 / HKRR 抬升 are adjustment layers that sit on top of it.
// Each layer has a switch and a strength parameter; a layer reads the negative
// and never the output of another layer, so no rewrite is ever a lossy
// re-encode of a previous rewrite (the rule that keeps "×n" readings honest).
// A layer may also carry a mask: line-number ranges that scope where the
// layer applies (a textarea cannot paint spans, so the honest representation
// is line ranges — "3-5, 8" — and the mask is always re-clamped against the
// current body at use time).
//
// This module takes data and returns data: no DOM, no record, no translations.
// The record-aware and rendering layers live in app/features/finder-draft.js,
// and the prompt copy that turns a strength into instructions lives beside the
// prompts that consume it.

const ADJUSTMENT_LAYER_KINDS = ["mingming", "luoluo", "hkrr"];
const ADJUSTMENT_STRENGTHS = [25, 50, 75];
const ADJUSTMENT_DEFAULT_STRENGTH = 50;

function defaultAdjustmentLayers() {
  return ADJUSTMENT_LAYER_KINDS.map((kind) => ({
    kind,
    enabled: true,
    strength: ADJUSTMENT_DEFAULT_STRENGTH,
    mask: [],
  }));
}

function normalizeAdjustmentStrength(value) {
  return ADJUSTMENT_STRENGTHS.includes(Number(value)) ? Number(value) : ADJUSTMENT_DEFAULT_STRENGTH;
}

// Accepts "3-5, 8", [3, 5], [{ start: 3, end: 5 }], or empty (= whole body).
// Returns sorted, merged, 1-based inclusive ranges; line numbers below 1 are
// clamped away, and a bare "8" means the single line 8.
function normalizeAdjustmentLayerMask(value) {
  const ranges = [];
  const push = (start, end) => {
    const from = Math.max(1, Math.floor(Number(start) || 0));
    const to = Math.max(from, Math.floor(Number(end) || from));
    ranges.push({ start: from, end: to });
  };
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (!item || typeof item !== "object") return;
      push(item.start, item.end);
    });
  } else {
    String(value || "").split(/[,，;；\s]+/).forEach((part) => {
      const match = String(part).match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);
      if (match) push(match[1], match[2] || match[1]);
    });
  }
  const sorted = ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

// The mask is stored as line numbers but the body changes, so at use time it
// is clamped to the current line count. An empty result means "no mask" (the
// layer applies to the whole body).
function adjustmentLayerMaskRanges(layer, lineCount = 0) {
  const lines = Math.max(0, Math.floor(Number(lineCount) || 0));
  const ranges = normalizeAdjustmentLayerMask(layer?.mask);
  if (!lines || !ranges.length) return [];
  return ranges
    .map((range) => ({ start: Math.min(range.start, lines), end: Math.min(range.end, lines) }))
    .filter((range) => range.start <= lines);
}

function adjustmentMaskSummary(ranges = []) {
  return ranges.map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`)).join(", ");
}

// The stack preserves the stored order (the user can reorder layers), fills in
// any missing known layer at the end, and drops unknown kinds — so a record
// that has never touched the layers still behaves as three standard layers,
// and a record that disabled or moved one keeps that state.
function normalizeAdjustmentLayers(value) {
  const source = Array.isArray(value) ? value : [];
  const ordered = [];
  const seen = new Set();
  source.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const kind = String(item.kind || "");
    if (!ADJUSTMENT_LAYER_KINDS.includes(kind) || seen.has(kind)) return;
    seen.add(kind);
    ordered.push({
      kind,
      enabled: item.enabled !== false,
      strength: normalizeAdjustmentStrength(item.strength),
      mask: normalizeAdjustmentLayerMask(item.mask),
    });
  });
  ADJUSTMENT_LAYER_KINDS.forEach((kind) => {
    if (seen.has(kind)) return;
    ordered.push({ kind, enabled: true, strength: ADJUSTMENT_DEFAULT_STRENGTH, mask: [] });
  });
  return ordered;
}

function adjustmentLayer(kind = "", layers) {
  return normalizeAdjustmentLayers(layers).find((layer) => layer.kind === kind) || null;
}

// A disabled layer has no strength: the command is off, not "zero-strength on".
function adjustmentStrength(kind = "", layers) {
  const layer = adjustmentLayer(kind, layers);
  return layer && layer.enabled ? layer.strength : null;
}
