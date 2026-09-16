// The ClioTalk "Add…" menu, measured.
//
//   node tests/e2e/probe-compose-menu.spec.mjs
//
// Reported as "ClioTalk这里的排版明显不当", with a screenshot of one menu row
// wrapped to a character a line: the row is a two-column grid (34px icon +
// copy), and the one entry without artwork — Endfield story source — had its
// copy auto-placed into the icon column, so it stood 198px tall among 48px
// rows. This measures every row in both eras and fails if a row is not the
// height of one line or its text column has collapsed.

import { chromium } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide, openWindow } from "./helpers.mjs";

const MIN_COPY_WIDTH = 240;
const MAX_ROW_HEIGHT = 72;
const ERAS = ["classic", "liquid-glass"];

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const problems = [];

try {
  await bootApp(page);
  await dismissGuide(page);
  for (const era of ERAS) {
    await page.evaluate((name) => applyTheme(name), era);
    await page.evaluate(() => openWindow("assistant"));
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      if (document.querySelector("#compose-tools-menu")?.classList.contains("is-hidden")) {
        document.querySelector("#compose-tools-toggle")?.click();
      }
    });
    await page.waitForTimeout(200);
    const rows = await page.evaluate(() => [...document.querySelectorAll("#compose-tools-menu .compose-tools-general")].map((row) => {
      const copy = row.querySelector(".compose-tool-copy");
      const box = row.getBoundingClientRect();
      return {
        id: row.id || row.dataset.action || "(unnamed)",
        height: Math.round(box.height),
        copyWidth: Math.round(copy?.getBoundingClientRect().width || 0),
        icons: row.querySelectorAll(".sys-icon, .compose-tool-icon").length,
      };
    }));
    console.log(`${era}: ${rows.map((row) => `${row.id} ${row.height}px/${row.copyWidth}px`).join(", ")}`);
    if (!rows.length) problems.push(`${era}: the compose tools menu has no rows`);
    for (const row of rows) {
      if (row.height > MAX_ROW_HEIGHT) {
        problems.push(`${era}: ${row.id} stands ${row.height}px tall — its text is wrapping one character a line`);
      }
      if (row.copyWidth < MIN_COPY_WIDTH) {
        problems.push(`${era}: ${row.id} keeps only ${row.copyWidth}px for its text (${row.icons ? "icon" : "no icon"} row)`);
      }
    }
    await page.evaluate(() => document.querySelector("#compose-tools-toggle")?.click());
    await page.waitForTimeout(150);
  }

  if (problems.length) {
    console.error(`PROBLEM:\n${problems.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("probe: every compose menu row is one line tall with its own text column");
  }
} finally {
  await context.close();
  await browser.close();
  stopProcess(server);
}
