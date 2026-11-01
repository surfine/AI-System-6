// Lazy half of persistence-status: the base a project import has to leave
// behind.
//
// An import commits its records in a transaction of its own, outside the desk
// bookkeeping the ordinary save compares against. The records are real on
// disk, but this window's cache has never seen them, so the next save tests
// what it is about to write against a record it does not recognise and
// refuses itself as a foreign conflict -- and because a refusal never advances
// the cache, every later save is refused the same way. A single-tab session
// has no second window to broadcast a correction, so a restored project could
// never be saved again.
//
// It lives here rather than in the boot payload because only a restore needs
// it: the eager side keeps the call, this file keeps the body.

window.AISystem6AdoptImportedDeskBases = function adoptImportedDeskBases({ imported = {}, settings } = {}) {
  const collections = {
    projects: [imported.project],
    scraps: imported.scraps,
    trash: imported.trash,
    chatFolders: imported.folders,
    chatFiles: imported.files,
    imageAttachments: imported.imageAttachments || [],
  };
  for (const [key, items] of Object.entries(collections)) {
    if (!Array.isArray(items) || !items.length) continue;
    const cache = storageRecordFingerprintCache.get(key) || new Map();
    items.forEach((item, index) => {
      if (!item) return;
      const id = deskRecordIdentity(key, item, index);
      cache.set(String(id), { id, fingerprint: deskRecordFingerprint(item) });
    });
    storageRecordFingerprintCache.set(key, cache);
  }
  if (settings !== undefined) storageSnapshotCache.set("settings", JSON.stringify(settings));
};
window.AISystem6AdoptImportedDeskBasesLoaded = true;
