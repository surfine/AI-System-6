// Route dispatch table. Replaces the if/else chain at the bottom of
// the root server.js. Entries are matched by exact `METHOD PATH` first,
// then by `METHOD prefix` for routes that accept query strings.
//
// Until a route is migrated into this table, a request for it returns
// a structured 404 from server.js with both `migrated` and
// `unmigrated` lists.

"use strict";

const { isPublicDeployment, publicGuestBridgeEnabled } = require("./runtime-profile.js");
const { embeddingsRelayConfig } = require("./embeddings-relay.js");

/**
 * @typedef {(
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 * ) => void | Promise<void>} RouteHandler
 */

/**
 * Create a stable route handler without loading its implementation until the
 * first matching request. The resolved function is cached for all later calls.
 *
 * @param {() => Record<string, unknown>} loadModule
 * @param {string} modulePath
 * @param {string} exportName
 * @returns {RouteHandler}
 */
function lazyHandler(loadModule, modulePath, exportName) {
  /** @type {RouteHandler | null} */
  let loaded = null;
  return async function handleLazyRoute(req, res) {
    if (!loaded) {
      const routeModule = loadModule();
      const candidate = routeModule && routeModule[exportName];
      if (typeof candidate !== "function") {
        throw new TypeError(`${modulePath} does not export ${exportName}.`);
      }
      loaded = /** @type {RouteHandler} */ (candidate);
    }
    return loaded(req, res);
  };
}

