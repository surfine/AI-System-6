// ClioWorks R1 corpus: generates the three synthetic files (D19, D20, P10) deterministically.
//   node tests/fixtures/real-corpus/generate-synthetic.mjs
// Synthetic text only, written by the desk's own codecs (docx) or derived from the S11 fixtures
// (pptx), so there is nothing to license. Each file carries what the real files above do not:
//   D19.docx  a table property revision (w:tblPrChange), a move (w:moveFrom/w:moveTo), a plain
//             insertion and deletion, and a paragraph before the table for the R1 edit to land on.
//   D20.docx  a comment thread: a root with a reply and a resolved root, with GAPS in the comment
//             ids (0, 3, 7). The writer renumbers comment ids, so any edit takes the full-write
//             path; baseline.json records that as the known regression semantics, not a pass.
//   P10.pptx  four slides with an animation (p:timing) and a transition, a section list
//             (p14:sectionLst) and an audio shape with its media part.
// Same fixed-timestamp rule as the S11 generators.
import vm from "node:vm";
import AdmZip from "adm-zip";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScripts, makeContext } from "../clioworks-s11/vm-context.mjs";

process.env.TZ = "UTC";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const NOW = Date.UTC(2026, 9, 31, 8, 0, 0);
const FIXED = new Date(NOW);

async function codecContext() {
  const ctx = makeContext();
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(NOW); }
    static now() { return NOW; }
  }
  ctx.Date = FixedDate;
  loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
  return ctx;
}

const fixedZip = (entries) => {
  const zip = new AdmZip();
  for (const [name, data] of entries) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
  for (const e of zip.getEntries()) e.header.time = FIXED;
  return zip.toBuffer();
};
const readZip = (bytes) => new AdmZip(Buffer.from(bytes)).getEntries().filter((e) => !e.isDirectory).map((e) => [e.entryName, e.getData()]);

async function buildRevisionsDocx(ctx) {
  const bytes = await vm.runInContext(`(async () => {
    const L = await ClioWorksQuireAdapter.loadCodec();
    const D = L.D;
    const doc = D.newDoc();
    const stamp = (id, author) => ({ author: author || "Reviewer", date: "2026-10-20T09:00:00Z", id });
    const intro = D.para([D.text("Quarterly note: the table below changed its layout.", {})], {});
    const cell = (t) => D.cell([D.para([D.text(t, {})], {})], { w: 120 });
    const tbl = D.table(
      [D.row([cell("Item"), cell("Count")], {}), D.row([cell("Apples"), cell("12")], {})],
      [120, 120],
      { w: { type: "dxa", v: 240 }, jc: "center", layout: "fixed", chg: Object.assign(stamp(11), { old: { w: { type: "auto", v: 0 }, jc: "left", layout: "autofit" } }) });
    const mid = D.para([D.text("Kept text, ", {}), D.text("added words", { ins: stamp(12) }), D.text(" and dropped words", { del: stamp(13) })], {});
    const moved1 = D.para([D.text("This sentence moved away.", { del: Object.assign(stamp(14, "Mover"), { move: true }) })], {});
    const moved2 = D.para([D.text("This sentence moved here.", { ins: Object.assign(stamp(15, "Mover"), { move: true }) })], {});
    const tail = D.para([D.text("End of note.", {})], {});
    D.touchList(doc.main);
    doc.main.blocks = [intro, tbl, mid, moved1, moved2, tail];
    D.reindex(doc);
    return new Uint8Array(await (await L.docx.write(doc, { format: "docx" })).arrayBuffer());
  })()`, ctx);
  return Buffer.from(bytes);
}

