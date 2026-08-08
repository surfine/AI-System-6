// 钟点稿 / Quick Draft is a fast-draft surface: the writing board comes first,
// ClioTalk carries organize/draft/polish commands, and research/checking
// details stay behind the first-screen drafting path. Since 1.0.28 the window
// is one application with three regions — material shelf, paper, inspector —
// and the paper never leaves the screen. The feature logic is split across
// sibling modules that share the bundle scope:
//
//   finder-draft.js           lifecycle + workspace schema + view switching
//   quick-draft-intake.js     materials, vent, chat import, source map
//   quick-draft-editor.js     editor chrome, preview modes, versions
//   quick-draft-composition.js layers, protect, grain, develop
//   quick-draft-canvas.js     the single-object canvas
//   quick-draft-ai.js         model requests and command dispatch
//   quick-draft-handoff.js    delivery actions

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
const grainDiff = read("app/core/grain-diff.js");
const draftRoute = read("src/server/routes/draft-thesis.js");
const appsCss = read("styles/50-apps.css");

const featureFiles = [
  "app/features/finder-draft.js",
  "app/features/quick-draft-intake.js",
  "app/features/quick-draft-editor.js",
  "app/features/quick-draft-composition.js",
  "app/features/quick-draft-canvas.js",
  "app/features/quick-draft-ai.js",
  "app/features/quick-draft-handoff.js",
];
const feature = featureFiles.map((path) => read(path)).join("\n");
const coordinator = read("app/features/finder-draft.js");

const quickWindowIndex = html.indexOf('data-window="quickDraft"');
const quickWindowHtml = html.slice(quickWindowIndex, html.indexOf('data-window="cmfStudio"', quickWindowIndex));
const editorIndex = html.indexOf('class="quick-draft-paper"', quickWindowIndex);
const rebootIndex = html.indexOf('class="quick-draft-layout quick-draft-reboot"', quickWindowIndex);
const legacyBackingIndex = html.indexOf('class="quick-draft-legacy-backing"', quickWindowIndex);
const chatImportIndex = html.indexOf('data-action="quick-draft-import-chat"');

test.assertIncludes(html, 'data-window="quickDraft"', "Quick Draft has a named System 6 window");
test.assertIncludes(html, 'data-action="open-quick-draft"', "Quick Draft keeps the existing Finder entry");
test.assert(!html.includes('name="startup-open" value="quick-draft"'), "Startup settings keep Quick Draft user-opened");
test.assertIncludes(actions, '"open-quick-draft": openQuickDraft', "Action table routes Quick Draft");
test.assertMatches(manifest, /lazyRuntimePaths[\s\S]*"app\/features\/finder-draft\.js"/, "Quick Draft coordinator is lazy");
["quick-draft-intake", "quick-draft-editor", "quick-draft-composition", "quick-draft-canvas", "quick-draft-ai", "quick-draft-handoff"]
  .forEach((name) => {
    test.assertMatches(manifest, new RegExp(`lazyRuntimePaths[\\s\\S]*"app\\/features\\/${name}\\.js"`), `${name} is lazy`);
  });
test.assertNotIncludes(manifest.match(/appModulePaths[\s\S]*?];/)?.[0] || "", "app/features/finder-draft.js", "Quick Draft is not in the startup bundle");
test.assertMatches(config, /tileableWindowNames[\s\S]*"quickDraft"/, "Quick Draft participates in window tiling");
test.assertMatches(config, /resizableWindowNames[\s\S]*"quickDraft"/, "Quick Draft is resizable");
test.assertMatches(
  config,
  /ensureQuickDraftModule[\s\S]*"app\/features\/finder-draft\.js"[\s\S]*"app\/features\/quick-draft-handoff\.js"/,
  "the lazy chain loads the coordinator first and every sibling after it"
);
const openStartupItemsSource = desktopRuntime.slice(
  desktopRuntime.indexOf("function openStartupItems()"),
  desktopRuntime.indexOf("function normalizeStartupOpenedWindowNames()")
);
test.assert(!openStartupItemsSource.includes('handleAction("open-quick-draft")'), "Startup never opens Quick Draft directly");
test.assert(!boot.includes('runtimeEnvironment === "finder" && startupOpenMode === "quick-draft"'), "Finder restore does not reopen Quick Draft");
test.assertIncludes(workingSession, 'entry.name === "quickDraft"', "Working Session repairs unusable Quick Draft frames");
test.assertIncludes(multiFinder, 'quickDraft: "writingStudio"', "MultiFinder groups Quick Draft under Writing Studio");
test.assertNotIncludes(multiFinder, 'quickDraft: "Quick Draft"', "MultiFinder does not present Quick Draft as a separate application");

