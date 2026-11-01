// @ts-check
// Compression grain — pure text diff.
//
// A lossy rewrite leaves no visible seam: the model's replacement reads as
// smoothly as the sentence it replaced. These functions compare the current
// body against the writer's own text and return the data the grain view draws:
// which tokens survived a rewrite and how many model passes each rewritten
// stretch went through.
//
// This module touches no DOM, no record, and no translations — it takes text
// and returns data, so the executable feature test can run it in a bare vm
// context. The record-aware and rendering layers live in
// app/features/quick-draft-composition.js.

const GRAIN_DIFF_CELL_BUDGET = 4000000;
const GRAIN_PARAGRAPH_MATCH = 0.25;

function grainTokenize(text = "") {
  return String(text || "").match(/[\u3040-\u30ff\u4e00-\u9fff]|[A-Za-z0-9][A-Za-z0-9'’-]*|\s+|[^\s]/g) || [];
}

function grainBlocks(text = "") {
  return String(text || "").split(/(\n{2,})/);
}

function grainTokenBag(tokens = []) {
  const bag = new Map();
  for (const token of tokens) {
    if (/^\s+$/.test(token)) continue;
    bag.set(token, (bag.get(token) || 0) + 1);
  }
  return bag;
}

function grainOverlap(left, right) {
  let shared = 0;
  let total = 0;
  for (const [token, count] of left) {
    total += count;
    shared += Math.min(count, right.get(token) || 0);
  }
  for (const [token, count] of right) if (!left.has(token)) total += count;
  return total ? shared / total : 0;
}

// The body is tokenized once and every version of the draft is compared
// against that one token list, so a token index means the same thing in all
// of the masks below.
function grainBodyModel(bodyText = "") {
  const tokens = [];
  const blocks = [];
  grainBlocks(bodyText).forEach((block, index) => {
    const isContent = index % 2 === 0 && Boolean(block.trim());
    const blockTokens = isContent ? grainTokenize(block) : [block];
    const start = tokens.length;
    for (const token of blockTokens) tokens.push(token);
    blocks.push({ start, end: tokens.length, text: block, isContent, tokens: blockTokens });
  });
  return { tokens, blocks };
}

// Longest common subsequence over tokens. Marks every body token that also
// appears, in order, in the older version — those are the words that survived
// the rewrite rather than being written by it.
function grainMarkSurvivors(olderTokens, bodyTokens, mask, offset) {
  const n = olderTokens.length;
  const m = bodyTokens.length;
  if (!n || !m || n * m > GRAIN_DIFF_CELL_BUDGET) return;
  const width = m + 1;
  const dp = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] = olderTokens[i] === bodyTokens[j]
        ? dp[(i + 1) * width + (j + 1)] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (olderTokens[i] === bodyTokens[j]) {
      mask[offset + j] = true;
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      i += 1;
    } else {
      j += 1;
    }
  }
}

// A character-level LCS over Chinese finds accidental matches everywhere: one
// 没 surviving inside a rewritten clause is coincidence, not preserved
// authorship, and left alone it turns the view into static. Short survivor
// runs trapped between rewritten runs are absorbed. The rounding only ever
// goes one way — this view must never claim a word is yours when it only
// happens to be the same character.
const GRAIN_MIN_AUTHOR_RUN = 2;

function grainSmoothMask(mask, model) {
  for (const block of model.blocks) {
    if (!block.isContent) continue;
    for (;;) {
      let changed = false;
      let runStart = block.start;
      while (runStart < block.end) {
        let runEnd = runStart;
        while (runEnd < block.end && mask[runEnd] === mask[runStart]) runEnd += 1;
        const flanked = runStart > block.start && runEnd < block.end;
        if (mask[runStart] && flanked) {
          let visible = 0;
          for (let i = runStart; i < runEnd; i += 1) visible += grainVisibleLength(model.tokens[i]);
          if (visible <= GRAIN_MIN_AUTHOR_RUN) {
            for (let i = runStart; i < runEnd; i += 1) mask[i] = false;
            changed = true;
          }
        }
        runStart = runEnd;
      }
      if (!changed) break;
    }
  }
  return mask;
}

