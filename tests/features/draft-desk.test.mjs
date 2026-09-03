// Draft Desk is the clean Quick Draft application shell. The project record
// stays compatible, but none of the retired card/canvas UI is allowed back
// into the live DOM or lazy chain.

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("draft-desk");

const html = read("index.html");
const app = read("app.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const config = read("app/core/config.js");
const windowManager = read("app/core/window-manager.js");
const workingSession = read("app/core/working-session.js");
const manifest = read("tooling/runtime-manifest.mjs");
const styleManifest = read("tooling/style-manifest.mjs");
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

// Draft Desk is one application across two windows now: Quick Draft writes the
// draft, 文字亮室 develops it. The markup slice follows the application, not one
// of its windows, or every control that moved would read as deleted.
const quickWindowStart = html.indexOf('data-window="quickDraft"');
const quickWindowEnd = html.indexOf('data-window="cmfStudio"', quickWindowStart);
// 文字亮室 builds its own window from draft-desk.js, so the application's second
// half is no longer between two markers in index.html. The slice still follows
// the application rather than one window -- it just spans two files to do it.
const lightroomMarkupStart = coordinator.indexOf("function installLightroomWindow");
const lightroomMarkupEnd = coordinator.indexOf("installLightroomWindow();");
const lightroomMarkup = coordinator.slice(lightroomMarkupStart, lightroomMarkupEnd);
const quickWindowHtml = `${html.slice(quickWindowStart, quickWindowEnd)}\n${lightroomMarkup}`;
const feature = [coordinator, intake, editor, composition, ai, handoff].join("\n");

test.assert(quickWindowStart > 0 && quickWindowEnd > quickWindowStart, "Draft Desk has one named System 6 window");
test.assertIncludes(html, 'data-action="open-quick-draft"', "the existing Finder entry opens Draft Desk");
test.assertIncludes(handoff, '"open-quick-draft"', "the lazy handoff keeps the existing open route");
test.assertIncludes(actions, 'registerLazyCommand?.("open-quick-draft"', "the open route is wired through a lazy runtime command");
test.assertMatches(config, /ensureQuickDraftModule[\s\S]*"app\/features\/draft-desk\.js"[\s\S]*"app\/features\/quick-draft-handoff\.js"/, "the clean coordinator owns the lazy chain");

// 文字亮室 shares the lazy module with Quick Draft, so a cold open of the
// darkroom alone — the desk icon on a fresh boot, or a restored desk with
// Quick Draft closed — must load and render it, not show an empty frame.
test.assertMatches(windowManager, /name === "lightroom" && !skipQuickDraftEntrypoint[\s\S]*ensureQuickDraftModule\(\)[\s\S]*openLightroom\(\)/, "opening the lightroom window loads its module first");
test.assertIncludes(handoff, "openLightroom: enterLightroom", "the lazy handoff publishes the lightroom entrypoint");
// The display switch opens this window, so the opening view is chosen at the
// door. Choosing it inside openLightroomWindow made the two call each other
// and froze the renderer.
test.assertNotMatches(coordinator, /async function openLightroomWindow\(\)[\s\S]{0,400}setQuickDraftDisplayMode/, "opening the window does not set a display mode");
test.assertNotIncludes(coordinator, 'openWindow("lightroom");', "the coordinator's own opens skip the entrypoint so it cannot recurse");
test.assertMatches(manifest, /appModulePaths[\s\S]*"app\/core\/quick-draft-workspace\.js"/, "workspace migration is eager so project data remains readable without opening the app");
test.assertMatches(manifest, /lazyRuntimePaths[\s\S]*"app\/features\/draft-desk\.js"/, "Draft Desk stays lazy");
test.assertNotIncludes(manifest, "app/features/finder-draft.js", "the retired coordinator is not bundled");
test.assertNotIncludes(manifest, "app/features/quick-draft-canvas.js", "the retired canvas is not bundled");
test.assert(!exists("app/features/finder-draft.js"), "the retired coordinator file is gone");
test.assert(!exists("app/features/quick-draft-canvas.js"), "the retired canvas file is gone");
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
test.assertIncludes(quickWindowHtml, 'class="view-switch draft-desk-display-switch" role="tablist"', "Grain, Read, and Listen use the shared roving tab pattern, on the real segmented-control part");
// The tablist and the panel it controls must be in the SAME window. They were
// not: the tabs moved into 文字亮室 with the split and kept naming the paper
// body left behind in Quick Draft, so the tablist advertised a relationship
// across two windows — and that panel was labelled by "Back to the Draft",
// which is a door, not a tab. `quickWindowHtml` spans both windows despite its
// name, so a plain assertIncludes cannot see the difference; these two pin the
// panel's own window.
const lightroomWindowHtml = lightroomMarkup;
test.assertIncludes(lightroomWindowHtml, 'id="lightroom-paper-view" role="tabpanel"', "the selected display tab owns one paper view, in its own window");
test.assertIncludes(lightroomWindowHtml, 'data-quick-draft-display="read" aria-controls="lightroom-paper-view" aria-selected="true"', "the darkroom opens on Read, and that tab identifies its panel and selection state");
test.assertNotIncludes(quickWindowHtml, 'aria-controls="quick-draft-paper-view"', "no tab reaches across into the other window's paper body");
// Leaving 文字亮室 is a door back to the writing app, not a fourth way of
// looking, so it must not sit inside the tablist wearing a tab role.
test.assertNotMatches(quickWindowHtml, /data-quick-draft-display="body"[^>]*role="tab"/, "returning to the draft is not dressed as a display tab");
test.assertNotMatches(quickWindowHtml, /data-quick-draft-display=[^>]+aria-pressed=/, "display tabs do not mix pressed and selected semantics");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-drawer="shelf" aria-controls="quick-draft-materials-drawer" aria-expanded="false"', "Materials reports which drawer it expands");
// Rule A splits the two windows by writing versus looking, so each window
// needs one visible route to the other. Quick Draft had none: the desk icon
// is the only other entry, and Quick Draft covers the desk.
test.assertIncludes(quickWindowHtml, 'data-action="open-lightroom"', "Quick Draft carries a visible route into the darkroom");
test.assertIncludes(quickWindowHtml, 'data-i18n="lightroom_back_to_draft"', "the darkroom carries a visible route back to the draft");
test.assertIncludes(quickWindowHtml, 'data-i18n-aria-label="quick_draft_close_materials"', "the Materials close key has a specific accessible name");
test.assertIncludes(quickWindowHtml, 'data-i18n-aria-label="quick_draft_close_adjustments"', "the Adjustments close key has a specific accessible name");
test.assertIncludes(quickWindowHtml, 'aria-labelledby="quick-draft-layer-mingming-label quick-draft-adjustment-strength-label"', "layer strength controls identify their owning layer");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-active-layer-mask data-i18n-placeholder="quick_draft_adjustment_mask_placeholder"', "line ranges remain free-form text instead of a numeric keyboard trap");

test.assertIncludes(workspace, "schemaVersion: 4", "the canonical workspace schema stays at v4");
test.assertIncludes(workspace, "scenario: BILI_DYNAMIC_FORMAT", "Figure 02 opens on Bilibili post");
test.assertIncludes(workspace, 'entry.sourceKind === "quick-draft-dump"', "legacy dumps still migrate into Versions");
test.assertIncludes(workspace, "function normalizeQuickDraftRecord", "all project records cross one normalization boundary");
test.assertNotIncludes(coordinator, "function normalizeQuickDraftRecord", "the replaceable shell does not own the durable schema");
test.assertIncludes(coordinator, "async function commitQuickDraft", "durable writes retain awaited completion semantics");
// Which paper is on screen is derived from the work, not remembered. A stored
// surface with a manual override used to drift from the record, and a draft
// whose body was already written could still be asking what the writer wanted
// to say.
test.assertIncludes(coordinator, "function quickDraftPhase", "the paper phase is derived");
test.assertIncludes(coordinator, "String(refs.draft?.value || workspace.body", "an existing body opens as a draft, without requiring a model stamp");
test.assertNotIncludes(coordinator, "quickDraftPaperManual", "no manual override can hold the paper against the record");
test.assertNotIncludes(coordinator, "let quickDraftPaperSurface", "the surface is never stored beside the record");
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
test.assertIncludes(coordinator, 'const target = /** @type {Element | null} */ (event.target)', "outside pointer dismissal narrows non-element event targets safely");
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
test.assertIncludes(coordinator, 'const action = hasBody ? "continue" : "draft";', "first success keeps one stable primary control: Draft, then Continue Writing");
test.assertIncludes(coordinator, 'state === "new" ? "quick_draft_new_state"', "Figure 02 reports New draft instead of Saved");
test.assertIncludes(coordinator, 't("quick_draft_model_status", modelName)', "Figure 02 reports the connected model in the details bar");
test.assertMatches(coordinator, /refs\.format\.value = String\(source\.workspace\.body[\s\S]*?\? source\.targetFormat[\s\S]*?: BILI_DYNAMIC_FORMAT;/, "Figure 02 opens every bodyless blank on Bilibili post");
test.assertIncludes(coordinator, "if (event.target === refs.sources) renderSourceMap", "material objects appear as soon as the visible material field changes");
test.assertIncludes(editor, 'refs.windowTitle.textContent = t("quick_draft_title")', "the title bar remains Quick Draft instead of absorbing the document title");
test.assertNotIncludes(handoff, "surfaceMode", "handoff no longer exposes retired surface state");
test.assertNotIncludes(handoff, "setView", "public API cannot reopen the retired canvas");
test.assertIncludes(handoff, "canPreviewAdjustments", "menu availability can reflect whether Preview is actionable");
test.assertIncludes(handoff, "canDevelop", "menu availability can reflect whether a developed composite exists");
// Both rows carry a key equivalent now, so they name their shortcut id too.
test.assertIncludes(menus, 'menuItem("quick-draft-apply", "quick_draft_preview_adjustments", "lightroom-apply")', "试看 is also available from the app menu, with a key equivalent");
test.assertIncludes(menus, 'menuItem("quick-draft-develop", "quick_draft_develop", "lightroom-develop")', "冲洗 is also available from the app menu, with a key equivalent");
// Quick Draft's View menu offers the paper and the way across, not four ways to
// look. The grain, composite and listen views moved to 文字亮室: they were never
// duplicates of its rows -- they drive Quick Draft's OWN display mode -- so this
// removed real views on purpose, because the split says write here, look there.
test.assertMatches(
  menus,
  /menu\("view", "menu_view", \[[\s\S]*?quick-draft-view-body[\s\S]*?open-lightroom[\s\S]*?quick-draft-toggle-materials[\s\S]*?quick-draft-toggle-adjustments/,
  "paper views and panels use the HIG-standard View menu",
);
for (const retired of ["quick-draft-view-grain", "quick-draft-view-read", "quick-draft-view-listen"]) {
  // Once, not never: 文字亮室's own View menu still carries all three, which is
  // where looking now lives. What must not exist is a second copy inside the
  // writing window.
  const uses = menus.split(`"${retired}"`).length - 1;
  test.assert(uses === 1, `${retired} is offered by 文字亮室 only, not from inside the writing window (found ${uses})`);
}
test.assertNotMatches(menus, /submenu\("quick_draft_(view_label|panels)"/, "Quick Draft does not bury first-level view commands in nested submenus");
test.assertIncludes(menus, 'menuItem("quick-draft-toggle-sideask", "quick_draft_show_sideask")', "Quick Draft owns an explicit SideAsk menu command");
test.assertIncludes(handoff, '"quick-draft-apply"', "the Preview menu command reaches the active Quick Draft API");
test.assertIncludes(handoff, '"quick-draft-develop"', "the Develop menu command reaches the active Quick Draft API");
test.assertIncludes(handoff, '"quick-draft-view-body"', "Body menu selection reaches the live paper");
test.assertIncludes(handoff, '"quick-draft-toggle-materials"', "Materials menu state reaches the live panel");
test.assertIncludes(handoff, '"quick-draft-toggle-sideask"', "the SideAsk menu command targets Quick Draft rather than TeachText");
test.assertMatches(windowManager, /async function toggleQuickDraftSideAsk\(\)[\s\S]*?clearSideAskMode\(\);[\s\S]*?await closeWindow\("assistant", true\)/, "Hide SideAsk removes the separate ClioTalk window instead of only relabeling it");
test.assertIncludes(handoff, 'action === "quick-draft-apply"', "Preview is disabled in the menu until it can run");
test.assertIncludes(handoff, 'action === "quick-draft-develop"', "Develop is disabled in the menu until a real body and composite both exist");
test.assertIncludes(handoff, 'action === "quick-draft-view-body"', "Body remains available as the stable paper view");
test.assertIncludes(handoff, '["quick-draft-view-grain", "quick-draft-view-read", "quick-draft-view-listen"].includes(action)', "Grain and Listen stay disabled in the blank-sheet state");
test.assertIncludes(handoff, '["quick-draft-toggle-materials", "quick-draft-toggle-adjustments"].includes(action)', "Materials do not appear before the draft exists");
test.assertIncludes(handoff, 'action === "quick-draft-compose"', "Draft stays unavailable until both a model and real input exist");
test.assertIncludes(handoff, 'action === "quick-draft-vent-on"', "Start Vent Mode is unavailable while vent capture is already active");
test.assertIncludes(handoff, 'action === "quick-draft-vent-off"', "End Vent Mode is unavailable until capture has started");
test.assertIncludes(handoff, '["quick-draft-mingming", "quick-draft-luoluo", "quick-draft-hkrr", "quick-draft-praise"].includes(action)', "body review commands do not pretend a blank sheet can be reviewed");
test.assertIncludes(handoff, "hasInput: () => quickDraftInteractionState().hasInput", "the menu and in-window primary action share one readiness source");
test.assertNotMatches(coordinator, /hasInput: Boolean\([^\n]*(firstDaySubject|handsOnNotes|officialMaterials)/, "retired hidden setup fields cannot unlock the blank-sheet primary action");
test.assertIncludes(app, "window.AISystem6QuickDraft?.render?.()", "language changes refresh Quick Draft's live receipts and object labels");

test.assertIncludes(css, ".draft-desk-window {", "the application has an independent style root");
test.assertIncludes(css, "grid-template-rows: minmax(0, 1fr) auto;", "the paper workspace and action row use explicit tracks");
// The inspector moved to 文字亮室, so Quick Draft holds two tracks. A third
// track would stand empty on the right, which is what it did once.
test.assertIncludes(css, "grid-template-columns:\n    var(--quick-draft-shelf-width)\n    minmax(0, 1fr);", "desktop keeps materials beside the paper");
test.assertNotIncludes(css, "is-inspector-hidden", "no rule still collapses an inspector this window does not hold");
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
test.assertIncludes(translationsZh, 'quick_draft_chip_mingming: "读者视角"', "Figure 07 names the Mingming layer exactly");
test.assertIncludes(translationsZh, 'quick_draft_chip_luoluo: "听者接收"', "Figure 07 names the Luoluo layer exactly");
test.assertIncludes(translationsZh, 'quick_draft_chip_hkrr: "HKRR 提亮"', "Figure 07 names the HKRR layer exactly");
test.assertIncludes(translationsZh, 'quick_draft_composite: "阅读"', "Figure 01 Read label matches the design");
test.assertIncludes(translationsZh, 'quick_draft_develop: "冲洗"', "Figure 01 primary action matches the design");
test.assertIncludes(translationsZh, 'quick_draft_show_materials: "显示材料"', "the menu describes the hidden Materials panel as an action");
test.assertIncludes(translationsZh, 'quick_draft_hide_sideask: "隐藏 SideAsk"', "the paired SideAsk menu state is explicit");
test.assertIncludes(translationsZh, 'quick_draft_command_vent: "树洞"', "the Tools menu names the standalone Vent command group");
test.assertIncludes(translationsEn, 'quick_draft_command_adjustment: "Adjust · Stack"', "English uses the same inspector object name");
test.assertIncludes(translationsEn, 'quick_draft_command_vent: "Vent"', "English exposes the same Vent command group");

// 文字亮室's subject is painted from a record, not from data-i18n, so nothing in
// applyLanguage() reached it and switching language with the window open left
// the previous language's word on screen until it was closed and reopened.
// Two halves, and both matter: the hook has to be called, and it must not
// overwrite a title the writer chose.
// The durable half must load at the DOOR, not only inside ensureDarkroomReady.
// enterLightroom branches, and only one branch reaches that function — so the
// desk-icon route, which is the cold-start route a first-time visitor takes,
// opened the darkroom with its store never loaded. It then answered every read
// from a blank record and wrote nothing, silently. A contract that only checks
// the loader exists cannot see this; this one pins where it is awaited.
test.assertMatches(
  handoff,
  /async function enterLightroom\(\)\s*\{[\s\S]{0,600}?ensureDarkroomModule\(\)[\s\S]{0,200}?currentQuickDraftDisplayMode\(\)/,
  "entering the lightroom loads the darkroom store before either branch"
);

test.assertIncludes(coordinator, "function renderLightroomSubject(", "the subject has a named re-render hook");
test.assertIncludes(
  app,
  'if (typeof renderLightroomSubject === "function") renderLightroomSubject();',
  "applyLanguage calls it, typeof-guarded because draft-desk.js is lazy"
);
// "An empty stored title means it was derived" was the obvious test and it is
// FALSE: the derived default is persisted, so a fresh draft stores the literal
// "Quick Draft" and reads back looking exactly like a writer's choice. The
// guard built on it never fired once, measured in a browser.
test.assertIncludes(
  coordinator,
  "function isDerivedQuickDraftTitle(",
  "a derived title is recognised by comparing against the default in every loaded language"
);
test.assertNotIncludes(
  coordinator,
  'if (!force && String(record?.workspace?.title || "")) return;',
  "and not by the empty-string assumption that did not hold"
);
// The second half, which the guard alone did not fix: normalizeQuickDraftRecord
// hands back the STORED title when it is non-empty, so re-rendering from it
// repaints the frozen language. A derived title has to be recomputed.
test.assertIncludes(
  coordinator,
  "titleFromBody(workspace.body)",
  "a derived title is recomputed from the body, never re-read from storage"
);
test.assertIncludes(
  coordinator,
  "renderLightroomSubject({ force: true })",
  "opening the window still writes the writer's own title"
);

// --- the read-only subject ---------------------------------------------------
// 试看 needs no write access: it writes only the darkroom record, which is
// this application's own state. Develop, protection, and layer edits write the
// document, so they keep the write gate. The gate has ONE owner — the
// write-lease sweep over [data-requires-write] — so the menu rows and the
// buttons they shortcut can never give two different answers.
test.assertMatches(
  lightroomMarkup,
  /<button type="button" class="btn mini-btn" data-quick-draft-adjustment-apply/,
  "试看 carries no write gate: previewing a read-only subject is allowed"
);
test.assertMatches(
  lightroomMarkup,
  /data-requires-write data-quick-draft-adjustment-develop/,
  "冲洗 keeps the write gate: it writes the document"
);
test.assertMatches(
  coordinator,
  /registerReadOnlyRule\?\.\(\(element\) => \(\s*lightroomIsReadOnly\(\)/,
  "the read-only subject greys the window through the one owner of that property"
);
test.assertIncludes(
  composition,
  "if (lightroomIsReadOnly()) {",
  "Develop refuses a read-only subject even when a caller bypasses the greyed controls"
);
// The darkroom's reads and writes follow its subject: a developed document's
// record, not the draft's. Without this, 试看 on a subject filed its composite
// under the draft's record — the instruments read one text and reported on
// another.
test.assertIncludes(coordinator, "function darkroomTargetDocumentId(", "darkroom reads and writes resolve their target through the subject");
test.assertMatches(coordinator, /const documentId = darkroomTargetDocumentId\(record, projectId\);/, "darkroomOf and the darkroom patch route both use the subject-aware target");
test.assertIncludes(composition, "lightroomIsReadOnly()\n    ? lightroomBodyText()", "the composite and the reading view read the subject's own text");
// The subject expires with the window that opened it: every close door reports
// through noteLightroomClosed, and a subject that survived the close showed a
// foreign document nothing on screen accounted for.
test.assertMatches(editor, /function noteLightroomClosed\(\) \{[\s\S]{0,400}?clearLightroomSubject/, "closing the darkroom by any door releases the read-only subject");
test.assertMatches(coordinator, /function clearLightroomSubject\(\) \{[\s\S]{0,500}?syncReadOnlySurface/, "releasing the subject unlocks the window's own controls again");

// --- receipts (不写没有发生的事) ---------------------------------------------
// The status line's right half names only operations that completed, with the
// clock time and the model that ran. Every call sits AFTER the commit result.
test.assertIncludes(coordinator, "function noteLightroomReceipt(", "the darkroom has one receipt writer");
test.assertMatches(composition, /setQuickDraftStatus\(t\("quick_draft_apply_done"\)\);\s*noteLightroomReceipt\("quick_draft_preview_adjustments"/, "试看 receipts only after the composite landed");
test.assertMatches(composition, /setQuickDraftStatus\(t\("quick_draft_develop_done"\)\);\s*noteLightroomReceipt\("quick_draft_develop"/, "冲洗 receipts only after the document was written");

// --- 页面设置 / 打印 and 撤销冲洗 --------------------------------------------
// Printing belongs to the reading view: the composite is the one paper this
// application puts on a page, and reading needs no write access. Undo answers
// for exactly one thing: the last develop, while its before-develop version is
// still the newest link.
test.assertMatches(menus, /menuItem\("lightroom-page-setup", "page_setup"\),\s*menuItem\("lightroom-print", "print"\)/, "the File menu carries Page Setup and Print");
test.assertIncludes(menus, 'menuItem("lightroom-undo-develop", "lightroom_undo_develop", "lightroom-undo-develop")', "the Adjust menu carries Undo Develop with its key equivalent");
test.assertMatches(handoff, /\["lightroom-page-setup", "lightroom-print"\]\.includes\(action\)[\s\S]{0,80}?view === "read"/, "Page Setup and Print exist only in the reading view");
test.assertMatches(handoff, /action === "lightroom-undo-develop"[\s\S]{0,100}?writable && Boolean\(lastLightroomDevelopVersion\(\)\)/, "Undo Develop needs the pen and a develop still on top of the chain");
test.assertMatches(editor, /function lastLightroomDevelopVersion\([\s\S]{0,300}?latest\.reason === "before-develop"/, "undo is available only while the develop is the newest link");
test.assertMatches(editor, /async function undoLightroomDevelop\(\)[\s\S]{0,700}?restoreQuickDraftVersion\(version\.id, "version"\)/, "undo goes back through the same restore path every version row uses");
test.assertMatches(editor, /async function printLightroomComposite\(\)[\s\S]{0,400}?lightroom_print_none/, "a page that cannot be built refuses instead of opening a blank window");
test.assertIncludes(actions, '{ id: "lightroom-undo-develop", key: "z", code: "KeyZ", option: true, action: "lightroom-undo-develop"', "⌥⌘Z is scoped to the darkroom, beside the text undo instead of on top of it");

// --- Show/Hide Adjustments: one predicate, not two ------------------------
// isAvailable used to ask "does the subject have body text" while the toggle
// asked "is the live form empty", so the row could light up on one condition
// and refuse on the other. Both now call quickDraftPanelActionable("inspector")
// -- the darkroom's own subject text when developing a document that is not
// the live draft, the live form's own emptiness otherwise -- so there is one
// answer to "can this panel show anything" instead of two that can disagree.
test.assertIncludes(handoff, 'if (action === "lightroom-toggle-inspector") return quickDraftPanelActionable("inspector");', "the availability check reads the toggle's own predicate, not a separately derived hasBody");
test.assertMatches(coordinator, /function toggleQuickDraftPanel\(panel = "shelf"\) \{\s*const target = panel === "inspector" \? "inspector" : "shelf";\s*if \(!quickDraftPanelActionable\(target\)\) return false;/, "the toggle's own guard is the same predicate the menu row asks");
test.assertMatches(coordinator, /function quickDraftPanelActionable\(panel = "shelf"\) \{[\s\S]{0,200}?lightroomSubject[\s\S]{0,150}?is-empty-draft/, "the shared predicate is subject-aware for the inspector and live-draft-aware otherwise");

test.finish();
