import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("endfield-source-cards");
const vmw = createAppBootVm();
const ctx = vmw.context;
ctx.NodeFilter = ctx.NodeFilter || { SHOW_TEXT: 4 };
if (!ctx.document.createTreeWalker) {
  ctx.document.createTreeWalker = (root) => {
    const nodes = [];
    const collect = (node) => {
      if (node.nodeType === 3) nodes.push(node);
      (node.childNodes || []).forEach(collect);
    };
    collect(root);
    let i = 0;
    return { nextNode: () => nodes[i++] || null };
  };
}
await ctx.window.AISystem6Runtime.getLazyCommand("open-endfield-terminal").ensure();

const fixture = {
  query: "管理员什么时候认识的提弗洛斯？",
  answer: "结论 档案写的是旅途中「偶遇」【1】；报到语音说「按当时约定」【2】。\n留白 第一次见面是否雪松林，对话未收录【3】。",
  results: [
    { missionId: "op-tifloss", missionUrl: "https://endfield.example/op/tifloss", lineIndex: 2, missionTitle: "提弗洛斯", section: "干员档案", process: "人事简述", speaker: "人事简述", text: "在追寻萨米失落传说的旅途中与管理员偶遇", kind: "档案", version: "v1.5", versionBasis: "dataset", missionIndex: null, chapterKey: null },
    { missionTitle: "提弗洛斯", section: "干员语音", process: "干员报到", speaker: "提弗洛斯", text: "管理员，我按当时约定的来找你。", kind: "语音", version: "v1.5", versionBasis: "dataset", missionIndex: null, chapterKey: null },
    { missionTitle: "迷雾藏起松林", section: "任务", process: "", speaker: "秦茳尺", text: "管理员，安德烈那家伙到武陵了吗？", kind: "通讯", version: "v1.5", versionBasis: "mission", missionIndex: 260, chapterKey: "v1_5" },
    { missionTitle: "共饮一江水", section: "Main Missions", chapter: "Chapter II", process: "Process III", speaker: "汤汤", text: "妈妈说，无事献殷勤，非奸即盗。", kind: "对话", version: "v1.4", versionBasis: "mission", missionIndex: 60, chapterKey: "chapter2" },
  ],
};

ctx.renderEndfieldWelcome();
const welcomeButtons = ctx.document.querySelectorAll(".endfield-question-list .btn");
test.assert(welcomeButtons.length === 5, `welcome has five question buttons (got ${welcomeButtons.length})`);
test.assert(Array.from(welcomeButtons).every((b) => b.getAttribute("data-query")), "every welcome button carries data-query");

ctx.renderEndfieldRoute();
const progress = ctx.document.getElementById("endfield-progress");
test.assert(!!progress, "progress select renders");
if (progress) {
  const values = (progress.dataset.progressOrder || "").split(",");
  test.assert(JSON.stringify(values) === JSON.stringify(["prologue", "chapter1", "chapter2", "v1_5", "all"]), "progress options in order");
  test.assert((progress.value || progress.getAttribute?.("value") || "all") === "all", "default progress is all");
}

ctx.renderEndfieldResults(fixture);
const sources = ctx.document.querySelectorAll(".endfield-source");
test.assert(sources.length === 5, `answer renders 5 source cards (got ${sources.length})`);
const missing = ctx.document.querySelectorAll(".endfield-source.is-missing");
test.assert(missing.length === 1 && missing[0]?.getAttribute("data-kind") === "对话", "one missing dialogue card for comms source");
test.assert(Boolean(ctx.document.querySelector(".endfield-source .endfield-source-kind")?.textContent), "first card kind label is non-empty");
test.assert(ctx.document.querySelector(".endfield-source .endfield-stamp")?.textContent === "v1.5", "first card version stamp v1.5");
test.assert(!ctx.document.querySelector(".endfield-source-quote .endfield-context"), "cards do not render context lines");
const verdicts = ctx.document.querySelectorAll(".endfield-verdict");
test.assert(verdicts.length === 2 && Boolean(verdicts[0]?.querySelector("b")?.textContent) && Boolean(verdicts[1]?.querySelector("b")?.textContent) && verdicts[0].querySelector("b")?.textContent !== verdicts[1].querySelector("b")?.textContent, "verdict blocks are two distinct labels");
test.assert(ctx.document.querySelectorAll(".endfield-inline-citation").length === 3, "three inline citations");

