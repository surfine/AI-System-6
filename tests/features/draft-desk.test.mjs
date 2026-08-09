// Draft Desk is the clean Quick Draft application shell. The project record
// stays compatible, but none of the retired card/canvas UI is allowed back
// into the live DOM or lazy chain.

import { existsSync } from "node:fs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("draft-desk");

const html = read("index.html");
const app = read("app.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const config = read("app/core/config.js");
const windowManager = read("app/core/window-manager.js");
const workingSession = read("app/core/working-session.js");
const manifest = read("scripts/runtime-manifest.mjs");
const styleManifest = read("scripts/style-manifest.mjs");
const foundation = read("styles/00-foundation.css");
const workspace = read("app/core/quick-draft-workspace.js");
const coordinator = read("app/features/draft-desk.js");
const intake = read("app/features/quick-draft-intake.js");
const editor = read("app/features/quick-draft-editor.js");
const composition = read("app/features/quick-draft-composition.js");
const ai = read("app/features/quick-draft-ai.js");
const handoff = read("app/features/quick-draft-handoff.js");
const css = read("styles/91-draft-desk.css");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

const quickWindowStart = html.indexOf('data-window="quickDraft"');
const quickWindowEnd = html.indexOf('data-window="cmfStudio"', quickWindowStart);
const quickWindowHtml = html.slice(quickWindowStart, quickWindowEnd);
const feature = [coordinator, intake, editor, composition, ai, handoff].join("\n");

test.assert(quickWindowStart > 0 && quickWindowEnd > quickWindowStart, "Draft Desk has one named System 6 window");
test.assertIncludes(html, 'data-action="open-quick-draft"', "the existing Finder entry opens Draft Desk");
test.assertIncludes(actions, '"open-quick-draft": openQuickDraft', "the action table keeps the existing open route");
test.assertMatches(config, /ensureQuickDraftModule[\s\S]*"app\/features\/draft-desk\.js"[\s\S]*"app\/features\/quick-draft-handoff\.js"/, "the clean coordinator owns the lazy chain");
test.assertMatches(manifest, /appModulePaths[\s\S]*"app\/core\/quick-draft-workspace\.js"/, "workspace migration is eager so project data remains readable without opening the app");
test.assertMatches(manifest, /lazyRuntimePaths[\s\S]*"app\/features\/draft-desk\.js"/, "Draft Desk stays lazy");
test.assertNotIncludes(manifest, "app/features/finder-draft.js", "the retired coordinator is not bundled");
test.assertNotIncludes(manifest, "app/features/quick-draft-canvas.js", "the retired canvas is not bundled");
test.assert(!existsSync("app/features/finder-draft.js"), "the retired coordinator file is gone");
test.assert(!existsSync("app/features/quick-draft-canvas.js"), "the retired canvas file is gone");
test.assertIncludes(styleManifest, '"styles/91-draft-desk.css"', "Draft Desk owns a late independent stylesheet");
test.assertIncludes(foundation, "--draft-desk-window-width:", "the target window geometry has a named token");
test.assertIncludes(foundation, "--quick-draft-shelf-width: 168px;", "Figure 01 fixes the material shelf at 168px");
test.assertIncludes(foundation, "--quick-draft-inspector-width: 210px;", "Figure 01 fixes the inspector at 210px");
test.assertNotIncludes(foundation, "--draft-desk-sideask-width", "Quick Draft does not narrow the ordinary SideAsk pair");

test.assertIncludes(html, 'class="window draft-desk-window is-hidden" data-window="quickDraft"', "the live window uses only the new shell class");
test.assertIncludes(quickWindowHtml, 'class="draft-desk-workspace"', "one workspace holds paper, materials, and inspector");
test.assertIncludes(quickWindowHtml, 'class="draft-desk-paper"', "the writing paper is the primary region");
test.assertNotIncludes(quickWindowHtml, '<main class="draft-desk-paper"', "the app window does not nest a second main landmark");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-status" role="status" aria-live="polite" aria-atomic="true"', "status announcements are delivered as one stable phrase");
test.assertIncludes(quickWindowHtml, 'class="draft-desk-shelf"', "materials are a shelf beside the paper");
test.assertIncludes(quickWindowHtml, 'class="draft-desk-inspector"', "adjustments and versions share the inspector");
test.assertIncludes(quickWindowHtml, "data-quick-draft-intake-well", "the blank paper carries the intake surface");
test.assertIncludes(quickWindowHtml, "data-quick-draft-body-surface", "the same paper carries the draft body");
test.assertNotIncludes(quickWindowHtml, "quick-draft-legacy-backing", "there is no hidden compatibility UI");
test.assertNotIncludes(quickWindowHtml, "data-quick-draft-canvas", "there is no canvas surface");
test.assertNotIncludes(quickWindowHtml, "data-quick-draft-view", "there is no article/canvas mode switch");
test.assertNotIncludes(quickWindowHtml, "data-quick-draft-phase", "there are no phase tabs or phase panes");
test.assertNotIncludes(quickWindowHtml, "quick-draft-card", "the retired card hierarchy cannot leak into the blank-sheet shell");
test.assertNotIncludes(quickWindowHtml, "quick-draft-advanced", "Writing Setup does not exist in the live app");
test.assertNotIncludes(quickWindowHtml, "quick_draft_writing_setup", "the live app has no Writing Setup label");
for (const retiredId of ["quick-draft-audience-concerns", "quick-draft-unavailable", "quick-draft-must-include", "quick-draft-must-avoid", "quick-draft-first-impression", "quick-draft-tone"]) {
  test.assertNotIncludes(quickWindowHtml, retiredId, `${retiredId} does not return as hidden compatibility UI`);
}

for (const id of [
  "quick-draft-title-input",
  "quick-draft-format",
  "quick-draft-duration",
  "quick-draft-say",
  "quick-draft-sources",
  "quick-draft-draft",
  "quick-draft-preview",
  "quick-draft-source-map",
  "quick-draft-versions-list",
]) {
  test.assertIncludes(quickWindowHtml, `id="${id}"`, `${id} is a real visible control or surface`);
}

test.assertIncludes(quickWindowHtml, 'value="first-day-hands-on"', "First-Day Hands-on stays available");
test.assertIncludes(quickWindowHtml, 'value="hands-on-review"', "Hands-on Review stays available");
test.assertIncludes(quickWindowHtml, 'value="bili-dynamic"', "Bilibili post stays available");
test.assertNotIncludes(quickWindowHtml, 'value="bili-video"', "retired formats do not return");
test.assertIncludes(quickWindowHtml, 'data-i18n-placeholder="quick_draft_title_placeholder"', "Figure 02 uses the optional title placeholder");
test.assertNotIncludes(quickWindowHtml, 'data-quick-draft-open-editor', "Figure 02 does not grow a Write-body escape hatch");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-add-material"', "related material sources use one Add Material pull-down");
test.assertMatches(quickWindowHtml, /id="quick-draft-add-material"[\s\S]*?data-quick-draft-paste[\s\S]*?id="quick-draft-use-mounted"[\s\S]*?data-action="quick-draft-import-chat"/, "Paste, File Floppy, and chat import stay reachable inside Add Material");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-to-start', "Add Material returns to the intake surface");
test.assertIncludes(quickWindowHtml, 'data-action="quick-draft-import-chat"', "chat records enter through the material path");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-use-mounted"', "File Floppy material enters through the intake path");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="vent-on"', "Figure 02 keeps Vent Mode in the intake action row");

for (const layer of ["mingming", "luoluo", "hkrr", "density"]) {
  test.assertIncludes(quickWindowHtml, `data-quick-draft-adjustment-layer="${layer}"`, `${layer} is one adjustment-layer object`);
  test.assertNotIncludes(quickWindowHtml, `data-quick-draft-layer-toggle="${layer}"`, `${layer} stays exactly one row in Figure 03`);
  test.assertNotIncludes(quickWindowHtml, `data-quick-draft-layer-scope="${layer}"`, `${layer} does not repeat a scope row`);
  test.assertIncludes(quickWindowHtml, `data-quick-draft-layer-disclosure="${layer}"`, `${layer} has the Figure 07 narrow-drawer disclosure`);
}
test.assertIncludes(quickWindowHtml, "data-quick-draft-active-layer-scope", "Figure 03 gives the stack one shared Range row");
test.assertIncludes(quickWindowHtml, "data-quick-draft-active-layer-mask", "the shared Range row remains editable");
test.assertIncludes(quickWindowHtml, "data-quick-draft-protect-selection", "Protect Selection lives in the inspector");
test.assertIncludes(quickWindowHtml, "data-quick-draft-protected-summary", "Protection is a summary row until View is requested");
test.assertIncludes(quickWindowHtml, 'class="draft-desk-mobile-inspector-actions"', "Figure 07 adds the narrow-drawer Preview / Develop row");
test.assertIncludes(quickWindowHtml, "data-quick-draft-adjustment-apply", "Figure 07 previews the stack without changing the body");
test.assertIncludes(quickWindowHtml, "data-quick-draft-adjustment-develop", "Figure 07 can develop the preview from inside the drawer");
test.assertNotIncludes(quickWindowHtml, 'id="quick-draft-restore-dump"', "Versions do not add a second restore control below their rows");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-deliver"', "delivery is one action away from the paper");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-delivery="teachtext"', "TeachText handoff remains available");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-send-review"', "Review Desk handoff remains available");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-save-project-doc"', "Project Hard Disk save remains available");
test.assertIncludes(quickWindowHtml, 'aria-haspopup="menu" aria-expanded="false" aria-controls="quick-draft-tools-menu"', "Tools announces a pull-down menu and its controlled surface");
test.assertIncludes(quickWindowHtml, 'aria-haspopup="menu" aria-expanded="false" aria-controls="quick-draft-deliver-menu"', "Deliver announces a pull-down menu and its controlled surface");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-delivery="copy-markdown"', "Markdown copy remains available");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-delivery="export-markdown"', "Markdown export remains available");
test.assertIncludes(quickWindowHtml, 'class="draft-desk-display-switch" role="tablist"', "Body, Grain, and Read use the shared roving tab pattern");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-paper-view" class="draft-desk-paper-body" role="tabpanel"', "the selected display tab owns one paper view");
test.assertIncludes(quickWindowHtml, 'aria-controls="quick-draft-paper-view" aria-selected="true"', "the initial Body tab identifies its panel and selection state");
test.assertNotMatches(quickWindowHtml, /data-quick-draft-display=[^>]+aria-pressed=/, "display tabs do not mix pressed and selected semantics");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-drawer="shelf" aria-controls="quick-draft-materials-drawer" aria-expanded="false"', "Materials reports which drawer it expands");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-drawer="inspector" aria-controls="quick-draft-adjustments-drawer" aria-expanded="false"', "Adjust reports which drawer it expands");
test.assertIncludes(quickWindowHtml, 'data-i18n-aria-label="quick_draft_close_materials"', "the Materials close key has a specific accessible name");
test.assertIncludes(quickWindowHtml, 'data-i18n-aria-label="quick_draft_close_adjustments"', "the Adjustments close key has a specific accessible name");
test.assertIncludes(quickWindowHtml, 'aria-labelledby="quick-draft-layer-mingming-label quick-draft-adjustment-strength-label"', "layer strength controls identify their owning layer");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-active-layer-mask data-i18n-placeholder="quick_draft_adjustment_mask_placeholder"', "line ranges remain free-form text instead of a numeric keyboard trap");

