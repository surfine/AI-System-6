// Feature module: chooser-book — Chooser laid out the way System 6 drew it.
//
// The original Chooser was two panes: a column of driver icons on the left
// (LaserWriter, AppleShare…), the selected driver's list on the right, and
// "AppleTalk ◉ Active ○ Inactive" in the corner. This module gives the
// Chooser window the same shape without adding boot bytes: the sections stay
// in index.html (and the lazy modules that fill them), and the first open
// wraps them in the Control Panel's own tablist (.control-chooser), so every
// era dresses the rail the way it already dresses Control Panel.
//
// The corner switch is MCP's AppleTalk: Inactive (the default) keeps the
// guest bridge closed, so no outside agent reaches this desk; Active opens it
// and the Guests driver decides, per agent, what each one may do. The choice
// is a small preference in localStorage, read once at boot (boot.js).

(function installChooserBook() {
  if (window.AISystem6ChooserBook) return;

  const root = window;
  const STORAGE_KEY = "ai-system6-mcp";
  const LOCAL_STRINGS = {
    en: {
      chooser_drivers: "Chooser drivers",
      chooser_mcp: "MCP",
      chooser_mcp_active: "Active",
      chooser_mcp_inactive: "Inactive",
      chooser_mcp_on_note: "Agents you approve under Guests can use this desk.",
      chooser_mcp_off_note: "No outside agent can reach this desk.",
      chooser_calls: "Recent calls",
      chooser_calls_note: "Every call a guest made since this Mac started the bridge, reads and refusals included.",
      chooser_calls_empty: "No guest has made a call yet.",
      chooser_calls_all: "All guests",
      chooser_calls_filter: "Show calls from",
      chooser_calls_export: "Export…",
      chooser_call_done: "Done",
      chooser_call_refused: "Refused",
      chooser_call_failed: "Failed",
      chooser_call_waiting: "Waiting",
      chooser_tools: "Tool permissions",
      chooser_tools_note: "What one approved guest may use. Changes always ask, every time, in the guest's own app.",
      chooser_tools_guest: "Guest",
      chooser_tools_none: "Approve a guest first; its tools appear here.",
      chooser_tools_level_read: "Read only",
      chooser_tools_level_propose: "May propose",
      chooser_tools_level_change: "May change",
      chooser_rule_allow: "Allow",
      chooser_rule_ask: "Ask each time",
      chooser_rule_off: "Off",
      chooser_mount: "Projects",
      chooser_mount_open: "Whichever project is open",
      chooser_mount_only: "Only these projects",
      chooser_mount_untitled: "Untitled project",
    },
    zh: {
      chooser_drivers: "选择器驱动",
      chooser_mcp: "MCP",
      chooser_mcp_active: "启用",
      chooser_mcp_inactive: "停用",
      chooser_mcp_on_note: "在「访客」里批准过的代理可以使用这张桌面。",
      chooser_mcp_off_note: "外部代理连不上这张桌面。",
      chooser_calls: "最近的调用",
      chooser_calls_note: "这台 Mac 打开访客桥以来，访客的每一次调用都在这里，读取和被拒的也算。",
      chooser_calls_empty: "还没有访客调用过。",
      chooser_calls_all: "全部访客",
      chooser_calls_filter: "显示谁的调用",
      chooser_calls_export: "导出…",
      chooser_call_done: "完成",
      chooser_call_refused: "被拒",
      chooser_call_failed: "失败",
      chooser_call_waiting: "等待中",
      chooser_tools: "工具权限",
      chooser_tools_note: "一个已批准的访客可以用哪些工具。改动类的工具，每次都会在访客自己的应用里先问你。",
      chooser_tools_guest: "访客",
      chooser_tools_none: "先批准一个访客，它的工具会列在这里。",
      chooser_tools_level_read: "只读",
      chooser_tools_level_propose: "可提议",
      chooser_tools_level_change: "可改动",
      chooser_rule_allow: "允许",
      chooser_rule_ask: "每次询问",
      chooser_rule_off: "关闭",
      chooser_mount: "项目",
      chooser_mount_open: "桌面上开着哪个项目就是哪个",
      chooser_mount_only: "只限这些项目",
      chooser_mount_untitled: "未命名项目",
    },
  };
  const language = (code) => (root[code === "zh" ? "AISystem6TranslationsZh" : "AISystem6TranslationsEn"] ||= {});
  Object.assign(language("en"), LOCAL_STRINGS.en);
  Object.assign(language("zh"), LOCAL_STRINGS.zh);
  const tr = (key) => (typeof t === "function" ? t(key) : key);

  // One driver per section, in the order the rail shows them. A section is
  // matched by its heading or class, so a module that adds its section later
  // (Shared Folders) is adopted on the next bind().
  const DRIVERS = [
    { id: "search", icon: "searcher", match: (section) => section.querySelector("#chooser-search-title") },
    { id: "archive", icon: "timeMachine", match: (section) => section.querySelector("#chooser-archive-title") },
    { id: "import", icon: "importUtility", match: (section) => section.querySelector("#chooser-import-title") },
    { id: "folders", icon: "folder", match: (section) => section.classList.contains("chooser-folders-section") },
    { id: "guests", icon: "chooser", match: (section) => section.classList.contains("chooser-guests-section") },
    { id: "servers", icon: "hardDisk", match: (section) => section.classList.contains("chooser-servers-section") },
  ];

  let current = "search";

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function chooserWindow() {
    return document.querySelector('[data-window="chooser"]');
  }

  function mcpActive() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      return false;
    }
  }

  function setMcpActive(active) {
    try {
      localStorage.setItem(STORAGE_KEY, active ? "on" : "off");
    } catch {}
    const executor = window.AISystem6GuestExecutor;
    if (active) executor?.start?.(true);
    else executor?.stop?.();
    syncSwitch();
    window.AISystem6GuestTools?.renderChooserGuests?.();
  }

  function build(pane) {
    const book = el("div", "chooser-book");
    const rail = el("div", "system-tabs control-chooser chooser-drivers");
    rail.setAttribute("role", "tablist");
    rail.setAttribute("aria-orientation", "vertical");
    rail.dataset.i18nAriaLabel = "chooser_drivers";
    rail.setAttribute("aria-label", tr("chooser_drivers"));
    const pages = el("div", "chooser-pages");
    book.append(rail, pages);
    const note = pane.querySelector(".chooser-honesty-note");
    if (note) note.after(book);
    else pane.prepend(book);

    rail.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-chooser-driver]");
      if (tab) show(tab.dataset.chooserDriver);
    });
    rail.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const ids = [...rail.querySelectorAll("[data-chooser-driver]")].map((tab) => tab.dataset.chooserDriver);
      const step = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      const next = ids[(ids.indexOf(current) + step + ids.length) % ids.length];
      show(next);
      rail.querySelector(`[data-chooser-driver="${next}"]`)?.focus();
    });

    // AppleTalk's corner, now MCP's: two radio buttons and one line saying
    // what the current setting means.
    const corner = el("div", "chooser-mcp");
    corner.setAttribute("role", "radiogroup");
    const name = el("span", "chooser-mcp-name");
    name.dataset.i18n = "chooser_mcp";
    name.textContent = tr("chooser_mcp");
    corner.setAttribute("aria-labelledby", "chooser-mcp-name");
    name.id = "chooser-mcp-name";
    // The name and its radios wrap as one piece, never one radio alone.
    const control = el("span", "chooser-mcp-switch");
    control.append(name);
    corner.append(control);
    for (const value of ["on", "off"]) {
      const label = el("label", "chooser-mcp-choice");
      const input = el("input");
      input.type = "radio";
      input.name = "chooser-mcp";
      input.value = value;
      input.addEventListener("change", () => setMcpActive(value === "on"));
      const text = el("span");
      text.dataset.i18n = value === "on" ? "chooser_mcp_active" : "chooser_mcp_inactive";
      text.textContent = tr(text.dataset.i18n);
      label.append(input, text);
      control.append(label);
    }
    const meaning = el("p", "hint chooser-mcp-note");
    meaning.setAttribute("aria-live", "polite");
    corner.append(meaning);
    pane.append(corner);
    return book;
  }

  function adopt(book, pane) {
    const rail = book.querySelector(".chooser-drivers");
    const pages = book.querySelector(".chooser-pages");
    const sections = [...pane.querySelectorAll(".chooser-section")];
    for (const driver of DRIVERS) {
      const section = sections.find((candidate) => driver.match(candidate));
      if (!section) continue;
      if (section.parentElement !== pages) pages.append(section);
      section.id ||= `chooser-page-${driver.id}`;
      section.setAttribute("role", "tabpanel");
      section.dataset.chooserPage = driver.id;
      if (rail.querySelector(`[data-chooser-driver="${driver.id}"]`)) continue;
      const heading = section.querySelector("h3");
      const tab = el("button", "system-tab");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.id = `chooser-tab-${driver.id}`;
      tab.dataset.chooserDriver = driver.id;
      tab.setAttribute("aria-controls", section.id);
      section.setAttribute("aria-labelledby", tab.id);
      const glyph = el("span", "sys-icon");
      glyph.dataset.systemIcon = driver.icon;
      glyph.setAttribute("aria-hidden", "true");
      const label = el("span", "control-chooser-label", heading?.textContent || driver.id);
      if (heading?.dataset.i18n) label.dataset.i18n = heading.dataset.i18n;
      tab.append(glyph, label);
      // Keep the rail in DRIVERS order even when a section arrives late.
      const later = DRIVERS.slice(DRIVERS.indexOf(driver) + 1)
        .map((next) => rail.querySelector(`[data-chooser-driver="${next.id}"]`))
        .find(Boolean);
      rail.insertBefore(tab, later || null);
    }
    if (typeof hydrateSystemIcons === "function") hydrateSystemIcons(rail);
  }

  function show(id) {
    const win = chooserWindow();
    if (!win?.querySelector(`[data-chooser-page="${id}"]`)) return;
    current = id;
    win.querySelectorAll("[data-chooser-driver]").forEach((tab) => {
      const active = tab.dataset.chooserDriver === id;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      // On a phone the rail is a scrolling row; keep the chosen driver in it.
      if (active) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    win.querySelectorAll("[data-chooser-page]").forEach((page) => {
      page.hidden = page.dataset.chooserPage !== id;
    });
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  }

  function syncSwitch() {
    const win = chooserWindow();
    if (!win) return;
    const active = mcpActive();
    win.querySelectorAll('input[name="chooser-mcp"]').forEach((input) => {
      input.checked = (input.value === "on") === active;
    });
    const note = win.querySelector(".chooser-mcp-note");
    if (note) {
      note.dataset.i18n = active ? "chooser_mcp_on_note" : "chooser_mcp_off_note";
      note.textContent = tr(note.dataset.i18n);
    }
    win.classList.toggle("is-mcp-active", active);
  }

  // Guests and Servers are built here rather than carried in index.html:
  // only an open Chooser shows them, so their markup no longer rides every
  // boot. Guests are agents that reach the desk over MCP, each approved by
  // name (lazy guest-tools); an invitation names this desk, and renaming the
  // desk revokes every invitation at once. Servers are the other direction:
  // MCP servers this desk asks, whose answers land on the File Floppy (lazy
  // mcp-servers).
  function section(kind, titleId, titleKey, html) {
    const node = el("section", `control-section chooser-section chooser-${kind}-section`);
    node.setAttribute("aria-labelledby", titleId);
    node.innerHTML = `<h3 id="${titleId}" data-i18n="${titleKey}"></h3>${html}`;
    node.querySelectorAll("[data-i18n]").forEach((item) => {
      item.textContent = tr(item.dataset.i18n);
    });
    return node;
  }

  function ensureSections() {
    const pane = chooserWindow()?.querySelector(".chooser-settings");
    if (!pane || pane.querySelector(".chooser-guests-section")) return;
    const guests = section("guests", "chooser-guests-title", "guests", `
      <p class="hint control-status" data-i18n="chooser_guests_note"></p>
      <ul id="chooser-guest-list" class="chooser-guest-list"></ul>
      <p id="chooser-guest-empty" class="hint control-status" data-i18n="chooser_guests_empty"></p>
      <p id="chooser-guest-bridge" class="hint control-status" data-i18n="guest_bridge_offline"></p>
      <p class="hint control-status"><span data-i18n="chooser_guest_hint"></span> <code id="chooser-guest-command"></code></p>
      <div class="chooser-tools">
        <h4 data-i18n="chooser_tools"></h4>
        <p class="hint" data-i18n="chooser_tools_note"></p>
        <div class="select-wrap"><select id="chooser-tools-guest" data-i18n-aria-label="chooser_tools_guest"></select></div>
        <fieldset id="chooser-mount" class="chooser-mount" hidden>
          <legend data-i18n="chooser_mount"></legend>
          <label class="chooser-mount-choice"><input type="radio" name="chooser-mount" value="open"><span data-i18n="chooser_mount_open"></span></label>
          <label class="chooser-mount-choice"><input type="radio" name="chooser-mount" value="only"><span data-i18n="chooser_mount_only"></span></label>
          <ul id="chooser-mount-list" class="chooser-mount-list"></ul>
        </fieldset>
        <div id="chooser-tool-groups" class="chooser-tool-groups"></div>
        <p id="chooser-tools-empty" class="hint" data-i18n="chooser_tools_none"></p>
      </div>
      <div class="chooser-calls">
        <h4 data-i18n="chooser_calls"></h4>
        <p class="hint" data-i18n="chooser_calls_note"></p>
        <div class="chooser-calls-bar">
          <div class="select-wrap"><select id="chooser-calls-guest" data-i18n-aria-label="chooser_calls_filter"></select></div>
          <button class="btn" type="button" id="chooser-calls-export" data-i18n="chooser_calls_export"></button>
        </div>
        <ol id="chooser-call-list" class="chooser-call-list"></ol>
        <p id="chooser-calls-empty" class="hint" data-i18n="chooser_calls_empty"></p>
      </div>
      <div class="button-row">
        <button class="btn" type="button" id="chooser-guest-invite" data-i18n="guest_invite" data-balloon-help="balloon_chooser_guest_invite"></button>
        <button class="btn" type="button" id="chooser-guest-rotate" data-i18n="guest_rotate_desk" data-balloon-help="balloon_chooser_guest_rotate"></button>
      </div>
      <p id="chooser-guest-invitation" class="hint control-status" hidden></p>`);
    const servers = section("servers", "chooser-servers-title", "mcp_servers", `
      <p class="hint control-status" data-i18n="chooser_servers_note"></p>
      <ul id="chooser-server-list" class="chooser-server-list"></ul>
      <p id="chooser-server-empty" class="hint control-status" data-i18n="chooser_servers_empty"></p>
      <div class="button-row">
        <button class="btn" type="button" id="chooser-add-server" data-i18n="mcp_server_add"></button>
      </div>`);
    const sections = pane.querySelectorAll(".chooser-section");
    const after = sections[sections.length - 1];
    if (after) after.after(guests, servers);
    else pane.append(guests, servers);
  }

  // ---- Tool permissions -----------------------------------------------------
  //
  // One approved guest at a time, its tools grouped by level. Only what the
  // writer changed is stored (the approval's tools map); everything else
  // follows the level: reads and proposals run, changes ask every time
  // through the guest's client and can never be set to Allow.

  let toolsGuest = "";
  let toolsWired = false;

  function ruleChoices(level) {
    return level === "change" ? ["ask", "off"] : ["allow", "ask", "off"];
  }

  function defaultRule(level) {
    return level === "change" ? "ask" : "allow";
  }

  function renderTools() {
    const picker = document.getElementById("chooser-tools-guest");
    const groups = document.getElementById("chooser-tool-groups");
    const executor = window.AISystem6GuestExecutor;
    const surface = window.AISystem6McpSurface;
    if (!picker || !groups || !executor || !surface) return;
    const approvals = executor.getApprovals?.() || {};
    const names = Object.keys(approvals).filter((name) => approvals[name]?.status === "approved").sort();
    if (!names.includes(toolsGuest)) toolsGuest = names[0] || "";
    picker.replaceChildren(...names.map((name) => {
      const option = el("option", "", name);
      option.value = name;
      return option;
    }));
    picker.value = toolsGuest;
    picker.setAttribute("aria-label", tr("chooser_tools_guest"));
    picker.closest(".select-wrap").hidden = names.length === 0;
    document.getElementById("chooser-tools-empty").hidden = names.length > 0;
    groups.replaceChildren();
    const entry = approvals[toolsGuest];
    renderMount(entry);
    if (entry) {
      const allowed = new Set(surface.toolNamesForPrivilege(entry.privilege));
      for (const level of ["read", "propose", "change"]) {
        const levelTools = surface.MCP_TOOLS.filter((tool) => tool.level === level && allowed.has(tool.name));
        if (!levelTools.length) continue;
        const group = el("details", "chooser-tool-group");
        group.dataset.level = level;
        const summary = el("summary", "", tr(`chooser_tools_level_${level}`));
        summary.append(el("span", "chooser-tool-count", String(levelTools.length)));
        group.append(summary);
        const list = el("ul", "chooser-tool-list");
        for (const tool of levelTools) {
          const row = el("li", "chooser-tool");
          const label = el("span", "chooser-tool-name", tool.title || tool.name);
          label.title = tool.name;
          const wrap = el("div", "select-wrap");
          const select = el("select");
          select.dataset.toolRule = tool.name;
          select.setAttribute("aria-label", tool.title || tool.name);
          for (const rule of ruleChoices(level)) {
            const option = el("option", "", tr(`chooser_rule_${rule}`));
            option.value = rule;
            select.append(option);
          }
          const stored = entry.tools?.[tool.name];
          select.value = ruleChoices(level).includes(stored) ? stored : defaultRule(level);
          wrap.append(select);
          row.append(label, wrap);
          if (select.value !== defaultRule(level)) row.classList.add("is-changed");
          list.append(row);
        }
        group.append(list);
        // A group the writer changed something in opens by itself.
        group.open = !!list.querySelector(".is-changed");
        groups.append(group);
      }
    }
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    if (toolsWired) return;
    toolsWired = true;
    picker.addEventListener("change", () => {
      toolsGuest = picker.value;
      renderTools();
    });
    document.getElementById("chooser-mount").addEventListener("change", (event) => {
      const mode = document.querySelector('input[name="chooser-mount"]:checked')?.value;
      const checked = [...document.querySelectorAll("#chooser-mount-list input:checked")].map((input) => input.value);
      if (event.target.name === "chooser-mount" && mode === "only" && !checked.length) {
        // Choosing "only" starts from the project that is open now.
        const open = typeof activeProjectId !== "undefined" ? String(activeProjectId || "") : "";
        if (open) checked.push(open);
      }
      setMountedProjects(toolsGuest, mode === "only" ? checked : []);
    });
    groups.addEventListener("change", (event) => {
      const select = event.target.closest("[data-tool-rule]");
      if (!select) return;
      setToolRule(toolsGuest, select.dataset.toolRule, select.value);
    });
  }

  function renderMount(entry) {
    const box = document.getElementById("chooser-mount");
    const list = document.getElementById("chooser-mount-list");
    if (!box || !list) return;
    box.hidden = !entry;
    if (!entry) return;
    const mounted = new Set(entry.projects || []);
    const only = mounted.size > 0;
    box.querySelectorAll('input[name="chooser-mount"]').forEach((input) => {
      input.checked = (input.value === "only") === only;
    });
    const all = typeof projects !== "undefined" && Array.isArray(projects) ? projects.filter((project) => !project.archived) : [];
    list.hidden = !only;
    list.replaceChildren(...all.map((project) => {
      const item = el("li");
      const label = el("label", "chooser-mount-project");
      const input = el("input");
      input.type = "checkbox";
      input.value = String(project.id || "");
      input.checked = mounted.has(input.value);
      label.append(input, el("span", "", project.name || tr("chooser_mount_untitled")));
      item.append(label);
      return item;
    }));
  }

  function setMountedProjects(guest, ids) {
    const executor = window.AISystem6GuestExecutor;
    const entry = executor?.approvalFor?.(guest);
    if (!entry) return;
    const next = { ...entry };
    if (ids.length) next.projects = [...new Set(ids.map(String))];
    else delete next.projects;
    executor.recordApproval(guest, next);
    renderTools();
  }

  function setToolRule(guest, toolName, rule) {
    const executor = window.AISystem6GuestExecutor;
    const entry = executor?.approvalFor?.(guest);
    const tool = window.AISystem6McpSurface?.toolByName?.(toolName);
    if (!entry || !tool || !ruleChoices(tool.level).includes(rule)) return;
    const tools = { ...(entry.tools || {}) };
    if (rule === defaultRule(tool.level)) delete tools[toolName];
    else tools[toolName] = rule;
    executor.recordApproval(guest, { ...entry, tools });
    renderTools();
  }

  // ---- Recent calls ---------------------------------------------------------
  //
  // The server keeps the last calls of every guest in a bounded ring and sends
  // them to the page (guest-executor.js activity()); this list is how the
  // writer answers "what did it look at" after the fact.

  let callFilter = "";
  let callsWired = false;

  function callStatus(entry) {
    if (entry.ok) return "done";
    if (/pending|await/i.test(entry.status || "")) return "waiting";
    if (/denied|refused|declined|forbidden|privilege|turned off|not mounted|tool-off/i.test(`${entry.status} ${entry.error || ""}`)) return "refused";
    return "failed";
  }

  function toolTitle(name) {
    return window.AISystem6McpSurface?.toolByName?.(name)?.title || String(name || "").replace(/^ais6_/, "");
  }

  function callTime(at) {
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function visibleCalls() {
    const all = window.AISystem6GuestExecutor?.activity?.() || [];
    return all.filter((entry) => !callFilter || entry.guest === callFilter).reverse();
  }

  function renderCalls() {
    const list = document.getElementById("chooser-call-list");
    const picker = document.getElementById("chooser-calls-guest");
    if (!list || !picker) return;
    const all = window.AISystem6GuestExecutor?.activity?.() || [];
    const names = [...new Set(all.map((entry) => entry.guest).filter(Boolean))].sort();
    if (callFilter && !names.includes(callFilter)) callFilter = "";
    picker.replaceChildren(...["", ...names].map((name) => {
      const option = el("option", "", name || tr("chooser_calls_all"));
      option.value = name;
      return option;
    }));
    picker.value = callFilter;
    picker.setAttribute("aria-label", tr("chooser_calls_filter"));
    const calls = visibleCalls();
    list.replaceChildren(...calls.slice(0, 100).map((entry) => {
      const status = callStatus(entry);
      const row = el("li", `chooser-call is-${status}`);
      const when = el("time", "chooser-call-time", callTime(entry.at));
      when.dateTime = entry.at;
      const what = el("span", "chooser-call-what");
      what.append(el("b", "", toolTitle(entry.tool)));
      if (!callFilter) what.append(el("span", "chooser-call-guest", entry.guest));
      if (entry.argsSummary && entry.argsSummary !== "{}") what.append(el("span", "chooser-call-args", entry.argsSummary));
      const result = el("span", "chooser-call-result", tr(`chooser_call_${status}`));
      row.title = entry.error || entry.tool;
      row.append(when, what, result);
      return row;
    }));
    document.getElementById("chooser-calls-empty").hidden = calls.length > 0;
    document.getElementById("chooser-calls-export").disabled = calls.length === 0;
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    if (callsWired) return;
    callsWired = true;
    picker.addEventListener("change", () => {
      callFilter = picker.value;
      renderCalls();
    });
    document.getElementById("chooser-calls-export").addEventListener("click", exportCalls);
    window.AISystem6GuestExecutor?.subscribe?.(() => {
      if (chooserWindow()?.classList.contains("is-hidden")) return;
      renderCalls();
      if (!document.getElementById("chooser-tool-groups")?.contains(document.activeElement)) renderTools();
    });
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCalls() {
    const rows = [["time", "guest", "tool", "arguments", "result", "error"]];
    for (const entry of visibleCalls().reverse()) {
      rows.push([entry.at, entry.guest, entry.tool, entry.argsSummary, callStatus(entry), entry.error || ""]);
    }
    const text = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    if (typeof shareArtifact === "function") {
      shareArtifact({ text, fileName: `guest-calls-${stamp}.csv`, mimeType: "text/csv", title: tr("chooser_calls") }).catch(() => {});
    }
  }

  // The modules that fill the Chooser's sections; the window registry waits
  // on this before the first open.
  function ready() {
    ensureSections();
    return Promise.all([ensureGuestToolsModule(), ensureClioTalkAgentModule()]);
  }

  // The Chooser's onOpen: each module draws its section, then the rail
  // adopts whatever is there. Safe to call again on every open.
  function bind(driver) {
    window.AISystem6GuestTools?.renderChooserGuests?.();
    window.AISystem6McpServers?.renderChooserServers?.();
    window.AISystem6ClioTalkAgent?.renderChooserFolders?.();
    renderTools();
    renderCalls();
    const pane = chooserWindow()?.querySelector(".chooser-settings");
    if (!pane) return;
    const book = pane.querySelector(".chooser-book") || build(pane);
    pane.closest(".chooser-panel")?.classList.add("has-chooser-book");
    adopt(book, pane);
    show(driver || current);
    syncSwitch();
  }

  window.AISystem6ChooserBook = Object.freeze({ ready, bind, show, setToolRule, setMountedProjects, isMcpActive: mcpActive, setMcpActive });
})();
