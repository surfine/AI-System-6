import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const screenshotDir = "/Users/aaron/AI System 6/drafts";

function visibleElement(selector) {
  return Array.from(document.querySelectorAll(selector)).find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0;
  });
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

async function modalText(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("[role=dialog], .system-modal, .modal, .dialog, .alert"))
      .map((el) => el.innerText || "")
      .filter(Boolean)
      .join("\n\n");
  });
}

async function acceptModal(page) {
  return page.evaluate(() => {
    const defaultButton = document.querySelector("#system-modal-yes");
    if (defaultButton) {
      const rect = defaultButton.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        defaultButton.click();
        return true;
      }
    }
    const candidates = Array.from(document.querySelectorAll("button"));
    const button = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.value || "").trim();
      return rect.width > 0 && rect.height > 0 && ["好", "OK"].includes(text);
    });
    if (!button) return false;
    button.click();
    return true;
  });
}

async function waitForDraftResult(page, sectionName) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180000) {
    const text = await modalText(page);
    if (text.includes("AI 起草结果")) return text;
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for AI draft result: ${sectionName}`);
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
      bodyPreview: body.slice(0, 180),
    };
  });
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0];
await page.bringToFront();

fs.mkdirSync(screenshotDir, { recursive: true });

console.log("Accepting existing first AI draft result...");
if ((await modalText(page)).includes("AI 起草结果")) {
  if (await acceptModal(page)) {
    await page.waitForTimeout(1000);
  } else {
    console.log("Existing result text has no visible OK button; continuing.");
  }
} else {
  console.log("No existing first-section modal; continuing from current draft state.");
}
await page.screenshot({ path: `${screenshotDir}/ui-step-06-section-01-accepted.png`, fullPage: true });
const currentAfterInitialAccept = await currentSection(page);
console.log(JSON.stringify(currentAfterInitialAccept));

for (let index = currentAfterInitialAccept.index + 1; index <= currentAfterInitialAccept.total; index += 1) {
  await clickVisible(page, 'button[data-action="next-section-draft"]', "next section");
  await page.waitForTimeout(800);
  const before = await currentSection(page);
  console.log(`Drafting section ${index}/8: ${before.title || before.label}`);
  await clickVisible(page, 'button[data-action="draft-current-section"]', "AI draft");
  const result = await waitForDraftResult(page, before.title || before.label);
  console.log(`Received section ${index}/8 result, ${result.length} chars in modal.`);
  if (!(await acceptModal(page))) throw new Error(`Could not accept modal for section ${index}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${screenshotDir}/ui-step-06-section-${String(index).padStart(2, "0")}-accepted.png`, fullPage: true });
  console.log(JSON.stringify(await currentSection(page)));
}

await clickVisible(page, 'button[data-action="open-teachtext-manuscript"]', "send to TeachText");
await page.waitForTimeout(2000);
await page.screenshot({ path: `${screenshotDir}/ui-step-07-teachtext-final.png`, fullPage: true });

const finalState = await page.evaluate(() => {
  const textareas = Array.from(document.querySelectorAll("textarea")).map((el) => ({
    id: el.id,
    value: el.value || "",
    visible: (() => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })(),
  }));
  const teach = textareas.find((item) => item.id === "teachtext-body")
    || textareas.find((item) => item.visible && item.value.includes("iPhone 17e"))
    || textareas.find((item) => item.value.includes("iPhone 17e"));
  return {
    bodyText: document.body.innerText.slice(0, 3000),
    teachTextId: teach?.id || "",
    teachTextChars: teach?.value.length || 0,
    teachTextPreview: teach?.value.slice(0, 1200) || "",
  };
});

console.log("FINAL_STATE " + JSON.stringify(finalState, null, 2));
await browser.close();
