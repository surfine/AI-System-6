// CMF Studio server engine.
// Recolors semantic iPhone parts inside a USDZ and renders Quick Look-style PNG views.

"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile: execFileCallback, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");

const { repoRoot } = require("../lib/build-info.js");

const execFile = promisify(execFileCallback);
const EXPORT_TIMEOUT_MS = 180000;
const RENDER_TIMEOUT_MS = 240000;

// Colors are Apple's own finishes, sampled from the official store swatches
// (store.storeimages.cdn-apple.com/.../iphone-17*-finish-<color>-2025*). CMF
// Studio only ever offers colors that shipped on the real part.
const IPHONE_17_PALETTE = Object.freeze({
  black17: { label: "Black", hex: "#353839" },
  lavender17: { label: "Lavender", hex: "#dfceea" },
  mistBlue17: { label: "Mist Blue", hex: "#96aed1" },
  sage17: { label: "Sage", hex: "#a9b689" },
  white17: { label: "White", hex: "#f5f5f5" },
});

const IPHONE_17_PRO_PALETTE = Object.freeze({
  cosmicOrange17Pro: { label: "Cosmic Orange", hex: "#f78039" },
  deepBlue17Pro: { label: "Deep Blue", hex: "#47547e" },
  silver17Pro: { label: "Silver", hex: "#e7e7e7" },
});

const IPHONE_17E_PALETTE = Object.freeze({
  black17e: { label: "Black", hex: "#4a4e51" },
  white17e: { label: "White", hex: "#fafafa" },
  softPink17e: { label: "Soft Pink", hex: "#fce7e6" },
});

const IPHONE_AIR_PALETTE = Object.freeze({
  spaceBlackAir: { label: "Space Black", hex: "#131313" },
  cloudWhiteAir: { label: "Cloud White", hex: "#fcfcfc" },
  lightGoldAir: { label: "Light Gold", hex: "#faf3e5" },
  skyBlueAir: { label: "Sky Blue", hex: "#e5f2fa" },
});

// MacBook Neo official finishes, sampled from apple.com.cn store swatches
// (macbook-neo-<color>-cto-hero-202603_SW_COLOR). Every part is sold in every
// finish, so one palette serves the whole machine.
const MACBOOK_NEO_PALETTE = Object.freeze({
  silverNeo: { label: "Silver", hex: "#e5e6e7" },
  blushNeo: { label: "Blush", hex: "#ead5d4" },
  citrusNeo: { label: "Citrus", hex: "#dddc8c" },
  indigoNeo: { label: "Indigo", hex: "#67738b" },
});

const partAliases = Object.freeze({
  actionButton: "actionOrSim",
  actionOrSim: "actionOrSim",
  usbC: "usbC",
  speakerScrews: "screwOrSpeaker",
});

// The Pro and the Pro Max are split out of one Apple asset, so they share mesh
// names. Side controls are skipped by the geometric classifier by design, and
// the Pro's back glass is only an inlay (~2/3 of the body) rather than the whole
// panel, so both need naming here.
const IPHONE_17_PRO_MESH_PARTS = Object.freeze({
  MurNHnRHsVHWaxp: "actionOrSim",
  YMhcZuJreIkCuNy: "volumeUp",
  VOwOyTIgUdFOGSH: "volumeDown",
  oKryyXghVaYcnxt: "sideButton",
  LXcFmsoszzDyTrR: "cameraControl",
  VAAxcOWnKYsQZew: "cameraControl",
  AepdVkPZeAmapGK: "cameraControl",
  gCMlCSdRJrizepS: "backGlass",
  vDwikmBvgqpSImF: "backGlass",
});

// The 17e has no Camera Control, so its right edge carries only the side
// button; the rest of the layout matches the other models.
const IPHONE_17E_MESH_PARTS = Object.freeze({
  MNFvcyIPvJHZGho: "actionOrSim",
  wvehvZgKSiHShKe: "volumeUp",
  grjpZqMAFshUbYL: "volumeDown",
  bAdaiwDyPNSIOTz: "sideButton",
});

// The Air is a separate Apple asset, but its side controls sit in the same
// places and carry the same shapes, so they are identified the same way.
const IPHONE_AIR_MESH_PARTS = Object.freeze({
  YkCTFFnfNRTcvhu: "actionOrSim",
  gxvVEZnHDLTMeDu: "volumeUp",
  ZozkCecQqsHKRdW: "volumeDown",
  eFAjqNXqlosYdcs: "sideButton",
  zvTKDcDzjwBqPXl: "cameraControl",
  oeeuEHMiwxuyjiE: "cameraControl",
  mKggmceRYtWVyLb: "cameraControl",
});

// Official Apple self-service parts, mapped onto the MacBook Neo AR asset.
// The lid is the display assembly (shell, screen, camera), the top case is the
// keyboard deck, and the USB-C boards are the two port clusters. The keycap
// strips are the keyboard's coloured rows; the trackpad is texture-baked into
// the deck in this asset, so it is not a separate part here.
const MACBOOK_NEO_MESH_PARTS = Object.freeze({
  // lid (display assembly)
  LTxTFlhLWoHyhvo: "lid",
  sGDniMbgLiwHqFw: "lid",
  ZMGnWkiZEPXzRiw: "lid",
  iGKSuTNlIlEGpLp: "lid",
  LUMtYvTEVNmTHoQ: "lid",
  rvnQqsVlUxgRHpf: "lid",
  // top case (keyboard deck)
  RtqozqWvXTJHuDi: "topCase",
  RGLDQJKTekftnoB: "topCase",
  fylMvyMYpOJcbku: "topCase",
  KMIKFolgYmmmahm: "topCase",
  TJrncXRMBNoKueV: "topCase",
  RBmsNybhFEScfui: "topCase",
  LhZMVgrGkfDhZnJ: "topCase",
  TaNFpMmKHqePKML: "topCase",
  EXRYTxHqZCxcjZx: "topCase",
  // The base is a unibody: the two outer shells carry the palm rest, the sides
  // and the underside edge, which is what Apple calls the top case. Only the
  // separate lower panel (and its liner) is the bottom case.
  IYjUsjnVPLevabB: "topCase",
  ubZKAAJmPSUZVHj: "topCase",
  AHewMMzHKsIFykK: "bottomCase",
  JcBLefbhAcSFtfV: "bottomCase",
  // Keycaps: the key field proper. Three layers sit in the keyboard well —
  // the recessed bed (y 0.12) and the legend plane (y 0.27) belong to the deck,
  // and only the raised caps between them take the keycap finish. The strips
  // that used to be named here live at the hinge edge and are never visible.
  AqcQCwqkepkmIxJ: "keycaps",
  ldFDBmejSXToUkP: "topCase",
  qQGZuUUMeRVQGEY: "topCase",
  ymYLIOEGFuqNeyB: "topCase",
  // USB-C boards (right cluster + left cluster)
  UDjFocEFPMTxxzE: "usbC",
  bkNkMexbhfuRgXd: "usbC",
  uMvgvtrefotcxLA: "usbC",
  vpFYGndskQCpAiL: "usbC",
  KwFQtiwiPZcwELa: "usbC",
  MdEwZxJYnatsNEo: "usbC",
  cMzncBRnxGSiixF: "usbC",
  RxQwEeRZjARFsvN: "usbC",
  WWvgVRnfZBeNwpP: "usbC",
  jXEhAmPcGAkgmPq: "usbC",
  WJWxyVsmuaogzKH: "usbC",
  UdgYVXrcknzsfzU: "usbC",
  UgnigMDmuhQEbNc: "usbC",
  GDzFfJLYgiBMTFB: "usbC",
  DrJauNLaRtCxyAy: "usbC",
  bqcaMJZxVDeevNs: "usbC",
  MHkxrMAWDVbaaeW: "usbC",
  hgRUNThRBKzoawn: "usbC",
  ckddmGzikslSSZi: "usbC",
  VFFQHFXIwreyxOW: "usbC",
  BNEVCQcWteGdere: "usbC",
  gOxaRXQOCdmPKSH: "usbC",
});

