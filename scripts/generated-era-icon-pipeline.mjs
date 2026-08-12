#!/usr/bin/env node

// Generated icon production pipeline.
//
// Modes:
//   prepare  write the 168 reviewed master prompts for manual generation
//   generate call the app's existing /api/image/generate proxy (key in env)
//   import   remove the chroma key, normalise to the shared grid, and build sizes
//   board    render one cross-era human review board from imported candidates
//   fringe-review render accepted/candidate comparisons on light and dark desktops
//   runtime16-review render the prospective complete families at a true 16 px
//   accept   after explicit human approval, archive candidates and update hashes
//   audit    inspect candidate alpha, silhouette, family palette, hashes, and size
//
// Candidates stay under drafts/icon-generation until a human approves them;
// this script never overwrites runtime assets.

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createCanvas, loadImage } from "canvas";
import { GENERATION_OBJECTS, ERAS, GENERATION_SIZE, MODEL, allMasterPromptRecords, promptRecord } from "./icon-generation/generated-era-core-prompts.mjs";
import { gridTransform, inkBox } from "./lib/icon-grid.mjs";
import { derivedLegibility, visibleMagentaPixels } from "./lib/icon-pixel-metrics.mjs";

const root = resolve(import.meta.dirname, "..");
const workRoot = join(root, "drafts/icon-generation");
const promptRoot = join(workRoot, "prompts");
const inboxRoot = join(workRoot, "inbox");
const candidateRoot = join(workRoot, "candidates");
const ledgerRoot = join(workRoot, "ledgers");
const args = process.argv.slice(2);
const command = args[0] || "help";

function option(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || "") : fallback;
}

function flag(name) {
  return args.includes(`--${name}`);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function selectedRecords(profile = "master") {
  const era = option("era");
  const icon = option("icon");
  const eraIds = era ? [era] : Object.keys(ERAS);
  const iconIds = icon ? [icon] : Object.keys(GENERATION_OBJECTS);
  for (const eraId of eraIds) if (!ERAS[eraId]) throw new Error(`Unknown era: ${eraId}`);
  for (const iconId of iconIds) if (!GENERATION_OBJECTS[iconId]) throw new Error(`Unknown icon: ${iconId}`);
  return eraIds.flatMap((eraId) => iconIds.map((iconId) => promptRecord(eraId, iconId, profile)));
}

function prepare() {
  const records = allMasterPromptRecords();
  ensureDir(promptRoot);
  for (const eraId of Object.keys(ERAS)) {
    const eraRecords = records.filter((entry) => entry.era === eraId);
    writeFileSync(join(promptRoot, `${eraId}.json`), stableJson({
      schemaVersion: 1,
      purpose: "One original generated master prompt per locked semantic object; no historical artwork is embedded.",
      era: eraId,
      model: MODEL,
      generationSize: GENERATION_SIZE,
      smallSizePolicy: "Runtime surfaces downscale the accepted 128 px tier. Compose 32 px and 16 px review artifacts directly from the retained high-resolution source with size-specific grid and quantisation; request a separate small/tiny generation when the silhouette gate fails.",
      manualInbox: `drafts/icon-generation/inbox/${eraId}/<icon>.png`,
      records: eraRecords,
    }));
  }
  writeFileSync(join(promptRoot, "all-master-prompts.json"), stableJson({ schemaVersion: 1, records }));
  console.log(`Prepared ${records.length} master prompts in ${promptRoot}`);
}

async function generate() {
  const records = selectedRecords(option("profile", "master"));
  const key = process.env.AI_SYSTEM6_IMAGE_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!key) throw new Error("Set AI_SYSTEM6_IMAGE_API_KEY or OPENAI_API_KEY locally before automated generation. Never paste the key into a prompt or ledger.");
  const server = option("server", "http://127.0.0.1:4173").replace(/\/+$/, "");
  for (const record of records) {
    const suffix = record.profile === "master" ? "" : `-${record.profile}`;
    const out = join(inboxRoot, record.era, `${record.icon}${suffix}.png`);
    if (existsSync(out) && !flag("force")) {
      console.log(`Skip existing ${out}`);
      continue;
    }
    ensureDir(dirname(out));
    const response = await fetch(`${server}/api/image/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: record.prompt,
        size: record.generationSize,
        model: record.model,
        apiKey: key,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${record.era}/${record.icon}: ${payload.detail || payload.error || response.status}`);
    let buffer;
    if (payload.b64) buffer = Buffer.from(payload.b64, "base64");
    else if (payload.url) {
      const imageResponse = await fetch(payload.url);
      if (!imageResponse.ok) throw new Error(`${record.era}/${record.icon}: generated image URL returned ${imageResponse.status}`);
      buffer = Buffer.from(await imageResponse.arrayBuffer());
    } else throw new Error(`${record.era}/${record.icon}: image proxy returned no image`);
    writeFileSync(out, buffer);
    writeFileSync(`${out}.prompt.json`, stableJson({ ...record, sourceSha256: sha256(buffer) }));
    console.log(`Generated ${record.era}/${record.icon} -> ${out}`);
  }
}

