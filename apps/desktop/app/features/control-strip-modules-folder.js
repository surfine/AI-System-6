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