/**
 * One entry per shipped model. Assets are produced by
 * scripts/cmf-prepare-model.mjs, which also records where they came from.
 * `exactMeshParts` overrides the geometric classifier for parts too small or
 * too oddly placed to recognise from their bounding box alone.
 */
const MODELS = Object.freeze({
  "iphone-17-standard": {
    id: "iphone-17-standard",
    label: "iPhone 17",
    asset: path.join(repoRoot, "assets", "cmf", "iphone-17-standard.usdz"),
    paletteMeta: IPHONE_17_PALETTE,
    defaultParts: {
      frame: "black17",
      frameSide: "black17",
      backGlass: "white17",
      volumeUp: "lavender17",
      volumeDown: "mistBlue17",
      actionOrSim: "sage17",
      simTray: "lavender17",
      sideButton: "white17",
      cameraControl: "black17",
      usbC: "mistBlue17",
      screwOrSpeaker: "sage17",
      cameraPlate: "sage17",
    },
    exactMeshParts: {
      psstnNZmWlkGpGJ: "actionOrSim",
      aabQdFuOayXiOAy: "volumeUp",
      fQDGdPVinVFkDgA: "volumeDown",
      DRSYKrXjlbGZrGD: "sideButton",
      SdLaeCAiKFeDCSz: "cameraControl",
      ohRsmdOpfcWOasQ: "cameraControl",
      kQtKvBruXjVcFqZ: "cameraControl",
      tXyqmuCYyFmMJhw: "simTray",
    },
  },
  "iphone-17-pro": {
    id: "iphone-17-pro",
    label: "iPhone 17 Pro",
    asset: path.join(repoRoot, "assets", "cmf", "iphone-17-pro.usdz"),
    paletteMeta: IPHONE_17_PRO_PALETTE,
    // Apple's AR asset is the eSIM build, so this model has no SIM tray.
    defaultParts: {
      frame: "cosmicOrange17Pro",
      frameSide: "cosmicOrange17Pro",
      backGlass: "cosmicOrange17Pro",
      volumeUp: "cosmicOrange17Pro",
      volumeDown: "cosmicOrange17Pro",
      actionOrSim: "cosmicOrange17Pro",
      sideButton: "cosmicOrange17Pro",
      cameraControl: "cosmicOrange17Pro",
      usbC: "silver17Pro",
      screwOrSpeaker: "silver17Pro",
      cameraPlate: "cosmicOrange17Pro",
    },
    exactMeshParts: IPHONE_17_PRO_MESH_PARTS,
  },
  "iphone-17-pro-max": {
    id: "iphone-17-pro-max",
    label: "iPhone 17 Pro Max",
    asset: path.join(repoRoot, "assets", "cmf", "iphone-17-pro-max.usdz"),
    paletteMeta: IPHONE_17_PRO_PALETTE,
    defaultParts: {
      frame: "cosmicOrange17Pro",
      frameSide: "cosmicOrange17Pro",
      backGlass: "cosmicOrange17Pro",
      volumeUp: "cosmicOrange17Pro",
      volumeDown: "cosmicOrange17Pro",
      actionOrSim: "cosmicOrange17Pro",
      sideButton: "cosmicOrange17Pro",
      cameraControl: "cosmicOrange17Pro",
      usbC: "silver17Pro",
      screwOrSpeaker: "silver17Pro",
      cameraPlate: "cosmicOrange17Pro",
    },
    exactMeshParts: IPHONE_17_PRO_MESH_PARTS,
  },
  "iphone-air": {
    id: "iphone-air",
    label: "iPhone Air",
    asset: path.join(repoRoot, "assets", "cmf", "iphone-air.usdz"),
    paletteMeta: IPHONE_AIR_PALETTE,
    // eSIM build, so no SIM tray.
    defaultParts: {
      frame: "spaceBlackAir",
      frameSide: "spaceBlackAir",
      backGlass: "spaceBlackAir",
      volumeUp: "spaceBlackAir",
      volumeDown: "spaceBlackAir",
      actionOrSim: "spaceBlackAir",
      sideButton: "spaceBlackAir",
      cameraControl: "spaceBlackAir",
      usbC: "cloudWhiteAir",
      screwOrSpeaker: "cloudWhiteAir",
      cameraPlate: "spaceBlackAir",
    },
    exactMeshParts: IPHONE_AIR_MESH_PARTS,
  },
  "iphone-17e": {
    id: "iphone-17e",
    label: "iPhone 17e",
    asset: path.join(repoRoot, "assets", "cmf", "iphone-17e.usdz"),
    paletteMeta: IPHONE_17E_PALETTE,
    // eSIM build, and this model has no Camera Control at all.
    defaultParts: {
      frame: "black17e",
      frameSide: "black17e",
      backGlass: "black17e",
      volumeUp: "black17e",
      volumeDown: "black17e",
      actionOrSim: "black17e",
      sideButton: "black17e",
      usbC: "white17e",
      screwOrSpeaker: "white17e",
      cameraPlate: "black17e",
    },
    exactMeshParts: IPHONE_17E_MESH_PARTS,
  },
  "macbook-neo": {
    id: "macbook-neo",
    label: "MacBook Neo",
    // One asset per pose: scripts/cmf-prepare-model.mjs flattens the Apple
    // Color/Pose variant set and bakes every xform into the mesh points, so
    // the text recolor pipeline sees a single world-space model per file.
    poses: [
      {
        id: "closed",
        label: "Closed",
        asset: path.join(repoRoot, "assets", "cmf", "macbook-neo-closed.usdz"),
      },
      {
        id: "open",
        label: "Open",
        asset: path.join(repoRoot, "assets", "cmf", "macbook-neo-open.usdz"),
      },
    ],
    paletteMeta: MACBOOK_NEO_PALETTE,
    // The MacBook's finish lives on the enclosure, not on phone-shaped parts;
    // every recolorable surface is named explicitly and the geometric
    // classifier (tuned for phones) is disabled for this model.
    exactOnly: true,
    defaultParts: {
      lid: "silverNeo",
      topCase: "silverNeo",
      bottomCase: "silverNeo",
      keycaps: "citrusNeo",
      usbC: "silverNeo",
    },
    exactMeshParts: MACBOOK_NEO_MESH_PARTS,
  },
});

