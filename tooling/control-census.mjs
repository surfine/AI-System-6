// Control census — measures, by execution, how many of AI System 6's
// controls actually do something.
//
// The product's registration is not centralized: actions.js carries a large
// static handler table, feature modules add more through
// window.AISystem6Runtime.registerApplication({commands}) /
// registerCommand / registerLazyCommand, and four lazy game modules
// (Bonsai City, DOOM, Micropolis, OpenTTD) build their own application menu
// set at load time via AISystem6RegisterApplicationMenuSet. A static grep of
// index.html + menus.js cannot see any of the runtime-registered paths, so it
// cannot tell a live control from a dead one — it can only tell you a
// data-action string exists somewhere in source. This tool answers the real
// question instead: boot the real app in a real browser, open every
// registered window, walk every application's menu bar, and for every
// distinct action a control can dispatch, actually dispatch it (or read its
// registered isAvailable()) and observe what happened.
//
// Classification per distinct action id (shared across every control/menu
// site that dispatches it, since the wiring defect or correctness lives in
// the handler/registration, not in the pixel that triggered it):
//   live            — dispatch produced an observable effect
//   inert-by-design — the app's own isAvailable() correctly refused it now
//   dead            — enabled, dispatched, and nothing observable happened,
//                      or the handler threw / logged an error, or the action
//                      was never registered anywhere reachable
//   not-exercised   — destructive or externally-navigating; denylisted, never
//                      invoked, counted honestly rather than silently dropped
//
// Usage:
//   node tooling/control-census.mjs [--quick] [--out <path>]
//
// --quick restricts the window walk to a small fixed subset for fast
// iteration on this tool itself; it is not a measurement run.
//
// Reused rather than rebuilt: tooling/lib/app-preview-server.mjs (server
// lifecycle), tests/e2e/fake-model.mjs (deterministic model stub so
// model-backed commands never hide behind "no model connected"),
// tests/e2e/helpers.mjs (bootApp/openWindow/createProject/connectFakeModel/
// enableMultiFinder/enterWritingStudio — the same boot and drive paths the
// e2e suite already validates). No tooling/verify-walk existed at the time
// this was written (checked; see the report this tool's caller produced).

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { repositoryRoot } from "./lib/paths.mjs";
import { createFakeModelServer } from "../tests/e2e/fake-model.mjs";
import {
  bootApp,
  dismissGuide,
  createProject,
  openWindow,
  connectFakeModel,
  enableMultiFinder,
  enterWritingStudio,
  runAction,
} from "../tests/e2e/helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(repositoryRoot, "internal/evidence/drafts/control-census");
const baselinePath = join(__dirname, "control-census-baseline.json");

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const outArgIndex = args.indexOf("--out");
const outPath = outArgIndex >= 0 ? args[outArgIndex + 1] : join(evidenceDir, "report.json");

// Controls whose action id matches one of these are never dispatched. Data
// loss is not the concern in a throwaway profile — disruption is: a
// destructive action could still stall the walk on a native confirm(), and an
// external-navigation action opens a real, non-deterministic network
// resource outside the app under test. "erase"/"discard"/"empty"/"remove" are
// not in the brief's literal list (delete/trash/burn/reset/quit/shutdown/
// export-download) but are the same class of thing and are added here
// deliberately.
const DESTRUCTIVE_PATTERN = /delete|trash|burn|reset|quit|shut-?down|export|download|erase|discard|empty|remove/i;
// Actions whose handler is a literal window.open() to a real external host.
// Found by grepping apps/desktop/app for window.open( with a literal
// https?:// URL; see the report for the exact three ids.
const EXTERNAL_NAV_ACTIONS = new Set(["open-github-repo", "open-project-site", "open-guide-promo"]);

function classifyDenylist(rawAction) {
  const base = rawAction.split(":")[0];
  if (EXTERNAL_NAV_ACTIONS.has(base)) return "external-navigation";
  if (DESTRUCTIVE_PATTERN.test(base)) return "destructive";
  return null;
}

