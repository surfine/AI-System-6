// Writing Demo protects the recordable panoramic demo from becoming a loose
// marketing tour. It starts from Applications rather than interrupting the
// quiet Start Here welcome, then runs through the real writing surfaces and
// hands the final Project CD object to DocMap, ClioStage, and ClioTalk context.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-demo");

const html = read("index.html");
const app = read("app.js");
const actions = read("app/core/actions.js");
const config = read("app/core/config.js");
const manifest = read("scripts/runtime-manifest.mjs");
const demo = read("app/features/writing-demo.js");
const iphone17eCorpus = read("app/data/iphone-17e-demo-corpus.js");
const docmap = read("app/features/docmap.js") + read("app/core/docmap-entry.js");
const exportImport = read("app/features/export-import.js");
const outlineClaim = read("app/features/outline-claim.js");
const persistenceStatus = read("app/core/persistence-status.js");
const slidesExport = read("app/features/slides-export.js");
const writingFlow = read("app/features/writing-flow.js");
const outlinePrompt = read("app/content/ai-prompts/writing-route/outline-generate.md");
const sectionDraftPrompt = read("app/content/ai-prompts/writing-route/section-draft.md");
const windowManager = read("app/core/window-manager.js");
const appsCss = read("styles/50-apps.css");
const liquidCss = read("styles/70-liquid-glass.css");
const responsiveCss = read("styles/60-responsive.css");
const readerDocmapCss = read("styles/20-reader-docmap.css");
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");
const guideWindow = html.match(/data-window="guide"[\s\S]*?<\/section>/)?.[0] || "";

test.assertNotIncludes(guideWindow, 'data-action="play-writing-demo"', "Start Here stays quiet instead of launching the live demo");
test.assertIncludes(app, 'action: "play-writing-demo"', "the rendered Applications registry exposes the live demo");
test.assertIncludes(html, 'data-action="guide-start-route"', "original writing route remains available outside the primary CTA");
test.assertIncludes(zh, 'guide_play_demo: "播放实战演示"', "Chinese CTA copy names the demo");
test.assertIncludes(en, 'guide_play_demo: "Play Live Demo"', "English CTA copy names the demo");

test.assertIncludes(config, 'createLazyModuleLoader("AISystem6WritingDemoLoaded", [', "demo is lazy-loaded on demand");
test.assertIncludes(manifest, '"app/features/writing-demo.js"', "demo is tracked as lazy runtime");
test.assertIncludes(manifest, '"app/data/iphone-17e-demo-corpus.js"', "shared iPhone 17e demo corpus is tracked as lazy runtime");
test.assert(
  config.indexOf('"app/data/iphone-17e-demo-corpus.js"') < config.indexOf('"app/features/writing-demo.js"'),
  "demo loader loads the shared iPhone 17e corpus before the director"
);
test.assertIncludes(actions, '"play-writing-demo": playWritingDemoFromGuide', "play-writing-demo action is registered");
test.assertIncludes(iphone17eCorpus, "aaronBulletInput", "shared 17e corpus carries Aaron-style sample input");
test.assertIncludes(iphone17eCorpus, "mingmingReferenceOutput", "shared 17e corpus carries the Mingming reference output");
test.assertIncludes(iphone17eCorpus, "appleNewsroomUrl", "shared 17e corpus carries the Reader source URL");

[
  "writingDemoSearch",
  "writingDemoReader",
  "writingDemoScrapbook",
  "writingDemoQuestionSheet",
  "writingDemoOutline",
  "writingDemoSectionDrafts",
  "writingDemoTeachText",
  "writingDemoReviewDesk",
  "writingDemoProjectCdAndDocMap",
  "writingDemoClioStage",
  "writingDemoClioTalk",
].forEach((fn) => {
  test.assertIncludes(demo, `function ${fn}`, `demo contains ${fn}`);
});

