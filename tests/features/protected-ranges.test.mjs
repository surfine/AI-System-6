// Protected ranges — immutable sentinel enforcement, executed in a bare vm
// context. Protection is a property of the text, not a layer: a protected
// quote must survive every AI pass byte-identical or the whole composition
// fails. Line ranges exist only as the mask scope, never as the enforcement
// mechanism.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("protected-ranges");
const source = read("app/core/protected-ranges.js");

test.assertNotIncludes(source, "document.", "protected-ranges never touches the DOM");
test.assertNotIncludes(source, "localStorage", "protected-ranges never persists outside the workspace record");
test.assertNotIncludes(source, "fetch(", "protected-ranges never performs a model call");
test.assertIncludes(source, "verifyProtectedSentinels", "strict verification is executable");
test.assertIncludes(source, "restoreProtectedSentinels", "restore is deterministic from the local token map");
test.assertIncludes(source, "remapLineRangesAfterSentinels", "mask remapping is executable");

const context = vm.createContext({ window: {} });
vm.runInContext(source, context);

const BODY = "第一行。\n第二行。\n第三行。\n第四行。\n第五行。\n";
const PROTECTED = [{ start: 2, end: 3 }];

const { protectedText, sentinels } = context.protectTextWithSentinels(BODY, PROTECTED);
test.assert(
  sentinels.length === 1
    && sentinels[0].text === "第二行。\n第三行。",
  "a multi-line range is protected as one byte-exact block"
);
test.assert(
  protectedText === `第一行。\n${sentinels[0].token}\n第四行。\n第五行。\n`,
  "the protected block collapses to a single token line in place"
);

// Tokens are deterministic per protected bytes: the same quote yields the
// same token, so composite cache keys stay stable across passes.
test.assert(
  context.protectTextWithSentinels(BODY, PROTECTED).sentinels[0].token === sentinels[0].token,
  "the same protected bytes produce the same sentinel token"
);
test.assert(
  context.protectTextWithSentinels(BODY, [{ start: 2, end: 2 }]).sentinels[0].token !== sentinels[0].token,
  "different protected bytes produce a different sentinel token"
);

// Verification is strict and exact: an intact pass verifies; changing a
// character, a digit, or the token's case fails; output with an unknown token
// fails; output with no token at all fails.
const intact = context.verifyProtectedSentinels(protectedText, sentinels);
test.assert(intact.valid, "an intact pass verifies");
const replaced = context.verifyProtectedSentinels(
  protectedText.replace(sentinels[0].token, `\u27e6AI6_PROTECTED_${"0".repeat(8)}\u27e7`),
  sentinels
);
test.assert(!replaced.valid, "an unknown token fails verification");
const dropped = context.verifyProtectedSentinels("第一行。\n第四行。\n第五行。\n", sentinels);
test.assert(!dropped.valid, "a dropped token fails verification");
const doubled = context.verifyProtectedSentinels(`${protectedText}${sentinels[0].token}`, sentinels);
test.assert(!doubled.valid, "a doubled token fails verification");

// Restore replaces each token with the original bytes; the composition order
// is unchanged because the token occupied the protected region's position.
test.assert(
  context.restoreProtectedSentinels(protectedText, sentinels) === BODY,
  "restore is byte-identical and positional"
);

// Mask remapping: a layer's line mask is expressed against the original body,
// then remapped onto the sentinel-protected text so prompt line numbers stay
// honest. Lines inside a protected range disappear from the mask; lines after
// it shift up by (protected count - 1).
const remapped = context.remapLineRangesAfterSentinels(
  [{ start: 1, end: 5 }],
  PROTECTED
);
test.assert(
  JSON.stringify(remapped) === JSON.stringify([{ start: 1, end: 1 }, { start: 3, end: 4 }]),
  "the mask remaps around the collapsed protected block"
);
const allProtected = context.remapLineRangesAfterSentinels([{ start: 2, end: 3 }], PROTECTED);
test.assert(JSON.stringify(allProtected) === "[]", "a fully protected mask disappears from the prompt");

test.finish();
