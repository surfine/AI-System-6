import vm from "node:vm";
import { createRequire } from "node:module";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("credential-boundary");
const require = createRequire(import.meta.url);
const credentialVault = require("../../apps/server/server/credential-vault.js");
const app = read("app.js");
const persistence = read("app/core/persistence-status.js");
const cloudModel = read("app/features/cloud-model.js");
const liquidCover = read("app/features/liquid-cover.js");
const cloudChat = read("apps/server/server/routes/cloud-chat.js");
const cloudStatus = read("apps/server/server/routes/cloud-status.js");
const router = read("apps/server/server/router.js");

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    value(key) {
      return values.get(key);
    },
  };
}

const cloudStart = app.indexOf("let cloudConfig = null;");
const cloudEnd = app.indexOf("function getLocalModelRequestName()");
test.assert(cloudStart >= 0 && cloudEnd > cloudStart, "cloud credential helpers have a testable boundary");
const cloudHelpers = app.slice(cloudStart, cloudEnd);
const localStorage = storage({
  "ai-system6-cloud-config": JSON.stringify({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    active: true,
    apiKey: "legacy-secret",
  }),
});
const sessionStorage = storage();
const context = vm.createContext({
  localStorage,
  sessionStorage,
  document: { documentElement: { dataset: {} } },
  window: {},
});
vm.runInContext(
  `${cloudHelpers}
  window.cloudCredentialTest = {
    loadCloudConfig,
    saveCloudConfig,
    cloudCredentialReady,
    cloudCredentialMode,
    cloudCredentialTransportFields,
    getRuntimeKey: () => cloudRuntimeApiKey,
    setRuntimeKey: setCloudRuntimeApiKey,
    setSharedAvailable: setPublicSharedCloudAvailable,
    getConfig: () => cloudConfig,
    setConfig: (value) => { cloudConfig = value; },
  };`,
  context
);

const migrated = context.window.cloudCredentialTest.loadCloudConfig();
test.assert(!migrated.apiKey, "a legacy key is removed from the browser cloud config");
test.assert(
  context.window.cloudCredentialTest.getRuntimeKey() === "legacy-secret",
  "a legacy key survives only long enough for one local-service migration"
);
test.assert(
  !JSON.parse(localStorage.value("ai-system6-cloud-config")).apiKey,
  "legacy cloud keys are removed from localStorage"
);
test.assert(
  !sessionStorage.value("ai-system6-cloud-api-key"),
  "legacy cloud keys are removed from sessionStorage"
);

context.window.cloudCredentialTest.setConfig({
  provider: "deepseek",
  model: "deepseek-v4-pro",
  active: true,
  credentialId: "cred-0123456789abcdef0123456789abcdef",
});
context.window.cloudCredentialTest.setRuntimeKey("");
context.window.cloudCredentialTest.saveCloudConfig();
test.assert(
  !JSON.parse(localStorage.value("ai-system6-cloud-config")).apiKey,
  "saving cloud preferences never writes the key to localStorage"
);
test.assert(
  JSON.parse(localStorage.value("ai-system6-cloud-config")).credentialId === "cred-0123456789abcdef0123456789abcdef",
  "browser persistence keeps only the local-service credential ID"
);
test.assert(
  !sessionStorage.value("ai-system6-cloud-api-key"),
  "saving cloud preferences never writes the key to sessionStorage"
);
test.assert(
  context.window.cloudCredentialTest.cloudCredentialTransportFields()._cloud_credential_id
    === "cred-0123456789abcdef0123456789abcdef",
  "model requests carry a credential ID instead of a key"
);

context.document.documentElement.dataset.deploymentProfile = "public";
context.window.cloudCredentialTest.setConfig({
  provider: "deepseek",
  model: "deepseek-v4-flash",
  active: false,
});
context.window.cloudCredentialTest.setRuntimeKey("");
context.window.cloudCredentialTest.setSharedAvailable(true);
test.assert(
  context.window.cloudCredentialTest.cloudCredentialReady()
    && context.window.cloudCredentialTest.cloudCredentialMode() === "shared",
  "public cloud can use the server allowance without exposing its key"
);
test.assert(
  Object.keys(context.window.cloudCredentialTest.cloudCredentialTransportFields()).length === 0,
  "shared cloud requests send no credential to the browser transport"
);
context.window.cloudCredentialTest.setRuntimeKey("user-tab-secret");
test.assert(
  context.window.cloudCredentialTest.cloudCredentialMode() === "byok"
    && context.window.cloudCredentialTest.cloudCredentialTransportFields()._cloud_api_key === "user-tab-secret",
  "a user-supplied key takes explicit precedence for the current tab"
);
context.window.cloudCredentialTest.saveCloudConfig();
test.assert(
  !JSON.parse(localStorage.value("ai-system6-cloud-config")).apiKey
    && !sessionStorage.value("ai-system6-cloud-api-key"),
  "public BYOK remains out of persistent browser storage"
);

