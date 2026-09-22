import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = argument("--url", "http://127.0.0.1:43971");
const output = resolve(argument("--output", "internal/evidence/drafts/nextstep/edgecases"));
const requested = argument("--scene", "").split(",").filter(Boolean);
const scenes = [];
const add = (name, cases, run) => scenes.push({ name, cases, run });
const palette = (page) => page.locator(".nextstep-menu-palette:visible");
const action = (page, name) => palette(page).locator(`[data-nextstep-action="${name}"]`);

async function fixture(page) {
  const ids = await page.evaluate(async () => {
    await setFinderEnvironment("multifinder", { persistStartup: false });
    await openWindow("projects");
    selectedFolderId = "all";
    const now = new Date().toISOString();
    const a = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: null,
      type: "text", name: "Edge A.md", body: "Original A", createdAt: now, updatedAt: now };
    const b = { ...a, id: crypto.randomUUID(), name: "Edge B.md", body: "Original B" };
    chatFiles.push(a, b);
    renderProjectDisks();
    return { a: a.id, b: b.id, project: activeProjectId };
  });
  await page.locator(`.nextstep-finder-columns [data-object-id="${ids.a}"]`).waitFor();
  return ids;
}

async function finderFileMenu(page) {
  await palette(page).getByRole("menuitem", { name: "File", exact: true }).click();
  await action(page, "move-file-trash").waitFor();
}

