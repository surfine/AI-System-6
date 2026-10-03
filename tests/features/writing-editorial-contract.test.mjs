// Exercise the real outline/draft commands with a controlled transport and stores.
import assert from "node:assert/strict";
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
const test = createFeatureTest("writing-editorial-contract");
const flowSource = read("app/features/writing-flow.js");
const outlineSource = read("app/features/outline-claim.js");

function fixture() {
  const sections = [
    { id: "a1b2c3", title: "为什么", body: "已在上一节解释过接口机制。", sourceMarkdown: "## 为什么 {#a1b2c3}\n\n已在上一节解释过接口机制。", sourceOutlineIndex: 0 },
    { id: "d4e5f6", title: "怎样使用", body: "作者尚未下最终结论。", sourceMarkdown: "## 怎样使用 {#d4e5f6}\n\n作者尚未下最终结论。", sourceOutlineIndex: 1 },
    { id: "a7b8c9", title: "适用边界", body: "下一节讨论哪些设备不适用。", sourceMarkdown: "## 适用边界 {#a7b8c9}\n\n下一节讨论哪些设备不适用。", sourceOutlineIndex: 2 },
  ];
  const project = { id: "p1", questionSheet: "为什么同规格体验不同？", outline: sections.map((section) => section.sourceMarkdown).join("\n\n"), drafts: sections.map((section, i) => ({ id: `draft-${i}`, sectionId: section.id, body: section.body })) };
  const state = { project, active: project, selected: 1, responses: [], payloads: [], receipts: [], actions: [], previews: [], failures: [], contextCalls: [], beforeRead: null, confirm: null };
  const ctx = {
    window: {}, document: { getElementById: () => null }, outlineTreeEl: null, currentLanguage: "zh", t: (key) => key,
    getActiveProject: () => state.active,
    outlineContentEl: { value: project.outline }, questionSheetBodyInput: { value: project.questionSheet }, draftBodyInput: { value: sections[1].body },
    getLongTaskSignal: () => null,
    beginLongTask: () => true, endLongTask: () => {}, updateLocalModelState: () => {},
    getLocalModelRequestName: () => "requested-model",
    resolveWritingRoutePrompt: (id, language = ctx.currentLanguage) => `PRODUCT:${id}:${language}`,
    withMarkdownModelMessages: (messages) => messages,
    stripRebuildMarkdownFence: (value) => String(value).replace(/^```(?:markdown)?\s*|\s*```$/g, ""),
    clipContextContent: (value, limit) => String(value).slice(0, limit),
    prepareStreamingMarkdownPreview: async () => {},
    fetchModelPayload: async (payload) => { state.payloads.push(payload); return {}; },
    readModelTextStream: async (_response, handlers) => { if (state.beforeRead) await state.beforeRead(); const text = state.responses.shift(); handlers.onModel?.("served-model"); handlers.onSnapshot?.(text); return text; },
    buildBudgetedProjectContext: async (_query, options) => { state.contextCalls.push(options); return "[S1] Evidence: only the tested sample."; },
    showStreamingSurfacePreview: (...args) => state.previews.push(args),
    showSystemModal: async () => { if (state.confirm) await state.confirm(); return "yes"; },
    saveDeskState: async () => true,
    updateFlowGuideChecklist: () => {}, renderPipeline: () => {}, clearStatus: () => {}, setStatus: () => {}, openWindow: () => {},
    requestAnimationFrame: () => {}, ensureWritingFlowModule: async () => {},
    isAbortError: (error) => error?.name === "AbortError",
    reportWritingRouteModelFailure: async (error) => state.failures.push(error),
    getProjectOutlineDraftBlocks: () => sections,
    AISystem6RunReceipts: {
      recordModelAnswer: async (record) => { state.receipts.push(record); return { receiptId: `r${state.receipts.length}` }; },
      recordUserAction: async (id, action) => { state.actions.push({ id, ...action }); },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(flowSource, ctx); vm.runInContext(outlineSource, ctx);
  ctx.renderPipeline = () => {}; ctx.updateFlowGuideChecklist = () => {};
  const select = (index) => { state.selected = index; ctx.draftBodyInput.value = project.drafts[index].body; };
  ctx.currentSectionDraftContext = () => {
    if (state.active.id !== project.id) return null;
    return { project, block: sections[state.selected], draft: project.drafts[state.selected], title: sections[state.selected].title, body: ctx.draftBodyInput.value, outlineMarkdown: sections[state.selected].sourceMarkdown, outlineBody: sections[state.selected].body };
  };
  ctx.getReaderClipOutlineContext = () => ""; ctx.getReaderClipSummaries = () => [];
  ctx.writingStudioEli5Block = () => "";
  ctx.markTeachTextAiAssisted = () => {};
  ctx.updateProjectOutlineFromSelectedDraft = () => { project.drafts[state.selected].body = ctx.draftBodyInput.value; project.outline += "\nApplied"; ctx.outlineContentEl.value = project.outline; };
  ctx.syncLinkedTeachTextFromProject = () => {}; ctx.updateDraftVoiceStats = () => {}; ctx.refreshTeachTextSurfacePreview = () => {};
  ctx.setProjectOutlineMarkdown = (target, value) => { target.outline = value; if (state.active.id === target.id) ctx.outlineContentEl.value = value; return []; };
  ctx.getMeaningfulOutlineSections = (values) => values;
  ctx.extractOutlineSections = (text) => String(text).match(/^##\s+.+$/gm) || [];
  return { state, ctx, sections, select };
}
async function scenario(name, run) {
  try { await run(); test.assert(true, name); }
  catch (error) { test.assert(false, `${name}: ${error.message}`); }
}

await scenario("an eight-section technical outline and its subsections survive real retry with one frozen language and locks", async () => {
  const f = fixture(); const titles = Array.from({ length: 8 }, (_, i) => `章节${i + 1}`);
  const valid = titles.map((title, i) => `## ${title}\n\n解释${i}。${i === 7 ? "\n\n### 条件\n只适用于样机。" : ""}`).join("\n\n");
  f.state.responses = ["This output has no draftable headings.", valid];
  f.state.beforeRead = () => { f.ctx.currentLanguage = "zh"; };
  const content = await f.ctx.generateOutlineFromQuestionSheetCore({ genre: "technical-document", language: "en", locks: { sectionTitles: titles } });
  assert.equal(content, valid); assert.equal(f.state.project.outline, valid); assert.equal(f.state.payloads.length, 2);
  for (const payload of f.state.payloads) {
    const text = payload.messages.map((message) => message.content).join("\n");
    assert(text.includes('"genre":"technical-document"')); assert(text.includes('"language":"en"'));
    assert(text.includes(JSON.stringify(titles))); assert.equal(payload.ai_system6_task_kind, "generate-outline");
  }
  assert(f.state.payloads[1].messages[0].content.endsWith(":en"));
  assert(f.state.payloads.every((payload) => payload.max_tokens > 900));
  assert.equal(f.state.receipts[0].model, "served-model");
});
await scenario("an explicit video entry overrides project article defaults without changing author identity", async () => {
  const f = fixture(); f.state.project.genre = "article"; f.state.project.explanationLens = { medium: "written-article" };
  f.state.responses = ["## 发现\n\n画面演示，旁白解释原因。"];
  await f.ctx.generateOutlineFromQuestionSheetCore({ genre: "spoken-script" });
  assert(f.state.payloads[0].messages[0].content.includes('"genre":"spoken-script"'));
});
await scenario("Aaron and Luoluo voices are independent of medium and a named recipient does not replace the narrator", async () => {
  const f = fixture();
  for (const style of ["Aaron体", "落落体"]) for (const genre of ["article", "spoken-script"]) {
    const contract = f.ctx.resolveWritingEditorialContract(f.state.project, { genre, questions: `作者：Aaron\n接收者：落落\n文体：${style}\n协作方式：交接` });
    assert.equal(contract.genre, genre); assert.equal(contract.voiceIntent.author, "Aaron");
    assert.equal(contract.voiceIntent.recipient, "落落"); assert.equal(contract.voiceIntent.style, style);
    assert(Object.isFrozen(contract.voiceIntent));
  }
  const recipientOnly = f.ctx.resolveWritingEditorialContract(f.state.project, { questions: "接收者：落落\n请审阅这篇文章。" });
  assert.equal(recipientOnly.genre, "article"); assert.equal(recipientOnly.voiceIntent.author, "");
  assert.equal(recipientOnly.voiceIntent.style, "preserve-source");
});
await scenario("real outline retry retains the two-author handoff contract and cannot adopt after voice choices change", async () => {
  const f = fixture();
  f.state.project.editorialTask = { voiceIntent: { author: "Aaron", recipient: "落落", style: "Aaron体", operation: "handoff" } };
  f.state.responses = ["Malformed candidate", "## 发现\n解释研究，不冒充亲历。"];
  await f.ctx.generateOutlineFromQuestionSheetCore();
  for (const payload of f.state.payloads) {
    const text = payload.messages.map((message) => message.content).join("\n");
    assert(text.includes('"author":"Aaron","recipient":"落落","style":"Aaron体","operation":"handoff"'));
    assert(text.includes("A recipient is not the narrator"));
  }
  const original = f.state.project.outline;
  f.state.responses = ["## 新候选\n原来的声音。"];
  f.state.beforeRead = () => { f.state.project.editorialTask.voiceIntent.style = "落落体"; };
  await assert.rejects(f.ctx.generateOutlineFromQuestionSheetCore(), /target-stale/);
  assert.equal(f.state.project.outline, original);
});
await scenario("an explicit Question Sheet medium works while an incidental video mention does not change genre", async () => {
  const f = fixture();
  assert.equal(f.ctx.resolveWritingEditorialContract(f.state.project, { questions: "媒介：视频\n解释接口限制。" }).genre, "spoken-script");
  assert.equal(f.ctx.resolveWritingEditorialContract(f.state.project, { questions: "研究当年视频接口的不同规格。" }).genre, "article");
  assert.equal(f.ctx.resolveWritingEditorialContract(f.state.project, { questions: "请帮我制作一期视频，解释接口限制。" }).genre, "spoken-script");
});
await scenario("locked short headings are preserved; an added or renamed section triggers repair", async () => {
  const f = fixture(); f.state.responses = ["## 试车\n发现。\n\n## 不该新增\n额外。", "## 试车\n发现。\n\n## 限载\n条件。"];
  await f.ctx.generateOutlineFromQuestionSheetCore({ locks: { sectionTitles: ["试车", "限载"] } });
  assert.equal(f.state.payloads.length, 2); assert.match(f.state.project.outline, /## 限载/);
});
await scenario("a changed project during outline generation keeps its answer as a rejected proposal", async () => {
  const f = fixture(); const before = f.state.project.outline; f.state.responses = ["## 合法新节\n材料。"];
  f.state.beforeRead = () => { f.state.active = { id: "p2", outline: "## 另一个项目", questionSheet: "" }; };
  await assert.rejects(() => f.ctx.generateOutlineFromQuestionSheetCore(), /target-stale/);
  assert.equal(f.state.project.outline, before); assert.equal(f.state.receipts.length, 1);
  assert.equal(f.state.actions[0].action, "reject"); assert.equal(f.state.previews.length, 0);
});
await scenario("editing the original outline while its overwrite dialog is open cancels generation", async () => {
  const f = fixture(); f.state.confirm = () => { f.ctx.outlineContentEl.value += "\n用户新内容。"; };
  await f.ctx.generateOutline(); assert.equal(f.state.payloads.length, 0);
});
await scenario("draft cannot remove a locked author expression, and its refused answer remains a proposal", async () => {
  const f = fixture(); f.state.project.authorLocks = { text: "作者尚未下最终结论。" };
  f.state.responses = ["作者已经下了结论。"];
  await f.ctx.draftOutlineSection();
  assert.equal(f.state.project.drafts[1].body, "作者尚未下最终结论。");
  assert.equal(f.state.receipts[0].answerText, "作者已经下了结论。");
  assert.equal(f.state.actions[0].action, "reject");
  assert.equal(f.state.failures.length, 1);
});
await scenario("draft requests include global structure, neighbours and existing author text", async () => {
  const f = fixture(); f.state.responses = ["保留作者限定，再解释本节的具体操作。"];
  await f.ctx.draftOutlineSection();
  const prompt = f.state.payloads[0].messages[0].content;
  for (const phrase of ["为什么", "怎样使用", "适用边界", "已在上一节解释过接口机制。", "下一节讨论哪些设备不适用。", "作者尚未下最终结论。"]) assert(prompt.includes(phrase));
  assert.equal(f.state.project.drafts[1].body, "保留作者限定，再解释本节的具体操作。");
  assert.equal(f.state.receipts[0].model, "served-model"); assert.equal(f.state.actions[0].action, "accept");
});
for (const timing of ["generation", "confirmation"]) await scenario(`switching selected sections during ${timing} cannot write the old answer into a new section`, async () => {
  const f = fixture(); const before = f.state.project.drafts.map((draft) => draft.body); f.state.responses = ["原来第二节的候选。"];
  if (timing === "generation") f.state.beforeRead = () => f.select(2); else f.state.confirm = () => f.select(2);
  await f.ctx.draftOutlineSection();
  assert.deepEqual(f.state.project.drafts.map((draft) => draft.body), before);
  assert.equal(f.state.receipts.length, 1); assert.equal(f.state.actions[0].action, "reject");
  if (timing === "generation") assert.equal(f.state.previews.length, 0);
});
await scenario("changing the target body during confirmation preserves the user's new text", async () => {
  const f = fixture(); f.state.responses = ["模型旧候选。"];
  f.state.confirm = () => { f.ctx.draftBodyInput.value = "用户在弹窗期间的新句子。"; };
  await f.ctx.draftOutlineSection(); assert.equal(f.ctx.draftBodyInput.value, "用户在弹窗期间的新句子。");
  assert.notEqual(f.state.project.drafts[1].body, "模型旧候选。"); assert.equal(f.state.actions[0].action, "reject");
});
await scenario("polish uses the original section binding instead of the latest selected section", async () => {
  const f = fixture(); const before = f.state.project.drafts.map((draft) => draft.body); f.state.responses = ["润色后的原节候选。"];
  f.state.confirm = () => f.select(0); await f.ctx.polishDraft();
  assert.deepEqual(f.state.project.drafts.map((draft) => draft.body), before); assert.equal(f.state.actions[0].action, "reject");
});
await scenario("author lock mutations during generation invalidate the pending article", async () => {
  const f = fixture(); const before = f.state.project.outline; f.state.responses = ["## 新章\n材料。"];
  f.state.beforeRead = () => { f.state.project.authorLocks = { sectionTitles: ["为什么", "怎样使用", "适用边界"] }; };
  await assert.rejects(() => f.ctx.generateOutlineFromQuestionSheetCore(), /target-stale/); assert.equal(f.state.project.outline, before);
});

await scenario("title and opening locks are enforced without manufacturing a section count", async () => {
  const f = fixture();
  f.state.responses = ["# 错误标题\n\n错误开场。\n\n## 观察\n材料。", "# 作者标题\n\n作者锁定开场。\n\n## 观察\n材料。"];
  await f.ctx.generateOutlineFromQuestionSheetCore({ locks: { title: "作者标题", opening: "作者锁定开场。" }, maxTokens: 3300 });
  assert.equal(f.state.payloads.length, 2); assert.equal(f.state.payloads[0].max_tokens, 3300);
  assert(f.state.project.outline.startsWith("# 作者标题\n\n作者锁定开场。"));
});
await scenario("append suggestions also retain their original section through confirmation", async () => {
  const f = fixture(); const before = f.state.project.drafts.map((draft) => draft.body); f.state.responses = ["给原来第二节的建议。"];
  f.state.confirm = () => f.select(2); await f.ctx.suggestDraft();
  assert.deepEqual(f.state.project.drafts.map((draft) => draft.body), before); assert.equal(f.state.actions[0].action, "reject");
});
await scenario("ELI5 rewriting keeps a stale candidate in its receipt without writing the newly selected section", async () => {
  const f = fixture(); const before = f.state.project.drafts.map((draft) => draft.body);
  f.ctx.AISystem6PromptFilesRuntime = { resolvePromptFile: () => ({ body: "Use the supplied evidence only." }) };
  f.ctx.fetchModelPayload = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "解释原来第二节的候选。" } }], model: "served-eli5" }) });
  f.state.confirm = () => f.select(0);
  assert.equal(await f.ctx.eli5RewriteSection(), false);
  assert.deepEqual(f.state.project.drafts.map((draft) => draft.body), before);
  assert.equal(f.state.receipts[0].model, "served-eli5"); assert.equal(f.state.actions[0].action, "reject");
});

await scenario("a hash-only author lock is rejected before any paid request rather than being treated as protected text", async () => {
  const f = fixture();
  await assert.rejects(() => f.ctx.generateOutlineFromQuestionSheetCore({ locks: [{ target: "title", valueHash: "unbound-history-hash" }] }), /author-lock-unbound/);
  assert.equal(f.state.payloads.length, 0);
});

test.finish();
