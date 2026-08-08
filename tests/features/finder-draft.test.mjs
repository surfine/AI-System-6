// 钟点稿 / Quick Draft is a fast-draft surface: the writing board comes first,
// ClioTalk carries organize/draft/polish commands, and research/checking
// details stay behind the first-screen drafting path.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-draft");

const html = read("index.html");
const app = read("app.js");
const actions = read("app/core/actions.js");
const config = read("app/core/config.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const boot = read("app/core/boot.js");
const multiFinder = read("app/core/multi-finder.js");
const windowManager = read("app/core/window-manager.js");
const workingSession = read("app/core/working-session.js");
const wireup = read("app/core/wireup.js");
const chatMessages = read("app/core/chat-messages.js");
const documentsChat = read("app/features/documents-chat.js");
const systemIcons = read("app/core/system-icons.js");
const manifest = read("scripts/runtime-manifest.mjs");
const feature = read("app/features/finder-draft.js");
const grainDiff = read("app/core/grain-diff.js");
const draftRoute = read("src/server/routes/draft-thesis.js");
const appsCss = read("styles/50-apps.css");

const quickWindowIndex = html.indexOf('data-window="quickDraft"');
const quickWindowHtml = html.slice(quickWindowIndex, html.indexOf('data-window="cmfStudio"', quickWindowIndex));
const sidebarIndex = html.indexOf('class="quick-draft-card-sidebar"', quickWindowIndex);
const editorIndex = html.indexOf('class="quick-draft-editor"', quickWindowIndex);
const rebootIndex = html.indexOf('class="quick-draft-layout quick-draft-reboot"', quickWindowIndex);
const legacyBackingIndex = html.indexOf('class="quick-draft-legacy-backing"', quickWindowIndex);
const chatImportIndex = html.indexOf('data-action="quick-draft-import-chat"');

test.assertIncludes(html, 'data-window="quickDraft"', "Quick Draft has a named System 6 window");
test.assertIncludes(html, 'data-action="open-quick-draft"', "Quick Draft keeps the existing Finder entry");
test.assert(!html.includes('name="startup-open" value="quick-draft"'), "Startup settings keep Quick Draft user-opened");
test.assertIncludes(actions, '"open-quick-draft": openQuickDraft', "Action table routes Quick Draft");
test.assertMatches(manifest, /lazyRuntimePaths[\s\S]*"app\/features\/finder-draft\.js"/, "Quick Draft module is lazy");
test.assertNotIncludes(manifest.match(/appModulePaths[\s\S]*?];/)?.[0] || "", "app/features/finder-draft.js", "Quick Draft is not in the startup bundle");
test.assertMatches(config, /tileableWindowNames[\s\S]*"quickDraft"/, "Quick Draft participates in window tiling");
test.assertMatches(config, /resizableWindowNames[\s\S]*"quickDraft"/, "Quick Draft is resizable");
const openStartupItemsSource = desktopRuntime.slice(
  desktopRuntime.indexOf("function openStartupItems()"),
  desktopRuntime.indexOf("function normalizeStartupOpenedWindowNames()")
);
test.assert(!openStartupItemsSource.includes('handleAction("open-quick-draft")'), "Startup never opens Quick Draft directly");
test.assert(!boot.includes('runtimeEnvironment === "finder" && startupOpenMode === "quick-draft"'), "Finder restore does not reopen Quick Draft");
test.assertIncludes(workingSession, 'entry.name === "quickDraft"', "Working Session repairs unusable Quick Draft frames");
test.assertIncludes(multiFinder, 'quickDraft: "writingStudio"', "MultiFinder groups Quick Draft under Writing Studio");
test.assertNotIncludes(multiFinder, 'quickDraft: "Quick Draft"', "MultiFinder does not present Quick Draft as a separate application");

