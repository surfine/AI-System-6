// ClioWorks S11 M3 contract: the single-writer gate, driven through the REAL event path.
//
// clio-write.js promises that nothing reaches the document except through its gate. This file
// loads the real Quire editing layer (layout.js, drawing.js, editor.js) and the real
// clio-write.js over a linkedom document (tests/helpers/quire-editor-vm.mjs) and dispatches
// beforeinput / keydown / mousedown / pointerdown / composition events at the editor's own host,
// capture phase and all, so the upstream listeners run exactly as in the browser. Each case
// states what a writer does and what the file must still hold afterwards.
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clioworks-s11-m3-write-events");
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));

const v = await createQuireEditorVm({ docx: DOCX, name: "搬家清单.docx" });
const w = v.window;
const doc = v.document;
const api = w.AISystem6ClioWrite;
const tick = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
const saves = [];
const hold = { promise: null };
const realHost = w.AISystem6ClioWorks;   // the real native host (saveNativeDocument / revertNativeDocument)
Object.defineProperty(w, "AISystem6ClioWorks", { configurable: true, writable: true, value: {
  saveNativeDocument: async (name) => { saves.push(name); if (hold.promise) await hold.promise; return { ok: true }; },
  revertNativeDocument: async () => ({ ok: true }),
} });

// The browser's CompositionEvent constructor (the surface hands a held compositionend on with it).
w.CompositionEvent = function CompositionEvent(type, init = {}) { return v.make(type, { ...init }); };
const byText = (adapter, text) => adapter.paragraphs().find((p) => p.text.startsWith(text));
const snapshot = (adapter) => JSON.stringify(adapter.paragraphs().map((p) => [p.id, p.text, p.runs && p.runs.length]));
const E = () => v.run("L.ed");
const D = () => v.run("L.D");
const scroller = () => doc.querySelector(".cw-scroller");
const host = () => doc.querySelector("#pages");
const live = () => v.record.liveAdapter;

// Open a fresh copy of the document in the requested mode.
async function fresh(mode = "express") {
  v.modal.answers.length = 0;
  if (api.current()) { if (api.current().dirty) v.modal.answers.push("no"); await api.close(); }
  v.record.liveAdapter = await v.openAdapter();
  const out = await api.open(v.record, {});
  if (!out.ok) throw new Error("open failed: " + JSON.stringify(out));
  if (mode === "full") v.fire(scroller(), "keydown", { key: "e", metaKey: true });
  if (api.current().mode !== mode) throw new Error("mode " + mode + " not reached");
  return live();
}
const caretAt = (adapter, text, from, to = from) => {
  const p = D().byId(adapter.document(), byText(adapter, text).id);
  E().setSel(D().pos(p, from), D().pos(p, to));
  return p;
};
const beforeinput = (inputType, data, extra) => v.fire(host(), "beforeinput", { inputType, data, ...extra });
const keydown = (key, extra) => v.fire(host(), "keydown", { key, ...extra });

