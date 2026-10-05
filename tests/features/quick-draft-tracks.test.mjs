// 兴趣｜内容｜并排. The switch sits beside 痕迹｜阅读｜听稿, and the rewrite
// reads only the draft it is looking at.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("quick-draft-tracks");
const tracks = read("app/features/quick-draft-tracks.js");
const desk = read("app/features/draft-desk.js");
const editor = read("app/features/quick-draft-editor.js");
const manifest = read("tooling/runtime-manifest.mjs");
const config = read("app/core/config.js");
const lightroom = desk.slice(desk.indexOf("function installLightroomWindow"), desk.indexOf("installLightroomWindow();"));
const footer = lightroom.slice(lightroom.indexOf('<footer class="lightroom-actions">'));
const tablist = footer.slice(footer.indexOf('role="tablist"'), footer.indexOf("</span>", footer.indexOf('role="tablist"')));

test.assertIncludes(footer, 'data-quick-draft-track="interest"', "兴趣 is a segment on the lightroom footer");
test.assertIncludes(footer, 'data-quick-draft-track="content"', "内容 is a segment on the lightroom footer");
test.assertIncludes(footer, 'data-quick-draft-track="split"', "并排 is a segment on the lightroom footer");
test.assertIncludes(footer, 'class="view-switch quick-draft-track-toggle"', "the track switch is the segmented control");
test.assertIncludes(footer, 'class="view-switch draft-desk-display-switch"', "痕迹｜阅读｜听稿 is the same control, as tabs");
test.assertIncludes(footer, 'role="group"', "the track switch is its own control");
test.assert(!tablist.includes("data-quick-draft-track"), "the track switch is not a fourth 痕迹｜阅读｜听稿 tab");
test.assertIncludes(desk, 'getWindow("lightroom")?.addEventListener("click"', "a click on the lightroom footer reaches the track switch");
test.assertIncludes(editor, "quickDraftTrackOwnsPaper", "a content or split view survives the paper repaint");
test.assertIncludes(manifest, '"app/features/quick-draft-tracks.js"', "the track module stays on the lazy list");
test.assertIncludes(config, '"app/features/quick-draft-tracks.js"', "the Quick Draft loader includes the track module");
test.assert(tracks.indexOf("lightroom_track_need_interest") < tracks.indexOf("fetchModelPayload"), "an empty draft does not ask the model");
test.assert(tracks.indexOf("showSystemModal") < tracks.lastIndexOf("refs.draft.value = traffic.body"), "冲洗 asks before it writes the body");
test.assertIncludes(tracks, "syncQuickDraftMobileAdjustmentActions", "generating or switching a track refreshes the one footer default");
test.assertIncludes(read("app/features/quick-draft-composition.js"), "trackOwns", "Preview and Develop enable for the content track without adjustment layers");
test.assertNotIncludes(tracks, "落落", "generation does not carry a person from the cases");
test.assertNotIncludes(tracks, "跳出率", "the UI does not paint predicted bounce rates");
test.assertNotIncludes(tracks, "完播率", "the UI does not paint predicted completion rates");

const context = vm.createContext({
  window: { addEventListener() {}, innerWidth: 1200 },
  document: { querySelectorAll: () => [] },
  console,
  currentLanguage: "zh",
  t: (key) => ({
    lightroom_track_embrace_empty: "你写的，我接着看。",
    lightroom_track_embrace_after: "写下来，就很好。",
  }[key] || key),
});
vm.runInContext(tracks, context);

const source = "这是一句已经写好的原句，只给这一篇。";
const prompt = context.buildTrafficPrompt(source);
test.assertIncludes(prompt, source, "the prompt carries this draft");
test.assert(!prompt.includes("吃饭"), "the prompt does not explain the rewrite as making a living");
test.assertIncludes(prompt, "不使用任何别的材料", "the prompt refuses any other material");
test.assertIncludes(prompt, "不准新增", "the prompt refuses invented experience");
test.assertIncludes(prompt, "点赞", "the closed standard list is in the prompt");
test.assert(!prompt.includes("博物馆"), "the prompt does not carry the case pages");

const parsed = context.parseTrafficAnswer('{"title":"封","cover":"点","body":"改过的正文","ledger":[{"before":"原句","after":"改后","standard":"播放"},{"before":"x","after":"y","standard":"心情"}]}');
test.assert(parsed?.body === "改过的正文" && parsed.ledger.length === 1 && parsed.ledger[0].standard === "播放", "a ledger entry outside the closed list is dropped");
test.assert(context.parseTrafficAnswer("不是 JSON") === null, "an unreadable answer does not become a draft");

const embrace = context.trafficEmbrace(source);
test.assertIncludes(embrace, "这是一句已经写好的原句", "the header quotes this draft");
test.assertIncludes(embrace, "写下来，就很好。", "the header receives the piece");
test.assert(context.trafficEmbraceOk(embrace), "the header does not explain the device");
test.assert(context.trafficEmbraceOk("右边是为了被人看见") === false, "an explanation of the right column is refused");
test.assert(context.trafficEmbrace("") === "你写的，我接着看。", "a draft with no quotable line gets no invented feeling");
test.assertIncludes(tracks, "quickDraftTrackMode === \"split\"", "the embrace header only belongs to Side by Side");
test.assert(
  /const embrace = quickDraftTrackMode === "split"\s*\n\s*\?/.test(tracks),
  "an empty interest still paints the empty embrace on Side by Side"
);

test.finish();
