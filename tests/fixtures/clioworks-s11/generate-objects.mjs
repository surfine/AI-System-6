// ClioWorks S11 M2 fixture: slides-objects-s11.pptx, deterministic, synthetic text only.
//   node tests/fixtures/clioworks-s11/generate-objects.mjs
// Derived from the v4 creator-slides.pptx (two dark text pages) plus two cloned pages, so each
// object the page editor cannot model sits on its own page next to an editable text box:
//   page 1  a picture (p:pic, 1x1 PNG)            page 2  a chart (c:chart part, literal data)
//   page 3  a SmartArt diagram (dgm data/layout/style/colors parts)
//   page 4  an animation (p:timing: Appear on the title box) and a transition (p:transition fade)
// Same fixed-timestamp rule as generate.mjs.
import AdmZip from "adm-zip";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const FIXED = new Date(2026, 9, 17, 8, 0, 0);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const DGM = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
const emu = (pt) => Math.round(pt * 12700);
// 1x1 opaque PNG (fixed bytes).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==", "base64");

const frame = (id, name, x, y, w, h, uri, inner) => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></p:xfrm><a:graphic><a:graphicData uri="${uri}">${inner}</a:graphicData></a:graphic></p:graphicFrame>`;
const pic = `<p:pic><p:nvPicPr><p:cNvPr id="20" name="Picture 20" descr="synthetic 1x1 swatch"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdObjPic"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(560)}" y="${emu(300)}"/><a:ext cx="${emu(120)}" cy="${emu(80)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
const chartFrame = frame(21, "Chart 21", 560, 300, 320, 180, C, `<c:chart xmlns:c="${C}" r:id="rIdObjChart"/>`);
const chartXml = `${XML}<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>`
  + `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>耗时</c:v></c:pt></c:strCache></c:strRef></c:tx>`
  + `<c:cat><c:strLit><c:ptCount val="3"/><c:pt idx="0"><c:v>甲</c:v></c:pt><c:pt idx="1"><c:v>乙</c:v></c:pt><c:pt idx="2"><c:v>丙</c:v></c:pt></c:strLit></c:cat>`
  + `<c:val><c:numLit><c:ptCount val="3"/><c:pt idx="0"><c:v>42</c:v></c:pt><c:pt idx="1"><c:v>51</c:v></c:pt><c:pt idx="2"><c:v>47</c:v></c:pt></c:numLit></c:val></c:ser>`
  + `<c:axId val="111"/><c:axId val="222"/></c:barChart><c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="111"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
const dgmFrame = frame(22, "Diagram 22", 560, 300, 320, 180, DGM, `<dgm:relIds xmlns:dgm="${DGM}" r:dm="rIdObjDm" r:lo="rIdObjLo" r:qs="rIdObjQs" r:cs="rIdObjCs"/>`);
const dgmData = `${XML}<dgm:dataModel xmlns:dgm="${DGM}" xmlns:a="${A}"><dgm:ptLst><dgm:pt modelId="{00000000-0000-4000-8000-000000000001}" type="doc"><dgm:prSet loTypeId="urn:synthetic/list" loCatId="list" qsTypeId="urn:synthetic/qs" qsCatId="simple" csTypeId="urn:synthetic/cs" csCatId="accent1"/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></dgm:t></dgm:pt>`
  + `<dgm:pt modelId="{00000000-0000-4000-8000-000000000002}"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>证据</a:t></a:r></a:p></dgm:t></dgm:pt>`
  + `<dgm:pt modelId="{00000000-0000-4000-8000-000000000003}"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>边界</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst>`
  + `<dgm:cxnLst><dgm:cxn modelId="{00000000-0000-4000-8000-000000000011}" srcId="{00000000-0000-4000-8000-000000000001}" destId="{00000000-0000-4000-8000-000000000002}" srcOrd="0" destOrd="0"/><dgm:cxn modelId="{00000000-0000-4000-8000-000000000012}" srcId="{00000000-0000-4000-8000-000000000001}" destId="{00000000-0000-4000-8000-000000000003}" srcOrd="1" destOrd="0"/></dgm:cxnLst><dgm:bg/><dgm:whole/></dgm:dataModel>`;
const dgmLayout = `${XML}<dgm:layoutDef xmlns:dgm="${DGM}" xmlns:a="${A}" uniqueId="urn:synthetic/list"><dgm:title val=""/><dgm:desc val=""/><dgm:layoutNode name="root"><dgm:alg type="lin"/><dgm:shape/><dgm:presOf/></dgm:layoutNode></dgm:layoutDef>`;
const dgmStyle = `${XML}<dgm:styleDef xmlns:dgm="${DGM}" xmlns:a="${A}" uniqueId="urn:synthetic/qs"><dgm:title val=""/><dgm:desc val=""/><dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d><dgm:styleLbl name="node0"><dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d><dgm:sp3d/><dgm:txPr/><dgm:style><a:lnRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"/></dgm:style></dgm:styleLbl></dgm:styleDef>`;
const dgmColors = `${XML}<dgm:colorsDef xmlns:dgm="${DGM}" xmlns:a="${A}" uniqueId="urn:synthetic/cs"><dgm:title val=""/><dgm:desc val=""/><dgm:styleLbl name="node0"><dgm:fillClrLst meth="repeat"><a:schemeClr val="accent1"/></dgm:fillClrLst><dgm:linClrLst meth="repeat"><a:schemeClr val="lt1"/></dgm:linClrLst><dgm:effectClrLst/><dgm:txLinClrLst/><dgm:txFillClrLst/><dgm:txEffectClrLst/></dgm:styleLbl></dgm:colorsDef>`;
const transition = '<p:transition spd="med"><p:fade/></p:transition>';
const timing = '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
  + '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="5" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="6" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="3"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
  + '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst><p:bldP spid="3" grpId="0"/></p:bldLst></p:timing>';

