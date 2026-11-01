// ClioWorks S11 M3 contract: the ClioWrite window on the real desk.
//
// Boots the real eager module set and drives the seams outside the surface module:
//   - admission: one row admits the clioWrite window (S11-C4: built by its module, then named),
//     its loader, its 1-bit icon and its place in Applications ▸ 创作 beside ClioChart and ClioStage;
//   - the opener draws an empty window that says how a .docx gets there (no New, S11-9);
//   - the menu bar (S5): 文件 · 编辑 · 插入 · 查看 · 格式 · 表格 · 审阅 · 特别 with the document's own
//     rows, grey with the surface's reason, ⌘S ⌘M ⌘B shown;
//   - one editing mode (D1): no mode rows, no ⌘E switch; the title bar names the file only (S1);
//   - Edit › Undo in ClioWrite is the document's own history (registerEditHistory getter);
//   - the close box, Quit and switching project ask about unsaved edits, Cancel aborts;
//     a clean document closes without a question.
// The upstream contentEditable layer needs a real layout engine, so it is a stand-in here with
// the shape the surface calls; the real layer runs in the browser check and the real adapter in
// clioworks-s11-m3-write-surface.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("clioworks-s11-m3-write-desk");
const isShimNode = (value) => !!value && typeof value === "object" && (typeof value.tagName === "string" || typeof value.nodeType === "number");

const vm = createAppBootVm({ location: { href: "http://localhost/", reload: () => {}, search: "" } });
Object.defineProperty(vm.window.Node, Symbol.hasInstance, { value: isShimNode });
const createElement = vm.document.createElement;
vm.document.createElement = (tag) => {
  const el = createElement(tag);
  if (typeof el.getClientRects !== "function") el.getClientRects = () => [];
  return el;
};
await vm.settleBoot();
const w = vm.window;
const doc = vm.document;

// A Quire-shaped adapter: one dirty source, one history, the narrow write face.
function stubAdapter() {
  const model = { main: { blocks: [] }, sect: { pgW: 612, ml: 72, mr: 72 } };
  let rev = 0;
  let saved = 0;
  const undo = [];
  const calls = [];
  const edit = (label) => { rev += 1; undo.push(label); };
  return {
    calls,
    document: () => model,
    paragraphs: () => [{ id: "1", text: "旧书店搬家记", headingLevel: 0, list: null, runs: [] }],
    blocks: () => [{ kind: "paragraph", id: "1", text: "旧书店搬家记" }],
    isDirty: () => rev !== saved,
    getEditRevision: () => rev,
    markSaved: (r) => { saved = Number.isInteger(r) ? r : rev; },
    syncExternal: () => false,
    edit,
    canUndo: () => undo.length > 0,
    canRedo: () => false,
    undoLabel: () => undo[undo.length - 1] || "",
    redoLabel: () => "",
    undo: () => { calls.push(["undo"]); undo.pop(); rev += 1; return { changed: [] }; },
    redo: () => ({ changed: [] }),
    setHeading: (id, level) => { calls.push(["setHeading", id, level]); edit(`Heading ${level}`); return { paragraphId: id, level }; },
    toggleRunStyle: () => ({}),
    setList: () => ({}),
    comments: () => [],
    addComment: () => ({ id: "0" }),
    replyComment: () => ({}),
    setCommentDone: () => ({}),
    exportReport: async () => ({ converted: [], lost: [] }),
  };
}

// The upstream editing layer's shape, as far as the surface calls it.
function stubEditorLayer() {
  const bus = { on() {}, emit() {} };
  const layout = {
    root: null,
    view: "print",
    mount(scroller) { this.root = doc.createElement("div"); scroller.append(this.root); },
    render() {},
  };
  const caret = { p: { id: "1", runs: [] }, o: 0 };
  const ed = {
    sel: null, objSel: null, composing: false,
    init() {}, syncSel() {}, readDom: () => null, range() { return [caret, caret]; }, setSel(a) { this.sel = { a, f: a }; }, restoreDom() {},
  };
  const D = { doc: null, firstPara: () => null, pos: (p, o) => ({ p, o }) };
  return { bus, layout, ed, D };
}

