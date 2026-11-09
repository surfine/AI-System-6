// 文思泉涌 lane C · the /api/wensi-quanyong endpoints and their authorization.
// The whole group runs on a scratch tree: a fixture site copied into tmp, a
// user site description written into the agent data directory, and a Chooser
// grant made through folders.grantFolder (the same door the desk uses — the
// dialog itself needs a human, so the tests call the API behind it, with
// AI_SYSTEM6_AGENT_ALLOW_TMP=1 saying the state root is a contract scratch).
// Refusals are the point: no grant, a read-only grant, a ../ path and a
// symlinked path must all answer with typed errors, and the fixed command
// table must refuse anything the description did not register.

import http from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c-wensi-quanyong-routes");
const route = require("../../apps/server/server/routes/wensi-quanyong.js");
const folders = require("../../apps/server/server/agent/folders.js");
const commands = require("../../apps/server/server/lib/blog-sites/commands.js");

const fixtureRoot = join(import.meta.dirname, "..", "fixtures", "wensi-quanyong");
const scratch = mkdtempSync(join(tmpdir(), "wensi-c-routes-"));
const siteRoot = join(scratch, "site");
const postsDir = join(siteRoot, "posts");

process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
process.env.AI_SYSTEM6_AGENT_HOME = join(scratch, "agent-home");