test.assert(rebootIndex > 0, "Quick Draft uses the rebooted fast-draft shell");
test.assert(legacyBackingIndex > editorIndex, "Legacy compatibility nodes are hidden behind the editor shell");
test.assertIncludes(html, 'class="quick-draft-legacy-backing" hidden aria-hidden="true"', "Old card-field plumbing is hidden from the user path");
test.assertIncludes(html, '<h2 id="quick-draft-title" data-i18n="quick_draft_title">Quick Draft</h2>', "Quick Draft uses the title bar for the derived draft title");
test.assertNotIncludes(html, 'class="quick-draft-status-center"', "Format and length no longer set anything from the status bar");
test.assertIncludes(quickWindowHtml, 'class="quick-draft-sheet-head"', "Format and length ride on the sheet head, as properties of this draft");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-protect-state"', "The status bar reports what is protected");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-stack-state"', "The status bar reports what the adjustment stack holds");
test.assertIncludes(quickWindowHtml, '<span id="quick-draft-stats">0 words · ~0 sec</span>', "Status bar puts draft size on the left");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-save-state"', "Save state is visible in the status bar (Saved / Modified / Saving…)");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-status"', "Command feedback appears in the status bar");
test.assertIncludes(appsCss, "grid-template-columns: auto auto minmax(0, 1fr) auto auto;", "Quick Draft status receipts have explicit non-overlapping tracks");
test.assertIncludes(appsCss, ".quick-draft-details > #quick-draft-status {\n  grid-column: 3;", "live command feedback owns the flexible center track");
test.assertIncludes(appsCss, ".quick-draft-details > #quick-draft-stats {\n    display: none;", "phone width preserves live, save, and guardrail state by yielding word-count statistics first");
test.assertIncludes(appsCss, ".quick-draft-details > #quick-draft-protect-state,\n  .quick-draft-details > #quick-draft-stack-state {", "phone width keeps protection and adjustment-stack evidence available");

// One window, three regions: the material shelf, the paper, the inspector.
// A tool may stand beside the text; it may never stand in front of it, so no
// control replaces the paper and there are no phase tabs to switch.
test.assertNotIncludes(html, "data-quick-draft-phase-tab", "the phase tabs are gone; the paper is always on screen");
test.assertNotIncludes(html, "data-quick-draft-phase-pane", "no control replaces the paper with a pane of its own");
test.assertIncludes(quickWindowHtml, 'class="quick-draft-desk"', "the window is one desk with three regions");
test.assertIncludes(quickWindowHtml, 'class="quick-draft-shelf"', "the material shelf is its own region");
test.assertIncludes(quickWindowHtml, 'class="quick-draft-inspector"', "the inspector stands beside the paper, never in front of it");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-intake-well', "the empty state is a surface on the paper, not a phase");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-body-surface', "the body is the other surface of the same paper");
test.assertIncludes(coordinator, "function syncQuickDraftPaperFromState", "which surface the paper carries follows the state of the work");
test.assertIncludes(coordinator, "composition?.negativeUpdatedAt", "a draft exists once the negative is stamped, not when the writer types");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-title-input"', "the sheet head owns the title field");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-say"', "the intake well owns What I want to say");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-sources"', "the intake well owns the unified material textarea");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-advanced"', "advanced writing setup is folded behind Writing Setup…");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-audience-concerns"', "audience concerns live in advanced setup");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-must-avoid"', "must-avoid lives in advanced setup");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-to-start', "the shelf offers Add Material… back to the intake well");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-open-editor', "the intake well offers a way into the body without a model");

