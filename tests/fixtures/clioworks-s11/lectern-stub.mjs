// The lane M2-A Lectern adapter API (the M2 interface brief, section A), stubbed in exactly
// that shape for the ClioStage native surface contracts: slides / shapes / notes /
// layouts / pageSize, setRunText / setNotes / addSlide / duplicateSlide /
// deleteSlide / setLayout / resetLayout, comments / addComment / replyComment,
// isDirty / markSaved / getEditRevision (revision is the document state, so undoing
// back to the saved state is clean), undo / redo with labels, exportReport, save.
export function stubAdapter({ report, layouts = [{ id: "title", name: "标题页" }, { id: "text", name: "标题和内容" }] } = {}) {
  let revision = 0;
  let saved = 0;
  let seq = 0;
  let seqRev = 0;
  const past = [];
  const future = [];
  const calls = [];
  const deck = {
    slides: [
      { id: "s1", layoutId: "title", notes: "先讲诗集那四天。", shapes: [
        { id: "t1", kind: "text", name: "页标题", x: 40, y: 30, w: 600, h: 60, placeholder: "title", editable: true, paragraphs: [{ level: 0, runs: [{ id: "r1", text: "三千本书", size: 40 }, { id: "r2", text: "怎么装", size: 40 }] }] },
        { id: "c1", kind: "chart", name: "箱数图", x: 40, y: 120, w: 300, h: 200, editable: false, paragraphs: [{ runs: [{ id: "rc", text: "图表里的字" }] }] },
        { id: "p1", kind: "image", name: "地图", x: 400, y: 120, w: 200, h: 150, editable: false, paragraphs: [], imageUrl: "data:image/png;base64,iVBORw0KGgo=" },
      ] },
      { id: "s2", layoutId: "text", notes: "", shapes: [{ id: "t2", kind: "text", name: "正文", x: 40, y: 30, w: 600, h: 60, editable: true, paragraphs: [{ runs: [{ id: "r3", text: "新地址怎么走" }] }] }] },
      { id: "s3", layoutId: "text", notes: "", shapes: [] },
    ],
    comments: [
      { id: "cm1", slideId: "s1", anchorShapeId: "t1", author: "落落", text: "标题太长？", date: "2026-10-01", done: false, parentId: null, modern: true },
      { id: "cm2", slideId: "s1", author: "流水", text: "不长。", date: "2026-10-02", done: false, parentId: "cm1", modern: true },
      { id: "cm3", slideId: "s2", author: "旧版", text: "旧批注", date: "2026-09-01", done: false, parentId: null, modern: false },
    ],
  };
  const find = (id) => deck.slides.find((s) => s.id === id);
  const run = (slideId, runId) => find(slideId)?.shapes.flatMap((sh) => sh.paragraphs.flatMap((p) => p.runs)).find((r) => r.id === runId);
  const snapshot = () => JSON.parse(JSON.stringify(deck.slides));
  const commit = (label, slide, change) => {
    const before = snapshot();
    const out = change();
    if (out && out.status === "blocked") return out;
    // The revision is the document's state: undoing back to the saved state is clean again.
    past.push({ label, slide, before, after: snapshot(), revBefore: revision, revAfter: ++seqRev });
    future.length = 0;
    revision = seqRev;
    return out || { status: "ok", revision };
  };
  const travel = (from, to, side) => {
    const step = from.pop();
    if (!step) return { changed: [] };
    deck.slides = JSON.parse(JSON.stringify(step[side]));
    to.push(step);
    revision = side === "before" ? step.revBefore : step.revAfter;
    return { changed: [{ slide: step.slide }] };
  };
  return {
    calls,
    deck,
    slides: () => deck.slides.map((s, index) => ({ id: s.id, index, layoutId: s.layoutId, hidden: false, size: { w: 960, h: 540 } })),
    shapes: (slideId) => JSON.parse(JSON.stringify(find(slideId)?.shapes || [])),
    notes: (slideId) => find(slideId)?.notes ?? "",
    layouts: () => layouts,
    pageSize: () => ({ w: 960, h: 540 }),
    setRunText(slideId, runId, text) { calls.push(["setRunText", slideId, runId, text]); return commit("text", slideId, () => { run(slideId, runId).text = text; }); },
    setNotes(slideId, text) { calls.push(["setNotes", slideId, text]); return commit("notes", slideId, () => { find(slideId).notes = text; }); },
    addSlide(after, layoutId) {
      calls.push(["addSlide", after, layoutId]);
      const id = `n${++seq}`;
      return { ...commit("slide-add", id, () => { const at = deck.slides.findIndex((s) => s.id === after); deck.slides.splice(at + 1, 0, { id, layoutId, notes: "", shapes: [] }); }), slideId: id };
    },
    duplicateSlide(slideId) {
      calls.push(["duplicateSlide", slideId]);
      const id = `d${++seq}`;
      return { ...commit("slide-duplicate", id, () => { const at = deck.slides.findIndex((s) => s.id === slideId); deck.slides.splice(at + 1, 0, { ...JSON.parse(JSON.stringify(find(slideId))), id }); }), slideId: id };
    },
    deleteSlide(slideId) { calls.push(["deleteSlide", slideId]); return commit("slide-delete", slideId, () => { deck.slides = deck.slides.filter((s) => s.id !== slideId); }); },
    setLayout(slideId, layoutId) {
      calls.push(["setLayout", slideId, layoutId]);
      if (!layouts.some((l) => l.id === layoutId)) return { status: "blocked", code: "UNKNOWN_LAYOUT", message: "not in this deck" };
      return commit("layout", slideId, () => { find(slideId).layoutId = layoutId; });
    },
    resetLayout(slideId) { calls.push(["resetLayout", slideId]); return commit("layout", slideId, () => {}); },
    comments: (slideId) => deck.comments.filter((c) => !slideId || c.slideId === slideId),
    addComment(slideId, c) { calls.push(["addComment", slideId, c]); deck.comments.push({ id: `cm${deck.comments.length + 1}`, slideId, parentId: null, modern: true, done: false, ...c }); revision = ++seqRev; return { status: "ok", id: "x" }; },
    replyComment(rootId, c) {
      calls.push(["replyComment", rootId, c]);
      const root = deck.comments.find((x) => x.id === rootId);
      if (!root.modern) return { status: "blocked", code: "LEGACY_NO_REPLY" };
      deck.comments.push({ id: `cm${deck.comments.length + 1}`, slideId: root.slideId, parentId: rootId, modern: true, ...c });
      revision = ++seqRev;
      return { status: "ok" };
    },
    isDirty: () => revision !== saved,
    markSaved: (rev = revision) => { saved = rev; },
    getEditRevision: () => revision,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undoLabel: () => past.at(-1)?.label || "",
    redoLabel: () => future.at(-1)?.label || "",
    undo: () => travel(past, future, "before"),
    redo: () => travel(future, past, "after"),
    exportReport: () => (typeof report === "function" ? report() : report || { converted: [], lost: [] }),
    save: async () => ({ bytes: new ArrayBuffer(1), mode: revision ? "preserving-edit" : "original-bytes" }),
  };
}

