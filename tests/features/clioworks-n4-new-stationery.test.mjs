// ClioWorks N4 contract: 新建 (New) and 文具 (Stationery) for Office documents.
//   - 新建… (⌘N) in the three editors makes a new untitled document from the
//     codec models (never a shipped template): docx A4 with the Chinese UI's
//     宋体 East Asian default, xlsx one sheet named 工作表1/Sheet1, pptx an
//     empty 16:9 deck. Every blank OPENS in its desk adapter — the bytes are a
//     real document, not a byte-shaped promise.
//   - Creation writes the Project Hard Disk the N0 way (bytes first, item
//     second): a failed create leaves neither item nor bytes, and each new
//     document gets its linked hidden text source.
//   - 未命名 1, 未命名 2 … the numbering nextAvailableFileName taught.
//   - 存为文具… marks a document; opening a marked pad never edits it — the
//     copy duplicates the bytes row, the pad keeps its own.
//   - ⌘N keeps its old meaning in Finder, TeachText, Quick Draft and ClioTalk,
//     and reaches the three editors only.
// The real codecs, adapters, native store, native host, finder-objects and
// office-new run in a vm over an in-memory IndexedDB; the editor windows are
// stubs. The ⌘N scopes run through the real boot bundle's key dispatch.
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("clioworks-n4-new-stationery");
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
            index: (index) => ({ getAll: (value) => request(() => [...records(name).values()].filter((item) => item[spec.indexes.get(index)] === value).map((value) => structuredClone(value))) }),
          };
        };
        settleLater();
        return tx;
      },
    };
  }
  return {
    databases,
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

/* ---------------------------------------------- the desk around the modules */

const config = read("app/core/config.js");
const projectDisk = read("app/features/project-disk.js");
const openAppDbSource = projectDisk.slice(projectDisk.indexOf("function idbRequest(request) {"), projectDisk.indexOf("// ----- the Basin's line-network plans"));
const storeNames = Object.fromEntries([...config.matchAll(/(\w+StoreName): "(\w+)"/g)].map((match) => [match[1], match[2]]));
const dbVersion = Number(config.match(/indexedDbVersion: (\d+)/)[1]);
const STORES = ["projectReferences", "keyval", "projects", "scraps", "trashItems", "chatFolders", "chatFiles", "cities", "bonsaiCities", "imageAttachments", "transitPlans", "nativeDocuments"];

function seedDb(idb) {
  idb.seed("ai-system-6-db", dbVersion, Object.fromEntries(STORES.map((name) => [name, {
    keyPath: name === "keyval" ? null : name === "trashItems" ? null : "id",
    indexes: name === "projectReferences" ? { projectId: "projectId" } : {},
    autoIncrement: name === "trashItems",
    records: name === "keyval" ? [["settings", { activeProjectId: "p1" }]] : [],
  }])));
}

function desk(idb) {
  const ctx = makeContext();
  const log = { opened: [], status: [], current: null, saveFails: false };
  Object.assign(ctx, {
    indexedDB: idb,
    indexedDbName: "ai-system-6-db",
    indexedDbVersion: dbVersion,
    ...storeNames,
    btoa, atob,
    matchMedia: () => ({ matches: false }),
    storageVersion: 2,
    renderPipeline: () => {},
    projects: [{ id: "p1", name: "N4" }],
    chatFiles: [],
    chatFolders: [],
    scraps: [],
    imageAttachments: [],
    projectCdItems: [],
    trashItems: [],
    projectReferences: [],
    currentLanguage: "zh",
    File,
    extractFileText: async (file) => {
      const doc = await ctx.ClioWorksQuireAdapter.open(await file.arrayBuffer(), { name: file.name });
      return { text: doc.paragraphs().map((p) => p.text).join("\n\n") };
    },
    chunkText: (text, source) => String(text).split(/\n\n+/).filter(Boolean).map((content, chunkIndex) => ({ source, content, chunkIndex, start: 0, end: content.length })),
    hashText: async (text) => createHash("sha256").update(text).digest("hex"),
    mountProjectReferenceChunks: () => {},
    isInActiveProject: (item) => item && item.projectId === "p1",
    activeProjectId: "p1",
    getActiveProject: () => ctx.projects[0],
    mountedTextDisk: { nativeFiles: {} },
    setStatus: (text) => log.status.push(text),
    t: (key, ...args) => (key === "untitled" ? (ctx.currentLanguage === "zh" ? "未命名" : "Untitled") : `${key}:${args.join(",")}`),
    displayFolderName: (name) => name,
    renderDocuments: () => {},
    renderProjectDisks: () => {},
    ensureNativeBinariesModule: async () => true,
    ensureClioWorksLedgerModule: async () => true,
    ensureFinderObjectsModule: async () => true,
    // The three editor surfaces: which window a format's document lands in.
    AISystem6ClioWrite: {
      open: async (record, meta) => { log.opened.push({ surface: "clioWrite", record, meta }); log.current = { mountedName: meta.mountedName }; return { ok: true }; },
      current: () => log.current,
    },
    AISystem6ClioChartWorkbook: {
      open: async (record, meta) => { log.opened.push({ surface: "clioChart", record, meta }); return { ok: true }; },
      current: () => null,
    },
    AISystem6ClioStageNative: {
      open: async (record, meta) => { log.opened.push({ surface: "clioStage", record, meta }); return { ok: true }; },
      current: () => null,
    },
  });
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
  loadScripts(ctx, [
    "app/core/storage-transactions.js",
    "app/core/state-stores.js",
    "app/core/native-binaries.js",
    "app/vendor/clioworks-v3/quire-adapter.js",
    "app/vendor/clioworks-v3/ledger-adapter.js",
    "app/vendor/clioworks-v3/lectern-adapter.js",
    "app/vendor/clioworks-v3/native-host.js",
    "app/features/finder-objects.js",
    "app/features/office-new.js",
  ]);
  return { ctx, log, api: ctx.AISystem6OfficeNew, store: ctx.AISystem6NativeBinaries };
}

/** Claim the durable write fence the way a writing window does. */
async function claimFence(ctx) {
  const db = await ctx.openAppDb();
  const fence = await ctx.AISystem6StorageTransactions.claimWriteFence(db, "n4-test");
  db.close();
  ctx.AISystem6WriteLease = { assertCanWrite: () => fence };
}

/** One part of a package, through the same vendored zip the codecs use. */
async function partText(ctx, handle, name) {
  const entries = await ctx.L.zip.read(await ctx.AISystem6NativeBinaries.readDocumentBytes(handle.nativeDocumentId).then((row) => row.bytes.buffer));
  const entry = [...entries.values()].find((item) => item.name === name);
  return entry ? ctx.L.zip.decode(await entry.bytes()) : "";
}

const run = async () => {
  const idb = fakeIndexedDB();
  seedDb(idb);
  const { ctx, log, api, store } = desk(idb);
  await claimFence(ctx);
  const rows = () => idb.databases.get("ai-system-6-db").stores.get("nativeDocuments").records;

  // 1. Three blanks, each opened by its desk adapter: the bytes are real documents.
  const blanks = {};
  for (const [format, adapter, surface] of [
    ["docx", "ClioWorksQuireAdapter", "clioWrite"],
    ["xlsx", "ClioWorksLedgerAdapter", "clioChart"],
    ["pptx", "ClioWorksLecternAdapter", "clioStage"],
  ]) {
    const made = await api.createBlank(format);
    blanks[format] = made;
    test.assert(made.ok && made.item.type === "office" && made.item.format === format && made.opened,
      `a blank ${format} is created on the Project Hard Disk and opened in its editor`);
    test.assert(log.opened.at(-1).surface === surface && log.opened.at(-1).meta.mountedName === store.projectHandle(made.item.id),
      `the blank ${format} opens through its own surface with the project handle`);
    const row = rows().get(made.item.nativeDocumentId);
    test.assert(row && row.bytes instanceof ArrayBuffer && row.byteLength > 0 && row.format === format,
      `the blank ${format} has its own bytes row`);
    // OPEN the bytes with the desk adapter: the proof they are a valid document.
    const check = await ctx[adapter].open(new Uint8Array(row.bytes), { name: made.item.name });
    test.assert(!!check, `the blank ${format}'s bytes open in the ${format} desk adapter`);
  }

  // 2. The Chinese-friendly defaults the codecs were asked for (UI language zh).
  {
    const docxXml = await partText(ctx, blanks.docx.item, "word/document.xml");
    test.assert(/w:pgSz[^>]*w:w="11906"/.test(docxXml) && /w:pgSz[^>]*w:h="16838"/.test(docxXml),
      "the blank docx page is A4 (11906×16838 twentieths), not US Letter");
    const stylesXml = await partText(ctx, blanks.docx.item, "word/styles.xml");
    test.assert(/w:eastAsia="宋体"/.test(stylesXml), "the blank docx's defaults carry 宋体 as the East Asian font");
    const workbookXml = await partText(ctx, blanks.xlsx.item, "xl/workbook.xml");
    test.assert(/<sheet[^>]*name="工作表1"/.test(workbookXml), "the blank workbook's one sheet is named 工作表1 in the Chinese UI");
    const presXml = await partText(ctx, blanks.pptx.item, "ppt/presentation.xml");
    test.assert(/<p:sldSz[^>]*cx="12192000"/.test(presXml) && /<p:sldSz[^>]*cy="6858000"/.test(presXml),
      "the blank presentation is 16:9 (12192000×6858000 EMU)");
    const slideCount = [...(await ctx.L.zip.read(await store.readDocumentBytes(blanks.pptx.item.nativeDocumentId).then((r) => r.bytes.buffer))).values()]
      .filter((entry) => /ppt\/slides\/slide\d+\.xml$/.test(entry.name)).length;
    test.assert(slideCount === 0, "the blank presentation starts empty (no slides)");
    // The English UI keeps the codec's own defaults for names.
    ctx.currentLanguage = "en";
    const enMade = await api.createBlank("xlsx");
    const enXml = await partText(ctx, enMade.item, "xl/workbook.xml");
    test.assert(/<sheet[^>]*name="Sheet1"/.test(enXml), "the English UI's blank workbook names its sheet Sheet1");
    ctx.currentLanguage = "zh";
  }

  // 3. 未命名 1, 未命名 2 … the numbering nextAvailableFileName taught.
  {
    test.assert(blanks.docx.item.name === "未命名 1.docx" && blanks.xlsx.item.name === "未命名 1.xlsx" && blanks.pptx.item.name === "未命名 1.pptx",
      "each format's first blank is 未命名 1 with its extension");
    const second = await api.createBlank("docx");
    const third = await api.createBlank("docx");
    test.assert(second.item.name === "未命名 2.docx" && third.item.name === "未命名 3.docx",
      "the next blanks of the same format number onwards");
    const enSecond = await (async () => { ctx.currentLanguage = "en"; try { return await api.createBlank("docx"); } finally { ctx.currentLanguage = "zh"; } })();
    test.assert(enSecond.item.name === "Untitled 1.docx", "the English UI numbers its own sequence");
  }

  // 4. The linked hidden text source, exactly as N0 makes one for a saved document.
  {
    const item = blanks.docx.item;
    const stored = idb.databases.get("ai-system-6-db").stores.get("projectReferences").records.get(item.referenceId);
    test.assert(item.referenceId && stored && stored.officeFileId === item.id,
      "each new document names its linked source, and the source names it back");
    test.assert(Array.isArray(stored.chunks) && stored.body === "",
      "the linked source is a real source: chunked, and honestly empty for a blank document");
  }

  // 5. A failed create leaves nothing behind: no item, no bytes row.
  {
    const filesBefore = ctx.chatFiles.length;
    const rowsBefore = rows().size;
    log.saveFails = true;
    const failed = await api.createBlank("docx");
    log.saveFails = false;
    test.assert(failed.ok === false && failed.reason === "store-failed", "a create whose item cannot be committed reports the failure");
    test.assert(ctx.chatFiles.length === filesBefore && rows().size === rowsBefore,
      "the failed create leaves neither item nor bytes behind");
  }

  // 6. Stationery: 存为文具… marks the front document; opening the pad copies its bytes.
  {
    // No document in front: an honest refusal, not a silent no-op.
    log.current = null;
    const none = await api.saveAsStationery();
    test.assert(none.ok === false && none.reason === "no-document", "存为文具… without a document in front says so");

    // The front editor's document is the one marked.
    const handle = store.projectHandle(blanks.pptx.item.id);
    log.current = { mountedName: handle };
    await store.openProjectDocument(blanks.pptx.item.id);
    const marked = await api.saveAsStationery();
    test.assert(marked.ok && blanks.pptx.item.stationery === true, "存为文具… marks the front editor's document as a stationery pad");

    // Opening the pad never edits it: an 未命名 copy with the same bytes in its OWN row.
    const padBytesSha = sha(new Uint8Array(rows().get(blanks.pptx.item.nativeDocumentId).bytes));
    const beforeFiles = ctx.chatFiles.length;
    const copyPromise = ctx.openProjectFileWithStationery(blanks.pptx.item);
    const copy = await copyPromise;
    test.assert(!!copy && copy.id !== blanks.pptx.item.id && copy.name === "未命名.pptx" && copy.stationery !== true && ctx.chatFiles.length === beforeFiles + 1,
      "opening a marked pad makes a fresh 未命名 copy that is not itself a pad");
    test.assert(copy.nativeDocumentId !== blanks.pptx.item.nativeDocumentId
      && sha(new Uint8Array(rows().get(copy.nativeDocumentId).bytes)) === padBytesSha,
      "the copy duplicates the pad's bytes into its own bytes row (same bytes)");
    test.assert(rows().get(blanks.pptx.item.nativeDocumentId) && sha(new Uint8Array(rows().get(blanks.pptx.item.nativeDocumentId).bytes)) === padBytesSha
      && log.opened.at(-1).surface === "clioStage" && log.opened.at(-1).meta.mountedName === store.projectHandle(copy.id),
      "the pad keeps its own bytes untouched, and the copy opens in ClioStage");
    const copyReference = idb.databases.get("ai-system-6-db").stores.get("projectReferences").records.get(copy.referenceId);
    test.assert(copy.referenceId && copyReference?.officeFileId === copy.id,
      "the copy is a real document: it gets its own linked source too");

    // An unmarked office document opens normally — no copy.
    const plainOpens = log.opened.length;
    const plain = await ctx.AISystem6ClioWorks.openNativeDocument(blanks.docx.item);
    test.assert(plain.ok && ctx.chatFiles.length === beforeFiles + 1 && log.opened.length === plainOpens + 1,
      "an unmarked office document opens as itself (no stationery copy)");
  }

  // 7. The desk wiring the vm above stands in for: menus, scopes, lazy loading.
  {
    const menus = read("app/data/menus.js");
    const chart = read("app/features/clio-chart.js");
    const write = read("app/features/clio-write.js");
    const runtime = read("app/core/desktop-runtime.js");
    const actionsSource = read("app/core/actions.js");
    const configSource = read("app/core/config.js");
    test.assert(/menuItem\("new-office-document", "new_office_document"\)/.test(menus),
      "the Finder's File menu carries 新建 Office 文稿… with no key equivalent (⌘N stays New Folder)");
    test.assert(/menuItem\("new-office-document", "office_new_blank", "new-office-document"\)/.test(menus) && /menuItem\("office-save-as-stationery", "office_save_as_stationery"\)/.test(menus),
      "ClioStage's File menu carries 新建… ⌘N and 存为文具…");
    test.assert(/menuItem\("new-office-document", "office_new_blank", "new-office-document"\)/.test(chart) && /office-save-as-stationery[\s\S]{0,80}cwk-on/.test(chart),
      "ClioChart's File menu carries 新建… ⌘N always and 存为文具… while a workbook is mounted");
    test.assert(/editRow\('new-office-document', 'office_new_blank', 'new-office-document'\)/.test(write) && /office-save-as-stationery/.test(write),
      "ClioWrite's File menu carries both rows");
    test.assert(/\(item\.type === "text" \|\| item\.type === "chat" \|\| item\.type === "office"\)/.test(runtime),
      "Get Info's 文具 checkbox is offered for office items");
    test.assert(configSource.includes('"app/features/office-new.js", "AISystem6OfficeNew"'),
      "office-new is a lazy module with its loader beside the other system loaders");
    test.assert(actionsSource.includes('"new-office-document":')
      && actionsSource.includes('registerLazyCommand?.("office-save-as-stationery"'),
      "new dispatches eagerly (the key works before the module loads); 存为文具 loads lazily through the runtime");
  }

  // 8. ⌘N scopes through the real boot bundle: the three editors get the new
  //    command; Finder, TeachText, Quick Draft and ClioTalk keep their own.
  {
    const boot = createAppBootVm();
    const scopeOf = (id) => boot.run(`keyboardShortcutRegistry.find((entry) => entry.id === ${JSON.stringify(id)})?.scope`);
    test.assert(JSON.stringify(scopeOf("new-document")) === JSON.stringify(["teachText", "quickDraft"])
      && JSON.stringify(scopeOf("start-new-clio-chat")) === JSON.stringify(["clioTalk"]),
      "the existing ⌘N scopes are unchanged (TeachText/Quick Draft, ClioTalk)");
    test.assert(JSON.stringify(scopeOf("new-office-document")) === JSON.stringify(["clioWrite", "clioChart", "clioStage"]),
      "the new ⌘N entry reaches exactly the three editors");

    boot.run(`
      globalThis.__actions = [];
      handleAction = (action) => { __actions.push(action); };
    `);
    const pressed = (appId) => {
      boot.run(`__actions.length = 0; activeAppId = ${JSON.stringify(appId)};`);
      boot.fireKeydown(boot.document.body, { key: "n", metaKey: true });
      return boot.run("__actions");
    };
    test.assert(pressed("clioWrite")[0] === "new-office-document" && pressed("clioChart")[0] === "new-office-document" && pressed("clioStage")[0] === "new-office-document",
      "pressing ⌘N in ClioWrite, ClioChart and ClioStage dispatches the new Office document command");
    test.assert(pressed("teachText")[0] === "new-document" && pressed("quickDraft")[0] === "new-document",
      "⌘N in TeachText and Quick Draft still makes a text document");
    test.assert(pressed("clioTalk")[0] === "start-new-clio-chat", "⌘N in ClioTalk still starts a new conversation");
    const finder = pressed("finder");
    test.assert(finder[0] === "new-folder" || finder.length === 0,
      "⌘N in the Finder keeps its own meaning (New Folder in the classic eras), never the Office command");
    test.assert(!finder.includes("new-office-document"), "the Finder's ⌘N never reaches the Office new command");
  }
};

run().then(() => test.finish(), (error) => {
  test.assert(false, `contract threw: ${error && error.stack || error}`);
  test.finish();
});
