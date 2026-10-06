// Harvest UX: one primary, disable-with-reason, real view switches,
// command-menu overflow, honest empty states, clip-then-render, ClioTalk
// connect in chrome, Quick Draft format as a closed-set select, and the
// expanded B–E early-harvest (writing-route primaries, Finder select-then-act,
// empty-state balloons, appearance honesty wiring).

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("harvest-ux");
const index = read("index.html");
const composition = read("app/features/quick-draft-composition.js");
const balloon = read("app/core/balloon-help.js");
const windowManager = read("app/core/window-manager.js");
const wireup = read("app/core/wireup.js");
const actions = read("app/core/actions.js");
const writingFlow = read("app/features/writing-flow.js");
const timeMachine = read("app/features/time-machine.js");
const app = read("app.js");
const scrapbook = read("app/features/scrapbook.js");
const chatMessages = read("app/core/chat-messages.js");
const documentsChat = read("app/features/documents-chat.js");
const projectDisk = read("app/features/project-disk.js");
const docmap = read("app/features/docmap.js");
const finderColumns = read("app/features/finder-columns.js");
const menus = read("app/data/menus.js");
const themeRegistry = read("app/core/theme-registry.js");
const multiFinder = read("app/core/multi-finder.js");
const windowsCss = read("styles/10-windows.css");
const themeLabModule = read("app/features/theme-lab.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

const questionCommands = index.match(/aria-label="Question Sheet commands"[\s\S]*?data-action="advance-question-to-outline"/)?.[0] || "";
const outlineCommands = index.match(/aria-label="Outline commands"[\s\S]*?data-action="advance-outline-to-drafts"/)?.[0] || "";
const sectionDraftCommands = index.match(/aria-label="Section Draft commands"[\s\S]*?data-action="advance-drafts-to-manuscript"/)?.[0] || "";
const teachTextCommands = index.match(/aria-label="Writing commands"[\s\S]*?id="teachtext-to-review"/)?.[0] || "";
const reviewCommands = index.match(/aria-label="Review commands"[\s\S]*?data-action="review-export"/)?.[0] || "";
const questionMenu = index.match(/aria-label="Question Sheet commands"[\s\S]*?<\/details>/)?.[0] || "";
const outlineMenu = index.match(/aria-label="Outline commands"[\s\S]*?<\/details>/)?.[0] || "";
const sectionDraftMenu = index.match(/aria-label="Section Draft commands"[\s\S]*?<\/details>/)?.[0] || "";
const teachTextMenu = index.match(/aria-label="Writing commands"[\s\S]*?<\/details>/)?.[0] || "";
const reviewMenu = index.match(/aria-label="Review commands"[\s\S]*?<\/details>/)?.[0] || "";

test.assertMatches(
  composition,
  /const proofReady = trackOwns \? trackReady : compositeReady/,
  "文字亮室 footer proof readiness covers adjustment layers and the content track"
);
test.assertMatches(
  composition,
  /previewButton\?\.classList\.toggle\("default", Boolean\(hasBody && !proofReady && !listenMode\)\)/,
  "文字亮室 keeps one footer default: Preview only while a proof is not ready"
);
test.assertMatches(
  composition,
  /developButton\?\.classList\.toggle\("default", Boolean\(hasBody && proofReady && !listenMode\)\)/,
  "Develop is the footer default only when a proof is waiting"
);
test.assertMatches(
  composition,
  /backButton\?\.classList\.toggle\("default", !hasBody\)/,
  "an empty darkroom makes Back to the Draft the one default"
);

const desk = read("app/features/draft-desk.js");
const tracks = read("app/features/quick-draft-tracks.js");
const lightroomInstall = desk.slice(desk.indexOf("function installLightroomWindow"), desk.indexOf("installLightroomWindow();"));
const lightroomFooter = lightroomInstall.slice(lightroomInstall.indexOf('<footer class="lightroom-actions">'));
const reviewDesk = index.slice(index.indexOf('data-window="reviewDesk"'), index.indexOf('data-window="findChange"'));
test.assertIncludes(lightroomFooter, 'data-quick-draft-track="interest"', "兴趣｜内容｜并排 lives in 文字亮室");
test.assertIncludes(lightroomFooter, 'class="view-switch quick-draft-track-toggle"', "兴趣｜内容｜并排 is the segmented control");
test.assertIncludes(lightroomFooter, 'class="view-switch draft-desk-display-switch"', "痕迹｜阅读｜听稿 stays its own view-switch beside the tracks");
test.assert(!reviewDesk.includes("data-quick-draft-track"), "审校台 does not grow the interest｜content｜split switch");
test.assertIncludes(tracks, "window.innerWidth >= 840", "并排 only appears when the desk is wide enough");
test.assertIncludes(tracks, 'if (quickDraftTrackMode === "split" && !splitOk) quickDraftTrackMode = "interest"', "shrinking out of 并排 returns to 兴趣");
test.assertIncludes(tracks, 'showSystemModal(t("lightroom_track_develop_confirm")', "冲洗 asks before the content column becomes the body");
test.assert(
  tracks.indexOf("if (!body)") < tracks.indexOf("fetchModelPayload"),
  "opening 兴趣 never asks the model; empty interest never asks either"
);

test.assertIncludes(balloon, "balloonHelpCensusNoOpReasons", "census no-ops map to a named disable reason");
test.assertIncludes(balloon, "function actionUnavailableReasonKey", "a refused command can name why it is grey");
test.assertIncludes(actions, "actionUnavailableReasonKey(action)", "dispatching a grey command speaks the reason instead of no-op silence");
test.assertIncludes(windowManager, '"show-writing-flow"', "show-writing-flow is gated, not left off the availability map");
test.assertIncludes(windowManager, '"close-writing-flow"', "close-writing-flow is gated");
test.assertIncludes(windowManager, '"toggle-writing-flow-shade"', "toggle-writing-flow-shade is gated");
test.assertIncludes(windowManager, '"hand-in-rebuild-flow"', "rebuild Hand In is gated");
test.assertIncludes(windowManager, '"rebuild-merge-section"', "rebuild Merge is gated");
test.assertIncludes(actions, "unavailableReason:()=>\"balloon_disabled_menu_multifinder\"", "About MultiFinder names MultiFinder as its precondition");
test.assertIncludes(actions, "unavailableReason:()=>\"balloon_disabled_menu_headings\"", "Heading Navigator names the missing writing surface");

test.assertIncludes(app, "if (winName === \"documents\") renderDocuments();", "Finder view switches re-render the list, not only the status line");
test.assertIncludes(app, "else if (winName === \"imageManager\") renderTeachTextImageAttachments();", "画片簿 view switches re-render the grid or list");
test.assertIncludes(writingFlow, "cards.classList.toggle(\"is-hidden\", !wantCards);", "Question Sheet view changes the cards DOM");
test.assertIncludes(writingFlow, "outlineTreeEl.classList.add(\"is-hidden\")", "Outline tree view hides or shows the tree");
test.assertIncludes(timeMachine, "timeMachineFrameEl?.classList.toggle(\"is-hidden\", reading);", "Time Machine view switches hide the unused pane");
test.assertIncludes(finderColumns, "nextstep-finder-columns", "NeXTSTEP columns view paints a real columns DOM");
test.assertIncludes(docmap, "dataset.docmapZoom", "DocMap zoom writes a visible zoom mode onto the window");

test.assertIncludes(questionMenu, 'data-action="generate-outline"', "AI Outline lives in the Question Sheet command menu");
test.assert(
  !/<\/details>[\s\S]*data-action="generate-outline"/.test(questionCommands),
  "AI Outline is not a second toolbar button beside Preview"
);
test.assertIncludes(outlineMenu, 'data-action="add-outline-section"', "Add Section lives in the Outline command menu");
test.assert(
  !/<\/details>[\s\S]*data-action="add-outline-section"/.test(outlineCommands),
  "Add Section is not a second toolbar button beside Preview"
);
test.assertIncludes(sectionDraftMenu, 'data-action="draft-current-section"', "AI Draft lives in the Section Drafts command menu");
test.assert(
  !/<\/details>[\s\S]*data-action="draft-current-section"/.test(sectionDraftCommands),
  "AI Draft is not a second toolbar button beside Preview"
);
test.assertIncludes(teachTextMenu, 'data-mde-focus-cycle', "TeachText Focus lives in Commands");
test.assert(
  !/<\/details>[\s\S]*data-mde-focus-cycle/.test(teachTextCommands),
  "TeachText Focus is not a second toolbar button beside Preview"
);
test.assertIncludes(reviewMenu, 'data-action="review-edit-manuscript"', "Edit Full Manuscript lives in Review Commands");
test.assert(
  !/<\/details>[\s\S]*data-action="review-edit-manuscript"/.test(reviewCommands),
  "Edit Full Manuscript is not a second toolbar button beside Preview"
);

test.assertIncludes(index, 'id="project-disk-more"', "Project Hard Disk folds Add/Backup/Plan into one select");
test.assertIncludes(index, 'id="project-disk-more-go"', "Project Hard Disk acts with Do Selected");
test.assertIncludes(projectDisk, "function runProjectDiskMoreAction", "Project Hard Disk select-then-act is wired");
test.assertIncludes(index, 'id="trash-more"', "Trash folds Restore/Empty into one select");
test.assertIncludes(index, 'id="trash-more-go"', "Trash acts with Do Selected");
test.assertIncludes(scrapbook, "function runTrashMoreAction", "Trash select-then-act is wired");
test.assertIncludes(index, 'id="scrap-multi-more"', "Scrapbook multi-select folds into one select");
test.assertIncludes(scrapbook, "function runScrapMultiAction", "Scrapbook multi select-then-act is wired");
test.assertIncludes(index, 'id="chat-file-more"', "Chat File folds Open/Insert/DocMap into one select");
test.assertIncludes(documentsChat, "function runChatFileMoreAction", "Chat File select-then-act is wired");
test.assertIncludes(documentsChat, "function renderChatFileEmptyState", "Chat File paints an honest empty state");
test.assertIncludes(documentsChat, 'dataset.action = "open-assistant"', "Chat File empty note offers Open Chat in-place");
test.assertIncludes(documentsChat, 'handleAction("open-teachtext")', "Documents empty root offers TeachText as next step");
test.assertIncludes(scrapbook, 'handleAction("open-reader")', "Scrapbook empty card opens Reader to clip");
test.assertIncludes(docmap, 'data-action="open-reader"', "DocMap idle empty offers Reader as next source step");
test.assertIncludes(read("app/features/findpath.js"), 'dataset.action = "open-project-disks"', "Find File zero results offers Project Hard Disk as next step");
test.assertIncludes(read("app/features/findpath.js"), "function renderFindPathEmptyNext", "Searcher empty panes can offer a tappable next step");
test.assertIncludes(read("app/features/file-disk.js"), 'insertFileFloppyFromWindow()', "File Floppy empty object inserts a floppy");
test.assertIncludes(read("app/features/clio-stage.js"), 'dataset.action = "open-teachtext"', "ClioStage empty offers TeachText as next step");
test.assertIncludes(read("app/features/teachtext-accessories.js"), 'for="teachtext-image-input"', "Picture Album empty taps the Add Images picker");
test.assertIncludes(scrapbook, 'dataset.action = "open-project-disks"', "Trash empty offers Project Hard Disk as next step");
test.assertIncludes(scrapbook, 'dataset.action = "open-rag"', "Context Panel empty offers File Floppy as next step");
test.assertIncludes(read("app/features/export-import.js"), "paintImportEmptyNext", "Import empty note offers Choose Files as next step");
test.assertIncludes(read("app/features/bureaucracy-meme.js"), "bureaucracy-empty-next", "Bureaucracy empty offers Draft captions as next step");
test.assert(
  /id="model-meter-empty"[\s\S]*?data-action="open-control"/.test(index),
  "Model Meter empty offers Control Panel as next step",
);
test.assert(
  /id="model-meter-empty"[\s\S]*?data-action="open-assistant"/.test(index),
  "Model Meter empty offers ClioTalk as next step",
);
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_soundscape_save_disabled"', "Soundscape Save This Moment says why it is grey with no track");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_soundscape_moment_needs_selection"', "Soundscape saved actions say select a moment first");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_cmf_needs_model"', "CMF export/view chrome says wait for the model");
test.assertIncludes(read("app/features/soundscape.js"), 'translate("soundscape_choose_local"', "Soundscape saved empty offers Choose Music as next step");
test.assertIncludes(read("app/features/time-machine.js"), 'dataset.action = "time-machine-web-view"', "Time Machine reader-empty offers Web View as next step");

