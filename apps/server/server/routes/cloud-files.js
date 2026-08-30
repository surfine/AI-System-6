"use strict";

const {
  CLOUD_FILE_LIMITS,
  cloudFileError,
  createCloudFileMultipart,
  issueCloudFileToken,
  normalizeCloudFileBytes,
  normalizeCloudFileMimeType,
  normalizeCloudFileName,
  parseCloudFileDeleteResponse,
  parseCloudFileUploadResponse,
  prepareCloudFileStream,
  verifyCloudFileToken,
} = require("../cloud-files.js");
const {
  DEEPSEEK_BASE_URL_DEFAULT,
  DEEPSEEK_PUBLIC_BASE_URL,
  cloudAuthHeaders,
  resolveCloudTarget,
} = require("../cloud.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const { nodeRequestWithStream } = require("../lib/fetch.js");
const {
  readJsonBody,
  requestSignal,
  sendJson,
  withTimeoutSignal,
} = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { sessionFromRequest } = require("../security/public-session.js");

const CLOUD_FILE_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const CLOUD_FILE_DELETE_TIMEOUT_MS = 2 * 60 * 1000;

function headerValue(req, name) {
  const value = req?.headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) {
    throw cloudFileError(400, "invalid_cloud_credential_header", "Cloud file header is ambiguous.");
  }
  return String(value || "");
}

function uploadMetadata(req) {
  const filename = normalizeCloudFileName(headerValue(req, "x-ai-system6-file-name"));
  const bytes = normalizeCloudFileBytes(headerValue(req, "x-ai-system6-file-bytes"));
  const mimeType = normalizeCloudFileMimeType(headerValue(req, "content-type"));
  const contentLength = headerValue(req, "content-length").trim();
  if (contentLength) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) !== bytes) {
      throw cloudFileError(400, "invalid_file_body", "Content-Length does not match the declared file bytes.");
    }
  }
  return { filename, bytes, mimeType };
}

function sessionNonceFor(req, isPublic) {
  const session = sessionFromRequest(req);
  if (isPublic && !session?.nonce) {
    throw cloudFileError(401, "verification_required", "Verification required.");
  }
  return session?.nonce || "";
}

/**
 * Resolve a credential for Files without ever borrowing the public shared
 * allowance. Public requests must carry their raw BYOK header; local requests
 * may use the existing Keychain credential id or the local operator key.
 */
async function filesCredential(req, targetBaseUrl, isPublic, resolver) {
  const suppliedApiKey = headerValue(req, "x-ai-system6-cloud-api-key").trim();
  const credentialId = headerValue(req, "x-ai-system6-cloud-credential-id").trim();
  if (suppliedApiKey && credentialId) {
    throw cloudFileError(
      400,
      "invalid_cloud_credential_header",
      "Supply either an API key or a credential id, not both."
    );
  }
  if (Buffer.byteLength(suppliedApiKey, "utf8") > 8192) {
    throw cloudFileError(400, "invalid_cloud_credential_header", "API key header is too large.");
  }
  if (isPublic) {
    if (credentialId) {
      throw cloudFileError(
        400,
        "invalid_cloud_credential_header",
        "Public Cloud Files requires a request-scoped API key."
      );
    }
    if (!suppliedApiKey) {
      throw cloudFileError(400, "missing_byok_key", "Missing API key.");
    }
    return suppliedApiKey;
  }

  if (suppliedApiKey) {
    throw cloudFileError(
      400,
      "invalid_cloud_credential_header",
      "Local Cloud Files accepts a staged credential id or the operator environment key."
    );
  }

  let apiKey;
  try {
    apiKey = String(await resolver({
      credentialId,
      provider: "deepseek",
      targetBaseUrl,
      suppliedApiKey: "",
      allowSupplied: false,
    })).trim();
  } catch (error) {
    if (/** @type {any} */ (error)?.code === "credential_scope_mismatch") {
      throw cloudFileError(
        400,
        "cloud_file_credential_scope_mismatch",
        "Cloud credential does not match the Files endpoint."
      );
    }
    throw error;
  }
  if (!apiKey) throw cloudFileError(400, "missing_byok_key", "Missing API key.");
  return apiKey;
}

function safeRetryAfter(value) {
  const seconds = Number(String(value || "").trim());
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 24 * 60 * 60
    ? seconds
    : 0;
}