test.assertIncludes(demo, "function writingDemoHasConfiguredModel()", "demo requires one active model route (local or cloud)");
test.assertIncludes(demo, "window.AISystem6Iphone17eDemoCorpus", "demo reads the shared iPhone 17e corpus");
test.assertIncludes(demo, "writingDemoScriptSteps", "demo is directed from a structured recording script");
test.assertIncludes(demo, "userVisiblePurpose", "each demo step explains the work problem being solved");
test.assertIncludes(demo, "expectedVisibleChange", "each demo step declares the visible result");
test.assertIncludes(demo, "failureMessage", "each demo step fails with a specific object/action message");
test.assertIncludes(demo, "来源进入项目", "demo script starts from source-to-project proof, not a feature tour");
test.assertIncludes(demo, "逐节推敲", "demo script keeps section drafting as the central proof point");
test.assertIncludes(demo, "成稿继续复用", "demo script ends by reusing the Project CD manuscript");
test.assertIncludes(demo, "function writingDemoSelectedLocalModelName()", "demo accepts the selected local model name before the real preflight");
test.assertMatches(demo, /function writingDemoHasLiveModel\(\)[\s\S]*return !!selectedLocalModel;/, "local demo route is not blocked by stale ready-state flags");
test.assertIncludes(demo, "writingDemoIsCloudActive()", "demo detects configured cloud model state explicitly");
test.assertIncludes(demo, "writingDemoAssertModelAvailable", "demo keeps model availability enforced before AI actions");
test.assertIncludes(demo, "function writingDemoModelProfile", "demo adapts retry budgets for constrained local and cloud models");
test.assertIncludes(demo, "flash|lite|mini|small", "demo treats flash cloud models as constrained routes");
test.assertNotIncludes(demo, "0\\.8b|1b|1\\.5b|2b|3b", "demo no longer carries dedicated qwen 0.8B optimization paths");
test.assertNotIncludes(demo, "strictScaffold", "demo no longer has a strict scaffold route for very small local models");
test.assertNotIncludes(demo, "writing-demo-generate-outline", "live demo no longer generates an outline from the Question Sheet");
test.assertMatches(demo, /function writingDemoPreflightModel\(\)[\s\S]*fetchModelPayload[\s\S]*writing-demo-preflight/, "demo proves the current LLM route with a real preflight request");
test.assertIncludes(persistenceStatus, "const contextLengthPresetValues = [8192, 32768, 65536, 131072, 262144]", "model picker exposes the largest 262144 context preset for long-context local models");
test.assertIncludes(persistenceStatus, "const hasUserOverride = !!contextLengthUserOverrides[key]", "context length defaults distinguish user overrides from stale loaded values");
test.assertIncludes(persistenceStatus, "[remembered, hasUserOverride && previous && previous <= record.max ? previous : 0, record.max]", "models default to their largest selectable context window unless the user overrode it");
test.assertIncludes(demo, "function writingDemoRunPreflight()", "demo runs a formal preflight before recording");
test.assertIncludes(demo, "function writingDemoProbeSearch()", "preflight checks Searcher before the formal demo");
test.assertIncludes(demo, "searchFindPath(writingDemoSearchKeyword), 20000", "Searcher demo waits long enough for real search providers instead of failing on a tiny timeout");
test.assertIncludes(demo, "function writingDemoProbeReader()", "preflight checks Reader before the formal demo");
test.assertIncludes(demo, '"organize-question-sheet"', "preflight probes question-sheet organization");
test.assertIncludes(demo, '"draft-section"', "preflight probes section drafting");
test.assertIncludes(demo, '"hkrr"', "preflight probes HKRR review");
test.assertIncludes(demo, '"docmap"', "preflight probes DocMap generation");
test.assertIncludes(demo, '"marp"', "preflight probes Marp generation");
test.assertIncludes(demo, '"writing-demo-rag"', "preflight and ClioTalk use the real model route for context-grounded writing follow-ups");
test.assertIncludes(demo, "ClioTalk 写作追问", "preflight names ClioTalk as a writing-flow follow-up surface");
test.assertIncludes(demo, "演示准备失败，未进入正式录屏流程", "preflight failure stops before the formal recording chain");
test.assertNotIncludes(demo, "offline:", "demo does not play canned offline previews");
test.assertIncludes(demo, "writingDemoNarrate", "demo narrates major workflow steps for screen recording");
test.assertIncludes(demo, "function writingDemoStage", "demo stages each step by closing unused windows and placing the active windows");
test.assertIncludes(demo, "writingDemoManagedWindows", "demo knows which windows to clean up between stages");
test.assertIncludes(demo, "function writingDemoVisibleWindowNames", "demo detects all visible windows before staging a recording step");
test.assertIncludes(demo, "new Set([...writingDemoVisibleWindowNames(), ...writingDemoManagedWindows])", "demo closes visible stray windows, not only its original whitelist");
test.assertIncludes(demo, "closeWindow(name, true)", "demo closes unused windows without save prompts during the recording flow");
test.assertIncludes(demo, "writingDemoUserPreservedWindows", "demo preserves user-opened system message windows during staging");
test.assertIncludes(demo, "function writingDemoPlaceWindow", "demo uses stable non-overlapping window frames");
test.assertIncludes(windowManager, "function placeWindowForExplicitLayout", "explicit layout commands share the window-manager placement path");
test.assertIncludes(demo, "placeWindowForExplicitLayout(win", "live demo stages windows through the shared explicit layout path");
test.assertIncludes(demo, 'slot === "leftNarrow"', "demo has a narrow-left slot for source/outline panes");
test.assertIncludes(demo, 'slot === "rightWide"', "demo has a wide-right slot for manuscript panes");
test.assertIncludes(demo, "function writingDemoCaptionAvoidanceInset", "demo treats its recording caption as a bottom avoidance area");
test.assertIncludes(demo, "bottom: Math.max(36, writingDemoCaptionAvoidanceInset())", "demo window frames reserve space for the visible caption strip");
test.assertIncludes(demo, "function writingDemoClampWindowAboveCaption", "caption avoidance also clamps windows opened by product actions");
test.assertIncludes(appsCss, ".writing-demo-caption", "demo caption styling lives in CSS instead of inline JS");
test.assertIncludes(demo, 'caption.style.zIndex = "var(--z-demo-overlay)"', "demo caption sits on the demo overlay layer");
test.assertIncludes(demo, 'ring.style.zIndex = "var(--z-demo-highlight)"', "demo highlight sits on the demo highlight layer");
test.assertIncludes(appsCss, ".writing-demo-highlight", "demo highlight styling lives in CSS");
test.assertIncludes(liquidCss, "--demo-caption-bg:", "Liquid Glass adapts the demo caption material through tokens");
test.assertIncludes(responsiveCss, ".writing-demo-caption", "demo caption has a narrow-screen width rule");
test.assertNotIncludes(demo, "caption.style.background", "demo caption does not hard-code classic material in JS");
test.assertIncludes(demo, "writingDemoRun.windowSlots.set(name, slot)", "demo remembers each staged window slot for caption-aware reflow");
test.assertIncludes(demo, "function writingDemoReflowVisibleWindowsForCaption", "demo reflows visible windows when the caption changes");
test.assertIncludes(demo, "writingDemoManagedWindows.includes(name)", "caption reflow applies a fallback to managed windows without a recorded slot");
test.assertIncludes(demo, "writingDemoReflowVisibleWindowsForCaption()", "caption display immediately reapplies the safe window layout");
test.assertIncludes(demo, "function writingDemoHighlightElement", "demo highlights the input, button, or command being used");
test.assertIncludes(demo, "function writingDemoShowCaption", "demo uses a single caption strip instead of stacked notifications");
test.assertNotIncludes(demo, "pushSystemNotification(text", "demo narration does not stack notification popups over the recording");
test.assertIncludes(demo, "writingDemoPause(1200)", "demo pauses on important narration beats so viewers can follow");
test.assertIncludes(demo, "function writingDemoFocusWindow", "demo focuses the currently used window before choosing commands");
test.assertIncludes(demo, "function writingDemoElementIsFrontmostInWindow", "demo verifies command targets are not hidden behind another window");
test.assertIncludes(demo, "document.elementFromPoint(x, y)", "demo command visibility check uses real hit testing");
test.assertIncludes(demo, "function writingDemoCommandMenuCandidates", "demo chooses the visible command menu for the active window");
test.assertIncludes(demo, ".filter((item) => item.visible && item.hasAction)", "demo does not choose hidden or wrong command menus");
test.assertIncludes(demo, "Number(b.frontmost) - Number(a.frontmost) || b.top - a.top", "demo prefers the frontmost lower command menu when a window has multiple command surfaces");
test.assertIncludes(demo, "await writingDemoEnsureCommandVisible(windowName, button, options)", "demo re-focuses the active window before highlighting a command button");
test.assertIncludes(demo, "focusWindowName: options.focusWindowName || windowName", "demo keeps the active command window focused while a model action runs");
test.assertIncludes(demo, "Date.now() - lastFocusAt > 900", "demo periodically restores focus during long model actions");
test.assertIncludes(demo, "writingDemoRunAction", "demo runs real LLM commands through the UI action layer");
test.assertIncludes(demo, "function writingDemoClickActionButton", "demo can perform visible non-model UI transitions");
test.assertIncludes(demo, "function writingDemoInstallSeedOutline", "demo installs the author-provided outline instead of generating one during recording");
test.assertIncludes(demo, "writingDemoWaitForAiResult", "demo waits for model output and confirmation UI");
test.assertIncludes(demo, "function writingDemoWaitForExpectedResult", "demo waits for the target surface to receive a concrete model result");
test.assertIncludes(demo, "function writingDemoWaitForActionCompletion", "demo lets concrete target-surface output beat stale global busy flags");
test.assertIncludes(demo, "if (value.length > 140) return false", "demo does not treat normal long Chinese drafts containing 正在 as pending status text");
test.assertIncludes(demo, "organizeQuestionSheetCore", "question-sheet demo organization uses the same production core as the ordinary command");
test.assertIncludes(demo, "applyOrganizedQuestionSheet", "question-sheet demo writes through the same production validator/apply path");
test.assertIncludes(demo, "模型没有实质改写原始输入", "question-sheet organization must materially rewrite the user's input");
test.assertIncludes(demo, "cleanWithModel: true", "demo keeps the normal dictation cleanup path instead of special-casing tiny models");
test.assertMatches(demo, /writingDemoQuestionSheet[\s\S]*问题单只是写作边界和参考[\s\S]*writingDemoClickActionButton\("advance-question-to-outline"/, "question-sheet stage treats Question Sheet as guidance before switching to the author-provided Outline");
test.assertIncludes(demo, "actionLabel", "demo model-action timeouts name the concrete command");
test.assertIncludes(demo, "点击到大纲后，大纲窗口没有打开", "question-sheet stage fails precisely if the visible Outline transition does not happen");
test.assertNotIncludes(demo, '"notificationCenter",', "demo does not manage a user-opened notification center as part of its cleanup list");
test.assertMatches(demo, /writingDemoOutline[\s\S]*writingDemoInstallSeedOutline\(\)[\s\S]*writingDemoRunAction\("outline", "mingming-outline"[\s\S]*advanceOutlineToSectionDrafts/, "outline stage installs the author outline and runs the Mingming rewrite command");
test.assertIncludes(demo, "readResult: () => writingDemoDraftText(index)", "section draft model commands wait on the current draft body");
test.assertMatches(demo, /function writingDemoDraftText[\s\S]*draftBodyInput\?\.value[\s\S]*draft\?\.body/, "current section result checks prefer the visible textarea over stale project draft state");
test.assertIncludes(demo, "function writingDemoEnsureVisibleDraftContent", "demo requires generated drafts to be visible before the next command");
test.assertIncludes(demo, "草稿没有显示在当前窗口", "demo stops instead of polishing a hidden or blank draft");
test.assertIncludes(demo, "const draftCount = Math.min(Math.max(project?.drafts?.length || 0, 1), 2)", "section draft demo limits real foreground generation to two sections");
test.assertIncludes(demo, "visibleCount = Math.min(draftCount, 2)", "section draft demo only foregrounds two sections for recording clarity");
test.assertIncludes(demo, "从空章节开始，点击「AI 起草」", "section draft demo visibly starts from an empty section");
test.assertMatches(demo, /writingDemoFocusWindow\("sectionDrafts", "wide"\)[\s\S]*点击「AI 起草」/, "section draft demo focuses the draft window before showing draft captions");
test.assertIncludes(demo, "function writingDemoSeedDraftFromOutline", "section draft demo can seed an existing draft from the author outline");
test.assertIncludes(demo, "seededSections[index]", "section draft seed falls back to the author-provided outline by section index");
test.assertIncludes(demo, "第 2 节没有可润色的作者大纲材料", "section draft demo stops before polishing if the author seed is missing");
test.assertIncludes(demo, "第 2 节已有作者大纲材料；现在只点击「AI 润色」，不再重复起草。", "section draft demo polishes existing author material instead of drafting twice");
test.assert((demo.match(/\"draft-current-section\"/g) || []).length === 1, "section draft demo only runs AI drafting once");
test.assertIncludes(demo, "await writingDemoHighlightElement(draftBodyInput", "demo highlights the visible section text before polishing it");
test.assertMatches(demo, /"polish-draft"[\s\S]*requireChanged: false/, "live demo does not require polish-draft to produce a detectable textual diff");
test.assertIncludes(demo, "AI 润色后保留", "demo validates the polished section remains usable after the action");
test.assertNotIncludes(demo, '"suggest-draft"', "section draft demo does not add a third foreground command that confuses the recording");
test.assertIncludes(demo, "function writingDemoAssertChineseManuscript", "demo rejects non-Chinese generated manuscripts before export");
test.assertIncludes(demo, "function writingDemoAssertChineseSectionDraft", "demo validates short section drafts separately from final manuscripts");
test.assertIncludes(demo, "chineseCount < 120", "section draft validation accepts short real sections without weakening final manuscript checks");
test.assertIncludes(demo, "function writingDemoAssertDocMapReadyManuscript", "demo verifies final draft length before Project CD -> DocMap");
test.assertIncludes(demo, "低于 DocMap 最低要求", "demo stops with a precise DocMap length failure before exporting");
test.assertIncludes(demo, "const targetChars = Math.max(minChars + 180, 980)", "demo rewrite asks for enough final manuscript length before DocMap");
test.assertIncludes(demo, "正在扩写演示定稿", "demo rewrite retries short final manuscripts before stopping");
test.assertIncludes(demo, "minResultLength: profile.sectionMinChars", "demo uses model-aware section draft length gates");
test.assertIncludes(demo, "finalRewriteAttempts: constrained ? 4 : 2", "demo gives constrained models extra final rewrite recovery attempts");
test.assertIncludes(demo, "writingDemoRequireText(writingDemoReviewText(), \"铭铭视角\")", "review stage must have real Mingming-perspective output before rewriting");
test.assertIncludes(demo, "praiseReviewDeskText()", "review stage calls the Review Desk praise implementation directly");
test.assertMatches(demo, /writingDemoReviewDesk[\s\S]*writingDemoCommandMenu\("reviewDesk", "ai-praise"\)[\s\S]*praiseReviewDeskText\(\)/, "review stage shows the praise command but does not route it through the shared active-window action");
test.assertIncludes(demo, "function writingDemoAwaitWithModalAccept", "demo actions can wait through system modals without blocking the recording");
test.assertIncludes(demo, "function writingDemoDrainSystemModals", "demo drains late system confirmation dialogs after model actions");
test.assertIncludes(demo, "function writingDemoShouldAutoAcceptSystemModal", "demo only auto-accepts known AI result confirmation dialogs");
test.assertIncludes(demo, "function writingDemoStartModalAutoAccept", "demo runs a background modal accepter while recording");
test.assertIncludes(demo, "setInterval(() =>", "demo modal accepter is not tied to a single action wait loop");
test.assertIncludes(demo, "writingDemoStartModalAutoAccept()", "demo starts background modal acceptance when recording begins");
test.assertIncludes(demo, "writingDemoStopModalAutoAccept()", "demo stops background modal acceptance when recording ends");
test.assertIncludes(demo, "quietMs = 700", "demo waits for a quiet period so late confirmation dialogs do not block the next step");
test.assertIncludes(demo, "await writingDemoDrainSystemModals({ timeoutMs: 2400, quietMs: 300 })", "demo clears stale confirmation dialogs before staging or choosing a new command");
test.assertIncludes(demo, "await writingDemoDrainSystemModals({ timeoutMs: 7000, quietMs: 900 })", "demo drains confirmation dialogs after a target surface already received model output");
test.assertIncludes(demo, "writingDemoPlaceWindow(windowName, options.slot || \"wide\")", "demo re-applies its stage after product actions open or move windows internally");
test.assertIncludes(demo, "function writingDemoEnsureDraftContent", "demo verifies that section drafts received real model output");
test.assertIncludes(demo, "没有收到模型草稿，演示已停止", "demo stops when section drafting produces no real model output");
test.assertNotIncludes(demo, "allowFailure", "demo has no continue-on-model-failure path");
test.assertIncludes(demo, "options.execute", "demo can show command-menu actions without executing them");
test.assertIncludes(demo, "若是铭铭会怎么写", "outline stage demonstrates the Mingming rewrite command");
test.assertMatches(demo, /writingDemoOutline[\s\S]*"mingming-outline"[\s\S]*advanceOutlineToSectionDrafts/, "outline stage keeps the recording focused on Mingming handoff to section drafts");
test.assertIncludes(demo, '"review-mingming-section"', "review stage demonstrates the Mingming perspective command");
test.assertNotIncludes(demo, '"review-hkrr-section"', "review stage no longer uses HKRR as the demo review action");
test.assertIncludes(demo, "Array.isArray(options.stage)", "demo actions can restore multi-window stage layouts after commands run");
test.assertMatches(demo, /writingDemoTeachText[\s\S]*name: "outline", slot: "leftNarrow"[\s\S]*name: "teachText", slot: "rightWide"/, "TeachText demo stage shows Outline and manuscript side by side");
test.assertNotIncludes(demo, 'writingDemoCommandMenu("teachText", "make-docmap")', "TeachText stage does not fork early into DocMap during the manuscript proof");
test.assertMatches(demo, /writingDemoReviewDesk[\s\S]*writingDemoStage\(\[\{ name: "teachText", slot: "main" \}, \{ name: "reviewDesk", slot: "side" \}\]\)/, "review stage shows TeachText and Review Desk side by side");
test.assertMatches(demo, /writingDemoClioTalk[\s\S]*writingDemoStage\(\[\{ name: "assistant", slot: "main" \}, \{ name: "contextPanel", slot: "side" \}\]\)/, "ClioTalk stage shows the writing follow-up and Context Panel side by side");
test.assertIncludes(demo, "不是另一个聊天入口", "ClioTalk narration explains its role inside the writing flow");
test.assertIncludes(demo, "如果把这篇稿子剪成 20 秒 B 站开头，应该抓哪两段，为什么？", "ClioTalk asks a concrete opening-editing question");
test.assertIncludes(demo, "正文里哪些判断必须保留原文依据，避免评论区质疑？", "ClioTalk asks a fact-boundary writing question");
test.assertNotIncludes(demo, "如果下一版要更像口播、更少论文腔，优先改哪三处？", "ClioTalk demo keeps RAG follow-ups short enough for recording");
test.assertIncludes(demo, "写作用途：", "ClioTalk answers must frame the writing decision being supported");
test.assertIncludes(demo, "总长控制在 220 字以内", "ClioTalk demo answers are capped as short recording-friendly RAG answers");
test.assertIncludes(demo, "右侧 Context Panel 显示 ClioTalk 引用了当前项目里的 Project CD 成稿", "ClioTalk stage proves the answer is grounded in the project manuscript context");
test.assertNotIncludes(demo, 'cloudConfig.model = "deepseek-v4-flash"', "demo does not force a vendor-specific cloud model");
test.assertNotIncludes(demo, "writingDemoIsDeepSeekReady", "demo is not gated on DeepSeek");
test.assertIncludes(zh, "实战演示需要可用的模型（本地或云端）", "Chinese demo copy points users to local-or-cloud readiness");
test.assertIncludes(en, "ready model (local or cloud)", "English demo copy points users to local-or-cloud readiness");
test.assertIncludes(zh, "正在预检真实 LLM 连接", "Chinese demo copy explains the preflight");
test.assertIncludes(en, "Checking the real LLM connection", "English demo copy explains the preflight");
test.assertNotIncludes(zh, "writing_demo_needs_deepseek", "Chinese demo copy is not DeepSeek-gated");
test.assertNotIncludes(en, "writing_demo_needs_deepseek", "English demo copy is not DeepSeek-gated");
test.assertIncludes(zh, "ClioTalk 写作追问", "Chinese demo completion copy frames ClioTalk as a writing follow-up surface");
test.assertIncludes(en, "ClioTalk writing follow-ups", "English demo completion copy frames ClioTalk as a writing follow-up surface");
test.assertNotIncludes(demo, "_cloud_api_key", "demo does not embed or forward an API key manually");
test.assertNotIncludes(demo, "apiKey:", "demo fixtures do not contain API key fields");

test.assertIncludes(docmap, "function docMapSourceFromProjectCd()", "Project CD can be a DocMap source");
test.assertIncludes(docmap, 'scope: "projectCd"', "Project CD DocMap source keeps projectCd scope");
test.assertIncludes(exportImport, "function attachSelectedProjectCdToAssistantContext()", "Project CD can attach to ClioTalk context");
test.assertIncludes(demo, "attachSelectedProjectCdToAssistantContext()", "demo attaches final Project CD item before ClioTalk RAG questions");
test.assertIncludes(demo, "generateMarpMarkdownAndOpenClioStage", "demo generates ClioStage slides with the active LLM route");
test.assertIncludes(demo, "demoBrief: true", "ClioStage demo uses the real Marp generator in a short recording mode");
test.assertIncludes(demo, "ClioStage 没有生成 Marp，演示已停止", "ClioStage failures stop the live demo instead of opening fake slides");
test.assertNotIncludes(demo, "writingDemoFallbackMarp", "demo does not create fallback slide content");
test.assertMatches(slidesExport, /function ensureClioMarpVisualStyle[\s\S]*lines\[0\]\?\.trim\(\) !== "---"[\s\S]*"marp: true"[\s\S]*text/, "Marp exporter normalizes missing frontmatter instead of failing valid slide content");
test.assertMatches(slidesExport, /maybeFrontmatter[\s\S]*\^marp\\s\*:\\s\*true/, "Marp output cleaner only treats --- as frontmatter when it contains marp: true");
test.assertMatches(slidesExport, /if \(!\/\^marp\\s\*:\\s\*true[\s\S]*text/, "Marp visual style wrapper repairs leading slide separators that are not frontmatter");
test.assertIncludes(outlineClaim, "function generateOutlineFromQuestionSheetCore", "ordinary and demo outline generation share one production core");
test.assertIncludes(outlineClaim, "function organizeQuestionSheetCore", "ordinary and demo Question Sheet organization share one production core");
test.assertIncludes(outlineClaim, "function validateOrganizedQuestionSheet", "Question Sheet organization validates model output before writing it");
test.assertIncludes(outlineClaim, "function questionSheetPromptLeakReason", "Question Sheet organization rejects prompt-contract leakage");
test.assertIncludes(outlineClaim, "正在检索问题单上下文", "Question Sheet organization reports context retrieval as a visible long-task phase");
test.assertIncludes(outlineClaim, "contextBudget", "Question Sheet organization has a dedicated context budget instead of blindly using the full pipeline budget");
test.assertIncludes(outlineClaim, "整理问题单超时", "Question Sheet organization has a hard timeout instead of hanging indefinitely");
test.assertIncludes(outlineClaim, "Previous failed output excerpt", "Question Sheet retry carries only a short failed-output excerpt");
test.assertNotIncludes(outlineClaim, "originalPrompt", "Question Sheet retry does not duplicate the entire first prompt and context");
test.assertIncludes(outlineClaim, "模型输出包含提示词契约", "Question Sheet organization fails when the model copies prompt rules");
test.assertIncludes(outlineClaim, "模型把系统输出规则写进了问题单", "Question Sheet organization fails when output rules are copied from the prompt");
test.assertIncludes(outlineClaim, "function buildGeneratedOutlineRetryMessages", "Question Sheet -> Outline retries when model output looks like workflow notes");
test.assertIncludes(outlineClaim, "正在重试生成大纲", "Question Sheet -> Outline retry is visible during live demo recovery");
test.assertIncludes(outlineClaim, "ai_system6_task_kind: \"organize-question-sheet\"", "ordinary Question Sheet organization uses the structured task kind");
test.assertIncludes(outlineClaim, 'ai_system6_task_kind: "generate-outline"', "ordinary Question Sheet -> Outline generation uses the structured task kind");
test.assertIncludes(outlineClaim, "生成的大纲没有可写作章节", "Question Sheet -> Outline generation rejects output without writable sections");
test.assertIncludes(outlineClaim, "function validateGeneratedWritingOutline", "Question Sheet -> Outline validates that generated sections can be drafted");
test.assertIncludes(outlineClaim, "生成的大纲包含工作清单章节", "Question Sheet -> Outline rejects work-list sections before Section Drafts");
test.assertIncludes(outlineClaim, "maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 900", "Question Sheet -> Outline uses a short drafting-outline token budget");
test.assertIncludes(outlineClaim, "生成大纲失败", "ordinary Question Sheet -> Outline generation surfaces model failures");
test.assertIncludes(outlinePrompt, "第一眼反差、颜色/手感、日常体验、相机限制、购买建议", "generated outlines favor video-viewer sections over launch-summary sections");
test.assertIncludes(writingFlow, "function validateSectionDraftContent", "section drafting validates that model output is spoken copy");
test.assertIncludes(writingFlow, "章节草稿像大纲/卖点清单", "section drafting rejects outline-like selling-point lists");
test.assertIncludes(sectionDraftPrompt, "核心卖点、事实支撑、观众在意点", "section drafting prompt forbids template headings that caused demo failures");
test.assertIncludes(readerDocmapCss, ".dictation-window .dictation-transcripts textarea", "Dictation Pad textareas consume available DA window space");
test.assertIncludes(readerDocmapCss, "flex: 1 1 0", "Dictation Pad avoids large unused blank space in tall windows");

test.finish();
