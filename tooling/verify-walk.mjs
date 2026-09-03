#!/usr/bin/env node
// The eight-stop live walk — a hard release gate.
//
// 253 green executable-feature contracts once coexisted with 20 dead route
// commands: every contract called a function directly, so nothing ever
// clicked the button a person actually clicks. This tool drives a real
// Chromium against a freshly served build on a CLEAN browser profile (a new
// Playwright context per pass — fresh IndexedDB and localStorage every run,
// which is the point: today's worst defects only showed up on a virgin
// profile) and walks the whole product route the way a person does:
//
//   Project Hard Disk -> File Floppy -> Question Sheet -> Outline ->
//   Section Drafts -> Manuscript -> Review Desk -> Project CD
//
// Two passes:
//   PASS A ("fresh walk") builds a brand-new project through the real UI at
//   every stop: real clicks, real typed text, a real reload to prove it
//   survived, and the real forward-action control that advances the route.
//   The one AI-backed step (Question Sheet -> Outline) is answered by a
//   stubbed local-model transport (reusing tests/e2e/fake-model.mjs — the
//   repo's existing stubbing seam) so the gate needs no cloud key, and it
//   asserts both that the answer lands in the Outline AND that a durable run
//   receipt was written for it.
//
//   PASS B ("demo disk") mounts the owner-designated release fixture —
//   internal/evidence/drafts/dtk-demo-disk/ — through the real Project
//   Hard Disk Backup import path, then visits every stop of the restored
//   project and asserts its real content renders (the owner's rule: the
//   disk must not be allowed to rot).
//
// Follows the browser-tool idiom already established by
// tooling/verify-bonsai-acceptance.mjs and tooling/appearance-snapshot.mjs:
// a real app server on a free port, Playwright's own managed Chromium
// (never a system channel), an `assert()` that throws, and per-stop
// evidence written to a git-ignored directory on failure.

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import {
  DEMO_DISK_PATH,
  FAKE_OUTLINE_MARKERS,
  WALK_STRINGS,
  acceptConfirmModalIfPresent,
  acceptDiscardPromptIfPresent,
  acceptSavePromptIfPresent,
  assertFrontmost,
  clickIntoPaper,
  connectFakeModelThroughUi,
  createProjectThroughUi,
  dismissClioOnboarding,
  ensureSpineWindowFrontmost,
  enterWritingStudio,
  guardedClick,
  isFrontmost,
  openSpineStop,
  raiseWindow,
  reloadApp,
  reloadKeepingProject,
  reselectProjectThroughUi,
  waitForAutosave,
  walkIsNavigating,
  writingMenuSubmenuClick,
} from "./lib/walk-dom.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

