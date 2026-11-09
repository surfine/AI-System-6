// 文思泉涌 P3 · publishing a git-static site.
//
// The risk table names the trap this stage exists to avoid: publish.py
// normalises tag spelling for the whole corpus, so running it before "just
// these few" quietly rewrites every other post. Here the normaliser runs into a
// temporary staging directory over everything, and only the chosen article is
// copied into the site. And the outward-facing step is never implicit: deploy
// is a separate stage that a caller must ask for with the confirm word.
//
// Nothing in this contract runs the real deploy command or touches a real site.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c3-publish");

const publish = require("../../apps/server/server/lib/blog-sites/publish.js");
const commands = require("../../apps/server/server/lib/blog-sites/commands.js");

// ---- A probe site on disk: drafts in one tree, the site's posts in another ----

const root = mkdtempSync(join(tmpdir(), "wensi-pub-root-"));
const draftsDir = join(root, "drafts");
const sitePosts = join(root, "posts");
const stagingScript = join(root, "normalise.js");
mkdirSync(draftsDir, { recursive: true });
mkdirSync(sitePosts, { recursive: true });
writeFileSync(join(draftsDir, "2026-11-08-probe.md"), "---\ntitle: 探针\n---\n\n旧正文。\n");
writeFileSync(join(draftsDir, "2026-11-07-other.md"), "---\ntitle: 另一篇\n---\n\n别人的稿。\n");
writeFileSync(join(sitePosts, "2026-11-07-other.md"), "---\ntitle: 另一篇\n---\n\n别人的稿。\n");
// A normaliser that behaves like publish.py: writes every draft into the
// staging directory it is handed (that is what "corpus-wide" means).
writeFileSync(stagingScript, `
const fs = require("node:fs");
const [drafts, staging] = process.argv.slice(2);
fs.mkdirSync(staging, { recursive: true });
for (const name of fs.readdirSync(drafts)) {
  const text = fs.readFileSync(require("node:path").join(drafts, name), "utf8");
  fs.writeFileSync(require("node:path").join(staging, name), text.replace("旧正文。", "新正文。"));
}
`);

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: {
    root,
    commands: [
      { id: "publish-staging", purpose: "publish", argv: [process.execPath, stagingScript, "{drafts}", "{staging}"], cwd: root },
      { id: "build-site", purpose: "publish", argv: [process.execPath, "-e", "process.exit(0)"], cwd: root },
      { id: "deploy-site", purpose: "publish", argv: [process.execPath, "-e", "process.exit(0)"], cwd: root },
    ],
  },
  tools: { dir: root, draftsDir },
  contentTypes: {
    daily: {
      label: "日更",
      storage: { kind: "file-per", dir: draftsDir },
      publish: { dir: sitePosts },
      fields: [],
    },
  },
};

// ---- a photograph without alt blocks the build before it fails late ----

// Its own tree: this section runs a real prepare, and the publish assertions
// below own the shared one.
const blockRoot = mkdtempSync(join(tmpdir(), "wensi-pub-block-"));
const blockDrafts = join(blockRoot, "drafts");
const blockPosts = join(blockRoot, "posts");
const blockPhotos = join(blockRoot, "photos");
mkdirSync(blockDrafts, { recursive: true });
mkdirSync(blockPosts, { recursive: true });
mkdirSync(blockPhotos, { recursive: true });
writeFileSync(join(blockDrafts, "2026-11-08-probe.md"), "---\ntitle: 探针\n---\n\n旧正文。\n");
const writeCollection = (altForSilent) => writeFileSync(join(blockPhotos, "photos.json"), `${JSON.stringify({
  frames: {
    good: { file: "good.jpg", w: 900, h: 600, alt: "月台", cap: "" },
    silent: { file: "silent.jpg", w: 900, h: 600, alt: altForSilent, cap: "" },
  },
  stacks: [{ slug: "trip", title: "旅途", ids: ["good", "silent"] }],
  rolls: [],
}, null, 2)}\n`);
writeCollection("");
const blockedSite = {
  schema: 1,
  id: "probe-block",
  label: "probe",
  // The commands keep their argv but run in this tree, as a real description
  // for this site would have to say.
  channel: { root: blockRoot, commands: site.channel.commands.map((command) => ({ ...command, cwd: blockRoot })) },
  tools: { dir: blockRoot, draftsDir: blockDrafts },
  contentTypes: {
    daily: { label: "日更", storage: { kind: "file-per", dir: blockDrafts }, publish: { dir: blockPosts }, fields: [] },
    photos: { label: "影像", storage: { kind: "json-collection", dir: blockPhotos, file: "photos.json" }, fields: [] },
  },
};

