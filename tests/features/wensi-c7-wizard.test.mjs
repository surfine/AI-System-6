// 文思泉涌 P7 · 添加站点 (the wizard's server half).
//
// The wizard writes one file into the agent's own site-descriptions directory,
// and only after the description validates. A missing folder grant is a
// receipt with a next step, not a refusal: sharing happens in the system
// Chooser. The Micropub branch is exercised without touching the Keychain —
// only the missing-token refusal and the plan's blockers are asserted.

import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c7-wizard");

const route = require("../../apps/server/server/routes/wensi-quanyong.js");
const descriptions = require("../../apps/server/server/lib/blog-sites/description.js");
const folders = require("../../apps/server/server/agent/folders.js");

const scratch = mkdtempSync(join(tmpdir(), "wensi-wizard-"));
process.env.AI_SYSTEM6_AGENT_ALLOW_TMP = "1";
process.env.AI_SYSTEM6_AGENT_HOME = join(scratch, "agent-home");
mkdirSync(join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions"), { recursive: true });
const siteRoot = join(scratch, "hexo-site");
mkdirSync(join(siteRoot, "source", "_posts"), { recursive: true });

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
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode || 0,
          body: text,
          json: (() => {
            try {
              return JSON.parse(text);
            } catch {
              return null;
            }
          })(),
        });
      });
    });
    req.once("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

try {
  const { server, port } = await startServer();
  try {
    // ---- The template list is what the form is built from. ----

    const templates = await request(port, "GET", "/api/wensi-quanyong/sites/templates");
    test.assert(templates.status === 200 && templates.json?.templates?.some((entry) => entry.id === "hexo"),
      "GET /sites/templates lists the Hexo template");
    const hexo = templates.json.templates.find((entry) => entry.id === "hexo");
    test.assert(["id", "label", "root", "siteUrl"].every((key) => hexo.answers.some((answer) => answer.key === key)),
      "the template says which answers the wizard asks for");

    // ---- A dry run validates and reports grants without writing. ----

    const payload = {
      template: "hexo",
      answers: { id: "probe-hexo", label: "Probe Hexo", root: siteRoot, siteUrl: "https://probe.example.test" },
      overrides: {
        contentTypes: {
          posts: {
            label: "文章",
            storage: { dir: join(siteRoot, "source", "_posts"), filename: "<slug>.md" },
            url: { single: "{year}/{month}/{day}/{slug}/", dedupe: "existing" },
          },
        },
        media: { dir: join(siteRoot, "source", "images"), urlPrefix: "/images/" },
      },
      dryRun: true,
    };
    const dry = await request(port, "POST", "/api/wensi-quanyong/sites", payload);
    test.assert(dry.status === 200 && dry.json?.ok === true && dry.json?.dryRun === true,
      "a dry run answers ok and says it was a dry run");
    test.assert(dry.json?.file === "", "a dry run names no file");
    test.assert(dry.json?.description?.channel?.kind === "git-static"
      && dry.json.description.contentTypes.posts.storage.dir === join(siteRoot, "source", "_posts")
      && dry.json.description.media.dir === join(siteRoot, "source", "images"),
      "the overrides land in the description the wizard shows");
    test.assert(!existsSync(join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions", "probe-hexo.json")),
      "a dry run writes nothing");
    test.assert(dry.json.grants.every((grant) => !grant.read && !grant.change),
      "without a shared folder every grant is reported missing");
    test.assert(dry.json.next.some((step) => step.includes("共享")),
      "the next step names sharing the directory");

    // ---- Sharing the root turns the grants on; the real write lands. ----

    folders.grantFolder(siteRoot, "change", "blog-site");
    const shared = await request(port, "POST", "/api/wensi-quanyong/sites", { ...payload, dryRun: true });
    test.assert(shared.json.grants.every((grant) => grant.read && grant.change),
      "a change-level grant over the root covers every directory the description names");
    test.assert(!shared.json.next.some((step) => step.includes("共享")),
      "the sharing step disappears once the grant exists");

    const created = await request(port, "POST", "/api/wensi-quanyong/sites", { ...payload, dryRun: false });
    test.assert(created.status === 200 && created.json?.ok === true && created.json?.file?.endsWith("probe-hexo.json"),
      "the real write names the file it wrote");
    test.assert(existsSync(join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions", "probe-hexo.json")),
      "the description is on disk");
    const served = descriptions.getSiteDescription("probe-hexo");
    test.assert(served?.id === "probe-hexo" && served?.builtin === false
      && served?.contentTypes?.posts?.draftRule?.kind === "draft-dir",
      "the written description is served as an ordinary non-builtin site");

    // ---- Refusals have names and never write. ----

    const duplicate = await request(port, "POST", "/api/wensi-quanyong/sites", { ...payload, dryRun: false });
    test.assert(duplicate.status === 409 && duplicate.json?.code === "site_exists",
      "a second description with the same id is refused");

    const invalid = await request(port, "POST", "/api/wensi-quanyong/sites", {
      description: { schema: 1, id: "bad-site" },
      dryRun: false,
    });
    test.assert(invalid.status === 400 && invalid.json?.code === "description_invalid"
      && Array.isArray(invalid.json.errors) && invalid.json.errors.length > 0,
      "an invalid raw description is refused with every error");
    test.assert(!existsSync(join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions", "bad-site.json")),
      "an invalid description is never written");

    const missingRoot = await request(port, "POST", "/api/wensi-quanyong/sites", {
      template: "hexo",
      answers: { id: "no-root", label: "No root" },
      dryRun: true,
    });
    test.assert(missingRoot.status === 400 && missingRoot.json?.code === "template_answer_missing",
      "a template answer still required is named");

    // ---- The Micropub branch: endpoint, token status, plan blockers. ----

    const micropubDescription = JSON.parse(JSON.stringify(dry.json.description));
    micropubDescription.id = "probe-mp";
    micropubDescription.label = "Probe Micropub";
    micropubDescription.channel.micropub = { endpoint: "http://127.0.0.1:1/micropub", features: ["series"] };
    const mpCreated = await request(port, "POST", "/api/wensi-quanyong/sites", {
      description: micropubDescription,
      dryRun: false,
    });
    test.assert(mpCreated.status === 200 && mpCreated.json?.ok === true,
      "a Micropub description is created through the same write");
    test.assert(mpCreated.json.next.some((step) => step.includes("/micropub/token")),
      "the receipt names the token door");

    const status = await request(port, "GET", "/api/wensi-quanyong/sites/probe-mp/micropub");
    test.assert(status.status === 200 && status.json?.endpoint === "http://127.0.0.1:1/micropub"
      && status.json?.tokenConfigured === false,
      "the status route answers the endpoint and whether a token is stored");
    test.assert(!JSON.stringify(status.json).includes("Bearer"),
      "the status route never carries a token");

    const plan = await request(port, "POST", "/api/wensi-quanyong/sites/probe-mp/publish", {
      type: "posts",
      path: "",
      stage: "plan",
    });
    test.assert(plan.status === 200 && plan.json?.channel === "micropub"
      && plan.json.blockers.some((blocker) => blocker.code === "micropub_token_missing")
      && plan.json.blockers.some((blocker) => blocker.code === "article_missing"),
      "the Micropub plan names both the missing token and the missing saved article");
    test.assert(!JSON.stringify(plan.json).includes("secret"), "the plan never carries a token");

    const unconfirmed = await request(port, "POST", "/api/wensi-quanyong/sites/probe-mp/publish", {
      type: "posts",
      path: "",
      stage: "deploy",
    });
    test.assert(unconfirmed.status === 409 && unconfirmed.json?.code === "deploy_not_confirmed",
      "Micropub deploy still needs the writer's confirm word");

    const blocked = await request(port, "POST", "/api/wensi-quanyong/sites/probe-mp/publish", {
      type: "posts",
      path: "",
      stage: "deploy",
      confirm: "deploy",
    });
    test.assert(blocked.status === 409 && blocked.json?.code === "publish_blocked",
      "a deploy with blockers refuses instead of sending");

    const missingToken = await request(port, "POST", "/api/wensi-quanyong/sites/probe-mp/micropub/token", {});
    test.assert(missingToken.status === 400 && missingToken.json?.code === "missing_token",
      "the token door refuses an empty token before touching the Keychain");

    const removed = await request(port, "DELETE", "/api/wensi-quanyong/sites/probe-mp/micropub/token");
    if (process.platform === "darwin") {
      test.assert(removed.status === 200 && removed.json?.configured === false && removed.json?.deleted === false,
        "deleting a token that was never stored reports configured false");
    } else {
      test.assert(removed.status === 503 && removed.json?.code === "keychain_unavailable",
        "a machine without the Keychain says so instead of pretending the token is gone");
    }
    test.assert(!JSON.stringify(removed.json).includes("secret") && !JSON.stringify(removed.json).includes("Bearer"),
      "deleting a token never returns one");

    const notesDir = join(siteRoot, "source", "notes");
    const two = await request(port, "POST", "/api/wensi-quanyong/sites", {
      template: "hexo",
      answers: { id: "two-types", label: "Two types", root: siteRoot },
      overrides: {
        contentTypes: {
          notes: {
            label: "笔记",
            storage: { kind: "file-per", dir: notesDir, filename: "<slug>.md" },
            fields: [
              { key: "title", type: "string", required: true },
              { key: "date", type: "date", required: true },
              { key: "slug", type: "slug", required: true },
            ],
            url: { single: "{slug}/", dedupe: "existing" },
            editor: "markdown",
            draftRule: { kind: "draft-dir", dir: join(siteRoot, "source", "_drafts-notes") },
          },
        },
      },
      dryRun: true,
    });
    test.assert(two.status === 200 && two.json?.description?.contentTypes?.posts
      && two.json.description.contentTypes.notes?.label === "笔记",
      "a second content type is kept beside posts");
    test.assert(two.json?.dryRun === true
      && !existsSync(join(process.env.AI_SYSTEM6_AGENT_HOME, "site-descriptions", "two-types.json")),
      "previewing a second content type does not write the description");

    // A site without a Micropub section says so instead of pretending.
    const noMicropub = await request(port, "GET", "/api/wensi-quanyong/sites/probe-hexo/micropub");
    test.assert(noMicropub.status === 409 && noMicropub.json?.code === "micropub_not_configured",
      "a git-only site answers micropub_not_configured");
  } finally {
    await new Promise((done) => server.close(done));
  }
} finally {
  delete process.env.AI_SYSTEM6_AGENT_HOME;
  delete process.env.AI_SYSTEM6_AGENT_ALLOW_TMP;
  rmSync(scratch, { recursive: true, force: true });
}

const wizardContext = vm.createContext({
  window: { addEventListener: () => {} },
  document: {
    documentElement: { lang: "zh", dataset: {} },
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
  },
  console,
  setTimeout,
  clearTimeout,
  fetch: () => Promise.reject(new Error("the wizard helper does not fetch")),
});
vm.runInContext(read("app/features/wensi-quanyong.js"), wizardContext, { timeout: 2000 });
const extra = wizardContext.window.AISystem6WensiQuanyong.wizardExtraContentType({
  id: "notes",
  label: "笔记",
  storage: "/tmp/wensi-site/source/notes",
  urlShape: "{slug}/",
});
test.assert(extra.id === "notes"
  && extra.type.storage.dir === "/tmp/wensi-site/source/notes"
  && extra.type.storage.kind === "file-per"
  && extra.type.draftRule.dir === "/tmp/wensi-site/source/_drafts-notes"
  && extra.type.fields.some((field) => field.key === "slug" && field.type === "slug"),
  "an added content type carries its own storage, draft directory and slug field");

test.finish();
