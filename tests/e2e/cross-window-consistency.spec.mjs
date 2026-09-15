// Cross-window desk consistency in a real browser.
//
// Two same-origin pages in ONE BrowserContext share the real IndexedDB and the
// BroadcastChannel, so nothing here is stubbed: the record feed, the write
// lease, the base fence and the commit queue are the app's own. Each case ends
// by reading the database (or reloading and re-reading it), because "the DOM
// looked right" is not the same claim as "the disk holds this".
//
// The four covered failures: an older committed update reaching a window with
// pending local edits, a remote delete meeting a dirty record, a keystroke that
// arrives while a write is open, and an interface error after a commit.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, openWindow, runAction } from "./helpers.mjs";

async function bootSharedDesk(context, name = "Cross Window") {
  const writer = await context.newPage();
  await bootApp(writer);
  await dismissGuide(writer);

  // The second window boots and parks BEFORE the project exists, so it never
  // writes a copy of it: it learns the project from the desk's own record feed
  // and its base for that record is the version the feed delivered.
  const reader = await context.newPage();
  await bootApp(reader);
  await dismissGuide(reader);
  // The second window is the receiver in every case here. Its own writes are
  // parked for the whole test, which is also the honest shape of "work this
  // window has not saved yet": the record on the desk stays newer than the
  // record on the disk, and the base it descends from never advances.
  await parkWrites(reader);

  await createProject(writer, name);
  await enterWritingRoute(writer);
  const projectId = await writer.evaluate(() => activeProjectId);
  // Let the route's own writes settle, so the writer's base is the disk.
  await writer.evaluate(() => saveDeskState());
  await enterWritingRoute(reader);
  await reader.waitForFunction(() => projects.length > 0, undefined, { timeout: 20_000 });
  await reader.evaluate((id) => {
    activeProjectId = id;
    selectedProjectId = id;
    startupProjectId = id;
    isProjectMounted = true;
    ensureActiveProject();
    if (typeof renderPipeline === "function") renderPipeline();
  }, projectId);
  await reader.waitForFunction(() => getActiveProject() !== null, undefined, { timeout: 10_000 });
  return { writer, reader, projectId };
}

/** The Question Sheet lives behind the writing workspace profile. */
async function enterWritingRoute(page) {
  // The profile is shared desk settings, so the second window usually boots
  // straight into writing mode already - and toggling again would take it back
  // out of the route this test needs.
  const alreadyWriting = await page.evaluate(() => document.body.dataset.workspaceProfile === "writing");
  if (!alreadyWriting) {
    // Switch the profile through the app's own setter. The Finder toggle is a
    // two-step UI path (enter the studio, wait for its module, open the sheet)
    // that can block for reasons unrelated to this spec - WebKit sat inside
    // the action for minutes - and the Question Sheet is opened explicitly
    // below, which is all these tests need.
    await page.evaluate(() => setWorkspaceProfile("writing", { persist: false }));
  }
  await page.waitForFunction(
    () => document.body.dataset.workspaceProfile === "writing",
    undefined, { timeout: 20_000 }
  );
  // A window that booted straight into writing mode does not necessarily have
  // the route's windows raised; the route opens them through its own entry
  // point, which is what a user clicks.
  await openWindow(page, "questionSheet");
}

/** Park this window's own writes so an edit stays newer than the disk. */
async function parkWrites(page) {
  await page.evaluate(() => {
    persistDeskState = async () => new Promise(() => {});
  });
}

async function readStoredProject(page, projectId) {
  return page.evaluate(async (id) => {
    const db = await openAppDb();
    try {
      const record = await idbRequest(db.transaction("projects", "readonly").objectStore("projects").get(id));
      return record || null;
    } finally {
      db.close();
    }
  }, projectId);
}

async function readStoredFiles(page) {
  return page.evaluate(async () => {
    const db = await openAppDb();
    try {
      const files = await idbRequest(db.transaction("chatFiles", "readonly").objectStore("chatFiles").getAll());
      return files || [];
    } finally {
      db.close();
    }
  });
}

