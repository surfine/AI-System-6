// ClioWorks S11 M2 contract (lane M2-A): the Lectern adapter as the native page surface
// uses it, over the REAL vendored codec and the frozen fixtures.
//   - read face: slides / shapes (pt geometry, kinds, editable runs) / notes / this deck's layouts;
//   - ONE dirty source: isDirty() = revision !== savedRevision, markSaved(encoded revision);
//   - every edit is one undo step with a label; undo / redo name the slides they touched and
//     restore them losslessly (a JSON-restored slide saves the same bytes as a hand-edited one);
//   - page commands (add / duplicate / delete / layout / reset) work on this deck's own layouts and
//     refuse honestly (last slide, unknown or unsupported layout);
//   - comments, legacy p:cm and modern p188:cm: read, add, reply; unmodified comments keep their
//     exact XML bytes; authors tables, part names, rels and content types are written;
//   - exportReport() is the encode path's own loss list: nothing for an unedited deck.
import vm from "node:vm";
import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-s11-m2-lectern-adapter");
const bytesFixture = (path) => new Uint8Array(readFileSync(resolveProjectPath(path)));
const LEGACY = "tests/fixtures/clioworks-s11/slides-notes-comment-s11.pptx";
const MODERN = "tests/fixtures/clioworks-s11/slides-modern-comment-s11.pptx";
const PLAIN = "tests/fixtures/clioworks-v4/creator-slides.pptx";
const OBJECTS = "tests/fixtures/clioworks-s11/slides-objects-s11.pptx";

function session() {
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/lectern-adapter.js"]);
  return (bytes, meta = { name: "演示.pptx" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__bytes, globalThis.__meta)", ctx);
  };
}
const zipOf = (bytes) => new AdmZip(Buffer.from(bytes));
const part = (bytes, name) => { const e = zipOf(bytes).getEntry(name); return e ? e.getData().toString("utf8") : null; };
const names = (bytes) => zipOf(bytes).getEntries().map((e) => e.entryName);
const plain = (value) => JSON.parse(JSON.stringify(value));
const textRun = (a, slideId, index) => a.shapes(slideId).filter((s) => s.editable)[index].paragraphs[0].runs[0];

