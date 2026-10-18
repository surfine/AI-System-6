// ClioWorks S11 M3 (front): generates the frozen Quire fixture deterministically.
//   node tests/fixtures/clioworks-s11/generate-docx.mjs
// Output (next to this script): quire-s11.docx. manifest.mjs hashes it into MANIFEST.json.
// Synthetic content, hand-written OOXML, fixed zip timestamps (same rule as generate.mjs).
// Covers what S11-4 / S11-23 edit or must refuse to edit: Heading 1-3, plain paragraphs,
// bold / italic / underline runs, a bullet list and a numbered list, one table, one inline
// picture, and one existing comment (root) with a range.
import AdmZip from "adm-zip";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIXED = new Date(2026, 9, 16, 8, 0, 0);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
// 1x1 PNG, fixed bytes.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (text, rpr = "") => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (inner, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
const style = (id, name, extra = "", type = "paragraph") => `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;

const styles = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
${style("Normal", "Normal", "<w:qFormat/>").replace('w:type="paragraph"', 'w:type="paragraph" w:default="1"')}
${style("Heading1", "heading 1", '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>')}
${style("Heading2", "heading 2", '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr>')}
${style("Heading3", "heading 3", '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr>')}
${style("CommentText", "annotation text", '<w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr>')}
${style("CommentReference", "annotation reference", '<w:rPr><w:sz w:val="16"/></w:rPr>', "character")}
${style("TableGrid", "Table Grid", '<w:basedOn w:val="Normal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>', "table")}
</w:styles>`;

const lvl = (fmt, text, glyphFont = "") => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>${glyphFont ? `<w:rPr><w:rFonts w:ascii="${glyphFont}" w:hAnsi="${glyphFont}" w:hint="default"/></w:rPr>` : ""}</w:lvl>`;
const numbering = `${XML}<w:numbering xmlns:w="${W}">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvl("bullet", "", "Symbol")}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl("decimal", "%1.")}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const li = (numId, text) => para(run(text), `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`);
const cell = (text) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${para(run(text))}</w:tc>`;
const table = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="4800" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>`
  + `<w:tr>${cell("项目")}${cell("数量")}</w:tr><w:tr>${cell("纸箱")}${cell("20")}</w:tr></w:tbl>`;
const picture = `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="Picture 1" descr="一个红点"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${R}" r:embed="rId5"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const body = [
  para(run("搬家清单"), '<w:pStyle w:val="Heading1"/>'),
  para(run("这个周末要把东西搬到新家，下面是我的安排。")),
  para(run("先装箱"), '<w:pStyle w:val="Heading2"/>'),
  para(run("普通的一句，", "") + run("加粗的一句，", "<w:b/>") + run("斜体的一句，", "<w:i/>") + run("下划线的一句。", '<w:u w:val="single"/>')),
  para(run("再叫车"), '<w:pStyle w:val="Heading3"/>'),
  para(run("先把") + '<w:commentRangeStart w:id="0"/>' + run("纸箱") + '<w:commentRangeEnd w:id="0"/>'
    + '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>' + run("数量点清楚。")),
  li(1, "胶带和标签纸"),
  li(1, "旧报纸"),
  li(2, "周六上午装箱"),
  li(2, "周六下午叫车"),
  table,
  para(picture + run("新书架的位置示意。")),
  para(run("最后一段，什么格式都没有。")),
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`,
].join("");
const documentXml = `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`;
const comments = `${XML}<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="阿澄" w:date="2026-10-10T09:00:00Z" w:initials="AC"><w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r><w:r><w:t>纸箱数量再确认一下</w:t></w:r></w:p></w:comment></w:comments>`;
const settings = `${XML}<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/></w:settings>`;

const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>`
  + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
  + `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`
  + `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`
  + `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`;
const rootRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}officeDocument" Target="word/document.xml"/></Relationships>`;
const docRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}styles" Target="styles.xml"/><Relationship Id="rId2" Type="${RT}numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="${RT}comments" Target="comments.xml"/><Relationship Id="rId4" Type="${RT}settings" Target="settings.xml"/><Relationship Id="rId5" Type="${RT}image" Target="media/image1.png"/></Relationships>`;

const zip = new AdmZip();
for (const [name, data] of [
  ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["word/document.xml", documentXml],
  ["word/_rels/document.xml.rels", docRels], ["word/styles.xml", styles], ["word/numbering.xml", numbering],
  ["word/comments.xml", comments], ["word/settings.xml", settings], ["word/media/image1.png", PNG],
]) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
for (const e of zip.getEntries()) e.header.time = FIXED;
const out = zip.toBuffer();
writeFileSync(join(here, "quire-s11.docx"), out);
// The fixture lab serves the same bytes (?fixture=clioworks-v3&adapter=docx).
writeFileSync(join(here, "..", "..", "..", "apps", "desktop", "app", "vendor", "clioworks-v3", "fixture-files", "quire-s11.docx"), out);
console.log("quire-s11.docx written");
