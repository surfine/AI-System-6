// ClioTalk agent mode (对话 / 代理) — the front end of the engine host.
//
// One UI, two engines: on this Mac (capability agent_harness) the engine host
// below; on the public web (agent_cloud) a disposable cloud container per run
// through window.AISystem6AgentCloud (cliotalk-agent-cloud.js), where the
// writer ticks Project Hard Disk files instead of sharing a folder and 放回
// writes into IndexedDB. Plan, log, Stop, receipts and the put-back window
// are the same code for both.
//
// The engine is DeepSeek Harness running on this Mac's server inside a shadow
// copy of a folder the writer shared through Chooser (docs/AGENT-HARNESS.md).
// This module draws what it does as System 6 objects in the existing ClioTalk
// window: a mode switch on the same chat file, the folder and engine line, a
// plan checklist from todo_write, a work log of real tool calls only, the
// engine's own text, and a bottom strip that counts what waits in the shadow.
// 「放回」 opens the put-back dialog; a delete is confirmed one file at a time;
// a conflict is shown and never overwritten silently.
//
// Lazy: loaded by ensureClioTalkAgentModule (the mode button, Chooser). The
// pure view-model functions are exposed on `.model` so the contract can drive
// them without a DOM. Every request goes through the "agent.harness" service
// provider (app/core/service-providers.js).

