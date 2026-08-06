// Data-only payload for AI System 6. Keep runtime behavior in app.js.
window.AISystem6Data = (() => {
  const translations = {
    // Live getters: the inactive language table may be lazy-loaded after this
    // data object is built, so t() must read the current globals on demand.
    get en() { return window.AISystem6TranslationsEn || {}; },
    get zh() { return window.AISystem6TranslationsZh || {}; },
  };

  return {
    translations,
  };
})();
