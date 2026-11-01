// ClioWorks S11 M0: generates the frozen S11 fixtures deterministically.
//   node tests/fixtures/clioworks-s11/generate.mjs
// Outputs (next to this script): budget-s11.xlsx, lossless-negative-s11.xlsx,
// slides-notes-comment-s11.pptx. MANIFEST.json is written by manifest.mjs, which
// hashes the outputs. All content is synthetic. Fixed timestamps keep the zips
// byte-stable across runs on the same adm-zip version.
import AdmZip from "adm-zip";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
// adm-zip writes DOS time from LOCAL fields, so the stamp is built from local fields
// too: every time zone then writes the same bytes (08:00 matches the frozen files).
const FIXED = new Date(2026, 9, 16, 8, 0, 0);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function pack(entries) {
  const zip = new AdmZip();
  for (const [name, data] of entries) {
    zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
  }
  for (const e of zip.getEntries()) e.header.time = FIXED;
  return zip.toBuffer();
}

// ---------------------------------------------------------------- budget-s11.xlsx
// Covers the three sentinel high-risk areas:
//   shared formula   D2:D10 (master D2, children carry only si) and G2:G8
//   number format    custom "¥"#,##0 / 0.0% / yyyy"年"m"月"d"日" plus builtin 14
//   cached values    every formula carries <v>; D9 caches #VALUE!, F12 caches a string
// and the five cell states of the design board: empty (C9), zero (B10),
// text-not-measured (B9), formula error (D9), formula number (D2..).
const strings = [];
const sst = (text) => { let i = strings.indexOf(text); if (i < 0) { strings.push(text); i = strings.length - 1; } return i; };
const cs = (ref, text, s = 0) => `<c r="${ref}" s="${s}" t="s"><v>${sst(text)}</v></c>`;
const cn = (ref, n, s = 0) => `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
const items = [
  ["纸箱（中号）", 220, 6, "阿澄", "已买"],
  ["封箱胶带", 30, 4, "阿澄", "已买"],
  ["小货车（半天）", 4, 650, "小禾", "已约"],
  ["搬运帮工", 14, 200, "小禾", "待确认"],
  ["新书架", 6, 380, "阿澄", "待确认"],
  ["标签纸", 12, 15, "阿澄", "已买"],
  ["午饭与茶水", 23, 40, "小禾", "估算"],
];
const amounts = items.map(([, q, p]) => q * p);
const total = amounts.reduce((a, b) => a + b, 0);
// styles: 0 default, 1 bold header, 2 ¥ money (numFmt 164), 3 percent (165), 4 date custom (166), 5 date builtin 14
const rows = [];
rows.push(`<row r="1">${["项目", "数量", "单价", "金额", "负责人", "状态", "占比", "日期"].map((t, i) => cs(`${"ABCDEFGH"[i]}1`, t, 1)).join("")}</row>`);
items.forEach(([name, q, p, who, state], i) => {
  const r = i + 2;
  const d = r === 2
    ? `<c r="D2" s="2"><f t="shared" ref="D2:D10" si="0">B2*C2</f><v>${amounts[0]}</v></c>`
    : `<c r="D${r}" s="2"><f t="shared" si="0"/><v>${amounts[i]}</v></c>`;
  const g = r === 2
    ? `<c r="G2" s="3"><f t="shared" ref="G2:G8" si="1">D2/$D$12</f><v>${amounts[0] / total}</v></c>`
    : `<c r="G${r}" s="3"><f t="shared" si="1"/><v>${amounts[i] / total}</v></c>`;
  const date = r === 2 ? cn("H2", 46300, 4) : r === 3 ? cn("H3", 46301, 5) : "";
  rows.push(`<row r="${r}">${cs(`A${r}`, name)}${cn(`B${r}`, q)}${cn(`C${r}`, p, 2)}${d}${cs(`E${r}`, who)}${cs(`F${r}`, state)}${g}${date}</row>`);
});
// row 9: text in a number column (text-not-measured), empty C9, error D9
rows.push(`<row r="9">${cs("A9", "旧书架拆卸")}${cs("B9", "未测")}<c r="C9" s="2"/><c r="D9" s="2" t="e"><f t="shared" si="0"/><v>#VALUE!</v></c>${cs("E9", "房东")}${cs("F9", "问过了")}</row>`);
// row 10: a real zero
rows.push(`<row r="10">${cs("A10", "备用箱")}${cn("B10", 0)}${cn("C10", 6, 2)}<c r="D10" s="2"><f t="shared" si="0"/><v>0</v></c>${cs("E10", "阿澄")}${cs("F10", "待定")}</row>`);
rows.push(`<row r="12">${cs("A12", "合计")}<c r="D12" s="2"><f>SUM(D2:D8,D10)</f><v>${total}</v></c><c r="F12" t="str"><f>"另有 "&amp;COUNTIF(B2:B10,"未测")&amp;" 项未测"</f><v>另有 1 项未测</v></c></row>`);
const sheet1 = `${XML}<worksheet xmlns="${NS}" xmlns:r="${RNS}"><dimension ref="A1:H12"/><cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="8" width="12" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
const sheet2 = `${XML}<worksheet xmlns="${NS}" xmlns:r="${RNS}"><dimension ref="A1:A3"/><sheetData><row r="1">${cs("A1", "口径", 1)}</row><row r="2">${cs("A2", "金额 = 数量 × 单价；“未测”不参与合计。")}</row><row r="3">${cs("A3", "仅供格式互操作测试的合成夹具。")}</row></sheetData></worksheet>`;
const styles = `${XML}<styleSheet xmlns="${NS}"><numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;¥&quot;#,##0"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
const sstXml = () => `${XML}<sst xmlns="${NS}" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`;
const customXml = `${XML}<clioworks-preservation xmlns="urn:clioworks:s11">opaque-carry-marker</clioworks-preservation>`;