const run = async () => {
  // ---- admission, icon, Applications ----
  const row = vm.run('window.AISystem6Admissions.windowRecord("clioWrite")');
  test.assert(row && row.app === "clioWrite" && row.api === "AISystem6ClioWrite" && row.command === "open-clio-write" && row.applicationGroup === "create" && row.appIcon === "clioWrite",
    "one admission row: the clioWrite window, its opener, its global and its 创作 group");
  test.assert(vm.run('typeof ensureClioWriteModule === "function"'), "config.js builds the loader the row names");
  const createRow = vm.run('window.AISystem6Admissions.applicationItems("create").map((item) => item.action).join(",")');
  test.assert(/open-clio-chart.*open-clio-stage,open-clio-write/.test(createRow), `Applications ▸ 创作 lists ClioWrite right after ClioStage, beside ClioChart (${createRow})`);
  const icon = vm.run('renderSystemIcon("clioWrite", { size: "large" })');
  test.assert(/data-system-icon="clioWrite"/.test(icon) && /assets\/themes\/classic\/icons\/clioWrite-(?:mask-)?32\.svg/.test(icon) && !/icons\/document-/.test(icon),
    "ClioWrite renders its own era icon family under its own id (Classic art clioWrite-32), not the generic document");
  test.assert(!doc.querySelector('[data-window="clioWrite"]'), "before its module loads there is no clioWrite window (S11-C4)");

  // ---- the window, built by its module; the empty state ----
  await vm.run("ensureClioWriteModule()");
  test.assert(!!w.AISystem6ClioWrite && typeof w.AISystem6ClioWrite.open === "function", "the module loads through its own lazy loader");
  const win = doc.querySelector('[data-window="clioWrite"]');
  test.assert(!!win && vm.run('getWindowRecord("clioWrite")?.builtByModule') === true && vm.run('registeredWindowAppId("clioWrite")') === "clioWrite",
    "the module builds the clioWrite window, and the registry knows it as built by its module");
  vm.run('openWindow("clioWrite")');
  await vm.waitFor(() => !win.classList.contains("is-hidden"));
  const empty = win.querySelector(".cw-empty");
  test.assert(!!empty && !empty.hidden && /clio_write_empty|docx|Word|文稿/.test(empty.textContent), "opened from Applications with no document: it says how a .docx gets here");

  // ---- mount a document ----
  w.ClioWorksQuireAdapter = { loadEditor: async () => stubEditorLayer() };
  const asked = [];
  const answers = [];
  w.showSystemModal = async (message, kind, options) => { asked.push({ message, kind, options }); return answers.length ? answers.shift() : "cancel"; };
  const saves = [];
  w.AISystem6ClioWorks = { saveNativeDocument: async (name) => { saves.push(name); return { ok: true }; }, revertNativeDocument: async () => ({ ok: true }) };
  const menuRow = (action) => doc.querySelector(`[data-app-menu] [data-action="${action}"]`);
  const rowState = (action) => {
    const el = menuRow(action);
    return el ? { disabled: !!el.disabled, checked: el.classList.contains("is-checked"), help: el.dataset.balloonHelp || "", shortcut: el.dataset.shortcut || "", text: el.textContent } : null;
  };
  const refresh = () => vm.run("updateMenuState()");
  const mount = async (name = "旧书店搬家记.docx") => {
    const adapter = stubAdapter();
    const record = { liveAdapter: adapter, mountedName: name, fileName: name };
    const out = await w.AISystem6ClioWrite.open(record, {});
    vm.run('focusWindow(getWindow("clioWrite"))');
    vm.run('renderAppMenuBar("clioWrite", { force: true })');
    refresh();
    return { adapter, out, record };
  };
  let { adapter, out, record } = await mount();
  test.assert(out.ok === true && w.AISystem6ClioWrite.current()?.mountedName === "旧书店搬家记.docx" && !("mode" in w.AISystem6ClioWrite.current()) && empty.hidden,
    "a docx mounts into the ClioWrite window, in its one editing mode (no mode to report)");
  const again = await w.AISystem6ClioWrite.open(record, {});
  test.assert(again.ok === true && again.reason === "focused", "the same file opened again is the same session (S11-18)");
  test.assert(win.querySelector("#clio-write-title")?.textContent === "旧书店搬家记.docx", "S1: the title bar names the document only (no 「ClioWrite Express」, no view)");

  // (The document bar and the status bar's insides are held in clioworks-s11-m3-write-events,
  // whose linkedom DOM builds them; this desk's shim nodes cannot nest the window's parts.)

  // S5: the menu bar's order — the same six-plus-one shape as ClioChart and ClioStage.
  const menuIds = [...doc.querySelectorAll(".menu-bar > [data-app-menu]")].map((el) => el.dataset.menuId).filter((id) => id !== "window");
  test.assert(menuIds.join(" ") === "file edit insert view format table review special", `menus in order 文件 · 编辑 · 插入 · 查看 · 格式 · 表格 · 审阅 · 特别 (${menuIds.join(" ")})`);
  const rowsOf = (id) => [...doc.querySelectorAll(`.menu-bar > [data-menu-id="${id}"] [data-action]`)].map((el) => el.dataset.action);
  test.assert(rowsOf("review").slice(0, 4).join() === "clio-write-revisions,clio-write-comment,clio-write-compare,clio-write-word-count",
    `审阅 carries 修订 · 批注 · 比较 · 字数统计 in that order (${rowsOf("review").join()})`);
  test.assert(!rowsOf("view").some((action) => /mode/.test(action)) && !doc.querySelector('[data-action^="clio-write-mode"]'), "no mode rows anywhere in the menu bar");

  for (const action of ["clio-write-save", "clio-write-revert", "clio-write-undo", "clio-write-redo", "clio-write-comment", "clio-write-heading-1", "clio-write-heading-2", "clio-write-heading-3", "clio-write-body", "clio-write-bold", "clio-write-italic", "clio-write-underline", "clio-write-bullets", "clio-write-numbering", "clio-write-table-row-above", "clio-write-table-delete-column", "clio-write-insert-image", "clio-write-replace-image"]) {
    test.assert(!!menuRow(action), `the menus list ${action}`);
  }
  let save = rowState("clio-write-save");
  test.assert(save.disabled === true && save.help === w.AISystem6ClioWrite.commandState("file.save").reason && save.help.length > 0, `a clean document: 存储 is grey with the reason (${save.help})`);
  test.assert(save.shortcut === "⌘S" && rowState("clio-write-comment").shortcut === "⌘M" && rowState("clio-write-bold").shortcut === "⌘B",
    "the rows show ⌘S, ⌘M and ⌘B");
  test.assert(!/express_format|完整编辑|Full Editing/.test(rowState("clio-write-heading-1").help), "the Format rows never point to a mode");
  test.assert(rowState("clio-write-table-row-above").disabled === true && rowState("clio-write-table-row-above").help.length > 0,
    `outside a table the 表格 rows are grey and say why (${rowState("clio-write-table-row-above").help})`);
  test.assert(rowState("clio-write-view-flow").checked === true && rowState("clio-write-view-pages").checked === false, "查看 ticks 流式视图");

  // ---- Edit › Undo is the document's own history ----
  adapter.edit("Typing");
  w.AISystem6ClioWrite.editHistory() && refresh();
  test.assert(vm.run('editHistoryFor("clioWrite")?.undoLabel?.()') === "clio_write_step_typing" && rowState("clio-write-save").disabled === false,
    "an edited document: Edit › Undo (the window's history getter) names 「键入」 and 存储 turns live");
  test.assert(/clio_write_step_typing|键入|Typing/.test(rowState("clio-write-undo").text), `the Undo row names the step (${rowState("clio-write-undo").text.trim()})`);

  // ---- ⌘E switches nothing (D1): the key is not taken, nothing saves, dirty stands ----
  const key = (init) => {
    const scroller = win.querySelector(".cw-scroller");
    const event = new w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    scroller.dispatchEvent(event);
    return event;
  };
  const mac = vm.run('typeof shortcutUsesCommandKey === "function" ? shortcutUsesCommandKey() : true');
  const cmd = (k) => (mac ? { key: k, metaKey: true } : { key: k, ctrlKey: true });
  if (typeof w.KeyboardEvent === "function") {
    const eKey = key(cmd("e"));
    test.assert(!eKey.defaultPrevented && !("mode" in w.AISystem6ClioWrite.current()) && adapter.isDirty() === true && saves.length === 0,
      "⌘E is not a ClioWrite key any more: not taken, no switch, nothing saved, dirty untouched");
  }

  // ---- the close box, Quit and switching project ----
  answers.push("cancel");
  let closed = await vm.run('closeWindow("clioWrite")');
  test.assert(closed === false && asked.length === 1 && asked[0].options?.confirmKey === "clio_stage_native_cmd_save" && asked[0].options?.altKey === "clio_stage_native_dont_save" && asked[0].options?.defaultAction === "cancel",
    "the close box over unsaved edits asks 存储 / 不存储 / 取消, default Cancel");
  test.assert(!!w.AISystem6ClioWrite.current(), "Cancel keeps the window and the document");
  answers.push("cancel");
  await vm.run('quitApp("clioWrite")');
  test.assert(asked.length === 2 && !!w.AISystem6ClioWrite.current(), "Quit asks the same question; Cancel keeps it");
  vm.run('projects.push({ id: "write-other", name: "Other", createdAt: 1, updatedAt: 1 })');
  const activeBefore = vm.run("activeProjectId");
  answers.push("cancel");
  const switched = await vm.run('switchProject("write-other")');
  test.assert(switched === false && asked.length === 3 && vm.run("activeProjectId") === activeBefore && !!w.AISystem6ClioWrite.current(), "switching project asks too; Cancel keeps the project and the document");

  answers.push("no");
  await vm.run('closeWindow("clioWrite")');
  test.assert(!w.AISystem6ClioWrite.current() && record.liveAdapter === null && !empty.hidden, "不存储 drops the in-memory edits and the window goes back to empty");
  test.assert(vm.run('editHistoryFor("clioWrite") === window.AISystem6DeskUndo'), "with nothing open, Edit › Undo has no ClioWrite history and falls to the desk");

  ({ adapter } = await mount());
  const askedBefore = asked.length;
  closed = await vm.run('closeWindow("clioWrite")');
  test.assert(asked.length === askedBefore && !w.AISystem6ClioWrite.current(), "a clean document closes without a question");

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
