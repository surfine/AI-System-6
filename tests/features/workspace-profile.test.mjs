import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("workspace-profile");
const profile = read("app/core/workspace-profile.js");
const manifest = read("scripts/runtime-manifest.mjs");
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

test.assertIncludes(manifest, '"app/core/workspace-profile.js"', "loads the central profile policy");
test.assertIncludes(profile, 'let workspaceProfile = workspaceProfileWriting', "keeps the existing writing experience as the default");
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
test.assertMatches(windows, /Object\.keys\(availability\)[\s\S]*isWorkspaceActionAllowed/, "projects profile policy into menu availability");
test.assertIncludes(session, "isWorkspaceWindowAllowed(entry.name)", "does not restore hidden-profile windows");
test.assertNotIncludes(profile, "localStorage", "does not create a second settings boundary");
test.assertNotIncludes(html, 'id="workspace-profile"', "Control Panel is not used as the everyday app switcher");
test.assertNotIncludes(html, 'data-action="quit-writing-studio"', "Writing Flow chrome does not duplicate MultiFinder Quit");
test.assertIncludes(html, 'id="finder-writing-studio-toggle"', "Finder single-task desktop has one Writing Studio toggle icon");
test.assertIncludes(menus, 'menuItem("print-current", "print")', "TeachText File menu exposes the shared print action");
test.assertIncludes(html, 'data-workspace-capability="studio"', "studio-only DOM surfaces use the shared visibility marker");
test.assertMatches(app, /assistant_label[\s\S]*open-assistant[\s\S]*writing_studio[\s\S]*open-writing-studio/, "Applications keeps ClioTalk and adds the Writing Studio bridge");
test.assertMatches(app, /open-writing-studio[\s\S]*workspaceProfiles: \[workspaceProfileDesktop\]/, "Writing Studio launcher appears only on the desktop");
test.assertMatches(app, /quick_draft_label[\s\S]*workspaceCapability: workspaceCapabilityStudio/, "Quick Draft remains inside the studio");
test.assertMatches(app, /function getStaticFinderItems[\s\S]*filterWorkspaceItems/, "existing Finder registries are profile-filtered");
test.assertIncludes(actions, '"open-writing-studio": openWritingStudio', "Writing Studio launcher uses the central profile transition");
test.assertIncludes(actions, '"exit-writing-studio": exitWritingStudio', "Finder desktop toggle exits through the same central transition");
test.assertMatches(runtime, /workspaceProfile === workspaceProfileDesktop[\s\S]*openWindow\("disk"\)/, "Desktop startup opens Startup Disk");
test.assertNotIncludes(wireup, 'document.getElementById("workspace-profile")', "Control Panel no longer performs everyday profile switching");
test.assertIncludes(profile, "async function openWritingStudio()", "one transition owns entry into the writing route");
test.assertIncludes(profile, "async function exitWritingStudio()", "one transition owns exit back to the Desktop");
test.assertIncludes(profile, "writingStudioOwnedWindowNames", "Writing Studio owns its existing route windows as one application");
test.assertMatches(profile, /writingStudioOwnedWindowNames = new Set\(\[[\s\S]*"quickDraft"/, "Writing Studio owns Quick Draft");
test.assertIncludes(multiFinder, 'writingStudio: "Writing Studio"', "MultiFinder recognizes Writing Studio as an application");
test.assertIncludes(multiFinder, 'quickDraft: "writingStudio"', "Quick Draft resolves to Writing Studio instead of becoming a separate application");
test.assertNotIncludes(multiFinder, 'quickDraft: "Quick Draft"', "MultiFinder does not list Quick Draft as a separate running application");
test.assertIncludes(multiFinder, "syncWorkspaceDesktopIcon()", "MultiFinder mode hides the Finder-only desktop toggle");
test.assertMatches(profile, /finderSingleTask[\s\S]*exit-writing-studio[\s\S]*open-writing-studio/, "one Finder-only icon changes between enter and exit");
test.assertMatches(windows, /appId === "writingStudio"[\s\S]*exitWritingStudio/, "Quit Writing Studio returns to Desktop instead of closing unrelated apps");
test.assertMatches(app, /writing_studio[\s\S]*iconId: "writingStudio"/, "Applications uses a dedicated Writing Studio icon");
test.assertMatches(systemIcons, /writingStudio:[\s\S]*M9 4h14v10/, "Writing Studio uses a dedicated typewriter silhouette");
test.assertIncludes(actions, '"quit-active-app": () => quitApp(activeAppId)', "the existing right-side MultiFinder owns Writing Studio Quit");
test.assertIncludes(profile, 'await openWindow(guideSeen ? "assistant" : "guide")', "Writing Studio opens onto ClioTalk, the window startup already opens");
test.assertIncludes(actions, '"open-teachtext": openTeachTextForWorkspace', "TeachText entry follows the active profile");
test.assertIncludes(actions, '"print-current": printCurrentTeachTextDocument', "TeachText printing reuses the existing print pipeline");
test.assertIncludes(teachText, "function openDesktopTeachTextWindow()", "Desktop reuses TeachText through a role-aware entry");
test.assertMatches(teachText, /workspaceProfile !== workspaceProfileDesktop \|\| tab\.role === "scratch_file"/, "Desktop hides manuscript tabs without deleting them");
test.assertIncludes(teachText, 'tab.role === "scratch_file"', "Desktop reuses existing scratch tabs");
test.assertIncludes(rolePolicy, 'scratch_file: ["edit", "save", "saveCopy", "makeDocMap", "clip"]', "Desktop relies on the existing scratch-file capability policy");
test.assertMatches(profile, /studioActionPrefixes = \["ai-", "guide-", "rebuild-", "review-"\]/, "Desktop blocks writing and review command families centrally");
test.assertMatches(runtime, /desktopProfile \? \[[\s\S]*boot_ready/, "Desktop reuses the boot sequence without the writing/model ledger steps");
test.assertIncludes(runtime, 'bootLocalModelEl?.classList.toggle("is-hidden", desktopProfile)', "Desktop hides the model boot ledger");
test.assertNotIncludes(html, 'id="apple-running-apps"', "Apple menu does not duplicate the existing right-side MultiFinder");
test.assertNotIncludes(multiFinder, "renderAppleRunningApps", "only the original MultiFinder owns the running-app list");
test.assertIncludes(profile, '"about_finder"', "Desktop switches the existing About window to Finder copy");
test.assertIncludes(persistence, 'workspaceProfile === workspaceProfileDesktop ? "workspace_desktop" : "workspace_writing"', "System Status names the active profile");
test.assertIncludes(html, 'data-drag-type="mounted-disk"', "the mounted File Floppy exposes the existing drag contract");
test.assertMatches(dragDrop, /data\.type === "mounted-disk"[\s\S]*ejectTextDisk\(\)/, "dragging the whole File Floppy to Trash reuses Eject");

test.finish();
