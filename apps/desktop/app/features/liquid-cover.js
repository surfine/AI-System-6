// Feature module: Liquid Cover / 玻璃封面 — turn any text into Apple-style
// Liquid Glass, composited between a background image and a foreground subject,
// and export a PNG cover (16:9 / 4:3 / 3:4 for B站 / 抖音).
//
// Lazy-loaded as a classic script (see config.js ensureLiquidCoverModule).
// Self-contained WebGL2 renderer ported from the liquid-glass-text prototype:
//   text -> Canvas2D coverage mask -> exact signed distance field (R32F) ->
//   glass optics (Snell refraction, dispersion, Fresnel, glare) sampling the
//   SDF instead of an analytic shape. Up to 8 text/shape layers (per-layer
//   glass/solid style, tint + thickness via min-union with argmin);
//   movable/scalable foreground subject.

window.AISystem6LiquidCoverLoaded = true;

// Cover Glass builds its own window. 29,014 bytes of markup for a creative lab
// most sessions never open sat in index.html, downloaded at every boot.
//
// The one judgement here: `liquid-cover-body` IS the pane. It was a private
// name for the same thing every other window calls a window-pane, so it takes
// the shared class rather than teaching the shell to skip a pane for one
// window. The toolbar above it is a real sibling and uses the shell's slot.
//
// This runs before the IIFE below, which reads these elements as it loads.
function installLiquidCoverWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="liquidCover"]')) return;
  const shell = window.AISystem6ApplicationShell;
  if (!shell) return;
  shell.createWindow({
    windowName: "liquidCover",
    windowClass: "liquid-cover-window",
    labelledBy: "liquid-cover-title",
    titleKey: "liquid_cover_title",
    title: "Cover Glass",
    statusClass: "lc-status-bar",
    statusHtml: `          <span class="lc-ask-status" id="lc-ai-status" role="status" aria-live="polite" data-i18n="ready">Ready</span>
          <span class="lc-status-meta" id="lc-status-meta">16:9 · 1 layer</span>`,
    beforePaneHtml: `<div class="lc-toolbar" role="toolbar" aria-label="Cover tools" data-i18n-aria-label="liquid_cover_tools">
          <div class="lc-toolbar-create">
            <button class="btn" type="button" id="lc-add-layer" data-i18n-aria-label="liquid_cover_add">
              <span class="mobile-control-long" data-i18n="liquid_cover_add">Add Text</span>
              <span class="mobile-control-short" data-i18n="liquid_cover_add_short">+ Text</span>
            </button>
            <button class="btn" type="button" id="lc-add-shape" data-i18n-aria-label="liquid_cover_add_shape">
              <span class="mobile-control-long" data-i18n="liquid_cover_add_shape">Add Shape</span>
              <span class="mobile-control-short" data-i18n="liquid_cover_add_shape_short">+ Shape</span>
            </button>
            <input type="file" id="lc-shape-file" accept="image/png,image/webp,image/svg+xml,image/jpeg" hidden>
          </div>
          <div class="lc-toolbar-history" role="group" aria-label="Edit history" data-i18n-aria-label="liquid_cover_history">
            <button class="btn lc-history-button" type="button" id="lc-undo" aria-label="Undo" data-i18n-aria-label="liquid_cover_undo" title="Undo" data-i18n-title="liquid_cover_undo" disabled>
              <span class="lc-control-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 3 3 9l6 6"></path><path d="M3.5 9H15a6 6 0 0 1 0 12h-3"></path></svg></span>
            </button>
            <button class="btn lc-history-button is-redo" type="button" id="lc-redo" aria-label="Redo" data-i18n-aria-label="liquid_cover_redo" title="Redo" data-i18n-title="liquid_cover_redo" disabled>
              <span class="lc-control-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 3 3 9l6 6"></path><path d="M3.5 9H15a6 6 0 0 1 0 12h-3"></path></svg></span>
            </button>
          </div>
          <div class="lc-toolbar-modes" role="tablist" aria-label="Inspector" data-i18n-aria-label="liquid_cover_inspector">
            <button class="lc-inspector-tab" type="button" id="lc-tab-media" data-lc-inspector-tab="media" role="tab" aria-selected="false" aria-controls="lc-panel-media" data-i18n-aria-label="liquid_cover_media">
              <span class="mobile-control-long" data-i18n="liquid_cover_media">Background</span>
              <span class="mobile-control-short" data-i18n="liquid_cover_media_short">BG</span>
            </button>
            <button class="lc-inspector-tab is-active" type="button" id="lc-tab-layers" data-lc-inspector-tab="layers" role="tab" aria-selected="true" aria-controls="lc-panel-layers" data-i18n-aria-label="liquid_cover_text">
              <span class="mobile-control-long" data-i18n="liquid_cover_text">Type</span>
              <span class="mobile-control-short" data-i18n="liquid_cover_text_short">Type</span>
            </button>
            <button class="lc-inspector-tab" type="button" id="lc-tab-stack" data-lc-inspector-tab="stack" role="tab" aria-selected="false" aria-controls="lc-panel-stack" data-i18n-aria-label="liquid_cover_tab_stack">
              <span class="mobile-control-long" data-i18n="liquid_cover_tab_stack">Picture</span>
              <span class="mobile-control-short" data-i18n="liquid_cover_tab_stack_short">Pic</span>
            </button>
            <button class="lc-inspector-tab" type="button" id="lc-tab-glass" data-lc-inspector-tab="glass" role="tab" aria-selected="false" aria-controls="lc-panel-glass" data-i18n-aria-label="liquid_cover_tab_glass">
              <span class="mobile-control-long" data-i18n="liquid_cover_tab_glass">Glass</span>
              <span class="mobile-control-short" data-i18n="liquid_cover_glass_short">Glass</span>
            </button>
          </div>
          <div class="lc-toolbar-aspect">
            <span data-i18n="liquid_cover_aspect">Aspect</span>
            <div class="lc-aspect" role="group" aria-label="Aspect ratio" data-i18n-aria-label="liquid_cover_aspect">
              <button type="button" data-k="16:9" aria-pressed="true">16:9</button>
              <button type="button" data-k="3:2" aria-pressed="false">3:2</button>
              <button type="button" data-k="4:3" aria-pressed="false">4:3</button>
              <button type="button" data-k="3:4" aria-pressed="false">3:4</button>
              <button type="button" data-k="1:1" aria-pressed="false">1:1</button>
            </div>
          </div>
          <button class="btn lc-toolbar-export" type="button" id="lc-tab-export" data-lc-inspector-tab="export" aria-pressed="false" aria-controls="lc-panel-export" data-i18n-aria-label="liquid_cover_tab_export">
            <span class="mobile-control-long" data-i18n="liquid_cover_tab_export">Export</span>
            <span class="mobile-control-short" data-i18n="liquid_cover_export_short">Export</span>
          </button>
        </div>`,
    paneClass: "liquid-cover-body",
    paneHtml: `
          <aside class="lc-sidebar" aria-label="Scene layers" data-i18n-aria-label="liquid_cover_scene">
            <div class="lc-sidebar-head">
              <span class="lc-panel-kicker" data-i18n="liquid_cover_scene">Scene</span>
              <strong data-i18n="liquid_cover_layers">Layers</strong>
            </div>
            <label class="lc-cover-name"><span class="visually-hidden" data-i18n="liquid_cover_name">Cover name</span>
              <input type="text" id="lc-cover-title" maxlength="80" autocomplete="off" data-i18n-placeholder="liquid_cover_name_hint" placeholder="Cover name">
            </label>
            <div class="lc-layer-list" id="lc-layer-list" aria-label="Cover layers" data-i18n-aria-label="liquid_cover_layers"></div>
            <p class="lc-selection-help" id="lc-selection-help" role="status" aria-live="polite" data-i18n="liquid_cover_selection_help">Shift-click or drag a box to select multiple layers. Drag layers to reorder.</p>
            <details class="lc-arrange-panel">
              <summary id="lc-arrange-title" data-i18n="liquid_cover_arrange">Arrange &amp; align</summary>
              <div class="lc-order-row" role="group" aria-label="Layer order" data-i18n-aria-label="liquid_cover_layer_order">
                <button class="btn" type="button" id="lc-layer-bottom" data-i18n="liquid_cover_send_bottom">Bottom</button>
                <button class="btn" type="button" id="lc-layer-down" data-i18n="liquid_cover_send_down">Down</button>
                <button class="btn" type="button" id="lc-layer-up" data-i18n="liquid_cover_bring_up">Up</button>
                <button class="btn" type="button" id="lc-layer-top" data-i18n="liquid_cover_bring_top">Top</button>
              </div>
              <div class="lc-align-grid" role="group" aria-label="Align to artboard" data-i18n-aria-label="liquid_cover_align_artboard">
                <button class="btn" type="button" id="lc-align-left" data-i18n="liquid_cover_align_left">Left</button>
                <button class="btn" type="button" id="lc-align-center" data-i18n="liquid_cover_align_center">Center</button>
                <button class="btn" type="button" id="lc-align-right" data-i18n="liquid_cover_align_right">Right</button>
                <button class="btn" type="button" id="lc-align-top" data-i18n="liquid_cover_align_top">Top</button>
                <button class="btn" type="button" id="lc-align-middle" data-i18n="liquid_cover_align_middle">Middle</button>
                <button class="btn" type="button" id="lc-align-bottom" data-i18n="liquid_cover_align_bottom">Bottom</button>
              </div>
              <div class="lc-align-grid lc-align-selection" role="group" aria-label="Align selection" data-i18n-aria-label="liquid_cover_align_selection">
                <button class="btn" type="button" data-align="left" data-i18n="liquid_cover_sel_left">Sel ⇤</button>
                <button class="btn" type="button" data-align="hcenter" data-i18n="liquid_cover_sel_hcenter">Sel ⇔</button>
                <button class="btn" type="button" data-align="right" data-i18n="liquid_cover_sel_right">Sel ⇥</button>
                <button class="btn" type="button" data-align="top" data-i18n="liquid_cover_sel_top">Sel ⤒</button>
                <button class="btn" type="button" data-align="vcenter" data-i18n="liquid_cover_sel_vcenter">Sel ⇕</button>
                <button class="btn" type="button" data-align="bottom" data-i18n="liquid_cover_sel_bottom">Sel ⤓</button>
              </div>
              <div class="lc-order-row lc-distribute-selection" role="group" aria-label="Distribute selection" data-i18n-aria-label="liquid_cover_distribute">
                <button class="btn" type="button" data-distribute="x" data-i18n="liquid_cover_distribute_h">Distribute across</button>
                <button class="btn" type="button" data-distribute="y" data-i18n="liquid_cover_distribute_v">Distribute down</button>
              </div>
            </details>
            <div class="lc-sidebar-actions">
              <button class="btn" type="button" id="lc-add-inside-text" data-i18n="liquid_cover_add_inside_text">Text in shape</button>
              <button class="btn" type="button" id="lc-duplicate-layer" data-i18n="liquid_cover_duplicate">Duplicate</button>
              <button class="btn" type="button" id="lc-del-layer" data-i18n="liquid_cover_del">Delete</button>
            </div>
            <details class="lc-picture-library">
              <summary data-i18n="liquid_cover_picture_library">Pictures &amp; adjustments</summary>
              <div class="lc-shape-tray">
                <button class="btn" type="button" id="lc-add-picture" data-i18n="liquid_cover_add_picture">Add Picture…</button>
                <button class="btn" type="button" id="lc-add-album" data-i18n="liquid_cover_add_from_album">From Picture Album…</button>
                <button class="btn" type="button" id="lc-add-adjust-bc" data-i18n="liquid_cover_adjust_brightnessContrast">Brightness / Contrast</button>
                <button class="btn" type="button" id="lc-add-adjust-hs" data-i18n="liquid_cover_adjust_hueSaturation">Hue / Saturation</button>
                <button class="btn" type="button" id="lc-add-adjust-blur" data-i18n="liquid_cover_adjust_blur">Blur</button>
              </div>
              <input type="file" id="lc-picture-file" accept="image/*" hidden>
              <div class="lc-album" id="lc-album" hidden>
                <div class="lc-order-row" id="lc-album-as" role="group" aria-label="Use as" data-i18n-aria-label="liquid_cover_album_as">
                  <button class="btn" type="button" data-as="subject" aria-pressed="true" data-i18n="liquid_cover_as_subject">As subject</button>
                  <button class="btn" type="button" data-as="background" aria-pressed="false" data-i18n="liquid_cover_as_background">As background</button>
                </div>
                <div class="lc-album-grid" id="lc-album-grid"></div>
                <p class="lc-note" id="lc-album-empty" hidden></p>
                <p class="lc-note" data-i18n="liquid_cover_album_hint">You can also drag a picture from the Picture Album onto the cover. Hold ⌥ to make it the background.</p>
              </div>
            </details>
            <details class="lc-shape-library">
              <summary data-i18n="liquid_cover_shape_library">Quick shapes</summary>
              <div class="lc-shape-tray">
                <button class="btn" type="button" id="lc-shape-circle" data-i18n="liquid_cover_shape_circle">Circle</button>
                <button class="btn" type="button" id="lc-shape-squircle" data-i18n="liquid_cover_shape_squircle">Rounded Rect</button>
                <button class="btn" type="button" id="lc-shape-capsule" data-i18n="liquid_cover_shape_capsule">Capsule</button>
              </div>
            </details>
          </aside>
          <div class="lc-stage">
            <div class="lc-stage-head">
              <span class="lc-stage-kicker" data-i18n="liquid_cover_artboard">Artboard</span>
              <output class="lc-stage-format" id="lc-stage-format">16:9 · 1280 × 720</output>
            </div>
            <div class="lc-canvas-shell">
              <canvas id="lc-canvas" class="lc-canvas" tabindex="0" role="application" aria-label="Select directly, Shift-click or box-select multiple layers, then drag to move and snap. Drag the handles to scale or rotate." data-i18n-aria-label="liquid_cover_canvas_label"></canvas>
              <div class="lc-selection-box" id="lc-selection-box">
                <button class="lc-transform-handle is-rotate" type="button" id="lc-transform-rotate" aria-label="Rotate layer" data-i18n-aria-label="liquid_cover_rotate_layer" title="Rotate layer" data-i18n-title="liquid_cover_rotate_layer">↻</button>
                <button class="lc-transform-handle is-scale" type="button" id="lc-transform-scale" aria-label="Scale layer" data-i18n-aria-label="liquid_cover_scale_layer" title="Scale layer" data-i18n-title="liquid_cover_scale_layer"></button>
              </div>
              <div class="lc-selection-marquee" id="lc-selection-marquee" aria-hidden="true"></div>
              <div class="lc-alignment-guides" id="lc-alignment-guides" aria-hidden="true">
                <span class="lc-alignment-guide is-vertical"></span>
                <span class="lc-alignment-guide is-horizontal"></span>
              </div>
            </div>
            <div class="lc-stage-foot">
              <span class="lc-stage-selection" id="lc-stage-selection">Liquid</span>
              <span class="lc-stage-hint" data-i18n="liquid_cover_stage_hint">Auto-snap · Shift multi-select · Drag handles to scale or rotate</span>
            </div>
            <button type="button" class="btn lc-stage-expand" id="lc-stage-expand" aria-label="Fullscreen preview" aria-pressed="false" data-i18n-aria-label="liquid_cover_stage_expand" title="Fullscreen preview" data-i18n-title="liquid_cover_stage_expand">⤢</button>
          </div>
          <div class="lc-panel window-frame-scroller" id="liquid-cover-app">
            <div class="lc-panel-intro">
              <span class="lc-panel-kicker" data-i18n="liquid_cover_inspector">Inspector</span>
              <strong id="lc-inspector-title" data-i18n="liquid_cover_type_properties">Type properties</strong>
              <span id="lc-inspector-hint" data-i18n="liquid_cover_type_hint">Select a layer, then change only what matters to it.</span>
            </div>

            <div class="lc-inspector-panel is-active" id="lc-panel-layers" data-lc-inspector-panel="layers" role="tabpanel" aria-labelledby="lc-tab-layers">
            <div class="lc-group lc-text-group">
              <div class="lc-group-title" data-i18n="liquid_cover_text">Text</div>
              <textarea id="lc-text" class="lc-textarea" rows="2">Liquid
Glass</textarea>
              <label class="lc-row"><span data-i18n="liquid_cover_font">Font</span>
                <div class="select-wrap"><select id="lc-font">
                  <optgroup label="Apple">
                    <option value='-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif' data-font-system="true">SF Pro · System</option>
                    <option value='"SF Pro Rounded", ui-rounded, -apple-system, sans-serif' data-font-family="SF Pro Rounded">SF Pro Rounded</option>
                    <option value='"SF Compact", "SF Compact Display", "SF Compact Text", -apple-system, sans-serif' data-font-family="SF Compact">SF Compact</option>
                    <option value='"SF Compact Rounded", "SF Compact", ui-rounded, -apple-system, sans-serif' data-font-family="SF Compact Rounded">SF Compact Rounded</option>
                    <option value='"SF Mono", ui-monospace, monospace' data-font-family="SF Mono">SF Mono</option>
                    <option value='"New York", "New York Small", "New York Medium", "New York Large", serif' data-font-family="New York">New York</option>
                  </optgroup>
                  <optgroup label="中文">
                    <option value='"PingFang SC", -apple-system, sans-serif' data-font-family="PingFang SC">苹方简体 · PingFang SC</option>
                    <option value='"PingFang TC", -apple-system, sans-serif' data-font-family="PingFang TC">蘋方繁體 · PingFang TC</option>
                    <option value='Georgia, "Songti SC", "Songti TC", STSong, "Times New Roman", serif' data-font-family="Songti SC" data-font-system="true" data-font-serif="true">宋体简体 · Georgia</option>
                    <option value='Georgia, "Songti TC", "Songti SC", STSong, "Times New Roman", serif' data-font-family="Songti TC" data-font-system="true" data-font-serif="true">宋體繁體 · Georgia</option>
                    <option value='"Smiley Sans", "PingFang SC", sans-serif' data-font-bundled="true">得意黑 · Smiley Sans</option>
                  </optgroup>
                </select></div>
              </label>
              <div class="lc-font-import-row">
                <button class="btn" type="button" id="lc-font-import" data-i18n="liquid_cover_import_font">Import Font…</button>
                <input hidden type="file" id="lc-font-file" tabindex="-1" aria-hidden="true" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2">
                <span class="lc-font-status" id="lc-font-status" role="status" aria-live="polite" data-i18n="liquid_cover_font_import_hint">Uses installed Apple fonts · imports last for this page only</span>
                <a class="lc-font-source-link" href="https://developer.apple.com/fonts/" target="_blank" rel="noopener" data-i18n="liquid_cover_apple_fonts">Apple fonts</a>
              </div>
              <label class="lc-row"><span data-i18n="liquid_cover_size">Size</span><input type="range" id="lc-font-size" min="20" max="600" step="1" value="170"><span class="lc-val" id="lc-font-size-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_weight">Weight</span><input type="range" id="lc-font-weight" min="100" max="900" step="100" value="800"><span class="lc-val" id="lc-font-weight-v"></span></label>
              <details class="lc-object-advanced">
                <summary data-i18n="liquid_cover_more_type_controls">More type controls</summary>
                <div class="lc-layer-advanced">
                <label class="lc-row"><span data-i18n="liquid_cover_tracking">Tracking</span><input type="range" id="lc-letter-spacing" min="-10" max="40" step="1" value="0"><span class="lc-val" id="lc-letter-spacing-v"></span></label>
                <label class="lc-row"><span data-i18n="liquid_cover_rotation">Rotation</span><input type="range" id="lc-rotation" min="-180" max="180" step="1" value="0"><span class="lc-val" id="lc-rotation-v"></span></label>
                </div>
              </details>
            </div>
            </div>

            <div class="lc-inspector-panel" id="lc-panel-media" data-lc-inspector-panel="media" role="tabpanel" aria-labelledby="lc-tab-media" hidden>
            <details class="lc-media-ai">
              <summary data-i18n="liquid_cover_generate_background">Generate a background</summary>
            <div class="lc-group lc-t2i-group">
              <div class="lc-group-title" data-i18n="liquid_cover_t2i_title">Background Prompt</div>
              <div class="lc-note" data-i18n="liquid_cover_t2i_hint">Write a text-to-image prompt for the background (uses the mood box below).</div>
              <div class="lc-button-row">
                <button class="btn" type="button" id="lc-t2i-go" data-i18n="liquid_cover_t2i_go">Write Image Prompt</button>
              </div>
              <textarea id="lc-t2i-out" class="lc-textarea" rows="4" readonly hidden></textarea>
              <div class="lc-button-row">
                <button class="btn" type="button" id="lc-t2i-copy" data-i18n="liquid_cover_t2i_copy" hidden>Copy</button>
              </div>
            </div>

            </details>

            <div class="lc-group lc-bg-group">
              <div class="lc-group-title" data-i18n="liquid_cover_background">Background</div>
              <div class="lc-bg-row" id="lc-bg-row"></div>
              <div class="file-picker">
                <button class="btn file-picker-button" type="button" id="lc-bg-choose" data-i18n="liquid_cover_choose_bg">Choose Background…</button>
                <span class="file-picker-name" id="lc-bg-name" data-i18n="no_files_selected">No files selected</span>
              </div>
              <input id="lc-bg-input" class="visually-hidden" type="file" accept="image/*" />
            </div>

            <details class="lc-media-extras">
              <summary data-i18n="liquid_cover_media_extras">Motion and foreground</summary>
            <div class="lc-group lc-motion-group">
              <div class="lc-group-title" data-i18n="liquid_cover_motion">Motion Video</div>
              <div class="file-picker">
                <button class="btn file-picker-button" type="button" id="lc-motion-choose" data-i18n="liquid_cover_choose_motion">Choose Motion Video…</button>
                <button class="btn" type="button" id="lc-motion-clear" data-i18n="liquid_cover_clear" hidden>Clear</button>
                <span class="file-picker-name" id="lc-motion-name" data-i18n="no_files_selected">No files selected</span>
              </div>
              <input id="lc-motion-input" class="visually-hidden" type="file" accept="video/quicktime,video/mp4,video/*,.mov,.mp4,.m4v" />
              <p class="lc-note" data-i18n="liquid_cover_motion_note">Use the MOV/MP4 side of a Live Photo as the animated background.</p>
            </div>

            <div class="lc-group lc-fg-group">
              <div class="lc-group-title" data-i18n="liquid_cover_subject">Subject (Foreground)</div>
              <div class="file-picker">
                <button class="btn file-picker-button" type="button" id="lc-fg-choose" data-i18n="liquid_cover_choose_subject">Choose Subject…</button>
                <button class="btn" type="button" id="lc-fg-clear" data-i18n="liquid_cover_clear" hidden>Clear</button>
                <span class="file-picker-name" id="lc-fg-name" data-i18n="no_files_selected">No files selected</span>
              </div>
              <input id="lc-fg-input" class="visually-hidden" type="file" accept="image/*" />
              <label class="lc-row"><span data-i18n="liquid_cover_scale">Scale</span><input type="range" id="lc-fg-scale" min="10" max="200" step="1" value="100"><span class="lc-val" id="lc-fg-scale-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_subject_register">Align to Background</span><input type="checkbox" id="lc-fg-register" class="lc-check" checked></label>
              <label class="lc-row"><span data-i18n="liquid_cover_drag_subject">Drag Subject</span><input type="checkbox" id="lc-fg-drag" class="lc-check"></label>
              <p class="lc-note" data-i18n="liquid_cover_subject_register_note">A cut-out saved from this background photo (same size) lands exactly on it. Turn off for a subject cropped to its own edges.</p>
            </div>
            </details>
            </div>

            <div class="lc-inspector-panel" id="lc-panel-stack" data-lc-inspector-panel="stack" role="tabpanel" aria-labelledby="lc-tab-stack" hidden>
            <div class="lc-group lc-stack-group">
              <div class="lc-group-title" data-i18n="liquid_cover_layer_info">Layer</div>
              <div id="lc-stack-inspector" class="lc-stack-inspector"></div>
              <p class="lc-note" data-i18n="liquid_cover_stack_note">An adjustment changes every layer beneath it. Clip a layer to confine it to the layer below.</p>
            </div>
            <div class="lc-group lc-cutout-group">
              <div class="lc-group-title" data-i18n="liquid_cover_cutout">Cut-out</div>
              <div class="lc-button-row">
                <button class="btn" type="button" id="lc-cutout-go" data-i18n="liquid_cover_remove_background">Remove Background</button>
                <button class="btn" type="button" id="lc-cutout-clear" data-i18n="liquid_cover_remove_cutout" hidden>Restore Background</button>
                <button class="btn" type="button" id="lc-cutout-refine" aria-pressed="false" data-i18n="liquid_cover_refine_mask" hidden>Refine Cut-out</button>
              </div>
              <div class="lc-button-row" id="lc-cutout-brush" hidden>
                <button class="btn is-active" type="button" id="lc-brush-add" aria-pressed="true" data-i18n="liquid_cover_brush_add">Add</button>
                <button class="btn" type="button" id="lc-brush-subtract" aria-pressed="false" data-i18n="liquid_cover_brush_subtract">Subtract</button>
                <label class="lc-row"><span data-i18n="liquid_cover_brush_size">Brush</span><input type="range" id="lc-brush-size" min="6" max="200" step="1" value="40"><span class="lc-val" id="lc-brush-size-v"></span></label>
              </div>
              <p class="lc-note" id="lc-cutout-note"></p>
              <div class="lc-cutout-model" id="lc-cutout-model" hidden>
                <p class="lc-note" id="lc-cutout-model-note"></p>
                <div class="file-picker">
                  <button class="btn file-picker-button" type="button" id="lc-cutout-model-choose" data-i18n="liquid_cover_cutout_choose_model">Choose Model Files…</button>
                  <a class="lc-font-source-link" href="https://huggingface.co/Xenova/modnet/tree/main" target="_blank" rel="noopener" data-i18n="liquid_cover_cutout_model_page">Model page</a>
                </div>
                <input id="lc-cutout-model-file" class="visually-hidden" type="file" multiple accept=".json,.onnx" />
              </div>
            </div>
            </div>

            <div class="lc-inspector-panel" id="lc-panel-glass" data-lc-inspector-panel="glass" role="tabpanel" aria-labelledby="lc-tab-glass" hidden>
            <div class="lc-group lc-material-group">
              <div class="lc-group-title" data-i18n="liquid_cover_material">Glass Mix</div>
              <label class="lc-row"><span data-i18n="liquid_cover_material_scale">Clear / Tinted</span><input type="range" id="lc-material-mix" min="0" max="100" step="1" value="0"><span class="lc-val" id="lc-material-mix-v"></span></label>
            </div>
            <div class="lc-group lc-layer-glass-group">
              <div class="lc-group-title" data-i18n="liquid_cover_selected_layer">Selected layer</div>
              <label class="lc-row"><span data-i18n="liquid_cover_layer_solid">Solid Layer</span><input type="checkbox" id="lc-layer-solid" class="lc-check"></label>
              <label class="lc-row"><span data-i18n="liquid_cover_depth">Depth</span><input type="range" id="lc-thickness" min="0" max="100" step="1" value="20"><span class="lc-val" id="lc-thickness-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_tint">Tint</span><input type="color" id="lc-tint-color" class="lc-color" value="#ffffff"></label>
              <label class="lc-row"><span data-i18n="liquid_cover_tint_strength">Tint Strength</span><input type="range" id="lc-tint-alpha" min="0" max="100" step="1" value="0"><span class="lc-val" id="lc-tint-alpha-v"></span></label>
            </div>
            <div class="lc-group lc-presets-group">
              <div class="lc-group-title" data-i18n="liquid_cover_presets">Glass Presets</div>
              <div class="lc-preset-row" id="lc-preset-row"></div>
              <p class="lc-note" data-i18n="liquid_cover_presets_hint">Choose a proven material; the cover updates immediately.</p>
            </div>

            <div class="lc-group lc-liquid-group">
              <div class="lc-group-title" data-i18n="liquid_cover_liquid">Liquid Surface</div>
              <label class="lc-row"><span data-i18n="liquid_cover_liquid_mode">Ripples</span>
                <div class="select-wrap"><select id="lc-liquid-mode">
                  <option value="off" selected data-i18n="liquid_cover_liquid_off">Off</option>
                  <option value="glass" data-i18n="liquid_cover_liquid_glass">In the glass</option>
                  <option value="cover" data-i18n="liquid_cover_liquid_cover">Whole cover</option>
                </select></div>
              </label>
              <label class="lc-row"><span data-i18n="liquid_cover_liquid_strength">Strength</span><input type="range" id="lc-liquid-strength" min="0" max="100" step="1" value="50"><span class="lc-val" id="lc-liquid-strength-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_liquid_drop">Drop Size</span><input type="range" id="lc-liquid-drop" min="6" max="120" step="1" value="28"><span class="lc-val" id="lc-liquid-drop-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_liquid_pointer">Pointer Stirs</span><input type="checkbox" id="lc-liquid-pointer" class="lc-check" checked></label>
              <div class="lc-button-row">
                <button class="btn" type="button" id="lc-liquid-rain" data-i18n="liquid_cover_liquid_rain">Drop</button>
                <button class="btn" type="button" id="lc-liquid-freeze" aria-pressed="false" data-i18n="liquid_cover_liquid_freeze">Hold Frame</button>
                <button class="btn" type="button" id="lc-liquid-calm" data-i18n="liquid_cover_liquid_calm">Calm</button>
              </div>
              <p class="lc-note" id="lc-liquid-note" data-i18n="liquid_cover_liquid_note">Move or click over the cover to disturb it. The PNG keeps the frame on screen; Hold Frame stops the water so you can export it.</p>
            </div>

            <details class="lc-look-assistant">
              <summary data-i18n="liquid_cover_ai_director">AI art director</summary>
              <form id="lc-ask-form" class="lc-ask-bar">
                <label for="lc-ask-input" class="lc-ask-label" data-i18n="liquid_cover_ask_label">Describe a look</label>
                <div class="lc-ask-row">
                  <input id="lc-ask-input" type="text" data-i18n-placeholder="liquid_cover_ask_hint" placeholder="e.g. calm tech blue, cinematic…" />
                  <button class="btn" type="submit" id="lc-ask-go" data-i18n="liquid_cover_ask_go">Apply</button>
                </div>
                <label class="lc-row lc-ai-vision-setting"><span data-i18n="liquid_cover_ai_vision">Read background</span><input type="checkbox" id="lc-ask-vision" class="lc-check" checked></label>
              </form>
            </details>

            <details class="lc-finetune">
              <summary data-i18n="liquid_cover_finetune">Fine-tune (manual)</summary>
            <details class="lc-group lc-tune-group">
              <summary data-i18n="liquid_cover_light_group">Light</summary>
              <label class="lc-row"><span data-i18n="liquid_cover_light_angle">Light Angle</span><input type="range" id="lc-light-angle" min="-180" max="180" step="1" value="135"><span class="lc-val" id="lc-light-angle-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_light_intensity">Light Intensity</span><input type="range" id="lc-light-intensity" min="0" max="100" step="1" value="60"><span class="lc-val" id="lc-light-intensity-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_splay">Splay</span><input type="range" id="lc-splay" min="0" max="100" step="1" value="30"><span class="lc-val" id="lc-splay-v"></span></label>
            </details>

            <details class="lc-group lc-tune-group">
              <summary data-i18n="liquid_cover_optics_group">Optics</summary>
              <label class="lc-row"><span data-i18n="liquid_cover_refraction_amount">Refraction</span><input type="range" id="lc-refraction" min="0" max="100" step="1" value="50"><span class="lc-val" id="lc-refraction-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_magnification">Magnification</span><input type="range" id="lc-magnify" min="-4" max="4" step="0.05" value="1"><span class="lc-val" id="lc-magnify-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_dispersion">Spectral Split</span><input type="range" id="lc-dispersion" min="0" max="100" step="0.5" value="4"><span class="lc-val" id="lc-dispersion-v"></span></label>
            </details>

            <details class="lc-group lc-tune-group">
              <summary data-i18n="liquid_cover_surface_group">Surface</summary>
              <label class="lc-row"><span data-i18n="liquid_cover_bg_blur">Frost</span><input type="range" id="lc-blur-radius" min="0" max="80" step="1" value="8"><span class="lc-val" id="lc-blur-radius-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_brightness">Brightness</span><input type="range" id="lc-brightness" min="-50" max="50" step="1" value="6"><span class="lc-val" id="lc-brightness-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_saturation">Saturation</span><input type="range" id="lc-saturation" min="0" max="200" step="1" value="120"><span class="lc-val" id="lc-saturation-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_post_blur">Post Blur</span><input type="range" id="lc-post-blur" min="0" max="40" step="1" value="0"><span class="lc-val" id="lc-post-blur-v"></span></label>
            </details>

            <details class="lc-group lc-tune-group">
              <summary data-i18n="liquid_cover_merge_group">Liquid Merge</summary>
              <label class="lc-row"><span data-i18n="liquid_cover_merge">Merge Distance</span><input type="range" id="lc-merge" min="0" max="160" step="1" value="0"><span class="lc-val" id="lc-merge-v"></span></label>
              <p class="lc-note" data-i18n="liquid_cover_merge_note">Nearby glass layers flow into one piece of glass. Text placed inside a shape stays on top of it.</p>
            </details>

            <details class="lc-group lc-tune-group">
              <summary data-i18n="liquid_cover_shadow_group">Shadow</summary>
              <label class="lc-row"><span data-i18n="liquid_cover_shadow_strength">Shadow Strength</span><input type="range" id="lc-shadow-factor" min="0" max="100" step="1" value="12"><span class="lc-val" id="lc-shadow-factor-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_shadow_spread">Shadow Spread</span><input type="range" id="lc-shadow-expand" min="2" max="100" step="1" value="20"><span class="lc-val" id="lc-shadow-expand-v"></span></label>
            </details>
            </details>

            </div>

            <div class="lc-inspector-panel" id="lc-panel-export" data-lc-inspector-panel="export" role="tabpanel" aria-labelledby="lc-tab-export" hidden>
            <div class="lc-group lc-thumbnail-group">
              <div class="lc-group-title" data-i18n="liquid_cover_thumbnail_title">Small-size check</div>
              <canvas id="lc-thumbnail" class="lc-thumbnail" width="320" height="180" role="img" data-i18n-aria-label="liquid_cover_thumbnail_alt" aria-label="Current cover at thumbnail size"></canvas>
              <p class="lc-note" data-i18n="liquid_cover_thumbnail_hint">Check the promise at this size. Use solid text if glass is hard to read. This preview does not change the export.</p>
            </div>

            <div class="lc-group lc-export-group">
              <label class="lc-export-choice"><span data-i18n="liquid_cover_export_res">Export size</span>
                <div class="select-wrap"><select id="lc-export-res">
                  <option value="source" selected data-i18n="liquid_cover_res_source">Match photo</option>
                  <option value="4" data-i18n="liquid_cover_res_4x">4× preview</option>
                  <option value="2" data-i18n="liquid_cover_res_2x">2× preview</option>
                  <option value="1" data-i18n="liquid_cover_res_1x">1× preview</option>
                </select></div>
              </label>
              <p class="lc-note" id="lc-export-dim" data-i18n="liquid_cover_export_dim_note">PNG is rendered at full resolution — no downscaling.</p>
              <div class="lc-button-row">
                <button class="btn default" type="button" id="lc-export" data-i18n="liquid_cover_export">Export PNG</button>
              </div>
              <p class="lc-note" data-i18n="liquid_cover_aspect_note">Exported at the chosen aspect — never cropped.</p>
            </div>

            <div class="lc-group lc-animation-group">
              <div class="lc-group-title" data-i18n="liquid_cover_animation">Animation</div>
              <label class="lc-row"><span data-i18n="liquid_cover_motion_preset">Preset</span>
                <div class="select-wrap"><select id="lc-motion-preset">
                  <option value="none" data-i18n="liquid_cover_motion_none">None</option>
                  <option value="condense" data-i18n="liquid_cover_motion_condense">Glass Forming</option>
                  <option value="push" data-i18n="liquid_cover_motion_push">Live Push</option>
                  <option value="ripple" data-i18n="liquid_cover_motion_ripple">Ripple Settles</option>
                </select></div>
              </label>
              <label class="lc-row"><span data-i18n="liquid_cover_motion_duration">Duration</span><input type="range" id="lc-motion-duration" min="1" max="6" step="0.1" value="2"><span class="lc-val" id="lc-motion-duration-v"></span></label>
              <label class="lc-row"><span data-i18n="liquid_cover_motion_audio">Original Audio</span><input type="checkbox" id="lc-motion-audio" class="lc-check"></label>
              <div class="lc-button-row">
                <button class="btn" type="button" id="lc-motion-preview" aria-pressed="false" data-i18n="liquid_cover_preview_video">Preview Once</button>
                <button class="btn" type="button" id="lc-motion-export" data-i18n="liquid_cover_export_video">Export Video</button>
              </div>
              <p class="lc-note" data-i18n="liquid_cover_motion_export_note">Exports the current canvas as a browser-encoded video; MP4 is used when the browser supports it, otherwise WebM.</p>
            </div>
            </div>

          </div>`,
  });
}

installLiquidCoverWindow();

(function () {
  "use strict";

  const MAX_LAYERS = 8;
  const INF = 1e20;

  // ------------------------------------------------------------------
  // 1) Text -> exact signed distance field (Felzenszwalb EDT, tiny-sdf core)
  // ------------------------------------------------------------------
  function edt1d(grid, offset, stride, length, f, v, z) {
    v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
    for (let q = 1, k = 0; q < length; q++) {
      f[q] = grid[offset + q * stride];
      const q2 = q * q;
      let s;
      do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    for (let q = 0, k = 0; q < length; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      grid[offset + q * stride] = f[r] + (q - r) * (q - r);
    }
  }
  function edt(data, width, height, f, v, z) {
    for (let x = 0; x < width; x++) edt1d(data, x, width, height, f, v, z);
    for (let y = 0; y < height; y++) edt1d(data, y * width, 1, width, f, v, z);
  }
  function alphaToSignedDistance(alpha, width, height, flipY) {
    const size = width * height;
    const gridOuter = new Float64Array(size);
    const gridInner = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const a = alpha[i] / 255;
      if (a === 1) { gridOuter[i] = 0; gridInner[i] = INF; }
      else if (a === 0) { gridOuter[i] = INF; gridInner[i] = 0; }
      else { const d = Math.max(0, 0.5 - a); gridOuter[i] = d * d; const e = Math.max(0, a - 0.5); gridInner[i] = e * e; }
    }
    const max = Math.max(width, height);
    const f = new Float64Array(max);
    const v = new Int32Array(max);
    const z = new Float64Array(max + 1);
    edt(gridOuter, width, height, f, v, z);
    edt(gridInner, width, height, f, v, z);
    const out = new Float32Array(size);
    let mostInterior = 0; // most-negative SDF value = -(stroke half-width), in px
    for (let y = 0; y < height; y++) {
      const srcRow = y * width;
      const dstRow = (flipY ? height - 1 - y : y) * width;
      for (let x = 0; x < width; x++) {
        const v = Math.sqrt(gridOuter[srcRow + x]) - Math.sqrt(gridInner[srcRow + x]);
        out[dstRow + x] = v;
        if (v < mostInterior) mostInterior = v;
      }
    }
    // The thickest stroke's half-width (px). Used to keep glass thickness relative
    // to the actual letterform so a fixed slider value never overflows a thin
    // stroke (the #1 "thickness 翻车"). Stashed on the array for the caller.
    out.maxInteriorPx = -mostInterior;
    return out;
  }
  function rasterizeText(opts) {
    const canvas = document.createElement("canvas");
    canvas.width = opts.width; canvas.height = opts.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, opts.width, opts.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = (opts.fontWeight || 700) + " " + opts.fontSize + "px " + (opts.fontFamily || "sans-serif");
    if ("letterSpacing" in ctx) ctx.letterSpacing = (opts.letterSpacing || 0) + "px";
    const lines = String(opts.text).split("\n");
    const lh = opts.fontSize * (opts.lineHeight || 1.1);
    const startY = -(lh * lines.length) / 2 + lh / 2;
    ctx.save();
    ctx.translate(opts.width / 2, opts.height / 2);
    ctx.rotate(((opts.rotationDeg || 0) * Math.PI) / 180);
    lines.forEach((line, i) => ctx.fillText(line, 0, startY + i * lh));
    ctx.restore();
    const img = ctx.getImageData(0, 0, opts.width, opts.height);
    const alpha = new Uint8Array(opts.width * opts.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3];
    return { alpha, width: opts.width, height: opts.height };
  }
  // Any image becomes glass: the alpha channel is the shape mask, fed into the
  // same EDT -> SDF -> shader pipeline as text. Flat images with no usable
  // alpha (a JPEG logo on white paper) fall back to a luminance mask, so a
  // dark-on-light logo works without preparation.
  // Built-in shapes are drawn as vector paths at the target resolution on every
  // rebuild — no bitmap rescale, so the mask edge stays crisp at any export size.
  // "squircle" is the Apple-icon superellipse (|x|^n + |y|^n = 1, n = 5), the
  // same family liquid-glass-studio uses for its demo shapes.
  function traceBuiltinShape(ctx, kind, h) {
    ctx.beginPath();
    if (kind === "circle") {
      ctx.arc(0, 0, h / 2, 0, Math.PI * 2);
    } else if (kind === "capsule") {
      const w = h * 1.9;
      ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    } else { // squircle
      const n = 5, a = h / 2, SEG = 180;
      for (let i = 0; i <= SEG; i++) {
        const t = (i / SEG) * Math.PI * 2;
        const ct = Math.cos(t), st = Math.sin(t);
        const x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n) * a;
        const y = Math.sign(st) * Math.pow(Math.abs(st), 2 / n) * a;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }
  function rasterizeShape(opts) {
    const c = document.createElement("canvas");
    c.width = opts.width; c.height = opts.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(((opts.rotationDeg || 0) * Math.PI) / 180);
    if (opts.kind) {
      ctx.fillStyle = "#fff";
      traceBuiltinShape(ctx, opts.kind, opts.sizePx);
      ctx.fill();
    } else {
      const iw = opts.image.naturalWidth || opts.image.width || 1;
      const ih = opts.image.naturalHeight || opts.image.height || 1;
      const s = opts.sizePx / Math.max(1, ih);
      ctx.drawImage(opts.image, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
    }
    ctx.restore();
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const alpha = new Uint8Array(c.width * c.height);
    let minDrawnAlpha = 255;
    for (let i = 0; i < alpha.length; i++) {
      const a = img.data[i * 4 + 3];
      alpha[i] = a;
      if (a > 0 && a < minDrawnAlpha) minDrawnAlpha = a;
    }
    if (!opts.kind && minDrawnAlpha >= 250) {
      // opaque rectangle — no alpha information; dark pixels are the shape,
      // with a soft luminance ramp so the EDT still sees an anti-aliased edge
      // (built-in shapes never take this path: their alpha IS the mask)
      for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] === 0) continue;
        const lum = 0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2];
        alpha[i] = lum <= 140 ? 255 : lum >= 200 ? 0 : Math.round(((200 - lum) / 60) * 255);
      }
    }
    return { alpha, width: c.width, height: c.height };
  }
  function gaussianWeights(radius) {
    const sigma = Math.max(radius / 3, 0.0001);
    const w = []; let sum = 0;
    for (let i = 0; i <= radius; i++) { const val = Math.exp((-0.5 * (i * i)) / (sigma * sigma)); w.push(val); sum += i === 0 ? val : val * 2; }
    return w.map((x) => x / sum);
  }

  // ------------------------------------------------------------------
  // 2) WebGL2 multi-pass renderer
  // ------------------------------------------------------------------
  const VERT = "#version 300 es\nin vec2 a_position;\nout vec2 v_uv;\nvoid main(){ v_uv = a_position*0.5+0.5; gl_Position=vec4(a_position,0.0,1.0); }";

  const LAYER_SHADER_CASES = Array.from({ length: MAX_LAYERS - 1 }, (_, index) => {
    const i = index + 1;
    return "  if (idx == " + i + ") return texture(u_sdf[" + i + "], uv - u_sdfOffset[" + i + "]).r;";
  }).join("\n");
  // Liquid merge: layers that share a merge group (u_mergeGroup = index of the
  // group's first layer, -1 = not merging) are read as ONE smooth-union field
  // (polynomial smin, k in raster px), so nearby glass flows together the way
  // MB Liquid Glass's Blob Merge does. Each group is evaluated once per sample
  // (at its first layer) and reused. With no groups every layer reads its own
  // field and the stack rule below is exactly the previous min/override pair:
  // the lowest distance wins, then any later layer covering the point (<= 1px)
  // stacks on top — which keeps text-in-shape readable while merging is on.
  const UNION_SD = "\nuniform sampler2D u_sdf[" + MAX_LAYERS + "];\nuniform vec2 u_sdfOffset[" + MAX_LAYERS + "];\nuniform int u_layerCount;\nuniform int u_layerMode[" + MAX_LAYERS + "];\nuniform int u_mergeGroup[" + MAX_LAYERS + "];\nuniform float u_mergeK;\nfloat layerSD(vec2 uv, int idx){\n"
    + LAYER_SHADER_CASES
    + "\n  return texture(u_sdf[0], uv - u_sdfOffset[0]).r;\n}\n"
    + "float smoothMergeH(float a, float b){ return clamp(0.5 + 0.5*(a - b)/u_mergeK, 0.0, 1.0); }\n"
    + "float groupSD(vec2 uv, int g){ float d = 1e5; bool first = true;\n"
    + "  for (int j=0;j<" + MAX_LAYERS + ";j++){ if (j >= u_layerCount) break; if (u_mergeGroup[j] != g) continue; float v = layerSD(uv, j);\n"
    + "    if (first) { d = v; first = false; } else { float h = smoothMergeH(v, d); d = mix(v, d, h) - u_mergeK*h*(1.0-h); } }\n"
    + "  return d; }\n"
    + "float effSD(vec2 uv, int idx){ int g = u_mergeGroup[idx]; return g < 0 ? layerSD(uv, idx) : groupSD(uv, g); }\n"
    + "float stackSDIdx(vec2 uv, out int idx){ float e[" + MAX_LAYERS + "]; float d = 1e5; idx = 0;\n"
    + "  for (int i=0;i<" + MAX_LAYERS + ";i++){ if (i >= u_layerCount) break; int g = u_mergeGroup[i]; float v = g < 0 ? layerSD(uv, i) : (g == i ? groupSD(uv, g) : e[g]); e[i] = v; if (i == 0 || v < d) { d = v; idx = i; } }\n"
    + "  for (int i=1;i<" + MAX_LAYERS + ";i++){ if (i >= u_layerCount) break; if (e[i] <= 1.0) { d = e[i]; idx = i; } }\n"
    + "  return d; }\n"
    + "float unionSD(vec2 uv){ float d = 1e5;\n"
    + "  for (int i=0;i<" + MAX_LAYERS + ";i++){ if (i >= u_layerCount) break; int g = u_mergeGroup[i]; if (g >= 0 && g != i) continue; d = min(d, g < 0 ? layerSD(uv, i) : groupSD(uv, g)); }\n"
    + "  return d; }";

  // The backdrop pass is the photo only (cover crop, motion zoom/pan). The
  // drop shadow is composited in the main pass, outside the glass, so what
  // the glass refracts is never darkened.
  const BG_FRAG = "#version 300 es\nprecision highp float;\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_image;\nuniform vec2 u_resolution;\nuniform float u_imageAspect;\nuniform float u_bgZoom;\nuniform vec2 u_bgPan;\nvec2 cover(vec2 uv, float ca, float ta){ if (ca>ta){ float s=ta/ca; uv.y=uv.y*s+0.5-0.5*s; } else { float s=ca/ta; uv.x=uv.x*s+0.5-0.5*s; } return uv; }\nvoid main(){\n  vec2 uv = cover(v_uv, u_resolution.x/u_resolution.y, u_imageAspect);\n  uv = (uv - 0.5) / max(u_bgZoom, 0.001) + 0.5 + u_bgPan;\n  fragColor = vec4(texture(u_image, uv).rgb, 1.0);\n}";

  const BLUR_FRAG = "#version 300 es\nprecision highp float;\n#define MAX_R 96\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_tex;\nuniform vec2 u_resolution;\nuniform vec2 u_dir;\nuniform int u_radius;\nuniform float u_weights[MAX_R + 1];\nvoid main(){\n  vec2 texel = 1.0/u_resolution;\n  vec4 c = texture(u_tex, v_uv) * u_weights[0];\n  for (int i=1;i<=MAX_R;i++){ if (i>u_radius) break; vec2 o = u_dir*texel*float(i); c += texture(u_tex, v_uv+o)*u_weights[i]; c += texture(u_tex, v_uv-o)*u_weights[i]; }\n  fragColor = c;\n}";

  // Liquid surface — a wave field the glass and the cover can lie under.
  // The simulation is the height-field scheme of jquery.ripples (Pim
  // Schreurs, MIT License; https://github.com/sirxemic/jquery.ripples): two
  // float textures ping-pong height (r) and velocity (g); each step pulls a
  // cell toward the mean of its four neighbours and damps it, and a drop adds
  // a cosine bump. Here it is not a separate effect: the field is one more
  // input to the same optical model. Its slope tilts the glass dome before
  // Snell's law, its curvature focuses light on the photo (caustics), and a
  // crest that faces the light glints. The idea of letting motion feed the
  // spectral split comes from liquid-refraction-lab's chromatic-aberration
  // layer; here the split grows with the local wave slope instead of the
  // pointer's speed, so a still frame exports exactly as it is seen.
  // The grid lives in design space (RIPPLE_GRID cells on the long side), so
  // preview, 4x export and video read the same field.
  //
  // RIPPLE_STEP_FRAG and RIPPLE_DROP_FRAG adapt jquery.ripples:
  //   Copyright (c) 2017 Pim Schreurs. Permission is hereby granted, free of
  //   charge, to any person obtaining a copy of this software and associated
  //   documentation files (the "Software"), to deal in the Software without
  //   restriction, including without limitation the rights to use, copy,
  //   modify, merge, publish, distribute, sublicense, and/or sell copies of
  //   the Software, and to permit persons to whom the Software is furnished to
  //   do so, subject to the following conditions: The above copyright notice
  //   and this permission notice shall be included in all copies or
  //   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
  //   WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
  //   LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
  //   PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
  //   HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
  //   AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
  //   CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  const RIPPLE_GRID = 384;
  const RIPPLE_STEP_FRAG = "#version 300 es\nprecision highp float;\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_state;\nuniform vec2 u_texel;\nuniform float u_damping;\nvoid main(){\n  vec4 s = texture(u_state, v_uv);\n  vec2 dx = vec2(u_texel.x, 0.0); vec2 dy = vec2(0.0, u_texel.y);\n  float avg = (texture(u_state, v_uv - dx).r + texture(u_state, v_uv - dy).r + texture(u_state, v_uv + dx).r + texture(u_state, v_uv + dy).r) * 0.25;\n  s.g += (avg - s.r) * 2.0;\n  s.g *= u_damping;\n  s.r += s.g;\n  fragColor = s;\n}";
  const RIPPLE_DROP_FRAG = "#version 300 es\nprecision highp float;\n#define PI 3.14159265359\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_state;\nuniform vec2 u_center;\nuniform vec2 u_scale;\nuniform float u_radius;\nuniform float u_strength;\nvoid main(){\n  vec4 s = texture(u_state, v_uv);\n  float d = max(0.0, 1.0 - length((v_uv - u_center) * u_scale) / u_radius);\n  d = 0.5 - cos(d * PI) * 0.5;\n  s.r += d * u_strength;\n  fragColor = s;\n}";
  // Shared by the main pass: x/y = surface slope (gain applied), z = the
  // curvature that focuses light. A Blinn glint needs a crest tilted ~25°
  // toward the light, so a calm surface never sparkles.
  const LIQUID_GLSL = "uniform sampler2D u_ripple;\nuniform int u_liquidMode;\nuniform float u_ripGain;\nuniform vec2 u_ripTexel;\nuniform float u_waterDepth;\n"
    // Slope is a one-cell central difference; curvature is taken across two
    // cells, which is blind to the scheme's lingering one-cell checkerboard
    // (a one-cell Laplacian turns it into a dot screen on the photo).
    + "float ripH(vec2 uv){ return texture(u_ripple, uv).r; }\n"
    + "vec3 ripField(vec2 uv){ if (u_liquidMode == 0) return vec3(0.0);\n"
    + "  vec2 ex = vec2(u_ripTexel.x, 0.0); vec2 ey = vec2(0.0, u_ripTexel.y);\n"
    + "  vec2 g = vec2(ripH(uv + ex) - ripH(uv - ex), ripH(uv + ey) - ripH(uv - ey)) * 0.5;\n"
    + "  float lap = (ripH(uv + 2.0*ex) + ripH(uv - 2.0*ex) + ripH(uv + 2.0*ey) + ripH(uv - 2.0*ey) - 4.0*ripH(uv)) * 0.25;\n"
    + "  return vec3(g, lap) * u_ripGain; }\n"
    // Blinn glint from a high light (60° up) along the Light Angle, minus
    // what a flat surface would return, so calm water never glows.
    + "float ripGlint(vec2 g){ if (u_liquidMode == 0) return 0.0; vec3 nr = normalize(vec3(-g, 1.0)); vec3 H = normalize(normalize(vec3(u_lightDir*0.5, 0.866)) + vec3(0.0, 0.0, 1.0));\n"
    + "  float flat0 = pow(H.z, 140.0); return max(pow(max(dot(nr, H), 0.0), 140.0) - flat0, 0.0) / (1.0 - flat0); }\n"
    // How far whole-cover water displaces what lies under it at uv (0 unless
    // the mode is whole cover): shared by the photo and the subject.
    + "vec2 waterOffset(vec2 uv){ if (u_liquidMode != 2) return vec2(0.0); vec3 r = ripField(uv); vec3 nw = normalize(vec3(-r.xy, 1.0)); vec3 Tw = refract(vec3(0.0, 0.0, -1.0), nw, 1.0/1.333); return Tw.xy / max(-Tw.z, 0.2) * u_waterDepth * u_dpr / u_resolution; }\n";

  // Glass material v3 — an optical model rather than a stack of looks.
  //  • Surface: a convex squircle dome over a bezel of width Depth
  //    (h(x) = (1-(1-x)^4)^(1/4), x = depth/bezel): steep at the rim, flat in
  //    the middle, so the centre stays clear and the bend gathers at the edge.
  //  • Refraction: Snell's law through that surface (glass n = 1.5) down to the
  //    backdrop plane; the displacement is in design px, so preview ≡ export.
  //  • Light: a thin rim specular on the side facing the light and, weaker, on
  //    the opposite rim (light passing through reflects off the far wall), a
  //    Schlick Fresnel lift on the steep bezel, and a faint inner glow — the
  //    Apple/Sketch grammar of Light angle / intensity / splay. No broad glare
  //    band, no LCH wash: those are what read as plastic or metal.
  //  • Surface: frost (pre-blur), tint, Sketch's Brightness and Saturation.
  //  • The drop shadow falls outside the glass only; the backdrop the glass
  //    refracts is never darkened, so no dirty ring gathers inside the rim.
  const MAIN_FRAG = "#version 300 es\nprecision highp float;\n#define PI 3.14159265359\n#define SPEC_N 12\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_bg;\nuniform sampler2D u_blurredBg;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform float u_refThickness[" + MAX_LAYERS + "];\nuniform float u_refraction;\nuniform float u_refDispersion;\nuniform vec2 u_lightDir;\nuniform float u_lightIntensity;\nuniform float u_splay;\nuniform float u_brightness;\nuniform float u_saturationFactor;\nuniform float u_bodyFactor;\nuniform vec4 u_tint[" + MAX_LAYERS + "];\nuniform vec2 u_layerCenter[" + MAX_LAYERS + "];\nuniform float u_magnify;\nuniform float u_shadowExpand;\nuniform float u_shadowFactor;\nuniform vec2 u_shadowOffset;\n" + LIQUID_GLSL + UNION_SD + "\n"
    // Continuous spectral split: the edge bend is integrated over SPEC_N
    // wavelengths (400-700nm, stratified with a per-pixel interleaved-gradient
    // jitter so large splits read as a smooth spectrum rather than stepped
    // copies), folded back to RGB with colour-matching bumps normalised per
    // channel (white stays white). fa = 0 is a single sample.
    + "vec3 specW(float t){ float l = 400.0 + 300.0*t; float r = exp(-pow((l-605.0)/55.0,2.0)) + 0.22*exp(-pow((l-425.0)/22.0,2.0)); float g = exp(-pow((l-540.0)/50.0,2.0)); float b = exp(-pow((l-450.0)/38.0,2.0)); return vec3(r,g,b); }\n"
    + "vec3 disp(vec2 base, vec2 off, float fa){\n"
    + "  if (fa <= 0.0) return texture(u_blurredBg, base+off).rgb;\n"
    + "  vec3 acc = vec3(0.0); vec3 wsum = vec3(0.0);\n"
    + "  float jit = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));\n"
    + "  for (int s=0;s<SPEC_N;s++){ float t = (float(s)+jit)/float(SPEC_N); vec2 o = base + off*(1.0 + 0.012*fa*(2.0*t-1.0)); vec3 w = specW(t); acc += texture(u_blurredBg, o).rgb*w; wsum += w; }\n"
    + "  return acc/max(wsum, vec3(1e-4)); }\n"
    // Merged glass carries its material through the bridge: tint, depth and
    // the magnification centre are blended with the same smin weight as the
    // distance, so two differently sized pieces meet without a seam.
    + "void groupAttr(vec2 uv, int g, inout vec4 tint, inout float thick, inout vec2 centre){ float d = 1e5; bool first = true;\n"
    + "  for (int j=0;j<" + MAX_LAYERS + ";j++){ if (j >= u_layerCount) break; if (u_mergeGroup[j] != g) continue; float v = layerSD(uv, j);\n"
    + "    if (first) { d = v; tint = u_tint[j]; thick = u_refThickness[j]; centre = u_layerCenter[j]; first = false; }\n"
    + "    else { float h = smoothMergeH(v, d); d = mix(v, d, h) - u_mergeK*h*(1.0-h); tint = mix(u_tint[j], tint, h); thick = mix(u_refThickness[j], thick, h); centre = mix(u_layerCenter[j], centre, h); } } }\n"
    // Outside-only drop shadow: a soft falloff from the offset silhouette.
    + "float dropShadow(){ if (u_shadowFactor <= 0.0) return 0.0; vec2 off = u_shadowOffset * u_dpr / u_resolution; float s = unionSD(v_uv - off) / u_dpr; float k = 1.0 - smoothstep(-u_shadowExpand*0.25, u_shadowExpand, s); return k*k*0.55*u_shadowFactor; }\n"
    + "void main(){\n"
    // The liquid surface: slope (xy) and curvature (z) of the wave field.
    // Whole-cover water lies over the photo, so the backdrop — and what the
    // glass refracts — is first bent by it (n = 1.333), split by wavelength
    // at the steep crests, brightened where the surface focuses light
    // (caustics) and glinting where a crest faces the light.
    + "  vec3 rip = ripField(v_uv);\n"
    // Liquid glass is moved by the water it is made of: the silhouette is
    // read a few px down the wave slope, so edges sway as a wave passes and
    // settle back exactly when the surface is calm.
    + "  vec2 suv = v_uv - rip.xy * 6.0 * u_dpr / u_resolution;\n"
    + "  int layer; float sd = stackSDIdx(suv, layer);\n"
    + "  vec2 wOff = vec2(0.0); vec3 bg;\n"
    + "  if (u_liquidMode == 2) {\n"
    + "    wOff = waterOffset(v_uv);\n"
    + "    float wc = 0.012 * u_refDispersion * (1.0 + 6.0*length(rip.xy));\n"
    + "    bg = vec3(texture(u_bg, v_uv + wOff*(1.0 + wc)).r, texture(u_bg, v_uv + wOff).g, texture(u_bg, v_uv + wOff*(1.0 - wc)).b);\n"
    + "    bg *= clamp(1.0 - rip.z * u_waterDepth * 0.03, 0.72, 1.45);\n"
    + "  } else { bg = texture(u_bg, v_uv).rgb; }\n"
    + "  vec3 outside = bg * (1.0 - dropShadow());\n"
    + "  float aa = 1.0;\n"
    + "  vec4 tint = u_tint[layer]; float thick = u_refThickness[layer]; vec2 centre = u_layerCenter[layer];\n"
    + "  if (u_mergeGroup[layer] >= 0) groupAttr(suv, u_mergeGroup[layer], tint, thick, centre);\n"
    + "  vec3 result;\n"
    + "  if (sd > aa) { result = outside; } else if (u_layerMode[layer] == 1) {\n"
    + "    result = mix(tint.rgb, outside, smoothstep(-aa, aa, sd));\n"
    + "  } else {\n"
    + "    float sdCss = sd/u_dpr; float depth = max(-sdCss, 0.0);\n"
    + "    float B = max(thick, 1.0); float x = clamp(depth/B, 0.0, 1.0); float u = 1.0 - x;\n"
    + "    float hgt = pow(max(1.0 - u*u*u*u, 0.0), 0.25);\n"
    + "    float slope = min(0.5 * u*u*u * pow(max(1.0 - u*u*u*u, 1e-4), -0.75), 6.0);\n"  /* dome height = half the bezel */
    // The bend direction comes from a 3px central-difference gradient: the
    // pixel-scale SDF normal carries enough noise that a strong bend turns it
    // into radial streaks. The same wide gradient collapses toward 0 on a
    // skeleton ridge (a merged neck, a hairline stroke), where the two sides'
    // bends would otherwise flip in one pixel, so the bend fades across it.
    + "    vec2 rw = vec2(3.0*u_dpr)/u_resolution; vec2 gw = vec2(effSD(suv+vec2(rw.x,0.0),layer)-effSD(suv-vec2(rw.x,0.0),layer), effSD(suv+vec2(0.0,rw.y),layer)-effSD(suv-vec2(0.0,rw.y),layer)) / (6.0*u_dpr);\n"
    + "    float gwl = length(gw); vec2 Nr = gwl > 1e-4 ? gw/gwl : vec2(0.0); float rf = smoothstep(0.35, 0.95, gwl);\n"
    + "    vec3 n = normalize(vec3(Nr*slope*rf, 1.0));\n"
    + "    vec3 T = refract(vec3(0.0, 0.0, -1.0), n, 1.0/1.5);\n"
    + "    float z = B*(0.18 + 0.5*hgt);\n"  /* glass above the backdrop at this point, design px */
    + "    vec2 dCss = T.xy / max(-T.z, 0.2) * z * u_refraction;\n"
    + "    vec2 off = dCss * rf * u_dpr / u_resolution;\n"
    // A liquid surface tilts the dome by the wave slope. Only the change it
    // makes is added, so a calm surface leaves the glass exactly as it was.
    + "    if (u_liquidMode > 0) { vec3 nl = normalize(vec3(Nr*slope*rf - rip.xy, 1.0)); vec3 Tl = refract(vec3(0.0, 0.0, -1.0), nl, 1.0/1.5);\n"
    + "      off += (Tl.xy / max(-Tl.z, 0.2) - T.xy / max(-T.z, 0.2)) * z * u_refraction * u_dpr / u_resolution; }\n"
    // Magnification (MB's Glass Optics > Magnification): the backdrop seen
    // through the glass is scaled about the glass centre; 1 = unchanged, 2 =
    // 200%, negative mirrors it. Only the backdrop moves.
    + "    float mg = u_magnify < 0.0 ? min(u_magnify, -0.05) : max(u_magnify, 0.05);\n"
    + "    vec2 base = centre + (v_uv - centre) / mg + wOff;\n"
    + "    vec3 col = disp(base, off, u_refDispersion * (1.0 + 6.0*length(rip.xy)));\n"
    + "    col = mix(col, tint.rgb, tint.a*0.8);\n"
    /* saturationFactor is Sketch/Apple's Glass Saturation: 1.0 = unchanged, <1
       desaturates, >1 boosts (mix extrapolates past the colour). Brightness
       lifts toward white or scales toward black. */
    + "    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));\n"
    + "    col = max(mix(vec3(luma), col, max(u_saturationFactor, 0.0)), 0.0);\n"
    + "    col = u_brightness >= 0.0 ? mix(col, vec3(1.0), u_brightness*0.6) : col*(1.0 + u_brightness);\n"
    + "    float body = smoothstep(0.5, max(2.0, min(thick*0.22, 8.0)), depth) * u_bodyFactor;\n"
    + "    col = mix(col, vec3(1.0), clamp(body, 0.0, 0.78));\n"
    // Light: rim specular (both rims, facing side stronger), Fresnel on the
    // steep bezel, faint inner glow on the lit side.
    // The rim is two things, as on Apple's glass clock: a crisp ~1px
    // hairline all the way round (stronger where the light hits), and a
    // softer directional band whose width and angular spread follow Splay.
    // On moving water the rim light follows the tilted surface, so the
    // highlight runs along the edge with each wave.
    + "    vec2 Nl = Nr; if (u_liquidMode > 0) { vec2 q = Nr - rip.xy*0.8; float ql = length(q); Nl = ql > 1e-4 ? q/ql : Nr; }\n"
    + "    float ndl = dot(Nl, u_lightDir);\n"
    + "    float lobe = mix(14.0, 1.6, u_splay);\n"
    + "    float dirL = pow(max(ndl, 0.0), lobe) + 0.6*pow(max(-ndl, 0.0), lobe);\n"
    + "    float hair = exp(-depth/0.55);\n"
    + "    float band = exp(-depth/mix(1.2, 6.0, u_splay)) * rf;\n"
    + "    float spec = hair*(0.45 + 0.55*dirL) + band*0.7*dirL + ripGlint(rip.xy)*0.6;\n"
    + "    float fres = 0.04 + 0.96*pow(1.0 - n.z, 5.0);\n"
    + "    float glow = u*u*max(ndl, 0.0)*rf*0.10;\n"
    + "    col = mix(col, vec3(1.0), clamp((fres*0.25 + glow)*u_lightIntensity, 0.0, 1.0));\n"
    // Reflection consumes the light left after Fresnel/body/tint. An additive
    // white rim clipped several channels to 1.0, losing the backdrop's detail.
    + "    float reflection = 1.0 - exp(-max(spec*u_lightIntensity, 0.0));\n"
    + "    col = mix(col, vec3(1.0), reflection);\n"
    + "    result = mix(min(col, vec3(1.0)), outside, smoothstep(-aa, aa, sd));\n"
    + "  }\n"
    // Under whole-cover water the subject is bent with the photo it was cut
    // from (no ghost of the photo's own copy beside it), and the glints sit
    // on the surface above everything.
    + "  vec3 fin = result;\n"
    + "  if (u_liquidMode == 2) fin = mix(fin, vec3(1.0), clamp(ripGlint(rip.xy) * u_lightIntensity * 0.8, 0.0, 1.0));\n"
    + "  fragColor = vec4(fin, 1.0);\n"
    + "}";

  // Post Blur (MB's second blur stage): the finished glass composite is
  // softened inside the glass silhouette only, after refraction, Fresnel and
  // glare — the pre-blur (Background Blur) frosts what the glass sees, this
  // frosts the glass itself. Solid layers and the foreground subject stay
  // sharp: the subject is laid over here instead of in the main pass.
  const COMP_FRAG = "#version 300 es\nprecision highp float;\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_sharp;\nuniform sampler2D u_soft;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform vec2 u_lightDir;\n" + LIQUID_GLSL + UNION_SD
    + "void main(){ int layer; float sd = stackSDIdx(v_uv, layer); vec3 c = texture(u_sharp, v_uv).rgb;\n"
    + "  float m = u_layerMode[layer] == 1 ? 0.0 : 1.0 - smoothstep(-1.0, 1.0, sd);\n"
    + "  c = mix(c, texture(u_soft, v_uv).rgb, m);\n"
    + "  fragColor = vec4(c, 1.0); }";

  // The layer stack (see liquid-cover-model.js compositingPlan). The plan is
  // drawn by two programs: one lays a picture over what has been drawn so far
  // (a blend mode, an opacity, an optional mask, an optional clip to the layer
  // below), the other changes what has been drawn so far (brightness/contrast,
  // hue/saturation, or the blurred copy of it). The same two programs run for
  // the preview and for the PNG export.
  //
  // Placement: "cover" fills the frame the way the backdrop always has;
  // "registered" lands a cut-out made from the background photo on its own
  // pixels through the backdrop's crop, zoom and pan; "free" is a picture of
  // its own size, positioned, scaled and rotated.
  const PLACE_GLSL = "uniform vec2 u_resolution;\nuniform float u_dpr;\nuniform vec2 u_lightDir;\nuniform float u_bgAspect;\nuniform float u_bgZoom;\nuniform vec2 u_bgPan;\n"
    + "float placeUV(vec2 uv, int mode, float aspect, vec2 pos, float scale, float rot, out vec2 fuv){\n"
    + "  float A = u_resolution.x/u_resolution.y;\n"
    + "  if (mode == 0) { vec2 q = uv; if (A > aspect) { float s = aspect/A; q.y = q.y*s + 0.5 - 0.5*s; } else { float s = A/aspect; q.x = q.x*s + 0.5 - 0.5*s; }\n"
    + "    fuv = (q - 0.5)/max(u_bgZoom, 0.001) + 0.5 + u_bgPan; return 1.0; }\n"
    + "  if (mode == 1) { vec2 q = (uv - pos)/max(scale, 0.001) + 0.5;\n"
    + "    if (A > u_bgAspect) { float k = u_bgAspect/A; q.y = q.y*k + 0.5 - 0.5*k; } else { float k = A/u_bgAspect; q.x = q.x*k + 0.5 - 0.5*k; }\n"
    + "    fuv = (q - 0.5)/max(u_bgZoom, 0.001) + 0.5 + u_bgPan; }\n"
    + "  else { vec2 px = (uv - pos) * vec2(A, 1.0); float c = cos(rot), s = sin(rot); px = vec2(c*px.x - s*px.y, s*px.x + c*px.y);\n"
    + "    fuv = px / vec2(max(scale*aspect, 0.0001), max(scale, 0.0001)) + 0.5; }\n"
    + "  return (fuv.x >= 0.0 && fuv.x <= 1.0 && fuv.y >= 0.0 && fuv.y <= 1.0) ? 1.0 : 0.0; }\n";
  const LAYER_FRAG = "#version 300 es\nprecision highp float;\nin vec2 v_uv;\nout vec4 fragColor;\n"
    + "uniform sampler2D u_dst;\nuniform sampler2D u_src;\nuniform sampler2D u_mask;\nuniform sampler2D u_clipSrc;\nuniform sampler2D u_clipMask;\n"
    + "uniform int u_hasMask;\nuniform int u_hasClip;\nuniform int u_clipHasMask;\nuniform int u_blend;\nuniform float u_opacity;\nuniform int u_water;\n"
    + "uniform int u_mode;\nuniform float u_aspect;\nuniform vec2 u_pos;\nuniform float u_scale;\nuniform float u_rot;\n"
    + "uniform int u_cMode;\nuniform float u_cAspect;\nuniform vec2 u_cPos;\nuniform float u_cScale;\nuniform float u_cRot;\n"
    + PLACE_GLSL + LIQUID_GLSL
    + "vec3 blendFn(int mode, vec3 cb, vec3 cs){\n"
    + "  if (mode == 1) return cb*cs;\n"
    + "  if (mode == 2) return cb + cs - cb*cs;\n"
    + "  if (mode == 3) return mix(2.0*cb*cs, 1.0 - 2.0*(1.0-cb)*(1.0-cs), step(vec3(0.5), cb));\n"
    + "  if (mode == 4) return min(cb, cs);\n"
    + "  if (mode == 5) return max(cb, cs);\n"
    + "  return cs; }\n"
    + "void main(){\n"
    // Under whole-cover water a picture is bent with the photo it lies on.
    + "  vec2 uv = v_uv; if (u_water == 1) uv += waterOffset(v_uv);\n"
    + "  vec4 d = texture(u_dst, v_uv);\n"
    + "  vec2 fuv; float inside = placeUV(uv, u_mode, u_aspect, u_pos, u_scale, u_rot, fuv);\n"
    + "  vec4 s = texture(u_src, clamp(fuv, 0.0, 1.0)) * inside;\n"
    + "  float m = u_hasMask == 1 ? texture(u_mask, clamp(fuv, 0.0, 1.0)).r : 1.0;\n"
    + "  float cov = 1.0;\n"
    + "  if (u_hasClip == 1) { vec2 cf; float cin = placeUV(uv, u_cMode, u_cAspect, u_cPos, u_cScale, u_cRot, cf);\n"
    + "    float ca = texture(u_clipSrc, clamp(cf, 0.0, 1.0)).a; float cm = u_clipHasMask == 1 ? texture(u_clipMask, clamp(cf, 0.0, 1.0)).r : 1.0; cov = ca * cm * cin; }\n"
    + "  float sa = s.a * u_opacity * m * cov;\n"
    + "  vec3 cs = s.a > 1e-5 ? s.rgb / s.a : vec3(0.0);\n"
    + "  float ab = d.a; vec3 cb = ab > 1e-5 ? d.rgb / ab : vec3(0.0);\n"
    + "  vec3 co = (1.0 - sa)*d.rgb + sa*(1.0 - ab)*cs + sa*ab*blendFn(u_blend, cb, cs);\n"
    + "  fragColor = vec4(co, sa + ab*(1.0 - sa)); }";
  const ADJUST_FRAG = "#version 300 es\nprecision highp float;\n#define PI 3.14159265359\nin vec2 v_uv;\nout vec4 fragColor;\n"
    + "uniform sampler2D u_dst;\nuniform sampler2D u_blur;\nuniform sampler2D u_clipSrc;\nuniform sampler2D u_clipMask;\n"
    + "uniform int u_type;\nuniform vec4 u_params;\nuniform float u_opacity;\nuniform int u_hasClip;\nuniform int u_clipHasMask;\n"
    + "uniform int u_cMode;\nuniform float u_cAspect;\nuniform vec2 u_cPos;\nuniform float u_cScale;\nuniform float u_cRot;\n"
    + PLACE_GLSL
    + "void main(){\n"
    + "  vec4 d = texture(u_dst, v_uv);\n"
    + "  vec3 c = d.a > 1e-5 ? d.rgb / d.a : d.rgb;\n"
    + "  vec4 out4 = d;\n"
    // brightness / contrast: params.x brightness, params.y contrast, both -1..1
    + "  if (u_type == 0) { float k = u_params.y >= 0.0 ? 1.0/(1.0 - u_params.y*0.99) : 1.0 + u_params.y;\n"
    + "    c = clamp((c - 0.5)*k + 0.5 + u_params.x*0.5, 0.0, 1.0); out4 = vec4(c*d.a, d.a); }\n"
    // hue / saturation / lightness: params.x degrees, params.y -1..1, params.z -1..1
    + "  else if (u_type == 1) { float h = u_params.x*PI/180.0; float cs = cos(h), sn = sin(h);\n"
    + "    mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);\n"
    + "    mat3 toRgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);\n"
    + "    vec3 y = toYiq * c; y.yz = vec2(y.y*cs - y.z*sn, y.y*sn + y.z*cs); c = toRgb * y;\n"
    + "    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(luma), c, 1.0 + u_params.y), 0.0);\n"
    + "    c = u_params.z >= 0.0 ? mix(c, vec3(1.0), u_params.z) : c*(1.0 + u_params.z); c = clamp(c, 0.0, 1.0); out4 = vec4(c*d.a, d.a); }\n"
    + "  else { out4 = texture(u_blur, v_uv); }\n"
    + "  float cov = 1.0;\n"
    + "  if (u_hasClip == 1) { vec2 cf; float cin = placeUV(v_uv, u_cMode, u_cAspect, u_cPos, u_cScale, u_cRot, cf);\n"
    + "    float ca = texture(u_clipSrc, clamp(cf, 0.0, 1.0)).a; float cm = u_clipHasMask == 1 ? texture(u_clipMask, clamp(cf, 0.0, 1.0)).r : 1.0; cov = ca * cm * cin; }\n"
    + "  fragColor = mix(d, out4, clamp(u_opacity * cov, 0.0, 1.0)); }";

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("LiquidCover shader: " + gl.getShaderInfoLog(sh));
    return sh;
  }
  function program(gl, v, f) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, v));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, f));
    gl.bindAttribLocation(p, 0, "a_position");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("LiquidCover link: " + gl.getProgramInfoLog(p));
    return p;
  }
  // HDR (RGBA16F) intermediate buffers when available — matches the official
  // liquid-glass-studio and removes banding in the blur / LCH glare. Falls back
  // to 8-bit if EXT_color_buffer_float is missing.
  function makeFBO(gl, w, h, hdr) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (hdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      // float attachment not renderable here — fall back to 8-bit
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  function Renderer(canvas) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl; this.canvas = canvas;
    this.hdr = !!gl.getExtension("EXT_color_buffer_float"); // HDR float intermediate buffers
    this.sdfLinear = !!gl.getExtension("OES_texture_float_linear"); // smooth SDF sampling (no ribbed edges)
    this.progBg = program(gl, VERT, BG_FRAG);
    this.progBlur = program(gl, VERT, BLUR_FRAG);
    this.progMain = program(gl, VERT, MAIN_FRAG);
    this.progComp = program(gl, VERT, COMP_FRAG);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.fboA = null; this.fboB = null; this.fboC = null; this.fboD = null;
    this.bgTex = null; this.bgAspect = 1;
    this.bgVideo = null; this.bgVideoFrameReady = false; this.bgVideoUploadError = false;
    this.pics = new Map(); this.masks = new Map(); // layer pictures and cut-out masks, by layer id
    this.progLayer = null; this.progAdjust = null;
    this.sdfTexs = new Array(MAX_LAYERS).fill(null);
    this.w = 0; this.h = 0;
    // The wave field needs float render targets; without them ripples stay off.
    this.rippleOK = this.hdr;
    this.ripA = null; this.ripB = null; this.ripW = 0; this.ripH = 0;
    this.progRipStep = null; this.progRipDrop = null;
  }
  // Allocates (or keeps) the wave field for a design size. A new aspect starts
  // calm: a field stretched to another shape would bend the cover wrongly.
  Renderer.prototype.rippleSize = function (designW, designH) {
    if (!this.rippleOK) return false;
    const gl = this.gl;
    const long = Math.max(designW, designH, 1);
    const gw = Math.max(8, Math.round(RIPPLE_GRID * designW / long));
    const gh = Math.max(8, Math.round(RIPPLE_GRID * designH / long));
    if (this.ripA && this.ripW === gw && this.ripH === gh) return true;
    if (!this.progRipStep) {
      this.progRipStep = program(gl, VERT, RIPPLE_STEP_FRAG);
      this.progRipDrop = program(gl, VERT, RIPPLE_DROP_FRAG);
    }
    [this.ripA, this.ripB].forEach((f) => { if (f) { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex); } });
    this.ripA = makeFBO(gl, gw, gh, true); this.ripB = makeFBO(gl, gw, gh, true);
    this.ripW = gw; this.ripH = gh;
    this.rippleReset();
    return true;
  };
  Renderer.prototype.rippleReset = function () {
    if (!this.ripA) return;
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    [this.ripA, this.ripB].forEach((f) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clear(gl.COLOR_BUFFER_BIT); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  Renderer.prototype._ripplePass = function (prog, setup) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.ripW, this.ripH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ripB.fbo);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ripA.tex);
    gl.uniform1i(this._u(prog, "u_state"), 0);
    setup(gl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const a = this.ripA; this.ripA = this.ripB; this.ripB = a;
  };
  // x, y in canvas uv (y up); radius as a fraction of the long side.
  Renderer.prototype.rippleDrop = function (x, y, radius, strength) {
    if (!this.ripA) return;
    const long = Math.max(this.ripW, this.ripH);
    this._ripplePass(this.progRipDrop, (gl) => {
      gl.uniform2f(this._u(this.progRipDrop, "u_center"), x, y);
      gl.uniform2f(this._u(this.progRipDrop, "u_scale"), this.ripW / long, this.ripH / long);
      gl.uniform1f(this._u(this.progRipDrop, "u_radius"), Math.max(radius, 1e-4));
      gl.uniform1f(this._u(this.progRipDrop, "u_strength"), strength);
    });
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  };
  Renderer.prototype.rippleStep = function (steps, damping) {
    if (!this.ripA) return;
    for (let i = 0; i < steps; i++) {
      this._ripplePass(this.progRipStep, (gl) => {
        gl.uniform2f(this._u(this.progRipStep, "u_texel"), 1 / this.ripW, 1 / this.ripH);
        gl.uniform1f(this._u(this.progRipStep, "u_damping"), damping);
      });
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  };
  Renderer.prototype._ensureFBOs = function (w, h) {
    if (this.w === w && this.h === h && this.fboA) return;
    const gl = this.gl;
    [this.fboA, this.fboB, this.fboC, this.fboD].forEach((f) => { if (f) { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex); } });
    this.fboA = makeFBO(gl, w, h, this.hdr); this.fboB = makeFBO(gl, w, h, this.hdr); this.fboC = makeFBO(gl, w, h, this.hdr);
    this.fboD = null;
    this.w = w; this.h = h;
  };
  // Post Blur needs one more full-size buffer (the sharp composite); it is
  // allocated on first use and dropped again when Post Blur returns to 0, so
  // an ordinary cover never pays for it — a 6000px HDR export buffer is ~190MB.
  Renderer.prototype._ensurePostFBO = function (on) {
    const gl = this.gl;
    if (on && !this.fboD) this.fboD = makeFBO(gl, this.w, this.h, this.hdr);
    if (!on && this.fboD) { gl.deleteFramebuffer(this.fboD.fbo); gl.deleteTexture(this.fboD.tex); this.fboD = null; }
  };
  Renderer.prototype.setBackground = function (image) {
    const gl = this.gl;
    if (this.bgTex) gl.deleteTexture(this.bgTex);
    this.bgVideo = null;
    this.bgVideoFrameReady = false;
    this.bgVideoUploadError = false;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bgTex = tex;
    this.bgAspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
  };
  Renderer.prototype.setBackgroundVideo = function (video) {
    const gl = this.gl;
    if (this.bgTex) gl.deleteTexture(this.bgTex);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([232, 238, 243, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bgTex = tex;
    this.bgVideo = video;
    this.bgVideoFrameReady = false;
    this.bgVideoUploadError = false;
    this.bgAspect = (video.videoWidth || video.width || 1) / (video.videoHeight || video.height || 1);
    this.updateBackgroundVideoFrame();
  };
  Renderer.prototype.updateBackgroundVideoFrame = function () {
    const gl = this.gl;
    const video = this.bgVideo;
    const minReady = (typeof HTMLMediaElement !== "undefined" && HTMLMediaElement.HAVE_CURRENT_DATA) || 2;
    if (!video || !this.bgTex || video.readyState < minReady || !video.videoWidth || !video.videoHeight) return false;
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      if (this.bgVideoFrameReady) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        this.bgVideoFrameReady = true;
      }
      this.bgAspect = video.videoWidth / video.videoHeight;
      this.bgVideoUploadError = false;
      return true;
    } catch (e) {
      // A video frame can be temporarily unavailable during seek/play transitions.
      this.bgVideoUploadError = true;
      return false;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  };
  // A picture on the stack. The texture is premultiplied, so filtering and
  // mipmaps never mix the colour of fully transparent pixels into a cut-out edge
  // (the halo). The mask is a separate greyscale texture in the picture's own
  // space: white keeps, black removes. Neither touches the other's pixels.
  Renderer.prototype.setPicture = function (id, image) {
    const gl = this.gl;
    this.removePicture(id);
    if (!image) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.pics.set(id, { tex, aspect: (image.naturalWidth || image.width) / (image.naturalHeight || image.height) });
  };
  Renderer.prototype.removePicture = function (id) {
    const old = this.pics.get(id);
    if (old) { this.gl.deleteTexture(old.tex); this.pics.delete(id); }
    this.removeMask(id);
  };
  Renderer.prototype.setMask = function (id, image) {
    const gl = this.gl;
    this.removeMask(id);
    if (!image) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.masks.set(id, tex);
  };
  Renderer.prototype.removeMask = function (id) {
    const old = this.masks.get(id);
    if (old) { this.gl.deleteTexture(old); this.masks.delete(id); }
  };
  Renderer.prototype.hasPicture = function (id) { return this.pics.has(id); };
  Renderer.prototype.setLayerSDF = function (i, sdf, w, h) {
    const gl = this.gl;
    if (this.sdfTexs[i]) gl.deleteTexture(this.sdfTexs[i]);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, sdf);
    // Linear filtering makes the distance field continuous between texels, so the
    // surface normal rotates smoothly along a curved edge instead of snapping to a
    // few angles (the ribbed/corrugated edge artifact). Falls back to NEAREST only
    // where float-linear is unsupported.
    const sdfFilter = this.sdfLinear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sdfFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sdfFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.sdfTexs[i] = tex;
  };
  Renderer.prototype.removeLayer = function (i) {
    const gl = this.gl;
    if (this.sdfTexs[i]) gl.deleteTexture(this.sdfTexs[i]);
    this.sdfTexs.splice(i, 1); this.sdfTexs.push(null);
  };
  Renderer.prototype._u = function (p, n) { return this.gl.getUniformLocation(p, n); };
  Renderer.prototype._bindLayers = function (p, count, base, meta) {
    const gl = this.gl; const fb = this.sdfTexs[0]; const units = [];
    for (let i = 0; i < MAX_LAYERS; i++) { gl.activeTexture(gl.TEXTURE0 + base + i); gl.bindTexture(gl.TEXTURE_2D, this.sdfTexs[i] || fb); units.push(base + i); }
    gl.uniform1iv(this._u(p, "u_sdf"), units);
    gl.uniform1i(this._u(p, "u_layerCount"), count);
    gl.uniform2fv(this._u(p, "u_sdfOffset"), meta.offsets);
    gl.uniform1iv(this._u(p, "u_layerMode"), meta.layerModes);
    gl.uniform1iv(this._u(p, "u_mergeGroup"), meta.mergeGroups);
    gl.uniform1f(this._u(p, "u_mergeK"), meta.mergeK);
  };
  Renderer.prototype._bindLiquid = function (p, unit, params) {
    const gl = this.gl;
    const mode = this.ripA ? (params.liquidMode | 0) : 0;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, mode ? this.ripA.tex : this.bgTex);
    gl.uniform1i(this._u(p, "u_ripple"), unit);
    gl.uniform1i(this._u(p, "u_liquidMode"), mode);
    gl.uniform1f(this._u(p, "u_ripGain"), params.liquidGain || 0);
    gl.uniform2f(this._u(p, "u_ripTexel"), 1 / Math.max(this.ripW, 1), 1 / Math.max(this.ripH, 1));
    gl.uniform1f(this._u(p, "u_waterDepth"), params.waterDepth || 0);
  };
  // ---- drawing the plan's steps ----------------------------------------
  const BLEND_INDEX = { normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5 };
  const ADJUST_INDEX = { brightnessContrast: 0, hueSaturation: 1, blur: 2 };
  const PLACE_INDEX = { cover: 0, registered: 1, free: 2 };
  const NEUTRAL_BASE = [0.91, 0.93, 0.953];
  Renderer.prototype._layerPrograms = function () {
    if (!this.progLayer) {
      this.progLayer = program(this.gl, VERT, LAYER_FRAG);
      this.progAdjust = program(this.gl, VERT, ADJUST_FRAG);
    }
  };
  // The texture, aspect and placement uniforms for a layer's picture. The
  // background layer is the renderer's own bgTex (it can be a video).
  Renderer.prototype._pictureFor = function (id, params) {
    if (id === params.bgLayerId) return this.bgTex ? { tex: this.bgTex, aspect: this.bgAspect } : null;
    return this.pics.get(id) || null;
  };
  Renderer.prototype._bindPlacement = function (p, prefix, placement, aspect, params) {
    const gl = this.gl;
    const names = prefix ? { mode: "u_cMode", aspect: "u_cAspect", pos: "u_cPos", scale: "u_cScale", rot: "u_cRot" }
      : { mode: "u_mode", aspect: "u_aspect", pos: "u_pos", scale: "u_scale", rot: "u_rot" };
    gl.uniform1i(this._u(p, names.mode), PLACE_INDEX[placement.mode] || 0);
    gl.uniform1f(this._u(p, names.aspect), aspect || 1);
    gl.uniform2f(this._u(p, names.pos), placement.x, placement.y);
    gl.uniform1f(this._u(p, names.scale), placement.scale);
    gl.uniform1f(this._u(p, names.rot), (placement.rotation || 0) * Math.PI / 180);
  };
  Renderer.prototype._bindBackdropRef = function (p, params) {
    const gl = this.gl;
    gl.uniform2f(this._u(p, "u_resolution"), this.w, this.h);
    gl.uniform1f(this._u(p, "u_dpr"), params.dpr || 1);
    gl.uniform2f(this._u(p, "u_lightDir"), Math.cos(params.lightAngle || 0), Math.sin(params.lightAngle || 0));
    gl.uniform1f(this._u(p, "u_bgAspect"), this.bgAspect);
    gl.uniform1f(this._u(p, "u_bgZoom"), params.bgZoom || 1);
    gl.uniform2f(this._u(p, "u_bgPan"), (params.bgPan && params.bgPan[0]) || 0, (params.bgPan && params.bgPan[1]) || 0);
  };
  Renderer.prototype._bindClip = function (p, step, params) {
    const gl = this.gl;
    const clip = step.clipTo;
    const base = clip ? this._pictureFor(clip.id, params) : null;
    gl.uniform1i(this._u(p, "u_hasClip"), base ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0 + 3); gl.bindTexture(gl.TEXTURE_2D, base ? base.tex : this.bgTex);
    gl.uniform1i(this._u(p, "u_clipSrc"), 3);
    const clipMask = clip && clip.hasMask ? this.masks.get(clip.id) : null;
    gl.uniform1i(this._u(p, "u_clipHasMask"), clipMask ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0 + 4); gl.bindTexture(gl.TEXTURE_2D, clipMask || this.bgTex);
    gl.uniform1i(this._u(p, "u_clipMask"), 4);
    if (base) this._bindPlacement(p, "c", clip.placement, base.aspect, params);
    else this._bindPlacement(p, "c", { mode: "cover", x: 0.5, y: 0.5, scale: 1, rotation: 0 }, 1, params);
  };
  Renderer.prototype._blurPass = function (srcTex, dstFbo, dir, weights) {
    const gl = this.gl;
    const radius = weights.length - 1;
    gl.useProgram(this.progBlur);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this._u(this.progBlur, "u_tex"), 0);
    gl.uniform2f(this._u(this.progBlur, "u_resolution"), this.w, this.h);
    gl.uniform2f(this._u(this.progBlur, "u_dir"), dir[0], dir[1]);
    gl.uniform1i(this._u(this.progBlur, "u_radius"), radius);
    gl.uniform1fv(this._u(this.progBlur, "u_weights"), weights);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  Renderer.prototype._liveSteps = function (steps, params) {
    return (steps || []).filter((step) => step.op === "adjust" || this._pictureFor(step.id, params));
  };
  // Draws `steps` over the image in `acc`. Each step reads the accumulated
  // image and writes the next one into a free buffer; the last may go straight
  // to the canvas. Returns the buffer holding the result (null when it went to
  // the canvas).
  Renderer.prototype._runSteps = function (steps, acc, free, toScreen, params) {
    const gl = this.gl;
    this._layerPrograms();
    const live = this._liveSteps(steps, params);
    live.forEach((step, index) => {
      const last = index === live.length - 1;
      const toCanvas = last && toScreen;
      gl.viewport(0, 0, this.w, this.h);
      if (step.op === "picture") {
        const pic = this._pictureFor(step.id, params);
        const p = this.progLayer;
        const dst = toCanvas ? null : free.pop();
        gl.useProgram(p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc.tex);
        gl.uniform1i(this._u(p, "u_dst"), 0);
        gl.activeTexture(gl.TEXTURE0 + 1); gl.bindTexture(gl.TEXTURE_2D, pic.tex);
        gl.uniform1i(this._u(p, "u_src"), 1);
        const mask = step.hasMask ? this.masks.get(step.id) : null;
        gl.uniform1i(this._u(p, "u_hasMask"), mask ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0 + 2); gl.bindTexture(gl.TEXTURE_2D, mask || this.bgTex);
        gl.uniform1i(this._u(p, "u_mask"), 2);
        gl.uniform1i(this._u(p, "u_blend"), BLEND_INDEX[step.blend] || 0);
        gl.uniform1f(this._u(p, "u_opacity"), step.opacity);
        gl.uniform1i(this._u(p, "u_water"), step.water ? 1 : 0);
        this._bindPlacement(p, "", step.placement, pic.aspect, params);
        this._bindClip(p, step, params);
        this._bindBackdropRef(p, params);
        this._bindLiquid(p, 5, params);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (dst) { free.push(acc); acc = dst; }
        return;
      }
      // adjustment
      const p = this.progAdjust;
      const adjust = step.adjust;
      let blurred = acc;
      let spare = null;
      if (adjust.type === "blur") {
        const radius = Math.max(1, Math.min(96, Math.round(adjust.radius * (params.blurScale || 1))));
        const weights = gaussianWeights(radius);
        const s1 = free.pop(), s2 = free.pop();
        this._blurPass(acc.tex, s1.fbo, [0, 1], weights);
        this._blurPass(s1.tex, s2.fbo, [1, 0], weights);
        blurred = s2; spare = s1;
      }
      const dst = toCanvas ? null : (spare || free.pop());
      gl.useProgram(p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc.tex);
      gl.uniform1i(this._u(p, "u_dst"), 0);
      gl.activeTexture(gl.TEXTURE0 + 1); gl.bindTexture(gl.TEXTURE_2D, blurred.tex);
      gl.uniform1i(this._u(p, "u_blur"), 1);
      gl.uniform1i(this._u(p, "u_type"), ADJUST_INDEX[adjust.type] || 0);
      gl.uniform4f(this._u(p, "u_params"),
        adjust.type === "hueSaturation" ? adjust.hue : (adjust.brightness || 0) / 100,
        adjust.type === "hueSaturation" ? (adjust.saturation || 0) / 100 : (adjust.contrast || 0) / 100,
        (adjust.lightness || 0) / 100, 0);
      gl.uniform1f(this._u(p, "u_opacity"), step.opacity);
      this._bindClip(p, step, params);
      this._bindBackdropRef(p, params);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (adjust.type === "blur") {
        // s2 (the blurred copy) and the old accumulator are free again.
        free.push(blurred);
        if (dst) { free.push(acc); acc = dst; } else { free.push(acc); }
      } else if (dst) { free.push(acc); acc = dst; }
    });
    return toScreen && live.length ? null : acc;
  };

  Renderer.prototype.render = function (params) {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height, dpr = params.dpr || 1;
    this._ensureFBOs(w, h);
    if (!this.bgTex || !this.sdfTexs[0]) return;
    this.updateBackgroundVideoFrame();
    const count = Math.max(1, Math.min(MAX_LAYERS, params.layerCount || 1));
    const offsets = new Float32Array(MAX_LAYERS * 2);
    const tints = new Float32Array(MAX_LAYERS * 4);
    const thick = new Float32Array(MAX_LAYERS).fill(20);
    const layerModes = new Int32Array(MAX_LAYERS);
    const mergeGroups = new Int32Array(MAX_LAYERS).fill(-1);
    const centers = new Float32Array(MAX_LAYERS * 2).fill(0.5);
    for (let i = 0; i < count; i++) {
      offsets[i * 2] = params.offsets[i][0]; offsets[i * 2 + 1] = params.offsets[i][1];
      const t = params.tints[i]; tints[i * 4] = t[0]; tints[i * 4 + 1] = t[1]; tints[i * 4 + 2] = t[2]; tints[i * 4 + 3] = t[3];
      thick[i] = params.thicknesses[i];
      layerModes[i] = params.layerModes && params.layerModes[i] ? 1 : 0;
      if (params.mergeGroups && params.mergeGroups[i] != null) mergeGroups[i] = params.mergeGroups[i];
      if (params.centers && params.centers[i]) { centers[i * 2] = params.centers[i][0]; centers[i * 2 + 1] = params.centers[i][1]; }
    }
    // merge distance is in design px; the SDF textures are in raster px
    const mergeK = Math.max(0, params.mergeK || 0) * dpr;
    if (!(mergeK > 0)) mergeGroups.fill(-1);
    const meta = { offsets, layerModes, mergeGroups, mergeK };
    const postWeights = params.postBlurWeights && params.postBlurWeights.length > 1 ? params.postBlurWeights : null;
    this._ensurePostFBO(!!postWeights);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, w, h);

    // The backdrop: every stack layer under the glass, drawn by the plan. The
    // common cover (one plain background photo) keeps its original single pass.
    const plan = params.plan || { backdrop: [], foreground: [] };
    const backdropSteps = this._liveSteps(plan.backdrop, params);
    const plainBackdrop = !params.plan || (backdropSteps.length === 1 && backdropSteps[0].op === "picture"
      && backdropSteps[0].id === params.bgLayerId && backdropSteps[0].blend === "normal"
      && backdropSteps[0].opacity >= 1 && !backdropSteps[0].hasMask && !backdropSteps[0].clipTo);
    if (plainBackdrop) {
      gl.useProgram(this.progBg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA.fbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
      gl.uniform1i(this._u(this.progBg, "u_image"), 0);
      gl.uniform2f(this._u(this.progBg, "u_resolution"), w, h);
      gl.uniform1f(this._u(this.progBg, "u_imageAspect"), this.bgAspect);
      gl.uniform1f(this._u(this.progBg, "u_bgZoom"), params.bgZoom || 1);
      gl.uniform2f(this._u(this.progBg, "u_bgPan"), (params.bgPan && params.bgPan[0]) || 0, (params.bgPan && params.bgPan[1]) || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA.fbo);
      gl.clearColor(NEUTRAL_BASE[0], NEUTRAL_BASE[1], NEUTRAL_BASE[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const acc = backdropSteps.length ? this._runSteps(backdropSteps, this.fboA, [this.fboB, this.fboC], false, params) : this.fboA;
      if (acc !== this.fboA) {
        const rest = [this.fboA, this.fboB, this.fboC].filter((f) => f !== acc);
        this.fboA = acc; this.fboB = rest[0]; this.fboC = rest[1];
      }
    }
    const foregroundSteps = this._liveSteps(plan.foreground, params);
    const hasForeground = foregroundSteps.length > 0;

    const self = this;
    const drawBlur = function (srcTex, dstFbo, dir, weights) {
      const radius = weights.length - 1;
      gl.useProgram(self.progBlur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(self._u(self.progBlur, "u_tex"), 0);
      gl.uniform2f(self._u(self.progBlur, "u_resolution"), w, h);
      gl.uniform2f(self._u(self.progBlur, "u_dir"), dir[0], dir[1]);
      gl.uniform1i(self._u(self.progBlur, "u_radius"), radius);
      gl.uniform1fv(self._u(self.progBlur, "u_weights"), weights);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    drawBlur(this.fboA.tex, this.fboB.fbo, [0, 1], params.blurWeights);
    drawBlur(this.fboB.tex, this.fboC.fbo, [1, 0], params.blurWeights);

    gl.useProgram(this.progMain);
    // Over-the-glass layers need the finished glass in a buffer of its own;
    // B is free once the frost blur has been taken from it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, postWeights ? this.fboD.fbo : (hasForeground ? this.fboB.fbo : null));
    this._bindLayers(this.progMain, count, 0, meta);
    const bgUnit = MAX_LAYERS;
    const blurUnit = MAX_LAYERS + 1;
    gl.activeTexture(gl.TEXTURE0 + bgUnit); gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
    gl.uniform1i(this._u(this.progMain, "u_bg"), bgUnit);
    gl.activeTexture(gl.TEXTURE0 + blurUnit); gl.bindTexture(gl.TEXTURE_2D, this.fboC.tex);
    gl.uniform1i(this._u(this.progMain, "u_blurredBg"), blurUnit);
    gl.uniform2fv(this._u(this.progMain, "u_layerCenter"), centers);
    gl.uniform1f(this._u(this.progMain, "u_magnify"), params.magnify == null ? 1 : params.magnify);
    gl.uniform2f(this._u(this.progMain, "u_resolution"), w, h);
    gl.uniform1f(this._u(this.progMain, "u_dpr"), dpr);
    gl.uniform1fv(this._u(this.progMain, "u_refThickness"), thick);
    gl.uniform1f(this._u(this.progMain, "u_refraction"), params.refraction);
    gl.uniform1f(this._u(this.progMain, "u_refDispersion"), params.refDispersion);
    gl.uniform2f(this._u(this.progMain, "u_lightDir"), Math.cos(params.lightAngle), Math.sin(params.lightAngle));
    gl.uniform1f(this._u(this.progMain, "u_lightIntensity"), params.lightIntensity);
    gl.uniform1f(this._u(this.progMain, "u_splay"), params.splay);
    gl.uniform1f(this._u(this.progMain, "u_brightness"), params.brightness);
    gl.uniform1f(this._u(this.progMain, "u_saturationFactor"), params.saturationFactor);
    gl.uniform1f(this._u(this.progMain, "u_bodyFactor"), params.bodyFactor || 0);
    gl.uniform1f(this._u(this.progMain, "u_shadowExpand"), params.shadowExpand);
    gl.uniform1f(this._u(this.progMain, "u_shadowFactor"), params.shadowFactor);
    gl.uniform2f(this._u(this.progMain, "u_shadowOffset"), params.shadowOffset[0], params.shadowOffset[1]);
    gl.uniform4fv(this._u(this.progMain, "u_tint"), tints);
    this._bindLiquid(this.progMain, MAX_LAYERS + 3, params);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (postWeights) {
      // A (the backdrop) is free once the main pass has read it: D → B → A.
      drawBlur(this.fboD.tex, this.fboB.fbo, [0, 1], postWeights);
      drawBlur(this.fboB.tex, this.fboA.fbo, [1, 0], postWeights);
      gl.useProgram(this.progComp);
      gl.bindFramebuffer(gl.FRAMEBUFFER, hasForeground ? this.fboC.fbo : null);
      this._bindLayers(this.progComp, count, 0, meta);
      gl.activeTexture(gl.TEXTURE0 + bgUnit); gl.bindTexture(gl.TEXTURE_2D, this.fboD.tex);
      gl.uniform1i(this._u(this.progComp, "u_sharp"), bgUnit);
      gl.activeTexture(gl.TEXTURE0 + blurUnit); gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
      gl.uniform1i(this._u(this.progComp, "u_soft"), blurUnit);
      gl.uniform2f(this._u(this.progComp, "u_resolution"), w, h);
      gl.uniform1f(this._u(this.progComp, "u_dpr"), dpr);
      gl.uniform2f(this._u(this.progComp, "u_lightDir"), Math.cos(params.lightAngle), Math.sin(params.lightAngle));
      this._bindLiquid(this.progComp, MAX_LAYERS + 3, params);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (hasForeground) {
      // Over the finished glass: pictures and adjustments above it. The last
      // step goes straight to the canvas.
      const glassBuffer = postWeights ? this.fboC : this.fboB;
      const free = [this.fboA, postWeights ? this.fboB : this.fboC];
      if (postWeights) free.push(this.fboD);
      this._runSteps(foregroundSteps.map((step) => ({ ...step, water: step.op === "picture" })), glassBuffer, free, true, params);
    }
    gl.bindVertexArray(null);
  };

  // ------------------------------------------------------------------
  // 3) App state + UI wiring
  // ------------------------------------------------------------------
  // Design-space dimensions per aspect (the coordinate space for font size,
  // position, thickness). The exported PNG is rendered at a SCALE of these, up to
  // the source photo's native resolution — so a 6000×4000 import exports sharp.
  // 3:2 is sized 1500×1000 so an exact 4× lands on 6000×4000.
  const ASPECTS = { "16:9": [1280, 720], "3:2": [1500, 1000], "4:3": [1280, 960], "3:4": [1080, 1440], "1:1": [1080, 1080] };
  const DPR = 2;
  // Multiplier applied to the whole render for high-resolution export. 1 during
  // preview; raised on export so font/SDF/blur/thickness all scale together and
  // the look is identical, just at full pixel resolution.
  let renderScale = 1;
  function currentDPR() { return DPR * renderScale; }
  const FONT_DEFAULT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif';

  let renderer = null;
  let inited = false;
  let EXPORT_W = 1280, EXPORT_H = 720;
  const layers = [];
  let sel = 0;
  const selectedLayerIds = new Set();
  const glassFx = { bodyFactor: 0 };
  let dragFgMode = false; // "Drag Subject": a canvas drag moves the picture layer, not glass

  // The picture stack (see liquid-cover-model.js): every picture and
  // adjustment layer, bottom first, with the glass band sitting after the first
  // `picSlot` of them. Pixels live in `picMedia`, never in the layer records:
  // a layer is plain data, so a snapshot, a saved document and a variant can
  // all copy it freely. picMedia outlives a deleted layer, so undo can bring
  // the picture back.
  const COVER_MODEL = window.AISystem6CoverModel;
  const BG_LAYER_ID = "lc-bg";
  const picStack = [];
  let picSlot = 1;
  const picMedia = new Map();     // layer id -> { image, file, mask, maskRev, maskDirty }
  const selectedStackIds = new Set();
  let selStack = "";              // the primary selected stack layer
  let nextPicId = 1;
  const bgState = { kind: "builtin", url: "", assetId: "" };
  const localBackgrounds = new Map(); // a chosen photo not yet in the picture store
  const variants = {};            // canvas arrangements of this one cover, by size key
  let variantKey = "16:9";
  const cover = { id: "", fileId: "", title: "", dirty: false };
  let activeBg = 0;
  let rafPending = false;
  let canvas = null;
  let lastBgSource = null; // Image or canvas of the current background (for vision)
  let lastStillBgSource = null;
  let activePresetKey = "clear";
  let motionVideo = null;
  let motionVideoUrl = "";
  let motionFrameId = 0;
  let motionPreviewStart = 0;
  let motionPreviewActive = false;
  let motionPreviewLastRender = 0;
  let motionExporting = false;
  let motionExportProgress = 0;
  let nextLayerId = 1;
  let historyRestoring = false;
  const HISTORY_LIMIT = 50;
  const MOTION_PREVIEW_FPS = 30;

  const $ = (id) => document.getElementById(id);
  function isSolidLayer(L) { return L && L.renderMode === "solid"; }
  function layerColor(L) { return isSolidLayer(L) ? (L.solidColor || "#ffffff") : L.tintColor; }
  function setBusy(control, busy, label) {
    if (typeof setControlLoading === "function") {
      setControlLoading(control, busy, label);
      return;
    }
    if (!control) return;
    control.disabled = !!busy;
    control.toggleAttribute("aria-busy", !!busy);
  }

  const MAX_FONT_FILE_BYTES = 20 * 1024 * 1024;
  let fontProbeCanvas = null;
  function systemFontAvailable(family) {
    if (!family) return true;
    fontProbeCanvas ||= document.createElement("canvas");
    const ctx = fontProbeCanvas.getContext("2d");
    if (!ctx) return true;
    const sample = "mmmmmmmmmmWWWWWiiiil";
    return ["monospace", "serif", "sans-serif"].some((fallback) => {
      ctx.font = "72px " + fallback;
      const baseWidth = ctx.measureText(sample).width;
      const safeFamily = String(family).replace(/["\\]/g, "");
      ctx.font = '72px "' + safeFamily + '", ' + fallback;
      return Math.abs(ctx.measureText(sample).width - baseWidth) > 0.1;
    });
  }

  function prepareFontOptions() {
    const select = $("lc-font");
    if (!select) return;
    select.querySelectorAll("option[data-font-family]").forEach((option) => {
      const available = option.dataset.fontSystem === "true" || systemFontAvailable(option.dataset.fontFamily);
      option.dataset.fontAvailable = available ? "true" : "false";
      option.dataset.baseLabel ||= option.textContent;
      option.textContent = option.dataset.baseLabel + (available ? "" : " · " + tr("liquid_cover_font_not_installed_short", "Not installed"));
    });
    select.querySelectorAll("option[data-font-system], option[data-font-bundled]").forEach((option) => {
      option.dataset.fontAvailable = "true";
    });
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  }

  function applyFontSelection() {
    const select = $("lc-font");
    const L = layers[sel];
    if (!select || !L) return false;
    if (L.locked) { select.value = L.font; return false; }
    const option = select.options[select.selectedIndex];
    if (option?.dataset.fontAvailable === "false") {
      select.value = L.font;
      setFontStatus(
        "liquid_cover_font_not_installed",
        "This font is not installed. Install it from Apple Fonts or import a font file."
      );
      if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
      return false;
    }
    if (L.font !== select.value) runHistoryAction("liquid_cover_edit_action", "Edit layer", () => {
      L.font = select.value;
      if (option?.dataset.fontSerif === "true") {
        L.fontWeight = 600;
      }
    });
    setFontStatus("liquid_cover_font_active", "Using {0}.", option?.dataset.baseLabel || option?.textContent || "");
    return true;
  }

  function fontFamilyFromFileName(name) {
    return String(name || "")
      .replace(/\.(?:ttf|otf|woff2?|ttc)$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/["'\\<>;{}]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function importedFontStack(family) {
    return '"' + String(family).replace(/["\\]/g, "") + '", ' + FONT_DEFAULT;
  }

  function setFontStatus(key, fallback, ...args) {
    const status = $("lc-font-status");
    if (!status) return;
    status.removeAttribute("data-i18n");
    status.textContent = tr(key, fallback, ...args);
  }

  async function importFontFile(file) {
    const button = $("lc-font-import");
    const input = $("lc-font-file");
    const targetLayer = layers[sel];
    if (!file || !targetLayer) return;
    if (!/\.(?:ttf|otf|woff2?)$/i.test(file.name || "") || typeof FontFace !== "function") {
      setFontStatus("liquid_cover_font_import_error", "This font file could not be used.");
      if (input) input.value = "";
      return;
    }
    if (file.size > MAX_FONT_FILE_BYTES) {
      setFontStatus("liquid_cover_font_import_large", "Choose a font file smaller than 20 MB.");
      if (input) input.value = "";
      return;
    }
    const family = fontFamilyFromFileName(file.name) || "Imported Font";
    setBusy(button, true, tr("liquid_cover_font_importing", "Loading font…"));
    setFontStatus("liquid_cover_font_importing", "Loading font…");
    try {
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      const stack = importedFontStack(family);
      const select = $("lc-font");
      let option = [...select.options].find((item) => item.value === stack);
      if (!option) {
        option = document.createElement("option");
        option.value = stack;
        option.textContent = family;
        option.dataset.importedFont = "true";
        select.appendChild(option);
      }
      const targetIndex = layers.indexOf(targetLayer);
      if (targetIndex >= 0) {
        targetLayer.font = stack;
        selectOnly(targetIndex);
        select.value = stack;
        rebuildLayerSDF(targetIndex);
        loadLayerIntoPanel();
        scheduleRender();
      }
      setFontStatus("liquid_cover_font_imported", family + " imported and applied.", family);
    } catch (error) {
      setFontStatus("liquid_cover_font_import_error", "This font file could not be used.");
    } finally {
      setBusy(button, false);
      if (input) input.value = "";
    }
  }

  function wireFontControls() {
    const button = $("lc-font-import");
    const input = $("lc-font-file");
    prepareFontOptions();
    document.fonts?.load('72px "Smiley Sans"').then(() => {
      if (layers.some((L) => String(L.font).includes("Smiley Sans"))) {
        rebuildAllSDF();
        scheduleRender();
      }
    }).catch(() => {});
    if (!button || !input) return;
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => importFontFile(input.files?.[0]));
  }

  function makeLayer(over) {
    // The tool is CALLED Cover Glass: a fresh layer must show glass, or the
    // first open shows no glass anywhere. Solid (the 9to5Mac/B站 readable
    // title) is one checkbox away and is what the ninefive guard protects.
    return Object.assign({
      id: "lc-layer-" + nextLayerId++, parentId: null,
      name: "", text: "Liquid\nGlass", font: FONT_DEFAULT, shape: null, shapeKind: null,
      fontSize: 170, fontWeight: 800, letterSpacing: 0, rotation: 0,
      cx: 0.5, cy: 0.5, renderMode: "glass", solidColor: "#ffffff",
      refThickness: 20, tintColor: "#ffffff", tintAlpha: 0,
      hidden: false, locked: false,
    }, over || {});
  }

  // Quiet flat gradient shown only until the first photo decodes (or if one is
  // missing) so the canvas is never blank. Not a fake "photo" — the old
  // procedural scenes looked cheap and were removed.
  function neutralBg() {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, "#e8edf3"); g.addColorStop(1, "#cfd8e3");
    x.fillStyle = g; x.fillRect(0, 0, 1280, 720);
    return c;
  }
  // Built-in backgrounds are fixed, high-quality photos served from disk
  // (assets/liquid-cover/bg-N.jpg).
  const BG_URLS = [
    "/assets/liquid-cover/bg-1.jpg",
    "/assets/liquid-cover/bg-2.jpg",
    "/assets/liquid-cover/bg-3.jpg",
    "/assets/liquid-cover/bg-4.jpg",
    "/assets/liquid-cover/bg-5.jpg",
    "/assets/liquid-cover/bg-6.jpg",
  ];
  let currentBgUrl = null;
  function setBgFromUrl(url) {
    clearMotionVideo(false);
    currentBgUrl = url;
    bgState.kind = "builtin"; bgState.url = url; bgState.assetId = "";
    const img = new Image();
    img.onload = () => { if (currentBgUrl === url) { setBg(img); } };
    img.onerror = () => { if (currentBgUrl === url && (!renderer || !renderer.bgTex)) { setBg(neutralBg()); } };
    img.src = url;
  }

  // The recipe table is the SINGLE SOURCE OF TRUTH for "what good glass looks
  // like". Every numeric optic lives here, hand-tuned and verified against the
  // fixed shader — never invented by a model. The preset buttons apply these
  // directly; the AI path only *chooses* one by key (plus a tint + light) and
  // the code does the numeric mapping. `desc` is plain language the model can
  // actually reason about, and it is also what the prompt catalog is built from.
  // Every recipe is written in the material-v3 vocabulary, which is Sketch's
  // and Figma's Glass vocabulary: light angle / intensity / splay, refraction,
  // spectral split, frost, brightness, saturation, depth (per layer), tint.
  // `clear` and `thinfrost` are Apple's Clear and Regular variants; the rest
  // walk toward frosted and milky, plus the editorial looks.
  const PRESETS = [
    // A typography + material recipe for the active unlocked layer only.
    { key: "aqua", sampleText: "X", desc: "Aqua-inspired pale-blue serif glass — a full curved body, soft wide light and a short shadow; refracted background stays visible",
      p: { refraction: 37.5, dispersion: 0, lightAngle: 135, lightIntensity: 32, splay: 80, blurRadius: 0, brightness: 0, saturation: 100, shadowFactor: 10, shadowExpand: 6, thickness: 85, tintColor: "#369dd1", tintAlpha: 18, bodyFactor: 0, fontFamily: 'Georgia, "Songti SC", "Songti TC", STSong, "Times New Roman", serif', fontWeight: 600, layerScope: "active", textLayerMode: "glass" } },
    // Apple Clear: the backdrop shows 1:1 through a water-clear body; the
    // curved rim bends it and catches a crisp two-sided highlight.
    { key: "clear", mixValue: 0, desc: "water-clear Apple glass — fully transparent body showing the background 1:1, the curved rim bends the image and catches a crisp highlight; subtle and premium",
      p: { refraction: 55, dispersion: 5, lightAngle: 135, lightIntensity: 70, splay: 22, blurRadius: 0, brightness: 3, saturation: 110, shadowFactor: 8, shadowExpand: 18, thickness: 40, tintColor: "#ffffff", tintAlpha: 0, bodyFactor: 0 } },
    // Apple Regular (the lock-screen clock, controls): a little frost, a
    // brightness and saturation lift so colour glows through, thin bright rim.
    { key: "thinfrost", mixValue: 35, desc: "Apple Regular glass — a light frost with the background colour glowing through brighter and more saturated, thin bright rim; the lock-screen clock look, quiet and elegant",
      p: { refraction: 45, dispersion: 3, lightAngle: 135, lightIntensity: 60, splay: 28, blurRadius: 10, brightness: 10, saturation: 150, shadowFactor: 10, shadowExpand: 18, thickness: 34, tintColor: "#ffffff", tintAlpha: 4, bodyFactor: 0 } },
    // Crystal: clearer than milky, more frost than Regular, luminous rim.
    { key: "frosted", mixValue: 65, desc: "crystal frosted glass — soft frost, luminous body and a bright rim; limpid and glowing rather than milky",
      p: { refraction: 55, dispersion: 4, lightAngle: 135, lightIntensity: 75, splay: 36, blurRadius: 20, brightness: 16, saturation: 140, shadowFactor: 14, shadowExpand: 18, thickness: 50, tintColor: "#ffffff", tintAlpha: 6, bodyFactor: 0 } },
    // Milky: a soft white block with the backdrop glowing through.
    { key: "milky", mixValue: 100, desc: "solid milky frosted glass — a soft opaque-feeling white block with the background gently glowing through; calm and substantial",
      p: { refraction: 35, dispersion: 1, lightAngle: 135, lightIntensity: 50, splay: 50, blurRadius: 36, brightness: 22, saturation: 100, shadowFactor: 20, shadowExpand: 24, thickness: 64, tintColor: "#ffffff", tintAlpha: 34, bodyFactor: 30 } },
    // Thick: a heavy lens — deep bezel, strong bend, a touch of magnification.
    { key: "thick", mixValue: 20, desc: "heavy chunky glass with a deep curved edge, strong bending and slight magnification — dramatic, poster-like",
      p: { refraction: 90, dispersion: 3, lightAngle: 135, lightIntensity: 80, splay: 18, blurRadius: 3, brightness: 4, saturation: 115, shadowFactor: 24, shadowExpand: 22, thickness: 92, magnify: 1.12, tintColor: "#ffffff", tintAlpha: 0, bodyFactor: 0 } },
    // Tinted: the colour cast is the point, luminance kept.
    { key: "tinted", mixValue: 65, desc: "glass carrying a gentle colour cast — when the title should hold a brand or mood colour",
      p: { refraction: 55, dispersion: 2, lightAngle: 135, lightIntensity: 62, splay: 32, blurRadius: 14, brightness: 6, saturation: 140, shadowFactor: 16, shadowExpand: 18, thickness: 50, tintColor: "#5ac8fa", tintAlpha: 42, bodyFactor: 0 } },
    { key: "ninefive", mixValue: 100, desc: "9to5Mac hero logo glass — oversized logo or number rendered as a milky translucent glass object, crisp bright rim, soft editorial shadow, with product/subject optionally placed in front",
      p: { refraction: 55, dispersion: 1.5, lightAngle: 120, lightIntensity: 90, splay: 16, blurRadius: 24, brightness: 16, saturation: 100, shadowFactor: 28, shadowExpand: 20, thickness: 80, tintColor: "#ffffff", tintAlpha: 26, bodyFactor: 42, layerMode: "glass" } },
    // Apple UI-kit glass as Sketch's Auto mode renders it: near-clear, small
    // frost, vibrancy lift, hairline rim, a barely-there floating shadow.
    // Aaron's own cover glass, read off 113 finished covers (2025-09 → 2026-05):
    // a pale, heavily frosted, slightly warm-white glass lifted well above
    // the photo and desaturated, quiet edges, a short soft shadow, almost no
    // refraction and no spectral split; titles set in a regular weight.
    { key: "aaron", mixValue: 85, desc: "Aaron's cover glass — a pale, heavily frosted warm-white glass lifted well above the photo, low colour, quiet crisp edges and a short soft shadow; regular-weight title, product photo often in front of it; calm, editorial, product-review",
      p: { refraction: 18, dispersion: 0, lightAngle: 135, lightIntensity: 32, splay: 40, blurRadius: 52, brightness: 30, saturation: 55, shadowFactor: 18, shadowExpand: 12, thickness: 30, tintColor: "#f4f1ec", tintAlpha: 48, bodyFactor: 30, fontWeight: 500 } },
    // A restrained cover treatment. Keep the author's type weight, positions,
    // solid caption colors and layer modes; only the material recipe changes.
    { key: "cover", mixValue: 15, desc: "quiet transparent cover lettering — thin curved edges, low frost, neutral color and no milky body; keep the primary promise in a readable solid layer",
      p: { refraction: 30, dispersion: 0, lightAngle: 135, lightIntensity: 40, splay: 26, blurRadius: 4, brightness: 0, saturation: 100, shadowFactor: 8, shadowExpand: 12, thickness: 25, tintColor: "#ffffff", tintAlpha: 12, bodyFactor: 0 } },
    { key: "ios27", mixValue: 35, desc: "iOS 27 official glass — the neutral Apple UI Kit material: near-clear with a small frost, colour lifted through the glass, a hairline rim and a barely-there floating shadow",
      p: { refraction: 50, dispersion: 0, lightAngle: 135, lightIntensity: 65, splay: 20, blurRadius: 6, brightness: 12, saturation: 140, shadowFactor: 5, shadowExpand: 15, thickness: 60, tintColor: "#ffffff", tintAlpha: 6, bodyFactor: 2, layerMode: "glass" } },
  ];
  const RECIPE_KEYS = PRESETS.map((r) => r.key);
  function recipeByKey(k) { return PRESETS.find((r) => r.key === String(k).toLowerCase()) || null; }
  function recipeLabel(k) { return (typeof t === "function" && t("liquid_cover_preset_" + k)) || k; }
  function recipeSummary(k) { return tr("liquid_cover_preset_" + k + "_summary", ""); }
  // The Glass Mix slider (玻璃总控) is Apple's material axis: Clear → Regular
  // → Frosted → Milky. Tint and the editorial presets (ios27, ninefive,
  // thick) are NOT points on it — dragging through them would silently flip
  // a colour cast or a layer mode on.
  const MATERIAL_STOPS = [
    { value: 0, key: "clear" },
    { value: 35, key: "thinfrost" },
    { value: 65, key: "frosted" },
    { value: 100, key: "milky" },
  ];
  const MATERIAL_NUMERIC_FIELDS = [
    "refraction", "dispersion", "lightAngle", "lightIntensity", "splay",
    "blurRadius", "brightness", "saturation", "shadowFactor", "shadowExpand",
    "thickness", "tintAlpha", "bodyFactor",
  ];
  function lerp(a, b, x) { return a + (b - a) * x; }
  function mixHex(a, b, x) {
    const ar = hexToRgb(a), br = hexToRgb(b);
    const c = ar.map((v, i) => Math.round(lerp(v, br[i], x) * 255));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function materialStopForKey(k) {
    return MATERIAL_STOPS.find((s) => s.key === k) || null;
  }
  function presetMixValue(k) {
    const stop = materialStopForKey(k);
    if (stop) return stop.value;
    const recipe = recipeByKey(k);
    return recipe && recipe.mixValue != null ? recipe.mixValue : null;
  }
  function materialRecipeAt(value) {
    const v = clampNum(value, 0, 100, 55);
    let lo = MATERIAL_STOPS[0], hi = MATERIAL_STOPS[MATERIAL_STOPS.length - 1];
    for (let i = 0; i < MATERIAL_STOPS.length - 1; i++) {
      if (v >= MATERIAL_STOPS[i].value && v <= MATERIAL_STOPS[i + 1].value) {
        lo = MATERIAL_STOPS[i]; hi = MATERIAL_STOPS[i + 1]; break;
      }
    }
    const a = recipeByKey(lo.key), b = recipeByKey(hi.key);
    const x = hi.value === lo.value ? 0 : (v - lo.value) / (hi.value - lo.value);
    const p = {};
    MATERIAL_NUMERIC_FIELDS.forEach((field) => { p[field] = lerp(a.p[field], b.p[field], x); });
    p.tintColor = mixHex(a.p.tintColor, b.p.tintColor, x);
    return p;
  }
  function setMaterialMixValue(value) {
    const el = $("lc-material-mix");
    if (el) el.value = clampNum(value, 0, 100, 55);
  }
  function materialKeyAtExactValue(value) {
    const v = clampNum(value, 0, 100, 55);
    const hit = MATERIAL_STOPS.find((s) => Math.abs(s.value - v) < 0.001);
    return hit ? hit.key : "";
  }
  function syncMaterialMixToRecipe(k) {
    const value = presetMixValue(k);
    if (value != null) setMaterialMixValue(value);
  }
  function applyMaterialMix(value) {
    setMaterialMixValue(value);
    applyPreset(materialRecipeAt(value));
    setActivePreset(materialKeyAtExactValue(value));
  }

  // --- the model→physics mapping. The model only ever speaks in these closed
  // vocabularies; the numbers all live on this side of the boundary. ---
  const TINT_STRENGTH = { none: 0, subtle: 12, medium: 24, strong: 38 };
  // Light direction (where the brightest light comes from) → Light Angle.
  const LIGHT_ANGLE = { top: 90, "top-left": 135, left: 180, "bottom-left": -135, bottom: -90, "bottom-right": -45, right: 0, "top-right": 45 };
  function adjCtl(id, d, min, max) { const x = $(id); if (x) x.value = clampNum(+x.value + d, min, max, +x.value); }
  function adjLayerField(f, d, min, max) { layers.forEach((L) => { L[f] = clampNum((+L[f] || 0) + d, min, max, +L[f] || 0); }); }
  // Bounded modifier vocabulary: each word maps to a deterministic delta. This is
  // how the model nudges a recipe without ever touching a raw number.
  const MODIFIER_FX = {
    brighter: () => { adjCtl("lc-light-intensity", 15, 0, 100); adjCtl("lc-brightness", 6, -50, 50); },
    softer: () => { adjCtl("lc-light-intensity", -15, 0, 100); adjCtl("lc-splay", 15, 0, 100); adjCtl("lc-blur-radius", 8, 0, 80); },
    thinner: () => { adjLayerField("refThickness", -10, 0, 100); },
    thicker: () => { adjLayerField("refThickness", 12, 0, 100); },
    "more-frosted": () => { adjCtl("lc-blur-radius", 16, 0, 80); adjCtl("lc-brightness", 4, -50, 50); },
    clearer: () => { adjCtl("lc-blur-radius", -12, 0, 80); adjLayerField("tintAlpha", -10, 0, 100); },
    "more-color": () => { adjLayerField("tintAlpha", 16, 0, 100); },
    "more-dispersion": () => { adjCtl("lc-dispersion", 6, 0, 100); },
  };
  // Background-adaptive geometry. The vision model only judges how BUSY the photo
  // is (a real, groundable image property); the code decides what that means for
  // the glass: a busy photo wants thinner + more frosted glass so the title stays
  // readable; a clean photo can carry slightly thicker, clearer glass.
  // The 9to5Mac milky body adapts with the photo (guarded: regular recipes
  // keep bodyFactor 0 and are untouched). Reference covers show the pattern:
  // dark / busy backdrops get MORE milk so the logo separates; bright clean
  // ones go clearer and let the background hue flood the glass.
  function adjBody(d) { if (glassFx.bodyFactor > 0) glassFx.bodyFactor = clampNum(glassFx.bodyFactor + d, 10, 80, glassFx.bodyFactor); }
  const BUSYNESS_FX = {
    busy: () => { adjLayerField("refThickness", -8, 0, 100); adjCtl("lc-blur-radius", 12, 0, 80); adjLayerField("tintAlpha", 8, 0, 100); adjBody(8); },
    moderate: () => { /* leave the recipe as-is */ },
    clean: () => { adjLayerField("refThickness", 6, 0, 100); adjCtl("lc-blur-radius", -6, 0, 80); adjBody(-8); },
  };
  // Background-adaptive shadow. The vision model judges the backdrop's TONE
  // (another groundable image property); the code decides what that means for
  // the contact shadow: on a dark photo a shadow can't ground anything — it only
  // stains the image, so it nearly vanishes; on a bright photo the shadow is what
  // makes the glass float (the Apple reference look), so it keeps its strength
  // but spreads softer. Mid tones keep the recipe values.
  const BACKDROP_FX = {
    // proportional, not a fixed delta: "nearly zero" must hold for heavy
    // recipes too (thick 30 → 9), not just clear (8 → 2)
    dark: () => { const x = $("lc-shadow-factor"); if (x) x.value = Math.round(+x.value * 0.3); adjCtl("lc-shadow-expand", -6, 2, 100); adjBody(10); },
    mid: () => { /* leave the recipe as-is */ },
    light: () => { adjCtl("lc-shadow-expand", 6, 2, 100); adjBody(-8); },
  };
  // Small local models drift off the enum; map close synonyms instead of
  // silently dropping the judgment.
  const BACKDROP_ALIAS = { bright: "light", white: "light", pale: "light", medium: "mid", middle: "mid", neutral: "mid", black: "dark", deep: "dark", night: "dark" };
  function applyBackdrop(name) {
    let k = String(name).toLowerCase();
    if (!BACKDROP_FX[k]) k = BACKDROP_ALIAS[k] || k;
    const fn = BACKDROP_FX[k];
    if (fn) { fn(); return k; }
    return null;
  }
  function applyRecipeByName(k) { const r = recipeByKey(k); if (r && !(r.p.layerScope === "active" && (!layers[sel] || layers[sel].locked))) { syncMaterialMixToRecipe(r.key); applyPreset(r.p); setActivePreset(r.key); } return r; }
  function applyTintStrength(s) { const a = TINT_STRENGTH[String(s).toLowerCase()]; if (a == null) return false; layers.forEach((L) => { L.tintAlpha = a; }); return true; }
  // The vision tint is a COLOR-harmony call, not a material change: "none"
  // keeps the recipe's own veil (a thick recipe's 30% white IS its body — the
  // model declining a colour must not strip it), and a colorless recipe
  // (clear, tintAlpha 0) never takes more than a subtle tint, so 通透 stays 通透.
  // Returns the strength actually applied (possibly capped), so the status
  // line reports what happened — never the model's uncapped wish.
  function applyVisionTint(spec, recipe) {
    let strength = String(spec.tintStrength || "").toLowerCase();
    if (!validHex(spec.tintColor) || TINT_STRENGTH[strength] == null || strength === "none") return null;
    if (recipe && recipe.p.tintAlpha === 0 && TINT_STRENGTH[strength] > TINT_STRENGTH.subtle) strength = "subtle";
    layers.forEach((L) => { L.tintColor = spec.tintColor; });
    applyTintStrength(strength);
    return strength;
  }
  function lightToAngle(name) { const a = LIGHT_ANGLE[String(name).toLowerCase()]; return a == null ? null : a; }
  function applyModifiers(list) { if (!Array.isArray(list)) return []; const done = []; list.slice(0, 3).forEach((m) => { const fn = MODIFIER_FX[String(m).toLowerCase()]; if (fn) { fn(); done.push(m); } }); return done; }
  function applyBusyness(name) { const fn = BUSYNESS_FX[String(name).toLowerCase()]; if (fn) { fn(); return String(name).toLowerCase(); } return null; }
  function setSlider(id, v, min, max) { if (v == null) return; const x = $(id); if (x) x.value = clampNum(v, min, max, +x.value); }
  function readableTitleTint(L) {
    const source = lastStillBgSource;
    const w = sourceWidth(source), h = sourceHeight(source);
    if (!w || !h) return "#f7f7f3";
    try {
      const probe = document.createElement("canvas");
      probe.width = 48; probe.height = 48;
      const ctx = probe.getContext("2d", { willReadFrequently: true });
      if (!ctx) return "#f7f7f3";
      // Match the renderer's cover fit. Layer positions use bottom-origin UV.
      const cropW = Math.min(w, h * DESIGN_W / DESIGN_H);
      const cropH = Math.min(h, w * DESIGN_H / DESIGN_W);
      const sx = (w - cropW) / 2, sy = (h - cropH) / 2;
      const bounds = worldBounds(L);
      const sampleW = Math.max(cropW * (bounds.right - bounds.left), cropW * 0.04);
      const sampleH = Math.max(cropH * (bounds.top - bounds.bottom), cropH * 0.03);
      const x = clampNum(sx + cropW * L.cx - sampleW / 2, 0, w - sampleW, sx);
      const y = clampNum(sy + cropH * (1 - L.cy) - sampleH / 2, 0, h - sampleH, sy);
      ctx.drawImage(source, x, y, sampleW, sampleH, 0, 0, 48, 48);
      const pixels = ctx.getImageData(0, 0, 48, 48).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
      return sum / (pixels.length / 4) > 0.5 ? "#202329" : "#f7f7f3";
    } catch (_) {
      // A cross-origin photo may be drawable but not readable; keep export usable.
      return "#f7f7f3";
    }
  }

  function applyPreset(p) {
    const targets = p.layerScope === "active"
      ? [layers[sel]].filter((L) => L && !L.locked)
      : layers;
    if (p.layerScope === "active" && !targets.length) return;
    if (p.bodyFactor != null) glassFx.bodyFactor = p.bodyFactor;
    setSlider("lc-refraction", p.refraction, 0, 100);
    setSlider("lc-dispersion", p.dispersion, 0, 100);
    setSlider("lc-light-angle", p.lightAngle, -180, 180);
    setSlider("lc-light-intensity", p.lightIntensity, 0, 100);
    setSlider("lc-splay", p.splay, 0, 100);
    setSlider("lc-blur-radius", p.blurRadius, 0, 80);
    setSlider("lc-brightness", p.brightness, -50, 50);
    setSlider("lc-saturation", p.saturation, 0, 200);
    // Magnification and Post Blur are material optics: a recipe that does not
    // name them returns them to neutral. Merge Distance is composition, not
    // material, so recipes leave it alone.
    setSlider("lc-magnify", p.magnify == null ? 1 : p.magnify, -4, 4);
    setSlider("lc-post-blur", p.postBlur == null ? 0 : p.postBlur, 0, 40);
    setSlider("lc-shadow-factor", p.shadowFactor, 0, 100);
    setSlider("lc-shadow-expand", p.shadowExpand, 2, 100);
    targets.forEach((L) => {
      // Only an explicitly scoped typography recipe converts the active text.
      if (p.layerScope === "active" && p.textLayerMode && !L.shape && !L.shapeKind) L.renderMode = p.textLayerMode;
      // layerMode only retargets shape/logo layers. Text layers keep their
      // solid/glass choice: in the 9to5Mac grammar the title is ALWAYS the
      // readable solid layer — a material preset must never strip that.
      if ((p.layerMode === "glass" || p.layerMode === "solid") && (L.shape || L.shapeKind)) L.renderMode = p.layerMode;
      if (p.thickness != null) L.refThickness = p.thickness;
      const titleTint = p.adaptiveTitleTint ? readableTitleTint(L) : p.tintColor;
      if (titleTint) L.tintColor = titleTint;
      if (p.adaptiveTitleTint && isSolidLayer(L)) L.solidColor = titleTint;
      if (p.tintAlpha != null) L.tintAlpha = p.tintAlpha;
    });
    // a recipe may name a title weight (aaron sets titles regular); text
    // layers only, and only this recipe path — Glass Mix never carries one
    let reshaped = false;
    if (p.fontFamily) targets.forEach((L) => {
      if (!L.shape && !L.shapeKind && L.font !== p.fontFamily) { L.font = p.fontFamily; reshaped = true; }
    });
    if (p.fontWeight) targets.forEach((L) => {
      if (!L.shape && !L.shapeKind && L.fontWeight !== p.fontWeight) { L.fontWeight = p.fontWeight; reshaped = true; }
    });
    if (reshaped) rebuildAllSDF();
    loadLayerIntoPanel(); syncValueLabels(); renderNow(); scheduleRender();
  }
  function buildPresetRow() {
    const row = $("lc-preset-row");
    if (!row) return;
    row.innerHTML = "";
    PRESETS.forEach((pr) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn";
      b.dataset.presetKey = pr.key;
      b.setAttribute("aria-pressed", "false");
      const label = recipeLabel(pr.key);
      const summary = recipeSummary(pr.key);
      b.setAttribute("aria-label", summary ? label + " — " + summary : label);
      const preview = document.createElement("span");
      preview.className = "lc-preset-preview";
      preview.setAttribute("aria-hidden", "true");
      const sample = document.createElement("span");
      sample.className = "lc-preset-sample";
      sample.textContent = thumbSampleText(pr.key);
      preview.appendChild(sample);
      const copy = document.createElement("span");
      copy.className = "lc-preset-copy";
      const name = document.createElement("strong");
      name.textContent = label;
      const detail = document.createElement("span");
      detail.textContent = summary;
      copy.appendChild(name);
      copy.appendChild(detail);
      b.appendChild(preview);
      b.appendChild(copy);
      b.addEventListener("click", () => onPresetClick(pr));
      row.appendChild(b);
    });
    syncPresetButtons();
  }
  // Preset previews are rendered by the glass kernel itself, on the current
  // backdrop, so a card always shows what its recipe really does — the CSS
  // sketch underneath is only the fallback when WebGL is unavailable. One
  // small second renderer, kept for re-renders when the backdrop changes.
  // Frost and shadow are scaled to the sample glyph, so a thumbnail reads the
  // way the recipe reads on a cover-sized title.
  const THUMB_W = 432, THUMB_H = 180, THUMB_DPR = 2, THUMB_FONT = 64, COVER_FONT = 170;
  let thumbRenderer = null;
  let thumbTimer = 0;
  const thumbSdf = new Map();
  function thumbSampleText(k) { return recipeByKey(k)?.sampleText || (k === "ninefive" ? "9" : k === "ios27" ? "27" : "Aa"); }
  function thumbSdfFor(text, weight, fontFamily = FONT_DEFAULT) {
    const key = JSON.stringify([text, weight, fontFamily]);
    if (thumbSdf.has(key)) return thumbSdf.get(key);
    const r = rasterizeText({ text, width: THUMB_W, height: THUMB_H, fontFamily, fontWeight: weight, fontSize: THUMB_FONT * THUMB_DPR, letterSpacing: 0, rotationDeg: 0 });
    const sdf = alphaToSignedDistance(r.alpha, r.width, r.height, true);
    smoothSDF(sdf, r.width, r.height);
    let mn = 0; for (let i = 0; i < sdf.length; i++) { if (sdf[i] < mn) mn = sdf[i]; }
    const entry = { sdf, halfPx: -mn };
    thumbSdf.set(key, entry);
    return entry;
  }
  function recipeRenderParams(p, halfPx) {
    const k = THUMB_FONT / COVER_FONT;
    const frac = clampNum(p.thickness, 0, 100, 60) / 100;
    const tint = hexToRgb(validHex(p.tintColor) || "#ffffff");
    const expand = clampNum(p.shadowExpand, 2, 100, 20);
    return {
      dpr: THUMB_DPR, layerCount: 1, offsets: [[0, 0]], layerModes: [0],
      mergeGroups: [-1], mergeK: 0, centers: [[0.5, 0.5]],
      magnify: p.magnify == null ? 1 : p.magnify, postBlurWeights: null,
      tints: [[tint[0], tint[1], tint[2], (p.tintAlpha || 0) / 100]],
      thicknesses: [Math.max(1, (halfPx / THUMB_DPR) * Math.min(frac, 0.96))],
      fgPos: [0.5, 0.5], fgScale: 1, fgRegistered: false,
      refraction: (p.refraction || 0) / 50,
      refDispersion: p.dispersion || 0,
      lightAngle: ((p.lightAngle == null ? 135 : p.lightAngle) * Math.PI) / 180,
      lightIntensity: (p.lightIntensity || 0) / 100,
      splay: (p.splay || 0) / 100,
      brightness: (p.brightness || 0) / 100,
      saturationFactor: (p.saturation == null ? 100 : p.saturation) / 100,
      bodyFactor: (p.bodyFactor || 0) / 100,
      blurWeights: gaussianWeights(Math.min(96, Math.round((p.blurRadius || 0) * (1440 / 1080) * (THUMB_FONT * THUMB_DPR) / (COVER_FONT * 2)))),
      shadowExpand: expand * k,
      shadowFactor: (p.shadowFactor || 0) / 100,
      shadowOffset: [0, -(4 + 0.35 * expand) * k],
      bgZoom: 1, bgPan: [0, 0],
    };
  }
  function renderPresetThumbs() {
    thumbTimer = 0;
    const src = lastStillBgSource;
    const row = $("lc-preset-row");
    if (!src || !row || !renderer) return;
    try {
      if (!thumbRenderer) {
        const c = document.createElement("canvas");
        c.width = THUMB_W; c.height = THUMB_H;
        thumbRenderer = new Renderer(c);
      }
      thumbRenderer.setBackground(src);
      let current = "";
      PRESETS.forEach((pr) => {
        const text = thumbSampleText(pr.key);
        const weight = pr.p.fontWeight || 800;
        const family = pr.p.fontFamily || FONT_DEFAULT;
        const sampleKey = JSON.stringify([text, weight, family]);
        const entry = thumbSdfFor(text, weight, family);
        if (sampleKey !== current) { thumbRenderer.setLayerSDF(0, entry.sdf, THUMB_W, THUMB_H); current = sampleKey; }
        thumbRenderer.render(recipeRenderParams(pr.p, entry.halfPx));
        const preview = row.querySelector(`[data-preset-key="${pr.key}"] .lc-preset-preview`);
        if (!preview) return;
        // inline, so a card's own sketch background (tinted has one) can't
        // reset the size or position
        preview.style.backgroundImage = "url(" + thumbRenderer.canvas.toDataURL("image/png") + ")";
        preview.style.backgroundSize = "cover";
        preview.style.backgroundPosition = "center";
        preview.classList.add("is-rendered");
      });
    } catch (e) {
      // keep the CSS sketches; the cover itself reports WebGL problems
      thumbRenderer = null;
    }
  }
  function schedulePresetThumbs() {
    if (thumbTimer) clearTimeout(thumbTimer);
    thumbTimer = setTimeout(renderPresetThumbs, 250);
  }
  function syncPresetButtons() {
    document.querySelectorAll("#liquid-cover-app [data-preset-key]").forEach((button) => {
      const active = button.dataset.presetKey === activePresetKey;
      button.classList.toggle("default", active);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  function setActivePreset(key) {
    activePresetKey = key || "";
    syncPresetButtons();
  }

  // Click a preset: apply the verified recipe deterministically. Background-aware
  // adaptation belongs to the bottom mood/config bar, otherwise the button label
  // stops matching the final rendered result.
  function onPresetClick(pr) {
    if (pr.p.layerScope === "active" && (!layers[sel] || layers[sel].locked)) return;
    runHistoryAction("liquid_cover_style_action", "Change style", () => {
      syncMaterialMixToRecipe(pr.key);
      applyPreset(pr.p);
      setActivePreset(pr.key);
      aiStatusText("");
    });
  }

  // A short, human-readable account of what the model decided — so the result is
  // explainable, never "magic". e.g. "通透 · 微染 #88c0ff · 光：左上".
  function describeChoice(c) {
    const parts = [recipeLabel(c.recipe)];
    if (validHex(c.tintColor) && c.tintStrength && String(c.tintStrength).toLowerCase() !== "none") {
      const tw = (typeof t === "function" && t("liquid_cover_tint_" + String(c.tintStrength).toLowerCase())) || c.tintStrength;
      parts.push(tw + " " + c.tintColor);
    }
    if (c.light && LIGHT_ANGLE[String(c.light).toLowerCase()] != null) {
      const lw = (typeof t === "function" && t("liquid_cover_light_" + String(c.light).toLowerCase())) || c.light;
      const ll = (typeof t === "function" && t("liquid_cover_light_label")) || "light";
      parts.push(ll + ": " + lw);
    }
    if (c.busyness && BUSYNESS_FX[String(c.busyness).toLowerCase()]) {
      const bw = (typeof t === "function" && t("liquid_cover_busy_" + String(c.busyness).toLowerCase())) || c.busyness;
      parts.push(bw);
    }
    if (c.backdrop && BACKDROP_FX[String(c.backdrop).toLowerCase()]) {
      const dw = (typeof t === "function" && t("liquid_cover_backdrop_" + String(c.backdrop).toLowerCase())) || c.backdrop;
      parts.push(dw);
    }
    if (Array.isArray(c.modifiers) && c.modifiers.length) parts.push(c.modifiers.join(", "));
    return parts.join(" · ");
  }

  // Preview supersampling: rasterize the text SDF and render at 2x the design
  // dims, displayed at the design aspect — the browser's downsample is the AA.
  // The studio's analytic superellipse SDF is smooth at any density; our
  // rasterized text SDF (EDT over a glyph raster) is not, so sampling density
  // is what kills the jagged edge and the noisy glare band.
  const PREVIEW_SS = 2;
  let DESIGN_W = 1280, DESIGN_H = 720;
  function applyAspect(w, h) {
    DESIGN_W = w; DESIGN_H = h;
    renderScale = PREVIEW_SS;
    EXPORT_W = w * PREVIEW_SS; EXPORT_H = h * PREVIEW_SS;
    canvas.width = EXPORT_W; canvas.height = EXPORT_H;
    canvas.style.aspectRatio = w + " / " + h;
    updateExportDimNote();
    syncWorkbenchReadout();
  }

  function selectedLayersInStack() {
    return layers.filter((L) => selectedLayerIds.has(L.id));
  }

  function ensureSelection() {
    selectedLayerIds.forEach((id) => {
      if (!layers.some((L) => L.id === id)) selectedLayerIds.delete(id);
    });
    if (!layers[sel]) sel = Math.max(0, layers.length - 1);
    selectedStackIds.forEach((id) => { if (!picStack.some((S) => S.id === id)) selectedStackIds.delete(id); });
    if (selStack && !selectedStackIds.has(selStack)) selStack = [...selectedStackIds].pop() || "";
    if (layers[sel] && !selectedLayerIds.size && !selectedStackIds.size) selectedLayerIds.add(layers[sel].id);
    if (layers[sel] && !selectedLayerIds.has(layers[sel].id)) {
      const selected = selectedLayersInStack();
      sel = selected.length ? layers.indexOf(selected[selected.length - 1]) : sel;
    }
  }

  function selectOnly(index) {
    if (!layers[index]) return;
    sel = index;
    selectedLayerIds.clear();
    selectedLayerIds.add(layers[index].id);
    selectedStackIds.clear();
    selStack = "";
  }

  function toggleLayerSelection(index) {
    const L = layers[index];
    if (!L) return;
    if (selectedLayerIds.has(L.id) && selectedLayerIds.size > 1) {
      selectedLayerIds.delete(L.id);
      if (sel === index) {
        const selected = selectedLayersInStack();
        sel = layers.indexOf(selected[selected.length - 1]);
      }
      return;
    }
    selectedLayerIds.add(L.id);
    sel = index;
  }

  function selectAllLayers() {
    layers.forEach((L) => selectedLayerIds.add(L.id));
    if (layers.length) sel = layers.length - 1;
  }

  const HISTORY_CONTROL_IDS = [
    "lc-light-angle", "lc-light-intensity", "lc-splay",
    "lc-refraction", "lc-dispersion", "lc-brightness", "lc-saturation",
    "lc-blur-radius", "lc-shadow-factor", "lc-shadow-expand",
    "lc-magnify", "lc-merge", "lc-post-blur",
    "lc-material-mix", "lc-motion-preset", "lc-motion-duration",
    "lc-motion-audio",
    "lc-liquid-mode", "lc-liquid-strength", "lc-liquid-drop", "lc-liquid-pointer",
  ];

  function cloneLayerForHistory(L) {
    const copy = { ...L };
    if (L._localBounds) copy._localBounds = { ...L._localBounds };
    return copy;
  }
  function cloneStackLayer(S) {
    const copy = { ...S };
    if (S.adjust) copy.adjust = { ...S.adjust };
    return copy;
  }
  function cloneVariants(source) { return JSON.parse(JSON.stringify(source || {})); }

  function historyControlValues() {
    const values = {};
    HISTORY_CONTROL_IDS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      values[id] = el.type === "checkbox" ? !!el.checked : el.value;
    });
    return values;
  }

  // One snapshot of everything a cover is: the glass layers, the picture stack,
  // the background, the sizes, the global glass settings. The edit kernel's
  // history keeps these and writes them back; nothing here knows how to invert
  // an edit. Pictures and masks are not copied — they stay in `picMedia`, which
  // outlives a deleted layer so undo can bring it back.
  function captureHistoryState() {
    return {
      layers: layers.map(cloneLayerForHistory),
      selectedIds: [...selectedLayerIds],
      selectedId: layers[sel]?.id || null,
      stack: picStack.map(cloneStackLayer),
      glassSlot: picSlot,
      selectedStackIds: [...selectedStackIds],
      selStack,
      bgState: { ...bgState },
      variants: cloneVariants(variants),
      variantKey,
      glassFx: { ...glassFx },
      controls: historyControlValues(),
      aspect: activeAspectKey(),
      activePresetKey,
      activeBg,
      currentBgUrl,
    };
  }

  function snapshotSignature(state) {
    return JSON.stringify({
      layers: state.layers.map((L) => ({
        id: L.id, parentId: L.parentId, name: L.name, text: L.text,
        font: L.font, fontSize: L.fontSize, fontWeight: L.fontWeight,
        letterSpacing: L.letterSpacing, rotation: L.rotation,
        cx: L.cx, cy: L.cy, renderMode: L.renderMode,
        solidColor: L.solidColor, refThickness: L.refThickness,
        tintColor: L.tintColor, tintAlpha: L.tintAlpha,
        shapeKind: L.shapeKind, hasShape: !!L.shape,
        hidden: !!L.hidden, locked: !!L.locked,
      })),
      stack: state.stack, glassSlot: state.glassSlot, bg: state.bgState,
      variantKey: state.variantKey, variants: state.variants,
      glassFx: state.glassFx, controls: state.controls,
      aspect: state.aspect, activePresetKey: state.activePresetKey,
      activeBg: state.activeBg, currentBgUrl: state.currentBgUrl,
    });
  }
  function historySignature() { return snapshotSignature(captureHistoryState()); }

  function updateHistoryButtons() {
    const undo = $("lc-undo");
    const redo = $("lc-redo");
    if (undo) undo.disabled = !coverHistory.canUndo();
    if (redo) redo.disabled = !coverHistory.canRedo();
    if (typeof updateMenuState === "function") updateMenuState();
  }

  // A gesture — one drag, one slider scrub, one text edit — is one step. A
  // second begin while one is open is the same gesture arriving by another
  // event (pointerdown then focusin), not a new step.
  function beginHistory(labelKey, fallback) {
    if (historyRestoring || coverHistory.inGesture()) return;
    coverHistory.begin(tr(labelKey, fallback));
  }

  function cancelHistory() {
    if (coverHistory.inGesture()) coverHistory.cancel();
  }

  function commitHistory() {
    if (historyRestoring) return;
    coverHistory.commit();
    updateHistoryButtons();
  }

  function runHistoryAction(labelKey, fallback, action) {
    beginHistory(labelKey, fallback);
    action();
    commitHistory();
  }

  function restoreHistoryState(state) {
    historyRestoring = true;
    try {
      layers.length = 0;
      state.layers.forEach((L) => layers.push(cloneLayerForHistory(L)));
      selectedLayerIds.clear();
      state.selectedIds.forEach((id) => {
        if (layers.some((L) => L.id === id)) selectedLayerIds.add(id);
      });
      sel = Math.max(0, layers.findIndex((L) => L.id === state.selectedId));
      if (!selectedLayerIds.size && layers[sel] && !(state.selectedStackIds || []).length) selectedLayerIds.add(layers[sel].id);
      picStack.length = 0;
      (state.stack || []).forEach((S) => picStack.push(cloneStackLayer(S)));
      picSlot = Number.isInteger(state.glassSlot) ? state.glassSlot : picSlot;
      selectedStackIds.clear();
      (state.selectedStackIds || []).forEach((id) => { if (picStack.some((S) => S.id === id)) selectedStackIds.add(id); });
      selStack = picStack.some((S) => S.id === state.selStack) ? state.selStack : "";
      Object.assign(glassFx, state.glassFx);
      Object.entries(state.controls || {}).forEach(([id, value]) => {
        const el = $(id);
        if (!el) return;
        if (el.type === "checkbox") el.checked = !!value;
        else el.value = value;
      });
      Object.keys(variants).forEach((key) => { delete variants[key]; });
      Object.assign(variants, cloneVariants(state.variants));
      variantKey = state.variantKey || state.aspect || variantKey;
      const aspect = ASPECTS[state.aspect] || ASPECTS["16:9"];
      applyAspect(aspect[0], aspect[1]);
      document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((button) => {
        const active = button.dataset.k === state.aspect;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      activePresetKey = state.activePresetKey || "";
      activeBg = Number.isInteger(state.activeBg) ? state.activeBg : activeBg;
      restoreBackgroundState(state);
      nextLayerId = layers.reduce((max, L) => {
        const value = Number(String(L.id || "").replace(/^lc-layer-/, ""));
        return Number.isFinite(value) ? Math.max(max, value + 1) : max;
      }, nextLayerId);
      syncRendererPictures();
      rebuildAllSDF();
      renderLayerList();
      loadLayerIntoPanel();
      renderStackInspector();
      const focusStack = selStack && selectedStackIds.has(selStack) && !selectedLayerIds.size;
      setInspectorPanel(focusStack ? "stack" : (isShapeLayer(layers[sel]) ? "glass" : "layers"));
      syncValueLabels();
      syncLiquidControls();
      syncSubjectControls();
      setActivePreset(activePresetKey);
      scheduleRender();
    } finally {
      historyRestoring = false;
    }
  }

  const coverHistory = window.AISystem6EditHistory.createEditHistory({
    read: captureHistoryState,
    write: (snapshot) => restoreHistoryState(snapshot),
    limit: HISTORY_LIMIT,
    equals: (a, b) => snapshotSignature(a) === snapshotSignature(b),
    onChange: ({ kind, label }) => {
      if (kind !== "clear" && typeof notifyCoverEmbed === "function") notifyCoverEmbed();
      if (kind === "record" || kind === "group") markCoverDirty();
      if (kind === "undo" || kind === "redo") {
        markCoverDirty();
        aiStatusText(tr(kind === "undo" ? "liquid_cover_undo_status" : "liquid_cover_redo_status", kind === "undo" ? "Change undone." : "Change redone.", label));
      }
      updateHistoryButtons();
    },
  });
  function undoEditor() { return coverHistory.undo(); }
  function redoEditor() { return coverHistory.redo(); }

  // Edit > Undo / Redo and their menu names come from this history when no
  // field in the window is the target (window-manager.js editHistoryFor).
  registerEditHistory("liquidCover", coverHistory);

  function syncWorkbenchReadout() {
    const aspect = activeAspectKey();
    const layer = layers[sel];
    const selectionCount = selectedLayersInStack().length;
    const stackSelected = selectedStackLayers();
    const layerName = selectionCount + stackSelected.length > 1
      ? tr("liquid_cover_layers_selected", "{0} layers selected", selectionCount + stackSelected.length)
      : (stackFocus() ? stackLayerName(stackSelected[0]).slice(0, 32) : (layer ? (layer.name || (layer.text || "Layer").split("\n")[0] || "Layer").slice(0, 32) : "Layer"));
    const format = $("lc-stage-format");
    if (format) format.textContent = aspect + " · " + DESIGN_W + " × " + DESIGN_H;
    const selection = $("lc-stage-selection");
    if (selection) selection.textContent = layerName;
    const help = $("lc-selection-help");
    if (help) {
      help.removeAttribute("data-i18n");
      help.textContent = selectionCount > 1
        ? tr("liquid_cover_selection_count_help", "{0} layers selected · drag together · align to selection", selectionCount)
        : tr("liquid_cover_selection_help", "Shift-click or drag a box to select multiple layers. Drag layers to reorder.");
    }
    syncCoverStatus();
  }
  function sourceWidth(src) { return src ? (src.videoWidth || src.naturalWidth || src.width || 0) : 0; }
  function sourceHeight(src) { return src ? (src.videoHeight || src.naturalHeight || src.height || 0) : 0; }
  function setBg(src) {
    lastBgSource = src;
    lastStillBgSource = src;
    if (renderer) { renderer.setBackground(src); scheduleRender(); schedulePresetThumbs(); }
    updateExportDimNote();
  }
  function motionDurationSeconds() {
    const el = $("lc-motion-duration");
    return clampNum(el ? +el.value : 2, 1, 6, 2);
  }
  function motionPresetKey() {
    const el = $("lc-motion-preset");
    return el ? el.value : "none";
  }
  function motionProgress() {
    if (motionExporting) return motionExportProgress;
    if (!motionPreviewActive) return 1;
    const duration = motionDurationSeconds() * 1000;
    if (!duration) return 0;
    if (!motionPreviewStart) return 0;
    return clampNum((performance.now() - motionPreviewStart) / duration, 0, 1, 0);
  }
  function stopMotionPreview(renderFinal) {
    if (motionFrameId) {
      cancelAnimationFrame(motionFrameId);
      motionFrameId = 0;
    }
    motionPreviewActive = false;
    motionPreviewStart = 0;
    motionPreviewLastRender = 0;
    $("lc-motion-preview")?.setAttribute("aria-pressed", "false");
    if (motionVideo) {
      try { motionVideo.pause(); } catch (e) { /* noop */ }
    }
    if (renderFinal) renderNow();
  }
  function scheduleMotionPreview() {
    if (motionFrameId) {
      cancelAnimationFrame(motionFrameId);
      motionFrameId = 0;
    }
    if (motionExporting || !motionPreviewActive) return;
    const frameMs = 1000 / MOTION_PREVIEW_FPS;
    const tick = (now) => {
      const win = document.querySelector(".liquid-cover-window");
      if (win && win.classList.contains("is-hidden")) {
        motionFrameId = 0;
        stopMotionPreview(false);
        return;
      }
      const progress = motionProgress();
      if (!motionPreviewLastRender || now - motionPreviewLastRender >= frameMs || progress >= 1) {
        motionPreviewLastRender = now;
        renderNow();
      }
      if (progress >= 1) {
        motionFrameId = 0;
        stopMotionPreview(false);
        renderNow();
        aiStatusText(tr("liquid_cover_ai_motion_preview_done", "Preview complete."));
        return;
      }
      motionFrameId = requestAnimationFrame(tick);
    };
    motionFrameId = requestAnimationFrame(tick);
  }
  async function previewMotionOnce() {
    if (!renderer) return;
    stopMotionPreview(false);
    const duration = motionDurationSeconds();
    if (motionVideo) {
      await seekMotionVideo(0);
      motionVideo.loop = false;
      motionVideo.muted = true;
      motionVideo.playbackRate = (motionVideo.duration && isFinite(motionVideo.duration))
        ? clampNum(motionVideo.duration / duration, 0.25, 4, 1)
        : 1;
      await motionVideo.play().catch(() => {});
    }
    motionPreviewActive = true;
    $("lc-motion-preview")?.setAttribute("aria-pressed", "true");
    motionPreviewStart = performance.now();
    motionPreviewLastRender = 0;
    aiStatusText(tr("liquid_cover_ai_motion_previewing", "Previewing animation…"));
    scheduleMotionPreview();
  }
  function clearMotionVideo(restoreStill) {
    stopMotionPreview(false);
    if (motionVideo) {
      try { motionVideo.pause(); } catch (e) { /* noop */ }
    }
    if (motionVideoUrl) URL.revokeObjectURL(motionVideoUrl);
    motionVideo = null;
    motionVideoUrl = "";
    const clear = $("lc-motion-clear");
    if (clear) clear.hidden = true;
    const name = $("lc-motion-name");
    if (name) {
      name.setAttribute("data-i18n", "no_files_selected");
      name.textContent = tr("no_files_selected", "No files selected");
    }
    if (restoreStill !== false) setBg(lastStillBgSource || neutralBg());
  }
  function setMotionVideoFile(file) {
    clearMotionVideo(false);
    const video = document.createElement("video");
    motionVideoUrl = URL.createObjectURL(file);
    motionVideo = video;
    video.preload = "auto";
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    const name = $("lc-motion-name");
    if (name) {
      name.removeAttribute("data-i18n");
      name.textContent = file.name || "Motion video";
    }
    const clear = $("lc-motion-clear");
    if (clear) clear.hidden = false;
    aiStatusText(tr("liquid_cover_ai_motion_loading", "Loading motion video…"));
    let firstFramePainted = false;
    const paintVideoFrame = () => {
      if (motionVideo !== video || !renderer || renderer.bgVideo !== video) return false;
      const painted = renderer.updateBackgroundVideoFrame();
      if (painted) {
        renderNow();
        if (!firstFramePainted) {
          firstFramePainted = true;
          aiStatusText(tr("liquid_cover_ai_motion_loaded", "Motion video loaded."));
        }
      }
      return painted;
    };
    const requestFirstFrame = () => {
      if (typeof video.requestVideoFrameCallback !== "function") return;
      video.requestVideoFrameCallback(() => {
        paintVideoFrame();
      });
    };
    video.addEventListener("loadedmetadata", () => {
      if (motionVideo !== video || !renderer) return;
      lastBgSource = video;
      renderer.setBackgroundVideo(video);
      updateExportDimNote();
      const dur = $("lc-motion-duration");
      if (dur && isFinite(video.duration) && video.duration > 0) {
        dur.value = clampNum(video.duration, 1, 6, 2).toFixed(1);
        syncValueLabels();
      }
      paintVideoFrame();
      requestFirstFrame();
    });
    video.addEventListener("loadeddata", () => {
      paintVideoFrame();
      requestFirstFrame();
    });
    video.addEventListener("canplay", paintVideoFrame);
    video.addEventListener("playing", () => {
      paintVideoFrame();
      requestFirstFrame();
    });
    video.addEventListener("error", () => aiStatus("motion_load_error", "Motion video could not be loaded."));
    video.src = motionVideoUrl;
    video.load();
  }

  // --- production export: render at the SOURCE photo's full resolution ---
  // Design dims define layout; export multiplies them up to the imported photo's
  // native long edge (so a 6000×4000 import exports 6000×4000), clamped to the
  // GPU's max texture size. Never downscales below the preview.
  // MAX_TEXTURE_SIZE is not what a canvas can actually hold: browsers clamp the
  // drawing buffer lower (7680x4320 on this Mac, with 16384 reported), and a
  // clamped buffer renders a cropped, zoomed corner of the cover. Probe the
  // real limit with a scratch canvas of the same shape.
  const drawingFitCache = new Map();
  function drawingBufferFits(w, h) {
    const key = w + "x" + h;
    if (drawingFitCache.has(key)) return drawingFitCache.get(key);
    let ok = false;
    try {
      // context first, resize after: that is how the cover canvas grows
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false });
      c.width = w; c.height = h;
      ok = !!gl && gl.drawingBufferWidth === w && gl.drawingBufferHeight === h;
      if (gl) { const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext(); }
    } catch (e) { ok = false; }
    drawingFitCache.set(key, ok);
    return ok;
  }
  function exportTargetDims() {
    const a = ASPECTS[activeAspectKey()] || [DESIGN_W, DESIGN_H];
    const baseW = a[0], baseH = a[1], baseLong = Math.max(baseW, baseH);
    const sel = $("lc-export-res");
    const mode = sel ? sel.value : "source";
    let scale;
    if (mode === "source") {
      const nw = sourceWidth(lastBgSource);
      const nh = sourceHeight(lastBgSource);
      const nativeLong = Math.max(nw, nh);
      scale = nativeLong ? nativeLong / baseLong : 4;
    } else {
      scale = +mode || 1;
    }
    scale = Math.max(1, scale);
    const maxTex = (renderer && renderer.gl && renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)) || 4096;
    if (baseLong * scale > maxTex) scale = maxTex / baseLong;
    // shrink until the canvas can really hold the render (binary search, whole px)
    if (!drawingBufferFits(Math.round(baseW * scale), Math.round(baseH * scale))) {
      let lo = 1, hi = scale;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (drawingBufferFits(Math.round(baseW * mid), Math.round(baseH * mid))) lo = mid; else hi = mid;
      }
      scale = lo;
    }
    return { scale, w: Math.round(baseW * scale), h: Math.round(baseH * scale) };
  }
  function updateExportDimNote() {
    const el = $("lc-export-dim"); if (!el) return;
    const d = exportTargetDims();
    el.textContent = (typeof t === "function" && t("liquid_cover_export_dim_prefix") || "PNG") + " " + d.w + " × " + d.h + " px";
  }
  let pngExportInFlight = false;
  async function exportPng() {
    if (!renderer || pngExportInFlight) return;
    pngExportInFlight = true;
    const d = exportTargetDims();
    const exportButton = $("lc-export");
    liquid.hold = true;
    setBusy(exportButton, true, tr("liquid_cover_ai_exporting", "Rendering…"));
    try {
      aiStatusText(tr("liquid_cover_ai_exporting", "Rendering") + " " + d.w + "×" + d.h + "…");
      // Let the real busy state paint before the CPU-intensive SDF rebuild.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      // Export supersampling keeps the promised output size, with smoother
      // letter edges. Respect the current GPU texture limit.
      const maxTex = (renderer.gl && renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)) || 4096;
      const ss = (d.w * 2 <= maxTex && d.h * 2 <= maxTex && drawingBufferFits(d.w * 2, d.h * 2)) ? 2 : 1;
      renderScale = d.scale * ss;
      EXPORT_W = d.w * ss; EXPORT_H = d.h * ss;
      canvas.width = EXPORT_W; canvas.height = EXPORT_H;
      rebuildAllSDF();
      renderer.render(readParams());
      let blobSource = canvas;
      if (ss > 1) {
        const down = document.createElement("canvas");
        down.width = d.w; down.height = d.h;
        const ctx = down.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(canvas, 0, 0, d.w, d.h);
        blobSource = down;
      }
      const blob = await new Promise((resolve) => blobSource.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG encoding failed");
      await downloadBlob(blob, "liquid-glass-" + d.w + "x" + d.h + ".png");
      aiStatusText(tr("liquid_cover_ai_exported", "Exported") + " " + d.w + "×" + d.h + " PNG");
    } catch (e) {
      aiStatus("error", tr("liquid_cover_export_failed", "Could not export PNG. Try a smaller output size."));
    } finally {
      applyAspect(DESIGN_W, DESIGN_H);
      rebuildAllSDF(); renderNow();
      pngExportInFlight = false;
      updateThumbnailPreview();
      setBusy(exportButton, false);
      liquid.hold = false;
      if (liquid.energy > 0) wakeLiquid();
    }
  }

  function pickVideoMime() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const candidates = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }
  function seekMotionVideo(time) {
    if (!motionVideo) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        motionVideo.removeEventListener("seeked", done);
        resolve();
      };
      motionVideo.addEventListener("seeked", done, { once: true });
      try {
        motionVideo.currentTime = Math.max(0, Math.min(time, motionVideo.duration || time || 0));
      } catch (e) {
        motionVideo.removeEventListener("seeked", done);
        resolve();
      }
      setTimeout(done, 600);
    });
  }
  // Stills and motion covers leave through the shared artifact exit.
  function downloadBlob(blob, name) {
    return window.AISystem6WebPlatform.saveArtifact({ blob, fileName: name, mimeType: blob?.type || "" });
  }
  async function exportVideo() {
    if (!renderer) return;
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      aiStatus("motion_unsupported", "Video export is not supported in this browser.");
      return;
    }
    const mimeType = pickVideoMime();
    const duration = motionDurationSeconds();
    const fps = 30;
    const prevMuted = motionVideo ? motionVideo.muted : true;
    const prevPlaybackRate = motionVideo ? motionVideo.playbackRate : 1;
    const prevExportW = EXPORT_W, prevExportH = EXPORT_H, prevScale = renderScale;
    const exportButton = $("lc-motion-export");
    stopMotionPreview();
    motionExporting = true;
    motionExportProgress = 0;
    setBusy(exportButton, true, tr("liquid_cover_ai_motion_exporting", "Recording video…"));
    try {
      renderScale = 1;
      EXPORT_W = DESIGN_W;
      EXPORT_H = DESIGN_H;
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      rebuildAllSDF();
      if (motionVideo) {
        await seekMotionVideo(0);
        motionVideo.loop = false;
        motionVideo.playbackRate = (motionVideo.duration && isFinite(motionVideo.duration))
          ? clampNum(motionVideo.duration / duration, 0.25, 4, 1)
          : 1;
        motionVideo.muted = !$("lc-motion-audio")?.checked;
        await motionVideo.play().catch(() => {});
      }
      const stream = canvas.captureStream(fps);
      const sourceStream = motionVideo && $("lc-motion-audio")?.checked && typeof motionVideo.captureStream === "function"
        ? motionVideo.captureStream()
        : null;
      if (sourceStream) {
        sourceStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
      const chunks = [];
      const recorder = new MediaRecorder(stream, Object.assign(
        { videoBitsPerSecond: 9000000 },
        mimeType ? { mimeType } : {},
      ));
      const stopped = new Promise((resolve) => {
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = resolve;
      });
      aiStatusText(tr("liquid_cover_ai_motion_exporting", "Recording video…"));
      recorder.start(200);
      const started = performance.now();
      await new Promise((resolve) => {
        const tick = (now) => {
          motionExportProgress = clampNum((now - started) / (duration * 1000), 0, 1, 0);
          renderNow();
          if (motionExportProgress < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const outType = mimeType || (chunks[0] && chunks[0].type) || "video/webm";
      const blob = new Blob(chunks, { type: outType });
      const ext = /mp4/i.test(outType) ? "mp4" : "webm";
      downloadBlob(blob, "liquid-glass-intro-" + DESIGN_W + "x" + DESIGN_H + "." + ext);
      aiStatusText(tr("liquid_cover_ai_motion_exported", "Video exported."));
    } catch (e) {
      aiStatus("motion_error", "Video export failed.");
    } finally {
      if (motionVideo) {
        motionVideo.muted = prevMuted;
        motionVideo.loop = false;
        motionVideo.playbackRate = prevPlaybackRate;
        try { motionVideo.pause(); } catch (e) { /* noop */ }
      }
      motionExporting = false;
      motionExportProgress = 0;
      renderScale = prevScale;
      EXPORT_W = prevExportW;
      EXPORT_H = prevExportH;
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      rebuildAllSDF();
      renderNow();
      setBusy(exportButton, false);
    }
  }

  // Downscale the current background to a compact JPEG data URL so a
  // vision-capable model can read it (complementary tint / light direction).
  function currentBgDataUrl(maxEdge) {
    if (!lastBgSource) return null;
    const w = sourceWidth(lastBgSource);
    const h = sourceHeight(lastBgSource);
    if (!w || !h) return null;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const ctx = c.getContext("2d");
    ctx.drawImage(lastBgSource, 0, 0, cw, ch);
    try { return c.toDataURL("image/jpeg", 0.85); } catch (e) { return null; }
  }

  // A light separable box blur on the distance field. The Felzenszwalb EDT on a
  // pixel raster yields a faceted field (nearest-edge-pixel Voronoi cells); those
  // facets become a ribbed edge when zoomed. Smoothing the field removes them and
  // gives the soft, rounded glass edge — radius scales with resolution so the
  // amount of rounding looks the same at preview and at a 6000px export.
  function smoothSDF(f, w, h) {
    const r = Math.max(1, Math.round(1.5 * (h / 1000)));
    const norm = 1 / (2 * r + 1);
    const tmp = new Float32Array(f.length);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) { let xx = x + k; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1; s += f[row + xx]; }
        tmp[row + x] = s * norm;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let s = 0;
        for (let k = -r; k <= r; k++) { let yy = y + k; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1; s += tmp[yy * w + x]; }
        f[y * w + x] = s * norm;
      }
    }
    return f;
  }
  function measureAlphaBounds(alpha, width, height) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (alpha[y * width + x] < 8) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) {
      return { left: -0.05, right: 0.05, bottom: -0.05, top: 0.05 };
    }
    return {
      left: minX / width - 0.5,
      right: (maxX + 1) / width - 0.5,
      bottom: 0.5 - (maxY + 1) / height,
      top: 0.5 - minY / height,
    };
  }
  function rebuildLayerSDF(i) {
    if (!renderer) return;
    const L = layers[i];
    const r = (L.shape || L.shapeKind)
      ? rasterizeShape({ image: L.shape, kind: L.shapeKind, width: EXPORT_W, height: EXPORT_H, sizePx: L.fontSize * 2 * renderScale, rotationDeg: L.rotation })
      : rasterizeText({ text: L.text || " ", width: EXPORT_W, height: EXPORT_H, fontFamily: L.font, fontWeight: L.fontWeight, fontSize: L.fontSize * renderScale, letterSpacing: L.letterSpacing * renderScale, rotationDeg: L.rotation });
    L._localBounds = measureAlphaBounds(r.alpha, r.width, r.height);
    const sdf = alphaToSignedDistance(r.alpha, r.width, r.height, true);
    smoothSDF(sdf, r.width, r.height); // remove EDT facets → smooth, rounded glass edge
    let mn = 0; for (let k = 0; k < sdf.length; k++) { if (sdf[k] < mn) mn = sdf[k]; }
    L._strokeHalfPx = -mn; // measured letterform thickness (from the smoothed field), in export px
    renderer.setLayerSDF(i, sdf, r.width, r.height);
  }
  function rebuildAllSDF() { layers.forEach((_, i) => rebuildLayerSDF(i)); }

  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

  // Thickness is the most fragile control: the refraction band grows inward from
  // every edge, so a fixed value that exceeds a stroke's half-width collapses the
  // clear centre and makes the two edges fight. We keep the user's number as
  // intent but never RENDER more than ~92% of the measured letterform half-width,
  // so thin fonts and big export sizes can't blow it out.
  function effectiveThickness(L) {
    // Thickness is a PROPORTION of the letterform, not absolute pixels. The slider
    // is "% of the stroke half-width", so the same value gives the same glass on a
    // 100px or a 360px title, on a 1280 or a 6000px canvas — it no longer has to be
    // re-tuned per photo / per size. A fixed pixel thickness ignored font size and
    // the title's scale within the frame, which is exactly why it felt wrong.
    const halfCss = L._strokeHalfPx ? L._strokeHalfPx / currentDPR() : 0;
    const frac = clampNum(L.refThickness, 0, 100, 60) / 100;
    if (!halfCss) return Math.max(2, frac * 18); // pre-measure fallback
    return halfCss * Math.min(frac, 0.96); // never fully fill the stroke (keep a clear centre)
  }
  // Frost in resolution-independent terms: the slider is "frost at 1080p"; the
  // pixel kernel scales with the actual export height (and is hard-capped at the
  // shader's MAX_R) so the same value looks identical at 1080p and 4K.
  function scaledBlurRadius() {
    const raw = +$("lc-blur-radius").value || 0;
    if (raw <= 0) return 0;
    return Math.max(0, Math.min(96, Math.round(raw * (EXPORT_H / 1080))));
  }
  // Liquid merge groups: top-level glass layers merge with each other; text
  // linked inside a shape merges only with its siblings in that shape, so it
  // keeps stacking on top of the shape. Solid and hidden layers never merge.
  // Value = index of the group's first layer (what the shader expects).
  function mergeGroupsFor(list) {
    const firstByKey = new Map();
    return list.map((L, i) => {
      if (L.hidden || isSolidLayer(L)) return -1;
      const key = L.parentId || "";
      if (!firstByKey.has(key)) firstByKey.set(key, i);
      return firstByKey.get(key);
    });
  }
  // Magnification centre per layer. Merged glass is one piece, so every member
  // of a group gets the centre of the group's combined bounds — per-member
  // centres would bend the magnified backdrop through the bridge.
  function layerCenters(list, groups) {
    const boxes = new Map();
    const keyOf = (i) => (groups[i] >= 0 ? "g" + groups[i] : "l" + i);
    list.forEach((L, i) => {
      const b = worldBounds(L);
      const u = boxes.get(keyOf(i));
      boxes.set(keyOf(i), u ? { left: Math.min(u.left, b.left), right: Math.max(u.right, b.right), bottom: Math.min(u.bottom, b.bottom), top: Math.max(u.top, b.top) } : b);
    });
    return list.map((L, i) => {
      const b = boxes.get(keyOf(i));
      return [(b.left + b.right) / 2, (b.bottom + b.top) / 2];
    });
  }
  // Post Blur shares Frost's resolution-independent scale (value at 1080p).
  function scaledPostBlurRadius() {
    const raw = +($("lc-post-blur") && $("lc-post-blur").value) || 0;
    if (raw <= 0) return 0;
    return Math.max(1, Math.min(96, Math.round(raw * (EXPORT_H / 1080))));
  }
  function readParams() {
    syncRendererPictures();
    const postRadius = scaledPostBlurRadius();
    const mergeK = +($("lc-merge") && $("lc-merge").value) || 0;
    const mergeGroups = mergeK > 0 ? mergeGroupsFor(layers) : layers.map(() => -1);
    return {
      dpr: currentDPR(),
      layerCount: layers.length,
      offsets: layers.map((L) => L.hidden ? [10, 10] : [L.cx - 0.5, L.cy - 0.5]),
      layerModes: layers.map((L) => isSolidLayer(L) ? 1 : 0),
      mergeGroups,
      mergeK,
      centers: layerCenters(layers, mergeGroups),
      magnify: $("lc-magnify") ? +$("lc-magnify").value : 1,
      postBlurWeights: postRadius > 0 ? gaussianWeights(postRadius) : null,
      tints: layers.map((L) => { const c = hexToRgb(layerColor(L)); return [c[0], c[1], c[2], L.tintAlpha / 100]; }),
      thicknesses: layers.map((L) => effectiveThickness(L)),
      plan: COVER_MODEL.compositingPlan({ stack: picStack, glassSlot: picSlot, isReady: pictureReady }),
      bgLayerId: BG_LAYER_ID,
      blurScale: EXPORT_H / 1080,
      refraction: (+$("lc-refraction").value || 0) / 50, // 50 = physical n 1.5 dome
      refDispersion: +$("lc-dispersion").value,
      lightAngle: (+$("lc-light-angle").value * Math.PI) / 180, // direction the light comes from
      lightIntensity: +$("lc-light-intensity").value / 100,
      splay: +$("lc-splay").value / 100,
      brightness: +$("lc-brightness").value / 100,
      saturationFactor: +$("lc-saturation").value / 100,
      bodyFactor: glassFx.bodyFactor / 100,
      blurWeights: gaussianWeights(scaledBlurRadius()),
      shadowExpand: +$("lc-shadow-expand").value,
      shadowFactor: +$("lc-shadow-factor").value / 100,
      // the glass floats: the shadow drops further the softer it spreads
      shadowOffset: [0, -(4 + 0.35 * +$("lc-shadow-expand").value)],
      bgZoom: 1,
      bgPan: [0, 0],
      liquidMode: liquidModeValue(),
      liquidGain: liquidGain(),
      waterDepth: LIQUID_WATER_DEPTH,
    };
  }

  function easeOutCubic(x) { return 1 - Math.pow(1 - clampNum(x, 0, 1, 0), 3); }
  function readParamsAt(progress) {
    const p = readParams();
    const preset = motionPresetKey();
    if (preset === "none") return p;
    const t = clampNum(progress, 0, 1, 0);
    const reveal = easeOutCubic(t);
    if (preset === "condense") {
      p.thicknesses = p.thicknesses.map((v) => v * (0.08 + 0.92 * reveal));
      p.refraction *= reveal;
      p.lightIntensity *= reveal;
      p.bodyFactor *= reveal;
      p.magnify = 1 + (p.magnify - 1) * reveal;
      p.shadowFactor *= reveal;
      p.blurWeights = gaussianWeights(Math.min(96, Math.round(scaledBlurRadius() * (1.9 - 0.9 * reveal))));
    } else if (preset === "push") {
      const z = 0.5 - Math.cos(t * Math.PI) * 0.5;
      p.bgZoom = 1 + 0.045 * z;
      p.bgPan = [-0.012 * z, 0.006 * z];
      p.lightAngle += (12 * Math.sin(t * Math.PI * 2)) * Math.PI / 180;
    } else if (preset === "ripple" && (motionPreviewActive || motionExporting)) {
      // Drops land on the title and the water settles: the last frame is the
      // still cover, so the video ends on exactly what the PNG exports.
      if (!p.liquidMode) { p.liquidMode = 1; p.liquidGain = liquidGain(0.5); }
      p.liquidGain *= 1 - smoothstep01(0.62, 1, t);
    }
    return p;
  }
  function smoothstep01(a, b, x) { const k = clampNum((x - a) / (b - a), 0, 1, 0); return k * k * (3 - 2 * k); }

  function updateThumbnailPreview() {
    const panel = $("lc-panel-export");
    const preview = $("lc-thumbnail");
    if (!renderer || !canvas || !preview || !panel || panel.hidden || pngExportInFlight) return;
    // Fixed 320px raster; CSS may shrink it in a narrow inspector. Never resize
    // the artboard, change renderScale or touch an export setting here.
    const width = 320;
    const height = Math.max(1, Math.round(width * DESIGN_H / DESIGN_W));
    if (preview.width !== width || preview.height !== height) {
      preview.width = width; preview.height = height;
    }
    const ctx = preview.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(canvas, 0, 0, width, height);
  }
  // --- Liquid surface: live water in the editor, scripted water in video ---
  const LIQUID_HZ = 60;
  const LIQUID_DAMPING = 0.995;
  const LIQUID_SETTLE_STEPS = 900;
  const LIQUID_WATER_DEPTH = 70;
  const liquid = { frozen: false, energy: 0, last: 0, frameId: 0, hold: false, seed: 1, scripted: null };
  function liquidModeValue() {
    const v = $("lc-liquid-mode") ? $("lc-liquid-mode").value : "off";
    return v === "glass" ? 1 : v === "cover" ? 2 : 0;
  }
  function liquidGain(strength) {
    const s = strength == null ? clampNum(+($("lc-liquid-strength") && $("lc-liquid-strength").value), 0, 100, 50) / 100 : strength;
    return 180 * s;
  }
  function liquidDropRadius(scale) {
    const px = clampNum(+($("lc-liquid-drop") && $("lc-liquid-drop").value), 6, 120, 28);
    return (px * (scale || 1)) / Math.max(DESIGN_W, DESIGN_H);
  }
  function liquidReady() { return !!(renderer && renderer.rippleSize(DESIGN_W, DESIGN_H)); }
  function liquidLive() { return liquidModeValue() > 0 && !liquid.frozen && !motionPreviewActive && !motionExporting; }
  function wakeLiquid() {
    liquid.energy = LIQUID_SETTLE_STEPS;
    if (liquid.frameId || liquid.hold) return;
    liquid.last = performance.now();
    liquid.frameId = requestAnimationFrame(liquidTick);
  }
  // Runs only while the water still moves (about 15 s after the last drop),
  // then stops: a calm cover costs nothing.
  function liquidTick(now) {
    liquid.frameId = 0;
    const win = document.querySelector(".liquid-cover-window");
    if (!renderer || liquid.hold || !liquidLive() || (win && win.classList.contains("is-hidden"))) return;
    const stepMs = 1000 / LIQUID_HZ;
    let steps = Math.floor((now - liquid.last) / stepMs);
    if (steps > 4) { steps = 4; liquid.last = now; } else liquid.last += steps * stepMs;
    if (steps > 0) {
      renderer.rippleStep(steps, LIQUID_DAMPING);
      liquid.energy -= steps;
      renderNow();
    }
    if (liquid.energy > 0) liquid.frameId = requestAnimationFrame(liquidTick);
  }
  function liquidDropAt(p, big) {
    if (!liquidLive() || !$("lc-liquid-pointer")?.checked || !liquidReady()) return;
    renderer.rippleDrop(p.x, p.y, liquidDropRadius(big ? 1.5 : 1), big ? 0.14 : 0.012);
    wakeLiquid();
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // A drop on each visible glass layer plus a few smaller ones around it.
  function liquidDropPlan(seed, spanSteps) {
    const rnd = mulberry32(seed);
    const long = Math.max(DESIGN_W, DESIGN_H);
    const drops = [];
    layers.forEach((L, i) => {
      if (L.hidden || isSolidLayer(L)) return;
      const b = worldBounds(L);
      const hPx = Math.abs(b.top - b.bottom) * DESIGN_H;
      drops.push({ step: i * 5, x: (b.left + b.right) / 2, y: (b.bottom + b.top) / 2, r: clampNum(hPx * 0.55, 18, 140, 40) / long, s: 0.16 });
    });
    const extra = Math.max(3, Math.round(spanSteps / 40));
    for (let k = 0; k < extra; k++) {
      drops.push({ step: 6 + Math.floor(rnd() * spanSteps), x: 0.08 + rnd() * 0.84, y: 0.1 + rnd() * 0.8, r: (10 + rnd() * 26) / long, s: 0.04 + rnd() * 0.06 });
    }
    return drops.sort((a, b) => a.step - b.step);
  }
  function liquidRain() {
    if (liquidModeValue() === 0) { $("lc-liquid-mode").value = "glass"; syncLiquidControls(); }
    if (liquid.frozen) setLiquidFrozen(false);
    if (!liquidReady()) return;
    // the plan's later drops are scheduled into the live loop
    const plan = liquidDropPlan(liquid.seed++, 36);
    const start = performance.now();
    plan.forEach((d) => setTimeout(() => {
      if (!liquidLive() || !liquidReady()) return;
      renderer.rippleDrop(d.x, d.y, d.r, d.s);
      wakeLiquid();
    }, Math.max(0, d.step * (1000 / LIQUID_HZ) - (performance.now() - start))));
  }
  function setLiquidFrozen(on) {
    liquid.frozen = !!on;
    $("lc-liquid-freeze")?.setAttribute("aria-pressed", on ? "true" : "false");
    if (!on && liquid.energy > 0) wakeLiquid();
  }
  function liquidCalm() {
    if (renderer) renderer.rippleReset();
    liquid.energy = 0;
    renderNow();
  }
  function syncLiquidControls() {
    const supported = !renderer || renderer.rippleOK;
    const on = supported && liquidModeValue() > 0;
    ["lc-liquid-strength", "lc-liquid-drop", "lc-liquid-pointer", "lc-liquid-freeze", "lc-liquid-calm"].forEach((id) => { const el = $(id); if (el) el.disabled = !on; });
    const mode = $("lc-liquid-mode");
    if (mode) mode.disabled = !supported;
    const rain = $("lc-liquid-rain");
    if (rain) rain.disabled = !supported;
    const note = $("lc-liquid-note");
    if (note && !supported) note.textContent = tr("liquid_cover_liquid_unsupported", "This browser cannot render the water (no float render targets).");
  }
  // Video: the field is replayed from calm on every run, step by step from the
  // motion progress, so preview and export see the same water.
  function driveScriptedRipple(progress) {
    if (!liquidReady()) return;
    const duration = motionDurationSeconds();
    const target = Math.round(clampNum(progress, 0, 1, 0) * duration * LIQUID_HZ);
    let s = liquid.scripted;
    if (!s || s.duration !== duration || target < s.step) {
      renderer.rippleReset();
      s = liquid.scripted = { duration, step: 0, next: 0, plan: liquidDropPlan(0x5eed, Math.round(duration * LIQUID_HZ * 0.45)) };
    }
    while (s.step < target) {
      while (s.next < s.plan.length && s.plan[s.next].step <= s.step) {
        const d = s.plan[s.next++];
        renderer.rippleDrop(d.x, d.y, d.r, d.s);
      }
      renderer.rippleStep(1, LIQUID_DAMPING);
      s.step++;
    }
  }

  function renderNow() {
    if (!renderer) return;
    const scripted = motionPresetKey() === "ripple" && (motionPreviewActive || motionExporting);
    if (scripted) driveScriptedRipple(motionProgress());
    else if (liquid.scripted) { liquid.scripted = null; renderer.rippleReset(); }
    renderer.render(readParamsAt(motionProgress()));
    updateThumbnailPreview();
  }

  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderNow();
      updateSelectionOverlay();
    });
  }

  // Theme CSS draws each range as a filled track (Classic uses black-white
  // System 6 chrome; Liquid Glass uses system-blue). CSS can't compute
  // "percent of range filled", so we feed it as the --lc-fill custom property.
  function updateSliderFill(el) {
    const min = el.min === "" ? 0 : +el.min;
    const max = el.max === "" ? 100 : +el.max;
    const pct = max > min ? ((+el.value - min) / (max - min)) * 100 : 0;
    el.style.setProperty("--lc-fill", clampNum(pct, 0, 100, 0) + "%");
  }
  function syncValueLabels() {
    document.querySelectorAll("#liquid-cover-app input[type=range]").forEach((el) => {
      const v = $(el.id + "-v"); if (v) v.textContent = el.value;
      updateSliderFill(el);
    });
  }

  function loadLayerIntoPanel() {
    const L = layers[sel];
    $("lc-text").value = L.text;
    $("lc-font").value = L.font;
    $("lc-font-size").value = L.fontSize;
    $("lc-font-weight").value = L.fontWeight;
    $("lc-letter-spacing").value = L.letterSpacing;
    $("lc-rotation").value = L.rotation;
    $("lc-thickness").value = L.refThickness;
    $("lc-layer-solid").checked = isSolidLayer(L);
    $("lc-thickness").disabled = isSolidLayer(L) || L.locked;
    $("lc-tint-color").value = layerColor(L);
    $("lc-tint-alpha").value = L.tintAlpha;
    $("lc-tint-alpha").disabled = isSolidLayer(L) || L.locked;
    [
      "lc-text", "lc-font", "lc-font-size", "lc-font-weight", "lc-letter-spacing",
      "lc-rotation", "lc-layer-solid", "lc-tint-color",
    ].forEach((id) => { $(id).disabled = !!L.locked; });
    // keep the custom System 6 dropdown's visible label in sync with the value
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    syncValueLabels();
    syncWorkbenchReadout();
  }

  function isShapeLayer(L) {
    return !!(L && (L.shape || L.shapeKind));
  }

  function worldBounds(L, cx, cy) {
    const b = L?._localBounds || { left: -0.08, right: 0.08, bottom: -0.08, top: 0.08 };
    const x = cx == null ? L.cx : cx;
    const y = cy == null ? L.cy : cy;
    return {
      left: x + b.left,
      right: x + b.right,
      bottom: y + b.bottom,
      top: y + b.top,
    };
  }

  function linkedChildren(L) {
    if (!L || !isShapeLayer(L)) return [];
    return layers.filter((item) => item.parentId === L.id);
  }

  function linkedFamily(L) {
    if (!L) return [];
    const parent = L.parentId ? layers.find((item) => item.id === L.parentId) : L;
    if (!parent) return [L];
    return [parent, ...linkedChildren(parent)];
  }

  function uniqueLayers(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function selectedPositionRoots() {
    const selected = selectedLayersInStack();
    return selected.filter((L) => !L.hidden && !L.locked && (!L.parentId || !selectedLayerIds.has(L.parentId)));
  }

  function selectedPositionMembers() {
    return uniqueLayers(selectedPositionRoots().flatMap((L) => [L, ...linkedChildren(L).filter((child) => !child.hidden)]));
  }

  function selectedReorderUnit(seed) {
    const selected = selectedLayerIds.has(seed?.id) ? selectedLayersInStack() : [seed];
    return uniqueLayers(selected.flatMap((L) => linkedFamily(L))).sort((a, b) => layers.indexOf(a) - layers.indexOf(b));
  }

  function boundsUnion(items) {
    if (!items.length) return null;
    return items.reduce((acc, item) => {
      const b = item.left == null ? worldBounds(item) : item;
      if (!acc) return { ...b };
      acc.left = Math.min(acc.left, b.left);
      acc.right = Math.max(acc.right, b.right);
      acc.bottom = Math.min(acc.bottom, b.bottom);
      acc.top = Math.max(acc.top, b.top);
      return acc;
    }, null);
  }

  function unitBoundsForLayer(L) {
    return boundsUnion([L, ...linkedChildren(L).filter((child) => !child.hidden)]);
  }

  function updateSelectionOverlay() {
    const box = $("lc-selection-box");
    if (!box || !canvas) return;
    const glassMembers = selectedPositionMembers();
    const pictureBounds = selectedStackLayers().filter(pictureMovable).map(pictureBoundsUV);
    const bounds = boundsUnion([...glassMembers, ...pictureBounds]);
    if (!bounds || !(glassMembers.length + pictureBounds.length)) {
      box.classList.remove("is-visible", "has-single-transform");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const shellRect = box.parentElement.getBoundingClientRect();
    const left = rect.left - shellRect.left + bounds.left * rect.width;
    const top = rect.top - shellRect.top + (1 - bounds.top) * rect.height;
    box.style.setProperty("--lc-selection-left", left + "px");
    box.style.setProperty("--lc-selection-top", top + "px");
    box.style.setProperty("--lc-selection-width", Math.max(1, (bounds.right - bounds.left) * rect.width) + "px");
    box.style.setProperty("--lc-selection-height", Math.max(1, (bounds.top - bounds.bottom) * rect.height) + "px");
    box.classList.add("is-visible");
    box.classList.toggle("has-single-transform", movableItems().length === 1);
  }

  function setLayerPosition(L, x, y, moveChildren) {
    if (!L) return;
    const nx = clampNum(x, -0.5, 1.5, L.cx);
    const ny = clampNum(y, -0.5, 1.5, L.cy);
    const dx = nx - L.cx;
    const dy = ny - L.cy;
    L.cx = nx;
    L.cy = ny;
    if (moveChildren && (dx || dy)) {
      linkedChildren(L).forEach((child) => {
        child.cx = clampNum(child.cx + dx, -0.5, 1.5, child.cx);
        child.cy = clampNum(child.cy + dy, -0.5, 1.5, child.cy);
      });
    }
  }

  function selectedMoveUnit() {
    return selectedReorderUnit(layers[sel]);
  }

  function canMoveSelected(direction) {
    const unit = selectedMoveUnit();
    const indices = unit.map((L) => layers.indexOf(L));
    if (direction === "up") return Math.max(...indices) < layers.length - 1;
    return Math.min(...indices) > 0;
  }

  function moveSelectedLayer(where) {
    if (stackFocus()) { moveSelectedStack(where); return; }
    const selected = layers[sel];
    if (!selected || selected.locked || layers.length < 2) return;
    const unit = selectedMoveUnit();
    const indices = unit.map((L) => layers.indexOf(L)).sort((a, b) => a - b);
    if (where === "up" && Math.max(...indices) >= layers.length - 1) return;
    if (where === "down" && Math.min(...indices) <= 0) return;
    beginHistory("liquid_cover_reorder_action", "Reorder layers");
    const first = Math.min(...indices);
    const rest = layers.filter((L) => !unit.includes(L));
    let insertAt = first;
    if (where === "top") insertAt = rest.length;
    if (where === "bottom") insertAt = 0;
    if (where === "up") insertAt = Math.min(rest.length, first + 1);
    if (where === "down") insertAt = Math.max(0, first - 1);
    layers.length = 0;
    rest.slice(0, insertAt).forEach((L) => layers.push(L));
    unit.forEach((L) => layers.push(L));
    rest.slice(insertAt).forEach((L) => layers.push(L));
    sel = layers.indexOf(selected);
    rebuildAllSDF();
    renderLayerList();
    loadLayerIntoPanel();
    scheduleRender();
    commitHistory();
  }

  function addTextInsideSelectedShape() {
    const shape = layers[sel];
    if (!isShapeLayer(shape) || layers.length >= MAX_LAYERS) return;
    beginHistory("liquid_cover_add_action", "Add layer");
    const textLayer = makeLayer({
      parentId: shape.id,
      text: tr("liquid_cover_inside_text_default", "Text"),
      fontSize: clampNum(shape.fontSize * 0.42, 48, 150, 72),
      cx: shape.cx,
      cy: shape.cy,
      renderMode: "solid",
      solidColor: "#ffffff",
      refThickness: shape.refThickness,
    });
    layers.splice(sel + 1, 0, textLayer);
    selectOnly(layers.indexOf(textLayer));
    rebuildAllSDF();
    loadLayerIntoPanel();
    renderLayerList();
    setInspectorPanel("layers");
    scheduleRender();
    commitHistory();
  }

  function removeSelectedLayer() {
    if (stackFocus()) { removeSelectedStack(); return; }
    const removed = selectedLayersInStack().filter((L) => !L.locked);
    if (!removed.length || layers.length - removed.length < 1) return;
    beginHistory("liquid_cover_delete_action", "Delete layer");
    const removedIds = new Set(removed.map((L) => L.id));
    const remaining = layers.filter((L) => !removedIds.has(L.id));
    remaining.forEach((L) => {
      if (removedIds.has(L.parentId)) L.parentId = null;
    });
    layers.length = 0;
    remaining.forEach((L) => layers.push(L));
    selectedLayerIds.clear();
    sel = Math.min(sel, layers.length - 1);
    selectedLayerIds.add(layers[sel].id);
    rebuildAllSDF();
    loadLayerIntoPanel();
    renderLayerList();
    setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
    scheduleRender();
    commitHistory();
  }

  function layerDisplayName(L) {
    const fallback = isShapeLayer(L)
      ? tr("liquid_cover_layer_shape", "Shape")
      : tr("liquid_cover_layer_text", "Text");
    return (L.name || (L.text || "").split("\n")[0] || fallback).slice(0, 40);
  }

  function duplicateSelectedLayers() {
    if (stackFocus()) { duplicateSelectedStack(); return; }
    if (layers.length >= MAX_LAYERS) return;
    const source = selectedReorderUnit(layers[sel]);
    const capacity = MAX_LAYERS - layers.length;
    const copiesFrom = source.length <= capacity ? source : [layers[sel]];
    if (!copiesFrom.length) return;
    beginHistory("liquid_cover_duplicate_action", "Duplicate layer");
    const idMap = new Map();
    const copies = copiesFrom.map((L) => {
      const sourceCopy = cloneLayerForHistory(L);
      delete sourceCopy.id;
      const copy = makeLayer({
        ...sourceCopy,
        name: L.name,
        cx: clampNum(L.cx + 16 / DESIGN_W, -0.5, 1.5, L.cx),
        cy: clampNum(L.cy - 16 / DESIGN_H, -0.5, 1.5, L.cy),
        hidden: false,
        locked: false,
      });
      idMap.set(L.id, copy.id);
      return copy;
    });
    copies.forEach((copy, index) => {
      const originalParent = copiesFrom[index].parentId;
      copy.parentId = idMap.get(originalParent) || null;
    });
    copies.forEach((copy) => layers.push(copy));
    selectedLayerIds.clear();
    copies.forEach((copy) => selectedLayerIds.add(copy.id));
    sel = layers.indexOf(copies[copies.length - 1]);
    rebuildAllSDF();
    renderLayerList();
    loadLayerIntoPanel();
    setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
    scheduleRender();
    commitHistory();
  }

  // The stack is in focus when a picture or adjustment is selected and no glass layer is.
  function stackFocus() {
    return !!selStack && selectedStackIds.has(selStack) && !selectedLayerIds.size;
  }
  function canMoveStack(direction) {
    const S = primaryStackLayer();
    if (!S || S.locked || S.id === BG_LAYER_ID) return false;
    const i = picStack.indexOf(S);
    return direction === "up" ? (i < picStack.length - 1 || i === picSlot - 1) : (i > 1 || i === picSlot);
  }
  function renderLayerList() {
    ensureSelection();
    if (layersPanel) layersPanel.render();
    const stackMode = stackFocus();
    const removableGlass = selectedLayersInStack().filter((L) => !L.locked).length;
    const removableStack = selectedStackLayers().filter((S) => S.id !== BG_LAYER_ID && !S.locked).length;
    const layersFull = layers.length >= MAX_LAYERS;
    $("lc-del-layer").disabled = stackMode ? !removableStack : (!removableGlass || layers.length - removableGlass < 1);
    $("lc-duplicate-layer").disabled = stackMode ? !removableStack : layersFull;
    $("lc-add-layer").disabled = layersFull;
    ["lc-add-layer", "lc-duplicate-layer", "lc-add-shape", "lc-shape-circle", "lc-shape-squircle", "lc-shape-capsule", "lc-add-inside-text"].forEach((id) => {
      const b = $(id);
      if (!b) return;
      if (layersFull && !(stackMode && id === "lc-duplicate-layer")) b.dataset.balloonHelpDisabled = "balloon_cover_layers_full";
      else if (b.dataset.balloonHelpDisabled === "balloon_cover_layers_full") {
        delete b.dataset.balloonHelpDisabled;
      }
    });
    ["lc-add-shape", "lc-shape-circle", "lc-shape-squircle", "lc-shape-capsule"].forEach((id) => {
      const b = $(id); if (b) b.disabled = layersFull;
    });
    $("lc-add-inside-text").disabled = stackMode || !isShapeLayer(layers[sel]) || layersFull;
    const primaryLocked = !!layers[sel]?.locked;
    $("lc-layer-bottom").disabled = stackMode ? !canMoveStack("down") : (primaryLocked || !canMoveSelected("down"));
    $("lc-layer-down").disabled = stackMode ? !canMoveStack("down") : (primaryLocked || !canMoveSelected("down"));
    $("lc-layer-up").disabled = stackMode ? !canMoveStack("up") : (primaryLocked || !canMoveSelected("up"));
    $("lc-layer-top").disabled = stackMode ? !canMoveStack("up") : (primaryLocked || !canMoveSelected("up"));
    const movable = movableItems().length;
    document.querySelectorAll(".lc-align-selection .btn").forEach((b) => { b.disabled = movable < 2; });
    document.querySelectorAll(".lc-distribute-selection .btn").forEach((b) => { b.disabled = movable < 3; });
    const exportBtn = $("lc-export");
    if (exportBtn) {
      const hasScene = !!lastBgSource || layers.some((layer) => String(layer?.text || "").trim());
      exportBtn.disabled = !hasScene;
      exportBtn.dataset.balloonHelpDisabled = "balloon_cover_needs_image";
    }
    syncWorkbenchReadout();
    updateSelectionOverlay();
  }

  function addBuiltinShape(kind, labelKey, fallback) {
    if (layers.length >= MAX_LAYERS) return;
    beginHistory("liquid_cover_add_action", "Add layer");
    layers.push(makeLayer({
      shapeKind: kind,
      renderMode: "glass",
      text: tr(labelKey, fallback),
      cx: 0.5,
      cy: Math.max(0.15, 0.5 - (layers.length - 1) * 0.18),
    }));
    selectOnly(layers.length - 1);
    rebuildLayerSDF(sel);
    loadLayerIntoPanel();
    renderLayerList();
    setInspectorPanel("glass");
    scheduleRender();
    commitHistory();
  }

  function buildBgRow() {
    const row = $("lc-bg-row"); row.innerHTML = "";
    BG_URLS.forEach((url, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lc-bg-item" + (i === activeBg ? " is-active" : "");
      b.style.backgroundImage = "url(" + url + ")";
      b.setAttribute("aria-label", tr("liquid_cover_background", "Background") + " " + (i + 1));
      b.setAttribute("aria-pressed", i === activeBg ? "true" : "false");
      // hide the swatch if that photo isn't present on disk
      const probe = new Image();
      probe.onerror = () => { b.style.display = "none"; };
      probe.src = url;
      b.addEventListener("click", () => {
        activeBg = i;
        Array.prototype.forEach.call(row.children, (x, j) => {
          const active = j === i;
          x.classList.toggle("is-active", active);
          x.setAttribute("aria-pressed", active ? "true" : "false");
        });
        setBgFromUrl(url);
      });
      row.appendChild(b);
    });
  }

  function loadImageFile(file, cb) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); cb(img); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }
  // A cut-out exported from the background photo keeps that photo's aspect
  // ratio; that is the signal to register it to the backdrop. A subject
  // cropped to its own bounds has some other aspect and is placed freely.
  function subjectMatchesBackdrop(img) {
    const bg = lastStillBgSource;
    const bw = sourceWidth(bg), bh = sourceHeight(bg);
    const fw = img.naturalWidth || img.width, fh = img.naturalHeight || img.height;
    if (!bw || !bh || !fw || !fh) return false;
    return Math.abs((fw / fh) / (bw / bh) - 1) < 0.015;
  }
  function pointerToUV(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  }

  function layerAtPoint(point) {
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].hidden || layers[i].locked) continue;
      const b = worldBounds(layers[i]);
      if (point.x >= b.left && point.x <= b.right && point.y >= b.bottom && point.y <= b.top) return i;
    }
    return -1;
  }

  function marqueeBounds(start, end) {
    return {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      bottom: Math.min(start.y, end.y),
      top: Math.max(start.y, end.y),
    };
  }

  function boundsIntersect(a, b) {
    return a.left <= b.right && a.right >= b.left && a.bottom <= b.top && a.top >= b.bottom;
  }

  function showSelectionMarquee(bounds) {
    const marquee = $("lc-selection-marquee");
    if (!marquee || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const shellRect = marquee.parentElement.getBoundingClientRect();
    marquee.style.setProperty("--lc-marquee-left", (rect.left - shellRect.left + bounds.left * rect.width) + "px");
    marquee.style.setProperty("--lc-marquee-top", (rect.top - shellRect.top + (1 - bounds.top) * rect.height) + "px");
    marquee.style.setProperty("--lc-marquee-width", ((bounds.right - bounds.left) * rect.width) + "px");
    marquee.style.setProperty("--lc-marquee-height", ((bounds.top - bounds.bottom) * rect.height) + "px");
    marquee.classList.add("is-visible");
  }

  function clearSelectionMarquee() {
    $("lc-selection-marquee")?.classList.remove("is-visible");
  }

  function showAlignmentGuides(guideX, guideY) {
    const guides = $("lc-alignment-guides");
    if (!guides || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const shellRect = guides.getBoundingClientRect();
    guides.classList.toggle("has-x", guideX != null);
    guides.classList.toggle("has-y", guideY != null);
    if (guideX != null) guides.style.setProperty("--lc-guide-x", (rect.left - shellRect.left + guideX * rect.width) + "px");
    if (guideY != null) guides.style.setProperty("--lc-guide-y", (rect.top - shellRect.top + (1 - guideY) * rect.height) + "px");
  }

  function clearAlignmentGuides() {
    const guides = $("lc-alignment-guides");
    if (!guides) return;
    guides.classList.remove("has-x", "has-y");
  }

  // ------------------------------------------------------------------
  // 4) The cover as a document: a stack of pictures, saved to the desk
  // ------------------------------------------------------------------
  // The glass layers above keep their own list and their own renderer path.
  // This section is everything else a cover holds: pictures (a background, a
  // subject, anything the writer brings), adjustment layers, cut-out masks, the
  // canvas variants, and the document that carries them to the desk and back.
  // The compositing plan (liquid-cover-model.js) says in what order they are
  // drawn; the renderer draws exactly that, for the preview and the export alike.
  const maskVersions = new Map();   // layer id -> Map(revision -> mask plane), for undo of brush strokes
  const MASK_VERSION_LIMIT = 16;
  const ADJUST_FALLBACK = { brightnessContrast: "Brightness / Contrast", hueSaturation: "Hue / Saturation", blur: "Blur" };
  const BLEND_FALLBACK = { normal: "Normal", multiply: "Multiply", screen: "Screen", overlay: "Overlay", darken: "Darken", lighten: "Lighten" };
  let coverSaving = false;

  function pictureReady(layer) {
    if (layer.id === BG_LAYER_ID) return true;
    if (!renderer || !renderer.hasPicture(layer.id)) return false;
    return !layer.maskId || renderer.masks.has(layer.id);
  }
  function stackLayerById(id) { return picStack.find((S) => S.id === id) || null; }
  function selectedStackLayers() { return picStack.filter((S) => selectedStackIds.has(S.id)); }
  function primaryStackLayer() { return stackLayerById(selStack); }
  function selectOnlyStack(id) {
    selectedLayerIds.clear();
    selectedStackIds.clear();
    selectedStackIds.add(id);
    selStack = id;
  }
  function newPicId() { return "lc-pic-" + nextPicId++; }
  function makeBackgroundLayer() {
    return COVER_MODEL.normalizeStackLayer({ id: BG_LAYER_ID, kind: "picture", role: "background", placement: "cover" });
  }
  function stackLayerName(S) {
    if (S.name) return S.name;
    if (S.id === BG_LAYER_ID) return tr("liquid_cover_background", "Background");
    if (S.kind === "adjust") return tr("liquid_cover_adjust_" + S.adjust.type, ADJUST_FALLBACK[S.adjust.type]);
    return S.role === "subject" ? tr("liquid_cover_subject_layer", "Subject") : tr("liquid_cover_picture_layer", "Picture");
  }
  function coverAspectOf(image) { return sourceWidth(image) / Math.max(1, sourceHeight(image)); }

  // ---- masks: a cut-out is the picture, a mask and a transform, kept apart ----
  function maskPlane(canvas) {
    const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    const plane = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < plane.length; i++) plane[i] = data[i * 4];
    return plane;
  }
  function writeMaskPlane(canvas, plane) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < plane.length; i++) {
      pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = plane[i];
      pixels.data[i * 4 + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }
  function rememberMaskVersion(id, rev, canvas) {
    if (!maskVersions.has(id)) maskVersions.set(id, new Map());
    const versions = maskVersions.get(id);
    versions.set(rev, maskPlane(canvas));
    while (versions.size > MASK_VERSION_LIMIT) versions.delete(versions.keys().next().value);
  }
  function applyMaskVersion(id, rev) {
    const media = picMedia.get(id);
    const plane = maskVersions.get(id)?.get(rev);
    if (!media || !media.mask || !plane || plane.length !== media.mask.width * media.mask.height) return;
    writeMaskPlane(media.mask, plane);
    media.maskRev = rev;
    media.maskDirty = true;
  }
  function maskCanvasFromImage(image) {
    const c = document.createElement("canvas");
    c.width = sourceWidth(image); c.height = sourceHeight(image);
    c.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
    return c;
  }

  // Put every picture the stack names into the renderer, and bring each mask to
  // the revision the layer says it is at. Cheap and idempotent: it runs before
  // every render, after every restore and after the renderer is rebuilt.
  function syncRendererPictures() {
    if (!renderer) return;
    picStack.forEach((S) => {
      if (S.kind !== "picture" || S.id === BG_LAYER_ID) return;
      const media = picMedia.get(S.id);
      if (!media) return;
      if (media.image && !renderer.hasPicture(S.id)) renderer.setPicture(S.id, media.image);
      if (media.mask) {
        const wanted = S.maskRev || 0;
        if ((media.maskRev || 0) !== wanted) applyMaskVersion(S.id, wanted);
        if (media.maskDirty || !renderer.masks.has(S.id)) { renderer.setMask(S.id, media.mask); media.maskDirty = false; }
      }
    });
  }

  // ---- assets: the pictures live in the one picture store ----
  const editAssets = () => window.AISystem6EditAssets;
  function ensureCoverId() {
    if (!cover.id) cover.id = crypto.randomUUID();
    return cover.id;
  }
  function coverProject() {
    return typeof getActiveProject === "function" ? getActiveProject() : null;
  }
  function fileFromImage(image, name) {
    return new Promise((resolve, reject) => {
      const c = document.createElement("canvas");
      c.width = sourceWidth(image); c.height = sourceHeight(image);
      c.getContext("2d").drawImage(image, 0, 0);
      c.toBlob((blob) => (blob ? resolve(new File([blob], (name || "picture") + ".png", { type: "image/png" })) : reject(new Error("encode"))), "image/png");
    });
  }
  // A picture used by an unsaved cover is the editor's working material: staged
  // under this cover, out of the Picture Album and out of a backup until the
  // writer saves. A picture that already lives in the album is only referenced.
  async function stageCoverPicture(source, role, order, name, id) {
    const project = coverProject();
    if (!project || !editAssets() || typeof buildImageAttachments !== "function") return null;
    const file = source.file || await fileFromImage(source.image, name);
    const built = await buildImageAttachments([file], { projectId: project.id, surface: "liquidCover", limit: 1 });
    if (!built[0]) return null;
    // The layer named this id before the picture was stored, so the layer
    // never has to change when the picture is.
    if (id) built[0].id = id;
    const staged = editAssets().stageAsset(built[0], { app: "liquidCover", fileId: cover.fileId, group: ensureCoverId(), role, order });
    editAssets().saveStaged([staged]);
    return staged;
  }
  async function ensureStaged(assetId, source, role, order, name) {
    if (!assetId || !source || (typeof imageAttachmentById === "function" && imageAttachmentById(assetId))) return;
    await stageCoverPicture(source, role, order, name, assetId);
  }
  async function stageMaskPicture(layer, canvas) {
    const project = coverProject();
    if (!project || !editAssets()) return layer.maskId || "";
    const dataUrl = canvas.toDataURL("image/png");
    const existing = typeof imageAttachmentById === "function" ? imageAttachmentById(layer.maskId) : null;
    if (existing) {
      saveImageAttachments([{ ...existing, originalDataUrl: dataUrl, previewDataUrl: dataUrl, width: canvas.width, height: canvas.height, size: Math.ceil(dataUrl.length * 0.75) }]);
      return existing.id;
    }
    const record = {
      id: layer.maskId || crypto.randomUUID(), projectId: project.id, surface: "liquidCover", name: (layer.name || "cut-out") + " mask",
      alt: "", type: "image/png", size: Math.ceil(dataUrl.length * 0.75), originalDataUrl: dataUrl, previewDataUrl: dataUrl,
      width: canvas.width, height: canvas.height, previewWidth: canvas.width, previewHeight: canvas.height,
      previewSize: Math.ceil(dataUrl.length * 0.75), createdAt: new Date().toISOString(),
    };
    const staged = editAssets().stageAsset(record, { app: "liquidCover", fileId: cover.fileId, group: ensureCoverId(), role: "cutout-mask", order: picStack.indexOf(layer) });
    editAssets().saveStaged([staged]);
    return staged.id;
  }
  async function imageFromAsset(assetId) {
    const record = typeof imageAttachmentById === "function" ? imageAttachmentById(assetId) : null;
    const src = record && (record.originalDataUrl || record.previewDataUrl || record.dataUrl);
    if (!src) throw new Error("missing-asset");
    return loadImageFromDataUrl(src);
  }

  // ---- pictures and adjustments on the stack ----
  function addPictureLayer(image, options = {}) {
    if (!renderer) return null;
    const role = options.role === "layer" ? "layer" : "subject";
    const registered = role === "subject" && subjectMatchesBackdrop(image);
    const layer = COVER_MODEL.normalizeStackLayer({
      id: newPicId(), kind: "picture", role, name: options.name || "", assetId: options.assetId || crypto.randomUUID(),
      placement: registered ? "registered" : "free", x: 0.5, y: 0.5,
      scale: registered ? 1 : Math.min(1, (DESIGN_W / DESIGN_H) / coverAspectOf(image)),
    });
    picMedia.set(layer.id, { image, file: options.file || null, mask: null, maskRev: 0, maskDirty: false });
    renderer.setPicture(layer.id, image);
    picStack.push(layer);
    selectOnlyStack(layer.id);
    if (!options.assetId && coverProject()) {
      ensureStaged(layer.assetId, picMedia.get(layer.id), role === "subject" ? "cover-subject" : "cover-layer", picStack.length, layer.name)
        .catch(() => aiStatusText(tr("liquid_cover_stage_failed", "This picture could not be kept with the cover.")));
    }
    return layer;
  }

  function finishStackEdit(inspectorPanel = "stack") {
    renderLayerList();
    renderStackInspector();
    syncSubjectControls();
    setInspectorPanel(inspectorPanel);
    scheduleRender();
  }

  function addPictureFromFile(file, role = "subject") {
    loadImageFile(file, (image) => {
      runHistoryAction("liquid_cover_subject_action", "Place picture", () => {
        addPictureLayer(image, { role, name: (file.name || "").replace(/\.[^.]+$/, "").slice(0, 40), file });
        finishStackEdit();
      });
    });
  }

  async function addAlbumPicture(attachmentId, as = "subject") {
    const record = typeof imageAttachmentById === "function" ? imageAttachmentById(attachmentId) : null;
    if (!record) { aiStatusText(tr("liquid_cover_album_missing", "That picture is no longer in the album.")); return false; }
    let image;
    try { image = await imageFromAsset(attachmentId); } catch {
      aiStatusText(tr("liquid_cover_album_unreadable", "That picture could not be read.")); return false;
    }
    if (!renderer) return false;
    const name = String(record.name || "").replace(/\.[^.]+$/, "").slice(0, 40);
    if (as === "background") {
      runHistoryAction("liquid_cover_subject_action", "Place picture", () => {
        clearMotionVideo(false);
        activeBg = -1;
        setBackgroundPicture(image, { kind: "asset", assetId: attachmentId, name: record.name });
      });
    } else {
      runHistoryAction("liquid_cover_subject_action", "Place picture", () => {
        addPictureLayer(image, { role: "subject", name, assetId: attachmentId });
        finishStackEdit();
      });
    }
    aiStatusText(tr("liquid_cover_album_added", "Added from the Picture Album: {0}", name || record.name));
    return true;
  }

  // The base background. A built-in photo is a URL; a chosen one is a picture
  // in the store (or, with no project mounted, held here until there is one).
  function setBackgroundPicture(image, state) {
    bgState.kind = state.kind; bgState.url = state.url || ""; bgState.assetId = state.assetId || "";
    currentBgUrl = null;
    document.querySelectorAll("#lc-bg-row .lc-bg-item").forEach((item) => {
      item.classList.remove("is-active"); item.setAttribute("aria-pressed", "false");
    });
    setBg(image);
    const name = $("lc-bg-name");
    if (name && state.name) { name.removeAttribute("data-i18n"); name.textContent = state.name; }
  }
  function restoreBackgroundState(state) {
    const next = state.bgState || { kind: "builtin", url: state.currentBgUrl || "", assetId: "" };
    const same = next.kind === bgState.kind && next.url === bgState.url && next.assetId === bgState.assetId;
    if (same) { if (state.currentBgUrl && state.currentBgUrl !== currentBgUrl && next.kind === "builtin") setBgFromUrl(state.currentBgUrl); return; }
    if (next.kind === "builtin") {
      setBgFromUrl(next.url || state.currentBgUrl);
    } else if (next.kind === "asset") {
      const held = localBackgrounds.get(next.assetId);
      if (held) { setBackgroundPicture(held.image, next); return; }
      bgState.kind = "asset"; bgState.url = ""; bgState.assetId = next.assetId; currentBgUrl = null;
      imageFromAsset(next.assetId).then((image) => { if (bgState.assetId === next.assetId) setBg(image); }).catch(() => {
        aiStatusText(tr("liquid_cover_album_unreadable", "That picture could not be read."));
      });
    }
  }

  function addAdjustmentLayer(type) {
    if (!COVER_MODEL.ADJUST_TYPES.includes(type)) return;
    runHistoryAction("liquid_cover_add_action", "Add layer", () => {
      const base = primaryStackLayer();
      const defaults = COVER_MODEL.ADJUST_DEFAULTS[type];
      const layer = COVER_MODEL.normalizeStackLayer({
        id: newPicId(), kind: "adjust", adjust: { type, ...defaults, ...(type === "blur" ? { radius: 8 } : {}) },
      });
      // Above the selected layer, so it changes that layer and everything under
      // it; with nothing selected it goes on top and changes the whole cover.
      if (base) {
        const at = picStack.indexOf(base) + 1;
        picStack.splice(at, 0, layer);
        if (at <= picSlot) picSlot++;
      } else {
        picStack.push(layer);
      }
      selectOnlyStack(layer.id);
      finishStackEdit();
    });
    aiStatusText(tr("liquid_cover_adjust_added", "Adjustment added. It changes every layer beneath it."));
  }

  function removeSelectedStack() {
    const doomed = selectedStackLayers().filter((S) => S.id !== BG_LAYER_ID && !S.locked);
    if (!doomed.length) return false;
    runHistoryAction("liquid_cover_delete_action", "Delete layer", () => {
      doomed.forEach((S) => {
        const at = picStack.indexOf(S);
        if (at < picSlot) picSlot--;
        picStack.splice(at, 1);
        if (renderer) renderer.removePicture(S.id);
      });
      selectedStackIds.clear();
      selStack = "";
      selectOnly(Math.min(sel, layers.length - 1));
      renderLayerList();
      loadLayerIntoPanel();
      renderStackInspector();
      syncSubjectControls();
      setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
      scheduleRender();
    });
    return true;
  }

  function duplicateSelectedStack() {
    const sources = selectedStackLayers().filter((S) => S.id !== BG_LAYER_ID);
    if (!sources.length) return false;
    runHistoryAction("liquid_cover_duplicate_action", "Duplicate layer", () => {
      selectedStackIds.clear();
      sources.forEach((S) => {
        const copy = cloneStackLayer(S);
        copy.id = newPicId();
        copy.name = S.name ? S.name + " 2" : "";
        copy.locked = false;
        if (copy.kind === "picture" && copy.placement === "free") { copy.x = clampNum(copy.x + 16 / DESIGN_W, -1, 2, copy.x); copy.y = clampNum(copy.y - 16 / DESIGN_H, -1, 2, copy.y); }
        const media = picMedia.get(S.id);
        if (media) {
          const mask = media.mask ? maskCanvasFromImage(media.mask) : null;
          picMedia.set(copy.id, { image: media.image, file: media.file, mask, maskRev: 0, maskDirty: !!mask });
          copy.maskRev = 0;
          if (mask) rememberMaskVersion(copy.id, 0, mask);
          if (renderer && media.image) renderer.setPicture(copy.id, media.image);
        }
        const at = picStack.indexOf(S) + 1;
        picStack.splice(at, 0, copy);
        if (at <= picSlot) picSlot++;
        selectedStackIds.add(copy.id);
        selStack = copy.id;
      });
      selectedLayerIds.clear();
      finishStackEdit();
    });
    return true;
  }

  // Up / down / top / bottom for stack layers. The glass band is one step: a
  // picture passes over all the glass at once.
  function moveSelectedStack(where) {
    const S = primaryStackLayer();
    if (!S || S.locked || S.id === BG_LAYER_ID) return false;
    const i = picStack.indexOf(S);
    const top = picStack.length - 1;
    const slotBefore = picSlot;
    let moved = false;
    runHistoryAction("liquid_cover_reorder_action", "Reorder layers", () => {
      if (where === "up") {
        if (i === picSlot - 1) { picSlot--; moved = true; }
        else if (i < top) { picStack.splice(i, 1); picStack.splice(i + 1, 0, S); moved = true; }
      } else if (where === "down") {
        if (i === picSlot) { picSlot++; moved = true; }
        else if (i > 1) { picStack.splice(i, 1); picStack.splice(i - 1, 0, S); moved = true; }
      } else if (where === "top") {
        picStack.splice(i, 1); picStack.push(S);
        if (i < picSlot) picSlot--;
        moved = i !== top;
      } else if (where === "bottom") {
        picStack.splice(i, 1); picStack.splice(1, 0, S);
        if (i >= picSlot) picSlot++;
        moved = i !== 1;
      }
      renderLayerList();
      scheduleRender();
    });
    return moved || slotBefore !== picSlot;
  }

  // The layer panel lists the whole stack, top first: pictures over the glass,
  // then the glass layers, then pictures under it.
  function unifiedTopFirst() {
    const out = [];
    for (let i = picStack.length - 1; i >= picSlot; i--) out.push({ kind: "stack", id: picStack[i].id });
    for (let i = layers.length - 1; i >= 0; i--) out.push({ kind: "glass", id: layers[i].id });
    for (let i = picSlot - 1; i >= 0; i--) out.push({ kind: "stack", id: picStack[i].id });
    return out;
  }
  // Write an order given top first. The glass layers stay one band: a picture
  // that lands inside it is moved to the nearer side, and the background stays
  // at the bottom.
  function applyUnifiedOrder(list) {
    const bottomUp = list.slice().reverse();
    const glassIds = bottomUp.filter((e) => e.kind === "glass").map((e) => e.id);
    if (glassIds.length) {
      const first = bottomUp.findIndex((e) => e.kind === "glass");
      const last = bottomUp.length - 1 - bottomUp.slice().reverse().findIndex((e) => e.kind === "glass");
      const middle = (first + last) / 2;
      const under = [], over = [];
      bottomUp.forEach((e, index) => {
        if (e.kind !== "stack") return;
        if (index < first) under.push(e.id);
        else if (index > last) over.push(e.id);
        else (index <= middle ? under : over).push(e.id);
      });
      const order = [...under, ...over];
      const bgAt = order.indexOf(BG_LAYER_ID);
      let slot = under.length;
      if (bgAt > 0) {
        order.splice(bgAt, 1); order.unshift(BG_LAYER_ID);
        if (!under.includes(BG_LAYER_ID)) slot++;
      }
      const byId = new Map(picStack.map((S) => [S.id, S]));
      const glassById = new Map(layers.map((L) => [L.id, L]));
      picStack.splice(0, picStack.length, ...order.map((id) => byId.get(id)).filter(Boolean));
      layers.splice(0, layers.length, ...glassIds.map((id) => glassById.get(id)).filter(Boolean));
      picSlot = Math.max(1, Math.min(picStack.length, slot));
    }
  }
  function reorderFromPanel(id, toIndex) {
    const list = unifiedTopFirst();
    const glass = layers.find((L) => L.id === id);
    let movingIds;
    if (glass) movingIds = new Set(selectedReorderUnit(glass).map((L) => L.id));
    else movingIds = new Set(selectedStackIds.has(id) ? [...selectedStackIds] : [id]);
    if (movingIds.has(BG_LAYER_ID)) return;
    const moving = list.filter((e) => movingIds.has(e.id));
    const rest = list.filter((e) => !movingIds.has(e.id));
    const at = Math.max(0, Math.min(rest.length, toIndex));
    runHistoryAction("liquid_cover_reorder_action", "Reorder layers", () => {
      applyUnifiedOrder([...rest.slice(0, at), ...moving, ...rest.slice(at)]);
      sel = Math.max(0, layers.findIndex((L) => selectedLayerIds.has(L.id)));
      rebuildAllSDF();
      renderLayerList();
      loadLayerIntoPanel();
      scheduleRender();
    });
  }

  // ---- the layers panel and the layer inspector (the edit kernel's) ----
  let layersPanel = null;
  let stackInspector = null;
  function panelItems() {
    return unifiedTopFirst().map((entry) => {
      if (entry.kind === "glass") {
        const L = layers.find((item) => item.id === entry.id);
        return { id: L.id, name: layerDisplayName(L), hidden: !!L.hidden, locked: !!L.locked, tag: isShapeLayer(L) ? "shape" : "text", depth: L.parentId ? 1 : 0 };
      }
      const S = stackLayerById(entry.id);
      return { id: S.id, name: stackLayerName(S), hidden: !!S.hidden, locked: !!S.locked, tag: S.kind === "adjust" ? "adjust" : S.id === BG_LAYER_ID ? "background" : S.role, depth: 0 };
    });
  }
  function panelSelection() { return [...selectedLayerIds, ...selectedStackIds]; }
  function selectFromPanel(ids) {
    const glassIds = ids.filter((id) => layers.some((L) => L.id === id));
    const stackIds = ids.filter((id) => picStack.some((S) => S.id === id));
    selectedLayerIds.clear(); glassIds.forEach((id) => selectedLayerIds.add(id));
    selectedStackIds.clear(); stackIds.forEach((id) => selectedStackIds.add(id));
    const lastId = ids[ids.length - 1];
    if (glassIds.length) sel = layers.findIndex((L) => L.id === glassIds[glassIds.length - 1]);
    selStack = stackIds[stackIds.length - 1] || "";
    renderLayerList();
    renderStackInspector();
    syncSubjectControls();
    if (stackIds.includes(lastId)) {
      setInspectorPanel("stack");
    } else {
      loadLayerIntoPanel();
      setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
    }
  }
  function buildLayersPanel() {
    const host = $("lc-layer-list");
    if (!host || layersPanel || !window.AISystem6EditLayers) return;
    host.textContent = "";
    layersPanel = window.AISystem6EditLayers.createLayersPanel({
      host,
      label: tr("liquid_cover_layers", "Layers"),
      items: panelItems,
      selection: panelSelection,
      onSelect: selectFromPanel,
      onToggle: (id, flag) => {
        const item = layers.find((L) => L.id === id) || stackLayerById(id);
        if (!item) return;
        runHistoryAction("liquid_cover_edit_action", "Edit layer", () => {
          item[flag] = !item[flag];
          renderLayerList();
          if (layers[sel] === item) loadLayerIntoPanel();
          scheduleRender();
        });
      },
      onRename: (id, name) => {
        const item = layers.find((L) => L.id === id) || stackLayerById(id);
        if (!item || item.locked) { renderLayerList(); return; }
        runHistoryAction("liquid_cover_rename_action", "Rename layer", () => {
          item.name = String(name).trim().slice(0, 40);
          renderLayerList();
          renderStackInspector();
          loadLayerIntoPanel();
        });
      },
      onReorder: reorderFromPanel,
    });
  }

  function stackFieldOptions(values, labelFor) {
    return values.map((value) => ({ value, label: labelFor(value) }));
  }
  function stackInspectorFields() {
    const S = primaryStackLayer();
    if (!S) return [];
    const locked = !!S.locked;
    const f = (field) => ({ disabled: locked, ...field });
    const fields = [f({ id: "name", label: tr("liquid_cover_layer_name", "Layer name"), type: "text", value: S.name || stackLayerName(S) })];
    if (S.kind === "adjust") {
      fields.push(f({ id: "adjust-type", label: tr("liquid_cover_adjust_type", "Adjustment"), type: "select", value: S.adjust.type, options: stackFieldOptions(COVER_MODEL.ADJUST_TYPES, (type) => tr("liquid_cover_adjust_" + type, ADJUST_FALLBACK[type])) }));
      const range = (key, label, fallback) => f({ id: "adjust-" + key, label: tr(label, fallback), type: "range", value: S.adjust[key], min: COVER_MODEL.ADJUST_RANGES[key][0], max: COVER_MODEL.ADJUST_RANGES[key][1], step: 1 });
      if (S.adjust.type === "brightnessContrast") fields.push(range("brightness", "liquid_cover_brightness", "Brightness"), range("contrast", "liquid_cover_contrast", "Contrast"));
      else if (S.adjust.type === "hueSaturation") fields.push(range("hue", "liquid_cover_hue", "Hue"), range("saturation", "liquid_cover_saturation", "Saturation"), range("lightness", "liquid_cover_lightness", "Lightness"));
      else fields.push(range("radius", "liquid_cover_blur_radius", "Radius"));
    } else {
      if (S.id !== BG_LAYER_ID) {
        fields.push(f({ id: "placement", label: tr("liquid_cover_placement", "Placement"), type: "select", value: S.placement === "registered" ? "registered" : "free", options: [
          { value: "free", label: tr("liquid_cover_placement_free", "Free") },
          { value: "registered", label: tr("liquid_cover_placement_registered", "On the background photo") },
        ] }));
        fields.push(f({ id: "x", label: tr("liquid_cover_position_x", "Position X %"), type: "number", value: Math.round(S.x * 100), min: -100, max: 200, step: 1 }));
        fields.push(f({ id: "y", label: tr("liquid_cover_position_y", "Position Y %"), type: "number", value: Math.round((1 - S.y) * 100), min: -100, max: 200, step: 1 }));
        fields.push(f({ id: "scale", label: tr("liquid_cover_scale", "Scale"), type: "range", value: Math.round(S.scale * 100), min: 5, max: 300, step: 1 }));
        if (S.placement !== "registered") fields.push(f({ id: "rotation", label: tr("liquid_cover_rotation", "Rotation"), type: "range", value: Math.round(S.rotation), min: -180, max: 180, step: 1 }));
      }
      fields.push(f({ id: "blend", label: tr("liquid_cover_blend", "Blend"), type: "select", value: S.blend, options: stackFieldOptions(COVER_MODEL.BLEND_MODES, (mode) => tr("liquid_cover_blend_" + mode, BLEND_FALLBACK[mode])) }));
    }
    fields.push(f({ id: "opacity", label: tr("liquid_cover_opacity", "Opacity"), type: "range", value: Math.round(S.opacity * 100), min: 0, max: 100, step: 1 }));
    if (S.id !== BG_LAYER_ID) fields.push(f({ id: "clip", label: tr("liquid_cover_clip", "Clip to layer below"), type: "check", value: S.clip }));
    return fields;
  }
  function applyStackField(S, id, value) {
    const num = (v, min, max, fallback) => clampNum(v, min, max, fallback);
    if (id === "name") S.name = String(value || "").slice(0, 40);
    else if (id === "blend") S.blend = COVER_MODEL.BLEND_MODES.includes(value) ? value : "normal";
    else if (id === "opacity") S.opacity = num(value / 100, 0, 1, S.opacity);
    else if (id === "clip") S.clip = !!value;
    else if (id === "placement") {
      const registered = value === "registered";
      if (registered === (S.placement === "registered")) return;
      S.placement = registered ? "registered" : "free";
      S.x = 0.5; S.y = 0.5; S.rotation = 0;
      const media = picMedia.get(S.id);
      S.scale = registered || !media ? 1 : Math.min(1, (DESIGN_W / DESIGN_H) / coverAspectOf(media.image));
    }
    else if (id === "x") S.x = num(value / 100, -1, 2, S.x);
    else if (id === "y") S.y = num(1 - value / 100, -1, 2, S.y);
    else if (id === "scale") S.scale = num(value / 100, 0.05, 3, S.scale);
    else if (id === "rotation") S.rotation = num(value, -180, 180, S.rotation);
    else if (id === "adjust-type") S.adjust = COVER_MODEL.normalizeAdjust({ type: value, ...(value === "blur" ? { radius: 8 } : {}) });
    else if (id.startsWith("adjust-")) S.adjust = COVER_MODEL.normalizeAdjust({ ...S.adjust, [id.slice(7)]: value });
  }
  function onStackField(id, value, meta) {
    const S = primaryStackLayer();
    if (!S || S.locked) return;
    beginHistory("liquid_cover_edit_action", "Edit layer");
    applyStackField(S, id, value);
    if (id === "name") renderLayerList();
    scheduleRender();
    updateSelectionOverlay();
    syncSubjectControls();
    if (meta.final) {
      commitHistory();
      if (id === "adjust-type" || id === "placement") renderStackInspector();
      renderLayerList();
    }
  }
  function buildStackInspector() {
    const host = $("lc-stack-inspector");
    if (!host || stackInspector || !window.AISystem6EditLayers) return;
    host.textContent = "";
    stackInspector = window.AISystem6EditLayers.createInspector({
      host, label: tr("liquid_cover_layer_info", "Layer"), fields: stackInspectorFields, onChange: onStackField,
    });
  }
  function renderStackInspector() {
    if (!stackInspector) return;
    stackInspector.render();
    syncCutoutControls();
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  }

  // ---- the subject panel works on the picture layer it names ----
  function subjectLayer() {
    const selected = primaryStackLayer();
    if (selected && selected.kind === "picture" && selected.id !== BG_LAYER_ID) return selected;
    for (let i = picStack.length - 1; i >= 0; i--) {
      if (picStack[i].kind === "picture" && picStack[i].role === "subject") return picStack[i];
    }
    return null;
  }
  function syncSubjectControls() {
    const S = subjectLayer();
    const reg = $("lc-fg-register");
    if (reg) { reg.checked = S ? S.placement === "registered" : true; reg.disabled = !S; }
    const sc = $("lc-fg-scale");
    if (sc) { sc.value = Math.round((S ? S.scale : 1) * 100); sc.disabled = !S; }
    const clear = $("lc-fg-clear");
    if (clear) clear.hidden = !S;
    const name = $("lc-fg-name");
    if (name) {
      if (S) { name.removeAttribute("data-i18n"); name.textContent = stackLayerName(S); }
      else { name.setAttribute("data-i18n", "no_files_selected"); name.textContent = tr("no_files_selected", "No files selected"); }
    }
    syncValueLabels();
  }

  // ---- canvas variants: one cover, several arrangements ----
  function switchCoverVariant(key) {
    const dims = ASPECTS[key];
    if (!dims || key === variantKey) return;
    runHistoryAction("liquid_cover_variant_action", "Change size", () => {
      COVER_MODEL.switchVariant(variants, variantKey, key, [...layers, ...picStack], dims);
      variantKey = key;
      applyAspect(dims[0], dims[1]);
      syncAspectButtons();
      syncWorkbenchReadout();
      rebuildAllSDF();
      renderLayerList();
      loadLayerIntoPanel();
      renderStackInspector();
      scheduleRender();
    });
  }
  function syncAspectButtons() {
    document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((button) => {
      const active = button.dataset.k === variantKey;
      button.classList.toggle("is-active", active);
      button.classList.toggle("has-variant", !!variants[button.dataset.k] && !active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  // ---- the document: save, save as, new, open ----
  function coverTitle() {
    const typed = ($("lc-cover-title")?.value || "").trim();
    const firstText = (layers.find((L) => !isShapeLayer(L) && (L.text || "").trim())?.text || "").split("\n")[0].trim();
    return (typed || cover.title || firstText || tr("liquid_cover_untitled", "Cover")).slice(0, 80);
  }
  function markCoverDirty() {
    if (historyRestoring) return;
    cover.dirty = true;
    syncCoverStatus();
  }
  function syncCoverStatus() {
    const meta = $("lc-status-meta");
    if (!meta) return;
    const base = activeAspectKey() + " · " + layers.length + "/" + MAX_LAYERS;
    meta.textContent = cover.fileId || cover.dirty ? base + " · " + tr(cover.dirty ? "liquid_cover_unsaved" : "liquid_cover_saved", cover.dirty ? "Unsaved" : "Saved") : base;
  }
  function coverState() {
    const bg = picStack.find((S) => S.id === BG_LAYER_ID);
    if (bg) bg.assetId = bgState.kind === "asset" ? bgState.assetId : "";
    return {
      id: ensureCoverId(), title: coverTitle(), variant: variantKey, w: DESIGN_W, h: DESIGN_H, variants,
      glassSlot: picSlot,
      background: bgState.kind === "builtin" ? { kind: "builtin", url: bgState.url } : bgState.kind === "asset" ? { kind: "asset", assetId: bgState.assetId } : { kind: "none" },
      stack: picStack, layers,
      controls: historyControlValues(), body: glassFx.bodyFactor, preset: activePresetKey,
    };
  }
  function markdownLabels() {
    const keys = { cover: "Cover", size: "Size", variants: "Sizes", layers: "Layers", top_first: "top first", shape: "Shape", text: "Text", hidden: "hidden", adjustment: "Adjustment", background: "Background", subject: "Subject", picture: "Picture", clipped: "clipped", cutout: "cut out" };
    const out = {};
    Object.entries(keys).forEach(([key, fallback]) => { out[key] = tr("liquid_cover_md_" + key, fallback); });
    return out;
  }
  // Pictures the store does not have yet are staged now, so the document can
  // name them by id.
  async function stageUnsavedMedia() {
    if (bgState.kind === "asset") {
      await ensureStaged(bgState.assetId, localBackgrounds.get(bgState.assetId), "cover-background", 0, "background");
    }
    for (const S of picStack) {
      if (S.kind !== "picture" || S.id === BG_LAYER_ID) continue;
      const media = picMedia.get(S.id);
      if (!media) continue;
      await ensureStaged(S.assetId, media, S.role === "subject" ? "cover-subject" : "cover-layer", picStack.indexOf(S), S.name);
      if (media.mask && S.maskId && !imageAttachmentById(S.maskId)) await stageMaskPicture(S, media.mask);
    }
    for (const L of layers) {
      if (L.shape) {
        if (!L.shapeAssetId) L.shapeAssetId = crypto.randomUUID();
        await ensureStaged(L.shapeAssetId, { image: L.shape, file: null }, "cover-layer", 0, L.name || "shape");
      }
    }
  }
  async function saveCover({ asNew = false } = {}) {
    const project = coverProject();
    if (!project) {
      if (typeof openWindow === "function") openWindow("projects");
      aiStatusText(tr("no_project_mounted", "No project is mounted."));
      return false;
    }
    if (coverSaving || !renderer) return false;
    coverSaving = true;
    try {
      if (asNew) { cover.id = crypto.randomUUID(); cover.fileId = ""; }
      ensureCoverId();
      await stageUnsavedMedia();
      const doc = COVER_MODEL.serializeCover(coverState());
      doc.title = coverTitle();
      cover.title = doc.title;
      const body = COVER_MODEL.coverMarkdown(doc, markdownLabels());
      const now = new Date().toISOString();
      let file = cover.fileId ? chatFiles.find((item) => item.id === cover.fileId && item.artifactKind === "cover") : null;
      if (file) {
        file.cover = doc; file.body = body; file.updatedAt = now;
        if (typeof markDeskDirty === "function") markDeskDirty("chatFiles", file.id);
      } else {
        const folder = ensureFolder(tr("liquid_cover_folder", "Covers"));
        file = {
          id: crypto.randomUUID(), projectId: activeProjectId, type: "text", artifactKind: "cover",
          name: nextAvailableFileName(`${doc.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 48) || "Cover"}.cover.md`, folder.id),
          folderId: folder.id, body, cover: doc, source: "Cover Glass", durable: true, createdAt: now, updatedAt: now,
        };
        chatFiles.unshift(file);
      }
      cover.fileId = file.id;
      // The pictures this cover uses leave the working area and join the library;
      // staged ones it no longer uses are dropped.
      const wanted = new Set(COVER_MODEL.coverAssetIds(doc));
      const groups = new Set();
      wanted.forEach((id) => {
        const record = imageAttachmentById(id);
        if (record && record.status === "staged") groups.add(record.group);
      });
      groups.forEach((group) => {
        editAssets().groupOf(group).forEach((record) => {
          if (record.status === "staged" && !wanted.has(record.id)) removeImageAttachment(record.id);
        });
        editAssets().keepAssetGroup(group, file.id);
      });
      saveDeskState();
      if (typeof renderDocuments === "function") renderDocuments();
      if (typeof renderProjectDisks === "function") renderProjectDisks();
      cover.dirty = false;
      syncCoverStatus();
      aiStatusText(tr("liquid_cover_saved_as", "Saved as {0}.", file.name));
      return true;
    } catch (error) {
      aiStatusText(tr("liquid_cover_save_failed", "The cover could not be saved."));
      return false;
    } finally {
      coverSaving = false;
    }
  }

  function resetStackToBlank() {
    picMedia.clear(); maskVersions.clear(); localBackgrounds.clear();
    if (renderer) [...renderer.pics.keys()].forEach((id) => renderer.removePicture(id));
    picStack.length = 0;
    picStack.push(makeBackgroundLayer());
    picSlot = 1;
    selectedStackIds.clear(); selStack = "";
  }
  function newCover() {
    if (!renderer) return;
    coverEmbedOwner = null;
    if (editAssets() && cover.id) editAssets().clearStagedAssets({ app: "liquidCover", group: cover.id });
    coverHistory.clear();
    historyRestoring = true;
    try {
      cover.id = ""; cover.fileId = ""; cover.title = ""; cover.dirty = false;
      const title = $("lc-cover-title"); if (title) title.value = "";
      resetStackToBlank();
      layers.length = 0; layers.push(makeLayer());
      selectOnly(0);
      Object.keys(variants).forEach((key) => { delete variants[key]; });
      variantKey = "16:9";
      variants[variantKey] = { w: ASPECTS[variantKey][0], h: ASPECTS[variantKey][1], layout: {} };
      applyAspect(ASPECTS[variantKey][0], ASPECTS[variantKey][1]);
      syncAspectButtons();
      activeBg = 0;
      buildBgRow();
      setBgFromUrl(BG_URLS[0]);
      applyMaterialMix(0);
      rebuildAllSDF();
      renderLayerList();
      loadLayerIntoPanel();
      renderStackInspector();
      syncSubjectControls();
      setInspectorPanel("layers");
      scheduleRender();
    } finally {
      historyRestoring = false;
    }
    updateHistoryButtons();
    syncCoverStatus();
  }

  async function applyCoverDoc(doc, file) {
    // Every picture is read before anything on screen changes, so a cover that
    // cannot be fully read never leaves a half-replaced window behind.
    const missing = [];
    const read = async (assetId, label) => {
      try { return await imageFromAsset(assetId); } catch { missing.push(label); return null; }
    };
    const media = new Map();
    for (const S of doc.stack) {
      if (S.kind !== "picture" || S.id === BG_LAYER_ID) continue;
      const label = S.name || S.id;
      const entry = { image: S.assetId ? await read(S.assetId, label) : null, file: null, mask: null, maskRev: 0, maskDirty: false };
      if (!S.assetId) missing.push(label);
      if (S.maskId) {
        const maskImage = await read(S.maskId, label + " (mask)");
        if (maskImage) entry.mask = maskCanvasFromImage(maskImage);
      }
      media.set(S.id, entry);
    }
    const shapes = new Map();
    for (const g of doc.layers) if (g.shapeAssetId) shapes.set(g.id, await read(g.shapeAssetId, g.name || g.id));
    let backgroundImage = null;
    if (doc.background && doc.background.kind === "asset") backgroundImage = await read(doc.background.assetId, tr("liquid_cover_background", "Background"));

    if (editAssets() && cover.id && cover.id !== doc.id) editAssets().clearStagedAssets({ app: "liquidCover", group: cover.id });
    coverHistory.clear();
    historyRestoring = true;
    try {
      picMedia.clear(); maskVersions.clear(); localBackgrounds.clear();
      if (renderer) [...renderer.pics.keys()].forEach((id) => renderer.removePicture(id));
      media.forEach((entry, id) => {
        picMedia.set(id, entry);
        if (entry.mask) rememberMaskVersion(id, 0, entry.mask);
      });
      layers.length = 0;
      doc.layers.forEach((g) => layers.push(makeLayer({ ...g, shape: shapes.get(g.id) || null })));
      picStack.length = 0;
      doc.stack.forEach((S) => picStack.push({ ...S, maskRev: 0 }));
      picSlot = doc.glassSlot;
      if (!picStack.some((S) => S.id === BG_LAYER_ID)) { picStack.unshift(makeBackgroundLayer()); picSlot++; }
      selectedStackIds.clear(); selStack = "";
      Object.keys(variants).forEach((key) => { delete variants[key]; });
      Object.assign(variants, JSON.parse(JSON.stringify(doc.variants)));
      variantKey = doc.variant;
      const dims = ASPECTS[variantKey] || [variants[variantKey].w, variants[variantKey].h];
      COVER_MODEL.applyLayout([...layers, ...picStack], variants[variantKey].layout);
      applyAspect(dims[0], dims[1]);
      syncAspectButtons();
      Object.entries(doc.glass.controls).forEach(([id, value]) => {
        const el = $(id);
        if (!el) return;
        if (el.type === "checkbox") el.checked = !!value; else el.value = value;
      });
      glassFx.bodyFactor = doc.glass.body;
      activePresetKey = doc.glass.preset || "";
      nextLayerId = layers.reduce((max, L) => Math.max(max, Number(String(L.id).replace(/^lc-layer-/, "")) + 1 || 0), nextLayerId);
      nextPicId = picStack.reduce((max, S) => Math.max(max, Number(String(S.id).replace(/^lc-pic-/, "")) + 1 || 0), nextPicId);
      cover.id = doc.id || crypto.randomUUID(); cover.fileId = file.id; cover.title = doc.title; cover.dirty = false;
      const title = $("lc-cover-title"); if (title) title.value = doc.title;
      const bg = doc.background || { kind: "builtin", url: BG_URLS[0] };
      clearMotionVideo(false);
      if (bg.kind === "asset" && backgroundImage) {
        activeBg = -1;
        setBackgroundPicture(backgroundImage, { kind: "asset", assetId: bg.assetId });
      } else {
        const url = bg.kind === "builtin" && bg.url ? bg.url : BG_URLS[0];
        activeBg = Math.max(0, BG_URLS.indexOf(url));
        buildBgRow();
        setBgFromUrl(url);
      }
      syncRendererPictures();
      rebuildAllSDF();
      selectOnly(0);
      renderLayerList();
      loadLayerIntoPanel();
      renderStackInspector();
      syncSubjectControls();
      syncValueLabels();
      syncLiquidControls();
      setActivePreset(activePresetKey);
      setInspectorPanel("layers");
      syncWorkbenchReadout();
      scheduleRender();
    } finally {
      historyRestoring = false;
    }
    updateHistoryButtons();
    syncCoverStatus();
    if (missing.length) {
      aiStatusText(tr("liquid_cover_open_missing", "Opened, but {0} picture(s) could not be found: {1}", missing.length, missing.slice(0, 3).join(", ")));
    } else {
      aiStatusText(tr("liquid_cover_opened", "Opened {0}.", file.name));
    }
    return true;
  }

  // ---- Round trips (app/core/edit-embeds.js) ----
  // A cover goes to ClioStage as a picture that is also an editable copy of the
  // cover document; a slide's cover opens here as that copy, and every step
  // (and its undo) redraws the slide.
  async function renderCoverDataUrl(maxLong = 1600) {
    if (!renderer || pngExportInFlight) return "";
    pngExportInFlight = true;
    const a = ASPECTS[activeAspectKey()] || [DESIGN_W, DESIGN_H];
    const scale = Math.min(2, maxLong / Math.max(a[0], a[1]));
    try {
      renderScale = scale;
      EXPORT_W = Math.round(a[0] * scale); EXPORT_H = Math.round(a[1] * scale);
      canvas.width = EXPORT_W; canvas.height = EXPORT_H;
      rebuildAllSDF();
      renderer.render(readParams());
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    } finally {
      applyAspect(DESIGN_W, DESIGN_H);
      rebuildAllSDF(); renderNow();
      pngExportInFlight = false;
    }
  }

  let coverEmbedOwner = null;
  let coverEmbedTimer = 0;
  function notifyCoverEmbed() {
    if (!coverEmbedOwner) return;
    clearTimeout(coverEmbedTimer);
    coverEmbedTimer = setTimeout(async () => {
      const owner = coverEmbedOwner;
      if (!owner) return;
      const png = await renderCoverDataUrl();
      if (png) owner({ doc: COVER_MODEL.serializeCover(coverState()) }, png);
    }, 400);
  }

  async function editCoverEmbed(data, { onChange } = {}) {
    const parsed = COVER_MODEL.parseCover(data?.doc);
    if (!parsed.ok) {
      aiStatusText(tr("liquid_cover_open_failed", "This cover could not be opened ({0}).", parsed.reason));
      return false;
    }
    await open();
    if (!renderer || !(await applyCoverDoc(parsed.doc, null))) return false;
    // A copy: saving it from here makes a new cover document.
    cover.fileId = "";
    coverEmbedOwner = typeof onChange === "function" ? onChange : null;
    aiStatusText(tr("liquid_cover_embed_opened", "This is a copy of a cover on a slide. Edits here redraw that slide."));
    return true;
  }

  async function sendCoverToStage() {
    const embeds = window.AISystem6EditEmbeds;
    if (!embeds || typeof ensureClioStageModule !== "function") return false;
    // The pictures a slide's copy points at must outlive the working area, so
    // the cover is saved first.
    if (!(await saveCover())) return false;
    const file = chatFiles.find((item) => item.id === cover.fileId);
    const png = await renderCoverDataUrl();
    if (!file || !png) return false;
    await ensureClioStageModule();
    if (window.AISystem6ClioStage?.confirmDiscard && !(await window.AISystem6ClioStage.confirmDiscard())) return false;
    const title = file.cover.title || coverTitle();
    return !!(await window.AISystem6ClioStage?.open?.({
      title,
      sourceKind: "generated",
      temporary: true,
      markdown: ["---", "marp: true", "theme: default", "paginate: true", "size: 16:9", "---", "", "<!-- _class: cover -->", "",
        embeds.embedMarkdown({ kind: "cover", alt: title, png, data: { doc: structuredClone(file.cover) }, source: { app: "liquidCover", fileId: file.id, rev: embeds.contentRev(file.cover) } })].join("\n"),
    }));
  }

  async function openSavedCover(file) {
    if (!file || !file.cover) return false;
    const parsed = COVER_MODEL.parseCover(file.cover);
    if (!parsed.ok) {
      aiStatusText(tr("liquid_cover_open_failed", "This cover could not be opened ({0}).", parsed.reason));
      return false;
    }
    await open();
    if (!renderer) return false;
    coverEmbedOwner = null;
    return applyCoverDoc(parsed.doc, file);
  }

  // ---- Picture Album → Cover Glass ----
  function albumPictures() {
    const project = coverProject();
    if (!project || typeof imageAttachmentsForProject !== "function") return [];
    return imageAttachmentsForProject(project.id, { limit: 48 }).filter((record) => record.surface !== "liquidCover");
  }
  let albumAs = "subject";
  function renderAlbumPanel() {
    const grid = $("lc-album-grid");
    if (!grid) return;
    grid.textContent = "";
    const pictures = albumPictures();
    const empty = $("lc-album-empty");
    if (empty) {
      empty.hidden = pictures.length > 0;
      empty.textContent = coverProject() ? tr("liquid_cover_album_empty", "The Picture Album has no pictures yet.") : tr("no_project_mounted", "No project is mounted.");
    }
    pictures.forEach((record) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lc-album-item";
      button.title = record.name || "";
      button.setAttribute("aria-label", tr("liquid_cover_album_use", "Use {0}", record.name || ""));
      const img = document.createElement("img");
      img.src = record.previewDataUrl || record.dataUrl || record.originalDataUrl || "";
      img.alt = "";
      img.loading = "lazy";
      button.append(img);
      button.addEventListener("click", () => addAlbumPicture(record.id, albumAs));
      grid.append(button);
    });
    document.querySelectorAll("#lc-album-as button").forEach((button) => {
      const active = button.dataset.as === albumAs;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  function showAlbumPanel(as) {
    if (as) albumAs = as;
    const details = document.querySelector("#liquid-cover-app .lc-picture-library");
    if (details) details.open = true;
    const panel = $("lc-album");
    if (panel) panel.hidden = false;
    renderAlbumPanel();
    setInspectorPanel("media");
    $("lc-album")?.scrollIntoView?.({ block: "nearest" });
  }
  const ALBUM_DRAG_TYPE = "application/x-ais6-picture";
  function wirePictureDrops() {
    const shell = document.querySelector(".liquid-cover-window .lc-canvas-shell");
    if (!shell) return;
    const accepts = (event) => {
      const types = Array.from(event.dataTransfer?.types || []);
      return types.includes(ALBUM_DRAG_TYPE) || types.includes("Files");
    };
    shell.addEventListener("dragover", (event) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      shell.classList.add("is-drop-target");
    });
    shell.addEventListener("dragleave", () => shell.classList.remove("is-drop-target"));
    shell.addEventListener("drop", (event) => {
      shell.classList.remove("is-drop-target");
      if (!accepts(event)) return;
      event.preventDefault();
      const id = event.dataTransfer.getData(ALBUM_DRAG_TYPE);
      // Dropping on the canvas places a subject; hold ⌥ to make it the background.
      if (id) { addAlbumPicture(id, event.altKey ? "background" : "subject"); return; }
      const file = Array.from(event.dataTransfer.files || []).find((item) => /^image\//.test(item.type));
      if (file) addPictureFromFile(file, "subject");
    });
    const bgGroup = document.querySelector("#liquid-cover-app .lc-bg-group");
    if (bgGroup) {
      bgGroup.addEventListener("dragover", (event) => {
        if (!Array.from(event.dataTransfer?.types || []).includes(ALBUM_DRAG_TYPE)) return;
        event.preventDefault();
        bgGroup.classList.add("is-drop-target");
      });
      bgGroup.addEventListener("dragleave", () => bgGroup.classList.remove("is-drop-target"));
      bgGroup.addEventListener("drop", (event) => {
        bgGroup.classList.remove("is-drop-target");
        const id = event.dataTransfer.getData(ALBUM_DRAG_TYPE);
        if (!id) return;
        event.preventDefault();
        addAlbumPicture(id, "background");
      });
    }
  }

  // ---- cut-out ----
  const maskBrush = { on: false, mode: "add", size: 40 };
  function cutoutTarget() {
    const S = primaryStackLayer();
    return S && S.kind === "picture" && S.id !== BG_LAYER_ID ? S : null;
  }
  function syncCutoutControls() {
    const S = cutoutTarget();
    const has = !!(S && S.maskId && picMedia.get(S.id)?.mask);
    const set = (id, fn) => { const el = $(id); if (el) fn(el); };
    set("lc-cutout-go", (el) => { el.disabled = !S || S.locked; });
    set("lc-cutout-clear", (el) => { el.hidden = !has; });
    set("lc-cutout-refine", (el) => { el.hidden = !has; el.setAttribute("aria-pressed", maskBrush.on ? "true" : "false"); el.classList.toggle("is-active", maskBrush.on); });
    set("lc-cutout-brush", (el) => { el.hidden = !has || !maskBrush.on; });
    if (!has && maskBrush.on) { maskBrush.on = false; canvas?.classList.remove("is-mask-brush"); }
    set("lc-cutout-note", (el) => { el.textContent = S ? (has ? tr("liquid_cover_cutout_has", "Cut out. The original picture is kept; the mask can be refined.") : tr("liquid_cover_cutout_note", "Removes the background on this computer. Nothing is uploaded.")) : tr("liquid_cover_cutout_select", "Select a picture layer to cut out."); });
  }
  function showCutoutModelNeed(status) {
    const box = $("lc-cutout-model");
    if (box) box.hidden = false;
    const note = $("lc-cutout-model-note");
    if (note) note.textContent = tr("liquid_cover_cutout_need_model", "Cut-out needs a background-removal model, which is not on this computer yet. Download these files from the model page and choose them here: config.json, preprocessor_config.json and onnx/model_quantized.onnx (about 7 MB). Missing: {0}.", (status.missing || []).join(", "));
    aiStatusText(tr("liquid_cover_cutout_need_model_short", "Cut-out needs the model files. Choose them in the Picture tab."));
  }
  async function removeBackground() {
    const S = cutoutTarget();
    const media = S && picMedia.get(S.id);
    if (!S || !media || !media.image) return;
    const button = $("lc-cutout-go");
    try { await ensureLiquidCoverCutoutModule(); } catch {
      aiStatusText(tr("liquid_cover_cutout_unavailable", "The cut-out module could not be loaded."));
      return;
    }
    const api = window.AISystem6CoverCutout;
    const status = await api.status();
    if (!status.ready) { showCutoutModelNeed(status); return; }
    const hint = $("lc-cutout-model"); if (hint) hint.hidden = true;
    setBusy(button, true, tr("liquid_cover_cutout_working", "Cutting out…"));
    aiStatusText(tr("liquid_cover_cutout_working", "Cutting out…"));
    try {
      const mask = await api.cutout(media.image, {
        onStage: (stage) => aiStatusText(tr(stage === "model" ? "liquid_cover_cutout_loading" : "liquid_cover_cutout_working", stage === "model" ? "Loading the model…" : "Cutting out…")),
      });
      applyCutoutMask(S, mask);
      aiStatusText(tr("liquid_cover_cutout_done", "Background removed. The original picture is kept."));
    } catch (error) {
      aiStatusText(tr("liquid_cover_cutout_failed", "The cut-out failed: {0}", String(error && error.message || error).slice(0, 120)));
    } finally {
      setBusy(button, false);
    }
  }
  // The mask becomes the layer's own: picture, mask and transform stay apart.
  function applyCutoutMask(S, mask) {
    const media = picMedia.get(S.id);
    if (!media) return;
    runHistoryAction("liquid_cover_cutout_action", "Remove background", () => {
      media.mask = mask;
      media.maskRev = 0; S.maskRev = 0;
      maskVersions.delete(S.id);
      rememberMaskVersion(S.id, 0, mask);
      S.maskId = crypto.randomUUID();
      media.maskDirty = true;
      const record = S.assetId && typeof imageAttachmentById === "function" ? imageAttachmentById(S.assetId) : null;
      if (record && record.status === "staged") { record.role = "cutout-source"; saveImageAttachments([record]); }
      stageMaskPicture(S, mask).catch(() => {});
      renderer.setMask(S.id, mask);
      media.maskDirty = false;
      renderLayerList();
      renderStackInspector();
      scheduleRender();
    });
  }
  function clearCutout() {
    const S = cutoutTarget();
    if (!S || !S.maskId) return;
    runHistoryAction("liquid_cover_cutout_action", "Remove background", () => {
      S.maskId = "";
      maskBrush.on = false;
      renderStackInspector();
      scheduleRender();
    });
  }
  // Where a canvas point falls on the picture, 0..1 in the picture's own space.
  function layerLocalPoint(S, u, v) {
    const media = picMedia.get(S.id);
    const A = DESIGN_W / DESIGN_H;
    if (S.placement === "registered") {
      let qx = (u - S.x) / S.scale + 0.5, qy = (v - S.y) / S.scale + 0.5;
      const bgAspect = renderer ? renderer.bgAspect : A;
      if (A > bgAspect) { const k = bgAspect / A; qy = qy * k + 0.5 - 0.5 * k; } else { const k = A / bgAspect; qx = qx * k + 0.5 - 0.5 * k; }
      return { x: qx, y: qy };
    }
    const aspect = media ? coverAspectOf(media.image) : 1;
    const px = (u - S.x) * A, py = v - S.y;
    const th = (S.rotation || 0) * Math.PI / 180;
    const rx = Math.cos(th) * px - Math.sin(th) * py, ry = Math.sin(th) * px + Math.cos(th) * py;
    return { x: rx / (S.scale * aspect) + 0.5, y: ry / S.scale + 0.5 };
  }
  function paintMask(S, from, to) {
    const media = picMedia.get(S.id);
    if (!media || !media.mask) return;
    const a = layerLocalPoint(S, from.x, from.y), b = layerLocalPoint(S, to.x, to.y);
    const w = media.mask.width, h = media.mask.height;
    // brush size is in cover design pixels: convert through the picture's scale
    const unit = layerLocalPoint(S, to.x + 1 / DESIGN_W, to.y);
    const perPx = Math.hypot((unit.x - b.x) * w, (unit.y - b.y) * h);
    const radius = Math.max(1, maskBrush.size * perPx / 2);
    const context = media.mask.getContext("2d");
    context.save();
    context.strokeStyle = maskBrush.mode === "add" ? "#fff" : "#000";
    context.fillStyle = context.strokeStyle;
    context.lineCap = "round"; context.lineJoin = "round";
    context.lineWidth = radius * 2;
    context.beginPath();
    context.moveTo(a.x * w, (1 - a.y) * h);
    context.lineTo(b.x * w, (1 - b.y) * h);
    context.stroke();
    context.beginPath();
    context.arc(b.x * w, (1 - b.y) * h, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    media.maskDirty = true;
  }
  function endMaskStroke(S) {
    const media = picMedia.get(S.id);
    if (!media || !media.mask) { cancelHistory(); return; }
    const rev = (S.maskRev || 0) + 1;
    S.maskRev = rev;
    media.maskRev = rev;
    rememberMaskVersion(S.id, rev, media.mask);
    commitHistory();
    stageMaskPicture(S, media.mask).catch(() => {});
  }

  // ---- things the pointer can move: glass layers and free pictures ----
  // One shape for both, so dragging, snapping, aligning and distributing do
  // not care which kind of layer they are moving. Bounds are in canvas uv (y up).
  function pictureAspect(S) {
    const media = picMedia.get(S.id);
    return media && media.image ? coverAspectOf(media.image) : 1;
  }
  function pictureBoundsUV(S) {
    if (S.placement === "cover") return { left: 0, right: 1, bottom: 0, top: 1 };
    if (S.placement === "registered") {
      const half = S.scale / 2;
      return { left: S.x - half, right: S.x + half, bottom: S.y - half, top: S.y + half };
    }
    const W = DESIGN_W, H = DESIGN_H;
    const w = S.scale * pictureAspect(S) * H, h = S.scale * H;
    const th = (S.rotation || 0) * Math.PI / 180;
    const boxW = Math.abs(w * Math.cos(th)) + Math.abs(h * Math.sin(th));
    const boxH = Math.abs(w * Math.sin(th)) + Math.abs(h * Math.cos(th));
    return { left: S.x - boxW / 2 / W, right: S.x + boxW / 2 / W, bottom: S.y - boxH / 2 / H, top: S.y + boxH / 2 / H };
  }
  function pictureMovable(S) {
    return !!S && S.kind === "picture" && S.id !== BG_LAYER_ID && !S.hidden && !S.locked && S.placement !== "cover";
  }
  function glassItem(L) {
    return { id: L.id, ref: L, glass: true, bounds: () => unitBoundsForLayer(L), x: () => L.cx, y: () => L.cy, setPos: (x, y) => setLayerPosition(L, x, y, true) };
  }
  function pictureItem(S) {
    return {
      id: S.id, ref: S, glass: false, bounds: () => pictureBoundsUV(S), x: () => S.x, y: () => S.y,
      setPos: (x, y) => { S.x = clampNum(x, -1, 2, S.x); S.y = clampNum(y, -1, 2, S.y); },
    };
  }
  function movableItems() {
    const items = selectedPositionRoots().map(glassItem);
    selectedStackLayers().forEach((S) => { if (pictureMovable(S)) items.push(pictureItem(S)); });
    return items;
  }
  function uvToRect(b, id) {
    return { id, x: b.left * DESIGN_W, y: (1 - b.top) * DESIGN_H, w: (b.right - b.left) * DESIGN_W, h: (b.top - b.bottom) * DESIGN_H };
  }
  function pickAt(point) {
    const inside = (b) => point.x >= b.left && point.x <= b.right && point.y >= b.bottom && point.y <= b.top;
    const pictureAt = (from, to) => {
      for (let i = from; i >= to; i--) {
        const S = picStack[i];
        if (pictureMovable(S) && S.placement === "free" && inside(pictureBoundsUV(S))) return { kind: "stack", id: S.id };
      }
      return null;
    };
    const over = pictureAt(picStack.length - 1, picSlot);
    if (over) return over;
    const glass = layerAtPoint(point);
    if (glass >= 0) return { kind: "glass", index: glass };
    return pictureAt(picSlot - 1, 1);
  }

  // Snapping is the edit kernel's: other layers' edges and centres, the frame,
  // and equal gaps between neighbours. The targets are gathered once when the
  // drag begins.
  function makeDragSnapper(excludedIds, canvasRect) {
    const others = [];
    layers.forEach((L) => {
      if (L.hidden || excludedIds.has(L.id) || excludedIds.has(L.parentId)) return;
      others.push(uvToRect(worldBounds(L), L.id));
    });
    picStack.forEach((S) => {
      if (!pictureMovable(S) || excludedIds.has(S.id) || S.placement === "registered") return;
      others.push(uvToRect(pictureBoundsUV(S), S.id));
    });
    return window.AISystem6EditSnap.createSnapper({
      rects: others,
      frame: { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H },
      threshold: 6 * DESIGN_W / Math.max(1, canvasRect.width),
    });
  }
  function snapDragDelta(snapper, bounds, rawDx, rawDy, disable) {
    const moved = uvToRect({ left: bounds.left + rawDx, right: bounds.right + rawDx, bottom: bounds.bottom + rawDy, top: bounds.top + rawDy });
    const out = snapper.snap(moved, { disabled: disable });
    const gx = out.guides.find((g) => g.axis === "x");
    const gy = out.guides.find((g) => g.axis === "y");
    return {
      dx: rawDx + (out.x - moved.x) / DESIGN_W,
      dy: rawDy - (out.y - moved.y) / DESIGN_H,
      guideX: gx ? gx.at / DESIGN_W : null,
      guideY: gy ? 1 - gy.at / DESIGN_H : null,
      spacing: out.spacing,
    };
  }
  function showSpacingBadge(spacing, bounds) {
    const guides = $("lc-alignment-guides");
    if (!guides) return;
    let badge = guides.querySelector(".lc-spacing-badge");
    if (!spacing || !spacing.length) { badge?.classList.remove("is-visible"); return; }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "lc-spacing-badge";
      guides.append(badge);
    }
    badge.textContent = tr("liquid_cover_equal_spacing", "Equal spacing {0}", Math.round(spacing[0].gap));
    badge.classList.add("is-visible");
  }

  function applyRectMoves(items, rects, moved) {
    items.forEach((item, index) => {
      const dx = (moved[index].x - rects[index].x) / DESIGN_W;
      const dy = -(moved[index].y - rects[index].y) / DESIGN_H;
      if (dx || dy) item.setPos(item.x() + dx, item.y() + dy);
    });
    syncWorkbenchReadout();
    updateSelectionOverlay();
    scheduleRender();
  }
  // Align several things to the one clicked last (it stays put), or to their
  // common bounds when none is named.
  function alignSelection(mode) {
    const items = movableItems();
    if (items.length < 2) return;
    const keyId = items.some((item) => item.id === layers[sel]?.id) && selectedLayerIds.has(layers[sel]?.id) ? layers[sel].id : (items.some((item) => item.id === selStack) ? selStack : "");
    runHistoryAction("liquid_cover_align_action", "Align layers", () => {
      const rects = items.map((item) => uvToRect(item.bounds(), item.id));
      applyRectMoves(items, rects, window.AISystem6EditSnap.alignRects(rects, mode, keyId));
    });
  }
  function distributeSelection(axis) {
    const items = movableItems();
    if (items.length < 3) return;
    runHistoryAction("liquid_cover_align_action", "Align layers", () => {
      const rects = items.map((item) => uvToRect(item.bounds(), item.id));
      applyRectMoves(items, rects, window.AISystem6EditSnap.distributeRects(rects, axis, "spacing"));
    });
  }
  function alignSelectedToArtboard(where) {
    const items = movableItems();
    if (!items.length) return;
    if (items.length > 1) {
      alignSelection({ left: "left", center: "hcenter", right: "right", top: "top", middle: "vcenter", bottom: "bottom" }[where]);
      return;
    }
    runHistoryAction("liquid_cover_align_action", "Align layers", () => {
      const item = items[0];
      const b = item.bounds();
      let dx = 0, dy = 0;
      if (where === "left") dx = 0 - b.left;
      if (where === "center") dx = 0.5 - (b.left + b.right) / 2;
      if (where === "right") dx = 1 - b.right;
      if (where === "top") dy = 1 - b.top;
      if (where === "middle") dy = 0.5 - (b.bottom + b.top) / 2;
      if (where === "bottom") dy = 0 - b.bottom;
      item.setPos(item.x() + dx, item.y() + dy);
      syncWorkbenchReadout();
      updateSelectionOverlay();
      scheduleRender();
    });
  }

  // ---- AI auto-style (reuses the app's local/cloud model plumbing) ----
  // t() echoes the key back when a string is missing, so a truthy result is not
  // proof of a real translation — compare against the key to fall back correctly.
  function tr(key, fallback, ...args) {
    const v = typeof t === "function" ? t(key, ...args) : null;
    return v && v !== key ? v : String(fallback || "").replace(/\{(\d+)\}/g, (match, index) => (args[index] === undefined ? match : args[index]));
  }
  function aiStatus(key, fallback) {
    const el = $("lc-ai-status");
    if (!el) return;
    el.textContent = tr("liquid_cover_ai_" + key, fallback);
  }
  // For dynamic, already-localized messages (the explainable AI choice, export
  // dimensions) — bypass the key table and show the text verbatim.
  function aiStatusText(text) {
    const el = $("lc-ai-status");
    if (el) el.textContent = text || "";
  }
  function clampNum(v, min, max, def) {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }
  function validHex(s) { return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null; }
  function parseJsonLoose(text) {
    if (!text) return null;
    let s = String(text).replace(/```json/gi, "```").replace(/```/g, "").trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  function coverPromptBody(id) {
    const projectId = typeof activeProjectId === "undefined" ? null : activeProjectId;
    const resolved = window.AISystem6PromptFilesRuntime?.resolvePromptFile?.(id, projectId, "en");
    const record = window.AISystem6PromptFiles?.find?.((item) => item.id === id);
    const body = resolved?.status === "ready" ? resolved.body : record?.en;
    if (!body) throw new Error(`Liquid Cover prompt file unavailable: ${id}`);
    if (resolved?.status === "ready") window.AISystem6PromptFilesRuntime?.recordPromptRun?.(projectId, id, resolved);
    return body;
  }

  function activeAspectKey() {
    const b = document.querySelector(".liquid-cover-window .lc-aspect button.is-active");
    return (b && b.dataset.k) || "16:9";
  }

  // Ask the model for a BACKGROUND text-to-image prompt (title is overlaid in
  // glass later). Returns the prompt string with both GPT-Image and universal
  // sections; throws Error with .code on failure.
  async function requestBgPromptText() {
    if (typeof fetchModelPayload !== "function") { const e = new Error("no model"); e.code = "unavailable"; throw e; }
    const brief = aiBrief();
    if (!brief) { const e = new Error("empty"); e.code = "empty"; throw e; }
    const aspect = activeAspectKey();
    const imgUrl = aiVisionOn() ? currentBgDataUrl(640) : null;
    const titleText = layers.map((l) => l.text.replace(/\n/g, " ")).join(" / ");
    const messages = window.AISystem6ImagePromptRuntime
      ? window.AISystem6ImagePromptRuntime.buildImagePromptMessages({
          idea: brief,
          title: titleText,
          aspect,
          background: true,
        })
      : [];
    const userMessage = messages.find((message) => message.role === "user");
    if (imgUrl && userMessage) {
      userMessage.content = [
        { type: "text", text: userMessage.content },
        { type: "image_url", image_url: { url: imgUrl } },
      ];
    }
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : undefined,
      messages: userMessage ? messages : [],
      temperature: 0.8,
      ai_system6_task_kind: "chat",
    }, typeof getLongTaskSignal === "function" ? getLongTaskSignal() : undefined);
    const data = await readChatJson(response);
    const content = ((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
    if (!content) { const e = new Error("empty response"); e.code = "parse"; throw e; }
    return content;
  }

  function showBgPrompt(text) {
    const out = $("lc-t2i-out");
    out.value = text;
    out.hidden = false;
    $("lc-t2i-copy").hidden = false;
  }

  async function writeBgPrompt() {
    aiStatus("thinking", "Thinking…");
    const button = $("lc-t2i-go");
    setBusy(button, true, tr("liquid_cover_ai_thinking", "Thinking…"));
    try {
      showBgPrompt(await requestBgPromptText());
      aiStatus("t2i_done", "Prompt ready — copy it");
    } catch (e) {
      aiStatus(e.code || "error", "Model request failed");
    } finally {
      setBusy(button, false);
    }
  }

  async function copyBgPrompt() {
    const out = $("lc-t2i-out");
    if (!out || !out.value) return;
    // Both paths can fail silently (a denied clipboard, an unsupported
    // execCommand). The prompt stays on screen either way, so say which
    // happened instead of claiming a copy that never occurred.
    let copied = false;
    try {
      await navigator.clipboard.writeText(out.value);
      copied = true;
    } catch (e) {
      out.removeAttribute("readonly");
      out.select();
      try { copied = document.execCommand("copy") === true; } catch (e2) { /* noop */ }
      out.setAttribute("readonly", "");
    }
    if (copied) aiStatus("t2i_copied", "Copied");
    else aiStatus("t2i_copy_failed", "The clipboard is unavailable — select the prompt and copy it by hand.");
  }

  // The bottom ask bar is the primary control: the user only describes a mood,
  // and the model configures (nearly) every parameter at once — optionally
  // reading the current background image.
  function aiBrief() {
    return (($("lc-ask-input").value || "").trim()) || layers.map((l) => l.text.replace(/\n/g, " ")).join(" / ");
  }
  function aiVisionOn() {
    return !!($("lc-ask-vision") && $("lc-ask-vision").checked);
  }

  // Deterministic keyword adjustments — no model, instant, predictable. Relative
  // words ("通透一点 / 更厚 / 加点色散 / 阴影少一些") nudge the actual sliders
  // so the common case never depends on an LLM (and never "feels magic").
  // Returns null when no keyword matched (the caller falls through to the model);
  // otherwise returns a list of localized "label before → after" strings so the
  // status line reports exactly what changed — never a vague "adjusted".
  function applyNudges(brief) {
    const s = String(brief).toLowerCase();
    if (/9to5mac|9to5|ninefive|九五|logo glass|hero glass|徽标玻璃|玻璃徽标/.test(s)) {
      const r = applyRecipeByName("ninefive");
      return r ? [recipeLabel(r.key)] : null;
    }
    let mag = 1;
    if (/一点|一些|些许|稍|略|slightly|a bit|a little/.test(s)) mag = 0.5;
    if (/更|再|很|非常|强烈|大幅|more |very |much /.test(s)) mag = 1.8;
    // Reduction words flip the keyword's built-in direction, so "阴影少一些"
    // means LESS shadow even though the 阴影 entry's base delta is positive.
    // "低" must not match inside 低调 (its own keyword below); bare 淡/小 are
    // too ambiguous (淡蓝色 = a light-blue tint, not "less"), so only their
    // unambiguous compounds count.
    const flip = /少|减|降|低(?!调)|弱|去掉|取消|不要|别|淡一|淡些|变淡|调淡|小一|小些|变小|调小|less|weaker|lower|reduce|remove|fewer|decrease/.test(s) ? -1 : 1;
    let hit = false;
    const changes = [];
    const fmt = (n) => Math.round(n * 100) / 100;
    const labelOf = (id) => {
      const el = $(id);
      const box = el && el.closest ? el.closest("label") : null;
      const span = box ? box.querySelector("span") : null;
      return (span && span.textContent.trim()) || id;
    };
    const report = (id, before, after) => { if (after !== before) changes.push(labelOf(id) + " " + fmt(before) + " → " + fmt(after)); };
    const cur = (id) => +$(id).value;
    const adj = (id, d, min, max) => { const x = $(id); if (x) { const before = cur(id); x.value = clampNum(before + d * mag * flip, min, max, before); hit = true; report(id, before, cur(id)); } };
    const adjLayer = (f, d, min, max, labelId) => {
      let before = null;
      layers.forEach((L, i) => { const b = +L[f] || 0; L[f] = clampNum(b + d * mag * flip, min, max, b); if (i === sel) before = b; });
      hit = true;
      if (before != null) report(labelId, before, +layers[sel][f]);
    };
    if (/通透|透明|清澈|clear|transparent/.test(s)) { adjLayer("tintAlpha", -15, 0, 100, "lc-tint-alpha"); adj("lc-blur-radius", -8, 0, 80); adj("lc-brightness", -4, -50, 50); }
    if (/磨砂|朦胧|雾|frost/.test(s)) { adj("lc-blur-radius", 12, 0, 80); }
    if (/清晰|锐|sharp|crisp/.test(s)) { adj("lc-blur-radius", -10, 0, 80); }
    if (/厚|thick/.test(s)) { adjLayer("refThickness", 14, 1, 80, "lc-thickness"); }
    if (/薄|thin/.test(s)) { adjLayer("refThickness", -12, 1, 80, "lc-thickness"); }
    if (/亮|高光|发光|闪|bright|glow|shiny/.test(s)) { adj("lc-light-intensity", 16, 0, 100); adj("lc-brightness", 5, -50, 50); }
    if (/暗|柔|低调|dark|soft|subtle|dim/.test(s)) { adj("lc-light-intensity", -16, 0, 100); adj("lc-brightness", -5, -50, 50); }
    if (/眩光|glare|反光|specular/.test(s)) { adj("lc-light-intensity", 14, 0, 100); adj("lc-splay", 12, 0, 100); }
    if (/色散|彩虹|虹彩|dispersion|rainbow|chromatic/.test(s)) { adj("lc-dispersion", 8, 0, 100); }
    if (/染色|着色|彩色|tint/.test(s)) { adjLayer("tintAlpha", 18, 0, 100, "lc-tint-alpha"); }
    if (/阴影|shadow/.test(s)) { adj("lc-shadow-factor", 12, 0, 100); }
    if (/折射|弯曲|refract|warp/.test(s)) { adj("lc-refraction", 14, 0, 100); }
    if (/放大|magnif/.test(s)) { adj("lc-magnify", 0.25, -4, 4); }
    if (hit) { loadLayerIntoPanel(); syncValueLabels(); renderNow(); scheduleRender(); }
    return hit ? changes : null;
  }

  async function aiSuggestStyle() {
    const brief = aiBrief();
    if (!brief) { aiStatus("empty", "Describe the cover first"); return; }
    // Try deterministic adjustments first — instant and predictable, no model.
    beginHistory("liquid_cover_style_action", "Change style");
    const nudged = applyNudges(brief);
    if (nudged) {
      commitHistory();
      aiStatusText(nudged.length ? nudged.join(" · ") : tr("liquid_cover_ai_nudge_limit", "Already at the limit — values unchanged."));
      return;
    }
    cancelHistory();
    if (typeof fetchModelPayload !== "function") { aiStatus("unavailable", "No model available"); return; }
    aiStatus("thinking", "Thinking…");
    const button = $("lc-ask-go");
    setBusy(button, true, tr("liquid_cover_ai_thinking", "Thinking…"));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const imgUrl = aiVisionOn() ? currentBgDataUrl(640) : null;
      // The model is an ART DIRECTOR, not a shader. It never emits optics — it
      // picks ONE named material from the catalog and makes color/light calls a
      // person could make. The numbers are owned by the recipe table on our side.
      const sys = coverPromptBody("other-apps.liquid-cover-style");
      const catalog = "Glass materials (choose exactly one as \"recipe\"):\n"
        + PRESETS.map((r) => "- " + r.key + ": " + r.desc).join("\n");
      const decide = 'Return exactly: {"recipe":"' + RECIPE_KEYS.join("|") + '",'
        + '"tintColor":"#rrggbb","tintStrength":"none|subtle|medium|strong",'
        + '"light":"top|top-left|left|bottom-left|bottom|bottom-right|right|top-right",'
        + '"modifiers":[]}. '
        + 'modifiers is 0-2 of: "brighter","softer","thinner","thicker","more-frosted","clearer","more-color","more-dispersion". '
        + 'Choose the recipe that best fits the mood. Use tintStrength "none" unless a colour clearly serves the mood. Do not add fields.';
      const visionNote = imgUrl
        ? "\nThe attached image is the background. Pick a tintColor that complements it with good contrast where the title sits, and set \"light\" to the direction the brightest light comes from in the image. Also add two fields: \"busyness\":\"clean|moderate|busy\" = how visually busy/detailed the area behind the title is (busy = lots of texture/contrast), and \"backdrop\":\"light|mid|dark\" = the overall tone of the area behind the title."
        : "\nNo background image is attached; infer \"light\" and any tint from the mood alone.";
      const user = "Mood / brief: " + brief + "\nTitle text (do not change it): " + layers.map((l) => l.text).join(" / ") + "\n\n" + catalog + "\n\n" + decide + visionNote;
      const userMessage = imgUrl
        ? { role: "user", content: [{ type: "text", text: user }, { type: "image_url", image_url: { url: imgUrl } }] }
        : { role: "user", content: user };
      const response = await fetchModelPayload({
        model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : undefined,
        messages: [{ role: "system", content: sys }, userMessage],
        temperature: 0.4,
        ai_system6_task_kind: "chat",
      }, ctrl.signal);
      const data = await readChatJson(response);
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      const spec = parseJsonLoose(content);
      if (!spec || !spec.recipe) { aiStatus("parse", "Model returned no usable choice"); return; }
      // Map the model's semantic choice → physics, all on our side.
      beginHistory("liquid_cover_style_action", "Change style");
      if (!applyRecipeByName(spec.recipe)) applyRecipeByName("clear");
      const tintApplied = applyVisionTint(spec, recipeByKey(spec.recipe) || recipeByKey("clear"));
      const ang = lightToAngle(spec.light);
      if (ang != null) setSlider("lc-light-angle", ang, -180, 180);
      const applied = applyModifiers(spec.modifiers);
      const busy = imgUrl ? applyBusyness(spec.busyness) : null; // background-adaptive thickness/frost
      const tone = imgUrl ? applyBackdrop(spec.backdrop) : null; // background-adaptive shadow
      loadLayerIntoPanel(); syncValueLabels(); renderNow(); scheduleRender();
      commitHistory();
      aiStatusText(describeChoice({ recipe: recipeByKey(spec.recipe) ? spec.recipe : "clear", tintColor: spec.tintColor, tintStrength: tintApplied || "none", light: spec.light, busyness: busy, backdrop: tone, modifiers: applied }));
    } catch (e) {
      cancelHistory();
      aiStatus(ctrl.signal.aborted ? "timeout" : "error", "Model request failed");
    } finally {
      clearTimeout(timer);
      setBusy(button, false);
    }
  }

  function setInspectorPanel(name) {
    const target = String(name || "layers");
    const inspectorCopy = {
      layers: ["liquid_cover_type_properties", "Type properties", "liquid_cover_type_hint", "Select a layer, then change only what matters to it."],
      media: ["liquid_cover_background_properties", "Background", "liquid_cover_background_hint", "Use a built-in scene or bring in your own image."],
      stack: ["liquid_cover_stack_properties", "Picture layer", "liquid_cover_stack_hint", "Blend, opacity, clipping and cut-out for the selected picture or adjustment."],
      glass: ["liquid_cover_glass_properties", "Glass material", "liquid_cover_glass_hint", "Start with a proven look; open fine-tune only when you need it."],
      export: ["liquid_cover_export_properties", "Export", "liquid_cover_export_hint", "Choose the output once the composition is ready."],
    };
    document.querySelectorAll(".liquid-cover-window [data-lc-inspector-tab]").forEach((button) => {
      const active = button.dataset.lcInspectorTab === target;
      button.classList.toggle("is-active", active);
      if (button.getAttribute("role") === "tab") {
        button.setAttribute("aria-selected", active ? "true" : "false");
      } else {
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
    document.querySelectorAll("#liquid-cover-app [data-lc-inspector-panel]").forEach((panel) => {
      const active = panel.dataset.lcInspectorPanel === target;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    const copy = inspectorCopy[target] || inspectorCopy.layers;
    const title = $("lc-inspector-title");
    const hint = $("lc-inspector-hint");
    if (title) {
      title.dataset.i18n = copy[0];
      title.textContent = tr(copy[0], copy[1]);
    }
    if (hint) {
      hint.dataset.i18n = copy[2];
      hint.textContent = tr(copy[2], copy[3]);
    }
    if (target === "export") { renderNow(); }
    if (target === "media") renderAlbumPanel();
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    if (typeof syncRovingTabStops === "function") {
      const tablist = document.querySelector(".liquid-cover-window .lc-toolbar-modes");
      if (tablist) syncRovingTabStops(tablist);
    }
  }

  function wireInspectorTabs() {
    document.querySelectorAll(".liquid-cover-window [data-lc-inspector-tab]").forEach((button) => {
      button.addEventListener("click", () => setInspectorPanel(button.dataset.lcInspectorTab));
    });
    setInspectorPanel("layers");
  }

  function wireStageExpand() {
    const btn = $("lc-stage-expand");
    const win = document.querySelector(".liquid-cover-window");
    if (!btn || !win) return;
    btn.addEventListener("click", () => {
      const focused = win.classList.toggle("is-stage-focused");
      btn.setAttribute("aria-pressed", focused ? "true" : "false");
    });
  }

  function wrapDegrees(value) {
    let result = value % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return result;
  }

  // Scale and rotate a picture from the selection box's handles.
  function startPictureTransform(event, kind, S) {
    event.preventDefault();
    event.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const center = { x: rect.left + S.x * rect.width, y: rect.top + (1 - S.y) * rect.height };
    const startDx = event.clientX - center.x;
    const startDy = event.clientY - center.y;
    const startDistance = Math.max(8, Math.hypot(startDx, startDy));
    const startAngle = Math.atan2(startDy, startDx);
    const origin = { scale: S.scale, rotation: S.rotation };
    beginHistory("liquid_cover_transform_action", "Transform layer");
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let moved = false;
    const detach = (pointerId) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", cancel);
      try { handle.releasePointerCapture(pointerId); } catch (error) { /* noop */ }
    };
    function move(moveEvent) {
      moved = true;
      const dx = moveEvent.clientX - center.x;
      const dy = moveEvent.clientY - center.y;
      if (kind === "scale") S.scale = clampNum(origin.scale * clampNum(Math.hypot(dx, dy) / startDistance, 0.2, 5, 1), 0.05, 3, origin.scale);
      else if (S.placement !== "registered") S.rotation = wrapDegrees(origin.rotation + (Math.atan2(dy, dx) - startAngle) * 180 / Math.PI);
      renderStackInspector();
      updateSelectionOverlay();
      scheduleRender();
    }
    function end(endEvent) {
      detach(endEvent.pointerId);
      if (moved) commitHistory(); else cancelHistory();
    }
    function cancel(cancelEvent) {
      detach(cancelEvent.pointerId);
      S.scale = origin.scale; S.rotation = origin.rotation;
      cancelHistory();
      renderStackInspector();
      scheduleRender();
    }
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", cancel);
  }

  function wireTransformHandles() {
    const scaleHandle = $("lc-transform-scale");
    const rotateHandle = $("lc-transform-rotate");
    if (!scaleHandle || !rotateHandle || !canvas) return;

    const startTransform = (event, kind) => {
      if (event.button !== 0) return;
      const movable = movableItems();
      if (movable.length !== 1) return;
      if (!movable[0].glass) { startPictureTransform(event, kind, movable[0].ref); return; }
      const root = movable[0].ref;
      event.preventDefault();
      event.stopPropagation();
      const members = uniqueLayers([root, ...linkedChildren(root).filter((child) => !child.hidden && !child.locked)]);
      const rect = canvas.getBoundingClientRect();
      const center = {
        x: rect.left + root.cx * rect.width,
        y: rect.top + (1 - root.cy) * rect.height,
      };
      const startDx = event.clientX - center.x;
      const startDy = event.clientY - center.y;
      const state = {
        kind,
        root,
        members,
        center,
        startX: event.clientX,
        startY: event.clientY,
        startDistance: Math.max(8, Math.hypot(startDx, startDy)),
        startAngle: Math.atan2(startDy, startDx),
        moved: false,
        originals: members.map((L) => ({
          L,
          fontSize: L.fontSize,
          rotation: L.rotation,
          cx: L.cx,
          cy: L.cy,
        })),
      };
      beginHistory("liquid_cover_transform_action", "Transform layer");
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        if (!state.moved && Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY) < 2) return;
        state.moved = true;
        const dx = moveEvent.clientX - state.center.x;
        const dy = moveEvent.clientY - state.center.y;
        if (state.kind === "scale") {
          const ratio = clampNum(Math.hypot(dx, dy) / state.startDistance, 0.2, 5, 1);
          state.originals.forEach((origin) => {
            origin.L.fontSize = clampNum(origin.fontSize * ratio, 20, 600, origin.fontSize);
            if (origin.L !== state.root) {
              origin.L.cx = state.root.cx + (origin.cx - state.root.cx) * ratio;
              origin.L.cy = state.root.cy + (origin.cy - state.root.cy) * ratio;
            }
          });
        } else {
          const delta = Math.atan2(dy, dx) - state.startAngle;
          const cosine = Math.cos(-delta);
          const sine = Math.sin(-delta);
          state.originals.forEach((origin) => {
            origin.L.rotation = wrapDegrees(origin.rotation + delta * 180 / Math.PI);
            if (origin.L !== state.root) {
              const ox = origin.cx - state.root.cx;
              const oy = origin.cy - state.root.cy;
              origin.L.cx = state.root.cx + ox * cosine - oy * sine;
              origin.L.cy = state.root.cy + ox * sine + oy * cosine;
            }
          });
        }
        rebuildAllSDF();
        loadLayerIntoPanel();
        updateSelectionOverlay();
        scheduleRender();
      };
      const end = (endEvent) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", cancel);
        try { handle.releasePointerCapture(endEvent.pointerId); } catch (error) { /* noop */ }
        if (state.moved) commitHistory();
        else cancelHistory();
      };
      const cancel = (cancelEvent) => {
        state.originals.forEach((origin) => {
          origin.L.fontSize = origin.fontSize;
          origin.L.rotation = origin.rotation;
          origin.L.cx = origin.cx;
          origin.L.cy = origin.cy;
        });
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", cancel);
        try { handle.releasePointerCapture(cancelEvent.pointerId); } catch (error) { /* noop */ }
        cancelHistory();
        rebuildAllSDF();
        loadLayerIntoPanel();
        scheduleRender();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", cancel);
    };

    scaleHandle.addEventListener("pointerdown", (event) => startTransform(event, "scale"));
    rotateHandle.addEventListener("pointerdown", (event) => startTransform(event, "rotate"));
  }

  function wireHistoryControls() {
    const ids = [
      "lc-text", "lc-font", "lc-font-size", "lc-font-weight", "lc-letter-spacing", "lc-rotation",
      "lc-thickness", "lc-tint-color", "lc-tint-alpha", "lc-layer-solid",
      ...HISTORY_CONTROL_IDS,
    ];
    ids.forEach((id) => {
      const control = $(id);
      if (!control) return;
      const begin = () => beginHistory("liquid_cover_edit_action", "Edit layer");
      control.addEventListener("pointerdown", begin);
      control.addEventListener("focusin", begin);
      control.addEventListener("change", commitHistory);
      control.addEventListener("blur", commitHistory);
      if (control.matches('input[type="range"]')) {
        control.addEventListener("pointerup", commitHistory);
        control.addEventListener("pointercancel", cancelHistory);
        control.addEventListener("keydown", (event) => { if (/^(Arrow|Page|Home|End)/.test(event.key)) begin(); });
      }
    });
  }

  function wireStageKeyboard() {
    if (!canvas) return;
    canvas.addEventListener("keydown", (event) => {
      const command = event.metaKey || event.ctrlKey;
      // ⌘Z / ⇧⌘Z arrive through the desk's Edit menu route, which asks the
      // history registered below; answering them here as well undid twice.
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoEditor();
        return;
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelectedLayers();
        return;
      }
      if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAllLayers();
        renderLayerList();
        loadLayerIntoPanel();
        return;
      }
      if (command && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        const forward = event.key === "]";
        moveSelectedLayer(event.shiftKey ? (forward ? "top" : "bottom") : (forward ? "up" : "down"));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        selectOnly(sel);
        renderLayerList();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removeSelectedLayer();
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const stepPx = event.shiftKey ? 10 : 1;
      const dx = (event.key === "ArrowLeft" ? -stepPx : event.key === "ArrowRight" ? stepPx : 0) / DESIGN_W;
      const dy = (event.key === "ArrowDown" ? -stepPx : event.key === "ArrowUp" ? stepPx : 0) / DESIGN_H;
      beginHistory("liquid_cover_move_action", "Move layer");
      const S = subjectLayer();
      if (dragFgMode && S && pictureMovable(S)) {
        pictureItem(S).setPos(S.x + dx, S.y + dy);
      } else {
        movableItems().forEach((item) => item.setPos(item.x() + dx, item.y() + dy));
      }
      syncWorkbenchReadout();
      updateSelectionOverlay();
      scheduleRender();
      commitHistory();
    });
  }

  function wireHistoryKeyboard() {
    document.addEventListener("keydown", (event) => {
      if (event.target === canvas || !event.target.closest?.(".liquid-cover-window")) return;
      const command = event.metaKey || event.ctrlKey;
      if (!command) return;
      const key = event.key.toLowerCase();
      if (key === "y") {
        event.preventDefault();
        redoEditor();
      } else if (key === "d" && !event.target.matches("input, textarea, select")) {
        event.preventDefault();
        duplicateSelectedLayers();
      }
    });
  }

  function wireFineTuneGroups() {
    const fineTune = document.querySelector("#liquid-cover-app .lc-finetune");
    if (!fineTune) return;
    fineTune.addEventListener("toggle", () => {
      if (!fineTune.open) return;
      document.querySelectorAll("#liquid-cover-app .lc-tune-group").forEach((group) => {
        group.open = true;
      });
    });
  }

  function wireCoverDocument() {
    const title = $("lc-cover-title");
    if (title) title.addEventListener("input", () => { cover.title = title.value; markCoverDirty(); });
    $("lc-add-picture").addEventListener("click", () => $("lc-picture-file").click());
    $("lc-picture-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) addPictureFromFile(f, "layer");
    });
    $("lc-add-album").addEventListener("click", () => showAlbumPanel());
    document.querySelectorAll("#lc-album-as button").forEach((button) => {
      button.addEventListener("click", () => { albumAs = button.dataset.as; renderAlbumPanel(); });
    });
    $("lc-add-adjust-bc").addEventListener("click", () => addAdjustmentLayer("brightnessContrast"));
    $("lc-add-adjust-hs").addEventListener("click", () => addAdjustmentLayer("hueSaturation"));
    $("lc-add-adjust-blur").addEventListener("click", () => addAdjustmentLayer("blur"));
    document.querySelectorAll(".lc-align-selection [data-align]").forEach((button) => {
      button.addEventListener("click", () => alignSelection(button.dataset.align));
    });
    document.querySelectorAll(".lc-distribute-selection [data-distribute]").forEach((button) => {
      button.addEventListener("click", () => distributeSelection(button.dataset.distribute));
    });
    $("lc-cutout-go").addEventListener("click", removeBackground);
    $("lc-cutout-clear").addEventListener("click", clearCutout);
    $("lc-cutout-refine").addEventListener("click", () => {
      maskBrush.on = !maskBrush.on;
      canvas.classList.toggle("is-mask-brush", maskBrush.on);
      syncCutoutControls();
    });
    [["lc-brush-add", "add"], ["lc-brush-subtract", "subtract"]].forEach(([id, mode]) => {
      $(id).addEventListener("click", () => {
        maskBrush.mode = mode;
        ["lc-brush-add", "lc-brush-subtract"].forEach((other) => {
          const active = other === id;
          $(other).classList.toggle("is-active", active);
          $(other).setAttribute("aria-pressed", active ? "true" : "false");
        });
      });
    });
    $("lc-brush-size").addEventListener("input", () => { maskBrush.size = +$("lc-brush-size").value; syncValueLabels(); });
    $("lc-cutout-model-choose").addEventListener("click", () => $("lc-cutout-model-file").click());
    $("lc-cutout-model-file").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (!files.length) return;
      try {
        await ensureLiquidCoverCutoutModule();
        const result = await window.AISystem6CoverCutout.importFiles(files);
        if (result.ok) {
          $("lc-cutout-model").hidden = true;
          aiStatusText(tr("liquid_cover_cutout_model_kept", "Model files kept on this computer. Press Remove Background again."));
        } else {
          showCutoutModelNeed({ missing: result.missing });
        }
      } catch {
        aiStatusText(tr("liquid_cover_cutout_unavailable", "The cut-out module could not be loaded."));
      }
    });
    wirePictureDrops();
  }

  function wire() {
    wireInspectorTabs();
    wireStageExpand();
    wireStageKeyboard();
    wireHistoryKeyboard();
    wireTransformHandles();
    wireFineTuneGroups();
    wireFontControls();
    wireHistoryControls();
    wireCoverDocument();
    $("lc-undo").addEventListener("click", undoEditor);
    $("lc-redo").addEventListener("click", redoEditor);

    // keep the blue track fill in sync while any slider is dragged
    const app = $("liquid-cover-app");
    if (app) app.addEventListener("input", (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[type="range"]')) updateSliderFill(t);
    });

    // aspect buttons: each size is a variant of this one cover
    document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((b) => {
      b.addEventListener("click", () => switchCoverVariant(b.dataset.k));
    });

    // per-layer text geometry → rebuild that layer's SDF
    ["lc-text", "lc-font", "lc-font-size", "lc-font-weight", "lc-letter-spacing", "lc-rotation"].forEach((id) => {
      $(id).addEventListener("input", () => {
        const L = layers[sel];
        if (id === "lc-text") L.text = $("lc-text").value;
        else if (id === "lc-font") {
          if (!applyFontSelection()) return;
        }
        else L[{ "lc-font-size": "fontSize", "lc-font-weight": "fontWeight", "lc-letter-spacing": "letterSpacing", "lc-rotation": "rotation" }[id]] = +$(id).value;
        syncValueLabels();
        rebuildLayerSDF(sel);
        if (id === "lc-text") renderLayerList();
        scheduleRender();
      });
      // <select> also fires "change"
      $(id).addEventListener("change", () => {
        if (id === "lc-font" && applyFontSelection()) {
          rebuildLayerSDF(sel);
          scheduleRender();
        }
      });
    });

    // per-layer optics → re-render only
    [["lc-thickness", "refThickness"], ["lc-tint-color", "tintColor"], ["lc-tint-alpha", "tintAlpha"]].forEach((pair) => {
      $(pair[0]).addEventListener("input", () => {
        const L = layers[sel];
        setActivePreset("");
        if (pair[0] === "lc-tint-color") {
          L[isSolidLayer(L) ? "solidColor" : "tintColor"] = $(pair[0]).value;
        } else {
          L[pair[1]] = +$(pair[0]).value;
        }
        syncValueLabels(); scheduleRender();
      });
    });
    $("lc-layer-solid").addEventListener("change", () => {
      const L = layers[sel];
      L.renderMode = $("lc-layer-solid").checked ? "solid" : "glass";
      setActivePreset("");
      loadLayerIntoPanel();
      scheduleRender();
    });

    // global glass / shadow
    ["lc-light-angle", "lc-light-intensity", "lc-splay", "lc-refraction", "lc-dispersion", "lc-blur-radius", "lc-brightness", "lc-saturation", "lc-shadow-factor", "lc-shadow-expand", "lc-magnify", "lc-merge", "lc-post-blur"].forEach((id) => {
      $(id).addEventListener("input", () => { setActivePreset(""); syncValueLabels(); scheduleRender(); });
    });
    $("lc-material-mix").addEventListener("input", () => {
      applyMaterialMix(+$("lc-material-mix").value);
    });

    [
      ["lc-layer-bottom", "bottom"],
      ["lc-layer-down", "down"],
      ["lc-layer-up", "up"],
      ["lc-layer-top", "top"],
    ].forEach(([id, where]) => $(id).addEventListener("click", () => moveSelectedLayer(where)));
    [
      ["lc-align-left", "left"],
      ["lc-align-center", "center"],
      ["lc-align-right", "right"],
      ["lc-align-top", "top"],
      ["lc-align-middle", "middle"],
      ["lc-align-bottom", "bottom"],
    ].forEach(([id, where]) => $(id).addEventListener("click", () => alignSelectedToArtboard(where)));
    $("lc-add-inside-text").addEventListener("click", addTextInsideSelectedShape);
    $("lc-duplicate-layer").addEventListener("click", duplicateSelectedLayers);

    // layers add/remove
    $("lc-add-layer").addEventListener("click", () => {
      if (layers.length >= MAX_LAYERS) return;
      beginHistory("liquid_cover_add_action", "Add layer");
      layers.push(makeLayer({ text: "Text", cx: 0.5, cy: Math.max(0.15, 0.5 - layers.length * 0.18) }));
      selectOnly(layers.length - 1);
      rebuildLayerSDF(sel); loadLayerIntoPanel(); renderLayerList(); setInspectorPanel("layers"); scheduleRender();
      commitHistory();
    });
    $("lc-del-layer").addEventListener("click", removeSelectedLayer);
    // built-in preset shapes (circle / squircle / capsule) — one click, no upload
    $("lc-shape-circle").addEventListener("click", () => addBuiltinShape("circle", "liquid_cover_shape_circle", "Circle"));
    $("lc-shape-squircle").addEventListener("click", () => addBuiltinShape("squircle", "liquid_cover_shape_squircle", "Rounded Rect"));
    $("lc-shape-capsule").addEventListener("click", () => addBuiltinShape("capsule", "liquid_cover_shape_capsule", "Capsule"));
    // shape layers: any uploaded image becomes a glass shape via the same SDF path
    $("lc-add-shape").addEventListener("click", () => {
      if (layers.length >= MAX_LAYERS) return;
      $("lc-shape-file").click();
    });
    $("lc-shape-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      loadImageFile(f, (img) => {
        if (layers.length >= MAX_LAYERS) return;
        beginHistory("liquid_cover_add_action", "Add layer");
        layers.push(makeLayer({
          shape: img,
          shapeAssetId: crypto.randomUUID(),
          renderMode: "glass",
          text: (f.name || "Shape").replace(/\.[^.]+$/, ""),
          cx: 0.5, cy: Math.max(0.15, 0.5 - (layers.length - 1) * 0.18),
        }));
        selectOnly(layers.length - 1);
        rebuildLayerSDF(sel); loadLayerIntoPanel(); renderLayerList(); setInspectorPanel("glass"); scheduleRender();
        commitHistory();
      });
    });

    // background upload: the chosen photo becomes a picture the cover can keep
    $("lc-bg-choose").addEventListener("click", () => $("lc-bg-input").click());
    $("lc-bg-input").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      clearMotionVideo(false);
      loadImageFile(f, (img) => {
        runHistoryAction("liquid_cover_subject_action", "Place picture", () => {
          const assetId = crypto.randomUUID();
          localBackgrounds.set(assetId, { image: img, file: f });
          activeBg = -1;
          setBackgroundPicture(img, { kind: "asset", assetId, name: f.name });
          if (coverProject()) ensureStaged(assetId, localBackgrounds.get(assetId), "cover-background", 0, "background").catch(() => {});
        });
      });
    });

    // motion video background / animation export
    $("lc-motion-choose").addEventListener("click", () => $("lc-motion-input").click());
    $("lc-motion-input").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      setMotionVideoFile(f);
    });
    $("lc-motion-clear").addEventListener("click", () => clearMotionVideo(true));
    $("lc-motion-preset").addEventListener("change", () => {
      stopMotionPreview(false);
      scheduleRender();
    });
    $("lc-motion-duration").addEventListener("input", () => {
      syncValueLabels();
      stopMotionPreview(false);
      scheduleRender();
    });
    $("lc-motion-preview").addEventListener("click", previewMotionOnce);
    $("lc-motion-export").addEventListener("click", exportVideo);

    // subject (the picture over the glass): every control works on a picture layer
    $("lc-fg-choose").addEventListener("click", () => $("lc-fg-input").click());
    $("lc-fg-input").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      e.target.value = "";
      addPictureFromFile(f, "subject");
    });
    $("lc-fg-clear").addEventListener("click", () => {
      const S = subjectLayer();
      if (!S) return;
      selectOnlyStack(S.id);
      removeSelectedStack();
    });
    $("lc-fg-scale").addEventListener("input", () => {
      const S = subjectLayer();
      if (!S) return;
      beginHistory("liquid_cover_subject_action", "Place picture");
      S.scale = clampNum(+$("lc-fg-scale").value / 100, 0.05, 3, S.scale);
      syncValueLabels(); renderStackInspector(); updateSelectionOverlay(); scheduleRender();
    });
    $("lc-fg-scale").addEventListener("change", commitHistory);
    $("lc-fg-drag").addEventListener("change", () => { dragFgMode = $("lc-fg-drag").checked; });
    $("lc-fg-register").addEventListener("change", () => {
      const S = subjectLayer();
      if (!S) return;
      runHistoryAction("liquid_cover_subject_action", "Place picture", () => {
        applyStackField(S, "placement", $("lc-fg-register").checked ? "registered" : "free");
        syncSubjectControls(); renderStackInspector(); scheduleRender();
      });
    });

    // Bottom ask bar: describe a mood → AI configures every parameter
    $("lc-ask-form").addEventListener("submit", (e) => { e.preventDefault(); aiSuggestStyle(); });

    // AI write text-to-image prompt for the background
    $("lc-t2i-go").addEventListener("click", writeBgPrompt);
    $("lc-t2i-copy").addEventListener("click", copyBgPrompt);

    // drag positioning: glass layers and pictures move the same way
    let drag = null;
    const beginItemDrag = (e, p, items) => {
      const ids = new Set();
      items.forEach((item) => {
        ids.add(item.id);
        if (item.glass) linkedChildren(item.ref).forEach((child) => ids.add(child.id));
      });
      beginHistory("liquid_cover_move_action", "Move layer");
      const rect = canvas.getBoundingClientRect();
      drag = {
        kind: "items",
        start: p,
        originals: items.map((item) => ({ item, x: item.x(), y: item.y() })),
        bounds: boundsUnion(items.map((item) => item.bounds())),
        snapper: makeDragSnapper(ids, rect),
      };
    };
    canvas.addEventListener("pointerdown", (e) => {
      const p = pointerToUV(e);
      canvas.focus({ preventScroll: true });
      liquidDropAt(p, true);
      const brushTarget = maskBrush.on ? cutoutTarget() : null;
      if (brushTarget && brushTarget.maskId && picMedia.get(brushTarget.id)?.mask) {
        // Refining the cut-out: the pointer paints the mask, it moves nothing.
        beginHistory("liquid_cover_mask_action", "Refine cut-out");
        const media = picMedia.get(brushTarget.id);
        if (!maskVersions.get(brushTarget.id)?.has(brushTarget.maskRev || 0)) rememberMaskVersion(brushTarget.id, brushTarget.maskRev || 0, media.mask);
        drag = { kind: "mask", S: brushTarget, last: p };
        paintMask(brushTarget, p, p);
        scheduleRender();
      } else if (dragFgMode && subjectLayer() && pictureMovable(subjectLayer())) {
        const S = subjectLayer();
        if (!selectedStackIds.has(S.id)) { selectOnlyStack(S.id); renderLayerList(); renderStackInspector(); }
        beginItemDrag(e, p, [pictureItem(S)]);
      } else {
        const hit = pickAt(p);
        if (!hit) {
          drag = {
            kind: "marquee",
            start: p,
            additive: e.shiftKey,
            baseIds: new Set(selectedLayerIds),
            moved: false,
          };
          showSelectionMarquee(marqueeBounds(p, p));
        } else if (hit.kind === "glass") {
          if (e.shiftKey) toggleLayerSelection(hit.index);
          else if (!selectedLayerIds.has(layers[hit.index].id)) selectOnly(hit.index);
          renderLayerList();
          loadLayerIntoPanel();
          renderStackInspector();
          setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
          if (!selectedLayerIds.has(layers[hit.index].id)) return;
          beginItemDrag(e, p, movableItems());
        } else {
          if (e.shiftKey) {
            if (selectedStackIds.has(hit.id) && selectedStackIds.size + selectedLayerIds.size > 1) selectedStackIds.delete(hit.id);
            else { selectedStackIds.add(hit.id); selStack = hit.id; }
          } else if (!selectedStackIds.has(hit.id)) {
            selectOnlyStack(hit.id);
          } else {
            selStack = hit.id;
          }
          renderLayerList();
          renderStackInspector();
          syncSubjectControls();
          setInspectorPanel("stack");
          const items = movableItems();
          if (!items.some((item) => item.id === hit.id)) return;
          beginItemDrag(e, p, items);
        }
      }
      canvas.setPointerCapture(e.pointerId);
      if (drag.kind !== "marquee") {
        canvas.classList.add("is-grabbing");
        canvas.dataset.dragging = "true";
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      // the pointer stirs the water whether it hovers or drags glass through it
      const p = pointerToUV(e);
      liquidDropAt(p, false);
      if (!drag) return;
      const rawDx = p.x - drag.start.x;
      const rawDy = p.y - drag.start.y;
      if (drag.kind === "mask") {
        paintMask(drag.S, drag.last, p);
        drag.last = p;
        scheduleRender();
        return;
      }
      if (drag.kind === "marquee") {
        const bounds = marqueeBounds(drag.start, p);
        drag.moved ||= Math.abs(rawDx * DESIGN_W) > 3 || Math.abs(rawDy * DESIGN_H) > 3;
        showSelectionMarquee(bounds);
        if (drag.moved) {
          const hitIds = layers.filter((L) => boundsIntersect(bounds, worldBounds(L))).map((L) => L.id);
          const next = drag.additive ? new Set(drag.baseIds) : new Set();
          hitIds.forEach((id) => next.add(id));
          if (next.size) {
            selectedLayerIds.clear();
            selectedStackIds.clear();
            selStack = "";
            next.forEach((id) => selectedLayerIds.add(id));
            for (let i = layers.length - 1; i >= 0; i--) {
              if (selectedLayerIds.has(layers[i].id)) {
                sel = i;
                break;
              }
            }
            renderLayerList();
            loadLayerIntoPanel();
          }
        }
        return;
      }
      moveDraggedItems(e, rawDx, rawDy);
    });
    const moveDraggedItems = (e, rawDx, rawDy) => {
      const snapped = snapDragDelta(drag.snapper, drag.bounds, rawDx, rawDy, e.altKey);
      drag.originals.forEach((origin) => {
        origin.item.setPos(origin.x + snapped.dx, origin.y + snapped.dy);
      });
      showAlignmentGuides(snapped.guideX, snapped.guideY);
      showSpacingBadge(snapped.spacing, drag.bounds);
      syncWorkbenchReadout();
      updateSelectionOverlay();
      scheduleRender();
    };
    const endDrag = (e) => {
      // the release is the last position of the drag
      if (drag && drag.kind === "items" && e.type === "pointerup") {
        const p = pointerToUV(e);
        moveDraggedItems(e, p.x - drag.start.x, p.y - drag.start.y);
      }
      const finished = drag;
      if (finished?.kind === "marquee") clearSelectionMarquee();
      drag = null;
      clearAlignmentGuides();
      showSpacingBadge(null);
      canvas.classList.remove("is-grabbing");
      delete canvas.dataset.dragging;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (finished?.kind === "mask") {
        paintMask(finished.S, finished.last, pointerToUV(e));
        endMaskStroke(finished.S);
        scheduleRender();
      }
      else if (finished && finished.kind !== "marquee") {
        if (e.type === "pointercancel") {
          finished.originals.forEach((origin) => origin.item.setPos(origin.x, origin.y));
          cancelHistory();
        } else {
          commitHistory();
        }
        renderStackInspector();
      }
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    // liquid surface
    $("lc-liquid-mode").addEventListener("change", () => {
      syncLiquidControls();
      if (liquidModeValue() > 0 && liquidReady() && liquid.energy <= 0) liquidRain();
      renderNow();
    });
    ["lc-liquid-strength", "lc-liquid-drop"].forEach((id) => {
      $(id).addEventListener("input", () => { syncValueLabels(); renderNow(); });
    });
    $("lc-liquid-rain").addEventListener("click", liquidRain);
    $("lc-liquid-calm").addEventListener("click", liquidCalm);
    $("lc-liquid-freeze").addEventListener("click", () => setLiquidFrozen(!liquid.frozen));
    syncLiquidControls();

    // export at full source resolution
    $("lc-export").addEventListener("click", exportPng);
    const resSel = $("lc-export-res");
    if (resSel) resSel.addEventListener("change", updateExportDimNote);
  }

  // Renderer creation can fail (WebGL2 context refused — e.g. too many GPU-heavy
  // tabs, GPU reset). It must never take the UI down with it: the controls are
  // built first, the failure is shown visibly, and reopening the window retries.
  function initRenderer() {
    try {
      renderer = new Renderer(canvas);
      return true;
    } catch (e) {
      renderer = null;
      aiStatus("webgl", "WebGL unavailable — close other GPU-heavy tabs, then reopen this window.");
      return false;
    }
  }
  function startRendering() {
    if (!initRenderer()) return;
    aiStatusText("");            // clear a stale WebGL warning from a failed earlier attempt
    setBg(neutralBg());          // neutral until the first photo decodes (avoids a blank first frame)
    setBgFromUrl(BG_URLS[0]);    // then the real built-in photo
    syncRendererPictures();
    rebuildAllSDF();
    renderNow();        // paint the first frame immediately (don't wait for rAF)
    scheduleRender();
  }
  function init() {
    canvas = $("lc-canvas");
    layers.length = 0; layers.push(makeLayer());
    selectOnly(0);
    // A new window is a new cover; working pictures left by an earlier session
    // that was never saved are cleared.
    if (window.AISystem6EditAssets) window.AISystem6EditAssets.clearStagedAssets({ app: "liquidCover" });
    picStack.length = 0; picStack.push(makeBackgroundLayer()); picSlot = 1;
    variantKey = "16:9";
    variants[variantKey] = { w: ASPECTS[variantKey][0], h: ASPECTS[variantKey][1], layout: {} };
    applyAspect(DESIGN_W, DESIGN_H);
    // mark the default aspect button active
    document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((b) => {
      const active = b.dataset.k === "16:9";
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
    // UI first — these must exist even if WebGL is unavailable right now
    buildLayersPanel();
    buildStackInspector();
    wire();
    buildBgRow();
    buildPresetRow();
    renderLayerList();
    loadLayerIntoPanel();
    renderStackInspector();
    syncSubjectControls();
    syncAspectButtons();
    applyMaterialMix(0); // open water-clear (the Apple Liquid Glass reference), not frosted
    updateHistoryButtons();
    startRendering();
  }

  async function open(options = {}) {
    if (!inited) { init(); inited = true; }
    else if (!renderer) { startRendering(); } // WebGL failed last time — retry now
    else { renderNow(); scheduleRender(); }
    if (typeof openWindow === "function") await openWindow("liquidCover", { ...options, skipLiquidCoverEntrypoint: true });
    if (motionVideo) renderNow();
  }

  function runMenuCommand(command) {
    if (!inited) { init(); inited = true; }
    const commands = {
      "choose-background": () => $("lc-bg-input")?.click(),
      "choose-video": () => $("lc-motion-input")?.click(),
      "choose-subject": () => $("lc-fg-input")?.click(),
      "export-png": exportPng,
      "export-video": exportVideo,
      "undo": undoEditor,
      "redo": redoEditor,
      "save": () => saveCover(),
      "save-as": () => saveCover({ asNew: true }),
      "send-stage": () => sendCoverToStage(),
      "new": newCover,
      "add-picture": () => $("lc-picture-file")?.click(),
      "from-album": () => showAlbumPanel(),
      "remove-background": removeBackground,
      "add-adjust-brightness": () => addAdjustmentLayer("brightnessContrast"),
      "add-adjust-hue": () => addAdjustmentLayer("hueSaturation"),
      "add-adjust-blur": () => addAdjustmentLayer("blur"),
      "distribute-h": () => distributeSelection("x"),
      "distribute-v": () => distributeSelection("y"),
      "add-layer": () => {
        if (layers.length >= MAX_LAYERS) return;
        beginHistory("liquid_cover_add_action", "Add layer");
        layers.push(makeLayer({ text: "Text", cx: 0.5, cy: Math.max(0.15, 0.5 - layers.length * 0.18) }));
        selectOnly(layers.length - 1);
        rebuildLayerSDF(sel);
        renderLayerList();
        loadLayerIntoPanel();
        setInspectorPanel("layers");
        scheduleRender();
        commitHistory();
      },
      "duplicate-layer": duplicateSelectedLayers,
      "delete-layer": removeSelectedLayer,
      "text-in-shape": addTextInsideSelectedShape,
      "layer-up": () => moveSelectedLayer("up"),
      "layer-down": () => moveSelectedLayer("down"),
      "layer-top": () => moveSelectedLayer("top"),
      "layer-bottom": () => moveSelectedLayer("bottom"),
      "align-left": () => alignSelectedToArtboard("left"),
      "align-center": () => alignSelectedToArtboard("center"),
      "align-right": () => alignSelectedToArtboard("right"),
      "align-top": () => alignSelectedToArtboard("top"),
      "align-middle": () => alignSelectedToArtboard("middle"),
      "align-bottom": () => alignSelectedToArtboard("bottom"),
      "shape-circle": () => addBuiltinShape("circle", "liquid_cover_shape_circle", "Circle"),
      "shape-squircle": () => addBuiltinShape("squircle", "liquid_cover_shape_squircle", "Rounded Rect"),
      "shape-capsule": () => addBuiltinShape("capsule", "liquid_cover_shape_capsule", "Capsule"),
      "toggle-focus": () => {
        const win = typeof getWindow === "function"
          ? getWindow("liquidCover")
          : document.querySelector('.window[data-window="liquidCover"]');
        const focused = win?.classList.toggle("is-stage-focused");
        $("lc-stage-expand")?.setAttribute("aria-pressed", focused ? "true" : "false");
      },
      "preview-motion": previewMotionOnce,
      "ai-compose": aiSuggestStyle,
    };
    return commands[command]?.();
  }

  // Cover Glass paints on demand, so the continuing cost is the motion preview
  // loop and the video feeding it — both stop on suspend, matching what the
  // preview already did when its own window was hidden. An export in progress
  // is never interrupted: motionExporting keeps its frames running to the end.
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("liquidCover", {
    onSuspend: () => {
      if (motionExporting) return;
      if (motionPreviewActive) stopMotionPreview(false);
      if (motionVideo) {
        try { motionVideo.pause(); } catch (e) { /* a detached element is fine */ }
      }
    },
    onResume: () => {
      // Deliberately not restarting the preview: a 2–6 second animation the
      // user pressed play on does not silently re-run behind their back.
      if (renderer) renderNow();
    },
    onDispose: () => {
      if (motionPreviewActive) stopMotionPreview(false);
      if (motionVideo) {
        try { motionVideo.pause(); } catch (e) { /* a detached element is fine */ }
      }
      if (renderer) {
        renderer.gl?.getExtension("WEBGL_lose_context")?.loseContext();
        renderer = null;
      }
    },
  });

  window.AISystem6LiquidCover = { open, runMenuCommand, openSavedCover, editEmbed: editCoverEmbed, sendToStage: sendCoverToStage, renderDataUrl: renderCoverDataUrl };
  window.AISystem6CoverGlass = window.AISystem6LiquidCover;
  const LIQUID_COVER_COMMAND_NAMES = [
    "cover-choose-background",
    "cover-choose-video",
    "cover-choose-subject",
    "cover-save",
    "cover-save-as",
    "cover-send-stage",
    "cover-new",
    "cover-add-picture",
    "cover-from-album",
    "cover-remove-background",
    "cover-add-adjust-brightness",
    "cover-add-adjust-hue",
    "cover-add-adjust-blur",
    "cover-distribute-h",
    "cover-distribute-v",
    "cover-export-png",
    "cover-export-video",
    "cover-add-layer",
    "cover-delete-layer",
    "cover-shape-circle",
    "cover-shape-squircle",
    "cover-shape-capsule",
    "cover-toggle-focus",
    "cover-preview-motion",
    "cover-ai-compose",
  ];

  function liquidCoverCommandAvailable(action) {
    if (action === "open-liquid-cover") return true;
    const activeWindow = document.querySelector(".window.is-active");
    if (activeWindow?.dataset.window !== "liquidCover") return false;
    const controlEnabled = (selector) => {
      const control = document.querySelector(selector);
      return !!control && !control.disabled && !control.hidden && !control.classList.contains("is-disabled");
    };
    if (action === "cover-export-video") return controlEnabled("#lc-motion-export");
    if (action === "cover-delete-layer") return controlEnabled("#lc-del-layer");
    if (action === "cover-preview-motion") return controlEnabled("#lc-motion-preview");
    if (action === "cover-remove-background") return controlEnabled("#lc-cutout-go");
    if (action === "cover-distribute-h" || action === "cover-distribute-v") return movableItems().length >= 3;
    return true;
  }

  window.AISystem6Runtime?.registerApplication({
    id: "liquidCover",
    windowName: "liquidCover",
    mount: open,
    restore: open,
    commands: Object.fromEntries(
      ["open-liquid-cover", ...LIQUID_COVER_COMMAND_NAMES].map((action) => {
        const handler = action === "open-liquid-cover"
          ? () => open()
          : () => runMenuCommand(action.slice("cover-".length));
        return [action, {
          handler,
          isAvailable: () => liquidCoverCommandAvailable(action),
        }];
      })
    ),
  });
})();
