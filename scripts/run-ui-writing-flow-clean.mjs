import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const screenshotDir = "/Users/aaron/AI System 6/drafts";
const sourcePath = "/Users/aaron/Desktop/20260601 - iPhone 17e (Aaron).txt";

const questionSheet = `# iPhone 17e 视频文稿任务

## 写作目标
- 把用户给的 iPhone 17e 大纲扩写成一篇中文视频口播稿。
- 这不是说明文、散文、论文或营销稿；它应该像科技视频里的自然口播。
- 每一节只写当前章节正文，不要输出本章节标题，不要输出 #、## 或 ### 标题。
- 不要泛泛讨论“浅粉色”“eSIM”等概念，所有句子都必须回到 iPhone 17e 这台机器。
- 不要编造大纲没有给出的参数、价格、功能或体验。

## 口吻
- 保留 Aaron 的个人口吻：轻松、吐槽、带一点宅梗，但不要过度用力。
- 保留这些梗和表达：波奇酱、老夫的少女心、iPhone 不能没有 MagSafe 就像波奇酱不能没有吉他、用脚变焦、赛博文玩、粉色 Neo、16e 像没写完的作业。
- 使用短句和口播节奏；不要写成发布会文案，不要写成散文。

## 结构
- 开场要有反差：本来觉得 17e 无聊，但浅粉色让人多看一眼。
- 中段依次讲浅粉色、eSIM、相比 16e 的补课、性能手感、相机、小彩蛋。
- 结尾给购买建议：本身不错，但加 1000 可上 17；国补 3500 档有竞争力；海外/备用机/家人换机更适合。

## 事实边界
- 只使用大纲提供的信息。
- 如果某个点不确定，不要扩展成新的事实。
- 不要把“浅粉色”写成抽象颜色散文；要写它在 17e 上为什么吸引人。`;

function normalizeOutline(text) {
  return text.replace(
    "🌵 写在前面：这是大纲，用来涵盖信息点的，不是稿子，不能用视频稿的标准来检视！",
    "> 来源说明：这是用户提供的大纲，用来涵盖信息点。"
  );
}

async function clickVisible(page, selector, label) {
  const clicked = await page.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll(sel)).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0;
    });
    if (!el) return false;
    el.click();
    return true;
  }, selector);
  if (!clicked) throw new Error(`Could not find visible ${label || selector}`);
}

async function closeAnyResultModal(page) {
  await page.evaluate(() => {
    const cancel = document.querySelector("#system-modal-cancel");
    const rect = cancel?.getBoundingClientRect();
    if (cancel && rect && rect.width > 0 && rect.height > 0) cancel.click();
  });
  await page.waitForTimeout(500);
}

async function acceptResultModal(page, sectionNumber) {
  const accepted = await page.evaluate(() => {
    const button = document.querySelector("#system-modal-yes");
    const rect = button?.getBoundingClientRect();
    if (!button || !rect || rect.width <= 0 || rect.height <= 0) return false;
    button.click();
    return true;
  });
  if (!accepted) throw new Error(`Could not accept result modal for section ${sectionNumber}`);
  await page.waitForFunction(() => {
    const button = document.querySelector("#system-modal-yes");
    const rect = button?.getBoundingClientRect();
    return !button || !rect || rect.width <= 0 || rect.height <= 0;
  }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function waitForVisibleDraftResult(page, sectionNumber) {
  await page.waitForFunction(() => {
    const text = Array.from(document.querySelectorAll("[role=dialog], .system-modal, .modal, .dialog, .alert"))
      .map((el) => el.innerText || "")
      .join("\n");
    const button = document.querySelector("#system-modal-yes");
    const rect = button?.getBoundingClientRect();
    return text.includes("AI 起草结果") && button && rect && rect.width > 0 && rect.height > 0;
  }, null, { timeout: 240000 });
  const modalChars = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[role=dialog], .system-modal, .modal, .dialog, .alert"))
      .map((el) => el.innerText || "")
      .join("\n").length;
  });
  console.log(`Received visible draft result for section ${sectionNumber}, modal ${modalChars} chars.`);
}

