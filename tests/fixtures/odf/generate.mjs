// ClioWorks ODF import fixtures: three small hand-written OpenDocument packages,
// generated deterministically for the clioworks-odf-import contract.
//   node tests/fixtures/odf/generate.mjs
// Output (next to this script): sample.odt, sample.ods, sample.odp. Same rule as
// tests/fixtures/clioworks-s11/generate-docx.mjs — synthetic content, hand-written
// XML, fixed zip timestamps.
//
//   sample.odt  heading, plain paragraph, bold / italic / underline runs, a
//               hyperlink (exercises notCarried), a bullet list, a numbered list,
//               a 2×2 table, one inline PNG, a cell style (exercises notCarried).
//   sample.ods  two sheets; numbers, text, a boolean, a 1:1 SUM formula, and one
//               ODF-only CURRENT() formula (kept as its cached value).
//   sample.odp  two slides: title + body text frames, a second slide with an
//               image frame and an embedded object (exercises notCarried).
import AdmZip from "adm-zip";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIXED = new Date(2026, 9, 24, 8, 0, 0);
const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';
// 1x1 PNG, fixed bytes (same as the S11 docx fixture).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"',
].join(" ");

const manifest = (type, extra = "") => `${XML}<manifest:manifest ${NS} manifest:version="1.3">`
  + `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${type}"/>`
  + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>`
  + `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>`
  + `<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>`
  + extra
  + "</manifest:manifest>";

const metaXml = (title) => `${XML}<office:document-meta ${NS} office:version="1.3"><office:meta>`
  + `<dc:title>${esc(title)}</dc:title><meta:creation-date>2026-10-24T08:00:00</meta:creation-date>`
  + "</office:meta></office:document-meta>";

/* ------------------------------------------------------------------ sample.odt */
const odtAutoStyles = `${XML}<office:document-content ${NS} office:version="1.3">
<office:automatic-styles>
<style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="T3" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
<style:style style:name="ce1" style:family="table-cell"/>
</office:automatic-styles>
<office:body><office:text>`;
const odtContent = odtAutoStyles
  + `<text:h text:style-name="Heading_20_1" text:outline-level="1">搬家周报</text:h>`
  + `<text:p>这个周末要把东西搬到新家，先做准备。</text:p>`
  + `<text:p><text:span text:style-name="T1">纸箱要加粗提醒，</text:span><text:span text:style-name="T2">标签斜体写清，</text:span><text:span text:style-name="T3">胶带下划线标记。</text:span></text:p>`
  + `<text:p>搬家公司的页面在 <text:a xlink:href="https://example.com/movers">这里</text:a>。</text:p>`
  + `<text:list text:style-name="LB"><text:list-item><text:p>胶带和标签纸</text:p></text:list-item><text:list-item><text:p>旧报纸</text:p></text:list-item></text:list>`
  + `<text:list text:style-name="LN"><text:list-item><text:p>周六上午装箱</text:p></text:list-item><text:list-item><text:p>周六下午叫车</text:p></text:list-item></text:list>`
  + `<table:table table:name="清单"><table:table-column/><table:table-column/>`
  + `<table:table-row><table:table-cell office:value-type="string"><text:p>物品</text:p></table:table-cell><table:table-cell table:style-name="ce1" office:value-type="string"><text:p>数量</text:p></table:table-cell></table:table-row>`
  + `<table:table-row><table:table-cell office:value-type="string"><text:p>纸箱</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="20"><text:p>20</text:p></table:table-cell></table:table-row>`
  + `</table:table>`
  + `<text:p><draw:frame draw:name="Image1" svg:width="2cm" svg:height="2cm"><draw:image xlink:href="Pictures/image1.png" xlink:type="simple"/></draw:frame>新书架的位置示意。</text:p>`
  + `</office:text></office:body></office:document-content>`;
const odtStyles = `${XML}<office:document-styles ${NS} office:version="1.3"><office:styles>
<style:style style:name="Heading_20_1" style:family="paragraph" style:display-name="Heading 1"><style:paragraph-properties fo:margin-top="0.42cm"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>
<text:list-style style:name="LB"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:space-before="0.5cm"/></text:list-level-style-bullet></text:list-style>
<text:list-style style:name="LN"><text:list-level-style-number text:level="1" style:num-format="1"><style:list-level-properties text:space-before="0.5cm"/></text:list-level-style-number></text:list-style>
</office:styles></office:document-styles>`;

/* ------------------------------------------------------------------ sample.ods */
const odsContent = `${XML}<office:document-content ${NS} office:version="1.3">
<office:automatic-styles>
<style:style style:name="ce1" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style>
</office:automatic-styles>
<office:body><office:spreadsheet>
<table:table table:name="预算">
<table:table-column/>
<table:table-row>
<table:table-cell table:style-name="ce1" office:value-type="string"><text:p>物品</text:p></table:table-cell>
<table:table-cell office:value-type="string"><text:p>数量</text:p></table:table-cell>
</table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>纸箱</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="20"><text:p>20</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>胶带</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="5"><text:p>5</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>合计</text:p></table:table-cell><table:table-cell table:formula="of:=SUM([.B2:.B3])" office:value-type="float" office:value="25"><text:p>25</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>参考</text:p></table:table-cell><table:table-cell table:formula="of:=CURRENT()" office:value-type="float" office:value="7"><text:p>7</text:p></table:table-cell></table:table-row>
</table:table>
<table:table table:name="说明">
<table:table-column/>
<table:table-row><table:table-cell office:value-type="string"><text:p>这个表记录搬家预算</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="float" office:value="123.45"><text:p>123.45</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="boolean" office:value="true"><text:p>TRUE</text:p></table:table-cell></table:table-row>
</table:table>
</office:spreadsheet></office:body></office:document-content>`;
const odsStyles = `${XML}<office:document-styles ${NS} office:version="1.3"><office:styles/></office:document-styles>`;

/* ------------------------------------------------------------------ sample.odp */
const odpContent = `${XML}<office:document-content ${NS} office:version="1.3">
<office:automatic-styles/>
<office:body><office:presentation>
<draw:page draw:name="page1" draw:style-name="dp1" draw:master-page-name="Default">
<draw:frame presentation:class="title" svg:x="2cm" svg:y="1cm" svg:width="22cm" svg:height="2.5cm"><draw:text-box><text:p>搬家简报</text:p></draw:text-box></draw:frame>
<draw:frame presentation:class="body" svg:x="2cm" svg:y="4cm" svg:width="22cm" svg:height="10cm"><draw:text-box>
<text:p>周六上午装箱。</text:p>
<text:p>周日下午搬运。</text:p>
</draw:text-box></draw:frame>
</draw:page>
<draw:page draw:name="page2" draw:style-name="dp1" draw:master-page-name="Default">
<draw:frame presentation:class="title" svg:x="2cm" svg:y="1cm" svg:width="22cm" svg:height="2.5cm"><draw:text-box><text:p>第二天</text:p></draw:text-box></draw:frame>
<draw:frame presentation:class="body" svg:x="2cm" svg:y="4cm" svg:width="12cm" svg:height="10cm"><draw:text-box><text:p>整理新家，先擦地板。</text:p></draw:text-box></draw:frame>
<draw:frame svg:x="15cm" svg:y="4cm" svg:width="6cm" svg:height="6cm"><draw:image xlink:href="Pictures/image1.png" xlink:type="simple"/></draw:frame>
<draw:frame svg:x="15cm" svg:y="11cm" svg:width="6cm" svg:height="3cm"><draw:object xlink:href="./Object 1"/></draw:frame>
</draw:page>
</office:presentation></office:body></office:document-content>`;
const odpStyles = `${XML}<office:document-styles ${NS} office:version="1.3"><office:styles/></office:document-styles>`;

function writeOdf(name, type, content, styles, extraEntries = []) {
  const zip = new AdmZip();
  const entries = [
    // The ODF convention: mimetype first, stored uncompressed. adm-zip deflates
    // every entry, so the first entry's method is switched back to store.
    ["mimetype", Buffer.from(type, "utf8")],
    ["META-INF/manifest.xml", Buffer.from(manifest(type, extraEntries.map(([path]) => `<manifest:file-entry manifest:full-path="${esc(path)}" manifest:media-type="image/png"/>`).join("")), "utf8")],
    ["content.xml", Buffer.from(content, "utf8")],
    ["styles.xml", Buffer.from(styles, "utf8")],
    ["meta.xml", Buffer.from(metaXml({ "sample.odt": "搬家周报", "sample.ods": "搬家预算", "sample.odp": "搬家简报" }[name]), "utf8")],
    ...extraEntries,
  ];
  for (const [path, data] of entries) zip.addFile(path, data);
  zip.getEntries()[0].header.method = 0;
  for (const entry of zip.getEntries()) entry.header.time = FIXED;
  writeFileSync(join(here, name), zip.toBuffer());
  console.log(`${name} written`);
}

writeOdf("sample.odt", "application/vnd.oasis.opendocument.text", odtContent, odtStyles, [["Pictures/image1.png", PNG]]);
writeOdf("sample.ods", "application/vnd.oasis.opendocument.spreadsheet", odsContent, odsStyles);
writeOdf("sample.odp", "application/vnd.oasis.opendocument.presentation", odpContent, odpStyles, [["Pictures/image1.png", PNG]]);