test.assert(editorIndex > 0 && sidebarIndex < 0, "Quick Draft reboot removes the visible background-check sidebar");
test.assert(rebootIndex > 0, "Quick Draft uses the rebooted TeachText fast-draft shell");
test.assert(legacyBackingIndex > editorIndex, "Legacy compatibility nodes are hidden behind the new editor shell");
test.assertIncludes(html, 'class="quick-draft-legacy-backing" hidden aria-hidden="true"', "Old card-field plumbing is hidden from the user path");
test.assertNotIncludes(html, 'quick-draft-card-sidebar', "Quick Draft no longer renders the failed card sidebar");
test.assertNotIncludes(html, 'quick-draft-teachtext-strip', "Quick Draft no longer renders the failed setup strip");
test.assertIncludes(html, '<h2 id="quick-draft-title" data-i18n="quick_draft_title">Quick Draft</h2>', "Quick Draft uses the title bar for the derived draft title");
test.assertIncludes(html, 'class="quick-draft-status-center"', "Format and length live in the middle of the window status bar");
test.assertNotIncludes(quickWindowHtml, 'id="quick-draft-title-display"', "Derived title no longer consumes status-bar space");
test.assertIncludes(quickWindowHtml, '<span id="quick-draft-stats">0 words · ~0 sec</span>', "Status bar puts draft size on the left");
test.assert(quickWindowHtml.indexOf('id="quick-draft-stats"') < quickWindowHtml.indexOf('class="quick-draft-status-center"'), "Draft size appears before the centered setup controls");
test.assert(quickWindowHtml.indexOf('class="quick-draft-status-center"') < quickWindowHtml.indexOf('id="quick-draft-status"'), "Command feedback appears on the right side of the status bar");
test.assertNotIncludes(quickWindowHtml, 'class="quick-draft-status-subject"', "Quick Draft no longer exposes a separate subject input");
test.assertNotIncludes(quickWindowHtml, 'data-i18n="quick_draft_start_title"', "First screen no longer repeats the 30-minute draft explainer");
test.assertNotIncludes(quickWindowHtml, 'data-i18n="quick_draft_start_hint"', "First screen removes the extra instruction line");
test.assertNotIncludes(quickWindowHtml, 'id="quick-draft-save-state" data-i18n', "Visible status bar no longer shows project save state");
test.assertNotIncludes(quickWindowHtml, 'id="quick-draft-source-count">0 sources', "Visible status bar no longer shows source count");
test.assertNotIncludes(quickWindowHtml, 'id="quick-draft-status" data-i18n', "Visible status bar no longer shows generic readiness");
test.assertIncludes(html, 'class="quick-draft-two-pane"', "Quick Draft uses a two-pane material/body editor");
test.assertIncludes(html, 'class="quick-draft-material-pane" for="quick-draft-sources"', "Left pane is the material input");
test.assertIncludes(html, 'class="quick-draft-body-pane" for="quick-draft-draft"', "Right pane is the body input");
test.assert(html.indexOf('id="quick-draft-format"', quickWindowIndex) < html.indexOf('id="quick-draft-tools"', quickWindowIndex), "Format, length, and subject moved into the status bar");
test.assertNotIncludes(quickWindowHtml, 'data-i18n="quick_draft_first_impression_required"', "First impression is no longer a visible required field");
test.assertIncludes(html, 'id="quick-draft-first-impression"', "First impression compatibility state remains hidden for old records");
test.assertIncludes(html, 'id="quick-draft-adopt-impression"', "Talk-point candidates can be explicitly adopted");
test.assertNotIncludes(quickWindowHtml, 'id="quick-draft-start-writing"', "Standalone Draft button is removed from the footer");
test.assertIncludes(html, 'id="quick-draft-confirm-hands-on"', "Hands-on candidates stay available to logic");
test.assertNotIncludes(html, 'id="quick-draft-official-summary"', "Boundary shows each category once (no duplicate glance-and-textarea)");
test.assertNotIncludes(html, 'class="quick-draft-manual-edit"', "Manual classification editing moved into the draft spine");
test.assertIncludes(html, 'id="quick-draft-dump"', "Dump card keeps replaced body material");
test.assertIncludes(html, 'id="quick-draft-restore-dump"', "Dump card can restore material to the body");
test.assertIncludes(html, 'id="quick-draft-editorial-strategy"', "Strategy card renders editorial strategy");
test.assertIncludes(html, 'id="quick-draft-material-ledger"', "Strategy card renders material ledger");
test.assertIncludes(html, 'id="quick-draft-adoption-table"', "Strategy card renders adoption table");