test.assertIncludes(workspace, "schemaVersion: 3", "the canonical workspace schema stays at v3");
test.assertIncludes(workspace, "scenario: BILI_DYNAMIC_FORMAT", "Figure 02 opens on Bilibili post");
test.assertIncludes(workspace, 'entry.sourceKind === "quick-draft-dump"', "legacy dumps still migrate into Versions");
test.assertIncludes(workspace, "function normalizeQuickDraftRecord", "all project records cross one normalization boundary");
test.assertNotIncludes(coordinator, "function normalizeQuickDraftRecord", "the replaceable shell does not own the durable schema");
test.assertIncludes(coordinator, "async function commitQuickDraft", "durable writes retain awaited completion semantics");
test.assertIncludes(coordinator, "String(workspace.body", "an existing body opens as a draft, without requiring a model stamp");
test.assertIncludes(coordinator, 'document.querySelector(".draft-desk-paper")', "the exposed paper edge closes a mobile drawer");
test.assertIncludes(coordinator, 'function setQuickDraftDrawer(drawer = "", { restoreFocus = false } = {})', "one drawer state owner keeps the side regions mutually exclusive");
test.assertMatches(coordinator, /event\.key === "Escape" && drawerOpen[\s\S]*?closeQuickDraftDrawer\(\{ restoreFocus: true \}\)/, "Escape closes either non-modal drawer and restores its trigger");
test.assertIncludes(coordinator, 'closeButton.focus({ preventScroll: true })', "opening a narrow drawer moves keyboard focus into visible content");
test.assertMatches(coordinator, /document\.querySelector\("\.draft-desk-paper"\)[\s\S]*?closeQuickDraftDrawer\(\{ restoreFocus: false \}\);[\s\S]*?focusQuickDraftPaper/, "clicking the exposed paper edge returns focus to the paper");
test.assertIncludes(coordinator, 'refs.tools.classList.remove("is-disabled")', "Figure 06 keeps More available in the blank state");
test.assertIncludes(coordinator, 'classList.toggle("is-quick-draft-empty"', "Figure 06 gives the details bar an explicit blank/body state");
test.assertIncludes(coordinator, "refs.intakeWell?.classList.toggle(\"is-working\"", "working state belongs to the active paper surface");
test.assertIncludes(coordinator, 'refs.form?.setAttribute("aria-busy", String(!!isBusy))', "the whole writing form exposes model work to assistive technology");
test.assertIncludes(coordinator, 'setControlLoading(button, !!isBusy, t("quick_draft_working"))', "busy controls preserve their prior disabled state and keep a stable loading label");
test.assertIncludes(coordinator, "function focusQuickDraftPaper()", "open and drawer exit share one visible focus target resolver");
test.assertMatches(coordinator, /async function open[\s\S]*?focusQuickDraftPaper\(\);/, "opening an empty draft focuses the visible intake field rather than the hidden body");
test.assertIncludes(coordinator, 'quickDraftWindow.classList.contains("is-active")', "Quick Draft shortcuts only run for the active visible app window");
test.assertIncludes(coordinator, 'summary.getAttribute("aria-disabled") !== "true"', "a disabled delivery disclosure cannot be opened by pointer or keyboard");
test.assertIncludes(coordinator, 'summary.setAttribute("aria-expanded", String(menu.open))', "pull-down buttons expose their live expanded state");
test.assertIncludes(coordinator, "if (other !== menu) other.open = false", "only one Quick Draft pull-down remains open at a time");
test.assertIncludes(coordinator, "if (popover) popover.scrollTop = 0", "a reopened command menu starts from its first command");
test.assertIncludes(coordinator, 'event.target?.closest?.(".draft-desk-command-menu")', "outside pointer dismissal tolerates non-element event targets");
test.assertNotIncludes(coordinator, 'arrangeWindowAssistantSplit("quickDraft")', "opening Quick Draft never launches a secondary conversation window");
test.assertIncludes(ai, "await flushPendingQuickDraftCommit()", "an explicit SideAsk request flushes pending edits without manufacturing a blank draft revision");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-return-sideask" data-i18n="quick_draft_show_sideask"', "Quick Draft exposes SideAsk explicitly inside its own Tools menu");
test.assertNotIncludes(coordinator, "assistantWidthToken", "Quick Draft does not request a compact SideAsk width");
test.assertIncludes(windowManager, "const sourceWidth = Math.round((totalWidth - gap) * 0.6);", "the ordinary desktop pair remains 60 / 40");
test.assertIncludes(windowManager, 'setQuickDraftStatus?.(t("quick_draft_ready"), { live: false })', "ending SideAsk clears the stale paired receipt in Quick Draft");
test.assertNotIncludes(windowManager, "is-draft-desk-sideask", "the revoked compact SideAsk class is gone");
test.assertIncludes(workingSession, "skipSideAsk: entry.name === \"quickDraft\"", "session restore defers Quick Draft pairing until saved frames have finished restoring");
test.assertIncludes(workingSession, 'frameOwner: sideAskRestore ? "sideask-restore" : "window"', "working-session autosave stores the stable pre-pair frame instead of the temporary split");
test.assertIncludes(workingSession, 'width: frameValue("width", "sideaskRestoreWidth")', "Quick Draft can return to its real desktop width when SideAsk ends");
test.assertMatches(workingSession, /legacyQuickDraftSplit[\s\S]*?state\.sideAskEnabled[\s\S]*?entry\.frameOwner !== "sideask-restore"[\s\S]*?maximizeWindow\(win\)/, "old snapshots migrate once instead of preserving an overlapped or permanently narrow Quick Draft");
test.assertMatches(workingSession, /for \(const entry of visibleWindows\)[\s\S]*?applyWindowSessionFrame\(win, entry\.frame \|\| \{\}\);[\s\S]*?await arrangeWindowAssistantSplit\("quickDraft"\)/, "the 60 / 40 pair wins after every stale zoom frame has been applied");
test.assertIncludes(intake, "function quickDraftCitationRange", "material selection resolves a real cited paragraph");
test.assertMatches(intake, /function setVentMode[\s\S]*?setup: \{[\s\S]*?scenario: normalizeScenario\(refs\.format/, "Vent Mode writes its forced launch-day scenario into the same durable intake state");
test.assertIncludes(intake, "refs.draft.setSelectionRange", "clicking cited material selects its paragraph in the body");
test.assertIncludes(intake, 'row.setAttribute("aria-pressed"', "material selection is exposed accessibly");
test.assertIncludes(editor, 'row.className = "draft-desk-version-row"', "Versions render as new-shell objects");
test.assertIncludes(editor, 'button.setAttribute("aria-selected", on ? "true" : "false")', "display state is announced with tab semantics");
test.assertIncludes(editor, 'syncRovingTabStops(group)', "display tabs reuse the system keyboard navigation behavior");
test.assertNotIncludes(editor, 'button.setAttribute("aria-pressed", on ? "true" : "false")', "display tabs do not announce a second conflicting state");
test.assertIncludes(editor, "function setQuickDraftDisplayMode(display = \"body\")", "menu and paper tabs share one exact Body / Grain / Read selector");
test.assertIncludes(coordinator, "function toggleQuickDraftPanel(panel = \"shelf\")", "desktop panels and narrow drawers share one explicit menu command");
test.assertIncludes(coordinator, 'getComputedStyle(compactOnlyControl).display !== "none"', "responsive behavior reads the CSS-owned compact state instead of copying its breakpoint into JavaScript");
test.assertNotMatches(feature, /getBoundingClientRect\(\)\.width\s*<=\s*800/, "Quick Draft has no second JavaScript owner for the CSS container breakpoint");
test.assertIncludes(composition, 'document.getElementById("quick-draft-layer-detail")', "the one shared Range detail remains functional");
test.assertIncludes(composition, "function toggleQuickDraftLayerDisclosure", "Figure 07 expands only the selected adjustment row");
test.assertIncludes(composition, "active.append(detail, scope)", "Figure 07 moves the one shared detail beneath the active narrow row");
test.assertIncludes(composition, "new ResizeObserver", "dragging a desktop window narrow uses the same Figure 07 accordion");
test.assertIncludes(coordinator, 'refs.saveButton.dataset.quickDraftPrimaryAction = action', "the primary action changes meaning without changing position");
test.assertMatches(coordinator, /!hasBody \? "draft" : enabledLayers \? "develop" : "deliver"/, "Figure 02 / 01 primary states are Draft, Develop, and Deliver");
test.assertIncludes(coordinator, 'state === "new" ? "quick_draft_new_state"', "Figure 02 reports New draft instead of Saved");
test.assertIncludes(coordinator, 't("quick_draft_model_status", modelName)', "Figure 02 reports the connected model in the details bar");
test.assertMatches(coordinator, /refs\.format\.value = String\(source\.workspace\.body[\s\S]*?\? source\.targetFormat[\s\S]*?: BILI_DYNAMIC_FORMAT;/, "Figure 02 opens every bodyless blank on Bilibili post");
test.assertIncludes(coordinator, "if (event.target === refs.sources) renderSourceMap", "material objects appear as soon as the visible material field changes");
test.assertIncludes(editor, 'refs.windowTitle.textContent = t("quick_draft_title")', "the title bar remains Quick Draft instead of absorbing the document title");
test.assertNotIncludes(handoff, "surfaceMode", "handoff no longer exposes retired surface state");
test.assertNotIncludes(handoff, "setView", "public API cannot reopen the retired canvas");
test.assertIncludes(handoff, "canPreviewAdjustments", "menu availability can reflect whether Preview is actionable");
test.assertIncludes(handoff, "canDevelop", "menu availability can reflect whether a developed composite exists");
test.assertIncludes(menus, 'menuItem("quick-draft-apply", "quick_draft_preview_adjustments")', "Preview is also available from the app menu");
test.assertIncludes(menus, 'menuItem("quick-draft-develop", "quick_draft_develop")', "Develop is also available from the app menu");
test.assertMatches(menus, /menu\("view", "menu_view", \[[\s\S]*?quick-draft-view-body[\s\S]*?quick-draft-view-grain[\s\S]*?quick-draft-view-read[\s\S]*?quick-draft-toggle-materials[\s\S]*?quick-draft-toggle-adjustments/, "paper views and panels use the HIG-standard View menu");
test.assertNotMatches(menus, /submenu\("quick_draft_(view_label|panels)"/, "Quick Draft does not bury first-level view commands in nested submenus");
test.assertIncludes(menus, 'menuItem("quick-draft-toggle-sideask", "quick_draft_show_sideask")', "Quick Draft owns an explicit SideAsk menu command");
test.assertIncludes(actions, '"quick-draft-apply": () => runQuickDraftMenuCommand("apply")', "the Preview menu command reaches the active Quick Draft API");
test.assertIncludes(actions, '"quick-draft-develop": () => runQuickDraftMenuCommand("develop")', "the Develop menu command reaches the active Quick Draft API");
test.assertIncludes(actions, '"quick-draft-view-body": () => runQuickDraftMenuCommand("view-body")', "Body menu selection reaches the live paper");
test.assertIncludes(actions, '"quick-draft-toggle-materials": () => runQuickDraftMenuCommand("toggle-materials")', "Materials menu state reaches the live panel");
test.assertIncludes(actions, '"quick-draft-toggle-sideask": toggleQuickDraftSideAsk', "the SideAsk menu command targets Quick Draft rather than TeachText");
test.assertMatches(windowManager, /async function toggleQuickDraftSideAsk\(\)[\s\S]*?clearSideAskMode\(\);[\s\S]*?await closeWindow\("assistant", true\)/, "Hide SideAsk removes the separate ClioTalk window instead of only relabeling it");
test.assertIncludes(windowManager, '"quick-draft-apply": winName === "quickDraft" && quickDraftCanPreview', "Preview is disabled in the menu until it can run");
test.assertIncludes(windowManager, '"quick-draft-develop": winName === "quickDraft" && quickDraftHasBody && quickDraftCanDevelop', "Develop is disabled in the menu until a real body and composite both exist");
test.assertIncludes(windowManager, '"quick-draft-view-body": winName === "quickDraft"', "Body remains available as the stable paper view");
test.assertIncludes(windowManager, '"quick-draft-view-grain": winName === "quickDraft" && quickDraftHasBody', "Grain stays disabled in the blank-sheet state");
test.assertIncludes(windowManager, '"quick-draft-toggle-materials": winName === "quickDraft" && quickDraftHasBody', "Materials do not appear before the draft exists");
test.assertIncludes(windowManager, '"quick-draft-compose": winName === "quickDraft" && quickDraftHasModel && quickDraftHasInput', "Draft stays unavailable until both a model and real input exist");
test.assertIncludes(windowManager, '"quick-draft-vent-on": winName === "quickDraft" && !quickDraftVentActive', "Start Vent Mode is unavailable while vent capture is already active");
test.assertIncludes(windowManager, '"quick-draft-vent-off": winName === "quickDraft" && quickDraftVentActive', "End Vent Mode is unavailable until capture has started");
test.assertIncludes(windowManager, '"quick-draft-mingming": winName === "quickDraft" && quickDraftHasModel && quickDraftHasBody', "body review commands do not pretend a blank sheet can be reviewed");
test.assertIncludes(handoff, "hasInput: () => quickDraftInteractionState().hasInput", "the menu and in-window primary action share one readiness source");
test.assertNotMatches(coordinator, /hasInput: Boolean\([^\n]*(firstDaySubject|handsOnNotes|officialMaterials)/, "retired hidden setup fields cannot unlock the blank-sheet primary action");
test.assertIncludes(app, "window.AISystem6QuickDraft?.render?.()", "language changes refresh Quick Draft's live receipts and object labels");

test.assertIncludes(css, ".draft-desk-window {", "the application has an independent style root");
test.assertIncludes(css, "grid-template-rows: minmax(0, 1fr) auto;", "the paper workspace and action row use explicit tracks");
test.assertIncludes(css, "grid-template-columns:\n    var(--quick-draft-shelf-width)\n    minmax(0, 1fr)\n    var(--quick-draft-inspector-width);", "desktop keeps materials, paper, and inspector side by side");
test.assertIncludes(css, ".draft-desk-layout.is-empty-draft .draft-desk-shelf", "the blank sheet removes secondary side regions");
test.assertIncludes(css, "@container (max-width: 800px)", "collapse follows window width, not the viewport");
test.assertIncludes(css, ".draft-desk-layout.is-shelf-open .draft-desk-shelf", "the material drawer is an explicit narrow-window state");
test.assertIncludes(css, ".draft-desk-layout.is-inspector-open .draft-desk-inspector", "the adjustment drawer is an explicit narrow-window state");
test.assertIncludes(css, "width: calc(100% - var(--quick-draft-drawer-edge));", "Figure 05 leaves exactly one 16px paper edge");
test.assertIncludes(css, "background: var(--glass-reading-surface, var(--quick-draft-panel-bg));", "Figure 07 keeps both Classic and Liquid drawers readable over the paper");
test.assertMatches(css, /\.draft-desk-shelf \{[\s\S]*?right: auto;[\s\S]*?left: 0;/, "the material drawer enters from the left");
test.assertMatches(css, /\.draft-desk-inspector \{[\s\S]*?right: 0;[\s\S]*?left: auto;/, "the inspector drawer enters from the right");
test.assertMatches(css, /\.draft-desk-layout\.is-shelf-open \.draft-desk-paper,[\s\S]*?\.draft-desk-layout\.is-inspector-open \.draft-desk-paper \{[\s\S]*?isolation: isolate;/, "Figure 07 contains editor layers below the drawer without adding z-index");
test.assertMatches(css, /\.draft-desk-sheet-select:last-child \.system-select-menu \{[\s\S]*?right: 0;[\s\S]*?left: auto;/, "the trailing length menu opens inward instead of clipping past the window edge");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?grid-template-rows: repeat\(2, minmax\(var\(--system-button-min-height\), auto\)\);/, "Figure 06 keeps two compact system-sized action rows");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-actions \{[\s\S]*?padding: 5px calc\(var\(--window-frame-lane\) \+ var\(--resize-affordance-clearance, 0px\) \+ 6px\) 5px 6px;/, "compact actions preserve the grow-box clearance in both themes");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-actions \.btn,[\s\S]*?\.draft-desk-actions summary\.btn \{[\s\S]*?min-height: var\(--system-button-min-height\);/, "compact actions consume the shared control height instead of enlarging visible System 6 buttons");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-display-switch \{[\s\S]*?grid-row: 1;[\s\S]*?\.draft-desk-drawer-switch \{[\s\S]*?grid-row: 1;/, "Figure 06 puts views and drawer switches on the first row");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?#quick-draft-tools \{[\s\S]*?grid-row: 2;[\s\S]*?#quick-draft-deliver \{[\s\S]*?grid-row: 2;[\s\S]*?#quick-draft-save \{[\s\S]*?grid-row: 2;/, "Figure 06 keeps More, Deliver, and the primary action on the second row");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-sheet-head \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(96px, 0\.38fr\) minmax\(124px, 0\.42fr\);/, "compact format and length values have enough room to remain legible");
test.assertMatches(css, /@container \(max-width: 520px\)[\s\S]*?\.draft-desk-title-field \{[\s\S]*?grid-column: 1 \/ -1;/, "very narrow windows place the title above complete format and length controls");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-layer-disclosure \{[\s\S]*?display: flex;/, "Figure 07 uses Finder-style disclosure controls in the narrow inspector");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-mobile-inspector-actions \{[\s\S]*?display: flex;/, "Figure 07 shows Preview / Develop only in the drawer layout");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-intake-field textarea,[\s\S]*?\.draft-desk-protect input \{[\s\S]*?font-size: 16px;/, "narrow text-entry controls avoid mobile browser zoom and remain legible");
test.assertMatches(css, /\.draft-desk-window\.has-live-quick-draft-status[\s\S]*?#quick-draft-status \{[\s\S]*?display: block;/, "a live operation receipt outranks the idle stack receipt in a narrow details bar");
test.assertMatches(css, /\.draft-desk-window\.has-live-quick-draft-status[\s\S]*?#quick-draft-stack-state \{[\s\S]*?display: none;/, "narrow live status never collides with the idle stack receipt");
test.assertNotMatches(css, /\.draft-desk-layer \.select-wrap-inline[\s\S]{0,180}max-width:\s*74px/, "translated strength values are not clipped to an English-only width");
test.assertNotMatches(css, /\.draft-desk-versions-list[\s\S]{0,220}max-height:\s*132px/, "the inspector owns scrolling instead of nesting a second vertical scroll area");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\[data-quick-draft-protect-toggle\] \{[\s\S]*?display: none;/, "Figure 07 does not add a second View action to the compact protection row");
test.assertMatches(css, /@container \(max-width: 800px\)[\s\S]*?\.draft-desk-versions-section \{[\s\S]*?display: none;/, "Figure 07 keeps the phone adjustment drawer focused on its stack");
test.assertIncludes(css, ".draft-desk-intake[hidden]", "the surface switch respects hidden semantics despite authored display rules");
test.assertIncludes(css, "background: var(--quick-draft-actions-bg);", "the action bar uses a theme-owned surface instead of an opaque Classic gray");
test.assertIncludes(css, "color: var(--quick-draft-selected-fg);", "selected controls use a semantic foreground instead of a material token");
test.assertIncludes(css, "box-shadow: var(--quick-draft-field-focus-shadow);", "Liquid and Classic can express field focus without stacking effects");
test.assertMatches(css, /\.draft-desk-shelf\.is-empty[\s\S]*?\.draft-desk-add-material \{[\s\S]*?align-self: start;/, "the empty-material action stays beside its explanation instead of at the far end of the drawer");
test.assertIncludes(intake, 'classList.toggle("is-empty", !map.length)', "the material shelf exposes its real empty layout state");
test.assertNotMatches(css, /(\.draft-desk-layout\.is-shelf-hidden \.draft-desk-shelf,\s*){2}/, "the component stylesheet has no duplicated shelf-hiding selector");
test.assertIncludes(css, ".draft-desk-editor.is-selected::after", "selected text has a paper-local visual state");
test.assertIncludes(css, ".draft-desk-intake.is-working::after", "model work has a paper-local visual state");
test.assertIncludes(css, "height: 2px;", "Figure 04 working is one travelling bottom edge, not a full-area dither");
test.assertIncludes(foundation, "calc(100% - 1px) calc(100% - 1px) / 5px 5px no-repeat", "Figure 04 selected state has corner control points");
test.assertIncludes(foundation, "quickDraftWorkingSweep 2.6s ease-in-out infinite", "Figure 04 working edge moves slowly");
test.assertNotIncludes(foundation, "quickDraftWorkingDither", "Figure 04 never dithers the whole text area while working");
test.assertIncludes(css, "@media (prefers-reduced-motion: reduce)", "paper-state motion honors reduced motion");
test.assertNotIncludes(css, "body.use-liquid-glass", "one DOM and one component stylesheet serve both themes");
test.assertNotIncludes(css, "!important", "the clean stylesheet does not raise specificity budgets");
test.assertNotMatches(css, /z-index\s*:/, "the clean shell adds no z-index layer");

test.assertIncludes(translationsZh, 'quick_draft_title_placeholder: "标题（可以后填）"', "Figure 02 title copy matches the design");
test.assertIncludes(translationsZh, 'quick_draft_command_adjustment: "调整 · 栈"', "Figure 01 inspector heading matches the design");
test.assertIncludes(translationsZh, 'quick_draft_display_body: "文章"', "Figure 01 display group matches the design");
test.assertIncludes(translationsZh, 'quick_draft_display_body_mobile: "正文"', "Figure 06 uses the portrait display label from the design");
test.assertIncludes(translationsZh, 'quick_draft_more: "更多…"', "Figure 06 keeps the ellipsis on More");
test.assertIncludes(translationsZh, 'quick_draft_drawer_close: "关"', "Figure 07 uses the compact drawer-close label");
test.assertIncludes(translationsZh, 'quick_draft_chip_mingming: "明明传球"', "Figure 07 names the Mingming layer exactly");
test.assertIncludes(translationsZh, 'quick_draft_chip_luoluo: "洛洛接球"', "Figure 07 names the Luoluo layer exactly");
test.assertIncludes(translationsZh, 'quick_draft_chip_hkrr: "HKRR 抬升"', "Figure 07 names the HKRR layer exactly");
test.assertIncludes(translationsZh, 'quick_draft_composite: "阅读"', "Figure 01 Read label matches the design");
test.assertIncludes(translationsZh, 'quick_draft_develop: "冲洗"', "Figure 01 primary action matches the design");
test.assertIncludes(translationsZh, 'quick_draft_show_materials: "显示材料"', "the menu describes the hidden Materials panel as an action");
test.assertIncludes(translationsZh, 'quick_draft_hide_sideask: "隐藏 SideAsk"', "the paired SideAsk menu state is explicit");
test.assertIncludes(translationsZh, 'quick_draft_command_vent: "树洞"', "the Tools menu names the standalone Vent command group");
test.assertIncludes(translationsEn, 'quick_draft_command_adjustment: "Adjust · Stack"', "English uses the same inspector object name");
test.assertIncludes(translationsEn, 'quick_draft_command_vent: "Vent"', "English exposes the same Vent command group");

test.finish();
