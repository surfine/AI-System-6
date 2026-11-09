// 文思泉涌 P5 · 起草通道.
//
// The channel is tested without a model: the caller injects `complete`, so the
// whole path — prompt assembly, the ceilings that run before anything is sent,
// the strict reading of the reply, the rule-package verdicts, and the separate
// write into the drafts folder — is exercised for real.

import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-d-drafting");

const drafting = require("../../apps/server/server/lib/blog-sites/drafting.js");

const root = mkdtempSync(join(tmpdir(), "wensi-draft-"));
const draftsDir = join(root, "drafts");
mkdirSync(draftsDir, { recursive: true });
const brief = join(root, "WEEKLY_PIPELINE.md");
writeFileSync(brief, "# 每周例行\n\n照 v4 写，日更 ≤240 字。\n");

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: { root },
  tools: { dir: root, draftsDir },
  routine: { drafting: { brief, maxSpendUsd: 8 } },
  contentTypes: { daily: { label: "日更", storage: { kind: "file-per", dir: join(root, "posts") }, fields: [] } },
};

const corpus = [
  "2026-11-06 08:10 [Sync1106|A] 先说这一条",
  "2026-11-06 09:00 [Sync1106|A] 再说这一条",
  "2026-11-07 10:00 [Sync1107|A] 别人的日子",
  "2026-11-08 11:00 [Sync1108|A] 该写的一天",
].join("\n");

// ---- the prompt ----

const prompt = drafting.buildDraftPrompt({ dates: ["2026-11-06", "2026-11-08"], briefText: "# 例行", corpusText: corpus });
test.assert(prompt.system.includes("# 例行"), "the brief reaches the system text");
test.assert(prompt.messages.length === 2 && prompt.messages[0].role === "system", "a system turn and a user turn");
test.assert(JSON.stringify(prompt).includes("2026-11-06") && JSON.stringify(prompt).includes("2026-11-08"), "the dates to fill are named");
test.assert(drafting.corpusForDates(corpus, ["2026-11-06", "2026-11-08"]).includes("先说这一条")
  && !drafting.corpusForDates(corpus, ["2026-11-06", "2026-11-08"]).includes("别人的日子"),
  "only the requested days' corpus lines are sent");

// ---- the ceiling runs before the model does ----

let called = 0;
const complete = async () => {
  called += 1;
  return { text: JSON.stringify({ posts: [{ date: "2026-11-06", title: "标题", body: "正文".repeat(20) }] }), model: "stub-model" };
};

let code = "";
try {
  await drafting.runDraft({ site, dates: ["2026-11-06"], brief, corpus, complete: null });
} catch (error) { code = error.code; }
test.assert(code === "provider_not_configured", "no channel means a named refusal, not a quiet no-op");

try {
  await drafting.runDraft({ site, dates: ["2026-11-06"], brief: join(root, "nope.md"), corpus, complete });
} catch (error) { code = error.code; }
test.assert(code === "brief_missing", "a missing brief is refused before spending");

const tinySite = { ...site, routine: { drafting: { brief, maxInputTokens: 10 } } };
try {
  await drafting.runDraft({ site: tinySite, dates: ["2026-11-06"], brief, corpus, complete });
} catch (error) { code = error.code; }
test.assert(code === "input_too_large" && called === 0, "an over-ceiling prompt is refused, and the model is never called");

// ---- the reply is read strictly ----

const good = await drafting.runDraft({ site, dates: ["2026-11-06", "2026-11-08"], brief, corpus, complete });
test.assert(good.ok === true && good.candidates.length === 1, "a well-shaped answer becomes candidates");
test.assert(good.receipt.model === "stub-model" && good.receipt.pricingKnown === false,
  "the receipt says which model answered and that there is no price table");
test.assert(/token/.test(good.receipt.note), "without a price table the receipt says the cap is tokens");

const mixed = await drafting.runDraft({
  site,
  dates: ["2026-11-06"],
  brief,
  corpus,
  complete: async () => ({
    text: "```json\n" + JSON.stringify({
      posts: [
        { date: "2026-11-06", title: "好的", body: "这一条正文足够长，可以做一篇日更。".repeat(3) },
        { date: "2026-11-07", title: "没要的日期", body: "这一条不属于这次要的日子。".repeat(3) },
        { date: "2026-11-06", title: "太短", body: "短" },
      ],
    }) + "\n```",
    model: "stub-model",
  }),
});
test.assert(mixed.candidates.length === 1 && mixed.candidates[0].title === "好的", "a fenced reply is read, and only the good post survives");
test.assert(mixed.problems.some((problem) => problem.reason === "date_not_requested"), "a post for a date nobody asked for is reported");
test.assert(mixed.problems.some((problem) => problem.reason === "body_length"), "a too-short body is reported");

