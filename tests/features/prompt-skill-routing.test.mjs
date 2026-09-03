// Executable contract for skill routing over the prompt-file system.
//
// The three questions this file answers with real code, not with a source read:
//   1. Progressive disclosure. What enters the context at each step, measured
//      in characters against the full corpus.
//   2. Scope. Six surfaces route; every other caller of resolvePromptFile()
//      keeps the answer it has today.
//   3. Circulation. A project override and a disabled skill are ordinary
//      project files, so the assembled Project Hard Disk backup carries them
//      and an import remaps them.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createBackupVm, seedComplexProject } from "../helpers/backup-vm.mjs";

const test = createFeatureTest("prompt-skill-routing");
const generated = read("app/generated/ai-prompt-files.js");
const runtimeSource = read("app/core/prompt-file-runtime.js");

function createRuntime(language = "zh") {
  const context = {
    window: {},
    currentLanguage: language,
    chatFiles: [],
    chatFolders: [],
    crypto: { randomUUID: () => `id-${context.chatFiles.length + context.chatFolders.length + 1}` },
  };
  context.window = context;
  vm.runInNewContext(generated, context);
  vm.runInNewContext(runtimeSource, context);
  return context;
}

const context = createRuntime();
const api = context.AISystem6PromptFilesRuntime;
const corpus = context.AISystem6PromptFiles;
const projectId = "project-skills";

// ---------------------------------------------------------------- the corpus
const skills = corpus.filter((record) => record.descriptions && !record.partOf);
const parts = corpus.filter((record) => record.partOf);
test.assert(skills.length === 3, `the corpus ships ${skills.length} routable skills`);
test.assert(parts.length === 3, `the corpus ships ${parts.length} reference parts`);
test.assert(
  parts.every((part) => skills.some((skill) => skill.id === part.partOf)),
  "every reference part names a skill that exists"
);
test.assert(
  skills.every((skill) => skill.descriptions.zh && skill.descriptions.en),
  "every skill carries a description in both languages"
);
test.assert(
  skills.every((skill) => !/[㐀-鿿]/u.test(skill.descriptions.en)),
  "an English description holds no Chinese, so a language-matched surface stays matched"
);
test.assert(
  skills.every((skill) => /[㐀-鿿]/u.test(skill.descriptions.zh)),
  "a Chinese description is written in Chinese, not translated at read time"
);

// ------------------------------------------------- 1. progressive disclosure
const routed = api.routeSkillsForTask("teachText", projectId, "en");
test.assert(routed.choices.length === 3, "the manuscript surface offers all three skills");
test.assert(
  routed.choices.every((choice) => !("body" in choice)),
  "a choice carries no body, so an unchosen skill costs its description alone"
);

const corpusChars = corpus.reduce((total, record) => total + String(record.bodies.en).length, 0);
const step1 = routed.contextChars;
const chosen = routed.openSkill("writing-route.skill-carrier-choice");
test.assert(chosen !== null && chosen.status === "ready", "the chosen skill opens its body");
const step2 = step1 + chosen.body.length;
test.assert(chosen.parts.length === 1, "the chosen skill names one reference part");
test.assert(
  !chosen.body.includes(corpus.find((record) => record.id === chosen.parts[0].id).bodies.en),
  "the part text is not already inside the skill body"
);
const part = routed.openPart("writing-route.skill-carrier-choice", chosen.parts[0].id);
test.assert(part !== null && part.status === "ready", "the reference part opens on demand");
const step3 = step2 + part.body.length;

test.assert(step1 < step2 && step2 < step3, "each step adds text, and no step is skipped");
test.assert(step1 * 4 < corpusChars, `step 1 puts ${step1} chars in front of the model against ${corpusChars} chars of prompt corpus`);
test.assert(step3 < corpusChars, `step 3 still reads ${step3} chars, under the ${corpusChars}-char corpus`);
test.ok(`progressive disclosure: ${step1} chars to choose, ${step2} chars after the choice, ${step3} chars with the part`);

test.assert(
  routed.openSkill(chosen.parts[0].id) === null,
  "a reference part is not itself a choice"
);
test.assert(
  routed.openPart("writing-route.skill-table-shaping", chosen.parts[0].id) === null,
  "a part belongs to one skill and cannot be opened through another"
);
test.assert(
  context.chatFiles.length === 0 && context.chatFolders.length === 0,
  "routing creates no project state: reading the descriptions writes nothing"
);

