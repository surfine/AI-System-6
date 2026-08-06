// Browser adapter for post-commit derived indexing.
// It observes durable project state only after a successful source transaction.

const derivedIndexStorageKey = "derived-index:v1";
let derivedIndexState = window.AISystem6DerivedIndexRuntime.createDerivedIndexState();
let derivedIndexSourceSnapshots = new Map();
let derivedIndexTimer = null;
let derivedIndexRunning = false;
let derivedIndexNeedsSync = false;
let derivedIndexNotificationId = "";
let derivedIndexSilent = false;

function derivedIndexAddSource(target, source) {
  const content = String(source?.content || "").trim();
  const projectId = String(source?.projectId || "");
  const sourceId = String(source?.sourceId || "");
  if (!content || !projectId || !sourceId) return;
  const normalized = {
    projectId,
    sourceId,
    sourceKind: String(source.sourceKind || "source"),
    sourceVersion: String(source.sourceVersion || ""),
    title: String(source.title || ""),
    content,
  };
  target.set(window.AISystem6DerivedIndexRuntime.sourceKey(normalized), normalized);
}

function collectDerivedIndexSources() {
  const sources = new Map();
  (Array.isArray(projects) ? projects : []).forEach((project) => {
    const projectId = String(project?.id || "");
    if (!projectId) return;
    derivedIndexAddSource(sources, {
      projectId,
      sourceId: "question-sheet",
      sourceKind: "question-sheet",
      sourceVersion: project.updatedAt,
      title: "Question Sheet",
      content: project.questionSheet,
    });
    derivedIndexAddSource(sources, {
      projectId,
      sourceId: "outline",
      sourceKind: "outline",
      sourceVersion: project.updatedAt,
      title: "Outline",
      content: project.outline,
    });
    (Array.isArray(project.drafts) ? project.drafts : []).forEach((draft, index) => {
      derivedIndexAddSource(sources, {
        projectId,
        sourceId: String(draft?.id || `draft-${index + 1}`),
        sourceKind: "draft",
        sourceVersion: draft?.updatedAt || project.updatedAt,
        title: draft?.title || draft?.sectionTitle || `Draft ${index + 1}`,
        content: draft?.body,
      });
    });
    (Array.isArray(project.documentTabs) ? project.documentTabs : []).forEach((tab) => {
      if (tab?.app === "teachText") {
        derivedIndexAddSource(sources, {
          projectId,
          sourceId: String(tab.id || ""),
          sourceKind: tab.role === "manuscript" ? "manuscript" : "teachtext",
          sourceVersion: tab.updatedAt,
          title: tab.title,
          content: tab.state?.body,
        });
      }
      if (tab?.app === "docMap") {
        derivedIndexAddSource(sources, {
          projectId,
          sourceId: String(tab.id || ""),
          sourceKind: "saved-docmap",
          sourceVersion: tab.updatedAt,
          title: tab.title,
          content: JSON.stringify(tab.state?.map || tab.state || {}),
        });
      }
    });
  });
  (Array.isArray(chatFiles) ? chatFiles : [])
    .filter((file) => file?.type === "text" && !file?.artifactKind)
    .forEach((file) => derivedIndexAddSource(sources, {
      projectId: file.projectId,
      sourceId: file.id,
      sourceKind: "project-file",
      sourceVersion: file.updatedAt || file.createdAt,
      title: file.name,
      content: file.body,
    }));
  (Array.isArray(scraps) ? scraps : []).forEach((scrap) => derivedIndexAddSource(sources, {
    projectId: scrap.projectId,
    sourceId: scrap.id,
    sourceKind: "scrap",
    sourceVersion: scrap.updatedAt || scrap.createdAt,
    title: scrap.title,
    content: scrap.body,
  }));
  (Array.isArray(projectReferences) ? projectReferences : [])
    .filter((reference) => reference?.enabled !== false)
    .forEach((reference) => derivedIndexAddSource(sources, {
      projectId: reference.projectId,
      sourceId: reference.id,
      sourceKind: "project-reference",
      sourceVersion: reference.updatedAt || reference.createdAt,
      title: reference.name,
      content: (reference.chunks || []).map((chunk) => chunk?.content || chunk?.text || "").join("\n\n"),
    }));
  return sources;
}

async function readDerivedIndexState() {
  let db;
  try {
    db = await openAppDb();
    const tx = db.transaction(keyvalStoreName, "readonly");
    const value = await idbRequest(tx.objectStore(keyvalStoreName).get(derivedIndexStorageKey));
    await window.AISystem6StorageTransactions.transactionDone(tx);
    return window.AISystem6DerivedIndexRuntime.createDerivedIndexState(value);
  } finally {
    db?.close();
  }
}

