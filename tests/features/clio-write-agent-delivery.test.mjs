// 1.0.60 work order B2 合同（所有者裁决 D1/D2）：ClioWrite 收 ClioTalk 的署名修订。
//
// 分类（classify）是确定性规则：跑腿件（数字/日期/单字修正/人名，新值在借出的
// 卷宗里逐字找到）、别人的话（改动落在文稿标注为他人所说的话里）、其余是动字件。
// 送达（deliver）把 exact 候选经 clio-write-compare 的 applyCandidates 写成
// 跟踪插入/删除，署名 ClioTalk，整批一个命名撤销步；lost/ambiguous 不写，
// others-words 拒收。AI 字台账在动字件被收下时记范围，写作者改写后清除。
// 排队的候选在写作者打开文件（ClioWrite 挂载）时才送达——旁注栏那部分由真
// 编辑器 VM 跑（quire-editor-vm）。
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clio-write-agent-delivery");
process.env.TZ = "UTC";

const D01 = () => new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/docx/D01.docx")));
const D18 = () => new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/docx/D18.docx")));

// 借出的卷宗（ruling D2 的「新值能在卷宗裡逐字找到出處」）：数字、人名在其中。
const SOURCES = [
  "访谈名单：小周 8人，林秀兰 12人，租客 王建国。",
  "县统计局 2025 年公报：返乡人口 1,210 人。",
];

const PLANNER_SOURCES = [
  "app/core/text-quote.js",
  "app/vendor/clioworks-v3/native-locate.js",
  "app/features/agent-projection.js",
  "app/core/word-diff.js",
  "app/vendor/clioworks-v3/quire-adapter.js",
  "app/vendor/clioworks-v3/quire-review.js",
  "app/features/clio-write-compare.js",
  "app/features/clio-write-agent-delivery.js",
];

/** 分类、送达与台账的裸 vm：与真实浏览器同一批脚本，无 DOM。 */
function planner() {
  const ctx = makeContext();
  ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
  loadScripts(ctx, PLANNER_SOURCES);
  const run = (code) => vm.runInContext(code, ctx);
  const call = (expr, args) => {
    ctx.__args = args;
    return run(`(async () => ${expr})(globalThis.__args)`);
  };
  const project = async (bytes, format, meta = { name: "doc.docx" }) => call("AISystem6AgentProjection.project(globalThis.__args[0], globalThis.__args[1], globalThis.__args[2])", [bytes, format, meta]);
  const open = async (bytes, meta = { name: "doc.docx" }) => call("ClioWorksQuireAdapter.open(globalThis.__args[0], globalThis.__args[1])", [bytes, meta]);
  const diff = async (before, after, map) => call("AISystem6AgentProjection.diff(globalThis.__args[0], globalThis.__args[1], globalThis.__args[2])", [before, after, map]);
  const classify = async (candidate, sources) => call("AISystem6ClioWriteAgentDelivery.classify(globalThis.__args[0], globalThis.__args[1])", [candidate, sources]);
  const deliver = async (adapter, candidates, options) => call("AISystem6ClioWriteAgentDelivery.deliver(globalThis.__args[0], globalThis.__args[1], globalThis.__args[2])", [adapter, candidates, options]);
  const agent = () => vm.runInContext("AISystem6ClioWriteAgentDelivery", ctx);
  const review = () => vm.runInContext("ClioWorksQuireReview", ctx);
  return { ctx, run, call, project, open, diff, classify, deliver, agent, review };
}

/** 合成稿：一段数字改写、一段引语（别人的话）、一个错字、一个人名、一段待改写的尾巴。 */
function buildQuoteDoc(p) {
  return p.run(`(async () => {
    const L = await ClioWorksQuireAdapter.loadCodec();
    const D = L.D;
    const doc = D.newDoc();
    const para = (text) => D.para([D.text(text, {})], {});
    D.touchList(doc.main);
    doc.main.blocks.push(
      para("三、他们为什么回来"),
      para("在我采访的 27 人里，有 三成 是在 2023 年以后回到县城的。"),
      para("「我妈一个人带不动我爸了，」林姐对我说，「我不回来谁回来。」"),
      para("县城的租克涨得快。"),
      para("县统计局的老张给出了数字。"),
      para("他们说得最多的不是房价。"),
    );
    D.reindex(doc);
    return new Uint8Array(await (await L.docx.write(doc, { format: "docx" })).arrayBuffer());
  })()`);
}

/** 同一卷宗重复两段：同一句话出现两次，上下文分不出是哪一处。 */
function buildRepeatDoc(p) {
  return p.run(`(async () => {
    const L = await ClioWorksQuireAdapter.loadCodec();
    const D = L.D;
    const doc = D.newDoc();
    const para = (text) => D.para([D.text(text, {})], {});
    D.touchList(doc.main);
    // 两处「重复的一段。」前后各是同一段够长的上下文：两份 32 字窗口完全一样，
    // TextQuote 才真的分不清（锚点本身太好用，光重复一句话不够）。
    doc.main.blocks.push(para("这一段的上下文要足够长，长过锚点前后各三十二字的窗口，两处才分不清彼此。"), para("重复的一段。"), para("这一段的上下文要足够长，长过锚点前后各三十二字的窗口，两处才分不清彼此。"), para("这一段的上下文要足够长，长过锚点前后各三十二字的窗口，两处才分不清彼此。"), para("重复的一段。"), para("这一段的上下文要足够长，长过锚点前后各三十二字的窗口，两处才分不清彼此。"));
    D.reindex(doc);
    return new Uint8Array(await (await L.docx.write(doc, { format: "docx" })).arrayBuffer());
  })()`);
}

