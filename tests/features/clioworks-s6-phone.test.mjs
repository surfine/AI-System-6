// ClioWorks S6 (second draft, Refusal board ⑤): ClioWrite on a phone uses the
// flowing view only. What a contract can hold without a browser, run on the real
// code in a vm:
//   - the session: 页面视图 is refused on a phone with the S4 reason (the
//     greyed menu row and the keyboard read the same commandState), offered
//     again on the desk; the phone is the desk's own predicate
//     (window-manager.js isNarrowViewport), handed in, never a breakpoint here;
//   - the window, over the real vendored Quire layout (linkedom): the 查看 row
//     is grey with that reason, choosing it anyway leaves the document flowing,
//     and a table wider than the flow sits in its own .cw-table-frame with the
//     one-line hint under it (its centring margin dropped so column 1 is
//     reachable) — on a phone only;
//   - 查找 / 替换 opens as the phone drawer (.is-drawer), not movable, each
//     field with its own 听写 inside its right end, while the desk keeps the
//     floating windoid with no in-field button.
// The geometry (no sideways page scroll, the frame really scrolls, the drawer
// leaves the top half, the rail is a sheet) is the browser smoke's:
// `node tooling/clioworks-smoke.mjs phone`.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clioworks-s6-phone");
const D01 = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/docx/D01.docx")));

