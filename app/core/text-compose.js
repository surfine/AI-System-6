// @ts-check
// Quick Draft text composition — pure data.
//
// Task 4 of 文字亮室: the body is the negative plus the enabled adjustment
// layers applied in stored order, and an AI operation is non-destructive
// until the writer develops it. The composition rule is pure so a test can
// execute it: the cache key function, the layer ordering, and the protected
// range subtraction all take data and return data. The model call is not
// pure, so it is injected — composeDocument never talks to a model itself.
//
// Every layer reads the negative and never another layer's output, so each
// prefix of the stack is a separate cache key. Computing the full stack also
// caches every shorter prefix, which is what makes "switch the last layer off
// and look again" a cache hit with no model call.
//
// Protected ranges are a property of the text, not of a layer: the writer
// protects a quote from everything. They reuse the shared line-range parser
// from app/core/adjustment-layers.js — there is deliberately no second range
// parser in this module.

const TEXT_COMPOSE_HASH_MOD = 0xffffffff;

// A small deterministic string hash for cache keys. It is not a security
// primitive; it only needs to change when the source, the layer stack, or the
// protected ranges change.
function textComposeHash(text = "") {
  let hash = 5381;
  for (let index = 0; index < String(text).length; index += 1) {
    hash = ((hash << 5) + hash + String(text).charCodeAt(index)) >>> 0;
  }
  return `tc-${(hash % TEXT_COMPOSE_HASH_MOD).toString(36)}`;
}

// The cache key covers everything a composite depends on: the negative text,
// the enabled layer stack (kind, switch, strength, mask), and the protected
// ranges. A layer reads the negative, so the negative text is part of the key;
// the strength is a transform parameter, not a blend amount, so it is part of
// the signature too.
function composeCacheKey({ source = "", layers = [], protectedRanges = [] } = {}) {
  const signature = (Array.isArray(layers) ? layers : [])
    .map((layer) => ({
      kind: String(layer?.kind || ""),
      enabled: layer?.enabled !== false,
      strength: normalizeAdjustmentStrength(layer?.strength),
      mask: normalizeAdjustmentLayerMask(layer?.mask),
    }))
    .filter((layer) => layer.kind);
  const protectedSignature = normalizeAdjustmentLayerMask(protectedRanges);
  return textComposeHash(JSON.stringify([
    String(source || ""),
    signature,
    protectedSignature,
  ]));
}

// Every model call subtracts the protected ranges before it sends the body.
// The writer's protected lines are removed from the source text the model can
// touch, and returned as quoted blocks the prompt must reproduce verbatim.
function subtractProtectedRanges(source = "", protectedRanges = []) {
  const text = String(source || "");
  const lines = text.split(/\n/);
  const ranges = normalizeAdjustmentLayerMask(protectedRanges);
  const excluded = new Set();
  ranges.forEach((range) => {
    for (let line = range.start; line <= Math.min(range.end, lines.length); line += 1) excluded.add(line);
  });
  const sourceText = lines
    .map((line, index) => (excluded.has(index + 1) ? null : line))
    .filter((line) => line !== null)
    .join("\n");
  const protectedBlocks = ranges
    .map((range) => {
      if (range.start > lines.length) return null;
      const start = Math.min(range.start, lines.length);
      const end = Math.min(range.end, lines.length);
      return { start, end, text: lines.slice(start - 1, end).join("\n") };
    })
    .filter(Boolean);
  return { sourceText, protectedBlocks, ranges };
}

