// @ts-check
// Edit kernel: working pictures and kept pictures, in the one picture store.
//
// A cover's layers, a cut-out's mask and a sketch's layers are imageAttachments
// records like every other picture (app/core/image-attachments.js), with four
// more fields — the intermediate-versus-library split of artcraft, kept inside
// the store the desk already backs up rather than in a second one:
//
//   status  "staged" while it is an editor's working material, "kept" once the
//           writer saved the document it belongs to. Staged pictures are not
//           in the Picture Album or in a backup, and are cleared in one go.
//   origin  { app, fileId }: the document the picture belongs to.
//   group   the records that make one cover, or one sketch's layer stack.
//   role    what the record is in that group: cover-background, cover-subject,
//           cutout-mask, sketch-layer, sketch-composite, …
//   order   its place in the group (bottom first).
//
// A record without `status` is an ordinary picture and is kept. The helpers
// here are pure over a record list so the contract can run them bare; the
// thin wrappers at the end read and write the desk's live store.

(function installEditAssets(root) {
  if (root.AISystem6EditAssets) return;

  const EDIT_ASSET_ROLES = Object.freeze([
    "cover-background", "cover-subject", "cover-layer", "cutout-mask", "cutout-source",
    "sketch-layer", "sketch-composite", "sketch-tracing",
  ]);

  /** A picture is part of the library (album, backup) unless it is staged. */
  function isKeptAsset(record) {
    return !!record && record.status !== "staged";
  }

  /**
   * Stamp a picture record as an editor's working material.
   * @param {Record<string, any>} record
   * @param {{ app: string, fileId?: string, group: string, role: string, order?: number }} meta
   */
  function stageAsset(record, meta) {
    if (!EDIT_ASSET_ROLES.includes(meta.role)) throw new Error(`edit assets: unknown role ${meta.role}`);
    return {
      ...record,
      status: "staged",
      origin: { app: String(meta.app || ""), fileId: String(meta.fileId || "") },
      group: String(meta.group || ""),
      role: meta.role,
      order: Number.isFinite(meta.order) ? Number(meta.order) : 0,
    };
  }

  function assetsInGroup(records, group) {
    return (records || [])
      .filter((record) => record && record.group && record.group === group)
      .sort((left, right) => (left.order || 0) - (right.order || 0));
  }

  /** Every record of a group becomes kept, and is tied to the saved document. */
  function keepGroup(records, group, fileId = "") {
    return assetsInGroup(records, group).map((record) => ({
      ...record,
      status: "kept",
      origin: { ...(record.origin || {}), fileId: fileId || record.origin?.fileId || "" },
    }));
  }

  /** The staged records to clear: all of them, or one app's, or one document's. */
  function stagedToClear(records, { app = "", fileId = "", group = "" } = {}) {
    return (records || []).filter((record) => record?.status === "staged"
      && (!app || record.origin?.app === app)
      && (!fileId || record.origin?.fileId === fileId)
      && (!group || record.group === group));
  }

  // ---- the live store ----------------------------------------------------
  const liveRecords = () => (typeof imageAttachments !== "undefined" && Array.isArray(imageAttachments) ? imageAttachments : []);

  function saveStagedAssets(records) {
    if (typeof saveImageAttachments === "function") saveImageAttachments(records);
  }

  function keepAssetGroup(group, fileId = "") {
    const kept = keepGroup(liveRecords(), group, fileId);
    saveStagedAssets(kept);
    return kept;
  }

  function clearStagedAssets(filter = {}) {
    const doomed = stagedToClear(liveRecords(), filter);
    if (typeof removeImageAttachment === "function") doomed.forEach((record) => removeImageAttachment(record.id));
    return doomed.length;
  }

  root.AISystem6EditAssets = Object.freeze({
    EDIT_ASSET_ROLES,
    isKeptAsset,
    stageAsset,
    assetsInGroup,
    keepGroup,
    stagedToClear,
    groupOf: (group) => assetsInGroup(liveRecords(), group),
    saveStaged: saveStagedAssets,
    keepAssetGroup,
    clearStagedAssets,
  });
})(typeof window !== "undefined" ? window : globalThis);
