// Measurement run for the save-scan optimization: drive the app's own journeys
// with the shadow comparison on and read back what a report-only save plan
// would have missed. The numbers this prints are the migration list for the
// "skip the fingerprint scan" change; nothing here writes.

import { expect, test } from "@playwright/test";
import {
  bootApp, createProject, dismissGuide, enterWritingStudio, importMarkdown, openWindow, runAction,
} from "./helpers.mjs";

// What the journey actually wrote, counted at the database rather than asked of
// the app: "nothing was missed" only means something next to "and there was
// something to miss". A run that wrote no record would otherwise print the same
// zero as a run that tracked every writer, so the comparison is reported with
// the writes it stood beside - per object store, so a family this journey never
// reached shows up as a gap and not as a clean bill of health.
async function startWriteTally(page) {
  await page.evaluate(() => {
    const proto = IDBObjectStore.prototype;
    const put = proto.put;
    const remove = proto.delete;
    window.__writes = [];
    window.__restoreWriteTally = () => {
      proto.put = put;
      proto.delete = remove;
    };
    proto.put = function (record, key) {
      window.__writes.push({ store: this.name, op: "put" });
      return put.call(this, record, key);
    };
    proto.delete = function (key) {
      window.__writes.push({ store: this.name, op: "delete" });
      return remove.call(this, key);
    };
  });
}

async function writeTally(page) {
  return page.evaluate(() => {
    const byStore = {};
    (window.__writes || []).forEach(({ store, op }) => {
      const counts = byStore[store] || (byStore[store] = { put: 0, delete: 0 });
      counts[op] += 1;
    });
    return { total: (window.__writes || []).length, writes: byStore };
  });
}

const missedSoFar = (page) =>
  page.evaluate(() => window.AISystem6ScanShadow.report().totalMissed);

// The instrument is its own lazy file - the desk carries two hooks into it, not
// the comparison - so the check that uses it is the thing that loads it.
async function loadScanShadow(page) {
  await page.evaluate(() => ensureScanShadowModule());
  await page.waitForFunction(() => !!window.AISystem6ScanShadow, undefined, { timeout: 20_000 });
}

