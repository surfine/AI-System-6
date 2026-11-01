// @ts-check
// 文字亮室 — the develop model, pure.
//
// Everything here takes data and returns data: no DOM, no storage, no
// translations, no model. It is the part of the rework after lightcraft's
// develop model that a contract can execute rather than describe:
//
//   - who may write a document the darkroom is developing (the decision table),
//   - the presets that carry a set of layers from one document to another,
//   - the prompt files' step sections, read back into the text a layer sends,
//   - what a layer changed, and how two texts compare (word-diff runs),
//   - and which lines of a body a selection in the darkroom's own pane means.
//
// The record shape and its migration live in app/core/darkroom-record.js; the
// layer-by-layer composition rule lives in app/core/text-compose.js. The
// rendering and the wiring live in app/features/lightroom-develop.js.

const DARKROOM_LAYER_KINDS = Object.freeze(["clean", "mingming", "luoluo", "hkrr", "density"]);
const DARKROOM_PRESET_LIMIT = 24;
const DARKROOM_PRESET_NAME_LIMIT = 40;

// ---- Who may write -------------------------------------------------------------
/**
 * The decision table for "may the darkroom write this document back, and
 * through whom?". It answers with the owner, never just a yes or no, because a
 * refusal has to say which window holds the pen.
 *
 *   inputs
 *     leaseMode   "writer" | "readonly" | "handoff"   the write lease
 *     found       the document exists in this project
 *     isDraft     it is the Quick Draft's own draft
 *     isRouteManuscript   it is the live projection of the route document
 *     phase       "drafting" | "manuscript" | "review" | ""   the route's phase
 *     openIn      "teachText" | ""    which editor holds the document now
 *     routeStop   currentWritingRouteStop(): where the writer's caret is
 *
 *   rules, in order
 *     1. A lease in handoff is flushing its last durable writes and takes no new one.
 *        (A read-only window still writes: the lease holds the connection, not
 *        the writer's permission; the base check on each record keeps that safe.)
 *     2. A document that is not there cannot be written.
 *     3. Quick Draft's own draft is written through Quick Draft.
 *     4. The route document has one editable owner per phase: Section Drafts
 *        while drafting, the manuscript once it owns the text. The darkroom is
 *        never a second one, so it writes only through the manuscript, and only
 *        while the manuscript is the owner and holds the text.
 *     5. Any other document is written through the editor holding it, or, held
 *        by none, straight to its record.
 *
 * @param {{
 *   leaseMode?: string, found?: boolean, isDraft?: boolean, isRouteManuscript?: boolean,
 *   phase?: string, openIn?: string, routeStop?: string,
 * }} input
 * @returns {{ canWrite: boolean, owner: string, path: string, reason: string }}
 */
function darkroomWriteDecision(input = {}) {
  const lease = String(input.leaseMode || "writer");
  // The caret is the tie-breaker for the route document: a manuscript the
  // writer is typing in is held by the manuscript even if the window list has
  // not caught up.
  const openIn = input.openIn === "teachText" || (input.routeStop === "teachText" && input.isRouteManuscript === true)
    ? "teachText"
    : "";
  if (lease === "handoff") return { canWrite: false, owner: "lease", path: "", reason: "handoff" };
  if (input.found === false) return { canWrite: false, owner: "none", path: "", reason: "missing" };
  if (input.isDraft) return { canWrite: true, owner: "quickDraft", path: "draft", reason: "" };
  if (input.isRouteManuscript) {
    const phase = String(input.phase || "");
    if (phase === "drafting") return { canWrite: false, owner: "sectionDrafts", path: "", reason: "route-owned" };
    if (phase === "manuscript" || phase === "review") {
      return openIn === "teachText"
        ? { canWrite: true, owner: "teachText", path: "editor", reason: "" }
        : { canWrite: false, owner: "teachText", path: "", reason: "open-in-owner" };
    }
    return { canWrite: false, owner: "teachText", path: "", reason: "route-unknown" };
  }
  return openIn === "teachText"
    ? { canWrite: true, owner: "teachText", path: "editor", reason: "" }
    : { canWrite: true, owner: "file", path: "record", reason: "" };
}

// ---- Presets ---------------------------------------------------------------------
function darkroomClampStep(step) {
  const value = Math.floor(Number(step));
  return value >= 1 && value <= 3 ? value : 2;
}

