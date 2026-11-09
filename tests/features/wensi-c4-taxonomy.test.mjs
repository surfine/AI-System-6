// 文思泉涌 P4 · tag rename and merge.
//
// A rename is three writes that must stay in agreement: the tag table's alias
// and declared redirect, the articles that carried the old name, and — for a
// new name — the kept set. This contract builds a small site on disk and checks
// each half, plus the parts that must NOT move: bytes outside the tags line,
// articles that never used the name, and the whole tree during a plan.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c4-taxonomy");

const taxonomy = require("../../apps/server/server/lib/blog-sites/taxonomy.js");

const root = mkdtempSync(join(tmpdir(), "wensi-tax-"));
const postsDir = join(root, "posts");
const notesDir = join(root, "notes");
mkdirSync(postsDir, { recursive: true });
mkdirSync(notesDir, { recursive: true });

const postA = `---
title: 一篇用旧标签
date: 2026-11-01
slug: one
description: 一句话。
tags: [随笔, 写作]
---

正文里也提到随笔这个词，但它不在 tags 行，不该被改。
`;
const postB = `---
title: 另一篇
date: 2026-11-02
slug: two
description: 一句话。
tags: ["随笔"]
---

正文。
`;
const noteA = `---
date: 2026-10-30
time: "08:10"
---

一条笔记，tags 行在笔记里是另一套。
`;
writeFileSync(join(postsDir, "2026-11-01-one.md"), postA);
writeFileSync(join(postsDir, "2026-11-02-two.md"), postB);
writeFileSync(join(notesDir, "2026-10-30-note.md"), noteA);

const table = {
  schema: 1,
  canon: ["随笔", "写作", "观点"],
  alias: { "杂记": "随笔" },
  publishAlias: {},
  tagRedirects: {},
};
writeFileSync(join(root, "tags.json"), `${JSON.stringify(table, null, 2)}\n`);

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: { root },
  taxonomy: { tags: { source: "tags.json" } },
  contentTypes: {
    daily: { label: "日更", storage: { kind: "file-per", dir: postsDir }, fields: [] },
    notes: { label: "笔记", storage: { kind: "file-per", dir: notesDir }, fields: [] },
  },
};

// ---- the plan writes nothing ----

const plan = taxonomy.renameTag(site, { from: "随笔", to: "写作", dryRun: true });
test.assert(plan.dryRun === true && plan.counts.articles === 2, "the plan lists the two articles that carry the old tag");
test.assert(
  JSON.parse(readFileSync(join(root, "tags.json"), "utf8")).tagRedirects["随笔"] === undefined,
  "planning leaves the tag table alone",
);
test.assert(readFileSync(join(postsDir, "2026-11-01-one.md"), "utf8") === postA, "planning leaves the articles alone");

// ---- applying it: articles, table, and the bytes in between ----

const applied = taxonomy.renameTag(site, { from: "随笔", to: "写作", dryRun: false });
test.assert(applied.dryRun === false && applied.merge === true && applied.tagAdded === false,
  "merging into an existing kept tag reports a merge and adds no new tag");

const rewritten = readFileSync(join(postsDir, "2026-11-01-one.md"), "utf8");
test.assert(rewritten.includes("写作"), "the tags line now names the new tag");
test.assert(
  rewritten.split("\n").filter((line) => line.startsWith("tags:"))[0] === "tags: [写作]",
  "a merge collapses the duplicate: the line reads one tag, and nothing else on it moved",
);
test.assert(
  rewritten.includes("正文里也提到随笔这个词"),
  "the same word in the body is not touched — only the tags line is a tag list",
);
test.assert(
  readFileSync(join(postsDir, "2026-11-02-two.md"), "utf8").includes('tags: ["写作"]'),
  "a quoted tag keeps its quoting when rewritten",
);
test.assert(
  readFileSync(join(notesDir, "2026-10-30-note.md"), "utf8") === noteA,
  "a file with no tags line is left byte-identical",
);

const after = JSON.parse(readFileSync(join(root, "tags.json"), "utf8"));
test.assert(after.alias["随笔"] === "写作", "the table gains the alias so a stale lookup still resolves");
test.assert(after.tagRedirects["随笔"] === "写作", "the table declares the redirect the site builder turns into a 301");
test.assert(after.alias["杂记"] === "写作", "an alias that pointed at the renamed tag is re-pointed");
test.assert(JSON.stringify(after.canon) === JSON.stringify(table.canon), "a merge does not add the target tag twice");

// ---- renaming to a brand-new tag adds it to the kept set ----

const fresh = taxonomy.renameTag(site, { from: "观点", to: "评论", dryRun: false });
test.assert(fresh.merge === false && fresh.tagAdded === true, "renaming to a new name reports tagAdded");
test.assert(
  JSON.parse(readFileSync(join(root, "tags.json"), "utf8")).canon.includes("评论"),
  "the new tag joins the kept set",
);

// ---- a table that cannot be read fails loudly, not silently ----

writeFileSync(join(root, "tags.json"), "{ broken");
let code = "";
try { taxonomy.renameTag(site, { from: "评论", to: "观点" }); } catch (error) { code = error.code; }
test.assert(code === "taxonomy_unreadable", "an unreadable tag table is a named refusal");

const noSource = { ...site, taxonomy: {} };
try { taxonomy.tagTablePath(noSource); } catch (error) { code = error.code; }
test.assert(code === "taxonomy_not_configured", "a site with no tag table says so instead of guessing a path");

rmSync(root, { recursive: true, force: true });
test.finish();
