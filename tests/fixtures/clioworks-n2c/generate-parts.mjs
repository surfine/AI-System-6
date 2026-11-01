// ClioWorks N2c: generates the frozen page-parts fixture deterministically.
//   node tests/fixtures/clioworks-n2c/generate-parts.mjs          write parts-n2c.docx
//   node tests/fixtures/clioworks-n2c/generate-parts.mjs --check  rebuild and compare, write nothing
// Output (next to this script): parts-n2c.docx. Synthetic content, hand-written
// OOXML, fixed zip timestamps (the same rules as clioworks-s11's generators).
// Covers what the N2c page view must display and preserve in one file:
//   headers and footers (one of each, referenced default), a page-number field
//   (fldSimple PAGE) in both, one real footnote (id 1) referenced from the body,
//   two text columns, landscape A4 and margins that are no Word default.
import AdmZip from "adm-zip";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIXED = new Date(2026, 9, 26, 8, 0, 0);
const NAME = "parts-n2c.docx";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (text, rpr = "") => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (inner, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
// Landscape A4, margins that are no Word default (90pt top/bottom, 72pt sides),
// two equal columns. headerReference/footerReference come first per the schema.
const SECT = '<w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/>'
  + '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
  + '<w:pgMar w:top="1800" w:right="1440" w:bottom="1800" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>'
  + '<w:cols w:num="2" w:space="425"/>';
const pageField = `<w:fldSimple w:instr=" PAGE ">${run("1")}</w:fldSimple>`;

const documentXml = `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${[
  para(run("版面稿件"), '<w:pStyle w:val="Heading1"/>'),
  // One real footnote reference; the note itself lives in word/footnotes.xml.
  para(run("这一栏讲搬家的次序") + '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>' + run("，下一栏讲打包的次序。")),
  para(run("第一批装书，第二批装厨房，第三批装衣物。")),
  para(run("标签贴在箱子的两个侧面，一面写房间，一面写内容。")),
  para(run("贵重的东西随身带，箱子里的清单逐箱核对。")),
  para(run("最后的验收要看水电与钥匙。")),
  `<w:sectPr>${SECT}</w:sectPr>`,
].join("")}</w:body></w:document>`;

const headerXml = `${XML}<w:hdr xmlns:w="${W}">${para(run("版面信笺　") + pageField)}</w:hdr>`;
const footerXml = `${XML}<w:ftr xmlns:w="${W}">${para(run("内部稿件 · 第 ") + pageField + run(" 页"))}</w:ftr>`;

const footnotesXml = `${XML}<w:footnotes xmlns:w="${W}">`
  + '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>'
  + '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
  + `<w:footnote w:id="1">${para('<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>' + run(" 贵重物品随身带，不进箱子。"), '<w:pStyle w:val="FootnoteText"/>')}</w:footnote>`
  + `</w:footnotes>`;

const styles = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
</w:styles>`;

const settings = `${XML}<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/></w:settings>`;

const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
  + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
  + `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`
  + `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
  + `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
  + `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>`;

const rootRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}officeDocument" Target="word/document.xml"/></Relationships>`;
const docRels = `${XML}<Relationships xmlns="${REL}">`
  + `<Relationship Id="rIdS" Type="${RT}styles" Target="styles.xml"/>`
  + `<Relationship Id="rIdSet" Type="${RT}settings" Target="settings.xml"/>`
  + `<Relationship Id="rIdH" Type="${RT}header" Target="header1.xml"/>`
  + `<Relationship Id="rIdF" Type="${RT}footer" Target="footer1.xml"/>`
  + `<Relationship Id="rIdFN" Type="${RT}footnotes" Target="footnotes.xml"/>`
  + `</Relationships>`;

export function buildPartsFixture() {
  const zip = new AdmZip();
  for (const [name, data] of [
    ["[Content_Types].xml", contentTypes],
    ["_rels/.rels", rootRels],
    ["word/document.xml", documentXml],
    ["word/_rels/document.xml.rels", docRels],
    ["word/styles.xml", styles],
    ["word/settings.xml", settings],
    ["word/header1.xml", headerXml],
    ["word/footer1.xml", footerXml],
    ["word/footnotes.xml", footnotesXml],
  ]) zip.addFile(name, Buffer.from(data, "utf8"));
  for (const e of zip.getEntries()) e.header.time = FIXED;
  return zip.toBuffer();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildPartsFixture();
  const target = join(here, NAME);
  if (process.argv.includes("--check")) {
    const same = Buffer.compare(readFileSync(target), out) === 0;
    console.log(same ? `${NAME} matches its generator` : `${NAME} differs from its generator`);
    process.exit(same ? 0 : 1);
  }
  writeFileSync(target, out);
  console.log(`${NAME} written (${out.length} bytes)`);
}
