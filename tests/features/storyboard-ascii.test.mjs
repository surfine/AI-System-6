// 字符分镜图 contract (internal/plans/STORYBOARD-SPEC.zh-CN.md, 增补 2026-09-27,
// 分期 T1-T3). The module's pure half runs in a VM. The paragraphs are the
// ipad1 demonstration disk's own voiceover draft (口播稿 · 落落版); the model is
// a fixture reply, so every assertion is about what the storyboard keeps,
// drops or refuses - never about how the model was asked.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("storyboard-ascii");
const fixture = (name) => read(`tests/fixtures/storyboard-ascii/${name}`);

function loadStoryboard(globals = {}) {
  const context = vm.createContext({ window: {}, console, ...globals });
  vm.runInContext(read("app/data/translations-zh.js"), context);
  const table = context.window.AISystem6TranslationsZh;
  context.t = (key, ...args) => (typeof table[key] === "function" ? table[key](...args) : table[key] ?? key);
  context.currentLanguage = "zh";
  for (const path of ["app/core/listen-beats.js", "app/data/storyboard-shots.js", "app/core/storyboard-ascii.js"]) {
    vm.runInContext(read(path), context);
  }
  return context;
}

const context = loadStoryboard();
const storyboard = context.window.AISystem6StoryboardAscii;
const beats = context.window.AISystem6ListenBeats;
vm.runInContext(read("app/content/shared-disks/ipad1.js"), context);
const voiceover = context.window.AISystem6SharedProjectDisks.ipad1.files.find((file) => file.name === "口播稿 · 落落版").body;
const rows = beats.buildStoryboardRows(voiceover, { rate: 1 });
const paragraph2 = rows[1].text;
test.assert(paragraph2.startsWith("旁边这台 iPhone 4") && !paragraph2.includes("MagSafe"), "the input is the ipad1 voiceover's own second paragraph, which never names MagSafe");

// --- T1: every proposed shot is checked ---------------------------------------

const accepted = storyboard.acceptModelShots(fixture("ipad1-para2-reply.txt"), { paragraph: paragraph2, captions: [] });
const reasons = accepted.dropped.map((item) => item.reason);
test.assert(accepted.shots.length === 2, "two of the six proposed shots survive");
test.assert(reasons.includes("vocabulary"), "a shot size outside the vocabulary (超大特写) drops the shot");
test.assert(reasons.includes("seconds"), "a shot longer than 15 seconds drops the shot");
test.assert(
  accepted.dropped.some((item) => item.reason === "names" && item.names.includes("MagSafe")),
  "a name the paragraph does not contain (MagSafe) drops the shot"
);
test.assert(
  accepted.dropped.some((item) => item.reason === "names" && item.names.includes("Settings")),
  "a name drawn into the frame is checked too: an invented Settings screen drops the shot"
);
test.assert(
  accepted.shots.every((shot) => ["size", "angle", "move"].every((key) => typeof shot[key] === "string")) && accepted.shots[0].size === "medium",
  "a kept shot carries its vocabulary words as stable ids"
);

for (const shot of accepted.shots) {
  const art = shot.art.split("\n");
  test.assert(art.length === storyboard.ART_ROWS, `shot 「${shot.visual.slice(0, 12)}」 has exactly 20 frame rows`);
  test.assert(art.every((row) => storyboard.displayWidth(row) === storyboard.ART_COLS), `shot 「${shot.visual.slice(0, 12)}」 has every row at 64 display columns`);
}
const labelRow = accepted.shots[0].art.split("\n").find((row) => row.includes("内存 512MB"));
test.assert(
  labelRow && labelRow.length === storyboard.ART_COLS - 2,
  "a Chinese label counts two columns a character: its row holds two fewer characters than an ASCII row"
);
const longFrame = accepted.shots[1].art.split("\n");
test.assert(
  longFrame[0].trim() === "iPad                         iPhone 4" && longFrame[1].startsWith(" ====") && !longFrame[1].includes("截断"),
  "an over-wide row is cut at 64 columns without rewriting what it drew"
);
test.assert(longFrame[19].trim() === "|" + " ".repeat(17) + "*", "a frame longer than 20 rows is cut at the 20th");
test.assert(
  !storyboard.storyboardMarkdown({ title: "t", source: "s", blocks: [{ number: 1, seconds: 10, anchor: "", textHash: "", shots: accepted.shots }] }).includes("广告词"),
  "a request written into the reply is data: it never reaches the storyboard"
);

