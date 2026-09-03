(function initThemeLabFeature() {
  "use strict";

  // The Lab's markup used to sit in index.html: 35,291 bytes of static window
  // that every boot downloaded for a window most sessions never open, while the
  // module and stylesheet were already lazy. It is built here instead, at module
  // eval, BEFORE anything below queries its own elements. Nothing eager refers
  // to these ids -- checked against every module in appModulePaths and against
  // the rest of index.html -- and dom-handles.js never sweeps them.
  // The grow box is not built here; openWindow() calls installGrowBoxes().
  function installThemeLabWindow() {
    if (typeof document === "undefined") return;
    if (document.querySelector('[data-window="themeLab"]')) return;
    window.AISystem6ApplicationShell.createWindow({
      windowName: "themeLab",
      windowClass: "theme-lab-window",
      labelledBy: "theme-lab-title",
      titleKey: "theme_lab",
      title: "Theme Lab",
      statusClass: "compact-status-bar",
      statusHtml: `<span class="status-bar-leading" data-i18n="theme_lab_status">Shared control specimen</span>
          <span class="status-bar-context theme-lab-current-era" aria-live="polite">
            <strong data-theme-lab-appearance>System 6</strong>
            <span aria-hidden="true">·</span>
            <span data-theme-lab-font>Chicago</span>
            <span aria-hidden="true">·</span>
            <span><span data-theme-lab-font-size>12</span> pt</span>
          </span>
          <span class="status-bar-trailing" data-i18n="theme_lab_internal">Internal</span>`,
      paneClass: "theme-lab-pane",
      paneHtml: `
          <!-- The era bar is the spine: the same specimen set, six materials.
               It switches the live appearance in place and keeps the open tab,
               the inspected object, and the scroll position, so flipping eras
               reads as one board changing clothes. -->
          <div class="theme-lab-era-bar">
            <div class="theme-lab-era-switch" role="group" aria-label="Appearance" data-i18n-aria-label="appearance" data-theme-lab-era-switch></div>
            <p class="theme-lab-era-lineage" data-theme-lab-lineage aria-live="polite"></p>
          </div>

          <div class="system-tabs-sheet theme-lab-sheet-shell">
            <div class="system-tabs theme-lab-panel-tabs" role="tablist" aria-label="Theme Lab sections" data-i18n-aria-label="theme_lab_sections">
              <button class="system-tab is-active" id="theme-lab-tab-chrome" type="button" role="tab" aria-selected="true" aria-controls="theme-lab-panel-chrome" data-theme-lab-tab="chrome" data-i18n="theme_lab_tab_chrome">Chrome</button>
              <button class="system-tab" id="theme-lab-tab-objects" type="button" role="tab" aria-selected="false" aria-controls="theme-lab-panel-objects" data-theme-lab-tab="objects" data-i18n="theme_lab_tab_objects">Objects</button>
              <button class="system-tab" id="theme-lab-tab-surfaces" type="button" role="tab" aria-selected="false" aria-controls="theme-lab-panel-surfaces" data-theme-lab-tab="surfaces" data-i18n="theme_lab_tab_surfaces">Surfaces</button>
              <button class="system-tab" id="theme-lab-tab-tokens" type="button" role="tab" aria-selected="false" aria-controls="theme-lab-panel-tokens" data-theme-lab-tab="tokens" data-i18n="theme_lab_tab_tokens">Tokens</button>
            </div>

            <div class="system-tab-panel theme-lab-panel" id="theme-lab-panel-chrome" role="tabpanel" aria-labelledby="theme-lab-tab-chrome" data-theme-lab-panel="chrome">
              <section class="theme-lab-group theme-lab-controls" aria-labelledby="theme-lab-controls-title">
                <h3 id="theme-lab-controls-title" data-i18n="theme_lab_controls">Controls</h3>
                <div class="theme-lab-button-row">
                  <button class="btn" type="button" data-i18n="theme_lab_normal">Normal</button>
                  <button class="btn default" type="button" data-i18n="theme_lab_default">Default</button>
                  <button class="btn is-active" type="button" aria-pressed="true" data-i18n="theme_lab_pressed">Pressed</button>
                  <button class="btn theme-lab-focus-control" type="button" data-i18n="theme_lab_focused">Focused</button>
                  <button class="btn" type="button" disabled data-i18n="theme_lab_disabled">Disabled</button>
                </div>
                <div class="theme-lab-size-row" aria-label="Control size variants">
                  <span data-i18n="theme_lab_sizes">Sizes</span>
                  <button class="btn" type="button" data-i18n="theme_lab_regular">Regular</button>
                  <button class="btn theme-lab-size-small" type="button" data-i18n="theme_lab_small">Small</button>
                  <button class="btn theme-lab-size-mini" type="button" data-i18n="theme_lab_mini">Mini</button>
                </div>
                <div class="theme-lab-choice-matrix" aria-label="Choice control states">
                  <label class="field-row"><input type="checkbox" checked /><span data-i18n="theme_lab_checked">Checked</span></label>
                  <label class="field-row"><input type="checkbox" /><span data-i18n="theme_lab_unchecked">Unchecked</span></label>
                  <label class="field-row"><input type="radio" name="theme-lab-radio" checked /><span data-i18n="theme_lab_selected">Selected</span></label>
                  <label class="field-row"><input type="radio" name="theme-lab-disabled-radio" checked disabled /><span data-i18n="theme_lab_disabled">Disabled</span></label>
                  <label class="field-row theme-lab-era-choice-state"><input class="is-active" type="checkbox" checked /><span data-i18n="theme_lab_pressed">Pressed</span></label>
                  <label class="field-row theme-lab-era-choice-state"><input type="checkbox" checked disabled /><span data-i18n="theme_lab_disabled">Disabled</span></label>
                  <label class="field-row theme-lab-era-choice-state"><input type="radio" name="theme-lab-unselected-radio" /><span data-i18n="theme_lab_unchecked">Unchecked</span></label>
                  <label class="field-row theme-lab-era-choice-state"><input class="is-active" type="radio" name="theme-lab-active-radio" checked /><span data-i18n="theme_lab_pressed">Pressed</span></label>
                </div>
                <div class="theme-lab-form-grid">
                  <label><span data-i18n="theme_lab_text_field">Text field</span><input type="text" value="Macintosh" readonly /></label>
                  <label><span data-i18n="theme_lab_focused_field">Focused field</span><input class="theme-lab-focus-demo" type="text" value="Appearance" readonly /></label>
                  <label><span data-i18n="theme_lab_search">Search</span><input class="theme-lab-search" type="search" value="System" readonly /></label>
                  <label><span data-i18n="theme_lab_popup">Pop-up</span><span class="select-wrap theme-lab-color-popup"><select aria-label="Theme Lab pop-up"><option>Blue</option><option>Graphite</option></select></span></label>
                  <label><span data-i18n="theme_lab_disabled_field">Disabled field</span><input type="text" value="Unavailable" disabled /></label>
                  <label><span data-i18n="theme_lab_disabled_popup">Disabled pop-up</span><span class="select-wrap theme-lab-color-popup"><select aria-label="Disabled Theme Lab pop-up" disabled><option>Blue</option></select></span></label>
                </div>
                <!-- The shipping view switcher, exactly as a Finder window's
                     details bar carries it: two icon-only buttons, is-active on
                     the current view. The replica here had three text-labelled
                     segments, a control this product has never shipped. -->
                <div class="view-controls theme-lab-view-specimen" aria-label="View" data-i18n-aria-label="view_controls">
                  <button class="view-btn is-active" type="button" data-view="icon" aria-label="Icon view" data-i18n-aria-label="view_icon"></button>
                  <button class="view-btn" type="button" data-view="list" aria-label="List view" data-i18n-aria-label="view_list"></button>
                </div>
                <!-- The shipping tablist. Control Panel's section chooser is the
                     same control, and every era already dresses it through
                     --tab-* and --control-chooser-*; the replica that stood here
                     re-derived that wardrobe under its own token family. -->
                <div class="system-tabs-sheet theme-lab-tab-specimen">
                  <div class="system-tabs" role="tablist">
                    <button class="system-tab is-active" type="button" role="tab" aria-selected="true" data-i18n="theme_lab_tab_themes">Themes</button>
                    <button class="system-tab" type="button" role="tab" aria-selected="false" data-i18n="theme_lab_tab_fonts">Fonts</button>
                    <button class="system-tab" type="button" role="tab" aria-selected="false" data-i18n="theme_lab_tab_sound">Sound</button>
                  </div>
                  <div class="system-tab-panel" role="tabpanel"><span data-i18n="appearance">Appearance</span></div>
                </div>
                <!-- The shipping progress meter (rebuild flow, model/import/OCR
                     runs): one part, dressed by --progress-* tokens. Frozen at
                     a fixed fill since a still specimen has no real run. The
                     replica here had its own theme-lab-progress-* wardrobe. -->
                <p class="theme-lab-progress-row"><span data-i18n="theme_lab_progress">Progress</span><span class="progress-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62" aria-label="Progress" data-i18n-aria-label="theme_lab_progress"><span></span></span></p>
              </section>

              <section class="theme-lab-group theme-lab-window-chrome" aria-labelledby="theme-lab-window-chrome-title">
                <h3 id="theme-lab-window-chrome-title" data-i18n="theme_lab_window_chrome">Window chrome</h3>
                  <!-- Two real windows, built by the shell that builds the
                       other seventy-one. Empty here because createTitleBar
                       returns an element; renderWindowChromeSpecimen fills it. -->
                  <div class="theme-lab-window-specimens" data-theme-lab-window-specimens></div>
                  <!-- A framed document window with more lines than it can
                       show. The scroll bars are the product's own: the frame
                       installer finds the scroller and fits real arrows, track
                       and thumb, so the specimen scrolls the way a window
                       scrolls. Filled by buildWindowChromeSpecimens. -->
                  <div class="theme-lab-scroll-specimen" data-theme-lab-scroll-specimen></div>
              </section>
            </div>

            <div class="system-tab-panel theme-lab-panel" id="theme-lab-panel-objects" role="tabpanel" aria-labelledby="theme-lab-tab-objects" data-theme-lab-panel="objects" hidden>
              <!-- One object lab for all six eras, and one way in. The full
                   semantic set is the inventory; the sixteen priority objects
                   are the tiles you can open, and the card below belongs to the
                   one you opened. The era supplies the art source and its own
                   background list; the states, the zoom ladder and the context
                   checks are identical, so two eras compare by flipping. -->
              <section class="theme-lab-group theme-lab-object-lab" data-theme-lab-object-lab aria-labelledby="theme-lab-object-lab-title">
                <h3 id="theme-lab-object-lab-title" data-i18n="theme_lab_objects">Priority objects</h3>
                <p class="theme-lab-object-intro" data-theme-lab-object-intro></p>
                <p class="theme-lab-object-evidence" data-theme-lab-object-evidence></p>
                <div class="theme-lab-object-key" data-theme-lab-object-key></div>
                <div class="theme-lab-icon-grid" data-theme-lab-icon-grid></div>
                <div class="theme-lab-object-grid" data-theme-lab-object-grid></div>
                <div class="theme-lab-object-inspector" data-theme-lab-object-inspector aria-live="polite"></div>
                <div class="theme-lab-object-contexts" data-theme-lab-object-contexts aria-label="Object context checks" data-i18n-aria-label="theme_lab_object_contexts"></div>
              </section>
            </div>

            <div class="system-tab-panel theme-lab-panel" id="theme-lab-panel-surfaces" role="tabpanel" aria-labelledby="theme-lab-tab-surfaces" data-theme-lab-panel="surfaces" hidden>
              <section class="theme-lab-group theme-lab-navigation" aria-labelledby="theme-lab-navigation-title">
                <h3 id="theme-lab-navigation-title"><span class="theme-lab-navigation-generic-label" data-i18n="theme_lab_navigation">Lists &amp; sidebar</span><span class="theme-lab-column-browser-label" data-i18n="theme_lab_column_browser">Column browser</span></h3>
                <div class="theme-lab-split-view theme-lab-generic-browser theme-lab-generic-fixture">
                  <nav class="theme-lab-sidebar" aria-label="Icon list">
                    <button class="is-selected" type="button"><span class="sys-icon" data-system-icon="startupDisk" aria-hidden="true"></span><span data-i18n="startup_disk">Startup Disk</span></button>
                    <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span data-i18n="applications">Applications</span></button>
                    <button type="button"><span class="sys-icon" data-system-icon="trash" aria-hidden="true"></span><span data-i18n="trash">Trash</span></button>
                  </nav>
                  <!-- Finder's own list view (.finder-list / .finder-list-row),
                       posed with fixed rows via window.AISystem6FinderList.create()
                       (project-disk.js) -- the same adoption pattern as the
                       scroll specimen's window.AISystem6WindowFrameBar. The
                       replica here drew its own theme-lab-list-* rows and icon
                       a second time, in every era, and drifted from Finder's. -->
                  <div class="theme-lab-list-frame" data-theme-lab-list-specimen></div>
                </div>
                <div class="theme-lab-snow-source-list" aria-hidden="true" lang="en" translate="no">
                  <h4 class="theme-lab-snow-group" data-i18n="theme_lab_snow_devices">Devices</h4>
                  <button type="button"><span class="sys-icon" data-system-icon="startupDisk" aria-hidden="true"></span><span>Macintosh HD</span></button>
                  <h4 class="theme-lab-snow-group" data-i18n="theme_lab_snow_places">Places</h4>
                  <button type="button"><span class="sys-icon" data-system-icon="folder" aria-hidden="true"></span><span>Desktop</span></button>
                  <button class="is-selected" type="button"><span class="sys-icon" data-system-icon="folder" aria-hidden="true"></span><span>Documents</span></button>
                  <button type="button"><span class="sys-icon" data-system-icon="folder" aria-hidden="true"></span><span>Applications</span></button>
                  <button type="button"><span class="sys-icon" data-system-icon="document" aria-hidden="true"></span><span>Downloads</span></button>
                </div>
                <div class="theme-lab-split-view theme-lab-aqua-browser" aria-label="Aqua column browser" data-theme-lab-reference="guidebook.macosx102.open-dialog" lang="en" translate="no">
                  <div class="theme-lab-browser-column">
                    <nav class="theme-lab-sidebar" aria-label="Column one">
                      <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Desktop</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      <button class="is-selected" type="button" aria-current="true"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Documents</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Library</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Movies</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Music</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Pictures</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Public</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      <button type="button" disabled><span class="sys-icon" data-system-icon="document" aria-hidden="true"></span><span>Send Registration</span></button>
                      <button type="button"><span class="sys-icon" data-system-icon="applications" aria-hidden="true"></span><span>Sites</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                    </nav>
                    <div class="theme-lab-browser-column-scrollbar" aria-hidden="true"><span class="theme-lab-browser-column-thumb is-active"></span><i class="is-decrement"></i><i class="is-increment"></i></div>
                  </div>
                  <div class="theme-lab-browser-column">
                    <div class="theme-lab-list-frame">
                      <div class="theme-lab-list" role="listbox" aria-label="Column two">
                        <button class="is-selected" type="button" role="option" aria-selected="true"><span class="theme-lab-list-icon" aria-hidden="true"></span><span>Acrobat User Data</span><span class="theme-lab-browser-disclosure" aria-hidden="true"></span></button>
                      </div>
                    </div>
                    <div class="theme-lab-browser-column-scrollbar is-inactive" aria-hidden="true"><i class="is-decrement"></i><i class="is-increment"></i></div>
                  </div>
                  <div class="theme-lab-browser-column">
                    <div class="theme-lab-list-frame"><div class="theme-lab-list" role="listbox" aria-label="Column three"></div></div>
                    <div class="theme-lab-browser-column-scrollbar is-inactive" aria-hidden="true"><i class="is-decrement"></i><i class="is-increment"></i></div>
                  </div>
                  <div class="theme-lab-browser-horizontal-scrollbar" aria-hidden="true"></div>
                </div>
                <div class="theme-lab-open-list-capture theme-lab-platinum-fixture"
                     data-theme-lab-reference="guidebook.macos90.open-file">
                  <div class="theme-lab-open-list-items" role="listbox" aria-label="Mac OS 9 Open list" lang="en" translate="no">
                    <button class="is-selected" type="button" role="option" aria-selected="true"><span class="theme-lab-open-list-icon is-dvd-player" aria-hidden="true"></span><span>Apple DVD Player</span></button>
                    <button type="button" role="option"><span class="theme-lab-open-list-icon is-video-player" aria-hidden="true"></span><span>Apple Video Player ƒ</span></button>
                    <button type="button" role="option"><span class="theme-lab-open-list-icon is-audio-player" aria-hidden="true"></span><span>AppleCD Audio Player ƒ</span></button>
                    <button type="button" role="option"><span class="theme-lab-open-list-icon is-quicktime" aria-hidden="true"></span><span>QuickTime</span></button>
                    <button type="button" role="option"><span class="theme-lab-open-list-icon is-security" aria-hidden="true"></span><span>Security</span></button>
                  </div>
                  <div class="theme-lab-open-scrollbar" aria-hidden="true">
                    <div class="theme-lab-open-scroll-track"></div>
                    <span class="theme-lab-open-scroll-button is-decrement"></span>
                    <span class="theme-lab-open-scroll-button is-increment"></span>
                  </div>
                </div>
              </section>

              <section class="theme-lab-group theme-lab-layered" aria-labelledby="theme-lab-layered-title">
                <h3 id="theme-lab-layered-title" data-i18n="theme_lab_layered">Menus &amp; layered surfaces</h3>
                <div class="theme-lab-layer-grid">
                  <!-- The shipping menu. Tracking is not a class in this
                       product: the real menu swaps three item tokens on hover,
                       so the specimen sets the same three on one row. -->
                  <div class="menu-popover theme-lab-menu-specimen" role="menu">
                    <button type="button" role="menuitem">Open… <span>⌘O</span></button>
                    <button type="button" role="menuitem" data-theme-lab-menu-state="tracking">Appearance</button>
                    <hr />
                    <button type="button" role="menuitem" disabled>Duplicate <span>⌘D</span></button>
                    <button type="button" role="menuitem">Close <span>⌘W</span></button>
                  </div>
                  <!-- The shipping balloon. It is the product's one temporary
                       explanatory surface, and each era names it differently:
                       Balloon Help in the classic lineage, a Help Tag from
                       Aqua on. The labels switch; the object does not. -->
                  <div class="balloon-help theme-lab-popover-specimen" role="tooltip"><b class="theme-lab-popover-generic-label" data-i18n="theme_lab_popover">Popover</b><b class="theme-lab-balloon-label" data-i18n="theme_lab_balloon_help">Balloon Help</b><b class="theme-lab-help-tag-label" data-i18n="theme_lab_help_tag">Help Tag</b><span data-i18n="theme_lab_popover_copy">A temporary system surface.</span></div>
                  <div class="theme-lab-menu-capture theme-lab-platinum-fixture"
                       data-theme-lab-reference="guidebook.macos90.apple-menu">
                    <div class="theme-lab-menu--platinum" role="menu" aria-label="Mac OS 9 Apple menu" lang="en" translate="no">
                      <button class="is-about" type="button" role="menuitem"><span>About This Computer</span></button>
                      <hr />
                      <button class="is-profiler" type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-system-profiler" aria-hidden="true"></span><span>Apple System Profiler</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-calculator" aria-hidden="true"></span><span>Calculator</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-chooser" aria-hidden="true"></span><span>Chooser</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-control-panels" aria-hidden="true"></span><span>Control Panels</span><i class="theme-lab-platinum-disclosure" aria-hidden="true"></i></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-favorites" aria-hidden="true"></span><span>Favorites</span><i class="theme-lab-platinum-disclosure" aria-hidden="true"></i></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-key-caps" aria-hidden="true"></span><span>Key Caps</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-network-browser" aria-hidden="true"></span><span>Network Browser</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-recent-applications" aria-hidden="true"></span><span>Recent Applications</span><i class="theme-lab-platinum-disclosure" aria-hidden="true"></i></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-recent-documents" aria-hidden="true"></span><span>Recent Documents</span><i class="theme-lab-platinum-disclosure" aria-hidden="true"></i></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-remote-access" aria-hidden="true"></span><span>Remote Access Status</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-scrapbook" aria-hidden="true"></span><span>Scrapbook</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-sherlock" aria-hidden="true"></span><span>Sherlock 2</span></button>
                      <button type="button" role="menuitem"><span class="theme-lab-platinum-menu-icon is-stickies" aria-hidden="true"></span><span>Stickies</span></button>
                    </div>
                  </div>
                  <!-- The shipping modal: same frame, same layout, same action
                       row as New Project Hard Disk and Erase Disk. The era
                       caution icon sits in the modal's own subject slot, which
                       is where a Finder operation puts the object it acts on. -->
                  <div class="finder-operation-modal theme-lab-dialog-specimen">
                    <div class="finder-operation-layout">
                      <aside class="finder-operation-subject">
                        <span class="theme-lab-alert-icon" aria-hidden="true"></span>
                        <b data-i18n="appearance">Appearance</b>
                      </aside>
                      <section class="finder-operation-body">
                        <h2 data-i18n="theme_lab_dialog">Dialog</h2>
                        <p class="finder-operation-lede" data-i18n="theme_lab_dialog_copy">Keep this appearance?</p>
                      </section>
                    </div>
                    <div class="button-row finder-operation-actions">
                      <button class="btn theme-lab-dialog-cancel" type="button" data-i18n="cancel">Cancel</button>
                      <button class="btn default" type="button" data-i18n="ok">OK</button>
                    </div>
                  </div>
                  <div class="theme-lab-about-capture theme-lab-platinum-fixture"
                       data-theme-lab-reference="guidebook.macos90.about-application">
                    <div class="theme-lab-dialog--platinum-about" role="dialog" aria-label="About Calculator" lang="en" translate="no">
                      <span class="theme-lab-calculator-icon" aria-hidden="true"></span>
                      <strong>Calculator</strong>
                      <button class="btn default" type="button">OK</button>
                    </div>
                  </div>
                  <div class="window theme-lab-sheet-specimen is-active" data-theme-lab-specimen="sheet-owner" data-theme-lab-reference="macosx102.finder-replace-sheet">
                    <div data-theme-lab-owner-titlebar></div>
                    <div class="theme-lab-sheet-owner-body" aria-hidden="true"></div>
                    <div class="theme-lab-sheet" role="dialog" aria-label="Attached sheet">
                      <span class="theme-lab-sheet-icon" aria-hidden="true"></span>
                      <div class="theme-lab-sheet-copy"><b class="theme-lab-sheet-generic-copy" data-i18n="theme_lab_sheet">Sheet</b><span class="theme-lab-sheet-generic-copy" data-i18n="theme_lab_sheet_copy">Attached to its owning window.</span><b class="theme-lab-sheet-aqua-copy" lang="en" translate="no">Preparing move to “Documents”</b><span class="theme-lab-sheet-aqua-copy" lang="en" translate="no">A file with the same name already exists.</span></div>
                      <div class="theme-lab-sheet-actions"><button class="btn theme-lab-sheet-generic-action" type="button" data-i18n="cancel">Cancel</button><button class="btn default theme-lab-sheet-generic-action" type="button" data-i18n="ok">OK</button><button class="btn theme-lab-sheet-aqua-action" type="button" lang="en" translate="no">Stop</button><button class="btn default theme-lab-sheet-aqua-action" type="button" lang="en" translate="no">Replace</button></div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="theme-lab-group theme-lab-finder" aria-labelledby="theme-lab-finder-title">
                <h3 id="theme-lab-finder-title" data-i18n="theme_lab_finder">Finder surface</h3>
                <!-- A window from the 10.2 capture, wearing the product's own
                     title bar. The fixture reproduces the era's Finder body; its
                     chrome is the System window's, so Close stays at the leading
                     edge and Zoom at the trailing one in every era. -->
                <div class="window theme-lab-finder-window is-active" data-theme-lab-specimen="finder-window" data-theme-lab-reference="guidebook.macosx102.finder">
                  <div data-theme-lab-finder-titlebar></div>
                  <div class="theme-lab-toolbar">
                    <button class="btn theme-lab-toolbar-back" type="button" data-i18n="theme_lab_back">Back</button>
                    <span class="theme-lab-separator" aria-hidden="true"></span>
                    <strong class="theme-lab-toolbar-location">Macintosh HD</strong>
                    <span class="theme-lab-toolbar-status" data-i18n="theme_lab_finder_status">10 items, 59.1 MB available</span>
                    <div class="theme-lab-toolbar-icon-strip" aria-label="Finder toolbar controls">
                      <button class="theme-lab-toolbar-icon-button" type="button"><span class="theme-lab-toolbar-round-icon is-back" aria-hidden="true"></span><small data-i18n="theme_lab_back">Back</small></button>
                      <button class="theme-lab-toolbar-icon-button" type="button"><span class="theme-lab-toolbar-round-icon is-forward" aria-hidden="true"></span><small>Forward</small></button>
                      <div class="theme-lab-toolbar-view-control"><span class="theme-lab-toolbar-view-buttons" aria-hidden="true"><i class="theme-lab-view-icon is-icon"></i><i class="theme-lab-view-icon is-list"></i><i class="theme-lab-view-icon is-columns"></i></span><small>View</small></div>
                      <span class="theme-lab-toolbar-era-separator" aria-hidden="true"></span>
                      <button class="theme-lab-toolbar-icon-button" type="button"><span class="theme-lab-toolbar-role-icon is-computer" aria-hidden="true"></span><small>Computer</small></button>
                      <button class="theme-lab-toolbar-icon-button" type="button"><span class="theme-lab-toolbar-role-icon is-home" aria-hidden="true"></span><small>Home</small></button>
                      <button class="theme-lab-toolbar-icon-button" type="button"><span class="theme-lab-toolbar-role-icon is-favorites" aria-hidden="true"></span><small>Favorites</small></button>
                      <button class="theme-lab-toolbar-icon-button" type="button"><span class="theme-lab-toolbar-role-icon is-applications" aria-hidden="true"></span><small>Applications</small></button>
                    </div>
                    <label class="theme-lab-toolbar-search"><input type="search" value="" placeholder="Search" aria-label="Finder search" /><small>Search</small></label>
                  </div>
                  <div class="theme-lab-snow-toolbar" aria-hidden="true" lang="en" translate="no">
                    <strong class="theme-lab-snow-title">Macintosh HD</strong>
                    <div class="theme-lab-snow-nav">
                      <button class="theme-lab-snow-droplet is-back" type="button" aria-label="Back"></button>
                      <button class="theme-lab-snow-droplet is-forward" type="button" aria-label="Forward"></button>
                    </div>
                    <div class="theme-lab-snow-view-controls" role="group" aria-label="View controls">
                      <button class="is-selected" type="button" aria-label="Icon view"><span class="theme-lab-view-icon is-icon" aria-hidden="true"></span></button>
                      <button type="button" aria-label="List view"><span class="theme-lab-view-icon is-list" aria-hidden="true"></span></button>
                      <button type="button" aria-label="Column view"><span class="theme-lab-view-icon is-columns" aria-hidden="true"></span></button>
                      <button type="button" aria-label="Cover Flow view"><span class="theme-lab-view-icon is-cover" aria-hidden="true"></span></button>
                    </div>
                    <button class="theme-lab-snow-action" type="button" aria-label="Action menu"></button>
                    <label class="theme-lab-snow-search"><input type="search" placeholder="Search" aria-label="Finder search" /></label>
                  </div>
                  <div class="theme-lab-finder-status-strip" aria-hidden="true" lang="en" translate="no"><span>2 items</span></div>
                  <div class="theme-lab-finder-surface">
                    <button class="finder-item is-selected" type="button"><span class="sys-icon sys-icon-desktop" data-system-icon="startupDisk" aria-hidden="true"></span><span>Macintosh HD</span></button>
                    <button class="finder-item" type="button"><span class="sys-icon sys-icon-desktop" data-system-icon="folder" aria-hidden="true"></span><span>System Folder</span></button>
                    <button class="finder-item theme-lab-finder-era-extra" type="button"><span class="sys-icon sys-icon-desktop" data-system-icon="folder" aria-hidden="true"></span><span>Applications</span></button>
                    <button class="finder-item theme-lab-finder-era-extra" type="button"><span class="sys-icon sys-icon-desktop" data-system-icon="folder" aria-hidden="true"></span><span>Documents</span></button>
                    <button class="finder-item theme-lab-finder-era-extra" type="button"><span class="sys-icon sys-icon-desktop" data-system-icon="folder" aria-hidden="true"></span><span>Utilities</span></button>
                    <button class="finder-item theme-lab-finder-era-extra" type="button"><span class="sys-icon sys-icon-desktop" data-system-icon="document" aria-hidden="true"></span><span>Read Me</span></button>
                    <div class="theme-lab-finder-rows">
                      <div class="is-selected"><span class="sys-icon" data-system-icon="finderApp" aria-hidden="true"></span><span>Finder</span><small>Application</small></div>
                      <div><span class="sys-icon" data-system-icon="document" aria-hidden="true"></span><span>Read Me</span><small>Document</small></div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div class="system-tab-panel theme-lab-panel" id="theme-lab-panel-tokens" role="tabpanel" aria-labelledby="theme-lab-tab-tokens" data-theme-lab-panel="tokens" hidden>
              <!-- The authoring surface. Rows come from the live CSSOM, not a
                   copied list, so the delta shown is the delta that ships. An
                   edit sets the custom property on <body>, which repaints the
                   whole desktop, and the result leaves as pasteable CSS; the
                   Lab never writes a stylesheet or persists an experiment. -->
              
            </div>
          </div>`,
    });
  }

  installThemeLabWindow();

  // Internal Appearance workbench. Three jobs, in this order:
  //   1. show one specimen set in whichever era is on screen,
  //   2. say what that era overrides and what it inherits,
  //   3. hand back an exact pasteable CSS delta and show the shared shell that
  //      lets a new app inherit every mature Appearance automatically.
  //
  // Everything era-specific is data in this file. There is one object lab, one
  // context list, and one token table; an era supplies art tiers, appearance
  // variants, and the stylesheet that owns its delta. When two eras look
  // different here it is because their tokens differ, never because the lab
  // drew them a different board.

  // The sixteen priority objects, in the order the icon lineage audit reviews
  // them. tooling/build-icon-lineage-audit.mjs holds the same list for the
  // offline boards; keep the two in step.
  const OBJECTS = Object.freeze([
    ["finderApp", "Finder / System"], ["multiFinderApp", "MultiFinder"],
    ["folder", "Folder"], ["hardDisk", "Hard Disk"],
    ["trash", "Trash"], ["document", "Generic Document"],
    ["fileFloppy", "Floppy Disk"], ["projectDisk", "Project Disk"],
    ["projectDisc", "Project CD"], ["searcher", "Searcher"],
    ["teachText", "TeachText"], ["scrapbook", "Scrapbook"],
    ["assistant", "ClioTalk"], ["controlPanel", "Control / Settings"],
    ["reviewDesk", "Review Desk"], ["docMap", "DocMap"],
  ]);
  const OBJECT_IDS = new Set(OBJECTS.map(([id]) => id));
  const OBJECT_LABELS = Object.fromEntries(OBJECTS);

  // Provenance from ICON-LINEAGE-AUDIT.md → "Provenance classes". A is a
  // native prototype reconstruction, B a period analog adaptation, C an
  // original period-plausible design. Three objects change class along the
  // lineage; an object entry may therefore be a per-era map with a fallback.
  const PROVENANCE = Object.freeze({
    finderApp: "A", multiFinderApp: "C", folder: "A", hardDisk: "A",
    trash: "A", document: "A", fileFloppy: "B", projectDisk: "B",
    projectDisc: "B", searcher: "B", teachText: "B",
    scrapbook: Object.freeze({ classic: "A", fallback: "B" }),
    assistant: Object.freeze({ classic: "C", fallback: "B" }),
    controlPanel: "A",
    reviewDesk: Object.freeze({ platinum: "C", fallback: "B" }),
    docMap: "C",
  });

  // Appearance authoring data belongs to the boot-safe registry, and the icon
  // vocabulary belongs to the painter. Theme Lab reads both; it never keeps a
  // private list that can silently drift from what the desktop ships.
  const authoringOf = (theme) => theme?.authoring || window.AISystem6Theme?.getAuthoringMetadata?.(theme?.id);
  const appearanceIconIds = () => window.AISystem6SystemIcons?.ids || [];

  const PANELS = Object.freeze(["chrome", "objects", "surfaces", "tokens"]);
  const TOKEN_ROW_LIMIT = 240;
  // A group needs this many tokens to earn its own entry in the chooser;
  // everything below it collects under "Other" so the list stays readable.
  const TOKEN_GROUP_FLOOR = 6;

  let activePanel = "chrome";
  let inspectedObjectId = OBJECTS[0][0];
  // Tokens the user is trying out this session, name -> value. They live on
  // body's inline style and never reach storage or a stylesheet.
  const draftTokens = new Map();
  let tokenIndex = null;
  let lastRenderedThemeId = null;
  let sessionOpen = false;
  // Until the user picks a scope, the Lab picks the one that has rows: an era
  // with a delta opens on its delta, and System 6 — which is the baseline and
  // overrides nothing — opens on the whole table instead of on an empty box.
  let tokenScopeChosen = false;

  const lab = () => document.querySelector('[data-window="themeLab"]');
  const currentTheme = () => window.AISystem6Theme?.getTheme?.();

  function provenanceOf(id, themeId) {
    const entry = PROVENANCE[id];
    if (!entry) return "C";
    if (typeof entry === "string") return entry;
    return entry[themeId] || entry.fallback;
  }

  function artOf(themeId) {
    const theme = window.AISystem6Theme?.getTheme?.(themeId);
    return authoringOf(theme)?.art || authoringOf(window.AISystem6Theme?.getTheme?.("classic"))?.art;
  }

  // One source-file path for one authored tier. `art.variant` is the appearance
  // suffix; only Liquid Glass has one.
  function stampedAssetPath(path) {
    const build = window.AISystem6Config?.getAppBuildInfo?.().build;
    return build ? `${path}?v=${encodeURIComponent(build)}` : path;
  }

  function assetPath(art, id, tier, appearance) {
    const suffix = art.variant ? `-${appearance || "default"}` : "";
    return stampedAssetPath(`assets/themes/${art.dir}/icons/${id}-${tier}${suffix}.${art.ext}`);
  }

  // The state grid paints through the real runtime painter, so what the lab
  // shows is what the desktop ships. Only the inspector reaches for a file.
  // The display size arrives as a class from a fixed set, so no cell needs an
  // inline style and the stylesheet keeps every measurement.
  //
  // Every source size is named on purpose, which overrides the shared painter's
  // device-ratio rule. That is the specimen contract, not an oversight: a state
  // cell shows the authored tier it is labelled with, and Retina doubles those
  // exact pixels rather than substituting a larger tier
  // (theme-lab-icon-sharpness). The cell box must equal the tier for that to
  // read; where it does not, the cell resamples a source it never asked for.
  function runtimeIcon(id, tier, displaySize) {
    return renderSystemIcon(id, {
      size: "object-lab",
      className: `theme-lab-object-px-${displaySize}`,
      sourceSize: tier <= 16 ? 16 : 32,
      platinumSourceSize: tier <= 16 ? 16 : tier >= 42 ? 42 : 32,
      modernSourceSize: tier <= 16 ? 16 : tier <= 32 ? 32 : tier <= 64 ? 64 : 128,
      displaySize,
    });
  }

  function objectItem(id, label, { tier = 32, display = tier, selected = false, className = "" } = {}) {
    const classes = ["finder-item", "theme-lab-object-item"];
    if (selected) classes.push("is-selected");
    if (className) classes.push(className);
    return `<button type="button" class="${classes.join(" ")}" tabindex="-1">${runtimeIcon(id, tier, display)}<span>${escapeHtml(label)}</span></button>`;
  }

  // The window chrome specimen is a pair of real windows.
  //
  // It used to be a hand-drawn `.theme-lab-mini-window` carrying three lamps in
  // a row, including a Minimize this product has never had -- the System window
  // puts Close at the leading edge and Zoom and WindowShade at the trailing
  // one, and the traffic-light eras keep that split on purpose
  // (window-frame.test.mjs holds each era to it). Fifty-six --theme-lab-mini-*
  // tokens existed only to re-derive, era by era, what `.window` and
  // `.title-bar` already paint.
  //
  // A specimen is not a managed window: no data-window, so getWindow cannot
  // return it, the chrome wiring is never handed it, and its controls stay
  // inert while still painting their real hover, focus and active states. The
  // Lab supplies position and size and nothing else; material belongs to the
  // era.
  function windowChromeSpecimen(state, titleKey, fallbackTitle) {
    const shell = window.AISystem6ApplicationShell;
    const specimen = document.createElement("div");
    specimen.className = state === "active" ? "window is-active" : "window";
    specimen.dataset.themeLabSpecimen = `window-${state}`;
    specimen.append(shell.createTitleBar({ titleKey, title: fallbackTitle }));
    const pane = document.createElement("div");
    pane.className = "window-pane";
    specimen.append(pane);
    return specimen;
  }

  // A framed document window showing the era's own scroll bar: the arrows,
  // dithered track and thumb come from the window frame's own builder, so an
  // era dresses them exactly once, in the rules real windows already use. The
  // replica this replaces had its own track, thumb and arrow classes, and every
  // era had to paint that second set.
  //
  // The bar is placed, not driven. A specimen cannot host the live scroller --
  // a window finds its scroller by descendant query, so a nested one is adopted
  // by the window the Lab lives in. The thumb reports a fixed position instead,
  // which is what a still specimen should show.
  function scrollSpecimen() {
    const specimen = document.createElement("div");
    specimen.className = "window is-active";
    specimen.dataset.themeLabSpecimen = "scroller";
    const pane = document.createElement("div");
    pane.className = "window-pane";
    for (const entry of window.AISystem6Theme?.themes || []) {
      const line = document.createElement("p");
      line.textContent = entry.label;
      pane.append(line);
    }
    specimen.append(pane);
    const frameBar = window.AISystem6WindowFrameBar?.create("vertical");
    if (frameBar) {
      // Posed, since a still specimen has no scroll position: a little over
      // two thirds of the track, near the top, which is what a window showing
      // most of a short document looks like.
      frameBar.thumb.style.setProperty("--frame-thumb-size", "70%");
      frameBar.thumb.style.setProperty("--frame-thumb-position", "6px");
      specimen.append(frameBar.bar);
    }
    return specimen;
  }

  // Fixed rows, not a real folder -- a still specimen has no project to list,
  // so it poses the same three kinds a Finder window's list view already
  // shows (a folder, a draft, a reference).
  function buildFinderListSpecimen(win) {
    const host = win.querySelector("[data-theme-lab-list-specimen]");
    if (!host || host.childElementCount) return;
    const list = window.AISystem6FinderList?.create([
      { iconId: "folder", name: "Section Drafts", kind: "Folder", meta: "3 items", selected: false },
      { iconId: "document", name: "Opening beat", kind: "Draft", meta: "412 words", selected: true },
      { iconId: "documents", name: "Interview notes", kind: "Reference", meta: "1.2 KB", selected: false },
    ]);
    if (list) host.append(list);
  }

  function buildWindowChromeSpecimens(win) {
    const host = win.querySelector("[data-theme-lab-window-specimens]");
    if (host && !host.childElementCount) {
      host.append(
        windowChromeSpecimen("active", "theme_lab_active_window", "Active Window"),
        windowChromeSpecimen("inactive", "theme_lab_inactive_window", "Inactive Window"),
      );
      // Built after the boot language sweep, exactly like a lazy window's markup.
      window.AISystem6TranslateWithin?.(host);
    }
    const scrollHost = win.querySelector("[data-theme-lab-scroll-specimen]");
    if (scrollHost && !scrollHost.childElementCount) scrollHost.append(scrollSpecimen());

    // The two historical fixtures that own a window: the 10.2 Finder capture and
    // the window a sheet hangs from. The body each reproduces is the era's; the
    // chrome is the product's, so neither draws a title bar of its own any more.
    const shell = window.AISystem6ApplicationShell;
    for (const [selector, title, key] of [
      ["[data-theme-lab-finder-titlebar]", "Jim McKintie's Computer", null],
      ["[data-theme-lab-owner-titlebar]", "Appearance", "appearance"],
    ]) {
      const host = win.querySelector(selector);
      if (!host || host.childElementCount) continue;
      const bar = shell.createTitleBar(key ? { title, titleKey: key } : { title });
      if (!key) {
        const heading = bar.querySelector("h2");
        heading.lang = "en";
        heading.translate = false;
      }
      host.replaceWith(bar);
    }
    // Every fixture that reproduces a pinned native capture says so on the
    // board. These are not replicas of product components -- three lamps in a
    // row is true of the window they reproduce -- and a reader who cannot tell
    // them from the specimens beside them will read one as the other.
    for (const fixture of win.querySelectorAll("[data-theme-lab-reference]")) {
      if (fixture.previousElementSibling?.classList.contains("theme-lab-fixture-note")) continue;
      const note = document.createElement("p");
      note.className = "theme-lab-fixture-note";
      note.dataset.i18n = "theme_lab_fixture_note";
      note.textContent = "Historical reference fixture — reproduces a pinned capture, not a product component.";
      const source = document.createElement("code");
      source.textContent = fixture.dataset.themeLabReference;
      note.append(" ", source);
      fixture.before(note);
    }

    window.AISystem6TranslateWithin?.(win);
  }

  const contextBox = (title, body, cls = "") =>
    `<section class="theme-lab-object-context${cls}"><h4>${escapeHtml(title)}</h4><div>${body}</div></section>`;

  // --------------------------------------------------------------- timeline --

  // The six appearances are a chronology, so the switch is an axis rather than
  // six equal buttons: ticks sit at their true distance in years, which is what
  // makes dragging read as travel instead of as picking from a list. The same
  // geometry the public page uses (site/js/dissolve.js), on the same years.
  //
  // This rail is the lab's own chrome, not a specimen. It makes no historical
  // claim, which is why it may use a native range: that keeps the keyboard and
  // screen-reader behaviour real instead of reinvented.
  const eraStops = () => {
    const themes = window.AISystem6Theme?.themes || [];
    const years = themes.map((entry) => entry.year);
    const first = Math.min(...years);
    const last = Math.max(...years);
    const span = last - first || 1;
    return themes.map((entry) => ({ theme: entry, t: (entry.year - first) / span }));
  };

  function nearestStop(position) {
    const stops = eraStops();
    return stops.reduce((closest, stop) =>
      Math.abs(stop.t - position) < Math.abs(closest.t - position) ? stop : closest, stops[0]);
  }

  function renderEraTimeline(theme) {
    const host = lab()?.querySelector("[data-theme-lab-era-switch]");
    if (!host) return;
    const stops = eraStops();
    const active = stops.find((stop) => stop.theme.id === theme.id) || stops[0];
    if (host.dataset.built !== "true") {
      host.dataset.built = "true";
      host.innerHTML = `
        <input class="theme-lab-era-range" type="range" min="0" max="1000" step="1"
          data-theme-lab-era-range aria-label="${escapeHtml(t("theme_lab_timeline"))}" />
        <div class="theme-lab-era-ticks">${stops.map((stop) => `
          <button class="theme-lab-era-tick" type="button" data-theme-lab-era="${escapeHtml(stop.theme.id)}"
            style="--theme-lab-era-t: ${stop.t}"><i aria-hidden="true"></i><span>${stop.theme.year}</span></button>`).join("")}</div>`;
    }
    const range = host.querySelector("[data-theme-lab-era-range]");
    if (range && document.activeElement !== range) range.value = String(Math.round(active.t * 1000));
    if (range) {
      range.style.setProperty("--theme-lab-era-t", String(active.t));
      range.setAttribute("aria-valuetext", t("theme_lab_timeline_value", active.theme.year, t(active.theme.labelKey)));
    }
    for (const tick of host.querySelectorAll("[data-theme-lab-era]")) {
      const current = tick.dataset.themeLabEra === theme.id;
      tick.classList.toggle("is-active", current);
      tick.setAttribute("aria-current", String(current));
    }
  }

  // The readout is composed here rather than inside a translation string, so
  // the tables stay plain text and every value is escaped on the way in.
  function renderLineage(theme) {
    const target = lab()?.querySelector("[data-theme-lab-lineage]");
    if (!target) return;
    const chain = window.AISystem6Theme?.getRecipeChain?.(theme.id) || [theme];
    const path = chain.map((entry) => t(entry.labelKey)).join(" → ");
    const art = artOf(theme.id);
    target.innerHTML = [
      `<b>${escapeHtml(String(theme.year))}</b>`,
      `<em>${escapeHtml(t(theme.labelKey))}</em>`,
      `<span>${escapeHtml(t("theme_lab_set_in", theme.systemFont, theme.systemFontSize))}</span>`,
      `<span>${escapeHtml(t("theme_lab_lineage", path, art.tiers.join(" / "), art.appearances.length))}</span>`,
    ].join("");
  }

  // Theme Lab is an authoring preview, not another Appearance preference. Both
  // tick jumps and slider travel repaint the whole semantic desktop through the
  // application boundary, but the committed theme remains owned by Control
  // Panel / Special. Closing the Lab restores that committed theme.
  function travelTo(themeId) {
    if (window.AISystem6Theme?.getCurrentTheme?.() === themeId) return;
    applyTheme(themeId, {
      experimental: true,
      commit: false,
      persist: false,
      saveDesk: false,
      syncUi: false,
      source: "theme-lab",
    });
  }

  // ------------------------------------------------------------------ tabs --

  function showPanel(name) {
    const win = lab();
    if (!win || !PANELS.includes(name)) return;
    activePanel = name;
    for (const tab of win.querySelectorAll("[data-theme-lab-tab]")) {
      const active = tab.dataset.themeLabTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    for (const panel of win.querySelectorAll("[data-theme-lab-panel]")) {
      panel.hidden = panel.dataset.themeLabPanel !== name;
    }
    render(currentTheme());
  }

  // ------------------------------------------------------------ object lab --

  function renderObjectLab(theme) {
    const section = lab()?.querySelector("[data-theme-lab-object-lab]");
    if (!section) return;
    const art = artOf(theme.id);
    const themeId = theme.id;

    const intro = section.querySelector("[data-theme-lab-object-intro]");
    if (intro) intro.textContent = t("theme_lab_object_intro", t(theme.labelKey), art.ordinary, art.compact, art.large);

    // Provenance differs by era and must not be flattened into a shared
    // sentence: each era states what its family is, which files are direct
    // optical assets, and what is still undrawn. Same slot, era-owned words.
    const evidence = section.querySelector("[data-theme-lab-object-evidence]");
    if (evidence) evidence.textContent = t(`theme_lab_evidence_${themeId.replace(/-/g, "_")}`);

    const counts = { A: 0, B: 0, C: 0 };
    for (const [id] of OBJECTS) counts[provenanceOf(id, themeId)] += 1;
    const key = section.querySelector("[data-theme-lab-object-key]");
    if (key) {
      key.innerHTML = [
        t("theme_lab_object_count", OBJECTS.length),
        t("theme_lab_object_tiers", art.tiers.join(" / ")),
        t("theme_lab_object_provenance", counts.A, counts.B, counts.C),
      ].map((line) => `<span>${escapeHtml(line)}</span>`).join("");
    }

    // One object at a time. The board used to draw sixteen cards of four states
    // each above a sixty-two icon inventory that already contained all sixteen:
    // 1,720px of scrolling to reach one object, and every icon painted twice.
    // The inventory is the way in now, and the card belongs to what it selected.
    // Capture is the exception -- the fidelity boards sample named objects, so
    // the whole set has to be in the DOM for them.
    const grid = section.querySelector("[data-theme-lab-object-grid]");
    if (grid) {
      const captureAll = lab()?.dataset.themeLabCapture === "all";
      const shown = captureAll ? OBJECTS : OBJECTS.filter(([id]) => id === inspectedObjectId);
      grid.innerHTML = shown.map(([id, label]) => {
        const cls = provenanceOf(id, themeId);
        const inspected = id === inspectedObjectId;
        return `<article class="theme-lab-object-card${inspected ? " is-inspected" : ""}" data-theme-lab-object="${escapeHtml(id)}">
          <button class="theme-lab-object-inspect" type="button" data-theme-lab-inspect="${escapeHtml(id)}" aria-pressed="${inspected}"><strong>${escapeHtml(label)}</strong><code>${escapeHtml(id)}</code></button>
          <span class="theme-lab-object-class is-class-${cls.toLowerCase()}" title="${escapeHtml(t(`theme_lab_provenance_${cls.toLowerCase()}`))}">${escapeHtml(t("theme_lab_provenance_short", cls))}</span>
          <div class="theme-lab-object-states">
            ${objectItem(id, t("theme_lab_state_normal", art.ordinary), { tier: art.ordinary })}
            ${objectItem(id, t("theme_lab_state_selected", art.ordinary), { tier: art.ordinary, selected: true })}
            ${objectItem(id, t("theme_lab_state_normal", art.compact), { tier: art.compact })}
            ${objectItem(id, t("theme_lab_state_selected", art.compact), { tier: art.compact, selected: true })}
          </div>
        </article>`;
      }).join("");
    }

    renderInspector(theme);
    renderObjectContexts(theme);
  }

  function renderInspector(theme) {
    const inspector = lab()?.querySelector("[data-theme-lab-object-inspector]");
    if (!inspector) return;
    const art = artOf(theme.id);
    const id = OBJECT_IDS.has(inspectedObjectId) ? inspectedObjectId : OBJECTS[0][0];
    const cls = provenanceOf(id, theme.id);
    const rows = art.appearances.map((appearance) => {
      const figures = art.zoom.map(([tier, display]) => `<figure>
        <img class="${art.ext === "png" ? "is-raster" : "is-vector"}" src="${escapeHtml(assetPath(art, id, tier, appearance))}" width="${display}" height="${display}" alt="" data-native-size="${tier}" />
        <figcaption>${escapeHtml(t("theme_lab_zoom_caption", tier, Math.round((display / tier) * 100)))}</figcaption>
      </figure>`).join("");
      const name = art.appearances.length > 1
        ? `<h5>${escapeHtml(t(`theme_lab_appearance_${appearance}`))}</h5>`
        : "";
      return `<div class="theme-lab-object-appearance is-${escapeHtml(appearance)}">${name}<div class="theme-lab-object-zooms">${figures}</div></div>`;
    }).join("");
    inspector.innerHTML = `<h4>${escapeHtml(OBJECT_LABELS[id])}<code>${escapeHtml(id)}</code><small>${escapeHtml(t(`theme_lab_provenance_${cls.toLowerCase()}`))}</small></h4><div class="theme-lab-object-appearances">${rows}</div>`;
  }

  // Five checks, the same five in every era. An era answers them with its own
  // tiers and its own surfaces, so no era is asked to prove a context it never
  // had and none is quietly skipped either.
  function renderObjectContexts(theme) {
    const host = lab()?.querySelector("[data-theme-lab-object-contexts]");
    if (!host) return;
    const art = artOf(theme.id);
    const large = Math.min(art.large, 72);
    host.innerHTML = [
      contextBox(t("theme_lab_context_desktop", art.ordinary),
        `${objectItem("hardDisk", OBJECT_LABELS.hardDisk, { tier: art.ordinary })}${objectItem("projectDisk", OBJECT_LABELS.projectDisk, { tier: art.ordinary, selected: true })}${objectItem("trash", OBJECT_LABELS.trash, { tier: art.ordinary })}`,
        " is-desktop"),
      contextBox(t("theme_lab_context_icon_view", art.ordinary),
        `${objectItem("folder", OBJECT_LABELS.folder, { tier: art.ordinary })}${objectItem("teachText", OBJECT_LABELS.teachText, { tier: art.ordinary, selected: true })}${objectItem("scrapbook", OBJECT_LABELS.scrapbook, { tier: art.ordinary })}${objectItem("assistant", OBJECT_LABELS.assistant, { tier: art.ordinary })}`),
      contextBox(t("theme_lab_context_list_view", art.compact),
        `${objectItem("document", OBJECT_LABELS.document, { tier: art.compact, className: "is-list-row" })}${objectItem("searcher", OBJECT_LABELS.searcher, { tier: art.compact, selected: true, className: "is-list-row" })}${objectItem("docMap", OBJECT_LABELS.docMap, { tier: art.compact, className: "is-list-row" })}${objectItem("fileFloppy", OBJECT_LABELS.fileFloppy, { tier: art.compact, className: "is-list-row" })}`,
        " is-list-view"),
      contextBox(t("theme_lab_context_large", art.large),
        `${objectItem("finderApp", OBJECT_LABELS.finderApp, { tier: art.large, display: large })}${objectItem("multiFinderApp", OBJECT_LABELS.multiFinderApp, { tier: art.large, display: large })}${objectItem("reviewDesk", OBJECT_LABELS.reviewDesk, { tier: art.large, display: large })}${objectItem("controlPanel", OBJECT_LABELS.controlPanel, { tier: art.large, display: large })}`),
      // The surfaces an era actually has, asked of the same four objects:
      // its desktop, its paper, its chrome. No era is asked to prove a
      // background it never shipped, and none is quietly skipped.
      contextBox(t("theme_lab_context_surfaces"),
        ["is-on-desktop", "is-on-paper", "is-on-chrome"].map((surface) =>
          `<div class="theme-lab-object-surface ${surface}">${["folder", "document", "projectDisc", "controlPanel"]
            .map((id) => objectItem(id, OBJECT_LABELS[id], { tier: art.ordinary })).join("")}</div>`).join(""),
        " is-surface-check"),
    ].join("");
  }

  // ------------------------------------------------------------- icon set --

  // Historical eras attach their own authored 16 px file in the tile corner, so
  // the overview shows the runtime painter and its compact source together.
  function compactHintSource(themeId, id) {
    const stem = (themeId === "platinum" || themeId === "yosemite") && id === "startupDisk" ? "startup-disk"
      : (themeId === "platinum" || themeId === "yosemite") && id === "finderApp" ? "finder-app"
        : themeId === "platinum" && id === "fileFloppy" ? "floppy" : id;
    if (themeId === "classic") return stampedAssetPath(`assets/themes/classic/icons/${stem}-16.svg`);
    if (themeId === "platinum") return stampedAssetPath(`assets/themes/platinum/icons/${id}-16.png`);
    if (themeId === "liquid-glass") return stampedAssetPath(`assets/themes/liquid-glass/icons/${id}-16-default.png`);
    return stampedAssetPath(`assets/themes/${themeId}/icons/${id}-16.png`);
  }

  // The workbench markup is Theme Lab's alone and the window is lazy, so it is
  // built here rather than parked in index.html at boot. Everything the
  // fidelity manifests crop stays in index.html; nothing below is a specimen.
  function buildTokenPanel(win) {
    const panel = win.querySelector('[data-theme-lab-panel="tokens"]');
    if (!panel || panel.querySelector("[data-theme-lab-token-table]")) return;
    const field = (labelKey, control) =>
      `<label><span>${escapeHtml(t(labelKey))}</span>${control}</label>`;
    panel.insertAdjacentHTML("beforeend", `
      <section class="theme-lab-group theme-lab-token-desk" aria-labelledby="theme-lab-token-desk-title">
        <h3 id="theme-lab-token-desk-title">${escapeHtml(t("theme_lab_tokens"))}</h3>
        <p class="theme-lab-token-summary" data-theme-lab-token-summary aria-live="polite"></p>
        <!-- What a seventh appearance would still owe. Derived from which
             tokens any era sets, so it is a worklist that maintains itself. -->
        <div class="theme-lab-token-coverage" data-theme-lab-token-coverage aria-live="polite"></div>
        <div class="theme-lab-token-filters">
          ${field("theme_lab_token_group", `<span class="select-wrap"><select data-theme-lab-token-group aria-label="${escapeHtml(t("theme_lab_token_group"))}"></select></span>`)}
          ${field("theme_lab_token_scope", `<span class="select-wrap"><select data-theme-lab-token-scope aria-label="${escapeHtml(t("theme_lab_token_scope"))}">
            <option value="overridden">${escapeHtml(t("theme_lab_token_scope_overridden"))}</option>
            <option value="inherited">${escapeHtml(t("theme_lab_token_scope_inherited"))}</option>
            <option value="all">${escapeHtml(t("theme_lab_token_scope_all"))}</option>
          </select></span>`)}
          ${field("theme_lab_token_search", `<input class="theme-lab-token-search" type="search" data-theme-lab-token-search aria-label="${escapeHtml(t("theme_lab_token_search"))}" />`)}
        </div>
        <div class="theme-lab-token-table" data-theme-lab-token-table></div>
        <div class="theme-lab-desk-actions">
          <span class="theme-lab-desk-status" data-theme-lab-token-status aria-live="polite"></span>
          <button class="btn" type="button" data-theme-lab-token-revert>${escapeHtml(t("theme_lab_token_revert"))}</button>
          <button class="btn default" type="button" data-theme-lab-token-copy>${escapeHtml(t("theme_lab_token_copy"))}</button>
        </div>
        <pre class="theme-lab-desk-output" data-theme-lab-token-output hidden></pre>
      </section>`);
  }



  function buildIconSet(win) {
    const grid = win.querySelector("[data-theme-lab-icon-grid]");
    if (!grid || grid.childElementCount) return;
    grid.innerHTML = appearanceIconIds().map((id) => {
      // "startupDisk" reads as "Startup Disk", not "startup Disk": splitting on
      // capitals without recapitalising the first word left every tile in the
      // inventory half sentence-cased.
      const label = (id === "fileFloppy" ? "floppy" : id.replace(/([A-Z])/g, " $1"))
        .replace(/^./, (first) => first.toUpperCase());
      // A priority object's tile is how you open it; the rest are inventory.
      if (OBJECT_IDS.has(id)) {
        return `<button class="theme-lab-icon-tile is-selectable" type="button" data-theme-lab-inspect="${escapeHtml(id)}" aria-pressed="false" aria-label="${escapeHtml(label)}"><span class="sys-icon" data-system-icon="${escapeHtml(id)}" aria-hidden="true"></span><b>${escapeHtml(label)}</b></button>`;
      }
      return `<div class="theme-lab-icon-tile" role="figure" aria-label="${escapeHtml(label)}"><span class="sys-icon" data-system-icon="${escapeHtml(id)}" aria-hidden="true"></span><b>${escapeHtml(label)}</b></div>`;
    }).join("");
    hydrateSystemIcons(grid);
  }

  function syncInspectedTile(win) {
    for (const tile of (win || lab())?.querySelectorAll(".theme-lab-icon-tile.is-selectable") || []) {
      const chosen = tile.dataset.themeLabInspect === inspectedObjectId;
      tile.classList.toggle("is-inspected", chosen);
      tile.setAttribute("aria-pressed", String(chosen));
    }
  }

  function renderIconSet(theme) {
    for (const tile of lab()?.querySelectorAll(".theme-lab-icon-tile") || []) {
      const previous = tile.querySelector(".theme-lab-icon-hint");
      const id = tile.querySelector(".sys-icon[data-system-icon]")?.dataset.systemIcon;
      if (!id || (theme.id === "classic" && !OBJECT_IDS.has(id))) {
        previous?.remove();
        continue;
      }
      const hint = previous || document.createElement("img");
      hint.className = "theme-lab-icon-hint";
      hint.width = 16;
      hint.height = 16;
      hint.alt = "";
      hint.src = compactHintSource(theme.id, id);
      hint.dataset.nativeSize = "16";
      if (!previous) tile.append(hint);
    }
  }

  // ------------------------------------------------------- token workbench --

  // The delta is read from the live CSSOM rather than a copied list. Scope is
  // part of the identity: `body.use-liquid-glass` is an editable era root, but
  // `body.use-liquid-glass .menu-popover button` is a contextual recipe and is
  // read-only here. Collapsing both under one token name used to turn the last
  // contextual declaration in the bundle into a false global value.
  function splitSelectorList(selectorText) {
    const selectors = [];
    let current = "";
    let parenDepth = 0;
    let bracketDepth = 0;
    let quote = "";
    let escaped = false;
    for (const char of String(selectorText || "")) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        current += char;
        escaped = true;
        continue;
      }
      if (quote) {
        current += char;
        if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") {
        current += char;
        quote = char;
        continue;
      }
      if (char === "(") parenDepth += 1;
      else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
      else if (char === "[") bracketDepth += 1;
      else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      if (char === "," && parenDepth === 0 && bracketDepth === 0) {
        if (current.trim()) selectors.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) selectors.push(current.trim());
    return selectors;
  }

  function selectorScope(selectorText) {
    const selector = String(selectorText || "");
    const parts = splitSelectorList(selector);
    if (!parts.length) return null;
    const themeIds = new Set();
    let sharedThemeRoot = false;
    let allExactRoots = true;
    let hasAppearanceSelector = false;
    for (const part of parts) {
      if (part === ":root") {
        themeIds.add("__base");
        hasAppearanceSelector = true;
        continue;
      }
      if (/^body\[data-theme\](?::|$)/.test(part)) {
        themeIds.add("__base");
        sharedThemeRoot = true;
        hasAppearanceSelector = true;
        allExactRoots = false;
        continue;
      }
      if (part === "body.use-liquid-glass") {
        themeIds.add("liquid-glass");
        hasAppearanceSelector = true;
        continue;
      }
      const exact = part.match(/^(?:html|body)\[data-theme=["']([a-z-]+)["']\]$/);
      if (exact) {
        themeIds.add(exact[1]);
        hasAppearanceSelector = true;
        continue;
      }
      const matches = [...part.matchAll(/\[data-theme=["']([a-z-]+)["']\]/g)];
      for (const match of matches) themeIds.add(match[1]);
      if (part.includes(".use-liquid-glass")) themeIds.add("liquid-glass");
      if (matches.length || part.includes(".use-liquid-glass")) hasAppearanceSelector = true;
      allExactRoots = false;
    }
    if (!hasAppearanceSelector) return null;
    return {
      selector,
      themeIds: [...themeIds],
      global: allExactRoots && !sharedThemeRoot,
      contextual: !allExactRoots || sharedThemeRoot,
    };
  }

  function readCustomProperties(style) {
    const found = [];
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      if (name.startsWith("--")) found.push([name, style.getPropertyValue(name).trim()]);
    }
    return found;
  }

  function stylesheetName(sheet) {
    const href = String(sheet?.href || "inline");
    try {
      const path = new URL(href, document.baseURI).pathname;
      return path.split("/").filter(Boolean).at(-1) || href;
    } catch {
      return href;
    }
  }

  function buildTokenIndexFromStyleSheets(styleSheets, sourceFileForTheme = null) {
    const base = new Map();
    const eras = new Map();
    const entries = [];
    const contextual = [];
    const conditional = [];
    const bucket = (map, key) => {
      if (!map.has(key)) map.set(key, new Map());
      return map.get(key);
    };

    const walk = (rules, context) => {
      for (const rule of rules) {
        const isStyleRule = Boolean(rule.selectorText && rule.style);
        if (isStyleRule) {
          const scope = selectorScope(rule.selectorText);
          const declarations = scope ? readCustomProperties(rule.style) : [];
          for (const [name, value] of declarations) {
            for (const themeId of scope.themeIds) {
              const entry = Object.freeze({
                name,
                value,
                themeId,
                selector: scope.selector,
                file: (themeId !== "__base" && sourceFileForTheme?.(themeId)) || context.file,
                global: scope.global,
                contextual: scope.contextual,
                conditional: context.conditions.length > 0,
                conditions: Object.freeze([...context.conditions]),
              });
              entries.push(entry);
              if (entry.conditional) conditional.push(entry);
              else if (entry.contextual) contextual.push(entry);
              else {
                const target = themeId === "__base" ? base : bucket(eras, themeId);
                target.set(name, entry);
              }
            }
          }
        }
        if (rule.cssRules) {
          const condition = rule.conditionText || rule.media?.mediaText || "";
          walk(rule.cssRules, {
            file: context.file,
            conditions: condition ? [...context.conditions, String(condition)] : context.conditions,
          });
        }
      }
    };

    for (const sheet of Array.from(styleSheets || [])) {
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        // A cross-origin stylesheet cannot be read; the app serves its own.
        continue;
      }
      if (rules) walk(rules, { file: stylesheetName(sheet), conditions: [] });
    }
    return Object.freeze({
      base,
      eras,
      entries: Object.freeze(entries),
      contextual: Object.freeze(contextual),
      conditional: Object.freeze(conditional),
    });
  }

  function buildTokenIndex() {
    return buildTokenIndexFromStyleSheets(document.styleSheets, (themeId) =>
      window.AISystem6Theme?.getAuthoringMetadata?.(themeId)?.tokenHome?.file || "");
  }

  function tokenGroupName(name) {
    const parts = name.replace(/^--/, "").split("-");
    if (parts[0] === "theme" && parts[1] === "lab") return "theme-lab";
    return parts[0] || "other";
  }

  function resolvedGlobalTokens(index, chain) {
    const resolved = new Map(index.base);
    for (const theme of chain || []) {
      for (const [name, entry] of index.eras.get(theme.id) || []) resolved.set(name, entry);
    }
    return resolved;
  }

  function tokenRowsForIndex(theme, index, recipeChain) {
    const chain = recipeChain || [theme];
    const parentChain = chain.slice(0, -1);
    const inherited = resolvedGlobalTokens(index, parentChain);
    const active = theme.id === "classic" ? new Map() : (index.eras.get(theme.id) || new Map());
    const resolved = resolvedGlobalTokens(index, chain);
    const names = new Set([...inherited.keys(), ...resolved.keys(), ...active.keys()]);
    const globalRows = [...names].sort().map((name) => {
      const entry = resolved.get(name) || inherited.get(name);
      const baseEntry = inherited.get(name);
      return {
        key: `global:${name}`,
        name,
        group: tokenGroupName(name),
        baseValue: baseEntry?.value || "",
        eraValue: entry?.value || "",
        overridden: active.has(name),
        editable: true,
        contextual: false,
        conditional: false,
        selector: entry?.selector || "",
        file: entry?.file || "",
      };
    });
    const scopedEntries = [...index.contextual, ...index.conditional]
      .filter((entry) => entry.themeId === theme.id || entry.themeId === "__base")
      .sort((a, b) => a.selector.localeCompare(b.selector) || a.name.localeCompare(b.name));
    const scopedRows = scopedEntries.map((entry, position) => ({
      key: `scoped:${position}:${entry.themeId}:${entry.selector}:${entry.name}`,
      name: entry.name,
      group: entry.conditional ? "conditional" : "contextual",
      baseValue: entry.selector,
      eraValue: entry.value,
      overridden: entry.themeId === theme.id,
      editable: false,
      contextual: entry.contextual,
      conditional: entry.conditional,
      selector: entry.selector,
      file: entry.file,
      conditions: entry.conditions,
    }));
    return [...globalRows, ...scopedRows];
  }

  function tokenRowsFor(theme) {
    if (!tokenIndex) tokenIndex = buildTokenIndex();
    const chain = window.AISystem6Theme?.getRecipeChain?.(theme.id) || [theme];
    return tokenRowsForIndex(theme, tokenIndex, chain);
  }

  function groupChoices(rows) {
    const counts = new Map();
    for (const row of rows) counts.set(row.group, (counts.get(row.group) || 0) + 1);
    const named = [...counts.entries()].filter(([, count]) => count >= TOKEN_GROUP_FLOOR);
    named.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const smallCount = [...counts.entries()].filter(([, count]) => count < TOKEN_GROUP_FLOOR)
      .reduce((total, [, count]) => total + count, 0);
    return { named, smallCount };
  }

  function filterValues(win) {
    return {
      group: win.querySelector("[data-theme-lab-token-group]")?.value || "all",
      scope: win.querySelector("[data-theme-lab-token-scope]")?.value || "overridden",
      search: (win.querySelector("[data-theme-lab-token-search]")?.value || "").trim().toLowerCase(),
    };
  }

  function looksLikeColor(value) {
    return /^(#[0-9a-f]{3,8}|rgb|hsl|color\()/i.test(value.trim());
  }

  // What a seventh appearance would still have to fill in.
  //
  // Derived, never listed by hand: a token is "era-owned" when at least one era
  // sets it, which is the codebase saying that value is a period decision
  // rather than a shared default. Coverage is then how many of those this era
  // answers. Add an era and this reads as its worklist on the first load; add a
  // token family to an existing era and every other era's number drops by one
  // until they answer it too.
  function eraTokenCoverage(theme, index) {
    const owned = new Map();
    for (const [eraId, tokens] of index.eras) {
      for (const name of tokens.keys()) {
        // Theme Lab's own furniture is not something an appearance owes.
        if (name.startsWith("--theme-lab-")) continue;
        if (!owned.has(name)) owned.set(name, new Set());
        owned.get(name).add(eraId);
      }
    }
    // Two eras make a period decision; one era makes a quirk. A seventh
    // appearance owes an answer to the first kind, and nothing to the second.
    for (const [name, eras] of [...owned]) {
      if (eras.size < 2) owned.delete(name);
    }
    const mine = new Map([...(index.eras.get(theme.id) || new Map())].filter(([name]) => owned.has(name)));
    const chain = window.AISystem6Theme?.getRecipeChain?.(theme.id) || [theme];
    const inheritedFrom = new Map();
    for (const entry of chain.slice(0, -1)) {
      for (const name of (index.eras.get(entry.id) || new Map()).keys()) {
        if (owned.has(name)) inheritedFrom.set(name, entry.id);
      }
    }
    const missing = [];
    for (const [name, eras] of owned) {
      if (mine.has(name) || inheritedFrom.has(name)) continue;
      missing.push({ name, group: tokenGroupName(name), setBy: [...eras].sort() });
    }
    missing.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    return { ownedCount: owned.size, mineCount: mine.size, inheritedCount: inheritedFrom.size, missing };
  }

  function renderTokenCoverage(theme, index) {
    const host = lab()?.querySelector("[data-theme-lab-token-coverage]");
    if (!host) return;
    const { ownedCount, mineCount, inheritedCount, missing } = eraTokenCoverage(theme, index);
    const answered = ownedCount - missing.length;
    const byGroup = new Map();
    for (const item of missing) {
      if (!byGroup.has(item.group)) byGroup.set(item.group, []);
      byGroup.get(item.group).push(item);
    }
    const groups = [...byGroup.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([group, items]) => `<details class="theme-lab-coverage-group"><summary>${escapeHtml(t("theme_lab_coverage_group", group, items.length))}</summary><ul>${
        items.map((item) => `<li><code>${escapeHtml(item.name)}</code><small>${escapeHtml(t("theme_lab_coverage_set_by", item.setBy.join(", ")))}</small></li>`).join("")
      }</ul></details>`).join("");
    // System 6 is the baseline: it never overrides, because its values ARE the
    // defaults every other era overrides. Reporting it as "0 answered" would
    // read as the emptiest era rather than the one everything starts from.
    const line = theme.id === "classic"
      ? t("theme_lab_coverage_baseline", t(theme.labelKey), ownedCount)
      : t("theme_lab_coverage_summary", t(theme.labelKey), answered, ownedCount, mineCount, inheritedCount);
    host.innerHTML = `<p class="theme-lab-coverage-line${missing.length && theme.id !== "classic" ? "" : " is-complete"}">${
      escapeHtml(line)
    }</p>${theme.id === "classic" ? "" : groups}`;
  }

  function renderTokenDesk(theme) {
    const win = lab();
    const table = win?.querySelector("[data-theme-lab-token-table]");
    if (!table) return;
    const rows = tokenRowsFor(theme);
    renderTokenCoverage(theme, buildTokenIndex());
    const globalRows = rows.filter((row) => row.editable);
    const overriddenCount = globalRows.filter((row) => row.overridden).length;
    const home = authoringOf(theme)?.tokenHome || authoringOf(window.AISystem6Theme?.getTheme?.("classic"))?.tokenHome;
    const conditionalCount = rows.filter((row) => row.conditional).length;

    const summary = win.querySelector("[data-theme-lab-token-summary]");
    if (summary) {
      summary.textContent = theme.id === "classic"
        ? t("theme_lab_token_summary_base", globalRows.length, home.file, conditionalCount)
        : t("theme_lab_token_summary_era", t(theme.labelKey), overriddenCount, globalRows.length, home.file, conditionalCount);
    }

    const { named, smallCount } = groupChoices(rows);
    const chooser = win.querySelector("[data-theme-lab-token-group]");
    if (chooser) {
      const wanted = chooser.value;
      chooser.innerHTML = [`<option value="all">${escapeHtml(t("theme_lab_token_group_all", rows.length))}</option>`]
        .concat(named.map(([name, count]) => `<option value="${escapeHtml(name)}">${escapeHtml(`${name} · ${count}`)}</option>`))
        .concat(smallCount ? [`<option value="__other">${escapeHtml(t("theme_lab_token_group_other", smallCount))}</option>`] : [])
        .join("");
      const options = new Set([...chooser.options].map((option) => option.value));
      chooser.value = options.has(wanted) ? wanted : "all";
      if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    }

    const scopeSelect = win.querySelector("[data-theme-lab-token-scope]");
    if (scopeSelect && !tokenScopeChosen) {
      const wanted = overriddenCount ? "overridden" : "all";
      if (scopeSelect.value !== wanted) {
        scopeSelect.value = wanted;
        if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
      }
    }

    const { group, scope, search } = filterValues(win);
    const namedGroups = new Set(named.map(([name]) => name));
    const visible = rows.filter((row) => {
      if (scope === "overridden" && !row.overridden) return false;
      if (scope === "inherited" && row.overridden) return false;
      if (group === "__other" && namedGroups.has(row.group)) return false;
      if (group !== "all" && group !== "__other" && row.group !== group) return false;
      if (search && ![row.name, row.eraValue, row.selector, row.file, ...(row.conditions || [])]
        .some((value) => String(value || "").toLowerCase().includes(search))) return false;
      return true;
    });

    const shown = visible.slice(0, TOKEN_ROW_LIMIT);
    table.innerHTML = shown.map((row) => {
      const draft = row.editable ? draftTokens.get(row.name) : undefined;
      const value = draft === undefined ? row.eraValue : draft;
      const flagKey = row.overridden ? "theme_lab_token_overridden" : "theme_lab_token_inherited";
      const flagClass = row.overridden ? "is-overridden" : "is-inherited";
      const baseTitle = row.editable ? t("theme_lab_token_base_value") : `${row.file}${row.conditional ? ` · ${row.conditions.join(" · ")}` : ""}`;
      const baseNote = row.baseValue
        ? `<span class="theme-lab-token-base" title="${escapeHtml(baseTitle)}">${escapeHtml(row.baseValue)}</span>`
        : `<span class="theme-lab-token-base"></span>`;
      const editAttributes = row.editable
        ? `data-theme-lab-token-input="${escapeHtml(row.name)}"`
        : 'readonly aria-readonly="true"';
      const computedValue = row.editable
        ? getComputedStyle(document.body).getPropertyValue(row.name).trim()
        : "";
      return `<div class="theme-lab-token-row${draft === undefined ? "" : " is-dirty"}" data-theme-lab-token-row="${escapeHtml(row.key)}">
        <code>${escapeHtml(row.name)}</code>
        <span class="theme-lab-token-flag ${flagClass}">${escapeHtml(t(flagKey))}</span>
        ${baseNote}
        <span class="theme-lab-token-computed" title="computed">${escapeHtml(computedValue)}</span>
        <span class="theme-lab-token-editor">${looksLikeColor(value) ? '<i class="theme-lab-token-swatch" aria-hidden="true"></i>' : ""}<input type="text" spellcheck="false" value="${escapeHtml(value)}" ${editAttributes} aria-label="${escapeHtml(row.name)}" /></span>
      </div>`;
    }).join("") || `<p class="theme-lab-token-empty">${escapeHtml(t("theme_lab_token_empty"))}</p>`;

    for (const swatch of table.querySelectorAll(".theme-lab-token-swatch")) {
      const input = swatch.parentElement?.querySelector("input");
      if (input) swatch.style.setProperty("--theme-lab-swatch", input.value);
    }

    const count = win.querySelector("[data-theme-lab-token-status]");
    if (count && !count.dataset.holdMessage) {
      count.textContent = visible.length > shown.length
        ? t("theme_lab_token_truncated", shown.length, visible.length, draftTokens.size)
        : t("theme_lab_token_shown", shown.length, draftTokens.size);
    }
  }

  // Each era declares its tokens on both html and body, so an experiment has to
  // land on both: an inline property on body would lose to body[data-theme] for
  // anything that resolves from html, and one on html alone would lose to the
  // body rule for everything inside it. Inline beats a stylesheet on each.
  const draftHosts = () => [document.documentElement, document.body].filter(Boolean);

  function applyDraftToken(name, value) {
    const trimmed = value.trim();
    if (!trimmed) {
      draftTokens.delete(name);
      for (const host of draftHosts()) host.style.removeProperty(name);
      return;
    }
    draftTokens.set(name, trimmed);
    for (const host of draftHosts()) host.style.setProperty(name, trimmed);
  }

  function revertDraftTokens() {
    for (const name of draftTokens.keys()) {
      for (const host of draftHosts()) host.style.removeProperty(name);
    }
    draftTokens.clear();
  }

  function tokenDeltaCss(theme) {
    const home = authoringOf(theme)?.tokenHome || authoringOf(window.AISystem6Theme?.getTheme?.("classic"))?.tokenHome;
    const names = [...draftTokens.keys()].sort();
    const body = names.map((name) => `  ${name}: ${draftTokens.get(name)};`).join("\n");
    return [
      `/* Theme Lab · ${t(theme.labelKey)} · ${names.length} token${names.length === 1 ? "" : "s"}`,
      `   Paste inside ${home.selector.replace(/\n/g, " ")} { … }`,
      `   in ${home.file} */`,
      body,
    ].join("\n");
  }

  // ------------------------------------------------------------------ output --

  // Copy is best-effort: the block is always printed so the text is available
  // even when the clipboard is not, and the status line says which happened.
  function publishOutput(win, outputSelector, statusSelector, text) {
    const output = win.querySelector(outputSelector);
    const status = win.querySelector(statusSelector);
    if (output) {
      output.textContent = text;
      output.hidden = false;
    }
    if (!status) return;
    status.dataset.holdMessage = "true";
    const write = navigator.clipboard?.writeText?.(text);
    if (!write || typeof write.then !== "function") {
      status.textContent = t("theme_lab_copy_failed");
      return;
    }
    write.then(
      () => { status.textContent = t("theme_lab_copied"); },
      () => { status.textContent = t("theme_lab_copy_failed"); },
    );
  }

  // ------------------------------------------------------------------ wiring --

  function wire(win) {
    if (win.dataset.themeLabWired === "true") return;
    win.dataset.themeLabWired = "true";

    win.addEventListener("click", (event) => {
      if (event.target.closest(".close-box")) {
        cleanup();
        return;
      }
      const era = event.target.closest("[data-theme-lab-era]");
      if (era) {
        travelTo(era.dataset.themeLabEra);
        return;
      }
      const tab = event.target.closest("[data-theme-lab-tab]");
      if (tab) {
        showPanel(tab.dataset.themeLabTab);
        return;
      }
      const inspect = event.target.closest("[data-theme-lab-inspect]");
      if (inspect) {
        inspectedObjectId = inspect.dataset.themeLabInspect;
        renderObjectLab(currentTheme());
        syncInspectedTile(win);
        if (inspect.classList.contains("theme-lab-icon-tile")) {
          win.querySelector("[data-theme-lab-object-grid]")
            ?.scrollIntoView({ block: "nearest", behavior: "auto" });
        }
        return;
      }
      if (event.target.closest("[data-theme-lab-token-revert]")) {
        revertDraftTokens();
        const status = win.querySelector("[data-theme-lab-token-status]");
        if (status) delete status.dataset.holdMessage;
        const output = win.querySelector("[data-theme-lab-token-output]");
        if (output) output.hidden = true;
        renderTokenDesk(currentTheme());
        return;
      }
      if (event.target.closest("[data-theme-lab-token-copy]")) {
        if (!draftTokens.size) {
          const status = win.querySelector("[data-theme-lab-token-status]");
          if (status) {
            status.dataset.holdMessage = "true";
            status.textContent = t("theme_lab_token_nothing");
          }
          return;
        }
        publishOutput(win, "[data-theme-lab-token-output]", "[data-theme-lab-token-status]", tokenDeltaCss(currentTheme()));
        return;
      }
    });

    win.addEventListener("input", (event) => {
      const range = event.target.closest("[data-theme-lab-era-range]");
      if (range) {
        travelTo(nearestStop(Number(range.value) / 1000).theme.id);
        return;
      }
      const tokenInput = event.target.closest("[data-theme-lab-token-input]");
      if (tokenInput) {
        applyDraftToken(tokenInput.dataset.themeLabTokenInput, tokenInput.value);
        const row = tokenInput.closest("[data-theme-lab-token-row]");
        row?.classList.toggle("is-dirty", draftTokens.has(tokenInput.dataset.themeLabTokenInput));
        row?.querySelector(".theme-lab-token-swatch")?.style.setProperty("--theme-lab-swatch", tokenInput.value);
        const status = win.querySelector("[data-theme-lab-token-status]");
        if (status) {
          delete status.dataset.holdMessage;
          status.textContent = t("theme_lab_token_shown", win.querySelectorAll("[data-theme-lab-token-row]").length, draftTokens.size);
        }
        return;
      }
      if (event.target.closest("[data-theme-lab-token-search]")) renderTokenDesk(currentTheme());
    });

    // Release settles the knob onto the exact tick; Theme Lab remains preview-
    // only, so the saved Appearance still belongs to Control Panel / Special.
    win.addEventListener("change", (event) => {
      const range = event.target.closest("[data-theme-lab-era-range]");
      if (range) {
        const stop = nearestStop(Number(range.value) / 1000);
        range.value = String(Math.round(stop.t * 1000));
        travelTo(stop.theme.id);
        return;
      }
      if (event.target.closest("[data-theme-lab-token-scope]")) tokenScopeChosen = true;
      if (event.target.closest("[data-theme-lab-token-group]") || event.target.closest("[data-theme-lab-token-scope]")) {
        renderTokenDesk(currentTheme());
      }
    });
  }

  // ------------------------------------------------------------------- sync --

  function render(theme) {
    const win = lab();
    if (!win || !theme) return;
    wire(win);
    buildTokenPanel(win);
    buildWindowChromeSpecimens(win);
    buildFinderListSpecimen(win);
    renderEraTimeline(theme);
    renderLineage(theme);
    if (typeof initSystemSelectControls === "function") initSystemSelectControls();

    for (const [selector, value] of [
      ["[data-theme-lab-appearance]", theme.label],
      ["[data-theme-lab-font]", theme.systemFont],
      ["[data-theme-lab-font-size]", theme.systemFontSize],
    ]) {
      const target = win.querySelector(selector);
      if (target) target.textContent = String(value);
    }

    // Only the panel on screen keeps its content in the document. The object
    // lab alone is several hundred nodes, and every window observer walks them
    // on each appearance change. The capture hook opens every panel at once for
    // the snapshot and fidelity harnesses, which do want the whole atlas.
    const captureAll = win.dataset.themeLabCapture === "all";
    if (captureAll || activePanel === "objects") renderObjectLab(theme);
    else win.querySelector("[data-theme-lab-object-grid]")?.replaceChildren();
    if (captureAll || activePanel === "tokens") renderTokenDesk(theme);
    else win.querySelector("[data-theme-lab-token-table]")?.replaceChildren();
    buildIconSet(win);
    renderIconSet(theme);
    syncInspectedTile(win);
  }

  // A draft belongs to one era's stylesheet block, so it does not survive an
  // era change: carrying it over would offer a Platinum value for pasting into
  // the Aqua file. Dropping it also puts the desktop back on shipped values.
  function sync(theme) {
    const next = theme || currentTheme();
    if (next && next.id !== lastRenderedThemeId) {
      lastRenderedThemeId = next.id;
      if (draftTokens.size) revertDraftTokens();
    }
    render(next);
  }

  function cleanup() {
    revertDraftTokens();
    const committedThemeId = window.AISystem6Theme?.getCommittedTheme?.()
      || window.AISystem6Theme?.DEFAULT_THEME_ID
      || "classic";
    if (window.AISystem6Theme?.getCurrentTheme?.() !== committedThemeId && typeof applyTheme === "function") {
      applyTheme(committedThemeId, {
        experimental: true,
        commit: false,
        persist: false,
        saveDesk: false,
        source: "theme-lab-restore",
      });
    }
    sessionOpen = false;
    lastRenderedThemeId = null;
  }

  function attach() {
    const win = lab();
    sessionOpen = true;
    if (win?.dataset.themeLabCapture === "all") {
      for (const panel of win.querySelectorAll("[data-theme-lab-panel]")) panel.hidden = false;
    }
    render(currentTheme());
  }

  function restore() {
    if (sessionOpen || draftTokens.size) cleanup();
    attach();
  }

  // The workbench markup is built from translated strings, so a language switch
  // rebuilds it rather than leaving the previous language's labels in place.
  function refreshLanguage() {
    tokenIndex = null;
    const win = lab();
    win?.querySelector('[data-theme-lab-panel="tokens"]')?.replaceChildren();
    render(currentTheme());
  }

  window.AISystem6ThemeLabLoaded = true;
  window.AISystem6ThemeLabInternals = Object.freeze({
    splitSelectorList,
    selectorScope,
    buildTokenIndexFromStyleSheets,
    tokenRowsForIndex,
  });
  window.AISystem6ThemeLab = Object.freeze({ attach, cleanup, restore, sync, refreshLanguage, showPanel });
  window.AISystem6Runtime?.registerApplication({
    id: "themeLab",
    windowName: "themeLab",
    mount: attach,
    restore,
    commands: {
      "open-theme-lab": {
        handler: () => openWindow("themeLab"),
        isAvailable: () => true,
      },
    },
  });
})();
