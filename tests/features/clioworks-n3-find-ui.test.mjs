// ClioWorks N3 (UI) contract: the shared 查找 / 替换 windoid the three Office
// editors open, over the REAL vendored codecs + adapters + engine in the S11 vm
// context. The roadmap's N3 rules, checked the way a user experiences them:
//   - the search state's pure half: 查找下一个 / 查找上一个 wrap, the status line
//     is 「第 n 处 / 共 m 处」, the checkboxes mean one engine option per document
//     kind (a workbook's 在公式中查找 never leaks into a document), and 选中文字
//     keeps only the matches inside the box it was given;
//   - scope 「全部打开的文件」 walks every document the three editors hold and
//     never reaches TeachText or another writing-route manuscript: one engine
//     replaceAll per document, so each document gets its OWN named undo step
//     (「全部替换 N 处」), counts are listed per document, and read-only matches
//     (the ClioWrite table, the formula's displayed value) are counted, never
//     replaced;
//   - the ⌘F / ⌘G registration is scoped to the three editors only, and ⌘F keeps
//     its current meaning in TeachText (Find… ) and the blog (search);
//   - the 编辑 menu rows and every new word exist in both languages, and each
//     editor maps the engine's 「替换」 / 「全部替换 N 处」 steps into its Edit
//     menu's words.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n3-find-ui");
const FIND_MODULE = "app/features/clioworks-find.js";
const ENGINE = "app/vendor/clioworks-v3/find-replace.js";
const fixture = (p) => new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/" + p)));

/** One editor-shaped context, as features/*-*.js hand them to the windoid. */
function officeContext(appId, kind, name, adapter) {
  const edits = { afterEdit: 0 };
  const ctx = {
    appId, kind, name, adapter,
    afterEdit() { edits.afterEdit += 1; },
  };
  ctx.edits = edits;
  return ctx;
}

