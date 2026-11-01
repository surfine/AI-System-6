// Finder Labels: user-set status colors on project files (Cite, To Verify,
// Counter, Judgment, Final, Blocked). They live in a separate field so they
// never collide with the writing route's draft/ai/final workflow labels.
// Users set them in Get Info; AI may suggest but never writes them silently.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-labels");
const finderObjects = read("app/features/finder-objects.js");
const documentsChat = read("app/features/documents-chat.js");
const projectDisk = read("app/features/project-disk.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const icons = read("styles/40-icons.css");

test.assertIncludes(finderObjects, "finderLabelVocabulary", "the label vocabulary is declared once");
test.assertIncludes(finderObjects, 'id: "cite"', "Cite label is declared");
test.assertIncludes(finderObjects, 'id: "verify"', "To Verify label is declared");
test.assertIncludes(finderObjects, 'id: "counter"', "Counter label is declared");
test.assertIncludes(finderObjects, 'id: "judgment"', "Judgment label is declared");
test.assertIncludes(finderObjects, 'id: "final"', "Final label is declared");
test.assertIncludes(finderObjects, 'id: "blocked"', "Blocked label is declared");
test.assertNotMatches(finderObjects, /id: "draft"/, "user labels never reuse the writing-route workflow label");
test.assertIncludes(finderObjects, "function renderFinderLabelInfo", "Get Info renders the label picker");
test.assertIncludes(finderObjects, "fileInfoItem.finderLabel", "choosing a label writes the separate finderLabel field");
test.assertIncludes(finderObjects, "never write them silently", "labels stay user-controlled");
test.assertIncludes(finderObjects, "finderLabelSuggestion", "AI suggestions live in their own field");
test.assertNotMatches(finderObjects, /finderLabelSuggestion[\s\S]{0,80}finderLabel\s*=/, "a suggestion never writes the user label directly");
test.assertIncludes(finderObjects, "suggest", "the suggestion row is rendered in Get Info only");
test.assertIncludes(finderObjects, "does not inherit", "folder labels never cascade to contained files");

test.assertIncludes(documentsChat, 'finder-label-${file.finderLabel || "none"}', "Documents window rows carry the label class");
test.assertIncludes(documentsChat, "folder.finderLabel", "folders carry their own label");
test.assertIncludes(projectDisk, 'finder-label-${item.finderLabel || "none"}', "Project Disk rows carry the label class");
test.assertIncludes(desktopRuntime, "renderFinderObjectInfo(item)", "Get Info renders labels for every file");
test.assertIncludes(desktopRuntime, "withFinderObjects", "the label picker loads the lazy finder-objects module on first Get Info");

test.assertIncludes(icons, ".finder-label-cite { color:", "Cite has a Classic label hue");
test.assertIncludes(icons, ".finder-label-verify { color:", "To Verify has a label hue");
test.assertIncludes(icons, ".finder-label-counter { color:", "Counter has a label hue");
test.assertIncludes(icons, ".finder-label-judgment { color:", "Judgment has a label hue");
test.assertIncludes(icons, ".finder-label-final { color:", "Final has a label hue");
test.assertIncludes(icons, ".finder-label-blocked { color:", "Blocked has a label hue");

test.finish();
