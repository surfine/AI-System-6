// DeepSeek Responses API web_search client for Searcher's online-answer
// provider. The Responses API executes web_search server-side; the model then
// writes a cited answer grounded in those results. We pin the official
// DeepSeek endpoint (the Responses API has no alternate base URL) and the
// v4-flash model, which is currently the only Responses-capable model.

"use strict";

const { postJsonWithFallback } = require("./lib/fetch.js");
const { siteFromUrl } = require("./lib/url.js");
const { cloudAuthHeaders, DEEPSEEK_PUBLIC_BASE_URL, resolveCloudTarget } = require("./cloud.js");
const { cloudUpstreamWarning, responsesEffortForTask } = require("./responses.js");

const DEEPSEEK_RESPONSES_URL = `${DEEPSEEK_PUBLIC_BASE_URL}/responses`;

// Answer text stays tight so shared-cloud web searches cannot burn the whole
// daily budget in one request. Operators may raise or lower the cap.
const WEB_SEARCH_MAX_OUTPUT_TOKENS = Math.max(
  200,
  Math.min(4000, Number(process.env.AI_SYSTEM6_WEB_SEARCH_MAX_OUTPUT_TOKENS || 800))
);
const WEB_SEARCH_QUERY_MAX_LENGTH = 400;

const WEB_SEARCH_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

// Searcher's plain answer mode, Review Desk's claim-verification mode, and
// ClioTalk's companion mode share one web_search call; only the system
// instructions differ. The mode list is whitelisted server-side so the
// browser can never inject arbitrary prompts.
const WEB_SEARCH_MODES = new Set(["answer", "claim", "clio"]);

// Claim mode asks the Responses API for schema-enforced JSON instead of a
// free-text verdict, so the browser never has to parse wording. DeepSeek
// accepts the OpenAI `text.format` json_schema shape.
const CLAIM_VERDICT_SCHEMA = {
  type: "object",
  required: ["conclusion", "basis", "sources"],
  properties: {
    conclusion: {
      type: "string",
      enum: [
        "supported",
        "possible_contradiction",
        "evidence_insufficient",
        "partially_supported",
        "needs_manual_review",
      ],
    },
    basis: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
  },
};

/**
 * System instructions for each web-search mode. Claim mode mirrors the
 * json_schema fields so the model fills them faithfully.
 *
 * @param {string} mode
 * @returns {string}
 */
function webSearchInstructions(mode = "answer") {
  if (mode === "claim") {
    return [
      "你是 AI System 6 审校台的事实核验助手。",
      "基于本次 web_search 返回的真实结果，核实下面这条陈述是否与可查证的事实一致。",
      "只依据搜索结果，不凭记忆补证据；查不到就把 conclusion 设为 evidence_insufficient。",
      "conclusion 取值：supported（搜索结果支持）、possible_contradiction（搜索结果与陈述矛盾）、evidence_insufficient（证据不足）、partially_supported（部分支持）、needs_manual_review（无法自动判断）。",
      "basis 用与陈述相同的语言写 1-2 句，引用搜索到的具体信息。",
      "sources 给出你参考的 URL 数组；没有参考来源就返回空数组。",
    ].join("\n");
  }
  if (mode === "clio") {
    return [
      "你是 AI System 6 中 ClioTalk 的联网回答助手：一个平静的写作伙伴。",
      "基于本次 web_search 返回的真实结果，用用户使用的语言给出简洁、可核验的回答（3-6 句），语气低压力。",
      "只陈述搜索结果中的信息，不编造细节；提到关键事实时标注来源 URL。",
      "如果结果不足以回答，直接说明缺少什么；不要用套话填充，不要替用户做决定。",
    ].join("\n");
  }
  return [
    "你是 AI System 6 中 Searcher 的联网回答助手。",
    "基于本次 web_search 返回的真实结果，用用户使用的语言给出简洁、可核验的回答（3-6 句）。",
    "只陈述搜索结果中的信息，不编造细节；在提到关键事实时标注来源 URL。",
    "如果结果不足以回答，直接说明缺少什么，不要用套话填充。",
  ].join("\n");
}

/**
 * Normalize the reasoning effort for the Responses API. Anything unknown
 * falls back to "low" (a short thinking pass is useful when synthesizing a
 * grounded answer, without the cost of a long chain of thought).
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeWebSearchEffort(value) {
  const candidate = String(value || "").toLowerCase();
  return WEB_SEARCH_EFFORTS.has(candidate) ? candidate : "low";
}

/**
 * @param {{
 *   query: string,
 *   instructions?: string,
 *   effort?: string,
 *   maxOutputTokens?: number,
 *   userId?: string,
 *   structured?: boolean,
 *   searchCalls?: Array<{ type?: string, id?: string, status?: string, action?: unknown }>,
 *   stream?: boolean,
 * }} options
 * @returns {Record<string, unknown>}
 */
