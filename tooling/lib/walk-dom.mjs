// Real-UI helpers for tooling/verify-walk.mjs.
//
// Hard rule for every helper here: click, fill, dblclick, keyboard — never
// `page.evaluate(() => handleAction(...))` or `page.evaluate(() => openWindow(...))`.
// The whole point of the walk gate is that a control was actually clicked; a
// helper that calls the product's own JS function to fake that click would
// quietly defeat the gate it is supposed to be.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const DEMO_DISK_PATH = join(
  root,
  "internal/evidence/drafts/dtk-demo-disk/未来通车之后 Project Hard Disk Backup.json"
);

// The fake model's canned outline (tests/e2e/fake-model.mjs `outlineText`)
// always opens with these two headings; used to prove the answer landed.
export const FAKE_OUTLINE_MARKERS = ["## 背景", "## 论点"];

const marker = (label) => `walk-gate ${label} ${Date.now()}`;

export const WALK_STRINGS = {
  projectName: "Walk Gate Project",
  seedProjectName: "Walk Gate Seed",
  // The second disk exists only to eject the first one: a disk is put away
  // when a different disk is mounted, so this is how the walk reaches the
  // ejected state through a real user action instead of a store write.
  secondProjectName: "Walk Gate Second Disk",
  // Chunking (apps/desktop/app/shared/retrieval-runtime.js chunkText) drops
  // any chunk of 80 characters or fewer as unusable, so this needs real body.
  floppyMarkdown: "# Floppy Note\n\nShort-term context for the walk gate: this paragraph exists "
    + "only to give the File Floppy chunker something long enough to keep, so the mount "
    + "produces at least one real chunk instead of silently mounting zero.\n",
  questionSheetMarker: marker("question"),
  questionSheetText: `Recipient: the reader.\n\nQuestion marker: ${marker("question")}\n\nWhat does the walk gate need to prove here?`,
  draftMarker: marker("draft"),
  draftText: "",
  manuscriptMarker: marker("manuscript"),
  manuscriptText: "",
};
// Text fields reference the *same* marker instance, not a freshly regenerated
// one, so keep them in sync explicitly (object literals evaluate top-down).
WALK_STRINGS.questionSheetText = `Recipient: the reader.\n\nQuestion marker: ${WALK_STRINGS.questionSheetMarker}\n\nWhat does the walk gate need to prove here?`;
WALK_STRINGS.draftText = `Section prose for the walk gate. Marker: ${WALK_STRINGS.draftMarker}. This paragraph stands in for a writer's real draft text.`;
WALK_STRINGS.manuscriptText = `# Walk Gate Manuscript\n\nMarker: ${WALK_STRINGS.manuscriptMarker}\n\nThis manuscript body is typed by the walk gate to prove it survives a reload.`;

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** The canonical "is this window the one in front" check the app itself uses. */
export async function isFrontmost(page, windowName) {
  return page.evaluate((name) => {
    const el = document.querySelector(`[data-window="${name}"]`);
    return !!el && el.classList.contains("is-active") && !el.classList.contains("is-hidden");
  }, windowName);
}

export async function assertFrontmost(page, windowName, label) {
  const ok = await isFrontmost(page, windowName);
  assert(ok, `${label}: [data-window="${windowName}"] is not frontmost (expected .is-active, not .is-hidden)`);
}

/** The menu-bar menu whose direct button text is exactly `label`, if the bar is currently showing it. */
function menuBarMenu(page, label) {
  return page.locator(".menu-bar > .menu").filter({
    has: page.locator(":scope > button", { hasText: new RegExp(`^${label}$`) }),
  });
}

/**
 * Bring a Writing Flow window frontmost through the real "Writing" menu's
 * "Go To" submenu — the same real-user path
 * tests/e2e/user-journey.spec.mjs's writingGoTo() proves reliable for
 * re-raising a writing-route window that a reload, a re-mount, or a
 * sibling window (the spine's own step buttons do not always raise the
 * window they name — see tooling/verify-walk.mjs Stop 3 for the observed
 * case) left buried underneath another one.
 */
export async function writingGoTo(page, action) {
  const writingMenu = menuBarMenu(page, "Writing");
  await writingMenu.locator("> button").waitFor({ state: "visible", timeout: 15000 });
  await writingMenu.locator("> button").click();
  await writingMenu.locator(".menu-submenu-trigger", { hasText: "Go To" }).hover();
  await writingMenu.locator(`[data-action="${action}"]`).click();
}

