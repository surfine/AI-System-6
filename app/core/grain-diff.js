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
// app/features/finder-draft.js.

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
