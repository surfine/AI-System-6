// Dictation Pad uses local models to organize spoken intent for the target
// writing surface instead of applying a generic prose polish.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("dictation");

const dictation = read("app/features/dictation.js");
const windowManager = read("app/core/window-manager.js");
const chatMessages = read("app/core/chat-messages.js");
const serverChat = read("src/server/chat.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(dictation, "function dictationCleanProfile", "Dictation Pad has target-specific cleanup profiles");
test.assertIncludes(dictation, "function buildDictationCleanMessages", "Dictation Pad builds local-model messages for cleanup");
test.assertIncludes(dictation, "Target surface:", "English cleanup prompt names the target writing surface");
test.assertIncludes(dictation, "目标位置：", "Chinese cleanup prompt names the target writing surface");
test.assertIncludes(dictation, "questionSheet", "cleanup understands Question Sheet as an upstream-intent target");
test.assertIncludes(dictation, "真实问题、收件人、反对意见", "Chinese Question Sheet cleanup preserves spoken intent fields");
test.assertIncludes(dictation, "real questions, recipient, objections", "English Question Sheet cleanup preserves spoken intent fields");
test.assertIncludes(dictation, "不要加 # Question Sheet、粗体标签、表格或空栏目", "Question Sheet cleanup avoids template-report formatting");
test.assertIncludes(dictation, "not required headings", "English Question Sheet cleanup treats profile labels as optional clues");
test.assertIncludes(dictation, "teachtext", "cleanup understands TeachText as a manuscript insertion target");
test.assertIncludes(dictation, "scrapbook", "cleanup understands Scrapbook as a source-note target");
test.assertIncludes(dictation, "notepad", "cleanup understands Note Pad as a rough private note target");
test.assertIncludes(dictation, "do not ghostwrite", "cleanup refuses to turn dictation into model-written prose");
test.assertIncludes(dictation, "不要新增事实、来源、例子、动机或结论", "cleanup does not invent source facts or conclusions");
test.assertIncludes(dictation, "withMarkdownModelMessages(buildDictationCleanMessages", "cleanup still receives shared Markdown/model guardrails");
test.assertIncludes(dictation, "ai_system6_task_kind: \"dictation-clean\"", "cleanup identifies itself to local model tuning");
test.assertIncludes(dictation, "temperature: 0.25", "cleanup uses a restrained local-model temperature");
test.assertIncludes(dictation, "max_tokens: 900", "cleanup is bounded for small local models");
test.assertIncludes(windowManager, "function raiseVisibleDeskAccessorySidecars", "Dictation Pad shares the floating sidecar layer manager");
test.assertMatches(
  windowManager,
  /function focusWindow[\s\S]*setWindowLayerZ\(win, nextWindowLayerZ\(\)\);[\s\S]*raiseVisibleDeskAccessorySidecars\(\);/,
  "Dictation Pad stays above ordinary windows after focus changes",
);

test.assertIncludes(serverChat, "/dictation|speech|transcript/.test(kind)", "server local-model tuning has a dictation task profile");
test.assertIncludes(serverChat, "defaultMaxTokens: 900", "server dictation profile keeps output bounded");
test.assertIncludes(chatMessages, "/dictation|speech|transcript/.test(kind)) return 0.25", "client Qwen defaults lower temperature for dictation");
test.assertIncludes(chatMessages, "/dictation|speech|transcript/.test(kind)) return 900", "client local defaults cap dictation cleanup output");

test.assertIncludes(en, "Organized Dictation", "English UI describes cleanup as organization, not generic AI polish");
test.assertIncludes(zh, "整理后听写", "Chinese UI describes cleanup as dictation organization");

test.finish();
