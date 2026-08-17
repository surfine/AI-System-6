// DOOM phase two is a playable, local-only Chocolate Doom WebAssembly slice.
// The engine remains lazy and zero-WAD by default; a selected IWAD is
// validated, digested, and durably committed to iframe-owned IDBFS before an
// explicit Play gesture may start the browser main loop and audio.

import { createHash, webcrypto } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { createFeatureTest, desktopRoot, read, readAppSurface, exists } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("doom");
const index = read("index.html");
const appJs = read("app.js");
const host = read("app/features/doom.js");
const shellHtml = read("assets/doom/index.html");
const shell = read("assets/doom/shell.js");
const wadPicker = read("assets/doom/wad-picker.js");
const touchControls = read("assets/doom/touch-controls.js");
const touchCss = read("assets/doom/touch-controls.css");
const config = read("app/core/config.js");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const manifest = read("tooling/runtime-manifest.mjs");
const interfaceContract = read("tooling/interface-guidelines-contract.mjs");
const serverStatic = read("apps/server/server/static.js");
// The public snapshot omits the release tooling and the engine binaries, so
// these reads are conditional exactly as they are in the OpenTTD contract.
const snapshotManifest = exists("tooling/public-snapshot-manifest.mjs")
  ? read("tooling/public-snapshot-manifest.mjs")
  : "";
const releaseManifest = exists("tooling/web-release-manifest.mjs")
  ? read("tooling/web-release-manifest.mjs")
  : "";
const releaseBuilder = exists("tooling/build-web-release.mjs")
  ? read("tooling/build-web-release.mjs")
  : "";
const releaseAssets = read("tooling/check-release-assets.mjs");
const packageJson = read("package.json");
const e2eConfig = read("tests/e2e/playwright.config.mjs");
const e2eSmoke = read("tests/e2e/doom-engine.spec.mjs");
const buildDoc = read("tooling/games/doom/build.md");
const buildScript = read("tooling/games/doom/build-doom.sh");
const runtimePatch = read("tooling/games/doom/patches/emscripten-runtime.patch");
const sourceReceipt = read("assets/doom/SOURCE.txt");
const addedRuntimeSource = runtimePatch
  .split("\n")
  .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
  .map((line) => line.slice(1))
  .join("\n");
const app = readAppSurface([
  "app/core/actions.js",
  "app/core/multi-finder.js",
  "app/core/window-manager.js",
]);

// --- application registration and one shared entry path --------------------

