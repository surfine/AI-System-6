// Recipient Handoff is the generic product layer beneath the Mingming preset:
// AI System 6 helps people prepare work for real recipients with less friction,
// while keeping private Creator/Mingming behavior in dedicated lenses.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("recipient-handoff");

const index = read("index.html");
const claude = read("CLAUDE.md");
const questionSheet = read("app/core/question-sheet.js");
const chatMessages = read("app/core/chat-messages.js");
const writingFlowHelp = read("app/data/writing-flow-help.js");
const dictionary = read("app/data/system-dictionary.js");
const concepts = read("app/data/system-concepts.js");
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");

test.assertIncludes(questionSheet, '"recipient"', "Question Sheet tracks the recipient as first-class writing intent");
test.assertIncludes(questionSheet, '"rawInput"', "Question Sheet tracks rough human input before prose");
test.assertIncludes(questionSheet, '"handoff"', "Question Sheet tracks handoff friction as first-class writing intent");
test.assertIncludes(questionSheet, 'recipient: "接收者 / 受众"', "Chinese Question Sheet names the recipient field generically");
test.assertIncludes(questionSheet, 'rawInput: "原始输入 / 碎念"', "Chinese Question Sheet names rough input");
test.assertIncludes(questionSheet, 'recipient: "Recipient / Audience"', "English Question Sheet names the recipient field generically");
test.assertIncludes(questionSheet, 'rawInput: "Raw Input / Stray Thoughts"', "English Question Sheet names rough input");
test.assertIncludes(questionSheet, 'handoff: "交付减摩擦"', "Chinese Question Sheet names handoff friction");
test.assertIncludes(questionSheet, 'handoff: "Handoff Friction"', "English Question Sheet names handoff friction");
test.assertIncludes(questionSheet, "真实的人或真实群体", "Question Sheet prompt asks for a real person or group");
test.assertIncludes(questionSheet, "粗糙观察、个人细节、犹豫、吐槽和口头判断", "Question Sheet prompt preserves messy human input");
test.assertIncludes(questionSheet, "不要为了整齐把它们漂洗成模型自己的话", "Question Sheet prompt rejects model-mouthpiece smoothing");
test.assertIncludes(questionSheet, "让对方更容易接收", "Question Sheet prompt favors recipient ease over more output");
test.assertNotIncludes(questionSheet, "铭铭", "Generic Question Sheet layer is not Mingming-specific");

test.assertIncludes(claude, "protects a writer's own language", "Product charter protects the writer's language");
test.assertIncludes(claude, "must not become the writer's mouthpiece", "Product charter rejects model-mouthpiece behavior");
test.assertIncludes(claude, "Question Sheet must welcome messy human input", "Product charter makes rough input part of the route");
test.assertIncludes(claude, "Review Desk must check for AI-mouthpiece drift", "Product charter makes AI-mouthpiece drift a review concern");

test.assertIncludes(index, "real recipient can receive", "ClioTalk default system prompt names real recipient handoff");
test.assertIncludes(index, "the writer's own language", "ClioTalk default system prompt protects the writer's language");
test.assertIncludes(index, "model mouthpiece", "ClioTalk default system prompt rejects model-mouthpiece behavior");
test.assertIncludes(index, "low-pressure", "ClioTalk default system prompt avoids creating pressure by default");
test.assertNotIncludes(index.match(/<textarea id="system"[\s\S]*?<\/textarea>/)?.[0] || "", "Mingming", "Default ClioTalk system prompt stays generic");

