// ClioWorks v4 (V4-01 host): native binary object store.
//
// A mounted Office package keeps its ORIGINAL BYTES here, next to — never
// inside — the File Floppy's extracted text. The text projection stays a
// disposable reading aid; this store is what "edit the file" opens, what
// preserving save reads back, and what Working Session persistence carries.
//
// Storage boundary (CLAUDE.md): IndexedDB ai-system-6-db owns projects and
// records; this module keeps the in-memory authoritative copy and mirrors it
// through the desk's existing working-session snapshot (no new DB, no new
// schema version — the record rides mountedTextDisk.nativeFiles, a versioned
// field extension of the existing session object).
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

  function recordFor(mountedName) {
    return nativeFiles()[mountedName] || null;
  }

  function isNative(mountedName) {
    return !!recordFor(mountedName);
  }

  function originalBytes(mountedName) {
    const record = recordFor(mountedName);
    return record ? base64ToBytes(record.originalBase64) : null;
  }

  function workingBytes(mountedName) {
    const record = recordFor(mountedName);
    return record ? base64ToBytes(record.workingBase64) : null;
  }

  function setWorkingBytes(mountedName, bytes, { dirty = true } = {}) {
    const record = recordFor(mountedName);
    if (!record) throw new Error(`native-binaries: no native file mounted as ${mountedName}`);
    record.workingBase64 = bytesToBase64(bytes);
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
    return JSON.parse(JSON.stringify(nativeFiles()));
  }

  function restore(records) {
    clear();
    Object.entries(records || {}).forEach(([name, record]) => {
      nativeFiles()[name] = record;
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
    // exposed for the session mirroring tests
    _bytesToBase64: bytesToBase64,
    _base64ToBytes: base64ToBytes,
  });
})(typeof window !== 'undefined' ? window : globalThis);