test.assertNotIncludes(index, 'data-window="doom"', "the DOOM window frame stays off the startup disk");
test.assertIncludes(host, 'data-window="doom" aria-labelledby="doom-title"', "the lazy module installs the window frame");
test.assertNotIncludes(index, 'data-action="open-doom"', "the dynamic Games folder avoids a duplicate boot-time launcher");
test.assertIncludes(appJs, 'action: "open-doom"', "the dynamic Games folder includes DOOM");
test.assertIncludes(read("app/features/doom.js"), '"open-doom":{handler:()=>openWindow("doom")', "every launcher enters through openWindow");
test.assertIncludes(multiFinder, 'doom: "DOOM"', "MultiFinder labels the app");
test.assertIncludes(multiFinder, 'doom: "doom"', "the window declares its own app id");
test.assertIncludes(host, 'AISystem6RegisterApplicationMenuSet?.("doom"', "the lazy module registers its menu set");
test.assertNotIncludes(menus, "const doomMenus", "DOOM menu declarations stay off the startup floppy");
test.assertIncludes(interfaceContract, "doom: creativeLab()", "DOOM remains a summoned immersive creative lab");
test.assertMatches(windowManager, /doom:\s*\{\s*ensure:\s*\(\)\s*=>\s*ensureDoomModule\(\)/,
  "session restore and direct opens share the lazy loader");
test.assertMatches(windowManager, /mobileFullScreenAppIds = new Set\(\[[^\]]*"doom"/,
  "phones give the game one foreground work area");

// --- lazy, versioned iframe boundary ----------------------------------------

const eagerBlock = manifest.slice(0, manifest.indexOf("lazyRuntimePaths"));
const lazyBlock = manifest.slice(manifest.indexOf("lazyRuntimePaths"));
test.assertNotIncludes(eagerBlock, "app/features/doom.js", "the host stays out of the boot bundle");
test.assertIncludes(lazyBlock, "app/features/doom.js", "the host is a lazy runtime module");
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6DoomLoaded"', "config owns the lazy host loader");
test.assertNotIncludes(index, "assets/doom", "desktop startup never preloads the engine payload");
test.assertIncludes(host, 'DOOM_SHELL_PATH = "assets/doom/index.html"', "the host points at the isolated shell");
test.assertIncludes(host, "frame.src = doomShellSrc()", "the iframe URL is assigned only on attach");
test.assertNotIncludes(host, "Module.", "the desktop host never calls Emscripten Module APIs");
test.assertNotIncludes(host, "FS.", "the desktop host never calls the GPL filesystem API");

test.assertIncludes(host, "DOOM_PROTOCOL_VERSION = 2", "the host uses protocol v2");
test.assertIncludes(shell, "PROTOCOL_VERSION = 2", "the playable shell uses protocol v2");
test.assertIncludes(host, "event.origin !== location.origin", "host messages validate origin");
test.assertIncludes(host, "event.source !== frame.contentWindow", "host messages validate the exact iframe");
test.assertIncludes(host, "data.protocolVersion !== DOOM_PROTOCOL_VERSION", "host messages validate the protocol");
test.assertIncludes(shell, "event.source !== window.parent", "shell messages validate the exact parent");
test.assertIncludes(shell, "data.protocolVersion !== PROTOCOL_VERSION", "shell messages validate the protocol");

// --- real engine, local WAD import, and persistence -------------------------

for (const asset of [
  "assets/doom/wad-picker.js",
  "assets/doom/touch-controls.js",
  "assets/doom/touch-controls.css",
]) test.assertFile(asset, `${asset} exists`);

// The GPLv2 engine build ships wherever the binary ships — the web release and
// the packaged Mac app — but not in the public snapshot, which distributes no
// binary and therefore carries no corresponding source. Assert the real
// artifacts where they exist, and assert the deliberate exclusion where they
// do not, so an accidental disappearance can never read as "snapshot mode".
const enginePresent = exists("assets/doom/chocolate-doom.wasm");
if (enginePresent) {
  for (const asset of [
    "assets/doom/chocolate-doom.js",
    "assets/doom/chocolate-doom.wasm",
  ]) test.assertFile(asset, `${asset} exists`);
  const wasmPath = join(desktopRoot, "assets/doom/chocolate-doom.wasm");
  const wasmHeader = readFileSync(wasmPath).subarray(0, 4).toString("hex");
  test.assert(wasmHeader === "0061736d", "the engine asset has the WebAssembly magic header");
  test.assert(statSync(wasmPath).size > 1_000_000, "the engine asset is a substantive build, not a placeholder");
} else if (snapshotManifest) {
  test.assertIncludes(snapshotManifest, "apps/desktop/assets/doom/chocolate-doom.wasm",
    "the engine is absent only because the public snapshot excludes it");
}
test.assertIncludes(shellHtml, '<script src="wad-picker.js"></script>', "WAD policy loads before the shell");
test.assertIncludes(shellHtml, '<script src="touch-controls.js"></script>', "touch policy loads before the shell");
test.assertIncludes(shellHtml, '<script src="shell.js"></script>', "the shell installs policy before fetching the engine");
test.assertIncludes(shell, 'engineScript.src = "chocolate-doom.js"', "the engine downloads only inside the opened iframe");
test.assertIncludes(shell, "noInitialRun: true", "the runtime never auto-starts main");
test.assertIncludes(shell, "Module.FS.filesystems.IDBFS", "the iframe owns IDBFS storage");
test.assertIncludes(shellHtml, 'id="wad-file" type="file"', "the local picker is a file input, not a network URL");
test.assertIncludes(shellHtml, 'accept=".wad,application/octet-stream"', "the local picker is scoped to WAD data");
test.assertIncludes(shellHtml, 'id="engine-play" type="button" disabled', "Play starts disabled without an IWAD");
test.assertIncludes(shell, "AISystem6DoomWadPicker.create", "the shell uses the bounded WAD importer");

test.assertIncludes(wadPicker, "DEFAULT_MAX_BYTES = 128 * 1024 * 1024", "the local WAD limit is exactly 128 MiB");
test.assertIncludes(wadPicker, 'kind !== "IWAD" && kind !== "PWAD"', "the parser accepts only WAD header kinds");
test.assertIncludes(wadPicker, "directoryBytes > bytes.byteLength - directoryOffset", "the complete lump directory must stay in the file");
test.assertIncludes(wadPicker, "lumpBytes > bytes.byteLength - lumpOffset", "every lump must stay in the file");
test.assertIncludes(wadPicker, 'digestApi.digest(\n      "SHA-256"', "the browser computes SHA-256 before cataloguing data");
test.assertIncludes(wadPicker, "FS.writeFile(temporary", "WAD/catalog mutations first use temporary files");
test.assertIncludes(wadPicker, "FS.rename(temporary", "temporary files are atomically renamed");
test.assertIncludes(wadPicker, "await syncFs(false)", "an import is not reported durable before IDBFS sync");
test.assertIncludes(wadPicker, "mutationTail.then(run, run)", "WAD mutations and their sync receipts are serialized");
test.assertNotIncludes(wadPicker, "localStorage", "WAD bytes never enter desktop preference storage");
for (const networkPrimitive of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon(", "FormData("]) {
  test.assertNotIncludes(wadPicker, networkPrimitive, `the local WAD path does not use ${networkPrimitive}`);
}

function syntheticWad(kind = "IWAD") {
  const bytes = Buffer.alloc(12);
  bytes.write(kind, 0, 4, "ascii");
  bytes.writeUInt32LE(0, 4);
  bytes.writeUInt32LE(12, 8);
  return new Uint8Array(bytes);
}

function oneLumpWad({ lumpOffset = 28, lumpBytes = 0 } = {}) {
  const bytes = Buffer.alloc(28);
  bytes.write("IWAD", 0, 4, "ascii");
  bytes.writeUInt32LE(1, 4);
  bytes.writeUInt32LE(12, 8);
  bytes.writeUInt32LE(lumpOffset, 12);
  bytes.writeUInt32LE(lumpBytes, 16);
  bytes.write("TEST", 20, 4, "ascii");
  return new Uint8Array(bytes);
}

const wadContext = vm.createContext({
  ArrayBuffer,
  console: { warn: () => {} },
  crypto: webcrypto,
  DataView,
  TextDecoder,
  TextEncoder,
  Uint8Array,
});
vm.runInContext(wadPicker, wadContext);
const wadApi = wadContext.AISystem6DoomWadPicker;
test.assert(wadApi.constants.defaultMaxBytes === 134_217_728, "the executable picker exports the 128 MiB cap");

const parsed = wadApi.parseWadHeader(syntheticWad());
test.assert(
  parsed.kind === "IWAD" && parsed.lumpCount === 0 && parsed.directoryOffset === 12,
  "the parser accepts a bounded local IWAD header",
);
const validLump = wadApi.parseWadHeader(oneLumpWad());
test.assert(validLump.lumpCount === 1, "the parser walks a contained lump directory");

function wadErrorCode(operation) {
  try {
    operation();
    return "";
  } catch (error) {
    return error && error.code;
  }
}

const badHeader = syntheticWad("NOPE");
const badDirectory = oneLumpWad();
new DataView(badDirectory.buffer, badDirectory.byteOffset, badDirectory.byteLength).setUint32(8, 13, true);
test.assert(wadErrorCode(() => wadApi.parseWadHeader(badHeader)) === "WAD_BAD_HEADER", "invalid WAD kinds are rejected");
test.assert(wadErrorCode(() => wadApi.parseWadHeader(badDirectory)) === "WAD_BAD_DIRECTORY", "truncated directories are rejected");
test.assert(
  wadErrorCode(() => wadApi.parseWadHeader(oneLumpWad({ lumpOffset: 27, lumpBytes: 2 }))) === "WAD_BAD_LUMP",
  "out-of-range lumps are rejected",
);
test.assert(
  wadErrorCode(() => wadApi.parseWadHeader(syntheticWad(), { maxBytes: 11 })) === "WAD_TOO_LARGE",
  "the parser enforces its configured byte cap before writing",
);

const validBytes = syntheticWad();
const browserDigest = await wadApi.sha256Hex(validBytes, webcrypto.subtle);
const nodeDigest = createHash("sha256").update(validBytes).digest("hex");
test.assert(browserDigest === nodeDigest, "the browser SHA-256 receipt covers the exact selected bytes");

function createMemoryFs() {
  const directories = new Set(["/"]);
  const files = new Map();
  const renames = [];
  return {
    files,
    renames,
    api: {
      analyzePath(path) {
        return { exists: directories.has(path) || files.has(path) };
      },
      stat(path) {
        if (!directories.has(path) && !files.has(path)) throw new Error(`ENOENT: ${path}`);
        return {};
      },
      mkdir(path) {
        directories.add(path);
      },
      writeFile(path, value) {
        files.set(path, typeof value === "string" ? value : Uint8Array.from(value));
      },
      readFile(path, options) {
        if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
        const value = files.get(path);
        if (options && options.encoding === "utf8") {
          return typeof value === "string" ? value : new TextDecoder().decode(value);
        }
        return value;
      },
      rename(from, to) {
        if (!files.has(from)) throw new Error(`ENOENT: ${from}`);
        files.set(to, files.get(from));
        files.delete(from);
        renames.push([from, to]);
      },
      unlink(path) {
        if (!files.delete(path)) throw new Error(`ENOENT: ${path}`);
      },
    },
  };
}

const memoryFs = createMemoryFs();
let releasePersistentSync;
let markSyncStarted;
const syncStarted = new Promise((resolve) => { markSyncStarted = resolve; });
const persistentSync = new Promise((resolve) => { releasePersistentSync = resolve; });
const picker = wadApi.create({
  FS: memoryFs.api,
  subtle: webcrypto.subtle,
  now: () => "2026-08-13T00:00:00.000Z",
  randomToken: (() => {
    let serial = 0;
    return () => `test-${serial += 1}`;
  })(),
  userActivationActive: () => true,
  syncFs: (populate) => {
    test.assert(populate === false, "an import flushes toward IDBFS instead of repopulating from it");
    markSyncStarted();
    return persistentSync;
  },
});

const selectedFile = {
  name: "../Owned Local Data.wad",
  path: "/Users/example/secret/Owned Local Data.wad",
  size: validBytes.byteLength,
  arrayBuffer: async () => validBytes.buffer.slice(validBytes.byteOffset, validBytes.byteOffset + validBytes.byteLength),
};
let importSettled = false;
const importResultPromise = picker.importFile(selectedFile).then((result) => {
  importSettled = true;
  return result;
});
await syncStarted;
test.assert(importSettled === false, "the importer does not claim success while persistence is pending");
test.assert(
  memoryFs.renames.some(([from, to]) => from.includes(".aisystem6-import-") && to.startsWith("/doom/iwads/")),
  "the selected WAD is renamed from a hidden temporary path",
);
test.assert(
  memoryFs.renames.some(([from, to]) => from.includes(".aisystem6-catalog-") && to === "/doom/iwads/catalog.json"),
  "the catalog is atomically replaced before its sync receipt",
);
releasePersistentSync();
const importResult = await importResultPromise;
test.assert(importResult.ok === true && picker.active()?.kind === "IWAD", "a persisted IWAD becomes the active playable entry");
test.assert(
  !JSON.stringify(picker.list()).includes("/Users/example/secret"),
  "the safe catalog never records the device source path",
);
test.assert(
  [...memoryFs.files.keys()].every((path) => !path.includes(".aisystem6-")),
  "no import or catalog temporary remains after a successful receipt",
);

// --- explicit Play, browser main loop, SFX, and OPL -------------------------

test.assertIncludes(shell, "Module.callMain(", "the playable shell can invoke the engine main function");
test.assertMatches(shell, /(?:playEl|playButton|playButtonEl)\.addEventListener\("click"/,
  "only the iframe Play control owns the explicit start gesture");
test.assert(
  (shell.match(/\.callMain\(/g) || []).length === 1,
  "there is exactly one main invocation site inside the explicit Play path",
);
test.assertIncludes(shell, 'activeWad.kind === "IWAD"', "a selected PWAD cannot replace the playable base IWAD");
test.assertIncludes(shell, 'ensureDirectory("/tmp/aisystem6-doom-iwad")', "known IWAD aliases stay outside persistent IDBFS");
test.assertIncludes(shell, 'typeof window.Module.FS.symlink === "function"', "known IWAD aliases prefer a zero-copy filesystem link");
test.assertIncludes(shell, "window.Module.FS.symlink(entry.path, canonicalPath)", "the canonical alias links to the catalogued local IWAD");
test.assertIncludes(shell, "window.Module.FS.writeFile(canonicalPath, window.Module.FS.readFile(entry.path))",
  "older runtimes retain an explicit canonical-copy fallback");
test.assert(
  shell.indexOf("window.Module.FS.symlink(entry.path, canonicalPath)")
    < shell.indexOf("window.Module.FS.writeFile(canonicalPath, window.Module.FS.readFile(entry.path))"),
  "the mobile-friendly symlink path is attempted before the memory-copy fallback",
);
test.assertIncludes(shell, "selectedEnginePath = engineIwadPath(selected)", "Play passes Chocolate Doom the canonical alias when required");
test.assertIncludes(shell, '"-iwad"', "Play passes the selected local IWAD path as argv data");
test.assertIncludes(shell, '"-config"', "engine configuration stays below /doom/config");
test.assertIncludes(shell, '"-savedir"', "savegames stay below /doom/saves");
test.assertNotIncludes(host, "callMain", "desktop/session restore cannot start the engine main loop");
test.assertIncludes(runtimePatch, "emscripten_set_main_loop(D_RunFrame, 0, 1)", "the engine yields each frame to the browser loop");
test.assertIncludes(buildScript, "-DENABLE_SDL2_MIXER=ON", "the browser build enables SDL2_mixer SFX");
test.assertIncludes(runtimePatch, "USE_SDL_MIXER=2", "the Emscripten link uses SDL2_mixer");
test.assertIncludes(runtimePatch, "SDL2_MIXER_FORMATS=[]", "no compressed music decoder payload is fetched");
test.assertIncludes(buildScript, "-DCMAKE_DISABLE_FIND_PACKAGE_FluidSynth=TRUE", "the build introduces no SoundFont dependency");
test.assertMatches(buildDoc, /built-in OPL/i, "build documentation records Chocolate Doom's built-in OPL music path");
test.assertIncludes(buildScript, "-DENABLE_SDL2_NET=OFF", "multiplayer networking stays out of this slice");
for (const forbiddenRuntime of ["USE_PTHREADS", "SharedArrayBuffer", "USE_SDL_NET=2"]) {
  const addedRuntimeLine = new RegExp(`^\\+(?!\\+\\+\\+).*${forbiddenRuntime.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`, "m");
  test.assertNotMatches(runtimePatch, addedRuntimeLine, `${forbiddenRuntime} is not added by the engine patch`);
}

// --- normalized native input plus four touch compositions ------------------

const inputFields = ["move", "strafe", "turn", "fire", "use", "run", "map", "menu", "weaponDelta"];
for (const field of inputFields) {
  test.assertIncludes(touchControls, `"${field}"`, `the touch frame declares ${field}`);
  test.assertIncludes(shell, `.${field}`, `the shell forwards ${field}`);
}
test.assertIncludes(runtimePatch, "void AI_DoomWebInput(double move, double strafe, double turn", "the native bridge starts with three normalized axes");
test.assertIncludes(runtimePatch, "int fire, int use, int run", "the native bridge carries the three held actions");
test.assertIncludes(runtimePatch, "int map, int menu, int weapon_delta", "the native bridge carries map/menu/weapon pulses");
test.assertIncludes(runtimePatch, "D_PostEvent(&event)", "normalized input becomes native Doom events");
test.assertIncludes(runtimePatch, "_AI_DoomWebInput", "the browser build exports the native input bridge");
test.assertMatches(shell, /cwrap\(\s*"AI_DoomWebInput"\s*,\s*null\s*,\s*\[\s*"number"(?:\s*,\s*"number"){8}\s*,?\s*\]/,
  "the shell binds exactly nine native input values");

function cFunctionBlock(source, functionName) {
  var nameIndex = source.indexOf(functionName + "(");
  if (nameIndex < 0) return "";
  var openIndex = source.indexOf("{", nameIndex);
  if (openIndex < 0) return "";
  var depth = 0;
  for (var index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(nameIndex, index + 1);
  }
  return "";
}

const nativeInputBlock = cFunctionBlock(addedRuntimeSource, "AI_DoomWebInput");
const releaseAllBlock = cFunctionBlock(addedRuntimeSource, "AI_DoomWebReleaseAll");
test.assertMatches(nativeInputBlock, /if\s*\(\s*menuactive\s*\)/,
  "the native bridge gives an active Chocolate Doom menu its own input path");
test.assertIncludes(addedRuntimeSource, "ev_joystick", "native menu controls use Chocolate Doom joystick events");
for (const direction of ["JOY_DIR_NONE", "JOY_DIR_UP", "JOY_DIR_DOWN", "JOY_DIR_LEFT", "JOY_DIR_RIGHT"]) {
  test.assertIncludes(addedRuntimeSource, direction, `native menu direction uses ${direction}`);
}
test.assertMatches(addedRuntimeSource, /\b[A-Za-z_]\w*\s*<<\s*DPAD_SHIFT/,
  "native menu direction is encoded in Chocolate Doom's D-pad field");

const directMapPulses = nativeInputBlock.match(
  /if\s*\(\s*map\s*!=\s*0\s*\)\s*\{\s*PulseKey\(key_map_toggle\);\s*\}/g,
) || [];
const directMenuPulses = nativeInputBlock.match(
  /if\s*\(\s*menu\s*!=\s*0\s*\)\s*\{\s*PulseKey\(key_menu_activate\);\s*\}/g,
) || [];
const directWeaponPulses = nativeInputBlock.match(
  /if\s*\(\s*weapon_delta\s*!=\s*0\s*\)\s*\{\s*PulseKey\(weapon_delta\s*>\s*0\s*\?\s*key_nextweapon\s*:\s*key_prevweapon\);\s*\}/g,
) || [];
test.assert(directMapPulses.length === 1,
  "each nonzero Map pulse call is consumed directly by the native bridge");
test.assert(directMenuPulses.length === 2,
  "each nonzero Menu pulse call is consumed directly in gameplay and native-menu paths");
test.assert(directWeaponPulses.length === 1,
  "each nonzero weaponDelta pulse call is consumed directly with its current sign");
for (const pulseField of ["map", "menu", "weapon_delta"]) {
  test.assertNotMatches(
    nativeInputBlock,
    new RegExp(`if\\s*\\([^)]*\\b${pulseField}\\b[^)]*&&\\s*!`),
    `${pulseField} is never coalesced behind a prior-frame latch`,
  );
}

function risingEdgeLatch(inputName) {
  const match = addedRuntimeSource.match(
    new RegExp(`\\b${inputName}\\s*&&\\s*!([A-Za-z_]\\w*)`),
  );
  return match ? match[1] : "";
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const menuFireLatch = risingEdgeLatch("fire");
const menuUseLatch = risingEdgeLatch("use");
test.assert(!!menuFireLatch, "menu Fire emits only on a fresh press edge");
test.assert(!!menuUseLatch, "menu Use emits only on a fresh press edge");
if (menuFireLatch) {
  test.assertMatches(addedRuntimeSource, new RegExp(`\\b${escapePattern(menuFireLatch)}\\s*=\\s*fire\\s*;`),
    "the Fire edge latch tracks the current normalized input");
}
if (menuUseLatch) {
  test.assertMatches(addedRuntimeSource, new RegExp(`\\b${escapePattern(menuUseLatch)}\\s*=\\s*use\\s*;`),
    "the Use edge latch tracks the current normalized input");
}

const releaseHelpers = Array.from(releaseAllBlock.matchAll(/\b([A-Za-z_]\w*)\s*\(\s*\)\s*;/g), (match) => match[1]);
const releaseResetSource = [releaseAllBlock]
  .concat(releaseHelpers.map((name) => cFunctionBlock(addedRuntimeSource, name)))
  .join("\n");
for (const [inputName, latchName] of [["Fire", menuFireLatch], ["Use", menuUseLatch]]) {
  if (!latchName) continue;
  test.assertMatches(releaseResetSource, new RegExp(`\\b${escapePattern(latchName)}\\s*=\\s*0\\s*;`),
    `ReleaseAll resets the derived menu ${inputName} edge latch`);
}
test.assertNotIncludes(shell, "new KeyboardEvent", "the shell never fabricates DOM keyboard events");
test.assertNotIncludes(shell, "dispatchEvent(new KeyboardEvent", "native input is not routed through synthetic DOM events");
test.assertIncludes(shell, "navigator.getGamepads", "physical controllers join the same normalized input frame");
test.assertIncludes(shell, "menu: gamepadButton(buttons[9])", "the standard controller Start button enters the normalized Menu path");
test.assertIncludes(shell, "menu: current.menu && !previous.menu", "controller Start is emitted as one press edge, not every held frame");

for (const pointerContract of [
  '"pointerdown"',
  '"pointermove"',
  '"pointerup"',
  '"pointercancel"',
  '"lostpointercapture"',
  "setPointerCapture",
  "pointerOwners = new Map()",
]) test.assertIncludes(touchControls, pointerContract, `touch controls include ${pointerContract}`);
test.assertIncludes(touchControls, 'data-doom-analog="move"', "touch exposes a movement pad");
test.assertIncludes(touchControls, 'data-doom-analog="turn"', "touch exposes an independent turn pad");
test.assertIncludes(touchControls, 'data-doom-hold="fire"', "touch Fire can be held beside movement and turning");
test.assertIncludes(touchCss, "env(safe-area-inset-left)", "touch controls respect the left safe-area inset");
test.assertIncludes(touchCss, "env(safe-area-inset-right)", "touch controls respect the right safe-area inset");
test.assertIncludes(touchCss, '[data-orientation="portrait"]', "portrait has an explicit touch composition");
test.assertIncludes(touchCss, '[data-orientation="landscape"]', "landscape has an explicit touch composition");
test.assertNotIncludes(shell, "screen.orientation.lock", "portrait is never blocked by an orientation lock");
test.assertNotIncludes(shellHtml, "rotate-hint", "rotation is never an entry gate");
test.assertIncludes(shellHtml, "viewport-fit=cover", "the game shell opts into safe-area geometry");

const touchContext = vm.createContext({ window: {} });
vm.runInContext(touchControls, touchContext);
const touchApi = touchContext.window.AISystem6DoomTouchControls;
test.assert(
  Array.from(touchApi.frameFields).join(",") === inputFields.join(","),
  "the executable touch API exports the exact nine-field frame",
);
const zeroFrame = touchApi.pure.zeroFrame();
test.assert(
  Object.values(zeroFrame).every((value) => value === 0 || value === false),
  "release produces an all-zero frame including map and menu",
);
for (const quadrant of [
  { name: "phone portrait", width: 390, height: 844, orientation: "portrait", size: "compact" },
  { name: "phone landscape", width: 844, height: 390, orientation: "landscape", size: "compact" },
  { name: "tablet portrait", width: 820, height: 1180, orientation: "portrait", size: "regular" },
  { name: "tablet landscape", width: 1180, height: 820, orientation: "landscape", size: "regular" },
]) {
  const viewport = touchApi.pure.normalizeViewport({ cssWidth: quadrant.width, cssHeight: quadrant.height });
  test.assert(
    viewport.orientation === quadrant.orientation && viewport.size === quadrant.size,
    `${quadrant.name} selects its intended touch composition`,
  );
}

// --- lifecycle, zeroing, and honest persistence receipts -------------------

for (const resetSignal of ["pointercancel", "orientationchange", "visibilitychange", '"resize"', '"blur"']) {
  test.assertIncludes(shell + touchControls, resetSignal, `${resetSignal} releases held input`);
}
for (const viewportField of ["cssWidth", "cssHeight", "dpr", "orientation"]) {
  test.assertIncludes(shell, `${viewportField}:`, `the atomic viewport declares ${viewportField}`);
}
test.assertIncludes(host, 'postToDoom("release-inputs"', "host zeroes controls before lifecycle changes");
test.assertIncludes(host, "new MutationObserver(syncDoomWindowVisibility)", "window hide and collapse pause the engine");
test.assertMatches(host, /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*?syncDoomWindowVisibility\(\);[\s\S]*?\}\);/,
  "parent tab visibility reuses the window-aware lifecycle predicate");
const parentVisibilityListener = host.slice(
  host.indexOf('document.addEventListener("visibilitychange"'),
  host.indexOf("\n    });", host.indexOf('document.addEventListener("visibilitychange"')) + 8,
);
test.assertNotIncludes(parentVisibilityListener, 'postToDoom("resume")',
  "returning to the tab never unconditionally resumes a hidden DOOM window");
test.assertIncludes(host, 'postToDoom("sync")', "a hidden game flushes iframe-owned storage");
test.assertIncludes(host, 'postToDoom("shutdown")', "Quit asks the iframe to shut down");
test.assertIncludes(host, 'data.event === "shutdown-ack"', "Quit recognizes an explicit storage acknowledgement");
test.assertIncludes(host, "DOOM_SHUTDOWN_TIMEOUT_MS", "Quit has a bounded fallback");
test.assertIncludes(host, "renderDoomRetry", "load failure has a visible retry path");
test.assertIncludes(host, "DOOM_ENGINE_READY_TIMEOUT_MS", "a hung iframe becomes a visible timeout");
test.assertIncludes(shell, 'cwrap("AI_DoomWebReleaseAll"', "zeroing reaches the native bridge");
test.assertIncludes(shell, 'cwrap("AI_DoomWebPause"', "backgrounding reaches the native main-loop pause");
test.assertIncludes(shell, 'cwrap("AI_DoomWebResume"', "foregrounding resumes only an existing game loop");
test.assertIncludes(shell, "suspendAudio()", "backgrounding suspends Web Audio");
test.assertIncludes(shell, "resumeAudio()", "foregrounding and Play resume Web Audio");
test.assertIncludes(shell, 'typeof context.suspend !== "function"', "audio suspension is guarded by runtime capability checks");
test.assertIncludes(shell, 'typeof context.resume !== "function"', "audio resumption is guarded by runtime capability checks");
test.assertIncludes(shell, "syncTail", "IDBFS writes share one serialized promise tail");
test.assertIncludes(shell, "requestShutdownReceipt()", "Quit requests a real storage receipt before acknowledgement");
test.assertMatches(shell, /return syncFs\(false\)\.then\(function \(\) \{\s*post\(eventName, \{ ok: true \}\)/,
  "ordinary storage receipts are posted only after IDBFS sync resolves");
test.assertMatches(shell, /function requestShutdownReceipt\(\)[\s\S]*?return syncFs\(false\)\.then\(function \(\) \{\s*post\("shutdown-ack", \{ ok: true \}\)/,
  "the iframe acknowledges Quit only after IDBFS sync resolves");
test.assertIncludes(shell, 'data.command === "start"', "session restore has an explicit non-playing command path");
test.assertIncludes(shell, "debugSnapshot", "the playable shell exposes read-only diagnostics for browser verification");

// --- zero shipped game data, license, provenance, and packaging ------------

function allFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}
const shippedGameData = allFiles(join(desktopRoot, "assets/doom"))
  .filter((path) => /\.(?:wad|pk3)$/i.test(path));
test.assert(shippedGameData.length === 0, "the release tree contains no WAD or PK3 game data");
test.assertNotMatches(buildScript, /(?:freedoom|\.wad\b)/i, "the reproducible engine build never fetches or copies game data");

for (const asset of [
  "assets/doom/ENGINE-COPYING.txt",
  "assets/doom/SOURCE.txt",
  "assets/doom/chocolate-doom-3.1.1-ai-system6.patch",
]) test.assertFile(asset, `${asset} ships`);
if (enginePresent) {
  test.assertFile("assets/doom/chocolate-doom-3.1.1-source.tar.gz",
    "the corresponding source ships beside the engine binary");
} else if (snapshotManifest) {
  test.assertIncludes(snapshotManifest, "apps/desktop/assets/doom/chocolate-doom-3.1.1-source.tar.gz",
    "the corresponding source is excluded exactly where the binary is");
}
test.assertIncludes(sourceReceipt, "wad-picker.js", "the source receipt covers the GPL WAD adapter");
test.assertIncludes(sourceReceipt, "touch-controls.js", "the source receipt covers the GPL touch adapter");
test.assertIncludes(sourceReceipt, "shell.js", "the source receipt covers the GPL shell adapter");
test.assertIncludes(buildDoc, "410d96855b5df5410ff591a90efeafa889119224", "build docs pin the exact source commit");
test.assertIncludes(buildDoc, "Emscripten | 3.1.57", "build docs pin the toolchain");
test.assertIncludes(buildScript, 'git -C "$source_dir" archive', "the build emits corresponding upstream source");
test.assertIncludes(runtimePatch, "INVOKE_RUN=0", "the patch preserves delayed main");
test.assertIncludes(runtimePatch, "-lidbfs.js", "the patch links persistent storage");
test.assertIncludes(serverStatic, 'relative.startsWith("assets/doom/")', "the server grants Wasm CSP only to the shell directory");
if (releaseManifest) {
  test.assertIncludes(releaseManifest, '"assets/doom"', "the web release includes the complete engine directory");
}
if (packageJson.includes('"macPackagedAssets"')) {
  test.assertIncludes(packageJson, '"apps/desktop/assets/doom/**/*"', "native packaging includes engine, adapters, and source");
}
for (const requiredAsset of [
  "assets/doom/chocolate-doom.wasm",
  "assets/doom/wad-picker.js",
  "assets/doom/touch-controls.js",
  "assets/doom/touch-controls.css",
]) test.assertIncludes(releaseAssets, `"${requiredAsset}"`, `release verification requires ${requiredAsset}`);
if (releaseBuilder) {
  test.assertIncludes(releaseBuilder, "/^styles(?:\\.[a-z0-9-]+)?\\.css$/i", "lazy game styles resolve from the desktop root");
}
test.assertIncludes(e2eConfig, "mobile-user-journey|doom-engine", "the heavy playable smoke is owned by Chromium only");
test.assertIncludes(e2eSmoke, "mobileMatrix", "the browser diagnostic covers all four touch quadrants");
test.assertIncludes(e2eSmoke, "DOOM_TEST_IWAD", "a real IWAD smoke is explicit and opt-in");

for (const key of [
  "doom_label",
  "doom_title",
  "doom_status_loading",
  "doom_status_engine_ready",
  "doom_status_needs_data",
  "doom_status_importing",
  "doom_status_ready",
  "doom_status_starting",
  "doom_status_running",
  "doom_status_paused",
  "doom_status_import_failed",
  "doom_status_save_failed",
  "doom_status_crashed",
  "doom_status_timeout",
  "doom_retry",
]) {
  test.assertIncludes(en, `${key}:`, `English copy includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy includes ${key}`);
}

// A visitor with no IWAD used to reach a file picker and a dead end: the copy
// named Freedoom without saying where it lives. Name the path, and keep it a
// path -- the desk states where the data is, the visitor decides to go, and no
// game data is ever pulled down by a desk nobody asked to phone out.
test.assertIncludes(shellHtml, 'href="https://freedoom.github.io/download.html"', "the chooser names where a free IWAD actually lives");
test.assertIncludes(shellHtml, 'rel="noopener noreferrer"', "the outbound path cannot reach back into the engine page");
test.assertMatches(shell, /freedoom: "[^"]*Freedoom[^"]*"/, "English copy explains what Freedoom is, not just that it exists");
test.assertMatches(shell, /freedoom: "[^"]*自由授权[^"]*"/, "Chinese copy explains what Freedoom is, not just that it exists");
test.assertNotMatches(
  shell + wadPicker,
  /fetch\(\s*["'`]https?:\/\/|XMLHttpRequest[\s\S]{0,80}freedoom/i,
  "the desk hands over a path and never fetches game data on the visitor's behalf"
);

// The canvas id is load-bearing. Emscripten's SDL resolves its drawing
// surface with the default selector "#canvas"; under any other id every
// canvas-size query fails, SDL reads a 0x0 drawable, sets a zero present
// viewport, and the engine renders every frame into nothing while still
// reporting that it is running -- a black window with a working HUD of touch
// controls over it. It shipped that way. Nothing here may rename it back.
test.assertIncludes(shellHtml, '<canvas id="canvas"', "the engine canvas keeps the id Emscripten's SDL resolves");
test.assertNotMatches(shellHtml, /<canvas id="(?!canvas")/, "no engine canvas carries an id SDL cannot find");
test.assertIncludes(shell, 'querySelector("canvas.game-canvas")', "the shell addresses its canvas by class, leaving the id to SDL");

test.finish();
