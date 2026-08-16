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

const guide = html.match(/<section class="window guide-window[\s\S]*?<section class="window rebuild-flow-window/)?.[0] || "";
const welcomeDisk = html.match(/<section class="window finder-window welcome-disk-window[\s\S]*?<section class="window guide-window/)?.[0] || "";
const quickDraft = html.match(/<section class="window draft-desk-window[\s\S]*?<section class="window image-manager-window/)?.[0] || "";
const control = html.match(/<aside class="window control-panel[\s\S]*?<aside class="window chooser-panel/)?.[0] || "";
const applications = html.match(/<section class="window finder-window applications-window[\s\S]*?<section class="window draft-desk-window/)?.[0] || "";
const desktop = html.match(/<section class="icon-column"[\s\S]*?<\/section>\s*<\/main>/)?.[0] || "";

// Welcome Floppy orients without opening a writing surface. The writing routes
// stay where they live.
test.assertNotIncludes(guide, 'data-action="guide-start-quick-draft"', "Start Here does not put a first-time visitor into a draft");
test.assertIncludes(html, '<button data-workspace-capability="studio" data-action="guide-start-route"', "the long-project route stays in the Special menu");

// Pinning the markup is not the same as pressing the item. "Start Writing
// Route" sat in the Apple menu with no entry in the command registry: it
// looked live, took the click, and did nothing, while three contracts
// asserted its markup and none of them dispatched it. Every action the shell
// declares has to be answerable by something.
const declaredActions = [...new Set([...html.matchAll(/data-action="([a-z0-9-]+)"/g)].map((m) => m[1]))];
const answeredActions = new Set([
  // Registry keys, written as `"id": handler,` in the handler table.
  ...[...actions.matchAll(/^\s{4}"([a-z0-9-]+)":/gm)].map((m) => m[1]),
  // Features that answer an id themselves, as `action === "id"`.
  ...[...cloud.matchAll(/action === "([a-z0-9-]+)"/g)].map((m) => m[1]),
]);
for (const action of declaredActions) {
  test.assert(answeredActions.has(action), `the shell's ${action} reaches a handler`);
}

test.assertIncludes(desktop, 'data-action="open-quick-draft"', "the short-draft route stays on the desktop");
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
test.assertIncludes(welcomeDisk, 'data-action="welcome-iphone-help"', "Add to Home Screen help is discoverable as a conditional Welcome Floppy object");
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

test.assertIncludes(guide, 'data-i18n="welcome_read_me_hint"', "Read Me First explicitly leaves the next step to the user");
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

for (const document of ["docs/ARCHITECTURE.md", "docs/design/DESIGN.md", "docs/design/HIG.md"]) {
  const source = read(document);
  test.assertMatches(source, /first[- ](?:success|finished work)/i, `${document} carries the first-success budget`);
  test.assertMatches(source, /(?:existing|saved) work safer/i, `${document} carries the durability budget`);
  test.assertMatches(source, /(?:returning to\s+work clearer|easier to resume|resumption clearer)/i, `${document} carries the resume budget`);
}

// SideAsk was a mode reachable from two windows' own buttons. As a Desk
// Accessory on the Apple menu it must stay a Desk Accessory: summoned from the
// system menu, floating over the work rather than replacing it, and honest that
// its reply is not saved. A pad that displaced the window it reads would be
// useless, and that is exactly what it did before it was registered as one.
const shell = read("app/core/multi-finder.js");
const windows = read("app/core/window-manager.js");
const sideAsk = read("app/features/sideask-pad.js");
test.assertIncludes(html, 'data-action="open-sideask-pad"', "SideAsk is summonable from the system-wide Apple menu");
test.assertIncludes(shell, 'sideAskPad: "accessories"', "SideAsk is a Desk Accessory, so summoning it does not displace the front window");
test.assertMatches(windows, /isDeskAccessorySidecar[\s\S]{0,200}sideAskPad/, "SideAsk sits beside the work as a sidecar, like Dictation and Translation Pad");
test.assertIncludes(sideAsk, 'sideask_pad_temporary', "the pad says its reply is not saved");
test.assertIncludes(sideAsk, 'await closeWindow("sideAskPad", true)', "promoting closes the pad, so the desk keeps one place to look");
test.assertIncludes(sideAsk, "prompt.value = carried", "promotion carries the exchange into ClioTalk instead of starting a second conversation");

// The Question Sheet exists to hold messy human material before any prose, and
// CLAUDE.md warns that a sparse sheet is what turns the assistant into a
// mouthpiece later. It was a blank page with one hint, so the writer did the
// remembering and the organising. Paired with the sheet, SideAsk turns around
// and interviews them — and the rule that makes the writer feel consulted
// rather than quizzed is that the interviewer may only ask what it could not
// answer itself.
test.assertIncludes(sideAsk, 'sideAskSubject?.name !== "questionSheet"', "the interview only runs against the surface that collects material");
test.assertIncludes(sideAsk, "Ask exactly ONE short, concrete question", "the interviewer asks one thing at a time, not a form");
test.assertIncludes(sideAsk, "Only ask what you could not answer yourself", "the interviewer asks for what only this writer knows");
test.assertMatches(sideAsk, /never praise, never evaluate their answer/, "the interviewer does not substitute flattery for needing the writer");
test.assertMatches(sideAsk, /function appendToQuestionSheet[\s\S]{0,400}body\.value = /, "answers land in the sheet the writer owns, verbatim");

// Karpathy's half of the method is that you ramble at it instead of composing:
// "I lean back, switch to voice, and go for ten minutes, complete stream of
// consciousness". The pad's answer field is an ordinary editable target, so
// the Dictation Pad already reaches it — verified live, the button lands
// inside the pad beside the field rather than on the window frame. Keep it an
// ordinary field: the moment it becomes something clever, dictation loses it.
test.assertMatches(sideAsk, /<textarea id="sideask-pad-question"/, "the answer field stays an ordinary textarea, which is what dictation can speak into");

test.finish();
