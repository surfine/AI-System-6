// Mingming Outline protects the dual-user Luoluo style assistant: the command
// turns source material, outlines, or half-drafts into Luoluo-shaped spoken copy.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("mingming-outline");

const html = read("index.html");
const actions = read("app/core/actions.js");
const chatMessages = read("app/core/chat-messages.js");
const config = read("app/core/config.js");
const manifest = read("scripts/runtime-manifest.mjs");
const mingmingLens = read("app/features/mingming-lens.js");
const outlineClaim = read("app/features/outline-claim.js");
const packageJson = read("package.json");
const persistenceStatus = read("app/core/persistence-status.js");
const evalScript = read("scripts/eval-mingming-outline.mjs");
const iphone17eCorpus = read("app/data/iphone-17e-demo-corpus.js");
const serverChat = read("src/server/chat.js");
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");

test.assertIncludes(html, 'data-action="mingming-outline"', "Outline command menu exposes the Mingming handoff command");
test.assertIncludes(html, 'data-i18n="mingming_outline"', "Mingming command is localized");
test.assertIncludes(actions, '"mingming-outline": () => runOutlineOperation("mingming")', "action routes to the outline operation layer");
test.assertIncludes(config, '[data-action="mingming-outline"]', "Mingming command is disabled during long AI tasks");

