// CMF Studio is a summoned product-color workbench. It stays lazy-loaded,
// drives USDZ exports through the server, and keeps Quick Look-style PNG views
// as the first preview path instead of a browser filter.

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
test.assertIncludes(app, 'loadClassicScriptOnce("app/features/cmf-studio.js")', "classic script is loaded once");
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
test.assertIncludes(service, "up: [0, 0, -1]", "software preview keeps the phone top upright");
test.assertIncludes(service, "const suppliedParts = new Set()", "engine tracks which hidden material groups were explicitly supplied");
test.assertIncludes(service, 'if (!suppliedParts.has("frameSide")) parts.frameSide = parts.frame', "side frame follows the public frame color by default");
test.assertIncludes(service, 'if (!suppliedParts.has("screwOrSpeaker")) parts.screwOrSpeaker = parts.usbC', "bottom screws and speaker holes follow the public USB-C color by default");
test.assertIncludes(service, '"03-rear-hero"', "view set includes a rear hero angle");
test.assertIncludes(service, '"08-bottom-usb"', "view set includes a bottom USB-C detail angle");
test.assertIncludes(service, "bottomUsbPosition = vector(center.x + distance * 0.08, center.y - distance * 0.28, center.z - distance)", "SceneKit USB-C detail camera looks from the back/bottom side");
test.assertIncludes(service, '"09-top-edge"', "view set includes a top edge detail angle");
test.assert(exists("assets/cmf/iphone-17-standard.usdz"), "source iPhone 17 USDZ asset is bundled in assets/cmf");

// --- UI and CSS boundaries ---
test.assertIncludes(index, 'id="cmf-preview-image"', "preview image target exists");
test.assertIncludes(index, 'id="cmf-parts"', "part controls target exists");
test.assertIncludes(index, 'id="cmf-render"', "render views button exists");
test.assertIncludes(index, 'id="cmf-export"', "export USDZ button exists");
test.assertIncludes(cmfStudio, '"/api/cmf/render-views"', "front end renders through server PNG views");
test.assertIncludes(cmfStudio, '"/api/cmf/render-preview"', "front end auto-renders the current view after color changes");
test.assertIncludes(cmfStudio, "schedulePreviewRender", "color changes schedule a live preview refresh");
test.assertIncludes(cmfStudio, '"/api/cmf/export-usdz"', "front end exports through server USDZ API");
test.assertIncludes(cmfStudio, "cmf-color-chip", "part colors use stable inline swatch buttons");
test.assertNotIncludes(cmfStudio, 'document.createElement("select")', "part colors avoid native select dropdowns");
test.assertNotIncludes(cmfStudio, "filter:", "front end does not rely on CSS filters for recoloring");
test.assertIncludes(styleManifest, '"styles/86-cmf-studio.css"', "CMF stylesheet is in the style manifest");
test.assertNotIncludes(styles, "!important", "CMF stylesheet adds no !important overrides");

// --- bilingual strings ---
test.assertIncludes(en, "cmf_studio_label:", "English CMF strings exist");
test.assertIncludes(zh, "cmf_studio_label:", "Chinese CMF strings exist");
test.assertIncludes(zh, "配色工作台", "Chinese label is present");

test.finish();
