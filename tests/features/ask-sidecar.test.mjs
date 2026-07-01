// Ask forms enter SideAsk semantics: the current app becomes the SideAsk
// anchor, and Finder single-task mode permits only that app plus ClioTalk.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("ask-sidecar");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const chatMessages = read("app/core/chat-messages.js");
const responsiveCss = read("styles/60-responsive.css");
const app = readAppSurface([
  "app/features/reader.js",
  "app/features/scrapbook.js",
  "app/features/docmap.js",
  "app/features/clio-stage.js",
  "app/core/window-manager.js",
]);

[
  ["reader", "reader-ask-form", "arrangeReaderAssistantSplit"],
  ["scrapbook", "scrapbook-ask-form", "arrangeScrapbookAssistantSplit"],
  ["docMap", "docmap-ask-form", "arrangeDocMapAssistantSplit"],
  ["clioStage", "clio-stage-ask-form", "arrangeClioStageAssistantSplit"],
].forEach(([name, formId, splitFn]) => {
  test.assertIncludes(app, `id="${formId}"`, `${name} exposes an Ask form`);
  test.assertIncludes(app, `await ${splitFn}()`, `${name} Ask opens ClioTalk as a sidecar`);
});

test.assertIncludes(windowManager, "async function arrangeWindowAssistantSplit", "Ask sidecars share one window split helper");
test.assertIncludes(app, "let sideAskAnchorAppId = \"teachText\"", "SideAsk defaults to TeachText as its normal anchor");
test.assertIncludes(multiFinder, "return appId === \"clioTalk\" || appId === sideAskAnchorAppId", "SideAsk permits only ClioTalk and the current anchor app");
test.assertIncludes(windowManager, "setSideAskAnchorApp(sourceAppId)", "Ask surfaces become the current SideAsk anchor");
test.assertIncludes(windowManager, "prepareFinderModeForApp(sourceAppId)", "Ask surfaces still run Finder single-task cleanup around the SideAsk pair");
test.assertIncludes(windowManager, "if (sideAskEnabled && !isSideAskPairApp(appId)) clearSideAskMode()", "leaving the pair clears SideAsk instead of keeping a stale anchor");
test.assertIncludes(windowManager, "function updateSideAskSourceChrome()", "SideAsk updates paired app chrome");
test.assertIncludes(windowManager, "function saveSideAskRestoreFrame(win)", "SideAsk saves the paired windows' pre-split frames");
test.assertIncludes(windowManager, "function restoreSideAskFrames()", "leaving SideAsk restores only windows moved by the SideAsk pair");
test.assertIncludes(windowManager, "saveSideAskRestoreFrame(sourceWindow)", "Ask split saves the source window before moving it");
test.assertIncludes(windowManager, "saveSideAskRestoreFrame(refreshedAssistant)", "Ask split saves ClioTalk before moving it");
test.assertIncludes(windowManager, "restoreSideAskFrames();", "clearing SideAsk restores the temporary pair layout");
test.assertIncludes(windowManager, "reader: readerAskForm", "Reader Ask bar participates in SideAsk chrome");
test.assertIncludes(windowManager, "scrapbook: scrapbookAskForm", "Scrapbook Ask bar participates in SideAsk chrome");
test.assertIncludes(windowManager, "docMap: docMapAskForm", "DocMap Ask bar participates in SideAsk chrome");
test.assertIncludes(windowManager, "clioStage: clioStageAskForm", "ClioStage Ask bar participates in SideAsk chrome");
test.assertIncludes(windowManager, "form.hidden = !isMultiFinderMode() && sideAskEnabled && sideAskAnchorAppId === appId", "active SideAsk source hides its duplicate Ask bar");
test.assertIncludes(windowManager, 'openWindow("assistant", { skipFinderMode: true, skipPlacement: true, skipFocus: true })', "Ask sidecars bypass Finder single-task hiding");
test.assertNotIncludes(windowManager, "writerMode || !isMultiFinderMode()", "Finder mode still receives the document + ClioTalk split");
test.assertIncludes(windowManager, "const sourceWidth = Math.round((totalWidth - gap) * 0.6)", "document side keeps the left 6/10 of the split");
test.assertIncludes(windowManager, "const assistantWidth = Math.max(340, totalWidth - gap - sourceWidth)", "ClioTalk keeps the right side of the split");
test.assertMatches(responsiveCss, /body\.is-writer-mode \.assistant-window[\s\S]*left: 0 !important;[\s\S]*width: 60vw !important;/, "TeachText SideAsk places ClioTalk on the left 6/10");
test.assertMatches(responsiveCss, /body\.is-writer-mode \.teachtext-window[\s\S]*left: 60vw !important;[\s\S]*width: 40vw !important;/, "TeachText SideAsk places TeachText on the right 4/10");
test.assertIncludes(chatMessages, "function formatSideAskAnchorContext()", "SideAsk has a default context loader for the paired app");
test.assertIncludes(chatMessages, "function sideAskAnswerStyleInstruction()", "SideAsk has a low-pressure answer style");
test.assertIncludes(chatMessages, "function ragGroundingInstruction", "SideAsk has an explicit RAG grounding contract");
test.assertIncludes(chatMessages, "是主要依据，不是回答边界", "RAG context grounds the answer without imprisoning it");
test.assertIncludes(chatMessages, "材料明说了什么、你从材料推断了什么、哪些需要回到来源或外部事实核对", "RAG answers distinguish source text, inference, and checks");
test.assertIncludes(chatMessages, "不要写审稿报告", "SideAsk explicitly avoids report-like replies");
test.assertIncludes(chatMessages, "不要用“结论：”“依据：”开头", "SideAsk avoids suffocating conclusion/evidence labels by default");
test.assertIncludes(chatMessages, "isSideAskChat ? \"sideask\" : \"chat\"", "normal SideAsk composer messages use a short-answer task kind");
test.assertIncludes(chatMessages, "if (/sideask|reader|scrapbook|clio-stage/.test(kind)) return 520", "SideAsk source questions have a short output budget");
test.assertIncludes(chatMessages, "if (!sideAskEnabled || isMultiFinderMode()) return \"\"", "SideAsk context is limited to Finder SideAsk, not MultiFinder");
test.assertIncludes(chatMessages, "teachTextBodyInput?.value", "default TeachText SideAsk loads the TeachText body into ClioTalk context");
test.assertIncludes(chatMessages, "currentReaderPage.text", "Reader SideAsk follow-ups can reuse the current Reader source");
test.assertIncludes(chatMessages, "formatScrapsForTransfer(sourceScraps)", "Scrapbook SideAsk follow-ups can reuse selected or project scraps");
test.assertIncludes(chatMessages, "formatDocMapMarkdown(currentDocMap)", "DocMap SideAsk follow-ups can reuse the active map");
test.assertIncludes(chatMessages, "clioStageState.source.markdown", "ClioStage SideAsk follow-ups can reuse the active deck");
test.assertIncludes(chatMessages, "const sideAskContext = skipContext ? \"\" : formatSideAskAnchorContext()", "normal ClioTalk prompts include SideAsk context unless a task supplies its own context");
test.assertIncludes(app, "sideAskAnswerStyleInstruction()", "source Ask buttons share the low-pressure SideAsk style");
test.assertIncludes(app, "ragGroundingInstruction", "source Ask buttons share the RAG grounding contract");
test.assertIncludes(app, "taskKind: \"docmap-question\"", "DocMap questions use the short SideAsk budget instead of the DocMap generation budget");
test.assertNotIncludes(app, "先给结论", "source Ask prompts no longer force conclusion-first report language");
test.assertNotIncludes(app, "只根据下面", "source Ask prompts no longer make RAG a source-only prison");
test.assertNotIncludes(app, "Answer only from", "English source Ask prompts no longer make RAG a source-only prison");

test.finish();