const stagedId = credentialVault.stageCloudCredential({
  provider: "test-provider",
  baseUrl: "https://example.invalid",
  apiKey: "server-only-secret",
});
const resolvedSecret = await credentialVault.resolveCloudCredential({
  credentialId: stagedId,
  provider: "test-provider",
  targetBaseUrl: "https://example.invalid",
});
test.assert(resolvedSecret === "server-only-secret", "the local service resolves a staged credential by ID");
let scopeMismatch = null;
try {
  await credentialVault.resolveCloudCredential({
    credentialId: stagedId,
    provider: "test-provider",
    targetBaseUrl: "https://other.example.invalid",
  });
} catch (error) {
  scopeMismatch = error;
}
test.assert(
  scopeMismatch?.code === "credential_scope_mismatch"
    && !String(scopeMismatch?.message || "").includes("server-only-secret"),
  "a staged credential is rejected before use when the target scope changes"
);
const ignoredDirectSecret = await credentialVault.resolveCloudCredential({
  provider: "test-provider",
  targetBaseUrl: "https://example.invalid",
  suppliedApiKey: "request-secret",
  allowSupplied: false,
});
test.assert(!ignoredDirectSecret, "local routes do not accept a request-supplied key as a model credential");
credentialVault.discardStagedCredential(stagedId);

const normalizedScopeId = credentialVault.createCredentialId("deepseek", "https://EXAMPLE.invalid/api/");
test.assert(
  normalizedScopeId === credentialVault.createCredentialId("DeepSeek", "https://example.invalid/api"),
  "provider case and a trailing slash normalize to the same credential scope"
);
test.assert(
  normalizedScopeId !== credentialVault.createCredentialId("other", "https://example.invalid/api")
    && normalizedScopeId !== credentialVault.createCredentialId("deepseek", "https://example.invalid:8443/api")
    && normalizedScopeId !== credentialVault.createCredentialId("deepseek", "https://example.invalid/other"),
  "provider, port, and path remain distinct credential scopes"
);

const expiryStart = 10_000;
const expiringId = credentialVault.stageCloudCredential({
  provider: "expiry-test",
  baseUrl: "https://expiry.example.invalid",
  apiKey: "expiry-secret",
  now: expiryStart,
});
const expiredSecret = await credentialVault.resolveCloudCredential({
  credentialId: expiringId,
  provider: "expiry-test",
  targetBaseUrl: "https://expiry.example.invalid",
  now: expiryStart + credentialVault.stagedCredentialConfig.ttlMs,
});
test.assert(!expiredSecret, "expired service-session credentials cannot be resolved");

const evictionIds = [];
for (let index = 0; index <= credentialVault.stagedCredentialConfig.maxEntries; index += 1) {
  evictionIds.push(credentialVault.stageCloudCredential({
    provider: "eviction-test",
    baseUrl: `https://eviction.example.invalid/${index}`,
    apiKey: `eviction-secret-${index}`,
    now: 20_000 + index,
  }));
}
const evictedSecret = await credentialVault.resolveCloudCredential({
  credentialId: evictionIds[0],
  provider: "eviction-test",
  targetBaseUrl: "https://eviction.example.invalid/0",
  now: 30_000,
});
const newestSecret = await credentialVault.resolveCloudCredential({
  credentialId: evictionIds.at(-1),
  provider: "eviction-test",
  targetBaseUrl: `https://eviction.example.invalid/${credentialVault.stagedCredentialConfig.maxEntries}`,
  now: 30_000,
});
test.assert(!evictedSecret && newestSecret, "the staged credential cap safely evicts the oldest session entry");
evictionIds.forEach((credentialId) => credentialVault.discardStagedCredential(credentialId));

