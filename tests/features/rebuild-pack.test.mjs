// Rebuild pack — executable contract.
//
// One pure module decides whether a rebuild of the writing route may land
// and what landing does to a project. These are the promises it keeps:
//
//   1. sections that split the manuscript, in order, with nothing left
//      over — by heading, or by first words for a manuscript with none; the
//      article sets how many (at least two), and a caller may ask for an exact
//      count (the demo disks keep six); study mode keeps someone else's
//      article as reading, never as the writer's manuscript;
//   2. in own mode the author's text is never rewritten: every difference
//      from the base is a declared change, and a correction points at a
//      fact-ledger row;
//   3. private chats never become dossiers, kept or new, and private detail
//      is refused by field path without the report echoing it;
//   4. applying a pack renumbers dossiers with their bodies, keeps the text
//      that was there as a revision, credits the round to its author, and
//      leaves a receipt;
//   5. the hashes are the desk's own, so a pack-written record is one the
//      desk would have written.
//
// Every fixture is synthetic. No real person, place or shop appears here.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("rebuild-pack");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(read("apps/desktop/app/core/rebuild-pack.js"), context, { filename: "rebuild-pack.js" });
const R = context.window.AISystem6RebuildPack;
test.assert(R && typeof R.validateRebuildPack === "function", "the module installs its API without a DOM");

// --- fixtures ---------------------------------------------------------------

const base = [
  "# 灯塔笔记",
  "",
  "开头一段写海边的灯塔。",
  "",
  "## 第一夜",
  "",
  "灯塔的光转了 12 圈。",
  "",
  "## 第二夜",
  "",
  "雾很大，看不见船。",
  "",
  "## 第三夜",
  "",
  "守塔人换了灯泡。",
  "",
  "## 第四夜",
  "",
  "风停了。",
  "",
  "## 第五夜",
  "",
  "有人送来一封信。",
  "",
  "## 第六夜",
  "",
  "天亮以后我回家了。",
].join("\n");

const manuscript = `${base.replace("转了 12 圈", "转了 14 圈")}\n\n## 九月补记\n\n这篇写在春天。`;