const bodyOf = (projection) => projection.files.find((f) => f.path === "正文.md");
/** 按段落原文找行：codec 的开档自带一个空首段，序号会漂移，文本不会。 */
const editLines = (projection, edits) => ({
  files: projection.files.map((f) => (f.path !== "正文.md" ? f : {
    path: f.path,
    text: f.text.split("\n").map((line) => {
      const m = /^\{#¶\d+\}/.exec(line);
      const text = m ? line.slice(m[0].length) : line;
      return m && edits[text] != null ? m[0] + edits[text] : line;
    }).join("\n"),
  })),
});
const byBefore = (candidates, before) => candidates.find((c) => c.before === before);

/** Every part of a saved .docx as text (central directory walk, stored or deflated). */
function packageText(bytes) {
  const buf = Buffer.from(bytes);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buf.readUInt32LE(eocd + 16);
  let out = "";
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i -= 1) {
    const nameLength = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + buf.readUInt32LE(at + 20));
    out += `${buf.toString("utf8", at + 46, at + 46 + nameLength)}\n${(buf.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString("utf8")}\n`;
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return out;
}

const EDITOR_SOURCES = [
  "app/core/text-quote.js",
  "app/vendor/clioworks-v3/native-locate.js",
  "app/features/agent-projection.js",
  "app/core/word-diff.js",
  "app/vendor/clioworks-v3/quire-review.js",
  "app/features/clio-write-review.js",
  "app/features/clio-write-compare.js",
  "app/features/clio-write-agent-delivery.js",
];

/** A fresh desk (a reload) opening saved bytes in ClioWrite, with the record's stored ledger. */
async function reopen(bytes, aiText) {
  const v = await createQuireEditorVm({ docx: bytes, name: "三联访谈.docx" });
  v.load(EDITOR_SOURCES);
  if (aiText !== undefined) v.record.aiText = aiText;
  const opened = await v.window.AISystem6ClioWrite.open(v.record, {});
  for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush();
  return { v, opened, agent: v.window.AISystem6ClioWriteAgentDelivery };
}