try {
  await drafting.runDraft({ site, dates: ["2026-11-06"], brief, corpus, complete: async () => ({ text: "不是 JSON", model: "stub" }) });
} catch (error) { code = error.code; }
test.assert(code === "reply_unreadable", "a reply that is not JSON is refused");
try {
  await drafting.runDraft({ site, dates: ["2026-11-06"], brief, corpus, complete: async () => ({ text: JSON.stringify({ posts: [] }), model: "stub" }) });
} catch (error) { code = error.code; }
test.assert(code === "no_usable_posts", "an empty answer is refused");

// ---- the rule packages judge each candidate ----

const judged = await drafting.runDraft({
  site,
  dates: ["2026-11-06"],
  brief,
  corpus,
  complete,
  check: (post) => (post.title === "标题" ? [{ severity: "error", message: "标题不合规矩" }] : []),
});
test.assert(judged.candidates[0].blocked === true && judged.candidates[0].findings.length === 1,
  "a red finding marks the candidate blocked and keeps the reason");
test.assert(/规则包/.test(judged.note), "the note says a candidate did not pass the rule packages");

// ---- spending words ----

const policy = drafting.spendPolicy(site, { model: "claude-sonnet" });
test.assert(policy.pricingKnown === false && policy.maxInputTokens === drafting.DEFAULT_MAX_INPUT_TOKENS,
  "an unpriced model is capped in tokens, with a stated default");
const priced = drafting.spendPolicy(site, { model: "x", pricing: () => 0.5 });
test.assert(priced.pricingKnown === true, "a priced model gets a dollar cap");

// ---- writing the drafts: a separate, explicit step ----

const accepted = drafting.acceptDrafts(site, { posts: [{ date: "2026-11-06", title: "一条好标题", body: "正文".repeat(30) }] });
test.assert(accepted.written.length === 1, "a chosen candidate becomes a draft file");
const writtenFile = join(draftsDir, accepted.written[0].name);
test.assert(existsSync(writtenFile), "the file is on disk");
const written = readFileSync(writtenFile, "utf8");
test.assert(written.startsWith("---\ntitle: 一条好标题\ndate: 2026-11-06\nslug: "), "the draft carries front matter the site can read");

// A second post on the same day with the same (title-derived) slug is numbered,
// and the first file is untouched.
const firstBytes = readFileSync(writtenFile, "utf8");
const again = drafting.acceptDrafts(site, { posts: [{ date: "2026-11-06", title: "一条好标题", body: "正文".repeat(30) }] });
test.assert(again.written.length === 1 && again.written[0].name === `${accepted.written[0].name.replace(/\.md$/, "-2.md")}`,
  "a same-day post with the same derived slug is numbered, not lost");
test.assert(readFileSync(writtenFile, "utf8") === firstBytes, "the first file is byte-identical after the second write");

// A slug the model gave names the piece: it is never reused.
const namedOnce = drafting.acceptDrafts(site, { posts: [{ date: "2026-11-07", title: "Named", body: "正文".repeat(30), slug: "named-piece" }] });
test.assert(namedOnce.written.length === 1 && namedOnce.written[0].name === "2026-11-07-named-piece.md", "an explicit slug names the file");
const namedTwice = drafting.acceptDrafts(site, { posts: [{ date: "2026-11-07", title: "Named", body: "正文".repeat(30), slug: "named-piece" }] });
test.assert(namedTwice.written.length === 0 && namedTwice.skipped[0].reason === "exists",
  "an explicit slug that already exists is refused, not renumbered");

const incomplete = drafting.acceptDrafts(site, { posts: [{ date: "2026-11-09", title: "", body: "" }] });
test.assert(incomplete.written.length === 0 && incomplete.skipped[0].reason === "incomplete", "an incomplete candidate is refused");
try { drafting.acceptDrafts({ ...site, tools: {} }, { posts: [{ date: "2026-11-09", title: "x", body: "y".repeat(30) }] }); } catch (error) { code = error.code; }
test.assert(code === "drafts_dir_missing", "a site without a drafts folder says so");

// ---- longform: several dailies in, one piece out ----

