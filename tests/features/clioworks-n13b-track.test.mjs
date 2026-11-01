// ClioWorks N13b contract: ClioWrite's 「记录修订」 toggle writes tracked
// changes back as w:ins / w:del. Two VMs, the same split the S11 contracts use:
//   - the headless makeContext (clioworks-s11-m3-write-surface's world) drives
//     createSession: the toggle is ONE named model command (one undo step
//     「记录修订：开/关」, the flag restored with it), the author name is asked
//     only the FIRST turn-on with none remembered (remembered in L.store /
//     localStorage; a remembered name turns tracking on without a question),
//     renaming goes through the same System 6 dialog on the 「署名…」 road, and
//     typing / deleting through the vendored ops stamps the runs.
//   - the linkedom editor VM (clioworks-s11-m3-write-events' world) drives the
//     real row: the 审阅 menu's check row, real beforeinput typing and deleting,
//     the N13a 修订 windoid following and resolving the writer's own revisions,
//     and save → reopen with the stamps and the settings.xml flag.
// Tracking OFF must behave exactly as before: the S11 contracts (run unchanged)
// answer that; here the one direct check is that fresh text carries no stamp.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clioworks-n13b-track");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));

/* -- a localStorage that records what the codec's settings store writes -- */
function recordingStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const run = async () => {
  /* ============ Part A: the session, headless (makeContext) ============ */
  {
    const ctx = makeContext();
    ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
    loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js", "app/vendor/clioworks-v3/quire-review.js", "app/features/clio-write.js"]);
    const api = ctx.AISystem6ClioWrite;
    const review = ctx.ClioWorksQuireReview;
    ctx.__bytes = DOCX;
    const adapter = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes.slice().buffer, { name: '搬家清单.docx' })", ctx);
    const store = recordingStorage();
    ctx.localStorage = store;
    const asks = [];
    const answers = [];
    const session = api.createSession(adapter, {
      fileName: "搬家清单.docx",
      mountedName: "搬家清单.docx",
      host: {},
      askRevisionAuthor: async (remembered) => { asks.push(remembered); return answers.shift(); },
    });
    const doc = () => adapter.document();
    const byText = (text) => adapter.paragraphs().find((p) => p.text.startsWith(text));

    // A1: the steps map, the row is wired, tracking starts off.
    test.assert(api.stepKey("记录修订：开") === "clio_write_step_track" && api.stepKey("记录修订：关") === "clio_write_step_track",
      "the toggle's labels map into the Edit menu's step key");
    test.assert(session.trackingOn() === false && session.commandState("revisions.track").enabled === true
      && session.commands().some((c) => c.id === "revisions.track" && c.checked === false),
      "「记录修订」 starts unchecked and its row is offered");

    // A2: turning it on asks once, remembers the name, sets the document's own flag.
    answers.push("陈一试");
    const on = await session.toggleTracking();
    test.assert(on.status === "ok" && on.on === true && doc().settings.track === true, "the toggle sets doc.settings.track");
    test.assert(asks.length === 1 && asks[0] === "", "the first turn-on asks for the name with nothing remembered");
    const storedKeys = [...store.map.keys()];
    test.assert(storedKeys.length === 1 && /\.userName$/.test(storedKeys[0]) && JSON.parse(store.map.get(storedKeys[0])) === "陈一试",
      `the name is remembered in the codec's own settings store (${storedKeys.join(", ")})`);
    test.assert(ctx.L.store.get("userName", "") === "陈一试", "L.store — the path O.revStamp() reads — returns the name");

    // A3: one named undo step; undo restores the flag, redo brings it back.
    test.assert(adapter.canUndo() && adapter.undoLabel() === "记录修订：开", "the toggle is one undo step named 「记录修订：开」");
    test.assert(session.editHistory.undoLabel() === "clio_write_step_track" && JSON.stringify(session.editHistory.undoLabelArgs()) === "[true]",
      "the Edit menu names the step with its state");
    adapter.undo();
    test.assert(doc().settings.track === false, "undo takes the flag back with the step");
    adapter.redo();
    test.assert(doc().settings.track === true, "redo brings tracking back");

    // A4: real edits through the vendored ops stamp the runs with the author.
    const D = ctx.L.D, O = ctx.L.O;
    const lastId = Number(byText("最后一段").id);   // dmodel ids are stable across edits
    const last = () => D.byId(doc(), lastId);
    adapter.modelCommand("Typing", () => { O.insertText(D.pos(last(), 0), "新字"); });
    const typed = last().runs.find((r) => r.t === "text" && r.text === "新字");
    test.assert(!!typed && typed.rPr && typed.rPr.ins && typed.rPr.ins.author === "陈一试",
      "typing with tracking on stamps w:ins with the remembered author");
    adapter.modelCommand("Delete", () => { O.deleteRange(D.pos(last(), 2), D.pos(last(), 4)); });
    const struck = last().runs.find((r) => r.t === "text" && r.rPr && r.rPr.del);
    test.assert(!!struck && struck.rPr.del.author === "陈一试",
      "deleting marks the run w:del (the words stay for the review list)");
    test.assert(review.revisions(adapter).length >= 2 && review.revisions(adapter).every((r) => r.author === "陈一试"),
      "the N13a review engine lists the writer's own stamps");

    // A5: turning it off never asks; fresh text carries no stamp (today's behaviour).
    const askCount = asks.length;
    const off = await session.toggleTracking();
    test.assert(off.status === "ok" && off.on === false && doc().settings.track === false && asks.length === askCount,
      "turning tracking off is one step and asks nothing");
    test.assert(adapter.undoLabel() === "记录修订：关" && JSON.stringify(session.editHistory.undoLabelArgs()) === "[false]",
      "the off step is named with its state");
    adapter.modelCommand("Typing", () => { O.insertText(D.pos(last(), 0), "白"); });
    const plain = last().runs.find((r) => r.t === "text" && r.text === "白");
    test.assert(!!plain && (!plain.rPr || !plain.rPr.ins), "with tracking off, typing carries no stamp (unchanged behaviour)");

    // A6: a remembered name turns tracking on again with no question at all —
    // the name is changed through the windoid's 「署名…」 road, not re-asked.
    const again = await session.toggleTracking();
    test.assert(again.status === "ok" && again.on === true && doc().settings.track === true && asks.length === askCount,
      "with the name already remembered, the second turn-on asks nothing");
    adapter.modelCommand("Typing", () => { O.insertText(D.pos(last(), 0), "改"); });
    const still = last().runs.find((r) => r.t === "text" && r.text === "改");
    test.assert(!!still && still.rPr.ins.author === "陈一试",
      "the remembered name keeps stamping without being re-asked");

    // A6b: the 「署名…」 rename road — the same System 6 dialog, prefilled with
    // the remembered name; the new name stamps from then on, and cancelling or
    // an empty answer leaves the remembered name as it was.
    const dialogAnswers = ["王三试"];
    const dialogs = [];
    ctx.showInputDialog = async ({ defaultValue }) => { dialogs.push(defaultValue); return dialogAnswers.shift() ?? null; };
    const renamed = await api.renameRevisionAuthor();
    test.assert(renamed === "王三试" && dialogs.length === 1 && dialogs[0] === "陈一试" && ctx.L.store.get("userName", "") === "王三试",
      "「署名…」 asks once on the same dialog, prefilled, and remembers the new name at once");
    adapter.modelCommand("Typing", () => { O.insertText(D.pos(last(), 0), "名"); });
    const restamped = last().runs.find((r) => r.t === "text" && r.text === "名");
    test.assert(!!restamped && restamped.rPr.ins.author === "王三试",
      "stamps after the rename carry the new name");
    dialogAnswers.push(null);
    const keptName = await api.renameRevisionAuthor();
    test.assert(keptName === null && dialogs.length === 2 && dialogs[1] === "王三试" && ctx.L.store.get("userName", "") === "王三试",
      "cancelling the rename leaves the remembered name as it was");
    dialogAnswers.push("");
    await api.renameRevisionAuthor();
    test.assert(dialogs.length === 3 && ctx.L.store.get("userName", "") === "王三试",
      "an empty rename answer changes nothing either");

    // A7: cancelling the FIRST question — a fresh machine with no name —
    // leaves tracking off and raises no undo step.
    const off2 = await session.toggleTracking();
    test.assert(off2.status === "ok" && off2.on === false, "(setup) tracking off for the cancel case");
    const rev = adapter.getEditRevision();
    store.map.delete(storedKeys[0]);
    answers.push(null);
    const cancelled = await session.toggleTracking();
    test.assert(cancelled.status === "cancelled" && doc().settings.track === false && adapter.getEditRevision() === rev
      && asks.length === askCount + 1 && asks[asks.length - 1] === "",
      "cancelling the only-first question turns nothing on and counts no edit");

    // A8: save → reopen keeps the stamps, the authors and the settings flag; no new
    // first-save entries (recording is native docx, nothing is converted or lost).
    answers.push("终名");
    await session.toggleTracking();
    const report = await adapter.exportReport();
    test.assert(report.converted.length === 0 && report.lost.length === 0,
      `recording revisions adds nothing to the first-save list (${report.converted.length}+${report.lost.length})`);
    const saved = await adapter.save();
    test.assert(saved.mode === "preserving-edit", "the tracked document saves as a preserving edit");
    ctx.__saved = saved.bytes;
    const reopened = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__saved.slice(0), { name: 'reopen.docx' })", ctx);
    const list = review.revisions(reopened);
    test.assert(list.length >= 2 && list.some((r) => r.type === "ins" && r.author === "王三试" && r.text.includes("名"))
      && list.some((r) => r.type === "del" && r.author === "陈一试"),
      `save → reopen keeps the w:ins / w:del stamps with their authors (${list.map((r) => r.type + ":" + r.author).join(", ")})`);
    test.assert(reopened.document().settings.track === true,
      "settings.xml round-trips w:trackRevisions, so the reopened file is still recording");
    session.close();
  }

  /* ============ Part B: the window, the real editor VM (linkedom) ============ */
  {
    const v = await createQuireEditorVm({ docx: DOCX, name: "搬家清单.docx" });
    v.load(["app/vendor/clioworks-v3/quire-review.js", "app/features/clio-write-review.js"]);
    const w = v.window;
    const doc = v.document;
    const api = w.AISystem6ClioWrite;
    const store = recordingStorage();
    w.localStorage = store;
    const asks = [];
    const answers = ["窗口作者"];
    w.showInputDialog = async ({ defaultValue }) => { asks.push(defaultValue); return answers.shift() ?? null; };
    const tick = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
    const D = () => v.run("L.D");
    const E = () => v.run("L.ed");
    const host = () => doc.querySelector("#pages");
    const byText = (adapter, text) => adapter.paragraphs().find((p) => p.text.startsWith(text));
    const live = () => v.record.liveAdapter;

    const out = await api.open(v.record, {});
    test.assert(out.ok, "(setup) the document is mounted");
    const adapter = live();

    // B1: the row in the 审阅 menu (D1: commands live in the menu bar) —
    // unchecked — and the question on the way on. The bar's row is stood in
    // for by one [data-app-menu] button, the element syncMenuMarks ticks.
    const bar = doc.createElement("div");
    bar.setAttribute("data-app-menu", "");
    bar.innerHTML = '<button data-action="clio-write-track"></button>';
    doc.body.appendChild(bar);
    const row = bar.querySelector('[data-action="clio-write-track"]');
    const review = v.menuSets.clioWrite.find((m) => m.id === "review");
    test.assert(review && review.items.some((item) => item.action === "clio-write-track") && v.menu("clio-write-track").available() && !row.classList.contains("is-checked"),
      "the 审阅 menu lists 「记录修订」, live and unchecked");
    v.menu("clio-write-track").run();
    await tick();
    test.assert(asks.length === 1 && asks[0] === "" && adapter.document().settings.track === true,
      "choosing the row asks for the name and turns the document's own flag on");
    test.assert(doc.querySelector(".cw-receipt").textContent === "clio_write_step_track:true",
      `the status line says the state (${doc.querySelector(".cw-receipt").textContent})`);
    test.assert(row.classList.contains("is-checked"), "the row now shows its check");

    // B2: real typing and deleting through the beforeinput path stamp the runs.
    const modelOf = (adapter, text) => D().byId(adapter.document(), Number(byText(adapter, text).id));
    const p = modelOf(adapter, "最后一段");
    E().setSel(D().pos(p, 0));
    v.fire(host(), "beforeinput", { inputType: "insertText", data: "好" });
    test.assert(!!byText(adapter, "好最后一段"), "(setup) typing reached the model");
    const typed = modelOf(adapter, "好最后一段").runs[0];
    test.assert(typed.t === "text" && typed.text === "好" && typed.rPr.ins.author === "窗口作者",
      "typed text carries the w:ins stamp of the named author");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_typing", "the typing itself is still one 「键入」 step on top of the toggle");
    const weekend = modelOf(adapter, "这个周末");
    E().setSel(D().pos(weekend, 0), D().pos(weekend, 2));
    v.fire(host(), "beforeinput", { inputType: "deleteContentBackward" });
    const struck = modelOf(adapter, "这个周末").runs.find((r) => r.t === "text" && r.rPr && r.rPr.del);
    test.assert(!!struck && struck.rPr.del.author === "窗口作者" && byText(adapter, "这个周末").text.startsWith("这个"),
      "deleted words stay in the file struck through, stamped by the same author");

    // B3: the N13a 修订 list — D2: the 旁注栏's 修订 panel — lists the writer's own revisions live, and resolves them.
    v.menu("clio-write-revisions").run();
    await tick();
    const windoid = doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden])");
    const rows = () => [...windoid.querySelectorAll(".cw-rev")];
    test.assert(!!windoid && rows().length >= 2 && rows().some((r) => r.textContent.includes("窗口作者")),
      "the rail's 修订 panel opens beside the record mode and lists the writer's own revisions");
    test.assert(doc.querySelector(".doc-rail-toggle").textContent === `clioworks_rail_tab_count:clioworks_rail_tab_revisions|${rows().length}`,
      `the document bar's toggle carries the pending count (「修订 N」: ${doc.querySelector(".doc-rail-toggle").textContent})`);
    // Write board ③: ↓ in the list jumps to the next revision — framed, its 接受 the default button.
    windoid.querySelector(".cw-rev-list").dispatchEvent(v.make("keydown", { key: "ArrowDown" }));
    await tick();
    const framed = windoid.querySelector(".cw-rev.is-current");
    test.assert(!!framed && framed.dataset.revisionIndex === "0" && framed.querySelector(".windoid-actions .btn").classList.contains("default"),
      "↓ puts the first revision under review: framed, with 接受 as the default button");
    test.assert(!!framed.querySelector("ins.cw-rev-text, del.cw-rev-text"), "an entry shows its words underlined (inserted) or struck through (deleted)");
    const before = rows().length;
    E().setSel(D().pos(D().byId(adapter.document(), Number(byText(adapter, "好最后一段").id)), 1));
    v.fire(host(), "beforeinput", { inputType: "insertText", data: "呀" });
    await tick();
    test.assert(rows().length > before || rows().some((r) => r.textContent.includes("好呀")),
      "the list follows the next keystroke without being reopened");
    const accept = windoid.querySelector(".cw-rev .windoid-actions .btn");
    test.assert(!!accept && accept.textContent === "clio_write_revisions_accept", "(setup) the first row offers 接受");
    accept.dispatchEvent(v.make("click"));
    await tick();
    test.assert(api.editHistory().undoLabel() === "clio_write_step_accept_revision",
      "accepting one's own revision is the N13a 「接受修订」 step");
    doc.querySelector(".doc-rail-toggle").dispatchEvent(v.make("click"));   // fold the rail away
    test.assert(doc.querySelector(".doc-rail").hidden, "the toggle folds the rail away");

    // B4: save → reopen through the real editor's own adapter.
    const saved = await adapter.save();
    v.__saved = new Uint8Array(saved.bytes);
    const reopened = await v.openAdapter(v.__saved, "再开.docx");
    const list = w.ClioWorksQuireReview.revisions(reopened);
    test.assert(list.length >= 1 && list.every((r) => r.author === "窗口作者") && list.some((r) => r.type === "ins" && r.text.startsWith("好")),
      `the saved file reopens with its recorded revisions (${list.map((r) => r.type + ":" + r.text.slice(0, 4)).join(", ")})`);
    test.assert(!list.some((r) => r.type === "del" && r.text.startsWith("这个")) && !byText(reopened, "这个周末"),
      "the revision accepted in the windoid stayed accepted through the save");
    test.assert(reopened.document().settings.track === true, "and it is still recording (settings.xml keeps the flag)");

    // B5: turning it off from the same row — no question, plain typing again.
    v.menu("clio-write-track").run();
    await tick();
    test.assert(asks.length === 1 && adapter.document().settings.track === false,
      "turning tracking off asks nothing and clears the flag");
    test.assert(api.editHistory().undoLabel() === "clio_write_step_track" && JSON.stringify(api.editHistory().undoLabelArgs()) === "[false]",
      "Edit › Undo names the off step in the writer's words");
    E().setSel(D().pos(modelOf(adapter, "好呀最后一段"), 0));
    v.fire(host(), "beforeinput", { inputType: "insertText", data: "无" });
    const unstamped = modelOf(adapter, "无好呀最后一段").runs[0];
    test.assert(unstamped.text === "无" && (!unstamped.rPr || !unstamped.rPr.ins),
      "with tracking off the same keystroke writes plain text, exactly as before");

    // B6: the 修订 windoid's 「署名…」 button — the same dialog, prefilled with
    // the remembered name; the renamed author stamps the next keystroke, and
    // turning tracking back on for it asks nothing.
    v.menu("clio-write-revisions").run();
    await tick();
    const windoid2 = doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden])");
    const nameRow = windoid2 ? [...windoid2.querySelectorAll(".cw-rev-commands .btn")]
      .find((btn) => btn.textContent === "clio_write_track_author_button") : null;
    test.assert(!!nameRow, "the 修订 panel's command row carries the 「署名…」 button");
    answers.push("窗口新名");
    nameRow.dispatchEvent(v.make("click"));
    await tick();
    test.assert(asks.length === 2 && asks[1] === "窗口作者",
      "「署名…」 asks on the same System 6 dialog, prefilled with the remembered name");
    v.menu("clio-write-track").run();
    await tick();
    test.assert(asks.length === 2 && adapter.document().settings.track === true,
      "after the rename, turning tracking on again from the row asks nothing");
    E().setSel(D().pos(modelOf(adapter, "无好呀最后一段"), 1));
    v.fire(host(), "beforeinput", { inputType: "insertText", data: "署" });
    const renamedRun = modelOf(adapter, "无署好呀最后一段").runs.find((r) => r.t === "text" && r.text === "署");
    test.assert(!!renamedRun && renamedRun.rPr.ins.author === "窗口新名",
      "the keystroke after the rename carries the new name's stamp");
  }

  /* ============ Part C: comment threads and resolved state on D20 (synthetic corpus file) ============
   * D20 carries a root with a reply and a resolved root, with GAPS in the comment ids (0, 3, 7, 9).
   * The thread parent and resolved state read through the adapter; resolving is one named undo step;
   * saving takes the full-write path, which renumbers comment ids (a known limit, ruled on
   * separately), so this part asserts what must survive the renumbering: who said what, to which
   * range, in which thread, and whether it is resolved. */
  {
    const ctx = makeContext();
    loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
    const bytes = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/docx/D20.docx")));
    const open = async (data, name) => { ctx.__bytes = data; return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes, { name: ${JSON.stringify(name)} })`, ctx); };
    const view = (adapter) => adapter.comments().map((c) => [c.author, c.text, c.done, c.parentId == null ? null : adapter.comments().find((x) => x.id === c.parentId)?.text, c.anchor && c.anchor.quote || null]);
    const adapter = await open(bytes, "D20.docx");
    const list = adapter.comments();
    test.assert(JSON.stringify(list.map((c) => c.id)) === JSON.stringify(["0", "3", "7", "9"]), `D20 keeps its gappy comment ids (got ${list.map((c) => c.id).join(",")})`);
    test.assert(list.find((c) => c.id === "3").done === true && list.filter((c) => c.done).length === 1, "only the second root reads as resolved");
    test.assert(list.find((c) => c.id === "9").parentId === "7", "the reply points at its root through commentsExtended");
    const before = view(adapter);

    // Resolve the thread root, reopen the other: each is one named step; undo restores exactly.
    test.assert(adapter.setCommentDone("7", true).done === true && adapter.undoLabel() === "Resolve Comment", "resolving a thread is one named undo step (Resolve Comment)");
    adapter.undo();
    test.assert(JSON.stringify(view(adapter)) === JSON.stringify(before), "undo restores the exact thread list and states");
    adapter.redo();
    test.assert(adapter.setCommentDone("3", false).done === false && adapter.undoLabel() === "Reopen Comment", "reopening is one named undo step (Reopen Comment)");

    // Save → reopen: resolved and reopened states, the thread and the anchors all survive the renumbering.
    const saved = await adapter.save();
    const reopened = await open(saved.bytes, "D20b.docx");
    const after = view(reopened);
    test.assert(after.length === 4 && after.filter((row) => row[2]).length === 1 && after.find((row) => row[1] === "Reword this.")[2] === true && after.find((row) => row[1] === "Checked: it is the 2025 date.")[2] === false,
      "the resolved and reopened states survive save → reopen");
    test.assert(after.find((row) => row[1] === "Done, see the new line.")[3] === "Reword this.", "the reply is still in its root's thread");
    test.assert(after.find((row) => row[1] === "Which report is this from?")[4] === "The claim needs a source.", "the anchor text stays with its comment");
  }

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