// --------------------------------------------------------------- 2. the scope
["questionSheet", "outline", "sectionDrafts", "teachText", "reviewDesk", "cliotalk"].forEach((stop) => {
  const scoped = api.routeSkillsForTask(stop, projectId, "en");
  test.assert(scoped.surface === stop && scoped.choices.length === 3, `${stop} routes skills`);
});
["", "finder", "scrapbook", "reader", "docmap", "coverGlass", "themeLab", "questionsheet"].forEach((stop) => {
  const scoped = api.routeSkillsForTask(stop, projectId, "en");
  test.assert(scoped.surface === "" && scoped.choices.length === 0, `${stop} offers no skill`);
});

// Every other prompt keeps exactly the answer it has today: routing added no
// second resolution path, so the ~60 call sites outside the route are untouched.
const baseline = createRuntime().AISystem6PromptFilesRuntime;
corpus.forEach((record) => {
  ["zh", "en"].forEach((language) => {
    const before = baseline.resolvePromptFile(record.id, null, language);
    const after = api.resolvePromptFile(record.id, null, language);
    test.assert(
      before.status === after.status && before.source === after.source && before.body === after.body && before.hash === after.hash,
      `${record.id} (${language}) resolves the same as it did before routing existed`
    );
  });
});
const untouched = corpus.filter((record) => !record.descriptions && !record.partOf);
test.assert(untouched.length === 62, `${untouched.length} prompts carry no skill metadata and stay ordinary prompt files`);

// ------------------------------------------- precedence, reused not rebuilt
api.upsertProjectPromptOverride(projectId, "writing-route.skill-table-shaping", "This project hands over CSV, never a sheet.");
const overridden = api.routeSkillsForTask("outline", projectId, "en");
const overriddenChoice = overridden.choices.find((choice) => choice.id === "writing-route.skill-table-shaping");
test.assert(overriddenChoice?.source === "project", "a project override is offered as the project's own skill");
test.assert(
  overridden.openSkill("writing-route.skill-table-shaping").body === "This project hands over CSV, never a sheet.",
  "the overridden body is used verbatim, through resolvePromptFile and nothing else"
);
test.assert(
  overridden.choices.find((choice) => choice.id === "writing-route.skill-carrier-choice")?.source === "system",
  "one override does not move the other skills off the system record"
);

api.setProjectPromptDisabled(projectId, "writing-route.skill-carrier-choice", true);
const afterDisable = api.routeSkillsForTask("outline", projectId, "en");
test.assert(
  !afterDisable.choices.some((choice) => choice.id === "writing-route.skill-carrier-choice"),
  "a disabled skill is not offered, so the model never sees its description"
);
test.assert(
  afterDisable.openSkill("writing-route.skill-carrier-choice") === null,
  "a disabled skill cannot be opened by naming it"
);
test.assert(afterDisable.choices.length === 2, "the other skills stay available");
api.setProjectPromptDisabled(projectId, "writing-route.skill-carrier-choice", false);

// ------------------------------------------------------------- the receipt
const receiptRuntime = createRuntime();
const receiptApi = receiptRuntime.AISystem6PromptFilesRuntime;
const receiptRoute = receiptApi.routeSkillsForTask("reviewDesk", projectId, "en");
const ranSkill = receiptRoute.openSkill("writing-route.skill-manuscript-shaping");
const receipt = receiptApi.recordPromptRun(projectId, "writing-route.skill-manuscript-shaping", ranSkill);
test.assert(receipt !== null, "a routed skill flows through the existing run receipt");
test.assert(receipt.receipt.hash === ranSkill.hash, "the receipt records the hash of the text that really ran");
test.assert(receipt.receipt.source === "system", "the receipt names the source the resolver chose");
test.assertIncludes(receipt.receipt.path, "System Folder/AI Prompts/Writing Route", "the receipt points at the visible prompt file");
test.assertIncludes(receipt.body, "Shape the Manuscript", "the receipt names the skill that ran");
test.assertNotIncludes(receipt.body, ranSkill.body, "the receipt records the run, not a second copy of the prompt");

// ------------------------------------------------------ 3. the three layers
// Layer one is the system record, proved above. Layers two and three: a project
// override and a disabled marker are ordinary project files, so the assembled
// backup carries them and the import remap keeps them attached.
const seed = seedComplexProject();
const now = "2026-08-09T12:00:00.000Z";
seed.folders.push({ id: "folder-prompts", projectId: "p1", name: "提示词覆盖", promptFolderKind: "prompt-overrides", parentId: null, createdAt: now, updatedAt: now });
seed.folders.push({ id: "folder-disabled", projectId: "p1", name: "已停用提示词", promptFolderKind: "disabled-prompts", parentId: null, createdAt: now, updatedAt: now });
seed.files.push({
  id: "file-skill-override", projectId: "p1", folderId: "folder-prompts", type: "text",
  artifactKind: "ai-prompt-override", promptId: "writing-route.skill-table-shaping",
  name: "表格成形", path: "ClioTalk/提示词覆盖/表格成形", body: "本项目交 CSV，不交表格文件。", hash: "fnv1a-00000001", updatedAt: now,
});
seed.files.push({
  id: "file-skill-disabled", projectId: "p1", folderId: "folder-disabled", type: "text",
  artifactKind: "ai-prompt-disabled", promptId: "writing-route.skill-carrier-choice",
  name: "载体选择", path: "ClioTalk/已停用提示词/载体选择", body: "", hash: "disabled", updatedAt: now,
});