const groups = Array.from(ctx.document.querySelectorAll(".endfield-source-group")).map((g) => `${g.querySelector("span")?.textContent} ${g.querySelector("small")?.textContent}`);
test.assert(groups.length === 5 && groups.every((g) => g.endsWith(" 1")), `group counts include five rows of one (got ${JSON.stringify(groups)})`);

// progress fold
if (progress) {
  progress.value = "chapter1";
  progress.dispatchEvent(new ctx.Event("change"));
}
ctx.renderEndfieldResults(fixture);
test.assert(ctx.document.querySelectorAll(".endfield-source").length === 2, "progress chapter1 leaves two visible cards");
test.assert(Boolean(ctx.document.querySelector(".endfield-fold")), "fold row renders when progress folds rows");

// Provenance: the archive's own URL, speaker and line number reach the card,
// and a line without a real URL says so instead of inventing one.
if (progress) {
  progress.value = "all";
  progress.dispatchEvent(new ctx.Event("change"));
}
ctx.renderEndfieldResults(fixture);
const firstCard = ctx.document.querySelector(".endfield-source:not(.is-missing)");
const link = firstCard?.querySelector("[data-source-url]");
test.assert(link?.getAttribute("href") === "https://endfield.example/op/tifloss", "card links the archive's own mission URL");
test.assert(link?.getAttribute("rel") === "noopener" && link?.getAttribute("target") === "_blank", "source link opens out of the terminal safely");
test.assert(Boolean(firstCard?.querySelector(".endfield-source-speaker")?.textContent), "card names the speaker");
test.assert(Boolean(firstCard?.querySelector(".endfield-source-line")?.textContent), "card names the line number");
const cardsWithoutUrl = Array.from(ctx.document.querySelectorAll(".endfield-source:not(.is-missing)"))
  .filter((card) => !card.querySelector("[data-source-url]"));
test.assert(cardsWithoutUrl.length === 3, `results without a URL get no link (got ${cardsWithoutUrl.length})`);
test.assert(cardsWithoutUrl.every((card) => card.querySelector("[data-source-url-missing]")), "a missing source link is stated, not fabricated");

// Clipping carries the provenance out of the terminal.
let clipped = null;
ctx.insertFilesIntoFileFloppy = async (files) => { clipped = files[0]; return { mountedFileNames: ["x"] }; };
const clip = ctx.document.querySelector("[data-clip-source]");
await ctx.clipEndfieldSource(clip);
test.assert(clip.disabled === true, "clip button disables after successful clip");
const clippedText = await clipped.text();
test.assert(clippedText.includes("https://endfield.example/op/tifloss"), "clipped file keeps the source URL");
test.assert(clippedText.includes("op-tifloss"), "clipped file keeps the entry id");
test.assert(clippedText.includes("v1.5"), "clipped file keeps the archive version");
test.assert(clippedText.includes(fixture.query), "clipped file keeps the question that retrieved it");
test.assert(clippedText.includes("在追寻萨米失落传说的旅途中与管理员偶遇"), "clipped file keeps the quoted line");

// A clip that never mounted must not read as saved.
ctx.renderEndfieldResults(fixture);
ctx.insertFilesIntoFileFloppy = async () => ({ mountedFileNames: [] });
const failing = ctx.document.querySelector("[data-clip-source]");
await ctx.clipEndfieldSource(failing);
test.assert(failing.disabled !== true, "an unmounted clip leaves the button live");
test.assert(failing.textContent !== ctx.t("endfield_clipped"), "an unmounted clip does not claim success");

test.finish();
