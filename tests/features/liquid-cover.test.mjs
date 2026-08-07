// Liquid Cover is a summoned tool (not a stop in the writing route): turn any
// text into Apple-style Liquid Glass, composited between a background image and
// a foreground subject, exported as a PNG cover at a platform-safe aspect.
// It must stay lazy-loaded and self-contained; app menus use its public bridge.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-cover");
const liquidCover = read("app/features/liquid-cover.js");
const coverStylePrompt = read("app/content/ai-prompts/other-apps/liquid-cover-style.md");
const coverBackgroundPrompt = read("app/content/ai-prompts/other-apps/liquid-cover-background.md");
const index = read("index.html");
const stylesCss = read("styles/85-liquid-cover.css");
const manifest = read("scripts/runtime-manifest.mjs");
const styleManifest = read("scripts/style-manifest.mjs");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const dictionary = read("app/data/system-dictionary.js");
const app = readAppSurface([
  "app/core/config.js",
  "app/core/actions.js",
  "app/core/multi-finder.js",
  "app/core/window-manager.js",
]);

// --- renderer is self-contained and text-driven ---
test.assertIncludes(liquidCover, "window.AISystem6LiquidCoverLoaded = true", "module marks itself loaded for the lazy guard");
test.assertIncludes(liquidCover, "window.AISystem6LiquidCover = { open, runMenuCommand }", "module exposes open plus real menu commands");
test.assertIncludes(liquidCover, "function alphaToSignedDistance", "text silhouette is turned into an exact signed distance field locally");
// edge quality: the raster SDF must be smoothed and sampled smoothly, or the
// glass edge ribs/corrugates when zoomed (EDT facets + angle-snapping normals).
test.assertIncludes(liquidCover, "function smoothSDF", "the distance field is smoothed to remove EDT facets (no ribbed edge, soft rounded glass)");
test.assertIncludes(liquidCover, "OES_texture_float_linear", "the SDF texture is linearly filtered when supported (continuous normals)");
test.assertIncludes(liquidCover, "this.sdfLinear ? gl.LINEAR : gl.NEAREST", "SDF sampling prefers LINEAR, falling back to NEAREST");
test.assertIncludes(liquidCover, "gx=(tr+2.0*mr+br)", "normals use a Sobel (3x3) gradient so the angle-sensitive glare doesn't ring");
test.assertIncludes(liquidCover, "function rasterizeText", "text is rasterized to a coverage mask before the SDF");
test.assertIncludes(liquidCover, "stackSDIdx", "overlapping layers resolve from back to front instead of collapsing into an orderless SDF union");
test.assertIncludes(liquidCover, "getGrad(v_uv, layer)", "the visible layer samples its own SDF normal so text can sit cleanly over a shape");
test.assertIncludes(liquidCover, "EXT_color_buffer_float", "uses HDR float framebuffers like the official studio when available");
// WebGL2 context creation can fail (GPU-heavy tabs, GPU reset). The window must
// degrade visibly, not die silently with a blank canvas and empty control rows.
test.assertIncludes(liquidCover, "function initRenderer", "renderer creation is isolated and failure-tolerant");
test.assertIncludes(liquidCover, 'aiStatus("webgl"', "a WebGL failure shows a visible, actionable message");
test.assertIncludes(liquidCover, "// UI first — these must exist even if WebGL is unavailable right now", "controls are built before the renderer so they survive a WebGL failure");
test.assertIncludes(liquidCover, "else if (!renderer) { startRendering(); }", "reopening the window retries WebGL after a transient failure");
test.assertIncludes(liquidCover, "gl.RGBA16F", "intermediate buffers are RGBA16F (no banding), with an 8-bit fallback");
test.assertIncludes(liquidCover, "refThickness: 20", "default is water-clear glass with a thin refractive rim (the Apple Liquid Glass reference), not a thick frosted body");
test.assertIncludes(index, 'id="lc-ref-factor" min="1" max="4" step="0.01" value="1.5"', "default IOR sits in the clean 1.4–1.6 band; 2.0 caused the metal-bevel + rainbow look");
test.assertIncludes(index, 'id="lc-lens" min="0" max="30" step="0.5" value="11"', "default carries convex-lens magnification so the glass actually magnifies the background like real thick glass");
test.assertIncludes(index, 'id="lc-tint-alpha" min="0" max="100" step="1" value="0"', "default tint is zero — the clear body shows the background 1:1, no milky veil");
test.assertIncludes(index, '<input type="checkbox" id="lc-blur-edge" class="lc-check" checked>', "default frosts the body (the solid-glass reference look), not a clear pane");
// The glass shader is a faithful port of liquid-glass-studio STEP9 (what MB is
// built on). The only edge treatment is the physical Fresnel + glare; the
// invented silver/hairline/veil/darkBoost hacks (the "metal sticker" look) are gone.
test.assertIncludes(liquidCover, "pow(xr,2.0)", "refraction profile matches STEP9 (exponent 2.0), not a smeared lens");
test.assertIncludes(liquidCover, "0.05*u_baseDpr", "refraction offset matches STEP9 (0.05) and uses base dpr so export ≡ preview");
test.assertIncludes(liquidCover, "fres*u_refFresnelFactor*0.7*nlen", "fresnel is modulated by length(normal) — no bright spine on the flat centre");
test.assertIncludes(liquidCover, "gaf*gGeo*nlen", "glare is modulated by length(normal) like STEP9");
test.assertIncludes(liquidCover, "tint.a*0.8", "tint occlusion matches STEP9 (0.8)");
test.assertNotIncludes(liquidCover, "vec3 silver", "the invented silver inner edge is removed (not in liquid-glass-studio)");
test.assertNotIncludes(liquidCover, "darkBoost", "the invented background-luminance hack is removed");
test.assertNotIncludes(liquidCover, "float hairline", "the invented white keyline is removed");
test.assertIncludes(liquidCover, "u_tint[layer]", "per-layer tint is selected from the winning layer");
test.assertIncludes(liquidCover, "u_refThickness[layer]", "per-layer thickness is selected from the winning layer");
test.assertIncludes(liquidCover, 'uniform int u_layerMode[" + MAX_LAYERS + "]', "each layer can choose glass or solid rendering in the shader");
test.assertIncludes(liquidCover, "u_layerMode[layer] == 1", "solid title layers bypass glass optics and render as readable opaque color");
test.assertIncludes(liquidCover, 'renderMode: "glass", solidColor: "#ffffff"', "a fresh layer opens as GLASS — the tool is called Cover Glass, so the first open must show glass; the readable solid title is one checkbox away");
test.assertIncludes(liquidCover, 'renderMode: "glass"', "shape/logo layers default to glass while title layers stay readable");
test.assertIncludes(liquidCover, '(L.shape || L.shapeKind)) L.renderMode = p.layerMode', "a preset's layerMode only retargets shape layers — the 9to5Mac preset must never flip the solid title to glass");
test.assertIncludes(liquidCover, "layerModes: layers.map((L) => isSolidLayer(L) ? 1 : 0)", "render params pass the per-layer style mode to WebGL");
test.assertIncludes(liquidCover, 'L[isSolidLayer(L) ? "solidColor" : "tintColor"]', "the color swatch edits solid text color or glass tint according to layer mode");
test.assertIncludes(liquidCover, "uniform float u_bodyFactor", "a preset-controlled milky body term can fill 9to5Mac glass instead of leaving hollow outline text");
test.assertIncludes(liquidCover, "float body = smoothstep", "the 9to5Mac body fill is driven by SDF interior depth");
test.assertIncludes(liquidCover, "uniform float u_rimFactor", "a preset-controlled rim term can create the crisp 9to5Mac white bevel edge");
test.assertIncludes(liquidCover, "float rim = (1.0 - smoothstep", "the 9to5Mac rim is derived from the SDF edge instead of being a bitmap outline");
test.assertIncludes(liquidCover, "u_fgPos", "foreground subject is placed (movable) rather than full-frame only");
test.assertIncludes(liquidCover, "u_fgScale", "foreground subject is scalable");

