#!/usr/bin/env node
// Break-UI fixtures: four Project Hard Disk backups (worst, empty, one, huge)
// that enter the app through the same door a user's imported backup does.
//
//   node tooling/dev/worst-case-disks.mjs          write + self-check
//   open http://localhost:4173/?data=worst         (localhost only)
//
// Output goes to apps/desktop/app/dev/worst-case/ (git-ignored, never released). The
// loader is apps/desktop/app/dev/data-switch.js. Each file is a classic script
// that registers the sealed backup under the route "dev-<name>", which the
// shared-disk mount path (openSharedProjectDisk) then imports like any
// shared link.
//
// Timestamps that say "3 minutes ago" are relative to the moment this script
// runs; re-run it for a fresh clock. Every worst-case value is either a
// realistic naming pattern or beyond the importer's real limits (the schema has
// none per field: strings up to 32 MiB, arrays up to 100,000 items).

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { withIntegrity } from "../lib/project-disk-integrity.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const outDir = join(root, "apps", "desktop", "app", "dev", "worst-case");

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ago = (minutes) => iso(now - minutes * 60_000);
const T2019 = "2019-03-02T08:15:00.000Z";

// Deterministic ids: the same fixture seals to the same bytes every run.
const uid = (label) => {
  const h = createHash("sha1").update(`break-ui:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const cjk = (s) => (String(s).match(/[㐀-鿿]/g) || []).length;

// ---- text material ---------------------------------------------------------
const SENTENCES = [
  "两台手机放在同一张桌子上，最先被注意到的不是屏幕，而是重量。",
  "钛金属的那一台拿在手里偏凉，铝的那一台更轻，玻璃背板则让两者都显得比数字上更滑。",
  "我把它们交给三个人各用一周：一个常年单手刷手机的编辑，一个习惯戴手套骑车的外卖员，一个把手机当相机用的老摄影师。",
  "他们说的不是同一件事，却在同一个地方卡住了：握住的时候，你是在感受材质，还是在计算还能撑多久。",
  "官方给出的数字是 231 克和 165 克，但没有人在店里称过，大家只是凭手感相信。",
  "采访里有一句话我反复听了很多遍：「它不重，只是让我每次都想起它在手里。」",
  "这句话没有被我改写成结论，原样放在这里，等后面的证据来决定它站不站得住。",
  "反方的材料同样扎实：有人把同一台机器换了三种壳，重量差了不到二十克，却打了完全不同的分。",
];
const prose = (words, seed = 0) => {
  let out = "";
  let i = seed;
  while (cjk(out) < words) {
    out += SENTENCES[i % SENTENCES.length];
    i += 1;
    if (i % 4 === 0) out += "\n\n";
  }
  let count = 0;
  let cut = out.length;
  for (let k = 0; k < out.length; k += 1) {
    if (/[㐀-鿿]/.test(out[k])) count += 1;
    if (count === words) { cut = k + 1; break; }
  }
  return `${out.slice(0, cut)}。`;
};

const URL300 = `https://www.example-newsroom.test/archive/2026/10/31/${"interview-transcript-iphone-17-pro-max-versus-iphone-air-weight-materials-".repeat(3)}index.html?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-roundup&session=9f8e7d6c5b4a`.slice(0, 300);

// ---- builders ---------------------------------------------------------------
function backupFor(label, { project, folders = [], files = [], scraps = [], trash = [], projectCdItems = [], references = [] }) {
  const projectId = project.id;
  const tag = (list) => list.map((item) => ({ projectId, ...item }));
  return withIntegrity({
    format: "ai-system-6-project-disk",
    formatVersion: 7,
    schemaVersion: 3,
    appVersion: "2.0.0-beta.1",
    appBuild: "20261031.1",
    storageVersion: 2,
    exportedAt: iso(now),
    projectRevision: project.updatedAt,
    project,
    folders: tag(folders),
    files: tag(files),
    scraps: tag(scraps),
    trash: tag(trash),
    projectCdItems: tag(projectCdItems),
    references: tag(references),
    documentRevisions: [],
    darkroomRecords: [],
    imageAttachments: [],
  });
}

const baseProject = (label, extra) => ({
  id: uid(`${label}:project`),
  name: "Untitled",
  createdAt: T2019,
  updatedAt: iso(now),
  archived: false,
  questionSheet: "",
  outline: "",
  outlineSections: [],
  drafts: [],
  writingSurfaces: {},
  documentTabs: [],
  activeDocumentTabIds: {},
  dictionaryTerms: [],
  flowState: {},
  sourceRegistry: { allocations: {}, nextN: 1 },
  manuscriptOwnsDraft: true,
  manuscriptLinkedToOutline: true,
  ...extra,
});

// The manuscript tab a real backup carries, so TeachText opens on the final file.
const manuscriptTab = (label, file) => {
  const id = uid(`${label}:tab`);
  return {
    documentTabs: [{
      id, app: "teachText", role: "manuscript", title: file.name, backing: { type: "manuscript" },
      state: { activeTextFileId: file.id, documentRole: "manuscript", name: file.name, folder: "Documents", body: file.body, label: "final", workflowState: "final", selectionStart: 0, selectionEnd: 0, scrollTop: 0 },
      createdAt: file.createdAt || T2019, updatedAt: file.updatedAt || T2019, order: 0,
    }],
    activeDocumentTabIds: { reader: null, teachText: id, docMap: null, timeMachine: null },
    flowState: { topic: true, research: true, outline: true, drafting: true, check: false },
  };
};

const textFile = (label, name, body, extra = {}) => ({
  id: uid(`${label}:file:${name}`),
  type: "text",
  name,
  body,
  createdAt: T2019,
  updatedAt: ago(60),
  hash: createHash("sha256").update(body).digest("hex"),
  ...extra,
});

const scrapOf = (label, title, body, source, extra = {}) => ({
  id: uid(`${label}:scrap:${title}:${body.slice(0, 12)}`),
  title,
  body,
  tags: [],
  source,
  selectedText: body.slice(0, 120),
  sourceId: "",
  sourceTitle: "",
  sourceKind: "",
  capturedAt: ago(90),
  images: [],
  createdAt: ago(90),
  updatedAt: ago(90),
  ...extra,
});

// ---- WORST ------------------------------------------------------------------
function worst() {
  const L = "worst";
  const longName = "iPhone 17 Pro Max 与 iPhone Air：两台手机、三种材质、一个关于重量的老问题（第二版·修订）";
  const docs = { id: uid(`${L}:folder:Documents`), name: "Documents", parentId: null, createdAt: T2019, updatedAt: T2019 };
  const deep = {
    id: uid(`${L}:folder:deep`),
    name: "2026 年第四季度外部采访与口述史素材（含未经授权引用的部分，发布前必须逐条核对）",
    parentId: docs.id, createdAt: T2019, updatedAt: ago(5),
  };
  const one = { id: uid(`${L}:folder:one`), name: "我", parentId: docs.id, createdAt: ago(60 * 24 * 400), updatedAt: ago(60 * 24 * 400) };
  const clio = { id: uid(`${L}:folder:ClioTalk`), name: "ClioTalk", parentId: null, createdAt: T2019, updatedAt: T2019 };
  const heads = ["先说结论的位置：重量不是参数，是你每天握住它的次数",
    "三位使用者与同一台手机", "钛、铝与玻璃：同样的克数为什么手感不同（以及我为什么不再相信「轻就是好」）",
    "反方：有人换了三种壳，打分差了二十克的距离", "还没有证据支撑的部分", "我"];
  // 12,847 characters of text in all, headings included, so the count the
  // Finder and Project CD show is a number with a thousands separator.
  const headChars = cjk(longName) + heads.reduce((n, h) => n + cjk(h), 0);
  const budget = 12847 - headChars;
  const share = [0.22, 0.2, 0.2, 0.16, 0.12, 0];
  const words = share.map((f) => Math.floor(budget * f));
  words[5] = budget - words.slice(0, 5).reduce((n, v) => n + v, 0);
  const manuscriptBody = `# ${longName}\n\n*Weight, Material, and the Hand: A Second Edition (Revised)*\n\n${
    heads.map((h, i) => `## ${h} {#w${i}}\n\n${prose(words[i], i)}`).join("\n\n")
  }`;
  const files = [
    textFile(L, longName, manuscriptBody, { label: "final", folderId: docs.id, updatedAt: ago(3) }),
    textFile(L, "访谈逐字稿-落落-2026-10-31-第三次-修订-final.md", prose(2400, 1), { folderId: docs.id, updatedAt: ago(3 * 60) }),
    textFile(L, "访谈逐字稿-落落-2026-10-31-第三次-修订-final-v2.md", prose(2410, 2), { folderId: docs.id, updatedAt: ago(2) }),
    textFile(L, "Aleksandra Wiśniewska-Kowalczyk's notes on the Bartholomew-Fitzgerald interview", prose(300, 3), { folderId: docs.id, createdAt: T2019, updatedAt: T2019 }),
    textFile(L, "🍎 发布会当晚的笔记 🍏", prose(500, 4), { folderId: docs.id, updatedAt: ago(40) }),
    textFile(L, "我", "我。", { folderId: docs.id, updatedAt: ago(1) }),
    textFile(L, "ملاحظات المقابلة — Interview notes (مراجعة ٣)", prose(200, 5), { folderId: docs.id }),
    textFile(L, "<b>draft</b> & \"quotes\" — 100% [final] #1?.md", prose(120, 6), { folderId: docs.id, updatedAt: iso(now + 400 * 86_400_000) }),
    textFile(L, "legacy-import-no-dates", "这份文件来自旧版本导出，没有创建与修改时间。", { folderId: docs.id, createdAt: undefined, updatedAt: undefined }),
    textFile(L, "第三章", "", { folderId: docs.id, updatedAt: ago(10) }),
    textFile(L, "采访提纲（给摄影师）", prose(160, 7), { folderId: deep.id, updatedAt: ago(5) }),
    {
      id: uid(`${L}:chat:1`), type: "chat", folderId: clio.id,
      name: "把「两台手机、三种材质」改成一个更不像发布会通稿的开头，再检查有没有替我下结论（第 14 轮）",
      messages: [
        { role: "user", content: "这一段是不是太像通稿了？" },
        { role: "assistant", content: "有两处像：第一句的排比，和结尾的升华。你原话里的那句「让我每次都想起它在手里」更有人味。" },
      ],
      compressedMemory: { text: "", sourceMessages: 0, updatedAt: "" }, generation: 0, titleMode: "manual",
      createdAt: ago(60 * 24 * 3), updatedAt: ago(30),
    },
    {
      id: uid(`${L}:chat:2`), type: "chat", folderId: clio.id, name: "Hi", messages: [{ role: "user", content: "hi" }],
      compressedMemory: { text: "", sourceMessages: 0, updatedAt: "" }, generation: 0, titleMode: "auto",
      createdAt: ago(1), updatedAt: ago(1),
    },
  ];
  const refs = [
    ["A_very_long_reference_file_name_without_any_spaces_Apple_Newsroom_press_release_iPhone_Air_materials_and_weight_2026_09.pdf.txt", "官方新闻稿全文。"],
    ["我", "一个字的参考资料。"],
    ["Bartholomew-Fitzgerald interview (2026-10-31)", "Interviewer: Aleksandra\nBartholomew: …"],
  ].map(([name, body], i) => ({
    id: uid(`${L}:ref:${i}`), name, body, hash: createHash("sha256").update(body).digest("hex"),
    chunks: [{ source: name, content: body, embedding: [], chunkIndex: 0, start: 0, end: body.length }],
    embeddingModel: "local-embedding", enabled: i !== 1, createdAt: T2019, updatedAt: ago(200),
  }));
  const scraps = [
    scrapOf(L, "来源是一整条没有断点的链接：" + "很长".repeat(30), "编辑：「它不重，只是让我每次都想起它在手里。」", {
      type: "reader-note", readerKind: "web", title: "iPhone 17 Pro Max versus iPhone Air weight and materials: a long-term hands-on review from three kinds of user",
      url: URL300, site: "www.example-newsroom.test", author: "Aleksandra Wiśniewska-Kowalczyk", date: "2026-10-31", capturedAt: ago(3),
    }, { tags: ["采访", "重量", "一个相当长的标签名称用来测试标签是否会换行", "#12"], createdAt: ago(3), updatedAt: ago(3) }),
    scrapOf(L, "المقابلة (٣٠ دقيقة) — Interview", "قال المصور المخضرم: «الثقل ليس رقماً، بل عادة» — and then he said “it is a habit, not a number”, which I keep rereading 12,847 times.", {
      type: "reader-note", readerKind: "web", title: "مراجعة آيفون إير", url: "https://example.test/ar", site: "example.test", author: "", date: "", capturedAt: T2019,
    }, { createdAt: T2019, updatedAt: T2019 }),
    scrapOf(L, "", "没有标题，也没有来源的一段话。", {}, { tags: undefined }),
    scrapOf(L, "我", "我", { type: "reader-note", title: "" , url: "", site: "", author: "", date: "" }),
    scrapOf(L, "🍎🍏 first row emoji", "Mixed 中英 mixed.", { type: "reader-note", readerKind: "dossier", title: "Apple", url: "https://apple.com", site: "apple.com", author: "Apple", date: "2026-09-09" }),
    scrapOf(L, "ThisIsOneSingleVeryLongUnbrokenTitleWithoutAnySpacesFromAnImportedFileNameThatAWriterActuallyPasted_2026-10-31_FINAL_v2", "x".repeat(60) + " " + "https://example.test/" + "a".repeat(180), { type: "reader-note", title: "x", url: URL300 }),
    ...Array.from({ length: 12 }, (_, i) => scrapOf(L, `补充摘录 ${i + 1}`, `第 ${i + 1} 条摘录。${prose(40, i)}`, { type: "reader-note", title: `来源 ${i + 1}`, url: "", site: "", author: "", date: "" })),
  ];
  const trash = [
    {
      title: "访谈逐字稿-落落-2026-10-31-第三次-修订-final-v2.md（已被我误删又恢复又删除的那一份）.text",
      body: "旧稿", originalPath: `${longName} / Documents / ${deep.name}`, originalType: "file",
      originalData: textFile(L, "旧稿", "旧稿", { folderId: docs.id }),
    },
    { title: "我.scrap", body: "x", originalPath: "", originalType: "scrap", originalData: scrapOf(L, "我", "x", {}) },
    { title: "", body: "", originalType: "scrap", originalData: scrapOf(L, "trashed-untitled", "y", {}) },
  ];
  const cd = [{
    id: uid(`${L}:cd`), title: `${longName}.md`, format: "text/markdown", body: "# x", sourceDocumentId: files[0].id,
    sourceKind: "markdown", burnedAt: ago(60 * 24 * 30), updatedAt: ago(60 * 24 * 30), languageMode: "original",
    metadata: { sourceName: longName, wordCount: 12847, workflowState: "final", reviewDeskComplete: false },
  }];
  const project = baseProject(L, {
    name: longName, createdAt: T2019, updatedAt: ago(3),
    questionSheet: `先把能想到的都倒出来。\n\n## 主题\n\n- ${longName}。${"这一行故意不换行，因为很多人就是这样把问题一口气写下去的，" .repeat(8)}\n\n## 原始问题\n\n- 233 克到底算不算重？\n- 采访里那句话是原话还是我的印象？\n- ${URL300}\n`,
    outline: `# ${longName}\n\n## 先说结论的位置：重量不是参数，是你每天握住它的次数 {#w0}\n\n## 钛、铝与玻璃：同样的克数为什么手感不同（以及我为什么不再相信「轻就是好」） {#w2}\n\n### 我 {#w5}\n`,
    outlineSections: ["先说结论的位置：重量不是参数，是你每天握住它的次数", "三位使用者与同一台手机", "钛、铝与玻璃：同样的克数为什么手感不同（以及我为什么不再相信「轻就是好」）", "我"],
    drafts: [{
      id: uid(`${L}:draft:0`), title: "钛、铝与玻璃：同样的克数为什么手感不同（以及我为什么不再相信「轻就是好」）",
      sectionTitle: "钛、铝与玻璃：同样的克数为什么手感不同（以及我为什么不再相信「轻就是好」）", sourceType: "outline-section",
      sourceOutlineSection: "钛、铝与玻璃", sourceOutlineIndex: 0, sourceMarkdown: "## x", usedClips: [], body: prose(600, 2),
      createdAt: T2019, updatedAt: ago(20), sectionId: "",
    }],
    dictionaryTerms: [],
    ...manuscriptTab(L, files[0]),
  });
  return backupFor(L, { project, folders: [docs, deep, one, clio], files, scraps, trash, projectCdItems: cd, references: refs });
}

