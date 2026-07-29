// Feature module: CMF Studio.
// Loaded lazily as a classic script; shares the AI System 6 global scope.

(() => {
  const STORAGE_KEY = "ai-system-6-cmf-studio-recipe";
  const RENDERER_VENDOR_URL = "/app/vendor/cmf-renderer.js?v=three-0.184.0-uv-channel-cache";
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
  const MATERIAL_PART_ALIASES = Object.freeze({
    frame: "frame",
    frameSide: "frame",
    backGlass: "backGlass",
    volumeUp: "volumeUp",
    volumeDown: "volumeDown",
    actionOrSim: "actionButton",
    cameraControl: "cameraControl",
    sideButton: "sideButton",
    simTray: "simTray",
    usbC: "usbC",
    screwOrSpeaker: "usbC",
    cameraPlate: "cameraPlate",
  });
  const EXACT_PART_BY_MESH_NAME = Object.freeze({
    psstnNZmWlkGpGJ: "actionButton",
    aabQdFuOayXiOAy: "volumeUp",
    fQDGdPVinVFkDgA: "volumeDown",
    DRSYKrXjlbGZrGD: "sideButton",
    SdLaeCAiKFeDCSz: "cameraControl",
    ohRsmdOpfcWOasQ: "cameraControl",
    kQtKvBruXjVcFqZ: "cameraControl",
    tXyqmuCYyFmMJhw: "simTray",
  });
  const VIEW_DEFINITIONS = [
    { name: "01-front", labelKey: "cmf_view_front", direction: [0, 0.04, 1], up: [0, 1, 0], frame: 1.08 },
    { name: "02-back", labelKey: "cmf_view_back", direction: [0, 0.04, -1], up: [0, 1, 0], frame: 1.08 },
    { name: "03-rear-hero", labelKey: "cmf_view_rear_hero", direction: [-0.72, 0.42, -1], up: [0, 1, 0], frame: 0.92 },
    { name: "04-front-hero", labelKey: "cmf_view_front_hero", direction: [-0.72, 0.32, 1], up: [0, 1, 0], frame: 0.92 },
    { name: "05-buttons-side", labelKey: "cmf_view_buttons", direction: [-1, 0.02, 0.12], up: [0, 1, 0], frame: 1.02 },
    { name: "06-control-side", labelKey: "cmf_view_control", direction: [1, 0.06, 0.22], up: [0, 1, 0], frame: 1.02 },
    {
      name: "07-camera-close",
      labelKey: "cmf_view_camera",
      direction: [-0.58, 0.38, -1],
      up: [0, 1, 0],
      targetOffset: [0.22, 0.3, -0.28],
      frame: 0.46,
    },
    {
      name: "08-bottom-usb",
      labelKey: "cmf_view_bottom_usb",
      direction: [0.08, -1, -0.35],
      up: [0, 0, 1],
      targetOffset: [0, -0.46, -0.08],
      frame: 0.36,
    },
    {
      name: "09-top-edge",
      labelKey: "cmf_view_top_edge",
      direction: [0.14, 1, -0.38],
      up: [0, 0, -1],
      targetOffset: [0, 0.46, -0.08],
      frame: 0.38,
    },
  ];

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
  let selectedView = "02-back";
  let selectedPartId = "frame";
  let modelRefreshTimer = 0;
  let modelRequestId = 0;
  let modelAbortController = null;
  let canRenderModel = null;
  let rendererModulesPromise = null;
  let rendererState = null;
  let cameraAnimationFrame = 0;

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
    buildViewControls();
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
      refreshCmfPresetControl();
      saveRecipe({ quiet: true });
      updateInteractiveModel();
      setCmfStatus(t("cmf_preset_applied"));
    });
    cmfEl("cmf-shuffle")?.addEventListener("click", shuffleRecipe);
    cmfEl("cmf-reset")?.addEventListener("click", resetRecipe);
    cmfEl("cmf-reset-view")?.addEventListener("click", resetCmfView);
    cmfEl("cmf-export")?.addEventListener("click", exportUsdz);
    cmfEl("cmf-view-strip")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cmf-view]");
      if (!button) return;
      selectCmfView(button.dataset.cmfView);
    });
    cmfEl("cmf-parts")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cmf-part-row]");
      if (!button) return;
      selectedPartId = button.dataset.cmfPartRow || selectedPartId;
      syncCmfForm();
    });
    cmfEl("cmf-palette")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cmf-color-option]");
      if (!button || button.disabled) return;
      recipe.parts[selectedPartId] = button.dataset.cmfColor;
      cmfEl("cmf-preset") && (cmfEl("cmf-preset").value = "");
      syncCmfForm();
      refreshCmfPresetControl();
      saveRecipe({ quiet: true });
      updateInteractiveModel();
    });
    bindRovingGroup(cmfEl("cmf-parts"), "[data-cmf-part-row]", "vertical");
    bindRovingGroup(cmfEl("cmf-palette"), "[data-cmf-color-option]", "horizontal");
    bindRovingGroup(cmfEl("cmf-view-strip"), "[data-cmf-view]", "horizontal");
  }

  function buildPartControls() {
    const target = cmfEl("cmf-parts");
    const palette = cmfEl("cmf-palette");
    if (!target || !palette || target.dataset.ready === "true") return;
    target.dataset.ready = "true";
    target.replaceChildren(...PARTS.map((part) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "cmf-part-row";
      row.dataset.cmfPartRow = part.id;
      row.setAttribute("role", "option");

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
      const affordance = document.createElement("span");
      affordance.className = "cmf-part-affordance";
      affordance.setAttribute("aria-hidden", "true");
      affordance.textContent = "›";
      row.append(text, current, affordance);
      return row;
    }));
    palette.replaceChildren(...COLORS.map((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cmf-color-chip";
      button.dataset.cmfColorOption = "true";
      button.dataset.cmfColor = color.id;
      button.title = t(color.labelKey);
      button.setAttribute("aria-label", t(color.labelKey));
      const swatch = document.createElement("span");
      swatch.className = "cmf-color-chip-swatch";
      swatch.dataset.cmfColor = color.id;
      const label = document.createElement("span");
      label.textContent = t(color.labelKey);
      button.append(swatch, label);
      return button;
    }));
  }

  function syncCmfForm() {
    const selectedPart = PARTS.find((part) => part.id === selectedPartId) || PARTS[0];
    const selectedColor = colorMeta(recipe.parts[selectedPart.id]);
    const preset = cmfEl("cmf-preset");
    if (preset && document.activeElement !== preset) preset.value = matchingPresetId() || "";
    refreshCmfPresetControl();
    document.querySelectorAll("[data-cmf-part-row]").forEach((button) => {
      const selected = button.dataset.cmfPartRow === selectedPart.id;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[data-cmf-color-option]").forEach((button) => {
      const selected = selectedColor.id === button.dataset.cmfColor;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    updatePartSwatches();
    const summary = cmfEl("cmf-selection-summary");
    if (summary) summary.textContent = `${t(selectedPart.labelKey)} · ${t(selectedColor.labelKey)}`;
  }

  function buildViewControls() {
    const strip = cmfEl("cmf-view-strip");
    if (!strip || strip.dataset.ready === "true") return;
    strip.dataset.ready = "true";
    strip.replaceChildren(...VIEW_DEFINITIONS.map((view) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cmf-view-thumb cmf-view-control";
      button.dataset.cmfView = view.name;
      button.setAttribute("aria-pressed", String(view.name === selectedView));
      button.tabIndex = view.name === selectedView ? 0 : -1;
      const label = document.createElement("span");
      label.textContent = t(view.labelKey);
      button.append(label);
      return button;
    }));
  }

  function matchingPresetId() {
    return Object.entries(PRESETS).find(([, parts]) => (
      PARTS.every((part) => recipe.parts[part.id] === parts[part.id])
    ))?.[0] || "";
  }

  function refreshCmfPresetControl() {
    const preset = cmfEl("cmf-preset");
    if (preset && typeof refreshSystemSelectControl === "function") refreshSystemSelectControl(preset);
  }

  function bindRovingGroup(container, selector, orientation) {
    container?.addEventListener("keydown", (event) => {
      const buttons = [...container.querySelectorAll(selector)].filter((button) => !button.disabled);
      const currentIndex = buttons.indexOf(document.activeElement);
      if (currentIndex < 0) return;
      const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === previousKey) nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      if (event.key === nextKey) nextIndex = (currentIndex + 1) % buttons.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = buttons.length - 1;
      buttons[nextIndex]?.focus();
      buttons[nextIndex]?.click();
    });
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
    selectedView = "02-back";
    selectedPartId = "frame";
    syncCmfForm();
    refreshCmfPresetControl();
    syncViewControls();
    updateInteractiveModel();
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
    updateInteractiveModel();
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
      canRenderModel = Boolean(data.canExport);
      const label = canRenderModel ? t("cmf_cap_ready") : t("cmf_cap_missing");
      const el = cmfEl("cmf-capabilities");
      if (el) el.textContent = label;
      if (cmfEl("cmf-reset-view")) {
        cmfEl("cmf-reset-view").dataset.capabilityDisabled = String(!canRenderModel);
        cmfEl("cmf-reset-view").disabled = !canRenderModel;
      }
      if (cmfEl("cmf-export")) {
        cmfEl("cmf-export").dataset.capabilityDisabled = String(!data.canExport);
        cmfEl("cmf-export").disabled = !data.canExport;
      }
      const empty = cmfEl("cmf-preview-empty");
      if (empty) empty.textContent = canRenderModel ? t("cmf_model_loading") : t("cmf_preview_unavailable");
      if (canRenderModel) scheduleModelRender(0);
    } catch {
      canRenderModel = false;
      const el = cmfEl("cmf-capabilities");
      if (el) el.textContent = t("cmf_cap_missing");
      ["cmf-reset-view", "cmf-export"].forEach((id) => {
        const control = cmfEl(id);
        if (!control) return;
        control.dataset.capabilityDisabled = "true";
        control.disabled = true;
      });
      const empty = cmfEl("cmf-preview-empty");
      if (empty) empty.textContent = t("cmf_preview_unavailable");
    }
  }

  function loadRendererModules() {
    if (!rendererModulesPromise) {
      rendererModulesPromise = import(RENDERER_VENDOR_URL);
    }
    return rendererModulesPromise;
  }

  async function ensureRenderer() {
    if (rendererState) return rendererState;
    const modules = await loadRendererModules();
    const canvas = cmfEl("cmf-model-canvas");
    const viewport = cmfEl("cmf-model-viewport");
    if (!canvas || !viewport) throw new Error(t("cmf_model_surface_missing"));

    const renderer = new modules.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = modules.SRGBColorSpace;
    renderer.toneMapping = modules.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setClearColor(0x000000, 0);

    const scene = new modules.Scene();
    const camera = new modules.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000);
    scene.add(new modules.AmbientLight(0xffffff, 1.5));
    const keyLight = new modules.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(-3, -4, -5);
    scene.add(keyLight);
    const fillLight = new modules.DirectionalLight(0xb9c9ff, 1.7);
    fillLight.position.set(4, 2, 5);
    scene.add(fillLight);

    const controls = new modules.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minZoom = 0.35;
    controls.maxZoom = 8;
    controls.listenToKeyEvents(canvas);

    rendererState = {
      modules,
      renderer,
      scene,
      camera,
      controls,
      viewport,
      canvas,
      model: null,
      bounds: null,
      viewHalfHeight: 1,
      viewIsCustom: false,
    };

    controls.addEventListener("start", () => {
      window.cancelAnimationFrame(cameraAnimationFrame);
      rendererState.viewIsCustom = true;
      syncViewControls();
    });
    controls.addEventListener("change", renderModelFrame);
    const resizeObserver = new ResizeObserver(resizeModelViewport);
    resizeObserver.observe(viewport);
    rendererState.resizeObserver = resizeObserver;
    resizeModelViewport();
    renderer.setAnimationLoop(() => {
      if (canvas.closest(".window")?.classList.contains("is-hidden")) return;
      if (controls.update()) renderModelFrame();
    });
    return rendererState;
  }

  function resizeModelViewport() {
    const state = rendererState;
    if (!state) return;
    const rect = state.viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    state.renderer.setSize(width, height, false);
    updateCameraFrustum(state.viewHalfHeight);
    renderModelFrame();
  }

  function updateCameraFrustum(halfHeight) {
    const state = rendererState;
    if (!state) return;
    const rect = state.viewport.getBoundingClientRect();
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    state.viewHalfHeight = Math.max(halfHeight || state.viewHalfHeight, 0.001);
    state.camera.left = -state.viewHalfHeight * aspect;
    state.camera.right = state.viewHalfHeight * aspect;
    state.camera.top = state.viewHalfHeight;
    state.camera.bottom = -state.viewHalfHeight;
    state.camera.updateProjectionMatrix();
  }

  function renderModelFrame() {
    const state = rendererState;
    if (!state) return;
    state.renderer.render(state.scene, state.camera);
  }

  function updateInteractiveModel() {
    if (applyLiveRecipe()) {
      setModelRefreshing(false);
      setCmfStatus(t("cmf_model_live"));
      return;
    }
    scheduleModelRender(0);
  }

  function applyLiveRecipe(model = rendererState?.model) {
    if (!model) return 0;
    let changedMaterials = 0;
    model.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        const match = String(material.name || "").match(
          /__(frameSide|frame|backGlass|volumeUp|volumeDown|actionOrSim|cameraControl|sideButton|simTray|usbC|screwOrSpeaker|cameraPlate)_[^/]+$/,
        );
        const partId = material.userData?.cmfPart || (match ? MATERIAL_PART_ALIASES[match[1]] : "");
        const color = partId ? colorMeta(recipe.parts[partId]) : null;
        if (!color || !material.color?.set) return;
        material.color.set(color.hex);
        material.needsUpdate = true;
        changedMaterials += 1;
      });
    });
    if (changedMaterials) renderModelFrame();
    return changedMaterials;
  }

  function prepareLiveMaterials(model, globalBounds) {
    const state = rendererState;
    if (!state || !model || !globalBounds) return;
    model.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      sourceMaterials.filter(Boolean).forEach((material) => {
        // Three r184 can expand indexed USD st1 coordinates incorrectly. The
        // affected maps are baked occlusion atlases, so letting WebGL sample
        // them paints unrelated component silhouettes across the enclosure.
        // Keep the real mesh and its color/normal/roughness maps, but omit the
        // invalid supplemental AO instead of displaying corrupt surface data.
        if (material.aoMap && (material.aoMap.channel > 0 || object.geometry?.getAttribute("uv1"))) {
          material.aoMap = null;
          material.aoMapIntensity = 0;
        }
        if (material.transparent) material.depthWrite = false;
        material.needsUpdate = true;
      });
      const namedPart = sourceMaterials
        .map((material) => String(material?.name || "").match(
          /__(frameSide|frame|backGlass|volumeUp|volumeDown|actionOrSim|cameraControl|sideButton|simTray|usbC|screwOrSpeaker|cameraPlate)_[^/]+$/,
        ))
        .find(Boolean);
      const partId = (namedPart ? MATERIAL_PART_ALIASES[namedPart[1]] : "")
        || EXACT_PART_BY_MESH_NAME[object.name]
        || classifyLiveMesh(object, globalBounds);
      if (!partId) return;

      const ownedMaterials = sourceMaterials.map((material) => {
        const owned = material.clone();
        owned.userData = { ...material.userData, cmfPart: partId };
        if (owned.aoMap) {
          owned.aoMap = null;
          owned.aoMapIntensity = 0;
        }
        if (owned.transparent) owned.depthWrite = false;
        return owned;
      });
      object.material = Array.isArray(object.material) ? ownedMaterials : ownedMaterials[0];
    });
  }

  function classifyLiveMesh(object, globalBounds) {
    const state = rendererState;
    if (!state) return "";
    const bounds = new state.modules.Box3().setFromObject(object);
    if (bounds.isEmpty()) return "";
    const size = bounds.getSize(new state.modules.Vector3());
    const center = bounds.getCenter(new state.modules.Vector3());
    const globalSize = globalBounds.getSize(new state.modules.Vector3());
    const leftEdge = globalBounds.min.x + globalSize.x * 0.08;
    const rightEdge = globalBounds.max.x - globalSize.x * 0.08;
    const topEdge = globalBounds.max.y - globalSize.y * 0.22;
    const bottomEdge = globalBounds.min.y + globalSize.y * 0.08;
    const nearSide = center.x < leftEdge || center.x > rightEdge;
    const sideControl = nearSide
      && size.x < globalSize.x * 0.08
      && size.z < globalSize.z * 0.35
      && size.y > globalSize.y * 0.035
      && size.y < globalSize.y * 0.18;
    if (sideControl) return "";

    const bottomPart = center.y < bottomEdge
      && size.z < globalSize.z * 0.35
      && size.y < globalSize.y * 0.06;
    if (bottomPart && size.x > globalSize.x * 0.25) return "usbC";
    if (bottomPart && size.x > globalSize.x * 0.05) return "usbC";

    const backGlass = Math.abs(center.x) < globalSize.x * 0.12
      && center.z < globalBounds.min.z + globalSize.z * 0.38
      && size.x > globalSize.x * 0.72
      && size.y > globalSize.y * 0.75;
    if (backGlass) return "backGlass";

    const sideFrame = nearSide
      && size.y > globalSize.y * 0.45
      && size.z > globalSize.z * 0.45;
    if (sideFrame) return "frame";

    const mainFrame = Math.abs(center.x) < globalSize.x * 0.12
      && size.x > globalSize.x * 0.88
      && size.y > globalSize.y * 0.85
      && size.z > globalSize.z * 0.18;
    if (mainFrame) return "frame";

    const cameraArea = center.y > topEdge
      && center.x > globalBounds.min.x + globalSize.x * 0.45
      && size.x > globalSize.x * 0.12
      && size.y > globalSize.y * 0.08;
    return cameraArea ? "cameraPlate" : "";
  }

  function scheduleModelRender(delay = 0) {
    window.clearTimeout(modelRefreshTimer);
    if (canRenderModel === false) {
      setModelRefreshing(false);
      setCmfStatus(t("cmf_ready"));
      return;
    }
    const requestId = modelRequestId + 1;
    modelRequestId = requestId;
    modelAbortController?.abort();
    modelAbortController = null;
    setModelRefreshing(true);
    setCmfStatus(t("cmf_model_rendering"));
    modelRefreshTimer = window.setTimeout(() => renderInteractiveModel(requestId), delay);
  }

  function cancelModelRender() {
    window.clearTimeout(modelRefreshTimer);
    modelRefreshTimer = 0;
    modelRequestId += 1;
    modelAbortController?.abort();
    modelAbortController = null;
    setModelRefreshing(false);
  }

  async function renderInteractiveModel(requestId) {
    if (requestId !== modelRequestId) return;
    modelAbortController = new AbortController();
    const requestedRecipe = JSON.parse(JSON.stringify(recipe));
    try {
      const [state, response] = await Promise.all([
        ensureRenderer(),
        fetch("/api/cmf/export-usdz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipe: requestedRecipe }),
          signal: modelAbortController.signal,
        }),
      ]);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || response.statusText);
      }
      const buffer = await response.arrayBuffer();
      if (requestId !== modelRequestId) return;

      const nextModel = new state.modules.USDLoader().parse(buffer);
      nextModel.updateMatrixWorld(true);
      const nextBounds = new state.modules.Box3().setFromObject(nextModel);
      if (nextBounds.isEmpty()) {
        disposeModel(nextModel);
        throw new Error(t("cmf_model_empty"));
      }
      if (requestId !== modelRequestId) {
        disposeModel(nextModel);
        return;
      }

      const previousModel = state.model;
      prepareLiveMaterials(nextModel, nextBounds);
      state.scene.add(nextModel);
      state.model = nextModel;
      state.bounds = nextBounds;
      applyLiveRecipe(nextModel);
      if (previousModel) {
        state.scene.remove(previousModel);
        disposeModel(previousModel);
      }
      state.canvas.hidden = false;
      const empty = cmfEl("cmf-preview-empty");
      if (empty) empty.hidden = true;
      if (!previousModel) {
        state.viewIsCustom = false;
        syncViewControls();
        applyCmfView(selectedView, { animate: false });
      } else {
        renderModelFrame();
      }
      setCmfStatus(t("cmf_model_done"));
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (requestId === modelRequestId) {
        setCmfStatus(`${t("cmf_model_failed")} ${error.message}`);
        if (!rendererState?.model) {
          const empty = cmfEl("cmf-preview-empty");
          if (empty) {
            empty.hidden = false;
            empty.textContent = t("cmf_model_failed");
          }
        }
        playSystemSound?.("alert");
      }
    } finally {
      if (requestId === modelRequestId) {
        modelAbortController = null;
        setModelRefreshing(false);
      }
    }
  }

  function disposeModel(model) {
    model?.traverse((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        Object.values(material).forEach((value) => value?.isTexture && value.dispose());
        material.dispose?.();
      });
    });
  }

  function selectCmfView(name) {
    if (!VIEW_DEFINITIONS.some((view) => view.name === name)) return;
    selectedView = name;
    if (rendererState) rendererState.viewIsCustom = false;
    syncViewControls();
    applyCmfView(name, { animate: true });
  }

  function resetCmfView() {
    if (!selectedView) selectedView = "02-back";
    if (rendererState) rendererState.viewIsCustom = false;
    syncViewControls();
    applyCmfView(selectedView, { animate: true });
  }

  function syncViewControls() {
    document.querySelectorAll("[data-cmf-view]").forEach((button) => {
      const selected = !rendererState?.viewIsCustom && button.dataset.cmfView === selectedView;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = button.dataset.cmfView === selectedView ? 0 : -1;
    });
  }

  function applyCmfView(name, options = {}) {
    const state = rendererState;
    const view = VIEW_DEFINITIONS.find((item) => item.name === name);
    if (!state?.model || !state.bounds || !view) return;

    const { Vector3 } = state.modules;
    const center = state.bounds.getCenter(new Vector3());
    const size = state.bounds.getSize(new Vector3());
    const targetOffset = view.targetOffset || [0, 0, 0];
    const target = center.clone().add(new Vector3(
      targetOffset[0] * size.x,
      targetOffset[1] * size.y,
      targetOffset[2] * size.z,
    ));
    const direction = new Vector3(...view.direction).normalize();
    const up = new Vector3(...view.up).normalize();
    const right = new Vector3().crossVectors(up, direction).normalize();
    const trueUp = new Vector3().crossVectors(direction, right).normalize();
    const rect = state.viewport.getBoundingClientRect();
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    let halfWidth = 0;
    let halfHeight = 0;
    for (const x of [state.bounds.min.x, state.bounds.max.x]) {
      for (const y of [state.bounds.min.y, state.bounds.max.y]) {
        for (const z of [state.bounds.min.z, state.bounds.max.z]) {
          const local = new Vector3(x, y, z).sub(target);
          halfWidth = Math.max(halfWidth, Math.abs(local.dot(right)));
          halfHeight = Math.max(halfHeight, Math.abs(local.dot(trueUp)));
        }
      }
    }
    const nextHalfHeight = Math.max(halfHeight, halfWidth / aspect) * 1.14 * view.frame;
    const distance = Math.max(size.length() * 2.6, 1);
    const position = target.clone().add(direction.multiplyScalar(distance));
    const animate = options.animate !== false && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animateCameraTo(position, target, up, nextHalfHeight, animate);
  }

  function animateCameraTo(position, target, up, halfHeight, animate) {
    const state = rendererState;
    if (!state) return;
    window.cancelAnimationFrame(cameraAnimationFrame);
    const startPosition = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const startUp = state.camera.up.clone();
    const startHalfHeight = state.viewHalfHeight;
    const startZoom = state.camera.zoom;
    const startedAt = performance.now();
    const duration = animate ? 360 : 0;

    const step = (now) => {
      const progress = duration ? Math.min((now - startedAt) / duration, 1) : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      state.camera.position.lerpVectors(startPosition, position, eased);
      state.controls.target.lerpVectors(startTarget, target, eased);
      state.camera.up.lerpVectors(startUp, up, eased).normalize();
      state.camera.zoom = startZoom + (1 - startZoom) * eased;
      updateCameraFrustum(startHalfHeight + (halfHeight - startHalfHeight) * eased);
      state.camera.lookAt(state.controls.target);
      state.camera.updateMatrixWorld();
      state.controls.update();
      renderModelFrame();
      if (progress < 1) cameraAnimationFrame = window.requestAnimationFrame(step);
    };
    cameraAnimationFrame = window.requestAnimationFrame(step);
  }

  function setModelRefreshing(refreshing) {
    const panel = document.querySelector(".cmf-preview-panel");
    panel?.classList.toggle("is-refreshing", refreshing);
    panel?.setAttribute("aria-busy", String(refreshing));
    const indicator = cmfEl("cmf-live-indicator");
    if (indicator) {
      indicator.dataset.state = refreshing ? "loading" : "ready";
      indicator.textContent = t(refreshing ? "cmf_model_updating" : "cmf_model_interactive");
    }
  }

  async function exportUsdz() {
    setBusy(true, t("cmf_exporting"));
    setCmfControlLoading("cmf-export", true, t("cmf_exporting"));
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
      setCmfControlLoading("cmf-export", false);
      setBusy(false);
    }
  }

  function setCmfControlLoading(id, loading, label = "") {
    const control = cmfEl(id);
    if (!control) return;
    if (typeof setControlLoading === "function") {
      setControlLoading(control, loading, label);
      return;
    }
    control.toggleAttribute("aria-busy", loading);
    control.dataset.loading = String(loading);
    if (label) control.dataset.loadingLabel = label;
  }

  function setBusy(busy, message = "") {
    ["cmf-shuffle", "cmf-reset", "cmf-reset-view", "cmf-export"].forEach((id) => {
      const button = cmfEl(id);
      if (button) button.disabled = busy || button.dataset.capabilityDisabled === "true";
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
  window.AISystem6CMFStudio = Object.freeze({
    runMenuCommand(command) {
      const commands = {
        save: () => saveRecipe(),
        export: exportUsdz,
        shuffle: shuffleRecipe,
        reset: resetRecipe,
        "reset-view": resetCmfView,
        "view-front": () => selectCmfView("01-front"),
        "view-back": () => selectCmfView("02-back"),
        "view-side": () => selectCmfView("05-buttons-side"),
      };
      return commands[command]?.();
    },
  });
})();
