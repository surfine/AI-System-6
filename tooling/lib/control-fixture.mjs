// Source-only browser fixture: production CSS, theme registry and select runtime,
// without booting apps, generating assets, opening a port or making network calls.
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parse } from "acorn";
import { allStylePaths, styleLayerOrder } from "../style-manifest.mjs";
import { desktopRoot, repositoryRoot } from "./paths.mjs";

export const controlFixtureUrl = "http://controls.test/";

export async function installControlFixture(context) {
  const readDesktop = (path) => readFile(resolve(desktopRoot, path), "utf8");
  const app = await readDesktop("app.js");
  const functionNames = new Set([
    "closeSystemSelectMenus", "systemSelectOptionText", "systemSelectAccessibleName",
    "refreshSystemSelectControl", "renderSystemSelectMenu", "systemSelectEnabledOptions",
    "focusSystemSelectOption", "openSystemSelect", "handleSystemSelectTypeahead",
    "initSystemSelectControls", "refreshSystemSelectControls",
  ]);
  const variableNames = new Set(["systemSelectControlSequence", "systemSelectTypeaheadState"]);
  const parts = [];
  for (const node of parse(app, { ecmaVersion: "latest", sourceType: "script" }).body) {
    if (node.type === "FunctionDeclaration" && functionNames.delete(node.id.name)) parts.push(app.slice(node.start, node.end));
    if (node.type === "VariableDeclaration") for (const declaration of node.declarations) {
      if (variableNames.delete(declaration.id.name)) parts.push(`${node.kind} ${app.slice(declaration.start, declaration.end)};`);
    }
  }
  if (functionNames.size || variableNames.size) throw new Error("Select runtime moved; update the source fixture extraction instead of mocking its behavior");
  const scripts = [await readDesktop("app/core/theme-registry.js"), await readDesktop("app/core/input-guard.js"), ...parts].join("\n");
  const css = `@layer ${styleLayerOrder.join(",")};\n` + (await Promise.all(allStylePaths.map(readDesktop))).join("\n");
  const html = '<!doctype html><html lang="zh-Hans"><head><link rel="stylesheet" href="/fixture.css"></head><body><script src="/fixture.js"></script></body></html>';
  const types = { svg: "image/svg+xml", png: "image/png", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf" };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(controlFixtureUrl).origin) return route.abort();
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (url.pathname === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
    if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: scripts });
    const prefix = url.pathname.startsWith("/system.css-reference/") ? "system.css-reference" : "assets";
    const base = resolve(prefix === "assets" ? desktopRoot : repositoryRoot, prefix);
    const path = resolve(base, decodeURIComponent(url.pathname).slice(prefix.length + 2));
    if (!url.pathname.startsWith(`/${prefix}/`) || !path.startsWith(base + sep)) return route.abort();
    try {
      return await route.fulfill({ contentType: types[path.split(".").at(-1)] || "application/octet-stream", body: await readFile(path) });
    } catch { return route.fulfill({ status: 404, body: "Missing fixture asset" }); }
  });
}
