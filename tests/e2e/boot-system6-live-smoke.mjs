import { chromium, webkit } from "@playwright/test";
import {
  createProject,
  dismissGuide,
  openWindow,
  runAction,
} from "./helpers.mjs";

const baseURL = "https://boot-system6.pages.dev";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitReady(page) {
  await page.goto(`${baseURL}/`);
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
}

async function verifyDesktopFlow(browserType, name) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await waitReady(page);
  await dismissGuide(page);
  await createProject(page, "Live Boot Smoke");
  await runAction(page, "new-text-document");
  await openWindow(page, "teachText");
  await page.fill("#teachtext-body", "# Live smoke\n\nPersisted text.");
  await page.evaluate(async () => {
    if (typeof saveTextDocument === "function") {
      await saveTextDocument({ promptForFolder: false, revealInDocuments: false });
    }
  });
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  const persisted = await page.evaluate(() => chatFiles.some((file) => /Persisted text\./.test(file.body || "")));
  assert(persisted, "persisted document did not survive reload");

  await runAction(page, "set-theme-liquid-glass");
  await page.waitForFunction(() => document.body.dataset.theme === "liquid-glass", undefined, { timeout: 10_000 });
  assert(pageErrors.length === 0, `uncaught page errors: ${pageErrors.join(" | ")}`);

  const deep = await context.newPage();
  deep.on("pageerror", (error) => pageErrors.push(error.message));
  await deep.goto(`${baseURL}/?open=teachtext`);
  await deep.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  await deep.waitForFunction(() => {
    const win = document.querySelector('[data-window="teachText"]');
    return win && !win.classList.contains("is-hidden");
  }, undefined, { timeout: 20_000 });

  const game = await context.newPage();
  game.on("pageerror", (error) => pageErrors.push(error.message));
  await game.goto(`${baseURL}/?open=micropolis`);
  await game.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  await game.waitForFunction(() => {
    const win = document.querySelector('[data-window="micropolis"]');
    return win && !win.classList.contains("is-hidden") && !!win.querySelector("[data-micropolis-viewport]");
  }, undefined, { timeout: 45_000 });

  await context.close();
  await browser.close();
  assert(pageErrors.length === 0, `${name} had uncaught page errors: ${pageErrors.join(" | ")}`);
  console.log(`${name} live smoke passed`);
}

async function verifyMobileFlow(browserType, name) {
  const browser = await browserType.launch();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await waitReady(page);
  await page.waitForTimeout(800);
  const layout = await page.evaluate(() => ({
    ready: document.body.dataset.appReady,
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(layout.ready === "ready", "mobile desktop did not reach ready");
  assert(layout.scrollWidth <= layout.width + 2, `mobile layout overflows: ${JSON.stringify(layout)}`);
  assert(pageErrors.length === 0, `${name} mobile had page errors: ${pageErrors.join(" | ")}`);
  await context.close();
  await browser.close();
  console.log(`${name} mobile smoke passed`);
}

async function main() {
  await verifyDesktopFlow(chromium, "chromium");
  await verifyDesktopFlow(webkit, "webkit");
  await verifyMobileFlow(chromium, "chromium");
  await verifyMobileFlow(webkit, "webkit");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