// Other projects on the same desk: the names a backup can only carry one at a
// time, so they travel beside the main disk and are imported first. They show
// up as unmounted disks and in the project switcher.
function worstExtras() {
  return [
    ["en", "Aleksandra Wiśniewska-Kowalczyk's notes on the Bartholomew-Fitzgerald interview"],
    ["one-char", "我"],
    ["emoji", "🍎🍏 苹果发布会：从头到尾的全部笔记"],
  ].map(([key, name]) => {
    const L = `worst-extra-${key}`;
    const folder = { id: uid(`${L}:folder`), name: "Documents", parentId: null, createdAt: T2019, updatedAt: T2019 };
    const file = textFile(L, name, prose(300, 1), { folderId: folder.id, label: "final" });
    return backupFor(L, { project: baseProject(L, { name, createdAt: T2019, updatedAt: ago(60 * 24 * 40), ...manuscriptTab(L, file) }), folders: [folder], files: [file] });
  });
}

// ---- EMPTY ------------------------------------------------------------------
function empty() {
  const L = "empty";
  return backupFor(L, { project: baseProject(L, { name: "新项目", createdAt: ago(1), updatedAt: ago(1) }) });
}

// ---- ONE (exactly one of everything) ----------------------------------------
function one() {
  const L = "one";
  const folder = { id: uid(`${L}:folder`), name: "Documents", parentId: null, createdAt: ago(60), updatedAt: ago(60) };
  const file = textFile(L, "唯一的一篇", "一。", { folderId: folder.id, label: "final", updatedAt: ago(1) });
  const ref = {
    id: uid(`${L}:ref`), name: "唯一的来源.md", body: "来源。", hash: createHash("sha256").update("来源。").digest("hex"),
    chunks: [{ source: "唯一的来源.md", content: "来源。", embedding: [], chunkIndex: 0, start: 0, end: 3 }],
    embeddingModel: "local-embedding", enabled: true, createdAt: ago(60), updatedAt: ago(60),
  };
  const scrap = scrapOf(L, "唯一的摘录", "一句话。", { type: "reader-note", title: "唯一的来源", url: "https://example.test/one", site: "example.test", author: "我", date: "2026-10-31" }, { tags: ["一"] });
  const trashed = { title: "唯一的废稿.scrap", body: "废", originalPath: "一人项目 / Scrapbook", originalType: "scrap", originalData: scrapOf(L, "废", "废", {}) };
  const cd = { id: uid(`${L}:cd`), title: "唯一的一篇.md", format: "text/markdown", body: "一。", sourceDocumentId: file.id, sourceKind: "markdown", burnedAt: ago(5), updatedAt: ago(5), languageMode: "original", metadata: { sourceName: "唯一的一篇", wordCount: 1, workflowState: "final" } };
  const project = baseProject(L, {
    name: "一人项目", createdAt: ago(60), updatedAt: ago(1), questionSheet: "一个问题。", outline: "# 一人项目\n\n## 唯一的一节 {#a1}\n",
    outlineSections: ["唯一的一节"],
    drafts: [{ id: uid(`${L}:draft`), title: "唯一的一节", sectionTitle: "唯一的一节", sourceType: "outline-section", sourceOutlineSection: "唯一的一节", sourceOutlineIndex: 0, sourceMarkdown: "## 唯一的一节", usedClips: [], body: "一。", createdAt: ago(60), updatedAt: ago(1), sectionId: "" }],
    dictionaryTerms: [{ id: uid(`${L}:term`), term: "一", definition: "数字一。", avoid: [], kind: "word", createdAt: ago(60), updatedAt: ago(60) }],
    ...manuscriptTab(L, file),
  });
  return backupFor(L, { project, folders: [folder], files: [file], scraps: [scrap], trash: [trashed], projectCdItems: [cd], references: [ref] });
}

