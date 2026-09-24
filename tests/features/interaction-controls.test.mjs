// Interaction controls must keep active/selected/disabled states stronger than
// hover and focus states, across the classic and liquid-glass themes.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("interaction-controls");
const foundation = read("styles/00-foundation.css");
const icons = read("styles/40-icons.css");
const windows = read("styles/10-windows.css");
const docmap = read("styles/20-reader-docmap.css");
const surfaces = read("styles/30-surfaces.css");
const apps = read("styles/50-apps.css");
const responsive = read("styles/60-responsive.css");
const family = read("styles/65-appearance-themes.css");
const liquid = read("styles/70-liquid-glass.css");
const html = read("index.html");
const desktopRuntime = read("app/core/desktop-runtime.js");
const modal = read("app/core/modal.js");
const windowManager = read("app/core/window-manager.js");
const wireup = read("app/core/wireup.js");
const app = read("app.js");
const boot = read("app/core/boot.js");
const persistenceStatus = read("app/core/persistence-status.js");
const cloudModel = read("app/features/cloud-model.js");

test.assertIncludes(foundation, "--btn-active-bg:", "Buttons expose a shared active-state token");
test.assertIncludes(foundation, "--btn-hover-bg:", "Buttons expose a shared hover-state token");
test.assertIncludes(foundation, "--control-motion-fast-in: 80ms", "Controls share named fast feedback motion");
test.assertIncludes(foundation, "--control-motion-medium-out: 120ms", "Control exits are shorter than entrances");
test.assertIncludes(foundation, "@media (prefers-reduced-motion: reduce)", "Shared controls remove spatial motion when reduced motion is requested");
// Increase Contrast was the one system setting this interface did not answer:
// measured in Chromium with `Emulation.setEmulatedMedia({ features: [{ name:
// "prefers-contrast", value: "more" }] })`, every shared role below read
// exactly what it reads with the setting off. These three assertions are what
// keeps the answer from being quietly deleted.
test.assertIncludes(
  liquid,
  "@media (prefers-contrast: more)",
  "Increase Contrast gets a scheme of its own instead of the default bytes",
);
test.assertIncludes(
  liquid,
  "--system-secondary-divider: 1px solid var(--ink)",
  "the shared secondary divider becomes a solid ink rule under Increase Contrast",
);
test.assertIncludes(
  liquid,
  "--system-disabled-fg: #3f3f3f",
  "disabled ink rises to 7.4:1 on the era's paper under Increase Contrast",
);
test.assertIncludes(
  family,
  "(prefers-reduced-transparency: reduce), (prefers-contrast: more)",
  "the family no-transparency answer is shared with Increase Contrast, so the two cannot drift apart",
);
test.assertIncludes(
  liquid,
  "(prefers-reduced-transparency: reduce), (prefers-contrast: more)",
  "and the glass era answers both settings from one recipe rather than two",
);
test.assertIncludes(foundation, "--control-focus-outline:", "Keyboard focus has an independent shared token");
test.assertIncludes(foundation, "--details-bar-optical-rise: 1px", "Status bars expose one shared optical-centering correction");
test.assertIncludes(foundation, "--teachtext-preview-title-divider:", "rendered Markdown title dividers are theme-owned");
test.assertIncludes(foundation, "--teachtext-preview-section-marker:", "rendered Markdown section markers are theme-owned");
test.assertIncludes(apps, "border-bottom: var(--teachtext-preview-title-divider)", "all TeachText-style previews consume the shared title divider");
test.assertIncludes(liquid, "--teachtext-preview-blockquote-bg: rgba(255, 255, 255, 0.22)", "Liquid Glass replaces Classic preview hatching with a quiet reading fill");
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
test.assertIncludes(windowManager, "function resetDesktopScrollOffset()", "desktop window focus restores the fixed work area scroll origin");
test.assertIncludes(windowManager, "function installDesktopScrollLock()", "desktop installs one shared scroll lock instead of relying on individual windows");
test.assertIncludes(windowManager, 'desktop.addEventListener("scroll", resetDesktopScrollOffset, { passive: true })', "all desktop scroll drift is corrected at the container boundary");
test.assertIncludes(wireup, "installDesktopScrollLock()", "desktop scroll locking starts before session restore and startup windows open");
test.assertMatches(windowManager, /function focusWindow[\s\S]*reveal && isPortraitDocumentFlow\(\)[\s\S]*revealWindowTitleInPortraitFlow\(win\)[\s\S]*resetDesktopScrollOffset\(\)/, "window reveal scrolls only the portrait document flow and keeps desktop gaps fixed");
test.assertNotIncludes(windowManager, "win.scrollIntoView();scrollBy(0,-36)", "desktop window focus no longer scrolls the hidden desktop container");
test.assertIncludes(foundation, "body.has-system-modal .menu-bar", "system modal state disables menu interactions without redefining window z-index");
test.assertIncludes(modal, 'if (typeof closeMenus === "function") closeMenus()', "system modals close any open menu popovers before appearing");
test.assertIncludes(modal, 'document.body.classList.add("has-system-modal")', "system modals mark the menu as inactive while open");
test.assertIncludes(modal, 'document.body.classList.remove("has-system-modal")', "system modals restore menu interaction on close");
test.assertIncludes(desktopRuntime, 'document.body.classList.add("has-system-modal")', "startup settings dialog shares the system modal menu contract");
// Opening is the second act. A gesture that wandered between the two clicks —
// a drag ending near an icon, a trackpad sliding under a pressing finger — is
// not a double click, and the desk must not open whatever it stopped on.
test.assertIncludes(
  read("app/core/wireup.js"),
  "const DOUBLE_CLICK_SLOP_PX = 8;",
  "the two clicks of an opening gesture have to land in the same place",
);
test.assertIncludes(
  read("app/core/wireup.js"),
  "if (!steadyDoubleClick(event)) return;",
  "and a wandered gesture opens nothing",
);

