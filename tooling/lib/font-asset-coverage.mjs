import { globSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Every font a packaged stylesheet names has to be matched by the packaging
 * manifest, because that manifest — not the stylesheet — decides what the app
 * has. Cover Glass's typeface was declared in its own stylesheet, offered in
 * its Font menu as bundled, and shipped nowhere: the manifest's font line
 * carried only *.woff2 while that face is an .otf, so the packaged app drew a
 * fallback while telling the writer it was using the bundled font. The same
 * silence could hide any other file a sheet loads, so this resolves each url()
 * the way the served page will (desktop-relative under the desktop prefixes,
 * repository-relative under system.css-reference/) and asks the manifest.
 *
 * The matcher is the payload build's own (node:fs glob, same cwd and same
 * pattern list), so a path this accepts is a path that build copies.
 */

// Where a served stylesheet's relative url() lands, as apps/server/server/static.js
// maps it: the desktop tree under these prefixes, the repository root under the rest.
const desktopPrefixes = ["app/", "go/", "assets/", "data/"];
const repositoryPrefixes = ["system.css-reference/", "endfield-archive/public/"];

export function packagedAssetSet({ repoRoot, patterns }) {
  const packaged = new Set();
  for (const pattern of patterns) {
    if (pattern.startsWith("node_modules/")) continue;
    for (const matched of globSync(pattern, { cwd: repoRoot })) packaged.add(posix.normalize(matched));
  }
  return packaged;
}

/** @returns {{ fonts: string[], failures: string[] }} */
export function fontCoverageReport({ repoRoot, patterns } = {}) {
  const manifestPatterns = patterns
    ?? JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).macPackagedAssets?.assets
    ?? [];
  const packaged = packagedAssetSet({ repoRoot, patterns: manifestPatterns });
  const failures = [];
  const fonts = new Map();
  for (const stylesheet of globSync("apps/desktop/styles*.css", { cwd: repoRoot })) {
    const source = readFileSync(join(repoRoot, stylesheet), "utf8");
    for (const match of source.matchAll(/url\(\s*(['"]?)([^)'"]*fonts\/[^)'"]+)\1\s*\)/gi)) {
      const url = match[2].split(/[?#]/)[0].replace(/^(?:\.{1,2}\/)+/, "");
      const servedFromRepository = repositoryPrefixes.some((prefix) => url.startsWith(prefix));
      const target = servedFromRepository ? url : `apps/desktop/${url}`;
      fonts.set(`${stylesheet} -> ${target}`, packaged.has(posix.normalize(target)));
    }
  }
  for (const [reference, covered] of fonts) if (!covered) failures.push(reference);
  return { fonts: [...fonts.keys()], failures };
}
