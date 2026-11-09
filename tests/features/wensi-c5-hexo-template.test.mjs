// 文思泉涌 P7 · the Hexo site-description template.
//
// The template is data, not a channel branch: filling it with four answers must
// produce an ordinary git-static description that the one validator accepts.
// The assertions pin the things that differ from this project's own sites —
// source/_posts, source/_drafts, the <slug>.md filename, Hexo's default
// permalink and the categories/tags front-matter keys — so a template edit
// cannot quietly borrow aaronlau's layout.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c5-hexo-template");

const descriptions = require("../../apps/server/server/lib/blog-sites/description.js");
const templates = require("../../apps/server/server/lib/blog-sites/site-template.js");

const scratch = mkdtempSync(join(tmpdir(), "wensi-hexo-template-"));
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";

/** Every {{name}} in a value, in source order. */
function placeholders(value, found = []) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\{\{([A-Za-z][A-Za-z0-9-]*)\}\}/g)) found.push(match[1]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => placeholders(item, found));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => placeholders(item, found));
  }
  return found;
}

try {
  // ---- The template is listed, and its questions are exactly its placeholders. ----

  const listed = templates.listTemplates();
  test.assert(listed.errors.length === 0, `templates load without errors (${JSON.stringify(listed.errors)})`);
  const hexoMeta = listed.templates.find((entry) => entry.id === "hexo");
  test.assert(Boolean(hexoMeta), "the hexo template is listed");
  const answerKeys = (hexoMeta?.answers || []).map((answer) => answer.key).sort();
  test.assert(JSON.stringify(answerKeys) === JSON.stringify(["id", "label", "root", "siteUrl"]),
    "the wizard asks for id, label, root and the optional site URL");

  const loaded = templates.loadTemplate("hexo");
  test.assert(loaded.ok, "the hexo template file loads");
  const body = JSON.parse(JSON.stringify(loaded.template));
  delete body._template;
  const used = [...new Set(placeholders(body))].sort();
  test.assert(JSON.stringify(used) === JSON.stringify(answerKeys),
    `every placeholder has a question and every question is used (${JSON.stringify(used)})`);

  // ---- Filling it produces a valid, ordinary git-static description. ----

  const siteRoot = join(scratch, "hexo-site");
  mkdirSync(join(siteRoot, "source", "_posts"), { recursive: true });
  const filled = templates.instantiateTemplate("hexo", {
    id: "probe-hexo",
    label: "Probe Hexo",
    root: `${siteRoot}/`,
    siteUrl: "https://probe.example.test",
  });
  test.assert(filled.ok, `the filled template validates (${filled.ok ? "" : JSON.stringify(filled)})`);

  const site = filled.ok ? filled.description : {};
  test.assert(site.schema === 1 && site.id === "probe-hexo" && site.label === "Probe Hexo",
    "id and label are the writer's answers");
  test.assert(site.channel?.kind === "git-static",
    "the template fills an ordinary git-static channel (no new channel kind)");
  test.assert(site.channel?.root === normalize(siteRoot),
    "the root is normalized to an absolute path (a trailing slash does not reach the paths)");
  test.assert(site._template === undefined, "the template metadata never leaks into the description");

  const posts = site.contentTypes?.posts || {};
  test.assert(posts.storage?.kind === "file-per"
    && posts.storage?.dir === join(normalize(siteRoot), "source", "_posts")
    && posts.storage?.filename === "<slug>.md",
    "Hexo posts live one file per article in source/_posts, named by slug");
  test.assert(posts.draftRule?.kind === "draft-dir"
    && posts.draftRule?.dir === join(normalize(siteRoot), "source", "_drafts"),
    "Hexo drafts live in source/_drafts (the draft-directory rule)");
  test.assert(posts.url?.single === "{year}/{month}/{day}/{slug}/",
    "the default permalink is Hexo's year/month/day/slug address");
  test.assert(site.media?.dir === join(normalize(siteRoot), "source", "images")
    && site.media?.urlPrefix === "/images/",
    "media defaults to Hexo's source/images");

  const fieldKeys = (posts.fields || []).map((field) => field.key);
  test.assert(["title", "date", "updated", "slug", "categories", "tags"].every((key) => fieldKeys.includes(key)),
    "the front matter uses Hexo's keys (title, date, updated, slug, categories, tags)");
  test.assert(!fieldKeys.includes("cats") && !fieldKeys.includes("seriesNo"),
    "appscope's site-specific keys are not copied into the generic template");
  test.assert(site.channel?.checkUrl === "https://probe.example.test",
    "the optional site URL becomes the publish confirmation address");

  const verdict = descriptions.validateSiteDescription(site);
  test.assert(verdict.ok, `the one validator accepts the filled description (${JSON.stringify(verdict.errors)})`);

  // ---- Optional answers disappear instead of becoming empty required fields. ----

  const withoutUrl = templates.instantiateTemplate("hexo", {
    id: "probe-hexo-2",
    label: "Probe Hexo 2",
    root: siteRoot,
  });
  test.assert(withoutUrl.ok, "the site URL is genuinely optional");
  test.assert(withoutUrl.ok && !("checkUrl" in withoutUrl.description.channel),
    "an omitted site URL removes checkUrl rather than leaving an empty string");

  // ---- Refusals have names. ----

  const missingRoot = templates.instantiateTemplate("hexo", { id: "probe", label: "Probe" });
  test.assert(!missingRoot.ok && missingRoot.code === "template_answer_missing"
    && missingRoot.error.includes("根目录"), `a missing root is named (${missingRoot.code})`);

  const relativeRoot = templates.instantiateTemplate("hexo", { id: "probe", label: "Probe", root: "blog" });
  test.assert(!relativeRoot.ok && relativeRoot.code === "template_root_not_absolute",
    "a relative root is refused (grants resolve from absolute trees)");

  const badId = templates.instantiateTemplate("hexo", { id: "Probe Hexo", label: "Probe", root: siteRoot });
  test.assert(!badId.ok && badId.code === "template_id_invalid",
    "an id outside the path pattern is refused before it becomes a file name");

  const badUrl = templates.instantiateTemplate("hexo", { id: "probe", label: "Probe", root: siteRoot, siteUrl: "probe.example.test" });
  test.assert(!badUrl.ok && badUrl.code === "template_site_url_invalid",
    "a site URL without http(s) is refused");

  const unknown = templates.instantiateTemplate("no-such-template", {});
  test.assert(!unknown.ok && unknown.code === "template_unknown", "an unknown template id is refused");

  const traversal = templates.instantiateTemplate("../hexo", {});
  test.assert(!traversal.ok && traversal.code === "template_unknown",
    "a path-shaped id cannot walk out of the templates directory");

  let placeholderCode = "";
  try {
    templates.substitute({ checkUrl: "{{no-such-answer}}" }, { id: "x" });
  } catch (error) {
    placeholderCode = String(error?.code || "");
  }
  test.assert(placeholderCode === "template_placeholder_unknown",
    "a template placeholder with no question fails loudly, not with an empty string");

  // ---- The template is not itself served as a site, and a filled one is. ----

  const agentHome = join(scratch, "agent-home");
  mkdirSync(join(agentHome, "site-descriptions"), { recursive: true });
  process.env.AI_SYSTEM6_AGENT_HOME = agentHome;

  const bare = descriptions.loadSiteDescriptions();
  test.assert(bare.errors.length === 0, `the template directory adds no site-description errors (${JSON.stringify(bare.errors)})`);
  test.assert(!bare.sites.some((entry) => entry.id === "hexo"),
    "templates/hexo.json is not served as a site (the loader reads the directory's own files)");
  test.assert(descriptions.getSiteDescription("hexo") === null, "getSiteDescription does not resolve a template as a site");

  writeFileSync(join(agentHome, "site-descriptions", "probe-hexo.json"), JSON.stringify(site));
  const served = descriptions.getSiteDescription("probe-hexo");
  test.assert(served?.id === "probe-hexo"
    && served?.contentTypes?.posts?.storage?.dir === join(normalize(siteRoot), "source", "_posts"),
    "a filled template written to the agent's site-descriptions directory is served as a site");
} finally {
  delete process.env.AI_SYSTEM6_AGENT_HOME;
  delete process.env.AI_SYSTEM6_AGENT_ALLOW_TMP;
  rmSync(scratch, { recursive: true, force: true });
}

test.finish();