// --- the three failure-prone controls are kept RELATIVE, not absolute ---
// 1) thickness can never exceed the measured stroke half-width (thin fonts /
//    large export sizes can't collapse the clear centre).
test.assertIncludes(liquidCover, "maxInteriorPx", "the SDF build measures each layer's stroke half-width");
test.assertIncludes(liquidCover, "_strokeHalfPx", "the measured stroke half-width is stored per layer");
test.assertIncludes(liquidCover, "function effectiveThickness", "rendered thickness is derived from the letterform, not the raw slider");
test.assertIncludes(liquidCover, "PROPORTION of the letterform", "thickness is a % of the stroke half-width, so it auto-adapts to font size / canvas size (no per-photo re-tuning)");
test.assertIncludes(liquidCover, "halfCss * Math.min(frac", "effective thickness = stroke half-width × the slider fraction");
// 2) frost is resolution-independent and hard-capped at the shader kernel.
test.assertIncludes(liquidCover, "function scaledBlurRadius", "blur scales with export height so frost looks the same at 1080p and 4K");
test.assertIncludes(liquidCover, "EXPORT_H / 1080", "blur is expressed relative to a 1080p reference");
// 3) tint stays in a tasteful range via the strength enum (not a shader cap), so
//    the recipe/AI never paint a solid colour chip while keeping STEP9 fidelity.
test.assertIncludes(liquidCover, "strong: 38", "tint-strength enum stays tasteful (no solid chip) without altering the STEP9 shader");
test.assertIncludes(liquidCover, 'a.download = "liquid-glass-"', "export downloads a PNG named by its pixel size");

// --- production export: full source resolution, real 3:2 support ---
test.assertIncludes(index, 'data-k="3:2"', "3:2 aspect is offered (for 3:2 cameras / 6000×4000 photos)");
test.assertIncludes(liquidCover, '"3:2": [1500, 1000]', "3:2 design dims land on an exact 6000×4000 at 4× export");
test.assertIncludes(liquidCover, "function exportPng", "export renders at full resolution rather than the preview canvas size");
test.assertIncludes(liquidCover, "function exportTargetDims", "export size is computed (source photo native long edge, GPU-clamped)");
test.assertIncludes(liquidCover, "let renderScale", "a render-scale lever drives high-res export (font, SDF, blur, thickness scale together)");
test.assertIncludes(liquidCover, "MAX_TEXTURE_SIZE", "export resolution is clamped to the GPU's max texture size");
test.assertIncludes(liquidCover, "naturalWidth", "match-photo export reads the imported photo's native resolution");
test.assertIncludes(index, 'id="lc-export-res"', "an export-size picker exists");
test.assertIncludes(index, 'value="source"', "the default export size matches the source photo (no downscaling)");
test.assertIncludes(liquidCover, "fontSize: L.fontSize * renderScale", "text is rasterized at export scale so type stays razor-sharp");
test.assertIncludes(index, 'id="lc-motion-input"', "Cover Glass can import the MOV/MP4 side of a Live Photo");
test.assertIncludes(index, 'accept="video/quicktime,video/mp4,video/*,.mov,.mp4,.m4v"', "motion import accepts Live Photo MOV plus common video files");
test.assertIncludes(index, 'id="lc-motion-preset"', "an animation preset control exists for video openings");
test.assertIncludes(index, 'value="condense"', "Glass Forming remains as a distinct glass-emergence opening");
test.assertIncludes(index, 'value="push"', "Live Push remains as a distinct camera/background-motion opening");
test.assertNotIncludes(index, 'value="watertext"', "the retired Waterdrop Text effect stays out of the animation menu");
test.assertNotIncludes(index, 'value="surface"', "the retired Surface Glass Text effect stays out of the animation menu");
test.assertNotIncludes(index, 'value="bubbletitle"', "the retired Bubble Title effect stays out of the animation menu");
test.assertNotIncludes(index, 'value="breathe"', "animation preset menu is intentionally pruned to distinct reference-matching looks");
test.assertNotIncludes(index, 'value="prism"', "animation preset menu avoids weakly differentiated options");
test.assertIncludes(index, 'id="lc-motion-preview"', "motion previews are explicit instead of starting as soon as a Live Photo MOV is imported");
test.assertIncludes(index, 'id="lc-motion-export"', "the tool exposes an Export Video command separate from PNG export");
test.assertIncludes(liquidCover, "setBackgroundVideo", "renderer has a dedicated video-texture path instead of treating video like a static image");
test.assertIncludes(liquidCover, "bgVideoFrameReady", "video textures wait for a real decoded frame before replacing the placeholder texture");
test.assertIncludes(liquidCover, "requestVideoFrameCallback", "motion preview requests a decoded video frame before reporting the video as loaded");
test.assertIncludes(liquidCover, "const MOTION_PREVIEW_FPS = 30", "motion preview is capped to a practical editor frame rate");
test.assertIncludes(liquidCover, "motionPreviewActive", "motion preview is one-shot state, not an always-on render loop");
test.assertIncludes(liquidCover, "video.loop = false", "imported Live Photo videos do not loop in the editor");
test.assertIncludes(liquidCover, "texSubImage2D", "video background frames update the WebGL texture frame-by-frame");
test.assertNotIncludes(liquidCover, "u_liquidOverlayMode", "the retired effects no longer keep their overlay shader path");
test.assertNotIncludes(liquidCover, "const REF_FRAG", "the retired effects no longer compile a dedicated reference shader");
test.assertNotIncludes(liquidCover, "reference3DMode", "the retired effects no longer keep a second render mode");
test.assertNotIncludes(liquidCover, 'preset === "watertext"', "Waterdrop Text runtime code is removed");
test.assertNotIncludes(liquidCover, 'preset === "surface"', "Surface Glass Text runtime code is removed");
test.assertNotIncludes(liquidCover, 'preset === "bubbletitle"', "Bubble Title runtime code is removed");
test.assertIncludes(liquidCover, "function readParamsAt", "animation presets are time-based parameter overlays, not slider mutations");
test.assertIncludes(liquidCover, "canvas.captureStream", "video export records the rendered WebGL canvas");
test.assertIncludes(liquidCover, "MediaRecorder", "video export uses browser encoding with MP4/WebM fallback");
test.assertIncludes(en, 'liquid_cover_motion: "Motion Video"', "English strings include the Motion Video panel");
test.assertIncludes(zh, 'liquid_cover_motion: "动态视频"', "Chinese strings include the Motion Video panel");