/**
 * What a person can actually see and reach right now, in one object.
 *
 * Every new stop builds its failure message out of this, so a red gate reads
 * like a bug report and not like a hint to go and write a probe script. A
 * message that only names the selector that did not match sends the reader
 * back to the browser to find out what WAS there; this puts that answer in
 * the message.
 */
export async function describeDesk(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    return {
      profile: document.body.dataset.workspaceProfile || "(unset)",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      frontmost: document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "(none)",
      visibleWindows: [...document.querySelectorAll(".window[data-window]:not(.is-hidden)")]
        .map((win) => `${win.dataset.window}@${rect(win)}`),
      status: (document.querySelector("#status")?.textContent || "").trim(),
      modal: document.querySelector("#system-modal[open]")
        ? (document.querySelector("#system-modal-message")?.textContent || "(open, no message)").trim()
        : "(none)",
      desktopIcons: [...document.querySelectorAll(".icon-column .desktop-icon")]
        .map((icon) => (icon.textContent || "").trim().replace(/\s+/g, " ")),
    };
  });
}

/** `assert`, with the whole desk in the failure message. */
export async function assertOnScreen(page, condition, expected, found, where) {
  if (condition) return;
  const desk = await describeDesk(page);
  throw new Error(
    `${expected}\n`
    + `       found: ${found}\n`
    + `       where: ${where}\n`
    + `       desk: profile=${desk.profile}, viewport=${desk.viewport}, frontmost=${desk.frontmost}\n`
    + `       visible windows: ${desk.visibleWindows.join(", ") || "(none)"}\n`
    + `       status bar: ${JSON.stringify(desk.status)}  modal: ${JSON.stringify(desk.modal)}\n`
    + `       desktop icons: ${desk.desktopIcons.join(" | ") || "(none)"}`
  );
}

/**
 * Every part of a window a person must be able to reach has to be INSIDE the
 * screen. A window whose content lays out below the bottom edge is not a
 * cosmetic problem: the controls down there cannot be clicked at all, and the
 * page does not scroll, so there is no way to bring them back.
 */
export async function windowGeometry(page, windowName, partSelectors = []) {
  return page.evaluate(({ name, parts }) => {
    const win = document.querySelector(`[data-window="${name}"]`);
    if (!win) return null;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        bottom: Math.round(r.bottom), right: Math.round(r.right),
      };
    };
    const hit = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return "(no box)";
      const under = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!under) return "(off screen)";
      return under === el || el.contains(under) ? "reachable" : `covered by ${under.tagName.toLowerCase()}`;
    };
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      window: box(win),
      parts: parts.map((selector) => {
        const el = document.querySelector(selector);
        return el
          ? { selector, ...box(el), hit: hit(el) }
          : { selector, missing: true };
      }),
    };
  }, { name: windowName, parts: partSelectors });
}

/**
 * Click a command inside a named Writing-menu submenu (not the Go To
 * submenu). The chrome-reduction pass retired several route actions from
 * the windows themselves (Review Desk's "View Manuscript" is one); their
 * only permanent home is a Writing submenu, so a real-user click goes
 * through the menu bar the same way a person would.
 */
export async function writingMenuSubmenuClick(page, submenuLabel, action) {
  const writingMenu = menuBarMenu(page, "Writing");
  await writingMenu.locator("> button").waitFor({ state: "visible", timeout: 15000 });
  await writingMenu.locator("> button").click();
  await writingMenu.locator(".menu-submenu-trigger", { hasText: submenuLabel }).hover();
  await writingMenu.locator(`[data-action="${action}"]`).click();
}

/**
 * On this build, opening Writing Studio (openWritingStudioDefaultSurface in
 * apps/desktop/app/core/workspace-profile.js) leaves Manuscript (TeachText)
 * holding .is-active and the higher z-index at the exact same screen
 * position as whichever writing-route window it means to show — even
 * though writingStudioDefaultEntry() correctly picks Question Sheet for a
 * fresh project, nothing then yields Manuscript's own active/z-order
 * status. The result: Manuscript physically covers and intercepts pointer
 * events for the window underneath, so no click on that window (its title
 * bar, its own spine step, even the Writing menu's Go To submenu) can reach
 * it. This is confirmed, reproducible, and lives in "the writing windows'
 * chrome" — out of this gate's territory to fix (flagged separately).
 *
 * The one real, working recovery a person has: close the window that's in
 * the way. Manuscript's default "## New Section" stub closes with no
 * unsaved-changes prompt, so this is a legitimate click, not a cheat.
 */
