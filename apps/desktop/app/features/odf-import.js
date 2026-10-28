/* ODF import (odt / ods / odp → editable Office copy). Owner decision
 * 2026-10-24 「ODF 导入成副本」: GenOffice imports an OpenDocument file as an
 * editable OOXML copy; the original file stays on the File Floppy untouched.
 *
 * Lazy module — the desk loads it on the first ODF import and never at boot.
 * It unzips the OpenDocument package with the vendored zip reader
 * (vibeoffice/common/zip.js), reads content.xml / styles.xml / meta.xml /
 * Pictures/*, builds the same models the vendored codecs build, and writes
 * OOXML bytes with their writers. The codecs are loaded through the ClioWorks
 * adapters, whose MODULES lists own the order and the completeness check.
 *
 * Scope is a faithful-enough copy for daily editing: text, paragraphs and
 * headings, bold/italic/underline, lists, simple tables and images (odt);
 * cell values, formulas where they translate 1:1 (otherwise the cached value),
 * multiple sheets (ods); slides with their text frames and images (odp).
 * Anything not converted lands in `notCarried` as translation KEYS — the
 * caller maps them through t() — so the writer always sees the short
 * 「这些内容没有带过来」list, never a silent drop.
 *
 * No UI here. User-visible strings live in the two translation files. */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------- codec loading */
  // The adapters own the codec module lists; loading through them is exactly
  // how the desk itself loads these codecs (quire-adapter.js et al.).
  const CODEC_ADAPTERS = {
    odt: { script: 'app/vendor/clioworks-v3/quire-adapter.js', global: 'ClioWorksQuireAdapter' },
    ods: { script: 'app/vendor/clioworks-v3/ledger-adapter.js', global: 'ClioWorksLedgerAdapter' },
    odp: { script: 'app/vendor/clioworks-v3/lectern-adapter.js', global: 'ClioWorksLecternAdapter' },
  };
  const codecPromises = {};

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('odf-import: failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  /** Load one codec family through its adapter. Rejects leave no partial retry state. */
  function ensureCodec(kind) {
    const def = CODEC_ADAPTERS[kind];
    if (!def) return Promise.reject(new Error('odf-import: unknown ODF kind ' + kind));
    if (codecPromises[kind]) return codecPromises[kind];
    codecPromises[kind] = (async () => {
      if (!root[def.global]) await loadScript(def.script);
      const adapter = root[def.global];
      if (!adapter || typeof adapter.loadCodec !== 'function') throw new Error('odf-import: ' + def.global + ' did not install');
      return adapter.loadCodec();
    })().catch((error) => {
      codecPromises[kind] = null;
      throw error;
    });
    return codecPromises[kind];
  }

  /* ------------------------------------------------------- ODF package read */

  async function readPackage(bytes, kind) {
    const L = root.L;
    const files = await L.zip.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const entry = files.get('content.xml');
    if (!entry) throw new Error('this file has no content.xml, so it is not an OpenDocument package');
    const pkg = {
      L,
      files,
      content: L.xmlTree.parse(await entry.text()),
      styles: null,
      meta: null,
      media: new Set(),
      notCarried: new Set(),
    };
    const stylesEntry = files.get('styles.xml');
    if (stylesEntry) pkg.styles = L.xmlTree.parse(await stylesEntry.text());
    const metaEntry = files.get('meta.xml');
    if (metaEntry) pkg.meta = L.xmlTree.parse(await metaEntry.text());
    for (const name of files.keys()) if (/^Pictures\//.test(name)) pkg.media.add(name);
    return pkg;
  }

  /** A package picture's bytes as a Blob, or null when the path is absent. */
  async function pictureBlob(pkg, href) {
    const clean = String(href || '').replace(/^\.\//, '').replace(/^(\.\/)?Pictures\//, 'Pictures/');
    if (!pkg.media.has(clean)) return null;
    const bytes = await pkg.files.get(clean).bytes();
    const ext = (/\.[^.]+$/.exec(clean) || ['.png'])[0].slice(1).toLowerCase();
    let type = 'image/png';
    try { type = pkg.L.extToMime(ext) || type; } catch (error) { /* keep png */ }
    return new Blob([bytes], { type });
  }

  /* --------------------------------------------------------- XML utilities */

  /** Attribute by local name, whatever prefix the file spells it with. */
  function attr(el, local) {
    if (!el || !el.attrs) return null;
    for (const key of Object.keys(el.attrs)) {
      const i = key.indexOf(':');
      if ((i < 0 ? key : key.slice(i + 1)) === local) return el.attrs[key];
    }
    return null;
  }

  /** Element children with a local name, in document order. */
  function kids(el, local) {
    if (!el || !el.children) return [];
    return el.children.filter((child) => child.localName === local);
  }

  /** The single descendant container named office:<local> (body, text, …). */
  function officePart(tree, local) {
    if (!tree) return null;
    for (const el of tree.children) {
      if (el.localName === 'body') {
        for (const child of el.children) if (child.localName === local) return child;
      }
    }
    return null;
  }

  /** cm / mm / in / pt / pc / px length → points. */
  function lengthPt(text, fallback) {
    const m = /^\s*(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?\s*$/.exec(String(text || ''));
    if (!m) return fallback;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return fallback;
    switch (m[2]) {
      case 'cm': return (n / 2.54) * 72;
      case 'mm': return (n / 25.4) * 72;
      case 'in': return n * 72;
      case 'pc': return n * 12;
      case 'px': return n * 0.75;
      default: return n;
    }
  }

  /** text style families resolved from both automatic (content.xml) and named (styles.xml) styles. */
  function textStyleIndex(pkg) {
    const index = new Map();
    const read = (tree) => {
      if (!tree) return;
      for (const el of tree.getElementsByTagName('style:style')) {
        if (attr(el, 'family') !== 'text') continue;
        const props = kids(el, 'text-properties')[0];
        if (!props) continue;
        index.set(attr(el, 'name'), {
          b: attr(props, 'font-weight') === 'bold',
          i: attr(props, 'font-style') === 'italic',
          u: attr(props, 'text-underline-style') && attr(props, 'text-underline-style') !== 'none',
        });
      }
    };
    read(pkg.content);
    read(pkg.styles);
    return index;
  }

  /** text:list-style name → 'number' | 'bullet', from either styles part. */
  function listStyleIndex(pkg) {
    const index = new Map();
    const read = (tree) => {
      if (!tree) return;
      for (const el of tree.getElementsByTagName('text:list-style')) {
        const first = el.children.find((child) => /list-level-style/.test(child.nodeName));
        index.set(attr(el, 'name'), first && first.localName === 'list-level-style-number' ? 'number' : 'bullet');
      }
    };
    read(pkg.content);
    read(pkg.styles);
    return index;
  }

  function metaProps(pkg) {
    const meta = officePart(pkg.meta, 'meta');
    if (!meta) return { title: '', creator: '' };
    const title = kids(meta, 'title')[0];
    const creator = kids(meta, 'creator')[0];
    return { title: title ? title.textContent || '' : '', creator: creator ? creator.textContent || '' : '' };
  }

  /* ------------------------------------------------------------- odt → docx */

  function convertTextPackage(pkg) {
    const L = pkg.L;
    const D = L.D;
    const doc = D.newDoc({ modern: false });
    doc.main.blocks.length = 0; // newDoc opens with one empty paragraph
    const textStyles = textStyleIndex(pkg);
    const listStyles = listStyleIndex(pkg);
    const docText = officePart(pkg.content, 'text');

    const mergeStyle = (a, b) => ({ b: a.b || b.b, i: a.i || b.i, u: a.u || b.u });
    const rPrOf = (style) => {
      const out = {};
      if (style.b) out.b = true;
      if (style.i) out.i = true;
      if (style.u) out.u = 'single';
      return out;
    };

    /** Inline content of one ODF text container → quire runs. */
    const runsOf = (el, style) => {
      const runs = [];
      const push = (item) => { if (item) runs.push(item); };
      for (const node of el.childNodes || []) {
        if (node.nodeType === 3) {
          if (node.data) push(D.text(node.data, rPrOf(style)));
          continue;
        }
        if (node.nodeType !== 1) continue;
        switch (node.localName) {
          case 'span': {
            const named = textStyles.get(attr(node, 'style-name')) || {};
            runsOf(node, mergeStyle(style, named)).forEach(push);
            break;
          }
          case 'a':
            pkg.notCarried.add('odf_skip_links');
            runsOf(node, style).forEach(push);
            break;
          case 's': {
            const count = Math.max(1, parseInt(attr(node, 'c') || '1', 10) || 1);
            push(D.text(' '.repeat(count), rPrOf(style)));
            break;
          }
          case 'tab': push(D.item('tab')); break;
          case 'line-break': push(D.item('br')); break;
          case 'note': pkg.notCarried.add('odf_skip_footnotes'); break;
          case 'frame': {
            const folded = frameRun(node);
            if (folded && folded.folded) folded.runs.forEach(push);
            else if (folded) push(folded);
            break;
          }
          case 'bookmark-start': case 'bookmark-end': case 'soft-page-break':
          case 'change-start': case 'change-end': case 'tracked-changes':
            break; // positional markers, no content of their own
          default:
            if (/^(page-number|page-count|date|time|creation-date|modification-date)$/.test(node.localName)) pkg.notCarried.add('odf_skip_fields');
        }
      }
      return runs;
    };

    /** A draw:frame → an image run; a text box folds its paragraphs in, objects are listed. */
    const frameRun = (frame) => {
      const image = kids(frame, 'image')[0];
      if (image) {
        const href = attr(image, 'href');
        return { t: 'img', media: pendingPictures.get(String(href || '')) || null, w: lengthPt(attr(frame, 'width'), 72), h: lengthPt(attr(frame, 'height'), 72) };
      }
      const textBox = kids(frame, 'text-box')[0];
      if (textBox) {
        const runs = [];
        for (const p of textBox.children) {
          if (p.localName === 'p' || p.localName === 'h') runsOf(p, {}).forEach((run) => runs.push(run));
        }
        return runs.length ? { folded: true, runs } : null;
      }
      if (kids(frame, 'object').length || kids(frame, 'object-ole').length || kids(frame, 'plugin').length) pkg.notCarried.add('odf_skip_objects');
      return null;
    };

    // Pictures must be in the media store before the runs that point at them.
    const pendingPictures = new Map();
    const collectFrames = (el, into) => {
      for (const frame of (el.getElementsByTagName ? el.getElementsByTagName('draw:frame') : [])) into.push(frame);
    };

    const paraOf = (el, pPr, style) => D.para(runsOf(el, style || {}), pPr || {});

    const listParas = (listEl, lvl) => {
      const kind = listStyles.get(attr(listEl, 'style-name')) || 'bullet';
      const numId = kind === 'number' ? '2' : '1';
      for (const item of kids(listEl, 'list-item')) {
        for (const child of item.children) {
          if (child.localName === 'p') doc.main.blocks.push(paraOf(child, { num: { id: numId, lvl } }));
          else if (child.localName === 'h') doc.main.blocks.push(paraOf(child, { style: headingStyle(child), num: { id: numId, lvl } }));
          else if (child.localName === 'list') listParas(child, Math.min(lvl + 1, 8));
        }
      }
    };

    const headingStyle = (h) => {
      const level = Math.min(9, Math.max(1, parseInt(attr(h, 'outline-level') || '1', 10) || 1));
      return 'Heading' + level;
    };

    const cellOf = (cellEl) => {
      const blocks = [];
      for (const child of cellEl.children) {
        if (child.localName === 'p') blocks.push(paraOf(child, {}));
        else if (child.localName === 'h') blocks.push(paraOf(child, { style: headingStyle(child) }));
        else if (child.localName === 'list') { /* lists inside table cells collapse to their paragraphs */
          for (const item of kids(child, 'list-item')) for (const p of kids(item, 'p')) blocks.push(paraOf(p, {}));
        }
      }
      if (attr(cellEl, 'style-name')) pkg.notCarried.add('odf_skip_cell_styles');
      return D.cell(blocks.length ? blocks : [D.para()]);
    };

    const tableOf = (tableEl) => {
      const grid = [];
      for (const columnEl of tableEl.children) {
        if (columnEl.localName !== 'table-column') continue;
        const repeat = Math.max(1, parseInt(attr(columnEl, 'number-columns-repeated') || '1', 10) || 1);
        const styleEl = pkg.content.getElementsByTagName('style:style').find((s) => attr(s, 'name') === attr(columnEl, 'style-name'));
        const width = styleEl ? lengthPt(attr(kids(styleEl, 'table-column-properties')[0], 'column-width'), null) : null;
        for (let i = 0; i < Math.min(repeat, 256); i += 1) grid.push(width || 90);
      }
      if (!grid.length) grid.push(90, 90);
      const rows = [];
      for (const rowEl of tableEl.children) {
        if (rowEl.localName !== 'table-row') continue;
        const repeat = Math.max(1, parseInt(attr(rowEl, 'number-rows-repeated') || '1', 10) || 1);
        const cells = [];
        for (const cellEl of rowEl.children) {
          if (cellEl.localName !== 'table-cell' && cellEl.localName !== 'covered-table-cell') continue;
          const cellRepeat = Math.max(1, parseInt(attr(cellEl, 'number-columns-repeated') || '1', 10) || 1);
          for (let i = 0; i < Math.min(cellRepeat, 64); i += 1) cells.push(cellOf(cellEl));
        }
        const row = D.row(cells);
        for (let i = 0; i < Math.min(repeat, 1024); i += 1) rows.push(row);
      }
      return D.table(rows, grid, { style: 'TableGrid', w: { type: 'auto', v: 0 } });
    };

    const walk = (container) => {
      for (const el of container.children) {
        switch (el.localName) {
          case 'h': {
            const para = paraOf(el, { style: headingStyle(el) });
            doc.main.blocks.push(para);
            break;
          }
          case 'p': doc.main.blocks.push(paraOf(el, {})); break;
          case 'list': listParas(el, 0); break;
          case 'table': doc.main.blocks.push(tableOf(el)); break;
          case 'section': case 'group': case 'deletion': case 'insertion': walk(el); break;
          case 'table-of-content': pkg.notCarried.add('odf_skip_fields'); walk(el); break;
          default: break;
        }
      }
    };

    // Register every referenced picture first; a frame without a readable
    // picture keeps its place as text only (already listed via media skip).
    const frames = [];
    if (docText) collectFrames(docText, frames);
    return {
      prepare: async () => {
        for (const frame of frames) {
          const image = kids(frame, 'image')[0];
          if (!image) continue;
          const href = String(attr(image, 'href') || '');
          if (pendingPictures.has(href)) continue;
          const blob = await pictureBlob(pkg, href);
          pendingPictures.set(href, blob ? L.media.add(blob, href.split('/').pop()) : null);
          if (!blob) pkg.notCarried.add('odf_skip_objects');
        }
      },
      build: () => {
        walk(docText || { children: [] });
        const meta = metaProps(pkg);
        if (meta.title) doc.props.title = meta.title;
        if (meta.creator) doc.props.creator = meta.creator;
        return doc;
      },
    };
  }

  /* ------------------------------------------------------------- ods → xlsx */

  /** ODF formula → { text, functions } in Excel spelling, or null when it does not translate 1:1. */
  function translateFormula(src) {
    const s = String(src || '').trim().replace(/^[\n\r\t ]+/, '');
    const head = /^(?:of:|oooc:|mso:)?=/.exec(s);
    if (!head) return null;
    const body = s.slice(head[0].length);
    let out = '';
    let i = 0;
    const functions = [];
    while (i < body.length) {
      const c = body[i];
      if (c === '"') { // string literal, copied verbatim ("" is an escaped quote)
        let lit = c;
        let j = i + 1;
        let closed = false;
        while (j < body.length) {
          lit += body[j];
          if (body[j] === '"') {
            if (body[j + 1] === '"') { lit += body[j + 1]; j += 2; continue; }
            j += 1; closed = true; break;
          }
          j += 1;
        }
        if (!closed) return null;
        out += lit;
        i = j;
        continue;
      }
      if (c === '[') { // [.A1] → A1, [.A1:.B2] → A1:B2, ['Sheet'.A1] → Sheet!A1
        const end = body.indexOf(']', i);
        if (end < 0) return null;
        const ref = translateRef(body.slice(i + 1, end));
        if (!ref) return null;
        out += ref;
        i = end + 1;
        continue;
      }
      if (c === ';') { out += ','; i += 1; continue; } // ODF argument separator
      if (c === '|' || c === '[' || c === ']') return null;
      if (/[A-Za-z_]/.test(c)) { // namespaced ODF functions (ORG.*, COM.*) have no Excel spelling
        const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(body.slice(i))[0];
        if (word.indexOf('.') >= 0) return null;
        if (/^\s*\(/.test(body.slice(i + word.length))) functions.push(word.toUpperCase());
        out += word;
        i += word.length;
        continue;
      }
      out += c;
      i += 1;
    }
    return { text: out, functions };
  }

  /** The cell/range tail of an ODF reference, with its optional sheet part. */
  function translateRef(ref) {
    // Each endpoint may carry its own leading dot (.A1:.B2); the tail regex
    // takes the longest run of endpoints so the sheet part is what is left.
    const tail = /(?:\.?\$?[A-Za-z]{1,3}\$?\d{1,7})(?::\.?\$?[A-Za-z]{1,3}\$?\d{1,7})*$/.exec(ref);
    if (!tail) return null;
    const cells = tail[0].split(':').map((endpoint) => endpoint.replace(/^\./, '')).join(':');
    let before = ref.slice(0, ref.length - tail[0].length);
    if (!before) return cells; // [.A1:.B2] — this sheet
    if (before.endsWith('.')) before = before.slice(0, -1);
    let sheet = before;
    if (!sheet) return null;
    if (sheet.length >= 2 && sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
    if (!sheet) return null;
    const needsQuotes = !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sheet);
    return (needsQuotes ? `'${sheet.replace(/'/g, "''")}'` : sheet) + '!' + cells;
  }

  function convertSheetPackage(pkg) {
    const L = pkg.L;
    const wb = new L.model.Workbook({});
    let calc = null;
    const sheetsEl = officePart(pkg.content, 'spreadsheet') || { children: [] };
    const usedNames = new Set();

    const sheetName = (wanted, index) => {
      let name = String(wanted || '').replace(/[\\/?*[\]:]/g, '_').slice(0, 31).trim();
      if (!name) name = 'Sheet' + (index + 1);
      let unique = name;
      let n = 2;
      while (usedNames.has(unique.toLowerCase())) unique = name.slice(0, 28) + ' ' + n++;
      usedNames.add(unique.toLowerCase());
      return unique;
    };

    /** One row's cells expanded onto the sheet; covered cells keep their master's merge. */
    const writeRow = (sheet, rowIndex, rowEl) => {
      let col = 0;
      for (const cellEl of rowEl.children) {
        if (cellEl.localName !== 'table-cell' && cellEl.localName !== 'covered-table-cell') continue;
        const repeat = Math.max(1, parseInt(attr(cellEl, 'number-columns-repeated') || '1', 10) || 1);
        const covered = cellEl.localName === 'covered-table-cell';
        if (!covered) {
          const cell = cellValue(cellEl);
          if (cell) {
            const spanned = Math.max(1, parseInt(attr(cellEl, 'number-columns-spanned') || '1', 10) || 1);
            const spannedRows = Math.max(1, parseInt(attr(cellEl, 'number-rows-spanned') || '1', 10) || 1);
            if (spanned > 1 || spannedRows > 1) sheet.merges.push({ r1: rowIndex, c1: col, r2: rowIndex + spannedRows - 1, c2: col + spanned - 1 });
            const copies = Math.min(repeat, 256);
            for (let i = 0; i < copies; i += 1) sheet.put(rowIndex, col + i, { ...cell });
            if (attr(cellEl, 'style-name')) pkg.notCarried.add('odf_skip_cell_styles');
          }
        }
        col += Math.min(repeat, 1024);
      }
    };

    const cellValue = (cellEl) => {
      const type = attr(cellEl, 'value-type');
      const formula = attr(cellEl, 'formula');
      const text = kids(cellEl, 'p').map((p) => p.textContent).join('\n');
      let value = null;
      switch (type) {
        case 'float': case 'percentage': case 'currency': {
          const raw = attr(cellEl, 'value');
          value = raw != null && Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : null;
          break;
        }
        case 'boolean': value = String(attr(cellEl, 'boolean-value') || attr(cellEl, 'value') || '').toLowerCase() === 'true'; break;
        case 'date': case 'time': case 'date-time':
          pkg.notCarried.add('odf_skip_dates');
          value = text || null;
          break;
        case 'string': value = text || attr(cellEl, 'string-value') || null; break;
        default:
          if (text) value = text;
      }
      if (formula) {
        const translated = translateFormula(formula);
        // 1:1 means the formula's functions all exist in the vendored Excel
        // evaluator (loaded through the adapter's lazy second point).
        const known = translated && calc && translated.functions.every((name) => calc.FN[name]);
        if (!known) {
          pkg.notCarried.add('odf_skip_formulas');
          return value != null ? { v: value } : null;
        }
        return { ...(value != null ? { v: value } : {}), f: translated.text };
      }
      return value != null ? { v: value } : null;
    };

    return {
      prepare: async () => {
        // The formula evaluator decides which formulas are 1:1: every function
        // in a formula must exist in the vendored Excel evaluator.
        const adapter = root.ClioWorksLedgerAdapter;
        if (adapter && typeof adapter.loadCalc === 'function') await adapter.loadCalc();
        calc = L.calc || null;
      },
      build: () => {
        sheetsEl.children.forEach((tableEl, index) => {
          if (tableEl.localName !== 'table') return;
          // Sheet-level drawings (images, charts) have no copy here.
          if (kids(tableEl, 'frame').length) pkg.notCarried.add('odf_skip_objects');
          const sheet = wb.addSheet(sheetName(attr(tableEl, 'name'), index));
          const rowEls = [];
          for (const child of tableEl.children) {
            if (child.localName === 'table-row') rowEls.push(child);
            else if (/table-header-rows|table-rows|row-group/.test(child.localName)) rowEls.push(...kids(child, 'table-row'));
          }
          let rowIndex = 0;
          for (const rowEl of rowEls) {
            const repeat = Math.max(1, parseInt(attr(rowEl, 'number-rows-repeated') || '1', 10) || 1);
            writeRow(sheet, rowIndex, rowEl);
            rowIndex += Math.min(repeat, 1024);
          }
        });
        const meta = metaProps(pkg);
        if (meta.title) wb.props.title = meta.title;
        if (meta.creator) wb.props.creator = meta.creator;
        return wb;
      },
    };
  }

  /* ------------------------------------------------------------- odp → pptx */

  function convertSlidesPackage(pkg) {
    const L = pkg.L;
    const M = L.model;
    const T = L.txt;
    const pres = M.newPresentation({ empty: true, locale: false });
    const presentationEl = officePart(pkg.content, 'presentation') || { children: [] };
    const textStyles = textStyleIndex(pkg);
    // The ODP master pages and slide styling never carry over; say so.
    pkg.notCarried.add('odf_skip_slide_style');

    const mergeStyle = (a, b) => ({ b: a.b || b.b, i: a.i || b.i, u: a.u || b.u });
    const lecternRuns = (el, style) => {
      const runs = [];
      for (const node of el.childNodes || []) {
        if (node.nodeType === 3) {
          if (node.data) runs.push({ t: node.data, ...(style.b ? { b: true } : {}), ...(style.i ? { i: true } : {}), ...(style.u ? { u: true } : {}) });
          continue;
        }
        if (node.nodeType !== 1) continue;
        if (node.localName === 'span') {
          const named = textStyles.get(attr(node, 'style-name')) || {};
          runs.push(...lecternRuns(node, mergeStyle(style, named)));
        } else if (node.localName === 's') {
          runs.push({ t: ' '.repeat(Math.max(1, parseInt(attr(node, 'c') || '1', 10) || 1)) });
        } else if (node.localName === 'a') {
          pkg.notCarried.add('odf_skip_links');
          runs.push(...lecternRuns(node, style));
        }
      }
      return runs;
    };

    const paragraphsOf = (textBox) => {
      const paras = [];
      const walkList = (listEl, lvl) => {
        for (const item of kids(listEl, 'list-item')) for (const p of kids(item, 'p')) paras.push({ lvl, pp: {}, rs: lecternRuns(p, {}) });
      };
      for (const el of textBox.children) {
        if (el.localName === 'p') paras.push({ lvl: 0, pp: {}, rs: lecternRuns(el, {}) });
        else if (el.localName === 'h') paras.push({ lvl: 0, pp: {}, rs: lecternRuns(el, {}) });
        else if (el.localName === 'list') walkList(el, 0);
      }
      return paras;
    };

    return {
      prepare: async () => {
        for (const imageEl of presentationEl.getElementsByTagName ? presentationEl.getElementsByTagName('draw:image') : []) {
          const href = String(attr(imageEl, 'href') || '');
          const blob = await pictureBlob(pkg, href);
          imageEl.__mediaId = blob ? L.media.add(blob, href.split('/').pop()) : null;
          if (!blob) pkg.notCarried.add('odf_skip_objects');
        }
      },
      build: () => {
        const designId = Object.keys(pres.designs)[0];
        for (const pageEl of presentationEl.children) {
          if (pageEl.localName !== 'page') continue;
          if (kids(pageEl, 'notes').length) pkg.notCarried.add('odf_skip_notes');
          const slide = M.newSlide(pres, 'text', designId);
          const titleShape = slide.shapes.find((sh) => sh.ph && sh.ph.type === 'title') || null;
          const bodyShape = slide.shapes.find((sh) => sh.ph && sh.ph.type === 'body') || null;
          let titleUsed = false;
          let bodyUsed = false;
          for (const frameEl of pageEl.children) {
            if (frameEl.localName !== 'frame') continue;
            const textBox = kids(frameEl, 'text-box')[0];
            const imageEl = kids(frameEl, 'image')[0];
            const klass = attr(frameEl, 'class');
            if (textBox) {
              const paras = paragraphsOf(textBox);
              if (!paras.length) continue;
              if ((klass === 'title' || klass === 'subtitle') && titleShape && !titleUsed) {
                titleShape.tx = T.body(paras, { anchor: 'ctr', autofit: 'none' });
                titleUsed = true;
              } else if (bodyShape && !bodyUsed) {
                bodyShape.tx = T.body(paras);
                bodyUsed = true;
              } else {
                slide.shapes.push({
                  id: L.uid('s'), type: 'text', name: attr(frameEl, 'name') || 'Text',
                  x: lengthPt(attr(frameEl, 'x'), 36), y: lengthPt(attr(frameEl, 'y'), 36),
                  w: lengthPt(attr(frameEl, 'width'), 200), h: lengthPt(attr(frameEl, 'height'), 40),
                  rot: 0, geom: 'rect', fill: { t: 'none' }, line: { t: 'none' }, tx: T.body(paras),
                });
              }
              continue;
            }
            if (imageEl && imageEl.__mediaId) {
              slide.shapes.push({
                id: L.uid('s'), type: 'image', name: attr(frameEl, 'name') || 'Picture',
                x: lengthPt(attr(frameEl, 'x'), 36), y: lengthPt(attr(frameEl, 'y'), 36),
                w: lengthPt(attr(frameEl, 'width'), 72), h: lengthPt(attr(frameEl, 'height'), 72),
                rot: 0, geom: 'rect', fill: { t: 'none' }, line: { t: 'none' },
                media: imageEl.__mediaId, crop: { l: 0, t: 0, r: 0, b: 0 }, lockAspect: true, img: {},
              });
              continue;
            }
            // Everything else a frame can hold (draw:object, draw:plugin, tables)
            // has no copy in this conversion.
            pkg.notCarried.add('odf_skip_objects');
          }
          pres.slides.push(slide);
        }
        const meta = metaProps(pkg);
        if (meta.title) pres.title = meta.title;
        if (meta.creator) pres.props.author = meta.creator;
        return pres;
      },
    };
  }

  /* ---------------------------------------------------------------- convert */

  const KIND_BY_EXT = { odt: 'odt', ods: 'ods', odp: 'odp' };
  const FORMAT_BY_KIND = { odt: 'docx', ods: 'xlsx', odp: 'pptx' };

  async function convert(bytes, fileName) {
    const name = String(fileName || 'document.odt');
    const ext = (/\.([^.]+)$/.exec(name)?.[1] || '').toLowerCase();
    const kind = KIND_BY_EXT[ext];
    if (!kind) throw new Error('odf-import: not an OpenDocument file name: ' + name);
    const L = await ensureCodec(kind);
    const pkg = await readPackage(bytes, kind);
    let plan;
    if (kind === 'odt') plan = convertTextPackage(pkg);
    else if (kind === 'ods') plan = convertSheetPackage(pkg);
    else plan = convertSlidesPackage(pkg);
    if (plan.prepare) await plan.prepare();
    const model = plan.build();
    let out;
    if (kind === 'odt') {
      L.D.doc = model;
      const blob = await L.docx.write(model, { format: 'docx' });
      out = new Uint8Array(await blob.arrayBuffer());
    } else if (kind === 'ods') {
      out = await L.xlsxWrite.bytes(model, { type: 'xlsx' });
    } else {
      const blob = await L.pptx.write(model, { format: 'pptx' });
      out = new Uint8Array(await blob.arrayBuffer());
    }
    const stem = name.replace(/\.[^.]+$/, '');
    return {
      format: FORMAT_BY_KIND[kind],
      fileName: `${stem}.${FORMAT_BY_KIND[kind]}`,
      bytes: out,
      notCarried: [...pkg.notCarried],
    };
  }

  /** The desk import hook: one ODF File in, its Office copy appended to the
   * import batch, the not-carried list appended to the import notices. The
   * copy then mounts through the same loop as any dropped Office file — text
   * projection first, native registration after — while the .odt/… original
   * keeps its place as an ordinary imported file. */
  async function copy(file, files, failures) {
    // t() is the desk's translation function (a bundle global, like the
    // chart comments read it); outside the desk the key shows as itself.
    const tr = (key, ...args) => (typeof root.t === "function" ? root.t(key, ...args) : key);
    let converted;
    try {
      converted = await convert(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch (error) {
      // A copy that cannot be made must not cost the writer the original:
      // the .odt/… still imports as an ordinary file after this returns.
      if (Array.isArray(failures)) failures.push({ name: file.name, message: tr("odf_import_convert_failed", String(error?.message || error)) });
      return null;
    }
    if (Array.isArray(failures) && converted.notCarried.length) {
      failures.push({ name: converted.fileName, message: tr("odf_import_not_carried", converted.notCarried.map((key) => tr(key))) });
    }
    if (Array.isArray(files)) files.push(new File([converted.bytes], converted.fileName));
    return converted;
  }

  root.AISystem6OdfImport = Object.freeze({ convert, copy });
})(typeof window !== 'undefined' ? window : globalThis);
