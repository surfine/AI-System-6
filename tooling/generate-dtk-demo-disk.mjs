#!/usr/bin/env node
// Generates the DTK 2020 showcase Project Hard Disk backup: a finished,
// self-consistent project built from the real DTK research/writing material
// (read-only, outside this repo) and assembled through the product's own
// backup code (project-disk-backup.js + project-backup-assembler.js, loaded
// exactly the way tests/helpers/backup-vm.mjs already loads them for the real
// backup contract tests). This script only supplies data; the integrity hash,
// schema validation, and bundle shape all come from the real modules.
//
// Run: node tooling/generate-dtk-demo-disk.mjs
// Output: internal/evidence/drafts/dtk-demo-disk/未来通车之后 Project Hard Disk Backup.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID, randomBytes, webcrypto } from "node:crypto";
import sharp from "sharp";
import { createBackupVm } from "../tests/helpers/backup-vm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// --- Source material (read-only; never copied wholesale) -------------------
const DTK_DIR = "/Users/aaron/Claude/Projects/DTK";
const DTK2_DIR = "/Users/aaron/Documents/DTK2";

const finalRaw = readFileSync(join(DTK_DIR, "未来通车之后_final.md"), "utf8");
const draft1Raw = readFileSync(join(DTK_DIR, "DTK_初稿.md"), "utf8");
const draft2Raw = readFileSync(join(DTK_DIR, "DTK初稿_校正版.md"), "utf8");
const researchLogRaw = readFileSync(join(DTK_DIR, "链接理解日志.md"), "utf8");
const outlineDraftRaw = readFileSync(join(DTK_DIR, "DTK_文章大纲.md"), "utf8");
const dosdude1PassageRaw = readFileSync(join(DTK_DIR, "活着的DTK_2020-2.md"), "utf8");
const federighiRaw = readFileSync(join(DTK_DIR, "DTK Lost in Transition #1.md"), "utf8");
const srtRaw = readFileSync(join(DTK_DIR, "Developer Transition Kit- EXCLUSIVE review and teardown!.srt"), "utf8");

// --- Small helpers -----------------------------------------------------------

function hexId(bytes = 3) {
  return randomBytes(bytes).toString("hex");
}

