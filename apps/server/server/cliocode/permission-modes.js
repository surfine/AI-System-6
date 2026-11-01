// ClioCode permission modes: the single source of the mode table in
// docs/CLIOCODE-DESIGN.md ("The four permission modes").
//
// Permission modes gate TOOL CALLS, not network hosts. A decision is one of:
//   - "allow"  the tool call auto-runs with no prompt;
//   - "ask"    the host prompts the writer once and runs it only if allowed;
//   - "deny"   the host refuses it and explains, without prompting.
//
// Two rows are mode-independent because a different layer owns them:
//   - network host admission is the egress filter's (cliocode/egress.js), so
//     an allowlisted host is always "allow" and a blocked host always "deny";
//   - a path outside the project folder is the Seatbelt profile's kernel
//     boundary (cliocode/sandbox-profile.js), so it is always "deny" — except
//     under Bypass, which only exists in an isolated environment.
//
// A sandboxed command may carry a class from command-policy.js
// (context.commandClass): a "readonly" one runs without asking in Manual,
// Accept edits and Auto; a "dangerous" one asks every time in every mode but
// Plan (denied) and an isolated Bypass (allowed), with reason
// "dangerous_command" and the danger code (context.danger) the card explains.
// Plan refuses every command, read-only or not, as the design says. Nothing
// else reads the class: outside-sandbox commands still always ask.
//
// Bypass is refused unless the environment is isolated (a throwaway VM or
// container, never the writer's real Mac): decidePermission then returns
// "deny" with reason "bypass_requires_isolation" for every action.
//
// Pure, so a contract can read every cell. The ACP permission handler that
// consults it is cliocode/permissions.js.

"use strict";

const MODES = Object.freeze(["manual", "acceptEdits", "plan", "auto", "bypass"]);

const ACTIONS = Object.freeze([
  "read", // read/list/glob/grep a path inside the project folder
  "edit", // create or modify a file inside the project folder
  "delete", // remove a file inside the project folder (to the Trash)
  "runSandboxed", // run a command inside the Seatbelt sandbox
  "runExternal", // run a command OUTSIDE the sandbox (separate approval each time)
  "netAllowed", // a network request to a host on the egress allowlist
  "netBlocked", // a network request to a host not on the allowlist
  "outsideProject", // read or write a path outside the project folder
]);

// TABLE[action][mode]. The "bypass" column is the value for an isolated
// environment; decidePermission refuses the mode itself when isolated is false.
const TABLE = Object.freeze({
  read: Object.freeze({ manual: "allow", acceptEdits: "allow", plan: "allow", auto: "allow", bypass: "allow" }),
  edit: Object.freeze({ manual: "ask", acceptEdits: "allow", plan: "deny", auto: "allow", bypass: "allow" }),
  delete: Object.freeze({ manual: "ask", acceptEdits: "ask", plan: "deny", auto: "ask", bypass: "allow" }),
  runSandboxed: Object.freeze({ manual: "ask", acceptEdits: "ask", plan: "deny", auto: "allow", bypass: "allow" }),
  runExternal: Object.freeze({ manual: "ask", acceptEdits: "ask", plan: "deny", auto: "ask", bypass: "allow" }),
  netAllowed: Object.freeze({ manual: "allow", acceptEdits: "allow", plan: "allow", auto: "allow", bypass: "allow" }),
  netBlocked: Object.freeze({ manual: "deny", acceptEdits: "deny", plan: "deny", auto: "deny", bypass: "allow" }),
  outsideProject: Object.freeze({ manual: "deny", acceptEdits: "deny", plan: "deny", auto: "deny", bypass: "allow" }),
});

/**
 * A short reason per (action, decision), for the UI and the event stream.
 * @param {string} action
 * @param {string} mode
 * @param {string} decision
 */
function reasonFor(action, mode, decision) {
  if (decision === "allow") {
    if (action === "read") return "read_in_project";
    if (action === "netAllowed") return "host_allowlisted";
    return `${mode}_auto`;
  }
  if (decision === "ask") {
    if (action === "runExternal") return "outside_sandbox_each_time";
    if (action === "delete") return "destructive_confirm";
    return `${mode}_confirm`;
  }
  if (action === "netBlocked") return "host_not_allowlisted";
  if (action === "outsideProject") return "outside_project_boundary";
  if (mode === "plan") return "plan_read_only";
  return "refused";
}

/**
 * Decide what the host does with one tool call.
 * @param {string} action one of ACTIONS
 * @param {string} mode   one of MODES
 * @param {{ isolated?: boolean, commandClass?: string, danger?: string }} [context]
 * @returns {{ decision: "allow" | "ask" | "deny", reason: string, danger?: string }}
 */
function decidePermission(action, mode, context = {}) {
  if (!ACTIONS.includes(action)) {
    throw new Error(`Unknown tool-call kind: ${JSON.stringify(action)}`);
  }
  if (!MODES.includes(mode)) {
    throw new Error(`Unknown permission mode: ${JSON.stringify(mode)}`);
  }
  if (mode === "bypass" && context.isolated !== true) {
    // Bypass has no boundary, so it is only available in an isolated
    // environment. On the writer's real Mac the mode itself is refused.
    return { decision: "deny", reason: "bypass_requires_isolation" };
  }
  // Plan reads the project to make a plan, as Claude Code's does: a
  // read-only command runs there too (owner ruling 2026-10-31); anything
  // else stays denied by the table below.
  if (action === "runSandboxed" && mode === "plan" && context.commandClass === "readonly") {
    return { decision: "allow", reason: "read_only_command" };
  }
  if (action === "runSandboxed" && mode !== "plan" && mode !== "bypass") {
    if (context.commandClass === "dangerous") {
      return { decision: "ask", reason: "dangerous_command", danger: String(context.danger || "") };
    }
    if (context.commandClass === "readonly") return { decision: "allow", reason: "read_only_command" };
  }
  const decision = /** @type {"allow" | "ask" | "deny"} */ (TABLE[action][mode]);
  return { decision, reason: reasonFor(action, mode, decision) };
}

module.exports = { ACTIONS, MODES, decidePermission };
