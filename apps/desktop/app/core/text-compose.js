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
// Develop runs layer by layer. Layer n reads the output of layer n-1, each
// layer is ONE model call, and every output is cached under the hash of what
// it read plus the layer's own settings. A writer who changes layer 3 re-runs
// layer 3 and the layers after it, and nothing before it: the cache key of
// layer 2 does not mention layer 3. The same chain is what lets the darkroom
// say what each layer changed, because every step keeps its input and output.
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
 * The key one layer's output is cached under: what the layer READ (the
 * sentinel-protected text it was handed -- so the key of layer n names the
 * output of layer n-1 and of nothing after it), the layer itself (kind, stop,
 * scope), the protected ranges, and the context a model's answer depends on.
 * A later layer, and a layer the stack does not reach, are not in it.
 * @param {Record<string, any>} [options]
 */
function layerCacheKey({
  input = "",
  kind = "",
  step,
  strength,
  scope = [],
  protectedRanges = [],
  language = "",
  targetFormat = "",
  targetDuration = "",
  modelId = "",
  promptVersion = 1,
  extra = "",
} = {}) {
  // A layer is addressed by stop (1 / 2 / 3) in the settings and by percentage
  // (25 / 50 / 75) in the working copy; both name the same dial.
  const stop = strength !== undefined
    ? layerCacheStep({ strength })
    : (Number(step) >= 1 && Number(step) <= 3 ? Math.floor(Number(step)) : 2);
  return textComposeHash(JSON.stringify([
    "layer",
    String(input || ""),
    String(kind || ""),
    stop,
    normalizeAdjustmentLayerMask(scope),
    normalizeAdjustmentLayerMask(protectedRanges),
    String(language || ""),
    String(targetFormat || ""),
    String(targetDuration || ""),
    String(modelId || ""),
    Number(promptVersion) || 1,
    String(extra || ""),
  ]));
}

class EmptyLayerOutputError extends Error {
  constructor(kind = "") {
    super(`The ${kind || "adjustment"} layer returned nothing; the text was left as it was.`);
    this.name = "EmptyLayerOutputError";
    this.code = "EMPTY_LAYER_OUTPUT";
    this.kind = kind;
  }
}

function composeLineCount(text = "") {
  return String(text || "").split(/\n/).length;
}

/**
 * Which lines of a layer's input its scope covers. The first layer's scope is
 * written against the writer's body, so it is remapped onto the sentinel
 * layout; a later layer reads another layer's output, whose lines are its own,
 * so its scope is read against that text and clamped to it. Returns the ranges
 * and whether the scope was set at all.
 */
function layerScopeLines(layer, index, input, protectedRanges) {
  const original = normalizeAdjustmentLayerMask(layer?.mask);
  if (!original.length) return { scoped: false, ranges: [] };
  if (index === 0) {
    return { scoped: true, ranges: window.AISystem6ProtectedRanges.remapLineRangesAfterSentinels(original, protectedRanges) };
  }
  const lines = composeLineCount(input);
  const clamped = original
    .map((range) => ({ start: Math.min(range.start, lines), end: Math.min(range.end, lines) }))
    .filter((range) => range.start <= lines);
  return { scoped: true, ranges: clamped };
}

/**
 * The plan for a run, before any call: how many layers will be asked of the
 * model and how many are already in the cache. A layer is a hit only while
 * every layer before it was, because its key names its input. When every layer
 * is a hit the plan also carries the finished text and each step, which is how
 * a stack that was run before can be shown again without asking anyone.
 * @param {Record<string, any>} [options]
 */
function planLayerRun({ source = "", layers = [], protectedRanges = [], cache = null, cacheContext = {}, layerExtra } = {}) {
  const protectedTools = window.AISystem6ProtectedRanges;
  const ranges = normalizeAdjustmentLayerMask(protectedRanges);
  const enabled = (Array.isArray(layers) ? layers : []).filter((layer) => layer?.enabled !== false && String(layer?.kind || "").trim());
  const protectedSource = protectedTools ? protectedTools.protectTextWithSentinels(source, ranges) : { protectedText: String(source || ""), sentinels: [] };
  const restore = (text) => (protectedTools ? protectedTools.restoreProtectedSentinels(text, protectedSource.sentinels) : text);
  let input = protectedSource.protectedText;
  let chained = true;
  let cached = 0;
  let skipped = 0;
  const steps = [];
  enabled.forEach((layer, index) => {
    const scope = layerScopeLines(layer, index, input, ranges);
    if (scope.scoped && !scope.ranges.length) {
      skipped += 1;
      steps.push({ kind: layer.kind, index, key: "", cached: false, skipped: true, input: restore(input), output: restore(input) });
      return;
    }
    if (!chained) return;
    const key = layerCacheKey({
      input,
      kind: layer.kind,
      strength: layer.strength,
      scope: layer.mask,
      protectedRanges: ranges,
      extra: typeof layerExtra === "function" ? layerExtra(layer) : "",
      ...cacheContext,
    });
    if (cache && cache.has(key)) {
      cached += 1;
      const output = cache.get(key);
      steps.push({ kind: layer.kind, index, key, cached: true, skipped: false, input: restore(input), output: restore(output) });
      input = output;
      return;
    }
    chained = false;
  });
  const total = enabled.length - skipped;
  const calls = Math.max(0, total - cached);
  return { total, cached, calls, skipped, steps, text: calls === 0 && total > 0 ? restore(input) : "" };
}

