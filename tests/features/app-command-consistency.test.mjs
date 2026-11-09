// Five core apps (Draft Desk, TeachText, Review Desk, Project Hard Disk,
// ClioTalk) share one command vocabulary: same copy, same receipts, same
// failure semantics. No app invents its own Save / Retry / Share wording.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import vm from "node:vm";

const test = createFeatureTest("app-command-consistency");
// The translation tables are classic scripts installing window globals;
// loading them in a VM executes the shipped data instead of asserting on the
// file's text (the reader-era-rail recipe).
const loadTable = (path, name) => vm.runInContext(`${read(path)}; window.${name}`, vm.createContext({ window: {} }));
const en = loadTable("app/data/translations-en.js", "AISystem6TranslationsEn");
const zh = loadTable("app/data/translations-zh.js", "AISystem6TranslationsZh");
const actions = read("app/core/actions.js");
const chatMessages = read("app/core/chat-messages.js");

// Save receipt copy is shared: TeachText "Saved" === Draft Desk "Saved".
test.assert(en.saved === "Saved" && en.quick_draft_saved_state === "Saved", "TeachText and Draft Desk save receipts both read Saved");
test.assert(en.modified === "Modified" && en.quick_draft_modified_state === "Modified", "both modified receipts read Modified");
test.assert(zh.saved === "已保存" && zh.quick_draft_saved_state === "已保存", "Chinese save receipts are 已保存");
test.assertNotIncludes(en, "Successfully persisted", "no app uses invented success wording");

// Retry is one shared concept across apps.
test.assert(en.retry === "Retry", "Retry has one shared key");
test.assertIncludes(actions, '"retry-current-ai-action"', "retry is a shared executable action");
test.assertIncludes(chatMessages, 'resolvePendingStatus', "ClioTalk retries through the shared message path");

// Share / Download come from the shared web-platform vocabulary.
test.assert(String(en.share_ellipsis || "").startsWith("Share"), "Share uses the shared key");
test.assert("share_markdown_done" in en, "Draft Desk share success uses the shared receipt");
test.assert(Object.keys(en).some((key) => key.startsWith("download_markdown")), "Download uses a shared key");

// Close semantics: every first-class writing app flushes before closing, and
// a failed flush keeps the window open.
// The close targets the key window's own instance (multi-instance spec §4:
// closeWindow升级为 (kind, force, instance)); the await and the blocked-close
// rule are unchanged.
test.assertIncludes(actions, 'const closed = await closeWindow(active.dataset.window, false, active.dataset.windowInstance)', "close-active-window awaits the close");
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
  test.assert(key in en, `English error ${key} exists`);
  test.assert(key in zh, `Chinese error ${key} exists`);
}

test.finish();
