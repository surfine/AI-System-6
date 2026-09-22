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
  {
    route: "m5ipad",
    source: "internal/evidence/drafts/m5ipad/M5 iPad Pro 深度体验 Project Hard Disk Backup.json",
  },
  {
    route: "iphone17e",
    source: "internal/evidence/drafts/iphone17e/iPhone 17e 浅粉色 Project Hard Disk Backup.json",
  },
  {
    route: "bongo",
    source: "internal/evidence/drafts/bongo/走向一整块玻璃 Project Hard Disk Backup.json",
  },
  {
    route: "glass",
    source: "internal/evidence/drafts/glass/玻璃与他们的产地 Project Hard Disk Backup.json",
  },
  {
    route: "ipad97",
    source: "internal/evidence/drafts/ipad97/iPad Pro 9.7 叛逆的另一种尺寸 Project Hard Disk Backup.json",
  },
  {
    route: "airbattery",
    source: "internal/evidence/drafts/airbattery/iPhone Air 专用 MagSafe 电池 Project Hard Disk Backup.json",
  },
  {
    route: "pm17",
    source: "internal/evidence/drafts/pm17/形式追随功能的一代 iPhone 17 Pro Max Project Hard Disk Backup.json",
  },
  {
    route: "sympathy",
    source: "internal/evidence/drafts/sympathy/Project Sympathy AirPods Max Project Hard Disk Backup.json",
  },
  {
    route: "ceramic",
    source: "internal/evidence/drafts/ceramic/陶瓷 Apple Watch Project Hard Disk Backup.json",
  },
  {
    route: "macpro19",
    source: "internal/evidence/drafts/macpro19/大学时的白月光 Mac Pro 2019 Project Hard Disk Backup.json",
  },
  {
    route: "pocket",
    source: "internal/evidence/drafts/pocket/iPhone Pocket Project Hard Disk Backup.json",
  },
  {
    route: "iphone6sp",
    source: "internal/evidence/drafts/iphone6sp/iPhone 6s Plus Project Hard Disk Backup.json",
  },
  {
    route: "sleeve",
    source: "internal/evidence/drafts/sleeve/MagSafe 皮革保护套 Project Hard Disk Backup.json",
  },
  {
    route: "pm12",
    source: "internal/evidence/drafts/pm12/iPhone 12 Pro Max Project Hard Disk Backup.json",
  },
  {
    route: "pm11",
    source: "internal/evidence/drafts/pm11/iPhone 11 Pro Max Project Hard Disk Backup.json",
  },
  {
    route: "m5mba",
    source: "internal/evidence/drafts/m5mba/M5 MacBook Air Project Hard Disk Backup.json",
  },
  {
    route: "mbneo",
    source: "internal/evidence/drafts/mbneo/MacBook Neo Project Hard Disk Backup.json",
  },
  {
    route: "mini7",
    source: "internal/evidence/drafts/mini7/iPad mini A17 Pro Project Hard Disk Backup.json",
  },
  {
    route: "mkb",
    source: "internal/evidence/drafts/mkb/Magic Keyboard Project Hard Disk Backup.json",
  },
  {
    route: "sd",
    source: "internal/evidence/drafts/sd/Studio Display Project Hard Disk Backup.json",
  },
  {
    route: "ios19",
    source: "internal/evidence/drafts/ios19/WWDC2099 Project Hard Disk Backup.json",
  },
  {
    route: "ipada4",
    source: "internal/evidence/drafts/ipada4/iPad Air 4 工程机 Project Hard Disk Backup.json",
  },
  {
    route: "ip16p",
    source: "internal/evidence/drafts/ip16p/iPhone 16 工程机 Project Hard Disk Backup.json",
  },
  {
    route: "mgscrap",
    source: "internal/evidence/drafts/mgscrap/MagSafe 废案 Project Hard Disk Backup.json",
  },
  {
    route: "t2nic",
    source: "internal/evidence/drafts/t2nic/T2 网卡 Project Hard Disk Backup.json",
  },
  {
    route: "airtrans",
    source: "internal/evidence/drafts/airtrans/透明探索版 Air Project Hard Disk Backup.json",
  },
  {
    route: "ip4sdemo",
    source: "internal/evidence/drafts/ip4sdemo/iPhone 4S Demo Project Hard Disk Backup.json",
  },
  {
    route: "airact",
    source: "internal/evidence/drafts/airact/iPhone Air Project Hard Disk Backup.json",
  },
  {
    route: "touch2",
    source: "internal/evidence/drafts/touch2/touch 2 工程板 Project Hard Disk Backup.json",
  },
  {
    route: "noport",
    source: "internal/evidence/drafts/noport/无接口 Apple Watch Project Hard Disk Backup.json",
  },
  {
    route: "cdma4",
    source: "internal/evidence/drafts/cdma4/CDMA iPhone 4 Project Hard Disk Backup.json",
  },
  {
    route: "iphone17",
    source: "internal/evidence/drafts/iphone17/iPhone 17 标准版 Project Hard Disk Backup.json",
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