// One rule decides the collapse: the paper's smallest readable measure. The
// window is the container, so a narrow desk window collapses like a phone.
test.assertIncludes(appsCss, "@container (max-width: 800px)", "the three-region collapse is a container query on the window");
test.assertMatches(appsCss, /@container \(max-width: 800px\)[\s\S]*?\.quick-draft-desk \{\s*grid-template-columns: minmax\(0, 1fr\)/, "the collapse turns the desk into one column");
test.assertNotIncludes(read("styles/60-responsive.css"), "is-shelf-open", "the drawer state is not a second viewport-keyed layout");
test.assertMatches(appsCss, /--quick-draft-drawer-edge/, "a drawer never covers the whole paper: the exposed edge is a token");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-drawer-close="shelf"', "each drawer can be closed from its own head");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-drawer-close="inspector"', "the inspector drawer closes the same way");
test.assertIncludes(coordinator, "The strip of paper a drawer never covers is the easiest way back", "tapping the exposed paper edge closes the drawer");
test.assertIncludes(appsCss, "isolation: isolate", "the drawer covers the editor stack by document order, not by a new z-index");

// Pairing means two windows side by side, and a phone has none.
test.assertIncludes(coordinator, "isPortraitDocumentFlow", "portrait never summons SideAsk on open");
test.assertMatches(coordinator, /const portrait[\s\S]*?!options\.skipSideAsk && !portrait/, "the pairing guard reads the portrait flow");

// Material is an object list, and provenance is only claimed when it is true.
test.assertIncludes(feature, "function materialRowMeta", "material rows carry their own provenance line");
test.assertIncludes(feature, "quick_draft_material_cited", "a citation is reported only when the body carries the source tag");
test.assertIncludes(feature, "quick_draft_material_empty", "the empty shelf says how to add material");
test.assertMatches(feature, /body\.includes\(`\[\$\{tag\}\]`\)/, "citation is checked against the body, never assumed");

// Versions are objects too, with the negative pinned at the bottom.
test.assertIncludes(feature, "function restoreQuickDraftVersion", "a version can be gone back to");
test.assertIncludes(feature, '"before-restore"', "going back keeps the replaced body as a version first");
test.assertIncludes(feature, "quick_draft_negative", "the negative is listed as the version the writer never wrote over");

// A layer is one row; its description and scope open behind the triangle, so
// the stack order stays readable and touch devices still get the description.
test.assertIncludes(quickWindowHtml, 'data-quick-draft-layer-toggle="mingming"', "each layer row has a disclosure");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-layer-description="mingming"', "the description lives in the row, not only in Balloon Help");
test.assertIncludes(feature, "function toggleQuickDraftLayerDetail", "one layer opens at a time");

// Secondary controls are disabled, never removed.
test.assertIncludes(coordinator, "function syncQuickDraftControlAvailability", "controls keep their place when they cannot run");
test.assertIncludes(coordinator, "quick_draft_needs_body", "a disabled control can say why it is off");
test.assertNotIncludes(quickWindowHtml, 'class="quick-draft-card-sidebar"', "Quick Draft no longer renders the failed card sidebar");
test.assertNotIncludes(quickWindowHtml, 'class="quick-draft-teachtext-strip"', "Quick Draft no longer renders the failed setup strip");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-adjustment-apply', "the inspector owns Apply (Preview)");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-adjustment-develop', "the inspector owns Develop");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-protect-selection', "the inspector owns Protect Selection");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-protected-ranges', "the protected ranges render as an editable text field");
test.assertIncludes(quickWindowHtml, 'data-balloon-help="quick_draft_layer_mingming_desc"', "a layer is one row and its description moved into Balloon Help");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-versions-list"', "the inspector owns Versions");
// The route ends at "this draft can be sent", so delivery is one button away
// from the body and never behind the darkroom.
test.assertIncludes(quickWindowHtml, 'id="quick-draft-deliver"', "Delivery is its own control on the action row");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-delivery="teachtext"', "Send to TeachText is reachable from the body");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-save-project-doc"', "Save to Project Hard Disk is reachable from the body");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-send-review"', "Send to Review Desk is reachable from the body");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-delivery="export-markdown"', "Export Markdown is reachable from the body");
const commandMenuHtml = quickWindowHtml.slice(
  quickWindowHtml.indexOf('id="quick-draft-tools"'),
  quickWindowHtml.indexOf("</details>", quickWindowHtml.indexOf('id="quick-draft-tools"'))
);
test.assertNotIncludes(commandMenuHtml, 'data-quick-draft-adjustment-enabled="mingming"', "layer switches live in the Adjust pane, not the command menu");
test.assertNotIncludes(quickWindowHtml, 'data-quick-draft-chat-action="density"', "Density is an adjustment, not a ClioTalk command");

