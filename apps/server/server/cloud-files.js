"use strict";

const crypto = require("node:crypto");

const CLOUD_FILE_LIMITS = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  maxFilesPerRequest: 4,
  maxRequestBytes: 200 * 1024 * 1024,
  expiresAfterSeconds: 60 * 60,
  maxProviderResponseBytes: 256 * 1024,
  maxTokenBytes: 4096,
  mimeTypes: Object.freeze(["image/jpeg", "image/png", "image/gif", "image/webp"]),
});

const TOKEN_PREFIX = "cf1";
const MIN_PUBLIC_SIGNING_SECRET_BYTES = 32;
const IMAGE_MAGIC_BYTES = 12;
const localSigningSecret = crypto.randomBytes(32);

/**
 * @param {number} statusCode
 * @param {string} code
 * @param {string} message
 * @param {{ retryAfter?: number }} [options]
 * @returns {Error & { statusCode: number, code: string, retryAfter?: number }}
 */
function cloudFileError(statusCode, code, message, options = {}) {
  const error = /** @type {Error & { statusCode: number, code: string, retryAfter?: number }} */ (
    new Error(message)
  );
  error.statusCode = statusCode;
  error.code = code;
  if (Number.isSafeInteger(options.retryAfter) && Number(options.retryAfter) > 0) {
    error.retryAfter = Number(options.retryAfter);
  }
  return error;
}

function publicSigningSecret() {
  const secret = String(process.env.AI_SYSTEM6_SESSION_SECRET || "");
  if (Buffer.byteLength(secret, "utf8") < MIN_PUBLIC_SIGNING_SECRET_BYTES) {
    throw cloudFileError(
      503,
      "session_not_configured",
      "Session signing is not configured."
    );
  }
  return Buffer.from(secret);
}

function signingKey(isPublic) {
  const source = isPublic ? publicSigningSecret() : localSigningSecret;
  return crypto
    .createHmac("sha256", source)
    .update("ai-system6-cloud-files-token-v1")
    .digest();
}

function canonicalBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw cloudFileError(400, "invalid_cloud_endpoint", "Cloud endpoint is not a valid URL.");
  }
  if (!new Set(["https:", "http:"]).has(parsed.protocol)) {
    throw cloudFileError(400, "invalid_cloud_endpoint", "Cloud endpoint must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw cloudFileError(400, "invalid_cloud_endpoint", "Cloud endpoint contains unsupported URL parts.");
  }
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

/**
 * Bind a provider file reference to the exact key and endpoint that created
 * it without storing either credential in the token.
 *
 * @param {string} apiKey
 * @param {string} baseUrl
 * @returns {string}
 */
function credentialTagFor(apiKey, baseUrl, isPublic = false) {
  const key = String(apiKey || "").trim();
  if (!key) throw cloudFileError(400, "missing_byok_key", "Missing API key.");
  return crypto
    .createHmac("sha256", signingKey(isPublic))
    .update(`ai-system6-cloud-files-credential-v1\n${canonicalBaseUrl(baseUrl)}\n${key}`)
    .digest("base64url");
}

function sessionTagFor(sessionNonce, isPublic) {
  const nonce = String(sessionNonce || "");
  if (isPublic && !nonce) {
    throw cloudFileError(401, "verification_required", "Verification required.");
  }
  return crypto
    .createHmac("sha256", signingKey(isPublic))
    .update(`ai-system6-cloud-files-session-v1\n${nonce || "local"}`)
    .digest("base64url");
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function nowSeconds(now) {
  const milliseconds = now === undefined ? Date.now() : Number(now);
  if (!Number.isFinite(milliseconds)) throw new TypeError("now must be milliseconds since the Unix epoch.");
  return Math.floor(milliseconds / 1000);
}

function validateProviderFileId(value) {
  const fileId = String(value || "");
  if (
    !/^file-api-[A-Za-z0-9_-]+$/.test(fileId)
    || fileId.length > 512
    || /[\u0000-\u001f\u007f]/.test(fileId)
  ) {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned an invalid file id.");
  }
  return fileId;
}

/**
 * @param {{
 *   fileId: string,
 *   bytes: number,
 *   mimeType: string,
 *   createdAt: number,
 *   expiresAt: number,
 *   apiKey: string,
 *   baseUrl: string,
 *   sessionNonce?: string,
 *   isPublic?: boolean,
 *   now?: number,
 * }} options
 * @returns {string}
 */
function issueCloudFileToken(options) {
  const isPublic = options.isPublic === true;
  const fileId = validateProviderFileId(options.fileId);
  const bytes = safeInteger(options.bytes);
  const createdAt = safeInteger(options.createdAt);
  const providerExpiresAt = safeInteger(options.expiresAt);
  const mimeType = String(options.mimeType || "").trim().toLowerCase();
  const issuedAt = nowSeconds(options.now);

  if (bytes < 1 || bytes > CLOUD_FILE_LIMITS.maxFileBytes) {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned an invalid byte count.");
  }
  if (!CLOUD_FILE_LIMITS.mimeTypes.includes(mimeType)) {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned an invalid image type.");
  }
  if (createdAt < 1 || providerExpiresAt <= issuedAt || providerExpiresAt <= createdAt) {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned an invalid expiry.");
  }

  const payload = {
    v: 1,
    id: fileId,
    b: bytes,
    mt: mimeType,
    cat: createdAt,
    exp: Math.min(providerExpiresAt, issuedAt + CLOUD_FILE_LIMITS.expiresAfterSeconds),
    st: sessionTagFor(options.sessionNonce, isPublic),
    ct: credentialTagFor(options.apiKey, options.baseUrl, isPublic),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${TOKEN_PREFIX}.${encoded}`;
  const signature = crypto.createHmac("sha256", signingKey(isPublic)).update(signed).digest("base64url");
  return `${signed}.${signature}`;
}

function signaturesEqual(supplied, expected) {
  const suppliedBuffer = Buffer.from(String(supplied || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return suppliedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

/**
 * @param {string} fileToken
 * @param {{
 *   apiKey: string,
 *   baseUrl: string,
 *   sessionNonce?: string,
 *   isPublic?: boolean,
 *   now?: number,
 * }} options
 * @returns {{ fileId: string, bytes: number, mimeType: string, createdAt: number, expiresAt: number }}
 */
function verifyCloudFileToken(fileToken, options) {
  const token = String(fileToken || "").trim();
  if (!token || Buffer.byteLength(token, "utf8") > CLOUD_FILE_LIMITS.maxTokenBytes) {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file token is invalid.");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !parts[1] || !parts[2]) {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file token is invalid.");
  }

  const isPublic = options.isPublic === true;
  const expectedSignature = crypto
    .createHmac("sha256", signingKey(isPublic))
    .update(`${TOKEN_PREFIX}.${parts[1]}`)
    .digest("base64url");
  if (!signaturesEqual(parts[2], expectedSignature)) {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file token is invalid.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file token is invalid.");
  }

  const bytes = safeInteger(payload?.b);
  const createdAt = safeInteger(payload?.cat);
  const expiresAt = safeInteger(payload?.exp);
  const mimeType = String(payload?.mt || "").trim().toLowerCase();
  let fileId;
  try {
    fileId = validateProviderFileId(payload?.id);
  } catch {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file token is invalid.");
  }
  if (
    payload?.v !== 1
    || bytes < 1
    || bytes > CLOUD_FILE_LIMITS.maxFileBytes
    || createdAt < 1
    || expiresAt <= createdAt
    || !CLOUD_FILE_LIMITS.mimeTypes.includes(mimeType)
    || typeof payload?.st !== "string"
    || typeof payload?.ct !== "string"
  ) {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file token is invalid.");
  }
  if (!signaturesEqual(payload.st, sessionTagFor(options.sessionNonce, isPublic))) {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file token does not belong to this session.");
  }
  if (!signaturesEqual(payload.ct, credentialTagFor(options.apiKey, options.baseUrl, isPublic))) {
    throw cloudFileError(
      400,
      "cloud_file_credential_scope_mismatch",
      "Cloud file token belongs to a different credential."
    );
  }
  if (expiresAt <= nowSeconds(options.now)) {
    throw cloudFileError(410, "cloud_file_expired", "Cloud file token has expired.");
  }

  return { fileId, bytes, mimeType, createdAt, expiresAt };
}

/**
 * Replace signed browser file tokens with provider file ids immediately before
 * a chat request leaves the service. File blocks are accepted only in user
 * messages and count against both the four-image and 200 MiB request limits.
 *
 * @param {any[]} messages
 * @param {{ apiKey: string, baseUrl: string, sessionNonce?: string, isPublic?: boolean, now?: number }} options
 * @returns {{ messages: any[], fileCount: number, totalBytes: number }}
 */
function handleCloudFileTokenMessages(messages, options) {
  if (!Array.isArray(messages)) {
    throw cloudFileError(400, "invalid_cloud_file_token", "Cloud chat messages must be an array.");
  }
  let fileCount = 0;
  let totalBytes = 0;
  const normalized = messages.map((message) => {
    if (!Array.isArray(message?.content)) return message;
    const content = message.content.map((block) => {
      if (!block || block.type !== "file") return block;
      if (message.role !== "user") {
        throw cloudFileError(400, "invalid_cloud_file_token", "Cloud file blocks are allowed only in user messages.");
      }
      fileCount += 1;
      if (fileCount > CLOUD_FILE_LIMITS.maxFilesPerRequest) {
        throw cloudFileError(
          413,
          "cloud_file_request_total_too_large",
          `A cloud vision request accepts at most ${CLOUD_FILE_LIMITS.maxFilesPerRequest} files.`
        );
      }
      const verified = verifyCloudFileToken(block.file_id, options);
      totalBytes += verified.bytes;
      if (totalBytes > CLOUD_FILE_LIMITS.maxRequestBytes) {
        throw cloudFileError(
          413,
          "cloud_file_request_total_too_large",
          "Cloud files in one request exceed the 200 MiB limit."
        );
      }
      return { type: "file", file_id: verified.fileId };
    });
    return { ...message, content };
  });
  return { messages: normalized, fileCount, totalBytes };
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeCloudFileName(value) {
  let filename;
  try {
    filename = decodeURIComponent(String(value || ""));
  } catch {
    throw cloudFileError(400, "invalid_file_name", "File name is not valid URL-encoded text.");
  }
  if (
    !filename
    || Array.from(filename).length > 512
    || /[\u0000-\u001f\u007f]/.test(filename)
    || /[\\/]/.test(filename)
  ) {
    throw cloudFileError(400, "invalid_file_name", "File name is invalid.");
  }
  return filename;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeCloudFileBytes(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw cloudFileError(411, "cloud_file_length_required", "Cloud file byte length is required.");
  }
  if (!/^\d+$/.test(raw)) {
    throw cloudFileError(400, "invalid_file_body", "Cloud file byte length is invalid.");
  }
  const bytes = Number(raw);
  if (!Number.isSafeInteger(bytes) || bytes < 1) {
    throw cloudFileError(400, "invalid_file_body", "Cloud file byte length is invalid.");
  }
  if (bytes > CLOUD_FILE_LIMITS.maxFileBytes) {
    throw cloudFileError(413, "cloud_file_too_large", "Cloud file exceeds the 64 MiB limit.");
  }
  return bytes;
}

function normalizeCloudFileMimeType(value) {
  const mimeType = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (!CLOUD_FILE_LIMITS.mimeTypes.includes(mimeType)) {
    throw cloudFileError(415, "unsupported_image_type", "Cloud Files accepts JPEG, PNG, GIF, or WebP images.");
  }
  return mimeType;
}

/**
 * @param {Buffer} header
 * @returns {string}
 */
function detectCloudFileMimeType(header) {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    header.length >= 8
    && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (header.length >= 6) {
    const gif = header.subarray(0, 6).toString("ascii");
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (
    header.length >= 12
    && header.subarray(0, 4).toString("ascii") === "RIFF"
    && header.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "";
}

function requestChunk(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw cloudFileError(400, "invalid_file_body", "Cloud file body is not binary data.");
}

function iteratorFor(source) {
  if (source && typeof source[Symbol.asyncIterator] === "function") return source[Symbol.asyncIterator]();
  if (source && typeof source[Symbol.iterator] === "function") return source[Symbol.iterator]();
  throw cloudFileError(400, "invalid_file_body", "Cloud file body is not readable.");
}

function nextWithSignal(iterator, signal) {
  if (!signal) return Promise.resolve(iterator.next());
  if (signal.aborted) {
    const error = new Error("Request aborted");
    /** @type {any} */ (error).code = "ERR_REQUEST_ABORTED";
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      const error = new Error("Request aborted");
      /** @type {any} */ (error).code = "ERR_REQUEST_ABORTED";
      reject(error);
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(iterator.next()).then((result) => {
      cleanup();
      resolve(result);
    }, (error) => {
      cleanup();
      reject(error);
    });
  });
}

/**
 * Read only enough bytes to authenticate the image format, then return an
 * iterable that replays those same chunks and continues from the original
 * request. The iterable enforces the declared raw byte count as it streams.
 *
 * @param {AsyncIterable<Buffer | Uint8Array> | Iterable<Buffer | Uint8Array>} source
 * @param {{ expectedBytes: number, mimeType: string, signal?: AbortSignal | null }} options
 * @returns {Promise<{ body: AsyncIterable<Buffer>, mimeType: string }>}
 */
async function prepareCloudFileStream(source, options) {
  const expectedBytes = normalizeCloudFileBytes(options.expectedBytes);
  const declaredMimeType = normalizeCloudFileMimeType(options.mimeType);
  const iterator = iteratorFor(source);
  const bufferedChunks = [];
  const magicChunks = [];
  let bufferedBytes = 0;
  let magicBytes = 0;

  try {
    while (magicBytes < IMAGE_MAGIC_BYTES && bufferedBytes < expectedBytes) {
      const result = await nextWithSignal(iterator, options.signal);
      if (result.done) break;
      const chunk = requestChunk(result.value);
      if (!chunk.byteLength) continue;
      bufferedBytes += chunk.byteLength;
      if (bufferedBytes > expectedBytes) {
        throw cloudFileError(400, "invalid_file_body", "Cloud file body is longer than declared.");
      }
      bufferedChunks.push(chunk);
      const take = Math.min(IMAGE_MAGIC_BYTES - magicBytes, chunk.byteLength);
      if (take > 0) {
        magicChunks.push(chunk.subarray(0, take));
        magicBytes += take;
      }
    }
  } catch (error) {
    await iterator.return?.();
    throw error;
  }

  const detectedMimeType = detectCloudFileMimeType(Buffer.concat(magicChunks, magicBytes));
  if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
    await iterator.return?.();
    throw cloudFileError(415, "unsupported_image_type", "Image content does not match its declared type.");
  }

  const body = (async function* validatedBody() {
    let streamedBytes = 0;
    try {
      for (const chunk of bufferedChunks) {
        streamedBytes += chunk.byteLength;
        yield chunk;
      }
      while (true) {
        const result = await nextWithSignal(iterator, options.signal);
        if (result.done) break;
        const chunk = requestChunk(result.value);
        if (!chunk.byteLength) continue;
        const nextBytes = streamedBytes + chunk.byteLength;
        if (nextBytes > expectedBytes) {
          throw cloudFileError(400, "invalid_file_body", "Cloud file body is longer than declared.");
        }
        streamedBytes = nextBytes;
        yield chunk;
      }
      if (streamedBytes !== expectedBytes) {
        throw cloudFileError(400, "invalid_file_body", "Cloud file body is shorter than declared.");
      }
    } finally {
      await iterator.return?.();
    }
  })();

  return { body, mimeType: detectedMimeType };
}

function multipartField(boundary, name, value) {
  return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

/**
 * @param {{ filename: string, mimeType: string, fileBytes: number, boundary?: string }} options
 * @returns {{
 *   boundary: string,
 *   contentType: string,
 *   contentLength: number,
 *   preamble: Buffer,
 *   suffix: Buffer,
 *   body: (source: AsyncIterable<Buffer> | Iterable<Buffer> | Buffer) => AsyncIterable<Buffer>,
 * }}
 */
function createCloudFileMultipart(options) {
  const filename = normalizeCloudFileName(encodeURIComponent(options.filename));
  const mimeType = normalizeCloudFileMimeType(options.mimeType);
  const fileBytes = normalizeCloudFileBytes(options.fileBytes);
  const boundary = options.boundary || `----ai-system6-${crypto.randomBytes(18).toString("hex")}`;
  if (!/^[A-Za-z0-9-]{16,80}$/.test(boundary)) {
    throw new TypeError("Multipart boundary is invalid.");
  }
  const asciiFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "image";
  const encodedFilename = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  const preamble = Buffer.from(
    multipartField(boundary, "purpose", "user_data")
    + multipartField(boundary, "expires_after[anchor]", "created_at")
    + multipartField(boundary, "expires_after[seconds]", String(CLOUD_FILE_LIMITS.expiresAfterSeconds))
    + `--${boundary}\r\n`
    + `Content-Disposition: form-data; name="file"; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}\r\n`
    + `Content-Type: ${mimeType}\r\n\r\n`,
    "utf8"
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "ascii");
  const contentLength = preamble.byteLength + fileBytes + suffix.byteLength;

  return {
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength,
    preamble,
    suffix,
    body(source) {
      return (async function* multipartBody() {
        yield preamble;
        if (Buffer.isBuffer(source)) {
          yield source;
        } else {
          for await (const chunk of source) yield requestChunk(chunk);
        }
        yield suffix;
      })();
    },
  };
}

function parseProviderJson(text) {
  let payload;
  try {
    payload = JSON.parse(String(text || ""));
  } catch {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned invalid JSON.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned an invalid response.");
  }
  return payload;
}

/**
 * @param {string} text
 * @param {{ expectedBytes: number, now?: number }} options
 * @returns {{ fileId: string, bytes: number, createdAt: number, expiresAt: number, filename: string }}
 */
function parseCloudFileUploadResponse(text, options) {
  const payload = parseProviderJson(text);
  const fileId = validateProviderFileId(payload.id);
  const bytes = safeInteger(payload.bytes);
  const createdAt = safeInteger(payload.created_at);
  const expiresAt = safeInteger(payload.expires_at);
  const filename = String(payload.filename || "");
  if (
    payload.object !== "file"
    || payload.purpose !== "user_data"
    || bytes !== options.expectedBytes
    || createdAt < 1
    || expiresAt <= createdAt
    || expiresAt > createdAt + CLOUD_FILE_LIMITS.expiresAfterSeconds + 60
    || expiresAt <= nowSeconds(options.now)
    || !filename
  ) {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned an invalid upload response.");
  }
  return { fileId, bytes, createdAt, expiresAt, filename };
}

/**
 * @param {string} text
 * @param {string} expectedFileId
 * @returns {{ deleted: true }}
 */
function parseCloudFileDeleteResponse(text, expectedFileId) {
  const payload = parseProviderJson(text);
  if (
    payload.object !== "file"
    || payload.deleted !== true
    || payload.id !== expectedFileId
  ) {
    throw cloudFileError(502, "invalid_cloud_file_response", "Cloud Files returned an invalid delete response.");
  }
  return { deleted: true };
}

module.exports = {
  CLOUD_FILE_LIMITS,
  cloudFileError,
  credentialTagFor,
  issueCloudFileToken,
  verifyCloudFileToken,
  handleCloudFileTokenMessages,
  normalizeCloudFileName,
  normalizeCloudFileBytes,
  normalizeCloudFileMimeType,
  detectCloudFileMimeType,
  prepareCloudFileStream,
  createCloudFileMultipart,
  parseCloudFileUploadResponse,
  parseCloudFileDeleteResponse,
};