const handleHealth = lazyHandler(() => require("./routes/health.js"), "./routes/health.js", "handleHealth");
const handleReady = lazyHandler(() => require("./routes/health.js"), "./routes/health.js", "handleReady");
const handleCapabilities = lazyHandler(() => require("./routes/capabilities.js"), "./routes/capabilities.js", "handleCapabilities");
const handleTurnstileSession = lazyHandler(() => require("./routes/public-session.js"), "./routes/public-session.js", "handleTurnstileSession");
const handleSessionStatus = lazyHandler(() => require("./routes/public-session.js"), "./routes/public-session.js", "handleSessionStatus");
const handleMacSharedToken = lazyHandler(() => require("./routes/public-session.js"), "./routes/public-session.js", "handleMacSharedToken");
const handleVersion = lazyHandler(() => require("./routes/version.js"), "./routes/version.js", "handleVersion");
const handleImporterStatus = lazyHandler(() => require("./routes/importer-status.js"), "./routes/importer-status.js", "handleImporterStatus");
const handleCloudModels = lazyHandler(() => require("./routes/cloud-models.js"), "./routes/cloud-models.js", "handleCloudModels");
const handleCloudStatus = lazyHandler(() => require("./routes/cloud-status.js"), "./routes/cloud-status.js", "handleCloudStatus");
const handleCloudQuota = lazyHandler(() => require("./routes/cloud-quota.js"), "./routes/cloud-quota.js", "handleCloudQuota");
const handleCloudCredentials = lazyHandler(() => require("./routes/cloud-credentials.js"), "./routes/cloud-credentials.js", "handleCloudCredentials");
const handleCloudEmbeddings = lazyHandler(() => require("./routes/cloud-embeddings.js"), "./routes/cloud-embeddings.js", "handleCloudEmbeddings");
const handleCloudChat = lazyHandler(() => require("./routes/cloud-chat.js"), "./routes/cloud-chat.js", "handleCloudChat");
const handleCloudFilesUpload = lazyHandler(() => require("./routes/cloud-files.js"), "./routes/cloud-files.js", "handleCloudFilesUpload");
const handleCloudFilesDelete = lazyHandler(() => require("./routes/cloud-files.js"), "./routes/cloud-files.js", "handleCloudFilesDelete");
const handleEmbeddings = lazyHandler(() => require("./routes/embeddings.js"), "./routes/embeddings.js", "handleEmbeddings");
const handleModelBudget = lazyHandler(() => require("./routes/model-budget.js"), "./routes/model-budget.js", "handleModelBudget");
const handleModels = lazyHandler(() => require("./routes/models.js"), "./routes/models.js", "handleModels");
const handleModelsLoadEmbedding = lazyHandler(() => require("./routes/models-load-embedding.js"), "./routes/models-load-embedding.js", "handleModelsLoadEmbedding");
const handleModelsLoad = lazyHandler(() => require("./routes/models-load.js"), "./routes/models-load.js", "handleModelsLoad");
const handleLmStudioSetup = lazyHandler(() => require("./routes/lmstudio-setup.js"), "./routes/lmstudio-setup.js", "handleLmStudioSetup");
const handleLmStudioStart = lazyHandler(() => require("./routes/lmstudio-start.js"), "./routes/lmstudio-start.js", "handleLmStudioStart");
const handleMacSharedSessionCreate = lazyHandler(() => require("./routes/mac-shared.js"), "./routes/mac-shared.js", "handleMacSharedSessionCreate");
const handleMacSharedSessionStatus = lazyHandler(() => require("./routes/mac-shared.js"), "./routes/mac-shared.js", "handleMacSharedSessionStatus");
const handleMacSharedSessionDelete = lazyHandler(() => require("./routes/mac-shared.js"), "./routes/mac-shared.js", "handleMacSharedSessionDelete");
const handleMacSharedChat = lazyHandler(() => require("./routes/mac-shared.js"), "./routes/mac-shared.js", "handleMacSharedChat");
const handleMacSharedQuota = lazyHandler(() => require("./routes/mac-shared.js"), "./routes/mac-shared.js", "handleMacSharedQuota");
const handleChat = lazyHandler(() => require("./routes/chat.js"), "./routes/chat.js", "handleChat");
const handleDraftThesis = lazyHandler(() => require("./routes/draft-thesis.js"), "./routes/draft-thesis.js", "handleDraftThesis");
const handleBureaucracyCaptions = lazyHandler(() => require("./routes/bureaucracy-captions.js"), "./routes/bureaucracy-captions.js", "handleBureaucracyCaptions");
const handleImageGenerate = lazyHandler(() => require("./routes/image-generate.js"), "./routes/image-generate.js", "handleImageGenerate");
const handleVisionAnalyze = lazyHandler(() => require("./routes/vision-analyze.js"), "./routes/vision-analyze.js", "handleVisionAnalyze");
const handleSearch = lazyHandler(() => require("./routes/search.js"), "./routes/search.js", "handleSearch");
const handleSearchAnswer = lazyHandler(() => require("./routes/search-answer.js"), "./routes/search-answer.js", "handleSearchAnswer");
const handleReader = lazyHandler(() => require("./routes/reader.js"), "./routes/reader.js", "handleReader");
const handleTimeMachine = lazyHandler(() => require("./routes/time-machine.js"), "./routes/time-machine.js", "handleTimeMachine");
const handleEndfieldSearch = lazyHandler(() => require("./routes/endfield-search.js"), "./routes/endfield-search.js", "handleEndfieldSearch");
const handleEndfieldAsk = lazyHandler(() => require("./routes/endfield-ask.js"), "./routes/endfield-ask.js", "handleEndfieldAsk");
const handleMcp = lazyHandler(() => require("./routes/mcp.js"), "./routes/mcp.js", "handleMcp");
const handleMcpClient = lazyHandler(() => require("./routes/mcp-client.js"), "./routes/mcp-client.js", "handleMcpClient");
const handleAgentExecutorStream = lazyHandler(() => require("./routes/agent-executor.js"), "./routes/agent-executor.js", "handleAgentExecutorStream");
const handleAgentExecutorReply = lazyHandler(() => require("./routes/agent-executor.js"), "./routes/agent-executor.js", "handleAgentExecutorReply");
const handleAgentExecutorToken = lazyHandler(() => require("./routes/agent-executor.js"), "./routes/agent-executor.js", "handleAgentExecutorToken");
const handleImportText = lazyHandler(() => require("./routes/import-text.js"), "./routes/import-text.js", "handleImportText");
const handleImportOcrPages = lazyHandler(() => require("./routes/import-ocr-pages.js"), "./routes/import-ocr-pages.js", "handleImportOcrPages");
const handleSubtitlesTranslate = lazyHandler(() => require("./routes/subtitles-translate.js"), "./routes/subtitles-translate.js", "handleSubtitlesTranslate");
const handleCmfCapabilities = lazyHandler(() => require("./routes/cmf-capabilities.js"), "./routes/cmf-capabilities.js", "handleCmfCapabilities");
const handleCmfExportUsdz = lazyHandler(() => require("./routes/cmf-export-usdz.js"), "./routes/cmf-export-usdz.js", "handleCmfExportUsdz");
const handleCmfRenderViews = lazyHandler(() => require("./routes/cmf-render-views.js"), "./routes/cmf-render-views.js", "handleCmfRenderViews");
const handleCmfRenderPreview = lazyHandler(() => require("./routes/cmf-render-preview.js"), "./routes/cmf-render-preview.js", "handleCmfRenderPreview");
const handleSystemMusic = lazyHandler(() => require("./routes/system-music.js"), "./routes/system-music.js", "handleSystemMusic");
const handleGamdlJobs = lazyHandler(() => require("./routes/gamdl.js"), "./routes/gamdl.js", "handleGamdlJobs");
const handleGamdlJob = lazyHandler(() => require("./routes/gamdl.js"), "./routes/gamdl.js", "handleGamdlJob");
const handleGamdlFile = lazyHandler(() => require("./routes/gamdl.js"), "./routes/gamdl.js", "handleGamdlFile");
const handleGoRedirect = lazyHandler(() => require("./routes/go.js"), "./routes/go.js", "handleGoRedirect");