test.assertIncludes(foundation, ".menu-popover button:hover:not(:disabled):not(.is-disabled)", "Menu hover excludes disabled items");
test.assertIncludes(foundation, ".menu-sub-popover button:hover:not(:disabled):not(.is-disabled)", "Submenu hover excludes disabled items");
// A submenu row reverses through the menu tokens, exactly as a menu's own rows
// do. Painting the rule with raw --ink/--paper made the plate and the text
// disagree the moment an era's paper was translucent: Liquid Glass put grey
// text on a black plate, one row below a title that stayed white.
test.assertMatches(
  foundation,
  /\.menu-sub-popover button \{[\s\S]*?background: var\(--menu-item-bg, transparent\);[\s\S]*?color: var\(--menu-item-fg\);/,
  "Submenu rows paint from the menu item tokens, like a menu's own rows"
);
test.assertMatches(
  foundation,
  /\.menu-sub-popover button:hover:not\(:disabled\):not\(\.is-disabled\) \{\s*--menu-item-bg: var\(--menu-item-active-bg\);/,
  "and their hover swaps those tokens instead of naming ink and paper"
);

test.assertIncludes(
  windows,
  ".btn:hover:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)",
  "Classic button hover excludes disabled, active, selected, and multi-selected controls"
);
test.assertIncludes(windows, ".btn.is-active:hover", "Classic active buttons keep their active state on hover");
test.assertIncludes(windows, ".btn.is-selected:hover", "Classic selected buttons keep their selected state on hover");
test.assertIncludes(windows, "--btn-bg: var(--btn-active-bg)", "Classic active buttons preserve active background through tokens");
test.assertIncludes(windows, '.btn[data-loading="true"]::after', "Busy buttons preserve their original label box and paint status in a separate layer");
test.assertIncludes(windows, '.btn[data-loading="true"] > * {\n  visibility: hidden;\n}', "The idle label of a busy button is hidden by visibility, which the disabled and theme rules cannot re-ink");
test.assertNotMatches(windows, /\.btn\[data-loading="true"\] \{[^}]*color: transparent/, "Busy buttons never hide their idle label with transparent ink, which later disabled rules overrode into a double label");
test.assertIncludes(app, "function wrapControlIdleLabel(control)", "Busy controls wrap bare label text so the busy rule has an element to hide");
test.assertIncludes(app, "unwrapControlIdleLabel(control)", "Controls give their plain label text back when the run ends");
test.assertIncludes(windows, ".btn:focus-visible", "Button focus remains visible independently of hover and selection");
test.assertIncludes(windows, ".system-select-option:not(.is-selected):hover", "System Select hover cannot erase its committed selection");
test.assertIncludes(windows, ".system-select-option:focus-visible", "System Select option focus is an independent layer");
test.assertIncludes(windows, ".view-btn:hover:not(.is-active)", "Classic view button hover does not override the active view");
test.assertIncludes(windows, ".view-btn.is-active:hover", "Classic active view button keeps active styling on hover");
test.assertMatches(windows, /\.details-bar \{[\s\S]*calc\(4px - var\(--details-bar-optical-rise\)\)[\s\S]*calc\(4px \+ var\(--details-bar-optical-rise\)\)/, "Status-bar content is optically centered without changing the row height");
test.assertIncludes(windows, ".view-controls {\n  display: flex;\n  align-items: center;\n  position: static;", "The centered Finder view switch shares the status-bar grid and its optical padding");
test.assertNotIncludes(windows, "top: calc(50% - var(--details-bar-optical-rise))", "Finder view controls no longer overlap status labels from an absolute center");
test.assertMatches(responsive, /\.details-bar \{[^}]*calc\(4px - var\(--details-bar-optical-rise\)\)[^}]*calc\(4px \+ var\(--details-bar-optical-rise\)\)/, "Responsive styles preserve status-bar optical centering");

test.assertIncludes(surfaces, ".writing-bell-mode button:hover:not(.is-active)", "Segmented controls keep hover off active choices");
test.assertIncludes(surfaces, ".writing-bell-mode button.is-active:hover", "Active segmented controls keep active styling on hover");
test.assertIncludes(surfaces, ".writing-bell-presets .mini-btn.is-active:hover", "Active mini buttons keep active styling on hover");

// One birthplace per state. The responsive sheet used to carry a byte-identical
// copy of the base hover rule; because a later rule of equal specificity wins,
// that copy outranked .btn:active and a plainly pressed button looked hovered
// (measured 2026-09-23: rgb(250,250,250) held through a real mouse-down
// instead of --btn-active-bg). The state priority rule is asserted where the
// rule now lives, and the pressed rule has to carry the same chain so it can
// win while the pointer is down.
test.assertIncludes(
  windows,
  ".btn:hover:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)",
  "Button hover keeps the state priority contract"
);
test.assertNotIncludes(
  responsive,
  ".btn:hover:not(",
  "and the responsive sheet does not restate it, so the pressed state is not outranked"
);
test.assertIncludes(
  windows,
  ".btn:active:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)",
  "the pressed rule carries the same chain and comes later, which is what makes a press look pressed"
);

// ---- The Return mark (NeXTSTEP 3.3, NS04) ----------------------------------
//
// 3.3 prints the Return glyph on the button Return will press, and only while
// that window holds the keyboard. This desk routes Return to a dialog's default
// button (modal.js), so the mark is drawn only inside a dialog that says its
// Return is wired — a mark on an ordinary window's default button would promise
// a key that does nothing there.
test.assertIncludes(windows, 'dialog[data-enter-default-wired="true"] .btn.default:not([data-loading="true"])::after',
  "the Return mark hangs on the dialog that really wires Return");
test.assertIncludes(windows, "content: var(--btn-default-return-mark, \"\")",
  "and takes its glyph from a token, so an era without the idiom draws an empty box");
test.assertIncludes(read("app/core/modal.js"), 'systemModal.dataset.enterDefaultWired = "true"',
  "the shared confirm dialog states that Return presses its default");
test.assertIncludes(read("app/core/modal.js"), "dialog.dataset.enterDefaultWired = \"true\"",
  "and so does the wiring helper every other dialog uses");
const returnMarkThemes = ["65-appearance-themes.css", "67-aqua-appearance.css", "68-big-sur-appearance.css", "69-nextstep-appearance.css", "70-liquid-glass.css"]
  .filter((file) => read(`styles/${file}`).includes("--btn-default-return-mark"));
test.assert(JSON.stringify(returnMarkThemes) === JSON.stringify(["69-nextstep-appearance.css"]),
  `only the era that had the idiom marks its buttons (found ${returnMarkThemes.join(", ") || "none"})`);
test.assertNotIncludes(
  responsive,
  ".btn:hover:not(:disabled):not(.is-disabled) {",
  "Responsive styles do not keep the old broad button hover selector"
);

test.assertIncludes(windows, ".btn[hidden] {\n  display: none;\n}", "a button hidden through the attribute is actually hidden");
test.assertIncludes(surfaces, '.view-switch-option:not([aria-pressed="true"]):not([aria-selected="true"]):hover', "view-switch hover only affects the unselected option, in either the toggle-group (aria-pressed) or tab-strip (aria-selected) pattern");
test.assertIncludes(surfaces, '.view-switch-option[aria-pressed="true"]:hover', "the selected view-switch option stays readable on hover");
test.assertIncludes(surfaces, '.view-switch-option[aria-selected="true"]:hover', "the selected view-switch tab stays readable on hover");

test.assertIncludes(
  liquid,
  ".btn:hover:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)",
  "Liquid Glass button hover excludes active and selected states"
);
test.assertIncludes(liquid, "--btn-active-bg:", "Liquid Glass overrides the shared active-state token");
test.assertIncludes(liquid, "--btn-radius: var(--r-md)", "Liquid Glass keeps role-specific button geometry instead of universal pills");
test.assertNotIncludes(liquid, "body.use-liquid-glass .btn {\n  border: 1px solid var(--btn-border-color);\n  border-radius: 999px", "Liquid Glass shared buttons are not generic pills");
test.assertIncludes(liquid, "background: var(--btn-bg)", "Liquid Glass buttons consume shared state tokens");
test.assertIncludes(liquid, "body.use-liquid-glass .btn:active:not(:disabled):not(.is-disabled):not(.is-active):not(.is-selected):not(.is-multi-selected)", "Liquid Glass pressed state does not override selected controls");
test.assertIncludes(liquid, "button:hover:not(.menu-bar button)", "Liquid Glass generic button hover does not override menu bar open/hover states");
test.assertIncludes(liquid, "--menu-item-active-bg: var(--liquid-menu-active)", "Liquid Glass menu hover uses the shared guarded menu-item active token");
test.assertIncludes(liquid, "background: var(--menu-item-bg)", "Liquid Glass menu items consume the guarded base hover token instead of duplicating the selector");
test.assertIncludes(foundation, "color: var(--menu-shortcut-color)", "Menu shortcuts consume the shared shortcut color token instead of hard-coding opacity only");
test.assertIncludes(foundation, "--menu-chip-bg: transparent", "Menu bar status controls stay unframed until interaction");
test.assertIncludes(liquid, "--liquid-menu-alpha: calc(0.76 + 0.24 * var(--liquid-tint-level, 0.5));", "the default tint still resolves the menu opacity to the shipped 0.88 floor");
test.assertIncludes(liquid, "rgba(248, 251, 252, var(--liquid-menu-alpha))", "Liquid Glass menu panels consume the shared opacity parameter instead of a dead literal");
test.assert(!liquid.includes("body.use-liquid-glass .menu-bar > :is(.cloud-switcher-menu, .project-switcher-menu, .multifinder-menu) > button"), "Liquid Glass does not add an idle capsule around right-side menu controls");
test.assertIncludes(responsive, "body.use-liquid-glass .menu-bar", "the frosted menu bar rule is collocated with its base rule in the responsive layer");
// The bar keeps the era's translucent tint and gives up the frost: a
// backdrop-filter makes WebKit rasterise the strip together with its 13px
// labels, and on a phone — worst once the desk is added to the Home Screen and
// the bar runs under the status area — the menu read as a blurred smear. The
// material's own tint is what keeps it from being a flat white slab.
test.assertIncludes(responsive, "body.use-liquid-glass .menu-bar {", "the Liquid Glass menu bar is styled where its base rule lives");
test.assertIncludes(responsive, "backdrop-filter: none;", "the phone's menu bar keeps its tint without the frost");
test.assertIncludes(liquid, "--menu-bar-bg:", "and the era still supplies that tint");
test.assertIncludes(liquid, "backdrop-filter: blur(34px) saturate(160%) brightness(1.04)", "Liquid Glass menu popovers blur the desktop strongly enough to protect menu readability");
test.assertIncludes(liquid, "inset 0 2px 5px rgba(0, 0, 0, 0.22)", "Liquid Glass top-level menu buttons keep a visible pressed state without changing their hit model");
test.assertIncludes(liquid, "body.use-liquid-glass .view-btn:hover:not(.is-active)", "Liquid Glass view button hover does not override active view");
test.assertIncludes(
  liquid,
  "button:hover:not(.menu-bar button):not(:disabled):not(.is-disabled):not(.is-active)",
  "Liquid Glass generic button hover excludes active mini presets"
);
test.assertIncludes(surfaces, ".drop-target.is-dragging::after", "one drop-target overlay serves every drop surface");
test.assertNotIncludes(liquid, "body.use-liquid-glass .docmap-drop-zone.is-dragging::after", "the DocMap drop overlay is themed by token, not by a second glass rule");
test.assertIncludes(liquid, "-webkit-backdrop-filter: blur(8px) saturate(140%)", "Liquid Glass DocMap import overlay blurs the empty state behind it so old paper text does not ghost through");

test.assertIncludes(app, 'button.setAttribute("aria-expanded", "false")', "System Select exposes reliable open state");
test.assertIncludes(app, 'item.setAttribute("role", "option")', "System Select options use the listbox option contract");
test.assertIncludes(app, 'item.setAttribute("aria-label", option.textContent.trim())', "The visual check slot does not pollute the announced option name");
test.assertIncludes(app, 'item.setAttribute("aria-selected", String(selected))', "System Select announces committed selection");
test.assertIncludes(app, "systemSelectAccessibleName", "System Select names its trigger and listbox from the owning field instead of the current value");
test.assertIncludes(app, 'event.key === "ArrowDown"', "System Select and tab controls support directional keyboard navigation");
test.assertIncludes(app, 'event.key === "Escape"', "System Select returns from an open listbox with Escape");
test.assertIncludes(app, "handleSystemSelectTypeahead", "System Select supports typeahead");
test.assertIncludes(app, "syncRovingTabStops", "Related tabs share roving focus");
test.assertIncludes(app, 'control.setAttribute("aria-busy", "true")', "Busy controls expose their live state");
test.assertIncludes(boot, "initSharedControlBehaviors()", "Shared keyboard behavior is installed during boot");
test.assertIncludes(persistenceStatus, "setControlLoading(loadModelButton, true", "Control Panel model loading uses the shared stable-width busy state");
test.assertIncludes(cloudModel, "setControlLoading(cloudCheckBtn, true", "Cloud connection uses the shared busy state");
test.assertIncludes(html, 'id="search-provider" aria-labelledby="chooser-search-title"', "Chooser System Select is labelled by its field heading");

// Desk furniture is not text: a drag or a touch long-press must not paint a
// selection across controls, item names, labels or status strips, and that text
// must never reach the clipboard. Documents and fields stay selectable.
test.assertMatches(
  foundation,
  /button,\s*\[role="button"\],\s*label,\s*\.menu-bar,\s*\.writing-spine-panel,\s*\.desktop-icon,\s*\.details-bar,\s*\.finder-list-header\s*\{\s*user-select: none;/,
  "Controls, labels, desk icons, the Writing Flow strip and status strips are not selectable text"
);
test.assertMatches(
  foundation,
  /input,\s*textarea,\s*\[contenteditable="true"\]\s*\{\s*user-select: text;/,
  "Fields stay selectable even inside a non-selectable label"
);
test.assertNotIncludes(foundation, ".window-pane {\n  user-select: none", "Document and reading surfaces keep normal text selection");

// The System 6 select harness hides the native control, so its button carries
// the only label a user can read. A programmatic value write fires no "change"
// event, and the harness used to keep printing the previous option while the
// control already held the new one. The label follows the value itself now, so
// no caller has to remember a refresh.
test.assertIncludes(app, 'watchControlWrites(select, HTMLSelectElement.prototype, "value", refreshSystemSelectControl)', "System Select repaints its label when code writes the value");

// Type floor: macOS asks for a 10pt minimum, and a size below it is only
// allowed where the number is drawing a glyph rather than setting type — the
// Classic disks' P/T badge letters, the menu and outline disclosure arrows.
// Measured before this rule: seven real text styles sat at 8–9px (chat file
// metadata, a SideAsk source line, three doc-map stack labels, an inline
// citation chip and the Quick Draft histogram axis).
for (const [sheetName, sheet] of Object.entries({
  "00-foundation.css": foundation,
  "10-windows.css": windows,
  "20-reader-docmap.css": docmap,
  "30-surfaces.css": surfaces,
  "40-icons.css": icons,
  "50-apps.css": apps,
  "60-responsive.css": responsive,
  "65-appearance-themes.css": family,
  "70-liquid-glass.css": liquid,
})) {
  const blocks = sheet.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const block of blocks) {
    const size = /(?:^|[;{\s])font-size\s*:\s*([0-9.]+)px/.exec(block);
    if (!size || Number(size[1]) >= 10) continue;
    const selector = block.slice(0, block.indexOf("{")).trim().split("\n").pop().trim();
    // A drawn glyph may be a CSS `content` pseudo-element, or a text node the
    // module writes into an aria-hidden span. The second kind is named here so
    // a new sub-10px size has to argue its case in this list instead of
    // slipping in behind a rule that happens to mention content.
    const DRAWN_AS_TEXT_NODE = [".outline-tree-twisty"];
    const drawnAsGlyph = block.includes("content:")
      || DRAWN_AS_TEXT_NODE.some((name) => selector.includes(name));
    test.assert(
      drawnAsGlyph,
      `${sheetName} — ${selector}: a size below the 10px floor is only for a drawn glyph, not for type`,
    );
  }
}

test.finish();