async function writeDerivedIndexState() {
  let db;
  try {
    db = await openAppDb();
    const tx = db.transaction(keyvalStoreName, "readwrite");
    const completion = window.AISystem6StorageTransactions.transactionDone(tx);
    await idbRequest(tx.objectStore(keyvalStoreName).put(derivedIndexState, derivedIndexStorageKey));
    await completion;
  } finally {
    db?.close();
  }
}

function removePublishedDerivedChunks(sourceKeys = []) {
  const keys = new Set(sourceKeys);
  if (!keys.size || !Array.isArray(ragChunks)) return;
  for (let index = ragChunks.length - 1; index >= 0; index -= 1) {
    if (ragChunks[index]?.fromDerivedIndex && keys.has(ragChunks[index].derivedSourceKey)) {
      ragChunks.splice(index, 1);
    }
  }
}

function publishDerivedSourceChunks(key) {
  removePublishedDerivedChunks([key]);
  const source = derivedIndexState.sources[key];
  const chunks = source?.products?.chunks;
  if (!source || chunks?.status !== "ready" || chunks.stale || !Array.isArray(chunks.data)) return;
  const embeddingProduct = source.products?.embeddings;
  const embeddings = embeddingProduct?.status === "ready"
    && !embeddingProduct.stale
    && embeddingProduct.sourceHash === source.sourceHash
    && Array.isArray(embeddingProduct.data)
    ? new Map(embeddingProduct.data.map((item) => [item.chunkHash, item.embedding]))
    : new Map();
  const nextChunks = chunks.data.map((chunk, index) => ({
    ...chunk,
    id: `derived:${key}:${index + 1}`,
    projectId: source.projectId,
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    sourceHash: source.sourceHash,
    sourceVersion: source.sourceVersion,
    source: source.title || source.sourceId,
    content: String(chunk.content || ""),
    embedding: embeddings.get(chunk.chunkHash),
    fromDerivedIndex: true,
    derivedSourceKey: key,
  }));
  ragChunks.push(...nextChunks);
}

function publishAllDerivedChunks() {
  const publishedKeys = Object.keys(derivedIndexState.sources);
  removePublishedDerivedChunks(publishedKeys);
  publishedKeys.forEach(publishDerivedSourceChunks);
  if (typeof ragRankCache !== "undefined" && typeof ragRankCache.clear === "function") ragRankCache.clear();
}

async function deriveEmbeddingProduct(source, key) {
  const chunkProduct = derivedIndexState.sources[key]?.products?.chunks;
  const chunks = chunkProduct?.status === "ready" && !chunkProduct.stale
    ? chunkProduct.data
    : window.AISystem6RetrievalRuntime.chunkText(source.content, {
        projectId: source.projectId,
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        title: source.title,
      });
  if (!chunks.length) return [];
  const embeddings = [];
  for (let start = 0; start < chunks.length; start += 32) {
    const batch = chunks.slice(start, start + 32);
    const vectors = await embedTexts(batch.map((chunk) => chunk.content));
    batch.forEach((chunk, index) => {
      embeddings.push({ chunkHash: chunk.chunkHash, embedding: vectors[index] });
    });
  }
  return embeddings;
}

async function executeDerivedIndexJob(job) {
  const source = derivedIndexSourceSnapshots.get(job.sourceKey);
  if (!source) throw new Error("The committed source is no longer available.");
  if (window.AISystem6DerivedIndexRuntime.sourceHash(source) !== job.sourceHash) {
    throw new Error("The committed source changed before derivation completed.");
  }
  if (job.kind === "embeddings") return deriveEmbeddingProduct(source, job.sourceKey);
  return window.AISystem6DerivedIndexRuntime.buildDerivedProduct(job.kind, source, {
    chunkText(text, sourceDescriptor) {
      return window.AISystem6RetrievalRuntime.chunkText(text, sourceDescriptor);
    },
  });
}

function updateDerivedIndexNotification(message, state) {
  if (derivedIndexSilent || typeof pushSystemNotification !== "function") return;
  derivedIndexNotificationId = pushSystemNotification(message, {
    replaceId: derivedIndexNotificationId,
    state,
  });
  window.AISystem6ControlStrip?.refreshStrip?.();
}

async function processDerivedIndexQueue() {
  let failedEmbeddings = 0;
  let completedChunks = 0;
  let interrupted = false;
  while (true) {
    const claimed = window.AISystem6DerivedIndexRuntime.claimNextDerivedJob(derivedIndexState);
    derivedIndexState = claimed.state;
    const job = claimed.job;
    if (!job) break;
    await writeDerivedIndexState();
    try {
      const product = await executeDerivedIndexJob(job);
      derivedIndexState = window.AISystem6DerivedIndexRuntime.completeDerivedJob(
        derivedIndexState,
        job,
        product
      );
      if (job.kind === "chunks") completedChunks += Array.isArray(product) ? product.length : 0;
      if (job.kind === "chunks" || job.kind === "embeddings") publishDerivedSourceChunks(job.sourceKey);
    } catch (error) {
      if (job.kind === "embeddings") failedEmbeddings += 1;
      derivedIndexState = window.AISystem6DerivedIndexRuntime.failDerivedJob(
        derivedIndexState,
        job,
        error
      );
      console.warn(`Derived ${job.kind} indexing failed without rolling back source state.`, error);
    }
    await writeDerivedIndexState();
    if (derivedIndexNeedsSync) {
      interrupted = true;
      break;
    }
  }
  return { failedEmbeddings, completedChunks, interrupted };
}

