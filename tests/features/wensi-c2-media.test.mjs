// 文思泉涌 P2 · the media audit.
//
// The panel's two promises are "an image with no alternative text" and "an
// image nothing on the site uses". Both are only useful if they are exact, so
// this contract builds a small site on disk — an image directory, a photos.json
// with frames and stacks, one post that names a file — and checks the audit
// against known-good and known-bad images instead of against the real corpus.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c2-media");

const media = require("../../apps/server/server/lib/blog-sites/media.js");

const root = mkdtempSync(join(tmpdir(), "wensi-media-"));
const imgDir = join(root, "photos", "img");
const postsDir = join(root, "posts");
mkdirSync(imgDir, { recursive: true });
mkdirSync(postsDir, { recursive: true });
for (const name of ["used-with-alt.jpg", "used-no-alt.jpg", "named-in-post.jpg", "untouched.png", "notes.txt"]) {
  writeFileSync(join(imgDir, name), "x");
}
writeFileSync(join(postsDir, "2026-11-08-one.md"), "---\ntitle: 一\n---\n\n图：named-in-post.jpg\n");
writeFileSync(join(root, "photos", "photos.json"), JSON.stringify({
  self: "",
  frames: {
    a: { file: "used-with-alt.jpg", alt: "有替代文字", cap: "", id: "a" },
    b: { file: "used-no-alt.jpg", alt: "", cap: "", id: "b" },
    gone: { file: "missing-on-disk.jpg", alt: "文件不在了", cap: "", id: "gone" },
  },
  stacks: [{ slug: "s", title: "一叠", meta: "", intro: "", ids: ["a", "b"] }],
  rolls: [],
}));

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  media: { dir: imgDir, urlPrefix: "/photos/img/" },
  contentTypes: {
    daily: { label: "日更", storage: { kind: "file-per", dir: postsDir }, fields: [] },
    photos: { label: "影像", storage: { kind: "json-collection", dir: join(root, "photos"), file: "photos.json" }, fields: [] },
  },
};

const scan = media.scanMedia(site);
test.assert(scan.ok === true, "a site with an image directory scans");
test.assert(
  scan.files.every((entry) => !entry.file.endsWith(".txt")),
  "a non-image file in the directory is not a library entry",
);
test.assert(scan.summary.files === 4, "the audit counts the four images and nothing else");

const byName = Object.fromEntries(scan.files.map((entry) => [entry.file, entry]));
test.assert(byName["used-with-alt.jpg"].used === true && byName["used-with-alt.jpg"].missingAlt === false,
  "a frame with alt text inside a stack is used and has alt");
test.assert(byName["used-no-alt.jpg"].used === true && byName["used-no-alt.jpg"].missingAlt === true,
  "a frame inside a stack with empty alt is used but missing alt");
test.assert(byName["named-in-post.jpg"].used === true && byName["named-in-post.jpg"].usedBy.some((by) => by.startsWith("daily/")),
  "an image a post names counts as used, and says which post");
test.assert(byName["untouched.png"].used === false,
  "an image no frame and no post names is unused");
test.assert(
  JSON.stringify(scan.missingAlt.map((entry) => entry.file)) === JSON.stringify(["used-no-alt.jpg"]),
  "missingAlt lists exactly the frame with empty alt",
);
test.assert(
  JSON.stringify(scan.unused.map((entry) => entry.file)) === JSON.stringify(["untouched.png"]),
  "unused lists exactly the image nothing uses",
);
test.assert(
  scan.orphanFrames.length === 1 && scan.orphanFrames[0].id === "gone",
  "a frame pointing at a file that is not on disk is reported, not ignored",
);
test.assert(byName["used-with-alt.jpg"].url === "/photos/img/used-with-alt.jpg", "the URL prefix comes from the description");

// A site without an image directory answers instead of guessing one.
const noMedia = media.scanMedia({ ...site, media: null });
test.assert(noMedia.ok === false && noMedia.code === "media_not_configured", "a site with no media.dir reports media_not_configured");

// A malformed photos.json is reported, and the images still list.
writeFileSync(join(root, "photos", "photos.json"), "{ not json");
const broken = media.scanMedia(site);
test.assert(
  broken.ok === true && broken.parseError && broken.files.length === 4,
  "a malformed collection is reported while the directory still lists",
);

rmSync(root, { recursive: true, force: true });
test.finish();