// Paragraph first, tokens second. A paragraph the writer moved is still the
// writer's, so blocks match by content rather than by position.
function grainPresenceMask(olderText = "", model) {
  const mask = new Array(model.tokens.length).fill(false);
  const older = String(olderText || "");
  const olderBlocks = grainBlocks(older)
    .filter((block, index) => index % 2 === 0 && block.trim())
    .map((text) => ({ text, tokens: grainTokenize(text), used: false }));
  for (const block of model.blocks) {
    if (!block.isContent) {
      for (let i = block.start; i < block.end; i += 1) mask[i] = true;
      continue;
    }
    const exact = olderBlocks.find((candidate) => !candidate.used && candidate.text === block.text);
    if (exact) {
      exact.used = true;
      for (let i = block.start; i < block.end; i += 1) mask[i] = true;
      continue;
    }
    const bodyBag = grainTokenBag(block.tokens);
    let best = null;
    let bestScore = 0;
    for (const candidate of olderBlocks) {
      if (candidate.used) continue;
      const score = grainOverlap(grainTokenBag(candidate.tokens), bodyBag);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best && bestScore >= GRAIN_PARAGRAPH_MATCH) {
      best.used = true;
      grainMarkSurvivors(best.tokens, block.tokens, mask, block.start);
    }
  }
  return grainSmoothMask(mask, model);
}

// The model rewrites clauses, not tokens, so a stretch that mixes ×3 and ×1
// fragments into badges nobody can read. One contiguous rewritten stretch
// carries one number, and that number is the deepest in it — the same
// one-way rounding the mask smoothing uses: never report less churn than
// actually happened.
function grainCollapseRewritten(runs = []) {
  const collapsed = [];
  for (const run of runs) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.generation && run.generation) {
      last.text += run.text;
      last.generation = Math.max(last.generation, run.generation);
      continue;
    }
    collapsed.push({ ...run });
  }
  return collapsed;
}

function grainRunsFromGenerations(model, generations) {
  const runs = [];
  model.tokens.forEach((token, index) => {
    const generation = generations[index];
    const last = runs[runs.length - 1];
    if (last && last.generation === generation) last.text += token;
    else runs.push({ text: token, generation, source: generation ? "model" : "author" });
  });
  return grainCollapseRewritten(runs);
}

function grainVisibleLength(text = "") {
  return String(text || "").replace(/\s+/g, "").length;
}

// Every model pass stores the body it replaced, so the stored dumps are a
// version chain: entry 0 is the negative, entry k is the state after pass k,
// and the current body is the state after the last pass.
const GRAIN_MAX_VERSIONS = 12;

// The chain is built from record fields, but the rule is pure, so it is
// testable here rather than only through the draft record.
//
// One case has no dump to stand for it. When the first model pass runs on an
// empty body there is nothing to replace, so nothing is dumped — a dump only
// exists when there was a body. The negative is then the empty string, and it
// is recorded by the anchor timestamp alone. It has to be put back at the head
// of the chain, or the first model output takes its place and the whole of it
// reads as the writer's own words.
function grainChainFromRecordParts({ humanAnchor = "", humanAnchorUpdatedAt = "", dumps = [] } = {}) {
  const stored = dumps.map((text) => String(text || "")).filter((text) => text.trim());
  const anchor = String(humanAnchor || "");
  const anchorRecorded = Boolean(humanAnchorUpdatedAt);
  if (!anchorRecorded && !anchor.trim() && !stored.length) {
    return { versions: [], indexes: [], passes: 0 };
  }
  const bornEmpty = anchorRecorded && !anchor.trim();
  const versions = bornEmpty
    ? ["", ...stored]
    : (stored.length ? stored : [anchor]);
  const passes = versions.length;
  const indexes = versions.map((_, index) => index);
  if (passes <= GRAIN_MAX_VERSIONS) return { versions, indexes, passes };
  // The negative is never dropped: the yours/model split depends only on it.
  // Dropping middle versions can only make an old span's depth read low.
  const keep = passes - (GRAIN_MAX_VERSIONS - 1);
  return {
    versions: [versions[0], ...versions.slice(keep)],
    indexes: [0, ...indexes.slice(keep)],
    passes,
  };
}

// FatBits — the grain view zoomed in until one sentence is one cell.
//
// MacPaint's FatBits magnified the canvas until a pixel was a rectangle you
// could hit. The text equivalent needs a unit the writer actually edits, so the
// cell is a sentence rather than a character: a 200-character paragraph would
// otherwise become 200 boxes of nothing.
//
// Structure is cut before sentences are. A line break always ends a cell, so a
// heading, a list item and a quote line each stay whole and a rewrite badge is
// never pinned across two of them.
const GRAIN_CELL_TAIL = /[」』”’）)》】]/;