// --- AI auto-style: the MODEL owns semantics, the CODE owns physics ---
// The model must never emit raw optical constants it cannot visually judge
// (that was the "magic" failure mode). It picks one named material from a
// plain-language catalog and makes colour/light calls a person could make;
// the numbers all live in the recipe table on the code side.
test.assertIncludes(liquidCover, "async function aiSuggestStyle", "an AI suggest-style action exists");
test.assertIncludes(liquidCover, "fetchModelPayload(", "AI styling reuses the shared local/cloud model call");
test.assertIncludes(liquidCover, "function parseJsonLoose", "AI response is parsed defensively (strips code fences)");
test.assertIncludes(liquidCover, "Glass materials (choose exactly one", "the prompt hands the model a plain-language material catalog, not a numeric schema");
test.assertIncludes(coverStylePrompt, "You do NOT set numeric optics", "the prompt forbids the model from inventing raw optical constants");
test.assertNotIncludes(liquidCover, '"glareConvergence":0..100', "the model is never asked for raw optical constants it cannot judge");
test.assertNotIncludes(liquidCover, "Full schema (set every field", "the old free-form numeric-schema prompt is gone");
test.assertIncludes(liquidCover, "function applyRecipeByName", "the model's recipe choice maps to a verified parameter set in code");
test.assertIncludes(liquidCover, "function applyTintStrength", "tint strength is a closed enum mapped to a number in code");
test.assertIncludes(liquidCover, "function lightToAngle", "light direction is a closed enum mapped to a glare angle in code");
test.assertIncludes(liquidCover, "const MODIFIER_FX", "modifiers are a closed vocabulary, each mapped to a deterministic delta");
test.assertIncludes(liquidCover, "function applyModifiers", "bounded modifiers apply without the model touching a raw number");
test.assertIncludes(liquidCover, "function describeChoice", "the model's decision is shown back to the user (explainable, not magic)");
// The model remains an optional material tool, not the editor's primary path.
test.assertIncludes(index, 'class="lc-look-assistant"', "AI art direction is progressively disclosed inside the Glass inspector");
test.assertIncludes(index, 'id="lc-ask-input"', "the optional material assistant accepts a plain-language look");
test.assertIncludes(index, 'id="lc-ask-go"', "the optional material assistant can apply the look");
// one verified recipe table is the single source of truth for both presets and AI
test.assertIncludes(liquidCover, "SINGLE SOURCE OF TRUTH", "optics live in one verified recipe table, shared by presets and the AI path");
test.assertIncludes(liquidCover, "const PRESETS =", "one-click glass presets exist");
test.assertIncludes(liquidCover, "desc:", "each recipe carries a plain-language description the prompt catalog is built from");
test.assertIncludes(liquidCover, "function applyPreset", "presets apply the full optics set + per-layer thickness/tint");
test.assertIncludes(index, 'id="lc-material-mix"', "a global glass-mix slider exists for clear-to-tinted control");
test.assertIncludes(index, 'id="lc-layer-solid"', "each layer has a Solid Layer switch for readable title text");
test.assertIncludes(liquidCover, "const MATERIAL_STOPS", "the global slider moves through verified recipe stops instead of inventing a second parameter system");
test.assertIncludes(liquidCover, '{ value: 0, key: "clear" }', "the glass-mix slider starts at the verified clear recipe");
test.assertIncludes(liquidCover, '{ value: 100, key: "tinted" }', "the glass-mix slider ends at the verified tinted recipe");
test.assertIncludes(liquidCover, "function materialRecipeAt", "the glass-mix slider interpolates recipe physics deterministically");
test.assertIncludes(liquidCover, "function applyMaterialMix", "the glass-mix slider applies the interpolated material to the existing controls");
test.assertIncludes(liquidCover, "lens: 8, dispersion: 3", "the crystal recipe is a clear bright-rim material, distinct from milky and thick glass");
// every look approved during tuning is preserved as its own recipe:
test.assertIncludes(liquidCover, '{ key: "milky"', "the earlier approved solid-milk frosted reference look is kept as its own preset");
test.assertIncludes(liquidCover, '{ key: "thinfrost"', "the MB plugin-default thin veiled glass (lock-screen look) is kept as its own preset");
test.assertIncludes(liquidCover, '{ key: "ninefive", mixValue: 75, desc:', "a dedicated 9to5Mac editorial logo-glass recipe exists and sits near Milky on the visible mix control");
test.assertIncludes(liquidCover, '{ key: "ios27", mixValue: 0, desc:', "an iOS 27 recipe transcribes Apple's official UI Kit Materials glass spec and sits near Clear on the visible mix control");
test.assertIncludes(liquidCover, "function presetMixValue", "non-continuum presets still place the Glass Mix thumb at an honest approximate position instead of leaving a stale value");
test.assertIncludes(liquidCover, '{ key: "thick", mixValue: 85, desc:', "Thick has its own useful material position instead of borrowing the previous slider value");
test.assertIncludes(liquidCover, "uniform float u_bevelFactor", "the shader has the iOS 27 bilateral bevel term — paired top/bottom hairlines + soft top wash, not an angular streak");
test.assertIncludes(liquidCover, "float topW = clamp(N.y", "the bevel is vertically paired like Apple's Y±0.5 inner-shadow hairlines (top brighter than bottom)");
test.assertIncludes(liquidCover, "float sideW = abs(N.x)", "the iOS 27 bevel also carries Apple's X±1/X±20 side-light stack, not only top/bottom hairlines");
test.assertIncludes(liquidCover, "uniform float u_saturationFactor", "the shader implements Apple's Glass Saturation parameter for the iOS 27 resource recipe");
test.assertIncludes(liquidCover, "lens: 30, dispersion: 0", "the iOS 27 preset maps Apple's Distortion 30 / Chromatic Aberration 0 resource values into the renderer");
test.assertIncludes(liquidCover, "blurRadius: 6, shadowFactor: 4, shadowExpand: 15, thickness: 90", "the iOS 27 preset pins the official Materials values: Gaussian Blur 6, Depth 90, whisper-light 4%/15 shadow");
test.assertIncludes(liquidCover, "saturationFactor: 40", "the iOS 27 preset keeps Apple's Glass Saturation 40% value instead of leaving cover glass over-coloured");
test.assertIncludes(liquidCover, "bodyFactor: 4, rimFactor: 10", "the iOS 27 body is near-clear (low bodyFactor) so the glyph interior stays transparent like Apple's — milk lives at the edges, not flooding the centre");
test.assertNotIncludes(liquidCover, '{ value: 52, key: "ios27" }', "editorial presets (ios27/ninefive) are NOT points on the clear→tinted Glass Mix continuum — dragging the slider must never silently flip on bevel/glass mode");
test.assertIncludes(liquidCover, "max(mix(vec3(luma), col.rgb, max(u_saturationFactor, 0.0)), 0.0)", "Glass Saturation only clamps the lower bound, so values above 100% boost colour (mix extrapolates) instead of being capped at desaturate-only");
test.assertIncludes(liquidCover, "function adjBody", "the AI mood bar can still adapt milky/body recipes to the photo while fixed preset buttons stay deterministic");
test.assertIncludes(liquidCover, 'bodyFactor: 52, rimFactor: 110, rimWidth: 4.6, bevelFactor: 0, saturationFactor: 96, layerMode: "glass"', "9to5Mac preset forces glass layers into a milky translucent body with a crisp white bevel rim");
test.assertIncludes(liquidCover, "lens: 22, dispersion: 1.2", "Thick is the physical-chunk recipe: strong magnification, low chromatic smear");
test.assertIncludes(liquidCover, 'tintColor: "#5ac8fa", tintAlpha: 52', "Tinted exists as the visibly coloured recipe, not just another white-frost stop");
test.assertIncludes(liquidCover, "thickness: 18, tintColor: \"#ffffff\", tintAlpha: 18", "Thin Frost is deliberately thin and quiet, not a duplicate of Milky");
test.assertIncludes(liquidCover, 'applyRecipeByName("ninefive")', "typing 9to5Mac in the mood bar applies the same verified recipe without needing a model");
test.assertIncludes(en, 'liquid_cover_preset_ninefive: "9to5Mac"', "English preset label names the 9to5Mac look");
test.assertIncludes(zh, 'liquid_cover_preset_ninefive: "9to5Mac"', "Chinese preset label names the 9to5Mac look");
test.assertIncludes(en, 'liquid_cover_preset_ios27: "iOS 27"', "English preset label names the iOS 27 official material");
test.assertIncludes(zh, 'liquid_cover_preset_ios27: "iOS 27"', "Chinese preset label names the iOS 27 official material");
test.assertIncludes(liquidCover, "tintAlpha: 52, bodyFactor: 38, rimFactor: 12", "Milky has an actual white body, not just a slightly stronger frost slider");
// the "clear" recipe is the official liquid-glass-studio demo-shape material,
// read directly off the studio's own panel (tint #ffffff00, blur 1, no lens).
test.assertIncludes(liquidCover, "lens: 0, dispersion: 7", "clear recipe = official studio shape material (no magnification, prismatic dispersion 7)");
test.assertIncludes(liquidCover, "blurRadius: 1, shadowFactor: 8, shadowExpand: 18, thickness: 20, tintColor: \"#ffffff\", tintAlpha: 0", "clear recipe pins the official panel values: blur 1, restrained shadow 8/18, thickness 20, zero tint");
test.assertIncludes(liquidCover, "u_lensMag", "the shader has a convex-lens magnification term (real thick-glass magnification, not flat refraction)");
test.assertIncludes(liquidCover, "0.3+u_glareConvergence*1.5", "glare convergence uses the liquid-glass-studio exponent band (0.3-1.8) so low convergence is a soft band, not a blown-out smear");
test.assertIncludes(liquidCover, "const PREVIEW_SS = 2", "the preview renders at 2x design resolution — rasterized text SDFs need sampling density for clean edges (the studio's analytic SDF doesn't)");
test.assertIncludes(liquidCover, 'imageSmoothingQuality = "high"', "exports render supersampled and downscale once with high-quality filtering — the shipped PNG is exactly the promised size");
test.assertIncludes(liquidCover, "lens magnification baked into the sample coord", "magnification is in the base sample coord, so it is NOT spectrally split (no rainbow)");
test.assertIncludes(index, 'id="lc-lens"', "magnification is a user-facing slider");
test.assertNotIncludes(liquidCover, "refFactor: 2.0", "no recipe uses IOR 2.0 — that value is what produced the rainbow/metal artefacts");
test.assertIncludes(index, 'id="lc-preset-row"', "the preset gallery has a row");
test.assertIncludes(liquidCover, 'preview.className = "lc-preset-preview"', "preset cards render a recognizable material sample instead of a generic empty swatch");
test.assertIncludes(liquidCover, "recipeSummary", "preset cards explain the visible material difference in one short line");
test.assertIncludes(index, 'class="lc-toolbar-modes"', "inspector modes stay in the fixed editor toolbar instead of consuming inspector space");
test.assertIncludes(index, 'class="lc-sidebar"', "the scene structure stays visible beside the canvas");
test.assertIncludes(index, 'data-lc-inspector-tab="layers"', "selected-layer type controls live in the contextual inspector");
test.assertIncludes(index, 'data-lc-inspector-tab="media"', "background and foreground controls live in the Background inspector");
test.assertIncludes(index, 'data-lc-inspector-tab="glass"', "glass controls live on a Glass inspector tab");
test.assertIncludes(liquidCover, "const inspectorCopy", "the contextual inspector explains the currently selected property domain");
test.assertIncludes(liquidCover, "function setInspectorPanel", "the toolbar switches contextual panels without layout inline styles");
test.assertIncludes(liquidCover, 'setInspectorPanel(isShapeLayer(L) ? "glass" : "layers")', "selecting a shape opens material properties while selecting text opens type properties");
test.assertIncludes(index, 'class="lc-group lc-layer-glass-group"', "selected-layer material controls live with the Glass context");
test.assertIncludes(index, 'id="lc-tab-export" data-lc-inspector-tab="export" aria-pressed="false"', "the standalone Export action exposes pressed state without pretending to sit inside the inspector tablist");
test.assertIncludes(liquidCover, "function wireFineTuneGroups", "manual fine-tune opens all subgroups together so expert work is one-click");
test.assertIncludes(liquidCover, "group.open = true", "opening Fine-tune reveals all manual subsections instead of forcing repeated accordion clicks");
test.assertNotIncludes(liquidCover, "other.open = false", "manual fine-tune sections are not mutually exclusive");
test.assertNotIncludes(index, 'id="lc-preset-readout"', "preset explanations stay inside each material card rather than creating a detached readout");
test.assertIncludes(liquidCover, "dataset.presetKey", "preset buttons carry stable keys for active state and verification");
test.assertIncludes(liquidCover, "aria-pressed", "preset buttons expose their selected state accessibly");
test.assertIncludes(liquidCover, 'setActivePreset(""); syncValueLabels(); scheduleRender();', "manual material edits clear the preset selected state so the button still matches the rendered result");
test.assertNotIncludes(liquidCover, "lc-preset-hint", "preset buttons do not carry redundant visible description text");
test.assertIncludes(en, "liquid_cover_preset_ios27_summary", "English preset cards explain the material before selection");
test.assertIncludes(zh, "liquid_cover_preset_ios27_summary", "Chinese preset cards explain the material before selection");
test.assertIncludes(index, 'id="lc-layer-up"', "the layer stack exposes a direct bring-forward action");
test.assertIncludes(index, 'id="lc-layer-down"', "the layer stack exposes a direct send-backward action");
test.assertIncludes(liquidCover, "function moveSelectedLayer", "layer-order actions update the data stack and renderer slots together");
test.assertIncludes(liquidCover, "rebuildAllSDF();\n    renderLayerList();", "reordering rebuilds index-coupled SDF textures before repainting the layer list");
test.assertIncludes(index, 'id="lc-add-inside-text"', "a selected shape can create linked text above itself");
test.assertIncludes(liquidCover, "parentId: shape.id", "text created inside a shape keeps a positional link to that shape");
test.assertIncludes(liquidCover, "linkedChildren(L)", "moving a shape carries its embedded text with it");
for (const id of ["left", "center", "right", "top", "middle", "bottom"]) {
  test.assertIncludes(index, `id="lc-align-${id}"`, `the artboard exposes ${id} alignment`);
}
test.assertIncludes(liquidCover, "function measureAlphaBounds", "alignment uses the rendered alpha bounds rather than font-size guesses");
test.assertIncludes(liquidCover, "6 / Math.max(1, rect.width)", "smart-guide tolerance stays six screen pixels at every zoom");
test.assertIncludes(liquidCover, "alignmentCandidates", "drag snapping considers artboard and peer-object anchors");
test.assertIncludes(index, 'id="lc-alignment-guides" aria-hidden="true"', "alignment guides are visual-only and stay outside the exported canvas");
test.assertIncludes(liquidCover, 'guides.classList.remove("has-x", "has-y")', "drag completion clears both smart guides");
test.assertIncludes(liquidCover, "const stepPx = event.shiftKey ? 10 : 1", "arrow keys move one design pixel, with Shift for ten");
test.assertIncludes(liquidCover, "function layerAtPoint", "clicking an object on the canvas selects that object directly");
test.assertIncludes(index, 'class="details-bar lc-status-bar"', "Cover Glass status uses the standard app details bar under the title");
test.assertIncludes(index, 'class="lc-ask-status" id="lc-ai-status" role="status" aria-live="polite"', "the AI status line starts in the top details bar and announces changes");
test.assert(
  index.indexOf('class="details-bar lc-status-bar"') < index.indexOf('id="lc-ask-form"'),
  "the Cover Glass status line stays above the workspace and optional material assistant",
);
test.assertIncludes(index, 'class="lc-stage-head"', "the redesigned stage carries an artboard readout instead of presenting a context-free canvas");
test.assertIncludes(index, 'id="lc-stage-format"', "the artboard exposes its live aspect and design dimensions");
test.assertIncludes(index, 'id="lc-canvas" class="lc-canvas" tabindex="0" role="application"', "the artboard is keyboard focusable");
test.assertIncludes(liquidCover, "function wireStageKeyboard", "arrow keys provide a precise equivalent to pointer dragging");
test.assertIncludes(liquidCover, '["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]', "the keyboard nudge contract covers all four directions");
test.assertIncludes(liquidCover, "selectedLayerIds", "the editor keeps an explicit multi-selection instead of overloading one active layer");
test.assertIncludes(liquidCover, "kind: \"marquee\"", "dragging empty artboard space starts box selection");
test.assertIncludes(liquidCover, "selectedPositionRoots()", "multi-selected objects move and nudge as one direct-manipulation group");
test.assertIncludes(liquidCover, 'event.key.toLowerCase() === "a"', "Command/Ctrl-A selects every layer on the artboard");
test.assertIncludes(index, 'class="lc-selection-box" id="lc-selection-box"', "selection bounds stay visible without entering an inspector");
test.assertIncludes(index, 'id="lc-transform-scale"', "a single selection exposes direct scale on the artboard");
test.assertIncludes(index, 'id="lc-transform-rotate"', "a single selection exposes direct rotation on the artboard");
test.assertIncludes(liquidCover, "function wireTransformHandles", "direct transform handles update the selected object without opening another panel");
test.assertIncludes(index, 'id="lc-selection-marquee" aria-hidden="true"', "the artboard owns a non-exported marquee overlay");
test.assertIncludes(liquidCover, "function reorderLayerUnit", "layer panel drag-and-drop updates the renderer stack");
test.assertIncludes(liquidCover, 'item.addEventListener("pointerdown"', "every layer row can start a mouse, pen, or touch hierarchy drag");
test.assertIncludes(liquidCover, 'document.elementFromPoint(event.clientX, event.clientY)', "the hierarchy drag resolves the visible insertion target under the pointer");
test.assertIncludes(liquidCover, "reorderLayerUnit(state.unitIds, state.targetId, state.edge)", "releasing the pointer commits the new hierarchy");
test.assertIncludes(liquidCover, "const MAX_LAYERS = 8", "the lightweight editor has enough room for a real cover without becoming an unbounded document model");
test.assertIncludes(liquidCover, "const bgUnit = MAX_LAYERS", "background texture slots move with the expanded layer budget");
test.assertIncludes(index, 'id="lc-undo"', "the toolbar exposes undo");
test.assertIncludes(index, 'id="lc-redo"', "the toolbar exposes redo");
test.assertIncludes(index, 'class="lc-control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"', "history actions use stable vector icons instead of font-dependent arrow glyphs");
test.assertNotIncludes(index, ">↶<", "undo no longer depends on a mismatched text glyph");
test.assertNotIncludes(index, ">↷<", "redo no longer depends on a mismatched text glyph");
test.assertIncludes(liquidCover, "function layerStateGlyph", "visibility and lock states share a purposeful vector-icon builder");
test.assertIncludes(liquidCover, '"btn lc-layer-state"', "layer-state actions use the same control material as the rest of the editor");
test.assertIncludes(liquidCover, 'visibility.setAttribute("aria-pressed"', "visibility icon state remains available to assistive technology");
test.assertIncludes(liquidCover, 'lock.setAttribute("aria-pressed"', "lock icon state remains available to assistive technology");
test.assertIncludes(liquidCover, "function undoEditor", "session edits can be undone");
test.assertIncludes(liquidCover, "function redoEditor", "session edits can be redone");
test.assertIncludes(liquidCover, "const HISTORY_LIMIT = 50", "history stays intentionally bounded");
test.assertIncludes(index, 'id="lc-duplicate-layer"', "the layer rail exposes a simple duplicate action");
test.assertIncludes(liquidCover, "function duplicateSelectedLayers", "selected layers can be duplicated without rebuilding them manually");
test.assertIncludes(liquidCover, "function beginLayerRename", "layer names can be edited in place");
test.assertIncludes(liquidCover, "hidden: false, locked: false", "each layer supports the essential visibility and lock states");
test.assertIncludes(liquidCover, 'L.hidden ? [10, 10]', "hidden layers stay in the small renderer stack without painting");
test.assertIncludes(liquidCover, 'event.key.toLowerCase() === "z"', "Command/Ctrl-Z is available from the artboard");
test.assertIncludes(liquidCover, "function syncWorkbenchReadout", "stage and status readouts stay synchronized with the composition");
test.assertIncludes(liquidCover, "function neutralBg", "keeps a quiet neutral placeholder so the canvas is never blank if a photo is missing — no fake procedural photo scenes");
test.assertIncludes(liquidCover, "function rasterizeShape", "any uploaded image becomes a glass shape via the same EDT → SDF → shader path as text");
test.assertIncludes(index, 'id="lc-add-shape"', "the layer row has an Add Shape button next to Add Text");
test.assertIncludes(index, 'id="lc-shape-circle"', "built-in preset shapes include a circle (one click, no upload)");
test.assertIncludes(index, 'id="lc-shape-squircle"', "built-in preset shapes include the Apple-icon rounded rectangle");
test.assertIncludes(liquidCover, "function traceBuiltinShape", "built-in shapes are vector paths traced at target resolution every rebuild — no bitmap rescale, crisp at any export size");
test.assertIncludes(liquidCover, "applyMaterialMix(0)", "the tool opens water-clear (the Apple Liquid Glass reference look), not frosted");
test.assertIncludes(liquidCover, "/assets/liquid-cover/bg-1.jpg", "built-in backgrounds are fixed high-quality photos served from disk");
const builtInBackgrounds = Array.from(liquidCover.matchAll(/"\/assets\/liquid-cover\/bg-\d\.jpg"/g)).map((match) => match[0]);
test.assert(builtInBackgrounds.length === 6, "Cover Glass keeps exactly six built-in backgrounds");
test.assertIncludes(liquidCover, "/assets/liquid-cover/bg-6.jpg", "built-in background set includes the sixth slot");
test.assertIncludes(liquidCover, "function setBgFromUrl", "background photos load by URL with a fallback");
// manual sliders collapse into a default-collapsed Fine-tune section
test.assertIncludes(index, '<details class="lc-finetune">', "the manual fine-tune sliders collapse (collapsed by default)");
test.assertNotIncludes(index, '<details class="lc-finetune" open>', "fine-tune stays collapsed by default");
// AI mood/config adapts to the background via vision when 看底图 is on; preset
// buttons themselves stay deterministic so their labels match the final result.
test.assertIncludes(liquidCover, "function applyNudges", "simple adjustments work deterministically without a model (not 'magic')");
test.assertIncludes(liquidCover, "mag * flip", "reduction words (少/减/弱…) flip a keyword's built-in direction — '阴影少一些' must LOWER shadow, not raise it");
test.assertIncludes(liquidCover, '" → "', "the status line reports exact before → after values for every nudge, never a vague 'adjusted as described'");
test.assertNotIncludes(liquidCover, 'aiStatus("nudged"', "the old unconditional success message is gone — feedback must reflect what actually changed");
test.assertIncludes(liquidCover, "ctrl.abort()", "the model call times out instead of spinning forever");
test.assertIncludes(stylesCss, "Classic skin keeps range controls in System 6 chrome", "Classic Cover Glass sliders use black-white System 6 controls instead of leaking modern Liquid Glass chrome into the retro skin");
test.assertIncludes(stylesCss, 'body.use-liquid-glass .liquid-cover-window input[type="range"]::-webkit-slider-runnable-track', "Liquid Glass Cover Glass sliders switch to the standard system-blue filled track");
test.assertIncludes(stylesCss, 'body.use-liquid-glass .liquid-cover-window input[type="range"]::-webkit-slider-thumb', "Liquid Glass Cover Glass sliders use the white floating Apple-style thumb");
test.assertIncludes(liquidCover, "Classic uses black-white", "the filled-track updater is theme-neutral: Classic and Liquid Glass draw different skins from the same --lc-fill value");
test.assertNotIncludes(stylesCss, "SPECTRUM slider", "the master Glass Mix control no longer gets a separate tinted spectrum track; it matches the standard slider in Liquid Glass and the System 6 slider in Classic");
test.assertIncludes(stylesCss, 'body.use-liquid-glass .liquid-cover-window input[type="checkbox"].lc-check', "Cover Glass replaces the global liquid-glass checkbox only inside its own liquid-glass window");
test.assertIncludes(stylesCss, 'body.use-liquid-glass .liquid-cover-window input[type="checkbox"].lc-check::before', "Cover Glass checkboxes render as compact glass switches with a local knob instead of inheriting the global X glyph");
test.assertIncludes(stylesCss, "clip-path: none", "the local switch explicitly removes the global checkbox X clip path");
test.assertNotIncludes(stylesCss, "linear-gradient(45deg, transparent 42%, rgba(255, 255, 255, 0.96)", "Cover Glass no longer paints checked state as a crossed blue square");
test.assertIncludes(liquidCover, "async function aiSuggestStyle", "the mood/config path adapts to the background with a vision model");
test.assertNotIncludes(liquidCover, "refinePresetToBackground(pr)", "preset buttons apply fixed recipes and do not secretly mutate themselves after click");
test.assertIncludes(liquidCover, "const BACKDROP_FX", "the vision model judges backdrop tone; the code maps it to shadow numbers (dark bg → shadow nearly off, bright bg → softer spread)");
test.assertIncludes(liquidCover, "value * 0.3", "dark-backdrop shadow scales proportionally — 'nearly zero' holds for heavy recipes (thick 30→9), not just clear");
test.assertIncludes(liquidCover, "function applyVisionTint", "vision tint is a colour-harmony call: 'none' keeps the recipe's own veil, and a colorless recipe caps at subtle so 通透 stays 通透");
test.assertIncludes(liquidCover, "tintApplied || \"none\"", "the status line reports the tint strength actually applied (post-cap), never the model's uncapped wish");
test.assertIncludes(liquidCover, "const BACKDROP_ALIAS", "near-enum words from small models (bright/neutral/deep) map to the closed enum instead of being dropped");
test.assertIncludes(liquidCover, '"backdrop\\":\\"light|mid|dark\\"', "the vision prompt asks for backdrop tone as a closed enum — the model never sets shadow numbers directly");
// background-adaptive geometry: the model judges how busy the photo is, the code
// decides thickness/frost from it (busy → thinner + more frosted for legibility).
test.assertIncludes(liquidCover, "const BUSYNESS_FX", "a closed busyness vocabulary maps to deterministic thickness/frost deltas");
test.assertIncludes(liquidCover, "function applyBusyness", "the model's busyness judgement is applied as physics in code");
test.assertIncludes(liquidCover, "clean|moderate|busy", "the vision prompt asks only how busy the background is, not for raw numbers");
test.assertIncludes(liquidCover, "the direction the brightest light comes from", "vision-tuned presets align glare to the background light");
test.assertIncludes(liquidCover, "function currentBgDataUrl", "the background can be downscaled to feed a vision model");
test.assertIncludes(liquidCover, 'type: "image_url"', "the background image is attached as multimodal content when vision is on");
test.assertIncludes(index, 'id="lc-ask-vision"', "a read-background (vision) toggle exists (in the Background section, default on)");
test.assertIncludes(index, 'class="lc-ask-row"', "the bottom form is a DocMap-style label + input/button row");
test.assertIncludes(liquidCover, "async function writeBgPrompt", "the model can write a text-to-image background prompt");
test.assertIncludes(coverBackgroundPrompt, "GPT Image (GPT Image 2)", "the prompt-writer targets GPT Image 2's natural-language style");
test.assertIncludes(coverBackgroundPrompt, "NO separate 'Negative:' line", "it drops SD-style negative prompts (GPT Image has none)");
test.assertIncludes(liquidCover, "Constraints:", "exclusions go in a GPT-Image-2 Constraints clause");
test.assertIncludes(liquidCover, "NEGATIVE SPACE", "the prompt reserves clean negative space for the overlaid glass title");
test.assertIncludes(index, 'id="lc-t2i-out"', "the generated T2I prompt has a copyable output area");
test.assertIncludes(index, 'id="lc-t2i-copy"', "the T2I prompt can be copied");