async function center(locator) {
  const box = await locator.boundingBox();
  assert.ok(box, "gesture target must have visible geometry");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

add("finder-open-root", ["NS-17", "NS-10"], async (page) => {
  const ids = await fixture(page);
  const file = page.locator(`.nextstep-finder-columns [data-object-id="${ids.a}"]`);
  await file.dblclick();
  await page.waitForFunction((id) => activeTextFileId === id && !getWindow("teachText").classList.contains("is-hidden"), ids.a);
  assert.equal(await page.evaluate(() => teachTextBodyInput.value), "Original A");
  await page.locator('[data-dock-key="app:finder"]').dblclick();
  await file.click();
  await page.locator(`.nextstep-finder-path [data-object-id="${ids.project}"]`).click();
  assert.deepEqual(await page.evaluate(() => ({ keys: [...selectedDocumentItemKeys], file: selectedChatFileId,
    folder: selectedDocumentFolderId })), { keys: [], file: null, folder: null });
  await finderFileMenu(page);
  assert.equal(await action(page, "move-file-trash").isDisabled(), true, "project breadcrumb must not expose Delete for the previous file");
  assert.equal(await action(page, "rename-file").isDisabled(), true, "project breadcrumb must not expose Rename for the previous file");
  assert.equal(await page.evaluate((id) => chatFiles.find((item) => item.id === id)?.body, ids.a), "Original A");
});

add("menu-stale-selection", ["NS-10"], async (page) => {
  const ids = await fixture(page);
  await page.locator(`.nextstep-finder-columns [data-object-id="${ids.a}"]`).click();
  await finderFileMenu(page);
  assert.equal(await action(page, "move-file-trash").isEnabled(), true);
  // Simulates a selection change delivered while a persistent menu is open.
  // The command, menu context validation and deletion handler remain real.
  await page.evaluate((id) => selectDocumentItem("file", id), ids.b);
  await action(page, "move-file-trash").click();
  assert.deepEqual(await page.evaluate(({ a, b }) => ({
    a: !!chatFiles.find((item) => item.id === a), b: !!chatFiles.find((item) => item.id === b),
  }), ids), { a: true, b: true }, "a stale menu may not delete either the earlier or newly selected file");
});

add("menu-release-outside-item", ["NS-09", "NS-10", "NS-22"], async (page) => {
  const ids = await fixture(page);
  await page.locator(`.nextstep-finder-columns [data-object-id="${ids.a}"]`).click();
  await finderFileMenu(page);
  const trash = action(page, "move-file-trash");
  const menu = palette(page).filter({ has: page.locator('[data-nextstep-action="move-file-trash"]') });
  const start = await center(action(page, "rename-file"));
  const danger = await center(trash);
  const outside = await center(menu.locator("header button").first());
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(danger.x, danger.y, { steps: 5 });
  await page.mouse.move(outside.x, outside.y, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.evaluate((id) => chatFiles.some((file) => file.id === id), ids.a), true,
    "releasing on a menu title must not execute the last hovered Delete");
  assert.equal(await page.locator("dialog[open]").count(), 0, "cancelled menu gesture must not execute Rename either");
});

add("shelf-reference-integrity", ["NS-18"], async (page) => {
  const ids = await fixture(page);
  const viewer = page.locator(".nextstep-file-viewer");
  const file = viewer.locator(`.nextstep-finder-columns [data-object-id="${ids.a}"]`);
  await file.click();
  await viewer.getByRole("button", { name: "Add selection to Shelf", exact: true }).click();
  const shelfItem = viewer.locator(`.nextstep-shelf [data-object-id="${ids.a}"]`);
  await shelfItem.waitFor();
  await shelfItem.locator("..").getByRole("button", { name: "Remove shortcut", exact: true }).click();
  assert.equal(await shelfItem.count(), 0);
  assert.equal(await page.evaluate((id) => chatFiles.find((item) => item.id === id)?.body, ids.a), "Original A",
    "removing a Shelf shortcut must retain the original document");
  await file.click();
  await viewer.getByRole("button", { name: "Add selection to Shelf", exact: true }).click();
  await finderFileMenu(page);
  await action(page, "move-file-trash").click();
  await shelfItem.locator("xpath=self::*[contains(@class,'is-stale')]").waitFor();
  const replacement = await page.evaluate(({ a, b }) => {
    const template = chatFiles.find((item) => item.id === b);
    const replacement = { ...template, id: crypto.randomUUID(), name: "Edge A.md", body: "Different document" };
    chatFiles.push(replacement); renderProjectDisks();
    return { id: replacement.id, missingOriginal: !chatFiles.some((item) => item.id === a) };
  }, ids);
  assert.equal(replacement.missingOriginal, true);
  await shelfItem.click();
  assert.equal(await shelfItem.getAttribute("data-object-id"), ids.a);
  assert.ok((await shelfItem.getAttribute("class")).includes("is-stale"));
  assert.notEqual(await page.evaluate(() => activeTextFileId), replacement.id, "same-name replacement must not be opened through the stale reference");
  await shelfItem.locator("..").getByRole("button", { name: "Remove shortcut", exact: true }).click();
  assert.equal(await shelfItem.count(), 0);
  assert.equal(await page.evaluate((id) => chatFiles.find((item) => item.id === id)?.body, replacement.id), "Different document");
});

add("shelf-project-race-export", ["NS-19", "NS-18"], async (page) => {
  const ids = await fixture(page);
  const data = await page.evaluate(async () => {
    const projectA = activeProjectId;
    const projectB = createProjectRecord("Edge Project B");
    await window.AISystem6StateStores.projects.commit((draft) => draft.projects.push(projectB));
    const reference = { id: crypto.randomUUID(), projectId: projectA, name: "Private Shelf Source A",
      body: "Reference A original text", chunks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await putStoredProjectReference(reference);
    await loadActiveProjectReferences();
    renderProjectDisks();
    return { projectA, projectB: projectB.id, reference: reference.id };
  });
  const viewer = page.locator(".nextstep-file-viewer");
  await viewer.locator(`.nextstep-finder-columns [data-object-id="${data.reference}"]`).click();
  await viewer.getByRole("button", { name: "Add selection to Shelf", exact: true }).click();
  const shelfItem = viewer.locator(`.nextstep-shelf [data-object-id="${data.reference}"]`);
  const projectB = viewer.locator(`.nextstep-finder-columns [data-object-id="${data.projectB}"]`);
  await projectB.click();
  await page.waitForFunction((id) => activeProjectId === id && projectReferences.every((item) => item.projectId === id), data.projectB);
  await page.evaluate(({ projectA }) => {
    window.edgeStoredReferences = getStoredProjectReferences;
    window.edgeReferenceGate = null;
    window.edgeReferenceDelayed = true;
    getStoredProjectReferences = async function (projectId) {
      if (projectId === projectA && window.edgeReferenceDelayed) {
        window.edgeReferenceDelayed = false;
        await new Promise((release) => { window.edgeReferenceGate = release; });
      }
      return window.edgeStoredReferences(projectId);
    };
  }, data);
  await shelfItem.click();
  await page.waitForFunction(() => !!window.edgeReferenceGate);
  await projectB.click();
  await page.evaluate(() => window.edgeReferenceGate());
  await page.waitForFunction((id) => activeProjectId === id && projectReferences.every((item) => item.projectId === id), data.projectB);
  assert.equal(await viewer.locator(`.nextstep-finder-columns [data-object-id="${data.reference}"]`).count(), 0,
    "late A references may not appear in project B columns");
  assert.notEqual(await page.evaluate(() => getActiveDocumentTab("reader")?.backing?.id), data.reference,
    "superseded Shelf request may not open its Reader object in project B");
  await shelfItem.click();
  await page.waitForFunction(({ projectA, reference }) => activeProjectId === projectA
    && getActiveDocumentTab("reader")?.backing?.id === reference, data);
  assert.equal(await page.evaluate((id) => projectReferences.find((item) => item.id === id)?.body, data.reference), "Reference A original text");
  await page.locator('[data-dock-key="app:finder"]').dblclick();
  await projectB.click();
  await page.waitForFunction((id) => activeProjectId === id, data.projectB);
  const payload = await page.evaluate(async () => {
    const result = await readyProjectDiskBackup();
    if (!result) throw new Error("Real backup assembler returned no artifact");
    return result.text;
  });
  const backup = JSON.parse(payload);
  assert.equal(backup.project.id, data.projectB);
  assert.ok(!payload.includes(data.reference) && !payload.includes(ids.a), "project B export must exclude A's private Shelf references and files");
  assert.ok(!Object.hasOwn(backup, "nextstepFinderPreferences"), "personal Shelf settings must not enter the project backup schema");
  assert.equal(await page.evaluate((id) => nextstepFinderPreferences.shelf.some((item) => item.id === id), data.reference), true,
    "export must not remove the user's personal Shelf shortcut");
});

add("dock-lifecycle", ["NS-13", "NS-14"], async (page) => {
  await page.evaluate(async () => {
    await setFinderEnvironment("multifinder", { persistStartup: false });
    window.edgeOriginalOpen = openWindow;
    window.edgeOpenCalls = 0;
    window.edgeRelease = null;
    openWindow = async function (name, options) {
      const app = windowRegistry[name]?.app || window.AISystem6Admissions.windowRecord(name)?.app;
      if (app !== "teachText") return window.edgeOriginalOpen(name, options);
      window.edgeOpenCalls += 1;
      await new Promise((resolveGate, rejectGate) => {
        window.edgeRelease = (succeed) => succeed ? resolveGate() : rejectGate(new Error("Controlled opener failure"));
      });
      return window.edgeOriginalOpen(name, options);
    };
  });
  await page.locator(".nextstep-dock summary").click();
  await page.locator(".nextstep-dock details").getByRole("button", { name: "+ TeachText", exact: true }).click();
  const tile = page.locator('[data-dock-key="app:teachText"]');
  assert.equal(await tile.getAttribute("data-state"), "stopped");
  assert.equal(await page.evaluate(() => window.edgeOpenCalls), 0, "pinning must not launch an application");
  await tile.dblclick();
  await page.waitForFunction(() => !!window.edgeRelease);
  assert.equal(await tile.getAttribute("data-state"), "launching");
  await tile.dblclick();
  assert.equal(await page.evaluate(() => window.edgeOpenCalls), 1, "double activation must share the pending launch");
  await page.evaluate(() => window.edgeRelease(false));
  await page.waitForFunction(() => document.querySelector('[data-dock-key="app:teachText"]')?.dataset.state === "failed");
  assert.equal(await page.evaluate(() => runningApps.has("teachText")), false, "failed startup must not register a ghost running app");
  await tile.dblclick();
  await page.waitForFunction(() => window.edgeOpenCalls === 2);
  await page.evaluate(() => window.edgeRelease(true));
  await page.waitForFunction(() => document.querySelector('[data-dock-key="app:teachText"]')?.dataset.state === "running");
  assert.equal(await page.evaluate(() => windowsForApp("teachText").filter((win) => !win.classList.contains("is-hidden")).length), 1);
  await tile.dblclick();
  assert.equal(await page.evaluate(() => window.edgeOpenCalls), 2, "running activation must not relaunch");
});

add("dock-drag-unpin", ["NS-14"], async (page) => {
  await page.locator(".nextstep-dock summary").click();
  await page.locator(".nextstep-dock details").getByRole("button", { name: "+ TeachText", exact: true }).click();
  const tile = page.locator('[data-dock-key="app:teachText"]');
  await tile.dblclick();
  await page.waitForFunction(() => windowsForApp("teachText").some((win) => !win.classList.contains("is-hidden")));
  const before = await page.evaluate(() => ({ count: windowsForApp("teachText").length, running: runningApps.has("teachText") }));
  const point = await center(tile);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x - 15, point.y, { steps: 4 });
  await page.mouse.move(1100, 860, { steps: 12 });
  await page.mouse.move(1080, 860, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem("ai-system-6-nextstep-dock") || "[]").includes("teachText"));
  assert.deepEqual(await page.evaluate(() => ({ count: windowsForApp("teachText").length, running: runningApps.has("teachText") })), before);
  assert.equal(await page.evaluate(() => windowsForApp("teachText").filter((win) => !win.classList.contains("is-hidden")).length), 1);
  assert.equal(await tile.getAttribute("data-state"), "running", "unpinned running application remains reachable");
});

