import http from "node:http";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("cloud-files-node");
const cloudFiles = require("../../apps/server/server/cloud-files.js");
const cloudFileRoutes = require("../../apps/server/server/routes/cloud-files.js");
const fetchHelpers = require("../../apps/server/server/lib/fetch.js");

const {
  CLOUD_FILE_LIMITS,
  createCloudFileMultipart,
  detectCloudFileMimeType,
  handleCloudFileTokenMessages,
  issueCloudFileToken,
  prepareCloudFileStream,
  verifyCloudFileToken,
} = cloudFiles;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function withDeadline(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), 3000);
      timer.unref?.();
    }),
  ]);
}

function collect(source) {
  return (async () => {
    const chunks = [];
    for await (const chunk of source) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  })();
}

function requestJson(port, method, headers, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/cloud/files",
      method,
      headers,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          json: JSON.parse(text),
        });
      });
    });
    request.once("error", reject);
    request.end(body);
  });
}

test.assert(CLOUD_FILE_LIMITS.maxFileBytes === 64 * 1024 * 1024, "one file is capped at 64 MiB");
test.assert(CLOUD_FILE_LIMITS.maxFilesPerRequest === 4, "one chat request accepts four file references");
test.assert(CLOUD_FILE_LIMITS.maxRequestBytes === 200 * 1024 * 1024, "file references total at most 200 MiB");
test.assert(CLOUD_FILE_LIMITS.expiresAfterSeconds === 3600, "provider files expire after one hour");

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("abcdefghijkl"),
]);
test.assert(detectCloudFileMimeType(png) === "image/png", "PNG magic bytes are recognized");
test.assert(
  detectCloudFileMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === "image/jpeg",
  "JPEG magic bytes are recognized"
);
test.assert(detectCloudFileMimeType(Buffer.from("GIF89a")) === "image/gif", "GIF magic bytes are recognized");
const webp = Buffer.alloc(12);
webp.write("RIFF", 0, "ascii");
webp.write("WEBP", 8, "ascii");
test.assert(detectCloudFileMimeType(webp) === "image/webp", "WebP magic bytes are recognized");

let rejectedNonDeepSeekFileId = false;
try {
  issueCloudFileToken({
    fileId: "file-other-provider",
    bytes: png.length,
    mimeType: "image/png",
    createdAt: 2_000_000_000,
    expiresAt: 2_000_003_600,
    apiKey: "test-key-a",
    baseUrl: "https://api.deepseek.com",
    now: 2_000_000_000_000,
  });
} catch (error) {
  rejectedNonDeepSeekFileId = error?.code === "invalid_cloud_file_response";
}
test.assert(rejectedNonDeepSeekFileId, "only DeepSeek file-api identifiers enter signed tokens");

const prepared = await prepareCloudFileStream(
  Readable.from([png.subarray(0, 5), png.subarray(5, 12), png.subarray(12)]),
  { expectedBytes: png.byteLength, mimeType: "image/png" }
);
test.assert((await collect(prepared.body)).equals(png), "magic-byte inspection preserves every source byte");

let mismatchCode = "";
try {
  await prepareCloudFileStream(Readable.from([png]), {
    expectedBytes: png.byteLength,
    mimeType: "image/jpeg",
  });
} catch (error) {
  mismatchCode = error?.code || "";
}
test.assert(mismatchCode === "unsupported_image_type", "declared MIME must match image magic bytes");

const tooLong = await prepareCloudFileStream(
  Readable.from([png.subarray(0, 12), png.subarray(12), Buffer.from("x")]),
  { expectedBytes: png.byteLength, mimeType: "image/png" }
);
let lengthCode = "";
try {
  await collect(tooLong.body);
} catch (error) {
  lengthCode = error?.code || "";
}
test.assert(lengthCode === "invalid_file_body", "streaming rejects bytes beyond the declared raw length");

const multipart = createCloudFileMultipart({
  filename: "sample.png",
  mimeType: "image/png",
  fileBytes: png.byteLength,
  boundary: "ai-system6-test-boundary",
});
const multipartBody = await collect(multipart.body(png));
const multipartText = multipartBody.toString("latin1");
test.assert(multipartBody.byteLength === multipart.contentLength, "multipart Content-Length is exact");
test.assert(multipartText.includes('name="purpose"\r\n\r\nuser_data'), "multipart fixes purpose=user_data");
test.assert(
  multipartText.includes('name="expires_after[anchor]"\r\n\r\ncreated_at'),
  "multipart fixes the expiry anchor"
);
test.assert(
  multipartText.includes('name="expires_after[seconds]"\r\n\r\n3600'),
  "multipart fixes the one-hour expiry"
);
test.assert(multipartText.includes('name="file"; filename="sample.png"'), "multipart carries the validated filename");

