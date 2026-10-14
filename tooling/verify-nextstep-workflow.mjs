import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const argument = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const url = argument("--url", "http://127.0.0.1:4173");
const output = resolve(argument("--output", "internal/evidence/drafts/nextstep/workflow"));
const requestedScene = argument("--scene", "");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = [];
const failures = [];
async function scene(name, task, options = {}) {
  if (argument("--scene", name) !== name) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${url}/${name.startsWith("resources") ? "" : "?debugTheme=nextstep"}`);
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 60000 });
    await page.evaluate(() => { for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close(); });
    await task(page, context);
    assert.deepEqual(errors, [], `${name}: browser errors`);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    evidence.push({ name, status: "passed", browserErrors: errors });
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    evidence.push({ name, status: "failed", error: error.message, browserErrors: errors });
    await page.screenshot({ path: resolve(output, `${name}-failed.png`) }).catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}

try {
  await scene("resources", async (page, context) => {
    const network = await context.newCDPSession(page);
    await network.send("Network.enable");
    await network.send("Network.setBypassServiceWorker", { bypass: true });
    await page.route("**/styles.nextstep.css*", (route) => route.fulfill({ status: 404, body: "missing" }));
    await page.evaluate(() => AISystem6Theme.previewExperimentalTheme("nextstep"));
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "classic");
    await page.unroute("**/styles.nextstep.css*");
    let release;
    const gate = new Promise((resolveGate) => { release = resolveGate; });
    let requested;
    const arrived = new Promise((resolveArrived) => { requested = resolveArrived; });
    await page.route("**/styles.nextstep.css*", async (route) => { requested(); await gate; await route.continue(); });
    const older = page.evaluate(() => AISystem6Theme.previewExperimentalTheme("nextstep"));
    await arrived;
    await page.evaluate(() => applyTheme("aqua"));
    release(); await older;
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "aqua");
    await page.unroute("**/styles.nextstep.css*");
    await page.evaluate(() => applyTheme("nextstep", { experimental: true, persist: false }));
    assert.equal(await page.evaluate(() => AISystem6Theme.getCommittedTheme()), "aqua");
    await page.evaluate(() => {
      const dialog = document.createElement("dialog"); dialog.id = "appearance-guard-test"; document.body.append(dialog); dialog.showModal();
      window.appearancePending = applyTheme("classic");
    });
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "nextstep");
    await page.evaluate(() => document.getElementById("appearance-guard-test").close());
    await page.evaluate(() => window.appearancePending);
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "classic");
    await page.evaluate(async () => { await openWindow("teachText"); teachTextBodyInput.focus(); });
    await network.send("Input.imeSetComposition", { text: "中文", selectionStart: 2, selectionEnd: 2 });
    await page.evaluate(() => { window.imeAppearance = applyTheme("nextstep", { experimental: true, persist: false }); });
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "classic");
    await network.send("Input.insertText", { text: "中文" });
    await page.evaluate(() => window.imeAppearance);
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "nextstep");
    assert.ok(await page.evaluate(() => teachTextBodyInput.value.includes("中文")));
  });

  await scene("resources-module", async (page, context) => {
    const network = await context.newCDPSession(page);
    await network.send("Network.enable");
    await network.send("Network.setBypassServiceWorker", { bypass: true });
    await page.route("**/app/core/nextstep-dock.js*", (route) => route.fulfill({ status: 404, body: "missing" }));
    await page.evaluate(() => AISystem6Theme.previewExperimentalTheme("nextstep"));
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "classic");
    assert.equal(await page.locator(".nextstep-dock").count(), 0);
    await page.unroute("**/app/core/nextstep-dock.js*");
    await page.evaluate(() => AISystem6Theme.previewExperimentalTheme("nextstep"));
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "nextstep");
    await page.locator(".nextstep-dock").waitFor();
  });

  await scene("windows", async (page) => {
    await page.evaluate(async () => {
      await setFinderEnvironment("multifinder", { persistStartup: false });
      await openWindow("teachText");
      const win = getWindow("teachText"); win.style.width = "550px"; win.style.height = "400px"; win.style.left = "300px"; win.style.top = "120px";
      window.retainedEditor = teachTextBodyInput;
      teachTextBodyInput.value = "Keep this exact text and selection.";
      teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
      teachTextBodyInput.focus(); teachTextBodyInput.setSelectionRange(5, 9);
    });
    const win = page.locator('[data-window="teachText"]');
    await win.locator(".nextstep-miniaturize").click();
    assert.equal(await win.evaluate((node) => node.classList.contains("is-minimized")), true);
    await page.locator('[data-miniwindow="teachText"]').dblclick();
    assert.deepEqual(await page.evaluate(() => ({ same: retainedEditor === teachTextBodyInput,
      text: teachTextBodyInput.value, start: teachTextBodyInput.selectionStart, end: teachTextBodyInput.selectionEnd })),
    { same: true, text: "Keep this exact text and selection.", start: 5, end: 9 });
    const before = await win.boundingBox();
    await win.locator('[data-resize-edge="center"]').press("ArrowDown");
    const after = await win.boundingBox();
    assert.equal(after.width, before.width); assert.equal(after.height, before.height + 16);
    await page.evaluate(async () => { await openWindow("control"); focusWindow(getWindow("control")); });
    const activeBefore = await page.evaluate(() => document.querySelector(".window.is-active")?.dataset.window);
    await win.locator(".nextstep-miniaturize").click();
    assert.equal(await page.evaluate(() => document.querySelector(".window.is-active")?.dataset.window), activeBefore);
    await page.evaluate(() => hideApp("teachText"));
    assert.equal(await page.locator('[data-miniwindow="teachText"]').count(), 0);
    await page.evaluate(() => AISystem6NextstepDock.activate("teachText"));
    assert.equal(await win.evaluate((node) => node.classList.contains("is-minimized")), true);
    // An era that holds no miniwindow control releases the put-away window by
    // rolling it up where it stood (d5949b2a9: a put-away window always has a
    // way back -- the scene's old expectation, that is-minimized survives the
    // switch, predates that rule and the 08:58 commit; the last green evidence
    // ran at 08:21). The window stays on the desk, shaded, same element.
    await page.evaluate(() => applyTheme("liquid-glass"));
    assert.deepEqual(await win.evaluate((node) => ({
      minimized: node.classList.contains("is-minimized"),
      collapsed: node.classList.contains("is-collapsed"),
      hidden: node.classList.contains("is-hidden"),
    })), { minimized: false, collapsed: true, hidden: false }, "liquid-glass rolls the put-away window up in place instead of dropping it");
    await page.evaluate(() => focusWindow(getWindow("teachText")));
    assert.equal(await page.locator(".nextstep-dock").count(), 0);
    assert.equal(await page.evaluate(() => retainedEditor === teachTextBodyInput), true);
    await page.evaluate(() => applyTheme("nextstep", { experimental: true, persist: false }));
    await page.evaluate(() => { window.cancelQuit = quitApp("teachText"); });
    await page.locator("#system-modal-cancel").click();
    await page.evaluate(() => window.cancelQuit);
    assert.equal(await win.evaluate((node) => node.classList.contains("is-hidden")), false);
  });

  await scene("finder-and-menus", async (page) => {
    await page.evaluate(() => openWindow("teachText"));
    const palettes = page.locator(".nextstep-menu-palette:visible");
    await palettes.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await palettes.filter({ has: page.locator("header button", { hasText: "Edit" }) }).first().locator("header button").first().press("Enter");
    assert.ok(await page.locator('.nextstep-menu-palette[data-detached="true"]:visible').count());
    await page.evaluate(() => openWindow("projects"));
    const menuTitle = page.locator(".nextstep-menu-palette:visible").locator("header button").first();
    for (let i = 0; i < 36; i += 1) await menuTitle.press("Alt+ArrowDown");
    const ids = await page.evaluate(() => {
      const folder = createFinderFolder("Evidence A", null); const child = createFinderFolder("Nested", folder.id);
      const file = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: child.id, type: "text", name: "Original.md", body: "Keep this exact text.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      chatFiles.push(file); renderProjectDisks(); return { folder: folder.id, child: child.id, file: file.id };
    });
    const viewer = page.locator(".nextstep-file-viewer");
    await viewer.locator(`[data-object-id="${ids.folder}"]`).first().click();
    await viewer.locator(`[data-object-id="${ids.child}"]`).last().click();
    await viewer.locator(`[data-object-id="${ids.file}"]`).click();
    await viewer.getByRole("button", { name: "Add selection to Shelf", exact: true }).click();
    assert.equal(await viewer.locator(".nextstep-shelf [data-object-id]").count(), 1);
    await page.evaluate((id) => { chatFiles.find((file) => file.id === id).name = "Renamed.md"; renderProjectDisks(); }, ids.file);
    await viewer.locator(".nextstep-shelf").getByRole("button", { name: "Renamed.md", exact: true }).waitFor();
    await page.evaluate((id) => { chatFiles.splice(chatFiles.findIndex((file) => file.id === id), 1); renderProjectDisks(); }, ids.file);
    await viewer.locator(".nextstep-shelf .is-stale").waitFor();
    assert.equal(await viewer.locator(".nextstep-shelf .is-stale").getAttribute("data-object-id"), ids.file);
  });

  await scene("arrange-in-front", async (page) => {
    // 3.3's Arrange in Front: "Stacks and offsets all the application's
    // document windows." The window list is the application's, the front window
    // keeps the base position and stays key, and a window the work area cannot
    // hold gives its offset back rather than being pushed off the desk.
    await page.evaluate(async () => {
      await setFinderEnvironment("multifinder", { persistStartup: false });
      await openWindow("projects");
      await openWindow("applications");
      await openWindow("trash");
      focusWindow(getWindow("projects"), true);
    });
    assert.equal(await page.evaluate(() => document.querySelector(".window.is-active")?.dataset.window), "projects");
    assert.equal(await page.evaluate(() => handleAction("nextstep-arrange-in-front")), true, "Arrange in Front reports that it moved the stack");
    const arranged = await page.evaluate(() => {
      const frames = applicationWindowOrder("finder").map((win) => {
        const box = win.getBoundingClientRect();
        return { name: win.dataset.window, left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      });
      const desk = document.querySelector(".desktop").getBoundingClientRect();
      return {
        frames,
        desk: { right: desk.right, bottom: desk.bottom },
        inset: getDesktopAvoidanceInsets({ margin: 24, spineGap: 18, iconGap: 48 }),
        active: document.querySelector(".window.is-active")?.dataset.window,
      };
    });
    assert.equal(arranged.active, "projects", "the front window stays key across the cascade");
    assert.equal(arranged.frames[0].name, "projects", "and keeps the base position");
    assert.ok(arranged.frames.length >= 3, `three document windows of the application were cascaded (got ${arranged.frames.length})`);
    for (let index = 1; index < arranged.frames.length; index += 1) {
      assert.ok(arranged.frames[index].left >= arranged.frames[index - 1].left, `window ${index} takes a step right, not left`);
      assert.ok(arranged.frames[index].top >= arranged.frames[index - 1].top, `window ${index} takes a step down, not up`);
    }
    for (const frame of arranged.frames) {
      // Every window stayed reachable: inside the work area's right and bottom
      // edges, and never left of or above the desk.
      assert.ok(frame.left >= 0 && frame.top >= 0, `${frame.name} stays inside the desk`);
      assert.ok(frame.right <= arranged.desk.right - arranged.inset.right + 1, `${frame.name} does not run under the Dock`);
      assert.ok(frame.bottom <= arranged.desk.bottom - arranged.inset.bottom + 1, `${frame.name} does not run past the bottom edge`);
    }
    assert.equal(await page.evaluate(() => handleAction("nextstep-arrange-in-front")), false, "a second arrange on an arranged desk reports that instead of moving anything");
    // An application whose only document window is already where the cascade
    // would put it reports instead of going quiet: close the assistant
    // ClioTalk opens during onboarding, so its window list is genuinely empty.
    assert.equal(await page.evaluate(async () => { await closeWindow("assistant"); return handleAction("nextstep-arrange-in-front", { appId: "clioTalk" }); }), false, "an application with no document windows reports that too");
  });

  await scene("key-main", async (page, context) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async () => {
      await setFinderEnvironment("multifinder", { persistStartup: false });
      await openWindow("teachText");
      const file = { id: crypto.randomUUID(), projectId: activeProjectId, type: "text", name: "Key-main.md", body: "Before save", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      chatFiles.push(file); window.keyMainFileId = file.id; await openTextFile(file.id);
      teachTextBodyInput.value = "Main document remains the save target.";
      teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
      conversation.push({ role: "user", content: "Unrelated chat must not steal Save." });
      await handleAction("open-find-change");
    });
    await page.locator("#find-change-query").focus();
    await page.evaluate(() => navigator.clipboard.writeText("Paste into Find"));
    await page.evaluate(() => handleAction("paste"));
    assert.equal(await page.locator("#find-change-query").inputValue(), "Paste into Find");
    assert.equal(await page.locator("#teachtext-body").inputValue(), "Main document remains the save target.");
    assert.equal(await page.locator('[data-window="teachText"]').evaluate((win) => win.classList.contains("is-nextstep-main")), true);
    assert.equal(await page.locator('[data-window="findChange"]').evaluate((win) => win.classList.contains("is-active")), true);
    await page.evaluate(() => handleAction("save-current"));
    await page.waitForFunction(() => chatFiles.find((file) => file.id === keyMainFileId)?.body === "Main document remains the save target.");
    assert.equal(await page.locator('[data-window="saveChat"]').evaluate((win) => win.classList.contains("is-hidden")), true);
  });

  await scene("session", async (page) => {
    await page.evaluate(async () => {
      await setFinderEnvironment("multifinder", { persistStartup: true });
      await openWindow("teachText");
      AISystem6NextstepShell.minimize(getWindow("teachText"));
      await flushWorkingSessionCommit();
    });
    assert.ok(await page.evaluate(async () => (await readWorkingSessionSnapshot()).adapters.windows.windows.some((entry) => entry.name === "teachText" && entry.minimized)));
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 60000 });
    assert.equal(await page.locator('[data-window="teachText"]').evaluate((win) => win.classList.contains("is-minimized")), true);
    await page.locator('[data-miniwindow="teachText"]').press("Enter");
    assert.equal(await page.locator('[data-window="teachText"]').evaluate((win) => win.classList.contains("is-minimized")), false);
    await page.evaluate(async () => {
      const old = captureWindowWorkingSession();
      old.windows.forEach((entry) => { delete entry.minimized; });
      await restoreWindowWorkingSession(old);
    });
    assert.equal(await page.locator('[data-window="teachText"]').evaluate((win) => win.classList.contains("is-minimized")), false);
  });

  await scene("offline", async (page, context) => {
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60000 });
    await page.evaluate(() => navigator.serviceWorker.controller.postMessage({ type: "keep-appearance", appearance: "nextstep" }));
    await page.waitForFunction(async () => {
      const paths = (await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)))).flat();
      return ["styles.nextstep.css", "nextstep-shell.js", "nextstep-dock.js", "nextstep-menus.js", "finder-columns.js"].every((file) => paths.some((path) => path.endsWith(file)));
    }, null, { timeout: 60000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), "nextstep");
    await page.locator(".nextstep-dock").waitFor();
    await page.evaluate(() => applyTheme("classic"));
    assert.equal(await page.locator(".nextstep-dock").count(), 0);
    await context.setOffline(false);
  });

  await scene("all-appearances", async (page) => {
    const themes = await page.evaluate(() => AISystem6Theme.getReleaseReadyThemes().map((theme) => theme.id));
    await page.evaluate(() => openWindow("applications"));
    for (const theme of themes) {
      await page.evaluate((id) => applyTheme(id), theme);
      assert.equal(await page.evaluate(() => AISystem6Theme.getCurrentTheme()), theme);
      const win = page.locator('[data-window="applications"]');
      assert.equal(await win.locator(".title-bar > .close-box").count(), 1);
      assert.equal(await win.locator(".title-bar > .resize-box").count(), 1);
      if (theme !== "nextstep") {
        assert.equal(await page.locator(".nextstep-dock").count(), 0);
        assert.equal(await page.locator(".nextstep-menu-palette:visible").count(), 0);
      }
      await page.evaluate(() => { zoomWindow(getWindow("applications")); zoomWindow(getWindow("applications")); });
      await page.screenshot({ path: resolve(output, `regression-${theme}.png`) });
    }
    evidence.push({ name: "release-registry", themes });
  });

  await scene("touch", async (page) => {
    // A phone has no desk (nextstep-shell.css): the palette, the Dock column
    // and the desk row come off the phone line, and the shared phone menu bar
    // carries the same menus. The scene used to tap the Dock on the phone;
    // that path is from 2026-09-22–25, the three-day window when the phone
    // still drew the column, and the instrument's last full pass (2026-09-23)
    // predates the decision that took it off. The phone opens the era's
    // windows through the shared menu bar, like every other era does.
    await page.evaluate(() => applyTheme("nextstep", { experimental: true, persist: false }));
    const menuBar = page.locator(".menu-bar");
    await menuBar.waitFor();
    // display:none is the CSS phone rule's answer; the palette module keeps its
    // own hidden attribute (the owner switch), so the paint state is what the
    // phone must prove, not the DOM node's absence.
    assert.equal(await page.evaluate(() => {
      const palette = document.querySelector(".nextstep-menu-palette");
      const dock = document.querySelector(".nextstep-dock");
      return [palette, dock].every((node) => !node || getComputedStyle(node).display === "none");
    }), true, "neither the palette nor the Dock paints on the phone");
    // The era's own windows come from the phone menu bar's menus.
    await page.evaluate(() => handleAction("open-teachtext"));
    await page.locator('[data-window="teachText"]:not(.is-hidden)').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 844, height: 390 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "forced colors keep the phone line inside its width");
  }, { viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
} finally {
  await writeFile(resolve(output, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), url, evidence }, null, 2));
  await browser.close();
}

// A scene that failed must refuse, and so must a --scene name that matches
// nothing: before this, asking for a misspelled scene exited 0 having run no
// assertions at all, which reads as a pass for a shell nobody exercised.
const ranRequested = !requestedScene || evidence.some(({ name }) => name === requestedScene);
if (!ranRequested) {
  console.error(`No scene matched --scene ${requestedScene}`);
  process.exitCode = 1;
}
if (failures.length) {
  console.error(`NeXTSTEP workflow: ${failures.length} scene(s) failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
