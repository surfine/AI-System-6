// ClioWorks N10 小样: generates the sample docx deterministically.
//   node tests/fixtures/clioworks-n10/generate-docx.mjs
// Output (next to this script): quire-n10.docx — 「一个两列表格 + 一张图」,
// the two doors this sample opens (cell words editable, picture insert/resize).
// Built the same way as clioworks-s11/generate-docx.mjs: synthetic content,
// hand-written OOXML, fixed zip timestamps; the PNG is drawn here (60×40 px,
// deterministic bytes) so the fixture needs no binary checked in by hand.
import AdmZip from "adm-zip";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const FIXED = new Date(2026, 9, 26, 8, 0, 0);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

/* A 60×40 PNG, three bands of colour, built here so the bytes are fixed. */
function crc32(bytes) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
};
function bandPng(width, height, rows) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const line = y * (1 + width * 3);
    raw[line] = 0; // filter none
    const [rr, gg, bb] = rows[Math.min(rows.length - 1, Math.floor((y / height) * rows.length))];
    for (let x = 0; x < width; x += 1) {
      raw[line + 1 + x * 3] = rr;
      raw[line + 2 + x * 3] = gg;
      raw[line + 3 + x * 3] = bb;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = bandPng(60, 40, [[0x1f, 0x4e, 0x79], [0x4e, 0x79, 0x1f], [0x79, 0x1f, 0x4e]]); // 60×40, three colour bands

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (text, rpr = "") => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (inner, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
const style = (id, name, extra = "", type = "paragraph") => `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;

const styles = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
${style("Normal", "Normal", "<w:qFormat/>").replace('w:type="paragraph"', 'w:type="paragraph" w:default="1"')}
${style("Heading1", "heading 1", '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>')}
${style("TableGrid", "Table Grid", '<w:basedOn w:val="Normal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>', "table")}
</w:styles>`;

const cell = (text) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${para(run(text))}</w:tc>`;
const table = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="4800" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>`
  + `<w:tr>${cell("项目")}${cell("数量")}</w:tr><w:tr>${cell("纸箱")}${cell("20")}</w:tr><w:tr>${cell("胶带")}${cell("5")}</w:tr></w:tbl>`;
// 60×40 px at 96 dpi is 45×30 pt; the sample shows it at 90×60 pt (cx/cy in EMU).
const picture = `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1143000" cy="762000"/><wp:docPr id="1" name="Picture 1" descr="三色测试图"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${R}" r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1143000" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const body = [
  para(run("N10 小样"), '<w:pStyle w:val="Heading1"/>'),
  para(run("这份文件给作者过目：表格格内可以改字，图片可以插入、可以拖角改大小。")),
  table,
  para(picture + run("上面是一张测试图。")),
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`,
].join("");
const documentXml = `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`;
const settings = `${XML}<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/></w:settings>`;

const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>`
  + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
  + `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`;
const rootRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}officeDocument" Target="word/document.xml"/></Relationships>`;
const docRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}styles" Target="styles.xml"/><Relationship Id="rId2" Type="${RT}settings" Target="settings.xml"/><Relationship Id="rId4" Type="${RT}image" Target="media/image1.png"/></Relationships>`;

const zip = new AdmZip();
for (const [name, data] of [
  ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["word/document.xml", documentXml],
  ["word/_rels/document.xml.rels", docRels], ["word/styles.xml", styles], ["word/settings.xml", settings],
  ["word/media/image1.png", PNG],
]) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
for (const e of zip.getEntries()) e.header.time = FIXED;
writeFileSync(join(here, "quire-n10.docx"), zip.toBuffer());
console.log("quire-n10.docx written");
