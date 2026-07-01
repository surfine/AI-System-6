// Visual snapshot targets — the "skeleton" selectors that must not drift
// silently in either theme. Captured per theme (default + liquid-glass);
// drift = any diff in any property.
//
// Choice of targets is driven by the git-history hot zones (see CLAUDE.md
// → CSS Stability) plus a few token-resolution checks. Keep this list short
// (~20 entries). Each new entry costs review noise on every accepted change.
//
// Choice of properties per selector: only the props that matter for that
// element AND that compute deterministically across the dev machine.
// Avoid font-family resolution (varies by installed fonts) and animated/
// transitionable properties (timing-dependent reads).

export const SNAPSHOT_VIEWPORT = { width: 1440, height: 900 };
export const SNAPSHOT_THEMES = ["default", "liquid-glass"];

export const SNAPSHOT_TARGETS = [
  // --- Token resolution (proxy for any default-theme value drift) ---
  {
    sel: ":root",
    props: [
      "--ink",
      "--paper",
      "--shade",
      "--shade-dark",
      "--desktop",
      "--rule",
      "--control-radius",
      "--system-menu-height",
      "--menu-divider-color",
      "--active-window-shadow",
      "--card-caption-color",
      "--finder-op-caption-color",
      "--select-divider",
    ],
    captureFrom: "documentElement",
  },
  {
    sel: "body",
    props: [
      "--ink",
      "--paper",
      "--shade",
      "--desktop",
      "--menu-divider-color",
      "--active-window-shadow",
      "--glass-accent",
      "--glass-border",
      "--liquid-window-radius",
      "--print-directory-preview-bg",
      "--file-preview-bg",
      "--project-cd-grid-bg",
      "--note-pad-pane-bg",
      "--clipboard-pane-bg",
      "--cmf-panel-bg",
    ],
    captureFrom: "body",
  },

  // --- Chrome (hot zones from git history) ---
  { sel: ".menu-bar", props: ["height", "background-color", "border-bottom-width", "border-bottom-color", "padding-left", "padding-right"] },
  { sel: ".menu-bar > .menu > button", props: ["height", "border-radius", "padding-left", "padding-right", "background-color", "color"] },
  { sel: ".window.is-active", props: ["border-radius", "background-color", "box-shadow", "border-top-width", "border-top-color", "outline-width", "outline-color"] },
  { sel: ".window.is-active > .title-bar", props: ["height", "background-color"] },
  { sel: ".window.is-active > .title-bar :is(h1, h2)", props: ["font-size", "color", "font-weight"] },
  { sel: ".window.is-active > .title-bar .close-box", props: ["width", "height", "border-radius", "background-color"] },
  { sel: ".window .title-bar .resize-box:not(.hidden):not([disabled])", props: ["width", "height", "right", "bottom"] },
  { sel: ".window.is-active > .window-pane", props: ["padding-top", "padding-right", "padding-bottom", "padding-left", "background-color"] },

  // --- Common controls ---
  { sel: ".btn", props: ["border-radius", "padding-top", "padding-right", "padding-bottom", "padding-left", "background-color", "color"] },

  // --- Desktop ---
  { sel: ".desktop-app-icon", props: ["width", "height"] },
  { sel: ".desktop-app-icon span:last-child", props: ["font-size", "color"] },
];

// Build the expression once so both the eval-printer and the diff helper agree
// on the exact capture format.
export const SNAPSHOT_EVAL = `(() => {
  const TARGETS = ${JSON.stringify(SNAPSHOT_TARGETS)};
  const THEMES = ${JSON.stringify(SNAPSHOT_THEMES)};
  const firstVisible = (selector) => {
    const all = Array.from(document.querySelectorAll(selector));
    return all.find((el) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }) || all[0] || null;
  };
  const out = {};
  const originalThemeWasLiquid = document.body.classList.contains("use-liquid-glass");
  for (const theme of THEMES) {
    document.body.classList.toggle("use-liquid-glass", theme === "liquid-glass");
    // Force a reflow so computed styles reflect the new theme synchronously.
    void document.body.offsetHeight;
    out[theme] = {};
    for (const t of TARGETS) {
      const el = t.captureFrom === "documentElement" ? document.documentElement
              : t.captureFrom === "body" ? document.body
              : firstVisible(t.sel);
      if (!el) { out[theme][t.sel] = null; continue; }
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const entry = {};
      for (const p of t.props) entry[p] = cs.getPropertyValue(p).trim();
      entry._w = Math.round(rect.width);
      entry._h = Math.round(rect.height);
      out[theme][t.sel] = entry;
    }
  }
  // Restore the original theme to avoid leaving a side-effect.
  document.body.classList.toggle("use-liquid-glass", originalThemeWasLiquid);
  return out;
})()`;