async function synchronizeAndProcessDerivedIndex() {
  if (derivedIndexRunning) {
    derivedIndexNeedsSync = true;
    return;
  }
  derivedIndexRunning = true;
  try {
    let notificationSources = 0;
    let notificationChunks = 0;
    let notificationEmbeddingFailures = 0;
    do {
      derivedIndexNeedsSync = false;
      derivedIndexSourceSnapshots = collectDerivedIndexSources();
      const synchronized = window.AISystem6DerivedIndexRuntime.synchronizeDerivedSources(
        derivedIndexState,
        [...derivedIndexSourceSnapshots.values()]
      );
      derivedIndexState = synchronized.state;
      removePublishedDerivedChunks([...synchronized.changedSourceKeys, ...synchronized.removedSourceKeys]);
      if (synchronized.changedSourceKeys.length || synchronized.removedSourceKeys.length) {
        await writeDerivedIndexState();
      }
      if (synchronized.changedSourceKeys.length) {
        notificationSources += synchronized.changedSourceKeys.length;
        updateDerivedIndexNotification(
          t("derived_index_running", synchronized.changedSourceKeys.length),
          "running"
        );
      }
      const outcome = await processDerivedIndexQueue();
      notificationChunks += outcome.completedChunks;
      notificationEmbeddingFailures += outcome.failedEmbeddings;
    } while (derivedIndexNeedsSync);
    if (notificationSources) {
      const message = notificationEmbeddingFailures
        ? t("derived_index_keyword_ready", notificationChunks, notificationSources)
        : t("derived_index_ready", notificationChunks, notificationSources);
      updateDerivedIndexNotification(message, notificationEmbeddingFailures ? "failed" : "done");
    }
  } finally {
    derivedIndexRunning = false;
  }
}

function scheduleDerivedIndexSync(delay = 120, silent = false) {
  derivedIndexNeedsSync = true;
  if (silent) derivedIndexSilent = true;
  clearTimeout(derivedIndexTimer);
  derivedIndexTimer = setTimeout(() => {
    synchronizeAndProcessDerivedIndex().catch((error) => {
      console.warn("Derived index queue failed without affecting committed source state.", error);
    }).finally(() => {
      derivedIndexSilent = false;
    });
  }, delay);
}

async function restoreDerivedIndexQueue() {
  derivedIndexState = await readDerivedIndexState();
  derivedIndexSourceSnapshots = collectDerivedIndexSources();
  const synchronized = window.AISystem6DerivedIndexRuntime.synchronizeDerivedSources(
    derivedIndexState,
    [...derivedIndexSourceSnapshots.values()]
  );
  derivedIndexState = synchronized.state;
  removePublishedDerivedChunks([...synchronized.changedSourceKeys, ...synchronized.removedSourceKeys]);
  publishAllDerivedChunks();
  if (synchronized.changedSourceKeys.length || synchronized.removedSourceKeys.length) {
    await writeDerivedIndexState();
  }
  scheduleDerivedIndexSync(500);
  return true;
}

async function rebuildDerivedIndexProject(projectId, options = {}) {
  const target = String(projectId || "");
  if (!target) return false;
  const keys = Object.entries(derivedIndexState.sources)
    .filter(([, source]) => source.projectId === target)
    .map(([key]) => key);
  keys.forEach((key) => delete derivedIndexState.sources[key]);
  derivedIndexState.jobs = derivedIndexState.jobs.filter((job) => !keys.includes(job.sourceKey));
  removePublishedDerivedChunks(keys);
  await writeDerivedIndexState();
  scheduleDerivedIndexSync(0, options.silent === true);
  return true;
}

window.AISystem6DerivedIndexQueue = Object.freeze({
  afterProjectCommit(options = {}) {
    scheduleDerivedIndexSync(120, options.silent === true);
    return true;
  },
  restore: restoreDerivedIndexQueue,
  rebuildProject: rebuildDerivedIndexProject,
  getState: () => window.AISystem6DerivedIndexRuntime.createDerivedIndexState(derivedIndexState),
  getProjectChunks(projectId) {
    return ragChunks.filter((chunk) => chunk.fromDerivedIndex && chunk.projectId === String(projectId || ""));
  },
});