/**
 * Full local route table. Keep the literal registration pairs intact: feature
 * verification checks this file as the source of truth for desktop support.
 * @type {Map<string, RouteHandler>}
 */
const localExactRoutes = new Map([
  ["GET /healthz", handleHealth],
  ["GET /readyz", handleReady],
  ["GET /api/capabilities", handleCapabilities],
  ["POST /api/session/turnstile", handleTurnstileSession],
  ["GET /api/session/status", handleSessionStatus],
  ["POST /api/session/mac-token", handleMacSharedToken],
  ["GET /api/version", handleVersion],
  ["GET /api/importer-status", handleImporterStatus],
  ["GET /api/cloud/models", handleCloudModels],
  ["POST /api/cloud/status", handleCloudStatus],
  ["GET /api/cloud/quota", handleCloudQuota],
  ["POST /api/cloud/credentials", handleCloudCredentials],
  ["POST /api/cloud/embeddings", handleCloudEmbeddings],
  ["POST /api/cloud/chat", handleCloudChat],
  ["POST /api/cloud/files", handleCloudFilesUpload],
  ["DELETE /api/cloud/files", handleCloudFilesDelete],
  ["POST /api/embeddings", handleEmbeddings],
  ["POST /api/model-budget", handleModelBudget],
  ["GET /api/models", handleModels],
  ["POST /api/models/load-embedding", handleModelsLoadEmbedding],
  ["POST /api/models/load", handleModelsLoad],
  ["POST /api/lmstudio/setup", handleLmStudioSetup],
  ["POST /api/lmstudio/start", handleLmStudioStart],
  ["POST /api/mac-shared/session", handleMacSharedSessionCreate],
  ["GET /api/mac-shared/session", handleMacSharedSessionStatus],
  ["DELETE /api/mac-shared/session", handleMacSharedSessionDelete],
  ["POST /api/mac-shared/chat", handleMacSharedChat],
  ["GET /api/mac-shared/quota", handleMacSharedQuota],
  ["POST /api/chat", handleChat],
  ["POST /api/draft/thesis", handleDraftThesis],
  ["POST /api/bureaucracy/captions", handleBureaucracyCaptions],
  ["POST /api/image/generate", handleImageGenerate],
  ["POST /api/vision/analyze", handleVisionAnalyze],
  ["POST /api/import-text", handleImportText],
  ["POST /api/import-ocr-pages", handleImportOcrPages],
  ["POST /api/subtitles/translate", handleSubtitlesTranslate],
  ["POST /api/search/answer", handleSearchAnswer],
  // The guest bridge is loopback-only by construction: none of these three
  // keys appear in publicExactRouteKeys, so the public profile never serves
  // them. /mcp admits itself (security/mcp-admission.js); the executor pair
  // sits under /api/ and takes the ordinary browser same-origin guard.
  ["POST /mcp", handleMcp],
  ["GET /mcp", handleMcp],
  ["DELETE /mcp", handleMcp],
  ["OPTIONS /mcp", handleMcp],
  // Outbound: the desk asks an external MCP server the writer configured.
  ["POST /api/mcp/client", handleMcpClient],
  ["GET /api/agent/executor", handleAgentExecutorStream],
  ["POST /api/agent/executor/reply", handleAgentExecutorReply],
  ["POST /api/agent/executor/token", handleAgentExecutorToken],
  ["GET /api/cmf/capabilities", handleCmfCapabilities],
  ["POST /api/cmf/export-usdz", handleCmfExportUsdz],
  ["POST /api/cmf/render-views", handleCmfRenderViews],
  ["POST /api/cmf/render-preview", handleCmfRenderPreview],
  ["GET /api/music/system", handleSystemMusic],
  ["POST /api/music/system", handleSystemMusic],
  ["POST /api/music/gamdl/jobs", handleGamdlJobs],
]);

const publicExactRouteKeys = new Set([
  "GET /healthz",
  "GET /readyz",
  "GET /api/capabilities",
  "POST /api/session/turnstile",
  "GET /api/session/status",
  "POST /api/session/mac-token",
  "GET /api/version",
  "GET /api/cloud/models",
  "POST /api/cloud/status",
  "GET /api/cloud/quota",
  "POST /api/cloud/chat",
  "POST /api/cloud/files",
  "DELETE /api/cloud/files",
  // Vision was local-only, so the public profile hid it. The cloud vision
  // model gives the public deployment a real image path, guarded by the same
  // Turnstile session and shared-cloud budget as /api/cloud/chat.
  "POST /api/vision/analyze",
  "POST /api/bureaucracy/captions",
  "POST /api/subtitles/translate",
  "POST /api/search/answer",
  "POST /api/draft/thesis",
  "GET /api/cmf/capabilities",
  "POST /api/cmf/export-usdz",
  "POST /api/cmf/render-views",
  "POST /api/cmf/render-preview",
]);

