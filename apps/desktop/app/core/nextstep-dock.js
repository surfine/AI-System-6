// Projection of windowRegistry/runningApps. Pins are personal shortcuts; they
// never construct an application or change its document/session state.
//
// NeXTSTEP 3.3 keeps three classes of object in the Dock column and they are
// not interchangeable: the fixed application icons, the icons of applications
// that are merely running, and one miniwindow per window. The data was already
// kept apart here (pins / runningApps / the miniaturized windows on the desk);
// what was wrong was the projection -- all three went into one flat list of
// tiles separated by `<hr>`, so an application icon and a window's miniwindow
// were told apart only by their order. Each class now renders into its own
// labelled region inside the one Dock root, from that same single source.
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

  // The three regions, in the order the 3.3 Dock reads them top to bottom: the
  // fixed applications directly under the menu bar, the applications that are
  // running but not fixed, and the window miniwindows at the foot of the
  // column. Labels come from strings the desk already ships, so a region never
  // needs a new translation to say what it holds.
  const REGIONS = Object.freeze([
    { id: "fixed", labelKey: "nextstep_dock" },
    { id: "running", labelKey: "applications" },
    { id: "windows", labelKey: "nextstep_windows" },
  ]);

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

  function region(descriptor) {
    const label = t(descriptor.labelKey);
    const node = document.createElement("section");
    node.className = `nextstep-dock-region nextstep-dock-${descriptor.id}`;
    node.dataset.dockRegion = descriptor.id;
    node.setAttribute("aria-label", label);
    const heading = document.createElement("h2");
    heading.className = "nextstep-dock-region-label";
    heading.textContent = label;
    node.append(heading);
    return node;
  }

  // A region with nothing in it keeps its place in the structure and hides.
  // The contract pins that: three regions, not one list that grows and shrinks.
  function settle(node) {
    if (!node.querySelector(".nextstep-dock-tile")) node.setAttribute("hidden", "");
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
    function addApp(id, pinned, container) {
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
      container.append(node);
    }
    // A miniwindow is one window, never one bucket per application: two open
    // documents of the same application stay two icons, each named for its own
    // window, so restoring one cannot restore the other by accident.
    function addMiniwindow(win, container) {
      const title = applicationWindowTitle(win);
      const node = tile(t("nextstep_restore", title),
        () => window.AISystem6NextstepShell.restore(win), "document", `window:${win.dataset.window}`);
      node.dataset.miniwindow = win.dataset.window;
      node.classList.add("is-miniwindow");
      const caption = document.createElement("span");
      caption.className = "nextstep-dock-tile-label";
      caption.textContent = title;
      node.append(caption);
      container.append(node);
    }
    const [fixedRegion, runningRegion, windowRegion] = REGIONS.map(region);
    pins.forEach((id) => addApp(id, true, fixedRegion));
    running.filter((app) => !pins.includes(app.id)).forEach((app) => addApp(app.id, false, runningRegion));
    minis.forEach((win) => addMiniwindow(win, windowRegion));
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
    root.replaceChildren(settle(fixedRegion), settle(runningRegion), settle(windowRegion), settings);
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
