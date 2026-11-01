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
import { existsSync, statSync, watch } from "node:fs";
import { join, relative, sep } from "node:path";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";
import { appRuntimePaths, lazyRuntimePaths } from "./runtime-manifest.mjs";
import { lazyStyleBundles, styleRuntimePaths } from "./style-manifest.mjs";
import { buildPreapp } from "./build-preapp.mjs";

const root = repositoryRoot;
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length) {
  console.error("Usage: node tooling/dev-preview.mjs (PORT=4173 DEV_PORT=… to move it)");
  process.exit(2);
}
const port = String(process.env.DEV_PORT || process.env.PORT || "4173");

// ---- What this preview watches, derived from the manifests that decide it ----
//
// The manifests are the truth about which files become the served bundle and
// which of them are loaded later, so the watch set is read from them rather than
// guessed from directory names. `apps/desktop/app.js` is the case that motivated
// this: it is a boot input that lives beside the app directory, and a watch set
// built from directories alone left it invisible — editing it changed nothing
// until the next unrelated edit happened to rebuild.
//
// Outputs are never inputs. The generated tree, the vendor bundles, the built
// stylesheets and `dist/` would otherwise make the watcher rebuild because of
// its own writes.
const OUTPUT_PATHS = [
  join(desktopRoot, "app", "generated") + sep,
  join(desktopRoot, "app", "vendor") + sep,
  join(root, "dist") + sep,
  join(root, "logs") + sep,
  join(desktopRoot, "app.bundle.js"),
  join(desktopRoot, "styles.bundle.css"),
  ...lazyStyleBundles.map((bundle) => join(desktopRoot, bundle.output)),
];

// The build decides by content, so a manifest change is a rebuild and nothing
// more; the dependency manifests are called out separately because a rebuild
// cannot install anything.
const dependencyManifests = ["package.json", "package-lock.json"].map((name) => join(root, name));
const serverRoots = [join(root, "apps", "server")];
const manifestPaths = [
  join(root, "tooling", "runtime-manifest.mjs"),
  join(root, "tooling", "style-manifest.mjs"),
];

function manifestBuildInputs() {
  return [
    ...appRuntimePaths,
    ...lazyRuntimePaths,
    ...styleRuntimePaths,
    ...lazyStyleBundles.flatMap((bundle) => bundle.sources || []),
  ].map((path) => join(desktopRoot, path));
}

/** Everything a build reads, as absolute paths. */
let buildInputs = new Set(manifestBuildInputs());

function isOutput(path) {
  return OUTPUT_PATHS.some((output) => path === output || path.startsWith(output));
}

function isInside(path, parent) {
  return path === parent || path.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

function isBuildInput(path) {
  if (!path || isOutput(path)) return false;
  if (buildInputs.has(path)) return true;
  // The manifests, the builder and the tools that name inputs are inputs too:
  // changing how the bundle is assembled changes the bundle.
  return isInside(path, join(root, "tooling"))
    || isInside(path, join(desktopRoot, "app"))
    || isInside(path, join(desktopRoot, "styles"))
    || path === join(desktopRoot, "index.html")
    || path === join(desktopRoot, "app.js");
}

function isServerInput(path) {
  if (!path || isOutput(path)) return false;
  return serverRoots.some((serverRoot) => isInside(path, serverRoot));
}

function isDependencyManifest(path) {
  return dependencyManifests.includes(path);
}

let server = null;
let building = false;
let queuedBuild = false;
let queuedRestart = false;
let debounceTimer = null;
let watchers = [];

async function runBuild(trigger) {
  if (building) {
    queuedBuild = true;
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
  if (queuedBuild) {
    queuedBuild = false;
    await runBuild("change during the build");
  }
  if (queuedRestart) {
    queuedRestart = false;
    await restartServer("change during the build");
  }
}

function scheduleBuild(trigger) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuild(trigger);
  }, 150);
}

/** Re-derive the watch set, and re-create the watchers when a manifest moved. */
function refreshWatchScope(reason) {
  buildInputs = new Set(manifestBuildInputs());
  if (!reason) return;
  watchers.splice(0).forEach((watcher) => watcher.close());
  watchEverything();
  console.log(`[dev] watch scope re-derived (${reason}) — ${buildInputs.size} build inputs`);
}

let serverGeneration = 0;
/** Every server this preview started, so a stop during a restart still finds it. */
const liveServers = new Set();

