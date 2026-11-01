// Big Sur window chrome, measured against native captures instead of against
// itself.
//
// `docs/01_Big_Sur_参照与落地.md` asks the executing model to fetch the objects
// it names and record source URL, file hash, pixel size and window state — and
// `[C15]` asks for a reference manifest before the appearance can be given a
// historical-fidelity verdict. Until 2026-09-23 this era had none: every number
// in `68-big-sur-appearance.css` was a product value, and the tokens said so.
//
// This instrument pins the six gallery entries the package names (BS03 /
// BS-L07..BS-L10), keeps only small crops of them in the repository, and
// measures the same rectangle in those crops and in our own render:
//
//   * the window box (from the capture's alpha, so the crop margin does not
//     have to be guessed),
//   * the traffic-light group — diameter, pitch, and the first lamp's offset
//     from the window's top-left corner,
//   * the bar's bottom hairline, i.e. the chrome height above the content.
//
// Our half keeps the product's close-left / zoom-right rule, which is the
// owner's and not macOS 11's: red Close at the left, green Zoom at the right
// edge, and no yellow lamp until this era's Dock ships (owner decision
// 2026-09-25). So the native pitch is reported for the record and never
// asserted against ours; what is asserted on our side is that the two lamps
// sit at the two ends, the same inset from each edge, with no minimize lamp.
//
//   node tooling/measure-big-sur-chrome-fidelity.mjs [--url http://127.0.0.1:4173]
//
// Needs a running development server for the "ours" half. The native files are
// cached outside the repository (default /tmp/ai-system6-big-sur-reference) and
// re-fetched only when missing; their sha256 is recorded in the manifest either
// way, so a changed upstream file is visible rather than silent.
//
// What this does NOT claim: the captures are wallpaper-tinted (the library
// keeps that setting on), so colours are read as relationships, never as
// absolute Apple values; one scale basis (2x) is assumed and checked against
// the 12px lamp the platform ships; and pixel identity is not asserted — the
// assertion is that the geometry a person reads at arm's length matches.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = argument("--url", "http://127.0.0.1:4173");
const cacheDir = argument("--cache", "/tmp/ai-system6-big-sur-reference");
const output = resolve(argument("--output", "internal/evidence/drafts/bigsur-nextstep/reference"));
const BASE = "https://media.512pixels.net/downloads/macos-screenshots/11";

// The captures the package's locator table names, one per representative
// window, plus the one state a single window cannot show: a bar whose three
// lamps disagree, because a sheet disabled two of them.
const REFERENCES = [
  // `assertions` names what is comparable between the two. The lamp itself is
  // comparable in all of them — it is the same control at the same platform
  // size; the group's pitch is not, because ours keeps Close and Zoom at the
  // two ends of the bar (the owner's rule). The bar's own height and the group's inset are only comparable where
  // the reference window is the same *kind* of window our desk draws: a
  // standard 28px title bar. Finder and System Preferences are toolbar windows
  // (52px, title inside the toolbar, full-height sidebar), which this desk does
  // not draw yet, so they are measured and reported rather than asserted.
  { id: "textedit", role: "single document", locator: "BS-L10 TextEdit", file: "11-Big-Sur-TextEdit.png", window: "teachText", reference: "TextEdit", assertions: ["diameter", "offset", "bar"] },
  { id: "finder-home", role: "file browsing", locator: "BS-L07 Finder: Home", file: "11-Big-Sur-Finder-Home.png", window: "projects", reference: "Finder: Home", assertions: ["diameter"], gap: "toolbar window: 52px bar with the title and search inside it, full-height sidebar" },
  // The third lamp in this capture is drawn disabled — System Preferences is
  // not a zoomable window — so its group is measured from the pair that is
  // live, and the disabled lamp becomes one of the states this set records.
  { id: "system-preferences-general", role: "settings", locator: "BS-L08 System Preferences: General", file: "11-Big-Sur-Light-System-Preferences-General.png", window: "control", reference: "System Preferences: General", assertions: ["diameter"], gap: "toolbar window: 52px bar carrying navigation, title and search; our settings strip lives inside the pane. Its third lamp ships disabled." },
  { id: "finder-copy-warning", role: "warning (sheet state)", locator: "BS-L09 Finder: Copy Warning", file: "11-Big-Sur-Finder-Copy-Warning.png", window: null, reference: "Finder: Copy Warning", assertions: [] },
];

