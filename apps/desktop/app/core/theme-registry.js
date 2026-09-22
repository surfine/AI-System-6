// Boot-safe Appearance registry.
//
// This file is loaded synchronously in <head>, before the stylesheet, so the
// saved era is present on the document before first paint. The application
// bundle consumes the same registry later; do not duplicate theme metadata in
// event handlers or feature modules.
(function installThemeRegistry(global) {
  "use strict";

  const STORAGE_KEY = "ai-system-6-theme";
  const COLOR_MODE_STORAGE_KEY = "ai-system-6-color-mode";
  const LEGACY_LIQUID_KEY = "ai-system-6-liquid-glass";
  const DEFAULT_THEME_ID = "classic";

  function freezeAuthoringMetadata({ tokenFile, tokenSelector, art }) {
    const zoom = Object.freeze((art.zoom || []).map((pair) => Object.freeze([...pair])));
    return Object.freeze({
      tokenHome: Object.freeze({ file: tokenFile, selector: tokenSelector }),
      art: Object.freeze({
        ...art,
        tiers: Object.freeze([...(art.tiers || [])]),
        zoom,
        appearances: Object.freeze([...(art.appearances || ["default"])]),
      }),
    });
  }

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
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/00-foundation.css",
        tokenSelector: ":root",
        art: {
          dir: "classic", ext: "svg", tiers: [32, 16],
          ordinary: 32, compact: 16, large: 32,
          zoom: [[32, 32], [32, 64], [32, 128], [32, 256]],
          appearances: ["default"],
        },
      }),
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
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/65-appearance-themes.css",
        tokenSelector: 'html[data-theme="platinum"],\nbody[data-theme="platinum"]',
        art: {
          dir: "platinum", ext: "png", tiers: [42, 32, 16],
          ordinary: 32, compact: 16, large: 42,
          zoom: [[42, 168], [32, 96], [16, 64]],
          appearances: ["default"],
        },
      }),
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
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/67-aqua-appearance.css",
        tokenSelector: 'html[data-theme="aqua"],\nbody[data-theme="aqua"]',
        art: {
          dir: "aqua", ext: "png", tiers: [128, 32, 16],
          ordinary: 32, compact: 16, large: 128,
          zoom: [[128, 128], [32, 96], [16, 64]],
          appearances: ["default"],
        },
      }),
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
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/67-aqua-appearance.css",
        tokenSelector: 'html[data-theme="snow-leopard"],\nbody[data-theme="snow-leopard"]',
        art: {
          dir: "snow-leopard", ext: "png", tiers: [512, 128, 32, 16],
          ordinary: 32, compact: 16, large: 128,
          zoom: [[512, 256], [128, 128], [32, 96], [16, 64]],
          appearances: ["default"],
        },
      }),
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
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/65-appearance-themes.css",
        tokenSelector: 'html[data-theme="yosemite"],\nbody[data-theme="yosemite"]',
        art: {
          dir: "yosemite", ext: "png", tiers: [128, 64, 32, 16],
          ordinary: 32, compact: 16, large: 128,
          zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
          appearances: ["default"],
        },
      }),
    }),
    Object.freeze({
      id: "big-sur",
      year: 2020,
      label: "Big Sur",
      labelKey: "theme_big_sur",
      family: "liquid-glass",
      recipeBase: "liquid-glass",
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "SF Pro",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      colorModes: true,
      capabilities: Object.freeze(["vibrancy", "translucent-sidebar", "traffic-lights"]),
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/68-big-sur-appearance.css",
        tokenSelector: 'html[data-theme="big-sur"],\nbody[data-theme="big-sur"]',
        art: {
          dir: "big-sur", ext: "png", tiers: [128, 64, 32, 16],
          ordinary: 32, compact: 16, large: 128,
          zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
          appearances: ["default"],
        },
      }),
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
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/70-liquid-glass.css",
        tokenSelector: "body.use-liquid-glass",
        art: {
          dir: "liquid-glass", ext: "png", tiers: [128, 64, 32, 16],
          ordinary: 32, compact: 16, large: 128,
          zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
          variant: "-default",
          appearances: ["default", "dark", "clear"],
        },
      }),
    }),
    Object.freeze({
      id: "nextstep",
      year: 1995,
      label: "NeXTSTEP",
      labelKey: "theme_nextstep",
      family: "nextstep",
      recipeBase: null,
      // Experimental until the NeXTSTEP shell passes its workflow gates.
      menuBarModel: "application-owned",
      releaseReady: false,
      systemFont: "Helvetica",
      systemFontSize: 12,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "grayscale-depth"]),
      authoring: freezeAuthoringMetadata({
        tokenFile: "apps/desktop/styles/69-nextstep-appearance.css",
        tokenSelector: 'html[data-theme="nextstep"],\nbody[data-theme="nextstep"]',
        // Most icons retain Classic art; Theme Lab resolves the three new apps
        // to their authored NeXTSTEP supplement per object.
        art: {
          dir: "classic", ext: "svg", tiers: [32, 16],
          ordinary: 32, compact: 16, large: 32,
          zoom: [[32, 32], [32, 64], [32, 128], [32, 256]],
          appearances: ["default"],
        },
      }),
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

  function normalizeColorMode(value) {
    return ["light", "dark", "system"].includes(value) ? value : "system";
  }

  function readInitialColorMode() {
    try { return normalizeColorMode(global.localStorage?.getItem(COLOR_MODE_STORAGE_KEY)); }
    catch (error) { return "system"; }
  }

  const colorSchemeQuery = global.matchMedia?.("(prefers-color-scheme: dark)");
  let currentColorMode = readInitialColorMode();
  let committedColorMode = currentColorMode;
  function getColorMode() { return currentColorMode; }
  function getCommittedColorMode() { return committedColorMode; }
  function getResolvedColorMode() {
    return currentColorMode === "system" ? (colorSchemeQuery?.matches ? "dark" : "light") : currentColorMode;
  }

  function announceColorMode(source, committed, persisted) {
    global.document?.dispatchEvent?.(new CustomEvent("ai-system6-colormodechange", {
      detail: Object.freeze({ colorMode: currentColorMode, resolvedColorMode: getResolvedColorMode(),
        committedColorMode, committed, persisted, source }),
    }));
  }

  function applyColorMode(value, options = {}) {
    const previous = currentColorMode;
    const previousCommitted = committedColorMode;
    currentColorMode = normalizeColorMode(value);
    const committed = options.experimental !== true
      && (options.commit === true || (options.commit !== false && options.persist !== false));
    if (committed) committedColorMode = currentColorMode;
    const persisted = committed && options.persist !== false;
    if (persisted) {
      try { global.localStorage?.setItem(COLOR_MODE_STORAGE_KEY, currentColorMode); }
      catch (error) { /* Session preference still applies when storage is blocked. */ }
    }
    syncBody();
    if (options.announce !== false && (previous !== currentColorMode || previousCommitted !== committedColorMode)) {
      announceColorMode(String(options.source || "appearance"), committed, persisted);
    }
    return currentColorMode;
  }

  function restoreColorMode() {
    return applyColorMode(committedColorMode, { commit: false, persist: false, source: "preview-restore" });
  }

  let committedThemeId = readInitialTheme();
  let currentThemeId = committedThemeId === "nextstep" ? DEFAULT_THEME_ID : committedThemeId;
  let appearanceGeneration = 0;
  let pendingAppearance = null;
  const appearanceStyles = new Map();
  const appearanceStylePaths = { "big-sur": "styles.big-sur.css", nextstep: "styles.nextstep.css" };
  const preparations = new Set();
  let composing = false;
  const interactionWaiters = new Set();
  function settleInteractions() {
    if (composing || global.document?.querySelector?.("dialog[open]")) return;
    interactionWaiters.forEach((resolve) => resolve());
    interactionWaiters.clear();
  }
  global.document?.addEventListener?.("compositionstart", () => { composing = true; });
  global.document?.addEventListener?.("compositionend", () => { composing = false; settleInteractions(); });
  global.document?.addEventListener?.("close", settleInteractions, true);
  function waitForInteraction(theme) {
    if (theme.id !== "nextstep" && currentThemeId !== "nextstep") return null;
    if (!composing && !global.document?.querySelector?.("dialog[open]")) return null;
    return new Promise((resolve) => interactionWaiters.add(resolve));
  }

  function projectThemeToElement(element, theme) {
    if (!element) return;
    element.dataset.theme = theme.id;
    element.dataset.themeFamily = theme.family;
    if (theme.colorModes) element.dataset.colorMode = getResolvedColorMode();
    else delete element.dataset.colorMode;
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

  // Preparation never projects a partial appearance. Failed requests are
  // evicted so an offline/404 failure can be retried without reloading work.
  function ensureAppearanceStyles(theme) {
    const doc = global.document;
    if (!appearanceStylePaths[theme.id] || !doc?.createElement || !doc.head) return null;
    const existing = appearanceStyles.get(theme.id);
    if (existing) return existing.ready ? null : existing.promise;
    const link = doc.createElement("link");
    link.id = `${theme.id}-appearance-styles`;
    link.rel = "stylesheet";
    link.setAttribute("blocking", "render");
    const stamp = doc.querySelector('script[src*="theme-registry.js"]')?.src?.split("?")[1];
    link.href = appearanceStylePaths[theme.id] + (stamp ? `?${stamp}` : "");
    const entry = { ready: false, promise: null };
    entry.promise = new Promise((resolve, reject) => {
      const timeout = global.setTimeout(() => finish(false), 15000);
      const finish = (loaded) => {
        global.clearTimeout(timeout);
        link.onload = link.onerror = null;
        if (loaded) {
          entry.ready = true;
          doc.dispatchEvent(new CustomEvent("ai-system6-appearancestylesready"));
          resolve();
        } else {
          appearanceStyles.delete(theme.id);
          link.remove();
          reject(new Error(`Appearance stylesheet unavailable: ${theme.id}`));
        }
      };
      link.onload = () => finish(true);
      link.onerror = () => finish(false);
    });
    appearanceStyles.set(theme.id, entry);
    doc.head.appendChild(link);
    return entry.promise;
  }

  function syncBody() {
    const theme = byId.get(currentThemeId) || byId.get(DEFAULT_THEME_ID);
    ensureAppearanceStyles(theme)?.catch(() => {});
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
    const generation = ++appearanceGeneration;
    const id = options.experimental === true ? normalizeThemeId(value) : normalizeReleaseThemeId(value);
    const theme = byId.get(id);
    const resources = [waitForInteraction(theme), ensureAppearanceStyles(theme), ...Array.from(preparations, (prepare) => prepare(theme))].filter(Boolean);
    const preparation = resources.length ? Promise.all(resources) : null;
    if (!preparation) {
      pendingAppearance = null;
      return commitTheme(id, options);
    }
    const transaction = preparation.then(() => {
      if (generation !== appearanceGeneration) return getTheme();
      return commitTheme(id, options);
    }).catch((error) => {
      if (generation === appearanceGeneration) {
        global.document?.dispatchEvent?.(new CustomEvent("ai-system6-appearanceerror", {
          detail: Object.freeze({ themeId: id, error }),
        }));
      }
      return getTheme();
    }).finally(() => {
      if (pendingAppearance === transaction) pendingAppearance = null;
    });
    pendingAppearance = transaction;
    return transaction;
  }

  // Called only after preparation and generation validation. This is the sole
  // writer of active/committed appearance and its stored preference.
  function commitTheme(value, options = {}) {
    const previousId = currentThemeId;
    const previousCommittedId = committedThemeId;
    const experimental = options.experimental === true;
    const committed = !experimental
      && (options.commit === true || (options.commit !== false && options.persist !== false));
    // Experimental previews (Theme Lab / development tooling) switch for this
    // session only and never persist. The normal API accepts every release
    // theme in the registry.
    currentThemeId = experimental ? normalizeThemeId(value) : normalizeReleaseThemeId(value);
    if (committed) committedThemeId = currentThemeId;
    const theme = syncBody();
    if (previousId !== theme.id) global.AISystem6SystemIcons?.refresh?.();
    syncFontStrategy(options.modernFontPreference === true);
    const persisted = committed && options.persist !== false;
    if (persisted) {
      try {
        global.localStorage?.setItem(STORAGE_KEY, theme.id);
        global.localStorage?.removeItem(LEGACY_LIQUID_KEY);
      } catch (error) {
        // Appearance remains applied for this session when storage is blocked.
      }
    }
    if ((previousId !== theme.id || previousCommittedId !== committedThemeId) && options.announce !== false) {
      global.document?.dispatchEvent?.(new CustomEvent("ai-system6-themechange", {
        detail: Object.freeze({
          previousId,
          previousCommittedId,
          themeId: theme.id,
          committedThemeId,
          theme,
          committed,
          persisted,
          saveDesk: options.saveDesk !== false,
          source: String(options.source || "appearance"),
        }),
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

  function getCommittedTheme() {
    return committedThemeId;
  }

  function getTheme(value = currentThemeId) {
    return byId.get(normalizeThemeId(value));
  }

  function getReleaseReadyThemes() {
    return registry.filter((theme) => theme.releaseReady !== false);
  }

  function getAuthoringMetadata(value = currentThemeId) {
    return getTheme(value).authoring;
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
    COLOR_MODE_STORAGE_KEY,
    normalizeColorMode,
    applyColorMode,
    getColorMode,
    getCommittedColorMode,
    getResolvedColorMode,
    restoreColorMode,
    DEFAULT_THEME_ID,
    themes: registry,
    normalizeThemeId,
    normalizeReleaseThemeId,
    readInitialTheme,
    applyTheme,
    previewExperimentalTheme,
    whenReady: () => pendingAppearance || Promise.resolve(getTheme()),
    registerPreparation: (prepare) => { preparations.add(prepare); return () => preparations.delete(prepare); },
    getCurrentTheme,
    getCommittedTheme,
    getTheme,
    getReleaseReadyThemes,
    getAuthoringMetadata,
    getRecipeChain,
    hasCapability,
    getMenuBarModel,
    isApplicationOwnedMenuBar,
    syncBody,
    syncFontStrategy,
  });

  const onSystemColorModeChange = () => {
    if (currentColorMode !== "system") return;
    syncBody();
    announceColorMode("system", false, false);
  };
  if (colorSchemeQuery?.addEventListener) colorSchemeQuery.addEventListener("change", onSystemColorModeChange);
  else colorSchemeQuery?.addListener?.(onSystemColorModeChange);

  global.AISystem6Theme = api;
  syncBody();
})(window);
