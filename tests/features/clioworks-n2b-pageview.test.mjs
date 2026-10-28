// ClioWorks N2b contract: ClioWrite's page view (first version read-only, Word 5.1
// print-preview style), print and Export-as-PDF through the browser's own dialog.
// Two VMs, the split the S11/N13b contracts use:
//   - the headless makeContext drives createSession: a view change is chrome, not
//     a document change — no dirty flip, no undo step, no revision bump — and the
//     paper metrics come from the file's own sect (pgW/pgH → the same px the
//     upstream page boxes are sized with);
//   - the linkedom editor VM (tests/helpers/quire-editor-vm.mjs) drives the real
//     window over the real vendored layout: 显示 ▸ 页面视图 rides the upstream
//     Print-Layout pass (LY.view 'preview' → LY.paginate; zero vendor changes),
//     the pages are read-only (beforeinput refused with the page-view words,
//     contentEditable false, E.readOnly), a click on the text is a one-way jump
//     back to the flow (no live cursor mapping), ⌘. closes, 打印…/导出为 PDF…
//     print only the paper (body.is-cw-printing + afterprint cleanup), the strip
//     carries 共 N 页 + the paper + 「按本机排版」 and the N12 font note only
//     when a font is substituted, and closing the document leaves the shared
//     upstream layer flowing for the next one.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clioworks-n2b-pageview");
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));