test.assertIncludes(index, 'data-balloon-help-disabled="balloon_reader_clip_needs_selection"', "Reader Clip says why it is grey on an empty page");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_scrapbook_empty"', "Scrapbook Insert says why it is grey with no scrap");
test.assertIncludes(scrapbook, "balloon_scrapbook_needs_translation", "Scrapbook bilingual export says why it is grey without a translation");
test.assertIncludes(scrapbook, 'markGrayAffordance(scrapbookPagePreviousButton', "Scrapbook page arrows use shared grey affordance");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_trash_empty_first"', "Trash Do Selected says why it is grey when empty");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_project_disk_empty_first"', "Project Hard Disk Do Selected says what to do first");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_chat_file_empty_first"', "Chat File Do Selected says what to open first");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_dictionary_unlooked"', "Dictionary Keep/Delete say look up first");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_manuscript_needs_body"', "TeachText Review greys with a body-needed reason");
test.assertIncludes(index, 'data-balloon-help="balloon_chooser_guest_invite"', "Chooser Invite explains the token path");
test.assertIncludes(index, 'data-balloon-help="balloon_chooser_guest_rotate"', "Chooser New Desk Name explains revoke");
test.assertIncludes(read("app/features/teachtext-accessories.js"), "balloon_image_album_full", "Picture Album full greys Add Images with a reason");
test.assertIncludes(read("app/features/control-strip.js"), "balloon_control_strip_move_top", "Control Strip Move Up explains top-of-list");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_load_model_needs_lm_studio"', "Control Panel Load Model greys until LM Studio is the provider");
test.assertIncludes(balloon, "function revealUnavailableControlWhy", "grey one-tap why is a shared Balloon Help shell helper");
test.assertIncludes(wireup, "revealUnavailableControlWhy(actionTarget)", "wireup routes grey data-action taps to the shared explainer");
test.assertIncludes(actions, 'reviewDeskEmptyNoteEl?.classList.add("empty-next-note")', "Review Desk empty note marks one next step");
test.assertIncludes(read("app/features/find-change.js"), "find-change-empty-next", "Find/Change empty offers TeachText as next step");
test.assertIncludes(read("app/features/liquid-cover.js"), "balloon_cover_layers_full", "Cover Glass full layer budget explains on one tap");
test.assertIncludes(index, 'data-action="reader-clip-translate"', "Clip + Translate stays available from Reader Commands");
test.assert(
  !/reader-selection-bar[\s\S]*data-action="reader-clip-translate"/.test(index),
  "Clip + Translate is not a second primary beside Clip in the selection bar"
);
test.assertIncludes(index, 'data-action="clip-selected-find-path"', "Searcher Clip lives in Send To…");
test.assert(
  !/find-path-actions[\s\S]*?<\/details>[\s\S]*data-action="clip-selected-find-path"/.test(index),
  "Searcher Clip is not a peer primary beside Search / Open in Reader"
);

test.assertIncludes(scrapbook, "visibleScraps.map((scrap) => `${scrap.id}:${(scrap.tags || []).join(\",\")}:${String(scrap.body || \"\").length}`)", "clipping a scrap changes the render signature so the stack redraws");
test.assertIncludes(scrapbook, 'promptInput.dispatchEvent(new Event("input"', "Scrapbook Insert refreshes the ClioTalk prompt immediately");
test.assertIncludes(documentsChat, 'promptInput.dispatchEvent(new Event("input"', "Chat File Insert refreshes the ClioTalk prompt immediately");

test.assertIncludes(index, 'id="clio-connect-ai"', "ClioTalk connect stays in window chrome");
test.assertIncludes(chatMessages, "function syncClioTalkConnectTitlebar", "connect visibility follows model readiness");
test.assertNotIncludes(chatMessages, 'connect.dataset.action = "open-clio-model-settings"', "Connect AI is not rebuilt as a fifth welcome starter");

test.assertIncludes(index, 'class="select-wrap draft-desk-sheet-select"', "Quick Draft format uses the existing select wrap");
test.assertIncludes(index, 'id="quick-draft-format"', "format is one closed-set select");
test.assertNotIncludes(index, 'id="quick-draft-format-chips"', "format is not a second chip wall");

