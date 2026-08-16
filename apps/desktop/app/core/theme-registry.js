// Boot-safe Appearance registry.
//
// This file is loaded synchronously in <head>, before the stylesheet, so the
// saved era is present on the document before first paint. The application
// bundle consumes the same registry later; do not duplicate theme metadata in
// event handlers or feature modules.
(function installThemeRegistry(global) {
  "use strict";

  const STORAGE_KEY = "ai-system-6-theme";
  const LEGACY_LIQUID_KEY = "ai-system-6-liquid-glass";
  const DEFAULT_THEME_ID = "classic";

  // `year` is the release year of the system each appearance reproduces. It is
  // the axis Theme Lab's timeline is drawn on, and it matches site/js/eras.js
  // so the product and the public page date the same era the same way.
  //
  // recipeBase is a maintenance lineage, not a second active CSS class. A
  // child starts from its named parent recipe, then owns an explicit delta;
  // family is reserved for genuinely shared primitives.
  //
  // `menuBarModel` is the one place that answers "whose menu bar is this",
  // because the two lineages answer it differently and no skin can absorb the
  // difference:
  //
  //   "application-owned" (System 5/6 through Mac OS 9) -- the foreground
  //     application builds the whole bar from its own MBAR/MENU resources,
  //     Apple menu included, and the right end is an *indicator*: clicking it
  //     brings the next open application forward. Apple's 1988 System Software
  //     6.0 guide, p.229: "Clicking the small icon in the menu bar brings
  //     forward each open application in succession." MultiFinder's own file
  //     on the bundled System 6.0.8 image carries no MENU resource at all.
  //
  //   "system-owned" (Mac OS X) -- the Apple menu belongs to the system and
  //     cannot be modified, and a bold application-name menu sits next to it.
  //     Apple's Aqua HIG (June 2002) p.54 calls that menu "new in Mac OS X",
  //     so it must never appear in the classic or platinum appearance.
  //
  // Evidence and citations: internal research notes for this change; the rule
  // is pinned by tests/features/menu-bar.test.mjs.
  const registry = Object.freeze([
    Object.freeze({
      id: "classic",
      year: 1988,
      label: "System 6",
      labelKey: "theme_classic",
      family: "classic",
      recipeBase: null,
      menuBarModel: "application-owned",
      releaseReady: true,
      systemFont: "Chicago",
      systemFontSize: 12,
      fontStrategy: "preference",
      overlay: "none",
      capabilities: Object.freeze(["native-window-outline", "one-bit-chrome"]),
    }),
    Object.freeze({
      id: "platinum",
      year: 1999,
      label: "Platinum",
      labelKey: "theme_platinum",
      family: "classic",
      recipeBase: "classic",
      menuBarModel: "application-owned",
      releaseReady: true,
      systemFont: "Charcoal",
      systemFontSize: 12,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "grayscale-depth", "native-window-outline"]),
    }),
    Object.freeze({
      id: "aqua",
      year: 2002,
      label: "Aqua",
      labelKey: "theme_aqua",
      // Aqua is its own recipe root. Liquid Glass was only the engineering
      // donor while the Aqua branch was scaffolded; the finished appearance
      // owns its material, geometry, and state rules under data-theme="aqua".
      family: "aqua",
      recipeBase: null,
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "Lucida Grande",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "pinstripe", "traffic-lights"]),
    }),
    Object.freeze({
      id: "snow-leopard",
      year: 2009,
      label: "Snow Leopard",
      labelKey: "theme_snow_leopard",
      // Snow Leopard derives from the Aqua branch, not from Liquid Glass.
      // It shares the Aqua control skeleton and replaces the Jaguar material
      // with its own 10.6 token delta.
      family: "aqua",
      recipeBase: "aqua",
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "Lucida Grande",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "unified-toolbar", "traffic-lights"]),
    }),
    Object.freeze({
      id: "yosemite",
      year: 2014,
      label: "Yosemite",
      labelKey: "theme_yosemite",
      family: "liquid-glass",
      recipeBase: "liquid-glass",
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "Helvetica Neue",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["vibrancy", "translucent-sidebar", "traffic-lights"]),
    }),
    Object.freeze({
      id: "liquid-glass",
      year: 2026,
      label: "Liquid Glass",
      labelKey: "theme_liquid_glass",
      family: "liquid-glass",
      recipeBase: null,
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "SF Pro",
      systemFontSize: 13,
      fontStrategy: "modern",
      overlay: "liquid-glass",
      capabilities: Object.freeze(["vibrancy", "continuous-glass", "liquid-overlay", "traffic-lights"]),
    }),
  ]);

  const byId = new Map(registry.map((theme) => [theme.id, theme]));

  function normalizeThemeId(value) {
    const id = String(value || "").trim().toLowerCase();
    return byId.has(id) ? id : DEFAULT_THEME_ID;
  }

  // Release path: every era in the registry is a supported appearance and
  // may become the active product theme. No research switch gates any theme.
  function normalizeReleaseThemeId(value) {
    const theme = byId.get(String(value || "").trim().toLowerCase());
    if (theme?.releaseReady) return theme.id;
    return DEFAULT_THEME_ID;
  }

  function readInitialTheme(storage) {
    try {
      const targetStorage = storage === undefined ? global.localStorage : storage;
      const stored = targetStorage?.getItem(STORAGE_KEY);
      let migrated = DEFAULT_THEME_ID;
      if (stored && byId.has(stored)) {
        migrated = normalizeReleaseThemeId(stored);
      } else if (targetStorage?.getItem(LEGACY_LIQUID_KEY) === "true") {
        migrated = "liquid-glass";
      }
      targetStorage?.setItem(STORAGE_KEY, migrated);
      targetStorage?.removeItem(LEGACY_LIQUID_KEY);
      return migrated;
    } catch (error) {
      return DEFAULT_THEME_ID;
    }
  }

  let currentThemeId = readInitialTheme();

  function projectThemeToElement(element, theme) {
    if (!element) return;
    element.dataset.theme = theme.id;
    element.dataset.themeFamily = theme.family;
    // The menu-bar model is projected, not derived from the family, because it
    // is a semantic fact the stylesheet and the runtime must agree on. CSS
    // reads it here; JS reads it through menuBarModel(). One source, two
    // consumers.
    element.dataset.menuBarModel = theme.menuBarModel;
    if (theme.recipeBase) element.dataset.themeBase = theme.recipeBase;
    else delete element.dataset.themeBase;
    if (element === global.document?.body) {
      // Only Liquid Glass itself carries the glass skin class. Yosemite is a
      // Liquid-Glass-family descendant for maintenance lineage, but it owns
      // an independent 10.10 painter under body[data-theme="yosemite"] and
      // must never inherit the glass material, blur, refraction, or overlay.
      element.classList.toggle("use-liquid-glass", theme.id === "liquid-glass");
    }
  }

  function syncBody() {
    const theme = byId.get(currentThemeId) || byId.get(DEFAULT_THEME_ID);
    projectThemeToElement(global.document?.documentElement, theme);
    projectThemeToElement(global.document?.body, theme);
    return theme;
  }

  function syncFontStrategy(modernFontPreference = false) {
    const theme = byId.get(currentThemeId) || byId.get(DEFAULT_THEME_ID);
    const useModern = theme.fontStrategy === "modern"
      || (theme.fontStrategy === "preference" && modernFontPreference === true);
    global.document?.body?.classList.toggle("use-modern-fonts", useModern);
    return useModern;
  }

  function applyTheme(value, options = {}) {
    const previousId = currentThemeId;
    const experimental = options.experimental === true;
    // Experimental previews (Theme Lab / development tooling) switch for this
    // session only and never persist. The normal API accepts every release
    // theme in the registry.
    currentThemeId = experimental ? normalizeThemeId(value) : normalizeReleaseThemeId(value);
    const theme = syncBody();
    syncFontStrategy(options.modernFontPreference === true);
    if (!experimental && options.persist !== false) {
      try {
        global.localStorage?.setItem(STORAGE_KEY, theme.id);
        global.localStorage?.removeItem(LEGACY_LIQUID_KEY);
      } catch (error) {
        // Appearance remains applied for this session when storage is blocked.
      }
    }
    if (previousId !== theme.id && options.announce !== false) {
      global.document?.dispatchEvent?.(new CustomEvent("ai-system6-themechange", {
        detail: Object.freeze({ previousId, themeId: theme.id, theme }),
      }));
    }
    return theme;
  }

  function previewExperimentalTheme(value) {
    return applyTheme(value, { experimental: true, persist: false });
  }

  function getCurrentTheme() {
    return currentThemeId;
  }

  function getTheme(value = currentThemeId) {
    return byId.get(normalizeThemeId(value));
  }

  function getReleaseReadyThemes() {
    return registry.filter((theme) => theme.releaseReady !== false);
  }

  function getRecipeChain(value = currentThemeId) {
    const chain = [];
    const visited = new Set();
    let theme = getTheme(value);
    while (theme) {
      if (visited.has(theme.id)) throw new Error(`Appearance recipe cycle at ${theme.id}`);
      visited.add(theme.id);
      chain.unshift(theme);
      theme = theme.recipeBase ? byId.get(theme.recipeBase) : null;
    }
    return Object.freeze(chain);
  }

  function hasCapability(capability, value = currentThemeId) {
    return getTheme(value).capabilities.includes(String(capability || ""));
  }

  // Whose bar is it. See the registry comment: "application-owned" is the
  // System 5/6 through Mac OS 9 model, "system-owned" is Mac OS X.
  function getMenuBarModel(value = currentThemeId) {
    return getTheme(value).menuBarModel;
  }

  function isApplicationOwnedMenuBar(value = currentThemeId) {
    return getMenuBarModel(value) === "application-owned";
  }

  const api = Object.freeze({
    STORAGE_KEY,
    LEGACY_LIQUID_KEY,
    DEFAULT_THEME_ID,
    themes: registry,
    normalizeThemeId,
    normalizeReleaseThemeId,
    readInitialTheme,
    applyTheme,
    previewExperimentalTheme,
    getCurrentTheme,
    getTheme,
    getReleaseReadyThemes,
    getRecipeChain,
    hasCapability,
    getMenuBarModel,
    isApplicationOwnedMenuBar,
    syncBody,
    syncFontStrategy,
  });

  global.AISystem6Theme = api;
  syncBody();
})(window);
