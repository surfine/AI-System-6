// Product-completion contract: first success, recovery, Web distribution,
// durable storage, and final delivery stay simpler than the full feature set.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("product-completion");
const html = read("index.html");
const actions = read("app/core/actions.js");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const draftDesk = read("app/features/draft-desk.js");
const handoff = read("app/features/quick-draft-handoff.js");
const documents = read("app/features/documents-chat.js");
const projectCd = read("app/features/export-import.js");
const webPlatform = read("app/core/web-platform.js");
const recovery = read("app/core/user-recovery-messages.js");
const persistence = read("app/core/persistence-status.js");
const cloud = read("app/features/cloud-model.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const smoke = read("docs/RELEASE-SMOKE.md");

const guide = html.match(/<section class="window guide-window[\s\S]*?<section class="window rebuild-flow-window/)?.[0] || "";
const quickDraft = html.match(/<section class="window draft-desk-window[\s\S]*?<section class="window image-manager-window/)?.[0] || "";
const control = html.match(/<aside class="window control-panel[\s\S]*?<aside class="window chooser-panel/)?.[0] || "";
const applications = html.match(/<section class="window finder-window applications-window[\s\S]*?<section class="window draft-desk-window/)?.[0] || "";
const desktop = html.match(/<section class="icon-column"[\s\S]*?<\/section>\s*<\/main>/)?.[0] || "";

test.assertIncludes(guide, 'data-action="guide-start-quick-draft"', "Start Here makes the short-draft route primary");
test.assertIncludes(guide, 'data-action="guide-start-route"', "Start Here names the long-project route separately");
test.assertIncludes(quickDraft, 'id="quick-draft-no-project"', "Draft Desk owns a no-project empty state");
test.assertIncludes(quickDraft, "data-quick-draft-create-project", "one action creates the required project");
test.assertMatches(desktopRuntime, /createDefaultProjectForDraftDesk[\s\S]*createProjectRecord[\s\S]*isProjectMounted = true[\s\S]*AISystem6QuickDraft\?\.open/, "the one action creates, mounts, and returns to Draft Desk");

test.assertIncludes(desktop, 'data-system-icon="startupDisk"', "the desktop retains one Startup Disk");
test.assertIncludes(desktop, 'id="active-project-drop-target"', "the desktop retains one Project Hard Disk entry");
test.assert(desktop.match(/id="active-project-drop-target"/g)?.length === 1, "the desktop has exactly one Project Hard Disk entry");
for (const action of ["open-quick-draft", "open-rag"]) test.assertIncludes(desktop, action, `fresh desktop exposes ${action}`);
test.assertIncludes(desktop, 'data-open="assistant"', "fresh desktop exposes ClioTalk");

test.assertMatches(draftDesk, /quickDraftAdvancedRevealed = false[\s\S]*button\.hidden = !hasBody \|\| !quickDraftAdvancedRevealed/, "Grain and Read stay undisclosed until Adjust is requested");
test.assertMatches(draftDesk, /button\.dataset\.quickDraftDrawer === "inspector"[\s\S]*quickDraftAdvancedRevealed = true/, "Adjust reveals advanced draft controls on demand");
test.assertIncludes(draftDesk, 'const action = hasBody ? "continue" : "draft";', "the stable primary action becomes Continue Writing after the first draft");
test.assertMatches(quickDraft, /quick-draft-save-project-doc[\s\S]*export-markdown[\s\S]*share-markdown[\s\S]*<hr \/>[\s\S]*teachtext[\s\S]*quick-draft-send-review/, "Deliver prioritizes save, download, share, then longer handoffs");

test.assertMatches(control, /use-website-ai[\s\S]*use-local-ai[\s\S]*show-ai-advanced[\s\S]*cloud-own-key-details/, "ordinary AI setup presents Website, Local, then Advanced routes");
test.assertMatches(control, /detect-local-models[\s\S]*local-manual-connection[\s\S]*local-connect-fields/, "local setup detects known apps before showing connection fields");
test.assertIncludes(control, 'id="reset-ai-connection"', "Control Panel exposes Reset AI Connection");
for (const forbiddenProvider of ["Groq", "Gemini", "Anthropic", "Claude"]) {
  test.assertNotIncludes(control, forbiddenProvider, `Control Panel does not add ${forbiddenProvider}`);
}
const resetBlock = persistence.match(/async function resetAiConnection\(\)[\s\S]*?\n}\n/)?.[0] || "";
for (const protectedState of ["projects", "chatFiles", "scraps", "mountedTextDisk"]) {
  test.assertNotIncludes(resetBlock, protectedState, `Reset AI Connection preserves ${protectedState}`);
}
test.assertIncludes(cloud, 'AISystem6UserRecoveryMessages?.text?.("cloudConnection")', "cloud errors include a recovery action instead of HTTP details");