function chromaToAlpha(ctx, size) {
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  const keyConnected = new Uint8Array(size * size);
  const queue = new Uint32Array(size * size);
  let queueHead = 0;
  let queueTail = 0;

  function isTravelHue(pixel) {
    const offset = pixel * 4;
    if (data[offset + 3] < 8) return false;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const dr = red - 255;
    const db = blue - 255;
    const distance = Math.sqrt(dr * dr + green * green + db * db);
    return distance < 150
      || (red > 50
        && blue > 50
        && Math.min(red, blue) - green >= 8
        && Math.abs(red - blue) <= 48);
  }

  function enqueue(pixel) {
    if (keyConnected[pixel] || !isTravelHue(pixel)) return;
    keyConnected[pixel] = 1;
    queue[queueTail++] = pixel;
  }

  // The generated object is surrounded by the keyed background. Flooding the
  // A weak travel gate lets the flood reach the full keyed shadow fade. The
  // strong distance gates below still own removal, while edge connectivity
  // protects violet material enclosed by the object's own silhouette (for
  // example Soundscape and CMF Studio swatches).
  for (let coordinate = 0; coordinate < size; coordinate += 1) {
    enqueue(coordinate);
    enqueue((size - 1) * size + coordinate);
    enqueue(coordinate * size);
    enqueue(coordinate * size + size - 1);
  }
  while (queueHead < queueTail) {
    const pixel = queue[queueHead++];
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < size) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - size);
    if (y + 1 < size) enqueue(pixel + size);
    if (x > 0 && y > 0) enqueue(pixel - size - 1);
    if (x + 1 < size && y > 0) enqueue(pixel - size + 1);
    if (x > 0 && y + 1 < size) enqueue(pixel + size - 1);
    if (x + 1 < size && y + 1 < size) enqueue(pixel + size + 1);
  }

  let removed = 0;
  let neutralized = 0;
  let alreadyTransparent = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 8) {
      alreadyTransparent += 1;
      continue;
    }
    const dr = data[offset] - 255;
    const dg = data[offset + 1];
    const db = data[offset + 2] - 255;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const pixel = offset / 4;
    if (distance <= 46) {
      data[offset + 3] = 0;
      removed += 1;
    } else if (distance < 150) {
      const keep = Math.max(0, Math.min(1, (distance - 46) / 104));
      data[offset + 3] = Math.round(data[offset + 3] * keep);
      const spill = 1 - keep;
      data[offset] = Math.round(data[offset] * keep + Math.min(data[offset + 1], data[offset + 2]) * spill);
      data[offset + 2] = Math.round(data[offset + 2] * keep + Math.min(data[offset], data[offset + 1]) * spill);
      removed += 1;
    } else if (keyConnected[pixel]
      && Math.min(data[offset], data[offset + 2]) - data[offset + 1] >= 8) {
      // A neutral shadow composited over #ff00ff satisfies approximately
      //   red = alpha * neutral + (1 - alpha) * 255
      //   green = alpha * neutral
      // (and likewise for blue). Recover that alpha and neutral value instead
      // of shipping the composite as an opaque purple stain.
      const redDelta = Math.max(0, data[offset] - data[offset + 1]);
      const blueDelta = Math.max(0, data[offset + 2] - data[offset + 1]);
      const recoveredAlpha = Math.max(0, Math.min(1, 1 - (redDelta + blueDelta) / 510));
      if (recoveredAlpha <= 0.03) {
        data[offset + 3] = 0;
      } else {
        const neutral = Math.max(0, Math.min(255, Math.round(data[offset + 1] / recoveredAlpha)));
        data[offset] = neutral;
        data[offset + 1] = neutral;
        data[offset + 2] = neutral;
        data[offset + 3] = Math.round(data[offset + 3] * recoveredAlpha);
      }
      neutralized += 1;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { removed, neutralized, alreadyTransparent };
}

