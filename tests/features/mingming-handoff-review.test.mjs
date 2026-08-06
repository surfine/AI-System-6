// How Luoluo Would Receive It has two layers:
// the default external card is short and copy-safe, while the backstage review
// keeps Aaron/creator-facing guardrails out of the recipient handoff.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("mingming-handoff-review");

const html = read("index.html");
const actions = read("app/core/actions.js");
const config = read("app/core/config.js");
const windowManager = read("app/core/window-manager.js");
const persistenceStatus = read("app/core/persistence-status.js");
const manifest = read("scripts/runtime-manifest.mjs");
const handoff = read("app/features/mingming-handoff-review.js");
const mingmingLens = read("app/features/mingming-lens.js");
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");

const reviewDeskActionsIndex = html.indexOf("review-desk-actions");
const focusButtonIndex = html.indexOf('data-i18n="teachtext_focus_off"', reviewDeskActionsIndex);
const commandMenuIndex = html.indexOf('<details class="teachtext-command-menu', focusButtonIndex);
const commandMenuEndIndex = html.indexOf("</details>", commandMenuIndex);
const mainButtonArea = focusButtonIndex >= 0 && commandMenuIndex >= 0 ? html.slice(focusButtonIndex, commandMenuIndex) : "";
const commandPopover = commandMenuIndex >= 0 && commandMenuEndIndex >= 0 ? html.slice(commandMenuIndex, commandMenuEndIndex) : "";

test.assertNotIncludes(mainButtonArea, 'data-action="review-mingming-handoff"', "Review Desk button row matches other TeachText windows: no extra primary handoff button");
test.assertIncludes(commandPopover, 'data-action="review-mingming-handoff"', "Short-card handoff lives in the review command menu");
test.assertIncludes(commandPopover, 'data-i18n="review_mingming_handoff"', "Handoff command is localized");
test.assertIncludes(html.slice(reviewDeskActionsIndex), 'data-i18n="review_commands"', "Review Desk command menu uses its own name, not the generic Commands menu");
test.assertIncludes(commandPopover, 'data-action="review-mingming-handoff-backstage"', "Command menu exposes the backstage handoff review");
test.assertIncludes(commandPopover, 'data-i18n="review_mingming_handoff_backstage"', "Backstage handoff command is localized");
test.assertIncludes(zh, 'review_mingming_handoff: "若是落落会怎么接"', "Chinese copy names the short-card handoff");
test.assertIncludes(zh, 'review_mingming_handoff_backstage: "交付后台审校"', "Chinese copy names the backstage review");
test.assertIncludes(en, 'review_mingming_handoff: "How Luoluo Would Receive It"', "English copy names the short-card handoff");
test.assertIncludes(en, 'review_mingming_handoff_backstage: "Backstage Handoff Review"', "English copy names the backstage review");

test.assertIncludes(actions, "function runReviewDeskMingmingHandoffReview()", "Review Desk has a dedicated short-card runner");
test.assertIncludes(actions, "function runReviewDeskMingmingHandoffBackstageReview()", "Review Desk has a dedicated backstage runner");
test.assertIncludes(actions, '"review-mingming-handoff": runReviewDeskMingmingHandoffReview', "Action routes to the short-card runner");
test.assertIncludes(actions, '"review-mingming-handoff-backstage": runReviewDeskMingmingHandoffBackstageReview', "Action routes to the backstage runner");
test.assertIncludes(actions, 'runMingmingHandoffReview({ mode: "card", sectionOnly: true })', "Primary runner requests card mode");
test.assertIncludes(actions, 'runMingmingHandoffReview({ mode: "backstage", sectionOnly: true })', "Backstage runner requests backstage mode");
test.assertIncludes(windowManager, '"review-mingming-handoff": reviewDeskReady && teachTextCanReview && hasStyleSections', "Menu state enables the short-card command only for reviewable text");
test.assertIncludes(windowManager, '"review-mingming-handoff-backstage": reviewDeskReady && teachTextCanReview && hasStyleSections', "Menu state enables the backstage command only for reviewable text");
test.assertIncludes(config, '[data-action="review-mingming-handoff"]', "Long task controls disable the short-card command while running");
test.assertIncludes(config, '[data-action="review-mingming-handoff-backstage"]', "Long task controls disable the backstage command while running");
test.assertIncludes(config, 'createLazyModuleLoader("", ["app/features/mingming-handoff-review.js"])', "Config exposes one lazy loader for the handoff module");
test.assertIncludes(config, '"app/features/mingming-handoff-review.js"', "Lazy loader loads the handoff feature file");
test.assertIncludes(persistenceStatus, '"mingming-handoff-review": { label: t("review_desk"), windowName: "reviewDesk" }', "Short-card task receipt returns to Review Desk");
test.assertIncludes(persistenceStatus, '"mingming-handoff-backstage-review": { label: t("review_desk"), windowName: "reviewDesk" }', "Backstage task receipt returns to Review Desk");

test.assertIncludes(manifest, '"app/features/mingming-handoff-review.js"', "Runtime manifest includes the lazy handoff module");
test.assertMatches(manifest, /lazyRuntimePaths[\s\S]*"app\/features\/mingming-handoff-review\.js"/, "Handoff module is lazy, not a core startup module");
test.assertNotIncludes(manifest.match(/appModulePaths[\s\S]*?];/)?.[0] || "", "app/features/mingming-handoff-review.js", "Handoff module is not bundled into appModulePaths");

