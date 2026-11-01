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

// route id -> the backup that route mounts. This list is the registry: the
// three /go/ route tables (apps/server/server/routes/go.js,
// functions/go/[route].js, apps/desktop/app/core/launch-intent.js) and the
// bare-route retirement list in platform/web/install-release.sh are told the
// same ids, and launch-intent.test.mjs fails when any of them drifts.
//
// `label` is the name the disk wears in the demonstration folder: the object on
// it, not the article inside, because thirty-five article titles folded into
// six-line icon labels named nothing. `released` is the month the finished
// piece came out (the video folders record a month, not a day); empty when the
// disk was written ahead of its video, and the folder then shows no date.
export const SHARED_DISKS = Object.freeze([
  {
    route: "dtk",
    source: "internal/evidence/drafts/dtk-demo-disk/未来通车之后 Project Hard Disk Backup.json",
    label: { zh: "DTK 过渡机", en: "DTK Transition Kit" },
    released: "2024-12",
  },
  {
    route: "ipad1",
    source: "internal/evidence/drafts/ipad1-256mb/初代 iPad 为什么只有 256MB 内存 Project Hard Disk Backup.json",
    label: { zh: "初代 iPad", en: "Original iPad" },
    released: "2026-06",
  },
  {
    route: "m5ipad",
    source: "internal/evidence/drafts/m5ipad/杀掉那个键盘 Project Hard Disk Backup.json",
    label: { zh: "M5 iPad Pro", en: "M5 iPad Pro" },
    released: "2026-05",
  },
  {
    route: "iphone17e",
    source: "internal/evidence/drafts/iphone17e/iPhone 17e 浅粉色 Project Hard Disk Backup.json",
    label: { zh: "iPhone 17e", en: "iPhone 17e" },
    released: "2026-06",
  },
  {
    route: "bongo",
    source: "internal/evidence/drafts/bongo/走向一整块玻璃 Project Hard Disk Backup.json",
    label: { zh: "Project Bongo", en: "Project Bongo" },
    released: "",
  },
  {
    route: "glass",
    source: "internal/evidence/drafts/glass/玻璃与他们的产地 Project Hard Disk Backup.json",
    label: { zh: "Liquid Glass", en: "Liquid Glass" },
    released: "",
  },
  {
    route: "ipad97",
    source: "internal/evidence/drafts/ipad97/iPad Pro 9.7 叛逆的另一种尺寸 Project Hard Disk Backup.json",
    label: { zh: "iPad Pro 9.7", en: "iPad Pro 9.7" },
    released: "2026-07",
  },
  {
    route: "airbattery",
    source: "internal/evidence/drafts/airbattery/iPhone Air 专用 MagSafe 电池 Project Hard Disk Backup.json",
    label: { zh: "MagSafe 电池 · Air", en: "iPhone Air MagSafe Battery" },
    released: "2025-10",
  },
  {
    route: "pm17",
    source: "internal/evidence/drafts/pm17/形式追随功能的一代 iPhone 17 Pro Max Project Hard Disk Backup.json",
    label: { zh: "iPhone 17 Pro Max", en: "iPhone 17 Pro Max" },
    released: "2025-10",
  },
  {
    route: "sympathy",
    source: "internal/evidence/drafts/sympathy/Project Sympathy AirPods Max Project Hard Disk Backup.json",
    label: { zh: "Project Sympathy", en: "Project Sympathy" },
    released: "2025-07",
  },
  {
    route: "ceramic",
    source: "internal/evidence/drafts/ceramic/陶瓷 Apple Watch Project Hard Disk Backup.json",
    label: { zh: "陶瓷 Apple Watch", en: "The Ceramic Apple Watch" },
    released: "2025-07",
  },
  {
    route: "macpro19",
    source: "internal/evidence/drafts/macpro19/大学时的白月光 Mac Pro 2019 Project Hard Disk Backup.json",
    label: { zh: "Mac Pro 2019", en: "Mac Pro (2019)" },
    released: "2026-03",
  },
  {
    route: "pocket",
    source: "internal/evidence/drafts/pocket/iPhone Pocket Project Hard Disk Backup.json",
    label: { zh: "iPhone Pocket", en: "iPhone Pocket" },
    released: "2025-11",
  },
  {
    route: "iphone6sp",
    source: "internal/evidence/drafts/iphone6sp/iPhone 6s Plus Project Hard Disk Backup.json",
    label: { zh: "iPhone 6s Plus", en: "iPhone 6s Plus" },
    released: "2025-08",
  },
  {
    route: "sleeve",
    source: "internal/evidence/drafts/sleeve/MagSafe 皮革保护套 Project Hard Disk Backup.json",
    label: { zh: "MagSafe 皮革保护套", en: "MagSafe Leather Sleeve" },
    released: "2025-09",
  },
  {
    route: "pm12",
    source: "internal/evidence/drafts/pm12/iPhone 12 Pro Max Project Hard Disk Backup.json",
    label: { zh: "iPhone 12 Pro Max", en: "iPhone 12 Pro Max" },
    released: "2025-09",
  },
  {
    route: "pm11",
    source: "internal/evidence/drafts/pm11/iPhone 11 Pro Max Project Hard Disk Backup.json",
    label: { zh: "iPhone 11 Pro Max", en: "iPhone 11 Pro Max" },
    released: "2025-08",
  },
  {
    route: "m5mba",
    source: "internal/evidence/drafts/m5mba/M5 MacBook Air Project Hard Disk Backup.json",
    label: { zh: "M5 MacBook Air", en: "M5 MacBook Air" },
    released: "2026-03",
  },
  {
    route: "mbneo",
    source: "internal/evidence/drafts/mbneo/MacBook Neo Project Hard Disk Backup.json",
    label: { zh: "MacBook Neo", en: "MacBook Neo" },
    released: "2026-03",
  },
  {
    route: "mini7",
    source: "internal/evidence/drafts/mini7/iPad mini A17 Pro Project Hard Disk Backup.json",
    label: { zh: "iPad mini A17 Pro", en: "iPad mini (A17 Pro)" },
    released: "2025-12",
  },
  {
    route: "mkb",
    source: "internal/evidence/drafts/mkb/Magic Keyboard Project Hard Disk Backup.json",
    label: { zh: "Magic Keyboard", en: "Magic Keyboard (USB-C)" },
    released: "2026-01",
  },
  {
    route: "sd",
    source: "internal/evidence/drafts/sd/Studio Display Project Hard Disk Backup.json",
    label: { zh: "Studio Display", en: "Studio Display" },
    released: "2026-01",
  },
  {
    route: "ios19",
    source: "internal/evidence/drafts/ios19/WWDC2099 Project Hard Disk Backup.json",
    label: { zh: "WWDC2099", en: "WWDC2099" },
    released: "",
  },
  {
    route: "ipada4",
    source: "internal/evidence/drafts/ipada4/iPad Air 4 工程机 Project Hard Disk Backup.json",
    label: { zh: "iPad Air 4 工程机", en: "iPad Air 4 Prototype" },
    released: "2025-05",
  },
  {
    route: "ip16p",
    source: "internal/evidence/drafts/ip16p/iPhone 16 工程机 Project Hard Disk Backup.json",
    label: { zh: "iPhone 16 工程机", en: "iPhone 16 Prototype" },
    released: "2025-06",
  },
  {
    route: "mgscrap",
    source: "internal/evidence/drafts/mgscrap/MagSafe 废案 Project Hard Disk Backup.json",
    label: { zh: "MagSafe 废案", en: "MagSafe Prototypes" },
    released: "2025-06",
  },
  {
    route: "t2nic",
    source: "internal/evidence/drafts/t2nic/T2 网卡 Project Hard Disk Backup.json",
    label: { zh: "T2 网卡", en: "Apple T2 Network Card" },
    released: "",
  },
  {
    route: "airtrans",
    source: "internal/evidence/drafts/airtrans/透明探索版 Air Project Hard Disk Backup.json",
    label: { zh: "透明 Air 工程机", en: "Transparent Air Prototypes" },
    released: "2025-12",
  },
  {
    route: "ip4sdemo",
    source: "internal/evidence/drafts/ip4sdemo/iPhone 4S Demo Project Hard Disk Backup.json",
    label: { zh: "iPhone 4S 展示机", en: "iPhone 4S Demo Unit" },
    released: "2025-12",
  },
  {
    route: "airact",
    source: "internal/evidence/drafts/airact/iPhone Air Project Hard Disk Backup.json",
    label: { zh: "iPhone Air", en: "iPhone Air" },
    released: "2025-09",
  },
  {
    route: "touch2",
    source: "internal/evidence/drafts/touch2/touch 2 工程板 Project Hard Disk Backup.json",
    label: { zh: "touch 2 工程板", en: "touch 2 Engineering Board" },
    released: "2025-08",
  },
  {
    route: "noport",
    source: "internal/evidence/drafts/noport/无接口 Apple Watch Project Hard Disk Backup.json",
    label: { zh: "无接口 Apple Watch", en: "Portless Apple Watch" },
    released: "2025-08",
  },
  {
    route: "cdma4",
    source: "internal/evidence/drafts/cdma4/CDMA iPhone 4 Project Hard Disk Backup.json",
    label: { zh: "CDMA iPhone 4", en: "CDMA iPhone 4" },
    released: "2025-10",
  },
  {
    route: "iphone17",
    source: "internal/evidence/drafts/iphone17/iPhone 17 标准版 Project Hard Disk Backup.json",
    label: { zh: "iPhone 17", en: "iPhone 17" },
    released: "2025-10",
  },
  {
    route: "windowshade",
    source: "internal/evidence/drafts/windowshade/WindowShade 官网 Project Hard Disk Backup.json",
    label: { zh: "WindowShade", en: "WindowShade" },
    released: "",
  },
  {
    route: "ipadpro18",
    source: "internal/evidence/drafts/ipadpro18/A12X，桌面级性能的预演 Project Hard Disk Backup.json",
    label: { zh: "iPad Pro 2018", en: "iPad Pro 2018" },
    released: "",
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
