// Aaron Lau — the blog reader is a lazy first-class app with a same-origin
// content door. These contracts keep it from drifting back into an eager
// bundle, a framed website, or a second project-database schema.

import { createRequire } from "node:module";

import { admissionRows, createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { lazyStyleBundles, styleLayerByPath } from "../../tooling/style-manifest.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("aaron-blog");
const source = read("app/features/aaron-blog.js");
const config = read("app/core/config.js");
const html = read("index.html");
const admissions = read("app/core/app-admissions.js");
const windowRegistry = read("app/core/window-registry.js");
const staticSource = read("apps/server/server/static.js");
const { packPathname } = require("../../apps/server/server/routes/aaron-blog.js");

test.assert(lazyRuntimePaths.includes("app/features/aaron-blog.js"), "the app module is lazy, not boot payload");
test.assertIncludes(
  config,
  'createLazyModuleLoader("AISystem6AaronBlogLoaded", ["app/core/application-shell.js", "app/features/aaron-blog.js"], false, ["styles.aaron-blog.css"])',
  "the loader names the shell, module and stylesheet together"
);
test.assert(admissionRows().aaronBlog?.command === "open-aaron-blog", "the opener is declared in the admission row");
test.assert(admissionRows().aaronBlog?.appIcon === "manuscript", "the Applications row and Dock share a real icon id");
test.assert(admissionRows().aaronBlog?.repaint === "renderAaronBlogLanguage", "a language switch redraws the app's own strings");
test.assert(windowRegistryRecords().aaronBlog?.builtByModule === true, "the window is built by the module");
test.assert(!!windowRegistryRecords().aaronBlog?.lazy, "the window record is lazy and derived from the admission row");
test.assertNotIncludes(windowRegistry, "aaronBlog:", "the window is not hand-written in the registry a second time");

const styleBundle = lazyStyleBundles.find((bundle) => bundle.id === "aaron-blog");
test.assert(styleBundle?.output === "styles.aaron-blog.css", "the lazy stylesheet output matches the loader");
test.assert(styleLayerByPath["styles/94-aaron-blog.css"] === "aaron-blog", "the stylesheet owns a cascade layer");
test.assertIncludes(staticSource, '"styles.aaron-blog.css"', "the local server serves the lazy stylesheet");

test.assertIncludes(html, 'data-open="aaronBlog"', "a desktop icon opens the app");
test.assertIncludes(html, 'data-system-icon="manuscript"', "the desktop icon uses the declared icon");
test.assert(
  html.indexOf('id="desktop-tide-letters"') > -1
    && html.indexOf('id="desktop-tide-letters"') < html.indexOf('data-open="disk"'),
  "潮汐信笺 leads the desktop's first row"
);
test.assertNotIncludes(html, '<span data-i18n="lightroom_title">', "Text Lightroom has left the desktop");
test.assertIncludes(read("app.js"), 'action: "open-lightroom"', "Text Lightroom is still reachable from Applications");
test.assertIncludes(admissions, 'multiFinder: "潮汐信笺"', "the application switcher carries the chosen name");
test.assertIncludes(source, "window.AISystem6Runtime?.registerApplication", "the module registers its runtime application");
test.assertIncludes(source, "ais6-aaron-blog", "the content cache has its own IndexedDB database");
test.assertIncludes(source, "safeHtml", "article HTML is sanitized before it enters the DOM");
const localBlock = source.slice(source.indexOf("const LOCAL_STRINGS"), source.indexOf("const language ="));
const localKeysIn = (part) => [...part.matchAll(/(?:^|[\s,{])([a-z][a-z0-9_]*):/g)]
  .map((match) => match[1]).filter((key) => !["en", "zh"].includes(key)).sort();
test.assert(
  JSON.stringify(localKeysIn(localBlock.slice(localBlock.indexOf("en: {"), localBlock.indexOf("zh: {"))))
    === JSON.stringify(localKeysIn(localBlock.slice(localBlock.indexOf("zh: {")))),
  "the lazy app's local strings exist in both languages"
);
test.assertIncludes(source, 'addEventListener("offline", syncConnectivity)', "the status line follows the desk offline");
test.assert(!/<iframe\b/i.test(source), "the app does not frame the website");
test.assertIncludes(read("app/core/actions.js"), 'action: "blog-search"', "⌘F is scoped to the app");
test.assertIncludes(read("app/data/menus.js"), "aaronBlog: aaronBlogMenus", "the app contributes a menu set");

test.assert(packPathname("/api/aaron-blog/manifest") === "manifest.json", "manifest path");
test.assert(packPathname("/api/aaron-blog/chunk/2026") === "posts/2026.json", "year chunk path");
test.assert(packPathname("/api/aaron-blog/chunk/not-a-year") === null, "non-year chunks are refused");
test.assert(packPathname("/api/aaron-blog/../../etc/passwd") === null, "the proxy is not an open URL door");

test.finish();
