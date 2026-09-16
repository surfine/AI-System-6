// Overwriting a file on the Project CD while another burn inserts one.
//
// The burn writes the pre-burn version history first, and only then does the
// CD item land. Reading the "which file am I replacing" answer before that
// await and using the array position afterwards deletes whichever file moved
// into that slot. These run against real IndexedDB: the CD items are read back
// from the stored settings record, and again after a reload.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide } from "./helpers.mjs";

/**
 * Hold the NEXT pre-burn version write at its entry, and report when a burn is
 * standing there. The write itself still runs; only its start is gated.
 */
async function installRevisionGate(page) {
  await page.evaluate(() => {
    const original = createDocumentRevision;
    window.__revisionEntered = 0;
    window.__revisionGate = null;
    createDocumentRevision = async (...args) => {
      // One shot: the burn under test is the one that is held, and the burn
      // that lands while it waits runs normally.
      const gate = window.__revisionGate;
      if (gate) {
        window.__revisionGate = null;
        window.__revisionEntered += 1;
        await gate;
      }
      return original(...args);
    };
  });
}

async function holdNextRevision(page) {
  await page.evaluate(() => {
    window.__revisionGate = new Promise((resolve) => { window.__releaseRevision = resolve; });
  });
}

async function releaseRevisionGate(page) {
  await page.evaluate(() => {
    window.__releaseRevision?.();
    window.__revisionGate = null;
  });
}

async function waitForRevisionGate(page) {
  await expect.poll(() => page.evaluate(() => window.__revisionEntered), { timeout: 20_000 })
    .toBeGreaterThan(0);
}

/** The Project CD as the durable settings record holds it. */
async function readStoredCdItems(page, projectId) {
  return page.evaluate(async (id) => {
    const db = await openAppDb();
    try {
      const tx = db.transaction("keyval", "readonly");
      const settings = await new Promise((resolve, reject) => {
        const request = tx.objectStore("keyval").get("settings");
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
      return (settings?.projectCdItems || []).filter((item) => item.projectId === id);
    } finally {
      db.close();
    }
  }, projectId);
}

const titlesOf = (items) => items.map((item) => item.title).sort();

test("overwriting B while another burn inserts C keeps A, C and a single B", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "CD Race Project");
  const projectId = await page.evaluate(() => activeProjectId);

  const seeded = await page.evaluate(async () => {
    const a = await addProjectCdItem("old-A", "A");
    const b = await addProjectCdItem("old-B", "B");
    await saveDeskState();
    return { a: a?.id || null, b: b?.id || null };
  });
  expect(seeded.b).toBeTruthy();
  expect(titlesOf(await readStoredCdItems(page, projectId))).toEqual(["A.md", "B.md"]);

  await installRevisionGate(page);
  await holdNextRevision(page);
  await page.evaluate(() => {
    // Not awaited: this burn is the one standing in the version history.
    window.__burnB = addProjectCdItem("new-B", "B");
  });
  await waitForRevisionGate(page);

  // The file list moves while that burn waits.
  const inserted = await page.evaluate(() => addProjectCdItem("new-C", "C").then((item) => item?.id || null));
  expect(inserted).toBeTruthy();

  await releaseRevisionGate(page);
  const burned = await page.evaluate(() => window.__burnB.then((item) => ({ id: item?.id || null, body: item?.body || null })));
  await page.evaluate(() => saveDeskState());

  const stored = await readStoredCdItems(page, projectId);
  expect(titlesOf(stored)).toEqual(["A.md", "B.md", "C.md"]);
  const ids = stored.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  const overwritten = stored.find((item) => item.title === "B.md");
  expect(overwritten.id).toBe(seeded.b);
  expect(overwritten.body).toBe("new-B");
  expect(burned.id).toBe(seeded.b);
  expect(burned.body).toBe("new-B");
  expect(stored.find((item) => item.title === "A.md").body).toBe("old-A");

  await page.reload();
  await bootApp(page);
  await dismissGuide(page);
  const afterReload = await readStoredCdItems(page, projectId);
  expect(titlesOf(afterReload)).toEqual(["A.md", "B.md", "C.md"]);
  expect(afterReload.find((item) => item.title === "B.md").body).toBe("new-B");
});

test("a failed pre-burn version history writes nothing to the Project CD", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "CD Failure Project");
  const projectId = await page.evaluate(() => activeProjectId);

  await page.evaluate(async () => {
    await addProjectCdItem("old-B", "B");
    await saveDeskState();
  });
  const before = await readStoredCdItems(page, projectId);

  const outcome = await page.evaluate(async () => {
    createDocumentRevision = async () => { throw new Error("the pre-burn revision could not be saved"); };
    const item = await addProjectCdItem("new-B", "B");
    await saveDeskState();
    return { item, status: document.querySelector("#status-text")?.textContent || "" };
  });
  expect(outcome.item).toBeNull();

  const after = await readStoredCdItems(page, projectId);
  expect(after.map((item) => item.body)).toEqual(before.map((item) => item.body));
  expect(after.find((item) => item.title === "B.md").body).toBe("old-B");
});
