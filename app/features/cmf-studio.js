// Feature module: CMF Studio.
// Loaded lazily as a classic script; shares the AI System 6 global scope.

(() => {
  const STORAGE_KEY = "ai-system-6-cmf-studio-recipe";
  const COLORS = [
    { id: "black17", hex: "#353839", labelKey: "cmf_color_black17" },
    { id: "lavender17", hex: "#dfceea", labelKey: "cmf_color_lavender17" },
    { id: "mistBlue17", hex: "#96aed1", labelKey: "cmf_color_mist_blue17" },
    { id: "sage17", hex: "#a9b689", labelKey: "cmf_color_sage17" },
    { id: "white17", hex: "#f5f5f5", labelKey: "cmf_color_white17" },
  ];
  const PARTS = [
    { id: "frame", labelKey: "cmf_part_frame" },
    { id: "backGlass", labelKey: "cmf_part_back_glass" },
    { id: "volumeUp", labelKey: "cmf_part_volume_up" },
    { id: "volumeDown", labelKey: "cmf_part_volume_down" },
    { id: "actionButton", labelKey: "cmf_part_action_button" },
    { id: "cameraControl", labelKey: "cmf_part_camera_control" },
    { id: "sideButton", labelKey: "cmf_part_side_button" },
    { id: "simTray", labelKey: "cmf_part_sim_tray" },
    { id: "usbC", labelKey: "cmf_part_usb_c" },
    { id: "cameraPlate", labelKey: "cmf_part_camera_plate" },
  ];
  const VIEW_LABELS = {
    "01-front": "front",
    "02-back": "back",
    "03-rear-hero": "rear hero",
    "04-front-hero": "front hero",
    "05-buttons-side": "buttons",
    "06-control-side": "control",
    "07-camera-close": "camera",
    "08-bottom-usb": "USB-C",
    "09-top-edge": "top edge",
  };

  const PRESETS = {
    porcelainCircuit: {
      frame: "black17",
      backGlass: "white17",
      volumeUp: "lavender17",
      volumeDown: "mistBlue17",
      actionButton: "sage17",
      cameraControl: "black17",
      sideButton: "white17",
      simTray: "lavender17",
      usbC: "mistBlue17",
      cameraPlate: "sage17",
    },
    sageTerminal: {
      frame: "black17",
      backGlass: "sage17",
      volumeUp: "lavender17",
      volumeDown: "mistBlue17",
      actionButton: "white17",
      cameraControl: "lavender17",
      sideButton: "sage17",
      simTray: "black17",
      usbC: "black17",
      cameraPlate: "black17",
    },
    mistDraft: {
      frame: "white17",
      backGlass: "mistBlue17",
      volumeUp: "lavender17",
      volumeDown: "sage17",
      actionButton: "black17",
      cameraControl: "lavender17",
      sideButton: "mistBlue17",
      simTray: "white17",
      usbC: "black17",
      cameraPlate: "black17",
    },
  };

  let initialized = false;
  let recipe = defaultRecipe();
  let currentViews = [];
  let selectedView = "02-back";
  let previewRefreshTimer = 0;
  let previewRequestId = 0;
  let previewAbortController = null;

  function defaultRecipe() {
    return {
      model: "iphone-17-standard",
      name: "iphone-17-standard-cmf-studio",
      parts: { ...PRESETS.porcelainCircuit },
    };
  }

  function cmfEl(id) {
    return document.getElementById(id);
  }

  function colorMeta(id) {
    return COLORS.find((color) => color.id === id) || COLORS[0];
  }

  function initCmfStudio() {
    if (initialized) return;
    initialized = true;
    recipe = loadRecipe();
    buildPartControls();
    bindCmfStudioEvents();
    syncCmfForm();
    refreshCapabilities();
    setCmfStatus(t("cmf_ready"));
  }

  function renderCmfStudio() {
    initCmfStudio();
    syncCmfForm();
  }

  function bindCmfStudioEvents() {
    cmfEl("cmf-preset")?.addEventListener("change", (event) => {
      const preset = PRESETS[event.target.value];
      if (!preset) return;
      recipe.parts = { ...recipe.parts, ...preset };
      syncCmfForm();
      saveRecipe({ quiet: true });
      schedulePreviewRender();
      setCmfStatus(t("cmf_preset_applied"));
    });
    cmfEl("cmf-shuffle")?.addEventListener("click", shuffleRecipe);
    cmfEl("cmf-save")?.addEventListener("click", () => saveRecipe());
    cmfEl("cmf-reset")?.addEventListener("click", resetRecipe);
    cmfEl("cmf-render")?.addEventListener("click", renderViews);
    cmfEl("cmf-export")?.addEventListener("click", exportUsdz);
    cmfEl("cmf-view-strip")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cmf-view]");
      if (!button) return;
      selectedView = button.dataset.cmfView;
      renderPreviewImage();
      schedulePreviewRender(0);
    });
  }

  function buildPartControls() {
    const target = cmfEl("cmf-parts");
    if (!target || target.dataset.ready === "true") return;
    target.dataset.ready = "true";
    target.replaceChildren(...PARTS.map((part) => {
      const row = document.createElement("div");
      row.className = "cmf-part-row";
      row.dataset.cmfPartRow = part.id;

      const text = document.createElement("span");
      text.className = "cmf-part-label";
      text.textContent = t(part.labelKey);

      const current = document.createElement("span");
      current.className = "cmf-part-current";
      const swatch = document.createElement("span");
      swatch.className = "cmf-part-swatch";
      swatch.dataset.cmfSwatch = part.id;
      const currentName = document.createElement("span");
      currentName.dataset.cmfCurrentName = part.id;
      current.append(swatch, currentName);

      const palette = document.createElement("span");
      palette.className = "cmf-color-options";
      palette.setAttribute("role", "group");
      palette.setAttribute("aria-label", t(part.labelKey));
      COLORS.forEach((color) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cmf-color-chip";
        button.dataset.cmfColorOption = "true";
        button.dataset.cmfPart = part.id;
        button.dataset.cmfColor = color.id;
        button.title = t(color.labelKey);
        button.setAttribute("aria-label", `${t(part.labelKey)} ${t(color.labelKey)}`);
        button.addEventListener("click", () => {
          recipe.parts[part.id] = color.id;
          syncCmfForm();
          saveRecipe({ quiet: true });
          schedulePreviewRender();
        });
        palette.append(button);
      });

      row.append(text, current, palette);
      return row;
    }));
  }

  function syncCmfForm() {
    cmfEl("cmf-model") && (cmfEl("cmf-model").value = recipe.model);
    document.querySelectorAll("[data-cmf-color-option]").forEach((button) => {
      const selected = recipe.parts[button.dataset.cmfPart] === button.dataset.cmfColor;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    updatePartSwatches();
  }

  function updatePartSwatches() {
    document.querySelectorAll("[data-cmf-swatch]").forEach((swatch) => {
      const part = swatch.dataset.cmfSwatch;
      const color = colorMeta(recipe.parts[part]);
      swatch.dataset.cmfColor = color.id;
      const label = document.querySelector(`[data-cmf-current-name="${part}"]`);
      if (label) label.textContent = t(color.labelKey);
    });
  }

  function loadRecipe() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.model === "iphone-17-standard" && saved.parts) {
        return { ...defaultRecipe(), ...saved, parts: { ...defaultRecipe().parts, ...saved.parts } };
      }
    } catch {}
    return defaultRecipe();
  }

  function saveRecipe(options = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
    if (!options.quiet) {
      setCmfStatus(t("cmf_recipe_saved"));
      setStatus?.(t("cmf_recipe_saved"));
      playSystemSound?.("save");
    }
  }

  function resetRecipe() {
    recipe = defaultRecipe();
    localStorage.removeItem(STORAGE_KEY);
    currentViews = [];
    selectedView = "02-back";
    syncCmfForm();
    renderPreviewImage();
    schedulePreviewRender(0);
    setCmfStatus(t("cmf_reset_done"));
  }

  function shuffleRecipe() {
    const colors = shuffleArray(COLORS.map((color) => color.id));
    recipe.parts.volumeUp = colors[0];
    recipe.parts.volumeDown = colors[1];
    recipe.parts.actionButton = colors[2];
    recipe.parts.cameraControl = colors[3];
    recipe.parts.sideButton = colors[4];
    recipe.parts.frame = colors[1];
    recipe.parts.backGlass = colors[4];
    recipe.parts.simTray = colors[0];
    recipe.parts.usbC = colors[2];
    recipe.parts.cameraPlate = colors[3];
    syncCmfForm();
    saveRecipe({ quiet: true });
    schedulePreviewRender();
    setCmfStatus(t("cmf_shuffle_done"));
  }

  function shuffleArray(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  async function refreshCapabilities() {
    try {
      const response = await fetch("/api/cmf/capabilities", { cache: "no-store" });
      const data = await response.json();
      const label = data.canRenderViews ? t("cmf_cap_ready") : data.canExport ? t("cmf_cap_export_only") : t("cmf_cap_missing");
      const el = cmfEl("cmf-capabilities");
      if (el) el.textContent = label;
      cmfEl("cmf-render") && (cmfEl("cmf-render").disabled = !data.canRenderViews);
      cmfEl("cmf-export") && (cmfEl("cmf-export").disabled = !data.canExport);
    } catch {
      const el = cmfEl("cmf-capabilities");
      if (el) el.textContent = t("cmf_cap_missing");
    }
  }

  async function renderViews() {
    cancelPreviewRender();
    setBusy(true, t("cmf_rendering"));
    try {
      const response = await fetch("/api/cmf/render-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
      currentViews = Array.isArray(data.views) ? data.views : [];
      selectedView = currentViews.find((view) => view.name === selectedView)?.name || currentViews[0]?.name || "";
      renderPreviewImage();
      setCmfStatus(t("cmf_render_done"));
    } catch (error) {
      setCmfStatus(`${t("cmf_render_failed")} ${error.message}`);
      playSystemSound?.("alert");
    } finally {
      setBusy(false);
    }
  }

  function renderPreviewImage() {
    const preview = cmfEl("cmf-preview-image");
    const empty = cmfEl("cmf-preview-empty");
    const strip = cmfEl("cmf-view-strip");
    const active = currentViews.find((view) => view.name === selectedView) || currentViews[0];

    if (preview) {
      preview.hidden = !active;
      if (active) preview.src = active.dataUrl;
    }
    if (empty) empty.hidden = !!active;
    if (strip) {
      strip.replaceChildren(...currentViews.map((view) => {
        const button = document.createElement("button");
        button.className = `cmf-view-thumb${view.name === active?.name ? " is-active" : ""}`;
        button.type = "button";
        button.dataset.cmfView = view.name;
        button.title = viewLabel(view.name);
        button.setAttribute("aria-pressed", String(view.name === active?.name));

        const image = document.createElement("img");
        image.src = view.dataUrl;
        image.alt = "";

        const label = document.createElement("span");
        label.textContent = viewLabel(view.name);
        button.append(image, label);
        return button;
      }));
    }
  }

  function viewLabel(name) {
    return VIEW_LABELS[name] || name.replace(/^\d+-/, "").replace(/-/g, " ");
  }

  function schedulePreviewRender(delay = 420) {
    window.clearTimeout(previewRefreshTimer);
    setPreviewRefreshing(true);
    setCmfStatus(t("cmf_preview_rendering"));
    previewRefreshTimer = window.setTimeout(renderLivePreview, delay);
  }

  function cancelPreviewRender() {
    window.clearTimeout(previewRefreshTimer);
    previewRefreshTimer = 0;
    previewRequestId += 1;
    if (previewAbortController) previewAbortController.abort();
    previewAbortController = null;
    setPreviewRefreshing(false);
  }

  async function renderLivePreview() {
    const requestId = previewRequestId + 1;
    previewRequestId = requestId;
    if (previewAbortController) previewAbortController.abort();
    previewAbortController = new AbortController();
    try {
      const response = await fetch("/api/cmf/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, viewName: selectedView || "02-back" }),
        signal: previewAbortController.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
      if (requestId !== previewRequestId || !data.view) return;
      upsertCurrentView(data.view);
      selectedView = data.view.name;
      renderPreviewImage();
      setCmfStatus(t("cmf_preview_done"));
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (requestId === previewRequestId) setCmfStatus(`${t("cmf_preview_failed")} ${error.message}`);
    } finally {
      if (requestId === previewRequestId) {
        previewAbortController = null;
        setPreviewRefreshing(false);
      }
    }
  }

  function upsertCurrentView(view) {
    const index = currentViews.findIndex((item) => item.name === view.name);
    if (index >= 0) currentViews[index] = view;
    else currentViews = [...currentViews, view].sort((a, b) => a.name.localeCompare(b.name));
  }

  function setPreviewRefreshing(refreshing) {
    document.querySelector(".cmf-preview-panel")?.classList.toggle("is-refreshing", refreshing);
  }

  async function exportUsdz() {
    setBusy(true, t("cmf_exporting"));
    try {
      const response = await fetch("/api/cmf/export-usdz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || response.statusText);
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${recipe.name || "iphone-17-standard-cmf"}.usdz`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setCmfStatus(t("cmf_export_done"));
      playSystemSound?.("save");
    } catch (error) {
      setCmfStatus(`${t("cmf_export_failed")} ${error.message}`);
      playSystemSound?.("alert");
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy, message = "") {
    ["cmf-shuffle", "cmf-save", "cmf-reset", "cmf-render", "cmf-export"].forEach((id) => {
      const button = cmfEl(id);
      if (button) button.disabled = busy;
    });
    document.querySelectorAll("[data-cmf-color-option]").forEach((button) => {
      button.disabled = busy;
    });
    if (message) setCmfStatus(message);
  }

  function setCmfStatus(message) {
    const el = cmfEl("cmf-status");
    if (el) el.textContent = message;
  }

  window.AISystem6CMFStudioLoaded = true;
  window.renderCmfStudio = renderCmfStudio;
})();
