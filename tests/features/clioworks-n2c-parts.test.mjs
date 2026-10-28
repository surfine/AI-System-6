// ClioWorks N2c contract: the page view's page parts — headers and footers,
// the page-number field, footnotes and columns — displayed and preserved. The
// upstream paginate pass already renders all of them (layout.js's page boxes
// carry .pg-hdr/.pg-ftr, fields resolve through LY.dynField, noteArea draws
// .pg-fn, newRegion draws .pg-col), and N2b put the host styles up, so this
// contract proves the road end to end over a fixture that carries every part
// in one file (parts-n2c.docx: landscape A4, margins that are no Word default,
// one header and one footer each with a fldSimple PAGE field, one real footnote,
// two text columns). Three VMs, the split the S11/N13b/N2b contracts use:
//   - the headless makeContext drives the real quire adapter's save road:
//     an unedited save is the original bytes, one body edit rewrites only
//     word/document.xml, the unedited parts (headers, footers, footnotes,
//     styles, settings) stay byte-identical, and the first-save list stays
//     empty — no new losses/converted category for any of these parts;
//   - the same road over the R1 corpus's D03, the real file that carries seven
//     header/footer parts: they read with their keep anchors, and one body edit
//     still rewrites only word/document.xml — no part added, none removed, all
//     seven stories and the note separators byte-identical, and the first-save
//     list names only the file's own pre-existing body-field conversion;
//   - the linkedom editor VM (tests/helpers/quire-editor-vm.mjs) drives the
//     real window over the real vendored layout: 页面视图 draws the header and
//     footer texts with the page number the field resolves to, the footnote
//     area with its separator line, two column frames — and the flow view
//     keeps none of the chrome, the way Word's Web layout does not;
//   - the strip's 文稿设置 display (the file's own margins and orientation)
//     is read from the model, headless and on the window.
// Header/footer EDITING stays out of this line (the upstream hook
// L.app.editHeaderFooter has no implementation anywhere in the vendor — editor.js
// L1074/L1078 only call it — and the upstream caret gate marks the header and
// footer stories off-limits in the normal view: editor.js L113 offLimits): display
// and preservation only.
import vm from "node:vm";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";
import { buildPartsFixture } from "../fixtures/clioworks-n2c/generate-parts.mjs";

