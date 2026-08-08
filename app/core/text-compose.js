// @ts-check
// Quick Draft text composition — pure data.
//
// Task 4 of 文字亮室: the body is the negative plus the enabled adjustment
// layers applied in stored order, and an AI operation is non-destructive
// until the writer develops it. The composition rule is pure so a test can
// execute it: the cache key function, the layer ordering, and the protected
// range enforcement all take data and return data. The model call is not
// pure, so it is injected — composeDocument never talks to a model itself.
//
// One Apply is one composite request for the exact enabled stack. We never
// speculate by precomputing shorter prefixes the writer has not requested.
//
// Protected ranges are a property of the text, not of a layer: the writer
// protects a quote from everything. Enforcement is immutable sentinel based
// (see app/core/protected-ranges.js): before a pass the protected regions are
// replaced by unique ⟦AI6_PROTECTED_<hash>⟧ tokens, the model must reproduce
// them verbatim, and after the pass verification is strict — every sentinel
// exactly once, no unknown or damaged tokens. Any violation throws
// ProtectedRangeViolationError and the whole composition fails. There is no
// guess-by-position restore and no appending protected text at the end.

const TEXT_COMPOSE_HASH_MOD = 0xffffffff;

class ProtectedRangeViolationError extends Error {
  constructor(errors = []) {
    super(`Protected ranges were not preserved verbatim:\n${errors.join("\n")}`);
    this.name = "ProtectedRangeViolationError";
    this.code = "PROTECTED_RANGE_VIOLATION";
    this.details = [...errors];
  }
}

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
function composeCacheKey({
  source = "",
  layers = [],
  protectedRanges = [],
  language = "",
  targetFormat = "",
  targetDuration = "",
  modelId = "",
  promptVersion = 1,
} = {}) {
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
    String(language || ""),
    String(targetFormat || ""),
    String(targetDuration || ""),
    String(modelId || ""),
    Number(promptVersion) || 1,
  ]));
}

/**
 * Compose the negative with the enabled layers in stored order. The complete
 * stack is one model pass over the negative. The model call is injected: runModel receives everything the
 * prompt needs (the sentinel-protected source text, the sentinel map, and the
 * prefix layers) and returns the raw model text. Protection is enforced here,
 * after every pass, by strict sentinel verification: any missing, duplicated,
 * unknown, or damaged sentinel fails the whole composition.
 */
async function composeDocument({ source = "", layers = [], protectedRanges = [], cache = null, cacheContext = {}, runModel }) {
  if (typeof runModel !== "function") throw new Error("composeDocument needs an injected model call");
  const protectedTools = window.AISystem6ProtectedRanges;
  if (!protectedTools) throw new Error("composeDocument needs the protected-ranges runtime");
  const enabled = (Array.isArray(layers) ? layers : [])
    .map((layer) => ({ ...layer, enabled: layer?.enabled !== false }))
    .filter((layer) => layer?.enabled && String(layer?.kind || "").trim());
  const ranges = normalizeAdjustmentLayerMask(protectedRanges);
  const { protectedText, sentinels } = protectedTools.protectTextWithSentinels(source, ranges);
  if (!enabled.length) return { text: String(source || ""), prefixes: [], protectedText, sentinels, ranges };
  const key = composeCacheKey({ source, layers: enabled, protectedRanges: ranges, ...cacheContext });
  let cached = false;
  let text;
  if (cache && cache.has(key)) {
    text = cache.get(key);
    cached = true;
  } else {
    const raw = await runModel({ key, source, protectedText, sentinels, layers: enabled, ranges });
    const verification = protectedTools.verifyProtectedSentinels(raw, sentinels);
    if (!verification.valid) throw new ProtectedRangeViolationError(verification.errors);
    text = protectedTools.restoreProtectedSentinels(raw, sentinels);
    if (cache) cache.set(key, text);
  }
  const prefixes = [{ key, text, cached }];
  return { text, prefixes, protectedText, sentinels, ranges };
}

// No model call happens here; composeDocument never touches the DOM, the
// record, translations, or fetch. The protected-range enforcement lives in
// app/core/protected-ranges.js and is shared by every AI write path.
