import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide } from "./helpers.mjs";

async function installStorageCounters(page) {
  await page.evaluate(() => {
    const original = {
      put: IDBObjectStore.prototype.put,
      delete: IDBObjectStore.prototype.delete,
      clear: IDBObjectStore.prototype.clear,
    };
    window.__idbWriteCounters = { puts: {}, deletes: {}, clears: {} };
    window.__resetIdbWriteCounters = () => {
      window.__idbWriteCounters = { puts: {}, deletes: {}, clears: {} };
    };
    window.__restoreIdbWriteCounters = () => {
      IDBObjectStore.prototype.put = original.put;
      IDBObjectStore.prototype.delete = original.delete;
      IDBObjectStore.prototype.clear = original.clear;
    };
    IDBObjectStore.prototype.put = function put(...args) {
      const counts = window.__idbWriteCounters.puts;
      counts[this.name] = (counts[this.name] || 0) + 1;
      return original.put.apply(this, args);
    };
    IDBObjectStore.prototype.delete = function deleteRecord(...args) {
      const counts = window.__idbWriteCounters.deletes;
      counts[this.name] = (counts[this.name] || 0) + 1;
      return original.delete.apply(this, args);
    };
    IDBObjectStore.prototype.clear = function clear(...args) {
      const counts = window.__idbWriteCounters.clears;
      counts[this.name] = (counts[this.name] || 0) + 1;
      return original.clear.apply(this, args);
    };
  });
}

async function counters(page) {
  return page.evaluate(() => structuredClone(window.__idbWriteCounters));
}

test("desk persistence writes only changed records and retries failed puts", async ({ page }) => {
  await bootApp(page);
  if (await page.locator('[data-window="welcomeDisk"]:not(.is-hidden)').isVisible().catch(() => false)) {
    await dismissGuide(page);
  }
  await createProject(page, "Incremental Project");
  await installStorageCounters(page);

  const projectResult = await page.evaluate(async () => {
    window.__resetIdbWriteCounters();
    const project = projects.find((item) => item.id === activeProjectId);
    project.name = "Incremental Project Renamed";
    project.updatedAt = new Date().toISOString();
    markDeskDirty("projects", project.id);
    const saved = await saveDeskState();
    return { saved, stats: window.AISystem6DeskPersistence.getLastStats() };
  });
  expect(projectResult.saved).toBe(true);
  expect(projectResult.stats).toMatchObject({ storesTouched: ["projects"], puts: 1, deletes: 0 });
  expect((await counters(page)).clears).toEqual({});

  const fileId = await page.evaluate(async () => {
    window.__resetIdbWriteCounters();
    const id = crypto.randomUUID();
    chatFiles.push({
      id,
      projectId: activeProjectId,
      type: "text",
      name: "Incremental.md",
      body: "First body",
      folderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    markDeskDirty("chatFiles", id);
    await saveDeskState();
    return id;
  });
  let writes = await counters(page);
  expect(writes.puts.chatFiles).toBe(1);
  expect(writes.puts.projects || 0).toBe(0);
  expect(writes.clears).toEqual({});

  const deleteStats = await page.evaluate(async (id) => {
    window.__resetIdbWriteCounters();
    const index = chatFiles.findIndex((item) => item.id === id);
    chatFiles.splice(index, 1);
    markDeskDeleted("chatFiles", id);
    await saveDeskState();
    return window.AISystem6DeskPersistence.getLastStats();
  }, fileId);
  writes = await counters(page);
  expect(deleteStats).toMatchObject({ storesTouched: ["chatFiles"], puts: 0, deletes: 1 });
  expect(writes.deletes.chatFiles).toBe(1);
  expect(writes.clears).toEqual({});

  const settingsStats = await page.evaluate(async () => {
    window.__resetIdbWriteCounters();
    soundEffectsInput.checked = !soundEffectsInput.checked;
    markDeskDirty("settings");
    await saveDeskState();
    return window.AISystem6DeskPersistence.getLastStats();
  });
  writes = await counters(page);
  expect(settingsStats).toMatchObject({ storesTouched: [], puts: 0, deletes: 0, settingsWritten: true });
  expect(writes.puts.projects || 0).toBe(0);
  expect(writes.puts.chatFiles || 0).toBe(0);
  expect(writes.puts.keyval).toBe(2);

  const retry = await page.evaluate(async () => {
    const project = projects.find((item) => item.id === activeProjectId);
    project.name = "Retry Must Persist";
    project.updatedAt = new Date().toISOString();
    markDeskDirty("projects", project.id);
    const currentPut = IDBObjectStore.prototype.put;
    let failed = false;
    IDBObjectStore.prototype.put = function failOneProjectPut(...args) {
      if (!failed && this.name === projectsStoreName) {
        failed = true;
        throw new DOMException("synthetic write failure", "QuotaExceededError");
      }
      return currentPut.apply(this, args);
    };
    const first = await saveDeskState();
    IDBObjectStore.prototype.put = currentPut;
    window.__resetIdbWriteCounters();
    const second = await saveDeskState();
    return {
      first,
      second,
      stats: window.AISystem6DeskPersistence.getLastStats(),
      counters: structuredClone(window.__idbWriteCounters),
    };
  });
  expect(retry.first).toBe(false);
  expect(retry.second).toBe(true);
  expect(retry.stats).toMatchObject({ storesTouched: ["projects"], puts: 1 });
  expect(retry.counters.puts.projects).toBe(1);

  const scale = await page.evaluate(async () => {
    for (let index = 0; index < 200; index += 1) {
      projects.push({
        id: crypto.randomUUID(),
        name: `Scale ${index}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    markDeskDirty("projects");
    await saveDeskState();
    window.__resetIdbWriteCounters();
    const target = projects.at(-1);
    target.name = "Only This Record Changed";
    target.updatedAt = new Date().toISOString();
    markDeskDirty("projects", target.id);
    await saveDeskState();
    return {
      stats: window.AISystem6DeskPersistence.getLastStats(),
      counters: structuredClone(window.__idbWriteCounters),
    };
  });
  expect(scale.stats).toMatchObject({ storesTouched: ["projects"], puts: 1, deletes: 0 });
  expect(scale.counters.puts.projects).toBe(1);
  expect(scale.counters.clears).toEqual({});

  await page.evaluate(() => window.__restoreIdbWriteCounters());
});
