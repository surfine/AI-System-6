// CMF Studio is a summoned product-color workbench. It stays lazy-loaded,
// drives one recolored USDZ through an interactive WebGL model surface, and
// keeps fixed view commands as camera transitions rather than static images.

import { createFeatureTest, read, readAppSurface, exists } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("cmf-studio");
const index = read("index.html");
const appJs = read("app.js");
const cmfStudio = read("app/features/cmf-studio.js");
const styles = read("styles/86-cmf-studio.css");
const manifest = read("scripts/runtime-manifest.mjs");
const styleManifest = read("scripts/style-manifest.mjs");
const router = read("src/server/router.js");
const service = read("src/server/cmf/service.js");
const exportRoute = read("src/server/routes/cmf-export-usdz.js");
const renderRoute = read("src/server/routes/cmf-render-views.js");
const previewRoute = read("src/server/routes/cmf-render-preview.js");
const capabilitiesRoute = read("src/server/routes/cmf-capabilities.js");
const packageJson = read("package.json");
const rendererBuild = read("scripts/build-cmf-renderer-vendor.mjs");
const rendererEntry = read("scripts/vendor/cmf-renderer-entry.mjs");
const app = readAppSurface([
  "app/core/config.js",
  "app/core/actions.js",
  "app/core/multi-finder.js",
  "app/core/window-manager.js",
  "app/core/system-icons.js",
]);
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- app registration and lazy loading ---
test.assertIncludes(index, 'data-window="cmfStudio"', "CMF Studio window exists");
test.assertIncludes(index, 'data-action="open-cmf-studio"', "Applications markup has a launcher");
test.assertIncludes(appJs, 'action: "open-cmf-studio"', "Applications folder dynamic list includes CMF Studio");
test.assertIncludes(app, 'cmfStudio: "CMF Studio"', "MultiFinder labels the app");
test.assertIncludes(app, 'cmfStudio: "cmfStudio"', "window maps to its own app id");
test.assertIncludes(app, '"open-cmf-studio": () => openWindow("cmfStudio")', "action opens the window");
test.assertIncludes(manifest, '"app/features/cmf-studio.js"', "feature is registered as a lazy runtime path");
const lazyBlock = manifest.slice(manifest.indexOf("lazyRuntimePaths"));
test.assertIncludes(lazyBlock, "app/features/cmf-studio.js", "feature sits in lazyRuntimePaths");
test.assertIncludes(app, "ensureCmfStudioModule", "openWindow loads CMF on demand");
test.assertIncludes(app, 'createLazyModuleLoader("AISystem6CMFStudioLoaded", ["app/features/cmf-studio.js?cmf=exterior-ao-sanitized"])', "classic script is loaded once with the repaired material cache identity");
test.assertNotIncludes(cmfStudio, "\nimport ", "feature module is not an ES module");
test.assertNotIncludes(cmfStudio, "\nexport ", "feature module is not an ES module");

// --- recipe/state model ---
test.assertIncludes(cmfStudio, 'id: "iphone-17-standard"', "iPhone 17 standard is a registered model");
test.assertIncludes(cmfStudio, "volumeUp", "recipe covers volume up");
test.assertIncludes(cmfStudio, "volumeDown", "recipe covers volume down");
test.assertIncludes(cmfStudio, "actionButton", "recipe covers action button");
test.assertIncludes(cmfStudio, "cameraControl", "recipe covers camera control");
test.assertIncludes(cmfStudio, "sideButton", "recipe covers side button");
test.assertIncludes(cmfStudio, "simTray", "recipe covers SIM tray");
test.assertIncludes(cmfStudio, "usbC", "recipe covers USB-C / bottom hardware");
// No camera-area part on any iPhone: Apple's own product shots show the
// plateau and the lens rings in the body anodising, and no colorway parts them
// out, so those meshes follow the frame through the shared pass instead.
test.assertNotIncludes(cmfStudio, 'labelKey: "cmf_part_camera_plate"', "no phone offers a separately coloured camera area");
test.assertNotIncludes(cmfStudio, 'labelKey: "cmf_part_camera_rings"', "no phone offers separately coloured lens rings");
test.assertNotIncludes(service, "cameraPlate:", "no model defaults a camera-area finish");
test.assertIncludes(cmfStudio, "black17", "official black finish exists");
test.assertIncludes(cmfStudio, "lavender17", "official lavender finish exists");
test.assertIncludes(cmfStudio, "mistBlue17", "official mist blue finish exists");
test.assertIncludes(cmfStudio, "sage17", "official sage finish exists");
test.assertIncludes(cmfStudio, "white17", "official white finish exists");
test.assertIncludes(cmfStudio, "bag = shuffleArray(activeColors()", "shuffle draws from the active model's palette without repeating a color early");
test.assertIncludes(cmfStudio, "localStorage.setItem(STORAGE_KEY", "recipe is saved locally");

