// @ts-check
// Word diff: what changed between two versions of one text, word by word.
//
// The darkroom's per-layer view ("what did this layer change"), its before /
// after compare, and Review Desk's compare-two-revisions all ask the same
// question, so it has one answer: Myers' O(ND) shortest edit script over
// tokens, after the compare tool of the MIT/Apache pdfcraft editor. A Chinese
// character is a token, a run of Latin letters and digits is a token, white
// space and punctuation are their own tokens — the same split as
// grainTokenize (app/core/grain-diff.js), so the two views agree on what a
// "word" is.
//
// The result is hunks with character offsets into both texts: insert, delete,
// or replace (a delete next to an insert). Offsets are what a view needs to
// highlight a range and to jump to it. Very long texts with many changes are
// compared paragraph by paragraph first, then word by word inside the changed
// paragraphs, so the cost stays bounded.
//
// No DOM, no translations: the executable contract runs this bare.

(function installWordDiff(root) {
  if (root.AISystem6WordDiff) return;

  const WORD_DIFF_EDIT_BUDGET = 1500000;

  function wordDiffTokens(text = "") {
    const tokens = [];
    const pattern = /[぀-ヿ㐀-鿿豈-﫿]|[A-Za-z0-9][A-Za-z0-9'’-]*|\s+|[^\s]/g;
    let match;
    while ((match = pattern.exec(String(text || "")))) tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    return tokens;
  }

  // Myers' greedy forward search with the V arrays kept per step, then a walk
  // back through them. Returns equal/insert/delete runs over token indexes, or
  // null when the edit distance would exceed the budget.
  function myers(a, b, budget = WORD_DIFF_EDIT_BUDGET) {
    const n = a.length;
    const m = b.length;
    const max = n + m;
    const offset = max;
    const trace = [];
    let v = new Int32Array(2 * max + 2);
    let found = -1;
    for (let d = 0; d <= max; d += 1) {
      if ((d + 1) * (max + 1) > budget) return null;
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x += 1; y += 1; }
        v[offset + k] = x;
        if (x >= n && y >= m) { found = d; break; }
      }
      if (found >= 0) break;
    }
    const runs = [];
    let x = n;
    let y = m;
    for (let d = found; d > 0; d -= 1) {
      const previous = trace[d];
      const k = x - y;
      const down = k === -d || (k !== d && previous[offset + k - 1] < previous[offset + k + 1]);
      const prevK = down ? k + 1 : k - 1;
      const prevX = previous[offset + prevK];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) { runs.push(["equal", x - 1, y - 1]); x -= 1; y -= 1; }
      if (down) runs.push(["insert", x, y - 1]);
      else runs.push(["delete", x - 1, y]);
      x = prevX;
      y = prevY;
    }
    while (x > 0 && y > 0) { runs.push(["equal", x - 1, y - 1]); x -= 1; y -= 1; }
    return runs.reverse();
  }

  // Token runs → hunks with character ranges in both texts.
  function hunksFromRuns(runs, aTokens, bTokens, aBase = 0, bBase = 0) {
    const hunks = [];
    let open = null;
    const aAt = (index) => (index < aTokens.length ? aTokens[index].start : (aTokens.at(-1)?.end ?? 0)) + aBase;
    const bAt = (index) => (index < bTokens.length ? bTokens[index].start : (bTokens.at(-1)?.end ?? 0)) + bBase;
    const close = () => {
      if (!open) return;
      open.kind = open.deleted && open.inserted ? "replace" : open.deleted ? "delete" : "insert";
      delete open.deleted;
      delete open.inserted;
      hunks.push(open);
      open = null;
    };
    for (const [op, i, j] of runs) {
      if (op === "equal") { close(); continue; }
      if (!open) open = { kind: "", before: { start: aAt(i), end: aAt(i) }, after: { start: bAt(j), end: bAt(j) }, deleted: false, inserted: false };
      if (op === "delete") {
        open.before.end = aTokens[i].end + aBase;
        open.deleted = true;
      } else {
        open.after.end = bTokens[j].end + bBase;
        open.inserted = true;
      }
    }
    close();
    return hunks;
  }

  function diffTokens(before, after, aBase = 0, bBase = 0) {
    const aTokens = wordDiffTokens(before);
    const bTokens = wordDiffTokens(after);
    // Common head and tail cost nothing to skip and shrink the search.
    let head = 0;
    while (head < aTokens.length && head < bTokens.length && aTokens[head].text === bTokens[head].text) head += 1;
    let tail = 0;
    while (tail < aTokens.length - head && tail < bTokens.length - head
      && aTokens[aTokens.length - 1 - tail].text === bTokens[bTokens.length - 1 - tail].text) tail += 1;
    const aMid = aTokens.slice(head, aTokens.length - tail);
    const bMid = bTokens.slice(head, bTokens.length - tail);
    const runs = myers(aMid.map((token) => token.text), bMid.map((token) => token.text));
    if (!runs) return null;
    // Re-base the middle's offsets onto the whole text.
    const aShift = aMid[0]?.start ?? (aTokens[head - 1]?.end ?? 0);
    const bShift = bMid[0]?.start ?? (bTokens[head - 1]?.end ?? 0);
    const local = (tokens, shift) => tokens.map((token) => ({ ...token, start: token.start - shift, end: token.end - shift }));
    return hunksFromRuns(runs, local(aMid, aShift), local(bMid, bShift), aBase + aShift, bBase + bShift);
  }

  function splitParagraphs(text) {
    const parts = [];
    const pattern = /[^\n]*(?:\n+|$)/g;
    let match;
    while ((match = pattern.exec(text)) && match[0]) parts.push({ text: match[0], start: match.index });
    return parts;
  }

  /**
   * @param {string} before
   * @param {string} after
   * @returns {{ hunks: { kind: "insert"|"delete"|"replace", before: { start: number, end: number }, after: { start: number, end: number } }[], coarse: boolean }}
   */
  function wordDiff(before = "", after = "") {
    const a = String(before || "");
    const b = String(after || "");
    if (a === b) return { hunks: [], coarse: false };
    const fine = diffTokens(a, b);
    if (fine) return { hunks: fine, coarse: false };
    // Too many changes over too much text: paragraphs first, then words inside
    // each changed stretch (and whole paragraphs where even that is too big).
    const aParas = splitParagraphs(a);
    const bParas = splitParagraphs(b);
    const runs = myers(aParas.map((part) => part.text), bParas.map((part) => part.text), Number.MAX_SAFE_INTEGER) || [];
    const hunks = [];
    let pendingA = [];
    let pendingB = [];
    // aAt / bAt: where the next unchanged paragraph begins, which is where an
    // insertion with nothing deleted beside it lands.
    const flush = (aAt, bAt) => {
      if (!pendingA.length && !pendingB.length) return;
      const aStart = pendingA.length ? aParas[pendingA[0]].start : aAt;
      const bStart = pendingB.length ? bParas[pendingB[0]].start : bAt;
      const aText = pendingA.map((index) => aParas[index].text).join("");
      const bText = pendingB.map((index) => bParas[index].text).join("");
      const inner = diffTokens(aText, bText, aStart, bStart);
      if (inner) hunks.push(...inner);
      else hunks.push({ kind: !aText ? "insert" : !bText ? "delete" : "replace", before: { start: aStart, end: aStart + aText.length }, after: { start: bStart, end: bStart + bText.length } });
      pendingA = [];
      pendingB = [];
    };
    for (const [op, i, j] of runs) {
      if (op === "equal") flush(aParas[i].start, bParas[j].start);
      else if (op === "delete") pendingA.push(i);
      else pendingB.push(j);
    }
    flush(a.length, b.length);
    return { hunks, coarse: true };
  }

  /** Counts for a summary line: words added, removed, and hunks. */
  function wordDiffSummary(before, after, hunks) {
    const count = (text) => wordDiffTokens(text).filter((token) => !/^\s+$/.test(token.text) && !/^[^\p{L}\p{N}]$/u.test(token.text)).length;
    return hunks.reduce((summary, hunk) => {
      summary.removed += count(String(before).slice(hunk.before.start, hunk.before.end));
      summary.added += count(String(after).slice(hunk.after.start, hunk.after.end));
      summary[hunk.kind] += 1;
      return summary;
    }, { added: 0, removed: 0, insert: 0, delete: 0, replace: 0 });
  }

  root.AISystem6WordDiff = Object.freeze({ wordDiff, wordDiffTokens, wordDiffSummary });
})(typeof window !== "undefined" ? window : globalThis);