/**
 * A preset is an ordered set of layers -- kind, switch and stop -- with a name.
 * It never carries a scope or protected ranges: those are line numbers of one
 * particular text, and on another document they would point at whatever text
 * happens to sit on those lines.
 * @param {any} value
 */
function normalizeDarkroomPreset(value) {
  const source = value && typeof value === "object" ? value : {};
  const seen = new Set();
  const layers = (Array.isArray(source.layers) ? source.layers : [])
    .filter((layer) => layer && DARKROOM_LAYER_KINDS.includes(String(layer.kind || "")) && !seen.has(layer.kind) && seen.add(layer.kind))
    .map((layer) => ({ kind: String(layer.kind), on: layer.on !== false, step: darkroomClampStep(layer.step) }));
  const name = String(source.name || "").replace(/\s+/g, " ").trim().slice(0, DARKROOM_PRESET_NAME_LIMIT);
  if (!name || !layers.length) return null;
  return { id: String(source.id || `preset-${name}`), name, layers, createdAt: String(source.createdAt || "") };
}

/**
 * The preset a stack makes: the layers that are on, in stack order. A stack
 * with nothing on makes no preset.
 * @param {string} name
 * @param {any} settings
 * @param {{ id?: string, now?: string }} [options]
 */
function darkroomPresetFromSettings(name, settings, { id = "", now = "" } = {}) {
  const layers = (Array.isArray(settings?.layers) ? settings.layers : [])
    .filter((layer) => layer?.on === true)
    .map((layer) => ({ kind: layer.kind, on: true, step: layer.step }));
  return normalizeDarkroomPreset({ id: id || `preset-${String(name || "").trim()}`, name, layers, createdAt: now });
}

/**
 * Apply a preset to a document's settings. The preset's layers come first, in
 * its order and with its stops, each scoped to the whole document; every other
 * layer the document already had stays after them, switched off. Protected
 * ranges stay: they are the writer's own locks on this text.
 * @param {any} settings
 * @param {any} presetValue
 */
function applyDarkroomPreset(settings, presetValue) {
  const preset = normalizeDarkroomPreset(presetValue);
  const base = settings && typeof settings === "object" ? settings : { layers: [], protected: [], disabled: false };
  if (!preset) return { ...base, layers: Array.isArray(base.layers) ? base.layers : [] };
  const existing = new Map((Array.isArray(base.layers) ? base.layers : []).map((layer) => [layer.kind, layer]));
  const head = preset.layers.map((layer) => ({ ...(existing.get(layer.kind) || {}), kind: layer.kind, on: layer.on, step: layer.step, scope: [] }));
  const named = new Set(preset.layers.map((layer) => layer.kind));
  const rest = (Array.isArray(base.layers) ? base.layers : [])
    .filter((layer) => !named.has(layer.kind))
    .map((layer) => ({ ...layer, on: false }));
  return { ...base, layers: [...head, ...rest], disabled: false };
}

/**
 * Settings carried to another document: the stack's order, switches and stops
 * and the bypass switch. Not the scopes and not the protected ranges, for the
 * reason a preset carries neither.
 * @param {any} from
 * @param {any} to
 */
function copyDarkroomSettings(from, to) {
  const base = to && typeof to === "object" ? to : { layers: [], protected: [], disabled: false };
  const source = Array.isArray(from?.layers) ? from.layers : [];
  const layers = source
    .filter((layer) => layer && DARKROOM_LAYER_KINDS.includes(String(layer.kind || "")))
    .map((layer) => ({ kind: layer.kind, on: layer.on === true, step: darkroomClampStep(layer.step), scope: [] }));
  const named = new Set(layers.map((layer) => layer.kind));
  const rest = (Array.isArray(base.layers) ? base.layers : []).filter((layer) => !named.has(layer.kind));
  return { ...base, layers: [...layers, ...rest], disabled: from?.disabled === true };
}

/**
 * Add or replace a preset by name, newest last, bounded.
 * @param {any[]} presets
 * @param {any} preset
 */