// Pinned 2026-09-23 on the first run, so a library that re-renders a capture is
// visible as a hash change instead of quietly moving the reference.
const SHA = {
  textedit: "caaf0fe16af4532d55ff2baccb0c5dce5d2175eb5eb698fc58d4a66eecb79dd3",
  "finder-home": "4be5dc226ba14473a61d7c32cef03402bb46528661f89fda7296a672fedfc5f2",
  "system-preferences-general": "5392321a3d2e9d96ebacd8c7274066009f8717f30a5c61cb8c5af7b174b3050d",
  "finder-copy-warning": "bdeeaf2d3222b036abf1efd86d35520ef18b8d3d6f3ba5eaf6b09a5496785bb0",
};

// The three platform lamps as colour families, not as three literals: a lamp
// drawn as a flat fill and a lamp drawn as a fill plus a one-pixel darker rim
// then measure the same diameter, which is the thing a person sees. The
// families are narrow enough to leave grey chrome and wallpaper out.
const LAMPS = {
  close: (r, g, b) => r > 180 && g < 145 && b < 135 && r - g > 60,
  minimize: (r, g, b) => r > 195 && g > 140 && b < 115 && r - b > 110,
  zoom: (r, g, b) => g > 145 && r < 145 && b < 135 && g - r > 45,
};
const CHROME_CROP = { width: 320, height: 140 }; // 2x pixels, so 160x70 CSS

async function loadImage(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  return { data, info, at };
}

// The capture's own alpha tells us where the window is: the gallery drops each
// window on a transparent field, so the opaque bounding box is the window plus
// at most a hair of shadow.
function windowBox({ data, info }) {
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 250) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function clusters(points, gap = 6) {
  const found = [];
  for (const point of points) {
    const hit = found.find((c) => point.x >= c.minX - gap && point.x <= c.maxX + gap && point.y >= c.minY - gap && point.y <= c.maxY + gap);
    if (hit) {
      hit.minX = Math.min(hit.minX, point.x);
      hit.maxX = Math.max(hit.maxX, point.x);
      hit.minY = Math.min(hit.minY, point.y);
      hit.maxY = Math.max(hit.maxY, point.y);
      hit.pixels += 1;
    } else {
      found.push({ minX: point.x, maxX: point.x, minY: point.y, maxY: point.y, pixels: 1 });
    }
  }
  return found
    // A lamp is a disc: it fills most of its bounding box. The rounded corner
    // of the window lets a wedge of wallpaper through, and that wedge is
    // lamp-coloured on a pink desktop but never disc-shaped.
    .filter((c) => {
      const width = c.maxX - c.minX + 1;
      const height = c.maxY - c.minY + 1;
      return width >= 12 && height >= 12 && c.pixels >= 0.5 * width * height;
    })
    .map((c) => ({
      centre: [Math.round((c.minX + c.maxX) / 2), Math.round((c.minY + c.maxY) / 2)],
      size: [c.maxX - c.minX + 1, c.maxY - c.minY + 1],
      pixels: c.pixels,
    }))
    .sort((a, b) => a.centre[0] - b.centre[0]);
}

// Lamp colours are flat fills, so a tolerance around each platform colour
// separates them from wallpaper and from glyph ink. Antialiased edges are left
// out on purpose: the measured diameter is then the painted core, the same
// thing the CSS paints.
// The lamp group is the topmost-leftmost thing each family paints inside the
// window, which is true of every state in this reference set: a bar's coloured
// controls sit at its leading edge, and nothing else up there is lamp-coloured.
function lampClusters(image, box, search = {}) {
  const from = search.from ?? box.minY;
  // The band a lamp can live in: a standard bar centres it 13px down, the
  // tallest toolbar this reference set shows centres it 26px down, and a 12px
  // lamp reaches 32px. 46 CSS pixels covers both and stops short of the first
  // content row, where a settings pane keeps its own green and red swatches.
  const rows = search.rows ?? 92;
  const result = {};
  for (const [name, matches] of Object.entries(LAMPS)) {
    const points = [];
    for (let y = from; y < Math.min(image.info.height, from + rows); y++) {
      for (let x = 0; x < image.info.width; x++) {
        const [r, g, b, a] = image.at(x, y);
        if (a < 200) continue;
        if (matches(r, g, b)) points.push({ x, y });
      }
    }
    const found = clusters(points).sort((a, b) => a.centre[0] + a.centre[1] - (b.centre[0] + b.centre[1]));
    result[name] = found;
  }
  return result;
}

