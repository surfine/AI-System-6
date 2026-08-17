// Feature module: browser-side CMF USDZ export.
// Loaded lazily as a classic script before CMF Studio. It carries the same
// text-layer recoloring rules as the Node CMF engine so a static deployment
// can rewrite the shipped `.usda` root without a server or USD CLI tools.

(() => {
  const RENDERER_VENDOR_URL = "/app/vendor/cmf-renderer.js?v=three-0.184.0-uv-channel-cache";
  const BLACK_TRIM_LUMINANCE = 0.035;

  // The browser UI calls the action button by its product name; the USD mesh
  // classifier and the server recipe store it as the SIM/action slot.
  const BROWSER_TO_SERVER_PART = Object.freeze({
    actionButton: "actionOrSim",
    actionOrSim: "actionOrSim",
    frame: "frame",
    frameSide: "frameSide",
    backGlass: "backGlass",
    volumeUp: "volumeUp",
    volumeDown: "volumeDown",
    cameraControl: "cameraControl",
    sideButton: "sideButton",
    simTray: "simTray",
    usbC: "usbC",
    screwOrSpeaker: "screwOrSpeaker",
    cameraPlate: "cameraPlate",
    lid: "lid",
    topCase: "topCase",
    bottomCase: "bottomCase",
    keycaps: "keycaps",
    trackpad: "trackpad",
  });

  function parseHex(value) {
    const clean = String(value).trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(clean)) throw new Error(`Invalid HEX color: ${value}`);
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
    ];
  }

  function normalizeRecipe(input) {
    const raw = input && typeof input === "object" ? input : {};
    const modelId = raw.modelId || "iphone-17-standard";
    const colors = Array.isArray(raw.colors) ? raw.colors : [];
    const palette = Object.fromEntries(colors.map((color) => [color.id, parseHex(color.hex)]));
    const parts = {};
    const sourceParts = raw.parts && typeof raw.parts === "object" ? raw.parts : {};

    for (const [rawPart, rawColor] of Object.entries(sourceParts)) {
      const part = BROWSER_TO_SERVER_PART[rawPart] || rawPart;
      const color = String(rawColor || "").trim();
      if (!color || !Object.prototype.hasOwnProperty.call(palette, color)) continue;
      parts[part] = color;
    }

    if (!Object.prototype.hasOwnProperty.call(parts, "frameSide")) {
      parts.frameSide = parts.frame;
    }
    if (!Object.prototype.hasOwnProperty.call(parts, "screwOrSpeaker")) {
      parts.screwOrSpeaker = parts.usbC;
    }

    const exactMeshParts = {};
    const sourceExact = raw.exactMeshParts && typeof raw.exactMeshParts === "object"
      ? raw.exactMeshParts
      : {};
    for (const [meshName, partName] of Object.entries(sourceExact)) {
      exactMeshParts[meshName] = BROWSER_TO_SERVER_PART[partName] || partName;
    }

    return {
      model: modelId,
      pose: raw.pose || null,
      parts,
      palette,
      exactMeshParts,
      exactOnly: Boolean(raw.exactOnly),
      slug: raw.slug || "cmf",
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

  function getGlobalBounds(meshBlocks) {
    const all = [];
    for (const mesh of meshBlocks) {
      const points = parseVec3Array(mesh.body, "point3f[] points");
      if (points.length) all.push(...points);
    }
    return getBounds(all);
  }

  function isProductColor([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    return lum > 0.035 && lum < 0.93 && (chroma > 0.045 || lum > 0.18) && !(max < 0.12) && !(min > 0.9);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function preserveValue(original, targetRgb) {
    const originalLum = original[0] * 0.299 + original[1] * 0.587 + original[2] * 0.114;
    const targetLum = targetRgb[0] * 0.299 + targetRgb[1] * 0.587 + targetRgb[2] * 0.114;
    const scale = targetLum > 0 ? originalLum / targetLum : 1;
    return targetRgb.map((channel) => clamp(channel * scale, 0, 1));
  }

  function formatFloat(value) {
    return Number(value.toFixed(6)).toString();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function recolorSharedProductColors(source, target) {
    let count = 0;
    const text = source.replace(
      /color3f inputs:diffuseColor = \(([^,]+), ([^,]+), ([^)]+)\)/g,
      (line, rRaw, gRaw, bRaw) => {
        const original = [Number(rRaw), Number(gRaw), Number(bRaw)];
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
    return recipe.parts[part] || recipe.parts.frame || Object.keys(recipe.palette)[0];
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

  function isFinishSurface(materialBlocks, materialName) {
    const material = materialBlocks.find((block) => block.name === materialName);
    if (!material) return true;
    const diffuse = material.body.match(/color3f inputs:diffuseColor = \(([^)]*)\)/);
    if (!diffuse) return true;
    const rgb = diffuse[1].split(",").map((value) => Number(value.trim()));
    if (rgb.length !== 3 || rgb.some((value) => Number.isNaN(value))) return true;
    const [r, g, b] = rgb;
    return (r * 0.299 + g * 0.587 + b * 0.114) >= BLACK_TRIM_LUMINANCE;
  }

  function recolorUsdaText(source, recipe) {
    const palette = recipe.palette;
    const exactMeshParts = recipe.exactMeshParts || {};
    const baseName = recipe.parts.frame || Object.keys(palette)[0];
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
        || (recipe.exactOnly ? "" : classifyPart(bounds, globalBounds));
      if (!part || !Object.prototype.hasOwnProperty.call(recipe.parts, part)) continue;

      const binding = mesh.body.match(/rel material:binding\s*=\s*<([^>]+)>/);
      if (!binding) continue;

      const originalPath = binding[1];
      const originalName = originalPath.split("/").pop();
      if (!isFinishSurface(materialBlocks, originalName)) continue;
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

  function repackageUsdzBuffer(buffer, recipeInput, fflate) {
    const recipe = normalizeRecipe(recipeInput);
    const { unzipSync, zipSync } = fflate;
    const entries = unzipSync(new Uint8Array(buffer));
    const rootName = Object.keys(entries).find((name) => /\.(usdc|usda|usd)$/i.test(name));
    if (!rootName) {
      throw new Error("No root USD layer found inside USDZ.");
    }

    let source = "";
    try {
      source = new TextDecoder().decode(entries[rootName]);
    } catch {
      source = "";
    }
    if (!source.trimStart().startsWith("#usda")) {
      throw new Error("CMF export needs a text USD layer.");
    }

    const result = recolorUsdaText(source, recipe);
    entries[rootName] = new TextEncoder().encode(result.text);
    const zipped = zipSync(entries, { level: 6 });
    return { buffer: zipped, stats: result.stats };
  }

  async function exportUsdzBuffer(buffer, recipeInput) {
    const fflate = await import(RENDERER_VENDOR_URL);
    return repackageUsdzBuffer(buffer, recipeInput, fflate);
  }

  async function exportUsdz({ buffer, recipe }) {
    const result = await exportUsdzBuffer(buffer, recipe);
    return {
      blob: new Blob([result.buffer], { type: "model/vnd.usdz+zip" }),
      stats: result.stats,
    };
  }

  window.AISystem6CMFUsdzExportLoaded = true;
  window.AISystem6CMFUsdzExport = Object.freeze({
    normalizeRecipe,
    recolorUsdaText,
    repackageUsdzBuffer,
    exportUsdzBuffer,
    exportUsdz,
  });
})();