async function waitForStoredText(page, projectId, text, timeout = 15_000) {
  await expect.poll(async () => {
    const record = await readStoredProject(page, projectId);
    return record?.questionSheet ?? null;
  }, { timeout }).toBe(text);
}

test("cross-window: a pending local edit survives an older committed update, in memory and in the editor", async ({ context }) => {
  const { writer, reader, projectId } = await bootSharedDesk(context);

  // B types, then loses focus. Its own write is parked, so the record on the
  // desk is genuinely newer than the record on the disk.
  await reader.fill("#question-sheet-body", "B LOCAL UNSAVED");
  await reader.waitForFunction(() => getActiveProject()?.questionSheet === "B LOCAL UNSAVED");
  await reader.evaluate(() => document.activeElement?.blur());

  // A commits its own, older version.
  await writer.fill("#question-sheet-body", "A REMOTE OLD");
  await writer.evaluate(() => saveDeskState());
  await waitForStoredText(writer, projectId, "A REMOTE OLD");

  // Give the record feed and the mirror hint time to arrive and be refused.
  await reader.waitForTimeout(1500);
  expect(await reader.evaluate(() => getActiveProject()?.questionSheet)).toBe("B LOCAL UNSAVED");
  expect(await reader.inputValue("#question-sheet-body")).toBe("B LOCAL UNSAVED");

  // The disk keeps what A actually wrote, and A's own view is untouched.
  expect((await readStoredProject(reader, projectId))?.questionSheet).toBe("A REMOTE OLD");
  expect(await writer.evaluate(() => getActiveProject()?.questionSheet)).toBe("A REMOTE OLD");
});

