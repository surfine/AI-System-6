// Mobile full-screen app shell (ClioTalk pilot). On a phone a foregrounded real
// app fills the screen below the menu bar and the desktop icon column becomes
// the launcher. Full-screen presentation is a screen-size consequence, not a
// task model — the Finder / MultiFinder choice still governs how many apps run
// and whether there is a switcher at all. This contract pins the reusable figure
// so a later rollout (or a "polish" pass) can't quietly unwire it.
// See .claude/plans and app/core/window-manager.js.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("mobile-app-shell");
const responsive = read("styles/60-responsive.css");
const windows = read("styles/10-windows.css");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const wireup = read("app/core/wireup.js");
const actions = read("app/core/actions.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// The full-screen shell figure keys off two classes the JS toggles.
test.assertIncludes(
  responsive,
  "body.mobile-app-foreground:not(.is-writer-mode) .window.is-mobile-fullscreen {",
  "portrait shell pins a foregrounded app full-screen"
);
test.assertIncludes(
  responsive,
  "calc(var(--menu-bar-height) + var(--safe-area-top))",
  "full-screen shell starts below the menu bar, clearing the status bar when standalone"
);
// The flow rules must be scoped away so the shell wins without a forced override.
test.assertIncludes(
  responsive,
  ".assistant-window:not(.is-collapsed):not(.is-mobile-fullscreen)",
  "the portrait height cap is scoped off the full-screen state"
);
test.assertIncludes(
  responsive,
  ":not(.model-meter-window):not(.is-mobile-fullscreen)",
  "the absolute-positioning flow rule is scoped off the full-screen state"
);
// The desktop launcher hides behind the foregrounded app; home reveals it.
test.assertIncludes(
  responsive,
  "body.mobile-app-foreground:not(.is-writer-mode) .icon-column",
  "the desktop launcher hides behind a foregrounded app"
);

// State toggles are class-based, not inline layout styles.
// The shell covers the real apps. Desk accessories, system overlays (About /
// Guide / System Help) and Finder itself stay out: they float over the app, or
// they are the desktop you return to.
for (const appId of ["clioTalk", "teachText", "reader", "scrapbook", "docMap", "quickDraft"]) {
  test.assertIncludes(windowManager, `"${appId}",`, `the shell covers the ${appId} app`);
}
test.assertMatches(
  windowManager,
  /mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*\]\)/,
  "the rolled-out app list is a single declared set"
);
test.assert(
  !/mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*"(accessories|system|finder)"/.test(windowManager),
  "desk accessories, system overlays and Finder are excluded from the shell"
);

// Layout code that writes inline frames must stand down on the phone, or those
// inline styles would outrank the shell.
test.assertIncludes(
  windowManager,
  "if (isPortraitDocumentFlow() && mobileFullScreenAppIds.has(\"teachText\")) return;",
  "the writing-route pair split stands down on a phone"
);
test.assertIncludes(
  windowManager,
  "if (isPortraitDocumentFlow()) {\n    syncMobileAppForeground();\n    return true;\n  }",
  "the SideAsk pair layout stands down on a phone"
);
test.assertIncludes(
  windowManager,
  '.forEach((prop) => { target.style[prop] = ""; })',
  "stale inline desktop geometry is cleared when a window is maximized"
);
test.assertIncludes(windowManager, "function syncMobileAppForeground()", "a single sync point owns the foreground state");
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

// Zoom box and grow box are one pair: either one restores a maximized window
// down to a floating window, so several windows can share the phone screen.
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
// iOS 26 no longer expects app content to stop short of the home indicator —
// it floats over the app. The window fills edge-to-edge; only the composer's
// own content gets a comfortable inset, via padding rather than a window margin.
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

test.finish();
