// The Project CD burn, driven through the app a person uses.
//
//   node tests/e2e/probe-project-cd-burn.spec.mjs
//
// The burn is an awaited operation: the pre-burn version history is written
// first, and the CD is written after it. The race that matters — a file taking
// the target's name while the burn waits — is held in
// tests/features/project-cd-burn-race.test.mjs, which can pause that wait. What
// a browser adds is the path itself: the same name burned twice has to leave one
// record carrying the newer body, and the writer has to see the CD item.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, createProject, dismissGuide, enterWritingStudio } from "./helpers.mjs";

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const problems = [];

try {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Burn Probe");

  const burn = (body, name) => page.evaluate(async ({ body, name }) => {
    const item = await burnMarkdownToProjectCd(body, name);
    return {
      returned: item ? { id: item.id, title: item.title, body: item.body } : null,
      onDisk: projectCdItems.map((entry) => ({ id: entry.id, title: entry.title, body: entry.body })),
    };
  }, { body, name });

  const first = await burn("first body", "Probe Article");
  console.log("first burn:", JSON.stringify(first));
  if (!first.returned) problems.push("the first burn did not land");
  if (first.onDisk.filter((item) => item.title === "Probe Article.md").length !== 1) {
    problems.push("the first burn did not leave exactly one file");
  }

  const second = await burn("second body", "Probe Article");
  console.log("second burn:", JSON.stringify(second));
  const named = second.onDisk.filter((item) => item.title === "Probe Article.md");
  if (named.length !== 1) problems.push(`burning one name twice left ${named.length} files`);
  if (named[0]?.body !== "second body") problems.push("the file does not carry the burn that landed last");
  if (named[0]?.id !== first.returned?.id) problems.push("the replacement did not keep the record's identity");

  // The writer has to see it: the CD window lists what was burned. That window
  // belongs to the writing workspace, so the desk has to be there first.
  await enterWritingStudio(page);
  await page.evaluate(() => {
    openWindow("projectCd");
    if (typeof renderProjectCd === "function") renderProjectCd();
  });
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => {
    const win = document.querySelector('[data-window="projectCd"]');
    return {
      visible: !!win && !win.classList.contains("is-hidden"),
      text: (win?.textContent || "").replace(/\s+/g, " ").slice(0, 120),
    };
  });
  console.log("project cd:", JSON.stringify(shown));
  if (!shown.visible || !shown.text.includes("Probe")) {
    problems.push("the Project CD window does not show the burned file");
  }

  if (problems.length) {
    console.error(`PROBLEM:\n${problems.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("probe: the burn lands once, replaces in place, and the CD shows it");
  }
} finally {
  await context.close();
  await browser.close();
  stopProcess(server);
}
