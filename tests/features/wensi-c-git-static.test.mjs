// 文思泉涌 lane C · the git-static adapter, exercised on fixture copies in a
// scratch directory — never on the real sites. Covers list/read/write, status
// inference (front-matter rule and draft-directory rule), the URL rules,
// git facts (real commits in a throwaway repo, null outside one), the atomic
// write, the protected keys, and the two escapes (../ and a symlinked path).

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c-git-static");
const adapter = require("../../apps/server/server/lib/blog-sites/git-static.js");
const { parseFrontMatter } = require("../../apps/server/server/lib/blog-sites/front-matter.js");

const fixtureRoot = join(import.meta.dirname, "..", "fixtures", "wensi-quanyong");
const scratch = mkdtempSync(join(tmpdir(), "wensi-c-adapter-"));
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

/** A minimal in-memory description whose roots live in the scratch tree. */
function fixtureSite() {
  return {
    schema: 1,
    id: "fixture",
    label: "Fixture",
    channel: { kind: "git-static", root: join(scratch, "site"), commands: [] },
    contentTypes: {
      daily: {
        label: "日更",
        storage: { kind: "file-per", dir: join(scratch, "site", "posts"), filename: "YYYY-MM-DD-slug.md" },
        fields: [
          { key: "title", type: "string", required: true },
          { key: "date", type: "date", required: true },
          { key: "slug", type: "slug", required: true },
          { key: "voice", type: "readonly" },
        ],
        url: { single: "/{year}/{month}/{day}/", multi: "/{year}/{month}/{day}/{slug}/" },
        draftRule: { kind: "front-matter", keys: ["held", "review"], approvedValue: "approved" },
      },
      notes: {
        label: "笔记",
        storage: { kind: "file-per", dir: join(scratch, "site", "notes"), filename: "YYYY-MM-DD-slug.md" },
        fields: [{ key: "date", type: "date", required: true }, { key: "time", type: "time" }],
        url: { single: "/notes/#n-{compactDate}-{slug}" },
      },
      app: {
        label: "文章",
        storage: { kind: "file-per", dir: join(scratch, "site", "_posts"), filename: "<slug>.md" },
        fields: [
          { key: "title", type: "string", required: true },
          { key: "cats", type: "tags", required: true },
          { key: "cid", type: "readonly" },
        ],
        url: { single: "{category}/{slug}.html" },
        draftRule: { kind: "draft-dir", dir: join(scratch, "site", "_drafts") },
      },
      photos: {
        label: "影像",
        storage: { kind: "json-collection", dir: join(scratch, "site", "photos"), file: "photos.json" },
        fields: [{ key: "file", type: "string" }],
      },
    },
  };
}

