// ClioWorks S11 Office round trip (1): builds the file a person opens in Excel / LibreOffice.
//   node tests/fixtures/clioworks-s11/roundtrip-1/make-roundtrip.mjs          write the three files
//   node tests/fixtures/clioworks-s11/roundtrip-1/make-roundtrip.mjs --check  rebuild and compare, write nothing
// Outputs next to this script: base.xlsx (budget-s11.xlsx plus one threaded comment, the
// "before"), edited.xlsx (the real ledger-adapter save), EXPECTED.zh-CN.md (cells, comments, hashes).
// Deterministic: a fixed clock inside the codec's vm context, a counting GUID source and
// TZ=UTC, so a rerun is byte-identical. All content is synthetic.
process.env.TZ = "UTC"; // the codec reads local clock fields; pin them before any Date exists

import vm from "node:vm";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeContext, loadScripts } from "../vm-context.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "budget-s11.xlsx");
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);
const S = "预算";

const NS = "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments";
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RT = "http://schemas.microsoft.com/office/2017/10/relationships/";
export const ROOT_ID = "{11111111-1111-4111-8111-111111111111}";
const REPLY_ID = "{22222222-2222-4222-8222-222222222222}";
const P1 = "{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}";
const P2 = "{BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB}";
const XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** budget-s11.xlsx plus one threaded comment (root + reply) on 预算!B2, zip stamps fixed. */
export function buildBase() {
  const zip = new AdmZip(readFileSync(FIXTURE));
  const put = (name, text) => zip.addFile(name, Buffer.from(text, "utf8"));
  const edit = (name, fn) => zip.updateFile(name, Buffer.from(fn(zip.readAsText(name)), "utf8"));
  put("xl/comments1.xml", `${XMLDECL}<comments xmlns="${MAIN}"><authors><author>tc=${ROOT_ID}</author></authors><commentList><comment ref="B2" authorId="0"><text><t>[Threaded comment]\n\n纸箱单价再确认一下</t></text></comment></commentList></comments>`);
  put("xl/threadedComments/threadedComment1.xml", `${XMLDECL}<ThreadedComments xmlns="${NS}"><threadedComment ref="B2" dT="2026-10-10T09:00:00.00" personId="${P1}" id="${ROOT_ID}"><text>纸箱单价再确认一下</text></threadedComment><threadedComment ref="B2" dT="2026-10-10T10:30:00.00" personId="${P2}" id="${REPLY_ID}" parentId="${ROOT_ID}"><text>已确认，按 6 元算</text></threadedComment></ThreadedComments>`);
  put("xl/persons/person.xml", `${XMLDECL}<personList xmlns="${NS}"><person displayName="阿澄" id="${P1}" userId="阿澄" providerId="None"/><person displayName="小禾" id="${P2}" userId="小禾" providerId="None"/></personList>`);
  put("xl/worksheets/_rels/sheet1.xml.rels", `${XMLDECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/><Relationship Id="rId2" Type="${RT}threadedComment" Target="../threadedComments/threadedComment1.xml"/></Relationships>`);
  edit("xl/_rels/workbook.xml.rels", (t) => t.replace("</Relationships>", `<Relationship Id="rId9" Type="${RT}person" Target="persons/person.xml"/></Relationships>`));
  edit("[Content_Types].xml", (t) => t.replace("</Types>", '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/><Override PartName="/xl/threadedComments/threadedComment1.xml" ContentType="application/vnd.ms-excel.threadedcomments+xml"/><Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/></Types>'));
  for (const e of zip.getEntries()) e.header.time = new Date(2026, 9, 16, 8, 0, 0);
  return new Uint8Array(zip.toBuffer());
}