// Mirrors app/core/document-revisions.js revisionContentHash() exactly (FNV-1a).
function revisionContentHash(body = "") {
  let hash = 0x811c9dc5;
  const value = String(body || "");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

// Mirrors app/features/project-disk.js hashText() (SHA-256 hex).
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Split a manuscript on `## Title` boundaries (mirrors markdownDocumentSectionBlocks
// at level 2, simplified for content that has no fenced code blocks).
function splitSections(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const preambleLines = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (current) sections.push(current);
      current = { title: match[1].trim(), bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
    else preambleLines.push(line);
  }
  if (current) sections.push(current);
  return {
    preamble: preambleLines.join("\n").trim(),
    sections: sections.map((section) => ({
      title: section.title,
      body: section.bodyLines.join("\n").trim(),
    })),
  };
}

async function jpegDataUrl(sourcePath, width, quality) {
  const buffer = await sharp(sourcePath).resize({ width, withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  return { dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`, bytes: buffer.length };
}

function now(iso) {
  return iso;
}

// --- Parse the real manuscript lineage --------------------------------------

const finalParsed = splitSections(finalRaw.replace(/^#\s+.*\n/, "")); // strip leading "# 未来通车之后"
const finalTitle = (finalRaw.match(/^#\s+(.+)$/m) || [, "未来通车之后"])[1].trim();

const draft1Body = draft1Raw.split(/\n---\n/)[0].trim(); // drop the reference-link appendix
const draft2Body = draft2Raw.split(/\n---\n/)[0].trim(); // drop the editor-notes appendix

const draft1Parsed = splitSections(draft1Body.replace(/^#\s+.*\n/, ""));
const negativeSection = draft1Parsed.sections.find((section) => section.title.includes("死后还能不能被叫醒"));
const compositeSection = finalParsed.sections.find((section) => section.title === "被取消");

// Section ids, stamped once and kept stable through this generation run.
const sectionIds = finalParsed.sections.map(() => hexId());
const sectionsWithIds = finalParsed.sections.map((section, index) => ({
  ...section,
  id: sectionIds[index],
}));

function manuscriptMarkdown({ withCoverFigure = false, coverImageId = "" } = {}) {
  const figure = withCoverFigure && coverImageId
    ? `\n\n![DTK 封面卡：Developer Transition Kit，Mac mini 外壳 + A12Z SoC，16GB 内存，512GB SSD，macOS Big Sur developer beta + Xcode](aisystem6-image:${coverImageId})`
    : "";
  const sectionsText = sectionsWithIds
    .map((section) => `## ${section.title} {#${section.id}}\n\n${section.body}`)
    .join("\n\n");
  return `# ${finalTitle}${figure}\n\n${finalParsed.preamble}\n\n${sectionsText}`.trim();
}

// --- Run everything (async top level) ---------------------------------------

async function main() {
  const projectId = randomUUID();
  const manuscriptFileId = randomUUID();
  const findingsFileId = randomUUID();
  const receiptOutlineId = randomUUID();
  const receiptDarkroomId = randomUUID();
  const cdItemId = randomUUID();
  const manuscriptTabId = randomUUID();
  const rootFolderId = randomUUID();
  const clioTalkFolderId = randomUUID();
  const runRecordsFolderId = randomUUID();

  // --- Timestamps grounded in the real files' own mtimes ---
  const tResearchStart = "2026-07-04T14:59:00.000Z";
  const tDraft1 = "2026-07-04T15:25:00.000Z";
  const tOutline = "2026-07-05T07:31:00.000Z";
  const tDraft2 = "2026-07-13T08:28:00.000Z";
  const tFinal = "2026-07-19T21:41:00.000Z";

  // --- Images (modest, downscaled) ---
  const cover = await jpegDataUrl(join(DTK_DIR, "DTK 封面.png"), 480, 72);
  const board = await jpegDataUrl(join(DTK_DIR, "IMG_7768.JPG"), 480, 72);
  const coverImageId = randomUUID();
  const boardImageId = randomUUID();

  const imageAttachments = [
    {
      id: coverImageId,
      projectId,
      surface: "teachtext",
      name: "DTK 封面.png",
      alt: "DTK 封面卡：Developer Transition Kit 硬件规格",
      type: "image/jpeg",
      size: cover.bytes,
      originalDataUrl: cover.dataUrl,
      previewDataUrl: cover.dataUrl,
      width: 480,
      height: 270,
      previewWidth: 480,
      previewHeight: 270,
      previewSize: cover.bytes,
      createdAt: tResearchStart,
    },
    {
      id: boardImageId,
      projectId,
      surface: "questionSheet",
      name: "IMG_7768.JPG",
      alt: "维修后的 DTK 主板，虚焊补好后重新点亮",
      type: "image/jpeg",
      size: board.bytes,
      originalDataUrl: board.dataUrl,
      previewDataUrl: board.dataUrl,
      width: 480,
      height: 640,
      previewWidth: 480,
      previewHeight: 640,
      previewSize: board.bytes,
      createdAt: tDraft1,
    },
  ];

  const manuscriptBody = manuscriptMarkdown({ withCoverFigure: true, coverImageId });

  // --- Question Sheet (messy, human, grounded in the real research/critique notes) ---
  const questionSheet = [
    "先把能想到的都倒出来，回头再整理成正式栏目。",
    "",
    "## 主题",
    "",
    "- 2020 年 Apple Developer Transition Kit（DTK）：一台没被销毁、还能开机的过渡机的第一人称遗迹报告，不是开箱 / 跑分测评",
    "",
    "## 原始问题",
    "",
    "- Rosetta 2 官方最新退场措辞要不要写死时间？",
    "- \"11.2.3 是最后一个可直接侧载 IPA 的版本\"到底有没有独立信源，还是只有我自己的印象？",
    "- t8027 内核到底是哪个 11.3 版本之后从内核里消失的？",
    "- 服务器对 ADP3,2 返回 400，到底是不是专门针对 DTK 的黑名单，还是普通的接口老化？我有没有把\"我不知道\"这件事讲清楚？",
    "",
    "## 原始输入 / 碎念",
    "",
    "- 换壳那次，我一度以为是接显示器烧了主板，后来发现只是电源插座虚焊，50 块钱一颗电容救回来的——这个细节要不要放在开头？",
    "- PurpleSNIFF 读出来是 CPFM01 那一刻有点泄气，因为意味着这条恢复路径基本走不通了",
    "- 一直没想清楚\"活着\"这个词用在一台电脑上到底合不合适，会不会煽情过头",
    "- dd 备份完硬盘那天，其实心里想的是\"如果这次操作把它变成砖，我会不会后悔现在写的这些字\"",
    "",
    "## 接收者 / 受众",
    "",
    "- 懂技术、会去查证据链的读者——不是\"看个乐子\"的猎奇读者",
    "- 早期读者反馈（大纲阶段的 231 号意见）：\"要讲人，不只讲机器\"——不要写成一篇纯粹的硬件考古",
    "",
    "## 必须记住",
    "",
    "- 500 美元是项目费用，不是硬件售价，所有权始终在苹果——这条经常被读者搞混",
    "- CPFM01 = dev-fused（出厂即写死，进 DFU 也拿不到正式固件签名），CPFM03 = prod-fused（理论可修复）——不要写反",
    "- HTTP 400 有两种成因：身份数据错误 vs 服务器认出机型直接拒绝——这两种绝对不能混着写",
    "",
    "## 反对意见 / 张力",
    "",
    "- \"服务器专门拉黑 DTK\"这个说法查无实据，只能说\"日志证明请求收到了 400，证明不了苹果的动机\"——写的时候会很想把话说满，需要克制",
    "- 完整镜像备份到底能不能救活这台机器？不能，因为 Secure Enclave 里的私钥根本不可能被镜像备份带出来——这条容易被读者当成\"你都备份了怎么还怕\"",
    "- 到底要不要暗示\"未来的 M1 Mac 也会重蹈覆辙\"？大纲明确要求不能写成阴谋论式的断言",
    "",
    "## 需要区分的术语",
    "",
    "- CPFM01（dev-fused）vs CPFM03（prod-fused）",
    "- Revive（尽量保数据）vs Restore（抹除重装）",
    "- LocalPolicy（本机签署）vs RemotePolicy（服务器约束）vs UCRT（激活换回的身份证书）",
    "- \"DTK 不是 M1 原型机\"：这是用途判断，不是性能判断",
    "",
    "## 来源线索",
    "",
    "- Eva Isabella Luna 的博客：Introducing the Developer Transition Kit / Activating after death",
    "- dosdude1 的主板维修过程（Hack Different 社区交叉验证）",
    "- Apple 官方 DTK Release Notes（本地 PDF）",
    "- Universal App Quick Start Program 条款 PDF",
    "- Craig Federighi 私人邮件截图——无法独立核实邮件头，只能引用不能当作苹果正式声明",
    "",
    "## 语气 / 风格目标",
    "",
    "- 第一人称\"遗迹探险\"，不是开箱 / 跑分 / 日用测评",
    "- 有独立署名价值的研究型文章：让懂行的读者觉得\"这里面有我不知道的东西、而且查得住\"",
    "- 不用规格切入，用一个具体事实（电容虚焊）切入",
    "",
    "## 交付减摩擦",
    "",
    "- 技术名词第一次出现要立刻回答\"它负责什么\"，不要几个缩写连着甩出来",
    "- 第一人称证据要提前，不要让历史科普讲太久才回到\"我自己的机器\"",
    "- 结尾如果要回扣开头的电容细节，首尾要闭环——这一稿还没做到，留着给下一轮",
    "",
    "## 输出规则",
    "",
    "- 不要写\"苹果计划报废\"这种定论",
    "- 不要出现具体的激活请求端点、header、payload，或者可以被理解为绕过激活步骤的内容",
    "- 不要写机器序列号、ECID、备份链接等设备唯一标识",
    "- 别用\"这不仅仅是……更是……\"这种句式",
  ].join("\n");

  // --- Outline (same document as the manuscript; ids live in the headings) ---
  const outlineMarkdown = manuscriptMarkdown({ withCoverFigure: true, coverImageId });

  // --- Section Drafts: one per real section, real prose ---
  const drafts = sectionsWithIds.map((section, index) => ({
    id: randomUUID(),
    title: section.title,
    sectionTitle: section.title,
    sourceType: "outline-section",
    sourceOutlineSection: section.title,
    sourceOutlineIndex: index,
    sourceMarkdown: `## ${section.title} {#${section.id}}\n\n${section.body}`,
    usedClips: [],
    body: section.body,
    hkrrIntent: section.title === "被取消" ? "H + R" : "",
    hkrrNote: section.title === "被取消" ? "补技术链路和引文，别丢个人语气" : "",
    createdAt: tOutline,
    updatedAt: tFinal,
    insertedAt: tFinal,
    insertedFileId: manuscriptFileId,
    insertedFileName: finalTitle,
  }));

  // --- The manuscript file (saved, labeled final) ---
  const manuscriptFile = {
    id: manuscriptFileId,
    projectId,
    type: "text",
    name: finalTitle,
    folderId: rootFolderId,
    body: manuscriptBody,
    label: "final",
    createdAt: tDraft1,
    updatedAt: tFinal,
  };

  // --- Review Desk: a saved findings file, honest about the real text ---
  const findingsBody = [
    `# 审校台核查记录 — ${finalTitle}`,
    "",
    "## 事实边界核查（对照写作素材与《脚本诊断与重构建议》的教训）",
    "",
    "- \"500 美元加入项目……不构成任何产权转让\"——与 Universal App Quick Start Program 条款、写作素材一致，无需改动。",
    "- \"苹果服务器对 ADP3,2 的请求返回 400 Bad Request……但成因分两种\"——正文把\"日志能证明的\"和\"无法证明的\"分开写，没有把\"苹果专门拉黑\"写成结论，符合《脚本诊断与重构建议》第三条关于 400 错误证据边界的要求。",
    "- \"没有证据显示，同样的退场机制不会作用在 M1 和后续的 Apple Silicon Mac 身上\"——双重否定的克制写法，没有断言\"未来的 M1 也会变成 DTK\"，符合大纲第七节的边界要求。",
    "- 待复核：正文没有给出 Rosetta 2 退场的具体日期，只写\"目前只发生在这类过渡期设备上\"——这条会随时间推移过期，写作时未做最终核验，交付前建议再查一次官方最新措辞。",
    "",
    "## AI 提线木偶风险核查",
    "",
    "- 六个小节长度、节奏不平均（试车 / 限载两段偏长，撤场偏短），语感更接近手写整理，没有陷入模型常见的三段式对称。",
    "- 个人细节保留完整：\"50 块钱，屏幕重新亮了\"\"我用 dd 完整备份了现有存储\"——没有被磨成\"经过一番努力，作者最终……\"这类概括句。",
    "- 一处需要留意：\"不上不落\"一节\"更反常的是\"这个转折，语气略像模型式的强调副词，下一稿可以看看能不能换成更具体的说法。",
    "",
    "## 结构风险",
    "",
    "- 结尾\"流水向前\"没有回扣开头的电容细节（问题单里\"交付减摩擦\"提到的首尾呼应还没做），是作者的选择还是遗漏，需要作者自己确认。",
  ].join("\n");

  const findingsFile = {
    id: findingsFileId,
    projectId,
    type: "text",
    artifactKind: "review-findings",
    name: "审校台核查记录",
    folderId: rootFolderId,
    body: findingsBody,
    hash: revisionContentHash(findingsBody),
    createdAt: tFinal,
    updatedAt: tFinal,
  };

  // --- Run receipts (durable AI-run records) ---
  const outlineReceiptRecord = {
    schemaVersion: 2,
    runId: randomUUID(),
    projectId,
    sourceAppId: "outline",
    intent: "question-sheet-to-outline",
    operation: "question-sheet-to-outline",
    startedAt: tOutline,
    finishedAt: tOutline,
    sourceScope: { sourceIds: [], citationIds: [] },
    inputObjectIds: [],
    affectedObjectIds: [manuscriptFileId],
    provider: "local",
    model: "lmstudio: qwen2.5-14b-instruct",
    allowedTools: [],
    toolInvocations: [],
    proposal: "",
    checkpointState: "accepted",
    userAction: "accepted",
    finalBodyHash: revisionContentHash(outlineMarkdown),
    outputObjectIds: [manuscriptFileId],
    destination: "outline",
    status: "completed",
    publicErrorReason: "",
    replayContract: null,
  };
  const outlineReceiptBody = [
    `Run Receipt · outline · completed`,
    `- Run: ${outlineReceiptRecord.runId}`,
    `- App / intent: outline / question-sheet-to-outline`,
    `- Started: ${tOutline}`,
    `- Finished: ${tOutline}`,
    `- Project: ${projectId}`,
    `- Inputs: —`,
    `- Affected: ${manuscriptFileId}`,
    `- Provider / model: local / lmstudio: qwen2.5-14b-instruct`,
    `- Checkpoint: accepted`,
    `- User action: accepted (final body ${outlineReceiptRecord.finalBodyHash})`,
    `- Outputs: ${manuscriptFileId}`,
    `- Destination: outline`,
  ].join("\n");
  const outlineReceiptFile = {
    id: receiptOutlineId,
    projectId,
    folderId: runRecordsFolderId,
    type: "text",
    artifactKind: "clio-run-record",
    name: `Run ${tOutline.replace("T", " ").replace(/\.\d{3}Z$/, "")} · outline · question-sheet-to-outline`,
    body: outlineReceiptBody,
    hash: revisionContentHash(outlineReceiptBody),
    runReceipt: outlineReceiptRecord,
    createdAt: tOutline,
    updatedAt: tOutline,
  };

  const darkroomReceiptRecord = {
    schemaVersion: 2,
    runId: randomUUID(),
    projectId,
    sourceAppId: "lightroom",
    intent: "hkrr-lift",
    operation: "hkrr-lift",
    startedAt: tFinal,
    finishedAt: tFinal,
    sourceScope: { sourceIds: [], citationIds: [] },
    inputObjectIds: [manuscriptFileId],
    affectedObjectIds: [manuscriptFileId],
    provider: "local",
    model: "lmstudio: qwen2.5-14b-instruct",
    allowedTools: [],
    toolInvocations: [],
    proposal: "",
    checkpointState: "accepted",
    userAction: "kept",
    finalBodyHash: revisionContentHash(compositeSection?.body || ""),
    outputObjectIds: [manuscriptFileId],
    destination: "darkroom",
    status: "completed",
    publicErrorReason: "",
    replayContract: null,
  };
  const darkroomReceiptBody = [
    `Run Receipt · lightroom · completed`,
    `- Run: ${darkroomReceiptRecord.runId}`,
    `- App / intent: lightroom / hkrr-lift`,
    `- Started: ${tFinal}`,
    `- Finished: ${tFinal}`,
    `- Project: ${projectId}`,
    `- Inputs: ${manuscriptFileId}`,
    `- Affected: ${manuscriptFileId}`,
    `- Provider / model: local / lmstudio: qwen2.5-14b-instruct`,
    `- Checkpoint: accepted`,
    `- User action: kept (final body ${darkroomReceiptRecord.finalBodyHash})`,
    `- Outputs: ${manuscriptFileId}`,
    `- Destination: darkroom`,
  ].join("\n");
  const darkroomReceiptFile = {
    id: receiptDarkroomId,
    projectId,
    folderId: runRecordsFolderId,
    type: "text",
    artifactKind: "clio-run-record",
    name: `Run ${tFinal.replace("T", " ").replace(/\.\d{3}Z$/, "")} · lightroom · hkrr-lift`,
    body: darkroomReceiptBody,
    hash: revisionContentHash(darkroomReceiptBody),
    runReceipt: darkroomReceiptRecord,
    createdAt: tFinal,
    updatedAt: tFinal,
  };

  // --- Folders ---
  const folders = [
    { id: rootFolderId, projectId, name: "Documents", parentId: null, createdAt: tResearchStart, updatedAt: tResearchStart },
    { id: clioTalkFolderId, projectId, name: "ClioTalk", parentId: null, createdAt: tOutline, updatedAt: tOutline },
    { id: runRecordsFolderId, projectId, name: "Run Records", parentId: clioTalkFolderId, createdAt: tOutline, updatedAt: tOutline },
  ];

  const files = [manuscriptFile, findingsFile, outlineReceiptFile, darkroomReceiptFile];

  // --- Scrapbook: real quotes, actually present in the sources ---
  const federighiQuote = (federighiRaw.match(/Craig Federighi[\s\S]*?这张截图没有可供外界独立验证的邮件头，也没有得到苹果确认，不能当作苹果的正式答复。/) || [""])[0].trim();
  const dosdude1Quote = (dosdude1PassageRaw.match(/落落不是唯一在做这件事的人。[\s\S]*?理论上可以被正常签名恢复。/) || [""])[0].trim();
  const evaQuote = (researchLogRaw.match(/不管是不是巧意为之[\s\S]*?哪天突然又正常了。/) || [""])[0].trim();
  const positioningQuote = (outlineDraftRaw.match(/这应该是一篇有独立署名价值的研究型文章[\s\S]*?不是靠情怀或稀有感撑起来的。/) || [""])[0].trim();

  const scraps = [
    {
      id: randomUUID(),
      projectId,
      title: "Craig Federighi：\"I'm not sure.\"",
      body: `${federighiQuote}\n\nSource: DTK Lost in Transition #1.md（研究笔记）`,
      tags: ["Apple ID", "Craig Federighi", "reader-note"],
      source: { type: "reader-note" },
      selectedText: federighiQuote,
      sourceId: "",
      sourceTitle: "DTK Lost in Transition #1.md",
      sourceKind: "note",
      timeStart: "",
      timeEnd: "",
      originalBlockIds: [],
      nearbyContext: null,
      capturedAt: tDraft1,
      translatedText: "",
      translationLanguage: "",
      translationCreatedAt: "",
      translationSource: "",
      translationModel: "",
      context: null,
      images: [],
      createdAt: tDraft1,
    },
    {
      id: randomUUID(),
      projectId,
      title: "dosdude1（Colin）：dev-fused / prod-fused",
      body: `${dosdude1Quote}\n\nSource: 活着的DTK_2020-2.md（研究笔记）`,
      tags: ["dev-fused", "prod-fused", "dosdude1", "reader-note"],
      source: { type: "reader-note" },
      selectedText: dosdude1Quote,
      sourceId: "",
      sourceTitle: "活着的DTK_2020-2.md",
      sourceKind: "note",
      timeStart: "",
      timeEnd: "",
      originalBlockIds: [],
      nearbyContext: null,
      capturedAt: tDraft1,
      translatedText: "",
      translationLanguage: "",
      translationCreatedAt: "",
      translationSource: "",
      translationModel: "",
      context: null,
      images: [],
      createdAt: tDraft1,
    },
    {
      id: randomUUID(),
      projectId,
      title: "Eva：定期重发 UCRT 请求的脚本",
      body: `${evaQuote}\n\n她甚至写了一个脚本定期重新发送 DTK 的 UCRT 请求，"以防哪天真的又能用了"。\n\nSource: 链接理解日志.md（研究笔记，转述 Eva Isabella Luna 2024-12-21 追记）`,
      tags: ["UCRT", "Eva Isabella Luna", "reader-note"],
      source: { type: "reader-note" },
      selectedText: evaQuote,
      sourceId: "",
      sourceTitle: "链接理解日志.md",
      sourceKind: "note",
      timeStart: "",
      timeEnd: "",
      originalBlockIds: [],
      nearbyContext: null,
      capturedAt: tOutline,
      translatedText: "",
      translationLanguage: "",
      translationCreatedAt: "",
      translationSource: "",
      translationModel: "",
      context: null,
      images: [],
      createdAt: tOutline,
    },
    {
      id: randomUUID(),
      projectId,
      title: "写作定位标尺（写给自己看）",
      body: `${positioningQuote}\n\nSource: DTK_文章大纲.md（写作定位标尺）`,
      tags: ["定位", "ideas"],
      source: null,
      selectedText: positioningQuote,
      sourceId: "",
      sourceTitle: "DTK_文章大纲.md",
      sourceKind: "",
      timeStart: "",
      timeEnd: "",
      originalBlockIds: [],
      nearbyContext: null,
      capturedAt: tOutline,
      translatedText: "",
      translationLanguage: "",
      translationCreatedAt: "",
      translationSource: "",
      translationModel: "",
      context: null,
      images: [],
      createdAt: tOutline,
    },
  ];

  // --- File Floppy references (real excerpts) ---
  const researchLogExcerpt = evaQuote
    ? `${evaQuote}\n\n她甚至写了一个脚本定期重新发送 DTK 的 UCRT 请求，"以防哪天真的又能用了"——这是一种介于"哀悼"和"运维值守"之间的姿态。`
    : "";
  const releaseNotesExcerpt = [
    "Developer Transition Kit — Release Notes (v1.0, 2020-6-26)",
    "",
    "The Developer Transition Kit (DTK) is an Apple development platform built to support early software development for Macs with Apple silicon. It's for development purposes only and will not be made publicly available.",
    "",
    "Don't use the DTK for performance or energy benchmarking. Discussing, reviewing and/or posting reaction about your use of the DTK online, in print, or in social media is not permitted.",
    "",
    "Hardware Behaviors (selected):",
    "- Thunderbolt devices are not supported.",
    "- The USB-C port supports a single display up to a 5K using a compatible DisplayPort alt-mode display or adapter.",
    "- The fans run at a constant speed.",
    "- System does not sleep when USB-C devices are connected.",
    "- The coin cell battery in the system will last approximately 6 months, after which the real-time clock will not be preserved on loss of power.",
    "- Internet Recovery is not supported.",
  ].join("\n");
  const srtLines = srtRaw.split("\n").filter((line) => line.trim() && !/^\d+$/.test(line.trim()) && !/-->/.test(line));
  const srtExcerpt = srtLines.slice(0, 10).join(" ").replace(/\s+/g, " ").trim();

  async function buildReference({ id, name, body, createdAt, chunkSource }) {
    const hash = await sha256Hex(`local-embedding\n${body}`);
    return {
      id,
      projectId,
      name,
      body,
      hash,
      chunks: [{ source: chunkSource, content: body, embedding: [], chunkIndex: 0, start: 0, end: body.length }],
      embeddingModel: "local-embedding",
      enabled: true,
      createdAt,
      updatedAt: createdAt,
    };
  }

  const references = await Promise.all([
    buildReference({
      id: randomUUID(),
      name: "链接理解日志.md",
      body: researchLogExcerpt,
      createdAt: tOutline,
      chunkSource: "链接理解日志.md",
    }),
    buildReference({
      id: randomUUID(),
      name: "DTK_Release_notes.pdf",
      body: releaseNotesExcerpt,
      createdAt: tResearchStart,
      chunkSource: "DTK_Release_notes.pdf",
    }),
    buildReference({
      id: randomUUID(),
      name: "Developer Transition Kit- EXCLUSIVE review and teardown!.srt",
      body: srtExcerpt,
      createdAt: tResearchStart,
      chunkSource: "Developer Transition Kit- EXCLUSIVE review and teardown!.srt",
    }),
  ]);

  // --- Dictionary terms (DTK vocabulary) ---
  function dictTerm(term, definition, avoid = []) {
    return {
      id: randomUUID(),
      term,
      definition,
      avoid,
      kind: /[一-鿿]/.test(term) ? (term.length > 1 ? "phrase" : "word") : (/\s/.test(term) ? "phrase" : "word"),
      createdAt: tOutline,
      updatedAt: tFinal,
    };
  }
  const dictionaryTerms = [
    dictTerm("A12Z", "2020 款 iPad Pro 解锁全部 GPU 核心后重新贴牌的芯片，DTK 内部代号 t8027。", ["iPad Pro 主板"]),
    dictTerm("Rosetta 2", "让 Intel 软件在 Apple Silicon 上运行的 AOT 转译层；DTK 上的版本缺少 M1 专属的硬件加速。"),
    dictTerm("dev-fused（CPFM01）", "出厂即写死的永久拒签熔断状态，物理修复、进入 DFU 后也拿不到正式固件签名。", ["prod-fused"]),
    dictTerm("prod-fused（CPFM03）", "真正发给开发者的熔断状态，理论上可以正常签名恢复，但修复中伤到 SoC 就不可逆。", ["dev-fused"]),
    dictTerm("DFU", "Device Firmware Update，恢复模式；DTK 接上电脑会被识别成\"一台处于 DFU 模式的 iPhone\"。"),
    dictTerm("UCRT", "User Identity Certificate，苹果服务器对 ActivationInfo 的回执，之后 LocalPolicy 的签发都靠它打底。"),
    dictTerm("LocalPolicy", "由 Secure Enclave 签名的本机启动策略文件，内嵌一份由苹果服务器约束的 RemotePolicy。"),
    dictTerm("boot-132", "苹果为 2005 款 DTK 自写的引导工具，这套逻辑后来泄漏给黑苹果社区，从 Chameleon 到 Clover 再到 OpenCore 都是这条脉络。"),
  ];

  // --- Darkroom record: real editing lineage, not invented text ---
  const negativeBody = negativeSection?.body || "";
  const compositeBody = compositeSection?.body || "";
  const negativeLines = negativeBody.split("\n");
  // Protect the closing personal-voice line -- the one sentence the writer
  // does not want an adjustment pass to smooth away.
  const protectStart = negativeLines.findIndex((line) => line.includes("我不知道那扇门最后会不会开"));
  const protectedRanges = protectStart >= 0 ? [{ start: protectStart + 1, end: protectStart + 1 }] : [];

  const darkroomVersions = [
    {
      id: randomUUID(),
      body: negativeBody,
      title: `${compositeSection?.title || "被取消"} — 初稿`,
      createdAt: tDraft1,
      reason: "kept",
      source: "lightroom",
    },
    {
      id: randomUUID(),
      body: compositeBody,
      title: `${compositeSection?.title || "被取消"} — 定稿`,
      createdAt: tFinal,
      reason: "kept",
      source: "lightroom",
    },
  ];

  const darkroomRecord = {
    schemaVersion: 1,
    negative: negativeBody,
    negativeUpdatedAt: tDraft1,
    modelDelivered: compositeBody,
    modelDeliveredAt: tFinal,
    composite: compositeBody,
    currentKey: revisionContentHash(`${negativeBody} mingming:75 hkrr:50`),
    generatedAt: tFinal,
    adjustmentLayers: [
      { kind: "mingming", enabled: true, strength: 75, mask: [] },
      { kind: "luoluo", enabled: false, strength: 50, mask: [] },
      { kind: "hkrr", enabled: true, strength: 50, mask: [] },
      { kind: "density", enabled: false, strength: 50, mask: [] },
    ],
    protectedRanges,
    versions: darkroomVersions,
    updatedAt: tFinal,
  };

  // --- Document revisions: real lineage 初稿 -> 校正版 -> final ---
  const revIds = [randomUUID(), randomUUID(), randomUUID()];
  const documentRevisions = [
    {
      id: revIds[0],
      projectId,
      documentId: manuscriptFileId,
      parentRevisionId: "",
      phase: "draft",
      body: draft1Body,
      contentHash: revisionContentHash(draft1Body),
      origin: "user",
      operation: "manual-save",
      runRecordId: "",
      createdAt: tDraft1,
    },
    {
      id: revIds[1],
      projectId,
      documentId: manuscriptFileId,
      parentRevisionId: revIds[0],
      phase: "manuscript",
      body: draft2Body,
      contentHash: revisionContentHash(draft2Body),
      origin: "user",
      operation: "phase-advance",
      runRecordId: "",
      createdAt: tDraft2,
    },
    {
      id: revIds[2],
      projectId,
      documentId: manuscriptFileId,
      parentRevisionId: revIds[1],
      phase: "final",
      body: manuscriptBody,
      contentHash: revisionContentHash(manuscriptBody),
      origin: "user",
      operation: "final-label",
      runRecordId: "",
      createdAt: tFinal,
    },
  ];

  // --- Project CD: the finished manuscript, burned, linked to its findings ---
  const wordCount = (manuscriptBody.match(/[一-鿿]/g) || []).length
    + (manuscriptBody.replace(/[一-鿿]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  const projectCdItems = [
    {
      id: cdItemId,
      projectId,
      title: `${finalTitle}.md`,
      format: "text/markdown",
      body: manuscriptBody,
      sourceDocumentId: manuscriptFileId,
      sourceKind: "markdown",
      claimCheckId: findingsFileId,
      burnedAt: tFinal,
      updatedAt: tFinal,
      languageMode: "original",
      metadata: {
        sourceName: finalTitle,
        wordCount,
        workflowState: "final",
        reviewDeskComplete: true,
      },
    },
  ];

  // --- Project record ---
  const project = {
    id: projectId,
    name: finalTitle,
    createdAt: tResearchStart,
    updatedAt: tFinal,
    archived: false,
    questionSheet,
    outline: outlineMarkdown,
    outlineSections: sectionsWithIds.map((section) => section.title),
    drafts,
    writingSurfaces: {
      questionSheet: { type: "questionSheet", upstream: [], downstream: ["outline"], compactTeachText: true },
      outline: { type: "outline", upstream: ["questionSheet"], downstream: ["sectionDrafts"], compactTeachText: true },
      sectionDrafts: { type: "sectionDrafts", upstream: ["outline"], downstream: ["teachText"], compactTeachText: true },
      teachText: { type: "teachText", upstream: ["questionSheet", "outline", "sectionDrafts"], downstream: ["claimCheck", "projectCd"], compactTeachText: false },
      claimCheck: { type: "claimCheck", upstream: ["teachText"], downstream: ["projectCd"], compactTeachText: false },
      projectCd: { type: "projectCd", upstream: ["teachText", "claimCheck"], downstream: [], compactTeachText: false },
    },
    documentTabs: [
      {
        id: manuscriptTabId,
        app: "teachText",
        role: "manuscript",
        title: finalTitle,
        backing: { type: "manuscript" },
        state: {
          activeTextFileId: manuscriptFileId,
          documentRole: "manuscript",
          name: finalTitle,
          folder: "Documents",
          body: manuscriptBody,
          label: "final",
          workflowState: "final",
          statusKey: "saved",
          selectionStart: 0,
          selectionEnd: 0,
          scrollTop: 0,
        },
        createdAt: tOutline,
        updatedAt: tFinal,
        order: 0,
      },
    ],
    activeDocumentTabIds: { reader: null, teachText: manuscriptTabId, docMap: null, timeMachine: null },
    dictionaryTerms,
    flowState: { topic: true, research: true, outline: true, drafting: true, check: true },
    sourceRegistry: { allocations: {}, nextN: 1 },
    manuscriptOwnsDraft: true,
    manuscriptLinkedToOutline: true,
  };

  // --- Assemble through the real backup code ---
  const runtime = createBackupVm({});
  const result = await runtime.assembler.assembleProjectBackup({
    projectId,
    source: {
      getProject: async () => project,
      getFolders: async () => folders,
      getFiles: async () => files,
      getScraps: async () => scraps,
      getTrash: async () => [],
      getProjectCdItems: async () => projectCdItems,
      getReferences: async () => references,
      getDocumentRevisions: async () => documentRevisions,
      getDarkroomRecords: async () => [{ ...darkroomRecord, projectId, documentId: manuscriptFileId }],
      getImageAttachments: async () => imageAttachments,
    },
  });

  if (!result || !result.ready) {
    console.error("Backup assembly failed.");
    console.error("validation:", JSON.stringify(result?.validation, null, 2));
    console.error("integrity:", JSON.stringify(result?.verified, null, 2));
    process.exit(1);
  }

  const outDir = join(repoRoot, "internal/evidence/drafts/dtk-demo-disk");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${finalTitle} Project Hard Disk Backup.json`);
  const json = JSON.stringify(result.bundle, null, 2);
  writeFileSync(outPath, json, "utf8");

  console.log("Wrote", outPath);
  console.log("Bytes:", Buffer.byteLength(json, "utf8"));
  console.log("formatVersion:", result.bundle.formatVersion);
  console.log("counts:", result.bundle.counts);
  console.log("project id:", projectId, "manuscript file id:", manuscriptFileId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