// A whole paragraph through buildStoryboard, with the fixture as the model.
const built = await storyboard.buildStoryboard({
  body: `${rows[0].text}\n\n${paragraph2}`,
  title: "初代 iPad 为什么只有 256MB 内存",
  source: "口播稿 · 落落版",
  requestShots: async ({ paragraph }) => (paragraph.startsWith("旁边这台") ? fixture("ipad1-para2-reply.txt") : "我不会画。"),
});
const parsed = storyboard.parseStoryboard(built.markdown);
test.assert(parsed.paragraphs.length === 2 && parsed.source === "口播稿 · 落落版", "one block per paragraph, under a header that names its source");
test.assert(
  parsed.paragraphs[1].shots.length === 2 && parsed.paragraphs[1].shots.every((shot) => /^2\.\d$/.test(shot.number) && shot.aiHash),
  "kept shots are numbered <paragraph>.<shot> and carry the ai: hash"
);
test.assert(
  parsed.paragraphs[0].shots.length === 0 && parsed.paragraphs[0].rawBody.includes("这一段没拆出来，可以再试一次"),
  "a paragraph whose shots were all dropped says so, and no rule-made shot stands in (H4)"
);
test.assert(
  beats.findListenQuoteRange(`${rows[0].text}\n\n${paragraph2}`, parsed.paragraphs[1].anchor)?.start === rows[0].text.length + 2,
  "each block's q: anchor resolves back to its paragraph's opening"
);

// --- T2: updating from the source keeps the writer's hand (H8) ---------------

const replies = Object.fromEntries(
  fixture("ipad1-model-replies.txt").split(/<!-- paragraph (\d+) -->/).slice(1)
    .reduce((pairs, value, index, all) => (index % 2 ? pairs : [...pairs, [all[index], all[index + 1]]]), [])
);
const fullTitle = "初代 iPad 为什么只有 256MB 内存";
const first = await storyboard.buildStoryboard({
  body: voiceover,
  title: fullTitle,
  source: "口播稿 · 落落版",
  requestShots: async ({ number }) => replies[number] || "",
});
test.assert(
  first.stats.paragraphs === 23 && first.stats.failed === 0 && first.stats.shots === 53,
  "the ipad1 voiceover splits into 23 paragraph blocks, all of them with shots from the fixture"
);

// The writer redraws one shot of paragraph 2 and notes footage on one shot of
// paragraph 4; then the voiceover is revised: paragraph 2 changes, paragraph 3
// ("今年我们就照着试了一遍。") is cut, and a new paragraph arrives before 焊台.
const edited = first.markdown
  .replace("画面：推到 iPhone 4：同样是 A4", "画面：推到 iPhone 4 的背面，写作者自己改的")
  .replace("画面：示意：内存直接叠在处理器上面，两层压成一颗", "画面：示意：内存直接叠在处理器上面，两层压成一颗\n素材：待做");
const revised = voiceover
  .replace("还比 iPad 晚了两个多月才卖", "还比 iPad 晚了整整两个月才卖")
  .replace("今年我们就照着试了一遍。\n\n", "")
  .replace("## 焊台", "为了这件事，我们专门借了一台焊台，还请了一位老师傅帮忙。\n\n## 焊台");
