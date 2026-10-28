// A minimal ACP client over newline-delimited JSON-RPC on two streams.
//
// The Mac engine host uses the ACP SDK that ships inside the slim dsh install.
// The VPS does not carry that install (it lives only in the sandbox image), so
// the cloud host speaks the handful of ACP calls it needs itself:
//
//   → initialize, session/new, session/set_config_option, session/prompt
//   → session/cancel (notification)
//   ← session/update (notification), session/request_permission (answered
//     with the reject option: approval policy is `never`, and the container is
//     the boundary either way); any other client method is refused.
//
// Everything the container writes is untrusted: a line that is not JSON, or
// is longer than MAX_LINE_BYTES, is dropped.

"use strict";

const PROTOCOL_VERSION = 1;
const MAX_LINE_BYTES = 4 * 1024 * 1024;

/**
 * `input` is the engine's stdout, `output` its stdin.
 * @param {{
 *   input: NodeJS.ReadableStream,
 *   output: NodeJS.WritableStream,
 *   onUpdate: (update: any) => void,
 *   onPermission?: (params: any) => void,
 * }} options
 */
function createAcpClient(options) {
  let nextId = 1;
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
  const pending = new Map();
  let buffer = "";
  let closed = false;

  /** @param {any} message */
  function send(message) {
    if (closed) return;
    try { options.output.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`); } catch {}
  }

  /** @param {string} method @param {any} params */
  function request(method, params) {
    if (closed) return Promise.reject(Object.assign(new Error("The engine connection is closed."), { code: "engine_closed" }));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  }

  /** @param {any} message */
  function onMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.method && message.id === undefined) {
      if (message.method === "session/update") options.onUpdate(message.params?.update);
      return;
    }
    if (message.method && message.id !== undefined) {
      if (message.method === "session/request_permission") {
        options.onPermission?.(message.params);
        const reject = (message.params?.options || []).find((option) => /reject/.test(String(option?.kind || "")));
        send({ id: message.id, result: reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } } });
        return;
      }
      send({ id: message.id, error: { code: -32601, message: "Method not offered by this client." } });
      return;
    }
    const waiter = pending.get(Number(message.id));
    if (!waiter) return;
    pending.delete(Number(message.id));
    if (message.error) {
      const error = new Error(String(message.error.message || "ACP error"));
      /** @type {any} */ (error).code = "engine_failed";
      waiter.reject(error);
    } else {
      waiter.resolve(message.result);
    }
  }

  options.input.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim() || line.length > MAX_LINE_BYTES) continue;
      try { onMessage(JSON.parse(line)); } catch {}
    }
    if (buffer.length > MAX_LINE_BYTES) buffer = "";
  });

  function close(reason = "The engine exited.") {
    if (closed) return;
    closed = true;
    for (const waiter of pending.values()) {
      waiter.reject(Object.assign(new Error(reason), { code: "engine_closed" }));
    }
    pending.clear();
  }
  options.input.on("end", () => close());
  options.input.on("close", () => close());

  return {
    initialize() {
      return request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      });
    },
    /** @param {string} cwd */
    newSession(cwd) {
      return request("session/new", { cwd, mcpServers: [] });
    },
    /** @param {string} sessionId @param {string} configId @param {string} value */
    setConfigOption(sessionId, configId, value) {
      return request("session/set_config_option", { sessionId, configId, value });
    },
    /** @param {string} sessionId @param {string} text */
    prompt(sessionId, text) {
      return request("session/prompt", { sessionId, prompt: [{ type: "text", text }] });
    },
    /** @param {string} sessionId */
    cancel(sessionId) {
      send({ method: "session/cancel", params: { sessionId } });
    },
    close,
  };
}

module.exports = { PROTOCOL_VERSION, createAcpClient };
