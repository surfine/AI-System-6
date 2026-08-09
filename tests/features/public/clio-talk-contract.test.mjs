// Public-safe ClioTalk contract: composer, message records, and project
// conversation persistence live behind a stable public surface.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-clio-talk");
const html = read("index.html");
const chat = read("app/core/chat-messages.js");
const menus = read("app/data/menus.js");

test.assertIncludes(html, 'id="chat-form"', "ClioTalk owns the composer form");
test.assertIncludes(html, 'id="prompt"', "ClioTalk owns the prompt input");
test.assertIncludes(html, 'id="messages"', "ClioTalk owns the message stream");
test.assertIncludes(chat, "function submitUserText", "ClioTalk submits user text through one entry point");
test.assertIncludes(chat, "function createClioTalkAssistantRecord", "ClioTalk records assistant replies as project objects");
test.assertIncludes(chat, "persistClioTalkConversationMutation", "conversations persist to the project");
test.assertIncludes(chat, "function addMessage", "messages render through the shared message renderer");
test.assertIncludes(menus, 'menuItem("save-conversation"', "saving a conversation is a menu command");

test.finish();
