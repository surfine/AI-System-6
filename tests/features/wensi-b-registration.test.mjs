// 文思泉涌 (lane B, P1) — admission contracts.
//
// The studio is a lazy first-class app: only its admission row rides the
// boot, the window shell in index.html is a stub the module fills, and the
// stylesheet is a lazy bundle. These contracts hold the registration to the
// aaron-blog pattern so neither the boot budget nor the admissions table can
// drift.

import vm from "node:vm";

import { admissionRows, createFeatureTest, desktopRoot, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { lazyStyleBundles, styleLayerByPath } from "../../tooling/style-manifest.mjs";

const test = createFeatureTest("wensi-b-registration");
const source = read("app/features/wensi-quanyong.js");
const config = read("app/core/config.js");
const html = read("index.html");
const admissions = read("app/core/app-admissions.js");
const registry = read("app/core/application-registry.js");
const markdownEditor = read("app/core/markdown-editor.js");
const staticSource = read("apps/server/server/static.js");

test.assert(lazyRuntimePaths.includes("app/features/wensi-quanyong.js"), "the studio module is lazy, not boot payload");
test.assertIncludes(
  config,
  'createLazyModuleLoader("AISystem6WensiQuanyongLoaded", ["app/core/application-shell.js", "app/features/wensi-quanyong.js"], false, ["styles.wensi-quanyong.css"])',
  "the loader names the shell helper, module and stylesheet together",
);

const row = admissionRows().wensiQuanyong;
test.assert(row?.command === "open-wensi-quanyong", "the opener is declared in the admission row");
test.assert(row?.app === "wensiQuanyong", "the row names its owning application");
test.assert(row?.applicationGroup === "extras", "the Applications folder lists the studio under extras");
test.assert(row?.appLabel === "wensi_quanyong_label", "the Applications row resolves its label key");
test.assert(row?.appIcon === "rebuildArticle", "the Applications row and Dock share a real icon id");
test.assert(row?.appDesc === "app_desc_wensi_quanyong", "the Applications row carries a description key");
test.assert(row?.api === "AISystem6WensiQuanyong", "the window record derives from the module's global");
test.assert(row?.width === 1080, "the studio opens at its declared width");
test.assert(row?.phone === 1 && row?.tile === 1 && row?.grow === 1, "the studio takes the phone, tile and grow roles");
test.assert(row?.repaint === "renderWensiQuanyongLanguage", "a language switch redraws the app's own strings");
test.assert(admissions.includes('multiFinder: "文思泉涌"'), "the application switcher carries the Chinese name");

const record = windowRegistryRecords().wensiQuanyong;
test.assert(record?.builtByModule === true, "the window is derived from the admission row");
test.assert(!!record?.lazy, "the window record is lazy");
test.assert(record?.width === 1080, "the derived window record keeps the declared width");
test.assertNotIncludes(read("app/core/window-registry.js"), "wensiQuanyong:", "the window is not hand-written in the registry a second time");

// The index.html shell is a stub on purpose: boot pays for the chrome only.
test.assert(html.includes('<section class="window wensi-quanyong-window is-hidden" data-window="wensiQuanyong"'), "the window shell is declared once in index.html");
test.assertIncludes(html, 'aria-labelledby="wensi-quanyong-title"', "the shell names its title");
test.assertIncludes(html, 'data-i18n="wensi_quanyong_label"', "the title resolves through the translation tables");
test.assertIncludes(html, 'class="window-pane wensi-quanyong-pane"', "the shell carries the three-pane host");
test.assertNotIncludes(html, "wensi-body", "the shell stays a stub: the module builds the editor");
test.assertNotIncludes(html, "wensi-list", "the shell stays a stub: the module builds the library");

const styleBundle = lazyStyleBundles.find((bundle) => bundle.id === "wensi-quanyong");
test.assert(styleBundle?.output === "styles.wensi-quanyong.css", "the lazy stylesheet output matches the loader");
test.assert(JSON.stringify(styleBundle?.sources) === JSON.stringify(["styles/95-wensi-quanyong.css"]), "the bundle names exactly its source sheet");
test.assert(styleLayerByPath["styles/95-wensi-quanyong.css"] === "wensi-quanyong", "the stylesheet owns a cascade layer");
test.assertIncludes(staticSource, '"styles.wensi-quanyong.css"', "the local server serves the lazy stylesheet");

test.assertIncludes(registry, 'id: "wensiQuanyong"', "the application registry holds a wensiQuanyong descriptor");
test.assertIncludes(registry, 'acceptedItemKinds: ["text"]', "the studio accepts text manuscripts");
test.assertIncludes(registry, 'acceptedIntents: ["open", "edit", "publish"]', "the studio declares the publish intent (lane A's word list activates it)");
test.assertIncludes(registry, 'recordsRuns: ["publish"]', "handovers record their publish receipt");

// The one permitted markdown-editor touch: the Format surfaces table learns
// the studio's body textarea so the writing menu reaches it.
test.assertIncludes(markdownEditor, 'wensiQuanyong: "wensi-body"', "the Format commands target the studio body by id");
test.assert(read("app/core/markdown-editor.js").split("wensiQuanyong").length === 2, "markdown-editor carries exactly the one permitted wensiQuanyong line");

// The admission strings exist in both voices, and the studio's Chinese name
// is the one the design was approved under.
function evaluateTable(sourceText, globalName) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(sourceText, context, { timeout: 2000 });
  return context.window[globalName] || {};
}
const en = evaluateTable(read("app/data/translations-en.js"), "AISystem6TranslationsEn");
const zh = evaluateTable(read("app/data/translations-zh.js"), "AISystem6TranslationsZh");
for (const key of ["wensi_quanyong_label", "app_desc_wensi_quanyong"]) {
  test.assert(typeof en[key] === "string" && en[key].length > 0, `the English table carries ${key}`);
  test.assert(typeof zh[key] === "string" && zh[key].length > 0, `the Chinese table carries ${key}`);
}
test.assert(zh.wensi_quanyong_label === "文思泉涌", "the Chinese interface name is 文思泉涌");

// The module loads without a DOM and installs a frozen API.
const context = vm.createContext({ window: {}, console });
vm.runInContext(source, context, { timeout: 2000 });
const api = context.window.AISystem6WensiQuanyong;
test.assert(!!api, "the module installs its global without a DOM");
test.assert(Object.isFrozen(api), "the studio API is frozen");
test.assert(typeof api.attach === "function" && typeof api.open === "function" && typeof api.openDraftFromText === "function", "attach, open and the publish door are on the API");
test.assert(context.window.AISystem6WensiQuanyongLoaded === true, "the loaded flag is set once");

test.finish();