const DEFAULT_MODEL_ID = "iphone-17-standard";

function getModel(modelId) {
  const model = MODELS[modelId];
  if (!model) throw httpError(400, `Unsupported CMF model: ${modelId}`);
  return model;
}

/** Palette as raw rgb triples, keyed by color id. */
function modelPalette(model) {
  const entries = Object.entries(model.paletteMeta)
    .map(([id, meta]) => [id, parseHex(meta.hex)]);
  return Object.fromEntries(entries);
}

function getCapabilities() {
  const commands = [
    checkCommand("unzip", ["-v"]),
    checkCommand("zip", ["--version"]),
    checkCommand("usdcat", ["--help"]),
    checkCommand("usdzip", ["--help"]),
    checkCommand("swift", ["--version"]),
    checkCommand("sips", ["-h"]),
  ];
  const byName = Object.fromEntries(commands.map((item) => [item.name, item]));
  // The shipped source layer is text (.usda), so the exporter only needs
  // unzip + zip to recolor and repackage it — no USD CLI tools, which is what
  // lets the same code run on a plain Linux VPS.
  const canExport = Boolean(byName.unzip.available && byName.zip.available);
  return {
    model: DEFAULT_MODEL_ID,
    palette: MODELS[DEFAULT_MODEL_ID].paletteMeta,
    models: Object.values(MODELS).map((model) => {
      const hasPoses = "poses" in model;
      return {
        id: model.id,
        label: model.label,
        palette: model.paletteMeta,
        parts: Object.keys(model.defaultParts),
        defaultParts: model.defaultParts,
        poses: hasPoses
          ? model.poses.map((pose) => ({
              id: pose.id,
              label: pose.label,
              available: fsSync.existsSync(pose.asset),
              views: softwareViewsFor(model.id, pose.id).map((view) => view.name),
            }))
          : [],
        available: hasPoses
          ? model.poses.some((pose) => fsSync.existsSync(pose.asset))
          : fsSync.existsSync(model.asset),
      };
    }),
    canExport,
    canRenderViews: canExport,
    renderBackend: byName.swift.available ? "scenekit+software" : "software",
    commands: byName,
  };
}

function checkCommand(name, args) {
  const result = spawnSync(name, args, { encoding: "utf8", timeout: 3000 });
  if (result.error) {
    const detail = /** @type {any} */ (result.error).code || result.error.message;
    return { name, available: false, detail };
  }
  const detail = `${result.stdout || result.stderr || ""}`.split("\n").find(Boolean) || `exit ${result.status}`;
  return { name, available: true, detail: detail.slice(0, 160) };
}

async function exportRecipeUsdz(inputRecipe) {
  const recipe = normalizeRecipe(inputRecipe);
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "ai6-cmf-export-"));
  try {
    const source = await materializeModelAsset(workdir, recipe.model, recipe.pose);
    const output = path.join(workdir, `${recipe.slug}.usdz`);
    const result = await makeUsdz(source, output, recipe);
    const buffer = await fs.readFile(output);
    return {
      filename: `${recipe.slug}.usdz`,
      contentType: "model/vnd.usdz+zip",
      buffer,
      recipe,
      stats: result,
    };
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

async function renderRecipeViews(inputRecipe) {
  const recipe = normalizeRecipe(inputRecipe);
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "ai6-cmf-render-"));
  try {
    const source = await materializeModelAsset(workdir, recipe.model, recipe.pose);
    const usdzPath = path.join(workdir, `${recipe.slug}.usdz`);
    await makeUsdz(source, usdzPath, recipe);

    const viewsDir = path.join(workdir, "views");
    await fs.mkdir(viewsDir, { recursive: true });
    const scriptPath = path.join(workdir, "render-usdz-scenekit.swift");
    const moduleCache = path.join(workdir, "swift-module-cache");
    await fs.mkdir(moduleCache, { recursive: true });
    await fs.writeFile(scriptPath, SCENEKIT_RENDERER_SOURCE);
    try {
      await execFile("swift", [scriptPath, usdzPath, viewsDir], {
        timeout: RENDER_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          CLANG_MODULE_CACHE_PATH: moduleCache,
          SWIFT_MODULE_CACHE_PATH: moduleCache,
        },
      });
    } catch {
      await renderSoftwareViews(usdzPath, viewsDir, null, recipe.model, recipe.pose);
    }

    let files = (await fs.readdir(viewsDir))
      .filter((name) => name.endsWith(".png"))
      .sort();
    if (!files.length) {
      await renderSoftwareViews(usdzPath, viewsDir, null, recipe.model, recipe.pose);
      files = (await fs.readdir(viewsDir))
        .filter((name) => name.endsWith(".png"))
        .sort();
    }
    const views = [];
    for (const file of files) {
      const data = await fs.readFile(path.join(viewsDir, file));
      views.push({
        name: file.replace(/\.png$/, ""),
        filename: file,
        dataUrl: `data:image/png;base64,${data.toString("base64")}`,
      });
    }
    return { recipe, views };
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