const blockedPlan = publish.planPublish(blockedSite, "daily", "2026-11-08-probe.md");
test.assert(
  blockedPlan.blockers.length === 1 && blockedPlan.blockers[0].code === "photos_missing_alt"
  && JSON.stringify(blockedPlan.blockers[0].ids) === JSON.stringify(["silent"]),
  "the plan names the frames whose missing alt would fail the site's build",
);
let blockedCode = "";
try { await publish.preparePublish(blockedSite, "daily", "2026-11-08-probe.md"); } catch (error) { blockedCode = error.code; }
test.assert(blockedCode === "publish_blocked", "prepare refuses before running any command");
test.assert(!existsSync(join(blockPosts, "2026-11-08-probe.md")), "the refused prepare wrote nothing");
blockedCode = "";
try { await publish.deploySite(blockedSite, {}); } catch (error) { blockedCode = error.code; }
test.assert(blockedCode === "publish_blocked", "deploy refuses too — a site that cannot build cannot ship");

// The builder's other hard failures are found here too, each named.
const mediaDir = join(blockRoot, "img");
mkdirSync(mediaDir, { recursive: true });
writeFileSync(join(mediaDir, "good.jpg"), "x");
const brokenCollection = (patch) => writeFileSync(join(blockPhotos, "photos.json"), `${JSON.stringify({
  frames: {
    good: { file: "good.jpg", w: 900, h: 600, alt: "月台", cap: "" },
    silent: { file: "silent.jpg", w: 900, h: 600, alt: "雨里", cap: "" },
  },
  stacks: [{ slug: "trip", title: "旅途", ids: ["good"] }],
  rolls: [],
  ...patch,
}, null, 2)}\n`);
const withMedia = { ...blockedSite, media: { dir: mediaDir } };
brokenCollection({});
const missingFile = publish.publishBlockers(withMedia).find((entry) => entry.code === "photos_file_missing");
test.assert(missingFile && missingFile.ids[0].includes("silent"), "a frame whose image file is missing is a blocker, named with its file");
const strayStack = publish.publishBlockers(withMedia);
test.assert(!strayStack.some((entry) => entry.code === "photos_stack_unknown_frame"), "a sound stack raises nothing");
brokenCollection({ stacks: [{ slug: "trip", title: "旅途", ids: ["good", "ghost"] }] });
const unknownId = publish.publishBlockers(withMedia).find((entry) => entry.code === "photos_stack_unknown_frame");
test.assert(unknownId && unknownId.ids[0] === "trip:ghost", "a stack pointing at a frame that does not exist is a blocker");
brokenCollection({ rolls: [{ no: 1, date: "2026-11-09", cap: "", ids: ["silent"] }] });
const unstacked = publish.publishBlockers(withMedia).find((entry) => entry.code === "photos_roll_unstacked");
test.assert(unstacked && unstacked.ids[0] === "卷 001:silent（没归叠）", "a roll frame that belongs to no stack is a blocker");
brokenCollection({});
test.assert(publish.publishBlockers(withMedia).length === 1, "a collection with only a missing file has exactly that one blocker");

writeCollection("雨里的街口");
test.assert(publish.planPublish(blockedSite, "daily", "2026-11-08-probe.md").blockers.length === 0, "once every frame has alt, the plan has no blockers");
const cleared = await publish.preparePublish(blockedSite, "daily", "2026-11-08-probe.md");
test.assert(cleared.ok === true && cleared.changed === true, "the prepare proceeds after the block is cleared");
rmSync(blockRoot, { recursive: true, force: true });