// A layer's mask is stored against the original body's line numbers, but the
// prompt receives the body with protected lines subtracted. This remaps the
// mask onto the subtracted text so the layer instruction stays precise: each
// remaining line moves up by the number of protected lines before it, and a
// range whose lines are all protected disappears entirely.
function remapRangesAfterSubtraction(ranges = [], protectedRanges = []) {
  const excludedLines = new Set();
  normalizeAdjustmentLayerMask(protectedRanges).forEach((range) => {
    for (let line = range.start; line <= range.end; line += 1) excludedLines.add(line);
  });
  const excluded = [...excludedLines].sort((a, b) => a - b);
  const runs = [];
  let run = null;
  normalizeAdjustmentLayerMask(ranges).forEach((range) => {
    for (let line = range.start; line <= range.end; line += 1) {
      if (excludedLines.has(line)) {
        run = null;
        continue;
      }
      let removed = 0;
      for (const excludedLine of excluded) {
        if (excludedLine < line) removed += 1;
        else break;
      }
      const position = line - removed;
      if (run && run.end === position - 1) {
        run.end = position;
      } else {
        run = { start: position, end: position };
        runs.push(run);
      }
    }
    run = null;
  });
  return runs;
}

// After a pass the protected ranges must be byte-identical to the stored text.
// If a protected line came back changed — or vanished — restore the stored
// text for that range and report which ranges had to be restored. A protection
// is never reported as enforced when it was not.
function restoreProtectedRanges(text = "", source = "", protectedRanges = []) {
  const draftLines = String(text || "").split(/\n/);
  const sourceLines = String(source || "").split(/\n/);
  const ranges = normalizeAdjustmentLayerMask(protectedRanges);
  const next = [...draftLines];
  const restored = [];
  ranges.forEach((range) => {
    if (range.start > sourceLines.length) return;
    const start = Math.min(range.start, sourceLines.length);
    const end = Math.min(range.end, sourceLines.length);
    const stored = sourceLines.slice(start - 1, end);
    if (!stored.length) return;
    const clampStart = Math.min(start, next.length + 1);
    const clampEnd = Math.min(end, next.length);
    const draftSlice = next.slice(clampStart - 1, clampEnd);
    if (draftSlice.join("\n") === stored.join("\n")) return;
    if (clampStart <= next.length) {
      next.splice(clampStart - 1, clampEnd - clampStart + 1, ...stored);
    } else {
      // The protected lines vanished from the model output; put the stored
      // text back at the end of the body rather than silently losing it.
      next.push(...stored);
    }
    restored.push({ start: clampStart, end: clampStart + stored.length - 1 });
  });
  return { text: next.join("\n"), restored };
}

// Compose the negative with the enabled layers in stored order. Each prefix is
// one model pass over the negative; the result of the last enabled layer is
// the composite. The model call is injected: runModel receives everything the
// prompt needs (the unprotected source text, the quoted protected blocks, and
// the prefix layers) and returns the raw model text. Protection is enforced
// here, after every pass, by the same pure restore used everywhere else.
async function composeDocument({ source = "", layers = [], protectedRanges = [], cache = null, runModel }) {
  if (typeof runModel !== "function") throw new Error("composeDocument needs an injected model call");
  const enabled = (Array.isArray(layers) ? layers : [])
    .map((layer) => ({ ...layer, enabled: layer?.enabled !== false }))
    .filter((layer) => layer?.enabled && String(layer?.kind || "").trim());
  const { sourceText, protectedBlocks, ranges } = subtractProtectedRanges(source, protectedRanges);
  const prefixes = [];
  let text = String(source || "");
  for (let index = 0; index < enabled.length; index += 1) {
    const prefix = enabled.slice(0, index + 1);
    const key = composeCacheKey({ source, layers: prefix, protectedRanges: ranges });
    let cached = false;
    let restored = [];
    if (cache && cache.has(key)) {
      text = cache.get(key);
      cached = true;
    } else {
      const raw = await runModel({ key, source, sourceText, protectedBlocks, layers: prefix, ranges });
      const enforced = restoreProtectedRanges(raw, source, ranges);
      text = enforced.text;
      restored = enforced.restored;
      if (cache) cache.set(key, text);
    }
    prefixes.push({ key, text, cached, restored });
  }
  return { text, prefixes, sourceText, protectedBlocks, ranges };
}