async function renderRecipePreview(inputRecipe, viewName = "02-back") {
  const recipe = normalizeRecipe(inputRecipe);
  const view = resolveSoftwareView(viewName, recipe.model, recipe.pose);
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "ai6-cmf-preview-render-"));
  try {
    const source = await materializeModelAsset(workdir, recipe.model, recipe.pose);
    const usdzPath = path.join(workdir, `${recipe.slug}.usdz`);
    await makeUsdz(source, usdzPath, recipe);
    const scene = await loadSoftwareScene(usdzPath);
    const png = await renderSoftwarePng(scene, view);
    return {
      recipe,
      view: {
        name: view.name,
        filename: `${view.name}.png`,
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      },
    };
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

async function renderSoftwareViews(input, outDir, viewNames, modelId, pose) {
  const scene = await loadSoftwareScene(input);
  for (const view of resolveSoftwareViews(modelId, pose, viewNames)) {
    const png = await renderSoftwarePng(scene, view);
    await fs.writeFile(path.join(outDir, `${view.name}.png`), png);
  }
}

function resolveSoftwareView(viewName, modelId, pose) {
  return resolveSoftwareViews(modelId, pose, [viewName])[0];
}

function resolveSoftwareViews(modelId, pose, viewNames) {
  const model = modelId ? MODELS[modelId] : null;
  const pool = model?.poses ? softwareViewsFor(modelId, pose) : SOFTWARE_VIEWS;
  if (!viewNames) return pool;
  const wanted = new Set([].concat(viewNames).map((name) => String(name || "").trim()).filter(Boolean));
  const views = pool.filter((view) => wanted.has(view.name));
  if (!views.length) throw httpError(400, `Unsupported CMF preview view: ${[...wanted].join(", ") || "none"}`);
  return views;
}

function softwareViewsFor(modelId, pose) {
  const model = MODELS[modelId];
  if (model?.poses) {
    const poseViews = MACBOOK_NEO_VIEWS[pose] || MACBOOK_NEO_VIEWS.closed;
    return poseViews;
  }
  return SOFTWARE_VIEWS;
}

async function loadSoftwareScene(input) {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "ai6-cmf-preview-"));
  try {
    await execFile("unzip", ["-q", input, "-d", workdir], { timeout: EXPORT_TIMEOUT_MS });
    const rootLayer = (await fs.readdir(workdir))
      .map((name) => path.join(workdir, name))
      .find((file) => /\.(usdc|usda|usd)$/i.test(file));
    if (!rootLayer) throw httpError(422, "No root USD layer found inside rendered USDZ.");
    let source = "";
    try {
      source = await fs.readFile(rootLayer, "utf8");
    } catch {
      source = "";
    }
    if (!source.trimStart().startsWith("#usda")) {
      // Defensive fallback for a binary (.usdc) root layer: convert with
      // usdcat when the tool is available (macOS local), otherwise report a
      // clear error instead of garbling the layer.
      const textLayer = path.join(workdir, "model.usda");
      try {
        await execFile("usdcat", [rootLayer, "-o", textLayer], { timeout: EXPORT_TIMEOUT_MS });
        source = await fs.readFile(textLayer, "utf8");
      } catch {
        throw httpError(422, "CMF preview needs a text USD layer (usdcat is unavailable).");
      }
    }
    return parseSoftwareScene(source);
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

function parseSoftwareScene(source) {
  const materials = parseSoftwareMaterials(source);
  const triangles = [];
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };

  for (const mesh of blocksWithEnd(source, /def Mesh "([^"]+)"/g)) {
    const points = parseVec3Array(mesh.body, "point3f[] points");
    const counts = parseNumberArray(mesh.body, "int[] faceVertexCounts");
    const indices = parseNumberArray(mesh.body, "int[] faceVertexIndices");
    if (!points.length || !counts.length || !indices.length) continue;

    const binding = mesh.body.match(/rel material:binding\s*=\s*<([^>]+)>/);
    const materialName = binding ? binding[1].split("/").pop() : "";
    const material = materials.get(materialName) || { color: [0.7, 0.7, 0.7], metallic: 0 };
    const color = material.color.map((value) => clamp(value, 0, 1));

    let cursor = 0;
    for (const count of counts) {
      const face = indices.slice(cursor, cursor + count).map((index) => points[index]).filter(Boolean);
      cursor += count;
      if (face.length < 3) continue;

      for (let i = 1; i < face.length - 1; i += 1) {
        const tri = [face[0], face[i], face[i + 1]];
        const normal = normalizeVector(crossVector(subVector(tri[1], tri[0]), subVector(tri[2], tri[0])));
        for (const point of tri) {
          for (let axis = 0; axis < 3; axis += 1) {
            bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
            bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
          }
        }
        triangles.push({ p: tri, n: normal, c: color, m: material.metallic || 0 });
      }
    }
  }

  return { triangles, bounds };
}

function parseSoftwareMaterials(text) {
  const materials = new Map();
  for (const material of blocksWithEnd(text, /def Material "([^"]+)"/g)) {
    const colorMatch = material.body.match(/color3f inputs:diffuseColor\s*=\s*\(([^)]+)\)/);
    const metallicMatch = material.body.match(/float inputs:metallic\s*=\s*([0-9.eE+-]+)/);
    const color = colorMatch
      ? colorMatch[1].split(",").map((value) => Number(value.trim()))
      : [0.62, 0.62, 0.62];
    materials.set(material.name, {
      color: color.map((value) => clamp(value, 0, 1)),
      metallic: metallicMatch ? Number(metallicMatch[1]) : 0,
    });
  }
  return materials;
}

async function renderSoftwarePng(scene, view) {
  const width = 1400;
  const height = 1000;
  const pixels = Buffer.alloc(width * height * 4, 0);
  const z = new Float32Array(width * height);
  z.fill(-Infinity);

  const cam = normalizeVector(view.cam);
  const up = normalizeVector(view.up);
  const right = normalizeVector(crossVector(up, cam));
  const trueUp = normalizeVector(crossVector(cam, right));
  const target = viewTarget(view, scene.bounds);
  const projected = projectBounds(scene.bounds, target, right, trueUp);
  const span = Math.max(projected.width, projected.height * (width / height));
  const scale = (Math.min(width, height) * 0.76 * (view.zoom || 1)) / span;
  const light = normalizeVector([-0.35, -0.75, 0.8]);
  const fill = normalizeVector([0.6, 0.5, 0.5]);

  for (const tri of scene.triangles) {
    const pts = tri.p.map((point) => projectPoint(point, target, right, trueUp, cam, width, height, scale));
    rasterTriangle(pixels, z, width, height, pts, tri, cam, light, fill);
  }

  return encodePngRgba(width, height, pixels);
}

function projectPoint(point, target, right, up, cam, width, height, scale) {
  const local = subVector(point, target);
  return {
    x: width / 2 + dotVector(local, right) * scale,
    y: height / 2 - dotVector(local, up) * scale,
    d: dotVector(local, cam),
  };
}

