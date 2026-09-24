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
      id: "system-7",
      year: 1991,
      label: "System 7",
      labelKey: "theme_system_7",
      // System 7 on a colour screen: System 6's geometry and one-bit object
      // outlines, with the grey-and-lavender window frame and colour icons.
      // A child of Classic; the icon family is its own (derived from the
      // Classic outlines by tooling/build-system-7-icons.mjs).
      family: "classic",
      recipeBase: "classic",
      menuBarModel: "application-owned",
      releaseReady: false,
      systemFont: "Chicago",
      systemFontSize: 12,
      fontStrategy: "preference",
      overlay: "none",
      capabilities: Object.freeze(["native-window-outline", "color-chrome", "independent-icons"]),
      // Its icons exist at 32 and 16 px only, like the Classic family.
      classicIconTiers: true,
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
      id: "drawing-board",
      year: 1998,
      label: "Drawing Board",
      labelKey: "theme_drawing_board",
      // The Appearance Manager theme Mac OS 8.5's betas carried and the
      // release dropped: Platinum's controls, drawn in pencil on drafting
      // paper. A child of Platinum; its icons are Platinum's (8.5 themes did
      // not redraw the Finder's icons).
      family: "classic",
      recipeBase: "platinum",
      menuBarModel: "application-owned",
      releaseReady: false,
      systemFont: "Charcoal",
      systemFontSize: 12,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "pencil-outline", "native-window-outline"]),
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
      finderLayout: "two-row-plain",
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "Lucida Grande",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "pinstripe", "traffic-lights"]),
    }),
    Object.freeze({
      id: "tiger",
      year: 2005,
      label: "Tiger",
      labelKey: "theme_tiger",
      // Mac OS X 10.4's textured ("brushed metal") window. A child of Snow
      // Leopard for maintenance, not history: 10.6 already owns the unified
      // title bar and toolbar geometry, so Tiger's delta is the material, the
      // rounded bottom corners, and the Jaguar-lineage icon family.
      family: "aqua",
      recipeBase: "snow-leopard",
      menuBarModel: "system-owned",
      releaseReady: false,
      systemFont: "Lucida Grande",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["textured-material", "unified-toolbar", "traffic-lights"]),
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
      finderLayout: "two-row-sidebar",
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "Lucida Grande",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "unified-toolbar", "traffic-lights"]),
    }),
    Object.freeze({
      id: "lion",
      year: 2011,
      label: "Lion",
      labelKey: "theme_lion",
      // Mac OS X 10.7: 10.6's window grammar with the scroll bars gone until
      // you scroll, a full-screen button in the title bar and a monochrome
      // source list. A child of Snow Leopard; its icons are 10.6's.
      family: "aqua",
      recipeBase: "snow-leopard",
      menuBarModel: "system-owned",
      releaseReady: false,
      systemFont: "Lucida Grande",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "unified-toolbar", "traffic-lights", "overlay-scrollbars"]),
    }),
    Object.freeze({
      id: "yosemite",
      year: 2014,
      label: "Yosemite",
      labelKey: "theme_yosemite",
      family: "liquid-glass",
      recipeBase: "liquid-glass",
      finderLayout: "two-row-sidebar",
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "Helvetica Neue",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["vibrancy", "translucent-sidebar", "traffic-lights"]),
    }),
    Object.freeze({
      id: "big-sur",
      year: 2020,
      label: "Big Sur",
      labelKey: "theme_big_sur",
      family: "liquid-glass",
      recipeBase: "liquid-glass",
      finderLayout: "one-row",
      menuBarModel: "system-owned",
      // macOS 11 reserves the accent selection for the key window: click away
      // from a Finder window and the highlighted row goes neutral. The fact is
      // projected like the menu-bar model, so the stylesheet reads it rather
      // than the desk hard-coding one appearance's id into a shared rule.
      selectionModel: "key-window",
      releaseReady: true,
      systemFont: "SF Pro",
      systemFontSize: 13,
      fontStrategy: "theme",
      overlay: "none",
      colorModes: true,
      // No `minimize-lamp`. The yellow lamp is granted only to an era whose
      // Dock ships with it (owner decision 2026-09-25): a lamp is real only
      // where the window it puts away has a place to go and a way back. No
      // Mac OS X era has its Dock yet, so none has the capability today, and
      // Big Sur draws the product's close-left / zoom-right pair.
      capabilities: Object.freeze(["vibrancy", "translucent-sidebar", "traffic-lights", "independent-icons"]),
    }),
    Object.freeze({
      id: "liquid-glass",
      year: 2026,
      label: "Liquid Glass",
      labelKey: "theme_liquid_glass",
      family: "liquid-glass",
      recipeBase: null,
      finderLayout: "one-row",
      menuBarModel: "system-owned",
      releaseReady: true,
      systemFont: "SF Pro",
      systemFontSize: 13,
      fontStrategy: "modern",
      overlay: "liquid-glass",
      capabilities: Object.freeze(["vibrancy", "continuous-glass", "liquid-overlay", "traffic-lights"]),
    }),
    Object.freeze({
      id: "nextstep",
      year: 1995,
      label: "NeXTSTEP",
      labelKey: "theme_nextstep",
      family: "nextstep",
      recipeBase: null,
      // Released 2026-09-23 on the owner's decision: its workflow and edge-case
      // gates, 59/59 icons and touch targets were recorded in the Big Sur /
      // NeXTSTEP / One More Tune review (internal/plans/BIGSUR-NEXTSTEP-OMT-
      // HANDOFF.zh-CN.md §2.8). Narrow screens keep the merged switcher.
      menuBarModel: "application-owned",
      releaseReady: true,
      systemFont: "Helvetica",
      systemFontSize: 12,
      fontStrategy: "theme",
      overlay: "none",
      capabilities: Object.freeze(["solid-material", "grayscale-depth"]),
    }),
  ]);

  const byId = new Map(registry.map((theme) => [theme.id, theme]));

  function normalizeThemeId(value) {
    const id = String(value || "").trim().toLowerCase();
    return byId.has(id) ? id : DEFAULT_THEME_ID;
  }

  // Release path: a registered era becomes the stored appearance only when it
  // is release-ready. An era still being verified stays in the registry for
  // the explicit experimental preview; it is not reachable through storage,
  // so a saved preference can never restore a shell that is not finished.
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
  // NeXTSTEP used to boot as Classic while it was experimental; since its
  // release a saved NeXTSTEP boots as itself, through the same lazy-style
  // path Big Sur uses.
  let currentThemeId = committedThemeId;
  let appearanceGeneration = 0;
  let pendingAppearance = null;
  const appearanceStyles = new Map();
  const appearanceStylePaths = { "big-sur": "styles.big-sur.css", nextstep: "styles.nextstep.css", tiger: "styles.tiger.css", "system-7": "styles.system-7.css", "drawing-board": "styles.drawing-board.css", lion: "styles.lion.css" };
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
    // Finder pages' toolbar-window layout (styles/10-windows.css recipes).
    if (theme.finderLayout) element.dataset.finderLayout = theme.finderLayout;
    else delete element.dataset.finderLayout;
    // Whose accent a selection belongs to. "key-window" is macOS 11 and later:
    // the highlight is the accent only while that window is the front one, and
    // goes neutral behind another window. An appearance that draws no accent
    // selection leaves this unset and keeps the base behaviour.
    if (theme.selectionModel) element.dataset.selectionModel = theme.selectionModel;
    else delete element.dataset.selectionModel;
    if (theme.recipeBase) element.dataset.themeBase = theme.recipeBase;
    else delete element.dataset.themeBase;
    // The whole recipe chain, root first ("aqua snow-leopard tiger"). A parent
    // writes its own rules as [data-lineage~="snow-leopard"], so a child
    // appearance inherits them without being named; rules shared by a whole
    // family use [data-theme-family]. data-theme stays the one exact id.
    element.dataset.lineage = getRecipeChain(theme.id).map(({ id }) => id).join(" ");
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
