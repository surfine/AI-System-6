// Mingming Review protects the Review Desk pass: it should be a compact
// creative self-check for Luoluo-shaped video copy, not a relationship review.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("mingming-review");

const html = read("index.html");
const actions = read("app/core/actions.js");
const mingmingLens = read("app/features/mingming-lens.js");
const translation = read("app/features/translation.js");
const persistenceStatus = read("app/core/persistence-status.js");
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");

test.assertIncludes(html, 'data-action="review-mingming-section"', "Review Desk exposes the Mingming perspective command");
test.assertIncludes(html, 'data-i18n="review_mingming_section"', "Mingming review command is localized");
test.assertIncludes(actions, '"review-mingming-section": reviewSectionAsMingming', "Review Desk command routes to Mingming review");
test.assertIncludes(persistenceStatus, '"mingming-review-section": { label: t("review_desk"), windowName: "reviewDesk" }', "Mingming review receipt returns to Review Desk");

test.assertIncludes(translation, "function reviewSectionAsMingming()", "Mingming review has a dedicated implementation");
test.assertIncludes(translation, "buildMingmingReviewPrompt", "Mingming review uses the shared prompt builder");
test.assertIncludes(translation, "代入铭铭视角", "Mingming review keeps the requested product language");
test.assertNotIncludes(translation, "交稿前给自己用的镜子", "Review implementation no longer embeds Aaron-only framing");
test.assertNotIncludes(translation, "交得更少、零压力", "Review implementation no longer embeds handoff-pressure framing");
test.assertNotIncludes(translation, "这会给落落增加压力吗", "Review implementation avoids relationship-specific preflight language");

test.assertIncludes(mingmingLens, "function buildMingmingReviewPrompt", "shared review prompt builder exists");
test.assertIncludes(mingmingLens, "创作自检器", "review is framed as a creative self-check");
test.assertIncludes(mingmingLens, "用户可能是 Aaron，也可能是落落本人", "review prompt supports both likely users");
test.assertIncludes(mingmingLens, "不要假设使用者身份", "review prompt avoids identity assumptions");
test.assertIncludes(mingmingLens, "不要输出关系建议、交接压力或私人合作判断", "review prompt excludes relationship review");
test.assertIncludes(mingmingLens, "视频口播稿，不是文章", "Mingming review applies the spoken-video register");
test.assertIncludes(mingmingLens, "反 AI 嘴替检查", "Mingming review checks whether the model has replaced the creator's voice");
test.assertIncludes(mingmingLens, "提示词禁令只能辅助", "Mingming review internalizes that prompt bans cannot replace real source input");
test.assertIncludes(mingmingLens, "句长比例过分规整", "Mingming review detects overly regular AI-like sentence rhythm");
test.assertIncludes(mingmingLens, "个人碎事消失", "Mingming review detects loss of personal usage details");
test.assertIncludes(mingmingLens, "同一种调料抹平", "Mingming review detects flattened model flavor");
test.assertIncludes(mingmingLens, "AI 嘴替", "Mingming review exposes AI-mouthpiece as a review lens");
test.assertIncludes(mingmingLens, "Qwen 3.5 / Qwen 3.6 / DeepSeek v4", "Mingming review knows the intended model families");
test.assertIncludes(mingmingLens, "像 Qwen 那样把稿子做成规整模板", "Mingming review detects Qwen-style template drift");
test.assertIncludes(mingmingLens, "像 DeepSeek v4 那样形容词偏多", "Mingming review detects DeepSeek v4 polished-summary drift");
test.assertIncludes(mingmingLens, "核心/本质/关键", "Mingming review flags summary-heavy model language");
test.assertIncludes(mingmingLens, "前两句看到重点", "Mingming review checks the two-sentence focus rule");
test.assertIncludes(mingmingLens, "发现模式，不是讲课模式", "Mingming review checks Luoluo's discovery-mode stance");
test.assertIncludes(mingmingLens, "观察 → 原因/考据 → 判断 → 然后下一个", "Mingming review checks the real Luoluo structure");
test.assertIncludes(mingmingLens, "声画互补", "Mingming review checks show-don't-repeat behavior");
test.assertIncludes(mingmingLens, "本代特异性", "Mingming review checks generation-specific value");
test.assertIncludes(mingmingLens, "有没有写成文章/剧本/讲课", "Mingming review detects article/script/lecture drift");
test.assertIncludes(mingmingLens, "画面能不能拍", "Mingming review checks shootability");
test.assertIncludes(mingmingLens, "落落基本盘", "Mingming review checks fit with Luoluo's base");
test.assertIncludes(mingmingLens, "更顺、更轻", "Mingming review keeps creation lighter");
test.assertIncludes(mingmingLens, "不要重写全文", "Mingming review stays a review pass, not a rewrite pass");
test.assertIncludes(mingmingLens, "不要事实核查", "Mingming review stays separate from fact-checking");
test.assertIncludes(mingmingLens, "不要用“我是为你好”的口吻说服", "Mingming review avoids pressure-coded persuasion");
test.assertIncludes(mingmingLens, "风格成立度和压力感", "Mingming review checks style fit and pressure");
test.assertIncludes(mingmingLens, "视角 / 观察 / 风险 / 建议", "Mingming review returns a compact table");
test.assertIncludes(mingmingLens, "最多 5 条", "Mingming review keeps feedback bounded");
test.assertIncludes(mingmingLens, "这一节已经顺", "Mingming review can decline to manufacture issues");
test.assertNotIncludes(mingmingLens, "叙事弧线", "Mingming review no longer treats narrative arc as a target lens");

test.assertIncludes(zh, 'review_mingming_section: "代入铭铭视角"', "Chinese copy names the requested command");
test.assertIncludes(en, 'review_mingming_section: "Review as Mingming"', "English copy is present");

test.finish();
