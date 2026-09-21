// The rule a Project Hard Disk backup is sealed by, in one place.
//
// A backup carries a SHA-256 of its own content, and the importer refuses a
// bundle whose hash does not match. Editing a source disk -- rewriting the
// article on it, which is the whole reason a source disk is kept in the tree --
// invalidates that hash, and the failure is silent from the outside: the link
// opens, the desk boots, and no project appears. So the same two rules the app
// uses (app/core/project-disk-backup.js) are applied here: keys sorted at every
// level, and the integrity field itself left out of the digest. Counts are
// recomputed before the digest, by the same nine-collection list the app's
// attachIntegrity walks, because validateBackup reads counts first and refuses
// a bundle whose counts disagree with its arrays.
//
// Three callers share this module so they cannot drift: the generator that
// stamps the published copy, the restamp tool that keeps a source disk honest
// for a person who imports it by hand, and the contract that checks both.

import { createHash } from "node:crypto";

// route id -> the backup that route mounts. The route ids are the ones in
// tooling/build-launch-links.mjs; a disk here needs a route there.
export const SHARED_DISKS = Object.freeze([
  {
    route: "dtk",
    source: "internal/evidence/drafts/dtk-demo-disk/未来通车之后 Project Hard Disk Backup.json",
  },
  {
    route: "ipad1",
    source: "internal/evidence/drafts/ipad1-256mb/初代 iPad 为什么只有 256MB Project Hard Disk Backup.json",
  },
]);

// The nine collections a backup counts. validateBackup refuses a bundle whose
// `counts` disagree with its arrays, so a source disk whose Scrapbook grew from
// 4 clips to 40 shipped with a hash that was correct for the wrong bundle: the
// digest was taken over stale counts, the importer read the counts first and
// refused, and the link opened onto an empty desk.
export const COUNTED_COLLECTIONS = Object.freeze([
  "folders", "files", "scraps", "trash", "projectCdItems",
  "references", "documentRevisions", "darkroomRecords", "imageAttachments",
]);

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`
  ).join(",")}}`;
}

export function countsFor(bundle) {
  return Object.fromEntries(COUNTED_COLLECTIONS.map((key) => [
    key, Array.isArray(bundle?.[key]) ? bundle[key].length : 0,
  ]));
}

/** The digest the importer recomputes: every key sorted, counts as they are, integrity left out. */
export function contentHashFor(bundle) {
  const copy = JSON.parse(JSON.stringify(bundle));
  delete copy.integrity;
  copy.counts = countsFor(copy);
  return createHash("sha256").update(stableStringify(copy), "utf8").digest("hex");
}

export function withIntegrity(bundle) {
  const copy = JSON.parse(JSON.stringify(bundle));
  delete copy.integrity;
  copy.counts = countsFor(copy);
  return { ...copy, integrity: { algorithm: "SHA-256", contentHash: contentHashFor(copy) } };
}