const timeoutSource = boot.slice(boot.indexOf("function startupTaskWithTimeout"), boot.indexOf("\n\nasync function boot()"));
const context = vm.createContext({ console: { warn() {} }, setTimeout, clearTimeout, Promise });
vm.runInContext(`${timeoutSource}\nthis.startupTaskWithTimeout = startupTaskWithTimeout;`, context);
const invalidLocalResult = await context.startupTaskWithTimeout(Promise.reject(new Error("missing local model")), "local", 20);
const invalidCloudResult = await context.startupTaskWithTimeout(Promise.reject(new Error("invalid cloud provider")), "cloud", 20);
test.assert(invalidLocalResult === null, "an invalid local model resolves as unavailable instead of breaking boot");
test.assert(invalidCloudResult === null, "an invalid cloud provider resolves as unavailable instead of breaking boot");
test.assertMatches(boot, /document\.body\.dataset\.appReady = "ready"[\s\S]*startLocalModelMonitor\(\)/, "desktop readiness is established before ongoing model monitoring");

const manifest = JSON.parse(read("assets/app-icon/manifest.json"));
test.assert(manifest.name === "AI System 6" && manifest.short_name === "System 6", "the Web App Manifest has full and home-screen names");
test.assert(manifest.display === "standalone" && manifest.start_url === "/" && manifest.scope === "/", "the Web App Manifest launches in the site scope as a standalone app");
for (const marker of ["apple-mobile-web-app-capable", "apple-mobile-web-app-title", "apple-touch-icon", "viewport-fit=cover"]) {
  test.assertIncludes(html, marker, `iPhone metadata includes ${marker}`);
}
test.assertIncludes(guide, 'data-action="install-web-app"', "Add to Home Screen is discoverable from Start Here");
test.assertMatches(webPlatform, /beforeinstallprompt[\s\S]*prompt\.prompt\(\)[\s\S]*userChoice/, "supported browsers install only after the user invokes the action");
test.assertIncludes(webPlatform, "web_install_ios_steps", "iPhone receives the real Share to Add to Home Screen instruction");

for (const api of ["navigator.storage.persisted", "navigator.storage.persist()", "navigator.storage.estimate"]) {
  test.assertIncludes(webPlatform, api, `project storage uses ${api}`);
}
test.assertIncludes(html, 'id="status-project-storage"', "persistent storage status is visible in System Status");
test.assertMatches(handoff, /backupReminderShownAt[\s\S]*first_work_backup_reminder[\s\S]*actionId: "export-project-backup"/, "the first durable draft produces one actionable backup reminder");
test.assertIncludes(actions, '"export-project-backup": exportActiveProjectDisk', "the reminder exports the existing Project Hard Disk backup in one action");

for (const surface of [quickDraft, html, html]) {
  test.assertIncludes(surface, "share", "final work has a Share affordance");
}
test.assertIncludes(webPlatform, "navigator.canShare?.({ files: [file] })", "Share prefers a Markdown file when supported");
test.assertMatches(webPlatform, /\? \{ title: safeTitle, files: \[file\] \}[\s\S]*: \{ title: safeTitle, text \}/, "Share falls back from a file to Markdown text");
test.assertIncludes(documents, "async function shareActiveMarkdown", "TeachText shares its current Markdown");
test.assertIncludes(projectCd, "async function shareSelectedProjectCdMarkdown", "Project CD shares the selected Markdown");
test.assertIncludes(webPlatform, 'button.hidden = !canShare', "unsupported Share controls are hidden before interaction");

test.assertIncludes(guide, 'data-action="guide-continue-last"', "Start Here reserves one light Continue entry");
test.assertMatches(applications, /open-quick-draft[\s\S]*app_desc_draft_desk[\s\S]*open-writing-studio[\s\S]*app_desc_writing_studio/, "Applications explains both short and long writing apps");
for (const key of ["app_desc_cliotalk", "app_desc_reader", "app_desc_searcher"]) {
  test.assertIncludes(applications, key, `Applications explains ${key}`);
}

for (const family of ["cloudConnection", "localConnection", "projectStorage"]) {
  test.assertMatches(recovery, new RegExp(`${family}:[\\s\\S]*message:[\\s\\S]*action:`), `${family} errors pair a message with a recovery action`);
}
for (const key of ["cloud_connection_failed_message", "cloud_connection_failed_action", "local_connection_failed_message", "local_connection_failed_action", "project_storage_unavailable_message", "project_storage_unavailable_action"]) {
  test.assertIncludes(en, `${key}:`, `English has ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese has ${key}`);
}

for (const path of ["Fresh Web", "No model", "Broken model", "iPhone Web"]) {
  test.assertIncludes(smoke, path, `manual release smoke covers ${path}`);
}
test.assertIncludes(smoke, "do not automate them as E2E tests", "completion paths remain manual rather than E2E");
for (const document of ["CLAUDE.md", "DESIGN.md", "HIG.md"]) {
  const source = read(document);
  test.assertMatches(source, /first[- ](?:success|finished work)/i, `${document} carries the first-success budget`);
  test.assertMatches(source, /(?:existing|saved) work safer/i, `${document} carries the durability budget`);
  test.assertMatches(source, /(?:returning to\s+work clearer|easier to resume|resumption clearer)/i, `${document} carries the resume budget`);
}

test.finish();
