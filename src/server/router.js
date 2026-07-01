// Route dispatch table. Replaces the if/else chain at the bottom of
// the root server.js. Entries are matched by exact `METHOD PATH` first,
// then by `METHOD prefix` for routes that accept query strings.
//
// Until a route is migrated into this table, a request for it returns
// a structured 404 from server.js with both `migrated` and
// `unmigrated` lists.

"use strict";

const { handleVersion } = require("./routes/version.js");
const { handleImporterStatus } = require("./routes/importer-status.js");
const { handleCloudModels } = require("./routes/cloud-models.js");
const { handleCloudStatus } = require("./routes/cloud-status.js");
const { handleCloudEmbeddings } = require("./routes/cloud-embeddings.js");
const { handleCloudChat } = require("./routes/cloud-chat.js");
const { handleEmbeddings } = require("./routes/embeddings.js");
const { handleModelBudget } = require("./routes/model-budget.js");
const { handleModels } = require("./routes/models.js");
const { handleModelsLoadEmbedding } = require("./routes/models-load-embedding.js");
const { handleModelsLoad } = require("./routes/models-load.js");
const { handleLmStudioSetup } = require("./routes/lmstudio-setup.js");
const { handleChat } = require("./routes/chat.js");
const { handleDraftThesis } = require("./routes/draft-thesis.js");
const { handleBureaucracyCaptions } = require("./routes/bureaucracy-captions.js");
const { handleImageGenerate } = require("./routes/image-generate.js");
const { handleVisionAnalyze } = require("./routes/vision-analyze.js");
const { handleSearch } = require("./routes/search.js");
const { handleReader } = require("./routes/reader.js");
const { handleEndfieldSearch } = require("./routes/endfield-search.js");
const { handleEndfieldAsk } = require("./routes/endfield-ask.js");
const { handleImportText } = require("./routes/import-text.js");
const { handleImportOcrPages } = require("./routes/import-ocr-pages.js");
const { handleSubtitlesTranslate } = require("./routes/subtitles-translate.js");
const { handleCmfCapabilities } = require("./routes/cmf-capabilities.js");
const { handleCmfExportUsdz } = require("./routes/cmf-export-usdz.js");
const { handleCmfRenderViews } = require("./routes/cmf-render-views.js");
const { handleCmfRenderPreview } = require("./routes/cmf-render-preview.js");

/**
 * @typedef {(
 *   req: import("node:http").IncomingMessage,
 *   res: import("node:http").ServerResponse,
 * ) => void | Promise<void>} RouteHandler
 */

/**
 * Routes matched by exact `METHOD PATH`.
 * @type {Map<string, RouteHandler>}
 */
const exactRoutes = new Map([
  ["GET /api/version", handleVersion],
  ["GET /api/importer-status", handleImporterStatus],
  ["GET /api/cloud/models", handleCloudModels],
  ["POST /api/cloud/status", handleCloudStatus],
  ["POST /api/cloud/embeddings", handleCloudEmbeddings],
  ["POST /api/cloud/chat", handleCloudChat],
  ["POST /api/embeddings", handleEmbeddings],
  ["POST /api/model-budget", handleModelBudget],
  ["GET /api/models", handleModels],
  ["POST /api/models/load-embedding", handleModelsLoadEmbedding],
  ["POST /api/models/load", handleModelsLoad],
  ["POST /api/lmstudio/setup", handleLmStudioSetup],
  ["POST /api/chat", handleChat],
  ["POST /api/draft/thesis", handleDraftThesis],
  ["POST /api/bureaucracy/captions", handleBureaucracyCaptions],
  ["POST /api/image/generate", handleImageGenerate],
  ["POST /api/vision/analyze", handleVisionAnalyze],
  ["POST /api/import-text", handleImportText],
  ["POST /api/import-ocr-pages", handleImportOcrPages],
  ["POST /api/subtitles/translate", handleSubtitlesTranslate],
  ["GET /api/cmf/capabilities", handleCmfCapabilities],
  ["POST /api/cmf/export-usdz", handleCmfExportUsdz],
  ["POST /api/cmf/render-views", handleCmfRenderViews],
  ["POST /api/cmf/render-preview", handleCmfRenderPreview],
]);

/**
 * Routes matched by `METHOD PATH_PREFIX`. The handler is responsible
 * for parsing any query string. Order matters: the first prefix to
 * match wins.
 * @type {Array<{ method: string, prefix: string, handler: RouteHandler }>}
 */
const prefixRoutes = [
  { method: "GET", prefix: "/api/search", handler: handleSearch },
  { method: "GET", prefix: "/api/reader", handler: handleReader },
  { method: "GET", prefix: "/api/endfield/search", handler: handleEndfieldSearch },
  { method: "POST", prefix: "/api/endfield/search", handler: handleEndfieldSearch },
  { method: "POST", prefix: "/api/endfield/ask", handler: handleEndfieldAsk },
];

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
    if (route.method === method && pathname.startsWith(route.prefix)) {
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
