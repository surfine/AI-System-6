import { createServer } from "node:http";

/**
 * Local fake OpenAI-compatible model service for E2E tests.
 *
 * Speaks the LM Studio wire shape the browser client expects:
 *   GET  /api/v1/models            -> model inventory
 *   POST /api/v1/chat              -> native v1 JSON or named SSE events
 *   POST /v1/responses             -> stateful Responses JSON
 *   POST /v1/chat/completions      -> JSON or SSE stream, per scenario
 *   POST /v1/embeddings            -> fixed embedding vector
 *
 * Scenarios (switch with setFakeModelScenario):
 *   json        normal JSON completion
 *   stream      normal SSE completion
 *   cutoff      stream starts then the socket dies mid-frame
 *   timeout     request hangs without a response
 *   rate-limit  HTTP 429 with an OpenAI-shaped error body
 *   server-error HTTP 500 with an error body
 *   invalid     HTTP 200 with a non-JSON body
 *   empty       JSON response without assistant content
 */

export const FAKE_MODEL_PORT = 12934;
export const FAKE_MODEL_ID = "fake-model-7b";

// Outline text must pass validateGeneratedWritingOutline: only ## sections,
// no work-list headings or lines, no deep nesting, at most 7 sections.
const outlineText =
  "## 背景\n这一段先交代读者为什么会关心这个问题，以及它和上一节讨论的关系。\n\n## 论点\n这里给出作者的判断，并保留一个具体的例子来说明判断的依据。\n\n## 落点\n用一句自然的话收住，为下一节留下可以接上的入口。";

// Section draft text must pass validateSectionDraftContent: spoken prose,
// paragraphs over 40 characters, fewer than four bullet lines, and none of
// the forbidden selling-point/template words.
const draftProse =
  "这一节先把读者真正在意的问题摆出来：为什么这件事现在值得认真写。作者保留了自己的判断，也保留了原始的犹豫和具体例子，而不是把一切推给一个通用结论。写稿时先给出现场的细节，再说明它和上一节的关系，最后留一个自然的落点，让下一节能够接上。";

const defaultChatText = outlineText;

function chatCompletionsJson(text = defaultChatText) {
  return {
    id: "chatcmpl-fake",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: FAKE_MODEL_ID,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 24, completion_tokens: 42, total_tokens: 66 },
  };
}

function sseChunks(text) {
  const chunks = [];
  const step = Math.max(1, Math.ceil(text.length / 5));
  for (let index = 0; index < text.length; index += step) {
    const piece = text.slice(index, index + step);
    chunks.push(
      `data: ${JSON.stringify({
        id: "chatcmpl-fake",
        object: "chat.completion.chunk",
        model: FAKE_MODEL_ID,
        choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
      })}\n\n`
    );
  }
  chunks.push(
    `data: ${JSON.stringify({
      id: "chatcmpl-fake",
      object: "chat.completion.chunk",
      model: FAKE_MODEL_ID,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 24, completion_tokens: 42, total_tokens: 66 },
    })}\n\n`,
    "data: [DONE]\n\n"
  );
  return chunks;
}

function readRequestBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

