// ClioWorks R2: generates the large-office performance fixtures deterministically.
//   node tooling/clioworks-r2-generate.mjs
// Writes into dist/fixtures/large-office/ (git-ignored on purpose: the generator is
// committed, the big files are not — regenerate locally with this script). Same rules as
// clioworks-s11/generate.mjs: hand-written OOXML, synthetic content, no randomness, fixed
// zip timestamps built from LOCAL fields so every time zone writes the same bytes.
//   sheet-10k.xlsx  10,000 data rows × 12 columns (numbers + Chinese text), shared
//                   strings, one SUM formula per row (cached value included)
//   doc-200p.docx   ~200 pages of 宋体 12pt (小四) Chinese paragraphs, a Heading1 every
//                   ~5 pages, a small table every ~20 pages
//   deck-80.pptx    80 slides, a title and three bullet lines each
// The perf tool (tooling/clioworks-r2-perf.mjs) and the R2 contract import the
// generateSheet/generateDoc/generateDeck helpers from here.
import AdmZip from "adm-zip";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(here, "..", "dist", "fixtures", "large-office");
// adm-zip writes DOS time from LOCAL fields, so the stamp is built from local fields too:
// every time zone then writes the same bytes (08:00, same rule as the S11 fixtures).
const FIXED = new Date(2026, 9, 16, 8, 0, 0);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Exactly n Chinese characters, deterministic: the sentence repeated, then cut.
const cn = (s, n) => (s + "稿").repeat(Math.ceil(n / (s.length + 1))).slice(0, n);

function pack(entries) {
  const zip = new AdmZip();
  for (const [name, data] of entries) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
  for (const e of zip.getEntries()) e.header.time = FIXED;
  return zip.toBuffer();
}

function write(outDir, name, buffer) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, name);
  writeFileSync(path, buffer);
  return path;
}

// ------------------------------------------------------------------ sheet-10k.xlsx
// Columns A..L: 序号, 产品, 数量, 单价, 库存, 备注, 一月..五月, 合计(=SUM(C:K)).
// All values are integers or integers + 0.5, so the cached SUM values are exact.
export const SHEET_NAME = "sheet-10k.xlsx";
const ROWS = 10000;
const PRODUCTS = ["素描本", "牛皮纸箱", "中性笔", "便签纸", "文件夹", "封箱胶带", "标签纸", "订书机", "裁纸刀", "白板笔"]
  .flatMap((name) => ["大号", "中号", "小号", "加厚", "轻型"].map((size) => `${name}（${size}）`));
const REMARKS = ["已核对", "待补来源", "先估算", "已下单", "在途", "待确认", "有富余", "需补货", "已到货", "暂缓",
  "已清点", "部分到货", "等待报价", "沿用旧库存", "已折算", "对过两遍", "待退换", "已入册", "留样", "本周结"];

function sheetEntries() {
  const strings = [];
  const sst = (text) => { let i = strings.indexOf(text); if (i < 0) { strings.push(text); i = strings.length - 1; } return i; };
  const cs = (ref, text, s = 0) => `<c r="${ref}" s="${s}" t="s"><v>${sst(text)}</v></c>`;
  const cnum = (ref, n) => `<c r="${ref}"><v>${n}</v></c>`;
  const header = ["序号", "产品", "数量", "单价", "库存", "备注", "一月", "二月", "三月", "四月", "五月", "合计"];
  const rows = [`<row r="1">${header.map((t, i) => cs(`${"ABCDEFGHIJKL"[i]}1`, t, 1)).join("")}</row>`];
  for (let i = 0; i < ROWS; i += 1) {
    const r = i + 2;
    const cells = [
      cnum(`A${r}`, i + 1),
      cs(`B${r}`, PRODUCTS[i % PRODUCTS.length]),
      cnum(`C${r}`, (r % 90) + 10),
      cnum(`D${r}`, ((r * 7) % 400) + 25),
      cnum(`E${r}`, (r * 13) % 500),
      cs(`F${r}`, REMARKS[i % REMARKS.length]),
      cnum(`G${r}`, ((r * 3) % 900) + 0.5),
      cnum(`H${r}`, (r * 5) % 800),
      cnum(`I${r}`, (r * 11) % 700),
      cnum(`J${r}`, (r * 17) % 600),
      cnum(`K${r}`, (r * 23) % 500),
    ];
    const sum = (r % 90) + 10 + ((r * 7) % 400) + 25 + ((r * 13) % 500) + ((r * 3) % 900) + 0.5 + ((r * 5) % 800) + ((r * 11) % 700) + ((r * 17) % 600) + ((r * 23) % 500);
    cells.push(`<c r="L${r}"><f>SUM(C${r}:K${r})</f><v>${sum}</v></c>`);
    rows.push(`<row r="${r}">${cells.join("")}</row>`);
  }
  const sheet1 = `${XML}<worksheet xmlns="${NS}" xmlns:r="${R}"><dimension ref="A1:L${ROWS + 1}"/><cols><col min="1" max="2" width="20" customWidth="1"/><col min="3" max="12" width="11" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
  const styles = `${XML}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="宋体"/></font><font><b/><sz val="11"/><name val="宋体"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const sstXml = `${XML}<sst xmlns="${NS}" count="${ROWS * 2 + header.length}" uniqueCount="${strings.length}">${strings.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`;
  const ct = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const rootRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `${XML}<workbook xmlns="${NS}" xmlns:r="${R}"><sheets><sheet name="清单" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="0"/></workbook>`;
  const wbRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  return [["[Content_Types].xml", ct], ["_rels/.rels", rootRels], ["xl/workbook.xml", wb], ["xl/_rels/workbook.xml.rels", wbRels], ["xl/worksheets/sheet1.xml", sheet1], ["xl/styles.xml", styles], ["xl/sharedStrings.xml", sstXml]];
}

