import { expect, test } from "@playwright/test";

const mobileMatrix = [
  { name: "phone portrait", width: 390, height: 844 },
  { name: "phone landscape", width: 844, height: 390 },
  { name: "tablet portrait", width: 820, height: 1180 },
  { name: "tablet landscape", width: 1180, height: 820 },
];

const realIwadPath = process.env.DOOM_TEST_IWAD || "";

function observeFailures(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  return { consoleErrors, pageErrors, requests };
}

function syntheticIwad() {
  const bytes = Buffer.alloc(12);
  bytes.write("IWAD", 0, 4, "ascii");
  bytes.writeUInt32LE(0, 4);
  bytes.writeUInt32LE(12, 8);
  return bytes;
}

function wadRequests(requests) {
  return requests.filter((url) => /\.(?:wad|pk3)(?:[?#]|$)/i.test(url));
}

async function waitForShellState(page, state, timeout = 30_000) {
  await expect(page.locator("body")).toHaveAttribute("data-engine-state", state, { timeout });
}

async function chooseLocalWad(page, file) {
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.locator("#wad-choose").click({ timeout: 10_000 });
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

test("the real zero-WAD engine reaches needs-data in all mobile orientations", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "The engine bootstrap smoke uses the pinned Chromium runtime.");
  const observed = observeFailures(page);

  for (const viewport of mobileMatrix) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);
      await page.goto("/assets/doom/index.html?lang=zh", { waitUntil: "domcontentloaded" });
      await waitForShellState(page, "needs-data");
      await expect(page.locator("#engine-phase")).toContainText("本机 IWAD");
      await expect(page.locator("#engine-play")).toBeDisabled();
      await expect(page.locator("#game-stage")).toBeHidden();
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(dimensions).toEqual({
        scrollWidth: viewport.width,
        scrollHeight: viewport.height,
        width: viewport.width,
        height: viewport.height,
      });
    });
  }

  expect(wadRequests(observed.requests)).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.consoleErrors).toEqual([]);
});

test("the desktop lazy-loads, pauses, releases, and reopens the zero-WAD engine", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "The engine bootstrap smoke uses the pinned Chromium runtime.");
  await page.setViewportSize({ width: 390, height: 844 });
  const observed = observeFailures(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  expect(observed.requests.filter((url) => /(?:features\/doom\.js|assets\/doom\/)/i.test(url))).toEqual([]);

  await page.evaluate(async () => { await openWindow("doom"); });
  const frameElement = page.locator('iframe[title="DOOM engine"]');
  await expect(frameElement).toHaveCount(1);
  const shell = page.frameLocator('iframe[title="DOOM engine"]');
  await expect(shell.locator("body")).toHaveAttribute("data-engine-state", "needs-data", { timeout: 30_000 });
  await expect(page.locator("[data-doom-status]")).toContainText("WAD");

  const gameWindow = page.locator('[data-window="doom"]');
  await expect(gameWindow).toBeVisible();
  await expect(gameWindow).toHaveClass(/is-mobile-fullscreen/);

  await page.evaluate(() => hideApp("doom"));
  await expect(gameWindow).toHaveClass(/is-collapsed/);
  await page.evaluate(() => unhideApp("doom"));
  await expect(gameWindow).not.toHaveClass(/is-collapsed/);
  await expect(shell.locator("body")).toHaveAttribute("data-engine-state", "needs-data");

  await page.evaluate(async () => { await quitApp("doom"); });
  await expect(frameElement).toHaveCount(0, { timeout: 5_000 });
  await page.evaluate(async () => { await openWindow("doom"); });
  const reopenedShell = page.frameLocator('iframe[title="DOOM engine"]');
  await expect(reopenedShell.locator("body")).toHaveAttribute("data-engine-state", "needs-data", { timeout: 30_000 });
  await expect(reopenedShell.locator("#engine-play")).toBeDisabled();

  expect(wadRequests(observed.requests)).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.consoleErrors).toEqual([]);
});