// ---- plan: no process, no write ----

const plan = publish.planPublish(site, "daily", "2026-11-08-probe.md");
test.assert(
  plan.ok === true && JSON.stringify(plan.willRun) === JSON.stringify(["publish-staging", "build-site", "deploy-site"]),
  "the plan names the three declared commands in order",
);
test.assert(
  plan.deployRequiresConfirm === true && plan.missingCommands.length === 0,
  "the plan says deploy needs a confirm and nothing is missing",
);
test.assert(
  !existsSync(join(sitePosts, "2026-11-08-probe.md")),
  "planning writes nothing",
);

// ---- prepare: stage the whole corpus, copy only the chosen article ----

const prepared = await publish.preparePublish(site, "daily", "2026-11-08-probe.md");
test.assert(prepared.ok === true && prepared.changed === true, "prepare reports it copied the article");
test.assert(
  readFileSync(join(sitePosts, "2026-11-08-probe.md"), "utf8").includes("新正文。"),
  "the chosen article lands normalised in the site's posts directory",
);
test.assert(
  readFileSync(join(sitePosts, "2026-11-07-other.md"), "utf8").includes("别人的稿。"),
  "another draft the normaliser also changed is NOT written by this publish",
);

// Running it again is a no-op: the copy is byte-identical, so nothing is written.
const again = await publish.preparePublish(site, "daily", "2026-11-08-probe.md");
test.assert(again.changed === false, "a second prepare finds the site already up to date and writes nothing");

// ---- a type edited in place copies nothing: notes and longform live where the site reads them ----

const inPlaceSite = {
  ...site,
  contentTypes: {
    daily: site.contentTypes.daily,
    notes: { label: "笔记", storage: { kind: "file-per", dir: sitePosts }, publish: { dir: sitePosts }, fields: [] },
  },
};
const inPlacePlan = publish.planPublish(inPlaceSite, "notes", "2026-11-07-other.md");
test.assert(
  inPlacePlan.editsInPlace === true && inPlacePlan.willWrite.length === 0
    && JSON.stringify(inPlacePlan.willRun) === JSON.stringify(["build-site", "deploy-site"]),
  "a type edited in place plans only build and deploy — no normalise, no copy",
);
const inPlacePrepared = await publish.preparePublish(inPlaceSite, "notes", "2026-11-07-other.md");
test.assert(
  inPlacePrepared.inPlace === true && inPlacePrepared.changed === false,
  "preparing an in-place type writes nothing and says so",
);

// ---- the command table is the only door ----

test.assert(
  (() => { try { commands.resolveCommand(site, "rm -rf /"); return false; } catch (error) { return error.code === "unknown_command"; } })(),
  "a command outside the description is refused before any process exists",
);
test.assert(
  (() => { try { commands.commandCwd({ ...site, channel: { ...site.channel, root: "/tmp" } }, { cwd: "/etc" }); return false; } catch (error) { return error.code === "bad_command_cwd"; } })(),
  "a command cwd outside the site root and its tools directory is refused",
);
test.assert(
  commands.commandCwd(site, { cwd: root }).startsWith(root),
  "a command inside the declared trees resolves",
);

// The tools directory is an allowed tree (aaronlau's publish.py lives there).
test.assert(
  commands.commandCwd({ ...site, tools: { dir: draftsDir } }, { cwd: draftsDir }) === draftsDir,
  "the site's own tools directory is an allowed command cwd",
);

// ---- a content type without a publish directory cannot be published ----

const noPublishDir = { ...site, contentTypes: { daily: { label: "日更", storage: { dir: draftsDir }, fields: [] } } };
test.assert(
  (() => { try { publish.planPublish(noPublishDir, "daily", "x.md"); return false; } catch (error) { return error.code === "not_publishable"; } })(),
  "a type with no publish directory reports not_publishable instead of writing somewhere guessed",
);

rmSync(root, { recursive: true, force: true });

test.finish();