function quantiseSmall(ctx, size) {
  if (size > 32) return;
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  const step = size === 16 ? 32 : 16;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (alpha < (size === 16 ? 44 : 24)) {
      data[offset + 3] = 0;
      continue;
    }
    if (alpha > (size === 16 ? 188 : 220)) data[offset + 3] = 255;
    for (let channel = 0; channel < 3; channel += 1) {
      data[offset + channel] = Math.max(0, Math.min(255, Math.round(data[offset + channel] / step) * step));
    }
  }
  ctx.putImageData(image, 0, 0);
}

function neutralizeResidualKeyFringe(ctx, size) {
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  let neutralized = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];
    // Leave enough headroom for PNG premultiply/unpremultiply rounding so the
    // encoded asset remains below the visible-fringe contract (> 26).
    if (alpha <= 30 || Math.min(red, blue) - green <= 16) continue;
    // The source pass recovers background-connected shadow. Resampling can
    // still reintroduce a smaller keyed channel. Balanced red/blue is keyed
    // grey shadow and becomes neutral; an intentionally blue- or red-violet
    // material keeps its dominant channel while only the weaker keyed channel
    // is suppressed. Alpha is already recovered at source resolution, so this
    // residual pass never changes shadow density.
    const redDelta = Math.max(0, red - green);
    const blueDelta = Math.max(0, blue - green);
    if (Math.abs(red - blue) <= 24) {
      const recoveredAlpha = Math.max(0.2, Math.min(1, 1 - (redDelta + blueDelta) / 510));
      const neutral = Math.max(0, Math.min(160, Math.round(green / recoveredAlpha)));
      data[offset] = neutral;
      data[offset + 1] = neutral;
      data[offset + 2] = neutral;
    } else if (blue > red) {
      data[offset] = Math.min(red, green);
    } else {
      data[offset + 2] = Math.min(blue, green);
    }
    neutralized += 1;
  }
  ctx.putImageData(image, 0, 0);
  return neutralized;
}

function reinforceRuntimeContrast(ctx, size) {
  if (size !== 128) return { applied: false, metrics: derivedLegibility(ctx, size, 16) };
  const before = derivedLegibility(ctx, size, 16);
  const fails = before.meanLum < 80 || before.meanLum > 210 || before.lumStd < 24 || before.edgeEnergy < 8;
  if (!fails) return { applied: false, metrics: before };
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  const targetMean = Math.max(90, Math.min(200, before.meanLum));
  const gain = before.lumStd < 24 || before.edgeEnergy < 8 ? 1.65 : 1.25;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] <= 20) continue;
    const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    const target = Math.max(0, Math.min(255, targetMean + (luminance - before.meanLum) * gain));
    const delta = target - luminance;
    data[offset] = Math.max(0, Math.min(255, Math.round(data[offset] + delta)));
    data[offset + 1] = Math.max(0, Math.min(255, Math.round(data[offset + 1] + delta)));
    data[offset + 2] = Math.max(0, Math.min(255, Math.round(data[offset + 2] + delta)));
  }
  ctx.putImageData(image, 0, 0);
  return { applied: true, before, metrics: derivedLegibility(ctx, size, 16) };
}

function rgbaMetrics(ctx, size) {
  const data = ctx.getImageData(0, 0, size, size).data;
  let pixels = 0;
  let edgePixels = 0;
  let alphaSum = 0;
  const colors = new Set();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const alpha = data[offset + 3];
      if (!alpha) continue;
      pixels += 1;
      alphaSum += alpha;
      colors.add(`${data[offset] >> 4},${data[offset + 1] >> 4},${data[offset + 2] >> 4},${alpha >> 5}`);
      const neighbourOffsets = [offset - 4, offset + 4, offset - size * 4, offset + size * 4];
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1 || neighbourOffsets.some((n) => n < 0 || n >= data.length || data[n + 3] === 0)) edgePixels += 1;
    }
  }
  const box = inkBox(ctx, size, 20);
  return {
    bbox: box,
    pixels,
    coverage: Number((pixels / (size * size)).toFixed(4)),
    edgePixels,
    colors: colors.size,
    meanAlpha: pixels ? Number((alphaSum / pixels).toFixed(2)) : 0,
  };
}