async function closeManuscriptIfBlocking(page, windowName) {
  if (windowName === "teachText") return;
  const blocking = await page.evaluate(() => {
    const teachText = document.querySelector('[data-window="teachText"]');
    return !!teachText && !teachText.classList.contains("is-hidden") && teachText.classList.contains("is-active");
  });
  if (!blocking) return;
  const closeBox = page.locator('[data-window="teachText"] .close-box');
  if (await closeBox.count()) {
    await closeBox.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

/**
 * Click a locator, clearing a blocking Manuscript window first and retrying
 * once more if Manuscript respawns between the guard check and the click
 * itself (observed: it can reassert on a short delay, not only once).
 */
export async function guardedClick(page, windowName, selector, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await closeManuscriptIfBlocking(page, windowName);
    try {
      await page.click(selector, { timeout: 4000, ...options });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

/**
 * Bring a Writing Flow window frontmost if it is not already — entering
 * Writing Studio (and re-mounting a project) can default to a different
 * window than the one this stop needs.
 */
export async function ensureSpineWindowFrontmost(page, windowName, action, label) {
  // Manuscript can respawn itself (a debounced sync re-opens it) right after
  // being closed, so this is a short retry loop, not a single attempt: the
  // spine click un-hides the target and restores writing-route menu
  // context, closing a blocking Manuscript clears the way, and the Writing
  // menu's Go To is the last-resort real click if the target still is not
  // frontmost.
  for (let attempt = 0; attempt < 4 && !(await isFrontmost(page, windowName)); attempt += 1) {
    await page.click(`.writing-spine-panel [data-action="${action}"]`).catch(() => {});
    await closeManuscriptIfBlocking(page, windowName);
    if (await isFrontmost(page, windowName)) break;
    await writingGoTo(page, action).catch(() => {});
    await page.waitForFunction(
      (name) => {
        const el = document.querySelector(`[data-window="${name}"]`);
        return !!el && el.classList.contains("is-active") && !el.classList.contains("is-hidden");
      },
      windowName,
      { timeout: 6000 }
    ).catch(() => {});
  }
  await assertFrontmost(page, windowName, label);
}

/**
 * Open a menu-bar menu and read back what a person would see in it: the
 * label, whether the item is greyed out, and whether it is on screen. Menus
 * close themselves when the pointer leaves, so the read happens while the
 * menu is held open.
 */
export async function readMenuItem(page, menuLabel, action) {
  const menu = menuBarMenu(page, menuLabel);
  await menu.locator("> button").waitFor({ state: "visible", timeout: 15000 });
  await menu.locator("> button").click();
  const item = menu.locator(`[data-action="${action}"]`).first();
  const found = await item.count();
  const state = found
    ? await item.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.textContent || "").trim(),
        disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true",
        onScreen: r.width > 0 && r.height > 0 && r.bottom <= window.innerHeight && r.top >= 0,
      };
    })
    : { label: "(no such item)", disabled: true, onScreen: false, missing: true };
  await page.keyboard.press("Escape").catch(() => {});
  return state;
}

/** Click one item of a flat menu-bar menu (no submenu hover). */
export async function menuBarClick(page, menuLabel, action) {
  const menu = menuBarMenu(page, menuLabel);
  await menu.locator("> button").waitFor({ state: "visible", timeout: 15000 });
  await menu.locator("> button").click();
  await menu.locator(`[data-action="${action}"]`).first().click({ timeout: 8000 });
}

/** The Apple menu is its own thing: no text label, so it cannot use menuBarMenu(). */
export async function appleMenuClick(page, action) {
  await page.click(".menu-bar .apple");
  await page.click(`.apple-menu-popover [data-action="${action}"]`, { timeout: 8000 });
}

/** Close a window the way a person does — its close box — and wait for it to go. */
export async function closeWindowByCloseBox(page, windowName) {
  const closeBox = page.locator(`[data-window="${windowName}"] .close-box`).first();
  await closeBox.click({ timeout: 8000, force: true });
  await page.waitForFunction(
    (name) => document.querySelector(`[data-window="${name}"]`)?.classList.contains("is-hidden") !== false,
    windowName,
    { timeout: 10000 }
  );
}

