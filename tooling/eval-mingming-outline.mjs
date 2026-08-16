#!/usr/bin/env node

// Mingming Outline practice bench.
// Scores whether an Aaron-style bullet outline became Luoluo/Mingming-shaped
// spoken copy while keeping generated ## anchors for AI System 6's draft flow.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const iphone17eDemoCorpus = require(join(root, "apps/desktop/app/data/iphone-17e-demo-corpus.js"));
const defaultLmStudioUrl = "http://127.0.0.1:1234/v1/chat/completions";

export const SAMPLE_IPHONE_17E_INPUT = iphone17eDemoCorpus.aaronBulletInput;
export const REFERENCE_OUTPUT = iphone17eDemoCorpus.mingmingReferenceOutput;
export const SAMPLE_OLD_DEVICE_INPUT = `# iPod nano 7 复盘素材

## 主题
- iPod nano 7 是最后一代 nano，2012 年发布，后来 iPod 被流媒体和 iPhone 挤出主流。
- 它像一台装修得再豪华的蒸汽火车，漂亮、精致，但时代已经不需要它承担原来的功能。
- 重点不是怀旧滤镜，而是实体音乐和流媒体的差别：音乐掌握在自己手中才是真正的拥有。

## 可拍画面
- 拿出一台成色很好的 nano 7，滑动 Cover Flow / 播放本地曲库。
- 对比今天手机里的流媒体 App，某些歌会下架、版本会替换。
- 展示机身、按键、Lightning、蓝牙和小屏幕。

## 判断
- 它今天不适合作为主力播放器，但很适合作为赛博文玩和时间胶囊。
- 缺点要保留：小屏幕、老电池、同步麻烦、今天很多人不会真的这么用。`;
export const SAMPLE_MEMORY_INPUT = `# 七里香圣地巡礼素材

## 主题
- 不是评测产品，是去一个和周杰伦《七里香》有关的地方。
- 冬天去，现场没有夏天 MV 那么绿，所以后期把颜色稍微往夏天调。
- 核心不是“我去了哪里”，而是小时候听这首歌的感觉突然被拉回来。

## 可拍画面
- 路牌、街角、树影、老建筑细节。
- 拿手机对照旧 MV 画面，找到相似构图。
- 走路、停下、听歌，不需要堆参数。

## 判断
- 这类片子不要硬升华，也不要写成旅游攻略。
- 结尾停在“我真的很开心能站在那个夏天里”这种朴素感受就够了。`;

const requiredTokens = [
  "浅粉色",
  "波奇酱",
  "KTV",
  "eSIM",
  "MagSafe",
  "Air",
  "15W",
  "Qi2",
  "256",
  "C1X",
  "A19",
  "IMX982",
  "1/2.55",
  "0.7μm",
  "f/1.6",
  "IMX904",
  "1/1.59",
  "终末地",
  "PWM",
  "AR",
  "超瓷晶",
  "用脚变焦",
  "DAZZ",
  "Project Indigo",
  "Solos",
  "iPod nano 7",
  "iPhone 12",
  "NFC",
  "DP 输出",
  "UWB",
  "60Hz",
  "国补",
];

const sourceHeadings = new Set(["序", "浅粉色", "eSIM", "相比 16e，苹果回去认真改了一版", "性能和手感", "用脚变焦", "一堆小彩蛋", "末"]);
const oralTextureTokens = ["诶", "就是", "不过", "所以", "要么", "挺", "有点", "这就够了", "没什么道理"];
const forbiddenPhrases = ["本期我们来", "接下来我们", "下面我们说", "首先我们", "本文", "这篇文章"];
const polishedPhrases = ["早没用了，但那一下，你还是会停一停", "场景一窄就狼狈", "不是不能用，是场景一窄就狼狈"];
const exactEnding = "好了，这次节目就到这里了，喜欢的话关注一下也是可以的，我们下次见。";

// The contract is evaluation baseline, not a runtime prompt, so it is read
// from the fixture rather than scraped out of a shipping module with a regex.
function extractMingmingInstructions() {
  const source = readFileSync(join(root, "tests/fixtures/mingming-style-contract.txt"), "utf8");
  return source.replace(/^<!--[\s\S]*?-->\n?/, "").trim();
}