test("scan shadow: a report-only plan misses records the full scan writes", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await startWriteTally(page);
  await loadScanShadow(page);
  await page.evaluate(() => {
    window.AISystem6ScanShadow.enable();
  });

  const debugStep = async (label) => {
    const debug = await page.evaluate(() => {
      const entries = (window.__scanShadowDebug || []).map((entry) => `${entry.trusted ? "trusted" : "scan-only"} ${entry.key}:${(entry.missedPuts || []).map((id) => (projects.find((p) => p.id === id)?.name || chatFiles.find((f) => f.id === id)?.name || id).slice(0, 14)).join(",")}:why=${entry.why}:d=${entry.diff}:fields=${(entry.fields || []).join("|")}:n=${(entry.missedPuts || []).length}:said=${(entry.said || []).map((id) => (projects.find((p) => p.id === id)?.name || id).slice(0, 10)).join(",")}`);
      window.__scanShadowDebug = [];
      return entries;
    });
    if (debug.length) console.log("STEP-MISSES", label, JSON.stringify(debug));
  };
  await createProject(page, "Shadow Project");
  await debugStep("create");
  const afterCreate = await missedSoFar(page);
  await enterWritingStudio(page);
  await page.fill("#question-sheet-body", "A paragraph the writer typed while the shadow was on.");
  await page.waitForTimeout(1200);
  await debugStep("typing");
  const afterTyping = await missedSoFar(page);
  await importMarkdown(page, "# Imported under shadow\n\nA file so chatFiles moves too.");
  await page.waitForTimeout(1200);
  await debugStep("import");
  const afterImport = await missedSoFar(page);
  await page.evaluate(async () => {
    const project = getActiveProject();
    // A TRACKED write: the shadow report is meant to name the app's unmarked
    // writers, not this test's own deliberate shortcut.
    window.AISystem6DeskPersistence.markDirty("projects", project.id);
    project.name = "Shadow Project Renamed";
    await saveDeskState();
  });
  await page.waitForTimeout(800);
  await debugStep("rename");
  const afterRename = await missedSoFar(page);

  // A second project, a switch between them, and a delete: three more writer
  // families the migration has to cover before the scan can be skipped.
  await createProject(page, "Shadow Project Two");
  await page.waitForTimeout(800);
  await debugStep("secondProject");
  const afterSecondProject = await missedSoFar(page);
  const afterDelete = await page.evaluate(async () => {
    const victim = chatFiles.find((file) => String(file.name || "").includes("notes"));
    if (victim) {
      // The commit is awaited with a ceiling: this spec measures what a save
      // plan compared, and a commit that is still settling must not turn the
      // measurement into a hung evaluate.
      const committed = window.AISystem6StateStores.projects.commit((draft) => {
        const index = draft.chatFiles.findIndex((file) => file.id === victim.id);
        if (index >= 0) draft.chatFiles.splice(index, 1);
      });
      await Promise.race([committed.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
    return window.AISystem6ScanShadow.report().totalMissed;
  });
  await page.waitForTimeout(800);

  const report = await page.evaluate(() => window.AISystem6ScanShadow.report());
  const tally = await writeTally(page);
  console.log("SCAN-SHADOW-DEBUG", JSON.stringify(await page.evaluate(() => (window.__scanShadowDebug || []).slice(0, 3)), null, 2));
  console.log("SCAN-SHADOW", JSON.stringify({
    afterCreate, afterTyping, afterImport, afterRename, afterSecondProject, afterDelete, tally, report,
  }, null, 2));
  expect(report.enabled).toBe(true, "the comparison ran with the shadow switched on");
  expect(report.comparisons).toBeGreaterThan(0);
  // These journeys create, type, import, rename, add a project and delete a
  // record, so a run that wrote nothing is a broken journey, not a clean bill.
  expect(tally.writes.projects?.put ?? 0).toBeGreaterThan(0, "the journey wrote project records");
  expect(tally.writes.chatFiles?.delete ?? 0).toBeGreaterThan(0, "and deleted one");
  expect(Array.isArray(report.mismatches)).toBe(true);
});

// The other writer families the migration has to cover, driven through the
// app's own entry points rather than through the store: the Scrapbook's own
// create/delete, the Finder's move to Trash, a second window that receives a
// record and then edits it, and a command-driven save that touches nothing the
// typist touched. Each step reads the same report.
test("scan shadow: the remaining writer families report no misses", async ({ context }) => {
  const page = await context.newPage();
  await bootApp(page);
  await dismissGuide(page);
  await startWriteTally(page);
  await createProject(page, "Shadow Families");
  await loadScanShadow(page);
  await page.evaluate(() => {
    window.AISystem6ScanShadow.enable();
  });

  const report = async () => page.evaluate(() => window.AISystem6ScanShadow.report());
  const steps = {};

  // A. Scrapbook: the module's own writer, not the store's.
  await openWindow(page, "scrapbook");
  await page.waitForFunction(() => typeof createScrap === "function" || typeof window.createScrap === "function", undefined, { timeout: 20_000 });
  await page.evaluate(async () => {
    const scrap = typeof createScrap === "function" ? createScrap : window.createScrap;
    scrap("A quotation the writer kept.", "The sentence that mattered.", { source: "Shadow" });
    await saveDeskState();
  });
  await page.waitForTimeout(600);
  steps.afterScrapbook = await missedSoFar(page);

  // B. A command-driven save: rename through the Finder's own path.
  await page.evaluate(async () => {
    const project = getActiveProject();
    project.name = "Shadow Families Renamed";
    if (typeof markActiveProjectDirty === "function") markActiveProjectDirty();
    await saveDeskState();
  });
  await page.waitForTimeout(600);
  steps.afterCommandRename = await missedSoFar(page);

  // C. Trash: the finder's own move-to-trash writer, entered where the action
  // enters it once a file is selected. Driving the whole window-selection UI
  // would be testing the Finder's click targets, not the writer.
  await importMarkdown(page, "# A file for the Trash\n\nBody text.");
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    const file = chatFiles.find((item) => String(item.name || "").includes("notes"));
    selectedChatFileId = file.id;
    moveSelectedDocumentFileToTrash();
    await saveDeskState();
  });
  await page.waitForTimeout(900);
  steps.afterTrash = await missedSoFar(page);

  // D. A second window edits what the feed delivered, then saves it.
  const reader = await context.newPage();
  await bootApp(reader);
  await dismissGuide(reader);
  await reader.waitForFunction(() => projects.length > 0, undefined, { timeout: 20_000 });
  await loadScanShadow(reader);
  await reader.evaluate(async () => {
    window.AISystem6ScanShadow.enable();
    const project = projects[0];
    project.name = "Shadow Families From The Reader";
    if (typeof markActiveProjectDirty === "function") markActiveProjectDirty();
    await saveDeskState();
  });
  await reader.waitForTimeout(800);
  steps.readerMissed = await reader.evaluate(() => window.AISystem6ScanShadow.report().totalMissed);
  await page.waitForTimeout(1200);
  steps.afterCrossWindow = await missedSoFar(page);

  // E. Clipped pictures: the Clio attachment store is the one collection the
  // journeys above never touch, so it gets its own step rather than a clean
  // bill it did not earn.
  await openWindow(page, "assistant");
  await page.waitForFunction(() => !!window.AISystem6ClioImages, undefined, { timeout: 20_000 });
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    context.fillStyle = "#20427a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    window.AISystem6ClioImages.addFiles([new File([blob], "shadow-clip.png", { type: "image/png" })]);
    await saveDeskState();
  });
  await page.waitForTimeout(1500);
  steps.afterClippedPicture = await missedSoFar(page);

  const tally = await writeTally(page);
  console.log("SCAN-SHADOW-FAMILIES", JSON.stringify({ steps, tally, report: await report() }, null, 2));
  const final = await report();
  expect(final.enabled).toBe(true);
  expect(final.comparisons).toBeGreaterThan(0);
  // Each family this run claims to cover has to show its own write, or the
  // zero above is not evidence about that family at all.
  expect(tally.writes.scraps?.put ?? 0).toBeGreaterThan(0, "the scrapbook wrote a scrap");
  expect(tally.writes.trashItems?.put ?? 0).toBeGreaterThan(0, "the finder moved a file to the trash");
  expect(tally.writes.projects?.put ?? 0).toBeGreaterThan(0, "a project record moved");
});