window.AISystem6ClioTalkAgent = (() => {
  "use strict";

  const LEVELS = ["read", "propose", "change"];
  const ENGINES = ["deepseek", "anthropic", "lmstudio"];
  const OFFICE_FILE = /\.(?:docx|xlsx|pptx)$/i;
  const MODE_KEY = "ai-system6-cliotalk-mode";
  // What the engine host runs when ClioTalk names no model (engine-host.js).
  const DEFAULT_MODELS = { deepseek: "deepseek-v4-flash", anthropic: "claude-sonnet-5-5" };
  const LOG_VERBS = {
    read: "agent_log_read",
    write: "agent_log_write",
    edit: "agent_log_edit",
    str_replace_editor: "agent_log_edit",
    glob: "agent_log_glob",
    grep: "agent_log_grep",
    ls: "agent_log_list",
    web_search: "agent_log_web_search",
    web_fetch: "agent_log_web_fetch",
  };

  // ---- Pure view model --------------------------------------------------

  function emptyRunView(runId = "") {
    return { runId, state: "starting", plan: [], log: [], texts: [], changes: null, usage: null, error: null, stopReason: "" };
  }

  /** The one path a tool call is about, for the work log. */
  function toolSubject(rawInput) {
    if (!rawInput || typeof rawInput !== "object") return "";
    for (const key of ["file_path", "path", "pattern", "url", "query", "directory"]) {
      if (typeof rawInput[key] === "string" && rawInput[key]) return rawInput[key];
    }
    return "";
  }

  /** The verb the work log shows: a translation key, or the raw tool name. */
  function toolVerb(title) {
    const name = String(title || "");
    if (name.startsWith("mcp__")) return { key: "agent_log_clioworks", arg: name.split("__").pop() };
    return LOG_VERBS[name] ? { key: LOG_VERBS[name], arg: "" } : { key: "", arg: name };
  }

  /**
   * Fold one server event into the run view. Thoughts are not drawn: the log
   * holds real tool calls only, and todo_write is the plan, not a log line.
   */
  function reduceEvent(view, event) {
    const next = { ...view, plan: view.plan, log: view.log, texts: view.texts };
    const data = event || {};
    switch (data.type) {
      case "status":
        next.state = String(data.state || next.state);
        break;
      case "plan":
        next.plan = (data.entries || []).map((entry) => ({ content: String(entry.content || ""), status: String(entry.status || "pending") }));
        break;
      case "tool_call":
        if (data.title === "todo_write") break;
        next.log = [...view.log.filter((line) => line.id !== data.id), {
          id: String(data.id || ""),
          title: String(data.title || ""),
          subject: toolSubject(data.rawInput),
          status: String(data.status || "in_progress"),
          output: "",
        }];
        break;
      case "tool_update":
        next.log = view.log.map((line) => (line.id === data.id
          ? { ...line, status: String(data.status || line.status), output: data.status === "failed" ? String(data.output || "").split("\n")[0].slice(0, 200) : line.output }
          : line));
        break;
      case "assistant_text":
        next.texts = [...view.texts, String(data.text || "")];
        break;
      case "changes":
        next.changes = { count: Number(data.count) || 0, added: Number(data.added) || 0, modified: Number(data.modified) || 0, deleted: Number(data.deleted) || 0 };
        break;
      // The engine's proposals, harvested when the run settles. This only
      // counts them; the payloads are fetched where they are shown, and a
      // payload is rendered as data, never obeyed.
      case "proposal":
        next.proposals = {
          pending: (view.proposals?.pending || 0) + (data.dropped ? 0 : 1),
          dropped: (view.proposals?.dropped || 0) + (Number(data.dropped) || 0),
        };
        break;
      case "usage":
        next.usage = { used: Number(data.used) || 0, size: Number(data.size) || 0 };
        break;
      case "done":
        next.stopReason = String(data.stopReason || "");
        break;
      // Cloud runs only: what the run has spent, and a cap that refused a
      // web call without ending the run. A notice keeps its code, so the line
      // can be translated where it is drawn.
      case "spend":
        next.spend = { tokens: Number(data.tokens) || 0, modelCalls: Number(data.modelCalls) || 0, webCalls: Number(data.webCalls) || 0 };
        break;
      case "notice":
        next.notices = [...(view.notices || []), { code: String(data.code || ""), message: String(data.message || data.code || "") }];
        break;
      case "error":
        next.error = { code: String(data.code || ""), message: String(data.message || "") };
        break;
      default:
        break;
    }
    return next;
  }

  /** The step the plan is on: the first in progress, else the first pending. */
  function currentStepIndex(plan = []) {
    const running = plan.findIndex((entry) => entry.status === "in_progress");
    if (running >= 0) return running;
    return plan.findIndex((entry) => entry.status === "pending");
  }

  /**
   * What assistant-activity should say for an event, in the run-transition
   * vocabulary it already maps (preparing/retrieving/generating/
   * awaitingCommit/committed/aborted/failed). Null when nothing changes.
   */
  function activityTransition(event, view) {
    const data = event || {};
    if (data.type === "status") {
      if (data.state === "starting") return "preparing";
      if (data.state === "running") return "generating";
      if (data.state === "stopped") return "aborted";
      if (data.state === "error") return "failed";
      if (data.state === "done") return (view?.changes?.count || 0) > 0 ? "awaitingCommit" : "committed";
      return null;
    }
    if (data.type === "tool_call") {
      return ["read", "glob", "grep", "ls", "web_search", "web_fetch"].includes(data.title) ? "retrieving" : "generating";
    }
    if (data.type === "assistant_text") return "generating";
    return null;
  }

  /** +N −M from a unified diff. */
  function diffStats(diff = "") {
    let added = 0;
    let removed = 0;
    for (const line of String(diff).split("\n")) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) added += 1;
      else if (line.startsWith("-")) removed += 1;
    }
    return { added, removed };
  }

  /** The badge a change row carries in the put-back list. */
  function changeBadge(change = {}) {
    if (change.kind === "deleted") return { kind: "trash", key: "agent_badge_trash" };
    if (change.kind === "added") return { kind: "new", key: "agent_badge_new" };
    if (change.binary || !change.diff) return { kind: "size", text: formatBytes(change.sizeAfter) };
    const { added, removed } = diffStats(change.diff);
    return { kind: "lines", text: `+${added} −${removed}` };
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  /**
   * Characters that can make a file name read as something else: bidi
   * embeddings, overrides and isolates (U+202A–U+202E, U+2066–U+2069), the
   * LRM/RLM marks (U+200E/F) and C0/C1 controls. The engine names the files;
   * the writer must see what will land, so such a name is shown stripped and
   * is never put back.
   */
  const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

  function unsafeName(path) {
    UNSAFE_NAME_CHARS.lastIndex = 0;
    return UNSAFE_NAME_CHARS.test(String(path || ""));
  }

  /** A file name as the put-back list shows it. */
  function displayName(path) {
    return String(path || "").replace(UNSAFE_NAME_CHARS, "");
  }

  /**
   * Split a put-back into what goes in one request and the deletes that each
   * need their own confirmation. "all" never includes a delete without one,
   * and no request ever carries a name with bidi or control characters.
   */
  function putBackRequest(changes = [], selected = [], mode = "selected") {
    const pool = (mode === "all" ? changes : changes.filter((change) => selected.includes(change.path)))
      .filter((change) => !unsafeName(change.path));
    return {
      paths: pool.filter((change) => change.kind !== "deleted").map((change) => change.path),
      deletes: pool.filter((change) => change.kind === "deleted").map((change) => change.path),
    };
  }

  /**
   * Run a put-back: ask once per delete, then send one request. Returns the
   * server's answer plus the deletes the writer declined.
   */
  async function runPutBack({ post, runId, changes, selected = [], mode = "selected", confirmDelete }) {
    const plan = putBackRequest(changes, selected, mode);
    const confirmed = [];
    const declined = [];
    for (const path of plan.deletes) {
      // eslint-disable-next-line no-await-in-loop
      if (await confirmDelete(path)) confirmed.push(path);
      else declined.push(path);
    }
    if (!plan.paths.length && !confirmed.length) return { applied: [], conflicts: [], pendingDeletes: declined, skipped: [], declined, sent: false };
    const result = await post(`/api/agent/runs/${encodeURIComponent(runId)}/putback`, {
      paths: [...plan.paths, ...confirmed],
      confirmDeletes: confirmed,
    });
    return { ...result, declined, sent: true };
  }

  /** Chooser radios for a grant: only levels at or below it are enabled. */
  function levelChoices(granted) {
    const top = LEVELS.indexOf(granted);
    return LEVELS.map((level, index) => ({ level, enabled: top >= 0 && index <= top, checked: level === granted }));
  }

  // ---- Engine proposals (放回窗口「提议」标签) ---------------------------------
  //
  // A proposal is a candidate the engine wrote into a write-only directory in
  // the shadow (docs/AGENT-HARNESS.md → Proposals). Everything here treats
  // payload values as data to show and to file through an existing entry —
  // never as instructions.

  /** The label a proposal row carries, by kind. */
  function proposalBadge(proposal = {}) {
    return proposal.kind === "scrap" ? { key: "agent_proposal_kind_scrap" }
      : proposal.kind === "review" ? { key: "agent_proposal_kind_review" }
      : proposal.kind === "restore" ? { key: "agent_proposal_kind_restore" }
      : { key: "agent_proposal_kind_other" };
  }

  /**
   * A scrap proposal's body: the passage verbatim, then where it came from —
   * the same shape ClioTalk's own clips use, so Scrapbook stacks it with
   * sources. Nothing is summarised.
   */
  function scrapBody(proposal = {}) {
    const payload = proposal.payload || {};
    const lines = [`> ${String(payload.quoted || "")}`.trimEnd(), "", `Source: ${String(payload.source || "")}`];
    if (payload.note) lines.push(`Note: ${String(payload.note)}`);
    return lines.join("\n");
  }

  /**
   * A review proposal as a review comment, in review-comments.js's own model.
   * The author is the engine's name (a reviewer, never the writer), and the
   * comment is attached only when its anchor quote is really in the
   * manuscript: a quote that matches nothing is not attached at all — the
   * writer locates it, rather than the desk guessing.
   * @param {any} proposal
   * @param {{ manuscript: string | null, engineName: string }} context
   * @returns {{ ok: true, text: string, author: { role: "reviewer", name: string }, anchor: { quote: string, prefix: string, suffix: string, offset: number } } | { ok: false, reason: "no_manuscript" | "anchor_not_found" | "incomplete" }}
   */
  function reviewCommentFromProposal(proposal, context) {
    const payload = proposal?.payload || {};
    const quote = String(payload.quote || "");
    const comment = String(payload.comment || "");
    const name = String(context?.engineName || "").trim();
    if (!quote.trim() || !comment.trim() || !name) return { ok: false, reason: "incomplete" };
    const manuscript = context?.manuscript;
    if (manuscript === null || manuscript === undefined) return { ok: false, reason: "no_manuscript" };
    if (!manuscript.includes(quote)) return { ok: false, reason: "anchor_not_found" };
    return {
      ok: true,
      text: comment,
      author: { role: "reviewer", name },
      anchor: { quote, prefix: "", suffix: "", offset: 0 },
    };
  }

  /**
   * Hand one accepted proposal to the entry its kind already has: a scrap to
   * Scrapbook, a review note to the review-comments model, a restore to the
   * staged files that then wait in the files tab for the ordinary per-file
   * put-back confirmation. No kind writes anywhere else.
   * @param {any} proposal
   * @param {{ engineName?: string, manuscript?: string | null | (() => string | null),
   *           saveScrap?: (title: string, body: string) => void,
   *           attachReview?: (made: any) => boolean,
   *           stageRestore?: (proposal: any) => Promise<{ staged: string[] }> | { staged: string[] } }} handlers
   */
  async function dispatchProposal(proposal, handlers = {}) {
    const kind = String(proposal?.kind || "");
    if (kind === "scrap" && handlers.saveScrap) {
      handlers.saveScrap(String(proposal.title || ""), scrapBody(proposal));
      return { done: "scrap" };
    }
    if (kind === "review") {
      const manuscript = typeof handlers.manuscript === "function" ? handlers.manuscript() : handlers.manuscript;
      const made = reviewCommentFromProposal(proposal, { manuscript, engineName: handlers.engineName || "" });
      if (!made.ok) return made;
      if (handlers.attachReview) {
        // The entry's own word: a refused attach leaves the proposal pending.
        const attached = handlers.attachReview(made);
        if (attached === false) return { done: "" };
      }
      return { done: "review" };
    }
    if (kind === "restore" && handlers.stageRestore) {
      const staged = await handlers.stageRestore(proposal);
      return { done: "restore", staged: (staged && staged.staged) || [] };
    }
    return { done: "" };
  }

  /**
   * The engine ClioTalk would use from the existing provider settings: the
   * active cloud provider when it is DeepSeek or Anthropic, else LM Studio
   * with the local model.
   */
  function engineChoice({ cloudActive = false, cloudProvider = "", cloudModel = "", localModel = "" } = {}) {
    if (cloudActive && (cloudProvider === "deepseek" || cloudProvider === "anthropic")) {
      return { engine: cloudProvider, model: cloudModel && cloudModel !== "default" ? cloudModel : "" };
    }
    if (localModel) return { engine: "lmstudio", model: localModel };
    return { engine: "deepseek", model: "" };
  }

  /** Under Anthropic, web search runs on the writer's DeepSeek key; say so. */
  function engineNoteKey(engine, keys = {}) {
    if (engine === "anthropic" && keys.deepseek) return "agent_web_search_via_deepseek";
    if (engine === "anthropic" && !keys.deepseek) return "agent_web_search_off";
    return "";
  }

  // ---- The web engine (cloud sandbox) ---------------------------------------
  //
  // One UI, two engines. On this Mac the engine host works in a shared folder;
  // on the public web each run gets a disposable container and only the
  // Project Hard Disk files the writer ticks travel (docs/AGENT-HARNESS.md,
  // "Cloud sandbox (web)").

  /** Which engine 代理 drives: "harness" (this Mac), "cloud" (web) or "" (none). */
  function engineKind(features) {
    if (!features || typeof features !== "object") return "harness";
    if (features.agent_harness) return "harness";
    if (features.agent_cloud) return "cloud";
    return features.agent_harness === false ? "" : "harness";
  }

  /** A cloud stream event ({ type, seq, data }) in the shape reduceEvent reads. */
  function cloudEvent(event = {}) {
    return { ...(event.data || {}), type: String(event.type || "") };
  }

  /** Whose allowance a cloud run spends: the writer's own key wins. */
  function cloudAllowance({ credentialMode = "", shared = false } = {}) {
    if (credentialMode === "byok") return "byok";
    return shared ? "shared" : "";
  }

  /** The agent's own shared allowance (not the chat one), or null when unreported. */
  function cloudSharedLine(status) {
    const shared = status?.shared_allowance;
    if (!shared) return null;
    const runsLeft = Math.max(0, Number(shared.runs_left) || 0);
    return { runsLeft, runsPerDay: Number(shared.runs_per_day) || 0, closed: shared.site_open === false || runsLeft === 0 };
  }

  /** The upload caps the server reported for an allowance, or null. */
  function cloudCaps(status, allowance) {
    const caps = status?.caps?.[allowance];
    if (!caps) return null;
    return { maxFiles: Number(caps.max_upload_files) || 0, maxBytes: Number(caps.max_upload_bytes) || 0 };
  }

  /** Project Hard Disk files of one project that can travel: text and Office. */
  function pickableFiles(files = [], projectId = "") {
    const encoder = new TextEncoder();
    return files
      .filter((item) => item && item.projectId === projectId
        && (item.type === "text" || (item.type === "office" && /^(?:docx|xlsx|pptx)$/.test(String(item.format || "")))))
      .map((item) => ({
        id: String(item.id),
        name: String(item.name || ""),
        format: item.type === "office" ? String(item.format) : "",
        size: item.type === "text" ? encoder.encode(String(item.body || "")).length : Number(item.byteLength) || 0,
      }));
  }

  /** What the ticked files add up to, against the caps (null caps: unknown). */
  function uploadSummary(pickable = [], ticked = [], caps = null) {
    const wanted = new Set(ticked);
    const chosen = pickable.filter((file) => wanted.has(file.id));
    const bytes = chosen.reduce((sum, file) => sum + file.size, 0);
    const over = Boolean(caps && (chosen.length > caps.maxFiles || bytes > caps.maxBytes));
    return { count: chosen.length, bytes, maxFiles: caps?.maxFiles || 0, maxBytes: caps?.maxBytes || 0, over };
  }

  /**
   * The cloud half of a put-back, behind the same request runPutBack sends.
   * Edits go through applyCloudChanges (which checks each against the
   * uploaded hash). Deletes come back from it unapplied; only the ones the
   * writer confirmed go to the Trash, after the same hash check, and a
   * conflict waits for 「仍然覆盖」.
   */
  async function cloudPutBack({ apply, changes = [], body = {}, entries = {}, projectId = "", runId = "", currentSha, trash }) {
    const overwrite = (body.overwriteConflicts || []).map(String);
    const result = await apply(changes, { runId, entries, projectId, paths: body.paths || [], overwriteConflicts: overwrite });
    const confirmed = new Set([...(body.confirmDeletes || []), ...overwrite]);
    const applied = [...(result.applied || [])];
    const conflicts = [...(result.conflicts || [])];
    const pendingDeletes = [];
    for (const path of result.pendingDeletes || []) {
      if (!confirmed.has(path)) {
        pendingDeletes.push(path);
        continue;
      }
      const entry = entries[path];
      if (!entry) {
        conflicts.push({ path, reason: "not-uploaded" });
        continue;
      }
      const change = changes.find((candidate) => candidate.path === path) || {};
      // eslint-disable-next-line no-await-in-loop
      const current = await currentSha(entry.fileId);
      if (current && current !== (change.baseSha256 || entry.sha256) && !overwrite.includes(path)) {
        conflicts.push({ path, reason: "changed-since-upload" });
        continue;
      }
      // A file already gone from the desk needs no Trash.
      // eslint-disable-next-line no-await-in-loop
      if (current) await trash(entry.fileId);
      applied.push({ path, kind: "deleted", fileId: entry.fileId });
    }
    return { ...result, applied, conflicts, pendingDeletes };
  }

  /** Incremental Server-Sent Events parser. */
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
      try {
        events.push({ type, ...JSON.parse(data.join("\n")) });
      } catch {}
    }
    return { events, rest };
  }

  // ---- Service --------------------------------------------------------------

  async function request(path, init = {}) {
    return window.AISystem6Capabilities.requestService("agent.harness", { path, init });
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

  /**
   * A server refusal or run error as the writer reads it: the code's own line
   * from the translation tables (agent_error_<code>) when one exists, else
   * the server's English text — a code the tables have not met yet never
   * shows up naked.
   */
  function agentErrorText(error) {
    const code = String(error?.code || "");
    if (code) {
      const key = `agent_error_${code}`;
      const line = t(key);
      if (line && line !== key) return line;
    }
    return String(error?.message || code || "");
  }

  // ---- State ----------------------------------------------------------------

  const state = {
    active: false,
    folders: [],
    engines: {},
    engineInstalled: true,
    folderId: "",
    engine: "",
    model: "",
    runs: [],
    run: null,
    view: null,
    card: null,
    receiptId: "",
    controller: null,
    // "harness" | "cloud" | "": which engine this desk serves.
    kind: "",
    // Cloud only: /api/agent-cloud/status, the ticked file ids, and per run
    // the upload's entries (for applying) and the paths already put back.
    cloudStatus: null,
    fileIds: new Set(),
    cloudRuns: new Map(),
  };

  function cloudApi() {
    return window.AISystem6AgentCloud;
  }

  function liveProjectId() {
    return typeof activeProjectId !== "undefined" ? String(activeProjectId || "") : "";
  }

  function liveFiles() {
    return typeof chatFiles !== "undefined" && Array.isArray(chatFiles) ? chatFiles : [];
  }

  function currentAllowance() {
    const mode = typeof cloudCredentialMode === "function" ? cloudCredentialMode() : "";
    return cloudAllowance({ credentialMode: mode, shared: Boolean(state.cloudStatus?.shared) });
  }

  function currentPickable() {
    const pickable = pickableFiles(liveFiles(), liveProjectId());
    const present = new Set(pickable.map((file) => file.id));
    for (const id of [...state.fileIds]) if (!present.has(id)) state.fileIds.delete(id);
    return pickable;
  }

  async function refreshCloud() {
    try {
      if (typeof ensureAgentCloudModule === "function") await ensureAgentCloudModule();
      const status = await cloudApi().available();
      state.cloudStatus = status;
      const models = status.models || [];
      if (!models.includes(state.model)) {
        const preferred = typeof cloudConfig !== "undefined" ? String(cloudConfig?.model || "") : "";
        state.model = models.includes(preferred) ? preferred : (models[0] || "");
      }
      if (status.available) return true;
      setStatus(t("agent_cloud_unavailable", agentErrorText({ code: status.reason || "", message: status.reason || "" })));
    } catch {
      setStatus(t("agent_unavailable"));
    }
    return false;
  }

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function assistantWindow() {
    return document.querySelector('[data-window="assistant"]');
  }

  function readStoredMode() {
    try { return localStorage.getItem(MODE_KEY) === "agent"; } catch { return false; }
  }

  function storeMode(active) {
    try { localStorage.setItem(MODE_KEY, active ? "agent" : "chat"); } catch {}
  }

  async function refreshFolders() {
    try {
      const payload = await api("/api/agent/folders");
      state.folders = payload.folders || [];
      state.engines = payload.engines || {};
      state.engineInstalled = payload.engine?.installed !== false;
      if (!state.folders.some((folder) => folder.id === state.folderId)) {
        state.folderId = (state.folders.find((folder) => folder.available) || {}).id || "";
      }
      return true;
    } catch (error) {
      state.folders = [];
      if (typeof setStatus === "function") setStatus(t("agent_unavailable"));
      return false;
    }
  }

  async function refreshRuns() {
    if (state.kind === "cloud") {
      // Cloud runs live in this tab: the server keeps no put-back state.
      // The run's count from the stream stands until the put-back window has
      // fetched the proposals; from then on the records (with this tab's
      // decisions) are the truth.
      state.runs = [...state.cloudRuns.entries()]
        .map(([runId, record]) => {
          const decided = record.proposals?.length
            ? record.proposals.filter((entry) => (record.decisions?.get(String(entry.id)) || entry.status || "pending") === "pending").length
            : Number(record.pendingProposals) || 0;
          return { runId, pendingChanges: record.pending, pendingProposals: decided };
        })
        .filter((run) => run.pendingChanges > 0 || run.pendingProposals > 0)
        .reverse();
      return;
    }
    try {
      state.runs = (await api("/api/agent/runs")).runs || [];
    } catch {
      state.runs = [];
    }
  }

  // ---- A reload on the web: the page's own memory of its runs ---------------

  /**
   * Rebuild state.cloudRuns from what the page remembered (sessionStorage,
   * cliotalk-agent-cloud.js). Returns the records whose run had not ended —
   * at most one can exist (one working run per session on the server).
   */
  function seedCloudRuns(cloudRuns, records) {
    const open = [];
    for (const record of Array.isArray(records) ? records : []) {
      if (!record || !record.runId || cloudRuns.has(record.runId)) continue;
      cloudRuns.set(record.runId, {
        entries: record.entries || {},
        projectId: String(record.projectId || ""),
        pending: Number(record.pending) || 0,
        applied: new Set(record.applied || []),
        proposals: [],
        decisions: new Map(record.decisions || []),
      });
      if (!record.ended) open.push(record);
    }
    return open;
  }

  /** Fold this tab's run record back into the page's memory. */
  function syncCloudRunRecord(runId) {
    const record = state.cloudRuns.get(runId);
    if (!record || typeof cloudApi().noteRunState !== "function") return;
    cloudApi().noteRunState(runId, {
      pending: record.pending || 0,
      applied: [...record.applied],
      decisions: [...record.decisions],
      ended: true,
    });
  }

  function conversationHasAgentRun(runId) {
    return typeof conversation !== "undefined" && Array.isArray(conversation)
      && conversation.some((entry) => entry && entry.agentRunId === runId && entry.role === "assistant");
  }

  /**
   * A run that was still working when the page reloaded: the card is rebuilt
   * by replaying the server's event log from the first event, and the stream
   * stays open until the run's own terminal status.
   */
  async function rejoinCloudRun(record) {
    const run = { runId: record.runId, fileIds: record.fileIds || [], model: record.model || "", projectId: record.projectId || "", folderName: "" };
    const card = el("article", "message assistant clio-agent-run");
    card.setAttribute("aria-label", t("agent_run_label"));
    card.append(el("div", "speaker", typeof clioTalkAssistantDisplayName === "function" ? clioTalkAssistantDisplayName() : ""), el("div", "message-content"));
    if (typeof messagesEl !== "undefined" && messagesEl) messagesEl.append(card);
    state.card = card;
    state.run = run;
    state.view = emptyRunView(run.runId);
    renderCard();
    renderStrip();
    try {
      await cloudApi().events(run.runId, (event) => onRunEvent(cloudEvent(event)));
    } catch (error) {
      // The janitor removes the workspace 20 minutes after a run ends; a run
      // that is no longer known says so, drops off the strip and leaves the
      // page's memory. Anything else keeps the record with the error drawn
      // on the card.
      if (error?.code === "run_unknown") {
        state.cloudRuns.delete(run.runId);
        cloudApi().forgetRun?.(run.runId);
        state.run = null;
        state.view = null;
      } else {
        state.view = { ...(state.view || emptyRunView(run.runId)), state: "error", error: { code: error?.code || "", message: error?.message || String(error) } };
        renderCard();
      }
    }
    if (state.view) {
      const live = state.cloudRuns.get(run.runId);
      if (live) {
        live.pending = state.view.changes?.count || 0;
        live.pendingProposals = state.view.proposals?.pending || 0;
      }
      // The reload may have come before the assistant record was written.
      if (!conversationHasAgentRun(run.runId)) persistAssistantRecord(state.view, run.runId);
    }
    // A send that started once the terminal status landed owns the run slot
    // now; only put it back if this rejoin still holds it.
    if (!state.run || state.run.runId === run.runId) {
      state.run = null;
      state.card = null;
    }
    syncCloudRunRecord(run.runId);
    await refreshRuns();
    renderStrip();
    syncWindowMode();
  }

  /**
   * What a reload lost, restored from the page's own memory: the ticked files
   * come back to the picker, a finished run's pending changes and put-back
   * return to the strip, and a run that was still working rejoins its stream.
   * The server's posture is unchanged — the record lives in this page.
   */
  async function restoreCloudRuns() {
    const cloud = cloudApi();
    if (typeof cloud.savedRuns !== "function") {
      await refreshRuns();
      return;
    }
    for (const id of cloud.pickedFiles?.() || []) state.fileIds.add(id);
    currentPickable();
    const saved = cloud.savedRuns();
    const open = seedCloudRuns(state.cloudRuns, saved);
    // A rejoin whose stream dropped without a terminal status left the record
    // open with nothing following it: offer the stream again. At most one run
    // can be working per session on the server.
    for (const record of saved) {
      if (record.ended || open.some((entry) => entry.runId === record.runId)) continue;
      if (!state.run || state.run.runId !== record.runId) open.push(record);
    }
    await refreshRuns();
    renderStrip();
    for (const record of open) await rejoinCloudRun(record);
  }

  function defaultEngine() {
    const config = typeof cloudConfig !== "undefined" ? cloudConfig : null;
    return engineChoice({
      cloudActive: Boolean(config?.active),
      cloudProvider: String(config?.provider || ""),
      cloudModel: String(config?.model || ""),
      localModel: String(typeof modelInput !== "undefined" && modelInput ? modelInput.value || "" : ""),
    });
  }

  // ---- The mode bar and the bottom strip ------------------------------------

  function modeButton() {
    return document.getElementById("clio-agent-mode");
  }

  function ensureBar() {
    const win = assistantWindow();
    if (!win) return null;
    let bar = win.querySelector(".clio-agent-bar");
    if (bar) return bar;
    bar = el("div", "clio-agent-bar");
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", t("agent_mode_bar"));
    win.querySelector(".messages-stage")?.before(bar);
    return bar;
  }

  function ensureStrip() {
    const win = assistantWindow();
    if (!win) return null;
    let strip = win.querySelector(".clio-agent-strip");
    if (strip) return strip;
    strip = el("div", "clio-agent-strip");
    strip.setAttribute("aria-live", "polite");
    win.querySelector("#chat-form")?.before(strip);
    return strip;
  }

  function renderBar() {
    const bar = ensureBar();
    if (!bar) return;
    bar.replaceChildren();
    const modes = el("div", "clio-agent-modes");
    modes.setAttribute("role", "radiogroup");
    modes.setAttribute("aria-label", t("agent_mode_switch"));
    for (const [mode, key] of [["chat", "agent_mode_chat"], ["agent", "agent_mode_agent"]]) {
      const button = el("button", "btn mini-btn clio-agent-mode-choice", t(key));
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String((mode === "agent") === state.active));
      button.addEventListener("click", () => setMode(mode === "agent"));
      modes.append(button);
    }
    bar.append(modes);
    if (state.kind === "cloud") {
      renderCloudFields(bar);
      return;
    }

    const folderLabel = el("label", "clio-agent-field");
    folderLabel.append(el("span", "", t("agent_folder_label")));
    const usable = state.folders.filter((folder) => folder.available);
    if (usable.length) {
      const wrap = el("div", "select-wrap");
      const select = el("select");
      select.setAttribute("aria-label", t("agent_folder_label"));
      for (const folder of usable) {
        const option = el("option", "", `${folder.name} · ${t(`guest_privilege_${folder.level}`)}`);
        option.value = folder.id;
        option.selected = folder.id === state.folderId;
        select.append(option);
      }
      select.addEventListener("change", () => { state.folderId = select.value; });
      wrap.append(select);
      folderLabel.append(wrap);
    } else {
      const share = el("button", "btn mini-btn", t("agent_share_folder"));
      share.type = "button";
      share.addEventListener("click", () => openWindow("chooser"));
      folderLabel.append(share);
    }
    bar.append(folderLabel);

    const engineLabel = el("label", "clio-agent-field");
    engineLabel.append(el("span", "", t("agent_engine_label")));
    const engineWrap = el("div", "select-wrap");
    const engineSelect = el("select");
    engineSelect.setAttribute("aria-label", t("agent_engine_label"));
    for (const engine of ENGINES) {
      const option = el("option", "", t(`agent_engine_${engine}`));
      option.value = engine;
      option.selected = engine === state.engine;
      option.disabled = engine !== "lmstudio" && state.engines[engine] === false;
      engineSelect.append(option);
    }
    engineSelect.addEventListener("change", () => {
      state.engine = engineSelect.value;
      state.model = state.engine === defaultEngine().engine ? defaultEngine().model : "";
      renderBar();
    });
    engineWrap.append(engineSelect);
    engineLabel.append(engineWrap);
    bar.append(engineLabel);
    const modelLine = el("span", "clio-agent-model", state.model || DEFAULT_MODELS[state.engine] || t("agent_model_default"));
    bar.append(modelLine);
    const noteKey = engineNoteKey(state.engine, state.engines);
    if (noteKey) bar.append(el("span", "clio-agent-note", t(noteKey)));
    if (!state.engineInstalled) bar.append(el("span", "clio-agent-note", t("agent_engine_missing")));
  }

  /** The web bar: ticked files against the caps, allowance, model. */
  function renderCloudFields(bar) {
    const allowance = currentAllowance();
    const summary = uploadSummary(currentPickable(), [...state.fileIds], cloudCaps(state.cloudStatus, allowance));
    const filesLabel = el("label", "clio-agent-field");
    filesLabel.append(el("span", "", t("agent_cloud_files_label")));
    const pick = el("button", "btn mini-btn", summary.count ? t("agent_cloud_files_count", summary.count, formatBytes(summary.bytes)) : t("agent_cloud_pick_files"));
    pick.type = "button";
    pick.addEventListener("click", () => openFilePicker());
    filesLabel.append(pick);
    bar.append(filesLabel);
    if (summary.over) bar.append(el("span", "clio-agent-note", t("agent_cloud_upload_over")));

    bar.append(el("span", "clio-agent-model", allowance ? t(`agent_cloud_allowance_${allowance}`) : ""));
    if (!allowance) bar.append(el("span", "clio-agent-note", t("agent_cloud_allowance_none")));
    const left = allowance === "shared" ? cloudSharedLine(state.cloudStatus) : null;
    if (left) bar.append(el("span", "clio-agent-note", left.closed ? t("agent_cloud_shared_closed") : t("agent_cloud_shared_runs_left", left.runsLeft, left.runsPerDay)));

    const models = state.cloudStatus?.models || [];
    if (models.length) {
      const modelLabel = el("label", "clio-agent-field");
      modelLabel.append(el("span", "", t("agent_engine_label")));
      const wrap = el("div", "select-wrap");
      const select = el("select");
      select.setAttribute("aria-label", t("agent_engine_label"));
      for (const model of models) {
        const option = el("option", "", model);
        option.value = model;
        option.selected = model === state.model;
        select.append(option);
      }
      select.addEventListener("change", () => { state.model = select.value; });
      wrap.append(select);
      modelLabel.append(wrap);
      bar.append(modelLabel);
    }
  }

  function latestPendingRun() {
    if (state.run && state.view && ["starting", "running", "stopping"].includes(state.view.state)) return null;
    return state.runs.find((run) => run.pendingChanges > 0 || Number(run.pendingProposals) > 0) || null;
  }

  function renderStrip() {
    const strip = ensureStrip();
    if (!strip) return;
    strip.replaceChildren();
    const running = state.view && ["starting", "running", "stopping"].includes(state.view.state);
    const liveCount = state.view?.changes?.count || 0;
    const pending = running ? null : latestPendingRun();
    const count = running ? liveCount : (pending?.pendingChanges || 0);
    const proposals = running ? (state.view?.proposals?.pending || 0) : Number(pending?.pendingProposals) || 0;
    const runId = running ? state.run?.runId : pending?.runId;
    strip.append(el("span", "clio-agent-shadow-count", t("agent_shadow_count", count)));
    if (proposals > 0) strip.append(el("span", "clio-agent-shadow-count", t("agent_proposals_count", proposals)));
    if (runId && (count > 0 || proposals > 0)) {
      const open = el("button", "btn mini-btn clio-agent-putback-link", t("agent_review_putback"));
      open.type = "button";
      open.disabled = Boolean(running);
      open.addEventListener("click", () => openPutBack(runId));
      strip.append(open);
    }
    if (running) strip.append(el("span", "clio-agent-stop-hint", t("agent_stop_hint")));
  }

  function syncWindowMode() {
    const win = assistantWindow();
    win?.classList.toggle("is-agent-mode", state.active);
    const button = modeButton();
    if (button) {
      button.setAttribute("aria-pressed", String(state.active));
      button.hidden = state.active;
    }
    const bar = win?.querySelector(".clio-agent-bar");
    const strip = win?.querySelector(".clio-agent-strip");
    if (bar) bar.hidden = !state.active;
    if (strip) strip.hidden = !state.active;
    if (typeof syncPromptPlaceholder === "function") syncPromptPlaceholder();
    if (typeof syncClioTalkSendButton === "function") syncClioTalkSendButton();
  }

  async function runSetMode(active) {
    state.active = Boolean(active);
    if (state.active) {
      // The Mac's engine host, else the web's cloud sandbox, else neither:
      // then 代理 says why in one line and the window stays in 对话.
      const capabilities = await window.AISystem6PublicAccess?.getCapabilities?.().catch(() => null);
      state.kind = engineKind(capabilities?.features);
      let served = false;
      if (state.kind === "cloud") served = await refreshCloud();
      else if (state.kind === "harness") [served] = await Promise.all([refreshFolders(), refreshRuns()]);
      else setStatus(t("agent_unavailable"));
      if (!served) state.active = false;
      else if (state.kind === "cloud") await restoreCloudRuns();
    }
    storeMode(state.active);
    if (state.active) {
      if (!state.engine && state.kind !== "cloud") Object.assign(state, defaultEngine());
      renderBar();
      renderStrip();
    }
    syncWindowMode();
  }

  // The latest mode change, always settling: a send that arrives while the
  // engine is still being chosen (restoredMode below) waits on this.
  let modeSettled = Promise.resolve();
  function setMode(active) {
    const running = runSetMode(active);
    modeSettled = running.catch(() => {});
    return running;
  }

  function toggle() {
    return setMode(!state.active);
  }

  // ---- A run in the conversation --------------------------------------------

  function renderCard() {
    const card = state.card;
    const view = state.view;
    if (!card || !view) return;
    const body = card.querySelector(".message-content");
    body.replaceChildren();
    if (view.plan.length) {
      const plan = el("div", "clio-agent-plan");
      const head = el("div", "clio-agent-plan-head");
      head.append(el("b", "", t("agent_plan")), el("span", "", `${view.plan.filter((entry) => entry.status === "completed").length} / ${view.plan.length}`));
      plan.append(head);
      const list = el("ul", "clio-agent-plan-list");
      const current = currentStepIndex(view.plan);
      view.plan.forEach((entry, index) => {
        const item = el("li", index === current ? "is-current" : "");
        const label = el("label");
        const box = el("input");
        box.type = "checkbox";
        box.disabled = true;
        box.checked = entry.status === "completed";
        label.append(box, el("span", "", entry.content));
        item.append(label);
        list.append(item);
      });
      plan.append(list);
      body.append(plan);
    }
    if (view.log.length) {
      const log = el("ol", "clio-agent-log");
      log.setAttribute("aria-label", t("agent_work_log"));
      for (const line of view.log) {
        const verb = toolVerb(line.title);
        const row = el("li", `clio-agent-log-line is-${line.status}`);
        row.append(
          el("span", "clio-agent-log-verb", verb.key ? t(verb.key, verb.arg) : verb.arg),
          el("span", "clio-agent-log-subject", line.subject),
        );
        if (line.status === "failed") row.append(el("span", "clio-agent-log-error", line.output || t("agent_log_failed")));
        log.append(row);
      }
      body.append(log);
    }
    for (const text of view.texts) {
      const block = el("div", "clio-agent-text");
      block.innerHTML = markdownToSystemHtml(text);
      body.append(block);
    }
    for (const notice of view.notices || []) body.append(el("p", "clio-agent-note", agentErrorText(notice)));
    if (view.proposals?.pending) body.append(el("p", "clio-agent-note", t("agent_proposals_count", view.proposals.pending)));
    if (view.proposals?.dropped) body.append(el("p", "clio-agent-note", t("agent_proposal_dropped", view.proposals.dropped)));
    if (view.error) body.append(el("p", "clio-agent-error", agentErrorText(view.error)));
    if (["starting", "running"].includes(view.state) && !view.log.length && !view.texts.length) {
      body.append(el("p", "clio-agent-waiting", t(view.state === "starting" ? "agent_state_starting" : "agent_state_running")));
    }
    if (typeof scrollMessagesToLatest === "function") scrollMessagesToLatest();
  }

  function reportActivity(transition) {
    if (!transition || !state.run) return;
    window.AISystem6AssistantActivity?.reportRunTransition?.(
      { id: state.run.runId, projectId: typeof activeProjectId !== "undefined" ? activeProjectId || "" : "" },
      transition,
      ["committed", "aborted", "failed", "awaitingCommit"].includes(transition) ? null : { cancel: () => stopRun() },
    );
  }

  async function startReceipt(run) {
    const receipts = window.AISystem6RunReceipts;
    if (!receipts?.createReceipt) return;
    try {
      const created = await receipts.createReceipt({
        runId: run.runId,
        sourceAppId: "clioTalk",
        intent: "agent-run",
        provider: run.engine,
        model: run.model,
        projectId: run.projectId || "",
        inputObjectIds: run.fileIds || [],
        sourceScope: run.fileIds ? { sourceIds: run.fileIds } : { kind: "shared-folder", label: run.folderName },
      });
      if (created.ok) state.receiptId = created.receiptId;
    } catch (error) {
      console.warn("ClioTalk agent receipt could not be created.", error);
    }
  }

  async function finishReceipt(view) {
    const receipts = window.AISystem6RunReceipts;
    if (!receipts || !state.receiptId) return;
    try {
      await receipts.updateReceipt(state.receiptId, {
        toolCalls: view.log.map((line) => ({ name: line.title, effect: line.subject, ok: line.status !== "failed", error: line.status === "failed" ? line.output : "" })),
        proposal: view.texts.join("\n\n").slice(0, 4000),
        checkpointState: (view.changes?.count || 0) > 0 ? "awaitingCommit" : "none",
      });
      const status = view.state === "done" ? "completed" : view.state === "stopped" ? "cancelled" : "failed";
      await receipts.finishReceipt(state.receiptId, {
        status,
        destination: state.run?.folderName || "",
        publicErrorReason: view.error?.message || "",
      });
    } catch (error) {
      console.warn("ClioTalk agent receipt could not be finished.", error);
    }
  }

  function persistAssistantRecord(view, runId) {
    if (typeof conversation === "undefined") return;
    const content = view.texts.join("\n\n").trim();
    if (!content) return;
    conversation.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      taskKind: "agent",
      agentRunId: runId,
      createdAt: new Date().toISOString(),
    });
    if (typeof persistClioTalkConversationMutation === "function") persistClioTalkConversationMutation();
  }

  async function streamRun(runId, signal) {
    const response = await request(`/api/agent/runs/${encodeURIComponent(runId)}/events`, { method: "GET", signal });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSse(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) onRunEvent(event);
    }
  }

  function onRunEvent(event) {
    state.view = reduceEvent(state.view, event);
    reportActivity(activityTransition(event, state.view));
    renderCard();
    renderStrip();
  }

  /**
   * Start a cloud run over the ticked files. The bundle is measured against
   * the caps first, so an upload the server would refuse never leaves.
   */
  async function startCloudRun(prompt) {
    const cloud = cloudApi();
    const projectId = liveProjectId();
    const allowance = currentAllowance();
    if (!allowance) throw Object.assign(new Error(t("agent_cloud_allowance_none")), { code: "agent_cloud_no_allowance" });
    const fileIds = [...state.fileIds];
    const bundle = await cloud.buildUploadBundle(fileIds, { projectId });
    const caps = cloudCaps(state.cloudStatus, allowance);
    if (caps && (bundle.files.length > caps.maxFiles || bundle.bytes > caps.maxBytes)) {
      throw Object.assign(new Error(t("agent_cloud_upload_over")), { code: "agent_cloud_upload_too_large" });
    }
    // The key is the one cloud-model.js already holds for this tab (BYOK); it
    // rides this request only and is never stored here.
    const key = allowance === "byok" && typeof cloudRuntimeApiKey === "string" ? cloudRuntimeApiKey : "";
    const run = await cloud.start({ fileIds, prompt, model: state.model, key, projectId });
    state.cloudRuns.set(run.runId, { entries: bundle.entries, projectId, pending: 0, applied: new Set(), proposals: [], decisions: new Map() });
    const project = typeof getActiveProject === "function" ? getActiveProject() : null;
    return { ...run, engine: "deepseek", model: run.model || state.model, folderName: project?.name || "", projectId, fileIds };
  }

  async function stopRun() {
    if (!state.run) return false;
    try {
      if (state.run.fileIds) {
        await cloudApi().stop(state.run.runId);
        return true;
      }
      await api(`/api/agent/runs/${encodeURIComponent(state.run.runId)}/stop`, {});
    } catch {}
    return true;
  }

  async function submit(text) {
    const prompt = String(text || "").trim();
    if (!prompt) return;
    if (state.run && state.view && ["starting", "running", "stopping"].includes(state.view.state)) return;
    if (state.kind === "cloud" && !state.fileIds.size) {
      setStatus(t("agent_cloud_needs_files"));
      openFilePicker();
      return;
    }
    if (state.kind !== "cloud" && !state.folderId) {
      setStatus(t("agent_needs_folder"));
      openWindow("chooser");
      return;
    }
    if (typeof getActiveProject === "function" && !getActiveProject()) {
      setStatus(t("clio_project_required_for_chat"));
      openWindow("projects");
      return;
    }
    const userRecord = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      taskKind: "agent",
      createdAt: new Date().toISOString(),
    };
    conversation.push(userRecord);
    if (typeof ensureCurrentConversationFile === "function" && !clioTalkTemporaryMode) ensureCurrentConversationFile();
    addMessage("user", prompt, { messageRecord: userRecord });
    promptInput.value = "";
    persistClioTalkConversationMutation();

    const controller = new AbortController();
    state.controller = controller;
    activeAbortController = controller;
    controller.signal.addEventListener("abort", () => { void stopRun(); }, { once: true });
    setComposerBusy(true);

    const card = el("article", "message assistant clio-agent-run");
    card.setAttribute("aria-label", t("agent_run_label"));
    card.append(el("div", "speaker", clioTalkAssistantDisplayName()), el("div", "message-content"));
    messagesEl.append(card);
    state.card = card;

    let run = null;
    try {
      if (state.kind === "cloud") {
        run = await startCloudRun(prompt);
      } else {
        run = await api("/api/agent/runs", { folderId: state.folderId, prompt, engine: state.engine, model: state.model });
      }
      state.run = run;
      userRecord.agentRunId = run.runId;
      state.view = emptyRunView(run.runId);
      renderCard();
      renderStrip();
      void startReceipt(run);
      // The stream ends at the terminal status; a stop closes it too.
      if (run.fileIds) await cloudApi().events(run.runId, (event) => onRunEvent(cloudEvent(event)));
      else await streamRun(run.runId, undefined);
    } catch (error) {
      state.view = { ...(state.view || emptyRunView()), state: "error", error: { code: error.code || "", message: error.message || String(error) } };
      reportActivity("failed");
      renderCard();
    } finally {
      if (activeAbortController === controller) activeAbortController = null;
      state.controller = null;
      setComposerBusy(false);
      if (run && state.view) {
        const record = state.cloudRuns.get(run.runId);
        if (record) {
          record.pending = state.view.changes?.count || 0;
          // The stream only counts the proposals; the payloads are fetched
          // when the put-back window opens (putBackEngine below).
          record.pendingProposals = state.view.proposals?.pending || 0;
        }
        if (run.fileIds) syncCloudRunRecord(run.runId);
        persistAssistantRecord(state.view, run.runId);
        await finishReceipt(state.view);
      }
      await refreshRuns();
      renderStrip();
      syncWindowMode();
    }
  }

  // ---- Chooser 「共享文件夹」 --------------------------------------------------

  function renderChooserFolders() {
    const chooser = document.querySelector('[data-window="chooser"]');
    const anchor = chooser?.querySelector(".chooser-guests-section");
    if (!chooser || !anchor) return;
    let section = chooser.querySelector(".chooser-folders-section");
    if (!section) {
      section = el("section", "control-section chooser-section chooser-folders-section");
      section.setAttribute("aria-labelledby", "chooser-folders-title");
      anchor.before(section);
    }
    const draw = () => {
      section.replaceChildren();
      const title = el("h3", "", t("agent_shared_folders"));
      title.id = "chooser-folders-title";
      section.append(title, el("p", "hint control-status", t("agent_shared_folders_note")));
      const list = el("ul", "chooser-folder-list");
      for (const folder of state.folders) {
        const item = el("li", `chooser-folder${folder.available ? "" : " is-unavailable"}`);
        const head = el("div", "chooser-folder-head");
        head.append(el("b", "", folder.name), el("small", "", folder.path));
        item.append(head);
        const levels = el("fieldset", "chooser-folder-levels");
        levels.append(el("legend", "visually-hidden", t("agent_folder_level")));
        for (const choice of levelChoices(folder.level)) {
          const label = el("label");
          const radio = el("input");
          radio.type = "radio";
          radio.name = `folder-level-${folder.id}`;
          radio.value = choice.level;
          radio.checked = choice.checked;
          radio.disabled = !choice.enabled;
          radio.addEventListener("change", async () => {
            try {
              await api("/api/agent/folders/level", { id: folder.id, level: choice.level });
            } catch (error) {
              setStatus(agentErrorText(error));
            }
            await refreshFolders();
            draw();
            if (state.active) renderBar();
          });
          label.append(radio, el("span", "", t(`guest_privilege_${choice.level}`)));
          levels.append(label);
        }
        item.append(levels);
        const eject = el("button", "btn mini-btn", t("agent_eject_folder"));
        eject.type = "button";
        eject.addEventListener("click", async () => {
          try {
            await api("/api/agent/folders", { id: folder.id }, "DELETE");
          } catch (error) {
            setStatus(agentErrorText(error));
          }
          await refreshFolders();
          draw();
          if (state.active) renderBar();
        });
        item.append(eject);
        list.append(item);
      }
      section.append(list);
      if (!state.folders.length) section.append(el("p", "hint control-status", t("agent_no_folders")));
      const row = el("div", "button-row");
      const levelWrap = el("div", "select-wrap");
      const levelSelect = el("select");
      levelSelect.setAttribute("aria-label", t("agent_folder_level"));
      for (const level of LEVELS) {
        const option = el("option", "", t(`guest_privilege_${level}`));
        option.value = level;
        option.selected = level === "propose";
        levelSelect.append(option);
      }
      levelWrap.append(levelSelect);
      const choose = el("button", "btn", t("agent_choose_folder"));
      choose.type = "button";
      choose.addEventListener("click", async () => {
        choose.disabled = true;
        try {
          const result = await api("/api/agent/folders/choose", { level: levelSelect.value });
          if (!result.cancelled && result.folder) state.folderId = result.folder.id;
        } catch (error) {
          setStatus(agentErrorText(error));
        } finally {
          choose.disabled = false;
        }
        await refreshFolders();
        draw();
        if (state.active) renderBar();
      });
      row.append(levelWrap, choose);
      section.append(row);
      if (!state.engineInstalled) section.append(el("p", "hint control-status", t("agent_engine_missing")));
      section.append(el("p", "hint control-status", t("agent_folders_desktop_note")));
    };
    draw();
    refreshFolders().then(draw).catch(() => {});
  }

  // ---- 放回 ------------------------------------------------------------------

  let putBackDialog = null;

  function ensurePutBackDialog() {
    if (putBackDialog) return putBackDialog;
    putBackDialog = el("dialog", "finder-operation-modal agent-putback-modal");
    putBackDialog.setAttribute("aria-labelledby", "agent-putback-title");
    document.body.append(putBackDialog);
    return putBackDialog;
  }

  function renderPreview(pane, change) {
    pane.replaceChildren();
    if (!change) return;
    pane.append(el("b", "", displayName(change.path)));
    if (unsafeName(change.path)) pane.append(el("p", "hint", t("agent_putback_unsafe_name")));
    if (OFFICE_FILE.test(change.path) || change.binary) {
      pane.append(
        el("p", "", t("agent_preview_size", formatBytes(change.sizeBefore), formatBytes(change.sizeAfter))),
        el("p", "hint", t("agent_preview_open_in_app")),
      );
      return;
    }
    if (change.kind === "deleted") {
      pane.append(el("p", "", t("agent_preview_deleted")));
      return;
    }
    const pre = el("pre", "agent-putback-diff");
    for (const line of String(change.diff || "").split("\n")) {
      const cls = line.startsWith("+") && !line.startsWith("+++") ? "is-added"
        : line.startsWith("-") && !line.startsWith("---") ? "is-removed" : "";
      pre.append(el("span", cls, `${line}\n`));
    }
    pane.append(pre);
  }

  async function sha256OfFile(fileId) {
    const item = liveFiles().find((file) => file && String(file.id) === String(fileId));
    if (!item) return "";
    let bytes;
    if (item.type === "office") {
      const row = await window.AISystem6NativeBinaries?.readDocumentBytes?.(item.nativeDocumentId);
      if (row?.sha256) return row.sha256;
      bytes = row?.bytes;
    } else {
      bytes = new TextEncoder().encode(String(item.body || ""));
    }
    if (!bytes) return "";
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * The put-back window's requests, for either engine. On this Mac they
   * are the engine host's routes; on the web the changes come from the run
   * and land in IndexedDB through applyCloudChanges, and deletes in the Trash.
   * Proposals ride the same engine: listed here, decided one by one, and a
   * restore is staged (shadow on the Mac, change rows on the web) so what it
   * carries still goes through the ordinary per-file confirmation.
   */
  function putBackEngine(runId) {
    const record = state.cloudRuns.get(runId);
    if (!record) {
      const base = `/api/agent/runs/${encodeURIComponent(runId)}`;
      return {
        changes: () => api(`${base}/changes`),
        putBack: (body) => api(`${base}/putback`, body),
        discard: () => api(`${base}/discard`, {}),
        proposals: () => api(`${base}/proposals`),
        acceptProposal: (id) => api(`${base}/proposals/${encodeURIComponent(id)}/accept`, {}),
        discardProposal: (id) => api(`${base}/proposals/${encodeURIComponent(id)}/discard`, {}),
      };
    }
    let latest = [];
    return {
      cloud: true,
      async changes() {
        const payload = await cloudApi().changes(runId);
        latest = (payload.changes || []).filter((change) => !record.applied.has(change.path));
        record.pending = latest.length;
        record.proposals = (payload.proposals || []).map((entry) => ({ ...entry, status: record.decisions.get(String(entry.id)) || entry.status || "pending" }));
        syncCloudRunRecord(runId);
        const project = typeof getActiveProject === "function" ? getActiveProject() : null;
        return { folderName: project?.name || "", changes: latest };
      },
      async proposals() {
        const payload = await cloudApi().changes(runId);
        record.proposals = (payload.proposals || []).map((entry) => ({ ...entry, status: record.decisions.get(String(entry.id)) || entry.status || "pending" }));
        return { proposals: record.proposals, proposalsDropped: Number(payload.proposalsDropped) || 0 };
      },
      // The cloud keeps no proposal state on the server: the decisions live in
      // this tab with the run itself.
      async acceptProposal(proposal) {
        record.decisions.set(String(proposal.id), "accepted");
        syncCloudRunRecord(runId);
        if (proposal.kind === "restore") {
          return { staged: (proposal.payload?.files || []).map((file) => String(file.name || "")).filter(Boolean) };
        }
        return { staged: [] };
      },
      async discardProposal(proposal) {
        record.decisions.set(String(proposal.id), "discarded");
        syncCloudRunRecord(runId);
        return { discarded: true };
      },
      async putBack(body) {
        const result = await cloudPutBack({
          apply: cloudApi().applyCloudChanges,
          changes: latest,
          body,
          entries: record.entries,
          projectId: record.projectId,
          runId,
          currentSha: sha256OfFile,
          trash: async (fileId) => {
            if (typeof moveItemsToTrash === "function") moveItemsToTrash([{ type: "file", id: fileId }]);
          },
        });
        for (const item of result.applied || []) record.applied.add(item.path);
        syncCloudRunRecord(runId);
        return result;
      },
      async discard() {
        await cloudApi().discard(runId);
        state.cloudRuns.delete(runId);
      },
    };
  }

  /** The manuscript review proposals anchor in, if TeachText is showing it. */
  function agentManuscriptText() {
    if (typeof teachTextBodyInput === "undefined" || !teachTextBodyInput) return null;
    if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) return null;
    return teachTextBodyInput.value || "";
  }

  /** An engine review note, through review-comments.js's own留言模型. */
  function attachEngineReviewComment(made) {
    const Comments = window.AISystem6ReviewComments;
    if (!Comments?.createComment || typeof getActiveProject !== "function") return false;
    const project = getActiveProject();
    if (!project) return false;
    const record = Comments.createComment({ text: made.text, author: made.author, anchor: made.anchor });
    if (!record) return false;
    if (!Array.isArray(project.reviewComments)) project.reviewComments = [];
    const next = Comments.append(project.reviewComments, record);
    if (!next) return false;
    project.reviewComments = next;
    if (typeof saveDeskState === "function") saveDeskState();
    window.AISystem6ReviewDeskPanel?.applyDecorations?.();
    return true;
  }

  /** The preview of one proposal's payload — shown as data, never obeyed. */
  function renderProposalPreview(pane, proposal, engineName) {
    pane.replaceChildren();
    if (!proposal) return;
    const badge = proposalBadge(proposal);
    pane.append(el("span", "agent-putback-badge", t(badge.key)));
    pane.append(el("b", "", String(proposal.title || "")));
    if (proposal.reason) pane.append(el("p", "agent-proposal-reason", String(proposal.reason)));
    const payload = proposal.payload || {};
    if (proposal.kind === "scrap") {
      pane.append(el("pre", "agent-proposal-quote", String(payload.quoted || "")));
      pane.append(el("p", "hint", `Source: ${String(payload.source || "")}`));
      if (payload.note) pane.append(el("p", "hint", `Note: ${String(payload.note)}`));
      pane.append(el("p", "hint", t("agent_proposal_scrap_note")));
      return;
    }
    if (proposal.kind === "review") {
      pane.append(el("pre", "agent-proposal-quote", String(payload.quote || "")));
      pane.append(el("p", "", String(payload.comment || "")));
      pane.append(el("p", "hint", t("agent_proposal_from_engine", engineName)));
      return;
    }
    if (proposal.kind === "restore") {
      const list = el("ul", "agent-proposal-files");
      for (const file of payload.files || []) {
        list.append(el("li", "", `${String(file.name || "")} · ${formatBytes(String(file.content || "").length)}`));
      }
      pane.append(list);
      pane.append(el("p", "hint", t("agent_proposal_restore_note")));
    }
  }

  async function openPutBack(runId) {
    const dialog = ensurePutBackDialog();
    const engine = putBackEngine(runId);
    let payload;
    let proposalsPayload;
    try {
      [payload, proposalsPayload] = await Promise.all([
        engine.changes(),
        engine.proposals().catch(() => ({ proposals: [], proposalsDropped: 0 })),
      ]);
    } catch (error) {
      setStatus(agentErrorText(error));
      return;
    }
    const changes = payload.changes || [];
    /** Cloud restores have no shadow: the accepted files ride here as rows. */
    const restored = new Map();
    const proposals = (proposalsPayload.proposals || []).slice();
    const proposalStatus = new Map();
    const statusOf = (proposal) => proposalStatus.get(String(proposal.id)) || proposal.status || "pending";
    let focused = changes[0] || null;
    let focusedProposal = proposals.find((proposal) => statusOf(proposal) === "pending") || proposals[0] || null;
    let tabName = "files";
    let outcome = null;
    let proposalBusy = false;

    const runEngineName = () => {
      const engineId = (state.runs.find((entry) => entry.runId === runId) || state.run || {}).engine;
      return t(`agent_engine_${engineId || "deepseek"}`);
    };

    const proposalHandlers = (staged) => ({
      engineName: runEngineName(),
      manuscript: () => agentManuscriptText(),
      saveScrap: (title, body) => {
        if (typeof createScrap === "function") createScrap(title, body);
      },
      attachReview: (made) => attachEngineReviewComment(made),
      stageRestore: async () => ({ staged }),
    });

    const draw = () => {
      dialog.replaceChildren();
      const form = el("form", "agent-putback-form");
      form.method = "dialog";
      const title = el("h2", "", t("agent_putback_title", payload.folderName || ""));
      title.id = "agent-putback-title";
      form.append(title);
      const pendingProposals = proposals.filter((proposal) => statusOf(proposal) === "pending").length;
      const tabs = el("div", "agent-putback-tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", t("agent_putback_tabs"));
      for (const [name, key, count] of [["files", "agent_files_tab", changes.length], ["proposals", "agent_proposals_tab", pendingProposals]]) {
        const tab = el("button", name === tabName ? "is-active" : "", t(key, count));
        tab.type = "button";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(name === tabName));
        tab.addEventListener("click", () => { tabName = name; draw(); });
        tabs.append(tab);
      }
      form.append(tabs);

      if (tabName === "proposals") {
        const columns = el("div", "agent-putback-columns");
        const list = el("ul", "agent-putback-list");
        list.setAttribute("aria-label", t("agent_proposals_tab", pendingProposals));
        for (const proposal of proposals) {
          const item = el("li", proposal === focusedProposal ? "is-focused" : "");
          const name = el("button", "agent-putback-name", String(proposal.title || ""));
          name.type = "button";
          name.addEventListener("click", () => { focusedProposal = proposal; draw(); });
          const badge = proposalBadge(proposal);
          const label = el("label");
          label.append(name, el("span", `agent-putback-badge is-${proposal.kind}`, t(badge.key)));
          item.append(label);
          if (statusOf(proposal) !== "pending") {
            item.append(el("span", "agent-proposal-status", t(statusOf(proposal) === "accepted" ? "agent_proposal_accepted" : "agent_proposal_discarded")));
          }
          list.append(item);
        }
        if (!proposals.length) list.append(el("li", "hint", t("agent_proposal_none")));
        if (proposalsPayload.proposalsDropped) list.append(el("li", "hint", t("agent_proposal_dropped", proposalsPayload.proposalsDropped)));
        const pane = el("div", "agent-putback-preview");
        renderProposalPreview(pane, focusedProposal, runEngineName());
        if (focusedProposal && statusOf(focusedProposal) === "pending") {
          const row = el("div", "button-row");
          const accept = el("button", "btn default", t("agent_proposal_accept"));
          accept.type = "button";
          accept.disabled = proposalBusy;
          accept.addEventListener("click", () => { void acceptOne(focusedProposal); });
          const discard = el("button", "btn", t("agent_proposal_discard"));
          discard.type = "button";
          discard.disabled = proposalBusy;
          discard.addEventListener("click", () => { void discardOne(focusedProposal); });
          row.append(accept, discard);
          pane.append(row);
        }
        columns.append(list, pane);
        form.append(columns);
        const actions = el("div", "button-row finder-operation-actions");
        const close = el("button", "btn default", t("close"));
        close.value = "close";
        actions.append(close);
        form.append(actions);
        dialog.append(form);
        return;
      }

      const columns = el("div", "agent-putback-columns");
      const list = el("ul", "agent-putback-list");
      list.setAttribute("aria-label", t("agent_putback_files"));
      for (const change of changes) {
        const item = el("li", change === focused ? "is-focused" : "");
        const label = el("label");
        const box = el("input");
        box.type = "checkbox";
        box.checked = selected.has(change.path);
        box.disabled = unsafeName(change.path);
        box.addEventListener("change", () => {
          if (box.checked) selected.add(change.path);
          else selected.delete(change.path);
        });
        const name = el("button", "agent-putback-name", displayName(change.path));
        name.type = "button";
        name.addEventListener("click", () => { focused = change; draw(); });
        const badge = changeBadge(change);
        label.append(box, name, el("span", `agent-putback-badge is-${badge.kind}`, badge.key ? t(badge.key) : badge.text));
        item.append(label);
        list.append(item);
      }
      if (!changes.length) list.append(el("li", "hint", t("agent_putback_nothing")));
      const pane = el("div", "agent-putback-preview");
      renderPreview(pane, focused);
      columns.append(list, pane);
      form.append(columns);
      if (outcome) {
        const report = el("div", "agent-putback-report");
        report.append(el("p", "", t("agent_putback_applied", outcome.applied?.length || 0)));
        for (const conflict of outcome.conflicts || []) {
          const row = el("p", "agent-putback-conflict");
          row.append(el("span", "", t("agent_putback_conflict", displayName(conflict.path))));
          const overwrite = el("button", "btn mini-btn", t("agent_putback_overwrite"));
          overwrite.type = "button";
          overwrite.addEventListener("click", async () => {
            const answer = await showSystemModal(t(engine.cloud ? "agent_cloud_overwrite_confirm" : "agent_putback_overwrite_confirm", displayName(conflict.path)), "confirm", { confirmKey: "agent_putback_overwrite", danger: true, defaultAction: "cancel" });
            if (answer !== "yes") return;
            try {
              const again = await engine.putBack({ paths: [conflict.path], overwriteConflicts: [conflict.path] });
              outcome = { ...again, conflicts: (outcome.conflicts || []).filter((c) => c.path !== conflict.path).concat(again.conflicts || []), applied: [...(outcome.applied || []), ...(again.applied || [])] };
            } catch (error) {
              setStatus(agentErrorText(error));
            }
            await reloadChanges();
          });
          row.append(overwrite);
          report.append(row);
        }
        if (outcome.declined?.length) report.append(el("p", "", t("agent_putback_declined", outcome.declined.length)));
        form.append(report);
      }
      const actions = el("div", "button-row finder-operation-actions");
      const discard = el("button", "btn", t("agent_discard_all"));
      discard.type = "button";
      discard.addEventListener("click", async () => {
        const answer = await showSystemModal(t(engine.cloud ? "agent_cloud_discard_confirm" : "agent_discard_confirm"), "confirm", { confirmKey: "agent_discard_all", danger: true, defaultAction: "cancel" });
        if (answer !== "yes") return;
        try {
          await engine.discard();
          if (state.receiptId) await window.AISystem6RunReceipts?.recordUserAction?.(state.receiptId, { action: "reject" });
        } catch (error) {
          setStatus(agentErrorText(error));
        }
        dialog.close();
        await refreshRuns();
        renderStrip();
      });
      const some = el("button", "btn", t("agent_putback_selected"));
      some.type = "button";
      some.addEventListener("click", () => apply("selected"));
      const all = el("button", "btn default", t("agent_putback_all"));
      all.type = "button";
      all.addEventListener("click", () => apply("all"));
      const close = el("button", "btn", t("close"));
      close.value = "close";
      actions.append(discard, some, all, close);
      form.append(actions);
      dialog.append(form);
    };

    const selected = new Set(changes.filter((change) => change.kind !== "deleted" && !unsafeName(change.path)).map((change) => change.path));

    const reloadProposals = async () => {
      try {
        const fresh = await engine.proposals();
        proposals.splice(0, proposals.length, ...(fresh.proposals || []));
        focusedProposal = proposals.find((proposal) => proposal.id === focusedProposal?.id) || proposals.find((proposal) => statusOf(proposal) === "pending") || proposals[0] || null;
      } catch {}
      draw();
    };

    const acceptOne = async (proposal) => {
      if (proposalBusy || !proposal) return;
      // The anchor is checked before anything is accepted: a review whose
      // quote is not in the manuscript is not attached, and stays pending.
      if (proposal.kind === "review") {
        const made = reviewCommentFromProposal(proposal, { manuscript: agentManuscriptText(), engineName: runEngineName() });
        if (!made.ok) {
          setStatus(t(made.reason === "no_manuscript" ? "agent_proposal_no_manuscript" : "agent_proposal_anchor_not_found"));
          return;
        }
      }
      proposalBusy = true;
      draw();
      try {
        // A restore stages on the server first (that staging is its whole
        // effect); a scrap and a review file through the desk's own entry
        // first, so a refused entry leaves the proposal pending on the
        // server too.
        let staged = [];
        if (proposal.kind === "restore") {
          const answer = engine.cloud ? await engine.acceptProposal(proposal) : await engine.acceptProposal(proposal.id);
          staged = (answer && answer.staged) || [];
        }
        const result = await dispatchProposal(proposal, proposalHandlers(staged));
        if (!result.done) return;
        if (proposal.kind !== "restore") {
          await (engine.cloud ? engine.acceptProposal(proposal) : engine.acceptProposal(proposal.id));
        }
        proposalStatus.set(String(proposal.id), "accepted");
        if (proposal.kind === "restore") {
          if (engine.cloud) {
            for (const file of proposal.payload?.files || []) {
              const name = String(file.name || "");
              if (name && !restored.has(name)) restored.set(name, { path: name, kind: "added", content: String(file.content || "") });
            }
          }
          setStatus(t("agent_proposal_restore_staged", staged.length));
        } else {
          setStatus(t("agent_proposal_accepted"));
        }
      } catch (error) {
        setStatus(agentErrorText(error));
      } finally {
        proposalBusy = false;
      }
      await reloadChanges();
      await reloadProposals();
    };

    const discardOne = async (proposal) => {
      if (proposalBusy || !proposal) return;
      proposalBusy = true;
      draw();
      try {
        if (engine.cloud) await engine.discardProposal(proposal);
        else await engine.discardProposal(proposal.id);
        proposalStatus.set(String(proposal.id), "discarded");
      } catch (error) {
        setStatus(agentErrorText(error));
      } finally {
        proposalBusy = false;
      }
      await reloadProposals();
    };

    const reloadChanges = async () => {
      try {
        const fresh = await engine.changes();
        changes.splice(0, changes.length, ...(fresh.changes || []));
      } catch {}
      // A cloud restore's files have no server side: bring the accepted rows
      // back after every reload, still unchecked.
      for (const entry of restored.values()) {
        if (!changes.some((change) => change.path === entry.path)) changes.push(entry);
      }
      for (const path of [...selected]) if (!changes.some((change) => change.path === path)) selected.delete(path);
      focused = changes.find((change) => change.path === focused?.path) || changes[0] || null;
      draw();
      await refreshRuns();
      renderStrip();
    };

    const apply = async (mode) => {
      try {
        outcome = await runPutBack({
          post: (_path, body) => engine.putBack(body),
          runId,
          changes,
          selected: [...selected],
          mode,
          confirmDelete: async (path) => (await showSystemModal(t("agent_delete_confirm", displayName(path)), "confirm", { confirmKey: "agent_delete_allow", danger: true, defaultAction: "cancel" })) === "yes",
        });
        if (outcome.sent && state.receiptId) {
          const complete = !(outcome.conflicts || []).length && !(outcome.declined || []).length;
          await window.AISystem6RunReceipts?.recordUserAction?.(state.receiptId, { action: complete ? "accept" : "edit" });
        }
      } catch (error) {
        setStatus(agentErrorText(error));
      }
      await reloadChanges();
    };

    draw();
    if (!dialog.open) dialog.showModal();
  }

  // ---- The web's file list: which Project Hard Disk files travel -------------

  /**
   * The put-back window's list, turned round: the active project's text and
   * Office files with a checkbox each, and beside them what the ticked ones
   * add up to against the caps the server reported. Only ticked files upload.
   */
  function openFilePicker() {
    const dialog = ensurePutBackDialog();
    const pickable = currentPickable();
    const pane = el("div", "agent-putback-preview");
    pane.setAttribute("aria-live", "polite");
    const drawSummary = () => {
      pane.replaceChildren();
      const allowance = currentAllowance();
      const summary = uploadSummary(pickable, [...state.fileIds], cloudCaps(state.cloudStatus, allowance));
      pane.append(el("b", "", t("agent_cloud_upload_summary", summary.count, formatBytes(summary.bytes))));
      if (summary.maxFiles) pane.append(el("p", "", t("agent_cloud_upload_caps", summary.maxFiles, formatBytes(summary.maxBytes), allowance ? t(`agent_cloud_allowance_${allowance}`) : "")));
      if (summary.over) pane.append(el("p", "clio-agent-error", t("agent_cloud_upload_over")));
      pane.append(el("p", "hint", t("agent_cloud_pick_note")));
    };
    const draw = () => {
      dialog.replaceChildren();
      const form = el("form", "agent-putback-form");
      form.method = "dialog";
      const title = el("h2", "", t("agent_cloud_pick_title"));
      title.id = "agent-putback-title";
      form.append(title);
      const columns = el("div", "agent-putback-columns");
      const list = el("ul", "agent-putback-list");
      list.setAttribute("aria-label", t("agent_cloud_pick_title"));
      for (const file of pickable) {
        const item = el("li");
        const label = el("label");
        const box = el("input");
        box.type = "checkbox";
        box.checked = state.fileIds.has(file.id);
        box.addEventListener("change", () => {
          if (box.checked) state.fileIds.add(file.id);
          else state.fileIds.delete(file.id);
          cloudApi().notePickedFiles?.([...state.fileIds]);
          drawSummary();
          renderBar();
        });
        label.append(box, el("span", "agent-putback-name", file.format ? `${file.name}.${file.format}` : file.name), el("span", "agent-putback-badge is-size", formatBytes(file.size)));
        item.append(label);
        list.append(item);
      }
      if (!pickable.length) list.append(el("li", "hint", t("agent_cloud_pick_nothing")));
      drawSummary();
      columns.append(list, pane);
      form.append(columns);
      const actions = el("div", "button-row finder-operation-actions");
      const close = el("button", "btn default", t("close"));
      close.value = "close";
      actions.append(close);
      form.append(actions);
      dialog.append(form);
    };
    draw();
    if (!dialog.open) dialog.showModal();
  }

  // Restore the writer's last mode when the module first loads — the same key
  // boot's restoreClioTalkAgentModeSelection read, so the two restores agree
  // and neither fights the other. restoredMode() waits for that restore and
  // for whatever mode change is latest, so a first send that arrived while
  // the module was still lazy starts its run only once the engine is chosen.
  const restoredModeSettled = readStoredMode() ? setMode(true).catch(() => {}) : Promise.resolve();
  function restoredMode() {
    return Promise.all([restoredModeSettled, modeSettled]).then(() => {});
  }

  return {
    isActive: () => state.active,
    placeholderKey: () => (state.kind === "cloud" ? "agent_cloud_prompt_placeholder" : "agent_prompt_placeholder"),
    setMode,
    toggle,
    submit,
    stop: stopRun,
    restoredMode,
    renderChooserFolders,
    openPutBack,
    openFilePicker,
    model: {
      activityTransition,
      agentErrorText,
      changeBadge,
      cloudAllowance,
      cloudSharedLine,
      cloudCaps,
      cloudEvent,
      cloudPutBack,
      displayName,
      engineKind,
      pickableFiles,
      uploadSummary,
      currentStepIndex,
      diffStats,
      dispatchProposal,
      emptyRunView,
      engineChoice,
      engineNoteKey,
      levelChoices,
      parseSse,
      proposalBadge,
      putBackRequest,
      reduceEvent,
      reviewCommentFromProposal,
      seedCloudRuns,
      runPutBack,
      scrapBody,
      toolSubject,
      toolVerb,
      unsafeName,
    },
  };
})();
