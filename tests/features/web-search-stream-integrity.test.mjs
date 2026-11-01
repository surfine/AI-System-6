// A streamed web-search answer is only an answer once its final envelope
// arrives. The deltas before it are a preview, and the citations travel with
// the envelope - so a stream that ends early must not be handed back as an
// ordinary result with the partial text and an empty source list. That reads
// as "this answer has no sources" when the truth is "the sources never came".
//
// These execute the real reader with a transport that hands back exactly the
// chunks the case needs, including one that never resolves until the reader is
// cancelled. The server's own protocol is covered by
// tests/integration/web-search-stream-transport.test.mjs and the surface is
// covered end to end in tests/e2e/web-search-stream-integrity.spec.mjs.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("web-search-stream-integrity");
const encoder = new TextEncoder();
const vmw = createAppBootVm();
// The reader reports a cancellation as an AbortError; the shim does not carry the
// browser class, and the reader must not silently degrade without it.
vmw.context.DOMException = DOMException;

const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

/**
 * A response whose body yields the given text chunks, in order. The chunk
 * boundaries are the test's, so a multi-byte character can be split across two
 * network reads on purpose.
 */
function bodySource(chunks) {
  const payload = JSON.stringify(chunks.map((chunk) => Array.from(encoder.encode(chunk))));
  return `
    (() => {
      const chunks = ${payload}.map((bytes) => new Uint8Array(bytes));
      let index = 0;
      window.__cancelled = false;
      window.__released = false;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/event-stream" },
        body: {
          getReader() {
            return {
              async read() {
                if (index >= chunks.length) return { done: true, value: undefined };
                return { done: false, value: chunks[index++] };
              },
              cancel() { window.__cancelled = true; return Promise.resolve(); },
              releaseLock() { window.__released = true; },
            };
          },
        },
      };
    })()
  `;
}

/** Same idea, but the read only settles when the caller cancels. */
function hangingBodySource() {
  return `
    (() => {
      window.__cancelled = false;
      window.__released = false;
      let unblock = () => {};
      const pending = new Promise((resolve) => { unblock = resolve; });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/event-stream" },
        body: {
          getReader() {
            return {
              read() { return pending; },
              cancel() { window.__cancelled = true; unblock({ done: true, value: undefined }); return Promise.resolve(); },
              releaseLock() { window.__released = true; },
            };
          },
        },
      };
    })()
  `;
}

const outcomeOf = (promise) => `${promise}.then(
  (result) => ({ ok: true, result }),
  (error) => ({
    ok: false,
    name: String(error?.name || "Error"),
    code: String(error?.code || ""),
    message: String(error?.message || error),
    partial: error?.partialContent === undefined ? null : String(error.partialContent),
  })
)`;

async function runCase(body) {
  return vmw.run(`(async () => { ${body} })()`);
}

// --- A finished stream is an answer ------------------------------------------

{
  const outcome = await runCase(`
    const response = ${bodySource([
      sse({ ai_system6_status: "searching" }),
      sse({ choices: [{ delta: { content: "complete " } }] }),
      sse({ choices: [{ delta: { content: "answer" } }] }),
      sse({ ai_system6_result: { answer: "complete answer", citations: [{ url: "https://example.com" }] } }),
      sse({ type: "done" }),
    ])};
    const seen = { statuses: [], deltas: [], results: 0 };
    const promise = readWebSearchStream(response, {
      onStatus: (status) => seen.statuses.push(status),
      onDelta: (text) => seen.deltas.push(text),
      onResult: () => { seen.results += 1; },
    });
    const settled = await ${outcomeOf("promise")};
    return { settled, seen };
  `);
  test.assert(outcome.settled.ok === true, "a stream with its final envelope resolves");
  test.assert(
    outcome.settled.result?.answer === "complete answer"
      && outcome.settled.result?.citations?.[0]?.url === "https://example.com",
    "the resolved value is the final envelope, with its citations"
  );
  test.assert(
    outcome.seen.results === 1 && outcome.seen.statuses.join(",") === "searching",
    "the caller is told the final result and the statuses along the way"
  );
}

// --- Early EOF is not an answer ----------------------------------------------