test.assertIncludes(html, 'class="teachtext-editor-container quick-draft-editor-container', "Quick Draft editor reuses TeachText editor container");
test.assertIncludes(html, 'id="quick-draft-preview" class="teachtext-preview is-hidden"', "Quick Draft has TeachText-style preview");
test.assertIncludes(html, 'data-mde-focus-cycle data-mde-target="#quick-draft-draft"', "Quick Draft reuses markdown focus mode");
test.assertIncludes(html, 'id="quick-draft-toggle-preview"', "Quick Draft exposes Preview");
test.assertIncludes(html, 'data-mde-target="#quick-draft-draft" data-i18n-aria-label="teachtext_focus_off"', "Quick Draft keeps a complete accessible focus-state label beside its short phone label");
test.assertIncludes(html, 'class="mobile-control-short" data-i18n="more"', "Quick Draft uses a compact localized Commands label on phone");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-save" data-i18n="quick_draft_start_writing"', "Visible editor makes Draft the primary button");
test.assertIncludes(html, 'id="quick-draft-tools" class="teachtext-command-menu quick-draft-command-menu"', "Commands palette is per-window");
test.assertIncludes(quickWindowHtml, 'data-i18n="quick_draft_command_intake"', "Main command menu groups material intake first");
test.assertIncludes(quickWindowHtml, 'data-action="quick-draft-import-chat"', "Main command menu keeps chat-record import");
test.assertIncludes(quickWindowHtml, 'data-i18n="quick_draft_command_write"', "Main command menu groups drafting actions");
test.assertIncludes(quickWindowHtml, 'data-i18n="quick_draft_command_review"', "Main command menu groups launch-day review actions");
test.assertIncludes(quickWindowHtml, 'data-i18n="quick_draft_command_delivery"', "Main command menu groups delivery actions");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="organize"', "Main command menu owns Organize");
test.assertNotIncludes(quickWindowHtml, 'data-quick-draft-chat-action="draft"', "Main command menu no longer duplicates the primary Draft button");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="mingming"', "Main command menu owns Mingming fast review");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="luoluo"', "Main command menu owns Luoluo receiving review");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="hkrr"', "Main command menu owns HKRR lift");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="praise"', "Main command menu owns encouragement");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-delivery="teachtext"', "Main command menu can send the draft to TeachText");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-delivery="copy-markdown"', "Main command menu can copy Markdown");
test.assertNotIncludes(quickWindowHtml, 'data-i18n="quick_draft_import_materials"', "Main command menu no longer owns generic import actions");
test.assertNotIncludes(quickWindowHtml, 'data-i18n="quick_draft_delivery"', "Commands no longer expose delivery actions");
test.assert(html.indexOf('id="quick-draft-sources"', quickWindowIndex) < html.indexOf('id="quick-draft-tools"', quickWindowIndex), "Material input is a main editor pane, not a command-menu textarea");
test.assertNotIncludes(quickWindowHtml, 'data-i18n="quick_draft_use_mounted"', "Commands no longer offer mounted-source ingestion");
test.assertNotIncludes(html, 'id="quick-draft-collect-vent"', "Old organize button stays retired");
test.assertNotIncludes(html, 'id="quick-draft-write"', "Draft action is retired from the editor chrome");
test.assertNotIncludes(html, 'id="quick-draft-brief"', "Brief action is retired from the editor chrome");
test.assertNotIncludes(html, 'id="quick-draft-ask-cliotalk"', "Ask ClioTalk button is removed because ClioTalk is permanent");

