// Cover Glass, the parts that are pure: the compositing plan, the cover
// document, and the canvas variants.
//
// Lazy, loaded with liquid-cover.js. No DOM, no WebGL, no translations: the
// executable contract runs this bare, and the WebGL preview and the PNG export
// both draw from the one plan below, so a cover looks the same on screen and in
// the file.
//
// The model, in one paragraph. A cover is a stack of layers, bottom first.
// Pictures (a background, a subject, anything else the writer brings) and
// adjustment layers (brightness/contrast, hue/saturation, blur) are "stack
// layers". The text and shape layers that become glass are a separate band of
// their own that sits in the stack at one place: `glassSlot` stack layers lie
// under the glass, the rest above it. Everything under the glass is what the
// glass refracts; everything above it is drawn over the finished glass. An
// adjustment layer changes every layer beneath it, and only those; a layer set
// to clip is limited to the visible shape of the layer under it.
//
// The idea (a non-destructive layer stack with adjustment layers, clipping and
// a cut-out kept as source + mask) follows the MIT/Apache photocraft editor.
// This is a re-implementation for this renderer, not a port.

(function installCoverModel(root) {
  if (root.AISystem6CoverModel) return;

  const BLEND_MODES = Object.freeze(["normal", "multiply", "screen", "overlay", "darken", "lighten"]);
  const ADJUST_TYPES = Object.freeze(["brightnessContrast", "hueSaturation", "blur"]);
  const PLACEMENTS = Object.freeze(["cover", "registered", "free"]);
  const ROLES = Object.freeze(["background", "subject", "layer"]);
  const ADJUST_DEFAULTS = Object.freeze({
    brightnessContrast: Object.freeze({ brightness: 0, contrast: 0 }),
    hueSaturation: Object.freeze({ hue: 0, saturation: 0, lightness: 0 }),
    blur: Object.freeze({ radius: 0 }),
  });
  const ADJUST_RANGES = Object.freeze({
    brightness: [-100, 100], contrast: [-100, 100],
    hue: [-180, 180], saturation: [-100, 100], lightness: [-100, 100],
    radius: [0, 60],
  });
  const COVER_VERSION = 1;
  const COVER_ARTIFACT_KIND = "cover";

  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const text = (value, fallback = "", limit = 200) => (typeof value === "string" ? value : fallback).slice(0, limit);
  const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);

  // ---- stack layers --------------------------------------------------------

  function normalizeAdjust(raw) {
    const type = oneOf(raw && raw.type, ADJUST_TYPES, "brightnessContrast");
    const out = { type };
    for (const [key, fallback] of Object.entries(ADJUST_DEFAULTS[type])) {
      const [min, max] = ADJUST_RANGES[key];
      out[key] = clamp(raw && raw[key], min, max, fallback);
    }
    return out;
  }

  /** An adjustment that changes nothing is dropped from the plan. */
  function adjustIsIdentity(adjust) {
    if (!adjust) return true;
    if (adjust.type === "blur") return !(adjust.radius > 0);
    if (adjust.type === "hueSaturation") return !adjust.hue && !adjust.saturation && !adjust.lightness;
    return !adjust.brightness && !adjust.contrast;
  }

  /**
   * One stack layer, tolerant of a document written by an older or a damaged
   * build: unknown fields are dropped, numbers are clamped, and a layer
   * that cannot be understood becomes null.
   */
  function normalizeStackLayer(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
    const kind = raw.kind === "adjust" ? "adjust" : raw.kind === "picture" ? "picture" : "";
    if (!kind) return null;
    const layer = {
      id: text(raw.id, "", 80),
      kind,
      name: text(raw.name, "", 40),
      hidden: !!raw.hidden,
      locked: !!raw.locked,
      opacity: clamp(raw.opacity, 0, 1, 1),
      blend: oneOf(raw.blend, BLEND_MODES, "normal"),
      clip: !!raw.clip,
    };
    if (kind === "adjust") {
      layer.adjust = normalizeAdjust(raw.adjust);
      return layer;
    }
    layer.role = oneOf(raw.role, ROLES, "layer");
    layer.assetId = text(raw.assetId, "", 80);
    layer.maskId = text(raw.maskId, "", 80);
    layer.placement = oneOf(raw.placement, PLACEMENTS, layer.role === "background" ? "cover" : "free");
    layer.x = clamp(raw.x, -2, 3, 0.5);
    layer.y = clamp(raw.y, -2, 3, 0.5);
    layer.scale = clamp(raw.scale, 0.02, 10, 1);
    layer.rotation = clamp(raw.rotation, -360, 360, 0);
    if (raw.builtinUrl) layer.builtinUrl = text(raw.builtinUrl, "", 300);
    if (raw.sourceName) layer.sourceName = text(raw.sourceName, "", 120);
    return layer;
  }

  // ---- the compositing plan -----------------------------------------------

  function placementOf(layer) {
    return { mode: layer.placement || "free", x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation || 0 };
  }

  /**
   * Walk one side of the glass, bottom first, and emit draw steps.
   * `below` is the ids already drawn beneath (earlier planes included): an
   * adjustment layer applies to those, and to nothing above it.
   */
  function planSide(layers, below, issues, isReady) {
    const steps = [];
    let base = null; // nearest layer below with clip off: the clipping base
    for (const layer of layers) {
      if (!layer.clip) base = layer;
      const hiddenByBase = layer.clip && base && base !== layer && base.hidden;
      let clipTo = null;
      if (layer.clip) {
        if (!base || base === layer) issues.push({ id: layer.id, reason: "clip-no-base" });
        else if (base.kind !== "picture") issues.push({ id: layer.id, reason: "clip-base-not-picture" });
        else clipTo = { id: base.id, placement: placementOf(base), hasMask: !!base.maskId };
      }
      if (layer.hidden || hiddenByBase) continue;
      if (!(layer.opacity > 0)) continue;
      if (layer.kind === "adjust") {
        if (adjustIsIdentity(layer.adjust)) continue;
        steps.push({
          op: "adjust", id: layer.id, adjust: { ...layer.adjust }, opacity: layer.opacity,
          clipTo, hasMask: !!layer.maskId,
          appliesTo: clipTo ? [clipTo.id] : below.slice(),
        });
        // Adjustments do not draw anything of their own: nothing joins `below`.
        continue;
      }
      if (isReady && !isReady(layer)) continue;
      steps.push({
        op: "picture", id: layer.id, role: layer.role, placement: placementOf(layer),
        blend: layer.blend, opacity: layer.opacity, hasMask: !!layer.maskId, clipTo,
      });
      below.push(layer.id);
    }
    return steps;
  }

  /**
   * The ordered draw steps for a cover.
   *
   * @param {{ stack: object[], glassSlot?: number, isReady?: (layer: object) => boolean }} input
   *   `stack` is every picture and adjustment layer, bottom first; `glassSlot`
   *   is how many of them lie beneath the glass band.
   * @returns {{ backdrop: object[], foreground: object[], issues: object[], order: string[] }}
   *   backdrop: drawn before the glass (what the glass refracts);
   *   foreground: drawn over the finished glass. `order` is every drawn id,
   *   bottom first, with "glass" where the band falls.
   */
  function compositingPlan(input) {
    const stack = (input && input.stack) || [];
    const slot = clamp(input && input.glassSlot, 0, stack.length, 0) | 0;
    const issues = [];
    const below = [];
    const backdrop = planSide(stack.slice(0, slot), below, issues, input && input.isReady);
    below.push("glass");
    const foreground = planSide(stack.slice(slot), below, issues, input && input.isReady);
    const order = [
      ...backdrop.filter((step) => step.op === "picture").map((step) => step.id),
      "glass",
      ...foreground.filter((step) => step.op === "picture").map((step) => step.id),
    ];
    return { backdrop, foreground, issues, order };
  }

  // ---- variants ------------------------------------------------------------

  const GLASS_LAYOUT_KEYS = Object.freeze(["cx", "cy", "fontSize", "rotation"]);
  const STACK_LAYOUT_KEYS = Object.freeze(["x", "y", "scale", "rotation", "placement"]);

  function layoutKeysFor(item) {
    return item && (item.kind === "picture") ? STACK_LAYOUT_KEYS : item && item.kind === "adjust" ? [] : GLASS_LAYOUT_KEYS;
  }

  /** The arrangement of every layer: only where things sit, never what they are. */
  function captureLayout(items) {
    const layout = {};
    for (const item of items || []) {
      if (!item || !item.id) continue;
      const entry = {};
      for (const key of layoutKeysFor(item)) entry[key] = item[key];
      layout[item.id] = entry;
    }
    return layout;
  }

  /** Write an arrangement back onto the same layer objects; identity is kept. */
  function applyLayout(items, layout) {
    for (const item of items || []) {
      const entry = layout && layout[item.id];
      if (!entry) continue;
      for (const key of layoutKeysFor(item)) if (entry[key] !== undefined) item[key] = entry[key];
    }
  }

  /**
   * Go from one variant to another. The layer set is the same; only the
   * arrangement changes. The first visit to a size starts from the current
   * arrangement, so a new size is never empty. The variant left behind keeps
   * what the writer did there.
   *
   * @param {Record<string, { w: number, h: number, layout: object }>} variants mutated
   */
  function switchVariant(variants, fromKey, toKey, items, dims) {
    if (fromKey && variants[fromKey]) variants[fromKey].layout = captureLayout(items);
    let created = false;
    if (!variants[toKey]) {
      variants[toKey] = { w: dims[0], h: dims[1], layout: captureLayout(items) };
      created = true;
    } else {
      applyLayout(items, variants[toKey].layout);
    }
    return { created, w: variants[toKey].w, h: variants[toKey].h };
  }

  // ---- the document ---------------------------------------------------------

  const GLASS_FIELDS = Object.freeze([
    "id", "parentId", "name", "text", "font", "fontSize", "fontWeight", "letterSpacing", "rotation",
    "cx", "cy", "renderMode", "solidColor", "refThickness", "tintColor", "tintAlpha",
    "shapeKind", "shapeAssetId", "hidden", "locked",
  ]);

  function normalizeGlassLayer(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
    const layer = {};
    for (const key of GLASS_FIELDS) if (raw[key] !== undefined && raw[key] !== null) layer[key] = raw[key];
    layer.id = text(raw.id, "", 80);
    layer.parentId = raw.parentId ? text(raw.parentId, "", 80) : null;
    layer.text = text(raw.text, "", 2000);
    layer.name = text(raw.name, "", 40);
    layer.font = text(raw.font, "", 400);
    layer.fontSize = clamp(raw.fontSize, 20, 600, 170);
    layer.fontWeight = clamp(raw.fontWeight, 100, 900, 800);
    layer.letterSpacing = clamp(raw.letterSpacing, -10, 40, 0);
    layer.rotation = clamp(raw.rotation, -360, 360, 0);
    layer.cx = clamp(raw.cx, -0.5, 1.5, 0.5);
    layer.cy = clamp(raw.cy, -0.5, 1.5, 0.5);
    layer.renderMode = raw.renderMode === "solid" ? "solid" : "glass";
    layer.refThickness = clamp(raw.refThickness, 0, 100, 20);
    layer.tintAlpha = clamp(raw.tintAlpha, 0, 100, 0);
    layer.hidden = !!raw.hidden;
    layer.locked = !!raw.locked;
    layer.shapeKind = oneOf(raw.shapeKind, ["circle", "squircle", "capsule"], null);
    layer.shapeAssetId = text(raw.shapeAssetId, "", 80);
    return layer;
  }

  function normalizeBackground(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      kind: oneOf(raw.kind, ["builtin", "asset", "none"], "none"),
      url: text(raw.url, "", 300),
      assetId: text(raw.assetId, "", 80),
    };
  }

  const hexOk = (value, fallback) => (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback);

  /**
   * Everything a cover is, as plain JSON. Pictures are referenced by their
   * imageAttachments id; nothing here holds pixels.
   */
  function serializeCover(state) {
    const doc = {
      v: COVER_VERSION,
      id: text(state.id, "", 80),
      title: text(state.title, "", 120),
      variant: text(state.variant, "16:9", 12),
      variants: {},
      glassSlot: clamp(state.glassSlot, 0, (state.stack || []).length, 0) | 0,
      background: normalizeBackground(state.background),
      stack: (state.stack || []).map(normalizeStackLayer).filter(Boolean),
      layers: (state.layers || []).map(normalizeGlassLayer).filter(Boolean),
      glass: {
        controls: { ...(state.controls || {}) },
        body: clamp(state.body, 0, 100, 0),
        preset: text(state.preset, "", 40),
      },
    };
    for (const [key, variant] of Object.entries(state.variants || {})) {
      doc.variants[text(key, "", 12)] = {
        w: clamp(variant.w, 64, 20000, 1280),
        h: clamp(variant.h, 64, 20000, 720),
        layout: JSON.parse(JSON.stringify(variant.layout || {})),
      };
    }
    // The variant in view is always in the document, with its live layout.
    if (!doc.variants[doc.variant]) {
      doc.variants[doc.variant] = { w: clamp(state.w, 64, 20000, 1280), h: clamp(state.h, 64, 20000, 720), layout: {} };
    }
    doc.variants[doc.variant].layout = captureLayout([
      ...doc.stack.map((layer) => ({ ...layer })),
      ...doc.layers,
    ]);
    return JSON.parse(JSON.stringify(doc));
  }

  /**
   * @returns {{ ok: boolean, doc?: object, reason?: string }}
   */
  function parseCover(value) {
    let raw = value;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch { return { ok: false, reason: "not-json" }; }
    }
    if (!raw || typeof raw !== "object") return { ok: false, reason: "not-object" };
    if (!Number.isFinite(raw.v) || raw.v > COVER_VERSION) return { ok: false, reason: "newer-version" };
    const layers = (Array.isArray(raw.layers) ? raw.layers : []).map(normalizeGlassLayer).filter(Boolean);
    if (!layers.length && !(Array.isArray(raw.stack) && raw.stack.length)) return { ok: false, reason: "empty" };
    const stack = (Array.isArray(raw.stack) ? raw.stack : []).map(normalizeStackLayer).filter(Boolean);
    const variants = {};
    for (const [key, variant] of Object.entries(raw.variants && typeof raw.variants === "object" ? raw.variants : {})) {
      if (!variant || typeof variant !== "object") continue;
      variants[text(key, "", 12)] = {
        w: clamp(variant.w, 64, 20000, 1280),
        h: clamp(variant.h, 64, 20000, 720),
        layout: variant.layout && typeof variant.layout === "object" ? JSON.parse(JSON.stringify(variant.layout)) : {},
      };
    }
    const variantKey = text(raw.variant, Object.keys(variants)[0] || "16:9", 12);
    if (!variants[variantKey]) variants[variantKey] = { w: 1280, h: 720, layout: {} };
    const controls = {};
    for (const [key, entry] of Object.entries(raw.glass && raw.glass.controls ? raw.glass.controls : {})) {
      if (/^lc-[a-z-]+$/.test(key) && (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")) controls[key] = entry;
    }
    const background = normalizeBackground(raw.background);
    const doc = {
      v: COVER_VERSION,
      id: text(raw.id, "", 80),
      title: text(raw.title, "", 120),
      variant: variantKey,
      variants,
      glassSlot: clamp(raw.glassSlot, 0, stack.length, 0) | 0,
      background,
      stack,
      layers,
      glass: {
        controls,
        body: clamp(raw.glass && raw.glass.body, 0, 100, 0),
        preset: text(raw.glass && raw.glass.preset, "", 40),
      },
    };
    // Layout entries that name no layer are dropped; layer colours are kept sane.
    const ids = new Set([...stack.map((l) => l.id), ...layers.map((l) => l.id)]);
    for (const variant of Object.values(doc.variants)) {
      for (const id of Object.keys(variant.layout)) if (!ids.has(id)) delete variant.layout[id];
    }
    for (const layer of doc.layers) {
      layer.solidColor = hexOk(layer.solidColor, "#ffffff");
      layer.tintColor = hexOk(layer.tintColor, "#ffffff");
    }
    return { ok: true, doc };
  }

  /** Every imageAttachments id a document needs. */
  function coverAssetIds(doc) {
    const ids = new Set();
    if (doc.background && doc.background.assetId) ids.add(doc.background.assetId);
    for (const layer of doc.stack || []) {
      if (layer.assetId) ids.add(layer.assetId);
      if (layer.maskId) ids.add(layer.maskId);
    }
    for (const layer of doc.layers || []) if (layer.shapeAssetId) ids.add(layer.shapeAssetId);
    return [...ids];
  }

  /**
   * The readable body of the saved file: what a person sees if the cover is
   * opened as plain text. The layer JSON rides on the document beside it.
   * @param {object} doc
   * @param {Record<string, string>} [labels]
   */
  function coverMarkdown(doc, labels = {}) {
    const L = (key, fallback) => labels[key] || fallback;
    const variant = doc.variants[doc.variant] || { w: 0, h: 0 };
    const lines = [`# ${doc.title || L("cover", "Cover")}`, ""];
    lines.push(`- ${L("size", "Size")}: ${variant.w} × ${variant.h} (${doc.variant})`);
    const sizes = Object.keys(doc.variants);
    if (sizes.length > 1) lines.push(`- ${L("variants", "Sizes")}: ${sizes.join(", ")}`);
    lines.push("", `## ${L("layers", "Layers")} (${L("top_first", "top first")})`, "");
    const rows = [];
    doc.stack.forEach((layer, index) => {
      if (index === doc.glassSlot) rows.push({ glass: true });
      rows.push({ layer });
    });
    if (doc.glassSlot >= doc.stack.length) rows.push({ glass: true });
    // The glass band lists its own layers, top first, at the place it sits.
    const out = [];
    for (const row of rows.reverse()) {
      if (row.glass) {
        for (const g of doc.layers.slice().reverse()) {
          const label = g.shapeKind || g.shapeAssetId ? L("shape", "Shape") : L("text", "Text");
          const body = (g.name || (g.text || "").split("\n")[0] || label).trim();
          out.push(`- ${label}: ${body}${g.hidden ? ` (${L("hidden", "hidden")})` : ""}`);
        }
      } else {
        const layer = row.layer;
        const kind = layer.kind === "adjust"
          ? `${L("adjustment", "Adjustment")} · ${layer.adjust.type}`
          : layer.role === "background" ? L("background", "Background") : layer.role === "subject" ? L("subject", "Subject") : L("picture", "Picture");
        const extras = [];
        if (layer.blend && layer.blend !== "normal") extras.push(layer.blend);
        if (layer.opacity < 1) extras.push(`${Math.round(layer.opacity * 100)}%`);
        if (layer.clip) extras.push(L("clipped", "clipped"));
        if (layer.maskId) extras.push(L("cutout", "cut out"));
        if (layer.hidden) extras.push(L("hidden", "hidden"));
        out.push(`- ${kind}${layer.name ? `: ${layer.name}` : ""}${extras.length ? ` (${extras.join(", ")})` : ""}`);
      }
    }
    return [...lines, ...out, ""].join("\n");
  }

  root.AISystem6CoverModel = Object.freeze({
    BLEND_MODES, ADJUST_TYPES, ADJUST_DEFAULTS, ADJUST_RANGES, PLACEMENTS, ROLES,
    COVER_VERSION, COVER_ARTIFACT_KIND,
    normalizeStackLayer, normalizeAdjust, adjustIsIdentity,
    compositingPlan,
    captureLayout, applyLayout, switchVariant,
    serializeCover, parseCover, coverAssetIds, coverMarkdown,
  });
})(typeof window !== "undefined" ? window : globalThis);
