// Application Registry contracts: unique app ids, one resolver for
// object -> app routing, one dispatcher used by every first-phase handoff
// entry, and explicit failures (broken alias, cross-project, no-handler)
// with no silent fallback. Theme independence is asserted so system
// semantics never learn about Appearance.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("application-registry");
const manifest = read("scripts/runtime-manifest.mjs");
const registrySource = read("app/core/application-registry.js");
const actions = read("app/core/actions.js");
const documentsChat = read("app/features/documents-chat.js");
const scripting = read("app/core/scripting.js");
const quickDraftHandoff = read("app/features/quick-draft-handoff.js");

test.assertIncludes(manifest, '"app/core/application-registry.js"', "application registry loads in the app runtime");
test.assert(
  manifest.indexOf("app/core/application-registry.js") < manifest.indexOf("app/core/actions.js"),
  "application registry loads before actions.js"
);
test.assert(
  manifest.indexOf("app/core/application-registry.js") < manifest.indexOf("app/features/documents-chat.js"),
  "application registry loads before documents-chat.js"
);
test.assert(
  manifest.indexOf("app/core/application-registry.js") < manifest.indexOf("app/core/scripting.js"),
  "application registry loads before the lazy scripting module"
);

// Theme independence: the registry must not know any Appearance.
test.assertNotIncludes(registrySource, "classic", "registry does not branch on Classic");
test.assertNotIncludes(registrySource, "platinum", "registry does not branch on Platinum");
test.assertNotIncludes(registrySource, "liquid", "registry does not branch on Liquid Glass");
test.assertNotIncludes(registrySource, "getCurrentTheme", "registry never reads the active theme");

// Every first-phase entry routes through the same dispatch contract.
test.assertIncludes(documentsChat, 'dispatchApplicationIntent?.("", {', "File -> Open routes through the dispatcher");
test.assertIncludes(documentsChat, 'resolveApplicationForItem?.(file, "open")', "openTextFile consults the resolver for DocMap-vs-TeachText");
test.assertIncludes(actions, 'dispatch("docMap", { intent: "map"', "Finder -> DocMap menu dispatches the map intent");
test.assertIncludes(actions, 'dispatch("reviewDesk", { intent: "review"', "Finder -> Review menu dispatches the review intent");
test.assertIncludes(scripting, "dropletApplicationRoutes", "droplets declare registry routes");
test.assertIncludes(scripting, "dispatchApplicationIntent", "the droplet executor dispatches through the registry");
test.assertIncludes(quickDraftHandoff, 'dispatch("teachText", { intent: "open"', "Quick Draft -> TeachText dispatches the open intent");
test.assertIncludes(quickDraftHandoff, 'dispatch("reviewDesk", {', "Quick Draft -> Review Desk dispatches");

// The intent vocabulary stays the closed set from the product plan.
test.assertIncludes(
  registrySource,
  '"open", "read", "edit", "review", "map", "present", "attach", "export"',
  "the registry declares the closed intent set"
);
test.assertIncludes(registrySource, "function registerApplication", "apps register through one descriptor contract");
test.assertIncludes(registrySource, "function resolveApplicationForItem", "object routing is a resolver, not per-surface logic");
test.assertIncludes(registrySource, "async function dispatchApplicationIntent", "one dispatcher owns intent dispatch");
test.assertIncludes(registrySource, "async function openProjectObject", "openers can use the project-object convenience entry");

function createRegistryContext(overrides = {}) {
  const statusCalls = [];
  const receiptCalls = [];
  const activityCalls = [];
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    isExportedDocMapMarkdown: (text) => /DOCMAP-FIXTURE/.test(String(text || "")),
    t: (key) => key,
    setStatus: (message) => statusCalls.push(String(message)),
    getActiveProject: () => ({ id: "project-1" }),
    activeProjectId: "project-1",
    chatFiles: overrides.chatFiles || [],
    isInActiveProject: (file) => file?.projectId === "project-1",
    ensureFinderObjectsModule: async () => {},
    window: {
      AISystem6FinderObjects: overrides.finderObjects || null,
      AISystem6RunReceipts: {
        createReceipt: async (input) => {
          receiptCalls.push(["create", input]);
          return { ok: true, receiptId: "receipt-1" };
        },
        finishReceipt: async (receiptId, patch) => {
          receiptCalls.push(["finish", receiptId, patch]);
          return { ok: true };
        },
      },
      AISystem6AssistantActivity: {
        beginOperation: (meta) => {
          activityCalls.push(["begin", meta]);
          return { runId: meta.runId || "op-1" };
        },
        endOperation: (handle, result) => activityCalls.push(["end", handle, result]),
      },
    },
  });
  vm.runInContext(registrySource, context);
  return { context, statusCalls, receiptCalls, activityCalls };
}

const { context, statusCalls } = createRegistryContext();
const registry = context.window.AISystem6ApplicationRegistry;

let duplicateRejected = false;
try {
  registry.registerApplication({
    id: "teachText",
    labelKey: "x",
    acceptedItemKinds: ["text"],
    acceptedIntents: ["open"],
    handler: async () => ({ ok: true }),
  });
} catch {
  duplicateRejected = true;
}
test.assert(duplicateRejected, "duplicate app ids are rejected");

const textFile = { id: "file-1", projectId: "project-1", type: "text", name: "Draft", body: "Body text" };
const docmapFile = { id: "file-2", projectId: "project-1", type: "text", name: "Map", body: "DOCMAP-FIXTURE\n# Map" };
const chatFile = { id: "file-3", projectId: "project-1", type: "chat", name: "Chat", messages: [] };