test.assertIncludes(manifest, '"app/features/mingming-lens.js"', "shared Mingming lens module loads before callers");
test.assertIncludes(manifest, '"app/features/outline-claim.js"', "Outline module still loads");
test.assertIncludes(mingmingLens, "const MINGMING_STYLE_CONTRACT", "shared style contract centralizes Mingming rules");
test.assertIncludes(mingmingLens, "function buildMingmingRewritePrompt", "shared rewrite prompt builder exists");
test.assertIncludes(mingmingLens, "你是落落体创作助手", "prompt frames the feature as a Luoluo style assistant");
test.assertIncludes(mingmingLens, "双用户、单体验", "prompt preserves the dual-user product model");
test.assertIncludes(mingmingLens, "用户可能是 Aaron，也可能是落落本人", "prompt does not assume which person is using it");
test.assertIncludes(mingmingLens, "不要假设使用者身份", "prompt explicitly avoids identity assumptions");
test.assertIncludes(mingmingLens, "创作判断归使用者", "prompt keeps creative authority with the user");
test.assertIncludes(mingmingLens, "不要追加多版本、交接压力或关系建议", "prompt prevents extra pressure and relationship guidance");
test.assertIncludes(mingmingLens, "只内化《落落体_系统提示词.md》《落落体_改写规范.md》《落落_角色档案.md》", "prompt limits productized source documents to style materials");
test.assertIncludes(mingmingLens, "不要引入私人关系或合作判断", "prompt keeps relationship framing out of product behavior");
test.assertIncludes(mingmingLens, "出厂设置", "prompt internalizes the role profile before writing");
test.assertIncludes(mingmingLens, "苹果收藏家、旧数码赛博文玩、广东人、周杰伦和 EVA 粉", "prompt carries the Luoluo role profile anchors");
test.assertIncludes(mingmingLens, "万能转换 SOP（改什么像什么）", "prompt productizes the rewrite-spec SOP");
test.assertIncludes(mingmingLens, "先识别输入类型", "prompt can route any draft shape before rewriting");
test.assertIncludes(mingmingLens, "先提取，不急着改写", "prompt follows the extraction step from the rewrite spec");
test.assertIncludes(mingmingLens, "扔掉原文结构，保留内容功能", "prompt keeps the rewrite spec's structure-stripping step");
test.assertIncludes(mingmingLens, "重建开场", "prompt keeps the rewrite spec's opening reconstruction step");
test.assertIncludes(mingmingLens, "短句化后在脑子里大声念一遍", "prompt keeps the ear-check from the rewrite spec");
test.assertIncludes(mingmingLens, "标题公式", "prompt productizes the title formula");
test.assertIncludes(mingmingLens, "「落落」+ 情绪/反差钩子 + 核心对象 + 副题", "prompt carries the title shape from the rewrite spec");
test.assertIncludes(mingmingLens, "灵魂母题只能从材料自然浮现", "prompt carries the role profile's recurring themes");
test.assertIncludes(mingmingLens, "实体掌握 vs 流媒体", "prompt carries the role profile's ownership theme");
test.assertIncludes(mingmingLens, "比喻系统要具体、通感、接地气", "prompt carries the role profile's metaphor system");
test.assertIncludes(mingmingLens, "糖浆、高架桥俯视车道音轨、肠粉、奶茶", "prompt carries concrete metaphor anchors");
test.assertIncludes(mingmingLens, "连接词和口头纹理优先用", "prompt carries the rewrite spec's high-frequency spoken texture");
test.assertIncludes(mingmingLens, "旅行 / 回忆 / 生活片", "prompt broadens topic routing beyond product reviews");
test.assertIncludes(mingmingLens, "把输入材料转换成落落频道里能拍、能念、能成立的口播稿", "prompt targets usable spoken-video copy");
test.assertIncludes(mingmingLens, "只输出改写后的完整文案", "prompt forbids analysis or handoff tables");
test.assertIncludes(mingmingLens, "提示词禁令只能辅助", "prompt internalizes that style bans cannot replace real user input");
test.assertIncludes(mingmingLens, "反 AI 嘴替检查", "prompt guards against the model replacing the creator's language");
test.assertIncludes(mingmingLens, "Qwen 3.5 / Qwen 3.6 / DeepSeek v4", "prompt names the intended model families");
test.assertIncludes(mingmingLens, "视频口播稿，不是文章", "prompt applies the Luoluo spoken-video register");
test.assertIncludes(mingmingLens, "前两句要看到重点", "prompt preserves the two-sentence focus rule");
test.assertIncludes(mingmingLens, "优先 5-12 字一个想法", "prompt preserves the short spoken sentence grain");
test.assertIncludes(mingmingLens, "碎碎念着往前滚", "prompt preserves Luoluo's rolling spoken texture");
test.assertIncludes(mingmingLens, "前 20 秒必须有意思", "prompt preserves retention guidance");
test.assertIncludes(mingmingLens, "我发现了什么", "prompt preserves Luoluo's discovery-mode perspective");
test.assertIncludes(mingmingLens, "不要写给媒体老师", "prompt keeps the output aimed at real viewers instead of insiders");
test.assertIncludes(mingmingLens, "题材适配", "prompt routes new products, old devices, engineering units, sponsorship, and controversy differently");
test.assertIncludes(mingmingLens, "观察 → 原因/考据 → 判断 → 然后下一个", "prompt preserves Luoluo's real spoken structure");
test.assertIncludes(mingmingLens, "声画互补", "prompt includes show-don't-repeat guidance");
test.assertIncludes(mingmingLens, "不要被夺舍", "prompt guards against performative imitation");
test.assertIncludes(mingmingLens, "〔待核：...〕", "prompt refuses invented uncertain facts");
test.assertIncludes(mingmingLens, "第一行用一个 Markdown H1 标题", "prompt requires a script title");
test.assertIncludes(mingmingLens, "正文必须按内容生成 Markdown 二级标题（##）", "prompt keeps section anchors for downstream tools");
test.assertIncludes(mingmingLens, "没有 ## 就是失败输出", "prompt makes generated section headings mandatory");
test.assertIncludes(mingmingLens, "不是口播里要念出来的标题", "prompt distinguishes workflow anchors from spoken section titles");
test.assertIncludes(mingmingLens, "不要沿用“序 / 末 / 浅粉色”", "prompt avoids article-like source headings");
test.assertIncludes(mingmingLens, "保留 4-7 个 ## 章节", "prompt preserves a usable section count");
test.assertIncludes(mingmingLens, "链接放评论区 / 这个来源我放简介 / 这里先看结论", "prompt converts raw links into video copy across topics");
test.assertIncludes(mingmingLens, "参数 -> 体验后果 -> 适合/不适合谁", "prompt keeps parameters in spoken form for any topic");
test.assertIncludes(mingmingLens, "好了，这次节目就到这里了，喜欢的话关注一下也是可以的，我们下次见", "prompt locks the requested ending");
test.assertIncludes(mingmingLens, "〔画面：", "prompt supports shootable visual beats");
test.assertNotIncludes(mingmingLens, "交稿前给自己用的镜子", "shared prompt no longer frames the tool as Aaron-only");
test.assertNotIncludes(mingmingLens, "交得更少、零压力", "shared prompt avoids Aaron-to-Luoluo handoff framing");
test.assertNotIncludes(mingmingLens, "这会给落落增加压力吗", "shared prompt avoids relationship-specific preflight language");
test.assertNotIncludes(mingmingLens, "Aaron 的 1-2 句核心句", "shared prompt does not privilege Aaron-only inputs");

