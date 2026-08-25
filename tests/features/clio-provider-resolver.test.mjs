// One resolver owns Clio's provider choice. Preference is persisted, fallback
// order follows the real deployment target, the submit path waits instead of
// opening an API form, and the product snapshot Clio sees is allowlisted:
// no credentials, endpoints, document bodies, or lease-owner identifiers.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-provider-resolver");
const resolver = read("app/core/clio-provider-resolver.js");
const productContext = read("app/core/product-context.js");
const chatMessages = read("app/core/chat-messages.js");
const persistence = read("app/core/persistence-status.js");
const cloudModel = read("app/features/cloud-model.js");
const wireup = read("app/core/wireup.js");

// --- Preference: persisted, validated, migrated -----------------------------

test.assertIncludes(resolver, 'const validPreferences = new Set(["auto", "local", "website", "byok"]);', "the preference is a closed set");
test.assertMatches(
  persistence,
  /clioProviderPreference = \["auto", "local", "website", "byok"\]\.includes\(settings\.clioProviderPreference\)\s*\n\s*\? settings\.clioProviderPreference\s*\n\s*: "auto";/,
  "stored preferences load validated; new users default to auto"
);
test.assertMatches(persistence, /^\s*clioProviderPreference,$/m, "the preference persists through the ordinary settings record");
test.assertIncludes(cloudModel, 'window.AISystem6ClioProvider?.setPreference?.("byok")', "explicitly configuring an own API key becomes an explicit BYOK choice");
test.assertIncludes(wireup, 'window.AISystem6ClioProvider?.setPreference?.("local")', "explicitly connecting a local model becomes an explicit local choice");

// --- Fallback order follows the deployment target ----------------------------

test.assertMatches(
  resolver,
  /target === "mac"\s*\n\s*\? \["local", "website", "byok"\]/,
  "the Mac auto order is LM Studio, then Website Shared AI, then BYOK"
);
test.assertMatches(
  resolver,
  /\["vps", "pages"\]\.includes\(target\)\s*\n\s*\? \["website", "byok"\]/,
  "VPS and Pages auto order starts from the same-origin Website Shared AI"
);
test.assertIncludes(resolver, ': ["local", "byok"]', "an ordinary local web run tries the local provider first");
test.assertIncludes(resolver, ": [selectedPreference];", "an explicit preference never silently falls back across providers");
test.assertIncludes(resolver, "capabilities?.deployment_target", "the deployment target comes from the capability document");
test.assertNotIncludes(resolver, "location.hostname", "the resolver never guesses the deployment from the hostname");

// --- Bounded probes and the fixed Mac start door ------------------------------

test.assertIncludes(resolver, 'signal: abortSignal(target === "mac" ? 1500 : 2500)', "the first local probe is a bounded fast check");
test.assertIncludes(resolver, '"local.lmstudio.start"', "the Mac launch goes through the one registered start capability");
test.assertIncludes(resolver, "abortSignal(6500)", "waiting for LM Studio to start is bounded");
test.assertNotMatches(resolver, /lms get|download/i, "the resolver never requests a model download");

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

// --- Help actions stay deterministic ------------------------------------------

test.assertIncludes(chatMessages, "!getApplicationCommandRegistry()?.has(action)", "help actions must exist in the central command registry");
test.assertIncludes(chatMessages, ".filter(Boolean).slice(0, 3);", "at most three deterministic help actions render");
test.assertMatches(
  chatMessages,
  /workspaceProfile === workspaceProfileDesktop && clioStudioHelpActions\.has\(action\)[\s\S]{0,80}action = "open-writing-studio";/,
  "Desktop-profile writing-route suggestions route through Writing Studio"
);

test.finish();