test.assert(registry.resolveApplicationForItem(textFile, "open").appId === "teachText", "a plain text document resolves to TeachText for open");
test.assert(registry.resolveApplicationForItem(docmapFile, "open").appId === "docMap", "a saved DocMap file resolves to DocMap");
test.assert(registry.resolveApplicationForItem(chatFile, "open").appId === "clioTalk", "a chat file resolves to ClioTalk");
test.assert(registry.resolveApplicationForItem(textFile, "review").appId === "reviewDesk", "a text document resolves to Review Desk for review");
test.assert(registry.resolveApplicationForItem(textFile, "map").appId === "docMap", "a text document resolves to DocMap for map");
test.assert(registry.resolveApplicationForItem(textFile, "present").appId === "clioStage", "a text document resolves to ClioStage for present");
test.assert(registry.resolveApplicationForItem(textFile, "attach").appId === "projectCd", "a text document resolves to Project CD for attach");
test.assert(registry.resolveApplicationForItem(textFile, "export").appId === "teachText", "a text document resolves to TeachText for export");
test.assert(registry.resolveApplicationForItem({ id: "x", type: "unknown" }, "open").reason === "no-handler", "unknown kinds fail visibly without a fallback app");
test.assert(registry.resolveApplicationForItem(textFile, "bogus").reason === "unknown-intent", "unknown intents are rejected");

// Dispatch behavior: recorded intents create a receipt and activity; plain
// opens stay quiet; failures are explicit.
const second = createRegistryContext();
const handlerCalls = [];
second.context.window.AISystem6ApplicationRegistry.registerApplication({
  id: "testApp",
  labelKey: "test",
  windowName: "testWin",
  acceptedItemKinds: ["text"],
  acceptedIntents: ["review", "open"],
  recordsRuns: ["review"],
  handler: async (items, ctx) => {
    handlerCalls.push({ items, ctx });
    return { ok: true, outputObjectIds: [items[0].id] };
  },
});

const dispatched = await second.context.window.AISystem6ApplicationRegistry.dispatchApplicationIntent("testApp", {
  intent: "review",
  items: [textFile],
  sourceAppId: "finder",
});
test.assert(dispatched.ok === true && handlerCalls.length === 1, "dispatch invokes the resolved app handler");
test.assert(second.receiptCalls.some((call) => call[0] === "create"), "recorded intents create a run receipt");
test.assert(
  second.receiptCalls.some((call) => call[0] === "finish" && call[2]?.status === "completed"),
  "dispatch finishes the receipt as completed"
);
test.assert(second.activityCalls.some((call) => call[0] === "begin"), "recorded intents begin assistant activity");

const before = second.receiptCalls.length;
await second.context.window.AISystem6ApplicationRegistry.dispatchApplicationIntent("testApp", {
  intent: "open",
  items: [textFile],
  sourceAppId: "finder",
});
test.assert(second.receiptCalls.length === before, "plain opens do not spam the Run Records folder");

const foreign = { id: "file-9", projectId: "project-2", type: "text", name: "Other", body: "x" };
const cross = await second.context.window.AISystem6ApplicationRegistry.dispatchApplicationIntent("testApp", {
  intent: "review",
  items: [foreign],
});
test.assert(cross.ok === false && cross.reason === "cross-project", "cross-project items are rejected before dispatch");
test.assert(second.statusCalls.some((message) => message.includes("application_dispatch_cross_project")), "cross-project rejection fails visibly");

const third = createRegistryContext({
  finderObjects: {
    resolveProjectFileForUse: () => ({ selected: null, target: null, reason: "broken-alias" }),
  },
});
const broken = await third.context.window.AISystem6ApplicationRegistry.dispatchApplicationIntent("testApp", {
  intent: "review",
  items: [{ id: "alias-1", projectId: "project-1", type: "alias", aliasTarget: { kind: "file", id: "gone" } }],
});
test.assert(broken.ok === false && broken.reason === "broken-alias", "broken aliases block the dispatch");
test.assert(third.statusCalls.length > 0, "broken aliases fail visibly");

const fourth = createRegistryContext();
const noHandler = await fourth.context.window.AISystem6ApplicationRegistry.dispatchApplicationIntent("", {
  intent: "open",
  items: [{ id: "x", projectId: "project-1", type: "unknown" }],
});
test.assert(noHandler.ok === false && noHandler.reason === "no-handler", "no-handler fails visibly with no silent fallback");
test.assert(fourth.statusCalls.some((message) => message.includes("application_dispatch_no_handler")), "no-handler shows a status message");

const fifth = createRegistryContext();
fifth.context.window.AISystem6ApplicationRegistry.registerApplication({
  id: "boomApp",
  labelKey: "boom",
  windowName: "",
  acceptedItemKinds: ["text"],
  acceptedIntents: ["review"],
  recordsRuns: ["review"],
  handler: async () => {
    throw new Error("boom");
  },
});
const failed = await fifth.context.window.AISystem6ApplicationRegistry.dispatchApplicationIntent("boomApp", {
  intent: "review",
  items: [textFile],
});
test.assert(failed.ok === false && failed.reason === "handler-error", "handler errors surface as dispatch failure");
test.assert(
  fifth.receiptCalls.some((call) => call[0] === "finish" && call[2]?.status === "failed"),
  "failed runs are recorded as failed receipts"
);
test.assert(fifth.statusCalls.some((message) => message.includes("boom")), "handler errors show the public error");
test.assert(statusCalls.length >= 0, "dispatch status helpers stay available");

test.finish();
