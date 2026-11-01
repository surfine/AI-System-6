// ClioWorks S11 Office round trip (3): builds the .docx a person opens in Word / LibreOffice Writer.
//   node tests/fixtures/clioworks-s11/roundtrip-3/make-roundtrip.mjs          write the files
//   node tests/fixtures/clioworks-s11/roundtrip-3/make-roundtrip.mjs --check  rebuild and compare, write nothing
// Outputs next to this script: base.docx (a copy of quire-s11.docx, the "before"; it already carries
// one comment, 阿澄 on 「纸箱」), edited.docx (the real quire-adapter save), EXPECTED.zh-CN.md
// (paragraphs, styles, comments, part hashes). Deterministic: TZ=UTC, a fixed clock and counting
// random/UUID sources in the codec's vm context. All content is synthetic.
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps); pin them before any Date

import vm from "node:vm";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeContext, loadScripts } from "../vm-context.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "quire-s11.docx");
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** base.docx is the frozen fixture, byte for byte. */
export function buildBase() {
  return new Uint8Array(readFileSync(FIXTURE));
}

export const EDITS = {
  runParagraph: "最后一段",
  runBefore: "最后一段，什么格式都没有。",
  runText: "最后一段，现在改过了。",
  boldParagraph: "普通的一句",
  boldRange: { from: 0, to: 2 },
  boldWord: "普通",
  headingParagraph: "这个周末",
  headingLevel: 2,
  listParagraph: "最后一段",
  listKind: "bullet",
  newCommentParagraph: "这个周末",
  newCommentAuthor: "阿澄",
  newCommentText: "这句再短一点",
  newCommentDate: "2026-10-16T08:00:00Z",
  replyAuthor: "小禾",
  replyText: "好，改成两句",
  replyDate: "2026-10-16T08:30:00Z",
};

/** The real quire adapter in a vm context with a frozen clock and deterministic random/UUID. */
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
  loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
  const open = async (bytes, meta = { name: "搬家清单.docx" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, globalThis.__meta)", ctx);
  };
  return { ctx, open };
}

const byText = (doc, text) => doc.paragraphs().find((p) => p.text.startsWith(text));

/** Apply the edits through the public adapter API and save in preserving-edit mode. */
export async function buildEdited(baseBytes = buildBase()) {
  const { open } = makeSession();
  const a = await open(baseBytes);
  const need = (text) => { const p = byText(a, text); if (!p) throw new Error(`base: no paragraph starting ${text}`); return p; };

  const run = a.setRunText(need(EDITS.runParagraph).id, 0, EDITS.runText);
  const bold = a.toggleRunStyle(need(EDITS.boldParagraph).id, "b", EDITS.boldRange);
  const heading = a.setHeading(need(EDITS.headingParagraph).id, EDITS.headingLevel);
  const list = a.setList(need(EDITS.listParagraph).id, EDITS.listKind);
  const comment = a.addComment(need(EDITS.newCommentParagraph).id, undefined, { author: EDITS.newCommentAuthor, text: EDITS.newCommentText, date: EDITS.newCommentDate });
  const reply = comment.id ? a.replyComment(comment.id, { author: EDITS.replyAuthor, text: EDITS.replyText, date: EDITS.replyDate }) : null;
  for (const [k, r] of Object.entries({ run, bold, heading, list, comment, reply })) {
    if (!r || r.status === "blocked") throw new Error(`edit refused: ${k} ${JSON.stringify(r)}`);
  }
  const saved = await a.save();
  if (saved.mode !== "preserving-edit") throw new Error(`unexpected save mode ${saved.mode}`);
  return { adapter: a, bytes: new Uint8Array(saved.bytes), newCommentId: comment.id, replyCommentId: reply.id };
}

const md = (text) => String(text == null ? "" : text).replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Read a docx back with a fresh adapter: paragraphs (with style words) and comments. */
export async function describe(bytes) {
  const { open } = makeSession();
  const b = await open(bytes);
  const paragraphs = b.paragraphs().map((p, i) => ({
    n: i + 1,
    text: p.text,
    style: p.headingLevel ? `标题 ${p.headingLevel}` : p.list ? (p.list.kind === "bullet" ? "项目符号" : "编号") : "正文",
    bold: p.runs.filter((r) => r.kind === "text" && r.b).map((r) => r.text).join("") ,
  }));
  const all = b.comments();
  const comments = all.map((c) => ({
    author: c.author, text: c.text, date: c.date || "", done: !!c.done,
    level: c.parentId ? "回覆" : "串接根", quote: c.anchor ? c.anchor.quote : "",
    parent: c.parentId ? (all.find((x) => x.id === c.parentId) || {}).text || "" : "",
  }));
  return { paragraphs, comments, tables: b.tables().length };
}