// --- GPT Image background generation via the server proxy ---
test.assertIncludes(liquidCover, "async function generateBg", "the background can be generated from a prompt");
test.assertIncludes(liquidCover, '"/api/image/generate"', "generation goes through the local server proxy, not a direct browser call");
test.assertIncludes(index, 'id="lc-img-key"', "an image API key field exists");
test.assertIncludes(index, 'id="lc-img-go"', "a Generate Background button exists");
const imageRoute = read("src/server/routes/image-generate.js");
test.assertIncludes(imageRoute, "/images/generations", "the proxy forwards to an OpenAI-compatible images endpoint");
test.assertIncludes(imageRoute, "Authorization", "the API key is attached server-side, never exposed to the browser");
const router = read("src/server/router.js");
test.assertIncludes(router, '"POST /api/image/generate"', "the image route is registered");

// --- generation is gated behind a Control Panel advanced toggle, hidden by default ---
test.assertIncludes(index, 'id="enable-image-gen"', "Control Panel has an advanced toggle for image generation");
test.assertIncludes(index, 'class="lc-group lc-img-group"', "the generation UI is in a gatable group");
test.assertIncludes(stylesCss, ".lc-img-group {\n  display: none;", "the generation UI is hidden by default");
test.assertIncludes(stylesCss, "body.image-gen-enabled .lc-img-group", "the toggle reveals it via a body class");
test.assertNotIncludes(liquidCover, "\nimport ", "feature module is a classic script, not an ES module (no top-level import)");
test.assertNotIncludes(liquidCover, "\nexport ", "feature module is a classic script, not an ES module (no top-level export)");