// --- multiple models, each with only that device's official finishes ---
test.assertIncludes(cmfStudio, 'id: "iphone-17-pro"', "iPhone 17 Pro is a registered model");
test.assertIncludes(cmfStudio, 'id: "iphone-17-pro-max"', "iPhone 17 Pro Max is a registered model");
test.assertIncludes(cmfStudio, "cosmicOrange17Pro", "Pro line offers the official Cosmic Orange finish");
test.assertIncludes(cmfStudio, "deepBlue17Pro", "Pro line offers the official Deep Blue finish");
test.assertIncludes(cmfStudio, "silver17Pro", "Pro line offers the official Silver finish");
test.assertNotIncludes(
  cmfStudio.slice(cmfStudio.indexOf("IPHONE_17_PRO_COLORS"), cmfStudio.indexOf("IPHONE_17_PARTS")),
  "sage17",
  "the Pro palette never borrows a finish from another device",
);
test.assertIncludes(cmfStudio, 'id: "iphone-air"', "iPhone Air is a registered model");
test.assertIncludes(cmfStudio, "spaceBlackAir", "Air offers the official Space Black finish");
test.assertIncludes(cmfStudio, "cloudWhiteAir", "Air offers the official Cloud White finish");
test.assertIncludes(cmfStudio, "lightGoldAir", "Air offers the official Light Gold finish");
test.assertIncludes(cmfStudio, "skyBlueAir", "Air offers the official Sky Blue finish");
test.assertNotIncludes(
  cmfStudio.slice(cmfStudio.indexOf("IPHONE_AIR_COLORS"), cmfStudio.indexOf("IPHONE_17_PARTS")),
  "17Pro",
  "the Air palette never borrows a finish from another device",
);
test.assertIncludes(cmfStudio, 'id: "iphone-17e"', "iPhone 17e is a registered model");
test.assertIncludes(cmfStudio, "black17e", "17e offers the official Black finish");
test.assertIncludes(cmfStudio, "white17e", "17e offers the official White finish");
test.assertIncludes(cmfStudio, "softPink17e", "17e offers the official Soft Pink finish");
test.assertIncludes(
  cmfStudio,
  'part.id !== "simTray" && part.id !== "cameraControl"',
  "the 17e exposes neither a SIM tray nor a Camera Control part, because it has neither",
);
test.assertIncludes(
  cmfStudio,
  "rendererState.modelId !== recipe.model || rendererState.poseId !== (recipe.pose || \"closed\")",
  "a device (or pose) is never repainted in another device's finishes when its own model failed to load",
);
test.assertIncludes(cmfStudio, 'id: "macbook-neo"', "MacBook Neo is a registered model");
test.assertIncludes(cmfStudio, "silverNeo", "MacBook Neo offers the official Silver finish");
test.assertIncludes(cmfStudio, "blushNeo", "MacBook Neo offers the official Blush finish");
test.assertIncludes(cmfStudio, "citrusNeo", "MacBook Neo offers the official Citrus finish");
test.assertIncludes(cmfStudio, "indigoNeo", "MacBook Neo offers the official Indigo finish");
test.assertIncludes(cmfStudio, '{ id: "closed", labelKey: "cmf_pose_closed" }', "MacBook Neo ships in a Closed pose");
test.assertIncludes(cmfStudio, '{ id: "open", labelKey: "cmf_pose_open" }', "MacBook Neo ships in an Open pose");
test.assertIncludes(cmfStudio, 'id: "lid"', "the lid is a MacBook Neo part (Apple self-service part)");
test.assertIncludes(cmfStudio, 'id: "topCase"', "the keyboard deck is a MacBook Neo part");
test.assertIncludes(cmfStudio, 'id: "bottomCase"', "the bottom case is a MacBook Neo part");
test.assertIncludes(cmfStudio, 'id: "keycaps"', "the keycaps are a MacBook Neo part");
test.assertIncludes(cmfStudio, "const MACBOOK_NEO_VIEWS = {", "the MacBook defines per-pose camera sets");
test.assertIncludes(cmfStudio, 'views: MACBOOK_NEO_VIEWS', "the MacBook model registers both camera sets");
test.assertIncludes(cmfStudio, "function selectCmfPose", "switching poses is an explicit command");
test.assertIncludes(cmfStudio, "state.poseId = requestedRecipe.pose || \"closed\"", "the loaded pose is tracked for repaint guards");
test.assertIncludes(cmfStudio, 'spec.poses.some((entry) => entry.id === saved.pose)', "a saved recipe cannot carry another pose's geometry across");
test.assertIncludes(index, 'id="cmf-pose"', "a pose chooser exists for posed models");
test.assertIncludes(index, '<label class="cmf-control cmf-control-pose" id="cmf-pose-control" hidden>', "the pose chooser is hidden until a posed model is selected");
// Every finish the picker offers must be drawable, or the chips all fall back
// to one colour and the user cannot tell the finishes apart.
for (const color of [
  "black17", "lavender17", "mistBlue17", "sage17", "white17",
  "cosmicOrange17Pro", "deepBlue17Pro", "silver17Pro",
  "spaceBlackAir", "cloudWhiteAir", "lightGoldAir", "skyBlueAir",
  "black17e", "white17e", "softPink17e",
  "silverNeo", "blushNeo", "citrusNeo", "indigoNeo",
]) {
  test.assertIncludes(styles, `[data-cmf-color="${color}"]`, `the ${color} chip has a swatch colour`);
}
test.assertIncludes(
  styles,
  ".cmf-control[hidden]",
  "a hidden toolbar control gives up its column instead of leaving an orphan label",
);
test.assertIncludes(
  styles,
  ".cmf-setup-panel {\n    min-height: auto;",
  "narrow containers keep the toolbar row tall enough for wrapped controls",
);
test.assertIncludes(
  styles,
  "flex: 1 1 31%;",
  "phone toolbars share one chooser line that never wraps mid-group",
);
test.assertIncludes(index, 'id="cmf-model"', "a model chooser exists");
test.assertIncludes(index, '<span class="select-wrap"><select id="cmf-model">', "the model chooser uses the System 6 select harness");
test.assertIncludes(cmfStudio, "function selectCmfModel", "switching models is an explicit command");
test.assertIncludes(cmfStudio, "scheduleModelRender(0);\n    setCmfStatus(t(\"cmf_model_switched\"))", "switching models rebuilds the geometry instead of recoloring the old device");
test.assertIncludes(cmfStudio, "if (spec.colors.some((entry) => entry.id === color)) parts[part.id] = color", "a saved recipe cannot carry another model's finish across");
test.assertIncludes(cmfStudio, "store.recipes[recipe.model] = recipe", "each model keeps its own saved recipe");
test.assertNotIncludes(
  cmfStudio.slice(cmfStudio.indexOf("IPHONE_17_PRO_PARTS")),
  'IPHONE_17_PRO_PARTS = [\n    { id: "simTray"',
  "the eSIM Pro asset exposes no SIM tray part",
);