/**
 * Compose the negative with the enabled layers in stored order, one model call
 * per layer. runModel receives { key, layer, index, count, input, sentinels,
 * ranges, scopeLines, source } -- `input` is the sentinel-protected text the
 * layer reads, the previous layer's output for every layer after the first --
 * and returns the raw model text. Protection is enforced here after every
 * layer by strict sentinel verification: a missing, duplicated, unknown or
 * damaged sentinel fails the whole composition, and a layer that returns
 * nothing fails it too rather than erasing the text. Outputs already cached
 * stay cached when a later layer fails.
 *
 * The result carries `steps`, one per layer that ran or was reused, each with
 * its input and output as the writer's text (sentinels restored) -- what the
 * "just this layer" view diffs.
 * @param {Record<string, any>} options
 */
async function composeDocument({
  source = "",
  layers = [],
  protectedRanges = [],
  cache = null,
  cacheContext = {},
  runModel,
  layerExtra,
  onLayer,
}) {
  if (typeof runModel !== "function") throw new Error("composeDocument needs an injected model call");
  const protectedTools = window.AISystem6ProtectedRanges;
  if (!protectedTools) throw new Error("composeDocument needs the protected-ranges runtime");
  const enabled = (Array.isArray(layers) ? layers : [])
    .map((layer) => ({ ...layer, enabled: layer?.enabled !== false }))
    .filter((layer) => layer?.enabled && String(layer?.kind || "").trim());
  const ranges = normalizeAdjustmentLayerMask(protectedRanges);
  const { protectedText, sentinels } = protectedTools.protectTextWithSentinels(source, ranges);
  const restore = (text) => protectedTools.restoreProtectedSentinels(text, sentinels);
  if (!enabled.length) return { text: String(source || ""), steps: [], prefixes: [], protectedText, sentinels, ranges };
  const steps = [];
  let input = protectedText;
  for (let index = 0; index < enabled.length; index += 1) {
    const layer = enabled[index];
    const scopeLines = layerScopeLines(layer, index, input, ranges);
    if (scopeLines.scoped && !scopeLines.ranges.length) {
      // Every line this layer is scoped to is protected or gone: it has nothing
      // to say, and it must not spend a model call saying so.
      steps.push({ kind: layer.kind, index, key: "", cached: false, skipped: true, input: restore(input), output: restore(input) });
      continue;
    }
    const key = layerCacheKey({
      input,
      kind: layer.kind,
      strength: layer.strength,
      scope: layer.mask,
      protectedRanges: ranges,
      extra: typeof layerExtra === "function" ? layerExtra(layer) : "",
      ...cacheContext,
    });
    let output;
    let cached = false;
    if (cache && cache.has(key)) {
      output = cache.get(key);
      cached = true;
    } else {
      const raw = await runModel({
        key,
        layer,
        index,
        count: enabled.length,
        input,
        sentinels,
        ranges,
        scopeLines: scopeLines.ranges,
        source,
      });
      const verification = protectedTools.verifyProtectedSentinels(raw, sentinels);
      if (!verification.valid) throw new ProtectedRangeViolationError(verification.errors);
      output = String(raw ?? "");
      if (!output.trim()) throw new EmptyLayerOutputError(layer.kind);
      if (cache) cache.set(key, output, { kind: layer.kind, step: layerCacheStep(layer), at: new Date().toISOString() });
    }
    const step = { kind: layer.kind, index, key, cached, skipped: false, input: restore(input), output: restore(output) };
    steps.push(step);
    if (typeof onLayer === "function") onLayer(step, { index, count: enabled.length });
    input = output;
  }
  const text = restore(input);
  return { text, steps, prefixes: steps, protectedText, sentinels, ranges };
}

function layerCacheStep(layer) {
  return Math.max(1, ADJUSTMENT_STRENGTHS.indexOf(normalizeAdjustmentStrength(layer?.strength)) + 1);
}

// No model call happens here; composeDocument never touches the DOM, the
// record, translations, or fetch. The protected-range enforcement lives in
// app/core/protected-ranges.js and is shared by every AI write path.