test.assertIncludes(handoff, "function buildMingmingHandoffReviewPrompt", "Prompt builder exists");
test.assertIncludes(handoff, "function runMingmingHandoffReview", "Runtime function exists");
test.assertIncludes(handoff, "function extractMingmingHandoffCard", "Short-card extraction protects against overlong model output");
test.assertIncludes(handoff, "function copyMingmingHandoffCardToClipboard", "Short-card mode has a copy-only-card path");
test.assertIncludes(handoff, "const card = extractMingmingHandoffCard(markdown)", "Clipboard copy must extract the short card first");
test.assertIncludes(handoff, 'if (!card || typeof setClipboard !== "function") return false', "Clipboard copy refuses overlong non-card fallback output");
test.assertIncludes(handoff, "用户可能是 Aaron，也可能是落落本人", "Prompt preserves the dual-user constraint");
test.assertIncludes(handoff, "不要假设使用者身份", "Prompt avoids identity assumptions");
test.assertIncludes(handoff, "不要输出私人合作判断、表白、道德审判", "Prompt bans private relationship and moral judgment framing");
test.assertIncludes(handoff, "第三方裁判", "Prompt bans third-party referee framing");
test.assertIncludes(handoff, "只把喜欢、在乎或认真转译成", "Prompt translates care into usable support");
test.assertIncludes(handoff, "先给足情绪价值，再给事实护栏", "Prompt prioritizes emotional value before facts");

test.assertIncludes(handoff, "输出模式：外发短卡（默认）", "Default mode is an external short card");
test.assertIncludes(handoff, "必须只按以下三个 Markdown 标题输出", "Short-card prompt locks the output to three sections");
test.assertIncludes(handoff, "## 给落落看的 30 秒版", "Short card includes the 30-second recipient version");
test.assertIncludes(handoff, "## 一句话交稿", "Short card includes one low-pressure handoff line");
test.assertIncludes(handoff, "## 必须守住", "Short card includes only must-preserve guardrails");
test.assertIncludes(handoff, "短卡模式禁止输出长报告、大表格、完整 HKRR 分析、forensic fact-check 表格", "Short-card prompt forbids long reports and forensic fact-checking");
test.assertIncludes(handoff, "不要出现“AI 认为”“HKRR 显示”“我替你审了”“系统判断”", "Short-card prompt avoids tool-ish language");
test.assertIncludes(handoff, "“事实护栏”“后台审校”“可删地图”", "Short-card prompt avoids backstage terminology");
test.assertIncludes(handoff, "copyMingmingHandoffCardToClipboard(visibleContent)", "Short-card path copies only the visible card");

test.assertIncludes(handoff, "输出模式：交付后台审校", "Backstage mode is separate from the external card");
test.assertIncludes(handoff, "## 核心不能删", "Backstage review identifies what must not be deleted");
test.assertIncludes(handoff, "## 容易被顺手删的点", "Backstage review identifies casual deletion risks");
test.assertIncludes(handoff, "## HKRR 后台判断", "Backstage review includes HKRR judgment");
test.assertIncludes(handoff, "## 事实护栏", "Backstage review includes factual guardrails");
test.assertIncludes(handoff, "## 可退让区域", "Backstage review includes negotiable areas");
test.assertIncludes(handoff, "## 下一步怎么交", "Backstage review includes next handoff moves");
test.assertIncludes(handoff, 'const visibleContent = isBackstage ? content : (extractMingmingHandoffCard(content) || content)', "Backstage output is not reduced to the external card");
test.assertIncludes(handoff, "if (isBackstage) {", "Backstage completion path stays separate from copy behavior");
test.assertIncludes(handoff, 'ai_system6_task_kind: isBackstage ? "mingming_handoff_backstage_review" : "mingming_handoff_card"', "Model request identifies both task kinds");

test.assertIncludes(handoff, "不要输出 forensic fact-check 表格", "Prompt does not replace forensic fact-checking");
test.assertIncludes(handoff, "现有事实核查命令", "Prompt points evidence-heavy verification to the existing Fact Check command");
test.assertIncludes(handoff, "待核", "Prompt requires unsupported facts to be marked as pending verification");
test.assertIncludes(handoff, "所有事实护栏条目都必须逐条标“待核：”", "Prompt requires every unsupported factual guardrail to be marked");
test.assertIncludes(handoff, "无来源时每一条都必须写成“- 待核：……”", "Short-card guardrails individually mark unsupported facts");
test.assertIncludes(handoff, "必须使用 Markdown bullet", "Short-card guardrails must stay copy-safe as Markdown bullets");
test.assertIncludes(handoff, "不能以冒号、破折号或“如下”结尾", "One-line handoff must be a complete sentence");
test.assertIncludes(handoff, "QUESTION SHEET", "Handoff review uses Question Sheet context");
test.assertIncludes(handoff, "buildBudgetedProjectContext", "Handoff review retrieves limited project context");

test.assertIncludes(mingmingLens, "不要输出关系建议、交接压力或私人合作判断", "Existing Mingming review stays relationship-neutral");
test.assertNotIncludes(mingmingLens, "若是落落会怎么接", "Existing Mingming lens is not polluted by handoff review behavior");
test.assertNotIncludes(mingmingLens, "先给足情绪价值，再给事实护栏", "Existing Mingming lens does not absorb the new handoff ordering");

test.finish();