const tokenNow = 2_000_000_000_000;
const tokenNowSeconds = Math.floor(tokenNow / 1000);
const tokenOptions = {
  fileId: "file-api-token-test",
  bytes: png.byteLength,
  mimeType: "image/png",
  createdAt: tokenNowSeconds,
  expiresAt: tokenNowSeconds + 3600,
  apiKey: "test-key-one",
  baseUrl: "https://api.deepseek.com",
  sessionNonce: "test-session-one",
  isPublic: false,
  now: tokenNow,
};
const token = issueCloudFileToken(tokenOptions);
const verified = verifyCloudFileToken(token, {
  apiKey: tokenOptions.apiKey,
  baseUrl: tokenOptions.baseUrl,
  sessionNonce: tokenOptions.sessionNonce,
  isPublic: false,
  now: tokenNow,
});
test.assert(verified.fileId === tokenOptions.fileId, "a valid token reveals its provider file id server-side");
test.assert(!token.includes(tokenOptions.apiKey), "the signed token never contains the API key");

let scopeCode = "";
try {
  verifyCloudFileToken(token, {
    apiKey: "test-key-two",
    baseUrl: tokenOptions.baseUrl,
    sessionNonce: tokenOptions.sessionNonce,
    isPublic: false,
    now: tokenNow,
  });
} catch (error) {
  scopeCode = error?.code || "";
}
test.assert(scopeCode === "cloud_file_credential_scope_mismatch", "tokens are credential-bound");

let expiredCode = "";
try {
  verifyCloudFileToken(token, {
    apiKey: tokenOptions.apiKey,
    baseUrl: tokenOptions.baseUrl,
    sessionNonce: tokenOptions.sessionNonce,
    isPublic: false,
    now: tokenNow + 3600 * 1000,
  });
} catch (error) {
  expiredCode = error?.code || "";
}
test.assert(expiredCode === "cloud_file_expired", "tokens fail closed at their one-hour expiry");

const rewritten = handleCloudFileTokenMessages([
  { role: "user", content: [{ type: "text", text: "read this" }, { type: "file", file_id: token }] },
], {
  apiKey: tokenOptions.apiKey,
  baseUrl: tokenOptions.baseUrl,
  sessionNonce: tokenOptions.sessionNonce,
  isPublic: false,
  now: tokenNow,
});
test.assert(rewritten.fileCount === 1 && rewritten.totalBytes === png.byteLength, "chat counts signed file references");
test.assert(
  rewritten.messages[0].content[1].file_id === tokenOptions.fileId,
  "chat replaces the signed token only at the provider boundary"
);

let rawIdCode = "";
try {
  handleCloudFileTokenMessages([
    { role: "user", content: [{ type: "file", file_id: "file-api-client-smuggle" }] },
  ], {
    apiKey: tokenOptions.apiKey,
    baseUrl: tokenOptions.baseUrl,
    sessionNonce: tokenOptions.sessionNonce,
    isPublic: false,
    now: tokenNow,
  });
} catch (error) {
  rawIdCode = error?.code || "";
}
test.assert(rawIdCode === "invalid_cloud_file_token", "raw provider file ids cannot cross the browser boundary");

const largeTokens = Array.from({ length: 4 }, (_, index) => issueCloudFileToken({
  ...tokenOptions,
  fileId: `file-api-large-${index}`,
  bytes: 51 * 1024 * 1024,
}));
let totalCode = "";
try {
  handleCloudFileTokenMessages([
    { role: "user", content: largeTokens.map((fileToken) => ({ type: "file", file_id: fileToken })) },
  ], {
    apiKey: tokenOptions.apiKey,
    baseUrl: tokenOptions.baseUrl,
    sessionNonce: tokenOptions.sessionNonce,
    isPublic: false,
    now: tokenNow,
  });
} catch (error) {
  totalCode = error?.code || "";
}
test.assert(totalCode === "cloud_file_request_total_too_large", "four valid files still obey the 200 MiB total");

