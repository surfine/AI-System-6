#!/usr/bin/env node
// Fresh-boot smoke for the ClioWorks surfaces (owner ruling D4: a tool, run on
// demand, NOT in the release gate — verify-release*.mjs must never reference
// this file; tests/features/clioworks-smoke-tool.test.mjs holds that line).
//
// Contracts read source and run code in a vm; they never boot the desk, which
// is how 22 green contracts once left four surfaces broken in a fresh browser.
// This tool boots the real desk in headless Chromium with a fresh context
// (zh-CN), puts real-corpus files on the Project Hard Disk through the
// product's own functions, drives each surface through its own menu commands,
// and asserts something VISIBLE per step (the evaluation walk in
// internal/design-proposals/2026-10-29-clioworks-second-draft/ taught the
// assertions: blank chart preview, 整理 stuck on its loading note, a
// mail-merge radio without text, no pptx 放映, a find windoid that says
// 「找不到」 before the writer typed).
//
// The desk must already be running (the writer's own `npm start`; this tool
// never touches a user profile or the user's data — everything lives in a
// throwaway browser context):
//
//   npm start                          # in another terminal, or:
//   npm run build:app && node apps/server/server.js
//   node tooling/clioworks-smoke.mjs              # every scene
//   node tooling/clioworks-smoke.mjs write reader # named scenes, one at a time
//
// APP_URL overrides the desk address (default http://localhost:4173/).
// Screenshots + report.json land in dist/smoke/clioworks-<timestamp>/ and the
// exit code is non-zero when any step's assertion fails, one line per failure.

import { chromium } from "playwright";
import { stubLocalModels } from "./lib/stub-local-models.mjs";
import { MODAL_RACE_MS, failureLine, parseSceneArg, planFor } from "./lib/clioworks-smoke-plan.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = join(ROOT, "tests", "fixtures");
const APP_URL = process.env.APP_URL || "http://localhost:4173/";
const REFUSAL_TEXT = "当前窗口或所选项目无法使用此命令";
const BOOT_TIMEOUT_MS = 60000;
// Per-kind settle time before a step's assertion runs (a command's own race
// apart): the desk needs a beat to render what the command asked for.
const SETTLE_MS = { place: 3000, command: 1200, eval: 2000 };

const DESKTOP_CONTEXT = Object.freeze({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: "zh-CN",
  reducedMotion: "reduce",
});
const PHONE_CONTEXT = Object.freeze({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
  reducedMotion: "reduce",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});

/* ------------------------------------------------------- the fixture server */

/** A free loopback port, the way a tool that owns its server picks one. */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

/** Serves tests/fixtures/ (the real corpus) with CORS, so the desk's own page
 * can fetch a corpus file the way the tool's evaluate blocks do. */
function startFixtureServer(port) {
  const MIME = { ".pdf": "application/pdf", ".docx": "application/octet-stream", ".xlsx": "application/octet-stream", ".pptx": "application/octet-stream" };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const wanted = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    const target = resolve(FIXTURE_ROOT, wanted);
    if (!target.startsWith(FIXTURE_ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const bytes = readFileSync(target);
      res.writeHead(200, {
        "content-type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
        "access-control-allow-origin": "*",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404, { "access-control-allow-origin": "*" }).end("not found");
    }
  });
  return new Promise((ready) => server.listen(port, "127.0.0.1", () => ready(server)));
}

/* ------------------------------------------------------------ page helpers */

async function deskIsUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Boot the desk and close the first-run helpers the way a writer would. */
async function bootDesk(page) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const boot = document.getElementById("boot-screen");
    return !boot || boot.hidden || boot.classList.contains("is-done")
      || getComputedStyle(boot).display === "none" || getComputedStyle(boot).opacity === "0";
  }, null, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    for (const w of document.querySelectorAll(".window:not(.is-hidden)")) {
      if (["guide", "about"].includes(w.dataset.window)) w.querySelector(".close-box")?.click();
    }
  });
}

/**
 * One step's visible assertion, evaluated in the page. Everything here reads
 * the DOM the writer would see: the front window, matched elements, their text.
 */