async function importOne(eraId, iconId) {
  const sourcePath = join(inboxRoot, eraId, `${iconId}.png`);
  if (!existsSync(sourcePath)) throw new Error(`Missing manual/generated source: ${sourcePath}`);
  async function prepareSource(profile, path) {
    const buffer = readFileSync(path);
    const image = await loadImage(buffer);
    if (Math.max(image.width, image.height) < 512) throw new Error(`${eraId}/${iconId}/${profile}: expected at least 512 px on the longest edge`);
    // Built-in generation can return a landscape or portrait raster even for
    // a square request. Pad it transparently to a square without stretching.
    const dimension = Math.max(image.width, image.height);
    const clean = createCanvas(dimension, dimension);
    const cleanCtx = clean.getContext("2d");
    cleanCtx.drawImage(image, Math.floor((dimension - image.width) / 2), Math.floor((dimension - image.height) / 2));
    const alpha = chromaToAlpha(cleanCtx, dimension);
    const box = inkBox(cleanCtx, dimension, 20);
    if (!box) throw new Error(`${eraId}/${iconId}/${profile}: chroma removal left no visible subject`);
    const prompt = promptRecord(eraId, iconId, profile).prompt;
    return {
      profile,
      path,
      buffer,
      image,
      clean,
      alpha,
      box,
      record: {
        path: path.slice(root.length + 1),
        sha256: sha256(buffer),
        size: [image.width, image.height],
        paddedSize: [dimension, dimension],
        inkBox: box,
        alphaRemoval: alpha,
        promptSha256: sha256(Buffer.from(prompt)),
      },
    };
  }

  const prepared = { master: await prepareSource("master", sourcePath) };
  for (const profile of ["small", "tiny"]) {
    const path = join(inboxRoot, eraId, `${iconId}-${profile}.png`);
    if (existsSync(path)) prepared[profile] = await prepareSource(profile, path);
  }

  const outputs = {};
  ensureDir(join(candidateRoot, eraId));
  for (const size of ERAS[eraId].sizes) {
    const selected = size === 16 && prepared.tiny ? prepared.tiny
      : size === 32 && prepared.small ? prepared.small
        : prepared.master;
    const out = createCanvas(size, size);
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Generated sources are much larger than the output canvas. The shared
    // helper's normal clamp protects same-scale painters, so this importer uses
    // a lower safe floor and lets the grid's own canvas bound do the policing.
    const transform = gridTransform(eraId, iconId, selected.box, size, { clamp: [0.001, 2] });
    // At 16/32 px, a mathematically in-bounds half-pixel can still quantise
    // onto the outermost raster column. Preserve a real one-pixel safety ring
    // after optical normalisation so no icon collides with a menu cell edge.
    if (size <= 32) {
      const inset = 1;
      const safeBound = size - inset * 2;
      const projectedLongest = Math.max(selected.box.width, selected.box.height) * transform.scale;
      if (projectedLongest > safeBound) {
        transform.scale *= safeBound / projectedLongest;
        const centerX = (selected.box.minX + selected.box.maxX + 1) / 2;
        const centerY = (selected.box.minY + selected.box.maxY + 1) / 2;
        transform.dx = size / 2 - centerX * transform.scale;
        transform.dy = size / 2 - centerY * transform.scale;
      }
    }
    ctx.save();
    ctx.setTransform(transform.scale, 0, 0, transform.scale, transform.dx, transform.dy);
    ctx.drawImage(selected.clean, 0, 0);
    ctx.restore();
    const runtimeLegibility = reinforceRuntimeContrast(ctx, size);
    quantiseSmall(ctx, size);
    const residualKeyFringeNeutralized = neutralizeResidualKeyFringe(ctx, size);
    const outBuffer = out.toBuffer("image/png", { compressionLevel: 9 });
    const outPath = join(candidateRoot, eraId, `${iconId}-${size}.png`);
    writeFileSync(outPath, outBuffer);
    outputs[size] = {
      path: outPath.slice(root.length + 1),
      sha256: sha256(outBuffer),
      bytes: outBuffer.length,
      sourceProfile: selected.profile,
      residualKeyFringeNeutralized,
      runtimeLegibility,
      transform,
      metrics: rgbaMetrics(ctx, size),
    };
  }

  return {
    label: GENERATION_OBJECTS[iconId].label,
    model: MODEL,
    prompt: promptRecord(eraId, iconId, "master").prompt,
    promptSha256: sha256(Buffer.from(promptRecord(eraId, iconId, "master").prompt)),
    source: prepared.master.record.path,
    sourceSha256: prepared.master.record.sha256,
    sourceSize: prepared.master.record.size,
    sourceInkBox: prepared.master.record.inkBox,
    alphaRemoval: prepared.master.record.alphaRemoval,
    sources: Object.fromEntries(Object.entries(prepared).map(([profile, entry]) => [profile, entry.record])),
    outputs,
    reviewStatus: "candidate",
  };
}

