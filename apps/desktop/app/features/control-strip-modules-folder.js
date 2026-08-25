// Control Strip Modules folder adapter.
//
// System Folder / Control Strip Modules is a visible Finder folder, not a
// JavaScript array pretending to be one. The window reuses the shared static
// Finder renderer (view modes, selection, count label, Get Info) and the
// shared document drag-and-drop path. The only new behavior here is what a
// module file means: dragging it onto the strip adds the module, and
// double-clicking opens its owner window (or shows a short description when
// no single owner exists). Files are configuration objects for first-party
// modules — never executable scripts and never an app launcher.

// controlStripModules's markup lived in index.html, downloaded by every boot for a
// window this module already loads on demand. Built here at module eval,
// before anything below queries its own elements. openWindow() installs
// the grow box.
function installControlStripModulesWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="controlStripModules"]')) return;
  window.AISystem6ApplicationShell.createWindow({
    windowName: "controlStripModules",
    windowClass: "finder-window",
    labelledBy: "control-strip-modules-title",
    titleKey: "control_strip_modules_folder",
    title: "Control Strip Modules",
    statusHtml: `
          <span id="control-strip-modules-count" data-i18n="eleven_items">11 items</span>
          <div class="view-controls" data-view-window="controlStripModules" aria-label="View" data-i18n-aria-label="view_controls">
            <button class="view-btn is-active" type="button" data-view="icon" aria-label="Icon view" data-i18n-aria-label="view_icon"></button>
            <button class="view-btn" type="button" data-view="list" aria-label="List view" data-i18n-aria-label="view_list"></button>
          </div>
          <span data-i18n="system_folder">System Folder</span>`,
    paneClass: "finder-grid control-strip-modules-grid window-frame-scroller",
    paneHtml: `
          <button class="finder-item" data-control-strip-module="soundscape" draggable="true">
            <span class="sys-icon" data-system-icon="soundscape" aria-hidden="true"></span>
            <span data-i18n="control_strip_soundscape">Soundscape</span>
          </button>
          <button class="finder-item" data-control-strip-module="projectDisk" draggable="true">
            <span class="sys-icon" data-system-icon="projectDisk" aria-hidden="true"></span>
            <span data-i18n="control_strip_project_disk">Project Hard Disk</span>
          </button>
          <button class="finder-item" data-control-strip-module="model" draggable="true">
            <span class="sys-icon" data-system-icon="cloudModel" aria-hidden="true"></span>
            <span data-i18n="control_strip_model">Model</span>
          </button>
          <button class="finder-item" data-control-strip-module="writingBell" draggable="true">
            <span class="sys-icon" data-system-icon="writingBell" aria-hidden="true"></span>
            <span data-i18n="control_strip_writing_bell">Writing Bell</span>
          </button>
          <button class="finder-item" data-control-strip-module="appearance" draggable="true">
            <span class="sys-icon" data-system-icon="control" aria-hidden="true"></span>
            <span data-i18n="control_strip_desk_appearance">Appearance</span>
          </button>
          <button class="finder-item" data-control-strip-module="balloonHelp" draggable="true">
            <span class="sys-icon" data-system-icon="systemHelp" aria-hidden="true"></span>
            <span data-i18n="control_strip_balloon_help">Balloon Help</span>
          </button>
          <button class="finder-item" data-control-strip-module="nowPlaying" draggable="true">
            <span class="sys-icon" data-system-icon="soundscape" aria-hidden="true"></span>
            <span data-i18n="control_strip_now_playing">Now Playing</span>
          </button>
          <button class="finder-item" data-control-strip-module="finderEnvironment" draggable="true">
            <span class="sys-icon" data-system-icon="systemStatus" aria-hidden="true"></span>
            <span data-i18n="control_strip_finder_environment">Finder / MultiFinder</span>
          </button>
          <button class="finder-item" data-control-strip-module="notifications" draggable="true">
            <span class="sys-icon" data-system-icon="systemStatus" aria-hidden="true"></span>
            <span data-i18n="control_strip_notifications">System Messages</span>
          </button>
          <button class="finder-item" data-control-strip-module="clock" draggable="true">
            <span class="sys-icon" data-system-icon="systemStatus" aria-hidden="true"></span>
            <span data-i18n="control_strip_clock">Clock</span>
          </button>
          <button class="finder-item" data-control-strip-module="heldPlace" draggable="true">
            <span class="sys-icon" data-system-icon="alias" aria-hidden="true"></span>
            <span data-i18n="control_strip_held_place">Your Place</span>
          </button>`,
  });
}

installControlStripModulesWindow();
window.AISystem6ControlStripModulesFolderLoaded = true;

function controlStripFolderOpenModule(moduleId) {
  const descriptors = Array.isArray(window.AISystem6ControlStripModules)
    ? window.AISystem6ControlStripModules
    : [];
  const descriptor = descriptors.find((entry) => entry.id === moduleId);
  if (!descriptor) {
    if (typeof setStatus === "function") setStatus(t("control_strip_module_missing"));
    return;
  }
  if (descriptor.openOwner && typeof openWindow === "function") {
    openWindow(descriptor.openOwner);
    return;
  }
  // Modules without a single owner window (Long Tasks) still answer with a
  // short description instead of pretending to launch an app.
  if (typeof setStatus === "function") {
    setStatus(t("control_strip_module_info", t(descriptor.labelKey || "control_strip_module")));
  }
}

function controlStripFolderBind(windowRoot) {
  if (!windowRoot) return;
  if (windowRoot.dataset.controlStripModulesBound === "true") return;
  windowRoot.dataset.controlStripModulesBound = "true";
  windowRoot.addEventListener("dblclick", (event) => {
    const item = event.target.closest("[data-control-strip-module]");
    if (!item) return;
    event.preventDefault();
    controlStripFolderOpenModule(item.dataset.controlStripModule);
  });
}

function controlStripFolderAttach() {
  return Promise.resolve()
    .then(() => (typeof ensureControlStripModulesModule === "function"
      ? ensureControlStripModulesModule()
      : null))
    .then(() => {
      if (typeof renderStaticFinderWindow === "function") {
        renderStaticFinderWindow("controlStripModules");
      }
      controlStripFolderBind(document.querySelector('[data-window="controlStripModules"]'));
    })
    .catch((error) => console.warn("Control Strip Modules folder unavailable.", error));
}

function controlStripFolderRefreshLanguage() {
  if (typeof renderStaticFinderWindow === "function") {
    renderStaticFinderWindow("controlStripModules");
  }
}

window.AISystem6ControlStripModulesFolder = Object.freeze({
  attach: controlStripFolderAttach,
  openModule: controlStripFolderOpenModule,
  refreshLanguage: controlStripFolderRefreshLanguage,
});
