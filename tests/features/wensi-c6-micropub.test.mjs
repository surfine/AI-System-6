// 文思泉涌 P7 · the Micropub publish channel.
//
// A local http server stands in for the site: no request leaves this machine.
// The contract pins the form body (create vs update), the token discipline (the
// token goes in the Authorization header and appears nowhere in a plan, a
// result or an error), the unconfirmed-publish honesty (a POST with no
// Location is a refusal, a poll timeout is "deployed but not confirmed"), and
// the ledger that makes the second publish an update.

import http from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c6-micropub");

const micropub = require("../../apps/server/server/lib/blog-sites/micropub.js");
const ledger = require("../../apps/server/server/lib/blog-sites/publish-ledger.js");
const descriptions = require("../../apps/server/server/lib/blog-sites/description.js");

const scratch = mkdtempSync(join(tmpdir(), "wensi-micropub-"));
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
process.env.AI_SYSTEM6_AGENT_HOME = join(scratch, "agent-home");
const postsDir = join(scratch, "site", "posts");
mkdirSync(postsDir, { recursive: true });

// ---- A site whose publish half is Micropub; the content half is a local tree. ----

let stub = {
  post: () => ({ status: 201, headers: {}, text: "" }),
  get: () => ({ status: 200, text: "<h1>一篇探针</h1>" }),
};
/** @type {{ method: string, url: string, headers: Record<string, any>, body: string }[]} */
const requests = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: String(req.method || ""), url: String(req.url || ""), headers: req.headers, body });
    const answer = req.method === "POST" ? stub.post(req, body) : stub.get(req, body);
    res.statusCode = answer.status;
    for (const [name, value] of Object.entries(answer.headers || {})) res.setHeader(name, String(value));
    res.end(answer.text || "");
  });
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = /** @type {any} */ (server.address()).port;
const baseUrl = `http://127.0.0.1:${port}`;

const site = {
  schema: 1,
  id: "micropub-probe",
  label: "Micropub probe",
  channel: {
    kind: "git-static",
    root: join(scratch, "site"),
    micropub: {
      endpoint: `${baseUrl}/micropub`,
      features: ["series"],
      pollSeconds: 1,
    },
  },
  contentTypes: {
    posts: {
      label: "文章",
      storage: { kind: "file-per", dir: postsDir, filename: "<slug>.md" },
      fields: [
        { key: "title", type: "string", required: true },
        { key: "date", type: "date", required: true },
        { key: "slug", type: "slug", required: true },
        { key: "categories", type: "tags" },
        { key: "tags", type: "tags" },
        { key: "series", type: "string" },
      ],
      url: { single: "{slug}/" },
      editor: "markdown",
    },
  },
};

const article = {
  type: "posts",
  path: "a-post.md",
  filename: "a-post.md",
  status: "published",
  frontMatter: {
    title: "一篇探针",
    date: "2026-11-09 10:00:00",
    slug: "a-post",
    categories: ["随笔"],
    tags: ["测试", "随笔"],
    series: "连载",
    seriesNo: "2",
  },
  body: "正文第一行。\n\n第二段。",
};

/** @param {string} form */
function fields(form) {
  return new URLSearchParams(form);
}