async function importCandidates() {
  const era = option("era");
  const icon = option("icon");
  const eraIds = era ? [era] : Object.keys(ERAS);
  for (const eraId of eraIds) {
    if (!ERAS[eraId]) throw new Error(`Unknown era: ${eraId}`);
    const iconIds = icon ? [icon] : Object.keys(GENERATION_OBJECTS).filter((id) => existsSync(join(inboxRoot, eraId, `${id}.png`)));
    if (!iconIds.length) {
      console.log(`No inbox sources for ${eraId}`);
      continue;
    }
    ensureDir(ledgerRoot);
    const ledgerPath = join(ledgerRoot, `${eraId}.json`);
    const previous = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : { schemaVersion: 1, era: eraId, icons: {} };
    for (const iconId of iconIds) {
      if (!GENERATION_OBJECTS[iconId]) throw new Error(`Unknown icon: ${iconId}`);
      previous.icons[iconId] = await importOne(eraId, iconId);
      console.log(`Imported ${eraId}/${iconId}`);
    }
    writeFileSync(ledgerPath, stableJson(previous));
  }
}

function auditLedger(eraId) {
  const ledgerPath = join(ledgerRoot, `${eraId}.json`);
  if (!existsSync(ledgerPath)) return { era: eraId, status: "missing-ledger", failures: ["no imported candidates"] };
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const failures = [];
  let bytes = 0;
  for (const iconId of Object.keys(GENERATION_OBJECTS)) {
    const entry = ledger.icons[iconId];
    if (!entry) {
      if (!flag("partial")) failures.push(`${iconId}: missing candidate`);
      continue;
    }
    for (const size of ERAS[eraId].sizes) {
      const output = entry.outputs[size];
      if (!output || !existsSync(join(root, output.path))) {
        failures.push(`${iconId}/${size}: missing output`);
        continue;
      }
      bytes += output.bytes;
      const metrics = output.metrics;
      if (!metrics.bbox) failures.push(`${iconId}/${size}: empty alpha`);
      else {
        const margin = Math.min(metrics.bbox.minX, metrics.bbox.minY, size - 1 - metrics.bbox.maxX, size - 1 - metrics.bbox.maxY);
        if (margin < Math.max(1, Math.floor(size * 0.02))) failures.push(`${iconId}/${size}: margin ${margin}px is too tight`);
      }
      if (metrics.coverage < 0.12 || metrics.coverage > 0.82) failures.push(`${iconId}/${size}: coverage ${metrics.coverage} outside 0.12-0.82`);
      if (size === 16 && metrics.edgePixels < 8) failures.push(`${iconId}/16: silhouette has too little readable perimeter`);
      if (size === 16 && metrics.colors > 90) failures.push(`${iconId}/16: ${metrics.colors} quantised colours indicate excess detail`);
    }
  }
  return {
    era: eraId,
    status: failures.length ? "needs-review" : "machine-gates-pass",
    acceptedIconCount: Object.keys(ledger.icons).length,
    expectedIconCount: Object.keys(GENERATION_OBJECTS).length,
    candidateBytes: bytes,
    failures,
  };
}

function audit() {
  const era = option("era");
  const reports = (era ? [era] : Object.keys(ERAS)).map(auditLedger);
  ensureDir(workRoot);
  writeFileSync(join(workRoot, "audit-report.json"), stableJson({ schemaVersion: 1, reports }));
  console.log(stableJson({ reports }));
  if (reports.some((report) => report.failures.length)) process.exitCode = 1;
}