const asked = [];
const second = await storyboard.buildStoryboard({
  body: revised,
  title: fullTitle,
  source: "口播稿 · 落落版",
  existing: edited,
  requestShots: async ({ number, paragraph }) => {
    asked.push(paragraph.slice(0, 12));
    return paragraph.startsWith("为了这件事") ? replies[3] : replies[number] || replies[2];
  },
});
test.assert(
  asked.length === 2 && asked.some((opening) => opening.startsWith("旁边这台")) && asked.some((opening) => opening.startsWith("为了这件事")),
  "only the changed paragraph and the new one go to the model; unchanged paragraphs are not asked again"
);
const after = storyboard.parseStoryboard(second.markdown);
const before = storyboard.parseStoryboard(edited);
const kept = after.paragraphs.filter((paragraph) => !paragraph.changed && paragraph.anchor.startsWith("〔画面：掀开 A4 顶盖"))[0];
test.assert(
  kept && kept.rawBody.replace(/镜 \d+\.\d+/g, "镜 n") === before.paragraphs[3].rawBody.replace(/镜 \d+\.\d+/g, "镜 n"),
  "an unchanged paragraph keeps every line of every shot, including the footage the writer noted; only numbers follow"
);
const changedTwo = after.paragraphs.find((paragraph) => paragraph.anchor.startsWith("旁边这台"));
test.assert(
  changedTwo.shots.some((shot) => shot.visual === "推到 iPhone 4 的背面，写作者自己改的" && !storyboard.isUntouchedModelShot(shot)),
  "in a changed paragraph the shot the writer redrew is kept"
);
test.assert(
  changedTwo.shots.filter((shot) => storyboard.isUntouchedModelShot(shot)).length === 3
    && changedTwo.shots.length === 4,
  "and the model's own shots there are replaced by the new split"
);
const orphan = after.paragraphs.find((paragraph) => paragraph.changed);
test.assert(
  orphan && orphan.anchor === "今年我们就照着试了一遍" && orphan.shots.length === 1 && /原文已改/.test(second.markdown.split("\n").find((line) => line.includes("q:今年我们就照着试了一遍"))),
  "a paragraph cut from the source keeps its block, marked 原文已改, and is not deleted"
);
test.assert(
  after.paragraphs.some((paragraph) => paragraph.anchor.startsWith("为了这件事") && paragraph.shots.length),
  "a new paragraph is split by the model"
);
test.assert(second.stats.kept === 21 && second.stats.updated === 1 && second.stats.added === 1 && second.stats.orphaned === 1, "the update reports 21 untouched, 1 split again, 1 new, 1 marked changed");

// --- T2: the sheet --------------------------------------------------------------

const handDrawn = edited.replace("```text\n          +--------------------------------------+", "```text\n  THE WRITER DREW THIS ROW HERE");
const sheet = storyboard.sheetLayout(storyboard.parseStoryboard(handDrawn), { language: "zh" });
test.assert(sheet.width === 1080 && sheet.pages.length > 1, "the ipad1 sheet is 1080 pixels wide and runs over several pages");
test.assert(sheet.pages.every((page) => page.height <= 8000), "no page is taller than 8000 pixels");
test.assert(
  sheet.pages.every((page) => page.items.find((item) => item.kind !== "summary")?.kind === "paragraph"),
  "every page starts at a paragraph boundary"
);
test.assert(sheet.pages[0].items[0].kind === "summary" && sheet.pages[0].items[0].stats === "23 段 · 53 个镜头 · 总估 5:52", "the first page opens with the summary card: paragraphs, shots, total estimate");
test.assert(
  sheet.pages.flatMap((page) => page.items).some((item) => item.kind === "shot" && item.art[0].startsWith("  THE WRITER DREW THIS ROW HERE")),
  "a frame the writer changed is drawn as written"
);
test.assert(
  sheet.pages.flatMap((page) => page.items).filter((item) => item.badge === "待做").length === 1,
  "a shot whose footage is 待做 carries the reversed badge"
);
const names = storyboard.sheetFileNames(`${fullTitle} · 分镜`, sheet.pages.length, "zh");
test.assert(names[0] === `${fullTitle} · 分镜图 1.png` && names.at(-1) === `${fullTitle} · 分镜图 ${sheet.pages.length}.png`, "paged sheets are named with their page numbers");
test.assert(
  !storyboard.generateCommandState({ modelReady: false, isStoryboard: true, hasBody: true }).disabled,
  "a storyboard in hand is drawn without a model"
);