function darkroomPresetsWith(presets, preset) {
  const next = normalizeDarkroomPreset(preset);
  const list = (Array.isArray(presets) ? presets : []).map(normalizeDarkroomPreset).filter(Boolean);
  if (!next) return list;
  return [...list.filter((item) => item.name !== next.name), next].slice(-DARKROOM_PRESET_LIMIT);
}

/**
 * @param {any[]} presets
 * @param {string} id
 */
function darkroomPresetsWithout(presets, id) {
  return (Array.isArray(presets) ? presets : []).map(normalizeDarkroomPreset).filter((item) => item && item.id !== id);
}

// ---- Layer prompt files -----------------------------------------------------------
/**
 * A layer's prompt file is its instructions, with up to three paragraphs that
 * begin [1], [2], [3] -- the wording for the light, standard and strong stops.
 * Everything else is common to all three. A file with no such paragraph (an
 * override the writer rewrote by hand) is simply used whole at every stop.
 * @param {string} body
 */
function parseLayerPrompt(body) {
  const common = [];
  /** @type {Record<number, string>} */
  const steps = {};
  String(body || "").replace(/\r\n/g, "\n").split(/\n{2,}/).forEach((paragraph) => {
    const match = paragraph.match(/^\[([123])\]\s*([\s\S]*)$/);
    if (match) steps[Number(match[1])] = match[2].trim();
    else if (paragraph.trim()) common.push(paragraph.trim());
  });
  return { common, steps };
}

/**
 * @param {{ common: string[], steps: Record<number, string> }} parsed
 * @param {number} step 1 | 2 | 3
 */
function layerPromptText(parsed, step) {
  const stop = darkroomClampStep(step);
  return [...parsed.common, parsed.steps[stop] || ""].filter(Boolean).join("\n\n");
}

// ---- What changed ---------------------------------------------------------------------
/**
 * Cut a text into runs from the diff's character ranges: the stretches that
 * are the same in both versions, and the stretches that changed on this side.
 * @param {string} text
 * @param {{ start: number, end: number, kind: string }[]} spans
 * @returns {{ text: string, changed: boolean, kind: string }[]}
 */
function darkroomRunsFromSpans(text, spans) {
  const value = String(text || "");
  const runs = [];
  let at = 0;
  [...spans].sort((a, b) => a.start - b.start).forEach((span) => {
    const start = Math.max(at, Math.min(value.length, span.start));
    const end = Math.max(start, Math.min(value.length, span.end));
    if (start > at) runs.push({ text: value.slice(at, start), changed: false, kind: "" });
    if (end > start) runs.push({ text: value.slice(start, end), changed: true, kind: span.kind });
    at = Math.max(at, end);
  });
  if (at < value.length) runs.push({ text: value.slice(at), changed: false, kind: "" });
  return runs;
}

/**
 * Two texts compared word by word, as runs for each side. `before` marks what
 * was taken out or replaced, `after` what was put in or replaced. This is the
 * one answer behind the "just this layer" view, the compare against a version,
 * and the held peek.
 * @param {string} before
 * @param {string} after
 */
function darkroomCompare(before, after) {
  const diff = window.AISystem6WordDiff?.wordDiff?.(before, after) || { hunks: [], coarse: false };
  const side = (key) => diff.hunks
    .map((hunk) => ({ start: hunk[key].start, end: hunk[key].end, kind: hunk.kind }))
    .filter((span) => span.end > span.start);
  const summary = window.AISystem6WordDiff?.wordDiffSummary?.(before, after, diff.hunks)
    || { added: 0, removed: 0, insert: 0, delete: 0, replace: 0 };
  return {
    changed: diff.hunks.length > 0,
    coarse: diff.coarse === true,
    summary,
    before: darkroomRunsFromSpans(before, side("before")),
    after: darkroomRunsFromSpans(after, side("after")),
  };
}

/**
 * What each layer of a run changed, in order. A layer that was skipped, or that
 * handed the text back as it came, changed nothing -- and says so rather than
 * disappearing from the list.
 * @param {{ kind: string, input: string, output: string, cached?: boolean, skipped?: boolean }[]} steps
 */
function darkroomLayerChanges(steps) {
  return (Array.isArray(steps) ? steps : []).map((step, index) => {
    const compare = darkroomCompare(step.input, step.output);
    return {
      index,
      kind: step.kind,
      cached: step.cached === true,
      skipped: step.skipped === true,
      changed: compare.changed,
      added: compare.summary.added,
      removed: compare.summary.removed,
      hunks: compare.summary.insert + compare.summary.delete + compare.summary.replace,
    };
  });
}