// --- server APIs and real USDZ path ---
test.assertIncludes(router, '"GET /api/cmf/capabilities"', "capabilities route is registered");
test.assertIncludes(router, '"POST /api/cmf/export-usdz"', "USDZ export route is registered");
test.assertIncludes(router, '"POST /api/cmf/render-views"', "view render route is registered");
test.assertIncludes(router, '"POST /api/cmf/render-preview"', "single-view preview route is registered");
test.assertIncludes(capabilitiesRoute, "getCapabilities", "capabilities route uses the CMF service");
test.assertIncludes(exportRoute, "model/vnd.usdz+zip", "export route returns a USDZ MIME type");
test.assertIncludes(exportRoute, "Content-Disposition", "export route downloads a file");
test.assertIncludes(renderRoute, "renderRecipeViews", "render route uses the CMF render service");
test.assertIncludes(previewRoute, "renderRecipePreview", "preview route renders one current view");
test.assertIncludes(service, "exactMeshParts", "engine keeps semantic mesh-to-part mapping");
test.assertIncludes(service, "const MODELS = Object.freeze({", "engine drives every device from one model registry");
test.assertIncludes(service, '"iphone-17-pro-max"', "engine can recolor the iPhone 17 Pro Max");
test.assertIncludes(service, '"iphone-air"', "engine can recolor the iPhone Air");
test.assertIncludes(service, '"macbook-neo"', "engine can recolor the MacBook Neo");
test.assertIncludes(service, "poses:", "the MacBook Neo ships one asset per pose");
test.assertIncludes(service, '"macbook-neo-closed.usdz"', "the closed pose asset is registered");
test.assertIncludes(service, '"macbook-neo-open.usdz"', "the open pose asset is registered");
test.assertIncludes(service, "MACBOOK_NEO_VIEWS[pose]", "per-pose camera sets exist for the MacBook");
test.assertIncludes(service, "model.exactOnly ? \"\" : classifyPart", "the phone-tuned geometric classifier is disabled for exact-only models");
test.assertIncludes(service, "lid:", "the MacBook part map covers the lid");
test.assertIncludes(service, "topCase:", "the MacBook part map covers the keyboard deck");
test.assertIncludes(service, "bottomCase:", "the MacBook part map covers the bottom case");
test.assertIncludes(service, "keycaps:", "the MacBook part map covers the keycaps");
test.assertIncludes(service, "usbC:", "the MacBook part map covers the USB-C boards");
test.assertIncludes(service, "`Unsupported CMF color '${rawColor}' for ${rawPart} on ${modelId}`", "a finish from another device is rejected, not silently swapped");
test.assertIncludes(service, "targetFraction", "close-up views frame against each device's own size");
// Apple authors the surfaces that are black on the real product — lens glass
// and rings, display bezels, antenna lines — as true black. A colorway never
// paints those, and both the export and the live viewport must agree.
test.assertIncludes(service, "function isFinishSurface", "the engine refuses to recolor black trim");
test.assertIncludes(service, "BLACK_TRIM_LUMINANCE", "only the dark end is excluded, so bright finishes are still recolorable");
test.assertNotIncludes(
  service.slice(service.indexOf("function isFinishSurface"), service.indexOf("function isProductColor")),
  "isProductColor(",
  "the trim test does not reuse the shared pass's upper bound, which dropped the Neo's keycaps",
);
test.assertIncludes(cmfStudio, '{ id: "trackpad", labelKey: "cmf_part_trackpad" }', "the trackpad is its own MacBook Neo part");
test.assertIncludes(service, 'TJrncXRMBNoKueV: "trackpad"', "the trackpad surface is mapped, not the black recess around it");
test.assertIncludes(service, "if (!isFinishSurface(materialBlocks, originalName)) continue;", "black trim is skipped before a part clone is bound");
test.assertIncludes(cmfStudio, "function isBlackTrim", "the live viewport knows black trim is not a finish surface");
// A lit display is emissive over a black dielectric; at grazing angles that
// Fresnel term veils the picture in grey under studio lighting.
test.assertIncludes(cmfStudio, "SCREEN_SPECULAR_INTENSITY", "a lit display damps its dielectric specular so the picture survives off-axis");
test.assertIncludes(cmfStudio, "material.emissiveMap && \"specularIntensity\" in material", "the damping targets the display, not every surface");
test.assertIncludes(cmfStudio, "sourceMaterials.some(isBlackTrim)", "live recoloring skips black trim, matching the export");
// The Neo's parts must own the surface their name promises: the key field is
// the keycaps part, and the unibody shell that carries the palm rest is the
// top case. Both were mapped to the wrong surface once already.
test.assertIncludes(service, 'AqcQCwqkepkmIxJ: "keycaps"', "the key field itself is what the keycaps finish paints");
test.assertIncludes(service, 'IYjUsjnVPLevabB: "topCase"', "the unibody shell carrying the palm rest is the top case");
test.assertNotIncludes(service, 'ldFDBmejSXToUkP: "keycaps"', "the invisible hinge strips are not sold as keycaps");
test.assertIncludes(service, 'UDjFocEFPMTxxzE: "keycaps"', "Touch ID is a key, so it wears the keycap finish, not the port finish");
test.assertNotIncludes(service, 'UDjFocEFPMTxxzE: "usbC"', "Touch ID is not grouped with the USB-C boards");
test.assertIncludes(service, "actionButton", "engine maps UI action button naming to USD part naming");
test.assertIncludes(service, "usdcat", "engine rewrites USD layers, not CSS filters");
test.assertIncludes(service, "usdzip", "engine repackages final USDZ");
test.assertIncludes(service, "SCNRenderer", "view renderer uses SceneKit for Quick Look-style PNGs");
test.assertIncludes(service, "canRenderViews: canExport", "software rendering remains available when Swift is absent");
test.assertIncludes(service, 'renderBackend: byName.swift.available ? "scenekit+software" : "software"', "capabilities report the active render backend");
test.assertIncludes(service, "up: [0, 0, -1]", "software preview keeps the phone top upright");
test.assertIncludes(service, "const suppliedParts = new Set()", "engine tracks which hidden material groups were explicitly supplied");
test.assertIncludes(service, 'if (!suppliedParts.has("frameSide")) parts.frameSide = parts.frame', "side frame follows the public frame color by default");
test.assertIncludes(service, 'if (!suppliedParts.has("screwOrSpeaker")) parts.screwOrSpeaker = parts.usbC', "bottom screws and speaker holes follow the public USB-C color by default");
test.assertIncludes(service, '"03-rear-hero"', "view set includes a rear hero angle");
test.assertIncludes(service, '"08-bottom-usb"', "view set includes a bottom USB-C detail angle");
test.assertIncludes(service, "bottomUsbPosition = vector(center.x + distance * 0.08, center.y - distance * 0.28, center.z - distance)", "SceneKit USB-C detail camera looks from the back/bottom side");
test.assertIncludes(service, '"09-top-edge"', "view set includes a top edge detail angle");
test.assert(exists("assets/cmf/iphone-17-standard.usdz"), "source iPhone 17 USDZ asset is bundled in assets/cmf");
test.assert(exists("assets/cmf/iphone-17-pro.usdz"), "source iPhone 17 Pro USDZ asset is bundled in assets/cmf");
test.assert(exists("assets/cmf/iphone-17-pro-max.usdz"), "source iPhone 17 Pro Max USDZ asset is bundled in assets/cmf");
test.assert(exists("assets/cmf/iphone-air.usdz"), "source iPhone Air USDZ asset is bundled in assets/cmf");
test.assert(exists("assets/cmf/iphone-17e.usdz"), "source iPhone 17e USDZ asset is bundled in assets/cmf");
test.assert(exists("assets/cmf/macbook-neo-closed.usdz"), "MacBook Neo closed-pose USDZ asset is bundled in assets/cmf");
test.assert(exists("assets/cmf/macbook-neo-open.usdz"), "MacBook Neo open-pose USDZ asset is bundled in assets/cmf");
test.assert(exists("scripts/cmf-prepare-model.mjs"), "model assets are reproducible from a recorded source, not hand-made");
test.assertIncludes(read("scripts/cmf-prepare-model.mjs"), "expectMm", "the prepare step proves each split asset against Apple's published dimensions");
// 2026-era Apple assets author the display on a MaterialX branch that three.js
// cannot read, which made those screens load as blank white slabs.
const prepare = read("scripts/cmf-prepare-model.mjs");
test.assertIncludes(prepare, "function dropMaterialXSurface", "the prepare step strips the MaterialX branch that blanks a display");
test.assertIncludes(prepare, 'screenMaterial: "pSGTSQGfFSwWLdT"', "the 17e display material is named so its wallpaper survives");
test.assertIncludes(prepare, 'screenMaterial: "hXtiMyeKExVbRFQ"', "the MacBook Neo display material is named so its wallpaper survives");
test.assertIncludes(prepare, "function referencedTextures", "only textures the layer still points at are packaged");

