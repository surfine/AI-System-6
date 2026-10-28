// ClioWorks N9 contract: iWork 静态阅读 + 建副本 (CLIOWORKS-1060-REMAINING-SPEC 二).
//
// Both halves run against the real code, not mocks:
//   - the server converts through the importers themselves (iwork.js serves
//     the bundle's own QuickLook preview PDF for 原页阅读; iwork-convert.js
//     builds the Office counterpart from the IWA structures the text ladder
//     already parses), driven as CommonJS modules straight from node;
//   - every converted package is OPENED AGAIN with the desk's own adapters
//     (ClioWorksQuireAdapter / ClioWorksLedgerAdapter / ClioWorksLecternAdapter
//     in a browser-shaped vm), so the assertions read what a writer would open;
//   - the first-save list is driven through the lazy desk module with the REAL
//     translation tables, pinning that it says what is carried AND every lossy
//     item the importer could see — 不夸大也不隐瞒 — before anything is written.
// The samples are the generated fixtures in tests/fixtures/clioworks-n9/
// (自造最小合法文件: real IWA streams + a hand-built one-page preview PDF);
// this contract also proves the fixtures on disk are the ones the generator
// builds, so they can never drift behind the importer they pin.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { coreFiles, lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import {
  buildPagesFixture,
  buildNumbersFixture,
  buildKeynoteFixture,
  buildEmptyFixture,
} from "../fixtures/clioworks-n9/generate-iwork.mjs";

// Imported as modules (not createRequire) so the contract visibly executes the
// real importers — the static-contract ratchet reads import specifiers.
const iwork = await import("../../apps/server/server/importers/iwork.js");
const { convertIworkToOffice } = await import("../../apps/server/server/importers/iwork-convert.js");

const test = createFeatureTest("clioworks-n9-iwork");
const DIR = "tests/fixtures/clioworks-n9";
const fixture = (name) => readFileSync(resolveProjectPath(`${DIR}/${name}`));

const moduleSource = read("app/features/iwork-reading.js");
const reader = read("app/features/reader.js");
const config = read("app/core/config.js");
const appJs = read("app.js");
const menus = read("app/data/menus.js");
const router = read("apps/server/server/router.js");
const providers = read("app/core/service-providers.js");

/* ------------------------------------------------- 1. the desk's wiring --- */

test.assert(lazyRuntimePaths.includes("app/features/iwork-reading.js"), "iwork-reading.js is a lazy runtime path");
test.assert(!coreFiles.includes("app/features/iwork-reading.js"), "iwork-reading.js is not a core (boot) file");
test.assert(
  /createLazyModuleLoader\("AISystem6IworkReading",\s*\["app\/features\/iwork-reading\.js"\]\)/.test(config),
  "ensureIworkReadingModule loads the module",
);
test.assert(
  reader.includes("await ensureIworkReadingModule();") && reader.includes("window.AISystem6IworkReading.openPages({ page, jump })"),
  "Reader hands an iWork file's original pages to the lazy module",
);
test.assert(
  /readerIworkSources\.set\(`\$\{importProjectId\}::\$\{mountedName\}`, file\)/.test(appJs),
  "the File Floppy import keeps the opened iWork file's original File (session only)",
);
test.assert(
  menus.includes('menuItem("reader-make-office-copy", "iwork_make_office_copy")'),
  "the Reader Source menu carries the 建副本… row",
);
test.assert(
  reader.includes('["reader-make-office-copy"')
    && reader.includes(String.raw`"reader-make-office-copy":()=>!!currentReaderPage&&/\.(pages|numbers|key)$/i.test(currentReaderPage.fileName||"")&&readerIworkSources.has(`),
  "the 建副本 command exists and is gated to a session iWork original",
);
test.assert(router.includes('["POST /api/import-iwork-convert", handleImportIworkConvert]'), "the server routes POST /api/import-iwork-convert");
test.assert(providers.includes('["artifact.import.iwork", "/api/import-iwork-convert"]'), "the provider name maps to the route");
test.assert(
  moduleSource.includes("store.createProjectDocument({") && moduleSource.includes("openNativeDocument?.(item)"),
  "the copy is written through the N0 channel and opened through the native host",
);
test.assert(
  moduleSource.includes('root.t(convertFailureKey(error), appName(fileName))'),
  "a failed conversion answers with the desk's own copy, not the server's log detail",
);

/* ------------------------------------------- 2. fixtures are the generator --- */

for (const [name, bytes] of [
  ["sample.pages", buildPagesFixture()],
  ["sample.numbers", buildNumbersFixture()],
  ["sample.key", buildKeynoteFixture()],
]) {
  const onDisk = fixture(name);
  test.assert(onDisk.length === bytes.length && onDisk.equals(bytes), `${name} on disk is exactly what the generator builds`);
}

/* --------------------------------------- 3. 原页阅读: the preview PDF itself --- */