// ---- Selection ---------------------------------------------------------------------------
/**
 * The lines of a body that a piece of selected text means, for a selection made
 * in a rendered pane (the reading view drops the Markdown marks, so the
 * selected words are not always a substring of the body). The text is matched
 * with runs of white space collapsed. Only an unambiguous match is a selection:
 * a sentence that appears twice, or one that is not in the body, answers with
 * the reason instead of a guess.
 * @param {string} body
 * @param {string} selected
 * @returns {{ ranges: { start: number, end: number }[], reason: "" | "empty" | "not-found" | "ambiguous" }}
 */
function lineRangesForSelectedText(body, selected) {
  const wanted = String(selected || "").replace(/\s+/g, " ").trim();
  if (!wanted) return { ranges: [], reason: "empty" };
  const text = String(body || "");
  let collapsed = "";
  /** @type {number[]} */
  const origin = [];
  let lastSpace = true;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (!lastSpace) {
        collapsed += " ";
        origin.push(index);
        lastSpace = true;
      }
    } else {
      collapsed += char;
      origin.push(index);
      lastSpace = false;
    }
  }
  const first = collapsed.indexOf(wanted);
  if (first < 0) return { ranges: [], reason: "not-found" };
  if (collapsed.indexOf(wanted, first + 1) >= 0) return { ranges: [], reason: "ambiguous" };
  const from = origin[first];
  const to = origin[first + wanted.length - 1];
  const lineOf = (offset) => text.slice(0, offset).split(/\n/).length;
  return { ranges: [{ start: lineOf(from), end: lineOf(to) }], reason: "" };
}

/**
 * Line numbers (1-based, any order) merged into the sorted inclusive ranges the
 * layers and the locks use.
 * @param {number[]} lines
 */
function darkroomRangesFromLines(lines) {
  const sorted = [...new Set((lines || []).map((line) => Math.floor(Number(line))).filter((line) => line >= 1))].sort((a, b) => a - b);
  const ranges = [];
  for (const line of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && line === last.end + 1) last.end = line;
    else ranges.push({ start: line, end: line });
  }
  return ranges;
}

// ---- The compare sources ---------------------------------------------------------------------
/**
 * What the body can be compared against: the negative, any version, any step
 * of this sitting's history. Each is { id, kind, label, body } with the kind
 * telling the picker how to group them; entries with no text are left out.
 * @param {any} record
 * @param {{ label: string, body: string }[]} historySteps newest last
 * @param {{ negative: string, step: string }} labels
 */
function darkroomCompareSources(record, historySteps, labels) {
  const sources = [];
  if (String(record?.negative || "").trim()) {
    sources.push({ id: "negative", kind: "negative", label: labels.negative, body: String(record.negative) });
  }
  [...(Array.isArray(record?.versions) ? record.versions : [])].reverse().forEach((entry) => {
    if (!String(entry?.body || "").trim()) return;
    sources.push({ id: `version:${entry.id}`, kind: "version", label: String(entry.name || ""), body: String(entry.body), version: entry });
  });
  [...(Array.isArray(historySteps) ? historySteps : [])].reverse().forEach((step, index) => {
    if (!String(step?.body || "").trim()) return;
    sources.push({ id: `step:${historySteps.length - 1 - index}`, kind: "step", label: `${labels.step} ${historySteps.length - index} · ${step.label}`, body: String(step.body) });
  });
  return sources;
}

window.AISystem6DarkroomDevelop = Object.freeze({
  DARKROOM_LAYER_KINDS,
  DARKROOM_PRESET_LIMIT,
  applyDarkroomPreset,
  copyDarkroomSettings,
  darkroomCompare,
  darkroomCompareSources,
  darkroomLayerChanges,
  darkroomPresetFromSettings,
  darkroomPresetsWith,
  darkroomPresetsWithout,
  darkroomRangesFromLines,
  darkroomRunsFromSpans,
  darkroomWriteDecision,
  layerPromptText,
  lineRangesForSelectedText,
  normalizeDarkroomPreset,
  parseLayerPrompt,
});
