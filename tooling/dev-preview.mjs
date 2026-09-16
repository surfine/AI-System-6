#!/usr/bin/env node

/**
 * Continuous development entry: build what changed, then serve.
 *
 *   npm run dev            # PORT=4173, DEV_PORT overrides
 *
 * It reuses the real pieces instead of adding a second implementation of any
 * of them: `tooling/build-app-bundle.mjs` (which now decides per output, so a
 * stylesheet edit no longer re-minifies the boot bundle) and the real server
 * `apps/server/server.js` — so the module list, the concatenated-script loading
 * order and the shell the developer sees are the production ones, not a
 * development-only re-creation.
 *
 * It deliberately does not run tests, refresh screenshot baselines, build the
 * website payload or package the Mac app: those keep their own entries, and a
 * preview that quietly ran them would be the slow loop this exists to avoid.
 *
 * A stylesheet change is picked up by the next browser refresh. A JavaScript
 * change needs a reload the developer asks for, because the desk holds unsaved
 * work in memory and a watcher must not decide to throw that away. Both are one
 * refresh away; neither is silent, since every rebuild prints which part ran.
 */

import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { join, sep } from "node:path";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";
import { lazyStyleBundles } from "./style-manifest.mjs";

const root = repositoryRoot;
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length) {
  console.error("Usage: node tooling/dev-preview.mjs (PORT=4173 DEV_PORT=… to move it)");
  process.exit(2);
}
const port = String(process.env.DEV_PORT || process.env.PORT || "4173");

// Only the inputs that can change a build, and never an output: watching
// `dist/`, the bundle, the built stylesheets or the generated/vendor trees
// would make the watcher rebuild because of its own writes.
const ignoredPaths = [
  join(desktopRoot, "app", "generated") + sep,
  join(desktopRoot, "app", "vendor") + sep,
  join(root, "dist") + sep,
  join(desktopRoot, "app.bundle.js"),
  join(desktopRoot, "styles.bundle.css"),
  ...lazyStyleBundles.map((bundle) => join(desktopRoot, bundle.output)),
];
const watchTargets = [
  join(desktopRoot, "app"),
  join(desktopRoot, "styles"),
  join(desktopRoot, "index.html"),
];

function isBuildInput(path) {
  if (!path) return false;
  return !ignoredPaths.some((ignored) => path === ignored || path.startsWith(ignored));
}

let server = null;
let building = false;
let queued = false;
let debounceTimer = null;
const watchers = [];

function runBuild(trigger) {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  const started = performance.now();
  console.log(`[dev] ${trigger} → building`);
  const result = spawnSync(process.execPath, ["tooling/build-app-bundle.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  if (result.status !== 0) {
    // The failure is printed above by the builder. Saying it again in one line
    // is what keeps a broken build from looking like a slow one.
    console.error(`[dev] build failed after ${seconds}s — the served bundle is the last good one`);
  } else {
    console.log(`[dev] build ok in ${seconds}s — refresh the browser for a JavaScript change`);
  }
  building = false;
  if (queued) {
    queued = false;
    runBuild("queued change");
  }
}

function scheduleBuild(trigger) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuild(trigger);
  }, 150);
}

function startServer() {
  server = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  });
  server.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] the server exited (${signal || code}); stopping the watcher`);
    shutdown(code ?? 1);
  });
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  watchers.splice(0).forEach((watcher) => watcher.close());
  if (server && server.exitCode === null) server.kill("SIGTERM");
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

runBuild("initial");
for (const target of watchTargets) {
  const watcher = watch(target, { recursive: true }, (eventType, filename) => {
    const absolute = filename ? join(target, filename) : target;
    if (!isBuildInput(absolute)) return;
    scheduleBuild(`${filename || target} ${eventType}`);
  });
  watchers.push(watcher);
}
startServer();
console.log(`[dev] serving http://127.0.0.1:${port}/ (Ctrl-C stops the preview and the watcher)`);
