// Start Here is the first-run wizard. It shows the one thing blocking the user
// — connect a model — and only then offers the ways in. The setup is a remote
// control over the Control Panel's own inputs, so there is no second copy of the
// model configuration to drift.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("start-here-guide");
const appEntry = read("app.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const cloudModel = read("app/features/cloud-model.js");
const exportImport = read("app/features/export-import.js");
const dictionary = read("app/data/system-dictionary.js");
const guide = read("app/features/writer-guide.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// State-aware: setup first, route second.
test.assertIncludes(guide, "function guideModelReady()", "the guide knows whether a model can actually answer");
test.assertNotIncludes(guide, "|| !!localName", "a remembered model name does not count as a usable API");
test.assertIncludes(guide, "function renderGuideStep()", "the guide renders one step at a time");
test.assertIncludes(html, 'id="guide-setup-step"', "there is a setup step");
test.assertIncludes(html, 'id="guide-route-step"', "there is a route step");

// The public web build blocks local-model routes, so only the cloud path exists.
test.assertIncludes(guide, "function guideLocalModelsAllowed()", "the local path is hidden where local models are blocked");

// Two real tabs, not two buttons.
test.assertIncludes(html, 'role="tablist"', "the model source is a tab list");
test.assertIncludes(html, 'class="system-tab is-active"', "one tab starts selected");
test.assertIncludes(guide, 'button.setAttribute("aria-selected"', "tab selection is exposed to assistive tech");

// Remote control, not a second implementation.
test.assertIncludes(guide, '#cloud-api-key', "the guide writes into the Control Panel's own key field");
test.assertIncludes(guide, '#cloud-check-status', "the guide triggers the Control Panel's own check");
test.assertIncludes(guide, "connectLocalLmStudio({ toggle: false })", "the local path awaits the Control Panel's own connect");

// A verified cloud key is a device setting, not a per-session chore and not a
// project artifact.
test.assertIncludes(appEntry, "persistedConfig.apiKey", "the cloud key is restored from durable device settings");
test.assertIncludes(appEntry, "localStorage.setItem(CLOUD_STORAGE_KEY", "cloud configuration is persisted on this device");
test.assertNotIncludes(appEntry, "delete persistedConfig.apiKey", "saving cloud configuration does not strip the key back to session-only storage");
test.assertIncludes(appEntry, "sessionStorage.removeItem(CLOUD_SESSION_KEY)", "older session-only keys migrate out of session storage");
test.assertIncludes(cloudModel, "cloudApiKeyEl.value = cloudConfig.apiKey || \"\"", "the Control Panel restores the remembered key");
test.assertIncludes(guide, "guideCloudKey.value = cloudConfig.apiKey", "first-use setup restores a remembered key instead of asking again");
test.assertNotIncludes(exportImport, "CLOUD_STORAGE_KEY", "project export never reads the device credential store");
test.assertIncludes(dictionary, "remembers that credential as a setting on this device", "System Help explains device-level credential persistence");
test.assertIncludes(dictionary, "密钥绝不会进入项目硬盘文件", "Chinese System Help explains the credential boundary");

// Never leave the user on a transient status. The Control Panel disables its
// button while checking, so that edge is the authoritative completion signal.
test.assertIncludes(guide, "checkButton.disabled === false", "the guide waits for the check to actually finish");
test.assertIncludes(guide, "is-connected", "the guide reads the settled result, not a spinner");
test.assertIncludes(desktopRuntime, "if (!guideSeen)", "first launch opens setup before the desktop");
test.assertNotIncludes(desktopRuntime, "!guideSeen || !modelReady", "an explicit model-free choice is not overridden on the next launch");
test.assertIncludes(guide, 't(ready ? "guide_later" : "guide_without_model")', "setup offers an explicit model-free exit");
test.assertIncludes(en, 'guide_without_model: "Continue without AI"', "the English model-free exit is unambiguous");
test.assertIncludes(zh, 'guide_without_model: "暂不使用 AI"', "the Chinese model-free exit is unambiguous");
test.assertIncludes(html, 'id="cloud-model-indicator"', "the existing menu-bar model indicator remains the status surface");
test.assertIncludes(cloudModel, 'data-action="open-model-settings"', "the disconnected indicator leads back to the existing model settings");
for (const key of ["guide_setup_still_checking", "guide_setup_needs_cloud_model", "guide_setup_failed"]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}

// Two ways in once a model answers.
test.assertIncludes(html, 'data-action="guide-start-route"', "one way in is the writing route");
test.assertIncludes(html, 'data-action="guide-open-cliotalk"', "the other way in is ClioTalk");

test.finish();
