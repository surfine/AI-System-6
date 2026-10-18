// ClioWorks S11 M3 contract: the ClioWrite surface over the REAL Quire adapter and the frozen
// quire-s11.docx (S11-4 / S11-19 / S11-23).
//
// The DOM-free layers of app/features/clio-write.js are driven headless: describe() and
// gateInput() read the caret's place from the real model, createSession() is the document-facing
// state. What it holds, the way a writer meets it:
//   - switching Express / full editing never touches the document (revision, dirty, bytes);
//   - Express changes only the text inside a paragraph: splitting, joining, a list mark, styles
//     and lists are refused with a reason; text inside one paragraph passes;
//   - full editing applies heading 1-3 / body, bold, and lists through the adapter's narrow face,
//     each one named step in the Edit menu, in the writer's words;
//   - typing in a table, or over a picture, is refused BEFORE the upstream editor sees it (in
//     both modes; the upstream editor alone would type into the table);
//   - ⌘S writes through the real native host; the stored package reads back with the edits;
//   - the first-save list appears only when something would be converted or lost;
//   - the desk glue routes a docx to ClioWrite (one session per file) while read stays Reader's.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-s11-m3-write-surface");
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));

async function setup() {
  const ctx = makeContext();
  ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
  loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js", "app/vendor/clioworks-v3/native-host.js", "app/features/clio-write.js"]);
  let working = DOCX.slice();
  const record = { id: "doc-1", fileName: "搬家清单.docx", mountedName: "搬家清单.docx", format: "docx", projectId: "" };
  ctx.AISystem6NativeBinaries = {
    recordFor: (name) => (name === record.mountedName ? record : null),
    workingBytes: () => working,
    setWorkingBytes: (name, bytes) => { working = new Uint8Array(bytes); },
  };
  ctx.__bytes = DOCX;
  record.liveAdapter = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes.slice().buffer, { name: '搬家清单.docx' })", ctx);
  const D = vm.runInContext("L.D", ctx);
  const api = ctx.AISystem6ClioWrite;
  const lists = [];
  const hooks = { answer: () => "save" };
  const open = (adapter = record.liveAdapter, host) => api.createSession(adapter, {
    fileName: record.fileName,
    mountedName: record.mountedName,
    host: host || { save: (name) => ctx.AISystem6ClioWorks.saveNativeDocument(name), revert: (name) => ctx.AISystem6ClioWorks.revertNativeDocument(name) },
    readAdapter: () => record.liveAdapter,
    confirmList: (report) => { lists.push(report); return hooks.answer(report); },
  });
  const reread = async () => {
    ctx.__stored = working;
    return vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__stored.slice().buffer, { name: 'reread.docx' })", ctx);
  };
  return { ctx, record, D, api, open, lists, hooks, reread, stored: () => working };
}

const byText = (adapter, text) => adapter.paragraphs().find((p) => p.text.startsWith(text));

