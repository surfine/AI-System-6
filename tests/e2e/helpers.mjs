import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  ".."
);

export const E2E_PROJECT_NAME = "E2E Project";

export function lazyModuleSource(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/**
 * Boot the app and wait until the real boot sequence finishes.
 * `document.body.dataset.appReady` flips to "ready" only after workspace
 * load, working-session restore, and first paint complete. Each Playwright
 * test starts with a fresh browser context (empty localStorage/IndexedDB).
 */
export async function bootApp(page) {
  await page.goto("/");
  await page.waitForFunction(
    () => document.body.dataset.appReady === "ready",
    { timeout: 45_000 }
  );
}

export async function dismissGuide(page) {
  await page.click('[data-action="dismiss-guide"]');
  await page.waitForSelector('[data-window="guide"]', { state: "hidden", timeout: 10_000 });
}

/** Enter Writing Studio (switches the workspace profile to "writing"). */
export async function enterWritingStudio(page) {
  await page.dblclick("#finder-writing-studio-toggle");
  await page.waitForFunction(
    () => document.body.dataset.workspaceProfile === "writing",
    { timeout: 15_000 }
  );
}

/** Dispatch one of the app's registered actions (same path as a menu click). */
export async function runAction(page, action) {
  await page.evaluate((name) => {
    if (typeof handleAction !== "function") throw new Error("handleAction missing");
    return handleAction(name);
  }, action);
}

export async function openWindow(page, name) {
  await page.evaluate((windowName) => openWindow(windowName), name);
  try {
    await page.waitForFunction((windowName) => {
      const win = document.querySelector(`[data-window="${windowName}"]`);
      return win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden");
    }, name, { timeout: 15_000 });
  } catch (error) {
    const state = await page.evaluate((windowName) => {
      const win = document.querySelector(`[data-window="${windowName}"]`);
      return {
        className: win?.className || "(missing)",
        visibleWindows: [...document.querySelectorAll(".window:not(.is-hidden)")].map((w) => w.dataset.window),
        writingFlowLoaded: !!window.AISystem6WritingFlowLoaded,
        runtimeEnvironment: typeof runtimeEnvironment !== "undefined" ? runtimeEnvironment : "(n/a)",
        appReady: document.body.dataset.appReady,
      };
    }, name);
    console.log(`OPENWINDOW-DIAG ${name}`, JSON.stringify(state));
    throw error;
  }
}

export async function createProject(page, name = E2E_PROJECT_NAME) {
  await runAction(page, "new-project-disk");
  await page.waitForSelector("#new-project-disk-modal[open]", { timeout: 10_000 });
  await page.fill("#new-project-disk-name", name);
  await page.click("#new-project-disk-confirm");
  await page.waitForSelector("#new-project-disk-modal", { state: "hidden", timeout: 10_000 });
  // The project must be persisted and mounted; the visible window varies by
  // viewport (desktop shows the Project Hard Disk, a phone shows its own
  // mobile page), so verify against the real database record.
  await page.waitForFunction(
    (projectName) => new Promise((resolve) => {
      const open = indexedDB.open("ai-system-6-db");
      open.onsuccess = () => {
        const database = open.result;
        const tx = database.transaction("projects", "readonly");
        const all = tx.objectStore("projects").getAll();
        all.onsuccess = () => {
          database.close();
          resolve((all.result || []).some((project) => project.name === projectName));
        };
        all.onerror = () => {
          database.close();
          resolve(false);
        };
      };
      open.onerror = () => resolve(false);
    }),
    name,
    { timeout: 15_000 }
  );
}

export async function importMarkdown(page, markdown, fileName = "notes.md") {
  await runAction(page, "open-import-utility");
  await openWindow(page, "importUtility");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.click("#import-files-button");
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: fileName,
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown, "utf8"),
  });
  await page.waitForFunction(
    () => /Source Notes|notes\.md|正在预览|preview/i.test(document.querySelector("#import-preview")?.textContent || "")
  );
  await page.click("#import-documents");
  try {
    await page.waitForFunction(
      () => {
        const status = document.querySelector("#import-status")?.textContent || "";
        const grid = document.querySelector("#project-disk-grid")?.textContent || "";
        return /saved|written|record|写入|完成|imported|已写入|成功|写进/i.test(status)
          || (grid.includes(fileName) && /saved|written|record|写入|完成|imported|已写入|成功|写进/i.test(status));
      },
      { timeout: 20_000 }
    );
  } catch (error) {
    const status = await page.evaluate(() => document.querySelector("#import-status")?.textContent || "(no status)");
    const preview = await page.evaluate(() => document.querySelector("#import-preview")?.textContent?.slice(0, 300) || "");
    console.log("IMPORT-DIAG status:", JSON.stringify(status), "preview:", JSON.stringify(preview));
    throw error;
  }
}

