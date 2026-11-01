// Feature module: extensions-window — the 「Extensions」 window shell (M8 slice 0).
//
// One lazy module: the window is built here the first time the Apple menu asks
// for it, and nothing of it rides the boot. Four tabs on the Control Panel's
// own tablist (.system-tabs.control-chooser): Skills, Memory, Roles and
// Waiting for you. Each shows an empty state for now; the later slices fill
// them by registering a count provider (setCountProvider) and a panel renderer
// (setPanelRenderer). The window reads and writes nothing of its own and
// touches no storage.
//
// The strings live in this module's own table, not in the boot translation
// files, so a closed window costs the floppy nothing. The Apple menu row is
// the only eager string (extensions_menu, also the window's title).
//
// Contract: tests/features/extensions-window.test.mjs

(function installExtensionsWindow() {
  if (window.AISystem6ExtensionsLoaded) return;
  const shell = window.AISystem6ApplicationShell;
  if (!shell) return;

  const tabIds = ["skills", "memory", "roles", "waiting"];

  const STRINGS = {
    en: {
      tabs: "Extensions sections",
      skills: "Skills",
      memory: "Memory",
      roles: "Roles",
      waiting: "Waiting for you",
      emptySkills: "No skills here yet. Skills you install or adopt will be listed here.",
      emptyMemory: "No memories here yet. Memories you keep will be listed here.",
      emptyRoles: "No roles here yet. Roles you set up will be listed here.",
      emptyWaiting: "Nothing is waiting for you.",
    },
    zh: {
      tabs: "扩充功能分区",
      skills: "技能",
      memory: "记忆",
      roles: "角色",
      waiting: "等你看",
      emptySkills: "这里还没有技能。你安装或采纳的技能会列在这里。",
      emptyMemory: "这里还没有记忆。你留下的记忆会列在这里。",
      emptyRoles: "这里还没有角色。你设定的角色会列在这里。",
      emptyWaiting: "没有等你看的东西。",
    },
  };
  const emptyKeys = { skills: "emptySkills", memory: "emptyMemory", roles: "emptyRoles", waiting: "emptyWaiting" };

  // Later slices replace these: a provider returns how many records the tab
  // holds, a renderer fills the panel for a tab that has some.
  const countProviders = { skills: () => 0, memory: () => 0, roles: () => 0, waiting: () => 0 };
  const panelRenderers = {};
  // Always drawn under a tab, empty or not (the desktop level's export and import).
  const footerRenderers = {};

  let face = "skills";

  const copy = (key) => {
    const table = typeof currentLanguage === "string" && currentLanguage.startsWith("zh") ? STRINGS.zh : STRINGS.en;
    return table[key] || STRINGS.en[key] || key;
  };

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function count(id) {
    const value = Number(countProviders[id]?.());
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function counts() {
    return Object.fromEntries(tabIds.map((id) => [id, count(id)]));
  }

  const extensionsWindow = () => document.querySelector('[data-window="extensions"]');

  function installWindow() {
    if (extensionsWindow()) return;
    shell.createWindow({
      windowName: "extensions",
      windowClass: "extensions-window",
      labelledBy: "extensions-title",
      titleKey: "extensions_menu",
      title: "Extensions",
      shade: true,
      paneClass: "extensions-pane",
      paneHtml: `
        <div class="system-tabs control-chooser extensions-tabs" role="tablist"></div>
        <div class="extensions-panel" id="extensions-panel" role="tabpanel"></div>`,
    });
    const win = extensionsWindow();
    const tabs = win.querySelector(".extensions-tabs");
    tabIds.forEach((id) => {
      const tab = el("button", "system-tab");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.id = `extensions-tab-${id}`;
      tab.dataset.extensionsTab = id;
      tab.setAttribute("aria-controls", "extensions-panel");
      tab.append(el("span", "control-chooser-label"));
      tab.addEventListener("click", () => showTab(id));
      tabs.append(tab);
    });
    tabs.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const step = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      const next = tabIds[(tabIds.indexOf(face) + step + tabIds.length) % tabIds.length];
      showTab(next);
      win.querySelector(`#extensions-tab-${next}`)?.focus();
    });
  }

  function tabLabel(id, n) {
    return id === "waiting" ? `${copy("waiting")} (${n})` : copy(id);
  }

  function render() {
    const win = extensionsWindow();
    if (!win) return;
    const title = win.querySelector("#extensions-title");
    if (title) {
      title.removeAttribute("data-i18n");
      title.textContent = String(t("extensions_menu")).replace(/…$/, "");
    }
    win.querySelector(".extensions-tabs")?.setAttribute("aria-label", copy("tabs"));
    const all = counts();
    win.querySelectorAll("[data-extensions-tab]").forEach((tab) => {
      const id = tab.dataset.extensionsTab;
      const active = id === face;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      const label = tab.querySelector(".control-chooser-label");
      if (label) label.textContent = tabLabel(id, all[id]);
    });
    const panel = win.querySelector("#extensions-panel");
    panel.setAttribute("aria-labelledby", `extensions-tab-${face}`);
    panel.dataset.extensionsFace = face;
    panel.replaceChildren();
    if (all[face] > 0 && typeof panelRenderers[face] === "function") {
      panelRenderers[face](panel, { count: all[face], copy });
    } else {
      panel.append(el("p", "hint extensions-empty", copy(emptyKeys[face])));
    }
    if (typeof footerRenderers[face] === "function") footerRenderers[face](panel);
  }

  function showTab(id) {
    face = tabIds.includes(id) ? id : "skills";
    render();
  }

  async function open({ tab = "" } = {}) {
    installWindow();
    if (tab) face = tabIds.includes(tab) ? tab : face;
    render();
    await openWindow("extensions");
    return true;
  }

  installWindow();

  window.renderExtensions = render;
  window.AISystem6Extensions = Object.freeze({
    open,
    render,
    attach: render,
    tabIds: Object.freeze([...tabIds]),
    counts,
    showTab,
    setCountProvider(id, provider) {
      if (tabIds.includes(id) && typeof provider === "function") countProviders[id] = provider;
    },
    setPanelRenderer(id, renderer) {
      if (tabIds.includes(id) && typeof renderer === "function") panelRenderers[id] = renderer;
    },
    setFooterRenderer(id, renderer) {
      if (tabIds.includes(id) && typeof renderer === "function") footerRenderers[id] = renderer;
    },
  });
  window.AISystem6ExtensionsLoaded = true;
})();