test("a synthetic local IWAD imports atomically and persists after reload", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "The IDBFS engine diagnostic uses the pinned Chromium runtime.");
  const observed = observeFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/assets/doom/index.html?lang=en", { waitUntil: "domcontentloaded" });
  await waitForShellState(page, "needs-data");

  await chooseLocalWad(page, {
    name: "synthetic-local.wad",
    mimeType: "application/octet-stream",
    buffer: syntheticIwad(),
  });
  await waitForShellState(page, "ready", 45_000);
  await expect(page.locator("#engine-play")).toBeEnabled();
  await expect(page.locator("#wad-list")).toContainText("synthetic-local.wad");

  const beforeReload = await page.evaluate(() => window.AISystem6DoomShell.debugSnapshot());
  expect(beforeReload.state).toBe("ready");
  expect(beforeReload.gameStarted).toBe(false);
  expect(beforeReload.activeWad).toMatchObject({ kind: "IWAD", name: "synthetic-local.wad", bytes: 12 });
  expect(beforeReload.activeWad.sha256).toMatch(/^[a-f0-9]{64}$/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForShellState(page, "ready", 45_000);
  await expect(page.locator("#engine-play")).toBeEnabled();
  await expect(page.locator("#wad-list")).toContainText("synthetic-local.wad");
  const afterReload = await page.evaluate(() => window.AISystem6DoomShell.debugSnapshot());
  expect(afterReload.gameStarted).toBe(false);
  expect(afterReload.activeWad).toMatchObject({
    kind: "IWAD",
    name: "synthetic-local.wad",
    bytes: 12,
    sha256: beforeReload.activeWad.sha256,
    id: beforeReload.activeWad.id,
  });

  expect(wadRequests(observed.requests)).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.consoleErrors).toEqual([]);
});

