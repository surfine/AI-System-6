// Interaction controls must keep active/selected/disabled states stronger than
// hover and focus states, across the classic and liquid-glass themes.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("interaction-controls");
const foundation = read("styles/00-foundation.css");
const windows = read("styles/10-windows.css");
const docmap = read("styles/20-reader-docmap.css");
const surfaces = read("styles/30-surfaces.css");
const responsive = read("styles/60-responsive.css");
const liquid = read("styles/70-liquid-glass.css");
const html = read("index.html");
const desktopRuntime = read("app/core/desktop-runtime.js");
const modal = read("app/core/modal.js");
const windowManager = read("app/core/window-manager.js");

test.assertIncludes(foundation, "--btn-active-bg:", "Buttons expose a shared active-state token");
test.assertIncludes(foundation, "--btn-hover-bg:", "Buttons expose a shared hover-state token");
test.assertIncludes(foundation, "--z-system-menu: 40000", "System menu is the highest named desktop layer");
test.assertIncludes(foundation, "--z-demo-overlay: 39900", "Demo overlays stay below the system menu layer");
test.assertIncludes(foundation, "--z-demo-highlight: 39910", "Demo highlights stay below the system menu layer");
test.assertNotIncludes(foundation, "*::-webkit-scrollbar", "Classic scrollbar styling is scoped, not applied to every nested scroll pane");
test.assertIncludes(foundation, ".menu-popover::-webkit-scrollbar", "Classic menu popovers keep a scoped System 6-style scrollbar");
test.assertIncludes(foundation, ".menu-sub-popover::-webkit-scrollbar", "Classic submenu popovers keep a scoped System 6-style scrollbar");
test.assertIncludes(foundation, "z-index: var(--z-system-menu)", "Menu bar consumes the system menu layer token");
test.assertIncludes(foundation, "z-index: var(--z-system-menu-popover)", "Menu popovers sit above the menu bar and windows");
test.assertIncludes(html, '<body class="is-booting">', "startup begins in a menu-less boot lifecycle state");
test.assertIncludes(foundation, "body.is-booting .menu-bar", "boot lifecycle hides the menu bar instead of layering over it");
test.assertIncludes(foundation, "body.is-shutting-down .menu-bar", "shutdown lifecycle hides the menu bar instead of layering over it");
test.assertIncludes(desktopRuntime, 'document.body.classList.remove("is-booting")', "boot completion restores the normal menu-bearing desktop");
test.assertIncludes(windowManager, 'document.body.classList.add("is-shutting-down")', "shutdown/restart enter a menu-less lifecycle state");
test.assertIncludes(foundation, "body.has-system-modal .menu-bar", "system modal state disables menu interactions without redefining window z-index");
test.assertIncludes(modal, 'if (typeof closeMenus === "function") closeMenus()', "system modals close any open menu popovers before appearing");
test.assertIncludes(modal, 'document.body.classList.add("has-system-modal")', "system modals mark the menu as inactive while open");
test.assertIncludes(modal, 'document.body.classList.remove("has-system-modal")', "system modals restore menu interaction on close");
test.assertIncludes(desktopRuntime, 'document.body.classList.add("has-system-modal")', "startup settings dialog shares the system modal menu contract");
test.assertIncludes(foundation, ".menu-popover button:hover:not(:disabled):not(.is-disabled)", "Menu hover excludes disabled items");
test.assertIncludes(foundation, ".menu-sub-popover button:hover:not(:disabled):not(.is-disabled)", "Submenu hover excludes disabled items");

test.assertIncludes(
  windows,
  ".btn:hover:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)",
  "Classic button hover excludes disabled, active, selected, and multi-selected controls"
);
test.assertIncludes(windows, ".btn.is-active:hover", "Classic active buttons keep their active state on hover");
test.assertIncludes(windows, ".btn.is-selected:hover", "Classic selected buttons keep their selected state on hover");
test.assertIncludes(windows, "--btn-bg: var(--btn-active-bg)", "Classic active buttons preserve active background through tokens");
test.assertIncludes(windows, ".view-btn:hover:not(.is-active)", "Classic view button hover does not override the active view");
test.assertIncludes(windows, ".view-btn.is-active:hover", "Classic active view button keeps active styling on hover");

