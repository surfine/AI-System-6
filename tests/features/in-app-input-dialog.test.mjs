// Every user-facing text entry runs through one shared in-app dialog instead
// of a native browser prompt. Native prompts are invisible to the packaged
// WebKit shell and break the System 6 control grammar; the shared dialog is
// the single product-correct path for naming, editing, and short answers.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("in-app-input-dialog");
const modal = read("app/core/modal.js");
const html = read("index.html");
const chatMessages = read("app/core/chat-messages.js");
const translation = read("app/features/translation.js");
const documentsChat = read("app/features/documents-chat.js");
const actions = read("app/core/actions.js");

test.assertIncludes(html, 'id="app-input-modal"', "the app ships one shared in-app input dialog");
test.assertIncludes(html, 'class="finder-operation-modal app-input-modal"', "the shared input dialog reuses the System 6 operation-modal grammar");
test.assertIncludes(html, 'id="app-input-field"', "the shared input dialog has a single-line field");
test.assertIncludes(html, 'id="app-input-textarea"', "the shared input dialog has a multi-line field");
test.assertIncludes(modal, "function showInputDialog", "the shared input dialog helper exists in the modal bridge");
test.assertIncludes(modal, "multiline", "the shared input dialog supports multi-line fields");

test.assertNotIncludes(chatMessages, "window.prompt(", "ClioTalk find uses the in-app dialog");
test.assertNotIncludes(translation, "window.prompt(", "writing tools use the in-app dialog");
test.assertNotIncludes(documentsChat, "window.prompt(", "documents, memory, and Skill flows use the in-app dialog");
test.assertNotIncludes(documentsChat, "window.confirm(", "documents use the in-app confirm modal");
test.assertIncludes(actions, "await createProjectMemoryDraft()", "memory creation awaits the in-app dialogs");
test.assertIncludes(actions, "await configureSkillAutoCall()", "Skill auto-call configuration awaits the in-app dialogs");
test.assertIncludes(actions, "await selectProjectSkillForNextTask()", "Skill selection awaits the in-app dialog");
test.assertIncludes(actions, "await installMountedSkillPackage()", "Skill install awaits the in-app dialog");

test.finish();