for (const name of ["sample.pages", "sample.numbers", "sample.key"]) {
  const pdf = iwork.extractIworkPreviewPdf(fixture(name));
  test.assert(!!pdf && pdf.length > 0, `${name} yields non-empty preview PDF bytes`);
  test.assert(
    pdf.subarray(0, 8).toString("latin1") === "%PDF-1.4",
    `${name}'s preview bytes are the bundle's own PDF, served unchanged`,
  );
}
test.assert(iwork.extractIworkPreviewPdf(buildPagesFixture({ preview: false })) === null,
  "a bundle without a preview PDF yields null (the failure path the bar speaks for)");
test.assert(iwork.iworkKindForName("x.txt") === "" && iwork.iworkKindForName("a.PAGES") === "pages",
  "kind detection answers pages/numbers/keynote by extension or MIME");

/* ------------------------------------- 4. 建副本: convert, report, read back --- */

async function openWith(adapterScript, globalName, bytes, name) {
  const ctx = makeContext();
  loadScripts(ctx, [adapterScript]);
  ctx.__bytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  ctx.__meta = { name };
  return vm.runInContext(`${globalName}.open(globalThis.__bytes, globalThis.__meta)`, ctx);
}

{
  const out = await convertIworkToOffice({ name: "sample.pages", buffer: fixture("sample.pages") });
  test.assert(out.format === "docx" && out.fileName === "sample.docx", `sample.pages converts to sample.docx (got ${out.format}/${out.fileName})`);
  test.assert(out.report.kind === "pages" && out.report.paragraphs === 3 && out.report.mediaObjects === 1,
    `the Pages report says what it read (got ${JSON.stringify(out.report)})`);
  test.assert(out.report.notCarried.includes("iwork_loss_layout") && out.report.notCarried.includes("iwork_loss_media"),
    `layout and the seen media object are named as not carried (got ${JSON.stringify(out.report.notCarried)})`);
  const doc = await openWith("app/vendor/clioworks-v3/quire-adapter.js", "ClioWorksQuireAdapter", out.bytes, "sample.docx");
  const texts = doc.paragraphs().map((p) => p.text);
  test.assert(texts.join("|") === "搬家周报|这个周末要把东西搬到新家，先做准备。|第一批装书，第二批装厨房。",
    `the docx copy's paragraphs read back through the desk's own adapter (got ${texts.join("|")})`);
}

{
  const out = await convertIworkToOffice({ name: "sample.numbers", buffer: fixture("sample.numbers") });
  test.assert(out.format === "xlsx" && out.fileName === "sample.xlsx", `sample.numbers converts to sample.xlsx (got ${out.format}/${out.fileName})`);
  test.assert(out.report.kind === "numbers" && out.report.tables === 1 && out.report.rows === 2,
    `the Numbers report says what it read (got ${JSON.stringify(out.report)})`);
  test.assert(out.report.notCarried.includes("iwork_loss_formulas") && !out.report.notCarried.includes("iwork_loss_media"),
    `formulas are named as not carried; media is not claimed when none was seen (got ${JSON.stringify(out.report.notCarried)})`);
  const wb = await openWith("app/vendor/clioworks-v3/ledger-adapter.js", "ClioWorksLedgerAdapter", out.bytes, "sample.xlsx");
  test.assert(wb.sheets().map((s) => s.name).join("|") === "预算", `the sheet name reads back (got ${wb.sheets().map((s) => s.name).join("|")})`);
  test.assert(wb.getCell("预算", "A1").value === "物品" && wb.getCell("预算", "A2").value === "纸箱",
    "the string cells read back");
  test.assert(wb.getCell("预算", "B2").value === 20 && typeof wb.getCell("预算", "B2").value === "number",
    `a numeric-looking cell stays a number in the copy (got ${typeof wb.getCell("预算", "B2").value} ${wb.getCell("预算", "B2").value})`);
}

{
  const out = await convertIworkToOffice({ name: "sample.key", buffer: fixture("sample.key") });
  test.assert(out.format === "pptx" && out.fileName === "sample.pptx", `sample.key converts to sample.pptx (got ${out.format}/${out.fileName})`);
  test.assert(out.report.kind === "keynote" && out.report.slides === 2, `the Keynote report says what it read (got ${JSON.stringify(out.report)})`);
  test.assert(out.report.notCarried.includes("iwork_loss_slide_design"),
    `slide design is named as not carried (got ${JSON.stringify(out.report.notCarried)})`);
  const deck = await openWith("app/vendor/clioworks-v3/lectern-adapter.js", "ClioWorksLecternAdapter", out.bytes, "sample.pptx");
  test.assert(deck.slideCount() === 2, `both slides read back (got ${deck.slideCount()})`);
  const first = deck.runs(0).map((r) => r.text);
  const second = deck.runs(1).map((r) => r.text);
  test.assert(first.join("|") === "搬家简报|周六上午装箱。|周日下午搬运。",
    `slide 1 opens as title + body paragraphs (got ${first.join("|")})`);
  test.assert(second.join("|") === "第二天|整理新家，先擦地板。",
    `a multi-line block keeps only its first line as the title (got ${second.join("|")})`);
}

