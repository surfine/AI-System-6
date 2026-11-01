import assert from "node:assert/strict";
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
const test = createFeatureTest("bonsai-surface-geometry");
const context = vm.createContext({ window: {} });
vm.runInContext(read("app/features/bonsai-renderer-voxel.js"), context);
const pure = context.window.AISystem6BonsaiVoxelRenderer.pure;
const recipes = pure.buildRecipes(JSON.parse(read("assets/bonsai/atlas-source.json")));
const scene = { buildings: [], facilities: [], covered: new Set() };
const world = () => ({ size: 5, alt: new Uint8Array(25).fill(1), water: new Uint8Array(25), road: new Uint8Array(25), tick: 500, timeOfDay: .5 });
const collect = (snapshot) => pure.collectChunkBlocks(snapshot, recipes, 0, 0, scene);
const contains = (block,x,z) => Math.abs(x-block.x)<=block.sx/2+1e-8 && Math.abs(z-block.z)<=block.sz/2+1e-8;
const inCenter = (block) => block.x>=2 && block.x<3 && block.z>=2 && block.z<3;
for (const [dx,dz] of [[1,0],[0,1]]) {
  const snapshot=world();snapshot.road[12]=1;snapshot.road[(2+dz)*5+2+dx]=1;
  const blocks=collect(snapshot).opaque;
  const paving=blocks.filter((b)=>b.tile==="road"&&inCenter(b));
  const marking=blocks.filter((b)=>b.tile==="metal"&&Math.abs(b.sy-.02)<1e-8&&inCenter(b));
  for (const [name,parts] of [["paving",paving],["marking",marking]]) {
    assert.ok(parts.some((b)=>contains(b,2.5+dx*.5,2.5+dz*.5)),`${name} reaches the positive shared boundary`);
    assert.ok(!parts.some((b)=>contains(b,2.5-dx*.49,2.5-dz*.49)),`${name} does not sprout a disconnected reverse arm`);
  }
}
const straight=world();[11,12,13].forEach((i)=>{straight.road[i]=1;});
const road=collect(straight).opaque.filter((b)=>b.tile==="road");
for (const boundary of [2,3]) for (const side of [-.001,.001]) {
  assert.ok(road.some((b)=>contains(b,boundary+side,2.5)),"adjacent straight-road tiles meet without a gap");
}
for (const kind of ["shore","cliff"]) {
  const snapshot=world();
  for (const i of [7,11,13,17]) {
    if (kind==="shore") {snapshot.water[i]=1;snapshot.alt[i]=0;}
    else snapshot.alt[i]=2;
  }
  const result=collect(snapshot);
  const strips=(kind==="shore"?result.opaque.filter((b)=>b.tile==="terrain.sand"&&b.sy<.05):result.tint).filter(inCenter);
  assert.equal(strips.length,4,`${kind} renders each exposed edge of the altitude-one tile`);
  for (const b of strips) {
    assert.ok(b.x-b.sx/2>=1.99&&b.x+b.sx/2<=3.01&&b.z-b.sz/2>=1.99&&b.z+b.sz/2<=3.01,`${kind} stays on its owning tile`);
    const distance=Math.min(Math.abs(b.x-2),Math.abs(b.x-3),Math.abs(b.z-2),Math.abs(b.z-3));
    assert.ok(distance<.08,`${kind} hugs an edge instead of crossing the tile interior`);
  }
}
test.assert(true,"positive road arms and markings reach shared edges without reverse arms; straight roads join; shoreline and cliff bands stay on their owning tile");
test.finish();