{
  const outcome = await runCase(`
    const response = ${bodySource([
      sse({ choices: [{ delta: { content: "partial answer" } }] }),
    ])};
    let results = 0;
    const promise = readWebSearchStream(response, { onResult: () => { results += 1; } });
    const settled = await ${outcomeOf("promise")};
    return { settled, results };
  `);
  test.assert(outcome.settled.ok === false, "a stream that ends early does not resolve as a result");
  test.assert(
    outcome.settled.code === "web_search_incomplete" && outcome.settled.name === "Error",
    "it fails with a stable code rather than pretending to be an answer"
  );
  test.assert(
    outcome.settled.partial === "partial answer",
    "the text that did arrive is carried on the failure for the reader to keep"
  );
  test.assert(outcome.results === 0, "no final result is announced for a stream that never finished");
}

// --- A done frame without the answer is still not an answer ------------------

{
  const outcome = await runCase(`
    const response = ${bodySource([
      sse({ choices: [{ delta: { content: "partial answer" } }] }),
      sse({ type: "done" }),
    ])};
    const settled = await ${outcomeOf("readWebSearchStream(response)")};
    return { settled };
  `);
  test.assert(
    outcome.settled.ok === false && outcome.settled.code === "web_search_incomplete",
    "a terminator without the final envelope is an incomplete stream, not an empty answer"
  );
}

// --- A final envelope that arrives last wins ---------------------------------

{
  const outcome = await runCase(`
    const response = ${bodySource([
      sse({ choices: [{ delta: { content: "streamed text" } }] }),
      sse({ ai_system6_result: { answer: "streamed text", citations: [], searchCalls: [] } }),
    ])};
    const settled = await ${outcomeOf("readWebSearchStream(response)")};
    return { settled };
  `);
  test.assert(
    outcome.settled.ok === true && outcome.settled.result?.answer === "streamed text",
    "a stream that ends right after its final envelope is complete, not a failure"
  );
}

// --- Damage and truncation are told apart ------------------------------------

{
  const outcome = await runCase(`
    const response = ${bodySource([
      sse({ choices: [{ delta: { content: "partial answer" } }] }),
      'data: {"choices":[{"delta":{"content":"broken"}]}\n\n',
    ])};
    const settled = await ${outcomeOf("readWebSearchStream(response)")};
    return { settled };
  `);
  test.assert(
    outcome.settled.ok === false && outcome.settled.code === "web_search_invalid_event",
    "a complete event whose JSON is broken is reported as a damaged event"
  );
  test.assert(
    outcome.settled.partial === "partial answer",
    "the text received before the damaged event is preserved"
  );
}

{
  const outcome = await runCase(`
    const response = ${bodySource([
      sse({ choices: [{ delta: { content: "partial answer" } }] }),
      'data: {"choices":[{"delta":{"content":"cut',
    ])};
    const settled = await ${outcomeOf("readWebSearchStream(response)")};
    return { settled };
  `);
  test.assert(
    outcome.settled.ok === false && outcome.settled.code === "web_search_incomplete",
    "a frame cut off at EOF is a truncated stream, not a damaged complete event"
  );
  test.assert(outcome.settled.partial === "partial answer", "the earlier text survives the truncation");
}

// --- Heartbeats, CRLF and unknown fields are not damage ----------------------

{
  const outcome = await runCase(`
    const response = ${bodySource([
      ": keep-alive\\n\\n",
      "\n",
      'data: {"ai_system6_status":"searching"}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"回答"}}],"unknown_field":{"a":1}}\r\n\r\n',
      'data: {"ai_system6_result":{"answer":"回答","citations":[],"searchCalls":[]}}\r\n\r\n',
      "data: [DONE]\r\n\r\n",
    ])};
    const statuses = [];
    const settled = await ${outcomeOf("readWebSearchStream(response, { onStatus: (status) => statuses.push(status) })")};
    return { settled, statuses };
  `);
  test.assert(
    outcome.settled.ok === true && outcome.settled.result?.answer === "回答",
    "comment frames, CRLF separators and unknown fields are ignored, not treated as damage"
  );
  test.assert(outcome.statuses.join(",") === "searching", "the status event is still delivered");
}

// --- A multi-byte character split across two network reads -------------------