/* --------------------------------------------------- 5. failure copy paths --- */

let emptyError = null;
try { await convertIworkToOffice({ name: "empty.pages", buffer: buildEmptyFixture() }); }
catch (error) { emptyError = error; }
test.assert(emptyError && emptyError.code === "IWORK_CONVERT_EMPTY",
  `a bundle with nothing readable is refused, not copied empty (got ${emptyError && emptyError.code})`);

let nameError = null;
try { await convertIworkToOffice({ name: "notes.txt", buffer: buildEmptyFixture() }); }
catch (error) { nameError = error; }
test.assert(nameError && nameError.code === "IWORK_UNSUPPORTED_NAME", "a non-iWork name is refused up front");

// The browser side turns the route's codes into its own copy: the mapping and
// the keys it picks must both exist, or the writer would meet a bare key.
test.assert(
  moduleSource.includes(`errorCode === 'iwork_no_preview_pdf' ? 'iwork_pages_no_preview' : 'iwork_pages_failed'`)
    && moduleSource.includes(`error?.code === 'IWORK_CONVERT_EMPTY' || error?.code === 'IWORK_UNSUPPORTED_NAME'`),
  "conversion failures map to named desk copy, never to server log text",
);
test.assert(
  reader.includes('t("iwork_copy_failed","")'),
  "a lazy-load failure of the copy module degrades to the plain failure line",
);

/* ------------------------------- 6. the first-save list, through real t() --- */

const tables = {};
for (const [lang, file] of [["En", "app/data/translations-en.js"], ["Zh", "app/data/translations-zh.js"]]) {
  const box = { window: {} };
  vm.runInNewContext(read(file), box);
  tables[lang] = box.window[`AISystem6Translations${lang}`];
}

function deskWith(lang) {
  const box = { window: { t(key, ...args) {
    const value = tables[lang][key];
    return typeof value === "function" ? value(...args) : value;
  } }, console: { warn() {} } };
  box.globalThis = box.window;
  vm.createContext(box);
  vm.runInNewContext(moduleSource, box, { filename: "app/features/iwork-reading.js" });
  return box.window.AISystem6IworkReading;
}

{
  const api = deskWith("Zh");
  const report = { kind: "pages", paragraphs: 3, mediaObjects: 1, notCarried: ["iwork_loss_layout", "iwork_loss_media"] };
  const message = api.firstSaveMessage(report, "sample.docx");
  test.assert(message.includes("「sample.docx」存进项目硬盘"), `the list names the copy it would write (got ${message.split("\n")[0]})`);
  test.assert(message.includes("3 段文字"), "the list says what the copy carries");
  test.assert(message.includes("以下 2 项不随副本走"), "the list counts the lossy items");
  test.assert(message.includes("版面、字体与样式") && message.includes("原件中的 1 个图片/媒体对象"),
    "every lossy item the importer saw is listed in the writer's language");
  test.assert(message.includes("原件只读") && message.includes("不写回 iWork"),
    "the list states the boundary: original read-only, no iWork write-back");
  test.assert(api.kindFor("预算.numbers") === "numbers" && api.kindFor("简报.key") === "keynote" && api.kindFor("x.txt") === "",
    "the desk module's own kind detection answers the three formats");
}

{
  // Both tables answer every iWork key the desk and Reader actually name —
  // t() is called with computed keys (appName's ternary), so the keys are
  // collected as the literals they are spelled as, wherever they appear.
  // Keys are collected as string literals, minus the route's error codes,
  // which are spelled the same way but only ever compared, never translated.
  const literals = (source) => [...source.matchAll(/['"](iwork_[a-z_]+)['"]/g)]
    .filter((m) => !/(===\s*|code:\s*|code\s*=\s*)$/.test(source.slice(Math.max(0, m.index - 12), m.index)))
    .map((m) => m[1]);
  const used = [...new Set([...literals(moduleSource), ...literals(reader)])];
  test.assert(used.length >= 18 && used.every((key) => key in tables.En && key in tables.Zh),
    `every iWork string the desk uses is in both translation files (${used.length} keys)`);
  test.assert(tables.Zh.iwork_make_office_copy === "建副本…" && tables.En.iwork_make_office_copy === "Make Office Copy…",
    "the menu row's label is the spec's 「建副本…」");
  test.assert(tables.Zh.iwork_pages_no_preview("Keynote").includes("Keynote") && /Keynote/.test(tables.En.iwork_pages_no_preview("Keynote")),
    "the no-preview advice names the app to open instead");
}

// The list asks before anything is written: the modal's default is Cancel, so
// Return alone never writes a copy.
test.assert(
  moduleSource.includes("defaultAction: 'cancel'") && moduleSource.includes("confirmKey: 'iwork_copy_save_button'"),
  "the first-save question defaults to Cancel and names its Save Copy button",
);

test.finish();