test.assertIncludes(surfaces, ".writing-bell-mode button:hover:not(.is-active)", "Segmented controls keep hover off active choices");
test.assertIncludes(surfaces, ".writing-bell-mode button.is-active:hover", "Active segmented controls keep active styling on hover");
test.assertIncludes(surfaces, ".writing-bell-presets .mini-btn.is-active:hover", "Active mini buttons keep active styling on hover");

test.assertIncludes(
  responsive,
  ".btn:hover:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)",
  "Responsive button hover keeps the same state priority contract"
);
test.assertNotIncludes(
  responsive,
  ".btn:hover:not(:disabled):not(.is-disabled) {",
  "Responsive styles do not keep the old broad button hover selector"
);

test.assertIncludes(docmap, ".docmap-layout-option:not(.is-active):hover", "DocMap layout choices hover only affects the inactive state");
test.assertIncludes(docmap, ".docmap-layout-option.is-active:hover", "DocMap layout choice active hover stays readable");

test.assertIncludes(
  liquid,
  ".btn:hover:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)",
  "Liquid Glass button hover excludes active and selected states"
);
test.assertIncludes(liquid, "--btn-active-bg:", "Liquid Glass overrides the shared active-state token");
test.assertIncludes(liquid, "background: var(--btn-bg)", "Liquid Glass buttons consume shared state tokens");
test.assertIncludes(liquid, "body.use-liquid-glass .btn:active:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)", "Liquid Glass pressed state does not override selected controls");
test.assertIncludes(liquid, "button:hover:not(.menu-bar button)", "Liquid Glass generic button hover does not override menu bar open/hover states");
test.assertIncludes(liquid, "--menu-item-active-bg: var(--liquid-menu-active)", "Liquid Glass menu hover uses the shared guarded menu-item active token");
test.assertIncludes(liquid, "background: var(--menu-item-bg)", "Liquid Glass menu items consume the guarded base hover token instead of duplicating the selector");
test.assertIncludes(foundation, "color: var(--menu-shortcut-color)", "Menu shortcuts consume the shared shortcut color token instead of hard-coding opacity only");
test.assertIncludes(liquid, "--liquid-menu-chip:", "Liquid Glass exposes a shared menu-chip material for the system status controls");
test.assertIncludes(liquid, "rgba(248, 251, 252, 0.88)", "Liquid Glass menu panels use an opaque-enough frosted fill so background text cannot read through");
test.assertIncludes(liquid, "body.use-liquid-glass .menu-bar > :is(.cloud-switcher-menu, .project-switcher-menu, .multifinder-menu) > button", "Liquid Glass right-side menu controls share the same glass-chip material");
test.assertIncludes(liquid, "backdrop-filter: blur(18px) saturate(155%) brightness(1.02)", "Liquid Glass menu bar is a real frosted system strip, not an opaque classic white slab");
test.assertIncludes(liquid, "backdrop-filter: blur(34px) saturate(160%) brightness(1.04)", "Liquid Glass menu popovers blur the desktop strongly enough to protect menu readability");
test.assertIncludes(liquid, "inset 0 2px 5px rgba(0, 0, 0, 0.22)", "Liquid Glass top-level menu buttons keep a visible pressed state without changing their hit model");
test.assertIncludes(liquid, "body.use-liquid-glass .view-btn:hover:not(.is-active)", "Liquid Glass view button hover does not override active view");
test.assertIncludes(liquid, "--writing-bell-preset-hover-bg:", "Liquid Glass mini button hover has an inactive preset token");
test.assertIncludes(liquid, "--writing-bell-preset-active-bg:", "Liquid Glass mini button active presets keep a separate token");
test.assertIncludes(liquid, "--writing-bell-preset-active-pressed-bg:", "Liquid Glass mini button pressed active presets do not fall back to hover");
test.assertIncludes(liquid, "body.use-liquid-glass .docmap-drop-zone.is-dragging::after", "Liquid Glass DocMap import overlay has its own glass treatment instead of inheriting the classic striped paper layer");
test.assertIncludes(liquid, "-webkit-backdrop-filter: blur(8px) saturate(140%)", "Liquid Glass DocMap import overlay blurs the empty state behind it so old paper text does not ghost through");

test.finish();