const run = async () => {
  /* ============ Part A: the session, headless (makeContext) ============ */
  {
    const ctx = makeContext();
    ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
    loadScripts(ctx, ["app/features/clio-write.js"]);
    const api = ctx.AISystem6ClioWrite;

    // A mutable stub adapter: the document facts a view change must not touch.
    const facts = { dirty: false, revision: 3, undoSteps: 0, undoLabelText: "" };
    const adapter = {
      document: () => ({ sect: { pgW: 595.3, pgH: 841.9 }, main: { blocks: [] } }),
      paragraphs: () => [],
      blocks: () => [],
      isDirty: () => facts.dirty,
      getEditRevision: () => facts.revision,
      canUndo: () => facts.undoSteps > 0,
      canRedo: () => false,
      undoLabel: () => facts.undoLabelText,
    };
    const session = api.createSession(adapter, { fileName: "A4稿.docx", mountedName: "A4稿.docx", host: {} });

    // A1: the view starts flowing; the rows are offered; a bad name is refused.
    test.assert(session.view === "flow" && session.commands().some((c) => c.id === "view.pages" && c.checked === false)
      && session.commands().some((c) => c.id === "file.print" && c.state.enabled === true),
      "a fresh session flows and offers the page-view and print rows");
    session.setView("pages");
    test.assert(session.view === "pages" && session.commands().some((c) => c.id === "view.pages" && c.checked === true),
      "setView('pages') switches the session's view and the row's check");
    let threw = false;
    try { session.setView("print"); } catch (error) { threw = true; }
    test.assert(threw, "an unknown view name is refused, the way an unknown mode is");

    // A2: a view change is NOT a document change — no dirty flip, no undo step,
    // no revision bump. Clean stays clean; a pending edit stays exactly as it was.
    test.assert(session.isDirty() === false && !session.editHistory.canUndo(),
      "(setup) the stub document starts clean");
    facts.dirty = true; facts.undoSteps = 1; facts.undoLabelText = "Typing"; facts.revision = 4;
    session.setView("flow");
    session.setView("pages");
    session.setView("flow");
    test.assert(session.isDirty() === true && session.editHistory.canUndo() === true
      && session.editHistory.undoLabel() === "clio_write_step_typing" && facts.revision === 4,
      "switching views back and forth never dirties, saves, or adds an undo step");
    session.close();

    // A3: sect sizes → the paper and its px, the numbers the page boxes use.
    const metrics = api.pageMetrics;
    const a4 = metrics({ sect: { pgW: 595.3, pgH: 841.9 } });
    test.assert(a4.paper === "A4" && a4.widthPx === 793.73 && a4.heightPx === 1122.53 && a4.landscape === false,
      `A4's 595.3 × 841.9 pt names A4 and sizes 793.73 × 1122.53 px (${JSON.stringify(a4)})`);
    test.assert(metrics({ sect: { pgW: 612, pgH: 792 } }).paper === "Letter"
      && metrics({ sect: { pgW: 12240 / 20, pgH: 15840 / 20 } }).paper === "Letter",
      "12in Letter is named from its own twips/20 points");
    const rotated = metrics({ sect: { pgW: 841.9, pgH: 595.3 } });
    test.assert(rotated.paper === "A4" && rotated.landscape === true,
      "a rotated A4 is still A4, marked landscape");
    const odd = metrics({ sect: { pgW: 555, pgH: 777 } });
    test.assert(odd.paper === "" && odd.widthCm === 19.6 && odd.landscape === false,
      `a size that is no named paper borrows no name — its centimetres speak instead (${JSON.stringify(odd)})`);
    test.assert(metrics(null).paper === "Letter" && metrics(null).widthPx === 816,
      "no document reads the Word default (Letter), never a crash");
    const clean = api.createSession(adapter, { host: {} });
    test.assert(clean.pageGeometry().paper === "A4" && clean.pageGeometry().widthPx === 793.73,
      "pageGeometry reads the file's own sect through the adapter");
  }

  /* ============ Part B: the window, the real editor VM (linkedom) ============ */
  {
    const v = await createQuireEditorVm({ docx: DOCX, name: "搬家清单.docx" });
    v.load(["app/features/clio-write-fonts.js"]);
    const w = v.window;
    const doc = v.document;
    const api = w.AISystem6ClioWrite;
    const D = () => v.run("L.D");
    const E = () => v.run("L.ed");
    const LY = () => v.run("L.layout");
    const host = () => doc.querySelector("#pages");
    const strip = () => doc.querySelector(".cw-pagebar");
    const live = () => v.record.liveAdapter;
    const byText = (adapter, text) => adapter.paragraphs().find((p) => p.text.startsWith(text));
    const tick = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
    const chooseCommand = async (id) => {
      v.fire(doc.querySelector(".cw-trailing .cw-pop"), "click");
      await tick();
      doc.querySelector(`.cw-menu [data-menu-command="${id}"]`).dispatchEvent(v.make("click"));
      await tick();
    };

    const out = await api.open(v.record, {});
    await tick();
    test.assert(out.ok, "(setup) the document is mounted");
    const adapter = live();
    const snapshot = () => JSON.stringify(adapter.paragraphs().map((p) => [p.id, p.text]));

    // B1: the 命令 menu offers 页面视图; choosing it rides the upstream pages.
    v.fire(doc.querySelector(".cw-trailing .cw-pop"), "click");
    await tick();
    const row = doc.querySelector('.cw-menu [data-menu-command="view.pages"]');
    test.assert(!!row && row.getAttribute("aria-checked") === "false" && row.getAttribute("role") === "menuitemcheckbox",
      "the 命令 menu lists 「页面视图」 as an unchecked check row");
    await chooseCommand("view.pages");
    test.assert(api.current().view === "pages" && LY().view === "preview" && LY().pages.length >= 1
      && host().getAttribute("contenteditable") === "false",
      "页面视图 switches the upstream layer to its Print-Layout pass (pages up, host read-only)");
    test.assert(!!host().querySelector(".pg") && !!host().querySelector(".pg .pg-body"),
      "the page boxes are drawn (.pg with its body, sized from the file's sect)");
    const geo = api.pageMetrics(adapter.document());
    test.assert(strip() && !strip().hidden && strip().querySelector(".cw-page-count").textContent === `clio_write_pages_count:${LY().pages.length}`,
      "the strip names the page count (共 N 页)");
    test.assert(strip().querySelector(".cw-page-paper").textContent === (geo.paper ? `clio_write_pages_paper_local:${geo.paper}` : `clio_write_pages_size_local:${geo.widthCm}|${geo.heightCm}`),
      `the strip names the file's own paper with the 按本机排版 note (${strip().querySelector(".cw-page-paper").textContent})`);
    const pageEl = host().querySelector(".pg");
    test.assert(Math.abs(parseFloat(pageEl.style.width) - geo.widthPx) < 0.6 && Math.abs(parseFloat(pageEl.style.height) - geo.heightPx) < 0.6,
      `the drawn page box is the sect's own size (${pageEl.style.width} × ${pageEl.style.height} vs ${geo.widthPx} × ${geo.heightPx})`);

    // B2: read-only. beforeinput and the editing keys are refused, with words.
    const before = snapshot();
    const p1 = D().byId(adapter.document(), Number(byText(adapter, "这个周末").id));
    E().setSel(D().pos(p1, 0));
    const typed = v.fire(host(), "beforeinput", { inputType: "insertText", data: "字" });
    test.assert(typed.defaultPrevented === true && snapshot() === before,
      "typing into the page view is refused and the document is untouched");
    test.assert(doc.querySelector(".cw-receipt").textContent === "clio_write_receipt_refused:clio_write_reason_page_view",
      `the refusal names the page view in the writer's words (${doc.querySelector(".cw-receipt").textContent})`);
    const del = v.fire(host(), "keydown", { key: "Backspace" });
    test.assert(del.defaultPrevented === true && snapshot() === before && E().readOnly === true,
      "Backspace is refused the same way, and the upstream editor is read-only underneath");
    const mKey = v.fire(host(), "keydown", { key: "m", metaKey: true });
    test.assert(mKey.defaultPrevented === true && !doc.querySelector(".cw-comments-windoid"),
      "⌘M (comments) stands down too — the keys reach the openers without the menu's gate");

    // B3: a click on the text is a one-way jump back to the flow view.
    const frag = host().querySelector(".p[data-pid]");
    const pid = Number(frag.dataset.pid);
    frag.dispatchEvent(v.make("click"));
    await tick();
    test.assert(api.current().view === "flow" && host().getAttribute("contenteditable") === "true" && E().readOnly === false,
      "a click on the text returns to the flowing view, editable again");
    test.assert(E().sel && Number(E().sel.a.p.id) === pid,
      "the flow selection landed on the clicked paragraph (one-way, nothing mapped live)");
    test.assert(LY().view === "web", "the upstream layer is back to its flow pass");

    // B4: ⌘. closes the page view.
    await chooseCommand("view.pages");
    test.assert(api.current().view === "pages", "(setup) the pages are up again");
    v.fire(host(), "keydown", { key: ".", metaKey: true });
    await tick();
    test.assert(api.current().view === "flow", "⌘. closes the page view");

    // B5: 打印… prints through the browser's own dialog; only the paper goes.
    const prints = [];
    let sawPrintState = null;
    w.print = () => { prints.push(1); sawPrintState = { cls: doc.body.classList.contains("is-cw-printing"), zoom: LY().zoom }; };
    await chooseCommand("view.pages");
    doc.querySelector(".cw-pagebar-print").dispatchEvent(v.make("click"));
    await tick();
    test.assert(prints.length === 1 && sawPrintState.cls === true && sawPrintState.zoom === 1,
      "打印… opens the browser's print dialog with only the paper marked for it, at true size");
    test.assert(doc.body.classList.contains("is-cw-printing") === true, "(setup) the print state stands until the dialog closes");
    v.fire(w, "afterprint");
    await tick();
    test.assert(doc.body.classList.contains("is-cw-printing") === false,
      "afterprint takes the print state down");

    // B6: 导出为 PDF… is the same road, and it can start from the flow view.
    await chooseCommand("view.flow");
    test.assert(api.current().view === "flow", "(setup) back in the flow view");
    await chooseCommand("file.export-pdf");
    test.assert(prints.length === 2 && api.current().view === "pages" && sawPrintState.cls === true,
      "导出为 PDF… lays the pages out first, then opens the same print dialog");
    test.assert(doc.querySelector(".cw-receipt").textContent === "clio_write_export_pdf_note",
      `the status line says where the PDF comes from (${doc.querySelector(".cw-receipt").textContent})`);
    v.fire(w, "afterprint");
    await tick();

    // B7: the N12 font note appears in the strip only when a font is substituted.
    test.assert(strip().querySelector(".cw-page-fonts").hidden === true,
      "with no substitution reported the strip shows no font note");
    v.run("L.R.fontSubstitutions = (d, available) => (d && d.main ? [{ requested: '宋体', used: 'Songti SC', pinnedLineHeight: 1.1406 }] : [])");
    v.run("L.bus.emit('layout-done')");
    test.assert(strip().querySelector(".cw-page-fonts").hidden === false
      && strip().querySelector(".cw-page-fonts").textContent === "clio_write_fonts_summary:1",
      "a substituted font puts the N12 note in the strip (the same words the status bar note uses)");
    v.run("L.R.fontSubstitutions = (d, available) => []");
    v.run("L.bus.emit('layout-done')");
    test.assert(strip().querySelector(".cw-page-fonts").hidden === true,
      "the note leaves again when nothing is substituted");

    // B9: switching views never touches the document or its history.
    await chooseCommand("view.flow");
    const target = D().byId(adapter.document(), Number(byText(adapter, "这个周末").id));
    E().setSel(D().pos(target, 0));
    v.fire(host(), "beforeinput", { inputType: "insertText", data: "好" });
    await tick();
    test.assert(api.current().dirty === true && api.editHistory().undoLabel() === "clio_write_step_typing",
      "(setup) one typed word: dirty, one 「键入」 step");
    const dirtySnapshot = api.current().dirty;
    await chooseCommand("view.pages");
    await chooseCommand("view.flow");
    test.assert(api.current().dirty === dirtySnapshot && api.editHistory().undoLabel() === "clio_write_step_typing",
      "a pages round-trip leaves the dirty flag and the undo stack exactly as they were");
    test.assert(adapter.undo() !== false && !byText(adapter, "好这个周末"),
      "undo still takes back the one and only step (the view switches added none)");

    // B8: closing while the pages are up leaves the shared layer flowing.
    await chooseCommand("view.pages");
    v.modal.answers.push("no");
    await api.close();
    test.assert(v.run("L.layout.view") === "web" && v.run("L.ed.readOnly") === false,
      "the shared upstream layer is left flowing and editable for the next document");
    test.assert(doc.body.classList.contains("is-cw-printing") === false,
      "and no print state outlives the window");
  }

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
