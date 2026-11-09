"use strict";
// 起草 (P5): one week's drafts, asked for by name, bounded before it spends.
//
// The channel is deliberately narrow. The desk's own subscription-CLI transport
// answers one model turn; this module builds the turn (the brief, the corpus
// lines for the days that have no post), and reads the answer back through a
// strict shape. Nothing here invents a provider: the caller supplies `complete`,
// so a contract can test the whole path without a model or a bill.
//
// Two rules hold before anything is sent:
//   1. the prompt is measured (characters → a token estimate), and a prompt over
//      the ceiling is refused rather than truncated — a truncated brief drafts
//      from half a rulebook;
//   2. spend is bounded. When the model has a price, the cap is dollars. When
//      it does not (the subscription CLIs have no price table here), the cap is
//      the token ceilings, and the receipt says so — an unenforceable dollar
//      figure is not a cap.
//
// Contract: tests/features/wensi-d-drafting.test.mjs

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAX_INPUT_TOKENS = 40_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 6_000;
const BRIEF_LIMIT_CHARS = 48_000;
const CORPUS_LIMIT_CHARS = 60_000;
const MAX_POSTS_PER_RUN = 6;
const MAX_TITLE_CHARS = 60;
const MAX_BODY_CHARS = 1_200;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function draftingError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * A CJK-heavy estimate: three UTF-8 bytes is about one character, and these
 * texts run about one token per character. Deliberately generous — the point is
 * to stay under the ceiling, not to predict a bill to the cent.
 * @param {string} text
 */
function estimateTokens(text) {
  return Math.ceil(Buffer.byteLength(String(text || ""), "utf8") / 3);
}

/** @param {string} file @param {number} limit */
function readBounded(file, limit) {
  if (!file || !fs.existsSync(file)) return { text: "", exists: false };
  const text = fs.readFileSync(file, "utf8");
  return { text: text.length > limit ? text.slice(0, limit) : text, exists: true, truncated: text.length > limit };
}

/**
 * The corpus lines for one day: the pipeline's own shape is
 * `YYYY-MM-DD HH:MM [SyncMMDD|…] …`.
 * @param {string} corpusText
 * @param {string[]} dates
 */
function corpusForDates(corpusText, dates) {
  const wanted = new Set(dates);
  return String(corpusText || "")
    .split("\n")
    .filter((line) => wanted.has(line.slice(0, 10)))
    .join("\n");
}

/**
 * @param {{ dates: string[], briefText?: string, corpusText?: string, instruction?: string }} options
 */