const longformDir = join(root, "longform");
mkdirSync(longformDir, { recursive: true });
const dailyDir = join(root, "posts");
mkdirSync(dailyDir, { recursive: true });
writeFileSync(join(dailyDir, "2026-11-01-a.md"), "---\ntitle: 一\n---\n\n正文\n");
writeFileSync(join(dailyDir, "2026-11-02-b.md"), "---\ntitle: 二\n---\n\n正文\n");
const longSite = {
  ...site,
  contentTypes: {
    daily: { label: "日更", storage: { kind: "file-per", dir: dailyDir }, fields: [] },
    longform: { label: "长文", storage: { kind: "file-per", dir: longformDir }, fields: [] },
  },
};
const longBriefs = [brief];
const chosen = [
  { file: "2026-11-01-a.md", title: "一", date: "2026-11-01", body: "第一天的正文。".repeat(10), tags: ["Mac", "写作"] },
  { file: "2026-11-02-b.md", title: "二", date: "2026-11-02", body: "第二天的正文。".repeat(10), tags: ["写作", "回顾"] },
];
const longComplete = async () => ({
  text: JSON.stringify({
    title: "从两天里写一篇长文",
    slug: "two-days-one-piece",
    description: "把两天的材料收成一篇。",
    body: "正文段落。".repeat(300),
  }),
  model: "stub-model",
});

const long = await drafting.runLongform({ site: longSite, posts: chosen, briefs: longBriefs, complete: longComplete });
test.assert(long.candidate.slug === "two-days-one-piece", "the model's slug is kept");
test.assert(JSON.stringify(long.candidate.related) === JSON.stringify(["2026-11-01-a.md", "2026-11-02-b.md"]),
  "related is the chosen posts, in the writer's order — not the model's");
test.assert(JSON.stringify(long.candidate.tags) === JSON.stringify(["Mac", "写作", "回顾"]),
  "tags are the union of the chosen posts' tags, so none is invented");
test.assert(long.receipt.model === "stub-model" && long.candidate.warnings.length === 0, "the receipt names the model, and a 1000+ character body passes the length band");

const shortLong = await drafting.runLongform({
  site: longSite,
  posts: chosen,
  briefs: longBriefs,
  complete: async () => ({ text: JSON.stringify({ title: "短", slug: "short", description: "一句话。", body: "短正文。".repeat(60) }), model: "stub" }),
});
test.assert(shortLong.candidate.warnings.some((warning) => /1000–2800/.test(warning)), "a body outside the site's band is a warning, not a refusal");

let longCode = "";
try {
  await drafting.runLongform({
    site: longSite,
    posts: chosen,
    briefs: longBriefs,
    complete: async () => ({ text: JSON.stringify({ title: "标题", slug: "中文 slug", description: "x", body: "y".repeat(400) }), model: "stub" }),
  });
} catch (error) { longCode = error.code; }
test.assert(longCode === "longform_reply_invalid", "a slug the site cannot build is refused");
try {
  await drafting.runLongform({ site: longSite, posts: chosen, briefs: [], complete: longComplete });
} catch (error) { longCode = error.code; }
test.assert(longCode === "brief_missing", "no readable brief is a refusal");

const acceptedLong = drafting.acceptLongform(longSite, { candidate: long.candidate, date: "2026-11-09" });
test.assert(acceptedLong.ok === true && acceptedLong.file === "2026-11-09-two-days-one-piece.md", "the longform file is named date-slug.md");
const writtenLong = readFileSync(join(longformDir, acceptedLong.file), "utf8");
test.assert(writtenLong.includes("tags: [Mac, 写作, 回顾]") && writtenLong.includes("related: [2026-11-01-a.md, 2026-11-02-b.md]"),
  "the front matter carries the tags and the related list the site builder reads");
test.assert(writtenLong.startsWith("---\ntitle: 从两天里写一篇长文\ndate: 2026-11-09"), "title and date are written");

let acceptCode = "";
try { drafting.acceptLongform(longSite, { candidate: long.candidate, date: "2026-11-09" }); } catch (error) { acceptCode = error.code; }
test.assert(acceptCode === "exists", "an existing longform file is never replaced");
try {
  drafting.acceptLongform(longSite, { candidate: { ...long.candidate, related: ["nope.md"] }, date: "2026-11-10" });
} catch (error) { acceptCode = error.code; }
test.assert(acceptCode === "related_missing", "a related name that is not a real post is refused before the build fails");
try {
  drafting.acceptLongform(longSite, { candidate: { ...long.candidate, tags: [] }, date: "2026-11-11" });
} catch (error) { acceptCode = error.code; }
test.assert(acceptCode === "tags_missing", "a longform without tags is refused (the site requires one)");

rmSync(root, { recursive: true, force: true });
test.finish();
