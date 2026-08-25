#!/usr/bin/env node
// Browser-computed propagation gate for the real application, deliberately
// separate from Theme Lab regression and canonical historical fidelity.
//
// Theme Lab owns painter specimens. This gate answers the other maintenance
// question: do the same system primitives actually reach ordinary and
// visually-special application windows under all six appearances?

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { windowInterfaceRegistry } from "./interface-guidelines-contract.mjs";
import { lazyStyleBundles } from "./style-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const THEME_IDS = Object.freeze([
  "classic",
  "platinum",
  "aqua",
  "snow-leopard",
  "yosemite",
  "liquid-glass",
]);

const REGISTERED_WINDOWS = Object.freeze(Object.entries(windowInterfaceRegistry).map(([id, contract]) => Object.freeze({
  id,
  role: contract.role,
  sourceKind: contract.sourceKind,
  ensure: contract.ensure,
  mountPath: contract.mountPath,
  sample: contract.appearanceProbe.sampleSelector,
  representative: contract.appearanceProbe.representative,
})));
const REPRESENTATIVE_WINDOW_IDS = new Set(
  REGISTERED_WINDOWS.filter(({ representative }) => representative).map(({ id }) => id),
);
const representedRoles = new Set(
  REGISTERED_WINDOWS.filter(({ representative }) => representative).map(({ role }) => role),
);
for (const role of new Set(REGISTERED_WINDOWS.map(({ role }) => role))) {
  if (!representedRoles.has(role)) throw new Error(`Appearance coverage has no screenshot representative for role: ${role}`);
}

const outputArgument = process.argv.indexOf("--output");
if (process.argv.includes("--help")) {
  console.log("Usage: node tooling/verify-appearance-app-coverage.mjs [--output DIR] [--all]");
  process.exit(0);
}
if (process.argv.slice(2).some((argument, index, args) => argument !== "--output" && argument !== "--all" && args[index - 1] !== "--output")) {
  throw new Error(`Unknown option: ${process.argv.slice(2).join(" ")}`);
}
if (outputArgument >= 0 && (!process.argv[outputArgument + 1] || process.argv[outputArgument + 1].startsWith("--"))) {
  throw new Error("--output requires a directory");
}
const outputDir = outputArgument >= 0
  ? resolve(process.argv[outputArgument + 1])
  : join(root, "internal", "evidence", "drafts", "appearance-app-coverage", "current");

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

// `--all` collects every finding instead of stopping at the first.
//
// A gate that throws on finding one hides how big the field is: this one had
// been red on a single WindowShade for long enough that nobody knew whether
// three findings were behind it or thirty. Deciding whether to drain a lane or
// ship past it needs that number, and one run should be enough to get it.
const reportAll = process.argv.includes("--all");
const findings = [];

function assert(condition, message) {
  if (condition) return;
  if (!reportAll) throw new Error(message);
  findings.push(message);
}