test.assertIncludes(menus, "balloon_appearance_not_ready", "Appearance menu can grey unfinished eras with a reason");
test.assertIncludes(menus, "balloon_appearance_polish_pending", "Appearance menu names polish-pending eras without greying them");
test.assertIncludes(menus, "disabled: releaseReady === false", "Appearance does not click-fake unfinished painters");
test.assertIncludes(themeRegistry, 'id: "classic"', "Classic remains a switchable appearance");
test.assertIncludes(themeRegistry, 'id: "liquid-glass"', "Liquid Glass remains a switchable appearance");
test.assertIncludes(themeRegistry, 'overlay: "liquid-glass"', "Liquid Glass carries a glass overlay Classic does not");
test.assertIncludes(themeRegistry, 'overlay: "none"', "Classic keeps a non-glass overlay so the switch is visible");
test.assertIncludes(themeRegistry, '"liquid-overlay"', "Liquid Glass capability list names the glass material Classic lacks");
test.assertMatches(themeRegistry, /id:\s*"system-7"[\s\S]*?releaseReady:\s*true/, "System 7 stays selectable after harvest D polish clear");
test.assertMatches(themeRegistry, /id:\s*"drawing-board"[\s\S]*?releaseReady:\s*true/, "Drawing Board stays selectable after harvest E 8.5 evidence clear");
test.assertMatches(themeRegistry, /id:\s*"lion"[\s\S]*?releaseReady:\s*true/, "Lion stays selectable after harvest D polish clear");
test.assertMatches(themeRegistry, /id:\s*"tiger"[\s\S]*?releaseReady:\s*true/, "Tiger stays selectable after harvest B polish clear");
test.assertMatches(themeRegistry, /id:\s*"big-sur"[\s\S]*?releaseReady:\s*true/, "Big Sur stays selectable after harvest B polish clear");
test.assertMatches(themeRegistry, /id:\s*"nextstep"[\s\S]*?releaseReady:\s*true/, "NeXTSTEP stays selectable after harvest B polish clear");
test.assert(
  !/id:\s*"system-7"[\s\S]*?polishPending:\s*true/.test(themeRegistry.split(/id:\s*"platinum"/)[0]),
  "System 7 no longer carries polishPending after harvest D",
);
test.assert(
  !/id:\s*"lion"[\s\S]*?polishPending:\s*true/.test(themeRegistry.split(/id:\s*"yosemite"/)[0]),
  "Lion no longer carries polishPending after harvest D",
);
test.assert(
  !/id:\s*"tiger"[\s\S]*?polishPending:\s*true/.test(themeRegistry.split(/id:\s*"snow-leopard"/)[0]),
  "Tiger no longer carries polishPending after harvest B",
);
test.assert(
  !/id:\s*"big-sur"[\s\S]*?polishPending:\s*true/.test(themeRegistry.split(/id:\s*"liquid-glass"/)[0]),
  "Big Sur no longer carries polishPending after harvest B",
);
test.assert(
  !/id:\s*"nextstep"[\s\S]*?polishPending:\s*true/.test(themeRegistry),
  "NeXTSTEP no longer carries polishPending after harvest B",
);
test.assert(
  !themeRegistry.includes("site-readme-p5"),
  "harvest D cleared site-readme-p5 after README/site era-axis placement",
);
test.assert(
  !themeRegistry.includes("site-branch-placement"),
  "harvest D cleared site-branch-placement after visible branch P5 placement",
);
test.assert(
  !/id:\s*"drawing-board"[\s\S]*?polishPending:\s*true/.test(themeRegistry.split(/id:\s*"aqua"/)[0]),
  "Drawing Board no longer carries polishPending after harvest E / v227",
);
test.assert(
  !themeRegistry.includes("primary-8.5-beta-evidence"),
  "harvest E cleared primary-8.5-beta-evidence after thme cross-verify",
);
test.assertMatches(themeRegistry, /id:\s*"classic"[\s\S]*?releaseReady:\s*true/, "Classic stays release-ready");
test.assertMatches(themeRegistry, /id:\s*"liquid-glass"[\s\S]*?releaseReady:\s*true/, "Liquid Glass stays release-ready");
test.assertIncludes(themeRegistry, "getPolishPendingThemes", "registry exposes the polish-pending list so todos stay queryable");
test.assertIncludes(multiFinder, "NEXTSTEP_NARROW_MERGED_SWITCHER_QUERY", "narrow merged switcher shares the Dock-hide media query");
test.assertIncludes(multiFinder, "prefersNextstepNarrowMergedSwitcher", "NeXTSTEP narrow merged switcher is owned beside MultiFinder");
test.assertIncludes(multiFinder, 'dataset.appSwitchMerged = "app-window"', "narrow NeXTSTEP advertises the merged App／window menu");
test.assertIncludes(windowsCss, "--help-row-selected-bg: var(--sidebar-selection-bg)", "key-window selection sweep rebinds help-row tokens");
test.assertIncludes(windowsCss, "--theme-lab-list-selected-bg: var(--sidebar-selection-bg)", "key-window selection sweep rebinds Theme Lab list tokens");
test.assertIncludes(read("styles/68-big-sur-appearance.css"), "blur(12px) saturate(140%)", "Big Sur vibrancy sidebar is measurable and distinct from Yosemite");
test.assertIncludes(themeLabModule, 'data-app="finder"', "Theme Lab Finder specimen reuses Finder metal via data-app");
const drawingBoardCss = read("styles/65-drawing-board-appearance.css");
test.assertIncludes(drawingBoardCss, "--drawing-board-pencil-content-safe: 1", "Drawing Board pencil-safe flag stays on");
test.assertIncludes(drawingBoardCss, "contain: paint", "Drawing Board pencil crosses stay paint-contained on title-bar controls");
test.assertIncludes(drawingBoardCss, "assets/themes/drawing-board/era-thumb-16.svg", "Drawing Board era-rail thumb is a 2×2 sketch grid asset");
test.assertIncludes(drawingBoardCss, "assets/themes/drawing-board/paper-tile-96.png", "Drawing Board desktop uses the sketch paper tile");
test.assertIncludes(drawingBoardCss, "assets/themes/drawing-board/pencil-safe-board.png", "Drawing Board Theme Lab pencil-safe board uses the sketch specimen");
test.assertIncludes(read("styles/66-theme-lab.css"), "--pencil-safe-bg", "Theme Lab pencil-safe specimen reads the era pencil-safe token");
test.assertIncludes(themeLabModule, 'data-theme-lab-polish="grayscale-depth-board"', "Theme Lab hosts the NeXTSTEP grayscale depth board");
test.assertIncludes(themeLabModule, 'data-theme-lab-polish="overlay-scrollbars-accept"', "Theme Lab hosts the Lion overlay-scrollbar accept board");
test.assertIncludes(themeLabModule, 'data-theme-lab-polish="pencil-line-content-safe"', "Theme Lab hosts the Drawing Board pencil-safe board");
test.assertIncludes(themeLabModule, 'data-theme-lab-calm="quiet-focus"', "Theme Lab hosts the v222 calm quiet-focus surface");
test.assertIncludes(themeLabModule, 'data-theme-lab-calm-select', "Theme Lab calm modes are selectable in product, not only the proposal");
test.assertIncludes(themeLabModule, "measurePolishBoards", "Theme Lab exposes a computed-style polish measure probe");
test.assertIncludes(themeLabModule, "themeLabMeasureKeywinDistinct", "Theme Lab writes measurable key-window distinctness");
test.assertIncludes(themeLabModule, "themeLabMeasureVibrancy", "Theme Lab writes measurable vibrancy backdrop-filter");
test.assertIncludes(themeLabModule, "themeLabMeasureGray", "Theme Lab writes measurable grayscale depth steps");
test.assertIncludes(themeLabModule, "themeLabMeasureBlurPx", "Theme Lab writes painter blur-px for the v224 computed-style gate");
test.assertIncludes(themeLabModule, "themeLabMeasureDefaultCount", "Theme Lab counts the single default button in the controls row");
test.assertIncludes(read("package.json"), "verify:theme-lab:painter", "painter gate is a repeatable npm verify script");
test.assertIncludes(
  read("tooling/theme-lab-painter-contract.mjs"),
  "twelve-era-computed-v233",
  "painter verify owns the twelve-era §C computed matrix (v233)",
);
test.assertIncludes(
  read("tooling/theme-lab-painter-contract.mjs"),
  "twelve-era-scoped-v236",
  "painter scoped pixels cover twelve eras (v236); still ≠ full-board Theme Lab snapshot matrix",
);
test.assertIncludes(
  read("tooling/theme-lab-painter-contract.mjs"),
  'id: "nextstep-keywin"',
  "v235 adds NeXTSTEP titlebar keywin scoped region",
);
test.assertIncludes(
  read("tooling/theme-lab-painter-contract.mjs"),
  'id: "platinum-keywin"',
  "v235 adds Platinum titlebar keywin scoped region",
);
test.assertIncludes(
  read("tooling/theme-lab-painter-contract.mjs"),
  'id: "drawing-board-keywin"',
  "v236 adds Drawing Board titlebar keywin scoped region",
);
test.assertIncludes(
  read("tooling/theme-lab-painter-contract.mjs"),
  'id: "lion-keywin"',
  "v236 adds Lion titlebar keywin scoped region",
);
test.assertIncludes(themeLabModule, "data-theme-lab-polish-pending", "Theme Lab displays remaining polishTodos honestly");
test.assertIncludes(translationsEn, "theme_lab_calm:", "Theme Lab calm copy exists in English");
test.assertIncludes(translationsZh, "theme_lab_calm:", "Theme Lab calm copy exists in Chinese");
test.assertIncludes(read("package.json"), '"apps/desktop/assets/themes/drawing-board/*.png"', "packaged builds include Drawing Board sketch PNGs");
test.assert(
  ["era-thumb-16.svg", "era-thumb-32.png", "paper-tile-96.png", "pencil-safe-board.png"]
    .every((name) => exists(`assets/themes/drawing-board/${name}`)),
  "Drawing Board sketch assets exist on the runtime path",
);

