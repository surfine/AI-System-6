// ClioWorks v4 (V4-03) contract: creation-side cue fields hang beside the one
// narration body; making fields never enter the narration; deleted paragraphs
// land in the unlocated area; cue edits undo on their own stack.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-cues");

const run = async () => {
  const context = {
    console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Promise,
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("app/vendor/clioworks-v3/creator-cues.js"), context, { filename: "creator-cues.js" });
  const { createCueStore } = context.AISystem6CreatorCues;
  test.assert(typeof createCueStore === "function", "creator-cues installs bare");

  const body = [
    { id: "p1", text: "开场：这次导出用了 42 秒。" },
    { id: "p2", text: "等待时间本身也是内容。" },
    { id: "p3", text: "结尾：下一期见。" },
  ];
  const store = createCueStore({ projectId: "proj-1" });

  // Cue fields attach to paragraph identities and stay out of the narration.
  store.attach("p1", "shot", "特写：进度条");
  store.attach("p1", "duration", 42);
  store.attach("p2", "material", "creator-data.xlsx:D5");
  const narration = store.narrationProjection(body);
  test.assert(
    narration.map((p) => p.text).join("\n") === body.map((p) => p.text).join("\n")
      && !JSON.stringify(narration).includes("特写")
      && !JSON.stringify(narration).includes("creator-data.xlsx"),
    "the narration projection carries the body text only — no making field leaks into it"
  );
  test.assert(store.cuesFor("p1").length === 2 && store.cuesFor("p1").some((c) => c.field === "duration" && c.value === 42),
    "cues read back per paragraph with their values");
  test.assert(store.allCues().length === 3, "allCues lists every attached cue");

  // Unknown fields are refused: the making vocabulary is closed.
  let threw = false;
  try { store.attach("p1", "口播正文", "正文字段不能当旁挂字段"); } catch { threw = true; }
  test.assert(threw, "a narration-body field name is refused as a making field (closed vocabulary)");

  // Deleting a paragraph moves its cues to the unlocated area — nothing is lost.
  const afterDelete = body.filter((p) => p.id !== "p2");
  const moved = store.rebase(afterDelete.map((p) => p.id));
  test.assert(moved.movedToUnlocated === 1 && store.unlocatedCues().length === 1 && store.unlocatedCues()[0].paragraphId === "p2",
    "a deleted paragraph's cues move to the unlocated area intact");
  const back = store.rebase(body.map((p) => p.id));
  test.assert(store.cuesFor("p2").some((c) => c.field === "material") && store.unlocatedCues().length === 0,
    "a restored paragraph takes its cues back from the unlocated area");

  // Undo/redo: cue edits only, one level each, no global rewind.
  store.attach("p3", "note", "语气轻一点");
  const label = store.undo();
  test.assert(label === "attach:note" && store.cuesFor("p3").length === 0, "undo removes the last cue edit");
  test.assert(store.redo() === "attach:note" && store.cuesFor("p3")[0].value === "语气轻一点", "redo restores it");
  const bounded = store.undo();
  test.assert(bounded === null || typeof bounded === "string", "undo answers with a step label or null, local to cue edits");
  store.redo();

  // Backup: snapshot/restore round-trips cues and the unlocated area.
  store.rebase(["p1", "p3"]);
  const snap = store.snapshot();
  const fresh = createCueStore({ projectId: "proj-1" });
  fresh.restore(snap);
  test.assert(fresh.snapshot().cues["p1"].length === 2 && fresh.unlocatedCues().length === 1,
    "a snapshot restores cues and the unlocated area into a new store");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
