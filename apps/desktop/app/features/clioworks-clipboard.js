/* ClioWorks N11: the desk's own memory clipboard (features/clioworks-clipboard.js).
 *
 * One clipboard object for the three ClioWorks editors — ClioChart's workbook,
 * ClioWrite, ClioStage — holding a 带来源副本: a FROZEN snapshot of what was
 * copied (表格区域 / 文稿段落 / 演示文字条) plus the reference it came from
 * (源文件 id、范围、时间戳). It lives in the process only: never written to the
 * system clipboard, never persisted, gone on refresh. A paste inside the desk
 * reads this board FIRST — that is how formatting and the source survive an
 * app boundary — and only an empty board falls back to the plain-text system
 * clipboard each app already handled.
 *
 * What leaves the desk is downgraded by hand: text/plain and a simple text/html
 * equivalent (表格 <table>、段落 <p>) and nothing else. The frozen snapshot with
 * its source reference never reaches a page boundary.
 *
 * No DOM at load and no adapter imports: the builders and appliers take the
 * live surfaces as arguments, so the contract drives this module headless the
 * way the S11 surfaces' model halves are driven. The desk glue (config.js
 * ensureClioworksClipboardModule) loads it on the first ClioWorks window that
 * opens. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioworksClipboardLoaded) return;

  const KINDS = Object.freeze(['chart-region', 'write-blocks', 'stage-text']);
  const APPS = Object.freeze(['clioChart', 'clioWrite', 'clioStage']);
  let board = null;

  const fn = (target, name) => !!target && typeof target[name] === 'function';
  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const esc = (text) => String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /** A plain-data deep copy, so the snapshot shares nothing with the live model. */
  function clone(value) {
    if (typeof structuredClone === 'function') { try { return structuredClone(value); } catch (error) { /* fall through */ } }
    return JSON.parse(JSON.stringify(value));
  }
  /** Freeze the copy in depth: after put(), nobody — source app included — can edit it. */
  function deepFreeze(value) {
    if (!value || typeof value !== 'object') return value;
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    return value;
  }

  /**
   * The one writer. `snapshot` is kind-specific structured data (plain JSON
   * shapes only); `source` is { appId, fileId, fileName, range, copiedAt }.
   * Both are cloned and frozen here — what the paste later reads cannot be
   * changed by whoever copied it.
   */
  function put(kind, snapshot, source) {
    if (!KINDS.includes(kind) || !snapshot || typeof snapshot !== 'object') return null;
    const from = source || {};
    const copiedAt = from.copiedAt || (typeof root.Date === 'function' ? new Date().toISOString() : '');
    board = Object.freeze({
      kind,
      snapshot: deepFreeze(clone(snapshot)),
      source: deepFreeze({
        appId: APPS.includes(from.appId) ? from.appId : '',
        fileId: String(from.fileId == null ? '' : from.fileId),
        fileName: String(from.fileName == null ? '' : from.fileName),
        range: String(from.range == null ? '' : from.range),
        copiedAt,
      }),
    });
    return board;
  }
  /** The board's entry, or null when the desk clipboard is empty. The entry is frozen. */
  function peek() { return board; }
  function clear() { board = null; }

  /* ------------------------------------------------ external downgrade */
  // Only these two flavours ever leave the desk; the snapshot and its source
  // reference stay in the process.

  function plainOf(entry) {
    const e = entry || board;
    if (!e) return '';
    if (e.kind === 'chart-region') {
      return (e.snapshot.rows || []).map((row) => row.map((cell) => cell && cell.text != null ? String(cell.text) : '').join('\t')).join('\n');
    }
    if (e.kind === 'write-blocks') return String(e.snapshot.plain || '');
    return (e.snapshot.lines || []).join('\n');
  }

  function blockHtml(block) {
    if (!block || typeof block !== 'object') return '';
    if (block.t === 'tbl') {
      const rows = (block.rows || []).map((row) => '<tr>' + (row.cells || []).map((cell) => {
        const text = (cell.blocks || []).map((p) => (p.runs || []).map((run) => (run && run.t === 'text' ? run.text : '')).join('')).join('<br>');
        return '<td>' + esc(text) + '</td>';
      }).join('') + '</tr>').join('');
      return rows ? '<table>' + rows + '</table>' : '';
    }
    const text = (block.runs || []).map((run) => (run && run.t === 'text' ? run.text : '')).join('');
    return text ? '<p>' + esc(text) + '</p>' : '';
  }
  function htmlOf(entry) {
    const e = entry || board;
    if (!e) return '';
    if (e.kind === 'chart-region') {
      const rows = (e.snapshot.rows || []).map((row) => '<tr>' + row.map((cell) => '<td>' + esc(cell && cell.text) + '</td>').join('') + '</tr>').join('');
      return rows ? '<table>' + rows + '</table>' : '';
    }
    if (e.kind === 'write-blocks') return (e.snapshot.blocks || []).map(blockHtml).join('');
    return (e.snapshot.lines || []).map((line) => '<p>' + esc(line) + '</p>').join('');
  }

  /* ------------------------------------------------------- the reference */
  /** 「来自《file》 range (time)」 — what a receipt or status line shows after a paste. */
  function sourceText(entry) {
    const e = entry || board;
    if (!e) return '';
    return tr('clioworks_clip_source', e.source.fileName || e.source.fileId, e.source.range, e.source.copiedAt);
  }

  /**
   * Best-effort write of the two public flavours to the SYSTEM clipboard, so a
   * copy made for the desk still pastes somewhere outside it. The desk board is
   * never part of this; a refusal is quiet (the desk side already holds its copy).
   */
  function writeSystem(plain, html) {
    return new Promise((resolve) => {
      const doc = root.document;
      if (!doc || !fn(doc, 'createElement') || typeof root.document.execCommand !== 'function') { resolve(false); return; }
      let done = false;
      const onCopy = (event) => {
        if (done) return;
        done = true;
        try {
          event.preventDefault();
          event.clipboardData.setData('text/plain', String(plain || ''));
          event.clipboardData.setData('text/html', String(html || ''));
        } catch (error) { /* the desk board is the copy that matters */ }
      };
      let area = null;
      try {
        doc.addEventListener('copy', onCopy, { once: true });
        area = doc.createElement('textarea');
        area.value = String(plain || '');
        area.setAttribute('readonly', '');
        // One attribute, not per-property style writes: the off-screen spot is
        // transient state for this execCommand fallback, and the desk's
        // inline-layout budget counts each style write.
        area.setAttribute('style', 'position:fixed;left:-9999px');
        (doc.body || doc.documentElement).append(area);
        area.select();
        resolve(doc.execCommand('copy'));
      } catch (error) {
        resolve(false);
      } finally {
        try { if (area && area.remove) area.remove(); } catch (error) { /* gone */ }
        try { doc.removeEventListener('copy', onCopy); } catch (error) { /* gone */ }
      }
    });
  }

  /* ------------------------------------------------------ entry builders */

  /**
   * ClioChart's copy: the workbook session's selected rectangle as a frozen
   * 表格快照 (公式计算值与格式、合并格、列宽). The session owns the reading
   * (clio-chart-workbook.js session.copyRegion); this side only freezes it.
   */
  function chartRegionFromSession(session, meta = {}) {
    if (!fn(session, 'copyRegion')) return null;
    const region = session.copyRegion();
    if (!region) return null;
    return put('chart-region', region, {
      appId: 'clioChart',
      fileId: meta.fileId || session.mountedName || '',
      fileName: meta.fileName || session.fileName || '',
      range: region.ref || '',
    });
  }

  /** ClioWrite's copy: the editor's own block copies (O.copyRange output) plus the plain text. */
  function writeBlocks(blocks, plain, source = {}) {
    if (!Array.isArray(blocks) || !blocks.length) return null;
    return put('write-blocks', { blocks, plain: String(plain || '') }, {
      appId: 'clioWrite',
      fileId: source.fileId || '',
      fileName: source.fileName || '',
      range: source.range || '',
    });
  }

  /** ClioStage's copy: one 文字条 (a text block's lines). */
  function stageText(lines, source = {}) {
    const list = (Array.isArray(lines) ? lines : [lines]).map((line) => String(line == null ? '' : line)).filter((line) => line.trim() !== '');
    if (!list.length) return null;
    return put('stage-text', { lines: list }, {
      appId: 'clioStage',
      fileId: source.fileId || '',
      fileName: source.fileName || '',
      range: source.range || '',
    });
  }

  /**
   * The grid a write-blocks entry pastes into a workbook or a ClioChart region
   * holds: one tbl block becomes its cell texts. No table, no grid (null).
   */
  function tableGridOf(entry) {
    const e = entry || board;
    if (!e || e.kind !== 'write-blocks') return null;
    const table = (e.snapshot.blocks || []).find((block) => block && block.t === 'tbl');
    if (!table) return null;
    const rows = (table.rows || []).map((row) => (row.cells || []).map((cell) => ({
      text: (cell.blocks || []).map((p) => (p.runs || []).map((run) => (run && run.t === 'text' ? run.text : '')).join('')).join('\n'),
    })));
    return rows.length ? rows : null;
  }

  root.AISystem6ClioworksClipboardLoaded = true;
  root.AISystem6ClioworksClipboard = Object.freeze({
    KINDS,
    put,
    peek,
    clear,
    plainOf,
    htmlOf,
    sourceText,
    writeSystem,
    chartRegionFromSession,
    writeBlocks,
    stageText,
    tableGridOf,
  });
})(typeof window !== 'undefined' ? window : this);