export function buildMingmingPracticePrompt(input = SAMPLE_IPHONE_17E_INPUT) {
  return `你是 AI System 6 的「若是铭铭会怎么写」改写器。请根据下面材料，直接生成一篇落落频道里能拍、能念、能成立的 B 站口播稿。

${extractMingmingInstructions()}

输出格式：
- 第一行用一个 Markdown H1 标题，标题可以有落落式趣味和本期核心对象。
- 正文必须按内容生成 Markdown 二级标题（##），给章节草稿和审校台作为章节锚点。
- 即使参考样例或目标口播看起来是连续正文，实际返回也必须插入自生成的 ## 章节标题；没有 ## 就是失败输出。
- 这些 ## 是软件里的章节锚点，不是口播里要念出来的标题；标题服务后续工作流，正文仍然像自然说话。
- 二级标题要短、具体、服务口播流程；不要沿用“序 / 末 / 浅粉色”这类文章式或原始占位标题。
- 每个 ## 下面用自然段写口播，不要用条目清单。
- 可以穿插少量画面提示，格式为〔画面：……〕。画面提示要服务于拍摄，不要泛泛说明。
- 保留 4-7 个 ## 章节，让后续章节草稿、审校台和章节级检查能继续工作。
- 结尾使用落落式收束：“好了，这次节目就到这里了，喜欢的话关注一下也是可以的，我们下次见。”

改写要求：
- 只输出改写后的完整文案，不要输出大纲表、交接清单、分析报告、修改说明或多版本。
- 第一段就把最抓人的点、核心判断和态度说出来；不要先解释这是哪一章。
- 中段把材料里的真实体验、限制、意外发现和可拍画面串成“然后我拿它试了一下”的口播流。
- 链接、快捷指令、App、论文、网页、产品页等不要原样展开；改成视频里观众能听懂的交代方式，例如“链接放评论区 / 这个来源我放简介 / 这里先看结论”。
- 结尾要回答题材自己的核心判断：值不值、该不该做、适合谁、为什么值得存在、还有什么遗憾；再收回到材料里最有记忆点的意象或动作。
- 开头 2-4 句内给出判断或最强反差，不能文学铺垫。
- 句子短，像说话；多用“然后 / 所以 / 不过 / 其实 / 诶 / 哦对”，但不要每句硬塞。
- 允许轻微口水和重复，允许“这个东西它”“这部分其实”“怎么说呢”这种真实口播冗余；不要把每句都修到书面上的最佳状态。
- 信息点按观众兴趣排序：颜色/价格/争议/最好玩的画面点先行，参数和背景后置或压缩。
- 主动保留 1-2 个缺点或遗憾，保持真诚，不要写成广告。
- 升华最多一次，而且要从材料里自然长出来。

QUESTION SHEET:
No Question Sheet provided.

READER CLIPS:
No Reader clips saved yet.

PROJECT CONTEXT:
No relevant project context selected yet.

CURRENT OUTLINE:
${input}`;
}

function markdownHeadings(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => ({ level: match[1].length, title: match[2].trim() }));
}

function missingTokens(markdown) {
  return requiredTokens.filter((token) => !String(markdown || "").includes(token));
}

function oralTextureCount(markdown) {
  const text = String(markdown || "");
  return oralTextureTokens.filter((token) => text.includes(token)).length;
}