async function buildCommentsDocx(ctx) {
  const bytes = await vm.runInContext(`(async () => {
    const L = await ClioWorksQuireAdapter.loadCodec();
    const D = L.D;
    const doc = D.newDoc();
    const body = (t) => D.para([D.text(t, {})], {});
    const p1 = D.para([D.item("cs", { id: "0" }), D.text("The claim needs a source.", {}), D.item("ce", { id: "0" }), D.item("cs", { id: "1" }), D.text(" The date looks off.", {}), D.item("ce", { id: "1" })], {});
    const p2 = D.para([D.item("cs", { id: "2" }), D.text("Second paragraph.", {}), D.item("ce", { id: "2" }), D.item("cs", { id: "3" }), D.item("ce", { id: "3" })], {});
    const mk = (id, author, initials, text, extra) => Object.assign({ kind: "cmt", id, author, initials, date: "2026-10-21T09:00:00Z", blocks: [body(text)] }, extra || {});
    doc.comments = {
      0: mk("0", "Ana", "A", "Which report is this from?"),
      1: mk("1", "Ben", "B", "Checked: it is the 2025 date.", { done: true }),
      2: mk("2", "Ana", "A", "Reword this."),
      3: mk("3", "Ben", "B", "Done, see the new line.", { parent: "2" }),
    };
    D.touchList(doc.main);
    doc.main.blocks = [p1, p2];
    D.reindex(doc);
    return new Uint8Array(await (await L.docx.write(doc, { format: "docx" })).arrayBuffer());
  })()`, ctx);
  // Make the ids gappy the way a real file with deleted comments is: 0,1,2,3 -> 0,3,7,9.
  const map = { 0: 0, 1: 3, 2: 7, 3: 9 };
  const renumber = (xml, re) => xml.replace(re, (all, pre, id, post) => `${pre}${map[id] ?? id}${post}`);
  const entries = readZip(bytes).map(([name, data]) => {
    if (name === "word/comments.xml") return [name, renumber(data.toString("utf8"), /(<w:comment\b[^>]*\bw:id=")(\d+)(")/g)];
    if (name === "word/document.xml") return [name, renumber(data.toString("utf8"), /(<w:comment(?:RangeStart|RangeEnd|Reference)\b[^>]*\bw:id=")(\d+)(")/g)];
    return [name, data];
  });
  return fixedZip(entries);
}

function buildPptx() {
  const src = new AdmZip(readFileSync(join(root, "tests/fixtures/clioworks-s11/slides-objects-s11.pptx")));
  const entries = new Map(src.getEntries().map((e) => [e.entryName, e.getData()]));
  const text = (n) => entries.get(n).toString("utf8");
  const put = (n, d) => entries.set(n, Buffer.isBuffer(d) ? d : Buffer.from(d, "utf8"));
  // sections: three, over the four slides (ids 256..259 as the S11 fixture numbers them)
  const ids = [...text("ppt/presentation.xml").matchAll(/<p:sldId id="(\d+)"/g)].map((m) => m[1]);
  const sec = (name, guid, list) => `<p14:section name="${name}" id="{${guid}}"><p14:sldIdLst>${list.map((i) => `<p14:sldId id="${i}"/>`).join("")}</p14:sldIdLst></p14:section>`;
  const sections = `<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">`
    + sec("Opening", "00000000-0000-4000-8000-0000000000A1", ids.slice(0, 1))
    + sec("Evidence", "00000000-0000-4000-8000-0000000000A2", ids.slice(1, 3))
    + sec("Close", "00000000-0000-4000-8000-0000000000A3", ids.slice(3))
    + `</p14:sectionLst></p:ext></p:extLst>`;
  let pres = text("ppt/presentation.xml");
  pres = pres.includes("</p:extLst>") ? pres.replace("<p:extLst>", sections.replace(/^<p:extLst>|<\/p:extLst>$/g, "").replace(/^/, "<p:extLst>")) : pres.replace("</p:presentation>", sections + "</p:presentation>");
  put("ppt/presentation.xml", pres);
  // audio on slide 1: a 0.1 s silent 8 kHz mono WAV, an audioFile pic and its two relationships
  const samples = 800;
  const wav = Buffer.alloc(44 + samples);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(samples, 40); wav.fill(0x80, 44);
  put("ppt/media/media1.wav", wav);
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const audioPic = '<p:pic><p:nvPicPr><p:cNvPr id="30" name="Audio 30"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:audioFile r:link="rIdAud"/></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rIdObjPic"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="7620000" y="5080000"/><a:ext cx="304800" cy="304800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  put("ppt/slides/slide1.xml", text("ppt/slides/slide1.xml").replace("</p:spTree>", audioPic + "</p:spTree>"));
  put("ppt/slides/_rels/slide1.xml.rels", text("ppt/slides/_rels/slide1.xml.rels").replace("</Relationships>", `<Relationship Id="rIdAud" Type="${R}/audio" Target="../media/media1.wav"/></Relationships>`));
  let ct = text("[Content_Types].xml");
  if (!/Extension="wav"/.test(ct)) ct = ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="wav" ContentType="audio/wav"/>');
  put("[Content_Types].xml", ct);
  return fixedZip([...entries.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : a < b ? -1 : 1)).map((n) => [n, entries.get(n)]));
}

const ctx = await codecContext();
writeFileSync(join(here, "docx", "D19.docx"), await buildRevisionsDocx(ctx));
writeFileSync(join(here, "docx", "D20.docx"), await buildCommentsDocx(await codecContext()));
writeFileSync(join(here, "pptx", "P10.pptx"), buildPptx());
console.log("generated D19.docx D20.docx P10.pptx");