test.assertIncludes(chatMessages, "real recipient can receive", "Runtime product identity includes real recipient handoff");
test.assertIncludes(chatMessages, "their own language", "Runtime product identity protects the writer's language");
test.assertIncludes(chatMessages, "model mouthpiece", "Runtime product identity rejects model-mouthpiece drift");
test.assertIncludes(chatMessages, "generic model language", "Runtime product identity prefers concrete input over style bans");
test.assertIncludes(chatMessages, "more variants", "Runtime product identity rejects more-output-by-default");
test.assertIncludes(chatMessages, "Question Sheet owns the problem, recipient, constraints, and handoff friction", "Runtime product identity makes recipient and friction part of the main route");
test.assertIncludes(chatMessages, "fewer, clearer handoffs", "Runtime product identity favors fewer clearer handoffs");
test.assertIncludes(chatMessages, "界面语言是简体中文", "Runtime language instruction anchors Chinese UI responses");
test.assertIncludes(chatMessages, "默认用简体中文回答", "ClioTalk defaults to Chinese in Chinese UI");
test.assertIncludes(chatMessages, "不要因为系统上下文或术语名是英文而改用英文", "English context must not pull Chinese UI chats into English");

test.assertIncludes(writingFlowHelp, "真实接收者", "Writing Flow Help explains the real-recipient layer");
test.assertIncludes(writingFlowHelp, "模型变成你的嘴替", "Writing Flow Help explains anti-mouthpiece purpose");
test.assertIncludes(writingFlowHelp, "粗糙表达、个人碎事、犹豫、吐槽和多样的缺陷", "Writing Flow Help preserves rough human voice");
test.assertIncludes(writingFlowHelp, "交付摩擦", "Writing Flow Help explains handoff friction");
test.assertIncludes(writingFlowHelp, "更少、更清楚的交付", "Writing Flow Help prefers fewer clearer handoffs");
test.assertIncludes(writingFlowHelp, "another person, team, client, audience, or editor", "English help keeps the product useful for ordinary users");
test.assertNotIncludes(writingFlowHelp, "铭铭", "Generic Writing Flow Help is not Mingming-specific");

test.assertIncludes(dictionary, "real recipient with less friction", "System Dictionary defines AI System 6 through recipient handoff");
test.assertIncludes(dictionary, "writer's own language", "System Dictionary defines AI System 6 through writer language");
test.assertIncludes(dictionary, "model mouthpiece", "System Dictionary rejects model-mouthpiece behavior");
test.assertIncludes(dictionary, "接收者、问题、反对意见", "System Dictionary defines Question Sheet through recipient intent");
test.assertIncludes(dictionary, "粗糙人类输入", "System Dictionary defines Question Sheet through rough human input");
test.assertIncludes(dictionary, "不会默认制造更多版本和任务", "System Dictionary keeps ClioTalk from multiplying work by default");

test.assertIncludes(concepts, "真实接收者", "System concepts include the real-recipient product layer");
test.assertIncludes(concepts, "模型嘴替", "System concepts include anti-mouthpiece product purpose");
test.assertIncludes(concepts, "输入太稀薄", "System concepts explain why rough input matters");
test.assertIncludes(concepts, "保护写作者语言", "System concepts generation must cover protecting writer language");
test.assertIncludes(concepts, "anti-model-mouthpiece behavior", "English system concepts generation must cover anti-mouthpiece behavior");
test.assertIncludes(concepts, "更少、更清楚的交付", "System concepts prefer fewer clearer handoffs");
test.assertIncludes(concepts, "rather than more variants", "English system concepts reject variant-sprawl");

test.assertIncludes(zh, "这份作品要交给谁？", "Chinese Question Sheet hint starts with the recipient");
test.assertIncludes(zh, "粗糙观察、个人细节", "Chinese Question Sheet hint asks for rough human input");
test.assertIncludes(zh, "交付摩擦", "Chinese Question Sheet hint mentions handoff friction");
test.assertIncludes(zh, "粗糙人类输入", "Chinese first-route guide names rough input before prose");
test.assertIncludes(en, "Who will receive this?", "English Question Sheet hint starts with the recipient");
test.assertIncludes(en, "rough observations, personal details", "English Question Sheet hint asks for rough human input");
test.assertIncludes(en, "handoff friction", "English Question Sheet hint mentions handoff friction");
test.assertIncludes(en, "rough human input", "English first-route guide names rough input before prose");

test.finish();