function firstBodyText(markdown) {
  return String(markdown || "")
    .replace(/^#\s+.+\n+/, "")
    .replace(/^##\s+.+\n+/m, "")
    .trim()
    .slice(0, 180);
}

export function scoreMingmingOutput(markdown) {
  const text = String(markdown || "").trim();
  const headings = markdownHeadings(text);
  const h1Count = headings.filter((item) => item.level === 1).length;
  const h2s = headings.filter((item) => item.level === 2);
  const missing = missingTokens(text);
  const oralCount = oralTextureCount(text);
  const checks = [
    {
      key: "hasH1",
      ok: h1Count === 1 && headings[0]?.level === 1,
      detail: "exactly one Markdown H1 title at the top",
    },
    {
      key: "generatedHeadingCount",
      ok: h2s.length >= 4 && h2s.length <= 7,
      detail: `${h2s.length} generated ## headings; expected 4-7`,
    },
    {
      key: "noSourceHeadings",
      ok: h2s.every((item) => !sourceHeadings.has(item.title)),
      detail: "## headings should be generated anchors, not copied source placeholders",
    },
    {
      key: "spokenOpening",
      ok: /今年这台 (?:iPhone )?17e|本来.*没兴趣|浅粉色/.test(firstBodyText(text)),
      detail: "opening should enter the reference speaking state immediately",
    },
    {
      key: "noBulletBody",
      ok: !/^\s*[-*]\s+/m.test(text),
      detail: "body should be spoken paragraphs, not Aaron bullet lists",
    },
    {
      key: "hasVisualBeats",
      ok: /〔画面：[^〕]+〕/.test(text),
      detail: "video copy should contain shootable visual beats",
    },
    {
      key: "linksBecomeCommentArea",
      ok: !/https?:\/\//.test(text) && /评论区/.test(text),
      detail: "raw links should become comment-area video copy",
    },
    {
      key: "coreFactsKept",
      ok: missing.length <= 2,
      detail: missing.length ? `missing tokens: ${missing.join(", ")}` : "core tokens preserved",
    },
    {
      key: "oralTexture",
      ok: oralCount >= 5,
      detail: `${oralCount} Luoluo oral texture markers; expected at least 5`,
    },
    {
      key: "noPolishedMaxims",
      ok: polishedPhrases.every((phrase) => !text.includes(phrase)),
      detail: "avoid over-polished writerly maxims from the earlier draft shape",
    },
    {
      key: "payoffConnection",
      ok: /Air 电池能吸上/.test(text) && /皮套.*装进|刚好装下/.test(text) && /摄像头(?:模组)?小|小摄像头/.test(text),
      detail: "Air battery and iPhone 12 sleeve payoffs should connect through the small camera",
    },
    {
      key: "cameraScene",
      ok: /用脚变焦/.test(text) && /贴墙|后退/.test(text),
      detail: "camera section should show the foot-zoom scene, not only state the limitation",
    },
    {
      key: "closingImage",
      ok: /值不值/.test(text) && /60Hz/.test(text) && /国补/.test(text) && /KTV/.test(text) && /波奇酱/.test(text),
      detail: "ending should answer value, then return to the pink/KTV/Bocchi image",
    },
    {
      key: "noArticleTransitions",
      ok: forbiddenPhrases.every((phrase) => !text.includes(phrase)),
      detail: "avoid article or presenter-outline transition phrases",
    },
    {
      key: "exactEnding",
      ok: text.endsWith(exactEnding),
      detail: "must end with the requested Luoluo closing line",
    },
  ];
  const passed = checks.filter((check) => check.ok).length;
  return {
    passed,
    total: checks.length,
    score: Math.round((passed / checks.length) * 100),
    checks,
    headings: h2s.map((item) => item.title),
  };
}

function formatScoreReport(label, result) {
  const lines = [
    `# ${label}`,
    `score: ${result.score}% (${result.passed}/${result.total})`,
    `headings: ${result.headings.join(" / ") || "(none)"}`,
    "",
  ];
  result.checks.forEach((check) => {
    lines.push(`${check.ok ? "OK" : "NO"}  ${check.key}: ${check.detail}`);
  });
  return lines.join("\n");
}

async function runLmStudio(prompt = buildMingmingPracticePrompt()) {
  const url = process.env.LM_STUDIO_URL || defaultLmStudioUrl;
  const model = process.env.LM_STUDIO_MODEL || "local-model";
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.45,
      max_tokens: 5200,
      top_p: 0.78,
      top_k: 20,
      min_p: 0,
      presence_penalty: 1.35,
      enable_thinking: false,
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false },
      ai_system6_task_kind: "mingming_rewrite",
      stream: false,
    }),
  });
  } catch (error) {
    const detail = error?.message ? ` (${error.message})` : "";
    throw new Error(`LM Studio is not reachable at ${url}${detail}. Start LM Studio's local server, then rerun this script with --run.`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`LM Studio request failed: ${response.status} ${detail}`);
  }
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const sampleIndex = args.indexOf("--sample");
  const sampleName = sampleIndex >= 0 ? args[sampleIndex + 1] : "";
  const sample = sampleName === "old-device"
    ? SAMPLE_OLD_DEVICE_INPUT
    : sampleName === "memory"
      ? SAMPLE_MEMORY_INPUT
      : SAMPLE_IPHONE_17E_INPUT;
  if (args.includes("--prompt")) {
    process.stdout.write(buildMingmingPracticePrompt(sample));
    return;
  }

  let label = "";
  let output = "";
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0) {
    const filePath = args[outputIndex + 1];
    if (!filePath) throw new Error("--output requires a file path");
    label = resolve(filePath);
    output = readFileSync(label, "utf8");
  } else if (args.includes("--run")) {
    label = "LM Studio output";
    output = await runLmStudio(buildMingmingPracticePrompt(sample));
    console.log(output);
    console.log("\n---\n");
  } else {
    console.log(`# Embedded reference output\nchars: ${REFERENCE_OUTPUT.length}\nopening: ${REFERENCE_OUTPUT.slice(0, 80)}`);
    console.log("\nUse --run to score live model output, or --output <file> to score a generated draft with workflow headings.");
    return;
  }

  const result = scoreMingmingOutput(output);
  console.log(formatScoreReport(label, result));
  if (strict && result.passed !== result.total) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
