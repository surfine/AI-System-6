import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("prompt-file-runtime");
const generated = read("app/generated/ai-prompt-files.js");
const runtime = read("app/core/prompt-file-runtime.js");
const context = {
  window: {},
  currentLanguage: "zh",
  chatFiles: [],
  chatFolders: [],
  crypto: { randomUUID: () => `id-${context.chatFiles.length + context.chatFolders.length + 1}` },
};
context.window = context;
vm.runInNewContext(generated, context);
vm.runInNewContext(runtime, context);
const api = context.AISystem6PromptFilesRuntime;
const projectId = "project-1";

const system = api.resolvePromptFile("writing-tools.proofread", projectId);
test.assert(system.status === "ready", "system prompt resolves when no project file exists");
test.assert(system.source === "system", "system prompt is the default source");

const clioSystem = api.resolvePromptFile("cliotalk.main", projectId);
test.assert(clioSystem.status === "ready" && clioSystem.source === "system", "ClioTalk main prompt resolves from its visible system file");
api.upsertProjectPromptOverride(projectId, "cliotalk.main", "项目 ClioTalk 提示词");
test.assert(api.resolvePromptFile("cliotalk.main", projectId).body === "项目 ClioTalk 提示词", "ClioTalk main prompt accepts a project override");
const forcedBoundary = api.resolvePromptFile("system.model-boundaries", projectId);
test.assert(forcedBoundary.status === "ready" && forcedBoundary.source === "system-forced", "System boundary remains forced for every project");
test.assert(api.upsertProjectPromptOverride(projectId, "system.model-boundaries", "不能覆盖") === null, "Project cannot override the forced system boundary");
test.assert(api.setProjectPromptDisabled(projectId, "system.model-boundaries", true) === null, "Project cannot disable the forced system boundary");
const forcedBoundaryDocument = api.promptDocument("system.model-boundaries", "en");
test.assert(forcedBoundaryDocument?.readOnly === true, "a required system prompt exposes a read-only document without creating project state");
test.assert(forcedBoundaryDocument?.name === "System Model Boundaries (Required)", "the read-only document uses its English display name");
test.assertIncludes(forcedBoundaryDocument?.path || "", "System Folder/AI Prompts/System Boundaries", "the read-only document carries a localized system path");

const remainingModes = ["critique", "praise", "digest", "continue", "describe-change", "rewrite", "friendly", "professional", "concise", "summary", "key-points", "list", "table", "review-praise"];
remainingModes.forEach((mode) => {
  const resolved = api.resolvePromptFile(`writing-tools.${mode}`, projectId, "en");
  test.assert(resolved.status === "ready" && resolved.source === "system" && !!resolved.body, `${mode} resolves from its own system record`);
});

const override = api.upsertProjectPromptOverride(projectId, "项目校对提示词");
const project = api.resolvePromptFile("writing-tools.proofread", projectId);
test.assert(project.status === "ready", "project override resolves as ready");
test.assert(project.source === "project", "project override takes precedence");
test.assert(project.body === "项目校对提示词", "project override body is used verbatim");

const rewriteOverride = api.upsertProjectPromptOverride(projectId, "writing-tools.rewrite", "项目改写提示词");
const rewriteProject = api.resolvePromptFile("writing-tools.rewrite", projectId);
test.assert(rewriteProject.source === "project" && rewriteProject.body === "项目改写提示词", "another mode receives an independent project override");
remainingModes.forEach((mode) => {
  const id = `writing-tools.${mode}`;
  api.upsertProjectPromptOverride(projectId, id, `${mode} 项目提示词`);
  api.setProjectPromptDisabled(projectId, id, true);
  test.assert(api.resolvePromptFile(id, projectId).status === "disabled", `${mode} can be independently disabled without fallback`);
  api.setProjectPromptDisabled(projectId, id, false);
  test.assert(api.resolvePromptFile(id, projectId).source === "project", `${mode} restores its project override after re-enabling`);
});

const disabledFolder = api.ensureProjectPromptFolder(projectId, "已停用提示词");
override.folderId = disabledFolder.id;
const disabled = api.resolvePromptFile("writing-tools.proofread", projectId);
test.assert(disabled.status === "disabled", "moving the file to Disabled Prompts never falls back to system");

rewriteOverride.folderId = disabledFolder.id;
test.assert(api.resolvePromptFile("writing-tools.rewrite", projectId).status === "disabled", "moving any mode's override file into Disabled Prompts disables that same mode");
rewriteOverride.folderId = api.ensureProjectPromptFolder(projectId, "提示词覆盖").id;
test.assert(api.resolvePromptFile("writing-tools.rewrite", projectId).source === "project", "moving any mode back to Prompt Overrides restores it");

override.folderId = api.ensureProjectPromptFolder(projectId, "提示词覆盖").id;
const restored = api.resolvePromptFile("writing-tools.proofread", projectId);
test.assert(restored.source === "project", "moving the file back restores its project override");

const receipt = api.recordPromptRun(projectId, restored);
test.assert(receipt.receipt.hash === restored.hash, "receipt records the effective hash");
test.assertNotIncludes(receipt.body, "用户正文", "receipt does not contain user document content");
test.assertIncludes(receipt.body, "实际提示词：", "a Chinese run receives a Chinese receipt");

context.currentLanguage = "en";
const englishProjectId = "project-en";
const englishOverride = api.ensureProjectPromptOverrideForEditing(englishProjectId, "writing-tools.proofread", "en");
const englishSystem = context.AISystem6PromptFiles.find((item) => item.id === "writing-tools.proofread");
test.assert(englishOverride?.body === englishSystem?.bodies?.en, "opening an English prompt copies the English body into its project override");
test.assert(englishOverride?.name === "Proofread", "the English override uses the English display name");
test.assertIncludes(englishOverride?.path || "", "Prompt Overrides/Proofread", "the English override path is localized");
const englishResolved = api.resolvePromptFile("writing-tools.proofread", englishProjectId, "en");
const englishReceipt = api.recordPromptRun(englishProjectId, "writing-tools.proofread", englishResolved);
test.assertIncludes(englishReceipt?.body || "", "Effective prompt:", "an English run receives an English receipt body");
test.assertIncludes(englishReceipt?.name || "", "Proofread Prompt Run", "an English receipt receives an English file name");
test.assert(englishReceipt?.receipt?.language === "en", "the receipt records the language of the effective prompt");

test.finish();