async function runAssertion(page, assertion) {
  return page.evaluate((a) => {
    const problems = [];
    const active = document.querySelector(".window.is-active");
    if (a.front && (!active || active.dataset.window !== a.front)) {
      problems.push(`前台窗口是 ${active ? active.dataset.window : "无"}，要 ${a.front}`);
    }
    if (a.absent && document.querySelector(a.absent)) problems.push(`${a.absent} 仍然可见`);
    const found = [...document.querySelectorAll(a.find)];
    const want = a.min || 1;
    if (found.length < want) {
      problems.push(`${a.find} 只匹配 ${found.length} 个，要 ≥ ${want}`);
    } else {
      const texts = found.map((node) => String(node.textContent || "").trim());
      // 「出现了」reads any of the matches; 「还没写东西」reads every one.
      if (a.empty && texts.some((text) => text)) problems.push(`${a.find} 写着「${texts.find((text) => text).slice(0, 40)}」，还没查询时应该为空`);
      if (a.text && !texts.some((text) => text.includes(a.text))) problems.push(`${a.find} 没有「${a.text}」（得到「${texts[0].slice(0, 40)}」）`);
      if (a.pattern && !texts.some((text) => new RegExp(a.pattern).test(text))) problems.push(`${a.find} 不满足 /${a.pattern}/（得到「${texts[0].slice(0, 40)}」）`);
    }
    return { ok: !problems.length, detail: problems.join("; ") };
  }, assertion);
}

/** How much the desk has on record before a step: notifications only —
 * page errors are tracked on the page object itself. */
async function notificationCount(page) {
  return page.evaluate(() => (typeof systemNotifications === "undefined" ? 0 : systemNotifications.length));
}

/** A refusal the step added: 「当前窗口或所选项目无法使用此命令」 in the
 * notification center means the command stood down instead of doing its work. */
async function refusalsAddedByStep(page, before) {
  return page.evaluate((snapshotCount) => {
    const list = typeof systemNotifications === "undefined" ? [] : systemNotifications;
    const fresh = list.slice(0, Math.max(0, list.length - snapshotCount));
    return fresh.filter((n) => n.messageKey === "balloon_disabled_menu_context"
      || String(n.message || "").includes("当前窗口或所选项目无法使用此命令")).length;
  }, before);
}

/* ---------------------------------------------------------------- actions */

/** Put a corpus file on the Project Hard Disk with the product's own
 * functions, then open it the way the writer would. */
async function placeFile(page, step, origin) {
  await page.evaluate(async ({ file, fixtureOrigin }) => {
    const bytes = new Uint8Array(await (await fetch(`${fixtureOrigin}/${file.rel}`)).arrayBuffer());
    await ensureNativeBinariesModule();
    if (typeof ensureClioWorksLedgerModule === "function") await ensureClioWorksLedgerModule();
    const binaries = window.AISystem6NativeBinaries;
    const item = await binaries.createProjectDocument({ projectId: activeProjectId, name: file.name, format: file.format, bytes });
    if (typeof binaries.refreshLinkedReference === "function") {
      try { await binaries.refreshLinkedReference(item); } catch { /* a file with no reference to refresh */ }
    }
    if (typeof renderDocuments === "function") renderDocuments();
    await window.AISystem6ClioWorks.openNativeDocument(item, { intent: "open" });
    return { id: item.id, name: item.name };
  }, { file: step.file, fixtureOrigin: origin });
}

/** A menu command resolves only when the writer answers its modal, so it is
 * never awaited: race it (the plan's MODAL_RACE_MS) and read what appeared. */
async function runCommand(page, step) {
  await page.evaluate(async ({ id, raceMs }) => {
    const pending = handleAction(id);
    await Promise.race([pending, new Promise((done) => setTimeout(done, raceMs))]);
    return "ok";
  }, { id: step.command, raceMs: MODAL_RACE_MS });
}