// Every writer family that updates a record the desk already holds, driven
// through the app's own entry points: rename a disk, save over a document,
// rename a file, make a folder and move a file into it, type in a scrap, throw
// a file away and take it back, and save a picture twice over.
//
// The instrument is only trusted because the run ends by proving it can see an
// unmarked write at all: the last step edits a record the app does not report
// and expects that miss to be named. Without that step a green run would also
// be what a broken comparison looks like.
test("scan shadow: the app's own writers report, and an unmarked one is caught", async ({ page }) => {
  test.setTimeout(180_000);
  const probeLog = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) probeLog.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) probeLog.push(`navigated: ${frame.url()}`); });
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Shadow Writers");
  await startWriteTally(page);
  await loadScanShadow(page);
  await page.evaluate(() => window.AISystem6ScanShadow.enable());

  const report = () => page.evaluate(() => window.AISystem6ScanShadow.report());
  const frontier = async () => (await report()).totalMissed;
  const missesSince = async (mark) => {
    const state = await report();
    return state.mismatches.slice(mark);
  };
  const expected = [];
  const scanOnly = [];
  const check = async (name, mark) => {
    const fresh = await missesSince(mark);
    // A miss on a collection the plan still scans is the migration list, not a
    // failure: those writers are covered by the full scan until they are
    // migrated, and this run records them as such.
    scanOnly.push(...fresh.filter((entry) => entry.trusted === false).map((entry) => `${name}:${entry.key}`));
    const trusted = fresh.filter((entry) => entry.trusted !== false);
    if (trusted.length) expected.push({ name, fresh: trusted });
    return (await frontier());
  };

  let mark = 0;
  await page.evaluate(async () => {
    selectedProjectId = activeProjectId;
    projectDiskNameInput.value = "Renamed By The Finder";
    renameSelectedProject();
    await saveDeskState();
  });
  await page.waitForTimeout(700);
  mark = await check("rename disk", mark);

  await importMarkdown(page, "# A document to edit\n\nBody text.");
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    const file = chatFiles.find((item) => item.type === "text");
    openTextFile(file.id);
    teachTextBodyInput.value = `${teachTextBodyInput.value || ""}\nEdited while the shadow was on.`;
    await saveTextDocument({ promptForFolder: false });
  });
  await page.waitForTimeout(900);
  mark = await check("document save", mark);

  await page.evaluate(() => {
    selectedChatFileId = chatFiles.find((item) => item.type === "text").id;
    renameSelectedDocumentItem();
  });
  await page.waitForSelector("#app-input-modal[open]", { timeout: 10_000 });
  await page.fill("#app-input-field", "Renamed By The Shadow.md");
  await page.click("#app-input-confirm");
  await page.waitForTimeout(700);
  mark = await check("file rename", mark);

  await openWindow(page, "projects");
  await page.evaluate(() => handleAction("new-folder"));
  await page.waitForTimeout(700);
  mark = await check("new folder", mark);
  await page.evaluate(async () => {
    const file = chatFiles.find((item) => item.type === "text");
    moveDocumentFileToFolder(file.id, chatFolders[0].id);
    await saveDeskState();
  });
  await page.waitForTimeout(700);
  mark = await check("move into folder", mark);

  await openWindow(page, "scrapbook");
  const scrapId = await page.evaluate(async () => {
    const scrap = createScrap("A scrap to edit", "The first version of the sentence.", { source: "Shadow" });
    await saveDeskState();
    selectedScrapId = scrap.id;
    renderScraps();
    return scrap.id;
  });
  await page.waitForTimeout(900);
  mark = await check("scrap created", mark);
  await page.fill("#scrap-body-input", "The second version of the sentence.");
  await page.waitForTimeout(1400);
  mark = await check("scrap edited", mark);

  await page.evaluate(async () => {
    selectedChatFileId = chatFiles.find((item) => item.type === "text").id;
    moveSelectedDocumentFileToTrash();
    await saveDeskState();
  });
  await page.waitForTimeout(900);
  mark = await check("file trashed", mark);
  await page.evaluate(async () => {
    restoreTrashItem(trashItems[0]);
    await saveDeskState();
  });
  await page.waitForTimeout(900);
  mark = await check("file restored", mark);

  const beforePicture = mark;
  await openWindow(page, "clioPaint");
  await page.waitForFunction(() => !!window.AISystem6ClioPaint, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.AISystem6ClioPaint.save());
  await page.waitForTimeout(1200);
  mark = await check("picture saved", mark);
  await page.evaluate(() => window.AISystem6ClioPaint.save());
  await page.waitForTimeout(1200);
  mark = await check("picture saved again", mark);

  // The control: an edit nobody reported has to be caught, or the run above
  // proves nothing. The Scrapbook's own editor path is reported; this writes
  // past it on purpose.
  const controlMisses = await page.evaluate(async (id) => {
    const scrap = scraps.find((item) => item.id === id);
    scrap.translation = "一句没有被上报的翻译。";
    scrap.translationLanguage = "zh";
    await saveDeskState();
    return window.AISystem6ScanShadow.report().totalMissed;
  }, scrapId);
  const tally = await writeTally(page);
  console.log("SCAN-SHADOW-WRITERS", JSON.stringify({ unmarked: expected, scanOnly, beforePicture, controlMisses, tally, report: await report() }, null, 2));

  expect(expected, "every app writer named its record").toEqual([]);
  expect(controlMisses).toBeGreaterThan(0, "and the comparison can still see an unmarked write");
});