test.assertIncludes(html, 'id="quick-draft-cliotalk-hint"', "ClioTalk status bar hints which keywords can be typed");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="vent-on"', "Command menu can enter treehole mode");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="vent-off"', "Command menu can end treehole mode");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="vent-summary"', "Command menu can summarize treehole notes");
test.assertNotIncludes(quickWindowHtml, 'data-quick-draft-chat-action="chat-draft"', "Command menu does not expose a second chat-draft entry");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="mingming"', "Command menu owns Mingming fast review");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="luoluo"', "Command menu owns Luoluo receiving review");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="hkrr"', "Command menu owns HKRR lift");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-chat-action="praise"', "Command menu owns encouragement");
test.assertIncludes(quickWindowHtml, 'data-action="quick-draft-import-chat"', "the unified material area owns chat-record import");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-use-mounted"', "the unified material area owns File Floppy ingestion");
test.assertIncludes(quickWindowHtml, 'data-i18n="quick_draft_use_mounted"', "mounted-source ingestion lives in the material area, not the command menu");
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

test.assertIncludes(html, 'id="quick-draft-editorial-strategy"', "Strategy card renders editorial strategy");
test.assertIncludes(html, 'id="quick-draft-material-ledger"', "Strategy card renders material ledger");
test.assertIncludes(html, 'id="quick-draft-adoption-table"', "Strategy card renders adoption table");
test.assertIncludes(html, 'id="quick-draft-dump"', "Dump card keeps replaced body material");
test.assertIncludes(html, 'id="quick-draft-restore-dump"', "Dump card can restore material to the body");

test.assertIncludes(html, 'class="teachtext-editor-container quick-draft-editor-container', "Quick Draft editor reuses TeachText editor container");
test.assertIncludes(html, 'id="quick-draft-preview" class="teachtext-preview is-hidden"', "Quick Draft has TeachText-style preview");
test.assertIncludes(html, 'data-mde-focus-cycle data-mde-target="#quick-draft-draft"', "Quick Draft reuses markdown focus mode");
// Body / Grain / Read are three exclusive views of one text, so they are one
// group and exactly one of them can be pressed.
test.assertNotIncludes(html, 'id="quick-draft-toggle-preview"', "the separate Markdown preview toggle is folded into Read");
test.assertIncludes(quickWindowHtml, 'data-quick-draft-display="body"', "the display switch offers the body view");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-toggle-grain" data-quick-draft-display="grain"', "the display switch offers the grain view");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-toggle-composite" data-quick-draft-display="read"', "the display switch offers the reading view");
test.assertIncludes(html, 'data-i18n="quick_draft_grain"', "The grain toggle takes its label from the translation tables");
test.assertIncludes(feature, "[data-quick-draft-display]", "one function keeps the three display buttons exclusive");
test.assertIncludes(quickWindowHtml, 'id="quick-draft-save" data-i18n="quick_draft_start_writing"', "the action row owns the fast-path Draft button");
test.assertIncludes(html, 'class="mobile-control-short" data-i18n="more"', "Quick Draft uses a compact localized Commands label on phone");