test("missing engine glue fails visibly and Retry recovers", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "The engine bootstrap smoke uses the pinned Chromium runtime.");
  let failFirstEngineRequest = true;
  await page.route("**/assets/doom/chocolate-doom.js", async (route) => {
    if (failFirstEngineRequest) {
      failFirstEngineRequest = false;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  await page.evaluate(async () => { await openWindow("doom"); });
  await expect(page.locator("[data-doom-status]")).toContainText(/could not start|未能启动/i, { timeout: 15_000 });
  await page.locator(".doom-pane .btn").click({ timeout: 5_000 });

  const recoveredShell = page.frameLocator('iframe[title="DOOM engine"]');
  await expect(recoveredShell.locator("body")).toHaveAttribute("data-engine-state", "needs-data", { timeout: 30_000 });
  await expect(page.locator("[data-doom-status]")).toContainText("WAD");
});

test("an explicitly supplied real IWAD starts a rendered game and native input bridge", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "The playable engine smoke uses the pinned Chromium runtime.");
  test.skip(!realIwadPath, "Set DOOM_TEST_IWAD to a local IWAD (for example Freedoom) to run this opt-in smoke.");
  const observed = observeFailures(page);

  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    window.__doomTestGamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "AI System 6 E2E controller",
      index: 0,
      mapping: "standard",
      timestamp: 0,
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [window.__doomTestGamepad],
    });
  });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/assets/doom/index.html?lang=en", { waitUntil: "domcontentloaded" });
  await waitForShellState(page, "needs-data");
  await chooseLocalWad(page, realIwadPath);
  await waitForShellState(page, "ready", 120_000);
  await expect(page.locator("#engine-play")).toBeEnabled();

  await page.locator("#engine-play").click({ timeout: 10_000 });
  await waitForShellState(page, "running", 120_000);
  await expect(page.locator("#game-stage")).toBeVisible();
  await expect(page.locator("#engine-card")).toBeHidden();
  await page.waitForFunction(() => {
    const snapshot = window.AISystem6DoomShell?.debugSnapshot?.();
    return snapshot?.state === "running" && snapshot.nativeInputCount > 0;
  }, undefined, { timeout: 30_000 });

  const beforeMenuInput = await page.evaluate(
    () => window.AISystem6DoomShell.debugSnapshot().nativeInputCount,
  );
  await page.evaluate(() => {
    const start = window.__doomTestGamepad.buttons[9];
    start.pressed = true;
    start.touched = true;
    start.value = 1;
  });
  await page.waitForFunction((baseline) => {
    const snapshot = window.AISystem6DoomShell?.debugSnapshot?.();
    return snapshot?.nativeInputCount > baseline;
  }, beforeMenuInput, { timeout: 10_000 });
  const afterMenuPress = await page.evaluate(
    () => window.AISystem6DoomShell.debugSnapshot().nativeInputCount,
  );
  await page.evaluate(() => {
    const start = window.__doomTestGamepad.buttons[9];
    start.pressed = false;
    start.touched = false;
    start.value = 0;
  });
  await page.waitForFunction((baseline) => {
    const snapshot = window.AISystem6DoomShell?.debugSnapshot?.();
    return snapshot?.state === "running"
      && snapshot.lastInputFrame?.menu === false
      && snapshot.nativeInputCount > baseline;
  }, afterMenuPress, { timeout: 10_000 });

  const confirmationCounts = [];
  for (let confirmation = 0; confirmation < 2; confirmation += 1) {
    const beforePress = await page.evaluate(
      () => window.AISystem6DoomShell.debugSnapshot().nativeInputCount,
    );
    await page.evaluate(() => {
      const trigger = window.__doomTestGamepad.buttons[7];
      trigger.pressed = true;
      trigger.touched = true;
      trigger.value = 1;
    });
    await page.waitForFunction((baseline) => {
      const snapshot = window.AISystem6DoomShell?.debugSnapshot?.();
      return snapshot?.state === "running"
        && snapshot.lastInputFrame?.fire === true
        && snapshot.nativeInputCount > baseline;
    }, beforePress, { timeout: 10_000 });
    const afterPress = await page.evaluate(
      () => window.AISystem6DoomShell.debugSnapshot().nativeInputCount,
    );
    confirmationCounts.push(afterPress);
    await page.evaluate(() => {
      const trigger = window.__doomTestGamepad.buttons[7];
      trigger.pressed = false;
      trigger.touched = false;
      trigger.value = 0;
    });
    await page.waitForFunction((baseline) => {
      const snapshot = window.AISystem6DoomShell?.debugSnapshot?.();
      return snapshot?.state === "running"
        && snapshot.lastInputFrame?.fire === false
        && snapshot.nativeInputCount > baseline;
    }, afterPress, { timeout: 10_000 });
  }
  expect(confirmationCounts).toHaveLength(2);
  expect(confirmationCounts[1]).toBeGreaterThan(confirmationCounts[0]);

  const canvas = page.locator("#game-canvas");
  const canvasState = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    cssWidth: element.getBoundingClientRect().width,
    cssHeight: element.getBoundingClientRect().height,
  }));
  expect(canvasState.width).toBeGreaterThan(0);
  expect(canvasState.height).toBeGreaterThan(0);
  expect(canvasState.cssWidth).toBeGreaterThan(0);
  expect(canvasState.cssHeight).toBeGreaterThan(0);
  expect(canvasState.cssWidth / canvasState.cssHeight).toBeCloseTo(4 / 3, 1);
  const renderedFrame = await canvas.screenshot({ timeout: 30_000 });
  expect(renderedFrame.byteLength).toBeGreaterThan(2_048);

  const debug = await page.evaluate(() => window.AISystem6DoomShell.debugSnapshot());
  expect(debug).toMatchObject({ state: "running", gameStarted: true });
  expect(debug.activeWad.kind).toBe("IWAD");
  expect(debug.nativeInputCount).toBeGreaterThan(0);
  expect(debug.lastInputFrame.fire).toBe(false);
  expect(Object.keys(debug.lastInputFrame).sort()).toEqual([
    "fire",
    "map",
    "menu",
    "move",
    "run",
    "strafe",
    "turn",
    "use",
    "weaponDelta",
  ]);

  expect(wadRequests(observed.requests)).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.consoleErrors.filter((message) => /uncaught|runtimeerror|abort\(|unhandled/i.test(message))).toEqual([]);
});