async function currentSection(page) {
  return page.evaluate(() => {
    const label = (document.body.innerText || "").split("\n").find((line) => line.startsWith("正在编辑 ")) || "";
    const match = label.match(/正在编辑\s+(\d+)\/(\d+)：/);
    const title = document.querySelector("#draft-title")?.value || "";
    const body = document.querySelector("#draft-body")?.value || "";
    return {
      label,
      index: match ? Number(match[1]) : 1,
      total: match ? Number(match[2]) : 8,
      title,
      chars: body.length,
      preview: body.slice(0, 160),
    };
  });
}

fs.mkdirSync(screenshotDir, { recursive: true });
const outline = normalizeOutline(fs.readFileSync(sourcePath, "utf8"));

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0];
await page.bringToFront();

await closeAnyResultModal(page);

page.once("dialog", async (dialog) => {
  console.log(`Accepting project prompt: ${dialog.message()}`);
  await dialog.accept(`iPhone 17e Flow ${new Date().toISOString().slice(11, 19)}`);
});

await clickVisible(page, "#project-switcher-button", "project switcher");
await page.waitForTimeout(300);
await clickVisible(page, 'button[data-action="new-project-disk"]', "new project disk");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${screenshotDir}/ui-clean-01-new-project.png`, fullPage: true });

await clickVisible(page, 'button[data-action="open-question-sheet"]', "question sheet");
await page.waitForTimeout(800);
await page.fill("#question-sheet-body", questionSheet);
await page.waitForTimeout(500);
await page.screenshot({ path: `${screenshotDir}/ui-clean-02-question-sheet.png`, fullPage: true });
console.log("Question Sheet filled.");

await clickVisible(page, 'button[data-action="open-outline"]', "outline");
await page.waitForTimeout(800);
await page.fill("#outline-content", outline);
await page.waitForTimeout(500);
await page.screenshot({ path: `${screenshotDir}/ui-clean-03-outline.png`, fullPage: true });
console.log("Outline filled.");

await clickVisible(page, 'button[data-action="advance-outline-to-drafts"]', "advance to drafts");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${screenshotDir}/ui-clean-04-section-drafts-seeded.png`, fullPage: true });

let section = await currentSection(page);
console.log(`Seeded drafts: ${JSON.stringify(section)}`);

for (let i = section.index; i <= section.total; i += 1) {
  section = await currentSection(page);
  console.log(`Drafting ${section.index}/${section.total}: ${section.title}`);
  await clickVisible(page, 'button[data-action="draft-current-section"]', "AI draft current section");
  await waitForVisibleDraftResult(page, section.index);
  await acceptResultModal(page, section.index);
  section = await currentSection(page);
  console.log(`Accepted ${section.index}/${section.total}: ${section.title}, ${section.chars} chars.`);
  await page.screenshot({ path: `${screenshotDir}/ui-clean-05-section-${String(section.index).padStart(2, "0")}.png`, fullPage: true });
  if (section.index < section.total) {
    await clickVisible(page, 'button[data-action="next-section-draft"]', "next section");
    await page.waitForTimeout(900);
  }
}

await clickVisible(page, 'button[data-action="open-teachtext-manuscript"]', "send to TeachText");
await page.waitForTimeout(2000);
await page.screenshot({ path: `${screenshotDir}/ui-clean-06-teachtext.png`, fullPage: true });

const finalState = await page.evaluate(() => {
  const teach = document.querySelector("#teachtext-body");
  return {
    bodyText: document.body.innerText.slice(0, 3000),
    teachTextChars: teach?.value.length || 0,
    teachTextPreview: teach?.value.slice(0, 1600) || "",
  };
});

fs.writeFileSync(`${screenshotDir}/ai-system-6-ui-generated-iphone-17e.md`, finalState.teachTextPreview);
console.log("FINAL_STATE " + JSON.stringify(finalState, null, 2));
await browser.close();
