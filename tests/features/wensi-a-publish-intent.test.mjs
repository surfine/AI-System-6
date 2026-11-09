// 文思泉涌 lane A · the "publish" intent.
//
// The word table gains one intent: publish. It hands a text draft to
// 文思泉涌, whose descriptor (that window's own lane) registers
// acceptedItemKinds ["text"], acceptedIntents ["open","edit","publish"] and
// recordsRuns ["publish"]. This contract proves the word table change itself,
// and that nothing about existing routing moved because of it — no 文思泉涌
// code is needed for either half.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("wensi-a-publish-intent");

function makeRegistry() {
  const context = { console, setTimeout, clearTimeout, queueMicrotask };
  context.globalThis = context;
  context.window = context;
  context.document = { visibilityState: "visible", addEventListener() {}, querySelector: () => null };
  vm.createContext(context);
  vm.runInContext(read("app/core/application-registry.js"), context, { filename: "application-registry.vm.js" });
  return context.window.AISystem6ApplicationRegistry;
}

// The word table: publish joined at the end, and the ten intents that were
// there before it are all still there, in order.
const registry = makeRegistry();
test.assert(
  JSON.stringify([...registry.intents]) === JSON.stringify([
    "open", "read", "edit", "review", "develop", "map", "chart", "present", "attach", "export", "publish",
  ]),
  "publish joined the intent word table, after the ten intents already there",
);

// A fresh registry proves routing by itself: a text item asking for publish
// with no handler registered finds none — the word table alone routes nothing.
function freshRegistry() {
  return makeRegistry();
}
const textItem = { id: "draft-1", type: "text", body: "正文", title: "草稿" };
// The word table alone routes nothing: publish only resolves for a kind some
// registered application actually accepts. Every registered publisher takes
// text today, so an image asking to publish stays unhandled.
const unhandled = freshRegistry().resolveApplicationForItem({ id: "pic-1", type: "image" }, "publish");
test.assert(
  unhandled.ok === false && unhandled.reason === "no-handler",
  "publish routes nothing for a kind no publisher accepts (the word table alone routes nothing)",
);

// The merged registry carries the 文思泉涌 descriptor (that window's own lane):
// a text item asking for publish resolves to it, and it records publish runs
// (the run receipt story depends on both halves).
const wensi = freshRegistry();
const routed = wensi.resolveApplicationForItem(textItem, "publish");
test.assert(
  routed.ok === true && routed.appId === "wensiQuanyong",
  "a text item asking for publish routes to the application that accepts it",
);
test.assert(
  routed.app.recordsRuns.includes("publish"),
  "the accepting application records publish runs",
);

// Existing behaviour is unchanged: open still prefers the default opener, and
// an intent no registered app accepts still answers no-handler per intent.
const pair = freshRegistry();
pair.registerApplication({
  id: "laneATextProbe", labelKey: "probe", acceptedItemKinds: ["text"], acceptedIntents: ["open", "edit"], defaultOpener: true,
  handler: () => ({}),
});
pair.registerApplication({
  id: "laneAReviewProbe", labelKey: "probe", acceptedItemKinds: ["text"], acceptedIntents: ["review"], defaultOpener: true,
  handler: () => ({}),
});
const opened = pair.resolveApplicationForItem(textItem, "open");
const reviewed = pair.resolveApplicationForItem(textItem, "review");
const unknown = pair.resolveApplicationForItem(textItem, "archive");
test.assert(opened.ok === true && opened.app.defaultOpener === true && opened.app.acceptedIntents.includes("open"), "open still routes to the default opener among the text applications");
test.assert(reviewed.ok === true && reviewed.app.acceptedIntents.includes("review"), "review still routes by accepted intents");
test.assert(unknown.ok === false && unknown.reason === "unknown-intent", "a word outside the table is still an unknown intent");

// And the source names the receiver contract, so the next lane implements
// against the registry's own words.
test.assert(
  read("app/core/application-registry.js").includes('intent "publish" opens the new-draft flow'),
  "the registry documents what a publish handler owes its item",
);

test.finish();