function looksLikeQuotaFailure(text) {
  return /(?:quota|storage limit|too many files|10,?000 files|25\s*(?:GiB|GB))/i.test(String(text || ""));
}

function upstreamFailure(response, text) {
  const status = Number(response?.status) || 0;
  const retryAfter = safeRetryAfter(response?.headers?.get?.("retry-after"));
  if (status === 401 || status === 403) {
    return cloudFileError(401, "cloud_auth_failed", "Cloud Files rejected the API key.");
  }
  if (status === 429) {
    return cloudFileError(
      429,
      "cloud_files_rate_limited",
      "Cloud Files is rate limited.",
      { retryAfter }
    );
  }
  if (status === 409 || looksLikeQuotaFailure(text)) {
    return cloudFileError(409, "cloud_files_quota_exceeded", "Cloud Files quota is full.");
  }
  if (status === 413) {
    return cloudFileError(413, "cloud_file_too_large", "Cloud Files rejected the file as too large.");
  }
  return cloudFileError(502, "cloud_files_upstream_failed", "Cloud Files request failed.");
}

function normalizedRouteError(error, timedOut) {
  if (timedOut) {
    return cloudFileError(504, "cloud_file_timeout", "Cloud Files request timed out.");
  }
  if (/** @type {any} */ (error)?.code === "ERR_REQUEST_LENGTH_MISMATCH") {
    return cloudFileError(400, "invalid_file_body", "Cloud file body length is invalid.");
  }
  if (/** @type {any} */ (error)?.code === "ERR_RESPONSE_TOO_LARGE") {
    return cloudFileError(502, "invalid_cloud_file_response", "Cloud Files response is too large.");
  }
  if (
    Number.isInteger(/** @type {any} */ (error)?.statusCode)
    && typeof /** @type {any} */ (error)?.code === "string"
  ) {
    return error;
  }
  return cloudFileError(502, "cloud_files_upstream_failed", "Cloud Files request failed.");
}

function sendRouteError(res, error) {
  const headers = error?.retryAfter > 0 ? { "Retry-After": String(error.retryAfter) } : {};
  sendJson(res, Number(error?.statusCode) || 502, {
    error: String(error?.message || "Cloud Files request failed."),
    code: String(error?.code || "cloud_files_upstream_failed"),
  }, headers);
}

function routeDependencies(options = {}) {
  return {
    publicDeployment: options.isPublic === undefined ? isPublicDeployment : options.isPublic === true,
    resolveTarget: options.resolveCloudTarget || resolveCloudTarget,
    resolveCredential: options.resolveCloudCredential || resolveCloudCredential,
    request: options.nodeRequestWithStream || nodeRequestWithStream,
  };
}

/**
 * POST /api/cloud/files
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   isPublic?: boolean,
 *   resolveCloudTarget?: typeof resolveCloudTarget,
 *   resolveCloudCredential?: typeof resolveCloudCredential,
 *   nodeRequestWithStream?: typeof nodeRequestWithStream,
 * }} [options]
 */