const run = async () => {
  // ---- the harness is the real thing ----
  {
    const adapter = await fresh("express");
    test.assert(v.run("typeof L.ed.typeText === 'function' && typeof L.drawing.nudge === 'function'") && !!host() && !!doc.querySelector("#pages .img"),
      "the real editor, drawing layer and a document with a picture are mounted");
    caretAt(adapter, "最后一段", 0);
    beforeinput("insertText", "好");
    test.assert(byText(adapter, "好最后一段") && adapter.isDirty(), "baseline: typing at a paragraph's start reaches the model through the gate and the editor");
    test.assert(host().getAttribute("tabindex") === "0" && scroller().getAttribute("tabindex") === null,
      "the scrolling document is reachable from the keyboard as the scroller's one tab stop (axe scrollable-region-focusable)");
  }

  // ---- pictures: click, handles, resize ----
  {
    const adapter = await fresh("full");
    const before = snapshot(adapter);
    const rev = adapter.getEditRevision();
    const img = doc.querySelector("#pages .img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    v.fire(img, "pointerdown", { button: 0, clientX: 4, clientY: 4 });
    const handle = doc.querySelector(".obj-handles .oh-se");
    if (handle) {
      v.fire(handle, "pointerdown", { button: 0, clientX: 10, clientY: 10 });
      v.fire(doc, "pointermove", { clientX: 400, clientY: 400, buttons: 1 });
      v.fire(doc, "pointerup", { clientX: 400, clientY: 400 });
    }
    v.flush();
    test.assert(!doc.querySelector(".obj-handles") && E().objSel === null, "a click on a picture shows no resize handles and selects no object");
    test.assert(adapter.getEditRevision() === rev && snapshot(adapter) === before && !adapter.isDirty(), "dragging a picture handle changes nothing in the file");
  }

  // ---- floating object: arrow keys do not nudge, a press does not start a move ----
  {
    const adapter = await fresh("full");
    const rev = adapter.getEditRevision();
    let nudged = 0;
    const original = v.run("L.drawing.nudge");
    v.run("globalThis.__nudge = (key, pt) => { globalThis.__nudged = (globalThis.__nudged || 0) + 1; }");
    v.run("L.drawing.nudge = globalThis.__nudge");
    const p = caretAt(adapter, "最后一段", 0);
    E().objSel = { p, o: 0, it: { float: true }, el: null, float: true };
    keydown("ArrowRight");
    nudged = v.run("globalThis.__nudged || 0");
    v.context.__restore = original;
    v.run("L.drawing.nudge = globalThis.__restore");
    test.assert(nudged === 0 && adapter.getEditRevision() === rev, "arrow keys over a selected floating object do not nudge it");
    E().objSel = null;
  }

  // ---- ⌃/⌘⇧Space and Insert ----
  {
    const adapter = await fresh("full");
    const cell = adapter.tables()[0].rows[0][0].paragraphIds[0];
    E().setSel(D().pos(D().byId(adapter.document(), cell), 0));
    const before = snapshot(adapter);
    const rev = adapter.getEditRevision();
    keydown(" ", { ctrlKey: true, shiftKey: true });
    keydown(" ", { metaKey: true, shiftKey: true });
    test.assert(snapshot(adapter) === before && adapter.getEditRevision() === rev, "⌃⇧Space and ⌘⇧Space do not type a space into the table");

    const express = await fresh("express");
    const a = D().byId(express.document(), byText(express, "这个周末").id);
    const b = D().byId(express.document(), byText(express, "先装箱").id);
    E().setSel(D().pos(a, 1), D().pos(b, 1));
    const before2 = snapshot(express);
    keydown(" ", { ctrlKey: true, shiftKey: true });
    test.assert(snapshot(express) === before2, "Express: ⌃⇧Space over a selection across paragraphs deletes nothing");

    const full = await fresh("full");
    const pp = D().byId(full.document(), byText(full, "新书架").id);
    const pictures = () => pp.runs.filter((r) => r.t === "img").length;
    const had = pictures();
    E().setSel(D().pos(pp, 0));
    keydown("Insert");
    E().setSel(D().pos(pp, 0));
    beforeinput("insertText", "字");
    test.assert(had === 1 && E().overtype === false, "the Insert key does not switch on overwrite mode");
    test.assert(pictures() === had, "typing in front of a picture after Insert leaves the picture in the file");
  }

  // ---- Option+Backspace is delete-word on macOS, never Undo ----
  {
    const adapter = await fresh("express");
    caretAt(adapter, "最后一段，什么格式都没有", 12);
    const original = byText(adapter, "最后一段").text;
    beforeinput("insertText", "X");
    const typed = byText(adapter, "最后一段").text;
    keydown("Backspace", { altKey: true });
    const after = byText(adapter, "最后一段").text;
    test.assert(typed !== original && after !== original && after.length < typed.length, `Option+Backspace deletes the word before the caret (not undo): "${after}"`);
  }

  // ---- Edit › Paste is execCommand('insertText'): beforeinput carries the newline ----
  {
    const express = await fresh("express");
    caretAt(express, "最后一段，什么格式都没有", 0);
    const count = express.paragraphs().length;
    beforeinput("insertText", "甲\n乙");
    const joined = byText(express, "甲") ? byText(express, "甲").text : "";
    test.assert(express.paragraphs().length === count && /^甲 乙最后/.test(joined) && !/\n/.test(express.paragraphs().map((p) => p.text).join("")),
      `Express: a two-line menu paste is flattened into one paragraph, no raw newline in the text ("${joined.slice(0, 8)}")`);

    const full = await fresh("full");
    caretAt(full, "最后一段，什么格式都没有", 0);
    const n = full.paragraphs().length;
    beforeinput("insertText", "甲\n乙");
    test.assert(full.paragraphs().length === n + 1 && !/\n/.test(full.paragraphs().map((p) => p.text).join("")), "full editing: the same menu paste splits into two paragraphs");
  }

  // ---- Safari: the Enter that confirms an IME candidate comes after compositionend ----
  for (const mode of ["express", "full"]) {
    const adapter = await fresh(mode);
    caretAt(adapter, "最后一段，什么格式都没有", 0);
    const count = adapter.paragraphs().length;
    v.fire(host(), "compositionstart", { data: "" });
    v.fire(host(), "compositionend", { data: "你好" });
    const enter = keydown("Enter", { keyCode: 229, isComposing: false });
    v.flush();
    test.assert(adapter.paragraphs().length === count && enter.defaultPrevented, `${mode}: the Enter that confirms an input-method candidate (keyCode 229) does not split the paragraph`);
    keydown("Enter", { keyCode: 13 });
    const split = adapter.paragraphs().length;
    test.assert(mode === "full" ? split === count + 1 : split === count, `${mode}: a later real Enter behaves as usual`);
  }

  // ---- a refused composition keeps the upstream editor's state in step with the DOM ----
  {
    const adapter = await fresh("express");
    const a = D().byId(adapter.document(), byText(adapter, "这个周末").id);
    const b = D().byId(adapter.document(), byText(adapter, "先装箱").id);
    E().setSel(D().pos(a, 1), D().pos(b, 1));
    const before = snapshot(adapter);
    const from = { a: { ...E().sel.a }, f: { ...E().sel.f } };
    v.fire(host(), "compositionstart", { data: "" });
    test.assert(E().composing === true && api.current() !== null, "a refused composition still marks the upstream editor as composing, so selectionchange cannot re-read a mutated DOM");
    v.fire(doc, "selectionchange", {});
    v.fire(host(), "compositionend", { data: "你" });
    await tick();
    test.assert(E().composing === false && snapshot(adapter) === before, "after it ends the document is untouched and the editor is no longer composing");
    test.assert(E().sel && E().sel.a.p === from.a.p && E().sel.a.o === from.a.o && E().sel.f.p === from.f.p && E().sel.f.o === from.f.o, "the caret is back where the writer started");
  }

  // ---- composition that never ends (blur, element removed) ----
  {
    const adapter = await fresh("express");
    caretAt(adapter, "最后一段，什么格式都没有", 3);
    v.fire(host(), "compositionstart", { data: "" });
    test.assert(E().composing === true, "an allowed composition is under way");
    v.fire(host(), "blur", { bubbles: false });
    v.fire(host(), "focusout", {});
    v.flush();
    test.assert(E().composing === false, "losing focus mid-composition releases the editor");
    const answer = await api.close();
    test.assert(answer === "clean", `the window can close afterwards (${answer})`);

    // The element goes while the input method is open: no blur, no compositionend.
    const again = await fresh("express");
    caretAt(again, "最后一段，什么格式都没有", 3);
    v.fire(host(), "compositionstart", { data: "" });
    test.assert(E().composing === true, "(setup) a second composition is open");
    const removed = scroller();
    removed.remove();
    const closed = await api.close();
    test.assert(closed === "clean" && E().composing === false, `a window taken out of the page mid-composition still closes (${closed}) and leaves the editor idle`);
    doc.querySelector('[data-window="clioWrite"] .clio-write-pane').append(removed);
    const next = await fresh("express");
    caretAt(next, "最后一段，什么格式都没有", 0);
    beforeinput("insertText", "新");
    test.assert(!!byText(next, "新最后一段") && api.current().dirty === true, "the next session types normally: nothing of the old composition is left");
  }

  // ---- a second docx opened elsewhere must not hijack this window's document ----
  {
    const adapter = await fresh("express");
    const other = await v.openAdapter();   // binds the shared D.doc / D.hist to the other file
    test.assert(D().doc === other.document() && D().doc !== adapter.document(), "(setup) another docx now owns the shared model");
    const otherBefore = snapshot(other);
    caretAt(adapter, "最后一段，什么格式都没有", 0);
    beforeinput("insertText", "我");
    test.assert(byText(adapter, "我最后一段") && snapshot(other) === otherBefore && D().doc === adapter.document(),
      "typing here edits this window's file, never the other, and the shared model is bound back to it");
    const text = host().textContent;
    await v.openAdapter();
    v.flush();
    v.fire(host(), "keydown", { key: "ArrowLeft" });
    test.assert(host().textContent === text || host().textContent.includes("我最后一段"), "the window still shows its own document after another file bound the model");
  }

  // ---- opening another file over a dirty one: Cancel keeps this window's own document ----
  {
    const adapter = await fresh("express");
    caretAt(adapter, "最后一段，什么格式都没有", 0);
    beforeinput("insertText", "改");
    const second = { liveAdapter: await v.openAdapter(), mountedName: "另一份.docx", fileName: "另一份.docx" };
    test.assert(D().doc === second.liveAdapter.document(), "(setup) the other file's adapter has bound the shared model");
    v.modal.answers.push("cancel");
    const out = await api.open(second, {});
    test.assert(out.ok === false && out.reason === "cancelled" && D().doc === adapter.document() && api.current().mountedName === "搬家清单.docx",
      "Cancel on the unsaved-edits question keeps the first file mounted and the shared model bound to it");
    const before = snapshot(second.liveAdapter);
    beforeinput("insertText", "再");
    test.assert(!!byText(adapter, "改再最后一段") && snapshot(second.liveAdapter) === before, "and the next keystroke lands in the first file only");
  }

  // ---- the first-save list open, or a save in flight, when the window closes ----
  {
    const adapter = await fresh("express");
    adapter.exportReport = async () => ({ converted: [], lost: [{ kind: "chart", detail: "一张图表 将丢失" }] });
    caretAt(adapter, "最后一段，什么格式都没有", 0);
    beforeinput("insertText", "存");
    saves.length = 0;
    v.fire(scroller(), "keydown", { key: "s", metaKey: true });
    await tick();
    const layer = doc.querySelector(".cw-layer");
    test.assert(layer && !layer.hidden && !!layer.querySelector(".cw-alert"), "(setup) ⌘S with something to lose opens the first-save list");
    v.modal.answers.push("no");
    const answer = await api.close();
    await tick();
    test.assert(answer === "discarded" && layer.hidden === true && !layer.querySelector(".cw-alert"), "closing with 不存储 while the list is open removes the list and hides its layer");
    test.assert(saves.length === 0, "and nothing is saved after the writer said 不存储");

    const next = await fresh("express");
    caretAt(next, "最后一段，什么格式都没有", 0);
    beforeinput("insertText", "续");
    keydown("Enter", {});
    test.assert(v.run("!(L.ui.dialogOpen())") && byText(next, "续最后一段"), "the next document is not stuck behind a stale dialog (the editor's keys still work)");
  }
  {
    const adapter = await fresh("express");
    caretAt(adapter, "最后一段，什么格式都没有", 0);
    beforeinput("insertText", "飞");
    let release;
    hold.promise = new Promise((resolve) => { release = resolve; });
    saves.length = 0;
    v.fire(scroller(), "keydown", { key: "s", metaKey: true });
    await tick();
    test.assert(saves.length === 1, "(setup) a save is in flight");
    v.modal.answers.push("no");
    const answer = await api.close();
    test.assert(answer === "cancelled" && api.current() !== null, `a window with a save in flight does not discard under it (${answer})`);
    release();
    hold.promise = null;
    await tick();
    v.modal.answers.push("no");
    await api.close();
  }

  /* ================= M3 round 3: errors, IME and undo (S11-C2 / S11-C5 / S11-C8) ================= */
  const receiptKey = () => doc.querySelector(".cw-receipt").textContent;
  const reread = () => v.openAdapter(v.working().slice(), "reread.docx");
  const bytesOf = (u8) => Array.from(u8).join(",");
  const withRealHost = async (body) => {
    const stub = w.AISystem6ClioWorks;
    w.AISystem6ClioWorks = realHost;
    try { return await body(); } finally { w.AISystem6ClioWorks = stub; }
  };
  const LAST = "最后一段，什么格式都没有";
  const settle = async (done) => { for (let i = 0; i < 200 && !done(); i += 1) await tick(); };
  const saveSettled = () => settle(() => !/saving$/.test(receiptKey()));

  // C1 / C1b / C1c: typing while a save runs; a second ⌘S while it runs.
  await withRealHost(async () => {
    const adapter = await fresh("express");
    caretAt(adapter, LAST, 0);
    beforeinput("insertText", "甲");
    const original = adapter.save.bind(adapter);
    let calls = 0;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    adapter.save = async () => { calls += 1; const out = await original(); await held; return out; };
    keydown("s", { metaKey: true });
    await tick();
    test.assert(receiptKey() === "clio_write_receipt_saving" && calls === 1, `C1: ⌘S starts one save and the status bar says it is saving (${receiptKey()})`);
    keydown("s", { metaKey: true });
    await tick();
    test.assert(calls === 1 && receiptKey() === "clio_write_receipt_saving", `C1c: a second ⌘S while saving is refused; adapter.save ran once (${calls})`);
    caretAt(adapter, "甲最后", 1);
    beforeinput("insertText", "乙");
    test.assert(!!byText(adapter, "甲乙最后") && receiptKey() === "clio_write_receipt_saving", "C1b: typing during the save reaches the model and the receipt stays 「存储中，仍可输入」");
    release();
    await saveSettled();
    test.assert(receiptKey() === "clio_write_receipt_saved_older" && adapter.isDirty() && api.current().dirty === true,
      `C1: after the save the receipt reads 「已存储较早的修改，还有新修改」 and the document stays dirty (${receiptKey()})`);
    const back = await reread();
    test.assert(!!byText(back, "甲最后一段") && !byText(back, "甲乙"), "C1: the stored bytes are the snapshot taken when the save started (甲 in, 乙 not)");
    test.assert(!!byText(adapter, "甲乙最后"), "C1: the typing done during the save is still in the window");
    adapter.save = original;
  });

  // C5: the save fails.
  await withRealHost(async () => {
    const adapter = await fresh("express");
    caretAt(adapter, LAST, 0);
    beforeinput("insertText", "败");
    adapter.save = async () => { throw new Error("synthetic encode failure"); };
    const before = bytesOf(v.working());
    v.modal.asked.length = 0;
    keydown("s", { metaKey: true });
    await saveSettled();
    const alert = v.modal.asked.find((entry) => entry.kind === "alert");
    test.assert(!!alert && /^clio_stage_native_save_failed/.test(alert.message), `C5: an alert says the save failed and the original is unchanged (${alert && alert.message})`);
    test.assert(receiptKey() === "clio_write_receipt_failed" && adapter.isDirty() && bytesOf(v.working()) === before && !!byText(adapter, "败最后"),
      `C5: receipt 「没能存储——修改还在窗口里」, still dirty, stored bytes unchanged, the edit still in the window (${receiptKey()})`);
  });

  // C2: while the first-save list is open nothing reaches the document.
  {
    const adapter = await fresh("full");
    adapter.exportReport = async () => ({ converted: [], lost: [{ kind: "chart", detail: "一张图表 将丢失" }] });
    caretAt(adapter, LAST, 0);
    beforeinput("insertText", "清");
    keydown("m", { metaKey: true });   // the comments windoid is open behind the list
    test.assert(!!doc.querySelector(".cw-comments-windoid"), "(setup) the comments windoid is open");
    saves.length = 0;
    keydown("s", { metaKey: true });
    await tick();
    const layer = doc.querySelector(".cw-layer");
    test.assert(!layer.hidden && !!layer.querySelector(".cw-alert"), "(setup) the first-save list is open");
    const rev = adapter.getEditRevision();
    const before = snapshot(adapter);
    caretAt(adapter, "清最后", 1, 3);
    const tries = {
      typing: () => beforeinput("insertText", "X"),
      paste: () => v.fire(host(), "paste", { clipboardData: { getData: () => "贴" } }),
      "⌘Z": () => keydown("z", { metaKey: true }),
      historyUndo: () => beforeinput("historyUndo"),
      "⌘B": () => keydown("b", { metaKey: true }),
      formatBold: () => beforeinput("formatBold"),
      Enter: () => keydown("Enter", {}),
      composition: async () => { v.fire(host(), "compositionstart", { data: "" }); v.fire(host(), "compositionend", { data: "你" }); await tick(); },
      resolve: () => { const btn = doc.querySelector(".cw-comments-windoid .windoid-thread .windoid-actions .btn:not(.windoid-reply)"); test.assert(!!btn, "(setup) the thread has its 解决 button"); if (btn) btn.dispatchEvent(v.make("click")); },
      "⌘S": async () => { keydown("s", { metaKey: true }); await tick(); },
    };
    const changed = [];
    for (const [name, action] of Object.entries(tries)) {
      const at = adapter.getEditRevision();
      await action();
      if (adapter.getEditRevision() !== at) changed.push(name);
    }
    test.assert(changed.length === 0 && adapter.getEditRevision() === rev && snapshot(adapter) === before && adapter.comments().every((c) => !c.done),
      `C2: typing, paste, ⌘Z / historyUndo, ⌘B / formatBold, Enter, an IME composition and a comment's 解决 change nothing while the list is open${changed.length ? ` — changed by: ${changed.join(", ")}` : ""}`);
    test.assert(["edit.undo", "file.save", "format.bold", "format.heading.1", "file.revert"].every((id) => api.commandState(id).enabled === false) && saves.length === 0 && layer.querySelectorAll(".cw-alert").length === 1,
      "C2: Undo, Save, Format and Revert are grey; a second ⌘S neither saves nor opens a second list");
    layer.querySelector('[data-choice="cancel"]').dispatchEvent(v.make("click"));
    await tick();
    test.assert(layer.hidden && receiptKey() === "clio_write_receipt_not_saved" && adapter.isDirty(), "C2: Cancel closes the list; nothing stored, the edits kept");
    if (doc.querySelector(".cw-comments-windoid .windoid-close")) doc.querySelector(".cw-comments-windoid .windoid-close").dispatchEvent(v.make("click"));
  }

  // D16: a press on a picture is swallowed, so the caret stays put (here in a table cell); typing then
  // is refused naming the picture, while the same typing in the table still names the table.
  {
    const adapter = await fresh("full");
    const cell = adapter.tables()[0].rows[0][0].paragraphIds[0];
    const cellPara = D().byId(adapter.document(), cell);
    E().setSel(D().pos(cellPara, 0), D().pos(cellPara, 0));
    const rev = adapter.getEditRevision();
    beforeinput("insertText", "表");
    test.assert(receiptKey().startsWith("clio_write_receipt_refused:clio_write_reason_table"), `D16: typing in a table cell names the table (${receiptKey()})`);
    const img = doc.querySelector("#pages .img");
    v.fire(img, "mousedown", { button: 0, clientX: 4, clientY: 4 });
    beforeinput("insertText", "图");
    test.assert(receiptKey().startsWith("clio_write_receipt_refused:clio_write_reason_image"), `D16: typing after a click on a picture names the picture, not the old table caret (${receiptKey()})`);
    test.assert(adapter.getEditRevision() === rev, "D16: neither refusal changed the file");
    // An arrow key back to the same caret ends the picture press: typing names the table again.
    v.fire(doc.querySelector("#pages"), "keydown", { key: "ArrowLeft" });
    beforeinput("insertText", "表");
    test.assert(receiptKey().startsWith("clio_write_receipt_refused:clio_write_reason_table"), `D16: after an arrow key the picture press no longer stands (${receiptKey()})`);
  }

  // D17: the editing area is a Tab stop, so keyboard focus is shown with the desk's ring (a whole shorthand, never a colour slot).
  {
    const css = readFileSync(resolveProjectPath("apps/desktop/styles/84-clio-write.css"), "utf8");
    const rule = /\.clio-write-window \.cw-scroller \.pages:focus-visible\s*\{([^}]*)\}/.exec(css);
    test.assert(!!rule && /outline:\s*var\(--system-focus-outline,\s*1px dotted var\(--ink\)\)\s*;/.test(rule[1]), "D17: #pages has a :focus-visible outline using --system-focus-outline as the whole shorthand");
    test.assert(!/(?:color|background)[^;{}]*--system-focus-outline/.test(css), "D17: --system-focus-outline never sits inside a colour slot");
  }

  // B9: the first-save list for quire-convert-s11.docx names WHAT and WHERE in plain words, and a
  // cancelled list (Esc, or Return on the default 取消 button) leaves 「没有存储」 until the next edit.
  {
    const CONVERT = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-convert-s11.docx")));
    for (const route of ["Return", "Escape"]) {
      v.modal.answers.length = 0;
      if (api.current()) { if (api.current().dirty) v.modal.answers.push("no"); await api.close(); }
      v.record.liveAdapter = await v.openAdapter(CONVERT.slice(), "quire-convert-s11.docx");
      const out = await api.open(v.record, {});
      test.assert(out.ok, `B9 ${route}: the convert fixture opens`);
      const adapter = live();
      caretAt(adapter, "这个周末要把东西搬到新家", 0);
      beforeinput("insertText", "（周六）");
      saves.length = 0;
      keydown("s", { metaKey: true });
      await tick();
      const layer = doc.querySelector(".cw-layer");
      const lines = [...layer.querySelectorAll(".cw-alert li")].map((li) => li.textContent);
      if (route === "Return") {
        test.assert(lines.length === 3 && lines.every((t) => /^clio_write_loss_line:/.test(t)), `B9b: every item has a where and a what (${JSON.stringify(lines)})`);
        test.assert(lines.some((t) => /^clio_write_loss_line:clio_write_loss_at_table\|clio_write_loss_table_widths$/.test(t)) && lines.some((t) => /^clio_write_loss_line:clio_write_loss_at_paragraph:1\|搬家清单\|clio_write_loss_bookmark$/.test(t)) && lines.some((t) => /^clio_write_loss_line:clio_write_loss_at_document\|clio_write_loss_bookmarks:1$/.test(t)), `B9b: the table width change says 表格, the dropped bookmark says paragraph 1 and its words, and the document-wide bookmark tidy says 全文 (${JSON.stringify(lines)})`);
        test.assert(!lines.some((t) => /lost_kind_|word\/|table-grid|range:/.test(t)), "B9b: no vague kind names, part paths or internal ids");
      }
      const cancel = layer.querySelector('[data-choice="cancel"]');
      const before = snapshot(adapter);
      if (route === "Escape") v.fire(layer.querySelector(".cw-alert"), "keydown", { key: "Escape" });
      else cancel.dispatchEvent(v.make("click"));
      await tick();
      // Focus returning to the document moves the caret: that must not wash the receipt away.
      caretAt(adapter, "最后一段", 0);
      v.fire(doc, "selectionchange", {});
      await tick();
      test.assert(layer.hidden && saves.length === 0 && adapter.isDirty() && snapshot(adapter) === before, `B9a ${route}: cancel writes nothing and keeps the edits`);
      test.assert(receiptKey() === "clio_write_receipt_not_saved", `B9a ${route}: the receipt still reads 没有存储 after the caret moved (${receiptKey()})`);
      beforeinput("insertText", "续");
      test.assert(receiptKey() === "clio_write_receipt_dirty", `B9a ${route}: the next edit returns the receipt to 有未保存的修改 (${receiptKey()})`);
    }
  }

  // C3: an input method composing (synthetic composition events; real IME is a manual check, S11-C8).
  {
    const adapter = await fresh("full");
    caretAt(adapter, LAST, 0, 2);
    keydown("b", { metaKey: true });   // a step before the composition, so Undo has something to take
    caretAt(adapter, LAST, 2);
    const text = byText(adapter, LAST).text;
    const count = adapter.paragraphs().length;
    const nodes = [...host().querySelectorAll(".p")];
    const sel = { a: { ...E().sel.a }, f: { ...E().sel.f } };
    saves.length = 0;
    v.fire(host(), "compositionstart", { data: "" });
    v.fire(host(), "compositionupdate", { data: "n" });
    v.fire(host(), "compositionupdate", { data: "ni" });
    const keys = [
      keydown("Enter", { isComposing: true, keyCode: 229 }),
      keydown("s", { metaKey: true, isComposing: true, keyCode: 229 }),
      keydown("e", { metaKey: true, isComposing: true, keyCode: 229 }),
      keydown("z", { metaKey: true, isComposing: true, keyCode: 229 }),
    ];
    const undoMenu = api.editHistory();
    const undone = undoMenu.undo();
    v.selection.collapse(host(), 0);
    v.fire(doc, "selectionchange", {});
    await tick();
    test.assert(keys.every((event) => !event.defaultPrevented) && api.current().mode === "full" && saves.length === 0 && adapter.paragraphs().length === count,
      "C3: during a composition Enter, ⌘S, ⌘E and ⌘Z are not intercepted: no split, no save, no mode switch");
    test.assert(undone === false && undoMenu.canUndo() === false && byText(adapter, LAST).runs[0].b === true, "C3: Edit › Undo is unavailable while composing (the bold step before it stays)");
    const same = [...host().querySelectorAll(".p")];
    test.assert(same.length === nodes.length && same.every((node, i) => node === nodes[i]), "C3: the document DOM is not rebuilt while composing");
    test.assert(E().sel && E().sel.a.p === sel.a.p && E().sel.a.o === sel.a.o && E().sel.f.o === sel.f.o, "C3: a selectionchange while composing does not move the caret");
    v.fire(host(), "compositionend", { data: "你好" });
    await tick();
    test.assert(byText(adapter, LAST.slice(0, 2) + "你好") && api.editHistory().undoLabel() === "clio_write_step_typing", "C3: the committed text lands once, named 「键入」");
    test.assert(api.editHistory().undo() === true && byText(adapter, LAST).text === text && api.editHistory().undoLabel() === "clio_write_step_bold", "C3: a composition is ONE undo step (the next Undo is the bold before it)");

    // Blur mid-composition: the half-composed text never reaches the model, even if compositionend comes late.
    const rev = adapter.getEditRevision();
    caretAt(adapter, LAST, 2);
    v.fire(host(), "compositionstart", { data: "" });
    v.fire(host(), "compositionupdate", { data: "ban" });
    const para = host().querySelector(".p");
    if (para) para.append(doc.createTextNode("ban"));   // what the input method drew
    v.fire(host(), "focusout", {});
    v.flush();
    v.fire(host(), "compositionend", { data: "半" });
    await tick();
    test.assert(adapter.getEditRevision() === rev && byText(adapter, LAST).text === text && !/ban/.test(host().textContent), "C3: blurring mid-composition commits nothing, and a late compositionend is dropped");
  }

  // F2: Chrome ends a composition on blur by firing compositionend (with its data) FIRST and
  // focusout after it, in the same task. A blur mid-composition still commits nothing (S11-C8).
  {
    const adapter = await fresh("express");
    caretAt(adapter, LAST, 2);
    const rev = adapter.getEditRevision();
    const text = byText(adapter, LAST).text;
    v.fire(host(), "compositionstart", { data: "" });
    v.fire(host(), "compositionupdate", { data: "ban" });
    const para = host().querySelector(".p");
    if (para) para.append(doc.createTextNode("ban"));   // what the input method drew
    v.fire(host(), "compositionend", { data: "半" });   // Chrome commits first...
    v.fire(host(), "focusout", {});                     // ...then the focus leaves
    await tick();
    test.assert(adapter.getEditRevision() === rev && byText(adapter, LAST).text === text && !/ban|半/.test(host().textContent) && E().composing === false,
      `F2: compositionend then focusout (Chrome's blur order) commits nothing (rev ${rev} → ${adapter.getEditRevision()}, ${JSON.stringify((adapter.paragraphs().find((p) => p.text.includes("什么格式")) || {}).text)})`);
    caretAt(adapter, LAST, 2);
    v.fire(host(), "compositionstart", { data: "" });
    v.fire(host(), "compositionend", { data: "好" });
    await tick();
    test.assert(!!byText(adapter, LAST.slice(0, 2) + "好") && api.editHistory().undoLabel() === "clio_write_step_typing",
      "F2: an ordinary compositionend with the focus staying commits the text once, named 「键入」");
  }

  // C4: a system dialog is up (the close box's three choices): the surface's shortcuts do not fire.
  {
    const adapter = await fresh("express");
    caretAt(adapter, LAST, 0);
    beforeinput("insertText", "关");
    const win = doc.querySelector('[data-window="clioWrite"]');
    win.classList.add("window", "is-active");
    let answer;
    const original = w.showSystemModal;
    w.showSystemModal = (message, kind) => { v.modal.asked.push({ message, kind }); doc.body.classList.add("has-system-modal"); return new Promise((resolve) => { answer = resolve; }); };
    const closing = api.close();
    await tick();
    test.assert(doc.body.classList.contains("has-system-modal"), "(setup) the unsaved-close dialog is open");
    const rev = adapter.getEditRevision();
    saves.length = 0;
    for (const target of [host(), doc.body]) {
      for (const key of ["e", "s", "z", "m", "b"]) v.fire(target, "keydown", { key, metaKey: true });
    }
    beforeinput("insertText", "Y");
    await tick();
    test.assert(api.current().mode === "express" && saves.length === 0 && adapter.getEditRevision() === rev && !doc.querySelector(".cw-comments-windoid"),
      `C4: with the dialog open ⌘E / ⌘S / ⌘Z / ⌘M / ⌘B and typing do nothing behind it (mode ${api.current().mode}, rev ${rev} → ${adapter.getEditRevision()})`);
    // F1: the desk's Edit › Undo / Redo (registerEditHistory('clioWrite') → editHistory().undo()) is a
    // second route to the same history; it too stands down behind the dialog.
    const history = api.editHistory();
    const undone = history ? history.undo() : null;
    const redone = history ? history.redo() : null;
    await tick();
    test.assert(undone === false && redone === false && history.canUndo() === false && api.commandState("edit.undo").enabled === false
      && adapter.getEditRevision() === rev && !!byText(adapter, "关" + LAST),
      `F1: with the dialog open Edit › Undo from the menu bar does nothing (undo ${undone}, rev ${rev} → ${adapter.getEditRevision()})`);
    test.assert(api.commandState("edit.undo").reason === "clio_write_reason_dialog", `F1: the disabled Undo says why (${api.commandState("edit.undo").reason})`);
    doc.body.classList.remove("has-system-modal");
    answer("cancel");
    test.assert(await closing === "cancelled" && api.current().dirty, "C4: Cancel keeps the window and its edits");
    test.assert(api.editHistory().canUndo() === true, "F1: once the dialog is gone Edit › Undo is offered again");
    w.showSystemModal = original;
    win.classList.remove("is-active");
  }

  // S11-C2: undo is the codec's own history, step by named step.
  await withRealHost(async () => {
    const adapter = await fresh("full");
    const text = byText(adapter, LAST).text;
    caretAt(adapter, LAST, 0);
    for (const ch of ["一", "二", "三"]) beforeinput("insertText", ch);
    test.assert(byText(adapter, "一二三最后") && api.editHistory().undoLabel() === "clio_write_step_typing", "S11-C2: three keystrokes in one paragraph are one step named 「键入」");
    api.editHistory().undo();
    test.assert(byText(adapter, LAST).text === text && api.editHistory().canUndo() === false, "S11-C2: one Undo takes back the whole run of typing");
    api.editHistory().redo();
    caretAt(adapter, "一二三最后", 0, 3);
    keydown("b", { metaKey: true });
    test.assert(api.editHistory().undoLabel() === "clio_write_step_bold", "S11-C2: ⌘B is its own step, 「粗体」");
    v.fire(doc.querySelector(".cw-ruler-pops .cw-pop"), "click");
    const heading = doc.querySelector('.cw-menu [data-menu-command="format.heading.1"]');
    heading.dispatchEvent(v.make("click"));
    test.assert(byText(adapter, "一二三最后").headingLevel === 1 && api.editHistory().undoLabel() === "clio_write_step_heading_1", "S11-C2: Heading 1 from the ruler is its own step, 「标题 1」");

    // Save mid-way through a run of typing: Undo takes back only what came after the save.
    caretAt(adapter, "一二三最后", 3);
    beforeinput("insertText", "四");
    keydown("s", { metaKey: true });
    await saveSettled();
    test.assert(!adapter.isDirty() && api.editHistory().canUndo(), "S11-C2: saving keeps the undo history");
    beforeinput("insertText", "五");   // same paragraph, same caret, straight after the save
    test.assert(adapter.isDirty() && byText(adapter, "一二三四五最后"), "(setup) typing goes on after the save");
    api.editHistory().undo();
    test.assert(byText(adapter, "一二三四最后") && !byText(adapter, "一二三四五"),
      `S11-C2: the first Undo after a save takes back only the typing done since the save (${byText(adapter, "一二三").text.slice(0, 6)})`);
    test.assert(adapter.isDirty() && api.current().dirty === true, "S11-C2: dirty follows the revision, not the text: after Undo the document is dirty");
    api.editHistory().undo();
    test.assert(byText(adapter, "一二三最后") && !byText(adapter, "一二三四"), "S11-C2: Undo goes on past the save point");

    // Revert to Saved: a fresh model from the stored bytes; nothing to undo.
    const before = v.record.liveAdapter;
    v.modal.answers.push("yes");
    v.fire(doc.querySelector(".cw-trailing .cw-pop"), "click");
    doc.querySelector('.cw-menu [data-menu-command="file.revert"]').dispatchEvent(v.make("click"));
    await settle(() => v.record.liveAdapter !== before);
    test.assert(v.record.liveAdapter !== before && !api.current().dirty && api.editHistory().canUndo() === false && !!byText(v.record.liveAdapter, "一二三四最后"),
      "S11-C2: 复原到上次存储 reads the stored bytes back and leaves nothing to undo");
  });

  // S11-C8: a command from the ruler checks the selection it was opened on.
  {
    const adapter = await fresh("full");
    caretAt(adapter, LAST, 0, 2);
    v.fire(doc.querySelector(".cw-ruler-pops .cw-pop"), "click");
    const sel = { a: { ...E().sel.a }, f: { ...E().sel.f } };
    doc.querySelector('.cw-menu [data-menu-command="format.heading.2"]').dispatchEvent(v.make("click"));
    test.assert(byText(adapter, LAST).headingLevel === 2 && E().sel && E().sel.a.p === sel.a.p && E().sel.a.o === sel.a.o && E().sel.f.o === sel.f.o,
      "S11-C8: a heading chosen from the ruler applies to the selection it was opened on, and the selection is the same afterwards");

    caretAt(adapter, LAST, 0, 2);
    v.fire(doc.querySelector(".cw-ruler-pops .cw-pop"), "click");
    test.assert(!!doc.querySelector(".cw-menu"), "(setup) the style pop-up is open");
    beforeinput("insertText", "换");   // the document changes while the pop-up is open
    const rev = adapter.getEditRevision();
    const level = byText(adapter, "换").headingLevel;
    const item = doc.querySelector('.cw-menu [data-menu-command="format.heading.3"]');
    if (item) item.dispatchEvent(v.make("click"));
    test.assert(adapter.getEditRevision() === rev && byText(adapter, "换").headingLevel === level && receiptKey() === "clio_write_receipt_refused:clio_write_reason_reselect",
      `S11-C8: a selection that the document has changed under is not guessed: the command does nothing and asks to select again (${receiptKey()})`);
  }

  // F6: the comments windoid follows the desk's shared placement rule (width AND the main area's height).
  {
    await fresh("full");
    const pane = doc.querySelector(".clio-write-pane");
    let size = { w: 800, h: 340 };
    Object.defineProperty(pane, "clientWidth", { configurable: true, get: () => size.w });
    Object.defineProperty(pane, "clientHeight", { configurable: true, get: () => size.h });
    keydown("m", { metaKey: true });
    test.assert(!!doc.querySelector(".cw-comments-windoid"), "(setup) the comments windoid is open");
    const short = pane.dataset.windoidPlacement;
    size = { w: 800, h: 700 };
    keydown("m", { metaKey: true });
    const tall = pane.dataset.windoidPlacement;
    size = { w: 1100, h: 340 };
    keydown("m", { metaKey: true });
    const wide = pane.dataset.windoidPlacement;
    test.assert(short === "swap" && tall === "dock-below" && wide === "float-right",
      `F6: a short window (800×340) swaps instead of docking a windoid over too little text (${short} / ${tall} / ${wide})`);
    const calls = [];
    w.AISystem6Windoid = { placement: (width, mainHeight) => { calls.push([width, mainHeight]); return "dock-below"; } };
    size = { w: 800, h: 420 };
    keydown("m", { metaKey: true });
    test.assert(calls.length > 0 && calls.at(-1)[0] === 800 && calls.at(-1)[1] === 420 - 188 && pane.dataset.windoidPlacement === "dock-below",
      `F6: when the desk's shared rule is loaded it decides, given the width and the main area's height (${JSON.stringify(calls.at(-1))})`);
    delete w.AISystem6Windoid;
    delete pane.clientWidth;
    delete pane.clientHeight;
    const close = doc.querySelector(".cw-comments-windoid .windoid-close");
    if (close) close.dispatchEvent(v.make("click"));
  }

  // The first-save list names what is lost in plain words, never the codec's kind codes.
  {
    const adapter = await fresh("express");
    adapter.exportReport = async () => ({ converted: [{ kind: "formatting", what: "formatting", detail: "Some text formatting could not be retained: x" }], lost: [{ kind: "object", what: "object", detail: "" }, { kind: "part", what: "part", detail: "customXml" }] });
    caretAt(adapter, LAST, 0);
    beforeinput("insertText", "词");
    v.fire(scroller(), "keydown", { key: "s", metaKey: true });
    await tick();
    const shown = [...doc.querySelectorAll(".cw-layer .cw-alert li")].map((li) => li.textContent);
    test.assert(shown.length === 3 && !shown.some((text) => /\b(object|part|formatting)\b/.test(text))
      && shown.join("|") === "clio_write_loss_line:clio_write_loss_at_document|clio_write_lost_kind_formatting|clio_write_loss_line:clio_write_loss_at_document|clio_write_lost_kind_object|clio_write_loss_line:clio_write_loss_at_document|clio_write_lost_kind_part",
      `the first-save list says what kind of thing in the writer's words (${shown.join(" | ")})`);
    const cancel = doc.querySelector('.cw-alert [data-choice="cancel"]');
    if (cancel) cancel.dispatchEvent(v.make("click"));
    await tick();
  }
};

try {
  await run();
} catch (error) {
  test.assert(false, `the contract ran to the end: ${error && error.stack || error}`);
}
test.finish();
