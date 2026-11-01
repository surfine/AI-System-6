// ClioCode's answer to dsh's ACP `requestPermission`.
//
// The ClioTalk engine runs with approval policy `never` and engine-host
// answers any request with reject (engine-host.js rejectPermission); that
// stays as it is. A ClioCode run instead passes the handler built here as
// startEngine's `permissionHandler`. For each request it:
//   1. classifies the tool call into one of the mode table's kinds
//      (permission-modes.js ACTIONS) — a path outside the project folder makes
//      any call `outsideProject`, a fetch is `netAllowed` or `netBlocked` by the
//      egress allowlist, a tool it does not know is treated like a delete
//      (asks in every mode that may change anything, refused in Plan);
//   2. reads the run's current mode (a mode switch counts from the next call)
//      and asks decidePermission;
//   3. answers dsh: allow → the allow_once option, deny → reject, ask → the
//      writer's choice through `ask`, and reject when nobody can be asked.
// Before any allow is answered, `beforeAllow` runs with what the call touches
// (the host snapshots those files — cliocode/runs.js checkpoints); a snapshot
// that cannot be made refuses the call: nothing changes without its
// checkpoint.
// An allowed `runExternal` call — the row that executes OUTSIDE the sandbox —
// is handed to `runExternal` before dsh hears the answer: the host runs that
// one approved command as a separate child without the Seatbelt wrapper
// (cliocode/runs.js runExternalCommand). A missing runner, or one that throws,
// refuses the call: fail closed. A per-session allow is the host's, narrowed
// to one kind and one target, and never covers a delete, an
// outside-sandbox command or a dangerous command (command-policy.js), which
// ask every time; a read-only command (same policy) is allowed without asking. Anything unexpected — an
// unknown mode, a throw, an answer that is not a choice — is a reject.
//
// The Seatbelt profile stays the boundary; this is the review surface.

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { decidePermission } = require("./permission-modes.js");
const { classifyCommand, joinArgv } = require("./command-policy.js");

/** ACP tool kinds (and dsh tool names, which dsh sends as the title with kind "other"). */
const KIND_BY_NAME = Object.freeze({
  read: "read",
  ls: "read",
  list: "read",
  glob: "read",
  grep: "read",
  search: "read",
  think: "read",
  todo_write: "read",
  edit: "edit",
  write: "edit",
  multi_edit: "edit",
  multiedit: "edit",
  apply_patch: "edit",
  notebook_edit: "edit",
  move: "edit",
  delete: "delete",
  remove: "delete",
  trash: "delete",
  execute: "run",
  bash: "run",
  shell: "run",
  fetch: "fetch",
  web_fetch: "fetch",
  web_search: "search_web",
});

/** Fields of a tool call's raw input that name a path. */
const PATH_FIELDS = Object.freeze(["file_path", "filePath", "path", "notebook_path", "old_path", "new_path", "source", "destination", "target", "cwd", "dir", "directory"]);

/** Raw-input flags by which a command asks to run outside the sandbox. */
const EXTERNAL_FLAGS = Object.freeze(["outsideSandbox", "dangerouslyDisableSandbox", "with_escalated_permissions"]);

/** Kinds a per-session allow may never cover: they ask every time. */
const NO_SESSION_ALLOW = Object.freeze(["delete", "runExternal"]);

/** @param {string} child @param {string} parent */
function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * The realpath of `p`, through its nearest existing ancestor when `p` itself
 * does not exist yet (a file about to be created).
 * @param {string} p absolute
 */
