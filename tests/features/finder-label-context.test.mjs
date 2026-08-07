// Finder Labels participate in model context building. Blocked content never
// reaches a model request unless the user lifts it for the session; To Verify
// is only usable for analysis and is tagged as unverified; every task builds a
// Context Manifest linked into the Run Record.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finder-label-context");
const retrieval = read("app/core/context-retrieval.js");
const chatMessages = read("app/core/chat-messages.js");
const finderObjects = read("app/features/finder-objects.js");

test.assertIncludes(retrieval, "function finderLabelContextPolicy", "one label policy decides what the model may see");
test.assertIncludes(retrieval, '"excluded by Finder Label (Blocked)"', "Blocked content is excluded by default");
test.assertIncludes(retrieval, "contextBlockedLiftKeys", "the session lift set exists for explicit user overrides");
test.assertIncludes(retrieval, "function liftBlockedContextKey", "the user can temporarily lift a Blocked object");
test.assertIncludes(retrieval, '"unverified-material"', "To Verify is tagged as unverified material");
test.assertIncludes(retrieval, '"counter-material"', "Counter material keeps its role");
test.assertIncludes(retrieval, '"author-judgment"', "Judgment stays author judgment, not external fact");
test.assertIncludes(retrieval, '"quotable-source"', "Cite sources are marked quotable with provenance");
test.assertIncludes(retrieval, '"final-version"', "Final versions are marked as the current official version");
test.assertIncludes(retrieval, "finderLabelContextPolicy(contextItem).include", "the retrieval path filters by label policy");
test.assertIncludes(retrieval, "window.lastContextManifest", "every retrieval builds a Context Manifest");
for (const field of ["taskKind", "documentId", "sources", "authorJudgments", "counterMaterials", "excluded", "rules", "contentHashes", "requestedRole", "model", "tokenBudget"]) {
  test.assertIncludes(retrieval, field, `Context Manifest carries ${field}`);
}
test.assertIncludes(
  retrieval,
  "model: null",
  "the retrieval-time manifest does not claim to know the final model"
);
test.assertIncludes(chatMessages, "contextManifest: window.lastContextManifest", "the Run Record links the Context Manifest");
test.assertIncludes(chatMessages, "actualModel", "the run layer records the ACTUAL model on the Context Manifest");
test.assertIncludes(chatMessages, "fallbackReason", "the run layer records the fallback reason on the Context Manifest");
test.assertIncludes(finderObjects, "applyFinderLabel", "labels are only written through the user-confirmed apply path");
test.assertIncludes(finderObjects, "AI may suggest but never write them silently", "the AI cannot silently write Finder Labels");

// Behavioral check: the policy runs against a labeled file.
const context = vm.createContext({
  window: {},
  chatFiles: [
    { id: "blocked-1", projectId: "p1", name: "Secret", body: "never send", finderLabel: "blocked" },
    { id: "verify-1", projectId: "p1", name: "Claim", body: "maybe", finderLabel: "verify" },
  ],
  isInActiveProject: () => true,
});
vm.runInContext(retrieval, context);

const blockedPolicy = context.finderLabelContextPolicy({ id: "blocked-1" });
test.assert(blockedPolicy.include === false && blockedPolicy.reason.includes("Blocked"), "a Blocked file is excluded from model input");

context.liftBlockedContextKey("blocked-1");
const liftedPolicy = context.finderLabelContextPolicy({ id: "blocked-1" });
test.assert(liftedPolicy.include === true && liftedPolicy.tag === "blocked-lifted", "lifting the block for the session re-includes the object");

const verifyPolicy = context.finderLabelContextPolicy({ id: "verify-1" });
test.assert(
  verifyPolicy.include === true && verifyPolicy.tag === "unverified-material",
  "To Verify content is analysis-only and tagged unverified"
);

test.finish();