/** The real ledger adapter in a vm context with a frozen clock and a counting GUID source. */
export function makeSession() {
  const ctx = makeContext();
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(NOW); }
    static now() { return NOW; }
  }
  ctx.Date = FixedDate;
  let n = 0;
  const real = ctx.crypto;
  ctx.crypto = new Proxy(real, {
    get(target, key) {
      if (key === "randomUUID") return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js"]);
  const open = async (bytes, meta = { name: "搬家预算.xlsx" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, globalThis.__meta)", ctx);
  };
  return { ctx, open };
}

export const EDITS = {
  b2: 250,
  d3Formula: "B3*C3*2",
  noteCell: "A2", noteText: "核对数量", noteAuthor: "阿澄", noteDate: "2026-10-16",
  replyText: "收到，按 250 个订", replyAuthor: "小禾", replyDate: "2026-10-16T08:30:00.00",
};

/** Apply the four edits, recalc, save. Returns the open adapter too (for reading values). */
export async function buildEdited(baseBytes = buildBase()) {
  const { open } = makeSession();
  const a = await open(baseBytes);
  a.setCell(S, "B2", { value: EDITS.b2 });
  a.setCell(S, "D3", { formula: EDITS.d3Formula });
  const note = a.addComment(S, EDITS.noteCell, { author: EDITS.noteAuthor, text: EDITS.noteText, date: EDITS.noteDate });
  const reply = a.replyComment(S, ROOT_ID, { author: EDITS.replyAuthor, text: EDITS.replyText, date: EDITS.replyDate });
  if (!note.id || !reply.id) throw new Error(`comment edit refused: ${JSON.stringify({ note, reply })}`);
  await a.ensureCalc();
  await a.recalc([{ sheet: S, ref: "B2" }, { sheet: S, ref: "D3" }]);
  const saved = await a.save();
  if (saved.mode !== "preserving-edit") throw new Error(`unexpected save mode ${saved.mode}`);
  return { adapter: a, bytes: new Uint8Array(saved.bytes), note, reply };
}

const cellText = (v) => (v && typeof v === "object" && v.e ? v.e : v == null ? "" : String(v));

async function describe(editedBytes) {
  const { open } = makeSession();
  const b = await open(editedBytes);
  const sheet = b.sheets()[0].name;
  const rows = [];
  for (let r = 1; r <= 12; r += 1) {
    for (const col of "ABCDEFGHI") {
      const c = b.getCell(sheet, `${col}${r}`);
      if (c && typeof c.formula === "string") rows.push({ ref: `${col}${r}`, formula: `=${c.formula}`, value: cellText(c.value), shown: b.displayText(sheet, `${col}${r}`) });
    }
  }
  return { rows, comments: b.comments(sheet), sheet };
}

function partHashes(bytes) {
  const out = new Map();
  for (const e of new AdmZip(Buffer.from(bytes)).getEntries()) if (!e.isDirectory) out.set(e.entryName, sha256(e.getData()));
  return out;
}

export async function render(baseBytes, editedBytes) {
  const { rows, comments } = await describe(editedBytes);
  const before = partHashes(baseBytes);
  const after = partHashes(editedBytes);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const parts = names.map((n) => {
    const state = !after.has(n) ? "removed" : !before.has(n) ? "new" : before.get(n) === after.get(n) ? "same" : "changed";
    return `| \`${n}\` | ${state} | \`${(before.get(n) || "").slice(0, 12)}\` | \`${(after.get(n) || "").slice(0, 12)}\` |`;
  });
  const cellRows = rows.map((r) => `| ${r.ref} | \`${r.formula.replace(/\|/g, "\\|")}\` | ${r.shown} | | |`);
  const commentRows = comments.map((c) => `| ${c.ref} | ${c.threaded ? (c.parentId ? "回覆" : "串接根") : "批注"} | ${c.author} | ${c.text.replace(/\n/g, " ")} | ${c.date || ""} |`);
  return `# 往返① EXPECTED（由 make-roundtrip.mjs 产生，勿手改）

被测件：\`edited.xlsx\`，sha256 \`${sha256(editedBytes)}\`（${editedBytes.length} 字节）
起点：\`base.xlsx\`，sha256 \`${sha256(baseBytes)}\`（= budget-s11.xlsx 加 B2 一条串接批注）
重新产生：\`node tests/fixtures/clioworks-s11/roundtrip-1/make-roundtrip.mjs --check\`，必须报字节一致。

## 我们改了什么

| 格 | 起点 | 改后 |
| --- | --- | --- |
| B2 | 220 | ${EDITS.b2} |
| D3 | \`=B3*C3\`（共享公式子格） | \`=${EDITS.d3Formula}\` |
| A2 | 无批注 | 新批注「${EDITS.noteText}」（${EDITS.noteAuthor}） |
| B2 串接 | 根 + 1 条回覆 | 再加 1 条回覆「${EDITS.replyText}」（${EDITS.replyAuthor}） |

## 公式格

「ClioChart 值」是本次保存里写入的缓存值（再用 ledger-adapter 读回的结果）。「Excel 重算后」「LibreOffice 重算后」由人在重新计算（Excel 的 Ctrl+Alt+Shift+F9；LibreOffice 的 Ctrl+Shift+F9）后抄入；一格不同就记为差异，不要改 ClioChart 的值去迁就。「显示」是按该格数字格式格式化后应看到的文字。

| 格 | 公式 | ClioChart 值（显示） | Excel 重算后 | LibreOffice 重算后 |
| --- | --- | --- | --- | --- |
${cellRows.join("\n")}

预期结构：D9 仍是 \`#VALUE!\`（B9 是文字「未测」，未被改动），F12 是文字串，D12 合计不含 D9。

## 批注清单（ledger-adapter 读回 edited.xlsx）

| 格 | 种类 | 作者 | 内容 | 时间 |
| --- | --- | --- | --- | --- |
${commentRows.join("\n")}

## 未改部件的对照方法

下表是 base.xlsx 与 edited.xlsx 各部件内容的 sha256 前 12 位。状态为 changed / new 的部件是 ClioChart 的保存器依本次编辑重写的，预期会变；状态为 same 的部件是原样带过去的，人工在 Excel / LibreOffice 里另存回来之前，用 \`unzip -p edited.xlsx <part> | shasum -a 256\` 取整串应与此处前 12 位相符（这一步确认被测件没被动过）；另存之后该部件若变了，是那个软件改写的，记入 CHECKLIST 的差异栏，不算 ClioChart 的缺陷。
未改的缓存值：除上表公式格外，所有 \`<v>\` 应原样保留（例如 D4..D8、D10 的值）；该核对由 ledger-adapter 读回完成，不是目视。

| 部件 | 状态 | base | edited |
| --- | --- | --- | --- |
${parts.join("\n")}
`;
}

const mode = process.argv.includes("--check") ? "check" : process.argv[1] && process.argv[1].endsWith("make-roundtrip.mjs") ? "write" : "import";
if (mode !== "import") {
  const base = buildBase();
  const { bytes } = await buildEdited(base);
  const again = (await buildEdited(buildBase())).bytes;
  if (sha256(bytes) !== sha256(again)) throw new Error("two builds in one process differ: the output is not deterministic");
  const expected = await render(base, bytes);
  const targets = { "base.xlsx": base, "edited.xlsx": bytes, "EXPECTED.zh-CN.md": Buffer.from(expected, "utf8") };
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
  console.log(`edited.xlsx sha256 ${sha256(bytes)} (${bytes.length} bytes)`);
}