// ------------------------------------------------------------------- doc-200p.docx
// 30 paragraphs of exactly 40 characters per page ≈ one A4 page at 宋体 12pt with
// 1440-twip margins; 200 pages. Headings on pages 1, 6, 11, …; a table after every
// 20th page. Tables are read-only in ClioWrite, body paragraphs carry the edit surface.
export const DOC_NAME = "doc-200p.docx";
const PAGES = 200;
const PARAS_PER_PAGE = 30;
const SENTENCES = [
  "这一节先记下大致的想法，细节等清样再说",
  "例子要从自己的笔记里挑，不要用现成的套话",
  "数字先空着，等核对完来源再填进去",
  "段落之间的过渡宁可生硬，也不要假装流畅",
  "引文保持原样，出处写在后面的括号里",
  "大纲改动过三次，旧版本还留在草稿箱里",
  "今天的任务是把这个论点讲清楚就好",
  "读者第一眼看到的应该是问题不是结论",
].map((s) => cn(s, 20));
const paraText = (i) => SENTENCES[i % SENTENCES.length] + SENTENCES[(i + 3) % SENTENCES.length];

const run = (text) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const bodyPara = (text) => `<w:p>${run(text)}</w:p>`;
const headingPara = (text) => `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run(text)}</w:p>`;
const cell = (text) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p>${run(text)}</w:p></w:tc>`;
const tableAt = (k) => `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="4800" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>`
  + `<w:tr>${cell(`第${k}批核对`)}${cell("数量")}</w:tr><w:tr>${cell("纸箱")}${cell(`${k * 20}`)}</w:tr></w:tbl>`;

function docEntries() {
  const style = (id, name, extra = "", type = "paragraph") => `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;
  const song = '<w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体"/>';
  const styles = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr>${song}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
${style("Normal", "Normal", "<w:qFormat/>").replace('w:type="paragraph"', 'w:type="paragraph" w:default="1"')}
${style("Heading1", "heading 1", '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>')}
${style("TableGrid", "Table Grid", '<w:basedOn w:val="Normal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>', "table")}
</w:styles>`;
  const body = [];
  let paraIndex = 0;
  let tableCount = 0;
  for (let page = 1; page <= PAGES; page += 1) {
    if ((page - 1) % 5 === 0) body.push(headingPara(`第${Math.ceil(page / 5)}章 修订记录与草稿`));
    for (let p = 0; p < PARAS_PER_PAGE; p += 1) body.push(bodyPara(paraText(paraIndex++)));
    if (page % 20 === 0) body.push(tableAt(++tableCount));
  }
  body.push(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`);
  const documentXml = `${XML}<w:document xmlns:w="${W}"><w:body>${body.join("")}</w:body></w:document>`;
  const settings = `${XML}<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/></w:settings>`;
  const ct = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`;
  const rootRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}styles" Target="styles.xml"/><Relationship Id="rId2" Type="${RT}settings" Target="settings.xml"/></Relationships>`;
  return [["[Content_Types].xml", ct], ["_rels/.rels", rootRels], ["word/document.xml", documentXml], ["word/_rels/document.xml.rels", docRels], ["word/styles.xml", styles], ["word/settings.xml", settings]];
}