/**
 * Type into a field with real keystrokes, not page.fill().
 *
 * fill() assigns .value and dispatches one input event, so it walks straight
 * past anything that swallows keydown — and "Control Panel could not be typed
 * into" is one of the three defects this whole gate was built for. Only a
 * real key sequence proves a person can type here.
 */
export async function typeIntoField(page, selector, text) {
  await page.click(selector, { timeout: 8000 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 12 });
  return page.inputValue(selector);
}

/**
 * Type into a field, and if the field did not keep what was typed, click back
 * into it and type it again.
 *
 * This exists for one measured reason, and it is a product defect, not a
 * browser quirk: Control Panel's Endpoint field loses the caret on its own
 * first keystroke while a model is connected. The field's "input" listener
 * (apps/desktop/app/core/wireup.js:818) drops the connection, which reaches
 * syncLocalModelPhase(false) (apps/desktop/app/core/persistence-status.js:1043)
 * and MOVES the whole .local-connect-fields block out of the Advanced
 * disclosure — and moving an element in the DOM blurs the focused input
 * inside it. Everything typed after that goes to <body>. Typing again works,
 * because the second pass no longer changes the phase and so moves nothing.
 *
 * The gate does NOT hide that: the stop "control-panel-typing" asserts one
 * honest pass and fails on it. This helper is only for the connect step,
 * whose job is to get a model attached so the other stops can run at all.
 */
export async function typeIntoFieldUntilItSticks(page, selector, text, attempts = 3) {
  let value = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await typeIntoField(page, selector, text);
    if (value === text) break;
  }
  return value;
}

/**
 * Drag a desktop icon onto the Trash, the way a person puts a disk away.
 *
 * The Trash is a real HTML5 drop target (data-drop-target="trash" in
 * apps/desktop/index.html), so this is a real drag: Playwright's dragAndDrop
 * presses, moves and releases the mouse, and the browser turns that into the
 * dragstart/dragover/drop sequence apps/desktop/app/core/drag-drop.js listens
 * for. Nothing here calls handleDropToTrash().
 */
export async function dragToTrash(page, sourceSelector) {
  await page.dragAndDrop(sourceSelector, '.icon-column .desktop-icon[data-drop-target="trash"]', { timeout: 15000 });
}

/** Click the window's title text — raises it to front without hitting close/zoom/shade. */
export async function raiseWindow(page, windowName) {
  await closeManuscriptIfBlocking(page, windowName);
  await page.locator(`[data-window="${windowName}"] .title-bar h2`).first().click({ timeout: 5000 });
}

/**
 * Click into the stop's own paper — its content area, not its title bar —
 * and assert the window is still frontmost afterward. This is the specific
 * shape of defect the owner named: a window that drops out of front the
 * moment a person interacts with its own content.
 */
export async function clickIntoPaper(page, windowName, paperSelector, label, options = {}) {
  await closeManuscriptIfBlocking(page, windowName);
  const locator = page.locator(`[data-window="${windowName}"] ${paperSelector}`).first();
  await locator.waitFor({ state: "visible", timeout: 8000 });
  const box = await locator.boundingBox();
  if (box) {
    // Default is the paper's top-left corner, matching the original walk.
    // `point: "center"` exists for narrow papers whose top corner is where
    // the Dictation Pad's floating button clamps when it cannot sit beside
    // the field — clicking there would summon the pad, not the paper.
    const px = options.point === "center"
      ? box.x + box.width / 2
      : box.x + Math.min(24, box.width / 2);
    const py = options.point === "center"
      ? box.y + box.height / 2
      : box.y + Math.min(14, box.height / 2);
    await page.mouse.click(px, py);
  } else {
    await locator.click({ force: true });
  }
  await assertFrontmost(page, windowName, `${label} (after clicking into its paper)`);
}

/**
 * The working-session snapshot autosaves on a debounce, not synchronously.
 * Journey B (tests/e2e/user-journey.spec.mjs) measured and documented this
 * exact interval as the real one to wait for before a reload; reused here so
 * "survives a reload" tests the product's real save cadence, not a guess.
 */
export async function waitForAutosave(page) {
  await page.waitForTimeout(1800);
}