function buildWebSearchPayload({
  query,
  instructions = "",
  effort = "low",
  maxOutputTokens = WEB_SEARCH_MAX_OUTPUT_TOKENS,
  userId = "",
  structured = false,
  searchCalls = [],
  stream = false,
}) {
  const replayCalls = Array.isArray(searchCalls) ? searchCalls.filter((call) => call && call.type === "web_search_call") : [];
  const payload = {
    model: "deepseek-v4-flash",
    instructions: instructions || webSearchInstructions(),
    input: replayCalls.length
      ? [
          ...replayCalls.map((call) => ({ ...call })),
          { type: "message", role: "user", content: String(query || "") },
        ]
      : String(query || ""),
    // Pin the dated tool so an upstream revision cannot silently change how
    // Searcher's sources are gathered.
    tools: [{ type: "web_search_2025_08_26" }],
    tool_choice: { type: "web_search" },
    reasoning: { effort: normalizeWebSearchEffort(effort) },
    text: structured
      ? {
          format: {
            type: "json_schema",
            name: "claim_verdict",
            schema: CLAIM_VERDICT_SCHEMA,
          },
        }
      : { format: { type: "text" } },
    stream,
    max_output_tokens: maxOutputTokens,
  };
  if (userId) payload.user = userId;
  return payload;
}

function normalizeUsage(usage) {
  return {
    input_tokens: Number(usage?.input_tokens || 0),
    cached_tokens: Number(usage?.input_tokens_details?.cached_tokens || 0),
    output_tokens: Number(usage?.output_tokens || 0),
    reasoning_tokens: Number(usage?.output_tokens_details?.reasoning_tokens || 0),
    total_tokens: Number(usage?.total_tokens || 0),
  };
}

