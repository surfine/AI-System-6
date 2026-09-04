// POST /api/endfield/ask
//
// RAG-style question answering over the Endfield archive. Runs the
// keyword search to gather candidate evidence, packs it into a
// strict-citation system prompt, then forwards the assembled chat
// payload to either the cloud model (when the client opts in) or
// the local LM Studio path with autoload-on-failure.
//
// Behavior parity with root server.js's `askEndfieldStories`:
// - Empty query returns 400 { error: "Missing query" }.
// - Empty-results path returns 200 with a Chinese fallback answer
//   and the search metadata + `ai_system6_metrics`.
// - max_tokens defaults to 1200, clamps via Number.isFinite check.
// - temperature defaults to 0.25.
// - Evidence budget computed from endfieldEvidenceBudget; the
//   evidence block is truncated to evidenceChars characters.
// - System prompt is the long Chinese strict-citation prompt
//   reproduced verbatim (changes here change model behavior).
// - Non-JSON upstream -> upstream.ok ? 502 : upstream.status with
//   provider-flavored error message ("Cloud" / "Local").
// - JSON error -> upstream.status with merged data, classify code.
// - Success -> 200 with answer + matches + evidenceBudget +
//   ai_system6_metrics (elapsed_ms, finish_reason, model, provider,
//   usage, auto_loaded_model, auto_selected_model).
// - AbortError swallowed.
// - Outer 502 carries { error: "Endfield local answer failed",
//   code, detail }.

"use strict";