test.assertIncludes(actions, '"one-sentence-rewrite-section"', "one-sentence rewrite has an application handler");
test.assertIncludes(actions, '"one-sentence-check-section"', "one-sentence check has an application handler");
test.assertIncludes(writingFlow, "async function oneSentenceRewriteSection", "Section Drafts owns one-sentence rewrite");
test.assertIncludes(writingFlow, "async function oneSentenceCheckSection", "Section Drafts owns one-sentence check");

test.assertIncludes(index, 'data-balloon-help-disabled="balloon_import_needs_files"', "Import Write says choose files first");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_import_backup_needs_file"', "Import backup says choose a backup first");
test.assertIncludes(index, 'id="model-meter-empty"', "Model Meter has an honest empty state");

const harvestKeys = [
  "balloon_disabled_menu_multifinder",
  "balloon_disabled_menu_headings",
  "balloon_disabled_menu_writing_flow_closed",
  "balloon_disabled_menu_writing_flow_open",
  "balloon_disabled_menu_host_window",
  "balloon_notifications_empty_clear",
  "balloon_control_strip_select_module",
  "sound_effects_on",
  "sound_effects_off",
  "balloon_disabled_rebuild_checks",
  "balloon_disabled_rebuild_merge",
  "balloon_reader_clip_needs_selection",
  "balloon_scrapbook_empty",
  "balloon_trash_empty_first",
  "balloon_project_disk_empty_first",
  "balloon_chat_file_empty_first",
  "balloon_dictionary_unlooked",
  "balloon_dictionary_needs_definition",
  "balloon_appearance_not_ready",
  "balloon_appearance_polish_pending",
  "appearance_polish_pending",
  "appearance_polish_pending_status",
  "balloon_import_needs_files",
  "balloon_import_backup_needs_file",
  "balloon_soundscape_save_disabled",
  "balloon_soundscape_moment_needs_selection",
  "balloon_cmf_needs_model",
  "balloon_cmf_duo_export_disabled",
  "balloon_hold_empty_first",
  "balloon_cover_needs_image",
  "balloon_recovery_needs_project",
  "balloon_recovery_no_session",
  "balloon_recovery_no_ai",
  "balloon_outline_needs_content",
  "balloon_draft_needs_content",
  "balloon_draft_needs_section",
  "balloon_text_disk_select_first",
  "balloon_text_disk_mount_first",
  "text_disk_more",
  "model_meter_empty",
  "review_density_lives_in_lightroom",
  "review_go_to_lightroom",
  "do_selected",
  "chat_file_empty",
  "review_lens",
  "review_lens_hint_style",
  "review_lens_hint_facts",
  "review_lens_hint_hkrr",
  "review_lens_hint_mingming",
  "review_lens_hint_luoluo",
  "review_lens_empty_style",
  "review_lens_empty_facts",
  "review_lens_empty_hkrr",
  "review_lens_empty_mingming",
  "review_lens_empty_luoluo",
  "balloon_review_lens_style",
  "balloon_review_lens_facts",
  "balloon_review_lens_hkrr",
  "balloon_review_lens_mingming",
  "balloon_review_lens_luoluo",
];
harvestKeys.forEach((key) => {
  test.assertIncludes(translationsEn, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese copy exists for ${key}`);
});

const responsive = read("styles/60-responsive.css");
const markdownEditor = read("app/core/markdown-editor.js");
const surfacesCss = read("styles/30-surfaces.css");

test.assertIncludes(index, 'id="review-lens"', "Review Desk keeps a closed-set lens select");
test.assertIncludes(index, 'class="review-lens-chrome"', "lens chrome stays outside the locked-away results column");
test.assertIncludes(index, 'id="review-lens-hint"', "lens hint copy follows the active lens");
test.assertIncludes(index, 'id="review-lens-empty-follow"', "empty desk still speaks the chosen lens");
test.assertIncludes(index, 'id="review-density-note"', "Review Desk names where Density lives");
test.assertIncludes(index, 'data-action="open-lightroom"', "Review Desk can send the writer to Lightroom");
test.assertIncludes(actions, "function syncReviewDeskLensCopy", "switching lens refreshes chrome/help/empty copy");
test.assertIncludes(actions, 'mingming', "Reader's Eye is a first-class review lens");
test.assertIncludes(actions, 'luoluo', "Listener's Ear is a first-class review lens");
test.assertIncludes(surfacesCss, ".review-desk-window.is-review-locked .review-lens-chrome", "empty desk keeps the lens selector");
test.assertIncludes(markdownEditor, "function mdeSyncWritingFocusDesk", "writing focus syncs desk icon visibility");
test.assertIncludes(markdownEditor, 'classList.toggle("is-writing-focus"', "focus mode toggles a body desk-quiet class");
test.assertIncludes(responsive, "body.is-writing-focus .icon-column", "writing focus hides desktop icons");
test.assertIncludes(responsive, "body.quick-draft-focus .icon-column", "Quick Draft / lightroom deep mode quiets desktop icons");
test.assertIncludes(responsive, "body.is-review-focus .icon-column", "Review Desk key window quiets desktop icons");
test.assertIncludes(windowManager, "function syncReviewDeskFocusQuiet", "focusing Review Desk toggles the desk-quiet class");
test.assertIncludes(responsive, ".teachtext-surface-actions > .btn.default", "narrow writing surfaces give the primary its own row");

// Early-harvest O7–O9: ADHD／I-person journey gates productized in apps/
// (design map journey-product-harvest-design.md). Dedicated executable lock:
// tests/features/journey-gates.test.mjs (eight-stop + journey desk smoke).
const journeyGatesSource = read("app/core/journey-gates.js");
test.assertIncludes(journeyGatesSource, "AISystem6JourneyGates", "harvest O productizes journey gates in apps/");
test.assertIncludes(journeyGatesSource, 'data-journey-product', "product probe claims journey product landings");
test.assertIncludes(windowManager, "closeSiblingJourneyAccessories", "shell one-at-a-time closes sibling journey DAs");
test.assertIncludes(markdownEditor, "AISystem6JourneyGates?.syncDeskProbe", "desk-focus syncs the journey probe");

// Early-harvest R16–R18: writing-route fluency after Interest tracks, summon/
// disk select-then-act leftovers, and rest/games host honesty copy.
test.assertIncludes(read("app/core/balloon-help.js"), '"advance-outline-to-drafts": "balloon_outline_needs_content"', "empty Outline greys To Section Drafts with a reason");
test.assertIncludes(read("app/core/balloon-help.js"), '"advance-drafts-to-manuscript": "balloon_draft_needs_content"', "empty Section Drafts greys To Manuscript with a reason");
test.assertIncludes(read("app/core/balloon-help.js"), '"structure-outline": "balloon_outline_needs_content"', "empty Outline greys Structure with a reason");
test.assertIncludes(read("app/core/balloon-help.js"), '"draft-current-section": "balloon_draft_needs_section"', "Section Drafts AI Draft greys without a section");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_outline_needs_content"', "Outline advance button carries the empty-state balloon");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_draft_needs_content"', "Section Drafts advance button carries the empty-body balloon");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_draft_needs_section"', "AI Draft carries the needs-section balloon");
test.assertIncludes(read("app/features/writing-flow.js"), "function syncWritingRouteEmptyMarkers", "writing route marks data-empty on Question/Outline/Drafts");
test.assertIncludes(read("styles/30-surfaces.css"), ".question-sheet-window[data-empty] .specialized-command-menu", "empty writing-route demotes Commands chrome for ADHD calm");
test.assertIncludes(responsive, ".review-desk-window.is-review-locked .review-desk-empty-note", "narrow Review locked empty note keeps readable padding");
test.assertIncludes(responsive, ".docmap-window[data-empty] .docmap-layout-picker", "narrow idle DocMap hides layout picker noise");
test.assertIncludes(read("styles/24-searcher.css"), ".find-path-window[data-empty] .find-path-pane > .button-row:last-child", "idle Searcher stacks grey handoff chrome on phone portrait");
test.assertIncludes(translationsEn, 'outline_markdown_hint: "No outline yet.', "Outline placeholder drops Markdown instruction tone");
test.assertIncludes(translationsZh, 'outline_markdown_hint: "还没有大纲。', "Outline placeholder is human empty-state Chinese");
test.assertIncludes(index, 'id="text-disk-more"', "File Floppy folds Insert/Write/Eject into one select");
test.assertIncludes(index, 'id="text-disk-more-go"', "File Floppy acts with Do Selected");
test.assertIncludes(read("app/features/file-disk.js"), "function runTextDiskMoreAction", "File Floppy select-then-act is wired");
test.assertIncludes(read("app/features/reader.js"), "function syncReaderSurfacePrimary", "Reader keeps one chrome default at a time");
test.assert(
  !/reader-selection-bar[\s\S]*class="btn default"[^>]*id="reader-clip-button"/.test(index)
    && !/id="reader-clip-button"[^>]*class="btn default"/.test(index),
  "Reader Clip is not a static second default beside Open",
);
test.assertIncludes(read("app/features/doom.js"), "doom_status_missing_binary", "DOOM missing-binary copy is hosted");
test.assertIncludes(read("app/features/doom.js"), "doom-host-note", "DOOM Retry shows the fail reason");
test.assertIncludes(read("app/features/openttd.js"), "openttd-host-note", "OpenTTD Retry shows the fail/missing reason");

// Early-harvest A1–A5: narrow Finder/DA/disk/creative/writing-bypass viewport
// density (proposal v210 / v213–v215) stays locked beside the writing-route
// one-primary row above.
test.assertIncludes(responsive, "Early-harvest A1", "harvest A1–A5 narrow block is named in responsive CSS");
test.assertIncludes(responsive, ".disk-window", "A1 Startup Disk is in the narrow harvest set");
test.assertIncludes(responsive, ".finder-window", "A1 Finder is in the narrow harvest set");
test.assertIncludes(responsive, ".applications-window", "A1 Applications is in the narrow harvest set");
test.assertIncludes(responsive, ".trash-window", "A1 Trash is in the narrow harvest set");
test.assertIncludes(responsive, ".note-pad-window", "A2 Note Pad is in the narrow harvest set");
test.assertIncludes(responsive, ".todo-da-window", "A2 To Do is in the narrow harvest set");
test.assertIncludes(responsive, ".hold-thought-window", "A2 Hold That Thought is in the narrow harvest set");
test.assertIncludes(responsive, ".clipboard-window", "A2 Clipboard is in the narrow harvest set");
test.assertIncludes(responsive, ".project-peek-window", "A2 projectPeek is in the narrow harvest set");
test.assertIncludes(responsive, ".disk-peek-window", "A2 diskPeek is in the narrow harvest set");
test.assertIncludes(responsive, ".project-cd-window", "A3 Project CD is in the narrow harvest set");
test.assertIncludes(responsive, ".documents-window", "A3 Documents is in the narrow harvest set");
test.assertIncludes(responsive, ".project-disks-window", "A3 Demos is in the narrow harvest set");
test.assertIncludes(responsive, ".find-file-window", "A3 Find File is in the narrow harvest set");
test.assertIncludes(responsive, ".image-manager-window", "A3 Album is in the narrow harvest set");
test.assertIncludes(responsive, ".project-disk-window", "A3 Projects is in the narrow harvest set");
test.assertIncludes(responsive, ".text-disk-window", "A3 Text Disk is in the narrow harvest set");
test.assertIncludes(responsive, ".assistant-window .composer .composer-submit-button", "A4 ClioTalk Send is full-width on narrow");
test.assertIncludes(responsive, ".assistant-window .composer .composer-file-button", "A4 ClioTalk Add keeps a touch-primary floor on narrow");
test.assertIncludes(responsive, ".reader-window", "A4 Reader is in the narrow harvest set");
test.assertIncludes(responsive, ".scrapbook-window", "A4 Scrapbook is in the narrow harvest set");
test.assertIncludes(responsive, ".scrapbook-window .scrap-list button:not(.scrap-empty-card)", "A4 Scrapbook list rows keep a touch-primary floor on narrow");
test.assertIncludes(responsive, ".chat-file-window", "Chat File joins the narrow button-row column stack");
test.assertIncludes(responsive, ".chat-file-window .button-row > .btn", "Chat File Do Selected keeps a touch-primary floor on narrow");
test.assertIncludes(responsive, ".find-path-window", "A4 Searcher is in the narrow harvest set");
test.assertIncludes(responsive, ".clio-stage-window", "A4 ClioStage is in the narrow harvest set");
test.assertIncludes(responsive, ".cmf-studio-window", "A4 CMF is in the narrow harvest set");
test.assertIncludes(responsive, ".liquid-cover-window", "A4 Cover Glass is in the narrow harvest set");
test.assertIncludes(responsive, ".rebuild-flow-window", "A5 Rebuild is in the narrow harvest set");
test.assertIncludes(responsive, ".draft-desk-window .draft-desk-actions > .btn.default", "A5 Quick Draft primary keeps a touch-primary floor on narrow");
test.assertIncludes(responsive, ".draft-desk-window .lightroom-actions > .btn.default", "A5 Lightroom primary keeps a touch-primary floor on narrow");
test.assertIncludes(
  responsive,
  ".teachtext-surface-actions > .btn.default {\n    flex: 1 0 100%;\n    min-height: var(--touch-primary-min-height);",
  "writing-route surface primaries keep a touch-primary floor on narrow"
);
test.assertIncludes(responsive, ".review-desk-window .review-desk-empty-note > .btn.default", "Review Desk empty primary keeps a touch-primary floor on narrow");
test.assertIncludes(responsive, ".todo-da-window .todo-da-item {\n    min-height: var(--touch-primary-min-height);", "A2 To Do rows keep a touch-primary floor on narrow");
test.assertIncludes(responsive, ".note-pad-window .note-pad-details-bar .btn", "Note Pad details nav keeps a touch-primary floor on narrow");
test.assertIncludes(responsive, ".clipboard-window .button-row > .btn", "Clipboard row buttons keep a touch-primary floor on narrow");
test.assertIncludes(responsive, ".image-manager-window .image-manager-list.is-list-view .image-manager-item", "Picture Album list rows keep a touch-primary floor on narrow");
test.assertIncludes(responsive, ".reader-window .reader-url-row :is(input, .btn)", "Reader URL row keeps a touch-primary floor on narrow");
test.assertIncludes(responsive, ".control-panel .control-chooser .system-tab", "Control Panel chooser tabs keep a touch-primary floor on narrow");
test.assertIncludes(responsive, "--alarm-clock-modes-height: var(--touch-primary-min-height)", "Alarm Clock mode strip keeps a touch-primary floor on narrow");
test.assertIncludes(responsive, "--calculator-keys-row-height: var(--touch-primary-min-height)", "Calculator keys keep a touch-primary row floor on narrow");
test.assertIncludes(responsive, "grid-template-columns: minmax(0, 1fr)", "narrow Finder-family grids collapse to one column");
test.assertIncludes(responsive, "min-height: var(--touch-primary-min-height)", "narrow harvest primaries keep a ≥48 touch-primary tap floor");

test.assertIncludes(wireup, "finderTapHintShown", "Finder select-then-open shows the first-use tap hint on touch");
test.assertIncludes(wireup, "alreadySelected", "Finder second tap on a coarse pointer opens the selected object");
test.assertIncludes(wireup, "revealSelectOpenTapHint(staticFinderTarget", "Finder reuses the shared select-open tap hint");
// Early-harvest H19: coarse select-then-open beyond Finder (desktop icons +
// Project CD), keeping the same first-use balloon / second-tap open grammar.
test.assertIncludes(wireup, "selectedDesktopIconEl === desktopIconTarget", "desktop icons use select-then-open on coarse pointers");
test.assertIncludes(wireup, "openDesktopIcon(desktopIconTarget)", "desktop second tap opens the selected icon");
test.assertIncludes(wireup, "revealSelectOpenTapHint(desktopIconTarget", "desktop first touch shows the tap-again balloon");
test.assertIncludes(balloon, "function revealSelectOpenTapHint", "one helper owns the select-open first-use balloon");
test.assertIncludes(balloon, "selectOpenTapHintShown", "the select-open balloon fires once across Finder-family surfaces");
const exportImport = read("app/features/export-import.js");
test.assertIncludes(exportImport, 'handleAction("open-teachtext")', "Project CD empty offers TeachText as next step");
test.assertIncludes(exportImport, "alreadySelected", "Project CD select-then-open is wired for coarse pointers");
test.assertIncludes(exportImport, "openProjectCdItemInReader(item)", "Project CD second tap opens the selected disc item");
test.assertIncludes(exportImport, "revealSelectOpenTapHint(button", "Project CD first select shows the shared tap-again balloon");
test.assertIncludes(documentsChat, "revealSelectOpenTapHint(", "Documents first select shows the shared tap-again balloon");
test.assertIncludes(projectDisk, "revealSelectOpenTapHint(", "Project Hard Disk first select shows the shared tap-again balloon");
test.assertIncludes(responsive, ".documents-toolbar #new-folder-name", "Documents narrow toolbar stacks the folder name field");
test.assertIncludes(responsive, ".project-finder-actions .select-wrap", "Project Hard Disk narrow pathbar stacks More+Go");
test.assertIncludes(responsive, '.desktop-icon[data-drop-target="project"].is-drag-over', "Project Hard Disk desk icon has a strong accept hit frame");
test.assertIncludes(responsive, '.desktop-icon[data-drop-target="project"].is-drop-reject', "Project Hard Disk desk icon has a strong refuse hit frame");
test.assertIncludes(responsive, '.finder-item[data-drop-target="droplet"].is-drag-over', "droplet Finder icons have a strong accept hit frame");
test.assertMatches(
  index,
  /id="desktop-file-floppy-starter"[^>]*data-drop-target="file-floppy"/,
  "unmounted File Floppy starter accepts outside files"
);

// Early-harvest C11–C13: system shell quiet feedback, rest/games host honesty,
// and context-dependent joyride/rootline/cmf menus (proposal v216 / v217 / v209).
test.assertIncludes(responsive, "Early-harvest C11", "harvest C11 system-shell narrow block is named");
test.assertIncludes(responsive, ".control-panel .control-wide-button", "C11 Control Panel primary goes full-width on narrow");
test.assertIncludes(responsive, ".notification-center-window .details-bar", "C11 System Messages chrome stacks on narrow");
test.assertIncludes(responsive, ".control-panel .control-strip-module-actions", "C11 Control Strip settings actions stack on narrow");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_notifications_empty_clear"', "C11 Clear names the empty System Messages reason");
test.assertIncludes(index, 'data-balloon-help-disabled="balloon_control_strip_select_module"', "C11 strip module verbs name select-first");
test.assertIncludes(windowManager, '"clear-notifications"', "C11 Clear is gated in action availability");
test.assertIncludes(wireup, "applyModernFonts()", "C11 Modern UI Font change re-applies immediately");
test.assertIncludes(wireup, "hydrateSystemIcons()", "C11 classic line-icon change re-renders icons");

const controlStrip = read("app/features/control-strip.js");
test.assertIncludes(controlStrip, 'classList.toggle("default", canEnable)', "C11 Enable is the one strip-settings primary while off");
test.assertIncludes(controlStrip, "balloon_control_strip_select_module", "C11 strip settings disable with a visible reason");

const persistenceStatus = read("app/core/persistence-status.js");
test.assertIncludes(persistenceStatus, "syncNotificationClearControl", "C11 empty System Messages greys Clear");
test.assertIncludes(persistenceStatus, "syncControlStripSettingsPanel", "C11 strip prefs restore re-renders the settings panel");
test.assertIncludes(persistenceStatus, "AISystem6ControlStrip?.renderSettings", "C11 strip state changes call renderSettings");

test.assertIncludes(balloon, "runtimeUnavailableReasonKey", "C13 menu balloons read runtime host-window reasons");
test.assertIncludes(balloon, '"clear-notifications": "balloon_notifications_empty_clear"', "C11 Clear is in the census reason map");

const joyride = read("app/features/joyride.js");
test.assertIncludes(joyride, "balloon_disabled_menu_host_window", "C13 Joyride greys with host-window reason");
test.assertIncludes(joyride, "unavailableReason: joyrideUnavailableReason", "C13 Joyride commands carry unavailableReason");
test.assertIncludes(joyride, "hostReady()", "C13 Joyride camera/radio require the host window");

const cmfStudio = read("app/features/cmf-studio.js");
test.assertIncludes(cmfStudio, "cmfStudioCommandAvailability", "C13 CMF names availability with reason");
test.assertIncludes(cmfStudio, "unavailableReason: () => cmfStudioCommandAvailability(action).reason", "C13 CMF registers unavailableReason");
test.assertIncludes(cmfStudio, "balloon_disabled_menu_host_window", "C13 CMF host-missing reason is honest");

const rootline = read("app/features/rootline.js");
test.assertIncludes(rootline, "balloon_disabled_menu_host_window", "C13 Rootline keeps host-window disable reason");

const micropolis = read("app/features/micropolis.js");
test.assertIncludes(micropolis, "unavailableReason:", "C12 Micropolis menu rows name why they are grey");
test.assertIncludes(micropolis, "balloon_disabled_menu_host_window", "C12 Micropolis host-missing is visible");

const bonsaiCity = read("app/features/bonsai-city.js");
test.assertIncludes(bonsaiCity, "unavailableReason:", "C12 Bonsai City menu rows name why they are grey");
test.assertIncludes(bonsaiCity, "balloon_disabled_menu_host_window", "C12 Bonsai host-missing is visible");

const mingwen = read("app/features/mingwen.js");
test.assertIncludes(mingwen, "mingwenCommandAvailability", "C12 Mingwen availability carries a reason");
test.assertIncludes(mingwen, "balloon_disabled_menu_host_window", "C12 Mingwen host-missing is visible");

const oneMoreTune = read("app/features/one-more-tune.js");
test.assertIncludes(oneMoreTune, 'reason: "balloon_disabled_menu_host_window"', "C12 rest/film uses the shared host-window reason");

const documentsChatSource = documentsChat;
test.assertIncludes(documentsChatSource, "alreadySelected", "Documents select-then-open is wired for coarse pointers");
test.assertIncludes(projectDisk, "alreadySelected", "Project Hard Disk select-then-open is wired for coarse pointers");
const fileDisk = read("app/features/file-disk.js");
test.assertIncludes(fileDisk, "openMountedTextFile(name)", "Text Disk second tap opens the selected mounted file");
test.assertIncludes(fileDisk, "revealSelectOpenTapHint(", "File Floppy first select shows the shared tap-again balloon");
const findPath = read("app/features/findpath.js");
test.assertIncludes(findPath, "openSelectedFindPathInReader()", "Searcher second tap opens the selected result");
test.assertIncludes(findPath, "openFindFileResult(result)", "Find File second tap opens the selected hit");
test.assertIncludes(findPath, "revealSelectOpenTapHint(", "Find File / Searcher first select shows the shared tap-again balloon");

const projectDisksCss = read("styles/98-project-disks.css");
test.assertIncludes(projectDisksCss, ".disk-peek-actions > .btn.default", "diskPeek narrow primary stays full-width");

// Early-harvest E5–E10 (proposal v216 leftovers + v217–v221): shell overlays,
// rest/games, DA/utility, import/help/lab, creative pads, about/info/sound/dict.
test.assertIncludes(responsive, "Early-harvest E5 leftovers", "harvest E5 shell leftover block is named");
test.assertIncludes(responsive, ".boot-failure-button-row", "E5 boot failure stacks on narrow");
test.assertIncludes(responsive, ".startup-settings-actions", "E5 startup settings stacks on narrow");
test.assertIncludes(responsive, ".boot-recovery-modal .finder-operation-actions", "E5 recovery actions stack on narrow");
test.assertIncludes(responsive, ".shutdown-screen .shutdown-ledger > .btn.default", "E5 shutdown Restart is full-width on narrow");
test.assertIncludes(responsive, ".writing-spine-panel .spine-actions button", "E5 journey spine keeps touch-primary taps on narrow");
test.assertIncludes(responsive, "Early-harvest E6–E10", "harvest E6–E10 narrow block is named");
test.assertIncludes(responsive, ".one-more-tune-window", "E6 rest One More Tune is in the narrow harvest set");
test.assertIncludes(responsive, ".joyride-window", "E6 Joyride is in the narrow harvest set");
test.assertIncludes(responsive, ".rootline-window", "E6 Rootline is in the narrow harvest set");
test.assertIncludes(responsive, ".bonsai-window", "E6 Bonsai is in the narrow harvest set");
test.assertIncludes(responsive, ".puzzle-window", "E6 Puzzle is in the narrow harvest set");
test.assertIncludes(responsive, ".finishing-receipt-window", "E7 finishing receipt is in the narrow harvest set");
test.assertIncludes(responsive, ".alarm-clock-window", "E7 Alarm Clock is in the narrow harvest set");
test.assertIncludes(responsive, ".calculator-window", "E7 Calculator is in the narrow harvest set");
test.assertIncludes(responsive, ".print-directory-window", "E7 Print Directory is in the narrow harvest set");
test.assertIncludes(responsive, ".dictation-window", "E7 Dictation is in the narrow harvest set");
test.assertIncludes(responsive, ".chooser-panel", "E7 Chooser is in the narrow harvest set");
test.assertIncludes(responsive, ".model-meter-window", "E7 Model Meter is in the narrow harvest set");
test.assertIncludes(responsive, ".import-utility-window #import-documents", "E8 Import Write primary goes full-width on narrow");
test.assertIncludes(responsive, ".system-help-window", "E8 System Help is in the narrow harvest set");
test.assertIncludes(responsive, ".writing-bell-window #writing-bell-start", "E8 Writing Bell Start is full-width on narrow");
test.assertIncludes(responsive, ".system-status-window #keep-projects-on-device", "E8 System Status Keep is full-width on narrow");
test.assertIncludes(responsive, ".save-chat-window", "E8 Save Chat is in the narrow harvest set");
test.assertIncludes(responsive, ".endfield-terminal-window", "E8 Endfield lab is in the narrow harvest set");
// ClioChart's narrow grammar is the same E9 set, but its sheet is lazy and
// loads after the shared responsive layer, so the rules live in
// styles/87-clio-chart.css (tests/features/clio-chart.test.mjs pins that).
test.assertIncludes(read("styles/87-clio-chart.css"), ".clio-chart-window", "E9 ClioChart is in the narrow harvest set, from its own lazy sheet");
test.assertIncludes(responsive, ".image-prompt-studio-window #ips-go", "E9 Image Prompt primary is full-width on narrow");
test.assertIncludes(responsive, ".clio-paint-window", "E9 ClioPaint is in the narrow harvest set");
test.assertIncludes(responsive, ".docmap-window #docmap-ask-button", "E9 DocMap Ask is full-width on narrow");
test.assertIncludes(responsive, ".clio-project-window", "E9 Plan / Clio Project is in the narrow harvest set");
test.assertIncludes(responsive, ".sideask-pad-window #sideask-pad-ask", "E9 SideAsk Ask is full-width on narrow");
test.assertIncludes(responsive, ".about-window .about-pane > .btn.default", "E10 About OK is full-width on narrow");
test.assertIncludes(responsive, ".info-window", "E10 Get Info / Proj Info are in the narrow harvest set");
test.assertIncludes(responsive, ".time-machine-window .time-machine-address-form", "E10 Time Machine chrome stacks on narrow");
test.assertIncludes(responsive, ".soundscape-window #soundscape-save-moment", "E10 Soundscape primary is full-width on narrow");
test.assertIncludes(responsive, ".dictionary-window .dictionary-actions > .btn.default", "E10 Dictionary Keep is full-width on narrow");

test.assert(
  !/id="scrap-multi-go"[^>]*\bdefault\b/.test(index) && !/class="btn default"[^>]*id="scrap-multi-go"/.test(index),
  "Scrapbook multi Do Selected is not a second content primary beside Insert"
);
test.assertIncludes(scrapbook, 'keep?.classList.toggle("default", !!active)', "Keep Reading becomes the one primary while a proposal is up");
test.assertIncludes(scrapbook, 'insert?.classList.toggle("default", !active)', "Insert yields the default while Keep Reading is live");

const accessories = read("app/features/teachtext-accessories.js");
test.assertIncludes(accessories, "function renderNotePadPage", "Note Pad pages re-render slip text and destination");
test.assertIncludes(accessories, "notePadPageLabelEl.textContent = t(\"note_pad_slip\"", "changing Note Pad page updates the visible slip label");

const dictionary = read("app/features/dictionary-help.js");
test.assertIncludes(dictionary, "renderDictionaryWords()", "Keeping a dictionary word re-renders the kept list");

test.assertIncludes(actions, '"play-writing-demo"', "Play Live Demo is a real command, not a grey pretend entry");
test.assertIncludes(actions, "playWritingDemoFromGuide", "Play Live Demo has a handler");
test.assertIncludes(app, 'action: "open-demo-disks"', "Demonstration Project Disks open a real disk panel");

const rebuild = read("app/features/rebuild-flow.js");
test.assertIncludes(rebuild, 'id="rebuild-flow-hand-in"', "Rebuild keeps Hand In as its route primary");
test.assert(
  /class="btn"[^>]*id="rebuild-flow-split"|id="rebuild-flow-split"[^>]*class="btn(?! default)"/.test(rebuild)
    && !/id="rebuild-flow-split"[^>]*\bdefault\b/.test(rebuild)
    && !/class="btn default"[^>]*id="rebuild-flow-split"/.test(rebuild),
  "Rebuild Split is not a second default beside Hand In"
);

const cover = read("app/features/liquid-cover.js");
test.assertIncludes(cover, 'id="lc-export"', "Cover Glass has one Export primary");
test.assertIncludes(cover, "balloon_cover_needs_image", "Cover export names the empty-state reason");

const ips = read("app/features/image-prompt-studio.js");
test.assertIncludes(ips, 'id="ips-go"', "Image Prompt Studio keeps one Write Prompt primary");

test.assertIncludes(index, 'id="connect-local-model"', "Control Panel local tab owns Connect");
test.assertIncludes(index, 'id="use-website-ai"', "Control Panel cloud tab owns Use Website AI");
test.assertIncludes(index, 'data-control-panel="local"', "local Connect lives in its own tab panel");
test.assertIncludes(index, 'data-control-panel="cloud"', "cloud AI lives in its own tab panel");

// --- Harvest U/V/W (Goal #2 residual · 2026-10-04) -------------------------
const reviewSections = read("app/core/review-sections.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
test.assertIncludes(reviewSections, "function openRegistrySource", "U4 registry Open Source is defined");
test.assertIncludes(reviewSections, "openCitationContextItem(registryContextItem)", "U4 registry Open Source uses the citation router");
test.assertIncludes(scrapbook, "openRegistrySource(source)", "U4 Scrapbook registry still calls openRegistrySource");
test.assertIncludes(documentsChat, 'action === "open"', "U5 empty Chat File keeps Open Chat as the primary path");
test.assertIncludes(documentsChat, 'openWindow("assistant")', "U5 empty Open Chat opens ClioTalk");
test.assertIncludes(translationsEn, 'chat_file_empty: "No messages yet"', "U5 Chat File empty copy is human");
test.assertIncludes(translationsZh, 'chat_file_empty: "还没有消息"', "U5 Chat File empty copy is human in Chinese");
test.assertIncludes(translationsEn, "finishing_receipt_empty:", "U6 finishing receipt empty copy exists");
test.assertIncludes(translationsZh, 'finishing_receipt_empty: "还没有回执"', "U6 finishing receipt empty copy is human in Chinese");
test.assertIncludes(translationsEn, "do not steal focus", "U6 notify empty copy names quiet focus");
test.assertIncludes(translationsZh, "通知不抢焦点", "U6 notify empty copy names quiet focus in Chinese");
test.assertIncludes(translationsEn, 'teachtext_empty: "No body text yet', "U7 TeachText empty is human");
test.assertIncludes(translationsZh, 'teachtext_empty: "还没有正文', "U7 TeachText empty is human in Chinese");
test.assertIncludes(translationsZh, 'outline_tree_empty: "还没有大纲树', "U7 Outline empty tree is human");
test.assertIncludes(translationsZh, 'review_desk_requires_final: "还没有审校', "U7 Review empty is human");
test.assertIncludes(chatMessages, 'setStatus(t("stopped"))', "V8 image abort leaves a visible stopped status");
test.assertIncludes(index, 'data-i18n="clio_composer_key_hint">Shift+Enter for a new line', "V8 composer key hint is not a second Send CTA");
test.assert(
  (index.match(/id="send"/g) || []).length === 1,
  "V8 ClioTalk has exactly one Send control"
);
test.assertIncludes(translationsZh, 'reader_empty_hint: "还没有打开来源', "V9 Reader empty matches proposal");
test.assertIncludes(scrapbook, 't("no_scraps_sources")', "V9 Scrapbook empty follows stack filter");
test.assertIncludes(index, 'data-object-picker="0"', "V10 Chooser is marked not an object picker");
test.assertIncludes(index, 'data-i18n="chooser_not_object_picker"', "V10 Chooser honesty note is present");
test.assertIncludes(index, 'data-i18n="control_preferences_note"', "W11 Control Panel preferences note rejects personality labels");
test.assertIncludes(desktopRuntime, "project_mount_failed", "W12 Startup Disk mount failure has visible status");
test.assertIncludes(scrapbook, "restoreTrashButton.hidden = true", "W13 Trash keeps Restore hidden");
test.assertIncludes(scrapbook, "emptyTrashButton.hidden = true", "W13 Trash keeps Empty hidden");
test.assertIncludes(index, 'id="restore-trash" hidden disabled', "W13 Restore is not a dual primary");
test.assertIncludes(index, 'id="empty-trash" hidden disabled', "W13 Empty is not a dual primary");

test.assertIncludes(translationsZh, 'search_answer_note: "这是模型短答，不是证据', "Z6 Searcher answer is not evidence");
test.assertIncludes(findPath, 'data-evidence", "0"', "Z6 Searcher marks the model answer as not evidence");
test.assertIncludes(translationsZh, 'find_file_empty: "还没有搜索', "Z6 empty Find File query is not a full scan");
test.assertIncludes(index, 'data-i18n="search">Search</button>', "Z6 Find File primary uses search (zh 搜索)");
test.assertIncludes(translationsZh, 'reveal_in_project_disk: "在项目硬盘中显示"', "Z6 Find File reveal bypass is Chinese");
test.assertIncludes(translationsZh, 'docmap_visual_failed: "结构图没能画出来', "Z6 DocMap visual failure is visible");
test.assertIncludes(docmap, "data-failed", "Z6 DocMap visual failure stays in the existing empty note");
test.assertIncludes(translationsZh, 'review_lens_hint_style: "像被代言', "Z7 Review mouthpiece hint has no score");
test.assertIncludes(translationsZh, "建议不会写入正文", "Z7 Review empty says suggestions stay off the manuscript");
test.assertIncludes(windowManager, 'draftBodyInput?.value || "").trim()', "Z7 empty Section Drafts greys To Manuscript");

// --- Harvest v448 (Goal #2 shell residual) --------------------------------
// One reason per grey control across windows the v437–v446 batches did not
// cover: Reader, Time Machine, Soundscape, Dictation Pad, ClioStage, Hold
// That Thought, To Do DA, Rebuild Flow, the cloud subpanel, and the shared
// Ask bar. Each assertion names the shell helper the module uses and the copy
// that resolves, so a raw identifier can never reach the balloon.
const readerModule = read("app/features/reader.js");
const clioStageModule = read("app/features/clio-stage.js");
const holdThoughtModule = read("app/features/hold-that-thought.js");
const todoDaModule = read("app/features/todo-da.js");
const rebuildFlowModule = read("app/features/rebuild-flow.js");
const cloudModelModule = read("app/features/cloud-model.js");
const askBarModule = read("app/core/ask-bar.js");

test.assertIncludes(balloon, "textarea:disabled, input:disabled, select:disabled", "grey non-button fields are reachable by the shared one-tap explainer");
test.assertIncludes(askBarModule, '"balloon_ask_bar_needs_source"', "the shared Ask bar names what a grey question is missing");
test.assertIncludes(readerModule, "function readerMarkGray", "Reader owns one grey helper for its document controls");
test.assertIncludes(readerModule, '"balloon_reader_needs_document"', "Reader DocMap/Send/Find say to open an article first");
test.assertIncludes(timeMachine, '"balloon_time_machine_forward"', "Time Machine Forward names the end of the visit history");
test.assertIncludes(timeMachine, '"balloon_time_machine_day_outside"', "Time Machine calendar days off the saved range say why");
test.assertIncludes(read("app/features/soundscape.js"), '"soundscape_empty_queue"', "Soundscape transport greys on the existing empty-queue copy");
test.assertIncludes(read("app/features/dictation-pad.js"), '"balloon_dictation_needs_raw"', "Dictation Shape/Organize say to speak or paste first");
test.assertIncludes(clioStageModule, '"balloon_clio_stage_slide_mode"', "ClioStage paging says to switch to Slide or Cue");
test.assertIncludes(holdThoughtModule, '"balloon_hold_empty_first"', "Hold That Thought's held fields say to hold a thought first");
test.assertIncludes(todoDaModule, "balloon_todo_no_done", "To Do's Remove Done says nothing is finished yet");
test.assertIncludes(rebuildFlowModule, '"balloon_disabled_rebuild_merge"', "Rebuild Merge reuses the shared merge reason");
test.assertIncludes(cloudModelModule, '"balloon_cloud_needs_provider"', "the cloud Check names the missing provider or key");
const exportImportModule = read("app/features/export-import.js");
test.assertIncludes(exportImportModule, '"balloon_project_cd_select_first"', "Project CD item actions say to choose an item first");
test.assertIncludes(exportImportModule, '"balloon_project_cd_stop_locked"', "Project CD's grey burn stop says to mark the manuscript final first");

const shellKeys = [
  "balloon_disabled_working",
  "balloon_ask_bar_needs_source",
  "balloon_dictation_not_recording",
  "balloon_dictation_needs_raw",
  "balloon_dictation_nothing_to_clear",
  "balloon_dictation_nothing_to_insert",
  "balloon_dictation_needs_clean",
  "balloon_time_machine_calendar",
  "balloon_time_machine_back",
  "balloon_time_machine_forward",
  "balloon_time_machine_stop",
  "balloon_time_machine_reader_view",
  "balloon_time_machine_day_outside",
  "balloon_clio_stage_needs_slides",
  "balloon_clio_stage_slide_mode",
  "balloon_clio_stage_first_slide",
  "balloon_clio_stage_last_slide",
  "balloon_todo_no_done",
  "balloon_rebuild_split_needs_source",
  "balloon_cloud_needs_key",
  "balloon_cloud_needs_provider",
  "balloon_reader_needs_document",
  "balloon_project_cd_select_first",
  "balloon_project_cd_nothing_to_clear",
];
shellKeys.forEach((key) => {
  test.assertIncludes(translationsEn, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese copy exists for ${key}`);
});