/**
 * Is the walk itself navigating this page right now?
 *
 * The browser cancels every request still in flight when a navigation starts,
 * and reports each one as net::ERR_ABORTED. Those aborts are the walk's own
 * doing and say nothing about the product, but "framenavigated" only fires
 * when the new page COMMITS — after the aborts — so the browser's own signal
 * arrives too late to tell them apart. The walk knows exactly when it
 * reloads, so it says so here, before it asks, and keeps saying so until the
 * new document reports itself ready.
 *
 * tooling/verify-walk.mjs reads this to decide whether an abort was its own
 * reload or the app cancelling its own work; the second one is still
 * reported, which is what the diagnostic exists for.
 *
 * This replaces a two-second timer that guessed the same thing. The timer was
 * wrong in one direction that matters: this app reloads a 2.9 MB bundle, and
 * a reload that commits late left the walk reporting its own cancellation as
 * a product defect. A flag the harness sets cannot be late.
 */
export function walkIsNavigating(page) {
  return page.__walkNavigating === true;
}

export async function reloadApp(page) {
  page.__walkNavigating = true;
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45000 });
  } finally {
    page.__walkNavigating = false;
  }
}

/** The Writing Flow spine rail's own step buttons — the real, always-visible route nav. */
export async function openSpineStop(page, action) {
  await page.click(`.writing-spine-panel [data-action="${action}"]`);
}

/**
 * A virgin profile boots straight into the ClioTalk first-run introduction
 * (openStartupItems() forces "assistant" frontmost on every reload until
 * onboarding completes — see apps/desktop/app/core/desktop-runtime.js). A
 * real first-time user who wants the desk, not a chat, closes that window;
 * closeWindow() completes onboarding on exactly that click (see
 * completeClioOnboarding("closed") in apps/desktop/app/core/window-manager.js).
 * Without this, every later reload in the walk re-opens ClioTalk on top of
 * whatever stop was actually being tested.
 */
export async function dismissClioOnboarding(page) {
  const assistant = page.locator('[data-window="assistant"]');
  if (!(await assistant.isVisible().catch(() => false))) return;
  // As of the current main tip, ClioTalk's own close-box computes
  // visibility:hidden during the first-run introduction (no matching CSS
  // rule found in apps/desktop/styles/ or an inline style — likely a fresh
  // regression from this same merge, flagged separately for the owning
  // lane). The element, its id, and its click handler are all otherwise
  // correct — {force:true} still fires a real click through the browser's
  // event system at the element's real coordinates, it only skips
  // Playwright's own pre-click visibility assertion.
  await assistant.locator(".close-box").click({ timeout: 5000, force: true });
  await page.waitForFunction(
    () => document.querySelector('[data-window="assistant"]')?.classList.contains("is-hidden") !== false,
    undefined,
    { timeout: 10000 }
  ).catch(() => {});
}

/**
 * Re-mount a project by name through the real switcher — the action a
 * returning user takes, and the honest way this gate re-establishes which
 * project is active after a reload in the "desktop" profile (see the long
 * comment at the Project Hard Disk stop in tooling/verify-walk.mjs for why
 * a raw reload does not promise the same project stays mounted there).
 */
export async function reselectProjectThroughUi(page, name) {
  await page.click("#project-switcher-button");
  const item = page.locator("#project-switcher-popover [data-switch-project]", { hasText: name });
  await item.waitFor({ state: "visible", timeout: 10000 });
  const projectId = await item.getAttribute("data-switch-project");
  await item.click();
  // The switcher's own label text can read correctly while activeProjectId
  // itself has not actually followed — verify the real binding, not just
  // what the button says, and click again if it did not take.
  if (projectId) {
    const took = await page.waitForFunction(
      (id) => typeof activeProjectId !== "undefined" && activeProjectId === id,
      projectId,
      { timeout: 3000 }
    ).then(() => true).catch(() => false);
    if (!took) {
      await page.click("#project-switcher-button");
      await item.click();
    }
  }
}

/**
 * Reload, then make sure the walk's own project is still the active one.
 * A reload can restore a different (default) project as active — observed
 * in both the "desktop" and "writing" profiles on this build, not only the
 * documented "desktop re-greets through ClioTalk" case — so every reload in
 * this walk re-checks and, if needed, re-picks the project by name through
 * the real switcher rather than assuming the mount survived.
 */
export async function reloadKeepingProject(page, projectName) {
  await reloadApp(page);
  // The switcher's own label text is not proof enough — it has been
  // observed showing the right name while activeProjectId itself pointed
  // at a different project. Check the real binding.
  const correct = await page.evaluate(
    (name) => typeof getActiveProject === "function" && getActiveProject()?.name === name,
    projectName
  ).catch(() => false);
  if (!correct) {
    await reselectProjectThroughUi(page, projectName);
  }
}

