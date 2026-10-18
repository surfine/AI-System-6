// ClioWorks S11 M2 contract: the ClioStage native pptx surface (interface convention B).
//
// The surface's other-lane dependency — the slide-id Lectern adapter API of lane M2-A
// (slides / shapes / notes / setRunText / setNotes / page commands / comments / undo /
// isDirty-markSaved / exportReport) — is stubbed here in exactly that shape, and
// feature-detected in the product code. One part runs the REAL lectern-adapter through
// the API it has today (presentation / runs / notes(index) / setRunText(index, n) /
// save) and the REAL native host's saveNativeDocument: Express changes a run's text,
// ⌘S writes the package, and the stored bytes read back with the new text.
//
// What it holds:
//   the page is drawn from the model; an object the surface cannot model (chart,
//   group, table…) is listed read-only and never dropped; Express changes run text and
//   notes only — the existing ClioStage page commands are refused there with a reason
//   and run in full mode; mode never touches the document; dirty has one source (the
//   adapter); ⌘S claims the save, a second ⌘S while saving or while the first-save
//   question is open is refused, edits made during a save stay dirty; the first-save
//   list appears only when something is converted or lost, defaults to not saving, and
//   is asked once per session unless more would be lost; Edit › Undo is the adapter's
//   own history with human step names and brings the changed page forward; revert
//   swaps the adapter; the desk glue (menus, close box, quit, project switch, Edit menu
//   getter, native host, registry) routes to the surface.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import { stubAdapter } from "../fixtures/clioworks-s11/lectern-stub.mjs";

const test = createFeatureTest("clioworks-s11-m2-stage-native");
const fixture = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/slides-notes-comment-s11.pptx")));

function surfaceContext() {
  const ctx = makeContext();
  ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
  loadScripts(ctx, ["app/features/clio-stage-native.js"]);
  return ctx;
}

function openSession(ctx, adapter, { host, answer } = {}) {
  const lists = [];
  const alerts = [];
  const hooks = { answer: answer || null };
  const session = ctx.AISystem6ClioStageNative.createSession(adapter, {
    fileName: "搬家说明会.pptx",
    mountedName: "搬家说明会.pptx",
    host: host === undefined ? { save: async () => { adapter.markSaved?.(adapter.getEditRevision()); return { ok: true, mode: "preserving-edit", byteLength: 1 }; } } : host,
    confirmList: (r) => { lists.push(r); return hooks.answer ? hooks.answer(r) : "cancel"; },
    alertFailure: (r) => { alerts.push(r); },
  });
  return { session, lists, alerts, hooks };
}