// --- Harvest v450 (Goal #2 shell residual) --------------------------------
// One reason per grey control across windows the v437–v449 batches did not
// cover: Writing Flow's Section Drafts picker, ClioProject's stamp checkbox,
// Quick Draft Listen's unavailable transport and darkroom footer, the shared
// tab-stack close, Image Prompt Studio's reference picker, ClioPaint history,
// the NeXTSTEP shelf, Rootline, One More Tune and Bonsai City. Each assertion
// names the helper or the copy the control resolves through.
const clioProjectModule = read("app/features/clio-project-window.js");
const quickDraftListenModule = read("app/features/quick-draft-listen.js");
test.assertIncludes(writingFlow, "function markDraftSectionSelect", "Writing Flow owns one grey helper for the Section Drafts picker");
test.assertIncludes(writingFlow, '"balloon_draft_needs_section"', "the grey Section Drafts picker says a section comes first");
test.assertIncludes(clioProjectModule, 'check.dataset.balloonHelpDisabled = "clio_project_fact_awaiting_stamp"', "an unstamped plan fact says why it cannot be ticked");
test.assertIncludes(quickDraftListenModule, "quick_draft_listen_no_voice", "the Listen transport explains an unavailable voice");
test.assertIncludes(composition, "function markDarkroomAction", "the darkroom footer greys through one shared helper");
test.assertIncludes(composition, '"balloon_qd_develop_needs_preview"', "Develop says a proof comes first");
test.assertIncludes(composition, '"balloon_qd_darkroom_readonly"', "Develop says when the manuscript holds the pen");
test.assertIncludes(projectDisk, '"balloon_last_tab_keeps_open"', "the last open tab's close explains why it is grey");
test.assertIncludes(ips, '"ips_ref_unavailable_cloud"', "Image Prompt's reference picker names the vision-model reason");
test.assertIncludes(read("app/features/clio-paint.js"), "markGrayAffordance(button, !canRun, control.emptyKey)", "ClioPaint history greys with its empty-history reason");
test.assertIncludes(finderColumns, '"balloon_nextstep_shelf_needs_item"', "the NeXTSTEP shelf Add says to select something first");
test.assertIncludes(rootline, '"balloon_rootline_no_interchange"', "the interchange upgrade names the empty allowance");
test.assertIncludes(rootline, "const markGray =", "Rootline greys its game keys through one helper");
test.assertIncludes(oneMoreTune, "balloon_omt_clip_needs_audio", "Audition from 0:00 says choose audio first");
test.assertIncludes(oneMoreTune, "balloon_omt_no_cards", "Start a round says the set has no playable card yet");
test.assertIncludes(bonsaiCity, '"balloon_bonsai_nothing_to_undo"', "Bonsai undo says there is nothing to undo yet");
test.assertIncludes(bonsaiCity, '"balloon_bonsai_terrain_only"', "Bonsai's rail says only terrain works before founding");
test.assertIncludes(bonsaiCity, "const markGray =", "Bonsai greys its city keys through one helper");
test.assertIncludes(read("app/features/bonsai-translations.js"), "balloon_bonsai_flip_unaffordable", "Bonsai's flip confirm names the shortfall reason");

