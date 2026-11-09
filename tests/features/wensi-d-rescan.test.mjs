// 文思泉涌 P5 · 回扫改稿.
//
// Three verbs in the writer's order: a rollback point, one rewritten post as a
// candidate, then the write. The corpus here is not a git repository, so the
// rollback point is a copy — and the receipt says "copy", not "commit".
//
// The rule this contract protects: a rewrite touches the body and nothing else.
// The front-matter bytes go back exactly as they were, because a rescan is a
// correction of prose, not a reason to re-serialize someone's metadata.

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-d-rescan");

const rescan = require("../../apps/server/server/lib/blog-sites/rescan.js");

const root = mkdtempSync(join(tmpdir(), "wensi-rescan-"));
const postsDir = join(root, "posts");
const toolsDir = join(root, "tools");
const packetDir = join(root, "rescan", "packets", "2026-10");
mkdirSync(postsDir, { recursive: true });
mkdirSync(toolsDir, { recursive: true });
mkdirSync(packetDir, { recursive: true });
const brief = join(root, "BRIEF_RESCAN_V4.md");
writeFileSync(brief, "# 回扫 v4\n\n以改正为主，不重写立意。\n");

const post = `---
title: 一篇要改的稿
date: 2026-10-12
tags: [Mac, 写作]
predictions:
  - made: 2026-10-11
    claim: 站点的预测
    status: 待定
---

第一段：立场写得反了。

第二段：还带一点 AI 腔。
`;
writeFileSync(join(postsDir, "2026-10-12-fix-me.md"), post);
writeFileSync(join(packetDir, "2026-10-12-fix-me.txt"), "【本人】我原话是这么说的\n<<<LATE>>> 这条是发稿之后才说的\n");

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: { root },
  tools: { dir: toolsDir },
  routine: {
    drafting: { channel: "claude-subscription" },
    rescan: { brief, postPacketsDir: join(root, "rescan", "packets") },
  },
  contentTypes: { daily: { label: "日更", storage: { kind: "file-per", dir: postsDir }, fields: [] } },
};

// ---- the rollback point: a copy, because this tree is not a repository ----

const snap = rescan.snapshot(site, { label: "2026-10" });
test.assert(snap.ok === true && snap.kind === "copy", "a corpus outside git gets a copy, and the receipt says so");
test.assert(snap.files === 1 && snap.note.includes("不在 git 里"), "the copy reports how many files it took");
const copies = readdirSync(join(toolsDir, "snapshots"));
test.assert(copies.length === 1, "the snapshot lives under tools/snapshots");
test.assert(readFileSync(join(toolsDir, "snapshots", copies[0], "2026-10-12-fix-me.md"), "utf8") === post,
  "the snapshot is a byte-for-byte copy");

// A second snapshot in the same day reuses the first: one rollback point per
// run, not one per post.
const snapAgain = rescan.snapshot(site, { label: "2026-10" });
test.assert(snapAgain.reused === true && snapAgain.where === snap.where, "a second snapshot the same day reuses the first");
test.assert(readdirSync(join(toolsDir, "snapshots")).length === 1, "and it copies nothing again");

// ---- one rewrite: the body, with the packet as evidence ----

const rewritten = await rescan.rewritePost({
  site,
  month: "2026-10",
  file: "2026-10-12-fix-me.md",
  brief,
  complete: async (messages) => {
    const text = JSON.stringify(messages);
    return {
      text: JSON.stringify({ body: "第一段按原话改回来了。\n\n第二段停在一个具体事实上。" }),
      model: text.includes("<<<LATE>>>") ? "stub-model+packet" : "stub-model",
    };
  },
});
test.assert(rewritten.ok === true && rewritten.packet?.used === true, "the per-post packet is the evidence when this month has one");
test.assert(rewritten.receipt.model === "stub-model+packet", "the packet really reaches the prompt");
test.assert(rewritten.before.includes("立场写得反了") && rewritten.after.includes("改回来了"), "the candidate keeps the old body for comparison");
test.assert(rewritten.blocked === false, "no findings means not blocked");
test.assert(rewritten.receipt.inputTokens === null && /逐篇批准/.test(rewritten.note), "the receipt does not invent token counts it did not measure");