test.assertIncludes(actions, "quick-draft-import-chat", "Add menu can trigger Quick Draft chat-record import");
test.assertIncludes(html, 'data-system-icon="chatImport"', "Chat-record import has a dedicated System icon");
test.assertIncludes(app, 'iconId: "quickDraft"', "Quick Draft has its own Applications icon, not TeachText's");
test.assertIncludes(systemIcons, "quickDraft", "System icon set draws the Quick Draft clock icon");
test.assertIncludes(systemIcons, "chatImport", "System icon set draws the chat-record import icon");
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

// Compression grain: a read-only provenance view. Original / Current /
// Difference: the readout shows the writer's share and the model's share,
// the note says what may have been squeezed out, and versions show how to get
// it back.
test.assertIncludes(manifest, '"app/core/grain-diff.js"', "The grain diff module is eager in the runtime manifest");
test.assertMatches(feature, /renderQuickDraftGrain[\s\S]*quick-draft-grain-model/, "The grain view marks the model's share with its own class");
test.assertMatches(feature, /renderQuickDraftGrain[\s\S]*quick_draft_grain_passes/, "The grain view reports how many model rewrites the body carries");
test.assertMatches(feature, /grainVersionChain[\s\S]*workspace\.versions/, "The version chain reads document Versions instead of material intake");
test.assertNotIncludes(feature, "chain.passes - introduced + 1", "The generation composition lives in grain-diff.js, where it is executed by a test");
test.assertNotIncludes(feature, "function grainSmoothMask", "The pure diff functions live in grain-diff.js, not the feature module");
test.assertNotIncludes(feature, "function grainCollapseRewritten", "The pure diff functions live in grain-diff.js, not the feature module");
test.assertMatches(feature, /run\.generation > 1[\s\S]*quick-draft-grain-generation/, "Only stacked rewrites get a generation badge");
test.assertNotIncludes(feature, "grainEditable", "The grain view stays read-only");
test.assertIncludes(feature, "quick-draft-grain-line", "The grain view renders the body line by line so masks can mark the margin");