// --- T3: refine this shot / put it back (H9) -----------------------------------

const refineAt = edited.indexOf("画面：推到 iPhone 4 的背面");
const found = storyboard.shotAtOffset(edited, refineAt + 3);
test.assert(found && found.shot.number === "2.2" && found.paragraph.number === 2, "the caret inside shot 2.2 finds that shot");
test.assert(storyboard.shotAtOffset(edited, edited.indexOf("## 段 2")) === null, "on a paragraph heading, outside any shot, there is no shot to refine");
test.assert(storyboard.shotAtOffset(voiceover, 10) === null, "a document that is not a storyboard offers no shot");
const opening = storyboard.paragraphOpening(found.paragraph, voiceover);
const refined = storyboard.refinePrefill({ shot: found.shot, opening, language: "zh" });
test.assert(refined.aspect === "16:9", "the studio is prefilled at 16:9");
test.assert(refined.sourceLabel === "来自分镜 · 镜 2.2", "the studio names where the idea came from: 来自分镜 · 镜 2.2");
test.assert(refined.idea.split("\n")[0] === "特写 · 平拍 · 推", "the idea opens with size, angle and movement");
test.assert(refined.idea.includes("画面：推到 iPhone 4 的背面，写作者自己改的"), "it carries the shot's visual line");
test.assert(
  refined.idea.includes(`这一段原文：${[...paragraph2.replace(/\s+/g, " ")].slice(0, 60).join("")}`) && !refined.idea.includes(paragraph2.slice(0, 61)),
  "it carries exactly the paragraph's first 60 characters"
);
const frameRows = found.shot.art.split("\n").map((row) => row.trimEnd()).filter(Boolean);
test.assert(frameRows.length > 0 && frameRows.every((row) => refined.idea.includes(row)), "and the shot's character frame as a plain-text composition reference");

const pictureTitle = storyboard.putBackTitle(found.shot.number, found.shot.visual, "zh");
test.assert(pictureTitle === "分镜 2.2 · 推到 iPhone 4", "the picture is titled 分镜 <shot> · the visual's first 12 characters (推到 iPhone 4 plus a space, trimmed)");
const withPicture = storyboard.withShotImage(edited, "2.2", pictureTitle, "zh");
const pictured = storyboard.parseStoryboard(withPicture).paragraphs[1].shots.find((shot) => shot.number === "2.2");
test.assert(pictured.image === pictureTitle && withPicture.split("\n").length === edited.split("\n").length + 1, "putting it back adds one 图： line to that shot and nothing else");
test.assert(storyboard.withShotImage(withPicture, "2.2", "分镜 2.2 · 换一张", "zh").split("\n").length === withPicture.split("\n").length, "a second picture replaces the 图： line rather than stacking");
test.assert(!storyboard.isUntouchedModelShot(pictured), "a shot with a picture is the writer's: updating from the source keeps it");
const pictureSheet = storyboard.sheetLayout(storyboard.parseStoryboard(withPicture), { language: "zh", hasImage: (title) => title === pictureTitle });
const pictureItem = pictureSheet.pages.flatMap((page) => page.items).find((item) => item.kind === "shot" && item.heading.startsWith("镜 2.2 "));
test.assert(pictureItem.image === pictureTitle && pictureItem.art.length === 0, "the sheet draws that shot with the real picture instead of the frame");

const unsaved = storyboard.putBackState({ saved: false });
test.assert(unsaved.disabled && unsaved.reasonKey === "storyboard_put_back_needs_save", "before the storyboard is saved, 「放回这一镜…」 is greyed with the reason");
test.assert(!storyboard.putBackState({ saved: true }).disabled, "once saved it is available");
const studio = read("app/features/image-prompt-studio.js");
test.assertMatches(studio, /id="ips-put-back"[^>]*hidden/, "the studio's put-back button exists and stays hidden unless a storyboard shot opened it");
test.assertMatches(studio, /putBack\.disabled = Boolean\(state\.disabled\)/, "the studio greys the button from the storyboard's own state");
for (const language of ["zh", "en"]) {
  const table = read(`app/data/translations-${language}.js`);
  test.assert(["storyboard_put_back_needs_save:", "storyboard_refine_shot:", "ips_put_back:"].every((key) => table.includes(key)), `the refine and put-back copy exists in translations-${language}.js`);
}

