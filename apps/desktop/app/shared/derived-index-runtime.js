// Pure post-commit derived-index queue contracts.
// Source text is accepted as transient input but is never copied into queue state.

(function exposeDerivedIndexRuntime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6DerivedIndexRuntime = api;
})(typeof globalThis !== "undefined" ? (/** @type {any} */ (globalThis)).window || null : null, () => {
  const schemaVersion = 1;
  const productKinds = Object.freeze(["chunks", "gist", "docmap", "embeddings"]);

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function stableHash(value = "") {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function createDerivedIndexState(value = {}) {
    return {
      schemaVersion,
      sources: value?.sources && typeof value.sources === "object" ? clone(value.sources) : {},
      jobs: Array.isArray(value?.jobs) ? clone(value.jobs) : [],
      updatedAt: String(value?.updatedAt || ""),
    };
  }

  function sourceKey(source = {}) {
    return `${String(source.projectId || "")}/${String(source.sourceKind || "source")}/${String(source.sourceId || "")}`;
  }

  function sourceHash(source = {}) {
    return stableHash([
      String(source.projectId || ""),
      String(source.sourceId || ""),
      String(source.sourceKind || "source"),
      String(source.content || ""),
    ].join("\u241f"));
  }

  function normalizeSource(source = {}) {
    const projectId = String(source.projectId || "");
    const sourceId = String(source.sourceId || "");
    if (!projectId || !sourceId) return null;
    return {
      projectId,
      sourceId,
      sourceKind: String(source.sourceKind || "source"),
      sourceVersion: String(source.sourceVersion || ""),
      title: String(source.title || ""),
      content: String(source.content || ""),
    };
  }

  function jobId(key, hash, kind) {
    return `${key}@${hash}:${kind}`;
  }

  function synchronizeDerivedSources(currentState, sources = [], options = {}) {
    const now = String(options.now || new Date().toISOString());
    const state = createDerivedIndexState(currentState);
    const incoming = new Map();
    const changedSourceKeys = [];
    sources.map(normalizeSource).filter(Boolean).forEach((source) => {
      const key = sourceKey(source);
      incoming.set(key, source);
      const hash = sourceHash(source);
      const previous = state.sources[key];
      if (previous?.sourceHash === hash) {
        state.sources[key] = {
          ...previous,
          sourceVersion: source.sourceVersion,
          title: source.title,
          observedAt: now,
        };
        return;
      }

      changedSourceKeys.push(key);
      state.jobs.forEach((job) => {
        if (job.sourceKey === key && job.status !== "completed") {
          job.status = "superseded";
          job.updatedAt = now;
        }
      });
      const staleProducts = Object.fromEntries(
        Object.entries(previous?.products || {}).map(([kind, product]) => [
          kind,
          { ...product, stale: true },
        ])
      );
      state.sources[key] = {
        projectId: source.projectId,
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceVersion: source.sourceVersion,
        sourceHash: hash,
        title: source.title,
        products: staleProducts,
        observedAt: now,
      };
      productKinds.forEach((kind) => {
        state.jobs.push({
          id: jobId(key, hash, kind),
          sourceKey: key,
          sourceHash: hash,
          kind,
          status: "pending",
          attempts: 0,
          error: "",
          nextRetryAt: "",
          createdAt: now,
          updatedAt: now,
        });
      });
    });

    const removedSourceKeys = Object.keys(state.sources).filter((key) => !incoming.has(key));
    removedSourceKeys.forEach((key) => {
      delete state.sources[key];
      state.jobs.forEach((job) => {
        if (job.sourceKey === key && job.status !== "completed") {
          job.status = "superseded";
          job.updatedAt = now;
        }
      });
    });
    state.jobs = state.jobs
      .filter((job, index, jobs) => jobs.findIndex((candidate) => candidate.id === job.id) === index)
      .slice(-4000);
    state.updatedAt = now;
    return { state, changedSourceKeys, removedSourceKeys };
  }

  function claimNextDerivedJob(currentState, options = {}) {
    const now = String(options.now || new Date().toISOString());
    const maxAttempts = Number.isInteger(options.maxAttempts) ? options.maxAttempts : 3;
    const state = createDerivedIndexState(currentState);
    const nowMs = Date.parse(now) || 0;
    const job = state.jobs.find((candidate) => {
      if (candidate.status === "pending") return true;
      if (candidate.status !== "failed" || candidate.attempts >= maxAttempts) return false;
      return !candidate.nextRetryAt || (Date.parse(candidate.nextRetryAt) || 0) <= nowMs;
    });
    if (!job) return { state, job: null };
    job.status = "running";
    job.attempts += 1;
    job.error = "";
    job.updatedAt = now;
    state.updatedAt = now;
    return { state, job: clone(job) };
  }

  function completeDerivedJob(currentState, completedJob, data, options = {}) {
    const now = String(options.now || new Date().toISOString());
    const state = createDerivedIndexState(currentState);
    const job = state.jobs.find((candidate) => candidate.id === completedJob?.id);
    const source = state.sources[job?.sourceKey || ""];
    if (!job) return state;
    if (!source || source.sourceHash !== job.sourceHash) {
      job.status = "superseded";
      job.updatedAt = now;
      state.updatedAt = now;
      return state;
    }
    source.products = source.products || {};
    source.products[job.kind] = {
      kind: job.kind,
      sourceHash: job.sourceHash,
      version: 1,
      status: "ready",
      stale: false,
      updatedAt: now,
      data: clone(data),
    };
    job.status = "completed";
    job.error = "";
    job.nextRetryAt = "";
    job.updatedAt = now;
    state.updatedAt = now;
    return state;
  }

  function failDerivedJob(currentState, failedJob, error, options = {}) {
    const now = String(options.now || new Date().toISOString());
    const retryBaseMs = Number.isFinite(options.retryBaseMs) ? options.retryBaseMs : 30000;
    const state = createDerivedIndexState(currentState);
    const job = state.jobs.find((candidate) => candidate.id === failedJob?.id);
    if (!job) return state;
    job.status = "failed";
    job.error = String(error?.message || error || "Derived indexing failed.");
    job.nextRetryAt = new Date((Date.parse(now) || Date.now()) + retryBaseMs * (2 ** Math.max(0, job.attempts - 1))).toISOString();
    job.updatedAt = now;
    state.updatedAt = now;
    return state;
  }

  function buildGist(content = "") {
    const paragraphs = String(content).split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const anchors = String(content)
      .split("\n")
      .map((line) => line.match(/^#{1,6}\s+(.+)/)?.[1]?.trim() || "")
      .filter(Boolean)
      .slice(0, 12);
    return {
      coarse: paragraphs.slice(0, 2).join("\n\n").slice(0, 1200),
      detail: paragraphs.slice(0, 6).join("\n\n").slice(0, 4800),
      anchors,
    };
  }

  function buildDocMap(content = "", title = "") {
    const headings = String(content)
      .split("\n")
      .map((line) => {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        return match ? { depth: match[1].length, title: match[2].trim() } : null;
      })
      .filter(Boolean)
      .slice(0, 120);
    return {
      title: String(title || headings[0]?.title || ""),
      nodes: headings.map((heading, index) => ({
        id: `heading-${index + 1}`,
        depth: heading.depth,
        title: heading.title,
      })),
    };
  }

  function buildDerivedProduct(kind, source, dependencies = {}) {
    if (!productKinds.includes(kind)) throw new TypeError(`Unknown derived product: ${kind}`);
    if (kind === "gist") return buildGist(source?.content);
    if (kind === "docmap") return buildDocMap(source?.content, source?.title);
    if (kind === "chunks") {
      if (typeof dependencies.chunkText !== "function") throw new TypeError("Chunk derivation requires chunkText().");
      return dependencies.chunkText(source?.content || "", {
        projectId: source?.projectId,
        sourceId: source?.sourceId,
        sourceKind: source?.sourceKind,
        title: source?.title,
      });
    }
    if (typeof dependencies.embed !== "function") throw new TypeError("Embedding derivation requires embed().");
    return dependencies.embed(source);
  }

  return Object.freeze({
    schemaVersion,
    productKinds,
    stableHash,
    createDerivedIndexState,
    sourceKey,
    sourceHash,
    synchronizeDerivedSources,
    claimNextDerivedJob,
    completeDerivedJob,
    failDerivedJob,
    buildDerivedProduct,
  });
});