// A draft written from an empty body must still record the negative boundary,
// and must keep it. Both write paths set the anchor on the first model pass
// whether or not there was a previous body, and both ask the timestamp — not
// the anchor text — whether a negative already exists.
test.assertIncludes(feature, "function hasRecordedNegative", "One predicate answers whether a negative was recorded");
test.assertMatches(feature, /hasRecordedNegative[\s\S]{0,320}negativeUpdatedAt/, "The predicate reads the anchor timestamp, not the anchor text");
test.assertNotIncludes(feature, "if (!humanAnchorSnapshot()) {", "No write path decides the negative from the anchor text");
test.assertMatches(
  feature,
  /if \(!hasRecordedNegative\(\)\) \{\s*\n\s*patch\.workspace\.composition = \{[\s\S]{0,220}negative: previousBody,/g,
  "The write paths record the anchor even when the previous body is empty"
);
test.assert(
  (feature.match(/if \(!hasRecordedNegative\(\)\)/g) || []).length === 2,
  "Both model write paths record the negative"
);
test.assertIncludes(grainDiff, "function grainChainFromRecordParts", "The version-chain rule is pure, so a test can execute it");
test.assertIncludes(grainDiff, 'bornEmpty\n    ? ["", ...stored]', "An empty negative is put back at the head of the chain");

// Workspace schema: one canonical v3 shape and explicit legacy migration.
test.assertIncludes(coordinator, "schemaVersion: 3", "the canonical workspace schema is version 3");
test.assertIncludes(coordinator, "function normalizeQuickDraftWorkspace", "legacy workspaces migrate through one normalization path");
test.assertMatches(coordinator, /intake: \{\s*\.\.\.emptyIntake,\s*setup:/, "intake owns vent/chat state and the writing setup");
test.assertMatches(coordinator, /composition: \{\s*currentKey:/, "composition owns the negative, composite, and generation record");
test.assertMatches(coordinator, /materials: Array\.isArray\(source\.materials\)[\s\S]*source\.sourceMap/, "legacy sourceMap migrates into materials");
test.assertMatches(coordinator, /strategy: normalizeStrategy[\s\S]*strategyReport/, "legacy strategyReport migrates into strategy");
test.assertNotIncludes(feature, "localStorage", "Quick Draft does not add localStorage persistence");
test.assertNotIncludes(feature, "indexedDB", "Quick Draft does not add IndexedDB stores");

// Adjustment layers: 明明传球 / 洛洛接球 / HKRR 抬升 / 密度 carry a switch,
// a strength (Light/Normal/Strong = 25/50/75), and a line-range mask, live in
// the workspace record, and every layer reads the negative, never another
// layer's output.
test.assertIncludes(manifest, '"app/core/adjustment-layers.js"', "The adjustment-layer module is eager in the runtime manifest");
test.assertIncludes(html, 'data-quick-draft-adjustment-enabled="mingming"', "Mingming Pass has an on/off switch");
test.assertIncludes(html, 'data-quick-draft-adjustment-strength="hkrr"', "HKRR Lift has a strength control");
test.assertIncludes(html, 'data-quick-draft-adjustment-mask="mingming"', "Mingming Pass has a line-range mask");
test.assertIncludes(html, 'data-quick-draft-adjustment-move="mingming"', "layers expose a move control");
test.assertIncludes(html, 'data-quick-draft-adjustment-enabled="density"', "Density has an on/off switch");
test.assertIncludes(html, 'data-quick-draft-adjustment-strength="density"', "Density has a strength control");
test.assertIncludes(draftRoute, "never another layer", "adjustment layers never read another layer's output");
test.assertIncludes(draftRoute, "只针对第", "the route scopes advice to the masked lines");
test.assertIncludes(draftRoute, "review only lines", "the English route copy scopes advice to the masked lines");

// Non-destructive protection: immutable sentinels, not line-number restore.
test.assertIncludes(manifest, '"app/core/protected-ranges.js"', "the protected-range sentinel module is eager in the runtime manifest");
test.assertIncludes(feature, "protectTextWithSentinels", "protected text is replaced by sentinels before every AI pass");
test.assertIncludes(feature, "verifyProtectedSentinels", "strict sentinel verification runs after every AI pass");
test.assertMatches(feature, /PROTECTED_RANGE_VIOLATION|quick_draft_protect_failed/, "a sentinel violation fails the request instead of guessing positions");
test.assertNotIncludes(feature, "restoreProtectedRanges(", "no AI path restores protected text by line position");
test.assertIncludes(feature, "quick_draft_protect_failed", "the UI surfaces a protected-range failure message");

// 文字亮室 Task 0 — the fast path is pinned before anything moves. The route
// from an empty draft to a body must not grow a step or a model call, and
// develop/export must stay reachable without visiting any other view.
const draftPathSource = feature.slice(
  feature.indexOf("async function requestMingmingQuickDraft"),
  feature.indexOf("function quickDraftCommandLabel")
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
const developSource = feature.slice(
  feature.indexOf("async function developAdjustmentLayers"),
  feature.indexOf("function looksLikePlaceholderDraft")
);
test.assertNotIncludes(developSource, "openWindow(", "Develop never routes through another view");
test.assertIncludes(developSource, "createDocumentRevision", "Develop saves a revision before promoting the composite");
test.assertIncludes(developSource, "quick_draft_develop_confirm", "Develop asks before the composite becomes the working body");
test.assertIncludes(developSource, "await commitQuickDraft", "Develop awaits persistence before claiming success");

// Model availability: without a model the window still writes; AI actions are
// disabled with a clear Connect AI… affordance.
test.assertIncludes(coordinator, "function quickDraftModelAvailable", "one predicate answers whether a model is available");
test.assertIncludes(coordinator, "quick_draft_connect_ai", "the empty-model state tells the writer to Connect AI…");
test.assertIncludes(feature, "if (!quickDraftModelAvailable())", "AI paths refuse cleanly when no model is configured");

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
test.assertIncludes(feature, "saveQuickDraft({ workspace: { canvas: next } }", "canvas transforms persist into the workspace");
test.assertIncludes(feature, "function normalizeQuickDraftCanvas", "canvas state normalizes on reload");

test.finish();