test("cross-window: a remote delete keeps a dirty record, removes a clean one, and agrees with the disk after a reload", async ({ context }) => {
  const { writer, reader } = await bootSharedDesk(context, "Delete Conflicts");

  const seedFile = async (name) => writer.evaluate(async (fileName) => {
    const id = crypto.randomUUID();
    await window.AISystem6StateStores.projects.commit((draft) => {
      draft.chatFiles.unshift({
        id,
        projectId: activeProjectId,
        type: "text",
        name: fileName,
        folderId: null,
        body: "saved body",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    return id;
  }, name);

  const dirtyId = await seedFile("Dirty.md");
  const cleanId = await seedFile("Clean.md");
  // Page-side polling: a cross-process evaluate per attempt can be collected
  // mid-flight, which surfaces as a harness error rather than a result.
  await reader.waitForFunction(
    ([dirty, clean]) => chatFiles.some((file) => file.id === dirty) && chatFiles.some((file) => file.id === clean),
    [dirtyId, cleanId],
    { timeout: 15_000 }
  );

  // B edits one of them, and that edit never lands.
  await reader.evaluate((id) => {
    const file = chatFiles.find((entry) => entry.id === id);
    file.body = "B LOCAL UNSAVED";
    markDeskDirty("chatFiles", id);
    saveDeskState();
  }, dirtyId);

  // A deletes BOTH from the desk, for real.
  await writer.evaluate(async ([dirty, clean]) => {
    await window.AISystem6StateStores.projects.commit((draft) => {
      [dirty, clean].forEach((id) => {
        const index = draft.chatFiles.findIndex((file) => file.id === id);
        if (index >= 0) draft.chatFiles.splice(index, 1);
      });
    });
  }, [dirtyId, cleanId]);

  // The database really lost both.
  await expect.poll(async () => (await readStoredFiles(writer)).length, { timeout: 15_000 }).toBe(0);

  // The dirty record keeps its text and is reported as a conflict; the clean
  // one is gone from B as well.
  await reader.waitForFunction(
    () => window.AISystem6DeskPersistence.conflictCount() > 0,
    undefined,
    { timeout: 15_000 }
  );
  expect(await reader.evaluate((id) => chatFiles.find((file) => file.id === id)?.body, dirtyId)).toBe("B LOCAL UNSAVED");
  await reader.waitForFunction(
    (id) => !chatFiles.some((file) => file.id === id),
    cleanId,
    { timeout: 15_000 }
  );

  // A reload must agree with the disk: the clean record stays deleted, and the
  // kept copy was not silently re-created under the same id.
  await reader.reload();
  await bootApp(reader);
  const afterReload = await reader.evaluate(() => chatFiles.map((file) => file.id));
  expect(afterReload).not.toContain(cleanId);
  expect((await readStoredFiles(reader)).some((file) => file.id === dirtyId)).toBe(false);
});

test("cross-window: a keystroke during a save stays on the desk and is what the next save writes", async ({ context }) => {
  const { writer, projectId } = await bootSharedDesk(context, "Typing During Save");

  await writer.evaluate(() => {
    window.__writeOpened = false;
    window.__releaseWrite = null;
    const gate = new Promise((resolve) => { window.__releaseWrite = resolve; });
    // Hold the transaction, not the plan: the write plan (and the snapshot it
    // froze) is what this test is about, so the pause has to land after that
    // plan exists and before the database sees it.
    const transactions = window.AISystem6StorageTransactions;
    const realRunTransaction = transactions.runTransaction;
    window.AISystem6StorageTransactions = Object.assign({}, transactions, {
      runTransaction: async (...args) => {
        window.__writeOpened = true;
        await gate;
        return realRunTransaction(...args);
      },
    });
    // What each write actually carried, so the frozen snapshot can be checked
    // even after a later save has moved the record on.
    window.__writtenQuestionSheets = [];
    const originalPut = IDBObjectStore.prototype.put;
    window.__restoreDeskPut = () => { IDBObjectStore.prototype.put = originalPut; };
    IDBObjectStore.prototype.put = function put(record, key) {
      if (this.name === "projects" && record && typeof record === "object") {
        window.__writtenQuestionSheets.push(String(record.questionSheet ?? ""));
      }
      return originalPut.call(this, record, key);
    };
  });

  await writer.fill("#question-sheet-body", "COMMITTED TEXT");
  await writer.waitForFunction(() => window.__writeOpened === true, undefined, { timeout: 10_000 });
  // The user keeps typing while the transaction is open.
  await writer.fill("#question-sheet-body", "TYPED DURING SAVE");
  await writer.evaluate(() => window.__releaseWrite());

  // The keystroke that arrived while the write was open is still on the desk,
  // and it is what the next save writes - it was never counted as already
  // saved by the commit that was in flight, and no rollback took it away. The
  // record catches up once the queued save behind the gated one runs.
  expect(await writer.inputValue("#question-sheet-body")).toBe("TYPED DURING SAVE");
  await waitForStoredText(writer, projectId, "TYPED DURING SAVE", 60_000);
});

test("cross-window: an interface failure after a committed write never rolls the record back", async ({ context }) => {
  const { writer, projectId } = await bootSharedDesk(context, "Post Commit Failure");

  const outcome = await writer.evaluate(async () => {
    const realRender = renderPipeline;
    renderPipeline = () => { throw new Error("injected render failure"); };
    try {
      const result = await window.AISystem6StateStores.writing.commit((draft) => {
        const project = draft.projects.find((entry) => entry.id === activeProjectId);
        // A field the open writing route does not own: the route's own saves
        // read the editors back into the record, and this case is about the
        // commit's durability, not about who owns the Question Sheet text.
        project.name = "COMMITTED DESPITE THE RENDER";
      }).then(() => "ok", (error) => error?.code || String(error));
      return { result, onDesk: getActiveProject()?.name || "" };
    } finally {
      renderPipeline = realRender;
    }
  });

  expect(outcome.result).toBe("ok");
  expect(outcome.onDesk).toBe("COMMITTED DESPITE THE RENDER");
  await expect.poll(async () => (await readStoredProject(writer, projectId))?.name ?? null, { timeout: 15_000 })
    .toBe("COMMITTED DESPITE THE RENDER");

  // And it survives the reload: the interface error did not undo the write.
  await writer.reload();
  await bootApp(writer);
  expect((await readStoredProject(writer, projectId))?.name).toBe("COMMITTED DESPITE THE RENDER");
});
