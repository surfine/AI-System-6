// ACP session/update payloads → the event stream ClioTalk reads.
//
// dsh speaks ACP: it sends committed blocks (no token streaming), tool
// lifecycles, usage and, for todo_write, a tool call whose rawInput is the
// whole list. ClioTalk wants a smaller vocabulary it can draw as System 6
// objects: assistant text, the plan checklist, one evidence line per real
// tool call, usage, and an end. Pure and synchronous so a contract can feed it
// recorded frames (tests/fixtures/agent/*.json).
//
// Every string leaving here is passed through the secret redactor, and tool
// output has the shadow's absolute path removed: the writer sees `notes.md`,
// not ~/Library/Application Support/AI System 6/agent/shadows/<run>/work/notes.md.

"use strict";

const { redact } = require("./engine-host.js");

const OUTPUT_LIMIT = 4000;
const INPUT_STRING_LIMIT = 4000;
/** One assistant_text or thought event carries at most this many bytes. */
const EVENT_TEXT_BYTES = 64 * 1024;
/** A run's event log holds at most this many bytes of engine output. */
const RUN_EVENT_BYTES = 2 * 1024 * 1024;
/** Events whose size the engine decides; the rest are the host's own. */
const BULK_TYPES = new Set(["assistant_text", "thought", "tool_call", "tool_update", "plan"]);

/**
 * Cut a model-written text to EVENT_TEXT_BYTES of UTF-8 (on a character
 * boundary) and say whether it was cut.
 * @param {string} text
 * @returns {{ text: string, truncated: boolean }}
 */
function capText(text) {
  const value = String(text || "");
  if (Buffer.byteLength(value) <= EVENT_TEXT_BYTES) return { text: value, truncated: false };
  const cut = Buffer.from(value).subarray(0, EVENT_TEXT_BYTES).toString("utf8").replace(/\uFFFD+$/, "");
  return { text: cut, truncated: true };
}

/** @param {"assistant_text" | "thought"} type @param {any} update @param {string} work */
function textEvent(type, update, work) {
  const { text, truncated } = capText(relativize(update.content.text, work));
  /** @type {AgentEvent} */
  const event = { type, messageId: String(update.messageId || ""), text };
  if (truncated) event.truncated = true;
  return event;
}

/**
 * The per-run ceiling on what the engine can put in the event log (memory,
 * the SSE replay and, on the Mac, events.jsonl). Host events (status,
 * changes, usage, done, error, spend) always pass: they are small and bounded
 * by the run's lifecycle. Once engine output passes the ceiling it is
 * dropped, and the first drop is announced once.
 * @param {number} [limit]
 */
function createEventBudget(limit = RUN_EVENT_BYTES) {
  let used = 0;
  let full = false;
  return {
    /**
     * @param {string} type
     * @param {unknown} data
     * @returns {"keep" | "drop" | "notice"}
     */
    admit(type, data) {
      if (!BULK_TYPES.has(type)) return "keep";
      if (full) return "drop";
      const size = Buffer.byteLength(JSON.stringify(data ?? null));
      if (used + size > limit) {
        full = true;
        return "notice";
      }
      used += size;
      return "keep";
    },
    get used() { return used; },
    get full() { return full; },
  };
}

/**
 * @param {string} text
 * @param {string} work
 */
function relativize(text, work) {
  let out = String(text || "");
  if (work) out = out.split(`${work}/`).join("").split(work).join(".");
  return redact(out);
}

/**
 * Bound and redact a model-written tool input without changing its shape;
 * paths into the shadow read as paths into the writer's folder.
 * @param {unknown} value
 * @returns {unknown}
 */
function boundInput(value, work = "", depth = 0) {
  if (typeof value === "string") {
    const text = relativize(value, work);
    return text.length > INPUT_STRING_LIMIT ? `${text.slice(0, INPUT_STRING_LIMIT)}…` : text;
  }
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => boundInput(item, work, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([k, v]) => [k, boundInput(v, work, depth + 1)]));
}

/**
 * Text out of an ACP tool content list.
 * @param {any} content
 */
function contentText(content) {
  if (!Array.isArray(content)) return "";
  return content.map((item) => {
    if (item?.type === "content" && item.content?.type === "text") return String(item.content.text || "");
    if (item?.type === "diff") return `diff ${String(item.path || "")}`;
    return "";
  }).filter(Boolean).join("\n");
}

/** @param {any} todos */
function planFromTodos(todos) {
  if (!Array.isArray(todos)) return null;
  return todos.slice(0, 100).map((todo) => ({
    content: redact(String(todo?.content || "")),
    status: ["pending", "in_progress", "completed"].includes(todo?.status) ? todo.status : "pending",
  }));
}

/**
 * @typedef {{ type: string, [key: string]: unknown }} AgentEvent
 */

/**
 * @param {any} update   one ACP `session/update` params.update
 * @param {{ work?: string }} [context]
 * @returns {AgentEvent[]}
 */
function translateUpdate(update, context = {}) {
  const work = context.work || "";
  const kind = String(update?.sessionUpdate || "");
  switch (kind) {
    case "agent_message_chunk":
      return update.content?.type === "text" ? [textEvent("assistant_text", update, work)] : [];
    case "agent_thought_chunk":
      return update.content?.type === "text" ? [textEvent("thought", update, work)] : [];
    case "tool_call": {
      /** @type {AgentEvent[]} */
      const events = [{
        type: "tool_call",
        id: String(update.toolCallId || ""),
        title: String(update.title || ""),
        kind: String(update.kind || "other"),
        status: String(update.status || "pending"),
        rawInput: boundInput(update.rawInput ?? null, work),
      }];
      if (update.title === "todo_write") {
        const entries = planFromTodos(update.rawInput?.todos);
        if (entries) events.push({ type: "plan", source: "todo_write", entries });
      }
      return events;
    }
    case "tool_call_update": {
      const output = relativize(contentText(update.content), work);
      /** @type {AgentEvent} */
      const event = {
        type: "tool_update",
        id: String(update.toolCallId || ""),
        status: String(update.status || ""),
        output: output.length > OUTPUT_LIMIT ? `${output.slice(0, OUTPUT_LIMIT)}…` : output,
      };
      if (update.title) event.title = String(update.title);
      if (update.rawInput !== undefined) event.rawInput = boundInput(update.rawInput, work);
      return [event];
    }
    case "plan":
      return [{
        type: "plan",
        source: "acp",
        entries: (Array.isArray(update.entries) ? update.entries : []).slice(0, 100).map((entry) => ({
          content: redact(String(entry?.content || "")),
          status: String(entry?.status || "pending"),
        })),
      }];
    case "usage_update":
      return [{ type: "usage", used: Number(update.used) || 0, size: Number(update.size) || 0 }];
    default:
      // available_commands_update, current_mode_update, config_option_update,
      // session_info_update and anything newer: not part of ClioTalk's view.
      return [];
  }
}

/**
 * The end of a prompt turn.
 * @param {{ stopReason?: string }} result
 * @param {{ used: number, size: number } | null} usage
 * @returns {AgentEvent}
 */
function doneEvent(result, usage) {
  return { type: "done", stopReason: String(result?.stopReason || "end_turn"), usage: usage || null };
}

/** The one notice a full event log leaves in place of what it drops. */
const EVENT_LOG_FULL = Object.freeze({
  code: "agent_event_log_full",
  message: "The run's log is full; further engine text is not kept. Its changes still are.",
});

module.exports = { EVENT_LOG_FULL, EVENT_TEXT_BYTES, RUN_EVENT_BYTES, capText, createEventBudget, doneEvent, relativize, translateUpdate };