function xlsxEntries({ drawing = false } = {}) {
  const ct = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/customXml/clw-preservation.xml" ContentType="application/xml"/>${drawing ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/diagrams/data1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/><Override PartName="/xl/diagrams/layout1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml"/><Override PartName="/xl/diagrams/quickStyle1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml"/><Override PartName="/xl/diagrams/colors1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml"/>' : ""}</Types>`;
  const rootRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `${XML}<workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets><sheet name="预算" sheetId="1" r:id="rId1"/><sheet name="口径" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029"/></workbook>`;
  const wbRels = `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${RNS}/styles" Target="styles.xml"/><Relationship Id="rId4" Type="${RNS}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId5" Type="${RNS}/customXml" Target="../customXml/clw-preservation.xml"/></Relationships>`;
  let s1 = sheet1;
  const entries = [["[Content_Types].xml", ct], ["_rels/.rels", rootRels], ["xl/workbook.xml", wb], ["xl/_rels/workbook.xml.rels", wbRels]];
  if (drawing) {
    s1 = s1.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>');
    entries.push(["xl/worksheets/_rels/sheet1.xml.rels", `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RNS}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`]);
    entries.push(["xl/drawings/drawing1.xml", `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>15</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="流程示意（SmartArt）"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:r="${RNS}" r:dm="rId1" r:lo="rId2" r:qs="rId3" r:cs="rId4"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`]);
    entries.push(["xl/drawings/_rels/drawing1.xml.rels", `${XML}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RNS}/diagramData" Target="../diagrams/data1.xml"/><Relationship Id="rId2" Type="${RNS}/diagramLayout" Target="../diagrams/layout1.xml"/><Relationship Id="rId3" Type="${RNS}/diagramQuickStyle" Target="../diagrams/quickStyle1.xml"/><Relationship Id="rId4" Type="${RNS}/diagramColors" Target="../diagrams/colors1.xml"/></Relationships>`]);
    const dgm = (root) => `${XML}<dgm:${root} xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;
    entries.push(["xl/diagrams/data1.xml", dgm("dataModel")], ["xl/diagrams/layout1.xml", dgm("layoutDef")], ["xl/diagrams/quickStyle1.xml", dgm("styleDef")], ["xl/diagrams/colors1.xml", dgm("colorsDef")]);
  }
  entries.push(["xl/worksheets/sheet1.xml", s1], ["xl/worksheets/sheet2.xml", sheet2], ["xl/styles.xml", styles], ["xl/sharedStrings.xml", sstXml()], ["customXml/clw-preservation.xml", customXml]);
  return entries;
}

// The fixture lab serves files from apps/desktop only, so the xlsx files are also written
// to a served directory; the contract asserts both copies hash the same.
const served = join(root, "apps/desktop/app/vendor/clioworks-v3/fixture-files");
mkdirSync(served, { recursive: true });
for (const [file, entries] of [["budget-s11.xlsx", xlsxEntries()], ["lossless-negative-s11.xlsx", xlsxEntries({ drawing: true })]]) {
  const buf = pack(entries);
  writeFileSync(join(here, file), buf);
  writeFileSync(join(served, file), buf);
}

// ------------------------------------------------- slides-notes-comment-s11.pptx
// Derived from the v4 creator-slides.pptx (speaker notes on both slides) by adding
// one legacy comment on slide 1 (+ commentAuthors). Nothing else changes.
const src = new AdmZip(readFileSync(join(root, "tests/fixtures/clioworks-v4/creator-slides.pptx")));
const out = [];
for (const e of src.getEntries()) {
  let data = e.getData();
  const n = e.entryName;
  if (n === "[Content_Types].xml") {
    data = Buffer.from(data.toString("utf8").replace("</Types>",
      '<Override PartName="/ppt/commentAuthors.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml"/><Override PartName="/ppt/comments/comment1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.comments+xml"/></Types>'), "utf8");
  } else if (n === "ppt/_rels/presentation.xml.rels") {
    data = Buffer.from(data.toString("utf8").replace("</Relationships>",
      `<Relationship Id="rIdClioAuthors" Type="${RNS}/commentAuthors" Target="commentAuthors.xml"/></Relationships>`), "utf8");
  } else if (n === "ppt/slides/_rels/slide1.xml.rels") {
    data = Buffer.from(data.toString("utf8").replace("</Relationships>",
      `<Relationship Id="rIdClioComment" Type="${RNS}/comments" Target="../comments/comment1.xml"/></Relationships>`), "utf8");
  }
  out.push([n, data]);
}
out.push(["ppt/commentAuthors.xml", `${XML}<p:cmAuthorLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cmAuthor id="0" name="阿澄" initials="AC" lastIdx="1" clrIdx="0"/></p:cmAuthorLst>`]);
out.push(["ppt/comments/comment1.xml", `${XML}<p:cmLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cm authorId="0" dt="2026-10-10T09:00:00.000" idx="1"><p:pos x="10" y="10"/><p:text>这一页的数字等实测后再改。</p:text></p:cm></p:cmLst>`]);
writeFileSync(join(here, "slides-notes-comment-s11.pptx"), pack(out));
console.log("generated budget-s11.xlsx, lossless-negative-s11.xlsx, slides-notes-comment-s11.pptx");