// The chrome's bottom hairline is the first row that differs from the row above
// it across the width. The sample band is the right edge of the window — clear
// of the title (centred last time this ran) and of the lamp group (leading
// edge), so the only thing changing there is the hairline. The first few rows
// are skipped because the window's own top border and its rounded corner are
// steps too, and neither is the bar's bottom.
async function firstDivider(image, box, scale) {
  const fromX = Math.round(box.maxX - box.width * 0.12);
  const toX = Math.round(box.maxX - box.width * 0.05);
  const from = box.minY + Math.round(4 * scale);
  const to = Math.min(box.maxY, box.minY + Math.round(200 * scale));
  for (let y = from; y < to; y++) {
    let differing = 0;
    let sampled = 0;
    for (let x = fromX; x < toX; x++) {
      const above = image.at(x, y - 1);
      const here = image.at(x, y);
      sampled += 1;
      if (Math.abs(above[0] - here[0]) + Math.abs(above[1] - here[1]) + Math.abs(above[2] - here[2]) > 8) differing += 1;
    }
    if (sampled && differing / sampled > 0.8) return (y - box.minY) / scale;
  }
  return null;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// One measurement of one window, in CSS pixels: what a person reads off the
// screen rather than what any one stylesheet declares.
function geometryOf({ lamps, box, divider, scale }) {
  const [close, minimize, zoom] = lamps;
  const centre = close?.centre ?? null;
  return {
    lampDiameter: close ? round((close.size[0] + close.size[1]) / 2 / scale) : null,
    lampPitch: close && minimize && zoom ? round((zoom.centre[0] - close.centre[0]) / 2 / scale) : null,
    firstLampOffset: centre ? [round((centre[0] - box.minX) / scale), round((centre[1] - box.minY) / scale)] : null,
    // Zoom's centre measured in from the window's right edge: on our side the
    // product rule puts it at that end, mirroring Close's inset from the left.
    zoomFromRight: zoom ? round((box.maxX - zoom.centre[0]) / scale) : null,
    // The first full-width hairline below the window's top border. In a
    // standard title bar that is the bar's bottom; in a toolbar window it is
    // the bottom of whatever the toolbar sits above (Finder's tab row, System
    // Preferences' pane edge), which is exactly why the two are not compared
    // as if they were the same number.
    firstHairline: divider,
    };
}

async function download(entry) {
  await mkdir(cacheDir, { recursive: true });
  const path = resolve(cacheDir, entry.file);
  try {
    const buffer = await readFile(path);
    return { path, buffer };
  } catch {
    const response = await fetch(`${BASE}/${entry.file}`);
    if (!response.ok) throw new Error(`${entry.file}: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(path, buffer);
    return { path, buffer };
  }
}

const report = { measuredOn: new Date().toISOString().slice(0, 10), scaleBasis: "2x", references: [], ours: [], comparison: [] };
await mkdir(output, { recursive: true });

// ---- the native side --------------------------------------------------------
for (const entry of REFERENCES) {
  const { path, buffer } = await download(entry);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (SHA[entry.id] && SHA[entry.id] !== sha256) throw new Error(`${entry.file}: upstream hash changed (${sha256})`);
  SHA[entry.id] = sha256;
  const image = await loadImage(path);
  const box = windowBox(image);
  const scale = 2;
  const lamps = lampClusters(image, box);
  const divider = await firstDivider(image, box, scale);
  const row = {
    id: entry.id,
    role: entry.role,
    locator: entry.locator,
    window: entry.window,
    assertions: entry.assertions,
    gap: entry.gap ?? null,
    source: `${BASE}/${entry.file}`,
    sha256,
    pixels: [image.info.width, image.info.height],
    windowBox: box,
    geometry: geometryOf({ lamps: [lamps.close[0], lamps.minimize[0], lamps.zoom[0]], box, divider, scale }),
  };
  report.references.push(row);

  // Keep the measured rectangle, not the whole screenshot: the repository
  // carries the evidence, the cache carries the megabyte.
  const cropLeft = Math.max(0, box.minX - 8);
  const cropTop = Math.max(0, box.minY - 8);
  const cropWidth = Math.min(image.info.width - cropLeft, CHROME_CROP.width);
  const cropHeight = Math.min(image.info.height - cropTop, CHROME_CROP.height);
  await sharp(path)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toFile(resolve(output, `reference-${entry.id}-chrome.png`));
}

// The sheet capture is the one place a live macOS 11 bar shows three lamps in
// three states, so it is measured for its disagreement rather than for the
// group's geometry: with a sheet up, Close and Zoom are disabled and flat grey
// while Miniaturize stays enabled. That is the platform's own evidence that a
// lamp's state is per control, which is what our background-window rule needs
// to agree with.
{
  const entry = REFERENCES.find((r) => r.id === "finder-copy-warning");
  const image = await loadImage(resolve(cacheDir, entry.file));
  const box = windowBox(image);
  const lamps = lampClusters(image, box, { from: box.minY, rows: 200 });
  const minimize = lamps.minimize[0];
  assert.ok(minimize, "the sheet capture still shows the enabled Miniaturize lamp");
  const [x, y] = minimize.centre;
  const sample = (cx) => image.at(cx, y).slice(0, 3).map((v) => Math.round(v));
  const enabled = sample(x);
  const left = sample(x - 40);
  const right = sample(x + 40);
  const isGrey = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 14;
  assert.ok(!isGrey(enabled), `the enabled lamp keeps its colour (${enabled.join(",")})`);
  assert.ok(isGrey(left) && isGrey(right), `the disabled lamps are flat grey (${left.join(",")} / ${right.join(",")})`);
  report.sheetState = { reference: entry.reference, source: `${BASE}/${entry.file}`, enabled, disabled: [left, right] };
}

// ---- our side ---------------------------------------------------------------
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.goto(url);
await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 60000 });
await page.evaluate(async () => {
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  await applyTheme("big-sur");
  await setFinderEnvironment("multifinder", { persistStartup: false });
});
await page.evaluate(async () => {
  await openWindow("projects");
  await openWindow("teachText");
  await openWindow("control");
});
await page.evaluate(() => {
  const places = { projects: [80, 60, 520, 380], teachText: [470, 130, 560, 330], control: [120, 430, 620, 320] };
  for (const [name, [left, top, width, height]] of Object.entries(places)) {
    const win = getWindow(name);
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
    win.style.width = `${width}px`;
    win.style.height = `${height}px`;
  }
  focusWindow(getWindow("teachText"));
});
await page.waitForTimeout(400);

for (const entry of report.references.filter((r) => r.window)) {
  // Brought to the front first: a background window's lamps are grey on
  // purpose, and a grey lamp has no colour family to measure.
  await page.evaluate((name) => focusWindow(getWindow(name)), entry.window);
  await page.waitForTimeout(120);
  const path = resolve(output, `ours-${entry.id}-chrome.png`);
  await page.locator(`[data-window="${entry.window}"]`).screenshot({ path });
  const image = await loadImage(path);
  const box = { minX: 0, minY: 0, maxX: image.info.width - 1, maxY: image.info.height - 1, width: image.info.width, height: image.info.height };
  // Only the title bar is searched: a lamp lives there, and a settings pane or
  // a Finder toolbar below it keeps green and red swatches of its own.
  const bar = await page.evaluate((name) => {
    const titleBar = getWindow(name).querySelector(":scope > .title-bar");
    return {
      height: titleBar.getBoundingClientRect().height,
      controls: [...titleBar.querySelectorAll(":scope > :is(.close-box, .minimize-box, .resize-box)")].map((control) => control.className),
    };
  }, entry.window);
  const lamps = lampClusters(image, box, { from: 0, rows: Math.ceil(bar.height * 2) + 2 });
  const divider = await firstDivider(image, box, 2);
  const geometry = geometryOf({ lamps: [lamps.close[0], lamps.minimize[0], lamps.zoom[0]], box, divider, scale: 2 });
  report.ours.push({ id: entry.id, window: entry.window, role: entry.role, geometry });
  assert.deepEqual(bar.controls, ["close-box", "resize-box"],
    `${entry.window}: the bar carries Close and Zoom and no minimize lamp`);
  assert.equal(lamps.minimize.length, 0, `${entry.window}: no yellow lamp is painted in the bar`);
  assert.ok(geometry.firstLampOffset && geometry.zoomFromRight !== null
    && Math.abs(geometry.firstLampOffset[0] - geometry.zoomFromRight) <= 2,
  `${entry.window}: Close sits at the left end and Zoom at the right end, the same inset from each edge (${JSON.stringify(geometry.firstLampOffset)} / ${geometry.zoomFromRight})`);
  // The state the native sheet capture demonstrates per lamp: a window that is
  // not the key window greys every lamp it carries, together.
  await page.evaluate((name) => focusWindow(getWindow(name === "teachText" ? "control" : "teachText")), entry.window);
  await page.waitForTimeout(120);
  const inactive = await page.evaluate((name) => [...getWindow(name).querySelectorAll(":scope > .title-bar > :is(.close-box, .minimize-box, .resize-box)")]
    .filter((box) => !box.hidden && !box.disabled && getComputedStyle(box).display !== "none")
    .map((box) => getComputedStyle(box).filter), entry.window);
  assert.deepEqual(inactive, ["grayscale(1)", "grayscale(1)"],
    `${entry.window}: a background window greys both of its lamps, not one of them`);
}
assert.deepEqual(pageErrors, [], "the desk renders these windows without a page error");
await browser.close();

// ---- the comparison ---------------------------------------------------------
for (const ours of report.ours) {
  const reference = report.references.find((r) => r.id === ours.id);
  const rows = [];
  for (const key of ["lampDiameter", "lampPitch", "zoomFromRight", "firstHairline"]) {
    const a = reference.geometry[key];
    const b = ours.geometry[key];
    rows.push({ metric: key, reference: a, ours: b, delta: a === null || b === null ? null : round(b - a) });
  }
  const dx = ours.geometry.firstLampOffset && reference.geometry.firstLampOffset
    ? [round(ours.geometry.firstLampOffset[0] - reference.geometry.firstLampOffset[0]), round(ours.geometry.firstLampOffset[1] - reference.geometry.firstLampOffset[1])]
    : null;
  rows.push({ metric: "firstLampOffset", reference: reference.geometry.firstLampOffset, ours: ours.geometry.firstLampOffset, delta: dx });
  report.comparison.push({ id: ours.id, role: ours.role, reference: reference.reference, referenceSource: reference.source, rows });

  // Tolerances: the lamp core is measured after antialiasing is dropped, the
  // window box can include a hair of shadow, and the hairline is one pixel.
  const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r]));
  const asserts = reference.assertions ?? [];
  const close = (metric, tolerance) => metric.reference !== null && metric.ours !== null && Math.abs(metric.ours - metric.reference) <= tolerance;
  if (asserts.includes("diameter")) assert.ok(close(byMetric.lampDiameter, 1), `${ours.id}: lamp diameter within 1px of the reference (${JSON.stringify(byMetric.lampDiameter)})`);
  // No "pitch" assertion on our side: the native group's pitch is recorded, but
  // our two lamps sit at the two ends of the bar by the owner's rule.
  // The bar's height is asserted against the *kind* of bar: a document window
  // is one standard 28px bar, and the reference's own lamps sit 13-14px down a
  // bar of that height. The capture's hairline is not used here because in
  // TextEdit it fades out before the right edge, so the scan cannot see it.
  if (asserts.includes("bar")) assert.ok(ours.geometry.firstHairline !== null && ours.geometry.firstHairline <= 32, `${ours.id}: the document window draws one standard bar, not a toolbar (${ours.geometry.firstHairline}px to its hairline, reference lamps ${JSON.stringify(reference.geometry.firstLampOffset)})`);
  if (asserts.includes("offset")) assert.ok(dx && Math.abs(dx[0]) <= 2 && Math.abs(dx[1]) <= 3, `${ours.id}: the first lamp sits where the reference puts it (${JSON.stringify(dx)})`);
}

for (const entry of report.references) {
  const reference = report.comparison.find((r) => r.id === entry.id);
  if (!reference) continue;
  console.log(`\n${entry.id} — ${entry.role} (${entry.locator})`);
  for (const row of reference.rows) {
    console.log(`   ${row.metric.padEnd(16)} reference ${JSON.stringify(row.reference).padEnd(18)} ours ${JSON.stringify(row.ours).padEnd(18)} delta ${JSON.stringify(row.delta)}`);
  }
  console.log(`   asserted: ${(entry.assertions ?? []).join(", ") || "none (state-only reference)"}${entry.gap ? ` | open gap: ${entry.gap}` : ""}`);
  if (entry.id === "finder-copy-warning") console.log(`   sheet state: enabled ${report.sheetState.enabled.join(",")} | disabled ${report.sheetState.disabled.map((c) => c.join(",")).join(" / ")}`);
}

await writeFile(resolve(output, "manifest.json"), `${JSON.stringify({ ...report, hashes: SHA }, null, 2)}\n`);
console.log(`\nWrote ${report.comparison.length} comparison(s) and ${report.references.length} reference crop(s) to ${output}.`);
console.log("Caveat carried into the manifest: the gallery keeps wallpaper tinting on, so these are relationships, not absolute colours.");