function write(article, fields, body) {
  const lines = Object.entries(fields).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: [${value.join(", ")}]`;
    return `${key}: ${value}`;
  });
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

const site = fixtureSite();
mkdirSync(join(scratch, "site", "posts"), { recursive: true });
mkdirSync(join(scratch, "site", "notes"), { recursive: true });
mkdirSync(join(scratch, "site", "_posts"), { recursive: true });

// The daily set: one published pair on the same day, one approved, one draft,
// and the real flow-mapping fixture copied verbatim.
cpSync(join(fixtureRoot, "aaronlau-daily", "2026-09-26-aigc-with-curation.md"), join(scratch, "site", "posts", "2026-09-26-aigc-with-curation.md"));
cpSync(join(fixtureRoot, "aaronlau-daily", "2018-03-24-hillside-shuttle.md"), join(scratch, "site", "posts", "2018-03-24-hillside-shuttle.md"));
writeFileSync(join(scratch, "site", "posts", "2026-09-26-second-of-day.md"),
  write(null, { title: "同日第二篇", date: "2026-09-26", slug: "second-of-day" }, "正文"));
writeFileSync(join(scratch, "site", "posts", "2026-09-27-approved-but-listed.md"),
  write(null, { title: "已审", date: "2026-09-27", slug: "approved", review: "approved" }, "正文"));
writeFileSync(join(scratch, "site", "posts", "2026-09-28-still-draft.md"),
  write(null, { title: "草稿", date: "2026-09-28", slug: "still-draft", review: "pending" }, "正文"));
writeFileSync(join(scratch, "site", "posts", "2026-09-29-held.md"),
  write(null, { title: "压着", date: "2026-09-29", slug: "held", held: "改完再发" }, "正文"));
writeFileSync(join(scratch, "site", "notes", "2014-10-30-hegel-logic.md"),
  write(null, { date: "2014-10-30", time: "08:23" }, "笔记正文"));
cpSync(join(fixtureRoot, "appscope-posts", "wwdc-2016.md"), join(scratch, "site", "_posts", "wwdc-2016.md"));

try {
  // ---- Listing and status inference. ----

  const daily = await adapter.listArticles(site, "daily");
  test.assert(daily.length === 6, `daily lists all six articles (${daily.length})`);
  const byPath = Object.fromEntries(daily.map((a) => [a.path, a]));
  test.assert(byPath["2026-09-28-still-draft.md"].status === "draft"
    && byPath["2026-09-29-held.md"].status === "draft",
    "review: pending and held: … hold a draft back");
  test.assert(byPath["2026-09-27-approved-but-listed.md"].status === "published"
    && byPath["2026-09-26-aigc-with-curation.md"].status === "published",
    "review: approved and unmarked files are published");
  test.assert(byPath["2026-09-26-aigc-with-curation.md"].url === "/2026/09/26/"
    && byPath["2026-09-26-second-of-day.md"].url === "/2026/09/26/second-of-day/",
    "the first article of a day keeps the bare day URL, the next gains the slug");
  test.assert(byPath["2026-09-28-still-draft.md"].url === "",
    "a draft has no URL");
  test.assert(byPath["2026-09-26-aigc-with-curation.md"].lastCommit === null
    && byPath["2026-09-26-aigc-with-curation.md"].gitDirty === false,
    "a directory outside git answers lastCommit null, gitDirty false (not an error)");

  const notes = await adapter.listArticles(site, "notes");
  test.assert(notes.length === 1 && notes[0].url === "/notes/#n-20141030-hegel-logic",
    "note URLs are the notes page anchor with the compact date");

  // ---- Draft-directory rule + git facts in a throwaway repo. ----

  spawnSync("git", ["init", "-q"], { cwd: join(scratch, "site") });
  spawnSync("git", ["-c", "user.email=t@l", "-c", "user.name=t", "add", "-A"], { cwd: join(scratch, "site") });
  spawnSync("git", ["-c", "user.email=t@l", "-c", "user.name=t", "commit", "-qm", "seed"], { cwd: join(scratch, "site") });
  writeFileSync(join(scratch, "site", "_posts", "dirty.md"),
    write(null, { title: "未提交", date: "2016-06-02T09:30:00+08:00", cats: ["view"], slug: "dirty" }, "正文"));
  mkdirSync(join(scratch, "site", "_drafts"), { recursive: true });
  writeFileSync(join(scratch, "site", "_drafts", "sketch.md"),
    write(null, { title: "草稿目录", date: "2016-06-03T09:30:00+08:00", cats: ["view"], slug: "sketch" }, "草稿正文"));

  const app = await adapter.listArticles(site, "app");
  const appByPath = Object.fromEntries(app.map((a) => [a.path, a]));
  test.assert(app.length === 3, `app lists _posts and _drafts together (${app.length})`);
  test.assert(appByPath["drafts/sketch.md"].status === "draft",
    "a file in the draft directory is a draft");
  test.assert(appByPath["wwdc-2016.md"].status === "published"
    && appByPath["wwdc-2016.md"].url === "view/wwdc-2016.html",
    "a _posts file is published with the category/slug.html URL");
  test.assert(appByPath["wwdc-2016.md"].lastCommit?.hash.length === 40,
    "a committed file carries its latest commit hash");
  test.assert(appByPath["dirty.md"].gitDirty === true && appByPath["wwdc-2016.md"].gitDirty === false,
    "gitDirty follows the working tree, not the whole repo");

  // ---- Read. ----

  const read = await adapter.readArticle(site, "daily", "2018-03-24-hillside-shuttle.md");
  test.assert(read.frontMatter.title === "运量和灵活排成两个反方向" && read.body.includes("跳蛙公车"),
    "readArticle returns front-matter and body");
  test.assert(read.url === "/2018/03/24/" && read.status === "published",
    "readArticle derives url and status");
  test.assert(JSON.stringify(read.opaqueKeys) === JSON.stringify(["predictions"]),
    "readArticle names its opaque keys");
  const readDraft = await adapter.readArticle(site, "app", "drafts/sketch.md");
  test.assert(readDraft.status === "draft", "the drafts/ namespace reads from the draft directory");

  // ---- Write: atomic, minimal diff, protected keys. ----

  const before = readFileSync(join(scratch, "site", "posts", "2026-09-26-aigc-with-curation.md"), "utf8");
  const parsed = parseFrontMatter(before);
  const writeResult = await adapter.writeArticle(site, "daily", "2026-09-26-aigc-with-curation.md", {
    frontMatter: { ...parsed.fields, title: "改过的标题", voice: "客户端想改" },
    body: parsed.body,
  });
  test.assert(writeResult.ok !== false && writeResult.path === "2026-09-26-aigc-with-curation.md",
    "writeArticle answers ok with the path");
  const after = readFileSync(join(scratch, "site", "posts", "2026-09-26-aigc-with-curation.md"), "utf8");
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const movedLines = beforeLines.filter((line, index) => line !== afterLines[index]);
  test.assert(movedLines.length === 1 && movedLines[0].startsWith("title:"),
    "a property edit moves exactly its own line (git diff would show one line)");
  test.assert(after.includes("title: 改过的标题") && !after.includes("客户端想改")
    && writeResult.warnings.some((w) => w.includes("voice")),
    "the readonly voice field keeps the server value, with a warning");
  test.assert(!readdirSync(join(scratch, "site", "posts")).some((name) => name.endsWith(".tmp")),
    "the write leaves no temp file behind (atomic rename)");

  const created = await adapter.writeArticle(site, "app", "drafts/new-idea.md", {
    frontMatter: { title: "新草稿", date: "2016-06-04T09:30:00+08:00", cats: ["view"], slug: "new-idea" },
    body: "草稿",
  });
  test.assert(created.path === "drafts/new-idea.md"
    && existsSync(join(scratch, "site", "_drafts", "new-idea.md")),
    "writing a drafts/ path creates the draft in the draft directory");

  // ---- Refusals: collection storage, path escapes, symlink escape. ----

  let refused = "";
  try {
    await adapter.listArticles(site, "photos");
  } catch (error) {
    refused = String(error.code);
  }
  test.assert(refused === "storage_unsupported", "json-collection storage is refused loudly, not an empty list");

  for (const evil of ["../outside.md", "a/../../outside.md"]) {
    let code = "";
    try {
      await adapter.readArticle(site, "daily", evil);
    } catch (error) {
      code = String(error.code);
    }
    test.assert(code === "path_escape" || code === "bad_article_path", `../ escape refused: ${evil}`);
  }

  const outside = join(scratch, "outside-secret.md");
  writeFileSync(outside, "机密");
  const linkName = "link.md";
  try {
    rmSync(join(scratch, "site", "posts", linkName), { force: true });
    symlinkSync(outside, join(scratch, "site", "posts", linkName));
    let code = "";
    try {
      await adapter.readArticle(site, "daily", linkName);
    } catch (error) {
      code = String(error.code);
    }
    test.assert(code === "path_escape", "a symlink pointing outside the content root is refused on read");
    code = "";
    try {
      await adapter.writeArticle(site, "daily", linkName, { frontMatter: {}, body: "x" });
    } catch (error) {
      code = String(error.code);
    }
    test.assert(code === "path_escape", "a symlink pointing outside the content root is refused on write");
  } finally {
    rmSync(join(scratch, "site", "posts", linkName), { force: true });
  }
  test.assert(readFileSync(outside, "utf8") === "机密", "the outside file was never touched");

  // ---- Taxonomy. ----

  writeFileSync(join(scratch, "site", "tags.json"), JSON.stringify({ 应用商店: "app-store", steam: "steam", "os x": "os-x" }));
  const taxonomy = await adapter.readTaxonomy({
    ...site,
    taxonomy: { tags: { source: "tags.json" }, categories: [{ slug: "app", name: "应用" }], series: null },
  });
  test.assert(JSON.stringify(taxonomy.tags.canon) === JSON.stringify(["app-store", "steam", "os-x"])
    && taxonomy.tags.alias["应用商店"] === "app-store",
    "a flat alias→canon tags file reads into canon and alias");
  test.assert(taxonomy.categories.length === 1 && taxonomy.series !== undefined,
    "categories come from the description, series is present");

  const emptyTags = await adapter.readTaxonomy({
    ...site,
    taxonomy: { tags: { source: "tags.json" }, categories: null, series: null },
  });
  rmSync(join(scratch, "site", "tags.json"), { force: true });
  const afterMissing = await adapter.readTaxonomy({
    ...site,
    taxonomy: { tags: { source: "tags.json" }, categories: null, series: null },
  });
  test.assert(emptyTags.tags.canon.length === 3 && afterMissing.tags.canon.length === 0
    && afterMissing.tags.source.endsWith("tags.json"),
    "a missing tags file reads as an empty table that still names its source (aaronlau P4)");

  // ---- Unknown types and articles fail loudly. ----

  let unknownType = "";
  try {
    await adapter.listArticles(site, "nope");
  } catch (error) {
    unknownType = String(error.statusCode);
  }
  test.assert(unknownType === "404", "an unknown content type answers 404");
  let missing = "";
  try {
    await adapter.readArticle(site, "daily", "2000-01-01-none.md");
  } catch (error) {
    missing = String(error.statusCode);
  }
  test.assert(missing === "404", "a missing article answers 404");
  test.assert(realpathSync(scratch).startsWith(realpathSync(tmpdir())), "the scratch tree stayed in tmp");
} finally {
  delete process.env.AI_SYSTEM6_AGENT_ALLOW_TMP;
  rmSync(scratch, { recursive: true, force: true });
}

test.finish();