function realpathThroughAncestor(p) {
  let current = p;
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * One named path, resolved against the project folder (~ under the home).
 * @param {string} value
 * @param {string} project
 * @param {string} home
 */
function resolveToolPath(value, project, home) {
  const text = value.trim();
  if (text === "~" || text.startsWith("~/")) return path.join(home, text.slice(2));
  return path.resolve(project, text);
}

/**
 * The paths a tool call names, resolved against the project folder.
 * @param {any} toolCall
 * @param {string} project
 * @param {string} home
 */
function toolCallPaths(toolCall, project, home) {
  const raw = toolCall?.rawInput && typeof toolCall.rawInput === "object" ? toolCall.rawInput : {};
  const named = [
    ...(Array.isArray(toolCall?.locations) ? toolCall.locations.map((location) => location?.path) : []),
    ...PATH_FIELDS.map((field) => raw[field]),
    ...(Array.isArray(raw.paths) ? raw.paths : []),
  ].filter((value) => typeof value === "string" && value.trim());
  return [...new Set(named.map((value) => resolveToolPath(value, project, home)))];
}

/** @param {any} toolCall */
function toolName(toolCall) {
  const kind = String(toolCall?.kind || "").toLowerCase();
  if (kind && kind !== "other" && KIND_BY_NAME[kind]) return kind;
  const title = String(toolCall?.title || "").trim().toLowerCase().split(/\s+/)[0] || "";
  return title.replace(/[^a-z_]/g, "");
}

/**
 * Which row of the mode table a tool call falls in, and what it touches.
 * @param {any} toolCall the ACP toolCall of a requestPermission
 * @param {{ project: string, home?: string, allowHost?: (host: string) => boolean, extraRoots?: string[] }} context
 *   project: realpath of the project folder; extraRoots: realpaths a link
 *   inside the project may lead to without the call counting as outside
 *   (a Clio run's proposal and desk channels, agent/engine-permissions.js)
 * @returns {{ action: string, tool: string, paths: string[], command: string, cwd: string, host: string, known: boolean, commandClass: string, danger: string }}
 */
function classifyToolCall(toolCall, context) {
  const project = context.project;
  const home = context.home || os.homedir();
  const raw = toolCall?.rawInput && typeof toolCall.rawInput === "object" ? toolCall.rawInput : {};
  const tool = toolName(toolCall);
  const kind = KIND_BY_NAME[tool] || "";
  const paths = toolCallPaths(toolCall, project, home);
  const command = Array.isArray(raw.command) ? raw.command.map(String).join(" ") : typeof raw.command === "string" ? raw.command : "";
  const commandText = Array.isArray(raw.command) ? joinArgv(raw.command) : command;
  const cwd = typeof raw.cwd === "string" && raw.cwd.trim() ? resolveToolPath(raw.cwd, project, home) : "";
  let host = "";
  if (kind === "fetch") {
    try {
      host = new URL(String(raw.url || "")).hostname.toLowerCase();
    } catch {}
  }
  const result = { action: "", tool, paths, command, cwd, host, known: Boolean(kind), commandClass: "ordinary", danger: "" };
  // A path outside the folder decides the row whatever the tool (the
  // lexical check first, then the realpath, so a link out of the folder counts).
  const realProject = realpathThroughAncestor(project);
  const realRoots = [realProject, ...(context.extraRoots || []).filter((root) => path.isAbsolute(String(root || "")))];
  if (paths.some((p) => {
    if (!isInside(p, project)) return true;
    const real = realpathThroughAncestor(p);
    return !realRoots.some((root) => isInside(real, root));
  })) {
    return { ...result, action: "outsideProject" };
  }
  if (kind === "read") return { ...result, action: "read" };
  if (kind === "edit") return { ...result, action: "edit" };
  if (kind === "delete") return { ...result, action: "delete" };
  if (kind === "run") {
    const external = EXTERNAL_FLAGS.some((flag) => raw[flag] === true) || raw.sandbox === false || raw.sandbox_permissions === "require_escalated";
    // The class (read-only / ordinary / dangerous) only matters to the
    // sandboxed row; an outside-sandbox command asks every time regardless.
    const { commandClass, danger } = classifyCommand(commandText, { project, cwd: cwd || project, home });
    return { ...result, action: external ? "runExternal" : "runSandboxed", commandClass, danger };
  }
  if (kind === "fetch") {
    return { ...result, action: host && context.allowHost?.(host) === true ? "netAllowed" : "netBlocked" };
  }
  // Web search goes out through the engine's own provider, a host the run's
  // allowlist already holds.
  if (kind === "search_web") return { ...result, action: "netAllowed" };
  // A tool this handler does not know is treated like a delete.
  return { ...result, action: "delete" };
}

/**
 * The answer dsh gets: allow_once for an allow (never allow_always — with no
 * allow_once on offer the allow becomes a reject), a reject option for a
 * reject, cancelled when there is none.
 * @param {any} params
 * @param {"allow" | "reject"} answer
 */
function acpOutcome(params, answer) {
  const options = Array.isArray(params?.options) ? params.options : [];
  const allow = answer === "allow" ? options.find((option) => option?.kind === "allow_once") : null;
  const pick = allow || options.find((option) => option?.kind === "reject_once") || options.find((option) => /reject/.test(String(option?.kind || "")));
  return pick ? { outcome: { outcome: "selected", optionId: pick.optionId } } : { outcome: { outcome: "cancelled" } };
}

/**
 * @typedef {object} PermissionRequest  what the writer is asked about (the run's permission_request event)
 * @property {string} toolCallId
 * @property {string} kind        the mode-table row (permission-modes.js ACTIONS)
 * @property {string} action      the same row — the decision records name it action
 * @property {string} reason
 * @property {string} danger      the danger code when reason is "dangerous_command" (command-policy.js DANGER_CODES), else ""
 * @property {string} title
 * @property {string} command
 * @property {string} cwd         the command's working directory, when the call names one (inside the project)
 * @property {string[]} paths
 * @property {string} host
 * @property {boolean} sessionAllowed  whether "allow_session" may be offered
 */

/**
 * @typedef {object} CodePermissionOptions
 * @property {string} project                              realpath of the project folder
 * @property {string | (() => string)} mode                the run's mode, read on every call
 * @property {boolean} [isolated]                          true only in an isolated VM/container
 * @property {string} [home]                               the writer's home (for ~ paths)
 * @property {(host: string) => boolean} [allowHost]       the egress allowlist (egress.js codeHostAllowed)
 * @property {string[]} [extraRoots]                       realpaths a link in the project may lead to (classifyToolCall)
 * @property {(request: PermissionRequest) => Promise<string> | string} [ask]
 *   the writer's choice: "allow" | "allow_session" | "deny"
 * @property {(request: PermissionRequest) => void} [beforeAllow]
 *   runs after an allow is decided and before dsh hears it: the host snapshots
 *   the files the call will touch (cliocode/runs.js). A throw refuses the call.
 * @property {(request: PermissionRequest) => Promise<unknown> | unknown} [runExternal]
 *   runs an ALLOWED outside-sandbox command as the host's own unwrapped child
 *   (cliocode/runs.js runExternalCommand) — once, for this approved command.
 *   A missing runner, or one that throws, refuses the call: fail closed.
 * @property {(record: Record<string, unknown>) => void} [onDecision]  one record per request, for the run log
 */

/**
 * Build the requestPermission handler for one ClioCode run.
 * @param {CodePermissionOptions} options
 * @returns {(params: any) => Promise<{ outcome: { outcome: string, optionId?: string } }>}
 */
function createCodePermissionHandler(options) {
  const project = path.resolve(String(options.project || ""));
  if (!path.isAbsolute(String(options.project || ""))) throw new Error("A ClioCode run needs an absolute project folder.");
  /** @type {Set<string>} */
  const sessionAllows = new Set();
  const record = (entry) => {
    try { options.onDecision?.(entry); } catch {}
  };
  /**
   * Answer an allow: the snapshot first (`beforeAllow`; a throw refuses the
   * call rather than letting an unsnapshotted change land), an allowed
   * outside-sandbox command runs through the host's runner (`runExternal`; a
   * missing runner or a throw refuses — the command never runs unwrapped
   * unasked), then the record and the allow_once dsh offered — never
   * allow_always.
   * @param {any} params
   * @param {PermissionRequest} entry
   * @param {string} reason
   */
  async function answerAllow(params, entry, reason) {
    try {
      options.beforeAllow?.(entry);
    } catch (error) {
      record({ toolCallId: entry.toolCallId, action: entry.action, decision: "deny", reason: "checkpoint_failed", error: String(/** @type {any} */ (error)?.message || error) });
      return acpOutcome(params, "reject");
    }
    if (entry.action === "runExternal") {
      if (typeof options.runExternal !== "function") {
        record({ toolCallId: entry.toolCallId, action: entry.action, decision: "deny", reason: "external_refused" });
        return acpOutcome(params, "reject");
      }
      try {
        await options.runExternal(entry);
      } catch (error) {
        record({ toolCallId: entry.toolCallId, action: entry.action, decision: "deny", reason: "external_failed", error: String(/** @type {any} */ (error)?.message || error) });
        return acpOutcome(params, "reject");
      }
    }
    record({ toolCallId: entry.toolCallId, action: entry.action, decision: "allow", reason });
    return acpOutcome(params, "allow");
  }

  return async function requestPermission(params) {
    const toolCall = params?.toolCall || {};
    const toolCallId = String(toolCall.toolCallId || "");
    let classified;
    let verdict;
    try {
      const mode = typeof options.mode === "function" ? options.mode() : options.mode;
      classified = classifyToolCall(toolCall, { project, home: options.home, allowHost: options.allowHost, extraRoots: options.extraRoots });
      verdict = decidePermission(classified.action, String(mode || ""), {
        isolated: options.isolated === true,
        commandClass: classified.commandClass,
        danger: classified.danger,
      });
    } catch (error) {
      record({ toolCallId, decision: "deny", reason: "invalid_request", error: String(/** @type {any} */ (error)?.message || error) });
      return acpOutcome(params, "reject");
    }
    const { action, paths, command, cwd, host } = classified;
    const entry = {
      toolCallId,
      kind: action,
      action,
      reason: verdict.reason,
      danger: verdict.reason === "dangerous_command" ? String(verdict.danger || "") : "",
      title: String(toolCall.title || ""),
      command,
      cwd,
      paths,
      host,
      sessionAllowed: false,
    };
    if (verdict.decision !== "ask") {
      if (verdict.decision !== "allow") {
        record({ toolCallId, action, decision: "deny", reason: verdict.reason });
        return acpOutcome(params, "reject");
      }
      return answerAllow(params, entry, verdict.reason);
    }
    // A dangerous command asks every time too: "allow for this session" never covers it.
    const sessionAllowed = !NO_SESSION_ALLOW.includes(action) && verdict.reason !== "dangerous_command" && Boolean(paths.length || command);
    const sessionKey = sessionAllowed ? JSON.stringify([action, [...paths].sort(), command]) : "";
    if (sessionKey && sessionAllows.has(sessionKey)) {
      return answerAllow(params, { ...entry, sessionAllowed: true }, "session_allow");
    }
    if (typeof options.ask !== "function") {
      record({ toolCallId, action, decision: "deny", reason: "no_one_to_ask" });
      return acpOutcome(params, "reject");
    }
    let choice = "";
    try {
      choice = String(await options.ask({
        toolCallId,
        kind: action,
        action,
        reason: verdict.reason,
        danger: entry.danger,
        title: String(toolCall.title || ""),
        command,
        cwd,
        paths,
        host,
        sessionAllowed,
      }) || "");
    } catch {
      choice = "";
    }
    // "allow_session" for a kind no session allow covers is a yes for this call only.
    if (choice === "allow_session" && sessionKey) sessionAllows.add(sessionKey);
    const allowed = choice === "allow" || choice === "allow_session";
    if (allowed) return answerAllow(params, { ...entry, sessionAllowed }, `writer_${choice}`);
    record({ toolCallId, action, decision: "deny", reason: "writer_deny" });
    return acpOutcome(params, "reject");
  };
}

module.exports = { classifyToolCall, createCodePermissionHandler };
