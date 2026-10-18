// One resolver owns Clio's provider choice. Preference is persisted, fallback
// order follows the real deployment target, the submit path waits instead of
// opening an API form, and the product snapshot Clio sees is allowlisted:
// no credentials, endpoints, document bodies, or lease-owner identifiers.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-provider-resolver");
const resolver = read("app/core/clio-provider-resolver.js");
const productContext = read("app/core/product-context.js");
const chatMessages = read("app/core/chat-messages.js");
const persistence = read("app/core/persistence-status.js");
const cloudModel = read("app/features/cloud-model.js");
const wireup = read("app/core/wireup.js");

// --- Preference: persisted, validated, migrated -----------------------------

test.assertIncludes(resolver, 'const validPreferences = new Set(["auto", "local", "device", "website", "byok"]);', "the preference is a closed set");
test.assertMatches(
  persistence,
  /clioProviderPreference = \["auto", "local", "device", "website", "byok"\]\.includes\(settings\.clioProviderPreference\)\s*\n\s*\? settings\.clioProviderPreference\s*\n\s*: "auto";/,
  "stored preferences load validated; new users default to auto"
);
test.assertMatches(persistence, /^\s*clioProviderPreference,$/m, "the preference persists through the ordinary settings record");
test.assertIncludes(cloudModel, 'window.AISystem6ClioProvider?.setPreference?.("byok")', "explicitly configuring an own API key becomes an explicit BYOK choice");
test.assertIncludes(wireup, 'window.AISystem6ClioProvider?.setPreference?.("local")', "explicitly connecting a local model becomes an explicit local choice");

// --- Fallback order follows the deployment target ----------------------------

test.assertMatches(
  resolver,
  /target === "mac"\s*\n\s*\? \["local", "device", "website", "byok"\]/,
  "the Mac auto order is LM Studio, the on-device model, Website Shared AI, then BYOK"
);
test.assertMatches(
  resolver,
  /\["vps", "pages"\]\.includes\(target\)\s*\n\s*\? \["website", "byok"\]/,
  "VPS and Pages auto order starts from the same-origin Website Shared AI"
);
test.assertIncludes(resolver, ': ["local", "device", "byok"]', "an ordinary local web run tries the local provider first, then the on-device model");
test.assertIncludes(resolver, ": [selectedPreference];", "an explicit preference never silently falls back across providers");
test.assertIncludes(resolver, "capabilities?.deployment_target", "the deployment target comes from the capability document");
test.assertNotIncludes(resolver, "location.hostname", "the resolver never guesses the deployment from the hostname");

// --- Bounded probes and the fixed Mac start door ------------------------------

test.assertIncludes(resolver, 'signal: abortSignal(target === "mac" ? 1500 : 2500)', "the first local probe is a bounded fast check");
test.assertIncludes(resolver, '"local.lmstudio.start"', "the Mac launch goes through the one registered start capability");
test.assertIncludes(resolver, "abortSignal(6500)", "waiting for LM Studio to start is bounded");
test.assertNotMatches(resolver, /lms get|download/i, "the resolver never requests a model download");

// --- The on-device model is probed first and never swallows the walk ----------

