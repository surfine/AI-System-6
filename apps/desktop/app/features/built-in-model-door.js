// The built-in model's door, in Control Panel > Local Model. Lazy: loaded the
// first time that tab opens (ensureBuiltInModelDoorModule), and only on a Mac
// whose local server has the model helper. The writer sees the curated model,
// its exact download size and license, ticks a box to consent to that size,
// watches progress, can cancel, and reads the state (not downloaded, partly
// downloaded, downloading, installed, refused by the memory gate). Nothing is
// downloaded without that consent, and nothing here writes into a document.
(function installBuiltInModelDoor(root) {
  "use strict";
  if (root.AISystem6BuiltInModelDoor) return;

  const PROVIDER = "same-origin-node";
  let panel = null;
  let ui = null;
  let catalog = null;
  let apple = true;
  let progress = { done: 0, total: 0 };
  let phase = "checking";
  let refreshing = null;

  function registerServices() {
    const capabilities = root.AISystem6Capabilities;
    if (!capabilities) return false;
    // The deployment decides whether the on-device model exists here at all.
    const gate = capabilities.getCapability("device.status");
    if (!gate.available || gate.provider !== PROVIDER) return false;
    const routes = { "device.catalog": "/api/device-model/catalog", "device.download": "/api/device-model/download" };
    for (const [name, url] of Object.entries(routes)) {
      capabilities.registerServiceProvider(name, {
        id: PROVIDER,
        request: (input = {}) => fetch(url, { ...(input.init || {}), signal: input.signal || input.init?.signal }),
      });
      capabilities.setCapability(name, PROVIDER);
    }
    return true;
  }

  const gigabytes = (bytes) => `${(Number(bytes) / 1e9).toFixed(2)} GB`;
  const exact = (bytes) => Number(bytes).toLocaleString("en-US");

  function element(tag, className, key) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (key) { node.dataset.i18n = key; node.textContent = t(key); }
    return node;
  }

  // The door's controls sit directly in the Local Model panel's grid, the way
  // its own buttons and hints do, so they take the panel's spacing and the
  // era's skin without a stylesheet of their own.
  function build() {
    const title = element("p", "hint");
    const strong = element("strong", "", "builtin_model_title");
    title.append(strong);
    const lede = element("p", "hint", "builtin_model_lede");
    const facts = element("p", "hint");
    const license = element("p", "hint");
    const licenseLink = element("a", "", "builtin_model_license_link");
    licenseLink.target = "_blank";
    licenseLink.rel = "noopener noreferrer";
    const notes = element("p", "hint");
    const consentRow = element("label", "field-row");
    const consent = element("input");
    consent.type = "checkbox";
    consent.id = "built-in-model-consent";
    const consentText = element("span");
    consentRow.append(consent, consentText);
    const consentHint = element("p", "hint", "builtin_model_consent_hint");
    const meter = element("div", "progress-meter");
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    const fill = element("span");
    meter.append(fill);
    const status = element("p", "hint control-status");
    status.setAttribute("role", "status");
    const buttons = element("div", "button-row");
    const download = element("button", "btn default", "builtin_model_download");
    download.type = "button";
    download.id = "built-in-model-download";
    const cancel = element("button", "btn", "builtin_model_cancel");
    cancel.type = "button";
    cancel.id = "built-in-model-cancel";
    buttons.append(download, cancel);
    const nodes = [title, lede, facts, license, notes, consentRow, consentHint, meter, status, buttons];
    nodes.forEach((node) => { node.hidden = true; node.dataset.builtInModel = "door"; });
    consent.addEventListener("change", paint);
    download.addEventListener("click", () => { void startDownload(); });
    cancel.addEventListener("click", () => { void cancelDownload(); });
    return { nodes, facts, license, licenseLink, notes, consentRow, consent, consentText, consentHint, meter, fill, status, download, cancel, buttons, title, lede };
  }

  function mount() {
    panel = document.querySelector("#control-panel-local");
    if (!panel) return false;
    if (!ui) ui = build();
    if (!ui.nodes[0].isConnected) {
      const heading = panel.querySelector(":scope > h3");
      if (heading) heading.after(...ui.nodes); else panel.prepend(...ui.nodes);
    }
    return true;
  }

  function statusLine() {
    const pack = catalog.pack;
    if (phase === "downloading") {
      const percent = progress.total ? Math.min(100, Math.floor(progress.done / progress.total * 100)) : 0;
      return t("builtin_model_state_downloading", percent, gigabytes(progress.done), gigabytes(progress.total));
    }
    if (phase === "failed") return t("builtin_model_state_failed");
    if (phase === "cancelled") return t("builtin_model_state_cancelled");
    if (phase === "unavailable") return t("builtin_model_state_unavailable");
    if (apple === false) return t("builtin_model_state_not_apple_silicon");
    if (pack.state === "installed") return t("builtin_model_state_installed");
    if (!pack.memoryGate.allowed) return t("builtin_model_state_memory", gigabytes(pack.estimatedResidentBytes), gigabytes(pack.memoryGate.limitBytes));
    if (pack.state === "partial") return t("builtin_model_state_partial", gigabytes(pack.bytesOnDisk || 0), gigabytes(pack.totalBytes));
    return t("builtin_model_state_not_installed");
  }

  function paint() {
    if (!ui) return;
    const visible = Boolean(catalog?.pack) && phase !== "absent";
    ui.title.hidden = ui.lede.hidden = ui.facts.hidden = ui.license.hidden = ui.notes.hidden = ui.status.hidden = !visible;
    if (!visible) {
      ui.nodes.forEach((node) => { node.hidden = true; });
      return;
    }
    const pack = catalog.pack;
    const running = phase === "downloading";
    const installed = pack.state === "installed";
    const blocked = apple === false || !pack.memoryGate.allowed;
    ui.facts.textContent = t("builtin_model_facts", pack.displayName, gigabytes(pack.totalBytes), exact(pack.totalBytes));
    ui.license.textContent = `${t("builtin_model_license", pack.license)} `;
    if (pack.licenseURL) { ui.licenseLink.href = pack.licenseURL; ui.license.append(ui.licenseLink); }
    ui.notes.textContent = t("builtin_model_notes", gigabytes(pack.estimatedResidentBytes), pack.repo);
    ui.consentText.textContent = t("builtin_model_consent", gigabytes(pack.totalBytes));
    ui.status.textContent = statusLine();
    const offer = !installed && !blocked && !running;
    ui.consentRow.hidden = !offer;
    ui.consentHint.hidden = !offer || ui.consent.checked;
    ui.buttons.hidden = installed || blocked;
    ui.download.hidden = running;
    ui.download.disabled = !offer || !ui.consent.checked;
    ui.cancel.hidden = !running;
    ui.meter.hidden = !running;
    const percent = progress.total ? Math.min(100, Math.floor(progress.done / progress.total * 100)) : 0;
    ui.meter.setAttribute("aria-valuenow", String(percent));
    ui.fill.style.setProperty("--progress-fill-width", `${percent}%`);
    ui.meter.classList.toggle("is-working", running);
  }

  async function readEvents(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let last = null;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        if (!block.startsWith("data: ")) continue;
        let event;
        try { event = JSON.parse(block.slice(6)); } catch { continue; }
        last = event;
        if (event.type === "progress" || event.state === "running") {
          progress = { done: Number(event.bytesDone) || 0, total: Number(event.totalBytes) || progress.total };
          phase = "downloading";
          paint();
        }
      }
    }
    return last;
  }

  async function finish(last) {
    if (last?.type === "done" || last?.state === "done") {
      phase = "ready";
      await refresh(true);
      // The next Clio request probes again and finds the model.
      root.AISystem6ClioProvider?.invalidate?.("model-installed");
      return;
    }
    phase = last?.type === "cancelled" || last?.state === "cancelled" ? "cancelled"
      : last?.code === "memoryGate" ? "ready" : "failed";
    await refresh(true);
  }

  async function follow(response) {
    try {
      await finish(await readEvents(response));
    } catch {
      // The page closed the stream; the download itself goes on and is re-attached to.
      phase = "ready";
      paint();
    }
  }

  async function startDownload() {
    const pack = catalog?.pack;
    if (!pack || !ui.consent.checked || phase === "downloading") return;
    phase = "downloading";
    progress = { done: pack.bytesOnDisk || 0, total: pack.totalBytes };
    paint();
    try {
      const response = await root.AISystem6Capabilities.requestService("device.download", {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The exact size the writer was shown; the helper refuses any other number.
          body: JSON.stringify({ id: pack.id, consentBytes: pack.totalBytes }),
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.code === "download_in_progress") { await attach(); return; }
        phase = data.code === "device_memory_gate" ? "ready" : "failed";
        if (data.code === "device_consent_required" || data.code === "already_installed") { phase = "ready"; ui.consent.checked = false; }
        await refresh(true);
        return;
      }
      await follow(response);
    } catch {
      phase = "failed";
      paint();
    }
  }

  async function attach() {
    try {
      const response = await root.AISystem6Capabilities.requestService("device.download", { init: { method: "GET" } });
      if (response.ok && /text\/event-stream/.test(response.headers.get("content-type") || "")) await follow(response);
      else { phase = "ready"; await refresh(true); }
    } catch {
      phase = "failed";
      paint();
    }
  }

  async function cancelDownload() {
    ui.cancel.disabled = true;
    try { await root.AISystem6Capabilities.requestService("device.download", { init: { method: "DELETE" } }); }
    catch { /* the stream still reports how it ended */ }
    finally { ui.cancel.disabled = false; }
  }

  async function refresh(force = false) {
    if (!registerServices()) { phase = "absent"; paint(); return; }
    if (phase === "downloading" && !force) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const [catalogResponse, statusResponse] = await Promise.all([
          root.AISystem6Capabilities.requestService("device.catalog", {}),
          root.AISystem6Capabilities.requestService("device.status", {}).catch(() => null),
        ]);
        const data = catalogResponse.ok ? await catalogResponse.json() : null;
        if (!data || data.helper !== true) { catalog = null; phase = "absent"; paint(); return; }
        const device = statusResponse?.ok ? await statusResponse.json().catch(() => null) : null;
        apple = device?.builtIn?.reason !== "notAppleSilicon";
        catalog = data.pack ? data : null;
        if (!catalog) { phase = "absent"; paint(); return; }
        if (phase === "absent" || phase === "checking") phase = "ready";
        if (data.download?.state === "running" && phase !== "downloading") {
          phase = "downloading";
          progress = { done: data.download.bytesDone, total: data.download.totalBytes };
          paint();
          void attach();
          return;
        }
        paint();
      } catch {
        phase = catalog ? "unavailable" : "absent";
        paint();
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // Opening the Local Model tab: build the door once, then read the Mac again.
  async function show() {
    if (!mount()) return;
    await refresh();
  }

  new MutationObserver(() => { if (ui && catalog) paint(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  root.AISystem6BuiltInModelDoor = Object.freeze({ show, refresh, cancel: cancelDownload });
  root.AISystem6BuiltInModelDoorLoaded = true;
})(window);