export function createFakeModelServer() {
  const state = {
    scenario: "stream",
    chatCalls: 0,
    nativeChatCalls: 0,
    responsesCalls: 0,
    modelsCalls: 0,
    embeddingsCalls: 0,
  };

  const sendJson = (response, status, body) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/models") {
      state.modelsCalls += 1;
      sendJson(response, 200, {
        object: "list",
        models: [
          {
            key: FAKE_MODEL_ID,
            display_name: "Fake Model 7B",
            object: "model",
            type: "llm",
            max_context_length: 8192,
            owned_by: "ai-system-6-e2e",
            loaded_instances: [
              { id: "instance-1", config: { context_length: 8192 } },
            ],
          },
          {
            key: "fake-embedding",
            display_name: "Fake Embedding",
            object: "model",
            type: "embedding",
            owned_by: "ai-system-6-e2e",
            loaded_instances: [
              { id: "instance-2", config: { context_length: 512 } },
            ],
          },
        ],
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/embeddings") {
      state.embeddingsCalls += 1;
      sendJson(response, 200, {
        object: "list",
        data: [
          {
            object: "embedding",
            index: 0,
            embedding: Array.from({ length: 16 }, (_, index) => (index + 1) / 16),
          },
        ],
        model: "fake-embedding",
        usage: { prompt_tokens: 4, total_tokens: 4 },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/chat") {
      state.nativeChatCalls += 1;
      const body = await readRequestBody(request);
      state.lastNativeBody = body;
      const responseId = `resp_fake_${state.nativeChatCalls}`;
      const result = {
        model_instance_id: FAKE_MODEL_ID,
        output: [{ type: "message", content: defaultChatText }],
        stats: {
          input_tokens: 24,
          total_output_tokens: 42,
          reasoning_output_tokens: 0,
          tokens_per_second: 42,
          time_to_first_token_seconds: 0.01,
        },
        response_id: responseId,
      };
      if (state.scenario === "rate-limit") {
        sendJson(response, 429, { error: { message: "Fake model rate limit reached.", type: "rate_limit" } });
        return;
      }
      if (state.scenario === "server-error") {
        sendJson(response, 500, { error: { message: "Fake model exploded.", type: "server_error" } });
        return;
      }
      if (state.scenario === "invalid") {
        response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        response.end("{not-json");
        return;
      }
      if (state.scenario === "empty") {
        result.output = [];
        sendJson(response, 200, result);
        return;
      }
      if (state.scenario === "timeout") return;
      if (state.scenario === "cutoff") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        response.write(`event: message.delta\ndata: ${JSON.stringify({ type: "message.delta", content: defaultChatText.slice(0, 12) })}\n\n`);
        setTimeout(() => response.destroy(), 120);
        return;
      }
      if (body.stream === true) {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        response.write(`event: chat.start\ndata: ${JSON.stringify({ type: "chat.start", model_instance_id: FAKE_MODEL_ID })}\n\n`);
        const step = Math.max(1, Math.ceil(defaultChatText.length / 5));
        for (let index = 0; index < defaultChatText.length; index += step) {
          response.write(`event: message.delta\ndata: ${JSON.stringify({ type: "message.delta", content: defaultChatText.slice(index, index + step) })}\n\n`);
        }
        response.write(`event: chat.end\ndata: ${JSON.stringify({ type: "chat.end", result })}\n\n`);
        response.end();
      } else {
        sendJson(response, 200, result);
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/responses") {
      state.responsesCalls += 1;
      const body = await readRequestBody(request);
      state.lastResponsesBody = body;
      if (state.scenario === "rate-limit") {
        sendJson(response, 429, { error: { message: "Fake model rate limit reached.", type: "rate_limit" } });
        return;
      }
      if (state.scenario === "server-error") {
        sendJson(response, 500, { error: { message: "Fake model exploded.", type: "server_error" } });
        return;
      }
      if (state.scenario === "invalid") {
        response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        response.end("{not-json");
        return;
      }
      if (state.scenario === "timeout") return;
      const result = {
        id: `resp_responses_${state.responsesCalls}`,
        object: "response",
        status: "completed",
        model: FAKE_MODEL_ID,
        output: [{
          id: `msg_responses_${state.responsesCalls}`,
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: defaultChatText, annotations: [] }],
        }],
        usage: { input_tokens: 24, output_tokens: 42, total_tokens: 66 },
      };
      if (state.scenario === "empty") result.output = [];
      if (state.scenario === "cutoff") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        response.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: defaultChatText.slice(0, 12) })}\n\n`);
        setTimeout(() => response.destroy(), 120);
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      state.chatCalls += 1;
      const body = await readRequestBody(request);
      const wantsStream = body.stream === true || body.stream === "true";
      const scenario = state.scenario;
      const taskKind = String(body.ai_system6_task_kind || "");
      state.lastTaskKind = taskKind;
      state.lastTaskCount = state.chatCalls;
      const userText = (Array.isArray(body.messages) ? body.messages : [])
        .filter((message) => message?.role === "user")
        .map((message) => String(message?.content || ""))
        .join("\n");
      // The client strips ai_system6_task_kind before sending, so the prompt
      // markers distinguish the task: section drafts carry a CURRENT SECTION
      // block; outline generation carries EXISTING OUTLINE / USER QUESTIONS.
      const isSectionDraft = /CURRENT SECTION|SECTION OUTLINE|章节草稿/i.test(userText);
      const responseText = isSectionDraft ? draftProse : outlineText;

      if (scenario === "rate-limit") {
        sendJson(response, 429, {
          error: { message: "Fake model rate limit reached.", type: "rate_limit", code: "rate_limit" },
        });
        return;
      }
      if (scenario === "server-error") {
        sendJson(response, 500, {
          error: { message: "Fake model exploded.", type: "server_error", code: "server_error" },
        });
        return;
      }
      if (scenario === "invalid") {
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        response.end("{not-json");
        return;
      }
      if (scenario === "empty") {
        sendJson(response, 200, {
          id: "chatcmpl-fake",
          object: "chat.completion",
          model: FAKE_MODEL_ID,
          choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 4, completion_tokens: 0, total_tokens: 4 },
        });
        return;
      }
      if (scenario === "timeout") {
        // Intentionally never respond; the client's own timeout must fire.
        return;
      }
      if (scenario === "cutoff") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        response.write(sseChunks(responseText).slice(0, 2).join(""));
        setTimeout(() => response.destroy(), 120);
        return;
      }

      // json / stream
      if (wantsStream) {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        for (const chunk of sseChunks(responseText)) {
          response.write(chunk);
        }
        response.end();
        return;
      }
      sendJson(response, 200, chatCompletionsJson(responseText));
      return;
    }

    sendJson(response, 404, { error: { message: `fake model: no route ${request.method} ${url.pathname}` } });
  });

  return {
    state,
    setScenario(scenario) {
      state.scenario = scenario;
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        // Bind an ephemeral port so a leftover fake server can never collide
        // with the next run; tests connect with the returned port.
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          resolve(address && typeof address === "object" ? address.port : FAKE_MODEL_PORT);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
