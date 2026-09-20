#!/usr/bin/env node
// Static short links, because the only server that can answer /go/ is not the
// one in front of the app.
//
// `GET /go/:route` exists in apps/server/server/routes/go.js and works locally
// and in the packaged app. On the public host nginx serves the payload as
// static files and proxies only /api/, so /go/endfield-terminal was a 404 for
// everyone the link was ever shared with. Changing the vhost is a by-hand step
// on the host that a release cannot make.
//
// So the release carries the redirect as a FILE. `go/<route>/index.html` is an
// ordinary static page that sends the visitor to /?launch=<route>, which is the
// same destination the server route produces. The route table lives in one
// place and the three copies are held equal by a contract test.
//
// `/go/<route>` is the only shareable entry. A bare `/<route>` alias was
// generated beside it until 2026-09-11 and is gone: one address per app, and an
// id nobody registered is a 404 instead of a page that looks like it worked.
//
// Contract: tests/features/launch-intent.test.mjs
//           tests/integration/launch-links.test.mjs

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Kept in step with apps/server/server/routes/go.js, functions/go/[route].js
// and the `launchCommands` allowlist in app/core/launch-intent.js.
export const LAUNCH_ROUTES = Object.freeze([
  "endfield-terminal",
  "bonsai-city",
  "micropolis",
  "openttd",
  "doom",
  "time-machine",
  "liquid-cover",
  "dtk",
  "cmf-studio",
  "one-more-tune",
]);

function page(route) {
  const target = `/?launch=${encodeURIComponent(route)}`;
  // A meta refresh plus a real link: the refresh carries every browser, and the
  // link is what a person sees if scripting or the refresh is blocked. No
  // script, so the page needs nothing the Content-Security-Policy withholds.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
<title>Opening AI System 6…</title>
</head>
<body>
<p><a href="${target}">Open AI System 6</a></p>
</body>
</html>
`;
}

let written = 0;
for (const route of LAUNCH_ROUTES) {
  const directory = join(root, "apps", "desktop", "go", route);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "index.html"), page(route), "utf8");
  // A working tree that still holds the retired `apps/desktop/<route>/` page
  // hands it straight to the release payload, which copies directories by name.
  // Remove it here, so the generator decides what exists, not a leftover.
  rmSync(join(root, "apps", "desktop", route), { recursive: true, force: true });
  written += 1;
}
console.log(`OK  ${written} standalone launch link page(s) under apps/desktop/go/`);
