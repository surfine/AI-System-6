// Two silent-404 classes that no Markdown link gate covers.
//
// First: the app's stylesheets, service worker and HTML name several
// `system.css-reference/...` URLs. Those URLs stay stable, but the files moved
// under `vendor/` on 2026-11-01, so a broken mapping is invisible until a font
// falls back or a control draws without its art.
//
// Second: the Claude-Pop film page is opened from disk and loads its faces with
// relative `url()` paths. Moving the page one directory deeper is exactly the
// edit that leaves those paths one level short.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("local-asset-references");

const referenceRoot = path.join(root, "vendor", "system.css-reference");
const referenceUrl = /system\.css-reference\/([^"')\s?#]+)/g;

function assertReferenceFiles(source, label) {
  const seen = new Set();
  for (const match of source.matchAll(referenceUrl)) {
    const relative = match[1];
    if (seen.has(relative)) continue;
    seen.add(relative);
    test.assert(
      existsSync(path.join(referenceRoot, relative)),
      `${label} names system.css-reference/${relative}, which exists under vendor/`
    );
  }
  test.assert(seen.size > 0, `${label} names at least one reference asset`);
}

assertReferenceFiles(read("apps/desktop/styles/00-foundation.css"), "the Classic font faces");
assertReferenceFiles(read("apps/desktop/sw.js"), "the service-worker precache");
assertReferenceFiles(read("apps/desktop/endfield-terminal.html"), "the Endfield Terminal page");

// The browser URL is the stable half of the move. The server must map it to the
// vendor directory, or every installed client loses its fonts on the next load.
test.assertIncludes(
  read("apps/server/server/static.js"),
  '["system.css-reference/", "vendor/system.css-reference/"]',
  "the server maps the stable reference URL to vendor/"
);

// The film page is opened as a file, so its relative urls() are filesystem
// paths, not server routes. Resolve them against the page itself.
const filmPage = "docs/film/claude-pop/index.html";
const filmSource = readFileSync(path.join(root, filmPage), "utf8");
const filmDirectory = path.dirname(path.join(root, filmPage));
const localUrls = [...filmSource.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)]
  .map((match) => match[2].trim())
  .filter((url) => !/^(?:data:|https?:|#)/i.test(url));
test.assert(localUrls.length > 0, "the film page loads local assets");
for (const url of localUrls) {
  const resolved = path.resolve(filmDirectory, url.split(/[?#]/)[0]);
  test.assert(existsSync(resolved), `${filmPage} resolves ${url}`);
}

test.finish();
