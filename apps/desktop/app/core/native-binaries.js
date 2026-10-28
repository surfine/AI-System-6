// ClioWorks v4 (V4-01 host): native binary object store.
//
// A mounted Office package keeps its ORIGINAL BYTES here, next to — never
// inside — the File Floppy's extracted text. The text projection stays a
// disposable reading aid; this store is what "edit the file" opens, what
// preserving save reads back, and what Working Session persistence carries.
//
// Storage boundary (CLAUDE.md): IndexedDB ai-system-6-db owns projects and
// records. A FLOPPY package keeps its in-memory copy here and rides the
// desk's working-session snapshot (mountedTextDisk.nativeFiles): the floppy
// is temporary context, so its bytes are too.
//
// N0 (owner decision 2026-10-24): an Office document can also live on the
// Project Hard Disk. Its bytes are one row of the "nativeDocuments" store
// (DB v7) — { id, projectId, format, bytes: ArrayBuffer, byteLength, sha256,
// updatedAt } — and the project file that names it is a small chatFiles item
// { id, type: "office", format, name, folderId, projectId, nativeDocumentId,
// byteLength, createdAt, updatedAt }. The bytes never ride the item, the desk
// snapshot or a commit's rollback copy; an ArrayBuffer instead of the
// pictures' base64 data URL keeps a 5 MB deck 5 MB.
//
// One document, two possible sources, one handle. The editors only ever hold
// an opaque handle string and pass it back (host.save(handle)): a floppy
// document's handle is its mountedName, a project document's is
// "project-file:<fileId>". recordFor(handle) answers for both; record.source
// says which one it is ({ kind: "floppy", mountedName } | { kind: "project",
// fileId }).
//
// Every write goes through the write fence (AISystem6StorageTransactions)
// and every project-file change through ProjectStore's commit/rollback. A new
// document writes its bytes FIRST and its item second; an item that fails to
// commit takes its bytes row back out, and a row nothing names any more is
// swept when the Trash is emptied. Rewriting a document's bytes is one put on
// the same key, so an interrupted save leaves either the old bytes or the new
// ones, never neither.
(function installNativeBinaries(root) {
  if (root.AISystem6NativeBinaries) return;
  'use strict';

  const NATIVE_FORMATS = Object.freeze({
    xlsx: { kind: 'xlsx', label: 'Excel 活頁簿' },
    docx: { kind: 'docx', label: 'Word 文件' },
    pptx: { kind: 'pptx', label: 'PowerPoint 簡報' },
  });

  function formatForName(name) {
    const ext = (String(name || '').match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
    return NATIVE_FORMATS[ext] ? ext : '';
  }

  function bytesToBase64(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    const CHUNK = 0x8000;
    for (let offset = 0; offset < view.length; offset += CHUNK) {
      binary += String.fromCharCode.apply(null, view.subarray(offset, offset + CHUNK));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64 || '');
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return out;
  }

  /** The mountedTextDisk object is a desk global; reach it lazily so this
   * module loads before the desk finishes booting. */
  function disk() {
    if (typeof mountedTextDisk !== 'undefined') return mountedTextDisk;
    throw new Error('native-binaries: mountedTextDisk is not available yet');
  }

  function nativeFiles() {
    const d = disk();
    if (!d.nativeFiles) d.nativeFiles = {};
    return d.nativeFiles;
  }

  /** Register a native package against its mounted (text-projection) name. */
  function register({ mountedName, fileName, format, bytes, projectId }) {
    if (!mountedName) throw new Error('native-binaries: mountedName is required');
    const record = {
      id: `native:${projectId || 'project'}::${mountedName}`,
      type: 'nativeBinary',
      mountedName,
      fileName: fileName || mountedName,
      format: format || formatForName(fileName || mountedName),
      projectId: projectId || null,
      byteLength: bytes ? bytes.byteLength : 0,
      // Original package bytes, base64 for the JSON session snapshot.
      originalBase64: bytes ? bytesToBase64(bytes) : '',
      // Working bytes the adapter mutates through; starts as a copy of the
      // original so an untouched save can still return pristine bytes.
      workingBase64: bytes ? bytesToBase64(bytes) : '',
      editRevision: 0,
      dirty: false,
      createdAt: new Date().toISOString(),
    };
    nativeFiles()[mountedName] = record;
    return record;
  }

  const PROJECT_HANDLE_PREFIX = 'project-file:';
  /** Project documents opened this session, by handle. Never in a snapshot. */
  const projectRecords = new Map();

  function projectHandle(fileId) {
    return PROJECT_HANDLE_PREFIX + String(fileId || '');
  }

  function recordFor(handle) {
    if (projectRecords.has(handle)) return projectRecords.get(handle);
    return typeof mountedTextDisk !== 'undefined' ? nativeFiles()[handle] || null : null;
  }

  function isNative(mountedName) {
    return !!recordFor(mountedName);
  }

  function originalBytes(mountedName) {
    const record = recordFor(mountedName);
    if (record && record.original) return new Uint8Array(record.original);
    return record ? base64ToBytes(record.originalBase64) : null;
  }

  function workingBytes(mountedName) {
    const record = recordFor(mountedName);
    if (record && record.working) return new Uint8Array(record.working);
    return record ? base64ToBytes(record.workingBase64) : null;
  }

  function setWorkingBytes(mountedName, bytes, { dirty = true } = {}) {
    const record = recordFor(mountedName);
    if (!record) throw new Error(`native-binaries: no native file mounted as ${mountedName}`);
    if (record.working) record.working = new Uint8Array(bytes);
    else record.workingBase64 = bytesToBase64(bytes);
    record.byteLength = bytes.byteLength;
    record.dirty = !!dirty;
    if (dirty) record.editRevision += 1;
    return record;
  }

  function remove(mountedName) {
    delete nativeFiles()[mountedName];
  }

  function clear() {
    const files = nativeFiles();
    Object.keys(files).forEach((name) => delete files[name]);
  }

  /** Working-session snapshot shape: serialisable records only. */
  function snapshot() {
    // liveAdapter is the in-memory document model, not a serialisable record;
    // the saved bytes (workingBase64) are what a session carries.
    return JSON.parse(JSON.stringify(nativeFiles(), (key, value) => (key === 'liveAdapter' ? undefined : value)));
  }

  function restore(records) {
    clear();
    Object.entries(records || {}).forEach(([name, record]) => {
      nativeFiles()[name] = record;
    });
  }

  /* ------------------------------------------- N0: the Project Hard Disk */

  const DOCUMENT_STORE = 'nativeDocuments';
  const MIME_TYPES = Object.freeze({
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  // A row nothing names is swept only once it is this old: a document being
  // created right now has its bytes on disk a moment before its item.
  const SWEEP_GRACE_MS = 60 * 1000;

  function toBytes(bytes) {
    if (bytes instanceof Uint8Array) return bytes;
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    throw new Error('native-binaries: bytes must be an ArrayBuffer or a typed array');
  }

  async function sha256Hex(bytes) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      return '';
    }
  }

  function request(req) {
    if (typeof idbRequest === 'function') return idbRequest(req);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** One fenced transaction on the bytes store, the connection closed after. */
  async function withDocumentStore(mode, operation) {
    if (typeof openAppDb !== 'function') throw new Error('native-binaries: the project database is not available');
    const db = await openAppDb();
    try {
      return await root.AISystem6StorageTransactions.runTransaction(
        db, DOCUMENT_STORE, mode, (tx) => operation(tx.objectStore(DOCUMENT_STORE)),
      );
    } finally {
      db.close();
    }
  }

  async function putDocumentBytes({ id, projectId, format, bytes }) {
    const view = toBytes(bytes);
    const copy = view.slice();
    const row = {
      id,
      projectId: projectId || '',
      format,
      bytes: copy.buffer,
      byteLength: copy.byteLength,
      sha256: await sha256Hex(copy),
      updatedAt: new Date().toISOString(),
    };
    await withDocumentStore('readwrite', (store) => request(store.put(row)));
    return row;
  }

  async function readDocumentBytes(id) {
    if (!id) return null;
    const row = await withDocumentStore('readonly', (store) => request(store.get(id)));
    return row ? { ...row, bytes: new Uint8Array(row.bytes) } : null;
  }

  async function deleteDocumentBytes(ids) {
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length) return 0;
    await withDocumentStore('readwrite', (store) => Promise.all(list.map((id) => request(store.delete(id)))));
    return list.length;
  }

  function liveFiles() {
    return typeof chatFiles !== 'undefined' && Array.isArray(chatFiles) ? chatFiles : [];
  }

  function projectStore() {
    const store = root.AISystem6StateStores && root.AISystem6StateStores.projects;
    if (!store || typeof store.commit !== 'function') throw new Error('native-binaries: the project store is not available');
    return store;
  }

  function extensionFor(format) {
    return NATIVE_FORMATS[format] ? `.${format}` : '';
  }

  /** "Report.docx" stays; "Report" becomes "Report.docx"; "Report.txt" becomes "Report.txt.docx". */
  function nameWithExtension(name, format) {
    const ext = extensionFor(format);
    const base = String(name || '').trim() || `Untitled${ext}`;
    return ext && !base.toLowerCase().endsWith(ext) ? base + ext : base;
  }

  /** A sibling already called "Report.docx" makes this one "Report 2.docx". */
  function uniqueName(name, { projectId, folderId = null, format, files = liveFiles() } = {}) {
    const full = nameWithExtension(name, format);
    const ext = extensionFor(format);
    const stem = ext ? full.slice(0, -ext.length) : full;
    const taken = new Set(files
      .filter((file) => file && file.projectId === projectId && (file.folderId || null) === (folderId || null))
      .map((file) => String(file.name || '').trim().toLowerCase()));
    if (!taken.has(full.toLowerCase())) return full;
    let index = 2;
    while (taken.has(`${stem} ${index}${ext}`.toLowerCase())) index += 1;
    return `${stem} ${index}${ext}`;
  }

  /** The folder a Save As names, found or made inside the commit's own draft. */
  function folderInDraft(draft, projectId, folderName) {
    const name = String(folderName || '').trim();
    if (!name) return null;
    const folders = draft.chatFolders;
    const display = (value) => (typeof displayFolderName === 'function' ? displayFolderName(value) : value);
    const lower = name.toLowerCase();
    const found = folders.find((folder) => folder && folder.projectId === projectId && !folder.parentId
      && (String(folder.name || '').toLowerCase() === lower || String(display(folder.name) || '').toLowerCase() === lower));
    if (found) return found.id;
    const folder = { id: crypto.randomUUID(), projectId, name, parentId: null, createdAt: new Date().toISOString() };
    folders.push(folder);
    return folder.id;
  }

  /**
   * A new Office document on the Project Hard Disk: bytes first, then the
   * small project file item through the store's commit. If the item cannot
   * be committed its bytes row is taken back out, so nothing is half there.
   * @returns {Promise<object>} the live chatFiles item
   */
  async function createProjectDocument({ projectId, name, folderId = null, folderName = '', format, bytes, referenceId = '' }) {
    if (!projectId) throw new Error('native-binaries: a project is required');
    if (!NATIVE_FORMATS[format]) throw new Error(`native-binaries: unsupported format ${format}`);
    const fileId = crypto.randomUUID();
    const row = await putDocumentBytes({ id: crypto.randomUUID(), projectId, format, bytes });
    try {
      await projectStore().commit((draft) => {
        const targetFolderId = folderName ? folderInDraft(draft, projectId, folderName) : (folderId || null);
        draft.chatFiles.unshift({
          id: fileId,
          type: 'office',
          format,
          name: uniqueName(name, { projectId, folderId: targetFolderId, format, files: draft.chatFiles }),
          folderId: targetFolderId,
          projectId,
          nativeDocumentId: row.id,
          // The project source that carries this document's text (its linked
          // projectReference, which names the document back as officeFileId).
          ...(referenceId ? { referenceId } : {}),
          byteLength: row.byteLength,
          createdAt: row.updatedAt,
          updatedAt: row.updatedAt,
        });
      });
    } catch (error) {
      await deleteDocumentBytes([row.id]).catch(() => {});
      throw error;
    }
    return liveFiles().find((file) => file.id === fileId) || null;
  }

  /**
   * Open a project document's record (cached for the session, so the live
   * model and its unsaved edits survive a second open). Null when the item or
   * its bytes are missing.
   */
  async function openProjectDocument(fileId) {
    const handle = projectHandle(fileId);
    if (projectRecords.has(handle)) return projectRecords.get(handle);
    const item = liveFiles().find((file) => file && file.id === fileId && file.type === 'office');
    if (!item) return null;
    const row = await readDocumentBytes(item.nativeDocumentId);
    if (!row) return null;
    const record = {
      id: item.id,
      type: 'nativeBinary',
      source: { kind: 'project', fileId: item.id },
      mountedName: handle,
      fileName: item.name,
      format: item.format || row.format,
      projectId: item.projectId || row.projectId || null,
      nativeDocumentId: item.nativeDocumentId,
      byteLength: row.byteLength,
      original: row.bytes,
      working: row.bytes,
      editRevision: 0,
      dirty: false,
      createdAt: item.createdAt,
    };
    projectRecords.set(handle, record);
    return record;
  }

  /**
   * Save into a project document: the bytes row is rewritten in place (one put,
   * same key), then the item's size and date follow through the store. An item
   * update that fails does not undo the bytes; the next save repeats it.
   */
  async function writeProjectBytes(handle, bytes) {
    const record = projectRecords.get(handle);
    if (!record) throw new Error(`native-binaries: no project document open as ${handle}`);
    const row = await putDocumentBytes({ id: record.nativeDocumentId, projectId: record.projectId, format: record.format, bytes });
    setWorkingBytes(handle, toBytes(bytes), { dirty: false });
    try {
      await projectStore().commit((draft) => {
        const item = draft.chatFiles.find((file) => file && file.id === record.source.fileId);
        if (!item) return;
        item.byteLength = row.byteLength;
        item.updatedAt = row.updatedAt;
      });
    } catch (error) { /* the bytes are saved; the item's size and date catch up next time */ }
    // Its text copy follows, so search, citations and ClioTalk read what was saved.
    try { await refreshLinkedReference(record.source.fileId, toBytes(bytes)); } catch (error) { /* the source catches up on the next save */ }
    return row;
  }

  /**
   * An Office document's text copy: the projectReference the File Floppy
   * would have made (the same extractor, the same chunker), linked both ways
   * — reference.officeFileId names the document, item.referenceId the
   * reference. The Finder shows only the document; the reference stays a
   * project source that searchProjectSources, readCitation, DocMap and
   * ClioTalk read. Made or refreshed from the document's bytes (the stored
   * ones unless `bytes` is given), keeping the reference's id.
   */
  async function refreshLinkedReference(fileId, bytes) {
    const item = liveFiles().find((file) => file && file.id === fileId && file.type === 'office');
    if (!item || typeof extractFileText !== 'function' || typeof chunkText !== 'function' || typeof putStoredProjectReference !== 'function') return null;
    const data = bytes || (await readDocumentBytes(item.nativeDocumentId))?.bytes;
    if (!data) return null;
    const extracted = await extractFileText(new File([data], item.name, { type: MIME_TYPES[item.format] || '' }));
    const body = String(extracted?.text || '');
    const references = typeof projectReferences !== 'undefined' && Array.isArray(projectReferences) ? projectReferences : [];
    const existing = references.find((reference) => reference && reference.id === item.referenceId) || null;
    const embeddingModel = existing?.embeddingModel || 'local-embedding';
    const now = new Date().toISOString();
    const reference = {
      ...(existing || {}),
      id: item.referenceId || crypto.randomUUID(),
      projectId: item.projectId,
      name: item.name,
      body,
      hash: typeof hashText === 'function' ? await hashText(`${embeddingModel}\n${body}`) : '',
      // Fresh text, so no vector yet: the chunks are read lexically until embedded.
      chunks: chunkText(body, item.name).map((chunk) => ({ source: item.name, content: chunk.content, chunkIndex: chunk.chunkIndex, start: chunk.start, end: chunk.end })),
      embeddingModel,
      enabled: existing ? existing.enabled !== false : true,
      officeFileId: item.id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await putStoredProjectReference(reference);
    if (typeof activeProjectId === 'undefined' || reference.projectId === activeProjectId) {
      const at = references.findIndex((entry) => entry && entry.id === reference.id);
      if (at >= 0) references.splice(at, 1, reference);
      else references.unshift(reference);
      if (typeof mountProjectReferenceChunks === 'function') mountProjectReferenceChunks();
    }
    if (item.referenceId !== reference.id) {
      await projectStore().commit((draft) => {
        const draftItem = draft.chatFiles.find((file) => file && file.id === item.id);
        if (draftItem) draftItem.referenceId = reference.id;
      });
    }
    return reference;
  }

  /** Revert reads the last stored bytes back from the disk, not from memory. */
  async function reloadProjectBytes(handle) {
    const record = projectRecords.get(handle);
    if (!record) return null;
    const row = await readDocumentBytes(record.nativeDocumentId);
    if (!row) return null;
    record.working = row.bytes;
    record.byteLength = row.byteLength;
    record.dirty = false;
    return row.bytes;
  }

  function forgetProjectDocument(handle) {
    projectRecords.delete(handle);
  }

  const officeFilesOf = (item) => [item, ...(item && Array.isArray(item.files) ? item.files : [])]
    .filter((file) => file && file.type === 'office');

  /** Moved to the Trash (a file, or a folder holding some): the text copies stop being sources. */
  async function dropTextCopies(item) {
    const references = typeof projectReferences !== 'undefined' && Array.isArray(projectReferences) ? projectReferences : [];
    for (const file of officeFilesOf(item)) {
      if (!file.referenceId) continue;
      const at = references.findIndex((reference) => reference && reference.id === file.referenceId);
      if (at >= 0) references.splice(at, 1);
      if (typeof deleteStoredProjectReference === 'function') await deleteStoredProjectReference(file.referenceId);
    }
    if (typeof mountProjectReferenceChunks === 'function') mountProjectReferenceChunks();
  }

  /** Put Away: each document's text copy is made again from its bytes. */
  async function restoreTextCopies(item) {
    for (const file of officeFilesOf(item)) await refreshLinkedReference(file.id);
  }

  /**
   * "Write File Floppy to Project Hard Disk": every Office package of that
   * floppy becomes a project document with its CURRENT working bytes, the
   * edits saved in its editor included. Returns the items made.
   */
  async function keepFloppyDocuments(projectId) {
    if (typeof mountedTextDisk === 'undefined' || !mountedTextDisk.nativeFiles) return [];
    const kept = [];
    const stored = typeof getStoredProjectReferences === 'function' ? await getStoredProjectReferences(projectId).catch(() => []) : [];
    for (const [mountedName, record] of Object.entries(mountedTextDisk.nativeFiles)) {
      if (!record || !NATIVE_FORMATS[record.format]) continue;
      if (record.projectId && projectId && record.projectId !== projectId) continue;
      // The text copy the same write just stored under the mounted name
      // becomes this document's linked source instead of a second file.
      const reference = stored.find((entry) => entry && entry.name === mountedName && !entry.officeFileId) || null;
      const item = await createProjectDocument({
        projectId,
        name: record.fileName || mountedName,
        format: record.format,
        bytes: workingBytes(mountedName),
        referenceId: reference ? reference.id : '',
      });
      if (!item) continue;
      kept.push(item);
      // Made again from the bytes being kept, so the source carries the edits
      // saved on the floppy (the floppy's own copy was read at mount time).
      const refreshed = await refreshLinkedReference(item.id).catch(() => null);
      if (!refreshed && reference) await putStoredProjectReference({ ...reference, name: item.name, officeFileId: item.id });
    }
    return kept;
  }

  function referencedDocumentIds() {
    const ids = new Set();
    const visit = (file) => {
      if (file && file.type === 'office' && file.nativeDocumentId) ids.add(file.nativeDocumentId);
    };
    liveFiles().forEach(visit);
    const trash = typeof trashItems !== 'undefined' && Array.isArray(trashItems) ? trashItems : [];
    trash.forEach((item) => {
      const original = item && item.originalData;
      if (!original) return;
      visit(original);
      (Array.isArray(original.files) ? original.files : []).forEach(visit);
    });
    return ids;
  }

  /**
   * Emptying the Trash removes the bytes of every Office document no project
   * file and no Trash item names any more. A Trash item still holds its file,
   * so Put Away finds the bytes where they were.
   */
  async function sweepDocuments({ now = Date.now(), graceMs = SWEEP_GRACE_MS } = {}) {
    const referenced = referencedDocumentIds();
    const keys = await withDocumentStore('readonly', (store) => request(store.getAllKeys()));
    const candidates = (keys || []).filter((id) => !referenced.has(id));
    if (!candidates.length) return 0;
    return withDocumentStore('readwrite', async (store) => {
      let removed = 0;
      for (const id of candidates) {
        const row = await request(store.get(id));
        if (!row) continue;
        if (now - (Date.parse(row.updatedAt) || 0) < graceMs) continue;
        await request(store.delete(id));
        removed += 1;
      }
      return removed;
    });
  }

  root.AISystem6NativeBinaries = Object.freeze({
    NATIVE_FORMATS,
    formatForName,
    register,
    recordFor,
    isNative,
    originalBytes,
    workingBytes,
    setWorkingBytes,
    remove,
    clear,
    snapshot,
    restore,
    MIME_TYPES,
    projectHandle,
    nameWithExtension,
    uniqueName,
    putDocumentBytes,
    readDocumentBytes,
    deleteDocumentBytes,
    createProjectDocument,
    openProjectDocument,
    writeProjectBytes,
    reloadProjectBytes,
    forgetProjectDocument,
    keepFloppyDocuments,
    refreshLinkedReference,
    dropTextCopies,
    restoreTextCopies,
    sweepDocuments,
    // exposed for the session mirroring tests
    _bytesToBase64: bytesToBase64,
    _base64ToBytes: base64ToBytes,
  });
})(typeof window !== 'undefined' ? window : globalThis);
