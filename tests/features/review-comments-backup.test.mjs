// project.reviewComments rides on the project record. This pins that it
// survives a real backup: Recovery export (straight from IndexedDB's shape),
// integrity, validation, and the identity remap of a restore. A damaged list is
// refused at validation rather than opened on the desk.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createBackupVm, seedComplexProject } from "../helpers/backup-vm.mjs";

const test = createFeatureTest("review-comments-backup");

const model = vm.createContext({ window: {}, console });
model.globalThis = model.window;
vm.runInContext(read("app/core/text-quote.js"), model);
vm.runInContext(read("app/core/review-comments.js"), model);
const Quote = model.window.AISystem6TextQuote;
const Comments = model.window.AISystem6ReviewComments;

const text = "正文\n\n这一句要被批注。别的话。";
const start = text.indexOf("这一句");
const comment = Comments.createComment({
  id: "c-1",
  now: "2026-10-09T10:00:00.000Z",
  kind: "voice",
  text: "像嘴替。",
  author: { role: "reviewer", name: "小周" },
  anchor: Quote.createAnchor(text, start, start + 6),
});
let list = Comments.append([], comment);
list = Comments.append(list, Comments.createReply({ id: "r-1", now: "2026-10-09T10:05:00.000Z", rootId: "c-1", text: "我再想想", author: { role: "writer", name: "" } }));
list = Comments.append(list, Comments.createStateReply({ id: "s-1", now: "2026-10-09T10:06:00.000Z", rootId: "c-1", state: "accepted", text: "", author: { role: "writer", name: "" } }));
list = Comments.track(list, "c-1", start + 3, "2026-10-09T10:07:00.000Z");
list = Comments.tick(list, "c-1", "小周", true, "2026-10-09T10:08:00.000Z");

function seeded(reviewComments) {
  const seed = seedComplexProject();
  seed.projects[0] = { ...seed.projects[0], reviewComments };
  return createBackupVm(seed);
}

{
  const runtime = seeded(list);
  const bundle = await runtime.recovery.exportRecoveryProjectBackup("p1");
  test.assert(JSON.stringify(bundle.project.reviewComments) === JSON.stringify(list), "the export carries every record of the list, in order");
  test.assert((await runtime.backup.verifyIntegrity(bundle)).valid === true, "integrity holds with comments in the project");
  const validation = runtime.backup.validateBackup(bundle);
  test.assert(validation.valid === true, `structural validation accepts a sound list ${JSON.stringify(validation.errors)}`);

  let sequence = 0;
  const imported = runtime.backup.remapBackup(bundle, { uuid: () => `new-${(sequence += 1)}`, now: "2026-10-10T00:00:00.000Z" });
  test.assert(imported.project.id !== "p1", "the restored project is a new one");
  test.assert(JSON.stringify(imported.project.reviewComments) === JSON.stringify(list), "and its comments come back unchanged: ids, words, anchors, replies, states");
  test.assert(Comments.validateList(imported.project.reviewComments).length === 0, "the restored list still reads as sound to the desk");
  const thread = Comments.buildThreads(imported.project.reviewComments, text)[0];
  test.assert(thread.state === "accepted" && thread.place.status === "found" && thread.ticks[0] === "小周", "the restored thread resolves its passage and keeps its state and tick");
}

{
  // A project that never had comments exports as it always did.
  const runtime = createBackupVm(seedComplexProject());
  const bundle = await runtime.recovery.exportRecoveryProjectBackup("p1");
  test.assert(bundle.project.reviewComments === undefined, "a project with no comments gains no field");
  test.assert(runtime.backup.validateBackup(bundle).valid === true, "and validates as before");
}

for (const [label, bad] of [
  ["a list that is not an array", { not: "a list" }],
  ["a reply to a comment that is not there", [{ id: "r", type: "reply", rootId: "ghost", text: "x", author: { role: "writer", name: "" }, createdAt: "z" }]],
  ["a duplicate id", [comment, { ...comment }]],
  ["a comment with no quote", [{ ...comment, anchor: { ...comment.anchor, quote: "" } }]],
  ["an unknown state", [comment, { id: "s", type: "state", rootId: "c-1", state: "deleted", text: "", author: { role: "writer", name: "" }, createdAt: "z" }]],
  ["an unknown record type", [comment, { id: "z", type: "script", rootId: "c-1" }]],
]) {
  const runtime = seeded(list);
  const good = await runtime.recovery.exportRecoveryProjectBackup("p1");
  const bundle = { ...good, project: { ...good.project, reviewComments: bad } };
  const result = runtime.backup.validateBackup(bundle);
  test.assert(result.valid === false && result.errors.some((message) => message.includes("reviewComments")), `validation refuses ${label}`);
  const refused = seeded(bad);
  test.assert((await refused.recovery.exportRecoveryProjectBackup("p1")) === null, `and Recovery export does not write out ${label}`);
}

test.finish();
