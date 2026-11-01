// ClioWorks S11 Office round trip (2): builds the .pptx a person opens in PowerPoint / LibreOffice.
//   node tests/fixtures/clioworks-s11/roundtrip-2/make-roundtrip.mjs          write the three files
//   node tests/fixtures/clioworks-s11/roundtrip-2/make-roundtrip.mjs --check  rebuild and compare, write nothing
// Outputs next to this script: base.pptx (a copy of slides-modern-comment-s11.pptx, the "before"),
// edited.pptx (the real lectern-adapter save), EXPECTED.zh-CN.md (runs, notes, comments, hashes).
// Deterministic: TZ=UTC, a fixed clock and counting GUID/random sources inside the codec's vm
// context, so a rerun (including one under another TZ) is byte-identical. All content is synthetic.
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps); pin them before any Date

import vm from "node:vm";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeContext, loadScripts } from "../vm-context.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "slides-modern-comment-s11.pptx");
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** base.pptx is the frozen fixture, byte for byte (the modern-comment deck before the edits). */
export function buildBase() {
  return new Uint8Array(readFileSync(FIXTURE));
}

export const EDITS = {
  runText: "一次导出：42 秒（已复核）",
  notesText: "改过的演讲备注：先给出数字，再说明测试边界。",
  newCommentAuthor: "阿澄",
  newCommentText: "标题再短一点",
  newCommentDate: "2026-10-16T08:00:00.000",
  replyAuthor: "小禾",
  replyText: "好，改成两行",
  replyDate: "2026-10-16T08:30:00.000",
};

/** The real lectern adapter in a vm context with a frozen clock, a counting GUID source and a
 * deterministic Math.random (the codec builds new slide/shape/comment ids from both). */