function project() {
  return {
    format: "ai-system-6-project-disk",
    project: {
      id: "p1",
      name: "灯塔",
      questionSheet: "# 问题单 · 灯塔\n\n## 主题\n\n灯塔。\n\n## 观点成型（编辑前思考）\n\n- 旧的主轴",
      outline: "## 旧\n\n旧大纲",
      outlineSections: ["旧"],
      drafts: [{ id: "d1", title: "旧", body: "旧" }],
      documentTabs: [{ id: "t1", app: "teachText", role: "manuscript", title: "灯塔", backing: { type: "manuscript" }, state: { activeTextFileId: "f1", name: "灯塔", body: base } }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    folders: [{ id: "doc", name: "Documents", parentId: null }, { id: "clio", name: "ClioTalk", parentId: null }],
    files: [
      { id: "f1", projectId: "p1", type: "text", name: "灯塔", folderId: "doc", label: "final", body: base, hash: "" },
      { id: "f2", projectId: "p1", type: "text", name: "审校台核查记录", folderId: "doc", artifactKind: "review-findings", body: "旧", hash: "" },
    ],
    scraps: [
      { id: "s1", projectId: "p1", title: "档案 01｜码头的告示", body: "来源与日期\n档案 03｜码头的告示（2026）\n类别：公开", tags: [], source: { type: "reader-note" } },
      { id: "s2", projectId: "p1", title: "档案 02｜朋友的留言", body: "来源与日期\n档案 02｜朋友的留言", tags: [], source: { type: "reader-note" } },
    ],
    references: [{ id: "r1", projectId: "p1", name: "留言导出", body: "……" }, { id: "r2", projectId: "p1", name: "灯塔手册", body: "……" }],
    projectCdItems: [{ id: "cd1", projectId: "p1", title: "灯塔.md", body: base, sourceDocumentId: "f1", sourceKind: "manuscript" }],
    documentRevisions: [{ id: "v1", projectId: "p1", documentId: "f1", parentRevisionId: "", phase: "final", body: base, contentHash: R.revisionContentHash(base), origin: "user", operation: "manual-save", runRecordId: "", createdAt: "2026-01-01T00:00:00.000Z" }],
    trash: [],
    exportedAt: "2026-01-01T00:00:00.000Z",
  };
}

function pack(overrides = {}) {
  return {
    packVersion: 1,
    mode: "own",
    target: { kind: "round", projectId: "p1" },
    roundDate: "2026-09-26",
    roundTitle: "回到作者原文",
    manuscript: {
      title: "灯塔笔记",
      markdown: manuscript,
      base: { text: base },
      changes: [{ kind: "correction", before: "转了 12 圈", after: "转了 14 圈", factKey: "f1" }],
      addendum: { heading: "九月补记", markdown: "这篇写在春天。" },
    },
    sections: [
      { title: "第一夜", covers: ["第一夜"], hkrrIntent: "K", note: "开头与第一夜", dossierKeys: ["d-a"] },
      { title: "第二夜", covers: ["第二夜"], note: "雾" },
      { title: "第三夜", covers: ["第三夜"], note: "灯泡", dossierKeys: ["s1"] },
      { title: "第四夜", covers: ["第四夜"], note: "风" },
      { title: "第五夜", covers: ["第五夜"], note: "信" },
      { title: "第六夜与补记", covers: ["第六夜", "九月补记"], hkrrIntent: "R + Rhythm", note: "回家" },
    ],
    outlinePreface: { thesis: "灯塔的光是数得出来的。（作者原话）", method: "正文照原文。", avoid: "私人对话。" },
    questionSheetRound: { bullets: ["正文用作者原文。"], stance: ["主轴：光是数得出来的。"] },
    factLedger: [{ key: "f1", claim: "光转了 14 圈", source: "灯塔管理处公告", dossierKey: "d-a", confidence: "官方" }],
    dossiers: [{ key: "d-a", title: "管理处公告", originKind: "official", sourceTitle: "公告", site: "example.org", date: "2026-03", url: "https://example.org/notice", quote: "每夜 14 圈", judgement: "更正的依据" }],
    retire: { scrapIds: ["s2"], referenceIds: ["r1"], reason: "private-chat" },
    reviewRecord: { selfCheck: "正文是作者的。", openThreads: ["船名未知。"] },
    lineage: { timeline: [{ when: "2026-03", event: "公告", source: "管理处" }], removed: [{ what: "私聊来源的档案", count: 1, reason: "只作背景" }] },
    extraFiles: [{ name: "分镜对照", markdown: "| 段 | 画面 |\n| --- | --- |\n| 1 | 灯塔 |" }],
    reviewNote: "复核（2026-09-26）：回到原文。",
    ...overrides,
  };
}

const snapshot = () => {
  const disk = project();
  return { project: disk.project, scraps: disk.scraps, references: disk.references, files: disk.files, baseManuscript: base };
};

const codes = (result) => result.errors.map((entry) => entry.code);

// --- 1. sections --------------------------------------------------------------

const ok = R.validateRebuildPack(pack(), snapshot());
test.assert(ok.ok, `a well-formed round passes (${JSON.stringify(ok.errors)})`);

// The article sets the count (owner decision 2026-09-26): five merged sections
// pass, one does not, and the demo disks' tooling can still ask for six.
const five = pack();
five.sections = [...five.sections.slice(0, 4), { title: "第五夜到补记", covers: ["第五夜", "第六夜", "九月补记"], note: "信与回家" }];
test.assert(R.validateRebuildPack(five, snapshot()).ok, `five sections that cover the article pass (${JSON.stringify(R.validateRebuildPack(five, snapshot()).errors)})`);
test.assert(codes(R.validateRebuildPack(five, snapshot(), { sectionRule: { exact: 6 } })).includes("E1"), "a caller that asks for exactly six refuses five");
const one = pack();
one.sections = [{ title: "全篇", covers: ["第一夜", "第二夜", "第三夜", "第四夜", "第五夜", "第六夜", "九月补记"] }];
test.assert(codes(R.validateRebuildPack(one, snapshot())).includes("E1"), "a single section is refused: it is no outline");

const skipped = pack();
skipped.sections[2] = { title: "第三夜", covers: ["第四夜"] };
test.assert(codes(R.validateRebuildPack(skipped, snapshot())).includes("E2"), "a section that skips a heading is refused");

const plain = "# 无题\n\n第一段。\n\n第二段。\n\n第三段。\n\n第四段。\n\n第五段。\n\n第六段。\n\n第七段。";
const plainSplit = R.splitSections(plain, ["第一段", "第二段", "第三段", "第四段", "第五段", "第六段"].map((quote, index) => ({ title: `节${index}`, startQuote: index ? quote : "" })));
test.assert(plainSplit.errors.length === 0 && plainSplit.parts[5].sourceMarkdown === "第六段。\n\n第七段。", "a manuscript without headings splits by the first words of each section");
const outOfOrder = R.splitSections(plain, ["", "第三段", "第二段", "第四段", "第五段", "第六段"].map((quote, index) => ({ title: `节${index}`, startQuote: quote })));
test.assert(outOfOrder.errors.length > 0, "sections that start out of order are refused");

// --- 2. own mode --------------------------------------------------------------

const drift = pack();
drift.manuscript.markdown = manuscript.replace("雾很大", "雾非常大");
test.assert(codes(R.validateRebuildPack(drift, snapshot())).includes("E3"), "an undeclared change to the author's text is refused");

const unledgered = pack();
unledgered.manuscript.changes[0].factKey = "nope";
test.assert(codes(R.validateRebuildPack(unledgered, snapshot())).includes("E3"), "a correction must point at a fact-ledger row");

const ambiguous = pack();
ambiguous.manuscript.changes = [{ kind: "removal", before: "夜", after: "", reason: "x" }];
test.assert(codes(R.validateRebuildPack(ambiguous, snapshot())).includes("E3"), "a change whose base text is not unique is refused");

// --- 3. ledger labels -----------------------------------------------------------

test.assert(R.normalizeConfidence("实物") === "实测" && R.normalizeConfidence("官方+实测") === "官方＋实测", "实物 folds into 实测 and + becomes ＋");
const badLabel = pack();
badLabel.factLedger[0].confidence = "可能";
test.assert(codes(R.validateRebuildPack(badLabel, snapshot())).includes("E4"), "an unknown confidence label is refused");
const ungrounded = pack();
ungrounded.factLedger[0] = { key: "f1", claim: "x", source: "y", confidence: "官方" };
test.assert(codes(R.validateRebuildPack(ungrounded, snapshot())).includes("E4"), "an official claim with no URL or dossier is refused");

// --- 4. privacy -------------------------------------------------------------------

const chatDossier = pack();
chatDossier.dossiers.push({ key: "d-b", title: "聊天", originKind: "private-chat", quote: "…" });
test.assert(codes(R.validateRebuildPack(chatDossier, snapshot())).includes("E6"), "a private-chat dossier is refused");

const keptChat = pack();
keptChat.retire = { scrapIds: [], referenceIds: [] };
keptChat.classify = [{ scrapId: "s2", originKind: "private-chat" }];
test.assert(codes(R.validateRebuildPack(keptChat, snapshot())).includes("E6"), "a kept dossier classified as a private chat is refused");

const phone = pack();
phone.extraFiles[0].markdown = "联系 13912345678";
const phoneResult = R.validateRebuildPack(phone, snapshot());
test.assert(codes(phoneResult).includes("E6"), "a phone number anywhere in the pack is refused");
test.assert(!JSON.stringify(phoneResult).includes("13912345678"), "the report names the field and the category, never the matched text");

const termed = pack();
termed.lineage.timeline[0].event = "在虚构码头七号遇见";
const termResult = R.validateRebuildPack(termed, snapshot(), { privacyTerms: [{ category: "place", value: "虚构码头七号" }] });
test.assert(termResult.errors.some((entry) => entry.code === "E6" && entry.path.startsWith("lineage")) && !JSON.stringify(termResult).includes("虚构码头七号"), "caller-supplied terms are refused by path without being echoed");
test.assert(!read("apps/desktop/app/core/rebuild-pack.js").includes("档口信息"), "the module carries shapes, not a list of the words it guards");

// --- 5. apply -------------------------------------------------------------------

let counter = 0;
const uuid = () => `id-${++counter}`;
const applied = R.applyRebuildPackToBackup(project(), pack(), { now: "2026-09-26T12:00:00.000Z", uuid, agentName: "Tester", provider: "guest", model: "tester" });
const out = applied.backup;
test.assert(out.project.name === "灯塔笔记" && out.files.find((file) => file.id === "f1").name === "灯塔笔记", "the project and its manuscript take the manuscript's title");
test.assert(out.project.drafts.length === 6 && out.project.outlineSections.length === 6, "six drafts and six outline sections");
test.assert(out.project.drafts[0].body.startsWith("开头一段写海边的灯塔。"), "the first section carries the text before the first heading");
test.assert(out.project.drafts[5].body.includes("这篇写在春天。") && !out.project.drafts[5].body.includes("## "), "a draft body is the section's own text without its headings");
test.assert(out.project.questionSheet.includes("## 这一轮（2026-09-26）· 回到作者原文") && out.project.questionSheet.includes("主轴：光是数得出来的。") && !out.project.questionSheet.includes("旧的主轴"), "the question sheet gains the round and its stance");
const titles = out.scraps.map((scrap) => scrap.title);
test.assert(titles[0] === "档案 01｜码头的告示" && titles[1] === "档案 02｜管理处公告", "kept dossiers come first, new ones after, numbered from 01");
test.assert(out.scraps[0].body.includes("档案 01｜码头的告示") && !out.scraps[0].body.includes("档案 03｜"), "a renumbered dossier's body follows its title");
test.assert(out.scraps[1].source.originKind === "official" && out.scraps[1].source.readerKind === "dossier", "a new dossier records where it came from");
test.assert(out.project.drafts[0].usedClips[0] === out.scraps[1].id && out.project.drafts[2].usedClips[0] === "s1", "section dossier keys resolve to ids");
test.assert(out.trash.length === 2 && out.references.length === 1, "retired items move to the trash (owner decision D7)");
const receipt = out.files.find((file) => file.artifactKind === "clio-run-record");
test.assert(receipt && receipt.runReceipt.intent === "rebuild" && receipt.runReceipt.userAction === "accept" && receipt.rebuildPack, "one receipt carries the pack and its adoption");
test.assert(out.folders.find((folder) => folder.id === receipt.folderId).parentId === "clio", "the receipt sits in ClioTalk / Run Records");
const revisions = out.documentRevisions.filter((revision) => revision.documentId === "f1");
test.assert(revisions.at(-1).origin === "guest" && revisions.at(-1).operation === "rebuild-round" && revisions.at(-1).runRecordId === receipt.id, "the round is credited to the guest and points at its receipt (owner decision D9)");
test.assert(revisions.length === 2, "no restore-before revision when the latest already holds the old text");
// One rule for the desk and the offline tool (P3 replay found the desk
// writing a second copy of the old text).
test.assert(R.restoreBeforeNeeded(null, "旧文") && !R.restoreBeforeNeeded({ contentHash: R.revisionContentHash("旧文") }, "旧文") && R.restoreBeforeNeeded({ contentHash: R.revisionContentHash("别的") }, "旧文") && !R.restoreBeforeNeeded(null, "  "), "restore-before is written only when the latest revision does not already hold the old text");
test.assert(!out.project.outline.endsWith("\n"), "the outline is stored without a trailing newline, as the desk stores it");
const cd = out.projectCdItems[0];
test.assert(cd.title === "灯塔笔记.md" && cd.body.includes("这篇写在春天") && cd.claimCheckId === out.files.find((file) => file.name === "审校台核查记录").id, "the Project CD item follows the manuscript and its claim check");
test.assert(out.files.find((file) => file.name === "审校台核查记录").body.includes("| 光转了 14 圈 | 灯塔管理处公告 | 官方 |"), "the review record carries the ledger");
test.assert(out.files.some((file) => file.name === "分镜对照"), "extra files land in Documents");
test.assert(R.checkDemoDiskStructure(out).some((problem) => problem.code === "trash"), "a disk with a non-empty trash fails the ship check");
const shipped = { ...out, trash: [] };
test.assert(R.checkDemoDiskStructure(shipped).length === 0, `an applied round with an empty trash passes the ship check (${JSON.stringify(R.checkDemoDiskStructure(shipped))})`);
test.assert(R.checkDemoDiskStructure({ ...shipped, workingSession: { version: 3 } }).some((problem) => problem.code === "working-session"), "a disk exported with its working session fails the ship check");
const forged = { ...shipped, files: [...shipped.files, { id: "x", name: "Run 2026-01-01 00:00:00 · reviewDesk · note", body: "…" }] };
test.assert(R.checkDemoDiskStructure(forged).some((problem) => problem.code === "pseudo-receipt"), "a note named like a receipt fails the ship check");
const wrongHash = { ...shipped, documentRevisions: [{ ...shipped.documentRevisions[0], contentHash: "deadbeef" }] };
test.assert(R.checkDemoDiskStructure(wrongHash).some((problem) => problem.code === "revision-hash"), "a revision hash that is not the desk's fails the ship check");
const handWritten = { ...shipped, files: shipped.files.map((file) => (file.runReceipt ? { ...file, runReceipt: { ...file.runReceipt, userAction: "accepted" } } : file)) };
test.assert(R.checkDemoDiskStructure(handWritten).some((problem) => problem.code === "receipt-vocabulary"), "a receipt in words the code does not speak fails the ship check");
test.assert(project().project.name === "灯塔", "applying never mutates the input backup");
const inDesk = R.applyRebuildPackToBackup(project(), pack(), { now: "2026-09-26T12:00:00.000Z", uuid, agentName: "Tester", skipReceipt: true, skipRevisions: true, receiptId: "held-receipt" });
// A new disk: the backup starts empty and the writer's text becomes its manuscript.
const emptyDisk = () => ({ project: { id: "p9", name: "新盘", questionSheet: "", outline: "", outlineSections: [], drafts: [], documentTabs: [] }, folders: [], files: [], scraps: [], references: [], projectCdItems: [], documentRevisions: [], trash: [] });
const fresh = pack({ target: { kind: "new-project", name: "灯塔笔记" }, retire: {}, classify: [] });
fresh.sections = fresh.sections.map((section) => ({ ...section, dossierKeys: (section.dossierKeys || []).filter((key) => key !== "s1") }));
const freshSnapshot = { project: emptyDisk().project, scraps: [], references: [], files: [], baseManuscript: "" };
test.assert(R.validateRebuildPack(fresh, freshSnapshot).ok, `an own pack for a new disk passes (${JSON.stringify(R.validateRebuildPack(fresh, freshSnapshot).errors)})`);
const newDisk = R.applyRebuildPackToBackup(emptyDisk(), fresh, { now: "2026-09-26T12:00:00.000Z", uuid, skipReceipt: true, skipRevisions: true, receiptId: "r" }).backup;
const newManuscript = newDisk.files.find((file) => file.label === "final");
test.assert(newManuscript && newManuscript.body.includes("这篇写在春天") && newDisk.project.drafts.length === 6 && newDisk.project.drafts[0].insertedFileId === newManuscript.id, "a new disk gets a manuscript file holding the writer's text");
// study: someone else's article is a reading file; drafts hold notes, never its sentences.
const study = pack({ mode: "study", target: { kind: "new-project", name: "学：灯塔笔记" }, retire: {}, classify: [], manuscript: { title: "灯塔笔记", markdown: base, changes: [] } });
study.sections = study.sections.map((section, index) => ({ ...section, covers: index === 5 ? ["第六夜"] : section.covers, dossierKeys: [] }));
study.factLedger = [];
test.assert(R.validateRebuildPack(study, freshSnapshot).ok, `a study pack for a new disk passes (${JSON.stringify(R.validateRebuildPack(study, freshSnapshot).errors)})`);
test.assert(codes(R.validateRebuildPack({ ...study, target: { kind: "round", projectId: "p1" } }, snapshot())).includes("E8"), "someone else's article never becomes a round of the writer's project");
const studied = R.applyRebuildPackToBackup(emptyDisk(), study, { now: "2026-09-26T12:00:00.000Z", uuid, skipReceipt: true, skipRevisions: true, receiptId: "r" });
test.assert(studied.backup.project.name === "学：灯塔笔记" && !studied.backup.files.some((file) => file.label === "final"), "a study disk takes the name the writer gave it and has no manuscript");
const reading = studied.backup.files.find((file) => file.name === "原文 · 灯塔笔记");
test.assert(reading && reading.body.includes("守塔人换了灯泡。") && studied.summary.readingFileId === reading.id, "the article is kept as a reading file");
test.assert(studied.backup.project.drafts[1].body === "雾" && !studied.backup.project.drafts.some((draft) => draft.body.includes("看不见船") || draft.insertedAt), "study drafts hold the notes, not the article's sentences");
test.assert(!inDesk.backup.files.some((file) => file.artifactKind === "clio-run-record") && inDesk.backup.documentRevisions.length === 1 && inDesk.summary.receiptId === "held-receipt" && inDesk.summary.previousManuscript === base, "the desk's adoption keeps its own receipt and writes revisions itself");

// --- 6. hashes are the desk's -------------------------------------------------------

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") { depth -= 1; if (depth === 0) return source.slice(start, index + 1); }
  }
  return "";
}
const deskRevision = vm.runInNewContext(`${extract(read("apps/desktop/app/core/document-revisions.js"), "revisionContentHash")}; revisionContentHash`);
const deskFile = vm.runInNewContext(`${extract(read("apps/desktop/app/core/prompt-file-runtime.js"), "hashPromptBody")}; hashPromptBody`);
for (const sample of ["", "灯塔", manuscript, "emoji 🌊 and text"]) {
  test.assert(deskRevision(sample) === R.revisionContentHash(sample), "revision hashes match document-revisions.js");
  test.assert(deskFile(sample) === R.fileContentHash(sample), "file hashes match prompt-file-runtime.js");
}

// --- 7. wiring ---------------------------------------------------------------------

test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/core/rebuild-pack.js"', "the module is a lazy runtime path");
test.assertIncludes(read("apps/desktop/app/core/config.js"), 'createLazyModuleLoader("AISystem6RebuildPack", ["app/core/rebuild-pack.js"])', "a loader names the lazy module");

test.finish();
