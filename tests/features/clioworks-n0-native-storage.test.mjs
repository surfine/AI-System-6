// ClioWorks N0 contract: an Office document gets a durable home on the Project
// Hard Disk (owner decision 2026-10-24).
//   - IndexedDB v6 -> v7 adds ONE store, "nativeDocuments", and touches nothing else;
//   - writing the File Floppy to the Project Hard Disk keeps a package's CURRENT
//     bytes (its saved edits) as an "office" project file instead of dropping them;
//   - a project document opens, saves back into the same bytes row, and reverts
//     to the stored bytes;
//   - Save As… makes a new project document the window then edits, or a
//     download whose Blob carries the right MIME type and name;
//   - Trash keeps the bytes (Put Away finds them), emptying it removes them;
//   - a project backup carries the bytes (format v8) and a restore brings them back.
// The real openAppDb upgrade, storage fence, ProjectStore commit, native-binaries,
// native-host, Quire adapter and backup modules run in a vm over an in-memory
// IndexedDB; the editor window and the desk around it are stubs.
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n0-native-storage");
const DOCX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/* ------------------------------------------------ an in-memory IndexedDB */

function fakeIndexedDB() {
  const databases = new Map();
  const target = () => {
    const listeners = {};
    return {
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      fire(type, event = {}) {
        this[`on${type}`]?.({ type, target: this, ...event });
        (listeners[type] || []).forEach((fn) => fn({ type, target: this, ...event }));
      },
    };
  };
  function connection(db) {
    const names = () => {
      const list = [...db.stores.keys()];
      list.contains = (name) => db.stores.has(name);
      return list;
    };
    return {
      get objectStoreNames() { return names(); },
      get version() { return db.version; },
      close() {},
      createObjectStore(name, options = {}) {
        if (db.stores.has(name)) throw new Error(`ConstraintError: ${name} exists`);
        db.stores.set(name, { keyPath: options.keyPath || null, autoIncrement: !!options.autoIncrement, next: 1, indexes: new Map(), records: new Map() });
        return { createIndex(index, keyPath) { db.stores.get(name).indexes.set(index, keyPath); } };
      },
      transaction(storeNames, mode = "readonly") {
        const list = Array.isArray(storeNames) ? storeNames : [storeNames];
        list.forEach((name) => { if (!db.stores.has(name)) throw new Error(`NotFoundError: ${name}`); });
        const tx = target();
        const staged = new Map();
        let pending = 0;
        let done = false;
        const records = (name) => {
          if (!staged.has(name)) staged.set(name, new Map(db.stores.get(name).records));
          return staged.get(name);
        };
        const settleLater = () => setTimeout(() => {
          if (done || pending) return;
          done = true;
          if (mode === "readwrite") staged.forEach((map, name) => { db.stores.get(name).records = map; });
          tx.fire("complete");
        }, 0);
        const request = (produce) => {
          const req = target();
          pending += 1;
          queueMicrotask(() => {
            if (done) return;
            try { req.result = produce(); pending -= 1; req.fire("success"); } catch (error) { pending -= 1; req.error = error; req.fire("error"); }
            settleLater();
          });
          return req;
        };
        tx.abort = () => {
          if (done) return;
          done = true;
          tx.error = new Error("AbortError");
          tx.fire("abort");
        };
        tx.objectStore = (name) => {
          const spec = db.stores.get(name);
          const write = () => { if (mode !== "readwrite") throw new Error("ReadOnlyError"); };
          return {
            put: (value, key) => request(() => {
              write();
              let id = spec.keyPath ? value[spec.keyPath] : key;
              if (id === undefined && spec.autoIncrement) id = spec.next++;
              records(name).set(id, structuredClone(value));
              return id;
            }),
            get: (key) => request(() => structuredClone(records(name).get(key))),
            delete: (key) => request(() => { write(); records(name).delete(key); }),
            getAll: () => request(() => [...records(name).values()].map((value) => structuredClone(value))),
            getAllKeys: () => request(() => [...records(name).keys()]),
            index: (index) => ({ getAll: (value) => request(() => [...records(name).values()].filter((item) => item[spec.indexes.get(index)] === value).map((item) => structuredClone(item))) }),
          };
        };
        settleLater();
        return tx;
      },
    };
  }
  return {
    databases,
    /** A database that already exists at `version` with these stores and records. */
    seed(name, version, stores) {
      const db = { version, stores: new Map() };
      Object.entries(stores).forEach(([store, { keyPath = "id", autoIncrement = false, records = [], indexes = {} }]) => {
        db.stores.set(store, { keyPath, autoIncrement, next: records.length + 1, indexes: new Map(Object.entries(indexes)), records: new Map(records) });
      });
      databases.set(name, db);
    },
    open(name, version) {
      const req = target();
      setTimeout(() => {
        if (!databases.has(name)) databases.set(name, { version: 0, stores: new Map() });
        const db = databases.get(name);
        req.result = connection(db);
        if (version > db.version) {
          const oldVersion = db.version;
          req.onupgradeneeded?.({ oldVersion, newVersion: version });
          db.version = version;
        }
        req.fire("success");
      }, 0);
      return req;
    },
  };
}