const run = async () => {
  /* ============ Part A: the session, headless ============ */
  {
    const ctx = makeContext();
    ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
    loadScripts(ctx, ["app/features/clio-write.js"]);
    const api = ctx.AISystem6ClioWrite;
    const adapter = {
      document: () => ({ sect: { pgW: 595.3, pgH: 841.9 }, main: { blocks: [] } }),
      paragraphs: () => [], blocks: () => [], isDirty: () => false, getEditRevision: () => 1,
      canUndo: () => false, canRedo: () => false, undoLabel: () => "",
    };
    let phone = true;
    const session = api.createSession(adapter, { fileName: "D01.docx", mountedName: "D01.docx", host: {}, phone: () => phone });
    const state = session.commandState("view.pages");
    test.assert(session.phone === true && state.enabled === false && state.reason === "clio_write_reason_phone_flow",
      `on a phone 页面视图 is refused with its own reason (got ${JSON.stringify(state)})`);
    test.assert(session.commandState("view.flow").enabled === true, "流式视图 stays offered on a phone");
    phone = false;
    test.assert(session.commandState("view.pages").enabled === true, "on the desk 页面视图 is offered again (the predicate is read live)");
    const plain = api.createSession(adapter, { host: {} });
    test.assert(plain.phone === false && plain.commandState("view.pages").enabled === true,
      "a session handed no phone predicate is a desk's");
  }

  /* ============ Part B: the window over the real editor (linkedom) ============ */
  const openWindow = async (phone) => {
    const v = await createQuireEditorVm({ docx: D01, name: "关于开展质量检查的通知.docx" });
    const w = v.window;
    const doc = v.document;
    w.isNarrowViewport = () => phone.value;
    const tick = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
    const out = await w.AISystem6ClioWrite.open(v.record, {});
    await tick();
    // linkedom lays nothing out: give the scroller an upright phone's width, so
    // the flow is 260px wide (layout.js flowView: the scroller less 40px), then
    // lay the document out again the way a resize does.
    Object.defineProperty(doc.querySelector(".cw-scroller"), "clientWidth", { configurable: true, value: 300 });
    v.run("L.layout.render()");
    await tick();
    return { v, w, doc, tick, out };
  };

  {
    const phone = { value: true };
    const { v, w, doc, tick, out } = await openWindow(phone);
    test.assert(out.ok, "(setup) D01 is mounted in the phone window");
    const row = v.menu("clio-write-view-pages");
    test.assert(row.available() === false && row.reason() === "clio_write_reason_phone_flow",
      `查看 › 页面视图 is grey on a phone and its reason says why (${row.reason()})`);
    row.run();
    await tick();
    test.assert(w.AISystem6ClioWrite.current().view === "flow" && v.run("L.layout.view") === "web"
      && doc.querySelector('[data-window="clioWrite"]').dataset.view === "flow",
      "choosing 页面视图 anyway leaves the document flowing (the surface refuses too, not only the menu)");
    test.assert(doc.querySelector(".cw-receipt").textContent.includes("clio_write_reason_phone_flow"),
      "the refusal names its reason in the document bar");

    const flow = doc.querySelector(".flow");
    const frame = flow && flow.querySelector(":scope > .cw-table-frame");
    const table = frame && frame.querySelector(":scope > table.tbl");
    test.assert(!!table && parseFloat(table.style.width) > parseFloat(flow.style.width),
      `D01's form, wider than the phone's flow, sits in its own frame (flow ${flow && flow.style.width}, table ${table && table.style.width})`);
    test.assert(table && !table.style.marginLeft,
      "inside the frame the table starts at its first column (the upstream centring margin is dropped)");
    const hint = frame && frame.nextElementSibling;
    test.assert(hint && hint.classList.contains("cw-table-hint") && hint.textContent === "clio_write_table_scroll_hint"
      && hint.getAttribute("contenteditable") === "false",
      "one hint line right under the frame, outside the editable text");
    test.assert(flow.querySelectorAll(":scope > table.tbl").length === 0, "no wide table is left loose in the flow");

    // Turned into a desk (a wider screen): the next layout has no frame.
    phone.value = false;
    Object.defineProperty(doc.querySelector(".cw-scroller"), "clientWidth", { configurable: true, value: 300 });
    v.run("L.layout.render()");
    await tick();
    test.assert(!doc.querySelector(".cw-table-frame") && !doc.querySelector(".cw-table-hint"),
      "on the desk the table is laid out as the file has it, no frame and no hint");
    test.assert(v.menu("clio-write-view-pages").available() === true, "and 页面视图 is offered again");
  }

  /* ============ Part C: 查找 / 替换 — the phone drawer, the desk windoid ============ */
  for (const phone of [true, false]) {
    const v = await createQuireEditorVm({ docx: D01 });
    const w = v.window;
    w.isNarrowViewport = () => phone;
    await vm.runInContext("ClioWorksQuireAdapter.loadCodec()", v.context);
    v.load(["app/vendor/clioworks-v3/find-replace.js", "app/features/clioworks-find.js"]);
    const pane = v.document.createElement("div");
    v.document.body.append(pane);
    const opened = await w.AISystem6ClioWorksFind.open({ appId: "clioWrite", kind: "docx", name: "D01.docx", adapter: v.record.liveAdapter, doc: v.document, pane });
    const rootEl = pane.querySelector(".clioworks-find-windoid");
    test.assert(opened === true && !!rootEl, `(setup) the find windoid opened (${phone ? "phone" : "desk"})`);
    const fields = [...rootEl.querySelectorAll(".clioworks-find-field")];
    if (phone) {
      test.assert(rootEl.classList.contains("is-drawer"), "on a phone 查找 is the drawer");
      test.assert(fields.length === 2 && fields.every((field) => field.querySelector("input.windoid-input") && field.lastElementChild.classList.contains("clioworks-find-dictate")),
        "two fields, each carrying its own 听写 button at its end (inside the field, never over the label)");
      test.assert(rootEl.getAttribute("data-dictation") === "off",
        "the drawer keeps the floating 听写 button away; its own buttons replace it");
      // The drawer's 听写 names its field to the Dictation Pad, which refuses a
      // marked field: the mark is lifted for that one call, then restored.
      const seen = [];
      w.openDictationPad = ({ target }) => { seen.push([target, target.closest("[data-dictation]")]); return "field"; };
      v.fire(fields[0].querySelector(".clioworks-find-dictate"), "click");
      test.assert(seen.length === 1 && seen[0][0] === fields[0].querySelector("input") && seen[0][1] === null,
        "听写 opens the Dictation Pad on the 查找 field itself, unmarked for that call");
      test.assert(rootEl.getAttribute("data-dictation") === "off", "and the mark is back afterwards");
      // Not movable: a press on the drawer's title bar starts no drag.
      const press = v.fire(rootEl.querySelector(".windoid-titlebar"), "pointerdown", { pointerType: "touch", button: 0, clientX: 10, clientY: 10 });
      test.assert(press.defaultPrevented === false, "the drawer's title bar does not drag (a touch there scrolls nothing away)");
    } else {
      test.assert(!rootEl.classList.contains("is-drawer") && fields.length === 0 && !rootEl.querySelector(".clioworks-find-dictate"),
        "on the desk 查找 stays the floating windoid, no in-field buttons");
    }
  }

  /* ============ Part C: the upright rail sheet leaves the text reachable ============ */
  {
    // Held upright the rail is a sheet at the foot of its host. The host's own
    // block-end padding reserves exactly the sheet's height, the way the desk's
    // padding-inline-end reserves its width, so the scroller above ends where
    // the sheet begins and its last lines scroll into view.
    const css = readFileSync(resolveProjectPath("apps/desktop/styles/84-windoid.css"), "utf8");
    const at = css.indexOf("@media (orientation: portrait)", css.indexOf(".doc-rail-toggle.is-active"));
    const block = at < 0 ? "" : css.slice(at, css.indexOf("\n}\n", at));
    const rule = (selector) => (block.match(new RegExp(`\\n  ${selector.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`)) || [])[1] || "";
    const decl = (body, prop) => (body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`)) || [])[1]?.trim() || "";
    const reserved = decl(rule(".doc-rail-host.is-doc-rail-open"), "padding-block-end");
    const sheet = rule(".doc-rail");
    test.assert(!!reserved && decl(sheet, "height") === reserved && decl(sheet, "inset-block-start") === "auto",
      `upright, the open host reserves the sheet's own height at its foot (padding-block-end ${reserved || "none"}, sheet height ${decl(sheet, "height") || "none"}, top ${decl(sheet, "inset-block-start") || "none"})`);
    test.assert(/--doc-rail-sheet-height:\s*var\(--doc-rail-host-half\b/.test(block),
      "the sheet's height is half of the host as it is now, not a share of the screen");

    // The keyboard shrinks the host; the reserved half must follow it, or the
    // padding outgrows the host and the scroller collapses.
    const { parseHTML } = await import("linkedom");
    const { window: rw } = parseHTML('<!doctype html><html><body><div id="host"><div id="scroll"></div></div><div id="slot"></div></body></html>');
    let observed = null;
    rw.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { observed = this.cb; } disconnect() { observed = null; } };
    const host = rw.document.getElementById("host");
    let height = 640;
    Object.defineProperty(host, "clientHeight", { get: () => height });
    const railCtx = vm.createContext({ window: rw, document: rw.document, t: (k) => k, console });
    vm.runInContext(readFileSync(resolveProjectPath("apps/desktop/app/features/clioworks-rail.js"), "utf8"), railCtx);
    const rail = rw.AISystem6ClioWorksRail.create({ doc: rw.document, appId: "s6-sheet", slot: rw.document.getElementById("slot"), host, tabs: ["revisions", "comments"] });
    test.assert(!!rail && host.style.getPropertyValue("--doc-rail-host-half") === "320px", `the rail measures its host on mount (${host.style.getPropertyValue("--doc-rail-host-half")})`);
    height = 300;
    if (observed) observed([]);
    test.assert(host.style.getPropertyValue("--doc-rail-host-half") === "150px", `a shrunken host (keyboard up) halves the reserve with it (${host.style.getPropertyValue("--doc-rail-host-half")})`);
    rail.destroy();
    test.assert(observed === null && !host.style.getPropertyValue("--doc-rail-host-half"), "destroy stops watching and clears the reserve");
  }

  test.finish();
};

run();