test.assertIncludes(html, 'value="first-day-hands-on"', "UI offers First-Day Hands-on");
test.assertIncludes(html, 'value="hands-on-review"', "UI offers Hands-on Review");
test.assertIncludes(html, 'value="bili-dynamic"', "UI offers Bilibili post");
test.assertNotIncludes(html, 'value="bili-video"', "Thesis script is retired from UI");
test.assertNotIncludes(html, 'value="spoken-outline"', "Spoken outline is retired from UI");
test.assertIncludes(html, 'value="7m"', "Launch scripts offer ~7 minutes");
test.assertIncludes(html, 'value="12m"', "Launch scripts offer ~12 minutes");
test.assertIncludes(html, 'value="140w"', "Bilibili post offers ~140 words");
test.assertIncludes(html, 'value="280w"', "Bilibili post offers ~280 words");
test.assertIncludes(html, 'value="500w"', "Bilibili post offers ~500 words");
test.assertNotIncludes(quickWindowHtml, '800', "Bilibili post UI does not offer 800 words");
test.assertNotIncludes(quickWindowHtml, '1000', "Bilibili post UI does not offer 1000 words");
test.assertNotIncludes(feature, "appendCommandResultToSources", "Quick Draft command feedback no longer pollutes the left material pane");
test.assertNotIncludes(feature, "refs.firstImpression?.focus()", "Drafting no longer blocks on a visible first-impression gate");
test.assertIncludes(documentsChat, "window.AISystem6QuickDraft?.clearVentLog?.({ silent: true })", "Clearing ClioTalk also clears Quick Draft treehole notes");
test.assertNotIncludes(feature, "draftFromChatRecords", "Quick Draft no longer keeps a hidden chat-draft path");
test.assertNotIncludes(feature, 'taskKind: "draft-from-chat-records"', "Quick Draft client no longer sends a dedicated chat-draft task kind");
test.assertNotIncludes(feature, "missing_first_impression", "First-impression gate is removed from the client flow");
test.assertNotIncludes(feature, "localStorage", "Quick Draft does not add localStorage persistence");
test.assertNotIncludes(feature, "indexedDB", "Quick Draft does not add IndexedDB stores");