function partHashes(bytes) {
  const out = new Map();
  for (const e of new AdmZip(Buffer.from(bytes)).getEntries()) if (!e.isDirectory) out.set(e.entryName, sha256(e.getData()));
  return out;
}

export async function render(baseBytes, editedBytes) {
  const { paragraphs, comments } = await describe(editedBytes);
  const before = partHashes(baseBytes);
  const after = partHashes(editedBytes);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const parts = names.map((n) => {
    const state = !after.has(n) ? "removed" : !before.has(n) ? "new" : before.get(n) === after.get(n) ? "same" : "changed";
    return `| \`${n}\` | ${state} | \`${(before.get(n) || "").slice(0, 12)}\` | \`${(after.get(n) || "").slice(0, 12)}\` |`;
  });
  const paraRows = paragraphs.map((p) => `| ${p.n} | ${p.style} | ${md(p.text)} | ${md(p.bold)} | | |`);
  const commentRows = comments.map((c) => `| ${c.level} | ${md(c.author)} | ${md(c.text)} | ${md(c.quote)} | ${c.date} | ${c.done ? "已解决" : ""} | | |`);
  return `# 往返③ EXPECTED（由 make-roundtrip.mjs 产生，勿手改）

被测件：\`edited.docx\`，sha256 \`${sha256(editedBytes)}\`（${editedBytes.length} 字节）
起点：\`base.docx\`，sha256 \`${sha256(baseBytes)}\`（= quire-s11.docx 原样副本，12 段 + 1 张表 + 1 张图 + 批注 1 条：阿澄「纸箱数量再确认一下」，原本就有，不是本次新增）
重新产生：\`node tests/fixtures/clioworks-s11/roundtrip-3/make-roundtrip.mjs --check\`，必须报字节一致。
回覆：quire-adapter 支持回覆（\`replyComment\`），本次回覆挂在本次新增的根批注之下。

## 我们改了什么

| 项 | 起点 | 改后 | Word 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- |
| 一个条的文字 | ${md(EDITS.runBefore)} | ${md(EDITS.runText)} | | |
| 一个词加粗 | 「${EDITS.boldWord}」不是粗体 | 「${EDITS.boldWord}」加粗，其余不变 | | |
| 段落变标题 | 「${EDITS.headingParagraph}…」是正文 | 标题 ${EDITS.headingLevel} | | |
| 段落变列表项 | 「${EDITS.listParagraph}…」是正文 | 项目符号列表项 | | |
| 新根批注 | 无 | 「${md(EDITS.newCommentText)}」（${EDITS.newCommentAuthor}，锚定在「${EDITS.newCommentParagraph}…」整段） | | |
| 回覆 | 无 | 「${md(EDITS.replyText)}」（${EDITS.replyAuthor}），挂在上一条之下 | | |

## 逐段（quire-adapter 读回 edited.docx）

「样式」由 adapter 的 headingLevel / list 判出；「加粗字」是该段里粗体的文字（标题样式自带的粗体也算）。「Word 看到」「LibreOffice 看到」由人在对应软件里打开、逐条抄入；一条不同就记为差异，不要改 edited.docx 去迁就。表格与图片不在本表（只读，原样带过）。

| 段 | 样式 | 文字 | 加粗字 | Word 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- |
${paraRows.join("\n")}

## 批注清单（quire-adapter 读回 edited.docx）

原有的 1 条根（阿澄）应原样保留，再加本次新增的 1 根 + 1 回覆。

| 种类 | 作者 | 内容 | 锚定文字 | 时间 | 状态 | Word 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${commentRows.join("\n")}

## 未改部件的对照方法

下表是 base.docx 与 edited.docx 各部件内容的 sha256 前 12 位。changed / new 是 quire 保存器依本次编辑重写的；same 是原样带过去的，人工另存回来之前用 \`unzip -p edited.docx <part> | shasum -a 256\` 取整串应与前 12 位相符；另存之后若变了，是那个软件改写的，记入 CHECKLIST 的差异栏，不算 ClioStage 的缺陷。

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
  const expected = await render(base, built.bytes);
  const targets = { "base.docx": base, "edited.docx": built.bytes, "EXPECTED.zh-CN.md": Buffer.from(expected, "utf8") };
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
  console.log(`edited.docx sha256 ${sha256(built.bytes)} (${built.bytes.length} bytes)`);
}
