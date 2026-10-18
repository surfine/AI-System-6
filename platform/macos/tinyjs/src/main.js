// The browser never receives a server token, executable path or raw native key.
const enc = new TextEncoder(), dec = new TextDecoder();
const resources = decodeURIComponent(new URL("../../", import.meta.url).pathname).replace(/\/$/, "");
const node = resources + "/server/node";
const appPath = resources.replace(/\/Contents\/Resources$/, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let host, supervisor, identity, healthFile, stopping = false, ready = false;
let healthReport = {}, healthWrite = Promise.resolve();
let proven = false;
let clipboardGeneration = 0, lastClipboardText = "";
let installPending = false, clipboardTimer = null, clipboardCount = 0;
const queue = [], files = new Map(), downloads = new Map();
const nativeChildren = new Set();
const activeDownloads = new Set();
let nativeHotkey = "", settingsQueue = Promise.resolve();
const randomId = () => crypto.randomUUID();
const jsonRead = async (p) => JSON.parse(dec.decode(await tjs.readFile(p)));
const jsonWrite = (p, data) => tjs.writeFile(p, enc.encode(JSON.stringify(data)));
function emit(type, data) {
  if (ready) host.push("system6-shell", { type, data });
  else if (queue.length < 100) queue.push({ type, data });
}
async function processJson(args) {
  const p = tjs.spawn([node, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  nativeChildren.add(p);
  async function read(stream) {
    const reader = stream.getReader();
    let result = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      result += dec.decode(value, { stream: true });
      if (result.length > 1024 * 1024) { p.kill(); throw new Error("Native response is too large"); }
    }
    return result;
  }
  try {
    const [stdout, stderr, exit] = await Promise.all([read(p.stdout), read(p.stderr), p.wait()]);
    if (exit.exit_status !== 0) throw new Error(JSON.parse(stderr.trim() || "{}").error || "Native operation failed");
    return JSON.parse(stdout);
  } finally { nativeChildren.delete(p); }
}
const nativeCommand = (argv) => processJson([resources + "/app/src/node/native-command.cjs", String(tjs.pid), ...argv]);
async function updateWorker(command, request) {
  const file = host.paths.data + "/request-" + randomId() + ".json";
  try {
    await jsonWrite(file, { ...request, manifestUrl: "https://system6.aaronlau.me/updates/stable/manifest.json",
      shellVersion: identity.shellVersion, bundleId: identity.bundleId, allowAdhoc: true,
      app: appPath, oldIdentity: identity, oldBackendPid: tjs.pid, oldSupervisorPid: supervisor?.pid,
      healthyFile: healthFile, recoveryFile: host.paths.data + "/recovery.json" });
    return await processJson([resources + "/app/src/node/update.cjs", command, file]);
  } finally { await tjs.remove(file).catch(() => {}); }
}
const purgeFrontendCache = (force = false) => updateWorker("frontendCache", {
  identity, force, cacheDir: host.paths.cache + "/WebKit/NetworkCache", markerFile: host.paths.data + "/frontend-identity.json" });
let frontendReloaded = false;
async function publishHealth(report = {}) {
  healthReport = { ...healthReport, ...report };
  const snapshot = { ...identity, ready, time: Date.now(), backendPid: tjs.pid,
    supervisorPid: supervisor?.pid, ...healthReport };
  const pending = healthWrite.catch(() => {}).then(async () => {
    const temporary = healthFile + ".tmp";
    await jsonWrite(temporary, snapshot);
    await tjs.rename(temporary, healthFile);
  });
  healthWrite = pending;
  await pending;
}
async function cleanup() {
  if (stopping) return;
  stopping = true;
  clearInterval(clipboardTimer);
  host.hotkey.unregister("collect-selection");
  for (const child of nativeChildren) { try { child.kill("SIGTERM"); } catch {} }
  if (supervisor) {
    try { supervisor.kill("SIGTERM"); } catch {}
    await Promise.race([supervisor.wait(), sleep(27000)]);
  }
}
export async function init(app) {
  host = app;
  try {
    if (!appPath.endsWith(".app")) throw new Error("Launch the complete installed application");
    identity = await jsonRead(resources + "/PRODUCT-IDENTITY.json");
    await tjs.makeDir(host.paths.data, { recursive: true });
    await tjs.chmod(host.paths.data, 0o700);
    healthFile = host.paths.data + "/health.json";
    // Early report allows the independent recovery worker to stop an unhealthy launch.
    await publishHealth();
    const recovery = await updateWorker("recover", {});
    if (recovery.recovering) { host.quit(); return; }
    // Before the WebView first reaches the private server: a payload it has
    // not run before must not be served the previous payload's cached desk.
    await purgeFrontendCache().catch((error) => console.error("AI System 6 cache:", String(error.message).slice(0, 200)));
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    supervisor = tjs.spawn([node, resources + "/app/src/node/supervisor.cjs", resources + "/server", String(tjs.pid)], {
      stdin: "ignore", stdout: "ignore", stderr: "ignore",
      env: { ...tjs.env, AI_SYSTEM6_DEPLOYMENT_PROFILE: "local", AI_SYSTEM6_SHELL: "macos",
        AI_SYSTEM6_SHELL_TOKEN: token, AI_SYSTEM6_VISION_HELPER: resources.replace(/Resources$/, "MacOS/AISystem6Vision"),
        AI_SYSTEM6_DEVICE_MODEL_HELPER: resources.replace(/Resources$/, "MacOS/AISystem6Intelligence"), AI_SYSTEM6_SHELL_PROCESS_FILE: host.paths.data + "/process.json" },
    });
    await publishHealth();
    const deadline = Date.now() + 30000;
    proven = false;
    while (Date.now() < deadline && !stopping) {
      try {
        const res = await fetch("http://127.0.0.1:4173/api/shell/identity", {
          headers: { "X-AI-System6-Shell-Token": token }, signal: AbortSignal.timeout(1000),
        });
        const proof = await res.json();
        if (res.ok && proof.parentPid === supervisor.pid && proof.version === identity.productVersion
            && proof.build === identity.productBuild && proof.sourceCommit === identity.sourceCommit) { proven = true; break; }
      } catch {}
      await sleep(150);
    }
    if (!proven) throw new Error("The private server could not start. Port 4173 may already be in use.");
    host.setMenu([
      { title: "AI System 6", role: "app", items: [{ role: "about" }, { separator: true },
        { id: "settings", label: "Settings…", key: "Cmd+," }, { separator: true }, { role: "quit" }] },
      { title: "Edit", role: "edit", items: [{ role: "undo" }, { role: "redo" }, { separator: true },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      { title: "Tools", items: [{ id: "screenshot", label: "Capture Text…" },
        { id: "selected-text", label: "Collect Selected Text" }, { id: "check-update", label: "Check for Updates…" }] },
    ]);
    const bootstrapDeadline = Date.now() + 30000;
    void (async () => {
      while (!ready && !stopping && proven && Date.now() < bootstrapDeadline) {
        // Only retry the packaged bootstrap. Never reload a live desk.
        host.eval('if(location.protocol === "file:") location.replace("http://127.0.0.1:4173/api/shell/bootstrap")');
        await sleep(500);
      }
    })();
    supervisor.wait().then(() => { if (!stopping) { proven = false; void cleanup().then(() => host.quit()); } });
    host.done.finally(cleanup);
  } catch (error) {
    console.error("AI System 6 startup:", String(error.message).slice(0, 500));
    await cleanup();
    // Fixed native script; data is JSON encoded, never treated as code.
    const message = JSON.stringify(String(error.message).slice(0, 500));
    await nativeCommand(["/usr/bin/osascript", "-e", "display alert \"AI System 6\" message " + message]);
    host.quit();
  }
}
async function applyNativeSettings({ clipboard = false, hotkey = "" } = {}) {
    if (installPending) throw new Error("Update is in progress");
    if (typeof hotkey !== "string" || (hotkey && !/^(?:cmd|ctrl|alt|shift)\+(?:(?:cmd|ctrl|alt|shift)\+)*[a-z0-9]$/i.test(hotkey))) throw new Error("Invalid shortcut");
    const nextCount = clipboard === true ? await host.clipboard.changeCount() : 0;
    if (hotkey !== nativeHotkey) {
      const previous = nativeHotkey;
      host.hotkey.unregister("collect-selection");
      try {
        if (hotkey) await host.hotkey.register("collect-selection", hotkey);
        nativeHotkey = hotkey;
      } catch (error) {
        if (previous) {
          try { await host.hotkey.register("collect-selection", previous); }
          catch { nativeHotkey = ""; throw new Error("Shortcut unavailable; previous shortcut could not be restored"); }
        }
        throw error;
      }
    }
    clearInterval(clipboardTimer); clipboardTimer = null;
    const generation = ++clipboardGeneration;
    if (clipboard === true) {
      clipboardCount = nextCount;
      let polling = false;
      clipboardTimer = setInterval(async () => {
        if (polling || installPending) return;
        polling = true;
        try {
          const count = await host.clipboard.changeCount();
          if (count !== clipboardCount) {
            clipboardCount = count; const c = await host.clipboard.read();
            await publishHealth({ clipboardState: { count, kind: c.kind, concealed: !!c.concealed,
              self: c.sourceApp?.bundleId === identity.bundleId, hasText: !!c.text?.trim() } });
            if (generation === clipboardGeneration && !c.concealed && c.sourceApp?.bundleId !== identity.bundleId
                && c.kind === "text" && c.text?.trim() && c.text !== lastClipboardText) {
              lastClipboardText = c.text; emit("collect", {
              text: c.text.slice(0, 100000), source: "clipboard", sourceURL: c.sourceURL || "" });
            }
          }
        } catch {
          if (generation === clipboardGeneration) {
            clearInterval(clipboardTimer); clipboardTimer = null;
            ++clipboardGeneration; emit("clipboard-unavailable", null);
          }
        } finally { polling = false; }
      }, 750);
    }
    await publishHealth({ clipboardListening: clipboard === true });
    return { clipboard: clipboard === true, hotkey };
 }
const handlers = {
  "shell.bootDiagnostic": async ({ name, identifier, frames }) => {
    ready = false;
    const bootDiagnostic = { name: /^[A-Za-z]{1,32}$/.test(name || "") ? name : "Error",
      identifier: /^[A-Za-z_$][\w$]{0,63}$/.test(identifier || "") ? identifier : "",
      frames: (Array.isArray(frames) ? frames : []).slice(0, 4).map((line) => String(line).slice(0, 200)) };
    await publishHealth({ bootDiagnostic }); return true;
  },
  "shell.ready": async ({ dataFingerprint, writerData, frontendVersion, frontendBuild, frontendSource }) => {
    if (!/^[a-f0-9]{64}$/.test(dataFingerprint || "")) throw new Error("Storage must be checked first");
    if (frontendVersion !== identity.productVersion || frontendBuild !== identity.productBuild
        || frontendSource !== identity.sourceCommit) {
      // A stale desk survived the cache purge (or the purge failed): drop the
      // cache once more and start this launch's desk again, once.
      if (!frontendReloaded) {
        frontendReloaded = true;
        await purgeFrontendCache(true).catch(() => {});
        host.eval('location.replace("http://127.0.0.1:4173/api/shell/bootstrap")');
      }
      throw new Error("The desktop payload does not match the installed application");
    }
    const lost = writerData?.lost;
    if (writerData !== undefined && (!Number.isSafeInteger(lost) || lost < 0)) throw new Error("Storage must be checked first");
    if (lost > 0) {
      await publishHealth({ writerData: { checked: true, lost, missing: (writerData.missing || []).slice(0, 10).map((item) => String(item).slice(0, 120)) } });
      throw new Error("Writer data is missing after startup");
    }
    const writer = writerData && { checked: writerData.checked === true, lost: 0, rewritten: writerData.rewritten === true,
      stores: Object.fromEntries(Object.entries(writerData.stores || {}).slice(0, 32)
        .filter(([name, count]) => /^[A-Za-z0-9_-]{1,64}$/.test(name) && Number.isSafeInteger(count))) };
    ready = true;
    await publishHealth({ dataFingerprint, ...(writer ? { writerData: writer } : {}) });
    // Permission diagnostics are optional; a delayed OS callback must not
    // block startup or the independently verified update health report.
    void Promise.all(["accessibility", "screen", "notifications"].map(async (name) => [name,
      await Promise.race([host.permissions.check(name), sleep(2000).then(() => "unknown")])]))
      .then((values) => publishHealth({ nativePermissions: Object.fromEntries(values) })).catch(() => {});
    const pending = queue.splice(0); for (const item of pending) emit(item.type, item.data);
    return { identity, pendingFiles: files.size };
  },
  "shell.settings": (next) => {
    const pending = settingsQueue.then(() => applyNativeSettings(next));
    settingsQueue = pending.catch(() => {});
    return pending;
  },
  "shell.selection": async () => {
    if (await host.permissions.check("accessibility") !== "granted") {
      await host.permissions.request("accessibility");
      throw new Error("Enable Accessibility for AI System 6 Beta in System Settings, then retry");
    }
    const selection = await host.macos.selectedText();
    if (!selection) throw new Error("No selected text, or Accessibility permission is unavailable");
    return { text: String(selection).slice(0, 100000), source: "selection" };
  },
  "shell.screenshot": async () => {
    const file = host.paths.data + "/capture-" + randomId() + ".png";
    try {
      const result = await nativeCommand(["/usr/sbin/screencapture", "-i", "-x", file]);
      if (result.code !== 0) return { cancelled: true };
      const stat = await tjs.stat(file).catch(() => null);
      if (!stat) return { cancelled: true };
      const resultText = await host.macos.ocr(file);
      return { text: resultText.text, source: "screenshot" };
    } finally { await tjs.remove(file).catch(() => {}); }
  },
  "shell.files": async () => [...files].map(([id, value]) => ({ id, name: value.split("/").pop() })),
  "shell.readFile": async ({ id }) => {
    const file = files.get(id); if (!file) throw new Error("File selection expired");
    const stat = await tjs.stat(file);
    if (stat.size > 100 * 1024 * 1024) throw new Error("File is larger than 100 MB");
    const bytes = await tjs.readFile(file);
    let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    files.delete(id);
    return { name: file.split("/").pop(), base64: btoa(binary) };
  },
  "shell.quickLook": async ({ id }) => {
    const file = files.get(id); if (!file) throw new Error("File selection expired");
    host.macos.quickLook(file); return true;
  },
  "shell.previewFile": async () => {
    try {
      const file = await host.choosePreviewFile();
      if (!file || typeof file !== "string") return { cancelled: true };
      await tjs.stat(file);
      host.macos.quickLook(file);
      return { previewing: true };
    } catch (e) {
      if (/-128|cancel/i.test(String(e.message))) return { cancelled: true };
      throw new Error("The selected file could not be previewed");
    }
  },
  "shell.closePreview": async () => { host.macos.quickLook(); return true; },
  "shell.cancelDownload": async ({ id }) => {
    if (!activeDownloads.has(String(id))) return false;
    return host.cancelDownload(String(id));
  },
  "shell.revealDownload": async ({ id }) => {
    const file = downloads.get(id); if (!file) throw new Error("No completed download is available");
    await host.shell.reveal(file); return true;
  },
  "shell.notify": async ({ id, title }) => {
    if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(id || "")) throw new Error("Invalid notification target");
    // UNUserNotificationCenter drops a post it was never authorized for, and
    // nothing else in the product asks: the first completion notice is exactly
    // when the writer wants one, so the ask happens there and the notice lands
    // as soon as they answer.
    if (await host.permissions.check("notifications") === "undetermined") {
      await host.permissions.request("notifications");
    }
    await host.notify({ id, title: String(title || "AI System 6").slice(0, 120), body: "Open AI System 6 to view the result." });
    return true;
  },
  "shell.checkUpdate": async () => updateWorker("check", {}),
  "shell.installUpdate": async ({ latest, dataFingerprint, saved }) => {
    if (!ready || installPending || activeDownloads.size || saved !== true || !/^[a-f0-9]{64}$/.test(dataFingerprint || "")) throw new Error("Save work before updating");
    installPending = true;
    try {
      if (!await host.freezeDownloads(true)) throw new Error("Wait for downloads to finish before updating");
      const prepared = await updateWorker("prepare", { expectedLatest: latest, dataFingerprint });
      // No native bridge dependencies: this process survives the application.
      tjs.spawn([prepared.node, prepared.worker, "install", prepared.home], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
      await cleanup(); host.quit();
      return { installing: true };
    } catch (e) { await host.freezeDownloads(false); installPending = false; throw e; }
  },
};
export function onNavigate({ url, kind }) {
  if (kind && kind !== "policy" && healthFile) void publishHealth({ navigation: kind });
  try {
    const target = new URL(url);
    if (target.protocol === "file:" && decodeURIComponent(target.pathname) === resources + "/app/frontend/index.html") {
      // The first eval can precede WebKit's bootstrap load. Navigate again
      // from its finish event after the private server has been authenticated.
      if (kind === "finish" && proven) host.eval('location.replace("http://127.0.0.1:4173/api/shell/bootstrap")');
      return "allow";
    }
    if (target.origin === "http://127.0.0.1:4173") return proven ? "allow" : "deny";
    return ["https:", "http:", "mailto:"].includes(target.protocol) ? "external" : "deny";
  }
  catch { return "deny"; }
}
export function onMenu(id) { emit("command", id); }
export function onHotkey(id) { if (id === "collect-selection") emit("command", "selected-text"); }
export function onNotificationClick(id) { emit("notification", id); }
export function onOpenFiles(paths) {
  for (const file of paths || []) if (/\.(docx|json)$/i.test(file) && files.size < 100) files.set(randomId(), file);
  emit("files", null);
}
export function onOpenUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "ai-system-6:" || !["settings", "project", "scrapbook", "teachtext"].includes(u.hostname)) return;
    emit("route", { target: u.hostname, id: u.searchParams.get("id")?.slice(0, 100) || "" });
  } catch {}
}
export function onWindowClosed() { void cleanup(); }

export const api = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, async (params) => {
  if (!proven || stopping) throw new Error("The private server is not authenticated");
  await publishHealth({ lastRpc: name });
  return handler(params || {});
}]));

export function onDownload(event) {
  const downloadId = String(event.id);
  if (event.state === "started") activeDownloads.add(downloadId);
  if (["done", "failed", "cancelled", "denied"].includes(event.state)) activeDownloads.delete(downloadId);
  if (["started", "progress"].includes(event.state)) emit("download", { id: downloadId, state: event.state, filename: event.filename, bytes: event.bytes, total: event.total });
  if (event.state === "done" && event.path) {
    const id = String(event.id);
    downloads.set(id, event.path);
    if (downloads.size > 40) downloads.delete(downloads.keys().next().value);
    emit("download", { id, state: "done", filename: event.filename });
  } else if (["failed", "denied", "cancelled"].includes(event.state)) {
    emit("download", { id: String(event.id), state: event.state });
  }
}