async function handleCloudFilesUpload(req, res, options = {}) {
  const dependencies = routeDependencies(options);
  const timeout = withTimeoutSignal(requestSignal(req, res), CLOUD_FILE_UPLOAD_TIMEOUT_MS);
  try {
    const metadata = uploadMetadata(req);
    const sessionNonce = sessionNonceFor(req, dependencies.publicDeployment);
    const requestedBaseUrl = dependencies.publicDeployment
      ? DEEPSEEK_PUBLIC_BASE_URL
      : DEEPSEEK_BASE_URL_DEFAULT;
    const target = await dependencies.resolveTarget(requestedBaseUrl);
    const apiKey = await filesCredential(
      req,
      target.baseUrl,
      dependencies.publicDeployment,
      dependencies.resolveCredential
    );
    const prepared = await prepareCloudFileStream(req, {
      expectedBytes: metadata.bytes,
      mimeType: metadata.mimeType,
      signal: timeout.signal,
    });
    const multipart = createCloudFileMultipart({
      filename: metadata.filename,
      mimeType: prepared.mimeType,
      fileBytes: metadata.bytes,
    });
    const response = await dependencies.request(
      `${target.baseUrl}/files`,
      multipart.body(prepared.body),
      timeout.signal,
      {
        ...cloudAuthHeaders(apiKey),
        "Accept": "application/json",
        "Content-Type": multipart.contentType,
      },
      {
        method: "POST",
        contentLength: multipart.contentLength,
        maxBytes: CLOUD_FILE_LIMITS.maxProviderResponseBytes,
        pinnedAddress: target.address,
        pinnedFamily: target.family,
      }
    );
    const text = await response.text();
    if (!response.ok) throw upstreamFailure(response, text);
    const uploaded = parseCloudFileUploadResponse(text, {
      expectedBytes: metadata.bytes,
    });
    const fileToken = issueCloudFileToken({
      fileId: uploaded.fileId,
      bytes: uploaded.bytes,
      mimeType: prepared.mimeType,
      createdAt: uploaded.createdAt,
      expiresAt: uploaded.expiresAt,
      apiKey,
      baseUrl: target.baseUrl,
      sessionNonce,
      isPublic: dependencies.publicDeployment,
    });
    const currentSeconds = Math.floor(Date.now() / 1000);
    sendJson(res, 200, {
      file_token: fileToken,
      filename: metadata.filename,
      mime_type: prepared.mimeType,
      bytes: uploaded.bytes,
      created_at: uploaded.createdAt,
      expires_at: uploaded.expiresAt,
      expires_in: Math.max(
        0,
        Math.min(CLOUD_FILE_LIMITS.expiresAfterSeconds, uploaded.expiresAt - currentSeconds)
      ),
    });
  } catch (error) {
    sendRouteError(res, normalizedRouteError(error, timeout.timedOut()));
  } finally {
    timeout.cleanup();
  }
}

/**
 * DELETE /api/cloud/files
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{
 *   isPublic?: boolean,
 *   resolveCloudTarget?: typeof resolveCloudTarget,
 *   resolveCloudCredential?: typeof resolveCloudCredential,
 *   nodeRequestWithStream?: typeof nodeRequestWithStream,
 * }} [options]
 */
async function handleCloudFilesDelete(req, res, options = {}) {
  const dependencies = routeDependencies(options);
  const timeout = withTimeoutSignal(requestSignal(req, res), CLOUD_FILE_DELETE_TIMEOUT_MS);
  try {
    const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
    const sessionNonce = sessionNonceFor(req, dependencies.publicDeployment);
    const requestedBaseUrl = dependencies.publicDeployment
      ? DEEPSEEK_PUBLIC_BASE_URL
      : DEEPSEEK_BASE_URL_DEFAULT;
    const target = await dependencies.resolveTarget(requestedBaseUrl);
    const apiKey = await filesCredential(
      req,
      target.baseUrl,
      dependencies.publicDeployment,
      dependencies.resolveCredential
    );
    let verified;
    try {
      verified = verifyCloudFileToken(body?.file_token, {
        apiKey,
        baseUrl: target.baseUrl,
        sessionNonce,
        isPublic: dependencies.publicDeployment,
      });
    } catch (error) {
      if (/** @type {any} */ (error)?.code === "cloud_file_expired") {
        sendJson(res, 200, { deleted: true, already_absent: true });
        return;
      }
      throw error;
    }

    const response = await dependencies.request(
      `${target.baseUrl}/files/${encodeURIComponent(verified.fileId)}`,
      null,
      timeout.signal,
      {
        ...cloudAuthHeaders(apiKey),
        "Accept": "application/json",
      },
      {
        method: "DELETE",
        contentLength: 0,
        maxBytes: CLOUD_FILE_LIMITS.maxProviderResponseBytes,
        pinnedAddress: target.address,
        pinnedFamily: target.family,
      }
    );
    const text = await response.text();
    if (response.status === 404 || response.status === 410) {
      sendJson(res, 200, { deleted: true, already_absent: true });
      return;
    }
    if (!response.ok) throw upstreamFailure(response, text);
    parseCloudFileDeleteResponse(text, verified.fileId);
    sendJson(res, 200, { deleted: true, already_absent: false });
  } catch (error) {
    sendRouteError(res, normalizedRouteError(error, timeout.timedOut()));
  } finally {
    timeout.cleanup();
  }
}

module.exports = {
  handleCloudFilesUpload,
  handleCloudFilesDelete,
};