function dedupeByUrl(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = String(item.url || "").replace(/#.*$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/**
 * Extract markdown links from answer text. Live probes show DeepSeek returns
 * citations as inline `[title](url)` links rather than url_citation
 * annotations, so this is the primary citation source for answer/clio modes.
 *
 * @param {string} text
 * @returns {Array<{ url: string, title: string }>}
 */
function extractInlineCitations(text) {
  const citations = [];
  const seen = new Set();
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match = null;
  while ((match = pattern.exec(String(text || "")))) {
    const url = String(match[2] || "").replace(/#.*$/, "");
    const key = url.toLowerCase();
    if (!url || seen.has(key)) continue;
    seen.add(key);
    citations.push({
      url,
      title: String(match[1] || siteFromUrl(url) || url).trim(),
    });
  }
  return citations;
}

/**
 * Parse a non-streaming Responses API payload into the Searcher shape:
 * answer text, cited sources, and the raw search results. Claim mode also
 * decodes the schema-enforced verdict JSON when the model honors text.format.
 *
 * @param {any} data
 * @param {string} [mode]
 * @returns {{
 *   answer: string,
 *   verdict: { conclusion: string, basis: string, sources: string[] } | null,
 *   citations: Array<{ url: string, title: string }>,
 *   results: Array<{ title: string, url: string, snippet: string, site: string }>,
 *   searchCalls: Array<{ type: string, id: string, status: string, action: unknown }>,
 *   usage: ReturnType<typeof normalizeUsage>,
 * }}
 */
function parseWebSearchResponse(data, mode = "answer") {
  const output = Array.isArray(data?.output) ? data.output : [];
  let rawAnswer = "";
  const citations = [];
  const seenCitationUrls = new Set();
  const results = [];
  const searchCalls = [];

  for (const item of output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block?.type !== "output_text") continue;
        rawAnswer = String(block.text || "");
        for (const annotation of Array.isArray(block.annotations) ? block.annotations : []) {
          if (annotation?.type !== "url_citation" || !annotation.url) continue;
          const url = String(annotation.url || "");
          const key = url.replace(/#.*$/, "");
          if (seenCitationUrls.has(key)) continue;
          seenCitationUrls.add(key);
          citations.push({
            url,
            title: String(annotation.title || siteFromUrl(url) || url),
          });
        }
      }
    }
    if (item?.type !== "web_search_call") continue;
    searchCalls.push({
      type: item.type,
      id: String(item.id || ""),
      status: String(item.status || "completed"),
      action: item.action || null,
    });
    const callResults = item?.output?.results;
    if (!Array.isArray(callResults)) continue;
    for (const result of callResults) {
      const url = String(result?.url || "");
      if (!url) continue;
      results.push({
        title: String(result?.name || result?.title || siteFromUrl(url) || url),
        url,
        snippet: String(result?.snippet || result?.content || ""),
        site: String(result?.source || siteFromUrl(url) || ""),
      });
    }
  }

  const uniqueResults = dedupeByUrl(results).slice(0, 12);
  const citationUrls = new Set(citations.map((item) => item.url.replace(/#.*$/, "").toLowerCase()));
  // Cited sources stay first; the remaining search results follow behind them.
  const orderedResults = [
    ...citations.map((citation) => {
      const match = uniqueResults.find(
        (result) => result.url.replace(/#.*$/, "").toLowerCase() === citation.url.replace(/#.*$/, "").toLowerCase()
      );
      return match || { title: citation.title, url: citation.url, snippet: "", site: siteFromUrl(citation.url) || "" };
    }),
    ...uniqueResults.filter(
      (result) => !citationUrls.has(result.url.replace(/#.*$/, "").toLowerCase())
    ),
  ];

  const normalizedAnswer = String(rawAnswer || "").trim();
  let verdict = null;
  if (mode === "claim") {
    let parsed = null;
    try {
      parsed = JSON.parse(normalizedAnswer);
    } catch {
      const match = normalizedAnswer.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }
    if (parsed && typeof parsed === "object") {
      const conclusion = String(parsed.conclusion || "");
      if (conclusion) {
        verdict = {
          conclusion,
          basis: String(parsed.basis || ""),
          sources: Array.isArray(parsed.sources)
            ? parsed.sources.map((url) => String(url || "")).filter(Boolean)
            : [],
        };
      }
    }
  }

  const displayAnswer = verdict ? verdict.basis || normalizedAnswer : normalizedAnswer;
  const mergedCitations = [...citations];
  const seenMerged = new Set(mergedCitations.map((item) => item.url.replace(/#.*$/, "").toLowerCase()));
  for (const inline of extractInlineCitations(displayAnswer)) {
    const key = inline.url.toLowerCase();
    if (seenMerged.has(key)) continue;
    seenMerged.add(key);
    mergedCitations.push(inline);
  }
  if (verdict) {
    for (const url of verdict.sources) {
      const key = url.replace(/#.*$/, "").toLowerCase();
      if (seenMerged.has(key)) continue;
      seenMerged.add(key);
      mergedCitations.push({ url, title: siteFromUrl(url) || url });
    }
  }

  return {
    answer: displayAnswer,
    verdict,
    citations: mergedCitations,
    results: orderedResults,
    searchCalls,
    usage: normalizeUsage(data?.usage),
  };
}

/**
 * The Responses API ran out of output budget before it wrote the answer. It
 * reports this as a successful `incomplete` response whose output array holds
 * reasoning and search calls but no message, which reads downstream as "the
 * search found nothing" — a different problem with a different fix.
 *
 * @param {any} data
 * @returns {boolean}
 */
function isBudgetStarvedResponse(data) {
  return String(data?.status || "") === "incomplete"
    && String(data?.incomplete_details?.reason || "") === "max_output_tokens";
}

/**
 * @returns {Error & { statusCode?: number, code?: string, warning?: string }}
 */
function webSearchBudgetError() {
  const error = /** @type {Error & { statusCode?: number, code?: string, warning?: string }} */ (
    new Error("Web search used its whole output budget before answering")
  );
  error.statusCode = 502;
  error.code = "web_search_budget_exhausted";
  error.warning = "这次联网搜索的额度在写出答案前就用完了。请把问题问得更具体一些，或稍后重试。";
  return error;
}

function webSearchUpstreamError(status, text, data) {
  const errorObj = data?.error;
  const detail = data?.detail
    || (typeof errorObj === "string" ? errorObj : errorObj?.message)
    || text
    || `HTTP ${status}`;
  const warning = cloudUpstreamWarning(status);
  const error = /** @type {Error & { statusCode?: number, code?: string, detail?: string, warning?: string }} */ (
    new Error(warning ? `${warning}（${detail}）` : detail)
  );
  error.statusCode = status || 502;
  error.code = String(data?.code || "web_search_upstream_error");
  error.detail = detail;
  if (warning) error.warning = warning;
  return error;
}

/**
 * POST a web-search payload and return the parsed JSON response, throwing
 * normalized errors on any upstream failure. Shared by the buffered and
 * streaming callers.
 *
 * @param {Record<string, unknown>} payload
 * @param {AbortSignal | null | undefined} signal
 * @param {string} apiKey
 * @param {number} [maxBytes]
 * @returns {Promise<any>}
 */
async function postWebSearchRequest(payload, signal, apiKey, maxBytes = 16 * 1024 * 1024, onRequest = undefined) {
  const cloudTarget = await resolveCloudTarget(DEEPSEEK_PUBLIC_BASE_URL);
  const { response } = await postJsonWithFallback(
    DEEPSEEK_RESPONSES_URL,
    payload,
    signal,
    cloudAuthHeaders(apiKey),
    {
      maxBytes,
      pinnedAddress: cloudTarget.address,
      pinnedFamily: cloudTarget.family,
      onRequest,
    }
  );
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json";

  if (!contentType.includes("application/json")) {
    const isAuthError = /auth|key|unauthorized|authentica/i.test(text);
    const status = isAuthError ? 401 : (response.ok ? 502 : response.status);
    throw webSearchUpstreamError(status, text, {
      code: isAuthError ? "cloud_auth_failed" : "web_search_upstream_failed",
      error: text.substring(0, 1000) || `HTTP ${response.status}`,
    });
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw webSearchUpstreamError(502, "Web search returned unreadable JSON", {});
  }

  if (!response.ok) throw webSearchUpstreamError(response.status, text, data);
  return data;
}

/**
 * Call the DeepSeek Responses API with the web_search tool and return a
 * normalized answer. Throws errors carrying `statusCode` / `code` / `detail`
 * so route handlers can forward them consistently.
 *
 * @param {{
 *   apiKey: string,
 *   query: string,
 *   signal?: AbortSignal | null,
 *   mode?: string,
 *   maxOutputTokens?: number,
 *   userId?: string,
 *   searchCalls?: Array<{ type?: string, id?: string, status?: string, action?: unknown }>,
 *   onRequest?: () => void,
 * }} options
 * @returns {Promise<{
 *   answer: string,
 *   verdict: { conclusion: string, basis: string, sources: string[] } | null,
 *   citations: Array<{ url: string, title: string }>,
 *   results: Array<{ title: string, url: string, snippet: string, site: string }>,
 *   searchCalls: Array<{ type: string, id: string, status: string, action: unknown }>,
 *   usage: ReturnType<typeof normalizeUsage>,
 * }>}
 */
async function callWebSearchAnswer({
  apiKey,
  query,
  signal,
  mode = "answer",
  maxOutputTokens = WEB_SEARCH_MAX_OUTPUT_TOKENS,
  userId = "",
  searchCalls = [],
  onRequest,
}) {
  const normalizedMode = WEB_SEARCH_MODES.has(String(mode || "answer")) ? String(mode) : "answer";
  // Reasoning effort is a server-side policy keyed by task type; callers can
  // never pick it, so instant answers stay fast and claim checks get a light
  // thinking pass.
  const effort = responsesEffortForTask(
    normalizedMode === "claim" ? "claim" : normalizedMode === "clio" ? "clio" : "answer"
  );
  const payload = buildWebSearchPayload({
    query,
    instructions: webSearchInstructions(normalizedMode),
    effort,
    maxOutputTokens,
    userId,
    structured: normalizedMode === "claim",
    searchCalls,
  });
  const data = await postWebSearchRequest(payload, signal, apiKey, 16 * 1024 * 1024, onRequest);
  const parsed = parseWebSearchResponse(data, normalizedMode);
  if (isBudgetStarvedResponse(data) && !parsed.answer && !parsed.verdict) {
    throw webSearchBudgetError();
  }
  if (!parsed.answer && !parsed.verdict && !parsed.results.length) {
    throw webSearchUpstreamError(502, "Web search returned no readable answer", {
      code: "web_search_empty",
      error: "Web search returned no readable answer",
    });
  }
  return parsed;
}

/**
 * Stream a web-search answer from the Responses API. Calls `onStatus` for
 * search lifecycle states, `onDelta` with accumulated answer text, and
 * `onDone` with the normalized envelope parsed from the final response event.
 *
 * @param {{
 *   apiKey: string,
 *   query: string,
 *   signal?: AbortSignal | null,
 *   mode?: string,
 *   maxOutputTokens?: number,
 *   userId?: string,
 *   searchCalls?: Array<{ type?: string, id?: string, status?: string, action?: unknown }>,
 *   onStatus?: (status: string) => void,
 *   onDelta?: (content: string) => void,
 *   onDone?: (result: ReturnType<typeof parseWebSearchResponse>) => void,
 *   onRequest?: () => void,
 * }} options
 * @returns {Promise<ReturnType<typeof parseWebSearchResponse> | null>}
 */
async function callWebSearchAnswerStream({
  apiKey,
  query,
  signal,
  mode = "answer",
  maxOutputTokens = WEB_SEARCH_MAX_OUTPUT_TOKENS,
  userId = "",
  searchCalls = [],
  onStatus,
  onDelta,
  onDone,
  onRequest,
}) {
  const normalizedMode = WEB_SEARCH_MODES.has(String(mode || "answer")) ? String(mode) : "answer";
  const effort = responsesEffortForTask(
    normalizedMode === "claim" ? "claim" : normalizedMode === "clio" ? "clio" : "answer"
  );
  const payload = buildWebSearchPayload({
    query,
    instructions: webSearchInstructions(normalizedMode),
    effort,
    maxOutputTokens,
    userId,
    structured: normalizedMode === "claim",
    searchCalls,
    stream: true,
  });
  const cloudTarget = await resolveCloudTarget(DEEPSEEK_PUBLIC_BASE_URL);
  const { response } = await postJsonWithFallback(
    DEEPSEEK_RESPONSES_URL,
    payload,
    signal,
    cloudAuthHeaders(apiKey),
    {
      maxBytes: 32 * 1024 * 1024,
      streamResponse: true,
      pinnedAddress: cloudTarget.address,
      pinnedFamily: cloudTarget.family,
      onRequest,
    }
  );
  if (!response.ok) {
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "text/event-stream";
    if (!contentType.includes("application/json")) {
      const isAuthError = /auth|key|unauthorized|authentica/i.test(text);
      throw webSearchUpstreamError(isAuthError ? 401 : response.status, text, {
        code: isAuthError ? "cloud_auth_failed" : "web_search_upstream_failed",
        error: text.substring(0, 1000) || `HTTP ${response.status}`,
      });
    }
    let data = {};
    try { data = JSON.parse(text); } catch {}
    throw webSearchUpstreamError(response.status, text, data);
  }

  if (!response.body) {
    throw webSearchUpstreamError(502, "Web search stream returned no body", {});
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;
  let totalBytes = 0;

  const consumeEvent = (eventText) => {
    const dataLine = String(eventText || "").split(/\r?\n/).find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    const raw = String(dataLine).slice(5).trim();
    if (!raw) return;
    let event = null;
    try { event = JSON.parse(raw); } catch { return; }
    const type = String(event?.type || "");
    if (/^response\.web_search_call\.(in_progress|searching)$/.test(type)) {
      onStatus?.("searching");
    } else if (type === "response.web_search_call.completed") {
      onStatus?.("completed");
    } else if (type === "response.output_text.delta") {
      const delta = String(event?.delta || "");
      if (delta) onDelta?.(delta);
    } else if (type === "response.completed" || type === "response.incomplete") {
      const parsed = parseWebSearchResponse(event?.response, normalizedMode);
      if (isBudgetStarvedResponse(event?.response) && !parsed.answer && !parsed.verdict) {
        throw webSearchBudgetError();
      }
      finalResult = parsed;
      onDone?.(finalResult);
    } else if (type === "response.failed") {
      const detail = event?.response?.error?.message || event?.response?.error || "Web search stream failed";
      throw webSearchUpstreamError(502, detail, { code: "web_search_stream_failed", error: detail });
    }
  };

  try {
    for await (const chunk of response.body) {
      totalBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : String(chunk || "").length;
      if (totalBytes > 32 * 1024 * 1024) {
        throw webSearchUpstreamError(502, "Web search stream exceeded the size limit", {
          code: "web_search_stream_too_large",
          error: "Web search stream exceeded the size limit",
        });
      }
      buffer += decoder.decode(chunk, { stream: true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const eventText = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + (buffer[boundary] === "\r" ? 4 : 2));
        consumeEvent(eventText);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeEvent(buffer);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw error;
  }

  if (!finalResult) {
    throw webSearchUpstreamError(502, "Web search stream ended without a completed response", {
      code: "web_search_stream_incomplete",
      error: "Web search stream ended without a completed response",
    });
  }
  return finalResult;
}

module.exports = {
  CLAIM_VERDICT_SCHEMA,
  WEB_SEARCH_EFFORTS,
  WEB_SEARCH_MAX_OUTPUT_TOKENS,
  WEB_SEARCH_MODES,
  WEB_SEARCH_QUERY_MAX_LENGTH,
  buildWebSearchPayload,
  callWebSearchAnswer,
  callWebSearchAnswerStream,
  normalizeWebSearchEffort,
  parseWebSearchResponse,
};