// --- lazy-loaded, never in the startup bundle ---
test.assertIncludes(manifest, '"app/features/liquid-cover.js"', "module is registered as a lazy runtime path");
const lazyBlock = manifest.slice(manifest.indexOf("lazyRuntimePaths"));
test.assertIncludes(lazyBlock, "app/features/liquid-cover.js", "module sits in lazyRuntimePaths (not appModulePaths)");
test.assertIncludes(app, "ensureLiquidCoverModule", "module is loaded on demand via an ensure helper");
test.assertIncludes(app, 'createLazyModuleLoader("AISystem6LiquidCoverLoaded", ["app/features/liquid-cover.js"])', "ensure helper loads the classic script once");

// --- one-action open, registered everywhere an app belongs ---
test.assertIncludes(app, '"open-liquid-cover": openLiquidCover', "open-liquid-cover action is registered");
test.assertIncludes(app, "window.AISystem6LiquidCover?.open()", "the action opens the tool");
test.assertIncludes(app, "skipLiquidCoverEntrypoint", "direct/restored liquidCover windows are routed through the feature open() without recursion");
test.assertIncludes(liquidCover, 'openWindow("liquidCover", { ...options, skipLiquidCoverEntrypoint: true })', "feature open() marks its own window-manager call as initialized");
test.assertIncludes(app, 'liquidCover: "Cover Glass"', "multi-finder knows the app name (Cover Glass in English, 玻璃封面 in Chinese)");
// the two file-picker name fields must carry an empty-state label, not render
// as mysterious blank boxes next to the Choose buttons.
test.assertIncludes(index, 'id="lc-bg-name" data-i18n="no_files_selected"', "background filename field shows 'No files selected' when empty");
test.assertIncludes(index, 'id="lc-fg-name" data-i18n="no_files_selected"', "foreground filename field shows 'No files selected' when empty");
test.assertIncludes(app, 'liquidCover: "liquidCover"', "multi-finder maps the window to its app");

