// Feature module: about-this-mac — 「关于本机」About This Mac, the agent-era
// instrument the 2026-10-30 board gives the Apple menu's first row.
//
// System 6's About This Macintosh listed every program and its memory. This
// desk's version lists the agent's facts instead, read only:
//
// - what this desk is running (version, appearance),
// - the active model/provider and whether it is local or cloud,
// - the agent engine and its sandbox state (GET /api/agent/status, behind the
//   per-boot token; routes/agent.js answers without any path),
// - the storage Project Hard Disk uses (the browser's own estimate for this
//   origin's IndexedDB),
// - the per-boot token's state without ever showing it: a fact about the
//   token, never the token.
//
// Nothing here writes and nothing here is a setting: the window reads the
// desk's existing runtime state and one read-only route, and stores nothing.
//
// The layout is the 2026-10-30 board's (AboutMac.dc.html): a System 6
// masthead — the compact Mac drawn in 1-bit strokes beside the desk's name
// at 24px and its build at 14px — then the facts in ruled sections with
// 16px titles, Project Hard Disk's share drawn as the board's usage bar
// (an ink-ruled track with an ink fill), everything else at 12px.
//
// Lazy on purpose, exactly like its sibling about-desk.js: the window is built
// here the first time it is asked for (module-built window pattern), so boot
// pays nothing for a window most sessions never open.
//
// Contract: tests/features/about-this-mac.test.mjs