const SCENE_EVALS = {
  /** No action: the step only reads what the previous one left on screen. */
  noop: async () => {},

  /** S3: the page view's first screen — page 1's box lies wholly inside the
   * scroller (a whole page, not a page width cut off at the bottom). Marks the
   * scroller for the step's assertion; the numbers go into the thrown error. */
  pageWhole: (page) => page.evaluate(() => {
    const scroller = document.querySelector('.window[data-window="clioWrite"] .cw-scroller');
    const first = scroller && scroller.querySelector(".pg");
    if (!scroller || !first) throw new Error("页面视图里没有页");
    const s = scroller.getBoundingClientRect();
    const p = first.getBoundingClientRect();
    const inside = p.top >= s.top - 1 && p.left >= s.left - 1 && p.bottom <= s.bottom + 1 && p.right <= s.right + 1 && p.width > 40;
    scroller.dataset.smokePageWhole = inside ? "inside" : "outside";
    const zoom = document.querySelector('.window[data-window="clioWrite"] .cw-zoom-pop')?.textContent || "";
    if (!inside) throw new Error(`第 1 页超出滚动区：页 ${Math.round(p.left)},${Math.round(p.top)}–${Math.round(p.right)},${Math.round(p.bottom)}，区 ${Math.round(s.left)},${Math.round(s.top)}–${Math.round(s.right)},${Math.round(s.bottom)}（缩放「${zoom}」）`);
    return `${zoom} · ${Math.round(p.width)}×${Math.round(p.height)} in ${Math.round(s.width)}×${Math.round(s.height)}`;
  }),

  /** S6 (phone): the page never scrolls sideways, the flow's paragraphs end
   * inside the text area (reflowed to the screen, nothing cut off), and the
   * document bar offers no view pop-up. Marks <html> for the assertion. */
  phoneFit: (page) => page.evaluate(() => {
    const scroller = document.querySelector('.window[data-window="clioWrite"] .cw-scroller');
    if (!scroller) throw new Error("没有 ClioWrite 正文区");
    const sheet = document.scrollingElement;
    const box = scroller.getBoundingClientRect();
    const clipped = [...scroller.querySelectorAll(".flow > .p")].filter((p) => p.getBoundingClientRect().right > box.right + 1).length;
    const pop = document.querySelector('.window[data-window="clioWrite"] .cw-view-pop');
    const popShown = !!pop && getComputedStyle(pop).display !== "none";
    const ok = sheet.scrollWidth <= innerWidth && scroller.scrollWidth <= scroller.clientWidth + 1 && !clipped && !popShown;
    document.documentElement.dataset.smokeSideScroll = ok ? "none" : "yes";
    if (!ok) throw new Error(`页面宽 ${sheet.scrollWidth}/屏宽 ${innerWidth}，正文区 ${scroller.scrollWidth}/${scroller.clientWidth}，越界段落 ${clipped}，视图弹出菜单${popShown ? "还在" : "已收起"}`);
    return `${sheet.scrollWidth} ≤ ${innerWidth}`;
  }),

  /** S6: a table wider than the text area sits in its own frame that scrolls
   * sideways, the hint line right under it; a table that fits is whole on
   * screen. Marks each frame and the scroller for the assertion. */
  tableFrame: (page) => page.evaluate(() => {
    const scroller = document.querySelector('.window[data-window="clioWrite"] .cw-scroller');
    const tables = scroller ? [...scroller.querySelectorAll(".flow > .tbl, .flow > .cw-table-frame > .tbl")] : [];
    if (!tables.length) throw new Error("正文里没有表格");
    const box = scroller.getBoundingClientRect();
    const problems = [];
    for (const table of tables) {
      const frame = table.parentElement.classList.contains("cw-table-frame") ? table.parentElement : null;
      if (frame) {
        const scrolls = frame.scrollWidth > frame.clientWidth + 1 && getComputedStyle(frame).overflowX === "auto";
        frame.dataset.smokeScrolls = scrolls ? "yes" : "no";
        if (!scrolls) problems.push(`表格框 ${frame.scrollWidth}/${frame.clientWidth} 不横滑`);
        if (!frame.nextElementSibling || !frame.nextElementSibling.classList.contains("cw-table-hint")) problems.push("表格框下没有提示");
      } else {
        const r = table.getBoundingClientRect();
        if (r.left < box.left - 1 || r.right > box.right + 1) problems.push(`表格 ${Math.round(r.left)}–${Math.round(r.right)} 超出正文区 ${Math.round(box.left)}–${Math.round(box.right)}`);
      }
    }
    scroller.dataset.smokeTables = problems.length ? "broken" : "ok";
    if (problems.length) throw new Error(problems.join("；"));
    return `${tables.length} 张表`;
  }),

  /** S6: 查找 opens as the phone drawer — upright it leaves the top half of
   * the text in view, sideways the left half — with 听写 inside each field's
   * right end. Opened through the menu command (raced, it holds focus). */
  findDrawer: async (page) => {
    await page.evaluate(async (raceMs) => {
      await Promise.race([handleAction("clio-write-find"), new Promise((done) => setTimeout(done, raceMs))]);
    }, MODAL_RACE_MS);
    return page.evaluate(() => {
      const drawer = document.querySelector(".clioworks-find-windoid");
      const pane = document.querySelector('.window[data-window="clioWrite"] .clio-write-pane');
      if (!drawer || !pane) throw new Error("查找没有打开");
      const d = drawer.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      const upright = innerHeight >= innerWidth;
      const leaves = upright ? d.top >= p.top + p.height / 2 - 1 : d.left >= p.left + p.width / 2 - 1;
      const fields = [...drawer.querySelectorAll(".clioworks-find-field")];
      const inside = fields.length === 2 && fields.every((field) => {
        const input = field.querySelector("input").getBoundingClientRect();
        const button = field.querySelector(".clioworks-find-dictate").getBoundingClientRect();
        return button.left >= input.left && button.right <= input.right + 1 && button.top >= input.top && button.bottom <= input.bottom + 1;
      });
      const ok = drawer.classList.contains("is-drawer") && leaves && inside;
      drawer.dataset.smokeLeavesText = ok ? "yes" : "no";
      if (!ok) throw new Error(`抽屉 ${drawer.className}：${Math.round(d.left)},${Math.round(d.top)}–${Math.round(d.right)},${Math.round(d.bottom)}，正文区 ${Math.round(p.left)},${Math.round(p.top)}–${Math.round(p.right)},${Math.round(p.bottom)}；听写在栏内 ${inside}`);
      return `${upright ? "竖" : "横"} ${Math.round(d.width)}×${Math.round(d.height)}`;
    });
  },

  /** S6: the 旁注栏 from its toggle in the document bar — upright, a sheet over
   * the lower half of the text; sideways, beside the text as on the desk. The
   * find drawer is closed first so the two never stand on each other. */
  railSheet: async (page) => {
    await page.evaluate(async () => {
      if (window.AISystem6ClioWorksFind) window.AISystem6ClioWorksFind.close();
      const win = document.querySelector('.window[data-window="clioWrite"]');
      const rail = win && win.querySelector(".doc-rail");
      const toggle = win && win.querySelector(".details-bar .doc-rail-toggle");
      if (rail && rail.hidden && toggle) toggle.click();
    });
    await page.waitForTimeout(800);
    return page.evaluate(() => {
      const win = document.querySelector('.window[data-window="clioWrite"]');
      const rail = win.querySelector(".doc-rail");
      const toggle = win.querySelector(".details-bar .doc-rail-toggle");
      if (!rail || rail.hidden) throw new Error("旁注栏没有打开");
      const r = rail.getBoundingClientRect();
      const pane = win.querySelector(".clio-write-pane").getBoundingClientRect();
      const s = win.querySelector(".cw-scroller").getBoundingClientRect();
      const upright = innerHeight >= innerWidth;
      const sheet = r.top >= pane.top + pane.height / 2 - 1 && r.bottom <= pane.bottom + 1 && r.left <= pane.left + 1 && r.right >= pane.right - 1;
      const beside = r.left >= s.right - 1 && s.width > 120;
      const shape = !toggle ? "no-toggle" : upright ? (sheet ? "sheet" : "covers") : (beside ? "beside" : "covers");
      rail.dataset.smokeRail = shape;
      return `${shape}: ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`;
    });
  },

  /** S6: the phone turned sideways (844×390). The rail is folded first, so the
   * plain document is what reflows; then the same no-side-scroll check. */
  phoneLandscape: async (page) => {
    await page.evaluate(() => {
      if (window.AISystem6ClioWorksFind) window.AISystem6ClioWorksFind.close();
      const win = document.querySelector('.window[data-window="clioWrite"]');
      const open = win && win.querySelector(".doc-rail:not([hidden])");
      const toggle = win && win.querySelector(".details-bar .doc-rail-toggle");
      if (open && toggle) toggle.click();
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(1500);
    return SCENE_EVALS.phoneFit(page);
  },

  /** Chart: select a rectangle of cells through the workbook session. */
  selectRange: (page) => page.evaluate(() => {
    const session = window.AISystem6ClioChartWorkbook?.session?.();
    if (!session) throw new Error("没有 ClioChart 工作簿会话");
    session.select(0, 0, false);
    session.select(6, 3, true);
    return JSON.stringify(session.selection());
  }),

  /** Reader: F03 into the File Floppy, then opened from the mounted text disk. */
  readerOpen: async (page, origin) => {
    await page.evaluate(async (fixtureOrigin) => {
      const bytes = await (await fetch(`${fixtureOrigin}/real-corpus/pdf/F03.pdf`)).arrayBuffer();
      const file = new File([bytes], "F03 年度报告.pdf", { type: "application/pdf" });
      await insertFilesIntoFileFloppy([file], { source: "fileFloppy", openAfter: "textDisk" });
      await new Promise((done) => setTimeout(done, 2500));
      const names = Object.keys(mountedTextDisk?.fileBodies || {});
      const name = names.find((n) => /\.pdf$/i.test(n));
      if (!name) throw new Error(`PDF 没有落到文件软盘：${names.join("、") || "（空）"}`);
      openMountedTextFile(name);
    }, origin);
  },

  /** Reader: the 整理 view switch, clicked the way the writer clicks it. */
  readerOrganize: (page) => page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((x) => /整理/.test(x.textContent) && x.offsetParent);
    if (!button) throw new Error("页面上没有「整理」按钮");
    button.click();
    return button.textContent;
  }),

  /** Route: a manuscript in the project, opened in TeachText. */
  routeManuscript: (page) => page.evaluate(() => {
    const body = "# 关于下月访谈安排的说明\n\n本次访谈分三轮进行，第一轮在月初，对象以一线编辑为主。[^1]\n\n每位受访者事先收到提纲。\n\n## 二、费用与报销\n\n交通费按实报销，住宿另议。\n\n[^1]: 见编辑部引语规范第 3 条。";
    const now = new Date().toISOString();
    const file = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: null, type: "text", name: "访谈安排", body, createdAt: now, updatedAt: now };
    chatFiles.unshift(file);
    if (typeof saveDeskState === "function") saveDeskState();
    if (typeof renderDocuments === "function") renderDocuments();
    if (typeof openTeachTextManuscriptWindow === "function") openTeachTextManuscriptWindow();
    else openWindow("teachText");
    if (typeof teachTextBodyInput !== "undefined" && teachTextBodyInput) {
      teachTextBodyInput.value = body;
      teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return "ok";
  }),

  /** Agent: ClioTalk, then the 代理 mode button. */
  agentMode: async (page) => {
    await page.evaluate(async () => {
      openWindow("assistant");
      await new Promise((done) => setTimeout(done, 800));
      const button = document.getElementById("clio-agent-mode");
      if (!button) throw new Error("ClioTalk 里没有代理模式按钮");
      button.click();
    });
  },
};