{
  const text = "上海今天多云。";
  const frames = [
    sse({ choices: [{ delta: { content: text } }] }),
    sse({ ai_system6_result: { answer: text, citations: [], searchCalls: [] } }),
  ].join("");
  const bytes = Array.from(encoder.encode(frames));
  // The cut goes through the middle of the first CJK character: its three
  // bytes are split across two reads, which is what a network does.
  const cut = encoder.encode(frames.slice(0, frames.indexOf(text))).length + 1;
  const outcome = await runCase(`
    const parts = ${JSON.stringify([Array.from(bytes.slice(0, cut)), Array.from(bytes.slice(cut, cut + 1)), Array.from(bytes.slice(cut + 1))])}
      .map((part) => new Uint8Array(part));
    let index = 0;
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => "text/event-stream" },
      body: { getReader() { return {
        async read() {
          if (index >= parts.length) return { done: true, value: undefined };
          return { done: false, value: parts[index++] };
        },
        cancel() { return Promise.resolve(); },
        releaseLock() {},
      }; } },
    };
    const deltas = [];
    const settled = await ${outcomeOf("readWebSearchStream(response, { onDelta: (text) => deltas.push(text) })")};
    return { settled, last: deltas.at(-1) || "" };
  `);
  test.assert(
    outcome.settled.ok === true && outcome.settled.result?.answer === text,
    "a UTF-8 character split across two reads is decoded whole"
  );
  test.assert(outcome.last === text, "the preview shows the decoded character, not a replacement glyph");
}

// --- The server's own error event --------------------------------------------

{
  const outcome = await runCase(`
    const response = ${bodySource([
      sse({ choices: [{ delta: { content: "partial answer" } }] }),
      sse({ ai_system6_error: { error: "The web search timed out.", code: "web_search_timeout", detail: "The web search timed out." } }),
      sse({ type: "done" }),
    ])};
    const settled = await ${outcomeOf("readWebSearchStream(response)")};
    return { settled };
  `);
  test.assert(
    outcome.settled.ok === false && outcome.settled.code === "web_search_timeout",
    "a server error event fails the call with the server's own code"
  );
  test.assert(
    outcome.settled.partial === "partial answer",
    "the text received before the server's error is preserved too"
  );
}

// --- Cancellation wakes a read that is still waiting -------------------------

{
  const outcome = await runCase(`
    const response = ${hangingBodySource()};
    const controller = new AbortController();
    const promise = readWebSearchStream(response, { signal: controller.signal });
    controller.abort();
    // A reader that never wakes is the failure this case exists for, so the
    // wait is bounded rather than left to hang the run.
    let settled = null;
    promise.then(
      (result) => { settled = { ok: true, result }; },
      (error) => { settled = {
        ok: false,
        name: String(error?.name || "Error"),
        code: String(error?.code || ""),
        message: String(error?.message || error),
        partial: error?.partialContent === undefined ? null : String(error.partialContent),
      }; }
    );
    for (let spin = 0; spin < 2000 && !settled; spin += 1) await Promise.resolve();
    return {
      settled: settled || { ok: false, name: "Timeout", code: "", message: "the reader never woke", partial: null },
      cancelled: window.__cancelled,
      released: window.__released,
    };
  `);
  test.assert(
    outcome.settled.ok === false && outcome.settled.name === "AbortError",
    "cancelling the search wakes the pending read instead of hanging on the socket"
  );
  test.assert(outcome.cancelled === true, "the reader is cancelled, not left holding the response");
  test.assert(outcome.released === true, "the reader lock is released on the way out");
}

// --- A real caller does not report the incomplete text as a finished reply ----

{
  const outcome = await runCase(`
    window.AISystem6Capabilities = {
      requestService: async () => (${bodySource([
        sse({ choices: [{ delta: { content: "partial answer" } }] }),
      ])}),
    };
    const settled = await ${outcomeOf('runClioTalkWebSearch("question", null, {})')};
    return { settled };
  `);
  test.assert(
    outcome.settled.ok === false,
    "ClioTalk's own web-search caller fails instead of returning the partial text as a reply"
  );
  test.assert(
    outcome.settled.partial === "partial answer",
    "and it still carries the text on screen, marked as the part that arrived"
  );
}

test.finish();