// --- interactive browser USDZ path ---
test.assertIncludes(packageJson, '"three": "^0.184.0"', "the browser renderer uses the pinned Three.js USD implementation");
test.assertIncludes(packageJson, "build:cmf-renderer-vendor", "the renderer is built as a lazy browser vendor module");
test.assertIncludes(rendererBuild, 'outfile: path.join(outputDir, "cmf-renderer.js")', "renderer build owns a stable app URL");
test.assertIncludes(rendererEntry, '"three/addons/loaders/USDLoader.js"', "vendor entry parses USD, USDA, USDC, and USDZ");
test.assertIncludes(rendererEntry, '"three/addons/controls/OrbitControls.js"', "vendor entry supplies direct orbit, zoom, and pan controls");
test.assert(exists("app/vendor/cmf-renderer.js"), "the built interactive renderer exists");
test.assertIncludes(cmfStudio, "import(RENDERER_VENDOR_URL)", "the heavy renderer stays lazy until CMF opens");
test.assertIncludes(cmfStudio, "uv-channel-cache", "the repaired renderer URL invalidates stale browser caches");
test.assertIncludes(cmfStudio, "new state.modules.USDLoader().parse(buffer)", "the browser parses the current real USDZ");
test.assertIncludes(cmfStudio, "new modules.OrbitControls(camera, canvas)", "the model supports free pointer and wheel inspection");
test.assertIncludes(cmfStudio, "animateCameraTo", "named views animate the live camera instead of replacing an image");
test.assertIncludes(cmfStudio, "prepareLiveMaterials(nextModel, nextBounds)", "loaded USDZ meshes receive part-level live material ownership");
test.assertIncludes(cmfStudio, "material.userData?.cmfPart", "finish changes target semantic parts in the loaded model");
test.assertIncludes(cmfStudio, "material.color.set(color.hex)", "finish changes recolor the real model without waiting for another package");
test.assertIncludes(
  rendererBuild,
  "filePath + ':uv' + uvChannel",
  "CMF renderer caches USD textures separately for every UV channel",
);
test.assertIncludes(cmfStudio, 'object.geometry?.getAttribute("uv1")', "secondary-UV baked AO is identified even when the loader loses its texture channel");
test.assertIncludes(cmfStudio, "material.aoMap = null", "corrupt secondary-UV AO atlases cannot paint component silhouettes over the enclosure");
test.assertIncludes(cmfStudio, "owned.aoMap = null", "every user-configurable exterior part rejects the broken baked AO atlas");
test.assertIncludes(cmfStudio, "material.depthWrite = false", "transparent USD layers do not punch hard holes into surfaces behind them");
test.assertIncludes(cmfStudio, "state.scene.add(nextModel)", "a completed model is installed before the prior model is removed");
test.assertIncludes(cmfStudio, "const previousModel = state.model", "failed updates can preserve the last working model");
test.assertNotIncludes(cmfStudio, '"/api/cmf/render-views"', "the front end no longer asks for static SceneKit PNG views");
test.assertNotIncludes(cmfStudio, '"/api/cmf/render-preview"', "the front end no longer asks for a simplified software preview");

