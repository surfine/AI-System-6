// ClioWorks unified spec (S06): the annotated reading package. Built on the
// desk's existing project-disk export — the manifest, sources and excerpts,
// threads, reader notes, relations, reading order and an integrity hash
// travel in one bundle. Distribution honesty: only own-work or authorized
// full text travels whole; anything else travels as the reader's excerpts
// plus the source link. Import validates what the desk's backup layer does
// not: path traversal, oversize bundles, duplicate ids, dangerous URLs and
// unknown schemas. A receiver's annotations land under fresh owner/layer
// ids — the original author's layer is never overwritten. Lazy.
(function (root) {
  'use strict';
  if (root.AISystem6ReadingPackage) return;

  /** The distribution rule. 全文只有 own-work 或 authorized-full 旅行；
   * excerpt-only 与 unknown 走摘录 + 链接 — and the pack records which it
   * did, per source. */
  function distributionFor(source) {
    const mode = String(source?.distribution || "unknown");
    if (mode === "own-work" || mode === "authorized-full") {
      return { includeFullText: true, recordedAs: mode };
    }
    return {
      includeFullText: false,
      recordedAs: mode === "excerpt-only" ? "excerpt-only" : "unknown",
      // The excerpts still carry the reader's own anchored quotes; the
      // link keeps the provenance path.
      carryExcerpts: true,
      carryLink: true,
    };
  }

  /** Build the reading manifest over the desk's own records — mapping, not
   * copying: the ids are the desk's ids. */
  function buildManifest({ project, sources, threads, notes, relations, readingOrder = [] } = {}) {
    const id = String(project?.id || "");
    if (!id) return null;
    const entries = (Array.isArray(sources) ? sources : []).map((source) => {
      const distribution = distributionFor(source);
      return {
        sourceId: String(source.id || ""),
        title: String(source.title || ""),
        origin: source.origin || null,
        distribution: distribution.recordedAs,
        includesFullText: distribution.includeFullText,
        excerptIds: (Array.isArray(source.excerpts) ? source.excerpts : []).map((excerpt) => String(excerpt.id || "")),
      };
    });
    return {
      schema: "reading-package",
      schemaVersion: 1,
      projectId: id,
      createdAt: new Date().toISOString(),
      sources: entries,
      threadIds: (Array.isArray(threads) ? threads : []).map((thread) => String(thread.id || "")),
      noteIds: (Array.isArray(notes) ? notes : []).map((note) => String(note.id || "")),
      relationIds: (Array.isArray(relations) ? relations : []).map((relation) => String(relation.id || "")),
      readingOrder: (Array.isArray(readingOrder) ? readingOrder : []).map(String),
    };
  }

  /** The integrity hash over the manifest's own serialized shape — a receiver
   * can verify the pack arrived as it left. clioRunHash is the desk's hash. */
  function integrityHash(manifest) {
    const hash = root.clioRunHash;
    if (!hash) return "";
    return hash(JSON.stringify(manifest));
  }

  /** Import validation — the five checks S06 names. Returns { ok, problems }
   * with each problem carrying its path; ok packs pass silently. */
  const MAX_PACK_BYTES = 512 * 1024 * 1024;

  function validateImport(pack) {
    const problems = [];
    const fail = (path, reason) => problems.push({ path, reason });
    if (!pack || typeof pack !== "object") {
      return { ok: false, problems: [{ path: "pack", reason: "not-an-object" }] };
    }
    const json = (() => { try { return JSON.stringify(pack); } catch { return null; } })();
    if (json === null) return { ok: false, problems: [{ path: "pack", reason: "unserializable" }] };
    if (json.length > MAX_PACK_BYTES) fail("pack", "oversize");
    // The manifest may declare the sender-side size; a declaration far above
    // the wire cap is refused before anything else is even looked at.
    const declared = Number(pack.declaredSizeBytes || 0);
    if (declared > MAX_PACK_BYTES) fail("pack.declaredSizeBytes", "oversize");

    if (pack.manifest?.schema !== "reading-package") fail("manifest.schema", "unknown schema");
    const manifest = pack.manifest || {};
    for (const key of ["projectId", "createdAt"]) {
      if (!manifest[key]) fail(`manifest.${key}`, "required");
    }

    // Path traversal: no name or locator may escape its container.
    const names = [];
    const collectNames = (node, path) => {
      if (!node || typeof node !== "object") return;
      if (typeof node.name === "string") names.push([path, node.name]);
      if (typeof node.locator === "string") names.push([path, node.locator]);
      Object.entries(node).forEach(([key, value]) => {
        if (value && typeof value === "object") collectNames(value, `${path}.${key}`);
      });
    };
    collectNames(pack, "pack");
    names.forEach(([path, name]) => {
      if (name.includes("../") || name.includes("..\\") || /^[a-zA-Z]:/.test(name)) {
        fail(path, "path traversal");
      }
    });

    // Dangerous URLs: only http(s) links travel; javascript:, data: and
    // file: URLs are refused at import, whatever the sender claimed.
    const urls = [];
    const collectUrls = (node, path) => {
      if (!node || typeof node !== "object") return;
      if (typeof node.url === "string") urls.push([path, node.url]);
      Object.entries(node).forEach(([key, value]) => {
        if (value && typeof value === "object") collectUrls(value, `${path}.${key}`);
      });
    };
    collectUrls(pack, "pack");
    urls.forEach(([path, url]) => {
      if (!/^https?:\/\//i.test(url)) fail(path, "dangerous url");
    });

    // Duplicate ids across every named id space the manifest references.
    const seen = new Map();
    const checkId = (path, id) => {
      const key = String(id || "");
      if (!key) return;
      if (seen.has(key)) fail(path, `duplicate id ${key}`);
      else seen.set(key, path);
    };
    (manifest.sources || []).forEach((source, index) => checkId(`manifest.sources[${index}]`, source.sourceId));
    (manifest.threadIds || []).forEach((id, index) => checkId(`manifest.threadIds[${index}]`, id));
    (manifest.noteIds || []).forEach((id, index) => checkId(`manifest.noteIds[${index}]`, id));
    (manifest.relationIds || []).forEach((id, index) => checkId(`manifest.relationIds[${index}]`, id));

    return { ok: problems.length === 0, problems };
  }

  /** Receiving: the receiver's annotations land under fresh owner/layer ids.
   * The sender's layer stays readable; nothing the receiver writes can
   * overwrite it. */
  function receiveAnnotation(annotation, receiverId) {
    if (!annotation || typeof annotation !== "object") return null;
    const owner = String(receiverId || "").trim();
    if (!owner) return null;
    return {
      ...annotation,
      layerId: `layer-${root.clioRunHash ? root.clioRunHash(`${owner}:${annotation.id || ""}`) : owner}`,
      ownerId: owner,
      // The sender's layer id travels read-only inside the pack's own
      // annotation; the receiver's copy points at it, never replaces it.
      upstreamLayerId: String(annotation.layerId || annotation.upstreamLayerId || ""),
    };
  }

  /** The honest coexistence note: a reading package is not an Office edit —
   * DOCX/PPTX/XLSX fidelity claims are out of scope, and sharing with
   * ClioWorks keeps the existing object ids. */
  function coexistenceNote() {
    return "阅读包不是 DOCX/PPTX/XLSX 的无损编辑承诺；与 ClioWorks 协同时共享既有对象 ID。";
  }

  root.AISystem6ReadingPackage = Object.freeze({
    distributionFor,
    buildManifest,
    integrityHash,
    validateImport,
    receiveAnnotation,
    coexistenceNote,
  });
})(typeof window !== "undefined" ? window : globalThis);
