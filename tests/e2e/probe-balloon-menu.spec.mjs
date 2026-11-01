// A browser probe for one complaint: Balloon Help sitting on top of the menu it
// explains. Run it, read it, throw the invocation away.
//
//   node tests/e2e/probe-balloon-menu.spec.mjs
//
// It turns Balloon Help on, opens Image Prompt Studio, hovers the Style select
// (the control in the report, "为提示词选择默认或摄影风格。"), presses it to open
// the listbox, and measures whether the balloon covers the list. Old code: the
// balloon stays where it was placed and the list opens underneath it. Fixed
// code: the balloon stands down while its own panel is open and comes back when
// the panel closes.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide, openWindow, runAction } from "./helpers.mjs";

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
const problems = [];

const read = () => page.evaluate(() => {
  const win = document.querySelector('[data-window="imagePromptStudio"]');
  const balloon = document.querySelector("#balloon-help");
  const menu = win?.querySelector(".select-wrap.has-system-select > .system-select-menu");
  const button = win?.querySelector(".select-wrap.has-system-select > .system-select-button");
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  };
  const balloonRect = balloon && !balloon.classList.contains("is-hidden") ? rect(balloon) : null;
  const menuRect = rect(menu);
  let overlap = 0;
  if (balloonRect && menuRect) {
    const width = Math.min(balloonRect.right, menuRect.right) - Math.max(balloonRect.left, menuRect.left);
    const height = Math.min(balloonRect.bottom, menuRect.bottom) - Math.max(balloonRect.top, menuRect.top);
    overlap = width > 0 && height > 0 ? Math.round(width * height) : 0;
  }
  return {
    balloonVisible: Boolean(balloonRect),
    balloonRect,
    menuOpen: document.querySelector(".select-wrap.is-system-select-open") !== null,
    menuRect,
    overlap,
    button: rect(button),
  };
});

try {
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => {
    if (typeof setBalloonHelpEnabled === "function") setBalloonHelpEnabled(true, { announce: false, persist: false });
    else localStorage.setItem("ai-system6-balloon-help", "on");
  });
  await page.evaluate(() => ensureImagePromptStudioModule());
  await runAction(page, "open-image-prompt-studio");
  await openWindow(page, "imagePromptStudio");
  await page.waitForSelector("#ips-style", { timeout: 15_000 });
  // The reporter's sequence: the explanation is up on the control, and only
  // then does the list open under it. Hovering the native select first is how
  // that happens — Balloon Help arrives on the control as it stands, and the
  // harness conversion can land while it is still showing.
  await page.locator("#ips-style").hover();
  await page.waitForFunction(() => {
    const balloon = document.querySelector("#balloon-help");
    return balloon && !balloon.classList.contains("is-hidden");
  }, undefined, { timeout: 10_000 }).catch(() => {});
  const preConversion = await read();
  console.log("native: ", JSON.stringify(preConversion));
  if (!preConversion.balloonVisible) problems.push("the balloon never appeared on the control, so this probe proves nothing");

  // The window injects its own markup after boot, and this module does not ask
  // for the select harness; call it the way another window's render does, so
  // the probe drives the control the reporter photographed.
  await page.evaluate(() => initSystemSelectControls());
  await page.waitForSelector('[data-window="imagePromptStudio"] .select-wrap.has-system-select > .system-select-button', { timeout: 10_000 });

  // Hover the visible control the way a person does, then open its list.
  const button = page.locator('[data-window="imagePromptStudio"] .select-wrap.has-system-select > .system-select-button').first();
  await button.hover();
  await page.waitForFunction(() => {
    const balloon = document.querySelector("#balloon-help");
    return balloon && !balloon.classList.contains("is-hidden");
  }, undefined, { timeout: 10_000 }).catch(() => {});
  const hovered = await read();
  console.log("hovered:", JSON.stringify(hovered));
  if (!hovered.balloonVisible) {
    problems.push("the visible (converted) control carries no explanation — its balloon keys stayed on the hidden native select");
  }

  await button.click();
  await page.waitForFunction(() => document.querySelector(".select-wrap.is-system-select-open") !== null, undefined, { timeout: 10_000 });
  await page.waitForTimeout(250);
  const open = await read();
  console.log("open:   ", JSON.stringify(open));
  if (!open.menuOpen) problems.push("the listbox did not open");
  if (!open.menuRect || open.menuRect.height < 20) problems.push("the open listbox has no rows to cover");
  if (open.balloonVisible && open.overlap > 0) {
    problems.push(`the balloon covers ${open.overlap}px² of the open list`);
  }

  // Closing the panel brings the balloon back for the object still under the
  // pointer — standing down must not mean disappearing for good.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".select-wrap.is-system-select-open") === null, undefined, { timeout: 10_000 });
  await page.mouse.move(0, 0);
  await button.hover();
  await page.waitForTimeout(250);
  const closed = await read();
  console.log("closed: ", JSON.stringify(closed));
  if (!closed.balloonVisible) problems.push("standing down for the list lost the explanation — it never came back");

  if (problems.length) {
    console.error(`PROBLEM:\n${problems.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("probe: the balloon stands down for its own list and returns after it closes");
  }
} finally {
  await context.close();
  await browser.close();
  stopProcess(server);
}
