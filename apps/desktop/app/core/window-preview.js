// Optional, memory-only pictures of real windows. Never restore to photograph.
(() => {
  if (window.AISystem6WindowPreviewLoaded) return;
  const pictures = new WeakMap();
  const pending = new WeakMap();
  const generations = new WeakMap();
  const alive = (win) => !!win?.isConnected && !win.classList.contains("is-hidden");
  const visible = (win) => alive(win) && !["is-app-hidden", "is-minimized", "is-collapsed", "is-slide-hidden"].some((name) => win.classList.contains(name));
  const result = (win, stale = true) => ({ url: pictures.get(win) || null, stale, unavailable: !pictures.has(win) });
  function cancel(win) {
    if (!win) return;
    generations.set(win, (generations.get(win) || 0) + 1);
    pending.delete(win);
  }
  function release(win) {
    cancel(win); pictures.delete(win);
    window.AISystem6WindowMinimize?.releaseCapture?.(win);
  }
  function rememberBitmap(win, capture) {
    if (alive(win) && capture?.source === "dom" && capture.dataUrl) pictures.set(win, capture.dataUrl);
  }
  function get(win) {
    if (!alive(win)) { if (win) release(win); return Promise.resolve({ url: null, stale: false, unavailable: true }); }
    if (!visible(win)) {
      const saved = window.AISystem6WindowMinimize?.getDomMiniatureDataUrl?.(win);
      if (saved) pictures.set(win, saved);
      return Promise.resolve(result(win));
    }
    if (pending.has(win)) return pending.get(win);
    const generation = generations.get(win) || 0;
    const request = (async () => {
      try {
        if (!window.AISystem6WindowMinimize?.captureDomWindowBitmap) {
          await ensureLazySystemModule("app/core/window-minimize.js", "AISystem6WindowMinimizeLoaded");
        }
        if (!visible(win) || generation !== (generations.get(win) || 0)) return result(win);
        // captureDomWindowBitmap clones synchronously before its first await.
        const picture = await window.AISystem6WindowMinimize.captureDomWindowBitmap(win);
        if (!alive(win) || generation !== (generations.get(win) || 0)) return { url: null, stale: false, unavailable: true };
        rememberBitmap(win, picture);
        return result(win, !visible(win) || !picture);
      } catch (_) { return result(win); }

    })();
    pending.set(win, request);
    request.finally(() => { if (pending.get(win) === request) pending.delete(win); });
    return request;
  }
  window.AISystem6WindowPreview = Object.freeze({ get, remember: get, rememberBitmap, release, cancel });
  window.AISystem6WindowPreviewLoaded = true;
})();