const chosen = requested.length ? scenes.filter(({ name }) => requested.includes(name)) : scenes;
assert.ok(chosen.length, `No scene matched --scene ${requested.join(",")}`);
assert.ok(requested.every((name) => scenes.some((scene) => scene.name === name)), "Unknown scene name");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const scene of chosen) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem("ai-system-6-nextstep-dock", JSON.stringify(["finder"]));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const result = { name: scene.name, cases: scene.cases, status: "not_run", browserErrors };
    try {
      await page.goto(`${url.replace(/\/$/, "")}/?debugTheme=nextstep`);
      await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 45000 });
      await page.evaluate(() => { for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close(); });
      await page.locator(".nextstep-dock").waitFor();
      await scene.run(page);
      assert.deepEqual(browserErrors, [], "unexpected browser errors");
      result.status = "passed";
      console.log(`PASS ${scene.name}`);
    } catch (error) {
      result.status = "failed";
      result.error = error.stack || error.message;
      console.error(`FAIL ${scene.name}: ${error.message}`);
    } finally {
      result.screenshot = resolve(output, `${scene.name}-${result.status}.png`);
      await page.screenshot({ path: result.screenshot }).catch((error) => { result.screenshotError = error.message; });
      evidence.push(result);
      await writeFile(resolve(output, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), url, evidence }, null, 2));
      await context.close();
    }
  }
} finally { await browser.close(); }
if (evidence.some(({ status }) => status !== "passed")) process.exitCode = 1;
