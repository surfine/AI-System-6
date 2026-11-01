// Planning sanity checks keep the visual city from silently becoming a full
// coverage model. These are renderer contracts; they do not alter simulation.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync("apps/desktop/app/features/bonsai-renderer-voxel.js", "utf8"), context);
const pure = context.window.AISystem6BonsaiVoxelRenderer.pure;
const source = JSON.parse(readFileSync("apps/desktop/assets/bonsai/atlas-source.json", "utf8"));
const recipes = pure.buildRecipes(source);
const cases = [
  ["residential", 1, 0.28, 0.4, 0.28, 0.8], ["residential", 2, 0.3, 0.4, 0.9, 2.0], ["residential", 3, 0.27, 0.36, 1.7, 3.0],
  ["commercial", 1, 0.4, 0.52, 0.4, 1.05], ["commercial", 2, 0.38, 0.52, 1.1, 2.6], ["commercial", 3, 0.4, 0.56, 2.0, 3.5],
  ["industrial", 1, 0.34, 0.46, 0.34, 0.6], ["industrial", 2, 0.4, 0.5, 0.4, 0.7], ["industrial", 3, 0.35, 0.47, 0.4, 0.7],
];
for (const [zone, stage, c0, c1, f0, f1] of cases) {
  const planning = recipes.grammar[zone][stage].planning;
  const footprint = { w: stage, h: stage };
  const masses = pure.plannedBuildingMasses(footprint, planning, 7);
  const metrics = pure.measureParcelPlan(masses, footprint);
  assert(metrics.coverage >= c0 - 1e-6 && metrics.coverage <= c1 + 1e-6, `${zone}${stage} coverage`);
  assert(metrics.far >= f0 - 1e-6 && metrics.far <= f1 + 1e-6, `${zone}${stage} FAR`);
  assert(metrics.storeys >= planning.stories[0] && metrics.storeys <= planning.stories[1], `${zone}${stage} storeys`);
  assert(masses.every((mass) => mass.u0 >= -footprint.w / 2 && mass.u1 <= footprint.w / 2 && mass.v0 >= -footprint.h / 2 && mass.v1 <= footprint.h / 2), `${zone}${stage} setback`);
}
console.log("OK  bonsai parcel planning ranges and setbacks");