// ---- HUGE (200 files, 1,000 scraps) -----------------------------------------
function huge() {
  const L = "huge";
  const docs = { id: uid(`${L}:folder`), name: "Documents", parentId: null, createdAt: ago(60 * 24 * 900), updatedAt: ago(5) };
  const extra = Array.from({ length: 30 }, (_, i) => ({ id: uid(`${L}:folder:${i}`), name: `访谈归档 ${String(i + 1).padStart(2, "0")}`, parentId: docs.id, createdAt: ago(60 * 24 * 200), updatedAt: ago(60 * 24 * i) }));
  const files = Array.from({ length: 200 }, (_, i) =>
    textFile(L, `访谈逐字稿-${String(i + 1).padStart(4, "0")}-${["落落", "编辑", "摄影师", "外卖员"][i % 4]}-2026-10-${String((i % 28) + 1).padStart(2, "0")}.md`, prose(180 + (i % 7) * 40, i), {
      folderId: i < 100 ? docs.id : extra[i % extra.length].id, label: i === 0 ? "final" : undefined, updatedAt: ago(i * 37),
    }));
  const scraps = Array.from({ length: 1000 }, (_, i) =>
    scrapOf(L, `摘录 ${i + 1}：${SENTENCES[i % SENTENCES.length].slice(0, 14)}`, `${prose(60 + (i % 5) * 20, i)}`, {
      type: "reader-note", readerKind: "web", title: `来源文章 ${(i % 80) + 1}`, url: `https://example.test/a/${i + 1}`, site: "example.test", author: "作者", date: "2026-10-01",
    }, { tags: [`#${i % 40}`], createdAt: ago(i * 11), updatedAt: ago(i * 11) }));
  const project = baseProject(L, { name: "两百篇访谈与一千条摘录的总档案", createdAt: ago(60 * 24 * 900), updatedAt: ago(1), questionSheet: "总档案的问题。", ...manuscriptTab(L, files[0]) });
  return backupFor(L, { project, folders: [docs, ...extra], files, scraps });
}