test.assertIncludes(resolver, "const deviceProbe = candidates.includes(\"device\")", "the on-device status read starts before the walk, so a slow LM Studio launch cannot delay it");
test.assertNotIncludes(resolver, 'route: "device"', "the on-device model is never published as the general chat route, which ClioTalk readiness cannot serve");
test.assertMatches(resolver, /selectedPreference === "auto" \|\| selectedPreference === "device"\s*\n\s*\? \(target/, "a stored device preference walks like auto, so Website and key routes stay reachable");
test.assertMatches(resolver, /publish\(\{ device: \{ status: device\.available \? "available" : "unavailable", reason: device\.reason, engine: device\.engine \} \}\);\s*\n[^\n]*\n[^\n]*\n\s*continue;/, "the device candidate only publishes its status for the ask-only doors, then the walk continues");
test.assertIncludes(resolver, 'await ensureDeviceModelModule()', "the device client loads lazily, not at boot");

// --- Built-in first on the Mac's local route ----------------------------------

test.assertMatches(resolver, /const device = selectedPreference !== "local" && !localReady\(\) && deviceProbe \? await deviceProbe : null;\s*\n\s*if \(device\?\.engine === "mlx"\)/,
  "the local step takes the built-in model first, unless the writer picked LM Studio or already has a model loaded there");
test.assertIncludes(resolver, 'provider: "built-in"', "the built-in model is published as the local route's provider");
test.assertIncludes(resolver, '!(selectedPreference === "local" && existing.provider === "built-in")', "picking local after the built-in took the route hands it back to LM Studio");
test.assertIncludes(chatMessages, "builtIn?.active && builtIn.canServe(nextPayload)", "the local transport sends what the built-in model can read to it, and the rest to LM Studio");

// --- One in-flight resolution, sticky once a chat has output ------------------

test.assertIncludes(resolver, "if (inFlight && !options.force) return inFlight;", "concurrent resolves share one in-flight promise");
test.assertMatches(
  resolver,
  /function invalidate\(reason = "invalidated"\) \{\s*\n\s*if \(typeof conversation !== "undefined" && conversation\.length && state\.status === "ready"\) return copyState\(\);/,
  "a conversation with visible output keeps its provider instead of switching mid-chat"
);
test.assertIncludes(resolver, "window.AISystem6ClioProvider = Object.freeze({", "the resolver exposes a frozen API surface");
test.assertNotMatches(resolver, /localStorage|indexedDB/i, "the resolver persists nothing outside the settings record");

// --- The submit path waits instead of opening an API form ---------------------

test.assertMatches(
  chatMessages,
  /if \(!clioTalkModelReady\(\)\) \{\s*\n\s*setStatus\(t\("clio_provider_resolving_status"\)\);\s*\n\s*await window\.AISystem6ClioProvider\?\.resolve\?\.\(\{ reason: "submit" \}\);/,
  "sending waits for the resolver rather than demanding API setup first"
);
test.assertMatches(
  chatMessages,
  /if \(!clioTalkModelReady\(\)\) \{\s*\n\s*setStatus\(t\("clio_model_required_status"\)\);\s*\n\s*syncClioTalkModelAvailability\(\);\s*\n\s*return;/,
  "a failed resolution returns before the composer text is cleared"
);
test.assertIncludes(chatMessages, "const canResolve = window.AISystem6ClioProvider?.canAttempt?.() === true;", "Send stays available while a resolution is still possible");

// --- The welcome copy's promised check actually starts itself -----------------
// "Getting Clio ready..." tells the writer a background check is running, but
// resolve() used to run only on message submit — the module was never even
// loaded, so a writer with no model connected saw that text sit unchanged
// forever. The welcome render must kick the check off itself.

test.assertMatches(
  chatMessages,
  /if \(providerResolving && typeof ensureClioProviderResolver === "function"\) \{\s*\n\s*ensureClioProviderResolver\(\)\s*\n\s*\.then\(\(\) => window\.AISystem6ClioProvider\?\.resolve\?\.\(\{ reason: "welcome" \}\)\)/,
  "rendering the resolving welcome loads the resolver and starts the check it promises"
);

// --- The runtime snapshot is allowlisted --------------------------------------

for (const key of ["deploymentTarget", "appearance", "workspaceProfile", "writeMode", "remainingSessionRequests"]) {
  test.assertIncludes(productContext, key, `the snapshot names ${key}`);
}
test.assertMatches(
  productContext,
  /provider: \{\s*\n\s*route: String\(provider\.route \|\| ""\),\s*\n\s*provider: String\(provider\.provider \|\| ""\),\s*\n\s*model: String\(provider\.model \|\| ""\),\s*\n\s*status: String\(provider\.status \|\| "unknown"\),\s*\n\s*\},/,
  "the provider snapshot carries route, provider, model, and status only"
);
test.assertNotMatches(productContext, /apiKey|api_key|localApiToken|Authorization|secret/i, "no credential crosses the snapshot boundary");
test.assertNotMatches(productContext, /base_?url/i, "no endpoint URL crosses the snapshot boundary");
test.assertNotMatches(productContext, /ownerId|leaseOwner|lockOwner/, "no lease-owner identifier crosses the snapshot boundary");
test.assertNotMatches(productContext, /getDocumentBody|questionSheet|markdown|\.value\b/, "no document body crosses the snapshot boundary");
test.assertMatches(productContext, /project: \{\s*\n\s*mounted: Boolean\(project\),\s*\n\s*name: String\(project\?\.name \|\| ""\),\s*\n\s*\},/, "the project surfaces only its name and mounted state");

// --- Snapshot and topics enter context only for product questions -------------

test.assertMatches(
  chatMessages,
  /function clioProductRuntimeStateContext\(\) \{\s*\n\s*if \(clioProductHelpRoute\?\.route !== "product-help"\) return "";/,
  "the runtime snapshot joins the context only for product questions"
);

// --- A fresh desk connects itself ---------------------------------------------
//
// The local desk can reach the site's shared allowance over the bridge the
// Control Panel already offered as "Use Website AI": the session, the one-time
// verification and the shared-remote credential mode all existed, and a new
// install still met "Model not connected" on its first screen because nothing
// used them until somebody went looking for the button. The desk now makes that
// connection on its own, and anything the writer chose wins over it.
test.assertIncludes(cloudModel, "function connectSharedAiOnFirstRun", "a fresh desk has one first-run connection path");
test.assertIncludes(
  cloudModel,
  "if (!connected) connectSharedAiOnFirstRun(capabilities);",
  "and it runs once the deployment's capabilities are known",
);
test.assertIncludes(
  cloudModel,
  'target !== "mac"',
  "it is for the desk the bridge serves, not for a public deployment that already shares its own allowance",
);
for (const guard of [
  'clioProviderPreference !== "auto"',
  "cloudRuntimeApiKey || cloudConfig?.credentialId || cloudConfig?.active",
  "localModelState?.ready || localModelState?.loaded",
]) {
  test.assertIncludes(cloudModel, guard, `a stored choice wins over the first-run connection (${guard})`);
}
test.assertIncludes(
  cloudModel,
  "connectSharedWebsiteFallback().then(function (ready)",
  "the first-run path uses the existing bridge rather than a second one",
);

// --- Help actions stay deterministic ------------------------------------------

test.assertIncludes(chatMessages, "!getApplicationCommandRegistry()?.has(action)", "help actions must exist in the central command registry");
test.assertIncludes(chatMessages, ".filter(Boolean).slice(0, 3);", "at most three deterministic help actions render");
test.assertMatches(
  chatMessages,
  /workspaceProfile === workspaceProfileDesktop && clioStudioHelpActions\.has\(action\)[\s\S]{0,80}action = "open-writing-studio";/,
  "Desktop-profile writing-route suggestions route through Writing Studio"
);

// --- Behaviour: a stored "device" preference still reaches the general routes --

async function walk({ preference, deviceAvailable, cloud }) {
  const events = new EventTarget();
  const window = {
    dispatchEvent: (event) => events.dispatchEvent(event),
    addEventListener: (...args) => events.addEventListener(...args),
    AISystem6PublicAccess: { getCapabilities: async () => ({ deployment_target: "mac" }) },
    AISystem6DeviceModel: { status: async () => ({ available: deviceAvailable, reason: deviceAvailable ? null : "modelNotReady" }) },
  };
  const context = vm.createContext({
    window, document: { documentElement: { dataset: {} } }, CustomEvent, AbortSignal, console,
    clioProviderPreference: preference,
    ensureDeviceModelModule: async () => {},
    connectLocalLmStudio: async () => null,
    cloudConfig: cloud ? { active: true, provider: "p", model: "m" } : { active: false },
    cloudCredentialReady: () => Boolean(cloud),
    cloudCredentialMode: () => "byok",
  });
  vm.runInContext(resolver, context);
  return window.AISystem6ClioProvider.resolve({ force: true });
}

const deviceOnly = await walk({ preference: "device", deviceAvailable: true, cloud: false });
test.assert(deviceOnly.route !== "device" && deviceOnly.status === "unavailable" && deviceOnly.device.status === "available",
  "a device preference never publishes a device chat route, and the doors still see the model as available");
const deviceWithKey = await walk({ preference: "device", deviceAvailable: true, cloud: true });
test.assert(deviceWithKey.status === "ready" && deviceWithKey.route === "byok", "a device preference walks on to a key route for general chat");

test.finish();