// -------------------------------------------------------------------- deck-80.pptx
// Minimal-but-complete package: one master, one layout, one theme, 80 slides each
// carrying a title text box and a bullet text box (same TextBox shape shape the
// S11/V4 fixtures use, so Lectern sees an editable run on every slide).
export const DECK_NAME = "deck-80.pptx";
const SLIDES = 80;
const bullet = (text) => `<a:p><a:pPr><a:defRPr sz="1500"><a:solidFill><a:srgbClr val="333333"/></a:solidFill><a:latin typeface="宋体"/><a:ea typeface="宋体"/></a:defRPr></a:pPr><a:r><a:t>${esc(text)}</a:t></a:r></a:p>`;
const titleRun = (text) => `<a:p><a:pPr><a:defRPr sz="2800"><a:solidFill><a:srgbClr val="1A1A1A"/></a:solidFill><a:latin typeface="宋体"/><a:ea typeface="宋体"/></a:defRPr></a:pPr><a:r><a:t>${esc(text)}</a:t></a:r></a:p>`;
const textBox = (id, name, x, y, cx, cy, paragraphs) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;

function slideXml(n) {
  const bullets = [0, 1, 2].map((i) => bullet(`第${n}页要点${i + 1}：${SENTENCES[(n + i) % SENTENCES.length]}`)).join("");
  return `${XML}<p:sld xmlns:a="${A}" xmlns:p="${P}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>`
    + textBox(2, `标题 ${n}`, 685800, 365125, 10820400, 914400, titleRun(`性能夹具演示 · 第 ${n} 页`))
    + textBox(3, `要点 ${n}`, 685800, 1828800, 10820400, 2746380, bullets)
    + `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function deckEntries() {
  const slideIds = Array.from({ length: SLIDES }, (_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join("");
  const presentation = `${XML}<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  const presRels = [`${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${RT}theme" Target="theme/theme1.xml"/><Relationship Id="rId3" Type="${RT}presProps" Target="presProps.xml"/>`,
    ...Array.from({ length: SLIDES }, (_, i) => `<Relationship Id="rIdS${i + 1}" Type="${RT}slide" Target="slides/slide${i + 1}.xml"/>`), "</Relationships>"].join("");
  const master = `${XML}<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
  const masterRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${RT}theme" Target="../theme/theme1.xml"/></Relationships>`;
  const layout = `${XML}<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const layoutRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
  const theme = `${XML}<a:theme xmlns:a="${A}" name="性能夹具"><a:themeElements><a:clrScheme name="性能夹具"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="性能夹具"><a:majorFont><a:latin typeface="宋体"/><a:ea typeface="宋体"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="宋体"/><a:ea typeface="宋体"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="性能夹具"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const presProps = `${XML}<p:presProps xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"/>`;
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>性能夹具演示</dc:title><dc:creator>阿澄</dc:creator><cp:lastModifiedBy>阿澄</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-10-16T08:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-16T08:00:00Z</dcterms:modified></cp:coreProperties>`;
  const app = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:p="${P}"><Application>性能夹具生成器</Application><Slides>${SLIDES}</Slides><PresentationFormat>宽屏</PresentationFormat></Properties>`;
  const slideOverrides = Array.from({ length: SLIDES }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const ct = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slideOverrides}</Types>`;
  const rootRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="${RT}core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${RT}extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const entries = [["[Content_Types].xml", ct], ["_rels/.rels", rootRels], ["ppt/presentation.xml", presentation], ["ppt/_rels/presentation.xml.rels", presRels], ["ppt/presProps.xml", presProps], ["ppt/slideMasters/slideMaster1.xml", master], ["ppt/slideMasters/_rels/slideMaster1.xml.rels", masterRels], ["ppt/slideLayouts/slideLayout1.xml", layout], ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", layoutRels], ["ppt/theme/theme1.xml", theme], ["docProps/core.xml", core], ["docProps/app.xml", app]];
  for (let i = 1; i <= SLIDES; i += 1) {
    entries.push([`ppt/slides/slide${i}.xml`, slideXml(i)]);
    entries.push([`ppt/slides/_rels/slide${i}.xml.rels`, `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`]);
  }
  return entries;
}

// ------------------------------------------------------------------- entry points
export function generateSheet(outDir = OUT_DIR) {
  return write(outDir, SHEET_NAME, pack(sheetEntries()));
}
export function generateDoc(outDir = OUT_DIR) {
  return write(outDir, DOC_NAME, pack(docEntries()));
}
export function generateDeck(outDir = OUT_DIR) {
  return write(outDir, DECK_NAME, pack(deckEntries()));
}

function main() {
  for (const path of [generateSheet(), generateDoc(), generateDeck()]) console.log(`${path} written`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
