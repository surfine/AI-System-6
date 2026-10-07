// Small desk preferences and shared intent timing; no application state lives here.
(() => {
  if (window.AISystem6WindowShadePreferences) return;
  const storageKey = "ai-system-6-windowshade-preferences";
  const defaults = { dockHoverPreview: true, edgeSlideOver: true };
  let values = read();
  let hoverOwner = null;
  function read() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof stored?.[key] === "boolean" ? stored[key] : fallback]));
    } catch (error) { return { ...defaults }; }
  }
  function get(key) { return values[key] === true; }
  function set(key, value) {
    if (!Object.hasOwn(defaults, key)) return false;
    values[key] = value !== false;
    try { localStorage.setItem(storageKey, JSON.stringify(values)); } catch (error) { /* Session choice remains usable. */ }
    if (key === "dockHoverPreview" && !get(key)) window.AISystem6WindowBrowse?.closeHover?.();
    syncFields();
    document.dispatchEvent(new CustomEvent("ai-system6-windowshade-preferenceschange", { detail: { key, value: values[key] } }));
    return values[key];
  }
  function bindDockHover(node, appId) {
    let timer = 0;
    let ticket = 0;
    let inside = false;
    let suppressed = false;
    const cancel = () => { clearTimeout(timer); ticket += 1; };
    const suppress = () => {
      suppressed = true; cancel();
      window.AISystem6WindowBrowse?.closeHover?.(node);
    };
    node.addEventListener("pointerenter", (event) => {
      inside = true;
      if (event.pointerType === "touch" || suppressed || !get("dockHoverPreview")) return;
      cancel();
      hoverOwner = node;
      const current = ticket;
      timer = setTimeout(async () => {
        try {
          await ensureLazySystemModule("app/features/window-browse.js", "AISystem6WindowBrowseLoaded");
          if (current !== ticket || !inside || suppressed || !get("dockHoverPreview") || !node.isConnected || hoverOwner !== node) return;
          window.AISystem6WindowBrowse?.open?.({ appId, hover: true, anchor: node, returnFocus: false });
        } catch (error) { /* A failed optional preview must not prevent activation. */ }
      }, 350);
    });
    node.addEventListener("pointerleave", () => {
      inside = false; suppressed = false; cancel();
      window.AISystem6WindowBrowse?.hoverLeave?.(node);
    });
    node.addEventListener("contextmenu", suppress);
    node.addEventListener("dragstart", suppress);
    node.addEventListener("pointerdown", suppress);
    node.addEventListener("keydown", (event) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) suppress();
    });
  }
  function syncFields() {
    const anchor = document.querySelector(".liquid-tint-field");
    if (!anchor) return;
    for (const [key, label] of [["dockHoverPreview", "window_dock_preview_setting"], ["edgeSlideOver", "window_edge_slide_setting"]]) {
      let input = document.getElementById(`windowshade-${key}`);
      if (!input) {
        const field = document.createElement("label");
        field.className = "control-field windowshade-preference-field";
        input = document.createElement("input");
        input.type = "checkbox"; input.id = `windowshade-${key}`;
        const span = document.createElement("span");
        span.dataset.i18n = label;
        field.append(input, span); anchor.after(field);
        input.addEventListener("change", () => set(key, input.checked));
      }
      input.checked = get(key);
      input.nextElementSibling.textContent = typeof t === "function" ? t(label) : label;
    }
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    values = read(); syncFields();
    if (!get("dockHoverPreview")) window.AISystem6WindowBrowse?.closeHover?.();
    document.dispatchEvent(new CustomEvent("ai-system6-windowshade-preferenceschange"));
  });
  document.addEventListener("ai-system6-themechange", () => {
    hoverOwner = null; window.AISystem6WindowBrowse?.closeHover?.(); syncFields();
  });
  document.addEventListener("ai-system6-dockchange", () => {
    hoverOwner = null; window.AISystem6WindowBrowse?.closeHover?.();
  });
  document.addEventListener("DOMContentLoaded", syncFields);
  window.AISystem6WindowShadePreferences = Object.freeze({ get, set, bindDockHover, syncFields });
  syncFields();
})();