export async function enterWritingStudio(page) {
  // The toggle is a real toggle: double-clicking it while already in
  // "writing" profile (something upstream — project creation, in current
  // main — can enter it directly) quits Writing Studio instead of doing
  // nothing. Project creation's own profile switch can still be mid-flight
  // (a brief window where the spine is already visible but
  // body.dataset.workspaceProfile has not caught up), so this waits a beat
  // for that to settle rather than trusting one instant snapshot — racing
  // a second, overlapping profile-switch save against the first one is
  // exactly the shape of thing that trips the desk-record-conflict guard.
  const alreadyWriting = await page.waitForFunction(
    () => document.body.dataset.workspaceProfile === "writing",
    undefined,
    { timeout: 2000 }
  ).then(() => true).catch(() => false);
  if (!alreadyWriting) {
    await page.dblclick("#finder-writing-studio-toggle");
    await page.waitForFunction(
      () => document.body.dataset.workspaceProfile === "writing",
      undefined,
      { timeout: 15000 }
    );
  }
  const questionSheetVisible = await page.locator('[data-window="questionSheet"]:not(.is-hidden)')
    .waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
  if (!questionSheetVisible) {
    // Writing Studio can default-enter onto a different surface; the spine
    // is the real, always-present control back to Question Sheet.
    await page.click('.writing-spine-panel [data-action="open-question-sheet"]').catch(() => {});
    await page.waitForSelector('[data-window="questionSheet"]:not(.is-hidden)', { timeout: 10000 });
  }
}

/** Only accept an overwrite/final confirmation; a real failure alert must stay open. */
export async function acceptConfirmModalIfPresent(page) {
  try {
    await page.waitForSelector("#system-modal[open]", { timeout: 3000 });
  } catch {
    return;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.$("#system-modal[open]");
    if (!open) return;
    const message = await page.textContent("#system-modal-message");
    if (!/already has content|将被覆盖|overwritten|overwrite|final|最终/i.test(message || "")) return;
    await page.click("#system-modal-yes");
    try {
      await page.waitForSelector("#system-modal", { state: "hidden", timeout: 5000 });
    } catch {
      // A second modal may have replaced the first; the loop re-checks.
    }
  }
}

/**
 * A real user answers "Do you want to save the changes to …?" with Save.
 * The burn-to-Project-CD stop hides TeachText after the export, and the
 * window manager's own protect-the-work prompt can appear at that moment;
 * the walk accepts it the way a person would instead of leaving the
 * manuscript's fate to the timeout.
 */
export async function acceptSavePromptIfPresent(page) {
  try {
    await page.waitForSelector("#system-modal[open]", { timeout: 4000 });
  } catch {
    return;
  }
  const message = await page.textContent("#system-modal-message");
  if (!/Do you want to save|要保存/.test(message || "")) return;
  await page.click("#system-modal-yes");
  try {
    await page.waitForSelector("#system-modal", { state: "hidden", timeout: 5000 });
  } catch {
    // Another modal may have replaced the first; the caller re-checks.
  }
}

/**
 * Answer "Do you want to save the changes to …?" with Don't Save. The
 * restored demo disk's content already lives in the project on disk, so
 * discarding the in-memory label change is the honest path for this gate,
 * and it also clears the dirty flag so the prompt does not reappear on the
 * next window hide.
 */
export async function acceptDiscardPromptIfPresent(page) {
  try {
    await page.waitForSelector("#system-modal[open]", { timeout: 4000 });
  } catch {
    return;
  }
  const message = await page.textContent("#system-modal-message");
  if (!/Do you want to save|要保存/.test(message || "")) return;
  await page.click("#system-modal-no");
  await page.waitForSelector("#system-modal", { state: "hidden", timeout: 5000 }).catch(() => {});
}

/** Create + mount a project through the real desktop switcher (real clicks, real fill). */
export async function createProjectThroughUi(page, name) {
  await page.click("#project-switcher-button");
  await page.click('#project-switcher-popover [data-action="new-project-disk"]');
  await page.fill("#new-project-disk-name", name);
  await page.click("#new-project-disk-confirm");
  await page.waitForSelector("#new-project-disk-modal", { state: "hidden", timeout: 10000 });
}

