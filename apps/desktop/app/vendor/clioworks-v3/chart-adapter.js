/* V3-E-1 (GridCraft step): a REAL chart-kind NativeEditorAdapter around the
 * ClioChart engine. Loaded ONLY by the clioworks-v3 fixture
 * (?fixture=clioworks-v3&adapter=chart). The engine's own table parser, grid
 * editor, projections and edit history stay the engine's; this adapter wraps,
 * never replaces. The demo kit's simplified calculation model is NOT used.
 * The engine registers its own "clioChart" edit history at module load, so the
 * menu port verifies that registration instead of double-registering, and both
 * the toolbar and Edit > Undo reach the same engine functions. */
(function (root) {
  'use strict';

  function createChartIntegration(hostWindow) {
    const doc = hostWindow.document;
    const win = doc.querySelector('[data-window="clioChart"]');
    const split = doc.getElementById('clio-chart-split');
    if (!win || !split) throw new Error('chart-adapter: clioChart window / #clio-chart-split missing');
    if (!hostWindow.AISystem6ClioChartLoaded) throw new Error('chart-adapter: ClioChart engine module not loaded');

    // Engine bindings. clioChartState is a top-level const of the lazy module —
    // a global LEXICAL binding, NOT a window property — so it must be read by
    // its bare name (the fixture guarantees the module has loaded). The
    // engine's functions are classic-script declarations, so those DO hang off
    // the window.
    const engineState = () => {
      try { return clioChartState; } catch (e) { return null; }
    };
    const engineHistory = () => engineState()?.history || null;

    let disposed = false;
    let mounted = false;
    const listeners = new Set();
    const state = {
      kind: 'chart', documentId: 'clio-chart-scratch', sessionId: 'cw3-chart-' + Math.random().toString(36).slice(2, 8),
      generation: 1, editRevision: 0, selectionEpoch: 0,
      readonly: false, composing: false, saving: false, closed: false,
      canUndo: false, canRedo: false,
      supported: ['edit.undo', 'edit.redo'],
    };

    const notify = () => { if (!disposed) listeners.forEach((fn) => { try { fn(); } catch (e) { hostWindow.console?.error?.(e); } }); };

    const currentDocumentId = () => {
      const s = engineState();
      if (!s) return 'clio-chart-scratch';
      return s.owner?.id || s.templateFileId || (s.table ? 'clio-chart-table' : 'clio-chart-scratch');
    };

    const syncDerived = () => {
      const id = currentDocumentId();
      if (id !== state.documentId) { state.documentId = id; state.generation += 1; }
      const history = engineHistory();
      state.canUndo = Boolean(history?.canUndo?.());
      state.canRedo = Boolean(history?.canRedo?.());
      state.readonly = false; // the engine has no read-only mode today
      state.closed = win.classList.contains('is-hidden') || win.classList.contains('is-app-hidden');
      // file.save is really wired only for extraction charts (saveClioChartAsDocument);
      // a pasted scratch table has no document save — do not advertise one.
      state.supported = engineState()?.extraction?.temporary
        ? ['edit.undo', 'edit.redo', 'file.save']
        : ['edit.undo', 'edit.redo'];
    };

    const grid = () => doc.getElementById('clio-chart-grid');

    const bag = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); bag.push(() => target.removeEventListener(type, fn, opts)); };
    // Real cell edits go through input.clio-chart-cell-input inside the grid.
    on(split, 'input', () => { state.editRevision += 1; syncDerived(); notify(); }, true);
    on(split, 'compositionstart', () => { state.composing = true; notify(); }, true);
    on(split, 'compositionend', () => { state.composing = false; notify(); }, true);
    on(split, 'keyup', () => { state.selectionEpoch += 1; }, true);
    on(split, 'mouseup', () => { state.selectionEpoch += 1; }, true);

    const adapter = {
      getContext() { syncDerived(); return { ...state }; },
      async execute(command) {
        if (disposed) return { status: 'blocked', code: 'DISPOSED' };
        syncDerived();
        if (state.composing) return { status: 'blocked', code: 'IME_COMPOSING', message: '輸入法組字中，命令延後。' };
        if (command === 'edit.undo' || command === 'edit.redo') {
          const undo = command === 'edit.undo';
          const engine = engineState();
          if (!engine?.table) return { status: 'blocked', code: 'NO_DOCUMENT' };
          const ok = undo ? hostWindow.undoClioChart() : hostWindow.redoClioChart();
          state.editRevision += 1;
          syncDerived(); notify();
          return ok ? { status: 'ok' } : { status: 'blocked', code: undo ? 'NOTHING_TO_UNDO' : 'NOTHING_TO_REDO' };
        }
        if (command === 'file.save') {
          const engine = engineState();
          if (!engine?.extraction?.temporary) return { status: 'blocked', code: 'NOT_WIRED', message: '粘貼的草稿表格沒有文檔保存路徑；抽取圖才可存為文檔。' };
          if (typeof hostWindow.saveClioChartAsDocument !== 'function') return { status: 'blocked', code: 'NOT_WIRED' };
          state.saving = true; notify();
          try {
            const file = await hostWindow.saveClioChartAsDocument();
            return file ? { status: 'ok' } : { status: 'failed', code: 'SAVE_REFUSED', message: '引擎未完成保存（無作用中專案或身份改變）。' };
          } catch (error) {
            return { status: 'failed', code: error?.code || 'SAVE_FAILED', message: String(error?.message || error) };
          } finally { state.saving = false; syncDerived(); notify(); }
        }
        return { status: 'blocked', code: 'NOT_WIRED', message: '此命令尚未接入真實能力，保持停用。' };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      // Mount ONLY the actual chart document surface: the grid + projection
      // split. ClioChart's details bar stays as the window's own chrome.
      mountEditor(target) {
        if (mounted) throw new Error('chart-adapter: editor already mounted');
        mounted = true;
        const marker = doc.createComment('cw3-chart-split-home');
        const parent = split.parentNode;
        parent.insertBefore(marker, split);
        const prevStyle = split.getAttribute('style');
        target.append(split);
        split.style.inlineSize = '100%';
        split.style.blockSize = '100%';
        return {
          dispose() {
            if (!mounted) return;
            mounted = false;
            split.style.inlineSize = '';
            split.style.blockSize = '';
            if (prevStyle === null) split.removeAttribute('style');
            else split.setAttribute('style', prevStyle);
            if (marker.parentNode) {
              marker.parentNode.insertBefore(split, marker);
              marker.remove();
            } else {
              doc.getElementById('clio-chart-pane')?.append(split);
            }
          },
        };
      },
      readSelection() {
        const s = engineState();
        return s ? { row: s.selection?.row ?? 0, column: s.selection?.column ?? 0 } : null;
      },
      restoreSelection(mark) {
        const s = engineState();
        if (s && mark && typeof mark.row === 'number') s.selection = { row: mark.row, column: mark.column || 0 };
      },
    };

    // The engine registered its own "clioChart" edit history when its module
    // loaded; both Edit > Undo and the ClioWorks toolbar dispatch reach the same
    // engine functions, so the port verifies instead of replacing.
    const moreMenu = root.ClioWorksMoreMenu.create(hostWindow);
    let engineRegistrationSeen = false;
    const menuPort = {
      bind() {
        try {
          engineRegistrationSeen = typeof hostWindow.editHistoryFor === 'function'
            ? hostWindow.editHistoryFor('clioChart') !== null : false;
        } catch (e) { engineRegistrationSeen = false; }
        return () => { moreMenu.remove(); };
      },
      openMore: moreMenu.openMore,
    };

    function dispose() {
      if (disposed) return;
      disposed = true;
      moreMenu.remove();
      bag.forEach((off) => { try { off(); } catch (e) { /* gone */ } });
      bag.length = 0;
      listeners.clear();
    }

    return { adapter, menuPort, engineRegistrationSeen: () => engineRegistrationSeen, dispose };
  }

  root.ClioWorksChart = Object.freeze({ create: createChartIntegration });
})(typeof window !== 'undefined' ? window : globalThis);