// The guest bridge on the public deployment is opt-in and off by default
// (AI_SYSTEM6_PUBLIC_MCP=1). Off, none of these paths exist in public mode at
// all, so the live site answers 404 rather than 401 and nothing about it
// changes. On, /mcp admits only a signed invitation to a named desk
// (security/mcp-admission.js), and the three executor paths stay under the
// ordinary Turnstile session guard because they belong to the writer's own
// page, not to the guest.
if (publicGuestBridgeEnabled) {
  [
    "POST /mcp",
    "GET /mcp",
    "DELETE /mcp",
    "OPTIONS /mcp",
    "GET /api/agent/executor",
    "POST /api/agent/executor/reply",
    "POST /api/agent/executor/token",
  ].forEach((key) => publicExactRouteKeys.add(key));
}

// The public deployment has no provider that can embed, so this route was
// local-only and the web build fell back to a model in the visitor's browser.
// With the relay configured it answers from the Pages deployment's Workers AI
// model — the same rung the desktop reaches through LM Studio — and without the
// relay the path does not exist in public mode at all, so nothing changes for a
// deployment that has not opted in.
if (isPublicDeployment && embeddingsRelayConfig()) {
  publicExactRouteKeys.add("POST /api/cloud/embeddings");
}

const exactRoutes = isPublicDeployment
  ? new Map([...localExactRoutes].filter(([key]) => publicExactRouteKeys.has(key)))
  : localExactRoutes;

/**
 * Routes matched by `METHOD PATH_PREFIX`. The handler is responsible
 * for parsing any query string. Order matters: the first prefix to
 * match wins.
 * @type {Array<{ method: string, prefix: string, handler: RouteHandler }>}
 */
const localPrefixRoutes = [
  { method: "GET", prefix: "/go", handler: handleGoRedirect },
  { method: "GET", prefix: "/api/search", handler: handleSearch },
  { method: "GET", prefix: "/api/reader", handler: handleReader },
  { method: "GET", prefix: "/api/time-machine", handler: handleTimeMachine },
  { method: "GET", prefix: "/api/endfield/search", handler: handleEndfieldSearch },
  { method: "POST", prefix: "/api/endfield/search", handler: handleEndfieldSearch },
  { method: "POST", prefix: "/api/endfield/ask", handler: handleEndfieldAsk },
  { method: "GET", prefix: "/api/music/gamdl/jobs", handler: handleGamdlJob },
  { method: "GET", prefix: "/api/music/gamdl/files", handler: handleGamdlFile },
];

const publicPrefixRouteKeys = new Set([
  "GET /go",
  "GET /api/search",
  "GET /api/reader",
  "GET /api/time-machine",
  "GET /api/endfield/search",
  "POST /api/endfield/search",
  "POST /api/endfield/ask",
]);

const prefixRoutes = isPublicDeployment
  ? localPrefixRoutes.filter((route) =>
      publicPrefixRouteKeys.has(`${route.method} ${route.prefix}`))
  : localPrefixRoutes;

/**
 * Routes that exist in the root server.js but have not been migrated
 * yet. Surfaced in 404 responses so callers can see the migration
 * frontier without inspecting source.
 *
 * Keep this list in sync with the dispatcher block at the bottom of
 * the root server.js.
 */
const unmigratedRoutes = [
];

/**
 * Resolve a request to a handler. Returns null if no route matches.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {RouteHandler | null}
 */
function resolveRoute(req) {
  const method = req.method || "GET";
  const url = req.url || "/";
  let pathname = url;
  try {
    pathname = new URL(url, `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    pathname = url.split("?")[0] || "/";
  }

  // Exact routes match the URL pathname so handlers can opt into
  // query parameters without needing a prefix route.
  const exact = exactRoutes.get(`${method} ${pathname}`);
  if (exact) return exact;

  for (const route of prefixRoutes) {
    if (
      route.method === method
      && (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`))
    ) {
      return route.handler;
    }
  }

  return null;
}

/**
 * @returns {string[]} Migrated routes in `METHOD PATH` form.
 */
function listMigratedRoutes() {
  const out = [...exactRoutes.keys()];
  for (const route of prefixRoutes) {
    out.push(`${route.method} ${route.prefix}*`);
  }
  return out.sort();
}

module.exports = {
  resolveRoute,
  listMigratedRoutes,
  unmigratedRoutes,
};