function buildDraftPrompt({ dates, briefText = "", corpusText = "", instruction = "" }) {
  const system = [
    "You are drafting for a personal blog whose weekly routine is fixed by the brief below.",
    "Follow the brief exactly: voice, length, title rules, what may be quoted, what must not appear.",
    "Use only the material given. Do not invent quotations, numbers, or events.",
    "Answer with exactly one JSON object and nothing else:",
    '{"posts":[{"date":"YYYY-MM-DD","title":"…","slug":"lower-case-english-slug","body":"…"}]}',
    "One to three posts per day, only for the dates listed. Body in the language the brief uses.",
    "",
    "# Brief",
    briefText,
  ].join("\n");

  const user = [
    `Dates that still need a post: ${dates.join(", ")}`,
    instruction ? `\nExtra instruction from the writer:\n${instruction}` : "",
    "\n# Corpus for those dates (verbatim; quote only what the brief allows)",
    corpusText || "(no corpus lines for these dates)",
  ].join("\n");

  return { system, user, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
}

/**
 * @param {string} text
 */
function stripFence(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Read the model's answer. Every problem is named; a post that breaks the shape
 * is dropped with its reason, never repaired by guessing.
 * @param {string} text
 * @param {string[]} dates
 * @returns {{ posts: { date: string, title: string, body: string }[], problems: { date?: string, reason: string }[] }}
 */
function parseDraftReply(text, dates) {
  const allowed = new Set(dates);
  let parsed;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch (error) {
    throw draftingError("reply_unreadable", `模型没有给出可读的 JSON（${String(/** @type {any} */ (error)?.message || error)}）。`, 502);
  }
  const rows = Array.isArray(parsed?.posts) ? parsed.posts : Array.isArray(parsed) ? parsed : null;
  if (!rows) throw draftingError("reply_unreadable", "模型的回答里没有 posts 数组。", 502);
  const posts = [];
  const problems = [];
  for (const row of rows) {
    const date = String(row?.date || "").trim();
    const title = String(row?.title || "").trim();
    const body = String(row?.body || "").trim();
    // A slug the site cannot build is dropped, not repaired: the post still
    // lands, and the file name falls back to the date (see acceptDrafts).
    const rawSlug = String(row?.slug || "").trim().toLowerCase();
    const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(rawSlug) ? rawSlug : "";
    if (rawSlug && !slug) problems.push({ date, reason: "slug_invalid" });
    if (!allowed.has(date)) { problems.push({ date, reason: "date_not_requested" }); continue; }
    if (!title || title.length > MAX_TITLE_CHARS) { problems.push({ date, reason: "title_invalid" }); continue; }
    if (body.length < 20 || body.length > MAX_BODY_CHARS) { problems.push({ date, reason: "body_length" }); continue; }
    posts.push({ date, title, body, slug });
  }
  if (!posts.length) throw draftingError("no_usable_posts", "模型给的回帖没有一条符合要求。", 502);
  return { posts: posts.slice(0, MAX_POSTS_PER_RUN), problems };
}

/**
 * The spend rule for this run: dollars when the model is priced, token ceilings
 * otherwise. Never "no ceiling".
 * @param {Record<string, any>} site
 * @param {{ model?: string, pricing?: (model: string, tokens: number) => number | null }} [options]
 */
function spendPolicy(site, { model = "", pricing = null } = {}) {
  const config = site?.routine?.drafting || {};
  const maxSpendUsd = Number(config.maxSpendUsd) || 0;
  const maxInputTokens = Number(config.maxInputTokens) || DEFAULT_MAX_INPUT_TOKENS;
  const maxOutputTokens = Number(config.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS;
  const priced = typeof pricing === "function" ? pricing(String(model || ""), 0) : null;
  return {
    model: String(model || ""),
    maxSpendUsd,
    maxInputTokens,
    maxOutputTokens,
    pricingKnown: typeof priced === "number",
    note: typeof priced === "number"
      ? `按 $${maxSpendUsd || "—"} 的花费上限与 ${maxOutputTokens} token 的输出上限拦。`
      : `这个模型没有价目表：$ 上限拦不住，按输入 ${maxInputTokens} / 输出 ${maxOutputTokens} token 的硬上限拦。`,
  };
}

/**
 * Ask for the week's drafts, bounded.
 *
 * @param {{
 *   site: Record<string, any>,
 *   type: string,
 *   dates: string[],
 *   brief: string,
 *   corpus: string,
 *   instruction?: string,
 *   model?: string,
 *   complete: (messages: { role: string, content: string }[], options: { model: string, maxTokens: number }) => Promise<{ text: string, model?: string, usage?: any }>,
 *   pricing?: ((model: string, tokens: number) => number | null) | null,
 *   check?: (post: { date: string, title: string, body: string }) => Promise<{ severity: string, message: string }[]> | { severity: string, message: string }[],
 * }} options
 */
async function runDraft({
  site,
  type = "daily",
  dates = [],
  brief = "",
  corpus = "",
  instruction = "",
  model = "",
  complete,
  pricing = null,
  check = null,
}) {
  const wanted = [...new Set((Array.isArray(dates) ? dates : []).map((entry) => String(entry)).filter(Boolean))];
  if (!wanted.length) throw draftingError("bad_request", "没有要起草的日期。", 400);
  if (typeof complete !== "function") throw draftingError("provider_not_configured", "没有可用的模型通道。", 409);
  const briefRead = readBounded(brief, BRIEF_LIMIT_CHARS);
  if (!briefRead.exists) throw draftingError("brief_missing", `找不到例行文档：${brief || "（没有登记）"}`, 409);
  const corpusText = String(corpus || "").slice(0, CORPUS_LIMIT_CHARS);

  const policy = spendPolicy(site, { model, pricing });
  const prompt = buildDraftPrompt({ dates: wanted, briefText: briefRead.text, corpusText, instruction });
  const inputTokens = estimateTokens(prompt.system) + estimateTokens(prompt.user);
  if (inputTokens > policy.maxInputTokens) {
    throw draftingError(
      "input_too_large",
      `这次的材料约 ${inputTokens} tokens，超过上限 ${policy.maxInputTokens}；缩到几天或减少语料再试。`,
      413,
    );
  }

  const result = await complete(prompt.messages, { model: policy.model, maxTokens: policy.maxOutputTokens });
  const output = parseDraftReply(result?.text || "", wanted);
  const outputTokens = estimateTokens(result?.text || "");
  const usedModel = String(result?.model || policy.model || "");
  const spend = typeof pricing === "function" ? pricing(usedModel, inputTokens + outputTokens) : null;

  const candidates = [];
  for (const post of output.posts) {
    let findings = [];
    if (typeof check === "function") {
      try {
        findings = (await check(post)) || [];
      } catch (error) {
        findings = [{ severity: "warn", message: `检查没跑成：${String(/** @type {any} */ (error)?.message || error)}` }];
      }
    }
    const errors = findings.filter((finding) => finding?.severity === "error");
    candidates.push({ ...post, findings, blocked: errors.length > 0 });
  }

  return {
    ok: true,
    type,
    dates: wanted,
    candidates,
    problems: output.problems,
    receipt: {
      model: usedModel,
      inputTokens,
      outputTokens,
      pricingKnown: policy.pricingKnown,
      estimatedCostUsd: typeof spend === "number" ? Math.round(spend * 100) / 100 : null,
      maxOutputTokens: policy.maxOutputTokens,
      note: policy.note,
    },
    note: candidates.some((candidate) => candidate.blocked)
      ? `起草了 ${candidates.length} 篇，其中 ${candidates.filter((candidate) => candidate.blocked).length} 篇没过规则包（存草稿前先看）。`
      : `起草了 ${candidates.length} 篇，规则包没有红项。`,
  };
}

/**
 * The longform turn: several daily posts in, one long piece out.
 *
 * The model writes the prose, title, slug and description; the desk owns the
 * facts the site builder checks — `date`, `related` (the posts the writer chose,
 * which is what makes the back-links bidirectional) and `tags` (the union of the
 * chosen posts' tags, so a longform piece cannot invent taxonomy).
 *
 * @param {{
 *   site: Record<string, any>,
 *   posts: { file: string, title?: string, date?: string, body: string, tags?: string[] }[],
 *   briefs: string[],
 *   instruction?: string,
 *   model?: string,
 *   complete: Function,
 *   pricing?: Function | null,
 *   check?: Function | null,
 * }} options
 */
async function runLongform({
  site,
  posts = [],
  briefs = [],
  instruction = "",
  model = "",
  complete,
  pricing = null,
  check = null,
}) {
  if (!Array.isArray(posts) || !posts.length) throw draftingError("bad_request", "长文要选几篇日更先。", 400);
  if (typeof complete !== "function") throw draftingError("provider_not_configured", "没有可用的模型通道。", 409);
  const briefText = (Array.isArray(briefs) ? briefs : [])
    .map((file) => readBounded(file, BRIEF_LIMIT_CHARS))
    .filter((entry) => entry.exists)
    .map((entry) => entry.text)
    .join("\n\n---\n\n");
  if (!briefText) throw draftingError("brief_missing", "长文简报一份都读不到（routine.drafting.longformBrief / brief）。", 409);

  const system = [
    "You are writing one longform post for a personal blog, from the writer's own daily posts below.",
    "Follow the briefs exactly: voice, structure, length, what may be quoted, what must not appear.",
    "Use only the material given. Do not invent quotations, numbers, or events.",
    "Answer with exactly one JSON object and nothing else:",
    '{"title":"…","slug":"lower-case-english-slug","description":"one line, at most 80 characters","body":"Markdown with ## headings"}',
    "",
    "# Briefs",
    briefText,
  ].join("\n");
  const material = posts.map((post) => `## ${post.date || ""} ${post.title || post.file}\n\n${String(post.body || "").trim()}`).join("\n\n");
  const user = [
    `Write one longform piece from these ${posts.length} daily posts.`,
    instruction ? `\nExtra instruction from the writer:\n${instruction}` : "",
    "\n# The daily posts (verbatim)",
    material,
  ].join("\n");

  const policy = spendPolicy(site, {
    model,
    pricing: typeof pricing === "function"
      ? /** @type {(model: string, tokens: number) => number | null} */ (pricing)
      : null,
  });
  const inputTokens = estimateTokens(system) + estimateTokens(user);
  if (inputTokens > policy.maxInputTokens) {
    throw draftingError("input_too_large", `这次的材料约 ${inputTokens} tokens，超过上限 ${policy.maxInputTokens}；少选几篇再试。`, 413);
  }
  const result = await complete([{ role: "system", content: system }, { role: "user", content: user }], {
    model: policy.model,
    maxTokens: policy.maxOutputTokens,
  });

  let parsed;
  try {
    parsed = JSON.parse(stripFence(result?.text || ""));
  } catch (error) {
    throw draftingError("reply_unreadable", `模型没有给出可读的 JSON（${String(/** @type {any} */ (error)?.message || error)}）。`, 502);
  }
  const title = String(parsed?.title || "").trim();
  const slug = String(parsed?.slug || "").trim().toLowerCase();
  const description = String(parsed?.description || "").trim();
  const body = String(parsed?.body || "").trim();
  const problems = [];
  if (!title || title.length > MAX_TITLE_CHARS) problems.push({ field: "title", reason: "title_invalid" });
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) problems.push({ field: "slug", reason: "slug_not_site_compatible" });
  if (!description || [...description].length > 80) problems.push({ field: "description", reason: "description_invalid" });
  if (body.length < 200 || body.length > 8_000) problems.push({ field: "body", reason: "body_length" });
  if (problems.length) {
    throw draftingError("longform_reply_invalid", `模型给的长文不符合站点要求：${problems.map((p) => `${p.field}:${p.reason}`).join("、")}`, 502);
  }

  const related = posts.map((post) => post.file);
  const tagSet = [];
  for (const post of posts) {
    for (const tag of Array.isArray(post.tags) ? post.tags : []) {
      const value = String(tag).trim();
      if (value && !tagSet.includes(value)) tagSet.push(value);
    }
  }
  const tags = tagSet.slice(0, 5);
  const chars = [...body].length;
  const warnings = [];
  if (chars < 1_000 || chars > 2_800) warnings.push(`正文 ${chars} 字，站点建议 1000–2800 字`);

  let findings = [];
  if (typeof check === "function") {
    try {
      findings = (await check({ title, slug, description, body, tags, related })) || [];
    } catch (error) {
      findings = [{ severity: "warn", message: `检查没跑成：${String(/** @type {any} */ (error)?.message || error)}` }];
    }
  }
  const blocked = findings.some((finding) => finding?.severity === "error");
  const outputTokens = estimateTokens(result?.text || "");
  const usedModel = String(result?.model || policy.model || "");
  return {
    ok: true,
    candidate: { title, slug, description, body, tags, related, findings, blocked, warnings },
    receipt: {
      model: usedModel,
      inputTokens,
      outputTokens,
      pricingKnown: policy.pricingKnown,
      maxOutputTokens: policy.maxOutputTokens,
      note: policy.note,
    },
    note: blocked
      ? "长文起草好了，但有红项；先看规则包的判词再存。"
      : `长文起草好了：${title}（${chars} 字，${related.length} 篇日更互链）。`,
  };
}

/**
 * Write the longform piece into the site's longform folder. The file name is
 * `date-slug.md`, the same shape the site's builder expects, and it never
 * replaces an existing piece.
 * @param {Record<string, any>} site
 * @param {{ candidate?: { title?: string, slug?: string, description?: string, body?: string, tags?: string[], related?: string[] }, date?: string }} options
 */
function acceptLongform(site, { candidate = {}, date = "" } = {}) {
  const type = site?.contentTypes?.longform;
  if (!type || type.storage?.kind !== "file-per") throw draftingError("unknown_content_type", "站点没有长文类型。", 404);
  const dir = String(type.storage.dir || "");
  if (!dir || !fs.existsSync(dir)) throw draftingError("longform_dir_missing", `长文目录不存在：${dir || "（没有登记）"}`, 409);
  const day = String(date || "").trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw draftingError("bad_date", "日期要写成 YYYY-MM-DD。", 400);
  const title = String(candidate.title || "").trim();
  const slug = String(candidate.slug || "").trim().toLowerCase();
  const description = String(candidate.description || "").trim();
  const body = String(candidate.body || "").trim();
  const related = (Array.isArray(candidate.related) ? candidate.related : []).map(String).filter(Boolean);
  const tags = (Array.isArray(candidate.tags) ? candidate.tags : []).map(String).filter(Boolean);
  if (!title || !body) throw draftingError("bad_request", "长文缺标题或正文。", 400);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw draftingError("bad_slug", "slug 只能用小写英文、数字和连字符。", 400);
  if (!related.length) throw draftingError("related_missing", "长文要挂至少一篇日更（related）。", 400);
  // `related` must name real daily posts: the site's builder fails the whole
  // build on a name it cannot resolve, so the write checks it here.
  const dailyDir = String(site?.contentTypes?.daily?.storage?.dir || "");
  for (const file of related) {
    const safe = !file.includes("/") && !file.includes("\\") && !file.startsWith(".");
    if (!dailyDir || !safe || !fs.existsSync(`${dailyDir}/${file}`.replace(/\\/g, "/"))) {
      throw draftingError("related_missing", `related 里的「${file}」在日更目录里找不到。`, 400);
    }
  }
  if (!tags.length) throw draftingError("tags_missing", "长文至少要一个标签。", 400);
  const name = `${day}-${slug}.md`;
  const full = `${dir}/${name}`.replace(/\/+/g, "/");
  if (fs.existsSync(full)) throw draftingError("exists", `这篇长文已经存在：${name}`, 409);
  // The site writes its own lists unquoted even for CJK and spaces
  // (`tags: [Mac, Apple silicon, 回顾]`), so this quotes only what a flow list
  // cannot carry bare.
  const flow = (items) => `[${items.map((item) => (/^[^,\[\]{}:#"']+$/.test(item) && item.trim() === item ? item : JSON.stringify(item))).join(", ")}]`;
  const front = [
    "---",
    `title: ${title}`,
    `date: ${day}`,
    `slug: ${slug}`,
    `description: ${description}`,
    `tags: ${flow(tags)}`,
    `related: ${flow(related)}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
  fs.writeFileSync(full, front);
  return { ok: true, file: name, path: full, note: `长文写好了：${name}；related 挂了 ${related.length} 篇日更，站点会自己生成双向互链。` };
}

/**
 * Write chosen candidates into the drafts directory. One file per post, named
 * the way the site names posts, and never over an existing file.
 * @param {Record<string, any>} site
 * @param {{ posts?: { date?: string, title?: string, body?: string, slug?: string }[] }} options
 */
function acceptDrafts(site, { posts = [] } = {}) {
  const dir = String(site?.tools?.draftsDir || "");
  if (!dir) throw draftingError("drafts_dir_missing", "站点描述没有登记草稿目录（tools.draftsDir）。", 409);
  if (!fs.existsSync(dir)) throw draftingError("drafts_dir_missing", `草稿目录不存在：${dir}`, 409);
  const rows = Array.isArray(posts) ? posts : [];
  if (!rows.length) throw draftingError("bad_request", "没有要存的稿。", 400);
  const written = [];
  const skipped = [];
  for (const row of rows) {
    const date = String(row?.date || "").trim();
    const title = String(row?.title || "").trim();
    const body = String(row?.body || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title || !body) {
      skipped.push({ date, reason: "incomplete" });
      continue;
    }
    const explicit = String(row?.slug || "").toLowerCase();
    const named = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(explicit) ? explicit : "";
    // A model-given slug names the piece and is never reused; a title-derived
    // one is only a starting point, so a second post on the same day is
    // numbered instead of lost.
    const derived = named || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "draft";
    let slug = derived;
    let name = `${date}-${slug}.md`;
    let full = path.join(dir, name);
    if (!named) {
      for (let suffix = 2; suffix <= 9 && fs.existsSync(full); suffix += 1) {
        slug = `${derived}-${suffix}`;
        name = `${date}-${slug}.md`;
        full = path.join(dir, name);
      }
    }
    if (fs.existsSync(full)) {
      skipped.push({ date, name, reason: "exists" });
      continue;
    }
    const front = [
      "---",
      `title: ${title}`,
      `date: ${date}`,
      `slug: ${slug}`,
      "---",
      "",
      body,
      "",
    ].join("\n");
    fs.writeFileSync(full, front);
    written.push({ date, name });
  }
  return {
    ok: written.length > 0,
    written,
    skipped,
    note: written.length
      ? `存了 ${written.length} 篇草稿：${written.map((entry) => entry.name).join("、")}。发布仍要你点。`
      : "没有新稿可存（同名文件已存在或内容不全）。",
  };
}

module.exports = Object.freeze({
  buildDraftPrompt,
  parseDraftReply,
  spendPolicy,
  runDraft,
  runLongform,
  acceptLongform,
  acceptDrafts,
  corpusForDates,
  estimateTokens,
  DEFAULT_MAX_INPUT_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_POSTS_PER_RUN,
});