const v450Keys = [
  "balloon_nextstep_shelf_needs_item",
  "balloon_last_tab_keeps_open",
  "balloon_qd_darkroom_needs_body",
  "balloon_qd_darkroom_readonly",
  "balloon_qd_preview_needs_layer",
  "balloon_qd_develop_needs_preview",
  "balloon_omt_clip_needs_audio",
  "balloon_omt_no_cards",
  "balloon_rootline_pause_planning",
  "balloon_rootline_pause_not_playing",
  "balloon_rootline_slot_locked",
  "balloon_rootline_no_stock",
  "balloon_rootline_no_vehicles",
  "balloon_rootline_needs_vehicle",
  "balloon_rootline_no_carriages",
  "balloon_rootline_no_interchange",
];
v450Keys.forEach((key) => {
  test.assertIncludes(translationsEn, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese copy exists for ${key}`);
});

const bonsaiTranslations = read("app/features/bonsai-translations.js");
["balloon_bonsai_needs_city", "balloon_bonsai_nothing_to_undo", "balloon_bonsai_nothing_to_redo", "balloon_bonsai_flip_unaffordable", "balloon_bonsai_terrain_only"].forEach((key) => {
  test.assertIncludes(bonsaiTranslations, `${key}:`, `Bonsai carries ${key}`);
});

test.finish();
