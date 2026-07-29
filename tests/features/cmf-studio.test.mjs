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
test.assertIncludes(app, 'loadClassicScriptOnce("app/features/cmf-studio.js?cmf=exterior-ao-sanitized")', "classic script is loaded once with the repaired material cache identity");
test.assertNotIncludes(cmfStudio, "\nimport ", "feature module is not an ES module");
test.assertNotIncludes(cmfStudio, "\nexport ", "feature module is not an ES module");

// --- recipe/state model ---
test.assertIncludes(cmfStudio, 'model: "iphone-17-standard"', "v1 model is iPhone 17 standard");
test.assertIncludes(cmfStudio, "volumeUp", "recipe covers volume up");
test.assertIncludes(cmfStudio, "volumeDown", "recipe covers volume down");
test.assertIncludes(cmfStudio, "actionButton", "recipe covers action button");
test.assertIncludes(cmfStudio, "cameraControl", "recipe covers camera control");
test.assertIncludes(cmfStudio, "sideButton", "recipe covers side button");
test.assertIncludes(cmfStudio, "simTray", "recipe covers SIM tray");
test.assertIncludes(cmfStudio, "usbC", "recipe covers USB-C / bottom hardware");
test.assertIncludes(cmfStudio, "cameraPlate", "recipe covers camera area");
test.assertIncludes(cmfStudio, "black17", "official black finish exists");
test.assertIncludes(cmfStudio, "lavender17", "official lavender finish exists");
test.assertIncludes(cmfStudio, "mistBlue17", "official mist blue finish exists");
test.assertIncludes(cmfStudio, "sage17", "official sage finish exists");
test.assertIncludes(cmfStudio, "white17", "official white finish exists");
test.assertIncludes(cmfStudio, "recipe.parts.volumeUp = colors[0]", "shuffle assigns volume up from a unique color slot");
test.assertIncludes(cmfStudio, "recipe.parts.volumeDown = colors[1]", "shuffle assigns volume down from a unique color slot");
test.assertIncludes(cmfStudio, "recipe.parts.actionButton = colors[2]", "shuffle assigns action button from a unique color slot");
test.assertIncludes(cmfStudio, "recipe.parts.cameraControl = colors[3]", "shuffle assigns camera control from a unique color slot");
test.assertIncludes(cmfStudio, "recipe.parts.sideButton = colors[4]", "shuffle assigns side button from a unique color slot");
test.assertIncludes(cmfStudio, "localStorage.setItem(STORAGE_KEY", "recipe is saved locally");

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
test.assertIncludes(service, "exactPartByMeshName", "engine keeps semantic mesh-to-part mapping");
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

test.finish();