(function installAboutThisMac() {
  if (window.AISystem6AboutThisMacLoaded) return;

  // Facts fetched while the window is open. `null` means "not known yet or
  // not knowable", and the row says so instead of inventing a number.
  let engineState = null;
  let storageState = null;
  let generation = 0;

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function aboutThisMacWindow() {
    return document.querySelector('[data-window="aboutThisMac"]');
  }

  function installAboutThisMacWindow() {
    if (aboutThisMacWindow()) return;
    window.AISystem6ApplicationShell.createWindow({
      windowName: "aboutThisMac",
      windowClass: "about-this-mac-window",
      labelledBy: "about-this-mac-title",
      titleKey: "about_this_mac",
      title: "About This Mac",
      shade: true,
      paneClass: "about-this-mac-pane",
      paneHtml: `<div class="about-this-mac-body"></div>`,
    });
  }

  // ---- The facts -----------------------------------------------------------
  //
  // Every fact comes from state the desk already holds; the only network call
  // is the read-only status route, and it happens only while this window is
  // open. Neither the token nor any credential reaches the DOM.

  function versionText() {
    const info = { ...(typeof getAppBuildInfo === "function" ? getAppBuildInfo() : {}), ...(typeof appVersionInfo === "object" && appVersionInfo ? appVersionInfo : {}) };
    return {
      version: String(info.version || ""),
      build: String(info.build || ""),
    };
  }

  function appearanceLine() {
    const theme = window.AISystem6Theme;
    const current = theme?.getCurrentTheme?.();
    const entry = typeof current === "object" ? current : theme?.getTheme?.(current);
    const name = entry ? (t(entry.labelKey) || entry.label || "") : "";
    if (!name) return t("about_this_mac_appearance_unknown");
    return t("about_this_mac_appearance_value", name, String(entry.year || ""));
  }

  // The one model line, with the local/cloud word in it — the board's
  // 「引擎：…（本机）」 shape. The product context is the allowlisted snapshot
  // the desk already keeps for Clio's own answers.
  function modelLine() {
    const context = window.AISystem6ProductContext?.snapshot?.();
    const route = String(context?.provider?.route || "");
    const name = String(context?.provider?.model || context?.provider?.provider || "");
    if (route === "cloud") return t("about_this_mac_model_cloud", name);
    if (route === "website") {
      if (context?.quota?.state === "exhausted") return t("about_this_mac_model_shared_spent");
      return Number.isFinite(Number(context?.quota?.remainingSessionRequests))
        ? t("about_this_mac_model_shared_left", Number(context.quota.remainingSessionRequests))
        : t("about_this_mac_model_shared");
    }
    if (route === "local" && (context?.lmStudio?.loaded || name)) {
      const display = typeof getLocalModelDisplayName === "function" ? getLocalModelDisplayName() : name;
      return t("about_this_mac_model_local", display || name);
    }
    return t("about_this_mac_model_none");
  }

  // The per-boot token's state, read without ever moving its value: the Mac
  // shell sets it on the window at load; the npm-start page keeps its copy for
  // the tab (the agent module adopts it when it loads). Both places are read
  // as a yes/no, never printed.
  function tokenHeld() {
    if (typeof window.AISystem6AgentToken === "string" && window.AISystem6AgentToken) return true;
    try {
      if (/(?:^|[#&])ais6-agent-token=[a-f0-9]{64}(?:&|$)/.test(String(location.hash || ""))) return true;
      return /^[a-f0-9]{64}$/.test(String(sessionStorage.getItem("ai-system6-agent-token") || ""));
    } catch {
      return false;
    }
  }

  function tokenLine() {
    return t(tokenHeld() ? "about_this_mac_token_ok" : "about_this_mac_token_none");
  }

  async function fetchEngineStatus() {
    // Every same-origin /api call crosses the service boundary: the desk's own
    // agent.harness provider (core/service-providers.js) owns this route.
    if (typeof window.AISystem6Capabilities?.requestService !== "function") return null;
    let token = "";
    if (typeof window.AISystem6AgentToken === "string") token = window.AISystem6AgentToken;
    else {
      try { token = String(sessionStorage.getItem("ai-system6-agent-token") || ""); } catch {}
    }
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    try {
      const response = await window.AISystem6Capabilities.requestService("agent.harness", {
        path: "/api/agent/status",
        init: {
          headers: { "X-AI-System6-Agent-Token": token },
          cache: "no-store",
        },
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload || typeof payload !== "object") return null;
      return {
        installed: payload.engine?.installed === true,
        version: String(payload.engine?.version || ""),
        seatbelt: payload.sandbox?.seatbelt === true,
      };
    } catch {
      return null;
    }
  }

  function storageEstimate() {
    if (typeof navigator?.storage?.estimate !== "function") return Promise.resolve(null);
    return navigator.storage.estimate()
      .then((estimate) => ({
        usage: Number(estimate?.usage) || 0,
        quota: Number(estimate?.quota) || 0,
      }))
      .catch(() => null);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    for (const [unit, size] of [["GB", 1024 ** 3], ["MB", 1024 ** 2], ["KB", 1024]]) {
      if (bytes >= size) return `${(Math.round((bytes / size) * 10) / 10).toLocaleString()} ${unit}`;
    }
    return `${bytes.toLocaleString()} B`;
  }

  function projectCounts() {
    const disks = typeof projects !== "undefined" && Array.isArray(projects) ? projects.length : 0;
    const files = (typeof chatFiles !== "undefined" && Array.isArray(chatFiles) ? chatFiles : [])
      .filter((file) => file?.artifactKind !== window.AISystem6RunReceipts?.artifactKind).length;
    return { disks, files };
  }

  // ---- The rows ------------------------------------------------------------

  function engineLine() {
    if (!engineState) return el("span", "about-this-mac-quiet", t("about_this_mac_engine_unreachable"));
    return el("span", "", engineState.installed
      ? t("about_this_mac_engine_value", engineState.version)
      : t("about_this_mac_engine_missing"));
  }

  function sandboxLine() {
    if (!engineState) return el("span", "about-this-mac-quiet", t("about_this_mac_sandbox_unknown"));
    return el("span", "", engineState.seatbelt
      ? t("about_this_mac_sandbox_seatbelt")
      : t("about_this_mac_sandbox_off"));
  }

  function storageLines() {
    if (!storageState || !storageState.quota) {
      return [el("span", "about-this-mac-quiet", t("about_this_mac_storage_unknown"))];
    }
    // The board's usage bar: an ink-ruled track with an ink fill, the share
    // Project Hard Disk uses of the browser's quota. The figures stay in the
    // text beside it, so the drawing hides from readers and the words do not.
    const percent = Math.max(0, Math.min(100, Math.round((storageState.usage / storageState.quota) * 100)));
    const bar = el("span", "about-this-mac-bar");
    bar.setAttribute("aria-hidden", "true");
    const fill = el("span", "about-this-mac-bar-fill");
    fill.style.setProperty("--about-this-mac-fill", `${percent}%`);
    bar.append(fill);
    const line = el("span", "about-this-mac-bar-line");
    line.append(bar, el("span", "", t("about_this_mac_storage_value", formatBytes(storageState.usage), formatBytes(storageState.quota))));
    const lines = [line];
    const { disks, files } = projectCounts();
    if (disks || files) lines.push(el("span", "about-this-mac-quiet", t("about_this_mac_storage_counts", disks, files)));
    return lines;
  }

  function factRow(labelKey, lines) {
    const row = el("div", "about-this-mac-row");
    row.append(el("dt", "about-this-mac-label", t(labelKey)));
    const value = el("dd", "about-this-mac-value");
    lines.forEach((line) => value.append(line));
    row.append(value);
    return row;
  }

  // The board's masthead: the machine at the left, its name in the window's
  // largest voice, its build underneath. The drawing is plain 1-bit front
  // view of the compact Mac — screen, floppy slot, foot — stroked in
  // currentColor so each era's ink dresses it.
  function machineMark() {
    const mark = el("span", "about-this-mac-machine");
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = [
      '<svg width="46" height="52" viewBox="0 0 48 54" fill="none" aria-hidden="true">',
      '<rect x="3" y="2" width="42" height="44" rx="3" stroke="currentColor" stroke-width="2"/>',
      '<rect x="9" y="8" width="30" height="20" stroke="currentColor" stroke-width="2"/>',
      '<rect x="27" y="36" width="11" height="3" fill="currentColor"/>',
      '<rect x="12" y="49" width="24" height="3" fill="currentColor"/>',
      "</svg>",
    ].join("");
    return mark;
  }

  // The board's ruled sections: a title, then its rows between ink rules.
  function factSection(titleKey, rows) {
    const section = el("div", "about-this-mac-section");
    section.append(el("dt", "about-this-mac-section-title", t(titleKey)));
    rows.forEach((row) => section.append(row));
    return section;
  }

  function buildPane() {
    const body = aboutThisMacWindow()?.querySelector(".about-this-mac-body");
    if (!body) return;
    body.replaceChildren();

    // The board's masthead: what this desk is, at the window's largest size.
    const { version, build } = versionText();
    const masthead = el("div", "about-this-mac-masthead");
    masthead.append(machineMark());
    const words = el("div", "about-this-mac-masthead-words");
    const heading = el("p", "about-this-mac-heading");
    heading.append(el("span", "", ["AI System 6", version].filter(Boolean).join(" ")));
    words.append(heading);
    if (build) words.append(el("p", "about-this-mac-subline", `Build ${build}`));
    masthead.append(words);
    body.append(masthead);

    // Four ruled sections, in the board's order: the desk as it runs, the
    // agent on it, the disk the projects live on, and the per-boot token.
    const rows = el("dl", "about-this-mac-rows");
    rows.append(factSection("about_this_mac_section_desk", [
      factRow("about_this_mac_appearance", [el("span", "", appearanceLine())]),
      factRow("about_this_mac_model", [el("span", "", modelLine())]),
    ]));
    rows.append(factSection("about_this_mac_section_agent", [
      factRow("about_this_mac_engine", [engineLine()]),
      factRow("about_this_mac_sandbox", [sandboxLine()]),
    ]));
    rows.append(factSection("about_this_mac_section_storage", [
      factRow("about_this_mac_storage", storageLines()),
    ]));
    rows.append(factSection("about_this_mac_section_boot", [
      factRow("about_this_mac_token", [el("span", "", tokenLine())]),
    ]));
    body.append(rows);

    body.append(el("p", "about-this-mac-note", t("about_this_mac_note")));
  }

  function render() {
    const win = aboutThisMacWindow();
    if (!win) return;
    const title = win.querySelector("#about-this-mac-title");
    if (title) {
      title.removeAttribute("data-i18n");
      title.textContent = t("about_this_mac");
    }
    buildPane();
  }

  // One read per opening: the registry's onReveal fires after the window is
  // unhidden (onOpen still sees it hidden), so each opening starts a fresh
  // read and the async facts land out of band and re-render once each. A
  // window opened later starts a new generation, so a slow answer from the
  // previous opening cannot overwrite it. Language repaints render and change
  // nothing.
  function reveal() {
    beginFacts();
  }

  function beginFacts() {
    generation += 1;
    const mine = generation;
    fetchEngineStatus().then((status) => {
      if (mine !== generation) return;
      engineState = status;
      render();
    });
    storageEstimate().then((estimate) => {
      if (mine !== generation) return;
      storageState = estimate;
      render();
    });
  }

  async function open() {
    installAboutThisMacWindow();
    render();
    // openWindow's onReveal begins the facts — the same single read the
    // Apple menu's action takes.
    await openWindow("aboutThisMac");
    return true;
  }

  // The language switch repaints through the admission table's hook
  // (app-admissions.js repaint: "renderAboutThisMacLanguage").
  function renderAboutThisMacLanguage() {
    if (!aboutThisMacWindow()) return;
    render();
  }

  installAboutThisMacWindow();

  window.AISystem6AboutThisMac = Object.freeze({ open, render, reveal });
  window.renderAboutThisMacLanguage = renderAboutThisMacLanguage;
  window.AISystem6AboutThisMacLoaded = true;
})();
