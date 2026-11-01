// The host's answer to a permission request from an engine that asks (the
// `claude-code` engine; dsh runs with approval `never` and is answered reject).
//
// No new policy: a Clio run's level picks a row set of ClioCode's mode table
// (cliocode/permission-modes.js through cliocode/permissions.js), and nobody
// is asked — an "ask" verdict is a reject, as in a ClioCode run with no one to
// ask. The run's work/ is the project folder, so a path outside the shadow is
// `outsideProject` and refused in every mode.
//
//   level read            → mode "plan":        reads yes, edits/deletes/commands no
//   level propose/change  → mode "acceptEdits": reads and edits inside the shadow yes,
//                                               deletes and commands ask → reject
//
// Three things the table does not name, answered here first:
//   - a write into the run's own channels (work/.ais6-proposals, the desk
//     channel's ask/) is allowed at every level: the kernel lets a read run
//     write exactly there, and offering a candidate is not changing the folder;
//   - an MCP tool (`mcp__<server>__<tool>`) is allowed only when its server is
//     one of the run's connector-gateway paths — the gateway then applies the
//     writer's own Allow / Ask / Off rule for that tool — and refused otherwise;
//   - a shell command is allowed only for an engine with readonlyCommands
//     (Codex), when cliocode/command-policy.js classes it read-only, in the
//     shadow; everything else is refused;
//   - WebSearch runs on the model provider's own host (already on the run's
//     egress allowlist): allowed when the run has web tools, refused when not.
// Every answer is allow_once or a reject; never an "always" option, never a
// mode switch, never bypass.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { classifyToolCall, createCodePermissionHandler } = require("../cliocode/permissions.js");

/** @param {string} level */
function modeForLevel(level) {
  return level === "read" ? "plan" : "acceptEdits";
}

