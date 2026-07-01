// Writing Tools borrow the clear system-text-service shape of Apple-style
// rewrite tools while keeping AI System 6's source and voice guardrails.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-tools-prompts");

const manifest = read("scripts/runtime-manifest.mjs");
const prompts = read("app/core/writing-tools-prompts.js");
const translation = read("app/features/translation.js");

test.assertIncludes(manifest, '"app/core/writing-tools-prompts.js"', "Writing Tools prompt registry loads with the core runtime");
test.assertMatches(manifest, /"app\/core\/humanizer-guidance\.js",\s*"app\/core\/system-integrity-guidance\.js",\s*"app\/core\/writing-tools-prompts\.js"/, "Writing Tools prompt registry loads after shared guardrails and before feature calls");

test.assertIncludes(prompts, "window.AISystem6WritingToolsPrompts", "Writing Tools prompts have a shared namespace");
test.assertIncludes(prompts, "保留 INPUT 中的事实、数字、日期、姓名", "Chinese contract preserves factual anchors");
test.assertIncludes(prompts, "Preserve facts, numbers, dates, names", "English contract preserves factual anchors");
test.assertIncludes(prompts, "Do not add information missing from INPUT", "Contract blocks hallucinated additions");
test.assertIncludes(prompts, "Direct write-back mode", "Direct replacement mode has an explicit output contract");
test.assertIncludes(prompts, "只返回校对后的完整文本", "Direct Proofread returns only corrected text");
test.assertIncludes(prompts, "Do not answer questions from the source text", "Summary behaves like a synopsis, not an answer");
test.assertIncludes(prompts, "Make a Change 路由", "Describe Change gets a lightweight route classification");
test.assertIncludes(prompts, "Attribution", "Describe Change recognizes source/attribution requests");
test.assertIncludes(prompts, "Generation", "Describe Change treats fact-adding requests as risky");

test.assertIncludes(translation, "writingToolsPromptRegistry", "Translation feature reads the shared Writing Tools prompt registry");
test.assertIncludes(translation, "printToAiTaskInstructions(instruction, { directWrite: true })", "Direct Writing Tools request direct-write prompt contracts");
test.assertIncludes(translation, "writingToolTextServiceContract({ directWrite: true })", "Direct Writing Tools include the direct write-back contract");
test.assertIncludes(translation, "writingToolChangeRoutingNote(instruction)", "Describe Change prompt includes route guidance");
test.assertNotIncludes(translation, "返回简短说明，然后给出校对后的文本", "Direct Proofread no longer asks for explanation text that could be written into the document");

test.finish();