function rasterTriangle(pixels, zBuffer, width, height, pts, tri, cam, light, fill) {
  const minX = Math.max(0, Math.floor(Math.min(pts[0].x, pts[1].x, pts[2].x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(pts[0].x, pts[1].x, pts[2].x)));
  const minY = Math.max(0, Math.floor(Math.min(pts[0].y, pts[1].y, pts[2].y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(pts[0].y, pts[1].y, pts[2].y)));
  const area = edge(pts[0], pts[1], pts[2]);
  if (Math.abs(area) < 0.001) return;

  const normal = tri.n;
  const face = Math.abs(dotVector(normal, cam));
  const key = face < 0.08 ? 0.86 : 1;
  const lambert = Math.max(0, dotVector(normal, light));
  const bounce = Math.max(0, dotVector(normal, fill));
  const shade = clamp(0.58 + lambert * 0.34 + bounce * 0.12, 0.42, 1.15) * key;
  const rim = Math.pow(1 - face, 2) * 0.08;
  const spec = Math.pow(Math.max(0, dotVector(normal, normalizeVector(addVector(light, cam)))), 24) * (0.12 + tri.m * 0.18);
  const color = tri.c.map((channel) => clamp(channel * shade + rim + spec, 0, 1));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const p = { x: x + 0.5, y: y + 0.5 };
      const w0 = edge(pts[1], pts[2], p) / area;
      const w1 = edge(pts[2], pts[0], p) / area;
      const w2 = edge(pts[0], pts[1], p) / area;
      if (w0 < -0.0001 || w1 < -0.0001 || w2 < -0.0001) continue;
      const depth = pts[0].d * w0 + pts[1].d * w1 + pts[2].d * w2;
      const index = y * width + x;
      if (depth <= zBuffer[index]) continue;
      zBuffer[index] = depth;
      const px = index * 4;
      pixels[px] = Math.round(color[0] * 255);
      pixels[px + 1] = Math.round(color[1] * 255);
      pixels[px + 2] = Math.round(color[2] * 255);
      pixels[px + 3] = 255;
    }
  }
}

function encodePngRgba(width, height, rgba) {
  const zlib = require("node:zlib");
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), typeBuffer, data, u32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function u32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value >>> 0, 0);
  return out;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function projectBounds(bounds, target, right, up) {
  const corners = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) corners.push([x, y, z]);
    }
  }
  const xs = corners.map((point) => dotVector(subVector(point, target), right));
  const ys = corners.map((point) => dotVector(subVector(point, target), up));
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function centerOf(bounds) {
  return bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
}

/** Absolute look-at point for a view, resolved against the model's own size. */
function viewTarget(view, bounds) {
  const center = centerOf(bounds);
  if (!view.targetFraction) return center;
  return center.map((value, axis) => value + view.targetFraction[axis] * (bounds.max[axis] - bounds.min[axis]));
}