// the Applications folder window is rendered from getApplicationsItems(), not the
// static HTML buttons — the tool must be registered there to actually appear.
const appJs = read("app.js");
test.assertIncludes(appJs, 'action: "open-liquid-cover"', "Liquid Cover appears in the Applications folder list");

// --- window markup follows System 6 conventions ---
test.assertIncludes(index, 'data-window="liquidCover"', "the window is declared with a data-window id");
test.assertIncludes(index, 'id="lc-canvas"', "the window hosts the WebGL canvas");
test.assertIncludes(index, 'data-action="open-liquid-cover"', "a desktop/Applications launcher opens it");
test.assertIncludes(index, '<div class="select-wrap"><select id="lc-font">', "font picker uses the System 6 custom select harness");
test.assertIncludes(index, 'data-font-system="true">SF Pro · System', "font picker uses Apple platform typography as its default");
test.assertIncludes(index, 'data-font-family="SF Pro Rounded"', "font picker includes the rounded SF family");
test.assertIncludes(index, 'data-font-family="SF Compact"', "font picker includes the compact SF family");
test.assertIncludes(index, 'data-font-family="New York"', "font picker includes Apple's New York serif family");
test.assertIncludes(index, 'data-font-family="PingFang SC"', "font picker includes PingFang SC");
test.assertIncludes(index, 'data-font-family="Songti SC"', "font picker includes a representative Chinese serif face");
test.assertIncludes(index, 'data-font-bundled="true">得意黑 · Smiley Sans', "the open-source Smiley Sans display face is bundled explicitly");
test.assertIncludes(index, 'href="https://developer.apple.com/fonts/"', "unavailable Apple fonts point to the official source instead of being redistributed");
test.assertIncludes(index, 'id="lc-font-import"', "font picker can import a custom font file");
test.assertIncludes(index, 'id="lc-font-file" tabindex="-1" aria-hidden="true"', "the custom font file input stays out of the visible and accessibility control flow");
test.assertIncludes(index, 'accept=".ttf,.otf,.woff,.woff2', "custom font import accepts standard web and desktop font formats");
test.assertIncludes(liquidCover, "new FontFace(family, await file.arrayBuffer())", "custom font files are loaded through the browser font API");
test.assertIncludes(liquidCover, "document.fonts.add(face)", "a loaded custom font is registered for canvas rendering");
test.assertIncludes(liquidCover, 'option.dataset.fontAvailable = available ? "true" : "false"', "built-in font choices state availability without silently disappearing");
test.assertIncludes(liquidCover, 'option?.dataset.fontAvailable === "false"', "selecting an unavailable system font explains the problem instead of silently substituting");
test.assertIncludes(liquidCover, "MAX_FONT_FILE_BYTES = 20 * 1024 * 1024", "custom font imports have a bounded file-size guard");
test.assertIncludes(index, 'id="lc-bg-choose"', "background upload uses a Choose button, not a visible native file input");
test.assertIncludes(index, 'id="lc-bg-input" class="visually-hidden" type="file"', "the native file input stays hidden behind the Choose button");

