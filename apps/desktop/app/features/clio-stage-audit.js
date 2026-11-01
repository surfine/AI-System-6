// Feature module: clio-stage-audit (ClioWorks v4.2 D42-02/D42-03 + v4.1 G41-01).
//
// The current-page check measures the REAL rendered slide: every content block
// of the mounted page is measured in canvas units (the placement canvas the
// stage itself uses), fonts are awaited first, and the measurements become an
// AuditInput for the vendored v4.1 audit adapter (normalizeAudit/prepareRepair
// — proposals only). Nothing here guesses by character count; when fonts are
// not ready the metrics are reported unavailable and no repair is offered.
//
// The panel reuses the host's own materials (.btn buttons, t() strings, the
// stage's rail and edit surfaces). Locate only selects the block; preview only
// touches inline styles; adoption goes through clioStageSetPlacement — the
// stage's own one-step undoable edit — and is followed by a re-check. The PPTX
// export builds a real Lectern presentation from measured pages and writes it
// with the vendored writer: text stays native and editable, one save owner.
//
// Loaded lazily via ensureClioStageAuditModule(); never on the boot disk.

(function (root) {
  'use strict';
  if (root.AISystem6ClioStageAudit) return;

  // Dynamic import needs a rooted specifier in the browser; the module is
  // served from the app/ prefix like every other lazy script.
  const ADAPTER_URL = '/app/vendor/clioworks-v42/audit-adapter.mjs';
  const PX_PER_PT = 4 / 3;          // the placement canvas is 96dpi px; boxes are pt
  const EMU_PER_PX = 9525;          // 1280px canvas == 12192000 EMU (16:9)
  const OVERFLOW_PX = 3;            // measured scroll slack before "overflow"
  const BOUNDS_PT = 4;              // how far past the page before "out of bounds"
  const DISTORT_TOLERANCE = 0.02;   // rendered vs natural aspect for pictures
  const OVERLAP_PX2 = 256;          // placed-block intersection area threshold

  let adapterPromise = null;
  function loadAdapter() {
    if (!adapterPromise) adapterPromise = import(ADAPTER_URL).then((m) => m);
    return adapterPromise;
  }

  let workflowsPromise = null;
  /** The v4.2 workflow contracts (classic UMD) — adopt-path identity checks. */
  function loadWorkflows() {
    if (root.ClioWorks42) return Promise.resolve(root.ClioWorks42);
    if (!workflowsPromise) {
      workflowsPromise = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = 'app/vendor/clioworks-v42/workflows.js';
        el.onload = () => (root.ClioWorks42 ? resolve(root.ClioWorks42) : reject(new Error('audit: workflows did not install')));
        el.onerror = () => reject(new Error('audit: failed to load workflows'));
        document.head.append(el);
      });
    }
    return workflowsPromise;
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(String(text));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** The stage's lexical state and slide context, via its public accessor. */
  function auditContext() {
    return root.AISystem6ClioStage?.auditContext?.() || null;
  }

  function stageState() {
    return auditContext()?.state || null;
  }

  /** The mounted slide page element (clioStageMountPage's section). */
  function pageFrame() {
    return root.AISystem6ClioStage?.pageFrameElement?.() || null;
  }

  /** Measurements of one page, in canvas px: the only input the audit trusts. */
  function measureFrame(frame, context) {
    const blocks = Array.from(frame.querySelectorAll('[data-clio-block]'));
    const m = frameMetricsOf(frame);
    if (!m) return null;
    const boxes = new Map();
    for (const el of blocks) {
      const at = Number(el.dataset.clioBlock);
      const rect = el.getBoundingClientRect();
      const box = {
        x: (rect.left - m.originX) / m.unitX,
        y: (rect.top - m.originY) / m.unitY,
        w: rect.width / m.unitX,
        h: rect.height / m.unitY,
      };
      const computed = getComputedStyle(el);
      // "Placed" means the page's clio-place table names this block — the
      // mount path styles placements inline without a marker class (only the
      // drag editor adds one), so the class is not a reliable signal.
      const placementTable = (context && context.placement) || {};
      boxes.set(at, {
        el, box, placed: Object.prototype.hasOwnProperty.call(placementTable, String(at)),
        fontFamily: computed.fontFamily, fontSize: computed.fontSize, fontWeight: computed.fontWeight,
        textOverflowY: el.scrollHeight - el.clientHeight,
        textOverflowX: el.scrollWidth - el.clientWidth,
        images: Array.from(el.querySelectorAll('img')).map((img) => ({
          naturalAR: img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null,
          renderedAR: img.clientWidth > 0 && img.clientHeight > 0 ? img.clientWidth / img.clientHeight : null,
        })),
      });
    }
    return { boxes, unit: m, content: context ? context.content : null, placement: context ? context.placement : {} };
  }

  function frameMetricsOf(frame) {
    if (typeof root.clioStageFrameMetrics !== 'function') return null;
    try { return root.clioStageFrameMetrics(frame); } catch { return null; }
  }

  function clampBox(box, canvas) {
    const w = Math.min(box.w, canvas.width);
    const h = Math.min(box.h, canvas.height);
    return {
      x: Math.max(0, Math.min(box.x, canvas.width - w)),
      y: Math.max(0, Math.min(box.y, canvas.height - h)),
      w, h,
    };
  }

  const toPt = (px) => Math.round(px / PX_PER_PT * 100) / 100;
  const toEmu = (px) => Math.round(px * EMU_PER_PX);

  /**
   * Build the adapter's AuditInput from real measurements. Pure over its
   * inputs so the contract test can drive it with synthetic measurements.
   * @param {{canvas:{width:number,height:number}, boxes:Map|Array, fontSetHash:string,
   *          documentId:string, generation:number, editRevision:number, pageIndex:number,
   *          pageMarkdown:string, fontsReady:boolean, editable:boolean}} input
   */
  function buildAuditInput(input) {
    const { canvas } = input;
    const boxes = input.boxes instanceof Map ? [...input.boxes.entries()] : input.boxes;
    const bindings = [];
    const findings = [];
    const sourceIdOf = (at) => `p${input.pageIndex + 1}b${at}`;
    const placed = [];

    for (const [at, measured] of boxes) {
      const b = measured.box;
      bindings.push({
        sourceId: sourceIdOf(at),
        objectId: sourceIdOf(at),
        editable: !!input.editable,
        unit: 'pt',
        box: { x: toPt(b.x), y: toPt(b.y), cx: toPt(b.w), cy: toPt(b.h) },
      });
      if (measured.placed) placed.push({ at, box: b });

      const beyondRight = b.x + b.w - canvas.width;
      const beyondBottom = b.y + b.h - canvas.height;
      const beyondLeft = -b.x;
      const beyondTop = -b.y;
      const worst = Math.max(beyondRight, beyondBottom, beyondLeft, beyondTop);
      const insideArea = Math.max(0, Math.min(b.x + b.w, canvas.width) - Math.max(b.x, 0))
        * Math.max(0, Math.min(b.y + b.h, canvas.height) - Math.max(b.y, 0));
      if (worst > BOUNDS_PT * PX_PER_PT) {
        const offSlide = insideArea / (b.w * b.h) < 0.1;
        const clamped = clampBox(b, canvas);
        findings.push({
          code: offSlide ? 'off_slide' : 'out_of_bounds',
          level: 'error',
          el: sourceIdOf(at),
          message: offSlide ? 'The block lies outside the page.' : 'The block crosses the page edge.',
          ...(measured.placed && !offSlide ? {
            suggest: { op: 'setTransform', target: { el: sourceIdOf(at) }, box: { x: toEmu(clamped.x), y: toEmu(clamped.y), cx: toEmu(clamped.w), cy: toEmu(clamped.h) } },
          } : {}),
        });
      }
      if (measured.textOverflowY > OVERFLOW_PX) {
        findings.push({ code: 'text_overflow', level: 'warning', el: sourceIdOf(at),
          message: 'The text is taller than its frame.' });
      } else if (measured.textOverflowX > OVERFLOW_PX) {
        findings.push({ code: 'text_overflow_width', level: 'warning', el: sourceIdOf(at),
          message: 'A line is wider than its frame.' });
      }
      for (const image of measured.images) {
        if (!image.naturalAR || !image.renderedAR) continue;
        if (Math.abs(image.renderedAR - image.naturalAR) / image.naturalAR > DISTORT_TOLERANCE) {
          findings.push({
            code: 'picture_distorted', level: 'warning', el: sourceIdOf(at),
            message: 'The picture is drawn at a different aspect than its pixels.',
            ...(measured.placed ? {
              suggest: { op: 'setTransform', target: { el: sourceIdOf(at) },
                box: { x: toEmu(b.x), y: toEmu(b.y), cx: toEmu(b.w), cy: toEmu(b.w / image.naturalAR) } },
            } : {}),
          });
        }
      }
    }

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i].box, c = placed[j].box;
        const w = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
        const h = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        if (w > 0 && h > 0 && w * h > OVERLAP_PX2) {
          const second = placed[j];
          const moved = clampBox({ ...second.box, y: a.y + a.h + 12 }, canvas);
          findings.push({
            code: 'overlap', level: 'warning',
            el: sourceIdOf(second.at), els: [sourceIdOf(placed[i].at), sourceIdOf(second.at)],
            message: 'Two placed blocks cover each other.',
            ...(input.editable ? {
              suggest: { op: 'setTransform', target: { el: sourceIdOf(second.at) },
                box: { x: toEmu(moved.x), y: toEmu(moved.y), cx: toEmu(moved.w), cy: toEmu(moved.h) } },
            } : {}),
          });
        }
      }
    }

    const coverage = {
      bounds: 'checked', text: 'checked', overlap: 'checked', distortion: 'checked',
      reporting: 'complete',
    };
    return {
      snapshot: input.stamp,
      layout: input.stamp,
      metrics: input.fontsReady ? 'measured' : 'unavailable',
      slideTarget: input.pageIndex,
      suggestionUnit: 'emu',
      coverage,
      bindings,
      findings,
    };
  }

  // --- the running check -------------------------------------------------------

  const audit = {
    report: null, view: null, stamp: null, error: null, running: false,
    preview: null, measured: null,
  };

  /** One id per host session: a rebuilt session invalidates old candidates
   * (the v4.2 workflow stamps carry sessionId; the v4.1 audit stamps do not). */
  const auditSessionId = (crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`);

  async function collectPage() {
    const state = stageState();
    const context = auditContext()?.slideContext || null;
    const frame = pageFrame();
    if (!state || !state.parsed || !state.source || !context || !frame) return null;
    await document.fonts.ready;
    const measured = measureFrame(frame, context);
    if (!measured) return null;
    const fontsReady = document.fonts.status === 'loaded';
    const fontKey = [...new Set([...measured.boxes.values()].map((b) => `${b.fontFamily}|${b.fontSize}`))].sort().join(';');
    const fontSetHash = await sha256Hex(fontKey || 'none');
    const source = state.source;
    const documentId = String(source.sourceItemId || `stage:${source.title || 'deck'}`);
    const layoutResultId = await sha256Hex(JSON.stringify([
      documentId, state.index, measured.placement,
      [...measured.boxes.entries()].map(([at, b]) => [at, Math.round(b.box.x), Math.round(b.box.y), Math.round(b.box.w), Math.round(b.box.h)]),
      fontSetHash,
    ]));
    const stamp = {
      documentId, generation: Number(state.generation) || 1,
      editRevision: Number(state.editRevision) || 0,
      pageId: `p${state.index + 1}`, layoutResultId, fontSetHash,
    };
    return { measured, stamp, fontsReady, fontSetHash };
  }

  async function runCheck() {
    let adapter;
    try {
      adapter = await loadAdapter();
    } catch (error) {
      audit.report = null; audit.view = null; audit.stamp = null;
      audit.error = `adapter:${String(error && error.message || error)}`;
      return audit.error;
    }
    const collected = await collectPage();
    if (!collected) {
      audit.report = null; audit.view = null; audit.stamp = null;
      audit.error = 'no-page';
      return audit.error;
    }
    const state = stageState();
    const canvas = { width: collected.measured.unit.box.width, height: collected.measured.unit.box.height };
    try {
      const input = buildAuditInput({
        canvas,
        boxes: collected.measured.boxes,
        stamp: collected.stamp,
        fontsReady: collected.fontsReady,
        editable: typeof root.clioStageCanEdit === 'function' && root.clioStageCanEdit(),
        documentId: collected.stamp.documentId,
        generation: collected.stamp.generation,
        editRevision: collected.stamp.editRevision,
        pageIndex: state.index,
        pageMarkdown: '',
      });
      audit.report = adapter.normalizeAudit(input);
      audit.stamp = collected.stamp;
      audit.measured = collected.measured;
      audit.error = null;
      buildView();
    } catch (error) {
      audit.report = null; audit.view = null; audit.stamp = null;
      audit.error = String(error && error.code ? error.code : error);
    }
    return audit.error;
  }

  function buildView() {
    const state = stageState();
    const report = audit.report;
    if (!report) return;
    const C42 = root.ClioWorks42;
    const status = C42 ? C42.auditStatus({ ...report, snapshot: { layoutResultId: report.snapshot.layoutResultId } }, audit.stamp.layoutResultId) : null;
    const rows = report.findings.map((f) => ({
      findingId: f.id, code: f.code, level: f.level, message: f.message,
      objectId: f.objectId, blockIndex: f.objectId ? Number(f.objectId.split('b').pop()) : -1,
      canLocate: !!f.objectId, canPreview: !!f.repair, unavailable: f.repairUnavailable,
    }));
    audit.view = {
      status: status || { state: report.findings.length ? 'issues' : report.status === 'incomplete' ? 'partial' : 'clear' },
      title: t('clioworks_audit_title', String(state.index + 1)),
      rows,
      coverage: report.coverage, metrics: report.metrics,
      count: report.findings.length,
    };
  }

  // --- preview / adopt (D42-03) -------------------------------------------------

  const PREVIEW_CLASS = 'clio-stage-audit-previewing';

  function clearPreview() {
    if (!audit.preview) return;
    const el = audit.preview.element;
    el.classList.remove(PREVIEW_CLASS);
    for (const key of ['--cw-audit-x', '--cw-audit-y', '--cw-audit-w']) el.style.removeProperty(key);
    audit.preview = null;
  }

  function previewFinding(findingId) {
    const adapterPromise2 = loadAdapter();
    return adapterPromise2.then((adapter) => {
      const proposal = adapter.prepareRepair(audit.report, findingId, audit.stamp);
      const index = Number(proposal.change.objectId.split('b').pop());
      const frame = pageFrame();
      const element = frame && frame.querySelector(`[data-clio-block="${index}"]`);
      if (!element) throw new Error('audit: the object is no longer on the page');
      clearPreview();
      audit.preview = { findingId, index, element, candidate: proposal.change };
      // The preview rides a class plus custom properties (the css budget's
      // sanctioned dynamic path); the geometry is the adapter's EMU proposal
      // converted back to canvas px.
      const after = proposal.change.after;
      element.style.setProperty('--cw-audit-x', `${after.x * PX_PER_PT}px`);
      element.style.setProperty('--cw-audit-y', `${after.y * PX_PER_PT}px`);
      element.style.setProperty('--cw-audit-w', `${after.cx * PX_PER_PT}px`);
      element.classList.add(PREVIEW_CLASS);
      return proposal;
    });
  }

  async function adoptFinding(findingId) {
    const adapter = await loadAdapter();
    const C42 = await loadWorkflows();
    const proposal = adapter.prepareRepair(audit.report, findingId, audit.stamp);
    const state = stageState();
    const index = Number(proposal.change.objectId.split('b').pop());
    const context = auditContext()?.slideContext || null;
    if (!context) throw new Error('audit: the page context is gone');
    // The live preview must not mask the object's real geometry: clear it
    // first, then measure. A refused adopt keeps the finding row (and its
    // preview) available for another try.
    clearPreview();
    // Host-side identity re-check: the workflow contract verifies the object's
    // CURRENT geometry still equals the candidate's before.
    if (C42) {
      const measured = measureFrame(pageFrame(), context);
      const box = measured.boxes.get(index);
      if (!box) throw new Error('audit: the object disappeared');
      const workflowStamp = () => ({
        documentId: audit.stamp.documentId, sessionId: auditSessionId,
        generation: Number(state.generation) || 1,
        editRevision: Number(state.editRevision) || 0, styleRevision: 0,
      });
      const pt = (g) => ({ x: g.x, y: g.y, w: g.cx, h: g.cy });
      C42.validateGeometryAccept(
        { kind: 'geometry', unit: 'pt', base: workflowStamp(), objectId: proposal.change.objectId,
          before: pt(proposal.change.before), after: pt(proposal.change.after) },
        workflowStamp(),
        { x: toPt(box.box.x), y: toPt(box.box.y), w: toPt(box.box.w), h: toPt(box.box.h) },
      );
    }
    const after = proposal.change.after;
    const entry = { x: Math.round(after.x * PX_PER_PT), y: Math.round(after.y * PX_PER_PT) };
    if (proposal.change.before.cx !== after.cx) entry.w = Math.round(after.cx * PX_PER_PT);
    const placement = { ...context.placement, [index]: entry };
    // One undoable step through the stage's own edit path; failure keeps the
    // original content and the candidate for a retry.
    const ok = clioStageSetPlacement(placement);
    if (!ok) throw new Error('audit: the stage refused the edit');
    await runCheck();
    return { ok: true, rechecked: true };
  }

  // --- native PPTX export (measured pages, one save owner) ----------------------

  async function collectAllPages() {
    const state = stageState();
    if (!state || !state.parsed || !state.source) return null;
    const back = state.index;
    const pages = [];
    for (let i = 0; i < state.parsed.slides.length; i += 1) {
      showClioStageSlide(i);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await document.fonts.ready;
      const context = auditContext()?.slideContext || null;
      const frame = pageFrame();
      const measured = frame && context ? measureFrame(frame, context) : null;
      pages.push({
        index: i,
        markdown: state.parsed.slides[i],
        notes: typeof clioStageSlideNotes === 'function' ? clioStageSlideNotes(i) : '',
        blocks: measured ? [...measured.boxes.entries()].map(([at, b]) => ({
          at, text: b.el.textContent.replace(/\s+/g, ' ').trim(), box: b.box, placed: b.placed,
          fontSizePx: parseFloat(b.fontSize) || 24, fontWeight: b.fontWeight,
          isHeading: /^H[1-3]$/.test(b.el.tagName || ''),
        })) : [],
      });
    }
    showClioStageSlide(back);
    return pages;
  }

  /**
   * Build a real Lectern presentation from measured pages. Text becomes native
   * editable runs at the measured position; placed blocks keep their geometry;
   * notes become speaker notes. One save owner: the vendored pptx writer.
   */
  function buildPresentation(pages, canvas, title) {
    const L = root.L;
    const M = L.model;
    const T = L.txt;
    const Wpt = toPt(canvas.width), Hpt = toPt(canvas.height);
    const pres = M.newPresentation({ w: Wpt, h: Hpt, title: title || '', empty: true });
    for (const page of pages) {
      const slide = M.newSlide(pres, 'blank', Object.keys(pres.designs)[0]);
      slide.notes = String(page.notes || '');
      slide.shapes = [];
      for (const block of page.blocks) {
        if (!block.text) continue;
        const lines = block.text.split(/\n+/);
        const sz = Math.max(8, Math.min(96, Math.round(block.fontSizePx / PX_PER_PT)));
        const rp = { sz, b: block.isHeading || String(block.fontWeight) >= '600' ? 1 : 0 };
        slide.shapes.push({
          id: L.uid('s'), type: 'text', name: `Stage ${page.index + 1}.${block.at}`,
          x: toPt(block.box.x), y: toPt(block.box.y), w: toPt(block.box.w), h: toPt(block.box.h),
          rot: 0, geom: 'rect', fill: { t: 'none' }, line: { t: 'none' },
          tx: T.body(T.fromLines(lines, null, rp)),
        });
      }
      pres.slides.push(slide);
    }
    return pres;
  }

  async function exportPptx() {
    const pages = await collectAllPages();
    if (!pages) throw new Error('audit: no deck is open');
    const state = stageState();
    const canvas = { width: 1280, height: 720 };
    if (state.parsed.size === '4:3') canvas.width = 960;
    if (!root.AISystem6ClioWorks && typeof ensureClioWorksLedgerModule === 'function') {
      await ensureClioWorksLedgerModule();
    }
    const host = root.AISystem6ClioWorks;
    if (!host || typeof host.ensureAdapter !== 'function') throw new Error('audit: the native host is unavailable');
    await host.ensureAdapter('pptx');
    // The adapter script installs before its codec modules finish; loadCodec()
    // is the idempotent wait for L.model / L.txt / L.pptx.
    if (root.ClioWorksLecternAdapter && typeof root.ClioWorksLecternAdapter.loadCodec === 'function') {
      await root.ClioWorksLecternAdapter.loadCodec();
    }
    const L = root.L;
    if (!L || !L.model || !L.txt || !L.pptx) throw new Error('audit: the Lectern codec is unavailable');
    const pres = buildPresentation(pages, canvas, state.source.title || '');
    const blob = await L.pptx.write(pres, { format: 'pptx' });
    const name = `${(state.source.title || 'deck').replace(/[\\/:*?"<>|]/g, '')}.pptx`;
    if (typeof saveArtifact === 'function') saveArtifact({ blob, name, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { name, byteLength: bytes.byteLength };
  }

  // --- panel UI (host materials only) -------------------------------------------

  let panelEl = null;
  let panelObserver = null;

  /** The stage re-renders its shell on every applied edit (typing included);
   * an open panel re-attaches itself to the rebuilt shell instead of dying. */
  function ensurePanelObserver() {
    if (panelObserver) return;
    const viewport = document.querySelector('.clio-stage-viewport');
    if (!viewport || typeof MutationObserver !== 'function') return;
    panelObserver = new MutationObserver(() => {
      if (panelEl && !viewport.contains(panelEl)) {
        panelEl = null;
        renderPanel();
        refitAfterPanelChange();
      }
    });
    panelObserver.observe(viewport, { childList: true, subtree: true });
  }

  function closePanel() {
    clearPreview();
    panelEl?.remove();
    panelEl = null;
    refitAfterPanelChange();
  }

  /** The audit column changes the stage room's width; the fit observer only
   * watches the viewport, so the page scale is recomputed here. */
  function refitAfterPanelChange() {
    if (typeof refitClioStage !== 'function') return;
    requestAnimationFrame(() => { try { refitClioStage(); } catch { /* the stage re-renders on its own */ } });
  }

  function renderPanel() {
    const shell = document.querySelector('.clio-stage-edit-shell');
    if (!shell) return;
    if (!panelEl) {
      panelEl = document.createElement('aside');
      panelEl.className = 'clio-stage-audit-panel';
      panelEl.setAttribute('aria-label', t('clioworks_audit_panel_label'));
      shell.append(panelEl);
    }
    const view = audit.view;
    const rows = view ? view.rows : [];
    const parts = [];
    parts.push(`<h2>${escapeHtml(view ? view.title : t('clioworks_audit_title', ''))}</h2>`);
    if (audit.error === 'no-page') parts.push(`<p>${escapeHtml(t('clioworks_audit_no_page'))}</p>`);
    else if (audit.error) parts.push(`<p class="is-error">${escapeHtml(t('clioworks_audit_failed', audit.error))}</p>`);
    else if (view) {
      parts.push(`<p class="clio-stage-audit-status" data-audit-status="${view.status.state}">${escapeHtml(view.status.label)} · ${escapeHtml(t('clioworks_audit_metrics', view.metrics))}</p>`);
      if (!rows.length && view.status.state === 'clear') {
        parts.push(`<p>${escapeHtml(t('clioworks_audit_clear'))}</p>`);
      }
      parts.push('<ul class="clio-stage-audit-rows">');
      rows.forEach((row) => {
        parts.push(`<li class="clio-stage-audit-row" data-finding="${escapeHtml(row.findingId)}">
          <span class="clio-stage-audit-row-title">${escapeHtml(t(`clioworks_audit_code_${row.code}`))}</span>
          <span class="clio-stage-audit-row-detail">${escapeHtml(t('clioworks_audit_object', String(row.blockIndex + 1)))} · ${escapeHtml(row.message)}</span>
          <span class="clio-stage-audit-row-actions">
            <button type="button" class="btn mini-btn" data-audit-locate="${escapeHtml(row.findingId)}" ${row.canLocate ? '' : 'disabled'}>${escapeHtml(t('clioworks_audit_locate'))}</button>
            <button type="button" class="btn mini-btn" data-audit-preview="${escapeHtml(row.findingId)}" ${row.canPreview ? '' : 'disabled'} title="${escapeHtml(row.unavailable ? t('clioworks_audit_no_repair', row.unavailable) : '')}">${escapeHtml(t('clioworks_audit_preview'))}</button>
          </span></li>`);
      });
      parts.push('</ul>');
    }
    parts.push(`<div class="clio-stage-audit-actions">
      <button type="button" class="btn" data-audit-run>${escapeHtml(t('clioworks_audit_run'))}</button>
      <button type="button" class="btn" data-audit-export>${escapeHtml(t('clioworks_audit_export'))}</button>
      <button type="button" class="btn" data-audit-cancel-preview ${audit.preview ? '' : 'disabled'}>${escapeHtml(t('clioworks_audit_cancel_preview'))}</button>
      <button type="button" class="btn default" data-audit-adopt ${audit.preview ? '' : 'disabled'}>${escapeHtml(t('clioworks_audit_adopt'))}</button>
    </div>`);
    panelEl.innerHTML = parts.join('');
    panelEl.querySelector('[data-audit-run]').addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      await runCheck();
      renderPanel();
    });
    panelEl.querySelector('[data-audit-export]').addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      try {
        const result = await exportPptx();
        if (typeof setStatus === 'function') setStatus(t('clioworks_audit_exported', `${result.name} (${result.byteLength})`));
      } catch (error) {
        if (typeof setStatus === 'function') setStatus(t('clioworks_audit_export_failed', String(error && error.message || error)));
      }
      renderPanel();
    });
    const cancel = panelEl.querySelector('[data-audit-cancel-preview]');
    cancel.addEventListener('click', () => { clearPreview(); renderPanel(); });
    const adopt = panelEl.querySelector('[data-audit-adopt]');
    adopt.addEventListener('click', async () => {
      if (!audit.preview) return;
      adopt.disabled = true;
      try {
        await adoptFinding(audit.preview.findingId);
        if (typeof setStatus === 'function') setStatus(t('clioworks_audit_adopted'));
      } catch (error) {
        if (typeof setStatus === 'function') setStatus(t('clioworks_audit_adopt_failed', String(error && error.message || error)));
      }
      renderPanel();
    });
    panelEl.querySelectorAll('[data-audit-locate]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = rows.find((r) => r.findingId === button.dataset.auditLocate);
        if (!row || row.blockIndex < 0) return;
        const frame = pageFrame();
        if (frame && typeof clioStageSelectBlock === 'function') {
          clioStageSelectBlock(frame, row.blockIndex);
        }
      });
    });
    panelEl.querySelectorAll('[data-audit-preview]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await previewFinding(button.dataset.auditPreview);
          renderPanel();
        } catch (error) {
          if (typeof setStatus === 'function') setStatus(t('clioworks_audit_adopt_failed', String(error && error.message || error)));
        }
      });
    });
  }

  async function openPanel() {
    try { await loadWorkflows(); } catch { /* rows still render; status falls back */ }
    renderPanel();
    refitAfterPanelChange();
    ensurePanelObserver();
    await runCheck();
    renderPanel();
  }

  async function toggle() {
    if (panelEl) closePanel();
    else await openPanel();
  }

  root.AISystem6ClioStageAudit = Object.freeze({
    toggle, openPanel, closePanel,
    runCheck, previewFinding, adoptFinding, clearPreview, exportPptx,
    buildAuditInput, buildPresentation, collectAllPages,
    state: () => ({ ...audit, report: audit.report, measured: null, preview: null }),
  });
  root.AISystem6ClioStageAuditLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