function edge(a, b, c) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function crossVector(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subVector(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addVector(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function dotVector(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeVector(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const SOFTWARE_VIEWS = [
  { name: "01-front", cam: [0, 1, 0.04], up: [0, 0, -1], zoom: 1.04 },
  { name: "02-back", cam: [0, -1, 0.04], up: [0, 0, -1], zoom: 1.04 },
  { name: "03-rear-hero", cam: [-0.72, -1, 0.42], up: [0, 0, -1], zoom: 1.1 },
  { name: "04-front-hero", cam: [-0.72, 1, 0.32], up: [0, 0, -1], zoom: 1.1 },
  { name: "05-buttons-side", cam: [-1, 0, 0.02], up: [0, 0, -1], zoom: 1.36 },
  { name: "06-control-side", cam: [1, -0.22, 0.06], up: [0, 0, -1], zoom: 1.32 },
  // Close-up targets are fractions of the model's own bounding box (offset from
  // its center), so the same view framing holds for every device size. The
  // fractions reproduce the original absolute targets on iPhone 17.
  { name: "07-camera-close", cam: [-0.58, -1, 0.38], up: [0, 0, -1], targetFraction: [0.2624, -0.272, -0.35], zoom: 2.25 },
  { name: "08-bottom-usb", cam: [0.08, -0.35, 1], up: [0, -1, 0], targetFraction: [0, -0.026, 0.3467], zoom: 2.25 },
  { name: "09-top-edge", cam: [0.14, -0.38, -1], up: [0, 1, 0], targetFraction: [0, -0.026, -0.3467], zoom: 2.05 },
];

// MacBook Neo view sets, one per pose. The closed machine is a slab: lid
// exterior faces +y, bottom case -y, hinge at -z, camera notch at +z, ports on
// the left edge. The open machine is an L: screen faces +z, keyboard deck +y.
// targetFraction is relative to each pose's own bounding box, so the same
// definitions hold for any laptop size.
const MACBOOK_NEO_VIEWS = {
  closed: [
    { name: "01-lid-top", cam: [0, 1, 0], up: [0, 0, -1], zoom: 1.05 },
    { name: "02-bottom", cam: [0, -1, 0], up: [0, 0, -1], zoom: 1.05 },
    { name: "03-hero-front", cam: [-0.55, 0.62, 0.56], up: [0, 1, 0], zoom: 1.12 },
    { name: "04-hero-back", cam: [0.55, 0.62, -0.56], up: [0, 1, 0], zoom: 1.12 },
    { name: "05-side-left", cam: [-1, 0.08, 0.1], up: [0, 1, 0], zoom: 1.34 },
    { name: "06-side-right", cam: [1, 0.08, 0.1], up: [0, 1, 0], zoom: 1.34 },
    { name: "07-front-edge", cam: [0, 0.15, 1], up: [0, 1, 0], zoom: 1.3 },
    { name: "08-hinge-edge", cam: [0, 0.15, -1], up: [0, 1, 0], zoom: 1.3 },
    { name: "09-ports-close", cam: [-1, 0.02, 0.05], up: [0, 1, 0], targetFraction: [-0.486, 0.007, -0.355], zoom: 2.2 },
  ],
  open: [
    { name: "01-screen", cam: [0, 0.05, 1], up: [0, 1, 0], zoom: 1.1 },
    { name: "02-deck-top", cam: [0, 1, 0], up: [0, 0, -1], zoom: 1.12 },
    { name: "03-hero-open", cam: [-0.6, 0.45, 0.66], up: [0, 1, 0], zoom: 1.16 },
    { name: "04-hero-back", cam: [0.6, 0.4, -0.68], up: [0, 1, 0], zoom: 1.16 },
    { name: "05-side-left", cam: [-1, 0.12, 0.08], up: [0, 1, 0], zoom: 1.3 },
    { name: "06-side-right", cam: [1, 0.12, 0.08], up: [0, 1, 0], zoom: 1.3 },
    { name: "07-keyboard-close", cam: [0, 0.55, 0.83], up: [0, 0, -1], targetFraction: [0, -0.45, 0.009], zoom: 2.2 },
    { name: "08-hinge-close", cam: [0, 0.2, 0.98], up: [0, 1, 0], targetFraction: [0, -0.44, -0.237], zoom: 2.1 },
    { name: "09-ports-close", cam: [-1, 0.05, 0.08], up: [0, 1, 0], targetFraction: [-0.486, -0.459, -0.13], zoom: 2.3 },
  ],
};

function normalizeRecipe(inputRecipe = {}) {
  const raw = /** @type {{ model?: string, name?: string, pose?: string, parts?: Record<string, unknown> }} */ (
    inputRecipe && typeof inputRecipe === "object" ? inputRecipe : {}
  );
  const modelId = raw.model || DEFAULT_MODEL_ID;
  const model = getModel(modelId);
  const palette = model.paletteMeta;
  let pose = null;
  if (model.poses) {
    pose = String(raw.pose || "closed");
    if (!model.poses.some((entry) => entry.id === pose)) {
      throw httpError(400, `Unsupported CMF pose '${raw.pose}' for ${modelId}`);
    }
  }

  const parts = { ...model.defaultParts };
  const rawParts = raw.parts && typeof raw.parts === "object" ? raw.parts : {};
  const suppliedParts = new Set();
  for (const [rawPart, rawColor] of Object.entries(rawParts)) {
    const part = partAliases[rawPart] || rawPart;
    if (!Object.prototype.hasOwnProperty.call(parts, part)) continue;
    const color = String(rawColor || "").trim();
    if (!Object.prototype.hasOwnProperty.call(palette, color)) {
      throw httpError(400, `Unsupported CMF color '${rawColor}' for ${rawPart} on ${modelId}`);
    }
    suppliedParts.add(part);
    parts[part] = color;
  }

  if (!suppliedParts.has("frameSide")) parts.frameSide = parts.frame;
  if (!suppliedParts.has("screwOrSpeaker")) parts.screwOrSpeaker = parts.usbC;

  const slug = safeSlug(raw.name || `${modelId}-${pose || ""}-cmf-${Date.now().toString(36)}`);
  return { model: modelId, pose, parts, slug };
}

async function materializeModelAsset(workdir, modelId, pose) {
  const model = getModel(modelId);
  const asset = model.poses
    ? model.poses.find((entry) => entry.id === pose)?.asset
    : model.asset;
  if (!asset || !fsSync.existsSync(asset)) {
    throw httpError(500, `CMF source model is missing: ${asset}`);
  }
  const output = path.join(workdir, `${model.id}-${pose || ""}-source.usdz`);
  await fs.copyFile(asset, output);
  return output;
}

async function makeUsdz(input, output, recipe) {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "ai6-cmf-usdz-"));
  try {
    await execFile("unzip", ["-q", input, "-d", workdir], { timeout: EXPORT_TIMEOUT_MS });
    const rootLayer = (await fs.readdir(workdir))
      .map((name) => path.join(workdir, name))
      .find((file) => /\.(usdc|usda|usd)$/i.test(file));
    if (!rootLayer) throw httpError(422, "No root USD layer found inside USDZ.");

    const rootName = path.basename(rootLayer);
    let source = "";
    try {
      source = await fs.readFile(rootLayer, "utf8");
    } catch {
      source = "";
    }
    if (!source.trimStart().startsWith("#usda")) {
      // Defensive fallback for a binary (.usdc) source layer: recolor through
      // usdcat when available (macOS local); on a minimal host that only has
      // unzip + zip, the text-layer source is used and this path never runs.
      const textLayer = path.join(workdir, "__cmf_source.usda");
      try {
        await execFile("usdcat", [rootLayer, "-o", textLayer], { timeout: EXPORT_TIMEOUT_MS });
        source = await fs.readFile(textLayer, "utf8");
      } catch {
        throw httpError(422, "CMF export needs a text USD layer (usdcat is unavailable).");
      }
    }
    const result = makeCmfUsda(source, recipe);
    // Keep the recolored layer as text and repackage with plain zip. USDZ is
    // a zip with the USD layer at the archive root; both the in-app renderer
    // and Quick Look read a .usda root layer.
    await fs.writeFile(rootLayer, result.text, "utf8");

    await fs.rm(output, { force: true });
    const packageArgs = ["-r", output, rootName];
    const entries = await fs.readdir(workdir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) packageArgs.push(entry.name);
    }
    await execFile("zip", packageArgs, { cwd: workdir, timeout: EXPORT_TIMEOUT_MS });
    return result.stats;
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

function makeCmfUsda(source, recipe) {
  const model = getModel(recipe.model);
  const palette = modelPalette(model);
  const exactMeshParts = model.exactMeshParts || {};
  // MacBook has no "frame" part; the base pass recolors shared product surfaces
  // to the first finish so unmapped enclosure meshes stay coherent.
  const baseName = recipe.parts.frame || Object.keys(model.paletteMeta)[0];
  const base = recolorSharedProductColors(source, palette[baseName]);
  const meshBlocks = blocksWithEnd(base.text, /def Mesh "([^"]+)"/g);
  const materialBlocks = blocksWithEnd(base.text, /def Material "([^"]+)"/g);
  const globalBounds = getGlobalBounds(meshBlocks);
  const partRewrites = [];
  const cloneNeeds = new Map();

  for (const mesh of meshBlocks) {
    const points = parseVec3Array(mesh.body, "point3f[] points");
    if (!points.length) continue;

    const bounds = getBounds(points);
    const named = exactMeshParts[mesh.name];
    const part = (named && Object.prototype.hasOwnProperty.call(recipe.parts, named) ? named : "")
      || (model.exactOnly ? "" : classifyPart(bounds, globalBounds));
    if (!part || !Object.prototype.hasOwnProperty.call(recipe.parts, part)) continue;

    const binding = mesh.body.match(/rel material:binding\s*=\s*<([^>]+)>/);
    if (!binding) continue;

    const originalPath = binding[1];
    const originalName = originalPath.split("/").pop();
    const colorName = colorForPart(part, recipe);
    const cloneName = `${originalName}__${part}_${colorName}`;
    const clonePath = originalPath.replace(new RegExp(`${escapeRegExp(originalName)}$`), cloneName);

    partRewrites.push({
      start: mesh.start,
      end: mesh.end,
      from: binding[0],
      to: `rel material:binding = <${clonePath}>`,
    });

    if (!cloneNeeds.has(originalName)) cloneNeeds.set(originalName, new Map());
    cloneNeeds.get(originalName).set(cloneName, colorName);
  }

  const operations = partRewrites.map((rewrite) => ({
    at: rewrite.start,
    start: rewrite.start,
    end: rewrite.end,
    text: base.text.slice(rewrite.start, rewrite.end).replace(rewrite.from, rewrite.to),
  }));

  for (const material of materialBlocks) {
    const clones = cloneNeeds.get(material.name);
    if (!clones) continue;
    for (const [cloneName, colorName] of clones.entries()) {
      operations.push({
        at: material.end,
        start: material.end,
        end: material.end,
        text: `\n${cloneMaterial(material.text, material.name, cloneName, palette[colorName])}`,
      });
    }
  }

  let text = base.text;
  for (const operation of operations.sort((a, b) => b.at - a.at)) {
    text = text.slice(0, operation.start) + operation.text + text.slice(operation.end);
  }

  return {
    text,
    stats: {
      splitCount: partRewrites.length,
      sharedColorCount: base.count,
      materialCloneCount: [...cloneNeeds.values()].reduce((sum, clones) => sum + clones.size, 0),
    },
  };
}

function recolorSharedProductColors(source, target) {
  let count = 0;
  const text = source.replace(
    /color3f inputs:diffuseColor = \(([^,]+), ([^,]+), ([^)]+)\)/g,
    (line, rRaw, gRaw, bRaw) => {
      const original = /** @type {[number, number, number]} */ ([Number(rRaw), Number(gRaw), Number(bRaw)]);
      if (!isProductColor(original)) return line;
      const recolored = preserveValue(original, target);
      count += 1;
      return `color3f inputs:diffuseColor = (${formatFloat(recolored[0])}, ${formatFloat(recolored[1])}, ${formatFloat(recolored[2])})`;
    },
  );
  return { text, count };
}

function classifyPart(bounds, global) {
  const [sx, sy, sz] = bounds.size;
  const [cx, , cz] = bounds.center;
  const gx = global.size[0];
  const gy = global.size[1];
  const gz = global.size[2];
  const leftEdge = global.min[0] + gx * 0.08;
  const rightEdge = global.max[0] - gx * 0.08;
  const topEdge = global.min[2] + gz * 0.22;
  const bottomEdge = global.max[2] - gz * 0.08;
  const nearSide = cx < leftEdge || cx > rightEdge;
  const sideControl = nearSide && sx < gx * 0.08 && sy < gy * 0.35 && sz > gz * 0.035 && sz < gz * 0.18;

  if (sideControl) return null;

  const bottomPart = cz > bottomEdge && sy < gy * 0.35 && sz < gz * 0.06;
  if (bottomPart && sx > gx * 0.25) return "usbC";
  if (bottomPart && sx > gx * 0.05) return "screwOrSpeaker";

  const backGlass = Math.abs(cx) < gx * 0.12 && bounds.center[1] < global.min[1] + gy * 0.38 && sx > gx * 0.72 && sz > gz * 0.75;
  if (backGlass) return "backGlass";

  const sideFrame = nearSide && sz > gz * 0.45 && sy > gy * 0.45;
  if (sideFrame) return "frameSide";

  const mainFrame = Math.abs(cx) < gx * 0.12 && sx > gx * 0.88 && sz > gz * 0.85 && sy > gy * 0.18;
  if (mainFrame) return "frame";

  const cameraArea = cz < topEdge && cx > global.min[0] + gx * 0.45 && sx > gx * 0.12 && sz > gz * 0.08;
  if (cameraArea) return "cameraPlate";

  return null;
}

function colorForPart(part, recipe) {
  return recipe.parts[part] || recipe.parts.frame || "black17";
}

function cloneMaterial(text, originalName, cloneName, target) {
  const cloned = text
    .replace(new RegExp(`def Material "${escapeRegExp(originalName)}"`), `def Material "${cloneName}"`)
    .replace(new RegExp(`/${escapeRegExp(originalName)}(?=/)`, "g"), `/${cloneName}`);

  let result = cloned.replace(
    /color3f inputs:diffuseColor = \(([^,]+), ([^,]+), ([^)]+)\)/,
    `color3f inputs:diffuseColor = (${formatFloat(target[0])}, ${formatFloat(target[1])}, ${formatFloat(target[2])})`,
  );

  result = result.replace(
    /color3f inputs:diffuseColor\.connect = <[^>]+>/,
    `color3f inputs:diffuseColor = (${formatFloat(target[0])}, ${formatFloat(target[1])}, ${formatFloat(target[2])})`,
  );

  return result;
}

