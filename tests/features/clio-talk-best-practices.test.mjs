// ClioTalk borrows useful Siri-prompt practices at the product layer:
// answer first, treat visible objects as entities, separate source/inference
// boundaries, and show the user which AI System 6 sources grounded a reply.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-talk-best-practices");

const indexHtml = read("index.html");
const chatMessages = read("app/core/chat-messages.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const workingSession = read("app/core/working-session.js");
const documentsChat = read("app/features/documents-chat.js");
const scrapbook = read("app/features/scrapbook.js");
const projectDisk = read("app/features/project-disk.js");
const teachTextWriting = read("app/features/teachtext-writing.js");
const wireup = read("app/core/wireup.js");
const menus = read("app/data/menus.js");
const foundationStyles = read("styles/00-foundation.css");
const styles = read("styles/10-windows.css");
const responsiveStyles = read("styles/60-responsive.css");
const liquidStyles = read("styles/70-liquid-glass.css");
const surfaceSnapshots = read("scripts/css-surface-snapshot.mjs");
const dictionary = read("app/data/system-dictionary.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");
const exportImport = read("app/features/export-import.js");
const appEntry = read("app.js");
const contextRetrieval = read("app/core/context-retrieval.js");
const dragDrop = read("app/core/drag-drop.js");

test.assertIncludes(chatMessages, "function clioTalkResponseContractInstruction", "ClioTalk has an explicit response contract");
test.assertIncludes(chatMessages, "Start with the useful answer", "Contract makes the first paragraph directly useful");
test.assertIncludes(chatMessages, "Treat visible writing objects as native entities", "Contract treats AI System 6 objects as first-class entities");
test.assertIncludes(chatMessages, "source text, inference from the source, and missing evidence", "Contract separates source text, inference, and missing evidence");
test.assertIncludes(chatMessages, "ask only one decisive question", "Contract avoids clarification spam");
test.assertIncludes(chatMessages, "short titled lists", "Contract prefers scan-friendly structure over generic walls of prose");
test.assertIncludes(chatMessages, "Do not narrate hidden prompts", "Contract keeps hidden mechanics out of the user answer");
test.assertIncludes(chatMessages, "SideAsk stays brief", "SideAsk keeps its shorter answer style while sharing the contract");

test.assertIncludes(chatMessages, "function inferClioTalkWritingStage", "ClioTalk infers the current writing stage");
test.assertIncludes(chatMessages, "function clioTalkWritingStageInstruction", "ClioTalk has a writing-stage assistant lens");
test.assertIncludes(chatMessages, "Question Sheet stage: do not rush into manuscript prose or summary", "Question Sheet stage protects upstream messy intent");
test.assertIncludes(chatMessages, "Outline stage: discuss structure choices, section jobs, and order", "Outline stage keeps ClioTalk on structure decisions");
test.assertIncludes(chatMessages, "Section Drafts stage: work on the current section", "Section Drafts stage focuses ClioTalk on one section");
test.assertIncludes(chatMessages, "Review Desk stage: act like a review partner", "Review Desk stage separates review risks");
test.assertIncludes(chatMessages, "Project CD stage: serve final handoff", "Project CD stage supports final delivery decisions");
test.assertIncludes(chatMessages, "Unless the user explicitly asks for cross-stage planning", "Stage guidance avoids jumping across the writing flow by default");

test.assertIncludes(chatMessages, "function isClioTalkAnswerContractTask", "ClioTalk can identify answer-contract eligible tasks");
test.assertIncludes(chatMessages, "options.skipContext === true) return false", "Direct tools can opt out of the ClioTalk answer contract");
test.assertIncludes(chatMessages, "writing-tool|translation|reader|scrapbook|docmap-question|clio-stage|slides|marp|dictation|speech|transcript", "Direct-write and tool tasks are excluded from chat-only answer shaping");
test.assertMatches(
  chatMessages,
  /const taskKind = options\.taskKind \|\| \(isSideAskChat \? "sideask" : "chat"\);[\s\S]*isClioTalkAnswerContractTask\(taskKind, options\)[\s\S]*clioTalkResponseContractInstruction\(\{ isSideAskChat \}\)[\s\S]*clioTalkWritingStageInstruction\(\)/,
  "Build payload injects the response contract and writing-stage lens into ordinary ClioTalk runs"
);

test.assertIncludes(chatMessages, "function captureClioTalkGroundingSnapshot", "ClioTalk captures a per-reply grounding snapshot");
test.assertIncludes(chatMessages, "lastRetrievedContextItems.filter((contextItem) => contextItem.included !== false && !contextItem.excluded)", "Grounding snapshots use only included, non-excluded context records");
test.assertIncludes(chatMessages, "clioTalkAttachedClipSources()", "Manually attached Scrapbook clips are visible in the grounding snapshot");
test.assertIncludes(chatMessages, "clioTalkSideAskGroundingSource()", "SideAsk paired windows can appear as grounding sources");
test.assertIncludes(chatMessages, "clio_grounding_missing_no_relevant_sources", "Grounding snapshots can name missing project context");

test.assertIncludes(chatMessages, "function appendMessageGrounding", "Assistant messages can render a grounding strip");
test.assertIncludes(chatMessages, 'strip.className = "message-grounding-strip"', "Grounding strip has a stable UI hook");
test.assertIncludes(chatMessages, 'strip.dataset.clioGrounding = "true"', "Grounding strip is machine-detectable without relying on copy");
test.assertIncludes(chatMessages, 'openWindow("contextPanel")', "Grounding strip links to the existing Context Panel instead of inventing a second evidence viewer");
test.assertMatches(
  chatMessages,
  /function resolvePendingMessage\(item, role, content, options = \{\}\)[\s\S]*appendMessageGrounding\(item, options\.grounding \|\| null\)[\s\S]*appendMessageActions\(item, role, content, options\)/,
  "Grounding renders before message action buttons on resolved assistant replies"
);
test.assertMatches(
  chatMessages,
  /const grounding = captureClioTalkGroundingSafely\([\s\S]*createClioTalkAssistantRecord\(\{[\s\S]*grounding,[\s\S]*finalizeClioTalkAssistantReply\(\{/,
  "Submitted ClioTalk replies pass the captured grounding snapshot into the final message"
);

test.assertMatches(
  wireup,
  /promptInput\.addEventListener\("keydown", \(event\) => \{[\s\S]*event\.key !== "Enter" \|\| event\.isComposing[\s\S]*if \(event\.shiftKey\) return;[\s\S]*form\.requestSubmit\(\)/,
  "ClioTalk composer sends on Enter while preserving IME composition and Shift+Enter newlines"
);

test.assertIncludes(translationsEn, "clio_grounding_label", "English UI labels the grounding strip");
test.assertIncludes(translationsEn, "clio_grounding_no_project_context", "English UI can say no project sources were used");
test.assertIncludes(translationsEn, "clio_grounding_open_context_panel", "English UI can open the Context Panel from the strip");
test.assertIncludes(translationsZh, "clio_grounding_label", "Chinese UI labels the grounding strip");
test.assertIncludes(translationsZh, "clio_grounding_no_project_context", "Chinese UI can say no project sources were used");
test.assertIncludes(translationsZh, "clio_grounding_open_context_panel", "Chinese UI can open the Context Panel from the strip");

test.assertIncludes(chatMessages, "function renderClioTalkWelcome", "ClioTalk owns a runtime empty-state welcome instead of relying on startup HTML");
test.assertMatches(chatMessages, /function resetClioTalkRuntimeState[\s\S]*messagesEl\) messagesEl\.replaceChildren\(\);[\s\S]*renderClioTalkWelcome\(\)/, "Clearing or initializing ClioTalk restores its visible welcome");
test.assertMatches(chatMessages, /function restoreClioTalkRuntimeState[\s\S]*conversation\.forEach\(\(item, index\) => addMessage\(item\.role, item\.content,[\s\S]*renderClioTalkWelcome\(\)/, "Restoring an empty chat keeps the ClioTalk welcome visible");
for (const [source, label] of [
  [desktopRuntime, "project eject"],
  [workingSession, "working-session restore"],
  [documentsChat, "saved-chat open"],
  [projectDisk, "project switch"],
]) {
  test.assertIncludes(source, "renderClioTalkWelcome();", `${label} cannot leave an empty ClioTalk pane`);
}
test.assertMatches(documentsChat, /function startNewClioTalkConversation[\s\S]*persistActiveChatFile\(\);[\s\S]*resetClioTalkRuntimeState/, "Starting a new Chat preserves the current file and restores the empty ClioTalk pane");
test.assertNotIncludes(teachTextWriting, "trashItems.unshift", "Starting a new Chat no longer turns the previous conversation into a Trash digest");
test.assertIncludes(chatMessages, "const initialReceiptState = clioTalkReplyReceiptState(options.messageRecord)", "Each ClioTalk reply restores an explicit temporary or persisted receipt state");
test.assertIncludes(indexHtml, 'id="clio-use-result-modal"', "ClioTalk has one dedicated Use Result confirmation surface");
test.assertIncludes(chatMessages, "function chooseClioTalkUseResult", "Use Result chooses a named writing object before mutation");
test.assertIncludes(chatMessages, "function clioTalkUseResultNextText", "Use Result calculates a destination-specific next state for preview");
test.assertIncludes(chatMessages, 'id: "question-sheet"', "Question Sheet is an explicit result destination");
test.assertIncludes(chatMessages, 'id: "outline"', "Outline is an explicit result destination");
test.assertIncludes(chatMessages, 'id: "section-draft"', "Current Section Draft is an explicit result destination");
test.assertIncludes(chatMessages, 'id: "teachtext"', "Editable TeachText is an explicit result destination");
test.assertIncludes(chatMessages, 'id: "scrapbook"', "Scrapbook is an explicit result destination");
test.assertIncludes(chatMessages, 'id: "project-document"', "A new project document is an explicit result destination");
test.assertIncludes(chatMessages, 'mode === "replace-selection"', "The action layer supports selection replacement without a whole-document blind write");
test.assertIncludes(chatMessages, "contentHash(currentTarget.before) !== beforeHash", "Confirmation refuses a stale target that changed after preview");
test.assertIncludes(chatMessages, "function undoClioTalkUseResult", "Each confirmed result write has one-step undo");
test.assertIncludes(chatMessages, "contentHash(target.before) === contentHash(undo.after)", "Undo refuses to overwrite later user edits");
test.assertIncludes(chatMessages, "persistClioTalkUseResultRunReceipt", "Confirmed destination writes update the linked Run Record");
test.assertIncludes(documentsChat, '"## Result use"', "Run Records expose result destination receipts");
test.assertIncludes(documentsChat, "Before hash:", "Run Records retain the pre-write content hash");
test.assertIncludes(documentsChat, "After hash:", "Run Records retain the post-write content hash");
test.assertIncludes(chatMessages, "replyReceipt: {", "Reply disposition is stored as structured conversation state");
test.assertIncludes(chatMessages, "updateClioTalkMessageRecord(messageRecord.id", "Reply receipts persist through the conversation record instead of living only in the DOM");
test.assertIncludes(chatMessages, "removeClioTalkMessageRecord(messageId)", "Discard removes the durable reply record so it cannot reappear after refresh");
test.assertIncludes(documentsChat, "item.displayContent || item.content", "Saved chat previews preserve short visible labels such as Continue");
test.assertIncludes(documentsChat, "clioTalkReplyReceiptState(item)", "Saved chat previews retain reply-destination receipts");
test.assertIncludes(documentsChat, 'item.deliveryState === "failed"', "Saved chat previews expose messages that were never delivered");
test.assertIncludes(chatMessages, 'if (!getActiveProject())', "Saving a reply refuses to claim project persistence without a mounted project");
test.assertIncludes(styles, ".message-disposition", "Reply persistence receipts have a stable ClioTalk UI hook");
test.assertIncludes(translationsEn, 'clio_use_result: "Use Result"', "English UI names the consolidated action layer");
test.assertIncludes(translationsZh, 'clio_use_result: "使用结果"', "Chinese UI names the consolidated action layer");
test.assertIncludes(dictionary, "Replies remain temporary writing material until the user opens Use Result", "System Help documents the compact reply-persistence boundary");
test.assertIncludes(dictionary, "回复仍只是临时写作材料", "Chinese System Help keeps the reply destination boundary aligned with the UI");
test.assertIncludes(dictionary, "it can be reopened in ClioTalk, continued, previewed, or downloaded as Markdown", "System Help reflects current saved-chat resume and export behavior");
test.assertIncludes(dictionary, "首条消息会创建 Chat 文件", "Chinese System Help reflects the file-native Chat lifecycle");
test.assertIncludes(exportImport, "function buildProjectAuditCapsule", "Project CD can build an auditable delivery snapshot");
test.assertIncludes(exportImport, 'schemaVersion: projectAuditCapsuleSchemaVersion', "Audit capsules carry an explicit schema version");
test.assertIncludes(exportImport, "actualPrompts:", "Audit capsules include actual prompt-run records and hashes");
test.assertIncludes(exportImport, "conversationLineage:", "Audit capsules include conversation genealogy");
test.assertIncludes(exportImport, "externalBodies: embedExternalBodies", "External bodies are opt-in rather than embedded by default");
test.assertIncludes(exportImport, "reference.body || reference.text || reference.content || (reference.chunks", "Audit capsules hash the real indexed reference body or chunks");
test.assertIncludes(exportImport, "Not included; content hashes, sources, and licenses are recorded instead.", "Audit capsules disclose omitted external bodies");
test.assertIncludes(exportImport, "requires fresh confirmation of the model and external capabilities", "Audit capsules make rerun confirmation explicit");
test.assertIncludes(exportImport, "function burnProjectAuditCapsule", "Project CD exposes a pre-burn audit capsule action");
test.assertIncludes(appEntry, "burnProjectAuditCapsuleButton,", "The audit capsule button is bound into the app runtime");
test.assertIncludes(translationsEn, "burn_audit_capsule", "English Project CD labels the audit capsule action");
test.assertIncludes(translationsZh, "burn_audit_capsule", "Chinese Project CD labels the audit capsule action");
test.assertIncludes(dictionary, "Project Audit Capsules", "System Help documents the audit capsule boundary");
test.assertIncludes(chatMessages, 'editBtn.textContent = t("clio_edit_and_branch")', "User messages expose edit-and-branch without overwriting history");
test.assertIncludes(translationsEn, 'clio_edit_and_branch: "Edit"', "English UI names the safe branch operation as a familiar Edit action");
test.assertIncludes(translationsZh, 'clio_edit_and_branch: "编辑"', "Chinese UI names the safe branch operation as a familiar Edit action");
test.assertIncludes(chatMessages, 'useDetails.className = "message-use-actions"', "Advanced reply destinations stay behind one compact Use Reply control");
test.assertIncludes(chatMessages, 'copyBtn.textContent = t("copy")', "Every assistant reply exposes the expected Copy action");
test.assertIncludes(styles, ".message-use-menu", "The compact reply destination menu has a stable UI hook");
test.assertMatches(indexHtml, /id="clip-selection"[^>]*hidden/, "Composer-level Clip stays hidden from the everyday input row");
test.assertMatches(indexHtml, /id="clear"[^>]*hidden/, "Composer-level Clear stays in the Conversation menu rather than the everyday input row");
test.assertMatches(indexHtml, /class="visually-hidden" for="prompt"/, "The composer label remains accessible without adding visual chrome");
test.assertIncludes(translationsEn, 'prompt_placeholder: "Message ClioTalk..."', "English composer addresses ClioTalk instead of exposing the model route");
test.assertIncludes(translationsZh, 'prompt_placeholder: "给 ClioTalk 发消息…"', "Chinese composer addresses ClioTalk instead of exposing the model route");
test.assertIncludes(documentsChat, "parentChatId: parent.id", "Conversation branches retain their parent chat");
test.assertIncludes(documentsChat, "forkMessageId:", "Conversation branches retain the edited fork message");
test.assertIncludes(documentsChat, "generation: Number(parent.generation || 0) + 1", "Conversation genealogy records generation depth");
test.assertIncludes(documentsChat, "function renderChatLineage", "Saved chat previews expose parent and child navigation");
test.assertIncludes(documentsChat, "function saveClioTalkHarness", "ClioTalk can save a file-based Harness record");
test.assertIncludes(documentsChat, "function saveClioTalkSkillDraft", "ClioTalk can turn a conversation into an editable Skill draft");
test.assertIncludes(documentsChat, "function saveClioTalkRetrospective", "ClioTalk can save an editable retrospective");
test.assertIncludes(documentsChat, "function openClioTalkGenealogy", "ClioTalk can save a project-wide genealogy index");
const clioTalkMenuSource = menus.match(/const clioTalkMenus = \[[\s\S]*?\n\];/)?.[0] || "";
test.assertIncludes(clioTalkMenuSource, 'submenu("recent_conversations"', "Recent conversations remain one compact ClioTalk submenu");
test.assertIncludes(clioTalkMenuSource, 'menuItem("reveal-active-chat-file"', "ClioTalk can reveal the real conversation file");
test.assertIncludes(clioTalkMenuSource, 'submenu("menu_context"', "Context actions remain grouped instead of filling the Conversation menu");
[
  "open-clio-genealogy",
  "compare-chat-branch",
  "merge-chat-branch",
  "save-clio-harness",
  "save-clio-skill",
  "use-project-skill-next-task",
  "suggest-project-skill",
  "configure-skill-auto-call",
  "save-clio-retrospective",
  "open-model-meter",
].forEach((action) => {
  test.assertNotIncludes(clioTalkMenuSource, `menuItem("${action}"`, `${action} stays out of the everyday Conversation menu`);
});
test.assertIncludes(dictionary, "不再创建一套管理面板", "System Help keeps advanced objects in files instead of a second dashboard");
test.assertIncludes(chatMessages, "function renderClioTalkContextSpace", "ClioTalk owns a composer-level context-capacity estimate");
test.assertIncludes(chatMessages, 'document.querySelector("#assistant-context-space")', "Context capacity has a stable ClioTalk composer hook");
test.assertIncludes(dictionary, "上下文检查器负责排序、token 估算", "System Help assigns context-budget detail to Memory Inspector");
test.assertIncludes(documentsChat, "function ensureProjectMemoryFolder", "Project Memory has a visible Project Hard Disk folder");
test.assertIncludes(documentsChat, 'artifactKind: "project-memory"', "Confirmed memories are editable project files");
test.assertIncludes(documentsChat, "memoryStatus: \"active\"", "New project memories start active");
test.assertIncludes(documentsChat, "Save this draft as durable Project Memory?", "Project Memory drafts require confirmation before persistence");
test.assertIncludes(documentsChat, "function toggleSelectedProjectMemory", "Project Memory supports enable and disable");
test.assertIncludes(chatMessages, "getProjectMemoryFiles({ activeOnly: true })", "Only active Project Memory files load into ClioTalk");
test.assertIncludes(chatMessages, "projectMemoryIds: grounding?.projectMemoryIds", "Run records retain loaded Project Memory IDs without breaking direct tool questions that intentionally skip grounding");
test.assertIncludes(chatMessages, "contextSources: grounding?.sources", "Direct Reader, Time Machine, DocMap, Scrapbook, ClioStage, and ClioChart questions can finish when grounding is intentionally absent");
test.assertMatches(clioTalkMenuSource, /submenu\("menu_context",[\s\S]*?menuItem\("remember-chat-as-project-memory"/, "Remembering stays explicit inside the compact Context submenu");
test.assertIncludes(menus, 'menuItem("toggle-project-memory", "toggle_project_memory")', "Project Memory status is reachable from Finder menus");
test.assertIncludes(dictionary, "绝不会自动升级为项目记忆", "Help distinguishes conversation continuity from durable Project Memory");
test.assertIncludes(dictionary, "对话全文、当前对话的临时压缩连续性、明确附带的来源，以及可编辑的项目记忆文件", "Help names the four memory-boundary layers");
test.assertIncludes(documentsChat, "function saveBranchComparison", "Branches can be compared without automatic merge");
test.assertIncludes(documentsChat, "function showBranchMergePicker", "Branch merge presents selectable items");
test.assertIncludes(documentsChat, 'input.type = "checkbox"', "Branch merge uses checkboxes for user selection");
test.assertIncludes(documentsChat, '"branch-merge-receipt"', "Branch merge writes a file-based receipt");
test.assertIncludes(documentsChat, "missingParentId", "Missing parent chat files remain visible without breaking lineage");
test.assertIncludes(documentsChat, "persistActiveChatFile();", "Lineage navigation persists the current conversation first");
test.assertNotIncludes(clioTalkMenuSource, 'menuItem("compare-chat-branch"', "Branch comparison waits for the independent genealogy surface");
test.assertNotIncludes(clioTalkMenuSource, 'menuItem("merge-chat-branch"', "Branch merging waits for the independent genealogy surface");
test.assertIncludes(dictionary, "对话文件仍可显示上代与后代入口", "Help limits lineage guidance to saved-file navigation while genealogy is shelved");
test.assertIncludes(chatMessages, "function recordContextLoadout", "ClioTalk captures an actual request loadout snapshot");
test.assertMatches(chatMessages, /function fetchModelPayload[\s\S]*messages: withBrowserLocalSafetyMessages[\s\S]*if \(shouldRecordLoadout\) recordContextLoadout\(nextPayload\)/, "Local loadout is captured after runtime guardrails join the final transport payload");
test.assertMatches(chatMessages, /sanitizeCloudChatPayload\(nextPayload\)[\s\S]*if \(shouldRecordLoadout\) recordContextLoadout\(nextPayload\)/, "Cloud loadout is captured after provider payload normalization");
test.assertNotIncludes(chatMessages, "recordContextLoadout(finalPayload)", "ClioTalk does not record the pre-transport approximation");
test.assertIncludes(chatMessages, 'scope: "application-supplied"', "Run manifests state the exact visibility boundary");
test.assertIncludes(chatMessages, "messageStack", "Run manifests retain the exact ordered application message stack");
test.assertIncludes(chatMessages, "promptFiles", "Run manifests retain visible Prompt files");
test.assertIncludes(chatMessages, "skillFiles", "Run manifests retain selected Skill files");
test.assertIncludes(chatMessages, "harnessFile", "Run manifests retain the active Harness file");
test.assertIncludes(chatMessages, "inputFiles", "Run manifests retain file-system inputs");
test.assertIncludes(chatMessages, "window.lastContextLoadout?.promptTokens", "Status bar and Context Panel share snapshot token totals");
test.assertIncludes(dictionary, "持久且精确的消息栈保存在回复所链接的 Run Record", "Help distinguishes transient memory inspection from the durable exact Run Record");
test.assertIncludes(documentsChat, "sourceMessageIds = file.messages", "Retrospectives retain their source message IDs");
test.assertIncludes(documentsChat, "artifactIds = chatFiles", "Retrospectives retain related artifact IDs");
test.assertIncludes(documentsChat, "function attachSelectedRetrospectiveToNextTask", "Retrospectives can attach to the next task");
test.assertIncludes(chatMessages, "nextTaskRetrospectiveIds", "Attached retrospectives enter the next task payload");
test.assertIncludes(chatMessages, "lastTaskRetrospectiveIds", "Retrospective use is retained in the run grounding record");
test.assertIncludes(documentsChat, "function createSkillDraftFromSelectedRetrospective", "Retrospectives can create Skill drafts");
test.assertIncludes(documentsChat, "will not be installed or enabled automatically", "Skill drafts require confirmation and do not auto-install");
test.assertIncludes(dictionary, "Prompt 与策略文件、选中的 Skill、作为 Harness 的 Task Config", "Help exposes Prompt, Skill, and Harness in Run Assembly");
test.assertIncludes(documentsChat, "function parseProjectSkillFile", "Project Skills have a parser and validator");
test.assertIncludes(documentsChat, '["prompt", "references"]', "Version-one Skills allow only prompt and references capabilities");
test.assertIncludes(documentsChat, "scripts or write scope are not allowed", "Unsafe Skill declarations are rejected");
test.assertIncludes(documentsChat, 'artifactKind: "ai-skill"', "Project Skills are real project files");
test.assertIncludes(documentsChat, "function selectProjectSkillForNextTask", "Skills are manually selected for one task");
test.assertIncludes(chatMessages, "nextTaskSkillIds", "Selected Skills change the next model request");
test.assertIncludes(chatMessages, "lastTaskSkillIds", "Selected Skill versions enter run grounding records");
test.assertIncludes(dictionary, "技能是高级项目对象，不作为日常“对话”菜单命令出现", "Help keeps Skill invocation out of the everyday Conversation menu");
test.assertIncludes(documentsChat, "function parseMountedSkillPackage", "File Floppy Skill packages are parsed before installation");
test.assertIncludes(documentsChat, "not a .skill.json package", "Only explicit skill package files can install");
test.assertIncludes(documentsChat, "Duplicate Skill ID", "Duplicate Skill IDs require an explicit decision");
test.assertIncludes(documentsChat, 'skillStatus: "disabled"', "Mounted Skills install disabled and untrusted by default");
test.assertIncludes(documentsChat, "function toggleSelectedProjectSkill", "Finder can enable or disable installed Skills");
test.assertIncludes(menus, 'menuItem("install-mounted-skill", "install_skill")', "File Floppy exposes a Skill install action");
test.assertIncludes(dictionary, "绝不静默覆盖", "Help documents duplicate Skill handling");
test.assertIncludes(chatMessages, "skillConflicts", "Multiple Skills detect conflicting instructions");
test.assertIncludes(chatMessages, "user-selected order", "Multiple Skills retain deterministic user order");
test.assertIncludes(scrapbook, "lastTaskSkillReceipt", "Context Panel shows the adopted Skill receipt");
test.assertIncludes(dictionary, "多个技能按用户选择顺序采用", "Help documents predictable Skill ordering");
test.assertIncludes(documentsChat, 'saveClioTalkArtifact("task-config-draft"', "Harnesses migrate as non-executable Task Config drafts");
test.assertIncludes(documentsChat, "function parseTaskConfig", "Task Configs parse their visible JSON file content");
test.assertIncludes(documentsChat, "invalid task config JSON", "Malformed Task Configs are blocked before run");
test.assertIncludes(documentsChat, "function runSelectedTaskConfig", "Task Configs can run in ClioTalk");
test.assertIncludes(documentsChat, "inputs.length !== config.inputFileIds.length", "Missing Task Config inputs block runs");
test.assertIncludes(documentsChat, "skills.length !== config.skillIds.length", "Disabled Task Config Skills block runs");
test.assertIncludes(documentsChat, "Task Config hash", "Task runs record the config hash");
test.assertIncludes(dictionary, "草稿不可执行", "Help distinguishes Task Config drafts from executable files");
test.assertIncludes(documentsChat, "function ensureTaskFolderForConfig", "Task Config runs create stable Task Folders");
test.assertIncludes(documentsChat, '"Conversation", "Task Config", "Context", "Artifacts", "Run Records", "Retrospective"', "Task Folder has the documented lifecycle subfolders");
test.assertIncludes(documentsChat, "function setTaskConfigLifecycle", "Task lifecycle writes durable state into its config file");
test.assertIncludes(documentsChat, "function resumeSelectedTaskConfig", "Task resume reuses a saved Chat ID");
test.assertIncludes(dictionary, "而不会创建重复任务或产物", "Help documents duplicate-safe task resume");
test.assertIncludes(documentsChat, "function suggestProjectSkillsForTask", "Skills are suggested from deterministic manifest filtering");
test.assertIncludes(documentsChat, "getEnabledProjectSkills()", "Suggestions exclude disabled and uninstalled Skills");
test.assertIncludes(documentsChat, "window.confirm", "Suggested Skills require user confirmation");
test.assertIncludes(chatMessages, "lastSkillSuggestion", "Suggestion choices enter the run receipt");
test.assertIncludes(documentsChat, "function getSkillAutoCallSettingsFile", "Auto calls use a visible project status file");
test.assertIncludes(documentsChat, 'artifactKind === "skill-auto-call-settings"', "Auto call settings are auditable Finder files");
test.assertIncludes(documentsChat, 'scope === "project"', "Auto calls require project-only read scope");
test.assertIncludes(chatMessages, "getAutoCallableProjectSkills(userText)", "Only opted-in eligible Skills are auto-called");
test.assertIncludes(chatMessages, "onAutoSkillCall", "ClioTalk displays each read-only auto call");
test.assertIncludes(documentsChat, "function disableAutoCalledSkillFromSelectedReceipt", "Run receipts can disable an auto-called Skill");
test.assertIncludes(documentsChat, "function createTeachTextModificationSuggestion", "Task Config TeachText output becomes a file-based modification suggestion");
test.assertIncludes(documentsChat, "originalHash", "Modification suggestions retain the original manuscript hash");
test.assertIncludes(documentsChat, "function acceptSelectedTeachTextModificationSuggestion", "TeachText suggestions require explicit acceptance");
test.assertIncludes(documentsChat, "function rejectSelectedTeachTextModificationSuggestion", "Rejecting a suggestion leaves the manuscript unchanged");
test.assertIncludes(documentsChat, "function viewSelectedTeachTextModificationSuggestionDiff", "Finder can show a suggestion diff before acceptance");
test.assertIncludes(dictionary, "拒绝绝不改动正文", "Help documents the modification-suggestion confirmation boundary");
test.assertIncludes(documentsChat, "function createTaskCheckpoint", "High-risk tasks can save file-based checkpoints");
test.assertIncludes(documentsChat, "taskConfigHash", "Checkpoints retain the Task Config hash");
test.assertIncludes(documentsChat, "pendingSuggestionIds", "Checkpoints retain pending modification suggestions");
test.assertIncludes(documentsChat, "function restoreSelectedTaskCheckpoint", "Task checkpoints can restore task references");
test.assertIncludes(documentsChat, "No files created after the checkpoint will be removed", "Checkpoint restore never deletes later Finder files");
test.assertIncludes(documentsChat, "task-checkpoint-restore-receipt", "Checkpoint restore writes a run receipt");
test.assertIncludes(dictionary, "不删除之后产生的文件", "Help documents non-destructive checkpoint restore");
test.assertIncludes(dictionary, "拒绝不会改变任务", "Help documents safe suggestion rejection");

test.assertMatches(indexHtml, /id="clio-run-assembly"[\s\S]*id="clio-run-summary"[\s\S]*id="clio-run-panel"/, "Prompt, Skill, Harness, and Inputs share one progressive Run Assembly control");
test.assertMatches(indexHtml, /class="composer-action-row"[\s\S]*id="compose-tools-toggle"[\s\S]*id="clio-run-assembly"[\s\S]*id="send"/, "Add, Run Assembly, and the single Send/Stop control live on one composer surface");
test.assertMatches(indexHtml, /id="clio-chat-file-link"[^>]*data-action="reveal-active-chat-file"/, "The current Chat file is visible and revealable without a history sidebar");
test.assertMatches(indexHtml, /id="status"[^>]*hidden/, "The idle Ready status does not occupy ClioTalk's everyday chrome");
test.assertIncludes(styles, ".clio-chat-file-link[hidden]", "A Chat file that does not exist yet cannot be revealed by component display styles");
test.assertMatches(chatMessages, /function renderClioTalkFileBar[\s\S]*button\.hidden = false;[\s\S]*button\.disabled = !file;/, "The pending Chat file remains visible as the conversation's object identity before it can be revealed");
test.assertIncludes(styles, ".assistant-details-bar:not(:has(", "ClioTalk can still remove the whole details row when no meaningful status or file is present");
test.assertNotIncludes(indexHtml, 'id="clio-new-chat-button"', "New Chat no longer occupies the everyday ClioTalk chrome");
test.assertIncludes(clioTalkMenuSource, 'menuItem("start-new-clio-chat", "new_conversation")', "New Chat remains available as a familiar Conversation-menu command");
test.assertIncludes(chatMessages, "function renderClioTalkRunAssembly", "ClioTalk renders a pre-send transparent Run Assembly");
test.assertIncludes(chatMessages, 'summary.textContent = t("clio_run_details")', "The everyday Run Assembly control uses a plain-language label instead of exposing internal counts");
test.assertIncludes(chatMessages, "summary.title = assemblySummary", "Detailed Prompt, Skill, Harness, and input counts remain available on demand");
test.assertIncludes(chatMessages, "getClioTalkPromptFileDescriptors", "Run Assembly resolves the real editable Prompt and policy files");
test.assertIncludes(chatMessages, "getClioTalkPendingSkillDescriptors", "Run Assembly previews manual and project-opted-in Skills");
test.assertIncludes(chatMessages, "getClioTalkPendingHarnessDescriptor", "Run Assembly previews the Task Config used as Harness");
test.assertIncludes(chatMessages, "getClioTalkPendingInputDescriptors", "Run Assembly previews file-system inputs");
const clioRunMarkup = indexHtml.match(/id="clio-run-assembly"[\s\S]*?<\/details>/)?.[0] || "";
test.assertNotIncludes(clioRunMarkup, "Web search", "Run Assembly does not invent web capabilities");
test.assertNotIncludes(clioRunMarkup, "Research", "Run Assembly does not invent research capabilities");
test.assertMatches(indexHtml, /id="prompt" rows="1"/, "The composer starts as one calm line and grows with its content");
test.assertMatches(indexHtml, /class="messages-stage"[\s\S]*id="messages"[^>]*aria-busy="false"[\s\S]*id="clio-scroll-latest"/, "ClioTalk owns a scroll stage with a live-region busy state and a latest-message affordance");
test.assertMatches(indexHtml, /class="[^"]*composer-submit-button composer-icon-button"[^>]*id="send"[^>]*disabled/, "Send is a compact icon action and starts inactive when the composer is empty");
test.assertIncludes(indexHtml, '<path d="M10 16V4M4.5 9.5 10 4l5.5 5.5"></path>', "Send uses a clean line arrow with one stem and one open chevron");
test.assertIncludes(indexHtml, '<span class="composer-stop-glyph" aria-hidden="true"></span>', "Stop uses its own compact state glyph in the same control");
test.assertIncludes(chatMessages, "function syncClioTalkSendButton", "Send availability follows the actual composer state");
test.assertIncludes(chatMessages, 'sendButton.disabled = isBusy || !String(promptInput?.value || "").trim()', "Empty input cannot advertise an action that does nothing");
test.assertIncludes(wireup, 'promptInput.addEventListener("focus", syncClioTalkSendButton)', "Programmatically inserted prompts refresh Send when ClioTalk receives focus");
test.assertMatches(styles, /\.composer-submit-button \{[\s\S]*width: 36px;[\s\S]*height: 36px;[\s\S]*place-items: center;[\s\S]*background: var\(--ink\);[\s\S]*color: var\(--paper\);/, "One stable 36-pixel high-emphasis button owns both Send and Stop");
test.assertMatches(styles, /\.composer-send-glyph \{[\s\S]*fill: none;[\s\S]*stroke: currentColor;[\s\S]*stroke-width: 1\.75;[\s\S]*stroke-linecap: round;[\s\S]*stroke-linejoin: round;/, "The upward arrow stays open, crisp, and theme-independent in Classic and Liquid Glass");
test.assertNotIncludes(styles, 'content: "↑"', "Send does not depend on the retro UI font's malformed arrow glyph");
test.assertNotIncludes(indexHtml, 'id="stop"', "Stop is a state of the Send button, not a second overlapping control");
test.assertMatches(styles, /\.composer-submit-button\.is-stop \.composer-send-glyph \{[\s\S]*display: none;[\s\S]*\.composer-submit-button\.is-stop \.composer-stop-glyph \{[\s\S]*display: block;/, "The single button swaps only its internal glyph in Stop mode");
test.assertMatches(indexHtml, /id="retry"[^>]*hidden/, "A global Retry button does not occupy the everyday composer");
test.assertIncludes(indexHtml, 'class="composer-key-hint"', "Desktop users get a quiet Enter and Shift+Enter affordance");
test.assertIncludes(chatMessages, "function createClioTalkActionMenu", "Secondary message actions share one accessible progressive menu");
test.assertMatches(chatMessages, /role === "user"[\s\S]*moreMenu\.append\(editBtn\)[\s\S]*appendMessageTranslation\(moreMenu, item, role, content\)/, "User Edit and Translation stay behind the message overflow menu");
test.assertMatches(chatMessages, /moreMenu\.append\(copyBtn\)[\s\S]*appendMessageTranslation\(moreMenu, item, role, content\)[\s\S]*useMenu\.append\(useResultBtn, chartBtn, undoBtn\)[\s\S]*moreMenu\.append\(ignoreBtn\)/, "Assistant destinations and undo stay in Use Reply while Copy, Translation, and Discard stay in overflow");
test.assertIncludes(chatMessages, 'body.className = "message-content message-error"', "Generation failures render inside the failed assistant turn");
test.assertIncludes(chatMessages, 'retry.className = "btn mini-btn message-retry-button"', "A failed turn owns its contextual Retry action");
test.assertMatches(chatMessages, /retry\.onclick = \(\) => \{[\s\S]*failedUserItem\.remove\(\)[\s\S]*item\.remove\(\)[\s\S]*submitUserText\(options\.retryText, \{[\s\S]*\.\.\.\(options\.retryOptions \|\| \{\}\),[\s\S]*retryOf: options\.userRecordId/, "Retry replaces the failed visual turn and preserves its source-run lineage");
test.assertIncludes(chatMessages, 'submittedUserRecord.deliveryState = "failed"', "A failed request remains visible with an explicit undelivered state");
test.assertMatches(chatMessages, /conversation\.push\(submittedUserRecord\);[\s\S]*ensureCurrentConversationFile\(\)/, "The first durable ClioTalk message creates its Chat file before model transport");
test.assertMatches(chatMessages, /const requiresDurableChatFile = !isTemporaryChat\s*&& options\.fileNative !== false\s*&& !sideAskEnabled\s*&& isClioTalkAnswerContractTask/, "Full ClioTalk remains file-native in both Finder and MultiFinder, with Temporary Chat as the explicit exception");
test.assertIncludes(chatMessages, "clio_project_required_for_chat", "Full ClioTalk refuses an unfiled conversation without a Project Hard Disk");
test.assertIncludes(menus, 'menuItem("start-temporary-clio-chat", "temporary_conversation")', "Temporary Chat lives in the Conversation menu instead of adding another toolbar button");
test.assertIncludes(documentsChat, "async function startTemporaryClioTalkConversation", "Temporary Chat has an explicit lifecycle entry point");
test.assertMatches(documentsChat, /clioTalkTemporaryMode = true;[\s\S]*resetClioTalkRuntimeState\(\{ clearPrompt: true \}\)/, "Entering Temporary Chat starts with a clean in-memory conversation");
test.assertIncludes(chatMessages, "if (clioTalkTemporaryMode) return true;", "Temporary Chat never persists a Chat file or Working Session mutation");
test.assertMatches(chatMessages, /if \(options\.temporaryChat !== true\) \{[\s\S]*recordPromptRun/, "Temporary Chat resolves visible Prompt files without writing Prompt receipt files");
test.assertMatches(chatMessages, /const projectMemoryFiles = !temporaryChat[\s\S]*getProjectMemoryFiles/, "Temporary Chat does not read Project Memory");
test.assertMatches(chatMessages, /const autoCalledSkills = !temporaryChat[\s\S]*getAutoCallableProjectSkills/, "Temporary Chat does not auto-call project Skills");
test.assertMatches(chatMessages, /const useBroadContext = !temporaryChat[\s\S]*retrieveContext/, "Temporary Chat does not automatically search project files");
test.assertMatches(chatMessages, /if \(!temporaryChat && typeof hasMountedFileDiskContext/, "Temporary Chat does not silently inherit the mounted File Floppy");
test.assertIncludes(chatMessages, 'record.temporaryChat ? "clio_temporary_run_summary" : "clio_run_record_summary"', "Temporary replies keep a visible in-window Prompt, Skill, and Harness receipt without a Finder file");
test.assertMatches(workingSession, /if \(clioTalkTemporaryMode\) \{[\s\S]*activeChatFileId: null,[\s\S]*conversation: \[\]/, "Working Session snapshots exclude Temporary Chat contents");
test.assertMatches(read("app/core/window-manager.js"), /name === "assistant" && clioTalkTemporaryMode[\s\S]*confirmDiscardTemporaryClioTalkConversation\(\)[\s\S]*discardTemporaryClioTalkConversation\(\)/, "Closing a non-empty Temporary Chat confirms the irreversible discard");
test.assertMatches(dictionary, /Temporary Chat is an explicit local-storage exception[\s\S]*不创建 Chat 文件、Run Record、Prompt 收据文件、工作会话历史或项目记忆/, "System Help documents the Temporary Chat privacy boundary in both languages");
test.assertMatches(menus, /menuItem\("save-conversation", "save_conversation"\)[\s\S]*copy-current-chat-markdown[\s\S]*download-current-chat-markdown/, "ClioTalk File menu groups save and Markdown export without adding toolbar buttons");
test.assertMatches(menus, /find-in-cliotalk[\s\S]*find-next-in-cliotalk/, "Conversation find lives in the Edit menu");
test.assertMatches(menus, /recent_conversations[\s\S]*rename-active-chat[\s\S]*reveal-active-chat-file/, "Recent, rename, and reveal form one compact saved-Chat lifecycle");
test.assertMatches(documentsChat, /const convertingTemporaryChat = clioTalkTemporaryMode[\s\S]*clioTalkTemporaryMode = false;[\s\S]*saveClioTalkRunRecord\(/, "Saving a Temporary Chat converts its visible manifests into linked Run Record files");
test.assertMatches(documentsChat, /const existing = convertingTemporaryChat \? null : getActiveConversationFile\(\)[\s\S]*const file = existing \|\|/, "Saving an existing Chat updates or moves the same file instead of silently duplicating it");
test.assertIncludes(chatMessages, "function findInClioTalkConversation", "ClioTalk supports in-conversation find without a new sidebar");
test.assertMatches(indexHtml, /data-action="open-clio-attachment-picker"[\s\S]*compose_attach_project_file/, "The existing Add menu exposes project-file attachment");
test.assertMatches(documentsChat, /function isClioTalkAttachableProjectFile[\s\S]*file\.type === "chat"[\s\S]*!String\(file\.artifactKind \|\| ""\)\.trim\(\)/, "Generic attachment accepts ordinary documents and Chats but keeps advanced artifacts on explicit controls");
test.assertMatches(chatMessages, /const explicitInputMessage = window\.lastTaskExplicitInputFiles[\s\S]*explicitly attached to this message[\s\S]*explicitInputMessage/, "Explicit project attachments enter the actual model message stack");
test.assertMatches(chatMessages, /lastTaskExplicitInputFiles[\s\S]*key: `input:/, "Explicit project attachments appear in the reply grounding receipt");
test.assertIncludes(workingSession, "nextTaskInputFileIds", "Normal Working Sessions preserve pending explicit file attachments");
test.assertMatches(dragDrop, /dropTargetType === "clio-attachment"[\s\S]*attachProjectFileToNextClioTalkRun/, "Project files can be dragged directly onto ClioTalk as copied context");
test.assertMatches(documentsChat, /downloadMarkdown\(formatChatFileMarkdown\(file\), file\.name, \{[\s\S]*addToProjectCd: !clioTalkTemporaryMode/, "Exporting a Temporary Chat downloads Markdown without silently writing Project CD");
test.assertMatches(dictionary, /Conversation and File menus expose recent Chats[\s\S]*“对话”与“文件”菜单提供最近 Chat/, "System Help documents the daily Chat lifecycle in both languages");
test.assertIncludes(documentsChat, 'artifactKind: "clio-run-record"', "Every durable model run becomes a real Project Hard Disk file");
test.assertIncludes(chatMessages, "function appendClioTalkRunReceipt", "Replies retain a Finder-linked Run Record receipt contract");
test.assertIncludes(chatMessages, 'runRecordBtn.textContent = t(options.messageRecord.runRecordId ? "clio_view_run_record" : "clio_view_run_details")', "Run transparency moves into the reply overflow instead of occupying the reading flow");
test.assertMatches(styles, /\.message-run-receipt \{[\s\S]*display: none;/, "The duplicate inline Run receipt stays out of the everyday reading surface");
test.assertIncludes(chatMessages, 'disposition.hidden = initialReceiptState === "temporary"', "Temporary reply state does not create a permanent technical label under every answer");
test.assertMatches(chatMessages, /function resolvePendingStatus[\s\S]*body\.append\(copy, retry\);[\s\S]*setStatus\(t\("clio_message_not_sent"\)\)/, "Inline retry errors keep details in the failed turn while the details bar exposes a concise error state");
test.assertIncludes(documentsChat, "function saveClioTalkRunRecord", "Completed, stopped, and failed requests share one durable Run Record writer");
test.assertIncludes(documentsChat, "window.nextTaskHarnessFileId = file.id", "Running a Task Config explicitly carries its file as the next Harness");
test.assertIncludes(documentsChat, "window.nextTaskInputFileIds = new Set", "Task Config input files enter the next run manifest");
test.assertIncludes(chatMessages, '.filter((message) => !["failed", "sending"].includes(message?.deliveryState))', "Undelivered and in-flight messages never enter the next model request");
test.assertIncludes(chatMessages, '!["failed", "sending"].includes(message?.deliveryState)', "Undelivered and in-flight messages never enter compressed conversation memory");
test.assertIncludes(chatMessages, ".map((message) => ({ role: message.role, content: message.content }))", "Conversation records are reduced to API-safe role and content fields before sending");
test.assertMatches(chatMessages, /deliveryState: "sending"[\s\S]*conversation\.push\(submittedUserRecord\)[\s\S]*persistClioTalkConversationMutation\(\)/, "A sent prompt enters durable working state before the model finishes");
test.assertIncludes(chatMessages, 'submittedUserRecord.deliveryState = "sent"', "Successful and stopped requests convert the in-flight prompt to delivered");
test.assertMatches(chatMessages, /function finalizeClioTalkAssistantReply[\s\S]*resolveClioTalkReplySafely\([\s\S]*persistClioTalkConversationMutation\(\)/, "A completed reply updates both a saved chat file and an unsaved working session");
test.assertIncludes(chatMessages, 'item.deliveryState === "sending" ? "failed"', "An interrupted restart converts an abandoned in-flight prompt into a retryable failed state");
test.assertIncludes(documentsChat, 'item.deliveryState === "sending" ? "failed"', "Saved chat files also recover abandoned in-flight prompts as failed");
test.assertIncludes(chatMessages, 'const partialContent = String(error?.partialContent || pendingMessage?.dataset.rawContent || "").trim()', "Stopping reads the actual streamed partial reply");
test.assertIncludes(chatMessages, "stopped: true", "Stopped partial replies are retained as durable message state");
test.assertIncludes(chatMessages, 'finishReason: "stopped"', "Stopped partial replies retain an explicit finish reason");
test.assertIncludes(chatMessages, "function appendClioTalkRunState", "Restored stopped and failed turns rebuild their contextual actions");
test.assertIncludes(chatMessages, 'taskKind: record.taskKind || "chat"', "Continue preserves SideAsk or chat task identity");
test.assertIncludes(chatMessages, "function clioTalkReplayOptions", "Retry and Continue persist only safe serializable request options");
test.assertIncludes(chatMessages, "continuationMessageId", "Continue explicitly carries the interrupted turn identity");
test.assertIncludes(chatMessages, "function finalizeClioTalkAssistantReply", "A received reply is finalized independently from optional local receipts");
test.assertIncludes(chatMessages, "function persistClioTalkConversationMutation", "Chat-file and Working Session persistence failures are contained");
test.assertIncludes(chatMessages, "requestMessageId", "Assistant records retain their source request for exact continuation");
test.assertIncludes(chatMessages, 'runStatus: assistantRecord.incomplete ? "incomplete" : "completed"', "Provider-truncated replies remain visibly continuable");
test.assertIncludes(chatMessages, "clio_reply_preserved_record_warning", "A local archive failure never masquerades as a cloud transport failure");
test.assertMatches(contextRetrieval, /function isImplicitProjectSourceFile[\s\S]*!String\(file\.artifactKind \|\| ""\)\.trim\(\)[\s\S]*\.filter\(isImplicitProjectSourceFile\)/, "Prompt, Skill, Harness, Memory, and Run Record files never leak into ordinary source retrieval");
test.assertMatches(chatMessages, /function setComposerSubmitMode\(isBusy\)[\s\S]*button\.type = isBusy \? "button" : "submit"[\s\S]*button\.classList\.toggle\("is-stop", isBusy\)[\s\S]*function setComposerBusy\(isBusy\)[\s\S]*setComposerSubmitMode\(isBusy\)/, "Generation morphs one Send element into Stop instead of swapping overlapping buttons");
test.assertMatches(chatMessages, /function setComposerBusy\(isBusy\)[\s\S]*composeToolsToggleButton\.disabled = false[\s\S]*clio_composer_draft_hint/, "Attachments and next-message drafting remain available while ClioTalk works");
test.assertIncludes(chatMessages, "function handleClioTalkMessagesScroll", "ClioTalk tracks whether the reader is following the latest message");
test.assertMatches(chatMessages, /function scrollMessagesToLatest\(\{ force = false \} = \{\}\)[\s\S]*if \(!force && !clioTalkAutoFollow\)[\s\S]*return;/, "Streaming does not yank the reader away from older messages");
test.assertIncludes(wireup, 'messagesEl?.addEventListener("scroll", handleClioTalkMessagesScroll', "The message scroller updates the latest-message affordance");
test.assertIncludes(wireup, "scrollMessagesToLatest({ force: true })", "The latest-message control deliberately resumes automatic following");
test.assertIncludes(chatMessages, 't("clio_progress")', "Streaming progress has localized accessibility copy");
test.assertIncludes(chatMessages, 't("clio_working_steps")', "Streaming steps have localized accessibility copy");
test.assertIncludes(chatMessages, "clioTalkAssistantDisplayName()", "Pending and resolved SideAsk replies preserve their visible assistant identity");
test.assertMatches(wireup, /compose-tools-menu"\)\?\.addEventListener\("keydown"[\s\S]*ArrowDown[\s\S]*ArrowUp[\s\S]*Home[\s\S]*End[\s\S]*Escape[\s\S]*composeToolsToggleButton\?\.focus\(\)/, "The composer tool menu supports menu-key navigation and restores focus on Escape");
test.assertMatches(chatMessages, /function installClioTalkDetailsMenu[\s\S]*Escape[\s\S]*summary\.focus\(\)[\s\S]*ArrowDown[\s\S]*ArrowUp[\s\S]*Home[\s\S]*End/, "Message action menus support full menu-key navigation and restore focus");
test.assertIncludes(scrapbook, "scraps.find(s => s.id === id && isInActiveProject(s))", "Attached clips cannot leak across projects");
test.assertIncludes(scrapbook, 'btn.setAttribute("aria-label", t("clio_remove_attachment", scrap.title))', "Each attached clip has an explicit accessible removal action");
test.assertMatches(scrapbook, /function toggleClipAttachment[\s\S]*scheduleRenderTasks\("contextPanel"\)[\s\S]*scheduleWorkingSessionSave\(\)/, "Attachment changes immediately update context receipts and the working session");
test.assertIncludes(styles, ".message-actions", "Progressive message actions retain a stable styling hook");
test.assertMatches(styles, /\.message-actions \{[\s\S]*opacity: 0;[\s\S]*\.message:last-child \.message-actions,[\s\S]*\.message:focus-within \.message-actions,[\s\S]*\.message-actions:has\(details\[open\]\)/, "Message actions stay quiet until the latest turn, hover, focus, or an open menu needs them");
test.assertMatches(styles, /\.message-use-menu,[\s\S]*\.message-action-menu \{[\s\S]*position: absolute;/, "Reply and overflow menus overlay the reading surface instead of expanding the message");
test.assertMatches(styles, /\.compose-tools-menu,[\s\S]*\.message-use-menu,[\s\S]*\.message-action-menu,[\s\S]*\.clio-scroll-latest \{[\s\S]*z-index: var\(--z-local-popover\)/, "Composer, message menus, and the latest control share the named local popover layer");
test.assertMatches(styles, /\.compose-tools-menu,[\s\S]*\.clio-run-panel,[\s\S]*z-index: var\(--z-local-popover\)/, "Run Assembly reuses the named window-local popover layer");
test.assertIncludes(foundationStyles, "--clio-assembly-bg", "Classic Run Assembly material is tokenized");
test.assertIncludes(liquidStyles, "--clio-assembly-bg", "Liquid Glass swaps Run Assembly material through shared tokens");
test.assertMatches(styles, /\.composer textarea \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*resize: none;/, "The composer is one semantic surface rather than a textarea nested inside another panel");
test.assertMatches(styles, /\.composer \.composer-icon-button \{[\s\S]*width: 36px;[\s\S]*min-width: 36px;[\s\S]*height: 36px;/, "Composer controls retain a compact stable target size in Classic");
test.assertMatches(styles, /\.assistant-window:not\(\.is-quick-draft-sideask\) \.message:not\(\.clio-welcome\) \{[\s\S]*grid-template-columns: var\(--clio-speaker-gutter\) minmax\(0, 1fr\)/, "ClioTalk reads as a file-native conversation ledger with a stable speaker gutter");
test.assertMatches(styles, /\.assistant-window:not\(\.is-quick-draft-sideask\) \.speaker \{[\s\S]*display: block;[\s\S]*text-align: right;/, "Visible speaker labels make every Chat-file record attributable without adding more controls");
test.assertIncludes(chatMessages, 'item.setAttribute("aria-label", role === "user" ? t("you") : clioTalkAssistantDisplayName())', "Visible speaker labels retain matching message ownership for assistive technology");
test.assertMatches(styles, /\.clio-welcome::before \{[\s\S]*border: var\(--clio-welcome-object-border\)/, "The empty state introduces a real Chat-file object instead of a generic AI hero");
test.assertIncludes(styles, ".messages-stage", "The message scroller and latest-message control share one window-local owner");
test.assertIncludes(styles, ".clio-scroll-latest", "The latest-message affordance has a stable visual hook");
test.assertIncludes(styles, ".message.pending.streaming .message-content::after", "Streaming uses a lightweight state caret instead of a second loading card");
test.assertMatches(foundationStyles, /prefers-reduced-motion[\s\S]*\.message\.pending\.streaming \.message-content::after[\s\S]*animation: none;/, "Streaming feedback honors reduced motion");
test.assertMatches(responsiveStyles, /\.assistant-window \.composer-action-row \{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto;/, "Mobile keeps Add, context, and send in one compact composer hierarchy");
test.assertIncludes(liquidStyles, "--clio-composer-bg", "Liquid Glass uses the shared semantic composer tokens");
test.assertMatches(liquidStyles, /body\.use-liquid-glass \.composer \{[\s\S]*backdrop-filter: blur/, "Liquid Glass upgrades the same composer structure with material treatment");
for (const scenario of ['id: "ready-to-send"', 'id: "stopped"', 'id: "streaming"', 'id: "sideask"', 'id: "reading-history"', 'id: "run-assembly"', 'id: "run-record"']) {
  test.assertIncludes(surfaceSnapshots, scenario, `${scenario} is covered by the ClioTalk Classic/Liquid surface snapshot`);
}
for (const key of ["clio_scroll_latest", "clio_progress", "clio_working_steps", "clio_reply_stopped", "clio_reply_output_limit", "clio_reply_provider_stopped", "clio_reply_interrupted", "clio_reply_preserved_record_warning", "clio_message_not_sent", "clio_continue_reply"]) {
  test.assertIncludes(translationsEn, key, `English ClioTalk state copy includes ${key}`);
  test.assertIncludes(translationsZh, key, `Chinese ClioTalk state copy includes ${key}`);
}
for (const key of ["file_floppy", "local_model"]) {
  test.assertIncludes(translationsEn, `${key}:`, `English includes the ClioTalk ${key} label`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese includes the ClioTalk ${key} label`);
}

// A reply carries two menus on one row. They must behave like System 6 menus:
// one open at a time, dismissed by a click elsewhere, never cut off by the
// transcript's edge.
test.assertIncludes(chatMessages, "function closeOtherClioTalkMessageMenus(except = null)", "opening one message menu closes every other one");
test.assertIncludes(chatMessages, 'document.querySelectorAll(".message-actions details[open]")', "menu exclusion spans the whole transcript, not one message");
test.assertIncludes(chatMessages, "function bindClioTalkMenuDismiss()", "a pointer landing outside the menu closes it, the only exit a phone has");
test.assertIncludes(chatMessages, "function placeClioTalkMenu(details, menu)", "a menu with no room above it opens downward instead of being clipped");
test.assertIncludes(styles, ".message-action-menu.is-below {", "the flipped menu has an owned anchor rule");
test.assertIncludes(chatMessages, "if (actions.children.length) item.append(actions);", "the action row is a grid child of the message, not content inside the reply bubble");
test.assertNotIncludes(chatMessages, 'item.querySelector(".message-content")?.append(actions)', "the user's own actions never sit inside the message bubble");
test.assertIncludes(chatMessages, "function syncClioTalkMenuAvailability(details, menu)", "a menu with no available item steps aside instead of opening empty");
test.assertIncludes(chatMessages, "syncClioTalkMenuAvailability(useDetails, useMenu)", "a reply with no saved record offers no destination menu");

test.finish();