// A fixture site whose roots live in the scratch tree, served through the
// user site-description directory the route loads.
mkdirSync(join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions"), { recursive: true });
mkdirSync(postsDir, { recursive: true });
mkdirSync(join(siteRoot, "data"), { recursive: true });
mkdirSync(join(siteRoot, "photos", "img"), { recursive: true });
mkdirSync(join(siteRoot, "tools", "corpus"), { recursive: true });
writeFileSync(join(siteRoot, "tools", "corpus", "2026H2.txt"), "2026-11-01 08:00 [Sync1101|A] one\n");
writeFileSync(join(siteRoot, "tools", "sync-stand-in.js"), `
const fs = require("node:fs");
const path = require("node:path");
fs.appendFileSync(path.join(__dirname, "corpus", "2026H2.txt"), "2026-11-02 09:00 [Sync1102|A] two\\n");
console.log("sync stand-in done");
`);
writeFileSync(join(siteRoot, "tools", "WEEKLY_PIPELINE.md"), "# 每周例行\n");
mkdirSync(join(siteRoot, "packets"), { recursive: true });
mkdirSync(join(siteRoot, "longform"), { recursive: true });
writeFileSync(join(siteRoot, "tools", "contacts.json"), `${JSON.stringify({
  schema: 1,
  qq: {
    senders: ["u_one", "u_two"],
    disabledSenders: [],
    conversations: [
      { prefix: "甲（群）", kind: "group", id: "111", enabled: true },
      { prefix: "乙（私聊）", kind: "c2c", id: "u_two", enabled: true },
    ],
  },
}, null, 2)}\n`);
writeFileSync(join(siteRoot, "tools", "packet-stand-in.js"), `
const fs = require("node:fs");
const path = require("node:path");
const month = process.argv[2];
fs.mkdirSync(path.join(__dirname, "..", "packets"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "packets", month + ".md"), "# " + month);
fs.writeFileSync(path.join(__dirname, "..", "packets", month + ".json"), "{}");
console.log("wrote " + month);
`);
writeFileSync(join(siteRoot, "photos", "photos.json"), JSON.stringify({
  self: "",
  frames: { station: { file: "station.jpg", w: 900, h: 675, cap: "", alt: "月台", city: "", taken: "", medium: "" } },
  stacks: [{ slug: "trip", title: "旅途", meta: "", intro: "", ids: ["station"] }],
  rolls: [],
}, null, 2));
cpSync(join(fixtureRoot, "aaronlau-daily", "2026-09-26-aigc-with-curation.md"), join(postsDir, "2026-09-26-aigc-with-curation.md"));
writeFileSync(join(postsDir, "2026-09-25-prediction.md"), `---
title: 一条预测
date: 2026-09-25
predictions:
  - made: 2026-09-24
    claim: 下一代会先砍掉 3.5 毫米口
    status: 待定
---

正文。
`);
writeFileSync(join(siteRoot, "data", "tags.json"), JSON.stringify({ 测试: "test", steam: "steam" }));
const fixtureDescription = {
  schema: 1,
  id: "fixture",
  label: "Fixture",
  channel: { kind: "git-static", root: siteRoot, commands: [
    { id: "say-hi", purpose: "publish", argv: ["/bin/echo", "hi"] },
    { id: "sync-corpus", purpose: "maintenance", argv: [process.execPath, join(siteRoot, "tools", "sync-stand-in.js")], cwd: join(siteRoot, "tools") },
    { id: "month-packet", purpose: "maintenance", argv: [process.execPath, join(siteRoot, "tools", "packet-stand-in.js"), "{month}"], cwd: join(siteRoot, "tools") },
  ] },
  contentTypes: {
    daily: {
      label: "日更",
      storage: { kind: "file-per", dir: postsDir, filename: "YYYY-MM-DD-slug.md" },
      fields: [{ key: "title", type: "string", required: true }, { key: "voice", type: "readonly" }],
      url: { single: "/{year}/{month}/{day}/" },
    },
  },
  taxonomy: { tags: { source: "data/tags.json" }, categories: null, series: null },
  tools: { dir: join(siteRoot, "tools"), draftsDir: postsDir },
  routine: {
    sync: { command: "sync-corpus", corpusDir: join(siteRoot, "tools", "corpus") },
    drafting: { brief: join(siteRoot, "tools", "WEEKLY_PIPELINE.md"), models: { pick: "sonnet", write: "opus" }, maxSpendUsd: 3 },
    rescan: { command: "month-packet", packetsDir: join(siteRoot, "packets") },
  },
  media: { dir: join(siteRoot, "photos", "img"), urlPrefix: "/photos/img/" },
};
fixtureDescription.contentTypes.longform = {
  label: "长文",
  storage: { kind: "file-per", dir: join(siteRoot, "longform"), filename: "YYYY-MM-DD-slug.md" },
  fields: [{ key: "title", type: "string", required: true }, { key: "slug", type: "slug", required: true }],
};
fixtureDescription.contentTypes.photos = {
  label: "影像",
  storage: { kind: "json-collection", dir: join(siteRoot, "photos"), file: "photos.json" },
  fields: [{ key: "file", type: "string", required: true }, { key: "w", type: "number", required: true },
    { key: "h", type: "number", required: true }, { key: "alt", type: "text" }],
  editor: "collection",
};
writeFileSync(
  join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions", "fixture.json"),
  JSON.stringify(fixtureDescription)
);

// The grant the desk would make: one change-level grant over the site root,
// tagged with 文思泉涌's purpose.
const grant = folders.grantFolder(siteRoot, "change", "blog-site");

function startServer() {
  const server = http.createServer((req, res) => {
    void route.handleWensiQuanyong(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
        json: (() => {
          try {
            return JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return null;
          }
        })(),
      }));
    });
    req.once("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

try {
  const { server, port } = await startServer();
  try {
    // ---- The contract's four endpoints. ----

    const sites = await request(port, "GET", "/api/wensi-quanyong/sites");
    test.assert(sites.status === 200 && Array.isArray(sites.json?.sites),
      "GET /sites answers the description list");
    const servedIds = sites.json.sites.map((site) => site.id);
    test.assert(servedIds.includes("aaronlau") && servedIds.includes("appscope") && servedIds.includes("fixture"),
      "GET /sites serves both built-ins and the user site, whole");

    const articles = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/articles?type=daily");
    test.assert(articles.status === 200 && articles.json?.articles?.length === 2,
      "GET /articles lists the granted type");
    const listedArticle = articles.json.articles.find((row) => row.path === "2026-09-26-aigc-with-curation.md");
    test.assert(listedArticle?.status === "published" && listedArticle?.lastCommit === null,
      "the article list carries status and git facts");

    const article = await request(port, "GET", `/api/wensi-quanyong/sites/fixture/article?type=daily&path=${encodeURIComponent("2026-09-26-aigc-with-curation.md")}`);
    test.assert(article.status === 200 && article.json?.frontMatter?.title && typeof article.json?.body === "string"
      && Array.isArray(article.json?.git?.log),
      "GET /article answers frontMatter, body and the git block");

    const parsed = require("../../apps/server/server/lib/blog-sites/front-matter.js")
      .parseFrontMatter(readFileSync(join(postsDir, "2026-09-26-aigc-with-curation.md"), "utf8"));
    const put = await request(port, "PUT", "/api/wensi-quanyong/sites/fixture/article", {
      type: "daily",
      path: "2026-09-26-aigc-with-curation.md",
      frontMatter: { ...parsed.fields, description: "改过的描述" },
      body: parsed.body,
    });
    test.assert(put.status === 200 && put.json?.ok === true && put.json?.path === "2026-09-26-aigc-with-curation.md",
      "PUT /article answers ok with the path");
    const afterWrite = readFileSync(join(postsDir, "2026-09-26-aigc-with-curation.md"), "utf8");
    test.assert(afterWrite.includes("description: 改过的描述") && afterWrite.includes("title: 差点被我屏蔽的 AIGC 网站"),
      "the write landed on disk with the edit and the rest of the block");

    const taxonomy = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/taxonomy");
    test.assert(taxonomy.status === 200 && taxonomy.json?.tags?.canon?.length === 2
      && taxonomy.json?.tags?.alias?.测试 === "test",
      "GET /taxonomy reads the site's tag table");

    // ---- Authorization refusals. ----

    folders.revokeFolder(grant.id);
    const noGrant = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/articles?type=daily");
    test.assert(noGrant.status === 403 && noGrant.json?.code === "folder_grant_required",
      "no covering grant refuses the list (403, typed)");

    const writeNoGrant = await request(port, "PUT", "/api/wensi-quanyong/sites/fixture/article", {
      type: "daily", path: "x.md", frontMatter: {}, body: "",
    });
    test.assert(writeNoGrant.status === 403, "no covering grant refuses the write");

    folders.grantFolder(siteRoot, "read", "blog-site");
    const readOnlyWrite = await request(port, "PUT", "/api/wensi-quanyong/sites/fixture/article", {
      type: "daily", path: "x.md", frontMatter: {}, body: "",
    });
    test.assert(readOnlyWrite.status === 403, "a read-level grant cannot write (change is required)");
    const readOnlyRead = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/articles?type=daily");
    test.assert(readOnlyRead.status === 200, "a read-level grant still reads");

    const escape = await request(port, "GET", `/api/wensi-quanyong/sites/fixture/article?type=daily&path=${encodeURIComponent("../escape.md")}`);
    test.assert(escape.status === 403 || escape.status === 400, "a ../ path is refused");

    const outside = join(scratch, "outside-secret.md");
    writeFileSync(outside, "机密");
    rmSync(join(postsDir, "link.md"), { force: true });
    symlinkSync(outside, join(postsDir, "link.md"));
    const symlinkRead = await request(port, "GET", `/api/wensi-quanyong/sites/fixture/article?type=daily&path=${encodeURIComponent("link.md")}`);
    test.assert(symlinkRead.status === 403, "a symlink out of the content root is refused");
    test.assert(readFileSync(outside, "utf8") === "机密", "the outside file was never touched");

    const unknownSite = await request(port, "GET", "/api/wensi-quanyong/sites/no-such/articles?type=daily");
    test.assert(unknownSite.status === 404, "an unknown site id answers 404");
    const unknownType = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/articles?type=nope");
    test.assert(unknownType.status === 404, "an unknown content type answers 404");
    const notFound = await request(port, "GET", "/api/wensi-quanyong/whatever");
    test.assert(notFound.status === 404, "an unknown path answers 404");

    // ---- The fixed command table: registered ids run, everything else refuses. ----

    const listed = commands.listCommands(fixtureDescription);
    test.assert(listed.length === 3 && listed.map((command) => command.id).join(",") === "say-hi,sync-corpus,month-packet",
      "the command table is exactly what the description registered");
    commands.resolveCommand(fixtureDescription, "say-hi");
    test.assert(true, "a registered command resolves");
    let unknownCommand = "";
    try {
      commands.resolveCommand(fixtureDescription, "rm-rf");
    } catch (error) {
      unknownCommand = `${error.code}:${error.statusCode}`;
    }
    test.assert(unknownCommand === "unknown_command:404",
      "a command outside the description is refused before any process starts");

    const run = await commands.runCommand(fixtureDescription, "say-hi", { timeoutMs: 10_000 });
    test.assert(run.exitCode === 0 && run.stdout.trim() === "hi" && run.purpose === "publish",
      "a registered command runs as fixed argv and answers its output");

    // ---- The photo collection's four writes, and its one read. ----

    // The authorization section above left a read-only grant in place; photos
    // writing is exactly what "change" is for.
    folders.grantFolder(siteRoot, "change", "blog-site");

    // A 1×1 PNG: real bytes, so the header reader is what supplies w and h.
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==";

    const collection = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/photos");
    test.assert(collection.status === 200 && collection.json?.summary?.frames === 1,
      "GET /photos answers the collection the site declares");
    test.assert(collection.json?.media?.dir === join(siteRoot, "photos", "img"),
      "the view names the image directory the grid draws from");

    const imported = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/photos/import", {
      files: [{ name: "月台.png", data: png }],
    });
    test.assert(imported.status === 200 && imported.json?.counts?.imported === 1,
      "POST /photos/import writes the photograph and adds a frame");
    const importedName = imported.json.imported[0].file;
    test.assert(imported.json.imported[0].w === 1 && imported.json.imported[0].h === 1 && imported.json.imported[0].stack === "",
      "the frame's size came from the bytes and it arrived loose");
    test.assert(readFileSync(join(siteRoot, "photos", "img", importedName)).length > 0,
      "the bytes are on disk under the name the frame reports");

    const shot = await request(port, "GET", `/api/wensi-quanyong/sites/fixture/media/${encodeURIComponent(importedName)}`);
    test.assert(shot.status === 200 && shot.headers["content-type"] === "image/png",
      "GET /media/:file serves the photograph for the grid's thumbnail");
    test.assert(shot.headers["x-content-type-options"] === "nosniff",
      "the thumbnail is served as its type and nothing else");

    const escapeAttempt = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/media/..%2Fdata%2Ftags.json");
    test.assert(escapeAttempt.status === 400 && escapeAttempt.json?.code === "bad_media_name",
      "a path with a separator inside is refused, not joined");
    const missingShot = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/media/nope.jpg");
    test.assert(missingShot.status === 404 && missingShot.json?.code === "media_file_missing",
      "a name that is not there answers with a named 404");

    const newStack = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/photos/stack", { title: "Hong Kong" });
    test.assert(newStack.status === 200 && newStack.json?.stack?.slug === "hong-kong",
      "POST /photos/stack creates a stack with an ASCII slug");
    const moved = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/photos/move", {
      id: imported.json.imported[0].id,
      to: "hong-kong",
    });
    test.assert(moved.status === 200 && moved.json?.stack === "hong-kong",
      "POST /photos/move arranges the frame into the new stack");

    const looseRoll = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/photos/roll", {
      ids: ["not-there"],
      date: "2026-11-09",
    });
    test.assert(looseRoll.status === 404 && looseRoll.json?.code === "frame_missing",
      "a roll naming a frame that does not exist is refused");

    const roll = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/photos/roll", {
      ids: [imported.json.imported[0].id],
      date: "2026-11-09",
      cap: "雨",
    });
    test.assert(roll.status === 200 && roll.json?.roll?.code === "001",
      "POST /photos/roll records the batch as roll 001");
    const afterRoll = JSON.parse(readFileSync(join(siteRoot, "photos", "photos.json"), "utf8"));
    test.assert(afterRoll.rolls.length === 1 && afterRoll.stacks.find((entry) => entry.slug === "hong-kong").ids.includes(imported.json.imported[0].id),
      "the roll and the arrangement are both in the collection file");

    // ---- 预言账本 and 例行维护 (P5 skeleton). ----

    const ledger = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/predictions");
    test.assert(ledger.status === 200 && ledger.json?.summary?.total === 1 && ledger.json.entries[0].status === "pending",
      "GET /predictions reads the predictions a post carries");
    const settlement = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/predictions/settle", {
      file: "2026-09-25-prediction.md", index: 0, status: "hit",
    });
    test.assert(settlement.status === 200 && settlement.json?.to === "应验",
      "POST /predictions/settle records the verdict in the file's own spelling");
    test.assert(readFileSync(join(postsDir, "2026-09-25-prediction.md"), "utf8").includes("status: 应验"),
      "the verdict landed on disk");
    const noSuchFile = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/predictions/settle", {
      file: "../escape.md", index: 0, status: "hit",
    });
    test.assert(noSuchFile.status === 404, "a path is not an article name");

    const routineStatus = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/routine");
    test.assert(routineStatus.status === 200 && routineStatus.json?.declared === true && routineStatus.json.corpus?.lines === 1,
      "GET /routine names the declared sync and reads the corpus");
    const draftPlan = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/routine/plan", {
      kind: "draft", from: "2026-09-24", to: "2026-09-26",
    });
    test.assert(draftPlan.status === 200 && JSON.stringify(draftPlan.json?.missing) === JSON.stringify(["2026-09-24"])
      && draftPlan.json?.ready === false,
      "the drafting plan names the range and says the model channel is not wired");
    const rescan = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/routine/plan", { kind: "rescan", month: "2026-09" });
    test.assert(rescan.status === 200 && rescan.json?.count === 2 && rescan.json?.commandDeclared === true,
      "the rescan plan lists the month and the declared packet command");

    const packet = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/routine/rescan", { month: "2026-09" });
    test.assert(packet.status === 200 && packet.json?.files?.every((file) => file.exists),
      "POST /routine/rescan runs the declared command and reports the two files it wrote");
    test.assert(readFileSync(join(siteRoot, "packets", "2026-09.md"), "utf8").includes("2026-09"), "the packet is on disk");

    const syncStart = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/routine/sync", { action: "start" });
    test.assert(syncStart.status === 200 && syncStart.json?.status === "running", "POST /routine/sync starts the declared command");
    let syncState = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      syncState = (await request(port, "GET", "/api/wensi-quanyong/sites/fixture/routine")).json;
      if (syncState?.run?.status !== "running") break;
    }
    test.assert(syncState?.run?.status === "done" && syncState.run.newLines === 1,
      "the finished sync reports the line it added");

    // ---- 起草: the channel is required before a model is reached. ----

    const noChannel = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/draft/run", {
      from: "2026-09-24", to: "2026-09-26",
    });
    test.assert(noChannel.status === 409 && noChannel.json?.code === "provider_not_configured",
      "a site without a drafting channel is refused before any model call");

    // Declare the channel, then check the two refusals that do not spend:
    // a range where everything exists, and a bad range.
    const withChannel = {
      ...fixtureDescription,
      routine: { ...fixtureDescription.routine, drafting: { ...fixtureDescription.routine.drafting, channel: "claude-subscription" } },
    };
    writeFileSync(
      join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions", "fixture.json"),
      JSON.stringify(withChannel),
    );
    const nothingMissing = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/draft/run", {
      from: "2026-09-25", to: "2026-09-26",
    });
    test.assert(nothingMissing.status === 409 && nothingMissing.json?.code === "nothing_missing",
      "a range that is already covered is refused, not sent to a model");
    const badRange = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/draft/run", {
      from: "2026-09-01", to: "2026-09-30",
    });
    test.assert(badRange.status === 400 && badRange.json?.code === "range_too_wide",
      "a range wider than the pipeline's two weeks is refused by the route too");

    // Saving a draft is a file write, and it never overwrites.
    const accepted = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/draft/accept", {
      posts: [{ date: "2026-09-27", title: "草稿一篇", body: "正文".repeat(30) }],
    });
    test.assert(accepted.status === 200 && accepted.json?.written?.length === 1,
      "POST /draft/accept writes the chosen candidate into the drafts folder");
    const draftFile = join(postsDir, accepted.json.written[0].name);
    test.assert(readFileSync(draftFile, "utf8").startsWith("---\ntitle: 草稿一篇\ndate: 2026-09-27"), "the draft carries front matter");
    const firstDraftBytes = readFileSync(draftFile, "utf8");
    const again = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/draft/accept", {
      posts: [{ date: "2026-09-27", title: "草稿一篇", body: "正文".repeat(30) }],
    });
    test.assert(again.status === 200 && again.json?.written?.length === 1 && again.json.written[0].name.endsWith("-2.md"),
      "a same-day post with the same derived slug is numbered, not lost");
    test.assert(readFileSync(draftFile, "utf8") === firstDraftBytes, "the first draft is byte-identical after the second write");
    const namedAgain = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/draft/accept", {
      posts: [{ date: "2026-09-27", title: "草稿一篇", body: "正文".repeat(30), slug: "draft" }],
    });
    test.assert(namedAgain.status === 200 && namedAgain.json?.written?.length === 0 && namedAgain.json.skipped[0].reason === "exists",
      "an explicit slug that already exists is refused, not renumbered");

    // ---- 联络人: the corpus's guest list. ----

    const people = await request(port, "GET", "/api/wensi-quanyong/sites/fixture/contacts");
    test.assert(people.status === 200 && people.json?.summary?.conversations === 2 && people.json?.summary?.senders === 2,
      "GET /contacts reads the list the sync script reads");
    const toggled = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/contacts", {
      conversations: [{ id: "111", kind: "group", enabled: false }],
    });
    test.assert(toggled.status === 200 && toggled.json?.changed?.length === 1, "POST /contacts toggles an entry");
    const storedContacts = JSON.parse(readFileSync(join(siteRoot, "tools", "contacts.json"), "utf8"));
    test.assert(storedContacts.qq.conversations[0].enabled === false && storedContacts.qq.conversations[0].prefix === "甲（群）",
      "the entry stays in the file, marked off");
    const unknownContact = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/contacts", {
      conversations: [{ id: "nope", enabled: false }],
    });
    test.assert(unknownContact.status === 404 && unknownContact.json?.code === "conversation_missing",
      "an unknown conversation is refused by name");

    // ---- 长文: writing the approved candidate, and the refusals around it. ----

    const longform = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/longform", {
      action: "accept",
      date: "2026-09-28",
      candidate: {
        title: "从两篇日更写一篇长文",
        slug: "two-days-one-piece",
        description: "把两天的材料收成一篇。",
        body: "正文段落。".repeat(200),
        tags: ["Mac", "写作"],
        related: ["2026-09-25-prediction.md"],
      },
    });
    test.assert(longform.status === 200 && longform.json?.file === "2026-09-28-two-days-one-piece.md",
      "POST /longform accept writes the piece under date-slug.md");
    const longformFile = readFileSync(join(siteRoot, "longform", "2026-09-28-two-days-one-piece.md"), "utf8");
    test.assert(longformFile.includes("related: [2026-09-25-prediction.md]") && longformFile.includes("tags: [Mac, 写作]"),
      "the front matter carries the related list and the tags the site builder checks");
    const longformBadRelated = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/longform", {
      action: "accept",
      date: "2026-09-29",
      candidate: { title: "x", slug: "x-slug", description: "d", body: "y".repeat(400), tags: ["Mac"], related: ["nope.md"] },
    });
    test.assert(longformBadRelated.status === 400 && longformBadRelated.json?.code === "related_missing",
      "a related name that is not a post is refused before the build would fail");

    // ---- 回扫: the rollback point, the channel gate, and the in-place write. ----

    const snap = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/rescan", {
      action: "snapshot", month: "2026-09",
    });
    test.assert(snap.status === 200 && snap.json?.kind === "copy" && snap.json?.files > 0,
      "the corpus is not a repository, so the snapshot is a copy and says how many files it took");
    const noChannelRescan = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/rescan", {
      action: "rewrite", month: "2026-09", file: "2026-09-25-prediction.md",
    });
    test.assert(noChannelRescan.status === 409 || noChannelRescan.json?.code === "provider_not_configured",
      "rewriting without a declared channel is refused before any model call");
    const applyRescan = await request(port, "POST", "/api/wensi-quanyong/sites/fixture/rescan", {
      action: "apply", month: "2026-09", file: "2026-09-25-prediction.md",
      body: "改正之后的正文，停在一个具体事实上。这里再写一句让它像一篇短文。",
    });
    test.assert(applyRescan.status === 200 && applyRescan.json?.changed === true && applyRescan.json?.snapshot?.kind === "copy",
      "applying a rewrite writes in place and takes a snapshot first");
    const rewrittenPost = readFileSync(join(postsDir, "2026-09-25-prediction.md"), "utf8");
    test.assert(rewrittenPost.startsWith("---\ntitle: 一条预测"), "the front matter survived the write");
    test.assert(rewrittenPost.includes("改正之后的正文") && !rewrittenPost.includes("正文。\n"), "the body is the approved one");

    const outsideCommand = { id: "bad", purpose: "publish", argv: ["/bin/echo", "x"], cwd: join(scratch, "elsewhere") };
    let cwdRefused = "";
    try {
      commands.commandCwd(fixtureDescription, outsideCommand);
    } catch (error) {
      cwdRefused = String(error.code);
    }
    test.assert(cwdRefused === "bad_command_cwd", "a command cwd outside the site root is refused");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
} finally {
  delete process.env.AI_SYSTEM6_AGENT_ALLOW_TMP;
  delete process.env.AI_SYSTEM6_AGENT_HOME;
  rmSync(scratch, { recursive: true, force: true });
}

test.finish();