/* ---------------------------------------------- the desk around the store */

const config = read("app/core/config.js");
const projectDisk = read("app/features/project-disk.js");
// openAppDb and the project-reference store helpers, as project-disk.js has them.
const openAppDbSource = projectDisk.slice(projectDisk.indexOf("function idbRequest(request) {"), projectDisk.indexOf("// ----- the Basin's line-network plans"));
const slice = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const rootItemsSource = slice(projectDisk, "function getProjectRootFinderItems()", "function getSelectedProjectRootItem()");
const purgeSource = slice(read("app/core/context-retrieval.js"), "function followOfficeDocuments(", "function contextPriority(");
const restoreSource = slice(read("app/core/desktop-runtime.js"), "function restoreTrashItem(item)", "async function cleanupDeletedTrashItem(");
const storeNames = Object.fromEntries([...config.matchAll(/(\w+StoreName): "(\w+)"/g)].map((match) => [match[1], match[2]]));
const dbVersion = Number(config.match(/indexedDbVersion: (\d+)/)[1]);
const V6_STORES = ["projectReferences", "keyval", "projects", "scraps", "trashItems", "chatFolders", "chatFiles", "cities", "bonsaiCities", "imageAttachments", "transitPlans"];

function desk(idb, { files = [], trash = [] } = {}) {
  const ctx = makeContext();
  const log = { opened: [], status: [], receipts: [], finished: [], downloads: [], current: null, saveFails: false };
  Object.assign(ctx, {
    indexedDB: idb,
    indexedDbName: "ai-system-6-db",
    indexedDbVersion: dbVersion,
    ...storeNames,
    btoa, atob,
    matchMedia: () => ({ matches: false }),
    storageVersion: 2,
    renderPipeline: () => {},
    projects: [{ id: "p1", name: "N0" }],
    chatFiles: files,
    chatFolders: [],
    scraps: [],
    imageAttachments: [],
    projectCdItems: [],
    trashItems: trash,
    projectReferences: [],
    // The File Floppy's own extractor reads a docx through the same Quire codec;
    // the chunker is the retrieval runtime's shape (source, content, index, range).
    File,
    extractFileText: async (file) => {
      const doc = await ctx.ClioWorksQuireAdapter.open(await file.arrayBuffer(), { name: file.name });
      return { text: doc.paragraphs().map((p) => p.text).join("\n\n") };
    },
    chunkText: (text, source) => String(text).split(/\n\n+/).filter(Boolean).map((content, chunkIndex) => ({ source, content, chunkIndex, start: 0, end: content.length })),
    hashText: async (text) => createHash("sha256").update(text).digest("hex"),
    mountProjectReferenceChunks: () => { log.mounted = (log.mounted || 0) + 1; },
    // What the trash and Put Away paths read, besides the stores.
    ragChunks: [], excludedContextKeys: new Set(), attachedClipIds: new Set(), lastRetrievedContextItems: [],
    isContextSourceLive: () => true, scheduleRenderTasks: () => {},
    isInActiveProject: (item) => item && item.projectId === "p1",
    ensureNativeBinariesModule: async () => true,
    getProjectFinderCurrentParentId: () => null, getProjectFolders: () => [], getProjectFiles: () => ctx.chatFiles,
    getProjectFileFinderItem: (file) => ({ ...file, kind: "file" }), getProjectReferenceFinderItem: (reference) => ({ ...reference, kind: "reference" }),
    getProjectFolderFinderItem: (folder) => folder,
    activeProjectId: "p1",
    mountedTextDisk: { nativeFiles: {} },
    setStatus: (text) => log.status.push(text),
    t: (key, ...args) => `${key}:${args.join(",")}`,
    displayFolderName: (name) => name,
    ensureClioWriteModule: async () => true,
    AISystem6ClioWrite: {
      open: async (record, meta) => { log.opened.push({ record, meta }); log.current = { mountedName: meta.mountedName }; return { ok: true }; },
      current: () => log.current,
    },
    AISystem6RunReceipts: {
      createReceipt: async (input) => { log.receipts.push(input); return { ok: true, receiptId: `r${log.receipts.length}` }; },
      finishReceipt: async (id, outcome) => { log.finished.push({ id, outcome }); return { ok: true }; },
    },
    AISystem6WebPlatform: { saveArtifact: (artifact) => { log.downloads.push(artifact); return true; } },
  });
  // The desk's save: chatFiles, chatFolders and the Trash land in their stores.
  ctx.saveDeskState = async () => {
    if (log.saveFails) return false;
    const db = await ctx.openAppDb();
    try {
      await ctx.AISystem6StorageTransactions.runTransaction(db, ["chatFiles", "chatFolders", "trashItems"], "readwrite", async (tx) => {
        for (const file of ctx.chatFiles) await ctx.idbRequest(tx.objectStore("chatFiles").put(file));
        for (const folder of ctx.chatFolders) await ctx.idbRequest(tx.objectStore("chatFolders").put(folder));
      });
      return true;
    } finally { db.close(); }
  };
  vm.runInContext(openAppDbSource, ctx, { filename: "project-disk.js#openAppDb" });
  vm.runInContext(rootItemsSource, ctx, { filename: "project-disk.js#getProjectRootFinderItems" });
  vm.runInContext(purgeSource, ctx, { filename: "context-retrieval.js#purgeContextForTrashedItems" });
  vm.runInContext(restoreSource, ctx, { filename: "desktop-runtime.js#restoreTrashItem" });
  loadScripts(ctx, [
    "app/core/storage-transactions.js",
    "app/core/state-stores.js",
    "app/core/native-binaries.js",
    "app/vendor/clioworks-v3/quire-adapter.js",
    "app/vendor/clioworks-v3/native-host.js",
    "app/core/project-disk-backup.js",
    "app/core/project-backup-assembler.js",
  ]);
  return { ctx, log, host: ctx.AISystem6ClioWorks, store: ctx.AISystem6NativeBinaries };
}