const run = async () => {
  /* ------------------------------------------------ the search state, pure */
  {
    const uiCtx = makeContext();
    loadScripts(uiCtx, [FIND_MODULE]);
    test.assert(vm.runInContext("AISystem6ClioWorksFindLoaded === true", uiCtx), "the find windoid module loads alone and sets its loaded flag");
    const find = vm.runInContext("AISystem6ClioWorksFind", uiCtx);
    test.assert(!!find && typeof find.open === "function" && typeof find.next === "function" && typeof find.close === "function",
      "the module installs open / next / close for the editors");
    test.assert(JSON.stringify(find.OFFICE_APPS) === JSON.stringify(["clioWrite", "clioChart", "clioStage"]),
      "only the three Office editors are ever asked for a document");

    // 查找下一个 / 查找上一个 wrap; nothing found is no index at all.
    test.assert(find.wrapIndex(-1, 3, 1) === 0 && find.wrapIndex(2, 3, 1) === 0, "next wraps from the last match to the first");
    test.assert(find.wrapIndex(0, 3, -1) === 2, "previous wraps from the first match to the last");
    test.assert(find.wrapIndex(1, 3, 1) === 2 && find.wrapIndex(1, 3, -1) === 0, "next and previous step one match");
    test.assert(find.wrapIndex(0, 0, 1) === -1, "an empty document has no match index");

    // The status line 「第 n 处 / 共 m 处」.
    const line = find.statusText(0, 3);
    test.assert(line.key === "clioworks_find_status" && JSON.stringify(line.args) === "[1,3]", "the status names the match and the total");
    test.assert(find.statusText(9, 3).args[0] === 3, "the status never names a match past the total");
    test.assert(find.statusText(-1, 0).key === "clioworks_find_none", "nothing found says so in its own words");

    // One checkbox set per document kind; nothing leaks across kinds.
    const fields = { case: true, fullHalf: true, wholeWord: true, comments: true, formulas: true, notes: true };
    const docxOptions = find.engineOptions(fields, "docx");
    test.assert(docxOptions.caseSensitive === true && docxOptions.fullHalfWidthEquivalent === true && docxOptions.wholeWord === true,
      "the document's checkboxes reach the engine");
    test.assert(docxOptions.includeComments === true && docxOptions.includeNotes === undefined && docxOptions.inFormulas === undefined,
      "含批注与修订 means includeComments for a document and nothing else");
    const xlsxOptions = find.engineOptions(fields, "xlsx");
    test.assert(xlsxOptions.inFormulas === true && xlsxOptions.includeComments === undefined && xlsxOptions.includeNotes === undefined,
      "在公式中查找 means inFormulas for a workbook and nothing else");
    const pptxOptions = find.engineOptions(fields, "pptx");
    test.assert(pptxOptions.includeNotes === true && pptxOptions.includeComments === undefined && pptxOptions.inFormulas === undefined,
      "含演讲者备注 means includeNotes for a deck and nothing else");
    test.assert(find.engineOptions(fields, "docx").scope === "all", "every search reads the whole document; the windoid owns no story scope");

    // 选中文字 keeps the matches inside the box it was given.
    const docxMatches = [
      { kind: "docx", text: "采访", readOnly: false, locator: { story: "main", path: [5], paragraphId: "9", from: 2, to: 4 } },
      { kind: "docx", text: "采访", readOnly: false, locator: { story: "main", path: [7], paragraphId: "11", from: 0, to: 2 } },
      { kind: "docx", text: "采访", readOnly: true, locator: { story: "main", path: [8, 0, 1, 0], paragraphId: "12", from: 0, to: 2 } },
    ];
    const boxed = find.filterSelection(docxMatches, { paragraphId: "9", from: 0, to: 10 });
    test.assert(boxed.length === 1 && boxed[0].locator.paragraphId === "9", "选中文字 keeps only the match inside the selected paragraph");
    test.assert(find.filterSelection(docxMatches, null).length === 3, "a collapsed or missing selection searches the whole document");
    const xlsxMatches = [
      { kind: "xlsx", locator: { sheet: "预算", row: 2, col: 2 } },
      { kind: "xlsx", locator: { sheet: "预算", row: 12, col: 2 } },
      { kind: "xlsx", locator: { sheet: "口径", row: 2, col: 2 } },
    ];
    const rect = find.filterSelection(xlsxMatches, { sheet: "预算", r1: 1, c1: 1, r2: 3, c2: 3 });
    test.assert(rect.length === 1 && rect[0].locator.row === 2 && rect[0].locator.col === 2,
      "选中文字 in a workbook keeps the cells of the selected rectangle (the engine's rows and columns are 1-based)");
    const pptxMatches = [
      { kind: "pptx", locator: { slide: "s1", shape: "sh2", paragraph: 0, run: 0 } },
      { kind: "pptx", locator: { slide: "s1", shape: "sh3", paragraph: 0, run: 0 } },
      { kind: "pptx", locator: { slide: "s1", notes: true, from: 0, to: 2 } },
    ];
    const shapeBox = find.filterSelection(pptxMatches, { shapeId: "sh2" });
    test.assert(shapeBox.length === 1 && shapeBox[0].locator.shape === "sh2" && !shapeBox[0].locator.notes,
      "选中文字 in a deck keeps the selected text box; speaker notes are never inside it");

    // Read-only matches are counted and reported, per kind.
    const note = find.readOnlyNote([{ kind: "docx", matches: docxMatches }, { kind: "xlsx", matches: [{ readOnly: true }] }, { kind: "xlsx", matches: [] }]);
    test.assert(note.length === 2 && note[0].key === "clioworks_find_readonly_docx" && note[0].args[0] === 1,
      "the read-only note counts per kind from a plan");
    const skippedNote = find.readOnlyNote([{ kind: "pptx", skipped: 3 }]);
    test.assert(skippedNote.length === 1 && skippedNote[0].key === "clioworks_find_readonly_pptx" && skippedNote[0].args[0] === 3,
      "a replaceAll's skipped count lands in the same note");
    test.assert(find.readOnlyNote([{ kind: "docx", matches: [] }]).length === 0, "no read-only matches, no note");

    // The count a named step carries, for the Edit menu's undo row.
    test.assert(JSON.stringify(find.replaceAllCount("全部替换 3 处")) === "[3]", "「全部替换 3 处」 hands its count to the translation");
    test.assert(JSON.stringify(find.replaceAllCount("替换")) === "[]", "other steps carry no count");
  }

  /* --------------------------------- 「全部打开的文件」 over the real documents */
  {
    const ctx = makeContext();
    loadScripts(ctx, [
      "app/vendor/clioworks-v3/quire-adapter.js",
      "app/vendor/clioworks-v3/ledger-adapter.js",
      "app/vendor/clioworks-v3/lectern-adapter.js",
      ENGINE,
      FIND_MODULE,
    ]);
    // The three codecs write the SAME names on the shared L, and the writers
    // read them at call time — exactly what the native host solves with
    // ownCodec (native-host.js: snapshot a format's world when its codec has
    // loaded, point the names back before its operations). The same rule in
    // miniature, so the windoid's cross-format walk runs the way the desk's
    // does; without it a docx replacement after a workbook open reads the
    // ledger's L.preserve and throws.
    vm.runInContext(`
      globalThis.__worlds = new Map();
      globalThis.AISystem6ClioWorks = { ownCodec: async (format) => {
        const names = globalThis.__worlds.get(format);
        if (!names) return null;
        for (const key of Object.keys(L)) if (!names.has(key)) delete L[key];
        for (const [key, value] of names) L[key] = value;
        return null;
      } };
    `, ctx);
    const snapshot = (format) => vm.runInContext(`globalThis.__worlds.set(${JSON.stringify(format)}, new Map(Object.entries(L)))`, ctx);
    const find = vm.runInContext("AISystem6ClioWorksFind", ctx);
    const open = async (globalName, format, bytes, name) => {
      ctx.__bytes = bytes;
      const adapter = await vm.runInContext(`${globalName}.open(globalThis.__bytes, { name: ${JSON.stringify(name)} })`, ctx);
      await vm.runInContext(`${globalName}.loadCodec()`, ctx);
      snapshot(format);
      return adapter;
    };
    const docx = await open("ClioWorksQuireAdapter", "docx", fixture("clioworks-s11/quire-s11.docx"), "搬家清单.docx");
    const xlsx = await open("ClioWorksLedgerAdapter", "xlsx", fixture("clioworks-s11/budget-s11.xlsx"), "预算.xlsx");
    const pptx = await open("ClioWorksLecternAdapter", "pptx", fixture("clioworks-s11/slides-notes-comment-s11.pptx"), "夹具.pptx");

    const docxCtx = officeContext("clioWrite", "docx", "搬家清单.docx", docx);
    const xlsxCtx = officeContext("clioChart", "xlsx", "预算.xlsx", xlsx);
    const pptxCtx = officeContext("clioStage", "pptx", "夹具.pptx", pptx);
    // The writing route's manuscript: not an Office editor, so the windoid never asks it.
    let manuscriptTouched = false;
    const teachCtx = { appId: "teachText", kind: "md", name: "手稿", adapter: null, afterEdit: () => { manuscriptTouched = true; } };
    const contexts = [docxCtx, xlsxCtx, pptxCtx, teachCtx];

    // The plan: one entry per Office document, the manuscript skipped entirely.
    const plan = await find.planAllFiles(contexts, "纸箱", {});
    test.assert(plan.length === 3, `planAllFiles lists one plan per Office document and never the manuscript (got ${plan.length})`);
    const docxPlan = plan.find((p) => p.ctx.appId === "clioWrite");
    test.assert(docxPlan.matches.length === 2 && docxPlan.matches.filter((m) => m.readOnly).length === 1,
      "the document's plan holds the body match and the read-only table match");
    test.assert(plan.find((p) => p.ctx.appId === "clioChart").matches.length === 1
      && plan.find((p) => p.ctx.appId === "clioStage").matches.length === 0,
      "the plan crosses formats: the workbook's 纸箱 cell is counted, the deck has none");

    // 「全部替换」 across files: one named undo step per document, counts per document.
    const results = await find.replaceAllFiles(contexts, "纸箱", "卡板", { includeComments: true });
    test.assert(results.length === 3, "the replace names every document it walked, and still never the manuscript");
    const docxResult = results.find((r) => r.appId === "clioWrite");
    const xlsxFirstResult = results.find((r) => r.appId === "clioChart");
    test.assert(docxResult.count === 2 && docxResult.skipped === 1 && !docxResult.blocked,
      `the document's own replaceAll replaced 2 and counted the read-only table (got ${JSON.stringify(docxResult)})`);
    test.assert(xlsxFirstResult.count === 1 && xlsxFirstResult.skipped === 0, "the workbook's own replaceAll replaced its cell");
    test.assert(results.find((r) => r.appId === "clioStage").count === 0, "the deck had nothing to replace and raised no step");
    test.assert(docxCtx.edits.afterEdit === 1 && xlsxCtx.edits.afterEdit === 1 && pptxCtx.edits.afterEdit === 0 && !manuscriptTouched,
      "afterEdit fires only where the document changed; the manuscript is never touched");
    test.assert(docx.canUndo() && docx.undoLabel() === "全部替换 2 处", "the document's undo history holds the named step 「全部替换 2 处」");
    test.assert(xlsx.canUndo() && xlsx.undoLabel() === "全部替换 1 处", "the workbook's undo history holds its own named step");
    test.assert(!pptx.canUndo(), "a document with no replacement raises no undo step");
    test.assert(docx.paragraphs().some((p) => p.text === "先把卡板数量点清楚。"), "the document shows the replacement");
    test.assert(docx.tables()[0].rows[1][0].text.includes("纸箱"), "the read-only table still holds the old word");
    test.assert(String(xlsx.getCell("预算", "A2").value).startsWith("卡板"), "the workbook shows the replacement");
    docx.undo();
    xlsx.undo();
    test.assert(docx.paragraphs().some((p) => p.text === "先把纸箱数量点清楚。") && String(xlsx.getCell("预算", "A2").value).startsWith("纸箱"),
      "one undo per document restores each exactly");

    // The workbook's turn: value cells replaced, the formula's displayed value skipped.
    const formulaBefore = xlsx.getCell("预算", "F12").formula;
    const xlsxResults = await find.replaceAllFiles(contexts, "未测", "已测", {});
    const xlsxResult = xlsxResults.find((r) => r.appId === "clioChart");
    test.assert(xlsxResult.count === 2 && xlsxResult.skipped === 1, `the workbook's replaceAll replaced the 2 value cells and counted the formula (got ${JSON.stringify(xlsxResult)})`);
    test.assert(xlsx.canUndo() && xlsx.undoLabel() === "全部替换 2 处", "the workbook's undo history holds its own named step");
    test.assert(xlsx.getCell("预算", "B9").value === "已测" && xlsx.getCell("预算", "F12").formula === formulaBefore,
      "the value cells show the replacement and the formula is untouched");
    test.assert(find.readOnlyNote([xlsxResult])[0].args[0] === 1, "the skipped formula result is reportable");
    xlsx.undo();
    test.assert(xlsx.getCell("预算", "B9").value === "未测" && xlsx.getCell("预算", "F12").formula === formulaBefore, "one undo restores the workbook exactly");

    // The deck's turn: notes on both slides, one named step through the adapter's transact.
    const notesBefore = pptx.slides().map((sl) => pptx.notes(sl.id));
    const pptxResults = await find.replaceAllFiles(contexts, "测试范围", "验收范围", { includeNotes: true });
    const pptxResult = pptxResults.find((r) => r.appId === "clioStage");
    test.assert(pptxResult.count === 2 && pptxResult.skipped === 0, `the deck's replaceAll covers both slides' notes (got ${JSON.stringify(pptxResult)})`);
    test.assert(pptx.canUndo() && pptx.undoLabel() === "全部替换 2 处", "the deck's undo history holds its own named step");
    pptx.undo();
    test.assert(pptx.slides().map((sl) => pptx.notes(sl.id)).join("|") === notesBefore.join("|"), "one undo restores the notes on both slides");

    // Each document's step stands in ITS OWN history: undoing one never moves the others.
    await find.replaceAllFiles([docxCtx, xlsxCtx], "纸箱", "卡板", { includeComments: true });
    await find.replaceAllFiles([docxCtx, xlsxCtx], "未测", "已测", {});
    test.assert(docx.undoLabel() === "全部替换 2 处" && xlsx.undoLabel() === "全部替换 2 处", "both documents carry their own named step after a cross-file replace");
    docx.undo();
    test.assert(docx.paragraphs().some((p) => p.text.includes("纸箱")) && xlsx.getCell("预算", "B9").value === "已测" && String(xlsx.getCell("预算", "A2").value).startsWith("卡板"),
      "undoing one document leaves the other document's replacements standing");
  }

  /* ------------------------- ⌘F / ⌘G: scoped to the three editors, and only them */
  {
    // ⌘F keeps its current meaning elsewhere.
    const actions = read("app/core/actions.js");
    test.assertIncludes(actions, '{ id: "find-change", key: "f", action: "open-find-change", display: "⌘F", labelKey: "find_change_ellipsis", keyCaps: true, scope: ["teachText"] },',
      "TeachText's 查找… (⌘F) keeps its scope");
    test.assertIncludes(actions, '{ id: "blog-search", key: "f", action: "blog-search", display: "⌘F", labelKey: "aaron_blog_search", scope: ["aaronBlog"] },',
      "the blog's search (⌘F) keeps its scope");

    // Each editor registers its own ⌘F / ⌘G in its own scope.
    const seeded = () => {
      const ctx = makeContext();
      vm.runInContext("const keyboardShortcutRegistry = [];", ctx);
      return ctx;
    };
    const cwCtx = seeded();
    loadScripts(cwCtx, ["app/features/clio-write.js"]);
    const cwRows = vm.runInContext("keyboardShortcutRegistry.filter((e) => e.key === 'f' || e.key === 'g')", cwCtx);
    test.assert(cwRows.some((e) => e.id === "clio-write-find" && e.action === "clio-write-find" && e.key === "f" && JSON.stringify(e.scope) === '["clioWrite"]' && e.dispatch === false),
      "ClioWrite registers ⌘F in its own scope only (shown in the menus, taken by its surface)");
    test.assert(cwRows.some((e) => e.id === "clio-write-find-next" && e.key === "g" && JSON.stringify(e.scope) === '["clioWrite"]'),
      "ClioWrite registers ⌘G in its own scope only");
    const cwkCtx = seeded();
    loadScripts(cwkCtx, ["app/features/clio-chart-workbook.js"]);
    const cwkRows = vm.runInContext("keyboardShortcutRegistry.filter((e) => e.key === 'f' || e.key === 'g')", cwkCtx);
    test.assert(cwkRows.some((e) => e.id === "clio-chart-workbook-find" && e.key === "f" && JSON.stringify(e.scope) === '["clioChart"]')
      && cwkRows.some((e) => e.id === "clio-chart-workbook-find-next" && e.key === "g" && JSON.stringify(e.scope) === '["clioChart"]'),
      "the workbook registers ⌘F / ⌘G in its own scope only");
    const csnCtx = seeded();
    loadScripts(csnCtx, ["app/features/clio-stage-native.js"]);
    const csnRows = vm.runInContext("keyboardShortcutRegistry.filter((e) => e.key === 'f' || e.key === 'g')", csnCtx);
    test.assert(csnRows.some((e) => e.id === "clio-stage-native-find" && e.key === "f" && JSON.stringify(e.scope) === '["clioStage"]')
      && csnRows.some((e) => e.id === "clio-stage-native-find-next" && e.key === "g" && JSON.stringify(e.scope) === '["clioStage"]'),
      "the deck registers ⌘F / ⌘G in its own scope only");
    // No editor's scope reaches another application's keys.
    const everyScope = (rows) => rows.every((e) => Array.isArray(e.scope) && e.scope.length === 1);
    test.assert(everyScope(cwRows) && everyScope(cwkRows) && everyScope(csnRows), "every find shortcut answers one application, never several");
  }

  /* ------------------------------------- the Edit menu rows, in both languages */
  {
    const evaluate = (source, globalName) => {
      const context = vm.createContext({ window: {}, t: (key) => key });
      vm.runInContext(source, context, { timeout: 2000 });
      return context.window[globalName] || {};
    };
    const en = evaluate(read("app/data/translations-en.js"), "AISystem6TranslationsEn");
    const zh = evaluate(read("app/data/translations-zh.js"), "AISystem6TranslationsZh");
    const keys = [
      "clioworks_find_title", "clioworks_find_replace_menu", "clioworks_find_what", "clioworks_find_replace_with",
      "clioworks_find_scope", "clioworks_find_scope_doc", "clioworks_find_scope_selection", "clioworks_find_scope_files",
      "clioworks_find_case", "clioworks_find_full_half", "clioworks_find_whole_word", "clioworks_find_comments",
      "clioworks_find_formulas", "clioworks_find_notes", "clioworks_find_next", "clioworks_find_replace",
      "clioworks_find_replace_all", "clioworks_find_status", "clioworks_find_none", "clioworks_find_untitled",
      "clioworks_find_doc_count", "clioworks_find_readonly_docx", "clioworks_find_readonly_xlsx", "clioworks_find_readonly_pptx",
      "clioworks_find_tracked", "clioworks_find_failed", "clioworks_find_collapse",
      "clio_write_step_replace", "clio_write_step_replace_all",
      "clio_chart_workbook_step_replace", "clio_chart_workbook_step_replace_all",
      "clio_stage_native_step_replace", "clio_stage_native_step_replace_all",
    ];
    test.assert(keys.every((key) => typeof en[key] !== "undefined"), "every find key has English copy");
    test.assert(keys.every((key) => typeof zh[key] !== "undefined"), "every find key has Chinese copy");
    test.assert(zh.clioworks_find_replace_menu === "查找 / 替换…" && zh.clioworks_find_scope_doc === "本文稿"
      && zh.clioworks_find_scope_selection === "选中文字" && zh.clioworks_find_scope_files === "全部打开的文件",
      "the scope names the design's words (本文稿 / 选中文字 / 全部打开的文件)");
    test.assert(zh.clioworks_find_status(1, 3) === "第 1 处 / 共 3 处", "the status line reads 「第 1 处 / 共 3 处」");
    test.assert(zh.clioworks_find_doc_count("预算.xlsx", 2) === "预算.xlsx：2 处", "a per-document count reads 「预算.xlsx：2 处」");
    test.assert(zh.clioworks_find_readonly_docx(3) === "3 处在只读表格中，未替换", "the read-only note reads the design's words");
    test.assert(zh.clio_write_step_replace_all(3) === "全部替换 3 处" && en.clio_write_step_replace_all(3) === "Replace All (3)",
      "the batch replace step keeps its count in the Edit menu's words");

    // The rows stand in the three editors' Edit menus, each gated to its editor.
    const write = read("app/features/clio-write.js");
    test.assertIncludes(write, "menuRow('clio-write-find'), menuRow('clio-write-find-next')", "ClioWrite's Edit menu lists 查找 / 替换… and 查找下一个");
    const chart = read("app/features/clio-chart.js");
    test.assertIncludes(chart, 'menuItem("clio-chart-workbook-find", "clioworks_find_replace_menu", "clio-chart-workbook-find", { menuCondition: "cwk-on" })',
      "the workbook's Edit menu lists 查找 / 替换… while a workbook is mounted");
    const stage = read("app/features/clio-stage-native.js");
    test.assertIncludes(stage, "item('clio-stage-native-find', 'clioworks_find_replace_menu')", "the deck's Edit menu lists 查找 / 替换… while mounted");

    // ClioWrite maps the engine's steps into its Edit menu's words (workbook and
    // deck carry the same mapping beside their own step tables).
    const cwCtx = makeContext();
    loadScripts(cwCtx, ["app/features/clio-write.js"]);
    test.assert(vm.runInContext("AISystem6ClioWrite.stepKey('替换')", cwCtx) === "clio_write_step_replace"
      && vm.runInContext("AISystem6ClioWrite.stepKey('全部替换 3 处')", cwCtx) === "clio_write_step_replace_all",
      "ClioWrite names the replace steps in the Edit menu's words");
    const cwk = read("app/features/clio-chart-workbook.js");
    test.assertMatches(cwk, /全部替换 \\d\+ 处\$\/\.test\(text\)\) return 'clio_chart_workbook_step_replace_all'/,
      "the workbook maps 「全部替换 N 处」 into its own step words");
    const csn = read("app/features/clio-stage-native.js");
    test.assertMatches(csn, /全部替换 \\d\+ 处\$\/\.test\(text\)\) return 'clio_stage_native_step_replace_all'/,
      "the deck maps 「全部替换 N 处」 into its own step words");
  }

  test.finish();
};

run();