try {
  // ---- The description's Micropub section is closed. ----

  const base = () => JSON.parse(JSON.stringify(site));
  const insecure = base();
  insecure.channel.micropub.endpoint = "http://example.com/micropub";
  test.assert(!descriptions.validateSiteDescription(insecure).ok,
    "a non-loopback http endpoint is refused (an outward address is https)");
  const loopback = base();
  loopback.channel.micropub.endpoint = "http://127.0.0.1:9999/micropub";
  test.assert(descriptions.validateSiteDescription(loopback).ok,
    "a loopback http endpoint is allowed for a local stub");
  const unknownFeature = base();
  unknownFeature.channel.micropub.features = ["nope"];
  test.assert(!descriptions.validateSiteDescription(unknownFeature).ok,
    "an unknown Micropub feature is refused, not silently ignored");
  const badPoll = base();
  badPoll.channel.micropub.pollSeconds = 601;
  test.assert(!descriptions.validateSiteDescription(badPoll).ok,
    "pollSeconds is bounded to ten minutes");

  // ---- The form: create and update carry the same article differently. ----

  const createForm = fields(micropub.buildForm(site, "posts", article, "create"));
  test.assert(createForm.get("h") === "entry", "create names h=entry");
  test.assert(createForm.get("name") === "一篇探针", "the title is the name property");
  test.assert(createForm.get("content") === article.body, "the body is sent verbatim as content");
  test.assert(createForm.get("published") === "2026-11-09T10:00:00",
    "Hexo's date space becomes the ISO separator without guessing a timezone");
  test.assert(createForm.get("post-status") === "published", "a published article says post-status=published");
  test.assert(createForm.get("mp-slug") === "a-post", "the slug controls the site's mp-slug");
  const slugNamed = JSON.parse(JSON.stringify(site));
  slugNamed.channel.micropub.slugProperty = "slug";
  test.assert(fields(micropub.buildForm(slugNamed, "posts", article, "create")).get("slug") === "a-post"
    && !fields(micropub.buildForm(slugNamed, "posts", article, "create")).has("mp-slug"),
    "slugProperty slug writes the slug field instead of mp-slug");
  const badSlug = JSON.parse(JSON.stringify(site));
  badSlug.channel.micropub.slugProperty = "post_name";
  test.assert(!descriptions.validateSiteDescription(badSlug).ok,
    "a slug property outside mp-slug and slug is refused");
  test.assert(createForm.getAll("category[]").join("|") === "随笔|测试",
    "categories and tags both become Micropub categories, deduped");
  test.assert(createForm.get("series") === "连载" && createForm.get("series-no") === "2",
    "declared extensions are sent");

  const plainSite = { ...site, channel: { ...site.channel, micropub: { endpoint: site.channel.micropub.endpoint } } };
  const plainForm = fields(micropub.buildForm(plainSite, "posts", article, "create"));
  test.assert(!plainForm.has("series") && !plainForm.has("series-no"),
    "an extension is never sent unless the site declares it");

  const updateForm = fields(micropub.buildForm(site, "posts", article, "update", `${baseUrl}/posts/a-post/`));
  test.assert(updateForm.get("action") === "update" && updateForm.get("url") === `${baseUrl}/posts/a-post/`,
    "update names the action and the existing URL");
  test.assert(updateForm.get("replace[name][]") === "一篇探针"
    && updateForm.get("replace[content][]") === article.body
    && updateForm.getAll("replace[category][]").join("|") === "随笔|测试",
    "update replaces properties rather than adding anonymous ones");
  test.assert(!updateForm.has("h"), "update does not send h=entry");

  // ---- The plan is read-only and names every reason not to publish. ----

  const noToken = await micropub.planPublish(site, "posts", "a-post.md", { article });
  test.assert(!noToken.ok && noToken.blockers.some((blocker) => blocker.code === "micropub_token_missing"),
    "a missing token is a named blocker");

  const noArticle = await micropub.planPublish(site, "posts", "a-post.md", { tokenConfigured: true });
  test.assert(noArticle.blockers.some((blocker) => blocker.code === "article_missing"),
    "publishing without a saved article is refused by name");

  const plan = await micropub.planPublish(site, "posts", "a-post.md", {
    article,
    tokenConfigured: true,
    ledgerEntry: null,
  });
  test.assert(plan.ok && plan.action === "create" && plan.channel === "micropub",
    "a first publish is a create");
  test.assert(plan.willRun.includes("micropub-post") && plan.willWrite.length === 1,
    "the plan says what runs and the one thing written (the local ledger)");
  test.assert(!JSON.stringify(plan).includes("secret-token"),
    "the plan never carries a token");

  const updatePlan = await micropub.planPublish(site, "posts", "a-post.md", {
    article,
    tokenConfigured: true,
    ledgerEntry: { url: `${baseUrl}/posts/a-post/` },
  });
  test.assert(updatePlan.action === "update", "a ledger entry turns the publish into an update");

  const brokenPlan = await micropub.planPublish(site, "posts", "a-post.md", {
    article,
    tokenConfigured: true,
    ledgerFailure: { code: "ledger_unreadable", error: "台账坏了" },
  });
  test.assert(brokenPlan.blockers.some((blocker) => blocker.code === "micropub_ledger_unreadable"),
    "a corrupt ledger blocks instead of guessing");

  // ---- slug-check, when declared: a conflict blocks, an unknown shape warns. ----

  const slugSite = JSON.parse(JSON.stringify(site));
  slugSite.channel.micropub.features = ["slug-check"];
  stub.get = () => ({ status: 200, headers: { "Content-Type": "application/json" }, text: JSON.stringify({ available: false, conflicts: ["a-post"] }) });
  const conflictPlan = await micropub.planPublish(slugSite, "posts", "a-post.md", { article, tokenConfigured: true });
  test.assert(conflictPlan.blockers.some((blocker) => blocker.code === "micropub_slug_conflict"),
    "a slug-check conflict blocks with the conflicting item");
  stub.get = () => ({ status: 200, headers: { "Content-Type": "application/json" }, text: JSON.stringify({ ok: true }) });
  const unknownShapePlan = await micropub.planPublish(slugSite, "posts", "a-post.md", { article, tokenConfigured: true });
  test.assert(unknownShapePlan.warnings.some((warning) => warning.code === "micropub_slug_check_unconfirmed")
    && !unknownShapePlan.blockers.some((blocker) => blocker.code === "micropub_slug_conflict"),
    "an unrecognized slug-check answer is a warning, never a false 'available'");

  // ---- Deploy: create, confirm, then update. ----

  const token = "secret-token-value";
  stub = {
    post: () => ({ status: 201, headers: { Location: `${baseUrl}/posts/a-post/` }, text: "" }),
    get: () => ({ status: 200, text: "<h1>一篇探针</h1>" }),
  };
  requests.length = 0;
  const first = await micropub.deploy(site, "posts", "a-post.md", article, { token, pollMs: 200 });
  test.assert(first.ok && first.deployed && first.verified && first.action === "create",
    "a 201 with Location and a matching page is a verified create");
  test.assert(first.url === `${baseUrl}/posts/a-post/`, "the live URL comes from Location");
  test.assert(!JSON.stringify(first).includes(token), "the result never carries the token");
  test.assert(requests[0]?.headers?.authorization === `Bearer ${token}`,
    "the token travels in the Authorization header");
  const entry = ledger.entryFor("micropub-probe", "posts", "a-post.md");
  test.assert(entry.ok && entry.entry?.url === `${baseUrl}/posts/a-post/`,
    "the ledger records the URL the site returned");

  requests.length = 0;
  stub.post = () => ({ status: 204, headers: {}, text: "" });
  const second = await micropub.deploy(site, "posts", "a-post.md", article, { token, pollMs: 200 });
  test.assert(second.ok && second.action === "update", "the second publish is an update");
  const secondForm = fields(requests[0]?.body || "");
  test.assert(secondForm.get("action") === "update" && secondForm.get("url") === `${baseUrl}/posts/a-post/`,
    "the update names the URL the ledger remembered");

  // ---- Refusals: no Location, an error response, no network, no confirmation. ----

  const freshSite = { ...site, id: "micropub-fresh" };
  stub.post = () => ({ status: 201, headers: {}, text: "" });
  let noLocation = null;
  try {
    await micropub.deploy(freshSite, "posts", "a-post.md", article, { token, pollMs: 50 });
  } catch (error) {
    noLocation = error;
  }
  test.assert(noLocation?.code === "micropub_no_location",
    "a create without Location is refused (the URL cannot be guessed)");

  stub.post = () => ({ status: 500, headers: {}, text: `boom ${token}` });
  let httpError = null;
  try {
    await micropub.deploy(freshSite, "posts", "a-post.md", article, { token, pollMs: 50 });
  } catch (error) {
    httpError = error;
  }
  test.assert(httpError?.code === "micropub_http_500", "a non-2xx endpoint answer is named by status");
  test.assert(httpError && !String(httpError.message).includes(token) && String(httpError.message).includes("[redacted]"),
    "the token is redacted even when the server echoes it");

  let networkError = null;
  try {
    await micropub.deploy(freshSite, "posts", "a-post.md", article, {
      token,
      fetchImpl: async () => { throw new Error("offline"); },
      pollMs: 50,
    });
  } catch (error) {
    networkError = error;
  }
  test.assert(networkError?.code === "micropub_network", "a network failure is named, with the endpoint and no token");

  stub.post = () => ({ status: 201, headers: { Location: `${baseUrl}/posts/unconfirmed/` }, text: "" });
  stub.get = () => ({ status: 404, text: "not yet" });
  const unconfirmed = await micropub.deploy({ ...site, id: "micropub-unconfirmed" }, "posts", "a-post.md", article, { token, pollMs: 100 });
  test.assert(!unconfirmed.ok && unconfirmed.deployed === true && unconfirmed.verified === false,
    "a publish that is not yet visible is deployed-but-unconfirmed, not a failure and not a success");
  test.assert(unconfirmed.note.includes("不要重发"), "the unconfirmed note tells the writer not to re-send");

  // A stored draft is the repository's file, not a public page. Polling the
  // Location would 404, so the desk records the ledger and stops.
  const draftSite = { ...site, id: "micropub-stored-draft" };
  const getsBefore = requests.filter((entry) => entry.method === "GET").length;
  stub.post = () => ({
    status: 202,
    headers: { Location: `${baseUrl}/_drafts/a-post.html` },
    text: JSON.stringify({ stored: true, path: "source/_drafts/a-post.md", commit: "abc123" }),
  });
  stub.get = () => ({ status: 404, text: "drafts are not rendered" });
  const storedDraft = await micropub.deploy(draftSite, "posts", "a-post.md", { ...article, status: "draft" }, { token, pollMs: 50 });
  test.assert(storedDraft.ok && storedDraft.stored === true && storedDraft.verified === true
    && storedDraft.path === "source/_drafts/a-post.md",
    "stored:true records the draft and does not wait for a public page");
  test.assert(requests.filter((entry) => entry.method === "GET").length === getsBefore,
    "a stored draft is not polled");
  test.assert(!JSON.stringify(storedDraft).includes(token), "the stored-draft result hides the token");

  const getsBeforeQueued = requests.filter((entry) => entry.method === "GET").length;
  stub.post = () => ({
    status: 202,
    headers: { Location: `${baseUrl}/notice/a-post.html` },
    text: JSON.stringify({ accepted: "published", path: "source/_posts/a-post.md", commit: "abc123", build: "queued" }),
  });
  stub.get = () => ({ status: 404, text: "not yet" });
  const queued = await micropub.deploy({ ...site, id: "micropub-queued" }, "posts", "a-post.md", article, { token, pollMs: 50 });
  test.assert(!queued.ok && queued.deployed === true && queued.verified === false
    && queued.note.includes("不要重发"),
    "a queued publish is recorded, then the public page is checked");
  test.assert(requests.filter((entry) => entry.method === "GET").length > getsBeforeQueued,
    "a queued publish polls the public page");

  // ---- The ledger refuses to be guessed when it is corrupt. ----

  const corruptHome = join(scratch, "agent-home");
  mkdirSync(join(corruptHome, "publish-ledger"), { recursive: true });
  writeFileSync(join(corruptHome, "publish-ledger", "micropub-probe.json"), "{ not json");
  let corrupt = null;
  try {
    await micropub.deploy(site, "posts", "a-post.md", article, { token, pollMs: 50 });
  } catch (error) {
    corrupt = error;
  }
  test.assert(corrupt?.code === "micropub_ledger_unreadable",
    "a corrupt ledger refuses the publish instead of creating a duplicate");

  // ---- The ledger caps itself by dropping the oldest entries. ----

  const many = {};
  for (let index = 0; index < ledger.MAX_ENTRIES + 1; index += 1) {
    many[`posts:${String(index).padStart(4, "0")}.md`] = {
      url: `${baseUrl}/${index}`,
      action: "create",
      publishedAt: new Date(2020, 0, 1 + index).toISOString(),
    };
  }
  writeFileSync(join(corruptHome, "publish-ledger", "micropub-many.json"), JSON.stringify({ entries: many }));
  const capped = ledger.recordPublish("micropub-many", "posts", "new.md", {
    url: `${baseUrl}/new`,
    action: "create",
    publishedAt: new Date(2030, 0, 1).toISOString(),
  });
  test.assert(capped.ok, "recording past the cap still succeeds");
  const cappedRead = ledger.readLedger("micropub-many");
  test.assert(cappedRead.ok && Object.keys(cappedRead.entries).length === ledger.MAX_ENTRIES,
    `the ledger keeps at most ${ledger.MAX_ENTRIES} entries`);
  test.assert(cappedRead.ok && !cappedRead.entries["posts:0000.md"],
    "the oldest entry is the one dropped");
  test.assert(cappedRead.ok && cappedRead.entries["posts:new.md"]?.url === `${baseUrl}/new`,
    "the new entry is kept");

  // ---- Media: multipart to the media endpoint, then the entry uses that URL. ----

  const mediaSite = JSON.parse(JSON.stringify(site));
  mediaSite.id = "micropub-media";
  mediaSite.channel.micropub.mediaEndpoint = `${baseUrl}/media`;
  const mediaArticle = {
    ...article,
    body: "看这张 ![pic](pic.png)",
    media: [{
      filename: "pic.png",
      contentType: "image/png",
      dataBase64: Buffer.from("png-bytes").toString("base64"),
      source: "pic.png",
    }],
  };
  const mediaPlan = await micropub.planPublish(mediaSite, "posts", "media.md", {
    article: mediaArticle,
    tokenConfigured: true,
  });
  test.assert(mediaPlan.willUpload.join("|") === "pic.png"
    && mediaPlan.willRun[0] === "micropub-media",
    "the plan names the image and uploads it before the entry");
  test.assert(!JSON.stringify(mediaPlan).includes(token), "the media plan never carries a token");

  const seen = [];
  /** @type {string} */
  let mediaBody = "";
  /** @type {string} */
  let mediaType = "";
  stub.post = (req, body) => {
    seen.push(String(req.url || ""));
    if (String(req.url || "").startsWith("/media")) {
      mediaBody = body;
      mediaType = String(req.headers["content-type"] || "");
      return { status: 201, headers: { Location: `${baseUrl}/images/pic.png` }, text: "" };
    }
    return { status: 201, headers: { Location: `${baseUrl}/posts/with-pic/` }, text: "" };
  };
  stub.get = () => ({ status: 200, text: "<h1>一篇探针</h1>" });
  requests.length = 0;
  const withPic = await micropub.deploy(mediaSite, "posts", "media.md", mediaArticle, { token, pollMs: 200 });
  test.assert(mediaType.includes("multipart/form-data"), "the media request is multipart");
  test.assert(mediaBody.includes('name="file"') && mediaBody.includes('filename="pic.png"'),
    "the file part is named file and keeps the filename");
  test.assert(!mediaBody.includes(token), "the multipart body does not contain the token");
  test.assert(seen[0] === "/media" && seen[1] === "/micropub",
    "the image is uploaded before the entry is posted");
  const posted = fields(requests.find((entry) => entry.url === "/micropub")?.body || "");
  test.assert(posted.get("content").includes(`${baseUrl}/images/pic.png`)
    && !posted.get("content").includes("](pic.png)"),
    "the entry content uses the uploaded address");
  test.assert(withPic.ok && !JSON.stringify(withPic).includes(token),
    "a media publish confirms and still hides the token");

  stub.post = (req) => {
    seen.push(`fail:${req.url}`);
    return { status: 500, headers: {}, text: "no" };
  };
  seen.length = 0;
  let mediaFailed = null;
  try {
    await micropub.deploy(mediaSite, "posts", "media-fail.md", mediaArticle, { token, pollMs: 50 });
  } catch (error) {
    mediaFailed = error;
  }
  test.assert(mediaFailed?.code === "micropub_media_http_500",
    "a media error is named and stops the entry");
  test.assert(seen.length === 1 && seen[0] === "fail:/media",
    "a failed upload does not post the entry");
  test.assert(!String(mediaFailed?.message || "").includes(token),
    "a media error does not echo the token");
} finally {
  await new Promise((done) => server.close(done));
  delete process.env.AI_SYSTEM6_AGENT_HOME;
  delete process.env.AI_SYSTEM6_AGENT_ALLOW_TMP;
  rmSync(scratch, { recursive: true, force: true });
}

test.finish();
