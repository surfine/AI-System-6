// Liquid Cover is a summoned tool (not a stop in the writing route): turn any
// text into Apple-style Liquid Glass, composited between a background image and
// a foreground subject, exported as a PNG cover at a platform-safe aspect.
// It must stay lazy-loaded, self-contained, and a one-action open.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-cover");
const liquidCover = read("app/features/liquid-cover.js");
const index = read("index.html");
const stylesCss = read("styles/85-liquid-cover.css");
const manifest = read("scripts/runtime-manifest.mjs");
const styleManifest = read("scripts/style-manifest.mjs");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const app = readAppSurface([
  "app/core/config.js",
  "app/core/actions.js",
  "app/core/multi-finder.js",
  "app/core/window-manager.js",
]);

// --- renderer is self-contained and text-driven ---
test.assertIncludes(liquidCover, "window.AISystem6LiquidCoverLoaded = true", "module marks itself loaded for the lazy guard");
test.assertIncludes(liquidCover, "window.AISystem6LiquidCover = { open }", "module exposes a one-action open()");
test.assertIncludes(liquidCover, "function alphaToSignedDistance", "text silhouette is turned into an exact signed distance field locally");
// edge quality: the raster SDF must be smoothed and sampled smoothly, or the
// glass edge ribs/corrugates when zoomed (EDT facets + angle-snapping normals).
test.assertIncludes(liquidCover, "function smoothSDF", "the distance field is smoothed to remove EDT facets (no ribbed edge, soft rounded glass)");
test.assertIncludes(liquidCover, "OES_texture_float_linear", "the SDF texture is linearly filtered when supported (continuous normals)");
test.assertIncludes(liquidCover, "this.sdfLinear ? gl.LINEAR : gl.NEAREST", "SDF sampling prefers LINEAR, falling back to NEAREST");
test.assertIncludes(liquidCover, "gx=(tr+2.0*mr+br)", "normals use a Sobel (3x3) gradient so the angle-sensitive glare doesn't ring");
test.assertIncludes(liquidCover, "function rasterizeText", "text is rasterized to a coverage mask before the SDF");
test.assertIncludes(liquidCover, "unionSDIdx", "multiple layers union by min() and report the nearest layer for per-layer optics");
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
test.assertIncludes(liquidCover, "uniform int u_layerMode[4]", "each layer can choose glass or solid rendering in the shader");
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
test.assertIncludes(index, 'value="watertext"', "Waterdrop Text targets the reference video's glass text plus droplets look");
test.assertIncludes(index, 'value="surface"', "Surface Glass Text targets the reference video's close-up surface lettering look");
test.assertIncludes(index, 'value="bubbletitle"', "Bubble Title targets the reference video's final title plus bubbles look");
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
test.assertIncludes(liquidCover, "u_liquidOverlayMode", "targeted liquid-glass animation presets can add droplet/bubble overlays on top of SDF glass text");
test.assertIncludes(liquidCover, "glassDrop", "droplets, puddles, and bubbles use a refractive primitive instead of bitmap stickers");
test.assertIncludes(liquidCover, "glassBubble", "Bubble Title uses hollow refractive bubbles instead of flat filled circles");
test.assertIncludes(liquidCover, "extrudedGlyph", "reference-targeted motion presets add a 2.5D glass text extrusion layer instead of staying flat");
test.assertIncludes(liquidCover, "u_sdfScale", "reference-targeted motion presets can scale the SDF text non-destructively without rewriting the user's layer");
test.assertIncludes(liquidCover, "layerScales", "motion presets carry temporary layer scale parameters rather than mutating font size controls");
test.assertIncludes(liquidCover, "cleanBg", "reference-targeted glass text strips the base white material back to the video before adding glass rims");
test.assertIncludes(liquidCover, "sideRim", "the extruded text layer renders a bright side rim like thick glass");
test.assertIncludes(liquidCover, "reflRim", "surface/title presets render a compressed reflection beneath the glass text");
test.assertIncludes(liquidCover, "floorShadow", "Surface Glass Text has contact shadow so it reads as sitting on the product surface");
test.assertIncludes(liquidCover, "const REF_FRAG", "reference-matching presets have a dedicated pseudo-3D render shader instead of stacking more main-shader parameters");
test.assertIncludes(liquidCover, "const REF_FRAG_RAY", "reference presets use the newer ray/volume pass for thick glass text instead of the earlier outline-like prototype");
test.assertIncludes(liquidCover, "vec3 volume", "reference glass text fills the glyph body with refractive volume color instead of leaving only a white rim");
test.assertIncludes(liquidCover, "u_refThickness", "reference glass text uses the measured layer stroke width instead of hard-coded pixel thresholds");
test.assertIncludes(liquidCover, "tubeHeight", "reference glass text builds a normalized heightfield cross-section for tube-like 3D volume");
test.assertIncludes(liquidCover, "meshNormal", "reference glass text derives a 3D normal from the glyph heightfield");
test.assertIncludes(liquidCover, "meshEnv", "reference glass text samples reflected video/background as an environment reflection");
test.assertIncludes(liquidCover, "contactOcclusion", "reference glass text darkens side/contact areas from the heightfield instead of using flat shadow only");
test.assertIncludes(liquidCover, "REF_FRAG_RAY_MESH", "reference presets enable the polished mesh-like glyph pass, not just the base ray prototype");
test.assertIncludes(liquidCover, "surfaceProjectUv", "Surface Glass Text projects the glyph SDF onto a tilted product-surface plane");
test.assertIncludes(liquidCover, "surfaceArc", "Surface Glass Text bends the projected glyph onto a shallow product-surface arc");
test.assertIncludes(liquidCover, "surfaceSideWall", "Surface Glass Text adds a dedicated side-wall occlusion pass for raised glass lettering");
test.assertIncludes(liquidCover, "surfaceContact", "Surface Glass Text casts a projected contact shadow instead of floating as an overlay");
test.assertIncludes(liquidCover, "refSDIdx", "reference mesh sampling can use the projected glyph distance field");
test.assertIncludes(liquidCover, "refGrad", "reference mesh sampling derives refraction normals from the projected SDF, not the flat original glyph");
test.assertIncludes(liquidCover, "rayA", "mesh-like glass text samples opposing refracted rays through the glyph volume");
test.assertIncludes(liquidCover, "fresnelShell", "mesh-like glass text adds a Fresnel shell from the heightfield normal");
test.assertIncludes(liquidCover, "chromeBand", "mesh-like glass text carries chrome environment bands inside the transparent volume");
test.assertIncludes(liquidCover, "this.progRef", "the renderer compiles a separate reference-quality glass text pass");
test.assertIncludes(liquidCover, "params.reference3DMode", "reference presets bypass the old Cover Glass material pass that made them look like white stickers");
test.assertIncludes(liquidCover, "p.reference3DMode = true", "Waterdrop/Surface/Bubble presets opt into the dedicated 3D channel at runtime");
test.assertIncludes(liquidCover, 'preset === "watertext"', "Waterdrop Text is implemented as a time-based preset");
test.assertIncludes(liquidCover, 'preset === "surface"', "Surface Glass Text is implemented as a time-based preset");
test.assertIncludes(liquidCover, 'preset === "bubbletitle"', "Bubble Title is implemented as a time-based preset");
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
test.assertIncludes(liquidCover, "You do NOT set numeric optics", "the prompt forbids the model from inventing raw optical constants");
test.assertNotIncludes(liquidCover, '"glareConvergence":0..100', "the model is never asked for raw optical constants it cannot judge");
test.assertNotIncludes(liquidCover, "Full schema (set every field", "the old free-form numeric-schema prompt is gone");
test.assertIncludes(liquidCover, "function applyRecipeByName", "the model's recipe choice maps to a verified parameter set in code");
test.assertIncludes(liquidCover, "function applyTintStrength", "tint strength is a closed enum mapped to a number in code");
test.assertIncludes(liquidCover, "function lightToAngle", "light direction is a closed enum mapped to a glare angle in code");
test.assertIncludes(liquidCover, "const MODIFIER_FX", "modifiers are a closed vocabulary, each mapped to a deterministic delta");
test.assertIncludes(liquidCover, "function applyModifiers", "bounded modifiers apply without the model touching a raw number");
test.assertIncludes(liquidCover, "function describeChoice", "the model's decision is shown back to the user (explainable, not magic)");
// the bottom mood bar is the primary control (DocMap-style): describe a vibe → AI composes
test.assertIncludes(index, 'id="lc-ask-form"', "a bottom mood/ask bar exists");
test.assertIncludes(index, 'id="lc-ask-input"', "the mood box is where the user describes the vibe");
test.assertIncludes(index, 'id="lc-ask-go"', "the Compose Cover button is on the bottom bar");
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
test.assertIncludes(index, 'class="lc-inspector-tabs"', "the right inspector uses tabs instead of one long scrolling form");
test.assertIncludes(index, 'data-lc-inspector-tab="layers"', "layer and text controls live on a Layers inspector tab");
test.assertIncludes(index, 'data-lc-inspector-tab="media"', "background and foreground controls live on a Media inspector tab");
test.assertIncludes(index, 'data-lc-inspector-tab="glass"', "glass controls live on a Glass inspector tab");
test.assertIncludes(liquidCover, "function setInspectorPanel", "the inspector tabs switch panels without layout inline styles");
test.assertIncludes(liquidCover, "function wireFineTuneGroups", "manual fine-tune opens all subgroups together so expert work is one-click");
test.assertIncludes(liquidCover, "group.open = true", "opening Fine-tune reveals all manual subsections instead of forcing repeated accordion clicks");
test.assertNotIncludes(liquidCover, "other.open = false", "manual fine-tune sections are not mutually exclusive");
test.assertNotIncludes(index, 'id="lc-preset-readout"', "preset buttons stay label-only; no extra explanatory readout in the compact panel");
test.assertIncludes(liquidCover, "dataset.presetKey", "preset buttons carry stable keys for active state and verification");
test.assertIncludes(liquidCover, "aria-pressed", "preset buttons expose their selected state accessibly");
test.assertIncludes(liquidCover, 'setActivePreset(""); syncValueLabels(); scheduleRender();', "manual material edits clear the preset selected state so the button still matches the rendered result");
test.assertNotIncludes(liquidCover, "lc-preset-hint", "preset buttons do not carry redundant visible description text");
test.assertNotIncludes(en, "liquid_cover_preset_ios27_summary", "English preset summary strings are not needed because the effect lives in the recipe");
test.assertNotIncludes(zh, "liquid_cover_preset_ios27_summary", "Chinese preset summary strings are not needed because the effect lives in the recipe");
test.assertIncludes(index, 'class="details-bar lc-status-bar"', "Cover Glass status uses the standard app details bar under the title");
test.assertIncludes(index, 'class="lc-ask-status" id="lc-ai-status" data-i18n="ready"', "the AI status line starts in the top details bar like ClioTalk");
test.assert(
  index.indexOf('class="details-bar lc-status-bar"') < index.indexOf('id="lc-ask-form"'),
  "the Cover Glass status line sits above the workspace, not inside the bottom mood form",
);
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
test.assertIncludes(liquidCover, "GPT Image (GPT Image 2)", "the prompt-writer targets GPT Image 2's natural-language style");
test.assertIncludes(liquidCover, "NO separate 'Negative:' line", "it drops SD-style negative prompts (GPT Image has none)");
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
test.assertIncludes(app, 'loadClassicScriptOnce("app/features/liquid-cover.js")', "ensure helper loads the classic script once");

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
test.assertIncludes(index, 'id="lc-bg-choose"', "background upload uses a Choose button, not a visible native file input");
test.assertIncludes(index, 'id="lc-bg-input" class="visually-hidden" type="file"', "the native file input stays hidden behind the Choose button");

// --- styling stays in its own override-free layer ---
test.assertIncludes(styleManifest, '"styles/85-liquid-cover.css"', "stylesheet is in the style manifest");
test.assertNotIncludes(stylesCss, "!important", "stylesheet adds no overrides");

// --- bilingual ---
test.assertIncludes(en, "liquid_cover_title:", "English strings exist");
test.assertIncludes(zh, "liquid_cover_title:", "Chinese strings exist");
test.assertIncludes(zh, '玻璃封面', "Chinese name follows the naming table");

test.finish();