export async function connectFakeModel(page, { port = 12934 } = {}) {
  await openWindow(page, "control");
  const result = await page.evaluate(async (fakePort) => {
    document.querySelector('.control-panel [data-control-tab="local"]')?.click();
    const endpoint = document.querySelector("#endpoint");
    if (endpoint) endpoint.value = `http://127.0.0.1:${fakePort}`;
    try {
      await connectLocalLmStudio({ toggle: false, silent: false });
      return {
        ok: true,
        model: document.querySelector("#model")?.value || "",
        options: document.querySelector("#model-select")?.options.length || 0,
        status: document.querySelector("#local-connection-status")?.textContent || "",
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error && error.message || error),
        status: document.querySelector("#local-connection-status")?.textContent || "",
      };
    }
  }, port);
  if (!result.ok) {
    throw new Error(`fake model connection failed: ${JSON.stringify(result)}`);
  }
  try {
    await page.waitForFunction(
      () => {
        const input = document.querySelector("#model");
        return input && input.value.trim() !== "";
      },
      { timeout: 15_000 }
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      status: document.querySelector("#local-connection-status")?.textContent || "",
      model: document.querySelector("#model")?.value || "",
      options: document.querySelector("#model-select")?.options.length || 0,
    }));
    throw new Error(`fake model did not become ready: ${JSON.stringify(state)}`);
  }
}

/**
 * Switch the desk into MultiFinder mode the same way the app's own
 * QuickDraft switch does: update the runtime environment, persist it, and
 * re-render the app switcher. Without this, single-task Finder mode closes
 * the previous app's windows when a Writing Studio window opens.
 */
export async function enableMultiFinder(page) {
  await page.evaluate(async () => {
    runtimeEnvironment = "multifinder";
    startupEnvironment = "multifinder";
    startupOpenMode = normalizeStartupOpenMode(startupOpenMode, "multifinder");
    if (typeof ensureRunningApp === "function") ensureRunningApp("writingStudio", "quickDraft");
    if (typeof renderMultiFinderMenu === "function") renderMultiFinderMenu();
    if (typeof updateMenuState === "function") updateMenuState();
    await saveDeskState();
  });
}

/** Read every IndexedDB store of the app database as plain data. */
export async function dumpIndexedDb(page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("ai-system-6-db");
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const dump = {};
    for (const storeName of db.objectStoreNames) {
      dump[storeName] = await new Promise((resolve) => {
        const tx = db.transaction(storeName, "readonly");
        const all = tx.objectStore(storeName).getAll();
        all.onsuccess = () => resolve(all.result || []);
        all.onerror = () => resolve([]);
      });
    }
    db.close();
    return dump;
  });
}

/**
 * Dismiss the first-launch guide, close every other open window, and wait for
 * the autosaved working-session snapshot to record the empty desk. A reload
 * then boots with guideSeen=true and no restored windows, so Writing Flow
 * stays unloaded until a user action summons it.
 */
export async function closeToEmptyDesk(page) {
  await page.click('[data-action="dismiss-guide"]');
  await page.evaluate(async () => {
    const visible = [...document.querySelectorAll(".window")]
      .filter((win) => !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"));
    for (const win of visible) {
      const name = win.dataset.window;
      if (name && name !== "guide" && typeof closeWindow === "function") {
        await closeWindow(name, true);
      }
    }
    if (typeof saveDeskState === "function") await saveDeskState();
    // The pagehide handler saves the working session, but an async IndexedDB
    // write can be dropped by the unload. Flush it explicitly and give the
    // transaction a beat before navigating.
    if (typeof flushWorkingSessionSave === "function") {
      await flushWorkingSessionSave();
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  await page.reload();
  await page.waitForFunction(
    () => document.body.dataset.appReady === "ready",
    { timeout: 45_000 }
  );
}

/** Count, and optionally intercept, requests to a lazy module path. */
export function spyOnLazyScript(page, modulePath, handler = null) {
  let requestCount = 0;
  const pattern = `**/${modulePath}*`;
  page.route(pattern, async (route) => {
    requestCount += 1;
    if (handler) await handler(route, requestCount);
    else await route.continue();
  });
  return {
    pattern,
    count: () => requestCount,
  };
}

export function fulfillFromDisk(relativePath, status = 200) {
  return async (route) => {
    await route.fulfill({
      status,
      contentType: "application/javascript; charset=utf-8",
      body: lazyModuleSource(relativePath),
    });
  };
}

export async function expectModal(page) {
  await page.waitForSelector("#system-modal[open]", { timeout: 15_000 });
  const message = await page.textContent("#system-modal-message");
  return { message };
}

export async function modalCancel(page) {
  await page.click("#system-modal-cancel");
  await page.waitForSelector("#system-modal", { state: "hidden", timeout: 10_000 });
}

export async function modalRetry(page) {
  await page.click("#system-modal-yes");
  await page.waitForSelector("#system-modal", { state: "hidden", timeout: 10_000 });
}
