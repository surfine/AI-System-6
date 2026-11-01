// Browser capture for the two appearances this lane repaired: Big Sur's window
// buttons and NeXTSTEP's dock regions.
//
// The contracts answer "does the state machine hold"; this instrument answers
// the questions a contract cannot: what the three representative Big Sur
// windows actually look like, that Close stays at the left end and Zoom at the
// right end of a narrow window with a long title, that no yellow lamp is drawn
// (owner decision 2026-09-25: a Mac OS X era's lamp ships only with its Dock),
// that the title-bar double-click still rolls a window up in place, and that
// the NeXTSTEP Dock draws its three classes of object as three regions rather
// than one flat column.
//
//   node tooling/capture-big-sur-nextstep-chrome.mjs [--url http://127.0.0.1:4173]
//
// Needs a running development server (`npm run dev`). Writes screenshots and
// results.json next to this file's output directory and exits non-zero when an
// assertion fails, so it can be used as an on-demand gate.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = argument("--url", "http://127.0.0.1:4173");
const output = resolve(argument("--output", "internal/evidence/drafts/bigsur-nextstep/chrome"));
await mkdir(output, { recursive: true });
const results = [];
const record = (name, status, detail = "") => {
  results.push({ name, status, detail });
  console.log(`${status === "passed" ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const failures = [];

async function desk({ theme, experimental = false, viewport = { width: 1440, height: 900 }, deviceScaleFactor = 1 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 60000 });
  await page.evaluate(() => { for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close(); });
  await page.evaluate(async ({ theme, experimental }) => {
    if (experimental) await window.AISystem6Theme.previewExperimentalTheme(theme);
    else await applyTheme(theme);
    await setFinderEnvironment("multifinder", { persistStartup: false });
  }, { theme, experimental });
  return { context, page, errors };
}

async function scene(name, task, options = {}) {
  try {
    await task(options);
  } catch (error) {
    failures.push(name);
    record(name, "failed", error.message);
    await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
    throw error;
  }
}

// ---- Big Sur: the three representative windows -------------------------------

await scene("big-sur-window-buttons", async () => {
  const { context, page, errors } = await desk({ theme: "big-sur", deviceScaleFactor: 2 });
  await page.evaluate(async () => {
    await openWindow("projects");           // browsing
    await openWindow("teachText");          // a document
    await openWindow("control");            // settings
    const places = {
      projects: ["120px", "110px", "560px", "420px"],
      teachText: ["420px", "180px", "620px", "340px"],
      control: ["700px", "360px", "560px", "380px"],
    };
    for (const [name, [left, top, width, height]] of Object.entries(places)) {
      const win = getWindow(name);
      win.style.left = left; win.style.top = top; win.style.width = width; win.style.height = height;
    }
    focusWindow(getWindow("teachText"));
  });
  await page.waitForTimeout(500);

  // Every representative window carries the product's pair: red Close at the
  // left end, green Zoom at the right end, the same inset from each edge, and
  // no yellow lamp until this era's Dock ships.
  const groups = await page.evaluate(() => ["projects", "teachText", "control"].map((name) => {
    const bar = getWindow(name).querySelector(":scope > .title-bar");
    const barRect = bar.getBoundingClientRect();
    const buttons = [...bar.querySelectorAll(":scope > button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return { cls: button.className, columns: getComputedStyle(button).gridColumnStart,
        size: [Math.round(rect.width), Math.round(rect.height)], label: button.getAttribute("aria-label"),
        fromLeft: Math.round(rect.left - barRect.left), fromRight: Math.round(barRect.right - rect.right) };
    }).filter((button) => !button.cls.split(" ").includes("hidden") && button.size[0] > 0);
    return { name, title: bar.querySelector("h1, h2")?.textContent?.trim() || "", buttons,
      minimizeModule: Boolean(window.AISystem6WindowMinimizeLoaded) };
  }));
  for (const group of groups) {
    const lamps = group.buttons.filter((button) => button.cls !== "shade-box");
    assert.deepEqual(lamps.map((lamp) => lamp.cls), ["close-box", "resize-box"],
      `${group.name}: the bar carries Close and Zoom, and no minimize lamp`);
    assert.deepEqual(lamps.map((lamp) => lamp.columns), ["1", "3"], `${group.name}: Close takes the first column and Zoom the last`);
    assert.deepEqual(lamps.map((lamp) => lamp.size), [[20, 20], [20, 20]],
      `${group.name}: each 12px lamp keeps its own 20px target`);
    assert.ok(Math.abs(lamps[0].fromLeft - lamps[1].fromRight) <= 1,
      `${group.name}: Close sits at the left end and Zoom at the right end, the same inset (${lamps[0].fromLeft} / ${lamps[1].fromRight})`);
    assert.deepEqual(lamps.map((lamp) => lamp.label), ["Close", "Zoom"],
      `${group.name}: each lamp is named for the command it runs`);
    assert.equal(group.minimizeModule, false, `${group.name}: Big Sur does not load the miniaturize module`);
  }
  record("big-sur-window-buttons", "passed", `${groups.map((group) => group.title || group.name).join(" / ")} each carry close-left + zoom-right`);
  await page.screenshot({ path: resolve(output, "big-sur-three-windows.png") });
  await page.locator('[data-window="projects"] > .title-bar').screenshot({ path: resolve(output, "big-sur-browser-titlebar.png") });
  await page.locator('[data-window="teachText"] > .title-bar').screenshot({ path: resolve(output, "big-sur-document-titlebar.png") });
  await page.locator('[data-window="control"] > .title-bar').screenshot({ path: resolve(output, "big-sur-settings-titlebar.png") });

  // A narrow document window with a long title: what must not happen is a lamp
  // pushed out of the bar or a title drawn under the buttons.
  const narrow = await page.evaluate(() => {
    const win = getWindow("teachText");
    win.style.width = "250px";
    const heading = win.querySelector(":scope > .title-bar h1, :scope > .title-bar h2");
    heading.textContent = "The Longest Possible Document Title, Written Out In Full";
    const bar = win.querySelector(":scope > .title-bar").getBoundingClientRect();
    const lamps = [...win.querySelectorAll(":scope > .title-bar > :is(.close-box, .minimize-box, .resize-box)")]
      .map((lamp) => ({ cls: lamp.className, box: lamp.getBoundingClientRect().toJSON() }));
    const title = heading.getBoundingClientRect();
    return { bar: bar.toJSON(), lamps, title: title.toJSON(),
      overflow: getComputedStyle(win.querySelector(":scope > .title-bar")).overflow };
  });
  assert.deepEqual(narrow.lamps.map((lamp) => lamp.cls), ["close-box", "resize-box"], "a narrow window keeps Close and Zoom");
  for (const lamp of narrow.lamps) {
    assert.ok(lamp.box.width > 0 && lamp.box.right <= narrow.bar.right + 0.5 && lamp.box.left >= narrow.bar.left - 0.5,
      `${lamp.cls} stays inside the narrow title bar`);
  }
  assert.ok(narrow.title.left >= narrow.lamps[0].box.right - 0.5,
    "the title starts after Close instead of under it");
  assert.ok(narrow.title.right <= narrow.lamps[1].box.left + 0.5, "and ends before Zoom at the right end");
  record("big-sur-narrow-long-title", "passed",
    `${Math.round(narrow.bar.width)}px bar, title from ${Math.round(narrow.title.left)} to ${Math.round(narrow.title.right)}`);
  await page.locator('[data-window="teachText"] > .title-bar').screenshot({ path: resolve(output, "big-sur-narrow-long-title.png") });

  // Minimize and WindowShade are two verbs. With no lamp drawn, the title-bar
  // double-click still rolls the window up where it stands and back down.
  await page.evaluate(() => {
    const win = getWindow("teachText");
    win.style.width = "620px";
    win.querySelector(":scope > .title-bar h1, :scope > .title-bar h2").textContent = "Notes";
    focusWindow(win);
  });
  await page.locator('[data-window="teachText"] > .title-bar h1, [data-window="teachText"] > .title-bar h2').first().dblclick();
  await page.waitForFunction(() => getWindow("teachText").classList.contains("is-collapsed"));
  await page.locator('[data-window="teachText"] > .title-bar').screenshot({ path: resolve(output, "big-sur-windowshade.png") });
  await page.locator('[data-window="teachText"] > .title-bar h1, [data-window="teachText"] > .title-bar h2').first().dblclick();
  await page.waitForFunction(() => !getWindow("teachText").classList.contains("is-collapsed"));
  record("big-sur-windowshade", "passed", "the title-bar double-click rolls the window up in place and back");
  assert.deepEqual(errors, [], "no browser errors during the Big Sur scenes");
  await context.close();
});

// ---- Big Sur at phone width --------------------------------------------------

await scene("big-sur-phone-title-bar", async () => {
  const { context, page, errors } = await desk({ theme: "big-sur", viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
  await page.evaluate(async () => {
    await setFinderEnvironment("multifinder", { persistStartup: false });
    await openWindow("teachText");
    const win = getWindow("teachText");
    win.querySelector(":scope > .title-bar h1, :scope > .title-bar h2").textContent = "A Document Title That Cannot Fit On A Phone";
  });
  await page.waitForTimeout(400);
  const narrow = await page.evaluate(() => {
    const win = getWindow("teachText");
    const bar = win.querySelector(":scope > .title-bar");
    const heading = bar.querySelector("h1, h2");
    return {
      bar: bar.getBoundingClientRect().toJSON(),
      lamps: [...bar.querySelectorAll(":scope > :is(.close-box, .minimize-box, .resize-box)")]
        .map((lamp) => ({ cls: lamp.className, display: getComputedStyle(lamp).display, box: lamp.getBoundingClientRect().toJSON() })),
      title: { box: heading.getBoundingClientRect().toJSON(), text: heading.textContent,
        overflow: getComputedStyle(heading).textOverflow, whiteSpace: getComputedStyle(heading).whiteSpace },
      scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth,
    };
  });
  assert.deepEqual(narrow.lamps.map((lamp) => lamp.cls), ["close-box", "resize-box"], "the phone title bar carries Close and Zoom, and no minimize lamp");
  for (const lamp of narrow.lamps) {
    assert.notEqual(lamp.display, "none", `${lamp.cls} is still drawn at phone width`);
    assert.ok(lamp.box.right <= narrow.bar.right + 0.5 && lamp.box.left >= narrow.bar.left - 0.5,
      `${lamp.cls} stays inside the phone title bar`);
  }
  assert.ok(narrow.title.box.left >= narrow.lamps[0].box.right - 0.5, "the title starts after Close at phone width");
  assert.ok(narrow.title.box.right <= narrow.lamps[1].box.left + 0.5, "and ends before Zoom at the right end");
  assert.ok(narrow.scrollWidth <= narrow.clientWidth + 1, "the phone title bar does not scroll sideways");
  record("big-sur-phone-title-bar", "passed",
    `${Math.round(narrow.bar.width)}px bar, lamps ${narrow.lamps.map((lamp) => Math.round(lamp.box.left)).join("/")}, title "${narrow.title.text}"`);
  await page.locator('[data-window="teachText"] > .title-bar').screenshot({ path: resolve(output, "big-sur-phone-title-bar.png") });
  await page.screenshot({ path: resolve(output, "big-sur-phone-desk.png") });
  assert.deepEqual(errors, [], "no browser errors at phone width");
  await context.close();
});

// ---- NeXTSTEP: the dock's three classes of object ----------------------------

await scene("nextstep-dock-regions", async () => {
  const { context, page, errors } = await desk({ theme: "nextstep", experimental: true, deviceScaleFactor: 2 });
  await page.evaluate(async () => {
    await openWindow("projects");
    await openWindow("teachText");
    await openWindow("control");
    const places = {
      projects: ["90px", "90px", "480px", "360px"],
      teachText: ["330px", "160px", "520px", "320px"],
      control: ["600px", "330px", "520px", "360px"],
    };
    for (const [name, [left, top, width, height]] of Object.entries(places)) {
      const win = getWindow(name);
      win.style.left = left; win.style.top = top; win.style.width = width; win.style.height = height;
    }
    focusWindow(getWindow("teachText"));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(output, "nextstep-desktop.png") });

  const before = await page.evaluate(() => ({
    regions: [...document.querySelectorAll(".nextstep-dock > .nextstep-dock-region")].map((region) => ({
      id: region.dataset.dockRegion,
      label: region.querySelector(":scope > .nextstep-dock-region-label")?.textContent || "",
      hidden: region.hasAttribute("hidden"),
      tiles: [...region.querySelectorAll(":scope > .nextstep-dock-tile")].map((tile) => tile.dataset.dockKey),
    })),
  }));
  assert.deepEqual(before.regions.map((region) => region.id), ["fixed", "running", "windows"],
    "the dock holds the three classes as three regions, in the 3.3 order");
  assert.ok(before.regions[0].tiles.length > 0, "the fixed region holds the writer's own icons");
  assert.ok(before.regions[1].tiles.every((key) => !before.regions[0].tiles.includes(key)),
    "an application is drawn in one application region, never both");
  assert.equal(before.regions[2].hidden, true, "a region with no window miniatures is hidden, not labelled empty");

  await page.evaluate(() => {
    for (const name of ["projects", "teachText"]) {
      const win = getWindow(name);
      focusWindow(win);
      window.AISystem6NextstepShell.minimize(win);
    }
  });
  await page.waitForFunction(() => document.querySelectorAll(".nextstep-dock-windows [data-miniwindow]").length === 2);
  const after = await page.evaluate(() => ({
    miniwindows: [...document.querySelectorAll(".nextstep-dock-windows [data-miniwindow]")].map((tile) => ({
      window: tile.dataset.miniwindow, label: tile.getAttribute("aria-label"),
      caption: tile.querySelector(".nextstep-dock-tile-label")?.textContent || "",
    })),
    appTilesCarryingAWindow: document.querySelectorAll(".nextstep-dock-fixed [data-miniwindow], .nextstep-dock-running [data-miniwindow]").length,
  }));
  assert.equal(after.miniwindows.length, 2, "two miniaturized windows are two window miniatures");
  assert.deepEqual(after.miniwindows.map((tile) => tile.window).sort(), ["projects", "teachText"],
    "each window miniature names its own window");
  for (const tile of after.miniwindows) {
    assert.ok(tile.caption.length > 0 && tile.label.includes(tile.caption),
      `${tile.window}: the caption and the accessible name agree`);
  }
  assert.equal(after.appTilesCarryingAWindow, 0, "window miniatures are not mixed into the application regions");
  record("nextstep-dock-regions", "passed",
    `${before.regions.map((region) => `${region.id}${region.hidden ? "(hidden)" : ""}`).join(" / ")}; ${after.miniwindows.length} window miniatures`);
  const dock = await page.locator(".nextstep-dock").boundingBox();
  if (dock) await page.screenshot({ path: resolve(output, "nextstep-dock-three-regions.png"), clip: dock });
  await page.screenshot({ path: resolve(output, "nextstep-two-miniwindows.png") });
  assert.deepEqual(errors, [], "no browser errors during the NeXTSTEP scenes");
  await context.close();
});

await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
await browser.close();
if (failures.length) {
  console.error(`\nBig Sur / NeXTSTEP chrome capture failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nCaptured ${results.length} scene(s) into ${output}.`);
