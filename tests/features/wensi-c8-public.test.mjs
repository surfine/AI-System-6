// 文思泉涌 P7 · the public boundary (D8).
//
// Two independent proofs. The router, booted under the public profile, must not
// resolve a single /api/wensi-quanyong path — the desktop's site folders, the
// fixed command table and the Micropub token are not public material. The
// client's demo library, in public mode, must refuse every write by name while
// its articles stay readable; the local offline demo (server down) stays
// editable, because it is not the public page.

import { createRequire } from "node:module";
import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c8-public");
const source = read("app/features/wensi-quanyong.js");

// ---- The server: the whole group is absent from the public route table. ----

const routerPath = require.resolve("../../apps/server/server/router.js");
const profilePath = require.resolve("../../apps/server/server/runtime-profile.js");

function resolveFor(profile, method, url) {
  process.env.AI_SYSTEM6_DEPLOYMENT_PROFILE = profile;
  delete require.cache[routerPath];
  delete require.cache[profilePath];
  const router = require(routerPath);
  return router.resolveRoute({ method, url, headers: { host: "localhost" } });
}

try {
  const publicPaths = [
    ["GET", "/api/wensi-quanyong/sites"],
    ["GET", "/api/wensi-quanyong/sites/templates"],
    ["GET", "/api/wensi-quanyong/sites/probe/article?type=posts&path=x.md"],
    ["PUT", "/api/wensi-quanyong/sites/probe/article"],
    ["POST", "/api/wensi-quanyong/sites"],
    ["POST", "/api/wensi-quanyong/sites/probe/publish"],
    ["POST", "/api/wensi-quanyong/sites/probe/micropub/token"],
    ["DELETE", "/api/wensi-quanyong/sites/probe/micropub/token"],
    ["POST", "/api/wensi-quanyong/sites/probe/micropub/media"],
  ];
  for (const [method, url] of publicPaths) {
    test.assert(resolveFor("public", method, url) === null,
      `the public profile does not resolve ${method} ${url}`);
  }
  const capabilities = resolveFor("public", "GET", "/api/capabilities");
  test.assert(typeof capabilities === "function",
    "the public profile still answers /api/capabilities (the flag the client reads)");

  const localSites = resolveFor("local", "GET", "/api/wensi-quanyong/sites");
  const localCreate = resolveFor("local", "POST", "/api/wensi-quanyong/sites");
  test.assert(typeof localSites === "function" && typeof localCreate === "function",
    "the local profile still resolves the group (the desktop's own door)");
} finally {
  delete process.env.AI_SYSTEM6_DEPLOYMENT_PROFILE;
  delete require.cache[routerPath];
  delete require.cache[profilePath];
}

// ---- The client helpers, in a bare VM (no DOM needed for these). ----

const context = vm.createContext({
  window: {
    addEventListener: () => {},
  },
  document: {
    documentElement: { lang: "zh", dataset: {} },
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
  },
  console,
  setTimeout,
  clearTimeout,
  fetch: () => Promise.reject(new Error("the public page must not fetch the wensi API")),
});
vm.runInContext(source, context, { timeout: 2000 });
const api = context.window.AISystem6WensiQuanyong;

test.assert(api.isPublicCapabilities({ deployment_profile: "public" }, undefined) === true,
  "capabilities say public");
test.assert(api.isPublicCapabilities({ deployment_profile: "local" }, "public") === false,
  "an explicit local profile wins over a stale DOM flag");
test.assert(api.isPublicCapabilities({ public_deployment: true }, undefined) === true,
  "the older public_deployment field is honored");
test.assert(api.isPublicCapabilities(null, "public") === true,
  "without capabilities the DOM flag still decides");
test.assert(api.isPublicCapabilities(null, "local") === false,
  "a local/static page is not public");

const publicResolved = api.resolveSites({ sites: [{ id: "real", contentTypes: { posts: {} } }] }, { publicDeployment: true });
test.assert(publicResolved.demoMode === true && publicResolved.readOnly === true
  && publicResolved.sites.length === 1 && publicResolved.sites[0].id === "demo",
  "public mode ignores any remote list and uses the read-only demo site");

const offlineResolved = api.resolveSites(null);
test.assert(offlineResolved.demoMode === true && offlineResolved.readOnly === undefined,
  "the local offline demo is demo mode but not read-only");

// ---- The demo store: public refuses every write, reads stay. ----

const publicStore = api.createDemoStore({ readOnly: true });
const publicRows = publicStore.listArticles("daily");
test.assert(publicRows.length === 2, "the public demo still lists its sample articles");
const publicRead = publicStore.loadArticle({ type: "daily", path: publicRows[0].path });
test.assert(publicRead?.body && publicRead?.frontMatter?.title,
  "a public demo article still opens with its body and fields");
const publicSave = publicStore.saveArticle({
  type: "daily",
  path: publicRows[0].path,
  frontMatter: { ...publicRead.frontMatter, title: "改过的标题" },
  body: "改过的正文。",
});
test.assert(publicSave.ok === false && publicSave.code === "public_read_only",
  "saving in public mode is refused by name");
test.assert(publicStore.loadArticle({ type: "daily", path: publicRows[0].path }).frontMatter.title !== "改过的标题",
  "the refused save left the demo article untouched");
const publicCreate = publicStore.saveArticle({
  type: "daily",
  path: "",
  frontMatter: { title: "新稿", date: "2026-11-09", slug: "new" },
  body: "新正文。",
});
test.assert(publicCreate.ok === false && publicCreate.code === "public_read_only",
  "creating a demo draft in public mode is refused too");

// The menu row itself: the desk hides a row whose command reports unavailable,
// so public mode must make 添加站点 report false. The flag is set after boot,
// which is why the command reads state.readOnly rather than a load-time constant.
test.assert(
  source.includes('isAvailable: () => action !== "wensi-add-site" || !state.readOnly'),
  "the add-site menu command is unavailable when the library is read-only"
);
test.assert(
  source.includes('if (state.readOnly && typeof updateMenuState === "function") updateMenuState();'),
  "the bar is re-evaluated once the public flag arrives (the row disappears, not greys late)"
);

const localStore = api.createDemoStore();
const localSave = localStore.saveArticle({
  type: "daily",
  path: publicRows[0].path,
  frontMatter: { ...publicRead.frontMatter, title: "本地改过的标题" },
  body: "本地改过的正文。",
});
test.assert(localSave.ok === true, "the local offline demo still saves in memory");
test.assert(localStore.loadArticle({ type: "daily", path: publicRows[0].path }).frontMatter.title === "本地改过的标题",
  "the local save is visible (memory only, as before)");

test.finish();