function acceptCandidates() {
  if (!flag("approved")) throw new Error("Human approval is required. Re-run with --approved only after the review boards are accepted.");
  const acceptedPath = join(root, "scripts/icon-generation/accepted-generated-icons.json");
  const accepted = JSON.parse(readFileSync(acceptedPath, "utf8"));
  for (const [eraId, era] of Object.entries(accepted.eras)) {
    const candidateLedgerPath = join(ledgerRoot, `${eraId}.json`);
    if (!existsSync(candidateLedgerPath)) throw new Error(`${eraId}: missing candidate ledger`);
    const candidateLedger = JSON.parse(readFileSync(candidateLedgerPath, "utf8"));
    const archive = join(root, "assets/themes", eraId, "icons/imagegen-source");
    ensureDir(archive);
    for (const iconId of Object.keys(era.icons)) {
      const candidate = candidateLedger.icons[iconId];
      if (!candidate) throw new Error(`${eraId}/${iconId}: missing approved candidate`);
      for (const size of era.sizes) {
        const output = candidate.outputs[size];
        if (!output) throw new Error(`${eraId}/${iconId}/${size}: missing approved output`);
        const source = join(root, output.path);
        const buffer = readFileSync(source);
        const actualHash = sha256(buffer);
        if (actualHash !== output.sha256) throw new Error(`${eraId}/${iconId}/${size}: candidate bytes drifted after review`);
        copyFileSync(source, join(archive, `${iconId}-${size}.png`));
        era.icons[iconId][size] = actualHash;
      }
    }
    console.log(`${eraId}: archived and accepted ${Object.keys(era.icons).length} reviewed candidates`);
  }
  accepted.reviewedAgainst = [
    "drafts/icon-generation/cross-era-candidate-board.png",
    "drafts/icon-generation/cross-era-candidate-board-16px.png",
    "drafts/icon-generation/key-fringe-before-after-light.png",
    "drafts/icon-generation/key-fringe-before-after-dark.png",
    "drafts/icon-generation/runtime-derived-16-light.png",
    "drafts/icon-generation/runtime-derived-16-dark.png",
  ];
  writeFileSync(acceptedPath, stableJson(accepted));
}

async function board() {
  const eraIds = Object.keys(ERAS);
  const iconIds = option("icons")
    ? option("icons").split(",").map((id) => id.trim()).filter(Boolean)
    : option("icon") ? [option("icon")] : Object.keys(GENERATION_OBJECTS);
  for (const iconId of iconIds) if (!GENERATION_OBJECTS[iconId]) throw new Error(`Unknown icon: ${iconId}`);
  const cell = 176;
  const labelHeight = 42;
  const headerHeight = 56;
  const canvas = createCanvas(cell * eraIds.length, headerHeight + (cell + labelHeight) * iconIds.length);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d8d8d8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#111";
  for (let column = 0; column < eraIds.length; column += 1) {
    ctx.fillText(ERAS[eraIds[column]].label, column * cell + cell / 2, headerHeight / 2);
  }
  for (let row = 0; row < iconIds.length; row += 1) {
    const iconId = iconIds[row];
    for (let column = 0; column < eraIds.length; column += 1) {
      const eraId = eraIds[column];
      const x = column * cell;
      const y = headerHeight + row * (cell + labelHeight);
      const tile = 16;
      for (let ty = 0; ty < cell; ty += tile) {
        for (let tx = 0; tx < cell; tx += tile) {
          ctx.fillStyle = ((tx / tile + ty / tile) % 2) ? "#f6f6f6" : "#c8c8c8";
          ctx.fillRect(x + tx, y + ty, tile, tile);
        }
      }
      const iconPath = join(candidateRoot, eraId, `${iconId}-128.png`);
      if (existsSync(iconPath)) {
        const image = await loadImage(iconPath);
        ctx.drawImage(image, x + 24, y + 24, 128, 128);
      } else {
        ctx.strokeStyle = "#777";
        ctx.setLineDash([6, 5]);
        ctx.strokeRect(x + 24.5, y + 24.5, 127, 127);
        ctx.setLineDash([]);
        ctx.font = "14px sans-serif";
        ctx.fillStyle = "#666";
        ctx.fillText("not generated", x + cell / 2, y + cell / 2);
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y + cell, cell, labelHeight);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#111";
      ctx.fillText(iconId, x + cell / 2, y + cell + labelHeight / 2);
    }
  }
  ensureDir(workRoot);
  const out = join(workRoot, "cross-era-candidate-board.png");
  writeFileSync(out, canvas.toBuffer("image/png", { compressionLevel: 9 }));

  const smallCell = 112;
  const smallLabel = 28;
  const smallHeader = 44;
  const small = createCanvas(smallCell * eraIds.length, smallHeader + (smallCell + smallLabel) * iconIds.length);
  const smallCtx = small.getContext("2d");
  smallCtx.fillStyle = "#d8d8d8";
  smallCtx.fillRect(0, 0, small.width, small.height);
  smallCtx.textAlign = "center";
  smallCtx.textBaseline = "middle";
  smallCtx.font = "bold 14px sans-serif";
  smallCtx.fillStyle = "#111";
  for (let column = 0; column < eraIds.length; column += 1) {
    smallCtx.fillText(ERAS[eraIds[column]].label, column * smallCell + smallCell / 2, smallHeader / 2);
  }
  for (let row = 0; row < iconIds.length; row += 1) {
    const iconId = iconIds[row];
    for (let column = 0; column < eraIds.length; column += 1) {
      const eraId = eraIds[column];
      const x = column * smallCell;
      const y = smallHeader + row * (smallCell + smallLabel);
      const tile = 8;
      for (let ty = 0; ty < smallCell; ty += tile) {
        for (let tx = 0; tx < smallCell; tx += tile) {
          smallCtx.fillStyle = ((tx / tile + ty / tile) % 2) ? "#f6f6f6" : "#c8c8c8";
          smallCtx.fillRect(x + tx, y + ty, tile, tile);
        }
      }
      const iconPath = join(candidateRoot, eraId, `${iconId}-16.png`);
      if (existsSync(iconPath)) {
        const image = await loadImage(iconPath);
        smallCtx.imageSmoothingEnabled = false;
        smallCtx.drawImage(image, x + 8, y + 8, 96, 96);
        smallCtx.imageSmoothingEnabled = true;
      } else {
        smallCtx.font = "12px sans-serif";
        smallCtx.fillStyle = "#666";
        smallCtx.fillText("not generated", x + smallCell / 2, y + smallCell / 2);
      }
      smallCtx.fillStyle = "#fff";
      smallCtx.fillRect(x, y + smallCell, smallCell, smallLabel);
      smallCtx.font = "12px sans-serif";
      smallCtx.fillStyle = "#111";
      smallCtx.fillText(iconId, x + smallCell / 2, y + smallCell + smallLabel / 2);
    }
  }
  const smallOut = join(workRoot, "cross-era-candidate-board-16px.png");
  writeFileSync(smallOut, small.toBuffer("image/png", { compressionLevel: 9 }));
  console.log(`Wrote ${out}`);
  console.log(`Wrote ${smallOut}`);
}