const ACTIONS = {
  place: (page, step, ctx) => placeFile(page, step, ctx.origin),
  command: (page, step) => runCommand(page, step),
  eval: (page, step, ctx) => SCENE_EVALS[step.eval](page, ctx.origin),
};

/* ------------------------------------------------------------ the run itself */

async function main() {
  const { scenes, unknown } = parseSceneArg(process.argv.slice(2));
  if (unknown.length) {
    console.error(`unknown scene: ${unknown.join(", ")}\nscenes: ${["write", "chart", "stage", "reader", "route", "agent", "new", "phone"].join(" ")}`);
    process.exitCode = 2;
    return;
  }
  if (!(await deskIsUp(APP_URL))) {
    console.error(`the desk is not answering at ${APP_URL} — start it with \`npm start\` (or \`npm run build:app && node apps/server/server.js\`), then run this tool again.`);
    process.exitCode = 1;
    return;
  }

  const outDir = join(ROOT, "dist", "smoke", `clioworks-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
  mkdirSync(outDir, { recursive: true });
  const report = { appUrl: APP_URL, startedAt: new Date().toISOString(), scenes, steps: [], pageErrors: [], dialogs: [] };
  const fixturePort = await freePort();
  const fixtureServer = await startFixtureServer(fixturePort);
  const origin = `http://127.0.0.1:${fixturePort}`;

  const browser = await chromium.launch();
  try {
    for (const scene of scenes) {
      const phone = scene === "phone";
      // One fresh boot per surface: the point of a fresh-boot smoke is that
      // nothing a previous surface opened can carry over.
      const context = await browser.newContext(phone ? { ...PHONE_CONTEXT } : { ...DESKTOP_CONTEXT });
      await stubLocalModels(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error?.message || error).slice(0, 200)));
      page.on("dialog", (dialog) => {
        report.dialogs.push({ scene, message: String(dialog.message() || "").slice(0, 160) });
        dialog.dismiss().catch(() => {});
      });

      let booted = true;
      try {
        await bootDesk(page);
      } catch (error) {
        booted = false;
        report.steps.push({ scene, id: `${scene}-boot`, title: "开机", ok: false, detail: String(error?.message || error).slice(0, 300) });
        console.log(`FAIL ${scene}-boot — 开机: ${report.steps.at(-1).detail}`);
      }

      if (booted) {
        for (const step of planFor([scene])) {
          const started = Date.now();
          const notesBefore = await notificationCount(page);
          const errorsBefore = pageErrors.length;
          let actionError = null;
          try {
            await ACTIONS[step.kind](page, step, { origin });
          } catch (error) {
            actionError = error;
          }
          await page.waitForTimeout(step.settle || SETTLE_MS[step.kind] || SETTLE_MS.command);
          const shotPath = join(outDir, `${scene}-${step.id}.png`);
          await page.screenshot({ path: shotPath }).catch(() => {});
          const assertion = await runAssertion(page, step.assert).catch((error) => ({ ok: false, detail: `断言出错: ${String(error?.message || error).slice(0, 200)}` }));
          if (step.modal) await page.keyboard.press("Escape").catch(() => {});

          const problems = [];
          if (actionError) problems.push(`动作出错: ${String(actionError?.message || actionError).slice(0, 200)}`);
          if (!assertion.ok) problems.push(assertion.detail);
          if (pageErrors.length > errorsBefore) {
            problems.push(`出现 ${pageErrors.length - errorsBefore} 个 pageerror: ${pageErrors.slice(errorsBefore).join(" | ").slice(0, 200)}`);
          }
          if (await refusalsAddedByStep(page, notesBefore)) problems.push(`通知中心新增「${REFUSAL_TEXT}」`);
          report.pageErrors.push(...pageErrors.slice(errorsBefore));
          const result = { scene, id: step.id, title: step.title, ok: !problems.length, detail: problems.join("; "), shot: shotPath, ms: Date.now() - started };
          report.steps.push(result);
          console.log(`${result.ok ? "ok " : "FAIL"} ${step.id} — ${step.title}${result.detail ? `: ${result.detail}` : ""}`);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((done) => fixtureServer.close(done));
  }

  const failed = report.steps.filter((step) => !step.ok);
  report.failed = failed.map((step) => step.id);
  const reportPath = join(outDir, "report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 1)}\n`);
  if (failed.length) {
    console.error(`\n${failed.length}/${report.steps.length} step(s) failed — report: ${reportPath}`);
    for (const step of failed) console.error(failureLine(step));
  } else {
    console.log(`\nall ${report.steps.length} step(s) passed — report: ${reportPath}`);
  }
  if (failed.length || report.pageErrors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
