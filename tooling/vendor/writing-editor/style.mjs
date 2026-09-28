// The writing editor's stylesheet. It ships inside the lazy vendor bundle and
// is injected on first mount, so the boot stylesheet (and the floppy budget)
// carry none of it. Everything era-specific comes from the tokens the six
// appearances already define (--ink, --editor-font, --md-marker-ink, ...):
// the editor adds geometry and typography, never colours of its own.

export const EDITOR_CSS = `
.mde-surface.is-cm > .mde-highlight { display: none; }
.mde-surface.is-cm > textarea.mde-input.mde-cm-backing {
  position: absolute; left: 0; top: 0; width: 1px; height: 1px; padding: 0;
  opacity: 0; pointer-events: none; overflow: hidden; transform: none; resize: none;
}
/* The editor lies on the paper the way the textarea did: absolutely, filling
   it, so the paper's size still comes from the window and never from the
   text. CodeMirror's base theme pins its root to position: relative with
   !important; this rule has to outrank it, or the editor grows to the full
   length of the document and an overflow-hidden ancestor ends up scrolling
   instead of the editor's own scroller. */
.mde-surface.is-cm > .cm-editor.cm-editor {
  position: absolute !important; inset: 0;
  color: var(--ink);
  background: transparent;
  font-family: var(--editor-font);
  font-size: var(--mde-font-size, 15px);
}
.mde-surface.is-cm > .cm-editor.is-hidden { display: none; }
.mde-surface.is-cm > .cm-editor.cm-focused { outline: none; }
.mde-surface.is-cm .cm-scroller {
  font-family: inherit;
  line-height: var(--paper-line-height-editor, 1.7);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.mde-surface.is-cm .cm-content {
  box-sizing: border-box;
  flex: 0 1 var(--mde-page-width, 484px);
  width: 100%;
  max-width: var(--mde-page-width, 484px);
  margin: 0 auto;
  padding: var(--mde-page-padding-y, 24px) var(--mde-page-padding-x, 24px);
  caret-color: var(--ink);
  font-kerning: normal;
}
/* Quick Draft's page is wider and airier than the route's 484px paper. */
.draft-desk-editor .mde-surface.is-cm .cm-content {
  flex-basis: 42rem; max-width: 42rem; padding-top: 30px; padding-bottom: 40px;
}
.mde-surface.is-cm.is-typewriter-mode .cm-content {
  padding-top: var(--mde-typewriter-pad, 18px);
  padding-bottom: var(--mde-typewriter-pad, 18px);
}
.mde-surface.is-cm .cm-line { padding: 0; }
.mde-surface.is-cm .cm-placeholder { color: var(--shade-dark, #777); }
.mde-surface.is-cm .cm-content ::selection {
  background: color-mix(in srgb, var(--editor-selection-tint, var(--selection-bg, #b4d5fe)) 45%, transparent);
}
.mde-surface.is-cm .cm-editor.manuscript-readonly .cm-content { cursor: default; }

/* Live preview. Headings scale with the paper, tightest leading on the
   largest size; the page keeps one baseline rhythm below them. */
.mde-surface.is-cm .cm-md-heading { font-weight: 700; letter-spacing: -0.005em; }
.mde-surface.is-cm .cm-md-h1 { font-size: 1.6em; line-height: 1.3; padding: 0.35em 0 0.15em; }
.mde-surface.is-cm .cm-md-h2 { font-size: 1.28em; line-height: 1.4; padding: 0.3em 0 0.1em; }
.mde-surface.is-cm .cm-md-h3 { font-size: 1.1em; line-height: 1.5; padding-top: 0.2em; }
.mde-surface.is-cm .cm-md-h4, .mde-surface.is-cm .cm-md-h5, .mde-surface.is-cm .cm-md-h6 { font-size: 1em; }
.mde-surface.is-cm .cm-md-strong { font-weight: 700; }
.mde-surface.is-cm .cm-md-em { font-style: italic; }
.mde-surface.is-cm .cm-md-strike { text-decoration: line-through; text-decoration-color: var(--md-marker-ink); }
.mde-surface.is-cm .cm-md-code {
  font-family: var(--mono-font); font-size: 0.86em;
  background: color-mix(in srgb, var(--ink) 7%, transparent);
  border-radius: 3px; padding: 0.05em 0.25em;
}
.mde-surface.is-cm .cm-md-link { text-decoration: underline; text-decoration-color: var(--md-marker-ink); text-underline-offset: 0.2em; }
.mde-surface.is-cm .cm-md-marker,
.mde-surface.is-cm .cm-md-ordinal { color: var(--md-marker-ink); }
.mde-surface.is-cm .cm-md-heading .cm-md-marker { font-weight: 400; }
.mde-surface.is-cm .cm-md-machine { color: var(--md-marker-ink); opacity: 0.6; font-size: 0.8em; font-weight: 400; }
.mde-surface.is-cm .cm-md-comment { color: var(--md-marker-ink); font-size: 0.85em; }
.mde-surface.is-cm .cm-md-quote {
  border-left: 3px solid var(--md-marker-ink);
  padding-left: 0.85em;
  color: color-mix(in srgb, var(--ink) 78%, transparent);
}
.mde-surface.is-cm .cm-md-codeblock {
  font-family: var(--mono-font); font-size: 0.86em; line-height: 1.6;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  padding: 0 0.7em;
}
.mde-surface.is-cm .cm-md-fence { color: var(--md-marker-ink); }
.mde-surface.is-cm .cm-md-table { font-variant-numeric: tabular-nums; }
.mde-surface.is-cm .cm-md-bullet { display: inline-block; min-width: 1ch; font-weight: 700; }
.mde-surface.is-cm .cm-md-task { margin: 0 0.4em 0 0; vertical-align: -0.12em; cursor: pointer; }
.mde-surface.is-cm .cm-md-rule {
  display: inline-block; width: 100%; height: 0; vertical-align: middle;
  border-top: 1px solid var(--md-marker-ink);
}
.mde-surface.is-cm .cm-md-image { display: inline-flex; flex-direction: column; gap: 0.3em; max-width: 100%; padding: 0.3em 0; }
.mde-surface.is-cm .cm-md-image img { display: block; max-width: 100%; max-height: 22em; object-fit: contain; border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); }
.mde-surface.is-cm .cm-md-image-missing { display: block; width: 8em; height: 4.5em; border: 1px dashed var(--md-marker-ink); }
.mde-surface.is-cm .cm-md-image-caption { font-size: 0.8em; line-height: 1.5; color: var(--md-marker-ink); }

/* Focus mode: the sentence carries the ink. */
.mde-surface.is-cm.is-focus-mode .cm-focus-muted { opacity: 0.24; }
.mde-surface.is-cm.is-focus-mode .cm-focus-near { opacity: 0.55; }

/* 并排: source and finished page side by side, one sheet each. The window
   grows by min-width, which outranks the saved frame's width without
   replacing it, so the desk never remembers the wide window as TeachText's
   own size. */
.teachtext-window.is-split-view:not(.is-mobile-fullscreen) { min-width: min(1060px, calc(100vw - 24px)); }
.teachtext-editor-container.is-split { flex-direction: row; }
.teachtext-editor-container.is-split > .mde-surface,
.teachtext-editor-container.is-split > .teachtext-preview { flex: 1 1 0; min-width: 0; }
.teachtext-editor-container.is-split > .teachtext-preview { border-left: 1px solid var(--ink); }

/* The heading navigator (Go to Heading…), in the era's menu dress. */
.writing-heading-menu {
  position: fixed; z-index: var(--z-popover, 9000);
  min-width: 12em; max-width: min(24em, calc(100vw - 24px)); max-height: min(60vh, 28em); overflow-y: auto;
  padding: 3px 0;
  background: var(--menu-bg, var(--window-bg, #fff)); color: var(--ink);
  border: 1px solid var(--ink); box-shadow: 2px 2px 0 var(--ink);
  font: var(--menu-font-size, 12px) / 1.3 var(--system-font, inherit);
}
.writing-heading-item {
  display: block; width: 100%; text-align: left; border: 0; background: none; color: inherit;
  font: inherit; padding: 4px 18px 4px 16px; cursor: default; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.writing-heading-item.level-2 { padding-left: 28px; }
.writing-heading-item.level-3 { padding-left: 40px; }
.writing-heading-item.is-current,
.writing-heading-item:hover,
.writing-heading-item:focus-visible { background: var(--selection-bg, var(--ink)); color: var(--selection-ink, var(--paper, #fff)); outline: none; }
.writing-heading-empty { padding: 6px 16px; color: var(--md-marker-ink); }
.writing-heading-scrim { position: fixed; inset: 0; z-index: var(--z-popover, 9000); background: rgba(0, 0, 0, 0.28); }
.writing-heading-menu.is-sheet {
  left: 0; right: 0; bottom: 0; top: auto; max-width: none; max-height: 70vh;
  border-width: 1px 0 0; box-shadow: none; border-radius: 12px 12px 0 0;
  padding: 10px 0 calc(12px + env(safe-area-inset-bottom, 0px));
  font-size: 16px;
}
.writing-heading-menu.is-sheet .writing-heading-item { padding-top: 12px; padding-bottom: 12px; min-height: 44px; }
@media (prefers-reduced-motion: no-preference) {
  .writing-heading-menu:not(.is-sheet) { transform-origin: top left; animation: writing-menu-in 140ms cubic-bezier(0.23, 1, 0.32, 1); }
  .writing-heading-menu.is-sheet { animation: writing-sheet-in 240ms cubic-bezier(0.32, 0.72, 0, 1); }
}
@keyframes writing-menu-in { from { opacity: 0; transform: scale(0.97); } }
@keyframes writing-sheet-in { from { transform: translateY(100%); } }
/* System 6, Platinum and NeXTSTEP drew menus instantly, and so does this. */
body[data-theme="classic"] .writing-heading-menu, body[data-theme="platinum"] .writing-heading-menu,
body[data-theme="nextstep"] .writing-heading-menu { animation: none; }

/* The phone format bar takes the place of the four buttons while the keyboard
   is up: still one row. */
.writing-format-bar { display: none; }
.window.has-format-bar .writing-format-bar {
  display: flex; align-items: stretch; flex: none; min-width: 0; max-width: 100%;
  border-top: 1px solid var(--ink); background: var(--window-bg, var(--paper, #fff));
  min-height: 44px;
}
.window.has-format-bar .teachtext-surface-actions,
.window.has-format-bar .teachtext-actions { display: none; }
.writing-format-keys { display: flex; flex: 1 1 0; min-width: 0; overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; }
.writing-format-keys::-webkit-scrollbar { display: none; }
.writing-format-key {
  flex: none; min-width: 44px; min-height: 44px; padding: 0 6px;
  border: 0; border-right: 1px dotted color-mix(in srgb, var(--ink) 35%, transparent);
  background: none; color: var(--ink); font: 16px/1 var(--editor-font); touch-action: manipulation;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
}
.writing-format-key.is-bold { font-weight: 700; }
.writing-format-key.is-italic { font-style: italic; }
.writing-format-key:active { background: var(--ink); color: var(--window-bg, var(--paper, #fff)); }
.writing-format-key.is-dictate { font: 14px/1 var(--system-font, inherit); padding: 0 10px; }
.writing-format-key.is-done { border-right: 0; border-left: 1px solid var(--ink); min-width: 52px; font-size: 20px; }

/* A phone zooms the page into any field set under 16px, and 17px is what
   iOS itself sets body text at. */
@media (hover: none) and (pointer: coarse) {
  .mde-surface.is-cm > .cm-editor { font-size: max(17px, var(--mde-font-size, 15px)); }
}
@media (prefers-reduced-motion: reduce) {
  .mde-surface.is-cm .cm-scroller { scroll-behavior: auto; }
}
`;