const fringeReviewCases = Object.freeze([
  ["aqua", "applications"],
  ["snow-leopard", "helpFolder"],
  ["snow-leopard", "contextPanel"],
  ["yosemite", "localModel"],
  ["yosemite", "writingStudio"],
  ["yosemite", "writingDemo"],
]);

async function fringeReview() {
  const beforeRoot = resolve(option("before-root", join(root, "assets/themes")));
  const columns = 2;
  const scale = 8;
  const iconSize = 32 * scale;
  const cardWidth = 600;
  const cardHeight = 338;
  const headerHeight = 72;
  for (const mode of ["light", "dark"]) {
    const rows = Math.ceil(fringeReviewCases.length / columns);
    const canvas = createCanvas(columns * cardWidth, headerHeight + rows * cardHeight);
    const ctx = canvas.getContext("2d");
    const background = mode === "dark" ? "#202328" : "#eef1f4";
    const panel = mode === "dark" ? "#2b3037" : "#ffffff";
    const text = mode === "dark" ? "#f3f5f7" : "#17202a";
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = text;
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`Visible magenta fringe · before → after · ${scale}×`, 20, 26);
    ctx.font = "12px sans-serif";
    ctx.fillText("Six worst 32 px runtime objects · exact alpha/chroma pixel contract", 20, 50);
    for (let index = 0; index < fringeReviewCases.length; index += 1) {
      const [eraId, iconId] = fringeReviewCases[index];
      const x = (index % columns) * cardWidth;
      const y = headerHeight + Math.floor(index / columns) * cardHeight;
      ctx.fillStyle = panel;
      ctx.fillRect(x + 8, y + 8, cardWidth - 16, cardHeight - 16);
      const beforePath = join(beforeRoot, eraId, `${iconId}-32.png`);
      const afterPath = join(candidateRoot, eraId, `${iconId}-32.png`);
      const [before, after] = await Promise.all([loadImage(beforePath), loadImage(afterPath)]);
      const count = (image) => {
        const measure = createCanvas(32, 32);
        const measureCtx = measure.getContext("2d");
        measureCtx.drawImage(image, 0, 0, 32, 32);
        return visibleMagentaPixels(measureCtx, 32);
      };
      const beforeCount = count(before);
      const afterCount = count(after);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(before, x + 18, y + 42, iconSize, iconSize);
      ctx.drawImage(after, x + 322, y + 42, iconSize, iconSize);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = text;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(`${ERAS[eraId].label} · ${iconId}`, x + 20, y + 22);
      ctx.font = "11px sans-serif";
      ctx.fillText(`before · ${beforeCount} px`, x + 88, y + 316);
      ctx.fillText(`after · ${afterCount} px`, x + 394, y + 316);
      ctx.fillStyle = mode === "dark" ? "#747c87" : "#c7cdd4";
      ctx.fillRect(x + 299, y + 40, 1, 258);
    }
    ensureDir(workRoot);
    const out = join(workRoot, `key-fringe-before-after-${mode}.png`);
    writeFileSync(out, canvas.toBuffer("image/png", { compressionLevel: 9 }));
    console.log(`Wrote ${out}`);
  }
}