/**
 * Bring the Local Model tab's Endpoint field into view, in either phase.
 *
 * The Local tab has two faces, and which one it shows is NOT the walk's to
 * choose. Before a connection it shows the connect fields; once something is
 * connected, syncLocalModelPhase() (persistence-status.js) MOVES the same
 * connect fields into the "Advanced" disclosure — the address you already
 * connected to stops deserving a row of its own. The field is not hidden; it
 * is somewhere else.
 *
 * This matters because the walk is a shared-machine gate. On the owner's own
 * Mac a real LM Studio is often listening on the default port, the app finds
 * it, the tab flips to the connected face, and a helper that only opened the
 * first disclosure could no longer see the field. Opening both disclosures
 * covers both faces, and neither click changes what is connected — which the
 * old recovery (press Connect until the model fields go away) did, and which
 * never came back when the thing on the other end was real.
 */
export async function revealLocalEndpointField(page) {
  for (const disclosure of ["#local-manual-connection", "#local-advanced-details"]) {
    const details = page.locator(disclosure);
    if (!(await details.count())) continue;
    if (await details.evaluate((el) => el.open)) continue;
    await details.locator(":scope > summary").click({ timeout: 8000 }).catch(() => {});
  }
  await page.waitForSelector("#endpoint", { state: "visible", timeout: 15000 });
}

/**
 * Connect the fake local-model server through the real Control Panel UI
 * (the same click path as tests/e2e/user-journey.spec.mjs Journey C) so the
 * model-backed stop never needs a cloud key or a real LM Studio instance.
 */
export async function connectFakeModelThroughUi(page, fakeModelPort) {
  // A still-open Manuscript companion can cover Control Panel the same way
  // it covers the writing-route windows.
  await closeManuscriptIfBlocking(page, "control");
  await page.click(".menu-bar .apple");
  await page.click('.apple-menu-popover [data-action="open-control"]');
  await page.waitForSelector('[data-window="control"]:not(.is-hidden)', { timeout: 10000 });
  await page.click("#control-tab-local");
  await closeManuscriptIfBlocking(page, "control");
  const manualConnection = page.locator("#local-manual-connection");
  if (!(await manualConnection.evaluate((el) => el.open))) {
    await manualConnection.locator(":scope > summary").click({ timeout: 5000 }).catch(async () => {
      await closeManuscriptIfBlocking(page, "control");
      await manualConnection.locator(":scope > summary").click();
    });
  }
  await page.waitForFunction(
    () => document.querySelector("#local-manual-connection")?.open === true,
    undefined,
    { timeout: 5000 }
  );
  const modelFields = page.locator(".local-model-fields");
  await revealLocalEndpointField(page);
  // Typed, not filled. "Control Panel could not be typed into" is one of the
  // three defects this gate was built for, and page.fill() assigns .value
  // directly — it would walk straight past anything that swallows keydown.
  // This is the walk's proof that a person can type here, and it is made on
  // the one path that already knows how to bring the field into view
  // whatever the machine's model server is doing.
  const endpointUrl = `http://127.0.0.1:${fakeModelPort}`;
  const typedEndpoint = await typeIntoFieldUntilItSticks(page, "#endpoint", endpointUrl);
  assert(
    typedEndpoint === endpointUrl,
    `Control Panel did not take the typed endpoint: #endpoint reads ${JSON.stringify(typedEndpoint)}, `
    + `and ${endpointUrl.length} characters were typed into it with real keystrokes, three times over`
  );
  // The connect button can be mid-transition (its own field group toggling
  // visibility right after the endpoint fill) — a short retry rather than a
  // single click.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await closeManuscriptIfBlocking(page, "control");
    try {
      await page.click("#connect-local-model", { timeout: 4000 });
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.waitForTimeout(500);
    }
  }
  await modelFields.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(
    () => /connected|已连接|连接成功/i.test(document.querySelector("#local-connection-status")?.textContent || ""),
    undefined,
    { timeout: 20000 }
  );
  await page.waitForFunction(
    () => (document.querySelector("#model")?.value || "").trim() !== "",
    undefined,
    { timeout: 20000 }
  );
  await page.click('[data-window="control"] .close-box');
  await page.waitForFunction(
    () => document.querySelector('[data-window="control"]')?.classList.contains("is-hidden"),
    undefined,
    { timeout: 10000 }
  );
}

export { menuBarMenu };