// The prompt is measured before it is sent: a packet that is too big is a
// refusal, not an expensive request.
{
  const bigPacketDir = join(root, "rescan", "packets", "2026-10");
  writeFileSync(join(bigPacketDir, "2026-10-12-fix-me.txt"), "很长的一行。\n".repeat(8_000));
  const smallCeiling = { ...site, routine: { ...site.routine, drafting: { channel: "claude-subscription", maxInputTokens: 10 } } };
  let ceilingCode = "";
  try {
    await rescan.rewritePost({
      site: smallCeiling,
      month: "2026-10",
      file: "2026-10-12-fix-me.md",
      brief,
      complete: async () => ({ text: JSON.stringify({ body: "不该被调用" }), model: "stub" }),
    });
  } catch (error) { ceilingCode = error.code; }
  test.assert(ceilingCode === "input_too_large", "a prompt over the ceiling is refused before the model is called");
  writeFileSync(join(bigPacketDir, "2026-10-12-fix-me.txt"), "【本人】我原话是这么说的\n");
}

let code = "";
try {
  await rescan.rewritePost({ site, month: "2026-10", file: "2026-10-12-fix-me.md", brief, complete: async () => ({ text: JSON.stringify({ body: "短" }), model: "stub" }) });
} catch (error) { code = error.code; }
test.assert(code === "body_length", "a body outside the limits is refused");
try {
  await rescan.rewritePost({ site, month: "2026-10", file: "2026-10-12-fix-me.md", brief, complete: async () => ({ text: "不是 JSON", model: "stub" }) });
} catch (error) { code = error.code; }
test.assert(code === "reply_unreadable", "a reply that is not JSON is refused");
try {
  await rescan.rewritePost({ site, month: "2026-10", file: "nope.md", brief, complete: async () => ({ text: "{}" }) });
} catch (error) { code = error.code; }
test.assert(code === "article_missing", "an unknown post is a named refusal");
try {
  await rescan.rewritePost({ site, month: "2026-10", file: "../escape.md", brief, complete: async () => ({ text: "{}" }) });
} catch (error) { code = error.code; }
test.assert(code === "bad_file", "a path is refused");
try {
  await rescan.rewritePost({ site, month: "2026-10", file: "2026-10-12-fix-me.md", brief: join(root, "nope.md"), complete: async () => ({ text: "{}" }) });
} catch (error) { code = error.code; }
test.assert(code === "brief_missing", "a missing brief is refused before the call");

// ---- apply: body replaced, front matter byte-identical ----

const applied = rescan.applyRewrite(site, { file: "2026-10-12-fix-me.md", body: rewritten.after });
test.assert(applied.changed === true, "an approved body is written");
const afterText = readFileSync(join(postsDir, "2026-10-12-fix-me.md"), "utf8");
const head = post.split("\n").slice(0, post.split("\n").indexOf("---", 1) + 1).join("\n");
test.assert(afterText.startsWith(head), "the front matter — including the opaque predictions block — is byte-identical");
test.assert(afterText.includes("改回来了") && !afterText.includes("立场写得反了"), "the body is the approved one");
test.assert(afterText.endsWith("\n"), "the file ends with one newline");

const sameAgain = rescan.applyRewrite(site, { file: "2026-10-12-fix-me.md", body: rewritten.after });
test.assert(sameAgain.changed === false, "applying the same body twice writes nothing");
try { rescan.applyRewrite(site, { file: "2026-10-12-fix-me.md", body: "短" }); } catch (error) { code = error.code; }
test.assert(code === "body_length", "an empty approval is refused");

// ---- splitPost keeps a file without front matter whole ----

const plain = rescan.splitPost("只有正文，没有 front matter。\n");
test.assert(plain.head === "" && plain.body.includes("只有正文"), "a file without a block is body only");

rmSync(root, { recursive: true, force: true });
test.finish();