async function runtime16Review() {
  const accepted = JSON.parse(readFileSync(join(root, "scripts/icon-generation/accepted-generated-icons.json"), "utf8"));
  const iconIds = Object.keys(GENERATION_OBJECTS);
  const columns = 8;
  const tileWidth = 96;
  const tileHeight = 46;
  const eraHeader = 38;
  const rows = Math.ceil(iconIds.length / columns);
  for (const mode of ["light", "dark"]) {
    const canvas = createCanvas(columns * tileWidth, Object.keys(ERAS).length * (eraHeader + rows * tileHeight));
    const ctx = canvas.getContext("2d");
    const background = mode === "dark" ? "#202328" : "#f2f4f6";
    const panel = mode === "dark" ? "#2a2f35" : "#ffffff";
    const text = mode === "dark" ? "#f2f4f6" : "#17202a";
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let eraIndex = 0; eraIndex < Object.keys(ERAS).length; eraIndex += 1) {
      const eraId = Object.keys(ERAS)[eraIndex];
      const baseY = eraIndex * (eraHeader + rows * tileHeight);
      ctx.fillStyle = text;
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${ERAS[eraId].label} · runtime-derived true 16 px · ${mode}`, 12, baseY + eraHeader / 2);
      const generatedIds = new Set(Object.keys(accepted.eras[eraId].icons));
      for (let index = 0; index < iconIds.length; index += 1) {
        const iconId = iconIds[index];
        const x = (index % columns) * tileWidth;
        const y = baseY + eraHeader + Math.floor(index / columns) * tileHeight;
        ctx.fillStyle = panel;
        ctx.fillRect(x + 2, y + 2, tileWidth - 4, tileHeight - 4);
        const source = generatedIds.has(iconId)
          ? join(candidateRoot, eraId, `${iconId}-128.png`)
          : join(root, "assets/themes", eraId, "icons", `${iconId}-128.png`);
        const image = await loadImage(source);
        const small = createCanvas(16, 16);
        const smallCtx = small.getContext("2d");
        smallCtx.imageSmoothingEnabled = true;
        smallCtx.imageSmoothingQuality = "high";
        smallCtx.drawImage(image, 0, 0, 16, 16);
        ctx.drawImage(small, x + 40, y + 5);
        ctx.fillStyle = text;
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(iconId, x + tileWidth / 2, y + 33);
      }
    }
    const out = join(workRoot, `runtime-derived-16-${mode}.png`);
    writeFileSync(out, canvas.toBuffer("image/png", { compressionLevel: 9 }));
    console.log(`Wrote ${out}`);
  }
}

function printHelp() {
  console.log(`Generated era icon pipeline

  node scripts/generated-era-icon-pipeline.mjs prepare
  node scripts/generated-era-icon-pipeline.mjs generate [--era aqua] [--icon finderApp] [--profile master|small|tiny] [--server http://127.0.0.1:4173]
  node scripts/generated-era-icon-pipeline.mjs import [--era aqua] [--icon finderApp]
  node scripts/generated-era-icon-pipeline.mjs board [--icons startupDisk,applications,fileFloppy,projectDisc]
  node scripts/generated-era-icon-pipeline.mjs fringe-review [--before-root /path/to/frozen/before]
  node scripts/generated-era-icon-pipeline.mjs runtime16-review
  node scripts/generated-era-icon-pipeline.mjs accept --approved
  node scripts/generated-era-icon-pipeline.mjs audit [--era aqua] [--partial]

Manual mode: run prepare, generate each PNG elsewhere from the exact prompt,
then place it at drafts/icon-generation/inbox/<era>/<icon>.png and run import.`);
}

if (command === "prepare") prepare();
else if (command === "generate") await generate();
else if (command === "import") await importCandidates();
else if (command === "board") await board();
else if (command === "fringe-review") await fringeReview();
else if (command === "runtime16-review") await runtime16Review();
else if (command === "accept") acceptCandidates();
else if (command === "audit") audit();
else printHelp();