// --- styling stays in its own override-free layer ---
test.assertIncludes(styleManifest, '"styles/85-liquid-cover.css"', "stylesheet is in the style manifest");
test.assertNotIncludes(stylesCss, "!important", "stylesheet adds no overrides");

// --- responsive: one design, two arrangements (canvas-collapse fix) ---
// A narrow window used to crush the canvas to near-zero (the panel's 360px
// floor never yielded, at any window width — including a phone's full-screen
// shell, which is just the narrow end of the same curve). The fix is a single
// @container switch, not a phone-only special case, matching the direction
// TDI already uses in styles/20-reader-docmap.css.
test.assertIncludes(stylesCss, "@container (max-width: 760px)", "layout direction switches on the window's own measured width");
test.assertIncludes(stylesCss, "grid-template-columns: clamp(150px, 14vw, 190px) minmax(0, 1fr) clamp(300px, 26vw, 360px)", "scene, flexible artboard, and contextual inspector form a real three-pane editor");

// Aspect ratio is a high-frequency canvas property, so it stays in the toolbar;
// material mixing belongs to the Glass context.
test.assertIncludes(index, 'class="lc-toolbar-aspect"', "aspect ratio stays available from the fixed editor toolbar");
test.assertIncludes(index, 'class="lc-group lc-material-group"', "Glass Mix stays in the material inspector");
test.assertIncludes(stylesCss, ".lc-aspect {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));", "aspect ratio is one row of 4, not a 2x2 grid eating the strip's height");

