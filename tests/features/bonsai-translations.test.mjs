// Every semantic key consumed by the dynamic Bonsai shell must exist in both
// language tables; comparing the tables only to each other can let both omit
// the same new key.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-translations");
const shell = read("app/features/bonsai-city.js");
const context = vm.createContext({ window: {} });
vm.runInContext(read("app/data/translations-en.js"), context);
vm.runInContext(read("app/data/translations-zh.js"), context);
vm.runInContext(read("app/features/bonsai-translations.js"), context);
const en = context.window.AISystem6TranslationsEn;
const zh = context.window.AISystem6TranslationsZh;

const required = new Set([...shell.matchAll(/["'`](bonsai_[a-z0-9_]+)["'`]/g)].map((match) => match[1]));
for (const id of ["raise", "lower", "level", "tree", "road", "rail", "station", "residential_light", "residential_high", "commercial_light", "commercial_high", "industrial_light", "industrial_high", "wire", "pipe", "coal", "wind", "pump", "water_tower", "police", "fire", "education", "healthcare", "query", "demolish"]) required.add(`bonsai_tool_${id}`);
for (const id of ["terrain", "transport", "zones", "utilities", "services", "inspect"]) required.add(`bonsai_tool_group_${id}`);
for (const id of ["balanced", "river", "lake", "coast"]) required.add(`bonsai_terrain_${id}`);
for (const id of ["pause", "slow", "normal", "fast"]) required.add(`bonsai_speed_${id}`);
for (const id of ["road", "power", "wire", "zone", "run"]) required.add(`bonsai_goal_${id}`);
for (const id of ["none", "power", "water", "traffic", "pollution", "land_value", "police", "fire", "education", "health"]) required.add(`bonsai_overlay_${id}`);
for (const id of ["roads", "utilities", "police", "fire", "education", "health"]) required.add(`bonsai_funding_${id}`);
for (const id of ["open", "export", "delete"]) required.add(`bonsai_city_${id}`);
for (const id of ["starter", "troubled"]) required.add(`bonsai_example_${id}`);

for (const key of [...required].sort()) {
  test.assert(Object.prototype.hasOwnProperty.call(en, key), `English defines ${key}`);
  test.assert(Object.prototype.hasOwnProperty.call(zh, key), `Chinese defines ${key}`);
}
test.assert(JSON.stringify(Object.keys(en).filter((key) => key.startsWith("bonsai_")).sort()) === JSON.stringify(Object.keys(zh).filter((key) => key.startsWith("bonsai_")).sort()), "Bonsai English and Chinese key sets have parity");

test.finish();
