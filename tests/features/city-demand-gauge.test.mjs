// Shared RCI demand gauge core contract: bars/deadband/clamp and a DPR-aware
// draw with frame, ticks, zero line, three colour-separated bars, optional
// R/C/I labels, and a highlight outline.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("city-demand-gauge");
const source = read("app/features/city-demand-gauge.js");

function makeCanvas() {
  const rects = [];
  const ctx = {
    setTransform: (...args) => { ctx.transform = args; },
    clearRect: () => {},
    fillRect: (x, y, w, h) => { rects.push({ x, y, w, h, style: ctx.fillStyle }); },
    fillStyle: "#000",
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, _rects: rects, _ctx: ctx };
  return canvas;
}

function loadGauge(dpr) {
  const sandbox = { window: { devicePixelRatio: dpr || 1 } };
  vm.runInContext(source, vm.createContext(sandbox), { filename: "city-demand-gauge.js" });
  return sandbox.window.AISystem6CityDemandGauge;
}

test.assert(typeof loadGauge().bars === "function", "the core exposes bars()");
test.assert(typeof loadGauge().draw === "function", "the core exposes draw()");

// Deadband + clamp.
{
  const g = loadGauge();
  const bars = g.bars({ r: 0.02, c: -0.5, i: 1.4 });
  test.assert(bars[0].fraction === 0, "a 0.02 residual is read as zero");
  test.assert(bars[1].fraction === -0.5, "a negative demand stays negative");
  test.assert(bars[2].fraction === 1, "an extreme industrial demand clamps to +1");
  test.assert(bars.map((b) => b.id).join(",") === "residential,commercial,industrial", "the three ids come back in R/C/I order");
}

// Zero draws frame, ticks, and zero line — but no bar fill.
{
  const g = loadGauge();
  const canvas = makeCanvas();
  g.draw(canvas, "gauge-bar", { r: 0, c: 0, i: 0 }, { colors: { r: "#f00", c: "#0f0", i: "#00f" }, ink: "#000" });
  const colored = canvas._rects.filter((r) => r.style !== "#000");
  test.assert(colored.length === 0, "zero demand draws no coloured bar");
  const frame = canvas._rects.filter((r) => r.style === "#000");
  test.assert(frame.length >= 6, "the frame, +/− ticks, and zero line are drawn in ink");
}

// The R bar's rects are all in colour r.
{
  const g = loadGauge();
  const canvas = makeCanvas();
  g.draw(canvas, "gauge-bar", { r: 0.8, c: 0, i: 0 }, { colors: { r: "#1f9d3a", c: "#2a55c7", i: "#d9a900" }, ink: "#000" });
  const red = canvas._rects.filter((r) => r.style === "#1f9d3a");
  const blue = canvas._rects.filter((r) => r.style === "#2a55c7");
  const yellow = canvas._rects.filter((r) => r.style === "#d9a900");
  test.assert(red.length > 0 && blue.length === 0 && yellow.length === 0, "only the R bar paints in colour r");
}

// Labels appear for panel tiers, not for gauge-bar.
{
  const g = loadGauge();
  const panel = makeCanvas();
  g.draw(panel, "bonsai-panel", { r: 0.3, c: -0.3, i: 0.3 }, { colors: { r: "#1f9d3a", c: "#2a55c7", i: "#d9a900" }, ink: "#000" });
  // Panel draws glyphs, so more ink rects than a bar-less frame.
  const bar = makeCanvas();
  g.draw(bar, "gauge-bar", { r: 0.3, c: -0.3, i: 0.3 }, { colors: { r: "#1f9d3a", c: "#2a55c7", i: "#d9a900" }, ink: "#000" });
  test.assert(panel._rects.length > bar._rects.length, "panel tiers draw R/C/I label glyphs; the gauge-bar tier does not");
}

// DPR: at devicePixelRatio 2 the backing store is doubled and the transform
// is set to the same scale.
{
  const g = loadGauge(2);
  const canvas = makeCanvas();
  g.draw(canvas, "gauge-bar", { r: 0, c: 0, i: 0 }, { colors: { r: "#000", c: "#000", i: "#000" }, ink: "#000" });
  test.assert(canvas.width === 32 * 2 && canvas.height === 20 * 2, "the gauge-bar backing store is doubled at DPR 2");
  test.assert(canvas._ctx.transform && String(canvas._ctx.transform) === "2,0,0,2,0,0", "the draw sets a 2x transform at DPR 2");
}

// Highlight: a demand bar draws a 2-px ink outline around the named bar.
{
  const g = loadGauge();
  const canvas = makeCanvas();
  g.draw(canvas, "gauge-bar", { r: 0.6, c: 0, i: 0 }, { colors: { r: "#1f9d3a", c: "#2a55c7", i: "#d9a900" }, ink: "#000", highlight: "residential" });
  // The highlight outline is drawn in ink around the R bar, so there are ink
  // rects that are outline bars (x<N bar width, thin height) in addition to
  // the frame/zero line.
  const inkRects = canvas._rects.filter((r) => r.style === "#000");
  test.assert(inkRects.length > 6, "a highlighted bar adds an ink outline");
}

test.finish();