export function makeSession() {
  const ctx = makeContext();
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(NOW); }
    static now() { return NOW; }
  }
  ctx.Date = FixedDate;
  let rn = 0;
  const math = Object.create(ctx.Math);
  math.random = () => { rn = (rn * 9301 + 49297) % 233280; return rn / 233280; };
  ctx.Math = math;
  let n = 0;
  const real = ctx.crypto;
  ctx.crypto = new Proxy(real, {
    get(target, key) {
      if (key === "randomUUID") return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  loadScripts(ctx, ["app/vendor/clioworks-v3/lectern-adapter.js"]);
  const open = async (bytes, meta = { name: "演示.pptx" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__bytes, globalThis.__meta)", ctx);
  };
  return { ctx, open };
}

/** Apply the five edits through the public adapter API and save in preserving-edit mode.
 * Returns the open adapter (so a caller can read the model back) plus the saved bytes. */
export async function buildEdited(baseBytes = buildBase()) {
  const { open } = makeSession();
  const a = await open(baseBytes);
  const [s1, s2] = a.slides().map((sl) => sl.id);
  const title = a.shapes(s1).find((sh) => sh.editable && sh.name === "TextBox 2");
  if (!title) throw new Error("base: slide 1 has no TextBox 2 to anchor to");
  const titleRun = title.paragraphs[0].runs[0];
  const beforeRun = titleRun.text;
  const beforeNotes = a.notes(s1);

  // (a) one text run, (b) slide 1 speaker notes, (c) duplicate slide 2.
  const run = a.setRunText(s1, titleRun.id, EDITS.runText);
  const notes = a.setNotes(s1, EDITS.notesText);
  const duplicate = a.duplicateSlide(s2);

  // (d) a new comment anchored to slide 1, (e) a reply to the existing modern root.
  const root = a.comments(s1).find((c) => c.parentId === null && c.modern && c.author === "阿澄" && c.text === "这个数字出处在哪？");
  if (!root) throw new Error("base: the modern root comment is missing");
  const comment = a.addComment(s1, { anchorShapeId: title.id, author: EDITS.newCommentAuthor, text: EDITS.newCommentText, date: EDITS.newCommentDate });
  const reply = a.replyComment(root.id, { author: EDITS.replyAuthor, text: EDITS.replyText, date: EDITS.replyDate });
  if (run.status !== "ok" || notes.status !== "ok" || duplicate.status !== "ok" || comment.status !== "ok" || reply.status !== "ok") {
    throw new Error(`edit refused: ${JSON.stringify({ run, notes, duplicate, comment, reply })}`);
  }

  const saved = await a.save();
  if (saved.mode !== "preserving-edit") throw new Error(`unexpected save mode ${saved.mode}`);
  return {
    adapter: a,
    bytes: new Uint8Array(saved.bytes),
    slides: a.slides(),
    slide1: s1,
    slide2: s2,
    duplicateSlide: duplicate.slide,
    rootCommentId: root.id,
    newCommentId: comment.id,
    replyCommentId: reply.id,
    runChange: { shapeId: title.id, shapeName: title.name, runId: titleRun.id, before: beforeRun, after: EDITS.runText },
    notesChange: { slide: s1, before: beforeNotes, after: EDITS.notesText },
  };
}

const md = (text) => String(text == null ? "" : text).replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Read edited.pptx back with a fresh adapter: runs, notes and comments as ClioStage sees them. */
async function describe(editedBytes) {
  const { open } = makeSession();
  const b = await open(editedBytes);
  const slides = b.slides();
  const runs = [];
  const notes = [];
  const index = new Map(slides.map((sl, i) => [sl.id, i + 1]));
  slides.forEach((sl, i) => {
    for (const sh of b.shapes(sl.id)) {
      if (!sh.editable || !Array.isArray(sh.paragraphs)) continue;
      sh.paragraphs.forEach((para, pi) => {
        (para.runs || []).forEach((run) => {
          runs.push({ slide: i + 1, shape: sh.name, shapeId: sh.id, para: pi, runId: run.id, text: run.text });
        });
      });
    }
    notes.push({ slide: i + 1, slideId: sl.id, notes: b.notes(sl.id) });
  });
  const comments = b.comments().map((c) => ({
    slide: index.get(c.slideId) || 0,
    author: c.author,
    text: c.text,
    date: c.date || "",
    level: c.parentId ? "回覆" : "串接根",
    modern: !!c.modern,
    parentId: c.parentId || "",
    id: c.id,
  }));
  return { slides, runs, notes, comments };
}

function partHashes(bytes) {
  const out = new Map();
  for (const e of new AdmZip(Buffer.from(bytes)).getEntries()) if (!e.isDirectory) out.set(e.entryName, sha256(e.getData()));
  return out;
}

export async function render(baseBytes, editedBytes, edit = {}) {
  const { runs, notes, comments } = await describe(editedBytes);
  const beforeRun = edit.runChange ? edit.runChange.before : "";
  const beforeNotes = edit.notesChange ? edit.notesChange.before : "";
  const before = partHashes(baseBytes);
  const after = partHashes(editedBytes);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const parts = names.map((n) => {
    const state = !after.has(n) ? "removed" : !before.has(n) ? "new" : before.get(n) === after.get(n) ? "same" : "changed";
    return `| \`${n}\` | ${state} | \`${(before.get(n) || "").slice(0, 12)}\` | \`${(after.get(n) || "").slice(0, 12)}\` |`;
  });
  const runRows = runs.map((r) => `| 第 ${r.slide} 页 | ${r.shape} | ${r.para} | \`${r.runId}\` | ${md(r.text)} | | |`);
  const noteRows = notes.map((n) => `| 第 ${n.slide} 页 | ${md(n.notes) || "（空）"} | | |`);
  const commentRows = comments.map((c) => `| 第 ${c.slide} 页 | ${c.level}${c.modern ? "（现代）" : ""} | ${md(c.author)} | ${md(c.text)} | ${c.date} | | |`);
  return `# 往返② EXPECTED（由 make-roundtrip.mjs 产生，勿手改）

被测件：\`edited.pptx\`，sha256 \`${sha256(editedBytes)}\`（${editedBytes.length} 字节）
起点：\`base.pptx\`，sha256 \`${sha256(baseBytes)}\`（= slides-modern-comment-s11.pptx 原样副本，2 页 + 现代批注 3 条）
重新产生：\`node tests/fixtures/clioworks-s11/roundtrip-2/make-roundtrip.mjs --check\`，必须报字节一致。

## 我们改了什么

| 项 | 起点 | 改后 | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- |
| 第 1 页文字条 | ${md(beforeRun)} | ${md(EDITS.runText)} | | |
| 第 1 页演讲备注 | ${md(beforeNotes)} | ${md(EDITS.notesText)} | | |
| 第 2 页复制 | 2 页 | 第 2 页复制成新的一页，跟在原页之后（共 3 页） | | |
| 第 1 页新批注 | 无 | 「${md(EDITS.newCommentText)}」（${md(EDITS.newCommentAuthor)}，锚定标题对象） | | |
| 第 1 页串接 | 根 + 1 条回覆 | 再加 1 条回覆「${md(EDITS.replyText)}」（${md(EDITS.replyAuthor)}） | | |

## 逐页文字条（lectern-adapter 读回 edited.pptx）

「ClioStage 写入」是这次保存里 lectern-adapter 存入的文字；重新打开 edited.pptx 后，下列文字条应逐条相同。「PowerPoint 看到」「LibreOffice 看到」由人在对应软件里打开、逐条抄入；一条不同就记为差异，不要改 edited.pptx 去迁就。

| 页 | 形状 | 段 | 条（稳定 id） | ClioStage 写入（读回） | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- | --- |
${runRows.join("\n")}

## 逐页备注（lectern-adapter 读回 edited.pptx）

| 页 | ClioStage 写入（读回） | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- |
${noteRows.join("\n")}

## 批注清单（lectern-adapter 读回 edited.pptx）

原有两条现代批注（根 + 回覆）应原样保留，再加本次新增的 1 根 + 1 回覆。「种类」为串接根 / 回覆。

| 页 | 种类 | 作者 | 内容 | 时间 | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- | --- |
${commentRows.join("\n")}

## 未改部件的对照方法

下表是 base.pptx 与 edited.pptx 各部件内容的 sha256 前 12 位。状态为 changed / new 的部件是 lectern-adapter 的保存器依本次编辑重写的，预期会变；状态为 same 的部件是原样带过去的，人工在 PowerPoint / LibreOffice 里另存回来之前，用 \`unzip -p edited.pptx <part> | shasum -a 256\` 取整串应与此处前 12 位相符（这一步确认被测件没被动过）；另存之后该部件若变了，是那个软件改写的，记入 CHECKLIST 的差异栏，不算 ClioStage 的缺陷。

| 部件 | 状态 | base | edited |
| --- | --- | --- | --- |
${parts.join("\n")}
`;
}

const mode = process.argv.includes("--check") ? "check" : process.argv[1] && process.argv[1].endsWith("make-roundtrip.mjs") ? "write" : "import";
if (mode !== "import") {
  const base = buildBase();
  const built = await buildEdited(base);
  const again = (await buildEdited(buildBase())).bytes;
  if (sha256(built.bytes) !== sha256(again)) throw new Error("two builds in one process differ: the output is not deterministic");
  const expected = await render(base, built.bytes, built);
  const targets = { "base.pptx": base, "edited.pptx": built.bytes, "EXPECTED.zh-CN.md": Buffer.from(expected, "utf8") };
  if (mode === "check") {
    let bad = 0;
    for (const [name, data] of Object.entries(targets)) {
      const path = join(here, name);
      const same = existsSync(path) && sha256(readFileSync(path)) === sha256(data);
      console.log(`${same ? "same " : "DIFF "} ${name}`);
      if (!same) bad += 1;
    }
    process.exit(bad ? 1 : 0);
  }
  for (const [name, data] of Object.entries(targets)) writeFileSync(join(here, name), data);
  console.log(`edited.pptx sha256 ${sha256(built.bytes)} (${built.bytes.length} bytes)`);
}
