// Projection of windowRegistry/runningApps. Pins are personal shortcuts; they
// never construct an application or change its document/session state.
(() => {
  const storageKey = "ai-system-6-nextstep-dock";
  let pins;
  try { pins = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Defaults below. */ }
  if (!Array.isArray(pins)) pins = ["finder", "teachText", "clioTalk"];
  pins = [...new Set(pins.filter((id) => typeof id === "string"))];
  let root = null;
  let signature = "";
  let queued = false;
  const launching = new Map();
  const failures = new Set();

  function catalog() {
    const result = new Map();
    Object.entries(windowRegistry).forEach(([name, record]) => {
      const app = record.app || window.AISystem6Admissions.windowRecord(name)?.app;
      if (!app || ["accessories", "system"].includes(app) || (result.has(app) && name !== app)) return;
      result.set(app, { id: app, name, label: multiFinderAppLabels[app] || app });
    });
    return result;
  }

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(pins)); } catch { /* Session pins still work. */ }
    signature = "";
    sync();
  }

  async function activate(id) {
    if (launching.has(id)) return launching.get(id);
    const entry = catalog().get(id);
    if (!entry) return;
    const app = runningApps.get(id);
    const live = windowsForApp(id).filter((win) => !win.classList.contains("is-hidden"));
    if (live.length && isMultiFinderMode()) {
      switchToApp(id);
      const candidate = live.find((win) => !win.classList.contains("is-minimized"));
      if (candidate) focusWindow(candidate);
      return;
    }
    failures.delete(id);
    const request = Promise.resolve().then(() => openWindow(app?.lastWindowName || entry.name)).then(() => {
      if (!windowsForApp(id).some((win) => !win.classList.contains("is-hidden"))) failures.add(id);
    }).catch(() => failures.add(id)).finally(() => {
      launching.delete(id);
      signature = "";
      sync();
    });
    launching.set(id, request);
    sync();
    return request;
  }

  function button(label, run) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", run);
    return node;
  }

  function tile(label, run, iconId, key) {
    const node = button("", (event) => {
      if (event.detail === 0 || event.pointerType === "touch" || event.pointerType === "pen") run();
      else node.focus();
    });
    node.addEventListener("dblclick", run);
    node.className = "nextstep-dock-tile";
    node.dataset.dockKey = key;
    node.setAttribute("aria-label", label);
    node.title = label;
    node.innerHTML = renderSystemIcon(iconId, { size: "large" });
    return node;
  }

  function sync() {
    queued = false;
    if (window.AISystem6Theme.getCurrentTheme() !== "nextstep") {
      root?.remove(); root = null; signature = "";
      return;
    }
    const apps = catalog();
    const running = getRunningApps();
    const minis = Array.from(document.querySelectorAll(".window.is-minimized:not(.is-hidden):not(.is-app-hidden)"))
      .filter((win) => !hiddenAppIds.has(getWindowAppId(win)));
    const nextSignature = JSON.stringify([pins, running.map((app) => [app.id, app.hidden, app.windowCount]),
      Array.from(launching.keys()), Array.from(failures), minis.map((win) => [win.dataset.window, applicationWindowTitle(win)]), t("nextstep_dock")]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    if (!root) {
      root = document.createElement("aside");
      root.className = "nextstep-dock";
      root.setAttribute("aria-label", t("nextstep_dock"));
      document.body.append(root);
    }
    const focusedKey = root.contains(document.activeElement) ? document.activeElement.dataset.dockKey : "";
    root.replaceChildren();
    function addApp(id, pinned) {
      const entry = apps.get(id);
      if (!entry) return;
      const node = tile(entry.label, () => activate(id), entry.name, `app:${id}`);
      node.dataset.appId = id;
      node.dataset.state = launching.has(id) ? "launching" : failures.has(id) ? "failed"
        : running.some((app) => app.id === id) ? "running" : "stopped";
      node.draggable = true;
      node.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("application/x-system6-dock", id);
        event.dataTransfer.effectAllowed = "move";
      });
      node.addEventListener("dragend", (event) => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (pinned && target && !target.closest(".nextstep-dock") && event.dataTransfer.dropEffect === "move") {
          pins = pins.filter((value) => value !== id); save();
        }
      });
      node.addEventListener("dragover", (event) => event.preventDefault());
      node.addEventListener("drop", (event) => {
        event.preventDefault();
        const source = event.dataTransfer.getData("application/x-system6-dock");
        if (!apps.has(source) || source === id) return;
        pins = pins.filter((value) => value !== source);
        pins.splice(Math.max(0, pins.indexOf(id)), 0, source);
        save();
      });
      node.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        pins = pinned ? pins.filter((value) => value !== id) : [...pins, id];
        save();
      });
      root.append(node);
    }
    pins.forEach((id) => addApp(id, true));
    root.append(document.createElement("hr"));
    running.filter((app) => !pins.includes(app.id)).forEach((app) => addApp(app.id, false));
    if (minis.length) root.append(document.createElement("hr"));
    minis.forEach((win) => {
      const node = tile(t("nextstep_restore", applicationWindowTitle(win)),
        () => window.AISystem6NextstepShell.restore(win), "document", `window:${win.dataset.window}`);
      node.dataset.miniwindow = win.dataset.window;
      root.append(node);
    });
    const settings = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = t("nextstep_dock_edit");
    settings.append(summary);
    apps.forEach((entry, id) => {
      const row = document.createElement("div");
      const pinned = pins.includes(id);
      row.append(button(`${pinned ? "−" : "+"} ${entry.label}`, () => {
        pins = pinned ? pins.filter((value) => value !== id) : [...pins, id]; save();
      }));
      if (pinned && pins.indexOf(id) > 0) row.append(button(t("nextstep_move_up"), () => {
        const index = pins.indexOf(id); [pins[index - 1], pins[index]] = [pins[index], pins[index - 1]]; save();
      }));
      settings.append(row);
    });
    root.append(settings);
    if (focusedKey) Array.from(root.querySelectorAll("[data-dock-key]")).find((node) => node.dataset.dockKey === focusedKey)?.focus({ preventScroll: true });
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  }
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer.types.includes("application/x-system6-dock")) {
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
    }
  });
  document.addEventListener("drop", (event) => {
    if (event.dataTransfer.types.includes("application/x-system6-dock")) event.preventDefault();
  });
  document.addEventListener("ai-system6-themechange", schedule);
  window.AISystem6NextstepDock = Object.freeze({ sync: schedule, activate });
})();