// ---------------------------------------------------------------------------
// In-page probe. Injected once after boot; runs entirely inside the page's
// own global scope so it sees the same top-level bindings (handleAction,
// getApplicationCommandRegistry, window.AISystem6Runtime, ...) that a real
// click would go through. This mirrors the exact prefix-stripping handleAction
// performs in apps/desktop/app/core/actions.js (~lines 1479-1514) before its
// own registry lookup, so a parameterized action (open-chat-file:<id>, etc.)
// resolves to the same registered command a real dispatch would find. If that
// prefix list in actions.js changes, this mirror needs updating too.
// ---------------------------------------------------------------------------
// Runs directly in the page's own global scope (Playwright serializes and
// re-executes the function there), so bare references below to
// handleAction / getApplicationCommandRegistry / activeAppId / etc. resolve
// against the app's real top-level bindings — the same ones a real click
// handler sees. No eval indirection needed: nested closures work the same
// way in-page as they do anywhere else.
function installProbe() {
  function normalize(action) {
    const a = String(action);
    if (a.startsWith("open-system-folder-path:")) return "open-system-folder-path";
    if (a.startsWith("peek-project-disk:")) return "peek-project-disk";
    if (a.startsWith("open-applications-folder-path:")) return "open-applications-folder-path";
    if (a.startsWith("open-system-prompt-file:")) return "open-system-prompt-file";
    if (a.startsWith("open-chat-file:")) return "open-chat-file";
    if (a.startsWith("open-droplet:")) return "open-droplet";
    if (/^lightroom-[a-z0-9-]+:/.test(a)) return a.split(":")[0];
    if (a.startsWith("open-control-strip-module:")) return "open-control-strip-module";
    return a;
  }
  // A "Choose..." command hands the question to the operating system: it
  // clicks a file input, the system raises its own picker, and the page it
  // came from does not change at all. Every field below is blind to that,
  // so three real commands in Cover Glass read as silence. Counting the
  // clicks the app makes on a file input answers the same question the
  // fields do -- did anything happen -- for the one case that leaves the
  // document. Installed once, at the same time as the probe.
  // A separate flag, not the count itself: a count still at zero would
  // re-arm the listener and then count one click twice.
  if (!window.__censusPickerWatch) {
    window.__censusPickerWatch = true;
    window.__censusPickerCount = 0;
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.tagName === "INPUT" && target.type === "file") window.__censusPickerCount += 1;
    }, true);
  }
  // Each field below asks the app one question about its visible state. Four
  // of them read a state the app expresses in more than one way, and each was
  // corrected after a control that demonstrably works in the running app was
  // reported dead only because this function looked at the wrong half of that
  // state. The corrections widen the reading of a question already asked; they
  // do not add a new pass and they do not narrow the walk.
  //
  //   visibleWindows   MultiFinder's Hide rolls a window up (.is-collapsed —
  //                    the WindowShade class), it does not set .is-app-hidden.
  //                    Proof: "Hide Others" left this field identical while
  //                    every other application's canvas went offsetParent
  //                    null.
  //   checkedActions   A toolbar states its current choice with
  //                    aria-pressed / aria-selected; a menu states the same
  //                    choice with .is-checked. Proof: every ClioPaint tool
  //                    command moved aria-pressed only, and two buttons
  //                    swapping "true"/"false" keeps even the document length
  //                    identical.
  //   windowOrder      "Bring All to Front" changes which window is on top and
  //                    nothing else. Proof: it was the only field that moved.
  //   language         The language switch repaints every string in the app.
  //                    Proof: lang went en -> zh-Hans and no field here saw it.
  //   modalMessage     One <dialog id="system-modal"> carries every system
  //                    message, so openDialogs cannot tell one message from
  //                    the next. Proof: "About MultiFinder..." replaced a
  //                    writing-tool result already standing in that same
  //                    dialog, and openDialogs read "system-modal" both
  //                    before and after.
  //
  // A second group of fields was added after the four above, for the same
  // reason and with the same kind of proof: a command changes what the person
  // is looking at, and none of the fields above can see it.
  //
  //   activeWindowText  The text of the front window is what a person reads.
  //                     Proof: "Budget", "Evaluation", "Open City..." each
  //                     replaced the whole content of the front window and no
  //                     field above moved.
  //   focusPath         Proof: "Find..." moved the caret into the search
  //                     field and changed nothing else.
  //   fieldValues       Proof: "Shuffle" in CMF Studio rewrote every colour
  //                     field in the window.
  //   canvasDigest      Proof: "New City" painted a whole map; the window's
  //                     own text was identical either side of it.
  //   filePickerOpens   Proof: "Choose Background...", "Choose Subject..."
  //                     and "Choose Motion..." each clicked their own file
  //                     input and raised the system picker, and every field
  //                     above read identically either side of it.
  //   selectionRange    Highlighted text is a thing a person sees, and it is
  //                     the whole of what one command does. Proof: "Select
  //                     All" in sixteen menus put the caret at one end and
  //                     the anchor at the other, moved no window, wrote no
  //                     status and left focusPath where it already was. Read
  //                     from every visible field, because a menu command
  //                     selects a field the menu row took the focus from.
  //
  // A wider snapshot can also credit a window that repaints by itself, so
  // probe() below measures the same fields once with no command in between
  // and discards whichever ones move on their own.
  function snapshot() {
    // The menu bar states a chosen tool, speed or projection with a check
    // mark, and it computes those marks in updateMenuState(). A person sees
    // them the next time the menu opens; without this call the census reads
    // the marks as they stood before the command.
    try {
      if (typeof updateMenuState === "function") updateMenuState();
    } catch { /* a module that is not loaded cannot report a check mark */ }
    const activeWindowEl = document.querySelector(".window.is-active");
    const focused = document.activeElement;
    // Both field readings below stop at sixty elements, and this walk leaves
    // seventy-six windows open, so the sixty could all belong to windows
    // nobody is looking at while the command wrote into the one in front.
    // Put the front window's fields first; the cap then falls on the rest.
    const frontFirst = (elements) => [
      ...elements.filter((el) => el.closest(".window") === activeWindowEl),
      ...elements.filter((el) => el.closest(".window") !== activeWindowEl),
    ];
    return {
      visibleWindows: JSON.stringify([...document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)")].map((w) => w.dataset.window).sort()),
      activeWindow: document.querySelector(".window.is-active")?.dataset.window || "",
      statusText: (document.querySelector("#status")?.textContent || "").trim(),
      modalOpen: !!document.querySelector("#system-modal[open]"),
      openDialogs: JSON.stringify([...document.querySelectorAll("dialog[open]")].map((d) => d.id).sort()),
      checkedActions: JSON.stringify([...document.querySelectorAll("[data-action].is-checked, [data-action][aria-pressed='true'], [data-action][aria-selected='true']")].map((el) => el.dataset.action).sort()),
      bodyDataset: JSON.stringify(Object.assign({}, document.body.dataset)),
      title: document.title,
      windowOrder: JSON.stringify([...document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)")]
        .map((w) => [w.dataset.window, Number(w.style.zIndex || 0)])
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .map((pair) => pair[0])),
      language: document.documentElement.lang || "",
      modalMessage: (document.querySelector("#system-modal-message")?.textContent || "").trim().slice(0, 160),
      activeWindowText: (activeWindowEl?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000),
      focusPath: focused ? `${focused.tagName}#${focused.id || ""}.${String(focused.className || "").split(" ")[0] || ""}` : "",
      filePickerOpens: String(window.__censusPickerCount || 0),
      selectionRange: (() => {
        // A field states its selection with selectionStart/End; the document
        // states the same thing through the window's own Selection. Read
        // both, so a command that highlights either one is seen.
        //
        // Every visible field, not only the focused one: Select All is
        // reached from a menu, the menu row takes the focus, and the field
        // it selects is then not document.activeElement. Reading only the
        // focused element saw nothing and called the command dead. Same
        // shape and same cap as fieldValues below.
        const fields = frontFirst([...document.querySelectorAll("input,textarea")]
          .filter((el) => el.offsetParent !== null && typeof el.selectionStart === "number"))
          .slice(0, 60)
          .map((el) => `${el.id || el.name || el.type}:${el.selectionStart}-${el.selectionEnd}`)
          .join(",");
        let page = "";
        try {
          const selection = window.getSelection();
          if (selection && selection.rangeCount) page = `doc:${String(selection.toString()).length}`;
        } catch { /* a detached document has no selection to report */ }
        return `${fields}|${page}`;
      })(),
      fieldValues: frontFirst([...document.querySelectorAll("input,textarea,select")]
        .filter((el) => el.offsetParent !== null))
        .slice(0, 60)
        .map((el) => `${el.id || el.name || el.type}=${String(el.value ?? "").slice(0, 24)}`)
        .join("|"),
      canvasDigest: [...document.querySelectorAll("canvas")]
        .filter((el) => el.offsetParent !== null)
        .slice(0, 6)
        .map((el) => {
          try {
            const ctx = el.getContext("2d");
            if (!ctx) return `${el.id || "canvas"}:gl${el.width}x${el.height}`;
            const data = ctx.getImageData(0, 0, Math.min(el.width, 64), Math.min(el.height, 64)).data;
            let hash = 0;
            for (let i = 0; i < data.length; i += 97) hash = (hash * 31 + data[i]) >>> 0;
            return `${el.id || "canvas"}:${hash}`;
          } catch {
            return `${el.id || "canvas"}:opaque`;
          }
        })
        .join("|"),
    };
  }
  // The field set this tool measured before the second group above was
  // added. Every run reports the count both ways, so a fall in the dead
  // count can be read as product repair or as a wider observation, and not
  // be mistaken for the other.
  const NARROW_FIELDS = [
    "visibleWindows", "activeWindow", "statusText", "modalOpen", "openDialogs",
    "checkedActions", "bodyDataset", "title", "windowOrder", "language", "modalMessage",
  ];
  function diff(pre, post) {
    const reasons = [];
    for (const key of Object.keys(pre)) {
      if (pre[key] !== post[key]) reasons.push(`${key}: ${pre[key]} -> ${post[key]}`);
    }
    return reasons;
  }
  function context() {
    return {
      activeWindow: document.querySelector(".window.is-active")?.dataset.window || "",
      activeAppId: typeof activeAppId !== "undefined" ? activeAppId : "",
      workspaceProfile: document.body.dataset.workspaceProfile || "",
      projectMounted: typeof activeProjectId !== "undefined" && !!activeProjectId,
      modelConnected: !!(document.querySelector("#model")?.value || "").trim(),
    };
  }
  window.__census = {
    normalizeMany: (actions) => actions.map(normalize),
    async probe(rawAction) {
      const norm = normalize(rawAction);
      let command = typeof getApplicationCommandRegistry === "function"
        ? getApplicationCommandRegistry().get(norm)
        : null;
      let lazyOnly = false;
      if (!command) {
        const lazy = window.AISystem6Runtime?.lazyCommands?.get?.(norm);
        if (lazy) {
          lazyOnly = true;
          try {
            await lazy.ensure();
            command = getApplicationCommandRegistry().get(norm);
          } catch (ensureError) {
            return { verdict: "dead", cause: "lazy-ensure-throws", detail: String(ensureError && ensureError.message || ensureError) };
          }
        }
      }
      if (!command) {
        return { verdict: "dead", cause: lazyOnly ? "lazy-module-never-resolves" : "never-registered" };
      }
      let available;
      try {
        available = command.isAvailable() !== false;
      } catch (availError) {
        return { verdict: "dead", cause: "is-available-throws", detail: String(availError && availError.message || availError) };
      }
      if (!available) {
        return { verdict: "inert-by-design", context: context() };
      }
      // Is this one of a set of alternatives, asked for the one already in
      // force? "Ranked Bars" while the chart is already ranked bars, "Back"
      // while the model is already at Back, "Hold" while the pad is already
      // holding. The command's postcondition is met before it runs, so it
      // changes nothing, and the app is not silent about it -- the row wears
      // the check mark that says so. Read here, applied at the verdict below:
      // the command is still dispatched, so a handler that throws or logs is
      // still caught, and only the bare "nothing moved" reading is answered
      // with this instead of with "dead". Guarded twice so a lone switch
      // cannot slip through: the control has to be marked already, and it has
      // to belong to a set, meaning another control in the document carries
      // the same choice key. A filled/unfilled toggle is the only element
      // with its key, so it is still measured the ordinary way.
      const alreadyInForce = (() => {
        // The marks are computed, not stored, so ask for them before reading.
        try {
          if (typeof updateMenuState === "function") updateMenuState();
        } catch { /* a module that is not loaded cannot report a check mark */ }
        const marked = [...document.querySelectorAll("[data-action]")].filter((el) => (
          el.dataset.action === rawAction
          && (el.classList.contains("is-checked")
            || el.getAttribute("aria-pressed") === "true"
            || el.getAttribute("aria-selected") === "true")
        ));
        const ignored = new Set(["action", "i18n", "shortcutId", "balloonHelp", "balloonHelpDisabled", "balloonHelpGenerated", "submenuAction"]);
        return marked.some((el) => Object.keys(el.dataset).some((key) => {
          if (ignored.has(key)) return false;
          const attribute = `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
          return document.querySelectorAll(`[${attribute}]`).length > 1;
        }));
      })();
      const settle = async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, 200));
      };
      // Control pass: the same two snapshots across the same interval, with
      // no command in between. A game HUD, a clock and a running canvas all
      // move by themselves, and a wide snapshot would read that movement as
      // proof that whatever was clicked did something. Whichever fields move
      // here are not evidence for this command.
      const idleBefore = snapshot();
      await settle();
      const pre = snapshot();
      const selfMoving = new Set(Object.keys(idleBefore).filter((key) => idleBefore[key] !== pre[key]));

      let threw = null;
      let handlerSettled = false;
      const running = (async () => {
        try {
          await handleAction(rawAction);
        } catch (invokeError) {
          threw = String(invokeError && invokeError.message || invokeError);
        }
        handlerSettled = true;
      })();
      // A command that raises a dialog and waits for an answer does not
      // resolve until a person answers it. Waiting on the handler's promise
      // scored every one of those as a crash, although the dialog it opened
      // was on screen within a frame. Observe on the clock, not on the
      // promise; the caller closes whatever dialog is still standing before
      // it measures the next command, which also releases this handler.
      await Promise.race([running, new Promise((r) => setTimeout(r, 2500))]);
      await settle();
      const post = snapshot();
      const reasons = diff(pre, post).filter((reason) => !selfMoving.has(reason.split(":")[0]));
      const narrowReasons = reasons.filter((reason) => NARROW_FIELDS.includes(reason.split(":")[0]));
      if (threw && !reasons.length) return { verdict: "dead", cause: "handler-throws", detail: threw, narrowLive: false };
      if (reasons.length) {
        return { verdict: "live", detail: reasons, narrowLive: narrowReasons.length > 0, pending: !handlerSettled };
      }
      if (alreadyInForce) {
        return { verdict: "inert-by-design", cause: "already-in-force", context: context() };
      }
      return { verdict: "maybe-dead", cause: "no-op", narrowLive: false, pending: !handlerSettled };
    },
  };
}

// Sweep every [data-action] element currently in the DOM, tagging each with
// its site (which window it lives in, or which app's menu it belongs to).
function collectSites() {
  const activeApp = typeof activeAppId !== "undefined" ? activeAppId : "";
  return [...document.querySelectorAll("[data-action]")].map((el) => {
    const menuPopover = el.closest(".menu-popover, .menu-submenu-popover, .menu-sub-popover");
    const windowAncestor = el.closest("[data-window]");
    return {
      action: el.dataset.action,
      label: (el.textContent || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 80),
      disabled: !!(el.disabled || el.classList.contains("is-disabled")),
      isMenuItem: !!menuPopover,
      owningApp: menuPopover ? activeApp : "",
      windowName: windowAncestor ? windowAncestor.dataset.window : "",
    };
  });
}

async function main() {
  const startedAt = Date.now();
  mkdirSync(evidenceDir, { recursive: true });

  console.log("control-census: building app bundle...");
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["tooling/build-app-bundle.mjs"], { cwd: repositoryRoot, stdio: "inherit" });

  console.log("control-census: starting fake model...");
  const fakeModel = createFakeModelServer();
  const fakeModelPort = await fakeModel.listen();

  console.log("control-census: starting app server...");
  const { child: serverChild, url } = await startAppServer(repositoryRoot);

  const browser = await chromium.launch();
  // baseURL lets bootApp()'s own page.goto("/") (tests/e2e/helpers.mjs)
  // resolve without a prior navigation, same as playwright.config.mjs.
  const context = await browser.newContext({ baseURL: url, viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ t: Date.now(), text: msg.text() });
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push({ t: Date.now(), text: error.message }));
  // Auto-close any popup (print preview, external link) instead of letting it
  // sit around or block the walk; auto-dismiss any native dialog.
  context.on("page", (popup) => { if (popup !== page) popup.close().catch(() => {}); });
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));

  try {
    await bootApp(page);
    await dismissGuide(page);
    // workspace-profile.js defaults workspaceProfile to "writing" and a
    // fresh (never onboarded) profile can already land there via the
    // first-run Clio flow; only drive the desktop-icon toggle when the
    // boot actually landed on "desktop" — double-clicking an already
    // "writing" state risks the second click of the gesture landing on
    // whatever the first click's re-layout put under the same pixel,
    // which was observed to hang the census indefinitely.
    const bootProfile = await page.evaluate(() => document.body.dataset.workspaceProfile || "");
    if (bootProfile !== "writing") {
      await enterWritingStudio(page);
    }
    await enableMultiFinder(page);
    await createProject(page, "Control Census Project");
    await connectFakeModel(page, { port: fakeModelPort });

    // Seed enough application state that document/selection/conversation
    // -gated commands see real content instead of surfacing as
    // inert-by-design purely for lack of setup. Best-effort: a failure here
    // narrows coverage but must not abort the whole census.
    try {
      await runAction(page, "new-text-document");
      await openWindow(page, "teachText");
      await page.fill("#teachtext-body", "# Control census fixture\n\nSeed paragraph with enough body text that selection- and document-gated commands have something real to act on.");
      await page.evaluate(() => {
        const body = document.querySelector("#teachtext-body");
        if (body) { body.focus(); body.setSelectionRange(0, 20); }
      });
    } catch (error) {
      console.warn("control-census: text-document setup failed:", error.message);
    }
    try {
      await openWindow(page, "assistant");
      await page.fill("#prompt", "control census setup message");
      await page.click("#send");
      await page.waitForSelector("#messages .message.assistant .message-content", { timeout: 15000 });
    } catch (error) {
      console.warn("control-census: ClioTalk setup message failed:", error.message);
    }

    await page.evaluate(installProbe);

    // Window registry — the authoritative list of every window the app
    // knows about (tooling/agents/... window-registry lane).
    const windowNames = await page.evaluate(() => Object.keys(windowRegistry));
    const walkNames = quick
      ? windowNames.filter((n) => ["control", "teachText", "questionSheet", "finder", "notePad", "micropolis"].includes(n))
      : windowNames;

    const siteMap = new Map(); // key: rawAction|siteKind|siteId -> {action,label,disabled,isMenuItem,owningApp,windowName}
    function absorbSites(rows) {
      for (const row of rows) {
        const siteKind = row.isMenuItem ? `menu:${row.owningApp}` : `ctrl:${row.windowName}`;
        const key = `${row.action}|${siteKind}`;
        if (!siteMap.has(key)) siteMap.set(key, row);
      }
    }

    console.log("control-census: collecting boot-time sites...");
    absorbSites(await page.evaluate(collectSites));

    const failedWindows = [];
    console.log(`control-census: opening ${walkNames.length} windows...`);
    for (const name of walkNames) {
      try {
        await Promise.race([
          openWindow(page, name),
          new Promise((_, reject) => setTimeout(() => reject(new Error("open timeout")), 45000)),
        ]);
      } catch (error) {
        failedWindows.push({ window: name, error: String(error && error.message || error) });
        continue;
      }
      try {
        await page.evaluate(() => { if (typeof updateMenuState === "function") updateMenuState(); });
        absorbSites(await page.evaluate(collectSites));
      } catch (error) {
        failedWindows.push({ window: name, error: `post-open scan failed: ${String(error && error.message || error)}` });
      }
    }

    // Catch-up pass: force-render every declared application menu set,
    // including ones the game modules registered at load time, in case a
    // window's own app id was never the active one during the walk above.
    if (!quick) {
      console.log("control-census: menu catch-up pass...");
      const appIds = await page.evaluate(() => [
        ...Object.keys(typeof applicationMenuSets !== "undefined" ? applicationMenuSets : {}),
        ...(typeof lazyApplicationMenuSets !== "undefined" ? [...lazyApplicationMenuSets.keys()] : []),
      ]);
      for (const appId of [...new Set(appIds)]) {
        await page.evaluate((id) => {
          activeAppId = id;
          if (typeof renderAppMenuBar === "function") renderAppMenuBar(id, { force: true });
          if (typeof updateMenuState === "function") updateMenuState();
        }, appId);
        absorbSites(await page.evaluate(collectSites));
      }
    }

    console.log(`control-census: ${siteMap.size} distinct control sites collected.`);

    // Group sites by normalized action id for classification. One round trip
    // normalizes every site's raw action at once.
    const siteRows = [...siteMap.values()];
    const normalized = await page.evaluate(
      (actions) => window.__census.normalizeMany(actions),
      siteRows.map((row) => row.action)
    );
    const byAction = new Map(); // normalized -> { rawSample, sites: [...] }
    siteRows.forEach((row, index) => {
      const norm = normalized[index];
      if (!byAction.has(norm)) byAction.set(norm, { rawSample: row.action, sites: [] });
      byAction.get(norm).sites.push(row);
    });

    const actionIds = [...byAction.keys()].sort();
    console.log(`control-census: classifying ${actionIds.length} distinct actions...`);

    // Availability and behavior are read through the app's own context-aware
    // isAvailable()/getActionAvailability(), which key off whichever window
    // is currently active. Testing an action from whatever window the walk
    // happened to leave focused produces false verdicts (a "close-about"
    // dispatched while About isn't open silently no-ops without that being a
    // defect). Best-effort: bring one real site of the action's own window
    // (or, for a menu-only action, any window of its owning app) to the
    // front immediately before probing it.
    const windowAppMap = await page.evaluate(() =>
      Object.fromEntries(Object.entries(windowRegistry).map(([name, record]) => [name, record.app]))
    );
    function firstWindowForApp(appId) {
      return Object.entries(windowAppMap).find(([, app]) => app === appId)?.[0] || null;
    }
    async function establishContext(entry) {
      const withWindow = entry.sites.find((s) => s.windowName);
      const targetWindow = withWindow ? withWindow.windowName : firstWindowForApp(entry.sites[0]?.owningApp || "");
      if (targetWindow) {
        try {
          await Promise.race([
            openWindow(page, targetWindow),
            new Promise((_, reject) => setTimeout(() => reject(new Error("context-open timeout")), 15000)),
          ]);
          return;
        } catch {
          // fall through to app-only context below
        }
      }
      const owningApp = entry.sites.find((s) => s.owningApp)?.owningApp;
      if (owningApp) {
        await page.evaluate((id) => {
          activeAppId = id;
          if (typeof renderAppMenuBar === "function") renderAppMenuBar(id, { force: true });
        }, owningApp).catch(() => {});
      }
    }

    const results = [];
    let processed = 0;
    let reloadsObserved = 0;
    for (const norm of actionIds) {
      const entry = byAction.get(norm);
      const denylistReason = classifyDenylist(entry.rawSample);
      if (denylistReason) {
        results.push({ action: norm, verdict: "not-exercised", cause: denylistReason, sites: entry.sites });
        continue;
      }
      // A command that raises a dialog and waits is now scored on what
      // appeared rather than on its promise, so that dialog is still
      // standing when the next command is measured. Left up it makes the
      // next "opens a dialog" command read as a no-op, and it keeps the
      // previous handler suspended. Closing it answers the question with
      // Cancel, which is what an untouched dialog means.
      await page.evaluate(() => {
        document.querySelectorAll("dialog[open]").forEach((dialog) => {
          try { dialog.close(); } catch { /* a dialog mid-close is already gone */ }
        });
      }).catch(() => {});
      await establishContext(entry);
      // A prior action's dispatch can navigate/reload the page asynchronously
      // — after its own page.evaluate() already resolved, or during this
      // action's establishContext() rather than its own probe call — which
      // silently drops window.__census with no error to catch at the moment
      // it happens. Checked once, only. Sound: this is a real page attribute
      // (window.__census existing), not a value that can drift between the
      // check and the call within one synchronous Node turn.
      const censusAlive = await page.evaluate(() => typeof window.__census !== "undefined").catch(() => false);
      if (!censusAlive) {
        reloadsObserved += 1;
        await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 20000 }).catch(() => {});
        await page.evaluate(installProbe).catch(() => {});
      }
      // The status line carries the receipt of whatever ran last, and it
      // stays on screen until something replaces it. Two commands that
      // answer with the same sentence — "Type the text to find." from
      // find-change-all and then from find-change-current, walked one after
      // the other because the ids sort that way — leave the line unchanged
      // the second time, and a real receipt reads as silence. A person never
      // meets that state: they act, they read the line, and whatever they do
      // next starts from a line they have already read. Wiping it here is
      // the same hygiene as closing a left-standing dialog above, and it can
      // only reveal a receipt, never invent one — a command that writes
      // nothing leaves the line empty either side of its dispatch.
      await page.evaluate(() => {
        const status = document.querySelector("#status");
        if (status) status.textContent = "";
      }).catch(() => {});
      const errorMark = consoleErrors.length;
      let verdict;
      try {
        verdict = await Promise.race([
          page.evaluate((a) => window.__census.probe(a), entry.rawSample),
          new Promise((_, reject) => setTimeout(() => reject(new Error("probe timeout")), 20000)),
        ]);
      } catch (error) {
        const message = String(error && error.message || error);
        // A page reload is itself an observable effect, not a crash — some
        // "resume where I left off" commands legitimately reload. Credit it
        // as live for the action that triggered it; the health check above
        // (not this catch) is what keeps the probe usable for every action
        // that runs after it.
        const navigated = /context was destroyed|most likely because of a navigation|target closed|reading 'probe'/i.test(message);
        if (navigated) {
          verdict = { verdict: "live", detail: [`navigation: ${message}`] };
        } else {
          verdict = { verdict: "dead", cause: "probe-timeout-or-crash", detail: message };
        }
      }
      if (verdict.verdict === "maybe-dead") {
        const newErrors = consoleErrors.slice(errorMark);
        verdict = newErrors.length
          ? { verdict: "dead", cause: "handler-logs-error", detail: newErrors[0].text }
          : { verdict: "dead", cause: "no-op" };
      }
      results.push({ action: norm, ...verdict, sites: entry.sites });
      processed += 1;
      if (processed % 40 === 0) console.log(`control-census: ${processed}/${actionIds.length}...`);
    }

    // ---- Tally -------------------------------------------------------
    const controlTotal = [...siteMap.values()].length;
    const tally = { live: 0, "inert-by-design": 0, dead: 0, "not-exercised": 0 };
    // The same run counted against the field set this tool used before the
    // snapshot was widened: a live verdict that rests only on a new field
    // stays dead in this second tally. It exists so a fall in the headline
    // number can be attributed.
    let deadNarrowFields = 0;
    const deadByCause = new Map();
    for (const r of results) {
      const n = r.sites.length;
      tally[r.verdict] = (tally[r.verdict] || 0) + n;
      if (r.verdict === "dead") deadNarrowFields += n;
      else if (r.verdict === "live" && r.narrowLive === false) deadNarrowFields += n;
      if (r.verdict === "dead") {
        if (!deadByCause.has(r.cause)) deadByCause.set(r.cause, []);
        deadByCause.get(r.cause).push(r);
      }
    }

    const deadList = [];
    for (const [cause, entries] of deadByCause) {
      for (const entry of entries) {
        for (const site of entry.sites) {
          deadList.push({
            action: entry.action,
            cause,
            detail: entry.detail || "",
            window: site.windowName || "",
            menuApp: site.owningApp || "",
            label: site.label,
            isMenuItem: site.isMenuItem,
          });
        }
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      quick,
      runtimeMs: Date.now() - startedAt,
      totals: {
        controlSites: controlTotal,
        distinctActions: actionIds.length,
        ...tally,
        deadNarrowFields,
      },
      deadByCause: [...deadByCause.entries()].map(([cause, entries]) => ({
        cause,
        distinctActions: entries.length,
        controlSites: entries.reduce((sum, e) => sum + e.sites.length, 0),
      })),
      deadList,
      failedWindows,
      pageErrorCount: pageErrors.length,
      consoleErrorCount: consoleErrors.length,
      reloadsObserved,
      windowsWalked: walkNames.length,
      windowsTotal: windowNames.length,
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

    console.log(
      `control-census: controls=${report.totals.controlSites} actions=${report.totals.distinctActions} `
      + `live=${tally.live} inert=${tally["inert-by-design"]} dead=${tally.dead} (narrow-fields=${deadNarrowFields}) not-exercised=${tally["not-exercised"]} `
      + `(${Math.round(report.runtimeMs / 1000)}s) -> ${outPath}`
    );

    return report;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await stopProcess(serverChild);
    await fakeModel.close();
  }
}

// A hand-built file:// URL does not percent-encode, and import.meta.url does:
// from a checkout whose path contains a space -- this repo's own -- the two
// never matched, so running the census directly did nothing at all and exited
// zero. Two runs were lost to that silence before it was found.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { main, baselinePath };