const previousSessionSecret = process.env.AI_SYSTEM6_SESSION_SECRET;
process.env.AI_SYSTEM6_SESSION_SECRET = "cloud-files-test-session-secret-32-bytes-minimum";
const publicSessionNonce = "public-session-nonce-123456789";
const publicToken = issueCloudFileToken({
  ...tokenOptions,
  fileId: "file-api-public-token",
  sessionNonce: publicSessionNonce,
  isPublic: true,
});
test.assert(
  verifyCloudFileToken(publicToken, {
    apiKey: tokenOptions.apiKey,
    baseUrl: tokenOptions.baseUrl,
    sessionNonce: publicSessionNonce,
    isPublic: true,
    now: tokenNow,
  }).fileId === "file-api-public-token",
  "public tokens use the configured session signing secret"
);

let providerFirstChunkResolve;
const providerFirstChunk = new Promise((resolve) => {
  providerFirstChunkResolve = resolve;
});
let providerUploadBody = Buffer.alloc(0);
let providerUploadLength = 0;
let providerUploadHost = "";
let providerDeletePath = "";
const createdAt = Math.floor(Date.now() / 1000);
const provider = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/reject") {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "rejected before upload" }));
    return;
  }
  if (request.method === "POST" && request.url === "/files") {
    const chunks = [];
    providerUploadLength = Number(request.headers["content-length"] || 0);
    providerUploadHost = String(request.headers.host || "");
    request.once("data", () => providerFirstChunkResolve());
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      providerUploadBody = Buffer.concat(chunks);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: "file-api-lifecycle",
        object: "file",
        bytes: png.byteLength,
        created_at: createdAt,
        filename: "lifecycle.png",
        purpose: "user_data",
        expires_at: createdAt + 3600,
      }));
    });
    return;
  }
  if (request.method === "DELETE") {
    providerDeletePath = String(request.url || "");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      id: "file-api-lifecycle",
      object: "file",
      deleted: true,
    }));
    return;
  }
  response.writeHead(404);
  response.end();
});

