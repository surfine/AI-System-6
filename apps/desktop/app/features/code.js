// ClioCode window (M9.6) — the page-side client of /api/cliocode/*.
//
// The engine host (apps/server/server/cliocode/*) works in place over a code
// folder the writer granted, asks before it acts according to the permission
// mode, checkpoints before each writing call and can rewind to a checkpoint.
// This module is the desk's half: grant a folder, pick a mode, start/stop a
// run, show tool calls, answer each approval card (allow once / allow for this
// session / reject), list checkpoints and rewind.
//
// The window is built on the ClioTalk shell (cliotalk-shell.js, its skins in
// 99-cliotalk-shell.css): the sidebar lists the granted folders and the
// sessions (runs) in the chosen one; the thread carries the prompt, the
// engine's words, its work log and the shell's own plan and permission
// cards; the right-hand panel shows the proposed changes as a file list and
// a unified diff, and the checkpoint timeline with a rewind at each point.
//
// The reducer and the controller below touch no DOM, so the contract can run
// them in a VM; the window is a thin render of the controller's view.
//
// Contract: tests/features/cliocode-client.test.mjs

(function installClioCode() {
  "use strict";
  if (window.ClioCodeLoaded) return;

  const WINDOW_NAME = "clioCode";
  const API_RUNS = "/api/cliocode/runs";
  // Bypass is not offered: the writer's own Mac is never an isolated environment.
  const MODES = Object.freeze(["manual", "acceptEdits", "plan", "auto"]);
  const ACTIVE_STATES = Object.freeze(["starting", "running", "stopping"]);
  const TERMINAL_STATES = Object.freeze(["done", "stopped", "error", "discarded"]);
  const DECISIONS = Object.freeze(["allow", "allow_session", "deny"]);

  // App copy lives in this lazy module: the boot budget carries only the label.
  const LOCAL_STRINGS = {
    en: {
      cliocode_folder: "Code folder", cliocode_choose_folder: "Choose folder…", cliocode_no_folder: "No code folder yet. Choose one to start.",
      cliocode_mode: "Permission mode", cliocode_prompt: "What should ClioCode do?",
      cliocode_start: "Start", cliocode_stop: "Stop", cliocode_idle: "Idle",
      cliocode_mode_manual: "Ask for everything", cliocode_mode_acceptEdits: "Accept edits",
      cliocode_mode_plan: "Plan (read only)", cliocode_mode_auto: "Auto",
      cliocode_state_starting: "Starting", cliocode_state_running: "Working", cliocode_state_stopping: "Stopping",
      cliocode_state_done: "Done", cliocode_state_stopped: "Stopped", cliocode_state_error: "Stopped by an error",
      cliocode_state_discarded: "Discarded",
      cliocode_log: "Work log", cliocode_log_empty: "Nothing yet. Click Start.",
      cliocode_approvals: "Waiting for you", cliocode_ask_about: "ClioCode asks to",
      cliocode_allow_once: "Allow once", cliocode_allow_session: "Allow for this session", cliocode_reject: "Reject",
      cliocode_decided_allow: "Allowed", cliocode_decided_allow_session: "Allowed for this session", cliocode_decided_deny: "Rejected",
      cliocode_checkpoints: "Checkpoints", cliocode_checkpoints_empty: "No checkpoint yet.",
      cliocode_rewind: "Rewind to here", cliocode_rewound: "Rewound",
      cliocode_files: "files", cliocode_new_file: "new",
      cliocode_plan_only: "This folder is not granted for changes, so the run stays in Plan mode.",
      cliocode_error_generic: "ClioCode could not do that. Try again, or check the Work log.",
      cliocode_why: "Why you are asked:",
      cliocode_danger_generic: "this command can do damage that is hard to undo",
      cliocode_danger_recursive_delete: "deletes files recursively",
      cliocode_danger_delete_outside_project: "deletes files outside the code folder",
      cliocode_danger_force_push: "force-pushes and can overwrite history on the remote",
      cliocode_danger_hard_reset: "discards uncommitted changes (git reset --hard)",
      cliocode_danger_force_clean: "deletes untracked files (git clean -f)",
      cliocode_danger_mirror_delete: "deletes files at the destination (rsync --delete)",
      cliocode_danger_recursive_chmod: "changes permissions or owners recursively",
      cliocode_danger_disk_write: "writes to a disk or wipes data",
      cliocode_danger_privilege_escalation: "runs with administrator rights",
      cliocode_danger_pipe_to_shell: "runs a script downloaded from the network",
      cliocode_danger_sensitive_path: "touches a secrets or system settings location",
    },
    zh: {
      cliocode_folder: "代码文件夹", cliocode_choose_folder: "选择文件夹…", cliocode_no_folder: "还没有代码文件夹。先选一个再开始。",
      cliocode_mode: "权限模式", cliocode_prompt: "要 ClioCode 做什么？",
      cliocode_start: "开始", cliocode_stop: "停止", cliocode_idle: "空闲",
      cliocode_mode_manual: "每步都问我", cliocode_mode_acceptEdits: "自动接受修改",
      cliocode_mode_plan: "计划（只读）", cliocode_mode_auto: "自动",
      cliocode_state_starting: "启动中", cliocode_state_running: "工作中", cliocode_state_stopping: "停止中",
      cliocode_state_done: "已完成", cliocode_state_stopped: "已停止", cliocode_state_error: "因错误停止",
      cliocode_state_discarded: "已丢弃",
      cliocode_log: "工作记录", cliocode_log_empty: "还没有记录。点「开始」。",
      cliocode_approvals: "等你回答", cliocode_ask_about: "ClioCode 想要",
      cliocode_allow_once: "允许一次", cliocode_allow_session: "本会话允许", cliocode_reject: "拒绝",
      cliocode_decided_allow: "已允许", cliocode_decided_allow_session: "本会话已允许", cliocode_decided_deny: "已拒绝",
      cliocode_checkpoints: "检查点", cliocode_checkpoints_empty: "还没有检查点。",
      cliocode_rewind: "回到这里", cliocode_rewound: "已回到检查点",
      cliocode_files: "个文件", cliocode_new_file: "新建",
      cliocode_plan_only: "这个文件夹没有修改授权，运行只能停在计划模式。",
      cliocode_error_generic: "ClioCode 没能完成这一步。请重试，或看工作记录。",
      cliocode_why: "为什么问你：",
      cliocode_danger_generic: "这条命令可能造成难以撤销的损害",
      cliocode_danger_recursive_delete: "会递归删除文件",
      cliocode_danger_delete_outside_project: "会删除代码文件夹之外的文件",
      cliocode_danger_force_push: "会强制推送，可能覆盖远端历史",
      cliocode_danger_hard_reset: "会丢掉未提交的修改（git reset --hard）",
      cliocode_danger_force_clean: "会删除未跟踪的文件（git clean -f）",
      cliocode_danger_mirror_delete: "会删除目标位置的文件（rsync --delete）",
      cliocode_danger_recursive_chmod: "会递归修改权限或所有者",
      cliocode_danger_disk_write: "会写入磁盘或抹掉数据",
      cliocode_danger_privilege_escalation: "会以管理员权限运行",
      cliocode_danger_pipe_to_shell: "会运行从网络下载的脚本",
      cliocode_danger_sensitive_path: "会碰到密钥或系统设置所在的位置",
    },
  };
  const language = () => (typeof document !== "undefined" && String(document.documentElement?.lang || "").toLowerCase().startsWith("zh") ? "zh" : "en");
  // The window's newer words are in the desk's translation files; the
  // shell's cards read the desk's tables, so installStrings() puts these
  // there too.
  const tr = (key, ...args) => LOCAL_STRINGS[language()]?.[key] || LOCAL_STRINGS.en[key] || (typeof t === "function" ? t(key, ...args) : key);
  function installStrings() {
    for (const [code, table] of [["en", "AISystem6TranslationsEn"], ["zh", "AISystem6TranslationsZh"]]) {
      const target = (window[table] ||= {});
      for (const [key, value] of Object.entries(LOCAL_STRINGS[code])) if (!(key in target)) target[key] = value;
    }
  }

  // ---- Transport ---------------------------------------------------------------

  /** The npm-start profile's desk link carries the per-boot token in the fragment. */
  function adoptFragmentToken() {
    if (window.AISystem6AgentToken) return;
    let token = "";
    try {
      const found = /(?:^|[#&])ais6-agent-token=([a-f0-9]{64})(?:&|$)/.exec(String(location.hash || ""));
      if (found) {
        token = found[1];
        history.replaceState(null, "", location.pathname + location.search);
        sessionStorage.setItem("ai-system6-agent-token", token);
      } else {
        token = String(sessionStorage.getItem("ai-system6-agent-token") || "");
      }
    } catch {}
    if (/^[a-f0-9]{64}$/.test(token)) window.AISystem6AgentToken = token;
  }

  async function request(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    if (typeof window.AISystem6AgentToken !== "string" || !window.AISystem6AgentToken) adoptFragmentToken();
    if (typeof window.AISystem6AgentToken === "string" && window.AISystem6AgentToken) {
      headers["X-AI-System6-Agent-Token"] = window.AISystem6AgentToken;
    }
    const lang = language();
    if (lang) headers["X-AI-System6-Language"] = lang;
    // /api/agent/folders is the shared-folder grant (the agent.harness service);
    // /api/cliocode/runs is this engine's own local route, a same-origin fetch
    // like the other lazy apps' — it stays out of the eager service table.
    if (path.startsWith("/api/cliocode/")) return fetch(path, { ...init, headers });
    return window.AISystem6Capabilities.requestService("agent.harness", { path, init: { ...init, headers } });
  }

  async function api(path, body, method = body === undefined ? "GET" : "POST") {
    const response = await request(path, body === undefined && method === "GET"
      ? { method }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.code = payload.code || "";
      throw error;
    }
    return payload;
  }

  function parseSse(buffer) {
    const events = [];
    const blocks = String(buffer).split(/\n\n/);
    const rest = blocks.pop() || "";
    for (const block of blocks) {
      let type = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) continue;
      try { events.push({ type, ...JSON.parse(data.join("\n")) }); } catch {}
    }
    return { events, rest };
  }

  // ---- Events -> view ----------------------------------------------------------

  function emptyView() {
    return {
      runId: "",
      state: "idle",
      mode: "manual",
      folderName: "",
      text: "",
      prompt: "",
      plan: [],
      tools: [],
      approvals: [],
      checkpoints: [],
      notes: [],
      error: "",
      lastSeq: 0,
    };
  }

  function upsertTool(tools, id, patch) {
    const found = tools.find((tool) => tool.id === id);
    if (found) return tools.map((tool) => (tool === found ? { ...tool, ...patch } : tool));
    return [...tools, { id, title: "", kind: "other", status: "pending", output: "", input: null, ...patch }];
  }

  /**
   * Fold one server event into the view. Pure: the view is replaced, never
   * mutated, so a render can compare and the contract can replay a log.
   * @param {ReturnType<typeof emptyView>} view
   * @param {any} event
   */
  function reduceEvent(view, event) {
    const next = { ...view };
    if (Number.isInteger(event?.seq) && event.seq > next.lastSeq) next.lastSeq = event.seq;
    switch (String(event?.type || "")) {
      case "status":
        next.state = String(event.state || next.state);
        if (event.mode) next.mode = String(event.mode);
        if (event.folderName) next.folderName = String(event.folderName);
        break;
      case "mode":
        next.mode = String(event.mode || next.mode);
        break;
      case "assistant_text":
        next.text += String(event.text || "");
        break;
      case "tool_call":
        next.tools = upsertTool(next.tools, String(event.id || ""), {
          title: String(event.title || ""), kind: String(event.kind || "other"), status: String(event.status || "pending"),
          // The call's arguments: what an edit proposes is drawn from them.
          ...(event.rawInput && typeof event.rawInput === "object" ? { input: event.rawInput } : {}),
        });
        break;
      case "tool_update":
        next.tools = upsertTool(next.tools, String(event.id || ""), {
          status: String(event.status || ""), output: String(event.output || ""),
          ...(event.title ? { title: String(event.title) } : {}),
          ...(event.rawInput && typeof event.rawInput === "object" ? { input: event.rawInput } : {}),
        });
        break;
      case "plan":
        // The engine's plan (todo_write, or ACP's own): the latest replaces the last.
        next.plan = (Array.isArray(event.entries) ? event.entries : []).map((entry) => ({
          content: String(entry?.content || ""), status: String(entry?.status || "pending"),
        })).filter((entry) => entry.content);
        break;
      case "command_output":
        next.notes = [...next.notes, { kind: "output", command: String(event.command || ""), exitCode: event.exitCode ?? null, text: String(event.output || "") }];
        break;
      case "permission_request":
        if (!next.approvals.some((card) => card.toolCallId === event.toolCallId)) {
          next.approvals = [...next.approvals, {
            toolCallId: String(event.toolCallId || ""),
            action: String(event.action || event.kind || ""),
            reason: String(event.reason || ""),
            danger: String(event.danger || ""),
            title: String(event.title || ""),
            command: String(event.command || ""),
            paths: Array.isArray(event.paths) ? event.paths.map(String) : [],
            host: String(event.host || ""),
            sessionAllowed: event.sessionAllowed === true,
            // pending -> answering (one POST in flight) -> decided
            status: "pending",
            decision: "",
          }];
        }
        break;
      case "permission":
        // The server's decision record settles a card (also one answered from
        // another window, or auto-decided by the mode table).
        next.approvals = next.approvals.map((card) => (card.toolCallId === event.toolCallId
          ? { ...card, status: "decided", decision: String(event.decision || "") }
          : card));
        break;
      case "checkpoint":
        if (!next.checkpoints.some((cp) => cp.id === event.id)) {
          next.checkpoints = [...next.checkpoints, {
            id: Number(event.id), toolCallId: String(event.toolCallId || ""), action: String(event.action || ""),
            title: String(event.title || ""), files: Array.isArray(event.files) ? event.files : [], at: String(event.at || ""),
          }];
        }
        break;
      case "rewind":
        // The ledger is trimmed forward of the checkpoint rewound to.
        next.checkpoints = next.checkpoints.filter((cp) => cp.id <= Number(event.toCheckpoint));
        next.notes = [...next.notes, { kind: "rewind", id: Number(event.toCheckpoint) }];
        break;
      case "error":
        next.error = String(event.message || event.code || "");
        break;
      default:
        break;
    }
    return next;
  }

  // ---- Controller (no DOM) -----------------------------------------------------

  const state = {
    view: emptyView(),
    folders: [],
    folderId: "",
    mode: "manual",
    prompt: "",
    busy: false,
    message: "",
    abort: null,
    // The sessions: the engine's runs, newest first (GET /api/cliocode/runs).
    runs: [],
    // The run whose plan "Go Ahead" was sent for (one answer per plan).
    planSent: "",
  };
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => { try { listener(state); } catch {} });
  const isActive = () => ACTIVE_STATES.includes(state.view.state);

  function errorText(error) {
    return String(error?.message || error?.code || "") || tr("cliocode_error_generic");
  }

  async function refreshFolders() {
    const payload = await api("/api/agent/folders");
    state.folders = (payload.folders || []).filter((folder) => folder.available);
    if (!state.folders.some((folder) => folder.id === state.folderId)) state.folderId = state.folders[0]?.id || "";
    notify();
    return state.folders;
  }

  /** Grant a code folder through the native Chooser; ClioCode edits in place, so the grant is `change`. */
  async function grantFolder() {
    const result = await api("/api/agent/folders/choose", { level: "change" });
    if (!result.cancelled && result.folder) state.folderId = result.folder.id;
    await refreshFolders();
    return result;
  }

  function selectFolder(folderId) {
    state.folderId = String(folderId || "");
    notify();
  }

  /**
   * Pick a mode. Before a run it is kept for the start; during a run it is
   * sent at once and takes effect on the next tool call.
   * @param {string} mode
   */
  async function setMode(mode) {
    if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}`);
    state.mode = mode;
    if (state.view.runId && isActive()) {
      await api(`${API_RUNS}/${encodeURIComponent(state.view.runId)}/mode`, { mode });
      state.view = { ...state.view, mode };
    }
    notify();
    return mode;
  }

  async function streamRun(runId, signal, after = 0) {
    const response = await request(`${API_RUNS}/${encodeURIComponent(runId)}/events${after ? `?after=${after}` : ""}`, { method: "GET", signal });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSse(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) onEvent(event);
    }
  }

  function onEvent(event) {
    state.view = reduceEvent(state.view, event);
    notify();
    if (event?.type === "status" && TERMINAL_STATES.includes(String(event.state || ""))) {
      void refreshCheckpoints().catch(() => {});
      void refreshRuns().catch(() => {});
    }
  }

  /** Start a run over the chosen folder and follow its events. */
  async function start(prompt = state.prompt) {
    if (isActive()) return null;
    state.prompt = String(prompt || "");
    state.message = "";
    const run = await api(API_RUNS, { folderId: state.folderId, prompt: state.prompt, mode: state.mode });
    state.view = { ...emptyView(), runId: run.id || run.runId || "", state: String(run.state || "starting"), mode: String(run.mode || state.mode), prompt: state.prompt };
    if (state.view.mode !== state.mode && state.view.mode === "plan") state.message = tr("cliocode_plan_only");
    notify();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    state.abort = controller;
    // Fire and keep: the stream ends when the run settles.
    void streamRun(state.view.runId, controller?.signal).catch((error) => {
      if (error?.name !== "AbortError") { state.message = errorText(error); notify(); }
    });
    void refreshRuns().catch(() => {});
    return run;
  }

  /** The sessions list: every run the engine host knows, newest first. */
  async function refreshRuns() {
    const payload = await api(API_RUNS);
    state.runs = (Array.isArray(payload.runs) ? payload.runs : []).map((run) => ({
      runId: String(run.runId || run.id || ""), folderId: String(run.folderId || ""), folderName: String(run.folderName || ""),
      title: String(run.title || ""), state: String(run.state || ""), mode: String(run.mode || ""), createdAt: String(run.createdAt || ""),
    })).filter((run) => run.runId);
    notify();
    return state.runs;
  }

  /** Let go of the run on screen: its stream stops; the run itself goes on in the host. */
  function release() {
    try { state.abort?.abort(); } catch {}
    state.abort = null;
  }

  /** New Session: an empty thread on the chosen folder. */
  function newSession() {
    release();
    state.view = emptyView();
    state.prompt = "";
    state.message = "";
    notify();
    return true;
  }

  /** Open a session from the list: replay its events and read its checkpoints. */
  async function openRun(runId) {
    const id = String(runId || "");
    if (!id || state.view.runId === id) return null;
    const run = state.runs.find((entry) => entry.runId === id);
    release();
    state.view = { ...emptyView(), runId: id, state: run?.state || "idle", mode: run?.mode || state.mode, folderName: run?.folderName || "", prompt: run?.title || "" };
    if (run?.folderId && state.folders.some((folder) => folder.id === run.folderId)) state.folderId = run.folderId;
    state.message = "";
    notify();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    state.abort = controller;
    void streamRun(id, controller?.signal).catch((error) => {
      if (error?.name !== "AbortError") { state.message = errorText(error); notify(); }
    });
    return refreshCheckpoints().catch(() => []);
  }

  /**
   * Go Ahead on a plan made in Plan mode: during the run the mode becomes
   * Ask for everything (it takes effect on the next tool call); after it, a
   * new run in that mode carries the plan out. The plan itself never writes.
   */
  async function goAhead() {
    const view = state.view;
    if (!view.plan.length || state.planSent === view.runId) return null;
    state.planSent = view.runId;
    notify();
    try {
      if (isActive()) return await setMode("manual");
      state.mode = "manual";
      const steps = view.plan.map((entry, index) => `${index + 1}. ${entry.content}`).join("\n");
      return await start(`${view.prompt}\n\n${tr("cliocode_plan_carry")}\n${steps}`.trim());
    } catch (error) {
      state.planSent = "";
      state.message = errorText(error);
      notify();
      throw error;
    }
  }

  async function stop() {
    if (!state.view.runId) return null;
    const result = await api(`${API_RUNS}/${encodeURIComponent(state.view.runId)}/stop`, {});
    return result;
  }

  /**
   * Answer one approval card. The card goes to `answering` before the POST, so
   * a second click on the same card is a no-op (one answer per card); the
   * server's `permission` event, or the 200 itself, settles it.
   * @param {string} toolCallId
   * @param {"allow" | "allow_session" | "deny"} decision
   */
  async function answerPermission(toolCallId, decision) {
    if (!DECISIONS.includes(decision)) throw new Error(`Unknown decision ${decision}`);
    const card = state.view.approvals.find((entry) => entry.toolCallId === toolCallId);
    if (!card || card.status !== "pending") return null;
    const mark = (patch) => {
      state.view = { ...state.view, approvals: state.view.approvals.map((entry) => (entry.toolCallId === toolCallId ? { ...entry, ...patch } : entry)) };
      notify();
    };
    mark({ status: "answering", decision });
    try {
      const result = await api(`${API_RUNS}/${encodeURIComponent(state.view.runId)}/permission`, { toolCallId, decision });
      mark({ status: "decided", decision });
      return result;
    } catch (error) {
      // The server refused or the request failed: the card is open again so
      // the writer can answer, unless the server says it was already answered.
      mark(error?.code === "permission_unknown" ? { status: "decided", decision } : { status: "pending", decision: "" });
      state.message = errorText(error);
      notify();
      throw error;
    }
  }

  async function refreshCheckpoints() {
    if (!state.view.runId) return [];
    const payload = await api(`${API_RUNS}/${encodeURIComponent(state.view.runId)}/checkpoints`);
    state.view = {
      ...state.view,
      checkpoints: (payload.checkpoints || []).map((cp) => ({
        id: Number(cp.id), toolCallId: String(cp.toolCallId || ""), action: String(cp.action || ""), title: String(cp.title || ""), files: cp.files || [],
      })),
    };
    notify();
    return state.view.checkpoints;
  }

  /** Rewind the folder to a checkpoint of this run (the engine must not be working). */
  async function rewind(checkpointId) {
    const id = Number(checkpointId);
    if (!state.view.runId || !Number.isInteger(id) || id < 1) throw new Error("A checkpoint id is needed.");
    try {
      const result = await api(`${API_RUNS}/${encodeURIComponent(state.view.runId)}/rewind`, { toCheckpoint: id });
      state.view = reduceEvent(state.view, { type: "rewind", toCheckpoint: id });
      notify();
      return result;
    } catch (error) {
      state.message = errorText(error);
      notify();
      throw error;
    }
  }

  // ---- Proposed changes (no DOM) -----------------------------------------------
  //
  // What an edit proposes is read from the tool call's own arguments: an
  // old/new pair (edit, multi_edit), a whole body (write) or a patch
  // (apply_patch, unified or *** Begin Patch). Each file becomes rows of
  // { kind: "add" | "del" | "ctx" | "hunk", text }.

  const OLD_FIELDS = ["old_string", "oldText", "old_str", "old"];
  const NEW_FIELDS = ["new_string", "newText", "new_str", "new"];
  const BODY_FIELDS = ["content", "text", "file_text", "new_source"];
  const PATH_FIELDS = ["file_path", "filePath", "path", "notebook_path"];
  const PATCH_FIELDS = ["patch", "input", "diff"];
  const pick = (object, names) => names.map((name) => object?.[name]).find((value) => typeof value === "string");
  const line = (kind, text) => ({ kind, text });

  /** Line diff by longest common subsequence; a pair too large to compare is shown whole, removed then added. */
  function lineDiff(before, after) {
    const a = before ? String(before).split("\n") : [];
    const b = after ? String(after).split("\n") : [];
    if (a.length * b.length > 250000) return [...a.map((text) => line("del", text)), ...b.map((text) => line("add", text))];
    const common = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
      }
    }
    const rows = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { rows.push(line("ctx", a[i])); i += 1; j += 1; }
      else if (common[i + 1][j] >= common[i][j + 1]) { rows.push(line("del", a[i])); i += 1; }
      else { rows.push(line("add", b[j])); j += 1; }
    }
    while (i < a.length) rows.push(line("del", a[i++]));
    while (j < b.length) rows.push(line("add", b[j++]));
    return rows;
  }

  /** A unified diff or a *** Begin Patch envelope, one entry per file. */
  function parsePatch(text) {
    const files = [];
    const lines = String(text || "").split("\n");
    let file = null;
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      const named = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/.exec(raw);
      if (named) { file = { path: named[1].trim(), lines: [] }; files.push(file); continue; }
      if (/^--- /.test(raw) && /^\+\+\+ /.test(lines[index + 1] || "")) {
        const from = raw.slice(4).replace(/\t.*$/, "").trim();
        const to = lines[index + 1].slice(4).replace(/\t.*$/, "").trim();
        file = { path: (to === "/dev/null" ? from : to).replace(/^[ab]\//, ""), lines: [] };
        files.push(file);
        index += 1;
        continue;
      }
      if (!file || !raw || /^(\*\*\* |diff --git |index |new file mode|deleted file mode|similarity |rename |\\ No newline)/.test(raw)) continue;
      if (raw.startsWith("@@")) file.lines.push(line("hunk", raw));
      else if (raw[0] === "+") file.lines.push(line("add", raw.slice(1)));
      else if (raw[0] === "-") file.lines.push(line("del", raw.slice(1)));
      else file.lines.push(line("ctx", raw[0] === " " ? raw.slice(1) : raw));
    }
    return files;
  }

  const isEditTool = (tool) => tool.title !== "todo_write" && (tool.kind === "edit" || /edit|write|patch|create/i.test(tool.title));

  /** The files one edit call proposes to change. */
  function changesOf(tool) {
    const input = tool?.input && typeof tool.input === "object" ? tool.input : null;
    if (!input || !isEditTool(tool)) return [];
    const patch = PATCH_FIELDS.map((name) => input[name]).find((value) => typeof value === "string" && /^(\*\*\* Begin Patch|\*\*\* (Update|Add) File|--- |diff --git |@@ )/m.test(value));
    if (patch) return parsePatch(patch);
    const path = pick(input, PATH_FIELDS);
    if (!path) return [];
    if (Array.isArray(input.edits)) {
      return [{ path, lines: input.edits.flatMap((edit, index) => [...(index ? [line("hunk", "@@")] : []), ...lineDiff(pick(edit, OLD_FIELDS) || "", pick(edit, NEW_FIELDS) || "")]) }];
    }
    const after = pick(input, NEW_FIELDS);
    if (after !== undefined) return [{ path, lines: lineDiff(pick(input, OLD_FIELDS) || "", after) }];
    const body = pick(input, BODY_FIELDS);
    return body === undefined ? [] : [{ path, lines: lineDiff("", body) }];
  }

  /**
   * Every change the run's edit calls propose, with where each stands:
   * waiting (its approval card is open), refused, applied, or proposed.
   * @param {ReturnType<typeof emptyView>} view
   */
  function proposedChanges(view) {
    const cards = new Map(view.approvals.map((card) => [card.toolCallId, card]));
    return view.tools.flatMap((tool) => changesOf(tool).map((file, index) => {
      const card = cards.get(tool.id);
      const status = card && card.status !== "decided" ? "waiting"
        : card?.decision === "deny" || tool.status === "failed" ? "refused"
          : tool.status === "completed" ? "applied" : "proposed";
      return {
        key: `${tool.id}:${index}`, toolCallId: tool.id, path: file.path, lines: file.lines, status,
        added: file.lines.filter((row) => row.kind === "add").length,
        removed: file.lines.filter((row) => row.kind === "del").length,
      };
    }));
  }

  // ---- Window ------------------------------------------------------------------

  const winEl = () => document.querySelector(`[data-window="${WINDOW_NAME}"]`);
  const shellParts = () => window.AISystem6ClioTalkShell?.parts || null;
  const ui = {};
  // toolCallId (or "plan") -> the shell card's record, kept so a re-render
  // never rebuilds a card under the writer's click.
  const records = new Map();
  let panelTab = "changes";
  let chosenChange = "";
  let frame = 0;
  let sideKey = "";

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, onClick, className = "btn") {
    const node = el("button", className, label);
    node.type = "button";
    node.addEventListener("click", () => { Promise.resolve(onClick()).catch(() => {}); });
    return node;
  }

  function sideRow(iconName, labelKey, onClick) {
    const row = button("", onClick, "cl-side-row");
    row.insertAdjacentHTML("beforeend", shellParts()?.icon(iconName) || "");
    const label = el("span");
    label.dataset.i18n = labelKey;
    label.textContent = tr(labelKey);
    row.append(label);
    return row;
  }

  function stateLabel() {
    const key = `cliocode_state_${state.view.state}`;
    const label = tr(key);
    return label === key ? tr("cliocode_idle") : label;
  }

  function syncSkin() {
    if (ui.root) ui.root.dataset.skin = shellParts()?.skinFor(document.body.dataset.theme) || "classic";
  }

  const schedule = () => {
    if (frame) return;
    frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => { frame = 0; render(); }) : 0;
    if (!frame) render();
  };

  function installWindow() {
    if (winEl()) return winEl();
    installStrings();
    const win = window.AISystem6ApplicationShell.createWindow({
      windowName: WINDOW_NAME,
      windowClass: "clio-code-window",
      labelledBy: "clio-code-title",
      // Naming law: ClioCode stays untranslated, like ClioTalk and ClioProject.
      title: "ClioCode",
      statusClass: "compact-status-bar",
      statusHtml: `<span class="status-bar-leading" data-cc-status></span>`,
      paneClass: "clio-code-pane",
      paneHtml: `<div class="clio-shell clio-code-shell" data-cc-root></div>`,
    });
    build(win.querySelector("[data-cc-root]"));
    syncSkin();
    new MutationObserver(syncSkin).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    // A language switch: the words go back into the tables, and the cards
    // (whose labels are drawn) are made again.
    new MutationObserver(() => { installStrings(); records.clear(); sideKey = ""; render(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    listeners.add(schedule);
    render();
    void refreshFolders().catch(() => {});
    void refreshRuns().catch(() => {});
    return win;
  }

  function build(root) {
    ui.root = root;
    const side = el("nav", "clio-sidebar cc-sidebar");
    side.setAttribute("aria-label", "ClioCode");
    ui.side = side;
    ui.foldersLabel = el("div", "cl-side-label");
    ui.folders = el("div", "cl-recent-list");
    ui.sessionsLabel = el("div", "cl-side-label");
    ui.sessions = el("div", "cl-recent-list");
    side.append(
      sideRow("plus", "new_session", newSession),
      sideRow("folder", "agent_choose_folder", grantFolder),
      ui.foldersLabel, ui.folders, ui.sessionsLabel, ui.sessions,
    );

    const main = el("div", "clio-main cc-main");
    const head = el("div", "cc-head");
    ui.headName = el("span", "cc-head-name");
    ui.headState = el("span", "cc-head-state");
    const wrap = el("div", "select-wrap cc-head-mode");
    ui.mode = el("select");
    for (const mode of MODES) {
      const option = el("option");
      option.value = mode;
      ui.mode.append(option);
    }
    ui.mode.addEventListener("change", () => { void setMode(ui.mode.value).catch(() => {}); });
    wrap.append(ui.mode);
    head.append(ui.headName, ui.headState, wrap);
    ui.scroller = el("div", "cc-thread");
    ui.thread = el("div", "clio-task cc-task");
    ui.scroller.append(ui.thread);

    const composer = el("form", "cc-composer");
    ui.prompt = el("textarea");
    ui.prompt.rows = 3;
    ui.prompt.addEventListener("input", () => {
      state.prompt = ui.prompt.value;
      ui.go.disabled = !isActive() && (!state.folderId || !state.prompt.trim());
    });
    // ⌘Return starts, as Return sends in ClioTalk; a plain Return is a new line (code prompts have them).
    ui.prompt.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !ui.go.disabled) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });
    const bar = el("div", "cc-bar cc-composer-bar");
    ui.hint = el("span", "cc-composer-hint");
    ui.hint.setAttribute("role", "status");
    ui.go = el("button", "btn default");
    ui.go.type = "submit";
    bar.append(ui.hint, ui.go);
    composer.append(ui.prompt, bar);
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      Promise.resolve(isActive() ? stop() : start()).catch((error) => { state.message = errorText(error); notify(); });
    });
    main.append(head, ui.scroller, composer);

    const panel = el("aside", "clio-panel cc-panel");
    const panelHead = el("div", "cl-panel-head");
    ui.panelName = el("span", "cl-panel-name");
    const tabs = el("div", "cl-tabs");
    ui.tabs = [["changes", "cliocode_changes"], ["checkpoints", "cliocode_checkpoints"]].map(([id, key]) => {
      const tab = button("", () => { panelTab = id; render(); }, "btn cl-tab");
      tab.dataset.view = id;
      tab.dataset.key = key;
      return tab;
    });
    tabs.append(...ui.tabs);
    panelHead.append(ui.panelName, tabs);
    ui.panelBody = el("div", "cl-panel-body cc-panel-body");
    ui.panelBody.tabIndex = 0;
    panel.append(panelHead, ui.panelBody);
    root.append(side, main, panel);
  }

  function render() {
    const win = winEl();
    if (!win || !ui.root) return;
    const view = state.view;
    const active = isActive();
    const status = win.querySelector("[data-cc-status]");
    const folder = state.folders.find((entry) => entry.id === state.folderId);
    const place = view.folderName || folder?.name || "";
    if (status) status.textContent = `${place ? `${place} · ` : ""}${stateLabel()}`;
    renderSidebar();

    ui.headName.textContent = place || tr("cliocode_no_folder");
    ui.headState.textContent = view.runId ? stateLabel() : "";
    ui.mode.setAttribute("aria-label", tr("cliocode_mode"));
    [...ui.mode.options].forEach((option) => { option.textContent = tr(`cliocode_mode_${option.value}`); });
    ui.mode.value = view.runId && active ? view.mode : state.mode;

    renderThread(active);

    ui.prompt.placeholder = tr("cliocode_prompt");
    ui.prompt.setAttribute("aria-label", tr("cliocode_prompt"));
    if (ui.prompt.value !== state.prompt) ui.prompt.value = state.prompt;
    ui.prompt.disabled = active;
    ui.go.textContent = tr(active ? "cliocode_stop" : "cliocode_start");
    ui.go.disabled = active ? view.state === "stopping" : !state.folderId || !state.prompt.trim();
    ui.hint.textContent = state.message || view.error || (state.folders.length ? "" : tr("cliocode_no_folder"));

    renderPanel(active);
  }

  function renderSidebar() {
    const runs = state.runs.filter((run) => run.folderId === state.folderId);
    const key = JSON.stringify([state.folders.map((f) => [f.id, f.name]), state.folderId, runs.map((r) => [r.runId, r.title, r.state]), state.view.runId, document.documentElement.lang]);
    if (key === sideKey) return;
    sideKey = key;
    ui.foldersLabel.textContent = tr("cliocode_folders");
    ui.sessionsLabel.textContent = tr("cliocode_sessions");
    ui.folders.replaceChildren(...state.folders.map((folder) => {
      const row = button("", () => selectFolder(folder.id), `cl-recent${folder.id === state.folderId ? " is-sel" : ""}`);
      row.insertAdjacentHTML("beforeend", shellParts()?.icon("folder") || "");
      row.append(el("span", "cl-recent-name", folder.name));
      if (folder.id === state.folderId) row.setAttribute("aria-current", "true");
      return row;
    }));
    if (!state.folders.length) ui.folders.append(el("div", "cl-recent-empty", tr("cliocode_no_folder")));
    ui.sessions.replaceChildren(...runs.map((run) => {
      const row = button("", () => openRun(run.runId), `cl-recent${run.runId === state.view.runId ? " is-sel" : ""}`);
      row.append(el("span", "cl-recent-name", run.title || tr("cliocode_untitled")));
      const word = tr(`cliocode_state_${run.state}`);
      if (!word.startsWith("cliocode_")) row.append(el("span", "cl-key", word));
      if (run.runId === state.view.runId) row.setAttribute("aria-current", "true");
      return row;
    }));
    if (!runs.length) ui.sessions.append(el("div", "cl-recent-empty", tr("cliocode_no_sessions")));
  }

  function permissionRecord(card) {
    let record = records.get(card.toolCallId);
    const what = card.command || card.paths.join(", ") || card.host || card.title;
    let text = what;
    if (card.reason === "dangerous_command") {
      // Say why it is asking: the danger code names the rule that matched.
      const why = card.danger && LOCAL_STRINGS.en[`cliocode_danger_${card.danger}`] ? tr(`cliocode_danger_${card.danger}`) : tr("cliocode_danger_generic");
      text = `${what}. ${tr("cliocode_why")} ${why}`;
    }
    const proposal = {
      id: card.toolCallId,
      title: `${tr("cliocode_ask_about")} ${card.title || card.action}`.trim(),
      payload: { text },
      answer: card.status === "decided" ? card.decision : "",
    };
    const live = card.status !== "decided";
    if (!record) {
      const choices = card.sessionAllowed
        ? { allow: "cliocode_allow_once", allow_session: "cliocode_allow_session", deny: "cliocode_reject" }
        : { allow: "cliocode_allow_once", deny: "cliocode_reject" };
      record = {
        proposal, live, choices,
        send: (method, decision) => { void answerPermission(card.toolCallId, decision).catch(() => {}); },
        sent: () => state.view.approvals.find((entry) => entry.toolCallId === card.toolCallId)?.status === "answering",
      };
      records.set(card.toolCallId, record);
      shellParts().cards.permission(record);
    } else {
      record.proposal = proposal;
      record.live = live;
      record.sync();
    }
    record.el.dataset.toolCallId = card.toolCallId;
    return record.el;
  }

  function planRecord(view) {
    const proposal = { id: `plan:${view.runId}`, title: "", reason: "", payload: { steps: view.plan.map((entry) => entry.content) } };
    const live = view.mode === "plan" && state.planSent !== view.runId && !!state.folderId;
    let record = records.get("plan");
    if (!record || record.proposal.id !== proposal.id) {
      record = {
        proposal, live, noteKey: "cliocode_plan_note",
        send: () => { void goAhead().catch(() => {}); },
        sent: () => state.planSent === state.view.runId,
        focus: () => ui.prompt?.focus(),
      };
      records.set("plan", record);
      shellParts().cards.plan(record);
    } else {
      record.proposal = proposal;
      record.live = live;
      record.sync();
    }
    return record.el;
  }

  function toolLine(tool) {
    const input = tool.input || {};
    const target = pick(input, PATH_FIELDS) || (Array.isArray(input.command) ? input.command.join(" ") : pick(input, ["command", "pattern", "url", "query"])) || "";
    const row = el("li", "cc-log-row");
    row.dataset.toolId = tool.id;
    row.dataset.status = tool.status;
    row.append(el("span", "cc-log-title", tool.title || tool.kind), el("span", "cc-log-target", target));
    const word = tr(`cliocode_tool_${tool.status}`);
    row.append(el("span", "cc-log-state", word.startsWith("cliocode_") ? tool.status : word));
    return row;
  }

  function renderThread(active) {
    const view = state.view;
    const parts = shellParts();
    const stick = ui.scroller.scrollHeight - ui.scroller.scrollTop - ui.scroller.clientHeight < 24;
    const items = [];
    if (!view.runId && !view.prompt) {
      items.push(el("p", "cc-empty", state.folderId ? tr("cliocode_log_empty") : tr("cliocode_no_folder")));
    }
    if (view.prompt) {
      const said = el("p", "cl-task-prompt", view.prompt);
      said.setAttribute("aria-label", tr("cliocode_you"));
      items.push(said);
    }
    if (view.text) items.push(el("div", "cc-reply", view.text));
    if (view.tools.length || view.notes.length) {
      const log = el("ol", "cc-log");
      log.setAttribute("aria-label", tr("cliocode_log"));
      log.append(...view.tools.map(toolLine));
      for (const note of view.notes) {
        if (note.kind === "rewind") log.append(el("li", "cc-log-row is-note", tr("cliocode_rewound_to", note.id)));
        else if (note.kind === "output") log.append(el("li", "cc-log-row is-note", `$ ${note.command}${note.exitCode === null ? "" : `  (${note.exitCode})`}`));
      }
      items.push(log);
    }
    if (parts && view.plan.length) items.push(planRecord(view));
    if (parts) for (const card of view.approvals) items.push(permissionRecord(card));
    if (view.runId && !active && !view.tools.length && !view.text && TERMINAL_STATES.includes(view.state)) {
      items.push(el("p", "cc-empty", stateLabel()));
    }
    ui.thread.replaceChildren(...items);
    if (stick) ui.scroller.scrollTop = ui.scroller.scrollHeight;
  }

  function renderPanel(active) {
    const view = state.view;
    ui.tabs.forEach((tab) => {
      tab.textContent = tr(tab.dataset.key);
      tab.setAttribute("aria-pressed", String(tab.dataset.view === panelTab));
    });
    if (panelTab === "checkpoints") {
      ui.panelName.textContent = view.checkpoints.length ? `#${view.checkpoints.at(-1).id}` : "";
      ui.panelBody.replaceChildren(timeline(active));
      return;
    }
    const changes = proposedChanges(view);
    const added = changes.reduce((sum, change) => sum + change.added, 0);
    const removed = changes.reduce((sum, change) => sum + change.removed, 0);
    ui.panelName.textContent = changes.length ? `+${added} −${removed}` : "";
    if (!changes.length) {
      ui.panelBody.replaceChildren(el("p", "cc-empty", tr("cliocode_changes_empty")));
      return;
    }
    // The shown change: the one picked, else the first waiting on the writer, else the newest.
    const shown = changes.find((change) => change.key === chosenChange)
      || changes.find((change) => change.status === "waiting") || changes.at(-1);
    const list = el("ul", "cc-files");
    for (const change of changes) {
      const item = el("li");
      const row = button("", () => { chosenChange = change.key; render(); }, "cc-file");
      row.setAttribute("aria-pressed", String(change === shown));
      row.dataset.status = change.status;
      const count = el("span", "cc-file-count");
      count.append(el("span", "cc-n-add", `+${change.added}`), el("span", "cc-n-del", `−${change.removed}`));
      const word = {
        waiting: "cliocode_change_waiting", refused: "cliocode_change_refused", applied: "cliocode_tool_completed", proposed: "cliocode_tool_pending",
      }[change.status];
      row.append(el("span", "cc-file-path", change.path), count, el("span", "cc-file-state", tr(word)));
      item.append(row);
      list.append(item);
    }
    const diff = el("pre", "cc-diff");
    diff.setAttribute("aria-label", tr("cliocode_changes_label", shown.path));
    diff.tabIndex = 0;
    for (const row of shown.lines) {
      const out = el("span", `cc-line is-${row.kind}`);
      const sign = row.kind === "add" ? "+" : row.kind === "del" ? "-" : row.kind === "hunk" ? "" : " ";
      if (row.kind !== "hunk") out.append(el("span", "cc-sign", sign));
      out.append(document.createTextNode(`${row.text}\n`));
      diff.append(out);
    }
    ui.panelBody.replaceChildren(list, diff);
  }

  function timeline(active) {
    const view = state.view;
    if (!view.checkpoints.length) return el("p", "cc-empty", tr("cliocode_checkpoints_empty"));
    const list = el("ol", "cc-timeline");
    list.setAttribute("aria-label", tr("cliocode_checkpoints"));
    const origin = el("li", "cc-point is-origin");
    origin.append(el("span", "cc-dot"), el("div", "cc-point-title", tr("cliocode_session_start")));
    list.append(origin);
    const rewound = view.notes.filter((note) => note.kind === "rewind").at(-1)?.id;
    view.checkpoints.forEach((cp, index) => {
      const point = el("li", `cc-point${index === view.checkpoints.length - 1 ? " is-current" : ""}`);
      point.dataset.checkpoint = String(cp.id);
      const body = el("div", "cc-point-body");
      body.append(el("div", "cc-point-title", `#${cp.id} ${cp.title || cp.action}`));
      const names = cp.files.map((file) => `${file.path}${file.existed === false ? ` (${tr("cliocode_new_file")})` : ""}`).join(", ");
      if (names) body.append(el("div", "cc-point-files", names));
      const bar = el("div", "cc-bar");
      if (rewound === cp.id) bar.append(el("span", "cc-point-mark", tr("cliocode_rewound")));
      const back = button(tr("cliocode_rewind"), () => rewind(cp.id));
      back.disabled = active;
      bar.append(back);
      body.append(bar);
      point.append(el("span", "cc-dot"), body);
      list.append(point);
    });
    return list;
  }

  async function open() {
    // The application shell and the Clio shell (its skins, cards and sheet)
    // are not part of the loader line (boot budget); load them here.
    if (!window.AISystem6ApplicationShell && typeof loadClassicScriptOnce === "function") await loadClassicScriptOnce("app/core/application-shell.js");
    if (typeof ensureClioTalkShellModule === "function") await ensureClioTalkShellModule().catch(() => {});
    installWindow();
    syncSkin();
    // A window attached before the shell arrived drew its sidebar without icons.
    if (!ui.side?.querySelector(".cl-ico") && shellParts()) {
      ui.side.querySelectorAll(":scope > .cl-side-row").forEach((row, index) => row.insertAdjacentHTML("afterbegin", shellParts().icon(index ? "folder" : "plus")));
    }
    sideKey = "";
    render();
    await openWindow(WINDOW_NAME);
    return true;
  }

  // File and Edit join Special on ClioCode's menu bar (the lazy menu sets,
  // menus.js), so the boot carries none of it.
  const item = (action, labelKey, shortcutId = "") => ({ type: "item", action, labelKey, shortcutId, conditionId: action });
  const separator = { type: "separator" };
  window.AISystem6RegisterApplicationMenuSet?.("clioCode", [
    { id: "file", labelKey: "menu_file", items: [item("cliocode-new-session", "new_session"), item("cliocode-choose-folder", "agent_choose_folder"), separator, item("close-active-window", "close", "close-window")] },
    { id: "edit", labelKey: "menu_edit", items: [item("undo", "undo", "undo"), separator, item("copy", "copy", "copy"), item("select-all", "select_all", "select-all")] },
  ]);

  window.AISystem6ClioCode = {
    open,
    // The window registry's lazy attach: build the empty window once the shell exists.
    attach: () => (window.AISystem6ApplicationShell ? installWindow() : null),
    // The controller, for the contract and for the window above.
    reduceEvent,
    emptyView,
    parseSse,
    refreshFolders,
    grantFolder,
    selectFolder,
    setMode,
    start,
    stop,
    answerPermission,
    refreshCheckpoints,
    rewind,
    refreshRuns,
    openRun,
    newSession,
    goAhead,
    proposedChanges,
    lineDiff,
    parsePatch,
    onEvent,
    state: () => state,
    modes: MODES,
  };
  window.AISystem6Runtime?.registerApplication({
    id: "clioCode",
    windowName: WINDOW_NAME,
    mount: open,
    restore: open,
    commands: {
      "open-clio-code": { handler: () => open(), isAvailable: () => true },
      "cliocode-new-session": { handler: () => newSession(), isAvailable: () => !!winEl() },
      "cliocode-choose-folder": { handler: () => grantFolder(), isAvailable: () => !!winEl() && !isActive() },
    },
  });
  window.ClioCodeLoaded = true;
})();
