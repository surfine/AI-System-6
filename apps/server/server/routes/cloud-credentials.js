"use strict";

const { readJsonBody, sendJson } = require("../lib/http.js");
const { resolveCloudTarget } = require("../cloud.js");
const {
  deleteCloudCredential,
  discardStagedCredential,
  persistCloudCredential,
  resolveCloudCredential,
  stageCloudCredential,
} = require("../credential-vault.js");

async function handleCloudCredentials(req, res) {
  const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
  const action = String(body.action || "stage");

  if (action === "stage") {
    const provider = String(body.provider || "deepseek");
    const { baseUrl } = await resolveCloudTarget(body.base_url);
    const credentialId = stageCloudCredential({
      provider,
      baseUrl,
      apiKey: body.api_key,
    });
    sendJson(res, 200, {
      credential_id: credentialId,
      persistence: "service-session",
    }, { "Cache-Control": "no-store" });
    return;
  }

  if (action === "persist") {
    const result = await persistCloudCredential(body.credential_id);
    sendJson(res, 200, {
      credential_id: result.credentialId,
      persistence: result.persistence,
    }, { "Cache-Control": "no-store" });
    return;
  }

  if (action === "delete") {
    await deleteCloudCredential(body.credential_id);
    sendJson(res, 200, { deleted: true }, { "Cache-Control": "no-store" });
    return;
  }

  if (action === "discard") {
    discardStagedCredential(body.credential_id);
    sendJson(res, 200, { discarded: true }, { "Cache-Control": "no-store" });
    return;
  }

  if (action === "available") {
    const { baseUrl } = await resolveCloudTarget(body.base_url);
    const apiKey = await resolveCloudCredential({
      credentialId: body.credential_id,
      provider: body.provider || "deepseek",
      targetBaseUrl: baseUrl,
    });
    sendJson(res, 200, { available: !!apiKey }, { "Cache-Control": "no-store" });
    return;
  }

  sendJson(res, 400, {
    error: "Unknown credential action.",
    code: "unknown_credential_action",
  });
}

module.exports = { handleCloudCredentials };