// --- P2: the third layer of checks, on the hand-made sample ---------------------
// The sample column is the ipad1 disk's own 「初代 iPad 为什么只有 256MB 内存」
// (14 paragraphs, as in the hand-made table). The writer's cut marks are the
// table's 口播可删 column, written as 口播可删 lines under each heading.

const column = context.window.AISystem6SharedProjectDisks.ipad1.files.find((file) => file.name === "初代 iPad 为什么只有 256MB 内存").body;
const oneShot = "### 镜 · 近景 · 平拍 · 固定 · 5s\n画面：桌面上的东西\n```text\n  [ ]\n```\n";
const sampleBoard = await storyboard.buildStoryboard({ body: column, title: "初代 iPad 为什么只有 256MB 内存", source: "s", requestShots: async () => oneShot });
test.assert(sampleBoard.stats.paragraphs === 14, "the sample column splits into the hand-made table's 14 rows");
const handTable = { 2: "否，前 20 秒的钩子", 3: "电路图那句可删", 4: "信号示意可删", 6: "可压成一句", 8: "内存压缩、Neo 那句可删", 9: "iMovie 可删", 10: "否，全片反转点", 12: "国行价签可删", 13: "可删" };
let marked = sampleBoard.markdown;
for (const [number, value] of Object.entries(handTable)) {
  marked = marked.replace(new RegExp(`(## 段 ${number} [^\\n]*\\n)`), `$1\n口播可删：${value}\n`);
}
const sampleChecks = storyboard.storyboardChecks({ body: column, markdown: marked });
test.assert(
  sampleChecks.some((line) => line.startsWith("悬空伏笔：删了第 3 段的「电路图那句」") && line.includes("第 10 段的「电路图」")),
  "悬空伏笔 is reported for paragraph 3 → 10: cutting the 电路图 sentence leaves paragraph 10's 电路图 unexplained"
);
test.assert(sampleChecks.some((line) => line.startsWith("注意覆盖：第 12 段")), "注意覆盖 is reported for paragraph 12: iPad and iPhone 4 prices side by side with no note");
test.assert(!sampleChecks.some((line) => line.startsWith("开头")), "paragraph 2 marked as the hook satisfies the opening check");
test.assert(
  storyboard.storyboardChecks({ body: column, markdown: sampleBoard.markdown }).some((line) => line.startsWith("开头")),
  "unmarked, the first two paragraphs run past 20 seconds and the opening check speaks"
);
const noted = marked.replace(/(## 段 12 [^\n]*\n)/, "$1\n口播注意：13.8 美元是 iPhone 4 的内存价格，不是 iPad 的。\n");
test.assert(!storyboard.storyboardChecks({ body: column, markdown: noted }).some((line) => line.startsWith("注意覆盖：第 12 段")), "a 口播注意 line under paragraph 12 answers that check");
const withoutTen = column.replace(/\n\n那回过头来问[\s\S]*?iPad 没赶上。/, "");
const coverage = storyboard.storyboardChecks({ body: withoutTen, markdown: marked });
test.assert(coverage.some((line) => line.startsWith("锚点：段 10")), "a block whose paragraph left the source is reported: its anchor no longer resolves");
const jumpy = sampleBoard.markdown
  .replace(/(## 段 1 [\s\S]*?画面：)桌面上的东西/, "$1桌上的 iPad")
  .replace(/(## 段 2 [\s\S]*?画面：)桌面上的东西/, "$1优酷视频")
  .replace(/(## 段 3 [\s\S]*?画面：)桌面上的东西/, "$1桌上的 iPad");
test.assert(storyboard.storyboardChecks({ body: column, markdown: jumpy }).some((line) => line.startsWith("回跳：段 1 → 2 → 3，「iPad」")), "iPad pictured in 1 and 3 but not 2 is reported as a jump");
test.assert(storyboard.withChecks(marked, ["x"]).split("## 检查").length === 2 && storyboard.withChecks(storyboard.withChecks(marked, ["x"]), []).indexOf("## 检查") < 0, "the 检查 list is the storyboard's own last section, replaced whole");

// --- P3: cutting to a target length ---------------------------------------------

const plan = storyboard.trimPlan({ body: column, markdown: marked, targetSeconds: 360 });
test.assert(plan.total > 400 && plan.after <= 360 && plan.reached, "cutting the sample to 6 minutes fits: the estimate goes from over 7 minutes to under 6");
const savings = plan.cuts.map((cut) => cut.saves);
test.assert(plan.cuts.length < 7 && plan.cuts.every((cut) => ["whole", "part", "compress"].includes(cut.kind)), "only what the writer marked cuttable is offered, and not all of it is needed");
const everything = storyboard.trimPlan({ body: column, markdown: marked, targetSeconds: 0 });
const left = everything.cuts.filter((cut) => !plan.cuts.some((taken) => taken.number === cut.number)).map((cut) => cut.saves);
test.assert(everything.cuts.length === 7 && Math.min(...savings) >= Math.max(...left), "the longest savings are taken first; the shorter cuts are left alone");
const drop13 = everything.cuts.find((cut) => cut.number === 13);
test.assert(drop13.kind === "whole" && drop13.before && drop13.next.startsWith("512MB 的 iPad 还在我桌上"), "dropping paragraph 13 says how the end of 12 meets the start of 14");
const part3 = everything.cuts.find((cut) => cut.number === 3);
test.assert(part3.cutText.startsWith("后来翻 iPad 1 的电路图") && part3.dangling.some((item) => item.paragraph === 10), "cutting the 电路图 sentence carries the dangling warning for paragraph 10");
const suggestion = storyboard.trimMarkdown(plan, { title: "初代 iPad 为什么只有 256MB 内存" });
test.assert(suggestion.startsWith("# 初代 iPad 为什么只有 256MB 内存 · 删减建议") && suggestion.includes("正文没有改动"), "the suggestion is its own document and says the source is unchanged");
test.assert(column === context.window.AISystem6SharedProjectDisks.ipad1.files.find((file) => file.name === "初代 iPad 为什么只有 256MB 内存").body, "the source text is not changed by checking or trimming");
test.assert(storyboard.cutPlan("甲。（可删）乙句子在这里。丙。").cutText === "乙句子在这里。", "a （可删） mark in the voiceover cuts the sentence after it");
test.assert(JSON.stringify(storyboard.trimTargets(425)) === "[7,6,5,4,3,2,1]" && storyboard.trimTargets(50).length === 0, "the menu offers whole minutes shorter than the estimate");

// --- P4 (D4: frames taken in the browser, no ffmpeg, no server route) ------------

const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((time) => ({ time, change: 0.01 }));
samples[3].change = 0.6;
samples[4].change = 0.5;
samples[9].change = 0.3;
samples[11].change = 0.05;
test.assert(JSON.stringify(storyboard.selectKeyframes(samples)) === "[0,3,9]", "the first frame and the big picture changes are kept; a change within 2 seconds of a bigger one, and a small change, are not");
test.assert(JSON.stringify(storyboard.selectKeyframes(samples, { max: 2 })) === "[0,3]", "the count is capped (at most the album's free slots, and 24)");
test.assert(storyboard.keyframeSampleTimes(40).length === 40 && storyboard.keyframeSampleTimes(3600).length === 240, "a 40-second film is sampled every second; an hour is capped at 240 samples");
test.assert(storyboard.keyframeTitle("落落 17e 体验.mp4", 75.4) === "落落 17e 体验 · 1:15", "a frame is titled with its video's name and time");
test.assert(storyboard.footageImage("已有（图：落落 17e 体验 · 1:15）") === "落落 17e 体验 · 1:15", "「素材：已有（图：…）」 names the picture that proves the footage exists");
const onHand = edited.replace("画面：示意：内存直接叠在处理器上面，两层压成一颗\n素材：待做", "画面：示意：内存直接叠在处理器上面，两层压成一颗\n素材：已有（图：成片 · 0:12）");
const onHandItem = storyboard.sheetLayout(storyboard.parseStoryboard(onHand), { language: "zh", hasImage: (title) => title === "成片 · 0:12" })
  .pages.flatMap((page) => page.items).find((item) => item.image === "成片 · 0:12");
test.assert(onHandItem && onHandItem.art.length === 0 && !onHandItem.badge, "a shot whose footage is 已有 with a frame is drawn with that frame and carries no badge");
const mediaPolicies = [
  ...read("apps/server/server/security/local-request.js").matchAll(/"(media-src [^"]+)"/g),
  ...[...read("platform/web/system6.aaronlau.me.nginx.conf").matchAll(/add_header Content-Security-Policy "([^"]+)"/g)].map((match) => [0, match[1].match(/media-src [^;]+/)?.[0] || ""]),
  ...[...read("tooling/lib/pages-headers.mjs").matchAll(/Content-Security-Policy: ([^"]+)"/g)].map((match) => [0, match[1].match(/media-src [^;]+/)?.[0] || ""]),
].map((match) => match[1]).filter(Boolean);
test.assert(mediaPolicies.length >= 4 && mediaPolicies.every((policy) => /\sblob:/.test(policy)), "every policy that serves the desk lets a <video> read a locally chosen file (media-src blob:), which is how frames are taken without a server");

// --- T1: without a model the command is grey and says why -------------------

const noModel = storyboard.generateCommandState({ modelReady: false, isStoryboard: false, hasBody: true });
test.assert(noModel.disabled && noModel.reasonKey === "storyboard_needs_model", "with no model connected, 「生成分镜图」 is disabled with the no-model reason");
test.assert(!storyboard.generateCommandState({ modelReady: true, hasBody: true }).disabled, "with a model connected the command is available");
for (const language of ["zh", "en"]) {
  const table = read(`app/data/translations-${language}.js`);
  test.assertIncludes(table, "storyboard_needs_model:", `the no-model reason exists in translations-${language}.js`);
  test.assertIncludes(table, "storyboard_generate_sheet:", `the menu row has a ${language} label`);
}

let modelCalls = 0;
const statuses = [];
const refusing = loadStoryboard({
  modelReadyForRequests: () => false,
  fetchModelPayload: async () => { modelCalls += 1; throw new Error("unexpected model call"); },
  setStatus: (message) => statuses.push(message),
  beginLongTask: () => { throw new Error("unexpected long task"); },
});
const refused = await refusing.window.AISystem6StoryboardAscii.generateStoryboard({ body: voiceover, title: "x", source: "x" });
test.assert(refused === null && modelCalls === 0, "asked to generate with no model, the module refuses before any request");
test.assert(statuses.at(-1)?.includes("控制面板"), "and the refusal tells the writer where to connect one");

// --- entries and loading -------------------------------------------------------

const manifest = read("tooling/runtime-manifest.mjs");
const eager = manifest.split("export const lazyRuntimePaths")[0];
test.assert(
  ["app/core/storyboard-ascii.js", "app/data/storyboard-shots.js"].every((path) => manifest.includes(`"${path}"`) && !eager.includes(`"${path}"`)),
  "the storyboard module and its vocabulary are lazy"
);
test.assertNotIncludes(read("index.html"), "storyboard_generate_sheet", "the TeachText row is not in index.html; the lazy module inserts it");
test.assertMatches(read("app/core/document-role-policy.js"), /addEventListener\("toggle"[\s\S]{0,300}?teachtext-command-menu[\s\S]{0,200}?ensureStoryboardAsciiModule\(\)/, "the first time TeachText's Commands menu opens, the storyboard module is loaded");
test.assertMatches(read("app/features/draft-desk.js"), /data-quick-draft-delivery="export-shot-list"[\s\S]{0,120}?"storyboard_needs_model"/, "Quick Draft's 「分镜图」 row is greyed with the no-model reason");

test.finish();
