/* Isolated native-theme fixture for the ClioWorks v3 kit (V3-A).
 * Internal design lab: boots the real desk with ?fixture=clioworks-v3, then mounts the
 * candidate toolbar/editor inside an existing window chrome using ONLY native-layout.css.
 * Never loads the kit's workspace.css or demo CSS. Not part of any route or launch list. */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('fixture')) return;
  const kind = new URLSearchParams(location.search).get('fixture');
  if (kind !== 'clioworks-v3') return;

  const FIXTURE_CSS = "styles.clioworks-native.css";
  const MODULES = [
    'app/vendor/clioworks-v3/core.js',
    'app/vendor/clioworks-v3/dom.js',
    'app/vendor/clioworks-v3/components.js',
    'app/vendor/clioworks-v3/theme-bridge.js',
    'app/vendor/clioworks-v3/host-mount.js',
  ];

  function loadStyle(href) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve(link);
      link.onerror = () => reject(new Error('fixture: failed to load ' + href));
      document.head.append(link);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error('fixture: failed to load ' + src));
      document.head.append(script);
    });
  }

  function waitForBoot() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', () => resolve(), { once: true });
    });
  }

  function log(line) {
    const pre = document.getElementById('cw3-log');
    if (pre) pre.textContent += line + '\n';
  }

  // Plaintext fixture adapter: it owns a contenteditable and reports honest state.
  // It is NOT the real editor; V3-B replaces it with the actual adapter.
  function createFixtureAdapter(hostWindow) {
    const doc = hostWindow.document;
    const state = {
      kind: 'write', documentId: 'fixture-doc-1', sessionId: 'fixture-session-1',
      generation: 1, editRevision: 0, selectionEpoch: 0,
      readonly: false, composing: false, saving: false, closed: false,
      canUndo: false, canRedo: false,
      supported: ['file.save', 'edit.undo', 'edit.find', 'comment.open', 'format.open', 'view.outline'],
    };
    let editor = null, listeners = new Set();
    const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    return {
      getContext() { return { ...state }; },
      async execute(command) {
        if (command === 'file.save') { state.saving = false; return { status: 'ok' }; }
        if (command === 'edit.undo') return state.canUndo ? { status: 'ok' } : { status: 'blocked', code: 'NOTHING_TO_UNDO' };
        return { status: 'blocked', code: 'NOT_WIRED', message: '夹具编辑器尚未接入此操作。' };
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      mountEditor(target) {
        editor = doc.createElement('div');
        editor.className = 'cw3-fixture-editor';
        editor.contentEditable = 'plaintext-only';
        editor.setAttribute('aria-label', '夹具文稿正文');
        editor.dataset.editKey = 'body';
        editor.textContent = 'ClioWorks v3 隔離夾具文稿。\n這是一段用來對照主題與系統控制元件的中文文字。\n第二段：工具列按鈕應沿用主倉 .btn 的材料與狀態。';
        editor.style.cssText = 'position:absolute;inset:12px;overflow:auto;padding:12px;outline:none;font:inherit;color:inherit;';
        const wrap = doc.createElement('div');
        wrap.style.cssText = 'position:absolute;inset:0;background:var(--paper,transparent);color:var(--ink,inherit);';
        wrap.append(editor);
        target.append(wrap);
        editor.addEventListener('input', () => {
          state.editRevision += 1; state.canUndo = state.editRevision > 0; notify();
        });
        editor.addEventListener('compositionstart', () => { state.composing = true; notify(); });
        editor.addEventListener('compositionend', () => { state.composing = false; notify(); });
        editor.addEventListener('keyup', () => { state.selectionEpoch += 1; });
        editor.addEventListener('mouseup', () => { state.selectionEpoch += 1; });
        return { dispose() { editor?.remove(); editor = null; listeners.clear(); } };
      },
      readSelection() { return editor ? hostWindow.ClioWorksDOM.bookmark(editor) : null; },
      restoreSelection(mark) { if (editor) hostWindow.ClioWorksDOM.restoreBookmark(editor.parentElement || editor, mark); },
    };
  }

  // Host menu port against the real registry menu model. The fixture window is not a
  // registered app, so the system menubar stays untouched; we only read the model.
  function createFixtureMenuPort(hostWindow) {
    return {
      bind({ getContext }) {
        const registry = hostWindow.AISystem6Theme;
        if (registry?.getMenuBarModel) {
          log('fixture: menuBarModel=' + String(registry.getMenuBarModel()));
        }
        return () => {};
      },
    };
  }

  async function main() {
    await waitForBoot();
    await loadStyle(FIXTURE_CSS);
    for (const src of MODULES) await loadScript(src);
    const registry = window.AISystem6Theme;
    if (!registry) { log('fixture: AISystem6Theme missing'); return; }
    const theme = await registry.whenReady();
    log('fixture: theme ready id=' + theme.id + ' family=' + theme.family);

    // Mount inside a desktop window whose lifecycle the fixture controls. Boot-time
    // windows (e.g. assistant) can be hidden again after load, so after the real boot
    // settles, open the projects window the way a user would and host there.
    for (let i = 0; i < 150 && document.body.dataset.appReady !== 'ready'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (typeof openWindow !== 'function') { log('fixture: openWindow missing'); return; }

    const adapterKind = new URLSearchParams(location.search).get('adapter') || 'plaintext';
    if (adapterKind === 'stage') {
      // V3-E-3 (DeckCraft): real ClioStage engine adapter in the real window.
      await loadScript('app/vendor/clioworks-v3/more-menu.js');
      await loadScript('app/vendor/clioworks-v3/stage-adapter.js');
      openWindow('clioStage');
      let stageWin = null;
      for (let i = 0; i < 80 && !stageWin; i += 1) {
        stageWin = document.querySelector('[data-window="clioStage"]:not(.is-hidden):not(.is-app-hidden)');
        if (!stageWin) { await new Promise((resolve) => setTimeout(resolve, 100)); }
      }
      const engineReady = await new Promise((resolve) => {
        const started = Date.now();
        (function check() {
          if (window.AISystem6ClioStageLoaded && document.getElementById('clio-stage-viewport')) return resolve(true);
          if (Date.now() - started > 12000) return resolve(false);
          setTimeout(check, 100);
        })();
      });
      if (!stageWin || !engineReady) { log('fixture: clioStage window/engine never ready'); return; }
      const pane = document.querySelector('.clio-stage-pane');
      if (!pane) { log('fixture: clio-stage-pane missing'); return; }
      pane.style.position = 'relative';
      const mountPoint = document.createElement('div');
      mountPoint.id = 'cw3-mount';
      mountPoint.style.cssText = 'position:absolute;inset:0;';
      pane.append(mountPoint);
      let integration;
      try {
        integration = window.ClioWorksStage.create(window);
      } catch (error) {
        log('fixture: stage adapter error ' + (error && error.message));
        return;
      }
      window.__CW3_INTEGRATION__ = integration;
      let mounted;
      try {
        mounted = window.ClioWorksHost.mountNative({
          element: mountPoint,
          adapter: integration.adapter,
          menuPort: integration.menuPort,
          hostWindow: window,
          onError: (error) => log('fixture: mount error ' + (error && error.message)),
          onTheme: (info) => { window.__CW3_THEME__ = info; },
        });
      } catch (error) {
        log('fixture: mountNative failed ' + (error && error.message));
        integration.dispose();
        return;
      }
      await mounted.ready;
      log('fixture: stage adapter mounted engineRegistrationSeen=' + integration.engineRegistrationSeen());
      log('fixture: DONE');
      window.__CW3_MOUNTED__ = {
        mounted,
        info: window.__CW3_THEME__,
        adapter: integration.adapter,
        dispose() {
          try { mounted.dispose(); } finally {
            try { integration.dispose(); } finally { mountPoint.remove(); }
          }
        },
      };
      return;
    }
    if (adapterKind === 'chart') {
      // V3-E-1 (GridCraft): real ClioChart engine adapter in the real window.
      await loadScript('app/vendor/clioworks-v3/more-menu.js');
      await loadScript('app/vendor/clioworks-v3/chart-adapter.js');
      openWindow('clioChart');
      let chartWin = null;
      for (let i = 0; i < 80 && !chartWin; i += 1) {
        chartWin = document.querySelector('[data-window="clioChart"]:not(.is-hidden):not(.is-app-hidden)');
        if (!chartWin) { await new Promise((resolve) => setTimeout(resolve, 100)); }
      }
      const engineReady = await new Promise((resolve) => {
        const started = Date.now();
        (function check() {
          if (window.AISystem6ClioChartLoaded && document.getElementById('clio-chart-split')) return resolve(true);
          if (Date.now() - started > 12000) return resolve(false);
          setTimeout(check, 100);
        })();
      });
      if (!chartWin || !engineReady) { log('fixture: clioChart window/engine never ready'); return; }
      const pane = document.querySelector('.clio-chart-pane');
      if (!pane) { log('fixture: clio-chart-pane missing'); return; }
      pane.style.position = 'relative';
      const mountPoint = document.createElement('div');
      mountPoint.id = 'cw3-mount';
      mountPoint.style.cssText = 'position:absolute;inset:0;';
      pane.append(mountPoint);
      let integration;
      try {
        integration = window.ClioWorksChart.create(window);
      } catch (error) {
        log('fixture: chart adapter error ' + (error && error.message));
        return;
      }
      window.__CW3_INTEGRATION__ = integration;
      let mounted;
      try {
        mounted = window.ClioWorksHost.mountNative({
          element: mountPoint,
          adapter: integration.adapter,
          menuPort: integration.menuPort,
          hostWindow: window,
          onError: (error) => log('fixture: mount error ' + (error && error.message)),
          onTheme: (info) => { window.__CW3_THEME__ = info; },
        });
      } catch (error) {
        log('fixture: mountNative failed ' + (error && error.message));
        integration.dispose();
        return;
      }
      await mounted.ready;
      log('fixture: chart adapter mounted engineRegistrationSeen=' + integration.engineRegistrationSeen());
      log('fixture: DONE');
      window.__CW3_MOUNTED__ = {
        mounted,
        info: window.__CW3_THEME__,
        adapter: integration.adapter,
        dispose() {
          try { mounted.dispose(); } finally {
            try { integration.dispose(); } finally { mountPoint.remove(); }
          }
        },
      };
      return;
    }
    if (adapterKind === 'teachtext') {
      // V3-B: real TeachText adapter inside the real teachText window.
      await loadScript('app/vendor/clioworks-v3/more-menu.js');
      await loadScript('app/vendor/clioworks-v3/teachtext-adapter.js');
      // edit-history.js is a lazy runtime module; ensure the shared undo kernel
      // is present before the adapter builds on it. Same for the real Word DOCX
      // pipeline (V3-E-2).
      if (!window.AISystem6EditHistory) await loadScript('app/core/edit-history.js');
      if (!window.AISystem6WordExport && typeof ensureWordExportModule === 'function') {
        try { await ensureWordExportModule(); } catch (e) { log('fixture: word-export load failed'); }
      }
      openWindow('teachText');
      let ttWin = null;
      for (let i = 0; i < 50 && !ttWin; i += 1) {
        ttWin = document.querySelector('[data-window="teachText"]:not(.is-hidden):not(.is-app-hidden)');
        if (!ttWin) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!ttWin) { log('fixture: teachText window never became visible'); return; }
      const pane = document.getElementById('teachtext-form');
      if (!pane) { log('fixture: teachtext-form missing'); return; }
      pane.style.position = 'relative';
      const mountPoint = document.createElement('div');
      mountPoint.id = 'cw3-mount';
      mountPoint.style.cssText = 'position:absolute;inset:0;';
      pane.append(mountPoint);
      let integration;
      try {
        integration = window.ClioWorksTeachText.create(window);
      } catch (error) {
        log('fixture: teachtext adapter error ' + (error && error.message));
        return;
      }
      window.__CW3_INTEGRATION__ = integration;
      let mounted;
      try {
        mounted = window.ClioWorksHost.mountNative({
          element: mountPoint,
          adapter: integration.adapter,
          menuPort: integration.menuPort,
          hostWindow: window,
          onError: (error) => log('fixture: mount error ' + (error && error.message)),
          onTheme: (info) => { window.__CW3_THEME__ = info; },
        });
      } catch (error) {
        log('fixture: mountNative failed ' + (error && error.message));
        integration.dispose();
        return;
      }
      await mounted.ready;
      log('fixture: teachtext adapter mounted');
      log('fixture: DONE');
      window.__CW3_MOUNTED__ = {
        mounted,
        info: window.__CW3_THEME__,
        adapter: integration.adapter,
        dispose() {
          try { mounted.dispose(); } finally {
            try { integration.dispose(); } finally { mountPoint.remove(); }
          }
        },
      };
      return;
    }

    // Plaintext fixture (V3-A) into the projects window.
    openWindow('projects');
    let win = null;
    for (let i = 0; i < 50 && !win; i += 1) {
      win = document.querySelector('[data-window="projects"]:not(.is-hidden):not(.is-app-hidden):not(.is-minimized)');
      if (!win) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!win) { log('fixture: projects window never became visible'); return; }
    log('fixture: host window=' + (win.dataset.window || '(unnamed)'));
    win.style.inlineSize = 'min(720px, 92vw)';
    win.style.blockSize = 'min(520px, 80vh)';
    const body = win.querySelector('.window-body') || win.querySelector('.window-content') || win;
    const mountPoint = document.createElement('div');
    // display:block (NOT flex): .cw-native uses container-type:inline-size, whose
    // containment zeroes content-based sizing — the mount must stretch like a block
    // child so the container gets the window's definite width.
    mountPoint.id = 'cw3-mount';
    mountPoint.style.cssText = 'position:absolute;inset:0;';
    body.style.position = 'relative';
    body.append(mountPoint);

    const adapter = createFixtureAdapter(window);
    const menuPort = createFixtureMenuPort(window);
    const mounted = window.ClioWorksHost.mountNative({
      element: mountPoint,
      adapter,
      menuPort,
      hostWindow: window,
      onError: (e) => log('fixture: mount error ' + (e && e.message)),
      onTheme: (info) => {
        log('fixture: theme change id=' + info.themeId + ' missing=' + JSON.stringify(info.missing));
        window.__CW3_THEME__ = info;
      },
    });
    await mounted.ready;
    const info = window.__CW3_THEME__;
    log('fixture: mounted ready=' + (document.querySelector('[data-cw-mounted]') !== null));
    log('fixture: tokens=' + JSON.stringify(info ? info.tokens : null));
    log('fixture: DONE');
    window.__CW3_MOUNTED__ = { mounted, info, adapter };
  }

  window.__CW3_FIXTURE__ = { main };
  main().catch((e) => log('fixture: FATAL ' + (e && e.stack || e)));
})();
