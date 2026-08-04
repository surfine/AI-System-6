// Writing Tools borrow the clear system-text-service shape of Apple-style
// rewrite tools while keeping AI System 6's source and voice guardrails.

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-tools-prompts");

const manifest = read("scripts/runtime-manifest.mjs");
const prompts = read("app/core/writing-tools-prompts.js");
const translation = read("app/features/translation.js");
const runtime = read("app/core/prompt-file-runtime.js");
const source = read("app/content/ai-prompts/writing-tools/proofread.md");
const generator = read("scripts/build-ai-prompt-files.mjs");
const projectDisk = read("app/features/project-disk.js");
const exportImport = read("app/features/export-import.js");
const app = read("app.js");
const remainingModes = ["critique", "praise", "digest", "continue", "describe-change", "rewrite", "friendly", "professional", "concise", "summary", "key-points", "list", "table", "review-praise"];

test.assertIncludes(manifest, '"app/core/writing-tools-prompts.js"', "Writing Tools prompt registry loads with the core runtime");
test.assertIncludes(manifest, '"app/generated/ai-prompt-files.js"', "Generated prompt records load before their runtime resolver");
test.assertIncludes(manifest, '"app/core/prompt-file-runtime.js"', "Prompt file resolver loads with the core runtime");
test.assertMatches(manifest, /"app\/core\/humanizer-guidance\.js",\s*"app\/core\/system-integrity-guidance\.js",\s*"app\/core\/writing-tools-prompts\.js",\s*"app\/core\/author-thesis-guidance\.js"/, "Writing Tools prompt registry loads after shared guardrails and before feature calls");

test.assertIncludes(prompts, "window.AISystem6WritingToolsPrompts", "Writing Tools prompts have a shared namespace");
test.assertIncludes(prompts, "保留 INPUT 中的事实、数字、日期、姓名", "Chinese contract preserves factual anchors");
test.assertIncludes(prompts, "Preserve facts, numbers, dates, names", "English contract preserves factual anchors");
test.assertIncludes(prompts, "Do not add information missing from INPUT", "Contract blocks hallucinated additions");
test.assertIncludes(prompts, "Direct write-back mode", "Direct replacement mode has an explicit output contract");
test.assertNotIncludes(prompts, "只返回校对后的完整文本", "Proofread text no longer has a code-owned duplicate");
test.assertNotIncludes(prompts, "Do not answer questions from the source text", "Summary instruction no longer has a code-owned duplicate");
test.assertIncludes(prompts, "Make a Change 路由", "Describe Change gets a lightweight route classification");
test.assertIncludes(prompts, "Attribution", "Describe Change recognizes source/attribution requests");
test.assertIncludes(prompts, "Generation", "Describe Change treats fact-adding requests as risky");

test.assertIncludes(translation, "writingToolsPromptRegistry", "Translation feature reads the shared Writing Tools prompt registry");
test.assertIncludes(translation, "resolveWritingToolPrompt(mode)", "Every Writing Tools mode obtains its prompt through the file resolver");
test.assertIncludes(translation, "recordPromptRun(activeProjectId, writingToolPromptId(mode), resolvedPrompt)", "Every Writing Tools run creates a lightweight receipt");
test.assertIncludes(translation, "writingToolPromptUnavailable", "Disabled or missing prompts stop before a model request");
test.assertIncludes(translation, "writingToolTaskBody(mode, instruction, resolvedPrompt)", "Direct and ClioTalk paths use the same resolved task body");
test.assertIncludes(translation, "writingToolTaskBody(\"reviewPraise\", \"\", resolvedPrompt)", "Review Desk encouragement uses its file-backed prompt");
test.assertIncludes(translation, "writingToolTextServiceContract({ directWrite: true })", "Direct Writing Tools include the direct write-back contract");
test.assertIncludes(translation, "writingToolChangeRoutingNote(instruction)", "Describe Change prompt includes route guidance");
test.assertNotIncludes(translation, "返回简短说明，然后给出校对后的文本", "Direct Proofread no longer asks for explanation text that could be written into the document");
test.assertIncludes(source, "只返回校对后的完整文本", "The system proofread file retains the production instruction");
test.assertIncludes(generator, "createHash(\"sha256\")", "Generated records receive stable content hashes");
test.assertIncludes(runtime, "项目停用 > 项目覆盖", "Resolver documents the required precedence through its ordered checks");
test.assertMatches(runtime, /disabledKind[\s\S]*overrideKind[\s\S]*systemPrompt/, "Resolver checks disabled, override, then system prompt");
test.assertIncludes(runtime, "recordPromptRun", "Runtime records the effective prompt path and hash");
test.assertIncludes(runtime, "ensureProjectPromptOverrideForEditing", "Opening a system file creates an editable project override only on demand");
test.assertIncludes(runtime, "file.artifactKind === artifactKind && file.promptId === id", "Prompt files use stable IDs instead of display names");
test.assertIncludes(runtime, "file.folderId !== disabledFolder?.id", "A moved override cannot remain active while it is in Disabled Prompts");
test.assertIncludes(runtime, "实际提示词", "Run receipts include the effective prompt path without document content");
test.assertIncludes(runtime, 'ensureProjectPromptFolder(projectId, "提示词覆盖")', "Prompt Overrides are production Project Hard Disk records");
test.assertIncludes(runtime, 'ensureProjectPromptFolder(projectId, "已停用提示词")', "Disabled Prompts are production Project Hard Disk records");
test.assertIncludes(runtime, 'ensureProjectPromptFolder(projectId, "运行记录")', "Run Receipts are production Project Hard Disk records");
test.assertIncludes(projectDisk, "return [...folders, ...files, ...references];", "Project Finder lists the production records without a parallel prompt exhibition");
test.assertNotIncludes(projectDisk, "getProjectSystemFinderItems", "Project Finder does not maintain a second display-only prompt tree");
test.assertIncludes(exportImport, "files: chatFiles.filter((file) => file.projectId === projectId)", "Prompt files and receipts are included in project export");
test.assertIncludes(exportImport, "chatFiles.unshift(...imported.files)", "Prompt files and receipts survive project import");
test.assertMatches(app, /\(window\.AISystem6PromptFiles \|\| \[\]\)\s*\.filter\(\(prompt\) => prompt\.category === definition\.promptCategory\)/, "Finder lists the generated prompt records instead of a display-only copy");
test.assertIncludes(app, "open-system-prompt-file:${prompt.id}", "Each Finder prompt item carries its stable prompt ID into the open action");
remainingModes.forEach((mode) => {
  test.assert(exists(`app/content/ai-prompts/writing-tools/${mode}.md`), `${mode} has its own system prompt Markdown file`);
  test.assertNotIncludes(prompts, `writing-tools.${mode}`, `${mode} has no mode prompt copy in the registry`);
});

test.finish();