let providerPort = 0;
try {
  providerPort = await listen(provider);
} catch (error) {
  if (error?.code !== "EPERM") throw error;
  console.log("SKIP cloud-files-node: loopback listeners are unavailable in this sandbox; pure stream/token contracts still ran");
  if (previousSessionSecret === undefined) delete process.env.AI_SYSTEM6_SESSION_SECRET;
  else process.env.AI_SYSTEM6_SESSION_SECRET = previousSessionSecret;
  test.finish();
  process.exit(0);
}
const fakeBaseUrl = `http://provider.invalid:${providerPort}`;
let earlySourcePulls = 0;
let earlySourceClosed = false;
const earlyResponse = await fetchHelpers.nodeRequestWithStream(
  `${fakeBaseUrl}/reject`,
  (async function* earlyRejectedSource() {
    try {
      for (let index = 0; index < 64; index += 1) {
        earlySourcePulls += 1;
        yield Buffer.alloc(1024);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } finally {
      earlySourceClosed = true;
    }
  })(),
  null,
  { "Content-Type": "application/octet-stream" },
  {
    method: "POST",
    contentLength: 64 * 1024,
    pinnedAddress: "127.0.0.1",
    pinnedFamily: 4,
  }
);
await new Promise((resolve) => setTimeout(resolve, 15));
test.assert(
  earlyResponse.status === 401 && earlySourcePulls < 64 && earlySourceClosed,
  "an early provider rejection stops pulling the raw upload source"
);
const routeOptions = {
  isPublic: false,
  resolveCloudTarget: async () => ({
    baseUrl: fakeBaseUrl,
    address: "127.0.0.1",
    family: 4,
  }),
  resolveCloudCredential: async ({ credentialId }) => credentialId === "cred-lifecycle" ? "fake-lifecycle-key" : "",
  nodeRequestWithStream: fetchHelpers.nodeRequestWithStream,
};
const routes = http.createServer((request, response) => {
  if (request.method === "POST") {
    cloudFileRoutes.handleCloudFilesUpload(request, response, routeOptions);
  } else if (request.method === "DELETE") {
    cloudFileRoutes.handleCloudFilesDelete(request, response, routeOptions);
  } else {
    response.writeHead(405);
    response.end();
  }
});
const routePort = await listen(routes);

try {
  let uploadResponseResolve;
  let uploadResponseReject;
  const uploadResponse = new Promise((resolve, reject) => {
    uploadResponseResolve = resolve;
    uploadResponseReject = reject;
  });
  const uploadRequest = http.request({
    host: "127.0.0.1",
    port: routePort,
    path: "/api/cloud/files",
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "X-AI-System6-File-Name": encodeURIComponent("lifecycle.png"),
      "X-AI-System6-File-Bytes": String(png.byteLength),
      "X-AI-System6-Cloud-Credential-ID": "cred-lifecycle",
    },
  }, (response) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => uploadResponseResolve({
      status: response.statusCode || 0,
      json: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    }));
  });
  uploadRequest.once("error", uploadResponseReject);
  uploadRequest.write(png.subarray(0, 12));
  await withDeadline(providerFirstChunk, "provider first upload chunk");
  let responseSettledBeforeSourceEnd = false;
  uploadResponse.then(() => { responseSettledBeforeSourceEnd = true; });
  await new Promise((resolve) => setImmediate(resolve));
  test.assert(!responseSettledBeforeSourceEnd, "the route does not fabricate completion before the raw source ends");
  uploadRequest.end(png.subarray(12));
  const uploaded = await withDeadline(uploadResponse, "upload response");

  test.assert(uploaded.status === 200, "raw image upload returns a signed file token");
  test.assert(typeof uploaded.json.file_token === "string" && uploaded.json.file_token.startsWith("cf1."), "upload exposes only a signed token");
  test.assert(uploaded.json.provider_file_id === undefined, "upload does not expose a separate provider file id");
  test.assert(providerUploadBody.byteLength === providerUploadLength, "the provider receives the exact multipart length");
  test.assert(providerUploadHost === `provider.invalid:${providerPort}`, "pinned DNS keeps the original HTTP Host identity");
  test.assert(providerUploadBody.includes(png), "the streamed multipart body contains the original image bytes");

  const lifecycleVerified = verifyCloudFileToken(uploaded.json.file_token, {
    apiKey: "fake-lifecycle-key",
    baseUrl: fakeBaseUrl,
    sessionNonce: "",
    isPublic: false,
  });
  test.assert(lifecycleVerified.fileId === "file-api-lifecycle", "the route token is usable by the chat boundary");

  const deleteBody = JSON.stringify({ file_token: uploaded.json.file_token });
  const deleted = await requestJson(routePort, "DELETE", {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(deleteBody)),
    "X-AI-System6-Cloud-Credential-ID": "cred-lifecycle",
  }, deleteBody);
  test.assert(deleted.status === 200 && deleted.json.deleted === true, "DELETE removes the provider file");
  test.assert(deleted.json.already_absent === false, "a provider-confirmed delete is not marked absent");
  test.assert(providerDeletePath === "/files/file-api-lifecycle", "DELETE addresses the verified provider file id");

  const localRawKey = await requestJson(routePort, "POST", {
    "Content-Type": "image/png",
    "Content-Length": String(png.byteLength),
    "X-AI-System6-File-Name": encodeURIComponent("local-raw-key.png"),
    "X-AI-System6-File-Bytes": String(png.byteLength),
    "X-AI-System6-Cloud-API-Key": "must-not-cross-local-boundary",
  }, png);
  test.assert(
    localRawKey.status === 400 && localRawKey.json.code === "invalid_cloud_credential_header",
    "local upload accepts a vault credential id or operator key, never a browser-supplied raw key"
  );

  const sessionPayload = Buffer.from(JSON.stringify({
    v: 1,
    nonce: publicSessionNonce,
    exp: Math.floor(Date.now() / 1000) + 600,
  })).toString("base64url");
  const { createHmac } = await import("node:crypto");
  const sessionSignature = createHmac("sha256", process.env.AI_SYSTEM6_SESSION_SECRET)
    .update(sessionPayload)
    .digest("base64url");
  let publicCredentialResolverCalled = false;
  routeOptions.isPublic = true;
  routeOptions.resolveCloudCredential = async () => {
    publicCredentialResolverCalled = true;
    return "operator-shared-key-must-not-be-used";
  };
  const missingByok = await requestJson(routePort, "POST", {
    "Content-Type": "image/png",
    "Content-Length": String(png.byteLength),
    "Cookie": `ai_system6_public_session=${sessionPayload}.${sessionSignature}`,
    "X-AI-System6-File-Name": encodeURIComponent("public.png"),
    "X-AI-System6-File-Bytes": String(png.byteLength),
  }, png);
  test.assert(
    missingByok.status === 400 && missingByok.json.code === "missing_byok_key",
    "public upload refuses a request without BYOK"
  );
  test.assert(!publicCredentialResolverCalled, "public upload never falls back to an operator or shared key");
} finally {
  await close(routes);
  await close(provider);
  if (previousSessionSecret === undefined) delete process.env.AI_SYSTEM6_SESSION_SECRET;
  else process.env.AI_SYSTEM6_SESSION_SECRET = previousSessionSecret;
}

test.finish();