// --- UI and CSS boundaries ---
test.assertIncludes(index, 'id="cmf-model-canvas"', "interactive model canvas exists");
test.assertNotIncludes(index, 'id="cmf-preview-image"', "static preview image was removed");
test.assertNotIncludes(index, 'id="cmf-preview-fallback"', "schematic fallback was removed");
test.assertIncludes(index, 'id="cmf-parts"', "part controls target exists");
test.assertIncludes(index, 'id="cmf-reset-view"', "view reset control exists");
test.assertIncludes(index, 'id="cmf-export"', "export USDZ button exists");
test.assertIncludes(index, 'data-i18n="cmf_reset_view_short"', "phone view control has a short localized visible label");
test.assertIncludes(index, 'data-i18n="cmf_export_short"', "phone export control has a short localized visible label");
test.assertIncludes(cmfStudio, "updateInteractiveModel", "color changes update the loaded USDZ model immediately");
test.assertIncludes(cmfStudio, '"/api/cmf/export-usdz"', "front end exports through server USDZ API");
test.assertIncludes(cmfStudio, "cmf-color-chip", "part colors use stable inline swatch buttons");
test.assertNotIncludes(cmfStudio, 'document.createElement("select")', "part colors avoid native select dropdowns");
test.assertNotIncludes(cmfStudio, "filter:", "front end does not rely on CSS filters for recoloring");
test.assertIncludes(styles, "touch-action: none", "the model canvas owns direct touch orbit gestures");
test.assertIncludes(styleManifest, '"styles/86-cmf-studio.css"', "CMF stylesheet is in the style manifest");
test.assertNotIncludes(styles, "!important", "CMF stylesheet adds no !important overrides");