const run = async () => {
  /* 1. 分类：每一类都有确定的案子，规则不带模型。 */
  {
    const p = planner();
    const synth = await buildQuoteDoc(p);
    const projection = await p.project(synth, "docx", { name: "三联访谈.docx" });
    const after = editLines(projection, {
      "在我采访的 27 人里，有 三成 是在 2023 年以后回到县城的。": "在我采访的 27 人里，有 8 人 是在 2023 年以后回到县城的。",   // 数字（卷宗 1：小周 8人）
      "「我妈一个人带不动我爸了，」林姐对我说，「我不回来谁回来。」": "「我妈一个人带不动我娘了，」林姐对我说，「我不回来谁回来。」",   // 别人的话
      "县城的租克涨得快。": "县城的租客涨得快。",   // 单字修正
      "县统计局的老张给出了数字。": "县统计局的林秀兰给出了数字。",   // 人名（卷宗 1：林秀兰）
      "他们说得最多的不是房价。": "夜里的县城比白天热闹。",   // 动字件
    });
    const candidates = await p.diff(projection, after, projection.map);
    test.assert(candidates.length === 5, `五处改动正好五条候选 (got ${candidates.length})`);
    test.assert(await p.classify(byBefore(candidates, "在我采访的 27 人里，有 三成 是在 2023 年以后回到县城的。"), SOURCES) === "errand", "数字改写（新值在卷宗里）是跑腿件");
    test.assert(await p.classify(byBefore(candidates, "县城的租克涨得快。"), SOURCES) === "errand", "单字错字修正是跑腿件");
    test.assert(await p.classify(byBefore(candidates, "县统计局的老张给出了数字。"), SOURCES) === "errand", "人名改对（卷宗里逐字找得到）是跑腿件");
    test.assert(await p.classify(byBefore(candidates, "「我妈一个人带不动我爸了，」林姐对我说，「我不回来谁回来。」"), SOURCES) === "others-words", "改到「林姐对我说」引号里的话是别人的话");
    test.assert(await p.classify(byBefore(candidates, "他们说得最多的不是房价。"), SOURCES) === "voice", "整句改写是动字件");
    test.assert(await p.classify(byBefore(candidates, "在我采访的 27 人里，有 三成 是在 2023 年以后回到县城的。"), []) === "voice", "没有卷宗时数字改写也不是跑腿件——新值必须逐字有出处");
    test.assert(await p.classify({ before: "「他说完了。」妈妈说", after: "「他说完了呀。」妈妈说" }, SOURCES) === "others-words",
      "引号后跟着「妈妈说」的引语同样受保护（判定不靠具体某个人名）");

    // 真实语料：D01 的表格卷正文段与 D18 的段落都按同一规则分。
    const d01 = await p.project(D01(), "docx", { name: "D01.docx" });
    const d01Entry = d01.map.paragraphs.find((e) => e.anchor);
    const d01Candidates = await p.diff(d01, editLines(d01, { [d01Entry.anchor.quote]: "考生基本信息一览" }), d01.map);
    test.assert(d01Candidates.length === 1 && await p.classify(d01Candidates[0], SOURCES) === "voice",
      "D01（真实语料）整段改写是动字件");
    const d18 = await p.project(D18(), "docx", { name: "D18.docx" });
    const d18Candidates = await p.diff(d18, editLines(d18, { "Aaa bbb ccc": "Aaa ccc" }), d18.map);
    test.assert(d18Candidates.length === 1 && await p.classify(d18Candidates[0], SOURCES) === "voice",
      "D18（真实语料）删词是动字件——没有出处就不是跑腿件");

    /* 2. 送达：exact 候选写成 w:ins/w:del，署名 ClioTalk，整批一个撤销步。 */
    const adapter = await p.open(synth, { name: "三联访谈.docx" });
    p.agent().onDocumentMounted({ docId: "b2-doc", adapter });
    const outcome = await p.deliver(adapter, candidates, { author: "ClioTalk", sources: SOURCES, round: 2 });
    test.assert(outcome.applied.length === 4 && outcome.unapplied.length === 1,
      `四条送达、一条拒收 (got ${outcome.applied.length}/${outcome.unapplied.length})`);
    test.assert(outcome.unapplied[0].status === "refused" && outcome.unapplied[0].class === "others-words",
      "别人的话拒收，状态是 refused");
    const records = p.review().revisions(adapter);
    // 四条候选：三条单词替换（各一条 ins + 一条 del）加整句改写（两个词级 hunk，
    // 四条）——十个修订记录，全部署名 ClioTalk。
    test.assert(records.length === 10 && records.every((r) => r.author === "ClioTalk"),
      `十条修订全部署名 ClioTalk (got ${records.length})`);
    test.assert(records.some((r) => r.type === "ins") && records.some((r) => r.type === "del"),
      "改动以跟踪插入与跟踪删除落进文稿");
    test.assert(adapter.canUndo() && adapter.undoLabel() === "ClioTalk：第 2 轮的 4 条修订",
      `整批一个命名撤销步「ClioTalk：第 2 轮的 4 条修订」 (${adapter.undoLabel()})`);
    adapter.undo();
    test.assert(p.review().revisions(adapter).length === 0, "一次撤销拿掉整批送达");
    adapter.redo();
    test.assert(p.review().revisions(adapter).length === 10, "重做把整批带回来");
    // 引语段一字未动：拒收的那条没有写进文稿。
    test.assert(adapter.paragraphs().some((para) => para.text === "「我妈一个人带不动我爸了，」林姐对我说，「我不回来谁回来。」"),
      "拒收的引语段保持原样");
    // w:ins 的署名在 run 上（不只是清单里）：送达的插入文字带着 ClioTalk 的戳。
    p.ctx.__b2adapter = adapter;
    const insAuthors = p.run(`(function () {
      const D = globalThis.L.D;
      const doc = globalThis.__b2adapter.document();
      const out = [];
      for (const para of globalThis.__b2adapter.paragraphs()) {
        const model = D.byId(doc, Number(para.id));
        if (!model || !model.runs) continue;
        for (const run of model.runs) if (run.rPr && run.rPr.ins) out.push(run.rPr.ins.author);
      }
      return out;
    })()`);
    test.assert(insAuthors.length >= 4 && insAuthors.every((a) => a === "ClioTalk"),
      `插入的 run 带 ClioTalk 的 w:ins 戳 (${JSON.stringify(insAuthors)})`);

    /* 3. AI 字：动字件被收下才记台账，写作者改写后清除。 */
    const agent = p.agent();
    const voiceRecord = records.find((r) => (agent.metaForRecord(adapter, r) || {}).class === "voice");
    test.assert(!!voiceRecord, "送达清单里认得出动字件的修订");
    agent.noteVoiceAccepted("b2-doc", voiceRecord);
    const ranges = agent.aiTextRanges("b2-doc");
    test.assert(ranges.length === 1 && ranges[0].paragraphId === voiceRecord.paragraphId && ranges[0].text === voiceRecord.text,
      `收下动字件记录了 AI 字范围 (${JSON.stringify(ranges)})`);
    test.assert(agent.aiTextRanges("别的文件").length === 0, "别的文件没有 AI 字");
    // 写作者在别处动笔：范围还在（只有改到那几个字才算改写）。
    const other = adapter.paragraphs().find((para) => para.text === "三、他们为什么回来");
    adapter.setRunText(other.id, 0, other.text + "啊");
    agent.noteWriterEdit(adapter.document());
    test.assert(agent.aiTextRanges("b2-doc").length === 1, "写作者改的是别处，AI 字还在");
    // 写作者改写那几个字：AI 字到此为止。
    const aiPara = adapter.paragraphs().find((para) => para.text.includes(voiceRecord.text));
    adapter.setRunText(aiPara.id, 0, "我自己写的一段。");
    agent.noteWriterEdit(adapter.document());
    test.assert(agent.aiTextRanges("b2-doc").length === 0, "写作者改写了那几个字，AI 字清除");
  }

  /* 3b. 收下一条动字件（整句改写，删词与加词一起）：台账只记加进来的字——
     删掉的字已经不在文稿里，不是 AI 字（M2.6 发现的台账错记）。走旁注栏与
     ClioTalk 文档面板共用的那条路（AISystem6ClioWriteReview.take）。 */
  {
    const p = planner();
    const synth = await buildQuoteDoc(p);
    const projection = await p.project(synth, "docx", { name: "三联访谈.docx" });
    const candidates = await p.diff(projection, editLines(projection, { "他们说得最多的不是房价。": "夜里的县城比白天热闹。" }), projection.map);
    const adapter = await p.open(synth, { name: "三联访谈.docx" });
    p.agent().onDocumentMounted({ docId: "ledger-doc", adapter });
    await p.deliver(adapter, candidates, { author: "ClioTalk", sources: SOURCES, round: 1 });
    const records = p.review().revisions(adapter);
    const inserted = records.filter((r) => r.type === "ins").map((r) => r.text);
    const deleted = records.filter((r) => r.type === "del").map((r) => r.text);
    test.assert(inserted.length > 0 && deleted.length > 0 && records.every((r) => (p.agent().metaForRecord(adapter, r) || {}).class === "voice"),
      `整句改写是动字件，带删词也带加词 (ins ${inserted.length}, del ${deleted.length})`);
    loadScripts(p.ctx, ["app/features/clio-write-review.js"]);
    const failure = vm.runInContext("AISystem6ClioWriteReview", p.ctx).take(adapter, records, true, "Accept Revision");
    test.assert(failure === "", `收下整条动字件 (${failure})`);
    const ranges = p.agent().aiTextRanges("ledger-doc");
    test.assert(ranges.length === inserted.length && ranges.every((range) => inserted.includes(range.text)) && !ranges.some((range) => deleted.includes(range.text)),
      `AI 字台账只记加进来的字，不记删掉的字 (${JSON.stringify(ranges.map((range) => range.text))} vs del ${JSON.stringify(deleted)})`);
    const para = adapter.paragraphs().find((entry) => entry.text === "夜里的县城比白天热闹。");
    test.assert(!!para && ranges.every((range) => range.paragraphId === String(para.id) && para.text.slice(range.from, range.to) === range.text),
      "每个范围指向收下之后那段话里那几个字的位置");
  }

  /* 4. lost 与 ambiguous 不写：原文已经改过 / 分不清是哪一处。 */
  {
    const p = planner();
    const synth = await buildQuoteDoc(p);
    const projection = await p.project(synth, "docx", { name: "三联访谈.docx" });
    const candidates = await p.diff(projection, editLines(projection, { "县城的租克涨得快。": "县城的租客涨得快。" }), projection.map);
    const adapter = await p.open(synth, { name: "三联访谈.docx" });
    // 写作者已经把那句话改掉了：候选对不上，如实报 lost，一个字都不动。
    const target = adapter.paragraphs().find((para) => para.text === "县城的租克涨得快。");
    adapter.setRunText(target.id, 0, "房租的事另说。");
    p.agent().onDocumentMounted({ docId: "lost-doc", adapter });
    const lost = await p.deliver(adapter, candidates, { author: "ClioTalk", sources: SOURCES });
    test.assert(lost.applied.length === 0 && lost.unapplied.length === 1 && lost.unapplied[0].status === "lost",
      "原文被改掉的候选报 lost，不写");
    test.assert(p.review().revisions(adapter).length === 0 && adapter.paragraphs().some((para) => para.text === "房租的事另说。"),
      "lost 不产生修订，文稿保持写作者改过的样子");

    const repeat = await buildRepeatDoc(p);
    const repeatProjection = await p.project(repeat, "docx", { name: "重复.docx" });
    const repeatCandidates = await p.diff(repeatProjection, editLines(repeatProjection, { "重复的一段。": "重复的一段（改）。" }), repeatProjection.map);
    const repeatAdapter = await p.open(repeat, { name: "重复.docx" });
    p.agent().onDocumentMounted({ docId: "repeat-doc", repeatAdapter });
    const ambiguous = await p.deliver(repeatAdapter, repeatCandidates, { author: "ClioTalk", sources: SOURCES });
    test.assert(ambiguous.applied.length === 0 && ambiguous.unapplied.length === 2
      && ambiguous.unapplied.every((row) => row.status === "ambiguous"),
      "同一句话连上下文出现两次的候选报 ambiguous，不写");
  }

  /* 5. 排队 → 挂载才送达；旁注栏的跑腿批收、动字件标签、留话…与 AI 字。 */
  {
    const p = planner();
    const synth = await buildQuoteDoc(p);
    const projection = await p.project(synth, "docx", { name: "三联访谈.docx" });
    const after = editLines(projection, {
      "在我采访的 27 人里，有 三成 是在 2023 年以后回到县城的。": "在我采访的 27 人里，有 8 人 是在 2023 年以后回到县城的。",
      "「我妈一个人带不动我爸了，」林姐对我说，「我不回来谁回来。」": "「我妈一个人带不动我娘了，」林姐对我说，「我不回来谁回来。」",
      "县城的租克涨得快。": "县城的租客涨得快。",
      "县统计局的老张给出了数字。": "县统计局的林秀兰给出了数字。",
      "他们说得最多的不是房价。": "夜里的县城比白天热闹。",
    });
    const candidates = JSON.parse(JSON.stringify(await p.diff(projection, after, projection.map)));

    const v = await createQuireEditorVm({ docx: synth, name: "三联访谈.docx" });
    const w = v.window;
    const doc = v.document;
    v.load(EDITOR_SOURCES);
    const agent = w.AISystem6ClioWriteAgentDelivery;
    const api = w.AISystem6ClioWrite;
    const review = w.ClioWorksQuireReview;
    const tick = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); await new Promise((r) => setImmediate(r)); } v.flush(); };
    v.context.showInputDialog = async () => "这句我自己改";

    v.record.liveAdapter = await v.openAdapter(synth, "三联访谈.docx");
    agent.queueForDocument("doc-1", candidates, { sources: SOURCES, round: 2 });
    test.assert(review.revisions(v.record.liveAdapter).length === 0, "排队不写：写作者还没打开这份文件，一个字都没动");
    const opened = await api.open(v.record, {});
    test.assert(opened.ok, "the document opens");
    await tick();
    const adapter = v.record.liveAdapter;
    const records = review.revisions(adapter);
    test.assert(records.length === 10 && records.every((r) => r.author === "ClioTalk"),
      `打开这份文件时送达：十条 ClioTalk 修订 (got ${records.length})`);
    test.assert(api.editHistory().undoLabel() === "clio_write_agent_round_label"
      && JSON.stringify(api.editHistory().undoLabelArgs()) === "[2,4]",
      `整批一个撤销步「ClioTalk：第 2 轮的 4 条修订」 (${api.editHistory().undoLabel()} ${JSON.stringify(api.editHistory().undoLabelArgs())})`);

    // 旁注栏 修订 tab：批收按钮只数跑腿件；动字件逐条、默认退回。
    v.menu("clio-write-revisions").run();
    await tick();
    const panel = doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden])");
    test.assert(!!panel, "the rail's 修订 panel opens");
    const buttons = [...panel.querySelectorAll(".cw-rev-commands .btn")];
    const errandCount = records.filter((r) => (agent.metaForRecord(adapter, r) || {}).class === "errand").length;
    const batch = buttons.find((b) => b.textContent.startsWith("clio_write_agent_batch_button"));
    test.assert(!!batch && batch.textContent === `clio_write_agent_batch_button:${errandCount}` && errandCount === 6,
      `顶上的按钮是「收下跑腿件（${errandCount}）」，只数跑腿件 (${batch ? batch.textContent : "none"})`);
    test.assert(!buttons.some((b) => b.textContent === "clio_write_revisions_accept_all"),
      "有跑腿件待收时，接受全部让位给收下跑腿件");
    const rows = [...panel.querySelectorAll(".cw-rev")];
    const tagged = rows.filter((r) => r.querySelector(".cw-agent-tag"));
    test.assert(tagged.length === rows.length && rows.length === 10, "每条 ClioTalk 修订都带类标签");
    test.assert(tagged.some((r) => r.querySelector(".cw-agent-tag").textContent === "clio_write_agent_tag_errand")
      && tagged.some((r) => r.querySelector(".cw-agent-tag").textContent === "clio_write_agent_tag_voice"),
      "跑腿与动字两种标签都画了出来");
    test.assert(rows.every((r) => r.querySelector(".cw-agent-reason")), "每条 ClioTalk 修订带着它的理由行");
    test.assert(rows.some((r) => r.querySelector(".cw-agent-basis")), "有出处的修订带依据行");
    // 指到一条动字件：默认按钮是退回；指到一条跑腿件：默认是收下。
    const voiceRow = rows.find((r) => r.querySelector(".cw-agent-tag").textContent === "clio_write_agent_tag_voice");
    voiceRow.dispatchEvent(v.make("click"));
    await tick();
    // draw() 会重建行：重新查面板里的当前行，别拿旧节点比身份。
    const framedVoice = doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden]) .cw-rev.is-current");
    test.assert(!!framedVoice && framedVoice.querySelector(".cw-agent-tag").textContent === "clio_write_agent_tag_voice"
      && framedVoice.querySelectorAll(".windoid-actions .btn")[1].classList.contains("default"),
      "动字件的默认按钮是退回");
    const errandRow = rows.find((r) => r.querySelector(".cw-agent-tag").textContent === "clio_write_agent_tag_errand");
    errandRow.dispatchEvent(v.make("click"));
    await tick();
    const framedErrand = doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden]) .cw-rev.is-current");
    test.assert(!!framedErrand && framedErrand.querySelector(".cw-agent-tag").textContent === "clio_write_agent_tag_errand"
      && framedErrand.querySelectorAll(".windoid-actions .btn")[0].classList.contains("default"),
      "跑腿件的默认按钮仍是收下");

    // 留话…：写作者署名的 Word 批注。
    const commentsBefore = adapter.comments().length;
    const noteButton = [...framedVoice.querySelectorAll(".windoid-actions .btn")].find((b) => b.textContent === "clio_write_agent_leave_message");
    noteButton.dispatchEvent(v.make("click"));
    await tick();
    const comments = adapter.comments();
    test.assert(comments.length === commentsBefore + 1 && comments[comments.length - 1].text === "这句我自己改",
      "「留话…」在原处插了一则批注");
    test.assert(comments[comments.length - 1].author === "clio_comments_author_default",
      "批注署名是写作者（未记名时用默认署名）");

    // 拒收与没挂上的行如实回到列表。
    const missed = panel.querySelectorAll(".cw-agent-missed");
    test.assert(missed.length === 1 && missed[0].textContent.includes("clio_write_agent_reason_others_words"),
      "别人的话在「没挂上」区里说明拒收理由");
    // 一条对不上的候选（原文已改）：队列即时送达并回到「没挂上」。
    agent.queueForDocument("doc-1", [{ before: "已经被写作者改掉的句子。", after: "新句子。", location: { documentId: "", generation: 1, kind: "text", quote: { quote: "已经被写作者改掉的句子。", prefix: "", suffix: "", offset: 0 } } }], {});
    await tick();
    const refreshed = doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden])");
    test.assert(refreshed.querySelectorAll(".cw-agent-missed").length === 2
      && [...refreshed.querySelectorAll(".cw-agent-missed")].some((r) => r.textContent.includes("clio_write_agent_lost_line")),
      "原文已经改过的候选作为「没挂上」回到列表");

    // 「告诉 ClioTalk」：有回话的路才出现。
    let told = null;
    agent.setTellHandler((row) => { told = row; });
    w.AISystem6ClioWriteReview.refresh();
    const tellButton = [...refreshed.querySelectorAll(".cw-agent-missed .btn")].find((b) => b.textContent === "clio_write_agent_tell");
    test.assert(!!tellButton, "注册了回话的路，「告诉 ClioTalk」才出现");
    tellButton.dispatchEvent(v.make("click"));
    test.assert(!!told, "按「告诉 ClioTalk」把这条没挂上的行带回给 ClioTalk");

    // 收下动字件 → AI 字范围入台账；批收跑腿件不记 AI 字。
    framedVoice.dispatchEvent(v.make("click"));
    await tick();
    [...doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden]) .cw-rev.is-current").querySelectorAll(".windoid-actions .btn")][0].dispatchEvent(v.make("click"));
    await tick();
    const ranges = agent.aiTextRanges("doc-1");
    test.assert(ranges.length === 1 && ranges[0].paragraphId && ranges[0].text,
      `收下动字件记了 AI 字 (${JSON.stringify(ranges)})`);
    const beforeErrandRanges = agent.aiTextRanges("doc-1").length;
    const freshErrand = [...doc.querySelectorAll(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden]) .cw-rev")]
      .find((r) => r.querySelector(".cw-agent-tag") && r.querySelector(".cw-agent-tag").textContent === "clio_write_agent_tag_errand");
    freshErrand.dispatchEvent(v.make("click"));
    await tick();
    [...doc.querySelector(".doc-rail:not([hidden]) .cw-revisions-panel:not([hidden]) .cw-rev.is-current").querySelectorAll(".windoid-actions .btn")][0].dispatchEvent(v.make("click"));
    await tick();
    test.assert(agent.aiTextRanges("doc-1").length === beforeErrandRanges, "收下跑腿件不记 AI 字");
    batch.dispatchEvent(v.make("click"));
    await tick();
    test.assert(api.editHistory().undoLabel() === "clio_write_agent_batch_step",
      `批收是一个命名撤销步 (${api.editHistory().undoLabel()})`);
    const left = review.revisions(adapter);
    test.assert(left.every((r) => (agent.metaForRecord(adapter, r) || {}).class !== "errand"),
      "批收只收走跑腿件，动字件仍逐条等写作者");

    // U3：台账随文件存。存档把它写到文件的记录上（桌面侧元数据），.docx 里没有它。
    await v.menu("clio-write-save").run();
    await tick();
    test.assert(Array.isArray(v.record.aiText) && v.record.aiText.length === 1 && v.record.aiText[0].text === ranges[0].text
      && v.record.aiText[0].paragraphId === ranges[0].paragraphId,
      `存档把 AI 字台账写到文件记录上 (${JSON.stringify(v.record.aiText)})`);
    const saved = packageText(v.working());
    test.assert(saved.includes("word/document.xml") && saved.includes(ranges[0].text), "存下的 .docx 读得出正文，收下的字在里面");
    test.assert(!saved.includes("aiText") && !saved.includes("paragraphId") && !saved.includes("clio_write_agent_ai_tag"),
      ".docx 本身从不带 AI 字台账");
    const savedWithAi = new Uint8Array(v.working());
    const stored = JSON.parse(JSON.stringify(v.record.aiText));

    // 写作者改写那几个字：AI 字清除（真键盘路径，经 doc-changed）。
    const E = () => v.run("L.ed");
    const D = () => v.run("L.D");
    const rewriteAiWords = async () => {
      const live = v.record.liveAdapter;
      const aiPara = live.paragraphs().find((para) => para.text.includes(ranges[0].text));
      const model = D().byId(live.document(), Number(aiPara.id));
      E().setSel(D().pos(model, 0), D().pos(model, ranges[0].text.length));
      v.fire(doc.querySelector("#pages"), "beforeinput", { inputType: "insertText", data: "我自己的话" });
      await tick();
    };
    await rewriteAiWords();
    test.assert(agent.aiTextRanges("doc-1").length === 0, "写作者改写了 AI 字的范围，标记清除");

    // 复原到上次存储：台账也读回存下的那份，挂在复原后的新文稿上（同一个会话里）。
    const beforeRevert = v.record.liveAdapter;
    v.modal.answers.push("yes");
    await v.menu("clio-write-revert").run();
    await tick();
    const reverted = agent.aiTextRanges("doc-1");
    const revertedPara = reverted.length ? v.record.liveAdapter.paragraphs().find((para) => para.id === reverted[0].paragraphId) : null;
    test.assert(v.record.liveAdapter !== beforeRevert && reverted.length === 1 && reverted[0].text === stored[0].text
      && !!revertedPara && revertedPara.text.slice(reverted[0].from, reverted[0].to) === stored[0].text,
      `复原后台账重读存下的那份，挂在新文稿的原字上 (${JSON.stringify(reverted)})`);
    await rewriteAiWords();
    test.assert(agent.aiTextRanges("doc-1").length === 0, "复原后的文稿里写作者照样能改写 AI 字");
    // 清除也随文件存：下一次存档把空台账写回去，再打开就没有 AI 字。
    await v.menu("clio-write-save").run();
    await tick();
    test.assert(Array.isArray(v.record.aiText) && v.record.aiText.length === 0, "存档把清除后的台账写回文件记录");
    const prunedBytes = new Uint8Array(v.working());
    const prunedLedger = JSON.parse(JSON.stringify(v.record.aiText));

    // 重新载入（新的桌面，等上面的键盘路径走完再开）：打开存下的字节和记录里的台账。
    const again = await reopen(savedWithAi, stored);
    const back = again.agent.aiTextRanges("doc-1");
    const backPara = back.length ? again.v.record.liveAdapter.paragraphs().find((para) => para.id === back[0].paragraphId) : null;
    test.assert(again.opened.ok && back.length === 1 && back[0].text === stored[0].text && !!backPara
      && backPara.text.slice(back[0].from, back[0].to) === stored[0].text,
      `重新载入后 AI 字台账回来，挂在原来那几个字上 (${JSON.stringify(back)})`);
    const old = await reopen(savedWithAi, undefined);
    test.assert(old.opened.ok && old.agent.aiTextRanges("doc-1").length === 0, "没有台账字段的旧文件打开是空台账");
    const pruned = await reopen(prunedBytes, prunedLedger);
    test.assert(pruned.opened.ok && pruned.agent.aiTextRanges("doc-1").length === 0, "重新载入后，改写过的字不再是 AI 字");

    // 另存为：副本带着台账（字还是那些 AI 字），主机收到的是存档同一形状的台账；
    // 副本拿走活文稿，源文件的活台账放手，下次打开重读它存下的那份。
    const asked = [];
    again.v.context.AISystem6ClioWorks = { saveNativeDocumentAs: async (handle, options) => { asked.push(options); return { ok: true, destination: "project" }; } };
    await again.v.menu("clio-write-save-as").run();
    test.assert(asked.length === 1 && Array.isArray(asked[0].aiText) && asked[0].aiText.length === 1
      && asked[0].aiText[0].text === stored[0].text && typeof asked[0].aiText[0].prefix === "string",
      `另存为把 AI 字台账交给主机 (${JSON.stringify(asked)})`);
    test.assert(again.agent.aiTextRanges("doc-1").length === 0, "另存为之后源文件的活台账放手");
  }

  /* 6. 台账按字加上下文挂回：短语重复时挂对那一处，分不清就丢，宁可少标不标错。 */
  {
    const p = planner();
    const agent = p.agent();
    const paragraphsOf = (...texts) => ({ paragraphs: () => texts.map((text, i) => ({ id: `n${i}`, text })) });
    let seq = 0;
    // 在 before 稿里把 words 的第 nth 处记进台账、存下；再在 after 稿里打开，看台账挂在哪。
    const carry = (before, at, words, after, edit) => {
      const from = before[at].indexOf(words, edit && edit.skip ? before[at].indexOf(words) + 1 : 0);
      const fromId = `save-${seq += 1}`;
      agent.onDocumentMounted({ docId: fromId, adapter: paragraphsOf(...before) });
      agent.noteVoiceAccepted(fromId, { paragraphId: `n${at}`, from, to: from + words.length, text: words });
      const stored = agent.storedLedger(fromId);
      const toId = `open-${seq}`;
      agent.onDocumentMounted({ docId: toId, adapter: paragraphsOf(...after), aiText: stored });
      return { stored, back: agent.aiTextRanges(toId) };
    };

    // 同一个短语在两个段落里，上面又多了一段：只认位置会挂到上一个，上下文认得出。
    let r = carry(["他说：好的，马上来。", "她说：好的，不急。", "收尾。"], 1, "好的", ["新增的一段。", "他说：好的，马上来。", "她说：好的，不急。", "收尾。"]);
    test.assert(r.back.length === 1 && r.back[0].paragraphId === "n2" && r.back[0].from === 3,
      `短语重复，按上下文挂回她说的那一处 (${JSON.stringify(r.back)})`);
    test.assert(r.stored[0].prefix === "她说：" && r.stored[0].suffix === "，不急。" && r.stored[0].nth === 0 && r.stored[0].index === 1,
      `台账存了前后文、同文段落序号和段落位置 (${JSON.stringify(r.stored)})`);

    // 一模一样的段落：靠它在「同文段落」里的序号，不靠位置。
    r = carry(["好的。", "好的。", "好的。"], 1, "好的", ["开头。", "好的。", "好的。", "好的。"]);
    test.assert(r.back.length === 1 && r.back[0].paragraphId === "n2" && r.stored[0].nth === 1,
      `一模一样的三段，挂回原来的第二段 (${JSON.stringify(r.back)})`);

    // 同一段里重复：前后文认出第二处。
    r = carry(["好的就好的，好的。"], 0, "好的", ["好的就好的，好的。"], { skip: true });
    test.assert(r.back.length === 1 && r.back[0].from === 3, `同一段里重复，挂回原来那一处 (${JSON.stringify(r.back)})`);
    r = carry(["好的就好的，好的。"], 0, "好的", ["好的就好的，好的。"]);
    test.assert(r.back.length === 1 && r.back[0].from === 0, `同一段里重复，第一处也挂回第一处 (${JSON.stringify(r.back)})`);

    // 上下文没了（段落被改过）：同样的字里取离原位最近的一处；一样近就丢掉。
    const open = (docId, texts, stored) => { agent.onDocumentMounted({ docId, adapter: paragraphsOf(...texts), aiText: stored }); return agent.aiTextRanges(docId); };
    const lost = { text: "好的", from: 0, to: 2, prefix: "旧的前文", suffix: "旧的后文", index: 0, nth: 0 };
    const near = open("near", ["好的。", "别的。", "好的。"], [lost]);
    test.assert(near.length === 1 && near[0].paragraphId === "n0", `上下文没了，取离原位最近的一处 (${JSON.stringify(near)})`);
    const tie = open("tie", ["好的。", "别的。", "好的。"], [{ ...lost, index: 1 }]);
    test.assert(tie.length === 0, `两处一样近，分不清，丢掉不猜 (${JSON.stringify(tie)})`);
    // 第一版（没有前后文和序号）存下的台账照样能挂回。
    const slice1 = open("slice1", ["开头。", "只有这一处：好的。"], [{ paragraphId: "x", from: 6, to: 8, text: "好的", index: 1 }]);
    test.assert(slice1.length === 1 && slice1[0].paragraphId === "n1" && slice1[0].from === 6, `没有前后文的旧台账仍按字和位置挂回 (${JSON.stringify(slice1)})`);
    test.assert(open("gone", ["别的内容。"], [lost]).length === 0, "字已经不在文稿里，不再是 AI 字");
  }

  /* 7. ClioTalk 云端写入换掉了字节（台账没动）：字对不上的范围，下次打开就丢。 */
  {
    const p = planner();
    const synth = await buildQuoteDoc(p);
    const stale = [
      { paragraphId: "gone-1", from: 0, to: 12, text: "他们说得最多的不是房价。", index: 5, prefix: "", suffix: "", nth: 0 },
      { paragraphId: "gone-2", from: 0, to: 6, text: "县城的租克涨得快。", index: 3, prefix: "", suffix: "", nth: 0 },
    ];
    // 云端写入把第二句换成了别的话，字节整个被替换；台账还是上次存的那两条。
    const adapter = await p.open(synth, { name: "三联访谈.docx" });
    const target = adapter.paragraphs().find((para) => para.text === "县城的租克涨得快。");
    adapter.setRunText(target.id, 0, "云端改过的一句话。");
    const replaced = new Uint8Array((await adapter.save()).bytes);
    const cloud = await reopen(replaced, stale);
    const kept = cloud.agent.aiTextRanges("doc-1");
    const keptPara = kept.length ? cloud.v.record.liveAdapter.paragraphs().find((para) => para.id === kept[0].paragraphId) : null;
    test.assert(cloud.opened.ok && kept.length === 1 && kept[0].text === stale[0].text && !!keptPara
      && keptPara.text.slice(kept[0].from, kept[0].to) === stale[0].text,
      `字节被云端写入换掉：字还在的范围留着，对不上的丢掉 (${JSON.stringify(kept)})`);
    const everything = await reopen(replaced, [stale[1]]);
    test.assert(everything.opened.ok && everything.agent.aiTextRanges("doc-1").length === 0, "整条范围的字都被换掉，台账为空，文稿照常打开");
  }

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
