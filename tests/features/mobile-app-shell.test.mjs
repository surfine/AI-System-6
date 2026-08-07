// Mobile presentation contract. On a phone, every production window has one
// deliberate role: application page, Finder page, dialog, system page, or Desk
// Accessory. Full-screen presentation is a screen-size consequence, not a task
// model — Finder / MultiFinder still governs how many apps run.
// See .claude/plans and app/core/window-manager.js.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("mobile-app-shell");
const foundation = read("styles/00-foundation.css");
const responsive = read("styles/60-responsive.css");
const windows = read("styles/10-windows.css");
const chatMessages = read("app/core/chat-messages.js");
const readerStyles = read("styles/20-reader-docmap.css");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const workingSession = read("app/core/working-session.js");
const wireup = read("app/core/wireup.js");
const actions = read("app/core/actions.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const dictionary = read("app/data/system-dictionary.js");

function declaredStringSet(source, setName) {
  const body = source.match(new RegExp(`const ${setName} = new Set\\(\\[([\\s\\S]*?)\\]\\);`))?.[1] || "";
  return new Set(Array.from(body.matchAll(/"([^"]+)"/g), (match) => match[1]));
}

// The full-screen shell figure keys off two classes the JS toggles.
test.assertIncludes(
  responsive,
  "body.mobile-app-foreground:not(.is-writer-mode) .window.is-mobile-fullscreen:not(.is-collapsed) {",
  "portrait shell pins a foregrounded app full-screen"
);
test.assertIncludes(
  responsive,
  "calc(var(--menu-bar-height) + var(--safe-area-top))",
  "full-screen shell starts below the menu bar, clearing the status bar when standalone"
);
test.assertIncludes(
  foundation,
  "--safe-area-bottom: env(safe-area-inset-bottom, 0px);",
  "the home-indicator inset has one foundation token"
);
test.assertIncludes(
  responsive,
  ".window.is-mobile-fullscreen:not(.assistant-window) {\n    padding-bottom: var(--safe-area-bottom);",
  "the shared shell protects every non-ClioTalk app's bottom interaction area"
);
test.assertIncludes(
  windowManager,
  "if (next) {\n      focusWindow(next);\n    } else {\n      activeAppId = \"finder\";",
  "closing a mobile overlay reactivates the full-screen app so its title controls and menus keep working"
);
// The flow rules must be scoped away so the shell wins without a forced override.
test.assertIncludes(
  responsive,
  ".assistant-window:not(.is-collapsed):not(.is-mobile-fullscreen)",
  "the portrait height cap is scoped off the full-screen state"
);
test.assertIncludes(
  responsive,
  ".window.is-mobile-work-area:not(.is-mobile-fullscreen)",
  "the absolute-positioning flow rule is scoped off the full-screen state"
);
// The desktop launcher hides behind the foregrounded app; home reveals it.
test.assertIncludes(
  responsive,
  "body.mobile-app-foreground:not(.is-writer-mode) .icon-column",
  "the desktop launcher hides behind a foregrounded app"
);
test.assertIncludes(
  responsive,
  '.window:not(.is-mobile-fullscreen):not(.is-mobile-dialog):not(.is-mobile-system-page):not([data-app="accessories"]):not([data-app="system"])',
  "background MultiFinder apps leave portrait layout without being marked hidden"
);
test.assertIncludes(
  responsive,
  "#cloud-model-label {\n    display: none;",
  "the narrow menu bar collapses the redundant model label before clipping MultiFinder"
);
test.assertIncludes(
  responsive,
  ".clio-stage-view-switcher {\n    grid-template-columns: repeat(4, minmax(0, 1fr));",
  "ClioStage keeps its four mobile views in one compact control row"
);
test.assertIncludes(
  responsive,
  ".assistant-window.is-mobile-fullscreen .message-content",
  "ClioTalk constrains generated content to the phone viewport"
);
test.assertIncludes(
  responsive,
  ".find-path-pane > .button-row:last-child {\n    display: grid;\n    grid-template-columns: repeat(4, minmax(0, 1fr));",
  "Searcher keeps handoff actions on one row so results remain the main surface"
);
test.assertIncludes(
  readerStyles,
  ".reader-pane:has(#reader-docmap-button:not(:disabled)) .reader-url-row,",
  "Reader removes source-entry chrome after a document is open on phone and desktop"
);
test.assertIncludes(
  responsive,
  ".ask-bar-row input,\n  .ask-bar-row .btn {\n    min-height: 44px;",
  "every ask bar keeps a phone-sized touch target in one shared rule"
);
test.assertIncludes(
  responsive,
  "grid-template-rows: minmax(132px, 156px) minmax(0, 1fr) auto;",
  "Scrapbook gives its phone editor the space an empty list no longer needs"
);
test.assertIncludes(
  chatMessages,
  "name.textContent = file?.name || (project ? getPendingClioTalkFileName()",
  "ClioTalk replaces the empty file placeholder with the pending Chat filename on phone and desktop"
);
test.assertIncludes(
  dictionary,
  "Across phone and desktop, controls with no current action collapse",
  "System Help documents the content-first mobile control hierarchy"
);
test.assertIncludes(
  html,
  '<label class="visually-hidden" for="find-path-query"',
  "Searcher keeps its accessible query name without spending desktop or phone content space on it"
);
test.assertIncludes(
  responsive,
  "--puzzle-board-width: 220px",
  "Puzzle enlarges its board for touch instead of preserving desktop accessory dimensions"
);
test.assertIncludes(
  dictionary,
  "On a phone, Focus Root opens a readable branch-level view",
  "System Help describes the live DocMap phone interaction"
);

// State toggles are class-based, not inline layout styles. Every real app uses
// the page shell; Finder folders join it through an explicit window-name set.
for (const appId of [
  "clioTalk",
  "teachText",
  "writingStudio",
  "searcher",
  "reader",
  "timeMachine",
  "endfield",
  "docMap",
  "clioStage",
  "clioChart",
  "liquidCover",
  "cmfStudio",
  "soundscape",
  "scrapbook",
  "bureaucracyMeme",
]) {
  test.assertIncludes(windowManager, `"${appId}",`, `the shell covers the ${appId} app`);
}
test.assertMatches(
  windowManager,
  /mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*\]\)/,
  "the rolled-out app list is a single declared set"
);
test.assertIncludes(
  windowManager,
  "const activeAppWins = wins.filter((win) => getWindowAppId(win) === activeAppId);",
  "restored phone sessions choose the MultiFinder foreground app before stale desktop z-order"
);
test.assertIncludes(
  workingSession,
  'if (typeof syncMobileAppForeground === "function") syncMobileAppForeground();',
  "working-session restore reconciles the portrait shell after restoring the actual foreground app"
);
test.assert(
  !/mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*"(accessories|system|finder)"/.test(windowManager),
  "accessories, system windows, and Finder do not masquerade as application ids"
);
test.assertIncludes(windowManager, "const mobileFinderPageWindowNames = new Set([", "Finder pages have a declared mobile navigation role");
test.assertIncludes(windowManager, "const mobileDialogWindowNames = new Set([", "dialogs have a declared mobile overlay role");
test.assertIncludes(windowManager, "const mobileSystemPageWindowNames = new Set([", "system pages have a declared mobile overlay role");
test.assertIncludes(windowManager, 'role === "finder-page"', "Finder pages can own the phone work area");
test.assertIncludes(windowManager, "mobileFinderDesktopPreferred = true;", "the Finder switcher entry returns to the desktop launcher");
test.assertIncludes(responsive, "body.mobile-finder-desktop:not(.is-writer-mode) .window.is-mobile-finder-page", "the desktop launcher backgrounds Finder's single current location");
test.assertIncludes(responsive, ".window.is-mobile-dialog:not(.is-hidden):not(.is-collapsed)", "dialogs remain compact overlays on phone");
test.assertIncludes(responsive, ".window.is-mobile-system-page:not(.is-hidden):not(.is-collapsed)", "system-owned pages use one phone presentation");