function startServer(reason = "start") {
  const generation = ++serverGeneration;
  server = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  });
  const child = server;
  liveServers.add(child);
  child.on("exit", () => liveServers.delete(child));
  console.log(`[dev] server ${reason} (pid ${server.pid})`);
  child.on("exit", (code, signal) => {
    // A child that is no longer the current one was stopped on purpose — a
    // restart — and its exit is not news. Only the server this preview is
    // actually serving from deciding to leave stops the watcher.
    if (shuttingDown || server !== child) return;
    console.error(`[dev] the server exited (${signal || code}); stopping the watcher`);
    void shutdown(code ?? 1);
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  // Only this preview's own child is signalled. Nothing here looks at a port, so
  // a second server someone else is running keeps running.
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function restartServer(reason) {
  const child = server;
  server = null;
  await stopServer(child);
  // A stop that arrived while the old child was going down wins: the preview is
  // on its way out, so the replacement must not be started.
  if (shuttingDown) return;
  startServer(reason);
}

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  watchers.splice(0).forEach((watcher) => watcher.close());
  server = null;
  await Promise.all([...liveServers].map((child) => stopServer(child)));
  // Setting `exitCode` leaves the process alive for anything still holding the
  // loop open — and a child's inherited stdio does exactly that. The cleanup is
  // done by now, so the preview leaves.
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

/**
 * Where the watchers point.
 *
 * The deep watches hold the derived inputs. The two shallow ones exist for the
 * files that are their own input and live beside directories rather than inside
 * them — `app.js`, `index.html`, and the dependency manifests — and for the
 * way editors save: writing a temporary file and renaming it over the original
 * arrives as a rename whose name may not exist yet, which a file-level watch
 * can miss and a directory-level watch sees.
 */
function watchRoots() {
  return [
    { path: join(desktopRoot, "app"), recursive: true },
    { path: join(desktopRoot, "styles"), recursive: true },
    { path: join(root, "tooling"), recursive: true },
    ...serverRoots.map((path) => ({ path, recursive: true })),
    { path: desktopRoot, recursive: false },
    { path: root, recursive: false },
  ].filter((entry) => existsSync(entry.path));
}

function watchEverything() {
  for (const { path: target, recursive } of watchRoots()) {
    // `filename` is relative to whichever entry was watched, so the join is the
    // only correct way to name the change — and a file watched directly reports
    // no filename at all, where the entry itself is the change.
    const watcher = watch(target, { recursive }, (eventType, filename) => {
      let changed = target;
      if (filename) {
        try {
          changed = statSync(target).isDirectory() ? join(target, filename) : target;
        } catch {
          changed = join(target, filename);
        }
      }
      handleChange(String(changed), `${relative(root, changed) || target} ${eventType}`);
    });
    watchers.push(watcher);
  }
}

function handleChange(changedPath, trigger) {
  if (isDependencyManifest(changedPath)) {
    console.warn(
      `[dev] ${relative(root, changedPath)} changed: installed dependencies are NOT updated. `
      + "Run `npm ci` (or `npm install`) yourself, then change a source file to rebuild. "
      + "The preview keeps serving what is installed."
    );
    return;
  }
  if (isServerInput(changedPath)) {
    if (building) {
      queuedRestart = true;
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      restartServer(`restarted for ${relative(root, changedPath)}`);
    }, 150);
    return;
  }
  if (!isBuildInput(changedPath)) return;
  if (manifestPaths.includes(changedPath)) refreshWatchScope(relative(root, changedPath));
  scheduleBuild(`${relative(root, changedPath)} ${trigger}`);
}

// The vendor bundles the app loads are generated, and a fresh checkout has none
// of them. They come from the same cached pipeline every other entry uses, so a
// warm tree pays about half a second and a cold one gets the files it needs
// rather than a desk that is missing them.
const firstPrebuild = buildPreapp({ root });
const firstBuild = firstPrebuild === 0
  ? spawnSync(process.execPath, ["tooling/build-app-bundle.mjs"], { cwd: root, stdio: "inherit" })
  : { status: firstPrebuild };
if (firstBuild.status !== 0) {
  // A preview that cannot build is not serving the code in front of it, so it
  // says so and waits rather than announcing a ready desk.
  console.error("[dev] the first build failed; nothing is served yet. Fix the error and save again.");
} else {
  watchEverything();
  startServer();
  console.log(`[dev] serving http://127.0.0.1:${port}/ (Ctrl-C stops the preview and the watcher)`);
}