// --- bilingual strings ---
test.assertIncludes(en, "cmf_studio_label:", "English CMF strings exist");
test.assertIncludes(zh, "cmf_studio_label:", "Chinese CMF strings exist");
test.assertIncludes(zh, "配色工作台", "Chinese label is present");
test.assertIncludes(en, 'cmf_model_interactive: "Interactive USDZ"', "English interactive-model label is present");
test.assertIncludes(zh, 'cmf_model_interactive: "交互式 USDZ"', "Chinese interactive-model label is present");
test.assertIncludes(en, "cmf_model_live:", "English live-material status is present");
test.assertIncludes(zh, "cmf_model_live:", "Chinese live-material status is present");
for (const key of [
  "cmf_model_iphone_17_pro",
  "cmf_model_iphone_17_pro_max",
  "cmf_model_switched",
  "cmf_color_cosmic_orange17pro",
  "cmf_color_deep_blue17pro",
  "cmf_color_silver17pro",
  "cmf_preset_orange_index",
  "cmf_preset_deep_blue_margin",
  "cmf_preset_silver_proof",
  "cmf_model_iphone_air",
  "cmf_color_space_black_air",
  "cmf_color_cloud_white_air",
  "cmf_color_light_gold_air",
  "cmf_color_sky_blue_air",
  "cmf_preset_cloud_binding",
  "cmf_preset_gold_caption",
  "cmf_preset_sky_typeset",
  "cmf_model_macbook_neo",
  "cmf_pose",
  "cmf_pose_closed",
  "cmf_pose_open",
  "cmf_part_lid",
  "cmf_part_top_case",
  "cmf_part_bottom_case",
  "cmf_part_keycaps",
  "cmf_color_silver_neo",
  "cmf_color_blush_neo",
  "cmf_color_citrus_neo",
  "cmf_color_indigo_neo",
  "cmf_preset_blush_lid",
  "cmf_preset_indigo_deck",
  "cmf_preset_citrus_keys",
  "cmf_view_lid_top",
  "cmf_view_hero_open",
  "cmf_view_keyboard_close",
]) {
  test.assertIncludes(en, `${key}:`, `English string exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese string exists for ${key}`);
}

test.finish();