// Inventory gate: a new window cannot ship without acquiring exactly one of
// the system roles above (directly, through its app id, or as an accessory).
const fullScreenApps = declaredStringSet(windowManager, "mobileFullScreenAppIds");
const finderPages = declaredStringSet(windowManager, "mobileFinderPageWindowNames");
const dialogs = declaredStringSet(windowManager, "mobileDialogWindowNames");
const systemPages = declaredStringSet(windowManager, "mobileSystemPageWindowNames");
const appMapBody = multiFinder.match(/const windowAppMap = \{([\s\S]*?)\n\};/)?.[1] || "";
const appMap = Object.fromEntries(
  Array.from(appMapBody.matchAll(/^\s*([A-Za-z0-9]+): "([^"]+)",?$/gm), (match) => [match[1], match[2]])
);
const productionWindows = Array.from(html.matchAll(/\bdata-window="([^"]+)"/g), (match) => match[1]);
const uncoveredWindows = productionWindows.filter((name) => {
  const appId = appMap[name] || "finder";
  return !dialogs.has(name)
    && !systemPages.has(name)
    && !finderPages.has(name)
    && appId !== "accessories"
    && !fullScreenApps.has(appId);
});
test.assert(
  uncoveredWindows.length === 0,
  `all ${productionWindows.length} production windows have a mobile presentation role${uncoveredWindows.length ? `; missing: ${uncoveredWindows.join(", ")}` : ""}`
);

