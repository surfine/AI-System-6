/* V3-E-3 (DeckCraft): a REAL stage-kind NativeEditorAdapter around the
 * ClioStage engine. Loaded ONLY by the clioworks-v3 fixture
 * (?fixture=clioworks-v3&adapter=stage). The engine's Marp parsing, deck
 * rendering, presenting state (slide/cue modes hold a wake lock) and its
 * print-to-PDF sheet stay the engine's. Deck text editing lives upstream in
 * TeachText — the source view here is a read-only projection, so undo is
 * advertised only while the engine actually holds a deck history. */
(function (root) {
  'use strict';

  function createStageIntegration(hostWindow) {
    const doc = hostWindow.document;
    const win = doc.querySelector('[data-window="clioStage"]');
    const viewport = doc.getElementById('clio-stage-viewport');
    if (!win || !viewport) throw new Error('stage-adapter: clioStage window / #clio-stage-viewport missing');
    if (!hostWindow.AISystem6ClioStageLoaded) throw new Error('stage-adapter: ClioStage engine module not loaded');

    // clioStageState is a global LEXICAL binding (top-level const of the lazy
    // module), not a window property; functions are classic declarations.
    const engineState = () => {
      try { return clioStageState; } catch (e) { return null; }
    };

    let disposed = false;
    let mounted = false;
    const listeners = new Set();
    const state = {
      kind: 'stage', documentId: 'clio-stage-empty', sessionId: 'cw3-stage-' + Math.random().toString(36).slice(2, 8),
      generation: 1, editRevision: 0, selectionEpoch: 0,
      readonly: false, composing: false, saving: false, closed: false,
      canUndo: false, canRedo: false,
      supported: ['stage.present', 'file.export'],
    };

    const notify = () => { if (!disposed) listeners.forEach((fn) => { try { fn(); } catch (e) { hostWindow.console?.error?.(e); } }); };

    const syncDerived = () => {
      const s = engineState();
      const id = s?.source?.sourceItemId || s?.source?.title || (s?.parsed ? 'clio-stage-deck' : 'clio-stage-empty');
      if (id !== state.documentId) { state.documentId = id; state.generation += 1; }
      state.closed = win.classList.contains('is-hidden') || win.classList.contains('is-app-hidden');
      state.readonly = false;
      const history = s?.history && !s.source?.streaming ? s.history : null;
      state.canUndo = Boolean(history?.canUndo?.());
      state.canRedo = Boolean(history?.canRedo?.());
      // Undo/redo are advertised only when the engine really holds a deck
      // history (mirrors the engine's own Edit-menu registration rule).
      const base = ['stage.present', 'file.export'];
      state.supported = history ? base.concat(['edit.undo', 'edit.redo']) : base;
    };

    const bag = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); bag.push(() => target.removeEventListener(type, fn, opts)); };
    on(viewport, 'keyup', () => { state.selectionEpoch += 1; notify(); }, true);
    on(viewport, 'mouseup', () => { state.selectionEpoch += 1; notify(); }, true);

    const adapter = {
      getContext() { syncDerived(); return { ...state }; },
      async execute(command) {
        if (disposed) return { status: 'blocked', code: 'DISPOSED' };
        syncDerived();
        const s = engineState();
        if (command === 'stage.present') {
          if (!s?.parsed) return { status: 'blocked', code: 'NO_DOCUMENT', message: '沒有可放映的牌組。' };
          // Presenting is the engine's own concept: slide mode holds a wake
          // lock while it is on screen.
          hostWindow.setClioStageMode('slide');
          state.editRevision += 1;
          syncDerived(); notify();
          return { status: 'ok' };
        }
        if (command === 'file.export') {
          if (!s?.parsed) return { status: 'blocked', code: 'NO_DOCUMENT', message: '沒有可導出的牌組。' };
          if (typeof hostWindow.clioStageExportPdf !== 'function') return { status: 'blocked', code: 'NOT_WIRED' };
          // The REAL print-to-PDF path: builds the print sheet, opens a popup
          // and calls print(). Popup blockers or headless print limits are
          // reported by the engine's own status line.
          const ok = hostWindow.clioStageExportPdf();
          return ok ? { status: 'ok' } : { status: 'failed', code: 'EXPORT_BLOCKED', message: '引擎回報列印彈窗被阻擋。' };
        }
        if (command === 'edit.undo' || command === 'edit.redo') {
          const history = s?.history && !s.source?.streaming ? s.history : null;
          if (!history) return { status: 'blocked', code: 'NO_HISTORY' };
          const undo = command === 'edit.undo';
          if (undo ? !history.canUndo() : !history.canRedo()) {
            return { status: 'blocked', code: undo ? 'NOTHING_TO_UNDO' : 'NOTHING_TO_REDO' };
          }
          (undo ? history.undo() : history.redo());
          state.editRevision += 1;
          syncDerived(); notify();
          return { status: 'ok' };
        }
        return { status: 'blocked', code: 'NOT_WIRED', message: '此命令尚未接入真實能力，保持停用。' };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      // Mount ONLY the deck document surface (the viewport with its document /
      // slide / cue / source projections). The stage window's own toolbar and
      // ask bar stay as native chrome.
      mountEditor(target) {
        if (mounted) throw new Error('stage-adapter: editor already mounted');
        mounted = true;
        // ClioWorks owns the window while mounted: the stage's native toolbar
        // (nav + view switcher + layout select) and ask bar step aside and are
        // restored on dispose.
        const nativeStrips = [
          win.querySelector('.clio-stage-toolbar'),
          win.querySelector('#clio-stage-ask-form'),
        ].filter(Boolean);
        const restoreStrips = nativeStrips.map((el) => {
          const prev = el.style.display;
          el.style.display = 'none';
          return () => { el.style.display = prev; };
        });
        const marker = doc.createComment('cw3-stage-viewport-home');
        const parent = viewport.parentNode;
        parent.insertBefore(marker, viewport);
        const prevStyle = viewport.getAttribute('style');
        target.append(viewport);
        viewport.style.inlineSize = '100%';
        viewport.style.blockSize = '100%';
        return {
          dispose() {
            if (!mounted) return;
            mounted = false;
            viewport.style.inlineSize = '';
            viewport.style.blockSize = '';
            if (prevStyle === null) viewport.removeAttribute('style');
            else viewport.setAttribute('style', prevStyle);
            if (marker.parentNode) {
              marker.parentNode.insertBefore(viewport, marker);
              marker.remove();
            } else {
              doc.querySelector('.clio-stage-pane')?.append(viewport);
            }
            restoreStrips.forEach((restore) => restore());
          },
        };
      },
      readSelection() {
        const s = engineState();
        return s ? { slideIndex: s.index ?? 0 } : null;
      },
      restoreSelection(mark) {
        const s = engineState();
        if (s && mark && typeof mark.slideIndex === 'number' && typeof hostWindow.showClioStageSlide === 'function') {
          hostWindow.showClioStageSlide(mark.slideIndex);
        }
      },
    };

    // The engine registered its own "clioStage" edit history; the port verifies
    // instead of replacing, and the shared host-material menu serves commands.
    const moreMenu = root.ClioWorksMoreMenu.create(hostWindow);
    let engineRegistrationSeen = false;
    const menuPort = {
      bind() {
        try {
          engineRegistrationSeen = typeof hostWindow.editHistoryFor === 'function'
            ? hostWindow.editHistoryFor('clioStage') !== null : false;
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

  root.ClioWorksStage = Object.freeze({ create: createStageIntegration });
})(typeof window !== 'undefined' ? window : globalThis);
