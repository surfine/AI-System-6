// Lazy native host adapter. The same writing objects and persistence path are
// used in the browser and in the Mac application.
window.AISystem6TinyShell = (() => {
  "use strict";
  let fileActivities = 0, lastDownload = null;
  const pendingNativeDownloads = new Map();
  let initialized = false, busy = false, lastUpdate = null, statusEl;
  let collectionQueue = Promise.resolve(), filesOpening = false;
  const recentRoutes = new Map();
  const call = async (name, data = {}) => {
    try { return await window.tiny.api.call("shell." + name, data); }
    catch (error) { throw error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error?.message || error)); }
  };
  const preferencesKey = "ai-system6-native-preferences";
  function preferences() {
    try { return JSON.parse(localStorage.getItem(preferencesKey) || "{}"); } catch { return {}; }
  }
  function activeWork() {
    return fileActivities > 0 || pendingNativeDownloads.size > 0 || (typeof activeAbortController !== "undefined" && !!activeAbortController)
      || (typeof activeLongTasks !== "undefined" && activeLongTasks.size > 0)
      || !!document.querySelector("[aria-busy='true'], .is-generating, .is-loading")
      || !deskPersistenceWritable;
  }
  function message(value) {
    if (statusEl) statusEl.textContent = value;
    else setStatus(value);
  }
  async function canonical(value) {
    if (value instanceof Blob) {
      const hash = await crypto.subtle.digest("SHA-256", await value.arrayBuffer());
      return { blob: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join(""), size: value.size, type: value.type };
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return { binary: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join(""), size: bytes.byteLength };
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return Promise.all(value.map(canonical));
    if (value && typeof value === "object") {
      const result = {};
      for (const key of Object.keys(value).sort()) result[key] = await canonical(value[key]);
      return result;
    }
    return value;
  }
  async function fingerprint() {
    const db = await openAppDb();
    try {
      // Read content, settings and revision history in one transaction. Only
      // the writer fence, save epoch and window session are transient.
      const names = [...db.objectStoreNames].sort();
      if (!names.length) throw new Error(t("native_storage_failed"));
      const tx = db.transaction(names, "readonly");
      const done = window.AISystem6StorageTransactions.transactionDone(tx);
      const reads = names.map((name) => {
        const store = tx.objectStore(name);
        return Promise.all([idbRequest(store.getAllKeys()), idbRequest(store.getAll())]);
      });
      const records = await Promise.all([...reads, done]);
      records.pop();
      const stores = names.map((name, index) => {
        const [keys, values] = records[index];
        return [name, keys.flatMap((key, i) => {
          if (name === "keyval" && (key === "__ai_system6_write_fence__" || key === "storageVersion"
              || String(key).startsWith("workingSession:"))) return [];
          let value = values[i];
          if (name === "keyval" && key === "settings" && value && typeof value === "object") {
            value = { ...value };
            delete value.localModelReady;
            delete value.startupOpenedWindowNames;
          }
          return [[key, value]];
        })];
      });
      const prefs = preferences();
      const content = await canonical({ stores, native: { clipboard: prefs.clipboard === true, hotkey: prefs.hotkey || "" } });
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(content)));
      return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } finally { db.close(); }
  }
  async function collect(candidate) {
    if (!candidate?.text?.trim() || busy) return;
    const project = getActiveProject();
    if (!project) { message(t("no_project_mounted")); return; }
    const projectId = project.id;
    const edited = await showInputDialog({ title: t(candidate.source === "screenshot" ? "native_capture" : "scrapbook"), message: t("native_edit_candidate"),
      defaultValue: candidate.text, multiline: true });
    if (edited === null || !edited.trim()) return;
    candidate = { ...candidate, text: edited };
    const title = candidate.text.trim().split("\n")[0].slice(0, 80);
    const accepted = await window.tiny.dialog.confirm(t("native_collect_confirm", project.name));
    if (!accepted) return;
    if (getActiveProject()?.id !== projectId) { message(t("native_project_changed")); return; }
    createScrap(title, candidate.text, { sourceKind: candidate.source || "native", source: { url: candidate.sourceURL || "", sourceKind: candidate.source || "native" } });
    if (!await saveDeskState()) throw new Error(t("native_storage_failed"));
    openWindow("scrapbook");
  }
  function enqueueCollection(candidate) {
    collectionQueue = collectionQueue.then(async () => {
      if (busy) return;
      const end = beginFileActivity();
      try { await collect(candidate); } finally { end(); }
    }).catch((e) => message(t("native_operation_failed", e.message)));
    return collectionQueue;
  }
  async function checkUpdate({ silent = false } = {}) {
    if (busy) return;
    try {
      lastUpdate = await call("checkUpdate");
      if (lastUpdate.available) message(t("native_update_available", lastUpdate.latest));
      else if (!silent) message(t("native_update_current"));
      const button = document.querySelector("#native-install-update");
      if (button) button.disabled = !lastUpdate.available;
    } catch (e) { if (!silent) message(t("native_update_failed", e.message)); }
  }
  async function installUpdate() {
    if (busy || !lastUpdate?.available) return;
    if (activeWork()) { message(t("native_update_wait")); return; }
    busy = true;
    // Freeze input during preparation so the snapshot cannot become stale while
    // the download is running. Existing tasks have already been checked above.
    const surfaces = [...document.body.children].filter((el) => el instanceof HTMLElement && el.tagName !== "SCRIPT");
    const inertStates = surfaces.map((el) => el.inert);
    surfaces.forEach((el) => { el.inert = true; });
    let browserFrozen = false;
    const browser = window.AISystem6Native?.browser && window.webkit?.messageHandlers?.aisystem6Browser;
    try {
      if (browser) {
        if (!await browser.postMessage({ method: "updateFreeze", frozen: true })) throw new Error(t("native_update_wait"));
        browserFrozen = true;
      }
      if (!await saveDeskState() || activeWork()) throw new Error(t("native_update_wait"));
      const dataFingerprint = await fingerprint();
      message(t("native_update_installing"));
      await call("installUpdate", { latest: lastUpdate.latest, saved: true, dataFingerprint });
    } catch (e) {
      if (browserFrozen) await browser.postMessage({ method: "updateFreeze", frozen: false }).catch(() => {});
      surfaces.forEach((el, index) => { el.inert = inertStates[index]; });
      busy = false;
      message(t("native_update_failed", e.message));
    }
  }
  async function openFiles() {
    if (busy || filesOpening) return;
    filesOpening = true;
    const end = beginFileActivity();
    try {
    const pending = await call("files");
    if (!pending.length) return;
    for (const item of pending) {
      const accepted = await window.tiny.dialog.confirm(t("native_import_confirm", item.name));
      if (!accepted) continue;
      const result = await call("readFile", { id: item.id });
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      if (/\.json$/i.test(result.name)) {
        const backup = JSON.parse(new TextDecoder().decode(bytes));
        await importProjectBackupAsNewProject(backup);
      } else {
        selectedImportFiles = [new File([bytes], result.name)];
        await previewImportFiles();
        openWindow("importUtility");
      }
    }
    } finally { filesOpening = false; end(); }
  }
  async function command(id) {
    if (busy) return;
    if (id === "settings") { await openWindow("control"); setControlTab("native"); }
    if (id === "check-update") await checkUpdate();
    if (["screenshot", "selected-text"].includes(id)) {
      const end = beginFileActivity();
      try { await enqueueCollection(await call(id === "screenshot" ? "screenshot" : "selection")); }
      finally { end(); }
    }
  }
  async function onEvent({ type, data }) {
    if (busy && type !== "download") return;
    try {
      if (type === "collect") await enqueueCollection(data);
      if (type === "clipboard-unavailable") {
        const checkbox = document.querySelector("#native-clipboard");
        if (checkbox) checkbox.checked = false;
        message(t("native_clipboard_unavailable"));
      }
      if (type === "command") await command(data);
      if (type === "files") await openFiles();
      if (type === "download") receiveNativeDownload(data, false);
      if (type === "notification") {
        const exists = systemNotifications.some((entry) => entry.id === data);
        if (exists) openSystemNotification(data); else message(t("native_target_missing"));
      }
      if (type === "route") {
        const key = JSON.stringify([data.target, data.id]);
        const now = Date.now();
        if (now - (recentRoutes.get(key) || 0) < 5000) return;
        recentRoutes.set(key, now);
        for (const [value, time] of recentRoutes) if (now - time >= 5000) recentRoutes.delete(value);
        if (data.target === "settings") { await command("settings"); return; }
        const item = data.id ? (data.target === "project" ? projects.find((p) => p.id === data.id)
          : data.target === "scrapbook" ? scraps.find((p) => p.id === data.id)
          : chatFiles.find((p) => p.id === data.id && p.type === "text")) : null;
        if (data.id && !item) { message(t("native_target_missing")); return; }
        const projectId = item && (data.target === "project" ? item.id : item.projectId);
        if (projectId && (projectId !== activeProjectId || !isProjectMounted)) {
          const project = projects.find((p) => p.id === projectId);
          if (!project) { message(t("native_target_missing")); return; }
          if (activeWork() || busy) { message(t("native_update_wait")); return; }
          if (!await window.tiny.dialog.confirm(t("native_open_project_confirm", project.name))) return;
          if (!await saveDeskState()) throw new Error(t("native_storage_failed"));
          await switchProject(project.id);
          if (activeProjectId !== project.id || !isProjectMounted) throw new Error(t("native_storage_failed"));
        }
        if (data.target === "project") await openWindow("projects");
        else if (data.target === "scrapbook") {
          if (item) { selectedScrapId = item.id; selectedScrapIds.clear(); selectedScrapIds.add(item.id); renderScraps(); }
          await openWindow("scrapbook");
        } else if (item) openTextFile(item.id);
        else await openWindow("teachText");
      }
    } catch (e) { message(t("native_operation_failed", e.message)); }
  }
  function panel() {
    const general = document.querySelector("#control-tab-general");
    const generalPanel = document.querySelector("#control-panel-general");
    if (!general || !generalPanel) throw new Error("Control Panel unavailable");
    const tab = general.cloneNode(true);
    tab.id = "control-tab-native"; tab.dataset.controlTab = "native";
    tab.setAttribute("aria-controls", "control-panel-native");
    tab.querySelector("[data-i18n]").dataset.i18n = "native_settings";
    tab.querySelector("[data-i18n]").textContent = t("native_settings");
    tab.addEventListener("click", () => setControlTab("native"));
    general.parentNode.append(tab);
    const pane = document.createElement("div");
    pane.id = "control-panel-native"; pane.dataset.controlPanel = "native"; pane.hidden = true;
    pane.setAttribute("role", "tabpanel"); pane.setAttribute("aria-labelledby", tab.id);
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = "native-clipboard";
    checkbox.checked = preferences().clipboard === true;
    const label = document.createElement("label"); label.className = "control-field";
    label.append(checkbox, document.createTextNode(t("native_clipboard"))); pane.append(label);
    const shortcut = document.createElement("input"); shortcut.type = "text"; shortcut.value = preferences().hotkey || "";
    shortcut.placeholder = "cmd+shift+k";
    const shortcutLabel = document.createElement("label"); shortcutLabel.className = "control-field";
    shortcutLabel.append(document.createTextNode(t("native_shortcut")), shortcut); pane.append(shortcutLabel);
    async function changed() {
      const next = { clipboard: checkbox.checked, hotkey: shortcut.value.trim().toLowerCase() };
      try { await call("settings", next); localStorage.setItem(preferencesKey, JSON.stringify(next)); }
      catch (e) { message(t("native_operation_failed", e.message)); checkbox.checked = preferences().clipboard === true; shortcut.value = preferences().hotkey || ""; }
    }
    checkbox.addEventListener("change", changed); shortcut.addEventListener("change", changed);
    for (const [key, action, id] of [["native_check_update", checkUpdate, "native-check-update"],
      ["native_install_update", installUpdate, "native-install-update"], ["native_capture", () => command("screenshot"), "native-capture"],
      ["native_selection", () => command("selected-text"), "native-selection"],
      ["native_preview", () => call("previewFile"), "native-preview"],
      ["native_close_preview", () => call("closePreview"), "native-close-preview"],
      ["native_reveal_download", revealDownload, "native-reveal-download"],
      ["native_cancel_download", cancelDownload, "native-cancel-download"]]) {
      const button = document.createElement("button"); button.type = "button"; button.className = "system-button";
      button.id = id; button.textContent = t(key); button.disabled = id === "native-install-update";
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true;
        try { await action(); }
        catch (e) { message(t("native_operation_failed", e.message)); }
        finally { button.disabled = id === "native-install-update" && (!lastUpdate?.available || busy); }
      });
      pane.append(button);
    }
    statusEl = document.createElement("p"); statusEl.setAttribute("role", "status"); pane.append(statusEl);
    generalPanel.parentNode.append(pane);
  }
  async function init() {
    if (initialized || !window.tiny?.api || location.origin !== "http://127.0.0.1:4173") return;
    initialized = true;
    panel();
    window.tiny.api.on("system6-shell", onEvent);
    const dataFingerprint = await fingerprint();
    const build = window.AISystem6BuildInfo;
    const report = await call("ready", { dataFingerprint, frontendVersion: build?.version, frontendBuild: build?.build, frontendSource: build?.sourceCommit });
    await call("settings", preferences());
    if (report.pendingFiles) await openFiles();
    if (cloudRuntimeApiKey && typeof window.migrateTinyShellCloudCredential === "function") {
      const accepted = await window.tiny.dialog.confirm(t("native_key_migration"));
      if (accepted) await window.migrateTinyShellCloudCredential();
    }
    void checkUpdate({ silent: true });
  }
  function notify(item) {
    if (!initialized || !["done", "failed", "error"].includes(item?.state)) return;
    void call("notify", { id: item.id, title: "AI System 6" }).catch(() => {});
  }
  function receiveNativeDownload(event, nativeBrowser = true) {
    if (event.state === "started") { pendingNativeDownloads.set(event.id, nativeBrowser); }
    if (["done", "failed", "cancelled", "denied"].includes(event.state)) {
      pendingNativeDownloads.delete(event.id);
      if (event.state === "done") { lastDownload = { id: event.id, nativeBrowser }; message(t("native_download_done", event.filename || "")); }
      else message(t(event.state === "cancelled" ? "native_download_cancelled" : "native_download_failed"));
    }
  }
  async function revealDownload() {
    if (!lastDownload) { message(t("native_target_missing")); return; }
    if (lastDownload.nativeBrowser) {
      const ok = await window.webkit.messageHandlers.aisystem6Browser.postMessage({ method: "downloadReveal", id: lastDownload.id });
      if (!ok) message(t("native_target_missing"));
    } else await call("revealDownload", { id: lastDownload.id });
  }
  async function cancelDownload() {
    for (const [id, nativeBrowser] of pendingNativeDownloads) {
      if (nativeBrowser) await window.webkit.messageHandlers.aisystem6Browser.postMessage({ method: "downloadCancel", id });
      else await call("cancelDownload", { id });
    }
  }
  function beginFileActivity() {
    if (busy) throw new Error(t("native_update_installing"));
    fileActivities += 1;
    let finished = false;
    return () => { if (!finished) { finished = true; fileActivities -= 1; } };
  }
  return { init, fingerprint, activeWork, checkUpdate, installUpdate, notify, beginFileActivity,
    receiveNativeDownload, isInstalling: () => busy };

})();