const priorDeepSeekKey = process.env.DEEPSEEK_API_KEY;
process.env.DEEPSEEK_API_KEY = "environment-secret-test";
const trustedEnvironmentSecret = await credentialVault.resolveCloudCredential({
  provider: "deepseek",
  targetBaseUrl: "https://api.deepseek.com",
});
const customEnvironmentSecret = await credentialVault.resolveCloudCredential({
  provider: "deepseek",
  targetBaseUrl: "https://custom.example.invalid",
});
if (priorDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
else process.env.DEEPSEEK_API_KEY = priorDeepSeekKey;
test.assert(
  trustedEnvironmentSecret === "environment-secret-test" && !customEnvironmentSecret,
  "the DeepSeek environment key is available only to a trusted DeepSeek target"
);

const settingsStart = persistence.indexOf("function settingsSnapshotPayload()");
const settingsEnd = persistence.indexOf("function storageSnapshotChanged", settingsStart);
const settingsSnapshotSource = persistence.slice(settingsStart, settingsEnd);
test.assert(
  !settingsSnapshotSource.includes("localApiToken"),
  "the IndexedDB settings snapshot excludes the local model token"
);
test.assertIncludes(
  persistence,
  'sessionStorage.setItem(localApiTokenSessionKey, token)',
  "the local model token is scoped to sessionStorage"
);

const popoverStart = cloudModel.indexOf("window.renderCloudModelPopover");
const popoverEnd = cloudModel.indexOf("function updateCheckButtonState", popoverStart);
const popoverSource = cloudModel.slice(popoverStart, popoverEnd);
test.assert(!popoverSource.includes("innerHTML"), "the model popover has no dynamic innerHTML sink");
test.assertIncludes(popoverSource, "replaceChildren", "the model popover replaces nodes through DOM APIs");
test.assertIncludes(cloudModel, "element.textContent = String(text)", "dynamic popover values become text nodes");
test.assertNotIncludes(cloudModel, "cloudConfig.apiKey", "Control Panel never stores the API key on cloudConfig");
test.assertIncludes(cloudModel, 'fetch("/api/cloud/credentials"', "Control Panel stages credentials with the local service");
test.assertIncludes(cloudModel, 'cloudApiKeyEl.value = ""', "Control Panel clears the key field after staging");
test.assertIncludes(cloudModel, 'changeLocalCredential("available"', "Control Panel verifies restored credential references with the local service");
test.assertIncludes(cloudModel, 'cloudConfig.credentialId = ""', "Control Panel clears a restored credential reference that no longer resolves");
test.assertIncludes(cloudChat, "resolveCloudCredential", "cloud chat resolves credentials inside the local service");
test.assertIncludes(cloudChat, "const usingSharedCloud = isPublicDeployment && !suppliedPublicApiKey", "public BYOK never silently falls back while a user key is present");
test.assertIncludes(cloudChat, "delete raw._cloud_credential_id", "credential IDs never reach the provider payload");
test.assertIncludes(cloudStatus, "if (connected && !usingSharedCloud)", "the public shared account balance is not exposed to visitors");
test.assertIncludes(cloudStatus, "credentialId: body.credential_id", "status checks accept the local credential reference");
test.assertIncludes(router, '["POST /api/cloud/credentials", handleCloudCredentials]', "credential registration is a guarded local API route");
const publicRoutes = router.match(/const publicExactRouteKeys = new Set\(\[[\s\S]*?\]\);/)?.[0] || "";
test.assertNotIncludes(publicRoutes, "/api/cloud/credentials", "the public deployment cannot mutate the local credential vault");

const imageSaveStart = liquidCover.indexOf("function saveImgCfg()");
const imageSaveEnd = liquidCover.indexOf("function imageCfg()", imageSaveStart);
const imageSaveSource = liquidCover.slice(imageSaveStart, imageSaveEnd);
const persistentConfigStart = imageSaveSource.indexOf("JSON.stringify({");
const persistentImageConfig = imageSaveSource.slice(
  persistentConfigStart,
  imageSaveSource.indexOf("}));", persistentConfigStart) + 4
);
test.assert(
  !persistentImageConfig.includes("apiKey"),
  "Cover Glass image settings do not persist the image API key"
);
test.assertIncludes(
  imageSaveSource,
  "sessionStorage.setItem(IMG_KEY_SESSION_KEY, apiKey)",
  "Cover Glass keeps its separate image-provider key scoped to sessionStorage"
);

test.finish();
