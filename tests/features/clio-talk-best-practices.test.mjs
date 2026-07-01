// ClioTalk borrows useful Siri-prompt practices at the product layer:
// answer first, treat visible objects as entities, separate source/inference
// boundaries, and show the user which AI System 6 sources grounded a reply.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clio-talk-best-practices");

const chatMessages = read("app/core/chat-messages.js");
const wireup = read("app/core/wireup.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

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
  /function resolvePendingMessage\(item, role, content, options = \{\}\)[\s\S]*appendMessageGrounding\(item, options\.grounding \|\| null\)[\s\S]*appendMessageActions\(item, role, content\)/,
  "Grounding renders before message action buttons on resolved assistant replies"
);
test.assertMatches(
  chatMessages,
  /const grounding = captureClioTalkGroundingSnapshot\([\s\S]*resolvePendingMessage\(pendingMessage, "assistant", assistantText, \{ grounding \}\)/,
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

test.finish();