/** Claim the durable write fence the way a writing window does. */
async function claimFence(ctx) {
  const db = await ctx.openAppDb();
  const fence = await ctx.AISystem6StorageTransactions.claimWriteFence(db, "n0-test");
  db.close();
  ctx.AISystem6WriteLease = { assertCanWrite: () => fence };
}

function seedV6(idb) {
  idb.seed("ai-system-6-db", 6, Object.fromEntries(V6_STORES.map((name) => [name, {
    keyPath: name === "keyval" ? null : name === "trashItems" ? null : "id",
    indexes: name === "projectReferences" ? { projectId: "projectId" } : {},
    autoIncrement: name === "trashItems",
    records: name === "keyval" ? [["settings", { activeProjectId: "p1" }]]
      : name === "trashItems" ? [[1, { title: "old", originalType: "scrap" }]]
      : name === "keyval" ? [] : [[`${name}-1`, { id: `${name}-1`, projectId: "p1", body: name }]],
  }])));
}

const storeSnapshot = (idb, name) => JSON.stringify([...idb.databases.get("ai-system-6-db").stores.get(name).records]);
const paragraph = (doc, prefix) => doc.paragraphs().find((p) => p.text.startsWith(prefix));

const run = async () => {
  // 1. The v7 upgrade adds one store and leaves every other store as it was.
  {
    test.assert(dbVersion === 7, "the project database is version 7");
    const idb = fakeIndexedDB();
    seedV6(idb);
    const before = Object.fromEntries(V6_STORES.map((name) => [name, storeSnapshot(idb, name)]));
    const { ctx } = desk(idb);
    const db = await ctx.openAppDb();
    const names = [...db.objectStoreNames];
    db.close();
    test.assert(names.includes("nativeDocuments") && names.length === V6_STORES.length + 1, "opening a v6 database creates exactly one new store, nativeDocuments");
    test.assert(idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").keyPath === "id", "nativeDocuments is keyed by id");
    test.assert(V6_STORES.every((name) => storeSnapshot(idb, name) === before[name]), "every v6 store keeps its records byte for byte");
    test.assert(idb.databases.get("ai-system-6-db").version === 7, "the stored database version moves to 7");
    const again = await ctx.openAppDb();
    test.assert([...again.objectStoreNames].length === V6_STORES.length + 1, "reopening at v7 creates nothing more");
    again.close();
  }

  const idb = fakeIndexedDB();
  seedV6(idb);
  const first = desk(idb);
  await claimFence(first.ctx);

  // 2. Floppy -> Project Hard Disk keeps the CURRENT bytes: an edit saved in the
  //    editor is in the project document, and survives a reload.
  let keptItem;
  let editedSha;
  {
    const { ctx, host, store } = first;
    ctx.__bytes = DOCX;
    vm.runInContext("mountedTextDisk.nativeFiles['quire.docx'] = AISystem6NativeBinaries.register({ mountedName: 'quire.docx', fileName: 'quire.docx', format: 'docx', bytes: globalThis.__bytes, projectId: 'p1' })", ctx);
    const opened = await host.openNativeDocument({ mountedName: "quire.docx" });
    const doc = store.recordFor("quire.docx").liveAdapter;
    const last = paragraph(doc, "最后一段");
    doc.setRunText(last.id, 0, "最后一段，在软盘上改过。");
    const saved = await host.saveNativeDocument("quire.docx");
    editedSha = sha(store.workingBytes("quire.docx"));
    test.assert(opened.ok && saved.ok && editedSha !== sha(DOCX), "a floppy docx opens, takes an edit and saves it into the floppy's working bytes");

    // addMountedTextDiskToProject stores the floppy's text copy first, under the mounted name.
    await ctx.putStoredProjectReference({ id: "ref-floppy", projectId: "p1", name: "quire.docx", body: "floppy projection", chunks: [{ source: "quire.docx", content: "floppy projection" }], embeddingModel: "local-embedding", enabled: true });
    const kept = await store.keepFloppyDocuments("p1");
    keptItem = kept[0];
    test.assert(kept.length === 1 && keptItem.type === "office" && keptItem.format === "docx" && keptItem.name === "quire.docx" && keptItem.projectId === "p1",
      "writing the floppy to the Project Hard Disk makes one office project file");
    test.assert(!("bytes" in keptItem) && !("workingBase64" in keptItem) && typeof keptItem.nativeDocumentId === "string" && keptItem.byteLength > 0,
      "the project file stays small: it names its bytes by nativeDocumentId and carries only their size");
    const row = idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records.get(keptItem.nativeDocumentId);
    test.assert(row && row.bytes instanceof ArrayBuffer && sha(new Uint8Array(row.bytes)) === editedSha && row.sha256 === editedSha && row.projectId === "p1",
      "the bytes row holds the edited bytes, with their sha-256 and project");
    const linked = idb.databases.get("ai-system-6-db").stores.get("projectReferences").records.get("ref-floppy");
    test.assert(keptItem.referenceId === "ref-floppy" && linked.officeFileId === keptItem.id && linked.body.includes("最后一段，在软盘上改过。"),
      "the floppy's text copy stays a project source (same id), linked both ways to the office document and made from the kept bytes");
    const storedFiles = [...idb.databases.get("ai-system-6-db").stores.get("chatFiles").records.values()];
    test.assert(storedFiles.some((file) => file.id === keptItem.id && file.nativeDocumentId === keptItem.nativeDocumentId), "the item reached the chatFiles store through the project store's commit");
  }

  // A reload: a fresh desk over the same database, chatFiles read back from disk.
  const reloadFiles = () => [...idb.databases.get("ai-system-6-db").stores.get("chatFiles").records.values()].map((file) => structuredClone(file));
  let second = desk(idb, { files: reloadFiles() });
  await claimFence(second.ctx);
  second.ctx.projectReferences.push(...await second.ctx.getStoredProjectReferences("p1"));
  const storedReference = (id) => idb.databases.get("ai-system-6-db").stores.get("projectReferences").records.get(id);

  // 3. Open from the Project Hard Disk: the registry hands over the office item;
  //    the edit is there. Save writes back to the same row; Revert reads it back.
  {
    const { ctx, log, host, store } = second;
    const item = ctx.chatFiles.find((file) => file.id === keptItem.id);
    const opened = await host.dispatchIntent(item, { intent: "open" });
    const handle = store.projectHandle(item.id);
    const record = store.recordFor(handle);
    test.assert(opened.ok && opened.mountedName === handle && log.opened[0].meta.mountedName === handle && log.opened[0].meta.fileName === "quire.docx",
      "Finder's open intent on an office item opens ClioWrite with the project handle and file name");
    test.assert(record.source.kind === "project" && record.source.fileId === item.id && sha(store.workingBytes(handle)) === editedSha,
      "after a reload the project document opens with the floppy edit in it");
    test.assert(paragraph(record.liveAdapter, "最后一段").text === "最后一段，在软盘上改过。", "the reopened Word document reads the edited paragraph");

    const doc = record.liveAdapter;
    doc.setRunText(paragraph(doc, "最后一段").id, 0, "最后一段，在项目硬盘上又改了。");
    const beforeUpdated = item.updatedAt;
    await tick();
    const saved = await host.saveNativeDocument(handle);
    const row = idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records.get(item.nativeDocumentId);
    const savedSha = sha(new Uint8Array(row.bytes));
    test.assert(saved.ok && savedSha === saved.sha256 && savedSha !== editedSha, "Save writes the new bytes back into the same nativeDocuments row");
    test.assert(ctx.chatFiles.find((file) => file.id === item.id).updatedAt >= beforeUpdated && ctx.chatFiles.find((file) => file.id === item.id).byteLength === saved.byteLength,
      "the item's size and date follow the save");
    const refreshed = storedReference("ref-floppy");
    test.assert(refreshed.body.includes("最后一段，在项目硬盘上又改了。") && refreshed.officeFileId === item.id && refreshed.chunks.some((chunk) => chunk.content.includes("又改了"))
      && ctx.projectReferences.find((reference) => reference.id === "ref-floppy")?.body === refreshed.body,
      "saving the document refreshes its linked source's body and chunks, on disk and on the desk");
    const listed = ctx.getProjectRootFinderItems();
    test.assert(listed.some((entry) => entry.id === item.id) && !listed.some((entry) => entry.id === "ref-floppy"),
      "the Project Hard Disk lists the office document once; its text copy is not a second file");
    test.assert(log.receipts.length === 1 && log.receipts[0].inputObjectIds[0] === item.id && log.finished[0].outcome.status === "completed" && log.finished[0].outcome.destination === "quire.docx",
      "the save still leaves one edit receipt, naming the project file");

    doc.setRunText(paragraph(doc, "最后一段").id, 0, "不该留下的改动。");
    const reverted = await host.revertNativeDocument(handle);
    test.assert(reverted.ok && paragraph(reverted.adapter, "最后一段").text === "最后一段，在项目硬盘上又改了。" && sha(store.workingBytes(handle)) === savedSha,
      "Revert reloads the last stored bytes");
    record.liveAdapter = reverted.adapter;

    // A failed item commit after a fresh document's bytes were written takes the bytes back out.
    log.saveFails = true;
    let threw = false;
    try { await store.createProjectDocument({ projectId: "p1", name: "orphan", format: "docx", bytes: DOCX }); } catch { threw = true; }
    log.saveFails = false;
    const rows = [...idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records.values()];
    test.assert(threw && rows.length === 1 && !ctx.chatFiles.some((file) => file.name === "orphan.docx"), "a document whose item cannot be committed leaves neither item nor bytes behind");
  }

  // 4. Save As… to the Project Hard Disk makes a NEW document the window then edits;
  //    the source keeps its bytes. Save As… to this computer is a docx Blob.
  let copyItem;
  {
    const { ctx, log, host, store } = second;
    const handle = store.projectHandle(keptItem.id);
    const doc = store.recordFor(handle).liveAdapter;
    doc.setRunText(paragraph(doc, "最后一段").id, 0, "另存的版本。");
    const sourceRow = sha(new Uint8Array(idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records.get(keptItem.nativeDocumentId).bytes));
    const result = await host.saveNativeDocumentAs(handle, { answer: { name: "搬家清单 副本", folderName: "草稿", destination: "project" } });
    copyItem = ctx.chatFiles.find((file) => file.id === result.fileId);
    const folder = ctx.chatFolders.find((entry) => entry.id === copyItem?.folderId);
    test.assert(result.ok && copyItem && copyItem.type === "office" && copyItem.name === "搬家清单 副本.docx" && folder?.name === "草稿",
      "Save As to the Project Hard Disk creates a new office item, named with its extension, in the chosen folder");
    test.assert(copyItem.nativeDocumentId !== keptItem.nativeDocumentId && sha(new Uint8Array(idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records.get(copyItem.nativeDocumentId).bytes)) === result.sha256,
      "the new document has its own bytes row with the window's current state");
    test.assert(sha(new Uint8Array(idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records.get(keptItem.nativeDocumentId).bytes)) === sourceRow,
      "the document it came from keeps the bytes it had");
    const reopened = log.opened.at(-1);
    test.assert(reopened.meta.mountedName === store.projectHandle(copyItem.id) && reopened.record.liveAdapter === doc && !doc.isDirty(),
      "the window switches to the new document, keeping its live model, now saved");

    const download = await host.saveNativeDocumentAs(store.projectHandle(copyItem.id), { answer: { name: "给房东", destination: "download" } });
    const artifact = log.downloads.at(-1);
    test.assert(download.ok && artifact.fileName === "给房东.docx" && artifact.mimeType === DOCX_MIME && artifact.blob.type === DOCX_MIME,
      "Save As to this computer hands the download one Blob with the docx MIME type and the name with its extension");
    const downloaded = new Uint8Array(await artifact.blob.arrayBuffer());
    const check = makeContext();
    loadScripts(check, ["app/vendor/clioworks-v3/quire-adapter.js"]);
    check.__bytes = downloaded.buffer;
    const readBack = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes, { name: '给房东.docx' })", check);
    test.assert(paragraph(readBack, "最后一段") === undefined && readBack.paragraphs().some((p) => p.text === "另存的版本。"),
      "the downloaded bytes open in the Word adapter with the edit in them");
    test.assert(ctx.chatFiles.filter((file) => file.type === "office").length === 2, "a download adds nothing to the Project Hard Disk");
    const copyReference = storedReference(copyItem.referenceId);
    test.assert(copyItem.referenceId && copyItem.referenceId !== "ref-floppy" && copyReference?.officeFileId === copyItem.id && copyReference.body.includes("另存的版本。"),
      "the Save As copy gets its own linked source with its own text");
  }

  // 5. Trash: the bytes stay while the item is in the Trash (Put Away finds them);
  //    emptying the Trash removes them.
  {
    const { ctx, host, store } = second;
    const rowsStore = () => idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records;
    // Move to Trash, the way documents-chat.js does it.
    const index = ctx.chatFiles.findIndex((file) => file.id === copyItem.id);
    const [trashed] = ctx.chatFiles.splice(index, 1);
    ctx.purgeContextForTrashedItems([{ type: "file", id: trashed.id, item: trashed }]);
    const trashItem = { projectId: "p1", title: trashed.name, originalType: "file", originalData: trashed };
    ctx.trashItems.unshift(trashItem);
    for (let i = 0; i < 50 && storedReference(copyItem.referenceId); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    test.assert(!storedReference(copyItem.referenceId) && !ctx.projectReferences.some((reference) => reference.id === copyItem.referenceId),
      "its linked source follows the document to the Trash: no longer a project source");
    const far = Date.now() + 10 * 60 * 1000;
    let removed = await store.sweepDocuments({ now: far });
    test.assert(removed === 0 && rowsStore().has(copyItem.nativeDocumentId), "a document in the Trash keeps its bytes");
    // Put Away, through desktop-runtime's restoreTrashItem.
    ctx.trashItems.shift();
    test.assert(ctx.restoreTrashItem(trashItem) === true && ctx.chatFiles.some((file) => file.id === copyItem.id), "Put Away puts the office item back");
    for (let i = 0; i < 50 && !storedReference(copyItem.referenceId); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    test.assert(storedReference(copyItem.referenceId)?.officeFileId === copyItem.id && storedReference(copyItem.referenceId).body.includes("另存的版本。")
      && ctx.projectReferences.some((reference) => reference.id === copyItem.referenceId),
      "and its linked source comes back, made again from the document's bytes");
    store.forgetProjectDocument(store.projectHandle(copyItem.id));
    const putBack = await host.openNativeDocument(ctx.chatFiles.at(-1));
    test.assert(putBack.ok && paragraph(store.recordFor(store.projectHandle(copyItem.id)).liveAdapter, "另存的版本") !== undefined, "Put Away brings it back with its bytes");

    const again = ctx.chatFiles.findIndex((file) => file.id === copyItem.id);
    const retrashed = ctx.chatFiles.splice(again, 1)[0];
    ctx.purgeContextForTrashedItems([{ type: "file", id: retrashed.id, item: retrashed }]);
    ctx.trashItems.unshift({ projectId: "p1", title: copyItem.name, originalType: "file", originalData: retrashed });
    ctx.trashItems.shift(); // Empty Trash
    removed = await store.sweepDocuments({ now: Date.now() });
    test.assert(removed === 0 && rowsStore().has(copyItem.nativeDocumentId), "a row written moments ago is left alone (it may belong to a document being created)");
    removed = await store.sweepDocuments({ now: far });
    test.assert(removed === 1 && !rowsStore().has(copyItem.nativeDocumentId) && rowsStore().has(keptItem.nativeDocumentId),
      "emptying the Trash deletes that document's bytes row and no other");
    await tick();
    test.assert(!storedReference(copyItem.referenceId) && storedReference("ref-floppy"), "and leaves no source behind for it, while the other document keeps its own");
  }

  // 6. Backup round trip: the export carries the bytes (v8), the restore brings them back
  //    under new ids; a v7 backup still validates.
  {
    const { ctx, store } = second;
    const backup = ctx.AISystem6ProjectDiskBackup;
    const result = await ctx.AISystem6ProjectBackupAssembler.assembleProjectBackup({
      projectId: "p1",
      source: {
        getProject: async () => ctx.projects[0],
        getFolders: async () => ctx.chatFolders,
        getFiles: async () => ctx.chatFiles,
        getScraps: async () => [], getTrash: async () => ctx.trashItems, getProjectCdItems: async () => [], getReferences: async () => ctx.projectReferences,
        getDocumentRevisions: async () => [], getDarkroomRecords: async () => [], getImageAttachments: async () => [],
      },
    });
    const bundle = result.bundle;
    const stored = idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records.get(keptItem.nativeDocumentId);
    test.assert(result.ready && bundle.formatVersion === 8 && bundle.counts.nativeDocuments === 1 && bundle.nativeDocuments[0].id === keptItem.nativeDocumentId,
      "the export is a ready v8 bundle carrying the office document's bytes");
    test.assert(sha(Buffer.from(bundle.nativeDocuments[0].base64, "base64")) === sha(new Uint8Array(stored.bytes)) && bundle.nativeDocuments[0].sha256 === stored.sha256,
      "the bundle's base64 is exactly the stored bytes");
    const broken = structuredClone(bundle);
    broken.nativeDocuments = [];
    broken.counts.nativeDocuments = 0;
    test.assert(!backup.validateBackup(broken).valid, "a v8 backup whose office file names missing bytes is refused");

    const imported = backup.remapBackup(bundle, { projectName: (name) => `${name} restored` });
    const file = imported.files.find((entry) => entry.type === "office");
    const row = imported.nativeDocuments[0];
    const importedReference = imported.references.find((entry) => entry.id === file.referenceId);
    test.assert(importedReference && importedReference.officeFileId === file.id, "the restore keeps the document and its linked source pointing at each other under new ids");
    test.assert(file && row && file.nativeDocumentId === row.id && row.id !== keptItem.nativeDocumentId && row.projectId === imported.project.id && row.bytes instanceof ArrayBuffer && !("base64" in row),
      "the restore remaps the bytes row and the item that names it together, decoded and ready for the store");

    // The restore lands the rows in nativeDocuments (export-import's transaction does the same put).
    const db = await ctx.openAppDb();
    await ctx.AISystem6StorageTransactions.runTransaction(db, ["nativeDocuments"], "readwrite", (tx) => Promise.all(imported.nativeDocuments.map((entry) => ctx.idbRequest(tx.objectStore("nativeDocuments").put(entry)))));
    db.close();
    ctx.chatFiles.push(file);
    const restored = await store.openProjectDocument(file.id);
    test.assert(restored && sha(store.workingBytes(restored.mountedName)) === sha(new Uint8Array(stored.bytes)), "the restored project opens the same bytes");

    const v7 = structuredClone(bundle);
    delete v7.nativeDocuments;
    delete v7.counts.nativeDocuments;
    v7.formatVersion = 7;
    v7.files = v7.files.filter((entry) => entry.type !== "office");
    v7.trash = [];
    v7.counts.files = v7.files.length;
    v7.counts.trash = 0;
    test.assert(backup.validateBackup(v7).valid, "a v7 backup without Office documents still validates");
  }

  // 7. The desk wiring that the vm above stands in for.
  {
    const exportImport = read("app/features/export-import.js");
    const fileDisk = read("app/features/file-disk.js");
    const runtime = read("app/core/desktop-runtime.js");
    test.assertIncludes(exportImport, 'putAll("nativeDocuments", imported.nativeDocuments || []);', "a restore puts the bytes in the same transaction as the files");
    test.assertMatches(fileDisk, /keepFloppyDocuments\(activeProjectId\)\)\?\.length \|\| 0;\n\s*ejectTextDisk/, "the floppy keeps its Office packages before it is ejected");
    test.assertMatches(runtime, /sweepDocuments\(\)/, "Empty Trash sweeps the bytes nothing names");
  }
};

run().then(() => test.finish(), (error) => {
  test.assert(false, `contract threw: ${error && error.stack || error}`);
  test.finish();
});