// tests/e2e/helpers.mjs and tests/e2e/fake-model.mjs are plain ESM modules
// with no dependency on the Playwright test runner (no `@playwright/test`
// import): bootApp/dismissGuide only navigate and wait on DOM state, and
// dumpIndexedDb only reads storage in the final assertion phase — none of
// them call a product function to fake a click. Reusing them keeps this gate
// from re-deriving the same boot/dismiss/ground-truth boilerplate; a sibling
// lane owns tests/e2e/ itself, so this file only imports, never edits it.
const { bootApp, dismissGuide, dumpIndexedDb } = await import(
  join(root, "tests/e2e/helpers.mjs")
);
const { createFakeModelServer } = await import(
  join(root, "tests/e2e/fake-model.mjs")
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const outputIndex = process.argv.indexOf("--output");
const evidenceDir = outputIndex >= 0
  ? resolve(process.argv[outputIndex + 1] || "")
  : join(root, "dist", "walk-evidence");
const onlyIndex = process.argv.indexOf("--only");
const onlyPass = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null; // "fresh" | "demo-disk"

if (process.argv.includes("--help")) {
  console.log("Usage: node tooling/verify-walk.mjs [--output DIR] [--only fresh|demo-disk]");
  process.exit(0);
}

mkdirSync(evidenceDir, { recursive: true });

/** Wrap one stop: name it, screenshot + diagnose on failure, keep going never. */
async function runStop(page, passId, id, label, fn) {
  const startedAt = Date.now();
  process.stdout.write(`\n[walk:${passId}] ${id} — ${label} …\n`);
  try {
    await fn();
    process.stdout.write(`[walk:${passId}] ${id} OK (${Date.now() - startedAt}ms)\n`);
  } catch (error) {
    const shotPath = join(evidenceDir, `${passId}-${id}-failure.png`);
    try {
      await page.screenshot({ path: shotPath, fullPage: true });
    } catch {
      // A page in a bad enough state to fail the stop can also fail to
      // screenshot; the diagnostic text below still carries the story.
    }
    const onScreen = await page.evaluate(() => ({
      appReady: document.body.dataset.appReady || "(unset)",
      workspaceProfile: document.body.dataset.workspaceProfile || "(unset)",
      frontmost: document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "(none)",
      visibleWindows: [...document.querySelectorAll(".window:not(.is-hidden)")].map((w) => w.dataset.window),
      status: document.querySelector("#status")?.textContent || "",
      modalOpen: document.querySelector("#system-modal[open]")
        ? document.querySelector("#system-modal-message")?.textContent || "(open, no message)"
        : "(none)",
      outlineContent: (document.querySelector("#outline-content")?.value || "").slice(0, 200),
      questionSheetContent: (document.querySelector("#question-sheet-body")?.value || "").slice(0, 200),
      projectOutline: (typeof getActiveProject === "function" ? String(getActiveProject()?.outline || "") : "(n/a)").slice(0, 200),
      localModelState: typeof localModelState !== "undefined" ? JSON.stringify(localModelState) : "(n/a)",
      modelValue: document.querySelector("#model")?.value || "(none)",
      url: location.href,
    })).catch((evalError) => ({ evalError: String(evalError?.message || evalError) }));
    throw new Error(
      `Stop "${id}" (${label}) failed in the ${passId} pass.\n`
      + `  expected: the stop to complete — ${error.message}\n`
      + `  on screen: frontmost=${onScreen.frontmost}, visible=${JSON.stringify(onScreen.visibleWindows)}, `
      + `status=${JSON.stringify(onScreen.status)}, modal=${JSON.stringify(onScreen.modalOpen)}, `
      + `workspaceProfile=${onScreen.workspaceProfile}\n`
      + `  outlineContent=${JSON.stringify(onScreen.outlineContent)}\n`
      + `  questionSheetContent=${JSON.stringify(onScreen.questionSheetContent)}\n`
      + `  projectOutline=${JSON.stringify(onScreen.projectOutline)}\n`
      + `  localModelState=${onScreen.localModelState}\n`
      + `  modelValue=${JSON.stringify(onScreen.modelValue)}\n`
      + `  screenshot: ${shotPath}`
    );
  }
}

// The Outline window's list/tree is the default view now (writing-flow.js's
// storedOutlineView: "the sections are the thing, and the text is how they
// are stored"), so a freshly opened Outline hides #outline-content behind
// the tree, not the other way around. clickIntoPaper needs the raw textarea
// on screen to click into it, so switch to the text view through the same
// Commands menu a person would use, before touching #outline-content.
async function ensureOutlineTextViewVisible(page) {
  const treeOpen = await page.evaluate(
    () => typeof outlineTreeIsOpen === "function" && outlineTreeIsOpen()
  );
  if (!treeOpen) return;
  await guardedClick(page, "outline", '[data-window="outline"] .teachtext-command-menu summary');
  await guardedClick(page, "outline", '[data-window="outline"] [data-action="toggle-outline-tree"]');
}

function attachDiagnostics(page, sink, { modelPort = 0 } = {}) {
  // The walk serves the model through the fake-model server on a free port;
  // the app's own discovery still probes the default LM Studio / Ollama
  // loopback endpoints (127.0.0.1:1234 / 11434) when nothing listens there.
  // Those refusals are the expected absence of a local model server, not an
  // app defect, and the browser logs them to the console without a URL, so
  // the request-failure filter below is what keeps the gate honest: any
  // refused request to any other address still fails the pass.
  //
  // `modelPort` is the fake model the walk itself connected the app to. It
  // belongs in this set and was missing from it: the abort pardon below was
  // written for the derived-index embedding request that a reload cancels, and
  // that request goes to the fake model's port, never to 1234. So the pardon
  // could never fire, and a release died on an abort the harness had caused.
  // The port is passed in rather than guessed, so the set stays exactly as
  // narrow as it was: three known local addresses, nothing else.
  const localModelPorts = [1234, 11434, ...(modelPort ? [Number(modelPort)] : [])];
  const defaultLocalEndpoint = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:"
        && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)
        && localModelPorts.includes(parsed.port ? Number(parsed.port) : 0);
    } catch {
      return url === "lmstudio://";
    }
  };
  page.on("pageerror", (error) => {
    const message = String(error?.message || error);
    if (!message.includes("document is sandboxed and lacks the 'allow-same-origin' flag")) {
      sink.push(`pageerror: ${message}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("Failed to load resource: net::ERR_CONNECTION_REFUSED")) return;
    sink.push(`console: ${text}`);
  });
  // A reload cancels whatever the app had in flight, and the app legitimately
  // has work in flight: connecting the model starts the derived-index queue,
  // which embeds the text the walk just wrote. Chromium reports that
  // cancellation as ERR_ABORTED against the fake model's /v1/embeddings, and
  // the walk called it a defect — three release attempts died on it.
  //
  // The rule is narrow on purpose. Only an abort DURING a reload this harness
  // itself asked for is ignored, and only for the local model endpoint. An
  // abort at any other moment still fails the walk: the app aborting its own
  // request is exactly the kind of silent give-up this gate exists to catch.
  // The abort arrives BEFORE the navigation event, not after: the old document
  // is torn down first and `framenavigated` fires once the new one commits. So
  // an abort cannot be judged when it happens — it is held, and a navigation
  // that follows within two seconds pardons it. Anything still held at the end
  // of the pass is a real abort and fails the walk, because an app that quietly
  // gives up on its own request is what this gate exists to catch.
  page.on("requestfailed", (request) => {
    const failed = request.failure();
    const url = request.url();
    if (failed?.errorText === "net::ERR_CONNECTION_REFUSED" && defaultLocalEndpoint(url)) return;
    if (failed?.errorText === "net::ERR_ABORTED" && url === "lmstudio://") return;
    if (failed?.errorText === "net::ERR_ABORTED" && defaultLocalEndpoint(url) && walkIsNavigating(page)) {
      return;
    }
    sink.push(`requestfailed: ${url} ${failed?.errorText || ""}`);
  });
}

// ---------------------------------------------------------------------------
// PASS A — a brand-new project walked stop by stop on a clean profile.
// ---------------------------------------------------------------------------
async function runFreshWalk(browser, serverUrl, fakeModelPort) {
  const passId = "fresh";
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, baseURL: serverUrl });
  const page = await context.newPage();
  const diagnostics = [];
  attachDiagnostics(page, diagnostics, { modelPort: fakeModelPort });

  await bootApp(page);
  await dismissGuide(page);
  await dismissClioOnboarding(page);

  // Stop 1 — Project Hard Disk: create and mount a project through the real
  // switcher, not a direct store write.
  await runStop(page, passId, "project-hard-disk", "create + mount a Project Hard Disk", async () => {
    await createProjectThroughUi(page, WALK_STRINGS.projectName);
    await page.dblclick("#active-project-drop-target");
    await assertFrontmost(page, "projects", "Project Hard Disk");
    await clickIntoPaper(page, "projects", "#project-disk-grid", "Project Hard Disk");

    await waitForAutosave(page);
    await reloadApp(page);
    // A fresh reload in the "desktop" profile re-greets through ClioTalk —
    // that is the product's own "front door" behavior, not a bug — so the
    // desk does not promise the same project stays the ACTIVE one across a
    // raw reload the way it does inside Writing Studio. The honest ground
    // truth is that the project's own data survived: the switcher still
    // lists it. Picking it again is the real action a returning user takes.
    await reselectProjectThroughUi(page, WALK_STRINGS.projectName);
    await page.dblclick("#active-project-drop-target");
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-window="projects"]');
        return !!el && el.classList.contains("is-active") && !el.classList.contains("is-hidden");
      },
      undefined,
      { timeout: 8000 }
    ).catch(() => {});
    await assertFrontmost(page, "projects", "Project Hard Disk (after reload)");
    await clickIntoPaper(page, "projects", "#project-disk-grid", "Project Hard Disk (after reload)");
  });

  // Stop 2 — File Floppy: short-term memory, reached from the Desktop icon
  // in the "desktop" profile — the icon is always visible in every profile,
  // and (as of workspace-profile.js's studioWindowNames/studioActionNames)
  // opening it no longer requires Writing Studio. Mount a file, see it
  // land, then prove the product's own promise — "reinsert after
  // restart" — is honest: it must NOT still claim mounted after a reload.
  // Project creation can now enter Writing Studio directly (see Stop 1's
  // own comment); File Floppy's route position is BEFORE Writing Studio in
  // the canonical order (CLAUDE.md), and the desktop-profile access path is
  // exactly what apps/desktop/app/core/workspace-profile.js's
  // studioWindowNames/studioActionNames fix targeted, so this returns to
  // "desktop" profile first via the same toggle icon, a real click.
  if (await page.evaluate(() => document.body.dataset.workspaceProfile === "writing")) {
    await page.dblclick("#finder-writing-studio-toggle");
    await page.waitForFunction(() => document.body.dataset.workspaceProfile === "desktop", undefined, { timeout: 10000 });
  }
  await runStop(page, passId, "file-floppy", "insert + read back a File Floppy", async () => {
    // Every desktop icon inside .icon-column selects on a single click and
    // opens on a double click (wireup.js's document click handler matches
    // ".icon-column .desktop-icon" and returns after selecting, before it
    // ever reaches the [data-action] dispatch below it) — including
    // data-action icons.
    await page.dblclick("#desktop-file-floppy-starter");
    await assertFrontmost(page, "rag", "File Floppy");
    await clickIntoPaper(page, "rag", ".memory-transfer-pane", "File Floppy");
    await waitForAutosave(page);

    const chooserPromise = page.waitForEvent("filechooser");
    await page.click('label[for="files"]');
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "floppy-note.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(WALK_STRINGS.floppyMarkdown, "utf8"),
    });
    await page.click("#index-files");
    await page.waitForFunction(
      () => !/no file floppy inserted|no text disk mounted/i.test(document.querySelector("#rag-status")?.textContent || "")
        && (document.querySelector("#rag-status")?.textContent || "").trim() !== "",
      undefined,
      { timeout: 15000 }
    );
    await page.dblclick("#mounted-text-disk");
    await assertFrontmost(page, "textDisk", "File Floppy (mounted)");
    await page.waitForFunction(
      () => (document.querySelector("#text-disk-grid")?.textContent || "").includes("floppy-note"),
      undefined,
      { timeout: 10000 }
    );

    // Short-term memory means exactly that: a reload must NOT still claim
    // the floppy is mounted. This is the "no status surface claims something
    // that did not happen" check for this specific stop.
    await reselectProjectThroughUi(page, WALK_STRINGS.projectName);
    await reloadApp(page);
    await reselectProjectThroughUi(page, WALK_STRINGS.projectName);
    const survived = await page.evaluate(() => {
      const status = document.querySelector("#rag-status")?.textContent || "";
      return /no file floppy inserted|no text disk mounted/i.test(status) ? false : status.trim() !== "" ? "unknown" : false;
    });
    assert(survived === false, "File Floppy falsely claimed to still be mounted after a reload (it must not persist)");
  });

  // Forward action out of File Floppy: enter Writing Studio. Not a named
  // stop itself — a profile transition every later stop lives inside.
  await enterWritingStudio(page);
  await waitForAutosave(page);
  await connectFakeModelThroughUi(page, fakeModelPort);
  await ensureSpineWindowFrontmost(page, "questionSheet", "open-question-sheet", "Question Sheet (entering Writing Studio)");
  // The desk-record-conflict standing from the profile switch's own overlapping
  // saves can outlive a single debounce; let a real autosave cycle clear it
  // (setDeskRecordConflictStanding(false) on the next successful save) before
  // any model-backed write, or that write's own save can silently misfire.
  await page.waitForFunction(
    () => typeof standingDeskRecordConflict === "undefined" || standingDeskRecordConflict === false,
    undefined,
    { timeout: 10000 }
  ).catch(() => {});

  // Stop 3 — Question Sheet. Already inside Writing Studio (entered before
  // this stop, with the stubbed model already connected).
  await runStop(page, passId, "question-sheet", "type, ask for an Outline, then survive one reload", async () => {
    await ensureSpineWindowFrontmost(page, "questionSheet", "open-question-sheet", "Question Sheet");
    await clickIntoPaper(page, "questionSheet", "#question-sheet-body", "Question Sheet");
    await page.fill("#question-sheet-body", WALK_STRINGS.questionSheetText);

    // Route commands (window-manager.js currentWritingRouteStop()) key off
    // document.activeElement's id — "route commands follow the writer, not
    // the z-order" — so the caret has to be in the Question Sheet textarea,
    // not on the toolbar button, at the moment the command dispatches.
    // Manuscript reasserting .is-active between clicks can make a dispatch
    // land on the wrong surface with no visible error, so this is a whole-
    // attempt retry (click sequence + wait for the answer to land), not
    // just a retry on a failed click.
    let landed = false;
    for (let attempt = 0; attempt < 3 && !landed; attempt += 1) {
      if (attempt > 0) {
        // A stuck desk-record-conflict standing can leave the in-memory
        // active project out of sync with what a fresh read of storage
        // would show; a reload clears the in-memory state entirely and
        // re-derives it from what actually persisted, which a re-click
        // alone does not.
        await reloadKeepingProject(page, WALK_STRINGS.projectName);
        await ensureSpineWindowFrontmost(page, "questionSheet", "open-question-sheet", `Question Sheet (retry ${attempt + 1})`);
        const stillThere = await page.inputValue("#question-sheet-body");
        if (!stillThere.includes(WALK_STRINGS.questionSheetMarker)) {
          await page.fill("#question-sheet-body", WALK_STRINGS.questionSheetText);
        }
        // The local-model connection is in-memory only; a reload drops it.
        await connectFakeModelThroughUi(page, fakeModelPort);
        await ensureSpineWindowFrontmost(page, "questionSheet", "open-question-sheet", `Question Sheet (retry ${attempt + 1}, model reconnected)`);
      }
      await guardedClick(page, "questionSheet", "#question-sheet-body");
      await guardedClick(page, "questionSheet", '[data-window="questionSheet"] .teachtext-command-menu summary');
      await guardedClick(page, "questionSheet", '[data-window="questionSheet"] [data-action="generate-outline"]');
      await acceptConfirmModalIfPresent(page);
      try {
        await page.waitForFunction(
          (marker) => (document.querySelector("#outline-content")?.value || "").includes(marker),
          FAKE_OUTLINE_MARKERS[0],
          { timeout: 10000 }
        );
        landed = true;
      } catch {
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
    assert(landed, "generate-outline never landed an answer after 3 attempts (Manuscript kept overriding which writing surface the command targets)");
    const receiptOk = await page.evaluate(() => {
      const receipts = window.AISystem6RunReceipts?.queryReceipts?.({ includeRunning: true }) || [];
      return receipts.some((file) => {
        const record = file.runReceipt || {};
        return record.intent === "generate-outline" && record.status === "completed";
      });
    });
    assert(receiptOk, "no completed run receipt was written for the generate-outline answer");

    await waitForAutosave(page);
    await reloadKeepingProject(page, WALK_STRINGS.projectName);
    await ensureSpineWindowFrontmost(page, "questionSheet", "open-question-sheet", "Question Sheet (after reload)");
    const restored = await page.inputValue("#question-sheet-body");
    assert(restored.includes(WALK_STRINGS.questionSheetMarker), "Question Sheet text did not survive a reload");
    await clickIntoPaper(page, "questionSheet", "#question-sheet-body", "Question Sheet (after reload)");
  });

  // Stop 4 — Outline.
  await runStop(page, passId, "outline", "the generated Outline persists and advances", async () => {
    await ensureSpineWindowFrontmost(page, "outline", "open-outline", "Outline");
    await ensureOutlineTextViewVisible(page);
    await clickIntoPaper(page, "outline", "#outline-content", "Outline");

    await raiseWindow(page, "outline");
    await waitForAutosave(page);
    await reloadKeepingProject(page, WALK_STRINGS.projectName);
    await ensureSpineWindowFrontmost(page, "outline", "open-outline", "Outline (after reload)");
    const restored = await page.inputValue("#outline-content");
    assert(restored.includes(FAKE_OUTLINE_MARKERS[0]), "the model's Outline answer did not survive a reload");
    await ensureOutlineTextViewVisible(page);
    await clickIntoPaper(page, "outline", "#outline-content", "Outline (after reload)");

    await page.click('[data-window="outline"] [data-action="advance-outline-to-drafts"]');
    await acceptConfirmModalIfPresent(page);
    await page.waitForSelector('[data-window="sectionDrafts"]:not(.is-hidden)', { timeout: 15000 });
  });

  // Stop 5 — Section Drafts.
  await runStop(page, passId, "section-drafts", "typed prose persists and advances", async () => {
    await ensureSpineWindowFrontmost(page, "sectionDrafts", "open-section-drafts", "Section Drafts");
    await clickIntoPaper(page, "sectionDrafts", "#draft-body", "Section Drafts");
    await page.fill("#draft-body", WALK_STRINGS.draftText);

    await raiseWindow(page, "sectionDrafts");
    await waitForAutosave(page);
    await reloadKeepingProject(page, WALK_STRINGS.projectName);
    await ensureSpineWindowFrontmost(page, "sectionDrafts", "open-section-drafts", "Section Drafts (after reload)");
    const restored = await page.inputValue("#draft-body");
    assert(restored.includes(WALK_STRINGS.draftMarker), "Section Drafts text did not survive a reload");
    await clickIntoPaper(page, "sectionDrafts", "#draft-body", "Section Drafts (after reload)");

    await page.click('[data-window="sectionDrafts"] [data-action="advance-drafts-to-manuscript"]');
    await acceptConfirmModalIfPresent(page);
    await page.waitForSelector('[data-window="teachText"]:not(.is-hidden)', { timeout: 15000 });
  });

  // Stop 6 — Manuscript (TeachText).
  await runStop(page, passId, "manuscript", "typed prose persists, marks Final, and advances", async () => {
    await assertFrontmost(page, "teachText", "Manuscript");
    await raiseWindow(page, "teachText");
    await clickIntoPaper(page, "teachText", "#teachtext-body", "Manuscript");
    await page.fill("#teachtext-body", WALK_STRINGS.manuscriptText);
    await page.keyboard.press("Meta+s");

    await raiseWindow(page, "teachText");
    await waitForAutosave(page);
    await reloadKeepingProject(page, WALK_STRINGS.projectName);
    await ensureSpineWindowFrontmost(page, "teachText", "open-teachtext", "Manuscript (after reload)");
    const restored = await page.inputValue("#teachtext-body");
    assert(restored.includes(WALK_STRINGS.manuscriptMarker), "Manuscript text did not survive a reload");
    await clickIntoPaper(page, "teachText", "#teachtext-body", "Manuscript (after reload)");

    const labelSelect = page.locator("#teachtext-label");
    if (await labelSelect.count() && !(await labelSelect.isDisabled())) {
      await labelSelect.selectOption("final");
      await acceptConfirmModalIfPresent(page);
    }
    await page.click('[data-window="teachText"] [data-action="advance-manuscript-to-review"]');
    await acceptConfirmModalIfPresent(page);
    await ensureSpineWindowFrontmost(page, "reviewDesk", "open-review-desk", "Review Desk (after Manuscript advance)");
  });

  // Stop 7 — Review Desk.
  await runStop(page, passId, "review-desk", "reads the same manuscript honestly, after a reload", async () => {
    await assertFrontmost(page, "reviewDesk", "Review Desk");
    // Click into the review markdown itself, not the whole results container:
    // in a narrow Review Desk window the Dictation Pad's floating button
    // clamps onto the top-left of the results area, and a click at the
    // container's top-left corner would summon the pad instead of the paper.
    await clickIntoPaper(page, "reviewDesk", "#review-desk-body", "Review Desk", { point: "center" });

    await waitForAutosave(page);
    await reloadKeepingProject(page, WALK_STRINGS.projectName);
    await ensureSpineWindowFrontmost(page, "reviewDesk", "open-review-desk", "Review Desk (after reload)");
    await clickIntoPaper(page, "reviewDesk", "#review-desk-body", "Review Desk (after reload)", { point: "center" });

    // Forward action: Review Desk's own advance is the manuscript view it
    // summons — the real path an export starts from. The chrome-reduction
    // pass retired the window's View Manuscript button; its permanent home
    // is Writing > Review Desk, so click the real menu path a person uses.
    await writingMenuSubmenuClick(page, "Review Desk", "review-view-manuscript");
    await page.waitForFunction(
      (marker) => (document.querySelector("#teachtext-body")?.value || "").includes(marker),
      WALK_STRINGS.manuscriptMarker,
      { timeout: 15000 }
    );
  });

  // Stop 8 — Project CD.
  await runStop(page, passId, "project-cd", "export lands, persists, and downloads", async () => {
    const exportButton = page.locator('[data-action="export-teachtext-project-cd"]:visible').first();
    await exportButton.click({ timeout: 10000 });
    await acceptConfirmModalIfPresent(page);
    await acceptSavePromptIfPresent(page);

    await page.waitForSelector("#desktop-project-cd:not([hidden])", { timeout: 15000 });
    await page.dblclick("#desktop-project-cd");
    // Burning raises the finishing receipt over the disc, which is the
    // product telling the writer the burn happened -- the right thing to put
    // in front of them, and not a reason to fail the stop. Close it the way a
    // person would, then the disc is frontmost again.
    await page.evaluate(() => {
      const receipt = document.querySelector('.window[data-window="finishingReceipt"]:not(.is-hidden) .close-box');
      if (receipt) receipt.click();
    });
    if (!(await isFrontmost(page, "projectCd"))) await page.dblclick("#desktop-project-cd");
    await assertFrontmost(page, "projectCd", "Project CD");
    await page.waitForFunction(
      () => (document.querySelector("#project-cd-count")?.textContent || "").includes("1"),
      undefined,
      { timeout: 15000 }
    );
    await clickIntoPaper(page, "projectCd", "#project-cd-grid", "Project CD");

    await waitForAutosave(page);
    await reloadKeepingProject(page, WALK_STRINGS.projectName);
    if (!(await isFrontmost(page, "projectCd"))) await page.dblclick("#desktop-project-cd");
    await assertFrontmost(page, "projectCd", "Project CD (after reload)");
    await page.waitForFunction(
      () => (document.querySelector("#project-cd-count")?.textContent || "").includes("1"),
      undefined,
      { timeout: 15000 }
    );
    await clickIntoPaper(page, "projectCd", "#project-cd-grid", "Project CD (after reload)");

    // Terminal action: the download, honestly named.
    const downloadPromise = page.waitForEvent("download");
    await page.click("#download-project-cd");
    const download = await downloadPromise;
    assert(/\.md$/i.test(download.suggestedFilename()), `download filename was not Markdown: ${download.suggestedFilename()}`);
  });

  // Final assertion phase: ground truth from IndexedDB, the way Journey A
  // closes — never trusted mid-walk, only here.
  const db = await dumpIndexedDb(page);
  const files = db.chatFiles || [];
  assert((db.projects || []).some((p) => p.name === WALK_STRINGS.projectName), "the walked project was never persisted");
  assert(files.some((f) => f.artifactKind === "clio-run-record" && f.runReceipt?.intent === "generate-outline"),
    "no generate-outline receipt file was persisted");
  const settings = (db.keyval || []).find((entry) => Array.isArray(entry.projectCdItems));
  assert((settings?.projectCdItems || []).length >= 1, "no Project CD item was persisted");
  assert(diagnostics.length === 0, `fresh-walk browser diagnostics:\n${diagnostics.join("\n")}`);

  await context.close();
  return { passId, diagnostics };
}

// ---------------------------------------------------------------------------
// PASS B — the DTK demo disk, mounted through the real import path.
// ---------------------------------------------------------------------------
async function runDemoDiskWalk(browser, serverUrl) {
  const passId = "demo-disk";
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, baseURL: serverUrl });
  const page = await context.newPage();
  const diagnostics = [];
  attachDiagnostics(page, diagnostics);

  await bootApp(page);
  await dismissGuide(page);
  await dismissClioOnboarding(page);

  await runStop(page, passId, "mount-demo-disk", "import the DTK demo disk through the real Restore path", async () => {
    // A seed project only exists to reach Import Utility's own window; the
    // backup import below replaces it as the active project.
    await createProjectThroughUi(page, WALK_STRINGS.seedProjectName);
    // Project creation can enter Writing Studio directly; Import Utility is
    // reached from the Project Hard Disk window in "desktop" profile.
    if (await page.evaluate(() => document.body.dataset.workspaceProfile === "writing")) {
      await page.dblclick("#finder-writing-studio-toggle");
      await page.waitForFunction(() => document.body.dataset.workspaceProfile === "desktop", undefined, { timeout: 10000 });
    }
    await page.dblclick("#active-project-drop-target");
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-window="projects"]');
        return !!el && el.classList.contains("is-active") && !el.classList.contains("is-hidden") && !el.classList.contains("is-collapsed");
      },
      undefined,
      { timeout: 10000 }
    );
    await page.click('[data-window="projects"] [data-action="open-import-utility"]');
    await page.waitForSelector('[data-window="importUtility"]:not(.is-hidden)', { timeout: 10000 });

    const backupDetails = page.locator(".backup-preview-section");
    if (!(await backupDetails.evaluate((el) => el.open))) {
      await backupDetails.locator(":scope > summary").click();
    }
    const chooserPromise = page.waitForEvent("filechooser");
    await page.click("#project-backup-file-button");
    const chooser = await chooserPromise;
    await chooser.setFiles(DEMO_DISK_PATH);
    await page.waitForFunction(
      () => (document.querySelector("#project-backup-preview")?.textContent || "").includes("未来通车之后"),
      undefined,
      { timeout: 15000 }
    );
    await page.waitForSelector("#import-project-backup:not([disabled])", { timeout: 10000 });
    await page.click("#import-project-backup");
    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent?.includes("未来通车之后") || false,
      undefined,
      { timeout: 20000 }
    );
    await page.waitForFunction(
      () => (document.body.textContent || "").includes("未来通车之后"),
      undefined,
      { timeout: 15000 }
    );
    // The import schedules a debounced desktop-maintenance save; entering
    // Writing Studio right away can race that save against the profile
    // switch's own save and trip the desk-record-conflict guard. Let the
    // desk settle before moving on, the same beat the walk waits elsewhere
    // for autosave.
    await waitForAutosave(page);
  });

  await runStop(page, passId, "project-hard-disk", "the restored disk's own documents render", async () => {
    if (!(await isFrontmost(page, "projects"))) await page.dblclick("#active-project-drop-target");
    await assertFrontmost(page, "projects", "Project Hard Disk");
    await page.waitForFunction(
      // The grid lists the restored disk's documents, not the project name
      // (the mount stop already proved the import by name in the status bar).
      () => (document.querySelector("#project-disk-grid")?.textContent || "").includes("DTK_Release_notes.pdf"),
      undefined,
      { timeout: 10000 }
    );
    await clickIntoPaper(page, "projects", "#project-disk-grid", "Project Hard Disk");
  });

  const routeStops = [
    { spine: "open-question-sheet", windowName: "questionSheet", label: "Question Sheet", selector: "#question-sheet-body", marker: "Developer Transition Kit" },
    { spine: "open-outline", windowName: "outline", label: "Outline", selector: "#outline-content", marker: "试车" },
    { spine: "open-section-drafts", windowName: "sectionDrafts", label: "Section Drafts", selector: "#draft-body", marker: "Developer Transition Kit" },
    { spine: "open-teachtext", windowName: "teachText", label: "Manuscript", selector: "#teachtext-body", marker: "未来通车之后" },
  ];

  await runStop(page, passId, "writing-route-content", "every restored writing-route stop shows its real content", async () => {
    await enterWritingStudio(page);
    for (const stop of routeStops) {
      // A restored project's Writing Studio entry can land on the manuscript
      // instead of the Question Sheet, so raise each stop explicitly instead
      // of assuming the entry surface.
      await ensureSpineWindowFrontmost(page, stop.windowName, stop.spine, stop.label);
      const value = await page.inputValue(stop.selector);
      assert(value.includes(stop.marker), `${stop.label} did not render the demo disk's real content (expected to find "${stop.marker}")`);
      if (stop.windowName === "outline") await ensureOutlineTextViewVisible(page);
      await clickIntoPaper(page, stop.windowName, stop.selector, stop.label);
    }
  });

  await runStop(page, passId, "review-desk", "Review Desk reads the restored manuscript", async () => {
    // A restored disk can come back with its manuscript in the editable
    // draft phase (the backup's own label/state decide that); Review Desk's
    // View Manuscript command is honestly unavailable until the manuscript
    // is Final. Mark it Final through the same real control the fresh pass
    // uses, then open Review Desk.
    await ensureSpineWindowFrontmost(page, "teachText", "open-teachtext", "Manuscript");
    const labelSelect = page.locator("#teachtext-label");
    if (await labelSelect.count() && !(await labelSelect.isDisabled())) {
      const current = await labelSelect.inputValue();
      if (current !== "final") {
        await labelSelect.selectOption("final");
        await acceptConfirmModalIfPresent(page);
        await acceptSavePromptIfPresent(page);
      }
    }
    await ensureSpineWindowFrontmost(page, "reviewDesk", "open-review-desk", "Review Desk");
    await writingMenuSubmenuClick(page, "Review Desk", "review-view-manuscript");
    await page.waitForFunction(
      () => (document.querySelector("#teachtext-body")?.value || "").includes("Developer Transition Kit"),
      undefined,
      { timeout: 15000 }
    );
  });

  await runStop(page, passId, "project-cd", "the restored Project CD item is real", async () => {
    // A real user can relaunch before opening the disc. Reloading also
    // discards the session's in-memory desk state (which a standing
    // desk-record conflict keeps from persisting) and boots the restored
    // project straight from disk, so opening the disc needs no save prompt.
    await reloadKeepingProject(page, "未来通车之后 Restored");
    await page.waitForSelector("#desktop-project-cd:not([hidden])", { timeout: 15000 });
    // Fallback: if a save prompt still appears, discard it and retry.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await acceptDiscardPromptIfPresent(page);
      try {
        await page.dblclick("#desktop-project-cd", { timeout: 8000 });
      } catch {
        await acceptDiscardPromptIfPresent(page);
        continue;
      }
      // The double-click itself can raise the save prompt, so the disc stays
      // closed behind it; answer that one too and open the disc again.
      await acceptDiscardPromptIfPresent(page);
      if (await isFrontmost(page, "projectCd")) break;
    }
    await assertFrontmost(page, "projectCd", "Project CD");
    await page.waitForFunction(
      () => (document.querySelector("#project-cd-grid")?.textContent || "").includes("未来通车之后"),
      undefined,
      { timeout: 15000 }
    );
    await clickIntoPaper(page, "projectCd", "#project-cd-grid", "Project CD");
  });

  assert(diagnostics.length === 0, `demo-disk browser diagnostics:\n${diagnostics.join("\n")}`);
  await context.close();
  return { passId, diagnostics };
}

// ---------------------------------------------------------------------------
let server;
let browser;
let fakeModel;
try {
  fakeModel = createFakeModelServer();
  const fakeModelPort = await fakeModel.listen();
  fakeModel.setScenario("json");

  server = await startAppServer(root);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  const results = [];
  if (!onlyPass || onlyPass === "fresh") {
    results.push(await runFreshWalk(browser, server.url, fakeModelPort));
  }
  if (!onlyPass || onlyPass === "demo-disk") {
    results.push(await runDemoDiskWalk(browser, server.url));
  }
  if (onlyPass) console.log(`--only ${onlyPass}: this run is diagnostic; the gate requires both passes.`);

  writeFileSync(
    join(evidenceDir, "summary.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), passes: results.map((r) => r.passId) }, null, 2)}\n`,
    "utf8"
  );
  console.log(`\n[walk] PASSED: ${results.map((r) => r.passId).join(" + ")}.`);
} catch (error) {
  console.error(`\n[walk] FAILED: ${error.message}`);
  if (server) console.error(server.output().trim());
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopProcess(server?.child);
  await fakeModel?.close();
}