// A Chinese full stop ends a sentence on its own. An ASCII stop only ends one
// when whitespace or the end of the text follows, so "1.0.49" and "Mr." do not
// split a cell.
function grainIsCellStop(char = "", next = null) {
  if (/[。！？…]/.test(char)) return true;
  if (!/[.!?]/.test(char)) return false;
  return !next || /\s/.test(next.char);
}

// One cell carries the deepest generation inside it — the same one-way rounding
// the rest of this module uses, so a sentence is never reported as less rewritten
// than it is. The parts survive alongside it, because a sentence whose second
// clause alone was rewritten should not read as wholly the model's.
function grainSentenceCells(runs = []) {
  // The runs partition the body exactly, so a running cursor over them gives
  // each cell its offset into the body. An edited cell is spliced back by that
  // offset rather than by searching for its text, which would hit the wrong
  // sentence whenever a draft repeats one.
  const chars = [];
  let cursor = 0;
  for (const run of runs || []) {
    const source = run?.source === "model" ? "model" : "author";
    const generation = Number(run?.generation) || 0;
    for (const char of String(run?.text || "")) {
      chars.push({ char, source, generation, at: cursor });
      cursor += char.length;
    }
  }
  const cells = [];
  let line = 1;
  let current = null;
  const push = (item) => {
    if (!current) current = { line, text: "", generation: 0, parts: [], start: item.at, end: item.at };
    const last = current.parts[current.parts.length - 1];
    if (last && last.source === item.source && last.generation === item.generation) last.text += item.char;
    else current.parts.push({ text: item.char, source: item.source, generation: item.generation });
    current.text += item.char;
    current.end = item.at + item.char.length;
    current.generation = Math.max(current.generation, item.generation);
  };
  const close = () => {
    if (current && current.text.trim()) cells.push(current);
    current = null;
  };
  for (let index = 0; index < chars.length; index += 1) {
    const item = chars[index];
    if (item.char === "\n") {
      close();
      line += 1;
      continue;
    }
    push(item);
    if (!grainIsCellStop(item.char, chars[index + 1])) continue;
    // The closing quote or bracket belongs to the sentence it closes, and a
    // doubled stop (?! or ……) is one ending, not two.
    while (index + 1 < chars.length) {
      const next = chars[index + 1];
      if (!GRAIN_CELL_TAIL.test(next.char) && !grainIsCellStop(next.char, chars[index + 2])) break;
      index += 1;
      push(next);
    }
    close();
  }
  close();
  return cells;
}

// The histogram — the same canvas zoomed out until the whole draft is one
// picture. FatBits answers "what happened to this sentence"; this answers
// "what shape is this draft".
//
// Sentence length is the measure because an over-regular rhythm is the tell
// this product already watches for: a model pass tends to pull every sentence
// toward one comfortable length, and a distribution that has collapsed onto a
// single bar is that pull made visible. Nothing here judges — there is no
// threshold and no warning, because the honest evidence is the writer's own
// negative next to the current body, not a number this module invented.
const GRAIN_HISTOGRAM_BUCKET = 5;
const GRAIN_HISTOGRAM_BUCKETS = 12;

function grainHistogram(cells = []) {
  const buckets = Array.from({ length: GRAIN_HISTOGRAM_BUCKETS }, (unused, index) => ({
    from: index * GRAIN_HISTOGRAM_BUCKET,
    to: index === GRAIN_HISTOGRAM_BUCKETS - 1 ? 0 : ((index + 1) * GRAIN_HISTOGRAM_BUCKET) - 1,
    total: 0,
    model: 0,
  }));
  const lengths = [];
  for (const cell of cells || []) {
    const length = grainVisibleLength(cell?.text);
    if (!length) continue;
    lengths.push(length);
    const index = Math.min(Math.floor(length / GRAIN_HISTOGRAM_BUCKET), GRAIN_HISTOGRAM_BUCKETS - 1);
    buckets[index].total += 1;
    if (Number(cell?.generation) > 0) buckets[index].model += 1;
  }
  lengths.sort((left, right) => left - right);
  const middle = Math.floor(lengths.length / 2);
  return {
    buckets,
    count: lengths.length,
    peak: buckets.reduce((most, bucket) => Math.max(most, bucket.total), 0),
    shortest: lengths[0] || 0,
    longest: lengths[lengths.length - 1] || 0,
    median: lengths.length
      ? (lengths.length % 2 ? lengths[middle] : Math.round((lengths[middle - 1] + lengths[middle]) / 2))
      : 0,
    // How wide the middle half of the draft is. One number for "how much the
    // sentence length still varies", and the one that collapses when every
    // sentence has been pulled toward the same size.
    spread: lengths.length
      ? lengths[Math.floor(lengths.length * 0.75)] - lengths[Math.floor(lengths.length * 0.25)]
      : 0,
  };
}