const backupVm = createBackupVm(seed);
const assembled = await backupVm.assembler.assembleProjectBackup({
  projectId: "p1",
  source: {
    getProject: async () => seed.projects[0],
    getFolders: async () => seed.folders,
    getFiles: async () => seed.files,
    getScraps: async () => seed.scraps,
    getTrash: async () => seed.trash,
    getProjectCdItems: async () => seed.keyval.settings.projectCdItems,
    getReferences: async () => seed.references,
    getDocumentRevisions: async () => seed.keyval["documentRevisions:p1:file-1"],
    getDarkroomRecords: async () => [],
    getImageAttachments: async () => seed.imageAttachments || [],
  },
});
test.assert(assembled?.ready === true, "the project backup assembles and verifies with skill state inside it");
const carriedOverride = assembled.bundle.files.find((file) => file.artifactKind === "ai-prompt-override");
const carriedDisabled = assembled.bundle.files.find((file) => file.artifactKind === "ai-prompt-disabled");
test.assert(carriedOverride?.promptId === "writing-route.skill-table-shaping", "the floppy carries this project's skill override");
test.assert(carriedDisabled?.promptId === "writing-route.skill-carrier-choice", "the floppy carries the disabled state of a skill");
test.assert(assembled.bundle.counts.files === assembled.bundle.files.length, "the declared file count includes the skill files");

let sequence = 0;
const remapped = backupVm.backup.remapBackup(assembled.bundle, { uuid: () => `new-${(sequence += 1)}`, now: "2026-08-10T00:00:00.000Z" });
const remappedFolderIds = new Set(remapped.folders.map((folder) => folder.id));
const remappedOverride = remapped.files.find((file) => file.artifactKind === "ai-prompt-override");
const remappedDisabled = remapped.files.find((file) => file.artifactKind === "ai-prompt-disabled");
test.assert(remappedOverride.promptId === "writing-route.skill-table-shaping", "the prompt id is a stable name and is never remapped");
test.assert(remappedOverride.body === "本项目交 CSV，不交表格文件。", "the restored override keeps its exact text");
test.assert(remappedFolderIds.has(remappedOverride.folderId), "the restored override still sits in a real Prompt Overrides folder");
test.assert(remappedFolderIds.has(remappedDisabled.folderId), "the restored disabled marker still sits in a real Disabled Prompts folder");
test.assert(remappedOverride.projectId === remapped.project.id, "restored skill state belongs to the restored project");

// The restored files resolve through the same precedence on the other side.
const restored = createRuntime();
const restoredApi = restored.AISystem6PromptFilesRuntime;
restored.chatFolders.push(...remapped.folders);
restored.chatFiles.push(...remapped.files);
const restoredRoute = restoredApi.routeSkillsForTask("sectionDrafts", remapped.project.id, "zh");
test.assert(
  restoredRoute.choices.find((choice) => choice.id === "writing-route.skill-table-shaping")?.source === "project",
  "after restore the override is live again without any extra migration"
);
test.assert(
  !restoredRoute.choices.some((choice) => choice.id === "writing-route.skill-carrier-choice"),
  "after restore the disabled skill is still disabled"
);

// -------------------------------------------------- what the skills refuse
const rules = skills.map((skill) => `${skill.bodies.en}\n${skill.bodies.zh}`).join("\n");
test.assertIncludes(rules, "Do not rewrite the writer's sentences", "the carrier skill refuses to touch the writer's sentences");
test.assertIncludes(rules, "不要改写写作者的句子", "the Chinese text carries the same refusal");
test.assert(
  skills.every((skill) => /Do not say|Do not invent|do not guess it/i.test(skill.bodies.en)),
  "every skill refuses to claim work that no state confirms"
);
test.assert(
  skills.every((skill) => !/[㐀-鿿]/u.test(skill.bodies.en)),
  "no Chinese example sits inside an English skill body"
);

test.finish();
