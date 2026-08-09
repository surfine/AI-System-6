// Five core apps (Draft Desk, TeachText, Review Desk, Project Hard Disk,
// ClioTalk) share one command vocabulary: same copy, same receipts, same
// failure semantics. No app invents its own Save / Retry / Share wording.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("app-command-consistency");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const actions = read("app/core/actions.js");
const chatMessages = read("app/core/chat-messages.js");

// Save receipt copy is shared: TeachText "Saved" === Draft Desk "Saved".
test.assertIncludes(en, 'saved: "Saved"', "TeachText save receipt reads Saved");
test.assertIncludes(en, 'quick_draft_saved_state: "Saved"', "Draft Desk save receipt reads Saved");
test.assertIncludes(en, 'modified: "Modified"', "TeachText modified receipt reads Modified");
test.assertIncludes(en, 'quick_draft_modified_state: "Modified"', "Draft Desk modified receipt reads Modified");
test.assertIncludes(zh, 'saved: "已保存"', "Chinese TeachText save receipt is 已保存");
test.assertIncludes(zh, 'quick_draft_saved_state: "已保存"', "Chinese Draft Desk save receipt is 已保存");
test.assertNotIncludes(en, "Successfully persisted", "no app uses invented success wording");

// Retry is one shared concept across apps.
test.assertIncludes(en, 'retry: "Retry"', "Retry has one shared key");
test.assertIncludes(actions, '"retry-current-ai-action"', "retry is a shared executable action");
test.assertIncludes(chatMessages, 'resolvePendingStatus', "ClioTalk retries through the shared message path");

// Share / Download come from the shared web-platform vocabulary.
test.assertIncludes(en, 'share_ellipsis: "Share…"', "Share uses the shared key");
test.assertIncludes(en, 'share_markdown_done:', "Draft Desk share success uses the shared receipt");
test.assertIncludes(en, "download_markdown", "Download uses a shared key");

// Close semantics: every first-class writing app flushes before closing, and
// a failed flush keeps the window open.
test.assertIncludes(actions, 'const closed = await closeWindow(active.dataset.window)', "close-active-window awaits the close");
test.assertIncludes(actions, 'if (closed === false) return', "a blocked close never hands focus away");

// Error copy pairs message + next step across the five apps' high-frequency
// paths.
for (const key of [
  "quick_draft_save_failed",
  "cloud_connection_failed_message",
  "cloud_connection_failed_action",
  "local_connection_failed_message",
  "local_connection_failed_action",
  "share_markdown_failed",
  "project_storage_unavailable_message",
  "project_storage_unavailable_action",
]) {
  test.assertIncludes(en, `${key}:`, `English error ${key} exists`);
  test.assertIncludes(zh, `${key}:`, `Chinese error ${key} exists`);
}

test.finish();
