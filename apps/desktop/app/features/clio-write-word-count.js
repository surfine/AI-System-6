/* ClioWrite word count (N15b): 编辑 › 字数统计… opens the small System 6
 * windoid that says what the document — or the selection, when there is one —
 * counts: 中文字 · 英文词 · 字符（不含空格）· 段落.
 *
 * The paragraphs are read through the Quire adapter's own paragraphs() (the
 * document's body story, table cells excluded — ClioWrite tables are
 * read-only), and the text of each paragraph is rebuilt from the model runs
 * with DELETED REVISION TEXT left out: a run carrying rPr.del (the reader's
 * w:del, what the revision list strikes through) is not prose yet. The
 * character classes are the ones the caption's own counter has always used,
 * so the windoid and the flow caption cannot disagree.
 *
 * Like every new ClioWorks dialog this one takes the 「第三稿」 policy — plain
 * System 6 controls, 1-bit. It holds no model code and changes nothing: a
 * read-only window, closed by its close box.
 */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWriteWordCount) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);

  // The caption's own ranges (features/clio-write.js wordCount): U+3400–U+9FFF
  // plus the compatibility ideographs.
  const CJK = /[㐀-鿿豈-﫿]/g;
  const LATIN = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g;

  /** One text's counts: each CJK character is one, a Latin word is one, characters are the non-whitespace ones. */
  function countText(text) {
    const value = String(text || '');
    return {
      cjk: (value.match(CJK) || []).length,
      latin: (value.replace(CJK, ' ').match(LATIN) || []).length,
      chars: value.replace(/\s/g, '').length,
    };
  }

  /** A set of paragraph texts' counts, with the paragraph number itself. */
  function summarize(texts) {
    const list = Array.isArray(texts) ? texts : [];
    const total = { cjk: 0, latin: 0, chars: 0 };
    for (const text of list) {
      const part = countText(text);
      total.cjk += part.cjk;
      total.latin += part.latin;
      total.chars += part.chars;
    }
    return { ...total, paragraphs: list.length };
  }

  /* ------------------------------------------------ the paragraphs, minus 删除 */

  const isDeletedRun = (run) => !!(run && run.rPr && run.rPr.del);

  function modelParagraphs(adapter) {
    const doc = adapter && typeof adapter.document === 'function' ? adapter.document() : null;
    const byId = new Map();
    if (doc && doc.main && Array.isArray(doc.main.blocks)) {
      for (const block of doc.main.blocks) {
        if (block && block.t === 'p') byId.set(String(block.id), block);
      }
    }
    return byId;
  }

  /** The prose of one model paragraph: text runs only, deleted revision text left out. */
  function visibleText(paragraph) {
    if (!paragraph || !Array.isArray(paragraph.runs)) return '';
    return paragraph.runs
      .filter((run) => run && run.t === 'text' && !isDeletedRun(run))
      .map((run) => String(run.text || ''))
      .join('');
  }

  /**
   * The counted paragraphs. Whole document: the adapter's paragraphs(), each
   * rebuilt without its deleted runs. A selection: what the caret covers —
   * one paragraph sliced [from, to) (model offsets, so a revision's deleted
   * text inside the range takes its columns but not its words), or the covered
   * paragraphs whole, the way the surface itself models a multi-paragraph
   * selection.
   */
  function rangeText(paragraph, from, to) {
    let at = 0;
    let out = '';
    for (const run of paragraph.runs || []) {
      const full = run && run.t === 'text' ? String(run.text || '') : '';
      const len = full.length || (run ? 1 : 0);
      const start = Math.max(from, at);
      const end = Math.min(to, at + len);
      if (end > start && full && !isDeletedRun(run)) out += full.slice(start - at, end - at);
      at += len;
    }
    return out;
  }

  function countTexts(adapter, caret) {
    if (!adapter || typeof adapter.paragraphs !== 'function') return { texts: [], selected: false };
    const byId = modelParagraphs(adapter);
    if (caret && !caret.collapsed) {
      const ids = Array.isArray(caret.paragraphIds) ? caret.paragraphIds.map(String) : [];
      if (ids.length) {
        if (caret.paragraphs === 1) {
          const p = byId.get(String(caret.paragraphId));
          return {
            texts: p ? [rangeText(p, Math.max(0, caret.from | 0), Math.max(0, caret.to | 0))] : [''],
            selected: true,
          };
        }
        return { texts: ids.map((id) => visibleText(byId.get(id))), selected: true };
      }
    }
    return { texts: adapter.paragraphs().map((view) => visibleText(byId.get(String(view.id)))), selected: false };
  }

  /** The whole answer at once: the counts, and whether they spoke about a selection. */
  function countsOf(adapter, caret) {
    const { texts, selected } = countTexts(adapter, caret);
    return { counts: summarize(texts), selected };
  }

  /* ------------------------------------------------------------- the windoid */

  let open = null; // { handle, ctx, doc, pane } while the windoid is up

  function fmt(n) {
    const lang = typeof root.currentLanguage === 'string' && root.currentLanguage === 'zh' ? 'zh-CN' : 'en-US';
    try {
      return Number(n || 0).toLocaleString(lang);
    } catch (error) {
      return String(n);
    }
  }

  function h(doc, tag, props = {}, children = []) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : doc.createTextNode(String(child)));
    return node;
  }

  function draw() {
    if (!open) return;
    const { handle, ctx } = open;
    const counts = countsOf(ctx.session.adapter, ctx.session.caret);
    handle.body.textContent = '';
    handle.body.append(
      h(ctx.doc, 'p', { class: 'windoid-note', text: tr(counts.selected ? 'clio_write_word_count_scope_selection' : 'clio_write_word_count_scope_document') }),
      h(ctx.doc, 'p', { class: 'windoid-count', text: tr('clio_write_word_count_line', fmt(counts.counts.cjk), fmt(counts.counts.latin), fmt(counts.counts.chars), fmt(counts.counts.paragraphs)) }),
    );
    handle.place();
  }

  /** ctx: { session, doc, pane, … } — the same handover ClioWrite gives the revisions windoid. */
  function openWindoid(ctx) {
    const write = root.AISystem6ClioWrite;
    const createWindoid = write && typeof write.createWindoid === 'function' ? write.createWindoid : null;
    if (!createWindoid || !ctx || !ctx.session) return;
    const adapter = ctx.session.adapter;
    if (!adapter || typeof adapter.paragraphs !== 'function') return;
    if (open) {
      if (open.pane === ctx.pane) { open.ctx = ctx; draw(); return; }
      close();
    }
    const handle = createWindoid(ctx.doc, ctx.pane, {
      title: tr('clio_write_word_count_title'),
      className: 'cw-word-count-windoid',
      onClose: () => { if (open && open.handle === handle) open = null; },
    });
    open = { handle, ctx, doc: ctx.doc, pane: ctx.pane };
    draw();
  }

  root.AISystem6ClioWriteWordCount = Object.freeze({
    open: openWindoid,
    refresh: draw,
    close() { if (open) open.handle.close(); open = null; },
    // The counting itself, held by contract: pure functions over text, and the
    // pipeline the windoid draws from (an adapter + the caret, minus deleted
    // revision text).
    countText,
    summarize,
    counts: countsOf,
  });
  root.AISystem6ClioWriteWordCountLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