// ---- write + self-check -----------------------------------------------------
const builders = { worst, empty, one, huge };
mkdirSync(outDir, { recursive: true });

const check = new vm.Script(readFileSync(join(root, "apps/desktop/app/core/project-disk-backup.js"), "utf8"));
const sandbox = { window: {}, crypto: globalThis.crypto, TextEncoder, console };
vm.createContext(sandbox);
check.runInContext(sandbox);
const api = sandbox.window.AISystem6ProjectDiskBackup;

let failed = false;
for (const [name, build] of Object.entries(builders)) {
  const backup = build();
  const verdict = api.validateBackup(JSON.parse(JSON.stringify(backup)));
  const integrity = verdict.valid ? await api.verifyIntegrity(JSON.parse(JSON.stringify(backup))) : { valid: false, errors: [] };
  const route = `dev-${name}`;
  const extras = name === "worst" ? worstExtras() : [];
  for (const extra of extras) {
    const v = api.validateBackup(JSON.parse(JSON.stringify(extra)));
    if (!v.valid) { failed = true; console.log("NO  extra", extra.project.name, JSON.stringify(v.errors).slice(0, 300)); }
  }
  const source = `// GENERATED by tooling/dev/worst-case-disks.mjs -- git-ignored, dev only.\n`
    + `window.AISystem6SharedProjectDisks = window.AISystem6SharedProjectDisks || {};\n`
    + `window.AISystem6SharedProjectDisks[${JSON.stringify(route)}] = ${JSON.stringify(backup)};\n`
    + (extras.length ? `window.AISystem6SharedProjectDisks[${JSON.stringify(route + "-extras")}] = ${JSON.stringify(extras)};\n` : "");
  writeFileSync(join(outDir, `${name}.js`), source);
  const ok = verdict.valid && integrity.valid;
  failed ||= !ok;
  console.log(`${ok ? "OK " : "NO "} ${name.padEnd(5)} files=${backup.files.length} folders=${backup.folders.length} scraps=${backup.scraps.length} trash=${backup.trash.length} ${(source.length / 1024).toFixed(0)} KiB`
    + (ok ? "" : ` ${JSON.stringify([...verdict.errors, ...integrity.errors]).slice(0, 400)}`));
}
process.exit(failed ? 1 : 0);