const run = async () => {
  const open = session();

  // 1. Read face on the legacy-comment fixture.
  const a = await open(bytesFixture(LEGACY));
  const slides = a.slides();
  test.assert(slides.length === 2 && slides.every((s, i) => s.index === i && s.id && s.size.w > 900 && s.size.h === 540 && s.hidden === false), "slides() lists id, index, size (pt) and hidden for every page");
  test.assert(a.pageSize().w === slides[0].size.w && a.pageSize().h === 540, "pageSize() is the model page in pt");
  const shapes = a.shapes(slides[0].id);
  test.assert(shapes.length === 4 && new Set(shapes.map((s) => s.id)).size === 4 && shapes.every((s) => s.kind === "text" && s.editable && s.w > 0 && s.h > 0), "shapes() returns the four editable text boxes with unique ids and pt geometry");
  const title = shapes[1].paragraphs[0].runs[0];
  test.assert(title.text === "一次导出：42 秒" && title.id.startsWith(shapes[1].id + ":") && typeof title.size === "number", "a run carries a stable id, its text and its size");
  test.assert(/演讲备注|停一下/.test(a.notes(slides[1].id)) && a.notes(slides[0].id).length > 0, "notes(slideId) reads speaker notes");
  const layouts = a.layouts();
  test.assert(layouts.length >= 5 && layouts.some((l) => l.name === "Title Slide" && l.kind === "title") && layouts.some((l) => l.kind === "blank") && slides[0].layoutId === layouts.find((l) => l.kind === "blank").id, "layouts() lists this deck's own layouts and each page names one of them");
  test.assert(a.isDirty() === false && a.getEditRevision() === 0 && a.canUndo() === false, "a fresh open is clean with nothing to undo");
  const untouched = await a.save();
  test.assert(untouched.mode === "original-bytes" && Buffer.compare(Buffer.from(untouched.bytes), Buffer.from(bytesFixture(LEGACY))) === 0, "save() unedited returns the original bytes");
  test.assert(JSON.stringify(await a.exportReport()) === '{"converted":[],"lost":[]}', "an unedited deck reports nothing converted or lost");

  // 2. One dirty source, labelled undo steps.
  {
    const b = await open(bytesFixture(LEGACY));
    const [s0, s1] = b.slides().map((s) => s.id);
    const run0 = textRun(b, s0, 1);
    const res = b.setRunText(s0, run0.id, "一次导出用了 42 秒");
    test.assert(res.status === "ok" && b.isDirty() && b.getEditRevision() === 1 && b.undoLabel() === "text" && b.canUndo(), "setRunText(slideId, runId, text) is one labelled undo step that dirties the deck");
    test.assert(textRun(b, s0, 1).text === "一次导出用了 42 秒" && textRun(b, s0, 1).id === run0.id, "the run keeps its id after its text changes");
    const rev = b.getEditRevision();
    b.markSaved(rev);
    test.assert(b.isDirty() === false, "markSaved(revision) makes the deck clean");
    b.setNotes(s1, "改过的备注");
    b.markSaved(rev);
    test.assert(b.isDirty() === true && b.undoLabel() === "notes", "an edit made while a save ran keeps the deck dirty");
    const u = b.undo();
    test.assert(JSON.stringify(u.changed) === JSON.stringify([{ slide: s1 }]) && /演讲备注/.test(b.notes(s1)) && b.redoLabel() === "notes" && b.canRedo(), "undo names the slide it touched and restores its notes");
    const r = b.redo();
    test.assert(JSON.stringify(r.changed) === JSON.stringify([{ slide: s1 }]) && b.notes(s1) === "改过的备注", "redo re-applies the step");
    test.assert(b.setRunText(s0, "nope:0:0", "x").code === "NO_RUN" && b.setRunText("nope", run0.id, "x").code === "NO_SLIDE", "an unknown slide or run is refused with a code");
    const rev2 = b.getEditRevision();
    test.assert(b.setRunText(s0, run0.id, "一次导出用了 42 秒").changed === false && b.getEditRevision() === rev2, "setting the same text is not an edit");
    // Saved bytes: edited decks go through the preserving writer and read back.
    const saved = await b.save();
    test.assert(saved.mode === "preserving-edit", "an edited deck saves in preserving-edit mode");
    const back = await open(saved.bytes);
    const bs = back.slides().map((s) => s.id);
    test.assert(textRun(back, bs[0], 1).text === "一次导出用了 42 秒" && back.notes(bs[1]) === "改过的备注" && back.notes(bs[0]).length > 0, "the edited text and notes survive save and reopen, the other page's notes are untouched");
    test.assert(JSON.stringify(await b.exportReport()).includes("notes-edit"), "editing notes that had a notes page is reported as a conversion by the encode path");
  }

  // 3. A JSON-restored slide saves exactly what a hand-edited one does (undo is lossless).
  {
    const x = await open(bytesFixture(LEGACY));
    const y = await open(bytesFixture(LEGACY));
    const [sx] = x.slides().map((s) => s.id);
    const [sy] = y.slides().map((s) => s.id);
    const rx = textRun(x, sx, 1);
    const ry = textRun(y, sy, 1);
    x.setRunText(sx, rx.id, "临时"); x.undo();
    y.setRunText(sy, ry.id, "临时"); y.setRunText(sy, ry.id, rx.text);
    const bx = (await x.save()).bytes;
    const by = (await y.save()).bytes;
    const same = names(bx).filter((n) => n !== "docProps/core.xml").every((n) => part(bx, n) === part(by, n)) && names(bx).length === names(by).length;
    test.assert(same, "edit + undo saves the same parts as edit + manual revert");
  }

  // 4. Page commands on this deck's own layouts.
  {
    const b = await open(bytesFixture(LEGACY));
    const [s0, s1] = b.slides().map((s) => s.id);
    const titleLayout = b.layouts().find((l) => l.kind === "title");
    const add = b.addSlide(s0, titleLayout.id);
    const afterAdd = b.slides();
    test.assert(add.status === "ok" && afterAdd.length === 3 && afterAdd[1].id === add.slide && afterAdd[1].layoutId === titleLayout.id && b.undoLabel() === "slide-add", "addSlide(after, layoutId) inserts a page of that layout right after");
    test.assert(b.shapes(add.slide).some((s) => s.placeholder && s.kind === "text"), "the new page carries the layout's placeholders");
    const dup = b.duplicateSlide(s1);
    test.assert(dup.status === "ok" && b.slides().length === 4 && b.slides()[3].id === dup.slide && b.notes(dup.slide) === b.notes(s1) && b.undoLabel() === "slide-duplicate", "duplicateSlide puts a copy (notes included) right after the page");
    const del = b.deleteSlide(add.slide);
    test.assert(del.status === "ok" && b.slides().length === 3 && !b.slides().some((s) => s.id === add.slide) && b.undoLabel() === "slide-delete", "deleteSlide removes the page");
    b.undo();
    test.assert(b.slides().length === 4 && b.slides()[1].id === add.slide, "undo of a delete puts the page back in place");
    test.assert(b.setLayout(s1, "no|such").code === "UNKNOWN_LAYOUT" && b.addSlide(s0, "no|such").code === "UNKNOWN_LAYOUT", "a layout that is not in this deck is refused");
    const sl = b.setLayout(s1, titleLayout.id);
    test.assert(sl.status === "ok" && b.slides().find((s) => s.id === s1).layoutId === titleLayout.id && b.undoLabel() === "layout", "setLayout switches a page to one of this deck's layouts");
    test.assert(b.setLayout(s1, titleLayout.id).changed === false, "switching to the layout it already has changes nothing");
    const moved = b.shapes(s1).find((s) => s.placeholder);
    const reset = b.resetLayout(s1);
    test.assert(reset.status === "ok" && moved && b.shapes(s1).filter((s) => s.placeholder).length >= 1, "resetLayout keeps the page's content");
    const saved = await b.save();
    const back = await open(saved.bytes);
    test.assert(back.slides().length === 4 && back.layouts().length === b.layouts().length, "page structure survives save and reopen");
    const solo = await open(bytesFixture(LEGACY));
    solo.deleteSlide(solo.slides()[0].id);
    test.assert(solo.deleteSlide(solo.slides()[0].id).code === "LAST_SLIDE" && solo.slides().length === 1, "the last page cannot be deleted");
  }

  // 5. Legacy comments: read, add, reply, duplicate; original bytes kept; authors updated.
  {
    const b = await open(bytesFixture(LEGACY));
    const [s0, s1] = b.slides().map((s) => s.id);
    const first = b.comments(s0);
    test.assert(first.length === 1 && first[0].author === "阿澄" && first[0].text === "这一页的数字等实测后再改。" && first[0].modern === false && first[0].parentId === null && first[0].slideId === s0 && b.comments(s1).length === 0, "a legacy p:cm reads with its author, text and date");
    const added = b.addComment(s0, { author: "小禾", text: "我来补测。", date: "2026-10-16T08:00:00Z" });
    const reply = b.replyComment(first[0].id, { author: "阿澄", text: "好，周五前。", date: "2026-10-16T09:00:00Z" });
    const onNew = b.addComment(s1, { author: "小禾", text: "第二页也看一下", date: "2026-10-16T09:30:00Z" });
    test.assert(added.status === "ok" && reply.status === "ok" && onNew.status === "ok" && b.undoLabel() === "comment-add" && b.comments(s0).length === 3 && b.comments(s0)[1].parentId === first[0].id, "addComment / replyComment add one undo step each and thread under the root");
    test.assert(b.addComment(s0, { author: "x", text: "  " }).code === "EMPTY" && b.replyComment("nope#1", { author: "x", text: "y" }).code === "NO_COMMENT" && b.addComment(s0, { author: "x", text: "y", anchorShapeId: "nope" }).code === "NO_SHAPE", "empty text, unknown comment and unknown object are refused");
    const dup = b.duplicateSlide(s0);
    b.undo(); b.undo(); b.redo(); b.redo();
    const saved = await b.save();
    const xml1 = part(saved.bytes, "ppt/comments/comment1.xml");
    const original = '<p:cm authorId="0" dt="2026-10-10T09:00:00.000" idx="1"><p:pos x="10" y="10"/><p:text>这一页的数字等实测后再改。</p:text></p:cm>';
    test.assert(xml1.includes(original), "the comment that was already there keeps its exact XML bytes");
    test.assert(/<p15:parentCm authorId="0" idx="1"\/>/.test(xml1) && /p15:threadingInfo/.test(xml1), "a legacy reply is threaded with p15:parentCm");
    const authors = part(saved.bytes, "ppt/commentAuthors.xml");
    test.assert(/name="阿澄"/.test(authors) && /name="小禾"/.test(authors) && !/lastIdx="1"/.test(authors.split("小禾")[0]), "the authors table gains the new author and the advanced counter");
    test.assert(names(saved.bytes).filter((n) => /^ppt\/comments\/comment\d+\.xml$/.test(n)).length === 3 && new RegExp('PartName="/ppt/comments/comment3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.comments\\+xml"').test(part(saved.bytes, "[Content_Types].xml")), "the slide that had no comments gets its own legacy part with the matching content type");
    const back = await open(saved.bytes);
    const ids = back.slides().map((s) => s.id);
    const all = back.comments();
    test.assert(dup.status === "ok" && ids.length === 3 && all.length === 7, "comments come back on all three pages after save and reopen (7 in total)");
    const thread = back.comments(ids[0]);
    test.assert(thread.map((c) => c.text).join("|") === "这一页的数字等实测后再改。|好，周五前。|我来补测。" && thread[1].parentId === thread[0].id && thread[1].author === "阿澄", "the reply reads back under its root, in order");
    test.assert(back.comments(ids[2]).length === 1 && back.comments(ids[2])[0].text === "第二页也看一下", "the comment on the formerly empty page reads back");
  }

  // 6. Modern comments: read, thread, resolved, anchor; add and reply; bytes kept.
  {
    const b = await open(bytesFixture(MODERN));
    const [s0] = b.slides().map((s) => s.id);
    const c = b.comments(s0);
    test.assert(c.length === 3 && c.every((x) => x.modern === true) && c[0].author === "阿澄" && c[0].text === "这个数字出处在哪？", "modern p188:cm roots read with author and text");
    test.assert(c[1].parentId === c[0].id && c[1].author === "小禾" && c[1].text === "已核对，按 42 秒写。", "a modern reply reads under its root");
    test.assert(c[2].done === true && c[0].done === false && c[2].parentId === null, "status=resolved reads as done");
    test.assert(b.shapes(s0).find((s) => s.id === c[0].anchorShapeId)?.name === "TextBox 2" && c[2].anchorShapeId === undefined, "a shape-anchored comment names its object, a slide comment names none");
    const reply = b.replyComment(c[0].id, { author: "新人", text: "补一个出处。", date: "2026-10-16T09:00:00Z" });
    const second = b.addComment(s0, { author: "新人", text: "标题可以再短一点。", date: "2026-10-16T09:10:00Z", anchorShapeId: c[0].anchorShapeId });
    const toReply = b.replyComment(reply.id, { author: "阿澄", text: "收到。", date: "2026-10-16T09:20:00Z" });
    test.assert(reply.status === "ok" && second.status === "ok" && toReply.status === "ok" && b.comments(s0).length === 6, "reply, new comment and reply-to-a-reply all land");
    const saved = await b.save();
    const origPart = part(bytesFixture(MODERN), "ppt/comments/modernComment_100_1A2B3C4D.xml");
    const outPart = part(saved.bytes, "ppt/comments/modernComment_100_1A2B3C4D.xml");
    const origCms = origPart.match(/<p188:cm [\s\S]*?<\/p188:cm>/g);
    test.assert(origCms.length === 2 && origCms.every((cm) => outPart.includes(cm.slice(0, cm.indexOf("<p188:replyLst>") > 0 ? cm.indexOf("<p188:replyLst>") : 80))), "the comments that were already there keep their opening XML in the same part");
    test.assert(outPart.includes(origCms[1]) && outPart.includes(origPart.match(/<p188:reply [\s\S]*?<\/p188:reply>/)[0]), "an untouched comment and the original reply are byte-identical in the saved part");
    const authors = part(saved.bytes, "ppt/authors.xml");
    test.assert(/name="阿澄"/.test(authors) && /name="小禾"/.test(authors) && /name="新人"/.test(authors) && (authors.match(/<p188:author /g) || []).length === 3, "authors.xml keeps both authors and gains the new one");
    const back = await open(saved.bytes);
    const bc = back.comments(back.slides()[0].id);
    test.assert(bc.length === 6 && bc.filter((x) => x.parentId).length === 3 && bc.some((x) => x.text === "收到。" && x.author === "阿澄") && bc.find((x) => x.text === "标题可以再短一点。").anchorShapeId, "everything reads back after save and reopen, threads and anchor included");
    const slideXml = part(saved.bytes, "ppt/slides/slide1.xml");
    test.assert(/commentRel/.test(slideXml) && /creationId val="2010101010"/.test(slideXml), "the slide keeps its commentRel and creationId");
  }

  // 7. A deck with no comments gets a modern part, its authors part, rel, content type and slide extension.
  {
    const b = await open(bytesFixture(PLAIN));
    const [s0] = b.slides().map((s) => s.id);
    const res = b.addComment(s0, { author: "阿澄", text: "新的第一条批注。", date: "2026-10-16T08:00:00Z" });
    const rep = b.replyComment(res.id, { author: "小禾", text: "同意。", date: "2026-10-16T08:05:00Z" });
    test.assert(res.status === "ok" && rep.status === "ok" && b.comments(s0)[0].modern === true, "a deck with no comments takes modern ones (they thread)");
    const saved = await b.save();
    const ns = names(saved.bytes);
    const cm = ns.find((n) => /^ppt\/comments\/modernComment_\d+\.xml$/.test(n));
    const ct = part(saved.bytes, "[Content_Types].xml");
    test.assert(cm && ns.includes("ppt/authors1.xml") && ct.includes('ContentType="application/vnd.ms-powerpoint.comments+xml"') && ct.includes('ContentType="application/vnd.ms-powerpoint.authors+xml"'), "the comments part and authors part are written with their content types");
    const rels = part(saved.bytes, "ppt/slides/_rels/slide1.xml.rels");
    test.assert(rels.includes("2018/10/relationships/comments") && part(saved.bytes, "ppt/_rels/presentation.xml.rels").includes("2018/10/relationships/authors"), "the slide and the presentation carry the relationships");
    const sx = part(saved.bytes, "ppt/slides/slide1.xml");
    const cid = /creationId val="(\d+)"/.exec(sx)?.[1];
    test.assert(/commentRel/.test(sx) && cid && part(saved.bytes, cm).includes(`cId="${cid}"`), "the slide's commentRel extension and creationId match the comment's slide marker");
    const back = await open(saved.bytes);
    const bc = back.comments(back.slides()[0].id);
    test.assert(bc.length === 2 && bc[1].parentId === bc[0].id && bc[0].author === "阿澄", "the new thread reads back");
    // Undo takes a comment away again, and the saved deck has none.
    b.undo(); b.undo();
    test.assert(b.comments().length === 0, "undo removes the comments again");
  }

  // 9. D1: every run of an editable shape carries the effective size (pt) and colour ('#rrggbb' | null),
  //    so the page is drawn as the original: both M2 fixtures are dark decks styled by <a:pPr><a:defRPr>.
  {
    for (const [label, path] of [["legacy", LEGACY], ["modern", MODERN]]) {
      const b = await open(bytesFixture(path));
      const s0 = b.slides()[0].id;
      const runs = b.shapes(s0).filter((s) => s.editable).map((s) => s.paragraphs[0].runs[0]);
      test.assert(runs[1].size === 38 && runs[1].color === "#ffffff", `${label}: the title run is 38 pt white, not the 18 pt black default`);
      test.assert(runs[0].size === 15 && runs[0].color === "#d0e0e8" && runs[3].size === 13, `${label}: the other runs take their own paragraph size and light colour`);
    }
    const b = await open(bytesFixture(LEGACY));
    const doc = b.presentation();
    const s0 = b.slides()[0].id;
    const rawRun = doc.slides[0].shapes[2].tx.ps[0].rs[0];
    rawRun.color = "#FF8800"; rawRun.sz = 27;
    let r = b.shapes(s0).filter((s) => s.editable)[2].paragraphs[0].runs[0];
    test.assert(r.size === 27 && r.color === "#ff8800", "a run with its own colour and size keeps them over the paragraph's");
    rawRun.color = "accent1";
    r = b.shapes(s0).filter((s) => s.editable)[2].paragraphs[0].runs[0];
    test.assert(r.color === "#4f81bd", "a scheme colour name resolves through the deck's theme to lowercase hex");
    rawRun.color = { gradient: true };
    r = b.shapes(s0).filter((s) => s.editable)[2].paragraphs[0].runs[0];
    test.assert(r.color === null, "a colour that cannot be resolved is null, never a guess");
    // Inherited from the layout/master: a title placeholder on a new page has no size or colour of its own.
    const titleLayout = b.layouts().find((l) => l.kind === "title");
    const added = b.addSlide(s0, titleLayout.id);
    const ph = b.shapes(added.slide).find((s) => s.placeholder && s.editable);
    const inherited = ph.paragraphs[0].runs[0];
    test.assert(typeof inherited.size === "number" && inherited.size > 18 && /^#[0-9a-f]{6}$/.test(inherited.color), "a placeholder run inherits a real point size and a hex colour from layout/master/theme");
  }

  // 10. D7: a notes conversion is its own kind with the 1-based page it belongs to.
  {
    const b = await open(bytesFixture(LEGACY));
    const [, s1] = b.slides().map((s) => s.id);
    b.setNotes(s1, "页二的备注改了");
    const report = await b.exportReport();
    const item = report.converted.find((c) => c.id.startsWith("notes-edit:"));
    test.assert(item && item.kind === "notes" && item.what === "notes" && item.page === 2 && item.detail && item.slide, "a notes conversion reports kind 'notes', page 2 (1-based), the detail and the part it touches");
    test.assert(item.slideId === b.slides()[1].id, "the notes item carries the slide id so the first-save list can place it on its page");
    test.assert(!report.converted.some((c) => c.kind === "other"), "nothing is lumped into 'other' any more");
  }

  // 11. Objects the page editor cannot model: picture, chart, SmartArt, animation + transition (synthetic deck).
  {
    const original = bytesFixture(OBJECTS);
    const b = await open(original);
    const ids = b.slides().map((s) => s.id);
    const nonText = (i) => b.shapes(ids[i]).filter((s) => !s.editable);
    test.assert(ids.length === 4 && nonText(0).map((s) => s.kind).join() === "image" && nonText(1).map((s) => s.kind).join() === "chart" && nonText(2).map((s) => s.kind).join() === "group" && nonText(3).length === 0, "the deck opens: picture, chart and SmartArt are listed non-editable (SmartArt is named 'group' by the codec), page 4 has only text");
    test.assert([0, 1, 2].every((i) => b.shapes(ids[i]).filter((s) => s.editable).length === 4 && nonText(i)[0].editable === false), "each of those pages still has its four editable text boxes");
    test.assert(b.setRunText(ids[0], nonText(0)[0].id + ":0:0", "x").code === "NOT_EDITABLE", "a picture is refused with NOT_EDITABLE");
    test.assert(JSON.stringify(await b.exportReport()) === '{"converted":[],"lost":[]}' && (await b.save()).mode === "original-bytes", "unedited: nothing reported and the original bytes come back");
    // Edit the text on the animation page and save.
    const title = b.shapes(ids[3]).find((s) => s.editable && s.name === "TextBox 2").paragraphs[0].runs[0];
    const was = title.text;
    test.assert(b.setRunText(ids[3], title.id, "动画页：改过的标题").status === "ok", "a text edit elsewhere is accepted");
    const saved = await b.save();
    test.assert(saved.mode === "preserving-edit", "the edited deck saves through the preserving writer");
    const before = zipOf(original);
    const after = zipOf(saved.bytes);
    const same = (n) => before.getEntry(n) && after.getEntry(n) && Buffer.compare(before.getEntry(n).getData(), after.getEntry(n).getData()) === 0;
    const kept = ["ppt/media/image1.png", "ppt/charts/chart1.xml", "ppt/diagrams/data1.xml", "ppt/diagrams/layout1.xml", "ppt/diagrams/quickStyle1.xml", "ppt/diagrams/colors1.xml", "ppt/slideMasters/slideMaster1.xml", "ppt/theme/theme1.xml", "ppt/notesSlides/notesSlide1.xml", "ppt/notesSlides/notesSlide2.xml"];
    test.assert(kept.every(same), "the picture, chart part, the four SmartArt parts, master, theme and notes pages are byte-identical in the saved zip");
    test.assert(names(original).every((n) => names(saved.bytes).includes(n)) && names(saved.bytes).length === names(original).length, "the saved package has exactly the original's parts");
    const rels = (i) => part(saved.bytes, `ppt/slides/_rels/slide${i}.xml.rels`);
    test.assert(/relationships\/image" Target="..\/media\/image1.png"/.test(rels(1)) && /relationships\/chart" Target="..\/charts\/chart1.xml"/.test(rels(2)) && ["diagramData", "diagramLayout", "diagramQuickStyle", "diagramColors"].every((t) => rels(3).includes("relationships/" + t)), "the slides keep their relationships to the picture, chart and the four diagram parts");
    test.assert(/<p:pic>[\s\S]*r:embed="rIdObjPic"/.test(part(saved.bytes, "ppt/slides/slide1.xml")) && /uri="http:\/\/schemas.openxmlformats.org\/drawingml\/2006\/chart"/.test(part(saved.bytes, "ppt/slides/slide2.xml")) && /<dgm:relIds r:dm="rIdObjDm"/.test(part(saved.bytes, "ppt/slides/slide3.xml")), "the picture, chart and diagram frames are still on their pages");
    const orig4 = part(original, "ppt/slides/slide4.xml");
    const out4 = part(saved.bytes, "ppt/slides/slide4.xml");
    test.assert(out4.includes(orig4.slice(orig4.indexOf("<p:transition"), orig4.indexOf("</p:timing>") + 11)) && out4.includes("动画页：改过的标题") && !out4.includes(was), "the transition and the whole animation timing are kept byte-for-byte while the edited title is new");
    // What the encode path says: nothing converted or dropped for these object kinds.
    const clean = await b.exportReport();
    test.assert(clean.converted.length === 0 && clean.lost.length === 0, "exportReport() lists nothing converted or dropped for picture, chart, SmartArt, animation or transition (the codec keeps them)");
    // The report still names a real conversion on the same deck, by kind.
    b.setNotes(ids[1], "页二备注改写");
    const rep = await b.exportReport();
    test.assert(rep.lost.length === 0 && rep.converted.length === 1 && rep.converted[0].kind === "notes" && rep.converted[0].page === 2 && !rep.converted.some((c) => ["image", "chart", "group", "timing", "transition"].includes(c.kind)), "with a notes edit added, the only conversion listed is the notes (page 2); no object kind is converted or dropped");
    const back = await open((await b.save()).bytes);
    const bi = back.slides().map((s) => s.id);
    test.assert([0, 1, 2, 3].every((i) => back.shapes(bi[i]).filter((s) => !s.editable).map((s) => s.kind).join() === ["image", "chart", "group", ""][i]) && back.shapes(bi[3]).find((s) => s.name === "TextBox 2").paragraphs[0].runs[0].text === "动画页：改过的标题", "the saved deck reopens with the same non-editable objects and the edited text");
  }

  // 8. The vendored comments.js is the only codec file touched; the adapter keeps its legacy index API.
  {
    const old = await open(bytesFixture(PLAIN));
    test.assert(old.slideCount() === 2 && old.runs(0).length === 5 && old.notes(0).length > 0, "the index-based runs()/notes()/slideCount() still answer for older callers");
    const before = old.runs(0)[1].text;
    const r = old.setRunText(0, 1, "改");
    test.assert(r.before === before && old.runs(0)[1].text === "改" && old.isDirty() && old.canUndo(), "the legacy setRunText(index, index, text) form still works and is now one undo step");
  }

  const src = read("app/vendor/vibeoffice/lectern/comments.js");
  test.assert(/C\.entries = function/.test(src) && /cwAdds/.test(src), "comments.js owns reading and adding comments");

  test.finish();
};

run();