test.assertIncludes(outlineClaim, 'mingming: "mingming_outline_running"', "long task status has a dedicated Mingming label");
test.assertIncludes(outlineClaim, "buildMingmingRewritePrompt", "Outline command uses the shared Mingming rewrite prompt");
test.assertNotIncludes(outlineClaim, "Aaron 写给落落的创作转换顾问", "old Aaron-only prompt was removed from Outline");
test.assertIncludes(persistenceStatus, '"outline-mingming": { label: t("outline"), windowName: "outline" }', "long task receipt opens the Outline window");
test.assertIncludes(outlineClaim, 'max_tokens: mode === "mingming" ? 5200 : undefined', "Mingming rewrite requests enough output budget for full spoken copy");
test.assertIncludes(outlineClaim, 'ai_system6_task_kind: mode === "mingming" ? "mingming_rewrite"', "Mingming rewrite identifies its task kind for model-specific tuning");
test.assertIncludes(outlineClaim, 'mode === "mingming" ? "mingming_outline_confirm"', "Mingming output is preview-confirmed before replacing the outline");
test.assertIncludes(outlineClaim, 'mode === "mingming" ? "mingming_outline_done"', "Mingming output has a dedicated completion status");

test.assertIncludes(chatMessages, 'if (/mingming/.test(kind)) return 5200;', "client model defaults give Mingming enough Qwen/DeepSeek output budget");
test.assertIncludes(chatMessages, 'const structuredTask = /mingming|docmap|outline', "DeepSeek v4 treats Mingming as a structured long-writing task");
test.assertIncludes(serverChat, 'if (/mingming/.test(kind))', "server-side Qwen tuning has a Mingming profile");
test.assertIncludes(serverChat, "defaultMaxTokens: 5200", "server-side Qwen Mingming profile has a full-script budget");
test.assertIncludes(serverChat, "topP: 0.78", "server-side Qwen Mingming profile has a dedicated sampling profile");
test.assertIncludes(serverChat, "presencePenalty: 1.35", "server-side Qwen Mingming profile avoids repetitive template drift");

test.assertIncludes(evalScript, "Mingming Outline practice bench", "practice script exists for prompt calibration");
test.assertIncludes(evalScript, "app/features/mingming-lens.js", "practice script reads the shared Mingming lens");
test.assertIncludes(evalScript, "SAMPLE_IPHONE_17E_INPUT", "practice script carries the iPhone 17e reference input");
test.assertIncludes(evalScript, "SAMPLE_OLD_DEVICE_INPUT", "practice script carries an old-device sample");
test.assertIncludes(evalScript, "SAMPLE_MEMORY_INPUT", "practice script carries a travel/memory sample");
test.assertIncludes(evalScript, "--sample", "practice script can switch calibration samples");
test.assertIncludes(evalScript, "old-device", "practice script exposes an old-device sample path");
test.assertIncludes(evalScript, "memory", "practice script exposes a non-product memory sample path");
test.assertIncludes(evalScript, "scoreMingmingOutput", "practice script scores generated output shape");
test.assertIncludes(evalScript, "noSourceHeadings", "practice script rejects copied source headings");
test.assertIncludes(evalScript, "generatedHeadingCount", "practice script requires enough self-generated ## headings");
test.assertIncludes(evalScript, "linksBecomeCommentArea", "practice script checks links are converted into video copy");
test.assertIncludes(evalScript, "oralTexture", "practice script checks the reference's casual spoken texture");
test.assertIncludes(evalScript, "noPolishedMaxims", "practice script rejects over-polished writerly maxims");
test.assertIncludes(evalScript, 'ai_system6_task_kind: "mingming_rewrite"', "practice script uses the same Mingming task kind");
test.assertIncludes(evalScript, "enable_thinking: false", "practice script disables Qwen thinking for visible-copy evaluation");
test.assertIncludes(evalScript, "max_tokens: 5200", "practice script requests full-script output budget");
test.assertIncludes(evalScript, "exactEnding", "practice script locks the requested Luoluo ending");
test.assertIncludes(evalScript, "LM Studio is not reachable", "practice script explains when the local model server is unavailable");
test.assertIncludes(packageJson, '"eval:mingming-outline": "node scripts/eval-mingming-outline.mjs"', "practice script is exposed as an npm command");
test.assertIncludes(iphone17eCorpus, "主摄 IMX982", "shared corpus uses the newest reference input camera details");

test.assertIncludes(zh, 'mingming_outline: "若是铭铭会怎么写"', "Chinese copy keeps the existing command name");
test.assertIncludes(en, 'mingming_outline: "What Would Mingming Write?"', "English copy is present");

test.finish();
