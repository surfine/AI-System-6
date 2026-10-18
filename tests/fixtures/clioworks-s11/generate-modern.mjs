// ClioWorks S11 M2: generates slides-modern-comment-s11.pptx deterministically.
//   node tests/fixtures/clioworks-s11/generate-modern.mjs
// Derived from the v4 creator-slides.pptx by adding modern (PowerPoint 365) comments
// on slide 1: one root anchored to the second text box with one reply, and one
// slide-level resolved comment. Same fixed-timestamp rule as generate.mjs. Synthetic.
import AdmZip from "adm-zip";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const FIXED = new Date(2026, 9, 16, 8, 0, 0);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const M = "http://schemas.microsoft.com/office/powerpoint/2018/8/main";
const RT = "http://schemas.microsoft.com/office/2018/10/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PC = "http://schemas.microsoft.com/office/powerpoint/2013/main/command";
const AC = "http://schemas.microsoft.com/office/drawing/2013/main/command";
const CID = 2010101010;
const AUTH1 = "{1A2B3C4D-0000-4000-8000-000000000001}";
const AUTH2 = "{1A2B3C4D-0000-4000-8000-000000000002}";
const C1 = "{5E5E5E5E-0000-4000-8000-000000000011}";
const R1 = "{5E5E5E5E-0000-4000-8000-000000000012}";
const C2 = "{5E5E5E5E-0000-4000-8000-000000000013}";
const body = (t) => `<a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>${t}</a:t></a:r></a:p>`;
const mk = `<pc:docMk/><pc:sldMk cId="${CID}" sldId="256"/>`;
const comments = `${XML}<p188:cmLst xmlns:a="${A}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p188="${M}">`
  + `<p188:cm id="${C1}" authorId="${AUTH1}" created="2026-10-10T09:00:00.000"><ac:deMkLst xmlns:ac="${AC}" xmlns:pc="${PC}">${mk}<ac:spMk id="3" creationId="{7A7A7A7A-0000-4000-8000-000000000003}"/></ac:deMkLst>`
  + `<p188:replyLst><p188:reply id="${R1}" authorId="${AUTH2}" created="2026-10-10T10:30:00.000"><p188:txBody>${body("已核对，按 42 秒写。")}</p188:txBody></p188:reply></p188:replyLst>`
  + `<p188:txBody>${body("这个数字出处在哪？")}</p188:txBody></p188:cm>`
  + `<p188:cm id="${C2}" authorId="${AUTH2}" created="2026-10-11T08:00:00.000" status="resolved"><pc:sldMkLst xmlns:pc="${PC}">${mk}</pc:sldMkLst><p188:txBody>${body("标题已改好。")}</p188:txBody></p188:cm>`
  + `</p188:cmLst>`;
const authors = `${XML}<p188:authorLst xmlns:a="${A}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p188="${M}">`
  + `<p188:author id="${AUTH1}" name="阿澄" initials="AC" userId="阿澄" providerId="None"/><p188:author id="${AUTH2}" name="小禾" initials="XH" userId="小禾" providerId="None"/></p188:authorLst>`;

const src = new AdmZip(readFileSync(join(root, "tests/fixtures/clioworks-v4/creator-slides.pptx")));
const entries = [];
for (const e of src.getEntries()) {
  let data = e.getData();
  const n = e.entryName;
  const edit = (fn) => { data = Buffer.from(fn(data.toString("utf8")), "utf8"); };
  if (n === "[Content_Types].xml") edit((t) => t.replace("</Types>", '<Override PartName="/ppt/authors.xml" ContentType="application/vnd.ms-powerpoint.authors+xml"/><Override PartName="/ppt/comments/modernComment_100_1A2B3C4D.xml" ContentType="application/vnd.ms-powerpoint.comments+xml"/></Types>'));
  else if (n === "ppt/_rels/presentation.xml.rels") edit((t) => t.replace("</Relationships>", `<Relationship Id="rIdModernAuthors" Type="${RT}/authors" Target="authors.xml"/></Relationships>`));
  else if (n === "ppt/slides/_rels/slide1.xml.rels") edit((t) => t.replace("</Relationships>", `<Relationship Id="rIdModernComment" Type="${RT}/comments" Target="../comments/modernComment_100_1A2B3C4D.xml"/></Relationships>`));
  else if (n === "ppt/slides/slide1.xml") edit((t) => t
    .replace("</p:cSld>", `<p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="${CID}"/></p:ext></p:extLst></p:cSld>`)
    .replace("</p:sld>", `<p:extLst><p:ext uri="{6950BFC3-D8DA-4A85-94F7-54DA5524770B}"><p188:commentRel xmlns:p188="${M}" r:id="rIdModernComment"/></p:ext></p:extLst></p:sld>`));
  entries.push([n, data]);
}
entries.push(["ppt/authors.xml", authors], ["ppt/comments/modernComment_100_1A2B3C4D.xml", comments]);
const zip = new AdmZip();
for (const [name, data] of entries) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
for (const e of zip.getEntries()) e.header.time = FIXED;
writeFileSync(join(here, "slides-modern-comment-s11.pptx"), zip.toBuffer());
console.log("generated slides-modern-comment-s11.pptx");
