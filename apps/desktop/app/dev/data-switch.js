// Break-UI data switch. Development only: loaded lazily when the page was opened
// on localhost with ?data=demo|worst|empty|one|huge, never otherwise.
//
// The fixtures are Project Hard Disk backups (tooling/dev/worst-case-disks.mjs
// writes them to app/dev/worst-case/, git-ignored). They are mounted through the
// shared-disk path -- openSharedProjectDisk -- so the data crosses the same
// boundary a user's imported backup does. "Demo" puts back the project that was
// mounted before the first fixture replaced it.
(() => {
  const names = ["demo", "worst", "empty", "one", "huge"];
  const labels = { demo: "Demo", worst: "Worst", empty: "Empty", one: "One", huge: "Huge" };
  const local = /^(localhost|127\.0\.0\.1)$/.test(String(window.location?.hostname || ""));
  const match = String(window.location?.search || "").match(/[?&]data=([a-z]+)/i);
  const name = match ? match[1].toLowerCase() : "";
    if (!local || !names.includes(name)) return;

  const homeKey = "aisystem6.devData.home";
  const hashKey = "aisystem6.devData.hash.";
  const mountKey = () => (typeof sharedProjectDiskMountKey === "string" ? sharedProjectDiskMountKey : "");

  function hrefFor(next) {
    const params = new URLSearchParams(window.location.search);
    params.set("data", next);
    return `${window.location.pathname}?${params}`;
  }

  function installControl() {
    const track = document.createElement("div");
    track.setAttribute("role", "group");
    track.setAttribute("aria-label", "Data set");
    track.dataset.devDataSwitch = "";
    Object.assign(track.style, {
      position: "fixed", left: "50%", bottom: "6px", transform: "translateX(-50%)", zIndex: "2147483000",
      display: "flex", gap: "2px", padding: "2px", background: "#c8c8c8", borderRadius: "8px",
      font: "12px -apple-system, BlinkMacSystemFont, sans-serif", boxShadow: "0 0 0 1px rgba(0,0,0,.25)",
    });
    names.forEach((next) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = labels[next];
      button.setAttribute("aria-pressed", String(next === name));
      Object.assign(button.style, {
        font: "inherit", color: "#000", border: "0", borderRadius: "6px", padding: "4px 10px", cursor: "default",
        minHeight: "24px", background: next === name ? "#fff" : "transparent", transition: "none",
      });
      button.addEventListener("click", () => { if (next !== name) window.location.assign(hrefFor(next)); });
      track.append(button);
    });
    document.body.append(track);
  }

  async function mountHome() {
    let home = "";
    try { home = localStorage.getItem(homeKey) || ""; } catch { /* no storage: nothing to restore */ }
    const project = home ? projects.find((item) => item.id === home) : null;
    if (!project || activeProjectId === project.id) return;
    mountProject(project);
    closeProjectScopedWindows();
    scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
    await loadActiveProjectReferences();
    await saveDeskState();
  }

  const idsKey = "aisystem6.devData.ids";
  const devIds = () => {
    try { return new Set(JSON.parse(localStorage.getItem(idsKey) || "[]")); } catch { return new Set(); }
  };
  const rememberDevId = (id) => {
    try { localStorage.setItem(idsKey, JSON.stringify([...devIds().add(id)])); } catch { /* optional */ }
  };

  async function mountFixture() {
    const route = `dev-${name}`;
    try {
      if (activeProjectId && !devIds().has(activeProjectId) && !localStorage.getItem(homeKey)) localStorage.setItem(homeKey, activeProjectId);
    } catch { /* storage blocked: Demo then has no project to restore */ }
    await loadClassicScriptOnce(`app/dev/worst-case/${name}.js`);
    const backup = window.AISystem6SharedProjectDisks?.[route];
    if (!backup) return;
    const extras = window.AISystem6SharedProjectDisks?.[`${route}-extras`] || [];
    // Re-importing on every reload would pile up copies. A regenerated fixture
    // has a new seal, and only then do the remembered mounts get dropped.
    try {
      const seal = backup.integrity?.contentHash || "";
      if (localStorage.getItem(hashKey + name) !== seal) {
        localStorage.removeItem(mountKey() + route);
        extras.forEach((_, index) => localStorage.removeItem(mountKey() + `${route}-x${index}`));
        localStorage.setItem(hashKey + name, seal);
      }
    } catch { /* a fresh copy per visit is acceptable */ }
    // Other projects first, so the main disk is the one left mounted. They go
    // through the importer the shared-disk path ends in.
    for (const [index, extra] of extras.entries()) {
      const key = mountKey() + `${route}-x${index}`;
      let known = "";
      try { known = localStorage.getItem(key) || ""; } catch { /* import again */ }
      if (known && projects.some((project) => project.id === known)) continue;
      const before = activeProjectId;
      await importProjectBackupAsNewProject(extra);
      if (activeProjectId && activeProjectId !== before) {
        rememberDevId(activeProjectId);
        try { localStorage.setItem(key, activeProjectId); } catch { /* optional */ }
      }
    }
    // The mount path asks the lazy loader for the route; the fixture is already
    // here, so the loader's own "already loaded" flag answers it.
    window[`AISystem6SharedProjectDisk:${route}`] = true;
    await openSharedProjectDisk(route);
    if (activeProjectId) rememberDevId(activeProjectId);
  }

  installControl();
  (name === "demo" ? mountHome() : mountFixture()).catch((error) => {
    console.error("data switch", error);
    if (typeof setStatus === "function") setStatus(`Data switch failed: ${error.message}`);
  });
})();
window.DataSw = true;