const run = async () => {
  const { ctx, record, D, api, open, lists, hooks, reread, stored } = await setup();
  const adapter = record.liveAdapter;
  const doc = adapter.document();
  test.assert(typeof api?.open === "function" && typeof api.close === "function" && typeof api.current === "function" && typeof api.editHistory === "function"
    && api.current() === null && api.editHistory() === null, "the module installs open / close / current / editHistory and nothing is mounted");

  // Where a caret is, read from the real model.
  const para = (text) => D.byId(doc, byText(adapter, text).id);
  const at = (text, from, to = from) => { const p = para(text); return api.describe(D, doc, D.pos(p, from), D.pos(p, to)); };
  const cellId = adapter.tables()[0].rows[0][0].paragraphIds[0];
  const cell = D.byId(doc, cellId);
  const inCell = api.describe(D, doc, D.pos(cell, 0), D.pos(cell, 0));
  const pictureParagraph = para("新书架");
  const beforeText = api.describe(D, doc, D.pos(pictureParagraph, 1), D.pos(pictureParagraph, 1));

  const session = open();
  // 1. Mode switching never touches the document.
  {
    const rev = session.revision();
    test.assert(session.mode === "express" && !session.isDirty(), "a docx opens in Express, not dirty");
    session.setMode("full");
    session.setMode("express");
    session.toggleMode();
    test.assert(session.mode === "full" && session.revision() === rev && !session.isDirty() && adapter.getEditRevision() === rev,
      "Express ⇄ full editing (menu or ⌘E) changes neither the revision nor dirty");
    session.setMode("express");
  }

  // 2. Express: only the text inside one paragraph.
  {
    const mid = at("这个周末", 2);
    const g = (kind, caret = mid, mode = "express") => api.gateInput(mode, kind, caret);
    test.assert(g("text").allow && g("backward").allow && g("forward").allow, "Express: typing and deleting inside a paragraph pass");
    test.assert(g("split").code === "EXPRESS_STRUCTURE" && g("line").code === "EXPRESS_STRUCTURE", "Express: Enter and Shift+Enter (new paragraph, line break) are refused");
    test.assert(g("backward", at("这个周末", 0)).code === "EXPRESS_STRUCTURE" && g("forward", at("这个周末", byText(adapter, "这个周末").text.length)).code === "EXPRESS_STRUCTURE",
      "Express: Backspace at a paragraph's start and Delete at its end (joining paragraphs) are refused");
    const across = api.describe(D, doc, D.pos(para("这个周末"), 1), D.pos(para("先装箱"), 1));
    test.assert(g("text", across).code === "EXPRESS_ONE_PARAGRAPH" && g("delete", across).code === "EXPRESS_ONE_PARAGRAPH", "Express: an edit across two paragraphs is refused");
    test.assert(g("format").code === "EXPRESS_FORMAT", "Express: formatting is refused");
    test.assert(g("split", mid, "full").allow && g("backward", at("这个周末", 0), "full").allow && g("text", across, "full").allow, "full editing: splitting, joining and cross-paragraph edits pass");
    const level = byText(adapter, "这个周末").headingLevel;
    session.setCaret(mid);
    const out = session.format("format.heading.1");
    test.assert(out.status === "blocked" && /clio_write_reason_express_format/.test(out.reason) && byText(adapter, "这个周末").headingLevel === level && !session.isDirty(),
      "Express: Heading 1 from the Format menu is refused with its reason and the document is untouched");
    test.assert(session.commandState("format.bold").enabled === false && session.commandState("format.list.bullet").enabled === false, "Express: the Format rows are grey");
    // The editing layer's in-paragraph typing reaches the model and is counted once by the adapter.
    const p = byText(adapter, "最后一段");
    adapter.setRunText(p.id, 0, p.runs[0].text + "，改过");
    session.noteExternalEdit();
    test.assert(session.isDirty() && session.receipt.key === "clio_write_receipt_dirty" && session.editHistory.undoLabel() === "clio_write_step_typing",
      "an Express edit makes the document dirty and Edit › Undo names 「键入」");
  }

  // 3. Tables and pictures: refused before the editor sees the input, in both modes.
  {
    test.assert(inCell.table === true, "a caret in the table's cell is known to be in a table");
    for (const mode of ["express", "full"]) {
      for (const kind of ["text", "backward", "forward", "split", "delete"]) {
        test.assert(api.gateInput(mode, kind, inCell).code === "READ_ONLY_TABLE", `${mode}: ${kind} inside the table is refused`);
      }
    }
    test.assert(api.gateInput("full", "backward", beforeText).code === "READ_ONLY_IMAGE", "Backspace over the picture is refused");
    const overPicture = api.describe(D, doc, D.pos(pictureParagraph, 0), D.pos(pictureParagraph, 2));
    test.assert(api.gateInput("express", "text", overPicture).code === "READ_ONLY_IMAGE", "typing over a selection that holds the picture is refused");
    test.assert(api.gateInput("express", "text", beforeText).allow, "typing next to the picture, inside the paragraph's text, passes");
    const tail = para("周六下午");
    test.assert(api.gateInput("full", "forward", api.describe(D, doc, D.pos(tail, D.plen(tail)), D.pos(tail, D.plen(tail)))).code === "READ_ONLY_TABLE",
      "full editing: Delete at the end of the paragraph before the table (joining into it) is refused");
    const rev = session.revision();
    const refused = session.gate("text", inCell);
    test.assert(!refused.allow && session.receipt.kind === "blocked" && /clio_write_reason_table/.test(session.receiptText()) && session.revision() === rev,
      "a refusal leaves a receipt in the status bar and changes nothing");
  }

  // 4. Full editing: heading, bold, list — one named step each.
  {
    session.setMode("full");
    session.setCaret(at("这个周末", 0));
    test.assert(session.format("format.heading.2").status === "ok" && byText(adapter, "这个周末").headingLevel === 2 && session.editHistory.undoLabel() === "clio_write_step_heading_2",
      "full editing: Heading 2 applies, and Edit › Undo says 「标题 2」");
    test.assert(session.commandState("format.bold").enabled === false && /select_text/.test(session.commandState("format.bold").reason), "Bold with only a caret is grey: select the text first");
    session.setCaret(at("最后一段", 0, 2));
    test.assert(byText(adapter, "最后一段").runs[0].b === false && session.format("format.bold").status === "ok" && byText(adapter, "最后一段").runs[0].b === true && session.editHistory.undoLabel() === "clio_write_step_bold",
      "full editing: Bold over a selection applies and is named 「粗体」");
    session.setCaret(at("最后一段", 0));
    test.assert(session.format("format.list.bullet").status === "ok" && byText(adapter, "最后一段").list.kind === "bullet" && session.listKind() === "bullet",
      "full editing: a bulleted list");
    test.assert(session.format("format.list.bullet").status === "ok" && byText(adapter, "最后一段").list === null, "choosing the same list again takes it off");
    session.setCaret(inCell);
    test.assert(session.commandState("format.heading.1").enabled === false && /reason_table/.test(session.commandState("format.heading.1").reason), "full editing: a caret in the table greys the Format menu");
    // Undo travels the adapter's own history.
    test.assert(session.editHistory.undo() === true && byText(adapter, "最后一段").list.kind === "bullet" && session.editHistory.redoLabel() === "clio_write_step_remove_list",
      "Edit › Undo takes one step back; Redo names it");
    session.editHistory.redo();
    // S11-C8: a selection is a bookmark stamped with the document's revision. A command never
    // guesses where a selection went after the document changed under it.
    session.setCaret(at("最后一段", 0, 2));
    const mark = session.caret;
    const p = byText(adapter, "先装箱");
    adapter.setRunText(p.id, 0, p.runs[0].text + "。");
    session.noteExternalEdit();
    const rev = session.revision();
    const stale = session.format("format.heading.3");
    test.assert(stale.status === "blocked" && stale.code === "RESELECT" && byText(adapter, "最后一段").headingLevel !== 3 && session.revision() === rev
      && /clio_write_reason_reselect/.test(session.receiptText()), "S11-C8: a format command on a selection taken before the document changed does nothing and asks to select again");
    const comments = adapter.comments().length;
    test.assert(session.addComment("旧选区上的批注", mark).code === "RESELECT" && adapter.comments().length === comments, "S11-C8: a comment anchored to a stale selection is refused, not placed on a guessed range");
    session.setCaret(at("最后一段", 0, 2));
    test.assert(session.format("format.italic").status === "ok" && session.format("format.italic").status === "ok" && byText(adapter, "最后一段").runs[0].i === false,
      "S11-C8: after its own command the selection's bookmark follows the new revision (a second command on it still applies)");
  }

  // 5. ⌘S through the real native host; the package reads back.
  {
    const saved = await session.save();
    test.assert(saved.status === "ok" && saved.mode === "preserving-edit" && !session.isDirty() && session.receipt.key === "clio_write_receipt_saved",
      `⌘S writes through the native host and leaves the document clean (${saved.status} ${saved.mode || ""})`);
    test.assert(lists.length === 0, "nothing converted or lost: no first-save list");
    const back = await reread();
    test.assert(byText(back, "这个周末").headingLevel === 2 && byText(back, "最后一段").runs[0].b === true && byText(back, "最后一段").text.endsWith("，改过")
      && byText(back, "最后一段").list === null && back.tables().length === 1 && back.comments().length === 1,
      "the stored package reads back with the heading, the bold run and the typed text; the table and the comment are kept");
    test.assert((await session.save()).status === "clean", "a second ⌘S with nothing new says there is nothing to save");
  }

  // 6. The first-save list appears only when something would be converted or lost.
  {
    const lossy = Object.create(adapter);
    lossy.exportReport = async () => ({ converted: [], lost: [{ kind: "object", detail: "一个图表" }] });
    const host = { save: async () => { adapter.markSaved(adapter.getEditRevision()); return { ok: true, mode: "preserving-edit" }; } };
    const s2 = open(lossy, host);
    const p = byText(adapter, "先装箱");
    adapter.setRunText(p.id, 0, p.runs[0].text + "！");
    s2.noteExternalEdit();
    hooks.answer = () => "cancel";
    const before = lists.length;
    const cancelled = await s2.save();
    test.assert(cancelled.status === "cancelled" && lists.length === before + 1 && s2.isDirty(), "a lossy save shows the list once; Cancel (the default) writes nothing and keeps the edits");
    hooks.answer = () => "save";
    const ok = await s2.save();
    test.assert(ok.status === "ok" && lists.length === before + 2 && !s2.isDirty(), "choosing 存储 saves");
    adapter.setRunText(p.id, 0, p.runs[0].text + "？");
    s2.noteExternalEdit();
    await s2.save();
    test.assert(lists.length === before + 2, "the same losses are not asked about again in the session");
    s2.close();
  }

  // 7. Step names, every string translated, nothing says 「ClioWorks」.
  {
    test.assert(api.stepKey("Typing") === "clio_write_step_typing" && api.stepKey("Join Paragraphs") === "clio_write_step_join" && api.stepKey("Something New") === "clio_write_step_change",
      "upstream undo labels map to the writer's words, with a plain fallback");
    const source = read("app/features/clio-write.js");
    const used = [...new Set([...source.matchAll(/'(clio_write_[a-z0-9_]+)'/g)].map((m) => m[1]))];
    for (const lang of ["en", "zh"]) {
      const lctx = { window: {} };
      vm.runInNewContext(read(`app/data/translations-${lang}.js`), lctx);
      const table = Object.values(lctx.window)[0];
      const missing = used.filter((k) => table[k] == null);
      test.assert(missing.length === 0, `${lang}: every ClioWrite string is translated (${used.length} keys)${missing.length ? ` — missing ${missing.join(", ")}` : ""}`);
      const shown = used.map((k) => (typeof table[k] === "function" ? table[k]("x", "y") : table[k])).join("\n");
      test.assert(!/ClioWorks/.test(shown), `${lang}: no 「ClioWorks」 on screen`);
      test.assert(table.undo_step(table.clio_write_step_typing) === (lang === "zh" ? "撤销键入" : "Undo Typing"), `${lang}: Edit › Undo reads 「${table.undo_step(table.clio_write_step_typing)}」`);
    }
  }

  // 8. The desk glue routes a docx to ClioWrite; read stays Reader's projection.
  {
    const host = read("app/vendor/clioworks-v3/native-host.js");
    test.assert(/ensureClioWriteModule[\s\S]*window\.AISystem6ClioWrite[\s\S]*surface\.open\(record, \{ mountedName, fileName: record\.fileName \}\)/.test(host), "native host: a docx edit opens in ClioWrite with the live adapter on the record");
    test.assert(/isPptx \? window\.AISystem6ClioStageNative : window\.AISystem6ClioWrite;/.test(host), "native host: the same docx opened twice is one session (no re-parse)");
    test.assert(/if \(context\.intent === 'read'\) \{[\s\S]*createReaderFileDocumentTab/.test(host), "native host: read intent stays Reader's text projection");
    test.assert(/\["clioWorksQuire", "clioworks_quire_label", "docx", "clioWrite"\]/.test(read("app/core/application-registry.js")), "the registry's Word application names the ClioWrite window");
    const wm = read("app/core/window-manager.js");
    test.assert((wm.match(/clioWrite: window\.AISystem6ClioWrite \}\[(name|appId)\]/g) || []).length === 2, "the close box and Quit ask the open document first");
    test.assert(/AISystem6ClioWrite\]\) if \(native\?\.current\?\.\(\) && await native\.close\(\) === "cancelled"\) return false;/.test(read("app/core/desktop-runtime.js")), "switching project asks the open document first");
  }

  // 9. Revert re-reads the stored bytes into a new adapter (not undoable).
  {
    const p = byText(record.liveAdapter, "这个周末");
    record.liveAdapter.setRunText(p.id, 0, "改了又不要");
    session.noteExternalEdit();
    const out = await session.revert();
    test.assert(out.status === "ok" && session.adapter !== adapter && !session.isDirty() && byText(session.adapter, "这个周末").text.startsWith("这个周末"),
      "复原到上次存储 swaps in a fresh adapter from the stored bytes");
    test.assert(stored().length > 0 && !ctx.AISystem6ClioWrite.current(), "(control) the headless session never mounted a window");
  }

  // 10. quire sets .flow's inline width and lays tables, tab stops and pictures against it, so no
  // stylesheet may cap the box narrower than that width.
  {
    const css = readFileSync(resolveProjectPath("apps/desktop/styles/84-clio-write.css"), "utf8");
    const flowRule = /\.cw-scroller \.flow\s*\{([^}]*)\}/.exec(css);
    test.assert(flowRule && !/max-(inline-size|width)/.test(flowRule[1]), "the .flow box is not capped in CSS (quire owns its width)");
  }

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
