// ClioStage motion contract: animation list, transition and notes-master edits on the real P10 deck
// round-trip through the Lectern adapter (read after save shows the change, untouched parts keep their
// bytes), and the handout plan counts its pages.
import vm from "node:vm";
import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-stage-motion");
const P10 = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/pptx/P10.pptx")));
const ctx = makeContext();
loadScripts(ctx, ["app/vendor/clioworks-v3/lectern-adapter.js"]);
const open = (bytes) => { ctx.__bytes = bytes; return vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__bytes, { name: 'P10.pptx' })", ctx); };
const entries = (bytes) => new Map(new AdmZip(Buffer.from(bytes)).getEntries().map((e) => [e.entryName, e.getData()]));

const run = async () => {
  const a = await open(P10);
  const slide = a.slides()[3].id;
  const first = a.animations(slide);
  test.assert(first.length === 1 && first[0].eff === "appear" && first[0].trigger === "click", "P10 page 4 lists its one appear effect on click");

  const shapes = a.shapes(slide);
  const other = shapes.find((s) => s.id !== first[0].shapeId);
  test.assert(a.setAnimation(slide, first[0].id, { eff: "fade", dur: 800, delay: 250, trigger: "after" }).changed, "effect, duration, delay and trigger change in one step");
  const added = a.addAnimation(slide, other.id, "entr", "flyIn");
  test.assert(added.status === "ok" && a.animations(slide).length === 2, "an entrance effect is added to a chosen object");
  a.moveAnimation(slide, added.id, -1);
  test.assert(a.animations(slide)[0].id === added.id, "the new effect moves up the order");
  test.assert(a.addAnimation(slide, other.id, "exit").status === "ok" && a.addAnimation(slide, other.id, "emph").status === "ok", "exit and emphasis effects can be added");
  const extra = a.animations(slide).slice(2);
  extra.forEach((x) => a.removeAnimation(slide, x.id));
  test.assert(a.animations(slide).length === 2, "effects can be removed");

  test.assert(a.setTransition(slide, { preset: a.transitions().findIndex((t) => t.type === "push"), dur: 1500 }).changed, "page 4 gets a push transition of 1.5 s");
  const nm = a.notesMaster();
  test.assert(nm.some((x) => x.kind === "hdr"), "the notes master lists its header placeholder");
  a.setNotesMaster("hdr", "Aaron & 讲义");

  const saved = await a.save();
  const b = await open(saved.bytes);
  const slideB = b.slides()[3].id;
  const list = b.animations(slideB);
  test.assert(list.length === 2 && list[0].eff === "flyIn" && list[1].eff === "fade" && list[1].dur === 800 && list[1].delay === 250 && list[1].trigger === "after", "after save and reopen the order, duration, delay and trigger read back");
  const tr = b.transition(slideB);
  test.assert(tr.type === "push" && tr.dur === 1500, "the transition type and duration read back");
  test.assert(b.notesMaster().find((x) => x.kind === "hdr").text === "Aaron & 讲义", "the notes master header reads back");

  const before = entries(P10);
  const after = entries(saved.bytes);
  const moved = [...before.keys()].filter((name) => !after.has(name) || Buffer.compare(before.get(name), after.get(name)) !== 0);
  test.assert(moved.every((name) => /^ppt\/slides\/slide4\.xml$|^ppt\/notesMasters\/notesMaster1\.xml$|^\[Content_Types\]\.xml$/.test(name)), `untouched parts keep their bytes (changed: ${moved.join(", ")})`);

  // Undo takes the notes master back with the rest.
  while (a.canUndo()) a.undo();
  test.assert(a.notesMaster().find((x) => x.kind === "hdr").text !== "Aaron & 讲义", "undo restores the notes master text");

  // Handout plan.
  ctx.window = ctx;
  const native = loadScripts(ctx, ["app/features/clio-stage-native.js"]);
  void native;
  const plan = vm.runInContext("AISystem6ClioStageNative.handoutPages", ctx);
  const pages = (n, layout) => plan(n, layout).length;
  test.assert([1, 2, 3, 4, 6, 9].map((k) => pages(4, { perPage: k })).join() === "4,2,2,1,1,1", "P10's four slides need 4, 2, 2, 1, 1, 1 handout pages");
  test.assert([1, 2, 3, 4, 6, 9].map((k) => pages(10, { perPage: k })).join() === "10,5,4,3,2,2", "ten slides need 10, 5, 4, 3, 2, 2 handout pages");
  test.assert(pages(4, { notes: true }) === 4 && plan(4, { notes: true })[0].length === 1, "notes pages print one slide per page");

  test.finish();
};

run();