// Only genuinely one-shot actions (export size, export PNG, the aspect note)
// moved into their own tab — freeing the panel head without hiding anything
// that gets touched mid-composition.
test.assertIncludes(index, 'data-lc-inspector-tab="export"', "export is its own tab");
test.assertIncludes(index, 'id="lc-panel-export"', "export tab has a panel");
test.assertIncludes(index, 'data-i18n="liquid_cover_tab_export"', "the export tab is labelled");
const exportPanelMarkup = index.slice(index.indexOf('id="lc-panel-export"'), index.indexOf("</section>", index.indexOf('id="lc-panel-export"')));
const glassPanelMarkup = index.slice(index.indexOf('id="lc-panel-glass"'), index.indexOf('id="lc-panel-export"'));
test.assertIncludes(exportPanelMarkup, 'class="lc-group lc-animation-group"', "animation and video export controls live in the Export tab");
test.assertNotIncludes(glassPanelMarkup, 'class="lc-group lc-animation-group"', "the Glass tab stays focused on glass appearance");

// The canvas has no other way to be seen large on a phone; a small toggle
// hides the panel and lets the stage take the whole window. Desktop keeps its
// existing zoom box for "make the window bigger" — this is for "make just the
// canvas bigger without resizing the window".
test.assertIncludes(index, 'id="lc-stage-expand"', "a stage-expand control exists");
test.assertIncludes(liquidCover, "function wireStageExpand", "it is wired");
test.assertIncludes(index, 'id="lc-stage-expand" aria-label="Fullscreen preview" aria-pressed="false"', "the stage-expand choice exposes its current state");
test.assertIncludes(stylesCss, ".liquid-cover-window.is-stage-focused .lc-panel,\n.liquid-cover-window.is-stage-focused .lc-sidebar {\n  display: none;", "expanding it hides both side panes rather than resizing the window");
test.assertIncludes(stylesCss, "grid-template-columns: auto minmax(0, 1fr);\n    grid-template-rows: auto auto;", "the narrow Cover Glass scene rail reserves real width for its layer list");
test.assertIncludes(stylesCss, ".lc-selection-help {\n    display: none;", "phone Cover Glass removes the verbose selection hint before sacrificing controls");
test.assertIncludes(stylesCss, "grid-template-columns: repeat(3, minmax(0, 1fr));", "phone Cover Glass keeps layer actions in one compact row");
test.assertIncludes(stylesCss, "@container (max-width: 430px) {\n  .liquid-cover-body {\n    grid-template-rows: 46px minmax(238px, 1fr) minmax(224px, 38vh);", "phone Cover Glass fits a layer strip, artboard, and bounded inspector into one screen");
test.assertIncludes(stylesCss, ".lc-sidebar-head,\n  .lc-arrange-panel,\n  .lc-sidebar-actions {\n    display: none;", "phone Cover Glass reduces the desktop scene rail to its real layer strip");
test.assertIncludes(stylesCss, ".lc-panel {\n    grid-template-rows: auto minmax(0, 1fr);\n    padding: 8px 10px 10px;\n    overflow: hidden;", "phone Cover Glass makes the existing inspector a bounded bottom drawer");
test.assertIncludes(index, '<div class="lc-inspector-panel" id="lc-panel-glass"', "the Glass inspector exists");
test.assert(
  index.indexOf('<div class="lc-group lc-material-group">') < index.indexOf('<div class="lc-group lc-layer-glass-group">'),
  "Glass Mix is the first Glass control instead of being buried below per-layer controls and presets"
);

// Shared control states: the feature requests loading semantics but does not
// repaint generic buttons or mutate their labels directly.
test.assertIncludes(liquidCover, "function setBusy", "Cover Glass routes long operations through the shared loading contract");
test.assertIncludes(liquidCover, "setControlLoading(control, busy, label)", "shared controls own aria-busy, disabled restoration, and stable labels");
test.assertIncludes(liquidCover, "setBusy(exportButton, true", "PNG export announces its in-progress state on the initiating control");
test.assertIncludes(liquidCover, "setBusy(button, true", "model and image actions enter the same loading state");
test.assertNotIncludes(stylesCss, "body.use-liquid-glass .liquid-cover-window .btn,", "the Liquid Glass feature skin no longer redraws every generic button");

for (const file of ["app/data/translations-en.js", "app/data/translations-zh.js"]) {
  test.assertIncludes(read(file), "liquid_cover_tab_export:", `${file} has the export tab label`);
  test.assertIncludes(read(file), "liquid_cover_stage_expand:", `${file} has the stage-expand label`);
}

// --- bilingual ---
test.assertIncludes(en, "liquid_cover_title:", "English strings exist");
test.assertIncludes(zh, "liquid_cover_title:", "Chinese strings exist");
test.assertIncludes(zh, '玻璃封面', "Chinese name follows the naming table");
test.assertIncludes(dictionary, 'id: "cover-glass"', "System Help exposes Cover Glass as a production editor");
test.assertIncludes(dictionary, "Glass Mix is the first global material control", "System Help documents the Glass Mix global control and mobile hierarchy");

test.finish();