// Layout code that writes inline frames must stand down on the phone, or those
// inline styles would outrank the shell.
test.assertIncludes(
  windowManager,
  "if ((isPortraitDocumentFlow() && mobileFullScreenAppIds.has(\"teachText\")) || isNarrowViewport()) return;",
  "the writing-route pair split stands down on a phone"
);
test.assertIncludes(
  windowManager,
  "if (isPortraitDocumentFlow() || isNarrowViewport()) {\n    syncMobileAppForeground();\n    return true;\n  }",
  "the SideAsk pair layout stands down on a phone"
);
test.assertIncludes(
  windowManager,
  '.forEach((prop) => { target.style[prop] = ""; })',
  "stale inline desktop geometry is cleared when a window is maximized"
);
test.assertIncludes(windowManager, "function syncMobileAppForeground()", "a single sync point owns the foreground state");
test.assertIncludes(windowManager, "function repairPortraitDeskAccessoryGeometry()", "portrait sync repairs stale desktop accessory coordinates");
test.assertIncludes(windowManager, "function arrangePortraitDeskAccessories(", "one portrait arranger owns every visible Desk Accessory");
test.assertIncludes(windowManager, "visiblePortraitDeskAccessories()", "the portrait arranger considers the complete open DA set");
test.assertIncludes(windowManager, 'candidate.style.setProperty("--mobile-da-top"', "the portrait arranger assigns non-overlapping vertical slots");
test.assertIncludes(responsive, "left: 50%;", "portrait Desk Accessories share one centered horizontal axis");
test.assertIncludes(
  windowManager,
  'getPropertyValue("--safe-area-bottom")',
  "the Desk Accessory arranger reads the shared home-indicator inset"
);
test.assertIncludes(
  windowManager,
  "viewportHeight - safeAreaBottom - margin",
  "the complete Desk Accessory group stays above the home indicator"
);
test.assertIncludes(
  responsive,
  "calc(100vh - var(--system-menu-height, 26px) - var(--safe-area-bottom) - 24px)",
  "the Desk Accessory CSS fallback also reserves the bottom safe area"
);
test.assertIncludes(dictionary, "Opening or closing another DA reflows the whole stack", "System Help documents mobile DA reflow and overlap prevention");
test.assertIncludes(windowManager, "function foregroundMobileApp(", "the switcher re-foregrounds a running app");
test.assertIncludes(windowManager, 'classList.toggle("mobile-app-foreground"', "the body foreground state is a class toggle");

// Leaving: the System 6 close box quits; the switcher's Finder entry backgrounds
// the app to the desktop (no redundant title-bar home button).
test.assertIncludes(windowManager, "function mobileHomeToDesktop()", "backgrounding to the desktop is a single reusable path");
test.assertNotIncludes(html, "home-box", "no redundant title-bar back-to-desktop button");
test.assertNotIncludes(actions, "mobile-home", "no back-to-desktop action; the close box and switcher cover it");

// Full-screen presentation is a screen-size consequence, NOT a task model: a
// phone must still obey the Finder / MultiFinder choice. Finder = one app at a
// time and no switcher (there is nothing to switch to; the close box is the way
// back to the desktop). MultiFinder = apps stay running and the switcher moves
// between them. An earlier build surfaced the switcher in portrait regardless of
// mode, which put MultiFinder vocabulary (Hide Others / Quit / Bring All to
// Front) inside single-task Finder.
test.assertIncludes(
  multiFinder,
  "const showSwitcher = isMultiFinderMode();",
  "the switcher stays MultiFinder-only on every screen size"
);
test.assert(
  !multiFinder.includes("isMultiFinderMode() || isPortraitDocumentFlow()"),
  "a phone never conjures the switcher in Finder mode"
);
test.assertIncludes(
  wireup,
  "if (isPortraitDocumentFlow()) foregroundMobileApp(appId);",
  "the switcher click uses the mobile foreground path on a phone"
);

// The full-screen shell keeps the whole System 6 title bar: nothing in it is
// force-hidden. The close box quits; the zoom box restores down.
test.assertNotIncludes(
  responsive,
  ".window.is-mobile-fullscreen .title-bar > .close-box,",
  "the close box is not force-hidden in the full-screen shell"
);
test.assertNotIncludes(
  responsive,
  ".window.is-mobile-fullscreen .title-bar > .resize-box {\n    display: none;",
  "the zoom box is not force-hidden in the full-screen shell"
);

