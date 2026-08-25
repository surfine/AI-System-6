import { createFeatureTest, read, windowApp } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("workspace-profile");
const profile = read("app/core/workspace-profile.js");
const manifest = read("tooling/runtime-manifest.mjs");
const persistence = read("app/core/persistence-status.js");
const actions = read("app/core/actions.js");
const windows = read("app/core/window-manager.js");
const session = read("app/core/working-session.js");
const app = read("app.js");
const html = read("index.html");
const runtime = read("app/core/desktop-runtime.js");
const wireup = read("app/core/wireup.js");
const teachText = read("app/features/teachtext-accessories.js");
const rolePolicy = read("app/core/document-role-policy.js");
const multiFinder = read("app/core/multi-finder.js");
const dragDrop = read("app/core/drag-drop.js");
const systemIcons = read("app/core/system-icons.js");
const menus = read("app/data/menus.js");
const quickDraftHandoff = read("app/features/quick-draft-handoff.js");

const teachTextMenusBlock = menus.slice(menus.indexOf("const teachTextMenus"), menus.indexOf("const quickDraftMenus"));
const quickDraftMenusBlock = menus.slice(menus.indexOf("const quickDraftMenus"), menus.indexOf("const clioTalkMenus"));

test.assertIncludes(manifest, '"app/core/workspace-profile.js"', "loads the central profile policy");
test.assertIncludes(profile, 'let workspaceProfile = workspaceProfileWriting', "keeps the existing writing experience as the default");
test.assertMatches(runtime, /if \(!clioOnboardingCompleted\) \{[\s\S]*setWorkspaceProfile\(workspaceProfileDesktop, \{ persist: false \}\)[\s\S]*openFirstRunClioTalk\(\)/, "opens first-run ClioTalk on the Desktop without changing the legacy profile default");
test.assertIncludes(profile, "applyDeploymentWorkspaceDefault", "derives the first-run public default from existing deployment capabilities");
test.assertMatches(profile, /workspaceProfileWasRestored[\s\S]*public_deployment[\s\S]*workspaceProfileDesktop/, "preserves an explicit user profile before applying the public Desktop default");
test.assertIncludes(profile, "workspaceCapabilityStudio", "classifies studio-only surfaces centrally");
test.assertMatches(profile, /workspaceCapabilityForWindow[\s\S]*studioWindowNames/, "owns window classification");
test.assertMatches(profile, /workspaceCapabilityForAction[\s\S]*studioActionNames/, "owns action classification");
test.assertIncludes(profile, "filterWorkspaceItems", "filters existing Finder registries instead of duplicating them");
// Scoped to the classification list: ClioTalk must stay a shared window.
// The file may still name it as a window to open — that is the opposite
// claim, and a whole-file string check could not tell them apart.
test.assertNotMatches(
  profile,
  /const studioWindowNames = new Set\(\[[^\]]*"assistant"/,
  "does not classify ClioTalk as studio-only"
);
test.assertIncludes(persistence, "workspaceProfile,", "stores the profile in the existing settings payload");
test.assertIncludes(persistence, "normalizeWorkspaceProfile(settings.workspaceProfile)", "restores a validated profile");
test.assertIncludes(persistence, 'hasOwnProperty.call(settings, "workspaceProfile")', "distinguishes an existing user choice from a first visit");
test.assertIncludes(actions, "isWorkspaceActionAllowed(action)", "blocks direct actions outside the active profile");
test.assertIncludes(windows, "isWorkspaceWindowAllowed(name)", "blocks direct window opens outside the active profile");
test.assertMatches(profile, /studioActionNames = new Set\(\[[^\]]*"open-rebuild-flow"/, "open-rebuild-flow stays a writing-studio action (Extras is its home)");
test.assertIncludes(actions, 'registerCommand?.("open-rebuild-flow"', "the Extras entry opens the rebuild flow directly inside Writing Studio");
test.assertMatches(windows, /Object\.keys\(availability\)[\s\S]*isWorkspaceActionAllowed/, "projects profile policy into menu availability");
test.assertIncludes(session, "isWorkspaceWindowAllowed(entry.name)", "does not restore hidden-profile windows");
test.assertNotIncludes(profile, "localStorage", "does not create a second settings boundary");
test.assertNotIncludes(html, 'id="workspace-profile"', "Control Panel is not used as the everyday app switcher");
test.assertNotIncludes(html, 'data-action="quit-writing-studio"', "Writing Flow chrome does not duplicate MultiFinder Quit");
test.assertIncludes(html, 'id="finder-writing-studio-toggle"', "Finder single-task desktop has one Writing Studio toggle icon");
test.assertIncludes(menus, 'menuItem("print-current", "print")', "TeachText File menu exposes the shared print action");
test.assertIncludes(html, 'data-workspace-capability="studio"', "studio-only DOM surfaces use the shared visibility marker");
test.assertMatches(app, /writing_studio[\s\S]*open-writing-studio[\s\S]*quick_draft_label[\s\S]*open-quick-draft[\s\S]*assistant_label[\s\S]*open-assistant/, "Applications keeps Writing Studio, independent Quick Draft, then ClioTalk on the desktop bridge");
test.assertMatches(app, /open-writing-studio[\s\S]*workspaceProfiles: \[workspaceProfileDesktop\]/, "Writing Studio launcher appears only on the desktop");
test.assertMatches(app, /quick_draft_label[\s\S]*action: "open-quick-draft"[\s\S]*type: "application"/, "Quick Draft is a root Applications item");
test.assertNotMatches(profile, /const studioWindowNames = new Set\(\[[^\]]*"quickDraft"/, "Quick Draft is available outside the writing workspace");
test.assertNotMatches(profile, /const studioActionNames = new Set\(\[[^\]]*"open-quick-draft"/, "Quick Draft launches directly from the Desktop profile");
test.assertMatches(html, /desktop-app-icon[\s\S]*data-action="open-quick-draft"[\s\S]*data-system-icon="quickDraft"/, "the Desktop has a direct Quick Draft application icon");
test.assertMatches(app, /function getStaticFinderItems[\s\S]*filterWorkspaceItems/, "existing Finder registries are profile-filtered");
test.assertIncludes(actions, 'registerCommand?.("open-writing-studio"', "Writing Studio launcher uses the central profile transition");
test.assertIncludes(actions, '"exit-writing-studio": exitWritingStudio', "Finder desktop toggle exits through the same central transition");
test.assertMatches(runtime, /workspaceProfile === workspaceProfileDesktop[\s\S]*openWindow\("disk"\)/, "Desktop startup opens Startup Disk");
test.assertNotIncludes(wireup, 'document.getElementById("workspace-profile")', "Control Panel no longer performs everyday profile switching");
test.assertIncludes(profile, "async function openWritingStudio()", "one transition owns entry into the writing route");
test.assertIncludes(profile, "async function exitWritingStudio()", "one transition owns exit back to the Desktop");
test.assertIncludes(profile, "writingStudioOwnedWindowNames", "Writing Studio owns its existing route windows as one application");
test.assertNotMatches(profile, /writingStudioOwnedWindowNames = new Set\(\[[^\]]*"quickDraft"/, "Writing Studio does not own Quick Draft");
test.assertIncludes(multiFinder, 'writingStudio: "Writing Studio"', "MultiFinder recognizes Writing Studio as an application");
test.assertIncludes(multiFinder, 'quickDraft: "Quick Draft"', "MultiFinder labels Quick Draft as its own application");
test.assert(windowApp("quickDraft") === "quickDraft", "the Quick Draft window resolves to the independent application");
test.assertIncludes(quickDraftHandoff, 'ensureRunningApp("quickDraft", "quickDraft")', "Quick Draft preserves its own identity when enabling MultiFinder");
test.assertMatches(windows, /mobileFullScreenAppIds = new Set\(\[[^\]]*"quickDraft"/, "Quick Draft retains a full-screen application shell on phones");
test.assertNotIncludes(teachTextMenusBlock, 'menuItem("open-quick-draft"', "Writing Studio has no Quick Draft entrance");
test.assertNotIncludes(teachTextMenusBlock, 'submenu("quick_draft_label"', "Writing Studio has no hidden Quick Draft command submenu");
test.assertIncludes(quickDraftMenusBlock, 'menuItem("quick-draft-open-writing-studio", "enter_writing_studio")', "Quick Draft owns the one-way entrance into Writing Studio");
test.assertIncludes(quickDraftHandoff, 'flushPendingQuickDraftCommit', "entering Writing Studio flushes pending Quick Draft changes first");
test.assertIncludes(multiFinder, "syncWorkspaceDesktopIcon()", "MultiFinder mode hides the Finder-only desktop toggle");
test.assertMatches(profile, /finderSingleTask[\s\S]*exit-writing-studio[\s\S]*open-writing-studio/, "one Finder-only icon changes between enter and exit");
test.assertMatches(windows, /appId === "writingStudio"[\s\S]*exitWritingStudio/, "Quit Writing Studio returns to Desktop instead of closing unrelated apps");
test.assertMatches(app, /writing_studio[\s\S]*iconId: "writingStudio"/, "Applications uses a dedicated Writing Studio icon");
test.assertMatches(systemIcons, /writingStudio:[\s\S]*M7 2h18v10/, "Writing Studio uses a dedicated typewriter silhouette on the shared Classic grid");
test.assertIncludes(actions, '"quit-active-app": () => quitApp(activeAppId)', "the existing right-side MultiFinder owns Writing Studio Quit");
test.assertIncludes(profile, "await openWritingStudioDefaultSurface()", "Writing Studio opens onto the route's current state, never OOBE or ClioTalk");
test.assertIncludes(actions, 'registerCommand?.("open-teachtext"', "TeachText entry follows the active profile");
test.assertIncludes(actions, '"print-current": printCurrentTeachTextDocument', "TeachText printing reuses the existing print pipeline");
test.assertIncludes(teachText, "function openDesktopTeachTextWindow()", "Desktop reuses TeachText through a role-aware entry");
test.assertMatches(teachText, /workspaceProfile !== workspaceProfileDesktop \|\| tab\.role === "scratch_file"/, "Desktop hides manuscript tabs without deleting them");
test.assertIncludes(teachText, 'tab.role === "scratch_file"', "Desktop reuses existing scratch tabs");
test.assertIncludes(rolePolicy, 'scratch_file: ["edit", "save", "saveCopy", "makeDocMap", "clip"]', "Desktop relies on the existing scratch-file capability policy");
test.assertMatches(profile, /studioActionPrefixes = \["ai-", "rebuild-", "review-"\]/, "Desktop blocks writing and review command families without swallowing system OOBE");
test.assertMatches(runtime, /desktopProfile \? \[[\s\S]*boot_ready/, "Desktop reuses the boot sequence without the writing/model ledger steps");
test.assertIncludes(runtime, 'bootLocalModelEl?.classList.toggle("is-hidden", desktopProfile)', "Desktop hides the model boot ledger");
test.assertNotIncludes(html, 'id="apple-running-apps"', "Apple menu does not duplicate the existing right-side MultiFinder");
test.assertNotIncludes(multiFinder, "renderAppleRunningApps", "only the original MultiFinder owns the running-app list");
test.assertIncludes(profile, '"about_finder"', "Desktop switches the existing About window to Finder copy");
test.assertIncludes(persistence, 'workspaceProfile === workspaceProfileDesktop ? "workspace_desktop" : "workspace_writing"', "System Status names the active profile");
test.assertIncludes(html, 'data-drag-type="mounted-disk"', "the mounted File Floppy exposes the existing drag contract");
test.assertMatches(dragDrop, /data\.type === "mounted-disk"[\s\S]*ejectTextDisk\(\)/, "dragging the whole File Floppy to Trash reuses Eject");

test.finish();