const test = createFeatureTest("clioworks-n2c-parts");
// No TZ pin: the contract compares part bytes, never whole saved zips, and the
// parts it reads carry no clock. Pinning one mid-process would in fact flip the
// generator's fixed stamp (its Date is built at import, under the startup TZ).
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-n2c/parts-n2c.docx")));
const D03 = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/docx/D03.docx")));
const sha256 = (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");

const partHashes = (bytes) => {
  const out = new Map();
  for (const e of new AdmZip(Buffer.from(bytes)).getEntries()) if (!e.isDirectory) out.set(e.entryName, e.getData());
  return out;
};

const run = async () => {
  // The frozen file is the generator's bytes, and the generator is deterministic.
  const again = buildPartsFixture();
  test.assert(sha256(DOCX) === sha256(again), "parts-n2c.docx on disk is exactly its generator's bytes");

  /* ============ Part A: display + preservation, the real quire adapter (headless) ============ */
  {
    const ctx = makeContext();
    loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js", "app/features/clio-write.js"]);
    const api = ctx.AISystem6ClioWrite;
    ctx.__bytes = DOCX;
    const adapter = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, { name: 'parts-n2c.docx' })", ctx);
    const doc = () => adapter.document();

    // A1: the file's own parts read into the model, with the keep anchors the
    // writer binds back to the original bytes.
    const hf = doc().hf || {};
    test.assert(Object.keys(hf).length === 2 && Object.values(hf).some((s) => s.kind === "hdr" && s.keep && s.keep.part === "word/header1.xml")
      && Object.values(hf).some((s) => s.kind === "ftr" && s.keep && s.keep.part === "word/footer1.xml"),
      "the file's header and footer stories read with their part names kept");
    const sect = doc().sect;
    test.assert(!!doc().fn && !!doc().fn["1"] && sect.cols && sect.cols.n === 2 && sect.orient === "landscape"
      && sect.mt === 90 && sect.mb === 90 && sect.ml === 72 && sect.mr === 72,
      "the footnote story, the two columns and the file's own margins and orientation read (sect is the 文稿设置's source)");

    // A2: an unedited save is the original bytes — nothing is converted or lost.
    const untouched = await adapter.save();
    test.assert(untouched.mode === "original-bytes" && Buffer.compare(Buffer.from(untouched.bytes), Buffer.from(DOCX)) === 0,
      "an unedited save hands back the original bytes");

    // A3: one minimal body edit; the first-save list stays empty for every one
    // of these parts (headers, footers, footnotes, columns are no new category).
    const para = adapter.paragraphs().find((p) => p.text.startsWith("第一批装书"));
    test.assert(!!para, "(setup) the edit's paragraph is found");
    const edited = adapter.setRunText(para.id, 0, "第一批装书，第二批装厨具，第三批装衣物。");
    test.assert(edited && edited.status !== "blocked", "(setup) the edit lands");
    const report = await adapter.exportReport();
    test.assert(report.converted.length === 0 && report.lost.length === 0,
      "the first-save list names nothing — no losses/converted category for the page parts");
    const saved = await adapter.save();
    test.assert(saved.mode === "preserving-edit", "(setup) the edited save rides the preserving-edit road");

    // A4: the unedited parts are byte-identical after the edit; only the edited
    // story part may differ. The headers, footers and footnotes keep their bytes.
    const before = partHashes(DOCX), after = partHashes(saved.bytes);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((n) => !after.has(n) || !before.has(n) || !before.get(n).equals(after.get(n))).sort();
    test.assert(JSON.stringify(changed) === JSON.stringify(["word/document.xml"]),
      `one body edit rewrites only word/document.xml (changed: ${JSON.stringify(changed)})`);
    for (const part of ["word/header1.xml", "word/footer1.xml", "word/footnotes.xml", "word/styles.xml", "word/settings.xml", "word/_rels/document.xml.rels", "[Content_Types].xml"]) {
      test.assert(before.get(part).equals(after.get(part)), `${part} is byte-identical after the edit`);
    }

    // A5: the edited save reopens with every part intact for the next display.
    ctx.__bytes = new Uint8Array(saved.bytes);
    const reopened = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, { name: 'parts-n2c.docx' })", ctx);
    const rdoc = reopened.document();
    test.assert(Object.keys(rdoc.hf || {}).length === 2 && !!rdoc.fn["1"] && rdoc.sect.cols.n === 2,
      "the edited save reopens with the header/footer stories, the footnote and the columns still read");

    // A6: the 文稿设置 numbers the strip draws come from the model, headless.
    const geo = api.pageMetrics(doc());
    test.assert(geo.paper === "A4" && geo.landscape === true
      && geo.margins.top === 3.2 && geo.margins.bottom === 3.2 && geo.margins.left === 2.5 && geo.margins.right === 2.5,
      `landscape A4's own margins read as 3.2/3.2 · 2.5/2.5 cm (${JSON.stringify(geo.margins)})`);
    const none = api.pageMetrics(null);
    test.assert(none.landscape === false && none.margins.top === 0 && none.margins.left === 0,
      "no document reads no margins and portrait, never a crash");
    // A7: the same road over the R1 corpus's D03 — a real Word file whose
    // package carries seven header/footer parts. The ticket picks the corpus
    // file first; the fixture above carries what no corpus file does (a real
    // footnote body, columns, one of each part).
    {
      ctx.__bytes = D03;
      const r = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, { name: 'D03.docx' })", ctx);
      const rdoc = r.document();
      test.assert(Object.keys(rdoc.hf || {}).length === 7
        && Object.values(rdoc.hf).every((s) => s.keep && /^word\/(header|footer)\d+\.xml$/.test(s.keep.part)),
        "the corpus file's seven header/footer stories read with their part names kept");
      const pv = r.paragraphs().find((x) => x.text && x.text.length > 3);
      const rv = pv && r.runs(pv.id).find((x) => x.kind === "text" && x.text.trim());
      test.assert(!!rv, "(setup) a text run in the corpus file to edit");
      const redited = r.setRunText(pv.id, rv.runIndex, rv.text + "。");
      test.assert(redited && redited.status !== "blocked", "(setup) the corpus edit lands");
      const rreport = await r.exportReport();
      test.assert(rreport.converted.every((c) => c.where === "word/document.xml") && rreport.lost.length === 0,
        "the corpus first-save list names only the file's own body-field conversion, never a header/footer part");
      const rsaved = await r.save();
      test.assert(rsaved.mode === "preserving-edit", "(setup) the corpus edit rides the preserving-edit road");
      const rbefore = partHashes(D03), rafter = partHashes(rsaved.bytes);
      const radded = [...rafter.keys()].filter((n) => !rbefore.has(n));
      const rremoved = [...rbefore.keys()].filter((n) => !rafter.has(n));
      const rchanged = [...rbefore.keys()].filter((n) => rafter.has(n) && !rbefore.get(n).equals(rafter.get(n)));
      test.assert(!radded.length && !rremoved.length && JSON.stringify(rchanged) === JSON.stringify(["word/document.xml"]),
        `one body edit rewrites only word/document.xml over the real file too (changed: ${JSON.stringify(rchanged)}, added: ${JSON.stringify(radded)}, removed: ${JSON.stringify(rremoved)})`);
      for (const part of [...rbefore.keys()].filter((n) => /^word\/(header|footer)\d+\.xml$/.test(n) || n === "word/footnotes.xml" || n === "word/endnotes.xml")) {
        test.assert(rbefore.get(part).equals(rafter.get(part)), `the corpus file's ${part} is byte-identical after the edit`);
      }
    }
  }

  /* ============ Part B: the window, the real editor VM (linkedom) ============ */
  {
    const v = await createQuireEditorVm({ docx: DOCX, name: "parts-n2c.docx" });
    v.load(["app/features/clio-write-fonts.js"]);
    const w = v.window;
    const doc = v.document;
    const api = w.AISystem6ClioWrite;
    const LY = () => v.run("L.layout");
    const host = () => doc.querySelector("#pages");
    const strip = () => doc.querySelector(".cw-pagebar");
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
    test.assert(!host().querySelector(".pg-hdr") && !host().querySelector(".pg-fn"),
      "(setup) the flow view carries no header, footer or footnote area — Word's Web layout does not either");

    // B1: 页面视图 draws the parts the upstream paginate pass lays out.
    await chooseCommand("view.pages");
    test.assert(api.current().view === "pages" && LY().view === "preview" && !!host().querySelector(".pg"),
      "(setup) the pages are up over the upstream Print-Layout pass");
    const hdr = host().querySelector(".pg-hdr");
    const ftr = host().querySelector(".pg-ftr");
    test.assert(hdr && hdr.textContent.includes("版面信笺") && ftr && ftr.textContent.includes("内部稿件"),
      "the page box carries the header and footer stories' own words");
    const fields = [...host().querySelectorAll(".pg-hdr .fdyn, .pg-ftr .fdyn")];
    test.assert(fields.length === 2 && fields.every((f) => f.textContent === "1"),
      "the PAGE field in both stories resolves to the page's own number (1)");
    const fnArea = host().querySelector(".pg-fn");
    test.assert(!!fnArea && fnArea.querySelectorAll(".fnote").length === 1
      && !!fnArea.querySelector(".fnsep-line") && fnArea.textContent.includes("贵重物品随身带"),
      "the footnote area draws its separator line and the note's own words");
    test.assert(host().querySelectorAll(".nref").length >= 1 && host().querySelector(".nref").dataset.note === "fn:1",
      "the body's footnote reference mark stands where the note is referenced from");
    test.assert(host().querySelectorAll(".pg-reg").length === 1 && host().querySelectorAll(".pg-col").length === 2,
      "the two columns of the file's own sect lay out as two column frames in one region");

    // B2: the strip's 文稿设置 display — the file's own margins and orientation.
    test.assert(strip() && !strip().hidden
      && strip().querySelector(".cw-page-margins").textContent === "clio_write_pages_margins:3.2|3.2|2.5|2.5",
      `the strip names the file's own margins (${strip().querySelector(".cw-page-margins").textContent})`);
    test.assert(strip().querySelector(".cw-page-orient").textContent === "clio_write_pages_orient_landscape",
      `the strip names the orientation (${strip().querySelector(".cw-page-orient").textContent})`);

    // B3: back to flow — the chrome goes, the strip folds, nothing else changes.
    await chooseCommand("view.flow");
    test.assert(api.current().view === "flow" && strip().hidden === true
      && !host().querySelector(".pg-hdr") && !host().querySelector(".pg-fn") && !host().querySelector(".pg-col"),
      "the flow view keeps no page chrome: no headers, no footnote area, no columns, no strip");
    test.assert(host().querySelectorAll(".nref").length === 1,
      "the flow view keeps the footnote reference mark inline (superscript), as before");
    test.assert(v.run("L.layout.view") === "web" && host().getAttribute("contenteditable") === "true",
      "and the upstream layer is back flowing and editable");
    await api.close();
    test.assert(v.run("L.layout.view") === "web", "closing leaves the shared layer flowing for the next document");
  }

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
