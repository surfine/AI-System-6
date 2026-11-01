// Outbound MCP — the servers this desk asks, and what comes back.
//
// The mirror of guest-tools.js. There a guest agent reaches the desk; here
// the writer adds a server in Chooser (「服务器」), the desk asks it through
// the Node proxy, and everything it answers lands on the File Floppy: the
// same temporary shelf that File Floppy imports and Searcher clippings use.
// Nothing an external server says is written into the manuscript, and nothing
// it says is treated as an instruction.
//
// Lazy: Chooser loads it, and Searcher loads it when the chosen provider is
// one of these servers.

(() => {
  const QUERY_ARGUMENT_NAMES = ["query", "q", "search", "search_query", "keywords", "text", "input", "prompt"];
  const LIMIT_ARGUMENT_NAMES = ["limit", "count", "max_results", "maxResults", "num_results", "n"];
  const MAX_FLOPPY_BYTES = 2 * 1024 * 1024;

  // Strings of the Clio connector settings live here, not in the eager
  // translation tables: this module is lazy and so are they.
  const LOCAL_STRINGS = {
    en: {
      mcp_clio_use: "Clio may use it in tasks",
      mcp_clio_needs_https: "Clio can only use an https:// server on the internet.",
      mcp_clio_tools: "Tools Clio may use",
      mcp_clio_tools_note: "Allow runs on its own. Ask each time waits for your answer in ClioTalk. Off hides the tool from Clio.",
      mcp_clio_unknown_readonly: "This server did not say which tools only read, so every tool starts at Ask each time.",
      mcp_clio_no_tools: "Refresh to list this server's tools.",
    },
    zh: {
      mcp_clio_use: "允许 Clio 在任务里使用",
      mcp_clio_needs_https: "Clio 只能使用互联网上的 https:// 服务器。",
      mcp_clio_tools: "Clio 可以用的工具",
      mcp_clio_tools_note: "「允许」直接执行；「每次询问」会在 ClioTalk 里等你回答；「关闭」让 Clio 看不到这个工具。",
      mcp_clio_unknown_readonly: "这台服务器没有说明哪些工具只读，所以每个工具一开始都是「每次询问」。",
      mcp_clio_no_tools: "刷新一下，列出这台服务器的工具。",
    },
  };
  const languageTable = (code) => (window[code === "zh" ? "AISystem6TranslationsZh" : "AISystem6TranslationsEn"] ||= {});
  Object.assign(languageTable("en"), LOCAL_STRINGS.en);
  Object.assign(languageTable("zh"), LOCAL_STRINGS.zh);

  const CLIO_RULES = ["allow", "ask", "off"];
  const MAX_CONNECTORS = 5;

  function executorApi() {
    return window.AISystem6GuestExecutor;
  }

  function servers() {
    return executorApi()?.getServers?.() || {};
  }

  function serverByName(name) {
    return servers()[String(name || "").trim()] || null;
  }

  /** `mcp:<name>` is how a server appears in the Chooser's provider menu. */
  function serverNameFromProvider(provider) {
    const value = String(provider || "");
    return value.startsWith("mcp:") ? value.slice(4) : "";
  }

  // ---------------------------------------------------------------------
  // Connectors: the servers Clio may use in a task.
  //
  // A tool's rule is Allow, Ask each time or Off. A tool nobody touched
  // follows its default: Allow when the server marked it read-only and not
  // destructive, else Ask. Every turn sends the rule the writer SAW for every
  // tool listed here; the gateway asks for any tool not in that list, so a
  // server that later relabels a tool read-only cannot turn Ask into Allow.
  // ---------------------------------------------------------------------

  function defaultToolRule(shape) {
    return shape?.readOnly === true && shape?.destructive !== true ? "allow" : "ask";
  }

  function toolRule(server, tool) {
    const stored = server?.clioTools?.[tool];
    return CLIO_RULES.includes(stored) ? stored : defaultToolRule(server?.toolShapes?.[tool]);
  }

  /** The gateway refuses plain http and this Mac; say so before a run does. */
  function connectorReachable(server) {
    let url;
    try {
      url = new URL(String(server?.url || ""));
    } catch {
      return false;
    }
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return url.protocol === "https:" && host !== "localhost" && !host.endsWith(".localhost")
      && !/^127\./.test(host) && host !== "::1" && host !== "0.0.0.0";
  }

  function connectorName(name) {
    return String(name || "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
  }

  /** The run-create request's `connectors`: enabled servers the writer allowed for Clio. */
  function connectorsForRun(serverMap = servers()) {
    const out = [];
    const used = new Set();
    Object.entries(serverMap || {}).forEach(([name, server]) => {
      if (out.length >= MAX_CONNECTORS || !server?.enabled || !server.clio || !connectorReachable(server)) return;
      const key = connectorName(name);
      if (!key || used.has(key)) return;
      used.add(key);
      const tools = {};
      for (const tool of server.tools || []) tools[tool] = toolRule(server, tool);
      out.push({ name: key, url: server.url, tools });
    });
    return out;
  }

  /** Store the writer's choice for one tool, always: it outlives a change in the server's own hints. */
  function setClioToolRule(name, tool, rule) {
    const server = serverByName(name);
    if (!server || !CLIO_RULES.includes(rule)) return;
    const clioTools = { ...(server.clioTools || {}), [tool]: rule };
    executorApi()?.upsertServer?.(name, { clioTools });
  }

  async function requestClient(payload) {
    const response = await window.AISystem6Capabilities.requestService("mcp.client", {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok || !data?.ok) {
      throw new Error(String(data?.error || `The MCP server could not be reached (${response.status}).`));
    }
    return data;
  }

  async function listServerTools(url, headers = {}) {
    return requestClient({ op: "list", server: { url, headers } });
  }

  async function callServerTool(name, tool, args = {}) {
    const server = serverByName(name);
    if (!server) throw new Error(t("mcp_server_unknown", name));
    if (server.enabled === false) throw new Error(t("mcp_server_disabled", name));
    const result = await requestClient({ op: "call", server: { url: server.url }, tool, arguments: args });
    if (result.isError) throw new Error(result.text || t("mcp_server_tool_failed", tool));
    return result;
  }

  /**
   * Fill the remote tool's arguments from its own declared shape rather than
   * guessing one spelling: MCP servers name the same field query, q, or
   * search_query, and a wrong name is an invalid-params error, not a search.
   */
  function searchArgumentsFor(toolShape, query, limit) {
    const properties = Array.isArray(toolShape?.properties) ? toolShape.properties : [];
    const names = properties.map((property) => property.name);
    const stringNames = properties.filter((property) => !property.type || property.type === "string").map((property) => property.name);
    const required = Array.isArray(toolShape?.required) ? toolShape.required : [];
    const queryName = QUERY_ARGUMENT_NAMES.find((candidate) => stringNames.includes(candidate))
      || required.find((candidate) => stringNames.includes(candidate))
      || stringNames[0]
      || "query";
    const args = { [queryName]: query };
    const limitName = LIMIT_ARGUMENT_NAMES.find((candidate) => names.includes(candidate));
    if (limitName && Number.isFinite(limit)) args[limitName] = limit;
    return args;
  }

  /**
   * A tool answers with text. If that text is JSON holding a list of results,
   * show them as results; otherwise the whole answer is one result, so the
   * writer still sees exactly what came back instead of an empty list.
   */
  function normalizeSearchResults(result, serverName, query) {
    const text = String(result?.text || "").trim();
    const structured = result?.structured;
    const fromStructured = Array.isArray(structured) ? structured : Array.isArray(structured?.results) ? structured.results : null;
    let rows = fromStructured;
    if (!rows && (text.startsWith("[") || text.startsWith("{"))) {
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : null;
      } catch {
        rows = null;
      }
    }
    if (Array.isArray(rows) && rows.length) {
      return rows.slice(0, 20).map((row, index) => ({
        title: String(row?.title || row?.name || row?.heading || `${serverName} ${index + 1}`).slice(0, 300),
        url: String(row?.url || row?.link || row?.uri || ""),
        site: String(row?.site || row?.source || serverName),
        snippet: String(row?.snippet || row?.description || row?.summary || row?.text || row?.content || "").slice(0, 4000),
      }));
    }
    if (!text) return [];
    return [{
      title: `${serverName}: ${query}`.slice(0, 300),
      url: "",
      site: serverName,
      snippet: text.slice(0, 20000),
    }];
  }

  async function searchWithServer(name, query, limit) {
    const server = serverByName(name);
    if (!server?.searchTool) throw new Error(t("mcp_server_no_search_tool", name));
    const shape = server.toolShapes?.[server.searchTool] || null;
    const result = await callServerTool(name, server.searchTool, searchArgumentsFor(shape, query, limit));
    return normalizeSearchResults(result, name, query);
  }

  /**
   * The one landing place for anything an external server says. It is a
   * File Floppy item — temporary context the writer can read, eject, or use —
   * never a write into the manuscript.
   */
  async function putOnFileFloppy(name, body, { source = "mcp" } = {}) {
    const text = String(body || "");
    if (!text.trim()) return { ok: false, reason: "empty" };
    if (new TextEncoder().encode(text).length > MAX_FLOPPY_BYTES) return { ok: false, reason: "too-large" };
    if (typeof insertFilesIntoFileFloppy !== "function") return { ok: false, reason: "unavailable" };
    let fileName = String(name || "mcp.md").replace(/[\\/:*?"<>|]+/g, "-").trim() || "mcp.md";
    if (!/\.(md|txt|markdown)$/i.test(fileName)) fileName += ".md";
    const file = new File([text], fileName, { type: "text/markdown" });
    const result = await insertFilesIntoFileFloppy([file], { source });
    if (!result || !result.mountedFileNames?.length) {
      const why = (result?.failures || []).map((failure) => failure.message).join("; ");
      return { ok: false, reason: why || "not-mounted" };
    }
    return { ok: true, mountedFileNames: result.mountedFileNames, chunks: result.embeddedChunks?.length || 0 };
  }

  // A server that answers a search-shaped tool becomes one more entry in the
  // Chooser's Search Engine menu, beside DuckDuckGo and the rest. Searcher
  // then reads it the way it reads any other provider.
  function syncSearchProviderOptions() {
    const select = document.getElementById("search-provider");
    if (!select) return;
    const wanted = new Map(Object.entries(servers())
      .filter(([, entry]) => entry.enabled && entry.searchTool)
      .map(([name]) => [`mcp:${name}`, name]));
    [...select.options].forEach((option) => {
      if (option.value.startsWith("mcp:") && !wanted.has(option.value)) option.remove();
    });
    wanted.forEach((name, value) => {
      let option = [...select.options].find((entry) => entry.value === value);
      if (!option) {
        option = document.createElement("option");
        option.value = value;
        select.append(option);
      }
      option.textContent = t("mcp_server_provider_option", name);
    });
    if (select.value.startsWith("mcp:") && !wanted.has(select.value)) select.value = "auto";
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  }

  // ---------------------------------------------------------------------
  // Chooser 「服务器」 section.
  // ---------------------------------------------------------------------

  let wired = false;

  function renderChooserServers() {
    syncSearchProviderOptions();
    const list = document.getElementById("chooser-server-list");
    const empty = document.getElementById("chooser-server-empty");
    if (!list) return;
    const entries = Object.entries(servers()).sort((left, right) => left[0].localeCompare(right[0]));
    list.replaceChildren();
    if (empty) empty.hidden = entries.length > 0;
    entries.forEach(([name, server]) => {
      const item = document.createElement("li");
      item.className = "chooser-source chooser-entry";
      const icon = document.createElement("span");
      icon.className = "sys-icon";
      icon.dataset.systemIcon = "chooser";
      icon.setAttribute("aria-hidden", "true");
      const body = document.createElement("div");
      body.className = "chooser-entry-body";
      const title = document.createElement("b");
      title.textContent = name;
      const meta = document.createElement("p");
      meta.className = "hint chooser-entry-meta";
      meta.textContent = `${server.url} · ${server.searchTool ? t("mcp_server_search_tool", server.searchTool) : t("mcp_server_no_tool_chosen")}`;
      const controls = document.createElement("div");
      controls.className = "chooser-entry-controls";

      const wrap = document.createElement("div");
      wrap.className = "select-wrap";
      const select = document.createElement("select");
      select.dataset.mcpServerTool = name;
      select.setAttribute("aria-label", `${name} · ${t("mcp_server_search_tool_label")}`);
      const none = document.createElement("option");
      none.value = "";
      none.textContent = t("mcp_server_tool_none");
      select.append(none);
      (server.tools || []).forEach((tool) => {
        const option = document.createElement("option");
        option.value = tool;
        option.textContent = tool;
        select.append(option);
      });
      select.value = server.searchTool || "";
      wrap.append(select);
      controls.append(wrap);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "btn";
      toggle.dataset.mcpServerToggle = name;
      toggle.textContent = server.enabled ? t("mcp_server_disable") : t("mcp_server_enable");
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "btn";
      refresh.dataset.mcpServerRefresh = name;
      refresh.textContent = t("mcp_server_refresh");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn";
      remove.dataset.mcpServerRemove = name;
      remove.textContent = t("mcp_server_remove");
      controls.append(toggle, refresh, remove);

      body.append(title, meta, controls, clioPanel(name, server));
      item.append(icon, body);
      list.append(item);
    });
    if (typeof hydrateSystemIcons === "function") hydrateSystemIcons(list);
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    wireChooserServers(list);
  }

  const openClioPanels = new Set();

  function clioPanel(name, server) {
    const panel = document.createElement("div");
    panel.className = "chooser-clio";
    const reachable = connectorReachable(server);
    const label = document.createElement("label");
    label.className = "chooser-mount-choice";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.mcpClio = name;
    box.checked = !!server.clio && reachable;
    box.disabled = !reachable;
    label.append(box, Object.assign(document.createElement("span"), { textContent: t("mcp_clio_use") }));
    panel.append(label);
    if (!reachable) {
      panel.append(Object.assign(document.createElement("p"), { className: "hint", textContent: t("mcp_clio_needs_https") }));
      return panel;
    }
    if (!server.clio) return panel;
    const tools = server.tools || [];
    if (!tools.length) {
      panel.append(Object.assign(document.createElement("p"), { className: "hint", textContent: t("mcp_clio_no_tools") }));
      return panel;
    }
    const group = document.createElement("details");
    group.className = "chooser-tool-group";
    group.dataset.mcpClioGroup = name;
    const summary = document.createElement("summary");
    summary.textContent = t("mcp_clio_tools");
    const count = document.createElement("span");
    count.className = "chooser-tool-count";
    count.textContent = String(tools.length);
    summary.append(count);
    group.append(summary);
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = t("mcp_clio_tools_note");
    group.append(note);
    if (!tools.some((tool) => server.toolShapes?.[tool]?.readOnly !== undefined)) {
      const unknown = document.createElement("p");
      unknown.className = "hint";
      unknown.textContent = t("mcp_clio_unknown_readonly");
      group.append(unknown);
    }
    const rows = document.createElement("ul");
    rows.className = "chooser-tool-list";
    tools.forEach((tool) => {
      const row = document.createElement("li");
      row.className = "chooser-tool";
      const text = document.createElement("span");
      text.className = "chooser-tool-name";
      text.textContent = tool;
      text.title = tool;
      const wrap = document.createElement("div");
      wrap.className = "select-wrap";
      const select = document.createElement("select");
      select.dataset.mcpClioRule = tool;
      select.dataset.mcpClioServer = name;
      select.setAttribute("aria-label", `${name} · ${tool}`);
      CLIO_RULES.forEach((rule) => {
        const option = document.createElement("option");
        option.value = rule;
        option.textContent = t(`chooser_rule_${rule}`);
        select.append(option);
      });
      select.value = toolRule(server, tool);
      if (select.value !== defaultToolRule(server.toolShapes?.[tool])) row.classList.add("is-changed");
      wrap.append(select);
      row.append(text, wrap);
      rows.append(row);
    });
    group.append(rows);
    group.open = openClioPanels.has(name) || !!rows.querySelector(".is-changed");
    group.addEventListener("toggle", () => {
      if (group.open) openClioPanels.add(name);
      else openClioPanels.delete(name);
    });
    panel.append(group);
    return panel;
  }

  function wireChooserServers(list) {
    if (wired) return;
    wired = true;
    list.addEventListener("change", (event) => {
      const clio = event.target.closest("[data-mcp-clio]");
      if (clio) {
        executorApi()?.upsertServer?.(clio.dataset.mcpClio, { clio: clio.checked });
        renderChooserServers();
        return;
      }
      const rule = event.target.closest("[data-mcp-clio-rule]");
      if (rule) {
        setClioToolRule(rule.dataset.mcpClioServer, rule.dataset.mcpClioRule, rule.value);
        renderChooserServers();
        return;
      }
      const select = event.target.closest("[data-mcp-server-tool]");
      if (!select) return;
      executorApi()?.upsertServer?.(select.dataset.mcpServerTool, { searchTool: select.value });
      renderChooserServers();
    });
    list.addEventListener("click", async (event) => {
      const toggle = event.target.closest("[data-mcp-server-toggle]");
      const refresh = event.target.closest("[data-mcp-server-refresh]");
      const remove = event.target.closest("[data-mcp-server-remove]");
      if (toggle) {
        const name = toggle.dataset.mcpServerToggle;
        executorApi()?.upsertServer?.(name, { enabled: !serverByName(name)?.enabled });
        renderChooserServers();
      } else if (refresh) {
        await refreshServerTools(refresh.dataset.mcpServerRefresh);
      } else if (remove) {
        const name = remove.dataset.mcpServerRemove;
        // Removing a server leaves everything it already put on the File Floppy
        // where it is, and adding it back is the same form again. Nothing here
        // can lose work, so the click is the answer and the status line says
        // what happened.
        executorApi()?.removeServer?.(name);
        setStatus(t("mcp_server_removed", name));
        renderChooserServers();
      }
    });
    document.getElementById("chooser-add-server")?.addEventListener("click", () => addServer());
  }

  async function refreshServerTools(name) {
    const server = serverByName(name);
    if (!server) return;
    setStatus(t("mcp_server_connecting", name));
    try {
      const listed = await listServerTools(server.url);
      const shapes = {};
      listed.tools.forEach((tool) => { shapes[tool.name] = { properties: tool.properties, required: tool.required };
        // Present only when the server's answer carries annotations.
        const hint = tool.annotations?.readOnlyHint;
        if (typeof hint === "boolean") shapes[tool.name].readOnly = hint;
        if (tool.annotations?.destructiveHint === true) shapes[tool.name].destructive = true;
      });
      executorApi()?.upsertServer?.(name, {
        tools: listed.tools.map((tool) => tool.name),
        toolShapes: shapes,
        searchTool: server.searchTool && listed.tools.some((tool) => tool.name === server.searchTool)
          ? server.searchTool
          : listed.tools.map((tool) => tool.name).find((tool) => /search|find|query|fetch|lookup/i.test(tool)) || "",
      });
      setStatus(t("mcp_server_tools_found", name, listed.tools.length));
      renderChooserServers();
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }

  async function addServer() {
    if (typeof showInputDialog !== "function") return;
    const name = String(await showInputDialog({
      title: t("mcp_server_add"),
      message: t("mcp_server_add_name"),
      placeholder: "Local tools",
    }) || "").trim();
    if (!name) return;
    const url = String(await showInputDialog({
      title: t("mcp_server_add"),
      message: t("mcp_server_add_url"),
      placeholder: "https://example.com/mcp",
    }) || "").trim();
    if (!url) return;
    executorApi()?.upsertServer?.(name, { url, enabled: true, tools: [], searchTool: "" });
    renderChooserServers();
    await refreshServerTools(name);
  }

  window.AISystem6McpServers = Object.freeze({
    listServerTools,
    callServerTool,
    searchWithServer,
    searchArgumentsFor,
    normalizeSearchResults,
    serverNameFromProvider,
    syncSearchProviderOptions,
    putOnFileFloppy,
    renderChooserServers,
    connectorsForRun,
    toolRule,
    defaultToolRule,
    setClioToolRule,
    refreshServerTools,
    addServer,
  });
})();