test.assertNotIncludes(html, 'id="quick-draft-cliotalk-slot"', "Quick Draft no longer owns an internal ClioTalk sidebar slot");
test.assertNotIncludes(windowManager, 'const launchDaySplit = sourceWindowName === "quickDraft"', "Quick Draft no longer has a specialized integrated SideAsk layout");
test.assertMatches(windowManager, /function dockAssistantInQuickDraft\(\) \{\s*return false;\s*\}/, "Quick Draft no longer docks ClioTalk into the draft window");
test.assertNotIncludes(windowManager, 'refreshedAssistant.classList.add("is-hidden")', "Quick Draft keeps the shared assistant visible as a normal SideAsk window");
test.assertIncludes(windowManager, 'sideAskAnchorAppId === "quickDraft"', "Window manager recognizes Quick Draft SideAsk");
test.assertNotIncludes(windowManager, 'classList.toggle("is-quick-draft-sideask"', "Quick Draft no longer gives ClioTalk special chrome");
test.assertIncludes(app, 'sideAskAnchorAppId === "quickDraft"', "Prompt placeholder switches in Quick Draft SideAsk");
test.assertIncludes(html, 'data-window="assistant"', "ClioTalk remains the shared assistant window outside Quick Draft");
test.assert(quickWindowHtml.includes('data-action="quick-draft-import-chat"'), "Quick Draft command menu owns chat-record import");
test.assertNotIncludes(html, 'id="compose-tools-quick-draft"', "ClioTalk no longer owns the writing command group");
test.assertNotIncludes(html, 'id="quick-draft-cliotalk-chips"', "ClioTalk action chips are removed in favor of typed keywords + the command menu");
test.assertIncludes(actions, "quick-draft-import-chat", "Add menu can trigger Quick Draft chat-record import");
test.assertIncludes(html, 'data-system-icon="chatImport"', "Chat-record import has a dedicated System icon");
test.assertIncludes(app, 'iconId: "quickDraft"', "Quick Draft has its own Applications icon, not TeachText's");
test.assertIncludes(systemIcons, "quickDraft", "System icon set draws the Quick Draft clock icon");
test.assertIncludes(systemIcons, "chatImport", "System icon set draws the chat-record import icon");
test.assertIncludes(html, 'id="quick-draft-cliotalk-hint"', "ClioTalk status bar hints which keywords can be typed");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="vent-on"', "Command menu can enter treehole mode");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="vent-off"', "Command menu can end treehole mode");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="vent-summary"', "Command menu can summarize treehole notes");
test.assertNotIncludes(quickWindowHtml, 'data-quick-draft-chat-action="chat-draft"', "Command menu does not expose a second chat-draft entry");
test.assertIncludes(html, 'class="compose-tools-general" type="button" role="menuitem" data-action="open-import-utility"', "ClioTalk Add menu keeps Project Hard Disk");
test.assertIncludes(html, 'class="compose-tools-general" type="button" role="menuitem" data-action="open-rag"', "ClioTalk Add menu keeps File Floppy");
test.assertIncludes(html, 'class="compose-tools-quick-draft-import is-hidden"', "Legacy ClioTalk Add chat-import item stays hidden");
test.assertIncludes(wireup, 'data-quick-draft-chat-action', "Typed/side menu Quick Draft actions still route through shared chat dispatch when used there");
test.assertIncludes(chatMessages, 'anchor === "quickDraft"', "ClioTalk SideAsk recognizes Quick Draft as a paired source");
test.assertNotIncludes(chatMessages, "聊天出稿", "ClioTalk typed commands no longer expose chat drafting as a second entrance");
test.assertIncludes(chatMessages, "do not generate or replace the user's personal judgment", "ClioTalk preserves the user's feeling");
test.assertIncludes(chatMessages, "organize only classifies and offers candidates", "ClioTalk organize turn does not draft");
test.assertIncludes(draftRoute, "必须给 5 条", "ClioTalk organize route forces five fast talk points");
test.assertIncludes(draftRoute, "能拍 / 只能嘴过 / 不能下结论 / 这一期想说", "Draft route triages Luoluo launch material into four practical bins");
test.assertIncludes(draftRoute, "落落是男生。涉及落落时只能使用“他/他的”，禁止使用“她/她的”。", "Luoluo-related Quick Draft prompts lock Luoluo to male pronouns");
test.assertIncludes(feature, "落落是男生，只能用“他/他的”，禁止用“她/她的”", "Client-side encouragement command reminds the model that Luoluo is male");
test.assertNotIncludes(draftRoute, "素材账本", "Draft route no longer asks for a material ledger heading");
test.assertNotIncludes(draftRoute, "missing_first_impression", "Draft route no longer requires a separate first-impression field");
test.assertIncludes(draftRoute, "不能替用户生成个人感受", "Draft route preserves the no-AI-feeling guardrail");

// Compression grain: a read-only provenance view. A lossy rewrite leaves no
// visible seam, so the body is compared against the human anchor and the
// model's share is drawn differently from the writer's own words.
test.assertIncludes(html, 'id="quick-draft-toggle-grain"', "Quick Draft has a compression-grain toggle next to Preview");
test.assertIncludes(html, 'data-i18n="quick_draft_grain"', "The grain toggle takes its label from the translation tables");
test.assertIncludes(manifest, '"app/core/grain-diff.js"', "The grain diff module is eager in the runtime manifest");
test.assertMatches(feature, /renderQuickDraftGrain[\s\S]*quick-draft-grain-model/, "The grain view marks the model's share with its own class");
test.assertMatches(feature, /renderQuickDraftGrain[\s\S]*quick_draft_grain_passes/, "The grain view reports how many model rewrites the body carries");
// Generation depth: the vent log already keeps the body each model pass
// replaced, so the version chain is read from there rather than newly stored.
test.assertMatches(feature, /grainVersionChain[\s\S]*dumpEntries\(intakeSnapshot\(record\)\)/, "The version chain reuses the vent-log dumps instead of a new store");
test.assertNotIncludes(feature, "chain.passes - introduced + 1", "The generation composition lives in grain-diff.js, where it is executed by a test");
test.assertNotIncludes(feature, "function grainSmoothMask", "The pure diff functions live in grain-diff.js, not the feature module");
test.assertNotIncludes(feature, "function grainCollapseRewritten", "The pure diff functions live in grain-diff.js, not the feature module");
test.assertMatches(feature, /run\.generation > 1[\s\S]*quick-draft-grain-generation/, "Only stacked rewrites get a generation badge");
test.assertNotIncludes(feature, "grainEditable", "The grain view stays read-only");