function httpReady(url) {
  return new Promise((resolveReady) => {
    const request = get(url, (response) => {
      response.resume();
      resolveReady(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolveReady(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

async function getFreePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => port ? resolvePort(port) : reject(new Error("Could not allocate a local port")));
    });
    server.on("error", reject);
  });
}

async function startAppServer() {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (await httpReady(url)) return { child, url, output: () => output };
    if (child.exitCode !== null) break;
    await wait(150);
  }
  child.kill("SIGTERM");
  throw new Error(`Appearance coverage server did not become ready.\n${output.trim()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

// Windows allowed to differ from the shared painter on named properties, each
// with the reason. Everything not named here is still asserted, so a window
// that keeps its own height cannot quietly also take its own typeface.
//
// Alarm Clock is the only entry, and it is not a desk accessory bending the
// rules -- it is the one window here whose strip is NOT a window title bar.
//
// Native evidence, from `WIND -16000` in the bundled System 6.0.8 image
// (.claude/skills/system6-ui-review): content rect 129x18, procID 3
// (altDBoxProc -- a shadowed box with no system title bar), goAwayFlag true.
// The Alarm Clock's top strip is the DA's own 18px content: close box, time
// readout, fold lever. The product builds it with the `.title-bar` class as a
// carrier and hides the real title, and 30-surfaces.css says why the era fill
// is suppressed there -- "the readout is the Alarm Clock's window title, so it
// masks the bar the way a window title does", and Platinum's stripes otherwise
// ran straight through the digits.
//
// So the four properties below are the object, not drift. The Alarm Clock does
// wear every era: 54 token redefinitions in the base appearance sheet, 52 in
// Aqua, 33 in Liquid Glass, including its own --alarm-clock-title-bg per era.
// What replaces the dropped comparison is the assertion below, which holds the
// strip to the native 18 and to the era's own ink and typeface.
const TITLE_METRIC_EXCEPTIONS = new Map([
  ["alarmClock", ["height", "backgroundColor", "boxShadow", "backdropFilter"]],
]);

// The height the native content rect gives, asserted rather than assumed.
const ALARM_CLOCK_NATIVE_STRIP_HEIGHT = 18;

function titleSignature(titleBar, windowId) {
  const exceptions = TITLE_METRIC_EXCEPTIONS.get(windowId) || [];
  const signature = {
    height: titleBar.rect.height,
    backgroundColor: titleBar.style.backgroundColor,
    color: titleBar.style.color,
    borderTopColor: titleBar.style.borderTopColor,
    borderTopWidth: titleBar.style.borderTopWidth,
    borderRadius: titleBar.style.borderRadius,
    boxShadow: titleBar.style.boxShadow,
    backdropFilter: titleBar.style.backdropFilter,
    fontFamily: titleBar.style.fontFamily,
    fontSize: titleBar.style.fontSize,
  };
  for (const key of exceptions) delete signature[key];
  return JSON.stringify(signature);
}

mkdirSync(outputDir, { recursive: true });
let server;
let browser;
try {
  server = await startAppServer();
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    screen: { width: 1280, height: 820 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript(() => {
    localStorage.setItem("ai-system-6-theme", "classic");
    localStorage.removeItem("ai-system-6-liquid-glass");
  });
  const page = await context.newPage();
  const diagnostics = [];
  page.on("pageerror", (error) => {
    const message = String(error?.message || error);
    // Sandboxed preview documents intentionally cannot access the top-level
    // localStorage. It is a contained preview diagnostic, not an app failure.
    if (!message.includes("document is sandboxed and lacks the 'allow-same-origin' flag")) {
      diagnostics.push(`pageerror: ${message}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // The console twin of the request above arrives without a URL, so it cannot
    // be filtered by target; the requestfailed handler is the one that reports.
    if (message.text().includes("Failed to load resource")) return;
    diagnostics.push(`console: ${message.text()}`);
  });
  // A console error says a request failed; only the request event says which.
  // "Failed to load resource: net::ERR_CONNECTION_REFUSED" with no URL is a
  // finding nobody can act on.
  //
  // One loopback failure is expected and is not a finding: the app probes for a
  // local model at boot (LM Studio on 127.0.0.1:1234, Ollama on 11434), and a
  // build machine has none running. The product is designed to say "Model not
  // connected" and carry on, so a gate that fails on it would be asserting the
  // opposite of the contract. Any OTHER failed request is still a finding,
  // including a loopback one to the app's own origin.
  const isAbsentLocalModel = (url) => {
    try {
      const target = new URL(url);
      const ownOrigin = new URL(server.url).origin;
      const loopback = target.hostname === "127.0.0.1" || target.hostname === "localhost" || target.hostname === "[::1]";
      return loopback && target.origin !== ownOrigin;
    } catch {
      return false;
    }
  };
  page.on("requestfailed", (request) => {
    if (isAbsentLocalModel(request.url())) return;
    diagnostics.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.push(`response ${response.status()}: ${response.url()}`);
  });
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 15000 });
  await page.evaluate(() => {
    document.body.classList.remove("use-modern-fonts", "is-writer-mode", "is-cloud-active", "quick-draft-focus");
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    const style = document.createElement("style");
    style.id = "appearance-app-coverage-no-motion";
    style.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
    document.head.append(style);
  });
  await page.evaluate(() => document.fonts?.ready);

  // Mount every dynamic/lazy window through the same window-manager path the
  // product uses. Once mounted, subsequent theme passes only toggle visibility;
  // the gate therefore covers the real DOM without reopening expensive apps six
  // times or maintaining a second feature-module list.
  for (const contract of REGISTERED_WINDOWS) {
    const mounted = await page.evaluate(async ({ id, ensure }) => {
      if (!document.querySelector(`.window[data-window="${id}"]`)
        && ensure === "loadLazyWindowModule"
        && typeof loadLazyWindowAppearanceShell === "function") {
        await loadLazyWindowAppearanceShell(id);
      }
      return Boolean(document.querySelector(`.window[data-window="${id}"]`));
    }, contract);
    assert(mounted, `Registered window did not mount: ${contract.id} (${contract.mountPath})`);
  }

  // Ask for every lazy stylesheet before measuring anything.
  //
  // A window's markup and its layout can live on opposite sides of the lazy
  // line: CMF Studio, Soundscape, Endfield Terminal, Image Prompt Studio, Time
  // Machine and ClioChart are `sourceKind: "static"` -- their markup ships in
  // index.html -- while their width and grid live in a lazy bundle that only
  // arrives when the module loads. Revealing such a window by class, which is
  // what this gate does, never triggers that load, so the gate was measuring
  // six unstyled windows: 2px wide in Classic, 10px in Platinum, 0 in Liquid
  // Glass. Only the zero was loud enough to fail, which is why this stood.
  // CMF Studio is 1120x720 once its sheet applies.
  await page.evaluate((bundles) => {
    for (const output of bundles) {
      if (document.querySelector(`link[rel="stylesheet"][href*="${output}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = output;
      document.head.append(link);
    }
  }, lazyStyleBundles.map((bundle) => bundle.output));

  await page.waitForFunction(
    () => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => link.sheet),
    null,
    { timeout: 15000 },
  ).catch(() => {});
  const unloadedSheets = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .filter((link) => !link.sheet)
    .map((link) => link.getAttribute("href")));
  assert(
    unloadedSheets.length === 0,
    `Stylesheet(s) never applied, so every measurement below would be of an unstyled window: ${unloadedSheets.join(", ")}`,
  );

  const registry = await page.evaluate(() => window.AISystem6Theme.themes.map((theme) => ({
    id: theme.id,
    family: theme.family,
    recipeBase: theme.recipeBase,
    menuBarModel: theme.menuBarModel,
    releaseReady: theme.releaseReady,
    systemFont: theme.systemFont,
    fontStrategy: theme.fontStrategy,
  })));
  assert(JSON.stringify(registry.map(({ id }) => id)) === JSON.stringify(THEME_IDS), "Theme registry is not the canonical six-appearance timeline");
  assert(registry.every(({ releaseReady }) => releaseReady !== false), "Every canonical appearance must be release-ready");

  const results = [];
  for (const theme of registry) {
    const projection = await page.evaluate((themeId) => {
      const applied = window.AISystem6Theme.applyTheme(themeId, {
        experimental: true,
        persist: false,
        announce: false,
        modernFontPreference: false,
      });
      document.body.classList.remove("is-writer-mode", "is-cloud-active", "quick-draft-focus");
      return {
        applied: { id: applied.id, family: applied.family, recipeBase: applied.recipeBase },
        html: {
          theme: document.documentElement.dataset.theme,
          family: document.documentElement.dataset.themeFamily,
          base: document.documentElement.dataset.themeBase || null,
        },
        body: {
          theme: document.body.dataset.theme,
          family: document.body.dataset.themeFamily,
          base: document.body.dataset.themeBase || null,
          liquidClass: document.body.classList.contains("use-liquid-glass"),
          modernFontClass: document.body.classList.contains("use-modern-fonts"),
        },
      };
    }, theme.id);
    assert(projection.applied.id === theme.id, `${theme.id}: applyTheme returned ${projection.applied.id}`);
    for (const [rootName, rootProjection] of [["html", projection.html], ["body", projection.body]]) {
      assert(rootProjection.theme === theme.id, `${theme.id}: ${rootName} data-theme is ${rootProjection.theme}`);
      assert(rootProjection.family === theme.family, `${theme.id}: ${rootName} family is ${rootProjection.family}`);
      assert(rootProjection.base === (theme.recipeBase || null), `${theme.id}: ${rootName} base is ${rootProjection.base}`);
    }
    assert(projection.body.liquidClass === (theme.id === "liquid-glass"), `${theme.id}: Liquid Glass skin class projection is wrong`);
    assert(
      projection.body.modernFontClass === (theme.fontStrategy === "modern"),
      `${theme.id}: font strategy ${theme.fontStrategy} projected the wrong modern-font state`,
    );

    const applicationMenu = await page.evaluate(() => {
      // This harness applies the era through the registry directly, so it has
      // to redraw the bar the way the application's own applyTheme() does.
      renderMultiFinderMenu();
      const currentMenu = document.querySelector(".menu-bar-current-app");
      const currentLabel = document.querySelector("#current-app-menu-label");
      const switcher = document.querySelector("#multifinder-button");
      const verbRows = () => Array.from(
        document.querySelectorAll("#current-app-menu-section button[data-action]"),
      ).map((button) => `${button.dataset.action}:${button.textContent.trim()}`);
      renderAppMenuBar("finder", { force: true });
      const finderLabel = currentLabel?.textContent?.trim() || "";
      renderAppMenuBar("reader", { force: true });
      const readerLabel = currentLabel?.textContent?.trim() || "";
      const readerOwner = currentMenu?.getAttribute("data-current-app-id") || "";
      const readerVerbs = verbRows();
      renderAppMenuBar("finder", { force: true });
      return {
        display: currentMenu ? getComputedStyle(currentMenu).display : "missing",
        model: document.body.dataset.menuBarModel || "",
        indicator: switcher?.dataset.appSwitchIndicator || "",
        hasPopup: switcher?.getAttribute("aria-haspopup") || "",
        // The verbs act on the application in front, so they are named after
        // it -- not after the application whose menus the bar is showing. The
        // two differ only while a Desk Accessory is active.
        activeLabel: multiFinderAppLabels[activeAppId] || activeAppId,
        finderLabel,
        readerLabel,
        readerOwner,
        readerVerbs,
      };
    });
    assert(applicationMenu.finderLabel === "Finder", `${theme.id}: foreground Finder is labeled ${applicationMenu.finderLabel}`);
    assert(applicationMenu.readerLabel === "Reader", `${theme.id}: foreground Reader is labeled ${applicationMenu.readerLabel}`);
    assert(applicationMenu.readerOwner === "reader", `${theme.id}: current-application owner did not follow Reader`);
    assert(![applicationMenu.finderLabel, applicationMenu.readerLabel].includes("AI System 6"), `${theme.id}: environment name leaked into the current-application title`);
    // Two menu-bar models, and the appearance registry decides which one an era
    // uses. The classic lineage replaces the whole bar and draws an indicator at
    // the right end; the Mac OS X eras keep the Apple menu with the system and
    // show the bold application menu. See app/core/theme-registry.js.
    assert(
      applicationMenu.model === theme.menuBarModel,
      `${theme.id}: projected menu-bar model is ${applicationMenu.model}, expected ${theme.menuBarModel}`,
    );
    const systemOwned = theme.menuBarModel === "system-owned";
    assert(
      systemOwned === (applicationMenu.display !== "none"),
      `${theme.id}: application-menu visibility does not match the ${theme.menuBarModel} bar (${applicationMenu.display})`,
    );
    assert(
      systemOwned === (applicationMenu.indicator !== "cycle"),
      `${theme.id}: the right end should ${systemOwned ? "drop a menu down" : "be a cycling indicator"}`,
    );
    assert(
      systemOwned === (applicationMenu.hasPopup === "menu"),
      `${theme.id}: the right end advertises aria-haspopup="${applicationMenu.hasPopup}" under a ${theme.menuBarModel} bar`,
    );
    if (systemOwned) {
      const verbs = applicationMenu.readerVerbs.join(" | ");
      for (const action of ["hide-active-app", "hide-other-apps", "show-all-apps", "quit-active-app"]) {
        assert(verbs.includes(`${action}:`), `${theme.id}: the application menu is missing ${action} (${verbs})`);
      }
      assert(
        verbs.includes(applicationMenu.activeLabel),
        `${theme.id}: the application verbs are not named after the application in front, ${applicationMenu.activeLabel} (${verbs})`,
      );
    } else {
      assert(
        applicationMenu.readerVerbs.length === 0,
        `${theme.id}: an application-owned bar must not grow a Mac OS X application menu (${applicationMenu.readerVerbs.join(" | ")})`,
      );
    }

    const windows = [];
    for (const contract of REGISTERED_WINDOWS) {
      const snapshot = await page.evaluate(({ id, sample }) => {
        for (const windowElement of document.querySelectorAll(".window")) {
          windowElement.classList.add("is-hidden");
          windowElement.classList.remove("is-active");
        }
        const target = document.querySelector(`.window[data-window="${id}"]`);
        if (!target) return { missing: true };
        // Control Panel, Chooser and Memory Transfer are authored rolled up
        // (`is-collapsed` in index.html) and expand when the product opens
        // them. Revealing by class alone measured a WindowShade: the pane is
        // display:none under `.window.is-collapsed`, so the sample had no
        // geometry and this gate has been red since before 1.0.50. What the
        // gate is for is the appearance of an OPEN window.
        target.classList.remove("is-hidden", "is-collapsed");
        target.classList.add("is-active");
        const capture = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            style: {
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              backgroundColor: style.backgroundColor,
              color: style.color,
              borderTopColor: style.borderTopColor,
              borderTopWidth: style.borderTopWidth,
              borderRadius: style.borderRadius,
              boxShadow: style.boxShadow,
              backdropFilter: style.backdropFilter,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
            },
          };
        };
        const sampleElement = target.querySelector(sample) || target;
        return {
          missing: false,
          devicePixelRatio: window.devicePixelRatio,
          window: capture(target),
          titleBar: capture(target.querySelector(":scope > .title-bar")),
          sample: capture(sampleElement),
          sampleClassName: sampleElement?.className || "",
          sampleModernDisplaySize: Number(sampleElement?.querySelector(".sys-icon-svg")?.dataset.modernDisplaySize || 0),
          sampleModernSourceSize: Number(sampleElement?.querySelector(".sys-icon-svg")?.dataset.modernSourceSize || 0),
        };
      }, contract);
      await page.evaluate(() => new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint))));
      assert(!snapshot.missing, `${theme.id}: missing real window ${contract.id}`);
      assert(snapshot.devicePixelRatio === 2, `${theme.id}/${contract.id}: browser device pixel ratio is ${snapshot.devicePixelRatio}, expected 2`);
      for (const [surface, value] of [["window", snapshot.window], ["title bar", snapshot.titleBar], ["sample", snapshot.sample]]) {
        assert(value, `${theme.id}/${contract.id}: missing ${surface}`);
        assert(value.rect.width > 0 && value.rect.height > 0, `${theme.id}/${contract.id}: ${surface} has no rendered geometry`);
        assert(value.style.display !== "none" && value.style.visibility !== "hidden", `${theme.id}/${contract.id}: ${surface} is not visible`);
      }
      if (["aqua", "snow-leopard", "yosemite", "liquid-glass"].includes(theme.id)
        && snapshot.sampleModernSourceSize) {
        // The floor is the ICON's declared display size, not the sample
        // container's box. Most samples are a whole window pane, and measuring
        // the pane asked a 128px icon to cover 90% of a 416px pane at 2x --
        // impossible, and the reason every modern era failed on every window
        // with a pane sample. The message always printed the right number
        // ("declared 34px"); only the arithmetic used the wrong one.
        const requiredPixels = snapshot.sampleModernDisplaySize * 2 * 0.9;
        assert(
          snapshot.sampleModernSourceSize >= requiredPixels,
          `${theme.id}/${contract.id}: ${snapshot.sampleModernSourceSize}px raster (${snapshot.sampleClassName}, declared ${snapshot.sampleModernDisplaySize}px) is below the Retina rendering floor ${requiredPixels.toFixed(1)}px`,
        );
      }
      let screenshot = "";
      if (REPRESENTATIVE_WINDOW_IDS.has(contract.id)) {
        screenshot = `${theme.id}-${contract.id}.png`;
        await page.locator(`.window[data-window="${contract.id}"]`).screenshot({
          path: join(outputDir, screenshot),
          animations: "disabled",
        });
      }
      windows.push({
        id: contract.id,
        role: contract.role,
        sourceKind: contract.sourceKind,
        mountPath: contract.mountPath,
        screenshot,
        ...snapshot,
      });
    }

    const systemTitleBar = windows.find(({ id }) => id === "finder").titleBar;
    for (const windowResult of windows) {
      // Both sides drop the same keys, so an exception narrows what is compared
      // rather than comparing two different things.
      assert(
        titleSignature(windowResult.titleBar, windowResult.id)
          === titleSignature(systemTitleBar, windowResult.id),
        `${theme.id}/${windowResult.id}: app stylesheet overrode the shared system title-bar painter`,
      );
      // What the Alarm Clock gives up above, it owes here: its strip stays the
      // native 18 in every era, and still takes the era's ink and typeface.
      if (windowResult.id === "alarmClock") {
        assert(
          windowResult.titleBar.rect.height === ALARM_CLOCK_NATIVE_STRIP_HEIGHT,
          `${theme.id}/alarmClock: strip is ${windowResult.titleBar.rect.height}px, not the native ${ALARM_CLOCK_NATIVE_STRIP_HEIGHT}px of WIND -16000`,
        );
        assert(
          windowResult.titleBar.style.fontFamily === systemTitleBar.style.fontFamily
            && windowResult.titleBar.style.color === systemTitleBar.style.color,
          `${theme.id}/alarmClock: strip stopped taking the era's own ink and title typeface`,
        );
      }
    }
    results.push({ theme, projection, windows });
    console.log(`OK  ${theme.id}: ${windows.length} registered windows share system chrome; ${REPRESENTATIVE_WINDOW_IDS.size} role screenshots captured`);
  }

  const titleSignatures = new Map(results.map((result) => [
    result.theme.id,
    titleSignature(result.windows.find(({ id }) => id === "finder").titleBar, "finder"),
  ]));
  assert(titleSignatures.get("yosemite") !== titleSignatures.get("liquid-glass"), "Yosemite and Liquid Glass collapsed to the same real-window painter");
  assert(diagnostics.length === 0, `Real-app coverage emitted runtime errors:\n${diagnostics.join("\n")}`);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    themes: results,
    diagnostics,
    registeredWindows: REGISTERED_WINDOWS,
    representativeWindowIds: [...REPRESENTATIVE_WINDOW_IDS],
  };
  writeFileSync(join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (findings.length) {
    console.error(`\nNO  Appearance real-app propagation: ${findings.length} finding(s)`);
    for (const finding of findings) console.error(`    ${finding}`);
    process.exitCode = 1;
  } else console.log(`OK  Appearance real-app propagation passed: ${results.length} themes × ${REGISTERED_WINDOWS.length} registered windows`);
  console.log(`    artifacts: ${outputDir}`);
} catch (error) {
  console.error(`Appearance real-app propagation failed: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}
