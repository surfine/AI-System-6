import { appRuntimePaths, lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import {
  classicScriptFileSyntaxError,
  classicScriptSyntaxError,
} from "../../tooling/lib/classic-script-syntax.mjs";
import {
  createFeatureTest,
  read,
  resolveProjectPath,
} from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("release-test-performance");
const releaseVerifier = read("tooling/verify-release.mjs");
const featureVerifier = read("tooling/verify-features.mjs");

test.assert(
  classicScriptSyntaxError("const answer = 42;", "valid-fixture.js") === null,
  "the in-process syntax checker accepts a valid classic script"
);
const invalidSyntax = classicScriptSyntaxError("const answer = ;", "invalid-fixture.js");
test.assert(
  invalidSyntax instanceof SyntaxError && String(invalidSyntax.stack).includes("invalid-fixture.js"),
  "the in-process syntax checker reports an invalid file with its filename"
);

const runtimePaths = [...appRuntimePaths, ...lazyRuntimePaths];
const runtimeSyntaxFailures = runtimePaths
  .map((path) => [path, classicScriptFileSyntaxError(resolveProjectPath(path))])
  .filter(([, error]) => error);
test.assert(runtimePaths.length > 100, "the syntax sweep covers the full eager and lazy runtime, not a token fixture set");
test.assert(
  runtimeSyntaxFailures.length === 0,
  `all ${runtimePaths.length} eager and lazy runtime files parse as classic scripts`
);

test.assertIncludes(
  releaseVerifier,
  "classicScriptFileSyntaxError(resolveProjectPath(path))",
  "verify:release uses the in-process syntax checker for each runtime file"
);
test.assertNotIncludes(
  releaseVerifier,
  '["--check", resolveProjectPath(path)]',
  "verify:release no longer starts one Node process per runtime file"
);
test.assertIncludes(featureVerifier, "availableParallelism()", "feature workers scale down on constrained machines");
test.assertIncludes(featureVerifier, 'arg === "--jobs"', "developers and CI can set a bounded feature worker count");
test.assertIncludes(featureVerifier, "parsed <= 16", "feature-test concurrency keeps an explicit upper bound");
test.assertIncludes(featureVerifier, 'console.log("\\nSlowest feature contracts:")', "the feature runner reports its slowest contracts for the next profiling pass");

test.finish();