const { send, readJsonBody, requestSignal } = require("../lib/http.js");
const { modelContentFromChatData } = require("../chat.js");
const {
  classifyLmStudioProxyError,
  getLoadedLmStudioModelInfo,
} = require("../lmstudio.js");
const {
  findEndfieldStoryMatches,
  endfieldEvidenceBlock,
  endfieldEvidenceBudget,
  postEndfieldChatPayload,
} = require("../endfield.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleEndfieldAsk(req, res) {
  const signal = requestSignal(req, res);
  const startedAt = Date.now();
  /** @type {any} */
  let sharedReservation = null;

  try {
    const body = await readJsonBody(req);
    // String() on an object yields the literal "[object Object]", which then
    // searched the corpus as a term and came back as an ordinary "nothing
    // found" answer at status 200. The caller could not tell a query that was
    // not text from a query that had no match, so a wrong type is refused by
    // its type.
    if (body.query !== undefined && typeof body.query !== "string") {
      send(res, 400, JSON.stringify({
        error: "Query must be text",
        code: "invalid_query",
      }), { "Content-Type": "application/json" });
      return;
    }
    const query = String(body.query || "").trim();

    // The corpus scan used to run before this check, and an empty query
    // searched the whole story library for a stand-in term only to throw the
    // result away with a 400.
    if (!query) {
      send(res, 400, JSON.stringify({ error: "Missing query" }), { "Content-Type": "application/json" });
      return;
    }

    const limit = Math.min(Math.max(Number(body.limit || 14), 4), 28);
    const routeModel = String(
      body._cloud_active
        ? (body._cloud_model || "deepseek-v4-flash")
        : (body.model || getLoadedLmStudioModelInfo()?.model || "local-model")
    ).trim();
    const matches = await findEndfieldStoryMatches(query, limit, { progress: String(body.progress || "all") });

    if (!matches.results.length) {
      send(res, 200, JSON.stringify({
        query,
        answer: "没有在当前剧情库里找到足够相关的原文。可以换成游戏内正式名称，或缩短关键词后再试。",
        ...matches,
        ai_system6_metrics: {
          elapsed_ms: Date.now() - startedAt,
          model: routeModel,
          usage: null,
          finish_reason: "no_evidence",
        },
      }), { "Content-Type": "application/json" });
      return;
    }

    const requestedOutputTokens = Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : 1200;
    const evidenceBudget = endfieldEvidenceBudget(body, routeModel, requestedOutputTokens);
    const evidenceResults = matches.results.slice(0, evidenceBudget.resultLimit);
    const evidence = endfieldEvidenceBlock(evidenceResults).slice(0, evidenceBudget.evidenceChars);
    const payload = {
      model: routeModel,
      stream: false,
      temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.25,
      max_tokens: requestedOutputTokens,
      ai_system6_task_kind: "endfield_rag",
      messages: [
        {
          role: "system",
          content: [
            "你是《明日方舟：终末地》剧情检索终端的回答模块。",
            "只能依据用户提供的【剧情证据】回答；证据里没有的，不要说成官方事实。",
            "只输出两行，不要标题、不要列表、不要复述证据：",
            "第一行以「结论 」开头，一句话，≤80 字，句中每个事实后紧跟证据编号，如【1】【3】。",
            "第二行以「留白 」开头，一句话，≤60 字，说明官方未直接定名、证据未收录、或可供玩家解读之处；若无留白，写「留白 无。」。",
            "人物关系除非证据直接定名，只能写「合作对象」「可信赖的协作者」等稳妥说法；合理推测要写「基于【n】的推测」。",
            "不要写「证据不足以证明」这类扫兴表述，改写为「官方未直接定名」「剧情留白」。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `用户问题：${query}`,
            "",
            "【剧情证据】",
            evidence,
            "",
            `【证据裁剪说明】当前模型上下文窗口按 ${evidenceBudget.contextLength} 估算，本次只提供最相关的 ${evidenceResults.length} 条证据片段。`,
          ].join("\n"),
        },
      ],
    };

    if (process.env.AI_SYSTEM6_ENDFIELD_DRY_RUN === "1") {
      send(res, 200, JSON.stringify({
        dryRun: true,
        messages: payload.messages,
        ...matches,
      }), { "Content-Type": "application/json" });
      return;
    }

    const { response: upstream, source, model, autoLoaded, autoLoadedModel, autoSelectedModel, reservation } =
      await postEndfieldChatPayload(payload, body, signal, req);
    sharedReservation = reservation || null;
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    if (!contentType.includes("application/json")) {
      send(res, upstream.ok ? 502 : upstream.status, JSON.stringify({
        error: `${source === "cloud" ? "Cloud" : "Local"} model request failed`,
        detail: text.substring(0, 1000) || `HTTP ${upstream.status}`,
        ...matches,
      }), { "Content-Type": "application/json" });
      return;
    }

    const data = JSON.parse(text);
    if (!upstream.ok) {
      const detail = data.detail || data.error || text || `Local model returned ${upstream.status}`;
      send(res, upstream.status, JSON.stringify({
        ...data,
        error: data.error || `${source === "cloud" ? "Cloud" : "Local"} model request failed`,
        code: data.code || classifyLmStudioProxyError(detail, upstream.status),
        detail,
        ...matches,
      }), { "Content-Type": "application/json" });
      return;
    }
    sharedReservation?.addUsage(data?.usage);

    const choice = data?.choices?.[0] || {};
    const answer = modelContentFromChatData(data).trim();
    send(res, 200, JSON.stringify({
      query,
      answer: answer || "模型返回了空回答。下面保留本地检索证据，建议换一个模型或稍后重试。",
      ...matches,
      evidenceBudget,
      ai_system6_metrics: {
        elapsed_ms: Date.now() - startedAt,
        finish_reason: choice.finish_reason || data.stop_reason || "",
        model: data.model || payload.model || model,
        provider: source,
        usage: data.usage || null,
        auto_loaded_model: autoLoaded ? autoLoadedModel || model || payload.model || "" : "",
        auto_selected_model: autoSelectedModel || "",
      },
    }), { "Content-Type": "application/json" });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const message = /** @type {Error} */ (error).message;
    const status = /** @type {any} */ (error)?.statusCode || 502;
    const headers = { "Content-Type": "application/json" };
    if (/** @type {any} */ (error)?.retryAfter > 0) {
      headers["Retry-After"] = String(/** @type {any} */ (error).retryAfter);
    }
    send(res, status, JSON.stringify({
      error: /** @type {any} */ (error)?.statusCode
        ? message
        : "Endfield local answer failed",
      code: /** @type {any} */ (error)?.code
        || classifyLmStudioProxyError(message, 502),
      detail: message,
      ...(/** @type {any} */ (error)?.warning
        ? { warning: /** @type {any} */ (error).warning }
        : {}),
    }), headers);
  } finally {
    sharedReservation?.settle();
  }
}

module.exports = { handleEndfieldAsk };
