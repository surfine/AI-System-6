/* Quire — the height of each line, from what the line holds (its portions), as Word sizes lines.
 *
 * Derived from Apache OpenOffice main/sw/source/core/text/porlay.cxx (SwLineLayout::CalcLine, lcl_HasOnlyBlanks),
 * porrst.cxx (SwBreakPortion, SwTxtFrm::EmptyHeight) and porfly.cxx (SwFlyCntPortion::SetBase) (Apache License 2.0).
 *
 * Writer builds a line from portions, each with an ascent and a descent, and makes the line as tall as the largest
 * ascent plus the largest descent. Chromium does the same with a line's inline boxes, so Quire leaves that to
 * Chromium and gives it the right boxes (R.lineBoxes, after R.fillRuns):
 * - text: its font's line (R.runCSS); a run of blanks only, or a superscript, counts for nothing (Word documents:
 *   blanks and tabs don't raise a line, #i3952);
 * - an inline picture, shape, chart or equation: its own height on the baseline (ascent = height, descent 0);
 * - the paragraph's own font, the "strut" every CSS line starts with, counts for nothing once a line holds anything:
 *   there is no paragraph-end portion. A line with nothing that counts takes the paragraph font (EmptyHeight), or the
 *   font of the manual line break that ends it (a break counts only when nothing else set the line's height);
 * - a line holding only pictures is never shorter than the paragraph mark's line, the picture at its foot (Word
 *   documents in LibreOffice: observed by running it, not taken from its code);
 * - exact spacing: every line is the value, the strut sets it and nothing else counts.
 * The helpers that carry a font into a line are empty spans (.ms, with data-z for the caret): Chromium sizes a line
 * that holds only a <br> by its block, never by the <br>'s own style.
 */
(function () {
  'use strict';
  const L = window.L, R = L.R;
  /** counts for nothing in its line: tabs, the list label's space or tab, fillers, anchors and marks */
  const NONE = ['tb', 'lbt', 'lsp', 'zw', 'anc', 'cmk', 'bmk', 'hbrk', 'sectmark', 'fnsep', 'ms'];
  const OBJ = ['img', 'shp', 'obj-missing', 'mml'];
  const BLANK = /^[ 　]+$/;
  /** what a child of .pc is to the height of its line: 'text', 'obj', 'label' or null; makes runs of blanks count
      for nothing (line height 0) and gives text without a line height of its own (field codes) the paragraph's */
  function kind(e, strutLine) {
    if (e.nodeType !== 1 || e.nodeName === 'BR') return null;
    const c = e.classList;
    if (NONE.some((k) => c.contains(k))) return null;
    if (OBJ.some((k) => c.contains(k))) return 'obj';
    if (c.contains('lbl')) return 'label';
    const lh = e.style.lineHeight;
    if (lh === '0' || lh === '0px') return null;   /* superscripts, footnote references */
    const tn = e.firstChild;
    if (tn && tn.nodeType === 3 && !tn.nextSibling && BLANK.test(tn.data)) { e.style.lineHeight = '0'; return null; }
    if (!lh && strutLine != null) e.style.lineHeight = strutLine;
    return 'text';
  }
  /** an empty span that gives its line a font's line: style from run CSS (or another element's style), at offset z;
      at the foot of the line when bottom (below a picture), else on the baseline as text would sit */
  function markStrut(css, z, bottom) {
    const s = document.createElement('span');
    s.className = 'ms';
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = css;
    for (const k of ['color', 'background-color', 'text-decoration-line', 'vertical-align', 'border', 'padding']) s.style.removeProperty(k);
    if (bottom) s.style.verticalAlign = 'bottom';
    s.dataset.z = z;
    return s;
  }
  /**
   * Give each line of a rendered paragraph fragment its height. o: { ls (R.lineSpec), grid (on a document grid),
   * dropCap, markCSS (R.runCSS of the paragraph mark), markFont, markSize (its font-family and font-size), markLine
   * (its line height, as CSS), strutLine (the paragraph's line height as CSS, for text without one of its own),
   * to (the fragment's end offset) }
   */
  R.lineBoxes = function (pc, o) {
    if (o.dropCap) return;
    const kids = [...pc.childNodes];
    /* hard lines: the children up to each <br>; a <br> at the very end (br.fill) ends the last line, nothing follows it */
    const lines = [{ nodes: [], br: null }];
    for (const e of kids) {
      if (e.nodeName === 'BR') { lines[lines.length - 1].br = e; lines.push({ nodes: [], br: null }); }
      else lines[lines.length - 1].nodes.push(e);
    }
    if (kids.length && kids[kids.length - 1].nodeName === 'BR') lines.pop();
    const auto = !o.ls.exact && !o.ls.atLeast && !o.grid;
    for (const ln of lines) {
      ln.has = { text: false, obj: false, label: false };
      for (const e of ln.nodes) { const k = kind(e, auto ? o.strutLine : null); if (k) ln.has[k] = true; }
    }
    const any = lines.some((ln) => ln.has.text || ln.has.obj || ln.has.label);
    if (!any) {
      /* nothing counts: the paragraph mark's font sizes the line (an empty paragraph, only tabs or blanks) */
      pc.style.fontFamily = o.markFont;
      pc.style.fontSize = o.markSize;
      if (!o.ls.exact && !o.ls.atLeast) pc.style.lineHeight = o.markLine;
      return;
    }
    if (o.ls.exact) {
      /* the strut is the line: text of any size sits in it without stretching it (pictures still do: Word clips them) */
      for (const e of kids) if (e.nodeType === 1 && e.nodeName !== 'BR' && !OBJ.some((k) => e.classList.contains(k))) e.style.lineHeight = '0';
      return;
    }
    if (o.ls.atLeast) {
      /* at least: the strut is the minimum; pictures alone take max(minimum, picture) with nothing below them */
      if (lines.every((ln) => !ln.has.text && !ln.has.label)) {
        pc.style.lineHeight = '0';
        const s = markStrut(o.markCSS, o.to, true);
        s.style.lineHeight = o.ls.atLeast + 'px';
        const end = pc.lastChild;
        pc.insertBefore(s, end && end.nodeName === 'BR' ? end : null);
      }
      return;
    }
    if (!auto) return;
    pc.style.lineHeight = '0';
    for (const ln of lines) {
      const { text, obj, label } = ln.has;
      if (text) continue;
      /* the helper goes before the line's <br>, at the caret offset of that break (or the fragment's end) */
      const hard = ln.br && !ln.br.classList.contains('fill');
      const z = hard && ln.br.dataset.o != null ? +ln.br.dataset.o : o.to;
      const css = obj || label || !hard || !ln.br.style.cssText ? o.markCSS : ln.br.style.cssText;
      pc.insertBefore(markStrut(css, z, obj && !label), ln.br);
    }
  };
})();