function isProductColor([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  return lum > 0.035 && lum < 0.93 && (chroma > 0.045 || lum > 0.18) && !(max < 0.12) && !(min > 0.9);
}

function getGlobalBounds(meshBlocks) {
  const all = [];
  for (const mesh of meshBlocks) {
    const points = parseVec3Array(mesh.body, "point3f[] points");
    if (points.length) all.push(...points);
  }
  return getBounds(all);
}

function getBounds(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return {
    min,
    max,
    size: max.map((value, axis) => value - min[axis]),
    center: max.map((value, axis) => (value + min[axis]) / 2),
  };
}

function blocksWithEnd(text, pattern) {
  const blocks = [];
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    const open = text.indexOf("{", match.index);
    if (open === -1) continue;
    const close = findMatchingBrace(text, open);
    if (close === -1) continue;
    blocks.push({
      name,
      start: match.index,
      end: close + 1,
      text: text.slice(match.index, close + 1),
      body: text.slice(open + 1, close),
    });
  }
  return blocks;
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function parseNumberArray(body, key) {
  const match = body.match(new RegExp(`${key.replace(/[\\[\\]]/g, "\\$&")}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return match[1]
    .replace(/[()]/g, "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
}

function parseVec3Array(body, key) {
  const nums = parseNumberArray(body, key);
  const result = [];
  for (let i = 0; i < nums.length; i += 3) {
    result.push([nums[i], nums[i + 1], nums[i + 2]]);
  }
  return result;
}

function preserveValue(original, targetRgb) {
  const originalLum = original[0] * 0.299 + original[1] * 0.587 + original[2] * 0.114;
  const targetLum = targetRgb[0] * 0.299 + targetRgb[1] * 0.587 + targetRgb[2] * 0.114;
  const scale = targetLum > 0 ? originalLum / targetLum : 1;
  return targetRgb.map((channel) => clamp(channel * scale, 0, 1));
}

/**
 * @param {string} value
 * @returns {[number, number, number]}
 */
function parseHex(value) {
  const clean = String(value).trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) throw new Error(`Invalid HEX color: ${value}`);
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function safeSlug(value) {
  return String(value || "cmf")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "cmf";
}

function formatFloat(value) {
  return Number(value.toFixed(6)).toString();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function httpError(statusCode, message) {
  const error = /** @type {Error & { statusCode?: number }} */ (new Error(message));
  error.statusCode = statusCode;
  return error;
}

const SCENEKIT_RENDERER_SOURCE = `import AppKit
import SceneKit

struct RenderView {
    let name: String
    let cameraPosition: SCNVector3
    let target: SCNVector3
    let orthographicScale: Double
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    fputs("Usage: swift render-usdz-scenekit.swift input.usdz output-dir\\n", stderr)
    exit(1)
}

let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2], isDirectory: true)
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

let scene = try SCNScene(url: inputURL, options: [
    .checkConsistency: false,
    .flattenScene: false,
    .preserveOriginalTopology: true
])

let root = scene.rootNode
let (minBound, maxBound) = root.boundingBox
let center = SCNVector3(
    (minBound.x + maxBound.x) / 2,
    (minBound.y + maxBound.y) / 2,
    (minBound.z + maxBound.z) / 2
)
let size = SCNVector3(
    maxBound.x - minBound.x,
    maxBound.y - minBound.y,
    maxBound.z - minBound.z
)
let maxSize = Double(max(size.x, max(size.y, size.z)))
let heightSize = Double(size.y)
let widthSize = Double(size.x)
let distance = CGFloat(maxSize * 2.6)

scene.background.contents = NSColor.clear
scene.lightingEnvironment.contents = NSColor.white
scene.lightingEnvironment.intensity = 1.25

let ambient = SCNLight()
ambient.type = .ambient
ambient.intensity = 550
ambient.color = NSColor.white
let ambientNode = SCNNode()
ambientNode.light = ambient
root.addChildNode(ambientNode)

let key = SCNLight()
key.type = .directional
key.intensity = 900
key.color = NSColor.white
let keyNode = SCNNode()
keyNode.light = key
keyNode.eulerAngles = SCNVector3(-Float.pi / 3.5, -Float.pi / 4, 0)
root.addChildNode(keyNode)

let fill = SCNLight()
fill.type = .directional
fill.intensity = 280
fill.color = NSColor(calibratedWhite: 0.9, alpha: 1)
let fillNode = SCNNode()
fillNode.light = fill
fillNode.eulerAngles = SCNVector3(Float.pi / 5, Float.pi / 3, 0)
root.addChildNode(fillNode)

func vector(_ x: CGFloat, _ y: CGFloat, _ z: CGFloat) -> SCNVector3 {
    SCNVector3(x, y, z)
}

let frontPosition = vector(center.x + distance * 0.02, center.y, center.z + distance)
let backPosition = vector(center.x - distance * 0.02, center.y, center.z - distance)
let rearHeroPosition = vector(center.x - distance * 0.62, center.y + distance * 0.08, center.z - distance * 0.82)
let frontHeroPosition = vector(center.x - distance * 0.62, center.y + distance * 0.08, center.z + distance * 0.82)
let buttonsSidePosition = vector(center.x - distance, center.y, center.z + distance * 0.04)
let controlSidePosition = vector(center.x + distance, center.y - distance * 0.08, center.z + distance * 0.06)
let cameraClosePosition = vector(center.x - distance * 0.46, center.y + distance * 0.05, center.z - distance * 0.9)
let cameraCloseTarget = vector(center.x - size.x * 0.22, center.y + size.y * 0.28, center.z - size.z * 0.1)
let bottomUsbPosition = vector(center.x + distance * 0.08, center.y - distance * 0.28, center.z - distance)
let bottomUsbTarget = vector(center.x, center.y - size.y * 0.08, center.z - size.z * 0.48)
let topEdgePosition = vector(center.x + distance * 0.14, center.y - distance * 0.28, center.z - distance)
let topEdgeTarget = vector(center.x, center.y - size.y * 0.08, center.z - size.z * 0.48)

let views: [RenderView] = [
    RenderView(name: "01-front", cameraPosition: frontPosition, target: center, orthographicScale: heightSize * 0.56),
    RenderView(name: "02-back", cameraPosition: backPosition, target: center, orthographicScale: heightSize * 0.56),
    RenderView(name: "03-rear-hero", cameraPosition: rearHeroPosition, target: center, orthographicScale: heightSize * 0.68),
    RenderView(name: "04-front-hero", cameraPosition: frontHeroPosition, target: center, orthographicScale: heightSize * 0.68),
    RenderView(name: "05-buttons-side", cameraPosition: buttonsSidePosition, target: center, orthographicScale: heightSize * 0.46),
    RenderView(name: "06-control-side", cameraPosition: controlSidePosition, target: center, orthographicScale: heightSize * 0.48),
    RenderView(name: "07-camera-close", cameraPosition: cameraClosePosition, target: cameraCloseTarget, orthographicScale: widthSize * 0.82),
    RenderView(name: "08-bottom-usb", cameraPosition: bottomUsbPosition, target: bottomUsbTarget, orthographicScale: widthSize * 0.74),
    RenderView(name: "09-top-edge", cameraPosition: topEdgePosition, target: topEdgeTarget, orthographicScale: widthSize * 0.84)
]

let renderer = SCNRenderer(device: nil, options: nil)
renderer.scene = scene
renderer.autoenablesDefaultLighting = false
let imageSize = CGSize(width: 1600, height: 1100)

for view in views {
    let camera = SCNCamera()
    camera.usesOrthographicProjection = true
    camera.orthographicScale = view.orthographicScale
    camera.zNear = 0.001
    camera.zFar = maxSize * 10
    camera.wantsHDR = true
    camera.wantsExposureAdaptation = false
    camera.exposureOffset = 0
    camera.saturation = 1
    camera.contrast = 0

    let cameraNode = SCNNode()
    cameraNode.camera = camera
    cameraNode.position = view.cameraPosition
    cameraNode.look(at: view.target)
    scene.rootNode.addChildNode(cameraNode)
    renderer.pointOfView = cameraNode

    let image = renderer.snapshot(atTime: 0, with: imageSize, antialiasingMode: .multisampling4X)
    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        fputs("Failed to encode \\(view.name)\\n", stderr)
        cameraNode.removeFromParentNode()
        continue
    }

    let fileURL = outputURL.appendingPathComponent("\\(view.name).png")
    try png.write(to: fileURL)
    print(fileURL.path)
    cameraNode.removeFromParentNode()
}
`;

module.exports = {
  MODEL_ID: DEFAULT_MODEL_ID,
  DEFAULT_MODEL_ID,
  MODELS,
  getCapabilities,
  normalizeRecipe,
  exportRecipeUsdz,
  renderRecipeViews,
  renderRecipePreview,
};