// The surface drawn into a real DOM: the sign-off defects that only show once it is mounted.
async function signoffFixes() {
  let linkedom;
  try { linkedom = await import("linkedom"); } catch (error) { test.fail("linkedom is needed to mount the surface on a real DOM"); return; }
  const saved = { window: globalThis.window, document: globalThis.document };
  const lang = {};
  for (const l of ["en", "zh"]) {
    const lctx = { window: {} };
    vm.runInNewContext(read(`app/data/translations-${l}.js`), lctx);
    lang[l] = Object.values(lctx.window)[0];
  }
  const { window: win, document: doc } = linkedom.parseHTML('<html><body><div class="window" data-window="clioStage"><div class="clio-stage-pane"></div></div></body></html>');
  win.document = doc;
  win.t = (key, ...args) => (typeof lang.en[key] === "function" ? lang.en[key](...args) : lang.en[key] ?? key);
  globalThis.window = win;
  globalThis.document = doc;
  try {
    (0, eval)(read("app/features/clio-stage-native.js"));
    const api = win.AISystem6ClioStageNative;
    const report = { converted: [{ kind: "notes", page: 2 }, { kind: "notes" }], lost: [] };
    const adapter = stubAdapter({ report });
    const first = adapter.deck.slides[0].shapes[0].paragraphs[0].runs[0];
    first.color = "#ff0000";
    first.size = 28;
    const calls = { saved: 0 };
    win.AISystem6ClioWorks = { saveNativeDocument: async () => { calls.saved += 1; adapter.markSaved?.(adapter.getEditRevision()); return { ok: true }; } };
    test.assert((await api.open({ liveAdapter: adapter, mountedName: "d.pptx", fileName: "d.pptx" }, {})).ok === true, "the surface mounts on a real DOM");
    const surface = doc.querySelector(".clio-stage-native");
    const press = (el, key) => {
      const event = new win.Event("keydown", { bubbles: true, cancelable: true });
      Object.assign(event, { key, metaKey: true, keyCode: 0, isComposing: false });
      return el.dispatchEvent(event);
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    // D1: drawn as the file has it, never black 18px by default.
    const r1 = doc.querySelector('.csn-run[data-run-id="r1"]');
    const r2 = doc.querySelector('.csn-run[data-run-id="r2"]');
    test.assert(r1.style.getPropertyValue("--color") === "#ff0000" && r1.style.getPropertyValue("--size") === "28px", "D1: a run takes the colour and size (points) the adapter gives");
    test.assert(r2.style.getPropertyValue("--color") === "" && r2.style.getPropertyValue("--size") === "40px", "D1: no colour keeps the current ink; the size still follows the adapter");
    test.assert(/\.csn-run \{[^}]*font-size: var\(--size, 18px\)/.test(read("styles/84-clio-stage-native.css")), "D1: with no size the surface keeps its 18 default");

    // D5: the page list is named; object boxes with a label carry a role.
    test.assert(doc.querySelector(".csn-rail").getAttribute("aria-label") === lang.en.clio_stage_native_rail_label && lang.zh.clio_stage_native_rail_label, "D5: the page list has a translated accessible name");
    const boxes = [...doc.querySelectorAll(".csn-shape")];
    test.assert(boxes.length > 0 && boxes.every((box) => !box.getAttribute("aria-label") || box.getAttribute("role") === "group"), "D5: no aria-label sits on a role-less box");

    // D2: a comment dirties the document and the status bar says so.
    const receipt = () => doc.querySelector(".csn-receipt").textContent;
    test.assert(adapter.isDirty() === false && receipt() !== lang.en.clio_stage_native_receipt_dirty, `D2 setup: clean, not the dirty receipt (${JSON.stringify(receipt())})`);
    press(surface, "m");
    const windoidEl = () => doc.querySelector(".csn-comments-windoid");
    test.assert(!!windoidEl(), "⌘M opens the comments windoid");
    const field = windoidEl().querySelector("textarea.windoid-input");
    field.value = "加一条";
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
    windoidEl().querySelector(".btn.default").click();
    await settle();
    test.assert(adapter.isDirty() === true && receipt() === lang.en.clio_stage_native_receipt_dirty, `D2: after a comment the receipt shows the dirty line (${receipt()})`);

    // D4: the M1 placement rule, with the height left after a docked windoid.
    const place = (w, h) => {
      Object.defineProperty(surface, "clientWidth", { value: w, configurable: true });
      Object.defineProperty(surface, "clientHeight", { value: h, configurable: true });
      windoidEl()?.querySelector(".windoid-close").click();
      press(surface, "m");
      return surface.dataset.windoidPlacement;
    };
    test.assert(place(1200, 300) === "float-right" && place(800, 600) === "dock-below" && place(800, 380) === "swap" && place(500, 900) === "swap",
      "D4: wide floats, tall-enough docks, a short window swaps, a narrow one swaps");
    test.assert(/windoidPlacement\(width, /.test(read("app/features/clio-stage-native.js")) && /root\.AISystem6Windoid\.placement/.test(read("app/features/clio-stage-native.js")), "D4: the rule is the shared placement with the main area's height");
    const css = read("styles/84-clio-stage-native.css");
    test.assert(/\.csn-stage \{[^}]*min-height: [1-9]\d*px/.test(css) && /\.csn-main \{[^}]*overflow-y: auto/.test(css), "D4: the stage keeps a floor height and a short window scrolls the main area, not under the caption");

    // D3: --system-focus-outline is a whole outline value, never a colour slot.
    test.assert(!/outline:[^;]*var\(--system-focus-outline/.test(css.replace(/outline:\s*var\(--system-focus-outline[^;]*;/g, "")), "D3: the focus token is never inside another outline shorthand");
    test.assert((css.match(/outline: var\(--system-focus-outline/g) || []).length === 3, "D3: rail, object box and run editor use the token as a whole outline");
    test.assert(/\.csn-rail li\.is-current \{[^}]*box-shadow: inset/.test(css), "D3: the current-page frame no longer shares the outline slot with the focus ring");

    // D7: a speaker-notes conversion names its page in the first-save list.
    windoidEl()?.querySelector(".windoid-close").click();
    adapter.setRunText("s2", "r3", "改过的地址");
    press(surface, "s");
    await settle();
    const lines = [...doc.querySelectorAll(".csn-alert li")].map((li) => li.textContent);
    test.assert(lines.includes(lang.en.clio_stage_native_lost_notes_page(2)) && lines.length === 2 && lines[1] !== lines[0], `D7: the notes line names its page, and falls back without one (${JSON.stringify(lines)})`);
    test.assert(lang.zh.clio_stage_native_lost_notes_page(3) === "第 3 页的演讲备注会改成纯文字", "D7: zh wording");
    doc.querySelector('.csn-alert button[data-choice="cancel"]').click();
    await settle();

    // D8: one noun, and Reset Layout greys out with a reason on a page with no placeholders.
    test.assert(lang.zh.clio_stage_reset_layout === "重置版式" && lang.zh.previous_slide === "上一页" && lang.zh.next_slide === "下一页"
      && lang.en.previous_slide === "Previous Slide" && lang.en.next_slide === "Next Slide" && lang.en.clio_stage_reset_layout === "Reset Layout", "D8: the 演示 menu names (shared with the presentation menu)");
    const src = read("app/features/clio-stage-native.js");
    test.assert(/'previous_slide'/.test(src) && /'next_slide'/.test(src) && /'clio_stage_reset_layout'/.test(src) && !/clio_stage_native_cmd_(prev|next|reset_layout)/.test(src), "D8: the surface and the presentation menu share one set of corrected labels");
    press(surface, "e");
    const rail = () => [...doc.querySelectorAll(".csn-rail li")];
    test.assert(api.commandState("slide.reset-layout").enabled === true, "D8: a page with a placeholder can reset its layout");
    rail()[2].click();
    const none = api.commandState("slide.reset-layout");
    test.assert(none.enabled === false && none.reason === lang.en.clio_stage_native_reason_no_placeholder && lang.zh.clio_stage_native_reason_no_placeholder, `D8: no placeholders: grey with a reason (${none.reason})`);

    // D9: no doubled full stop in the text label.
    for (const l of ["en", "zh"]) {
      const label = lang[l].clio_stage_native_run_label("同一工程，三次记录。");
      test.assert(!/[。.]{2}/.test(label) && label.includes("三次记录"), `D9 ${l}: ${label}`);
    }
    test.assert(!/[。.]{2}/.test(lang.zh.clio_stage_native_run_label("Done.")) && lang.zh.clio_stage_native_run_label("没有句号").includes("没有句号。按回车"), "D9: text without a stop is unchanged");
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    if (saved.window === undefined) delete globalThis.window;
    if (saved.document === undefined) delete globalThis.document;
  }
}

const run = async () => {
  const ctx = surfaceContext();
  test.assert(typeof ctx.AISystem6ClioStageNative?.open === "function" && typeof ctx.AISystem6ClioStageNative.close === "function"
    && typeof ctx.AISystem6ClioStageNative.current === "function" && typeof ctx.AISystem6ClioStageNative.hasUnsaved === "function"
    && typeof ctx.AISystem6ClioStageNative.editHistory === "function", "the surface installs open / close / current / hasUnsaved / editHistory");
  test.assert(ctx.AISystem6ClioStageNative.current() === null && ctx.AISystem6ClioStageNative.editHistory() === null && ctx.AISystem6ClioStageNative.hasUnsaved() === false,
    "nothing mounted: no session, no history, nothing unsaved");

  // 1. The page comes from the model; nothing it cannot model is dropped.
  {
    const adapter = stubAdapter();
    const { session } = openSession(ctx, adapter);
    test.assert(session.mode === "express" && session.slideId === "s1" && !session.isDirty(), "a presentation opens in Express on its first page, not dirty");
    test.assert(session.slides().map((s) => s.id).join(",") === "s1,s2,s3" && session.slideTitle("s1") === "三千本书怎么装", "page order and titles come from the model");
    const kinds = session.shapes().map((sh) => `${sh.kind}:${sh.editable}`).join(",");
    test.assert(kinds === "text:true,chart:false,image:false", `every object is on the page, the chart and picture read-only (${kinds})`);
    test.assert(session.notes() === "先讲诗集那四天。", "the current page's notes are read from the model");
  }

  // 2. Express: run text and notes; read-only objects and page commands are refused with a reason.
  {
    const adapter = stubAdapter();
    const { session } = openSession(ctx, adapter);
    const chartRun = session.editRun("s1", "rc", "改图表");
    test.assert(chartRun.status === "blocked" && chartRun.code === "READ_ONLY_OBJECT" && session.receipt.key === "clio_stage_native_receipt_read_only" && adapter.calls.length === 0,
      "a run inside a chart is refused with a receipt, never changed");
    const same = session.editRun("s1", "r1", "三千本书");
    test.assert(same.status === "ok" && same.code === "UNCHANGED" && adapter.calls.length === 0 && !session.isDirty(), "leaving a run as it was is not an edit");
    const ok = session.editRun("s1", "r1", "三千多本书");
    test.assert(ok.status === "ok" && adapter.calls[0].join("|") === "setRunText|s1|r1|三千多本书" && session.isDirty() && session.receipt.key === "clio_stage_native_receipt_dirty",
      "Express changes one run through the adapter (slide id, run id), and dirty is the adapter's");
    const notes = session.editNotes("s1", "先讲诗集，再讲标签。");
    test.assert(notes.status === "ok" && adapter.calls[1][0] === "setNotes" && session.notes() === "先讲诗集，再讲标签。", "Express changes the speaker notes through setNotes");
    for (const id of ["slide.add", "slide.duplicate", "slide.delete", "slide.layout", "slide.reset-layout", "page.check"]) {
      const state = session.commandState(id);
      test.assert(state.enabled === false && state.reason === "clio_stage_native_reason_express", `Express refuses ${id} with a reason`);
    }
    const refused = session.slideCommand("slide.add");
    test.assert(refused.status === "blocked" && !adapter.calls.some((c) => c[0] === "addSlide") && session.receipt.kind === "blocked", "a page command in Express is a receipt, not a change");
  }

  // 3. Mode never touches the document; page and selection stay.
  {
    const adapter = stubAdapter();
    const { session } = openSession(ctx, adapter);
    session.setSlide("s2");
    session.select("t2", "r3");
    session.editRun("s2", "r3", "新地址");
    const rev = adapter.getEditRevision();
    session.toggleMode();
    test.assert(session.mode === "full" && adapter.getEditRevision() === rev && session.isDirty() && session.slideId === "s2" && session.selection?.shapeId === "t2",
      "⌘E to full: no save, no dirty change, same page and selection");
    session.toggleMode();
    test.assert(session.mode === "express" && adapter.getEditRevision() === rev, "⌘E back to Express is the same switch");
  }

  // 4. Full mode: the existing ClioStage page commands on the native model.
  {
    const adapter = stubAdapter();
    const { session } = openSession(ctx, adapter);
    session.setMode("full");
    session.slideCommand("slide.add");
    test.assert(adapter.calls.at(-1).join("|") === "addSlide|s1|title" && session.slideId === "n1" && session.slides().length === 4,
      "加页 adds after the current page, in its layout, and goes to the new page");
    session.slideCommand("slide.duplicate");
    test.assert(adapter.calls.at(-1)[0] === "duplicateSlide" && session.slideId === "d2", "复制页 duplicates the current page and shows the copy");
    session.slideCommand("slide.delete");
    test.assert(adapter.calls.at(-1).join("|") === "deleteSlide|d2" && session.slides().length === 4 && session.slideId === "s2", "删除页 deletes it and lands on the page that took its place");
    session.slideCommand("slide.layout", "title");
    test.assert(adapter.calls.at(-1).join("|") === "setLayout|s2|title" && session.currentSlide().layoutId === "title", "版式 switches to one of this deck's own layouts");
    const foreign = session.slideCommand("slide.layout", "nope");
    test.assert(foreign.status === "blocked" && session.receipt.key === "clio_stage_native_receipt_refused", "a refusal from the model is a receipt");
    const noHolders = session.slideCommand("slide.reset-layout");
    test.assert(noHolders.status === "blocked" && !adapter.calls.some((call) => call[0] === "resetLayout") && session.commandState("slide.reset-layout").reason.length > 0,
      "重置版式 on a page with no placeholders is refused with a reason, not run");
    session.setSlide("s1");
    // the real adapter keeps the key with an undefined value when <p:ph> has no type (the stub's JSON clone would drop it)
    const stubShapes = adapter.shapes;
    adapter.shapes = (id) => stubShapes(id).map((sh) => ("placeholder" in sh ? { ...sh, placeholder: undefined } : sh));
    test.assert(session.commandState("slide.reset-layout").enabled === true, "重置版式 counts an untyped placeholder (real adapter leaves its type undefined)");
    session.slideCommand("slide.reset-layout");
    test.assert(adapter.calls.at(-1)[0] === "resetLayout", "重置版式 resets a page that has placeholders to its layout");
    session.setSlide("s2");
    const one = openSession(ctx, (() => { const a = stubAdapter({ layouts: [{ id: "only", name: "唯一" }] }); a.deck.slides.splice(1); return a; })()).session;
    one.setMode("full");
    test.assert(one.commandState("slide.delete").enabled === false && one.commandState("slide.delete").reason === "clio_stage_native_reason_last_slide", "the only page cannot be deleted, and says so");
    test.assert(one.commandState("slide.layout").reason === "clio_stage_native_reason_one_layout", "a deck with one layout says it has no other");
    const ids = session.commands().map((c) => c.id).join(",");
    test.assert(/slide\.add.*slide\.duplicate.*slide\.delete.*slide\.layout.*slide\.reset-layout/.test(ids) && ids.includes("comments.open") && !ids.includes("file.revert"),
      `wired commands are listed; a host without revert lists no revert (${ids})`);
    const bare = openSession(ctx, Object.assign({}, adapter, { addSlide: undefined, comments: undefined })).session;
    const bareIds = bare.commands().map((c) => c.id);
    test.assert(!bareIds.includes("slide.add") && !bareIds.includes("comments.open"), "a command the adapter does not carry is not listed at all");
  }

  // 5. Page turns.
  {
    const { session } = openSession(ctx, stubAdapter());
    test.assert(session.commandState("page.prev").enabled === false && session.commandState("page.next").enabled === true, "on page 1: ⌘[ is grey, ⌘] is live");
    session.step(1); session.step(1);
    test.assert(session.slideId === "s3" && session.commandState("page.next").reason === "clio_stage_native_reason_last_page" && session.step(1) === false, "⌘] stops at the last page");
  }

  // 6. ⌘S: claimed before encoding; a second ⌘S is refused; typing during a save stays dirty.
  {
    const adapter = stubAdapter();
    let release;
    const host = { save: (name) => new Promise((resolve) => { release = () => { adapter.markSaved(encoded); resolve({ ok: true, mode: "preserving-edit", byteLength: 9, name }); }; }) };
    let encoded = 0;
    const realSave = host.save;
    host.save = (name) => { encoded = adapter.getEditRevision(); return realSave(name); };
    const { session } = openSession(ctx, adapter, { host });
    const clean = await session.save();
    test.assert(clean.status === "clean" && session.receipt.key === "clio_stage_native_receipt_nothing", "⌘S on a clean presentation writes nothing and says so");
    session.editRun("s1", "r2", "怎样装");
    const first = session.save();
    await Promise.resolve();
    test.assert(session.saving === true && session.receipt.key === "clio_stage_native_receipt_saving", "the save is claimed before anything is encoded");
    const second = await session.save();
    test.assert(second.status === "blocked" && second.code === "SAVE_IN_FLIGHT", "a second ⌘S while saving is refused");
    await new Promise((r) => setTimeout(r, 0));
    session.editRun("s1", "r1", "三千多本书");
    release();
    const done = await first;
    test.assert(done.status === "ok" && session.isDirty() && session.receipt.key === "clio_stage_native_receipt_saved_older", "an edit typed during the save stays dirty: 「已存储较早的修改，还有新修改」");
  }

  // 7. The first-save list: only when something is converted or lost, default not saving, once per session.
  {
    const adapter = stubAdapter({ report: () => ({ converted: [], lost: [{ slideId: "s1", kind: "transition" }] }) });
    const saves = [];
    const host = { save: async (name) => { saves.push(name); adapter.markSaved(adapter.getEditRevision()); return { ok: true }; } };
    const { session, lists, hooks } = openSession(ctx, adapter, { host });
    session.editRun("s1", "r1", "一");
    const cancelled = await session.save();
    test.assert(cancelled.status === "cancelled" && lists.length === 1 && saves.length === 0 && session.isDirty(), "the list is asked first; its default (cancel) writes nothing");
    hooks.answer = () => "save";
    const accepted = await session.save();
    test.assert(accepted.status === "ok" && saves.length === 1 && lists.length === 2, "accepting the list saves");
    session.editRun("s1", "r1", "二");
    await session.save();
    test.assert(lists.length === 2 && saves.length === 2, "the same losses are not asked about twice in one session");
    const plain = openSession(ctx, stubAdapter());
    plain.session.editRun("s1", "r1", "三");
    await plain.session.save();
    test.assert(plain.lists.length === 0, "nothing converted or lost: no list at all");
  }

  // 8. A failed save keeps the edits and says so.
  {
    const adapter = stubAdapter();
    const { session, alerts } = openSession(ctx, adapter, { host: { save: async () => ({ ok: false, reason: "encode-failed" }) } });
    session.editRun("s1", "r1", "四");
    const out = await session.save();
    test.assert(out.status === "failed" && session.isDirty() && alerts.length === 1 && session.receipt.key === "clio_stage_native_receipt_failed", "a failed save stays dirty, alerts once and leaves a receipt");
  }

  // 9. Edit › Undo is the adapter's own history, with human step names; the changed page comes forward.
  {
    const adapter = stubAdapter();
    const { session } = openSession(ctx, adapter);
    const history = session.editHistory;
    test.assert(history.canUndo() === false && history.undoLabel() === "", "nothing to undo on open");
    session.editRun("s1", "r1", "改了");
    session.setSlide("s3");
    test.assert(history.canUndo() && history.undoLabel() === "clio_stage_native_step_text", "the Edit menu names the step: 「文字编辑」");
    history.undo();
    test.assert(session.slideId === "s1" && session.shapes()[0].paragraphs[0].runs[0].text === "三千本书" && !session.isDirty(), "undo restores the run, brings its page forward and comes back clean");
    test.assert(history.canRedo() && history.redoLabel() === "clio_stage_native_step_text", "redo is offered with the same name");
  }

  // 10. Revert swaps the adapter for the one the host re-read.
  {
    const adapter = stubAdapter();
    const fresh = stubAdapter();
    const record = { liveAdapter: adapter };
    const session = ctx.AISystem6ClioStageNative.createSession(adapter, {
      mountedName: "m.pptx",
      host: { save: async () => ({ ok: true }), revert: async () => { record.liveAdapter = fresh; return { ok: true, adapter: fresh }; } },
      readAdapter: () => record.liveAdapter,
    });
    test.assert(session.commandState("file.revert").enabled === false, "nothing to revert on a clean presentation");
    session.editRun("s1", "r1", "改");
    const out = await session.revert();
    test.assert(out.status === "ok" && session.adapter === fresh && !session.isDirty() && session.receipt.key === "clio_stage_native_receipt_reverted", "revert rebinds to the re-read adapter and is clean");
  }

  // 11. Comments, as data: roots with replies.
  {
    const adapter = stubAdapter();
    const roots = ctx.AISystem6ClioStageNative.groupComments(adapter.comments("s1"));
    test.assert(roots.length === 1 && roots[0].item.id === "cm1" && roots[0].replies.map((r) => r.id).join() === "cm2", "a reply sits under its root");
  }

  // 12. The real adapter, through the API it has today: Express changes a run, ⌘S writes it.
  {
    const lctx = makeContext();
    lctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
    loadScripts(lctx, ["app/vendor/clioworks-v3/lectern-adapter.js", "app/vendor/clioworks-v3/native-host.js", "app/features/clio-stage-native.js"]);
    let working = fixture.slice();
    const lists = [];
    const record = { id: "doc-1", fileName: "slides-notes-comment-s11.pptx", mountedName: "slides-notes-comment-s11.pptx", format: "pptx", projectId: "" };
    lctx.AISystem6NativeBinaries = {
      recordFor: (name) => (name === record.mountedName ? record : null),
      workingBytes: () => working,
      setWorkingBytes: (name, bytes) => { working = new Uint8Array(bytes); },
    };
    lctx.__bytes = fixture;
    record.liveAdapter = await vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__bytes.slice().buffer, { name: 'slides-notes-comment-s11.pptx' })", lctx);
    const session = lctx.AISystem6ClioStageNative.createSession(record.liveAdapter, {
      fileName: record.fileName,
      mountedName: record.mountedName,
      host: { save: (name) => lctx.AISystem6ClioWorks.saveNativeDocument(name) },
      confirmList: (report) => { lists.push(report); return "save"; },
    });
    const first = session.slides()[0];
    const title = session.shapes(first.id).find((sh) => sh.paragraphs.some((p) => p.runs.some((r) => r.text === "一次导出：42 秒")));
    test.assert(session.slides().length === 2 && !!title && title.editable === true, "the real fixture's pages and text boxes are read through the index API");
    // Integrated with M2-A: the real adapter now has setNotes, so notes are editable.
    test.assert(session.notes(first.id).startsWith("演讲备注") && session.notesEditable() === true, "with the real M2 adapter the speaker notes are editable");
    const notes = session.editNotes(first.id, "演讲备注（改过）");
    test.assert(notes.status === "ok" && session.notes(first.id) === "演讲备注（改过）", `a notes edit goes through setNotes (${notes.status} ${notes.code || ""})`);
    const runId = title.paragraphs[0].runs[0].id;
    const edit = session.editRun(first.id, runId, "一次导出用了 42 秒");
    test.assert(edit.status === "ok" && session.isDirty() && record.liveAdapter.runs(0)[1].text === "一次导出用了 42 秒", "Express changes that one run through setRunText(index, runIndex)");
    const saved = await session.save();
    test.assert(lists.length === 1 && (lists[0].converted.length + lists[0].lost.length) > 0, "editing the notes surfaces the first-save list (the notes are rewritten as plain text)");
    test.assert(saved.status === "ok" && saved.mode === "preserving-edit" && !session.isDirty(), `⌘S writes through the real native host and leaves the deck clean (${saved.status} ${saved.mode} ${saved.code || ""})`);
    const reread = await vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__stored.slice().buffer, { name: 'reread.pptx' })", Object.assign(lctx, { __stored: working }));
    test.assert(reread.runs(0)[1].text === "一次导出用了 42 秒" && reread.runs(0)[0].text === "ClioWorks · 合成格式夹具" && reread.notes(0) === "演讲备注（改过）",
      "the stored package reads back with the new run text and the new notes; the other runs are unchanged");
    test.assert(saved.byteLength > 0 && !lctx.AISystem6ClioStageNative.current(), "(control) the headless session never mounted anything");
  }

  // 13. The desk glue routes to the surface (source facts; the lazy loader and manifests own the rest).
  {
    const host = read("app/vendor/clioworks-v3/native-host.js");
    test.assert(/isPptx[\s\S]*ensureClioStageNativeModule[\s\S]*presentationSurface\(\)[\s\S]*surface\.open\(record, \{ mountedName, fileName: record\.fileName \}\)/.test(host),
      "native host: a pptx is mounted into ClioStage by the native surface");
    test.assert(/surfaceGlobal = isXlsx \? window\.AISystem6ClioChartWorkbook : isPptx \? window\.AISystem6ClioStageNative/.test(host), "native host: the same pptx opened twice is one session (no re-parse)");
    const stage = read("app/features/clio-stage.js");
    test.assert(/registerEditHistory\("clioStage", \(\) => \(window\.AISystem6ClioStageNative\?\.current\?\.\(\) \? window\.AISystem6ClioStageNative\.editHistory/.test(stage),
      "Edit › Undo in ClioStage is the mounted presentation's history");
    const wm = read("app/core/window-manager.js");
    test.assert((wm.match(/clioStage: window\.AISystem6ClioStageNative[^}]*\}\[(name|appId)\]/g) || []).length === 2, "the close box and Quit ask the mounted presentation first");
    test.assert(/AISystem6ClioStageNative[^\]]*\]\) if \(native\?\.current\?\.\(\) && await native\.close\(\) === "cancelled"\) return false;/.test(read("app/core/desktop-runtime.js")),
      "switching project asks the mounted presentation first");
    const registry = read("app/core/application-registry.js");
    test.assert(/\["clioWorksLectern", "clioworks_lectern_label", "pptx", "clioStage"\]/.test(registry) && /AISystem6ClioWorks\.dispatchIntent\(file, context\)/.test(registry),
      "the registry opens a pptx in ClioStage through the host's intent split");
    test.assert(/ensureClioStageNativeModule = createLazyModuleLoader\("AISystem6ClioStageNative", \["app\/features\/clio-stage-native\.js"\]/.test(read("app/core/config.js")), "the module has its own lazy loader row");
  }

  // 14. Every string is translated, in both languages, and none says 「ClioWorks」.
  {
    const source = read("app/features/clio-stage-native.js");
    const used = [...new Set([...source.matchAll(/'(clio_stage_native_[a-z_]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith("_")))];
    for (const lang of ["en", "zh"]) {
      const lctx = { window: {} };
      vm.runInNewContext(read(`app/data/translations-${lang}.js`), lctx);
      const table = Object.values(lctx.window)[0];
      const missing = used.filter((k) => table[k] == null);
      test.assert(missing.length === 0, `${lang}: every surface string is translated (${used.length} keys)${missing.length ? ` — missing ${missing.join(", ")}` : ""}`);
      const shown = used.map((k) => (typeof table[k] === "function" ? table[k]("x", "y", "z") : table[k])).join("\n");
      test.assert(!/ClioWorks/.test(shown), `${lang}: no 「ClioWorks」 on screen`);
    }
  }

  // 15. M2 sign-off fixes, on a real DOM (linkedom): D1 D2 D3 D4 D5 D7 D8 D9.
  await signoffFixes();

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