// The Zoom box owns maximize/restore. The grow box remains a separate manual
// sizing control, but a grow drag first restores a maximized window down so it
// has a real floating frame to resize.
test.assertIncludes(
  windowManager,
  'win.dataset.mobileRestored !== "true"',
  "a restored-down window is not re-maximized by the shell"
);
test.assertIncludes(
  windowManager,
  'win.dataset.mobileRestored = win.dataset.mobileRestored === "true" ? "false" : "true"',
  "the zoom box toggles maximize/restore on a phone"
);
test.assertIncludes(
  windowManager,
  'if (win.classList.contains("is-mobile-fullscreen")) {\n    win.dataset.mobileRestored = "true";',
  "dragging the grow box restores the window down first"
);

// Modals / desk accessories float above the full-screen app instead of
// replacing it. The exemption is scoped to exactly those: another *real* app
// must still single-task the running one away in Finder mode, or a phone
// silently multitasks and the startup choice means nothing.
test.assertIncludes(
  windowManager,
  '&& !isFinderModeSingleTaskApp(appId)\n      ) return false;',
  "only a desk accessory / system window skips single-tasking the full-screen app"
);

// Backgrounding to the desktop is the switcher's Finder entry, so it is a
// MultiFinder path: it must background every running app (MultiFinder's own
// hide vocabulary, so they stay resumable) rather than hiding just the frontmost
// one — which would only promote the next running app to full-screen.
test.assertIncludes(
  windowManager,
  "appIds.forEach((appId) => hideApp(appId, { preserveActive: true }));",
  "going home backgrounds every running app so the desktop actually shows"
);

// iOS keyboard: the shell reads a --keyboard-inset var (set from visualViewport)
// so the composer stays above the keyboard, without inline layout styles.
test.assertIncludes(
  responsive,
  "0\n      var(--keyboard-inset, 0px)\n      0;",
  "the shell bottom lifts by the keyboard only; the window itself fills to the true edge at rest"
);
// Window material remains edge-to-edge. ClioTalk protects its own composer;
// the shared non-assistant shell protects every other app's lowest controls.
test.assertIncludes(
  responsive,
  "padding-bottom: var(--safe-area-bottom);",
  "the composer insets its own content instead of the window stopping short of the edge"
);
test.assertIncludes(
  responsive,
  ":not(.is-collapsed):not(.is-mobile-fullscreen)",
  "the assistant min-height flow rule is scoped off the full-screen state so it can shrink for the keyboard"
);
test.assertIncludes(
  wireup,
  'setProperty("--keyboard-inset"',
  "the keyboard inset is published as a CSS custom property, not an inline layout style"
);
test.assertIncludes(
  wireup,
  'window.visualViewport.addEventListener("resize", updateKeyboardInset)',
  "the keyboard inset tracks the visual viewport"
);

// Nothing may shift when the keyboard opens: the foregrounded app is fixed and
// fills the screen, so the page is locked and any scroll iOS performs is undone.
test.assertIncludes(
  responsive,
  "body.mobile-app-foreground:not(.is-writer-mode) {\n    overflow: hidden;",
  "the page cannot scroll while an app is foregrounded"
);
test.assertIncludes(
  wireup,
  'document.addEventListener("focusin"',
  "focus-driven scrolling is reset so the desk does not move"
);

// The Finder rubber band calls preventDefault on pointerdown, which froze any
// pane a finger tried to scroll. Dragging is scrolling on a touch screen; mouse
// and pen still get the marquee.
test.assertIncludes(
  read("app.js"),
  'if (event.pointerType === "touch") return null;',
  "a touch drag never starts a selection marquee"
);

test.assertIncludes(dictionary, 'id: "mobile-workspace"', "System Help exposes the current portrait workspace behavior");
test.assertIncludes(dictionary, "Finder remains the launcher", "English help explains mobile navigation without inventing a second launcher");
test.assertIncludes(dictionary, "新开或关闭 DA 时整组都会重新排布", "Chinese help explains centered Desk Accessory reflow");
for (const helpId of ["multifinder", "desk-accessories", "puzzle", "shutdown-restart"]) {
  test.assertIncludes(dictionary, `id: "${helpId}"`, `System Help exposes ${helpId}`);
}
test.assertIncludes(dictionary, "one horizontally centered column", "Desk Accessory help pins the non-overlapping mobile stack");
test.assertIncludes(dictionary, "shows the safe-to-shut-down screen", "System Help matches the real shutdown ending");
test.assertIncludes(wireup, '"desktop_tap_hint"', "the first touch tap on a desktop icon teaches the double-tap gesture");
test.assertIncludes(en, 'desktop_tap_hint: "Tap again to open."', "English names the touch hint");
test.assertIncludes(zh, 'desktop_tap_hint: "再点一次打开。"', "Chinese names the touch hint");

test.finish();