// A draft written from an empty body must still record the negative boundary,
// and must keep it. Both write paths set the anchor on the first model pass
// whether or not there was a previous body, and both ask the timestamp — not
// the anchor text — whether a negative already exists. Asking the text let the
// second pass overwrite an empty negative with the model's own output, so the
// model's words were then reported as the writer's.
test.assertIncludes(feature, "function hasRecordedNegative", "One predicate answers whether a negative was recorded");
test.assertMatches(feature, /hasRecordedNegative[\s\S]{0,320}workspace\.humanAnchorUpdatedAt/, "The predicate reads the anchor timestamp, not the anchor text");
test.assertNotIncludes(feature, "if (!humanAnchorSnapshot()) {", "No write path decides the negative from the anchor text");
test.assertMatches(
  feature,
  /if \(!hasRecordedNegative\(\)\) \{\s*\n\s*patch\.workspace\.humanAnchor = previousBody;/g,
  "The write paths record the anchor even when the previous body is empty"
);
test.assert(
  (feature.match(/if \(!hasRecordedNegative\(\)\)/g) || []).length === 2,
  "Both model write paths record the negative"
);
test.assertIncludes(grainDiff, "function grainChainFromRecordParts", "The version-chain rule is pure, so a test can execute it");
test.assertIncludes(grainDiff, 'bornEmpty\n    ? ["", ...stored]', "An empty negative is put back at the head of the chain");
test.assertIncludes(feature, "quick-draft-grain-line", "The grain view renders the body line by line so masks can mark the margin");

// Adjustment layers: 明明传球 / 洛洛接球 / HKRR 抬升 carry a switch and a
// strength parameter, live in the existing workspace record (no new store),
// and the strength travels with the request to scale that one pass — a layer
// reads the negative, never another layer's output.
test.assertIncludes(manifest, '"app/core/adjustment-layers.js"', "The adjustment-layer module is eager in the runtime manifest");
test.assertIncludes(feature, "data-quick-draft-adjustment-mask]", "the mask input is part of the layer controls");
test.assertIncludes(html, 'data-quick-draft-adjustment-enabled="mingming"', "Mingming Pass has an on/off switch");
test.assertIncludes(html, 'data-quick-draft-adjustment-strength="hkrr"', "HKRR Lift has a strength control");
test.assertIncludes(html, 'data-quick-draft-adjustment-mask="mingming"', "Mingming Pass has a line-range mask");
test.assertIncludes(html, 'data-quick-draft-adjustment-move="mingming"', "layers expose a move control");
test.assertIncludes(draftRoute, "never another layer", "adjustment layers never read another layer's output");
test.assertIncludes(draftRoute, "只针对第", "the route scopes advice to the masked lines");
test.assertIncludes(draftRoute, "review only lines", "the English route copy scopes advice to the masked lines");

// 文字亮室 Task 0 — the fast path is pinned before anything moves. The route
// from an empty draft to a body must not grow a step or a model call, and
// develop/export must stay reachable from the article surface without
// visiting any other view. Quick Draft exists to turn material into a draft
// in one sitting; the darkroom must never stand between the writer and the
// first draft.
const draftPathSource = feature.slice(
  feature.indexOf("async function requestMingmingQuickDraft"),
  feature.indexOf("function quickDraftDocumentMarkdown")
);
test.assert(
  (draftPathSource.match(/fetchModelPayload\(/g) || []).length === 1,
  "the fast path from an empty draft to a body is exactly one model request"
);
test.assertNotIncludes(draftPathSource, "applyAdjustmentLayers", "the fast path never warms up the adjustment stack");
test.assertNotIncludes(draftPathSource, "requestQuickDraft(", "the fast path does not chain a second drafting command");
test.assertNotIncludes(draftPathSource, "openWindow(", "the fast path does not visit another view to produce a body");
test.assertNotIncludes(draftPathSource, "quick_draft_apply_none", "the fast path never gates on the adjustment stack");
test.assertNotIncludes(draftPathSource, "quick_draft_protect_no_selection", "protection is never a required setup step");
test.assertNotIncludes(draftPathSource, "canvas", "the fast path never requires the canvas");
test.assertIncludes(html, 'id="quick-draft-save" data-i18n="quick_draft_start_writing"', "one draft command stays the fast-path action");
test.assert(quickWindowHtml.includes('data-quick-draft-adjustment-develop'), "Develop is reachable from the article surface");
test.assert(quickWindowHtml.includes('data-quick-draft-delivery="teachtext"'), "Export to TeachText is reachable from the article surface");
const developSource = feature.slice(
  feature.indexOf("function developAdjustmentLayers"),
  feature.indexOf("function looksLikePlaceholderDraft")
);
test.assertNotIncludes(developSource, "openWindow(", "Develop never routes through another view");

// 文字亮室 Phase 1: protected spans, selection-as-range, density, real
// composition + develop, the reading mode, and the four-state language.
test.assertIncludes(html, 'data-quick-draft-protect-selection', "the command menu owns Protect Selection");
test.assertIncludes(html, 'data-quick-draft-protected-ranges', "the protected ranges render as an editable text field");

// Density is a fourth adjustment kind with no command button of its own.
test.assertIncludes(html, 'data-quick-draft-adjustment-enabled="density"', "Density has an on/off switch");
test.assertIncludes(html, 'data-quick-draft-adjustment-strength="density"', "Density has a strength control");
test.assertNotIncludes(html, 'data-quick-draft-chat-action="density"', "Density is an adjustment, not a ClioTalk command");

// Real composition: body = negative + enabled adjustments in stored order.
// Each layer reads the negative, every prefix is a cache key, and the model
// call is injected — the pure rule lives in app/core/text-compose.js.
test.assertIncludes(manifest, '"app/core/text-compose.js"', "the text-compose module is eager in the runtime manifest");
test.assertIncludes(html, 'data-quick-draft-adjustment-apply', "the command menu owns Apply");
test.assertIncludes(html, 'data-quick-draft-adjustment-develop', "the command menu owns Develop");
test.assertIncludes(draftRoute, "受保护文字", "the Chinese route copy protects quoted text");
test.assertIncludes(draftRoute, "protected text below must be reproduced verbatim", "the English route copy protects quoted text");

// 看片 — the composite reading mode: one key to enter, one to leave.
test.assertIncludes(html, 'id="quick-draft-toggle-composite"', "Quick Draft exposes the reading-mode toggle");

// Four states, one language, two themes: default no border; input lifts;
// selected draws a bounding box with control points; AI working is a slow
// travelling edge light (Liquid) or moving dither (Classic), never a spinner.
test.assertNotIncludes(appsCss, "quick-draft-working-spinner", "the working state is never a spinner");

// 拼台 — task 8: the single-object canvas. The article is an ordered path
// through objects; the object level carries only the visual transform,
// separate from the semantic adjustment stack; two-level editing keeps long
// writing linear; there is no canvas on a phone.
test.assertIncludes(html, 'data-quick-draft-canvas', "the canvas surface exists");
test.assertIncludes(html, 'data-quick-draft-canvas-object', "one text object holds the draft");
test.assertIncludes(html, 'data-quick-draft-canvas-handle="nw"', "the selected object shows eight handles");
test.assertIncludes(html, 'data-quick-draft-canvas-rotate', "the selected object shows a rotation handle");
test.assertIncludes(html, 'data-quick-draft-canvas-angle', "the selected object shows an angle readout");
test.assertIncludes(html, 'data-quick-draft-view="canvas"', "the view switcher can open the canvas");
test.assertIncludes(html, 'data-quick-draft-view="article"', "the view switcher can return to the article");

test.finish();