/** Claude Code's spelling of an MCP server name in a tool name. @param {string} name */
function mcpServerKey(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** @param {string} child @param {string} parent */
function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** The realpath of `p`, through its nearest existing ancestor. @param {string} p */
function realThroughAncestor(p) {
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

/** allow_once when offered, else a reject option, else cancelled. @param {any} params @param {boolean} allow */
function answer(params, allow) {
  const options = Array.isArray(params?.options) ? params.options : [];
  const pick = (allow ? options.find((option) => option?.kind === "allow_once") : null)
    || options.find((option) => option?.kind === "reject_once")
    || options.find((option) => /reject/.test(String(option?.kind || "")));
  return pick ? { outcome: { outcome: "selected", optionId: pick.optionId } } : { outcome: { outcome: "cancelled" } };
}

/**
 * @typedef {object} ClioPermissionOptions
 * @property {string} work                 realpath of the run's shadow work/
 * @property {string} level                read | propose | change
 * @property {string[]} [channels]         realpaths the engine may write at any level
 *                                         (tmp/.ais6-proposals, tmp/.ais6-desk/ask)
 * @property {string[]} [readRoots]        realpaths links in work/ may lead to for reads
 *                                         (tmp/.ais6-desk, for the answers)
 * @property {string[]} [gatewayServers]   the run's connector-gateway server names
 * @property {boolean} [webTools]
 * @property {boolean} [readonlyCommands]  the engine may run read-only shell commands (Codex): a command
 *                                         ClioCode's command policy classes readonly, in the shadow, is allowed
 * @property {(toolCallId: string) => ({ paths: string[], kinds: string[] } | null)} [lookupCall]
 *                                         what the engine already reported of a file change (its diff paths
 *                                         and kinds, from the `tool_call` before the request)
 * @property {(host: string) => boolean} [allowHost]  the run's egress allowlist
 * @property {(record: Record<string, unknown>) => void} [onDecision]
 */

/**
 * @param {ClioPermissionOptions} options
 * @returns {(params: any) => Promise<{ outcome: { outcome: string, optionId?: string } }>}
 */
function createClioPermissionHandler(options) {
  const work = String(options.work || "");
  if (!path.isAbsolute(work)) throw new Error("A Clio run's permission handler needs the shadow's work folder.");
  const channels = (options.channels || []).filter((p) => path.isAbsolute(String(p || "")));
  const readRoots = [...channels, ...(options.readRoots || []).filter((p) => path.isAbsolute(String(p || "")))];
  const servers = new Set((options.gatewayServers || []).map(mcpServerKey));
  const record = (/** @type {Record<string, unknown>} */ entry) => {
    try { options.onDecision?.(entry); } catch {}
  };
  const table = createCodePermissionHandler({
    project: work,
    mode: modeForLevel(String(options.level || "read")),
    allowHost: options.allowHost,
    onDecision: options.onDecision,
    // No `ask`: an "ask" verdict is a reject (no_one_to_ask). No beforeAllow
    // and no runExternal: nothing runs outside the sandbox, ever.
  });
  return async function requestPermission(params) {
    const toolCall = params?.toolCall || {};
    const toolCallId = String(toolCall.toolCallId || "");
    const name = String(toolCall.name || toolCall?._meta?.claudeCode?.toolName || "");
    if (name.startsWith("mcp__")) {
      const rest = name.slice(5);
      const cut = rest.indexOf("__");
      const server = cut > 0 ? rest.slice(0, cut) : "";
      const allowed = Boolean(server) && servers.has(server) && cut + 2 < rest.length;
      record({ toolCallId, action: "mcp", decision: allowed ? "allow" : "deny", reason: allowed ? "connector_gateway" : "mcp_not_gateway" });
      return answer(params, allowed);
    }
    if (name === "WebSearch") {
      const allowed = options.webTools !== false;
      record({ toolCallId, action: "search_web", decision: allowed ? "allow" : "deny", reason: allowed ? "provider_search" : "no_web" });
      return answer(params, allowed);
    }
    try {
      // The channels are reached through links in work/ (shadow.js); the
      // table proper sees only work/ and refuses anything a link leads out of.
      const classified = classifyToolCall(toolCall, { project: work, allowHost: options.allowHost, extraRoots: readRoots });
      const reals = classified.paths.map(realThroughAncestor);
      const within = (/** @type {string[]} */ roots) => reals.length > 0
        && reals.every((real) => roots.some((root) => inside(real, root) && real !== root));
      // A command: only a read-only one (ClioCode's command policy), with the
      // shadow as its folder, and only for an engine that has shell reads at
      // all (Codex). Codex's own sandbox cannot start inside the run's, so it
      // asks "escalated" (runExternal); that still runs under the run's
      // profile, whose exec list is the read-only binaries. Anything else is refused.
      if (classified.action === "runSandboxed" || classified.action === "runExternal") {
        const cwdReal = classified.cwd ? realThroughAncestor(classified.cwd) : work;
        const ok = options.readonlyCommands === true
          && classified.commandClass === "readonly" && !classified.danger && inside(cwdReal, work);
        record({ toolCallId, action: classified.action, decision: ok ? "allow" : "deny", reason: ok ? "readonly_command" : "not_readonly_command" });
        return answer(params, ok);
      }
      // A write or read that names no path cannot be judged (a Codex request
      // before its item started): refused. Glob/Grep default to the folder.
      if ((classified.action === "edit" || classified.action === "read") && classified.paths.length === 0
        && !(classified.action === "read" && /^(glob|grep|search|ls)$/.test(classified.tool))) {
        record({ toolCallId, action: classified.action, decision: "deny", reason: "no_paths" });
        return answer(params, false);
      }
      // What the engine reported of this change before asking: a delete or a
      // rename (a path beyond the request's own locations) is refused, and
      // every path of it must be inside the shadow.
      const known = classified.action === "edit" ? options.lookupCall?.(toolCallId) : null;
      if (known) {
        const named = new Set(classified.paths.map((p) => path.resolve(p)));
        const reason = known.kinds.includes("delete") ? "delete"
          : known.paths.some((p) => !named.has(path.resolve(p))) ? "move"
          : known.paths.some((p) => { const real = realThroughAncestor(p); return ![work, ...channels].some((root) => inside(real, root)); }) ? "outside" : "";
        if (reason) {
          record({ toolCallId, action: "edit", decision: "deny", reason: `change_${reason}` });
          return answer(params, false);
        }
      }
      if (classified.action === "edit" && within(channels)) {
        record({ toolCallId, action: "edit", decision: "allow", reason: "run_channel" });
        return answer(params, true);
      }
      if (classified.action === "read" && within(readRoots)) {
        record({ toolCallId, action: "read", decision: "allow", reason: "run_channel" });
        return answer(params, true);
      }
    } catch (error) {
      record({ toolCallId, decision: "deny", reason: "invalid_request", error: String(/** @type {any} */ (error)?.message || error) });
      return answer(params, false);
    }
    return table(params);
  };
}

module.exports = { createClioPermissionHandler, mcpServerKey, modeForLevel };