// A plain text has no runs yet; it is all the writer's, which is what the
// negative is by definition.
function grainHistogramForText(text = "") {
  return grainHistogram(grainSentenceCells([{ text: String(text || ""), source: "author", generation: 0 }]));
}

// The history brush. Photoshop's works by choosing one source state and then
// painting from it, and that is the shape here too: the writer picks a version,
// and each sentence can be taken back from it one at a time. No model is asked
// anything — every word this returns is a word the writer or an earlier pass
// already wrote.
//
// Sentences move between versions, so the match is by content, not position.
// The threshold is the same overlap the paragraph matcher uses: below it the
// answer is "no ancestor found", which the surface has to say out loud rather
// than paint the nearest thing it could find.
function grainAncestorSentence(text = "", olderText = "") {
  const target = grainTokenBag(grainTokenize(String(text || "")));
  if (!target.size) return null;
  let best = null;
  let bestScore = 0;
  for (const cell of grainSentenceCells([{ text: String(olderText || ""), source: "author", generation: 0 }])) {
    const score = grainOverlap(grainTokenBag(grainTokenize(cell.text)), target);
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  if (!best || bestScore < GRAIN_PARAGRAPH_MATCH) return null;
  return { text: best.text, score: bestScore, unchanged: best.text === String(text || "") };
}

// Canvas size, not image size. Photoshop keeps the two apart and the
// difference matters more in text than in pictures: changing the canvas crops,
// and every pixel that stays is untouched; changing the image size resamples,
// and every pixel changes. Quick Draft already has the resample — the density
// layer, which asks a model to rewrite the whole draft denser. This is the
// other one, and it needs no model at all: the frame says where the target
// length falls, and the writer decides what to drop.
//
// Nothing here removes anything. It measures and marks; cutting is the
// writer's hand, one sentence at a time.
function grainCanvasFrame(cells = [], target = 0, measure = grainVisibleLength) {
  const limit = Math.max(0, Math.floor(Number(target) || 0));
  const size = typeof measure === "function" ? measure : grainVisibleLength;
  let used = 0;
  let inside = 0;
  const marks = (cells || []).map((cell) => {
    const length = Math.max(0, Math.floor(Number(size(cell?.text || "")) || 0));
    used += length;
    // A sentence is inside the frame when the draft still fits with it. The
    // first one that does not fit is the edge, and everything after it is
    // outside — it is not deleted, only outside.
    const fits = !limit || used <= limit;
    if (fits) inside += 1;
    return { fits, length, running: used };
  });
  return {
    marks,
    total: used,
    target: limit,
    inside,
    over: limit ? Math.max(0, used - limit) : 0,
    edge: limit && inside < marks.length ? inside : -1,
  };
}

// A span carries the number of model passes that wrote it out: the pass that
// introduced it, plus every later pass that read it and wrote it out again.
// Text that was already in the negative belongs to the writer — generation 0.
function grainGenerations(model, chain, { modelDelivered = "" } = {}) {
  const masks = chain.versions.map((version) => grainPresenceMask(version, model));
  // A token in none of the versions used to be charged to the newest pass,
  // because the chain holds only what each pass replaced — it never holds what
  // the last pass produced. So a sentence the writer typed after that pass read
  // as the model's work. The delivered body is the missing reference: absent
  // from every version and from it too means the writer wrote it afterwards.
  // Without the reference (older records) the reading stays as it was.
  const delivered = String(modelDelivered || "").trim()
    ? grainPresenceMask(modelDelivered, model)
    : null;
  return model.tokens.map((token, index) => {
    const found = masks.findIndex((mask) => mask[index]);
    if (found === 0) return 0;
    if (found < 0 && delivered && !delivered[index]) return 0;
    const introduced = found < 0 ? chain.passes : chain.indexes[found];
    return chain.passes - introduced + 1;
  });
}
