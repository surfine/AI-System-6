// Image attachments are one object shared by every surface, not a copy per
// window. The rules this pins:
//   - a picture lives in its own store, so project and scrap records stay small
//   - the model integration point is one function, so a new surface cannot
//     invent its own way to send an image
//   - reading a picture returns text and stores nothing; AI output is
//     temporary until the writer acts on it
//   - the budget compressor must never flatten an image block back into text

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("image-attachments");

const module_ = read("app/core/image-attachments.js");
const config = read("app/core/config.js");
const projectDisk = read("app/features/project-disk.js");
const persistence = read("app/core/persistence-status.js");
const stateStores = read("app/core/state-stores.js");
const chatMessages = read("app/core/chat-messages.js");
const teachText = read("app/features/teachtext-accessories.js");
const appEntry = read("app.js");
const manifest = read("tooling/runtime-manifest.mjs");
const serviceProviders = read("app/core/service-providers.js");

test.assertIncludes(manifest, "\"app/core/image-attachments.js\"", "the shared module is in the boot bundle");
test.assertNotIncludes(manifest, "lazyRuntimePaths.push(\"app/core/image-attachments.js\")", "the shared module is not lazy");

test.assertIncludes(config, "indexedDbVersion: 5", "the database version carries the new store");
test.assertIncludes(config, "imageAttachmentsStoreName: \"imageAttachments\"", "the store has a name");
test.assertIncludes(projectDisk, "db.createObjectStore(imageAttachmentsStoreName", "the store is created on upgrade");
test.assertIncludes(projectDisk, "store.createIndex(\"projectId\"", "attachments are indexed by project");
test.assertIncludes(projectDisk, "migrateLegacyProjectImageAttachments(project)", "an older inline album is migrated into the store");
test.assertIncludes(appEntry, "imageAttachmentsStoreName,", "app.js destructures the store name, or boot breaks");
test.assertIncludes(appEntry, "const imageAttachments = [];", "app.js declares the in-memory collection");
test.assertIncludes(stateStores, "[\"imageAttachments\", imageAttachments]", "rollback snapshots include attachments");
test.assertIncludes(persistence, "storeName: imageAttachmentsStoreName", "attachments are saved with the other collections");
test.assertIncludes(persistence, "storedImageAttachments", "attachments are loaded at startup");

test.assertIncludes(module_, "function attachImagesToModelMessages", "one function attaches images to a model payload");
test.assertIncludes(module_, "message.role !== \"user\"", "images ride only in a user message, which the provider requires");
test.assertIncludes(module_, "IMAGE_ATTACHMENT_MODEL_LIMIT = 4", "a payload carries a bounded number of images");
test.assertIncludes(module_, "function migrateLegacyProjectImageAttachments", "the legacy album has a migration path");
test.assertIncludes(module_, "const IMAGE_ATTACHMENT_ACCEPT", "one accept list, not one per surface");
test.assertNotIncludes(module_, "saveDeskState()", "the shared module never persists on the caller's behalf");

test.assertIncludes(chatMessages, "IMAGE_BLOCK_TOKEN_ESTIMATE", "an image block has its own token estimate");
test.assertIncludes(
  chatMessages,
  "if (Array.isArray(text)) {\n    return text.map((block) => (block && block.type === \"text\"",
  "the continuity compressor keeps image blocks whole"
);

test.assertIncludes(teachText, "imageAttachmentsForProject(project.id", "Picture Album reads the shared store");
test.assertIncludes(teachText, "analyzeImageAttachment(attachment", "Picture Album reads images through the shared helper");
test.assertNotIncludes(teachText, "project.imageAttachments = attachments", "Picture Album no longer writes the album onto the project record");
test.assertNotIncludes(teachText, "fetch(\"/api/vision/analyze\"", "Picture Album still never sends its images through the VPS");

test.assertIncludes(serviceProviders, "\"vision.analyze\"", "the browser has a caller for the vision route");

test.finish();