const src = new AdmZip(readFileSync(join(root, "tests/fixtures/clioworks-v4/creator-slides.pptx")));
const get = (n) => src.getEntry(n).getData().toString("utf8");
const withObject = (xml, obj) => xml.replace("</p:spTree>", obj + "</p:spTree>");
const retitle = (xml, text) => xml.replace(/<a:t>先给出证据，再说明边界<\/a:t>/, `<a:t>${text}</a:t>`);
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rel = (id, type, target) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`;
const addRels = (xml, ...r) => xml.replace("</Relationships>", r.join("") + "</Relationships>");
const layoutRel = rel("rId1", "slideLayout", "../slideLayouts/slideLayout7.xml");
const relsOf = (...r) => `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${layoutRel}${r.join("")}</Relationships>`;

const slide2 = get("ppt/slides/slide2.xml");
const slides = {
  1: withObject(get("ppt/slides/slide1.xml"), pic),
  2: withObject(slide2, chartFrame),
  3: retitle(withObject(slide2, dgmFrame), "SmartArt 页：证据与边界"),
  4: retitle(slide2, "动画页：出现与淡入").replace("</p:clrMapOvr>", "</p:clrMapOvr>" + transition + timing),
};
const entries = new Map();
for (const e of src.getEntries()) entries.set(e.entryName, e.getData());
const put = (n, d) => entries.set(n, Buffer.isBuffer(d) ? d : Buffer.from(d, "utf8"));
for (const [i, xml] of Object.entries(slides)) put(`ppt/slides/slide${i}.xml`, xml);
put("ppt/slides/_rels/slide1.xml.rels", addRels(get("ppt/slides/_rels/slide1.xml.rels"), rel("rIdObjPic", "image", "../media/image1.png")));
put("ppt/slides/_rels/slide2.xml.rels", addRels(get("ppt/slides/_rels/slide2.xml.rels"), rel("rIdObjChart", "chart", "../charts/chart1.xml")));
put("ppt/slides/_rels/slide3.xml.rels", relsOf(rel("rIdObjDm", "diagramData", "../diagrams/data1.xml"), rel("rIdObjLo", "diagramLayout", "../diagrams/layout1.xml"), rel("rIdObjQs", "diagramQuickStyle", "../diagrams/quickStyle1.xml"), rel("rIdObjCs", "diagramColors", "../diagrams/colors1.xml")));
put("ppt/slides/_rels/slide4.xml.rels", relsOf());
put("ppt/media/image1.png", PNG);
put("ppt/charts/chart1.xml", chartXml);
put("ppt/diagrams/data1.xml", dgmData);
put("ppt/diagrams/layout1.xml", dgmLayout);
put("ppt/diagrams/quickStyle1.xml", dgmStyle);
put("ppt/diagrams/colors1.xml", dgmColors);
put("ppt/presentation.xml", get("ppt/presentation.xml").replace('<p:sldId id="257" r:id="rId9"/>', '<p:sldId id="257" r:id="rId9"/><p:sldId id="258" r:id="rIdObj3"/><p:sldId id="259" r:id="rIdObj4"/>'));
put("ppt/_rels/presentation.xml.rels", addRels(get("ppt/_rels/presentation.xml.rels"), rel("rIdObj3", "slide", "slides/slide3.xml"), rel("rIdObj4", "slide", "slides/slide4.xml")));
const ov = (part, type) => `<Override PartName="${part}" ContentType="${type}"/>`;
let ct = get("[Content_Types].xml");
if (!/Extension="png"/.test(ct)) ct = ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>');
ct = ct.replace("</Types>", [
  ov("/ppt/slides/slide3.xml", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"),
  ov("/ppt/slides/slide4.xml", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"),
  ov("/ppt/charts/chart1.xml", "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"),
  ov("/ppt/diagrams/data1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"),
  ov("/ppt/diagrams/layout1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml"),
  ov("/ppt/diagrams/quickStyle1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml"),
  ov("/ppt/diagrams/colors1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml"),
].join("") + "</Types>");
put("[Content_Types].xml", ct);
// Page 4 re-uses the title shape of the cloned page; make sure the notes of page 2 are not shared.
const zip = new AdmZip();
for (const name of [...entries.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : a < b ? -1 : 1))) zip.addFile(name, entries.get(name));
for (const e of zip.getEntries()) e.header.time = FIXED;
writeFileSync(join(here, "slides-objects-s11.pptx"), zip.toBuffer());
console.log("generated slides-objects-s11.pptx");
